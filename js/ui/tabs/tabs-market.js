/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-market.js (§17.3 split)
 * The Parts Market + Inventory tabs: price table with sparklines, category
 * chips + debounced search, buy/sell (§16.3a shortfall reasons, §16.3d
 * sell-all confirm), storage meter.
 * Moved verbatim from the tabs.js monolith — zero behavior change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox,
      catLabel = S.catLabel, knownCategories = S.knownCategories, has = S.has;

  var marketTimer = null;
  var refocusMarketSearch = false;

  /* ================================================================== *
   * TAB: Inventory
   * ================================================================== */

  function renderInventory(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }

    var html = '<h2 class="section-title">Inventory</h2>';

    var stor = tryCall(function () { return Engine.getStorageInfo(); });
    if (stor && stor.ok !== false && stor.used !== undefined) {
      var capacity = Math.max(0, (stor.used || 0) + (stor.free || 0) - (stor.overage || 0));
      var over = (stor.overage || 0) > 0;
      html += '<div class="storage-meter">' +
        '<div class="flex-between"><span>Storage: <b class="num">' + (stor.used || 0) + '</b> / ' + capacity + ' slots</span>' +
        (over ? '<span class="down"><b>' + stor.overage + '</b> slots over — ' + esc(fm(stor.feePerSlot)) + '/slot fee each month</span>' : '') +
        '</div>' +
        UI.barHTML(stor.used || 0, capacity || 1, 'grow' + (over ? ' over' : '')) +
        '</div>';
    }

    var inv = arr(tryCall(function () { return Engine.getInventoryView(); }));
    if (!inv.length) {
      html += emptyBox('No parts on the shelves — stock up in the Parts Market, or strip machines you buy as-is.');
      panel.innerHTML = html;
      return;
    }

    html += '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Part</th><th>Category</th><th class="num">Qty</th><th class="num">Avg cost</th>' +
      '<th class="num">Market price</th><th class="num">Value</th><th>Sell (70% of market)</th>' +
      '</tr></thead><tbody>';
    inv.forEach(function (it) {
      var qty = it.qty || 0;
      html += '<tr>' +
        '<td>' + esc(it.name) + '</td>' +
        '<td><span class="chip">' + esc(catLabel(it.category)) + '</span></td>' +
        '<td class="num">' + qty + '</td>' +
        '<td class="num">' + esc(fm(it.avgCost)) + '</td>' +
        '<td class="num">' + esc(fm(it.curPrice)) + '</td>' +
        '<td class="num">' + esc(fm((Number(it.curPrice) || 0) * qty)) + '</td>' +
        '<td class="actions">' +
          '<button type="button" class="btn btn-sm" data-action="sell-part" data-part="' + esc(it.partId) + '" data-qty="1">Sell 1</button> ' +
          (qty > 1 ? '<button type="button" class="btn btn-sm" data-action="sell-part" data-part="' + esc(it.partId) + '" data-qty="' + qty +
            '" data-all="1" data-name="' + esc(it.name) + '" data-est="' + ((Number(it.curPrice) || 0) * qty * 0.7).toFixed(2) + '">Sell all</button>' : '') +
        '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    panel.innerHTML = html;
  }

  /* ================================================================== *
   * TAB: Parts Market
   * ================================================================== */

  function renderMarket(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }

    /* §18.1 — Retail · Suppliers sub-tabs (feature-detected: the Suppliers
     * pill only exists once the engine ships getDistributors). */
    var suppliersOk = has('getDistributors');
    var pendingCount = Array.isArray(st.pendingOrders) ? st.pendingOrders.length : 0;
    var pills = [
      { id: 'retail', label: 'Retail', title: 'Today\'s market — instant, list price' },
      { id: 'suppliers', label: 'Suppliers', hidden: !suppliersOk,
        count: pendingCount || undefined,
        title: 'Wholesale relationships — cheaper, but parts take days to arrive' }
    ];
    var cur = UI.activeSubTab('market', pills);

    if (suppliersOk && cur === 'suppliers') {
      panel.innerHTML = '<h2 class="section-title">Parts Market</h2>' +
        UI.subTabsHTML('market', pills) + suppliersHTML(st);
      return;
    }

    var cat = UI.state.marketCat || 'all';
    var q = UI.state.marketSearch || '';

    var html = '<h2 class="section-title">Parts Market</h2>' +
      (suppliersOk ? UI.subTabsHTML('market', pills) : '');
    html += '<div class="note">' + (st.supplyRunDoneToday
      ? 'Supply run done for today — further purchases cost no extra time.'
      : 'Your first parts purchase each day costs <b>0.5h</b> (supply run).') + '</div>';

    /* controls */
    html += '<div class="market-controls"><div class="chips">' + catChip('all', 'All', cat);
    knownCategories().forEach(function (c) { html += catChip(c, catLabel(c), cat); });
    html += '</div>' +
      '<input type="search" id="market-search" placeholder="Search parts…" value="' + esc(q) + '" autocomplete="off">' +
      '</div>';

    var rows = tryCall(function () {
      return Engine.getMarket({
        category: cat === 'all' ? undefined : cat,
        search: q || undefined
      });
    });
    rows = arr(rows);

    if (!rows.length) {
      html += emptyBox('No parts match — try another category or clear the search. New hardware appears as the years roll on.');
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Part</th><th>Category</th><th class="num">Price</th><th class="num">1d</th>' +
        '<th class="num">30d</th><th>Trend</th><th class="num">Owned</th><th>Buy</th>' +
        '</tr></thead><tbody>';
      var mktCash = Number(st.cash) || 0;
      /* §19.3 — retail arrives next morning; a rush surcharge (engine-
       * exposed per row) buys same-day. Feature-detected: rows without the
       * field keep the classic instant Buy. */
      var logisticsOn = rows.some(function (r) {
        return r && (r.rushCost !== undefined || r.rushSurcharge !== undefined);
      });
      function rushCostOf(r) {
        var v = r.rushCost !== undefined ? r.rushCost : r.rushSurcharge;
        return (v === null || v === undefined) ? null : Number(v);
      }
      /* §16.3a — a Buy you can't afford is disabled with the shortfall,
       * never a silent no-op (price is a UI-known estimate; the engine
       * stays the authority when it IS clickable). */
      function buyBtn(r, qty) {
        var need = (Number(r.price) || 0) * qty;
        var short = Math.max(0, need - mktCash);
        var tip = short > 0 ? 'Need ' + fm(short) + ' more'
          : (logisticsOn ? 'Arrives tomorrow morning' : '');
        return '<button type="button" class="btn btn-sm" data-action="buy" data-part="' + esc(r.partId) +
          '" data-qty="' + qty + '"' +
          (short > 0 ? ' disabled' : '') +
          (tip ? ' title="' + esc(tip) + '"' : '') +
          '>Buy ' + qty + (logisticsOn ? ' · tmrw' : '') + '</button>';
      }
      function rushBtn(r) {
        var rush = rushCostOf(r);
        if (rush === null) return '';
        var need = (Number(r.price) || 0) + rush;
        var short = Math.max(0, need - mktCash);
        return ' <button type="button" class="btn btn-sm btn-rush" data-action="buy" data-part="' + esc(r.partId) +
          '" data-qty="1" data-rush="1"' +
          (short > 0 ? ' disabled title="Need ' + esc(fm(short)) + ' more"'
            : ' title="Pay the rush surcharge for same-day delivery"') +
          '>Rush +' + esc(fm(rush)) + ' — today</button>';
      }
      rows.forEach(function (r) {
        var c1 = Number(r.change1) || 0;
        var c30 = Number(r.change30) || 0;
        var a1 = c1 > 0.05 ? '▲' : (c1 < -0.05 ? '▼' : '·');
        html += '<tr>' +
          '<td>' + esc(r.name) +
            (r.isNew ? ' <span class="badge b-new" title="Recently introduced">NEW</span>' : '') +
            (r.scarce ? ' <span class="badge b-scarce" title="Out of production — scarcity pricing">SCARCE</span>' : '') +
            (r.perfLabel ? ' <span class="muted small">' + esc(r.perfLabel) + '</span>' : '') +
            (r.tier ? ' <span class="muted small">• ' + esc(r.tier) + '</span>' : '') +
          '</td>' +
          '<td><span class="chip">' + esc(catLabel(r.category)) + '</span></td>' +
          '<td class="num"><b>' + esc(fm(r.price)) + '</b></td>' +
          '<td class="num ' + (c1 > 0.05 ? 'up' : (c1 < -0.05 ? 'down' : 'muted')) + '">' + a1 + ' ' + esc(UI.pct(c1)) + '</td>' +
          '<td class="num ' + (c30 > 0.05 ? 'up' : (c30 < -0.05 ? 'down' : 'muted')) + '">' + esc(UI.pct(c30)) + '</td>' +
          '<td><span class="spark-wrap ' + (c30 >= 0 ? 'up' : 'down') + '">' + UI.sparkSVG(r.spark) + '</span></td>' +
          '<td class="num">' + (r.inStockQty || 0) + '</td>' +
          '<td class="actions">' +
            (has('getPartInfo')
              ? '<button type="button" class="info-btn" data-action="partinfo" data-part="' + esc(r.partId) + '" title="Part details">i</button> '
              : '') +
            buyBtn(r, 1) + ' ' + buyBtn(r, 5) + rushBtn(r) +
          '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }

    panel.innerHTML = html;

    if (refocusMarketSearch) {
      refocusMarketSearch = false;
      var inp = document.getElementById('market-search');
      if (inp) {
        inp.focus();
        var len = inp.value.length;
        try { inp.setSelectionRange(len, len); } catch (e) { /* search inputs may refuse */ }
      }
    }
  }

  function catChip(id, label, current) {
    return '<button type="button" class="chip-btn' + (current === id ? ' active' : '') +
      '" data-action="mcat" data-cat="' + esc(id) + '">' + esc(label) + '</button>';
  }

  /* ================================================================== *
   * §18.1 — Suppliers (distributor deals)
   * Everything reads Engine.getDistributors() / state.pendingOrders and
   * mutates through placeOrder/cancelOrder — feature-detected throughout.
   * ================================================================== */

  var REL_LABELS = ['New', 'Regular', 'Preferred', 'Partner'];

  function relStars(rel) {
    var r = Math.max(0, Math.min(3, Math.round(Number(rel) || 0)));
    var h = '<span class="rel-stars" title="Relationship: ' + esc(REL_LABELS[r]) +
      ' — lifetime spend deepens the discount' + (r >= 2 ? '; you get priority allocation in shortages' : '') + '">';
    for (var i = 1; i <= 3; i++) h += '<span class="rel-star' + (i <= r ? ' on' : '') + '">★</span>';
    return h + ' <span class="rel-label">' + esc(REL_LABELS[r]) + '</span></span>';
  }

  function supPartName(pid, fallback) {
    if (fallback) return fallback;
    if (has('getPartInfo')) {
      var r = tryCall(function () { return Engine.getPartInfo(pid); });
      if (r && r.ok !== false && r.name) return r.name;
    }
    return pid;
  }

  function suppliersHTML(st) {
    var dists = arr(tryCall(function () { return Engine.getDistributors(); }));
    var h = '<div class="note">Wholesale runs on relationships: cheaper than retail, but orders take days to arrive ' +
      'and are paid up front. Retail stays instant — suppliers reward planning ahead.</div>';

    /* ---- pending orders first: the "what's in the pipe" answer ---- */
    var pending = Array.isArray(st.pendingOrders) ? st.pendingOrders : [];
    if (pending.length) {
      h += '<h3 class="sub-title">On the truck</h3><div class="pending-orders">';
      pending.forEach(function (o) {
        if (!o) return;
        var eta = (o.arrivesDay !== undefined && o.arrivesDay !== null)
          ? Math.max(0, o.arrivesDay - st.day) : null;
        var canCancel = has('cancelOrder') && (eta === null || eta > 0);
        /* §19.3 — retail one-day orders share this list; mark the channel */
        var isRetail = !o.distributorId || o.source === 'retail' || o.retail === true;
        h += '<div class="order-row">' +
          '<span class="order-what"><b class="num">' + esc(o.qty || 1) + '×</b> ' +
            esc(supPartName(o.partId, o.name)) + '</span>' +
          '<span class="meta-row small">' +
            '<span class="chip">' + (isRetail ? 'retail' : 'wholesale') + '</span>' +
            (o.total !== undefined && o.total !== null ? '<span class="chip">paid ' + esc(fm(o.total)) + '</span>' : '') +
            /* §19.9 #2 — real dates, never "day N" */
            '<span class="chip">' + (eta === null ? 'in transit'
              : (eta === 0 ? 'arrives tomorrow morning'
                : 'arrives ' + esc(S.fmtDay(o.arrivesDay)))) + '</span>' +
          '</span>' +
          (canCancel
            ? '<button type="button" class="btn btn-sm btn-ghost" data-action="sup-cancel" data-order="' + esc(o.id) + '"' +
              ' data-total="' + esc(o.total !== undefined ? o.total : '') + '">Cancel…</button>'
            : '') +
          '</div>';
      });
      h += '</div>';
    }

    if (!dists.length) {
      return h + emptyBox('No distributors take your calls yet — they arrive with the years and your reputation.');
    }

    /* one shared part list for the bulk-order selects (list price shown;
     * the engine quotes the real discounted cost) */
    var rows = arr(tryCall(function () { return Engine.getMarket({}); }));

    h += '<div class="supplier-cards">';
    dists.forEach(function (d) {
      if (!d) return;
      var locked = !!d.lockedReason;
      h += '<div class="card supplier-card' + (d.grayMarket ? ' gray-market' : '') + (locked ? ' locked' : '') + '">' +
        '<div class="card-title">' + esc(d.name) +
          (d.grayMarket ? ' <span class="badge b-gray" title="Off the books — deep discounts, no comebacks">GRAY MARKET</span>' : '') +
        '</div>' +
        (d.blurb ? '<p class="muted small">' + esc(d.blurb) + '</p>' : '');

      if (locked) {
        h += '<p class="muted small">🔒 ' + esc(d.lockedReason) + '</p></div>';
        return;
      }

      h += '<div class="meta-row small">' + relStars(d.relationship) +
        (d.effDiscount !== undefined && d.effDiscount !== null
          ? '<span class="chip">−' + esc(Math.round(d.effDiscount * 100)) + '% off list</span>' : '') +
        (d.leadDays !== undefined && d.leadDays !== null
          ? '<span class="chip">' + esc(d.leadDays) + '-day lead</span>' : '') +
        (Array.isArray(d.specialty) && d.specialty.length
          ? '<span class="chip" title="Deeper discounts in these categories">knows ' +
            esc(d.specialty.map(catLabel).join(', ')) + '</span>' : '') +
        '</div>';

      if (d.grayMarket) {
        h += '<div class="gray-note">⚠ No receipts, no warranty — parts from here carry a reliability penalty, ' +
          'and that means more warranty callbacks land on you.</div>';
      }

      /* this week's deals */
      var deals = arr(d.deals);
      if (deals.length) {
        h += '<div class="sub-title">This week\'s deals</div><div class="deal-rows">';
        deals.forEach(function (dl) {
          if (!dl) return;
          var expiresIn = (dl.expiresDay !== undefined && dl.expiresDay !== null)
            ? Math.max(0, dl.expiresDay - st.day) : null;
          /* §19.9 #11 — remaining allocation straight from the engine view;
           * the post-buy refresh re-pulls it so the row updates immediately */
          var remaining = (dl.remaining !== undefined && dl.remaining !== null) ? Number(dl.remaining)
            : ((dl.maxQty !== undefined && dl.maxQty !== null) ? Number(dl.maxQty) : null);
          var soldOut = remaining !== null && remaining <= 0;
          h += '<div class="deal-row">' +
            '<span class="deal-what">' + esc(supPartName(dl.partId, dl.name)) + '</span>' +
            '<span class="meta-row small">' +
              '<span class="chip deal-chip">−' + esc(Math.round((dl.dealDiscount || 0) * 100)) + '%</span>' +
              (dl.dealPrice !== undefined && dl.dealPrice !== null
                ? '<span class="num"><b>' + esc(fm(dl.dealPrice)) + '</b></span>' : '') +
              (remaining !== null
                ? '<span class="muted">' + (soldOut ? 'sold out' : remaining + (dl.maxQty ? ' of ' + esc(dl.maxQty) : '') + ' left') + '</span>'
                : '') +
              (expiresIn !== null ? '<span class="muted">' + (expiresIn === 0 ? 'last day' : 'ends ' + esc(S.fmtDay(dl.expiresDay))) + '</span>' : '') +
            '</span>' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="sup-deal" data-dist="' + esc(d.id) +
              '" data-part="' + esc(dl.partId) + '"' + (soldOut ? ' disabled title="This week\'s allocation is gone"' : '') + '>Buy 1</button>' +
            '</div>';
        });
        h += '</div>';
      } else {
        h += '<p class="muted small">No deals this week — new ones land every Monday.</p>';
      }

      /* bulk order form */
      if (has('placeOrder')) {
        h += '<div class="sub-title">Bulk order</div><div class="order-form" data-dist="' + esc(d.id) + '">' +
          '<select class="sel" id="sup-part-' + esc(d.id) + '" data-supform="' + esc(d.id) + '">';
        rows.forEach(function (r) {
          h += '<option value="' + esc(r.partId) + '" data-price="' + esc(r.price) + '">' +
            esc(r.name) + ' — list ' + esc(fm(r.price)) + '</option>';
        });
        h += '</select>' +
          '<input type="number" id="sup-qty-' + esc(d.id) + '" data-supform="' + esc(d.id) + '" min="1" max="99" step="1" value="5" aria-label="Quantity">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="sup-order" data-dist="' + esc(d.id) + '">Place order</button>' +
          '<span class="order-preview small" id="sup-prev-' + esc(d.id) + '"></span>' +
          '</div>' +
          '<p class="muted small">Paid up front, 0.2h of paperwork; bigger orders earn extra tiers (5+/10+/25+). Arrives in ~' +
            esc(d.leadDays != null ? d.leadDays : '?') + ' days into inventory — mind your storage.</p>';
      }
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  /** §18.1 — live unit-cost preview. Engine-authoritative when quoteOrder
   * exists; otherwise shows list total with an honest "discount applied at
   * order" note (the UI never invents pricing rules). */
  function updateOrderPreview(distId) {
    var sel = document.getElementById('sup-part-' + distId);
    var qtyEl = document.getElementById('sup-qty-' + distId);
    var prev = document.getElementById('sup-prev-' + distId);
    if (!sel || !qtyEl || !prev) return;
    var pid = sel.value;
    var qty = Math.max(1, parseInt(qtyEl.value, 10) || 1);
    if (has('quoteOrder')) {
      var qres = tryCall(function () { return Engine.quoteOrder(distId, pid, qty); });
      if (qres && qres.ok !== false && qres.unitCost !== undefined) {
        prev.innerHTML = '<b class="num">' + esc(fm(qres.unitCost)) + '</b>/unit · total <b class="num">' +
          esc(fm(qres.total !== undefined ? qres.total : qres.unitCost * qty)) + '</b>' +
          (qres.arrivesDay !== undefined && qres.arrivesDay !== null ? ' · lands ' + esc(S.fmtDay(qres.arrivesDay)) : '');   /* §19.9 #2 */
        return;
      }
    }
    var opt = sel.options[sel.selectedIndex];
    var list = opt ? parseFloat(opt.getAttribute('data-price')) : NaN;
    prev.innerHTML = isFinite(list)
      ? '<span class="muted">list total ' + esc(fm(list * qty)) + ' — wholesale discount applied at order</span>'
      : '';
  }

  /* ---- actions ---- */
  T.registerActions({
    /* ---- Inventory ---- */
    'sell-part': function (el) {
      var spid = el.getAttribute('data-part');
      var sqty = parseInt(el.getAttribute('data-qty'), 10) || 1;
      var doSell = function () {
        var pr = UI.act(function () { return Engine.sellPart(spid, sqty); });
        if (pr && pr.ok !== false) UI.toast('Sold ' + sqty + ' for ' + fm(pr.proceeds), 'success');
      };
      /* §16.3d — confirm the ALL variant only (a misclick on rare legacy
       * stock is an uncushioned loss); single sells stay one-click. */
      if (el.getAttribute('data-all') === '1' && sqty > 1) {
        var spName = el.getAttribute('data-name') || 'this part';
        var spEst = parseFloat(el.getAttribute('data-est'));
        UI.confirm(
          'Sell all ' + sqty + ' × ' + spName +
          (isFinite(spEst) ? ' for about ' + fm(spEst) : '') +
          ' (70% of market value)? Parts on the shelf can be worth more to a job later.',
          doSell, { yesLabel: 'Sell all', title: 'Sell all stock' }
        );
      } else {
        doSell();
      }
    },

    /* ---- Parts Market ---- */
    'mcat': function (el) {
      UI.state.marketCat = el.getAttribute('data-cat') || 'all';
      T.render('market');
    },
    'buy': function (el) {
      var bpid = el.getAttribute('data-part');
      var bqty = parseInt(el.getAttribute('data-qty'), 10) || 1;
      var rush = el.getAttribute('data-rush') === '1';   /* §19.3 */
      var br = UI.act(function () {
        return rush ? Engine.buyPart(bpid, bqty, { rush: true }) : Engine.buyPart(bpid, bqty);
      });
      if (br && br.ok !== false) {
        var when = rush ? ' — rushed, on the shelf today'
          : (br.arrivesDay !== undefined && br.arrivesDay !== null
              ? ' — arrives ' + S.fmtDay(br.arrivesDay) : '');
        UI.toast('Bought ' + bqty + ' — ' + fm(br.cost) + when, 'success');
      }
    },

    /* ---- §18.1 suppliers ---- */
    'sup-order': function (el) {
      if (!has('placeOrder')) { UI.toast('Bulk ordering is not available yet', 'info'); return; }
      var distId = el.getAttribute('data-dist');
      var sel = document.getElementById('sup-part-' + distId);
      var qtyEl = document.getElementById('sup-qty-' + distId);
      var pid = sel && sel.value;
      var qty = Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1);
      if (!pid) { UI.toast('Pick a part first', 'info'); return; }
      var por = UI.act(function () { return Engine.placeOrder(distId, pid, qty); });
      if (por && por.ok !== false) {
        UI.toast('Order placed — ' + qty + ' unit' + (qty === 1 ? '' : 's') +
          (por.unitCost !== undefined ? ' at ' + fm(por.unitCost) + ' each' : '') +
          (por.total !== undefined ? ' (' + fm(por.total) + ' paid up front)' : '') +
          (por.arrivesDay !== undefined && por.arrivesDay !== null ? ' — arrives ' + S.fmtDay(por.arrivesDay) : ''),   /* §19.9 #2 */
          'success', 6000);
      }
    },
    'sup-deal': function (el) {
      var distId = el.getAttribute('data-dist');
      var pid = el.getAttribute('data-part');
      /* prefer a dedicated deal API when the engine ships one; else the
       * deal price applies inside placeOrder for an active deal */
      var call = has('buyDeal')
        ? function () { return Engine.buyDeal(distId, pid, 1); }
        : function () { return Engine.placeOrder(distId, pid, 1); };
      if (!has('buyDeal') && !has('placeOrder')) { UI.toast('Deals are not available yet', 'info'); return; }
      var dr = UI.act(call);
      if (dr && dr.ok !== false) {
        UI.toast('Deal locked in' + (dr.unitCost !== undefined ? ' — ' + fm(dr.unitCost) : '') +
          (dr.arrivesDay !== undefined && dr.arrivesDay !== null ? ', arrives ' + S.fmtDay(dr.arrivesDay) : ''), 'success');   /* §19.9 #2 */
      }
    },
    'sup-cancel': function (el) {
      if (!has('cancelOrder')) { UI.toast('Cancelling is not available yet', 'info'); return; }
      var orderId = el.getAttribute('data-order');
      var total = parseFloat(el.getAttribute('data-total'));
      UI.confirm(
        'Cancel this order? The distributor keeps a 10% restocking fee' +
        (isFinite(total) ? ' (about ' + fm(total * 0.1) + ')' : '') + ' — the rest comes back.',
        function () {
          var cr = UI.act(function () { return Engine.cancelOrder(orderId); });
          if (cr && cr.ok !== false) {
            UI.toast('Order cancelled' + (cr.refund !== undefined ? ' — ' + fm(cr.refund) + ' refunded' : ''), 'info');
          }
        },
        { yesLabel: 'Cancel order', title: 'Cancel bulk order' }
      );
    }
  });

  /* §18.1 — live order preview updates as the part/qty controls change. */
  T.registerChangeHook(function (t) {
    var distId = t.getAttribute && t.getAttribute('data-supform');
    if (distId) { updateOrderPreview(distId); return true; }
    return false;
  });
  T.registerInputHook(function (t) {
    var distId = t.getAttribute && t.getAttribute('data-supform');
    if (distId) { updateOrderPreview(distId); return true; }
    return false;
  });

  T.registerInputHook(function (t) {
    if (t.id === 'market-search') {
      UI.state.marketSearch = t.value;
      if (marketTimer) window.clearTimeout(marketTimer);
      marketTimer = window.setTimeout(function () {
        refocusMarketSearch = true;
        T.render('market');
      }, 170);
      return true;
    }
    return false;
  });

  T.registerTab('inventory', renderInventory);
  T.registerTab('market', renderMarket);

})();
