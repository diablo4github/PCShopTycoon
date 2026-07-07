#!/usr/bin/env node
/* tools/validate-data.js — SPEC §8 data validator.
 * Loads the four data files, validates schemas, tag namespaces, coverage,
 * YEAR_BASELINES monotonicity, events, flavor, and — critically — that for
 * EVERY year 1983-2025 a full compatible build exists using SPEC §5.1 rules.
 * Exit 0 on pass, 1 on failure.
 */
'use strict';

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

['catalog', 'eras', 'events', 'flavor'].forEach(function (f) {
  require(path.join(ROOT, 'js', 'data', f + '.js'));
});
var DATA = globalThis.DATA;

var errors = [];
var warnings = [];
function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

var CATEGORIES = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case', 'cooling', 'os', 'peripheral'];
var TIERS = ['budget', 'mainstream', 'premium'];
var NAMESPACES = ['SKT', 'MEM', 'BUS', 'STOR', 'FF', 'ARCH'];
var NS_RE = /^(SKT|MEM|BUS|STOR|FF|ARCH)-[A-Z0-9]+$/;
// namespace a non-motherboard category is matched on (§5.1)
var CAT_NS = { cpu: 'SKT', ram: 'MEM', gpu: 'BUS', storage: 'STOR', psu: 'FF', case: 'FF', os: 'ARCH' };

function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
function isNum(x) { return typeof x === 'number' && isFinite(x); }
function isStr(x) { return typeof x === 'string' && x.length > 0; }
function tagsIn(part, ns) {
  return (part.platformTags || []).filter(function (t) { return t.indexOf(ns + '-') === 0; });
}

// ---------------------------------------------------------------- source scan
['catalog', 'eras', 'events', 'flavor'].forEach(function (f) {
  var src = fs.readFileSync(path.join(ROOT, 'js', 'data', f + '.js'), 'utf8');
  if (/Math\.random/.test(src)) err(f + '.js: uses Math.random (forbidden)');
  if (/document\./.test(src)) err(f + '.js: references document (forbidden)');
  if (/localStorage/.test(src)) err(f + '.js: references localStorage (forbidden)');
  if (!/typeof window !== 'undefined' \? window : globalThis/.test(src)) {
    err(f + '.js: missing SPEC §0 prologue/epilogue pattern');
  }
});

// ---------------------------------------------------------------- PARTS schema
if (!Array.isArray(DATA.PARTS)) { err('DATA.PARTS is not an array'); }
var PARTS = DATA.PARTS || [];
var byId = {};
PARTS.forEach(function (p, i) {
  var label = (p && p.id) ? p.id : ('PARTS[' + i + ']');
  if (!isStr(p.id)) err(label + ': missing/invalid id');
  else {
    if (byId[p.id]) err('duplicate part id: ' + p.id);
    byId[p.id] = p;
    if (!/^[a-z0-9-]+$/.test(p.id)) err(label + ': id not kebab-case');
    if (p.id.indexOf(p.category + '-') !== 0) err(label + ': id not prefixed by category "' + p.category + '"');
  }
  if (!isStr(p.name)) err(label + ': missing name');
  if (CATEGORIES.indexOf(p.category) === -1) err(label + ': bad category "' + p.category + '"');
  if (!Array.isArray(p.platformTags)) err(label + ': platformTags missing');
  else p.platformTags.forEach(function (t) {
    if (!NS_RE.test(t)) err(label + ': bad tag "' + t + '" (namespace prefix required)');
  });
  if (typeof p.perf !== 'object' || p.perf === null) err(label + ': perf missing');
  if (!isNum(p.reliability) || p.reliability < 0 || p.reliability > 100) err(label + ': reliability out of range');
  if (!isNum(p.basePrice) || p.basePrice <= 0) err(label + ': basePrice must be > 0');
  if (!isInt(p.introYear) || p.introYear < 1979 || p.introYear > 2026) err(label + ': introYear out of range');
  if (p.introMonth !== undefined && (!isInt(p.introMonth) || p.introMonth < 1 || p.introMonth > 12)) err(label + ': introMonth invalid');
  if (!isInt(p.eolYear) || p.eolYear < p.introYear) err(label + ': eolYear invalid (must be >= introYear)');
  if (TIERS.indexOf(p.tier) === -1) err(label + ': bad tier "' + p.tier + '"');
  if (p.legacy !== undefined && typeof p.legacy !== 'boolean') err(label + ': legacy must be boolean');
  // v2 (§9.1): brand required everywhere; desc required, wiki-grade, >= 40 chars
  if (!isStr(p.brand)) err(label + ': brand is required (v2 §9.1)');
  if (!isStr(p.desc) || p.desc.length < 40) err(label + ': desc is required and must be >= 40 chars (v2 §9.1)');

  // power fields
  if (p.category === 'psu') {
    if (!isNum(p.watts) || p.watts <= 0) err(label + ': psu needs watts > 0');
    if (p.powerDraw !== undefined) err(label + ': psu must not have powerDraw');
  } else {
    if (!isNum(p.powerDraw) || p.powerDraw < 0) err(label + ': powerDraw missing/invalid');
    if (p.watts !== undefined) err(label + ': watts is psu-only');
  }
  // style only on case & cooling
  if (p.style !== undefined) {
    if (p.category !== 'case' && p.category !== 'cooling') err(label + ': style only allowed on case/cooling');
    else if (!isNum(p.style) || p.style < 0 || p.style > 10) err(label + ': style out of 0-10');
  }
  if (p.integratedVideo !== undefined && p.category !== 'motherboard') err(label + ': integratedVideo is motherboard-only');

  // perf keys per category
  var perf = p.perf || {};
  switch (p.category) {
    case 'cpu': if (!isNum(perf.cpu) || perf.cpu <= 0) err(label + ': perf.cpu required'); break;
    case 'gpu': if (!isNum(perf.gpu) || perf.gpu <= 0) err(label + ': perf.gpu required'); break;
    case 'ram': if (!isNum(perf.ramMB) || perf.ramMB <= 0) err(label + ': perf.ramMB required'); break;
    case 'storage':
      if (!isNum(perf.storageGB) || perf.storageGB <= 0) err(label + ': perf.storageGB required');
      if (!isNum(perf.speed) || perf.speed < 1 || perf.speed > 100) err(label + ': perf.speed 1-100 required');
      break;
    case 'cooling':
      if (perf.cool !== undefined && (!isNum(perf.cool) || perf.cool < 1 || perf.cool > 10)) err(label + ': perf.cool out of 1-10');
      break;
  }

  // required namespace tags per category
  if (p.category === 'motherboard') {
    NAMESPACES.forEach(function (ns) {
      if (tagsIn(p, ns).length === 0) err(label + ': motherboard missing ' + ns + '-* tag');
    });
    if (tagsIn(p, 'FF').length !== 1) err(label + ': motherboard must have exactly one FF-* tag');
  } else if (CAT_NS[p.category]) {
    if (tagsIn(p, CAT_NS[p.category]).length === 0) {
      err(label + ': ' + p.category + ' needs at least one ' + CAT_NS[p.category] + '-* tag');
    }
  }
});
if (PARTS.length < 600 || PARTS.length > 700) {
  err('PARTS total ' + PARTS.length + ' outside v2 target 600-700 (§9.1)');
}

// ---------------------------------------------------------------- coverage table (v2 §9.1 minimums)
var BUCKETS = [[1979, 1984], [1985, 1990], [1991, 1995], [1996, 2000], [2001, 2005], [2006, 2010], [2011, 2015], [2016, 2020], [2021, 2025]];
var MIN_MAJOR = 5, MIN_MINOR = 3, MIN_BRANDS = 2;
var MAJOR = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case'];
var MINOR = ['cooling', 'os', 'peripheral'];
var cov = BUCKETS.map(function (b) {
  var row = { bucket: b[0] + '-' + b[1] };
  var brands = {};
  CATEGORIES.forEach(function (c) { row[c] = 0; brands[c] = {}; });
  PARTS.forEach(function (p) {
    if (p.introYear >= b[0] && p.introYear <= b[1]) {
      row[p.category]++;
      if (p.brand) brands[p.category][p.brand] = true;
    }
  });
  row._brands = {};
  CATEGORIES.forEach(function (c) { row._brands[c] = Object.keys(brands[c]).length; });
  MAJOR.forEach(function (c) {
    if (row[c] < MIN_MAJOR) err('coverage: bucket ' + row.bucket + ' has only ' + row[c] + ' ' + c + ' (need ' + MIN_MAJOR + ')');
    if (row._brands[c] < MIN_BRANDS) err('coverage: bucket ' + row.bucket + ' has only ' + row._brands[c] + ' distinct ' + c + ' brand(s) (need ' + MIN_BRANDS + ', v2 §9.1)');
  });
  MINOR.forEach(function (c) { if (row[c] < MIN_MINOR) err('coverage: bucket ' + row.bucket + ' has only ' + row[c] + ' ' + c + ' (need ' + MIN_MINOR + ')'); });
  return row;
});

// ---------------------------------------------------------------- YEAR_BASELINES
var YB = DATA.YEAR_BASELINES || {};
var ybYears = Object.keys(YB).map(Number).sort(function (a, b) { return a - b; });
if (ybYears.length === 0) err('YEAR_BASELINES missing');
else {
  if (ybYears[0] > 1983) err('YEAR_BASELINES must start at or before 1983');
  if (ybYears[ybYears.length - 1] < 2025) err('YEAR_BASELINES must reach 2025');
  for (var yi = 1; yi < ybYears.length; yi++) {
    if (ybYears[yi] - ybYears[yi - 1] > 3) err('YEAR_BASELINES gap > 3 years: ' + ybYears[yi - 1] + ' -> ' + ybYears[yi]);
  }
  var MONO = ['cpu', 'gpu', 'ramMB', 'storageGB', 'laborRate'];
  ybYears.forEach(function (y, i) {
    var row = YB[y];
    MONO.concat(['buildBudget']).forEach(function (k) {
      if (!isNum(row[k]) || row[k] <= 0) err('YEAR_BASELINES[' + y + '].' + k + ' missing/invalid');
    });
    if (i > 0) {
      MONO.forEach(function (k) {
        if (row[k] < YB[ybYears[i - 1]][k]) err('YEAR_BASELINES.' + k + ' not monotonic at ' + y);
      });
    }
  });
}

// ---------------------------------------------------------------- per-year buildable set (§5.1)
function avail(p, y) { return p.introYear <= y && y <= p.eolYear; }
function overlap(a, b) { return a.some(function (t) { return b.indexOf(t) !== -1; }); }

function findBuild(y) {
  var pool = {};
  CATEGORIES.forEach(function (c) { pool[c] = []; });
  PARTS.forEach(function (p) { if (avail(p, y)) pool[p.category].push(p); });

  var mobos = pool.motherboard;
  for (var m = 0; m < mobos.length; m++) {
    var mb = mobos[m];
    var mbTags = mb.platformTags;
    var mbFF = tagsIn(mb, 'FF');

    function fits(part) { // non-mobo part against mobo (§5.1)
      var ns = CAT_NS[part.category];
      return overlap(tagsIn(part, ns), mbTags);
    }
    var cpus = pool.cpu.filter(fits);
    var rams = pool.ram.filter(fits);
    var stors = pool.storage.filter(fits);
    var oss = pool.os.filter(fits);
    // case check is reversed: mobo's FF tag must appear in the case's accepted list
    var cases = pool['case'].filter(function (c) { return overlap(mbFF, c.platformTags); });
    var gpus = pool.gpu.filter(fits);
    if (!cpus.length || !rams.length || !stors.length || !oss.length || !cases.length) continue;
    if (!gpus.length && !mb.integratedVideo) continue;

    // minimize draw to prove a PSU exists
    function minDraw(list) { return list.reduce(function (a, b) { return a.powerDraw <= b.powerDraw ? a : b; }); }
    var cpu = minDraw(cpus), ram = minDraw(rams), stor = minDraw(stors);
    var os = oss[0], kase = cases[0];
    var variants = [];
    if (mb.integratedVideo) variants.push(null);
    if (gpus.length) variants.push(minDraw(gpus));

    for (var v = 0; v < variants.length; v++) {
      var gpu = variants[v];
      var draw = mb.powerDraw + cpu.powerDraw + ram.powerDraw + stor.powerDraw + (gpu ? gpu.powerDraw : 0);
      var need = 1.15 * draw;
      var psus = pool.psu.filter(function (ps) { return fits(ps) && ps.watts >= need; });
      if (psus.length) {
        return {
          motherboard: mb.id, cpu: cpu.id, ram: ram.id, storage: stor.id,
          gpu: gpu ? gpu.id : '(integrated)', psu: psus[0].id, 'case': kase.id, os: os.id
        };
      }
    }
  }
  return null;
}

var yearFails = 0, sampleBuilds = {};
for (var y = 1983; y <= 2025; y++) {
  var b = findBuild(y);
  if (!b) { err('no buildable full set for year ' + y); yearFails++; }
  else sampleBuilds[y] = b;
}

// ---------------------------------------------------------------- ERAS / SHOP_TIERS / EQUIPMENT
var ERA_PRESETS = { era1983: 3000, era1991: 6000, era1996: 9000, era2004: 14000, era2013: 20000, era2021: 30000 };
var ERAS = DATA.ERAS || [];
if (ERAS.length !== 6) err('DATA.ERAS must have 6 presets, has ' + ERAS.length);
ERAS.forEach(function (e) {
  var l = 'ERAS.' + e.id;
  if (!ERA_PRESETS.hasOwnProperty(e.id)) err(l + ': unexpected era id');
  else if (e.cash !== ERA_PRESETS[e.id]) err(l + ': cash ' + e.cash + ' != spec ' + ERA_PRESETS[e.id]);
  if (!isInt(e.startYear)) err(l + ': startYear missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate || '')) err(l + ': startDate not ISO');
  else if (Number(e.startDate.slice(0, 4)) !== e.startYear) err(l + ': startDate year != startYear');
  if (!isStr(e.name) || !isStr(e.blurb) || !isStr(e.difficulty)) err(l + ': name/blurb/difficulty required');
  if (!isInt(e.shopTier)) err(l + ': shopTier missing');
  var expectUnlocked = e.startYear >= 1991;
  if (e.customBuildsUnlocked !== expectUnlocked) err(l + ': customBuildsUnlocked should be ' + expectUnlocked);
});
if (DATA.CUSTOM_BUILD_UNLOCK_DATE !== '1989-09-01') err('CUSTOM_BUILD_UNLOCK_DATE must be "1989-09-01"');

var TIERS_ARR = DATA.SHOP_TIERS || [];
if (TIERS_ARR.length !== 4) err('SHOP_TIERS must have 4 tiers');
TIERS_ARR.forEach(function (t, i) {
  var l = 'SHOP_TIERS[' + i + ']';
  if (t.id !== i) err(l + ': id must equal index ' + i);
  ['rentBase', 'utilitiesBase', 'workstationSlots', 'storageSlots'].forEach(function (k) {
    if (!isNum(t[k]) || t[k] <= 0) err(l + ': ' + k + ' invalid');
  });
  if (!isNum(t.offerBonus) || t.offerBonus < 0) err(l + ': offerBonus invalid');
  if (i === 0 ? t.upgradeCost !== null : (!isNum(t.upgradeCost) || t.upgradeCost <= 0)) err(l + ': upgradeCost invalid');
  if (!isInt(t.minPrestige) || t.minPrestige !== i) err(l + ': minPrestige should be ' + i);
  if (i > 0 && t.workstationSlots <= TIERS_ARR[i - 1].workstationSlots) err(l + ': workstationSlots must increase');
  if (!isStr(t.name) || !isStr(t.desc)) err(l + ': name/desc required');
});

var REQ_EQUIP = {
  'repair-bench': {}, 'diag-station': { diagHoursMult: 0.5 }, 'build-bench': { enablesBuilds: true },
  'software-station': { softwareHoursMult: 0.75 }, 'dr-rig-1': { drTier: 1 }, 'dr-rig-2': { drTier: 2 },
  'dr-rig-3': { drTier: 3 }, 'crt-kit': { crtSafe: true }, 'esd-setup': { mishapMult: 0.2 },
  'test-bench': { callbackMult: 0.6 }
};
var ALLOWED_FX = ['diagHoursMult', 'enablesBuilds', 'softwareHoursMult', 'drTier', 'crtSafe', 'mishapMult', 'callbackMult'];
var EQ = DATA.EQUIPMENT || [];
var eqById = {};
EQ.forEach(function (q) {
  eqById[q.id] = q;
  if (!isStr(q.name) || !isStr(q.desc)) err('EQUIPMENT ' + q.id + ': name/desc required');
  if (!isNum(q.costBase) || q.costBase < 0) err('EQUIPMENT ' + q.id + ': costBase invalid');
  if (!isInt(q.introYear)) err('EQUIPMENT ' + q.id + ': introYear invalid');
  Object.keys(q.effects || {}).forEach(function (k) {
    if (ALLOWED_FX.indexOf(k) === -1) err('EQUIPMENT ' + q.id + ': unknown effect key ' + k);
  });
});
Object.keys(REQ_EQUIP).forEach(function (id) {
  var q = eqById[id];
  if (!q) { err('EQUIPMENT missing required id: ' + id); return; }
  var want = REQ_EQUIP[id];
  if (JSON.stringify(q.effects) !== JSON.stringify(want)) err('EQUIPMENT ' + id + ': effects must be ' + JSON.stringify(want));
});
if (eqById['dr-rig-2'] && eqById['dr-rig-2'].requires !== 'dr-rig-1') err('dr-rig-2 must require dr-rig-1');
if (eqById['dr-rig-3'] && eqById['dr-rig-3'].requires !== 'dr-rig-2') err('dr-rig-3 must require dr-rig-2');
if (eqById['repair-bench'] && eqById['repair-bench'].costBase !== 0) err('repair-bench costBase must be 0');

// ---------------------------------------------------------------- events
var REQ_HIST = ['dram-1988', 'sumitomo-1993', 'dotcom-boom', 'dotcom-bust', 'thailand-flood-2011', 'crypto-2017', 'gpu-drought-2020'];
var HIST = DATA.HISTORICAL_EVENTS || [];
var histIds = {};
HIST.forEach(function (e) {
  var l = 'HISTORICAL ' + e.id;
  if (histIds[e.id]) err(l + ': duplicate id'); histIds[e.id] = true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate || '') || isNaN(Date.parse(e.startDate))) err(l + ': bad startDate');
  if (!isInt(e.durationDays) || e.durationDays <= 0) err(l + ': durationDays invalid');
  if (!isStr(e.headline) || !isStr(e.body)) err(l + ': headline/body required');
  if (!Array.isArray(e.effects)) err(l + ': effects must be an array');
  else e.effects.forEach(function (fx) {
    if (!Array.isArray(fx.categories) || !fx.categories.length) err(l + ': effect.categories invalid');
    else fx.categories.forEach(function (c) { if (CATEGORIES.indexOf(c) === -1) err(l + ': bad effect category ' + c); });
    if (!isNum(fx.priceMult) || fx.priceMult <= 0) err(l + ': priceMult must be a scalar number in historical events');
  });
  if (e.jobVolumeMult !== undefined && (!isNum(e.jobVolumeMult) || e.jobVolumeMult <= 0)) err(l + ': jobVolumeMult invalid');
});
REQ_HIST.forEach(function (id) { if (!histIds[id]) err('HISTORICAL_EVENTS missing required event: ' + id); });

var REQ_TMPL = ['tariff', 'distributor-bankruptcy', 'competitor-closes', 'competitor-opens', 'press-coverage', 'warehouse-fire-sale', 'flu-season'];
var TMPL = DATA.RANDOM_EVENT_TEMPLATES || [];
var tmplIds = {};
function isRange(a) { return Array.isArray(a) && a.length === 2 && isNum(a[0]) && isNum(a[1]) && a[0] <= a[1]; }
TMPL.forEach(function (t) {
  var l = 'TEMPLATE ' + t.id;
  if (tmplIds[t.id]) err(l + ': duplicate id'); tmplIds[t.id] = true;
  if (!isNum(t.weight) || t.weight <= 0) err(l + ': weight invalid');
  if (!isInt(t.minYear) || !isInt(t.maxYear) || t.minYear > t.maxYear) err(l + ': minYear/maxYear invalid');
  if (!Array.isArray(t.headlines) || !t.headlines.length || !t.headlines.every(isStr)) err(l + ': headlines invalid');
  if (!isStr(t.body)) err(l + ': body required');
  if (!isRange(t.durationDays) || !isInt(t.durationDays[0])) err(l + ': durationDays must be [min,max]');
  if (!Array.isArray(t.effects)) err(l + ': effects must be an array');
  else t.effects.forEach(function (fx) {
    if (!Array.isArray(fx.categories) || !fx.categories.length) err(l + ': effect.categories invalid');
    else fx.categories.forEach(function (c) { if (CATEGORIES.indexOf(c) === -1) err(l + ': bad effect category ' + c); });
    if (!isRange(fx.priceMult)) err(l + ': priceMult must be a [min,max] range in templates');
  });
  if (!isNum(t.jobVolumeMult) || t.jobVolumeMult <= 0) err(l + ': jobVolumeMult invalid');
  if (!t.effects.length && t.jobVolumeMult === 1.0) err(l + ': event has no effect at all');
});
REQ_TMPL.forEach(function (id) { if (!tmplIds[id]) err('RANDOM_EVENT_TEMPLATES missing required template: ' + id); });

// ---------------------------------------------------------------- flavor
var FL = DATA.FLAVOR || {};
function needLen(arr, n, label) {
  if (!Array.isArray(arr) || arr.length < n) err('FLAVOR.' + label + ': need >= ' + n + ', has ' + (arr ? arr.length : 0));
}
needLen(FL.firstNames, 60, 'firstNames');
needLen(FL.lastNames, 60, 'lastNames');
needLen(FL.customerTypes, 6, 'customerTypes');
(FL.customerTypes || []).forEach(function (c) {
  if (!isStr(c.id) || !isStr(c.label)) err('FLAVOR.customerTypes: entries need id+label');
  if (c.minYear !== undefined && !isInt(c.minYear)) err('FLAVOR.customerTypes.' + c.id + ': minYear invalid');
});
var FAULT_KEYS = ['ram', 'storage', 'gpu', 'psu', 'motherboard', 'cpu', 'cooling'];
FAULT_KEYS.forEach(function (k) { needLen((FL.faults || {})[k], 4, 'faults.' + k); });
needLen((FL.faults || {}).laborOnly, 6, 'faults.laborOnly');
Object.keys(FL.faults || {}).forEach(function (k) {
  (FL.faults[k] || []).forEach(function (f) {
    if (!isStr(f.desc) || !isNum(f.laborHours) || f.laborHours <= 0) err('FLAVOR.faults.' + k + ': entries need desc + laborHours > 0');
  });
});
needLen(FL.machineAdjectives, 8, 'machineAdjectives');
// v2 (§9.2): blurbs are { text, customers: [ids] | null }; every ALLOWED customer type
// needs >= 2 fitting blurbs per job type (null customers fit everyone). The allowed-type
// map mirrors the engine's CUSTOMER_JOB_AFFINITY described in §9.2.
var BLURB_KEYS = ['repair', 'upgrade', 'build', 'data_recovery', 'software', 'cleaning', 'peripheral', 'enthusiast', 'contract'];
var ALL_CUST = (FL.customerTypes || []).map(function (c) { return c.id; });
var BLURB_AFFINITY = {
  repair: ALL_CUST, upgrade: ALL_CUST, build: ALL_CUST, data_recovery: ALL_CUST,
  software: ALL_CUST, cleaning: ALL_CUST,
  peripheral: ['home', 'smallbiz', 'office', 'senior'],
  enthusiast: ['gamer', 'student', 'creator', 'hobbyist', 'miner'],
  contract: ['smallbiz', 'office']
};
BLURB_KEYS.forEach(function (k) {
  var arr = (FL.jobBlurbs || {})[k];
  needLen(arr, 4, 'jobBlurbs.' + k);
  (arr || []).forEach(function (b, i) {
    var l = 'FLAVOR.jobBlurbs.' + k + '[' + i + ']';
    if (!b || typeof b !== 'object' || !isStr(b.text)) { err(l + ': must be { text, customers } with non-empty text (v2 §9.2)'); return; }
    if (b.customers !== null) {
      if (!Array.isArray(b.customers) || !b.customers.length) err(l + ': customers must be null or a non-empty array');
      else b.customers.forEach(function (cid) {
        if (ALL_CUST.indexOf(cid) === -1) err(l + ': unknown customer type id "' + cid + '"');
      });
    }
  });
  (BLURB_AFFINITY[k] || []).forEach(function (cid) {
    var fitting = (arr || []).filter(function (b) {
      return b && (b.customers === null || (Array.isArray(b.customers) && b.customers.indexOf(cid) !== -1));
    }).length;
    if (fitting < 2) err('FLAVOR.jobBlurbs.' + k + ': customer type "' + cid + '" has only ' + fitting + ' fitting blurb(s), need >= 2 (v2 §9.2)');
  });
});
needLen(FL.peripheralItems, 10, 'peripheralItems');
(FL.peripheralItems || []).forEach(function (it) {
  if (!isStr(it.name) || !isInt(it.minYear)) err('FLAVOR.peripheralItems: entries need name + minYear');
  if (it.maxYear !== undefined && (!isInt(it.maxYear) || it.maxYear < it.minYear)) err('FLAVOR.peripheralItems.' + it.name + ': maxYear invalid');
});
needLen(FL.shopNameSuggestions, 8, 'shopNameSuggestions');

// ---------------------------------------------------------------- report
function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
console.log('=== Coverage table (parts by introYear bucket) ===');
var head = pad('bucket', 10) + CATEGORIES.map(function (c) { return pad(c, 12); }).join('');
console.log(head);
cov.forEach(function (row) {
  console.log(pad(row.bucket, 10) + CATEGORIES.map(function (c) { return pad(row[c], 12); }).join(''));
});
var totals = {};
CATEGORIES.forEach(function (c) { totals[c] = PARTS.filter(function (p) { return p.category === c; }).length; });
console.log(pad('TOTAL', 10) + CATEGORIES.map(function (c) { return pad(totals[c], 12); }).join(''));
console.log('Total parts: ' + PARTS.length);

console.log('\n=== Per-year buildability 1983-2025 ===');
if (yearFails === 0) {
  console.log('OK: every year 1983-2025 has at least one era-valid full build.');
  [1983, 1990, 1996, 2004, 2013, 2021, 2025].forEach(function (yy) {
    var s = sampleBuilds[yy];
    if (s) console.log('  ' + yy + ': ' + s.motherboard + ' + ' + s.cpu + ' + ' + s.ram + ' + ' + s.storage + ' + ' + s.gpu + ' + ' + s.psu + ' + ' + s['case'] + ' + ' + s.os);
  });
} else {
  console.log('FAILED for ' + yearFails + ' year(s) — see errors.');
}

console.log('\n=== Summary ===');
console.log('Parts: ' + PARTS.length + ' | Eras: ' + (DATA.ERAS || []).length + ' | Tiers: ' + TIERS_ARR.length +
  ' | Equipment: ' + EQ.length + ' | Historical events: ' + HIST.length + ' | Random templates: ' + TMPL.length);
console.log('Baseline years: ' + ybYears.join(', '));

if (warnings.length) {
  console.log('\nWARNINGS (' + warnings.length + '):');
  warnings.forEach(function (w) { console.log('  ! ' + w); });
}
if (errors.length) {
  console.error('\nFAIL — ' + errors.length + ' error(s):');
  errors.forEach(function (e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
console.log('\nPASS — all data checks green.');
process.exit(0);
