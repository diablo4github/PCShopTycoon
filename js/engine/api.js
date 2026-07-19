/* Circuit & Solder — engine/api.js
 * Assembles the complete public Engine API of SPEC §4. Only this file may touch
 * localStorage, guarded for Node. Every mutating call returns {ok:true,...} or
 * {ok:false, error} and never throws on bad input.
 */
(function (root) {
  'use strict';
  var Engine = root.Engine = root.Engine || {};
  var AUTOSAVE_KEY = 'circuit-solder-autosave-v1';

  function err(msg) { return { ok: false, error: msg }; }
  function hasLS() {
    try { return typeof localStorage !== 'undefined' && localStorage !== null; }
    catch (e) { return false; }
  }
  function S() { return Engine._state; }
  function needState() { return S() ? null : err('No game in progress'); }
  function needLive() {
    if (!S()) return err('No game in progress');
    if (S().flags.gameOver) return err('Game over — start a new game');
    return null;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  Engine.newGame = function (opts) {
    opts = opts || {};
    var DATA = Engine.getData();
    if (!DATA.PARTS || !DATA.PARTS.length) return err('No parts catalog loaded');
    var eras = DATA.ERAS || [];
    var era = null, scen = null, i;

    // §15.2: scenario starts are curated alternatives to the sandbox eras
    if (opts.scenarioId) {
      scen = Engine.scenarioById(opts.scenarioId);
      if (!scen) return err('Unknown scenario: ' + opts.scenarioId);
      // Cosmetic era anchor (skin/labels): the latest era at/before the start
      var scenYear = Number(String(scen.startDate).slice(0, 4)) || 1996;
      for (i = 0; i < eras.length; i++) {
        if (eras[i].startYear <= scenYear &&
            (!era || eras[i].startYear > era.startYear)) era = eras[i];
      }
      if (!era) era = eras[0];
      if (!era) return err('No era data loaded');
    } else {
      for (i = 0; i < eras.length; i++) if (eras[i].id === opts.eraId) era = eras[i];
      if (!era) return err('Unknown era: ' + opts.eraId);
    }

    // §15.6: difficulty (sandbox only — scenarios pin their own balance)
    var difficulty = 'standard';
    if (!scen && opts.difficulty != null) {
      if (!Engine.CONFIG.DIFFICULTY[opts.difficulty])
        return err('Unknown difficulty: ' + opts.difficulty);
      difficulty = String(opts.difficulty);
    }
    var diffSet = Engine.CONFIG.DIFFICULTY[difficulty];

    var startDate = scen ? scen.startDate : era.startDate;
    var startCash = scen ? scen.cash : Engine.round2(era.cash * diffSet.cashMult);
    var startTier = scen ? (scen.shopTier || 0) : (era.shopTier || 0);

    var seed = (opts.seed != null ? Number(opts.seed) : (Date.now() % 2147483647)) | 0;
    if (!isFinite(seed)) seed = 42;
    var startDi = null;
    var state = {
      version: 12,
      seed: seed,
      rng: Engine.seedRngStreams(seed),   // §17.5 five named streams
      shopName: String(opts.shopName ||
        ((DATA.FLAVOR && DATA.FLAVOR.shopNameSuggestions) ?
          DATA.FLAVOR.shopNameSuggestions[0] : 'Circuit & Solder')),
      eraId: era.id,
      startDate: startDate,
      day: 0,
      cash: Engine.round2(startCash),
      hoursLeft: Engine.CONFIG.HOURS_PER_DAY, hoursPerDay: Engine.CONFIG.HOURS_PER_DAY,
      supplyRunDoneToday: false,
      customBuildsUnlocked: !!era.customBuildsUnlocked,
      flags: { gameOver: false, gameOverReason: null, graceDeadlineDay: null },
      reputation: { rating: Engine.CONFIG.RATING_SEED,
                    // §17.2: history entries are outcome objects now
                    history: [0, 1, 2].map(function () {
                      return { score: Engine.CONFIG.RATING_SEED, day: 0, jobId: null,
                               title: null, reasons: ['opening reputation'] };
                    }),
                    prestige: 0, jobsCompleted: 0, jobsFailed: 0, callbacks: 0 },
      shop: { tier: startTier, equipment: ['repair-bench'], insurance: false },
      inventory: [],
      jobs: { offers: [], active: [], completedRecent: [], nextId: 1 },
      asIsMarket: [],
      asIsNextId: 1,
      market: { noise: {}, hist: {}, activeEvents: [], refurbLog: [] },  // §14.3
      news: [],
      ledger: {
        months: [],
        lifetime: { revenue: 0, partsCost: 0, fixedCosts: 0, other: 0,
                    jobsCompleted: 0, jobsFailed: 0, buildsDelivered: 0,
                    refurbsSold: 0, daysPlayed: 0,
                    contractsFailed: 0, graceDays: 0 }   // §15.2 scoring stats
      },
      workedToday: [], declinesToday: 0, lastContractDay: null, injuryDaysLeft: 0,
      arrivedToday: {},   // §19.9: partIds delivered this morning (UI flash)
      // §10.7 staff (+§11.5 level-up queue for morning summaries)
      staff: [], staffMarket: [], staffNextRefreshDay: Engine.CONFIG.STAFF_REFRESH_DAYS,
      staffNextId: 1, levelUpsToday: [],
      // §13.4 certifications; §13.2 one-time article-unlock news dedup
      training: { certsEarned: [], studying: null }, certsEarnedToday: [],
      articlesSeen: [],
      // §15: credit line, business accounts, achievements, difficulty,
      // scenario, transition-news dedup
      credit: { drawn: 0 },
      accounts: [],
      // §21.1/§21.2 client registry (replaces the old state.regulars array)
      // + the shared id counter for both client machines and account fleet
      // machines.
      clients: { nextId: 1, list: [] },
      machineNextId: 1,
      achievements: {},
      achievementEvents: {},
      difficulty: difficulty,
      scenario: null,
      transitionsFired: {},
      // §18.1 distributors: relationships, weekly deals, in-flight orders,
      // and gray-market stock counters (reliability penalty on consumption)
      distributors: { spend: {}, tier: {}, deals: {}, lastDealDay: -1 },
      pendingOrders: [],
      grayStock: {},
      nextOrderId: 1,
      // §20.1 shopping cart — engine-owned, persisted; nothing charged/spent
      // until checkoutCart.
      cart: { nextId: 1, items: [] }
    };
    Engine._state = state;
    startDi = Engine.dateInfo(0, state);
    if (scen) {
      state.scenario = { id: scen.id, endDay: Engine.dayIndexOfISO(scen.endDate, state),
                         active: true, completed: false, result: null };
      // Scenario-era shops start past the build unlock when the date says so
      var unlockISO = DATA.CUSTOM_BUILD_UNLOCK_DATE || '1989-09-01';
      if (String(startDate) >= unlockISO) state.customBuildsUnlocked = true;
    }
    // §15.1: transitions fully in the past at day 0 are lived history — mark
    // them fired so a late-era start isn't spammed with old news. A transition
    // ACTIVE at day 0 keeps started=false so the first night fires its start
    // news once (useful context); its stale pre-start warning is suppressed.
    (Engine.transitionsData() || []).forEach(function (t) {
      var w = Engine.transitionWindow(t, state);
      if (state.day >= w.endDay) {
        state.transitionsFired[t.id] = { warned: true, started: true, ended: true };
      } else if (state.day >= w.startDay) {
        state.transitionsFired[t.id] = { warned: true, started: false, ended: false };
      }
    });
    state.ledger.months.push({
      ym: startDi.y + '-' + (startDi.m < 10 ? '0' : '') + startDi.m,
      revenue: 0, partsCost: 0, fixedCosts: 0, other: 0, net: 0
    });

    // Day-0 world: events in-window, prices/history, as-is stock, candidates,
    // first offers.
    Engine.Sim.updateEvents(state);
    Engine.Pricing.nightlyUpdate(state);
    Engine.Jobs.seedAsIsMarket(state);
    Engine.Sim.refreshStaffMarket(state);
    Engine.Jobs.generateOffers(state, null);
    // §13.2: pre-mark articles already unlocked on day 0 as "seen" — those are
    // already-lived history for this start year, not a fresh news event.
    (DATA.ARTICLES || []).forEach(function (a) {
      if (a && a.id && Engine.Sim.articleUnlocked(a, state)) state.articlesSeen.push(a.id);
    });
    Engine.pushNews(state, 'system', 'Grand opening: ' + state.shopName,
      (era.name || era.id) + ' — ' + startDi.label + '. ' + (era.blurb || ''));
    return { ok: true };
  };

  Engine.getState = function () { return S(); };
  Engine.getConfig = function () { return Engine.CONFIG; };

  Engine.endDay = function () {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    // §15.2: a completed scenario freezes the run at its end screen until the
    // player starts a new game or explicitly continues in sandbox.
    if (state.scenario && state.scenario.completed && !state.scenario.active)
      return err('Scenario complete — check your results, then start a new game ' +
                 'or continue in sandbox');
    var summary = Engine.Sim.newSummary();
    var startDay = state.day;

    Engine.Sim.processNight(state, summary);
    if (Engine.dateInfo(state.day, state).isSunday && !state.flags.gameOver) {
      summary.skippedSunday = true;         // both nights process (§4)
      Engine.Sim.processNight(state, summary);
    }
    var di = Engine.dateInfo(state.day, state);
    summary.dateStr = di.label;
    summary.priceMovers = Engine.Pricing.priceMovers(state);
    // News fired overnight (any entry newer than the day we started from)
    for (var i = state.news.length - 1; i >= 0; i--) {
      if (state.news[i].day > startDay)
        summary.news.unshift({ headline: state.news[i].headline, body: state.news[i].body });
    }
    summary.gameOver = !!state.flags.gameOver;
    autosave();
    return { ok: true, summary: summary };
  };

  Engine.getGameOverStats = function () {
    var state = S();
    if (!state) return { reason: null, dateStr: '', daysPlayed: 0, lifetime: {},
                         rating: 0, prestigeLabel: '' };
    var C = Engine.CONFIG;
    return {
      reason: state.flags.gameOverReason,
      dateStr: Engine.dateInfo(state.day, state).label,
      daysPlayed: state.ledger.lifetime.daysPlayed,
      lifetime: state.ledger.lifetime,
      rating: state.reputation.rating,
      prestigeLabel: C.PRESTIGE_TIERS[state.reputation.prestige].label
    };
  };

  // ------------------------------------------------------------------
  // Saves
  // ------------------------------------------------------------------
  Engine.exportSave = function () {
    return S() ? JSON.stringify(S()) : '';
  };
  // v1 -> v2 migration (§9 addendum): fill every new field with defaults.
  function migrateV1toV2(obj) {
    obj.version = 2;
    function fixJob(job) {
      if (!job || typeof job !== 'object') return;
      if (!('taste' in job)) job.taste = null;
      if (job.machine) {
        if (job.machine.faultRepaired == null) {
          // v1 refurbs swapped the replacement in when the need was filled
          var filled = (job.needs || []).length > 0 &&
            (job.needs || []).every(function (n) {
              return (n.filledPartIds || []).length >= (n.qty || 1);
            });
          job.machine.faultRepaired = !!(job.machine.faultPartIdx != null && filled);
        }
        if (!job.machine.specSummary) {
          job.machine.specSummary = Engine.Jobs.specSummaryFor(job.machine.partIds || []);
        }
      }
    }
    (obj.jobs.offers || []).forEach(fixJob);
    (obj.jobs.active || []).forEach(fixJob);
    (obj.asIsMarket || []).forEach(function (m) {
      if (m && !m.specSummary) m.specSummary = Engine.Jobs.specSummaryFor(m.partIds || []);
    });
    return obj;
  }
  // v2 -> v3 migration (§10): staff fields + step checklists. Steps for jobs in
  // flight are synthesized generically with prior progress replayed; customer
  // machines on old repair/upgrade jobs stay null (fully playable without them).
  function migrateV2toV3(obj) {
    obj.version = 3;
    if (!Array.isArray(obj.staff)) obj.staff = [];
    if (!Array.isArray(obj.staffMarket)) obj.staffMarket = [];
    if (obj.staffNextRefreshDay == null) obj.staffNextRefreshDay = obj.day; // refresh next night
    if (obj.staffNextId == null) obj.staffNextId = 1;
    function fixJob(job) {
      if (!job || typeof job !== 'object') return;
      if (!('peripheral' in job)) job.peripheral = null;
      if (!Array.isArray(job.steps) || !job.steps.length) {
        var steps = Engine.Jobs.synthesizeSteps(job.hoursRequired || 2, job);
        // map the install step to need 0 when the job installs parts
        var needsInstall = (job.needs || []).length > 0 ||
                           (job.fault && job.fault.partCategory);
        for (var i = 0; i < steps.length; i++) {
          if (steps[i].install && needsInstall) steps[i].needIndex = 0;
          delete steps[i].install;
        }
        // replay prior progress (installs already happened at v2 assign time)
        var left = Math.min(job.hoursRequired || 0, job.hoursDone || 0);
        var idx = 0;
        while (left > 0 && idx < steps.length) {
          if (left >= steps[idx].hours - 1e-9) {
            steps[idx].progress = 1; steps[idx].done = true;
            left -= steps[idx].hours; idx++;
          } else { steps[idx].progress = left / steps[idx].hours; left = 0; }
        }
        job.steps = steps;
        job.stepIndex = idx;
      }
    }
    (obj.jobs.offers || []).forEach(fixJob);
    (obj.jobs.active || []).forEach(fixJob);
    return obj;
  }
  // v3 -> v4 migration (§11): staff gain level/xp/title from the fixed tables
  // (nearest level to the old rolled skill); steps gain kind/running; jobs gain
  // pendingSteps/osRequest; undiagnosed jobs get the merged diagnose phase.
  function migrateV3toV4(obj) {
    obj.version = 4;
    if (!Array.isArray(obj.levelUpsToday)) obj.levelUpsToday = [];
    var C = Engine.CONFIG;
    function fixStaffEntry(m, isCandidate) {
      if (!m) return;
      if (m.level == null) m.level = Engine.staffLevelForSkill(m.skill);
      if (isCandidate && m.level > C.STAFF_CANDIDATE_MAX_LEVEL)
        m.level = C.STAFF_CANDIDATE_MAX_LEVEL;
      m.skill = Engine.staffSkillFor(m.level);
      if (m.xp == null) m.xp = C.STAFF_LEVEL_THRESHOLDS[m.level - 1];
      if (!m.title) {
        var role = Engine.staffRoleById(m.role);
        m.title = Engine.staffTitleFor(role, m.level);
      }
    }
    (obj.staff || []).forEach(function (m) { fixStaffEntry(m, false); });
    (obj.staffMarket || []).forEach(function (m) { fixStaffEntry(m, true); });
    var diagMult = (obj.shop.equipment || []).indexOf('diag-station') !== -1 ? 0.5 : 1;
    function fixJob(job) {
      if (!job || typeof job !== 'object') return;
      if (!('osRequest' in job)) job.osRequest = null;
      if (!Array.isArray(job.pendingSteps)) job.pendingSteps = [];
      (job.steps || []).forEach(function (st) {
        if (!st.kind) st.kind = Engine.Jobs.classifyStepKind(null, st.label);
        if (st.running == null) st.running = false;
      });
      // Merge diagnosis into the checklist for still-undiagnosed jobs (§11.3)
      if (job.needsDiagnosis && !job.diagnosed && (job.steps || []).length &&
          !job.steps.some(function (st) { return st.diag; })) {
        var pending = job.steps;
        if (pending.length && /open|ground|intake/i.test(pending[0].label) &&
            pending[0].needIndex == null) pending = pending.slice(1);
        job.pendingSteps = pending;
        job.steps = [
          { id: 'd1', label: 'Intake & symptom interview', hours: 0.25,
            done: false, progress: 0, needIndex: null, kind: 'labor', running: false },
          { id: 'd2', label: 'Bench diagnosis', hours: Math.max(0.25, diagMult),
            done: false, progress: 0, needIndex: null, kind: 'labor', running: false,
            diag: true }
        ];
        job.stepIndex = 0;
        job.hoursDone = 0;
        var total = 0;
        job.steps.concat(job.pendingSteps).forEach(function (st) { total += st.hours; });
        job.hoursRequired = Engine.round2(total);
      }
    }
    (obj.jobs.offers || []).forEach(fixJob);
    (obj.jobs.active || []).forEach(fixJob);
    return obj;
  }
  // v4 -> v5 migration (§12): single build selections wrap into per-category
  // slot arrays; device-repair fields default. Boards without slots data keep
  // working via the {ram:99,gpu:99,storage:99} engine default (§12.1).
  function migrateV4toV5(obj) {
    obj.version = 5;
    function fixJob(job) {
      if (!job || typeof job !== 'object') return;
      if (!('device' in job)) job.device = null;
      if (job.deviceModern == null) job.deviceModern = false;
      if (job.devicePartsCost == null) job.devicePartsCost = 0;
      if (!('devicePayBase' in job)) job.devicePayBase = null;
      if (job.build) Engine.Jobs.wrapBuildParts(job.build);   // flat -> slot map
    }
    (obj.jobs.offers || []).forEach(fixJob);
    (obj.jobs.active || []).forEach(fixJob);
    return obj;
  }
  // v5 -> v6 migration (§13): training/certifications + article-unlock news
  // dedup default in. Never rejects a valid v5 save — a save with no training
  // simply starts with nothing earned and nothing in progress.
  function migrateV5toV6(obj) {
    obj.version = 6;
    if (!obj.training || typeof obj.training !== 'object')
      obj.training = { certsEarned: [], studying: null };
    if (!Array.isArray(obj.training.certsEarned)) obj.training.certsEarned = [];
    if (obj.training.studying === undefined) obj.training.studying = null;
    if (!Array.isArray(obj.certsEarnedToday)) obj.certsEarnedToday = [];
    // §13.2: don't retroactively spam "New Wiki article" news for a save that
    // predates the feature — silently mark everything unlocked as of right now
    // as already-seen, same as a fresh newGame does for day-0 unlocks.
    if (!Array.isArray(obj.articlesSeen)) {
      obj.articlesSeen = [];
      (Engine.getData().ARTICLES || []).forEach(function (a) {
        if (a && a.id && Engine.Sim.articleUnlocked(a, obj)) obj.articlesSeen.push(a.id);
      });
    }
    return obj;
  }
  // v6 -> v7 migration (§15): credit line, regulars, business accounts,
  // achievements, difficulty, scenario slot, transition-news dedup, staff
  // retraining lists, and the two new lifetime scoring counters — all default
  // in. Never rejects a valid v6 save.
  function migrateV6toV7(obj) {
    obj.version = 7;
    if (!obj.credit || typeof obj.credit !== 'object') obj.credit = { drawn: 0 };
    if (typeof obj.credit.drawn !== 'number' || !isFinite(obj.credit.drawn))
      obj.credit.drawn = 0;
    if (!Array.isArray(obj.regulars)) obj.regulars = [];
    if (!Array.isArray(obj.accounts)) obj.accounts = [];
    if (!obj.achievements || typeof obj.achievements !== 'object') obj.achievements = {};
    if (!obj.achievementEvents || typeof obj.achievementEvents !== 'object')
      obj.achievementEvents = {};
    if (!Engine.CONFIG.DIFFICULTY[obj.difficulty]) obj.difficulty = 'standard';
    if (obj.scenario === undefined) obj.scenario = null;
    if (obj.ledger && obj.ledger.lifetime) {
      if (obj.ledger.lifetime.contractsFailed == null) obj.ledger.lifetime.contractsFailed = 0;
      if (obj.ledger.lifetime.graceDays == null) obj.ledger.lifetime.graceDays = 0;
    }
    (obj.staff || []).forEach(function (m) {
      if (m && !Array.isArray(m.retrainedFor)) m.retrainedFor = [];
    });
    // §15.1: transition news already in the past is lived history — mark it
    // fired (same pattern as the §13.2 articlesSeen backfill).
    if (!obj.transitionsFired || typeof obj.transitionsFired !== 'object') {
      obj.transitionsFired = {};
      (Engine.transitionsData() || []).forEach(function (t) {
        var w = Engine.transitionWindow(t, obj);
        if (obj.day >= w.endDay) {
          obj.transitionsFired[t.id] = { warned: true, started: true, ended: true };
        } else if (obj.day >= w.startDay) {
          obj.transitionsFired[t.id] = { warned: true, started: false, ended: false };
        }
      });
    }
    return obj;
  }
  // v7 -> v8 migration (§17): the RNG stream split + §17.1/§17.2 fields.
  // Seeding all five streams from v7's single rngState is a documented
  // ONE-TIME trajectory break — the save stays fully playable, but future
  // rolls land differently than they would have pre-split.
  function migrateV7toV8(obj) {
    obj.version = 8;
    if (!obj.rng || typeof obj.rng !== 'object') {
      obj.rng = Engine.seedRngStreams(
        obj.rngState != null ? obj.rngState : (obj.seed | 0));
    }
    delete obj.rngState;
    // §17.2: wrap old numeric reputation entries
    if (obj.reputation && Array.isArray(obj.reputation.history)) {
      obj.reputation.history = obj.reputation.history.map(function (e) {
        return (typeof e === 'number') ?
          { score: e, day: null, jobId: null, title: null, reasons: [] } : e;
      });
    }
    // §17.1: decision fields default in on jobs in flight
    function fixJob(job) {
      if (!job || typeof job !== 'object') return;
      if (!('decision' in job)) job.decision = null;
      if (!('decisionPlan' in job)) job.decisionPlan = null;
    }
    (obj.jobs.offers || []).forEach(fixJob);
    (obj.jobs.active || []).forEach(fixJob);
    return obj;
  }
  function migrateV8toV9(obj) {
    obj.version = 9;
    // §18.1: distributor relationships, weekly deals, pending orders, gray
    // stock. Fresh blocks — an older save simply hasn't met the suppliers.
    if (!obj.distributors || typeof obj.distributors !== 'object') {
      obj.distributors = { spend: {}, tier: {}, deals: {}, lastDealDay: -1 };
    }
    if (!Array.isArray(obj.pendingOrders)) obj.pendingOrders = [];
    if (!obj.grayStock || typeof obj.grayStock !== 'object') obj.grayStock = {};
    if (obj.nextOrderId == null) obj.nextOrderId = 1;
    return obj;
  }
  function migrateV9toV10(obj) {
    obj.version = 10;
    // §19.3: unified logistics — older pending orders were all wholesale
    (obj.pendingOrders || []).forEach(function (o) {
      if (!o.source) o.source = 'dist';
      if (!('jobId' in o)) o.jobId = null;
      if (!('needIndex' in o)) o.needIndex = null;
    });
    // §19.3: builds in flight predate the overnight-truck flag
    [].concat(obj.jobs.offers || [], obj.jobs.active || []).forEach(function (j) {
      if (j && !('partsArriveDay' in j)) j.partsArriveDay = null;
    });
    if (!obj.arrivedToday || typeof obj.arrivedToday !== 'object') obj.arrivedToday = {};
    return obj;
  }
  // v10 -> v11 migration (§20.5): the shopping cart is a fresh, empty block —
  // an older save simply hasn't started shopping yet. Never rejects a valid
  // v10 save.
  function migrateV10toV11(obj) {
    obj.version = 11;
    if (!obj.cart || typeof obj.cart !== 'object') obj.cart = { nextId: 1, items: [] };
    if (!Array.isArray(obj.cart.items)) obj.cart.items = [];
    if (obj.cart.nextId == null) obj.cart.nextId = 1;
    return obj;
  }
  // Self-contained mulberry32-variant step operating directly on obj.rng.misc
  // (Engine._state isn't obj yet during migration, so Engine.rand() can't be
  // used — this is the exact same step it runs, just addressed at obj).
  function migRand(obj) {
    if (!obj.rng || typeof obj.rng !== 'object') {
      obj.rng = Engine.seedRngStreams(obj.rngState != null ? obj.rngState : (obj.seed | 0));
    }
    obj.rng.misc = (obj.rng.misc + 0x6D2B79F5) | 0;
    var t = obj.rng.misc;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function migPick(obj, arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(migRand(obj) * arr.length)];
  }
  // v11 -> v12 migration (§21.6 "The Clientele Update"): legacy state.regulars
  // becomes the client registry (visits=jobs, loyalty seeded above the
  // regular threshold so existing regulars stay regulars, tasteBrand
  // carried, machines empty — they simply haven't been rebuilt yet).
  // Accounts gain kind/seats/health/fleet/history: kind rolled deterministic-
  // ally on the misc stream, seats the kind's range midpoint, health 60,
  // fleet seeded on the NEXT monthly tick (not retroactively, per spec —
  // Jobs.acceptOffer seeds fleet at signing, but a save that already signed
  // pre-v12 never had that moment). Never rejects a valid v11 save.
  function migrateV11toV12(obj) {
    obj.version = 12;
    if (!obj.clients || typeof obj.clients !== 'object') obj.clients = { nextId: 1, list: [] };
    if (!Array.isArray(obj.clients.list)) obj.clients.list = [];
    if (obj.clients.nextId == null) obj.clients.nextId = 1;
    var loyaltyFloor = (Engine.CONFIG.LOYALTY_REGULAR || 40) + 10;
    (obj.regulars || []).forEach(function (r) {
      obj.clients.list.push({
        id: obj.clients.nextId++,
        name: r.name, type: r.type || 'home',
        tasteBrand: r.tasteBrand || null,
        firstSeenDay: r.lastDay != null ? r.lastDay : 0,
        lastSeenDay: r.lastDay != null ? r.lastDay : 0,
        visits: r.jobs || 1,
        loyalty: Math.min(100, loyaltyFloor),
        machines: [], workLog: [], referredBy: null
      });
    });
    delete obj.regulars;
    if (obj.machineNextId == null) obj.machineNextId = 1;
    var BUSINESS_KIND_FALLBACK = { id: 'office', label: 'Office', seats: [4, 10] };
    (obj.accounts || []).forEach(function (a) {
      if (a.kind == null) {
        var year = 1996;
        try { year = Engine.dateInfo(obj.day, obj).y; } catch (e) { /* defensive */ }
        var table = Engine.getData().BUSINESS_KINDS;
        if (!Array.isArray(table) || !table.length) table = [BUSINESS_KIND_FALLBACK];
        var live = table.filter(function (k) {
          return (k.minYear == null || year >= k.minYear) && (k.maxYear == null || year <= k.maxYear);
        });
        if (!live.length) live = table;
        var kind = migPick(obj, live) || live[0];
        a.kind = kind.id;
        a.seats = Math.round(((kind.seats ? kind.seats[0] : 4) +
                              (kind.seats ? kind.seats[1] : 10)) / 2);
      }
      if (a.health == null) a.health = 60;
      if (a.healthTrend == null) a.healthTrend = 'flat';
      if (a.healthReason === undefined) a.healthReason = null;
      if (!Array.isArray(a.fleet)) a.fleet = [];   // seeded on next monthly tick, not retroactively
      if (!Array.isArray(a.history)) a.history = [];
      if (a.okThisMonth == null) a.okThisMonth = 0;
    });
    return obj;
  }
  Engine.importSave = function (str) {
    var obj;
    try { obj = JSON.parse(String(str)); }
    catch (e) { return err('Not valid save JSON'); }
    if (!obj || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].indexOf(obj.version) === -1)
      return err('Unsupported save version');
    // §17.5: v8 saves carry rng streams instead of the old single rngState
    var required = ['seed', 'eraId', 'startDate', 'day', 'cash',
                    'hoursLeft', 'flags', 'reputation', 'shop', 'inventory',
                    'jobs', 'asIsMarket', 'market', 'news', 'ledger'];
    for (var i = 0; i < required.length; i++) {
      if (!(required[i] in obj)) return err('Save is missing "' + required[i] + '"');
    }
    if (obj.version === 1) migrateV1toV2(obj);
    if (obj.version === 2) migrateV2toV3(obj);
    if (obj.version === 3) migrateV3toV4(obj);
    if (obj.version === 4) migrateV4toV5(obj);
    if (obj.version === 5) migrateV5toV6(obj);
    if (obj.version === 6) migrateV6toV7(obj);
    if (obj.version === 7) migrateV7toV8(obj);
    if (obj.version === 8) migrateV8toV9(obj);
    if (obj.version === 9) migrateV9toV10(obj);
    if (obj.version === 10) migrateV10toV11(obj);
    if (obj.version === 11) migrateV11toV12(obj);
    Engine._state = obj;
    return { ok: true };
  };
  function autosave() {
    if (!hasLS() || !S()) return;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(S())); } catch (e) { /* full */ }
  }
  Engine.hasAutosave = function () {
    if (!hasLS()) return false;
    try { return localStorage.getItem(AUTOSAVE_KEY) != null; } catch (e) { return false; }
  };
  Engine.loadAutosave = function () {
    if (!hasLS()) return err('No autosave available');
    var raw = null;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { /* ignore */ }
    if (raw == null) return err('No autosave available');
    return Engine.importSave(raw);
  };
  Engine.clearAutosave = function () {
    if (hasLS()) { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* ignore */ } }
    return { ok: true };
  };

  // ------------------------------------------------------------------
  // Jobs
  // ------------------------------------------------------------------
  Engine.getOffers = function () { return S() ? S().jobs.offers : []; };
  Engine.getActiveJobs = function () { return S() ? S().jobs.active : []; };
  Engine.acceptOffer = function (jobId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.acceptOffer(S(), jobId);
  };
  Engine.declineOffer = function (jobId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.declineOffer(S(), jobId);
  };
  Engine.setJobSpeed = function (jobId, speed) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.setJobSpeed(S(), jobId, speed);
  };
  Engine.diagnoseJob = function (jobId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.diagnoseJob(S(), jobId);
  };
  Engine.getJobNeeds = function (jobId) {
    return S() ? Engine.Jobs.getJobNeeds(S(), jobId) : [];
  };
  // §10.3: assign reserves the part; the install happens at its step.
  Engine.assignPart = function (jobId, needIndex, partId, opts) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.assignPart(S(), jobId, needIndex, partId, opts);
  };
  Engine.unassignPart = function (jobId, needIndex, partId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.unassignPart(S(), jobId, needIndex, partId);
  };
  // Deprecated alias for assignPart (one release, §10.3)
  Engine.installPart = function (jobId, needIndex, partId, opts) {
    return Engine.assignPart(jobId, needIndex, partId, opts);
  };
  // §17.1: resolve a pending job decision (fork / approval call / tuning).
  Engine.decideJob = function (jobId, optionId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.decideJob(S(), jobId, optionId);
  };
  Engine.workJob = function (jobId, hours) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.workJob(S(), jobId, hours);
  };
  Engine.abandonJob = function (jobId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.abandonJob(S(), jobId);
  };

  // ------------------------------------------------------------------
  // Custom builds
  // ------------------------------------------------------------------
  Engine.getBuildCatalog = function (jobId) {
    return S() ? Engine.Jobs.getBuildCatalog(S(), jobId) : { categories: {} };
  };
  // §12.2: slotIndex targets a specific slot (default 0 — old callers keep working)
  Engine.setBuildPart = function (jobId, category, partId, slotIndex) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.setBuildPart(S(), jobId, category, partId, slotIndex);
  };
  Engine.validateBuild = function (jobId) {
    if (!S()) return { valid: false, problems: ['No game in progress'],
                       problemsInfo: [{ category: 'general', text: 'No game in progress' }],
                       perf: {},
                       meetsTarget: false, style: 0, partsCost: 0, budget: 0,
                       underBudget: false };
    return Engine.Jobs.validateBuild(S(), jobId);
  };
  Engine.commitBuild = function (jobId, opts) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.commitBuild(S(), jobId, opts);
  };
  // Tooling entry point (§4): validate an arbitrary part-id list.
  Engine.validatePartList = function (partIds) {
    return Engine.Compat.validatePartList(partIds, {
      requireFull: true,
      year: S() ? Engine.currentYear(S()) : undefined
    });
  };

  // ------------------------------------------------------------------
  // Market & inventory
  // ------------------------------------------------------------------
  Engine.getMarket = function (filter) {
    return S() ? Engine.Pricing.getMarket(S(), filter) : [];
  };
  // §20.1: a thin back-compat wrapper over the same internal checkout path
  // as a synthetic single-line, never-touches-the-real-cart "cart" — 0.2h
  // (CHECKOUT_HOURS) every call now, same as the real cart. The v0.4-era
  // supply-run gate (supplyRunDoneToday) no longer applies to part purchases.
  Engine.buyPart = function (partId, qty, opts) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var C = Engine.CONFIG;
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    var part = Engine.partById(partId);
    if (!part) return err('Unknown part');
    if (!Engine.Pricing.isReleased(part, state) || Engine.Pricing.isPruned(part, state))
      return err(part.name + ' is not on the market');
    var rush = !!(opts && opts.rush);
    var unit = Engine.Pricing.priceOf(part, state, { buy: true });
    var cost = Engine.round2(unit * qty);
    var surcharge = rush ? Engine.round2(Math.max(C.RUSH_SURCHARGE_MIN,
                                                   cost * C.RUSH_SURCHARGE_PCT)) : 0;
    var grand = Engine.round2(cost + surcharge);
    if (state.cash < grand) {
      return err(rush ? 'Not enough cash for rush shipping (' + Engine.fmtMoney(grand) + ' all-in)'
                       : 'Not enough cash (' + Engine.fmtMoney(cost) + ' needed)');
    }
    var sp = Engine.spendHours(state, C.CHECKOUT_HOURS);   // overtime rules (§9.4)
    if (!sp.ok) return sp;
    Engine.addCash(state, -cost);
    Engine.ledgerAdd(state, 'partsCost', cost);
    // §19.3: retail buys ship overnight by default; rush pays the same-day
    // premium and lands in stock immediately.
    if (rush) {
      if (surcharge > 0) {
        Engine.addCash(state, -surcharge);
        Engine.ledgerAdd(state, 'other', surcharge);
      }
      Engine.inventoryAdd(state, part.id, qty, unit);
      return { ok: true, cost: grand, rush: true, surcharge: surcharge };
    }
    var arrives = state.day + C.RETAIL_LEAD_DAYS;
    Engine.pushSplitOrders(state, { source: 'retail', distributorId: null, partId: part.id,
                                    partName: part.name, distName: 'Retail market', gray: false },
                          qty, unit, arrives, []);
    return { ok: true, cost: cost, ordered: true, arrivesDay: arrives };
  };
  Engine.sellPart = function (partId, qty) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    var part = Engine.partById(partId);
    if (!part) return err('Unknown part');
    var entry = Engine.inventoryEntry(state, part.id);
    if (!entry || entry.qty < qty) return err('Not enough in stock');
    var unit = Engine.Pricing.priceOf(part, state);
    var proceeds = Engine.round2(unit * Engine.CONFIG.SELL_PART_RATIO * qty);
    Engine.inventoryRemove(state, part.id, qty);
    Engine.addCash(state, proceeds);
    Engine.ledgerAdd(state, 'revenue', proceeds);
    return { ok: true, proceeds: proceeds };
  };
  Engine.getInventoryView = function () {
    var state = S();
    if (!state) return [];
    var out = [];
    for (var i = 0; i < state.inventory.length; i++) {
      var e = state.inventory[i];
      var part = Engine.partById(e.partId);
      out.push({
        partId: e.partId,
        name: part ? part.name : e.partId,
        category: part ? part.category : '?',
        qty: e.qty, avgCost: e.avgCost,
        curPrice: part ? Engine.Pricing.priceOf(part, state) : 0,
        arrivedToday: !!(state.arrivedToday && state.arrivedToday[e.partId])  // §19.9
      });
    }
    return out;
  };
  Engine.getStorageInfo = function () {
    return S() ? Engine.storageInfo(S())
               : { used: 0, capacity: 0, free: 0, overage: 0, feePerSlot: 0 };
  };
  Engine.getPriceHistory = function (partId) {
    return S() ? Engine.Pricing.getPriceHistory(S(), partId) : [];
  };

  // ------------------------------------------------------------------
  // §20.1/§20.3 Shopping cart + Parts Market drilldown browse feed.
  // state.cart = { nextId, items: [{id, source:'retail'|distributorId, partId,
  // qty, jobLinks:[{jobId,needIndex,qty}]}] }. NOTHING is priced/stored on the
  // cart item — every line prices LIVE at render and again at checkout (retail
  // via Pricing.priceOf buy-side; supplier lines via the §18.1 quoteOrder
  // machinery), so a cart held overnight reprices silently.
  // ------------------------------------------------------------------
  function distObjForEra(state, source) {
    var list = Engine.Sim.eraDistributors(state);
    for (var i = 0; i < list.length; i++) if (list[i].id === source) return list[i];
    return null;
  }
  function sourceDisplayName(state, source) {
    if (source === 'retail') return 'Retail Market';
    var d = distObjForEra(state, source);
    return d ? d.name : String(source);
  }
  function sourceIsGray(state, source) {
    if (source === 'retail') return false;
    var d = distObjForEra(state, source);
    return !!(d && d.grayMarket);
  }
  // Live-price a cart-shaped line (source/partId/qty), no side effects.
  // Returns {ok, unitPrice, lineTotal, leadDays|null, quote?} or {ok:false,error}.
  function priceCartLine(state, source, partId, qty) {
    var part = Engine.partById(partId);
    if (!part) return { ok: false, error: 'Unknown part' };
    if (source === 'retail') {
      if (!Engine.Pricing.isReleased(part, state) || Engine.Pricing.isPruned(part, state))
        return { ok: false, error: part.name + ' is not on the market' };
      var unit = Engine.Pricing.priceOf(part, state, { buy: true });
      return { ok: true, unitPrice: unit, lineTotal: Engine.round2(unit * qty), leadDays: null };
    }
    var q = Engine.Sim.quoteOrder(state, source, partId, qty);
    if (!q.ok) return { ok: false, error: q.error };
    return { ok: true, unitPrice: q.unitCost, lineTotal: q.total, leadDays: q.leadDays, quote: q };
  }

  Engine.getCart = function () {
    var state = S();
    if (!state) return { items: [], groups: [], total: 0, count: 0 };
    var cart = Engine.cartOf(state);
    var items = [];
    var groupOrder = [], groupMap = {};
    var total = 0, count = 0, retailSubtotal = 0;
    for (var i = 0; i < cart.items.length; i++) {
      var it = cart.items[i];
      var part = Engine.partById(it.partId);
      if (!part) continue;   // defensive: data drift under a stale save
      var pl = priceCartLine(state, it.source, it.partId, it.qty);
      var unitPrice = pl.ok ? pl.unitPrice : 0;
      var lineTotal = pl.ok ? pl.lineTotal : 0;
      var inv = Engine.inventoryEntry(state, it.partId);
      var jobLinks = (it.jobLinks || []).map(function (l) {
        var job = Engine.Jobs.findActive(state, l.jobId);
        return { jobId: l.jobId, jobTitle: job ? job.title : null,
                 needIndex: l.needIndex, qty: l.qty };
      });
      items.push({ id: it.id, source: it.source, sourceName: sourceDisplayName(state, it.source),
                   gray: sourceIsGray(state, it.source), partId: part.id, name: part.name,
                   category: part.category, qty: it.qty, unitPrice: unitPrice,
                   lineTotal: lineTotal, inStockQty: inv ? inv.qty : 0, jobLinks: jobLinks });
      var gKey = String(it.source);
      if (!groupMap[gKey]) {
        groupMap[gKey] = { source: it.source, sourceName: sourceDisplayName(state, it.source),
                            gray: sourceIsGray(state, it.source),
                            leadDays: it.source === 'retail' ? null : (pl.leadDays || null),
                            subtotal: 0, shipping: null };
        groupOrder.push(gKey);
      }
      groupMap[gKey].subtotal = Engine.round2(groupMap[gKey].subtotal + lineTotal);
      if (it.source === 'retail') retailSubtotal = Engine.round2(retailSubtotal + lineTotal);
      total = Engine.round2(total + lineTotal);
      count += it.qty;
    }
    if (groupMap.retail) {
      var fee = Engine.round2(Math.max(Engine.CONFIG.RUSH_SURCHARGE_MIN,
                                       Engine.CONFIG.RUSH_SURCHARGE_PCT * retailSubtotal));
      groupMap.retail.shipping = [
        { id: 'same-day', label: 'Same-day courier', fee: fee },
        { id: 'next-day', label: 'Next morning', fee: 0 }
      ];
    }
    var groups = groupOrder.map(function (k) { return groupMap[k]; });
    groups.sort(function (a, b) {
      if (a.source === 'retail') return -1;
      if (b.source === 'retail') return 1;
      return 0;
    });
    return { items: items, groups: groups, total: total, count: count };
  };

  Engine.addToCart = function (source, partId, qty) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    var part = Engine.partById(partId);
    if (!part) return err('Unknown part');
    var pl = priceCartLine(state, source, part.id, qty);
    if (!pl.ok) return err(pl.error);
    var cart = Engine.cartOf(state);
    var existing = null;
    for (var i = 0; i < cart.items.length; i++) {
      if (cart.items[i].source === source && cart.items[i].partId === part.id) {
        existing = cart.items[i]; break;
      }
    }
    if (existing) {
      var mergedQty = existing.qty + qty;
      var plMerged = priceCartLine(state, source, part.id, mergedQty);
      if (!plMerged.ok) return err(plMerged.error);
      existing.qty = mergedQty;
      return { ok: true, itemId: existing.id };
    }
    var item = { id: cart.nextId++, source: source, partId: part.id, qty: qty, jobLinks: [] };
    cart.items.push(item);
    return { ok: true, itemId: item.id };
  };

  Engine.setCartQty = function (itemId, qty) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var cart = Engine.cartOf(state);
    var item = null;
    for (var i = 0; i < cart.items.length; i++) {
      if (cart.items[i].id === Number(itemId)) { item = cart.items[i]; break; }
    }
    if (!item) return err('No such cart line');
    qty = Math.floor(Number(qty));
    if (!(qty >= 0)) return err('Enter a quantity of zero or more');
    if (qty === 0) return Engine.removeCartItem(itemId);
    var linkedTotal = (item.jobLinks || []).reduce(function (a, l) { return a + l.qty; }, 0);
    if (qty < linkedTotal) {
      return err('Can’t drop below ' + linkedTotal +
                 ' — already promised to a job on the bench');
    }
    var pl = priceCartLine(state, item.source, item.partId, qty);
    if (!pl.ok) return err(pl.error);
    item.qty = qty;
    return { ok: true };
  };

  Engine.removeCartItem = function (itemId) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var cart = Engine.cartOf(state);
    var idx = -1;
    for (var i = 0; i < cart.items.length; i++) {
      if (cart.items[i].id === Number(itemId)) { idx = i; break; }
    }
    if (idx === -1) return err('No such cart line');
    var item = cart.items[idx];
    var unlinked = (item.jobLinks || []).map(function (l) {
      return { jobId: l.jobId, needIndex: l.needIndex };
    });
    cart.items.splice(idx, 1);
    return { ok: true, unlinked: unlinked };
  };

  Engine.clearCart = function () {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var cart = Engine.cartOf(state);
    var unlinked = [];
    cart.items.forEach(function (it) {
      (it.jobLinks || []).forEach(function (l) {
        unlinked.push({ jobId: l.jobId, needIndex: l.needIndex });
      });
    });
    cart.items = [];
    return { ok: true, unlinked: unlinked };
  };

  /* §20.1: ATOMIC checkout — validate EVERYTHING first (line pricing/
   * availability + funds for lines + courier fee); only then spend the flat
   * CHECKOUT_HOURS, charge, and execute. Any failure leaves cash/cart/hours
   * completely untouched. */
  Engine.checkoutCart = function (opts) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var C = Engine.CONFIG;
    var cart = Engine.cartOf(state);
    if (!cart.items.length) return err('Your cart is empty');
    var shipping = (opts && opts.retailShipping) || 'next-day';
    if (shipping !== 'same-day' && shipping !== 'next-day')
      return err('Choose a shipping option for retail lines');

    // ---- validate every line, price everything, no mutation yet ----
    var lines = [], retailSubtotal = 0, i;
    for (i = 0; i < cart.items.length; i++) {
      var it = cart.items[i];
      var part = Engine.partById(it.partId);
      if (!part) return err('A cart line references a part that no longer exists');
      var pl = priceCartLine(state, it.source, it.partId, it.qty);
      if (!pl.ok) return err(part.name + ' (' + sourceDisplayName(state, it.source) + '): ' + pl.error);
      if (it.source === 'retail') retailSubtotal = Engine.round2(retailSubtotal + pl.lineTotal);
      lines.push({ item: it, part: part, unitPrice: pl.unitPrice,
                   lineTotal: pl.lineTotal, quote: pl.quote || null });
    }
    var hasRetail = lines.some(function (l) { return l.item.source === 'retail'; });
    var courierFee = (hasRetail && shipping === 'same-day') ?
      Engine.round2(Math.max(C.RUSH_SURCHARGE_MIN, C.RUSH_SURCHARGE_PCT * retailSubtotal)) : 0;
    var grandTotal = Engine.round2(
      lines.reduce(function (a, l) { return a + l.lineTotal; }, 0) + courierFee);
    if (state.cash < grandTotal - 1e-9)
      return err('Not enough cash for checkout (' + Engine.fmtMoney(grandTotal) + ' needed)');

    // ---- funds/hours confirmed — spend the flat fee, then execute ----
    var sp = Engine.spendHours(state, C.CHECKOUT_HOURS);
    if (!sp.ok) return sp;

    var orders = [], filledNow = 0, partsCostTotal = 0;
    for (i = 0; i < lines.length; i++) {
      var L = lines[i];
      var isRetail = L.item.source === 'retail';
      partsCostTotal = Engine.round2(partsCostTotal + L.lineTotal);
      if (isRetail && shipping === 'same-day') {
        // Instant: auto-fill every linked need right now, leftover to stock.
        var landedTotal = 0;
        (L.item.jobLinks || []).forEach(function (l) {
          var rec = Engine.Jobs.receiveOrderedParts(state,
            { jobId: l.jobId, partId: L.part.id, needIndex: l.needIndex,
              qty: l.qty, unitCost: L.unitPrice });
          landedTotal += rec.landed;
          filledNow += rec.landed;
        });
        var leftover = L.item.qty - landedTotal;
        if (leftover > 0) {
          Engine.inventoryAdd(state, L.part.id, leftover, L.unitPrice);
          state.arrivedToday = state.arrivedToday || {};
          state.arrivedToday[L.part.id] = true;
        }
      } else if (isRetail) {
        var arrivesDay = state.day + C.RETAIL_LEAD_DAYS;
        var retailBase = { source: 'retail', distributorId: null, partId: L.part.id,
                            partName: L.part.name, distName: 'Retail market', gray: false };
        orders = orders.concat(Engine.pushSplitOrders(state, retailBase, L.item.qty,
                                                      L.unitPrice, arrivesDay, L.item.jobLinks));
      } else {
        var dist = distObjForEra(state, L.item.source);
        var execRes = Engine.Sim.applyOrderExecution(state, dist, L.part, L.quote, L.item.jobLinks);
        orders = orders.concat(execRes.orders);
      }
    }
    Engine.addCash(state, -grandTotal);
    if (partsCostTotal > 0) Engine.ledgerAdd(state, 'partsCost', partsCostTotal);
    if (courierFee > 0) Engine.ledgerAdd(state, 'other', courierFee);
    cart.items = [];   // every line just checked out

    return { ok: true, hoursSpent: C.CHECKOUT_HOURS, charged: grandTotal,
             courierFee: courierFee, orders: orders.map(function (o) { return o.id; }),
             filledNow: filledNow };
  };

  // §20.3: the Parts Market drilldown's ONLY browse feed — era-filtered,
  // source-priced, deals surfaced. UI renders ONLY what this returns.
  var CATALOG_CAT_LABELS = { cpu: 'CPU', motherboard: 'Motherboard', ram: 'RAM',
    gpu: 'GPU', storage: 'Storage', psu: 'PSU', 'case': 'Case', cooling: 'Cooling',
    os: 'OS', peripheral: 'Peripheral', expansion: 'Expansion' };
  var CATALOG_CAT_ORDER = ['cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu',
                          'case', 'cooling', 'os', 'peripheral', 'expansion'];
  Engine.getSourceCatalog = function (source, opts) {
    var state = S();
    if (!state) return { categories: [], rows: [] };
    var catFilter = (opts && opts.category) || null;
    var isRetail = source === 'retail';
    if (!isRetail && !Engine.Sim.distUnlocked(state, source))
      return { categories: [], rows: [] };
    var parts = Engine.getData().PARTS || [];
    var counts = {}, rows = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!Engine.Pricing.isReleased(part, state) || Engine.Pricing.isPruned(part, state)) continue;
      counts[part.category] = (counts[part.category] || 0) + 1;
      if (catFilter && part.category !== catFilter) continue;
      var inv = Engine.inventoryEntry(state, part.id);
      var unitPrice, deal = null;
      if (isRetail) {
        unitPrice = Engine.Pricing.priceOf(part, state, { buy: true });
      } else {
        var q = Engine.Sim.quoteOrder(state, source, part.id, 1);
        if (q.ok) {
          unitPrice = q.unitCost;
          if (q.deal) deal = { discount: q.discount, allocation: q.allocation };
        } else {
          unitPrice = Engine.Pricing.priceOf(part, state, { buy: true });
        }
      }
      rows.push({
        partId: part.id, name: part.name, category: part.category,
        year: part.introYear, tier: part.tier || 'mainstream',
        brand: part.brand || null, perf: part.perf || {}, watts: part.watts || null,
        tags: (part.platformTags || []).slice(),
        unitPrice: unitPrice, inStockQty: inv ? inv.qty : 0, deal: deal
      });
    }
    var categories = Object.keys(counts).map(function (id) {
      return { id: id, label: CATALOG_CAT_LABELS[id] || id, count: counts[id] };
    }).sort(function (a, b) {
      var ia = CATALOG_CAT_ORDER.indexOf(a.id); if (ia === -1) ia = 999;
      var ib = CATALOG_CAT_ORDER.indexOf(b.id); if (ib === -1) ib = 999;
      return ia - ib;
    });
    rows.sort(function (a, b) { return a.unitPrice - b.unitPrice; });
    return { categories: categories, rows: rows };
  };

  // ------------------------------------------------------------------
  // Refurb / as-is market
  // ------------------------------------------------------------------
  Engine.getAsIsMarket = function () { return S() ? S().asIsMarket : []; };
  Engine.buyAsIsMachine = function (machineId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.buyAsIsMachine(S(), machineId);
  };
  Engine.sellRefurb = function (jobId, opts) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.sellRefurb(S(), jobId, opts);
  };
  // §19.6: player-initiated Shop Project (build for stock)
  Engine.startStockBuild = function () {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.startStockBuild(S());
  };
  Engine.appraiseRefurb = function (jobId) {
    return S() ? Engine.Jobs.appraiseRefurb(S(), jobId) : { estimate: 0 };
  };

  // §18.1 distributors — suppliers view, order quote/place/cancel, pending list
  Engine.getDistributors = function () {
    return S() ? Engine.Sim.getDistributors(S()) : [];
  };
  Engine.quoteOrder = function (distributorId, partId, qty) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Sim.quoteOrder(S(), distributorId, partId, qty);
  };
  Engine.placeOrder = function (distributorId, partId, qty) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Sim.placeOrder(S(), distributorId, partId, qty);
  };
  Engine.cancelOrder = function (orderId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Sim.cancelOrder(S(), orderId);
  };
  Engine.getPendingOrders = function () {
    return S() ? Engine.Sim.getPendingOrders(S()) : [];
  };
  // §9.5: component list of a refurb job's machine (fault slot hidden until diagnosed)
  Engine.getMachineParts = function (jobId) {
    return S() ? Engine.Jobs.getMachineParts(S(), jobId) : [];
  };
  // §9.5: strip a refurb machine into inventory parts instead of fixing it
  Engine.stripRefurb = function (jobId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.stripRefurb(S(), jobId);
  };

  // ------------------------------------------------------------------
  // Part Wiki (§9.7)
  // ------------------------------------------------------------------
  Engine.getPartInfo = function (partId) {
    return S() ? Engine.Pricing.getPartInfo(S(), partId) : null;
  };
  Engine.getWiki = function (filter) {
    return S() ? Engine.Pricing.getWiki(S(), filter) : [];
  };
  // §12.4 Devices wiki: read-only render of the Apple/mobile device tables.
  // Returns [] when the tables are absent (UI hides the Devices group).
  function appleRepairNote(d) {
    var bits = [];
    bits.push(d.ramUpgradable ? 'RAM upgradable' : 'RAM fixed');
    bits.push(d.hddUpgradable ? 'drive serviceable' : 'storage sealed');
    bits.push('no CPU upgrades');
    return bits.join(', ');
  }
  Engine.getDeviceWiki = function () {
    var DATA = Engine.getData();
    var out = [];
    (DATA.APPLE_MACHINES || []).forEach(function (d) {
      if (!d || !d.id) return;
      out.push({
        id: d.id, name: d.name || d.id, kind: 'apple',
        family: d.family || null, tier: null,
        introYear: d.introYear || null, eolYear: d.eolYear || null,
        ramUpgradable: !!d.ramUpgradable, hddUpgradable: !!d.hddUpgradable,
        desc: d.desc || '',
        repairNote: d.repairNote || appleRepairNote(d)
      });
    });
    (DATA.MOBILE_DEVICES || []).forEach(function (d) {
      if (!d || !d.id) return;
      out.push({
        id: d.id, name: d.name || d.id,
        kind: d.kind === 'tablet' ? 'tablet' : 'smartphone',
        family: null, tier: d.tier || null,
        introYear: d.introYear || null, eolYear: d.eolYear || null,
        desc: d.desc || '',
        repairNote: d.repairNote ||
          'Screen, battery, port & board-level service — no upgrades'
      });
    });
    return out;
  };

  // ------------------------------------------------------------------
  // §13.1 Tech Chronicle — a dated almanac of real computing history, wholly
  // separate from the §2.7 market-event system (zero price/market effect).
  // ------------------------------------------------------------------
  Engine.getChronicle = function () {
    var state = S();
    if (!state) return [];
    var entries = Engine.getData().CHRONICLE;
    if (!Array.isArray(entries)) return [];
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || !e.id || !e.date) continue;
      var d = Engine.dayIndexOfISO(e.date, state);
      if (d > state.day) continue;   // never surfaced before its date
      out.push({ id: e.id, date: e.date, dateLabel: Engine.dateInfo(d, state).label,
                 headline: e.headline || '', body: e.body || '', tag: e.tag || null });
    }
    out.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return out;   // newest first
  };

  // ------------------------------------------------------------------
  // §13.2 Milestone Wiki articles — unlock as the calendar crosses each
  // transition. getArticles/getArticle compute unlock state live from the
  // date; Sim.articleUnlockCheck (simulation.js) separately fires the
  // one-time "New Wiki article" news the first time a given id crosses.
  // ------------------------------------------------------------------
  function articleUnlockLabel(a, state) {
    if (a.unlockDate) return Engine.dateInfo(Engine.dayIndexOfISO(a.unlockDate, state), state).label;
    return 'Unlocked ' + (a.unlockYear != null ? a.unlockYear : '');
  }
  Engine.getArticles = function () {
    var state = S();
    if (!state) return [];
    var arts = Engine.getData().ARTICLES;
    if (!Array.isArray(arts)) return [];
    var out = [];
    for (var i = 0; i < arts.length; i++) {
      var a = arts[i];
      if (!a || !a.id || !Engine.Sim.articleUnlocked(a, state)) continue;
      out.push({ id: a.id, title: a.title || a.id, category: a.category || 'culture',
                 summary: a.summary || '', unlockLabel: articleUnlockLabel(a, state) });
    }
    return out;
  };
  Engine.getArticle = function (id) {
    var state = S();
    if (!state) return err('No game in progress');
    var arts = Engine.getData().ARTICLES || [];
    var a = null;
    for (var i = 0; i < arts.length; i++) if (arts[i] && arts[i].id === id) { a = arts[i]; break; }
    if (!a) return err('Unknown article: ' + id);
    if (!Engine.Sim.articleUnlocked(a, state))
      return err('Locked until ' + articleUnlockLabel(a, state));
    return { id: a.id, title: a.title || a.id, category: a.category || 'culture',
             summary: a.summary || '', body: a.body || '', related: a.related || [],
             unlockLabel: articleUnlockLabel(a, state) };
  };

  // ------------------------------------------------------------------
  // §13.4 Certifications — study to unlock/boost work. Effects are read live
  // from state.training.certsEarned everywhere they apply (core.js
  // Engine.certEffects & friends); this section only manages the state.
  // ------------------------------------------------------------------
  function certEffectsNote(cert) {
    if (!cert || !cert.effects) return '';
    var ef = cert.effects, bits = [];
    if (ef.jobTimeMult) {
      for (var k in ef.jobTimeMult) if (Object.prototype.hasOwnProperty.call(ef.jobTimeMult, k)) {
        var pct = Math.round((1 - ef.jobTimeMult[k]) * 100);
        if (pct) bits.push((k === 'all' ? 'All work' :
          Engine.humanizeJobTypes([k])) + ' ' + pct + '% faster');   // §19.9 (#10)
      }
    }
    if (ef.payMult) {
      for (var k2 in ef.payMult) if (Object.prototype.hasOwnProperty.call(ef.payMult, k2)) {
        var ppct = Math.round((ef.payMult[k2] - 1) * 100);
        if (ppct) bits.push(Engine.humanizeJobTypes([k2]) + ' pay +' + ppct + '%');
      }
    }
    if (ef.callbackMult != null && ef.callbackMult !== 1)
      bits.push('callbacks ' + Math.round((1 - ef.callbackMult) * 100) + '% less likely');
    if (ef.reliabilityBonus) bits.push('+' + ef.reliabilityBonus + ' effective reliability');
    if (ef.prestigeBonus) bits.push('+' + ef.prestigeBonus + ' prestige tier');
    if (Array.isArray(ef.unlocks) && ef.unlocks.length)
      bits.push('unlocks ' + Engine.humanizeJobTypes(ef.unlocks).toLowerCase());
    return bits.join(', ');
  }
  Engine.getCertifications = function () {
    var state = S();
    if (!state) return { earned: [], available: [], studying: null };
    var training = state.training || { certsEarned: [], studying: null };
    var earnedIds = training.certsEarned || [];
    var year = Engine.currentYear(state);
    var certs = Engine.certifications();
    var earned = [];
    var available = [];
    for (var i = 0; i < certs.length; i++) {
      var c = certs[i];
      if (earnedIds.indexOf(c.id) !== -1) {
        earned.push({ id: c.id, name: c.name, abbr: c.abbr || c.name,
                      effectsNote: certEffectsNote(c) });
        continue;
      }
      var reason = null;
      if (year < (c.minYear || 0)) reason = 'Not available until ' + c.minYear;
      else if (c.prereq && earnedIds.indexOf(c.prereq) === -1) {
        var preq = Engine.certById(c.prereq);
        reason = 'Requires ' + (preq ? preq.name : c.prereq) + ' first';
      } else if (training.studying) {
        reason = 'Already studying ' +
          ((Engine.certById(training.studying.certId) || {}).name || training.studying.certId);
      }
      var cost = Engine.round2((c.costBase || 0) * Engine.yearScale(year));
      if (!reason && state.cash < cost) reason = 'Not enough cash (' + Engine.fmtMoney(cost) + ' needed)';
      available.push({ id: c.id, name: c.name, abbr: c.abbr || c.name, cost: cost,
                        studyHours: c.studyHours || 0, desc: c.desc || '',
                        effectsNote: certEffectsNote(c),   // §19.9 (UI shows directly)
                        canStart: !reason, reason: reason });
    }
    var studyingView = null;
    if (training.studying) {
      var sc = Engine.certById(training.studying.certId);
      var total = sc ? (sc.studyHours || 1) : 1;
      studyingView = { id: training.studying.certId, name: sc ? sc.name : training.studying.certId,
                       hoursDone: training.studying.hoursDone || 0, hoursTotal: total,
                       pct: Engine.clamp(Engine.round2(((training.studying.hoursDone || 0) / total) * 100), 0, 100) };
    }
    return { earned: earned, available: available, studying: studyingView };
  };
  Engine.startCertification = function (id) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    if (!state.training) state.training = { certsEarned: [], studying: null };
    var cert = Engine.certById(id);
    if (!cert) return err('Unknown certification: ' + id);
    if (state.training.certsEarned.indexOf(id) !== -1) return err('Already earned');
    if (state.training.studying)
      return err('Already studying another certification — finish it first');
    var year = Engine.currentYear(state);
    if (year < (cert.minYear || 0)) return err(cert.name + ' is not available until ' + cert.minYear);
    if (cert.prereq && state.training.certsEarned.indexOf(cert.prereq) === -1) {
      var preq = Engine.certById(cert.prereq);
      return err('Requires ' + (preq ? preq.name : cert.prereq) + ' first');
    }
    var cost = Engine.round2((cert.costBase || 0) * Engine.yearScale(year));
    if (state.cash < cost) return err('Not enough cash (' + Engine.fmtMoney(cost) + ' needed)');
    Engine.addCash(state, -cost);
    if (cost > 0) Engine.ledgerAdd(state, 'other', cost);
    state.training.studying = { certId: cert.id, hoursDone: 0 };
    Engine.pushNews(state, 'system', 'Studying: ' + cert.name,
      'Enrolled for ' + Engine.fmtMoney(cost) + '. ' + (cert.studyHours || 0) +
      ' hours of study ahead.');
    return { ok: true, cost: cost };
  };
  // §13.4: spends OWNER work hours (overtime rules apply); staff do NOT speed
  // studying — it's the owner's own time at the books, not bench work.
  Engine.studyCert = function (hours) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var studying = state.training && state.training.studying;
    if (!studying) return err('Not currently studying anything');
    var cert = Engine.certById(studying.certId);
    if (!cert) { state.training.studying = null; return err('That certification no longer exists'); }
    var avail = Engine.hoursAvailable(state);
    function finish() {
      state.training.certsEarned.push(cert.id);
      state.training.studying = null;
      var msg = cert.name + ' (' + (cert.abbr || cert.name) + ') certification earned';
      Engine.pushNews(state, 'system', 'Certified: ' + cert.name,
        'Studies complete — ' + (certEffectsNote(cert) || 'a new credential for the shop') + '.');
      state.certsEarnedToday = state.certsEarnedToday || [];
      state.certsEarnedToday.push(msg);
    }
    // §14.8: study time snaps to the 0.1h grid too (cert.studyHours need not
    // change — the engine quantizes it here, same pattern as TASK_STEPS).
    var totalHours = Engine.round1(Math.max(0, cert.studyHours || 0));
    var remaining = Math.max(0, Engine.round1(totalHours - (studying.hoursDone || 0)));
    if (remaining <= 1e-9) {   // degenerate zero-hour cert — nothing left to spend
      finish();
      return { ok: true, hoursSpent: 0, completed: true };
    }
    if (avail <= 1e-9) return err('Too exhausted — call it a day');
    var want = hours == null ? remaining : Engine.round1(Math.max(0, Number(hours) || 0));
    var spend = Engine.round1(Math.min(avail, want, remaining));
    if (spend <= 1e-9) return err('Nothing left to study');
    var sp = Engine.spendHours(state, spend);
    if (!sp.ok) return sp;
    studying.hoursDone = Engine.round1((studying.hoursDone || 0) + spend);
    var completed = studying.hoursDone >= totalHours - 1e-9;
    if (completed) finish();
    return { ok: true, hoursSpent: spend, completed: completed };
  };

  // ------------------------------------------------------------------
  // Shop
  // ------------------------------------------------------------------
  /* §16.2b: upgradeCost year-scaling is capped at x2.2 — late-era moves were
   * priced by raw laborRate ratio (2021: x3.39 = $13.6k tier-1) and never paid
   * back (playtest P1.2). Rent/wages still scale fully; only the one-off
   * upgrade price is softened. */
  function upgradeCostFor(next, year) {
    var scale = Math.min(Engine.yearScale(year), Engine.CONFIG.UPGRADE_COST_SCALE_CAP);
    return Engine.round2((next.upgradeCost || 0) * scale);
  }
  /* §16.2b: trailing daily-net average from state.netHistory (nightly
   * cumulative-net samples, capped). Returns {avg}|{reason} — reason is the
   * honest line the UI shows when no payback estimate is possible. */
  function trailingDailyNet(state) {
    var h = state.netHistory || [];
    if (h.length < 2)
      return { avg: null, reason: 'Too early to tell — give it a few days of trading first' };
    var last = h[h.length - 1];
    var firstIdx = 0;
    for (var i = h.length - 1; i >= 0; i--) {
      if (last.day - h[i].day <= Engine.CONFIG.NET_HISTORY_DAYS) firstIdx = i;
      else break;
    }
    var first = h[firstIdx];
    var days = last.day - first.day;
    if (days < 1)
      return { avg: null, reason: 'Too early to tell — give it a few days of trading first' };
    var avg = Engine.round2((last.cum - first.cum) / days);
    if (avg <= 0)
      return { avg: avg, reason: 'The shop isn’t profitable enough yet — recent days ' +
                                 'average ' + Engine.fmtMoney(avg) + '/day' };
    return { avg: avg, reason: null };
  }
  Engine.getShopView = function () {
    var state = S();
    if (!state) return { tier: null, nextTier: null, equipment: [], insurance: {} };
    var DATA = Engine.getData();
    var year = Engine.currentYear(state);
    var scale = Engine.yearScale(year);
    var tiers = DATA.SHOP_TIERS || [];
    var cur = Engine.tierInfo(state);
    var next = tiers[state.shop.tier + 1] || null;
    var nextView = null;
    if (next) {
      var cost = upgradeCostFor(next, year);   // §16.2b capped scaling
      // §16.2b ROI transparency: what the move actually changes, in numbers.
      // Rent delta reflects what the 1st will really charge (difficulty +
      // scenario rent multipliers); utilities are never rent-multiplied.
      var rentMult = Engine.difficultyFor(state).rentMult || 1;
      var scen = Engine.currentScenario(state);
      if (scen && scen.modifiers && scen.modifiers.rentMult > 0)
        rentMult *= scen.modifiers.rentMult;
      var C = Engine.CONFIG;
      var staffCur = C.STAFF_SLOTS[Engine.clamp(state.shop.tier, 0, C.STAFF_SLOTS.length - 1)] || 0;
      var staffNext = C.STAFF_SLOTS[Engine.clamp(state.shop.tier + 1, 0, C.STAFF_SLOTS.length - 1)] || 0;
      var net = trailingDailyNet(state);
      var paybackMonths = null;
      if (net.avg != null && net.avg > 0) {
        paybackMonths = Math.round((cost / (net.avg * 30)) * 10) / 10;
      }
      nextView = {
        name: next.name, cost: cost, minPrestige: next.minPrestige || 0,
        canAfford: state.cash >= cost,
        prestigeOk: state.reputation.prestige >= (next.minPrestige || 0),
        // §16.2b (UI contract)
        monthlyCostDelta: Engine.round2(
          ((next.rentBase || 0) - (cur.rentBase || 0)) * scale * rentMult +
          ((next.utilitiesBase || 0) - (cur.utilitiesBase || 0)) * scale),
        offerBonusDelta: (next.offerBonus || 0) - (cur.offerBonus || 0),
        slotsDelta: (next.workstationSlots || 0) - (cur.workstationSlots || 0),
        staffSlotsDelta: staffNext - staffCur,
        paybackMonths: paybackMonths,          // null when no honest estimate exists
        paybackReason: paybackMonths == null ? net.reason : null,
        dailyNetAvg: net.avg                   // the number the estimate is built on
      };
    }
    var equipment = [];
    var eq = DATA.EQUIPMENT || [];
    for (var i = 0; i < eq.length; i++) {
      var e = eq[i];
      equipment.push({
        id: e.id, name: e.name,
        cost: Engine.round2((e.costBase || 0) * scale),
        owned: Engine.equipmentOwned(state, e.id),
        available: year >= (e.introYear || 0),
        requiresOwned: e.requires ? Engine.equipmentOwned(state, e.requires) : true,
        requires: e.requires || null,
        desc: e.desc || ''
      });
    }
    return {
      tier: {
        id: cur.id, name: cur.name,
        rent: Engine.round2((cur.rentBase || 0) * scale),
        utilities: Engine.round2((cur.utilitiesBase || 0) * scale),
        workstationSlots: cur.workstationSlots, offerBonus: cur.offerBonus,
        storageSlots: cur.storageSlots, desc: cur.desc || ''
      },
      nextTier: nextView,
      equipment: equipment,
      insurance: {
        active: state.shop.insurance,
        monthlyCost: Engine.round2(Engine.laborRate(year) *
                                   Engine.CONFIG.INSURANCE_MONTHLY_LABOR_MULT)
      }
    };
  };
  Engine.buyEquipment = function (id) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var eq = Engine.getData().EQUIPMENT || [];
    var item = null;
    for (var i = 0; i < eq.length; i++) if (eq[i].id === id) item = eq[i];
    if (!item) return err('Unknown equipment: ' + id);
    if (Engine.equipmentOwned(state, item.id)) return err('Already owned');
    var year = Engine.currentYear(state);
    if (year < (item.introYear || 0))
      return err(item.name + ' is not available until ' + item.introYear);
    if (item.requires && !Engine.equipmentOwned(state, item.requires))
      return err('Requires ' + item.requires + ' first');
    var cost = Engine.round2((item.costBase || 0) * Engine.yearScale(year));
    if (state.cash < cost) return err('Not enough cash (' + Engine.fmtMoney(cost) + ')');
    Engine.addCash(state, -cost);
    if (cost > 0) Engine.ledgerAdd(state, 'other', cost);
    state.shop.equipment.push(item.id);
    return { ok: true, cost: cost };
  };
  Engine.upgradeShop = function () {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var tiers = Engine.getData().SHOP_TIERS || [];
    var next = tiers[state.shop.tier + 1];
    if (!next) return err('Already at the top tier');
    if (state.reputation.prestige < (next.minPrestige || 0))
      return err('Need prestige tier ' + next.minPrestige + ' (' +
                 Engine.CONFIG.PRESTIGE_TIERS[next.minPrestige].label + ') first');
    var cost = upgradeCostFor(next, Engine.currentYear(state));   // §16.2b capped
    if (state.cash < cost) return err('Not enough cash (' + Engine.fmtMoney(cost) + ')');
    Engine.addCash(state, -cost);
    Engine.ledgerAdd(state, 'other', cost);
    state.shop.tier += 1;
    Engine.pushNews(state, 'system', 'Moving up: ' + next.name,
      'More benches, more storage, more walk-ins.');
    return { ok: true, cost: cost };
  };
  Engine.setInsurance = function (on) {
    var bad = needLive(); if (bad) return bad;
    S().shop.insurance = !!on;
    return { ok: true };
  };

  // ------------------------------------------------------------------
  // Staff (§10.7)
  // ------------------------------------------------------------------
  function staffEffectNote(entry, role) {
    if (!role) return '';
    if (Engine.isApprenticeRole(role)) {
      var pctA = Math.round((1 - 1 / (1 + entry.skill * Engine.CONFIG.APPRENTICE_EFFECT)) * 100);
      return 'Everything ' + pctA + '% faster';
    }
    var pct = Math.round((1 - 1 / (1 + entry.skill)) * 100);
    // §19.9 (#10): humanized copy — no raw type-id lists
    var kinds = Engine.humanizeJobTypes(role.jobTypes || []);
    return (kinds ? kinds : 'Work') + ' up to ' + pct + '% faster';
  }
  Engine.getStaffView = function () {
    var state = S();
    if (!state) return { staff: [], candidates: [], slots: 0, slotsUsed: 0,
                         totalMonthlyWages: 0, nextRefreshDay: 0 };
    var C = Engine.CONFIG;
    var slots = C.STAFF_SLOTS[Engine.clamp(state.shop.tier, 0, C.STAFF_SLOTS.length - 1)] || 0;
    var total = 0;
    var TH = C.STAFF_LEVEL_THRESHOLDS;
    // §15.1: active transitions each member still needs retraining for
    var actives = Engine.activeTransitions(state);
    var yearNow = Engine.currentYear(state);
    var staff = (state.staff || []).map(function (m) {
      total += m.wageMonthly || 0;
      var role = Engine.staffRoleById(m.role);
      var lvl = m.level || 1;
      var retrainNeeded = actives.filter(function (t) {
        return (m.retrainedFor || []).indexOf(t.id) === -1;
      }).map(function (t) {
        return { transitionId: t.id, name: t.name || t.id,
                 cost: Engine.round2((t.retrainCostBase || 100) * Engine.yearScale(yearNow)),
                 hours: Engine.round1(t.retrainHours || 4),
                 boostTypes: Engine.transitionBoostTypes(t) };
      });
      return { id: m.id, name: m.name, role: m.role,
               roleName: role ? role.name : m.role,
               desc: role ? (role.desc || '') : '',
               skill: m.skill, hiredDay: m.hiredDay, wageMonthly: m.wageMonthly,
               // §11.5 (UI contract): cumulative xp & cumulative next threshold
               level: lvl, xp: m.xp || 0,
               nextLevelAt: lvl < TH.length ? TH[lvl] : null,
               title: m.title || Engine.staffTitleFor(role, lvl),
               effectNote: staffEffectNote(m, role),
               // §15.1 (UI contract): retraining flag + button state.
               // `retrain` is the primary single-button shape the UI binds;
               // `retrainNeeded` lists every outstanding transition (rare
               // overlap case) and `retrainedFor` the completed ones.
               retrain: retrainNeeded.length ?
                 { needed: true, transitionId: retrainNeeded[0].transitionId,
                   transitionName: retrainNeeded[0].name,
                   cost: retrainNeeded[0].cost, hours: retrainNeeded[0].hours } :
                 { needed: false },
               retrainedFor: (m.retrainedFor || []).slice(),
               retrainNeeded: retrainNeeded };
    });
    var candidates = (state.staffMarket || []).map(function (c) {
      var role = Engine.staffRoleById(c.role);
      var lvl = c.level || 1;
      return { id: c.id, name: c.name, role: c.role,
               roleName: role ? role.name : c.role,
               desc: role ? (role.desc || '') : '',
               skill: c.skill, wageMonthly: c.wageMonthly,
               level: lvl, xp: c.xp || 0,
               nextLevelAt: lvl < TH.length ? TH[lvl] : null,
               title: c.title || Engine.staffTitleFor(role, lvl),
               effectNote: staffEffectNote(c, role) };
    });
    return { staff: staff, candidates: candidates,
             slots: slots, slotsUsed: (state.staff || []).length,
             totalMonthlyWages: Engine.round2(total),
             nextRefreshDay: state.staffNextRefreshDay || 0 };
  };
  Engine.hireStaff = function (candidateId) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var C = Engine.CONFIG;
    var slots = C.STAFF_SLOTS[Engine.clamp(state.shop.tier, 0, C.STAFF_SLOTS.length - 1)] || 0;
    if ((state.staff || []).length >= slots) {
      return err(slots === 0 ? 'No room for staff in a garage — upgrade the shop first'
                             : 'All staff slots are filled');
    }
    var cand = null;
    for (var i = 0; i < (state.staffMarket || []).length; i++) {
      if (String(state.staffMarket[i].id) === String(candidateId)) { cand = state.staffMarket[i]; break; }
    }
    if (!cand) return err('That candidate is gone');
    state.staffMarket.splice(state.staffMarket.indexOf(cand), 1);
    var role = Engine.staffRoleById(cand.role);
    var lvl = cand.level || 1;
    state.staff.push({ id: cand.id, name: cand.name, role: cand.role,
                       skill: cand.skill, hiredDay: state.day,
                       wageMonthly: cand.wageMonthly,
                       level: lvl,
                       xp: cand.xp != null ? cand.xp :
                           Engine.CONFIG.STAFF_LEVEL_THRESHOLDS[lvl - 1],
                       title: cand.title || Engine.staffTitleFor(role, lvl),
                       retrainedFor: [] });   // §15.1
    Engine.pushNews(state, 'system', 'Hired: ' + cand.name,
      'Joins the shop as ' + (cand.title || (role ? role.name : cand.role)) +
      ' at ' + Engine.fmtMoney(cand.wageMonthly) + '/month.');
    return { ok: true };
  };
  Engine.fireStaff = function (staffId) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var member = null;
    for (var i = 0; i < (state.staff || []).length; i++) {
      if (String(state.staff[i].id) === String(staffId)) { member = state.staff[i]; break; }
    }
    if (!member) return err('No such employee');
    var severance = Engine.round2((member.wageMonthly || 0) *
                                  Engine.CONFIG.SEVERANCE_MONTHS);
    Engine.addCash(state, -severance);
    if (severance > 0) Engine.ledgerAdd(state, 'other', severance);
    state.staff.splice(state.staff.indexOf(member), 1);
    Engine.pushScore(state, Engine.CONFIG.FIRE_REP_SCORE,
      { reasons: ['let staff go'] });   // small rep ding
    if ((member.level || 1) >= 4) {   // §11.5: firing senior talent stings double
      Engine.pushScore(state, Engine.CONFIG.FIRE_REP_SCORE,
        { reasons: ['fired a senior employee'] });
    }
    Engine.pushNews(state, 'system', 'Let go: ' + member.name,
      'Two weeks severance paid (' + Engine.fmtMoney(severance) + '). Word gets around.');
    return { ok: true, severance: severance };
  };

  // ------------------------------------------------------------------
  // §15.1 Staff retraining — until retrained for an active transition, a
  // tech's time-bonus contribution is halved on the transition's boosted
  // job types (see Engine.staffTimeMult). Year-scaled cost + owner hours.
  // ------------------------------------------------------------------
  Engine.retrainStaff = function (staffId, transitionId) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var member = null;
    for (var i = 0; i < (state.staff || []).length; i++) {
      if (String(state.staff[i].id) === String(staffId)) { member = state.staff[i]; break; }
    }
    if (!member) return err('No such staff member');
    var t = Engine.transitionById(transitionId);
    if (!t) return err('Unknown transition: ' + transitionId);
    var w = Engine.transitionWindow(t, state);
    if (state.day < w.warnDay)
      return err('Too early — the training courses for that shift don’t exist yet');
    if (state.day >= w.endDay)
      return err('That transition is over — the market already moved on');
    member.retrainedFor = member.retrainedFor || [];
    if (member.retrainedFor.indexOf(t.id) !== -1)
      return err(member.name + ' is already retrained for ' + (t.name || t.id));
    var year = Engine.currentYear(state);
    var cost = Engine.round2((t.retrainCostBase || 100) * Engine.yearScale(year));
    if (state.cash < cost)
      return err('Not enough cash (' + Engine.fmtMoney(cost) + ' needed)');
    var hours = Engine.round1(t.retrainHours || 4);
    var sp = Engine.spendHours(state, hours);   // owner time, overtime rules (§9.4)
    if (!sp.ok) return sp;
    Engine.addCash(state, -cost);
    if (cost > 0) Engine.ledgerAdd(state, 'other', cost);
    member.retrainedFor.push(t.id);
    Engine.pushNews(state, 'system', 'Retrained: ' + member.name,
      member.name + ' is now up to speed on ' + (t.name || t.id) + ' work (' +
      Engine.fmtMoney(cost) + ', ' + hours + 'h of your time).');
    return { ok: true, cost: cost, hoursSpent: hours };
  };

  // §15.1 (UI contract): transition windows for header chips / staff panel.
  Engine.getTransitions = function () {
    var state = S();
    if (!state) return [];
    return Engine.transitionsData().map(function (t) {
      var w = Engine.transitionWindow(t, state);
      var status = state.day < w.warnDay ? 'future' :
                   state.day < w.startDay ? 'warned' :
                   state.day < w.endDay ? 'active' : 'ended';
      return { id: t.id, name: t.name || t.id, status: status,
               body: t.body || '', newsLead: t.newsLead || '',
               daysUntilStart: Math.max(0, w.startDay - state.day),
               daysLeft: Math.max(0, w.endDay - state.day),
               boostTypes: Engine.transitionBoostTypes(t),
               obsoleteTags: (t.obsoleteTags || []).slice() };
    }).filter(function (v) { return v.status === 'warned' || v.status === 'active'; });
  };

  // ------------------------------------------------------------------
  // §15.3 Credit line — prestige-gated, era-appropriate APR, interest billed
  // with the rent. Drawn balance is a liability, never negative cash.
  // ------------------------------------------------------------------
  Engine.getCredit = function () {
    var state = S();
    var C = Engine.CONFIG;
    if (!state) return { unlocked: false, limit: 0, drawn: 0, apr: 0,
                         monthlyInterest: 0, reason: 'No game in progress' };
    var credit = state.credit || { drawn: 0 };
    var year = Engine.currentYear(state);
    var prestige = state.reputation.prestige || 0;
    var unlocked = prestige >= C.CREDIT_PRESTIGE_MIN;
    var limit = unlocked ?
      Engine.round2(Engine.laborRate(year) * C.CREDIT_LIMIT_LABOR_MULT * (1 + prestige)) : 0;
    var apr = Engine.creditAprFor(year);
    return {
      unlocked: unlocked,
      limit: limit,
      drawn: Engine.round2(credit.drawn || 0),
      apr: Math.round(apr * 1000) / 1000,
      monthlyInterest: Engine.round2((credit.drawn || 0) * apr / 12),
      reason: unlocked ? null :
        'Banks want a reputation first — reach prestige tier ' +
        C.CREDIT_PRESTIGE_MIN + ' (' +
        C.PRESTIGE_TIERS[C.CREDIT_PRESTIGE_MIN].label + ')'
    };
  };
  Engine.drawCredit = function (amount) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var view = Engine.getCredit();
    if (!view.unlocked) return err(view.reason || 'Credit line locked');
    amount = Engine.round2(Number(amount));
    if (!(amount > 0)) return err('Enter a positive amount to draw');
    if (view.drawn + amount > view.limit + 1e-9)
      return err('That would exceed the credit limit (' + Engine.fmtMoney(view.limit) +
                 ', ' + Engine.fmtMoney(view.limit - view.drawn) + ' available)');
    var sp = Engine.spendHours(state, Engine.CONFIG.CREDIT_PAPERWORK_HOURS);
    if (!sp.ok) return sp;   // 0.1h of paperwork (§15.3)
    state.credit = state.credit || { drawn: 0 };
    state.credit.drawn = Engine.round2(state.credit.drawn + amount);
    Engine.addCash(state, amount);
    return { ok: true, drawn: state.credit.drawn,
             hoursSpent: Engine.CONFIG.CREDIT_PAPERWORK_HOURS };
  };
  Engine.repayCredit = function (amount) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var credit = state.credit || { drawn: 0 };
    amount = Engine.round2(Number(amount));
    if (!(amount > 0)) return err('Enter a positive amount to repay');
    if (amount > credit.drawn + 1e-9)
      return err('Only ' + Engine.fmtMoney(credit.drawn) + ' is drawn');
    if (state.cash < amount)
      return err('Not enough cash to repay ' + Engine.fmtMoney(amount));
    var sp = Engine.spendHours(state, Engine.CONFIG.CREDIT_PAPERWORK_HOURS);
    if (!sp.ok) return sp;   // 0.1h of paperwork (§15.3)
    state.credit = credit;
    credit.drawn = Engine.round2(credit.drawn - amount);
    Engine.addCash(state, -amount);
    if (credit.drawn <= 0) {
      credit.drawn = 0;
      Engine.recordAchievementEvent(state, 'credit-repaid-full');   // §15.5
    }
    return { ok: true, drawn: credit.drawn,
             hoursSpent: Engine.CONFIG.CREDIT_PAPERWORK_HOURS };
  };

  // ------------------------------------------------------------------
  // §15.2 Scenario result & sandbox continuation
  // ------------------------------------------------------------------
  /* UI contract: {ok:false} until the scenario has actually ENDED (so the end
   * screen only triggers once, and never re-triggers after continueSandbox
   * clears state.scenario). On completion: {ok, name, score, grade, lines}. */
  Engine.getScenarioResult = function () {
    var state = S();
    if (!state || !state.scenario)
      return { ok: false, error: 'Not playing a scenario' };
    var sc = state.scenario;
    if (!sc.completed || !sc.result)
      return { ok: false, error: 'The scenario is still running' };
    var r = sc.result;   // frozen at completion
    return { ok: true, name: r.name, score: r.score, grade: r.grade, lines: r.lines };
  };
  Engine.continueSandbox = function () {
    var bad = needState(); if (bad) return bad;
    var state = S();
    if (!state.scenario) return err('Not playing a scenario');
    if (!state.scenario.completed)
      return err('The scenario is still running — see it through first');
    state.scenario = null;   // clears the countdown/end screen; save continues
    Engine.pushNews(state, 'system', 'Sandbox mode',
      'The challenge is over, but the shop stays open. Play on.');
    autosave();
    return { ok: true };
  };

  // ------------------------------------------------------------------
  // §15.4 Business accounts (UI view — optional convenience over state.accounts)
  // ------------------------------------------------------------------
  Engine.getBusinessAccounts = function () {
    var state = S();
    if (!state) return [];
    var C = Engine.CONFIG;
    return (state.accounts || []).map(function (a) {
      var atRisk = state.reputation.rating < a.minRating + 0.3 ||
                   (a.failsThisMonth || 0) >= C.ACCOUNT_FAILS_CANCEL - 1;
      return { id: a.id, name: a.name, monthlyFee: a.monthlyFee,
               jobsPerMonth: a.jobsPerMonth, minRating: a.minRating,
               signedDay: a.signedDay,
               jobsThisMonth: a.jobsThisMonth || 0,
               failsThisMonth: a.failsThisMonth || 0,
               cancelRisk: atRisk ?
                 (state.reputation.rating < a.minRating + 0.3 ?
                   'Rating is close to their ' + a.minRating.toFixed(1) + ' floor' :
                   'One more failed job this month cancels the account') : null };
    });
  };

  // ------------------------------------------------------------------
  // §21.1 Client registry — the CRM spine. Read-only (CRM has no mutators).
  // ------------------------------------------------------------------
  function clientMachineSummary(m) {
    return { id: m.id, name: m.name, year: m.year,
             specSummary: m.specSummary || Engine.Jobs.specSummaryFor(m.partIds || []),
             builtByShop: !!m.builtByShop, acquiredDay: m.acquiredDay,
             servicedCount: m.servicedCount || 0 };
  }
  function clientView(c) {
    var tier = Engine.Jobs.loyaltyTierFor(c.loyalty || 0);
    return {
      id: c.id, name: c.name, type: c.type,
      loyalty: c.loyalty || 0, loyaltyTier: tier.label,
      regular: (c.loyalty || 0) >= Engine.CONFIG.LOYALTY_REGULAR,
      visits: c.visits || 0,
      firstSeenDay: c.firstSeenDay, lastSeenDay: c.lastSeenDay,
      tasteBrand: c.tasteBrand || null,
      referredBy: c.referredBy || null,
      machines: (c.machines || []).map(clientMachineSummary),
      workLog: (c.workLog || []).map(function (w) {
        return { day: w.day, title: w.title, type: w.type,
                 outcome: w.outcome, pay: w.pay, score: w.score };
      })
    };
  }
  Engine.getClients = function () {
    var state = S();
    if (!state) return [];
    var list = (state.clients && state.clients.list) || [];
    var sorted = list.slice().sort(function (a, b) {
      if ((b.loyalty || 0) !== (a.loyalty || 0)) return (b.loyalty || 0) - (a.loyalty || 0);
      return (b.lastSeenDay || 0) - (a.lastSeenDay || 0);
    });
    return sorted.map(clientView);
  };
  Engine.getClient = function (id) {
    var state = S();
    if (!state) return null;
    var c = Engine.Jobs.findClient(state, id);
    return c ? clientView(c) : null;
  };

  // ------------------------------------------------------------------
  // §21.3 Business ecosystems — extended accounts view (kind/seats/health/
  // fleet/history). Engine.getBusinessAccounts above is unchanged for
  // back-compat; this is the v0.10 view the Clients > Businesses tab reads.
  // ------------------------------------------------------------------
  Engine.getAccounts = function () {
    var state = S();
    if (!state) return [];
    var C = Engine.CONFIG;
    return (state.accounts || []).map(function (a) {
      var atRisk = state.reputation.rating < a.minRating + 0.3 ||
                   (a.failsThisMonth || 0) >= C.ACCOUNT_FAILS_CANCEL - 1;
      return {
        id: a.id, name: a.name, kind: a.kind || 'office', seats: a.seats || 0,
        health: a.health != null ? a.health : C.ACCOUNT_HEALTH_START,
        trend: a.healthTrend || 'flat', lastChangeReason: a.healthReason || null,
        monthlyFee: a.monthlyFee, jobsPerMonth: a.jobsPerMonth, minRating: a.minRating,
        signedDay: a.signedDay,
        jobsThisMonth: a.jobsThisMonth || 0, failsThisMonth: a.failsThisMonth || 0,
        fleet: (a.fleet || []).map(function (m) {
          var ratio = 1, cpu = null;
          (m.partIds || []).forEach(function (id) {
            var p = Engine.partById(id);
            if (p && p.category === 'cpu') cpu = p;
          });
          if (cpu) {
            var bl = Engine.baselineFor(Engine.currentYear(state));
            ratio = (bl.cpu || 1) > 0 ? ((cpu.perf || {}).cpu || 0) / (bl.cpu || 1) : 1;
          }
          var cond = ratio >= 1.1 ? 'cutting-edge' : ratio >= 0.85 ? 'solid' :
                     ratio >= 0.6 ? 'aging' : 'due for replacement';
          return { id: m.id, name: m.name, year: m.year,
                   builtByShop: !!m.builtByShop, acquiredDay: m.acquiredDay,
                   condition: cond };
        }),
        history: (a.history || []).map(function (h) {
          return { day: h.day, seats: h.seats, delta: h.delta, reason: h.reason || null };
        }),
        cancelRisk: atRisk ?
          (state.reputation.rating < a.minRating + 0.3 ?
            'Rating is close to their ' + a.minRating.toFixed(1) + ' floor' :
            'One more failed job this month cancels the account') : null
      };
    });
  };

  // ------------------------------------------------------------------
  // §15.5 Achievements
  // ------------------------------------------------------------------
  Engine.getAchievements = function () {
    var state = S();
    var table = Engine.ACHIEVEMENTS || [];
    return table.map(function (a) {
      var day = state && state.achievements ? state.achievements[a.id] : null;
      var unlocked = day != null;
      var masked = !!a.hidden && !unlocked;
      return {
        id: a.id,
        name: masked ? '???' : a.name,
        desc: masked ? (a.hint || 'A hidden achievement — you’ll know it when it happens.')
                     : a.desc,
        hint: masked ? (a.hint || null) : null,   // §19.9 (#6)
        unlocked: unlocked,
        hidden: !!a.hidden,
        dayLabel: unlocked && state ? Engine.dateInfo(day, state).label : null
      };
    });
  };
  /* §15.5: the UI reports UI-side events (e.g. opening a Wiki article) here;
   * engine internals record theirs via Engine.recordAchievementEvent. Runs an
   * immediate sweep so event-gated unlocks toast right away. */
  Engine.markAchievementEvent = function (tag) {
    var bad = needState(); if (bad) return bad;
    if (!tag || typeof tag !== 'string') return err('Bad achievement event tag');
    var state = S();
    Engine.recordAchievementEvent(state, tag);
    var unlocked = Engine.Sim.checkAchievements(state, null);
    return { ok: true, unlocked: unlocked };
  };

  // §11.6: burn an hour purely to advance running wait steps (overtime applies).
  // §16.3f: if nothing is running yet, auto-START the next pending wait step
  // (deadline-soonest job first), charging its 0.1h start inside the hour —
  // the button always does something useful (playtest P2.6 tooltip mismatch).
  Engine.waitHour = function () {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var C = Engine.CONFIG;
    function currentWait(j) {
      if (!j.steps || j.stepIndex >= j.steps.length) return null;
      var st = j.steps[j.stepIndex];
      if (st.kind !== 'wait') return null;
      // an install-flavored wait still needs its part assigned first
      if (st.needIndex != null) {
        var nd = j.needs[st.needIndex];
        if (!nd || nd.filledPartIds.length < nd.qty) return null;
      }
      return st;
    }
    var anyRunning = state.jobs.active.some(function (j) {
      var st = currentWait(j);
      return !!(st && st.running);
    });
    var startedLabel = null;
    if (!anyRunning) {
      // Auto-start the pending wait on the most urgent job holding one
      var candidates = state.jobs.active.filter(function (j) {
        var st = currentWait(j);
        return !!(st && !st.running);
      }).sort(function (a, b) {
        return (a.deadlineDay == null ? 1e9 : a.deadlineDay) -
               (b.deadlineDay == null ? 1e9 : b.deadlineDay);
      });
      if (!candidates.length)
        return err('Nothing is running — no waits to sit through or start');
      var job = candidates[0];
      var wst = currentWait(job);
      var sp0 = Engine.spendHours(state, 1);   // the whole hour, start included
      if (!sp0.ok) return sp0;
      wst.running = true;
      startedLabel = wst.label;
      state.workedToday = state.workedToday || [];
      if (state.workedToday.indexOf(job.id) === -1) state.workedToday.push(job.id);
      // 0.1h went to setting it running; the rest of the hour ticks all waits
      var advanced0 = Engine.Jobs.tickWaits(state, Engine.round1(1 - C.WAIT_START_HOURS), null);
      return { ok: true, hoursSpent: 1, advanced: advanced0, startedWait: startedLabel };
    }
    var sp = Engine.spendHours(state, 1);
    if (!sp.ok) return sp;
    var advanced = Engine.Jobs.tickWaits(state, 1, null);
    return { ok: true, hoursSpent: 1, advanced: advanced };
  };

  // ------------------------------------------------------------------
  // Misc
  // ------------------------------------------------------------------
  /* §17.2: newest-first outcome log with a per-entry delta vs the current
   * rolling mean (positive = this outcome pulled the stars up). */
  Engine.getReputationLog = function (limit) {
    var state = S();
    if (!state) return [];
    var n = limit == null ? 15 : Math.max(1, limit | 0);
    var h = state.reputation.history || [];
    var out = [];
    for (var i = h.length - 1; i >= 0 && out.length < n; i--) {
      var e = h[i];
      var score = Engine.entryScore(e);
      out.push({
        score: score,
        day: (e && typeof e === 'object') ? e.day : null,
        dayLabel: (e && typeof e === 'object' && e.day != null) ?
          Engine.dateInfo(e.day, state).label : null,
        jobId: (e && typeof e === 'object') ? e.jobId : null,
        title: (e && typeof e === 'object') ? e.title : null,
        reasons: (e && typeof e === 'object' && Array.isArray(e.reasons)) ?
          e.reasons.slice() : [],
        delta: Engine.round2(score - state.reputation.rating)
      });
    }
    return out;
  };
  Engine.getNews = function (limit) {
    if (!S()) return [];
    return S().news.slice(0, limit == null ? 50 : Math.max(0, limit | 0));
  };
  Engine.getLedger = function () {
    if (!S()) return { months: [], lifetime: {}, currentMonthPreview: null };
    var months = S().ledger.months;
    return {
      months: months,
      lifetime: S().ledger.lifetime,
      currentMonthPreview: months.length ? months[months.length - 1] : null
    };
  };
  Engine.getPrestigeInfo = function () {
    var C = Engine.CONFIG;
    if (!S()) return { tier: 0, label: C.PRESTIGE_TIERS[0].label, nextLabel: null,
                       progressNote: '', perks: [] };
    var rep = S().reputation;
    var t = rep.prestige;
    var next = C.PRESTIGE_TIERS[t + 1] || null;
    var note = next ?
      (rep.jobsCompleted + '/' + next.jobs + ' jobs, rating ' +
       rep.rating.toFixed(1) + '/' + next.rating.toFixed(1) + ' for "' + next.label + '"') :
      'At the top. Legend status achieved.';
    return {
      tier: t,
      label: C.PRESTIGE_TIERS[t].label,
      nextLabel: next ? next.label : null,
      progressNote: note,
      perks: [
        '+' + t + ' job offer' + (t === 1 ? '' : 's') + ' per day',
        (C.PRESTIGE_BUY_DISCOUNT * 100 * t).toFixed(0) + '% parts discount when buying',
        t >= 1 ? 'Enthusiast work unlocked' : 'Enthusiast work at tier 1',
        t >= 2 ? 'Contracts unlocked' : 'Contracts at tier 2'
      ]
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
