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
      version: 4,
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
      staffNextId: 1, levelUpsToday: []
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
  Engine.importSave = function (str) {
    var obj;
    try { obj = JSON.parse(String(str)); }
    catch (e) { return err('Not valid save JSON'); }
    if (!obj || (obj.version !== 1 && obj.version !== 2 && obj.version !== 3))
      return err('Unsupported save version');
    var required = ['seed', 'rngState', 'eraId', 'startDate', 'day', 'cash',
                    'hoursLeft', 'flags', 'reputation', 'shop', 'inventory',
                    'jobs', 'asIsMarket', 'market', 'news', 'ledger'];
    for (var i = 0; i < required.length; i++) {
      if (!(required[i] in obj)) return err('Save is missing "' + required[i] + '"');
    }
    if (obj.version === 1) migrateV1toV2(obj);
    if (obj.version === 2) migrateV2toV3(obj);
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
  Engine.setBuildPart = function (jobId, category, partId) {
    var bad = needLive(); if (bad) return bad;
    return Engine.Jobs.setBuildPart(S(), jobId, category, partId);
  };
  Engine.validateBuild = function (jobId) {
    if (!S()) return { valid: false, problems: ['No game in progress'], perf: {},
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
    var staff = (state.staff || []).map(function (m) {
      total += m.wageMonthly || 0;
      var role = Engine.staffRoleById(m.role);
      return { id: m.id, name: m.name, role: m.role,
               roleName: role ? role.name : m.role,
               desc: role ? (role.desc || '') : '',
               skill: m.skill, hiredDay: m.hiredDay, wageMonthly: m.wageMonthly,
               effectNote: staffEffectNote(m, role) };
    });
    var candidates = (state.staffMarket || []).map(function (c) {
      var role = Engine.staffRoleById(c.role);
      return { id: c.id, name: c.name, role: c.role,
               roleName: role ? role.name : c.role,
               desc: role ? (role.desc || '') : '',
               skill: c.skill, wageMonthly: c.wageMonthly,
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
    state.staff.push({ id: cand.id, name: cand.name, role: cand.role,
                       skill: cand.skill, hiredDay: state.day,
                       wageMonthly: cand.wageMonthly });
    Engine.pushNews(state, 'system', 'Hired: ' + cand.name,
      'Joins the shop as ' + ((Engine.staffRoleById(cand.role) || {}).name || cand.role) +
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
    Engine.pushNews(state, 'system', 'Let go: ' + member.name,
      'Two weeks severance paid (' + Engine.fmtMoney(severance) + '). Word gets around.');
    return { ok: true, severance: severance };
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
