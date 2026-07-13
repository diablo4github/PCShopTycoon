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

var CATEGORIES = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case', 'cooling', 'os', 'peripheral', 'expansion'];
var TIERS = ['budget', 'mainstream', 'premium'];
var NAMESPACES = ['SKT', 'MEM', 'BUS', 'STOR', 'FF', 'ARCH'];
var NS_RE = /^(SKT|MEM|BUS|STOR|FF|ARCH)-[A-Z0-9]+$/;
// namespace a non-motherboard category is matched on (§5.1; expansion per v0.4b §12.3 = BUS overlap)
var CAT_NS = { cpu: 'SKT', ram: 'MEM', gpu: 'BUS', storage: 'STOR', psu: 'FF', case: 'FF', os: 'ARCH', expansion: 'BUS' };

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

// ---------------------------------------------------------------- v0.6.1 §16.2a corruption guard
// A find/replace once turned literal "$1" into " }," inside desc strings (PLAYTEST-v0.5
// P1.1). No string VALUE anywhere in DATA may contain the " }," artifact — the general
// / \},/ pattern also covers the " },<digit>" and " },," variants. (A raw source scan
// can't be used: " }," appears legitimately as an object terminator in code.)
(function scanCorruption(node, where) {
  if (typeof node === 'string') {
    if (/ \},/.test(node)) err('corruption guard: ' + where + ' contains the " }," $1-replacement artifact (§16.2a)');
    return;
  }
  if (Array.isArray(node)) { node.forEach(function (v, i) { scanCorruption(v, where + '[' + i + ']'); }); return; }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach(function (k) { scanCorruption(node[k], where + '.' + k); });
  }
})(DATA, 'DATA');

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
  // v0.9 §19.7: removable flag (Zip/Jaz/LS-120/optical/tape/floppy) — storage-only, true-only
  if (p.removable !== undefined && (p.removable !== true || p.category !== 'storage')) {
    err(label + ': removable must be exactly true and only on storage parts (§19.7)');
  }
  if (p.category === 'storage' && /floppy|\bzip\b|\bjaz\b|ls-120|superdisk|ez ?135|tape|cd-r|dvd|blu-ray|optical/i.test(p.name) && p.removable !== true) {
    err(label + ': removable-media storage (by name) must carry removable: true (§19.7)');
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

  // v0.4b §12.1: slots required on every motherboard, sane ranges (research §1.2 exceptions:
  // gpu 0 allowed on integrated-only boards like i810; up to 8 on pre-PCI ISA/VLB boards).
  if (p.category === 'motherboard') {
    var sl = p.slots;
    if (!sl || !isInt(sl.ram) || !isInt(sl.gpu) || !isInt(sl.storage)) {
      err(label + ': motherboard needs slots { ram, gpu, storage } (v0.4b §12.1)');
    } else {
      if (sl.ram < 1 || sl.ram > 16) err(label + ': slots.ram ' + sl.ram + ' outside 1-16');
      if (sl.storage < 1 || sl.storage > 12) err(label + ': slots.storage ' + sl.storage + ' outside 1-12');
      var busTags = tagsIn(p, 'BUS');
      var isaEra = busTags.length > 0 && busTags.every(function (t) { return t === 'BUS-ISA8' || t === 'BUS-ISA16' || t === 'BUS-VLB'; });
      var gpuMin = p.integratedVideo ? 0 : 1;
      var gpuMax = isaEra ? 8 : 4;
      if (sl.gpu < gpuMin || sl.gpu > gpuMax) err(label + ': slots.gpu ' + sl.gpu + ' outside sane range [' + gpuMin + ', ' + gpuMax + ']');
    }
  } else if (p.slots !== undefined) err(label + ': slots is motherboard-only');

  // v0.4b §12.2: sliTag year windows; addonOnly reserved for Voodoo2-class add-on GPUs
  if (p.sliTag !== undefined) {
    if (p.category !== 'gpu') err(label + ': sliTag is gpu-only');
    else if (!isStr(p.sliTag)) err(label + ': sliTag must be a non-empty string');
    else if (p.sliTag === 'VOODOO2') {
      if (p.introYear < 1998 || p.introYear > 2000) err(label + ': VOODOO2 sliTag outside the 1998-2000 window');
    } else if (p.introYear < 2004 || p.introYear > 2020) {
      err(label + ': sliTag GPU intro ' + p.introYear + ' outside the 2004-2020 SLI/CrossFire window');
    }
  }
  if (p.addonOnly !== undefined && (p.addonOnly !== true || p.sliTag !== 'VOODOO2')) {
    err(label + ': addonOnly is reserved for Voodoo2-class 3D add-on GPUs');
  }
});
var v2Cards = PARTS.filter(function (p) { return p.sliTag === 'VOODOO2'; });
if (v2Cards.length < 2) err('v0.4b §12.2: need >= 2 Voodoo2 GPUs sharing sliTag "VOODOO2", have ' + v2Cards.length);
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
  if (b[0] >= 1985 && row.expansion < 2) err('coverage: bucket ' + row.bucket + ' has only ' + row.expansion + ' expansion (need 2, v0.4b §12.3)');
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
    // v0.4b §12.6: witness respects slot capacity (1 ram + 1 storage + optional 1 gpu)
    var caps = mb.slots || { ram: 99, gpu: 99, storage: 99 };
    if (caps.ram < 1 || caps.storage < 1) continue;

    function fits(part) { // non-mobo part against mobo (§5.1)
      var ns = CAT_NS[part.category];
      return overlap(tagsIn(part, ns), mbTags);
    }
    var cpus = pool.cpu.filter(fits);
    var rams = pool.ram.filter(fits);
    // v0.9 §19.7: from 1988 the witness build's storage must be PRIMARY — floppy
    // (STOR-FDD) or removable media never satisfy it alone. Pre-1988 floppy-only
    // builds are legitimate PC/XT reality (the educational point).
    var stors = pool.storage.filter(fits).filter(function (s) {
      if (y < 1988) return true;
      return s.removable !== true && tagsIn(s, 'STOR').indexOf('STOR-FDD') === -1;
    });
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
      if (gpu && caps.gpu < 1) continue; // no GPU slot — integrated-only boards
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

// ---------------------------------------------------------------- v0.6.1 §16.4 socket consistency
// Decision (P3, PLAYTEST-v0.5): the Pentium 60 is retagged to its historical SKT-4 with
// a matching Socket 4 board, rather than silently extending the documented §2.2
// "Socket 5/7 as SKT-7" merge to Socket 4 (5V Socket 4 chips never fit Socket 5/7).
// Enforce both the specific decision and the general invariant behind it: no CPU may be
// stranded — every CPU must share a SKT-* tag with >= 1 motherboard whose availability
// window overlaps its own.
var p60 = byId['cpu-pentium-60'];
if (p60 && (p60.platformTags || []).indexOf('SKT-4') === -1) {
  err('cpu-pentium-60 must carry SKT-4 (historical Socket 4; §16.4 decision — see PLAYTEST-v0.5 P3)');
}
if (p60 && !PARTS.some(function (p) { return p.category === 'motherboard' && (p.platformTags || []).indexOf('SKT-4') !== -1; })) {
  err('SKT-4 retag requires a matching Socket 4 motherboard (§16.4)');
}
var allBoards = PARTS.filter(function (p) { return p.category === 'motherboard'; });
PARTS.forEach(function (p) {
  if (p.category !== 'cpu') return;
  var skts = tagsIn(p, 'SKT');
  var ok = allBoards.some(function (mb) {
    return overlap(skts, mb.platformTags) && mb.introYear <= p.eolYear && p.introYear <= mb.eolYear;
  });
  if (!ok) err(p.id + ': stranded CPU — no motherboard shares a SKT tag within its availability window (§16.4)');
});

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
// v0.5.1 §14.5/§14.7: effect keys whose presence gates or materially unlocks a job
// type/tier (per §2.6 "required for X" notes and the §14.7 effect vocabulary). mishapMult/
// callbackMult/diagHoursMult only speed existing work or trim mishap odds, so they're exempt.
var GATING_FX = ['enablesBuilds', 'softwareHoursMult', 'drTier', 'crtSafe'];
var GATE_KEYWORDS = {
  enablesBuilds: /\bbuild/i,
  softwareHoursMult: /\bsoftware|\bvirus|\bos install/i,
  drTier: /\bdata recovery|\brecovery\b/i,
  crtSafe: /\bcrt\b|\bdischarge\b|\bshock\b|\bmonitor/i
};
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
  // §14.7: every item needs a real, readable desc...
  if (!isStr(q.desc) || q.desc.length < 20) err('EQUIPMENT ' + q.id + ': desc must be >= 20 chars (§14.7)');
  // ...and any item whose effects gate a job type must say so in desc, or carry unlocksLabel
  // (the UI's "Unlocks: ..." badge source, §14.5).
  if (q.unlocksLabel !== undefined && !isStr(q.unlocksLabel)) err('EQUIPMENT ' + q.id + ': unlocksLabel must be a non-empty string when present');
  var fx = q.effects || {};
  var gateKeys = GATING_FX.filter(function (k) { return fx[k] !== undefined && fx[k] !== false && fx[k] !== 0; });
  if (gateKeys.length) {
    var hasLabel = isStr(q.unlocksLabel);
    var mentionsPurpose = gateKeys.some(function (k) { return GATE_KEYWORDS[k].test(q.desc || ''); });
    if (!hasLabel && !mentionsPurpose) {
      err('EQUIPMENT ' + q.id + ': gates job type via ' + gateKeys.join('/') +
        ' but desc doesn\'t explain the unlock and no unlocksLabel is set (§14.5/§14.7)');
    }
  }
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

var REQ_TMPL = ['tariff', 'distributor-bankruptcy', 'competitor-closes', 'competitor-opens', 'press-coverage', 'warehouse-fire-sale', 'flu-season',
  // v0.6.1 §16.4 mid/late-era additions
  'mining-noise', 'oem-recall', 'right-to-repair', 'bigbox-sale'];
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
// v0.6.1 §16.4: the four new templates must stay era-gated to mid/late eras
var TMPL_MIN_GATES = { 'mining-noise': 2013, 'oem-recall': 2000, 'right-to-repair': 2015, 'bigbox-sale': 1995 };
TMPL.forEach(function (t) {
  if (TMPL_MIN_GATES[t.id] !== undefined && t.minYear < TMPL_MIN_GATES[t.id]) {
    err('TEMPLATE ' + t.id + ': minYear ' + t.minYear + ' breaks its era gate (must be >= ' + TMPL_MIN_GATES[t.id] + ', §16.4)');
  }
});

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

// ---------------------------------------------------------------- v0.3 (§10.5) fault complaints & peripheral kinds
Object.keys(FL.faults || {}).forEach(function (k) {
  (FL.faults[k] || []).forEach(function (f, i) {
    if (!Array.isArray(f.complaints) || f.complaints.length < 2 || !f.complaints.every(isStr)) {
      err('FLAVOR.faults.' + k + '[' + i + ']: needs complaints array with >= 2 strings (v0.3 §10.5)');
    }
  });
});

// ---------------------------------------------------------------- v0.9 §19.4 fog-of-war clue audit
// Pre-diagnosis, the complaint IS the hint: it must never name the faulty
// category outright (the literal partCategory word, or its obvious retail
// synonyms). Knowledgeable players read the period clue instead (parity errors
// -> memory; click-of-death -> drive; one long + two short beeps -> video...).
var COMPLAINT_BANS = {
  ram: /\bram\b|\bmemory\b|\bsimm\b|\bdimm\b/i,
  storage: /\bstorage\b|hard (disk|drive)|\bhdd\b|\bssd\b/i,
  gpu: /\bgpu\b|video card|graphics card/i,
  psu: /\bpsu\b|power supply/i,
  motherboard: /\bmotherboard\b|system board|\bmobo\b/i,
  cpu: /\bcpu\b|\bprocessor\b/i,
  cooling: /\bcooling\b|\bheatsink\b|\bcooler\b|\bfan\b/i
};
Object.keys(COMPLAINT_BANS).forEach(function (k) {
  (FL.faults && FL.faults[k] || []).forEach(function (f, i) {
    (f.complaints || []).forEach(function (c, j) {
      if (COMPLAINT_BANS[k].test(c)) {
        err('FLAVOR.faults.' + k + '[' + i + '].complaints[' + j + ']: names the faulty category ("' +
          (c.match(COMPLAINT_BANS[k]) || [''])[0] + '") — complaints must clue, not name (§19.4)');
      }
    });
  });
});
var PERIPH_KINDS = ['printer', 'crt', 'lcd', 'modem', 'input', 'scanner', 'other'];
(FL.peripheralItems || []).forEach(function (it) {
  var l = 'FLAVOR.peripheralItems.' + it.name;
  if (PERIPH_KINDS.indexOf(it.kind) === -1) err(l + ': kind must be one of ' + PERIPH_KINDS.join('|') + ' (v0.3 §10.5)');
  if (!Array.isArray(it.complaints) || it.complaints.length < 2 || !it.complaints.every(isStr)) err(l + ': needs >= 2 complaints');
  if (!Array.isArray(it.faultDescs) || it.faultDescs.length < 2 || !it.faultDescs.every(isStr)) err(l + ': needs >= 2 faultDescs');
});
needLen(FL.staffNames, 25, 'staffNames');
// v0.9 §19.9(#17): easter-egg names present in the pools (sentinel check)
if ((FL.staffNames || []).indexOf('Ada Lovejoy') === -1) err('FLAVOR.staffNames: missing the §19.9 easter-egg additions (sentinel "Ada Lovejoy")');
if ((FL.lastNames || []).indexOf('Babbage') === -1) err('FLAVOR.lastNames: missing the §19.9 easter-egg additions (sentinel "Babbage")');
if ((FL.firstNames || []).indexOf('Ada') === -1) err('FLAVOR.firstNames: missing the §19.9 easter-egg additions (sentinel "Ada")');

// ---------------------------------------------------------------- v0.3 (§10.7) staff roles
var JOB_TYPES = ['repair', 'upgrade', 'build', 'refurb', 'data_recovery', 'software', 'cleaning', 'peripheral', 'contract', 'enthusiast', 'callback', 'device_repair'];

// ---------------------------------------------------------------- v0.4b (§12.4) device tables
var APPLE_FAMILIES = ['APPLE-68K', 'APPLE-PPC', 'APPLE-INTEL', 'APPLE-SILICON'];
var AM = DATA.APPLE_MACHINES || [];
if (AM.length < 22) err('APPLE_MACHINES: need >= 22 machines (research §3.2), have ' + AM.length);
var amIds = {};
AM.forEach(function (d) {
  var l = 'APPLE_MACHINES.' + d.id;
  if (!isStr(d.id) || amIds[d.id]) err(l + ': missing/duplicate id'); amIds[d.id] = true;
  if (!isStr(d.name)) err(l + ': name required');
  if (APPLE_FAMILIES.indexOf(d.family) === -1) err(l + ': family must be one of ' + APPLE_FAMILIES.join('|'));
  if (!isInt(d.introYear) || !isInt(d.eolYear) || d.eolYear < d.introYear) err(l + ': intro/eol invalid');
  if (typeof d.ramUpgradable !== 'boolean' || typeof d.hddUpgradable !== 'boolean') err(l + ': ramUpgradable/hddUpgradable must be booleans');
  if (d.cpuUpgradable !== false) err(l + ': cpuUpgradable must be false (no CPU upgrades ever)');
  if (!Array.isArray(d.basePriceRange) || d.basePriceRange.length !== 2 || !isNum(d.basePriceRange[0]) ||
      !isNum(d.basePriceRange[1]) || d.basePriceRange[0] >= d.basePriceRange[1]) err(l + ': basePriceRange must be [lo, hi]');
  if (!Array.isArray(d.faultCategories) || !d.faultCategories.length || !d.faultCategories.every(isStr)) err(l + ': faultCategories required');
  if (!isStr(d.desc) || d.desc.length < 40) err(l + ': desc must tell the repairability story (>= 40 chars)');
});

var MD = DATA.MOBILE_DEVICES || [];
if (MD.length < 10) err('MOBILE_DEVICES: need >= 10 devices, have ' + MD.length);
var mdIds = {};
MD.forEach(function (d) {
  var l = 'MOBILE_DEVICES.' + d.id;
  if (!isStr(d.id) || mdIds[d.id]) err(l + ': missing/duplicate id'); mdIds[d.id] = true;
  if (['smartphone', 'tablet'].indexOf(d.kind) === -1) err(l + ': kind must be smartphone|tablet');
  if (!isStr(d.name) || !isStr(d.brand)) err(l + ': name/brand required');
  if (!isInt(d.introYear) || !isInt(d.eolYear) || d.eolYear < d.introYear) err(l + ': intro/eol invalid');
  if (d.kind === 'smartphone' && d.introYear < 2007) err(l + ': smartphones start 2007');
  if (d.kind === 'tablet' && d.introYear < 2010) err(l + ': tablets start 2010');
  if (TIERS.indexOf(d.tier) === -1) err(l + ': tier invalid');
});
if (!MD.some(function (d) { return d.kind === 'smartphone'; })) err('MOBILE_DEVICES: no smartphones');
if (!MD.some(function (d) { return d.kind === 'tablet'; })) err('MOBILE_DEVICES: no tablets');

var MOBILE_FAULT_KINDS = ['screen', 'battery', 'charge-port', 'water-damage', 'camera', 'speaker-mic', 'button'];
var MF = DATA.MOBILE_FAULTS || {};
MOBILE_FAULT_KINDS.forEach(function (k) {
  var arr = MF[k];
  if (!Array.isArray(arr) || !arr.length) { err('MOBILE_FAULTS.' + k + ': missing/empty'); return; }
  arr.forEach(function (f, i) {
    var l = 'MOBILE_FAULTS.' + k + '[' + i + ']';
    if (!isStr(f.desc)) err(l + ': desc required');
    if (!Array.isArray(f.complaints) || f.complaints.length < 2 || !f.complaints.every(isStr)) err(l + ': complaints >= 2 required');
    if (!Array.isArray(f.faultDescs) || f.faultDescs.length < 2 || !f.faultDescs.every(isStr)) err(l + ': faultDescs >= 2 required');
    if (!isNum(f.laborHours) || f.laborHours <= 0) err(l + ': laborHours > 0 required');
    if (!isNum(f.partsCostFactor) || f.partsCostFactor <= 0) err(l + ': partsCostFactor > 0 required');
  });
});
Object.keys(MF).forEach(function (k) { if (MOBILE_FAULT_KINDS.indexOf(k) === -1) err('MOBILE_FAULTS: unknown kind "' + k + '"'); });
var ROLES = DATA.STAFF_ROLES || [];
if (ROLES.length !== 4) err('STAFF_ROLES must have exactly 4 roles, has ' + ROLES.length);
var roleNames = ROLES.map(function (r) { return r.name; });
['Technician', 'Software Specialist', 'Builder', 'Apprentice'].forEach(function (n) {
  if (roleNames.indexOf(n) === -1) err('STAFF_ROLES missing required role: ' + n);
});
var roleIds = {};
ROLES.forEach(function (r) {
  var l = 'STAFF_ROLES.' + r.id;
  if (!isStr(r.id) || roleIds[r.id]) err(l + ': missing/duplicate id'); roleIds[r.id] = true;
  if (!isStr(r.name) || !isStr(r.desc)) err(l + ': name/desc required');
  if (!Array.isArray(r.jobTypes) || !r.jobTypes.length) err(l + ': jobTypes required');
  else r.jobTypes.forEach(function (t) { if (JOB_TYPES.indexOf(t) === -1) err(l + ': unknown jobType ' + t); });
  if (!isNum(r.wageFactor) || r.wageFactor <= 0) err(l + ': wageFactor invalid');
  if (r.minYear !== undefined && !isInt(r.minYear)) err(l + ': minYear invalid');
});
var appr = ROLES.filter(function (r) { return r.name === 'Apprentice'; })[0];
if (appr) ROLES.forEach(function (r) {
  if (r !== appr && r.wageFactor <= appr.wageFactor) err('STAFF_ROLES: Apprentice must be the cheapest role');
});

// ---------------------------------------------------------------- v0.3 (§10.1) TASK_STEPS coverage matrix
var TS = DATA.TASK_STEPS || [];
if (!Array.isArray(TS) || !TS.length) err('DATA.TASK_STEPS missing/empty (v0.3 §10.1)');
var CONDS = ['cooler', 'crt-kit'];
TS.forEach(function (t, i) {
  var l = 'TASK_STEPS[' + i + '] (' + t.type + '/' + (t.partCategory || '*') + '/' + (t.subtype || '*') + ')';
  if (JOB_TYPES.indexOf(t.type) === -1) err(l + ': bad type');
  if (t.partCategory !== null && CATEGORIES.indexOf(t.partCategory) === -1) err(l + ': bad partCategory');
  if (t.subtype !== null && !isStr(t.subtype)) err(l + ': subtype must be null or string');
  if (t.minYear !== null && !isInt(t.minYear)) err(l + ': minYear must be null or int');
  if (t.maxYear !== null && !isInt(t.maxYear)) err(l + ': maxYear must be null or int');
  if (!Array.isArray(t.steps) || t.steps.length < 3) err(l + ': needs >= 3 steps');
  else t.steps.forEach(function (s, j) {
    if (!isStr(s.label)) err(l + ' step[' + j + ']: label required');
    if (!isNum(s.hours) || s.hours <= 0 || s.hours > 2) err(l + ' step[' + j + ']: hours must be in (0, 2]');
    if (Math.abs(s.hours * 10 - Math.round(s.hours * 10)) > 1e-9 && Math.abs(s.hours * 4 - Math.round(s.hours * 4)) > 1e-9) {
      err(l + ' step[' + j + ']: hours must sit on the 0.1 grid (or quarter-hours)');
    }
    if (s.cond !== undefined && CONDS.indexOf(s.cond) === -1) err(l + ' step[' + j + ']: unknown cond ' + s.cond);
    if (s.minYear !== undefined && !isInt(s.minYear)) err(l + ' step[' + j + ']: minYear invalid');
    if (s.maxYear !== undefined && !isInt(s.maxYear)) err(l + ' step[' + j + ']: maxYear invalid');
    if (s.wait !== undefined && s.wait !== true) err(l + ' step[' + j + ']: wait must be exactly true when present (§19.8)');
  });
});

// most-specific-match resolver (§10.1): type exact; partCategory/subtype exact-or-null; year window
function resolveSteps(type, cat, sub, y) {
  var best = null, bestScore = -1;
  TS.forEach(function (t) {
    if (t.type !== type) return;
    if (t.partCategory !== null && t.partCategory !== cat) return;
    if (t.subtype !== null && t.subtype !== sub) return;
    if (t.minYear !== null && y < t.minYear) return;
    if (t.maxYear !== null && y > t.maxYear) return;
    var score = (t.partCategory !== null ? 2 : 0) + (t.subtype !== null ? 2 : 0) +
                ((t.minYear !== null || t.maxYear !== null) ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = t; }
  });
  if (!best) return null;
  var inYear = best.steps.filter(function (s) {
    return (s.minYear === undefined || y >= s.minYear) && (s.maxYear === undefined || y <= s.maxYear);
  });
  var certain = inYear.filter(function (s) { return s.cond === undefined; });
  function sum(a) { return a.reduce(function (t2, s) { return t2 + s.hours; }, 0); }
  return { tpl: best, count: certain.length, sumMin: sum(certain), sumMax: sum(inYear) };
}

var SAMPLE_YEARS = [1984, 1993, 1999, 2007, 2015, 2023];
function kindYears(kind) { // years where at least one peripheral item of the kind exists
  return SAMPLE_YEARS.filter(function (y) {
    return (FL.peripheralItems || []).some(function (it) {
      return it.kind === kind && it.minYear <= y && (it.maxYear === undefined || y <= it.maxYear);
    });
  });
}
var COMBOS = [];
['cpu', 'ram', 'storage', 'gpu', 'psu', 'motherboard', 'cooling', null].forEach(function (c) {
  COMBOS.push({ type: 'repair', cat: c, sub: null, years: SAMPLE_YEARS });
});
['cpu', 'ram', 'storage', 'gpu', 'psu', 'cooling', 'motherboard', null].forEach(function (c) {
  COMBOS.push({ type: 'upgrade', cat: c, sub: null, years: SAMPLE_YEARS });
});
COMBOS.push({ type: 'build', cat: null, sub: null, years: SAMPLE_YEARS });
COMBOS.push({ type: 'refurb', cat: null, sub: null, years: SAMPLE_YEARS });
COMBOS.push({ type: 'callback', cat: null, sub: null, years: SAMPLE_YEARS });
COMBOS.push({ type: 'contract', cat: null, sub: 'contract_build', years: SAMPLE_YEARS });
COMBOS.push({ type: 'contract', cat: null, sub: 'contract_upgrade', years: SAMPLE_YEARS });
COMBOS.push({ type: 'software', cat: null, sub: 'os_install', years: SAMPLE_YEARS });
COMBOS.push({ type: 'software', cat: null, sub: 'virus', years: SAMPLE_YEARS.filter(function (y) { return y >= 1988; }) });
COMBOS.push({ type: 'cleaning', cat: null, sub: null, years: SAMPLE_YEARS });
COMBOS.push({ type: 'cleaning', cat: null, sub: 'thermal_paste', years: SAMPLE_YEARS.filter(function (y) { return y >= 1997; }) });
COMBOS.push({ type: 'data_recovery', cat: null, sub: null, years: SAMPLE_YEARS });
COMBOS.push({ type: 'enthusiast', cat: null, sub: 'overclock', years: SAMPLE_YEARS.filter(function (y) { return y >= 1997; }) });
COMBOS.push({ type: 'enthusiast', cat: null, sub: 'aesthetic', years: SAMPLE_YEARS.filter(function (y) { return y >= 2010; }) });
PERIPH_KINDS.forEach(function (k) {
  var ys = kindYears(k);
  if (!ys.length) err('TASK_STEPS matrix: peripheral kind "' + k + '" has no item available in any sample year');
  COMBOS.push({ type: 'peripheral', cat: null, sub: k, years: ys });
});
// v0.4b §12.6: device_repair coverage at 1986/1996/2010/2015/2023 where era-valid
COMBOS.push({ type: 'device_repair', cat: null, sub: 'apple', years: [1986, 1996, 2010, 2015, 2023] });
COMBOS.push({ type: 'device_repair', cat: null, sub: 'smartphone', years: [2010, 2015, 2023] });
COMBOS.push({ type: 'device_repair', cat: null, sub: 'tablet', years: [2010, 2015, 2023] });

var matrixCells = 0, matrixFails = 0;
COMBOS.forEach(function (c) {
  c.years.forEach(function (y) {
    matrixCells++;
    var key = c.type + '/' + (c.cat || '*') + '/' + (c.sub || '*') + '@' + y;
    var r = resolveSteps(c.type, c.cat, c.sub, y);
    if (!r) { err('TASK_STEPS: no template resolves for ' + key); matrixFails++; return; }
    if (r.count < 3) { err('TASK_STEPS: ' + key + ' resolves to only ' + r.count + ' unconditional steps (need >= 3)'); matrixFails++; }
    if (r.sumMin < 0.5 || r.sumMin > 6.5) { err('TASK_STEPS: ' + key + ' base hours ' + r.sumMin + ' outside [0.5, 6.5]'); matrixFails++; }
    if (r.sumMax > 6.5) { err('TASK_STEPS: ' + key + ' max hours (with cond steps) ' + r.sumMax + ' > 6.5'); matrixFails++; }
  });
});

// v0.9 §19.8: software installs must be dominated by unattended wait steps, not labor.
// Uses the engine's classification contract: explicit wait:true flags (the engine also
// auto-detects wait-ish labels, so this is the conservative lower bound).
(function () {
  var r = resolveSteps('software', null, 'os_install', 1999);
  if (!r) return; // already reported by the matrix
  var inY = r.tpl.steps.filter(function (s) {
    return (s.minYear === undefined || 1999 >= s.minYear) && (s.maxYear === undefined || 1999 <= s.maxYear) && s.cond === undefined;
  });
  var waitH = 0, laborH = 0;
  inY.forEach(function (s) { if (s.wait === true) waitH += s.hours; else laborH += s.hours; });
  if (waitH <= laborH) err('TASK_STEPS os_install@1999: wait-step hours (' + waitH + ') must exceed hands-on labor (' + laborH + ') — installs are watching progress bars (§19.8)');
})();

// ---------------------------------------------------------------- v0.5 §13.1 CHRONICLE
var CHRON_TAGS = ['hardware', 'software', 'gaming', 'internet', 'business', 'culture'];
var CHRON = DATA.CHRONICLE || [];
var chronYearCounts = {};
if (!Array.isArray(CHRON) || CHRON.length < 70 || CHRON.length > 110) {
  err('CHRONICLE: need 70-110 entries (§13.1), have ' + (Array.isArray(CHRON) ? CHRON.length : 'none'));
}
var chronIds = {};
var prevChronDate = '';
CHRON.forEach(function (e, i) {
  var l = 'CHRONICLE[' + i + '] (' + (e && e.id ? e.id : '?') + ')';
  if (!isStr(e.id)) err(l + ': missing id');
  else { if (chronIds[e.id]) err(l + ': duplicate id ' + e.id); chronIds[e.id] = true; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || isNaN(Date.parse(e.date))) err(l + ': bad date (need real ISO YYYY-MM-DD)');
  else {
    if (e.date < prevChronDate) err(l + ': out of chronological order (' + prevChronDate + ' then ' + e.date + ')');
    prevChronDate = e.date;
    var yr = Number(e.date.slice(0, 4));
    if (yr < 1983 || yr > 2025) err(l + ': date year ' + yr + ' outside 1983-2025');
    chronYearCounts[yr] = (chronYearCounts[yr] || 0) + 1;
  }
  if (!isStr(e.headline)) err(l + ': headline required');
  if (!isStr(e.body) || e.body.length < 40) err(l + ': body required (>= 40 chars, factual "why it mattered")');
  if (CHRON_TAGS.indexOf(e.tag) === -1) err(l + ': tag "' + e.tag + '" not in ' + CHRON_TAGS.join('|'));
});
// >= 2/year AVERAGE across 1983-2025 (43 years)
if (CHRON.length / 43 < 2) err('CHRONICLE: only ' + (CHRON.length / 43).toFixed(2) + ' entries/year avg 1983-2025 (need >= 2)');
// span sanity: must reach both ends of the range
var chronYearsSeen = Object.keys(chronYearCounts).map(Number).sort(function (a, b) { return a - b; });
if (!chronYearsSeen.length || chronYearsSeen[0] > 1985) err('CHRONICLE: must include entries from the early 1980s (first year ' + (chronYearsSeen[0] || 'none') + ')');
if (!chronYearsSeen.length || chronYearsSeen[chronYearsSeen.length - 1] < 2023) err('CHRONICLE: must reach the mid-2020s (last year ' + (chronYearsSeen[chronYearsSeen.length - 1] || 'none') + ')');
// Chronicle must NOT carry any market/price fields (it is non-economic per §13.1)
CHRON.forEach(function (e) {
  if (e.effects !== undefined || e.priceMult !== undefined || e.jobVolumeMult !== undefined) {
    err('CHRONICLE ' + e.id + ': must not carry market/price fields (effects/priceMult/jobVolumeMult) — it is non-economic news');
  }
});

// ---------------------------------------------------------------- v0.5 §13.2 ARTICLES
var ART_CATS = ['buses', 'storage', 'cpu', 'gpu', 'memory', 'os', 'form-factor', 'culture', 'business'];
var ARTS = DATA.ARTICLES || [];
if (!Array.isArray(ARTS) || ARTS.length < 17 || ARTS.length > 24) {
  err('ARTICLES: need 17-24 articles (§13.2 range bumped by §18.2 audio article), have ' + (Array.isArray(ARTS) ? ARTS.length : 'none'));
}
var artIds = {};
ARTS.forEach(function (a, i) {
  var l = 'ARTICLES[' + i + '] (' + (a && a.id ? a.id : '?') + ')';
  if (!isStr(a.id)) err(l + ': missing id');
  else { if (artIds[a.id]) err(l + ': duplicate id ' + a.id); artIds[a.id] = true; }
  if (!isStr(a.title)) err(l + ': title required');
  if (ART_CATS.indexOf(a.category) === -1) err(l + ': category "' + a.category + '" not in ' + ART_CATS.join('|'));
  var uy = a.unlockYear;
  if (a.unlockDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.unlockDate) || isNaN(Date.parse(a.unlockDate))) err(l + ': unlockDate not ISO');
    else uy = Number(a.unlockDate.slice(0, 4));
  }
  if (!isInt(uy) || uy < 1983 || uy > 2025) err(l + ': unlockYear must be an int in 1983-2025');
  if (!isStr(a.summary)) err(l + ': summary (1-sentence) required');
  if (!isStr(a.body) || a.body.length < 400) err(l + ': body required and must be >= 400 chars (§13.2)');
  else {
    // safe Markdown-lite: balanced ** bold, bullets are exactly "- " lines, no other markup chars
    if (((a.body.match(/\*\*/g) || []).length) % 2 !== 0) err(l + ': unbalanced ** bold markers');
    a.body.split('\n').forEach(function (line) {
      if (line.charAt(0) === '-' && line.slice(0, 2) !== '- ') err(l + ': bullet lines must start with "- " exactly');
    });
    if (/[#`_]|<[a-z]/i.test(a.body)) err(l + ': body contains disallowed markup (only \\n\\n, **bold**, "- " bullets allowed)');
  }
  if (a.related !== undefined && !Array.isArray(a.related)) err(l + ': related must be an array when present');
});

// ---------------------------------------------------------------- v0.5 §13.3 PERIOD_SOFTWARE
var SW_KINDS = ['game', 'office', 'creative', 'web', 'os', 'utility'];
var PS = DATA.PERIOD_SOFTWARE || [];
if (!Array.isArray(PS) || PS.length < 40) err('PERIOD_SOFTWARE: need >= 40 titles (§13.3), have ' + (Array.isArray(PS) ? PS.length : 'none'));
var psNames = {};
PS.forEach(function (s, i) {
  var l = 'PERIOD_SOFTWARE[' + i + '] (' + (s && s.name ? s.name : '?') + ')';
  if (!isStr(s.name)) err(l + ': name required');
  else { if (psNames[s.name]) err(l + ': duplicate name ' + s.name); psNames[s.name] = true; }
  if (SW_KINDS.indexOf(s.kind) === -1) err(l + ': kind "' + s.kind + '" not in ' + SW_KINDS.join('|'));
  if (!isInt(s.minYear) || !isInt(s.maxYear) || s.minYear > s.maxYear) err(l + ': minYear/maxYear invalid');
  else if (s.minYear < 1979 || s.maxYear > 2025) err(l + ': years outside 1979-2025');
  if (s.customers !== null) {
    if (!Array.isArray(s.customers) || !s.customers.length) err(l + ': customers must be null or a non-empty array');
    else s.customers.forEach(function (cid) { if (ALL_CUST.indexOf(cid) === -1) err(l + ': unknown customer type "' + cid + '"'); });
  }
});
// token vocabulary must actually resolve: at least one title per token-kind exists in each era sample year
var TOKEN_KIND = { GAME: 'game', OFFICE: 'office', CREATIVE: 'creative' };
[1990, 1996, 2004, 2013, 2021, 2025].forEach(function (y) {
  Object.keys(TOKEN_KIND).forEach(function (tok) {
    var n = PS.filter(function (s) { return s.kind === TOKEN_KIND[tok] && s.minYear <= y && s.maxYear >= y; }).length;
    if (n === 0) warn('PERIOD_SOFTWARE: no {' + tok + '} (' + TOKEN_KIND[tok] + ') title available in ' + y + ' — token would drop');
  });
  if (!PS.some(function (s) { return s.minYear <= y && s.maxYear >= y; })) err('PERIOD_SOFTWARE: no {SW} title available at all in ' + y);
});
// tokened copy must exist somewhere (complaints or blurbs) and untokened variants must remain
var TOKEN_RE = /\{(SW|GAME|OFFICE|CREATIVE)\}/;
var tokenedComplaints = 0, tokenedBlurbs = 0;
Object.keys(FL.faults || {}).forEach(function (k) {
  (FL.faults[k] || []).forEach(function (f) {
    (f.complaints || []).forEach(function (c) { if (TOKEN_RE.test(c)) tokenedComplaints++; });
    // every fault must keep at least one UNtokened complaint so nothing breaks if a token can't resolve
    if ((f.complaints || []).length && !(f.complaints || []).some(function (c) { return !TOKEN_RE.test(c); })) {
      err('FLAVOR.faults.' + k + ': a fault has only tokened complaints — keep an untokened variant (§13.3)');
    }
  });
});
Object.keys(FL.jobBlurbs || {}).forEach(function (k) {
  (FL.jobBlurbs[k] || []).forEach(function (b) { if (b && TOKEN_RE.test(b.text)) tokenedBlurbs++; });
  // every blurb list must keep at least one UNtokened blurb
  var arr = FL.jobBlurbs[k] || [];
  if (arr.length && !arr.some(function (b) { return b && !TOKEN_RE.test(b.text); })) {
    err('FLAVOR.jobBlurbs.' + k + ': list has only tokened blurbs — keep untokened variants (§13.3)');
  }
});
if (tokenedComplaints + tokenedBlurbs < 4) err('PERIOD_SOFTWARE: expected tokened {SW}/{GAME}/{OFFICE}/{CREATIVE} copy in faults/blurbs (§13.3), found ' + (tokenedComplaints + tokenedBlurbs));
// only the four known tokens may appear (guard against stray placeholders)
function scanTokens(str, where) {
  (str.match(/\{[^}]*\}/g) || []).forEach(function (t) {
    if (['{SW}', '{GAME}', '{OFFICE}', '{CREATIVE}'].indexOf(t) === -1) err(where + ': unknown copy token ' + t);
  });
}
Object.keys(FL.faults || {}).forEach(function (k) { (FL.faults[k] || []).forEach(function (f) { (f.complaints || []).forEach(function (c) { scanTokens(c, 'FLAVOR.faults.' + k); }); }); });
Object.keys(FL.jobBlurbs || {}).forEach(function (k) { (FL.jobBlurbs[k] || []).forEach(function (b) { if (b) scanTokens(b.text, 'FLAVOR.jobBlurbs.' + k); }); });

// ---------------------------------------------------------------- v0.5 §13.4 CERTIFICATIONS
var CERT_FX = ['jobTimeMult', 'payMult', 'callbackMult', 'prestigeBonus', 'reliabilityBonus', 'unlocks'];
var CERTS = DATA.CERTIFICATIONS || [];
if (!Array.isArray(CERTS) || CERTS.length < 8) err('CERTIFICATIONS: need >= 8 certs (§13.4), have ' + (Array.isArray(CERTS) ? CERTS.length : 'none'));
var certById = {};
CERTS.forEach(function (c) { if (c && c.id) certById[c.id] = c; });
CERTS.forEach(function (c, i) {
  var l = 'CERTIFICATIONS[' + i + '] (' + (c && c.id ? c.id : '?') + ')';
  if (!isStr(c.id)) err(l + ': missing id');
  if (!isStr(c.name) || !isStr(c.abbr)) err(l + ': name/abbr required');
  if (!isInt(c.minYear) || c.minYear < 1983 || c.minYear > 2025) err(l + ': minYear must be int in 1983-2025');
  if (!isNum(c.costBase) || c.costBase <= 0) err(l + ': costBase (1983-scale) must be > 0');
  if (!isNum(c.studyHours) || c.studyHours <= 0) err(l + ': studyHours must be > 0');
  if (!isStr(c.desc) || c.desc.length < 40) err(l + ': desc required (>= 40 chars — what it taught & why it mattered)');
  if (c.prereq !== undefined) {
    if (!certById[c.prereq]) err(l + ': prereq "' + c.prereq + '" is not a known cert id');
    else if (certById[c.prereq].minYear > c.minYear) err(l + ': prereq ' + c.prereq + ' is newer than this cert (era sanity)');
  }
  if (typeof c.effects !== 'object' || c.effects === null) { err(l + ': effects object required'); return; }
  Object.keys(c.effects).forEach(function (k) { if (CERT_FX.indexOf(k) === -1) err(l + ': unknown effect key "' + k + '" (§13.4 vocabulary only)'); });
  var fx = c.effects;
  if (fx.jobTimeMult !== undefined) {
    if (typeof fx.jobTimeMult !== 'object' || fx.jobTimeMult === null) err(l + ': jobTimeMult must be an object');
    else Object.keys(fx.jobTimeMult).forEach(function (k) {
      if (k !== 'all' && JOB_TYPES.indexOf(k) === -1) err(l + ': jobTimeMult key "' + k + '" not a jobType or "all"');
      var v = fx.jobTimeMult[k];
      if (!isNum(v) || v <= 0 || v > 1) err(l + ': jobTimeMult.' + k + ' must be in (0, 1] (a speed-up)');
    });
  }
  if (fx.payMult !== undefined) {
    if (typeof fx.payMult !== 'object' || fx.payMult === null) err(l + ': payMult must be an object');
    else Object.keys(fx.payMult).forEach(function (k) {
      if (JOB_TYPES.indexOf(k) === -1 && CATEGORIES.indexOf(k) === -1) err(l + ': payMult key "' + k + '" not a jobType or category');
      var v = fx.payMult[k];
      if (!isNum(v) || v < 1) err(l + ': payMult.' + k + ' must be >= 1 (a pay boost)');
    });
  }
  if (fx.callbackMult !== undefined && (!isNum(fx.callbackMult) || fx.callbackMult <= 0 || fx.callbackMult > 1)) err(l + ': callbackMult must be in (0, 1]');
  if (fx.prestigeBonus !== undefined && (!isInt(fx.prestigeBonus) || fx.prestigeBonus <= 0)) err(l + ': prestigeBonus must be a positive int');
  if (fx.reliabilityBonus !== undefined && (!isInt(fx.reliabilityBonus) || fx.reliabilityBonus <= 0)) err(l + ': reliabilityBonus must be a positive int');
  if (fx.unlocks !== undefined) {
    if (!Array.isArray(fx.unlocks)) err(l + ': unlocks must be an array');
    else fx.unlocks.forEach(function (u) { if (JOB_TYPES.indexOf(u) === -1) err(l + ': unlocks entry "' + u + '" is not a jobType'); });
  }
  if (Object.keys(fx).length === 0) err(l + ': cert has no effects');
});
// canon: the spec-named era-gated certs should be present (A+, Network+, CNE, MCSE, CCNA, Apple, Security+, a data-recovery cert)
['A+', 'Network+', 'CNE', 'MCSE', 'CCNA', 'Security+'].forEach(function (abbr) {
  if (!CERTS.some(function (c) { return c.abbr === abbr; })) warn('CERTIFICATIONS: expected a cert with abbr "' + abbr + '" (§13.4 canon)');
});
if (!CERTS.some(function (c) { return /apple/i.test(c.name); })) warn('CERTIFICATIONS: expected an Apple technician cert (§13.4 canon)');
if (!CERTS.some(function (c) { return c.effects && (c.effects.jobTimeMult && c.effects.jobTimeMult.data_recovery || c.effects.payMult && c.effects.payMult.data_recovery); })) {
  warn('CERTIFICATIONS: expected a data-recovery-focused cert (§13.4 canon)');
}

// ---------------------------------------------------------------- v0.6 §15.1 TRANSITIONS
var TAG_UNIVERSE = {};
PARTS.forEach(function (p) { (p.platformTags || []).forEach(function (t) { TAG_UNIVERSE[t] = true; }); });
var TRANS = DATA.TRANSITIONS || [];
if (!Array.isArray(TRANS) || TRANS.length < 6 || TRANS.length > 9) {
  err('TRANSITIONS: need 6-9 transition windows (§15.1), have ' + (Array.isArray(TRANS) ? TRANS.length : 'none'));
}
var transIds = {};
TRANS.forEach(function (t, i) {
  var l = 'TRANSITIONS[' + i + '] (' + (t && t.id ? t.id : '?') + ')';
  if (!isStr(t.id) || !/^[a-z0-9-]+$/.test(t.id)) err(l + ': id must be kebab-case');
  else {
    if (transIds[t.id]) err(l + ': duplicate id ' + t.id);
    transIds[t.id] = true;
    if (histIds[t.id]) err(l + ': id collides with a HISTORICAL_EVENTS id (news keys must stay unambiguous)');
  }
  if (!isStr(t.name)) err(l + ': name required');
  if (!isStr(t.newsLead) || t.newsLead.length < 20) err(l + ': newsLead warning headline required (>= 20 chars)');
  if (!isStr(t.body) || t.body.length < 80) err(l + ': body must be a 2-3 sentence period story (>= 80 chars)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate || '') || isNaN(Date.parse(t.startDate))) err(l + ': bad startDate (need real ISO YYYY-MM-DD)');
  else {
    var ty = Number(t.startDate.slice(0, 4));
    if (ty < 1983 || ty > 2025) err(l + ': startDate year ' + ty + ' outside 1983-2025');
    // the ~60-day newsLead warning must also land inside the playable range
    if (Date.parse(t.startDate) - 60 * 86400000 < Date.parse('1983-01-01')) err(l + ': lead warning (start - 60d) falls before 1983');
  }
  if (!isInt(t.durationDays) || t.durationDays < 180 || t.durationDays > 540) err(l + ': durationDays must be an int in 180-540');
  else if (!isNaN(Date.parse(t.startDate)) && Date.parse(t.startDate) + t.durationDays * 86400000 > Date.parse('2026-06-30')) {
    err(l + ': window runs past the data horizon (mid-2026)');
  }
  // STRUCTURAL, not market-moving: no price/volume fields (those belong to HISTORICAL_EVENTS)
  if (t.effects !== undefined || t.priceMult !== undefined || t.jobVolumeMult !== undefined) {
    err(l + ': transitions are structural — no effects/priceMult/jobVolumeMult (keep market shocks in HISTORICAL_EVENTS)');
  }
  if (!Array.isArray(t.obsoleteTags)) err(l + ': obsoleteTags must be an array (may be empty for demand-only shifts)');
  else t.obsoleteTags.forEach(function (tag) {
    if (!TAG_UNIVERSE[tag]) err(l + ': obsoleteTag "' + tag + '" not found among catalog platformTags');
  });
  if (typeof t.demandMix !== 'object' || t.demandMix === null || !Object.keys(t.demandMix).length) {
    err(l + ': demandMix must be a non-empty object of job-type multipliers');
  } else Object.keys(t.demandMix).forEach(function (k) {
    if (JOB_TYPES.indexOf(k) === -1) err(l + ': demandMix key "' + k + '" is not a job type');
    var v = t.demandMix[k];
    if (!isNum(v) || v <= 0 || v > 4) err(l + ': demandMix.' + k + ' must be a number in (0, 4]');
  });
  if (!isNum(t.retrainHours) || t.retrainHours <= 0 || t.retrainHours > 40) err(l + ': retrainHours must be in (0, 40]');
  if (!isNum(t.retrainCostBase) || t.retrainCostBase <= 0) err(l + ': retrainCostBase (1983-scale) must be > 0');
});

// ---------------------------------------------------------------- v0.6 §15.2 SCENARIOS
// Spec-pinned ids and dates.
var SCEN_SPEC = {
  'y2k-rush': { start: '1998-06-01', end: '2000-03-01' },
  'dotcom-survivor': { start: '2000-03-01', end: '2001-12-31' },
  'flood-trader': { start: '2011-08-01', end: '2012-12-31' },
  'shortage-shop': { start: '2020-03-01', end: '2021-12-31' }
};
var SCEN_MODS = ['jobWeightMult', 'rentMult', 'offerMult'];
var SCEN = DATA.SCENARIOS || [];
if (!Array.isArray(SCEN) || SCEN.length !== 4) err('SCENARIOS: must be exactly the 4 spec scenarios (§15.2), have ' + (Array.isArray(SCEN) ? SCEN.length : 'none'));
var scenSeen = {};
SCEN.forEach(function (s, i) {
  var l = 'SCENARIOS[' + i + '] (' + (s && s.id ? s.id : '?') + ')';
  if (!SCEN_SPEC[s.id]) { err(l + ': id must be one of ' + Object.keys(SCEN_SPEC).join('|')); return; }
  if (scenSeen[s.id]) err(l + ': duplicate scenario ' + s.id);
  scenSeen[s.id] = true;
  if (s.startDate !== SCEN_SPEC[s.id].start) err(l + ': startDate must be ' + SCEN_SPEC[s.id].start + ' (spec-pinned)');
  if (s.endDate !== SCEN_SPEC[s.id].end) err(l + ': endDate must be ' + SCEN_SPEC[s.id].end + ' (spec-pinned)');
  ['startDate', 'endDate'].forEach(function (k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s[k] || '') || isNaN(Date.parse(s[k]))) err(l + ': ' + k + ' not real ISO');
    else {
      var yy = Number(s[k].slice(0, 4));
      if (yy < 1983 || yy > 2025) err(l + ': ' + k + ' year outside the 1983-2025 data range');
    }
  });
  if (!isNaN(Date.parse(s.startDate)) && !isNaN(Date.parse(s.endDate)) && Date.parse(s.startDate) >= Date.parse(s.endDate)) err(l + ': startDate must precede endDate');
  if (!isStr(s.name)) err(l + ': name required');
  if (!isStr(s.blurb) || s.blurb.length < 60) err(l + ': blurb must sell the fantasy + hint the strategy (>= 60 chars)');
  if (!isStr(s.difficultyNote)) err(l + ': difficultyNote required');
  if (!isNum(s.cash) || s.cash <= 0) err(l + ': cash must be > 0');
  if (!isInt(s.shopTier) || s.shopTier < 0 || s.shopTier >= TIERS_ARR.length) err(l + ': shopTier must index SHOP_TIERS (0-' + (TIERS_ARR.length - 1) + ')');
  if (typeof s.modifiers !== 'object' || s.modifiers === null) err(l + ': modifiers object required (may be empty)');
  else {
    Object.keys(s.modifiers).forEach(function (k) { if (SCEN_MODS.indexOf(k) === -1) err(l + ': unknown modifier "' + k + '" (allowed: ' + SCEN_MODS.join('/') + ')'); });
    var jw = s.modifiers.jobWeightMult;
    if (jw !== undefined) {
      if (typeof jw !== 'object' || jw === null || !Object.keys(jw).length) err(l + ': jobWeightMult must be a non-empty object');
      else Object.keys(jw).forEach(function (k) {
        if (JOB_TYPES.indexOf(k) === -1) err(l + ': jobWeightMult key "' + k + '" is not a job type');
        if (!isNum(jw[k]) || jw[k] <= 0 || jw[k] > 4) err(l + ': jobWeightMult.' + k + ' must be in (0, 4]');
      });
    }
    ['rentMult', 'offerMult'].forEach(function (k) {
      if (s.modifiers[k] !== undefined && (!isNum(s.modifiers[k]) || s.modifiers[k] <= 0 || s.modifiers[k] > 4)) err(l + ': ' + k + ' must be in (0, 4]');
    });
  }
  var sc = s.scoring;
  if (typeof sc !== 'object' || sc === null) { err(l + ': scoring object required'); return; }
  if (!isNum(sc.cashWeight) || sc.cashWeight <= 0 || sc.cashWeight > 1) err(l + ': cashWeight must be in (0, 1] (points per dollar)');
  if (!isNum(sc.ratingWeight) || sc.ratingWeight <= 0 || sc.ratingWeight > 200) err(l + ': ratingWeight must be in (0, 200]');
  if (!Array.isArray(sc.bonus) || !sc.bonus.length || sc.bonus.length > 4) err(l + ': scoring.bonus must have 1-4 entries');
  else sc.bonus.forEach(function (b, j) {
    var bl = l + ' bonus[' + j + ']';
    if (!isStr(b.stat)) err(bl + ': stat key required');
    if (!isNum(b.threshold) || b.threshold < 0) err(bl + ': threshold must be a number >= 0');
    if (!isNum(b.points) || b.points <= 0 || b.points > 500) err(bl + ': points must be in (0, 500]');
    if (!isStr(b.label)) err(bl + ': label required');
  });
});
Object.keys(SCEN_SPEC).forEach(function (id) { if (!scenSeen[id]) err('SCENARIOS missing required scenario: ' + id); });

// ---------------------------------------------------------------- v0.6 §15.4 business-name pool
needLen(FL.businessNames, 15, 'businessNames (v0.6 §15.4)');
var bizSeen = {};
(FL.businessNames || []).forEach(function (n, i) {
  if (!isStr(n)) err('FLAVOR.businessNames[' + i + ']: must be a non-empty string');
  else if (bizSeen[n]) err('FLAVOR.businessNames: duplicate "' + n + '"');
  else bizSeen[n] = true;
});

// ---------------------------------------------------------------- v0.7 §17.1 craft text tables
// Binding field names — the engine consumes these shapes with fallbacks.
function onTenthGrid(x) { return isNum(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; }
var DISC_CATS = CATEGORIES.concat(['device']);   // "device" = device_repair context
var DISC = DATA.DISCOVERIES || [];
if (!Array.isArray(DISC) || DISC.length < 12) err('DISCOVERIES: need >= 12 entries (§17.1), have ' + (Array.isArray(DISC) ? DISC.length : 'none'));
var discCatSeen = {}, discGated = 0;
DISC.forEach(function (d, i) {
  var l = 'DISCOVERIES[' + i + '] (' + (d && d.category ? d.category : '?') + ')';
  if (DISC_CATS.indexOf(d.category) === -1) err(l + ': category must be a part category or "device"');
  else discCatSeen[d.category] = true;
  if (!isStr(d.text) || d.text.length < 30) err(l + ': text must be bench-voice copy >= 30 chars');
  if (d.addCategory !== null && CATEGORIES.indexOf(d.addCategory) === -1) {
    err(l + ': addCategory must be a part category, or null for device-billed add-ons');
  }
  if (d.category !== 'device' && d.addCategory === null) err(l + ': null addCategory is reserved for "device" entries');
  if (!onTenthGrid(d.addLaborHours) || d.addLaborHours <= 0 || d.addLaborHours > 2) err(l + ': addLaborHours must be on the 0.1 grid in (0, 2]');
  if (d.minYear !== undefined && (!isInt(d.minYear) || d.minYear < 1979 || d.minYear > 2026)) err(l + ': minYear invalid');
  if (d.maxYear !== undefined && (!isInt(d.maxYear) || d.maxYear < 1979 || d.maxYear > 2100)) err(l + ': maxYear invalid');
  if (d.minYear !== undefined && d.maxYear !== undefined && d.minYear > d.maxYear) err(l + ': minYear > maxYear');
  if (d.minYear !== undefined || d.maxYear !== undefined) discGated++;
});
if (Object.keys(discCatSeen).length < 5) err('DISCOVERIES: need coverage of >= 5 distinct work-context categories, have ' + Object.keys(discCatSeen).length);
if (!discCatSeen.device) err('DISCOVERIES: need >= 1 "device" entry (bloated-battery class, §17.1)');
if (discGated < 3) err('DISCOVERIES: need >= 3 era-gated entries (minYear/maxYear), have ' + discGated);

var FORK_REQ = FAULT_KEYS.concat(['generic']);   // 7 fault categories + laborOnly fallback
var FORK_OK = FORK_REQ.concat(['device']);
var FORK = DATA.FORK_TEXT || {};
if (typeof FORK !== 'object' || Array.isArray(FORK)) err('FORK_TEXT must be an object keyed by fault category (§17.1)');
FORK_REQ.forEach(function (k) { if (!FORK[k]) err('FORK_TEXT missing required key "' + k + '"'); });
if (Object.keys(FORK).length < 8) err('FORK_TEXT: need >= 8 categories (§17.1), have ' + Object.keys(FORK).length);
Object.keys(FORK).forEach(function (k) {
  var l = 'FORK_TEXT.' + k;
  if (FORK_OK.indexOf(k) === -1) err(l + ': unknown key (allowed: ' + FORK_OK.join('|') + ')');
  var f = FORK[k] || {};
  if (!isStr(f.patchLabel) || !isStr(f.properLabel)) err(l + ': patchLabel/properLabel required');
  if (!isStr(f.patchDesc) || f.patchDesc.length < 30) err(l + ': patchDesc must be an honest-tradeoff line >= 30 chars');
  if (!isStr(f.properDesc) || f.properDesc.length < 30) err(l + ': properDesc must be an honest-tradeoff line >= 30 chars');
});

var TUNE = DATA.TUNING_TEXT || [];
if (!Array.isArray(TUNE) || TUNE.length < 3) err('TUNING_TEXT: need >= 3 era bands (§17.1), have ' + (Array.isArray(TUNE) ? TUNE.length : 'none'));
TUNE.forEach(function (b, i) {
  var l = 'TUNING_TEXT[' + i + '] (' + (b && b.method ? b.method : '?') + ')';
  if (!isInt(b.minYear) || !isInt(b.maxYear) || b.minYear > b.maxYear) err(l + ': minYear/maxYear invalid');
  ['conservative', 'balanced', 'aggressive'].forEach(function (k) {
    if (!isStr(b[k]) || b[k].length < 30) err(l + ': ' + k + ' line must teach the era method (>= 30 chars)');
  });
});
// overclock jobs exist 1997+ — every year in 1997-2025 needs a band
for (var ty = 1997; ty <= 2025; ty++) {
  var covered = TUNE.some(function (b) { return isInt(b.minYear) && isInt(b.maxYear) && b.minYear <= ty && ty <= b.maxYear; });
  if (!covered) { err('TUNING_TEXT: no band covers year ' + ty + ' (overclock jobs run 1997+)'); break; }
}

// ---------------------------------------------------------------- v0.8 §18.1 DISTRIBUTORS
var DIST = DATA.DISTRIBUTORS || [];
if (!Array.isArray(DIST) || DIST.length < 6 || DIST.length > 8) {
  err('DISTRIBUTORS: need 6-8 era-banded distributors (§18.1), have ' + (Array.isArray(DIST) ? DIST.length : 'none'));
}
var distIds = {};
DIST.forEach(function (d, i) {
  var l = 'DISTRIBUTORS[' + i + '] (' + (d && d.id ? d.id : '?') + ')';
  if (!isStr(d.id) || !/^[a-z0-9-]+$/.test(d.id)) err(l + ': id must be kebab-case');
  else { if (distIds[d.id]) err(l + ': duplicate id'); distIds[d.id] = true; }
  if (!isStr(d.name)) err(l + ': name required');
  if (!isStr(d.blurb) || d.blurb.length < 60) err(l + ': blurb must be 1-2 sentences of period flavor (>= 60 chars)');
  if (!isInt(d.minYear) || d.minYear < 1983 || d.minYear > 2025) err(l + ': minYear must be int in 1983-2025');
  if (d.maxYear !== undefined && (!isInt(d.maxYear) || d.maxYear < d.minYear)) err(l + ': maxYear must be >= minYear when present');
  if (!isInt(d.minPrestige) || d.minPrestige < 0 || d.minPrestige > 3) err(l + ': minPrestige must be int 0-3');
  if (typeof d.grayMarket !== 'boolean') err(l + ': grayMarket boolean required (explicit false on legit channels)');
  if (d.specialty !== null) {
    if (!Array.isArray(d.specialty) || !d.specialty.length) err(l + ': specialty must be null or a non-empty category array');
    else d.specialty.forEach(function (c) { if (CATEGORIES.indexOf(c) === -1) err(l + ': specialty "' + c + '" is not a part category'); });
  }
  if (d.grayMarket === true) {
    if (d.minPrestige !== 0) err(l + ': gray-market channels must be minPrestige 0 (§18.1)');
    if (!isNum(d.baseDiscount) || d.baseDiscount < 0.15 || d.baseDiscount > 0.22) err(l + ': gray-market baseDiscount must be in [0.15, 0.22]');
    if (!isInt(d.leadDays) || d.leadDays < 1 || d.leadDays > 2) err(l + ': gray-market leadDays must be 1-2');
    if (!/no warrant|only warranty|no returns|no receipts/i.test(d.blurb)) err(l + ': gray-market blurb must honestly state the no-warranty tradeoff');
  } else {
    if (!isNum(d.baseDiscount) || d.baseDiscount < 0.04 || d.baseDiscount > 0.08) err(l + ': baseDiscount must be in [0.04, 0.08]');
    if (!isInt(d.leadDays) || d.leadDays < 2 || d.leadDays > 5) err(l + ': leadDays must be 2-5');
  }
});
// coverage 1983-2025: exactly ONE gray channel per year (bands tile, no overlap/gap),
// and every year keeps >= 1 legitimate channel
for (var dy = 1983; dy <= 2025; dy++) {
  var openGray = 0, openLegit = 0;
  DIST.forEach(function (d) {
    var open = d.minYear <= dy && (d.maxYear === undefined || dy <= d.maxYear);
    if (!open) return;
    if (d.grayMarket) openGray++; else openLegit++;
  });
  if (openGray !== 1) err('DISTRIBUTORS: year ' + dy + ' has ' + openGray + ' gray-market channel(s), need exactly 1 (§18.1)');
  if (openLegit < 1) err('DISTRIBUTORS: year ' + dy + ' has no legitimate channel');
}

// ---------------------------------------------------------------- v0.8 §18.2 audio article
var audioArt = ARTS.filter(function (a) { return a && a.id === 'article-pc-audio'; })[0];
if (!audioArt) err('ARTICLES: missing "article-pc-audio" (Beeps to Bitstreams, §18.2)');
else {
  if (!isInt(audioArt.unlockYear) || audioArt.unlockYear < 1996 || audioArt.unlockYear > 2000) err('article-pc-audio: unlockYear should be ~1998');
  if (!/soundtrack/i.test(audioArt.body || '')) err('article-pc-audio: body must mention the game\'s own soundtrack re-creating the techniques (§18.2)');
  ['PC speaker|square', 'AdLib|OPL2|\\bFM\\b', 'Sound Blaster', 'General MIDI|wavetable', 'HD Audio|onboard|AC.97'].forEach(function (pat) {
    if (!new RegExp(pat, 'i').test(audioArt.body || '')) err('article-pc-audio: body must cover the era: /' + pat + '/');
  });
}

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

console.log('\n=== TASK_STEPS coverage matrix (v0.3 §10.1) ===');
console.log('Templates: ' + TS.length + ' | Combos: ' + COMBOS.length + ' | Cells (combo x sample year): ' + matrixCells +
  ' | Failing cells: ' + matrixFails);
if (matrixFails === 0) console.log('OK: every generatable (type x category/subtype/kind) resolves at 1984/1993/1999/2007/2015/2023 with >= 3 steps and 0.5-6.5h.');

console.log('\n=== Summary ===');
var eqGating = EQ.filter(function (q) { return GATING_FX.some(function (k) { var v = (q.effects || {})[k]; return v !== undefined && v !== false && v !== 0; }); });
var eqLabeled = eqGating.filter(function (q) { return isStr(q.unlocksLabel); });
console.log('Parts: ' + PARTS.length + ' | Eras: ' + (DATA.ERAS || []).length + ' | Tiers: ' + TIERS_ARR.length +
  ' | Equipment: ' + EQ.length + ' (' + eqLabeled.length + '/' + eqGating.length + ' gating items carry unlocksLabel, §14.5/§14.7)' +
  ' | Historical events: ' + HIST.length + ' | Random templates: ' + TMPL.length +
  ' | Staff roles: ' + ROLES.length + ' | Staff names: ' + ((FL.staffNames || []).length));
console.log('Devices: Apple ' + AM.length + ' | Mobile ' + MD.length + ' (' +
  MD.filter(function (d) { return d.kind === 'smartphone'; }).length + ' phones, ' +
  MD.filter(function (d) { return d.kind === 'tablet'; }).length + ' tablets) | Mobile fault kinds: ' +
  MOBILE_FAULT_KINDS.length + ' | Boards with slots: ' +
  PARTS.filter(function (p) { return p.category === 'motherboard' && p.slots; }).length + '/' +
  PARTS.filter(function (p) { return p.category === 'motherboard'; }).length +
  ' | sliTag GPUs: ' + PARTS.filter(function (p) { return p.sliTag; }).length +
  ' (Voodoo2: ' + v2Cards.length + ')');
console.log('Baseline years: ' + ybYears.join(', '));
console.log('v0.5 Education: Chronicle ' + CHRON.length + ' entries (' + (CHRON.length / 43).toFixed(2) + '/yr avg, ' +
  chronYearsSeen.length + ' distinct years) | Articles ' + ARTS.length + ' | Period software ' + PS.length +
  ' | Certifications ' + CERTS.length + ' | tokened copy ' + (tokenedComplaints + tokenedBlurbs) +
  ' (' + tokenedComplaints + ' complaints, ' + tokenedBlurbs + ' blurbs)');
console.log('v0.6 Long Arc: Transitions ' + TRANS.length + ' (' +
  TRANS.map(function (t) { return t.id; }).join(', ') + ') | Scenarios ' + SCEN.length + '/4 | Business names ' +
  ((FL.businessNames || []).length));
console.log('v0.7 Craft: Discoveries ' + DISC.length + ' (' + Object.keys(discCatSeen).length + ' contexts, ' +
  discGated + ' era-gated) | Fork text ' + Object.keys(FORK).length + ' categories | Tuning bands ' + TUNE.length +
  ' (' + TUNE.map(function (b) { return b.method || '?'; }).join(' / ') + ')');
console.log('v0.8 Supply Lines: Distributors ' + DIST.length + ' (' +
  DIST.filter(function (d) { return d.grayMarket; }).length + ' gray-market: ' +
  DIST.filter(function (d) { return d.grayMarket; }).map(function (d) { return d.id; }).join(', ') +
  ') | Audio article: ' + (audioArt ? 'present (unlock ' + audioArt.unlockYear + ')' : 'MISSING'));
console.log('v0.9 Logistics & Fog: Removable storage ' + PARTS.filter(function (p) { return p.removable === true; }).length +
  ' | complaint fog-lint on ' + Object.keys(COMPLAINT_BANS).length + ' fault categories' +
  ' | wait-flagged steps ' + TS.reduce(function (n, t) { return n + t.steps.filter(function (s) { return s.wait === true; }).length; }, 0) +
  ' | easter eggs: staff ' + (FL.staffNames || []).filter(function (n) { return ['Ada Lovejoy', 'Gary Kildare', 'Linus Thorwald', 'Steve Wozniacki', 'Doug Engelbert', 'Laura Kroft'].indexOf(n) !== -1; }).length +
  ' + names 6');

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
