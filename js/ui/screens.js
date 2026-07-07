/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/screens.js
 * New Game screen (era cards + shop name), Morning Summary modal,
 * Game Over screen.
 *
 * Per SPEC requirement, the new-game screen is the ONLY place the UI reads
 * DATA directly (DATA.ERAS + DATA.FLAVOR.shopNameSuggestions); everything
 * else renders through Engine view APIs.
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
  };

  function onNewGameClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'pick-era') {
      UI.state.selectedEra = el.getAttribute('data-era');
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

    /* era cards */
    if (eras.length) {
      h += '<h2 class="section-title">Choose your starting era</h2><div class="era-grid">';
      eras.forEach(function (era) {
        var sel = UI.state.selectedEra === era.id;
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
    h += '<div class="ng-start">' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="start"' + (ready && eras.length ? '' : ' disabled') + '>Open for Business</button>' +
      '</div>' +
    '</div>';

    el.innerHTML = h + '</div>';
  };

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
    var eraId = UI.state.selectedEra;
    if (!eraId) { UI.toast('Pick a starting era first', 'info'); return; }
    var name = (UI.state.shopName || '').replace(/^\s+|\s+$/g, '') || defaultShopName();

    var r = UI.tryCall(function () { return Engine.newGame({ eraId: eraId, shopName: name }); });
    if (!r || r.ok === false) {
      UI.toast((r && r.error) || 'Could not start a new game', 'error');
      return;
    }
    UI.state.activeTab = 'offers';
    UI.showScreen('main');
    UI.switchTab('offers');
    UI.refresh();
    UI.toast('Welcome to ' + name + ' — doors are open. Check your offers.', 'success', 5000);
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

    var lt = s.lifetime || {};
    el.innerHTML = '<div class="go-wrap"><div class="go-card">' +
      '<h1>Game Over</h1>' +
      (s.reason ? '<p class="go-reason">' + esc(s.reason) + '</p>' : '') +
      '<div class="go-meta">' +
        (s.dateStr ? '<span class="muted">' + esc(s.dateStr) + '</span> &nbsp; ' : '') +
        UI.starsHTML(s.rating) +
        (s.prestigeLabel ? ' <span class="chip">' + esc(s.prestigeLabel) + '</span>' : '') +
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

})();
