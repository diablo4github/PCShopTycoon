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
    var eventAdj = Engine.clamp(Math.round((volumeMult - 1) * 3),
      -2, C.OFFER_EVENT_ADJ_MAX != null ? C.OFFER_EVENT_ADJ_MAX : 3);
    var cap = C.OFFER_TIER_CAPS[
      Engine.clamp(state.shop.tier, 0, C.OFFER_TIER_CAPS.length - 1)];
    var ratingDiv = C.OFFER_RATING_DIV || 1.5;
    var count = Engine.clamp(
      C.OFFER_BASE + (tier.offerBonus || 0) + Math.floor(rep.prestige / 2) +
      Engine.clamp(Math.round((rep.rating - 3) / ratingDiv), -1, 1) + eventAdj,
      1, cap);
    if (state.jobs.offers.length >= C.OFFER_BUSY_THRESHOLD)
      count = Math.floor(count / 2);   // walk-ins see a busy shop
    // §15.2: scenario offer-volume modifier
    var scen = Engine.currentScenario(state);
    if (scen && scen.modifiers && scen.modifiers.offerMult > 0)
      count = Math.max(0, Math.round(count * scen.modifiers.offerMult));
    // §17.4: Survival sees one fewer walk-in a night, floored at 1
    var offerDelta = Engine.difficultyFor(state).offerDelta || 0;
    if (offerDelta) count = Math.max(1, count + offerDelta);
    var made = [];
    for (var n = 0; n < count; n++) {
      var job = makeOffer(state);
      if (!job) continue;
      maybeRegularReturn(state, job);   // §15.4: a satisfied regular comes back
      state.jobs.offers.push(job);
      made.push(job.title);
    }
    // §15.4: rare business-account retainer offers at prestige >= 2
    var acct = maybeAccountOffer(state);
    if (acct) { state.jobs.offers.push(acct); made.push(acct.title); }
    if (summary) summary.newOffers = summary.newOffers.concat(made);
    return made;
  };

  // ------------------------------------------------------------------
  // §15.4 Repeat customers — satisfied customers come back by name.
  // ------------------------------------------------------------------
  /* Chance a given fresh offer is actually a returning regular; scales with
   * the shop's rating. Only fires for job shapes a walk-in regular fits
   * (never contracts — those are institutions, not people). */
  function maybeRegularReturn(state, job) {
    var C = CFG();
    var regs = state.regulars || [];
    if (!regs.length) return;
    if (job.type === 'contract' || job.type === 'refurb') return;
    var chance = Engine.clamp(
      C.REGULAR_CHANCE_BASE +
      C.REGULAR_CHANCE_PER_STAR * (state.reputation.rating - 3),
      0, C.REGULAR_CHANCE_MAX);
    if (!Engine.chance(chance, 'offers')) return;   // §17.5
    var reg = Engine.pick(regs, 'offers');
    if (!reg) return;
    job.customer = { name: reg.name, type: reg.type || job.customer.type };
    job.regular = true;
    job.regularVisits = reg.jobs || 1;       // UI chip: how many times they've been in
    job.pay = Math.round((job.pay || 0) * C.REGULAR_PAY_MULT);   // loyalty premium
    reg.lastDay = state.day;
    // §15.4: their taste stays consistent visit to visit (the IBM loyalist
    // keeps coming back for IBM). Category rides the job when one applies.
    if (reg.tasteBrand) {
      var cat = tasteCategoryFor(job);
      job.taste = {
        brand: reg.tasteBrand, category: cat || null,
        bonusPct: C.REGULAR_TASTE_BONUS,
        label: 'Swears by ' + reg.tasteBrand +
               (cat ? ' ' + (TASTE_PLURAL[cat] || cat) : ' gear')
      };
    }
  }
  /* Record/refresh a regular after a satisfying completion (score >= 4). */
  function rememberRegular(state, job, score) {
    var C = CFG();
    if (score < C.REGULAR_SCORE_MIN) return;
    if (!job.customer || !job.customer.name) return;
    if (job.type === 'refurb' || job.type === 'callback') return;
    if (job.accountId) return;   // account jobs belong to the business, not a person
    state.regulars = state.regulars || [];
    var reg = null;
    for (var i = 0; i < state.regulars.length; i++) {
      if (state.regulars[i].name === job.customer.name) { reg = state.regulars[i]; break; }
    }
    if (!reg) {
      reg = { name: job.customer.name, type: job.customer.type || 'home',
              lastDay: state.day, jobs: 0, tasteBrand: null };
      state.regulars.push(reg);
    }
    reg.jobs = (reg.jobs || 0) + 1;
    reg.lastDay = state.day;
    if (!reg.tasteBrand && job.taste && job.taste.brand)
      reg.tasteBrand = job.taste.brand;   // first observed taste sticks
    // Cap: evict the regular who hasn't been in the longest
    while (state.regulars.length > C.REGULARS_CAP) {
      var oldest = 0;
      for (var o = 1; o < state.regulars.length; o++)
        if (state.regulars[o].lastDay < state.regulars[oldest].lastDay) oldest = o;
      state.regulars.splice(oldest, 1);
    }
  }

  // ------------------------------------------------------------------
  // §15.4 Business accounts — retainer offers, monthly fees, auto-jobs.
  // ------------------------------------------------------------------
  function businessNameFor(state) {
    var F = FLAVOR();
    var pool = F.businessNames;
    if (Array.isArray(pool) && pool.length) {
      // Prefer a name not already under contract
      var taken = (state.accounts || []).map(function (a) { return a.name; });
      var fresh = pool.filter(function (n) { return taken.indexOf(n) === -1; });
      var name = Engine.pick(fresh.length ? fresh : pool, 'offers');
      if (name) return name;
    }
    // Fallback while DATA's business pool is in flight
    var last = Engine.pick(F.lastNames || ['Meridian'], 'offers') || 'Meridian';
    return last + ' & Associates';
  }
  function maybeAccountOffer(state) {
    var C = CFG();
    if (state.reputation.prestige < C.ACCOUNT_PRESTIGE_MIN) return null;
    if ((state.accounts || []).length >= C.ACCOUNT_MAX_ACTIVE) return null;
    if (state.jobs.offers.some(function (o) { return o.type === 'business_account'; }))
      return null;   // one retainer on the table at a time
    if (!Engine.chance(C.ACCOUNT_OFFER_CHANCE, 'offers')) return null;
    var year = Engine.currentYear(state);
    var name = businessNameFor(state);
    var fee = Math.round(Engine.laborRate(year) * C.ACCOUNT_FEE_LABOR_MULT);
    var jobsPerMonth = Engine.randInt(C.ACCOUNT_JOBS_MIN, C.ACCOUNT_JOBS_MAX, 'offers');
    var minRating = Engine.round2(Engine.clamp(
      Math.round((state.reputation.rating - C.ACCOUNT_MIN_RATING_DELTA) * 10) / 10,
      C.ACCOUNT_MIN_RATING_FLOOR, C.ACCOUNT_MIN_RATING_CAP));
    return {
      id: state.jobs.nextId++,
      type: 'business_account', subtype: null, rush: false,
      title: 'Business account: ' + name,
      blurb: '"We need a shop we can call. ' + jobsPerMonth +
             ' service visits a month, retainer paid on the 1st."',
      customer: { name: name, type: 'smallbiz' },
      taste: null,
      pay: fee,                                  // shown as the monthly fee
      offeredDay: state.day,
      deadlineDay: shiftOffSunday(state, state.day + 5),   // offer expires like any other
      difficulty: 1, speed: 'standard', status: 'offer',
      // Cosmetic paperwork checklist (offer card renders steps like any job;
      // accepting signs the ACCOUNT — these steps are never worked).
      hoursRequired: 0.9, hoursDone: 0,
      steps: [
        { id: 's1', label: 'Meet the office manager', hours: 0.3,
          done: false, progress: 0, needIndex: null, kind: 'labor', running: false },
        { id: 's2', label: 'Walk the site & count machines', hours: 0.3,
          done: false, progress: 0, needIndex: null, kind: 'labor', running: false },
        { id: 's3', label: 'Negotiate & sign the retainer', hours: 0.3,
          done: false, progress: 0, needIndex: null, kind: 'labor', running: false }
      ],
      stepIndex: 0,
      diagnosed: true, needsDiagnosis: false,
      fault: null, needs: [], build: null, units: 1, unitsDone: 0,
      machine: null, peripheral: null, osRequest: null,
      device: null, deviceModern: false, devicePartsCost: 0, devicePayBase: null,
      drTier: 0, crt: false, budgetAsk: false, result: null,
      // §15.4 account terms (UI contract)
      account: { name: name, monthlyFee: fee, jobsPerMonth: jobsPerMonth,
                 minRating: minRating }
    };
  }
  /* §15.4: nightly auto-jobs for active business accounts — 2-4 service jobs
   * a month, auto-accepted straight onto the bench with relaxed deadlines.
   * Retainer work bypasses the workstation cap (you took their money). */
  var ACCOUNT_JOB_TYPES = ['repair', 'software', 'upgrade', 'cleaning', 'peripheral'];
  Jobs.generateAccountJobs = function (state, summary) {
    var C = CFG();
    var accounts = state.accounts || [];
    for (var i = 0; i < accounts.length; i++) {
      var acct = accounts[i];
      if ((acct.jobsThisMonth || 0) >= acct.jobsPerMonth) continue;
      if (!Engine.chance(acct.jobsPerMonth / 24, 'offers')) continue;   // ~jobsPerMonth per ~24 open days
      var job = null, tries = 0;
      while (!job && tries++ < 8) {
        var cand = makeOffer(state);
        if (cand && ACCOUNT_JOB_TYPES.indexOf(cand.type) !== -1 && !cand.rush) job = cand;
      }
      if (!job) continue;
      job.customer = { name: acct.name, type: 'smallbiz' };
      job.accountId = acct.id;
      job.decision = null; job.decisionPlan = null;   // §17.1: never on retainer work
      job.regular = false; job.regularVisits = null;
      job.taste = null;                       // businesses buy on spec, not fandom
      job.title = job.title + ' (' + acct.name + ')';
      job.deadlineDay = shiftOffSunday(state,
        state.day + Engine.randInt(C.ACCOUNT_DEADLINE_MIN, C.ACCOUNT_DEADLINE_MAX, 'offers'));
      job.status = 'active';
      state.jobs.active.push(job);            // auto-accepted retainer work
      acct.jobsThisMonth = (acct.jobsThisMonth || 0) + 1;
      if (summary) {
        summary.accountJobs = summary.accountJobs || [];
        summary.accountJobs.push(job.title);
      }
      Engine.pushNews(state, 'job', 'Service visit: ' + acct.name,
        job.title + ' — on the bench under the retainer.');
    }
  };

  // ------------------------------------------------------------------
  // §17.1 Job decision moments — forks, approval calls, overclock tuning.
  // All rolls on the FAULTS stream (§17.5); at most ONE armed plan per job;
  // never on cleaning/callbacks/business-account auto-jobs. DATA tables
  // (FORK_TEXT / DISCOVERIES / TUNING_TEXT) are consumed when present, with
  // engine fallbacks so mock runs and in-flight data edits stay playable.
  // ------------------------------------------------------------------
  var FORK_TEXT_FALLBACK = {
    patchLabel: 'Reseat & patch it', properLabel: 'Replace the failing part',
    patchDesc: 'Quick and cheap, but patched faults have a way of coming back.',
    properDesc: 'The full fix at the quoted terms — tested, warranted, done.'
  };
  function forkTextFor(job) {
    var table = Engine.getData().FORK_TEXT || {};
    var key = job.type === 'device_repair' ? 'device' :
      ((job.fault && job.fault.partCategory) || 'generic');
    return table[key] || table.generic || FORK_TEXT_FALLBACK;
  }
  var DISCOVERY_FALLBACK = [
    { category: 'psu', text: 'The power supply is bulging and smells of burnt varnish.',
      addCategory: 'psu', addLaborHours: 0.4 },
    { category: 'storage', text: 'That drive bearing whine is not long for this world.',
      addCategory: 'storage', addLaborHours: 0.4 },
    { category: 'device', text: 'The battery inside is starting to swell.',
      addCategory: null, addLaborHours: 0.4 }
  ];
  /* Work-context category for discovery selection (DATA contract: `category`
   * = what you're working ON when the discovery fires; "device" for devices). */
  function discoveryContextFor(job) {
    if (job.type === 'device_repair') return 'device';
    if (job.type === 'upgrade') return job.needs[0] ? job.needs[0].category : null;
    if (job.type === 'repair') return (job.fault && job.fault.partCategory) || 'generic';
    if (isBuildJob(job)) return 'motherboard';   // assembly bench context
    return null;
  }
  function pickDiscovery(state, job) {
    var year = Engine.currentYear(state);
    var pool = Engine.getData().DISCOVERIES;
    if (!Array.isArray(pool) || !pool.length) pool = DISCOVERY_FALLBACK;
    var ctx = discoveryContextFor(job);
    var inYear = pool.filter(function (d) {
      if (d.minYear != null && year < d.minYear) return false;
      if (d.maxYear != null && year > d.maxYear) return false;
      // A discovery must be sourceable: catalog add-ons need a purchasable part
      if (d.addCategory && !purchasableByCategory(state, d.addCategory).length) return false;
      // Device-billed add-ons (addCategory null) only make sense on device jobs
      if (!d.addCategory && job.type !== 'device_repair') return false;
      return true;
    });
    var matched = inYear.filter(function (d) { return d.category === ctx; });
    return Engine.pick(matched.length ? matched : inYear, 'faults') || null;
  }
  function tuningTextFor(state) {
    var year = Engine.currentYear(state);
    var bands = Engine.getData().TUNING_TEXT;
    if (Array.isArray(bands)) {
      for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        if (year >= (b.minYear || 0) && year <= (b.maxYear || 9999)) return b;
      }
    }
    return { method: year < 1998 ? 'Jumpers & bus clocks' :
                     year < 2010 ? 'FSB & multipliers' : 'BCLK & turbo bins',
             conservative: 'One safe notch up at stock voltage.',
             balanced: 'A solid bump with an overnight burn-in.',
             aggressive: 'Push it to the edge — glory or a redo.' };
  }
  function midLaborStep(job) {
    var steps = job.steps || [];
    var idx = Math.floor(steps.length / 2);
    while (idx < steps.length && steps[idx].kind === 'wait') idx++;
    return Math.min(Math.max(1, idx), Math.max(0, steps.length - 1));
  }
  /* Arm at most one decision moment at generation (faults stream). */
  function armDecisionPlan(state, job) {
    var C = CFG();
    job.decision = null;
    job.decisionPlan = null;
    if (job.type === 'cleaning' || job.type === 'callback' ||
        job.type === 'business_account' || job.accountId) return;
    // Overclock: the tuning choice IS the job (§17.1)
    if (job.type === 'enthusiast' && job.subtype === 'overclock') {
      if (Engine.chance(C.TUNING_CHANCE, 'faults')) {
        job.decisionPlan = { kind: 'tuning', stepIndex: midLaborStep(job), fired: false };
      }
      return;
    }
    var forkable = (job.type === 'repair' && job.fault && job.fault.partCategory) ||
                   job.type === 'device_repair';
    var approvable = job.type === 'repair' || job.type === 'upgrade' ||
                     job.type === 'build' || job.type === 'device_repair';
    if (!forkable && !approvable) return;   // software/peripheral/dr/contract: none
    if (!Engine.chance(C.DECISION_CHANCE, 'faults')) return;
    var kind;
    if (job.type === 'device_repair') kind = Engine.chance(0.5, 'faults') ? 'fork' : 'approval';
    else if (job.type === 'repair') kind = forkable ? 'fork' : 'approval';
    else kind = 'approval';
    if (kind === 'fork') {
      job.decisionPlan = { kind: 'fork', fired: false };
      // Devices skip the diagnosis phase — their fork is live immediately.
      if (!job.needsDiagnosis) fireForkDecision(state, job);
    } else {
      var disc = pickDiscovery(state, job);
      if (!disc) return;
      job.decisionPlan = { kind: 'approval', fired: false,
                           stepIndex: midLaborStep(job),
                           discovery: { category: disc.category,
                                        text: disc.text,
                                        addCategory: disc.addCategory || null,
                                        addLaborHours: Engine.round1(disc.addLaborHours || 0.5) } };
    }
  }
  Jobs.armDecisionPlan = armDecisionPlan;

  function fireForkDecision(state, job) {
    var plan = job.decisionPlan;
    if (!plan || plan.kind !== 'fork' || plan.fired) return;
    plan.fired = true;
    var C = CFG();
    var txt = forkTextFor(job);
    job.decision = {
      kind: 'fork', chosen: null,
      prompt: 'Two ways to fix this — your call.',
      options: [
        { id: 'patch', label: txt.patchLabel || FORK_TEXT_FALLBACK.patchLabel,
          summary: (txt.patchDesc || '') + ' (' +
            Math.round((1 - C.FORK_PATCH.hoursMult) * 100) + '% less bench time, ' +
            Math.round((1 - C.FORK_PATCH.payMult) * 100) + '% less pay, no parts — ' +
            'x' + C.FORK_PATCH.callbackMult + ' callback risk)' },
        { id: 'proper', label: txt.properLabel || FORK_TEXT_FALLBACK.properLabel,
          summary: (txt.properDesc || '') + ' (full fix at the quoted terms)' }
      ]
    };
  }
  Jobs.fireForkDecision = fireForkDecision;

  function fireApprovalDecision(state, job) {
    var plan = job.decisionPlan;
    if (!plan || plan.kind !== 'approval' || plan.fired) return;
    plan.fired = true;
    var C = CFG();
    var d = plan.discovery;
    job.decision = {
      kind: 'approval', chosen: null,
      prompt: d.text,
      discovery: { category: d.addCategory, text: d.text },
      options: [
        { id: 'call', label: 'Call the customer (' + C.APPROVAL_CALL_HOURS + 'h)',
          summary: 'Most say yes — approved work adds parts (billed +25%) and ' +
                   'labor, and customers love a shop that catches things.' },
        { id: 'skip', label: 'Leave it',
          summary: 'Not your problem today — but if it fails under warranty, ' +
                   'that callback lands on you.' }
      ]
    };
  }

  function fireTuningDecision(state, job) {
    var plan = job.decisionPlan;
    if (!plan || plan.kind !== 'tuning' || plan.fired) return;
    plan.fired = true;
    var C = CFG();
    var txt = tuningTextFor(state);
    job.decision = {
      kind: 'tuning', chosen: null,
      prompt: 'How hard do you push it? (' + (txt.method || 'Tuning') + ')',
      method: txt.method || null,
      options: [
        { id: 'conservative', label: 'Conservative',
          summary: (txt.conservative || '') + ' (+' + C.TUNING.conservative.scoreBonus +
                   ' rating, no risk)' },
        { id: 'balanced', label: 'Balanced',
          summary: (txt.balanced || '') + ' (+' + C.TUNING.balanced.scoreBonus +
                   ' rating, ' + Math.round(C.TUNING.balanced.risk * 100) + '% instability)' },
        { id: 'aggressive', label: 'Aggressive',
          summary: (txt.aggressive || '') + ' (+' + C.TUNING.aggressive.scoreBonus +
                   ' rating if it holds, ' + Math.round(C.TUNING.aggressive.risk * 100) +
                   '% instability = redo + rating ding)' }
      ]
    };
  }

  function decisionPending(job) {
    return !!(job.decision && job.decision.chosen == null);
  }
  Jobs.decisionPending = decisionPending;

  /* §17.1 (+PSU gate): resolve a pending decision. */
  Jobs.decideJob = function (state, jobId, optionId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    if (!decisionPending(job)) return err('No decision is waiting on this job');
    var C = CFG();
    var d = job.decision;
    var valid = d.options.some(function (o) { return o.id === optionId; });
    if (!valid) return err('Pick one of the offered options');
    var year = Engine.currentYear(state);

    if (d.kind === 'fork') {
      if (optionId === 'patch') {
        // Labor-only patch: cheaper/faster now, riskier later
        job.needs = [];
        if (job.type === 'device_repair') {
          job.devicePartsCost = Engine.round2(
            job.devicePartsCost * C.FORK_PATCH.devicePartsMult);
        }
        for (var i = job.stepIndex; i < job.steps.length; i++) {
          var st = job.steps[i];
          st.needIndex = null;   // no part to wait for on a patch
          st.hours = Engine.round1(Math.max(0.1, st.hours * C.FORK_PATCH.hoursMult));
        }
        recomputeHours(job);
        job.pay = Math.round((job.pay || 0) * C.FORK_PATCH.payMult);
        job.callbackRiskMult = (job.callbackRiskMult || 1) * C.FORK_PATCH.callbackMult;
        job.decisionTaken = { kind: 'fork', option: 'patch' };
      } else {
        job.decisionTaken = { kind: 'fork', option: 'proper' };
      }
      d.chosen = optionId;
      return { ok: true, kind: 'fork', option: optionId };
    }

    if (d.kind === 'approval') {
      // The coordinator's PSU gate rides this same flow (subkind 'psu').
      if (optionId === 'skip') {
        d.chosen = 'skip';
        if (d.subkind === 'psu') {
          job.psuSwapDeclined = true;
          return { ok: true, kind: 'approval', option: 'skip',
                   note: 'Pick a lighter option for the machine’s supply' };
        }
        job.callbackRiskMult = (job.callbackRiskMult || 1) * C.APPROVAL_SKIP_CALLBACK_MULT;
        job.approvalSkipped = true;
        job.decisionTaken = { kind: 'approval', option: 'skip' };
        return { ok: true, kind: 'approval', option: 'skip' };
      }
      // 'call': 0.1h on the phone, seeded outcome
      var sp = Engine.spendHours(state, C.APPROVAL_CALL_HOURS);
      if (!sp.ok) return sp;   // too exhausted — decision stays pending
      var approved = Engine.chance(C.APPROVAL_YES_CHANCE, 'faults');
      d.chosen = 'call';
      if (!approved) {
        if (d.subkind === 'psu') {
          job.psuSwapDeclined = true;
          return { ok: true, kind: 'approval', option: 'call', approved: false,
                   note: 'They said no — pick a part their supply can feed' };
        }
        job.approvalRefused = true;
        job.decisionTaken = { kind: 'approval', option: 'call', approved: false };
        return { ok: true, kind: 'approval', option: 'call', approved: false };
      }
      // Approved: add the quoted work
      if (d.subkind === 'psu') {
        job.psuSwapApproved = true;
        var reqW = Math.ceil((d.pendingDraw || 0) * C.PSU_HEADROOM *
                             C.PSU_SWAP_HEADROOM_MULT);
        var ffTags = machineMoboTags(job, 'psu');
        job.needs.push({ category: 'psu', anyOfTags: ffTags, minPerf: null,
                         minWatts: reqW, qty: 1, filledPartIds: [],
                         label: 'Approved PSU swap — at least ' + reqW + 'W',
                         originalPartId: machinePartIdOf(job, 'psu') });
        appendApprovedStep(state, job, 'Swap in the beefier power supply',
                           C.PSU_SWAP_HOURS, job.needs.length - 1);
        job.pay = Math.round((job.pay || 0) +
                             Engine.laborRate(year) * C.PSU_SWAP_HOURS);
        job.approvalDelight = true;
        job.decisionTaken = { kind: 'approval', option: 'call', approved: true, psu: true };
        return { ok: true, kind: 'approval', option: 'call', approved: true, psu: true };
      }
      var disc = (job.decisionPlan && job.decisionPlan.discovery) || {};
      var addHours = Engine.round1(disc.addLaborHours || C.APPROVAL_ADD_HOURS);
      if (disc.addCategory) {
        job.needs.push({ category: disc.addCategory,
                         anyOfTags: machineMoboTags(job, disc.addCategory),
                         minPerf: null, qty: 1, filledPartIds: [],
                         label: 'Approved add-on: ' + disc.addCategory,
                         originalPartId: machinePartIdOf(job, disc.addCategory) });
        appendApprovedStep(state, job, 'Fit the approved ' + disc.addCategory,
                           addHours, job.needs.length - 1);
        var labor = Engine.laborRate(year) * addHours;
        // Builds never run the completion parts-markup pass — bill the add-on
        // part estimate up front for them; needs-billed types get it at 1.25x
        // automatically at completion.
        if (isBuildJob(job)) {
          var estP = medianPartPrice(state, disc.addCategory);
          job.pay = Math.round((job.pay || 0) + estP * C.PARTS_MARKUP + labor);
        } else {
          job.pay = Math.round((job.pay || 0) + labor);
        }
      } else {
        // Device-billed add-on: flat parts money + labor (no catalog part)
        var addCost = Engine.round2(Engine.laborRate(year) * 1.2);
        job.devicePartsCost = Engine.round2((job.devicePartsCost || 0) + addCost);
        appendApprovedStep(state, job, 'Fit the approved add-on', addHours, null);
        job.pay = Math.round((job.pay || 0) + addCost * C.PARTS_MARKUP +
                             Engine.laborRate(year) * addHours);
      }
      job.approvalDelight = true;
      job.decisionTaken = { kind: 'approval', option: 'call', approved: true };
      return { ok: true, kind: 'approval', option: 'call', approved: true };
    }

    if (d.kind === 'tuning') {
      var t = C.TUNING[optionId];
      if (!t) return err('Pick one of the offered options');
      d.chosen = optionId;
      job.tuningChoice = optionId;
      job.tuningUnstable = t.risk > 0 && Engine.chance(t.risk, 'faults');
      if (job.tuningUnstable) {
        appendApprovedStep(state, job, 'Back off the clocks & redo the burn-in',
                           C.TUNING_REDO_HOURS, null);
      }
      job.decisionTaken = { kind: 'tuning', option: optionId,
                            unstable: !!job.tuningUnstable };
      return { ok: true, kind: 'tuning', option: optionId,
               unstable: !!job.tuningUnstable };
    }
    return err('Unknown decision kind');
  };

  // Helpers shared by the decision flows
  function machineMoboTags(job, category) {
    if (!job.machine) {
      // Builds: constrain to the committed board's namespace instead
      if (job.build) {
        var ids = flattenBuildIds(job.build);
        for (var b = 0; b < ids.length; b++) {
          var bp = Engine.partById(ids[b]);
          if (bp && bp.category === 'motherboard') {
            var pref0 = Engine.Compat.namespaceForCategory(category);
            if (!pref0) return null;
            var t0 = Engine.Compat.tagsInNamespace(bp, pref0);
            return t0.length ? t0 : null;
          }
        }
      }
      return null;
    }
    var mobo = null;
    for (var i = 0; i < job.machine.partIds.length; i++) {
      var mp = Engine.partById(job.machine.partIds[i]);
      if (mp && mp.category === 'motherboard') mobo = mp;
    }
    var prefix = Engine.Compat.namespaceForCategory(category);
    if (!mobo || !prefix) return null;
    var tags = Engine.Compat.tagsInNamespace(mobo, prefix);
    return tags.length ? tags : null;
  }
  function machinePartIdOf(job, category) {
    if (!job.machine) return null;
    for (var i = 0; i < job.machine.partIds.length; i++) {
      var p = Engine.partById(job.machine.partIds[i]);
      if (p && p.category === category) return p.id;
    }
    return null;
  }
  function medianPartPrice(state, category) {
    var prices = purchasableByCategory(state, category).map(function (p) {
      return P().priceOf(p, state);
    }).sort(function (a, b) { return a - b; });
    return prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  }
  function appendApprovedStep(state, job, label, hours, needIndex) {
    var insertAt = Math.min(job.stepIndex + 1, job.steps.length);
    job.steps.splice(insertAt, 0, {
      id: 'x' + (job.steps.length + 1), label: label,
      hours: Engine.round1(Math.max(0.1, hours)),
      done: false, progress: 0, needIndex: needIndex,
      kind: 'labor', running: false
    });
    for (var r = 0; r < job.steps.length; r++) job.steps[r].id = 's' + (r + 1);
    recomputeHours(job);
  }

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
    var t = Engine.pick(types, 'offers') || { id: 'home' };
    var name = (Engine.pick(F.firstNames || ['Sam'], 'offers') || 'Sam') + ' ' +
               (Engine.pick(F.lastNames || ['Doe'], 'offers') || 'Doe');
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
    var chosen = Engine.pick(fitting.length ? fitting : list, 'offers');
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
    if (job.build) return Engine.pick(['cpu', 'gpu', 'case'], 'offers');
    if (job.type === 'software' && job.subtype === 'os_install') return 'os';
    if (job.type === 'enthusiast' && job.subtype === 'overclock') return 'cooling';
    if (job.type === 'contract') return job.needs[0] ? job.needs[0].category : null;
    return null;
  }
  function maybeTaste(state, job) {
    var C = CFG();
    if (!Engine.chance(C.TASTE_CHANCE, 'offers')) return null;
    var cat = tasteCategoryFor(job);
    if (!cat) return null;
    var parts = purchasableByCategory(state, cat);
    var brands = [];
    for (var i = 0; i < parts.length; i++) {
      var b = parts[i].brand;
      if (b && brands.indexOf(b) === -1) brands.push(b);
    }
    if (!brands.length) return null;   // v1 catalogs have no brands — no tastes
    var brand = Engine.pick(brands, 'offers');
    return {
      brand: brand, category: cat,
      bonusPct: Engine.randInt(C.TASTE_BONUS_MIN, C.TASTE_BONUS_MAX, 'offers'),
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
    var c = Engine.pick(cpus.length ? cpus : purchasableByCategory(state, 'cpu'), 'offers');
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
  // §14.2: the single "bigger is better" numeric metric for a category, if it
  // has one (matches the axes compat.js's machinePerf already tracks). Parts
  // with no such axis (psu/case/motherboard/cooling/os/peripheral/expansion)
  // only ever get a price-based overspend verdict, never a downgrade/ideal one.
  function perfKeyForCategory(cat) {
    return { cpu: 'cpu', ram: 'ramMB', storage: 'storageGB', gpu: 'gpu' }[cat] || null;
  }
  Jobs.perfKeyForCategory = perfKeyForCategory;
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
                (job.build && flattenBuildIds(job.build)) || [];
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
  // §11.3 dedupe on append: the diagnose phase already does intake + opens the
  // case, so leading interview/open/ground steps in the repair template are
  // redundant (spec minimum is /open|ground|intake/i; interview/symptom steps
  // are the same intake work under other names).
  var DIAG_INTAKE_RE = /open|ground|intake|interview|symptom/i;

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
                     // §14.8: quantize to the 0.1h grid (DATA.TASK_STEPS stays
                     // unchanged — the engine snaps it, e.g. 0.25 -> 0.3).
                     hours: Engine.round1(Math.max(0.25, s.hours || 0.25)),
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
      job.perUnitHours = Engine.round1(perUnit);
      steps.forEach(function (s) {
        s.hours = Engine.round1(s.hours * job.units);
        s.label += ' (x' + job.units + ' units)';
      });
    }
    // §11.3: diagnosis merges into the checklist. Undiagnosed jobs start with a
    // diagnose phase; the repair steps hide in pendingSteps until the bench-
    // diagnosis step completes (spoiler-free single task list).
    job.pendingSteps = [];
    if (job.needsDiagnosis && !job.diagnosed) {
      var pending = job.steps;
      var dropped = 0;
      while (dropped < 2 && pending.length > 2 &&
             DIAG_INTAKE_RE.test(pending[0].label) &&
             pending[0].needIndex == null) {
        pending = pending.slice(1);   // the diag phase already covers this
        dropped++;
      }
      job.pendingSteps = pending;
      var equip = Engine.equipEffects(state);
      var benchH = Engine.round1(Math.max(0.25, 1 * equip.diagHoursMult));
      job.steps = [
        // §14.8: 0.25h quantizes to 0.3 on the 0.1h grid.
        { id: 'd1', label: 'Intake & symptom interview', hours: 0.3,
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
    job.hoursRequired = Engine.round1(total);   // §14.8: 0.1h grid
    job.hoursDone = Engine.round1(done);
  }
  // Generic fallback checklist: prep 25% / main 50% / test 25%, 0.1h-quantized.
  function synthesizeSteps(totalHours, job) {
    var h = Math.max(0.75, totalHours || 2);
    function q(x) { return Engine.round1(Math.max(0.25, x)); }
    var a = q(h * 0.25), b = q(h * 0.5);
    var c = q(h - a - b);
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
    st.hours = Engine.round1(Math.max(0.25, st.hours + delta));   // §14.8
    recomputeHours(job);
  }

  // ------------------------------------------------------------------
  // §10.4 Customer machines (repair/upgrade carry an era-plausible PC)
  // ------------------------------------------------------------------
  function assembleMachineParts(state, stream) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var mobos = purchasableByCategory(state, 'motherboard').filter(function (m) {
      return year - m.introYear <= C.ASIS_MAX_AGE_YEARS;
    });
    if (!mobos.length) mobos = purchasableByCategory(state, 'motherboard');
    var mobo = Engine.pick(mobos, stream);
    if (!mobo) return null;
    var partIds = [mobo.id];
    var cats = ['cpu', 'ram', 'storage', 'psu', 'case'];
    for (var c = 0; c < cats.length; c++) {
      var options = purchasableByCategory(state, cats[c]).filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var part = Engine.pick(options, stream);
      if (!part) return null;   // can't assemble an era machine
      partIds.push(part.id);
    }
    if (!mobo.integratedVideo) {
      var gpus = purchasableByCategory(state, 'gpu').filter(function (p) {
        // §12.2: a 3D add-on (Voodoo2) is never a machine's only video card
        return !p.addonOnly && Engine.Compat.fits(p, mobo).fits;
      });
      var gpu = Engine.pick(gpus, stream);
      if (gpu) partIds.push(gpu.id);
    }
    return { partIds: partIds, mobo: mobo };
  }

  /* §9.6/§12.3 fix: swap the priciest parts for the cheapest fitting
   * alternatives until the box fits under the as-is value cap. The v0.4b
   * catalog's premium modern parts pushed most random assemblies over the
   * cap; discarding them starved the market — downgrading instead keeps
   * dealers stocked with plausible budget surplus. Deterministic (no RNG),
   * so the shared RNG stream and job-machine assembly stay untouched. */
  function downvalueMachine(state, partIds, mobo, cap) {
    var frozen = {};
    var guard = 0;
    while (machinePartsValue(state, { partIds: partIds }) > cap && guard++ < 24) {
      var worstIdx = -1, worstPrice = 0;
      for (var i = 0; i < partIds.length; i++) {
        if (frozen[i]) continue;
        var p = Engine.partById(partIds[i]);
        if (!p || p.category === 'motherboard') continue;
        var price = P().priceOf(p, state) || 0;
        if (price > worstPrice) { worstPrice = price; worstIdx = i; }
      }
      if (worstIdx < 0) break;   // nothing left to downgrade
      var part = Engine.partById(partIds[worstIdx]);
      var cheaper = purchasableByCategory(state, part.category).filter(function (q) {
        if (q.id === part.id || q.addonOnly) return false;
        if (!Engine.Compat.fits(q, mobo).fits) return false;
        return (P().priceOf(q, state) || 0) < worstPrice;
      }).sort(function (a, b) {
        return (P().priceOf(a, state) || 0) - (P().priceOf(b, state) || 0);
      })[0];
      if (!cheaper) { frozen[worstIdx] = true; continue; }
      partIds[worstIdx] = cheaper.id;
    }
    return machinePartsValue(state, { partIds: partIds }) <= cap;
  }

  /* Customer's PC for repair/upgrade jobs (§10.4). targetCategory (the fault
   * or upgrade slot) is guaranteed present; faultPartIdx points at it. */
  function customerMachineFor(state, targetCategory) {
    var built = assembleMachineParts(state, 'offers');   // §17.5
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
        var extra = Engine.pick(extras, 'offers');
        if (extra) { partIds.push(extra.id); idx = partIds.length - 1; }
      }
    }
    var cpuName = null;
    for (var j = 0; j < partIds.length; j++) {
      var pj = Engine.partById(partIds[j]);
      if (pj && pj.category === 'cpu') { cpuName = pj.name; break; }
    }
    var machineYear = Engine.clamp(
      Engine.randInt(mobo.introYear, Math.min(year, (mobo.eolYear || year) + 2), 'offers'),
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
    // §12.4: post-2012 Apple machines are glued, soldered and parts-paired
    if (job.type === 'device_repair' && job.deviceModern) d += 1;
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
  /* §11.1/§12.2 witness: greedy cheapest full build meeting the request.
   * Multi-part aware — stacks identical RAM sticks/drives against slot counts
   * and reaches for a same-sliTag GPU pair (plus a 2D companion for Voodoo2
   * add-ons) when no single card meets minPerf.gpu. */
  function witnessBuild(state, build) {
    var C = CFG();
    var mp = build.minPerf || {};
    var minStyle = build.minStyle || 0;
    var year = Engine.currentYear(state);
    function price(p) { return P().priceOf(p, state, { buy: true }); }
    function byPrice(a, b) { return price(a) - price(b); }
    function byStyleThenPrice(a, b) {
      return ((b.style || 0) - (a.style || 0)) || (price(a) - price(b));
    }
    function slotCap(mobo, cat) {
      var slots = mobo.slots || C.SLOT_DEFAULTS;
      var n = slots[cat];
      return (typeof n === 'number' && isFinite(n) && n >= 0) ?
        Math.floor(n) : C.SLOT_DEFAULTS[cat];
    }
    // Cheapest stack of one part type summing perfKey >= target within cap.
    // Returns an array of parts (repeats allowed) or null.
    function pickStack(mobo, cat, perfKey, target, cap) {
      var cands = purchasableByCategory(state, cat).filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits && ((p.perf || {})[perfKey] || 0) > 0;
      });
      if (!cands.length) return null;
      var best = null, bestCost = Infinity;
      for (var i = 0; i < cands.length; i++) {
        var per = (cands[i].perf || {})[perfKey] || 0;
        var k = Math.max(1, Math.ceil((target || 0) / per - 1e-9));
        if (k > Math.min(cap, 16)) continue;
        var cost = price(cands[i]) * k;
        if (cost < bestCost) {
          bestCost = cost;
          best = [];
          for (var n = 0; n < k; n++) best.push(cands[i]);
        }
      }
      return best;
    }
    // Cheapest gpu selection meeting `target`: single card, or a matched pair
    // (same sliTag; identical pair for addon cards + a 2D companion).
    function pickGpus(mobo, target) {
      var cap = slotCap(mobo, 'gpu');
      var cands = purchasableByCategory(state, 'gpu').filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var best = null, bestCost = Infinity;
      function consider(list) {
        var perf = Engine.Compat.gpuEffective(list);
        if (perf < (target || 0)) return;
        if (list.length > cap) return;
        var addons = list.filter(function (p) { return p.addonOnly; });
        var standards = list.filter(function (p) { return !p.addonOnly; });
        if (addons.length && !standards.length && !mobo.integratedVideo) return;
        var cost = 0;
        list.forEach(function (p) { cost += price(p); });
        if (cost < bestCost) { bestCost = cost; best = list.slice(); }
      }
      var i, j;
      for (i = 0; i < cands.length; i++) {
        if (cands[i].addonOnly) {
          // single 3D add-on rides with the cheapest 2D card (or integrated)
          if (mobo.integratedVideo) consider([cands[i]]);
          var twoD = cands.filter(function (p) { return !p.addonOnly; }).sort(byPrice)[0];
          if (twoD) consider([twoD, cands[i]]);
        } else {
          consider([cands[i]]);
        }
      }
      // matched pairs (two copies of one card always pair with themselves)
      for (i = 0; i < cands.length; i++) {
        if (!cands[i].sliTag) continue;
        for (j = i; j < cands.length; j++) {
          if (cands[j].sliTag !== cands[i].sliTag) continue;
          if (cands[i].addonOnly !== cands[j].addonOnly) continue;
          var pair = [cands[i], cands[j]];
          if (cands[i].addonOnly) {
            if (mobo.integratedVideo) consider(pair);
            var lead = cands.filter(function (p) { return !p.addonOnly; }).sort(byPrice)[0];
            if (lead) consider([lead].concat(pair));
          } else {
            consider(pair);
          }
        }
      }
      return best;
    }
    // §15.1 note: widened 20 -> 28 — transition price-bleed can crowd the
    // cheapest slots with dying-platform boards that can't complete a build.
    var mobos = purchasableByCategory(state, 'motherboard').sort(byPrice).slice(0, 28);
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
      var rams = pickStack(mobo, 'ram', 'ramMB', mp.ramMB || 0, slotCap(mobo, 'ram'));
      var stos = pickStack(mobo, 'storage', 'storageGB', mp.storageGB || 0,
                           slotCap(mobo, 'storage'));
      var gpus = [];
      if (!mobo.integratedVideo || (mp.gpu || 0) > C.INTEGRATED_GPU_PERF) {
        gpus = pickGpus(mobo, mp.gpu || 0);
        if (!gpus && !mobo.integratedVideo) continue;
        if (!gpus) gpus = [];
      }
      var kase = pick('case', null, minStyle > 0 ? byStyleThenPrice : byPrice);
      var os = pick('os');
      var cool = minStyle > 0 ? pick('cooling', null, byStyleThenPrice) : null;
      if (!cpu || !rams || !stos || !kase || !os) continue;
      var draw = 0;
      [mobo, cpu, kase, cool].concat(rams, stos, gpus).forEach(function (p) {
        if (p) draw += p.powerDraw || 0;
      });
      var psu = pick('psu', function (p) {
        return (p.watts || 0) >= Math.ceil(draw * C.PSU_HEADROOM);
      });
      if (!psu) continue;
      var ids = [mobo, cpu].concat(rams, stos, gpus, [psu, kase], cool ? [cool] : [], [os])
        .map(function (p) { return p.id; });
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

    // Era-gated weighted type pool (§5.4). §15.1/§15.2: active-transition
    // demandMix and scenario jobWeightMult multiply the base weights.
    var pool = [];
    function typeWeightMult(type) {
      var m = 1;
      var actives = Engine.activeTransitions(state);
      for (var ti = 0; ti < actives.length; ti++) {
        var mix = actives[ti].demandMix || {};
        if (mix[type] != null && mix[type] > 0) m *= mix[type];
      }
      var scen = Engine.currentScenario(state);
      var jm = scen && scen.modifiers && scen.modifiers.jobWeightMult;
      if (jm && jm[type] != null && jm[type] > 0) m *= jm[type];
      return m;
    }
    function add(type, subtype, w) {
      w *= typeWeightMult(type);
      if (w > 0) pool.push({ type: type, subtype: subtype, w: w });
    }
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
    // §13.4: a relevant certification can unlock a job type before the prestige
    // gate would otherwise allow it (trained expertise substitutes for reputation).
    var enthusiastUnlocked = rep.prestige >= 1 || Engine.certUnlocksJobType(state, 'enthusiast');
    var contractUnlocked = rep.prestige >= 2 || Engine.certUnlocksJobType(state, 'contract');
    if (year >= 1997 && enthusiastUnlocked && purchasableByCategory(state, 'cooling').length)
      add('enthusiast', 'overclock', 1);
    if (year >= 2010 && enthusiastUnlocked) add('enthusiast', 'aesthetic', 1);
    if (contractUnlocked &&
        (state.lastContractDay == null ||
         state.day - state.lastContractDay >= C.CONTRACT_MIN_DAYS_BETWEEN))
      add('contract', null, 0.8);
    // §12.4 device repair: Apple walk-ins from 1985, the mobile boom from 2009
    // ramping into a major late-game volume source.
    if (appleMachinesActive(state).length)
      add('device_repair', 'apple', C.DEVICE_APPLE_WEIGHT);
    if (mobileDevicesActive(state).length)
      add('device_repair', 'mobile', mobileOfferWeight(year));
    if (!pool.length) return null;

    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i].w;
    var r = Engine.rand('offers') * total, choice = pool[0];
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { choice = pool[i]; break; } }

    var job = {
      id: state.jobs.nextId++,
      type: choice.type, subtype: choice.subtype || null,
      rush: false,
      title: '', blurb: '',
      customer: null,             // assigned after the switch (affinity, §9.2)
      taste: null,
      pay: 0,
      offeredDay: state.day, deadlineDay: state.day + Engine.randInt(C.DEADLINE_MIN, C.DEADLINE_MAX, 'offers'),
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
      device: null,               // §12.4 (UI contract: {name, kind, year, ...})
      deviceModern: false, devicePartsCost: 0, devicePayBase: null,
      drTier: 0,
      crt: false,
      budgetAsk: false,           // §14.2: customer explicitly wants the cheapest fix
      result: null
    };
    var bl = Engine.baselineFor(year);

    switch (choice.type) {
      case 'repair': {
        // §10.5 fault-first: fault template + machine first, copy derived from it
        var cat = pickFaultCategory(faultCats);
        var tmpl = Engine.pick((F.faults || {})[cat] || [{ desc: 'Mystery gremlins', laborHours: 2 }], 'faults');
        job.fault = {
          desc: tmpl.desc,
          partCategory: cat === 'laborOnly' ? null : cat,
          laborHours: Engine.clamp(Math.round(tmpl.laborHours || 2), 1, 3)
        };
        job.hoursRequired = job.fault.laborHours;   // fallback-step sizing only
        job.needsDiagnosis = true; job.diagnosed = false;
        job.machine = customerMachineFor(state, job.fault.partCategory);   // §10.4
        // §14.2: a slice of repairs are explicit budget/for-parts asks —
        // waives the downgrade penalty (they WANT the cheapest working part).
        job.budgetAsk = Engine.chance(C.BUDGET_REPAIR_CHANCE, 'offers');
        var repairBox = (job.machine && job.machine.name) || machineFlavor(state, year);
        job.title = 'Repair: ' + repairBox + ' — ' + tmpl.desc;
        if (Array.isArray(tmpl.complaints) && tmpl.complaints.length)
          job.blurbOverride = Engine.pick(tmpl.complaints, 'offers');   // §10.5 complaint copy
        break;
      }
      case 'upgrade': {
        // §14.1 BUG FIX: the target spec must exceed the ORIGINAL part being
        // replaced — the old code derived it purely from the year baseline
        // (ignoring the machine's actual part), so it could demand a
        // downgrade (e.g. an 80GB drive "upgraded" to a required 40GB).
        // §10.4: the customer's machine rides along; replacements must fit it.
        var upgKeyMap = { ram: 'ramMB', storage: 'storageGB', gpu: 'gpu' };
        var upgNameMap = { ram: 'RAM upgrade', storage: 'Storage upgrade',
                           gpu: 'Graphics upgrade' };
        // Try upgrade categories in a shuffled (seeded-RNG) order until one
        // guarantees a strictly-better purchasable part; else skip the offer.
        var tryCats = upgCats.slice();
        for (var sc = tryCats.length - 1; sc > 0; sc--) {
          var sj = Engine.randInt(0, sc, 'offers');
          var tmpCat = tryCats[sc]; tryCats[sc] = tryCats[sj]; tryCats[sj] = tmpCat;
        }
        var picked = null;
        for (var tci = 0; tci < tryCats.length && !picked; tci++) {
          var tryUc = tryCats[tci];
          var tryUpgKey = upgKeyMap[tryUc];
          var tryMachine = customerMachineFor(state, tryUc);
          if (!tryMachine) continue;
          var tryOrigPart = tryMachine.faultPartIdx != null ?
            Engine.partById(tryMachine.partIds[tryMachine.faultPartIdx]) : null;
          var tryOrigVal = tryOrigPart ? ((tryOrigPart.perf || {})[tryUpgKey] || 0) : 0;

          var tryFitTags = null, tryMobo = null;
          for (var tm = 0; tm < tryMachine.partIds.length; tm++) {
            var tmp2 = Engine.partById(tryMachine.partIds[tm]);
            if (tmp2 && tmp2.category === 'motherboard') tryMobo = tmp2;
          }
          var tryPrefix = Engine.Compat.namespaceForCategory(tryUc);
          if (tryMobo && tryPrefix) {
            var tryTags = Engine.Compat.tagsInNamespace(tryMobo, tryPrefix);
            if (tryTags.length) tryFitTags = tryTags;
          }
          var tryFits = (function (fitTagsClosure) {
            return function (p) {
              if (!fitTagsClosure) return true;
              var tags = p.platformTags || [];
              for (var t = 0; t < fitTagsClosure.length; t++)
                if (tags.indexOf(fitTagsClosure[t]) !== -1) return true;
              return false;
            };
          })(tryFitTags);
          var tryCands = purchasableByCategory(state, tryUc).filter(tryFits);
          if (!tryCands.length) {   // machine too exotic — drop the fit constraint
            tryFitTags = null;
            tryCands = purchasableByCategory(state, tryUc);
          }
          // Distinct achievable perf values strictly greater than the
          // original, ascending — the smallest meaningful step wins.
          var seen = {}, distinct = [];
          for (var pc = 0; pc < tryCands.length; pc++) {
            var v = (tryCands[pc].perf || {})[tryUpgKey] || 0;
            if (v > tryOrigVal && !seen[v]) { seen[v] = true; distinct.push(v); }
          }
          distinct.sort(function (a, b) { return a - b; });
          if (!distinct.length) continue;   // no strictly-better part exists this year
          var target125 = tryOrigVal * 1.25;
          var tryMinVal = null;
          for (var dv = 0; dv < distinct.length; dv++) {
            if (distinct[dv] >= target125) { tryMinVal = distinct[dv]; break; }
          }
          if (tryMinVal == null) tryMinVal = distinct[0];   // next distinct tier up

          picked = { uc: tryUc, upgKey: tryUpgKey, upgName: upgNameMap[tryUc],
                     machine: tryMachine, fitTags: tryFitTags, minVal: tryMinVal,
                     origPart: tryOrigPart, origVal: tryOrigVal };
        }
        if (!picked) return null;   // every category would require a downgrade — skip

        job.machine = picked.machine;
        var minPerf = {};
        minPerf[picked.upgKey] = picked.minVal;
        var origLabel = picked.origPart ?
          fmtPerfReq(picked.upgKey, picked.origVal) : 'nothing installed';
        var label = picked.upgName + ' — bigger than the current ' + origLabel +
                    ' → at least ' + fmtPerfReq(picked.upgKey, picked.minVal);
        job.needs = [{ category: picked.uc, anyOfTags: picked.fitTags, minPerf: minPerf,
                       qty: 1, filledPartIds: [], label: label,
                       originalPartId: picked.origPart ? picked.origPart.id : null }];
        // §16.3c: rough parts-cost range shown pre-accept (playtest P2.3) —
        // today's market prices of the qualifying parts. Min = cheapest that
        // qualifies; max = 75th percentile so one halo part can't distort the
        // range ("parts est. $40–95"). Whole dollars; UI adds the +25% note.
        var estPrices = purchasableByCategory(state, picked.uc).filter(function (p) {
          if (picked.fitTags) {
            var ptags = p.platformTags || [], hitTag = false;
            for (var ft = 0; ft < picked.fitTags.length; ft++)
              if (ptags.indexOf(picked.fitTags[ft]) !== -1) { hitTag = true; break; }
            if (!hitTag) return false;
          }
          return ((p.perf || {})[picked.upgKey] || 0) >= picked.minVal;
        }).map(function (p) {
          return P().priceOf(p, state);
        }).sort(function (a, b) { return a - b; });
        if (estPrices.length) {
          var estHi = estPrices[Math.min(estPrices.length - 1,
                                         Math.ceil((estPrices.length - 1) * 0.75))];
          job.partsEstimate = { min: Math.round(estPrices[0]),
                                max: Math.round(estHi) };
        }
        job.hoursRequired = 1;   // fallback-step sizing only
        job.title = 'Upgrade: ' + picked.upgName.toLowerCase() + ' for a ' +
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
          var osTarget = Engine.pick(osParts, 'offers');
          var osNeed = { category: 'os', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Operating system',
                         osExactId: null, osFamily: null };
          var osRoll = Engine.rand('offers');
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
        if (year >= 1997 && Engine.chance(0.4, 'offers')) {
          job.subtype = 'thermal_paste';
          job.title = 'Cleaning: dust-out & fresh thermal paste';
          job.hoursRequired = 1;
        } else {
          job.title = 'Cleaning: full dust-out';
          job.hoursRequired = Engine.pick([0.5, 1], 'offers');
        }
        break;
      }
      case 'peripheral': {
        // §10.5 fault-first: pick the concrete item, derive kind/fault/copy from it
        var items = (F.peripheralItems || []).filter(function (it) {
          if (year < (it.minYear || 0) || year > (it.maxYear || 9999)) return false;
          return peripheralKindOf(it) !== 'crt' || year <= 2005;
        });
        var item = Engine.pick(items, 'offers') || { name: 'printer', kind: 'printer' };
        var kind = peripheralKindOf(item);
        job.subtype = kind;
        job.crt = kind === 'crt';
        job.peripheral = { name: item.name, kind: kind };
        var faultDesc = (Array.isArray(item.faultDescs) && item.faultDescs.length) ?
          Engine.pick(item.faultDescs, 'faults') : 'Worn out and misbehaving inside';
        job.fault = { desc: faultDesc, partCategory: null, laborHours: 2 };
        job.needsDiagnosis = true; job.diagnosed = false;   // fault revealed on diagnosis
        job.hoursRequired = 1.5;   // fallback-step sizing only
        job.title = 'Peripheral: ' + item.name + ' repair';
        if (Array.isArray(item.complaints) && item.complaints.length)
          job.blurbOverride = Engine.pick(item.complaints, 'offers');
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
          Engine.uniform(C.BUILD_BUDGET_SPREAD_MIN, C.BUILD_BUDGET_SPREAD_MAX, 'offers'));
        var cases = Object.keys(C.USECASE_TARGETS).filter(function (u) {
          return u !== 'gaming' || year >= 1993;
        });
        var useCase = Engine.pick(cases, 'offers');
        var t = C.USECASE_TARGETS[useCase];
        job.build = {
          budget: budget, useCase: useCase,
          minPerf: {
            cpu: Engine.round2(bl.cpu * t.cpu), gpu: Engine.round2(bl.gpu * t.gpu),
            ramMB: Engine.round2(bl.ramMB * t.ramMB),
            storageGB: Engine.round2(bl.storageGB * t.storageGB)
          },
          minStyle: 0, parts: emptyBuildParts(), validated: false, committed: false
        };
        // §12.2 gamer SLI/CrossFire request (Voodoo2 1998-2000, SLI/CF 2005-16)
        if (useCase === 'gaming') {
          var inV2 = year >= C.VOODOO2_WINDOW[0] && year <= C.VOODOO2_WINDOW[1];
          var inSLI = year >= C.SLI_WINDOW[0] && year <= C.SLI_WINDOW[1];
          if ((inV2 || inSLI) && Engine.chance(C.MULTI_GPU_CHANCE, 'offers')) {
            var pairReq = bestPairRequest(state, inV2 && !inSLI);
            if (pairReq) {
              job.build.minPerf.gpu = pairReq.minGpu;   // implies the pair (§12.2)
              job.build.wantsMultiGpu = true;
              job.build.sliTag = pairReq.tag;
              job.build.multiGpuLabel = pairReq.label;
            }
          }
        } else if (year >= 2003 && Engine.chance(C.RAM_HEAVY_CHANCE, 'offers')) {
          // §12.2 office/server RAM-maxed contract build (3+ sticks by design)
          var rhPlan = ramHeavyPlan(state);
          if (rhPlan && rhPlan.target > (job.build.minPerf.ramMB || 0)) {
            job.build.minPerf.ramMB = rhPlan.target;
            job.build.ramHeavy = true;
          }
        }
        job.pay = budget;
        if (!ensureBuildFeasible(state, job)) return null;   // §11.1: unbuildable
        job.hoursRequired = C.BUILD_HOURS +
          (job.build.budget > bl.buildBudget * 1.15 ? C.BUILD_HOURS_PREMIUM_EXTRA : 0);
        job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX, 'offers');
        if (job.build.wantsMultiGpu) {
          job.title = 'Custom build: ' + job.build.multiGpuLabel + ' gaming rig (' +
            Engine.fmtMoney(job.build.budget) + ' budget)';
        } else if (job.build.ramHeavy) {
          job.title = 'Custom build: RAM-maxed ' + useCase + ' box (' +
            Engine.fmtMoney(job.build.budget) + ' budget)';
        } else {
          job.title = 'Custom build: ' + useCase + ' PC (' +
            Engine.fmtMoney(job.build.budget) + ' budget)';
        }
        break;
      }
      case 'enthusiast': {
        if (choice.subtype === 'overclock') {
          job.hoursRequired = 2;   // fallback-step sizing only
          job.needs = [{ category: 'cooling', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Beefier cooling' }];
          job.title = 'Enthusiast: overclock & cooling job';
        } else { // aesthetic: a build with a style bar
          var abudget = Math.round(bl.buildBudget * Engine.uniform(1.0, 1.5, 'offers'));
          var at = C.USECASE_TARGETS.gaming;
          job.build = {
            budget: abudget, useCase: 'gaming',
            minPerf: {
              cpu: Engine.round2(bl.cpu * at.cpu), gpu: Engine.round2(bl.gpu * at.gpu),
              ramMB: Engine.round2(bl.ramMB * at.ramMB),
              storageGB: Engine.round2(bl.storageGB * at.storageGB)
            },
            minStyle: C.AESTHETIC_MIN_STYLE, parts: emptyBuildParts(),
            validated: false, committed: false
          };
          job.pay = abudget;
          if (!ensureBuildFeasible(state, job)) return null;   // §11.1
          job.hoursRequired = C.BUILD_HOURS + 1;
          job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX, 'offers');
          job.title = 'Enthusiast: showpiece build (' +
            Engine.fmtMoney(job.build.budget) + ')';
        }
        break;
      }
      case 'contract': {
        state.lastContractDay = state.day;
        job.units = Engine.randInt(C.CONTRACT_UNITS_MIN, C.CONTRACT_UNITS_MAX, 'offers');
        job.hoursRequired = 1.5;   // per-unit fallback-step sizing; x units in assembly
        job.deadlineDay = state.day + Engine.randInt(C.CONTRACT_DEADLINE_MIN, C.CONTRACT_DEADLINE_MAX, 'offers');
        var buildContract = state.customBuildsUnlocked && equip.enablesBuilds && Engine.chance(0.5, 'offers');
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
          }), 'offers') || 'ram';
          job.needs = [{ category: cc, anyOfTags: null, minPerf: null, qty: job.units,
                         filledPartIds: [], label: 'Per-unit ' + cc + ' upgrade' }];
          job.title = 'Contract: upgrade ' + job.units + ' office machines';
        }
        break;
      }
      case 'device_repair': {
        // §12.4: pick the device first, then a fault it can actually have —
        // the whole branch skips compat/catalog parts; parts money is a cost
        // line charged at completion.
        var laborRateNow = Engine.laborRate(year);
        if (choice.subtype === 'apple') {
          var adev = Engine.pick(appleMachinesActive(state), 'offers');
          if (!adev) return null;
          // Upgrade-ish fault categories only where the flags allow (§12.4:
          // no CPU work ever; RAM/HDD only where upgradable/serviceable).
          var acats = (adev.faultCategories || []).filter(function (fc) {
            if (fc === 'cpu') return false;
            if (fc === 'ram') return !!adev.ramUpgradable;
            if (fc === 'storage') return !!adev.hddUpgradable;
            return true;
          });
          if (!acats.length) acats = ['logic-board'];
          var ainfo = appleFaultInfo(Engine.pick(acats, 'faults'));
          var modern = (adev.introYear || 0) >= C.APPLE_MODERN_YEAR;
          job.subtype = 'apple';
          job.device = { id: adev.id, name: adev.name, kind: 'apple',
                         year: adev.introYear || year,
                         family: adev.family || null, tier: null,
                         ramUpgradable: !!adev.ramUpgradable,
                         hddUpgradable: !!adev.hddUpgradable };
          job.deviceModern = modern;
          job.fault = { desc: ainfo.desc, partCategory: null,
                        laborHours: Engine.clamp(Math.round(ainfo.laborHours || 2), 1, 3) };
          var arange = (Array.isArray(adev.basePriceRange) && adev.basePriceRange.length === 2) ?
            adev.basePriceRange : [laborRateNow * 2.5, laborRateNow * 4];
          var avalue = ((arange[0] + arange[1]) / 2) * C.APPLE_VALUE_MULT;
          job.devicePartsCost = Engine.round2(
            (ainfo.partsCostFactor != null ? ainfo.partsCostFactor : 0.3) * avalue *
            (modern ? C.APPLE_MODERN_PARTS_MULT : 1));
          job.devicePayBase = Math.round(Engine.uniform(arange[0], arange[1], 'offers'));
          job.hoursRequired = job.fault.laborHours;
          job.title = 'Device repair: ' + adev.name + ' — ' + ainfo.desc;
          if (Array.isArray(ainfo.complaints) && ainfo.complaints.length)
            job.blurbOverride = Engine.pick(ainfo.complaints, 'offers');
        } else {
          var mdev = Engine.pick(mobileDevicesActive(state), 'offers');
          if (!mdev) return null;
          var mf = mobileFaultEntry(mdev.kind);
          if (!mf) return null;
          job.subtype = mdev.kind === 'tablet' ? 'tablet' : 'smartphone';
          job.device = { id: mdev.id, name: mdev.name, kind: job.subtype,
                         year: mdev.introYear || year,
                         family: null, tier: mdev.tier || 'mainstream' };
          var mdesc = mf.tpl.desc ||
            (Array.isArray(mf.tpl.faultDescs) ? Engine.pick(mf.tpl.faultDescs, 'faults') : null) ||
            (mf.key.charAt(0).toUpperCase() + mf.key.slice(1) + ' failure');
          job.fault = { desc: mdesc, partCategory: null,
                        laborHours: Engine.clamp(Math.round(mf.tpl.laborHours || 2), 1, 3) };
          var tierFactor = C.DEVICE_TIER_FACTOR[mdev.tier] != null ?
            C.DEVICE_TIER_FACTOR[mdev.tier] : C.DEVICE_TIER_FACTOR.mainstream;
          var mvalue = tierFactor * laborRateNow *
            (job.subtype === 'tablet' ? C.TABLET_VALUE_MULT : 1);
          job.devicePartsCost = Engine.round2(
            (mf.tpl.partsCostFactor != null ? mf.tpl.partsCostFactor : 0.3) * mvalue);
          job.devicePayBase = null;   // mobile: fault labor x laborRate (post-switch)
          job.hoursRequired = job.fault.laborHours;
          job.title = 'Device repair: ' + mdev.name + ' — ' + mdesc;
          if (Array.isArray(mf.tpl.complaints) && mf.tpl.complaints.length)
            job.blurbOverride = Engine.pick(mf.tpl.complaints, 'offers');
        }
        break;
      }
    }

    // §10.1: assemble the step checklist (sets hoursRequired deterministically),
    // then derive difficulty (§10.2) and price from the real time on the bench.
    // §11.3: the diagnose phase is NOT billed as labor — the §9.6 bench fee
    // already covers diagnostics (no double-dipping).
    assembleSteps(state, job);
    job.difficulty = deriveDifficulty(state, job);
    var diagPhaseHours = 0;
    if (job.needsDiagnosis && !job.diagnosed) {
      for (var dp = 0; dp < job.steps.length; dp++) diagPhaseHours += job.steps[dp].hours;
    }
    var payHours = Math.max(0.5, Engine.round1(job.hoursRequired - diagPhaseHours));
    if (job.type === 'device_repair') {
      // §12.4: Apple pay from the machine's basePriceRange; mobile from fault
      // labor x laborRate. Parts money is a completion cost line, so the quote
      // covers it at the standard markup.
      var deviceLabor = job.devicePayBase != null ? job.devicePayBase :
        basePay(state, 'device_repair', payHours, job.difficulty);
      job.pay = Math.round(deviceLabor + job.devicePartsCost * C.PARTS_MARKUP);
    } else if (!isBuildJob(job) && job.type !== 'contract') {
      job.pay = Math.round(basePay(state, job.type, payHours, job.difficulty));
    } else if (job.type === 'contract') {
      job.pay = Math.round(basePay(state, 'contract', payHours, job.difficulty));
    } else {
      job.pay = Math.round(job.pay);   // builds: budget, whole dollars (§10.2)
    }
    // §15.6: difficulty pay multiplier on labor-priced jobs (builds excluded —
    // build pay IS the parts budget, scaling it would break the §7 margin band).
    if (!isBuildJob(job)) {
      var diffSet = Engine.difficultyFor(state);
      if (diffSet.payMult !== 1) job.pay = Math.round(job.pay * diffSet.payMult);
    }

    // §9.2: customer type first (era + affinity gated), then a fitting blurb —
    // §10.5: subject-derived complaint copy wins over generic blurbs.
    job.customer = customerFor(state, year, affinityKeyFor(job));
    job.blurb = job.blurbOverride || blurbFor(job.type, job.customer.type);
    delete job.blurbOverride;
    job.taste = maybeTaste(state, job);

    // §13.3: replace {SW}/{GAME}/{OFFICE}/{CREATIVE} tokens with an era-valid,
    // customer-appropriate period-software title (seeded RNG, deterministic).
    // Runs on every generated title/blurb regardless of where the token came
    // from (fault desc, item complaint, generic blurb...).
    var copyCtx = { year: year, customerType: job.customer.type, stream: 'offers' };
    job.title = Engine.fillCopyTokens(job.title, copyCtx);
    job.blurb = Engine.fillCopyTokens(job.blurb, copyCtx);

    // Rush jobs: repair/software/upgrade, 8%: due today, pay x1.8 (§5.4)
    if ((job.type === 'repair' || job.type === 'software' || job.type === 'upgrade') &&
        Engine.chance(C.RUSH_CHANCE, 'offers')) {
      job.rush = true;
      job.deadlineDay = job.offeredDay;
      job.pay = Math.round(job.pay * C.RUSH_PAY_MULT);
      job.title = 'RUSH — ' + job.title;
    }
    // §10.6: deadlines never land on Sunday
    if (job.deadlineDay != null) job.deadlineDay = shiftOffSunday(state, job.deadlineDay);
    armDecisionPlan(state, job);   // §17.1: at most one decision moment per job
    return job;
  }

  // ------------------------------------------------------------------
  // §12.4 device-repair tables (Apple + mobile) — defensive against missing
  // or partial DATA while the tables are being transcribed.
  // ------------------------------------------------------------------
  function deviceActive(dev, year) {
    if (!dev) return false;
    var tail = CFG().DEVICE_REPAIR_TAIL_YEARS;
    var intro = dev.introYear || 0;
    var eol = dev.eolYear || 9999;
    return year >= intro && year <= eol + tail;
  }
  function appleMachinesActive(state) {
    var year = Engine.currentYear(state);
    if (year < 1985) return [];   // §12.4 era gate
    return (Engine.getData().APPLE_MACHINES || []).filter(function (d) {
      return deviceActive(d, year);
    });
  }
  function mobileDevicesActive(state) {
    var year = Engine.currentYear(state);
    if (year < 2009) return [];   // §12.4 era gate
    return (Engine.getData().MOBILE_DEVICES || []).filter(function (d) {
      if (!deviceActive(d, year)) return false;
      if (d.kind === 'tablet' && year < 2010) return false;
      return true;
    });
  }
  // §12.4: mobile repair ramps hard through the 2010s (research §4.2).
  function mobileOfferWeight(year) {
    var ramp = CFG().DEVICE_MOBILE_RAMP || {};
    var w = 0, keys = Object.keys(ramp);
    for (var i = 0; i < keys.length; i++) {
      var y = Number(keys[i]);
      if (year >= y && ramp[keys[i]] > w) w = ramp[keys[i]];
    }
    return w;
  }
  // Fallback Apple fault info by category — used when DATA.APPLE_FAULTS is
  // absent (the schema only mandates faultCategories on the machines).
  var APPLE_FAULT_FALLBACK = {
    ram: { desc: 'Failing memory module', laborHours: 2, partsCostFactor: 0.22,
           complaints: ['"It bombs with a sad face and strange chimes."',
                        '"It forgets what it was doing mid-document."'] },
    storage: { desc: 'Dying internal drive', laborHours: 2, partsCostFactor: 0.35,
               complaints: ['"It clicks and takes forever to find my files."',
                            '"The flashing question mark is back."'] },
    screen: { desc: 'Failing display', laborHours: 2, partsCostFactor: 0.4,
              complaints: ['"The screen flickers and dims to nothing."',
                           '"There are lines across everything."'] },
    battery: { desc: 'Swollen battery', laborHours: 2, partsCostFactor: 0.25,
               complaints: ['"The case is bulging. That seems bad."',
                            '"It dies the second it leaves the charger."'] },
    'logic-board': { desc: 'Logic board fault', laborHours: 3, partsCostFactor: 0.5,
                     complaints: ['"It powers on but never chimes."',
                                  '"It crashes no matter what we try."'] },
    psu: { desc: 'Dead power supply', laborHours: 2, partsCostFactor: 0.25,
           complaints: ['"Nothing happens when I press the power key."'] },
    floppy: { desc: 'Jammed floppy mechanism', laborHours: 1, partsCostFactor: 0.15,
              complaints: ['"The disk went in and will not come out."'] },
    keyboard: { desc: 'Dead keys on the keyboard', laborHours: 1, partsCostFactor: 0.15,
                complaints: ['"Half the keys stopped typing."'] },
    'speaker-mic': { desc: 'Crackling speaker', laborHours: 1, partsCostFactor: 0.12,
                     complaints: ['"The startup chime sounds like gravel."'] },
    gpu: { desc: 'Failing graphics board', laborHours: 3, partsCostFactor: 0.45,
           complaints: ['"The picture tears and artifacts under load."'] },
    cooling: { desc: 'Failed fan & thermal shutdowns', laborHours: 2, partsCostFactor: 0.18,
               complaints: ['"It roars, gets hot, then just turns off."'] }
  };
  function appleFaultInfo(cat) {
    var table = Engine.getData().APPLE_FAULTS || {};
    var entry = table[cat];
    if (Array.isArray(entry)) entry = Engine.pick(entry, 'faults');
    return entry || APPLE_FAULT_FALLBACK[cat] ||
           { desc: 'Hardware fault', laborHours: 2, partsCostFactor: 0.3, complaints: [] };
  }
  function mobileFaultEntry(kind) {
    var table = Engine.getData().MOBILE_FAULTS || {};
    var keys = Object.keys(table).filter(function (k) {
      var e = table[k];
      return e && (Array.isArray(e) ? e.length : true);
    });
    if (!keys.length) return null;
    var key = Engine.pick(keys, 'faults');
    var entry = table[key];
    if (Array.isArray(entry)) entry = Engine.pick(entry, 'faults');
    if (!entry) return null;
    return { key: key, tpl: entry };
  }

  // ------------------------------------------------------------------
  // §12.2 special build requests: SLI/CrossFire pairs & RAM-maxed contracts
  // ------------------------------------------------------------------
  function multiGpuLabelFor(tag) {
    if (/voodoo/i.test(tag)) return 'Voodoo2 SLI';
    if (/cross|cf|radeon|x8|hd/i.test(tag)) return 'CrossFire';
    return 'SLI';
  }
  /* Find the strongest matched-pair request the market supports right now.
   * Returns { tag, minGpu, label } or null when no pair beats every single
   * card (a pair the customer could skip is not a pair request). */
  function bestPairRequest(state, wantAddon) {
    var C = CFG();
    var gpus = purchasableByCategory(state, 'gpu');
    var boards = purchasableByCategory(state, 'motherboard');
    var bestSingle = 0, groups = {}, i;
    for (i = 0; i < gpus.length; i++) {
      var g = gpus[i];
      var score = (g.perf || {}).gpu || 0;
      if (!g.addonOnly && score > bestSingle) bestSingle = score;
      if (g.sliTag && !!g.addonOnly === wantAddon)
        (groups[g.sliTag] = groups[g.sliTag] || []).push(g);
    }
    var best = null;
    for (var tag in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, tag)) continue;
      var list = groups[tag].slice().sort(function (a, b) {
        return ((b.perf || {}).gpu || 0) - ((a.perf || {}).gpu || 0);
      });
      var top = list[0];
      var second = list[1] || list[0];   // two copies of one card pair fine
      var slotsNeeded = wantAddon ? 3 : 2;   // Voodoo2 pair rides beside a 2D card
      var boardOk = boards.some(function (b) {
        var slots = b.slots || C.SLOT_DEFAULTS;
        var cap = (slots.gpu != null && isFinite(slots.gpu)) ?
          Math.floor(slots.gpu) : C.SLOT_DEFAULTS.gpu;
        var need = (wantAddon && b.integratedVideo) ? 2 : slotsNeeded;
        if (cap < need) return false;
        return Engine.Compat.fits(top, b).fits && Engine.Compat.fits(second, b).fits;
      });
      if (!boardOk) continue;
      if (wantAddon && !boards.some(function (b) { return b.integratedVideo; }) &&
          !gpus.some(function (g2) { return !g2.addonOnly; })) continue;   // no 2D source
      var eff = ((top.perf || {}).gpu || 0) +
                Engine.Compat.pairFactor(tag) * ((second.perf || {}).gpu || 0);
      if (!best || eff > best.eff) best = { tag: tag, eff: eff };
    }
    if (!best) return null;
    var minGpu = Engine.round2(best.eff * 0.92);
    if (minGpu <= bestSingle) return null;   // a lone flagship would do — not a pair ask
    return { tag: best.tag, minGpu: minGpu, label: multiGpuLabelFor(best.tag) };
  }
  /* §12.2 RAM-heavy target: total ramMB above 2x the biggest purchasable stick
   * (so every solution stacks 3+ sticks) yet reachable on a >=4-slot board. */
  function ramHeavyPlan(state) {
    var C = CFG();
    var sticks = purchasableByCategory(state, 'ram');
    var boards = purchasableByCategory(state, 'motherboard');
    var maxStick = 0, i;
    for (i = 0; i < sticks.length; i++)
      maxStick = Math.max(maxStick, (sticks[i].perf || {}).ramMB || 0);
    if (!(maxStick > 0)) return null;
    var target = Engine.round2(maxStick * C.RAM_HEAVY_STICK_MULT);
    for (i = 0; i < boards.length; i++) {
      var b = boards[i];
      var slots = b.slots || C.SLOT_DEFAULTS;
      var cap = (slots.ram != null && isFinite(slots.ram)) ?
        Math.floor(slots.ram) : C.SLOT_DEFAULTS.ram;
      if (cap < 4) continue;
      var fitting = 0;
      for (var s = 0; s < sticks.length; s++) {
        if (!Engine.Compat.fits(sticks[s], b).fits) continue;
        var per = (sticks[s].perf || {}).ramMB || 0;
        if (per > 0 && Math.ceil(target / per - 1e-9) <= Math.min(cap, 16))
          fitting++;
      }
      if (fitting > 0) return { target: target };
    }
    return null;
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
    var r = Engine.rand('faults') * total;
    for (i = 0; i < cats.length; i++) { r -= cats[i].w; if (r <= 0) return cats[i].cat; }
    return cats.length ? cats[cats.length - 1].cat : 'laborOnly';
  }

  // ------------------------------------------------------------------
  // Offer lifecycle
  // ------------------------------------------------------------------
  Jobs.acceptOffer = function (state, jobId) {
    var job = Jobs.findOffer(state, jobId);
    if (!job) return err('Offer not found');
    // §15.4: accepting a retainer signs the ACCOUNT — no bench job is created,
    // so the workstation cap doesn't apply.
    if (job.type === 'business_account') {
      removeFrom(state.jobs.offers, job);
      state.accounts = state.accounts || [];
      state.accounts.push({
        id: 'acct' + job.id, name: job.account.name,
        monthlyFee: job.account.monthlyFee,
        jobsPerMonth: job.account.jobsPerMonth,
        minRating: job.account.minRating,
        signedDay: state.day, failsThisMonth: 0, jobsThisMonth: 0
      });
      Engine.recordAchievementEvent(state, 'account-signed');
      Engine.pushNews(state, 'money', 'Account signed: ' + job.account.name,
        Engine.fmtMoney(job.account.monthlyFee) + '/month on retainer, ' +
        job.account.jobsPerMonth + ' service visits — keep the rating above ' +
        job.account.minRating.toFixed(1) + ' and don’t miss their deadlines.');
      return { ok: true, accountSigned: true };
    }
    var slots = Engine.tierInfo(state).workstationSlots;
    var activeNonRefurb = state.jobs.active.filter(function (j) { return j.type !== 'refurb'; });
    if (activeNonRefurb.length >= slots * CFG().HARD_CAP_SLOTS_MULT)
      return err('All workstations committed — finish something first');
    removeFrom(state.jobs.offers, job);
    job.status = 'active';
    state.jobs.active.push(job);
    // §16.2d: feasibility warning (informational — the accept still succeeds).
    // Committed standard-speed hours across active non-refurb jobs (incl. this
    // one) vs the open-day hours before THIS job's deadline.
    var warning = null;
    if (job.deadlineDay != null) {
      var committed = 0;
      for (var ci = 0; ci < state.jobs.active.length; ci++) {
        var cj = state.jobs.active[ci];
        if (cj.type === 'refurb') continue;   // no deadline — discretionary work
        committed += Math.max(0, (cj.hoursRequired || 0) - (cj.hoursDone || 0));
      }
      var workable = 0;
      for (var d = state.day; d <= job.deadlineDay; d++) {
        if (!Engine.dateInfo(d, state).isSunday) workable += state.hoursPerDay;
      }
      if (workable > 0 && committed > CFG().ACCEPT_WARN_LOAD * workable) {
        warning = 'Your bench is heavily booked (' + Engine.round1(committed) +
                  'h queued vs ' + workable + 'h before this deadline) — ' +
                  'this deadline may be tight';
      }
    }
    return warning ? { ok: true, warning: warning } : { ok: true };
  };

  Jobs.declineOffer = function (state, jobId) {
    var job = Jobs.findOffer(state, jobId);
    if (!job) return err('Offer not found');
    removeFrom(state.jobs.offers, job);
    state.declinesToday = (state.declinesToday || 0) + 1;
    if (state.declinesToday === CFG().DECLINES_FREE_PER_DAY + 1) {
      Engine.pushScore(state, CFG().DECLINE_DING_SCORE,
        { reasons: ['turned away too many customers in one day'] }); // word gets around
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
      // §17.1: post-diagnosis estimate update — rough parts range for the card
      job.partsEstimate = needPartsEstimate(state, need);
    }
    // §17.1: an armed diagnosis fork goes live the moment the fault is known
    fireForkDecision(state, job);
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
    // §14.8: round UP to the 0.1h grid so the session covers the whole
    // (possibly two-step) diagnose phase in one explicit-hours workJob call.
    var effNeeded = Engine.round1(Math.max(0.5, Math.ceil(needStd * m * 10 - 1e-9) / 10));
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
    // §11.4: OS request enforcement, readable like minPerf (checked first so
    // the message names the request, not an empty spec)
    if (need.osExactId && part.id !== need.osExactId) {
      var exact = Engine.partById(need.osExactId);
      return part.name + ' is not what the customer asked for — they want ' +
             (exact ? exact.name : 'a specific OS') + ' specifically';
    }
    if (need.osFamily && osFamilyOf(part) !== need.osFamily) {
      return part.name + ' is the wrong flavor — the customer wants any ' +
             Jobs.osFamilyLabel(need.osFamily);
    }
    if (need.minWatts && (part.watts || 0) < need.minWatts) {
      return part.name + ' (' + (part.watts || 0) + 'W) is under the quoted ' +
             need.minWatts + 'W supply';
    }
    if (!meetsMinPerf(part, need)) {
      return part.name + ' is below the required spec — needs at least ' +
             minPerfText(need.minPerf);
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
    if (need.minWatts && (part.watts || 0) < need.minWatts) return false;   // §17.1
    return true;
  }
  // Category/tag fit only — below-spec parts still appear in pickers, greyed (§9.3),
  // EXCEPT OS-request mismatches, which §11.4 restricts out of the list entirely.
  function candidateListed(part, need, state) {
    if (!part || part.category !== need.category) return false;
    if (!purchasable(part, state)) return false;
    if (need.anyOfTags && need.anyOfTags.length) {
      var hit = false, tags = part.platformTags || [];
      for (var i = 0; i < need.anyOfTags.length; i++)
        if (tags.indexOf(need.anyOfTags[i]) !== -1) { hit = true; break; }
      if (!hit) return false;
    }
    if (need.osExactId && part.id !== need.osExactId) return false;
    if (need.osFamily && osFamilyOf(part) !== need.osFamily) return false;
    return true;
  }

  /* §16.3c/§17.1: rough market range of the parts that could satisfy a need
   * (min = cheapest qualifying, max = 75th percentile). Whole dollars. */
  function needPartsEstimate(state, need) {
    var prices = purchasableByCategory(state, need.category).filter(function (p) {
      return candidateListed(p, need, state) && meetsMinPerf(p, need);
    }).map(function (p) { return P().priceOf(p, state); })
      .sort(function (a, b) { return a - b; });
    if (!prices.length) return null;
    var hi = prices[Math.min(prices.length - 1, Math.ceil((prices.length - 1) * 0.75))];
    return { min: Math.round(prices[0]), max: Math.round(hi) };
  }
  Jobs.needPartsEstimate = needPartsEstimate;

  Jobs.getJobNeeds = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return [];
    var C = CFG();
    var year = Engine.currentYear(state);
    var out = [];
    for (var i = 0; i < job.needs.length; i++) {
      var need = job.needs[i];
      // §10.4/§14.2: the original part being replaced, and its graded
      // overspend thresholds + class-defining metric (for the vs-original cue).
      var orig = need.originalPartId ? Engine.partById(need.originalPartId) : null;
      var origVal = orig ? P().priceOf(orig, state) : 0;
      var threshold = orig ?
        Math.max(C.OVERSPEND_MULT * origVal, origVal + Engine.laborRate(year)) : Infinity;
      var hardThreshold = orig ?
        Math.max(C.OVERSPEND_HARD_MULT * origVal, origVal + Engine.laborRate(year)) : Infinity;
      var replaces = orig ? { name: orig.name, value: origVal } : null;
      var perfKey = perfKeyForCategory(need.category);
      var origMetric = (orig && perfKey != null) ? ((orig.perf || {})[perfKey] || 0) : null;
      var options = [];
      var cands = purchasableByCategory(state, need.category);
      for (var c = 0; c < cands.length; c++) {
        var part = cands[c];
        if (!candidateListed(part, need, state)) continue;
        var inv = Engine.inventoryEntry(state, part.id);
        var marketVal = P().priceOf(part, state);
        // §14.2: per-option vs-original comparison so the UI never has to
        // recompute the better/same/worse rule itself.
        var vsOriginal = null;
        if (orig && perfKey != null) {
          var optMetric = (part.perf || {})[perfKey] || 0;
          var cmp = optMetric > origMetric ? 'better' :
                    (optMetric < origMetric ? 'worse' : 'same');
          vsOriginal = { origLabel: fmtPerfReq(perfKey, origMetric), cmp: cmp };
        }
        var overspendGrade = null;
        if (replaces) {
          if (marketVal > hardThreshold) overspendGrade = 'hard';
          else if (marketVal > threshold) overspendGrade = 'mild';
        }
        var opt = {
          partId: part.id, name: part.name,
          source: (inv && inv.qty > 0) ? 'inventory' : 'market',
          price: (inv && inv.qty > 0) ? 0 : P().priceOf(part, state, { buy: true }),
          inStock: inv ? inv.qty : 0,
          meets: meetsMinPerf(part, need),                // §9.3
          tasteMatch: tasteMatchesPart(job.taste, part),  // §9.2
          replaces: replaces,                             // §10.4
          vsOriginal: vsOriginal,                          // §14.2
          overspend: overspendGrade != null,               // §10.4 back-compat bool
          overspendGrade: overspendGrade,                  // §14.2: null|"mild"|"hard"
          overPsu: overPsuFor(job, need, part)             // §17.1 PSU gate (UI amber flag)
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
                 assigned: assigned, replaces: replaces, options: options,
                 machinePsuWatts: machinePsuWatts(job) || null,   // §17.1
                 minWatts: need.minWatts || null });
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
  /* §17.1 PSU gate (overseer audit): a customer machine's supply must feed
   * what the shop installs. Draw after the swap = machine total − replaced
   * original + candidate; over watts/PSU_HEADROOM needs an approved PSU swap. */
  function machinePsuWatts(job) {
    if (!job.machine) return 0;
    for (var i = 0; i < job.machine.partIds.length; i++) {
      var p = Engine.partById(job.machine.partIds[i]);
      if (p && p.category === 'psu') return p.watts || 0;
    }
    return 0;
  }
  function machineDrawAfterSwap(job, need, candidate) {
    var draw = 0;
    for (var i = 0; i < job.machine.partIds.length; i++) {
      var p = Engine.partById(job.machine.partIds[i]);
      if (!p || p.category === 'psu') continue;
      draw += p.powerDraw || 0;
    }
    var orig = need.originalPartId ? Engine.partById(need.originalPartId) : null;
    if (orig && orig.category !== 'psu') draw -= orig.powerDraw || 0;
    draw += candidate.powerDraw || 0;
    return Math.max(0, draw);
  }
  /* Over-PSU when the machine has a rated supply and the post-swap draw needs
   * more than it provides (same §5.1 headroom rule the build path enforces). */
  function overPsuFor(job, need, candidate) {
    if (!job.machine || !candidate || candidate.category === 'psu') return false;
    if (job.psuSwapApproved) return false;   // beefier supply already quoted
    var watts = machinePsuWatts(job);
    if (!watts) return false;
    var draw = machineDrawAfterSwap(job, need, candidate);
    return Math.ceil(draw * CFG().PSU_HEADROOM) > watts;
  }

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
    // §17.1 PSU gate: an over-draw part needs the PSU swap approved first.
    if (overPsuFor(job, need, part)) {
      var psuW = machinePsuWatts(job);
      var drawAfter = machineDrawAfterSwap(job, need, part);
      if (job.psuSwapDeclined) {
        return err('Their ' + psuW + 'W supply can’t feed ' + part.name +
                   ' (needs ~' + Math.ceil(drawAfter * CFG().PSU_HEADROOM) +
                   'W) and the PSU swap was declined — pick a lighter option');
      }
      if (!decisionPending(job)) {
        job.decision = {
          kind: 'approval', subkind: 'psu', chosen: null,
          pendingDraw: drawAfter,
          prompt: 'Their ' + psuW + 'W supply can’t feed ' + part.name +
                  ' — quote a PSU swap too?',
          options: [
            { id: 'call', label: 'Call & quote the PSU swap (' +
                CFG().APPROVAL_CALL_HOURS + 'h)',
              summary: 'Approved: adds a PSU need (billed +25%) and a little labor.' },
            { id: 'skip', label: 'Pick a lighter part instead',
              summary: 'No call — heavy options stay off the table for this machine.' }
          ]
        };
      }
      return err('Their ' + psuW + 'W supply can’t feed ' + part.name +
                 ' (needs ~' + Math.ceil(drawAfter * CFG().PSU_HEADROOM) +
                 'W) — decide on the PSU swap first');
    }

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
      // §16.3b: stock pulls bill at min(current, avgCost x STOCK_BILL_CAP) —
      // legacy/scarcity drift can't 10x the customer's bill off an old
      // stockpile. Salvaged parts (avgCost 0, no cost basis) still bill at
      // market: the arbitrage fix targets bought stock, not strip-downs.
      if (fromStock && stockCost > 0) {
        chargePrice = Math.min(chargePrice,
                               Engine.round2(stockCost * C.STOCK_BILL_CAP));
      }
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
      if (Engine.chance(mishapP, 'misc')) {
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
  var MULTI_SLOT_CATS = ['ram', 'gpu', 'storage'];   // §12.2 board-driven counts

  function buildJobOrErr(state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return { error: 'Job not active' };
    if (!isBuildJob(job) || !job.build) return { error: 'Not a custom-build job' };
    return { job: job };
  }
  // §12.2: build.parts is a per-category map of slot arrays. Saves from v4 and
  // earlier stored a flat id array — normalize lazily so un-migrated callers
  // (and mid-migration states) never break.
  function emptyBuildParts() {
    var m = {};
    for (var i = 0; i < BUILD_CATS.length; i++) m[BUILD_CATS[i]] = [];
    return m;
  }
  Jobs.emptyBuildParts = emptyBuildParts;
  function wrapBuildParts(build) {
    if (!build) return;
    if (Array.isArray(build.parts)) {
      var flat = build.parts, map = emptyBuildParts();
      for (var i = 0; i < flat.length; i++) {
        var p = Engine.partById(flat[i]);
        if (p && map[p.category]) map[p.category].push(flat[i]);
      }
      build.parts = map;
    } else if (!build.parts || typeof build.parts !== 'object') {
      build.parts = emptyBuildParts();
    }
  }
  Jobs.wrapBuildParts = wrapBuildParts;
  function selArray(build, cat) {
    wrapBuildParts(build);
    if (!Array.isArray(build.parts[cat])) build.parts[cat] = [];
    return build.parts[cat];
  }
  // Flat non-null id list across every category (validation/commit/perf).
  function flattenBuildIds(build) {
    wrapBuildParts(build);
    var out = [];
    for (var c = 0; c < BUILD_CATS.length; c++) {
      var arr = build.parts[BUILD_CATS[c]];
      if (!Array.isArray(arr)) continue;
      for (var i = 0; i < arr.length; i++) if (arr[i] != null) out.push(arr[i]);
    }
    return out;
  }
  Jobs.flattenBuildIds = flattenBuildIds;
  function selectedMobo(job) {
    var arr = selArray(job.build, 'motherboard');
    return arr[0] != null ? Engine.partById(arr[0]) : null;
  }
  /* §12.2 slot count for a category: 1 for single-slot categories; the selected
   * board's slots.* otherwise (0 until a board is chosen; null when the board
   * carries no slots data — the UI feature-detects null and falls back to the
   * old select list). */
  function slotCountFor(cat, mobo) {
    if (MULTI_SLOT_CATS.indexOf(cat) === -1) return 1;
    if (!mobo) return 0;
    if (!mobo.slots) return null;
    var n = mobo.slots[cat];
    // 0 is a real count (i810-class boards have no GPU slot at all)
    return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : null;
  }
  Jobs.slotCountFor = slotCountFor;
  function trimTrailingNulls(arr) {
    while (arr.length && arr[arr.length - 1] == null) arr.pop();
  }

  /* §12.2: can this single part contribute toward the job's minPerf in its
   * category? Drives the catalog `meets` flag (the UI's yellow slot state).
   * Stackable categories judge the part times the usable slot count; GPUs
   * count a self-pair when the card carries an sliTag; add-on 3D cards ride
   * on their pair potential. */
  function catalogMeets(part, cat, mp, mobo, slotCount) {
    if (!mp) return true;
    var pp = part.perf || {};
    if (cat === 'cpu') return (pp.cpu || 0) >= (mp.cpu || 0);
    if (cat === 'gpu') {
      var target = mp.gpu || 0;
      if (!target) return true;
      var solo = pp.gpu || 0;
      if (solo >= target) return true;
      if (part.sliTag) {
        var pairEff = solo + Engine.Compat.pairFactor(part.sliTag) * solo;
        if (pairEff >= target) return true;
      }
      return false;
    }
    if (cat === 'ram' || cat === 'storage') {
      var key = cat === 'ram' ? 'ramMB' : 'storageGB';
      var need = mp[key] || 0;
      if (!need) return true;
      var per = pp[key] || 0;
      var cap = (slotCount != null && slotCount >= 1) ? slotCount : 4;
      return per * Math.min(cap, 16) >= need;
    }
    return true;   // psu/case/cooling/os/motherboard: no direct minPerf axis
  }

  Jobs.getBuildCatalog = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return { categories: {} };
    var job = g.job;
    var mobo = selectedMobo(job);
    var mp = job.build.minPerf || {};
    var categories = {};
    for (var c = 0; c < BUILD_CATS.length; c++) {
      var cat = BUILD_CATS[c];
      // §12.2: slotCount 0 = no board chosen yet (ram/gpu/storage); null = the
      // board has no slots data (UI feature-detects, falls back to selects).
      var slotCount = slotCountFor(cat, mobo);
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
          meets: catalogMeets(part, cat, mp, mobo, slotCount),   // §12.2 yellow state
          sliTag: part.sliTag || null, addonOnly: !!part.addonOnly,
          tasteMatch: tasteMatchesPart(job.taste, part)   // §9.2
        });
      }
      list.sort(function (a, b) { return a.price - b.price; });
      var sel = selArray(job.build, cat).slice();
      var padTo = (slotCount == null) ? Math.max(sel.length, 1) : slotCount;
      while (sel.length < padTo) sel.push(null);
      if (slotCount != null && sel.length > slotCount) sel.length = slotCount;
      categories[cat] = { slotCount: slotCount, selected: sel, options: list };
    }
    return { categories: categories };
  };

  Jobs.setBuildPart = function (state, jobId, category, partId, slotIndex) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return err(g.error);
    var job = g.job;
    if (job.build.committed) return err('Build already committed');
    if (BUILD_CATS.indexOf(category) === -1) return err('Unknown category: ' + category);
    var si = (slotIndex == null) ? 0 : Math.floor(Number(slotIndex));
    if (!isFinite(si) || si < 0) return err('Bad slot index');
    var mobo = selectedMobo(job);
    var cap = slotCountFor(category, mobo);
    if (si > 0) {   // slot 0 always works (backward compat: parts before board)
      if (MULTI_SLOT_CATS.indexOf(category) === -1)
        return err('Only one ' + category + ' slot');
      if (!mobo) return err('Choose a motherboard first');
      var lim = (cap == null) ? Engine.CONFIG.SLOT_DEFAULTS[category] : cap;
      if (si >= lim)
        return err('Board has only ' + lim + ' ' +
                   ({ ram: 'RAM slot', gpu: 'GPU slot', storage: 'storage connector' }[category]) +
                   (lim === 1 ? '' : 's'));
    }
    var arr = selArray(job.build, category);
    if (partId != null && partId !== '') {
      var part = Engine.partById(partId);
      if (!part || part.category !== category) return err('That part is not a ' + category);
      if (!purchasable(part, state)) return err(part.name + ' is not on the market');
      while (arr.length <= si) arr.push(null);
      arr[si] = part.id;
    } else {
      if (si < arr.length) arr[si] = null;
      trimTrailingNulls(arr);
    }
    // Board change: selections past the new board's capacity fall out.
    // (Clearing the board keeps picks — the old pick-parts-first flow.)
    if (category === 'motherboard') {
      var newMobo = selectedMobo(job);
      if (newMobo) {
        for (var m = 0; m < MULTI_SLOT_CATS.length; m++) {
          var mc = MULTI_SLOT_CATS[m];
          var mcCap = slotCountFor(mc, newMobo);
          var mcArr = selArray(job.build, mc);
          if (mcCap != null && mcArr.length > mcCap) mcArr.length = mcCap;
          trimTrailingNulls(mcArr);
        }
      }
    }
    job.build.validated = false;
    return { ok: true };
  };

  Jobs.validateBuild = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return { valid: false, problems: [g.error],
                          problemsInfo: [{ category: 'general', text: g.error }],
                          perf: {}, meetsTarget: false,
                          style: 0, partsCost: 0, budget: 0, underBudget: false };
    var job = g.job;
    var b = job.build;
    var flatIds = flattenBuildIds(b);   // §12.2 slot arrays -> flat id list
    var res = Engine.Compat.validatePartList(flatIds, {
      requireFull: true, minPerfGpu: b.minPerf ? b.minPerf.gpu : null,
      year: Engine.currentYear(state)
    });
    var partsCost = 0;
    for (var i = 0; i < flatIds.length; i++) {
      partsCost = Engine.round2(partsCost + P().priceOf(flatIds[i], state, { buy: true }));
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
      valid: res.valid, problems: res.problems,
      problemsInfo: res.problemsInfo || [],   // §12.2 UI contract: slot mapping
      perf: perf,
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
    var flatIds = flattenBuildIds(job.build);   // §12.2
    // Cost of parts not already in inventory
    var toBuy = [], cost = 0, i, part;
    for (i = 0; i < flatIds.length; i++) {
      part = Engine.partById(flatIds[i]);
      var inv = Engine.inventoryEntry(state, part.id);
      if (inv && inv.qty > 0 &&
          // count how many of this part are already claimed from stock in this build
          claimedSoFar(flatIds, i, part.id) < inv.qty) continue;
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
    for (i = 0; i < flatIds.length; i++) {
      part = Engine.partById(flatIds[i]);
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
    m *= Engine.certTimeMult(state, job.type);    // §13.4: trained procedures speed the bench
    // Soft workstation cap: beyond slots on the same day => +50% hours (§2.5)
    var slots = Engine.tierInfo(state).workstationSlots;
    var worked = state.workedToday || [];
    if (worked.indexOf(job.id) === -1 && worked.length >= slots)
      m *= C.SOFT_CAP_HOURS_MULT;
    return m;
  }

  // §10.1/§10.3/§11.6: standard-speed hours workable from the current step
  // until an unassigned install step ("assign") or a wait step ("wait").
  // §14.8: singleStep=true stops after the CURRENT step alone (mode "step").
  function workableStdHours(job, singleStep) {
    var total = 0, barrier = null;
    // §17.1: a pending decision blocks everything; an armed-but-unfired
    // approval/tuning plan blocks AT its marked step (fired in workJob).
    if (decisionPending(job)) return { hours: 0, barrier: 'decision' };
    var plan = job.decisionPlan;
    var planStep = (plan && !plan.fired &&
                    (plan.kind === 'approval' || plan.kind === 'tuning')) ?
                   plan.stepIndex : null;
    for (var i = job.stepIndex; i < job.steps.length; i++) {
      var st = job.steps[i];
      if (planStep != null && i >= planStep) { barrier = 'decision-plan'; break; }
      if (st.kind === 'wait') { barrier = 'wait'; break; }
      if (st.needIndex != null) {
        var nd = job.needs[st.needIndex];
        if (!nd || nd.filledPartIds.length < nd.qty) { barrier = 'assign'; break; }
      }
      total += st.hours * (1 - (st.progress || 0));
      if (singleStep) break;
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
      if (decisionPending(job)) break;   // §17.1: a fork just fired mid-session
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
        var np = Math.min(1, (st.hours * (st.progress || 0) + left) / st.hours);
        np = Math.round(np * 1000) / 1000;
        left = 0;
        // Rounding to 3 decimals can land on 1.0 with a sliver of work left —
        // treat that as complete, or the step wedges at "100%, not done".
        if (np >= 1) finishStep(state, job, st);
        else st.progress = np;
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

  /* §14.8: work modes (rules live entirely here — UI computes none).
   * `amount` is either a quantized number of hours, or one of the string
   * modes "step" (work until the CURRENT step completes) / "job" (work to
   * completion); omitted/null defaults to "job" (unchanged back-compat: a
   * bare workJob(jobId) still means finish-job). Returns the same
   * {ok, hoursSpent, completed, result?} shape regardless of mode. */
  function parseWorkAmount(amount) {
    if (amount == null) return { mode: 'job', want: null };
    if (typeof amount === 'string')
      return { mode: (amount === 'step') ? 'step' : 'job', want: null };
    return { mode: 'number', want: Engine.round1(Math.max(0, Number(amount) || 0)) };
  }

  Jobs.workJob = function (state, jobId, amount) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    if (job.status === 'done') return err('Already finished — sell it');
    var problem = readinessProblem(state, job);
    if (problem) return err(problem);
    var avail = Engine.hoursAvailable(state);      // includes overtime room (§9.4)
    // §14.8: the smallest unit of work is one 0.1h (6-min) tick.
    if (avail < 0.1 - 1e-9) return err('Too exhausted — call it a day');
    var wa = parseWorkAmount(amount);

    var C = CFG();
    var equip = Engine.equipEffects(state);
    // CRT safety: working a CRT job without the discharge kit risks injury (§5.5)
    if (job.crt && !equip.crtSafe && Engine.chance(C.MISHAP_CRT, 'misc')) {
      var year = Engine.currentYear(state);
      var medical = Engine.round2(Engine.laborRate(year) * C.CRT_MEDICAL_LABOR_HOURS);
      var covered = state.shop.insurance ? Engine.round2(medical * C.INSURANCE_COVER) : 0;
      Engine.addCash(state, -(medical - covered));
      Engine.ledgerAdd(state, 'other', medical - covered);
      state.hoursLeft = 0;
      state.injuryDaysLeft = C.INJURY_DAYS;
      Engine.recordAchievementEvent(state, 'crt-injury');   // §15.5 hidden badge
      Engine.pushNews(state, 'mishap', 'CRT discharge injury!',
        'The tube bit back. Medical bill ' + Engine.fmtMoney(medical) +
        (covered ? ' (insurance covered ' + Engine.fmtMoney(covered) + ')' : '') +
        '. You will lose the next ' + C.INJURY_DAYS + ' days.');
      // UI contract: mishap:true lets the UI play its mishap sound
      return { ok: true, hoursSpent: 0, completed: false, mishap: true, mishapKind: 'crt' };
    }

    Jobs.ensureSteps(state, job);   // migrated saves get a checklist lazily
    var m = effectiveMult(state, job);
    var singleStep = wa.mode === 'step';
    // §10.1/§10.3/§11.6: work runs the checklist; barriers are unassigned
    // install steps ("assign") and wait steps ("wait"). §14.8: "step" mode
    // only ever looks at the CURRENT step, so it stops at its boundary.
    var wk = workableStdHours(job, singleStep);
    if (wk.hours <= 1e-9 && wk.barrier !== 'assign' &&
        job.stepIndex < job.steps.length) {
      // Self-heal (pre-fix saves): a fully-worked labor step stranded at
      // progress 1 without completing leaves the checklist wedged. Zero
      // workable hours with no assign barrier means every labor step up to
      // the next wait (or the end) is effectively done — finish them.
      while (job.stepIndex < job.steps.length &&
             job.steps[job.stepIndex].kind !== 'wait') {
        finishStep(state, job, job.steps[job.stepIndex]);
      }
      recomputeHours(job);
      if (jobFinished(job) && job.status !== 'done') {
        var healResult = completeJob(state, job);
        return { ok: true, hoursSpent: 0, completed: true, result: healResult };
      }
      wk = workableStdHours(job, singleStep);   // a diag hook may have appended labor steps
    }
    if (wk.hours <= 1e-9) {
      // §17.1: decisions gate the bench readably
      if (wk.barrier === 'decision')
        return err('Waiting on your decision — pick an option on the job card');
      if (wk.barrier === 'decision-plan') {
        // The work has reached the marked step — surface the moment now.
        var dplan = job.decisionPlan;
        if (dplan.kind === 'approval') fireApprovalDecision(state, job);
        else if (dplan.kind === 'tuning') fireTuningDecision(state, job);
        if (decisionPending(job)) {
          return { ok: true, hoursSpent: 0, completed: false,
                   decisionPending: true,
                   decisionPrompt: job.decision.prompt || null };
        }
        // plan couldn't fire (no text/etc.) — disarm and continue next call
        job.decisionPlan = null;
        return { ok: true, hoursSpent: 0, completed: false };
      }
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
    // §14.8: "number" and "step" requests may dip into overtime to hit their
    // target (a number explicitly asks for it; "step" needs to reach its
    // boundary); the default "job" mode keeps the old small-dip-only budget.
    var want, budget;
    if (wa.mode === 'number') { want = wa.want; budget = avail; }
    else if (wa.mode === 'step') { want = remainingEff; budget = avail; }
    else { want = remainingEff; budget = Math.max(state.hoursLeft, Math.min(avail, 0.1)); }
    var spend = Math.min(budget, want, remainingEff);
    spend = Math.ceil(spend * 10 - 1e-9) / 10;            // §14.8: 0.1h-tick granularity
    spend = Math.min(spend, avail);
    spend = Engine.round1(spend);
    if (spend < 0.1 - 1e-9) return err('Not enough time for a work session');

    state.hoursLeft = Engine.round1(state.hoursLeft - spend);
    // §15.5: hitting the overtime floor exactly is achievement-worthy
    if (state.hoursLeft <= -C.overtimeCap + 1e-9)
      Engine.recordAchievementEvent(state, 'overtime-floor');
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

  function avgReliabilityFactor(state, job) {
    var used = job.partsUsed || [];
    if (!used.length) return 1;
    var sum = 0, n = 0;
    for (var i = 0; i < used.length; i++) {
      var p = Engine.partById(used[i].partId);
      if (p && p.reliability) { sum += p.reliability; n++; }
    }
    if (!n) return 1;
    // §13.4: certification training nudges effective reliability up (fewer comebacks)
    var avg = Math.min(100, sum / n + Engine.certReliabilityBonus(state));
    var f = Math.pow(100 / Math.max(1, avg), 2);
    return Math.min(CFG().CALLBACK_RELIABILITY_CAP, f);
  }

  function completeJob(state, job) {
    var C = CFG();
    var notes = [];
    var reasons = [];        // §17.2: short tags explaining the rating outcome
    var qualityFlags = [];   // §14.2: [{partId, kind, origPerfLabel, newPerfLabel}]
    var payout = 0;
    var year = Engine.currentYear(state);
    var speed = C.SPEED[job.speed] || C.SPEED.standard;

    // Refurb: becomes "ready to sell", no payout yet
    if (job.type === 'refurb') {
      job.status = 'done';
      job.machine.condition = Engine.round2(
        Engine.uniform(C.REFURB_COND_MIN, C.REFURB_COND_MAX, 'market'));
      job.result = { onTime: true, score: null, payout: 0,
                     notes: ['Machine repaired — ready to sell'] };
      Engine.pushNews(state, 'job', 'Refurb ready: ' + job.machine.name,
        'Bench-tested and ready for a buyer.');
      return job.result;
    }

    var score = 5.0 + speed.scoreDelta;
    if (job.speed === 'quick') reasons.push('quick work');           // §17.2
    else if (job.speed === 'meticulous') reasons.push('meticulous work');
    var drFailed = false;

    if (job.type === 'data_recovery') {
      var owned = Engine.equipEffects(state).drTier;
      var chance = C.DR_BASE + C.DR_PER_TIER * owned
                 - 0.15 * Math.max(0, (job.drTier || 1) - owned)
                 + (job.speed === 'quick' ? C.DR_QUICK : 0)
                 + (job.speed === 'meticulous' ? C.DR_MET : 0);
      chance = Engine.clamp(chance, C.DR_MIN, C.DR_MAX);
      if (!Engine.chance(chance, 'misc')) {
        drFailed = true;
        score = C.SCORE_DR_FAIL;
        reasons.push('data unrecoverable');
        notes.push('Data unrecoverable — no charge');
        Engine.pushNews(state, 'job', 'Data recovery failed',
          'Some platters keep their secrets. The customer left empty-handed.');
      }
    }

    var tasteMatched = false;
    if (!drFailed) {
      payout = job.pay || 0;
      // §13.4: certification pay bonus (trained expertise commands better rates)
      var certPM = Engine.certPayMult(state, job.type, tasteCategoryFor(job));
      if (certPM !== 1 && payout > 0) {
        var beforeCertPay = payout;
        payout = Engine.round2(payout * certPM);
        notes.push('Certified expertise: +' + Engine.fmtMoney(payout - beforeCertPay));
      }
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
          reasons.push('taste matched');
          notes.push(job.taste.label + ' — delighted! +' + job.taste.bonusPct +
                     '% (' + Engine.fmtMoney(payout - before) + ')');
        }
      }
      // §17.1: decision outcomes shape the rating
      if (job.tuningChoice) {
        var tc = C.TUNING[job.tuningChoice];
        if (job.tuningUnstable) {
          score -= C.TUNING_UNSTABLE_SCORE;
          notes.push('The ' + job.tuningChoice + ' tune didn’t hold — backed off and redone');
          reasons.push('unstable overclock');
        } else if (tc && tc.scoreBonus) {
          score += tc.scoreBonus;
          notes.push('The ' + job.tuningChoice + ' tune holds beautifully');
          reasons.push(job.tuningChoice + ' tune held');
        }
      }
      if (job.approvalDelight) {
        score += C.APPROVAL_DELIGHT_SCORE;
        notes.push('“Glad you caught that before it blew.”');
        reasons.push('caught a problem early');
      }
      if (job.approvalRefused)
        notes.push('Customer declined the add-on — noted on the ticket');
      if (job.approvalSkipped)
        notes.push('You left the discovered problem alone — hope it holds');
      if (job.decisionTaken && job.decisionTaken.kind === 'fork' &&
          job.decisionTaken.option === 'patch') {
        notes.push('Patched rather than replaced — cheaper today, riskier tomorrow');
        reasons.push('quick patch');
      }
      // §14.2: symmetric "did the shop do right by the part?" check for
      // repair/upgrade/device_repair — downgrade (installed something worse
      // than the original) and graded overspend (installed something far
      // pricier), never both on the same part. Only categories with a real
      // class-defining numeric metric (cpu/ram/storage/gpu) get a downgrade
      // verdict or the "ideal" tag; everything else only ever gets overspend
      // (which is price-based, not metric-based).
      if (job.type === 'repair' || job.type === 'upgrade' || job.type === 'device_repair') {
        for (var qv = 0; qv < job.needs.length; qv++) {
          var qNd = job.needs[qv];
          if (!qNd.originalPartId || !qNd.filledPartIds.length) continue;
          var qOrig = Engine.partById(qNd.originalPartId);
          if (!qOrig) continue;
          var qUsedList = job.partsUsed || [];
          var qUsed = null;
          for (var qu = 0; qu < qUsedList.length; qu++) {
            var qe = qUsedList[qu];
            if (qe.needIndex != null && qe.needIndex !== qv) continue;
            if (qNd.filledPartIds.indexOf(qe.partId) === -1) continue;
            qUsed = qe; break;
          }
          if (!qUsed) continue;
          var qNewPart = Engine.partById(qUsed.partId);
          if (!qNewPart) continue;

          var qKey = perfKeyForCategory(qNd.category);
          var qOrigVal = P().priceOf(qOrig, state);
          var qOrigMetric = qKey != null ? ((qOrig.perf || {})[qKey] || 0) : null;
          var qNewMetric = qKey != null ? ((qNewPart.perf || {})[qKey] || 0) : null;
          var qOrigLabel = qKey != null ? fmtPerfReq(qKey, qOrigMetric) : Engine.fmtMoney(qOrigVal);
          var qNewLabel = qKey != null ? fmtPerfReq(qKey, qNewMetric) : Engine.fmtMoney(qUsed.price);

          // Downgrade: repair only (an upgrade's minPerf already hard-gates
          // below-original commits, §14.1). The FLAG reflects the objective
          // metric comparison regardless of waiver (a budget-conscious ask
          // still genuinely got a smaller/slower part — it's just not dinged
          // for it); labor-only faults never reach here (no need was ever
          // created), so that waiver is automatic and needs no check here.
          var qIsDowngrade = job.type === 'repair' && qKey != null && qNewMetric < qOrigMetric;

          if (qIsDowngrade) {
            if (!job.budgetAsk) {
              score -= C.DOWNGRADE_SCORE;
              reasons.push('downgrade part');
              notes.push('"The replacement ' + qNd.category +
                         ' is smaller/slower than what we had..."');
            }
            qualityFlags.push({ partId: qNewPart.id, kind: 'downgrade',
                                 origPerfLabel: qOrigLabel, newPerfLabel: qNewLabel });
            continue;   // never both a downgrade AND an overspend ding on one part
          }

          // Overspend (graded): mild 1.75-2.5x original, hard beyond that. The
          // FLAG reflects the objective price band regardless of waiver (so
          // the UI can still show a "waived" tooltip); the score/note ding
          // itself is waived when the part matches a customer taste (fanboys)
          // or the job type is enthusiast.
          var qThresh = Math.max(C.OVERSPEND_MULT * qOrigVal,
                                 qOrigVal + Engine.laborRate(year));
          var qHardThresh = Math.max(C.OVERSPEND_HARD_MULT * qOrigVal,
                                     qOrigVal + Engine.laborRate(year));
          var qOverspent = qUsed.price > qThresh;
          if (qOverspent) {
            var qHard = qUsed.price > qHardThresh;
            var qWaived = job.type === 'enthusiast' || tasteMatchesPart(job.taste, qNewPart);
            if (!qWaived) {
              score -= qHard ? C.OVERSPEND_SCORE_HARD : C.OVERSPEND_SCORE_MILD;
              reasons.push(qHard ? 'overspent hard on a part' : 'a bit pricey on a part');
              notes.push(qHard ?
                ('"Did it really need a ' + Engine.fmtMoney(qUsed.price) +
                 ' part? The old one was worth ' + Engine.fmtMoney(qOrigVal) + '..."') :
                ('"A bit pricey — ' + Engine.fmtMoney(qUsed.price) +
                 ' for what was a ' + Engine.fmtMoney(qOrigVal) + ' part."'));
            }
            qualityFlags.push({ partId: qNewPart.id,
                                 kind: qHard ? 'overspend-hard' : 'overspend-mild',
                                 origPerfLabel: qOrigLabel, newPerfLabel: qNewLabel });
          } else if (qKey != null) {
            qualityFlags.push({ partId: qNewPart.id, kind: 'ideal',
                                 origPerfLabel: qOrigLabel, newPerfLabel: qNewLabel });
          }
        }
      }
      if (isBuildJob(job) && job.build) {
        // Build pay = budget; bonuses for overdelivering (§5.5)
        var mp = job.build.minPerf || {};
        var v = Engine.Compat.validatePartList(flattenBuildIds(job.build), {
          requireFull: true, minPerfGpu: mp.gpu, year: year });
        var ratio = 99;
        if (mp.cpu > 0) ratio = Math.min(ratio, v.perf.cpu / mp.cpu);
        if (mp.gpu > 0) ratio = Math.min(ratio, v.perf.gpu / mp.gpu);
        if (mp.ramMB > 0) ratio = Math.min(ratio, v.perf.ramMB / mp.ramMB);
        if (mp.storageGB > 0) ratio = Math.min(ratio, v.perf.storageGB / mp.storageGB);
        if (ratio >= C.BUILD_PERF_BONUS_AT) { score += C.BUILD_PERF_BONUS; notes.push('Overdelivered on performance'); reasons.push('overdelivered performance'); }
        var spentOnParts = 0;
        for (var b = 0; b < (job.partsUsed || []).length; b++)
          spentOnParts += job.partsUsed[b].price;
        if (job.build.budget > 0 && spentOnParts <= job.build.budget * C.BUILD_BUDGET_BONUS_AT) {
          score += C.BUILD_BUDGET_BONUS; notes.push('Came in well under budget'); reasons.push('under budget');
        }
        Engine.pushNews(state, 'job', 'Custom build delivered',
          job.title + ' — ' + Engine.fmtMoney(payout));
        state.ledger.lifetime.buildsDelivered++;
      }
      // §12.4: device repair parts are sourced outside the catalog — the
      // expense lands as a cost line when the work wraps up.
      if (job.type === 'device_repair' && job.devicePartsCost > 0) {
        Engine.addCash(state, -job.devicePartsCost);
        Engine.ledgerAdd(state, 'partsCost', job.devicePartsCost);
        notes.push('Parts & materials: -' + Engine.fmtMoney(job.devicePartsCost));
      }
      if (payout > 0) {
        Engine.addCash(state, payout);
        Engine.ledgerAdd(state, 'revenue', payout);
      }
    }

    if (job.units > 1) job.unitsDone = job.units;
    score = Engine.clamp(score, 0, 5);
    if (!reasons.length) reasons.push('solid work');
    var ratingBefore = state.reputation.rating;                       // §17.2
    Engine.pushScore(state, score, { jobId: job.id, title: job.title,
                                     reasons: reasons });
    var ratingDelta = Engine.round2(state.reputation.rating - ratingBefore);
    state.reputation.jobsCompleted++;
    state.ledger.lifetime.jobsCompleted++;

    // §15.4: satisfied customers become regulars (score >= 4)
    rememberRegular(state, job, score);
    // §15.5: achievement event hooks tied to completion shapes
    if (job.type === 'device_repair')
      Engine.recordAchievementEvent(state, 'device-repair');
    if (isBuildJob(job) && job.build) {
      var gpuIds = (job.build.parts && job.build.parts.gpu || [])
        .filter(function (id) { return id != null; });
      var tagCounts = {}, sawPair = false;
      for (var gi = 0; gi < gpuIds.length; gi++) {
        var gp = Engine.partById(gpuIds[gi]);
        if (gp && gp.sliTag) {
          tagCounts[gp.sliTag] = (tagCounts[gp.sliTag] || 0) + 1;
          if (tagCounts[gp.sliTag] >= 2) sawPair = true;
        }
      }
      if (sawPair) Engine.recordAchievementEvent(state, 'sli-build');
    }

    // Warranty callback roll — §10.2 risk matrix: base + perDiff x difficulty
    // (ESD setup softens the difficulty term), x reliability x test-bench.
    if (job.type !== 'callback' && !drFailed) {
      var mtx = C.CALLBACK_MATRIX[job.speed] || C.CALLBACK_MATRIX.standard;
      var esdTerm = Engine.equipmentOwned(state, 'esd-setup') ? C.ESD_DIFF_TERM_MULT : 1;
      var cb = (mtx.base + mtx.perDiff * (job.difficulty || 2) * esdTerm) *
               avgReliabilityFactor(state, job) *
               Engine.equipEffects(state).callbackMult *
               Engine.certCallbackMult(state) *  // §13.4
               (job.callbackRiskMult || 1);      // §17.1 patch/skip risk
      cb = Engine.clamp(cb, C.CALLBACK_MIN, C.CALLBACK_MAX);
      var fired = Engine.chance(cb, 'misc');
      state.jobs.completedRecent.push({
        jobId: job.id, title: job.title, day: state.day,
        callbackRolledDay: fired ?
          state.day + Engine.randInt(C.CALLBACK_DELAY_MIN, C.CALLBACK_DELAY_MAX, 'misc') : null,
        callbackChance: Engine.round2(cb * 1000) / 1000,
        fired: fired,
        origHours: job.hoursRequired
      });
    }

    job.status = 'done';
    job.result = { onTime: job.deadlineDay == null || state.day <= job.deadlineDay,
                   score: score, payout: payout, notes: notes,
                   tasteMatched: tasteMatched, qualityFlags: qualityFlags,
                   ratingDelta: ratingDelta };   // §17.2
    removeFrom(state.jobs.active, job);
    return job.result;
  }
  Jobs.completeJob = completeJob;

  /* §15.4: shared fail bookkeeping — regulars fail HARSHER (extra score
   * reduction), account-job fails count toward the account's monthly cancel
   * threshold, and contract fails feed the §15.2 contractsFailed counter. */
  function recordJobFailure(state, job, baseFailScore, reason) {
    var C = CFG();
    var score = baseFailScore;
    var reasons = [reason || 'failed'];
    if (job.regular) { score = Math.max(0, score - C.REGULAR_FAIL_EXTRA);
                       reasons.push('let a regular down'); }
    var ratingBefore = state.reputation.rating;
    Engine.pushScore(state, score, { jobId: job.id, title: job.title,
                                     reasons: reasons });
    Jobs._lastFailRatingDelta = Engine.round2(state.reputation.rating - ratingBefore);
    state.reputation.jobsFailed++;
    state.ledger.lifetime.jobsFailed++;
    if (job.type === 'contract') {
      state.ledger.lifetime.contractsFailed =
        (state.ledger.lifetime.contractsFailed || 0) + 1;
    }
    if (job.accountId && Array.isArray(state.accounts)) {
      for (var i = 0; i < state.accounts.length; i++) {
        if (state.accounts[i].id === job.accountId) {
          state.accounts[i].failsThisMonth = (state.accounts[i].failsThisMonth || 0) + 1;
          break;
        }
      }
    }
    return score;
  }
  Jobs.recordJobFailure = recordJobFailure;

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
    recordJobFailure(state, job, CFG().SCORE_ABANDON, 'abandoned');   // §15.4/§17.2
    Engine.pushNews(state, 'job', 'Job abandoned: ' + job.title,
      job.customer.name + ' will not be recommending the shop.');
    return { ok: true, ratingDelta: Jobs._lastFailRatingDelta };
  };

  // Deadline sweep + offer expiry (overnight step 4)
  Jobs.deadlineSweep = function (state, summary) {
    var C = CFG();
    var i, job;
    for (i = state.jobs.active.length - 1; i >= 0; i--) {
      job = state.jobs.active[i];
      if (job.deadlineDay != null && state.day > job.deadlineDay && job.status === 'active') {
        state.jobs.active.splice(i, 1);
        var failScore = recordJobFailure(state, job, C.SCORE_LATE, 'late');   // §15.4
        job.status = 'done';
        job.result = { onTime: false, score: failScore, payout: 0,
                       ratingDelta: Jobs._lastFailRatingDelta,   // §17.2
                       notes: job.regular ?
                         ['Missed the deadline', 'A loyal regular, let down'] :
                         ['Missed the deadline'] };
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
          hoursRequired: Math.max(0.5, Engine.round1((e.origHours || 2) * C.CALLBACK_HOURS_FRACTION)),
          hoursDone: 0,
          steps: [], stepIndex: 0,
          diagnosed: true, needsDiagnosis: false,
          fault: null, needs: [], build: null,
          units: 1, unitsDone: 0, machine: null, peripheral: null,
          device: null, deviceModern: false, devicePartsCost: 0, devicePayBase: null,
          drTier: 0, crt: false,
          taste: null, result: null
        };
        assembleSteps(state, job);   // §10.1 (callback template or fallback)
        state.jobs.active.push(job);      // auto-accepted, pay 0
        state.reputation.callbacks++;
        Engine.pushScore(state, C.CALLBACK_ARRIVAL_SCORE,
          { title: 'Callback: ' + e.title, reasons: ['warranty callback'] });  // rep ding on arrival
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
    var built = assembleMachineParts(state, 'market');   // §17.5
    if (!built) return null;
    var partIds = built.partIds, mobo = built.mobo;
    // §9.6: dealers keep machines above the era's build-budget class for
    // themselves — downgrade the box under the cap instead of discarding it
    // (the v0.4b catalog made over-cap assemblies the MAJORITY in modern
    // eras, which starved the as-is market to empty).
    var blNow = Engine.baselineFor(year);
    var cap = blNow.buildBudget * C.ASIS_MAX_VALUE_BB_MULT;
    if (!downvalueMachine(state, partIds, mobo, cap)) return null; // true big iron
    // Fault: usually one dead part (never the board — replacements must fit it)
    var faultIdx = null;
    if (Engine.chance(0.75, 'market')) {
      var faultable = [];
      for (var i = 1; i < partIds.length; i++) {
        var fp = Engine.partById(partIds[i]);
        if (fp && ['cpu', 'ram', 'storage', 'gpu', 'psu'].indexOf(fp.category) !== -1)
          faultable.push(i);
      }
      if (faultable.length) faultIdx = Engine.pick(faultable, 'market');
    }
    var hints = {
      cpu: 'halts at POST', ram: 'beeping at boot', storage: 'drive grinds horribly',
      gpu: 'no video on boot', psu: 'completely dead', none: 'just needs some love'
    };
    var faultCat = faultIdx != null ? Engine.partById(partIds[faultIdx]).category : 'none';
    var adjective = Engine.pick((FLAVOR().machineAdjectives || ['dusty']), 'market') || 'dusty';
    var machineYear = Engine.clamp(
      Engine.randInt(mobo.introYear, Math.min(year, (mobo.eolYear || year) + 2), 'market'),
      mobo.introYear, year);
    var value = machinePartsValue(state, { partIds: partIds });
    // Dealers price big iron closer to its real worth, and machines that
    // "just need some love" cost extra — flattens flip margins (§9.6).
    var span = C.ASIS_ASK_MAX - C.ASIS_ASK_MIN;
    var bl = Engine.baselineFor(year);
    var sizeT = Engine.clamp(value / Math.max(1, bl.buildBudget), 0, 1);
    var frac = C.ASIS_ASK_MIN + span * (0.35 * Engine.rand('market') + 0.65 * sizeT);
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
      if (Engine.chance(C.ASIS_CHURN, 'market')) state.asIsMarket.splice(i, 1);
    }
    if (state.asIsMarket.length < C.ASIS_MAX && Engine.chance(C.ASIS_ARRIVAL_CHANCE, 'market')) {
      var m = generateMachine(state);
      if (m) state.asIsMarket.push(m);
    }
  };

  // Initial stock at newGame.
  Jobs.seedAsIsMarket = function (state) {
    var C = CFG();
    var n = Engine.randInt(C.ASIS_START_MIN, C.ASIS_START_MAX, 'market');
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
    var stripHours = Engine.round1(Math.max(0.25,             // §14.8: 0.1h grid
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
      if (isFaulty || !Engine.chance(survival, 'misc')) {
        lost.push(pid);
        continue;
      }
      Engine.inventoryAdd(state, pid, 1, 0);   // salvage carries no cost basis
      recovered.push(pid);
    }
    removeFrom(state.jobs.active, job);
    Engine.recordAchievementEvent(state, 'strip');   // §15.5
    Engine.pushNews(state, 'job', 'Stripped for parts: ' + job.machine.name,
      recovered.length + ' part' + (recovered.length === 1 ? '' : 's') +
      ' recovered into inventory' +
      (lost.length ? ', ' + lost.length + ' lost' : '') + '.');
    return { ok: true, recovered: recovered, lost: lost, hoursSpent: stripHours };
  };

  // §14.3 used-market saturation: each recent refurb sale (within a rolling
  // window) depresses the parts-value share of the NEXT sale's proceeds,
  // recency-weighted (a fresh sale hurts most, decaying to nothing at the
  // window edge) and capped — diminishing returns for flooding the local
  // used market, not a hard ban on repeat flips.
  function refurbSaturationMult(state, C) {
    var log = state.market.refurbLog;
    if (!log || !log.length) return 1;
    var window = C.REFURB_SAT_WINDOW_DAYS;
    var total = 0;
    for (var i = 0; i < log.length; i++) {
      var age = state.day - log[i].day;
      if (age < 0 || age > window) continue;
      total += C.REFURB_SAT_PER_SALE * (1 - age / window);
    }
    total = Math.min(C.REFURB_SAT_MAX, total);
    return 1 - total;
  }
  Jobs.refurbSaturationMult = refurbSaturationMult;

  function refurbEstimate(state, job) {
    var C = CFG();
    var cond = (job.machine && job.machine.condition != null) ? job.machine.condition : 1.0;
    var year = Engine.currentYear(state);
    var sat = refurbSaturationMult(state, C);   // §14.3: recent-sales market glut
    return Engine.round2(machinePartsValue(state, job.machine) * C.REFURB_SALE_RATIO * cond * sat +
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
    var C = CFG();
    // §14.3: widen actual outcome variance around the appraised estimate —
    // real flip risk; some sales underperform, the best ones stay lucrative.
    var base = refurbEstimate(state, job);
    var price = Math.max(0, Engine.round2(
      base * Engine.uniform(1 - C.REFURB_VARIANCE_SPREAD, 1 + C.REFURB_VARIANCE_SPREAD, 'market')));
    Engine.addCash(state, price);
    Engine.ledgerAdd(state, 'revenue', price);
    state.ledger.lifetime.refurbsSold++;
    // Log this sale for the saturation window (pruned to keep it bounded).
    state.market.refurbLog = state.market.refurbLog || [];
    state.market.refurbLog.push({ day: state.day });
    var satCutoff = state.day - C.REFURB_SAT_WINDOW_DAYS * 2;
    state.market.refurbLog = state.market.refurbLog.filter(function (e) {
      return e.day >= satCutoff;
    });
    job.status = 'sold';
    removeFrom(state.jobs.active, job);
    Engine.pushNews(state, 'money', 'Refurb sold: ' + job.machine.name,
      'Out the door for ' + Engine.fmtMoney(price) + ' (paid ' +
      Engine.fmtMoney(job.machine.boughtFor) + ').');
    return { ok: true, price: price };
  };
})(typeof window !== 'undefined' ? window : globalThis);
