/* Circuit & Solder — engine/pricing.js
 * Age curve, event multipliers, nightly noise walk, priceOf, price history,
 * market view builder. SPEC §5.2.
 */
(function (root) {
  'use strict';
  var Engine = root.Engine = root.Engine || {};
  var Pricing = Engine.Pricing = {};

  // Fractional intro/EOL years for a part.
  function introYearFloat(part) {
    return part.introYear + (((part.introMonth || 1) - 1) / 12);
  }
  Pricing.introYearFloat = introYearFloat;

  function isLegacy(part) {
    if (part.legacy != null) return !!part.legacy;
    // default: true for cpu/motherboard/ram/gpu, false otherwise (SPEC §2.1)
    return ['cpu', 'motherboard', 'ram', 'gpu'].indexOf(part.category) !== -1;
  }

  // Age curve per SPEC §5.2. yearNow is a fractional year.
  Pricing.ageCurve = function (part, yearNow) {
    var C = Engine.CONFIG.AGE;
    var t = yearNow - introYearFloat(part);            // years since intro
    var L = Math.max(1, (part.eolYear || part.introYear + 1) - part.introYear);
    if (t < 0) return 0;                               // unavailable
    var f = part.tier === 'premium' ? C.FLOOR_PREMIUM : C.FLOOR_STD;
    if (t < 0.5) return C.INTRO_PREMIUM + (1 - C.INTRO_PREMIUM) * (t / 0.5);
    if (t <= L) {
      return f + (1 - f) * Math.exp(-C.DECAY_K * (t - 0.5) / Math.max(0.5, L - 0.5));
    }
    // post-EOL
    var past = t - L;
    if (isLegacy(part)) {
      return Math.min(C.LEGACY_MAX, f + (past / C.LEGACY_RAMP_YEARS) * (C.LEGACY_MAX - f));
    }
    var frac = Math.min(1, past / C.NONLEGACY_DECAY_YEARS);
    return f + (C.NONLEGACY_FLOOR - f) * frac;
  };

  // Is the part on the market at all (intro date reached)?
  Pricing.isReleased = function (part, state) {
    return Engine.yearFloat(state.day, state) >= introYearFloat(part);
  };

  // Parts >25y past EOL: prune noise/history, no longer priced daily.
  Pricing.isPruned = function (part, state) {
    var y = Engine.yearFloat(state.day, state);
    return y - (part.eolYear || part.introYear + 1) > Engine.CONFIG.PRUNE_YEARS_PAST_EOL;
  };

  // Product of active-event multipliers matching this part (category + optional tags),
  // each ramped: 1 -> peak over first 15% of duration, hold, back to 1 over last 25%.
  Pricing.eventMult = function (state, part) {
    var C = Engine.CONFIG;
    var evs = state.market.activeEvents, mult = 1;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      var dur = Math.max(1, ev.endDay - ev.startDay);
      var prog = (state.day - ev.startDay) / dur;
      if (prog < 0 || prog > 1) continue;
      var ramp = 1;
      if (prog < C.EVENT_RAMP_IN) ramp = prog / C.EVENT_RAMP_IN;
      else if (prog > 1 - C.EVENT_RAMP_OUT) ramp = (1 - prog) / C.EVENT_RAMP_OUT;
      var effs = ev.effects || [];
      for (var j = 0; j < effs.length; j++) {
        var ef = effs[j];
        if (!ef || typeof ef.priceMult !== 'number') continue;
        if (ef.categories && ef.categories.indexOf(part.category) === -1) continue;
        if (ef.tags && ef.tags.length) {
          var hit = false, tags = part.platformTags || [];
          for (var k = 0; k < ef.tags.length; k++)
            if (tags.indexOf(ef.tags[k]) !== -1) { hit = true; break; }
          if (!hit) continue;
        }
        mult *= 1 + (ef.priceMult - 1) * ramp;
      }
    }
    return mult;
  };

  /* §15.1: accelerated decay for parts on a dying platform. For every
   * transition whose obsoleteTags intersect the part's platformTags, value
   * bleeds linearly over the window toward (1 - TRANSITION_OBSOLETE_BLEED),
   * and STAYS there after the window closes — the old platform never recovers
   * its price (the §5.2 post-EOL legacy/scarcity ramp still applies on top,
   * years later). Deterministic from DATA + state.day; no bookkeeping. */
  Pricing.obsoleteMult = function (state, part) {
    if (!state || !part) return 1;
    var list = Engine.transitionsData ? Engine.transitionsData() : [];
    if (!list.length) return 1;
    var tags = part.platformTags || [];
    if (!tags.length) return 1;
    var C = Engine.CONFIG;
    var mult = 1;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var obs = t.obsoleteTags || [];
      if (!obs.length) continue;
      var hit = false;
      for (var j = 0; j < obs.length; j++)
        if (tags.indexOf(obs[j]) !== -1) { hit = true; break; }
      if (!hit) continue;
      var w = Engine.transitionWindow(t, state);
      if (state.day < w.startDay) continue;
      var progress = Engine.clamp(
        (state.day - w.startDay) / Math.max(1, w.endDay - w.startDay), 0, 1);
      mult *= 1 - C.TRANSITION_OBSOLETE_BLEED * progress;
    }
    return mult;
  };
  // Is this part on a platform an ACTIVE transition is killing right now?
  // (Drives the §15.1 market/wiki "fading" status.)
  Pricing.obsoleteUnderTransition = function (state, part) {
    if (!state || !part) return false;
    var actives = Engine.activeTransitions ? Engine.activeTransitions(state) : [];
    var tags = part.platformTags || [];
    for (var i = 0; i < actives.length; i++) {
      var obs = actives[i].obsoleteTags || [];
      for (var j = 0; j < obs.length; j++)
        if (tags.indexOf(obs[j]) !== -1) return true;
    }
    return false;
  };

  /* Market price of a part today.
   * opts.buy: apply prestige buy discount (1 - 0.02*prestigeTier).
   * Returns a positive number, or 0 if the part is not yet released. */
  Pricing.priceOf = function (partId, state, opts) {
    var part = typeof partId === 'string' ? Engine.partById(partId) : partId;
    if (!part || !state) return 0;
    var yearNow = Engine.yearFloat(state.day, state);
    var age = Pricing.ageCurve(part, yearNow);
    if (age <= 0) return 0;
    var noise = state.market.noise[part.id] || 1;
    var p = part.basePrice * age * Pricing.eventMult(state, part) * noise *
            Pricing.obsoleteMult(state, part);   // §15.1
    if (opts && opts.buy) {
      p *= (1 - Engine.CONFIG.PRESTIGE_BUY_DISCOUNT * (state.reputation.prestige || 0));
    }
    return Math.max(0.5, Engine.round2(p));
  };

  // Nightly: update noise walk & record daily price history for released parts.
  // Prunes hist/noise for parts long past EOL. SPEC §5.3 step 3.
  Pricing.nightlyUpdate = function (state) {
    var C = Engine.CONFIG;
    var parts = (Engine.getData().PARTS) || [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (Pricing.isPruned(part, state)) {
        delete state.market.noise[part.id];
        delete state.market.hist[part.id];
        continue;
      }
      if (!Pricing.isReleased(part, state)) continue;
      var n = state.market.noise[part.id] || 1;
      n *= 1 + Engine.uniform(-C.NOISE_STEP, C.NOISE_STEP, 'prices');   // §17.5
      n = Engine.clamp(n, C.NOISE_MIN, C.NOISE_MAX);
      state.market.noise[part.id] = Engine.round2(n * 10000) / 10000; // keep tidy
      Pricing.recordPrice(state, part);
    }
  };

  Pricing.recordPrice = function (state, part) {
    var h = state.market.hist[part.id];
    if (!h) h = state.market.hist[part.id] = [];
    h.push(Pricing.priceOf(part, state));
    while (h.length > Engine.CONFIG.HIST_CAP) h.shift();
  };

  // Top +/-5 movers by 1-day % for the morning summary.
  Pricing.priceMovers = function (state) {
    var out = [];
    var parts = (Engine.getData().PARTS) || [];
    for (var i = 0; i < parts.length; i++) {
      var h = state.market.hist[parts[i].id];
      if (!h || h.length < 2) continue;
      var prev = h[h.length - 2], cur = h[h.length - 1];
      if (prev <= 0) continue;
      var pct = Engine.round2(100 * (cur - prev) / prev);
      if (pct !== 0) out.push({ name: parts[i].name, pct: pct });
    }
    out.sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
    return out.slice(0, 5);
  };

  // Market view for the UI (SPEC §4). Only released parts; category then price.
  Pricing.getMarket = function (state, filter) {
    filter = filter || {};
    var C = Engine.CONFIG;
    var parts = (Engine.getData().PARTS) || [];
    var yearNow = Engine.yearFloat(state.day, state);
    var out = [];
    var search = filter.search ? String(filter.search).toLowerCase() : null;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!Pricing.isReleased(part, state) || Pricing.isPruned(part, state)) continue;
      if (filter.category && part.category !== filter.category) continue;
      if (search && part.name.toLowerCase().indexOf(search) === -1 &&
          part.id.indexOf(search) === -1) continue;
      var h = state.market.hist[part.id] || [];
      var price = Pricing.priceOf(part, state);
      var change1 = 0, change30 = 0;
      if (h.length >= 2 && h[h.length - 2] > 0)
        change1 = Engine.round2(100 * (price - h[h.length - 2]) / h[h.length - 2]);
      if (h.length >= 2 && h[0] > 0)
        change30 = Engine.round2(100 * (price - h[0]) / h[0]);
      var inv = Engine.inventoryEntry(state, part.id);
      var introAgeDays = (yearNow - introYearFloat(part)) * 365.25;
      out.push({
        partId: part.id, name: part.name, category: part.category,
        tier: part.tier || 'mainstream',
        price: price, change1: change1, change30: change30,
        spark: h.slice(-14),
        inStockQty: inv ? inv.qty : 0,
        tags: (part.platformTags || []).slice(),
        perfLabel: perfLabel(part),
        scarce: yearNow > (part.eolYear || part.introYear + 1),
        isNew: introAgeDays >= 0 && introAgeDays < C.NEW_BADGE_DAYS,
        // §15.1 (UI contract): lifecycle status incl. transition-driven "fading"
        status: Pricing.partStatus(part, state)
      });
    }
    var catOrder = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case',
                    'cooling', 'os', 'peripheral'];
    out.sort(function (a, b) {
      var ca = catOrder.indexOf(a.category), cb = catOrder.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      return a.price - b.price;
    });
    return out;
  };

  function perfLabel(part) {
    var p = part.perf || {};
    if (p.cpu != null) return p.cpu + ' CPU';
    if (p.gpu != null) return p.gpu + ' GPU';
    if (p.ramMB != null) return (p.ramMB >= 1024 ? (p.ramMB / 1024) + 'GB' : p.ramMB + 'MB') + ' RAM';
    if (p.storageGB != null) {
      var g = p.storageGB;
      return (g >= 1 ? g + 'GB' : Engine.round2(g * 1000) + 'MB') + (p.speed ? ' @' + p.speed : '');
    }
    if (p.cool != null) return 'cool ' + p.cool;
    if (part.category === 'psu' && part.watts) return part.watts + 'W';
    return '';
  }
  Pricing.perfLabel = perfLabel;

  Pricing.getPriceHistory = function (state, partId) {
    return (state.market.hist[partId] || []).slice();
  };

  // ------------------------------------------------------------------
  // Part Wiki (§9.7)
  // ------------------------------------------------------------------
  // Lifecycle status: new -> current -> fading -> (post-EOL) scarce|legacy.
  Pricing.partStatus = function (part, state) {
    var y = Engine.yearFloat(state.day, state);
    var intro = introYearFloat(part);
    if (y < intro) return null;
    if ((y - intro) * 365.25 < Engine.CONFIG.NEW_BADGE_DAYS) return 'new';
    var eol = part.eolYear || part.introYear + 1;
    if (y <= eol) {
      var L = Math.max(1, eol - part.introYear);
      if (y >= part.introYear + 0.75 * L) return 'fading';
      // §15.1: a platform an active transition is killing reads "fading"
      // even mid-lifecycle — the market knows the writing is on the wall.
      if (Pricing.obsoleteUnderTransition(state, part)) return 'fading';
      return 'current';
    }
    return isLegacy(part) ? 'scarce' : 'legacy';
  };

  // Era-appropriate knowledge: only released parts have a wiki entry.
  Pricing.getPartInfo = function (state, partId) {
    var part = typeof partId === 'string' ? Engine.partById(partId) : partId;
    if (!part || !state || !Pricing.isReleased(part, state)) return null;
    var tags = (part.platformTags || []).slice();
    var h = state.market.hist[part.id] || [];
    var price = Pricing.priceOf(part, state);
    var change30 = 0;
    if (h.length >= 2 && h[0] > 0)
      change30 = Engine.round2(100 * (price - h[0]) / h[0]);
    var inv = Engine.inventoryEntry(state, part.id);
    return {
      partId: part.id, name: part.name, brand: part.brand || null,
      category: part.category, tier: part.tier || 'mainstream',
      tags: tags,
      tagLabels: tags.map(Engine.tagLabel),
      perf: part.perf || {},
      reliability: part.reliability || 0,
      powerDraw: part.powerDraw || 0,
      watts: part.watts || 0,
      introYear: part.introYear, eolYear: part.eolYear || part.introYear + 1,
      desc: part.desc || '',
      status: Pricing.partStatus(part, state),
      price: price, change30: change30,
      spark: h.slice(-14),
      inStockQty: inv ? inv.qty : 0
    };
  };

  var WIKI_CAT_ORDER = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu',
                        'case', 'cooling', 'os', 'peripheral'];
  Pricing.getWiki = function (state, filter) {
    filter = filter || {};
    var parts = (Engine.getData().PARTS) || [];
    var search = filter.search ? String(filter.search).toLowerCase() : null;
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!Pricing.isReleased(part, state)) continue;
      if (filter.category && part.category !== filter.category) continue;
      if (search &&
          part.name.toLowerCase().indexOf(search) === -1 &&
          String(part.brand || '').toLowerCase().indexOf(search) === -1 &&
          part.id.indexOf(search) === -1) continue;
      out.push(Pricing.getPartInfo(state, part));
    }
    out.sort(function (a, b) {
      var ca = WIKI_CAT_ORDER.indexOf(a.category), cb = WIKI_CAT_ORDER.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      if (a.introYear !== b.introYear) return a.introYear - b.introYear;
      return a.name < b.name ? -1 : 1;
    });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
