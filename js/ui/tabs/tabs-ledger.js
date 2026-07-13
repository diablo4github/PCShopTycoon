/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-ledger.js (§17.3 split)
 * The Ledger tab: §16.1 sub-tabs (Finances · Credit · Business Accounts ·
 * Achievements), P&L + lifetime stats, §15.3 credit line, §15.4 retainer
 * list, §15.5 achievements badge wall.
 * Moved verbatim from the tabs.js monolith — zero behavior change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox, has = S.has;

  function renderLedger(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var lg = tryCall(function () { return Engine.getLedger(); });
    if (!lg || lg.ok === false) { panel.innerHTML = emptyBox('No ledger data yet.'); return; }

    /* §16.1 — Ledger sub-tabs: Finances · Credit · Business Accounts ·
     * Achievements. Feature-gated pills simply don't render until their
     * engine API exists (no empty shells). */
    var hasCredit = has('getCredit');
    var accountsList = null;
    if (has('getBusinessAccounts')) {
      var bav = tryCall(function () { return Engine.getBusinessAccounts(); });
      if (Array.isArray(bav)) accountsList = bav;
    }
    if (accountsList === null && Array.isArray(st.accounts)) accountsList = st.accounts;
    var hasAch = has('getAchievements');
    var achList = hasAch ? arr(tryCall(function () { return Engine.getAchievements(); })) : [];
    var achUnlocked = achList.filter(function (a) { return a && a.unlocked; }).length;
    var creditDrawn = 0;
    if (hasCredit) {
      var crPeek = tryCall(function () { return Engine.getCredit(); });
      if (crPeek && crPeek.ok !== false) creditDrawn = Number(crPeek.drawn) || 0;
    }

    var pills = [
      { id: 'finances', label: 'Finances', title: 'Monthly P&L and lifetime totals' },
      { id: 'credit', label: 'Credit', hidden: !hasCredit,
        count: creditDrawn > 0 ? fm(creditDrawn) : undefined, title: 'Your credit line — drawn balance shown' },
      { id: 'accounts', label: 'Business Accounts', hidden: accountsList === null,
        count: accountsList ? accountsList.length : undefined, title: 'Retainer clients on monthly fees' },
      { id: 'achievements', label: 'Achievements', hidden: !hasAch,
        count: achList.length ? achUnlocked + '/' + achList.length : undefined, title: 'Badge wall — unlocked so far' }
    ];
    var cur2 = UI.activeSubTab('ledger', pills);
    var html = '<h2 class="section-title">Ledger</h2>' + UI.subTabsHTML('ledger', pills);

    if (cur2 === 'credit') {
      html += '<div class="shop-grid ledger-fin">' + (creditCardHTML(st) ||
        '<div class="card"><p class="muted small">Credit data unavailable right now.</p></div>') + '</div>';
      panel.innerHTML = html;
      return;
    }
    if (cur2 === 'accounts') {
      html += '<div class="shop-grid ledger-fin">' + (businessAccountsHTML(st) ||
        '<div class="card"><p class="muted small">Account data unavailable right now.</p></div>') + '</div>';
      panel.innerHTML = html;
      return;
    }
    if (cur2 === 'achievements') {
      html += achievementsHTML();
      panel.innerHTML = html;
      return;
    }

    /* ---- Finances (default) ---- */
    /* current month preview */
    var cur = lg.currentMonthPreview;
    if (cur) {
      html += '<h3 class="sub-title mt0">Current month' + (cur.ym ? ' (' + esc(cur.ym) + ')' : '') + ' — so far</h3>' +
        moneyKV([
          ['Revenue', cur.revenue], ['Parts cost', cur.partsCost],
          ['Fixed costs', cur.fixedCosts], ['Other', cur.other], ['Net', cur.net, true]
        ]);
    }

    /* month table */
    var months = arr(lg.months);
    html += '<h3 class="sub-title">Closed months</h3>';
    if (!months.length) {
      html += emptyBox('First month still in progress — the books close on the 1st.');
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Month</th><th class="num">Revenue</th><th class="num">Parts</th>' +
        '<th class="num">Fixed</th><th class="num">Other</th><th class="num">Net</th>' +
        '</tr></thead><tbody>';
      months.slice().reverse().forEach(function (m) {
        var net = Number(m.net) || 0;
        html += '<tr>' +
          '<td>' + esc(m.ym) + '</td>' +
          '<td class="num">' + esc(fm(m.revenue)) + '</td>' +
          '<td class="num">' + esc(fm(m.partsCost)) + '</td>' +
          '<td class="num">' + esc(fm(m.fixedCosts)) + '</td>' +
          '<td class="num">' + esc(fm(m.other)) + '</td>' +
          '<td class="num ' + (net >= 0 ? 'up' : 'down') + '"><b>' + esc(fm(net)) + '</b></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }

    /* §17.2 — reputation panel (Finances pill): the rating is a rolling
     * mean the player could never see into; this is the ledger of it. */
    html += reputationPanelHTML(st);

    /* lifetime — the "stats" half of §15.5's Achievements & Stats */
    var lt = lg.lifetime || {};
    html += '<h3 class="sub-title" id="ledger-sec-stats">Lifetime</h3><div class="kv">' +
      kvCell('Revenue', fm(lt.revenue)) +
      kvCell('Parts cost', fm(lt.partsCost)) +
      kvCell('Fixed costs', fm(lt.fixedCosts)) +
      kvCell('Other', fm(lt.other)) +
      kvCell('Jobs completed', lt.jobsCompleted || 0) +
      kvCell('Jobs failed', lt.jobsFailed || 0) +
      kvCell('Builds delivered', lt.buildsDelivered || 0) +
      kvCell('Refurbs sold', lt.refurbsSold || 0) +
      kvCell('Days played', lt.daysPlayed || 0) +
      '</div>';

    panel.innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   * §17.2 — Reputation panel. Placed on the Finances pill (not its own
   * pill): reputation is the shop's other balance sheet, and Finances is
   * where the player already reads "how am I doing" — a fifth pill would
   * bury it. Reads Engine.getReputationLog(15) — feature-detected; absent
   * engine = no panel, never an empty shell.
   * ------------------------------------------------------------------ */
  var REASON_LABELS = {
    late: 'late', 'quick work': 'quick work', 'taste matched': 'taste matched',
    'downgrade part': 'downgrade part', 'overspend': 'pricey part'
  };
  function reasonChip(rs) {
    var label = REASON_LABELS[rs] || String(rs || '');
    if (!label) return '';
    var bad = /late|quick|downgrade|overspend|pricey|fail|callback|regular/i.test(label);
    return '<span class="chip rep-reason ' + (bad ? 'neg' : 'pos') + '">' + esc(label) + '</span>';
  }
  function reputationPanelHTML(st) {
    if (!has('getReputationLog')) return '';
    var log = tryCall(function () { return Engine.getReputationLog(15); });
    if (!Array.isArray(log)) return '';
    var rep = (st && st.reputation) || {};
    var pi = null;
    try { pi = Engine.getPrestigeInfo(); } catch (e) { /* ignore */ }

    var h = '<h3 class="sub-title" id="ledger-sec-reputation">Reputation</h3>' +
      '<div class="rep-panel">' +
      '<div class="rep-head">' +
        UI.starsHTML(rep.rating) +
        '<span class="num rep-val">' + esc((Number(rep.rating) || 0).toFixed(2)) + ' / 5</span>' +
        '<span class="muted small">rolling average of your last 25 outcomes</span>' +
      '</div>' +
      (pi && (pi.progressNote || pi.nextLabel)
        ? '<div class="rep-prestige muted small">' +
            (pi.label ? '<b>' + esc(pi.label) + '</b>' : '') +
            (pi.nextLabel ? ' → ' + esc(pi.nextLabel) : '') +
            (pi.progressNote ? ' — ' + esc(pi.progressNote) : '') +
          '</div>'
        : '');

    if (!log.length) {
      h += emptyBox('No rated jobs yet — every completed job leaves a mark here.');
      return h + '</div>';
    }
    h += '<div class="table-wrap"><table class="data rep-log"><thead><tr>' +
      '<th>Job</th><th class="num">Score</th><th class="num">vs avg</th><th>Why</th>' +
      '</tr></thead><tbody>';
    log.forEach(function (e2) {
      if (!e2) return;
      var score = Number(e2.score);
      var delta = Number(e2.delta);
      var deltaTxt = isFinite(delta)
        ? '<span class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '▲' : '▼') + ' ' + esc(Math.abs(delta).toFixed(2)) + '</span>'
        : '<span class="muted">—</span>';
      var reasons = arr(e2.reasons).map(reasonChip).join(' ');
      var entryTitle = e2.title ||
        (e2.jobId != null ? 'Job #' + e2.jobId : 'Word of mouth');   // seeded openers have no job
      h += '<tr>' +
        '<td>' + esc(entryTitle) +
          (e2.day !== undefined && e2.day !== null ? ' <span class="muted small">' + esc(S.fmtDay(e2.day)) + '</span>' : '') + '</td>' +   /* §19.9 #2 */
        '<td class="num"><b class="' + (score >= 4 ? 'up' : (score < 3 ? 'down' : '')) + '">' +
          (isFinite(score) ? esc(score.toFixed(1)) : '—') + '</b></td>' +
        '<td class="num">' + deltaTxt + '</td>' +
        '<td>' + (reasons || '<span class="muted small">clean job</span>') + '</td>' +
        '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  /* ---- §15.3 credit line card ---- */
  function creditCardHTML(st) {
    if (!has('getCredit')) return '';
    var cr = tryCall(function () { return Engine.getCredit(); });
    if (!cr || cr.ok === false) return '';

    var h = '<div class="card credit-card"><div class="card-title">Credit line</div>';
    if (!cr.unlocked) {
      h += '<p class="muted small">🔒 ' + esc(cr.reason ||
        'Banks want a name they can trust — reach prestige tier 1 (Neighborhood Fixture) to open a credit line.') + '</p></div>';
      return h;
    }

    var limit = Number(cr.limit) || 0;
    var drawn = Number(cr.drawn) || 0;
    var apr = Number(cr.apr) || 0;
    var avail = Math.max(0, limit - drawn);
    h += '<div class="bar-row"><span class="muted small">Drawn</span>' +
      UI.barHTML(drawn, limit || 1, 'wide' + (drawn > 0 ? ' over' : '')) +
      '<span class="num small">' + esc(fm(drawn)) + ' of ' + esc(fm(limit)) + '</span></div>' +
      '<div class="meta-row small">' +
        '<span class="chip">APR ' + esc((apr * 100).toFixed(1)) + '%</span>' +
        (cr.monthlyInterest !== undefined && cr.monthlyInterest !== null && drawn > 0
          ? '<span class="chip chip-risk" title="Charged on the 1st with rent">~' + esc(fm(cr.monthlyInterest)) + '/month interest</span>'
          : '') +
        '<span class="muted">' + esc(fm(avail)) + ' available</span>' +
      '</div>' +
      '<div class="credit-row">' +
        '<input type="number" id="credit-draw-amt" min="1" step="50" placeholder="Amount" aria-label="Amount to draw">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="credit-draw"' +
          (avail <= 0 ? ' disabled title="The line is fully drawn"' : '') + '>Draw</button>' +
        '<input type="number" id="credit-repay-amt" min="1" step="50" placeholder="Amount" aria-label="Amount to repay">' +
        '<button type="button" class="btn btn-sm" data-action="credit-repay"' +
          (drawn <= 0 ? ' disabled title="Nothing drawn"' : '') + '>Repay</button>' +
      '</div>' +
      '<p class="muted small">Interest on the drawn balance is charged on the 1st with rent. Drawn credit never starts the bankruptcy clock — but the interest can drag your cash under.</p>' +
      '</div>';
    return h;
  }

  /* ---- §15.4 business accounts card ---- */
  function businessAccountsHTML(st) {
    var accounts = null;
    if (has('getBusinessAccounts')) {
      var av = tryCall(function () { return Engine.getBusinessAccounts(); });
      if (Array.isArray(av)) accounts = av;
    }
    if (accounts === null && st && Array.isArray(st.accounts)) accounts = st.accounts;
    if (accounts === null) return ''; // feature not landed yet

    var h = '<div class="card accounts-card"><div class="card-title">Business accounts</div>';
    if (!accounts.length) {
      h += '<p class="muted small">No retainers yet — business accounts appear as offers once your shop is Well-Reviewed (prestige tier 2).</p></div>';
      return h;
    }
    accounts.forEach(function (a) {
      if (!a) return;
      h += '<div class="account-row">' +
        '<span class="acct-name">' + esc(a.name || 'Business client') + '</span>' +
        '<span class="meta-row small">' +
          (a.monthlyFee !== undefined && a.monthlyFee !== null ? '<span class="chip">' + esc(fm(a.monthlyFee)) + '/mo</span>' : '') +
          (a.jobsPerMonth ? '<span class="chip">' + esc(a.jobsPerMonth) + ' job' + (Number(a.jobsPerMonth) === 1 ? '' : 's') + '/mo</span>' : '') +
          (a.minRating
            ? '<span class="chip chip-risk" title="The account cancels — with a reputation hit — if your rating drops below this or you fail two of their jobs in a month">cancels under ' + esc(a.minRating) + '★</span>'
            : '') +
        '</span></div>';
    });
    h += '<p class="muted small">Retainers pay on the 1st. Keep their jobs on time and your rating up, or they walk.</p></div>';
    return h;
  }

  /* ---- §15.5 achievements grid (badge wall) ---- */
  function achievementsHTML() {
    if (!has('getAchievements')) return '';
    var list = arr(tryCall(function () { return Engine.getAchievements(); }));
    var unlocked = list.filter(function (a) { return a && a.unlocked; }).length;

    var h = '<h3 class="sub-title" id="ledger-sec-achievements">Achievements' +
      (list.length ? ' <span class="muted">— ' + unlocked + ' / ' + list.length + ' unlocked</span>' : '') + '</h3>';
    if (!list.length) {
      return h + emptyBox('No achievements defined yet — they arrive with the next engine update.');
    }
    h += '<div class="ach-grid">';
    list.forEach(function (a) {
      if (!a) return;
      var isHidden = a.hidden && !a.unlocked;
      var cls = a.unlocked ? 'unlocked' : (isHidden ? 'hidden-ach' : 'locked');
      var name = isHidden ? '???' : (a.name || a.id);
      /* §19.9 #6 — hidden achievements tease their hint string when the
       * engine ships one; the generic line stays as the fallback. */
      var desc = isHidden ? (a.hint || 'Keep playing to discover this one.') : (a.desc || '');
      h += '<div class="ach-badge ' + cls + '" title="' + esc(desc) + '">' +
        '<span class="ach-ico">' + (a.unlocked ? '🏆' : (isHidden ? '❓' : '🔒')) + '</span>' +
        '<span class="ach-name">' + esc(name) + '</span>' +
        (desc ? '<span class="ach-desc">' + esc(desc) + '</span>' : '') +
        (a.unlocked && a.dayLabel ? '<span class="ach-day">' + esc(a.dayLabel) + '</span>' : '') +
        '</div>';
    });
    return h + '</div>';
  }

  function kvCell(k, v) {
    return '<div class="cell"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>';
  }

  function moneyKV(pairs) {
    var h = '<div class="kv">';
    pairs.forEach(function (p) {
      var val = Number(p[1]) || 0;
      var cls = p[2] ? (val >= 0 ? ' up' : ' down') : '';
      h += '<div class="cell"><div class="k">' + esc(p[0]) + '</div><div class="v' + cls + '">' + esc(fm(val)) + '</div></div>';
    });
    return h + '</div>';
  }

  /* ---- actions ---- */
  T.registerActions({
    /* ---- §15.3 credit line (Ledger) ---- */
    'credit-draw': function () {
      var drawEl = document.getElementById('credit-draw-amt');
      var drawAmt = drawEl ? parseFloat(drawEl.value) : NaN;
      if (!isFinite(drawAmt) || drawAmt <= 0) { UI.toast('Enter a positive amount to draw', 'info'); return; }
      var cdr = UI.act(function () { return Engine.drawCredit(drawAmt); });
      if (cdr && cdr.ok !== false) UI.toast('Drew ' + fm(drawAmt) + ' on the credit line — 0.1h of paperwork', 'success');
    },
    'credit-repay': function () {
      var repEl = document.getElementById('credit-repay-amt');
      var repAmt = repEl ? parseFloat(repEl.value) : NaN;
      if (!isFinite(repAmt) || repAmt <= 0) { UI.toast('Enter a positive amount to repay', 'info'); return; }
      var crr = UI.act(function () { return Engine.repayCredit(repAmt); });
      if (crr && crr.ok !== false) UI.toast('Repaid ' + fm(repAmt) + ' — 0.1h of paperwork', 'success');
    }
  });

  T.registerTab('ledger', renderLedger);

})();
