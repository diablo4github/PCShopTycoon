#!/usr/bin/env node
/* Circuit & Solder — tools/sim-test.js (ENGINE workstream)
 * Headless sim test per SPEC §8 + §9.11 + §10.8: for each era preset, run a
 * 40-day greedy bot. Prefers the real js/data/*.js files when they all exist
 * and load; otherwise falls back to tools/mock-data.js. Exits non-zero.
 *
 * v3 additions: steps drive completion, assign/unassign round-trip, overspend
 * fire & waive, Sunday rules over 60 days, staff scenario, integer offer pay,
 * v2 fixture migration.
 */
'use strict';
var path = require('path');
var fs = require('fs');

// ------------------------------------------------------------------
// Data loading: real catalog if complete, else mock
// ------------------------------------------------------------------
var DATA_SOURCE = 'mock';
function loadData() {
  var dataDir = path.join(__dirname, '..', 'js', 'data');
  var files = ['catalog.js', 'eras.js', 'events.js', 'flavor.js']
    .map(function (f) { return path.join(dataDir, f); });
  var allExist = files.every(function (f) { return fs.existsSync(f); });
  if (process.env.SIM_DATA === 'mock') allExist = false;   // force mock for testing
  if (allExist) {
    try {
      globalThis.DATA = {};
      files.forEach(function (f) { require(f); });
      var D = globalThis.DATA;
      var problems = [];
      if (!Array.isArray(D.PARTS) || D.PARTS.length < 20) problems.push('PARTS');
      if (!D.YEAR_BASELINES || Object.keys(D.YEAR_BASELINES).length < 2) problems.push('YEAR_BASELINES');
      if (!Array.isArray(D.ERAS) || D.ERAS.length < 1) problems.push('ERAS');
      if (!Array.isArray(D.SHOP_TIERS) || D.SHOP_TIERS.length < 4) problems.push('SHOP_TIERS');
      if (!Array.isArray(D.EQUIPMENT) || D.EQUIPMENT.length < 5) problems.push('EQUIPMENT');
      if (!Array.isArray(D.HISTORICAL_EVENTS)) problems.push('HISTORICAL_EVENTS');
      if (!Array.isArray(D.RANDOM_EVENT_TEMPLATES)) problems.push('RANDOM_EVENT_TEMPLATES');
      if (!D.FLAVOR || !D.FLAVOR.faults || !D.FLAVOR.firstNames) problems.push('FLAVOR');
      if (!problems.length) { DATA_SOURCE = 'real js/data files'; return; }
      console.log('[sim-test] real data incomplete (' + problems.join(', ') + ') — using mock');
    } catch (e) {
      console.log('[sim-test] real data failed to load (' + e.message + ') — using mock');
    }
  } else {
    console.log('[sim-test] real data files not all present — using mock');
  }
  globalThis.DATA = {};
  require(path.join(__dirname, 'mock-data.js'));
  DATA_SOURCE = 'tools/mock-data.js';
}
loadData();

['core', 'pricing', 'compat', 'jobs', 'simulation', 'api'].forEach(function (m) {
  require(path.join(__dirname, '..', 'js', 'engine', m + '.js'));
});
var Engine = globalThis.Engine;
var DATA = globalThis.DATA;
var REAL = function () { return DATA_SOURCE.indexOf('real') === 0; };

// Tuning hooks (harness-only): sweep seeds/ratios without editing files.
// Default gate seed chosen so the deterministic run sits near the median of
// the seed distribution for both the §9.6 band and the flips ratio.
var SEED_BASE = Number(process.env.SIM_SEED_BASE || 3000);
if (process.env.SIM_SALE_RATIO) {
  Engine.CONFIG.REFURB_SALE_RATIO = Number(process.env.SIM_SALE_RATIO);
  console.log('[sim-test] REFURB_SALE_RATIO override: ' + Engine.CONFIG.REFURB_SALE_RATIO);
}

// ------------------------------------------------------------------
// Assertion plumbing
// ------------------------------------------------------------------
var failures = [];
function assert(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error('  FAIL: ' + msg);
  }
  return !!cond;
}
function fatal(msg) {
  console.error('FATAL: ' + msg);
  failures.push(msg);
  finish();
}
function finish() {
  console.log('');
  if (failures.length) {
    console.error('sim-test FAILED with ' + failures.length + ' failure(s):');
    failures.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
  }
  console.log('sim-test PASSED (' + DATA_SOURCE + ', engine v' + Engine.VERSION + ')');
  process.exit(0);
}

// Cross-era trackers
var globals = {
  tasteBonusJobs: 0,
  tasteSampleNotes: null,
  minPerfRejected: false,
  minPerfRejectMsg: '',
  badPayOffer: null,         // §10.2: offer pay must be whole dollars
  badStepsOffer: null,       // §10.1: every offer carries a checklist
  buildsSeen: 0,             // §11.1: generated build offers observed…
  buildWitnessFails: [],     // …and any that were not witness-satisfiable
  osRequestKinds: {},        // §11.4: family/exact/recommendation seen
  multiGpuOffers: 0,         // §12.2: SLI/CF pair requests generated in-era
  ramHeavyOffers: 0,         // §12.2: RAM-maxed contract builds generated
  deviceOffers: 0,           // §12.4: device_repair offers seen in era runs
  deviceOfferBad: null,      //   …first one violating the UI contract/era gate
  deviceRepairsDone: 0,      // §12.4: device jobs completed by the bot
  badCopyToken: null         // §13.3: first unresolved {SW}/{GAME}/... token seen, if any
};

// ------------------------------------------------------------------
// Greedy bot
// ------------------------------------------------------------------
var QUICK_TYPES = { repair: 1, upgrade: 1, software: 1, cleaning: 1, peripheral: 1, callback: 1 };

// The 1983 era is the break-even benchmark (§9.6) and runs at standard speed;
// every other era runs its bench work quick, which statistically guarantees the
// "at least one warranty callback at quick speed" requirement across the run.
function botSpeedFor(job, mem) {
  if (mem.standardOnly) return 'standard';
  return QUICK_TYPES[job.type] ? 'quick' : 'standard';
}

// Track net $ and hours split between customer jobs and refurb flips (§9.6).
function tracked(E, mem, isFlip, fn) {
  var s = E.getState();
  var cashBefore = s.cash, hoursBefore = s.hoursLeft;
  var out = fn();
  var stats = isFlip ? mem.flipStats : mem.jobStats;
  stats.net += E.getState().cash - cashBefore;
  stats.hours += Math.max(0, hoursBefore - E.getState().hoursLeft);
  return out;
}

// §12.2: getBuildCatalog categories[cat] is {slotCount, selected, options}.
function catOptions(catalog, category) {
  var c = (catalog.categories || {})[category];
  return (c && c.options) || [];
}

// Place the engine's own §11.1/§12.2 witness list into the configurator via
// the slot-indexed setBuildPart API, then commit. Returns like tryConfigureBuild.
function applyWitnessBuild(E, job) {
  var w = Engine.Jobs.witnessBuild(E.getState(), job.build);
  if (!w) return 'impossible';
  // Clear any prior picks slot-by-slot
  var catalog = E.getBuildCatalog(job.id);
  Object.keys(catalog.categories || {}).forEach(function (c) {
    var sel = catalog.categories[c].selected || [];
    for (var i = sel.length - 1; i >= 0; i--) {
      if (sel[i] != null) E.setBuildPart(job.id, c, null, i);
    }
  });
  var byCat = {};
  w.partIds.forEach(function (id) {
    var p = Engine.partById(id);
    if (p) (byCat[p.category] = byCat[p.category] || []).push(id);
  });
  if (byCat.motherboard) E.setBuildPart(job.id, 'motherboard', byCat.motherboard[0]);
  Object.keys(byCat).forEach(function (c) {
    if (c === 'motherboard') return;
    byCat[c].forEach(function (id, idx) {
      var r = E.setBuildPart(job.id, c, id, idx);
      if (!r.ok) assert(false, 'witness placement failed (' + c + '[' + idx + ']): ' + r.error);
    });
  });
  var v = E.validateBuild(job.id);
  if (!assert(v.valid && v.meetsTarget,
              'witness list did not validate: ' + (v.problems || []).join('; ')))
    return 'impossible';
  if (v.partsCost > E.getState().cash - 200) return 'wait';
  var r = E.commitBuild(job.id);
  return r.ok ? 'committed' : 'wait';
}

function tryConfigureBuild(E, job) {
  // Returns 'committed' | 'wait' | 'impossible'
  var s = E.getState();
  var mp = job.build.minPerf || {};
  var minStyle = job.build.minStyle || 0;
  // §12.2 multi-part requests go straight to the engine witness
  if (job.build.wantsMultiGpu || job.build.ramHeavy) return applyWitnessBuild(E, job);
  var mobos = catOptions(E.getBuildCatalog(job.id), 'motherboard').slice(0, 8);
  var sawViable = false;
  for (var mi = 0; mi < mobos.length; mi++) {
    E.setBuildPart(job.id, 'motherboard', mobos[mi].partId);
    var catalog = E.getBuildCatalog(job.id);
    function cheapest(category, pred, byStyle) {
      var list = catOptions(catalog, category).filter(function (c) {
        return c.compatible && (!pred || pred(c));
      });
      if (!list.length) return null;
      if (byStyle) list.sort(function (a, b) { return (b.style - a.style) || (a.price - b.price); });
      return list[0];
    }
    var picks = {
      cpu: cheapest('cpu', function (c) { return (c.perf.cpu || 0) >= (mp.cpu || 0); }),
      ram: cheapest('ram', function (c) { return (c.perf.ramMB || 0) >= (mp.ramMB || 0); }),
      storage: cheapest('storage', function (c) { return (c.perf.storageGB || 0) >= (mp.storageGB || 0); }),
      gpu: cheapest('gpu', function (c) { return (c.perf.gpu || 0) >= (mp.gpu || 0); }),
      psu: (function () { // biggest wattage to be safe
        var list = catOptions(catalog, 'psu').filter(function (c) { return c.compatible; });
        list.sort(function (a, b) { return b.watts - a.watts; });
        return list[0] || null;
      })(),
      'case': cheapest('case', null, minStyle > 0),
      os: cheapest('os'),
      cooling: minStyle > 0 ? cheapest('cooling', null, true) : null
    };
    var missing = ['cpu', 'ram', 'storage', 'psu', 'case', 'os'].some(function (c) { return !picks[c]; });
    if (missing) continue;
    Object.keys(picks).forEach(function (c) {
      if (picks[c]) E.setBuildPart(job.id, c, picks[c].partId);
    });
    var v = E.validateBuild(job.id);
    if (!v.valid || !v.meetsTarget) continue;
    sawViable = true;
    if (v.partsCost > s.cash - 200) return 'wait'; // affordable later, maybe
    var r = E.commitBuild(job.id);
    if (r.ok) return 'committed';
    return 'wait'; // hours/cash hiccup — retry tomorrow
  }
  // The engine guaranteed feasibility (§11.1) — lean on its witness if the
  // greedy single-part pass came up short (multi-stick RAM budgets etc.).
  if (!sawViable) {
    var wres = applyWitnessBuild(E, job);
    if (wres !== 'impossible') return wres;
  }
  return sawViable ? 'wait' : 'impossible';
}

// Pick an option for a need: prefer meets && tasteMatch, then meets, cheapest.
// Also opportunistically verifies the below-spec rejection path once (§9.11).
function chooseOption(E, job, need) {
  var meets = need.options.filter(function (o) { return o.meets; });
  if (!meets.length) return null;
  var pick = meets[0]; // cheapest qualifying
  var taste = meets.filter(function (o) { return o.tasteMatch; });
  if (taste.length && taste[0].price <= Math.max(pick.price * 1.6, pick.price + 50)) {
    pick = taste[0];
  }
  if (!globals.minPerfRejected) {
    var below = need.options.filter(function (o) { return !o.meets; })[0];
    if (below) {
      var r = E.assignPart(job.id, need.index, below.partId);
      if (!r.ok && /below the required spec/i.test(r.error || '')) {
        globals.minPerfRejected = true;
        globals.minPerfRejectMsg = r.error;
      }
    }
  }
  return pick;
}

function botDay(E, mem) {
  var s = E.getState();

  // One-off equipment purchases (also satisfies the "one equipment purchase" step)
  var shop = E.getShopView();
  function buyIfWanted(id, reserve) {
    var e = shop.equipment.filter(function (x) { return x.id === id; })[0];
    if (!e || e.owned || !e.available || !e.requiresOwned) return;
    if (E.getState().cash > e.cost + reserve) {
      var r = E.buyEquipment(id);
      if (r.ok) mem.equipmentBought.push(id);
    }
  }
  buyIfWanted('diag-station', 1200);
  buyIfWanted('crt-kit', 1500);
  buyIfWanted('esd-setup', 1400);
  if (s.customBuildsUnlocked) buyIfWanted('build-bench', 1500);

  var ownsCrtKit = E.getState().shop.equipment.indexOf('crt-kit') !== -1;

  // Accept offers (decline CRT work while unprotected)
  var offers = E.getOffers().slice();
  for (var i = 0; i < offers.length; i++) {
    var o = offers[i];
    // §10.2/§10.1 sweeps: integer pay + checklist on every offer (§11.3: the
    // repair phase may still hide in pendingSteps behind the diagnose phase)
    var totalSteps = (o.steps ? o.steps.length : 0) +
                     (o.pendingSteps ? o.pendingSteps.length : 0);
    if (o.pay != null && !Number.isInteger(o.pay) && !globals.badPayOffer)
      globals.badPayOffer = o.title + ' pay=' + o.pay;
    if (totalSteps < 3 && !globals.badStepsOffer)
      globals.badStepsOffer = o.title + ' steps=' + totalSteps;
    // §13.3: fillCopyTokens must leave no literal {SW}/{GAME}/{OFFICE}/{CREATIVE}
    if (!globals.badCopyToken) {
      if (o.title && o.title.indexOf('{') !== -1) globals.badCopyToken = 'title: ' + o.title;
      else if (o.blurb && o.blurb.indexOf('{') !== -1) globals.badCopyToken = 'blurb: ' + o.blurb;
    }
    // §11.1 sweep: every offered build must be witness-satisfiable in budget
    if (o.build) {
      globals.buildsSeen++;
      var wtn = Engine.Jobs.witnessBuild(E.getState(), o.build);
      if (!wtn) globals.buildWitnessFails.push(o.title + ': no witness at all');
      else if (wtn.cost > o.build.budget)
        globals.buildWitnessFails.push(o.title + ': witness ' + wtn.cost +
                                       ' > budget ' + o.build.budget);
    }
    // §11.4 sweep: OS request kinds & label exposure
    if (o.type === 'software' && o.needs.length && o.needs[0].category === 'os') {
      var osn = o.needs[0];
      var kind = osn.osExactId ? 'exact' : (osn.osFamily ? 'family' : 'recommendation');
      globals.osRequestKinds[kind] = (globals.osRequestKinds[kind] || 0) + 1;
      if (!o.osRequest && !globals.badStepsOffer)
        globals.badStepsOffer = o.title + ' missing osRequest label';
    }
    // §12.2 sweep: multi-part build request flavors
    if (o.build && o.build.wantsMultiGpu) globals.multiGpuOffers++;
    if (o.build && o.build.ramHeavy) globals.ramHeavyOffers++;
    // §12.4 sweep: device jobs expose the UI contract & honor era gates
    if (o.type === 'device_repair') {
      globals.deviceOffers++;
      var yNow = E.dateInfo(E.getState().day).y;
      if (!globals.deviceOfferBad) {
        if (!o.device || !o.device.name || !o.device.kind || !o.device.year)
          globals.deviceOfferBad = o.title + ': job.device incomplete';
        else if (o.device.kind === 'apple' && yNow < 1985)
          globals.deviceOfferBad = o.title + ': apple job before 1985';
        else if (o.device.kind !== 'apple' && yNow < 2009)
          globals.deviceOfferBad = o.title + ': mobile job before 2009';
        else if (o.pay <= 0 || !Number.isInteger(o.pay))
          globals.deviceOfferBad = o.title + ': bad pay ' + o.pay;
      }
    }
    if (o.crt && !ownsCrtKit) { E.declineOffer(o.id); continue; }
    // Benchmark-era bot skips sub-$20 cleaning gigs — bench time goes to repairs
    if (mem.standardOnly && o.type === 'cleaning') { E.declineOffer(o.id); continue; }
    // The flip-metric run splits its day with refurbs: keep the job side at the
    // workstation count so the $/h comparison isn't polluted by deadline misses.
    if (mem.multiFlip) {
      var slotsNow = Engine.tierInfo(E.getState()).workstationSlots;
      var busyNow = E.getActiveJobs().filter(function (j) {
        return j.type !== 'refurb';
      }).length;
      if (busyNow >= slotsNow) break;
    }
    var res = E.acceptOffer(o.id);
    if (!res.ok) break; // workstations full
  }

  // Refurb flips: the metric run flips repeatedly (one machine at a time) so
  // §9.6 has a real sample; other runs do one flip.
  var hasRefurb = E.getActiveJobs().some(function (j) { return j.type === 'refurb'; });
  var wantsFlip = mem.multiFlip ? mem.flipsStarted < 6 : !mem.refurbBought;
  if (!hasRefurb && wantsFlip) {
    // Value-aware pick: compute the exact expected flip margin from visible
    // info (part prices, ask, fault slot); take the FIRST listing clearing the
    // bar rather than the juiciest — max-margin picking amplifies tail luck.
    var C = E.getConfig();
    var year = E.dateInfo(E.getState().day).y;
    var best = null;
    E.getAsIsMarket().forEach(function (m) {
      if (best) return;
      if (E.getState().cash <= m.askPrice + 600) return;
      var v = Engine.Jobs.machinePartsValue(E.getState(), m);
      var replCost = 0;
      if (m.faultPartIdx != null) {
        var dead = Engine.partById(m.partIds[m.faultPartIdx]);
        if (dead) {
          var cheapestRepl = Engine.Jobs.purchasableByCategory(E.getState(), dead.category)
            .map(function (p) { return Engine.Pricing.priceOf(p, E.getState(), { buy: true }); })
            .sort(function (a, b) { return a - b; })[0];
          replCost = cheapestRepl || 150;
        }
      }
      var margin = C.REFURB_SALE_RATIO * v +
                   Engine.laborRate(year) * C.REFURB_PREMIUM_HOURS -
                   m.askPrice - replCost;
      if (margin >= 150) best = m;
    });
    if (best) {
      var rr = tracked(E, mem, true, function () { return E.buyAsIsMachine(best.id); });
      if (rr.ok) {
        mem.refurbBought = true; mem.flipsStarted++;
        if (process.env.SIM_DEBUG) console.log('      [flip] day ' + mem.day +
          ' bought "' + best.name + '" ask ' + best.askPrice);
      }
    }
  }

  // Work everything until the day is spent
  var guard = 0, progress = true;
  while (progress && guard++ < 300) {
    progress = false;
    var active = E.getActiveJobs().slice();
    for (var j = 0; j < active.length; j++) {
      var job = active[j];
      var st = E.getState();
      if (st.hoursLeft < 0.5) break;   // the bot itself does not chase overtime
      var isFlip = job.type === 'refurb';
      if (process.env.SIM_DEBUG && isFlip && guard <= 2) {
        var cur = job.steps && job.steps[job.stepIndex];
        console.log('      [rj] day ' + mem.day + ' j' + job.id + ' st=' + job.status +
          ' diag=' + !!job.diagnosed + ' step ' + job.stepIndex + '/' +
          (job.steps ? job.steps.length : '-') + ' pend=' +
          (job.pendingSteps ? job.pendingSteps.length : 0) +
          (cur ? ' cur="' + cur.label + '" kind=' + cur.kind + ' run=' + !!cur.running +
                 ' prog=' + Engine.round2(cur.progress || 0) : ''));
      }
      if (isFlip && job.status === 'done') {
        var sold = tracked(E, mem, true, function () { return E.sellRefurb(job.id); });
        if (sold.ok) {
          mem.refurbsSold++; progress = true;
          if (process.env.SIM_DEBUG) console.log('      [flip] day ' + mem.day +
            ' sold "' + job.title + '" for ' + (sold.price || sold.amount || '?') +
            ' | flipStats net ' + Engine.round2(mem.flipStats.net) +
            ' h ' + Engine.round2(mem.flipStats.hours));
        }
        continue;
      }
      E.setJobSpeed(job.id, botSpeedFor(job, mem));
      if (job.needsDiagnosis && !job.diagnosed) {
        var dr = tracked(E, mem, isFlip, function () { return E.diagnoseJob(job.id); });
        if (dr.ok) progress = true;
        continue;
      }
      if (job.build && !job.build.committed) {
        var bc = tracked(E, mem, false, function () { return tryConfigureBuild(E, job); });
        if (bc === 'committed') { progress = true; }
        else if (bc === 'impossible') { E.abandonJob(job.id); progress = true; }
        continue;
      }
      // Assign missing parts (§10.3)
      var needs = E.getJobNeeds(job.id);
      var blocked = false;
      for (var n = 0; n < needs.length; n++) {
        var need = needs[n];
        if (need.filled >= need.qty) continue;
        var opt = chooseOption(E, job, need);
        if (!opt) {
          if (process.env.SIM_DEBUG && isFlip) {
            console.log('      [stuck] day ' + mem.day + ' job ' + job.id +
              ' need#' + need.index + ' "' + need.name + '" cat=' + need.category +
              ' opts=' + need.options.length + ' meets=' +
              need.options.filter(function (o) { return o.meets; }).length +
              (need.options[0] ? ' first="' + need.options[0].name + '" problem=' +
                (need.options[0].problem || 'none') + ' price=' + need.options[0].price : ''));
          }
          blocked = true; continue;
        }
        if (opt.source === 'market' && opt.price > E.getState().cash - 200) { blocked = true; continue; }
        var ir = tracked(E, mem, isFlip, function () {
          return E.assignPart(job.id, need.index, opt.partId);
        });
        if (ir.ok && (ir.filledNow > 0 || ir.mishap)) progress = true;
        if (!ir.ok) blocked = true;
      }
      var w = tracked(E, mem, isFlip, function () { return E.workJob(job.id); });
      if (w.ok && (w.hoursSpent > 0 || w.completed)) progress = true;
      if (w.ok && w.completed && job.type === 'device_repair') globals.deviceRepairsDone++;
      if (w.ok && w.completed && w.result && w.result.tasteMatched) {
        globals.tasteBonusJobs++;
        if (!globals.tasteSampleNotes) globals.tasteSampleNotes = (w.result.notes || []).join(' | ');
      }
      if (blocked) continue;
    }
    // §11.6: if everything is parked on running waits and bench time remains,
    // sit an hour out — completions (and payouts) then land inside the tracked
    // windows instead of overnight, keeping the §9.6 metric honest.
    if (!progress && E.getState().hoursLeft >= 1) {
      var waiting = E.getActiveJobs().filter(function (jw) {
        return jw.steps && jw.stepIndex < jw.steps.length &&
               jw.steps[jw.stepIndex].kind === 'wait' &&
               jw.steps[jw.stepIndex].running;
      });
      if (waiting.length) {
        var flipWaitOnly = waiting.every(function (jw) { return jw.type === 'refurb'; });
        var wh = tracked(E, mem, flipWaitOnly, function () { return E.waitHour(); });
        if (wh.ok) progress = true;
      }
    }
  }
}

// ------------------------------------------------------------------
// Per-era run
// ------------------------------------------------------------------
function runEra(era, idx, metricRun) {
  console.log('--- Era ' + era.id + (metricRun ? ' [flip-metric run]' : '') +
              ' (' + (era.name || '') + ') ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Test Bench', seed: SEED_BASE + idx * 77 });
  if (!assert(r.ok, era.id + ': newGame failed: ' + (r.error || ''))) return null;

  var mem = {
    equipmentBought: [], refurbBought: false, refurbsSold: 0, flipsStarted: 0,
    standardOnly: era.startYear === 1983,
    multiFlip: !!metricRun,     // the §9.6 metric run flips repeatedly
    jobStats: { net: 0, hours: 0 },
    flipStats: { net: 0, hours: 0 }
  };
  var sawRentCharge = false, offerCount = E.getOffers().length;
  var offersGenerated = 0;   // §11.2: overnight batches only, for the mean check
  var threw = null;
  var otCap = E.getConfig().overtimeCap;
  // v0.4b regression guard: the as-is market must stay stocked in every era
  var asisNonEmptyDays = 0, asisDaysRun = 0, asisIdAtDay5 = null;

  for (var day = 0; day < 40; day++) {
    try {
      mem.day = day;
      botDay(E, mem);
      var res = E.endDay();
      asisDaysRun++;
      if (E.getAsIsMarket().length > 0) asisNonEmptyDays++;
      if (day === 5) asisIdAtDay5 = E.getState().asIsNextId;
      if (!assert(res.ok, era.id + ': endDay failed on day ' + day + ': ' + (res.error || ''))) break;
      var sum = res.summary;
      assert(typeof sum.dateStr === 'string' && sum.dateStr.length > 5,
             era.id + ': summary.dateStr malformed');
      offerCount += sum.newOffers.length;
      offersGenerated += sum.newOffers.length;
      sum.charges.forEach(function (c) { if (/^Rent/.test(c.label)) sawRentCharge = true; });
      var st = E.getState();
      assert(isFinite(st.cash), era.id + ': cash not finite on day ' + day);
      assert(st.hoursLeft >= -otCap, era.id + ': hoursLeft broke the overtime floor on day ' + day);
      if (day % 10 === 0) {
        var market = E.getMarket();
        assert(market.length > 0, era.id + ': empty market on day ' + day);
        var badPrice = market.filter(function (m) { return !(m.price > 0) || !isFinite(m.price); });
        assert(badPrice.length === 0, era.id + ': non-positive/infinite prices: ' +
               badPrice.slice(0, 3).map(function (m) { return m.partId; }).join(','));
      }
      if (st.flags.gameOver) break;
    } catch (e) {
      threw = e;
      break;
    }
  }
  assert(!threw, era.id + ': exception thrown: ' + (threw && threw.stack));

  var s = E.getState();
  // v0.4b regression guard (§9.5/§12.3): as-is market alive all era long —
  // non-empty on >=50% of days, with at least one fresh arrival after day 5.
  assert(asisNonEmptyDays >= Math.ceil(asisDaysRun * 0.5),
         era.id + ': as-is market empty too often (' + asisNonEmptyDays + '/' +
         asisDaysRun + ' days stocked)');
  assert(asisIdAtDay5 != null && s.asIsNextId > asisIdAtDay5,
         era.id + ': no as-is arrival after day 5 (ids ' + asisIdAtDay5 +
         ' -> ' + s.asIsNextId + ')');
  assert(offerCount > 0, era.id + ': no offers generated');
  assert(s.reputation.jobsCompleted >= 1, era.id + ': no job completed in 40 days');
  assert(sawRentCharge || s.ledger.months.length >= 2,
         era.id + ': monthly billing never fired');
  assert(mem.equipmentBought.length >= 1, era.id + ': bot never bought equipment');
  assert(!s.flags.gameOver, era.id + ': went bankrupt during the sim');

  // Wiki sanity (§9.7)
  var wiki = E.getWiki({});
  assert(wiki.length > 0, era.id + ': empty wiki');
  var wikiBad = wiki.filter(function (w) {
    return !w.tagLabels || w.tagLabels.length !== w.tags.length ||
           ['new', 'current', 'fading', 'legacy', 'scarce'].indexOf(w.status) === -1;
  });
  assert(wikiBad.length === 0, era.id + ': malformed wiki entries: ' +
         wikiBad.slice(0, 3).map(function (w) { return w.partId; }).join(','));

  // Save round-trip must be byte-identical (v3 saves)
  var s1 = E.exportSave();
  var imp = E.importSave(s1);
  assert(imp.ok, era.id + ': importSave failed: ' + (imp.error || ''));
  var s2 = E.exportSave();
  assert(s1 === s2, era.id + ': save round-trip not byte-identical');

  // 1983 balance sanity band (§9.6: final cash $2k-$10k) — asserted on the
  // canonical single-flip greedy bot against the REAL catalog. The §9.6
  // balance targets are catalog-tuned; the tiny mock only verifies mechanics.
  if (era.startYear === 1983 && !metricRun && REAL()) {
    assert(s.cash >= 2000 && s.cash <= 10000,
           era.id + ': final cash ' + s.cash + ' outside sanity band [2000, 10000]');
  }
  // §11.2: ramp-down — the 1983 40-day mean stays at or under 3.6 offers/day
  if (era.startYear === 1983 && !metricRun) {
    var meanOffers = offersGenerated / 40;
    console.log('    offers/day mean: ' + meanOffers.toFixed(2));
    assert(meanOffers <= 3.6,
           era.id + ': offer ramp too fast — mean ' + meanOffers.toFixed(2) + '/day > 3.6');
  }

  var pendingCallbacks = s.jobs.completedRecent.filter(function (e) { return e.fired; }).length;
  var line = {
    eraId: era.id, startYear: era.startYear,
    cash: s.cash, jobsDone: s.reputation.jobsCompleted,
    jobsFailed: s.reputation.jobsFailed,
    rating: s.reputation.rating,
    builds: s.ledger.lifetime.buildsDelivered,
    refurbsSold: s.ledger.lifetime.refurbsSold,
    callbacksArrived: s.reputation.callbacks,
    callbacksPending: pendingCallbacks,
    mem: mem
  };
  console.log('  ' + era.id + ': cash ' + Engine.fmtMoney(line.cash) +
    ' | jobs ' + line.jobsDone + ' (failed ' + line.jobsFailed + ')' +
    ' | rating ' + line.rating.toFixed(2) +
    ' | builds ' + line.builds + ' | refurbs ' + line.refurbsSold +
    ' | callbacks ' + line.callbacksArrived + '+' + line.callbacksPending + ' pending');
  var lt = s.ledger.lifetime;
  console.log('    ledger: revenue ' + Engine.fmtMoney(lt.revenue) +
    ' | parts ' + Engine.fmtMoney(lt.partsCost) +
    ' | fixed ' + Engine.fmtMoney(lt.fixedCosts) +
    ' | other ' + Engine.fmtMoney(lt.other));

  // §9.6: jobs vs flips $/labor-hour — asserted on the dedicated metric run
  if (era.startYear === 1983 && metricRun) {
    var js = mem.jobStats, fsRaw = mem.flipStats;
    var jobRate = js.hours > 0 ? js.net / js.hours : 0;
    var flipRate = fsRaw.hours > 0 ? fsRaw.net / fsRaw.hours : 0;
    var ratio = jobRate > 0 ? flipRate / jobRate : 0;
    console.log('    jobs-vs-flips: jobs ' + Engine.fmtMoney(jobRate) + '/h (' +
      Engine.round2(js.hours) + 'h), flips ' + Engine.fmtMoney(flipRate) + '/h (' +
      Engine.round2(fsRaw.hours) + 'h, ' + mem.refurbsSold + ' sold) — ratio ' +
      ratio.toFixed(2) + 'x');
    assert(mem.refurbsSold >= 2, era.id + ': too few flips completed to measure (' +
           mem.refurbsSold + ')');
    if (REAL()) {
      assert(ratio >= 1.2 && ratio <= 1.8,
             era.id + ': flips/jobs $-per-hour ratio ' + ratio.toFixed(2) +
             ' outside [1.2, 1.8]');
    } else {
      console.log('    (ratio asserted against the real catalog only — mock verifies mechanics)');
    }
  }
  return line;
}

// ------------------------------------------------------------------
// Scenario (§14.1): no generated upgrade job ever demands a downgrade —
// minPerf on the upgraded metric must exceed the ORIGINAL part's metric,
// audited across a lightweight 60-day/every-era offer-generation sweep
// (separate from the tuned 40-day economy runs above).
// ------------------------------------------------------------------
function upgradeNoDowngradeScenario() {
  console.log('--- Upgrade jobs never demand a downgrade (§14.1) ---');
  var checked = 0, worstBad = null;
  DATA.ERAS.forEach(function (era, idx) {
    var r = Engine.newGame({ eraId: era.id, shopName: 'Upgrade Audit', seed: 90000 + idx * 13 });
    if (!r.ok) return;
    for (var day = 0; day < 60; day++) {
      var offers = Engine.getOffers();
      for (var i = 0; i < offers.length; i++) {
        var o = offers[i];
        if (o.type !== 'upgrade' || !o.needs || !o.needs.length) continue;
        var need = o.needs[0];
        checked++;
        if (!need.minPerf) {
          worstBad = worstBad || (o.title + ': no minPerf set on the upgrade need');
          continue;
        }
        var key = Object.keys(need.minPerf)[0];
        var orig = need.originalPartId ? Engine.partById(need.originalPartId) : null;
        var origVal = orig ? ((orig.perf || {})[key] || 0) : 0;
        if (need.minPerf[key] <= origVal) {
          worstBad = worstBad || (o.title + ': minPerf.' + key + ' ' + need.minPerf[key] +
            ' <= original ' + origVal + ' (' + (orig ? orig.name : 'no original part') + ')');
        }
      }
      var res = Engine.endDay();
      if (!res.ok || Engine.getState().flags.gameOver) break;
    }
  });
  assert(checked > 0, 'no upgrade offers were generated across the 60-day multi-era audit');
  assert(worstBad == null, 'an upgrade job demanded a downgrade: ' + worstBad);
  console.log('  audited ' + checked + ' upgrade-job need snapshots across ' +
              DATA.ERAS.length + ' eras / 60 days — no downgrades found');
}

// ------------------------------------------------------------------
// Scenario: compatibility rejection with readable problem string
// ------------------------------------------------------------------
function compatScenario() {
  console.log('--- Compatibility validation ---');
  var anyCpu = DATA.PARTS.filter(function (p) { return p.category === 'cpu'; })[0];
  var v0 = Engine.validatePartList([anyCpu.id]);
  assert(v0.valid === false && v0.problems.length > 0 &&
         v0.problems.join(' ').indexOf('No motherboard') !== -1,
         'validatePartList without motherboard should complain readably');
  var mobos = DATA.PARTS.filter(function (p) { return p.category === 'motherboard'; });
  var cpus = DATA.PARTS.filter(function (p) { return p.category === 'cpu'; });
  var pair = null;
  outer:
  for (var i = 0; i < mobos.length; i++) {
    for (var j = 0; j < cpus.length; j++) {
      if (!Engine.Compat.fits(cpus[j], mobos[i]).fits) { pair = [cpus[j], mobos[i]]; break outer; }
    }
  }
  if (assert(!!pair, 'catalog should contain at least one incompatible cpu/board pair')) {
    var v = Engine.validatePartList([pair[0].id, pair[1].id]);
    assert(v.valid === false, 'mismatched part list must be invalid');
    var hasSocketMsg = v.problems.some(function (p) {
      return p.indexOf('not on motherboard') !== -1;
    });
    assert(hasSocketMsg, 'expected a readable socket-mismatch problem, got: ' +
           JSON.stringify(v.problems));
    console.log('  rejected "' + pair[0].name + '" on "' + pair[1].name + '": ' +
                v.problems[0]);
  }
}

// ------------------------------------------------------------------
// Scenario: 1983 start has builds locked until 1989-09-01
// ------------------------------------------------------------------
function unlockScenario(era1983) {
  console.log('--- Custom-build unlock (1983 fast-forward) ---');
  var r = Engine.newGame({ eraId: era1983.id, shopName: 'Unlock Test', seed: 424242 });
  if (!assert(r.ok, 'unlock scenario: newGame failed')) return;
  var s = Engine.getState();
  assert(s.customBuildsUnlocked === false, '1983 must start with builds locked');
  s.cash = 10000000; // debug fast-forward: keep the lights on while idle
  var unlockISO = DATA.CUSTOM_BUILD_UNLOCK_DATE || '1989-09-01';
  var ok = true, buildOfferPreUnlock = false;
  for (var i = 0; i < 3000; i++) {
    var res = Engine.endDay();
    if (!res.ok) { assert(false, 'unlock scenario: endDay failed: ' + res.error); return; }
    s = Engine.getState();
    var iso = Engine.dateInfo(s.day).iso;
    if (iso < unlockISO) {
      if (s.customBuildsUnlocked) { ok = false; break; }
      if (Engine.getOffers().some(function (o) { return o.type === 'build'; }))
        buildOfferPreUnlock = true;
    } else {
      assert(s.customBuildsUnlocked === true,
             'builds still locked on ' + iso + ' (unlock date ' + unlockISO + ')');
      break;
    }
  }
  assert(ok, 'builds unlocked before ' + unlockISO);
  assert(!buildOfferPreUnlock, 'a build offer appeared before the unlock date');
  var finalIso = Engine.dateInfo(Engine.getState().day).iso;
  assert(finalIso >= unlockISO, 'fast-forward never reached the unlock date (' + finalIso + ')');
  console.log('  locked through ' + unlockISO + ', unlocked on schedule (reached ' + finalIso + ')');
}

// ------------------------------------------------------------------
// Scenario (§9.4): overtime borrow works and floors at -overtimeCap
// ------------------------------------------------------------------
function overtimeScenario(era) {
  console.log('--- Overtime (§9.4) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'OT Test', seed: 51515 });
  if (!assert(r.ok, 'overtime: newGame failed')) return;
  var cap = E.getConfig().overtimeCap;
  assert(cap === 3, 'CONFIG.overtimeCap must be 3, got ' + cap);
  var job = null;
  for (var d = 0; d < 12 && !job; d++) {
    var offers = E.getOffers().slice();
    for (var i = 0; i < offers.length; i++) {
      if (offers[i].type === 'repair' && !offers[i].rush) {
        if (E.acceptOffer(offers[i].id).ok) {
          job = E.getActiveJobs().filter(function (j) { return j.id === offers[i].id; })[0];
          break;
        }
      }
    }
    if (!job) E.endDay();
  }
  if (!assert(!!job, 'overtime: no repair offer arrived in 12 days')) return;
  var s = E.getState();
  s.hoursLeft = 0.2;   // debug poke: nearly out of hours
  var dr = E.diagnoseJob(job.id);   // costs 1h (no diag station owned)
  assert(dr.ok, 'overtime: diagnose with 0.2h left should borrow into overtime, got: ' + (dr.error || ''));
  assert(s.hoursLeft < 0 && s.hoursLeft >= -cap,
         'overtime: hoursLeft should be negative within the cap, got ' + s.hoursLeft);
  s.hoursLeft = -2.9;
  s.supplyRunDoneToday = false;
  var anyPart = E.getMarket()[0];
  var br = E.buyPart(anyPart.partId, 1);   // needs a 0.5h supply run -> -3.4 < -3
  assert(!br.ok && /exhausted/i.test(br.error || ''),
         'overtime: floor-breaking action should be refused with the exhaustion message, got: ' +
         JSON.stringify(br));
  s.hoursLeft = -cap;
  var res = E.endDay();
  assert(res.ok, 'overtime: endDay failed');
  var morning = E.getState().hoursLeft;
  assert(res.summary.overtimeNote != null && /overtime/i.test(res.summary.overtimeNote),
         'overtime: morning summary should note the overtime');
  if (!res.summary.skippedSunday) {
    assert(morning === Math.max(5, 8 - cap),
           'overtime: morning hours should be ' + Math.max(5, 8 - cap) + ', got ' + morning);
  }
  console.log('  borrow ok, floor refused, morning=' + morning + 'h, note: "' +
              res.summary.overtimeNote + '"');
}

// ------------------------------------------------------------------
// Scenario (§9.5): stripRefurb yields inventory parts
// ------------------------------------------------------------------
function stripScenario(era) {
  console.log('--- Strip for parts (§9.5) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Strip Test', seed: 62626 });
  if (!assert(r.ok, 'strip: newGame failed')) return;
  var s = E.getState();
  s.cash = 100000; // debug: affordability is not under test here
  var listing = E.getAsIsMarket()[0];
  if (!assert(!!listing, 'strip: no as-is listings seeded at newGame')) return;
  assert(typeof listing.specSummary === 'string' && listing.specSummary.length > 3,
         'strip: listing lacks a specSummary');
  var buy = E.buyAsIsMachine(listing.id);
  if (!assert(buy.ok, 'strip: buyAsIsMachine failed: ' + (buy.error || ''))) return;
  var parts = E.getMachineParts(buy.jobId);
  assert(parts.length >= 4, 'strip: getMachineParts returned too few parts');
  // §10.4 knowledge model: EVERYTHING unknown before diagnosis (the v0.2 bug)
  var notUnknown = parts.filter(function (p) { return p.status !== 'unknown'; });
  assert(notUnknown.length === 0,
         'strip: all statuses must be "unknown" before diagnosis, got ' +
         JSON.stringify(parts.map(function (p) { return p.status; })));
  var invBefore = E.getState().inventory.reduce(function (a, e) { return a + e.qty; }, 0);
  var hoursBefore = E.getState().hoursLeft;
  var sr = E.stripRefurb(buy.jobId);
  if (!assert(sr.ok, 'strip: stripRefurb failed: ' + (sr.error || ''))) return;
  assert(sr.hoursSpent === 1.5 && Engine.round2(hoursBefore - E.getState().hoursLeft) === 1.5,
         'strip: should cost exactly 1.5h with no staff');
  var invAfter = E.getState().inventory.reduce(function (a, e) { return a + e.qty; }, 0);
  assert(sr.recovered.length >= 1, 'strip: nothing recovered (survival roll bug?)');
  assert(invAfter - invBefore === sr.recovered.length,
         'strip: inventory delta ' + (invAfter - invBefore) + ' != recovered ' + sr.recovered.length);
  assert(!E.getActiveJobs().some(function (j) { return j.id === buy.jobId; }),
         'strip: job should be removed');
  console.log('  all-unknown before diagnosis ok; recovered ' + sr.recovered.length +
              ' part(s), lost ' + sr.lost.length + ', 1.5h spent');
}

// ------------------------------------------------------------------
// Scenario (§10.1): steps drive completion exactly
// ------------------------------------------------------------------
function stepScenario(era) {
  console.log('--- Step checklist (§10.1/§10.3) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Step Test', seed: 91919 });
  if (!assert(r.ok, 'steps: newGame failed')) return;
  E.getState().cash = 100000;
  // Find a part-fault repair job
  var job = null;
  for (var d = 0; d < 25 && !job; d++) {
    var offers = E.getOffers().slice();
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      if (o.type !== 'repair' || o.rush || o.crt) continue;
      if (E.acceptOffer(o.id).ok) {
        var cand = E.getActiveJobs().filter(function (j) { return j.id === o.id; })[0];
        E.getState().hoursLeft = 8;   // debug: plenty of bench time
        var dg = E.diagnoseJob(cand.id);
        var hasWait = cand.steps.concat(cand.pendingSteps || []).some(function (st) {
          return st.kind === 'wait';
        });
        if (dg.ok && dg.fault.partCategory && !hasWait) { job = cand; break; }
        E.abandonJob(cand.id);   // wait steps get their own scenario (§11.6)
      }
    }
    if (!job) E.endDay();
  }
  if (!assert(!!job, 'steps: no part-fault repair found in 25 days')) return;
  assert(job.steps.length >= 3, 'steps: repair checklist too short');
  job.steps.forEach(function (st) {
    assert(st.progress >= 0 && st.progress <= 1, 'steps: progress out of [0,1]');
  });
  // Work until the unassigned install step blocks
  E.getState().hoursLeft = 8;
  var blockedErr = null, guard = 0;
  while (guard++ < 20) {
    var w = E.workJob(job.id, 0.5);
    if (!w.ok) { blockedErr = w.error; break; }
    if (w.completed) break;
  }
  assert(blockedErr != null && /assign/i.test(blockedErr),
         'steps: expected an /assign/i block at the install step, got: ' + blockedErr);
  assert(!job.steps[job.stepIndex].done && job.steps[job.stepIndex].needIndex === 0,
         'steps: block should sit on the install step');
  // Assign, then verify completion lands exactly when the checklist is done
  var needs = E.getJobNeeds(job.id);
  var opt = needs[0].options.filter(function (o2) { return o2.meets; })[0];
  if (!assert(!!opt, 'steps: no assignable option')) return;
  var ar = E.assignPart(job.id, 0, opt.partId);
  while (ar.ok && ar.mishap && needs[0].qty > (ar.filled || 0)) {
    ar = E.assignPart(job.id, 0, opt.partId);   // re-source after an ESD zap
  }
  assert(ar.ok, 'steps: assign failed: ' + (ar.error || ''));
  assert(needs[0].replaces == null || typeof needs[0].replaces.value === 'number',
         'steps: replaces info malformed');
  var remainingStd = Engine.round2(job.hoursRequired - job.hoursDone);
  var spent = 0, completed = false;
  E.getState().hoursLeft = 8;
  guard = 0;
  while (guard++ < 40 && !completed) {
    if (E.getState().hoursLeft < 1) E.getState().hoursLeft = 8;   // debug refill
    var w2 = E.workJob(job.id, 0.5);
    if (!assert(w2.ok, 'steps: work failed: ' + (w2.error || ''))) return;
    spent += w2.hoursSpent;
    completed = w2.completed;
    if (!completed) {
      assert(spent < remainingStd + 0.5,
             'steps: job should have completed by ' + remainingStd + 'h, spent ' + spent);
    }
  }
  assert(completed, 'steps: never completed');
  assert(Math.abs(spent - remainingStd) <= 0.5 + 1e-9,
         'steps: completion at ' + spent + 'h vs checklist sum ' + remainingStd + 'h');
  assert(job.steps.every(function (st) { return st.done; }), 'steps: not all steps done');
  console.log('  blocked at install until assigned; completed at ' + spent +
              'h vs checklist ' + remainingStd + 'h');
}

// ------------------------------------------------------------------
// Scenario (§10.3): assign -> unassign -> reassign preserves inventory
// ------------------------------------------------------------------
function assignScenario(era) {
  console.log('--- Assign / unassign (§10.3) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Assign Test', seed: 24242 });
  if (!assert(r.ok, 'assign: newGame failed')) return;
  E.getState().cash = 100000;
  var job = null;
  for (var d = 0; d < 20 && !job; d++) {
    var offers = E.getOffers().slice();
    for (var i = 0; i < offers.length; i++) {
      if (offers[i].type === 'upgrade' && E.acceptOffer(offers[i].id).ok) {
        job = E.getActiveJobs().filter(function (j) { return j.id === offers[i].id; })[0];
        break;
      }
    }
    if (!job) E.endDay();
  }
  if (!assert(!!job, 'assign: no upgrade offer in 20 days')) return;
  var needs = E.getJobNeeds(job.id);
  var opt = needs[0].options.filter(function (o) { return o.meets; })[0];
  if (!assert(!!opt, 'assign: no viable option')) return;
  var pid = opt.partId;
  function invQty() {
    var e = E.getState().inventory.filter(function (x) { return x.partId === pid; })[0];
    return e ? e.qty : 0;
  }
  // Order & assign (market)
  var a1 = E.assignPart(job.id, 0, pid);
  var guard = 0;
  while (a1.ok && a1.mishap && a1.filled < 1 && guard++ < 8) a1 = E.assignPart(job.id, 0, pid);
  if (!assert(a1.ok && needs[0].qty >= 1, 'assign: order+assign failed: ' + (a1.error || ''))) return;
  var view1 = E.getJobNeeds(job.id)[0];
  assert(view1.assigned.length === 1 && view1.assigned[0].source === 'ordered',
         'assign: assigned[] should show one "ordered" entry, got ' + JSON.stringify(view1.assigned));
  assert(invQty() === 0, 'assign: ordered part should not sit in inventory');
  // Unassign -> part returns to inventory
  var u1 = E.unassignPart(job.id, 0);
  assert(u1.ok && u1.returned === pid, 'assign: unassign failed: ' + (u1.error || ''));
  assert(invQty() === 1, 'assign: unassigned part should be in inventory');
  var basis = E.getState().inventory.filter(function (x) { return x.partId === pid; })[0].avgCost;
  // Reassign from stock
  var a2 = E.assignPart(job.id, 0, pid);
  guard = 0;
  while (a2.ok && a2.mishap && a2.filled < 1 && guard++ < 8) a2 = E.assignPart(job.id, 0, pid);
  if (!assert(a2.ok, 'assign: reassign failed')) return;
  var view2 = E.getJobNeeds(job.id)[0];
  assert(view2.assigned.length === 1 && view2.assigned[0].source === 'stock',
         'assign: reassigned entry should be "stock", got ' + JSON.stringify(view2.assigned));
  assert(invQty() === 0, 'assign: stock part should leave inventory when assigned');
  // Round-trip back out: inventory + basis preserved
  var u2 = E.unassignPart(job.id, 0);
  assert(u2.ok && invQty() === 1, 'assign: second unassign failed');
  var basis2 = E.getState().inventory.filter(function (x) { return x.partId === pid; })[0].avgCost;
  assert(Math.abs(basis - basis2) < 0.01,
         'assign: inventory cost basis drifted (' + basis + ' -> ' + basis2 + ')');
  // §14.1: a part below the (now strictly-greater-than-original) minPerf must
  // be rejected readably — this is also, by construction, a below-original part.
  var below = needs[0].options.filter(function (o) { return !o.meets; })[0];
  var downgradeMsg = null;
  if (below) {
    var rBelow = E.assignPart(job.id, 0, below.partId);
    assert(!rBelow.ok && /below the required spec/i.test(rBelow.error || ''),
           'assign: expected a readable downgrade rejection, got: ' + JSON.stringify(rBelow));
    downgradeMsg = rBelow.error;
  }
  // Deprecated alias still works
  var a3 = E.installPart(job.id, 0, pid);
  assert(a3.ok, 'assign: deprecated installPart alias broken');
  console.log('  order/assign/unassign/reassign round-trip ok, basis stable at ' +
              Engine.fmtMoney(basis2) +
              (downgradeMsg ? ' | §14.1 downgrade rejection: "' + downgradeMsg + '"' : ''));
}

// ------------------------------------------------------------------
// Scenario (§10.4): overspend penalty fires & is waived
// ------------------------------------------------------------------
function overspendScenario(era) {
  console.log('--- Overspend (§10.4) ---');
  var E = Engine;
  function runOnce(seed, waive) {
    var r = E.newGame({ eraId: era.id, shopName: 'Overspend Test', seed: seed });
    if (!assert(r.ok, 'overspend: newGame failed')) return null;
    E.getState().cash = 200000;
    var job = null;
    for (var d = 0; d < 25 && !job; d++) {
      var offers = E.getOffers().slice();
      for (var i = 0; i < offers.length; i++) {
        var o = offers[i];
        if (o.type === 'upgrade' && o.machine && !o.rush && E.acceptOffer(o.id).ok) {
          job = E.getActiveJobs().filter(function (j) { return j.id === o.id; })[0];
          break;
        }
      }
      if (!job) E.endDay();
    }
    if (!assert(!!job, 'overspend: no machine-backed upgrade in 25 days')) return null;
    // Force a wide value gap: pretend the original was the cheapest of the
    // category, and lift the machine-fit constraint so the full price range of
    // the category is on the table (mechanics test, not a compat test).
    var need = job.needs[0];
    need.anyOfTags = null;
    var cheap = Engine.Jobs.purchasableByCategory(E.getState(), need.category)
      .sort(function (a, b) {
        return Engine.Pricing.priceOf(a, E.getState()) - Engine.Pricing.priceOf(b, E.getState());
      })[0];
    need.originalPartId = cheap.id;
    var needsView = E.getJobNeeds(job.id)[0];
    var pricey = needsView.options.filter(function (o) { return o.meets && o.overspend; })
      .sort(function (a, b) { return b.price - a.price; })[0];
    if (!assert(!!pricey, 'overspend: no option flagged overspend even vs cheapest original')) return null;
    if (waive) {
      var pPart = Engine.partById(pricey.partId);
      job.taste = { brand: pPart.brand || 'ValuTech', category: pPart.category,
                    bonusPct: 10, label: 'Fan of ' + (pPart.brand || 'it') };
    } else {
      job.taste = null;
    }
    var a = E.assignPart(job.id, 0, pricey.partId);
    var guard = 0;
    while (a.ok && a.mishap && a.filled < 1 && guard++ < 8) a = E.assignPart(job.id, 0, pricey.partId);
    if (!assert(a.ok, 'overspend: assign failed: ' + (a.error || ''))) return null;
    var res = null, guard2 = 0;
    while (guard2++ < 40) {
      E.getState().hoursLeft = 8;
      var w = E.workJob(job.id);
      if (w.ok && w.completed) { res = w.result; break; }
      if (job.result) { res = job.result; break; }   // completed via a wait tick
      if (!w.ok) {
        if (/waiting/i.test(w.error || '')) {   // §11.6: sit out the wait
          var wh = E.waitHour();
          if (job.result) { res = job.result; break; }
          if (!wh.ok) { E.endDay(); if (job.result) { res = job.result; break; } }
          continue;
        }
        assert(false, 'overspend: work failed: ' + (w.error || ''));
        return null;
      }
    }
    return res;
  }
  // §14.2: overspend is now graded (mild "a bit pricey" / hard "did it really
  // need") — match either phrasing since the priciest-vs-cheapest gap picked
  // here can land in either band depending on the catalog.
  var GRUMBLE_RE = /Did it really need|a bit pricey/i;
  var hit = runOnce(35353, false);
  if (hit) {
    assert(hit.notes.some(function (n) { return GRUMBLE_RE.test(n); }),
           'overspend: grumble note missing, notes: ' + JSON.stringify(hit.notes));
    console.log('  penalty fired: score ' + hit.score);
  }
  var waived = runOnce(35353, true);
  if (waived) {
    assert(!waived.notes.some(function (n) { return GRUMBLE_RE.test(n); }),
           'overspend: taste match should waive the grumble');
    assert(waived.score > (hit ? hit.score : 0),
           'overspend: waived score should beat penalized score');
    console.log('  taste waiver ok: score ' + waived.score + ' vs ' + (hit && hit.score));
  }
}

// ------------------------------------------------------------------
// Scenario (§14.2): symmetric quality check — a downgrade commit on a repair
// dings rating + flags "downgrade"; putting the same part back reads "ideal"
// and stays clean. (Overspend grading itself is covered by overspendScenario.)
// ------------------------------------------------------------------
function qualityFlagsScenario(era) {
  console.log('--- Quality flags: downgrade / ideal (§14.2) ---');
  var E = Engine;

  function setupRepairWithPartFault(seed) {
    var r = E.newGame({ eraId: era.id, shopName: 'Quality Test', seed: seed });
    if (!r.ok) return null;
    E.getState().cash = 200000;
    var job = null;
    for (var d = 0; d < 30 && !job; d++) {
      var offers = E.getOffers().slice();
      for (var i = 0; i < offers.length; i++) {
        var o = offers[i];
        if (o.type === 'repair' && o.fault && o.fault.partCategory &&
            Engine.Jobs.perfKeyForCategory(o.fault.partCategory) &&
            !o.rush && E.acceptOffer(o.id).ok) {
          job = E.getActiveJobs().filter(function (j) { return j.id === o.id; })[0];
          break;
        }
      }
      if (!job) E.endDay();
    }
    if (!job) return null;
    if (job.needsDiagnosis && !job.diagnosed) E.diagnoseJob(job.id);
    if (!job.diagnosed || !job.needs.length) return null;
    return job;
  }

  function workToResult(job) {
    var res = null, guard = 0;
    while (guard++ < 60) {
      E.getState().hoursLeft = 8;
      var w = E.workJob(job.id);
      if (w.ok && w.completed) { res = w.result; break; }
      if (job.result) { res = job.result; break; }
      if (!w.ok) {
        if (/waiting/i.test(w.error || '')) {
          var wh = E.waitHour();
          if (job.result) { res = job.result; break; }
          if (!wh.ok) { E.endDay(); if (job.result) { res = job.result; break; } }
          continue;
        }
        return null;
      }
    }
    return res;
  }

  // (a) downgrade: pretend the original was the BEST candidate in its
  // category — any real (weaker) purchasable candidate then reads as a
  // genuine downgrade, which a repair commit does NOT hard-block (§14.2).
  var jobA = setupRepairWithPartFault(61101);
  if (jobA) {
    var needA = jobA.needs[0];
    var keyA = Engine.Jobs.perfKeyForCategory(needA.category);
    var candsA = Engine.Jobs.purchasableByCategory(E.getState(), needA.category);
    var bestA = candsA.slice().sort(function (a, b) {
      return ((b.perf || {})[keyA] || 0) - ((a.perf || {})[keyA] || 0);
    })[0];
    var worseA = bestA && candsA.filter(function (p) {
      return ((p.perf || {})[keyA] || 0) < ((bestA.perf || {})[keyA] || 0);
    }).sort(function (a, b) { return ((b.perf || {})[keyA] || 0) - ((a.perf || {})[keyA] || 0); })[0];
    if (bestA && worseA) {
      needA.originalPartId = bestA.id;
      var viewA = E.getJobNeeds(jobA.id)[0];
      var optA = viewA.options.filter(function (o) { return o.partId === worseA.id; })[0];
      if (assert(optA && optA.vsOriginal && optA.vsOriginal.cmp === 'worse',
                 'quality: expected a "worse" vsOriginal cue on the forced-downgrade option, got: ' +
                 JSON.stringify(optA && optA.vsOriginal))) {
        var arA = E.assignPart(jobA.id, 0, worseA.id);
        var guardA = 0;
        while (arA.ok && arA.mishap && arA.filled < 1 && guardA++ < 8)
          arA = E.assignPart(jobA.id, 0, worseA.id);
        if (assert(arA.ok, 'quality: downgrade assign failed: ' + (arA.error || ''))) {
          var resA = workToResult(jobA);
          if (assert(!!resA, 'quality: downgrade job never completed')) {
            assert(resA.qualityFlags && resA.qualityFlags.some(function (f) { return f.kind === 'downgrade'; }),
                   'quality: expected a downgrade qualityFlag, got: ' + JSON.stringify(resA.qualityFlags));
            assert(resA.notes.some(function (n) { return /smaller.slower/i.test(n); }),
                   'quality: expected a downgrade grumble note, got: ' + JSON.stringify(resA.notes));
            console.log('  downgrade ding ok: score ' + resA.score +
                        ', flags ' + JSON.stringify(resA.qualityFlags));
          }
        }
      }
    } else {
      console.log('  (no downgrade-capable candidate spread in this category — skipped)');
    }
  } else {
    console.log('  (no part-fault repair offer in 30 days — downgrade case skipped)');
  }

  // (b) ideal: install the SAME part back (same metric, ~same price => no
  // downgrade, no overspend) -> qualityFlags reads "ideal", no grumble note.
  var jobB = setupRepairWithPartFault(61102);
  if (jobB) {
    var needB = jobB.needs[0];
    var origB = needB.originalPartId ? Engine.partById(needB.originalPartId) : null;
    var stillPurchasable = origB && Engine.Jobs.purchasableByCategory(E.getState(), needB.category)
      .some(function (p) { return p.id === origB.id; });
    if (stillPurchasable) {
      var arB = E.assignPart(jobB.id, 0, origB.id);
      var guardB = 0;
      while (arB.ok && arB.mishap && arB.filled < 1 && guardB++ < 8)
        arB = E.assignPart(jobB.id, 0, origB.id);
      if (assert(arB.ok, 'quality: ideal assign failed: ' + (arB.error || ''))) {
        var resB = workToResult(jobB);
        if (assert(!!resB, 'quality: ideal job never completed')) {
          assert(resB.qualityFlags && resB.qualityFlags.some(function (f) { return f.kind === 'ideal'; }),
                 'quality: expected an ideal qualityFlag, got: ' + JSON.stringify(resB.qualityFlags));
          assert(!resB.notes.some(function (n) { return /smaller.slower|pricey|Did it really need/i.test(n); }),
                 'quality: ideal completion should carry no quality grumble, got: ' + JSON.stringify(resB.notes));
          console.log('  ideal part clean: score ' + resB.score);
        }
      }
    } else {
      console.log('  (original part no longer purchasable this era — ideal case skipped)');
    }
  } else {
    console.log('  (no part-fault repair offer in 30 days — ideal case skipped)');
  }
}

// ------------------------------------------------------------------
// Scenario (§10.6): Sundays — no offers, no deadlines, over 60 days
// ------------------------------------------------------------------
function sundayScenario(era) {
  console.log('--- Sunday rules (§10.6) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Sunday Test', seed: 46464 });
  if (!assert(r.ok, 'sunday: newGame failed')) return;
  E.getState().cash = 1000000;   // idle observer
  var offerOnSunday = null, deadlineOnSunday = null, badToken = null;
  for (var d = 0; d < 60; d++) {
    var res = E.endDay();
    if (!assert(res.ok, 'sunday: endDay failed')) return;
    var s = E.getState();
    var all = s.jobs.offers.concat(s.jobs.active);
    for (var i = 0; i < all.length; i++) {
      var j = all[i];
      if (Engine.dateInfo(j.offeredDay).isSunday && !offerOnSunday)
        offerOnSunday = j.title + ' offered ' + Engine.dateInfo(j.offeredDay).iso;
      if (j.deadlineDay != null && Engine.dateInfo(j.deadlineDay).isSunday && !deadlineOnSunday)
        deadlineOnSunday = j.title + ' due ' + Engine.dateInfo(j.deadlineDay).iso;
      // §13.3 sweep, over a genuine 60-day window
      if (!badToken) {
        if (j.title && j.title.indexOf('{') !== -1) badToken = 'title: ' + j.title;
        else if (j.blurb && j.blurb.indexOf('{') !== -1) badToken = 'blurb: ' + j.blurb;
      }
    }
  }
  assert(offerOnSunday == null, 'sunday: offer generated on a Sunday: ' + offerOnSunday);
  assert(deadlineOnSunday == null, 'sunday: deadline landed on a Sunday: ' + deadlineOnSunday);
  assert(badToken == null, 'sunday: unresolved copy token over 60 days: ' + badToken);
  console.log('  60 days clean: no Sunday offers, no Sunday deadlines, no stray copy tokens');
}

// ------------------------------------------------------------------
// Scenario (§10.7): staff — hire, speedup, wages, severance
// ------------------------------------------------------------------
function staffScenario() {
  console.log('--- Staff (§10.7) ---');
  var E = Engine;
  var era = DATA.ERAS.filter(function (e) { return e.startYear >= 1991; })[0] || DATA.ERAS[0];
  var r = E.newGame({ eraId: era.id, shopName: 'Staff Test', seed: 57575 });
  if (!assert(r.ok, 'staff: newGame failed')) return;
  var s = E.getState();
  s.cash = 100000;
  // Garage has zero staff slots
  var sv0 = E.getStaffView();
  assert(sv0.slots === 0, 'staff: garage should have 0 slots, got ' + sv0.slots);
  var deny = E.hireStaff((sv0.candidates[0] || {}).id);
  assert(!deny.ok && /garage/i.test(deny.error || ''),
         'staff: hiring in a garage should fail with the garage note, got ' + JSON.stringify(deny));
  // Move up a tier (debug poke — prestige gates are not under test here)
  s.shop.tier = 1;
  var sv = E.getStaffView();
  assert(sv.slots === 1, 'staff: tier 1 should have 1 slot');
  assert(sv.candidates.length >= 2 && sv.candidates.length <= 4,
         'staff: candidate market should hold 2-4, got ' + sv.candidates.length);
  assert(sv.candidates.every(function (c) { return c.effectNote && c.desc != null; }),
         'staff: candidates missing effectNote/desc');
  // Hire a technician (or first candidate) & verify the time multiplier
  var cand = sv.candidates.filter(function (c) { return c.role === 'tech'; })[0] || sv.candidates[0];
  var role = Engine.staffRoleById(cand.role);
  var affectedType = Engine.isApprenticeRole(role) ? 'repair' : role.jobTypes[0];
  assert(Engine.staffTimeMult(s, affectedType) === 1, 'staff: mult should be 1 before hiring');
  var h = E.hireStaff(cand.id);
  assert(h.ok, 'staff: hire failed: ' + (h.error || ''));
  var mult = Engine.staffTimeMult(s, affectedType);
  assert(mult < 1 && mult >= 1 / (1 + 0.35),
         'staff: time multiplier should be <1, got ' + mult);
  var deny2 = E.hireStaff((E.getStaffView().candidates[0] || {}).id);
  assert(!deny2.ok, 'staff: hiring past the slot cap should fail');
  // Wages billed with rent on the 1st
  var sawWages = false, wageAmount = 0;
  for (var d = 0; d < 35 && !sawWages; d++) {
    var res = E.endDay();
    if (!res.ok) break;
    res.summary.charges.forEach(function (c) {
      if (/^Wages/.test(c.label)) { sawWages = true; wageAmount = -c.amount; }
    });
  }
  assert(sawWages && wageAmount > 0, 'staff: wages never billed on the 1st');
  // Fire with two weeks severance + rep ding
  var member = E.getStaffView().staff[0];
  var cashBefore = E.getState().cash;
  var f = E.fireStaff(member.id);
  assert(f.ok, 'staff: fire failed: ' + (f.error || ''));
  assert(Math.abs(f.severance - Engine.round2(member.wageMonthly / 2)) < 0.01,
         'staff: severance should be wageMonthly/2, got ' + f.severance);
  assert(Math.abs((cashBefore - E.getState().cash) - f.severance) < 0.01,
         'staff: severance not charged to cash');
  assert(E.getStaffView().staff.length === 0, 'staff: roster should be empty after firing');
  console.log('  garage blocked, hired ' + cand.name + ' (' + cand.role + '), mult ' +
              mult.toFixed(3) + ', wages ' + Engine.fmtMoney(wageAmount) +
              ', severance ' + Engine.fmtMoney(f.severance));
}

// ------------------------------------------------------------------
// Scenario (§11.2): synthetic ramp check — 4.8-star prestige-2 garage <= 4
// ------------------------------------------------------------------
function rampScenario(era) {
  console.log('--- Offer ramp-down (§11.2) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Ramp Test', seed: 86868 });
  if (!assert(r.ok, 'ramp: newGame failed')) return;
  var s = E.getState();
  s.reputation.rating = 4.8;
  s.reputation.prestige = 2;
  s.shop.tier = 0;
  s.jobs.offers = [];
  var made = Engine.Jobs.generateOffers(s, null);
  assert(made.length <= 4,
         'ramp: 4.8-star prestige-2 garage generated ' + made.length + ' offers (cap 4)');
  // Busy shop: >=10 pending halves arrivals
  s.jobs.offers = [];
  for (var i = 0; i < 10; i++) s.jobs.offers.push({ id: 90000 + i, offeredDay: s.day,
    deadlineDay: null, title: 'stub', type: 'cleaning', steps: [], needs: [] });
  var made2 = Engine.Jobs.generateOffers(s, null);
  assert(made2.length <= 2,
         'ramp: busy shop should halve arrivals, got ' + made2.length);
  console.log('  garage cap ok (' + made.length + '), busy-shop halving ok (' +
              made2.length + ')');
}

// ------------------------------------------------------------------
// Scenario (§11.3): diagnosis lives in the checklist; alias still works
// ------------------------------------------------------------------
function diagMergeScenario(era) {
  console.log('--- Diagnose-step merge (§11.3) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Diag Test', seed: 95959 });
  if (!assert(r.ok, 'diag: newGame failed')) return;
  E.getState().cash = 100000;
  // Collect two part-fault repair jobs: one worked manually, one via the alias
  var jobs = [];
  for (var d = 0; d < 30 && jobs.length < 2; d++) {
    var offers = E.getOffers().slice();
    for (var i = 0; i < offers.length && jobs.length < 2; i++) {
      var o = offers[i];
      if (o.type !== 'repair' || o.rush || o.crt) continue;
      if (!o.fault || !o.fault.partCategory) continue;   // harness peeks
      if (E.acceptOffer(o.id).ok)
        jobs.push(E.getActiveJobs().filter(function (j) { return j.id === o.id; })[0]);
    }
    if (jobs.length < 2) E.endDay();
  }
  if (!assert(jobs.length === 2, 'diag: could not collect two part-fault repairs')) return;

  // Job A: drive the diagnose steps purely through workJob
  var a = jobs[0];
  assert(a.steps.length === 2 && /intake/i.test(a.steps[0].label) &&
         /bench diagnosis/i.test(a.steps[1].label) && a.steps[1].diag === true,
         'diag: checklist should open with the diagnose phase, got ' +
         JSON.stringify(a.steps.map(function (st) { return st.label; })));
  assert(a.pendingSteps.length >= 1, 'diag: repair steps should hide in pendingSteps');
  assert(a.needs.length === 0 && !a.diagnosed, 'diag: no needs before diagnosis');
  E.getState().hoursLeft = 8;
  var guard = 0;
  while (!a.diagnosed && guard++ < 10) {
    var w = E.workJob(a.id, 0.5);
    if (!assert(w.ok, 'diag: workJob failed mid-diagnosis: ' + (w.error || ''))) return;
    if (!a.diagnosed)
      assert(a.needs.length === 0, 'diag: fault leaked before the diag step completed');
  }
  assert(a.diagnosed, 'diag: working the checklist never diagnosed the job');
  assert(a.needs.length === 1, 'diag: needs should appear exactly at diag completion');
  assert(a.pendingSteps.length === 0 && a.steps.length > 2,
         'diag: repair steps should append at diag completion');
  var openCount = a.steps.filter(function (st) {
    return /open|ground|intake/i.test(st.label);
  }).length;
  assert(openCount <= 1, 'diag: duplicate open/ground/intake steps after append (' +
         openCount + ')');

  // Job B: the deprecated diagnoseJob alias works the steps
  var b = jobs[1];
  E.getState().hoursLeft = 8;
  var dr = E.diagnoseJob(b.id);
  assert(dr.ok && dr.fault && dr.fault.partCategory,
         'diag: alias failed: ' + (dr.error || ''));
  assert(b.diagnosed && b.steps[1].done,
         'diag: alias should complete the bench-diagnosis step');
  var dr2 = E.diagnoseJob(b.id);
  assert(!dr2.ok, 'diag: double-diagnosis should refuse');
  console.log('  merge ok: fault revealed at step completion, alias works, no dupes');
}

// ------------------------------------------------------------------
// Scenario (§11.4): OS requests — satisfiable, enforced readably
// ------------------------------------------------------------------
function osRequestScenario(era) {
  console.log('--- OS requests (§11.4) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'OS Test', seed: 31414 });
  if (!assert(r.ok, 'os: newGame failed')) return;
  E.getState().cash = 100000;
  var job = null;
  for (var d = 0; d < 40 && !job; d++) {
    var offers = E.getOffers().slice();
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      if (o.type !== 'software' || !o.needs.length) continue;
      var n0 = o.needs[0];
      if (!n0.osExactId && !n0.osFamily) continue;   // want a restricted request
      if (E.acceptOffer(o.id).ok) {
        job = E.getActiveJobs().filter(function (j) { return j.id === o.id; })[0];
        break;
      }
    }
    if (!job) E.endDay();
  }
  if (!assert(!!job, 'os: no restricted OS request arrived in 40 days')) return;
  assert(typeof job.osRequest === 'string' && job.osRequest.length > 5,
         'os: job.osRequest label missing');
  var needs = E.getJobNeeds(job.id)[0];
  var okOpt = needs.options.filter(function (o) { return o.meets; });
  assert(okOpt.length >= 1, 'os: restricted request has no satisfying option');
  var badOpt = needs.options.filter(function (o) { return !o.meets; })[0];
  if (badOpt) {
    var rej = E.assignPart(job.id, 0, badOpt.partId);
    assert(!rej.ok && /asked for|wrong flavor|specifically/i.test(rej.error || ''),
           'os: wrong-OS rejection unreadable: ' + JSON.stringify(rej));
    console.log('  rejected: "' + rej.error + '"');
  } else {
    console.log('  (only one OS family purchasable this era — rejection path skipped)');
  }
  console.log('  request: "' + job.osRequest + '", ' + okOpt.length + ' valid option(s)');
}

// ------------------------------------------------------------------
// Scenario (§11.6): wait steps — start, parallel ticking, waitHour, overnight
// ------------------------------------------------------------------
function waitScenario(era) {
  console.log('--- Waiting steps (§11.6) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Wait Test', seed: 27272 });
  if (!assert(r.ok, 'wait: newGame failed')) return;
  var s = E.getState();
  s.cash = 100000;
  // A refurb machine gives a deterministic job; ensure its checklist has a wait
  var listing = E.getAsIsMarket()[0];
  if (!assert(!!listing, 'wait: no as-is listing')) return;
  var buy = E.buyAsIsMachine(listing.id);
  if (!assert(buy.ok, 'wait: buy failed')) return;
  var job = E.getActiveJobs().filter(function (j) { return j.id === buy.jobId; })[0];
  var all = job.steps.concat(job.pendingSteps || []);
  var waitStep = all.filter(function (st) { return st.kind === 'wait'; })[0];
  if (!waitStep) {   // data-independent mechanics test: promote the last step
    waitStep = all[all.length - 1];
    waitStep.kind = 'wait';
    console.log('  (no natural wait step in this checklist — promoted "' +
                waitStep.label + '" for the mechanics test)');
  }
  assert(waitStep.running === false, 'wait: running must default false');
  // Work the job up to the wait barrier
  s.hoursLeft = 8;
  var started = null, guard = 0;
  while (guard++ < 60 && !started) {
    if (s.hoursLeft < 1) s.hoursLeft = 8;   // debug refill
    if (job.needsDiagnosis && !job.diagnosed) { E.diagnoseJob(job.id); continue; }
    var needs = E.getJobNeeds(job.id);
    var blocked = false;
    for (var n = 0; n < needs.length; n++) {
      if (needs[n].filled < needs[n].qty) {
        var opt = needs[n].options.filter(function (o) { return o.meets; })[0];
        if (opt) E.assignPart(job.id, needs[n].index, opt.partId);
        else blocked = true;
      }
    }
    if (blocked) break;
    var w = E.workJob(job.id);
    if (w.ok && w.startedWait) { started = w; break; }
    if (!w.ok) break;
    if (w.completed) break;
  }
  if (!assert(!!started, 'wait: never reached/started the wait step')) return;
  assert(started.hoursSpent === Engine.CONFIG.WAIT_START_HOURS,
         'wait: starting should cost 0.1h, got ' + started.hoursSpent);
  var cur = job.steps[job.stepIndex];
  assert(cur.kind === 'wait' && cur.running === true, 'wait: step should be running');
  // Its own job is blocked while waiting
  var again = E.workJob(job.id);
  assert(!again.ok && /waiting/i.test(again.error || ''),
         'wait: own job should be blocked, got ' + JSON.stringify(again));
  // waitHour advances it 1:1
  var p0 = cur.progress;
  var wh = E.waitHour();
  assert(wh.ok && wh.hoursSpent === 1 && wh.advanced.length >= 1,
         'wait: waitHour failed: ' + JSON.stringify(wh));
  var doneViaWaitHour = cur.done;
  assert(doneViaWaitHour || cur.progress > p0, 'wait: waitHour did not advance the step');
  // Parallelism: hours on another job also tick a running wait
  if (!doneViaWaitHour) {
    var other = E.getOffers()[0];
    if (other && E.acceptOffer(other.id).ok) {
      var p1 = cur.progress;
      s.hoursLeft = 8;
      var ww = E.workJob(other.id, 1);
      if (ww.ok && ww.hoursSpent > 0) {
        assert(cur.done || cur.progress > p1,
               'wait: hours on another job should tick the wait');
      }
    }
  }
  // Overnight completion
  if (!cur.done) {
    var res = E.endDay();
    assert(res.ok, 'wait: endDay failed');
    assert(cur.done && cur.running === false,
           'wait: running wait should complete free overnight');
  }
  // waitHour with nothing running refuses
  var idle = E.waitHour();
  assert(!idle.ok, 'wait: waitHour with nothing running should refuse');
  console.log('  start 0.1h, own-job block, waitHour tick, overnight completion ok');
}

// ------------------------------------------------------------------
// Scenario (§11.5): staff XP thresholds, fixed tables, senior firing
// ------------------------------------------------------------------
function staffXpScenario() {
  console.log('--- Staff XP & levels (§11.5) ---');
  var E = Engine;
  var era = DATA.ERAS.filter(function (e) { return e.startYear >= 1991; })[0] || DATA.ERAS[0];
  var r = E.newGame({ eraId: era.id, shopName: 'XP Test', seed: 64646 });
  if (!assert(r.ok, 'xp: newGame failed')) return;
  var s = E.getState();
  s.cash = 100000;
  s.shop.tier = 1;
  var sv = E.getStaffView();
  assert(sv.candidates.every(function (c) { return c.level >= 1 && c.level <= 2; }),
         'xp: candidates must spawn L1-L2, got ' +
         JSON.stringify(sv.candidates.map(function (c) { return c.level; })));
  var cand = sv.candidates.filter(function (c) { return c.role === 'tech'; })[0] ||
             sv.candidates[0];
  E.hireStaff(cand.id);
  var member = s.staff[0];
  var role = Engine.staffRoleById(member.role);
  var affected = Engine.isApprenticeRole(role) ? 'repair' : role.jobTypes[0];
  // Poke to the brink of the next level, then do one boosted action
  var TH = Engine.CONFIG.STAFF_LEVEL_THRESHOLDS;
  member.level = 1;
  member.skill = Engine.staffSkillFor(1);
  member.xp = TH[1] - 0.5;
  // find any job of an applicable type to work (poke a cleaning job's type if needed)
  var target = null;
  for (var d = 0; d < 15 && !target; d++) {
    var offers = E.getOffers().slice();
    for (var i = 0; i < offers.length; i++) {
      if (offers[i].type === affected && !offers[i].crt &&
          E.acceptOffer(offers[i].id).ok) {
        target = E.getActiveJobs().filter(function (j) { return j.id === offers[i].id; })[0];
        break;
      }
    }
    if (!target) E.endDay();
  }
  if (!assert(!!target, 'xp: no ' + affected + ' job arrived to train on')) return;
  s.hoursLeft = 8;
  var w = target.needsDiagnosis && !target.diagnosed ?
          E.diagnoseJob(target.id) : E.workJob(target.id, 1);
  assert(w.ok, 'xp: boosted action failed: ' + (w.error || ''));
  assert(member.level === 2, 'xp: 0.5h past the threshold should reach L2, got L' +
         member.level + ' xp ' + member.xp);
  assert(member.skill === Engine.staffSkillFor(2),
         'xp: level-up must adopt the fixed skill table');
  assert(/Level up/.test(s.news[0].headline) || s.levelUpsToday.length >= 1,
         'xp: level-up should push news + summary line');
  var view = E.getStaffView().staff[0];
  assert(view.level === 2 && view.xp >= TH[1] && view.nextLevelAt === TH[2] &&
         typeof view.title === 'string',
         'xp: getStaffView missing level/xp/nextLevelAt/title: ' + JSON.stringify(view));
  var res = E.endDay();
  assert(res.ok && res.summary.levelUps.length >= 1,
         'xp: morning summary should list the level-up');
  // §11.5: firing L4+ doubles the rep ding
  member = s.staff[0];
  member.level = 4;
  var histBefore = s.reputation.history.length;
  E.fireStaff(member.id);
  var hist = s.reputation.history;
  var added = hist.length - Math.min(histBefore, Engine.CONFIG.RATING_HISTORY - 2);
  var lastTwo = hist.slice(-2);
  assert(lastTwo[0] === Engine.CONFIG.FIRE_REP_SCORE &&
         lastTwo[1] === Engine.CONFIG.FIRE_REP_SCORE,
         'xp: firing L4+ should push the rep ding twice, got ' + JSON.stringify(lastTwo));
  console.log('  L2 at ' + TH[1] + 'h ok, fixed tables ok, summary line ok, ' +
              'senior firing double-ding ok');
}

// ------------------------------------------------------------------
// Scenario (§12.1): slot capacity limits with readable problems
// ------------------------------------------------------------------
function capacityScenario() {
  console.log('--- Slot capacity (§12.1) ---');
  var boards = DATA.PARTS.filter(function (p) {
    return p.category === 'motherboard' && p.slots &&
           isFinite(p.slots.ram) && p.slots.ram >= 1 && p.slots.ram <= 8;
  });
  var found = null;
  for (var i = 0; i < boards.length && !found; i++) {
    var b = boards[i];
    var stick = DATA.PARTS.filter(function (p) {
      return p.category === 'ram' && Engine.Compat.fits(p, b).fits;
    })[0];
    if (stick) found = { board: b, stick: stick };
  }
  if (!found) { console.log('  (no slotted board + fitting stick in data — skipped)'); return; }
  var cap = found.board.slots.ram, n = cap + 1;
  var ids = [found.board.id];
  for (var k = 0; k < n; k++) ids.push(found.stick.id);
  var v = Engine.Compat.validatePartList(ids, { requireFull: false });
  var reRam = new RegExp('Board has ' + cap + ' RAM slots — build uses ' + n);
  assert(!v.valid && v.problems.some(function (p) { return reRam.test(p); }),
         'capacity: expected RAM overflow problem, got: ' + v.problems.join('; '));
  assert((v.problemsInfo || []).some(function (pi) {
    return pi.category === 'ram' && reRam.test(pi.text);
  }), 'capacity: problemsInfo should map the RAM overflow to category "ram"');
  // GPU overflow (finite-slot board; a 0-slot i810-class board counts too)
  var gpuHit = null;
  var gBoards = DATA.PARTS.filter(function (p) {
    return p.category === 'motherboard' && p.slots &&
           isFinite(p.slots.gpu) && p.slots.gpu <= 2;
  });
  for (var gi = 0; gi < gBoards.length && !gpuHit; gi++) {
    var gb = gBoards[gi];
    var card = DATA.PARTS.filter(function (p) {
      return p.category === 'gpu' && Engine.Compat.fits(p, gb).fits;
    })[0];
    if (card) gpuHit = { board: gb, card: card };
  }
  if (gpuHit) {
    var gcap = gpuHit.board.slots.gpu, gn = gcap + 1;
    var gids = [gpuHit.board.id];
    for (var gk = 0; gk < gn; gk++) gids.push(gpuHit.card.id);
    var gv = Engine.Compat.validatePartList(gids, { requireFull: false });
    var reGpu = new RegExp('Board has ' + gcap + ' GPU slots — build uses ' + gn);
    assert(gv.problems.some(function (p) { return reGpu.test(p); }),
           'capacity: expected GPU overflow problem, got: ' + gv.problems.join('; '));
  }
  console.log('  RAM cap ' + cap + ' enforced ("' +
              v.problems.filter(function (p) { return reRam.test(p); })[0] + '")' +
              (gpuHit ? ', GPU cap ' + gpuHit.board.slots.gpu + ' enforced' : ''));
}

// ------------------------------------------------------------------
// Scenario (§12.2): multi-GPU pairing rules & perf aggregation
// ------------------------------------------------------------------
function multiGpuRulesScenario() {
  console.log('--- Multi-GPU rules (§12.2) ---');
  var gpus = DATA.PARTS.filter(function (p) { return p.category === 'gpu'; });
  var tagged = gpus.filter(function (p) { return p.sliTag; });
  if (!tagged.length) { console.log('  (no sliTag cards in data — skipped)'); return; }
  // (a) matched self-pair perf = first + factor x second
  var card = tagged.filter(function (p) { return !p.addonOnly; })[0] || tagged[0];
  var f = Engine.Compat.pairFactor(card.sliTag);
  var eff = Engine.Compat.gpuEffective([card, card]);
  var want = Engine.round2((card.perf.gpu || 0) * (1 + f));
  assert(Math.abs(eff - want) < 0.01,
         'pair perf: gpuEffective ' + eff + ' != ' + want + ' (' + card.sliTag + ')');
  // (b) mismatched second card: validation problem + no perf stacking
  var board = DATA.PARTS.filter(function (p) {
    return p.category === 'motherboard' &&
           (!p.slots || !isFinite(p.slots.gpu) || p.slots.gpu >= 2) &&
           Engine.Compat.fits(card, p).fits;
  })[0];
  var other = gpus.filter(function (p) {
    return !p.addonOnly && p.id !== card.id && p.sliTag !== card.sliTag &&
           (!board || Engine.Compat.fits(p, board).fits);
  })[0];
  if (board && other && !card.addonOnly) {
    var v = Engine.Compat.validatePartList([board.id, card.id, other.id],
                                           { requireFull: false });
    assert(v.problems.some(function (p) { return /isn't SLI\/CrossFire-compatible/.test(p); }),
           'mismatch: expected pairing problem, got: ' + v.problems.join('; '));
    var mp = Engine.Compat.machinePerf([board, card, other]);
    var wantG = Math.max(card.perf.gpu || 0, other.perf.gpu || 0);
    assert(Math.abs(mp.gpu - wantG) < 0.01,
           'mismatch: second card must contribute nothing (' + mp.gpu + ' vs ' + wantG + ')');
  }
  // (c) Voodoo2 add-on rule + the historical 2D-card-plus-pair config
  var addon = gpus.filter(function (p) { return p.addonOnly && p.sliTag; })[0];
  if (addon) {
    var vboard = DATA.PARTS.filter(function (p) {
      return p.category === 'motherboard' && !p.integratedVideo &&
             Engine.Compat.fits(addon, p).fits;
    })[0];
    if (vboard) {
      var v2 = Engine.Compat.validatePartList([vboard.id, addon.id], { requireFull: false });
      assert(v2.problems.some(function (p) { return /3D add-on/.test(p); }),
             'voodoo: lone add-on card should demand a 2D companion, got: ' +
             v2.problems.join('; '));
      var twoD = gpus.filter(function (p) {
        return !p.addonOnly && Engine.Compat.fits(p, vboard).fits;
      })[0];
      var vcap = vboard.slots && isFinite(vboard.slots.gpu) ?
        vboard.slots.gpu : 99;
      if (twoD && vcap >= 3) {
        var v3 = Engine.Compat.validatePartList(
          [vboard.id, twoD.id, addon.id, addon.id], { requireFull: false });
        assert(!v3.problems.some(function (p) { return /3D add-on|SLI\/CrossFire|identical pair/.test(p); }),
               'voodoo: 2D + matched pair should raise no GPU problems, got: ' +
               v3.problems.join('; '));
        var vf = Engine.Compat.pairFactor(addon.sliTag);
        var mp2 = Engine.Compat.machinePerf([vboard, twoD, addon, addon]);
        var wantV = Engine.round2(
          Math.max((twoD.perf.gpu || 0), (addon.perf.gpu || 0) * (1 + vf)));
        assert(Math.abs(mp2.gpu - wantV) < 0.01,
               'voodoo: interleave perf ' + mp2.gpu + ' != ' + wantV);
      }
    }
  }
  console.log('  pair +' + Math.round(f * 100) + '% ok, mismatch problem ok' +
              (addon ? ', Voodoo2 add-on rule ok' : ' (no add-on cards in data)'));
}

// ------------------------------------------------------------------
// Scenario (§12.6): SLI build request generated & completed (2005-08);
// Voodoo2-window request generated (1998-2000)
// ------------------------------------------------------------------
function eraLatestAtOrBefore(y) {
  var best = null;
  DATA.ERAS.forEach(function (e) {
    if (e.startYear <= y && (!best || e.startYear > best.startYear)) best = e;
  });
  return best;
}
function pokeYear(iso) {
  var s = Engine.getState();
  s.day = Math.max(0, Engine.dayIndexOfISO(iso, s));
  s.cash = 60000;
  s.customBuildsUnlocked = true;
  if (s.shop.equipment.indexOf('build-bench') === -1) s.shop.equipment.push('build-bench');
  return s;
}
function generateUntil(s, pred, tries) {
  var found = null, guard = 0;
  while (!found && guard++ < (tries || 400)) {
    s.jobs.offers.length = 0;
    Engine.Jobs.generateOffers(s, null);
    found = s.jobs.offers.filter(pred)[0] || null;
  }
  return found;
}
function workToDone(E, job) {
  var guard = 0;
  while (job.status === 'active' && guard++ < 300) {
    var w = E.workJob(job.id);
    if (w.ok && w.completed) break;
    if (!w.ok) {
      if (/waiting/i.test(w.error || '')) {
        var wh = E.waitHour();
        if (!wh.ok) E.endDay();
      } else if (/exhaust|time/i.test(w.error || '')) {
        E.endDay();
      } else {
        return w.error || 'unknown workJob error';
      }
    }
  }
  return null;
}
function sliBuildScenario() {
  console.log('--- SLI/CrossFire build requests (§12.2) ---');
  var E = Engine;
  var era = eraLatestAtOrBefore(2005);
  if (!era) { console.log('  (no era at/before 2005 — skipped)'); return; }
  var r = E.newGame({ eraId: era.id, shopName: 'SLI Test', seed: 8181 });
  if (!assert(r.ok, 'sli: newGame failed')) return;
  var s = pokeYear('2006-06-15');
  var haveSli = E.Jobs.purchasableByCategory(s, 'gpu').some(function (g) {
    return g.sliTag && !g.addonOnly;
  });
  if (!haveSli) { console.log('  (no purchasable SLI cards at 2006 — skipped)'); return; }
  var offer = generateUntil(s, function (o) { return o.build && o.build.wantsMultiGpu; });
  if (!assert(offer, 'sli: no multi-GPU build request generated in 400 nights')) return;
  assert(/SLI|CrossFire/i.test(offer.title),
         'sli: title should read like a pair request: ' + offer.title);
  var acc = E.acceptOffer(offer.id);
  if (!assert(acc.ok, 'sli: accept failed: ' + (acc.error || ''))) return;
  var job = E.getActiveJobs().filter(function (j) { return j.id === offer.id; })[0];
  var cres = applyWitnessBuild(E, job);
  if (!assert(cres === 'committed', 'sli: witness commit failed (' + cres + ')')) return;
  var gpuSel = (job.build.parts.gpu || []).filter(function (id) { return id != null; });
  assert(gpuSel.length >= 2, 'sli: committed build should hold 2+ GPUs, has ' + gpuSel.length);
  var tags = gpuSel.map(function (id) { return (E.partById(id) || {}).sliTag; });
  assert(tags[0] && tags.every(function (t) { return t === tags[0]; }),
         'sli: the pair must share an sliTag: ' + JSON.stringify(tags));
  var werr = workToDone(E, job);
  assert(!werr, 'sli: work loop broke: ' + werr);
  assert(job.status === 'done' && job.result && job.result.payout > 0,
         'sli: multi-GPU build not completed/paid');
  console.log('  completed "' + offer.title + '" with a matched ' + tags[0] +
              ' pair, payout ' + Engine.fmtMoney(job.result ? job.result.payout : 0));
  // Voodoo2 window (1998-2000): request generated, witness carries pair + 2D
  var vEra = eraLatestAtOrBefore(1998);
  if (!vEra) return;
  var r2 = E.newGame({ eraId: vEra.id, shopName: 'V2 Test', seed: 8282 });
  if (!r2.ok) return;
  var s2 = pokeYear('1998-09-01');
  var haveV2 = E.Jobs.purchasableByCategory(s2, 'gpu').some(function (g) {
    return g.sliTag && g.addonOnly;
  });
  if (!haveV2) { console.log('  (no purchasable Voodoo2-class cards at 1998 — skipped)'); return; }
  var v2offer = generateUntil(s2, function (o) {
    return o.build && o.build.wantsMultiGpu && /voodoo/i.test(o.build.sliTag || '');
  });
  if (!assert(v2offer, 'voodoo: no Voodoo2 SLI request generated in 400 nights')) return;
  var wtn = E.Jobs.witnessBuild(s2, v2offer.build);
  if (assert(wtn, 'voodoo: request must be witness-satisfiable')) {
    var wparts = wtn.partIds.map(function (id) { return E.partById(id); });
    var waddons = wparts.filter(function (p) { return p && p.addonOnly; });
    var w2d = wparts.filter(function (p) { return p && p.category === 'gpu' && !p.addonOnly; });
    assert(waddons.length >= 2, 'voodoo: witness should pair 2 add-on cards');
    var wboard = wparts.filter(function (p) { return p && p.category === 'motherboard'; })[0];
    assert(w2d.length >= 1 || (wboard && wboard.integratedVideo),
           'voodoo: witness needs a 2D source beside the pair');
    console.log('  Voodoo2 request "' + v2offer.title + '" witnessed: pair + 2D companion');
  }
}

// ------------------------------------------------------------------
// Scenario (§12.6): RAM-heavy contract build completed with 3+ sticks
// ------------------------------------------------------------------
function ramHeavyScenario() {
  console.log('--- RAM-heavy contract build (§12.2) ---');
  var E = Engine;
  var era = eraLatestAtOrBefore(2005);
  if (!era) { console.log('  (no era at/before 2005 — skipped)'); return; }
  var r = E.newGame({ eraId: era.id, shopName: 'RAM Test', seed: 8383 });
  if (!assert(r.ok, 'ramheavy: newGame failed')) return;
  var s = pokeYear('2006-06-15');
  var haveBigBoard = E.Jobs.purchasableByCategory(s, 'motherboard').some(function (b) {
    return b.slots && isFinite(b.slots.ram) && b.slots.ram >= 4;
  });
  if (!haveBigBoard) { console.log('  (no purchasable >=4-DIMM board at 2006 — skipped)'); return; }
  var offer = generateUntil(s, function (o) { return o.build && o.build.ramHeavy; });
  if (!assert(offer, 'ramheavy: no RAM-maxed build request generated in 400 nights')) return;
  var acc = E.acceptOffer(offer.id);
  if (!assert(acc.ok, 'ramheavy: accept failed: ' + (acc.error || ''))) return;
  var job = E.getActiveJobs().filter(function (j) { return j.id === offer.id; })[0];
  var cres = applyWitnessBuild(E, job);
  if (!assert(cres === 'committed', 'ramheavy: witness commit failed (' + cres + ')')) return;
  var ramSel = (job.build.parts.ram || []).filter(function (id) { return id != null; });
  assert(ramSel.length >= 3,
         'ramheavy: needs 3+ sticks by design, committed ' + ramSel.length);
  var werr = workToDone(E, job);
  assert(!werr, 'ramheavy: work loop broke: ' + werr);
  assert(job.status === 'done' && job.result && job.result.payout > 0,
         'ramheavy: build not completed/paid');
  console.log('  completed "' + offer.title + '" with ' + ramSel.length +
              ' sticks, payout ' + Engine.fmtMoney(job.result ? job.result.payout : 0));
}

// ------------------------------------------------------------------
// Scenario (§12.4): device repair completes for apple (1990s) and mobile (2013+)
// ------------------------------------------------------------------
function deviceScenario() {
  console.log('--- Device repair (§12.4) ---');
  var E = Engine;
  function runOne(label, eraYearCap, pokeIso, wantKinds, gate) {
    var era = eraLatestAtOrBefore(eraYearCap);
    if (!era) { console.log('  (' + label + ': no suitable era — skipped)'); return; }
    var r = E.newGame({ eraId: era.id, shopName: 'Device Test', seed: 9700 + eraYearCap });
    if (!assert(r.ok, label + ': newGame failed')) return;
    var s = E.getState();
    if (pokeIso) s.day = Math.max(0, Engine.dayIndexOfISO(pokeIso, s));
    s.cash = 20000;
    if (!gate(s)) { console.log('  (' + label + ': device tables absent/inactive — skipped)'); return; }
    var offer = generateUntil(s, function (o) {
      return o.type === 'device_repair' && wantKinds.indexOf(o.subtype) !== -1;
    });
    if (!assert(offer, label + ': no device_repair offer generated in 400 nights')) return;
    assert(offer.device && offer.device.name && offer.device.kind && offer.device.year,
           label + ': job.device {name, kind, year} incomplete: ' + JSON.stringify(offer.device));
    assert((offer.steps.length + (offer.pendingSteps || []).length) >= 3,
           label + ': device job needs a checklist');
    assert(offer.needs.length === 0 && !offer.needsDiagnosis,
           label + ': device jobs must skip catalog parts & diagnosis');
    var acc = E.acceptOffer(offer.id);
    if (!assert(acc.ok, label + ': accept failed: ' + (acc.error || ''))) return;
    var job = E.getActiveJobs().filter(function (j) { return j.id === offer.id; })[0];
    var partsBefore = s.ledger.lifetime.partsCost;
    var werr = workToDone(E, job);
    assert(!werr, label + ': work loop broke: ' + werr);
    if (!assert(job.status === 'done' && job.result, label + ': job not completed')) return;
    assert(job.result.payout > 0, label + ': payout should be positive');
    if (job.devicePartsCost > 0) {
      var spent = Engine.round2(s.ledger.lifetime.partsCost - partsBefore);
      assert(spent === job.devicePartsCost,
             label + ': parts cost line ' + spent + ' != ' + job.devicePartsCost);
      assert((job.result.notes || []).some(function (nt) { return /Parts & materials/.test(nt); }),
             label + ': completion notes should carry the parts cost line');
    }
    console.log('  ' + label + ': "' + job.title + '" done, payout ' +
                Engine.fmtMoney(job.result.payout) + ', parts ' +
                Engine.fmtMoney(job.devicePartsCost));
  }
  runOne('apple-90s', 1999, null, ['apple'], function (s) {
    return (DATA.APPLE_MACHINES || []).length > 0;
  });
  runOne('mobile-2010s', 2015, '2015-06-15', ['smartphone', 'tablet'], function (s) {
    return (DATA.MOBILE_DEVICES || []).length > 0 && Engine.currentYear(s) >= 2009;
  });
}

// ------------------------------------------------------------------
// Scenario (§12.4): Devices wiki shape
// ------------------------------------------------------------------
function deviceWikiScenario() {
  console.log('--- Device wiki (§12.4) ---');
  var wiki = Engine.getDeviceWiki();
  var expected = (DATA.APPLE_MACHINES || []).length + (DATA.MOBILE_DEVICES || []).length;
  assert(wiki.length === expected,
         'device wiki: ' + wiki.length + ' entries, expected ' + expected);
  if (!expected) { console.log('  (no device tables — empty wiki ok)'); return; }
  var bad = wiki.filter(function (w) {
    return !w.id || !w.name || ['apple', 'smartphone', 'tablet'].indexOf(w.kind) === -1 ||
           !w.introYear || typeof w.desc !== 'string' || !w.repairNote;
  });
  assert(bad.length === 0, 'device wiki: malformed entries: ' +
         bad.slice(0, 3).map(function (w) { return w.id; }).join(','));
  var kinds = {};
  wiki.forEach(function (w) { kinds[w.kind] = true; });
  console.log('  ' + wiki.length + ' entries (' + Object.keys(kinds).join('/') + '), shape ok');
}

// ------------------------------------------------------------------
// Scenario (§13.1): Tech Chronicle fires on-date & never before
// ------------------------------------------------------------------
function chronicleScenario() {
  console.log('--- Tech Chronicle (§13.1) ---');
  var E = Engine;
  if (!Array.isArray(DATA.CHRONICLE) || !DATA.CHRONICLE.length) {
    console.log('  (no DATA.CHRONICLE yet — firing/date-gating deferred to when data lands)');
    return;
  }
  // Start at the earliest era so the run crosses many entries.
  var era = DATA.ERAS.slice().sort(function (a, b) { return a.startYear - b.startYear; })[0];
  var r = E.newGame({ eraId: era.id, shopName: 'Chronicle Test', seed: 90909 });
  if (!assert(r.ok, 'chronicle: newGame failed')) return;
  E.getState().cash = 10000000;   // idle observer, keep the lights on
  var firedEver = false;
  var prematureFire = null;
  var chronNewsSeen = 0;
  // Track chronicle news headlines already seen so we can confirm each fires
  // on (not before) its ISO date.
  for (var d = 0; d < 730 && !prematureFire; d++) {   // ~2 years
    var beforeNews = E.getState().news.slice();
    var res = E.endDay();
    if (!assert(res.ok, 'chronicle: endDay failed: ' + (res.error || ''))) return;
    var s = E.getState();
    // Any chronicle news pushed this turn must have date == a day we've reached.
    var fresh = s.news.slice(0, s.news.length - beforeNews.length);
    fresh.forEach(function (n) {
      if (n.kind !== 'chronicle') return;
      chronNewsSeen++;
    });
    // getChronicle must never surface an entry dated in the future.
    var chron = E.getChronicle();
    var todayISO = E.dateInfo(s.day).iso;
    for (var i = 0; i < chron.length; i++) {
      if (chron[i].date > todayISO) {
        prematureFire = chron[i].id + ' (' + chron[i].date + ') visible on ' + todayISO;
        break;
      }
      firedEver = true;
    }
  }
  assert(prematureFire == null, 'chronicle: entry surfaced before its date: ' + prematureFire);
  assert(firedEver, 'chronicle: no entries ever surfaced across a 2-year run');
  // Shape check on getChronicle
  var sample = E.getChronicle()[0];
  if (sample) {
    assert(sample.id && sample.date && sample.dateLabel && sample.headline != null &&
           sample.body != null && ('tag' in sample),
           'chronicle: getChronicle entry shape wrong: ' + JSON.stringify(sample));
    // newest-first ordering
    var ch = E.getChronicle();
    var ordered = ch.every(function (e, k) { return k === 0 || ch[k - 1].date >= e.date; });
    assert(ordered, 'chronicle: getChronicle not newest-first');
  }
  console.log('  ' + chronNewsSeen + ' chronicle news fired; getChronicle date-gated & newest-first');
}

// ------------------------------------------------------------------
// Scenario (§13.2): Milestone articles unlock over time, locked withheld
// ------------------------------------------------------------------
function articleScenario() {
  console.log('--- Milestone articles (§13.2) ---');
  var E = Engine;
  if (!Array.isArray(DATA.ARTICLES) || !DATA.ARTICLES.length) {
    console.log('  (no DATA.ARTICLES yet — unlock gating deferred to when data lands)');
    return;
  }
  var era = DATA.ERAS.slice().sort(function (a, b) { return a.startYear - b.startYear; })[0];
  var r = E.newGame({ eraId: era.id, shopName: 'Article Test', seed: 80808 });
  if (!assert(r.ok, 'article: newGame failed')) return;
  E.getState().cash = 10000000;
  // A future-dated article must be withheld now — pick the NEAREST locked one so
  // the fast-forward is short.
  var lockedId = null, lockedYear = null;
  DATA.ARTICLES.forEach(function (a) {
    var uy = a.unlockYear != null ? a.unlockYear : 9999;
    if (uy > era.startYear + 1 && (lockedYear == null || uy < lockedYear)) {
      lockedId = a.id; lockedYear = uy;
    }
  });
  var startCount = E.getArticles().length;
  if (lockedId) {
    var locked = E.getArticle(lockedId);
    assert(locked.ok === false, 'article: locked article should return {ok:false}, got ' +
           JSON.stringify(locked).slice(0, 80));
    assert(!E.getArticles().some(function (a) { return a.id === lockedId; }),
           'article: getArticles listed a still-locked article');
  }
  // Fast-forward just past the nearest locked article's unlock year.
  var maxDays = 365 * ((lockedYear != null ? lockedYear - era.startYear : 3) + 2);
  for (var d = 0; d < maxDays; d++) {
    var res = E.endDay();
    if (!res.ok) { assert(false, 'article: endDay failed: ' + res.error); return; }
    if (lockedId && E.getArticle(lockedId).ok) break;
  }
  var endCount = E.getArticles().length;
  assert(endCount >= startCount, 'article: unlocked count shrank over time');
  if (lockedId) {
    var opened = E.getArticle(lockedId);
    assert(opened.ok !== false && typeof opened.body === 'string' && opened.body.length > 0,
           'article: previously-locked article never opened with a body');
  }
  // Shape check on getArticles
  var one = E.getArticles()[0];
  if (one) {
    assert(one.id && one.title && one.category && ('summary' in one) && one.unlockLabel != null,
           'article: getArticles entry shape wrong: ' + JSON.stringify(one));
  }
  console.log('  unlocked set ' + startCount + ' -> ' + endCount +
              (lockedId ? '; locked article opened on schedule' : ''));
}

// ------------------------------------------------------------------
// Scenario (§13.4): certification study -> completion -> measurable effect,
// charged exactly once. Skips cleanly if DATA.CERTIFICATIONS is absent.
// ------------------------------------------------------------------
function certScenario() {
  console.log('--- Certifications (§13.4) ---');
  var E = Engine;
  var certs = Engine.certifications();
  if (!certs || !certs.length) {
    console.log('  (no certifications available — deferred to when data lands)');
    return;
  }
  // Pick a low-year, no-prereq cert with a job-time effect we can measure; the
  // fallback table always has CompTIA A+ (jobTimeMult on repair/upgrade).
  var era = DATA.ERAS.slice().sort(function (a, b) { return b.startYear - a.startYear; })[0];
  var r = E.newGame({ eraId: era.id, shopName: 'Cert Test', seed: 70707 });
  if (!assert(r.ok, 'cert: newGame failed')) return;
  var s = E.getState();
  s.cash = 10000000;
  var year = E.dateInfo(s.day).y;
  // Choose an available cert (era ok, no unmet prereq, has a foldable effect).
  var view = E.getCertifications();
  assert(Array.isArray(view.earned) && Array.isArray(view.available),
         'cert: getCertifications shape wrong');
  var target = view.available.filter(function (c) {
    var def = Engine.certById(c.id);
    var ef = def && def.effects;
    if (!ef) return false;
    var hasTime = ef.jobTimeMult && (ef.jobTimeMult.all != null ||
      ['repair', 'upgrade', 'software', 'data_recovery', 'device_repair', 'contract']
        .some(function (t) { return ef.jobTimeMult[t] != null; }));
    return c.canStart && hasTime;
  })[0];
  if (!target) {
    // No time-effect cert startable this era — still exercise start/study on any.
    target = view.available.filter(function (c) { return c.canStart; })[0];
  }
  if (!assert(!!target, 'cert: no startable certification found this era')) return;
  var def = Engine.certById(target.id);

  // Measure a baseline job-time multiplier before certification for a job type
  // the cert should speed up.
  var effType = null;
  if (def.effects.jobTimeMult) {
    ['repair', 'upgrade', 'software', 'data_recovery', 'device_repair', 'contract']
      .forEach(function (t) {
        if (effType) return;
        if (def.effects.jobTimeMult.all != null || def.effects.jobTimeMult[t] != null) effType = t;
      });
  }
  var beforeMult = effType ? Engine.certTimeMult(s, effType) : 1;

  var cashBefore = s.cash;
  var start = E.startCertification(target.id);
  if (!assert(start.ok, 'cert: startCertification failed: ' + (start.error || ''))) return;
  assert(Engine.round2(cashBefore - E.getState().cash) === Engine.round2(target.cost),
         'cert: start should charge exactly the cost once (charged ' +
         Engine.round2(cashBefore - E.getState().cash) + ' vs ' + target.cost + ')');
  var cashAfterStart = E.getState().cash;

  // Starting a second cert while studying must be refused.
  var other = E.getCertifications().available.filter(function (c) { return c.id !== target.id; })[0];
  if (other) {
    var dbl = E.startCertification(other.id);
    assert(!dbl.ok && /studying/i.test(dbl.error || ''),
           'cert: starting a 2nd cert mid-study should be refused, got ' + JSON.stringify(dbl));
  }

  // Study to completion across as many days as the study hours require. studyCert
  // spends owner hours (overtime rules), so we advance days to refill hours.
  var studyHours = def.studyHours || 0;
  var guard = 0, completed = false, totalStudied = 0;
  while (!completed && guard++ < studyHours + 40) {
    var st = E.studyCert();   // study as much as today's hours allow
    if (st.ok) {
      totalStudied += st.hoursSpent;
      if (st.completed) { completed = true; break; }
    }
    E.endDay();
  }
  assert(completed, 'cert: never completed after ' + guard + ' days (studied ' +
         Engine.round2(totalStudied) + '/' + studyHours + 'h)');
  var s2 = E.getState();
  assert(s2.training.certsEarned.indexOf(target.id) !== -1,
         'cert: earned list missing the completed cert');
  assert(s2.training.studying == null, 'cert: studying should clear on completion');
  // Charged exactly once: only the initial cost left the account (study spends
  // hours, not cash — allow for any endDay rent that may have hit meanwhile).
  assert(E.getCertifications().available.every(function (c) { return c.id !== target.id; }),
         'cert: completed cert still listed as available');

  // Measurable effect: the job-time multiplier for the affected type dropped.
  if (effType) {
    var afterMult = Engine.certTimeMult(s2, effType);
    assert(afterMult < beforeMult - 1e-9,
           'cert: job-time mult for ' + effType + ' did not drop (' +
           beforeMult + ' -> ' + afterMult + ')');
    console.log('  earned "' + def.name + '"; ' + effType + ' time mult ' +
                Engine.round2(beforeMult) + ' -> ' + Engine.round2(afterMult) +
                ', charged ' + E.fmtMoney(cashBefore - cashAfterStart) + ' once');
  } else {
    console.log('  earned "' + def.name + '" (no time-effect to measure), charged ' +
                E.fmtMoney(cashBefore - cashAfterStart) + ' once');
  }

  // getCertifications.studying shape while a second study is in progress
  if (other) {
    var start2 = E.startCertification(other.id);
    if (start2.ok) {
      var studyView = E.getCertifications().studying;
      assert(studyView && studyView.id === other.id && studyView.hoursTotal > 0 &&
             studyView.pct >= 0 && studyView.pct <= 100,
             'cert: getCertifications.studying shape wrong: ' + JSON.stringify(studyView));
    }
  }
}

// ------------------------------------------------------------------
// Scenario (§10.8/§11.7/§12.6/§13.8): v1-v5 fixtures migrate to v6 and play
// ------------------------------------------------------------------
function migrationScenario(era) {
  console.log('--- Save migration (v1/v2/v3/v4/v5 -> v6) ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Migrate Test', seed: 73737 });
  if (!assert(r.ok, 'migration: newGame failed')) return;
  var offers = E.getOffers().slice(0, 2);
  offers.forEach(function (o) { E.acceptOffer(o.id); });
  E.getState().cash = 50000;
  var listing = E.getAsIsMarket()[0];
  if (listing) E.buyAsIsMachine(listing.id);
  var v6snapshot = E.exportSave();

  function downgrade(version) {
    var obj = JSON.parse(v6snapshot);
    obj.version = version;
    // §13: a genuine pre-v6 save never carried training/certs/article-seen bookkeeping
    if (version < 6) {
      delete obj.training; delete obj.certsEarnedToday; delete obj.articlesSeen;
    }
    function stripV5(job) {   // v4 fixtures: flat build parts, no device fields
      if (!job) return;
      delete job.device; delete job.deviceModern;
      delete job.devicePartsCost; delete job.devicePayBase;
      if (job.build && job.build.parts && !Array.isArray(job.build.parts)) {
        var flat = [];
        Object.keys(job.build.parts).forEach(function (c) {
          (job.build.parts[c] || []).forEach(function (id) {
            if (id != null) flat.push(id);
          });
        });
        job.build.parts = flat;
      }
      if (job.build) {
        delete job.build.wantsMultiGpu; delete job.build.sliTag;
        delete job.build.multiGpuLabel; delete job.build.ramHeavy;
      }
    }
    function strip(job) {
      if (!job) return;
      stripV5(job);
      if (version >= 4) return;
      delete job.pendingSteps; delete job.osRequest;
      (job.steps || []).forEach(function (st) {
        delete st.kind; delete st.running; delete st.diag;
      });
      (job.needs || []).forEach(function (n) {
        delete n.osExactId; delete n.osFamily;
      });
      if (version <= 2) {
        delete job.steps; delete job.stepIndex; delete job.peripheral;
        if (job.type === 'repair' || job.type === 'upgrade') job.machine = null;
        (job.needs || []).forEach(function (n) { delete n.originalPartId; });
        (job.partsUsed || []).forEach(function (e) {
          delete e.needIndex; delete e.cost; delete e.fromStock; delete e.stockCost;
        });
      }
      if (version === 1) {
        delete job.taste;
        if (job.machine) { delete job.machine.specSummary; delete job.machine.faultRepaired; }
      }
    }
    // v4-and-earlier saves never carried device jobs
    obj.jobs.offers = (obj.jobs.offers || []).filter(function (j) {
      return j.type !== 'device_repair';
    });
    obj.jobs.active = (obj.jobs.active || []).filter(function (j) {
      return j.type !== 'device_repair';
    });
    if (version < 4) {
      delete obj.levelUpsToday;
      (obj.staff || []).concat(obj.staffMarket || []).forEach(function (m) {
        delete m.level; delete m.xp; delete m.title;
      });
    }
    (obj.jobs.offers || []).forEach(strip);
    (obj.jobs.active || []).forEach(strip);
    if (version <= 2) {
      delete obj.staff; delete obj.staffMarket;
      delete obj.staffNextRefreshDay; delete obj.staffNextId;
    }
    if (version === 1) (obj.asIsMarket || []).forEach(function (m) { delete m.specSummary; });
    return JSON.stringify(obj);
  }

  [1, 2, 3, 4, 5].forEach(function (ver) {
    var imp = E.importSave(downgrade(ver));
    if (!assert(imp.ok, 'migration: v' + ver + ' fixture rejected: ' + (imp.error || ''))) return;
    var s = E.getState();
    assert(s.version === 6, 'migration: v' + ver + ' should land on version 6');
    assert(Array.isArray(s.staff) && Array.isArray(s.staffMarket) &&
           Array.isArray(s.levelUpsToday),
           'migration: v' + ver + ' missing staff/levelUps fields');
    // §13: training/certs + article-seen bookkeeping fill in with sane defaults
    assert(s.training && Array.isArray(s.training.certsEarned) &&
           (s.training.studying === null || typeof s.training.studying === 'object'),
           'migration: v' + ver + ' missing training.{certsEarned,studying}');
    assert(Array.isArray(s.certsEarnedToday) && Array.isArray(s.articlesSeen),
           'migration: v' + ver + ' missing certsEarnedToday/articlesSeen');
    assert(s.staffMarket.every(function (m) {
      return m.level >= 1 && typeof m.title === 'string' && m.xp != null;
    }), 'migration: v' + ver + ' candidates missing level/xp/title');
    var allJobs = s.jobs.offers.concat(s.jobs.active);
    assert(allJobs.every(function (j) {
      var total = (j.steps || []).length + (j.pendingSteps || []).length;
      return total >= 2 && (j.steps || []).every(function (st) {
        return (st.kind === 'labor' || st.kind === 'wait') && st.running === false;
      });
    }), 'migration: v' + ver + ' steps missing kind/running/pendingSteps');
    // §12.6: single build selections came back as per-category slot arrays
    assert(allJobs.every(function (j) {
      return !j.build || (j.build.parts && !Array.isArray(j.build.parts) &&
                          Object.keys(j.build.parts).every(function (c) {
                            return Array.isArray(j.build.parts[c]);
                          }));
    }), 'migration: v' + ver + ' build.parts not wrapped into slot arrays');
    var day = E.endDay();
    assert(day.ok, 'migration: v' + ver + ' endDay failed: ' + (day.error || ''));
    // Play a job end-to-end on the migrated save
    var act = E.getActiveJobs()[0];
    if (act) {
      if (act.needsDiagnosis && !act.diagnosed) E.diagnoseJob(act.id);
      var w = E.workJob(act.id);
      assert(w.ok || /assign|cash|time|exhaust|waiting|nothing/i.test(w.error || ''),
             'migration: v' + ver + ' workJob broke: ' + (w.error || ''));
    }
    console.log('  v' + ver + ' fixture migrated & playable');
  });
  // Idempotence: v6 round-trips byte-identically
  E.importSave(v6snapshot);
  var v6b = E.exportSave();
  E.importSave(v6b);
  assert(E.exportSave() === v6b, 'migration: v6 re-import not byte-identical');
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
console.log('sim-test using: ' + DATA_SOURCE + ' | engine v' + Engine.VERSION);
assert(Engine.VERSION === '0.5', 'Engine.VERSION must be "0.5"');
assert(parseFloat(Engine.VERSION) >= 0.4, 'Engine.VERSION must stay parseFloat >= 0.4');
var lines = [];
try {
  DATA.ERAS.forEach(function (era, idx) {
    var line = runEra(era, idx, false);
    if (line) lines.push(line);
    if (era.startYear === 1983) runEra(era, idx, true);   // §9.6 metric run
  });
} catch (e) {
  fatal('era loop crashed: ' + e.stack);
}

// Cross-era assertions
var post91 = lines.filter(function (l) { return l.startYear >= 1991; });
if (post91.length) {
  assert(post91.some(function (l) { return l.builds >= 1; }),
         'no custom build completed in any post-1991 era');
}
assert(lines.some(function (l) { return l.refurbsSold >= 1; }),
       'no refurb flip completed in any era');
var totalCallbacks = lines.reduce(function (a, l) {
  return a + l.callbacksArrived + l.callbacksPending;
}, 0);
assert(totalCallbacks >= 1,
       'no warranty callback occurred/was scheduled across the whole run (quick-speed jobs)');

// §10.2: whole-dollar offers; §10.1: checklists everywhere
assert(globals.badPayOffer == null, 'non-integer offer pay: ' + globals.badPayOffer);
assert(globals.badStepsOffer == null, 'offer without a step checklist: ' + globals.badStepsOffer);
// §13.3: no unresolved copy tokens survived across any era's 40-day run
assert(globals.badCopyToken == null, 'unresolved copy token: ' + globals.badCopyToken);

// §11.1: builds only ever offered when witness-satisfiable within budget
assert(globals.buildWitnessFails.length === 0,
       'unsatisfiable build offers: ' + globals.buildWitnessFails.slice(0, 3).join(' | '));
if (REAL()) {
  assert(globals.buildsSeen >= 60,
         'need >=60 generated builds across eras to prove §11.1, saw ' + globals.buildsSeen);
}
console.log('build witnesses: ' + globals.buildsSeen + ' offers, all satisfiable in budget');

// §11.4: the generator produced varied OS requests
console.log('OS request kinds seen: ' + JSON.stringify(globals.osRequestKinds));
assert(Object.keys(globals.osRequestKinds).length >= 2,
       'OS request generator never varied: ' + JSON.stringify(globals.osRequestKinds));

// §9.2: a taste-matched job paid its bonus somewhere in the run
var catalogHasBrands = DATA.PARTS.some(function (p) { return !!p.brand; });
if (catalogHasBrands) {
  assert(globals.tasteBonusJobs >= 1,
         'no taste-matched job completed across the whole run');
  if (globals.tasteSampleNotes)
    console.log('taste sample: ' + globals.tasteSampleNotes +
                ' (' + globals.tasteBonusJobs + ' matched jobs total)');
} else {
  console.log('(catalog has no brands yet — taste-bonus assertion deferred to the mock run)');
}

// §9.3: a below-spec part was rejected with a readable error
assert(globals.minPerfRejected,
       'installPart/assignPart never rejected a below-minPerf part during the runs');
if (globals.minPerfRejected)
  console.log('minPerf rejection sample: "' + globals.minPerfRejectMsg + '"');

// §12.4: device offers honored the UI contract & era gates in every era run
assert(globals.deviceOfferBad == null, 'device offer contract: ' + globals.deviceOfferBad);
if ((DATA.APPLE_MACHINES || []).length || (DATA.MOBILE_DEVICES || []).length) {
  assert(globals.deviceOffers >= 1,
         'device tables present but no device_repair offer appeared in any era run');
  if (REAL()) {
    assert(globals.deviceRepairsDone >= 1,
           'no device_repair job completed across the real-data era runs');
  }
  console.log('device offers: ' + globals.deviceOffers + ' seen, ' +
              globals.deviceRepairsDone + ' completed in-era; multi-GPU asks: ' +
              globals.multiGpuOffers + ', RAM-heavy asks: ' + globals.ramHeavyOffers);
}

upgradeNoDowngradeScenario();
compatScenario();
var era1983 = DATA.ERAS.filter(function (e) { return e.startYear === 1983; })[0];
if (era1983) unlockScenario(era1983);
else console.log('(no 1983 era preset — unlock scenario skipped)');
overtimeScenario(DATA.ERAS[0]);
stripScenario(DATA.ERAS[0]);
stepScenario(DATA.ERAS[0]);
assignScenario(DATA.ERAS[DATA.ERAS.length - 1]);
overspendScenario(DATA.ERAS[DATA.ERAS.length - 1]);
qualityFlagsScenario(DATA.ERAS[DATA.ERAS.length - 1]);
sundayScenario(DATA.ERAS[0]);
staffScenario();
rampScenario(DATA.ERAS[0]);
diagMergeScenario(DATA.ERAS[0]);
osRequestScenario(DATA.ERAS[DATA.ERAS.length - 1]);
waitScenario(DATA.ERAS[0]);
staffXpScenario();
capacityScenario();
multiGpuRulesScenario();
sliBuildScenario();
ramHeavyScenario();
deviceScenario();
deviceWikiScenario();
chronicleScenario();
articleScenario();
certScenario();
migrationScenario(DATA.ERAS[DATA.ERAS.length - 1]);

finish();
