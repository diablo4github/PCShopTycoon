#!/usr/bin/env node
/* Circuit & Solder — tools/sim-test.js (ENGINE workstream)
 * Headless sim test per SPEC §8 + §9.11: for each era preset, run a 40-day
 * greedy bot. Prefers the real js/data/*.js files when they all exist and load;
 * otherwise falls back to tools/mock-data.js. Exits non-zero with details.
 *
 * v2 additions: overtime borrow & floor, stripRefurb salvage, taste bonus,
 * upgrade minPerf rejection, 1983 jobs-vs-flips $/labor-hour metric,
 * v1 -> v2 save migration.
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
  console.log('sim-test PASSED (' + DATA_SOURCE + ')');
  process.exit(0);
}

// Cross-era trackers
var globals = {
  tasteBonusJobs: 0,          // completed jobs that paid a taste bonus
  tasteSampleNotes: null,
  minPerfRejected: false,     // installPart refused a below-spec part readably
  minPerfRejectMsg: ''
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

function tryConfigureBuild(E, job) {
  // Returns 'committed' | 'wait' | 'impossible'
  var s = E.getState();
  var mp = job.build.minPerf || {};
  var minStyle = job.build.minStyle || 0;
  var mobos = (E.getBuildCatalog(job.id).categories.motherboard || []).slice(0, 8);
  var sawViable = false;
  for (var mi = 0; mi < mobos.length; mi++) {
    E.setBuildPart(job.id, 'motherboard', mobos[mi].partId);
    var cat = E.getBuildCatalog(job.id).categories;
    function cheapest(category, pred, byStyle) {
      var list = (cat[category] || []).filter(function (c) {
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
        var list = (cat.psu || []).filter(function (c) { return c.compatible; });
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
      var r = E.installPart(job.id, need.index, below.partId);
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
    if (o.crt && !ownsCrtKit) { E.declineOffer(o.id); continue; }
    // Benchmark-era bot skips sub-$20 cleaning gigs — bench time goes to repairs
    if (mem.standardOnly && o.type === 'cleaning') { E.declineOffer(o.id); continue; }
    var res = E.acceptOffer(o.id);
    if (!res.ok) break; // workstations full
  }

  // Refurb flips: 1983 flips up to 4 machines (one at a time) so the §9.6
  // jobs-vs-flips metric has a real sample; other eras do one flip. The bot
  // buys the most valuable listing it can afford — flipping junk is a dud.
  var hasRefurb = E.getActiveJobs().some(function (j) { return j.type === 'refurb'; });
  var wantsFlip = mem.multiFlip ? mem.flipsStarted < 6 : !mem.refurbBought;
  if (!hasRefurb && wantsFlip) {
    // Value-aware pick: compute the exact expected flip margin from visible
    // info (part prices, ask, fault slot); take the FIRST listing clearing the
    // bar rather than the juiciest — max-margin picking amplifies tail luck.
    var C = E.getConfig();
    var year = E.dateInfo(E.getState().day).y;
    var best = null, bestMargin = 0;
    E.getAsIsMarket().forEach(function (m) {
      if (best) return;
      if (E.getState().cash <= m.askPrice + 600) return;
      var v = Engine.Jobs.machinePartsValue(E.getState(), m);
      var replCost = 0;
      if (m.faultPartIdx != null) {
        var dead = Engine.partById(m.partIds[m.faultPartIdx]);
        if (dead) {
          var cheapest = Engine.Jobs.purchasableByCategory(E.getState(), dead.category)
            .map(function (p) { return Engine.Pricing.priceOf(p, E.getState(), { buy: true }); })
            .sort(function (a, b) { return a - b; })[0];
          replCost = cheapest || 150;
        }
      }
      var margin = C.REFURB_SALE_RATIO * v +
                   Engine.laborRate(year) * C.REFURB_PREMIUM_HOURS -
                   m.askPrice - replCost;
      if (margin >= 150) { bestMargin = margin; best = m; }
    });
    if (best) {
      var rr = tracked(E, mem, true, function () { return E.buyAsIsMachine(best.id); });
      if (rr.ok) { mem.refurbBought = true; mem.flipsStarted++; }
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
      if (isFlip && job.status === 'done') {
        var sold = tracked(E, mem, true, function () { return E.sellRefurb(job.id); });
        if (sold.ok) { mem.refurbsSold++; progress = true; }
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
      // Fill missing parts
      var needs = E.getJobNeeds(job.id);
      var blocked = false;
      for (var n = 0; n < needs.length; n++) {
        var need = needs[n];
        if (need.filled >= need.qty) continue;
        var opt = chooseOption(E, job, need);
        if (!opt) { blocked = true; continue; }
        if (opt.source === 'market' && opt.price > E.getState().cash - 200) { blocked = true; continue; }
        var ir = tracked(E, mem, isFlip, function () {
          return E.installPart(job.id, need.index, opt.partId);
        });
        if (ir.ok && (ir.filledNow > 0 || ir.mishap)) progress = true;
        if (!ir.ok) blocked = true;
      }
      if (blocked) continue;
      var w = tracked(E, mem, isFlip, function () { return E.workJob(job.id); });
      if (w.ok && (w.hoursSpent > 0 || w.completed)) progress = true;
      if (w.ok && w.completed && w.result && w.result.tasteMatched) {
        globals.tasteBonusJobs++;
        if (!globals.tasteSampleNotes) globals.tasteSampleNotes = (w.result.notes || []).join(' | ');
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
  var threw = null;
  var otCap = E.getConfig().overtimeCap;

  for (var day = 0; day < 40; day++) {
    try {
      botDay(E, mem);
      var res = E.endDay();
      if (!assert(res.ok, era.id + ': endDay failed on day ' + day + ': ' + (res.error || ''))) break;
      var sum = res.summary;
      assert(typeof sum.dateStr === 'string' && sum.dateStr.length > 5,
             era.id + ': summary.dateStr malformed');
      offerCount += sum.newOffers.length;
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
  assert(offerCount > 0, era.id + ': no offers generated');
  assert(s.reputation.jobsCompleted >= 1, era.id + ': no job completed in 40 days');
  assert(sawRentCharge || s.ledger.months.length >= 2,
         era.id + ': monthly billing never fired');
  assert(mem.equipmentBought.length >= 1, era.id + ': bot never bought equipment');
  assert(!s.flags.gameOver, era.id + ': went bankrupt during the sim');

  // Wiki sanity (§9.7): entries only for released parts, with labels & status
  var wiki = E.getWiki({});
  assert(wiki.length > 0, era.id + ': empty wiki');
  var wikiBad = wiki.filter(function (w) {
    return !w.tagLabels || w.tagLabels.length !== w.tags.length ||
           ['new', 'current', 'fading', 'legacy', 'scarce'].indexOf(w.status) === -1;
  });
  assert(wikiBad.length === 0, era.id + ': malformed wiki entries: ' +
         wikiBad.slice(0, 3).map(function (w) { return w.partId; }).join(','));

  // Save round-trip must be byte-identical (v2 saves)
  var s1 = E.exportSave();
  var imp = E.importSave(s1);
  assert(imp.ok, era.id + ': importSave failed: ' + (imp.error || ''));
  var s2 = E.exportSave();
  assert(s1 === s2, era.id + ': save round-trip not byte-identical');

  // 1983 balance sanity band (§9.6: final cash $2k-$10k) — asserted on the
  // canonical single-flip greedy bot against the REAL catalog. The §9.6
  // balance targets are catalog-tuned; the tiny mock only verifies mechanics.
  if (era.startYear === 1983 && !metricRun && DATA_SOURCE.indexOf('real') === 0) {
    assert(s.cash >= 2000 && s.cash <= 10000,
           era.id + ': final cash ' + s.cash + ' outside sanity band [2000, 10000]');
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
    if (DATA_SOURCE.indexOf('real') === 0) {
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
  // Find a diagnosable repair job
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
  // An action whose cost would break the floor is refused
  s.hoursLeft = -2.9;
  s.supplyRunDoneToday = false;
  var anyPart = E.getMarket()[0];
  var br = E.buyPart(anyPart.partId, 1);   // needs a 0.5h supply run -> -3.4 < -3
  assert(!br.ok && /exhausted/i.test(br.error || ''),
         'overtime: floor-breaking action should be refused with the exhaustion message, got: ' +
         JSON.stringify(br));
  // Next morning: 8 + carried, min 5
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
  var unknowns = parts.filter(function (p) { return p.status === 'unknown'; });
  assert(unknowns.length <= 1, 'strip: more than one unknown slot before diagnosis');
  var invBefore = E.getState().inventory.reduce(function (a, e) { return a + e.qty; }, 0);
  var hoursBefore = E.getState().hoursLeft;
  var sr = E.stripRefurb(buy.jobId);
  if (!assert(sr.ok, 'strip: stripRefurb failed: ' + (sr.error || ''))) return;
  assert(sr.hoursSpent === 1.5 && Engine.round2(hoursBefore - E.getState().hoursLeft) === 1.5,
         'strip: should cost exactly 1.5h');
  var invAfter = E.getState().inventory.reduce(function (a, e) { return a + e.qty; }, 0);
  assert(sr.recovered.length >= 1, 'strip: nothing recovered (survival roll bug?)');
  assert(invAfter - invBefore === sr.recovered.length,
         'strip: inventory delta ' + (invAfter - invBefore) + ' != recovered ' + sr.recovered.length);
  assert(!E.getActiveJobs().some(function (j) { return j.id === buy.jobId; }),
         'strip: job should be removed');
  console.log('  recovered ' + sr.recovered.length + ' part(s), lost ' + sr.lost.length +
              ', 1.5h spent');
}

// ------------------------------------------------------------------
// Scenario (§9.11): v1 save fixture migrates through importSave
// ------------------------------------------------------------------
function migrationScenario(era) {
  console.log('--- v1 save migration ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Migrate Test', seed: 73737 });
  if (!assert(r.ok, 'migration: newGame failed')) return;
  // Get some jobs & a refurb into the state so migration has work to do
  var offers = E.getOffers().slice(0, 2);
  offers.forEach(function (o) { E.acceptOffer(o.id); });
  E.getState().cash = 50000;
  var listing = E.getAsIsMarket()[0];
  if (listing) E.buyAsIsMachine(listing.id);
  // Downgrade a v2 export into a faithful v1 fixture
  var obj = JSON.parse(E.exportSave());
  obj.version = 1;
  function strip(job) {
    if (!job) return;
    delete job.taste;
    if (job.machine) { delete job.machine.specSummary; delete job.machine.faultRepaired; }
  }
  (obj.jobs.offers || []).forEach(strip);
  (obj.jobs.active || []).forEach(strip);
  (obj.asIsMarket || []).forEach(function (m) { delete m.specSummary; });
  var fixture = JSON.stringify(obj);
  var imp = E.importSave(fixture);
  if (!assert(imp.ok, 'migration: importSave rejected a valid v1 save: ' + (imp.error || ''))) return;
  var s = E.getState();
  assert(s.version === 2, 'migration: version should be bumped to 2');
  var allJobs = s.jobs.offers.concat(s.jobs.active);
  var missingTaste = allJobs.filter(function (j) { return !('taste' in j); });
  assert(missingTaste.length === 0, 'migration: jobs missing taste default');
  var badMachines = allJobs.filter(function (j) {
    return j.machine && (typeof j.machine.specSummary !== 'string' ||
                         typeof j.machine.faultRepaired !== 'boolean');
  });
  assert(badMachines.length === 0, 'migration: refurb machines missing v2 fields');
  var badListings = s.asIsMarket.filter(function (m) { return typeof m.specSummary !== 'string'; });
  assert(badListings.length === 0, 'migration: as-is listings missing specSummary');
  var day = E.endDay();
  assert(day.ok, 'migration: endDay on migrated save failed: ' + (day.error || ''));
  // Idempotence: a v2 save round-trips byte-identically through import
  var v2a = E.exportSave();
  E.importSave(v2a);
  assert(E.exportSave() === v2a, 'migration: v2 re-import not byte-identical');
  console.log('  v1 fixture migrated, played a day, v2 round-trip stable');
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
console.log('sim-test using: ' + DATA_SOURCE);
var lines = [];
try {
  DATA.ERAS.forEach(function (era, idx) {
    var line = runEra(era, idx, false);
    if (line) lines.push(line);
    // §9.6: dedicated flip-metric run for the 1983 benchmark era
    if (era.startYear === 1983) runEra(era, idx, true);
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

// §9.2: a taste-matched job paid its bonus somewhere in the run. Tastes only
// exist when the catalog carries brands (§9.1) — old catalogs get a pass here
// (the mock run proves the feature until the real brand pass lands).
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
       'installPart never rejected a below-minPerf part during the runs');
if (globals.minPerfRejected)
  console.log('minPerf rejection sample: "' + globals.minPerfRejectMsg + '"');

compatScenario();
var era1983 = DATA.ERAS.filter(function (e) { return e.startYear === 1983; })[0];
if (era1983) unlockScenario(era1983);
else console.log('(no 1983 era preset — unlock scenario skipped)');
overtimeScenario(DATA.ERAS[0]);
stripScenario(DATA.ERAS[0]);
migrationScenario(DATA.ERAS[DATA.ERAS.length - 1]);

finish();
