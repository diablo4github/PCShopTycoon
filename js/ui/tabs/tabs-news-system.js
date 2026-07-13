/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-news-system.js (§17.3)
 * The News + System tabs: dated feed (§13.1 chronicle styling), save/
 * export/import cards, §9.8/§9.9 settings, debug sim button.
 * Moved verbatim from the tabs.js monolith — zero behavior change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox;

  /* ================================================================== *
   * TAB: News
   * ================================================================== */

  /* §17.6 — kind → filter-pill bucket. Market moves prices, Chronicle is
   * the history feed, Warnings are the "act now" pile, Shop is everything
   * that happened to YOUR shop (jobs/money/staff/achievements/mishaps).
   * Unknown future kinds land in Shop so nothing ever vanishes. */
  function newsBucketOf(n) {
    var k = (n && n.kind) || '';
    if (k === 'event' || k === 'market' || k === 'price') return 'market';
    if (k === 'chronicle') return 'chronicle';
    if (k === 'warning' || k === 'transition' || k === 'grace') return 'warnings';
    return 'shop';
  }

  function renderNews(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var items = arr(tryCall(function () { return Engine.getNews(50); }));
    var html = '<h2 class="section-title">News</h2>';
    if (!items.length) {
      html += emptyBox('No news yet — a quiet start. Events, price shocks and milestones land here.');
      panel.innerHTML = html;
      return;
    }

    /* §17.6 — kind filter pills (the §16.1 sub-tab component). Zero-count
     * pills hide; a hidden active selection falls back to All. */
    var counts = { market: 0, chronicle: 0, shop: 0, warnings: 0 };
    items.forEach(function (n) { counts[newsBucketOf(n)]++; });
    var pills = [
      { id: 'all', label: 'All', count: items.length },
      { id: 'market', label: 'Market', count: counts.market, hidden: !counts.market,
        title: 'Supply shocks, price waves, demand events' },
      { id: 'chronicle', label: 'Chronicle', count: counts.chronicle, hidden: !counts.chronicle,
        title: 'Real computing history as it happens' },
      { id: 'shop', label: 'Shop', count: counts.shop, hidden: !counts.shop,
        title: 'Your jobs, money, staff, achievements' },
      { id: 'warnings', label: 'Warnings', count: counts.warnings, hidden: !counts.warnings, countCls: 'red',
        title: 'Transitions and grace-period alarms' }
    ];
    var cur = UI.activeSubTab('news', pills);
    html += UI.subTabsHTML('news', pills);

    var shown = items.filter(function (n) { return cur === 'all' || newsBucketOf(n) === cur; });
    if (!shown.length) {
      html += emptyBox('Nothing under this filter right now.');
      panel.innerHTML = html;
      return;
    }

    html += '<div class="news-feed">';
    shown.forEach(function (n) {
      var isChronicle = n.kind === 'chronicle'; /* §13.1 — calm, non-alarming style */
      html += '<article class="news-item k-' + esc(n.kind || 'info') + '">' +
        '<div class="news-date">' + esc(n.dateStr || '') + '</div>' +
        '<div class="news-head">' + (isChronicle ? '📅 ' : '') + esc(n.headline || '') + '</div>' +
        (n.body ? '<div class="news-body">' + esc(n.body) + '</div>' : '') +
        '</article>';
    });
    html += '</div>';
    panel.innerHTML = html;
  }

  /* ================================================================== *
   * TAB: System (§9.10 — save/load cards + settings; tab id stays "save")
   * ================================================================== */

  function renderSave(panel) {
    var hasAuto = false;
    try { hasAuto = !!(window.Engine && Engine.hasAutosave && Engine.hasAutosave()); } catch (e) { /* ignore */ }

    var ver = '';
    try { if (window.Engine && Engine.VERSION) ver = String(Engine.VERSION); } catch (ev) { /* ignore */ }
    var html = '<h2 class="section-title">System' +
      (ver ? ' <span class="version-note">engine v' + esc(ver) + '</span>' : '') +
      '</h2><div class="save-grid">';

    /* ---- Settings card (§9.8 volumes + §9.9 UI scale) ---- */
    html += '<div class="card"><h3>Settings</h3>';
    var zoomMode = (UI.zoom && UI.zoom.mode) || 'auto';
    var zoomPct = Math.round(((UI.zoom && UI.zoom.factor) || 1) * 100);
    html += '<div class="settings-row"><label for="zoom-mode">UI scale</label>' +
      '<select id="zoom-mode" class="sel" data-action="zoom-mode">' +
        '<option value="auto"' + (zoomMode === 'auto' ? ' selected' : '') + '>Auto (currently ' + zoomPct + '%)</option>' +
        '<option value="0.8"' + (zoomMode === '0.8' ? ' selected' : '') + '>80%</option>' +
        '<option value="1"' + (zoomMode === '1' ? ' selected' : '') + '>100%</option>' +
        '<option value="1.15"' + (zoomMode === '1.15' ? ' selected' : '') + '>115%</option>' +
        '<option value="1.3"' + (zoomMode === '1.3' ? ' selected' : '') + '>130%</option>' +
      '</select></div>';
    if (UI.audio && UI.audio.getSettings) {
      var au = UI.audio.getSettings();
      html += '<div class="settings-row"><label for="music-vol">Music volume</label>' +
        '<input type="range" id="music-vol" min="0" max="1" step="0.05" value="' + au.musicVol + '">' +
        '<span class="val" id="music-vol-val">' + Math.round(au.musicVol * 100) + '%</span></div>' +
        '<div class="settings-row"><label for="sfx-vol">SFX volume</label>' +
        '<input type="range" id="sfx-vol" min="0" max="1" step="0.05" value="' + au.sfxVol + '">' +
        '<span class="val" id="sfx-vol-val">' + Math.round(au.sfxVol * 100) + '%</span></div>' +
        '<p class="muted small">Mute toggles live in the header (🎵 / 🔊). Audio starts after your first click — browser rules.</p>' +
        nowPlayingHTML();
    }
    html += '</div>';

    html += '<div class="card"><h3>Export</h3>' +
      '<p class="muted small">The game autosaves every night. Export a copy to keep or move between browsers.</p>' +
      '<div class="file-row">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="export">Export save</button>' +
        '<a id="save-dl" class="btn btn-sm" download="pcshop-save.json" hidden>Download .json</a>' +
      '</div>' +
      '<textarea id="export-ta" readonly placeholder="Click Export to dump the save JSON here…"></textarea>' +
      '</div>';

    html += '<div class="card"><h3>Import</h3>' +
      '<p class="muted small">Paste a save below, or choose a file — then press Import. Importing over a running game asks first.</p>' +
      '<textarea id="import-ta" placeholder="Paste save JSON here…"></textarea>' +
      '<div class="file-row">' +
        '<input type="file" id="import-file" accept=".json,application/json,text/plain" data-action="import-file">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="import">Import</button>' +
      '</div>' +
      '</div>';

    html += '<div class="card"><h3>Autosave</h3>' +
      '<p class="muted small">' + (hasAuto ? 'An autosave exists in this browser.' : 'No autosave found in this browser.') + '</p>' +
      '<div class="file-row">' +
        '<button type="button" class="btn btn-sm" data-action="clear-autosave"' + (hasAuto ? '' : ' disabled') + '>Clear autosave</button>' +
        '<button type="button" class="btn btn-sm" data-debug data-action="sim10">Simulate 10 Days</button>' +
      '</div>' +
      '</div>';

    html += '</div>';
    panel.innerHTML = html;
  }

  /* §18.2 — "Now playing" line: score name + the synthesis technique it
   * recreates (the soundtrack is part of the education layer). */
  function nowPlayingHTML() {
    if (!(UI.audio && typeof UI.audio.nowPlaying === 'function')) return '';
    var np = UI.audio.nowPlaying();
    if (!np) return '';
    if (np.off) {
      return '<p class="now-playing muted small">♪ ' + esc(np.reason || 'Music off') + '</p>';
    }
    return '<p class="now-playing small">♪ Now playing: <b>' + esc(np.name) + '</b>' +
      (np.technique ? ' <span class="muted">— ' + esc(np.technique) + '</span>' : '') + '</p>';
  }

  function doExport() {
    var json = tryCall(function () { return Engine.exportSave(); });
    if (typeof json !== 'string') {
      UI.toast((json && json.error) || 'Export failed', 'error');
      return;
    }
    var ta = document.getElementById('export-ta');
    if (ta) ta.value = json;
    var a = document.getElementById('save-dl');
    if (a && window.URL && URL.createObjectURL) {
      if (UI.state.saveUrl) { try { URL.revokeObjectURL(UI.state.saveUrl); } catch (e) { /* ignore */ } }
      UI.state.saveUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.href = UI.state.saveUrl;
      a.hidden = false;
    }
    UI.toast('Save exported', 'success');
  }

  function doImport() {
    var ta = document.getElementById('import-ta');
    var str = ta ? ta.value.replace(/^\s+|\s+$/g, '') : '';
    if (!str) { UI.toast('Paste a save (or pick a file) first', 'info'); return; }

    var running = false;
    try {
      var st = Engine.getState();
      running = !!(st && !(st.flags && st.flags.gameOver));
    } catch (e) { /* no game yet */ }

    var apply = function () {
      var r = tryCall(function () { return Engine.importSave(str); });
      if (!r || r.ok === false) {
        UI.toast((r && r.error) || 'Import failed — that does not look like a valid save', 'error');
        return;
      }
      UI.toast('Save imported', 'success');
      UI.state.activeTab = 'offers';
      UI.switchTab('offers');
      UI.refresh();
    };

    if (running) {
      UI.confirm('Importing will overwrite your current game in progress. Continue?', apply,
        { yesLabel: 'Import over it', title: 'Overwrite current game?' });
    } else {
      apply();
    }
  }

  function readImportFile(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var ta = document.getElementById('import-ta');
      if (ta) ta.value = String(rd.result || '');
      UI.toast('File loaded — press Import to apply it', 'info');
    };
    rd.onerror = function () { UI.toast('Could not read that file', 'error'); };
    rd.readAsText(f);
  }

  function simulateDays(n) {
    var done = 0;
    for (var i = 0; i < n; i++) {
      var r = tryCall(function () { return Engine.endDay(); });
      if (!r || r.ok === false) { UI.toast((r && r.error) || 'Simulation stopped', 'error'); break; }
      done++;
      var st = getState();
      if (st && st.flags && st.flags.gameOver) break;
    }
    UI.toast('Simulated ' + done + ' day' + (done === 1 ? '' : 's'), 'info');
    UI.refresh();
  }

  /* ---- actions ---- */
  T.registerActions({
    /* ---- System (save/load + settings) ---- */
    'export': function () { doExport(); },
    'import': function () { doImport(); },
    'clear-autosave': function () {
      UI.confirm('Delete the autosave? This cannot be undone.', function () {
        tryCall(function () { return Engine.clearAutosave(); });
        UI.toast('Autosave cleared', 'info');
        T.render('save');
      }, { yesLabel: 'Delete autosave' });
    },
    'sim10': function () { simulateDays(10); }
  });

  /* §16.3e — ONE preview click when the SFX slider is released (`change`),
   * not per input tick; setSfxVol itself is a silent setter now. */
  T.registerChangeHook(function (t) {
    if (t.id === 'sfx-vol') {
      if (UI.audio && UI.audio.sfx) UI.audio.sfx('click');
      return true;
    }
    return false;
  });

  T.registerChangeActions({
    'import-file': function (el) { readImportFile(el); },
    'zoom-mode': function (el) {
      /* §9.9 user override Auto/80/100/115/130% */
      if (UI.zoom) UI.zoom.set(el.value);
      T.render('save'); // refresh the "(currently N%)" hint
    }
  });

  T.registerInputHook(function (t) {
    if (t.id === 'music-vol') {
      /* live volume drag — no re-render, keep the slider silky */
      if (UI.audio && UI.audio.setMusicVol) UI.audio.setMusicVol(parseFloat(t.value));
      var mv = document.getElementById('music-vol-val');
      if (mv) mv.textContent = Math.round(parseFloat(t.value) * 100) + '%';
      return true;
    }
    if (t.id === 'sfx-vol') {
      if (UI.audio && UI.audio.setSfxVol) UI.audio.setSfxVol(parseFloat(t.value));
      var sv = document.getElementById('sfx-vol-val');
      if (sv) sv.textContent = Math.round(parseFloat(t.value) * 100) + '%';
      return true;
    }
    return false;
  });

  T.registerTab('news', renderNews);
  T.registerTab('save', renderSave);

})();
