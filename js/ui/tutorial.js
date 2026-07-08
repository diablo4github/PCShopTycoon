/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tutorial.js (SPEC §13.5)
 * The guided first-run tutorial + the persistent Help (?) reference modal.
 *
 * Pure UI: reads Engine.getState()/getOffers()/etc. and calls only UI methods
 * (UI.switchTab, UI.modal) — it never calls an Engine mutator itself. Player
 * actions (accept/work/end day) are observed via lightweight click listeners
 * so a step can "advance on the action OR Next" without this file reaching
 * into tabs.js's own handlers.
 *
 * Load order: after js/ui/tabs.js, before js/ui/screens.js (SPEC §13.7).
 * Overlay lives in its own #tutorial-root layer (NOT modal-root): it never
 * traps focus, sits above the header/tabs but below real modals (z-index
 * §CSS), and reflows on resize + every UI.refresh.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tutorial = UI.tutorial || {};

  function esc(s) { return UI.esc(s); }
  function byId(id) { return document.getElementById(id); }
  function q(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }

  var KEY = 'cst-tutorial';

  /* ------------------------------------------------------------------ *
   * Step target helpers — best-effort; a missing element just falls back
   * to the tab panel (or nothing, for steps that spotlight nothing).
   * ------------------------------------------------------------------ */
  function offersTarget() { return q('#tab-offers [data-action="accept"]') || byId('tab-offers'); }
  function firstJobCard() { return q('#tab-workbench .job-card-full'); }
  function workbenchTarget() { return firstJobCard() || byId('tab-workbench'); }
  function needsTarget() { return q('#tab-workbench .needs') || firstJobCard() || byId('tab-workbench'); }
  function workBtnTarget() {
    /* §14.8 — the graduated work controls replaced Work 1h/Work All;
     * "Finish Job" is the closest equivalent to spotlight, then fall back
     * to any of the four, then the card/tab itself. */
    return q('#tab-workbench [data-action="work-job"]') ||
      q('#tab-workbench [data-action="work-hour"]') ||
      q('#tab-workbench [data-action="work-step"]') ||
      q('#tab-workbench [data-action="work-tinker"]') ||
      firstJobCard() || byId('tab-workbench');
  }

  /* ------------------------------------------------------------------ *
   * ~13 steps: mechanics + a little 1983 context, per §13.5's outline.
   * target() returns the element to spotlight, or null to center the
   * callout on screen. advanceOn ties a step to a real player action.
   * ------------------------------------------------------------------ */
  var STEPS = [
    {
      id: 'welcome', tab: null, target: function () { return null; },
      title: 'Welcome to Circuit & Solder',
      body: 'You are opening a home-computer repair shop. In 1983 the home-computer boom — Apple II, ' +
        'Commodore 64, the brand-new IBM PC — put fragile, expensive machines in millions of houses for ' +
        'the first time, and almost nobody nearby knew how to fix one. That gap is your business.'
    },
    {
      id: 'header', tab: null, target: function () { return byId('app-header'); },
      title: 'Your daily dashboard',
      body: 'The header always shows the date, your cash on hand, and the hours left today. Nearly ' +
        'everything you do here — diagnosing, working a job, buying parts — spends hours. Run out, and ' +
        'the day ends whether you are ready or not.'
    },
    {
      id: 'tabs', tab: null, target: function () { return byId('tab-bar'); },
      title: 'Getting around the shop',
      body: 'Offers for new jobs, Workbench for active repairs, Inventory and the Parts Market for stock, ' +
        'the Wiki for hardware history, Shop for upgrades and staff, Ledger for the books, and News for ' +
        'what is happening in the wider world.'
    },
    {
      id: 'offers', tab: 'offers', target: offersTarget,
      title: 'Job offers',
      body: 'Customers bring in machines that need repairs, upgrades, or — later on — full custom builds. ' +
        'In these early years almost all your income is honest repair labor. Accept an offer to send it to ' +
        'your Workbench, or click Next if none have come in yet.',
      advanceOn: 'accept'
    },
    {
      id: 'workbench', tab: 'workbench', target: workbenchTarget,
      title: 'The Workbench',
      body: 'Every accepted job gets a step-by-step checklist — open the case, diagnose, swap the part, ' +
        'reassemble. Nothing is hidden: you always know exactly what is left to do and how many hours it costs.'
    },
    {
      id: 'diagnose', tab: 'workbench', target: workbenchTarget,
      title: 'Diagnosis',
      body: 'Most repairs start as a mystery. Working through the first steps on the checklist diagnoses ' +
        'the fault and reveals whether it needs a part — real bench technicians called this "troubleshooting," ' +
        'and it was most of the job.'
    },
    {
      id: 'parts', tab: 'workbench', target: needsTarget,
      title: 'Sourcing a part',
      body: 'Once a fault needs a part, pick one right on the job card — parts already on your shelves, or ' +
        'bought fresh from the market, cheapest compatible option first. Assigning a part reserves it; it is ' +
        'actually installed when you work that step.'
    },
    {
      id: 'finish', tab: 'workbench', target: workBtnTarget,
      title: 'Doing the work',
      body: 'Spend hours with Tinker, Finish Step, Work 1 Hour, or Finish Job — pick whatever chunk of time ' +
        'fits. Standard pace is the safe default — Quick trades hours for a much higher chance the customer ' +
        'calls back unhappy later; Meticulous costs more time but polishes your reputation.',
      advanceOn: 'work'
    },
    {
      id: 'market', tab: 'market', target: function () { return byId('tab-market'); },
      title: 'The Parts Market',
      body: 'Prices drift every night with supply, demand, and history. Something fresh off the line costs ' +
        'a premium; the same part years after its heyday can turn scarce and climb in price again as a ' +
        'sought-after legacy part.'
    },
    {
      id: 'wiki', tab: 'wiki', target: function () { return byId('tab-wiki'); },
      title: 'The Wiki — your history book',
      body: 'Every part you can buy, sell, or install is documented here with real specs and period ' +
        'commentary — plus a Chronicle of real computing history and long-form Articles that unlock as the ' +
        'years pass. It is a running museum of the PC industry; browse it whenever you are curious.'
    },
    {
      id: 'reputation', tab: null, target: function () { return byId('hdr-rating'); },
      title: 'Reputation & prestige',
      body: 'Customers rate every finished job. Keep the average up and your shop’s prestige climbs, ' +
        'unlocking bigger jobs and more foot traffic — and eventually the cash for a bigger shop with room ' +
        'for staff and training.'
    },
    {
      id: 'endday', tab: null, target: function () { return byId('btn-endday'); },
      title: 'Closing up shop',
      body: 'When you are done for now, click End Day. Overnight, prices drift, offers refresh, and news ' +
        'comes in — you will get a morning summary before the next day starts. Go ahead and click it, or ' +
        'press Next to move on.',
      advanceOn: 'endday'
    },
    {
      id: 'done', tab: null, target: function () { return null; },
      title: 'You are on your own now',
      body: 'That is the core loop: offers, workbench, market, and the clock. Staff, certifications, custom ' +
        'builds, and the as-is market are all waiting to be discovered as your shop grows. Click the ? in ' +
        'the header any time you want a refresher.'
    }
  ];

  /* ------------------------------------------------------------------ *
   * Persistence — localStorage["cst-tutorial"]: unset = never run (the
   * New Game toggle defaults ON); any value = completed or skipped once
   * (toggle defaults OFF, but the player can always re-check it, and
   * Replay tutorial in the Help modal always works regardless).
   * ------------------------------------------------------------------ */
  T.defaultOn = function () {
    try { return typeof localStorage === 'undefined' || !localStorage.getItem(KEY); }
    catch (e) { return true; }
  };

  function persist(val) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, val); }
    catch (e) { /* storage unavailable — tour just won't remember across reloads */ }
  }

  /* ------------------------------------------------------------------ *
   * Runtime state
   * ------------------------------------------------------------------ */
  var state = { active: false, index: 0, resizeTimer: null };

  function root() { return byId('tutorial-root'); }
  function currentStep() { return STEPS[state.index]; }

  T.isActive = function () { return state.active; };

  T.start = function () {
    if (!root()) return; // overlay layer missing — nothing to show
    state.active = true;
    state.index = 0;
    window.addEventListener('resize', onResize);
    renderStep();
  };

  T.skip = function () {
    if (!state.active) return;
    finish('skipped');
  };

  T.complete = function () {
    if (!state.active) return;
    finish('completed');
  };

  function finish(reason) {
    state.active = false;
    persist(reason);
    var r = root();
    if (r) r.innerHTML = '';
    window.removeEventListener('resize', onResize);
    if (state.resizeTimer) { window.clearTimeout(state.resizeTimer); state.resizeTimer = null; }
  }

  T.next = function () {
    if (!state.active) return;
    if (state.index >= STEPS.length - 1) { T.complete(); return; }
    state.index++;
    renderStep();
  };

  T.back = function () {
    if (!state.active || state.index <= 0) return;
    state.index--;
    renderStep();
  };

  function renderStep() {
    if (!state.active) return;
    var st = currentStep();
    if (!st) { T.complete(); return; }
    if (st.tab && UI.state.activeTab !== st.tab) UI.switchTab(st.tab);
    paint();
  }

  /** Reposition against the current DOM (called after tab switches, on
   * resize, and from UI.refresh so the spotlight tracks re-renders). */
  function paint() {
    if (!state.active) return;
    window.requestAnimationFrame(function () {
      if (!state.active) return;
      var st = currentStep();
      if (!st) return;
      var target = null;
      try { target = st.target ? st.target() : null; } catch (e) { target = null; }
      renderOverlay(st, target);
    });
  }

  T.onRefresh = function () { if (state.active) paint(); };

  function onResize() {
    if (!state.active) return;
    if (state.resizeTimer) window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(paint, 120);
  }

  /** Same zoom-compensation convention as UI.floatDelta — #tutorial-root is
   * a body child, so under the transform-scale zoom fallback its own
   * offsets get re-multiplied by the ancestor transform; pre-dividing by
   * the zoom factor keeps math identical under native CSS zoom too. */
  function zoomRect(el) {
    var r = el.getBoundingClientRect();
    var z = (UI.zoom && UI.zoom.factor) || 1;
    return { left: r.left / z, top: r.top / z, width: r.width / z, height: r.height / z };
  }

  function renderOverlay(st, target) {
    var r = root();
    if (!r) return;
    var pad = 8;
    var z = (UI.zoom && UI.zoom.factor) || 1;
    var vwZ = (window.innerWidth || 1024) / z;
    var vhZ = (window.innerHeight || 768) / z;

    var rect = (target && target.getBoundingClientRect) ? zoomRect(target) : null;
    var layer;
    if (rect) {
      var hl = Math.max(0, rect.left - pad), ht = Math.max(0, rect.top - pad);
      var hw = rect.width + pad * 2, hh = rect.height + pad * 2;
      layer = '<div class="tut-hole" style="left:' + hl.toFixed(1) + 'px;top:' + ht.toFixed(1) +
        'px;width:' + hw.toFixed(1) + 'px;height:' + hh.toFixed(1) + 'px;"></div>';
    } else {
      layer = '<div class="tut-scrim"></div>';
    }

    var idx = state.index, n = STEPS.length;
    var calloutCls = 'tut-callout';
    var calloutStyle;
    var calloutW = 320;
    if (rect) {
      var left = Math.min(Math.max(8, rect.left), Math.max(8, vwZ - calloutW - 8));
      var top = rect.top + rect.height + 14;
      var placeAbove = (top + 190) > vhZ;
      calloutStyle = 'left:' + left.toFixed(1) + 'px;' +
        (placeAbove
          ? ('top:' + Math.max(8, rect.top - 190).toFixed(1) + 'px;')
          : ('top:' + Math.min(top, vhZ - 190).toFixed(1) + 'px;'));
    } else {
      calloutCls += ' tut-center';
      calloutStyle = '';
    }

    var html = layer +
      '<div class="' + calloutCls + '" style="' + calloutStyle + '" role="dialog" aria-label="Guided tour, step ' + (idx + 1) + ' of ' + n + '">' +
        '<div class="tut-progress">Step ' + (idx + 1) + ' of ' + n + '</div>' +
        '<h3 class="tut-title">' + esc(st.title) + '</h3>' +
        '<p class="tut-body">' + esc(st.body) + '</p>' +
        '<div class="tut-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-tut="skip">Skip tour</button>' +
          '<span class="tut-spacer"></span>' +
          (idx > 0 ? '<button type="button" class="btn btn-sm" data-tut="back">Back</button>' : '') +
          '<button type="button" class="btn btn-primary btn-sm" data-tut="next">' + (idx === n - 1 ? 'Done' : 'Next') + '</button>' +
        '</div>' +
      '</div>';

    r.innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   * A step's advanceOn action fires: give the triggering click's own
   * handler (accept/work/end-day) a moment to run, then move on.
   * ------------------------------------------------------------------ */
  function onAction(name) {
    if (!state.active) return;
    var st = currentStep();
    if (st && st.advanceOn === name) window.setTimeout(T.next, 60);
  }

  /* ------------------------------------------------------------------ *
   * Bindings — called once from UI.init, after tabs.js's own listeners.
   * ------------------------------------------------------------------ */
  T.bind = function () {
    var r = root();
    if (r) {
      r.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var b = t.closest('[data-tut]');
        if (!b) return;
        var act = b.getAttribute('data-tut');
        if (act === 'next') T.next();
        else if (act === 'back') T.back();
        else if (act === 'skip') T.skip();
      });
    }

    var panels = byId('tab-panels');
    if (panels) {
      panels.addEventListener('click', function (e) {
        if (!state.active) return;
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('[data-action="accept"]')) onAction('accept');
        else if (t.closest('[data-action="work-tinker"], [data-action="work-step"], [data-action="work-hour"], [data-action="work-job"]')) onAction('work');
      });
    }

    var endBtn = byId('btn-endday');
    if (endBtn) endBtn.addEventListener('click', function () { onAction('endday'); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.active) T.skip();
    });
  };

  /* ------------------------------------------------------------------ *
   * Persistent Help (?) reference modal — any time, not just first run.
   * ------------------------------------------------------------------ */
  T.openHelp = function () {
    var html = '<div class="help-guide">' +
      '<h3>The day loop</h3>' +
      '<p>Each day starts with hours to spend and ends when you click <b>End Day</b>. Diagnosing, working ' +
      'jobs, and your first parts purchase of the day (a "supply run") all cost hours. Overnight, prices ' +
      'drift, offers refresh, and news comes in — a morning summary tells you what happened.</p>' +
      '<h3>Tabs</h3>' +
      '<ul>' +
        '<li><b>Offers</b> — new jobs walk in the door; Accept or Decline.</li>' +
        '<li><b>Workbench</b> — your active jobs and their step checklists, plus the As-Is Market for machines to flip.</li>' +
        '<li><b>Inventory</b> / <b>Parts Market</b> — what you own, and what you can buy or sell.</li>' +
        '<li><b>Wiki</b> — every part, the Chronicle of real computing history, and long-form Articles that unlock as the years pass.</li>' +
        '<li><b>Shop</b> — upgrades, insurance, staff, and Training &amp; Certifications.</li>' +
        '<li><b>Ledger</b>, <b>News</b>, <b>System</b> — the books, the headlines, and saving.</li>' +
      '</ul>' +
      '<h3>Work speed &amp; callbacks</h3>' +
      '<p>Quick finishes faster but risks a warranty callback — an unhappy customer returning later for a ' +
      'free fix, with a rating hit. Standard is the safe default. Meticulous costs more hours but lowers ' +
      'the risk and helps your rating.</p>' +
      '<h3>Staff &amp; certifications</h3>' +
      '<p>Once your shop outgrows the garage, hire staff to speed up specific job types. You — the owner — ' +
      'can also study certifications in the Shop tab, real trade certs of the era, for faster work, better ' +
      'pay, or new capabilities.</p>' +
      '<h3>Saving</h3>' +
      '<p>The game autosaves every night. Use the System tab to export a copy, or import a save from a file ' +
      'or pasted text.</p>' +
    '</div>';
    UI.modal({
      title: 'Help & How to Play',
      html: html,
      buttons: [
        { label: 'Replay tutorial', cls: 'btn', onClick: function () { T.start(); } },
        { label: 'Close', cls: 'btn btn-primary' }
      ]
    });
  };

})();
