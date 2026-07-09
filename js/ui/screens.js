/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/screens.js
 * New Game screen (era cards + §15.2 scenario cards + §15.6 difficulty),
 * Morning Summary modal, Game Over screen, §15.2 scenario-complete screen.
 *
 * Per SPEC requirement, the new-game screen is the ONLY place the UI reads
 * DATA directly (DATA.ERAS + DATA.SCENARIOS + DATA.FLAVOR name suggestions);
 * everything else renders through Engine view APIs. All §15 engine calls
 * are feature-detected — the engine agent builds concurrently.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var S = UI.screens = UI.screens || {};

  function esc(s) { return UI.esc(s); }
  function fm(x) { return UI.fm(x); }

  var DEFAULT_NAME = 'Circuit & Solder';

  /* ------------------------------------------------------------------ *
   * One-time delegated bindings (called from UI.init)
   * ------------------------------------------------------------------ */

  S.bind = function () {
    var ng = document.getElementById('screen-newgame');
    if (ng) {
      ng.addEventListener('click', onNewGameClick);
      ng.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'ng-shopname') UI.state.shopName = e.target.value;
      });
      ng.addEventListener('change', function (e) { /* §13.5 tutorial toggle */
        if (e.target && e.target.id === 'ng-tutorial') UI.state.tutorialToggle = !!e.target.checked;
      });
      ng.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target && e.target.id === 'ng-shopname') startGame();
      });
    }
    var go = document.getElementById('screen-gameover');
    if (go) {
      go.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('[data-action="new-game"]')) {
          S.renderNewGame();
          UI.showScreen('newgame');
        }
      });
    }

    /* §15.2 — scenario completion screen: New Game or Continue as sandbox. */
    var sce = document.getElementById('screen-scenario');
    if (sce) {
      sce.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('[data-action="new-game"]')) {
          S.renderNewGame();
          UI.showScreen('newgame');
        } else if (t.closest('[data-action="continue-sandbox"]')) {
          if (!(window.Engine && typeof Engine.continueSandbox === 'function')) {
            UI.toast('Sandbox continuation is not available yet', 'info');
            return;
          }
          var r = UI.tryCall(function () { return Engine.continueSandbox(); });
          if (!r || r.ok === false) {
            UI.toast((r && r.error) || 'Could not continue as a sandbox game', 'error');
            return;
          }
          UI.toast('Scenario complete — the shop stays open, sandbox rules from here on.', 'success', 5000);
          UI.state.activeTab = 'offers';
          UI.showScreen('main');
          UI.switchTab('offers');
          UI.refresh();
        }
      });
    }
  };

  function onNewGameClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'pick-era') {
      UI.state.selectedEra = el.getAttribute('data-era');
      UI.state.selectedScenario = null;          // §15.2 mutually exclusive
      S.renderNewGame();
    } else if (action === 'pick-scenario') {     // §15.2
      UI.state.selectedScenario = el.getAttribute('data-scenario');
      S.renderNewGame();
    } else if (action === 'pick-difficulty') {   // §15.6
      var d = el.getAttribute('data-difficulty');
      if (d === 'relaxed' || d === 'standard' || d === 'survival') UI.state.difficulty = d;
      S.renderNewGame();
    } else if (action === 'suggest') {
      UI.state.shopName = el.getAttribute('data-name') || '';
      var inp = document.getElementById('ng-shopname');
      if (inp) { inp.value = UI.state.shopName; inp.focus(); }
    } else if (action === 'start') {
      startGame();
    } else if (action === 'continue') {
      continueGame();
    }
  }

  /* ------------------------------------------------------------------ *
   * New Game screen
   * ------------------------------------------------------------------ */

  S.renderNewGame = function () {
    var el = document.getElementById('screen-newgame');
    if (!el) return;

    var ready = UI.engineReady();
    var eras = (window.DATA && Array.isArray(DATA.ERAS)) ? DATA.ERAS : [];
    if (!UI.state.selectedEra && eras.length) UI.state.selectedEra = eras[0].id;

    var suggestions = [];
    try {
      if (window.DATA && DATA.FLAVOR && Array.isArray(DATA.FLAVOR.shopNameSuggestions)) {
        suggestions = DATA.FLAVOR.shopNameSuggestions.slice(0, 8);
      }
    } catch (e) { /* ignore */ }

    var hasAuto = false;
    try { hasAuto = !!(ready && Engine.hasAutosave && Engine.hasAutosave()); } catch (e2) { /* ignore */ }

    /* §13.5 — tutorial toggle default: ON on a browser that has never
     * finished/skipped the tour, OFF afterward. The player's explicit choice
     * this session (once made) sticks until they reload. */
    if (UI.state.tutorialToggle === undefined || UI.state.tutorialToggle === null) {
      UI.state.tutorialToggle = (UI.tutorial && UI.tutorial.defaultOn) ? UI.tutorial.defaultOn() : true;
    }

    var h = '<div class="ng-wrap">' +
      '<header class="ng-head">' +
        '<h1>Circuit &amp; Solder</h1>' +
        '<p class="ng-tag">PC Shop Tycoon — fix, build and flip computers across four decades of hardware history.</p>' +
      '</header>';

    if (!ready || !eras.length) {
      h += '<div class="error-box">Game scripts are incomplete: ' +
        (!ready ? 'the engine (js/engine/*) is not loaded' : '') +
        ((!ready && !eras.length) ? ' and ' : '') +
        (!eras.length ? 'era data (js/data/eras.js) is not loaded' : '') +
        '. Integration pending — the UI is ready and waiting.</div>';
    }

    if (hasAuto) {
      h += '<div class="ng-continue">' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="continue">Continue (autosave)</button>' +
        '<div class="muted small">Pick up where you left off.</div>' +
      '</div>';
    }

    /* era cards (deselected while a scenario is picked — §15.2) */
    var scenarioPicked = !!UI.state.selectedScenario;
    if (eras.length) {
      h += '<h2 class="section-title">Choose your starting era</h2><div class="era-grid">';
      eras.forEach(function (era) {
        var sel = !scenarioPicked && UI.state.selectedEra === era.id;
        h += '<button type="button" class="era-card' + (sel ? ' selected' : '') + '" data-action="pick-era" data-era="' + esc(era.id) + '">' +
          '<h3>' + esc(era.name) + '</h3>' +
          (era.blurb ? '<div class="era-blurb">' + esc(era.blurb) + '</div>' : '') +
          '<div class="era-facts">' +
            '<span>Starting cash <b>' + esc(fm(era.cash)) + '</b></span>' +
            (era.difficulty ? '<span>Difficulty: <b>' + esc(era.difficulty) + '</b></span>' : '') +
          '</div>' +
          (era.customBuildsUnlocked === false
            ? '<div class="era-callout">Custom building locked until September 1989 — repairs pay the bills first.</div>'
            : '') +
          '</button>';
      });
      h += '</div>';
    }

    /* §15.2 — scenario cards (curated, scored challenges) */
    var scenarios = (window.DATA && Array.isArray(DATA.SCENARIOS)) ? DATA.SCENARIOS : [];
    if (scenarios.length) {
      h += '<h2 class="section-title">Scenarios <span class="muted small">— curated, scored challenges with a fixed clock</span></h2>' +
        '<div class="era-grid scenario-grid">';
      scenarios.forEach(function (sc) {
        if (!sc || !sc.id) return;
        var sel = UI.state.selectedScenario === sc.id;
        h += '<button type="button" class="era-card scenario-card' + (sel ? ' selected' : '') +
          '" data-action="pick-scenario" data-scenario="' + esc(sc.id) + '">' +
          '<h3>' + esc(sc.name || sc.id) + ' <span class="badge b-scenario">SCENARIO</span></h3>' +
          '<div class="scenario-dates">' + esc(fmtDateRange(sc.startDate, sc.endDate)) + '</div>' +
          (sc.blurb ? '<div class="era-blurb">' + esc(sc.blurb) + '</div>' : '') +
          '<div class="era-facts">' +
            (sc.cash !== undefined && sc.cash !== null ? '<span>Starting cash <b>' + esc(fm(sc.cash)) + '</b></span>' : '') +
          '</div>' +
          (sc.difficultyNote ? '<div class="era-callout">' + esc(sc.difficultyNote) + '</div>' : '') +
          '</button>';
      });
      h += '</div>';
      if (!(ready && window.Engine && typeof Engine.getScenarioResult === 'function')) {
        h += '<p class="muted small">Scenario support is still being wired up — sandbox eras are fully playable now.</p>';
      }
    }

    /* shop name + start */
    h += '<div class="ng-form">' +
      '<div class="field"><label for="ng-shopname">Name your shop</label>' +
        '<input type="text" id="ng-shopname" maxlength="40" placeholder="' + esc(DEFAULT_NAME) + '" value="' + esc(UI.state.shopName) + '" autocomplete="off">' +
      '</div>';
    if (suggestions.length) {
      h += '<div class="suggests">';
      suggestions.forEach(function (name) {
        h += '<button type="button" class="suggest-chip" data-action="suggest" data-name="' + esc(name) + '">' + esc(name) + '</button>';
      });
      h += '</div>';
    }
    /* §15.6 — difficulty (sandbox eras only; scenarios fix their own). */
    if (!scenarioPicked) {
      h += '<div class="ng-difficulty"><h3 class="sub-title">Difficulty</h3><div class="diff-row">' +
        diffCard('relaxed', 'Relaxed',
          'More starting cash (+30%), cheaper rent, better pay, 21 days of grace, gentler events.') +
        diffCard('standard', 'Standard',
          'The balanced baseline the shop was tuned around. 14 days of grace.') +
        diffCard('survival', 'Survival',
          'Less cash (−20%), pricier rent, thinner pay, only 10 days of grace, harsher events.') +
        '</div></div>';
    } else {
      h += '<div class="ng-difficulty"><p class="muted small">Scenarios set their own difficulty — see the card\'s note.</p></div>';
    }

    /* §13.5 — guided tour toggle (default ON the first time this browser
     * ever plays; OFF once a tour has been completed or skipped). */
    h += '<div class="ng-tutorial-toggle">' +
      '<label for="ng-tutorial"><input type="checkbox" id="ng-tutorial"' + (UI.state.tutorialToggle ? ' checked' : '') + '> Guided tour</label>' +
      '<p class="muted small">New to the shop? Keep the guided tour on — it walks through the basics on your first day.</p>' +
    '</div>';
    h += '<div class="ng-start">' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="start"' + (ready && eras.length ? '' : ' disabled') + '>Open for Business</button>' +
      '</div>' +
    '</div>';

    el.innerHTML = h + '</div>';
  };

  /** §15.6 — one selectable difficulty card. */
  function diffCard(id, label, blurb) {
    var sel = (UI.state.difficulty || 'standard') === id;
    return '<button type="button" class="diff-card' + (sel ? ' selected' : '') +
      '" data-action="pick-difficulty" data-difficulty="' + esc(id) + '">' +
      '<b>' + esc(label) + '</b><span class="muted small">' + esc(blurb) + '</span></button>';
  }

  /** §15.2 — "Jun 1998 – Mar 2000" from two ISO dates (best effort). */
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtIsoMonth(iso) {
    var m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var mi = parseInt(m[2], 10) - 1;
    return (MONTHS_SHORT[mi] || m[2]) + ' ' + m[1];
  }
  function fmtDateRange(a, b) {
    if (!a && !b) return '';
    return fmtIsoMonth(a) + ' – ' + fmtIsoMonth(b);
  }

  function defaultShopName() {
    try {
      if (window.DATA && DATA.FLAVOR && Array.isArray(DATA.FLAVOR.shopNameSuggestions) && DATA.FLAVOR.shopNameSuggestions.length) {
        return DATA.FLAVOR.shopNameSuggestions[0];
      }
    } catch (e) { /* ignore */ }
    return DEFAULT_NAME;
  }

  function startGame() {
    if (!UI.engineReady()) { UI.toast('Engine not loaded yet', 'error'); return; }
    var name = (UI.state.shopName || '').replace(/^\s+|\s+$/g, '') || defaultShopName();
    var scenarioId = UI.state.selectedScenario;

    var r;
    if (scenarioId) {
      /* §15.2 — scenario start. Feature-gate on getScenarioResult: if the
       * engine's scenario path has not landed, keep the sandbox playable
       * instead of sending newGame an option it cannot honor. */
      if (typeof Engine.getScenarioResult !== 'function') {
        UI.toast('Scenario support is still being wired up — pick an era for now', 'info', 5000);
        return;
      }
      r = UI.tryCall(function () { return Engine.newGame({ scenarioId: scenarioId, shopName: name }); });
    } else {
      var eraId = UI.state.selectedEra;
      if (!eraId) { UI.toast('Pick a starting era first', 'info'); return; }
      /* §15.6 — difficulty rides along; pre-v0.6 engines ignore it. */
      r = UI.tryCall(function () {
        return Engine.newGame({ eraId: eraId, shopName: name, difficulty: UI.state.difficulty || 'standard' });
      });
    }
    if (!r || r.ok === false) {
      UI.toast((r && r.error) || 'Could not start a new game', 'error');
      return;
    }
    UI.state.activeTab = 'offers';
    UI.showScreen('main');
    UI.switchTab('offers');
    UI.refresh();
    /* §13.5 — start the guided tour instead of the plain welcome toast when
     * the tour toggle is on (its own first step already says welcome). */
    if (UI.state.tutorialToggle && UI.tutorial && UI.tutorial.start) {
      UI.tutorial.start();
    } else {
      UI.toast('Welcome to ' + name + ' — doors are open. Check your offers.', 'success', 5000);
    }
  }

  function continueGame() {
    if (!UI.engineReady()) { UI.toast('Engine not loaded yet', 'error'); return; }
    var r = UI.tryCall(function () { return Engine.loadAutosave(); });
    if (!r || r.ok === false) {
      UI.toast((r && r.error) || 'Could not load the autosave', 'error');
      return;
    }
    UI.state.activeTab = 'offers';
    UI.showScreen('main');
    UI.switchTab('offers');
    UI.refresh(); // swaps to game-over screen instead if that save had ended
    UI.toast('Autosave loaded', 'success');
  }

  /* ------------------------------------------------------------------ *
   * Morning Summary modal (rendered from Engine.endDay()'s summary)
   * Sections are omitted when empty, per SPEC §4/§6.
   * ------------------------------------------------------------------ */

  S.showMorningSummary = function (summary) {
    if (!summary) return;
    var h = '';

    if (summary.skippedSunday) {
      h += '<div class="sum-note">Sunday — shop closed. Two nights passed while you rested.</div>';
    }
    /* §9.4 — overtime note (engine may send a string or hours number under
     * either key; rendered only when present). */
    var ot = summary.overtimeNote !== undefined ? summary.overtimeNote : summary.overtime;
    if (ot) {
      h += '<div class="sum-note">' + esc(typeof ot === 'number'
        ? 'Overtime worked last night: ' + ot + 'h — today starts short.'
        : ot) + '</div>';
    }
    if (summary.graceWarning) {
      h += '<div class="sum-grace">' + esc(summary.graceWarning) + '</div>';
    }

    h += listSection('New offers', summary.newOffers);
    h += listSection('Offers expired', summary.expired);
    h += listSection('Warranty callbacks', summary.callbacks);

    if (summary.priceMovers && summary.priceMovers.length) {
      h += '<div class="sum-sec"><h3>Price movers</h3><ul class="movers">';
      summary.priceMovers.forEach(function (m) {
        var up = (Number(m.pct) || 0) >= 0;
        h += '<li><span class="' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' +
          esc(UI.pct(m.pct)) + '</span> ' + esc(m.name) + '</li>';
      });
      h += '</ul></div>';
    }

    if (summary.news && summary.news.length) {
      h += '<div class="sum-sec"><h3>Overnight news</h3>';
      summary.news.forEach(function (n) {
        h += '<div class="sum-news"><strong>' + esc(n.headline) + '</strong>' +
          (n.body ? '<div class="muted small">' + esc(n.body) + '</div>' : '') + '</div>';
      });
      h += '</div>';
    }

    h += moneySection('Charges', summary.charges);
    h += moneySection('Payouts', summary.payouts);

    /* §15.5 — overnight achievement unlocks (strings or {name} objects). */
    var achItems = [];
    (Array.isArray(summary.achievements) ? summary.achievements : []).forEach(function (a) {
      var label = (typeof a === 'string') ? a : (a && (a.name || a.label || a.id)) || '';
      if (label) achItems.push('🏆 ' + label);
    });
    h += listSection('Achievements unlocked', achItems);

    if (summary.gameOver) {
      h += '<div class="sum-grace">The shop could not recover. This is the end of the road.</div>';
    }

    if (!h) h = '<p class="muted">A quiet night. Nothing to report — get to work.</p>';

    UI.modal({
      title: summary.dateStr || 'Morning',
      html: '<div class="morning">' + h + '</div>',
      buttons: [{ label: summary.gameOver ? 'Continue' : 'Start the day', cls: 'btn btn-primary' }],
      onClose: function () {
        var over = false;
        try {
          var st = Engine.getState();
          over = !!(st && st.flags && st.flags.gameOver);
        } catch (e) { /* ignore */ }
        if (over) UI.refresh();           // ensures the Game Over screen is shown
        else UI.switchTab('offers');      // per SPEC: dismiss -> Offers tab
      }
    });
  };

  function listSection(title, items) {
    if (!items || !items.length) return '';
    var h = '<div class="sum-sec"><h3>' + esc(title) + ' (' + items.length + ')</h3><ul>';
    items.forEach(function (t) { h += '<li>' + esc(t) + '</li>'; });
    return h + '</ul></div>';
  }

  function moneySection(title, rows) {
    if (!rows || !rows.length) return '';
    var h = '<div class="sum-sec"><h3>' + esc(title) + '</h3><table class="money-rows">';
    rows.forEach(function (r) {
      var amt = Number(r.amount) || 0;
      h += '<tr><td>' + esc(r.label) + '</td>' +
        '<td class="num ' + (amt < 0 ? 'down' : 'up') + '">' + esc(fm(amt)) + '</td></tr>';
    });
    return h + '</table></div>';
  }

  /* ------------------------------------------------------------------ *
   * Game Over screen
   * ------------------------------------------------------------------ */

  S.renderGameOver = function () {
    var el = document.getElementById('screen-gameover');
    if (!el) return;

    var s = UI.tryCall(function () { return Engine.getGameOverStats(); });
    if (!s || s.ok === false) {
      el.innerHTML = '<div class="go-wrap"><div class="go-card"><h1>Game Over</h1>' +
        '<div class="go-actions"><button type="button" class="btn btn-primary btn-lg" data-action="new-game">New Game</button></div>' +
        '</div></div>';
      return;
    }

    /* §15.6 — show the run's difficulty when the save carries one. */
    var goDiff = '';
    try {
      var goSt = Engine.getState();
      goDiff = UI.difficultyLabel(goSt && goSt.difficulty);
    } catch (eD) { /* ignore */ }

    var lt = s.lifetime || {};
    el.innerHTML = '<div class="go-wrap"><div class="go-card">' +
      '<h1>Game Over</h1>' +
      (s.reason ? '<p class="go-reason">' + esc(s.reason) + '</p>' : '') +
      '<div class="go-meta">' +
        (s.dateStr ? '<span class="muted">' + esc(s.dateStr) + '</span> &nbsp; ' : '') +
        UI.starsHTML(s.rating) +
        (s.prestigeLabel ? ' <span class="chip">' + esc(s.prestigeLabel) + '</span>' : '') +
        (goDiff ? ' <span class="chip" title="Difficulty this run was played on">' + esc(goDiff) + '</span>' : '') +
      '</div>' +
      '<div class="kv">' +
        goCell('Days played', s.daysPlayed !== undefined ? s.daysPlayed : (lt.daysPlayed || 0)) +
        goCell('Jobs completed', lt.jobsCompleted || 0) +
        goCell('Jobs failed', lt.jobsFailed || 0) +
        goCell('Builds delivered', lt.buildsDelivered || 0) +
        goCell('Refurbs sold', lt.refurbsSold || 0) +
        goCell('Lifetime revenue', fm(lt.revenue)) +
        goCell('Parts spent', fm(lt.partsCost)) +
        goCell('Fixed costs', fm(lt.fixedCosts)) +
        goCell('Other', fm(lt.other)) +
      '</div>' +
      '<div class="go-actions"><button type="button" class="btn btn-primary btn-lg" data-action="new-game">New Game</button></div>' +
      '</div></div>';
  };

  function goCell(k, v) {
    return '<div class="cell"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>';
  }

  /* ------------------------------------------------------------------ *
   * §15.2 — Scenario completion screen
   * ------------------------------------------------------------------ */

  /**
   * Returns the Engine.getScenarioResult() payload when the current run's
   * scenario has finished (and the engine can prove it), else null.
   * Called from UI.refresh — bankruptcy (gameOver) is checked before this,
   * so "bankrupt before the end = normal game over" holds. Tolerant of the
   * exact ended-flag shape the engine ships: active:false / ended / done,
   * or the day moving strictly past endDay. continueSandbox() clears
   * scenario state, which makes this return null again.
   */
  S.scenarioEndResult = function (st) {
    if (!st || !st.scenario) return null;
    if (!(window.Engine && typeof Engine.getScenarioResult === 'function')) return null;
    var sc = st.scenario;
    if (sc.sandbox === true || sc.continued === true) return null; // continued as sandbox
    var ended = sc.active === false || sc.ended === true || sc.done === true ||
      (sc.endDay !== null && sc.endDay !== undefined && (Number(st.day) || 0) > Number(sc.endDay));
    if (!ended) return null;
    var r = UI.tryCall(function () { return Engine.getScenarioResult(); });
    if (!r || r.ok === false) return null;
    if (r.grade === undefined && r.score === undefined) return null;
    return r;
  };

  S.renderScenarioEnd = function (res, st) {
    var el = document.getElementById('screen-scenario');
    if (!el || !res) return;

    var grade = String(res.grade || '—').toUpperCase();
    var gradeCls = /^[SABCD]$/.test(grade) ? grade.toLowerCase() : 'none';
    var name = res.name || UI.scenarioName(st && st.scenario) || 'Scenario';
    var diff = UI.difficultyLabel(st && st.difficulty);
    var canSandbox = !!(window.Engine && typeof Engine.continueSandbox === 'function');

    var lines = Array.isArray(res.lines) ? res.lines : [];
    var linesHTML = '';
    if (lines.length) {
      linesHTML = '<table class="score-lines">';
      lines.forEach(function (l) {
        if (!l) return;
        linesHTML += '<tr><td>' + esc(l.label || '') + '</td>' +
          '<td class="num">' + esc(l.value !== undefined && l.value !== null ? l.value : '') + '</td>' +
          '<td class="num pts">' + (l.points !== undefined && l.points !== null
            ? (Number(l.points) >= 0 ? '+' : '') + esc(l.points) + ' pts' : '') + '</td></tr>';
      });
      linesHTML += '</table>';
    } else {
      linesHTML = '<p class="muted small">No score breakdown available.</p>';
    }

    el.innerHTML = '<div class="go-wrap"><div class="go-card scenario-end">' +
      '<div class="sc-grade grade-' + gradeCls + '" aria-label="Grade ' + esc(grade) + '">' + esc(grade) + '</div>' +
      '<h1>' + esc(name) + ' — complete</h1>' +
      '<div class="go-meta">' +
        '<span class="sc-score">Score: <b class="num">' + esc(res.score !== undefined && res.score !== null ? res.score : '—') + '</b></span>' +
        (diff ? ' <span class="chip" title="Difficulty this run was played on">' + esc(diff) + '</span>' : '') +
      '</div>' +
      linesHTML +
      '<div class="go-actions">' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="new-game">New Game</button>' +
        (canSandbox
          ? ' <button type="button" class="btn btn-lg" data-action="continue-sandbox" title="Keep this save going with the scenario clock removed">Keep playing (sandbox)</button>'
          : '') +
      '</div>' +
      '</div></div>';
  };

})();
