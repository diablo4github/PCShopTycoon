/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-market.js (§20.3 rebuild)
 * The Parts Market is now a three-level drilldown — Source (Retail + each
 * unlocked distributor) -> Category (live counts) -> a sortable part list —
 * plus a persistent shopping-cart drawer (§20.1-20.3). The old flat
 * price-table + per-distributor <select>/bulk-order form is deleted per
 * spec. Inventory (sell-from-shelf) is unchanged and still lives here.
 *
 * ENGINE contract (feature-detected — the cart/catalog API may still be
 * landing from a concurrent workstream):
 *   Engine.getSourceCatalog(source, {category}) -> {categories, rows}
 *   Engine.getCart() / addToCart / setCartQty / removeCartItem / clearCart /
 *   checkoutCart({retailShipping}) — shapes in SPEC §20.1/§20.3.
 * Until the engine ships these, this module falls back to a UI-local
 * approximation built from the existing getMarket/getDistributors/
 * quoteOrder APIs (clearly marked FALLBACK below) so the tab is never
 * broken. Once the real APIs land, has('getSourceCatalog')/cartLive()
 * flip the module over automatically — nothing here needs to change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox,
      catLabel = S.catLabel, knownCategories = S.knownCategories, has = S.has;

  var invFlashDay = null;   /* §19.9 #8 — last day the delivery flash ran */

  /* ================================================================== *
   * TAB: Inventory — unchanged from the §18/§19 monolith split
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

    /* §19.9 #8 — flash rows delivered this morning, once per day (first
     * render of the day only, so mid-day re-renders stay calm). Fields are
     * feature-detected; absent = no flash. */
    var doFlash = UI.motionOK && UI.motionOK() && invFlashDay !== st.day;
    invFlashDay = st.day;

    html += '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Part</th><th>Category</th><th class="num">Qty</th><th class="num">Avg cost</th>' +
      '<th class="num">Market price</th><th class="num">Value</th><th>Sell (70% of market)</th>' +
      '</tr></thead><tbody>';
    inv.forEach(function (it) {
      var qty = it.qty || 0;
      var justLanded = doFlash && (it.arrivedToday === true ||
        (it.arrivedDay !== undefined && it.arrivedDay !== null && it.arrivedDay === st.day));
      html += '<tr' + (justLanded ? ' class="row-delivered"' : '') + '>' +
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
   * §20.1/§20.3 — capability gates (feature-detected; flip automatically
   * once the ENGINE workstream lands its cart/catalog APIs).
   * ================================================================== */
  function cartLive() {
    return has('getCart') && has('addToCart') && has('checkoutCart');
  }
  function catalogLive() { return has('getSourceCatalog'); }

  /* ------------------------------------------------------------------ *
   * §20.1 FALLBACK — a UI-local cart used only while Engine.getCart is
   * absent. Never charges money or spends hours itself: it just remembers
   * {source, partId, qty} lines and, at checkout, drives the existing
   * per-item Engine.buyPart / Engine.placeOrder mutators (the engine
   * remains the sole authority on price/time/rules either way). Job-linked
   * lines are out of scope here — those only ever arise through
   * assignPart, which (pre-§20.2 engine) still orders directly rather than
   * touching a cart, so this shim never needs to carry jobLinks.
   * ------------------------------------------------------------------ */
  var localCart = { nextId: 1, items: [] };

  function fbFindItem(source, partId) {
    var found = null;
    localCart.items.forEach(function (it) { if (it.source === source && it.partId === partId) found = it; });
    return found;
  }
  function fbAddToCart(source, partId, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    var existing = fbFindItem(source, partId);
    if (existing) { existing.qty += qty; return { ok: true, itemId: existing.id }; }
    var id = localCart.nextId++;
    localCart.items.push({ id: id, source: source, partId: partId, qty: qty, jobLinks: [] });
    return { ok: true, itemId: id };
  }
  function fbSetCartQty(itemId, qty) {
    qty = Math.max(0, parseInt(qty, 10) || 0);
    var idx = -1;
    localCart.items.forEach(function (it, i) { if (it.id === itemId) idx = i; });
    if (idx === -1) return { ok: false, error: 'That item is no longer in the cart' };
    if (qty <= 0) localCart.items.splice(idx, 1);
    else localCart.items[idx].qty = qty;
    return { ok: true };
  }
  function fbRemoveCartItem(itemId) {
    var idx = -1;
    localCart.items.forEach(function (it, i) { if (it.id === itemId) idx = i; });
    if (idx !== -1) localCart.items.splice(idx, 1);
    return { ok: true, unlinked: [] };
  }
  function fbClearCart() { localCart.items = []; return { ok: true, unlinked: [] }; }

  function fbShippingOptions(retailSubtotal) {
    var C = (window.Engine && Engine.CONFIG) || {};
    var fee = Math.round(Math.max(C.RUSH_SURCHARGE_MIN || 10,
      (Number(retailSubtotal) || 0) * (C.RUSH_SURCHARGE_PCT || 0.25)) * 100) / 100;
    return [
      { id: 'same-day', label: 'Same-day courier', fee: fee },
      { id: 'next-day', label: 'Next morning', fee: 0 }
    ];
  }
  /** Live-reprice one fallback cart line off today's market/distributor
   * numbers (mirrors the real cart's "priced live, never stored" rule). */
  function fbPriceItem(it) {
    var rows = arr(tryCall(function () { return Engine.getMarket({}); }));
    var row = null;
    rows.forEach(function (r) { if (r.partId === it.partId) row = r; });
    var unit = row ? Number(row.price) || 0 : 0;
    var sourceName = 'Retail Market', gray = false, leadDays = null, deal = null;
    if (it.source !== 'retail') {
      var dist = null;
      arr(tryCall(function () { return Engine.getDistributors(); })).forEach(function (d) { if (d && d.id === it.source) dist = d; });
      if (dist) {
        sourceName = dist.name; gray = !!dist.grayMarket; leadDays = dist.leadDays;
        if (has('quoteOrder')) {
          var q = tryCall(function () { return Engine.quoteOrder(it.source, it.partId, it.qty); });
          if (q && q.ok !== false && q.unitCost !== undefined) unit = Number(q.unitCost);
          else if (dist.effDiscount) unit = Math.round(unit * (1 - dist.effDiscount) * 100) / 100;
        } else if (dist.effDiscount) {
          unit = Math.round(unit * (1 - dist.effDiscount) * 100) / 100;
        }
        var dl = null;
        arr(dist.deals).forEach(function (x) { if (x && x.partId === it.partId) dl = x; });
        if (dl) { deal = true; if (dl.dealPrice !== undefined && dl.dealPrice !== null) unit = Number(dl.dealPrice); }
      }
    }
    return {
      id: it.id, source: it.source, sourceName: sourceName, gray: gray, partId: it.partId,
      name: row ? row.name : it.partId, category: row ? row.category : '', qty: it.qty,
      unitPrice: unit, lineTotal: Math.round(unit * it.qty * 100) / 100,
      inStockQty: row ? (row.inStockQty || 0) : 0, deal: deal, jobLinks: [], _leadDays: leadDays
    };
  }
  function fbGetCart() {
    var priced = localCart.items.map(fbPriceItem);
    var order = [], groupsMap = {};
    priced.forEach(function (p) {
      if (!groupsMap[p.source]) {
        groupsMap[p.source] = { source: p.source, sourceName: p.sourceName, gray: p.gray, leadDays: p._leadDays, subtotal: 0 };
        order.push(p.source);
      }
      groupsMap[p.source].subtotal = Math.round((groupsMap[p.source].subtotal + p.lineTotal) * 100) / 100;
    });
    var groups = order.map(function (s) {
      var g = groupsMap[s];
      if (s === 'retail') { g.shipping = fbShippingOptions(g.subtotal); g.leadDays = null; }
      return g;
    });
    var total = 0, count = 0;
    priced.forEach(function (p) { total += p.lineTotal; count += p.qty; });
    return { items: priced, groups: groups, total: Math.round(total * 100) / 100, count: count };
  }
  /** FALLBACK checkout: no flat 0.2h — each line spends whatever the
   * legacy buyPart/placeOrder mutator already charges (engine-authoritative
   * either way; this shim never invents a price or a rule). */
  function fbCheckoutCart(opts) {
    var cart = fbGetCart();
    if (!cart.items.length) return { ok: false, error: 'Your cart is empty' };
    var st = getState();
    if (!st) return { ok: false, error: 'Engine not ready' };
    var shipping = (opts && opts.retailShipping) || 'next-day';
    var retailGroup = null;
    cart.groups.forEach(function (g) { if (g.source === 'retail') retailGroup = g; });
    var courierFee = 0;
    if (retailGroup && shipping === 'same-day') {
      arr(retailGroup.shipping).forEach(function (s) { if (s.id === 'same-day') courierFee = Number(s.fee) || 0; });
    }
    var need = (Number(cart.total) || 0) + courierFee;
    if ((Number(st.cash) || 0) < need) {
      return { ok: false, error: 'Need ' + fm(need - st.cash) + ' more to check out' };
    }
    var charged = 0, hoursSpent = 0, orders = 0, failures = [];
    localCart.items.slice().forEach(function (it) {
      var r = (it.source === 'retail')
        ? tryCall(function () { return Engine.buyPart(it.partId, it.qty, { rush: shipping === 'same-day' }); })
        : tryCall(function () { return Engine.placeOrder(it.source, it.partId, it.qty); });
      if (r && r.ok !== false) {
        charged += Number(r.cost !== undefined ? r.cost : (r.total || 0));
        hoursSpent += Number(r.hoursSpent || 0);
        orders++;
        fbRemoveCartItem(it.id);
      } else {
        failures.push((r && r.error) || ('Could not buy ' + it.partId));
      }
    });
    if (orders === 0) return { ok: false, error: failures[0] || 'Checkout failed' };
    return {
      ok: true, hoursSpent: Math.round(hoursSpent * 10) / 10, charged: Math.round(charged * 100) / 100,
      courierFee: 0, orders: orders, filledNow: 0, partial: failures.length > 0, failures: failures
    };
  }

  /* ---- unified cart surface: real engine when live, shim otherwise ---- */
  function getCartView() {
    if (cartLive()) {
      var r = tryCall(function () { return Engine.getCart(); });
      if (r && r.ok !== false && r.items) return r;
    }
    return fbGetCart();
  }
  function cartAdd(source, partId, qty) {
    if (cartLive()) return tryCall(function () { return Engine.addToCart(source, partId, qty); });
    return fbAddToCart(source, partId, qty);
  }
  function cartSetQty(itemId, qty) {
    if (cartLive() && has('setCartQty')) return tryCall(function () { return Engine.setCartQty(itemId, qty); });
    return fbSetCartQty(itemId, qty);
  }
  function cartRemove(itemId) {
    if (cartLive() && has('removeCartItem')) return tryCall(function () { return Engine.removeCartItem(itemId); });
    return fbRemoveCartItem(itemId);
  }
  function cartCheckout(opts) {
    if (cartLive()) return tryCall(function () { return Engine.checkoutCart(opts); });
    return fbCheckoutCart(opts);
  }

  /* ------------------------------------------------------------------ *
   * §20.3 FALLBACK — source→category browse catalog, built from the
   * pre-existing getMarket/getDistributors/quoteOrder APIs when the
   * engine hasn't shipped getSourceCatalog yet. Distributor category
   * counts/rows mirror the full retail catalog with that distributor's
   * pricing applied (an approximation — the real engine may restrict a
   * distributor's actual stock list once it ships).
   * ------------------------------------------------------------------ */
  function fbSourceCatalog(source, opts) {
    var allRows = arr(tryCall(function () { return Engine.getMarket({}); }));
    var counts = {};
    allRows.forEach(function (r) { counts[r.category] = (counts[r.category] || 0) + 1; });
    var categories = knownCategories().map(function (c) {
      return { id: c, label: catLabel(c), count: counts[c] || 0 };
    }).filter(function (c) { return c.count > 0; });

    var rows = [];
    if (opts && opts.category) {
      var dist = null;
      if (source !== 'retail') {
        arr(tryCall(function () { return Engine.getDistributors(); })).forEach(function (d) { if (d && d.id === source) dist = d; });
      }
      allRows.filter(function (r) { return r.category === opts.category; }).forEach(function (r) {
        var unitPrice = Number(r.price) || 0;
        var deal = null;
        if (dist) {
          if (has('quoteOrder')) {
            var q = tryCall(function () { return Engine.quoteOrder(source, r.partId, 1); });
            if (q && q.ok !== false && q.unitCost !== undefined) unitPrice = Number(q.unitCost);
            else if (dist.effDiscount) unitPrice = Math.round(unitPrice * (1 - dist.effDiscount) * 100) / 100;
          } else if (dist.effDiscount) {
            unitPrice = Math.round(unitPrice * (1 - dist.effDiscount) * 100) / 100;
          }
          var dl = null;
          arr(dist.deals).forEach(function (x) { if (x && x.partId === r.partId) dl = x; });
          if (dl) {
            deal = { discount: dl.dealDiscount, remaining: dl.remaining };
            if (dl.dealPrice !== undefined && dl.dealPrice !== null) unitPrice = Number(dl.dealPrice);
          }
        }
        var pinfo = has('getPartInfo') ? tryCall(function () { return Engine.getPartInfo(r.partId); }) : null;
        var ok = pinfo && pinfo.ok !== false;
        rows.push({
          partId: r.partId, name: r.name, category: r.category,
          year: ok && pinfo.introYear ? pinfo.introYear : null,
          perfLabel: r.perfLabel, perf: ok ? pinfo.perf : null, watts: ok ? pinfo.watts : undefined,
          tier: r.tier, unitPrice: Math.round(unitPrice * 100) / 100,
          inStockQty: r.inStockQty || 0, deal: deal
        });
      });
    }
    return { categories: categories, rows: rows };
  }
  function sourceCatalog(source, opts) {
    opts = opts || {};
    if (catalogLive()) {
      var r = tryCall(function () { return Engine.getSourceCatalog(source, opts); });
      if (r && r.ok !== false && r.categories) return r;
    }
    return fbSourceCatalog(source, opts);
  }

  /* ================================================================== *
   * TAB: Parts Market — §20.3 drilldown
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
    return partDisplayName(pid);
  }
  function partDisplayName(pid) {
    if (has('getPartInfo')) {
      var r = tryCall(function () { return Engine.getPartInfo(pid); });
      if (r && r.ok !== false && r.name) return r.name;
    }
    var found = null;
    arr(tryCall(function () { return Engine.getMarket({}); })).forEach(function (row) {
      if (row.partId === pid) found = row.name;
    });
    return found || pid;
  }
  function sourceDisplayName(source) {
    if (source === 'retail') return 'Retail Market';
    var name = source;
    arr(tryCall(function () { return Engine.getDistributors(); })).forEach(function (d) { if (d && d.id === source) name = d.name; });
    return name;
  }

  /* ---- Level-3 spec line + presentation-only sort heuristics ----
   * DATA.PARTS (SPEC §2.1) has no structured "clock MHz" / RAM-speed /
   * GPU-VRAM fields today — only relative perf scores. The three sort
   * keys spec §20.3 still asks for (cpu Clock, ram Speed, gpu VRAM) are
   * therefore approximated from the part's name text (e.g. "(66 MHz)",
   * "PC100", "8GB"). This is display/sort convenience only — never a
   * rule, never billed — and degrades to 0 (stable, harmless) when a
   * name doesn't match. */
  /* §22.2 #10 — getSourceCatalog rows may now carry a human-written `spec`
   * string (§22.1 #10: "1991 · perf 12", "16 MB", "230W", …) — render it
   * verbatim when present; the older heuristics stay as the fallback chain
   * for rows/engines that don't have it yet. */
  function specLine(row) {
    if (row.spec) return row.spec;
    if (row.specSummary) return row.specSummary;
    if (row.perfLabel) return row.perfLabel;
    if (row.perf) return S.perfStr(row.perf);
    return '';
  }
  function parseLeadingNumber(str) {
    var m = /([\d.]+)/.exec(str || '');
    return m ? parseFloat(m[1]) : 0;
  }
  function parseClockMHz(name) {
    var m = /([\d.]+)\s*GHz/i.exec(name || '');
    if (m) return parseFloat(m[1]) * 1000;
    m = /([\d.]+)\s*MHz/i.exec(name || '');
    return m ? parseFloat(m[1]) : 0;
  }
  function parseRamSpeedSpec(name) {
    var m = /(?:PC|DDR\d*-)(\d{2,5})/i.exec(name || '');
    return m ? parseInt(m[1], 10) : 0;
  }
  function parseVramGB(name) {
    var matches = String(name || '').match(/(\d+(?:\.\d+)?)\s*GB/ig);
    if (!matches || !matches.length) return 0;
    return parseFloat(matches[matches.length - 1]) || 0;
  }
  var SORT_BASE = [{ key: 'price', label: 'Price' }, { key: 'name', label: 'Name' }, { key: 'year', label: 'Year' }];
  var SORT_EXTRA = {
    cpu: [{ key: 'clock', label: 'Clock' }, { key: 'perf', label: 'Perf' }],
    ram: [{ key: 'capacity', label: 'Capacity' }, { key: 'speed', label: 'Speed' }],
    storage: [{ key: 'capacity', label: 'Capacity' }],
    gpu: [{ key: 'perf', label: 'Perf' }, { key: 'vram', label: 'VRAM' }],
    psu: [{ key: 'watts', label: 'Wattage' }]
  };
  function sortFieldsFor(cat) { return SORT_BASE.concat(SORT_EXTRA[cat] || []); }
  function sortValue(row, key) {
    switch (key) {
      case 'price': return Number(row.unitPrice) || 0;
      case 'name': return String(row.name || '').toLowerCase();
      case 'year': return Number(row.year) || 0;
      case 'clock': return parseClockMHz(row.name);
      case 'perf':
        if (row.perf) return Number(row.category === 'gpu' ? row.perf.gpu : row.perf.cpu) || 0;
        return parseLeadingNumber(specLine(row));
      case 'capacity':
        if (row.perf) return Number(row.perf.ramMB !== undefined ? row.perf.ramMB : row.perf.storageGB) || 0;
        return parseLeadingNumber(specLine(row));
      case 'speed': return parseRamSpeedSpec(row.name);
      case 'vram': return parseVramGB(row.name);
      case 'watts':
        if (row.watts !== undefined && row.watts !== null) return Number(row.watts) || 0;
        return parseLeadingNumber(specLine(row));
      default: return 0;
    }
  }
  function currentSort(cat) {
    var s = UI.state.marketSort[cat];
    if (!s) { s = { key: 'price', dir: 'asc' }; UI.state.marketSort[cat] = s; }
    return s;
  }
  function sortRows(rows, cat) {
    var s = currentSort(cat);
    var mul = s.dir === 'desc' ? -1 : 1;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      var va = sortValue(a, s.key), vb = sortValue(b, s.key);
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return copy;
  }
  function sortPillsHTML(cat) {
    var s = currentSort(cat);
    var h = '<div class="chips sort-pills">';
    sortFieldsFor(cat).forEach(function (f) {
      var active = s.key === f.key;
      var arrow = active ? (s.dir === 'desc' ? ' ▼' : ' ▲') : '';
      h += '<button type="button" class="chip-btn' + (active ? ' active' : '') +
        '" data-action="mkt-sort" data-cat="' + esc(cat) + '" data-key="' + esc(f.key) + '">' +
        esc(f.label) + arrow + '</button>';
    });
    return h + '</div>';
  }

  /* ---- breadcrumb + header (cart button visible at every level) ---- */
  function breadcrumbHTML(nav, sourceName, catLbl) {
    var h = '<nav class="market-crumbs" aria-label="Parts Market breadcrumb">';
    if (!nav.source) {
      h += '<span class="crumb-current">Parts Market</span>';
    } else if (!nav.category) {
      h += '<button type="button" class="crumb-btn" data-action="mkt-crumb" data-level="root">Parts Market</button>' +
        '<span class="crumb-sep">▸</span><span class="crumb-current">' + esc(sourceName) + '</span>';
    } else {
      h += '<button type="button" class="crumb-btn" data-action="mkt-crumb" data-level="root">Parts Market</button>' +
        '<span class="crumb-sep">▸</span>' +
        '<button type="button" class="crumb-btn" data-action="mkt-crumb" data-level="source">' + esc(sourceName) + '</button>' +
        '<span class="crumb-sep">▸</span><span class="crumb-current">' + esc(catLbl) + '</span>';
    }
    return h + '</nav>';
  }
  function cartButtonHTML() {
    var cart = getCartView();
    return '<button type="button" class="btn cart-hdr-btn" data-action="mkt-cart-open" title="View cart and check out">' +
      esc('🛒 ' + (cart.count || 0) + ' — ' + fm(cart.total || 0)) + '</button>';
  }
  function marketHeaderHTML(nav, sourceName, catLbl) {
    return '<div class="wb-top market-top"><h2 class="section-title">Parts Market</h2>' + cartButtonHTML() + '</div>' +
      breadcrumbHTML(nav, sourceName, catLbl);
  }

  /* ---- "On the truck" — kept at the root level for continuity with the
   * old Suppliers sub-tab (state.pendingOrders covers retail + wholesale
   * alike since §19.3). ---- */
  function pendingOrdersHTML(st) {
    var pending = Array.isArray(st.pendingOrders) ? st.pendingOrders : [];
    if (!pending.length) return '';
    var canCancel = has('cancelOrder');
    var h = '<h3 class="sub-title">On the truck</h3><div class="pending-orders">';
    pending.forEach(function (o) {
      if (!o) return;
      var eta = (o.arrivesDay !== undefined && o.arrivesDay !== null) ? Math.max(0, o.arrivesDay - st.day) : null;
      var cancelable = canCancel && (eta === null || eta > 0);
      var isRetail = !o.distributorId || o.source === 'retail' || o.retail === true;
      h += '<div class="order-row">' +
        '<span class="order-what"><b class="num">' + esc(o.qty || 1) + '×</b> ' + esc(supPartName(o.partId, o.name)) + '</span>' +
        '<span class="meta-row small">' +
          '<span class="chip">' + (isRetail ? 'retail' : 'wholesale') + '</span>' +
          (o.total !== undefined && o.total !== null ? '<span class="chip">paid ' + esc(fm(o.total)) + '</span>' : '') +
          '<span class="chip">' + (eta === null ? 'in transit' : (eta === 0 ? 'arrives tomorrow morning' : 'arrives ' + esc(S.fmtDay(o.arrivesDay)))) + '</span>' +
        '</span>' +
        (cancelable
          ? '<button type="button" class="btn btn-sm btn-ghost" data-action="sup-cancel" data-order="' + esc(o.id) +
            '" data-total="' + esc(o.total !== undefined ? o.total : '') + '">Cancel…</button>'
          : '') +
        '</div>';
    });
    return h + '</div>';
  }

  /* ---- Level 1: source picker ---- */
  function retailCardHTML() {
    return '<div class="card source-card">' +
      '<div class="card-title">Retail Market</div>' +
      '<p class="muted small">Today’s list prices — every released part, browsable by category. Orders land ' +
      'next morning; a courier fee at checkout buys same-day instead.</p>' +
      '<div class="meta-row small"><span class="chip">no relationship needed</span>' +
      '<span class="chip">next-day standard</span><span class="chip">same-day at checkout</span></div>' +
      '<div class="source-card-actions"><button type="button" class="btn btn-primary btn-sm" ' +
      'data-action="mkt-pick-source" data-source="retail">Browse Retail Market →</button></div>' +
      '</div>';
  }
  function distributorCardHTML(d, st) {
    var locked = !!d.lockedReason;
    var h = '<div class="card source-card supplier-card' + (d.grayMarket ? ' gray-market' : '') + (locked ? ' locked' : '') + '">' +
      '<div class="card-title">' + esc(d.name) +
        (d.grayMarket ? ' <span class="badge b-gray" title="Off the books — deep discounts, no comebacks">GRAY MARKET</span>' : '') +
      '</div>' +
      (d.blurb ? '<p class="muted small">' + esc(d.blurb) + '</p>' : '');
    if (locked) return h + '<p class="muted small">🔒 ' + esc(d.lockedReason) + '</p></div>';

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

    var deals = arr(d.deals);
    if (deals.length) {
      h += '<div class="sub-title">This week’s deals</div><div class="deal-rows">';
      deals.forEach(function (dl) {
        if (!dl) return;
        var expiresIn = (dl.expiresDay !== undefined && dl.expiresDay !== null) ? Math.max(0, dl.expiresDay - st.day) : null;
        var remaining = (dl.remaining !== undefined && dl.remaining !== null) ? Number(dl.remaining)
          : ((dl.maxQty !== undefined && dl.maxQty !== null) ? Number(dl.maxQty) : null);
        var soldOut = remaining !== null && remaining <= 0;
        h += '<div class="deal-row">' +
          '<span class="deal-what">' + esc(supPartName(dl.partId, dl.name)) + '</span>' +
          '<span class="meta-row small">' +
            '<span class="chip deal-chip">−' + esc(Math.round((dl.dealDiscount || 0) * 100)) + '%</span>' +
            (dl.dealPrice !== undefined && dl.dealPrice !== null ? '<span class="num"><b>' + esc(fm(dl.dealPrice)) + '</b></span>' : '') +
            (remaining !== null
              ? '<span class="muted">' + (soldOut ? 'sold out' : remaining + (dl.maxQty ? ' of ' + esc(dl.maxQty) : '') + ' left') + '</span>'
              : '') +
            (expiresIn !== null ? '<span class="muted">' + (expiresIn === 0 ? 'last day' : 'ends ' + esc(S.fmtDay(dl.expiresDay))) + '</span>' : '') +
          '</span>' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="mkt-add-deal" data-dist="' + esc(d.id) +
            '" data-part="' + esc(dl.partId) + '"' + (soldOut ? ' disabled title="This week’s allocation is gone"' : '') + '>Add to Cart</button>' +
          '</div>';
      });
      h += '</div>';
    } else {
      h += '<p class="muted small">No deals this week — new ones land every Monday.</p>';
    }

    h += '<div class="source-card-actions"><button type="button" class="btn btn-primary btn-sm" ' +
      'data-action="mkt-pick-source" data-source="' + esc(d.id) + '">Browse ' + esc(d.name) + ' →</button></div>';
    return h + '</div>';
  }
  function renderLevel1(panel, st, nav) {
    var html = marketHeaderHTML(nav, '', '');
    html += pendingOrdersHTML(st);
    html += '<div class="cards source-cards">' + retailCardHTML();
    arr(tryCall(function () { return Engine.getDistributors(); })).forEach(function (d) {
      if (d) html += distributorCardHTML(d, st);
    });
    html += '</div>';
    panel.innerHTML = html;
  }

  /* ---- Level 2: category picker ---- */
  function renderLevel2(panel, st, nav) {
    var sourceName = sourceDisplayName(nav.source);
    var cat = sourceCatalog(nav.source, {});
    var html = marketHeaderHTML(nav, sourceName, '');
    var cats = arr(cat.categories);
    if (!cats.length) {
      html += emptyBox('Nothing catalogued for ' + esc(sourceName) + ' yet — check back as the years roll on.');
    } else {
      html += '<div class="cards category-cards">';
      cats.forEach(function (c) {
        html += '<button type="button" class="card category-card" data-action="mkt-pick-cat" data-cat="' + esc(c.id) + '">' +
          '<span class="card-title">' + esc(c.label) + '</span>' +
          '<span class="cat-count muted small">' + esc(c.count) + ' part' + (c.count === 1 ? '' : 's') + '</span>' +
          '</button>';
      });
      html += '</div>';
    }
    panel.innerHTML = html;
  }

  /* ---- Level 3: sortable part list ---- */
  function renderLevel3(panel, st, nav) {
    var sourceName = sourceDisplayName(nav.source);
    var catLbl = catLabel(nav.category);
    var cat = sourceCatalog(nav.source, { category: nav.category });
    var rows = sortRows(arr(cat.rows), nav.category);

    var html = marketHeaderHTML(nav, sourceName, catLbl);
    html += sortPillsHTML(nav.category);

    if (!rows.length) {
      html += emptyBox('Nothing in ' + esc(catLbl) + ' from ' + esc(sourceName) + ' right now — try another category.');
      panel.innerHTML = html;
      return;
    }

    html += '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Part</th><th>Spec</th><th class="num">Price</th><th class="num">Owned</th><th>Qty</th><th>Add</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var qty = rowQty[r.partId] || 1;
      html += '<tr>' +
        '<td>' + esc(r.name) + (r.deal ? ' <span class="chip deal-chip" title="Discounted this week">deal</span>' : '') +
          (has('getPartInfo') ? ' <button type="button" class="info-btn" data-action="partinfo" data-part="' + esc(r.partId) + '" title="Part details">i</button>' : '') +
        '</td>' +
        '<td class="muted small">' + esc(specLine(r)) + '</td>' +
        '<td class="num"><b>' + esc(fm(r.unitPrice)) + '</b></td>' +
        '<td class="num">' + (r.inStockQty || 0) + '</td>' +
        '<td><span class="qty-stepper">' +
          '<button type="button" class="btn btn-sm" data-action="mkt-qty" data-part="' + esc(r.partId) + '" data-delta="-1">−</button>' +
          '<span class="qty-val" id="mkt-qty-' + esc(r.partId) + '">' + qty + '</span>' +
          '<button type="button" class="btn btn-sm" data-action="mkt-qty" data-part="' + esc(r.partId) + '" data-delta="1">+</button>' +
        '</span></td>' +
        '<td><button type="button" class="btn btn-primary btn-sm" data-action="mkt-add" data-part="' + esc(r.partId) +
          '" data-source="' + esc(nav.source) + '">Add to Cart</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    panel.innerHTML = html;
  }

  var rowQty = {};   // transient qty-stepper values for the Level-3 Add-to-Cart row, keyed by partId

  function renderMarket(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var nav = UI.state.marketNav || (UI.state.marketNav = { source: null, category: null });

    if (!nav.source) { renderLevel1(panel, st, nav); return; }
    if (!nav.category) { renderLevel2(panel, st, nav); return; }
    renderLevel3(panel, st, nav);
  }

  /* ================================================================== *
   * §20.3 — cart drawer modal
   * ================================================================== */
  var cartShipChoice = 'next-day';

  function cartLineHTML(it) {
    var jobLinkHTML = arr(it.jobLinks).map(function (l) {
      return '<span class="chip chip-joblink">→ for: ' + esc(l.jobTitle || ('job #' + l.jobId)) + '</span>';
    }).join(' ');
    return '<div class="cart-line">' +
      '<span class="cart-line-name">' + esc(it.name) + (it.deal ? ' <span class="chip deal-chip">deal</span>' : '') + '</span>' +
      '<span class="qty-stepper">' +
        '<button type="button" class="btn btn-sm" data-action="cart-qty" data-item="' + esc(it.id) + '" data-delta="-1">−</button>' +
        '<span class="qty-val">' + esc(it.qty) + '</span>' +
        '<button type="button" class="btn btn-sm" data-action="cart-qty" data-item="' + esc(it.id) + '" data-delta="1">+</button>' +
      '</span>' +
      '<span class="num cart-line-total">' + esc(fm(it.lineTotal)) + '</span>' +
      jobLinkHTML +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="cart-remove" data-item="' + esc(it.id) + '" title="Remove">✕</button>' +
      '</div>';
  }
  function shippingRadiosHTML(opts, current) {
    var h = '<div class="cart-ship-choice">';
    opts.forEach(function (s) {
      h += '<label' + (s.id === 'same-day' ? ' class="ship-rush"' : '') + '>' +
        '<input type="radio" name="cart-shipping" data-action="cart-ship" value="' + esc(s.id) + '"' +
        (current === s.id ? ' checked' : '') + '> ' +
        esc(s.label) + (s.fee ? ' <b class="num">+' + esc(fm(s.fee)) + '</b>' : ' <span class="muted small">free</span>') +
        '</label>';
    });
    return h + '</div>';
  }
  function cartModalHTML(cart, shipping) {
    if (!cart.items.length) {
      return emptyBox('Your cart is empty — browse the Parts Market and add a few parts.');
    }
    var h = '<div class="cart-drawer">';
    cart.groups.forEach(function (g) {
      var lines = cart.items.filter(function (it) { return it.source === g.source; });
      h += '<div class="cart-group">' +
        '<div class="cart-group-head"><b>' + esc(g.sourceName || sourceDisplayName(g.source)) + '</b>' +
        (g.gray ? ' <span class="badge b-gray">GRAY MARKET</span>' : '') +
        '<span class="num">' + esc(fm(g.subtotal)) + '</span></div>';
      lines.forEach(function (it) { h += cartLineHTML(it); });
      if (g.shipping) {
        h += shippingRadiosHTML(g.shipping, shipping);
      } else if (g.leadDays !== undefined && g.leadDays !== null) {
        h += '<div class="muted small cart-eta">Arrives in ~' + esc(g.leadDays) + ' day' + (g.leadDays === 1 ? '' : 's') + '</div>';
      }
      h += '</div>';
    });
    var courierFee = 0, retailGroup = null;
    cart.groups.forEach(function (g) { if (g.shipping) retailGroup = g; });
    if (retailGroup && shipping === 'same-day') {
      arr(retailGroup.shipping).forEach(function (s) { if (s.id === 'same-day') courierFee = Number(s.fee) || 0; });
    }
    var grand = Math.round(((Number(cart.total) || 0) + courierFee) * 100) / 100;
    h += '<div class="cart-total-row"><span>Total' +
      (courierFee > 0 ? ' (incl. ' + esc(fm(courierFee)) + ' courier)' : '') +
      '</span><span class="num">' + esc(fm(grand)) + '</span></div></div>';
    return h;
  }
  function currentCartItem(itemId) {
    var found = null;
    getCartView().items.forEach(function (it) { if (it.id === itemId) found = it; });
    return found;
  }
  function checkoutHoursLabel() {
    var h = 0.2;
    try { if (window.Engine && Engine.CONFIG && Engine.CONFIG.CHECKOUT_HOURS !== undefined) h = Engine.CONFIG.CHECKOUT_HOURS; }
    catch (e) { /* ignore */ }
    return h;
  }
  function updateCheckoutBtn(modal) {
    var btn = modal.el.querySelector('.cart-checkout-btn');
    if (!btn) return;
    var cart = getCartView();
    if (!cart.items.length) { btn.textContent = 'Checkout'; btn.disabled = true; return; }
    btn.disabled = false;
    btn.textContent = cartLive() ? ('Checkout — ' + checkoutHoursLabel() + 'h') : 'Checkout';
  }
  function repaintCartModal(modal, ctx) {
    var cart = getCartView();
    var body = modal.el.querySelector('.modal-body');
    if (body) body.innerHTML = cartModalHTML(cart, ctx.shipping);
    updateCheckoutBtn(modal);
    T.render('market');   // keep the header cart button + level-3 owned counts live
  }
  function confirmRemoveCartItem(itemId, modal, ctx) {
    var it = currentCartItem(itemId);
    var linked = it && arr(it.jobLinks).length;
    function doRemove() {
      var r = cartRemove(itemId);
      if (r && r.ok === false) { UI.toast(r.error || 'Could not remove item', 'error'); return; }
      repaintCartModal(modal, ctx);
      UI.toast('Removed from cart' + ((r && arr(r.unlinked).length) ? ' — job need reopened' : ''), 'info');
    }
    if (linked) {
      UI.confirm(
        'This part is reserved for "' + (it.jobLinks[0].jobTitle || 'a job') +
        '" — removing it unassigns that need. Remove anyway?',
        doRemove, { yesLabel: 'Remove', title: 'Remove cart item' }
      );
    } else {
      doRemove();
    }
  }
  function applyCartQtyChange(itemId, newQty, modal, ctx) {
    if (newQty <= 0) { confirmRemoveCartItem(itemId, modal, ctx); return; }
    var r = cartSetQty(itemId, newQty);
    if (r && r.ok === false) { UI.toast(r.error || 'Could not update quantity', 'error'); return; }
    repaintCartModal(modal, ctx);
  }
  function doCheckout(modal, ctx) {
    var r = UI.act(function () { return cartCheckout({ retailShipping: ctx.shipping || 'next-day' }); });
    if (!r || r.ok === false) return;   // UI.act already toasted the error; modal stays open
    var msg = 'Checked out';
    if (r.charged !== undefined) msg += ' — ' + fm(r.charged);
    if (r.courierFee) msg += ' (incl. ' + fm(r.courierFee) + ' courier)';
    if (r.hoursSpent) msg += ' • ' + S.fmtHours(r.hoursSpent) + 'h';
    if (r.partial) msg += ' — some lines could not be purchased';
    UI.toast(msg, r.partial ? 'info' : 'success', 6000);
    modal.close();
  }
  function wireCartModal(modal, ctx) {
    modal.el.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var qtyBtn = t.closest('[data-action="cart-qty"]');
      if (qtyBtn) {
        var itemId = parseInt(qtyBtn.getAttribute('data-item'), 10);
        var delta = parseInt(qtyBtn.getAttribute('data-delta'), 10) || 0;
        var cur = currentCartItem(itemId);
        applyCartQtyChange(itemId, (cur ? cur.qty : 0) + delta, modal, ctx);
        return;
      }
      var rmBtn = t.closest('[data-action="cart-remove"]');
      if (rmBtn) { confirmRemoveCartItem(parseInt(rmBtn.getAttribute('data-item'), 10), modal, ctx); return; }
    });
    modal.el.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-action') === 'cart-ship') {
        ctx.shipping = t.value;
        cartShipChoice = t.value;
        repaintCartModal(modal, ctx);
      }
    });
  }
  function openCartModal() {
    var ctx = { shipping: cartShipChoice };
    var modal = UI.modal({
      title: 'Your cart',
      html: cartModalHTML(getCartView(), ctx.shipping),
      buttons: [
        { label: 'Close', cls: 'btn' },
        { label: 'Checkout', cls: 'btn btn-primary cart-checkout-btn', keepOpen: true,
          onClick: function () { doCheckout(modal, ctx); } }
      ]
    });
    if (!modal) return;
    updateCheckoutBtn(modal);
    wireCartModal(modal, ctx);
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

    /* ---- §20.3 Parts Market drilldown navigation ---- */
    'mkt-crumb': function (el) {
      var level = el.getAttribute('data-level');
      if (level === 'root') UI.state.marketNav = { source: null, category: null };
      else if (level === 'source' && UI.state.marketNav) UI.state.marketNav.category = null;
      T.render('market');
    },
    'mkt-pick-source': function (el) {
      UI.state.marketNav = { source: el.getAttribute('data-source'), category: null };
      T.render('market');
    },
    'mkt-pick-cat': function (el) {
      if (!UI.state.marketNav) UI.state.marketNav = { source: null, category: null };
      UI.state.marketNav.category = el.getAttribute('data-cat');
      T.render('market');
    },
    'mkt-sort': function (el) {
      var cat = el.getAttribute('data-cat');
      var key = el.getAttribute('data-key');
      var s = currentSort(cat);
      if (s.key === key) s.dir = (s.dir === 'asc' ? 'desc' : 'asc');
      else { s.key = key; s.dir = 'asc'; }
      T.render('market');
    },
    'mkt-qty': function (el) {
      var pid = el.getAttribute('data-part');
      var delta = parseInt(el.getAttribute('data-delta'), 10) || 0;
      var cur = Math.max(1, Math.min(99, (rowQty[pid] || 1) + delta));
      rowQty[pid] = cur;
      var span = document.getElementById('mkt-qty-' + pid);
      if (span) span.textContent = cur;
    },
    'mkt-add': function (el) {
      var pid = el.getAttribute('data-part');
      var source = el.getAttribute('data-source') || 'retail';
      var qty = rowQty[pid] || 1;
      var r = cartAdd(source, pid, qty);
      if (r && r.ok !== false) {
        UI.toast('Added ' + qty + ' × ' + partDisplayName(pid) + ' to cart', 'success');
        T.render('market');
      } else if (r) {
        UI.toast(r.error || 'Could not add to cart', 'error');
      }
    },
    'mkt-add-deal': function (el) {
      var distId = el.getAttribute('data-dist');
      var pid = el.getAttribute('data-part');
      var r = cartAdd(distId, pid, 1);
      if (r && r.ok !== false) {
        UI.toast('Deal added to cart', 'success');
        T.render('market');
      } else if (r) {
        UI.toast(r.error || 'Could not add to cart', 'error');
      }
    },
    'mkt-cart-open': function () { openCartModal(); },

    /* ---- pending-order cancel (kept from §18.1, feature-detected) ---- */
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

  T.registerTab('inventory', renderInventory);
  T.registerTab('market', renderMarket);

})();
