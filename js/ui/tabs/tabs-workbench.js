/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-workbench.js (§17.3 split)
 * The Workbench tab: job cards, §10.1 step checklists, §10.3 assign/unassign
 * needs picker, §12.5 build schematic + slot picker, §14.8 graduated work
 * controls, §16.1 sub-tab pills, the As-Is market (under Shop Projects).
 * Moved verbatim from the tabs.js monolith — zero behavior change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox, fmtHours = S.fmtHours,
      catLabel = S.catLabel, prettySubtype = S.prettySubtype,
      SUBTYPE_LABELS = S.SUBTYPE_LABELS, SPEED_TIP = S.SPEED_TIP,
      has = S.has, engineAtLeast = S.engineAtLeast, otCapValue = S.otCapValue,
      overspendKind = S.overspendKind, overspendPrefix = S.overspendPrefix,
      overspendChipHTML = S.overspendChipHTML, vsOriginalOf = S.vsOriginalOf,
      vsOriginalText = S.vsOriginalText, vsOriginalHTML = S.vsOriginalHTML,
      typeChip = S.typeChip, tasteChip = S.tasteChip, customerLine = S.customerLine,
      dueText = S.dueText, osChip = S.osChip, regularChip = S.regularChip,
      perfStr = S.perfStr, showPartInfo = S.showPartInfo,
      animatedBar = S.animatedBar, shortTitle = S.shortTitle, blurbHTML = S.blurbHTML;

  /* §21.4 — a client-machine job (job.clientMachineId set) is a returning
   * client's own box, not a fresh random machine: note it plainly. The
   * "serviced it N times" count is feature-detected across the likely field
   * names the job view might carry it under; absent any of them, the note
   * still renders (just without the count) rather than disappearing. */
  function clientMachineNoteHTML(j) {
    if (!j || j.clientMachineId === undefined || j.clientMachineId === null) return '';
    var n = j.clientMachineServiceCount !== undefined ? j.clientMachineServiceCount
      : (j.machineServiceCount !== undefined ? j.machineServiceCount
        : (j.timesServiced !== undefined ? j.timesServiced : null));
    var nNum = Number(n);
    var nTxt = (n !== null && isFinite(nNum) && nNum > 0)
      ? ' — you’ve serviced it ' + nNum + ' time' + (nNum === 1 ? '' : 's')
      : '';
    return '<div class="meta-row"><span class="chip chip-client" title="This is a returning client’s own machine — the shop remembers its parts across visits">' +
      '🔧 Their usual machine' + esc(nTxt) + '</span></div>';
  }

  /* ------------------------------------------------------------------ *
   * Work-control helpers (§14.8)
   * ------------------------------------------------------------------ */

  /** Shared post-work-call reporting: the "assign a part first" nudge plus
   * the completion/progress toast. Used by every graduated work control
   * (§14.8 Tinker / Finish Step / Work 1 Hour / Finish Job). */
  function reportWorkResult(jobId, r) {
    /* §10.3 — engine blocks install steps whose need is unassigned; lead
     * the player straight to the picker. */
    if (r && r.ok === false && /assign/i.test(r.error || '')) {
      var box = document.getElementById('needs-' + jobId);
      if (box) {
        box.classList.add('attention');
        try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (esc1) { /* ignore */ }
      }
    }
    if (r && r.ok !== false) {
      /* §17.1 — a mid-job discovery/tuning moment just fired: surface it
       * loudly; the amber decision card renders on the refresh. */
      if (r.decisionPending) {
        UI.toast('📞 ' + (r.decisionPrompt || 'Something turned up — there is a decision waiting on the job card'), 'info', 7000);
        if (UI.audio && UI.audio.sfx) UI.audio.sfx('callback');
        return;
      }
      if (r.completed) {
        var res = r.result || {};
        var msg = 'Job finished';
        if (res.payout) msg += ' — paid ' + fm(res.payout);
        if (res.score !== null && res.score !== undefined) msg += ' • score ' + Number(res.score).toFixed(1) + '/5';
        if (res.onTime === false) msg += ' • LATE';
        if (res.notes) msg += ' • ' + (Array.isArray(res.notes) ? res.notes.join(' • ') : res.notes);
        UI.toast(msg, 'success', 6500);
        if (UI.audio && UI.audio.sfx && !res.payout) UI.audio.sfx('complete');
        /* §17.2 — the ★ delta float itself comes from UI.act's rating diff
         * (workGraduated mirrors it), so every completion path is covered. */
      } else if (r.hoursSpent) {
        UI.toast('Worked ' + fmtHours(r.hoursSpent) + 'h', 'info', 1600);
      }
    }
  }

  function workAndReport(jobId, hours) {
    var rectBefore = cardRectOf(jobId);   /* §19.9 #8 */
    var r = UI.act(function () {
      return (hours === null || hours === undefined) ? Engine.workJob(jobId) : Engine.workJob(jobId, hours);
    });
    /* §20.4 #5 — a completion that only shelves a machine (refurb/stock
     * build) isn't "done" yet; that flash now plays on the eventual sale. */
    if (r && r.ok !== false && r.completed && !jobShelvesMachine(jobId)) spawnDoneGhost(rectBefore);
    reportWorkResult(jobId, r);
  }

  /** §14.8 — graduated work controls (Tinker 6min / Finish Step / Work 1
   * Hour / Finish Job). Numeric modes are always supported. String modes
   * ("step"/"job") ask the engine to work exactly the current step, or the
   * whole remaining job; an engine that does not understand them yet is
   * feature-detected (the call comes back {ok:false}) and falls back to an
   * equivalent numeric call computed here, so the button does the right
   * thing either way. */
  function workGraduated(jobId, mode) {
    if (typeof mode === 'number') { workAndReport(jobId, mode); return; }

    var rectBefore = cardRectOf(jobId);   /* §19.9 #8 */
    var before = null;
    if (UI.engineReady()) {
      try {
        var st0 = Engine.getState();
        if (st0) before = {
          cash: Number(st0.cash) || 0,
          hours: Number(st0.hoursLeft) || 0,
          rating: st0.reputation ? (Number(st0.reputation.rating) || 0) : null  // §17.2
        };
      } catch (e) { /* ignore */ }
    }
    var r = UI.tryCall(function () { return Engine.workJob(jobId, mode); });
    if (!r || r.ok === false) {
      if (mode === 'step') {
        var remH = currentStepRemainingHours(activeJobById(jobId));
        r = UI.tryCall(function () {
          return (remH === null) ? Engine.workJob(jobId) : Engine.workJob(jobId, remH);
        });
      } else { // 'job' — old engines' "no hours arg" already means "as much as useful & available"
        r = UI.tryCall(function () { return Engine.workJob(jobId); });
      }
    }
    if (r && r.ok !== false && before) {
      try {
        var st1 = Engine.getState();
        if (st1) {
          var dc = Math.round(((Number(st1.cash) || 0) - before.cash) * 100) / 100;
          var dh = Math.round(((Number(st1.hoursLeft) || 0) - before.hours) * 100) / 100;
          var drt = (before.rating !== null && st1.reputation)
            ? Math.round(((Number(st1.reputation.rating) || 0) - before.rating) * 100) / 100 : 0;  // §17.2
          UI.feedback(dc, dh, drt);
        }
      } catch (e2) { /* ignore */ }
    }
    UI.api(r); // toast on {ok:false}, refresh on success — mirrors UI.act's own tail
    /* §20.4 #5 — suppress the ghost when this completion only shelves a
     * machine (refurb/stock build); it plays on the sale instead. */
    if (r && r.ok !== false && r.completed && !jobShelvesMachine(jobId)) spawnDoneGhost(rectBefore);   /* §19.9 #8 */
    reportWorkResult(jobId, r);
  }

  /* ================================================================== *
   * TAB: Workbench (active jobs + as-is market)
   * ================================================================== */

  /* §16.1 — workbench sub-tab classification. Pills are LENSES over the
   * same job list (a job may appear under several); Active is the default
   * catch-all view, so nothing is ever unreachable. */
  var WB_CUSTOMER_TYPES = ['repair', 'upgrade', 'software', 'cleaning', 'peripheral', 'data_recovery', 'device_repair'];
  function wbHasUnassignedNeed(j) {
    if (!j || !Array.isArray(j.needs)) return false;
    for (var i = 0; i < j.needs.length; i++) {
      var n = j.needs[i];
      if (n && (n.filledPartIds || []).length < (n.qty || 1)) return true;
    }
    return false;
  }
  /* §19.3 — day the job's ordered parts land, when the engine says it's
   * waiting on a delivery (feature-detected across likely field homes);
   * null = not waiting on parts. */
  function wbPartsArrival(j, st) {
    if (!j || !st) return null;
    var d = j.partsArriveDay !== undefined ? j.partsArriveDay
      : (j.waitingParts && j.waitingParts.arrivesDay !== undefined ? j.waitingParts.arrivesDay
        : (j.partsEta !== undefined ? j.partsEta : null));
    /* real engine home (§19.3): retail orders bound to this job's need
     * slots live in state.pendingOrders[].jobId — earliest arrival wins */
    if ((d === null || d === undefined) && Array.isArray(st.pendingOrders)) {
      for (var i = 0; i < st.pendingOrders.length; i++) {
        var po = st.pendingOrders[i];
        if (po && po.jobId === j.id && po.arrivesDay !== undefined && po.arrivesDay !== null &&
            (d === null || d === undefined || po.arrivesDay < d)) d = po.arrivesDay;
      }
    }
    if (d === null || d === undefined) return null;
    return Number(d) > st.day ? Number(d) : null;
  }

  function wbByDeadline(a, b) {
    var da = (a.deadlineDay === null || a.deadlineDay === undefined) ? Infinity : a.deadlineDay;
    var db = (b.deadlineDay === null || b.deadlineDay === undefined) ? Infinity : b.deadlineDay;
    return (da - db) || ((a.id || 0) - (b.id || 0));
  }
  function wbClassify(jobs, st) {
    var b = { active: [], priority: [], customer: [], contracts: [], projects: [], waiting: [] };
    jobs.forEach(function (j) {
      if (!j) return;
      b.active.push(j);
      var done = j.status === 'done';
      if (!done && (j.rush || (j.deadlineDay !== null && j.deadlineDay !== undefined && j.deadlineDay <= st.day + 1))) {
        b.priority.push(j);
      }
      var isContract = j.type === 'contract' || j.subtype === 'contract_build' ||
        j.subtype === 'contract_upgrade' || !!j.accountId;
      if (isContract) b.contracts.push(j);
      else if (WB_CUSTOMER_TYPES.indexOf(j.type) !== -1) b.customer.push(j);
      if (j.type === 'refurb') b.projects.push(j);
      if (!done && (findRunningWaitStep(j) || wbHasUnassignedNeed(j) ||
        (wbPartsArrival(j, st) !== null))) b.waiting.push(j);   /* §19.3 in-transit */
    });
    Object.keys(b).forEach(function (k) { b[k].sort(wbByDeadline); });
    return b;
  }
  var WB_EMPTY = {
    active: 'The bench is clear. Accept an offer, or flip a machine from the As-Is Market under Shop Projects.',
    priority: 'Nothing urgent — no rush work or same/next-day deadlines.',
    customer: 'No customer jobs on the bench — accept an offer to get to work.',
    contracts: 'No contracts or account work in progress — bigger clients arrive as your prestige grows.',
    projects: 'No refurbs on the bench — buy a machine from the As-Is Market below and flip it.',
    waiting: 'Nothing is waiting on a timer or a part. All clear.'
  };

  function renderWorkbench(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }

    var jobs = arr(tryCall(function () { return Engine.getActiveJobs(); }));
    var slots = null;
    try {
      var sv = Engine.getShopView();
      if (sv && sv.tier) slots = sv.tier.workstationSlots;
    } catch (e) { /* ignore */ }

    var activeCount = 0;
    jobs.forEach(function (j) { if (j.type !== 'refurb') activeCount++; });

    var html = '<div class="wb-top"><h2 class="section-title">Workbench</h2>' +
      (slots ? '<span class="muted small">' + activeCount + ' active job' + (activeCount === 1 ? '' : 's') +
        ' / ' + slots + ' workstation slot' + (slots === 1 ? '' : 's') +
        ' — jobs beyond your slots take +50% hours</span>' : '') +
      '</div>';

    /* §16.1 — sub-tab pills (the external tester's exact ask) */
    var buckets = wbClassify(jobs, st);
    var pills = [
      { id: 'active', label: 'Active', count: buckets.active.length, title: 'Everything on the bench, closest deadline first' },
      { id: 'priority', label: 'Priority', count: buckets.priority.length, countCls: 'red',
        hidden: !buckets.priority.length, title: 'Due today or tomorrow, or rush work' },
      { id: 'customer', label: 'Customer Jobs', count: buckets.customer.length, title: 'Repairs, upgrades, software, devices and other walk-in work' },
      { id: 'contracts', label: 'Contracts', count: buckets.contracts.length, title: 'Contract runs and business-account service jobs' },
      { id: 'projects', label: 'Shop Projects', count: buckets.projects.length, title: 'Refurb flips — plus the As-Is Market to buy more' },
      { id: 'waiting', label: 'Waiting', count: buckets.waiting.length, title: 'Blocked on a running timer or an unassigned part' }
    ];
    var cur = UI.activeSubTab('workbench', pills);
    html += UI.subTabsHTML('workbench', pills);

    var list = buckets[cur] || [];
    if (!list.length) {
      html += emptyBox(WB_EMPTY[cur] || 'Nothing here right now.');
    } else {
      list.forEach(function (j) { html += jobCardHTML(j, st); });
    }

    /* §16.1 — the As-Is Market lives under Shop Projects now. */
    if (cur === 'projects') {
      html += stockBuildCTA(st);            /* §19.6 */
      html += asIsMarketHTML(st);
    }

    panel.innerHTML = html;

    /* §10.3/§10.4 — initialize picker button labels + meta lines to match
     * each select's current option. */
    var needSels = panel.querySelectorAll('select[id^="need-sel-"]');
    for (var ns = 0; ns < needSels.length; ns++) updateNeedRowUI(needSels[ns]);
  }

  /* §19.6 — player-initiated stock builds: the deliberate flip channel. */
  function stockBuildCTA(st) {
    if (!has('startStockBuild')) return '';
    return '<div class="card stock-build-cta">' +
      '<div class="card-title">🛠 Build one for the counter</div>' +
      '<p class="muted small">Spec a machine on your own dime and sell it from the shop — no customer, ' +
      'no deadline. Fresh builds fetch a premium, but flooding your local used market softens prices.</p>' +
      '<div class="job-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="stock-build">Start a stock build</button>' +
      '</div></div>';
  }

  /** §19.6 — is this job a shop-stock build (no customer/budget)? */
  function isStockBuild(j) {
    return !!(j && (j.type === 'stock_build' || j.stockBuild === true ||
      (j.build && j.build.stock === true)));
  }

  /** §20.4 #5 — does finishing this job just shelve a machine for sale
   * (refurb or stock build) rather than hand it to a customer? Those
   * completions aren't "done" yet — no completion-flash ghost for them;
   * it plays instead on the eventual Engine.sellRefurb. */
  function jobShelvesMachine(jobId) {
    var j = activeJobById(jobId);
    return !!(j && (j.type === 'refurb' || isStockBuild(j)));
  }

  function asIsMarketHTML(st) {
    var cash = Number(st.cash) || 0;
    var html = '<h2 class="section-title">As-Is Market <span class="muted small">broken machines, sold untested — repair and flip them</span></h2>';
    var machines = arr(tryCall(function () { return Engine.getAsIsMarket(); }));
    if (!machines.length) {
      return html + emptyBox('Nothing listed right now — new machines turn up most mornings.');
    }
    html += '<div class="cards">';
    machines.forEach(function (m) {
      var age = (m.listedDay !== null && m.listedDay !== undefined) ? (st.day - m.listedDay) : null;
      var ageTxt = age === null ? '' : (age <= 0 ? 'listed today' : 'listed ' + age + ' day' + (age === 1 ? '' : 's') + ' ago');
      /* §16.3a — never a silent dead click on an unaffordable machine */
      var short = Math.max(0, (Number(m.askPrice) || 0) - cash);
      html += '<div class="card">' +
        '<div class="card-title">' + esc(m.name) + ' <span class="muted small">(' + esc(m.year) + ')</span></div>' +
        (m.specSummary ? '<div class="asis-spec">' + esc(m.specSummary) + '</div>' : '') +
        blurbHTML(m.hint) +                                     // §22.2 (re-fix) — no double quotes
        '<div class="meta-row"><span class="muted small">' + arr(m.partIds).length + ' parts inside • sold as-is, no returns</span>' +
          (ageTxt ? '<span class="asis-age">' + esc(ageTxt) + '</span>' : '') + '</div>' +
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="buy-asis" data-machine="' + esc(m.id) + '"' +
            (short > 0 ? ' disabled title="Need ' + esc(fm(short)) + ' more"' : '') +
            '>Buy — ' + fm(m.askPrice) + '</button>' +
          (short > 0 ? ' <span class="muted small">Need ' + esc(fm(short)) + ' more</span>' : '') +
        '</div>' +
      '</div>';
    });
    return html + '</div>';
  }

  function jobCardHTML(j, st) {
    var due = dueText(j, st);
    var isRefurb = j.type === 'refurb';
    var undiagnosed = !!(j.needsDiagnosis && !j.diagnosed);
    var buildPending = !!(j.build && !j.build.validated);
    var ready = j.status === 'done';
    /* §9.4 overtime: actions may proceed while hoursLeft > -overtimeCap;
     * only disable at the exhaustion floor (engine enforces the real rule). */
    var otCap = otCapValue();
    var hoursNow = Number(st.hoursLeft) || 0;
    var noHours = hoursNow <= -otCap;
    var otWarn = hoursNow <= 0 && !noHours;
    /* §11.3 — diagnosis lives in the step checklist now (engine ≥0.4:
     * working the checklist performs the diagnosis). The separate Diagnose
     * button survives as a fallback for jobs without steps AND for pre-0.4
     * engines whose workJob still demands the old diagnoseJob call. */
    var hasSteps = !!(j.steps && j.steps.length);
    var diagFallback = undiagnosed && (!hasSteps || !engineAtLeast('0.4'));
    var isDevice = j.type === 'device_repair'; /* §12.4 */

    var h = '<div class="card job-card-full" id="jobcard-' + j.id + '">';

    /* title row */
    h += '<div class="card-title">' + esc(shortTitle(j.title)) +          // §22.2 #1
      (j.rush ? ' <span class="badge b-rush">RUSH</span>' : '') +
      (ready ? ' <span class="chip chip-status done">' + (isRefurb ? 'Repaired — ready to sell' : 'Done') + '</span>' : '') +
      (j.crt ? ' <span class="badge b-warn" title="CRT work without a discharge kit risks injury">CRT — HIGH VOLTAGE</span>' : '') +
      '</div>';

    /* meta row */
    h += '<div class="meta-row">' + typeChip(j) + UI.wrenches(j.difficulty) +
      customerLine(j) + regularChip(j) + tasteChip(j) +
      '<span class="pay num">' + (j.pay !== null && j.pay !== undefined
        ? (j.type === 'callback' ? 'Warranty — no pay' : fm(j.pay))
        : 'Market-priced at sale') + '</span>' +
      '<span class="' + (due.urgent ? 'due-soon' : 'muted') + '">' + esc(due.txt) + '</span>' +
      (j.drTier ? '<span class="chip" title="Data-recovery rig tier required">Needs DR rig tier ' + esc(j.drTier) + '</span>' : '') +
      osChip(j) +
      '</div>';

    if (j.blurb) h += '<div class="blurb">&ldquo;' + esc(j.blurb) + '&rdquo;</div>';

    h += clientMachineNoteHTML(j);   // §21.4

    /* §17.1 — pending decision: the amber card that pauses the job */
    var decPending = decisionPendingUI(j);
    if (decPending) h += decisionCardHTML(j);

    /* progress (animated across renders, §9.9) */
    h += '<div class="bar-row"><span class="muted small">Progress</span>' +
      animatedBar('job-' + j.id, j.hoursDone, j.hoursRequired, 'wide') +
      '<span class="num small">' + fmtHours(j.hoursDone) + ' / ' + fmtHours(j.hoursRequired) + 'h <span class="muted">(at standard pace)</span></span></div>';

    /* §19.3 — waiting on ordered parts (real date, §19.9 #2) */
    var partsEtaDay = wbPartsArrival(j, st);
    if (partsEtaDay !== null) {
      h += '<div><span class="wait-status" title="Ordered parts arrive with the morning deliveries.">🚚 waiting on parts — arriving ' +
        esc(S.fmtDay(partsEtaDay)) + '</span></div>';
    }

    /* §11.6 — running wait-step status line */
    var runWait = findRunningWaitStep(j);
    if (runWait) {
      var remH = waitRemainingHours(runWait);
      h += '<div><span class="wait-status" title="Timed steps advance alongside any other work (or Wait 1h) and finish free overnight.">⏲ waiting on ' +
        esc(String(runWait.label || 'timed step').toLowerCase()) +
        (remH !== null ? ' (' + remH + 'h left)' : '') +
        ' — runs while you work on other jobs</span></div>';
    }

    /* contract units */
    if (j.units && j.units > 1) {
      h += '<div class="bar-row"><span class="muted small">Units</span>' +
        animatedBar('units-' + j.id, j.unitsDone || 0, j.units, 'wide good') +
        '<span class="num small">' + esc(j.unitsDone || 0) + ' / ' + esc(j.units) + ' machines</span></div>';
    }

    /* §10.1 step checklist (absent on old saves until the engine migrates) */
    if (j.steps && j.steps.length) h += stepsHTML(j);

    /* speed selector */
    if (!ready) {
      h += '<div class="meta-row"><label class="muted small" for="speed-' + j.id + '">Pace</label>' +
        '<select class="sel" id="speed-' + j.id + '" data-action="speed" data-job="' + j.id + '" title="' + esc(SPEED_TIP) + '">' +
        speedOpt(j, 'quick', 'Quick (fewer hours, callback risk)') +
        speedOpt(j, 'standard', 'Standard') +
        speedOpt(j, 'meticulous', 'Meticulous (more hours, better rating)') +
        '</select>' +
        '<span class="tip" title="' + esc(SPEED_TIP) + '">?</span></div>';
    }

    /* diagnosis */
    if (diagFallback) {
      h += '<div class="note">Fault not identified yet — diagnose before ordering parts.</div>';
    } else if (j.diagnosed && j.fault) {
      h += '<div class="meta-row"><span class="muted small">Fault:</span> ' + esc(j.fault.desc || '') +
        (j.fault.partCategory
          ? ' <span class="chip">' + esc(catLabel(j.fault.partCategory)) + ' part needed</span>'
          : ' <span class="chip">Labor only</span>') +
        '</div>';
      /* §17.1 — post-diagnosis revised estimate on repairs: labor is the
       * quoted pay; the parts range is now known (billed +25%). */
      if (j.type === 'repair' && j.partsEstimate &&
          j.partsEstimate.min !== null && j.partsEstimate.min !== undefined &&
          j.partsEstimate.max !== null && j.partsEstimate.max !== undefined) {
        h += '<div class="meta-row"><span class="revised-est small" title="The quote covers labor; the replacement part is billed to the customer at +25% of what you pay for it">' +
          'Revised estimate: ' + esc(fm(j.pay)) + ' labor + ~' +
          esc(fm(j.partsEstimate.min)) + '–' + esc(fm(j.partsEstimate.max)) +
          ' parts (billed to customer +25%)</span></div>';
      }
    }

    /* §12.4 device repairs: device line + kind chip; NO catalog parts —
     * no picker, no component list. Parts expense is engine-side. */
    if (isDevice) {
      var dev = j.device || j.machine || {};
      h += '<div class="refurb-box"><span class="muted small">Device:</span> ' +
        esc(dev.name || j.title) +
        (dev.kind || j.subtype
          ? ' <span class="chip chip-type t-device_repair">' + esc(SUBTYPE_LABELS[dev.kind || j.subtype] || prettySubtype(dev.kind || j.subtype)) + '</span>'
          : '') +
        (dev.year ? ' <span class="muted small">(' + esc(dev.year) + ')</span>' : '') +
        '<div class="note">Specialty parts are sourced by the bench and billed at completion.</div>' +
        '</div>';
    }

    /* machine info + component list (§9.5 refurbs; §10.4 customer machines
     * on repair/upgrade/peripheral too — statuses engine-driven, "?" until
     * diagnosis) */
    if (j.machine && !isDevice) {
      h += '<div class="refurb-box"><span class="muted small">' +
        (isRefurb ? 'Machine:' : 'In for service:') + '</span> ' + esc(j.machine.name) +
        (j.machine.year ? ' <span class="muted small">(' + esc(j.machine.year) + ')</span>' : '') +
        (j.machine.boughtFor !== null && j.machine.boughtFor !== undefined
          ? ' <span class="muted small">— bought for <span class="num">' + esc(fm(j.machine.boughtFor)) + '</span></span>' : '');
      if (has('getMachineParts')) {
        var mparts = arr(tryCall(function () { return Engine.getMachineParts(j.id); }));
        if (mparts.length) {
          h += '<div class="machine-parts">';
          mparts.forEach(function (p) {
            var stt = p.status === 'ok' ? 'ok' : (p.status === 'faulty' ? 'faulty' : 'unknown');
            h += '<div class="mp-row">' +
              '<span class="mp-status ' + stt + '">' + (stt === 'ok' ? 'OK' : (stt === 'faulty' ? 'FAULTY' : '?')) + '</span>' +
              '<span>' + esc(p.name) + '</span>' +
              '<span class="muted small">' + esc(p.category ? catLabel(p.category) : '') + '</span>' +
              (p.value !== null && p.value !== undefined ? '<span class="num muted small">' + esc(fm(p.value)) + '</span>' : '') +
              '</div>';
          });
          h += '</div>';
        }
      }
      h += '</div>';
    }

    /* needs part-picker (§12.4: device repairs never source catalog parts) */
    if (!isDevice && !diagFallback && !buildPending && j.needs && j.needs.length) {
      h += needsHTML(j);
    }

    /* build configurator */
    if (j.build) {
      if (buildPending) h += buildCfgHTML(j);
      else h += '<div class="note">Build spec locked in and parts sourced — work the job to assemble it.</div>';
    }

    /* actions */
    h += '<div class="job-actions">';
    var hourAttr = noHours
      ? ' disabled title="Too exhausted — call it a day"'
      : (otWarn ? ' title="You are into overtime — tomorrow starts short"' : '');
    if (diagFallback) {
      /* §11.3 fallback only — with steps, diagnosing IS working the checklist */
      h += '<button type="button" class="btn btn-primary btn-sm" data-action="diagnose" data-job="' + j.id + '"' +
        hourAttr + '>Diagnose</button>';
    }
    if (ready && isRefurb) {
      h += '<button type="button" class="btn btn-primary btn-sm" data-action="sell-refurb" data-job="' + j.id + '">Sell machine</button>';
    } else if (!diagFallback && !buildPending) {
      /* §14.8 — four graduated work controls, smallest to largest. "Finish
       * Step" needs a discrete current step to aim at; grey it out (with a
       * reason) when there isn't one. §17.1 — a pending decision pauses the
       * bench: the blocked state must read clearly, not error-toast. */
      var decAttr = decPending
        ? ' disabled title="Waiting on your decision — pick an option on the card above"'
        : '';
      var hasCurStep = currentStepIndex(j) >= 0;
      var tinkerAttr = decAttr || hourAttr || ' title="Work just 6 minutes — the smallest useful nudge"';
      var stepAttr = decAttr || (!hasCurStep
        ? ' disabled title="No discrete step in progress right now"'
        : (hourAttr || ' title="Work until the current step is done"'));
      var jobAttr = decAttr || hourAttr || ' title="Work until the job is finished (or you run out of useful hours)"';
      hourAttr = decAttr || hourAttr;
      h += '<button type="button" class="btn btn-sm" data-action="work-tinker" data-job="' + j.id + '"' +
        tinkerAttr + '>Tinker (6 min)</button>' +
        '<button type="button" class="btn btn-sm" data-action="work-step" data-job="' + j.id + '"' +
        stepAttr + '>Finish Step</button>' +
        '<button type="button" class="btn btn-sm" data-action="work-hour" data-job="' + j.id + '"' +
        hourAttr + '>Work 1 Hour</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="work-job" data-job="' + j.id + '"' +
        jobAttr + '>Finish Job</button>';
    }
    if (isRefurb) {
      h += '<button type="button" class="btn btn-sm btn-ghost" data-action="appraise" data-job="' + j.id + '">Appraise</button>';
    }
    /* §9.5: refurbs get Strip for Parts instead of Abandon (fallback to
     * Abandon while the engine API is still landing). */
    if (isRefurb && has('stripRefurb')) {
      h += '<button type="button" class="btn btn-sm btn-ghost" data-action="strip" data-job="' + j.id + '" title="1.5h — working parts roll into inventory">Strip for Parts</button>';
    } else {
      h += '<button type="button" class="btn btn-sm btn-ghost" data-action="abandon" data-job="' + j.id + '">Abandon</button>';
    }
    h += '</div></div>';
    return h;
  }

  function speedOpt(j, val, label) {
    return '<option value="' + val + '"' + (j.speed === val ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  /* ------------------------------------------------------------------ *
   * §17.1 — job decision moments. The engine pauses the job with
   * job.decision = { kind: 'fork'|'approval'|'tuning', chosen: null,
   * prompt, options: [{id, label, summary}] }; the card shows the honest
   * trade-offs and resolves through Engine.decideJob (feature-detected).
   * ------------------------------------------------------------------ */
  function decisionPendingUI(j) {
    return !!(j && j.decision && j.decision.chosen === null && has('decideJob') &&
      Array.isArray(j.decision.options) && j.decision.options.length);
  }

  var DECISION_META = {
    fork: { ico: '🔀', title: 'Your call, boss' },
    approval: { ico: '📞', title: 'Found something — call the customer?' },
    tuning: { ico: '🎛', title: 'How hard do you push it?' }
  };
  function decisionCardHTML(j) {
    var d = j.decision;
    var meta = DECISION_META[d.kind] || { ico: '❔', title: 'Decision needed' };
    var h = '<div class="decision-card" id="decision-' + j.id + '">' +
      '<div class="dec-head">' + meta.ico + ' <b>' + esc(meta.title) + '</b>' +
        ' <span class="chip dec-chip">work paused</span></div>' +
      (d.prompt ? '<div class="dec-prompt">' + esc(d.prompt) + '</div>' : '') +
      '<div class="dec-options">';
    d.options.forEach(function (o) {
      if (!o) return;
      h += '<button type="button" class="dec-option" data-action="decide" data-job="' + j.id +
        '" data-option="' + esc(o.id) + '">' +
        '<b class="dec-label">' + esc(o.label || o.id) + '</b>' +
        (o.summary ? '<span class="dec-summary small">' + esc(o.summary) + '</span>' : '') +
        '</button>';
    });
    h += '</div></div>';
    return h;
  }

  /* §10.1/§11.3/§11.6 — step checklist: ✓ done, ▶ current (partial %),
   * ○ pending, ⏲ wait steps, plus the post-diagnosis placeholder row. */
  var WAIT_TIP = 'Timed step: 0.1h to set it running, then it advances alongside any other ' +
    'work (or Wait 1h) and finishes free overnight. Blocks only this job.';

  /** Index of the job's current (first not-done) step, or -1 if there is
   * none (no steps, or all done). Shared by the checklist render and the
   * §14.8 "Finish Step" control (which needs to know if there is one). */
  function currentStepIndex(j) {
    var steps = j && j.steps;
    if (!steps || !steps.length) return -1;
    var cur = (typeof j.stepIndex === 'number') ? j.stepIndex : -1;
    if (cur < 0 || cur >= steps.length || steps[cur].done) {
      cur = -1;
      for (var k = 0; k < steps.length; k++) { if (!steps[k].done) { cur = k; break; } }
    }
    return cur;
  }
  /** §14.8 — remaining hours on the job's current step (rounded to the
   * engine's 0.1h grid), or null when there is no discrete current step —
   * the numeric-fallback amount for "Finish Step" on an engine that does
   * not understand the "step" workJob mode yet. */
  function currentStepRemainingHours(j) {
    var idx = currentStepIndex(j);
    if (idx < 0) return null;
    var s = j.steps[idx];
    var hrs = Number(s.hours);
    if (!isFinite(hrs) || hrs <= 0) return null;
    var p = Math.max(0, Math.min(1, Number(s.progress) || 0));
    var rem = Math.round(hrs * (1 - p) * 10) / 10;
    return rem > 0 ? rem : null;
  }

  function stepsHTML(j) {
    var steps = j.steps;
    var cur = currentStepIndex(j);
    var h = '<div class="steps">';
    steps.forEach(function (s, i) {
      var done = !!s.done;
      var isCur = !done && i === cur;
      var isWait = s.kind === 'wait';
      var running = UI.isWaitStepRunning(s);
      var cls = (done ? 'st-done' : (isCur ? 'st-cur' : 'st-pend')) +
        (isWait ? ' st-wait' : '') + (running ? ' st-running' : '');
      var ico = done ? '✓' : (running ? '⏲' : (isCur ? '▶' : '○'));
      var pct = ((isCur || running) && s.progress) ? Math.round(Math.max(0, Math.min(1, s.progress)) * 100) : 0;
      h += '<div class="step ' + cls + '">' +
        '<span class="st-ico">' + ico + '</span>' +
        '<span class="st-label">' + esc(s.label) + '</span>' +
        (isWait && !done
          ? ' <span class="wait-badge" title="' + esc(WAIT_TIP) + '">⏲ ' + (running ? 'running' : 'wait') + '</span>' +
            (running ? '<span class="muted small"> runs while you work on other jobs</span>' : '')
          : '') +
        (pct > 0 ? UI.barHTML(pct, 100) + '<span class="st-pct">' + pct + '%</span>' : '') +
        (s.hours !== undefined && s.hours !== null ? '<span class="st-hours">' + fmtHours(s.hours) + 'h</span>' : '') +
        '</div>';
    });
    /* §11.3 — pre-diagnosis (new flow only): the checklist knows just the
     * diagnose phase so far. Pre-0.4 engines list every step up front. */
    if (j.needsDiagnosis && !j.diagnosed && engineAtLeast('0.4')) {
      h += '<div class="step st-placeholder"><span class="st-ico">○</span>' +
        '<span class="st-label">…further steps revealed after diagnosis</span></div>';
    }
    return h + '</div>';
  }

  /* §11.6 helpers */
  function findRunningWaitStep(j) {
    var steps = j && j.steps;
    if (!steps) return null;
    for (var i = 0; i < steps.length; i++) {
      if (UI.isWaitStepRunning(steps[i])) return steps[i];
    }
    return null;
  }
  function waitRemainingHours(s) {
    var hrs = Number(s.hours);
    if (!isFinite(hrs) || hrs <= 0) return null;
    var p = Math.max(0, Math.min(1, Number(s.progress) || 0));
    return Math.round(hrs * (1 - p) * 10) / 10;
  }

  /** Resolve a part id to a display name (best effort, engine-first). */
  function partNameOf(partId) {
    if (has('getPartInfo')) {
      var r = tryCall(function () { return Engine.getPartInfo(partId); });
      if (r && r.ok !== false && r.name) return r.name;
    }
    return partId;
  }

  /** Look up a live active job by id (best effort — null if the engine
   * isn't ready or the job isn't active). Shared by the schematic slot
   * picker and the §14.8 graduated work controls' "Finish Step" fallback. */
  function activeJobById(jobId) {
    var found = null;
    try {
      (Engine.getActiveJobs() || []).forEach(function (x) { if (x.id === jobId) found = x; });
    } catch (e) { /* ignore */ }
    return found;
  }

  /* §10.3/§10.4/§14.2 — needs picker: assign/unassign, replaces + graded
   * overspend + vs-original cue. Below-original options in an upgrade stay
   * disabled with a reason (assignPart already enforces this server-side;
   * the picker just needs to say so plainly). */
  function needsHTML(j) {
    var needs = tryCall(function () { return Engine.getJobNeeds(j.id); });
    if (!Array.isArray(needs) || !needs.length) return '';
    var anyUnassigned = false;
    needs.forEach(function (n) { if ((n.filled || 0) < (n.qty || 1)) anyUnassigned = true; });
    var canUnassign = has('unassignPart');
    var isUpgradeJob = (j.type === 'upgrade' || j.subtype === 'contract_upgrade'); // §14.2 wording

    var h = '<div class="needs' + (anyUnassigned ? ' attention' : '') + '" id="needs-' + j.id + '">' +
      '<div class="sub-title">Parts needed' + (anyUnassigned ? ' — assign a part to continue' : '') + '</div>';

    needs.forEach(function (n) {
      var qty = n.qty || 1;
      /* §19.3/§19.5/§20.2 — mirror the engine's fill rule: units on the
       * truck AND units sitting in the cart count as committed, and
       * summable needs are done when the SUM says so (n.satisfied), not
       * when every slot is stuffed. */
      var committed = (n.filled || 0) + (n.onOrder || 0) + (n.inCart || 0);
      var satisfied = n.satisfied !== undefined ? !!n.satisfied : (n.filled || 0) >= qty;
      var filledAll = satisfied || committed >= qty;
      h += '<div class="need-row' + (filledAll ? ' done' : '') + '">' +
        '<span class="need-label">' + esc(n.label || catLabel(n.category)) +
        (qty > 1 ? ' <span class="muted">(' + (n.filled || 0) + '/' + qty + ')</span>' : '') + '</span>';

      /* assigned entries (engine may expose n.assigned; fall back to the
       * job's raw filledPartIds) */
      var jn = (j.needs && j.needs[n.index]) || {};
      var assigned = Array.isArray(n.assigned) ? n.assigned : (jn.filledPartIds || []);
      assigned.forEach(function (ap) {
        var apId = (ap && typeof ap === 'object') ? ap.partId : ap;
        var apName = (ap && typeof ap === 'object' && ap.name) ? ap.name : partNameOf(apId);
        /* §19.3 — ordered parts in transit read clearly, with a real date */
        var inTransit = !!(ap && typeof ap === 'object' &&
          ap.arrivesDay !== undefined && ap.arrivesDay !== null &&
          st0Day() !== null && ap.arrivesDay > st0Day());
        h += '<span class="assigned-row">' +
          (inTransit
            ? '<span class="transit-mark">🚚</span> ' + esc(apName) +
              ' <span class="transit-note small">on order — arriving ' + esc(S.fmtDay(ap.arrivesDay)) + '</span>'
            : '<span class="ok-mark">✓</span> ' + esc(apName) +
              ' <span class="muted small">' + (canUnassign ? 'assigned — installs at its step' : 'installed') + '</span>') +
          (canUnassign
            ? ' <button type="button" class="btn btn-sm btn-ghost" data-action="unassign" data-job="' + j.id +
              '" data-need="' + n.index + '" data-part="' + esc(apId) + '">Unassign</button>'
            : '') +
          '</span>';
      });

      /* §19.3 — units on the overnight truck for this slot (engine fields
       * n.onOrder / n.arrivesDay straight off getJobNeeds) */
      if (n.onOrder > 0) {
        h += '<span class="assigned-row">' +
          '<span class="transit-mark">🚚</span> ' +
          (n.onOrder > 1 ? esc(n.onOrder) + '× ' : '') + 'on order' +
          ' <span class="transit-note small">' +
          (n.arrivesDay !== undefined && n.arrivesDay !== null
            ? 'arriving ' + esc(S.fmtDay(n.arrivesDay)) + ' — installs at its step'
            : 'arriving with the morning deliveries') +
          '</span></span>';
      }

      /* §20.2 — units sitting in the cart, not yet checked out */
      if (n.inCart > 0) {
        h += '<span class="chip chip-incart" title="Reserved in your cart — checkout adds it to the truck">🛒 ' +
          (n.inCart > 1 ? esc(n.inCart) + '× ' : '') + 'in cart</span>';
      }

      /* §19.5 — multi-part fills: slots-free chip + running total vs target */
      if (n.slotsFree !== undefined && n.slotsFree !== null) {
        h += '<span class="chip" title="Free board slots this need can still fill">' +
          esc(n.slotsFree) + ' slot' + (Number(n.slotsFree) === 1 ? '' : 's') + ' free</span>';
      }
      var mpBar = multiProgressHTML(n);
      if (mpBar) h += mpBar;

      if (!filledAll) {
        if (!n.options || !n.options.length) {
          h += '<span class="muted">No compatible part available right now — check back after prices refresh.</span>';
        } else {
          var selId = 'need-sel-' + j.id + '-' + n.index;
          h += '<select class="sel" id="' + selId + '">';
          n.options.forEach(function (o) {
            var below = o.meets === false;                       // §9.3
            var ovKind = overspendKind(o);                        // §14.2 graded
            var vs = vsOriginalOf(o);                             // §14.2 vs-original cue
            var overPsu = o.overPsu === true;                     // §17 PSU-adequacy flag
            var belowReason = isUpgradeJob ? 'below the current part' : 'below spec';
            var label = overspendPrefix(ovKind) +                // §10.4/§14.2
              (o.tasteMatch ? '♥ ' : '') + o.name +              // §9.2
              ' — ' + fm(o.price) +
              (o.source === 'inventory' ? ' (in stock)' : ' (order — arrives tomorrow)') + // §19.3/§20.2
              (vs ? ' — ' + vsOriginalText(vs) : '') +
              (o.countToMeet !== undefined && o.countToMeet !== null && o.countToMeet > 1
                ? ' — ×' + o.countToMeet + ' to hit the target' : '') +                          // §19.5
              (overPsu ? ' — ⚡ PSU swap needed' : '') +
              (below ? ' — ' + belowReason : '');
            var repTxt = (o.replaces && o.replaces.name)
              ? o.replaces.name + ' · ~' + fm(o.replaces.value)
              : (n.replaces && n.replaces.name ? n.replaces.name + ' · ~' + fm(n.replaces.value) : '');
            h += '<option value="' + esc(o.partId) + '"' + (below ? ' disabled title="' + esc(belowReason) + '"' : '') +
              ' data-source="' + esc(o.source || 'market') + '"' +
              ' data-overspend-kind="' + esc(ovKind || '') + '"' +
              (overPsu ? ' data-over-psu="1" data-psu-watts="' + esc(psuWattsOf(o, n) || '') + '"' : '') +
              (repTxt ? ' data-replaces="' + esc(repTxt) + '"' : '') +
              (vs ? ' data-vs-cue="' + esc(vs.cmp) + '" data-vs-label="' + esc(vs.origLabel || '') +
                '" data-vs-new="' + esc(vs.newLabel || '') + '"' : '') +
              '>' + esc(label) + '</option>';
          });
          /* §19.5 — "Add another" phrasing once the need is partially filled */
          var addAnother = assigned.length > 0 || (n.onOrder || 0) > 0;
          h += '</select>' +
            (has('getPartInfo')
              ? '<button type="button" class="info-btn" data-action="partinfo" data-from-select="' + selId + '" title="Part details">i</button>'
              : '') +
            '<button type="button" class="btn btn-primary btn-sm" id="need-btn-' + j.id + '-' + n.index +
              '" data-action="install" data-job="' + j.id + '" data-need="' + n.index +
              '" data-add="' + (addAnother ? 1 : 0) + '">' + (addAnother ? 'Add another' : 'Assign') + '</button>';
          if (hasTasteOption(n.options)) {
            h += '<span class="taste-hit small" title="Matches the customer\'s taste for bonus pay">♥ = customer favorite</span>';
          }
          h += '<span class="need-meta" id="need-meta-' + j.id + '-' + n.index + '" hidden></span>';
        }
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  /** §17 — the machine's PSU wattage for the overPsu cue, feature-detected
   * across the likely field homes (option, need, or need.machinePsu). */
  function psuWattsOf(o, n) {
    var w = (o && (o.psuWatts !== undefined ? o.psuWatts : o.machinePsuWatts));
    if (w === undefined && n) w = (n.psuWatts !== undefined ? n.psuWatts : n.machinePsuWatts);
    return (w === undefined || w === null) ? null : String(w);
  }

  /* ---- §19.3 / §19.5 helpers (all feature-detected) ---- */

  /** Today's day index, or null pre-engine. */
  function st0Day() {
    var st = getState();
    return st ? st.day : null;
  }

  /** §19.5 — running total-vs-target bar for multi-part needs. Renders from
   * whichever field pair the engine ships: {sumCurrent,sumTarget},
   * {perfSum,perfTarget}, or progress {current,target}; sumLabel (a ready
   * string like "96 MB of 128 MB") wins when present. */
  function multiProgressHTML(n) {
    if (!n) return '';
    /* engine contract (§19.5): summable needs ship sumAssigned/target plus
     * ready-formatted sumLabel/targetLabel and a satisfied flag; the older
     * guessed field pairs stay as fallbacks. */
    var curV = n.sumAssigned !== undefined ? n.sumAssigned
      : (n.sumCurrent !== undefined ? n.sumCurrent
        : (n.perfSum !== undefined ? n.perfSum
          : (n.progress && n.progress.current !== undefined ? n.progress.current : null)));
    var tgtV = n.target !== undefined ? n.target
      : (n.sumTarget !== undefined ? n.sumTarget
        : (n.perfTarget !== undefined ? n.perfTarget
          : (n.progress && n.progress.target !== undefined ? n.progress.target : null)));
    if (curV === null || tgtV === null || !isFinite(Number(tgtV)) || Number(tgtV) <= 0) {
      return n.sumLabel ? '<span class="need-sum small">' + esc(n.sumLabel) + '</span>' : '';
    }
    var met = n.satisfied !== undefined ? !!n.satisfied : Number(curV) >= Number(tgtV);
    var label = (n.sumLabel && n.targetLabel) ? (n.sumLabel + ' of ' + n.targetLabel)
      : (n.sumLabel || (curV + ' of ' + tgtV));
    return '<span class="need-sum-row">' +
      UI.barHTML(curV, tgtV, 'wide' + (met ? ' good' : '')) +
      '<span class="need-sum small' + (met ? ' up' : '') + '">' + esc(label) +
      (met ? ' ✓' : ' toward the target') + '</span></span>';
  }

  /** Sync a need picker's button label + replaces/vs-original/overspend meta
   * line with its currently selected option (§10.3/§10.4/§14.2). */
  function updateNeedRowUI(sel) {
    var m = /^need-sel-(\d+)-(\d+)$/.exec(sel.id || '');
    if (!m) return;
    var opt = sel.options[sel.selectedIndex];
    var btn = document.getElementById('need-btn-' + m[1] + '-' + m[2]);
    if (btn) {
      var src = opt ? opt.getAttribute('data-source') : null;
      var adding = btn.getAttribute('data-add') === '1';        // §19.5
      if (src === 'inventory') {
        btn.textContent = adding ? 'Add another from Stock' : 'Assign from Stock';
      } else if (has('getCart') || UI.engineVerAtLeast('0.9.1')) {
        /* §20.2/§20.3 — un-stocked assigns add a cart line now (assignPart
         * itself reports {inCart:true}); checkout (0.2h, cart-level) is
         * what actually charges & ships it. Gate on the version too, not
         * just getCart's presence: assignPart's cart-routing can land
         * before the standalone cart accessor APIs are exposed. */
        btn.textContent = adding ? 'Add another to Cart' : 'Add to Cart & Assign';
      } else {
        /* pre-§20 engine: assignPart still orders directly */
        btn.textContent = adding ? 'Order another' : 'Order & Assign';
      }
    }
    var meta = document.getElementById('need-meta-' + m[1] + '-' + m[2]);
    if (meta) {
      var bits = [];
      var rep = opt ? opt.getAttribute('data-replaces') : null;
      if (rep) bits.push('replaces ' + esc(rep));
      var vsCmp = opt ? opt.getAttribute('data-vs-cue') : null;
      if (vsCmp) {
        bits.push(vsOriginalHTML({
          cmp: vsCmp,
          origLabel: opt.getAttribute('data-vs-label') || '',
          newLabel: opt.getAttribute('data-vs-new') || ''
        }));
      }
      var ovChip = overspendChipHTML(opt ? opt.getAttribute('data-overspend-kind') : null);
      if (ovChip) bits.push(ovChip);
      /* §17 — PSU-adequacy amber flag: this part out-draws the customer's
       * supply; the approval-call decision handles quoting the swap. */
      if (opt && opt.getAttribute('data-over-psu') === '1') {
        var watts = opt.getAttribute('data-psu-watts');
        bits.push('<span class="chip-overpsu" title="This part draws more than the customer\'s power supply can feed — fitting it means quoting a PSU swap too (the approval call handles that)">⚡ exceeds their ' +
          (watts ? esc(watts) + 'W ' : '') + 'supply — PSU swap needed</span>');
      }
      meta.innerHTML = bits.join(' &nbsp;·&nbsp; ');
      meta.hidden = !bits.length;
    }
  }

  function hasTasteOption(options) {
    for (var i = 0; i < options.length; i++) {
      if (options[i] && options[i].tasteMatch) return true;
    }
    return false;
  }

  /* ---- custom build configurator ----
   * §12.5 graphical schematic when the engine ships slotCount data;
   * the original per-category select list remains the fallback. */

  var BUILD_ORDER = ['motherboard', 'cpu', 'ram', 'storage', 'gpu', 'psu', 'case', 'cooling', 'os', 'peripheral'];

  /** §12.2 — normalize a getBuildCatalog category across engine versions:
   * pre-0.4b it is a plain options array; 0.4b+ {slotCount, selected,
   * options} (arrays carrying extra props are tolerated too). */
  function catInfo(bc, c) {
    var raw = bc.categories[c];
    if (!raw) return null;
    if (Array.isArray(raw)) {
      return {
        options: raw,
        slotCount: (typeof raw.slotCount === 'number') ? raw.slotCount : null,
        selected: Array.isArray(raw.selected) ? raw.selected : null
      };
    }
    return {
      options: arr(raw.options),
      slotCount: (typeof raw.slotCount === 'number') ? raw.slotCount : null,
      selected: Array.isArray(raw.selected) ? raw.selected : null
    };
  }

  /** Selected part id per slot for a category — engine's `selected` when
   * present, else derived from job.build.parts (v5 object / legacy array). */
  function selectedSlots(j, bc, c) {
    var info = catInfo(bc, c);
    if (info && info.selected) return info.selected.slice();
    var bp = j.build && j.build.parts;
    if (bp && !Array.isArray(bp) && typeof bp === 'object') {
      return arr(bp[c]).slice();
    }
    var out = [null];
    if (info) {
      var flat = arr(bp);
      info.options.forEach(function (o) {
        if (flat.indexOf(o.partId) !== -1) out[0] = o.partId;
      });
    }
    return out;
  }

  function schematicReady(bc) {
    var probe = ['motherboard', 'cpu', 'ram', 'gpu', 'storage'];
    for (var i = 0; i < probe.length; i++) {
      var info = catInfo(bc, probe[i]);
      if (info && info.slotCount !== null) return true;
    }
    return false;
  }

  /* §12.5 — map validateBuild problem strings onto slot categories.
   * Ordered; first matching rule wins per problem (so "2 DIMM slots"
   * lands on ram, not the generic slot/board rule). */
  var PROBLEM_SLOT_RULES = [
    [/dimm|\bram\b|memory|stick/i, 'ram'],
    [/socket|\bcpu\b|processor/i, 'cpu'],
    [/gpu|video|graphics|sli|crossfire|voodoo|x16|2d card/i, 'gpu'],
    [/watt|psu|power/i, 'psu'],
    [/form factor|case/i, 'case'],
    [/storage|drive|disk|\bide\b|sata|nvme/i, 'storage'],
    [/operating system|\bos\b|arch/i, 'os'],
    [/cool/i, 'cooling'],
    [/expansion|sound|network|modem/i, 'expansion'],
    [/motherboard|board|slot/i, 'motherboard']
  ];
  function problemsByCat(problems) {
    var out = {};
    arr(problems).forEach(function (p) {
      for (var i = 0; i < PROBLEM_SLOT_RULES.length; i++) {
        if (PROBLEM_SLOT_RULES[i][0].test(p)) {
          var c = PROBLEM_SLOT_RULES[i][1];
          (out[c] = out[c] || []).push(p);
          return;
        }
      }
    });
    return out;
  }

  function shortName(n) {
    n = String(n || '');
    return n.length > 20 ? n.slice(0, 19) + '…' : n;
  }

  function buildCfgHTML(j) {
    var bc = tryCall(function () { return Engine.getBuildCatalog(j.id); });
    if (!bc || bc.ok === false || !bc.categories) {
      return '<div class="note">Build catalog unavailable.</div>';
    }
    var v = tryCall(function () { return Engine.validateBuild(j.id); });
    if (v && v.ok === false) v = null;

    var b = j.build || {};
    var mp = b.minPerf || {};
    var stock = isStockBuild(j);   /* §19.6 */
    var h = '<div class="build-cfg"><div class="sub-title">Build configurator</div>';

    /* target line */
    h += '<div class="meta-row muted small">' +
      (b.useCase ? '<span class="chip">' + esc(b.useCase) + '</span>' : '') +
      (stock
        ? '<span class="chip">shop stock — your money, your spec</span>'
        : '<span>Budget <b class="num">' + esc(fm(b.budget)) + '</b></span>') +
      (mp.cpu ? '<span>CPU ≥ ' + esc(mp.cpu) + '</span>' : '') +
      (mp.gpu ? '<span>GPU ≥ ' + esc(mp.gpu) + '</span>' : '') +
      (mp.ramMB ? '<span>RAM ≥ ' + esc(S.fmtMB(mp.ramMB)) + '</span>' : '') +
      (mp.storageGB ? '<span>Storage ≥ ' + esc(S.fmtGB(mp.storageGB)) + '</span>' : '') +
      (b.minStyle ? '<span>Style ≥ ' + esc(b.minStyle) + '</span>' : '') +
      '</div>';

    if (schematicReady(bc)) h += schematicHTML(j, bc, v);
    else h += selectListHTML(j, bc);

    h += valPanelHTML(j, v, mp, b);
    return h + '</div>';
  }

  /* ---- fallback: the classic per-category select list ---- */
  function selectListHTML(j, bc) {
    var selected = {};
    Object.keys(bc.categories).forEach(function (c) {
      var sel = selectedSlots(j, bc, c);
      if (sel && sel[0]) selected[c] = sel[0];
    });
    var cats = BUILD_ORDER.filter(function (c) { return bc.categories[c]; });
    Object.keys(bc.categories).forEach(function (c) {
      if (cats.indexOf(c) === -1) cats.push(c);
    });

    var h = '<div class="build-grid">';
    var infoOk = has('getPartInfo');
    cats.forEach(function (c) {
      var selId = 'build-sel-' + j.id + '-' + c;
      var info = catInfo(bc, c);
      h += '<span class="build-lbl">' + esc(catLabel(c)) + '</span>' +
        '<span class="need-row">' +
        '<select id="' + selId + '" data-action="buildpart" data-job="' + j.id + '" data-cat="' + esc(c) + '">' +
        '<option value="">— none —</option>';
      (info ? info.options : []).forEach(function (o) {
        var ovKind = overspendKind(o);   // §14.2 — build parts rarely carry this (no "original"), but degrade cleanly
        var vs = vsOriginalOf(o);
        var label = overspendPrefix(ovKind) + (o.tasteMatch ? '♥ ' : '') + o.name + ' — ' + fm(o.price) +
          (o.inStock ? ' (in stock)' : '') + (vs ? ' — ' + vsOriginalText(vs) : '');
        if (o.compatible === false) {
          label = '✕ ' + label + (o.why ? ' — ' + o.why : '');
        }
        h += '<option value="' + esc(o.partId) + '"' + (selected[c] === o.partId ? ' selected' : '') + '>' +
          esc(label) + '</option>';
      });
      h += '</select>' +
        (infoOk ? '<button type="button" class="info-btn" data-action="partinfo" data-from-select="' + selId + '" title="Part details">i</button>' : '') +
        '</span>';
    });
    return h + '</div>';
  }

  /* ---- §12.5: the motherboard schematic ---- */
  var SCHEMATIC_ZONES = ['motherboard', 'cpu', 'ram', 'gpu', 'storage'];
  var BAY_ORDER = ['psu', 'case', 'cooling', 'os'];

  function schematicHTML(j, bc, v) {
    var probs = problemsByCat(v ? v.problems : []);
    var moboSel = selectedSlots(j, bc, 'motherboard');
    var boardChosen = !!(moboSel && moboSel[0]);
    var moboInfo = catInfo(bc, 'motherboard');

    var h = '<div class="mobo-wrap">';

    /* board first — a dropdown, same handler as the fallback list */
    var selId = 'build-sel-' + j.id + '-motherboard';
    h += '<div class="mobo-boardpick' + (probs.motherboard ? ' has-bad' : '') + '">' +
      '<label class="build-lbl" for="' + selId + '">Motherboard</label>' +
      '<select id="' + selId + '" data-action="buildpart" data-job="' + j.id + '" data-cat="motherboard">' +
      '<option value="">— choose a board first —</option>';
    (moboInfo ? moboInfo.options : []).forEach(function (o) {
      var label = (o.tasteMatch ? '♥ ' : '') + o.name + ' — ' + fm(o.price) + (o.inStock ? ' (in stock)' : '');
      if (o.compatible === false) label = '✕ ' + label + (o.why ? ' — ' + o.why : '');
      h += '<option value="' + esc(o.partId) + '"' + (moboSel[0] === o.partId ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    h += '</select>' +
      (has('getPartInfo') ? '<button type="button" class="info-btn" data-action="partinfo" data-from-select="' + selId + '" title="Board details">i</button>' : '') +
      (probs.motherboard ? '<span class="down small">' + esc(probs.motherboard.join(' • ')) + '</span>' : '') +
      '</div>';

    if (!boardChosen) {
      return h + '<div class="note">Pick a motherboard to lay out its socket and slots.</div></div>';
    }

    h += '<div class="mobo-board" role="group" aria-label="Motherboard layout — every slot is a button">' +
      slotZone(j, bc, probs, 'cpu', 'zone-cpu') +
      slotZone(j, bc, probs, 'ram', 'zone-ram') +
      slotZone(j, bc, probs, 'storage', 'zone-drives') +
      slotZone(j, bc, probs, 'gpu', 'zone-gpu') +
      '</div>';

    /* surrounding bays: single-slot categories + anything new (expansion…) */
    var bays = BAY_ORDER.slice();
    Object.keys(bc.categories).forEach(function (c) {
      if (SCHEMATIC_ZONES.indexOf(c) === -1 && bays.indexOf(c) === -1) bays.push(c);
    });
    var bh = '';
    bays.forEach(function (c) { bh += slotZone(j, bc, probs, c, 'zone-bay'); });
    if (bh) h += '<div class="mobo-bays">' + bh + '</div>';

    return h + '</div>';
  }

  function slotZone(j, bc, probs, cat, zoneCls) {
    var info = catInfo(bc, cat);
    if (!info) return '';
    var count = (info.slotCount === null || info.slotCount === undefined) ? 1 : info.slotCount;
    if (count <= 0) return '';
    if (count > 16) count = 16; // sanity guard for pre-migration defaults (99)
    var sel = selectedSlots(j, bc, cat);
    var probList = probs[cat] || null;
    var redAll = !!(probList && !sel.some(function (x) { return !!x; }));

    var h = '<div class="mobo-zone ' + zoneCls + '">' +
      '<span class="zone-label">' + esc(catLabel(cat)) + (count > 1 ? ' <span class="muted">×' + count + '</span>' : '') + '</span>' +
      '<div class="zone-slots">';
    for (var i = 0; i < count; i++) {
      h += slotBtnHTML(j, cat, i, sel[i] || null, info, probList, redAll, count);
    }
    return h + '</div></div>';
  }

  function slotBtnHTML(j, cat, idx, pid, info, probList, redAll, count) {
    var opt = null;
    if (pid) {
      info.options.forEach(function (o) { if (o.partId === pid) opt = o; });
    }
    var state = '';
    var tip = catLabel(cat) + (count > 1 ? ' slot ' + (idx + 1) : '') + ' — click to choose a part';
    if (probList && (pid || redAll)) {
      state = 'bad';
      tip = probList.join(' • ');
    } else if (pid) {
      if (opt && opt.meets === false) {
        state = 'warn';
        tip = (opt.name || pid) + ' — below this job’s spec. Click to change.';
      } else {
        state = 'ok';
        tip = (opt ? opt.name + ' — ' + fm(opt.price) : pid) + '. Click to change or empty the slot.';
      }
    }
    var inner = pid
      ? '<span class="slot-chip">' + esc(shortName(opt ? opt.name : pid)) + '</span>'
      : '<span class="slot-plus">+</span>';
    return '<button type="button" class="slot slot-' + esc(cat) + (state ? ' ' + state : '') +
      '" data-action="slot-pick" data-job="' + j.id + '" data-cat="' + esc(cat) +
      '" data-slot="' + idx + '" title="' + esc(tip) + '" aria-label="' + esc(catLabel(cat) + ' slot ' + (idx + 1)) + '">' +
      inner + '</button>';
  }

  /** §12.5 — slot part-picker popover (modal; its listeners die with it). */
  function openSlotPicker(jobId, cat, slotIndex) {
    var bc = tryCall(function () { return Engine.getBuildCatalog(jobId); });
    if (!bc || bc.ok === false || !bc.categories) { UI.toast('Build catalog unavailable', 'error'); return; }
    var info = catInfo(bc, cat);
    if (!info) return;
    var j = activeJobById(jobId);
    var sel = j ? selectedSlots(j, bc, cat) : [];
    var current = sel[slotIndex] || null;
    var infoOk = has('getPartInfo');

    var body = '<div class="slot-picker">';
    if (current) {
      body += '<div class="picker-line"><button type="button" class="picker-row picker-remove" data-pick="">' +
        '<span class="pr-name">— Empty this slot —</span>' +
        '<span class="pr-meta muted small">the part goes back on the list</span></button></div>';
    }
    if (!info.options.length) {
      body += '<div class="empty">Nothing compatible is on the market right now.</div>';
    }
    info.options.forEach(function (o) {
      var incompat = o.compatible === false;
      var below = o.meets === false;
      var vs = vsOriginalOf(o);              // §14.2 vs-original cue
      var ovKind = overspendKind(o);          // §14.2 graded overspend
      body += '<div class="picker-line">' +
        '<button type="button" class="picker-row' + (incompat ? ' incompat' : '') +
          (o.partId === current ? ' current' : '') + '"' + (incompat ? ' disabled' : '') +
          ' data-pick="' + esc(o.partId) + '">' +
          '<span class="pr-name">' + (o.tasteMatch ? '<span class="taste-hit" title="Customer favorite — bonus pay">♥</span> ' : '') +
            esc(o.name) + (o.partId === current ? ' <span class="muted small">(current)</span>' : '') + '</span>' +
          '<span class="pr-meta num">' + esc(fm(o.price)) +
            (o.inStock ? ' · in stock' : ' · order') +
            (o.perf ? ' · ' + esc(perfStr(o.perf)) : '') + '</span>' +
          (vs ? vsOriginalHTML(vs) : '') +
          overspendChipHTML(ovKind) +
          (below ? ' <span class="badge b-warn" title="Below this job’s minimum spec">below spec</span>' : '') +
          (incompat ? '<span class="pr-why">✕ ' + esc(o.why || 'Incompatible with this build') + '</span>' : '') +
        '</button>' +
        (infoOk ? '<button type="button" class="info-btn pr-info" data-pi="' + esc(o.partId) + '" title="Part details">i</button>' : '') +
        '</div>';
    });
    body += '</div>';

    var modal = UI.modal({
      title: catLabel(cat) + ((info.slotCount || 1) > 1 ? ' — slot ' + (slotIndex + 1) : ''),
      html: body,
      buttons: [{ label: 'Cancel', cls: 'btn' }]
    });
    if (!modal) return;
    modal.el.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var pi = t.closest('[data-pi]');
      if (pi) { showPartInfo(pi.getAttribute('data-pi')); return; }
      var row = t.closest('[data-pick]');
      if (!row || row.disabled) return;
      var pid = row.getAttribute('data-pick') || null;
      modal.close();
      UI.act(function () { return Engine.setBuildPart(jobId, cat, pid, slotIndex); }); // §12.2 slot-indexed
    });
  }

  /* ---- shared: problems / perf-vs-target / budget / commit ---- */
  function valPanelHTML(j, v, mp, b) {
    var h = '';
    if (v) {
      h += '<div class="build-val">';
      if (v.problems && v.problems.length) {
        h += '<ul class="problems">';
        v.problems.forEach(function (p) { h += '<li>' + esc(p) + '</li>'; });
        h += '</ul>';
      } else {
        h += '<div class="ok-mark">✓ No compatibility problems</div>';
      }

      var perf = v.perf || {};
      h += '<div class="perf-grid">' +
        perfCell('CPU', perf.cpu, mp.cpu) +
        perfCell('GPU', perf.gpu, mp.gpu) +
        perfCell('RAM', perf.ramMB, mp.ramMB, S.fmtMB) +           /* §19.9 #16 */
        perfCell('Storage', perf.storageGB, mp.storageGB, S.fmtGB) +
        '<div class="perf-cell' + (v.meetsTarget ? ' ok' : ' short') + '"><span class="muted small">Overall</span>' +
          '<b>' + (perf.composite !== null && perf.composite !== undefined ? Number(perf.composite).toFixed(2) : '—') +
          (v.meetsTarget ? ' ✓ meets target' : ' — below target') + '</b></div>' +
        (b.minStyle ? '<div class="perf-cell' + ((v.style || 0) >= b.minStyle ? ' ok' : ' short') + '">' +
          '<span class="muted small">Style</span><b>' + esc(v.style !== undefined ? v.style : '—') + ' / ' + esc(b.minStyle) + '</b></div>' : '') +
        '</div>';

      if (isStockBuild(j)) {
        /* §19.6 — no budget on a stock build: show what it should sell for */
        var estSale = (v.estimatedSale !== undefined && v.estimatedSale !== null) ? v.estimatedSale : null;
        if (estSale === null && has('appraiseRefurb')) {
          var ap2 = tryCall(function () { return Engine.appraiseRefurb(j.id); });
          if (ap2 && ap2.ok !== false && ap2.estimate !== undefined) estSale = ap2.estimate;
        }
        h += '<div class="meta-row"><span class="muted small">Parts so far</span>' +
          '<b class="num">' + esc(fm(v.partsCost)) + '</b>' +
          (estSale !== null
            ? '<span class="est-sale" title="Fresh-build premium included; every recent sale into your local used market softens the next price">est. sale value ~<b class="num">' +
              esc(fm(estSale)) + '</b></span>'
            : '<span class="muted small">sale value appraised at completion</span>') +
          '</div>';
      } else {
        var over = !v.underBudget && (Number(v.partsCost) || 0) > (Number(v.budget) || 0);
        h += '<div class="bar-row"><span class="muted small">Parts cost</span>' +
          UI.barHTML(v.partsCost, v.budget, 'wide' + (over ? ' over' : '')) +
          '<span class="num small' + (over ? ' down' : '') + '">' + esc(fm(v.partsCost)) + ' of ' + esc(fm(v.budget)) + ' budget' +
          (over ? ' — OVER (eats your profit)' : '') + '</span></div>';
      }

      h += '<div class="job-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="commit-build" data-job="' + j.id + '"' +
        (v.valid ? '' : ' disabled title="Fix the problems listed above first"') +
        '>Commit build (buy parts)</button>' +
        '</div></div>';
    } else {
      h += '<div class="job-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="commit-build" data-job="' + j.id + '">Commit build (buy parts)</button>' +
        '</div>';
    }
    return h;
  }

  function perfCell(label, val, target, fmtFn) {
    if (!target) return '';
    var ok = (Number(val) || 0) >= Number(target);
    var shown = (val === null || val === undefined) ? '—' : (fmtFn ? fmtFn(val) : val);
    var tgt = fmtFn ? fmtFn(target) : target;
    return '<div class="perf-cell' + (ok ? ' ok' : ' short') + '">' +
      '<span class="muted small">' + esc(label) + '</span>' +
      '<b class="num">' + esc(shown) + ' / ' + esc(tgt) + '</b></div>';
  }

  /* ---- actions ---- */
  T.registerActions({
    'diagnose': function (el, jobId) {
      var dr = UI.act(function () { return Engine.diagnoseJob(jobId); });
      if (dr && dr.ok !== false && dr.fault) {
        UI.toast('Diagnosis (' + (dr.hoursSpent != null ? dr.hoursSpent + 'h' : 'done') + '): ' +
          (dr.fault.desc || 'fault found') +
          (dr.fault.partCategory ? ' — needs a ' + catLabel(dr.fault.partCategory) + ' part' : ' — labor only'),
          'info', 6500);
      }
    },
    /* §14.8 — graduated work controls */
    'work-tinker': function (el, jobId) { workGraduated(jobId, 0.1); },
    'work-step': function (el, jobId) { workGraduated(jobId, 'step'); },
    'work-hour': function (el, jobId) { workGraduated(jobId, 1); },
    'work-job': function (el, jobId) { workGraduated(jobId, 'job'); },
    'decide': function (el, jobId) { /* §17.1 — resolve a decision moment */
      if (!has('decideJob')) { UI.toast('Decisions are not available yet', 'info'); return; }
      var optId = el.getAttribute('data-option');
      var chosenLabel = '';
      var dj = activeJobById(jobId);
      if (dj && dj.decision && Array.isArray(dj.decision.options)) {
        dj.decision.options.forEach(function (o) { if (o && o.id === optId) chosenLabel = o.label || o.id; });
      }
      var dres = UI.act(function () { return Engine.decideJob(jobId, optId); });
      if (dres && dres.ok !== false) {
        UI.toast('Decision made' + (chosenLabel ? ': ' + chosenLabel : '') +
          (dres.note ? ' — ' + dres.note : ' — the bench is moving again'), 'success', 5000);
      }
    },
    'abandon': function (el, jobId) {
      UI.confirm(
        'Abandon this job? The customer will not be happy — your reputation takes a hit.',
        function () { UI.act(function () { return Engine.abandonJob(jobId); }, 'Job abandoned'); },
        { yesLabel: 'Abandon job', title: 'Abandon job' }
      );
    },
    'strip': function (el, jobId) { /* §9.5 refurb strip-for-parts */
      var salvage = [];
      if (has('getMachineParts')) {
        arr(tryCall(function () { return Engine.getMachineParts(jobId); })).forEach(function (p) {
          if (p && p.status !== 'faulty') salvage.push(p.name);
        });
      }
      var msg = 'Strip this machine for parts? Takes 1.5h. ' +
        (salvage.length
          ? 'Expected salvage (most survive the bench): ' + salvage.join(', ') + '.'
          : 'Working parts roll into your inventory; the faulty one is lost.');
      UI.confirm(msg, function () {
        UI.act(function () { return Engine.stripRefurb(jobId); }, 'Machine stripped — salvage moved to inventory');
      }, { yesLabel: 'Strip for Parts', title: 'Strip for parts' });
    },
    'install': function (el, jobId) { /* §10.3/§20.2 assign (un-stocked routes through the cart now) */
      var needIdx = parseInt(el.getAttribute('data-need'), 10);
      var sel = document.getElementById('need-sel-' + jobId + '-' + needIdx);
      var pid = sel && sel.value;
      if (!pid) { UI.toast('Pick a part first', 'info'); return; }
      var useAssign = has('assignPart');
      var ir = UI.act(function () {
        return useAssign ? Engine.assignPart(jobId, needIdx, pid) : Engine.installPart(jobId, needIdx, pid);
      });
      if (ir && ir.ok !== false) {
        var msg2 = useAssign
          ? (ir.inCart === true
              ? 'Added to cart — check out to have it on the truck'             /* §20.2 */
            : (ir.arrivesDay !== undefined && ir.arrivesDay !== null && ir.arrivesDay > (st0Day() || 0)
              ? 'Part ordered — arriving ' + S.fmtDay(ir.arrivesDay)            /* §19.3/§19.9 #2 */
              : 'Part assigned — it installs when its step is worked'))
          : 'Part installed';
        if (ir.cost) msg2 += ' — ' + fm(ir.cost);
        if (ir.orderedQty) msg2 += ' (' + ir.orderedQty + ' on the truck)';      /* §19.3 */
        else if (ir.filledNow) msg2 += ' (' + ir.filledNow + ' this batch)';
        if (ir.remaining) msg2 += ' • ' + ir.remaining + ' still to source';     /* §19.1 partial fills */
        UI.toast(msg2, 'success');
      }
    },
    'unassign': function (el, jobId) { /* §10.3 */
      var unIdx = parseInt(el.getAttribute('data-need'), 10);
      var unPid = el.getAttribute('data-part') || null;
      UI.act(function () {
        return unPid ? Engine.unassignPart(jobId, unIdx, unPid) : Engine.unassignPart(jobId, unIdx);
      }, 'Part returned to inventory');
    },
    'sell-refurb': function (el, jobId) {
      openSellModal(jobId);   /* §19.6 — bundle picker on the sell confirm */
    },
    'stock-build': function () { /* §19.6 */
      if (!has('startStockBuild')) { UI.toast('Stock builds are not available yet', 'info'); return; }
      UI.act(function () { return Engine.startStockBuild(); },
        'Stock build started — spec it out on the bench');
    },
    'appraise': function (el, jobId) {
      var ar = tryCall(function () { return Engine.appraiseRefurb(jobId); });
      if (ar && ar.ok === false) UI.toast(ar.error, 'error');
      else if (ar) UI.toast('Appraisal: should sell for about ' + fm(ar.estimate), 'info', 5000);
      // read-only — no refresh needed
    },
    'commit-build': function (el, jobId) {
      UI.act(function () { return Engine.commitBuild(jobId); },
        'Build locked in — parts sourced. Work the job to assemble it.');
    },
    'slot-pick': function (el, jobId) { /* §12.5 schematic slot → part-picker popover */
      var pcat = el.getAttribute('data-cat');
      var pslot = parseInt(el.getAttribute('data-slot'), 10) || 0;
      if (pcat) openSlotPicker(jobId, pcat, pslot);
    },
    'buy-asis': function (el) {
      var mid = el.getAttribute('data-machine');
      UI.act(function () { return Engine.buyAsIsMachine(mid); },
        'Machine bought — it is on your Workbench as a refurb job');
    }
  });

  /* ------------------------------------------------------------------ *
   * §19.6 — sell confirm with peripheral-bundle picker (up to 3 from
   * inventory; the +15% bundle premium is priced engine-side — the UI
   * shows engine-provided bundleValue when present, else the market value
   * with an honest note).
   * ------------------------------------------------------------------ */
  function doSellMachine(jobId, bundleIds, rectBefore) {
    var sr = UI.act(function () {
      return (bundleIds && bundleIds.length)
        ? Engine.sellRefurb(jobId, { bundlePartIds: bundleIds })
        : Engine.sellRefurb(jobId);
    });
    if (sr && sr.ok !== false) {
      /* §20.4 #5 — the completion-flash ghost moved here: a refurb/stock
       * build "finishing" just shelves it for sale; the flash belongs on
       * the actual sale, anchored to the card's rect from before the sale
       * removed it. */
      spawnDoneGhost(rectBefore);
      UI.toast('Machine sold for ' + fm(sr.price) +
        (bundleIds && bundleIds.length
          ? ' — ' + bundleIds.length + ' peripheral' + (bundleIds.length === 1 ? '' : 's') + ' bundled in'
          : ''), 'success', 5000);
    }
  }

  function openSellModal(jobId) {
    var rectBefore = cardRectOf(jobId);   /* §19.9 #8 / §20.4 #5 */
    var periphs = [];
    if (has('getInventoryView')) {
      arr(tryCall(function () { return Engine.getInventoryView(); })).forEach(function (it) {
        if (it && it.category === 'peripheral' && (it.qty || 0) > 0) periphs.push(it);
      });
    }
    if (!periphs.length) { doSellMachine(jobId, [], rectBefore); return; }   // nothing to bundle — sell as before

    var est = null;
    if (has('appraiseRefurb')) {
      var ap = tryCall(function () { return Engine.appraiseRefurb(jobId); });
      if (ap && ap.ok !== false && ap.estimate !== undefined) est = ap.estimate;
    }
    /* §19.6 — per-item bundled value: engine-shipped when present, else
     * derived from today's market price × CONFIG.BUNDLE_VALUE_MULT (the
     * engine's own sale formula), so the running total stays honest. */
    var bMult = null, bMax = 3;
    try {
      if (window.Engine && Engine.CONFIG) {
        if (Engine.CONFIG.BUNDLE_VALUE_MULT) bMult = Number(Engine.CONFIG.BUNDLE_VALUE_MULT);
        if (Engine.CONFIG.BUNDLE_MAX) bMax = Engine.CONFIG.BUNDLE_MAX | 0;
      }
    } catch (e) { /* defaults hold */ }
    function bundleValOf(it) {
      if (it.bundleValue !== undefined && it.bundleValue !== null) return Number(it.bundleValue);
      if (bMult && it.curPrice !== undefined && it.curPrice !== null) {
        return Math.round(Number(it.curPrice) * bMult * 100) / 100;
      }
      return null;
    }
    var haveBundleVals = periphs.every(function (it) { return bundleValOf(it) !== null; });

    var body = '<div class="sell-bundle">' +
      (est !== null ? '<p>Machine appraises at about <b class="num">' + esc(fm(est)) + '</b>.</p>' : '') +
      '<p class="muted small">Throw in up to <b>' + bMax + '</b> peripherals from the shelf — bundled extras sell at a premium ' +
      'over their market value' + (haveBundleVals ? '' : ' (premium applied at sale)') + '.</p>';
    periphs.forEach(function (it, i) {
      var bv = bundleValOf(it);
      var shown = bv !== null ? bv : it.curPrice;
      body += '<label class="bundle-row"><input type="checkbox" class="bundle-check" data-part="' + esc(it.partId) +
        '" data-value="' + esc(bv !== null ? bv : '') + '" id="bundle-ck-' + i + '">' +
        '<span class="bundle-name">' + esc(it.name) + '</span>' +
        '<span class="num muted small">' + esc(fm(shown)) + (bv !== null ? ' bundled' : ' market') + '</span>' +
        '</label>';
    });
    body += '<div class="bundle-total small"' + (haveBundleVals ? '' : ' hidden') + '>Bundle adds: <b class="num" id="bundle-total-val">' +
      esc(fm(0)) + '</b></div></div>';

    var modal = UI.modal({
      title: 'Sell machine',
      html: body,
      buttons: [
        { label: 'Cancel', cls: 'btn' },
        { label: 'Sell', cls: 'btn btn-primary', onClick: function () {
            var picked = [];
            document.querySelectorAll('.bundle-check:checked').forEach(function (c) {
              picked.push(c.getAttribute('data-part'));
            });
            doSellMachine(jobId, picked, rectBefore);
          } }
      ]
    });
    if (!modal) return;
    modal.el.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('bundle-check')) return;
      var checked = modal.el.querySelectorAll('.bundle-check:checked');
      if (checked.length > bMax) {        // §19.6 cap (CONFIG.BUNDLE_MAX)
        t.checked = false;
        UI.toast(bMax + ' peripheral' + (bMax === 1 ? '' : 's') + ' per bundle — pick your best', 'info');
        return;
      }
      var totEl = modal.el.querySelector('#bundle-total-val');
      if (totEl) {
        var sum = 0;
        modal.el.querySelectorAll('.bundle-check:checked').forEach(function (c) {
          sum += parseFloat(c.getAttribute('data-value')) || 0;
        });
        totEl.textContent = fm(sum);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * §19.9 #8 — completion flash: the re-render removes the finished card
   * instantly (input never waits); a short-lived "ghost" at its old spot
   * plays the success flash + collapse. Skipped under reduced motion.
   * ------------------------------------------------------------------ */
  function cardRectOf(jobId) {
    var el = document.getElementById('jobcard-' + jobId);
    return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  }
  function spawnDoneGhost(rect) {
    if (!rect || !(UI.motionOK && UI.motionOK())) return;
    var z = (UI.zoom && UI.zoom.factor) || 1;
    var d = document.createElement('div');
    d.className = 'job-done-ghost';
    d.style.left = (rect.left / z) + 'px';
    d.style.top = (rect.top / z) + 'px';
    d.style.width = (rect.width / z) + 'px';
    d.style.height = (rect.height / z) + 'px';
    document.body.appendChild(d);
    window.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 460);
  }

  /* §10.3/§10.4 — need pickers: keep the button label ("Assign from
   * Stock" vs "Order & Assign") and the replaces/overspend meta line in
   * sync with the highlighted option. */
  T.registerChangeHook(function (t) {
    if (t.id && t.id.indexOf('need-sel-') === 0) { updateNeedRowUI(t); return true; }
    return false;
  });

  T.registerChangeActions({
    'speed': function (el, jobId) {
      UI.act(function () { return Engine.setJobSpeed(jobId, el.value); });
    },
    'buildpart': function (el, jobId) {
      var cat = el.getAttribute('data-cat');
      var pid = el.value || null;
      UI.act(function () { return Engine.setBuildPart(jobId, cat, pid); });
    }
  });

  /* Workbench internals other modules (or ui.js) reach for. */
  S.findRunningWaitStep = findRunningWaitStep;
  S.activeJobById = activeJobById;

  T.registerTab('workbench', renderWorkbench);

})();
