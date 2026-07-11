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

    var cat = UI.state.marketCat || 'all';
    var q = UI.state.marketSearch || '';

    var html = '<h2 class="section-title">Parts Market</h2>';
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
      /* §16.3a — a Buy you can't afford is disabled with the shortfall,
       * never a silent no-op (price is a UI-known estimate; the engine
       * stays the authority when it IS clickable). */
      function buyBtn(r, qty) {
        var need = (Number(r.price) || 0) * qty;
        var short = Math.max(0, need - mktCash);
        return '<button type="button" class="btn btn-sm" data-action="buy" data-part="' + esc(r.partId) +
          '" data-qty="' + qty + '"' +
          (short > 0 ? ' disabled title="Need ' + esc(fm(short)) + ' more"' : '') +
          '>Buy ' + qty + '</button>';
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
            buyBtn(r, 1) + ' ' + buyBtn(r, 5) +
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
      var br = UI.act(function () { return Engine.buyPart(bpid, bqty); });
      if (br && br.ok !== false) UI.toast('Bought ' + bqty + ' — ' + fm(br.cost), 'success');
    }
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
