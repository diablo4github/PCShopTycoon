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
    var eras = DATA.ERAS || [];
    var era = null;
    for (var i = 0; i < eras.length; i++) if (eras[i].id === opts.eraId) era = eras[i];
    if (!era) return err('Unknown era: ' + opts.eraId);
    if (!DATA.PARTS || !DATA.PARTS.length) return err('No parts catalog loaded');

    var seed = (opts.seed != null ? Number(opts.seed) : (Date.now() % 2147483647)) | 0;
    if (!isFinite(seed)) seed = 42;
    var startDi = null;
    var state = {
      version: 6,
      seed: seed, rngState: seed | 0,
      shopName: String(opts.shopName ||
        ((DATA.FLAVOR && DATA.FLAVOR.shopNameSuggestions) ?
          DATA.FLAVOR.shopNameSuggestions[0] : 'Circuit & Solder')),
      eraId: era.id,
      startDate: era.startDate,
      day: 0,
      cash: Engine.round2(era.cash),
      hoursLeft: Engine.CONFIG.HOURS_PER_DAY, hoursPerDay: Engine.CONFIG.HOURS_PER_DAY,
      supplyRunDoneToday: false,
      customBuildsUnlocked: !!era.customBuildsUnlocked,
      flags: { gameOver: false, gameOverReason: null, graceDeadlineDay: null },
      reputation: { rating: Engine.CONFIG.RATING_SEED,
                    history: [Engine.CONFIG.RATING_SEED, Engine.CONFIG.RATING_SEED,
                              Engine.CONFIG.RATING_SEED],
                    prestige: 0, jobsCompleted: 0, jobsFailed: 0, callbacks: 0 },
      shop: { tier: era.shopTier || 0, equipment: ['repair-bench'], insurance: false },
      inventory: [],
      jobs: { offers: [], active: [], completedRecent: [], nextId: 1 },
      asIsMarket: [],
      asIsNextId: 1,
      market: { noise: {}, hist: {}, activeEvents: [] },
      news: [],
      ledger: {
        months: [],
        lifetime: { revenue: 0, partsCost: 0, fixedCosts: 0, other: 0,
                    jobsCompleted: 0, jobsFailed: 0, buildsDelivered: 0,
                    refurbsSold: 0, daysPlayed: 0 }
      },
      workedToday: [], declinesToday: 0, lastContractDay: null, injuryDaysLeft: 0,
      // §10.7 staff (+§11.5 level-up queue for morning summaries)
      staff: [], staffMarket: [], staffNextRefreshDay: Engine.CONFIG.STAFF_REFRESH_DAYS,
      staffNextId: 1, levelUpsToday: [],
      // §13.4 certifications; §13.2 one-time article-unlock news dedup
      training: { certsEarned: [], studying: null }, certsEarnedToday: [],
      articlesSeen: []
    };
    Engine._state = state;
    startDi = Engine.dateInfo(0, state);
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
  Engine.importSave = function (str) {
    var obj;
    try { obj = JSON.parse(String(str)); }
    catch (e) { return err('Not valid save JSON'); }
    if (!obj || [1, 2, 3, 4, 5, 6].indexOf(obj.version) === -1)
      return err('Unsupported save version');
    var required = ['seed', 'rngState', 'eraId', 'startDate', 'day', 'cash',
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
  Engine.assignPart = function (jobId, needIndex, partId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.assignPart(S(), jobId, needIndex, partId);
  };
  Engine.unassignPart = function (jobId, needIndex, partId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.unassignPart(S(), jobId, needIndex, partId);
  };
  // Deprecated alias for assignPart (one release, §10.3)
  Engine.installPart = function (jobId, needIndex, partId) {
    return Engine.assignPart(jobId, needIndex, partId);
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
  Engine.commitBuild = function (jobId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.commitBuild(S(), jobId);
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
  Engine.buyPart = function (partId, qty) {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    var part = Engine.partById(partId);
    if (!part) return err('Unknown part');
    if (!Engine.Pricing.isReleased(part, state) || Engine.Pricing.isPruned(part, state))
      return err(part.name + ' is not on the market');
    var unit = Engine.Pricing.priceOf(part, state, { buy: true });
    var cost = Engine.round2(unit * qty);
    if (state.cash < cost) return err('Not enough cash (' + Engine.fmtMoney(cost) + ' needed)');
    if (!state.supplyRunDoneToday) {
      var run = Engine.spendHours(state, Engine.CONFIG.SUPPLY_RUN_HOURS); // overtime rules (§9.4)
      if (!run.ok) return run;
      state.supplyRunDoneToday = true;
    }
    Engine.addCash(state, -cost);
    Engine.ledgerAdd(state, 'partsCost', cost);
    Engine.inventoryAdd(state, part.id, qty, unit);
    return { ok: true, cost: cost };
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
        curPrice: part ? Engine.Pricing.priceOf(part, state) : 0
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
  // Refurb / as-is market
  // ------------------------------------------------------------------
  Engine.getAsIsMarket = function () { return S() ? S().asIsMarket : []; };
  Engine.buyAsIsMachine = function (machineId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.buyAsIsMachine(S(), machineId);
  };
  Engine.sellRefurb = function (jobId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.sellRefurb(S(), jobId);
  };
  Engine.appraiseRefurb = function (jobId) {
    return S() ? Engine.Jobs.appraiseRefurb(S(), jobId) : { estimate: 0 };
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
        if (pct) bits.push((k === 'all' ? 'All work' : k) + ' ' + pct + '% faster');
      }
    }
    if (ef.payMult) {
      for (var k2 in ef.payMult) if (Object.prototype.hasOwnProperty.call(ef.payMult, k2)) {
        var ppct = Math.round((ef.payMult[k2] - 1) * 100);
        if (ppct) bits.push(k2 + ' pay +' + ppct + '%');
      }
    }
    if (ef.callbackMult != null && ef.callbackMult !== 1)
      bits.push('callbacks ' + Math.round((1 - ef.callbackMult) * 100) + '% less likely');
    if (ef.reliabilityBonus) bits.push('+' + ef.reliabilityBonus + ' effective reliability');
    if (ef.prestigeBonus) bits.push('+' + ef.prestigeBonus + ' prestige tier');
    if (Array.isArray(ef.unlocks) && ef.unlocks.length) bits.push('unlocks ' + ef.unlocks.join(', '));
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
    var totalHours = Math.max(0, cert.studyHours || 0);
    var remaining = Math.max(0, Engine.round2(totalHours - (studying.hoursDone || 0)));
    if (remaining <= 1e-9) {   // degenerate zero-hour cert — nothing left to spend
      finish();
      return { ok: true, hoursSpent: 0, completed: true };
    }
    if (avail <= 1e-9) return err('Too exhausted — call it a day');
    var want = hours == null ? remaining : Math.max(0, Number(hours) || 0);
    var spend = Math.min(avail, want, remaining);
    if (spend <= 1e-9) return err('Nothing left to study');
    var sp = Engine.spendHours(state, spend);
    if (!sp.ok) return sp;
    studying.hoursDone = Engine.round2((studying.hoursDone || 0) + spend);
    var completed = studying.hoursDone >= totalHours - 1e-9;
    if (completed) finish();
    return { ok: true, hoursSpent: spend, completed: completed };
  };

  // ------------------------------------------------------------------
  // Shop
  // ------------------------------------------------------------------
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
      var cost = Engine.round2((next.upgradeCost || 0) * scale);
      nextView = {
        name: next.name, cost: cost, minPrestige: next.minPrestige || 0,
        canAfford: state.cash >= cost,
        prestigeOk: state.reputation.prestige >= (next.minPrestige || 0)
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
    var cost = Engine.round2((next.upgradeCost || 0) *
                             Engine.yearScale(Engine.currentYear(state)));
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
    var kinds = (role.jobTypes || []).slice(0, 3).join('/');
    return (kinds ? kinds : 'work') + ' up to ' + pct + '% faster';
  }
  Engine.getStaffView = function () {
    var state = S();
    if (!state) return { staff: [], candidates: [], slots: 0, slotsUsed: 0,
                         totalMonthlyWages: 0, nextRefreshDay: 0 };
    var C = Engine.CONFIG;
    var slots = C.STAFF_SLOTS[Engine.clamp(state.shop.tier, 0, C.STAFF_SLOTS.length - 1)] || 0;
    var total = 0;
    var TH = C.STAFF_LEVEL_THRESHOLDS;
    var staff = (state.staff || []).map(function (m) {
      total += m.wageMonthly || 0;
      var role = Engine.staffRoleById(m.role);
      var lvl = m.level || 1;
      return { id: m.id, name: m.name, role: m.role,
               roleName: role ? role.name : m.role,
               desc: role ? (role.desc || '') : '',
               skill: m.skill, hiredDay: m.hiredDay, wageMonthly: m.wageMonthly,
               // §11.5 (UI contract): cumulative xp & cumulative next threshold
               level: lvl, xp: m.xp || 0,
               nextLevelAt: lvl < TH.length ? TH[lvl] : null,
               title: m.title || Engine.staffTitleFor(role, lvl),
               effectNote: staffEffectNote(m, role) };
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
                       title: cand.title || Engine.staffTitleFor(role, lvl) });
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
    Engine.pushScore(state, Engine.CONFIG.FIRE_REP_SCORE);   // small rep ding
    if ((member.level || 1) >= 4) {   // §11.5: firing senior talent stings double
      Engine.pushScore(state, Engine.CONFIG.FIRE_REP_SCORE);
    }
    Engine.pushNews(state, 'system', 'Let go: ' + member.name,
      'Two weeks severance paid (' + Engine.fmtMoney(severance) + '). Word gets around.');
    return { ok: true, severance: severance };
  };

  // §11.6: burn an hour purely to advance running wait steps (overtime applies).
  Engine.waitHour = function () {
    var bad = needLive(); if (bad) return bad;
    var state = S();
    var anyRunning = state.jobs.active.some(function (j) {
      if (!j.steps || j.stepIndex >= j.steps.length) return false;
      var st = j.steps[j.stepIndex];
      return st.kind === 'wait' && st.running;
    });
    if (!anyRunning) return err('Nothing is running — no waits to sit through');
    var sp = Engine.spendHours(state, 1);
    if (!sp.ok) return sp;
    var advanced = Engine.Jobs.tickWaits(state, 1, null);
    return { ok: true, hoursSpent: 1, advanced: advanced };
  };

  // ------------------------------------------------------------------
  // Misc
  // ------------------------------------------------------------------
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
