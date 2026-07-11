/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-offers.js  (§17.3 split)
 * The Offers tab: job-offer cards, §16.1 type-filter pills, §15.4
 * business-account offer variant, §16.3c parts estimates.
 * Moved verbatim from the tabs.js monolith — zero behavior change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox,
      typeChip = S.typeChip, tasteChip = S.tasteChip, customerLine = S.customerLine,
      dueText = S.dueText, osChip = S.osChip, regularChip = S.regularChip;

  /* §16.1 — light type-filter buckets for the Offers pill row (a filter,
   * not real buckets — 'all' is the default view). */
  function offerBucketOf(j) {
    if (accountInfoOf(j) || j.type === 'contract') return 'contracts';
    if (j.type === 'device_repair') return 'devices';
    if (j.type === 'build' || j.type === 'enthusiast') return 'builds';
    return 'service';
  }

  /* §16.3c — rough pre-accept parts-cost range on upgrade offers
   * (engine field job.partsEstimate {min,max}; absent = no line). */
  function partsEstHTML(j) {
    var pe = j && j.partsEstimate;
    if (!pe || pe.min === null || pe.min === undefined || pe.max === null || pe.max === undefined) return '';
    return '<span class="parts-est small" title="Rough cost of a qualifying part on today\'s market — parts are billed to the customer at +25% on completion">' +
      'parts est. ' + esc(fm(pe.min)) + '–' + esc(fm(pe.max)) + ' · billed to customer +25%</span>';
  }

  function renderOffers(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var offers = arr(tryCall(function () { return Engine.getOffers(); }));
    if (!offers.length) {
      panel.innerHTML = '<h2 class="section-title">Job Offers</h2>' +
        emptyBox('No offers today — check back tomorrow. Ending the day brings fresh customers through the door.');
      return;
    }

    /* §16.1 — filter pill row with counts; zero-count pills hide (except
     * All) and a hidden active selection falls back to All. */
    var counts = { service: 0, builds: 0, contracts: 0, devices: 0 };
    offers.forEach(function (j) { counts[offerBucketOf(j)]++; });
    var pills = [
      { id: 'all', label: 'All', count: offers.length },
      { id: 'service', label: 'Repairs & Service', count: counts.service, hidden: !counts.service },
      { id: 'builds', label: 'Builds', count: counts.builds, hidden: !counts.builds },
      { id: 'contracts', label: 'Contracts & Accounts', count: counts.contracts, hidden: !counts.contracts },
      { id: 'devices', label: 'Devices', count: counts.devices, hidden: !counts.devices }
    ];
    var cur = UI.activeSubTab('offers', pills);

    var html = '<h2 class="section-title">Job Offers <span class="muted small">(' + offers.length + ' waiting — unanswered offers expire after a few days)</span></h2>' +
      UI.subTabsHTML('offers', pills);

    var shown = offers.filter(function (j) { return cur === 'all' || offerBucketOf(j) === cur; });
    if (!shown.length) {
      html += emptyBox('No offers of this kind right now — check the other filters or end the day for fresh customers.');
      panel.innerHTML = html;
      return;
    }

    html += '<div class="cards">';
    shown.forEach(function (j) {
      /* §15.4 — business-account retainers get their own card variant */
      var acct = accountInfoOf(j);
      if (acct) { html += accountOfferCardHTML(j, acct, st); return; }

      var due = dueText(j, st);
      var partsEst = partsEstHTML(j);
      html += '<div class="card job-card">' +
        '<div class="card-title">' + esc(j.title) +
          (j.rush ? ' <span class="badge b-rush">RUSH</span>' : '') + '</div>' +
        '<div class="meta-row">' + typeChip(j) + UI.wrenches(j.difficulty) + regularChip(j) + tasteChip(j) + osChip(j) + '</div>' +
        (j.blurb ? '<div class="blurb">&ldquo;' + esc(j.blurb) + '&rdquo;</div>' : '') +
        '<div class="meta-row">' + customerLine(j) + '</div>' +
        '<div class="meta-row flex-between">' +
          '<span class="pay num">' + (j.pay !== null && j.pay !== undefined ? fm(j.pay) : 'Market-priced') + '</span>' +
          '<span class="' + (due.urgent ? 'due-soon' : 'muted') + '">' + esc(due.txt) + '</span>' +
        '</div>' +
        (partsEst ? '<div class="meta-row">' + partsEst + '</div>' : '') +
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="accept" data-job="' + j.id + '">Accept</button>' +
          '<button type="button" class="btn btn-sm" data-action="decline" data-job="' + j.id + '">Decline</button>' +
        '</div>' +
      '</div>';
    });
    panel.innerHTML = html + '</div>';
  }

  /* §15.4 — business-account offer detection: the engine may hang the
   * retainer terms off job.account / job.businessAccount, or type the job
   * itself. Absent all of these, the offer renders as a normal card. */
  function accountInfoOf(j) {
    if (!j) return null;
    if (j.account && typeof j.account === 'object') return j.account;
    if (j.businessAccount && typeof j.businessAccount === 'object') return j.businessAccount;
    if (j.type === 'account' || j.type === 'business_account') return j;
    return null;
  }

  function accountOfferCardHTML(j, acct, st) {
    var due = dueText(j, st);
    var fee = acct.monthlyFee !== undefined && acct.monthlyFee !== null ? acct.monthlyFee : j.pay;
    return '<div class="card job-card account-card">' +
      '<div class="card-title">' + esc(j.title || ((acct.name || 'Local business') + ' — service retainer')) +
        ' <span class="badge b-account">BUSINESS ACCOUNT</span></div>' +
      (j.blurb ? '<div class="blurb">&ldquo;' + esc(j.blurb) + '&rdquo;</div>' : '') +
      '<div class="meta-row small">' +
        (fee !== undefined && fee !== null ? '<span class="chip">Retainer <b class="num">' + esc(fm(fee)) + '</b>/month</span>' : '') +
        (acct.jobsPerMonth ? '<span class="chip">' + esc(acct.jobsPerMonth) + ' service job' + (Number(acct.jobsPerMonth) === 1 ? '' : 's') + '/month, auto-accepted</span>' : '') +
        (acct.minRating ? '<span class="chip chip-risk" title="The account cancels — with a reputation hit — if your rating drops below this or you fail two of their jobs in a month">Keep rating ≥ ' + esc(acct.minRating) + '</span>' : '') +
      '</div>' +
      '<div class="meta-row flex-between">' +
        '<span class="muted small">Their service jobs come with relaxed deadlines — steady money for steady work.</span>' +
        '<span class="' + (due.urgent ? 'due-soon' : 'muted') + '">' + esc(due.txt) + '</span>' +
      '</div>' +
      '<div class="job-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="accept" data-job="' + j.id + '">Sign the account</button>' +
        '<button type="button" class="btn btn-sm" data-action="decline" data-job="' + j.id + '">Decline</button>' +
      '</div>' +
    '</div>';
  }

  /* ---- actions ---- */
  T.registerActions({
    'accept': function (el, jobId) {
      var ac = UI.act(function () { return Engine.acceptOffer(jobId); });
      if (ac && ac.ok !== false) {
        if (UI.audio && UI.audio.sfx) UI.audio.sfx('accept');
        UI.toast(ac.accountSigned
          ? 'Account signed — their service jobs will land straight on your bench'
          : 'Job accepted — it is on your Workbench', 'success');
        /* §16.2d — engine's bench-load feasibility heads-up (info, not error) */
        if (ac.warning) UI.toast(ac.warning, 'info', 6500);
      }
    },
    'decline': function (el, jobId) {
      var dc = UI.act(function () { return Engine.declineOffer(jobId); });
      if (dc && dc.ok !== false && UI.audio && UI.audio.sfx) UI.audio.sfx('decline');
    }
  });

  T.registerTab('offers', renderOffers);

})();
