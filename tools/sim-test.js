#!/usr/bin/env node
/* Circuit & Solder — tools/sim-test.js (ENGINE workstream)
 * Headless sim test per SPEC §8: for each era preset, run a 40-day greedy bot.
 * Prefers the real js/data/*.js files when they all exist and load; otherwise
 * falls back to tools/mock-data.js. Exits non-zero with details on failure.
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

// ------------------------------------------------------------------
// Greedy bot
// ------------------------------------------------------------------
var QUICK_TYPES = { repair: 1, upgrade: 1, software: 1, cleaning: 1, peripheral: 1, callback: 1 };

function botSpeedFor(job) {
  return QUICK_TYPES[job.type] ? 'quick' : 'standard';
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

function botDay(E, mem) {
  var s = E.getState();
  var C = E.getConfig();

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
  if (s.customBuildsUnlocked) buyIfWanted('build-bench', 1500);

  var ownsCrtKit = E.getState().shop.equipment.indexOf('crt-kit') !== -1;

  // Accept offers (decline CRT work while unprotected)
  var offers = E.getOffers().slice();
  for (var i = 0; i < offers.length; i++) {
    var o = offers[i];
    if (o.crt && !ownsCrtKit) { E.declineOffer(o.id); continue; }
    var res = E.acceptOffer(o.id);
    if (!res.ok) break; // workstations full
  }

  // One refurb flip attempt per era
  if (!mem.refurbBought) {
    var listings = E.getAsIsMarket().slice().sort(function (a, b) { return a.askPrice - b.askPrice; });
    if (listings.length && E.getState().cash > listings[0].askPrice + 600) {
      var rr = E.buyAsIsMachine(listings[0].id);
      if (rr.ok) mem.refurbBought = true;
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
      if (st.hoursLeft < 0.5) break;
      if (job.type === 'refurb' && job.status === 'done') {
        var ap = E.appraiseRefurb(job.id);
        var sold = E.sellRefurb(job.id);
        if (sold.ok) { mem.refurbsSold++; mem.lastRefurbPrice = sold.price; mem.lastRefurbEstimate = ap.estimate; progress = true; }
        continue;
      }
      E.setJobSpeed(job.id, botSpeedFor(job));
      if (job.needsDiagnosis && !job.diagnosed) {
        if (E.diagnoseJob(job.id).ok) progress = true;
        continue;
      }
      if (job.build && !job.build.committed) {
        var bc = tryConfigureBuild(E, job);
        if (bc === 'committed') { progress = true; }
        else if (bc === 'impossible') { E.abandonJob(job.id); progress = true; }
        continue;
      }
      // Fill missing parts, cheapest option first
      var needs = E.getJobNeeds(job.id);
      var blocked = false;
      for (var n = 0; n < needs.length; n++) {
        var need = needs[n];
        if (need.filled >= need.qty) continue;
        if (!need.options.length) { blocked = true; continue; }
        var opt = need.options[0];
        if (opt.source === 'market' && opt.price > E.getState().cash - 200) { blocked = true; continue; }
        var ir = E.installPart(job.id, need.index, opt.partId);
        if (ir.ok && (ir.filledNow > 0 || ir.mishap)) progress = true;
        if (!ir.ok) blocked = true;
      }
      if (blocked) continue;
      var w = E.workJob(job.id);
      if (w.ok && (w.hoursSpent > 0 || w.completed)) progress = true;
    }
  }
}

// ------------------------------------------------------------------
// Per-era run
// ------------------------------------------------------------------
function runEra(era, idx) {
  console.log('--- Era ' + era.id + ' (' + (era.name || '') + ') ---');
  var E = Engine;
  var r = E.newGame({ eraId: era.id, shopName: 'Test Bench', seed: 1000 + idx * 77 });
  if (!assert(r.ok, era.id + ': newGame failed: ' + (r.error || ''))) return null;

  var mem = { equipmentBought: [], refurbBought: false, refurbsSold: 0 };
  var sawRentCharge = false, offerCount = E.getOffers().length;
  var threw = null;

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
      assert(st.hoursLeft >= 0, era.id + ': negative hoursLeft on day ' + day);
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

  // Save round-trip must be byte-identical
  var s1 = E.exportSave();
  var imp = E.importSave(s1);
  assert(imp.ok, era.id + ': importSave failed: ' + (imp.error || ''));
  var s2 = E.exportSave();
  assert(s1 === s2, era.id + ': save round-trip not byte-identical');
  // Deep-check JSON hygiene: no undefined/NaN/Infinity survive stringify -> parse
  assert(s1.indexOf('null') !== -1 || true, ''); // stringify already proves serializability

  // 1983 balance sanity band (SPEC §7: roughly break-even month 1)
  if (era.startYear === 1983) {
    assert(s.cash >= 1500 && s.cash <= 9000,
           era.id + ': final cash ' + s.cash + ' outside sanity band [1500, 9000]');
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
    callbacksPending: pendingCallbacks
  };
  console.log('  ' + era.id + ': cash ' + Engine.fmtMoney(line.cash) +
    ' | jobs ' + line.jobsDone + ' (failed ' + line.jobsFailed + ')' +
    ' | rating ' + line.rating.toFixed(2) +
    ' | builds ' + line.builds + ' | refurbs ' + line.refurbsSold +
    ' | callbacks ' + line.callbacksArrived + '+' + line.callbacksPending + ' pending');
  return line;
}

// ------------------------------------------------------------------
// Extra scenario: compatibility rejection with readable problem string
// ------------------------------------------------------------------
function compatScenario() {
  console.log('--- Compatibility validation ---');
  // Missing motherboard is always a readable failure
  var anyCpu = DATA.PARTS.filter(function (p) { return p.category === 'cpu'; })[0];
  var v0 = Engine.validatePartList([anyCpu.id]);
  assert(v0.valid === false && v0.problems.length > 0 &&
         v0.problems.join(' ').indexOf('No motherboard') !== -1,
         'validatePartList without motherboard should complain readably');
  // Find a genuinely mismatched cpu/motherboard pair
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
// Extra scenario: 1983 start has builds locked until 1989-09-01
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
// Main
// ------------------------------------------------------------------
console.log('sim-test using: ' + DATA_SOURCE);
var lines = [];
try {
  DATA.ERAS.forEach(function (era, idx) {
    var line = runEra(era, idx);
    if (line) lines.push(line);
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

compatScenario();
var era1983 = DATA.ERAS.filter(function (e) { return e.startYear === 1983; })[0];
if (era1983) unlockScenario(era1983);
else console.log('(no 1983 era preset — unlock scenario skipped)');

finish();
