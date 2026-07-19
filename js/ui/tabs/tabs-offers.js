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
      getState = S.getState, emptyBox = S.emptyBox, has = S.has,
      typeChip = S.typeChip, tasteChip = S.tasteChip, customerLine = S.customerLine,
      dueText = S.dueText, osChip = S.osChip, regularChip = S.regularChip,
      shortTitle = S.shortTitle;

  /* §21.4 — compact client chip for offers from known clients: name +
   * loyalty tier, or a "referred by X" variant for a fresh referral offer.
   * Feature-detected across the likely field homes (job.clientId + a
   * pre-resolved job.client summary, or a lookup via Engine.getClient;
   * job.referredBy for the referral variant) so this renders nothing at
   * all — never a crash or a bogus chip — until the CRM engine fields
   * land. Click opens the CRM detail (§21.4, T.openClientDetail). */
  function clientChipOf(j) {
    if (!j) return null;
    if (j.referredBy) return { referred: true, label: String(j.referredBy) };
    var cid = j.clientId !== undefined && j.clientId !== null ? j.clientId
      : (j.client && j.client.id !== undefined ? j.client.id : null);
    if (cid === null || cid === undefined) return null;
    var name = (j.client && j.client.name) || null;
    var tier = (j.client && (j.client.loyaltyTier || j.client.tier)) || null;
    if ((!name || !tier) && has('getClient')) {
      var cv = tryCall(function () { return Engine.getClient(cid); });
      if (cv && cv.ok !== false) {
        name = name || cv.name;
        if (!tier) tier = (cv.loyaltyTier && typeof cv.loyaltyTier === 'object') ? cv.loyaltyTier.label : cv.loyaltyTier;
      }
    }
    if (!name) return null;
    return { referred: false, id: cid, label: name, tier: (tier && typeof tier === 'object') ? (tier.label || tier.name) : tier };
  }
  /* §22.2 #9 — this chip sits right next to customerLine(j), which already
   * printed the customer's name (+ type chip): the chip itself shows TIER
   * ONLY, never the name again. The "referred by X" variant is unchanged —
   * X is a different person (the referrer), not the customer being repeated. */
  function clientChipHTML(info) {
    if (!info) return '';
    if (info.referred) {
      return '<span class="chip chip-client" title="This offer arrived because an existing client referred them to your shop">' +
        '🤝 referred by ' + esc(info.label) + '</span>';
    }
    var tierTxt = info.tier || 'Known client';
    return '<button type="button" class="chip chip-client" data-action="client-chip" data-client="' + esc(info.id) +
      '" title="Open ' + esc(info.label) + '’s client record">' + esc(tierTxt) + '</button>';
  }

  /* §16.1 — light type-filter buckets for the Offers pill row (a filter,
   * not real buckets — 'all' is the default view). */
  function offerBucketOf(j) {
    if (accountInfoOf(j) || j.type === 'contract') return 'contracts';
    if (j.type === 'device_repair') return 'devices';
    if (j.type === 'build' || j.type === 'enthusiast') return 'builds';
    return 'service';
  }

  /* §19.9 #15 — an offer gated behind a certification you haven't earned.
   * Feature-detected across the likely field homes; the engine may ship
   * an object ({id,name,abbr,met}) or a plain cert name, or just a locked
   * flag + reason. null = not cert-locked (or already qualified). */
  function certLockOf(j) {
    if (!j) return null;
    var c = j.requiresCert !== undefined ? j.requiresCert
      : (j.certRequired !== undefined ? j.certRequired
        : (j.certLock !== undefined ? j.certLock : null));
    if (!c) return null;
    var met = (typeof c === 'object' && c.met !== undefined) ? !!c.met
      : (j.certMet !== undefined ? !!j.certMet : false);
    if (met) return null;
    var name = (typeof c === 'object') ? (c.name || c.abbr || c.id) : c;
    return name ? { name: String(name) } : null;
  }
  function certLockLine(lock) {
    return '<div class="meta-row"><span class="cert-lock small" title="Certifications are studied under Shop &rsaquo; Training">' +
      '🎓 Needs the <b>' + esc(lock.name) + '</b> certification — study it under Shop &rsaquo; Training.</span></div>';
  }

  /* §19.9 #15 — plain-language contract terms behind an expandable line.
   * Every number is feature-detected; missing fields drop their bullet. */
  function contractHowHTML(j, st) {
    var isContract = j.type === 'contract' ||
      j.subtype === 'contract_build' || j.subtype === 'contract_upgrade';
    if (!isContract) return '';
    var units = Number(j.units) || 0;
    var what = j.subtype === 'contract_upgrade' ? 'upgrade' : 'assemble';
    var items = [];
    if (units > 1) {
      items.push('<b>The work:</b> ' + what + ' <b>' + units + '</b> identical machines. ' +
        'Progress counts one finished machine at a time' +
        (j.perUnitHours ? ' (~' + esc(j.perUnitHours) + 'h each at standard pace)' : '') + '.');
    }
    if (j.needs && j.needs.length) {
      items.push('<b>Per machine:</b> every unit needs its parts sourced and assigned — ' +
        'the parts picker on the Workbench walks you through each fill.');
    }
    if (j.pay !== null && j.pay !== undefined) {
      items.push('<b>The money:</b> one payment of <b class="num">' + esc(fm(j.pay)) +
        '</b> when the last machine is delivered — no partial pay for partial work' +
        (what === 'assemble' ? ', and parts come out of your pocket along the way' : '') + '.');
    }
    if (j.deadlineDay !== null && j.deadlineDay !== undefined && st) {
      var daysLeft = Math.max(0, j.deadlineDay - st.day);
      var paceR = Math.round((daysLeft / units) * 10) / 10;
      var pace = (units > 1 && daysLeft > 0)
        ? ' That works out to about one machine every ' + paceR + ' day' + (paceR === 1 ? '' : 's') + '.'
        : '';
      items.push('<b>The clock:</b> everything is due by <b>' + esc(S.fmtDay(j.deadlineDay)) + '</b>' +
        ' (' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' from today).' + pace);
    }
    items.push('<b>If you miss it:</b> the whole contract fails — no pay, even for finished machines, ' +
      'a hit to your rating, and a mark on your contract record.');
    return '<details class="how-works"><summary>How this works</summary><ul class="small">' +
      items.map(function (it) { return '<li>' + it + '</li>'; }).join('') +
      '</ul></details>';
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
      var lock = certLockOf(j);   // §19.9 #15
      html += '<div class="card job-card" id="offercard-' + j.id + '">' +
        '<div class="card-title">' + esc(shortTitle(j.title)) +           // §22.2 #1
          (j.rush ? ' <span class="badge b-rush">RUSH</span>' : '') + '</div>' +
        '<div class="meta-row">' + typeChip(j) + UI.wrenches(j.difficulty) + regularChip(j) + tasteChip(j) + osChip(j) + '</div>' +
        (j.blurb ? '<div class="blurb">&ldquo;' + esc(j.blurb) + '&rdquo;</div>' : '') +
        '<div class="meta-row">' + customerLine(j) + clientChipHTML(clientChipOf(j)) + '</div>' +   // §21.4
        '<div class="meta-row flex-between">' +
          '<span class="pay num">' + (j.pay !== null && j.pay !== undefined ? fm(j.pay) : 'Market-priced') + '</span>' +
          '<span class="' + (due.urgent ? 'due-soon' : 'muted') + '">' + esc(due.txt) + '</span>' +
        '</div>' +
        (partsEst ? '<div class="meta-row">' + partsEst + '</div>' : '') +
        contractHowHTML(j, st) +                       // §19.9 #15
        (lock ? certLockLine(lock) : '') +             // §19.9 #15
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="accept" data-job="' + j.id + '"' +
            (lock ? ' disabled title="Needs the ' + esc(lock.name) + ' certification — Shop &rsaquo; Training"' : '') +
            '>Accept</button>' +
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
    return '<div class="card job-card account-card" id="offercard-' + j.id + '">' +
      '<div class="card-title">' + esc(shortTitle(j.title) || (acct.name || 'Local business')) +   // §22.2 #1
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
      /* §19.9 #8 — capture the card's spot before the re-render removes it */
      var cardEl = document.getElementById('offercard-' + jobId);
      var rectBefore = cardEl && cardEl.getBoundingClientRect ? cardEl.getBoundingClientRect() : null;
      var ac = UI.act(function () { return Engine.acceptOffer(jobId); });
      if (ac && ac.ok !== false) {
        S.spawnGhost(rectBefore, 'offer-out-ghost', 320);   // §19.9 #8 slide-out
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
