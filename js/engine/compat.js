/* Circuit & Solder — engine/compat.js
 * Tag-namespace compatibility (SPEC §5.1), validatePartList, machine perf with
 * YEAR_BASELINES normalization, PSU wattage check, readable problem strings.
 */
(function (root) {
  'use strict';
  var Engine = root.Engine = root.Engine || {};
  var Compat = Engine.Compat = {};

  // Category -> tag namespace prefix checked against the motherboard's tags.
  var NAMESPACE = {
    cpu: 'SKT-', ram: 'MEM-', gpu: 'BUS-', storage: 'STOR-', psu: 'FF-', os: 'ARCH-',
    expansion: 'BUS-'   // §12.3: bus tag overlap, never required, no slot cap
    // case: reversed check (mobo FF tag must appear in the case's accepted list)
    // cooling/peripheral: always compatible
  };
  Compat.namespaceForCategory = function (cat) { return NAMESPACE[cat] || null; };

  function tagsInNamespace(part, prefix) {
    var out = [], tags = part.platformTags || [];
    for (var i = 0; i < tags.length; i++)
      if (tags[i].indexOf(prefix) === 0) out.push(tags[i]);
    return out;
  }
  Compat.tagsInNamespace = tagsInNamespace;

  /* Does `part` fit on `mobo`? Returns { fits: bool, why: "readable reason" }. */
  Compat.fits = function (part, mobo) {
    if (!part) return { fits: false, why: 'Unknown part' };
    if (part.category === 'motherboard') return { fits: true, why: '' };
    if (part.category === 'cooling' || part.category === 'peripheral')
      return { fits: true, why: '' };
    if (!mobo) return { fits: true, why: '' }; // no board selected yet: everything shown
    var mTags = mobo.platformTags || [];
    if (part.category === 'case') {
      // Case lists accepted form factors; the board's FF tag must be among them.
      var boardFF = tagsInNamespace(mobo, 'FF-');
      var caseTags = part.platformTags || [];
      for (var i = 0; i < boardFF.length; i++)
        if (caseTags.indexOf(boardFF[i]) !== -1) return { fits: true, why: '' };
      return { fits: false,
               why: 'Case accepts ' + (caseTags.join('/') || 'nothing') +
                    ' but board is ' + (boardFF.join('/') || 'unknown form factor') };
    }
    var prefix = NAMESPACE[part.category];
    if (!prefix) return { fits: true, why: '' };
    var need = tagsInNamespace(part, prefix);
    if (!need.length) return { fits: true, why: '' }; // part declares no requirement
    for (var j = 0; j < need.length; j++)
      if (mTags.indexOf(need[j]) !== -1) return { fits: true, why: '' };
    var label = { cpu: 'CPU socket', ram: 'Memory type', gpu: 'Bus',
                  storage: 'Storage interface', psu: 'PSU form factor',
                  os: 'OS architecture', expansion: 'Bus' }[part.category];
    return { fits: false, why: label + ' ' + need.join('/') + ' not on motherboard' };
  };

  /* §12.2 multi-GPU pairing factor: 2nd matched card adds 65% of its score
   * (Voodoo2 scan-line interleave: 90%). */
  function pairFactor(sliTag) {
    return /voodoo/i.test(String(sliTag || '')) ?
      Engine.CONFIG.MULTI_GPU_SECOND_VOODOO : Engine.CONFIG.MULTI_GPU_SECOND;
  }
  Compat.pairFactor = pairFactor;

  /* §12.2 effective gpu score for a set of gpu parts: the best of (any single
   * card; any same-sliTag pair = first + factor x second). Order-independent —
   * a mismatched extra card contributes nothing but can still be the best
   * single (the historically-correct 2D-card + Voodoo2-pair config just works). */
  function gpuEffective(gpus) {
    var best = 0, groups = {}, i;
    for (i = 0; i < gpus.length; i++) {
      var g = gpus[i], score = (g.perf || {}).gpu || 0;
      if (score > best) best = score;
      if (g.sliTag) (groups[g.sliTag] = groups[g.sliTag] || []).push(score);
    }
    for (var tag in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, tag)) continue;
      var list = groups[tag];
      if (list.length < 2) continue;
      list.sort(function (a, b) { return b - a; });
      var eff = list[0] + pairFactor(tag) * list[1];   // 3rd+ cards add nothing
      if (eff > best) best = eff;
    }
    return Engine.round2(best);
  }
  Compat.gpuEffective = gpuEffective;

  /* Machine perf from a part list: { cpu, gpu, ramMB, storageGB }.
   * ram/storage sum across sticks/drives; gpu uses the §12.2 pairing rule;
   * gpu falls back to integrated (~2) when the board has integratedVideo. */
  Compat.machinePerf = function (parts) {
    var perf = { cpu: 0, gpu: 0, ramMB: 0, storageGB: 0 };
    var mobo = null, gpus = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var pp = p.perf || {};
      if (p.category === 'cpu') perf.cpu = Math.max(perf.cpu, pp.cpu || 0);
      else if (p.category === 'gpu') gpus.push(p);
      else if (p.category === 'ram') perf.ramMB += pp.ramMB || 0;
      else if (p.category === 'storage') perf.storageGB += pp.storageGB || 0;
      else if (p.category === 'motherboard') mobo = p;
    }
    if (gpus.length) perf.gpu = gpuEffective(gpus);
    else if (mobo && mobo.integratedVideo)
      perf.gpu = Engine.CONFIG.INTEGRATED_GPU_PERF;
    return perf;
  };

  /* Composite score vs the interpolated YEAR_BASELINES for `year`:
   * 0.35*norm(cpu)+0.30*norm(gpu)+0.20*norm(ramMB)+0.15*norm(storageGB),
   * norm = value/baseline capped at 3. */
  Compat.composite = function (perf, year) {
    var C = Engine.CONFIG, bl = Engine.baselineFor(year);
    function norm(v, b) { return Engine.clamp(b > 0 ? v / b : 0, 0, C.NORM_CAP); }
    return Engine.round2(
      C.COMPOSITE_W.cpu * norm(perf.cpu, bl.cpu) +
      C.COMPOSITE_W.gpu * norm(perf.gpu, bl.gpu) +
      C.COMPOSITE_W.ramMB * norm(perf.ramMB, bl.ramMB) +
      C.COMPOSITE_W.storageGB * norm(perf.storageGB, bl.storageGB));
  };

  /* Validate a full part list (build validation & tooling).
   * opts: { requireFull: bool (default true), minPerfGpu: number|null, year: number }
   * Returns { valid, problems: [str], perf, composite, style, watts: {required, provided} }.
   */
  Compat.validatePartList = function (partIds, opts) {
    opts = opts || {};
    var requireFull = opts.requireFull !== false;
    var year = opts.year || (Engine._state ? Engine.currentYear(Engine._state) : 1996);
    var problems = [];
    var parts = [], counts = {};
    var i, p;
    partIds = Array.isArray(partIds) ? partIds : [];
    for (i = 0; i < partIds.length; i++) {
      p = Engine.partById(partIds[i]);
      if (!p) { problems.push('Unknown part id: ' + partIds[i]); continue; }
      parts.push(p);
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    var mobo = null;
    for (i = 0; i < parts.length; i++) if (parts[i].category === 'motherboard') mobo = parts[i];
    if ((counts.motherboard || 0) !== 1) {
      problems.push((counts.motherboard || 0) === 0 ?
        'No motherboard selected' : 'More than one motherboard selected');
    }
    // Per-part namespace fit vs the motherboard
    if (mobo) {
      for (i = 0; i < parts.length; i++) {
        if (parts[i] === mobo) continue;
        var res = Compat.fits(parts[i], mobo);
        if (!res.fits) problems.push(parts[i].name + ': ' + res.why);
      }
    }
    // §12.1 capacity: ram/gpu/storage part counts vs the board's slots.
    // Boards without slots data default to {99,99,99} — old saves never regress.
    if (mobo) {
      var slots = mobo.slots || Engine.CONFIG.SLOT_DEFAULTS;
      var slotLabel = { ram: 'RAM slots', gpu: 'GPU slots',
                        storage: 'storage connectors' };
      var slotCats = ['ram', 'gpu', 'storage'];
      for (i = 0; i < slotCats.length; i++) {
        var sc = slotCats[i];
        var cap = (slots[sc] != null && isFinite(slots[sc])) ?
          Math.floor(slots[sc]) : Engine.CONFIG.SLOT_DEFAULTS[sc];
        if ((counts[sc] || 0) > cap) {
          problems.push('Board has ' + cap + ' ' + slotLabel[sc] +
                        ' — build uses ' + counts[sc]);
        }
      }
    }
    // §12.2 multi-GPU sanity: 3D add-on cards (Voodoo2) need a 2D source, and
    // stacked standard cards must be a matched (same-sliTag) pair.
    var gpus = [], standardGpus = [], addonGpus = [];
    for (i = 0; i < parts.length; i++) {
      if (parts[i].category !== 'gpu') continue;
      gpus.push(parts[i]);
      if (parts[i].addonOnly) addonGpus.push(parts[i]); else standardGpus.push(parts[i]);
    }
    var addonUncovered = addonGpus.length > 0 && standardGpus.length === 0 &&
                         !(mobo && mobo.integratedVideo);
    if (addonUncovered) {
      problems.push(addonGpus[0].name + ' is a 3D add-on — it needs a 2D card beside it');
    }
    if (standardGpus.length >= 2) {
      var lead = standardGpus[0];
      for (i = 1; i < standardGpus.length; i++) {
        var sg = standardGpus[i];
        if (!lead.sliTag || !sg.sliTag || sg.sliTag !== lead.sliTag) {
          problems.push(sg.name + " isn't SLI/CrossFire-compatible with " + lead.name);
        }
      }
    }
    if (addonGpus.length >= 2) {
      var alead = addonGpus[0];
      for (i = 1; i < addonGpus.length; i++) {
        if (!alead.sliTag || !addonGpus[i].sliTag ||
            addonGpus[i].sliTag !== alead.sliTag) {
          problems.push(addonGpus[i].name + ' must be an identical pair with ' +
                        alead.name + ' to interleave');
        }
      }
    }
    // Completeness (full build): cpu, motherboard, ram, storage, case, psu, os
    // + gpu OR integrated video (gpu required anyway if minPerf gpu > integrated)
    if (requireFull) {
      var needCats = ['cpu', 'motherboard', 'ram', 'storage', 'case', 'psu', 'os'];
      for (i = 0; i < needCats.length; i++) {
        if (!counts[needCats[i]]) problems.push('Missing ' + needCats[i].toUpperCase());
      }
      // §12.2: an addon-only 3D card is not a video source by itself (that case
      // already raised the clearer "needs a 2D card" problem above).
      var hasVideo = standardGpus.length > 0 || (mobo && mobo.integratedVideo) ||
                     addonUncovered;
      if (!hasVideo && !gpus.length) problems.push('Missing GPU (board has no integrated video)');
      if ((counts.gpu || 0) === 0 && mobo && mobo.integratedVideo &&
          opts.minPerfGpu != null && opts.minPerfGpu > Engine.CONFIG.INTEGRATED_GPU_PERF) {
        problems.push('Integrated video too weak — a graphics card is required');
      }
    }
    // PSU wattage: watts >= 1.15 x sum(powerDraw)
    var draw = 0, psu = null;
    for (i = 0; i < parts.length; i++) {
      if (parts[i].category === 'psu') psu = parts[i];
      else draw += parts[i].powerDraw || 0;
    }
    var required = Math.ceil(draw * Engine.CONFIG.PSU_HEADROOM);
    if (psu && (psu.watts || 0) < required) {
      problems.push('PSU ' + (psu.watts || 0) + 'W < required ' + required + 'W');
    }
    var perf = Compat.machinePerf(parts);
    var style = 0;
    for (i = 0; i < parts.length; i++) {
      if (parts[i].category === 'case' || parts[i].category === 'cooling')
        style += parts[i].style || 0;
    }
    return {
      valid: problems.length === 0,
      problems: problems,
      perf: perf,
      composite: Compat.composite(perf, year),
      style: style,
      watts: { required: required, provided: psu ? (psu.watts || 0) : 0 }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
