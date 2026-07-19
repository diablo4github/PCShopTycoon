/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-core.js  (§17.3 split)
 * Core of the UI.tabs namespace: shared helpers (UI.tabs.shared), the
 * render/action registries, and the three delegated listeners
 * (click/change/input) that live on #tab-panels forever.
 *
 * The split is MECHANICAL (zero behavior change): every renderer and every
 * data-action handler moved verbatim into per-tab modules that register
 * themselves here. Load order (index.html): tabs-core.js first, then the
 * feature modules, all after ui.js/audio.js and before tutorial.js.
 *
 * History markers preserved from the monolith: §9 pattern notes, §10.x,
 * §12.x, §13.x, §14.x, §15.x, §16.x — see each feature module.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared = T.shared || {};

  /* ---------------- shared shorthands ---------------- */
  function esc(s) { return UI.esc(s); }
  function fm(x) { return UI.fm(x); }
  function tryCall(fn) { return UI.tryCall(fn); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function getState() {
    if (!UI.engineReady()) return null;
    try { return Engine.getState(); } catch (e) { return null; }
  }
  function emptyBox(msg) { return '<div class="empty">' + esc(msg) + '</div>'; }
  /** §14.8 — hours now land on a 0.1h grid from the engine; format to a
   * clean 1 decimal (never a floating-point artifact like 1.7999999999998),
   * dropping a trailing ".0" for whole hours. Guards NaN/Infinity too. */
  function fmtHours(h) {
    var n = Number(h);
    if (!isFinite(n)) return '0';
    return n.toFixed(1).replace(/\.0$/, '');
  }

  var CATEGORIES = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case', 'cooling', 'os', 'peripheral'];
  var CAT_LABELS = {
    cpu: 'CPU', motherboard: 'Motherboard', ram: 'RAM', storage: 'Storage',
    gpu: 'GPU', psu: 'PSU', 'case': 'Case', cooling: 'Cooling', os: 'OS', peripheral: 'Peripheral',
    expansion: 'Expansion'
  };
  /** §12.3 — label helper for OPEN-ENDED categories (expansion & future). */
  function catLabel(c) {
    return CAT_LABELS[c] || prettySubtype(c || '');
  }
  /** §12.3 — categories derived from the live market so new ones (e.g.
   * "expansion") appear in filter chips without hardcoded lists. */
  var catCache = { day: null, list: null };
  function knownCategories() {
    var st = getState();
    var day = st ? st.day : -1;
    if (catCache.list && catCache.day === day) return catCache.list;
    var list = null;
    if (has('getMarket')) {
      var rows = tryCall(function () { return Engine.getMarket({}); });
      if (Array.isArray(rows) && rows.length) {
        var seen = {};
        list = [];
        // keep the canonical order first, then anything new in encounter order
        CATEGORIES.forEach(function (c) { seen[c] = false; });
        rows.forEach(function (r) {
          if (r && r.category && !(r.category in seen)) { seen[r.category] = false; }
        });
        CATEGORIES.forEach(function (c) { if (c in seen) { list.push(c); seen[c] = true; } });
        rows.forEach(function (r) {
          if (r && r.category && seen[r.category] === false) { list.push(r.category); seen[r.category] = true; }
        });
      }
    }
    catCache = { day: day, list: list || CATEGORIES.slice() };
    return catCache.list;
  }
  var TYPE_LABELS = {
    repair: 'Repair', upgrade: 'Upgrade', build: 'Custom Build', refurb: 'Refurb',
    data_recovery: 'Data Recovery', software: 'Software', cleaning: 'Cleaning',
    peripheral: 'Peripheral', contract: 'Contract', enthusiast: 'Enthusiast', callback: 'Callback',
    device_repair: 'Device Repair'
  };
  var SUBTYPE_LABELS = {
    virus: 'Virus Removal', os_install: 'OS Install', overclock: 'Overclock',
    aesthetic: 'Aesthetic Build', thermal_paste: 'Thermal Paste', contract_build: 'Build Contract',
    contract_upgrade: 'Upgrade Contract', crt: 'CRT', printer: 'Printer',
    lcd: 'LCD Monitor', modem: 'Modem', input: 'Input Device', scanner: 'Scanner',
    apple: 'Apple', smartphone: 'Smartphone', tablet: 'Tablet'
  };
  /** §10.5 — subtypes are open-ended (peripheral kinds); prettify unknowns. */
  function prettySubtype(s) {
    s = String(s).replace(/_/g, ' ');
    if (s.length <= 3) return s.toUpperCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  var SPEED_TIP = 'Work speed trade-off — Quick: fewer hours on the bench but a much higher ' +
    'warranty-callback risk and a rating penalty. Standard: baseline. Meticulous: more hours, ' +
    'far fewer callbacks and a rating bonus.';
  /* §14.2 — graded: 1.75-2.5x the original is a mild ding, over 2.5x is worse.
   * Waived when the part matches the customer's taste (fanboys) or the job
   * is enthusiast work — same waiver either grade. */
  var OVERSPEND_TIP = 'The customer grumbles — and the job score dips — when you fit a part far ' +
    'pricier than what it replaces. 1.75-2.5x the original price is a mild ding; over 2.5x costs ' +
    'more. Waived when the part matches the customer\'s taste (fanboys) or the job is enthusiast work.';

  /** Feature-detection for engine APIs still landing (§9 onward). */
  function has(fnName) {
    return !!(window.Engine && typeof Engine[fnName] === 'function');
  }

  /** §21.6 version-gate hazard fix — Engine.VERSION '0.10' reads as 0.1 under
   * parseFloat (a plain float can never tell a two-digit minor from a
   * one-digit one), which would silently regress every "engine ≥ X" gate.
   * The old numeric `engineV()` compared engine version as a JS Number and
   * is REMOVED; every gate now goes through UI.engineVerAtLeast(want), which
   * splits both sides on '.' and compares segment-by-segment as integers
   * ('0.10' > '0.9.1' > '0.9'). Exposed here as engineAtLeast so tab modules
   * can destructure it like the rest of the shared surface. */
  function engineAtLeast(want) {
    return !!(UI.engineVerAtLeast && UI.engineVerAtLeast(want));
  }

  /** §9.4 overtime floor (Engine.CONFIG.overtimeCap, default 3) — shared by
   * every hour-spending action's disabled/hint state, incl. §13.4 studying. */
  function otCapValue() {
    var otCap = 3;
    try {
      var cfg = Engine.getConfig && Engine.getConfig();
      if (cfg && typeof cfg.overtimeCap === 'number') otCap = cfg.overtimeCap;
    } catch (e) { /* ignore */ }
    return otCap;
  }

  /** §22.2 #13 — the SAME source the header prestige chip (#hdr-prestige,
   * ui.js) reads: Engine.getPrestigeInfo().tier. Used to gate the
   * "Well-Reviewed" copy in empty states without re-deriving the rule —
   * false (gate NOT proven met) on any engine hiccup, never a crash. */
  function prestigeTierAtLeast(n) {
    if (!has('getPrestigeInfo')) return false;
    var pi = tryCall(function () { return Engine.getPrestigeInfo(); });
    return !!(pi && isFinite(Number(pi.tier)) && Number(pi.tier) >= n);
  }

  /* ------------------------------------------------------------------ *
   * §19.9 (#2) — real dates everywhere: "Apr 6, 1983", never "day N".
   * §19.9 (#16) — capacity units via Engine.fmtCapacity where shipped.
   * ------------------------------------------------------------------ */

  /** Short real date for a day index ("Apr 6, 1983"); '' when unknown. */
  function fmtDay(dayIndex) {
    if (dayIndex === null || dayIndex === undefined || !isFinite(Number(dayIndex))) return '';
    try {
      var di = Engine.dateInfo(Number(dayIndex));
      if (di && di.monthName) {
        return String(di.monthName).slice(0, 3) + ' ' + di.d + ', ' + di.y;
      }
    } catch (e) { /* engine not ready */ }
    return 'day ' + dayIndex;
  }

  /** RAM sizes arrive in MB; storage in GB. Engine.fmtCapacity(megabytes)
   * picks the honest magnitude ("640 KB", "8 MB", "1.2 GB") — adopted
   * everywhere capacities render; plain suffixes remain the fallback. */
  function fmtMB(mb) {
    if (mb === null || mb === undefined) return '';
    if (has('fmtCapacity')) {
      try { return Engine.fmtCapacity(Number(mb)); } catch (e) { /* fall through */ }
    }
    return mb + ' MB';
  }
  function fmtGB(gb) {
    if (gb === null || gb === undefined) return '';
    if (has('fmtCapacity')) {
      try { return Engine.fmtCapacity(Number(gb) * 1024); } catch (e) { /* fall through */ }
    }
    return gb + ' GB';
  }

  /* ------------------------------------------------------------------ *
   * §14.2 — vs-original quality cue + graded overspend, shared by the
   * needs picker, the build schematic's slot popover, and the classic
   * select-list fallback. Every field here is feature-detected: an engine
   * that hasn't shipped the new fields yet just renders no cue/old chip,
   * never a crash.
   * ------------------------------------------------------------------ */

  /** Grade an option's overspend severity. Prefers the engine's explicit
   * `overspendKind` ('mild'|'hard'); falls back to the pre-14.2 boolean
   * `overspend` (rendered as the old single-level ⚠ warning) so nothing
   * breaks while the engine ships the graded version. */
  function overspendKind(o) {
    if (!o) return null;
    if (o.overspendKind === 'mild' || o.overspendKind === 'hard') return o.overspendKind;
    return o.overspend ? 'legacy' : null;
  }
  function overspendPrefix(kind) {
    if (kind === 'hard') return '⚠⚠ ';
    if (kind === 'mild' || kind === 'legacy') return '⚠ ';
    return '';
  }
  /** Colored chip for rich (HTML) contexts — the need-meta line, schematic popover. */
  function overspendChipHTML(kind) {
    if (!kind) return '';
    if (kind === 'legacy') {
      return '<span class="chip-overspend" title="' + esc(OVERSPEND_TIP) + '">⚠ much pricier than the original</span>';
    }
    var mild = kind === 'mild';
    return '<span class="chip-overspend ' + (mild ? 'mild' : 'hard') + '" title="' + esc(OVERSPEND_TIP) + '">' +
      (mild ? '⚠ a bit pricier than the original' : '⚠⚠ much pricier than the original') + '</span>';
  }

  /** Feature-detect the engine's per-option vs-original comparison:
   * `option.vsOriginal = { origLabel, cmp: 'better'|'match'|'worse', newLabel? }`.
   * Absent on engines that have not shipped it yet — degrade to no cue,
   * never guess at a value the engine has not computed. */
  function vsOriginalOf(o) {
    var v = o && o.vsOriginal;
    return (v && v.cmp) ? v : null;
  }
  function vsArrow(cmp) {
    return cmp === 'better' ? '▲' : (cmp === 'worse' ? '▼' : '=');
  }
  /** Plain-text cue for native <option> labels (no HTML allowed inside <option>). */
  function vsOriginalText(v) {
    var lead = v.newLabel ? (v.newLabel + ' ') : '';
    return lead + vsArrow(v.cmp) + (v.origLabel ? ' vs ' + v.origLabel : '');
  }
  /** Colored HTML cue for rich contexts — green ▲ better / grey = match / amber ▼ worse. */
  function vsOriginalHTML(v) {
    if (!v) return '';
    var cls = v.cmp === 'better' ? 'vs-better' : (v.cmp === 'worse' ? 'vs-worse' : 'vs-match');
    return '<span class="vs-cue ' + cls + '" title="Compared with the part currently installed">' +
      (v.newLabel ? esc(v.newLabel) + ' ' : '') + vsArrow(v.cmp) +
      (v.origLabel ? ' vs ' + esc(v.origLabel) : '') + '</span>';
  }

  /* ------------------------------------------------------------------ *
   * Shared render helpers (used by two or more tab modules)
   * ------------------------------------------------------------------ */

  function typeChip(j) {
    var label = TYPE_LABELS[j.type] || j.type || '';
    if (j.subtype) label = SUBTYPE_LABELS[j.subtype] || prettySubtype(j.subtype); // §10.5
    return '<span class="chip chip-type t-' + esc(j.type) + '">' + esc(label) + '</span>';
  }

  /** §9.2 customer taste chip (never a penalty — bonus when matched). */
  function tasteChip(j) {
    if (!j.taste || !j.taste.label) return '';
    var bonus = j.taste.bonusPct ? '+' + j.taste.bonusPct + '% pay' : 'bonus pay';
    return ' <span class="chip chip-taste" title="Use a matching ' +
      esc(j.taste.brand || '') + (j.taste.category ? ' ' + esc(j.taste.category) : '') +
      ' part for ' + esc(bonus) + ' and a happier customer">♥ ' + esc(j.taste.label) + '</span>';
  }

  function custTypeLabel(typeId) {
    try {
      var list = window.DATA && DATA.FLAVOR && DATA.FLAVOR.customerTypes;
      if (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === typeId) return list[i].label;
        }
      }
    } catch (e) { /* ignore */ }
    if (!typeId) return '';
    return String(typeId).charAt(0).toUpperCase() + String(typeId).slice(1);
  }

  function customerLine(j) {
    if (!j.customer) return '';
    var s = esc(j.customer.name || '');
    var tl = custTypeLabel(j.customer.type);
    if (tl) s += ' <span class="chip">' + esc(tl) + '</span>';
    return s;
  }

  /* §22.2 #1 — job-card titles carry the engine's title as-is, which is
   * often "<title> — <quote/fault line>"; the quote block and (once
   * diagnosed) the fault line already show that second half elsewhere on
   * the card, so the card TITLE itself only needs everything before that
   * trailing clause. Every other use of job.title (morning modal lists,
   * news, tooltips) stays untouched — this helper is card-title-only.
   * Never touches the engine's actual title string.
   *
   * Cuts at the LAST " — ", not the first: job.title can carry more than
   * one em-dash (e.g. jobs.js prepends "RUSH — " ahead of an already-
   * suffixed "Repair: <machine> — <symptom>", and a diagnosis reveal can
   * append its own " — found: <fault>" afterward). The engine's OWN
   * symptom-carry-over regex (jobs.js: /—\s*(.+)$/) reads the trailing
   * clause the same way, so splitting on the last delimiter is what keeps
   * "RUSH — Repair: <machine>" intact instead of collapsing rush titles
   * down to just "RUSH". */
  function shortTitle(title) {
    var s = String(title || '');
    var i = s.lastIndexOf(' — ');
    return i === -1 ? s : s.slice(0, i);
  }

  /* §22.2 (re-fix) — every card that quotes a blurb/hint wraps it in
   * curly &ldquo;/&rdquo;. Some engine/flavor strings already carry their
   * own quote marks (straight " or curly “”‘’ at both ends), which
   * produced a doubled-up look ("The disk went in…"). Detect an
   * already-quoted string and render it as-is (still esc()'d) instead of
   * adding a second pair. Self-contained: '' in, '' out — every call site
   * just does `blurbHTML(x.blurb)`, no surrounding ternary needed. */
  var QUOTE_CHARS = '"“”‘’\'';
  function looksQuoted(s) {
    if (!s) return false;
    var first = s.charAt(0), last = s.charAt(s.length - 1);
    return QUOTE_CHARS.indexOf(first) !== -1 && QUOTE_CHARS.indexOf(last) !== -1;
  }
  function blurbHTML(text) {
    if (!text) return '';
    var t = String(text);
    var inner = looksQuoted(t) ? esc(t) : ('&ldquo;' + esc(t) + '&rdquo;');
    return '<div class="blurb">' + inner + '</div>';
  }

  function dueText(j, st) {
    if (j.deadlineDay === null || j.deadlineDay === undefined) return { txt: 'No deadline', urgent: false };
    var d = j.deadlineDay - st.day;
    if (d <= 0) return { txt: 'Due TODAY', urgent: true };
    if (d === 1) return { txt: 'Due tomorrow', urgent: true };
    return { txt: 'Due in ' + d + ' days', urgent: false };
  }

  /* §11.4 — requested OS chip on software jobs (field name pending engine;
   * accepts a string or {label|name}). */
  function osChip(j) {
    var req = j.osRequest || j.osRequirement || null;
    if (!req) return '';
    var label = typeof req === 'string' ? req : (req.label || req.name || '');
    if (!label) return '';
    return '<span class="chip chip-os" title="Requested operating system">' + esc(label) + '</span>';
  }

  /* §15.4 — "Regular · 3rd visit" chip on offers from returning customers.
   * Flag is job.regular; the visit count field is feature-detected
   * (regularVisits preferred; visits/visitCount tolerated). */
  function ordinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return n + 'th';
    var d = n % 10;
    return n + (d === 1 ? 'st' : (d === 2 ? 'nd' : (d === 3 ? 'rd' : 'th')));
  }
  function regularChip(j) {
    if (!j || !j.regular) return '';
    var visits = Number(
      j.regularVisits !== undefined ? j.regularVisits :
      (j.visitCount !== undefined ? j.visitCount :
       (j.visits !== undefined ? j.visits : NaN)));
    var txt = 'Regular' + (isFinite(visits) && visits > 0 ? ' · ' + ordinal(Math.round(visits)) + ' visit' : '');
    return '<span class="chip chip-regular" title="A satisfied customer coming back — loyalty pays a +10% premium, but letting a regular down stings extra">↻ ' +
      esc(txt) + '</span>';
  }

  /** Compact human string for a perf object. */
  function perfStr(perf) {
    if (!perf) return '';
    var bits = [];
    if (perf.cpu !== undefined) bits.push('CPU ' + perf.cpu);
    if (perf.gpu !== undefined) bits.push('GPU ' + perf.gpu);
    if (perf.ramMB !== undefined) bits.push(fmtMB(perf.ramMB));            // §19.9 #16
    if (perf.storageGB !== undefined) bits.push(fmtGB(perf.storageGB));    // §19.9 #16
    if (perf.speed !== undefined) bits.push('speed ' + perf.speed);
    if (perf.cool !== undefined) bits.push('cooling ' + perf.cool);
    return bits.join(' · ');
  }

  function statusChip(status) {
    if (!status) return '';
    return '<span class="status-chip s-' + esc(status) + '">' + esc(status) + '</span>';
  }

  function wikiDetailHTML(r) {
    var c30 = Number(r.change30) || 0;
    var h = '';
    if (r.desc) h += '<div class="wiki-desc">' + esc(r.desc) + '</div>';
    if (r.tagLabels && r.tagLabels.length) {
      h += '<div class="wiki-tags">';
      r.tagLabels.forEach(function (tl) { h += '<span class="chip">' + esc(tl) + '</span>'; });
      h += '</div>';
    }
    h += '<div class="wiki-stats">' +
      (r.tier ? '<span>Tier: <b>' + esc(r.tier) + '</b></span>' : '') +
      (r.perf ? '<span>Perf: <b>' + esc(perfStr(r.perf) || '—') + '</b></span>' : '') +
      (r.reliability !== undefined && r.reliability !== null ? '<span>Reliability: <b>' + esc(r.reliability) + '/100</b></span>' : '') +
      (r.watts ? '<span>Output: <b>' + esc(r.watts) + ' W</b></span>'
        : (r.powerDraw !== undefined && r.powerDraw !== null ? '<span>Power draw: <b>' + esc(r.powerDraw) + ' W</b></span>' : '')) +
      '<span>Sold: <b>' + esc((r.introYear || '?') + '–' + (r.eolYear || '?')) + '</b></span>' +
      '<span>Price: <b>' + esc(fm(r.price)) + '</b> <span class="' + (c30 > 0.05 ? 'up' : (c30 < -0.05 ? 'down' : 'muted')) + '">' + esc(UI.pct(c30)) + ' /30d</span></span>' +
      '<span>In stock: <b>' + (r.inStockQty || 0) + '</b></span>' +
      '</div>' +
      '<span class="spark-wrap ' + (c30 >= 0 ? 'up' : 'down') + '">' + UI.sparkSVG(r.spark, 140, 30) + '</span>';
    return h;
  }

  /** §9.7 — ⓘ popover, reusing getPartInfo (also used by Market & pickers). */
  function showPartInfo(partId) {
    if (!has('getPartInfo')) { UI.toast('Part info not available yet', 'info'); return; }
    var r = tryCall(function () { return Engine.getPartInfo(partId); });
    if (!r || r.ok === false) {
      UI.toast((r && r.error) || 'No information on that part', 'error');
      return;
    }
    var html = '<div class="partinfo">' +
      '<div class="pi-head">' +
        '<span class="pi-name">' + esc(r.name) + '</span>' +
        (r.brand ? '<span class="chip">' + esc(r.brand) + '</span>' : '') +
        statusChip(r.status) +
        '<span class="pi-price">' + esc(fm(r.price)) + '</span>' +
      '</div>' +
      wikiDetailHTML(r) +
      '</div>';
    UI.modal({ title: 'Part details', html: html, buttons: [{ label: 'Close', cls: 'btn btn-primary' }] });
  }

  /* §9.9 — progress bars animate: bars carrying data-animw start at their
   * previous render's width and transition to the new one. */
  var prevBarPct = {};
  function animatedBar(key, val, max, cls) {
    var p = (Number(max) > 0) ? Math.max(0, Math.min(100, (Number(val) || 0) / Number(max) * 100)) : 0;
    var from = (prevBarPct[key] !== undefined) ? prevBarPct[key] : p;
    prevBarPct[key] = p;
    return '<span class="bar ' + (cls || '') + '"><i data-animw="' + p.toFixed(1) + '" style="width:' + from.toFixed(1) + '%"></i></span>';
  }
  function runBarAnimations(panel) {
    var els = panel.querySelectorAll('.bar i[data-animw]');
    if (!els.length) return;
    window.requestAnimationFrame(function () {
      for (var i = 0; i < els.length; i++) {
        els[i].style.width = els[i].getAttribute('data-animw') + '%';
      }
    });
  }

  function jobIdOf(el) {
    var v = el.getAttribute('data-job');
    return v === null ? null : parseInt(v, 10);
  }

  /* ------------------------------------------------------------------ *
   * Registries + dispatch — feature modules register their renderer and
   * their own data-action handlers; the DOM contract (selectors, ids,
   * data-action names) is UNCHANGED from the monolith.
   * ------------------------------------------------------------------ */

  var renderers = {};
  var clickActions = {};
  var changeActions = {};
  var changeHooks = [];   // fn(target, e) -> true when handled (id-keyed specials)
  var inputHooks = [];    // fn(target, e) -> true when handled

  T.registerTab = function (id, fn) { renderers[id] = fn; };
  T.registerActions = function (map) {
    Object.keys(map).forEach(function (k) { clickActions[k] = map[k]; });
  };
  T.registerChangeActions = function (map) {
    Object.keys(map).forEach(function (k) { changeActions[k] = map[k]; });
  };
  T.registerChangeHook = function (fn) { changeHooks.push(fn); };
  T.registerInputHook = function (fn) { inputHooks.push(fn); };

  T.render = function (id) {
    var panel = document.getElementById('tab-' + id);
    var fn = renderers[id];
    if (!panel || !fn) return;
    try {
      fn(panel);
      runBarAnimations(panel);
    } catch (e) {
      if (window.console && console.error) console.error(e);
      panel.innerHTML = '<div class="error-box">Could not render this tab: ' + esc(e && e.message) + '</div>';
    }
  };

  T.bind = function () {
    var panels = document.getElementById('tab-panels');
    if (!panels) return;
    panels.addEventListener('click', onPanelClick);
    panels.addEventListener('change', onPanelChange);
    panels.addEventListener('input', onPanelInput);
  };

  function onPanelClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-action]');
    if (!el || el.disabled) return;
    var action = el.getAttribute('data-action');
    var handler = clickActions[action];
    if (handler) handler(el, jobIdOf(el), e);
  }

  function onPanelChange(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    for (var i = 0; i < changeHooks.length; i++) {
      if (changeHooks[i](t, e) === true) return;
    }
    var el = t.closest('[data-action]');
    if (!el) return;
    var handler = changeActions[el.getAttribute('data-action')];
    if (handler) handler(el, jobIdOf(el), e);
  }

  function onPanelInput(e) {
    var t = e.target;
    if (!t) return;
    for (var i = 0; i < inputHooks.length; i++) {
      if (inputHooks[i](t, e) === true) return;
    }
  }

  /* ---- cross-tab click actions owned by the core ---- */
  T.registerActions({
    /* ---- §16.1 sub-tab pills (shared by Workbench/Ledger/Shop/Offers/News) ---- */
    'subtab': function (el) {
      var stGroup = el.getAttribute('data-group');
      var stId = el.getAttribute('data-subtab');
      if (stGroup && stId) {
        var switching = UI.state.subTab[stGroup] !== stId;
        UI.state.subTab[stGroup] = stId;
        T.render(stGroup);   // group names equal tab panel ids
        if (switching && UI.animatePanel) UI.animatePanel(document.getElementById('tab-' + stGroup)); // §19.9 #8
      }
    },
    'scrollto': function (el) { /* §14.5 Shop sub-nav — pure UI, no engine call */
      var jumpId = el.getAttribute('data-target');
      var jumpEl = jumpId && document.getElementById(jumpId);
      if (jumpEl && jumpEl.scrollIntoView) jumpEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    /* ---- Part info popover (§9.7) ---- */
    'partinfo': function (el) {
      var ppid = el.getAttribute('data-part');
      var fromSel = el.getAttribute('data-from-select');
      if (fromSel) {
        var srcSel = document.getElementById(fromSel);
        ppid = srcSel ? srcSel.value : null;
      }
      if (ppid) showPartInfo(ppid);
      else UI.toast('Pick a part first', 'info');
    }
  });

  /* §19.9 #8 — shared "ghost" spawner: a short-lived, pointer-transparent
   * box at a departed element's old screen position, so re-renders stay
   * instant while a CSS exit animation plays where the element was.
   * No-ops under reduced motion. */
  function spawnGhost(rect, className, ttlMs) {
    if (!rect || !(UI.motionOK && UI.motionOK())) return;
    var z = (UI.zoom && UI.zoom.factor) || 1;
    var d = document.createElement('div');
    d.className = className;
    d.style.left = (rect.left / z) + 'px';
    d.style.top = (rect.top / z) + 'px';
    d.style.width = (rect.width / z) + 'px';
    d.style.height = (rect.height / z) + 'px';
    document.body.appendChild(d);
    window.setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, ttlMs || 460);
  }

  /* ---- publish the shared surface ---- */
  S.esc = esc; S.fm = fm; S.tryCall = tryCall; S.arr = arr;
  S.getState = getState; S.emptyBox = emptyBox; S.fmtHours = fmtHours;
  S.CATEGORIES = CATEGORIES; S.CAT_LABELS = CAT_LABELS;
  S.catLabel = catLabel; S.knownCategories = knownCategories;
  S.TYPE_LABELS = TYPE_LABELS; S.SUBTYPE_LABELS = SUBTYPE_LABELS;
  S.prettySubtype = prettySubtype;
  S.SPEED_TIP = SPEED_TIP; S.OVERSPEND_TIP = OVERSPEND_TIP;
  S.has = has; S.engineAtLeast = engineAtLeast; S.otCapValue = otCapValue;
  S.prestigeTierAtLeast = prestigeTierAtLeast;                /* §22.2 #13 */
  S.overspendKind = overspendKind; S.overspendPrefix = overspendPrefix;
  S.overspendChipHTML = overspendChipHTML;
  S.vsOriginalOf = vsOriginalOf; S.vsArrow = vsArrow;
  S.vsOriginalText = vsOriginalText; S.vsOriginalHTML = vsOriginalHTML;
  S.typeChip = typeChip; S.tasteChip = tasteChip;
  S.custTypeLabel = custTypeLabel; S.customerLine = customerLine;
  S.shortTitle = shortTitle;                                  /* §22.2 #1 */
  S.blurbHTML = blurbHTML;                                    /* §22.2 (re-fix) */
  S.dueText = dueText; S.osChip = osChip;
  S.ordinal = ordinal; S.regularChip = regularChip;
  S.perfStr = perfStr; S.statusChip = statusChip;
  S.wikiDetailHTML = wikiDetailHTML; S.showPartInfo = showPartInfo;
  S.animatedBar = animatedBar; S.jobIdOf = jobIdOf;
  S.fmtDay = fmtDay; S.fmtMB = fmtMB; S.fmtGB = fmtGB;   /* §19.9 #2/#16 */
  S.spawnGhost = spawnGhost;                             /* §19.9 #8 */

})();
