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
  // §11.2 ramp-down: offers/night = clamp(2 + tierBonus + floor(prestige/2)
  //   + clamp(round((rating-3)/1.5), -1, 1) + eventAdj, 1, tierCap);
  // a shop drowning in >= 10 pending offers sees walk-ins halved.
  Jobs.generateOffers = function (state, summary) {
    var C = CFG();
    var tier = Engine.tierInfo(state);
    var rep = state.reputation;
    var volumeMult = 1;
    for (var i = 0; i < state.market.activeEvents.length; i++)
      volumeMult *= state.market.activeEvents[i].jobVolumeMult || 1;
    var eventAdj = Engine.clamp(Math.round((volumeMult - 1) * 3), -2, 3);
    var cap = C.OFFER_TIER_CAPS[
      Engine.clamp(state.shop.tier, 0, C.OFFER_TIER_CAPS.length - 1)];
    var count = Engine.clamp(
      C.OFFER_BASE + (tier.offerBonus || 0) + Math.floor(rep.prestige / 2) +
      Engine.clamp(Math.round((rep.rating - 3) / 1.5), -1, 1) + eventAdj,
      1, cap);
    if (state.jobs.offers.length >= C.OFFER_BUSY_THRESHOLD)
      count = Math.floor(count / 2);   // walk-ins see a busy shop
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
  // §11.6: steps whose labels look like unattended runs become "wait" steps
  var WAIT_LABEL_RE = /burn.?in|scan|low.?level format|imag(e|ing)|copy|clone|download|updates|rebuild/i;
  function classifyStepKind(tmplStep, label) {
    if (tmplStep && tmplStep.wait) return 'wait';
    return WAIT_LABEL_RE.test(String(label || '')) ? 'wait' : 'labor';
  }
  Jobs.classifyStepKind = classifyStepKind;
  var DIAG_INTAKE_RE = /open|ground|intake/i;   // §11.3 dedupe on append

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
                     kind: classifyStepKind(s, s.label), running: false,   // §11.6
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
    // §11.3: diagnosis merges into the checklist. Undiagnosed jobs start with a
    // diagnose phase; the repair steps hide in pendingSteps until the bench-
    // diagnosis step completes (spoiler-free single task list).
    job.pendingSteps = [];
    if (job.needsDiagnosis && !job.diagnosed) {
      var pending = job.steps;
      if (pending.length && DIAG_INTAKE_RE.test(pending[0].label) &&
          pending[0].needIndex == null) {
        pending = pending.slice(1);   // the diag phase already opens the case
      }
      job.pendingSteps = pending;
      var equip = Engine.equipEffects(state);
      var benchH = Math.max(0.25, Engine.round2(1 * equip.diagHoursMult));
      job.steps = [
        { id: 'd1', label: 'Intake & symptom interview', hours: 0.25,
          done: false, progress: 0, needIndex: null, kind: 'labor', running: false },
        { id: 'd2', label: 'Bench diagnosis', hours: benchH,
          done: false, progress: 0, needIndex: null, kind: 'labor', running: false,
          diag: true }
      ];
      job.stepIndex = 0;
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
    var total = 0, done = 0, i;
    for (i = 0; i < job.steps.length; i++) {
      total += job.steps[i].hours;
      done += job.steps[i].hours * (job.steps[i].progress || 0);
    }
    // §11.3: repair steps hidden behind the diagnose phase still count toward
    // the job's total (pricing & the progress-bar denominator stay honest).
    var pending = job.pendingSteps || [];
    for (i = 0; i < pending.length; i++) total += pending[i].hours;
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
        done: false, progress: 0, needIndex: null, kind: 'labor', running: false },
      { id: 's2', label: installs ? 'Swap in the replacement part' : 'Do the bench work',
        hours: b, done: false, progress: 0, needIndex: null, kind: 'labor',
        running: false, install: true },
      { id: 's3', label: 'Test & button up', hours: c,
        done: false, progress: 0, needIndex: null, kind: 'labor', running: false }
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

  // ------------------------------------------------------------------
  // §11.4 OS families, derived from part names/brands
  // ------------------------------------------------------------------
  var OS_FAMILY_LABELS = {
    DOS: 'DOS', WIN3X: 'Windows 3.x', WIN9X: 'Windows 9x',
    WINNT: 'NT-class Windows', WINVISTA7: 'Windows Vista/7',
    WINMOD: 'modern Windows', OS2: 'OS/2', MACOS: 'Mac OS', LINUX: 'Linux',
    OTHER: 'compatible OS'
  };
  function osFamilyOf(part) {
    if (!part) return 'OTHER';
    var n = String(part.name || '').toLowerCase();
    if (/os\/?2/.test(n)) return 'OS2';
    if (/mac ?os|macintosh|system [67]\b/.test(n) || part.brand === 'Apple') return 'MACOS';
    if (/linux|ubuntu|red ?hat|debian|suse|mandrake|fedora|mint/.test(n)) return 'LINUX';
    if (/windows (nt|2000|xp)|winnt/.test(n)) return 'WINNT';
    if (/windows (vista|7)(\D|$)/.test(n)) return 'WINVISTA7';
    if (/windows (8|10|11)(\D|$)/.test(n)) return 'WINMOD';
    if (/windows (3|for workgroups)/.test(n) || /win ?3/.test(n)) return 'WIN3X';
    if (/windows (9[58]|me)(\D|$)/.test(n)) return 'WIN9X';
    if (/\bdos\b|dr-dos|ms-dos|pc dos|freedos/.test(n)) return 'DOS';
    return 'OTHER';
  }
  Jobs.osFamilyOf = osFamilyOf;
  Jobs.osFamilyLabel = function (fam) { return OS_FAMILY_LABELS[fam] || fam; };

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

  // ------------------------------------------------------------------
  // §11.1 witness build: prove a build request is satisfiable within budget
  // before it is ever offered. Greedy cheapest parts meeting compat + minPerf
  // + minStyle + the PSU rule. Returns { cost, partIds } or null.
  // ------------------------------------------------------------------
  function witnessBuild(state, build) {
    var mp = build.minPerf || {};
    var minStyle = build.minStyle || 0;
    var year = Engine.currentYear(state);
    function price(p) { return P().priceOf(p, state, { buy: true }); }
    function byPrice(a, b) { return price(a) - price(b); }
    function byStyleThenPrice(a, b) {
      return ((b.style || 0) - (a.style || 0)) || (price(a) - price(b));
    }
    var mobos = purchasableByCategory(state, 'motherboard').sort(byPrice).slice(0, 12);
    for (var mi = 0; mi < mobos.length; mi++) {
      var mobo = mobos[mi];
      var pick = function (cat, pred, sorter) {
        var cands = purchasableByCategory(state, cat).filter(function (p) {
          return Engine.Compat.fits(p, mobo).fits && (!pred || pred(p));
        });
        cands.sort(sorter || byPrice);
        return cands[0] || null;
      };
      var cpu = pick('cpu', function (p) { return (p.perf || {}).cpu >= (mp.cpu || 0); });
      var ram = pick('ram', function (p) { return (p.perf || {}).ramMB >= (mp.ramMB || 0); });
      var sto = pick('storage', function (p) { return (p.perf || {}).storageGB >= (mp.storageGB || 0); });
      var gpu = null;
      if (!mobo.integratedVideo || (mp.gpu || 0) > CFG().INTEGRATED_GPU_PERF) {
        gpu = pick('gpu', function (p) { return (p.perf || {}).gpu >= (mp.gpu || 0); });
        if (!gpu && !mobo.integratedVideo) continue;
      }
      var kase = pick('case', null, minStyle > 0 ? byStyleThenPrice : byPrice);
      var os = pick('os');
      var cool = minStyle > 0 ? pick('cooling', null, byStyleThenPrice) : null;
      if (!cpu || !ram || !sto || !kase || !os) continue;
      var draw = 0;
      [mobo, cpu, ram, sto, gpu, kase, cool].forEach(function (p) {
        if (p) draw += p.powerDraw || 0;
      });
      var psu = pick('psu', function (p) {
        return (p.watts || 0) >= Math.ceil(draw * CFG().PSU_HEADROOM);
      });
      if (!psu) continue;
      var ids = [mobo, cpu, ram, sto, gpu, psu, kase, cool, os]
        .filter(Boolean).map(function (p) { return p.id; });
      var v = Engine.Compat.validatePartList(ids, {
        requireFull: true, minPerfGpu: mp.gpu, year: year });
      if (!v.valid) continue;
      if ((v.perf.cpu || 0) < (mp.cpu || 0) || (v.perf.gpu || 0) < (mp.gpu || 0) ||
          (v.perf.ramMB || 0) < (mp.ramMB || 0) ||
          (v.perf.storageGB || 0) < (mp.storageGB || 0)) continue;
      if (v.style < minStyle) continue;
      var cost = 0;
      ids.forEach(function (id) { cost += P().priceOf(id, state, { buy: true }); });
      return { cost: Engine.round2(cost), partIds: ids };
    }
    return null;
  }
  Jobs.witnessBuild = witnessBuild;
  // Apply the §11.1 guarantee: null = skip the offer; else budget may be raised.
  function ensureBuildFeasible(state, job) {
    var w = witnessBuild(state, job.build);
    if (!w) return false;
    if (w.cost > job.build.budget * 0.92) {
      job.build.budget = Math.ceil((w.cost * 1.25) / 10) * 10;
      job.pay = job.build.budget;
    }
    return true;
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
    add('peripheral', null, 3);   // §10.5: item picked first, subtype = its kind
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
      difficulty: 2,              // derived after assembly (§10.2)
      speed: 'standard',
      status: 'offer',
      hoursRequired: 1, hoursDone: 0,
      steps: [], stepIndex: 0,    // §10.1
      diagnosed: true, needsDiagnosis: false,
      fault: null,
      needs: [],
      build: null,
      units: 1, unitsDone: 0,
      machine: null,
      peripheral: null,           // §10.5 {name, kind}
      osRequest: null,            // §11.4 (UI contract: string label)
      drTier: 0,
      crt: false,
      result: null
    };
    var bl = Engine.baselineFor(year);

    switch (choice.type) {
      case 'repair': {
        // §10.5 fault-first: fault template + machine first, copy derived from it
        var cat = pickFaultCategory(faultCats);
        var tmpl = Engine.pick((F.faults || {})[cat] || [{ desc: 'Mystery gremlins', laborHours: 2 }]);
        job.fault = {
          desc: tmpl.desc,
          partCategory: cat === 'laborOnly' ? null : cat,
          laborHours: Engine.clamp(Math.round(tmpl.laborHours || 2), 1, 3)
        };
        job.hoursRequired = job.fault.laborHours;   // fallback-step sizing only
        job.needsDiagnosis = true; job.diagnosed = false;
        job.machine = customerMachineFor(state, job.fault.partCategory);   // §10.4
        var repairBox = (job.machine && job.machine.name) || machineFlavor(state, year);
        job.title = 'Repair: ' + repairBox + ' — ' + tmpl.desc;
        if (Array.isArray(tmpl.complaints) && tmpl.complaints.length)
          job.blurbOverride = Engine.pick(tmpl.complaints);   // §10.5 complaint copy
        break;
      }
      case 'upgrade': {
        // §9.3: upgrades carry a minimum spec chosen vs the year baseline,
        // snapped to a real purchasable part so the job is always satisfiable.
        // §10.4: the customer's machine rides along; replacements must fit it.
        var uc = Engine.pick(upgCats);
        var upgKey = { ram: 'ramMB', storage: 'storageGB', gpu: 'gpu' }[uc];
        var upgName = { ram: 'RAM upgrade', storage: 'Storage upgrade',
                        gpu: 'Graphics upgrade' }[uc];
        job.machine = customerMachineFor(state, uc);
        var fitTags = null;
        if (job.machine) {
          var umobo = null;
          for (var um = 0; um < job.machine.partIds.length; um++) {
            var ump = Engine.partById(job.machine.partIds[um]);
            if (ump && ump.category === 'motherboard') umobo = ump;
          }
          var uprefix = Engine.Compat.namespaceForCategory(uc);
          if (umobo && uprefix) {
            var utags = Engine.Compat.tagsInNamespace(umobo, uprefix);
            if (utags.length) fitTags = utags;
          }
        }
        var upgFits = function (p) {
          if (!fitTags) return true;
          var tags = p.platformTags || [];
          for (var t = 0; t < fitTags.length; t++)
            if (tags.indexOf(fitTags[t]) !== -1) return true;
          return false;
        };
        var upgCands = purchasableByCategory(state, uc).filter(upgFits);
        if (!upgCands.length) {   // machine too exotic — drop the fit constraint
          fitTags = null;
          upgCands = purchasableByCategory(state, uc);
        }
        var wanted = (bl[upgKey] || 0) * Engine.pick([0.5, 0.75, 1.0]);
        var perfs = upgCands.map(function (p) {
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
        job.needs = [{ category: uc, anyOfTags: fitTags, minPerf: minPerf, qty: 1,
                       filledPartIds: [], label: label,
                       originalPartId: (job.machine && job.machine.faultPartIdx != null) ?
                         job.machine.partIds[job.machine.faultPartIdx] : null }];
        job.hoursRequired = 1;   // fallback-step sizing only
        job.title = 'Upgrade: ' + upgName.toLowerCase() + ' for a ' +
          ((job.machine && job.machine.name) || machineFlavor(state, year));
        break;
      }
      case 'software': {
        if (choice.subtype === 'virus') {
          job.hoursRequired = 2;
          job.title = 'Software: virus cleanup';
        } else {
          // §11.4: the customer asks for a family (60%), an exact product (30%),
          // or your recommendation (10%). Always satisfiable: the rolled target
          // part is itself purchasable today.
          var osParts = purchasableByCategory(state, 'os');
          var osTarget = Engine.pick(osParts);
          var osNeed = { category: 'os', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Operating system',
                         osExactId: null, osFamily: null };
          var osRoll = Engine.rand();
          if (osTarget && osRoll < 0.6) {
            osNeed.osFamily = osFamilyOf(osTarget);
            osNeed.label = 'Install ' + osTarget.name + ' — any ' +
                           Jobs.osFamilyLabel(osNeed.osFamily) + ' acceptable';
          } else if (osTarget && osRoll < 0.9) {
            osNeed.osExactId = osTarget.id;
            osNeed.label = 'Install ' + osTarget.name + ' — exactly this one';
          } else {
            osNeed.label = 'Install an operating system — your recommendation';
          }
          job.needs = [osNeed];
          job.osRequest = osNeed.label;   // §11.4 UI contract
          job.hoursRequired = 1.5;   // fallback-step sizing only
          job.title = 'Software: ' + (osNeed.osExactId || osNeed.osFamily ?
            osNeed.label.replace(/^Install /, '').replace(/ — .*$/, '') + ' install'
            : 'fresh OS install');
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
        // §10.5 fault-first: pick the concrete item, derive kind/fault/copy from it
        var items = (F.peripheralItems || []).filter(function (it) {
          if (year < (it.minYear || 0) || year > (it.maxYear || 9999)) return false;
          return peripheralKindOf(it) !== 'crt' || year <= 2005;
        });
        var item = Engine.pick(items) || { name: 'printer', kind: 'printer' };
        var kind = peripheralKindOf(item);
        job.subtype = kind;
        job.crt = kind === 'crt';
        job.peripheral = { name: item.name, kind: kind };
        var faultDesc = (Array.isArray(item.faultDescs) && item.faultDescs.length) ?
          Engine.pick(item.faultDescs) : 'Worn out and misbehaving inside';
        job.fault = { desc: faultDesc, partCategory: null, laborHours: 2 };
        job.needsDiagnosis = true; job.diagnosed = false;   // fault revealed on diagnosis
        job.hoursRequired = 1.5;   // fallback-step sizing only
        job.title = 'Peripheral: ' + item.name + ' repair';
        if (Array.isArray(item.complaints) && item.complaints.length)
          job.blurbOverride = Engine.pick(item.complaints);
        break;
      }
      case 'data_recovery': {
        job.drTier = requiredDrTier(year);
        job.hoursRequired = 2.5;   // fallback-step sizing only
        job.title = 'Data recovery: dying drive (rig tier ' + job.drTier + ')';
        break;
      }
      case 'build': {
        var budget = Math.round(bl.buildBudget *
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
        if (!ensureBuildFeasible(state, job)) return null;   // §11.1: unbuildable
        job.hoursRequired = C.BUILD_HOURS +
          (job.build.budget > bl.buildBudget * 1.15 ? C.BUILD_HOURS_PREMIUM_EXTRA : 0);
        job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX);
        job.title = 'Custom build: ' + useCase + ' PC (' +
          Engine.fmtMoney(job.build.budget) + ' budget)';
        break;
      }
      case 'enthusiast': {
        if (choice.subtype === 'overclock') {
          job.hoursRequired = 2;   // fallback-step sizing only
          job.needs = [{ category: 'cooling', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Beefier cooling' }];
          job.title = 'Enthusiast: overclock & cooling job';
        } else { // aesthetic: a build with a style bar
          var abudget = Math.round(bl.buildBudget * Engine.uniform(1.0, 1.5));
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
          if (!ensureBuildFeasible(state, job)) return null;   // §11.1
          job.hoursRequired = C.BUILD_HOURS + 1;
          job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX);
          job.title = 'Enthusiast: showpiece build (' +
            Engine.fmtMoney(job.build.budget) + ')';
        }
        break;
      }
      case 'contract': {
        state.lastContractDay = state.day;
        job.units = Engine.randInt(C.CONTRACT_UNITS_MIN, C.CONTRACT_UNITS_MAX);
        job.hoursRequired = 1.5;   // per-unit fallback-step sizing; x units in assembly
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

    // §10.1: assemble the step checklist (sets hoursRequired deterministically),
    // then derive difficulty (§10.2) and price from the real time on the bench.
    assembleSteps(state, job);
    job.difficulty = deriveDifficulty(state, job);
    if (!isBuildJob(job) && job.type !== 'contract') {
      job.pay = Math.round(basePay(state, job.type, job.hoursRequired, job.difficulty));
    } else if (job.type === 'contract') {
      job.pay = Math.round(basePay(state, 'contract', job.hoursRequired, job.difficulty));
    } else {
      job.pay = Math.round(job.pay);   // builds: budget, whole dollars (§10.2)
    }

    // §9.2: customer type first (era + affinity gated), then a fitting blurb —
    // §10.5: subject-derived complaint copy wins over generic blurbs.
    job.customer = customerFor(state, year, affinityKeyFor(job));
    job.blurb = job.blurbOverride || blurbFor(job.type, job.customer.type);
    delete job.blurbOverride;
    job.taste = maybeTaste(state, job);

    // Rush jobs: repair/software/upgrade, 8%: due today, pay x1.8 (§5.4)
    if ((job.type === 'repair' || job.type === 'software' || job.type === 'upgrade') &&
        Engine.chance(C.RUSH_CHANCE)) {
      job.rush = true;
      job.deadlineDay = job.offeredDay;
      job.pay = Math.round(job.pay * C.RUSH_PAY_MULT);
      job.title = 'RUSH — ' + job.title;
    }
    // §10.6: deadlines never land on Sunday
    if (job.deadlineDay != null) job.deadlineDay = shiftOffSunday(state, job.deadlineDay);
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
  // Diagnosis (§11.3: merged into the step checklist)
  // ------------------------------------------------------------------
  // Old diagnoseJob effects, fired when the bench-diagnosis STEP completes:
  // reveal the fault, create the needs, append the hidden repair steps.
  function performDiagnosis(state, job) {
    if (job.diagnosed) return;
    job.diagnosed = true;
    var fault = job.fault || { desc: 'No fault found', partCategory: null, laborHours: 1 };
    if (fault.partCategory) {
      var need = { category: fault.partCategory, anyOfTags: null, minPerf: null,
                   qty: 1, filledPartIds: [], label: 'Replacement ' + fault.partCategory,
                   originalPartId: null };
      // §10.4: replacements must fit the machine's motherboard (refurb & repair)
      if (job.machine) {
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
        if (job.machine.faultPartIdx != null)
          need.originalPartId = job.machine.partIds[job.machine.faultPartIdx];
      }
      job.needs = [need];
    }
    // Append the repair phase (dedupe already happened at assembly, §11.3)
    if (job.pendingSteps && job.pendingSteps.length) {
      job.steps = job.steps.concat(job.pendingSteps);
      job.pendingSteps = [];
      for (var r = 0; r < job.steps.length; r++) job.steps[r].id = 's' + (r + 1);
    }
    recomputeHours(job);
  }

  /* §11.3: diagnoseJob is now an alias for "work the diagnose step(s)".
   * Keeps the old return shape: { ok, hoursSpent, fault: {desc, partCategory} }. */
  Jobs.diagnoseJob = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    if (!job.needsDiagnosis) return err('Nothing to diagnose');
    if (job.diagnosed) return err('Already diagnosed');
    Jobs.ensureSteps(state, job);
    var m = effectiveMult(state, job);
    var needStd = 0;
    for (var i = job.stepIndex; i < job.steps.length; i++) {
      var st = job.steps[i];
      needStd += st.hours * (1 - (st.progress || 0));
      if (st.diag) break;
    }
    var effNeeded = Math.max(0.5, Math.ceil(needStd * m * 2 - 1e-9) / 2);
    var r = Jobs.workJob(state, jobId, effNeeded);
    if (!r.ok) return r;
    if (!job.diagnosed)
      return err('Ran out of steam mid-diagnosis — finish it tomorrow');
    var fault = job.fault || { desc: 'No fault found', partCategory: null };
    return { ok: true, hoursSpent: r.hoursSpent,
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
    // §11.4: OS request enforcement, readable like minPerf
    if (need.osExactId && part.id !== need.osExactId) {
      var exact = Engine.partById(need.osExactId);
      return part.name + ' is not what the customer asked for — they want ' +
             (exact ? exact.name : 'a specific OS') + ' specifically';
    }
    if (need.osFamily && osFamilyOf(part) !== need.osFamily) {
      return part.name + ' is the wrong flavor — the customer wants any ' +
             Jobs.osFamilyLabel(need.osFamily);
    }
    return null;
  }
  function meetsMinPerf(part, need) {
    if (need.minPerf) {
      var keys = Object.keys(need.minPerf);
      for (var k = 0; k < keys.length; k++) {
        if (((part.perf || {})[keys[k]] || 0) < need.minPerf[keys[k]]) return false;
      }
    }
    if (need.osExactId && part.id !== need.osExactId) return false;   // §11.4
    if (need.osFamily && osFamilyOf(part) !== need.osFamily) return false;
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
    var C = CFG();
    var year = Engine.currentYear(state);
    var out = [];
    for (var i = 0; i < job.needs.length; i++) {
      var need = job.needs[i];
      // §10.4: the original part being replaced, and its overspend threshold
      var orig = need.originalPartId ? Engine.partById(need.originalPartId) : null;
      var origVal = orig ? P().priceOf(orig, state) : 0;
      var threshold = orig ?
        Math.max(C.OVERSPEND_MULT * origVal, origVal + Engine.laborRate(year)) : Infinity;
      var replaces = orig ? { name: orig.name, value: origVal } : null;
      var options = [];
      var cands = purchasableByCategory(state, need.category);
      for (var c = 0; c < cands.length; c++) {
        var part = cands[c];
        if (!candidateListed(part, need, state)) continue;
        var inv = Engine.inventoryEntry(state, part.id);
        var marketVal = P().priceOf(part, state);
        var opt = {
          partId: part.id, name: part.name,
          source: (inv && inv.qty > 0) ? 'inventory' : 'market',
          price: (inv && inv.qty > 0) ? 0 : P().priceOf(part, state, { buy: true }),
          inStock: inv ? inv.qty : 0,
          meets: meetsMinPerf(part, need),                // §9.3
          tasteMatch: tasteMatchesPart(job.taste, part),  // §9.2
          replaces: replaces,                             // §10.4
          overspend: replaces ? marketVal > threshold : false
        };
        options.push(opt);
      }
      options.sort(function (a, b) { return a.price - b.price; });
      // §10.3: what's currently assigned (stock vs ordered), unassignable until
      // the install step completes.
      var assigned = [];
      var used = job.partsUsed || [];
      for (var a = 0; a < used.length; a++) {
        if (used[a].needIndex !== i) continue;
        var ap = Engine.partById(used[a].partId);
        assigned.push({ partId: used[a].partId,
                        name: ap ? ap.name : used[a].partId,
                        source: used[a].fromStock ? 'stock' : 'ordered' });
      }
      out.push({ index: i, label: need.label, category: need.category,
                 qty: need.qty, filled: need.filledPartIds.length,
                 assigned: assigned, replaces: replaces, options: options });
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
    Jobs.tickWaits(state, h, null);   // §11.6: time passes for running waits
    return { ok: true, hours: h };
  }

  // Find the step that installs a given need (null if unmapped).
  function installStepFor(job, needIndex) {
    for (var i = 0; i < (job.steps || []).length; i++)
      if (job.steps[i].needIndex === needIndex) return job.steps[i];
    return null;
  }

  /* §10.3: ASSIGN a part to a need — reserves it from stock or orders it from
   * the market (cash out now). The physical install happens when the matching
   * step completes. installPart remains as a deprecated alias. */
  Jobs.assignPart = function (state, jobId, needIndex, partId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    Jobs.ensureSteps(state, job);
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
      var fromStock = !!(inv && inv.qty > 0);
      var stockCost = fromStock ? inv.avgCost : 0;
      var paid = 0;
      if (fromStock) {
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
        paid = buyPrice;
      }
      // ESD / handling mishap while prepping: part destroyed, must re-source (§5.5)
      if (Engine.chance(mishapP)) {
        mishaps++;
        if (state.shop.insurance) {
          var refund = Engine.round2(chargePrice * C.INSURANCE_COVER);
          Engine.addCash(state, refund);
          Engine.ledgerAdd(state, 'other', -refund);
        }
        Engine.pushNews(state, 'mishap', 'Static zap on the bench',
          'A ' + part.name + ' died on the bench' +
          (state.shop.insurance ? ' — insurance covered most of it.' : '.'));
        continue;
      }
      need.filledPartIds.push(part.id);
      job.partsUsed = job.partsUsed || [];
      job.partsUsed.push({ partId: part.id, price: chargePrice, cost: paid,
                           fromStock: fromStock, stockCost: stockCost,
                           needIndex: idx });
      filledNow++;
      // §10.1: premium parts add bench time to their install step
      if (part.tier === 'premium') nudgeStep(job, idx, C.PREMIUM_STEP_NUDGE);
    }
    return { ok: true, cost: spent, filledNow: filledNow,
             mishap: mishaps > 0, mishaps: mishaps,
             filled: need.filledPartIds.length, qty: need.qty };
  };
  Jobs.installPart = Jobs.assignPart;   // deprecated alias (one release, §10.3)

  /* §10.3: UNASSIGN a part — returns it to inventory (ordered parts too; you
   * own them). Allowed until the step that installs it has completed. */
  Jobs.unassignPart = function (state, jobId, needIndex, partId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    var idx = Number(needIndex);
    var need = job.needs[idx];
    if (!need) return err('No such part slot');
    if (!need.filledPartIds.length) return err('Nothing assigned to that slot');
    var st = installStepFor(job, idx);
    if (st && st.done) return err('Already installed — too late to unassign');
    var pid = partId != null ? String(partId) :
              need.filledPartIds[need.filledPartIds.length - 1];
    var at = need.filledPartIds.lastIndexOf(pid);
    if (at === -1) return err('That part is not assigned to this slot');
    need.filledPartIds.splice(at, 1);
    // Remove the matching reservation record & work out the inventory basis
    var basis = 0, part = Engine.partById(pid);
    var used = job.partsUsed || [];
    for (var i = used.length - 1; i >= 0; i--) {
      var e = used[i];
      if (e.partId === pid && (e.needIndex === idx || e.needIndex == null)) {
        basis = e.fromStock ? (e.stockCost || 0) :
                (e.cost != null ? e.cost : (e.price || 0));
        used.splice(i, 1);
        break;
      }
    }
    Engine.inventoryAdd(state, pid, 1, basis);
    if (part && part.tier === 'premium') nudgeStep(job, idx, -CFG().PREMIUM_STEP_NUDGE);
    return { ok: true, returned: pid, filled: need.filledPartIds.length, qty: need.qty };
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
    // §11.3: diagnosis no longer blocks — it IS the first steps of the list.
    if (isBuildJob(job) && job.build && !job.build.committed)
      return 'Configure and commit the build first';
    // §10.3: unassigned needs block the install STEP (see workableStdHours).
    return null;
  }

  function effectiveMult(state, job) {
    var C = CFG();
    var m = C.SPEED[job.speed] ? C.SPEED[job.speed].hoursMult : 1;
    if (job.type === 'software')
      m *= Engine.equipEffects(state).softwareHoursMult;
    m *= Engine.staffTimeMult(state, job.type);   // §10.7
    // Soft workstation cap: beyond slots on the same day => +50% hours (§2.5)
    var slots = Engine.tierInfo(state).workstationSlots;
    var worked = state.workedToday || [];
    if (worked.indexOf(job.id) === -1 && worked.length >= slots)
      m *= C.SOFT_CAP_HOURS_MULT;
    return m;
  }

  // §10.1/§10.3/§11.6: standard-speed hours workable from the current step
  // until an unassigned install step ("assign") or a wait step ("wait").
  function workableStdHours(job) {
    var total = 0, barrier = null;
    for (var i = job.stepIndex; i < job.steps.length; i++) {
      var st = job.steps[i];
      if (st.kind === 'wait') { barrier = 'wait'; break; }
      if (st.needIndex != null) {
        var nd = job.needs[st.needIndex];
        if (!nd || nd.filledPartIds.length < nd.qty) { barrier = 'assign'; break; }
      }
      total += st.hours * (1 - (st.progress || 0));
    }
    return { hours: total, barrier: barrier };
  }

  // Complete one step's bookkeeping (install/diagnosis hooks + advance).
  function finishStep(state, job, st) {
    st.progress = 1; st.done = true; st.running = false;
    if (st.needIndex != null) performInstall(state, job, st.needIndex);
    job.stepIndex++;
    if (st.diag) performDiagnosis(state, job);   // may append repair steps
  }

  // Consume std-hours across the checklist; installs fire as steps complete.
  function advanceSteps(state, job, stdHours) {
    var left = stdHours + 1e-9;
    while (left > 0 && job.stepIndex < job.steps.length) {
      var st = job.steps[job.stepIndex];
      if (st.kind === 'wait') break;   // §11.6: waits advance in parallel only
      if (st.needIndex != null) {
        var nd = job.needs[st.needIndex];
        if (!nd || nd.filledPartIds.length < nd.qty) break;   // blocked install
      }
      var rem = st.hours * (1 - (st.progress || 0));
      if (left >= rem - 1e-9) {
        left -= rem;
        finishStep(state, job, st);
      } else {
        st.progress = Math.min(1, (st.hours * (st.progress || 0) + left) / st.hours);
        st.progress = Math.round(st.progress * 1000) / 1000;
        left = 0;
      }
    }
    recomputeHours(job);
  }

  function jobFinished(job) {
    return job.stepIndex >= job.steps.length &&
           !(job.pendingSteps && job.pendingSteps.length);
  }

  // §11.6: running wait steps progress 1:1 with hours spent on ANYTHING else
  // (and can complete their job from here — e.g. a burn-in ends mid-afternoon).
  Jobs.tickWaits = function (state, hours, excludeJobId) {
    if (!(hours > 0)) return [];
    var advanced = [];
    var active = state.jobs.active.slice();
    for (var i = 0; i < active.length; i++) {
      var j = active[i];
      if (j.id === excludeJobId) continue;
      if (!j.steps || j.stepIndex >= j.steps.length) continue;
      var st = j.steps[j.stepIndex];
      if (st.kind !== 'wait' || !st.running) continue;
      st.progress = Math.min(1, (st.progress || 0) + hours / st.hours);
      st.progress = Math.round(st.progress * 1000) / 1000;
      advanced.push(j.title + ' — ' + st.label);
      if (st.progress >= 1 - 1e-9) {
        finishStep(state, j, st);
        recomputeHours(j);
        if (jobFinished(j) && j.status === 'active') completeJob(state, j);
      } else {
        recomputeHours(j);
      }
    }
    return advanced;
  };

  // §11.6: running waits complete free overnight (before the deadline sweep).
  Jobs.completeWaitsOvernight = function (state) {
    var active = state.jobs.active.slice();
    for (var i = 0; i < active.length; i++) {
      var j = active[i];
      if (!j.steps) continue;
      while (j.stepIndex < j.steps.length) {
        var st = j.steps[j.stepIndex];
        if (st.kind !== 'wait' || !st.running) break;
        finishStep(state, j, st);
      }
      recomputeHours(j);
      if (jobFinished(j) && j.status === 'active') completeJob(state, j);
    }
  };

  // §10.3: the actual install — swap the replacement into the machine.
  function performInstall(state, job, needIndex) {
    var need = job.needs[needIndex];
    if (!need || !need.filledPartIds.length) return;
    if (job.machine && job.machine.faultPartIdx != null && !job.machine.faultRepaired) {
      job.machine.partIds[job.machine.faultPartIdx] = need.filledPartIds[0];
      job.machine.faultRepaired = true;
      job.machine.specSummary = specSummaryFor(job.machine.partIds);
    }
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

    Jobs.ensureSteps(state, job);   // migrated saves get a checklist lazily
    var m = effectiveMult(state, job);
    // §10.1/§10.3/§11.6: work runs the checklist; barriers are unassigned
    // install steps ("assign") and wait steps ("wait").
    var wk = workableStdHours(job);
    if (wk.hours <= 1e-9) {
      if (wk.barrier === 'assign') return err('Assign a replacement part first');
      if (wk.barrier === 'wait') {
        var wst = job.steps[job.stepIndex];
        if (wst.needIndex != null) {   // an install-flavored wait still needs its part
          var wnd = job.needs[wst.needIndex];
          if (!wnd || wnd.filledPartIds.length < wnd.qty)
            return err('Assign a replacement part first');
        }
        if (wst.running)
          return err('Waiting on "' + wst.label + '" — work another job, ' +
                     'hit Wait 1h, or end the day');
        var sp = Engine.spendHours(state, C.WAIT_START_HOURS);   // 0.1h to start
        if (!sp.ok) return sp;
        wst.running = true;
        state.workedToday = state.workedToday || [];
        if (state.workedToday.indexOf(job.id) === -1) state.workedToday.push(job.id);
        Jobs.tickWaits(state, C.WAIT_START_HOURS, job.id);
        return { ok: true, hoursSpent: C.WAIT_START_HOURS, completed: false,
                 startedWait: wst.label };
      }
      return err('Nothing left to work on');
    }
    var remainingEff = Math.max(0, wk.hours * m);
    var want = (hours == null) ? remainingEff : Math.max(0, Number(hours) || 0);
    // Default sessions stop at the regular day's end; explicit hour requests may
    // dip into overtime down to the -overtimeCap floor (§9.4).
    var budget = (hours == null) ? Math.max(state.hoursLeft, Math.min(avail, 0.5)) : avail;
    var spend = Math.min(budget, want, remainingEff);
    spend = Math.ceil(spend * 2 - 1e-9) / 2;              // half-hour granularity
    spend = Math.min(spend, avail);
    if (spend < 0.5) return err('Not enough time for a work session');

    state.hoursLeft = Engine.round2(state.hoursLeft - spend);
    advanceSteps(state, job, spend / m);   // also recomputes hoursDone
    Engine.accrueStaffXp(state, job.type, spend);   // §11.5
    Jobs.tickWaits(state, spend, job.id);           // §11.6 parallel waits
    state.workedToday = state.workedToday || [];
    if (state.workedToday.indexOf(job.id) === -1) state.workedToday.push(job.id);
    if (job.perUnitHours) {
      job.unitsDone = Math.min(job.units, Math.floor(job.hoursDone / job.perUnitHours));
    }

    var completed = jobFinished(job) && job.status !== 'done';
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
      // §10.4: overspend grumble — replacing a part with something far pricier
      // than what died. Waived for matching tastes (fanboys) and enthusiasts.
      if (job.type !== 'enthusiast') {
        for (var ov = 0; ov < job.needs.length; ov++) {
          var nd = job.needs[ov];
          if (!nd.originalPartId || !nd.filledPartIds.length) continue;
          var orig = Engine.partById(nd.originalPartId);
          if (!orig) continue;
          var origVal = P().priceOf(orig, state);
          var thresh = Math.max(C.OVERSPEND_MULT * origVal,
                                origVal + Engine.laborRate(year));
          var usedList = job.partsUsed || [];
          for (var ou = 0; ou < usedList.length; ou++) {
            var ue = usedList[ou];
            if (ue.needIndex != null && ue.needIndex !== ov) continue;
            if (nd.filledPartIds.indexOf(ue.partId) === -1) continue;
            if (ue.price <= thresh) continue;
            var uePart = Engine.partById(ue.partId);
            if (tasteMatchesPart(job.taste, uePart)) continue;   // fanboy waiver
            score -= C.OVERSPEND_SCORE;
            notes.push('"Did it really need a ' + Engine.fmtMoney(ue.price) +
                       ' part? The old one was worth ' + Engine.fmtMoney(origVal) + '..."');
            break;   // one grumble per slot
          }
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

    if (job.units > 1) job.unitsDone = job.units;
    score = Engine.clamp(score, 0, 5);
    Engine.pushScore(state, score);
    state.reputation.jobsCompleted++;
    state.ledger.lifetime.jobsCompleted++;

    // Warranty callback roll — §10.2 risk matrix: base + perDiff x difficulty
    // (ESD setup softens the difficulty term), x reliability x test-bench.
    if (job.type !== 'callback' && !drFailed) {
      var mtx = C.CALLBACK_MATRIX[job.speed] || C.CALLBACK_MATRIX.standard;
      var esdTerm = Engine.equipmentOwned(state, 'esd-setup') ? C.ESD_DIFF_TERM_MULT : 1;
      var cb = (mtx.base + mtx.perDiff * (job.difficulty || 2) * esdTerm) *
               avgReliabilityFactor(job) *
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
          offeredDay: state.day,
          deadlineDay: Jobs.shiftOffSunday(state, state.day + 3),   // §10.6
          difficulty: 2, speed: 'standard', status: 'active',
          hoursRequired: Math.max(0.5, Engine.round2((e.origHours || 2) * C.CALLBACK_HOURS_FRACTION)),
          hoursDone: 0,
          steps: [], stepIndex: 0,
          diagnosed: true, needsDiagnosis: false,
          fault: null, needs: [], build: null,
          units: 1, unitsDone: 0, machine: null, peripheral: null,
          drTier: 0, crt: false,
          taste: null, result: null
        };
        assembleSteps(state, job);   // §10.1 (callback template or fallback)
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
    var built = assembleMachineParts(state);
    if (!built) return null;
    var partIds = built.partIds, mobo = built.mobo;
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
      hoursRequired: (C.REFURB_HOURS_MIN + C.REFURB_HOURS_MAX) / 2,  // fallback sizing
      hoursDone: 0,
      steps: [], stepIndex: 0,
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
      peripheral: null, drTier: 0, crt: false, taste: null, result: null
    };
    assembleSteps(state, job);                       // §10.1
    job.difficulty = deriveDifficulty(state, job);   // §10.2
    state.jobs.active.push(job);
    return { ok: true, jobId: job.id };
  };

  /* §10.4 knowledge model: before diagnosis EVERY component reads "unknown" —
   * you haven't opened the box yet (fixes the v0.2 refurb bug). After
   * diagnosis the fault part is "faulty", the rest "ok". Jobs that need no
   * diagnosis (upgrades) show all ok. Works for repair/upgrade/refurb. */
  Jobs.getMachineParts = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job || !job.machine) return [];
    var preDiagnosis = job.needsDiagnosis && !job.diagnosed;
    var out = [];
    for (var i = 0; i < job.machine.partIds.length; i++) {
      var part = Engine.partById(job.machine.partIds[i]);
      if (!part) continue;
      var status = 'ok';
      if (preDiagnosis) status = 'unknown';
      else if (job.fault && job.machine.faultPartIdx === i && !job.machine.faultRepaired)
        status = 'faulty';
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
    var stripHours = Math.max(0.25, Engine.round2(
      C.STRIP_HOURS * Engine.staffTimeMult(state, 'refurb')));   // §10.7
    var spent = Engine.spendHours(state, stripHours);
    if (!spent.ok) return spent;
    Engine.accrueStaffXp(state, 'refurb', stripHours);   // §11.5
    Jobs.tickWaits(state, stripHours, job.id);           // §11.6
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
    return { ok: true, recovered: recovered, lost: lost, hoursSpent: stripHours };
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
