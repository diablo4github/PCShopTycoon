/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-wiki.js  (§17.3 split)
 * The Wiki tab: part table with expandable detail rows (§9.7), §13.1
 * Chronicle timeline, §13.2 Articles (safe Markdown-lite), §12.4 Devices.
 * Moved verbatim from the tabs.js monolith — zero behavior change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox,
      catLabel = S.catLabel, knownCategories = S.knownCategories,
      prettySubtype = S.prettySubtype, SUBTYPE_LABELS = S.SUBTYPE_LABELS,
      has = S.has, perfStr = S.perfStr, statusChip = S.statusChip,
      wikiDetailHTML = S.wikiDetailHTML;

  var wikiTimer = null;
  var refocusWikiSearch = false;

  function wikiCatChip(id, label, current) {
    return '<button type="button" class="chip-btn' + (current === id ? ' active' : '') +
      '" data-action="wcat" data-cat="' + esc(id) + '">' + esc(label) + '</button>';
  }

  function renderWiki(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var html = '<h2 class="section-title">Part Wiki <span class="muted small">everything on the market in your era — with period commentary</span></h2>';

    if (!has('getWiki')) {
      panel.innerHTML = html + emptyBox('The parts wiki is not available yet (engine integration pending).');
      return;
    }

    var cat = UI.state.wikiCat || 'all';
    var q = UI.state.wikiSearch || '';
    var devicesOk = has('getDeviceWiki'); /* §12.4 */
    var chronicleOk = has('getChronicle'); /* §13.1 */
    var articlesOk = has('getArticles'); /* §13.2 */

    html += '<div class="market-controls"><div class="chips">' + wikiCatChip('all', 'All', cat);
    knownCategories().forEach(function (c) { html += wikiCatChip(c, catLabel(c), cat); });
    if (chronicleOk) html += wikiCatChip('chronicle', 'Chronicle', cat);
    if (articlesOk) html += wikiCatChip('articles', 'Articles', cat);
    if (devicesOk) html += wikiCatChip('devices', 'Devices', cat);
    html += '</div>' +
      '<input type="search" id="wiki-search" placeholder="Search the wiki…" value="' + esc(q) + '" autocomplete="off">' +
      '</div>';

    var showParts = cat !== 'devices' && cat !== 'chronicle' && cat !== 'articles';
    var showDevices = devicesOk && (cat === 'all' || cat === 'devices');
    var showChronicle = chronicleOk && (cat === 'all' || cat === 'chronicle');
    var showArticles = articlesOk && (cat === 'all' || cat === 'articles');

    var rows = showParts ? arr(tryCall(function () {
      return Engine.getWiki({
        category: cat === 'all' ? undefined : cat,
        search: q || undefined
      });
    })) : [];

    if (showParts) {
      if (!rows.length) {
        if (!showDevices && !showChronicle && !showArticles) {
          panel.innerHTML = html + emptyBox('Nothing in the wiki matches — try another category or search. Hardware appears here as it hits the market.');
          restoreWikiFocus();
          return;
        }
        html += emptyBox('No catalog parts match.');
      } else {
        html += '<div class="table-wrap"><table class="data"><thead><tr>' +
          '<th></th><th>Part</th><th>Brand</th><th>Category</th><th class="num">Years</th>' +
          '<th>Key stats</th><th class="num">Reliability</th><th>Status</th><th class="num">Price</th>' +
          '</tr></thead><tbody>';

        rows.forEach(function (r) {
          var open = !!UI.state.wikiOpen[r.partId];
          var years = (r.introYear || '?') + '–' + (r.eolYear || '?');
          html += '<tr class="wiki-row" data-action="wiki-toggle" data-part="' + esc(r.partId) + '" title="Click for details">' +
            '<td class="muted">' + (open ? '▾' : '▸') + '</td>' +
            '<td>' + esc(r.name) + '</td>' +
            '<td class="muted">' + esc(r.brand || '') + '</td>' +
            '<td><span class="chip">' + esc(catLabel(r.category)) + '</span></td>' +
            '<td class="num muted">' + esc(years) + '</td>' +
            '<td class="small">' + esc(perfStr(r.perf)) + '</td>' +
            '<td class="num">' + (r.reliability !== undefined && r.reliability !== null ? esc(r.reliability) : '—') + '</td>' +
            '<td>' + statusChip(r.status) + '</td>' +
            '<td class="num"><b>' + esc(fm(r.price)) + '</b></td>' +
            '</tr>';
          if (open) {
            html += '<tr class="wiki-detail"><td colspan="9">' + wikiDetailHTML(r) + '</td></tr>';
          }
        });
        html += '</tbody></table></div>';
      }
    }

    if (showChronicle) html += chronicleHTML(q, UI.state.chronicleTag || 'all');
    if (showArticles) html += articlesHTML(q);
    if (showDevices) html += deviceWikiHTML(q);

    panel.innerHTML = html;
    restoreWikiFocus();
  }

  /* §13.1 — Chronicle: a dated, tag-filterable timeline of real computing
   * history. Non-market news (never touches prices); zero economy effect. */
  var CHRONICLE_TAGS = [
    { id: 'hardware', label: 'Hardware' }, { id: 'software', label: 'Software' },
    { id: 'gaming', label: 'Gaming' }, { id: 'internet', label: 'Internet' },
    { id: 'business', label: 'Business' }, { id: 'culture', label: 'Culture' }
  ];
  function chronicleTagLabel(id) {
    for (var i = 0; i < CHRONICLE_TAGS.length; i++) { if (CHRONICLE_TAGS[i].id === id) return CHRONICLE_TAGS[i].label; }
    return id ? prettySubtype(id) : '';
  }
  function chronoTagChip(id, label, current) {
    return '<button type="button" class="chip-btn' + (current === id ? ' active' : '') +
      '" data-action="ctag" data-tag="' + esc(id) + '">' + esc(label) + '</button>';
  }
  function chronicleHTML(q, tag) {
    var items = arr(tryCall(function () { return Engine.getChronicle(); }));
    if (tag && tag !== 'all') items = items.filter(function (c) { return c.tag === tag; });
    if (q) {
      var needle = q.toLowerCase();
      items = items.filter(function (c) {
        return ((c.headline || '') + ' ' + (c.body || '') + ' ' + (c.tag || '')).toLowerCase().indexOf(needle) !== -1;
      });
    }
    var h = '<h3 class="section-title">Chronicle <span class="muted small">real computing history, as it happened along your shop’s timeline</span></h3>' +
      '<div class="chips">' + chronoTagChip('all', 'All', tag);
    CHRONICLE_TAGS.forEach(function (t) { h += chronoTagChip(t.id, t.label, tag); });
    h += '</div>';

    /* newest-first from the engine; a timeline reads naturally oldest-first */
    items = items.slice().reverse();
    if (!items.length) {
      return h + emptyBox((q || (tag && tag !== 'all'))
        ? 'No chronicle entries match.'
        : 'History has not caught up yet — entries appear here as the calendar turns.');
    }
    h += '<div class="chronicle-timeline">';
    items.forEach(function (c) {
      h += '<div class="chronicle-item ct-' + esc(c.tag || '') + '">' +
        '<div class="ci-date">' + esc(c.dateLabel || c.date || '') + '</div>' +
        '<div class="ci-head">📅 ' + esc(c.headline) + '</div>' +
        '<span class="chip">' + esc(chronicleTagLabel(c.tag)) + '</span>' +
        (c.body ? '<div class="ci-desc">' + esc(c.body) + '</div>' : '') +
        '</div>';
    });
    return h + '</div>';
  }

  /* §13.2 — Articles: long-form milestone retrospectives, safe Markdown-lite
   * (paragraphs, **bold**, "- " bullets only). Escape FIRST, then format —
   * never trust or inject raw HTML from data. */
  var ARTICLE_CAT_LABELS = {
    buses: 'Expansion Buses', storage: 'Storage', cpu: 'CPU', gpu: 'GPU', memory: 'Memory',
    os: 'Operating Systems', 'form-factor': 'Form Factor', culture: 'Culture', business: 'Business'
  };
  function articleCatLabel(c) { return ARTICLE_CAT_LABELS[c] || prettySubtype(c || ''); }

  var ARTICLES_SEEN_KEY = 'cst-articles-seen';
  function loadSeenArticles() {
    try {
      if (typeof localStorage === 'undefined') return {};
      var raw = localStorage.getItem(ARTICLES_SEEN_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function markArticleSeen(id) {
    try {
      if (typeof localStorage === 'undefined') return;
      var seen = loadSeenArticles();
      seen[id] = 1;
      localStorage.setItem(ARTICLES_SEEN_KEY, JSON.stringify(seen));
    } catch (e) { /* ignore */ }
  }

  /** Safe Markdown-lite renderer: input MUST already be HTML-escaped. */
  function renderArticleBody(escapedText) {
    var paras = String(escapedText || '').split(/\n\s*\n/);
    return paras.map(function (p) {
      var lines = p.split(/\n/).filter(function (l) { return l.length; });
      var bulletLines = lines.filter(function (l) { return /^- /.test(l); });
      if (lines.length && bulletLines.length === lines.length) {
        return '<ul>' + bulletLines.map(function (l) {
          return '<li>' + boldify(l.replace(/^- /, '')) + '</li>';
        }).join('') + '</ul>';
      }
      return '<p>' + boldify(p.replace(/\n/g, '<br>')) + '</p>';
    }).join('');
  }
  function boldify(escapedStr) {
    return escapedStr.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function articlesHTML(q) {
    var items = arr(tryCall(function () { return Engine.getArticles(); }));
    if (q) {
      var needle = q.toLowerCase();
      items = items.filter(function (a) { return ((a.title || '') + ' ' + (a.summary || '')).toLowerCase().indexOf(needle) !== -1; });
    }
    var h = '<h3 class="section-title">Articles <span class="muted small">long-form retrospectives — unlocked as your shop lives through each transition</span></h3>';
    if (!items.length) {
      return h + emptyBox(q ? 'No articles match.' : 'No articles unlocked yet — keep playing. They arrive as the calendar turns past each transition.');
    }
    var seen = loadSeenArticles();
    var groups = {}, order = [];
    items.forEach(function (a) {
      if (!groups[a.category]) { groups[a.category] = []; order.push(a.category); }
      groups[a.category].push(a);
    });
    h += '<div class="article-groups">';
    order.forEach(function (cat) {
      h += '<div class="article-group"><h4 class="sub-title">' + esc(articleCatLabel(cat)) + '</h4><div class="cards">';
      groups[cat].forEach(function (a) {
        var isNew = !seen[a.id];
        h += '<button type="button" class="card article-card" data-action="open-article" data-id="' + esc(a.id) + '">' +
          '<div class="card-title">' + esc(a.title) + (isNew ? ' <span class="badge b-new">NEW</span>' : '') + '</div>' +
          (a.unlockLabel ? '<div class="muted small">' + esc(a.unlockLabel) + '</div>' : '') +
          (a.summary ? '<p class="muted small">' + esc(a.summary) + '</p>' : '') +
          '</button>';
      });
      h += '</div></div>';
    });
    return h + '</div>';
  }

  function openArticle(id) {
    if (!has('getArticle')) { UI.toast('Articles are not available yet', 'info'); return; }
    var a = tryCall(function () { return Engine.getArticle(id); });
    if (!a || a.ok === false) { UI.toast((a && a.error) || 'That article is still locked', 'error'); return; }
    markArticleSeen(id);
    /* §15.5 — the Wiki-reader achievement counts article opens engine-side.
     * Snapshot-diff so an unlock on this very read still toasts (tolerates
     * a void return, which UI.act would misread as an error). */
    if (has('markAchievementEvent')) {
      var achBefore = UI.achievementSnapshot();
      tryCall(function () { return Engine.markAchievementEvent('article-read'); });
      UI.toastNewAchievements(achBefore);
    }
    var html = '<div class="article">' +
      '<div class="article-meta">' +
        '<span class="chip">' + esc(articleCatLabel(a.category)) + '</span>' +
        (a.unlockLabel ? '<span class="muted small">' + esc(a.unlockLabel) + '</span>' : '') +
      '</div>' +
      renderArticleBody(esc(a.body)) +
      '</div>';
    UI.modal({ title: a.title, html: html, buttons: [{ label: 'Close', cls: 'btn btn-primary' }] });
    T.render('wiki'); // clears the NEW badge in the background
  }

  function restoreWikiFocus() {

    if (refocusWikiSearch) {
      refocusWikiSearch = false;
      var inp = document.getElementById('wiki-search');
      if (inp) {
        inp.focus();
        var len = inp.value.length;
        try { inp.setSelectionRange(len, len); } catch (e) { /* ignore */ }
      }
    }
  }

  /* §12.4 — the Devices group: Apple machines + mobile devices, read-only
   * repairability lore. Search-filtered client-side. */
  function deviceWikiHTML(q) {
    var devices = arr(tryCall(function () { return Engine.getDeviceWiki(); }));
    if (q) {
      var needle = String(q).toLowerCase();
      devices = devices.filter(function (d) {
        return ((d.name || '') + ' ' + (d.kind || d.family || '') + ' ' + (d.desc || ''))
          .toLowerCase().indexOf(needle) !== -1;
      });
    }
    var h = '<h3 class="section-title">Devices <span class="muted small">Apple machines &amp; mobile — repaired whole, never parted out</span></h3>';
    if (!devices.length) {
      return h + emptyBox(q ? 'No devices match the search.' : 'No devices known yet — they arrive with the years.');
    }
    h += '<div class="cards device-cards">';
    devices.forEach(function (d) {
      var kind = d.kind || d.family || d.type || '';
      var years = (d.introYear || '?') + '–' + (d.eolYear || 'today');
      h += '<div class="card device-card">' +
        '<div class="card-title">' + esc(d.name) +
          (kind ? ' <span class="chip chip-type t-device_repair">' + esc(SUBTYPE_LABELS[kind] || prettySubtype(kind)) + '</span>' : '') +
        '</div>' +
        '<div class="meta-row muted small"><span class="num">' + esc(years) + '</span>' +
          (d.tier ? '<span class="chip">' + esc(d.tier) + '</span>' : '') +
          (d.ramUpgradable !== undefined
            ? '<span class="chip" title="Can the bench upgrade its RAM?">RAM ' + (d.ramUpgradable ? 'upgradable' : 'sealed') + '</span>' : '') +
          (d.hddUpgradable !== undefined
            ? '<span class="chip" title="Can the bench swap its drive?">Drive ' + (d.hddUpgradable ? 'upgradable' : 'sealed') + '</span>' : '') +
        '</div>' +
        (d.desc ? '<div class="wiki-desc">' + esc(d.desc) + '</div>' : '') +
        '</div>';
    });
    return h + '</div>';
  }

  /* ---- actions ---- */
  T.registerActions({
    /* ---- Wiki (§9.7) ---- */
    'wcat': function (el) {
      UI.state.wikiCat = el.getAttribute('data-cat') || 'all';
      T.render('wiki');
    },
    'wiki-toggle': function (el) {
      var wpid = el.getAttribute('data-part');
      if (wpid) {
        if (UI.state.wikiOpen[wpid]) delete UI.state.wikiOpen[wpid];
        else UI.state.wikiOpen[wpid] = true;
        T.render('wiki');
      }
    },
    'ctag': function (el) { /* §13.1 Chronicle tag filter */
      UI.state.chronicleTag = el.getAttribute('data-tag') || 'all';
      T.render('wiki');
    },
    'open-article': function (el) { /* §13.2 */
      openArticle(el.getAttribute('data-id'));
    }
  });

  T.registerInputHook(function (t) {
    if (t.id === 'wiki-search') {
      UI.state.wikiSearch = t.value;
      if (wikiTimer) window.clearTimeout(wikiTimer);
      wikiTimer = window.setTimeout(function () {
        refocusWikiSearch = true;
        T.render('wiki');
      }, 170);
      return true;
    }
    return false;
  });

  T.registerTab('wiki', renderWiki);

})();
