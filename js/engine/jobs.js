/* Circuit & Solder — engine/jobs.js
 * Job generation (era gating & weights §5.4), offers, diagnosis, needs/options,
 * installPart, build configurator, workJob (speed & soft workstation cap),
 * completion (payout, rating, callback roll §5.5), data recovery, CRT/ESD
 * mishaps, refurb machines & as-is market, contracts, abandonJob.
 */
(function (root) {
  'use strict';
  var Engine = root.Engine = root.Engine || {};
  var Jobs = Engine.Jobs = {};

  function CFG() { return Engine.CONFIG; }
  function FLAVOR() { return Engine.getData().FLAVOR || {}; }
  function P() { return Engine.Pricing; }

  // ---------- lookup helpers (ids may arrive as strings from the DOM) ----------
  Jobs.findActive = function (state, jobId) {
    var id = Number(jobId);
    for (var i = 0; i < state.jobs.active.length; i++)
      if (state.jobs.active[i].id === id) return state.jobs.active[i];
    return null;
  };
  Jobs.findOffer = function (state, jobId) {
    var id = Number(jobId);
    for (var i = 0; i < state.jobs.offers.length; i++)
      if (state.jobs.offers[i].id === id) return state.jobs.offers[i];
    return null;
  };
  function removeFrom(arr, job) {
    var i = arr.indexOf(job);
    if (i !== -1) arr.splice(i, 1);
  }
  function err(msg) { return { ok: false, error: msg }; }

  function isBuildJob(job) {
    return job.type === 'build' || job.subtype === 'aesthetic' ||
           job.subtype === 'contract_build_custom';
  }

  // Purchasable today: released & not pruned.
  function purchasable(part, state) {
    return P().isReleased(part, state) && !P().isPruned(part, state);
  }
  function purchasableByCategory(state, cat) {
    var parts = Engine.partsByCategory(cat), out = [];
    for (var i = 0; i < parts.length; i++)
      if (purchasable(parts[i], state)) out.push(parts[i]);
    return out;
  }
  Jobs.purchasableByCategory = purchasableByCategory;

  // ------------------------------------------------------------------
  // Offer generation (overnight step 7)
  // ------------------------------------------------------------------
  Jobs.generateOffers = function (state, summary) {
    var C = CFG();
    var tier = Engine.tierInfo(state);
    var rep = state.reputation;
    var volumeMult = 1;
    for (var i = 0; i < state.market.activeEvents.length; i++)
      volumeMult *= state.market.activeEvents[i].jobVolumeMult || 1;
    var base = C.OFFER_BASE + (tier.offerBonus || 0) + rep.prestige +
               Math.round(rep.rating - 3);
    var count = Engine.clamp(Math.round(base * volumeMult), 2,
                             C.OFFER_HARD_MAX + (tier.offerBonus || 0));
    var made = [];
    for (var n = 0; n < count; n++) {
      var job = makeOffer(state);
      if (!job) continue;
      state.jobs.offers.push(job);
      made.push(job.title);
    }
    if (summary) summary.newOffers = summary.newOffers.concat(made);
    return made;
  };

  // §9.2: era-gated customer types, intersected with CUSTOMER_JOB_AFFINITY for
  // the job's most specific key ("build:<useCase>" / "type:subtype" / "type").
  function affinityKeyFor(job) {
    var A = CFG().CUSTOMER_JOB_AFFINITY || {};
    var keys = [];
    if (job.build && job.build.useCase) keys.push('build:' + job.build.useCase);
    if (job.subtype) keys.push(job.type + ':' + job.subtype);
    keys.push(job.type);
    for (var i = 0; i < keys.length; i++) if (A[keys[i]]) return A[keys[i]];
    return null; // broad
  }
  function customerFor(state, year, allowed) {
    var F = FLAVOR();
    var types = (F.customerTypes || [{ id: 'home', label: 'Home user' }]).filter(function (t) {
      return (t.minYear == null || year >= t.minYear) &&
             (t.maxYear == null || year <= t.maxYear);
    });
    if (allowed && allowed.length) {
      var narrowed = types.filter(function (t) { return allowed.indexOf(t.id) !== -1; });
      if (narrowed.length) types = narrowed;
    }
    var t = Engine.pick(types) || { id: 'home' };
    var name = (Engine.pick(F.firstNames || ['Sam']) || 'Sam') + ' ' +
               (Engine.pick(F.lastNames || ['Doe']) || 'Doe');
    return { name: name, type: t.id };
  }
  // §9.2: blurbs may be plain strings (v1 data) or { text, customers } (v2).
  function blurbFor(type, customerType) {
    var list = (FLAVOR().jobBlurbs || {})[type];
    if (!list || !list.length) return '';
    var fitting = list.filter(function (b) {
      if (typeof b === 'string') return true;
      if (!b || typeof b.text !== 'string') return false;
      if (b.customers == null) return true;
      return b.customers.indexOf(customerType) !== -1;
    });
    var chosen = Engine.pick(fitting.length ? fitting : list);
    if (chosen == null) return '';
    return typeof chosen === 'string' ? chosen : String(chosen.text || '');
  }

  // §9.2: ~35% of eligible jobs carry a brand taste drawn from parts actually
  // on the market that year in a category relevant to the job.
  var TASTE_PLURAL = {
    cpu: 'CPUs', gpu: 'graphics cards', ram: 'memory', storage: 'drives',
    motherboard: 'boards', psu: 'power supplies', 'case': 'cases',
    cooling: 'coolers', os: 'software', peripheral: 'gear'
  };
  function tasteCategoryFor(job) {
    if (job.type === 'refurb' || job.type === 'callback' || job.type === 'cleaning')
      return null;
    if (job.type === 'repair') return job.fault ? job.fault.partCategory : null;
    if (job.type === 'upgrade') return job.needs[0] ? job.needs[0].category : null;
    if (job.build) return Engine.pick(['cpu', 'gpu', 'case']);
    if (job.type === 'software' && job.subtype === 'os_install') return 'os';
    if (job.type === 'enthusiast' && job.subtype === 'overclock') return 'cooling';
    if (job.type === 'contract') return job.needs[0] ? job.needs[0].category : null;
    return null;
  }
  function maybeTaste(state, job) {
    var C = CFG();
    if (!Engine.chance(C.TASTE_CHANCE)) return null;
    var cat = tasteCategoryFor(job);
    if (!cat) return null;
    var parts = purchasableByCategory(state, cat);
    var brands = [];
    for (var i = 0; i < parts.length; i++) {
      var b = parts[i].brand;
      if (b && brands.indexOf(b) === -1) brands.push(b);
    }
    if (!brands.length) return null;   // v1 catalogs have no brands — no tastes
    var brand = Engine.pick(brands);
    return {
      brand: brand, category: cat,
      bonusPct: Engine.randInt(C.TASTE_BONUS_MIN, C.TASTE_BONUS_MAX),
      label: 'Swears by ' + brand + ' ' + (TASTE_PLURAL[cat] || cat)
    };
  }
  function tasteMatchesPart(taste, part) {
    return !!(taste && part && part.brand === taste.brand &&
              (!taste.category || part.category === taste.category));
  }
  Jobs.tasteMatchesPart = tasteMatchesPart;
  function machineFlavor(state, year) {
    var cpus = purchasableByCategory(state, 'cpu').filter(function (p) {
      return year - p.introYear <= 9;
    });
    var c = Engine.pick(cpus.length ? cpus : purchasableByCategory(state, 'cpu'));
    return c ? c.name + ' system' : 'aging system';
  }

  // pay = laborRate(year) * hoursRequired * difficultyMult * typeMult  (§5.4)
  function basePay(state, type, hoursRequired, difficulty) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var dm = C.DIFF_MULT[Engine.clamp(difficulty, 1, 5) - 1];
    var tm = C.TYPE_MULT[type] != null ? C.TYPE_MULT[type] : 1;
    return Engine.round2(Engine.laborRate(year) * hoursRequired * dm * tm);
  }

  function requiredDrTier(year) { return year < 1995 ? 1 : (year < 2010 ? 2 : 3); }
  Jobs.requiredDrTier = requiredDrTier;

  // Human formatting for minimum-spec requirements (§9.3)
  function fmtPerfReq(key, v) {
    if (key === 'ramMB') return v >= 1024 ? Engine.round2(v / 1024) + ' GB' : Engine.round2(v) + ' MB';
    if (key === 'storageGB') return v >= 1 ? Engine.round2(v) + ' GB' : Math.round(v * 1000) + ' MB';
    if (key === 'gpu') return 'graphics score ' + Engine.round2(v);
    if (key === 'cpu') return 'CPU score ' + Engine.round2(v);
    return Engine.round2(v) + ' ' + key;
  }
  Jobs.fmtPerfReq = fmtPerfReq;
  function minPerfText(minPerf) {
    var parts = [];
    for (var k in minPerf) {
      if (Object.prototype.hasOwnProperty.call(minPerf, k))
        parts.push(fmtPerfReq(k, minPerf[k]));
    }
    return parts.join(', ');
  }

  // ------------------------------------------------------------------
  // §10.6: deadlines never land on Sunday
  // ------------------------------------------------------------------
  function shiftOffSunday(state, day) {
    return Engine.dateInfo(day, state).isSunday ? day + 1 : day;
  }
  Jobs.shiftOffSunday = shiftOffSunday;

  // ------------------------------------------------------------------
  // §10.1 Step-based tasks
  // ------------------------------------------------------------------
  function stepPartCategory(job) {
    if (job.fault && job.fault.partCategory) return job.fault.partCategory;
    if (job.type === 'upgrade' || job.type === 'contract')
      return job.needs[0] ? job.needs[0].category : null;
    if (job.type === 'enthusiast' && job.subtype === 'overclock') return 'cooling';
    return null;
  }
  // Most-specific template wins: type exact, then subtype/partCategory
  // exact-or-null, then year window (§10.1).
  function matchStepTemplate(job, year) {
    var templates = Engine.getData().TASK_STEPS || [];
    var cat = stepPartCategory(job);
    var best = null, bestScore = -1;
    for (var i = 0; i < templates.length; i++) {
      var t = templates[i];
      if (!t || t.type !== job.type) continue;
      if (t.subtype != null && t.subtype !== job.subtype) continue;
      if (t.partCategory != null && t.partCategory !== cat) continue;
      if (t.minYear != null && year < t.minYear) continue;
      if (t.maxYear != null && year > t.maxYear) continue;
      var score = (t.subtype != null ? 2 : 0) + (t.partCategory != null ? 2 : 0) +
                  ((t.minYear != null || t.maxYear != null) ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
  function stepCondOk(cond, state, job, year) {
    if (!cond) return true;
    if (cond === 'cooler') {   // machine/build has cooling, or modern era
      var ids = (job.machine && job.machine.partIds) ||
                (job.build && job.build.parts) || [];
      for (var i = 0; i < ids.length; i++) {
        var p = Engine.partById(ids[i]);
        if (p && p.category === 'cooling') return true;
      }
      return year >= 1995;
    }
    if (cond === 'crt-kit') return Engine.equipmentOwned(state, 'crt-kit');
    return true;   // unknown conditions are inclusive (defensive)
  }
  var INSTALL_LABEL_RE = /install|swap|replace|fit |seat|mount|clone/i;

  /* Assemble the step checklist (§10.1). Falls back to a synthesized generic
   * checklist when no template resolves (old data / migrated saves). */
  function assembleSteps(state, job) {
    var year = Engine.currentYear(state);
    var tmpl = matchStepTemplate(job, year);
    var steps = [];
    if (tmpl && Array.isArray(tmpl.steps)) {
      for (var i = 0; i < tmpl.steps.length; i++) {
        var s = tmpl.steps[i];
        if (!s) continue;
        if (s.minYear != null && year < s.minYear) continue;
        if (s.maxYear != null && year > s.maxYear) continue;
        if (!stepCondOk(s.cond, state, job, year)) continue;
        steps.push({ id: 's' + (steps.length + 1), label: String(s.label || 'Bench work'),
                     hours: Math.max(0.25, Engine.round2(s.hours || 0.25)),
                     done: false, progress: 0, needIndex: null,
                     install: !!s.install });
      }
    }
    if (steps.length < 2) steps = synthesizeSteps(job.hoursRequired || 2, job);
    // Map each (eventual) need to the step that installs it. Repairs map before
    // diagnosis reveals the need — the block simply holds until it exists.
    var needCount = expectedNeedCount(job);
    if (needCount > 0) {
      var installIdxs = [], k;
      for (k = 0; k < steps.length; k++) if (steps[k].install) installIdxs.push(k);
      if (!installIdxs.length) {
        for (k = 0; k < steps.length; k++)
          if (INSTALL_LABEL_RE.test(steps[k].label)) installIdxs.push(k);
      }
      if (!installIdxs.length) installIdxs.push(Math.floor(steps.length / 2));
      for (var n = 0; n < needCount; n++) {
        var si = Math.min(installIdxs[Math.min(n, installIdxs.length - 1)], steps.length - 1);
        while (si < steps.length - 1 && steps[si].needIndex != null) si++;
        if (steps[si].needIndex == null) steps[si].needIndex = n;
      }
    }
    for (var d = 0; d < steps.length; d++) delete steps[d].install;
    job.steps = steps;
    job.stepIndex = 0;
    // Contracts: the checklist covers one unit; hours scale with the unit count.
    if (job.units > 1) {
      var perUnit = 0;
      steps.forEach(function (s) { perUnit += s.hours; });
      job.perUnitHours = Engine.round2(perUnit);
      steps.forEach(function (s) {
        s.hours = Engine.round2(s.hours * job.units);
        s.label += ' (x' + job.units + ' units)';
      });
    }
    recomputeHours(job);
  }
  Jobs.assembleSteps = assembleSteps;
  function expectedNeedCount(job) {
    if (job.needs && job.needs.length) return job.needs.length;
    if (job.fault && job.fault.partCategory) return 1;  // appears at diagnosis
    return 0;
  }
  function recomputeHours(job) {
    var total = 0, done = 0;
    for (var i = 0; i < job.steps.length; i++) {
      total += job.steps[i].hours;
      done += job.steps[i].hours * (job.steps[i].progress || 0);
    }
    job.hoursRequired = Engine.round2(total);
    job.hoursDone = Engine.round2(done);
  }
  // Generic fallback checklist: prep 25% / main 50% / test 25%, quarter-rounded.
  function synthesizeSteps(totalHours, job) {
    var h = Math.max(0.75, totalHours || 2);
    function q(x) { return Math.max(0.25, Math.round(x * 4) / 4); }
    var a = q(h * 0.25), b = q(h * 0.5);
    var c = Math.max(0.25, Engine.round2(h - a - b));
    var installs = !!((job && job.needs && job.needs.length) ||
                      (job && job.fault && job.fault.partCategory));
    return [
      { id: 's1', label: 'Open up, inspect & prep', hours: a,
        done: false, progress: 0, needIndex: null },
      { id: 's2', label: installs ? 'Swap in the replacement part' : 'Do the bench work',
        hours: b, done: false, progress: 0, needIndex: null, install: true },
      { id: 's3', label: 'Test & button up', hours: c,
        done: false, progress: 0, needIndex: null }
    ];
  }
  Jobs.synthesizeSteps = synthesizeSteps;
  // Lazy synthesis for migrated saves (§10): steps appear on first touch.
  function ensureSteps(state, job) {
    if (job.steps && job.steps.length) return;
    var priorDone = job.hoursDone || 0;
    assembleSteps(state, job);
    // Replay prior progress into the fresh checklist (no installs re-fired —
    // v2 installs already happened at assign time).
    var left = Math.min(job.hoursRequired, priorDone);
    var idx = 0;
    while (left > 0 && idx < job.steps.length) {
      var st = job.steps[idx];
      if (left >= st.hours - 1e-9) { st.progress = 1; st.done = true; left -= st.hours; idx++; }
      else { st.progress = left / st.hours; left = 0; }
    }
    job.stepIndex = idx;
    recomputeHours(job);
  }
  Jobs.ensureSteps = ensureSteps;
  // Premium part adds +0.25h to its install step (§10.1)
  function nudgeStep(job, needIndex, delta) {
    if (!job.steps || !job.steps.length) return;
    var st = null;
    for (var i = 0; i < job.steps.length; i++)
      if (job.steps[i].needIndex === needIndex) { st = job.steps[i]; break; }
    if (!st) st = job.steps[job.steps.length - 1];
    if (st.done) return;
    st.hours = Math.max(0.25, Engine.round2(st.hours + delta));
    recomputeHours(job);
  }

  // ------------------------------------------------------------------
  // §10.4 Customer machines (repair/upgrade carry an era-plausible PC)
  // ------------------------------------------------------------------
  function assembleMachineParts(state) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var mobos = purchasableByCategory(state, 'motherboard').filter(function (m) {
      return year - m.introYear <= C.ASIS_MAX_AGE_YEARS;
    });
    if (!mobos.length) mobos = purchasableByCategory(state, 'motherboard');
    var mobo = Engine.pick(mobos);
    if (!mobo) return null;
    var partIds = [mobo.id];
    var cats = ['cpu', 'ram', 'storage', 'psu', 'case'];
    for (var c = 0; c < cats.length; c++) {
      var options = purchasableByCategory(state, cats[c]).filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var part = Engine.pick(options);
      if (!part) return null;   // can't assemble an era machine
      partIds.push(part.id);
    }
    if (!mobo.integratedVideo) {
      var gpus = purchasableByCategory(state, 'gpu').filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var gpu = Engine.pick(gpus);
      if (gpu) partIds.push(gpu.id);
    }
    return { partIds: partIds, mobo: mobo };
  }

  /* Customer's PC for repair/upgrade jobs (§10.4). targetCategory (the fault
   * or upgrade slot) is guaranteed present; faultPartIdx points at it. */
  function customerMachineFor(state, targetCategory) {
    var built = assembleMachineParts(state);
    if (!built) return null;
    var partIds = built.partIds, mobo = built.mobo;
    var year = Engine.currentYear(state);
    var idx = null;
    if (targetCategory) {
      for (var i = 0; i < partIds.length; i++) {
        var p = Engine.partById(partIds[i]);
        if (p && p.category === targetCategory) { idx = i; break; }
      }
      if (idx == null) {   // machine lacks the category (cooling/gpu) — add one
        var extras = purchasableByCategory(state, targetCategory).filter(function (p) {
          return Engine.Compat.fits(p, mobo).fits;
        });
        var extra = Engine.pick(extras);
        if (extra) { partIds.push(extra.id); idx = partIds.length - 1; }
      }
    }
    var cpuName = null;
    for (var j = 0; j < partIds.length; j++) {
      var pj = Engine.partById(partIds[j]);
      if (pj && pj.category === 'cpu') { cpuName = pj.name; break; }
    }
    var machineYear = Engine.clamp(
      Engine.randInt(mobo.introYear, Math.min(year, (mobo.eolYear || year) + 2)),
      mobo.introYear, year);
    return {
      name: (cpuName || 'Aging') + ' system', year: machineYear,
      partIds: partIds, askPrice: null, boughtFor: null,
      faultPartIdx: idx, condition: null, faultRepaired: false,
      specSummary: specSummaryFor(partIds)
    };
  }

  // ------------------------------------------------------------------
  // §10.2 Derived difficulty (no random rolls)
  // ------------------------------------------------------------------
  function deriveDifficulty(state, job) {
    var C = CFG();
    var d;
    if (job.type === 'peripheral') {
      d = C.PERIPHERAL_KIND_DIFF[job.subtype] != null ?
          C.PERIPHERAL_KIND_DIFF[job.subtype] : 2;
    } else {
      d = C.DIFF_BASE[job.type] != null ? C.DIFF_BASE[job.type] : 2;
    }
    d += C.DIFF_CAT_BONUS[stepPartCategory(job)] || 0;
    var year = Engine.currentYear(state);
    var ids = (job.machine && job.machine.partIds) || [];
    var hasPremium = false, ageSum = 0, n = 0;
    for (var i = 0; i < ids.length; i++) {
      var p = Engine.partById(ids[i]);
      if (!p) continue;
      if (p.tier === 'premium') hasPremium = true;
      ageSum += year - p.introYear; n++;
    }
    if (isBuildJob(job) && job.build &&
        job.build.budget > Engine.baselineFor(year).buildBudget * 1.15) hasPremium = true;
    if (hasPremium) d += 1;
    if (n > 0 && ageSum / n > C.LEGACY_MACHINE_YEARS) d += 1;
    return Engine.clamp(Math.round(d), 1, 5);
  }

  // §10.5: peripheral item kind, defensively inferred for old-format data
  function peripheralKindOf(item) {
    if (item && item.kind) return item.kind;
    if (item && item.crt) return 'crt';
    var name = String((item && item.name) || '').toLowerCase();
    if (name.indexOf('printer') !== -1) return 'printer';
    if (name.indexOf('monitor') !== -1 || name.indexOf('crt') !== -1) return 'crt';
    if (name.indexOf('lcd') !== -1) return 'lcd';
    if (name.indexOf('modem') !== -1) return 'modem';
    if (name.indexOf('scanner') !== -1) return 'scanner';
    if (name.indexOf('mouse') !== -1 || name.indexOf('keyboard') !== -1) return 'input';
    return 'other';
  }

  function makeOffer(state) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var equip = Engine.equipEffects(state);
    var rep = state.reputation;
    var F = FLAVOR();

    // Era-gated weighted type pool (§5.4)
    var pool = [];
    function add(type, subtype, w) { if (w > 0) pool.push({ type: type, subtype: subtype, w: w }); }
    var faultCats = repairFaultCategories(state);
    if (faultCats.length) add('repair', null, 10);
    var upgCats = ['ram', 'storage', 'gpu'].filter(function (c) {
      return purchasableByCategory(state, c).length > 0;
    });
    if (upgCats.length) add('upgrade', null, 2);
    if (purchasableByCategory(state, 'os').length) add('software', 'os_install', 2);
    if (year >= 1988 && Engine.equipmentOwned(state, 'software-station'))
      add('software', 'virus', (year >= 1995 && year <= 2010) ? 6 : 2);
    add('cleaning', null, 2);
    add('peripheral', 'printer', 1.5);
    if (year <= 2005) add('peripheral', 'crt', 1.5);
    if (equip.drTier >= 1) add('data_recovery', null, 2);
    if (state.customBuildsUnlocked && equip.enablesBuilds) add('build', null, 3);
    if (year >= 1997 && rep.prestige >= 1 && purchasableByCategory(state, 'cooling').length)
      add('enthusiast', 'overclock', 1);
    if (year >= 2010 && rep.prestige >= 1) add('enthusiast', 'aesthetic', 1);
    if (rep.prestige >= 2 &&
        (state.lastContractDay == null ||
         state.day - state.lastContractDay >= C.CONTRACT_MIN_DAYS_BETWEEN))
      add('contract', null, 0.8);
    if (!pool.length) return null;

    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i].w;
    var r = Engine.rand() * total, choice = pool[0];
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { choice = pool[i]; break; } }

    var job = {
      id: state.jobs.nextId++,
      type: choice.type, subtype: choice.subtype || null,
      rush: false,
      title: '', blurb: '',
      customer: null,             // assigned after the switch (affinity, §9.2)
      taste: null,
      pay: 0,
      offeredDay: state.day, deadlineDay: state.day + Engine.randInt(C.DEADLINE_MIN, C.DEADLINE_MAX),
      difficulty: Engine.randInt(1, 3),
      speed: 'standard',
      status: 'offer',
      hoursRequired: 1, hoursDone: 0,
      diagnosed: true, needsDiagnosis: false,
      fault: null,
      needs: [],
      build: null,
      units: 1, unitsDone: 0,
      machine: null,
      drTier: 0,
      crt: false,
      result: null
    };
    var bl = Engine.baselineFor(year);

    switch (choice.type) {
      case 'repair': {
        var cat = pickFaultCategory(faultCats);
        var tmpl = Engine.pick((F.faults || {})[cat] || [{ desc: 'Mystery gremlins', laborHours: 2 }]);
        job.fault = {
          desc: tmpl.desc,
          partCategory: cat === 'laborOnly' ? null : cat,
          laborHours: Engine.clamp(Math.round(tmpl.laborHours || 2), 1, 3)
        };
        job.hoursRequired = job.fault.laborHours;
        job.needsDiagnosis = true; job.diagnosed = false;
        job.title = 'Repair: ' + machineFlavor(state, year) + ' ' +
          Engine.pick(["won't boot", 'keeps crashing', 'is acting up',
                       'is making noises', 'died overnight']);
        break;
      }
      case 'upgrade': {
        // §9.3: upgrades carry a minimum spec chosen vs the year baseline,
        // snapped to a real purchasable part so the job is always satisfiable.
        var uc = Engine.pick(upgCats);
        var upgKey = { ram: 'ramMB', storage: 'storageGB', gpu: 'gpu' }[uc];
        var upgName = { ram: 'RAM upgrade', storage: 'Storage upgrade',
                        gpu: 'Graphics upgrade' }[uc];
        var wanted = (bl[upgKey] || 0) * Engine.pick([0.5, 0.75, 1.0]);
        var perfs = purchasableByCategory(state, uc).map(function (p) {
          return (p.perf || {})[upgKey] || 0;
        }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
        var minVal = null;
        for (var pi = perfs.length - 1; pi >= 0; pi--) {
          if (perfs[pi] <= wanted) { minVal = perfs[pi]; break; }
        }
        if (minVal == null && perfs.length) minVal = perfs[0];
        var minPerf = null, label = upgName;
        if (minVal != null) {
          minPerf = {};
          minPerf[upgKey] = minVal;
          label = upgName + ' — at least ' + fmtPerfReq(upgKey, minVal);
        }
        job.needs = [{ category: uc, anyOfTags: null, minPerf: minPerf, qty: 1,
                       filledPartIds: [], label: label }];
        job.hoursRequired = 1;
        job.title = 'Upgrade: ' + upgName.toLowerCase() + ' for a ' + machineFlavor(state, year);
        break;
      }
      case 'software': {
        if (choice.subtype === 'virus') {
          job.hoursRequired = 2;
          job.title = 'Software: virus cleanup';
        } else {
          job.hoursRequired = Engine.randInt(1, 2);
          job.needs = [{ category: 'os', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Operating system' }];
          job.title = 'Software: fresh OS install';
        }
        break;
      }
      case 'cleaning': {
        if (year >= 1997 && Engine.chance(0.4)) {
          job.subtype = 'thermal_paste';
          job.title = 'Cleaning: dust-out & fresh thermal paste';
          job.hoursRequired = 1;
        } else {
          job.title = 'Cleaning: full dust-out';
          job.hoursRequired = Engine.pick([0.5, 1]);
        }
        break;
      }
      case 'peripheral': {
        var items = (F.peripheralItems || []).filter(function (it) {
          return year >= (it.minYear || 0) && year <= (it.maxYear || 9999) &&
                 (choice.subtype === 'crt' ? it.crt : !it.crt);
        });
        var item = Engine.pick(items);
        var itemName = item ? item.name : (choice.subtype === 'crt' ? 'CRT monitor' : 'printer');
        job.crt = choice.subtype === 'crt';
        job.hoursRequired = Engine.randInt(1, 2);
        job.title = 'Peripheral: ' + itemName + ' repair';
        break;
      }
      case 'data_recovery': {
        job.drTier = requiredDrTier(year);
        job.hoursRequired = Engine.randInt(2, 3);
        job.difficulty = Engine.randInt(2, 4);
        job.title = 'Data recovery: dying drive (rig tier ' + job.drTier + ')';
        break;
      }
      case 'build': {
        var budget = Engine.round2(bl.buildBudget *
          Engine.uniform(C.BUILD_BUDGET_SPREAD_MIN, C.BUILD_BUDGET_SPREAD_MAX));
        var cases = Object.keys(C.USECASE_TARGETS).filter(function (u) {
          return u !== 'gaming' || year >= 1993;
        });
        var useCase = Engine.pick(cases);
        var t = C.USECASE_TARGETS[useCase];
        job.build = {
          budget: budget, useCase: useCase,
          minPerf: {
            cpu: Engine.round2(bl.cpu * t.cpu), gpu: Engine.round2(bl.gpu * t.gpu),
            ramMB: Engine.round2(bl.ramMB * t.ramMB),
            storageGB: Engine.round2(bl.storageGB * t.storageGB)
          },
          minStyle: 0, parts: [], validated: false, committed: false
        };
        job.pay = budget;
        job.difficulty = Engine.randInt(2, 4);
        job.hoursRequired = C.BUILD_HOURS +
          (budget > bl.buildBudget * 1.15 ? C.BUILD_HOURS_PREMIUM_EXTRA : 0);
        job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX);
        job.title = 'Custom build: ' + useCase + ' PC (' + Engine.fmtMoney(budget) + ' budget)';
        break;
      }
      case 'enthusiast': {
        job.difficulty = Engine.randInt(3, 5);
        if (choice.subtype === 'overclock') {
          job.hoursRequired = 2;
          job.needs = [{ category: 'cooling', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Beefier cooling' }];
          job.title = 'Enthusiast: overclock & cooling job';
        } else { // aesthetic: a build with a style bar
          var abudget = Engine.round2(bl.buildBudget * Engine.uniform(1.0, 1.5));
          var at = C.USECASE_TARGETS.gaming;
          job.build = {
            budget: abudget, useCase: 'gaming',
            minPerf: {
              cpu: Engine.round2(bl.cpu * at.cpu), gpu: Engine.round2(bl.gpu * at.gpu),
              ramMB: Engine.round2(bl.ramMB * at.ramMB),
              storageGB: Engine.round2(bl.storageGB * at.storageGB)
            },
            minStyle: C.AESTHETIC_MIN_STYLE, parts: [], validated: false, committed: false
          };
          job.pay = abudget;
          job.hoursRequired = C.BUILD_HOURS + 1;
          job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX);
          job.title = 'Enthusiast: showpiece build (' + Engine.fmtMoney(abudget) + ')';
        }
        break;
      }
      case 'contract': {
        state.lastContractDay = state.day;
        job.units = Engine.randInt(C.CONTRACT_UNITS_MIN, C.CONTRACT_UNITS_MAX);
        job.difficulty = 3;
        var perUnit = Engine.randInt(C.CONTRACT_UNIT_HOURS_MIN, C.CONTRACT_UNIT_HOURS_MAX);
        job.perUnitHours = perUnit;
        job.hoursRequired = perUnit * job.units;
        job.deadlineDay = state.day + Engine.randInt(C.CONTRACT_DEADLINE_MIN, C.CONTRACT_DEADLINE_MAX);
        var buildContract = state.customBuildsUnlocked && equip.enablesBuilds && Engine.chance(0.5);
        if (buildContract) {
          job.subtype = 'contract_build';
          job.needs = ['ram', 'storage'].filter(function (c) {
            return purchasableByCategory(state, c).length > 0;
          }).map(function (c) {
            return { category: c, anyOfTags: null, minPerf: null, qty: job.units,
                     filledPartIds: [], label: 'Per-unit ' + c };
          });
          job.title = 'Contract: assemble ' + job.units + ' office machines';
        } else {
          job.subtype = 'contract_upgrade';
          var cc = Engine.pick(['ram', 'storage'].filter(function (c) {
            return purchasableByCategory(state, c).length > 0;
          })) || 'ram';
          job.needs = [{ category: cc, anyOfTags: null, minPerf: null, qty: job.units,
                         filledPartIds: [], label: 'Per-unit ' + cc + ' upgrade' }];
          job.title = 'Contract: upgrade ' + job.units + ' office machines';
        }
        break;
      }
    }

    if (!isBuildJob(job) && job.type !== 'contract') {
      job.pay = basePay(state, job.type, job.hoursRequired, job.difficulty);
    } else if (job.type === 'contract') {
      job.pay = basePay(state, 'contract', job.hoursRequired, job.difficulty);
    }

    // §9.2: customer type first (era + affinity gated), then a fitting blurb,
    // then maybe a brand taste relevant to the job.
    job.customer = customerFor(state, year, affinityKeyFor(job));
    job.blurb = blurbFor(job.type, job.customer.type);
    job.taste = maybeTaste(state, job);

    // Rush jobs: repair/software/upgrade, 8%: due today, pay x1.8 (§5.4)
    if ((job.type === 'repair' || job.type === 'software' || job.type === 'upgrade') &&
        Engine.chance(C.RUSH_CHANCE)) {
      job.rush = true;
      job.deadlineDay = job.offeredDay;
      job.pay = Engine.round2(job.pay * C.RUSH_PAY_MULT);
      job.title = 'RUSH — ' + job.title;
    }
    return job;
  }

  // Weighted list of eligible fault sources (CONFIG.FAULT_CATEGORY_WEIGHTS).
  function repairFaultCategories(state) {
    var F = FLAVOR();
    var weights = CFG().FAULT_CATEGORY_WEIGHTS || {};
    var out = [], faults = F.faults || {};
    var cats = Object.keys(faults);
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      if (!faults[c] || !faults[c].length) continue;
      if (c !== 'laborOnly' && !purchasableByCategory(state, c).length) continue;
      out.push({ cat: c, w: weights[c] != null ? weights[c] : 1 });
    }
    return out;
  }
  function pickFaultCategory(cats) {
    var total = 0, i;
    for (i = 0; i < cats.length; i++) total += cats[i].w;
    var r = Engine.rand() * total;
    for (i = 0; i < cats.length; i++) { r -= cats[i].w; if (r <= 0) return cats[i].cat; }
    return cats.length ? cats[cats.length - 1].cat : 'laborOnly';
  }

  // ------------------------------------------------------------------
  // Offer lifecycle
  // ------------------------------------------------------------------
  Jobs.acceptOffer = function (state, jobId) {
    var job = Jobs.findOffer(state, jobId);
    if (!job) return err('Offer not found');
    var slots = Engine.tierInfo(state).workstationSlots;
    var activeNonRefurb = state.jobs.active.filter(function (j) { return j.type !== 'refurb'; });
    if (activeNonRefurb.length >= slots * CFG().HARD_CAP_SLOTS_MULT)
      return err('All workstations committed — finish something first');
    removeFrom(state.jobs.offers, job);
    job.status = 'active';
    state.jobs.active.push(job);
    return { ok: true };
  };

  Jobs.declineOffer = function (state, jobId) {
    var job = Jobs.findOffer(state, jobId);
    if (!job) return err('Offer not found');
    removeFrom(state.jobs.offers, job);
    state.declinesToday = (state.declinesToday || 0) + 1;
    if (state.declinesToday === CFG().DECLINES_FREE_PER_DAY + 1) {
      Engine.pushScore(state, CFG().DECLINE_DING_SCORE); // word gets around
      Engine.pushNews(state, 'job', 'Turning away a lot of work',
        'Word gets around when the shop keeps saying no.');
    }
    return { ok: true };
  };

  Jobs.setJobSpeed = function (state, jobId, speed) {
    if (!CFG().SPEED[speed]) return err('Unknown speed: ' + speed);
    var job = Jobs.findActive(state, jobId) || Jobs.findOffer(state, jobId);
    if (!job) return err('Job not found');
    if (job.status === 'done' || job.status === 'sold') return err('Job already finished');
    job.speed = speed;
    return { ok: true };
  };

  // ------------------------------------------------------------------
  // Diagnosis
  // ------------------------------------------------------------------
  Jobs.diagnoseJob = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    if (!job.needsDiagnosis) return err('Nothing to diagnose');
    if (job.diagnosed) return err('Already diagnosed');
    var equip = Engine.equipEffects(state);
    var hours = Engine.round2(1 * equip.diagHoursMult);
    var spent = Engine.spendHours(state, hours);   // overtime rules apply (§9.4)
    if (!spent.ok) return spent;
    job.diagnosed = true;
    var fault = job.fault || { desc: 'No fault found', partCategory: null, laborHours: 1 };
    if (fault.partCategory) {
      var need = { category: fault.partCategory, anyOfTags: null, minPerf: null,
                   qty: 1, filledPartIds: [], label: 'Replacement ' + fault.partCategory };
      // Refurbs: replacement must fit the machine's motherboard.
      if (job.type === 'refurb' && job.machine) {
        var mobo = null;
        for (var i = 0; i < job.machine.partIds.length; i++) {
          var mp = Engine.partById(job.machine.partIds[i]);
          if (mp && mp.category === 'motherboard') mobo = mp;
        }
        var prefix = Engine.Compat.namespaceForCategory(fault.partCategory);
        if (mobo && prefix) {
          var tags = Engine.Compat.tagsInNamespace(mobo, prefix);
          if (tags.length) need.anyOfTags = tags;
        }
      }
      job.needs = [need];
    }
    return { ok: true, hoursSpent: hours,
             fault: { desc: fault.desc, partCategory: fault.partCategory } };
  };

  // ------------------------------------------------------------------
  // Needs & parts
  // ------------------------------------------------------------------
  // Returns null if the part satisfies the need, else a readable problem string.
  function candidateProblem(part, need, state) {
    if (!part) return 'Unknown part';
    if (part.category !== need.category) return 'Wrong kind of part for this slot';
    if (!purchasable(part, state)) return part.name + ' is not on the market';
    if (need.anyOfTags && need.anyOfTags.length) {
      var hit = false, tags = part.platformTags || [];
      for (var i = 0; i < need.anyOfTags.length; i++)
        if (tags.indexOf(need.anyOfTags[i]) !== -1) { hit = true; break; }
      if (!hit) return part.name + ' does not fit this machine (' +
                       need.anyOfTags.join('/') + ' needed)';
    }
    if (!meetsMinPerf(part, need)) {
      return part.name + ' is below the required spec — needs at least ' +
             minPerfText(need.minPerf);
    }
    return null;
  }
  function meetsMinPerf(part, need) {
    if (!need.minPerf) return true;
    var keys = Object.keys(need.minPerf);
    for (var k = 0; k < keys.length; k++) {
      if (((part.perf || {})[keys[k]] || 0) < need.minPerf[keys[k]]) return false;
    }
    return true;
  }
  // Category/tag fit only — below-spec parts still appear in pickers, greyed (§9.3).
  function candidateListed(part, need, state) {
    if (!part || part.category !== need.category) return false;
    if (!purchasable(part, state)) return false;
    if (need.anyOfTags && need.anyOfTags.length) {
      var hit = false, tags = part.platformTags || [];
      for (var i = 0; i < need.anyOfTags.length; i++)
        if (tags.indexOf(need.anyOfTags[i]) !== -1) { hit = true; break; }
      if (!hit) return false;
    }
    return true;
  }

  Jobs.getJobNeeds = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return [];
    var out = [];
    for (var i = 0; i < job.needs.length; i++) {
      var need = job.needs[i];
      var options = [];
      var cands = purchasableByCategory(state, need.category);
      for (var c = 0; c < cands.length; c++) {
        var part = cands[c];
        if (!candidateListed(part, need, state)) continue;
        var inv = Engine.inventoryEntry(state, part.id);
        var opt = {
          partId: part.id, name: part.name,
          source: (inv && inv.qty > 0) ? 'inventory' : 'market',
          price: (inv && inv.qty > 0) ? 0 : P().priceOf(part, state, { buy: true }),
          inStock: inv ? inv.qty : 0,
          meets: meetsMinPerf(part, need),                // §9.3
          tasteMatch: tasteMatchesPart(job.taste, part)   // §9.2
        };
        options.push(opt);
      }
      options.sort(function (a, b) { return a.price - b.price; });
      out.push({ index: i, label: need.label, category: need.category,
                 qty: need.qty, filled: need.filledPartIds.length, options: options });
    }
    return out;
  };

  // Supply-run rule: first market/as-is purchase of the day costs 0.5h
  // (overtime rules apply, §9.4).
  function supplyRun(state) {
    if (state.supplyRunDoneToday) return { ok: true, hours: 0 };
    var h = CFG().SUPPLY_RUN_HOURS;
    var spent = Engine.spendHours(state, h);
    if (!spent.ok) return spent;
    state.supplyRunDoneToday = true;
    return { ok: true, hours: h };
  }

  Jobs.installPart = function (state, jobId, needIndex, partId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    var idx = Number(needIndex);
    var need = job.needs[idx];
    if (!need) return err('No such part slot');
    if (need.filledPartIds.length >= need.qty) return err('That slot is already filled');
    var part = Engine.partById(partId);
    var problem = candidateProblem(part, need, state);
    if (problem) return err(problem);

    var C = CFG();
    var equip = Engine.equipEffects(state);
    var mishapP = C.MISHAP_PART_DAMAGE * equip.mishapMult;
    var toFill = need.qty - need.filledPartIds.length;
    var spent = 0, filledNow = 0, mishaps = 0;

    for (var u = 0; u < toFill; u++) {
      var inv = Engine.inventoryEntry(state, part.id);
      var chargePrice = P().priceOf(part, state); // customer-markup basis (undiscounted)
      if (inv && inv.qty > 0) {
        Engine.inventoryRemove(state, part.id, 1);
      } else {
        var buyPrice = P().priceOf(part, state, { buy: true });
        if (state.cash < buyPrice) {
          if (filledNow > 0 || mishaps > 0) break; // partial fill (contracts)
          return err('Not enough cash for ' + part.name + ' (' + Engine.fmtMoney(buyPrice) + ')');
        }
        var run = supplyRun(state);
        if (!run.ok) { if (filledNow > 0 || mishaps > 0) break; return run; }
        Engine.addCash(state, -buyPrice);
        Engine.ledgerAdd(state, 'partsCost', buyPrice);
        spent = Engine.round2(spent + buyPrice);
      }
      // ESD / handling mishap: part destroyed, must re-source (§5.5)
      if (Engine.chance(mishapP)) {
        mishaps++;
        if (state.shop.insurance) {
          var refund = Engine.round2(chargePrice * C.INSURANCE_COVER);
          Engine.addCash(state, refund);
          Engine.ledgerAdd(state, 'other', -refund);
        }
        Engine.pushNews(state, 'mishap', 'Static zap on the bench',
          'A ' + part.name + ' died during installation' +
          (state.shop.insurance ? ' — insurance covered most of it.' : '.'));
        continue;
      }
      need.filledPartIds.push(part.id);
      job.partsUsed = job.partsUsed || [];
      job.partsUsed.push({ partId: part.id, price: chargePrice });
      filledNow++;
      // Refurb: swap the replacement into the machine
      if (job.type === 'refurb' && job.machine && job.machine.faultPartIdx != null) {
        job.machine.partIds[job.machine.faultPartIdx] = part.id;
        job.machine.faultRepaired = true;
        job.machine.specSummary = specSummaryFor(job.machine.partIds);
      }
    }
    return { ok: true, cost: spent, filledNow: filledNow,
             mishap: mishaps > 0, mishaps: mishaps,
             filled: need.filledPartIds.length, qty: need.qty };
  };

  // ------------------------------------------------------------------
  // Build configurator
  // ------------------------------------------------------------------
  var BUILD_CATS = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case',
                    'cooling', 'os'];

  function buildJobOrErr(state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return { error: 'Job not active' };
    if (!isBuildJob(job) || !job.build) return { error: 'Not a custom-build job' };
    return { job: job };
  }
  function selectedMobo(job) {
    for (var i = 0; i < job.build.parts.length; i++) {
      var p = Engine.partById(job.build.parts[i]);
      if (p && p.category === 'motherboard') return p;
    }
    return null;
  }

  Jobs.getBuildCatalog = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return { categories: {} };
    var job = g.job;
    var mobo = selectedMobo(job);
    var categories = {};
    for (var c = 0; c < BUILD_CATS.length; c++) {
      var cat = BUILD_CATS[c];
      var list = [];
      var cands = purchasableByCategory(state, cat);
      for (var i = 0; i < cands.length; i++) {
        var part = cands[i];
        var fit = (cat === 'motherboard') ? { fits: true, why: '' }
                                          : Engine.Compat.fits(part, mobo);
        var inv = Engine.inventoryEntry(state, part.id);
        list.push({
          partId: part.id, name: part.name,
          price: P().priceOf(part, state, { buy: true }),
          perf: part.perf || {}, tags: (part.platformTags || []).slice(),
          watts: part.watts || 0, style: part.style || 0,
          inStock: inv ? inv.qty : 0,
          compatible: fit.fits, why: fit.why,
          tasteMatch: tasteMatchesPart(job.taste, part)   // §9.2
        });
      }
      list.sort(function (a, b) { return a.price - b.price; });
      categories[cat] = list;
    }
    return { categories: categories };
  };

  Jobs.setBuildPart = function (state, jobId, category, partId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return err(g.error);
    var job = g.job;
    if (job.build.committed) return err('Build already committed');
    if (BUILD_CATS.indexOf(category) === -1) return err('Unknown category: ' + category);
    // Clear existing selection in this category
    job.build.parts = job.build.parts.filter(function (pid) {
      var p = Engine.partById(pid);
      return p && p.category !== category;
    });
    if (partId != null && partId !== '') {
      var part = Engine.partById(partId);
      if (!part || part.category !== category) return err('That part is not a ' + category);
      if (!purchasable(part, state)) return err(part.name + ' is not on the market');
      job.build.parts.push(part.id);
    }
    job.build.validated = false;
    return { ok: true };
  };

  Jobs.validateBuild = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return { valid: false, problems: [g.error], perf: {}, meetsTarget: false,
                          style: 0, partsCost: 0, budget: 0, underBudget: false };
    var job = g.job;
    var b = job.build;
    var res = Engine.Compat.validatePartList(b.parts, {
      requireFull: true, minPerfGpu: b.minPerf ? b.minPerf.gpu : null,
      year: Engine.currentYear(state)
    });
    var partsCost = 0;
    for (var i = 0; i < b.parts.length; i++) {
      partsCost = Engine.round2(partsCost + P().priceOf(b.parts[i], state, { buy: true }));
    }
    var perf = { cpu: res.perf.cpu, gpu: res.perf.gpu, ramMB: res.perf.ramMB,
                 storageGB: res.perf.storageGB, composite: res.composite };
    var meets = true, mp = b.minPerf || {};
    if ((perf.cpu || 0) < (mp.cpu || 0)) meets = false;
    if ((perf.gpu || 0) < (mp.gpu || 0)) meets = false;
    if ((perf.ramMB || 0) < (mp.ramMB || 0)) meets = false;
    if ((perf.storageGB || 0) < (mp.storageGB || 0)) meets = false;
    if (res.style < (b.minStyle || 0)) meets = false;
    return {
      valid: res.valid, problems: res.problems, perf: perf,
      meetsTarget: meets, style: res.style,
      partsCost: partsCost, budget: b.budget,
      underBudget: partsCost <= b.budget
    };
  };

  Jobs.commitBuild = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return err(g.error);
    var job = g.job;
    if (job.build.committed) return err('Build already committed');
    var v = Jobs.validateBuild(state, jobId);
    if (!v.valid) return err('Build has problems: ' + v.problems.join('; '));
    if (!v.meetsTarget) return err("Build doesn't meet the customer's targets yet");
    // Cost of parts not already in inventory
    var toBuy = [], cost = 0, i, part;
    for (i = 0; i < job.build.parts.length; i++) {
      part = Engine.partById(job.build.parts[i]);
      var inv = Engine.inventoryEntry(state, part.id);
      if (inv && inv.qty > 0 &&
          // count how many of this part are already claimed from stock in this build
          claimedSoFar(job.build.parts, i, part.id) < inv.qty) continue;
      toBuy.push(part);
      cost = Engine.round2(cost + P().priceOf(part, state, { buy: true }));
    }
    if (state.cash < cost)
      return err('Not enough cash for parts (' + Engine.fmtMoney(cost) + ' needed)');
    if (toBuy.length) {
      var run = supplyRun(state);
      if (!run.ok) return run;
    }
    job.partsUsed = job.partsUsed || [];
    for (i = 0; i < job.build.parts.length; i++) {
      part = Engine.partById(job.build.parts[i]);
      var chargePrice = P().priceOf(part, state);
      var inv2 = Engine.inventoryEntry(state, part.id);
      if (inv2 && inv2.qty > 0) {
        Engine.inventoryRemove(state, part.id, 1);
      } else {
        var buyPrice = P().priceOf(part, state, { buy: true });
        Engine.addCash(state, -buyPrice);
        Engine.ledgerAdd(state, 'partsCost', buyPrice);
      }
      job.partsUsed.push({ partId: part.id, price: chargePrice });
    }
    job.build.committed = true;
    job.build.validated = true;   // UI contract: hides configurator, shows Work
    job.needs = [];
    return { ok: true, cost: cost };
  };
  function claimedSoFar(partIds, uptoIdx, partId) {
    var n = 0;
    for (var i = 0; i < uptoIdx; i++) if (partIds[i] === partId) n++;
    return n;
  }

  // ------------------------------------------------------------------
  // Working & completion
  // ------------------------------------------------------------------
  function readinessProblem(state, job) {
    if (job.needsDiagnosis && !job.diagnosed) return 'Diagnose it first';
    if (isBuildJob(job) && job.build && !job.build.committed)
      return 'Configure and commit the build first';
    for (var i = 0; i < job.needs.length; i++) {
      if (job.needs[i].filledPartIds.length < job.needs[i].qty)
        return 'Missing parts: ' + job.needs[i].label;
    }
    return null;
  }

  function effectiveMult(state, job) {
    var C = CFG();
    var m = C.SPEED[job.speed] ? C.SPEED[job.speed].hoursMult : 1;
    if (job.type === 'software')
      m *= Engine.equipEffects(state).softwareHoursMult;
    // Soft workstation cap: beyond slots on the same day => +50% hours (§2.5)
    var slots = Engine.tierInfo(state).workstationSlots;
    var worked = state.workedToday || [];
    if (worked.indexOf(job.id) === -1 && worked.length >= slots)
      m *= C.SOFT_CAP_HOURS_MULT;
    return m;
  }

  Jobs.workJob = function (state, jobId, hours) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    if (job.status === 'done') return err('Already finished — sell it');
    var problem = readinessProblem(state, job);
    if (problem) return err(problem);
    var avail = Engine.hoursAvailable(state);      // includes overtime room (§9.4)
    if (avail < 0.5) return err('Too exhausted — call it a day');

    var C = CFG();
    var equip = Engine.equipEffects(state);
    // CRT safety: working a CRT job without the discharge kit risks injury (§5.5)
    if (job.crt && !equip.crtSafe && Engine.chance(C.MISHAP_CRT)) {
      var year = Engine.currentYear(state);
      var medical = Engine.round2(Engine.laborRate(year) * C.CRT_MEDICAL_LABOR_HOURS);
      var covered = state.shop.insurance ? Engine.round2(medical * C.INSURANCE_COVER) : 0;
      Engine.addCash(state, -(medical - covered));
      Engine.ledgerAdd(state, 'other', medical - covered);
      state.hoursLeft = 0;
      state.injuryDaysLeft = C.INJURY_DAYS;
      Engine.pushNews(state, 'mishap', 'CRT discharge injury!',
        'The tube bit back. Medical bill ' + Engine.fmtMoney(medical) +
        (covered ? ' (insurance covered ' + Engine.fmtMoney(covered) + ')' : '') +
        '. You will lose the next ' + C.INJURY_DAYS + ' days.');
      // UI contract: mishap:true lets the UI play its mishap sound
      return { ok: true, hoursSpent: 0, completed: false, mishap: true, mishapKind: 'crt' };
    }

    var m = effectiveMult(state, job);
    var remainingEff = Math.max(0, (job.hoursRequired - job.hoursDone) * m);
    var want = (hours == null) ? remainingEff : Math.max(0, Number(hours) || 0);
    // Default sessions stop at the regular day's end; explicit hour requests may
    // dip into overtime down to the -overtimeCap floor (§9.4).
    var budget = (hours == null) ? Math.max(state.hoursLeft, Math.min(avail, 0.5)) : avail;
    var spend = Math.min(budget, want, remainingEff);
    spend = Math.ceil(spend * 2 - 1e-9) / 2;              // half-hour granularity
    spend = Math.min(spend, avail);
    if (spend < 0.5) return err('Not enough time for a work session');

    state.hoursLeft = Engine.round2(state.hoursLeft - spend);
    job.hoursDone = Math.min(job.hoursRequired,
                             Engine.round2(job.hoursDone + spend / m) * 1);
    state.workedToday = state.workedToday || [];
    if (state.workedToday.indexOf(job.id) === -1) state.workedToday.push(job.id);
    if (job.perUnitHours) {
      job.unitsDone = Math.min(job.units, Math.floor(job.hoursDone / job.perUnitHours));
    }

    var completed = job.hoursDone >= job.hoursRequired - 1e-9;
    var result = null;
    if (completed) result = completeJob(state, job);
    return { ok: true, hoursSpent: spend, completed: completed, result: result };
  };

  function avgReliabilityFactor(job) {
    var used = job.partsUsed || [];
    if (!used.length) return 1;
    var sum = 0, n = 0;
    for (var i = 0; i < used.length; i++) {
      var p = Engine.partById(used[i].partId);
      if (p && p.reliability) { sum += p.reliability; n++; }
    }
    if (!n) return 1;
    var avg = sum / n;
    var f = Math.pow(100 / Math.max(1, avg), 2);
    return Math.min(CFG().CALLBACK_RELIABILITY_CAP, f);
  }

  function completeJob(state, job) {
    var C = CFG();
    var notes = [];
    var payout = 0;
    var year = Engine.currentYear(state);
    var speed = C.SPEED[job.speed] || C.SPEED.standard;

    // Refurb: becomes "ready to sell", no payout yet
    if (job.type === 'refurb') {
      job.status = 'done';
      job.machine.condition = Engine.round2(
        Engine.uniform(C.REFURB_COND_MIN, C.REFURB_COND_MAX));
      job.result = { onTime: true, score: null, payout: 0,
                     notes: ['Machine repaired — ready to sell'] };
      Engine.pushNews(state, 'job', 'Refurb ready: ' + job.machine.name,
        'Bench-tested and ready for a buyer.');
      return job.result;
    }

    var score = 5.0 + speed.scoreDelta;
    var drFailed = false;

    if (job.type === 'data_recovery') {
      var owned = Engine.equipEffects(state).drTier;
      var chance = C.DR_BASE + C.DR_PER_TIER * owned
                 - 0.15 * Math.max(0, (job.drTier || 1) - owned)
                 + (job.speed === 'quick' ? C.DR_QUICK : 0)
                 + (job.speed === 'meticulous' ? C.DR_MET : 0);
      chance = Engine.clamp(chance, C.DR_MIN, C.DR_MAX);
      if (!Engine.chance(chance)) {
        drFailed = true;
        score = C.SCORE_DR_FAIL;
        notes.push('Data unrecoverable — no charge');
        Engine.pushNews(state, 'job', 'Data recovery failed',
          'Some platters keep their secrets. The customer left empty-handed.');
      }
    }

    var tasteMatched = false;
    if (!drFailed) {
      payout = job.pay || 0;
      // §9.6: repairs bill a diagnostic/bench fee on top of labor + parts markup
      if (job.type === 'repair') {
        var benchFee = Engine.round2(Engine.laborRate(year) * C.BENCH_FEE_LABOR_MULT);
        payout = Engine.round2(payout + benchFee);
        notes.push('Bench fee: ' + Engine.fmtMoney(benchFee));
      }
      // Customer pays parts at 1.25x market for repair/upgrade-style work (§5.4)
      var customerPaysParts = job.type === 'repair' || job.type === 'upgrade' ||
        job.type === 'contract' || job.type === 'callback' ||
        (job.type === 'software' && job.subtype === 'os_install') ||
        (job.type === 'enthusiast' && job.subtype === 'overclock');
      if (customerPaysParts && job.partsUsed && job.partsUsed.length) {
        var partsCharge = 0;
        for (var i = 0; i < job.partsUsed.length; i++)
          partsCharge += job.partsUsed[i].price * C.PARTS_MARKUP;
        partsCharge = Engine.round2(partsCharge);
        payout = Engine.round2(payout + partsCharge);
        notes.push('Parts billed at 1.25x: ' + Engine.fmtMoney(partsCharge));
      }
      // §9.2: taste bonus when an installed part matches the customer's brand
      if (job.taste && job.partsUsed && job.partsUsed.length) {
        for (var tm = 0; tm < job.partsUsed.length; tm++) {
          if (tasteMatchesPart(job.taste, Engine.partById(job.partsUsed[tm].partId))) {
            tasteMatched = true; break;
          }
        }
        if (tasteMatched && payout > 0) {
          var before = payout;
          payout = Engine.round2(payout * (1 + job.taste.bonusPct / 100));
          score += C.TASTE_SCORE_BONUS;
          notes.push(job.taste.label + ' — delighted! +' + job.taste.bonusPct +
                     '% (' + Engine.fmtMoney(payout - before) + ')');
        }
      }
      if (isBuildJob(job) && job.build) {
        // Build pay = budget; bonuses for overdelivering (§5.5)
        var mp = job.build.minPerf || {};
        var v = Engine.Compat.validatePartList(job.build.parts, {
          requireFull: true, minPerfGpu: mp.gpu, year: year });
        var ratio = 99;
        if (mp.cpu > 0) ratio = Math.min(ratio, v.perf.cpu / mp.cpu);
        if (mp.gpu > 0) ratio = Math.min(ratio, v.perf.gpu / mp.gpu);
        if (mp.ramMB > 0) ratio = Math.min(ratio, v.perf.ramMB / mp.ramMB);
        if (mp.storageGB > 0) ratio = Math.min(ratio, v.perf.storageGB / mp.storageGB);
        if (ratio >= C.BUILD_PERF_BONUS_AT) { score += C.BUILD_PERF_BONUS; notes.push('Overdelivered on performance'); }
        var spentOnParts = 0;
        for (var b = 0; b < (job.partsUsed || []).length; b++)
          spentOnParts += job.partsUsed[b].price;
        if (job.build.budget > 0 && spentOnParts <= job.build.budget * C.BUILD_BUDGET_BONUS_AT) {
          score += C.BUILD_BUDGET_BONUS; notes.push('Came in well under budget');
        }
        Engine.pushNews(state, 'job', 'Custom build delivered',
          job.title + ' — ' + Engine.fmtMoney(payout));
        state.ledger.lifetime.buildsDelivered++;
      }
      if (payout > 0) {
        Engine.addCash(state, payout);
        Engine.ledgerAdd(state, 'revenue', payout);
      }
    }

    score = Engine.clamp(score, 0, 5);
    Engine.pushScore(state, score);
    state.reputation.jobsCompleted++;
    state.ledger.lifetime.jobsCompleted++;

    // Warranty callback roll (§5.5) — real customer work only
    if (job.type !== 'callback' && !drFailed) {
      var cb = speed.callbackBase * avgReliabilityFactor(job) *
               Engine.equipEffects(state).callbackMult;
      cb = Engine.clamp(cb, C.CALLBACK_MIN, C.CALLBACK_MAX);
      var fired = Engine.chance(cb);
      state.jobs.completedRecent.push({
        jobId: job.id, title: job.title, day: state.day,
        callbackRolledDay: fired ?
          state.day + Engine.randInt(C.CALLBACK_DELAY_MIN, C.CALLBACK_DELAY_MAX) : null,
        callbackChance: Engine.round2(cb * 1000) / 1000,
        fired: fired,
        origHours: job.hoursRequired
      });
    }

    job.status = 'done';
    job.result = { onTime: job.deadlineDay == null || state.day <= job.deadlineDay,
                   score: score, payout: payout, notes: notes,
                   tasteMatched: tasteMatched };
    removeFrom(state.jobs.active, job);
    return job.result;
  }
  Jobs.completeJob = completeJob;

  Jobs.abandonJob = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    removeFrom(state.jobs.active, job);
    if (job.type === 'refurb') {
      var value = machinePartsValue(state, job.machine);
      var scrap = Engine.round2(value * CFG().REFURB_SCRAP_RATIO);
      Engine.addCash(state, scrap);
      Engine.ledgerAdd(state, 'other', -scrap);
      Engine.pushNews(state, 'job', 'Scrapped: ' + job.machine.name,
        'Stripped for parts — recovered ' + Engine.fmtMoney(scrap) + '.');
      return { ok: true, scrapped: scrap };
    }
    Engine.pushScore(state, CFG().SCORE_ABANDON);
    state.reputation.jobsFailed++;
    state.ledger.lifetime.jobsFailed++;
    Engine.pushNews(state, 'job', 'Job abandoned: ' + job.title,
      job.customer.name + ' will not be recommending the shop.');
    return { ok: true };
  };

  // Deadline sweep + offer expiry (overnight step 4)
  Jobs.deadlineSweep = function (state, summary) {
    var C = CFG();
    var i, job;
    for (i = state.jobs.active.length - 1; i >= 0; i--) {
      job = state.jobs.active[i];
      if (job.deadlineDay != null && state.day > job.deadlineDay && job.status === 'active') {
        state.jobs.active.splice(i, 1);
        Engine.pushScore(state, C.SCORE_LATE);
        state.reputation.jobsFailed++;
        state.ledger.lifetime.jobsFailed++;
        job.status = 'done';
        job.result = { onTime: false, score: C.SCORE_LATE, payout: 0, notes: ['Missed the deadline'] };
        Engine.pushNews(state, 'job', 'Deadline missed: ' + job.title,
          job.customer.name + ' took their machine elsewhere.');
        summary.expired.push(job.title + ' (deadline missed)');
      }
    }
    for (i = state.jobs.offers.length - 1; i >= 0; i--) {
      job = state.jobs.offers[i];
      var tooOld = state.day - job.offeredDay > C.OFFER_EXPIRY_DAYS;
      var pastDeadline = job.deadlineDay != null && state.day > job.deadlineDay;
      if (tooOld || pastDeadline) state.jobs.offers.splice(i, 1); // silent expiry
    }
  };

  // Callback arrivals (overnight step 5)
  Jobs.processCallbacks = function (state, summary) {
    var C = CFG();
    var list = state.jobs.completedRecent;
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (e.fired && e.callbackRolledDay === state.day) {
        var job = {
          id: state.jobs.nextId++,
          type: 'callback', subtype: null, rush: false,
          title: 'Callback: ' + e.title,
          blurb: '"It is doing it again."',
          customer: { name: 'Returning customer', type: 'home' },
          pay: 0,
          offeredDay: state.day, deadlineDay: state.day + 3,
          difficulty: 2, speed: 'standard', status: 'active',
          hoursRequired: Math.max(0.5, Engine.round2((e.origHours || 2) * C.CALLBACK_HOURS_FRACTION)),
          hoursDone: 0,
          diagnosed: true, needsDiagnosis: false,
          fault: null, needs: [], build: null,
          units: 1, unitsDone: 0, machine: null, drTier: 0, crt: false,
          taste: null, result: null
        };
        state.jobs.active.push(job);      // auto-accepted, pay 0
        state.reputation.callbacks++;
        Engine.pushScore(state, C.CALLBACK_ARRIVAL_SCORE);  // rep ding on arrival
        Engine.pushNews(state, 'job', 'Warranty callback: ' + e.title,
          'The fix did not hold. Make it right for free.');
        summary.callbacks.push(e.title);
        e.fired = false; // consumed
      }
      if (state.day - e.day > C.COMPLETED_RECENT_KEEP_DAYS) list.splice(i, 1);
    }
  };

  // ------------------------------------------------------------------
  // As-is market & refurbs
  // ------------------------------------------------------------------
  function machinePartsValue(state, machine) {
    var v = 0;
    for (var i = 0; i < machine.partIds.length; i++)
      v += P().priceOf(machine.partIds[i], state) || 0;
    return Engine.round2(v);
  }
  Jobs.machinePartsValue = machinePartsValue;

  // §9.5: "486DX2-66 · 8 MB RAM · 340 MB HDD"
  function specSummaryFor(partIds) {
    var cpuName = null, ramMB = 0, storageGB = 0, storageSpeed = 0;
    for (var i = 0; i < partIds.length; i++) {
      var p = Engine.partById(partIds[i]);
      if (!p) continue;
      if (p.category === 'cpu' && !cpuName) cpuName = p.name;
      else if (p.category === 'ram') ramMB += (p.perf || {}).ramMB || 0;
      else if (p.category === 'storage') {
        storageGB += (p.perf || {}).storageGB || 0;
        storageSpeed = Math.max(storageSpeed, (p.perf || {}).speed || 0);
      }
    }
    var bits = [];
    if (cpuName) bits.push(cpuName);
    if (ramMB > 0) bits.push((ramMB >= 1024 ? Engine.round2(ramMB / 1024) + ' GB'
                                            : Engine.round2(ramMB) + ' MB') + ' RAM');
    if (storageGB > 0) {
      var sLabel = storageGB >= 1 ? Engine.round2(storageGB) + ' GB'
                                  : Math.round(storageGB * 1000) + ' MB';
      bits.push(sLabel + (storageSpeed >= 60 ? ' SSD' : ' HDD'));
    }
    return bits.join(' · ') || 'bare chassis';
  }
  Jobs.specSummaryFor = specSummaryFor;

  function generateMachine(state) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var mobos = purchasableByCategory(state, 'motherboard').filter(function (m) {
      return year - m.introYear <= C.ASIS_MAX_AGE_YEARS;
    });
    if (!mobos.length) mobos = purchasableByCategory(state, 'motherboard');
    var mobo = Engine.pick(mobos);
    if (!mobo) return null;
    var partIds = [mobo.id];
    var cats = ['cpu', 'ram', 'storage', 'psu', 'case'];
    for (var c = 0; c < cats.length; c++) {
      var options = purchasableByCategory(state, cats[c]).filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var part = Engine.pick(options);
      if (!part) return null; // can't assemble an era machine
      partIds.push(part.id);
    }
    if (!mobo.integratedVideo) {
      var gpus = purchasableByCategory(state, 'gpu').filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var gpu = Engine.pick(gpus);
      if (gpu) partIds.push(gpu.id);
    }
    // Fault: usually one dead part (never the board — replacements must fit it)
    var faultIdx = null;
    if (Engine.chance(0.75)) {
      var faultable = [];
      for (var i = 1; i < partIds.length; i++) {
        var fp = Engine.partById(partIds[i]);
        if (fp && ['cpu', 'ram', 'storage', 'gpu', 'psu'].indexOf(fp.category) !== -1)
          faultable.push(i);
      }
      if (faultable.length) faultIdx = Engine.pick(faultable);
    }
    var hints = {
      cpu: 'halts at POST', ram: 'beeping at boot', storage: 'drive grinds horribly',
      gpu: 'no video on boot', psu: 'completely dead', none: 'just needs some love'
    };
    var faultCat = faultIdx != null ? Engine.partById(partIds[faultIdx]).category : 'none';
    var adjective = Engine.pick((FLAVOR().machineAdjectives || ['dusty'])) || 'dusty';
    var machineYear = Engine.clamp(
      Engine.randInt(mobo.introYear, Math.min(year, (mobo.eolYear || year) + 2)),
      mobo.introYear, year);
    var value = machinePartsValue(state, { partIds: partIds });
    // Dealers price big iron closer to its real worth, and machines that
    // "just need some love" cost extra — flattens flip margins (§9.6).
    var span = C.ASIS_ASK_MAX - C.ASIS_ASK_MIN;
    var bl = Engine.baselineFor(year);
    var sizeT = Engine.clamp(value / Math.max(1, bl.buildBudget), 0, 1);
    var frac = C.ASIS_ASK_MIN + span * (0.35 * Engine.rand() + 0.65 * sizeT);
    if (faultIdx == null) frac = Math.min(C.ASIS_ASK_MAX, frac + 0.04);
    var ask = Engine.round2(value * frac);
    return {
      id: 'm' + (state.asIsNextId++),
      name: adjective + ' ' + mobo.name + ' machine',
      year: machineYear,
      askPrice: Math.max(10, ask),
      hint: hints[faultCat],
      partIds: partIds,
      faultPartIdx: faultIdx,
      listedDay: state.day,
      specSummary: specSummaryFor(partIds)   // §9.5
    };
  }

  // Overnight step 6 (§9.5): slow churn (~2wk shelf life), at most one new
  // arrival per night (~1 per 3 nights), hard cap on listings.
  Jobs.refreshAsIsMarket = function (state) {
    var C = CFG();
    for (var i = state.asIsMarket.length - 1; i >= 0; i--) {
      if (Engine.chance(C.ASIS_CHURN)) state.asIsMarket.splice(i, 1);
    }
    if (state.asIsMarket.length < C.ASIS_MAX && Engine.chance(C.ASIS_ARRIVAL_CHANCE)) {
      var m = generateMachine(state);
      if (m) state.asIsMarket.push(m);
    }
  };

  // Initial stock at newGame.
  Jobs.seedAsIsMarket = function (state) {
    var C = CFG();
    var n = Engine.randInt(C.ASIS_START_MIN, C.ASIS_START_MAX);
    var guard = 0;
    while (state.asIsMarket.length < n && guard++ < 10) {
      var m = generateMachine(state);
      if (!m) break;
      state.asIsMarket.push(m);
    }
  };

  Jobs.buyAsIsMachine = function (state, machineId) {
    var machine = null;
    for (var i = 0; i < state.asIsMarket.length; i++) {
      if (String(state.asIsMarket[i].id) === String(machineId)) { machine = state.asIsMarket[i]; break; }
    }
    if (!machine) return err('That machine is gone');
    if (state.cash < machine.askPrice)
      return err('Not enough cash (' + Engine.fmtMoney(machine.askPrice) + ' asked)');
    var run = supplyRun(state);
    if (!run.ok) return run;
    Engine.addCash(state, -machine.askPrice);
    Engine.ledgerAdd(state, 'partsCost', machine.askPrice);
    removeFrom(state.asIsMarket, machine);

    var C = CFG();
    var faultPart = machine.faultPartIdx != null ?
        Engine.partById(machine.partIds[machine.faultPartIdx]) : null;
    var job = {
      id: state.jobs.nextId++,
      type: 'refurb', subtype: null, rush: false,
      title: 'Refurb: ' + machine.name,
      blurb: '"' + machine.hint + '"',
      customer: { name: 'Shop project', type: 'home' },
      pay: null,
      offeredDay: state.day, deadlineDay: null,
      difficulty: faultPart ? 3 : 2,
      speed: 'standard', status: 'active',
      hoursRequired: Engine.randInt(C.REFURB_HOURS_MIN, C.REFURB_HOURS_MAX),
      hoursDone: 0,
      diagnosed: false, needsDiagnosis: true,
      fault: faultPart ?
        { desc: 'Dead ' + faultPart.name, partCategory: faultPart.category,
          laborHours: 2 } :
        { desc: 'Nothing broken — just filthy and misconfigured', partCategory: null,
          laborHours: 2 },
      needs: [],
      build: null, units: 1, unitsDone: 0,
      machine: { name: machine.name, year: machine.year, partIds: machine.partIds.slice(),
                 askPrice: machine.askPrice, boughtFor: machine.askPrice,
                 faultPartIdx: machine.faultPartIdx, condition: null,
                 faultRepaired: false,
                 specSummary: machine.specSummary || specSummaryFor(machine.partIds) },
      drTier: 0, crt: false, taste: null, result: null
    };
    state.jobs.active.push(job);
    return { ok: true, jobId: job.id };
  };

  // §9.5: component list for a refurb job's machine. The fault slot stays
  // "unknown" until diagnosed, then "faulty" until a replacement goes in.
  Jobs.getMachineParts = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job || job.type !== 'refurb' || !job.machine) return [];
    var out = [];
    for (var i = 0; i < job.machine.partIds.length; i++) {
      var part = Engine.partById(job.machine.partIds[i]);
      if (!part) continue;
      var status = 'ok';
      if (job.machine.faultPartIdx === i && !job.machine.faultRepaired) {
        status = job.diagnosed ? 'faulty' : 'unknown';
      }
      out.push({ partId: part.id, name: part.name, category: part.category,
                 status: status, value: P().priceOf(part, state) });
    }
    return out;
  };

  // §9.5: strip a refurb machine for parts. 1.5h (overtime rules apply); each
  // non-faulty part survives at 90% (97% with the ESD setup); the faulty part
  // is lost; the job is removed with no reputation effect.
  Jobs.stripRefurb = function (state, jobId) {
    var C = CFG();
    var job = Jobs.findActive(state, jobId);
    if (!job || job.type !== 'refurb' || !job.machine) return err('Not a refurb job');
    if (job.status === 'sold') return err('Already sold');
    var spent = Engine.spendHours(state, C.STRIP_HOURS);
    if (!spent.ok) return spent;
    var survival = Engine.equipmentOwned(state, 'esd-setup') ?
        C.STRIP_SURVIVAL_ESD : C.STRIP_SURVIVAL;
    var recovered = [], lost = [];
    for (var i = 0; i < job.machine.partIds.length; i++) {
      var pid = job.machine.partIds[i];
      var part = Engine.partById(pid);
      if (!part) continue;
      var isFaulty = job.machine.faultPartIdx === i && !job.machine.faultRepaired;
      if (isFaulty || !Engine.chance(survival)) {
        lost.push(pid);
        continue;
      }
      Engine.inventoryAdd(state, pid, 1, 0);   // salvage carries no cost basis
      recovered.push(pid);
    }
    removeFrom(state.jobs.active, job);
    Engine.pushNews(state, 'job', 'Stripped for parts: ' + job.machine.name,
      recovered.length + ' part' + (recovered.length === 1 ? '' : 's') +
      ' recovered into inventory' +
      (lost.length ? ', ' + lost.length + ' lost' : '') + '.');
    return { ok: true, recovered: recovered, lost: lost, hoursSpent: C.STRIP_HOURS };
  };

  function refurbEstimate(state, job) {
    var C = CFG();
    var cond = (job.machine && job.machine.condition != null) ? job.machine.condition : 1.0;
    var year = Engine.currentYear(state);
    return Engine.round2(machinePartsValue(state, job.machine) * C.REFURB_SALE_RATIO * cond +
                         Engine.laborRate(year) * C.REFURB_PREMIUM_HOURS);
  }

  Jobs.appraiseRefurb = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job || job.type !== 'refurb' || !job.machine) return { estimate: 0 };
    return { estimate: refurbEstimate(state, job) };
  };

  Jobs.sellRefurb = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job || job.type !== 'refurb') return err('Not a refurb job');
    if (job.status !== 'done') return err('Fix it up before selling');
    var price = refurbEstimate(state, job);
    Engine.addCash(state, price);
    Engine.ledgerAdd(state, 'revenue', price);
    state.ledger.lifetime.refurbsSold++;
    job.status = 'sold';
    removeFrom(state.jobs.active, job);
    Engine.pushNews(state, 'money', 'Refurb sold: ' + job.machine.name,
      'Out the door for ' + Engine.fmtMoney(price) + ' (paid ' +
      Engine.fmtMoney(job.machine.boughtFor) + ').');
    return { ok: true, price: price };
  };
})(typeof window !== 'undefined' ? window : globalThis);
