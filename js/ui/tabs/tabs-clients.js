/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-clients.js  (§21.4)
 * The Clients tab: People (every served customer, remembered) and
 * Businesses (retainer accounts whose fleets and seat counts move with the
 * quality of service). Built against the §21.1/§21.3 engine view shapes;
 * every engine field is feature-detected so the tab still renders sensibly
 * (a "coming online" state, not a crash or a blank panel) if this module
 * lands before Engine.getClients()/getClient()/the extended getAccounts().
 *
 * UI computes NO rules here: everything below is a render of engine views
 * (Engine.getClients/getClient/getAccounts) or a client-side sort/search/
 * filter over what those views already returned — same discipline as the
 * §20.3 Parts Market drilldown's UI-side sort.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox, has = S.has,
      perfStr = S.perfStr, prettySubtype = S.prettySubtype,
      custTypeLabel = S.custTypeLabel, animatedBar = S.animatedBar;

  var clientsSearchTimer = null;
  var refocusClientsSearch = false;

  /* ------------------------------------------------------------------ *
   * Loyalty: engine-provided label preferred; DATA.FLAVOR.loyaltyTiers
   * (same table the engine itself is tuned against, §21.5) is only a
   * DISPLAY fallback for a numeric loyalty value with no label yet —
   * never a re-derivation of the engine's actual tier rule.
   * ------------------------------------------------------------------ */
  function loyaltyTierFallbackLabel(val) {
    try {
      var tiers = window.DATA && DATA.FLAVOR && DATA.FLAVOR.loyaltyTiers;
      if (Array.isArray(tiers) && tiers.length) {
        var best = tiers[0];
        for (var i = 0; i < tiers.length; i++) {
          if (tiers[i] && Number(val) >= Number(tiers[i].minLoyalty)) best = tiers[i];
        }
        return (best && best.label) || '';
      }
    } catch (e) { /* ignore */ }
    return '';
  }
  function loyaltyOf(c) {
    var val = Number(c.loyalty !== undefined && c.loyalty !== null ? c.loyalty
      : (c.loyaltyValue !== undefined ? c.loyaltyValue : NaN));
    if (!isFinite(val)) val = 0;
    var label = null;
    if (c.loyaltyTier !== undefined && c.loyaltyTier !== null) {
      label = (typeof c.loyaltyTier === 'object') ? (c.loyaltyTier.label || c.loyaltyTier.name) : String(c.loyaltyTier);
    }
    if (!label) label = loyaltyTierFallbackLabel(val);
    return { value: val, label: label || '' };
  }
  /** Reuses UI.starsHTML (the same widget the header rating uses) scaled
   * from the 0..100 loyalty range to the widget's native 0..5. */
  function loyaltyStarsHTML(val) {
    return '<span class="loyalty-stars">' + UI.starsHTML(Math.max(0, Math.min(100, val)) / 20) + '</span>';
  }

  /* ------------------------------------------------------------------ *
   * People — sortable/searchable list + expandable detail
   * ------------------------------------------------------------------ */
  var CLIENT_SORT_FIELDS = [
    { key: 'name', label: 'Name' },
    { key: 'loyalty', label: 'Loyalty' },
    { key: 'visits', label: 'Visits' },
    { key: 'lastSeen', label: 'Last seen' }
  ];
  function clientSortValue(c, key) {
    switch (key) {
      case 'name': return String(c.name || '').toLowerCase();
      case 'loyalty': return loyaltyOf(c).value;
      case 'visits': return Number(c.visits) || 0;
      case 'lastSeen': return (c.lastSeenDay === null || c.lastSeenDay === undefined) ? -Infinity : Number(c.lastSeenDay);
      default: return 0;
    }
  }
  function currentClientSort() {
    var s = UI.state.clientsSort;
    if (!s || !s.key) { s = { key: 'name', dir: 'asc' }; UI.state.clientsSort = s; }
    return s;
  }
  function sortClients(list) {
    var s = currentClientSort();
    var mul = s.dir === 'desc' ? -1 : 1;
    var copy = list.slice();
    copy.sort(function (a, b) {
      var va = clientSortValue(a, s.key), vb = clientSortValue(b, s.key);
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return copy;
  }
  function clientSortPillsHTML() {
    var s = currentClientSort();
    var h = '<div class="chips sort-pills">';
    CLIENT_SORT_FIELDS.forEach(function (f) {
      var active = s.key === f.key;
      var arrow = active ? (s.dir === 'desc' ? ' ▼' : ' ▲') : '';
      h += '<button type="button" class="chip-btn' + (active ? ' active' : '') +
        '" data-action="clients-sort" data-key="' + esc(f.key) + '">' + esc(f.label) + arrow + '</button>';
    });
    return h + '</div>';
  }

  function howLoyaltyWorksHTML() {
    var items = [
      '<b>Earning it:</b> loyalty rises when you finish their jobs on time — more for a top (5-star) score, ' +
        'a well-handled approval call, or fitting a part that matches their taste.',
      '<b>Losing it:</b> it falls on a late finish, a failed job, a warranty callback, or overcharging them on parts.',
      '<b>Idle drift:</b> loyalty decays slowly if a client does not come back for a long stretch.',
      '<b>Regulars:</b> a well-served client crosses into "Regular" in about 2-3 visits — regulars pay a +10% ' +
        'premium on their jobs and their taste in parts sticks around.',
      '<b>High loyalty:</b> your most trusted clients get an extra day of deadline slack, and sometimes send a ' +
        'friend your way — a fresh offer arrives tagged as their referral.'
    ];
    return '<details class="how-works"><summary>How loyalty works</summary><ul class="small">' +
      items.map(function (it) { return '<li>' + it + '</li>'; }).join('') + '</ul></details>';
  }

  function machineListHTML(machines) {
    machines = arr(machines);
    if (!machines.length) return '<p class="muted small">No machine on file yet.</p>';
    var h = '<div class="cards client-machines">';
    machines.forEach(function (m) {
      if (!m) return;
      var spec = m.specSummary || perfStr(m.perf) || '';
      h += '<div class="card">' +
        '<div class="card-title">' + esc(m.name || 'Machine') +
          (m.year ? ' <span class="muted small">(' + esc(m.year) + ')</span>' : '') + '</div>' +
        (spec ? '<div class="asis-spec">' + esc(spec) + '</div>' : '') +
        '<div class="meta-row small">' +
          (m.builtByShop ? '<span class="chip chip-built">🛠 Built by you</span>' : '') +
          (m.acquiredDay !== undefined && m.acquiredDay !== null
            ? '<span class="muted">Acquired ' + esc(S.fmtDay(m.acquiredDay)) + '</span>' : '') +
        '</div></div>';
    });
    return h + '</div>';
  }

  var WORKLOG_OUTCOME = {
    done: { label: '✓ On time', cls: 'done' },
    late: { label: '⏰ Late', cls: 'late' },
    failed: { label: '✗ Failed', cls: 'failed' },
    callback: { label: '↺ Callback', cls: 'callback' },
    abandoned: { label: '⊘ Abandoned', cls: 'abandoned' }
  };
  function outcomeChipHTML(outcome) {
    if (!outcome) return '';
    var o = WORKLOG_OUTCOME[outcome] || { label: prettySubtype(outcome), cls: '' };
    return '<span class="chip chip-outcome ' + esc(o.cls) + '">' + esc(o.label) + '</span>';
  }
  function workLogHTML(log) {
    log = arr(log);
    if (!log.length) return '<p class="muted small">No completed jobs on record yet.</p>';
    var h = '<ul class="worklog-list small">';
    log.forEach(function (w) {
      if (!w) return;
      h += '<li><span class="muted">' + esc(S.fmtDay(w.day)) + '</span> — ' + esc(w.title || 'Job') + ' ' +
        outcomeChipHTML(w.outcome) +
        (w.pay !== undefined && w.pay !== null ? ' <span class="num">' + esc(fm(w.pay)) + '</span>' : '') +
        (w.score !== undefined && w.score !== null ? ' <span class="muted small">score ' + esc(w.score) + '/5</span>' : '') +
        '</li>';
    });
    return h + '</ul>';
  }

  /** Shared by the People expandable row and the offer/workbench chip's
   * modal popup (§21.4 — "modal reusing the People detail markup"). */
  function clientDetailHTML(c) {
    var h = '';
    if (c.tasteBrand) {
      h += '<p class="small"><span class="chip chip-taste">♥ Prefers ' + esc(c.tasteBrand) + ' parts</span></p>';
    }
    if (c.referredBy) {
      h += '<p class="small"><span class="chip chip-client" title="This client came to your shop through a referral">' +
        '🤝 Referred by ' + esc(c.referredBy) + '</span></p>';
    }
    h += '<h4 class="sub-title">Machines</h4>' + machineListHTML(c.machines);
    h += '<h4 class="sub-title">Work history</h4>' + workLogHTML(c.workLog);
    return h;
  }

  function clientRowHTML(c) {
    var open = !!UI.state.clientsOpen[String(c.id)];
    var loy = loyaltyOf(c);
    var typeLbl = custTypeLabel(c.type);
    var h = '<tr class="wiki-row" data-action="client-toggle" data-client="' + esc(c.id) + '" title="Click for details">' +
      '<td class="muted">' + (open ? '▾' : '▸') + '</td>' +
      '<td>' + esc(c.name || 'Client') +
        (c.regular ? ' <span class="chip chip-regular">Regular</span>' : '') +
        (typeLbl ? ' <span class="chip">' + esc(typeLbl) + '</span>' : '') + '</td>' +
      '<td>' + esc(loy.label) + ' <span class="muted small">(' + Math.round(loy.value) + '/100)</span> ' +
        loyaltyStarsHTML(loy.value) + '</td>' +
      '<td class="num">' + (c.visits !== undefined && c.visits !== null ? esc(c.visits) : '—') + '</td>' +
      '<td class="muted small">' + esc(S.fmtDay(c.lastSeenDay)) + '</td>' +
      '</tr>';
    if (open) {
      h += '<tr class="wiki-detail"><td colspan="5">' + clientDetailHTML(c) + '</td></tr>';
    }
    return h;
  }

  function restoreClientsFocus() {
    if (refocusClientsSearch) {
      refocusClientsSearch = false;
      var inp = document.getElementById('clients-search');
      if (inp) {
        inp.focus();
        var len = inp.value.length;
        try { inp.setSelectionRange(len, len); } catch (e) { /* ignore */ }
      }
    }
  }

  /** Returns the People sub-tab body as an HTML string (the caller prefixes
   * the shared Clients header + sub-tab pills — see renderClientsPanel). */
  function peopleHTML() {
    var html = howLoyaltyWorksHTML();

    if (!has('getClients')) {
      return html + emptyBox('Client records are still coming online — the engine side of the Clientele update ' +
        'has not landed in this build yet. Nothing else about your shop is affected; check back soon.');
    }

    var clients = arr(tryCall(function () { return Engine.getClients(); }));
    if (!clients.length) {
      return html + emptyBox('No clients yet — serve your first customer and they will show up here, machines and all.');
    }

    var q = String(UI.state.clientsSearch || '');
    var needle = q.toLowerCase().trim();
    var shown = needle
      ? clients.filter(function (c) { return String(c && c.name || '').toLowerCase().indexOf(needle) !== -1; })
      : clients.slice();

    html += '<div class="market-controls">' + clientSortPillsHTML() +
      '<input type="search" id="clients-search" placeholder="Search clients…" value="' + esc(q) + '" autocomplete="off"></div>';

    if (!shown.length) {
      return html + emptyBox('No clients match “' + esc(q) + '”.');
    }

    shown = sortClients(shown);
    html += '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th></th><th>Name</th><th>Loyalty</th><th class="num">Visits</th><th>Last seen</th>' +
      '</tr></thead><tbody>';
    shown.forEach(function (c) { if (c) html += clientRowHTML(c); });
    html += '</tbody></table></div>';
    return html;
  }

  /* ------------------------------------------------------------------ *
   * Businesses — account cards with kind/seats/health/fleet
   * ------------------------------------------------------------------ */

  /** §21.3's extended Engine.getAccounts() is the primary source; while it
   * is still landing, fall back to the pre-existing getBusinessAccounts/
   * state.accounts (kind/seats/health/fleet simply won't render — every
   * field below is individually feature-detected). null = nothing at all
   * to show (not even the legacy view exists). */
  function accountsSource(st) {
    if (has('getAccounts')) {
      var av = tryCall(function () { return Engine.getAccounts(); });
      if (Array.isArray(av)) return av;
    }
    if (has('getBusinessAccounts')) {
      var bv = tryCall(function () { return Engine.getBusinessAccounts(); });
      if (Array.isArray(bv)) return bv;
    }
    if (st && Array.isArray(st.accounts)) return st.accounts;
    return null;
  }

  function kindLabel(kind) {
    if (!kind) return '';
    if (typeof kind === 'object') return kind.label || kind.id || '';
    try {
      var table = window.DATA && DATA.BUSINESS_KINDS;
      if (Array.isArray(table)) {
        for (var i = 0; i < table.length; i++) {
          if (table[i] && table[i].id === kind) return table[i].label || String(kind);
        }
      }
    } catch (e) { /* ignore */ }
    return prettySubtype(String(kind));
  }

  function seatTrendHTML(a) {
    var trend = a.seatsTrend || a.trend || null;
    if (!trend) return '';
    var reason = a.seatsTrendReason || a.trendReason || a.lastChangeReason || '';
    var arrow = trend === 'up' ? '▲' : (trend === 'down' ? '▼' : '→');
    var cls = trend === 'up' ? 'up' : (trend === 'down' ? 'down' : 'muted');
    return ' <span class="' + cls + '"' + (reason ? ' title="' + esc(reason) + '"' : '') + '>' + arrow + '</span>';
  }

  function fleetGridHTML(fleet) {
    fleet = arr(fleet);
    if (!fleet.length) return '<p class="muted small">No fleet machines on file yet.</p>';
    var h = '<div class="fleet-grid">';
    fleet.forEach(function (m) {
      if (!m) return;
      var yc = m.yearClass || m.year || '';
      h += '<div class="fleet-item"><div class="fleet-name">' + esc(m.name || 'Machine') + '</div>' +
        '<div class="meta-row small">' +
          (yc ? '<span class="chip">' + esc(String(yc)) + '</span>' : '') +
          (m.builtByShop ? '<span class="chip chip-built">🛠 Built by you</span>' : '') +
          (m.condition ? '<span class="chip">' + esc(m.condition) + '</span>' : '') +
        '</div></div>';
    });
    return h + '</div>';
  }

  function seatHistoryHTML(history) {
    history = arr(history);
    if (!history.length) return '';
    var h = '<h4 class="sub-title">Seat history</h4><ul class="worklog-list small">';
    history.forEach(function (e) {
      if (!e) return;
      var delta = Number(e.delta !== undefined ? e.delta : e.seats) || 0;
      var deltaTxt = delta > 0 ? ('+' + delta) : String(delta);
      h += '<li><span class="muted">' + esc(S.fmtDay(e.day)) + '</span> — ' +
        '<span class="' + (delta > 0 ? 'up' : (delta < 0 ? 'down' : 'muted')) + '">' + esc(deltaTxt) +
        ' seat' + (Math.abs(delta) === 1 ? '' : 's') + '</span>' +
        (e.reason ? ' — ' + esc(e.reason) : '') + '</li>';
    });
    return h + '</ul>';
  }

  function howBusinessHealthWorksHTML() {
    var items = [
      '<b>What moves it:</b> health is checked every month against three things — how up-to-date their fleet ' +
        'is for the year, how their service jobs went (on-time helps, late or failed hurts hard), and whether ' +
        'every seat has a working machine behind it.',
      '<b>Growth:</b> keep health strong and the account grows — a seat or two more, plus a commissioned build ' +
        'contract to outfit the new hires.',
      '<b>Shrink &amp; churn:</b> let it slide and seats disappear; bottom out the health meter and the account ' +
        'cancels outright, with a stinging news item.',
      '<b>Your move:</b> the same as any other client — keep their fleet current and their service jobs on time.'
    ];
    return '<details class="how-works"><summary>How business health works</summary><ul class="small">' +
      items.map(function (it) { return '<li>' + it + '</li>'; }).join('') + '</ul></details>';
  }

  function accountCardHTML(a) {
    if (!a) return '';
    var kind = kindLabel(a.kind);
    var health = (a.health !== undefined && a.health !== null && isFinite(Number(a.health))) ? Number(a.health) : null;
    var h = '<div class="card account-card account-card-full">' +
      '<div class="card-title">' + esc(a.name || 'Business client') +
        (kind ? ' <span class="chip">' + esc(kind) + '</span>' : '') + '</div>';
    if (a.seats !== undefined && a.seats !== null) {
      h += '<div class="meta-row"><span class="chip">' + esc(a.seats) + ' seat' + (Number(a.seats) === 1 ? '' : 's') +
        '</span>' + seatTrendHTML(a) + '</div>';
    }
    if (health !== null) {
      var cls = health < 35 ? 'bad' : (health < 60 ? 'warn' : 'good');
      h += '<div class="bar-row"><span class="muted small">Health</span>' +
        animatedBar('acct-health-' + a.id, health, 100, cls) +
        '<span class="num small">' + Math.round(health) + '/100</span></div>';
    }
    h += '<div class="meta-row small">' +
      (a.monthlyFee !== undefined && a.monthlyFee !== null ? '<span class="chip">' + esc(fm(a.monthlyFee)) + '/mo</span>' : '') +
      (a.jobsPerMonth ? '<span class="chip">' + esc(a.jobsPerMonth) + ' job' + (Number(a.jobsPerMonth) === 1 ? '' : 's') + '/mo</span>' : '') +
      (a.minRating
        ? '<span class="chip chip-risk" title="The account cancels — with a reputation hit — if your rating drops below this or you fail two of their jobs in a month">cancels under ' + esc(a.minRating) + '★</span>'
        : '') +
      '</div>';
    if (a.fleet !== undefined) {
      h += '<h4 class="sub-title">Fleet</h4>' + fleetGridHTML(a.fleet);
    }
    h += seatHistoryHTML(a.history);
    h += '</div>';
    return h;
  }

  /** Returns the Businesses sub-tab body as an HTML string (same contract
   * as peopleHTML — see renderClientsPanel). */
  function businessesHTML(st) {
    var html = howBusinessHealthWorksHTML();
    var accounts = accountsSource(st);

    if (accounts === null) {
      return html + emptyBox('Business account records are still coming online — check back after the next update.');
    }
    if (!accounts.length) {
      return html + emptyBox('No business accounts yet — retainer offers appear once your shop is Well-Reviewed (prestige tier 2).');
    }
    html += '<div class="cards accounts-grid">';
    accounts.forEach(function (a) { html += accountCardHTML(a); });
    html += '</div>';
    return html;
  }

  /* ------------------------------------------------------------------ *
   * Tab entry + sub-tabs (§16.1 pattern)
   * ------------------------------------------------------------------ */
  function renderClientsPanel(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }

    var pills = [
      { id: 'people', label: 'People' },
      { id: 'businesses', label: 'Businesses' }
    ];
    var cur = UI.activeSubTab('clients', pills);
    var head = '<h2 class="section-title">Clients</h2>' + UI.subTabsHTML('clients', pills);

    panel.innerHTML = head + (cur === 'businesses' ? businessesHTML(st) : peopleHTML());
    if (cur === 'people') restoreClientsFocus();
  }

  /* ---- CRM detail modal — reused by offer/workbench client chips ---- */
  T.openClientDetail = function (clientId) {
    if (!has('getClient')) { UI.toast('Client records are not available yet', 'info'); return; }
    var c = tryCall(function () { return Engine.getClient(clientId); });
    if (!c || c.ok === false) { UI.toast((c && c.error) || 'Could not find that client record', 'error'); return; }
    var loy = loyaltyOf(c);
    var head = '<div class="meta-row">' +
      (c.regular ? '<span class="chip chip-regular">Regular</span>' : '') +
      '<span class="chip">' + esc(loy.label) + ' (' + Math.round(loy.value) + '/100)</span>' +
      loyaltyStarsHTML(loy.value) +
      (c.visits !== undefined && c.visits !== null ? '<span class="muted small">' + esc(c.visits) + ' visit' + (Number(c.visits) === 1 ? '' : 's') + '</span>' : '') +
      '</div>';
    UI.modal({
      title: c.name || 'Client',
      html: '<div class="client-detail-modal">' + head + clientDetailHTML(c) + '</div>',
      buttons: [
        {
          label: 'Open in Clients tab', cls: 'btn',
          onClick: function () {
            UI.state.subTab.clients = 'people';
            UI.state.clientsOpen[String(c.id)] = true;
            UI.switchTab('clients');
          }
        },
        { label: 'Close', cls: 'btn btn-primary' }
      ]
    });
  };

  /* ---- actions ---- */
  T.registerActions({
    'clients-sort': function (el) {
      var key = el.getAttribute('data-key');
      var s = currentClientSort();
      if (s.key === key) s.dir = (s.dir === 'asc' ? 'desc' : 'asc');
      else { s.key = key; s.dir = 'asc'; }
      T.render('clients');
    },
    'client-toggle': function (el) {
      var cid = el.getAttribute('data-client');
      if (cid === null || cid === undefined) return;
      if (UI.state.clientsOpen[cid]) delete UI.state.clientsOpen[cid];
      else UI.state.clientsOpen[cid] = true;
      T.render('clients');
    },
    /* §21.4 — client chip on offers (and anywhere else that adopts it):
     * opens the CRM detail modal. Registered here (cross-tab, tabs-core-
     * style) since Offers/Workbench cards trigger it without owning it. */
    'client-chip': function (el) {
      var cid = el.getAttribute('data-client');
      if (cid !== null && cid !== undefined && T.openClientDetail) T.openClientDetail(cid);
    }
  });

  T.registerInputHook(function (t) {
    if (t.id === 'clients-search') {
      UI.state.clientsSearch = t.value;
      if (clientsSearchTimer) window.clearTimeout(clientsSearchTimer);
      clientsSearchTimer = window.setTimeout(function () {
        refocusClientsSearch = true;
        T.render('clients');
      }, 170);
      return true;
    }
    return false;
  });

  T.registerTab('clients', renderClientsPanel);

})();
