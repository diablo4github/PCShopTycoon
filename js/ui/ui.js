/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/ui.js
 * UI core: init/bootstrap, screen & tab switching, central refresh,
 * header rendering, toasts, modals, confirm dialogs, small dom helpers,
 * sparkline / star-rating / pip-bar widgets, era-skin updater.
 *
 * The UI computes NO game rules: it renders Engine.getState() + view APIs
 * and calls Engine mutators. Any {ok:false} becomes a toast; any ok:true
 * mutation is followed by UI.refresh().
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};

  /* ------------------------------------------------------------------ *
   * UI-local (non-game) state
   * ------------------------------------------------------------------ */
  UI.state = {
    screen: 'newgame',        // 'newgame' | 'main' | 'gameover'
    activeTab: 'offers',
    selectedEra: null,        // new-game screen selection
    shopName: '',             // new-game screen input value
    marketCat: 'all',         // Parts Market category filter
    marketSearch: '',         // Parts Market search text
    wikiCat: 'all',           // Wiki category filter (§9.7)
    wikiSearch: '',           // Wiki search text
    wikiOpen: {},             // partId -> true for expanded wiki rows
    saveUrl: null             // objectURL of the last exported save blob
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** HTML-escape a value. Every flavor/customer/engine string goes through this. */
  UI.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  };

  /** querySelector shorthand. */
  UI.$ = function (sel, root) { return (root || document).querySelector(sel); };

  /** Create an element with optional class and innerHTML. */
  UI.el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== null && html !== undefined) e.innerHTML = html;
    return e;
  };

  /** Money formatting — delegates to Engine.fmtMoney, with a safe fallback. */
  UI.fm = function (x) {
    if (window.Engine && typeof Engine.fmtMoney === 'function') {
      try { return Engine.fmtMoney(x); } catch (e) { /* fall through */ }
    }
    var n = Number(x) || 0;
    var neg = n < 0;
    var s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-$' : '$') + s;
  };

  /** Signed percent like "+3.4%". */
  UI.pct = function (p) {
    var n = Number(p) || 0;
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  };

  /** True when the engine namespace looks usable. */
  UI.engineReady = function () {
    return !!(window.Engine &&
      typeof Engine.newGame === 'function' &&
      typeof Engine.getState === 'function');
  };

  /** Run an Engine call, converting thrown exceptions into {ok:false}. */
  UI.tryCall = function (fn) {
    try { return fn(); }
    catch (e) {
      if (window.console && console.error) console.error(e);
      return { ok: false, error: 'Engine error: ' + (e && e.message ? e.message : e) };
    }
  };

  /**
   * Standard handling of a mutator result:
   * {ok:false} -> error toast; ok -> optional success toast + UI.refresh().
   */
  UI.api = function (res, okMsg) {
    if (!res) { UI.toast('No response from engine', 'error'); return null; }
    if (res.ok === false) {
      UI.toast(res.error || 'That did not work', 'error');
      return res;
    }
    if (okMsg) UI.toast(okMsg, 'success');
    UI.refresh();
    return res;
  };

  /**
   * §9.9 — Run a mutator with action feedback: snapshots cash & hoursLeft
   * before the call, diffs afterwards, and spawns floating "+$85" / "-1.5h"
   * deltas near the header readouts (plus a pip pulse and purchase/cash SFX).
   * Then applies standard UI.api handling. Returns the engine result.
   */
  UI.act = function (fn, okMsg) {
    var before = null;
    if (UI.engineReady()) {
      try {
        var st0 = Engine.getState();
        if (st0) before = { cash: Number(st0.cash) || 0, hours: Number(st0.hoursLeft) || 0 };
      } catch (e) { /* ignore */ }
    }
    var res = UI.tryCall(fn);
    if (res && res.ok !== false && before) {
      try {
        var st1 = Engine.getState();
        if (st1) {
          var dc = Math.round(((Number(st1.cash) || 0) - before.cash) * 100) / 100;
          var dh = Math.round(((Number(st1.hoursLeft) || 0) - before.hours) * 100) / 100;
          UI.feedback(dc, dh);
        }
      } catch (e2) { /* ignore */ }
    }
    return UI.api(res, okMsg);
  };

  /** Spawn the §9.9 floating deltas / pip pulse for a cash & hours change. */
  UI.feedback = function (cashDelta, hoursDelta) {
    if (cashDelta) {
      UI.floatDelta(document.getElementById('hdr-cash'),
        (cashDelta > 0 ? '+' : '-') + UI.fm(Math.abs(cashDelta)),
        cashDelta > 0 ? 'd-cash-up' : 'd-cash-down');
      if (UI.audio && UI.audio.sfx) UI.audio.sfx(cashDelta > 0 ? 'complete' : 'purchase');
    }
    if (hoursDelta && hoursDelta < 0) {
      UI.floatDelta(document.getElementById('hdr-hours'),
        (Math.round(hoursDelta * 10) / 10) + 'h', 'd-hours');
      var hoursEl = document.getElementById('hdr-hours');
      var pips = hoursEl && hoursEl.querySelector('.pips');
      if (pips) {
        pips.classList.add('pulse');
        window.setTimeout(function () { pips.classList.remove('pulse'); }, 500);
      }
    }
  };

  /** Float a short-lived delta label near an anchor element. */
  UI.floatDelta = function (anchor, text, cls) {
    if (!anchor || !anchor.getBoundingClientRect) return;
    var rect = anchor.getBoundingClientRect();
    var z = (UI.zoom && UI.zoom.factor) || 1;
    var el = document.createElement('span');
    el.className = 'float-delta ' + (cls || '');
    el.textContent = String(text);
    el.style.left = Math.max(4, (rect.left + rect.width / 2 - 20) / z) + 'px';
    el.style.top = Math.max(4, (rect.bottom + 6) / z) + 'px';
    document.body.appendChild(el);
    window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 750);
  };

  /* ------------------------------------------------------------------ *
   * Widgets
   * ------------------------------------------------------------------ */

  /** Star rating with half-star support: 5 glyph slots. */
  UI.starsHTML = function (rating) {
    var val = Number(rating) || 0;
    var r = Math.round(val * 2) / 2;
    var out = '';
    for (var i = 1; i <= 5; i++) {
      if (r >= i) {
        out += '<span class="star full">★</span>';
      } else if (r >= i - 0.5) {
        out += '<span class="star half"><span class="star-fill">★</span>★</span>';
      } else {
        out += '<span class="star">★</span>';
      }
    }
    return '<span class="stars" title="Rating ' + val.toFixed(2) + ' / 5">' + out + '</span>';
  };

  /**
   * Hours pip bar (8 pips, half pips supported).
   * §9.4: negative hoursLeft (overtime) renders extra red OT pips and an
   * "OT" badge after the bar.
   */
  UI.pipBarHTML = function (hoursLeft, total) {
    total = Math.max(1, Math.round(total || 8));
    var hl = Number(hoursLeft) || 0;
    var i, fill;
    var html = '<span class="pips" title="' +
      (hl < 0 ? Math.abs(hl) + 'h of overtime worked' : hl + 'h of ' + total + 'h left today') + '">';
    for (i = 0; i < total; i++) {
      fill = Math.max(0, Math.min(1, hl - i));
      html += '<span class="pip' + (fill >= 1 ? ' full' : (fill > 0 ? ' half' : '')) + '"></span>';
    }
    if (hl < 0) {
      var ot = Math.abs(hl);
      var otPips = Math.ceil(ot);
      for (i = 0; i < otPips; i++) {
        fill = Math.max(0, Math.min(1, ot - i));
        html += '<span class="pip ot' + (fill >= 1 ? '' : ' half') + '"></span>';
      }
    }
    html += '</span>';
    if (hl < 0) html += '<span class="ot-badge" title="Working overtime — tomorrow starts short">OT</span>';
    return html;
  };

  /** Inline SVG sparkline from an array of numbers. */
  UI.sparkSVG = function (values, w, h) {
    w = w || 76; h = h || 22;
    if (!values || !values.length) {
      return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"></svg>';
    }
    var vals = values.map(function (v) { return Number(v) || 0; });
    if (vals.length === 1) vals = [vals[0], vals[0]];
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var pad = 2;
    var pts = vals.map(function (v, i) {
      var x = pad + i * (w - pad * 2) / (vals.length - 1);
      var y = (h - pad) - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var last = pts[pts.length - 1].split(',');
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" points="' + pts.join(' ') + '"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.8" fill="currentColor"/>' +
      '</svg>';
  };

  /** Difficulty as wrench icons (filled up to d, faded to 5). */
  UI.wrenches = function (d) {
    var lvl = Math.max(1, Math.min(5, Math.round(Number(d) || 1)));
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += '<span class="wr' + (i <= lvl ? ' on' : '') + '">🔧</span>';
    }
    return '<span class="wrenches" title="Difficulty ' + lvl + ' of 5">' + out + '</span>';
  };

  /** Simple progress bar; cls e.g. "wide", "grow", "over", "good". */
  UI.barHTML = function (val, max, cls) {
    var p = (Number(max) > 0) ? Math.max(0, Math.min(100, (Number(val) || 0) / Number(max) * 100)) : 0;
    return '<span class="bar ' + (cls || '') + '"><i style="width:' + p.toFixed(1) + '%"></i></span>';
  };

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */

  /** Show a toast. kind: 'info' | 'success' | 'error'. */
  UI.toast = function (msg, kind, ms) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var t = document.createElement('div');
    t.className = 'toast t-' + (kind || 'info');
    t.textContent = String(msg == null ? '' : msg); // textContent: injection-safe
    if (kind === 'error' && UI.audio && UI.audio.sfx) UI.audio.sfx('error');
    root.appendChild(t);
    while (root.children.length > 5) root.removeChild(root.firstChild);
    window.setTimeout(function () {
      t.classList.add('out');
      window.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 280);
    }, ms || 3800);
  };

  /* ------------------------------------------------------------------ *
   * Modal + confirm helpers
   * ------------------------------------------------------------------ */

  /**
   * Open a modal. opts: { title, html, buttons: [{label, cls, onClick, keepOpen}],
   * onClose, noX, static }. Returns { close, el }. Buttons close the modal after
   * onClick unless keepOpen is true. Listeners live on elements that are removed
   * with the modal, so nothing leaks.
   */
  UI.modal = function (opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root');
    if (!root) return null;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          '<h2>' + UI.esc(opts.title || '') + '</h2>' +
          (opts.noX ? '' : '<button type="button" class="modal-x" data-close aria-label="Close">×</button>') +
        '</div>' +
        '<div class="modal-body">' + (opts.html || '') + '</div>' +
        '<div class="modal-foot"></div>' +
      '</div>';

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof opts.onClose === 'function') opts.onClose();
    }
    overlay._close = close; // used by the global Escape handler

    overlay.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      if (t === overlay && !opts.static) { close(); return; }
      if (t.closest && t.closest('[data-close]')) close();
    });

    var foot = overlay.querySelector('.modal-foot');
    var buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ label: 'Close', cls: 'btn' }];
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = b.cls || 'btn';
      btn.textContent = b.label || 'OK';
      btn.addEventListener('click', function () {
        if (typeof b.onClick === 'function') b.onClick();
        if (!b.keepOpen) close();
      });
      foot.appendChild(btn);
    });

    root.appendChild(overlay);
    return { close: close, el: overlay };
  };

  /** Confirmation dialog. */
  UI.confirm = function (message, onYes, opts) {
    opts = opts || {};
    UI.modal({
      title: opts.title || 'Are you sure?',
      html: '<p class="confirm-msg">' + UI.esc(message) + '</p>',
      buttons: [
        { label: opts.cancelLabel || 'Cancel', cls: 'btn' },
        {
          label: opts.yesLabel || 'Confirm',
          cls: opts.danger === false ? 'btn btn-primary' : 'btn btn-danger',
          onClick: function () { if (typeof onYes === 'function') onYes(); }
        }
      ]
    });
  };

  /* ------------------------------------------------------------------ *
   * Era skin
   * ------------------------------------------------------------------ */

  /** Swap the body's era-skin class from the in-game year. */
  UI.updateEraSkin = function (year) {
    var y = Number(year) || 0;
    var cls = y <= 1989 ? 'era-early' : (y <= 1999 ? 'era-90s' : (y <= 2009 ? 'era-00s' : 'era-modern'));
    var b = document.body;
    if (!b.classList.contains(cls)) {
      b.classList.remove('era-early', 'era-90s', 'era-00s', 'era-modern');
      b.classList.add(cls);
      if (UI.audio && UI.audio.setEra) UI.audio.setEra(cls);
    }
  };

  /* ------------------------------------------------------------------ *
   * §9.9 UI scaling (auto zoom + user override, localStorage "cst-zoom")
   * ------------------------------------------------------------------ */

  UI.zoom = {
    KEY: 'cst-zoom',
    mode: 'auto',        // 'auto' | '0.8' | '1' | '1.15' | '1.3'
    factor: 1,           // effective zoom currently applied
    _timer: null,

    load: function () {
      try {
        if (typeof localStorage !== 'undefined') {
          var v = localStorage.getItem(this.KEY);
          if (v && (v === 'auto' || !isNaN(parseFloat(v)))) this.mode = v;
        }
      } catch (e) { /* storage unavailable */ }
    },

    set: function (mode) {
      this.mode = mode;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(this.KEY, mode);
      } catch (e) { /* ignore */ }
      this.apply();
    },

    compute: function () {
      if (this.mode !== 'auto') return parseFloat(this.mode) || 1;
      var w = window.innerWidth || 1440;
      return Math.min(1.4, Math.max(0.8, w / 1440));
    },

    apply: function () {
      var z = Math.round(this.compute() * 1000) / 1000;
      this.factor = z;
      var body = document.body;
      if (!body) return;
      try { document.documentElement.style.setProperty('--ui-zoom', String(z)); } catch (e) { /* ignore */ }
      if ('zoom' in body.style) {
        body.style.zoom = String(z);
        body.style.transform = '';
        body.style.transformOrigin = '';
        body.style.width = '';
      } else {
        // transform fallback (pre-126 Firefox etc.)
        body.style.transform = z === 1 ? '' : 'scale(' + z + ')';
        body.style.transformOrigin = '0 0';
        body.style.width = z === 1 ? '' : (100 / z) + '%';
      }
    },

    init: function () {
      var self = this;
      this.load();
      this.apply();
      window.addEventListener('resize', function () {
        if (self.mode !== 'auto') return;
        if (self._timer) window.clearTimeout(self._timer);
        self._timer = window.setTimeout(function () { self.apply(); }, 150);
      });
    }
  };

  /* ------------------------------------------------------------------ *
   * Screens & tabs
   * ------------------------------------------------------------------ */

  UI.showScreen = function (name) {
    UI.state.screen = name;
    ['newgame', 'main', 'gameover'].forEach(function (n) {
      var el = document.getElementById('screen-' + n);
      if (el) el.hidden = (n !== name);
    });
  };

  UI.switchTab = function (id) {
    UI.state.activeTab = id;
    var bar = document.getElementById('tab-bar');
    if (bar) {
      var btns = bar.querySelectorAll('.tab-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === id);
      }
    }
    var panels = document.querySelectorAll('.tab-panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].hidden = (panels[j].id !== 'tab-' + id);
    }
    if (UI.tabs && UI.tabs.render) UI.tabs.render(id);
  };

  /* ------------------------------------------------------------------ *
   * Header
   * ------------------------------------------------------------------ */

  UI.renderHeader = function (st, di) {
    function byId(id) { return document.getElementById(id); }

    var nameEl = byId('hdr-shopname');
    if (nameEl) nameEl.textContent = st.shopName || '';

    var dateEl = byId('hdr-date');
    if (dateEl) dateEl.textContent = di ? di.label : '';

    var cashEl = byId('hdr-cash');
    if (cashEl) {
      var neg = (Number(st.cash) || 0) < 0;
      cashEl.classList.toggle('neg', neg);
      var grace = '';
      if (neg && st.flags && st.flags.graceDeadlineDay !== null && st.flags.graceDeadlineDay !== undefined) {
        var left = Math.max(0, st.flags.graceDeadlineDay - st.day);
        grace = ' <span class="grace" title="Get cash positive before the grace period ends">' + left + 'd grace</span>';
      }
      cashEl.innerHTML = UI.esc(UI.fm(st.cash)) + grace;
    }

    var hoursEl = byId('hdr-hours');
    if (hoursEl) hoursEl.innerHTML = UI.pipBarHTML(st.hoursLeft, st.hoursPerDay || 8);

    var ratingEl = byId('hdr-rating');
    if (ratingEl) ratingEl.innerHTML = UI.starsHTML(st.reputation ? st.reputation.rating : 0);

    var presLabel = '';
    var tierName = '';
    try {
      var pi = Engine.getPrestigeInfo();
      if (pi && pi.label) presLabel = pi.label;
    } catch (e) { /* engine may not be ready */ }
    try {
      var sv = Engine.getShopView();
      if (sv && sv.tier && sv.tier.name) tierName = sv.tier.name;
    } catch (e2) { /* ignore */ }

    var presEl = byId('hdr-prestige');
    if (presEl) { presEl.textContent = presLabel; presEl.hidden = !presLabel; }
    var tierEl = byId('hdr-tier');
    if (tierEl) { tierEl.textContent = tierName; tierEl.hidden = !tierName; }

    var endBtn = byId('btn-endday');
    if (endBtn) endBtn.disabled = !!(st.flags && st.flags.gameOver);
  };

  /** Tab badges: new offers today, and active jobs due today. */
  UI.updateBadges = function (st) {
    var newOffers = 0;
    var dueToday = 0;
    try {
      var offers = Engine.getOffers() || [];
      for (var i = 0; i < offers.length; i++) {
        if (offers[i].offeredDay === st.day) newOffers++;
      }
      var active = Engine.getActiveJobs() || [];
      for (var j = 0; j < active.length; j++) {
        var dl = active[j].deadlineDay;
        if (dl !== null && dl !== undefined && dl <= st.day) dueToday++;
      }
    } catch (e) { /* engine not ready */ }
    setBadge('badge-offers', newOffers);
    setBadge('badge-workbench', dueToday);
  };

  function setBadge(id, count) {
    var el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = String(count); el.hidden = false; }
    else { el.hidden = true; }
  }

  /* ------------------------------------------------------------------ *
   * Central refresh
   * ------------------------------------------------------------------ */

  UI.refresh = function () {
    if (!UI.engineReady()) return;
    var st;
    try { st = Engine.getState(); } catch (e) { return; }
    if (!st) return;

    if (st.flags && st.flags.gameOver) {
      if (UI.screens && UI.screens.renderGameOver) UI.screens.renderGameOver();
      UI.showScreen('gameover');
      return;
    }

    var di = null;
    try { di = Engine.dateInfo(st.day); } catch (e2) { /* ignore */ }
    if (di) UI.updateEraSkin(di.y);

    UI.renderHeader(st, di);
    UI.updateBadges(st);

    if (UI.state.screen !== 'main') UI.showScreen('main');
    if (UI.tabs && UI.tabs.render) UI.tabs.render(UI.state.activeTab);
  };

  /* ------------------------------------------------------------------ *
   * End Day
   * ------------------------------------------------------------------ */

  UI.endDay = function () {
    if (!UI.engineReady()) { UI.toast('Engine not loaded', 'error'); return; }

    // §9.9: brief disabled shimmer on the button while the summary opens.
    var btn = document.getElementById('btn-endday');
    if (btn && !btn.disabled) {
      btn.classList.add('shimmer');
      window.setTimeout(function () { btn.classList.remove('shimmer'); }, 700);
    }

    var res = UI.tryCall(function () { return Engine.endDay(); });
    if (!res || res.ok === false) {
      if (btn) btn.classList.remove('shimmer');
      UI.toast((res && res.error) || 'Could not end the day', 'error');
      return;
    }
    if (UI.audio && UI.audio.sfx) {
      UI.audio.sfx('endday');
      if (res.summary && res.summary.callbacks && res.summary.callbacks.length) {
        window.setTimeout(function () { UI.audio.sfx('callback'); }, 450);
      }
    }
    UI.refresh(); // updates header/tabs (and swaps to game-over screen if needed)
    if (UI.screens && UI.screens.showMorningSummary) UI.screens.showMorningSummary(res.summary);
  };

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  UI.init = function () {
    // Reveal data-debug controls with ?debug in the URL.
    if (/[?&]debug/.test(window.location.search)) document.body.classList.add('debug');

    // §9.9 UI scaling and §9.8 audio (both no-ops if unavailable).
    UI.zoom.init();
    if (UI.audio && UI.audio.init) UI.audio.init();

    // Delegated, one-time listeners (never re-bound across refreshes).
    var bar = document.getElementById('tab-bar');
    if (bar) {
      bar.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var b = t.closest('[data-tab]');
        if (b) {
          if (UI.audio && UI.audio.sfx) UI.audio.sfx('click');
          UI.switchTab(b.getAttribute('data-tab'));
        }
      });
    }

    var endBtn = document.getElementById('btn-endday');
    if (endBtn) endBtn.addEventListener('click', function () { UI.endDay(); });

    // §9.8 header mute toggles (audio.js keeps their visual state in sync).
    var musicBtn = document.getElementById('btn-music');
    if (musicBtn) musicBtn.addEventListener('click', function () {
      if (UI.audio && UI.audio.toggleMusic) UI.audio.toggleMusic();
    });
    var sfxBtn = document.getElementById('btn-sfx');
    if (sfxBtn) sfxBtn.addEventListener('click', function () {
      if (UI.audio && UI.audio.toggleSfx) UI.audio.toggleSfx();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var root = document.getElementById('modal-root');
        var last = root && root.lastElementChild;
        if (last && last._close) last._close();
      }
    });

    if (UI.tabs && UI.tabs.bind) UI.tabs.bind();
    if (UI.screens && UI.screens.bind) UI.screens.bind();

    // Land on the New Game screen (it offers Continue when an autosave exists).
    if (UI.screens && UI.screens.renderNewGame) UI.screens.renderNewGame();
    UI.showScreen('newgame');
  };

})();
