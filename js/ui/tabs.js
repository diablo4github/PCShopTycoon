/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs.js
 * Renderers + delegated event handling for the 9 main tabs (§9.10 order):
 * Offers, Workbench (incl. As-Is Market), Inventory, Parts Market, Wiki,
 * Shop, Ledger, News, System (save/settings; tab id stays "save").
 *
 * Pattern: each render replaces the panel's innerHTML; exactly three
 * delegated listeners (click/change/input) live on #tab-panels forever,
 * so re-renders never leak listeners.
 * v2: taste chips & matches (§9.2), minPerf greying (§9.3), refurb
 * components / strip-for-parts (§9.5), Part Wiki + ⓘ popovers (§9.7),
 * zoom & volume settings (§9.8/§9.9) — all feature-detected so the UI
 * degrades gracefully while the engine lands.
 * v0.3: step checklists (§10.1), Assign/Order & Assign/Unassign (§10.3),
 * customer machines + overspend warnings (§10.4), peripheral kind chips
 * (§10.5), Staff section (§10.7), Engine.VERSION in System — same
 * feature-detection discipline.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};

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

  var marketTimer = null;
  var refocusMarketSearch = false;
  var wikiTimer = null;
  var refocusWikiSearch = false;

  /** Feature-detection for v2 engine APIs still landing (§9). */
  function has(fnName) {
    return !!(window.Engine && typeof Engine[fnName] === 'function');
  }

  /** Numeric Engine.VERSION (0 when absent) — gates flows that need engine
   * behavior changes, e.g. §11.3 diagnosis-in-checklist. */
  function engineV() {
    try { return parseFloat(window.Engine && Engine.VERSION) || 0; } catch (e) { return 0; }
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
   * Render dispatch
   * ------------------------------------------------------------------ */

  var renderers = {
    offers: renderOffers,
    workbench: renderWorkbench,
    inventory: renderInventory,
    market: renderMarket,
    wiki: renderWiki,
    shop: renderShop,
    ledger: renderLedger,
    news: renderNews,
    save: renderSave
  };

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

  /* ------------------------------------------------------------------ *
   * Delegated events (bound once from UI.init)
   * ------------------------------------------------------------------ */

  T.bind = function () {
    var panels = document.getElementById('tab-panels');
    if (!panels) return;
    panels.addEventListener('click', onPanelClick);
    panels.addEventListener('change', onPanelChange);
    panels.addEventListener('input', onPanelInput);
  };

  function jobIdOf(el) {
    var v = el.getAttribute('data-job');
    return v === null ? null : parseInt(v, 10);
  }

  function onPanelClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-action]');
    if (!el || el.disabled) return;
    var action = el.getAttribute('data-action');
    var jobId = jobIdOf(el);

    switch (action) {
      /* ---- Offers ---- */
      case 'accept': {
        var ac = UI.act(function () { return Engine.acceptOffer(jobId); }, 'Job accepted — it is on your Workbench');
        if (ac && ac.ok !== false && UI.audio && UI.audio.sfx) UI.audio.sfx('accept');
        break;
      }
      case 'decline': {
        var dc = UI.act(function () { return Engine.declineOffer(jobId); });
        if (dc && dc.ok !== false && UI.audio && UI.audio.sfx) UI.audio.sfx('decline');
        break;
      }

      /* ---- Workbench ---- */
      case 'diagnose': {
        var dr = UI.act(function () { return Engine.diagnoseJob(jobId); });
        if (dr && dr.ok !== false && dr.fault) {
          UI.toast('Diagnosis (' + (dr.hoursSpent != null ? dr.hoursSpent + 'h' : 'done') + '): ' +
            (dr.fault.desc || 'fault found') +
            (dr.fault.partCategory ? ' — needs a ' + catLabel(dr.fault.partCategory) + ' part' : ' — labor only'),
            'info', 6500);
        }
        break;
      }
      /* §14.8 — graduated work controls */
      case 'work-tinker':
        workGraduated(jobId, 0.1);
        break;
      case 'work-step':
        workGraduated(jobId, 'step');
        break;
      case 'work-hour':
        workGraduated(jobId, 1);
        break;
      case 'work-job':
        workGraduated(jobId, 'job');
        break;
      case 'abandon':
        UI.confirm(
          'Abandon this job? The customer will not be happy — your reputation takes a hit.',
          function () { UI.act(function () { return Engine.abandonJob(jobId); }, 'Job abandoned'); },
          { yesLabel: 'Abandon job', title: 'Abandon job' }
        );
        break;
      case 'strip': { /* §9.5 refurb strip-for-parts */
        var salvage = [];
        if (has('getMachineParts')) {
          arr(tryCall(function () { return Engine.getMachineParts(jobId); })).forEach(function (p) {
            if (p && p.status !== 'faulty') salvage.push(p.name);
          });
        }
        var msg = 'Strip this machine for parts? Takes 1.5h. ' +
          (salvage.length
            ? 'Expected salvage (most survive the bench): ' + salvage.join(', ') + '.'
            : 'Working parts roll into your inventory; the faulty one is lost.');
        UI.confirm(msg, function () {
          UI.act(function () { return Engine.stripRefurb(jobId); }, 'Machine stripped — salvage moved to inventory');
        }, { yesLabel: 'Strip for Parts', title: 'Strip for parts' });
        break;
      }
      case 'install': { /* §10.3: assign (installPart is the deprecated alias) */
        var needIdx = parseInt(el.getAttribute('data-need'), 10);
        var sel = document.getElementById('need-sel-' + jobId + '-' + needIdx);
        var pid = sel && sel.value;
        if (!pid) { UI.toast('Pick a part first', 'info'); break; }
        var useAssign = has('assignPart');
        var ir = UI.act(function () {
          return useAssign ? Engine.assignPart(jobId, needIdx, pid) : Engine.installPart(jobId, needIdx, pid);
        });
        if (ir && ir.ok !== false) {
          var msg2 = useAssign ? 'Part assigned — it installs when its step is worked' : 'Part installed';
          if (ir.cost) msg2 += ' — ' + fm(ir.cost);
          if (ir.filledNow !== null && ir.filledNow !== undefined) msg2 += ' (' + ir.filledNow + ' this batch)';
          UI.toast(msg2, 'success');
        }
        break;
      }
      case 'unassign': { /* §10.3 */
        var unIdx = parseInt(el.getAttribute('data-need'), 10);
        var unPid = el.getAttribute('data-part') || null;
        UI.act(function () {
          return unPid ? Engine.unassignPart(jobId, unIdx, unPid) : Engine.unassignPart(jobId, unIdx);
        }, 'Part returned to inventory');
        break;
      }
      case 'sell-refurb': {
        var sr = UI.act(function () { return Engine.sellRefurb(jobId); });
        if (sr && sr.ok !== false) UI.toast('Machine sold for ' + fm(sr.price), 'success', 5000);
        break;
      }
      case 'appraise': {
        var ar = tryCall(function () { return Engine.appraiseRefurb(jobId); });
        if (ar && ar.ok === false) UI.toast(ar.error, 'error');
        else if (ar) UI.toast('Appraisal: should sell for about ' + fm(ar.estimate), 'info', 5000);
        break; // read-only — no refresh needed
      }
      case 'scrollto': { /* §14.5 Shop sub-nav — pure UI, no engine call */
        var jumpId = el.getAttribute('data-target');
        var jumpEl = jumpId && document.getElementById(jumpId);
        if (jumpEl && jumpEl.scrollIntoView) jumpEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'commit-build':
        UI.act(function () { return Engine.commitBuild(jobId); },
          'Build locked in — parts sourced. Work the job to assemble it.');
        break;
      case 'slot-pick': { /* §12.5 schematic slot → part-picker popover */
        var pcat = el.getAttribute('data-cat');
        var pslot = parseInt(el.getAttribute('data-slot'), 10) || 0;
        if (pcat) openSlotPicker(jobId, pcat, pslot);
        break;
      }
      case 'buy-asis': {
        var mid = el.getAttribute('data-machine');
        UI.act(function () { return Engine.buyAsIsMachine(mid); },
          'Machine bought — it is on your Workbench as a refurb job');
        break;
      }

      /* ---- Inventory ---- */
      case 'sell-part': {
        var spid = el.getAttribute('data-part');
        var sqty = parseInt(el.getAttribute('data-qty'), 10) || 1;
        var pr = UI.act(function () { return Engine.sellPart(spid, sqty); });
        if (pr && pr.ok !== false) UI.toast('Sold ' + sqty + ' for ' + fm(pr.proceeds), 'success');
        break;
      }

      /* ---- Parts Market ---- */
      case 'mcat':
        UI.state.marketCat = el.getAttribute('data-cat') || 'all';
        T.render('market');
        break;
      case 'buy': {
        var bpid = el.getAttribute('data-part');
        var bqty = parseInt(el.getAttribute('data-qty'), 10) || 1;
        var br = UI.act(function () { return Engine.buyPart(bpid, bqty); });
        if (br && br.ok !== false) UI.toast('Bought ' + bqty + ' — ' + fm(br.cost), 'success');
        break;
      }

      /* ---- Part info popover (§9.7) ---- */
      case 'partinfo': {
        var ppid = el.getAttribute('data-part');
        var fromSel = el.getAttribute('data-from-select');
        if (fromSel) {
          var srcSel = document.getElementById(fromSel);
          ppid = srcSel ? srcSel.value : null;
        }
        if (ppid) showPartInfo(ppid);
        else UI.toast('Pick a part first', 'info');
        break;
      }

      /* ---- Wiki (§9.7) ---- */
      case 'wcat':
        UI.state.wikiCat = el.getAttribute('data-cat') || 'all';
        T.render('wiki');
        break;
      case 'wiki-toggle': {
        var wpid = el.getAttribute('data-part');
        if (wpid) {
          if (UI.state.wikiOpen[wpid]) delete UI.state.wikiOpen[wpid];
          else UI.state.wikiOpen[wpid] = true;
          T.render('wiki');
        }
        break;
      }
      case 'ctag': /* §13.1 Chronicle tag filter */
        UI.state.chronicleTag = el.getAttribute('data-tag') || 'all';
        T.render('wiki');
        break;
      case 'open-article': /* §13.2 */
        openArticle(el.getAttribute('data-id'));
        break;

      /* ---- Shop ---- */
      case 'upgrade': {
        var label = el.getAttribute('data-label') || 'the next tier';
        var cost = el.getAttribute('data-cost') || '';
        UI.confirm(
          'Upgrade the shop to ' + label + (cost ? ' for ' + cost : '') + '? Rent and utilities go up with the bigger space.',
          function () { UI.act(function () { return Engine.upgradeShop(); }, 'Shop upgraded!'); },
          { yesLabel: 'Upgrade', title: 'Upgrade shop', danger: false }
        );
        break;
      }
      case 'buy-equip': {
        var eid = el.getAttribute('data-id');
        UI.act(function () { return Engine.buyEquipment(eid); }, 'Equipment purchased');
        break;
      }
      case 'hire': { /* §10.7 */
        var cid = el.getAttribute('data-id');
        UI.act(function () { return Engine.hireStaff(cid); }, 'Welcome aboard — they start right away');
        break;
      }
      case 'study-cert': { /* §13.4 */
        var scr = UI.act(function () { return Engine.studyCert(); });
        if (scr && scr.ok !== false) {
          UI.toast(scr.completed ? 'Certification complete!' : ('Studied ' + (scr.hoursSpent != null ? scr.hoursSpent + 'h' : '')), 'success');
        }
        break;
      }
      case 'start-cert': { /* §13.4 */
        var certId = el.getAttribute('data-id');
        UI.act(function () { return Engine.startCertification(certId); }, 'Enrolled — study hours in the Shop tab to complete it');
        break;
      }
      case 'retrain': { /* §15.1 — transition retraining (owner time + cost) */
        if (!has('retrainStaff')) { UI.toast('Retraining is not available yet', 'info'); break; }
        var rtId = el.getAttribute('data-id');
        var rtTrans = el.getAttribute('data-transition') || undefined;
        var rtr = UI.act(function () { return Engine.retrainStaff(rtId, rtTrans); });
        if (rtr && rtr.ok !== false) {
          UI.toast('Retrained — back to full speed on the new platform' +
            (rtr.cost ? ' (' + fm(rtr.cost) + ')' : ''), 'success', 5000);
        }
        break;
      }

      /* ---- §15.3 credit line (Ledger) ---- */
      case 'credit-draw': {
        var drawEl = document.getElementById('credit-draw-amt');
        var drawAmt = drawEl ? parseFloat(drawEl.value) : NaN;
        if (!isFinite(drawAmt) || drawAmt <= 0) { UI.toast('Enter a positive amount to draw', 'info'); break; }
        var cdr = UI.act(function () { return Engine.drawCredit(drawAmt); });
        if (cdr && cdr.ok !== false) UI.toast('Drew ' + fm(drawAmt) + ' on the credit line — 0.1h of paperwork', 'success');
        break;
      }
      case 'credit-repay': {
        var repEl = document.getElementById('credit-repay-amt');
        var repAmt = repEl ? parseFloat(repEl.value) : NaN;
        if (!isFinite(repAmt) || repAmt <= 0) { UI.toast('Enter a positive amount to repay', 'info'); break; }
        var crr = UI.act(function () { return Engine.repayCredit(repAmt); });
        if (crr && crr.ok !== false) UI.toast('Repaid ' + fm(repAmt) + ' — 0.1h of paperwork', 'success');
        break;
      }
      case 'fire': { /* §10.7 + §11.5 (veterans hurt twice as much) */
        var sid = el.getAttribute('data-id');
        var sname = el.getAttribute('data-name') || 'this employee';
        var slvl = parseInt(el.getAttribute('data-level'), 10) || 0;
        UI.confirm(
          'Fire ' + sname + '? Severance costs about half a month\'s wages' +
          (slvl >= 4
            ? ' — and letting a veteran this senior go hurts your reputation twice as much.'
            : ', and word gets around town.'),
          function () { UI.act(function () { return Engine.fireStaff(sid); }, 'They cleared out their bench'); },
          { yesLabel: 'Fire them', title: 'Fire employee' }
        );
        break;
      }

      /* ---- System (save/load + settings) ---- */
      case 'export':
        doExport();
        break;
      case 'import':
        doImport();
        break;
      case 'clear-autosave':
        UI.confirm('Delete the autosave? This cannot be undone.', function () {
          tryCall(function () { return Engine.clearAutosave(); });
          UI.toast('Autosave cleared', 'info');
          T.render('save');
        }, { yesLabel: 'Delete autosave' });
        break;
      case 'sim10':
        simulateDays(10);
        break;
    }
  }

  function onPanelChange(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    /* §10.3/§10.4 — need pickers: keep the button label ("Assign from
     * Stock" vs "Order & Assign") and the replaces/overspend meta line in
     * sync with the highlighted option. */
    if (t.id && t.id.indexOf('need-sel-') === 0) { updateNeedRowUI(t); return; }
    var el = t.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var jobId = jobIdOf(el);

    if (action === 'speed') {
      UI.act(function () { return Engine.setJobSpeed(jobId, el.value); });
    } else if (action === 'buildpart') {
      var cat = el.getAttribute('data-cat');
      var pid = el.value || null;
      UI.act(function () { return Engine.setBuildPart(jobId, cat, pid); });
    } else if (action === 'insurance') {
      UI.act(function () { return Engine.setInsurance(!!el.checked); });
    } else if (action === 'import-file') {
      readImportFile(el);
    } else if (action === 'zoom-mode') {
      /* §9.9 user override Auto/80/100/115/130% */
      if (UI.zoom) UI.zoom.set(el.value);
      T.render('save'); // refresh the "(currently N%)" hint
    }
  }

  function onPanelInput(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'market-search') {
      UI.state.marketSearch = t.value;
      if (marketTimer) window.clearTimeout(marketTimer);
      marketTimer = window.setTimeout(function () {
        refocusMarketSearch = true;
        T.render('market');
      }, 170);
    } else if (t.id === 'wiki-search') {
      UI.state.wikiSearch = t.value;
      if (wikiTimer) window.clearTimeout(wikiTimer);
      wikiTimer = window.setTimeout(function () {
        refocusWikiSearch = true;
        T.render('wiki');
      }, 170);
    } else if (t.id === 'music-vol') {
      /* live volume drag — no re-render, keep the slider silky */
      if (UI.audio && UI.audio.setMusicVol) UI.audio.setMusicVol(parseFloat(t.value));
      var mv = document.getElementById('music-vol-val');
      if (mv) mv.textContent = Math.round(parseFloat(t.value) * 100) + '%';
    } else if (t.id === 'sfx-vol') {
      if (UI.audio && UI.audio.setSfxVol) UI.audio.setSfxVol(parseFloat(t.value));
      var sv = document.getElementById('sfx-vol-val');
      if (sv) sv.textContent = Math.round(parseFloat(t.value) * 100) + '%';
    }
  }

  /* ------------------------------------------------------------------ *
   * Shared action helpers
   * ------------------------------------------------------------------ */

  /** Shared post-work-call reporting: the "assign a part first" nudge plus
   * the completion/progress toast. Used by every graduated work control
   * (§14.8 Tinker / Finish Step / Work 1 Hour / Finish Job). */
  function reportWorkResult(jobId, r) {
    /* §10.3 — engine blocks install steps whose need is unassigned; lead
     * the player straight to the picker. */
    if (r && r.ok === false && /assign/i.test(r.error || '')) {
      var box = document.getElementById('needs-' + jobId);
      if (box) {
        box.classList.add('attention');
        try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (esc1) { /* ignore */ }
      }
    }
    if (r && r.ok !== false) {
      if (r.completed) {
        var res = r.result || {};
        var msg = 'Job finished';
        if (res.payout) msg += ' — paid ' + fm(res.payout);
        if (res.score !== null && res.score !== undefined) msg += ' • score ' + Number(res.score).toFixed(1) + '/5';
        if (res.onTime === false) msg += ' • LATE';
        if (res.notes) msg += ' • ' + res.notes;
        UI.toast(msg, 'success', 6500);
        if (UI.audio && UI.audio.sfx && !res.payout) UI.audio.sfx('complete');
      } else if (r.hoursSpent) {
        UI.toast('Worked ' + fmtHours(r.hoursSpent) + 'h', 'info', 1600);
      }
    }
  }

  function workAndReport(jobId, hours) {
    var r = UI.act(function () {
      return (hours === null || hours === undefined) ? Engine.workJob(jobId) : Engine.workJob(jobId, hours);
    });
    reportWorkResult(jobId, r);
  }

  /** §14.8 — graduated work controls (Tinker 6min / Finish Step / Work 1
   * Hour / Finish Job). Numeric modes are always supported. String modes
   * ("step"/"job") ask the engine to work exactly the current step, or the
   * whole remaining job; an engine that does not understand them yet is
   * feature-detected (the call comes back {ok:false}) and falls back to an
   * equivalent numeric call computed here, so the button does the right
   * thing either way. */
  function workGraduated(jobId, mode) {
    if (typeof mode === 'number') { workAndReport(jobId, mode); return; }

    var before = null;
    if (UI.engineReady()) {
      try {
        var st0 = Engine.getState();
        if (st0) before = { cash: Number(st0.cash) || 0, hours: Number(st0.hoursLeft) || 0 };
      } catch (e) { /* ignore */ }
    }
    var r = UI.tryCall(function () { return Engine.workJob(jobId, mode); });
    if (!r || r.ok === false) {
      if (mode === 'step') {
        var remH = currentStepRemainingHours(activeJobById(jobId));
        r = UI.tryCall(function () {
          return (remH === null) ? Engine.workJob(jobId) : Engine.workJob(jobId, remH);
        });
      } else { // 'job' — old engines' "no hours arg" already means "as much as useful & available"
        r = UI.tryCall(function () { return Engine.workJob(jobId); });
      }
    }
    if (r && r.ok !== false && before) {
      try {
        var st1 = Engine.getState();
        if (st1) {
          var dc = Math.round(((Number(st1.cash) || 0) - before.cash) * 100) / 100;
          var dh = Math.round(((Number(st1.hoursLeft) || 0) - before.hours) * 100) / 100;
          UI.feedback(dc, dh);
        }
      } catch (e2) { /* ignore */ }
    }
    UI.api(r); // toast on {ok:false}, refresh on success — mirrors UI.act's own tail
    reportWorkResult(jobId, r);
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

  /* ------------------------------------------------------------------ *
   * Shared render helpers
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

  function dueText(j, st) {
    if (j.deadlineDay === null || j.deadlineDay === undefined) return { txt: 'No deadline', urgent: false };
    var d = j.deadlineDay - st.day;
    if (d <= 0) return { txt: 'Due TODAY', urgent: true };
    if (d === 1) return { txt: 'Due tomorrow', urgent: true };
    return { txt: 'Due in ' + d + ' days', urgent: false };
  }

  /* ================================================================== *
   * TAB: Offers
   * ================================================================== */

  function renderOffers(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var offers = arr(tryCall(function () { return Engine.getOffers(); }));
    if (!offers.length) {
      panel.innerHTML = '<h2 class="section-title">Job Offers</h2>' +
        emptyBox('No offers today — check back tomorrow. Ending the day brings fresh customers through the door.');
      return;
    }
    var html = '<h2 class="section-title">Job Offers <span class="muted small">(' + offers.length + ' waiting — unanswered offers expire after a few days)</span></h2><div class="cards">';
    offers.forEach(function (j) {
      /* §15.4 — business-account retainers get their own card variant */
      var acct = accountInfoOf(j);
      if (acct) { html += accountOfferCardHTML(j, acct, st); return; }

      var due = dueText(j, st);
      html += '<div class="card job-card">' +
        '<div class="card-title">' + esc(j.title) +
          (j.rush ? ' <span class="badge b-rush">RUSH</span>' : '') + '</div>' +
        '<div class="meta-row">' + typeChip(j) + UI.wrenches(j.difficulty) + regularChip(j) + tasteChip(j) + osChip(j) + '</div>' +
        (j.blurb ? '<div class="blurb">&ldquo;' + esc(j.blurb) + '&rdquo;</div>' : '') +
        '<div class="meta-row">' + customerLine(j) + '</div>' +
        '<div class="meta-row flex-between">' +
          '<span class="pay num">' + (j.pay !== null && j.pay !== undefined ? fm(j.pay) : 'Market-priced') + '</span>' +
          '<span class="' + (due.urgent ? 'due-soon' : 'muted') + '">' + esc(due.txt) + '</span>' +
        '</div>' +
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="accept" data-job="' + j.id + '">Accept</button>' +
          '<button type="button" class="btn btn-sm" data-action="decline" data-job="' + j.id + '">Decline</button>' +
        '</div>' +
      '</div>';
    });
    panel.innerHTML = html + '</div>';
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

  /* §15.4 — business-account offer detection: the engine may hang the
   * retainer terms off job.account / job.businessAccount, or type the job
   * itself. Absent all of these, the offer renders as a normal card. */
  function accountInfoOf(j) {
    if (!j) return null;
    if (j.account && typeof j.account === 'object') return j.account;
    if (j.businessAccount && typeof j.businessAccount === 'object') return j.businessAccount;
    if (j.type === 'account' || j.type === 'business_account') return j;
    return null;
  }

  function accountOfferCardHTML(j, acct, st) {
    var due = dueText(j, st);
    var fee = acct.monthlyFee !== undefined && acct.monthlyFee !== null ? acct.monthlyFee : j.pay;
    return '<div class="card job-card account-card">' +
      '<div class="card-title">' + esc(j.title || ((acct.name || 'Local business') + ' — service retainer')) +
        ' <span class="badge b-account">BUSINESS ACCOUNT</span></div>' +
      (j.blurb ? '<div class="blurb">&ldquo;' + esc(j.blurb) + '&rdquo;</div>' : '') +
      '<div class="meta-row small">' +
        (fee !== undefined && fee !== null ? '<span class="chip">Retainer <b class="num">' + esc(fm(fee)) + '</b>/month</span>' : '') +
        (acct.jobsPerMonth ? '<span class="chip">' + esc(acct.jobsPerMonth) + ' service job' + (Number(acct.jobsPerMonth) === 1 ? '' : 's') + '/month, auto-accepted</span>' : '') +
        (acct.minRating ? '<span class="chip chip-risk" title="The account cancels — with a reputation hit — if your rating drops below this or you fail two of their jobs in a month">Keep rating ≥ ' + esc(acct.minRating) + '</span>' : '') +
      '</div>' +
      '<div class="meta-row flex-between">' +
        '<span class="muted small">Their service jobs come with relaxed deadlines — steady money for steady work.</span>' +
        '<span class="' + (due.urgent ? 'due-soon' : 'muted') + '">' + esc(due.txt) + '</span>' +
      '</div>' +
      '<div class="job-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="accept" data-job="' + j.id + '">Sign the account</button>' +
        '<button type="button" class="btn btn-sm" data-action="decline" data-job="' + j.id + '">Decline</button>' +
      '</div>' +
    '</div>';
  }

  /* ================================================================== *
   * TAB: Workbench (active jobs + as-is market)
   * ================================================================== */

  function renderWorkbench(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }

    var jobs = arr(tryCall(function () { return Engine.getActiveJobs(); }));
    var slots = null;
    try {
      var sv = Engine.getShopView();
      if (sv && sv.tier) slots = sv.tier.workstationSlots;
    } catch (e) { /* ignore */ }

    var activeCount = 0;
    jobs.forEach(function (j) { if (j.type !== 'refurb') activeCount++; });

    var html = '<div class="wb-top"><h2 class="section-title">Workbench</h2>' +
      (slots ? '<span class="muted small">' + activeCount + ' active job' + (activeCount === 1 ? '' : 's') +
        ' / ' + slots + ' workstation slot' + (slots === 1 ? '' : 's') +
        ' — jobs beyond your slots take +50% hours</span>' : '') +
      '</div>';

    if (!jobs.length) {
      html += emptyBox('The bench is clear. Accept an offer, or flip a machine from the As-Is Market below.');
    } else {
      jobs.forEach(function (j) { html += jobCardHTML(j, st); });
    }

    /* As-Is Market */
    html += '<h2 class="section-title">As-Is Market <span class="muted small">broken machines, sold untested — repair and flip them</span></h2>';
    var machines = arr(tryCall(function () { return Engine.getAsIsMarket(); }));
    if (!machines.length) {
      html += emptyBox('Nothing listed right now — new machines turn up most mornings.');
    } else {
      html += '<div class="cards">';
      machines.forEach(function (m) {
        var age = (m.listedDay !== null && m.listedDay !== undefined) ? (st.day - m.listedDay) : null;
        var ageTxt = age === null ? '' : (age <= 0 ? 'listed today' : 'listed ' + age + ' day' + (age === 1 ? '' : 's') + ' ago');
        html += '<div class="card">' +
          '<div class="card-title">' + esc(m.name) + ' <span class="muted small">(' + esc(m.year) + ')</span></div>' +
          (m.specSummary ? '<div class="asis-spec">' + esc(m.specSummary) + '</div>' : '') +
          (m.hint ? '<div class="blurb">&ldquo;' + esc(m.hint) + '&rdquo;</div>' : '') +
          '<div class="meta-row"><span class="muted small">' + arr(m.partIds).length + ' parts inside • sold as-is, no returns</span>' +
            (ageTxt ? '<span class="asis-age">' + esc(ageTxt) + '</span>' : '') + '</div>' +
          '<div class="job-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="buy-asis" data-machine="' + esc(m.id) + '">Buy — ' + fm(m.askPrice) + '</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    panel.innerHTML = html;

    /* §10.3/§10.4 — initialize picker button labels + meta lines to match
     * each select's current option. */
    var needSels = panel.querySelectorAll('select[id^="need-sel-"]');
    for (var ns = 0; ns < needSels.length; ns++) updateNeedRowUI(needSels[ns]);
  }

  function jobCardHTML(j, st) {
    var due = dueText(j, st);
    var isRefurb = j.type === 'refurb';
    var undiagnosed = !!(j.needsDiagnosis && !j.diagnosed);
    var buildPending = !!(j.build && !j.build.validated);
    var ready = j.status === 'done';
    /* §9.4 overtime: actions may proceed while hoursLeft > -overtimeCap;
     * only disable at the exhaustion floor (engine enforces the real rule). */
    var otCap = otCapValue();
    var hoursNow = Number(st.hoursLeft) || 0;
    var noHours = hoursNow <= -otCap;
    var otWarn = hoursNow <= 0 && !noHours;
    /* §11.3 — diagnosis lives in the step checklist now (engine ≥0.4:
     * working the checklist performs the diagnosis). The separate Diagnose
     * button survives as a fallback for jobs without steps AND for pre-0.4
     * engines whose workJob still demands the old diagnoseJob call. */
    var hasSteps = !!(j.steps && j.steps.length);
    var diagFallback = undiagnosed && (!hasSteps || engineV() < 0.4);
    var isDevice = j.type === 'device_repair'; /* §12.4 */

    var h = '<div class="card job-card-full">';

    /* title row */
    h += '<div class="card-title">' + esc(j.title) +
      (j.rush ? ' <span class="badge b-rush">RUSH</span>' : '') +
      (ready ? ' <span class="chip chip-status done">' + (isRefurb ? 'Repaired — ready to sell' : 'Done') + '</span>' : '') +
      (j.crt ? ' <span class="badge b-warn" title="CRT work without a discharge kit risks injury">CRT — HIGH VOLTAGE</span>' : '') +
      '</div>';

    /* meta row */
    h += '<div class="meta-row">' + typeChip(j) + UI.wrenches(j.difficulty) +
      customerLine(j) + regularChip(j) + tasteChip(j) +
      '<span class="pay num">' + (j.pay !== null && j.pay !== undefined
        ? (j.type === 'callback' ? 'Warranty — no pay' : fm(j.pay))
        : 'Market-priced at sale') + '</span>' +
      '<span class="' + (due.urgent ? 'due-soon' : 'muted') + '">' + esc(due.txt) + '</span>' +
      (j.drTier ? '<span class="chip" title="Data-recovery rig tier required">Needs DR rig tier ' + esc(j.drTier) + '</span>' : '') +
      osChip(j) +
      '</div>';

    if (j.blurb) h += '<div class="blurb">&ldquo;' + esc(j.blurb) + '&rdquo;</div>';

    /* progress (animated across renders, §9.9) */
    h += '<div class="bar-row"><span class="muted small">Progress</span>' +
      animatedBar('job-' + j.id, j.hoursDone, j.hoursRequired, 'wide') +
      '<span class="num small">' + fmtHours(j.hoursDone) + ' / ' + fmtHours(j.hoursRequired) + 'h <span class="muted">(at standard pace)</span></span></div>';

    /* §11.6 — running wait-step status line */
    var runWait = findRunningWaitStep(j);
    if (runWait) {
      var remH = waitRemainingHours(runWait);
      h += '<div><span class="wait-status" title="Timed steps advance alongside any other work (or Wait 1h) and finish free overnight.">⏲ waiting on ' +
        esc(String(runWait.label || 'timed step').toLowerCase()) +
        (remH !== null ? ' (' + remH + 'h left)' : '') +
        ' — runs while you work on other jobs</span></div>';
    }

    /* contract units */
    if (j.units && j.units > 1) {
      h += '<div class="bar-row"><span class="muted small">Units</span>' +
        animatedBar('units-' + j.id, j.unitsDone || 0, j.units, 'wide good') +
        '<span class="num small">' + esc(j.unitsDone || 0) + ' / ' + esc(j.units) + ' machines</span></div>';
    }

    /* §10.1 step checklist (absent on old saves until the engine migrates) */
    if (j.steps && j.steps.length) h += stepsHTML(j);

    /* speed selector */
    if (!ready) {
      h += '<div class="meta-row"><label class="muted small" for="speed-' + j.id + '">Pace</label>' +
        '<select class="sel" id="speed-' + j.id + '" data-action="speed" data-job="' + j.id + '" title="' + esc(SPEED_TIP) + '">' +
        speedOpt(j, 'quick', 'Quick (fewer hours, callback risk)') +
        speedOpt(j, 'standard', 'Standard') +
        speedOpt(j, 'meticulous', 'Meticulous (more hours, better rating)') +
        '</select>' +
        '<span class="tip" title="' + esc(SPEED_TIP) + '">?</span></div>';
    }

    /* diagnosis */
    if (diagFallback) {
      h += '<div class="note">Fault not identified yet — diagnose before ordering parts.</div>';
    } else if (j.diagnosed && j.fault) {
      h += '<div class="meta-row"><span class="muted small">Fault:</span> ' + esc(j.fault.desc || '') +
        (j.fault.partCategory
          ? ' <span class="chip">' + esc(catLabel(j.fault.partCategory)) + ' part needed</span>'
          : ' <span class="chip">Labor only</span>') +
        '</div>';
    }

    /* §12.4 device repairs: device line + kind chip; NO catalog parts —
     * no picker, no component list. Parts expense is engine-side. */
    if (isDevice) {
      var dev = j.device || j.machine || {};
      h += '<div class="refurb-box"><span class="muted small">Device:</span> ' +
        esc(dev.name || j.title) +
        (dev.kind || j.subtype
          ? ' <span class="chip chip-type t-device_repair">' + esc(SUBTYPE_LABELS[dev.kind || j.subtype] || prettySubtype(dev.kind || j.subtype)) + '</span>'
          : '') +
        (dev.year ? ' <span class="muted small">(' + esc(dev.year) + ')</span>' : '') +
        '<div class="note">Specialty parts are sourced by the bench and billed at completion.</div>' +
        '</div>';
    }

    /* machine info + component list (§9.5 refurbs; §10.4 customer machines
     * on repair/upgrade/peripheral too — statuses engine-driven, "?" until
     * diagnosis) */
    if (j.machine && !isDevice) {
      h += '<div class="refurb-box"><span class="muted small">' +
        (isRefurb ? 'Machine:' : 'In for service:') + '</span> ' + esc(j.machine.name) +
        (j.machine.year ? ' <span class="muted small">(' + esc(j.machine.year) + ')</span>' : '') +
        (j.machine.boughtFor !== null && j.machine.boughtFor !== undefined
          ? ' <span class="muted small">— bought for <span class="num">' + esc(fm(j.machine.boughtFor)) + '</span></span>' : '');
      if (has('getMachineParts')) {
        var mparts = arr(tryCall(function () { return Engine.getMachineParts(j.id); }));
        if (mparts.length) {
          h += '<div class="machine-parts">';
          mparts.forEach(function (p) {
            var stt = p.status === 'ok' ? 'ok' : (p.status === 'faulty' ? 'faulty' : 'unknown');
            h += '<div class="mp-row">' +
              '<span class="mp-status ' + stt + '">' + (stt === 'ok' ? 'OK' : (stt === 'faulty' ? 'FAULTY' : '?')) + '</span>' +
              '<span>' + esc(p.name) + '</span>' +
              '<span class="muted small">' + esc(p.category ? catLabel(p.category) : '') + '</span>' +
              (p.value !== null && p.value !== undefined ? '<span class="num muted small">' + esc(fm(p.value)) + '</span>' : '') +
              '</div>';
          });
          h += '</div>';
        }
      }
      h += '</div>';
    }

    /* needs part-picker (§12.4: device repairs never source catalog parts) */
    if (!isDevice && !diagFallback && !buildPending && j.needs && j.needs.length) {
      h += needsHTML(j);
    }

    /* build configurator */
    if (j.build) {
      if (buildPending) h += buildCfgHTML(j);
      else h += '<div class="note">Build spec locked in and parts sourced — work the job to assemble it.</div>';
    }

    /* actions */
    h += '<div class="job-actions">';
    var hourAttr = noHours
      ? ' disabled title="Too exhausted — call it a day"'
      : (otWarn ? ' title="You are into overtime — tomorrow starts short"' : '');
    if (diagFallback) {
      /* §11.3 fallback only — with steps, diagnosing IS working the checklist */
      h += '<button type="button" class="btn btn-primary btn-sm" data-action="diagnose" data-job="' + j.id + '"' +
        hourAttr + '>Diagnose</button>';
    }
    if (ready && isRefurb) {
      h += '<button type="button" class="btn btn-primary btn-sm" data-action="sell-refurb" data-job="' + j.id + '">Sell machine</button>';
    } else if (!diagFallback && !buildPending) {
      /* §14.8 — four graduated work controls, smallest to largest. "Finish
       * Step" needs a discrete current step to aim at; grey it out (with a
       * reason) when there isn't one. */
      var hasCurStep = currentStepIndex(j) >= 0;
      var tinkerAttr = hourAttr || ' title="Work just 6 minutes — the smallest useful nudge"';
      var stepAttr = !hasCurStep
        ? ' disabled title="No discrete step in progress right now"'
        : (hourAttr || ' title="Work until the current step is done"');
      var jobAttr = hourAttr || ' title="Work until the job is finished (or you run out of useful hours)"';
      h += '<button type="button" class="btn btn-sm" data-action="work-tinker" data-job="' + j.id + '"' +
        tinkerAttr + '>Tinker (6 min)</button>' +
        '<button type="button" class="btn btn-sm" data-action="work-step" data-job="' + j.id + '"' +
        stepAttr + '>Finish Step</button>' +
        '<button type="button" class="btn btn-sm" data-action="work-hour" data-job="' + j.id + '"' +
        hourAttr + '>Work 1 Hour</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="work-job" data-job="' + j.id + '"' +
        jobAttr + '>Finish Job</button>';
    }
    if (isRefurb) {
      h += '<button type="button" class="btn btn-sm btn-ghost" data-action="appraise" data-job="' + j.id + '">Appraise</button>';
    }
    /* §9.5: refurbs get Strip for Parts instead of Abandon (fallback to
     * Abandon while the engine API is still landing). */
    if (isRefurb && has('stripRefurb')) {
      h += '<button type="button" class="btn btn-sm btn-ghost" data-action="strip" data-job="' + j.id + '" title="1.5h — working parts roll into inventory">Strip for Parts</button>';
    } else {
      h += '<button type="button" class="btn btn-sm btn-ghost" data-action="abandon" data-job="' + j.id + '">Abandon</button>';
    }
    h += '</div></div>';
    return h;
  }

  function speedOpt(j, val, label) {
    return '<option value="' + val + '"' + (j.speed === val ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  /* §10.1/§11.3/§11.6 — step checklist: ✓ done, ▶ current (partial %),
   * ○ pending, ⏲ wait steps, plus the post-diagnosis placeholder row. */
  var WAIT_TIP = 'Timed step: 0.1h to set it running, then it advances alongside any other ' +
    'work (or Wait 1h) and finishes free overnight. Blocks only this job.';

  /** Index of the job's current (first not-done) step, or -1 if there is
   * none (no steps, or all done). Shared by the checklist render and the
   * §14.8 "Finish Step" control (which needs to know if there is one). */
  function currentStepIndex(j) {
    var steps = j && j.steps;
    if (!steps || !steps.length) return -1;
    var cur = (typeof j.stepIndex === 'number') ? j.stepIndex : -1;
    if (cur < 0 || cur >= steps.length || steps[cur].done) {
      cur = -1;
      for (var k = 0; k < steps.length; k++) { if (!steps[k].done) { cur = k; break; } }
    }
    return cur;
  }
  /** §14.8 — remaining hours on the job's current step (rounded to the
   * engine's 0.1h grid), or null when there is no discrete current step —
   * the numeric-fallback amount for "Finish Step" on an engine that does
   * not understand the "step" workJob mode yet. */
  function currentStepRemainingHours(j) {
    var idx = currentStepIndex(j);
    if (idx < 0) return null;
    var s = j.steps[idx];
    var hrs = Number(s.hours);
    if (!isFinite(hrs) || hrs <= 0) return null;
    var p = Math.max(0, Math.min(1, Number(s.progress) || 0));
    var rem = Math.round(hrs * (1 - p) * 10) / 10;
    return rem > 0 ? rem : null;
  }

  function stepsHTML(j) {
    var steps = j.steps;
    var cur = currentStepIndex(j);
    var h = '<div class="steps">';
    steps.forEach(function (s, i) {
      var done = !!s.done;
      var isCur = !done && i === cur;
      var isWait = s.kind === 'wait';
      var running = UI.isWaitStepRunning(s);
      var cls = (done ? 'st-done' : (isCur ? 'st-cur' : 'st-pend')) +
        (isWait ? ' st-wait' : '') + (running ? ' st-running' : '');
      var ico = done ? '✓' : (running ? '⏲' : (isCur ? '▶' : '○'));
      var pct = ((isCur || running) && s.progress) ? Math.round(Math.max(0, Math.min(1, s.progress)) * 100) : 0;
      h += '<div class="step ' + cls + '">' +
        '<span class="st-ico">' + ico + '</span>' +
        '<span class="st-label">' + esc(s.label) + '</span>' +
        (isWait && !done
          ? ' <span class="wait-badge" title="' + esc(WAIT_TIP) + '">⏲ ' + (running ? 'running' : 'wait') + '</span>' +
            (running ? '<span class="muted small"> runs while you work on other jobs</span>' : '')
          : '') +
        (pct > 0 ? UI.barHTML(pct, 100) + '<span class="st-pct">' + pct + '%</span>' : '') +
        (s.hours !== undefined && s.hours !== null ? '<span class="st-hours">' + fmtHours(s.hours) + 'h</span>' : '') +
        '</div>';
    });
    /* §11.3 — pre-diagnosis (new flow only): the checklist knows just the
     * diagnose phase so far. Pre-0.4 engines list every step up front. */
    if (j.needsDiagnosis && !j.diagnosed && engineV() >= 0.4) {
      h += '<div class="step st-placeholder"><span class="st-ico">○</span>' +
        '<span class="st-label">…further steps revealed after diagnosis</span></div>';
    }
    return h + '</div>';
  }

  /* §11.6 helpers */
  function findRunningWaitStep(j) {
    var steps = j && j.steps;
    if (!steps) return null;
    for (var i = 0; i < steps.length; i++) {
      if (UI.isWaitStepRunning(steps[i])) return steps[i];
    }
    return null;
  }
  function waitRemainingHours(s) {
    var hrs = Number(s.hours);
    if (!isFinite(hrs) || hrs <= 0) return null;
    var p = Math.max(0, Math.min(1, Number(s.progress) || 0));
    return Math.round(hrs * (1 - p) * 10) / 10;
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

  /** Resolve a part id to a display name (best effort, engine-first). */
  function partNameOf(partId) {
    if (has('getPartInfo')) {
      var r = tryCall(function () { return Engine.getPartInfo(partId); });
      if (r && r.ok !== false && r.name) return r.name;
    }
    return partId;
  }

  /** Look up a live active job by id (best effort — null if the engine
   * isn't ready or the job isn't active). Shared by the schematic slot
   * picker and the §14.8 graduated work controls' "Finish Step" fallback. */
  function activeJobById(jobId) {
    var found = null;
    try {
      (Engine.getActiveJobs() || []).forEach(function (x) { if (x.id === jobId) found = x; });
    } catch (e) { /* ignore */ }
    return found;
  }

  /* §10.3/§10.4/§14.2 — needs picker: assign/unassign, replaces + graded
   * overspend + vs-original cue. Below-original options in an upgrade stay
   * disabled with a reason (assignPart already enforces this server-side;
   * the picker just needs to say so plainly). */
  function needsHTML(j) {
    var needs = tryCall(function () { return Engine.getJobNeeds(j.id); });
    if (!Array.isArray(needs) || !needs.length) return '';
    var anyUnassigned = false;
    needs.forEach(function (n) { if ((n.filled || 0) < (n.qty || 1)) anyUnassigned = true; });
    var canUnassign = has('unassignPart');
    var isUpgradeJob = (j.type === 'upgrade' || j.subtype === 'contract_upgrade'); // §14.2 wording

    var h = '<div class="needs' + (anyUnassigned ? ' attention' : '') + '" id="needs-' + j.id + '">' +
      '<div class="sub-title">Parts needed' + (anyUnassigned ? ' — assign a part to continue' : '') + '</div>';

    needs.forEach(function (n) {
      var qty = n.qty || 1;
      var filledAll = (n.filled || 0) >= qty;
      h += '<div class="need-row' + (filledAll ? ' done' : '') + '">' +
        '<span class="need-label">' + esc(n.label || catLabel(n.category)) +
        (qty > 1 ? ' <span class="muted">(' + (n.filled || 0) + '/' + qty + ')</span>' : '') + '</span>';

      /* assigned entries (engine may expose n.assigned; fall back to the
       * job's raw filledPartIds) */
      var jn = (j.needs && j.needs[n.index]) || {};
      var assigned = Array.isArray(n.assigned) ? n.assigned : (jn.filledPartIds || []);
      assigned.forEach(function (ap) {
        var apId = (ap && typeof ap === 'object') ? ap.partId : ap;
        var apName = (ap && typeof ap === 'object' && ap.name) ? ap.name : partNameOf(apId);
        h += '<span class="assigned-row"><span class="ok-mark">✓</span> ' + esc(apName) +
          ' <span class="muted small">' + (canUnassign ? 'assigned — installs at its step' : 'installed') + '</span>' +
          (canUnassign
            ? ' <button type="button" class="btn btn-sm btn-ghost" data-action="unassign" data-job="' + j.id +
              '" data-need="' + n.index + '" data-part="' + esc(apId) + '">Unassign</button>'
            : '') +
          '</span>';
      });

      if (!filledAll) {
        if (!n.options || !n.options.length) {
          h += '<span class="muted">No compatible part available right now — check back after prices refresh.</span>';
        } else {
          var selId = 'need-sel-' + j.id + '-' + n.index;
          h += '<select class="sel" id="' + selId + '">';
          n.options.forEach(function (o) {
            var below = o.meets === false;                       // §9.3
            var ovKind = overspendKind(o);                        // §14.2 graded
            var vs = vsOriginalOf(o);                             // §14.2 vs-original cue
            var belowReason = isUpgradeJob ? 'below the current part' : 'below spec';
            var label = overspendPrefix(ovKind) +                // §10.4/§14.2
              (o.tasteMatch ? '♥ ' : '') + o.name +              // §9.2
              ' — ' + fm(o.price) +
              (o.source === 'inventory' ? ' (in stock)' : ' (order from market)') +
              (vs ? ' — ' + vsOriginalText(vs) : '') +
              (below ? ' — ' + belowReason : '');
            var repTxt = (o.replaces && o.replaces.name)
              ? o.replaces.name + ' · ~' + fm(o.replaces.value)
              : (n.replaces && n.replaces.name ? n.replaces.name + ' · ~' + fm(n.replaces.value) : '');
            h += '<option value="' + esc(o.partId) + '"' + (below ? ' disabled title="' + esc(belowReason) + '"' : '') +
              ' data-source="' + esc(o.source || 'market') + '"' +
              ' data-overspend-kind="' + esc(ovKind || '') + '"' +
              (repTxt ? ' data-replaces="' + esc(repTxt) + '"' : '') +
              (vs ? ' data-vs-cue="' + esc(vs.cmp) + '" data-vs-label="' + esc(vs.origLabel || '') +
                '" data-vs-new="' + esc(vs.newLabel || '') + '"' : '') +
              '>' + esc(label) + '</option>';
          });
          h += '</select>' +
            (has('getPartInfo')
              ? '<button type="button" class="info-btn" data-action="partinfo" data-from-select="' + selId + '" title="Part details">i</button>'
              : '') +
            '<button type="button" class="btn btn-primary btn-sm" id="need-btn-' + j.id + '-' + n.index +
              '" data-action="install" data-job="' + j.id + '" data-need="' + n.index + '">Assign</button>';
          if (hasTasteOption(n.options)) {
            h += '<span class="taste-hit small" title="Matches the customer\'s taste for bonus pay">♥ = customer favorite</span>';
          }
          h += '<span class="need-meta" id="need-meta-' + j.id + '-' + n.index + '" hidden></span>';
        }
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  /** Sync a need picker's button label + replaces/vs-original/overspend meta
   * line with its currently selected option (§10.3/§10.4/§14.2). */
  function updateNeedRowUI(sel) {
    var m = /^need-sel-(\d+)-(\d+)$/.exec(sel.id || '');
    if (!m) return;
    var opt = sel.options[sel.selectedIndex];
    var btn = document.getElementById('need-btn-' + m[1] + '-' + m[2]);
    if (btn) {
      var src = opt ? opt.getAttribute('data-source') : null;
      btn.textContent = src === 'inventory' ? 'Assign from Stock' : 'Order & Assign';
    }
    var meta = document.getElementById('need-meta-' + m[1] + '-' + m[2]);
    if (meta) {
      var bits = [];
      var rep = opt ? opt.getAttribute('data-replaces') : null;
      if (rep) bits.push('replaces ' + esc(rep));
      var vsCmp = opt ? opt.getAttribute('data-vs-cue') : null;
      if (vsCmp) {
        bits.push(vsOriginalHTML({
          cmp: vsCmp,
          origLabel: opt.getAttribute('data-vs-label') || '',
          newLabel: opt.getAttribute('data-vs-new') || ''
        }));
      }
      var ovChip = overspendChipHTML(opt ? opt.getAttribute('data-overspend-kind') : null);
      if (ovChip) bits.push(ovChip);
      meta.innerHTML = bits.join(' &nbsp;·&nbsp; ');
      meta.hidden = !bits.length;
    }
  }

  function hasTasteOption(options) {
    for (var i = 0; i < options.length; i++) {
      if (options[i] && options[i].tasteMatch) return true;
    }
    return false;
  }

  /* ---- custom build configurator ----
   * §12.5 graphical schematic when the engine ships slotCount data;
   * the original per-category select list remains the fallback. */

  var BUILD_ORDER = ['motherboard', 'cpu', 'ram', 'storage', 'gpu', 'psu', 'case', 'cooling', 'os', 'peripheral'];

  /** §12.2 — normalize a getBuildCatalog category across engine versions:
   * pre-0.4b it is a plain options array; 0.4b+ {slotCount, selected,
   * options} (arrays carrying extra props are tolerated too). */
  function catInfo(bc, c) {
    var raw = bc.categories[c];
    if (!raw) return null;
    if (Array.isArray(raw)) {
      return {
        options: raw,
        slotCount: (typeof raw.slotCount === 'number') ? raw.slotCount : null,
        selected: Array.isArray(raw.selected) ? raw.selected : null
      };
    }
    return {
      options: arr(raw.options),
      slotCount: (typeof raw.slotCount === 'number') ? raw.slotCount : null,
      selected: Array.isArray(raw.selected) ? raw.selected : null
    };
  }

  /** Selected part id per slot for a category — engine's `selected` when
   * present, else derived from job.build.parts (v5 object / legacy array). */
  function selectedSlots(j, bc, c) {
    var info = catInfo(bc, c);
    if (info && info.selected) return info.selected.slice();
    var bp = j.build && j.build.parts;
    if (bp && !Array.isArray(bp) && typeof bp === 'object') {
      return arr(bp[c]).slice();
    }
    var out = [null];
    if (info) {
      var flat = arr(bp);
      info.options.forEach(function (o) {
        if (flat.indexOf(o.partId) !== -1) out[0] = o.partId;
      });
    }
    return out;
  }

  function schematicReady(bc) {
    var probe = ['motherboard', 'cpu', 'ram', 'gpu', 'storage'];
    for (var i = 0; i < probe.length; i++) {
      var info = catInfo(bc, probe[i]);
      if (info && info.slotCount !== null) return true;
    }
    return false;
  }

  /* §12.5 — map validateBuild problem strings onto slot categories.
   * Ordered; first matching rule wins per problem (so "2 DIMM slots"
   * lands on ram, not the generic slot/board rule). */
  var PROBLEM_SLOT_RULES = [
    [/dimm|\bram\b|memory|stick/i, 'ram'],
    [/socket|\bcpu\b|processor/i, 'cpu'],
    [/gpu|video|graphics|sli|crossfire|voodoo|x16|2d card/i, 'gpu'],
    [/watt|psu|power/i, 'psu'],
    [/form factor|case/i, 'case'],
    [/storage|drive|disk|\bide\b|sata|nvme/i, 'storage'],
    [/operating system|\bos\b|arch/i, 'os'],
    [/cool/i, 'cooling'],
    [/expansion|sound|network|modem/i, 'expansion'],
    [/motherboard|board|slot/i, 'motherboard']
  ];
  function problemsByCat(problems) {
    var out = {};
    arr(problems).forEach(function (p) {
      for (var i = 0; i < PROBLEM_SLOT_RULES.length; i++) {
        if (PROBLEM_SLOT_RULES[i][0].test(p)) {
          var c = PROBLEM_SLOT_RULES[i][1];
          (out[c] = out[c] || []).push(p);
          return;
        }
      }
    });
    return out;
  }

  function shortName(n) {
    n = String(n || '');
    return n.length > 20 ? n.slice(0, 19) + '…' : n;
  }

  function buildCfgHTML(j) {
    var bc = tryCall(function () { return Engine.getBuildCatalog(j.id); });
    if (!bc || bc.ok === false || !bc.categories) {
      return '<div class="note">Build catalog unavailable.</div>';
    }
    var v = tryCall(function () { return Engine.validateBuild(j.id); });
    if (v && v.ok === false) v = null;

    var b = j.build || {};
    var mp = b.minPerf || {};
    var h = '<div class="build-cfg"><div class="sub-title">Build configurator</div>';

    /* target line */
    h += '<div class="meta-row muted small">' +
      (b.useCase ? '<span class="chip">' + esc(b.useCase) + '</span>' : '') +
      '<span>Budget <b class="num">' + esc(fm(b.budget)) + '</b></span>' +
      (mp.cpu ? '<span>CPU ≥ ' + esc(mp.cpu) + '</span>' : '') +
      (mp.gpu ? '<span>GPU ≥ ' + esc(mp.gpu) + '</span>' : '') +
      (mp.ramMB ? '<span>RAM ≥ ' + esc(mp.ramMB) + ' MB</span>' : '') +
      (mp.storageGB ? '<span>Storage ≥ ' + esc(mp.storageGB) + ' GB</span>' : '') +
      (b.minStyle ? '<span>Style ≥ ' + esc(b.minStyle) + '</span>' : '') +
      '</div>';

    if (schematicReady(bc)) h += schematicHTML(j, bc, v);
    else h += selectListHTML(j, bc);

    h += valPanelHTML(j, v, mp, b);
    return h + '</div>';
  }

  /* ---- fallback: the classic per-category select list ---- */
  function selectListHTML(j, bc) {
    var selected = {};
    Object.keys(bc.categories).forEach(function (c) {
      var sel = selectedSlots(j, bc, c);
      if (sel && sel[0]) selected[c] = sel[0];
    });
    var cats = BUILD_ORDER.filter(function (c) { return bc.categories[c]; });
    Object.keys(bc.categories).forEach(function (c) {
      if (cats.indexOf(c) === -1) cats.push(c);
    });

    var h = '<div class="build-grid">';
    var infoOk = has('getPartInfo');
    cats.forEach(function (c) {
      var selId = 'build-sel-' + j.id + '-' + c;
      var info = catInfo(bc, c);
      h += '<span class="build-lbl">' + esc(catLabel(c)) + '</span>' +
        '<span class="need-row">' +
        '<select id="' + selId + '" data-action="buildpart" data-job="' + j.id + '" data-cat="' + esc(c) + '">' +
        '<option value="">— none —</option>';
      (info ? info.options : []).forEach(function (o) {
        var ovKind = overspendKind(o);   // §14.2 — build parts rarely carry this (no "original"), but degrade cleanly
        var vs = vsOriginalOf(o);
        var label = overspendPrefix(ovKind) + (o.tasteMatch ? '♥ ' : '') + o.name + ' — ' + fm(o.price) +
          (o.inStock ? ' (in stock)' : '') + (vs ? ' — ' + vsOriginalText(vs) : '');
        if (o.compatible === false) {
          label = '✕ ' + label + (o.why ? ' — ' + o.why : '');
        }
        h += '<option value="' + esc(o.partId) + '"' + (selected[c] === o.partId ? ' selected' : '') + '>' +
          esc(label) + '</option>';
      });
      h += '</select>' +
        (infoOk ? '<button type="button" class="info-btn" data-action="partinfo" data-from-select="' + selId + '" title="Part details">i</button>' : '') +
        '</span>';
    });
    return h + '</div>';
  }

  /* ---- §12.5: the motherboard schematic ---- */
  var SCHEMATIC_ZONES = ['motherboard', 'cpu', 'ram', 'gpu', 'storage'];
  var BAY_ORDER = ['psu', 'case', 'cooling', 'os'];

  function schematicHTML(j, bc, v) {
    var probs = problemsByCat(v ? v.problems : []);
    var moboSel = selectedSlots(j, bc, 'motherboard');
    var boardChosen = !!(moboSel && moboSel[0]);
    var moboInfo = catInfo(bc, 'motherboard');

    var h = '<div class="mobo-wrap">';

    /* board first — a dropdown, same handler as the fallback list */
    var selId = 'build-sel-' + j.id + '-motherboard';
    h += '<div class="mobo-boardpick' + (probs.motherboard ? ' has-bad' : '') + '">' +
      '<label class="build-lbl" for="' + selId + '">Motherboard</label>' +
      '<select id="' + selId + '" data-action="buildpart" data-job="' + j.id + '" data-cat="motherboard">' +
      '<option value="">— choose a board first —</option>';
    (moboInfo ? moboInfo.options : []).forEach(function (o) {
      var label = (o.tasteMatch ? '♥ ' : '') + o.name + ' — ' + fm(o.price) + (o.inStock ? ' (in stock)' : '');
      if (o.compatible === false) label = '✕ ' + label + (o.why ? ' — ' + o.why : '');
      h += '<option value="' + esc(o.partId) + '"' + (moboSel[0] === o.partId ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    h += '</select>' +
      (has('getPartInfo') ? '<button type="button" class="info-btn" data-action="partinfo" data-from-select="' + selId + '" title="Board details">i</button>' : '') +
      (probs.motherboard ? '<span class="down small">' + esc(probs.motherboard.join(' • ')) + '</span>' : '') +
      '</div>';

    if (!boardChosen) {
      return h + '<div class="note">Pick a motherboard to lay out its socket and slots.</div></div>';
    }

    h += '<div class="mobo-board" role="group" aria-label="Motherboard layout — every slot is a button">' +
      slotZone(j, bc, probs, 'cpu', 'zone-cpu') +
      slotZone(j, bc, probs, 'ram', 'zone-ram') +
      slotZone(j, bc, probs, 'storage', 'zone-drives') +
      slotZone(j, bc, probs, 'gpu', 'zone-gpu') +
      '</div>';

    /* surrounding bays: single-slot categories + anything new (expansion…) */
    var bays = BAY_ORDER.slice();
    Object.keys(bc.categories).forEach(function (c) {
      if (SCHEMATIC_ZONES.indexOf(c) === -1 && bays.indexOf(c) === -1) bays.push(c);
    });
    var bh = '';
    bays.forEach(function (c) { bh += slotZone(j, bc, probs, c, 'zone-bay'); });
    if (bh) h += '<div class="mobo-bays">' + bh + '</div>';

    return h + '</div>';
  }

  function slotZone(j, bc, probs, cat, zoneCls) {
    var info = catInfo(bc, cat);
    if (!info) return '';
    var count = (info.slotCount === null || info.slotCount === undefined) ? 1 : info.slotCount;
    if (count <= 0) return '';
    if (count > 16) count = 16; // sanity guard for pre-migration defaults (99)
    var sel = selectedSlots(j, bc, cat);
    var probList = probs[cat] || null;
    var redAll = !!(probList && !sel.some(function (x) { return !!x; }));

    var h = '<div class="mobo-zone ' + zoneCls + '">' +
      '<span class="zone-label">' + esc(catLabel(cat)) + (count > 1 ? ' <span class="muted">×' + count + '</span>' : '') + '</span>' +
      '<div class="zone-slots">';
    for (var i = 0; i < count; i++) {
      h += slotBtnHTML(j, cat, i, sel[i] || null, info, probList, redAll, count);
    }
    return h + '</div></div>';
  }

  function slotBtnHTML(j, cat, idx, pid, info, probList, redAll, count) {
    var opt = null;
    if (pid) {
      info.options.forEach(function (o) { if (o.partId === pid) opt = o; });
    }
    var state = '';
    var tip = catLabel(cat) + (count > 1 ? ' slot ' + (idx + 1) : '') + ' — click to choose a part';
    if (probList && (pid || redAll)) {
      state = 'bad';
      tip = probList.join(' • ');
    } else if (pid) {
      if (opt && opt.meets === false) {
        state = 'warn';
        tip = (opt.name || pid) + ' — below this job’s spec. Click to change.';
      } else {
        state = 'ok';
        tip = (opt ? opt.name + ' — ' + fm(opt.price) : pid) + '. Click to change or empty the slot.';
      }
    }
    var inner = pid
      ? '<span class="slot-chip">' + esc(shortName(opt ? opt.name : pid)) + '</span>'
      : '<span class="slot-plus">+</span>';
    return '<button type="button" class="slot slot-' + esc(cat) + (state ? ' ' + state : '') +
      '" data-action="slot-pick" data-job="' + j.id + '" data-cat="' + esc(cat) +
      '" data-slot="' + idx + '" title="' + esc(tip) + '" aria-label="' + esc(catLabel(cat) + ' slot ' + (idx + 1)) + '">' +
      inner + '</button>';
  }

  /** §12.5 — slot part-picker popover (modal; its listeners die with it). */
  function openSlotPicker(jobId, cat, slotIndex) {
    var bc = tryCall(function () { return Engine.getBuildCatalog(jobId); });
    if (!bc || bc.ok === false || !bc.categories) { UI.toast('Build catalog unavailable', 'error'); return; }
    var info = catInfo(bc, cat);
    if (!info) return;
    var j = activeJobById(jobId);
    var sel = j ? selectedSlots(j, bc, cat) : [];
    var current = sel[slotIndex] || null;
    var infoOk = has('getPartInfo');

    var body = '<div class="slot-picker">';
    if (current) {
      body += '<div class="picker-line"><button type="button" class="picker-row picker-remove" data-pick="">' +
        '<span class="pr-name">— Empty this slot —</span>' +
        '<span class="pr-meta muted small">the part goes back on the list</span></button></div>';
    }
    if (!info.options.length) {
      body += '<div class="empty">Nothing compatible is on the market right now.</div>';
    }
    info.options.forEach(function (o) {
      var incompat = o.compatible === false;
      var below = o.meets === false;
      var vs = vsOriginalOf(o);              // §14.2 vs-original cue
      var ovKind = overspendKind(o);          // §14.2 graded overspend
      body += '<div class="picker-line">' +
        '<button type="button" class="picker-row' + (incompat ? ' incompat' : '') +
          (o.partId === current ? ' current' : '') + '"' + (incompat ? ' disabled' : '') +
          ' data-pick="' + esc(o.partId) + '">' +
          '<span class="pr-name">' + (o.tasteMatch ? '<span class="taste-hit" title="Customer favorite — bonus pay">♥</span> ' : '') +
            esc(o.name) + (o.partId === current ? ' <span class="muted small">(current)</span>' : '') + '</span>' +
          '<span class="pr-meta num">' + esc(fm(o.price)) +
            (o.inStock ? ' · in stock' : ' · order') +
            (o.perf ? ' · ' + esc(perfStr(o.perf)) : '') + '</span>' +
          (vs ? vsOriginalHTML(vs) : '') +
          overspendChipHTML(ovKind) +
          (below ? ' <span class="badge b-warn" title="Below this job’s minimum spec">below spec</span>' : '') +
          (incompat ? '<span class="pr-why">✕ ' + esc(o.why || 'Incompatible with this build') + '</span>' : '') +
        '</button>' +
        (infoOk ? '<button type="button" class="info-btn pr-info" data-pi="' + esc(o.partId) + '" title="Part details">i</button>' : '') +
        '</div>';
    });
    body += '</div>';

    var modal = UI.modal({
      title: catLabel(cat) + ((info.slotCount || 1) > 1 ? ' — slot ' + (slotIndex + 1) : ''),
      html: body,
      buttons: [{ label: 'Cancel', cls: 'btn' }]
    });
    if (!modal) return;
    modal.el.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var pi = t.closest('[data-pi]');
      if (pi) { showPartInfo(pi.getAttribute('data-pi')); return; }
      var row = t.closest('[data-pick]');
      if (!row || row.disabled) return;
      var pid = row.getAttribute('data-pick') || null;
      modal.close();
      UI.act(function () { return Engine.setBuildPart(jobId, cat, pid, slotIndex); }); // §12.2 slot-indexed
    });
  }

  /* ---- shared: problems / perf-vs-target / budget / commit ---- */
  function valPanelHTML(j, v, mp, b) {
    var h = '';
    if (v) {
      h += '<div class="build-val">';
      if (v.problems && v.problems.length) {
        h += '<ul class="problems">';
        v.problems.forEach(function (p) { h += '<li>' + esc(p) + '</li>'; });
        h += '</ul>';
      } else {
        h += '<div class="ok-mark">✓ No compatibility problems</div>';
      }

      var perf = v.perf || {};
      h += '<div class="perf-grid">' +
        perfCell('CPU', perf.cpu, mp.cpu) +
        perfCell('GPU', perf.gpu, mp.gpu) +
        perfCell('RAM (MB)', perf.ramMB, mp.ramMB) +
        perfCell('Storage (GB)', perf.storageGB, mp.storageGB) +
        '<div class="perf-cell' + (v.meetsTarget ? ' ok' : ' short') + '"><span class="muted small">Overall</span>' +
          '<b>' + (perf.composite !== null && perf.composite !== undefined ? Number(perf.composite).toFixed(2) : '—') +
          (v.meetsTarget ? ' ✓ meets target' : ' — below target') + '</b></div>' +
        (b.minStyle ? '<div class="perf-cell' + ((v.style || 0) >= b.minStyle ? ' ok' : ' short') + '">' +
          '<span class="muted small">Style</span><b>' + esc(v.style !== undefined ? v.style : '—') + ' / ' + esc(b.minStyle) + '</b></div>' : '') +
        '</div>';

      var over = !v.underBudget && (Number(v.partsCost) || 0) > (Number(v.budget) || 0);
      h += '<div class="bar-row"><span class="muted small">Parts cost</span>' +
        UI.barHTML(v.partsCost, v.budget, 'wide' + (over ? ' over' : '')) +
        '<span class="num small' + (over ? ' down' : '') + '">' + esc(fm(v.partsCost)) + ' of ' + esc(fm(v.budget)) + ' budget' +
        (over ? ' — OVER (eats your profit)' : '') + '</span></div>';

      h += '<div class="job-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="commit-build" data-job="' + j.id + '"' +
        (v.valid ? '' : ' disabled title="Fix the problems listed above first"') +
        '>Commit build (buy parts)</button>' +
        '</div></div>';
    } else {
      h += '<div class="job-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="commit-build" data-job="' + j.id + '">Commit build (buy parts)</button>' +
        '</div>';
    }
    return h;
  }

  function perfCell(label, val, target) {
    if (!target) return '';
    var ok = (Number(val) || 0) >= Number(target);
    var shown = (val === null || val === undefined) ? '—' : val;
    return '<div class="perf-cell' + (ok ? ' ok' : ' short') + '">' +
      '<span class="muted small">' + esc(label) + '</span>' +
      '<b class="num">' + esc(shown) + ' / ' + esc(target) + '</b></div>';
  }

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
          (qty > 1 ? '<button type="button" class="btn btn-sm" data-action="sell-part" data-part="' + esc(it.partId) + '" data-qty="' + qty + '">Sell all</button>' : '') +
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
            '<button type="button" class="btn btn-sm" data-action="buy" data-part="' + esc(r.partId) + '" data-qty="1">Buy 1</button> ' +
            '<button type="button" class="btn btn-sm" data-action="buy" data-part="' + esc(r.partId) + '" data-qty="5">Buy 5</button>' +
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

  /* ================================================================== *
   * TAB: Wiki (§9.7) — the education layer
   * ================================================================== */

  /** Compact human string for a perf object. */
  function perfStr(perf) {
    if (!perf) return '';
    var bits = [];
    if (perf.cpu !== undefined) bits.push('CPU ' + perf.cpu);
    if (perf.gpu !== undefined) bits.push('GPU ' + perf.gpu);
    if (perf.ramMB !== undefined) bits.push(perf.ramMB + ' MB');
    if (perf.storageGB !== undefined) bits.push(perf.storageGB + ' GB');
    if (perf.speed !== undefined) bits.push('speed ' + perf.speed);
    if (perf.cool !== undefined) bits.push('cooling ' + perf.cool);
    return bits.join(' · ');
  }

  function statusChip(status) {
    if (!status) return '';
    return '<span class="status-chip s-' + esc(status) + '">' + esc(status) + '</span>';
  }

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

  /* ================================================================== *
   * TAB: Shop
   * ================================================================== */

  /** §14.5 — "Unlocks: …" badge label for equipment that gates a job type.
   * The DATA agent added an optional `unlocksLabel` string to the gating
   * DATA.EQUIPMENT items (build-bench/software-station/dr-rig-1..3); items
   * that are just speed/mitigation perks (crt-kit, imaging-kit, …) have
   * none, so no badge. Prefer the field straight off the getShopView()
   * entry (in case the engine ever passes it through); else fall back to a
   * DATA.EQUIPMENT lookup by id. Never invents a label of its own. */
  function equipUnlockLabel(eq) {
    if (eq && typeof eq.unlocksLabel === 'string' && eq.unlocksLabel) return eq.unlocksLabel;
    try {
      var list = window.DATA && DATA.EQUIPMENT;
      if (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === eq.id) return list[i].unlocksLabel || null;
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function renderShop(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var sv = tryCall(function () { return Engine.getShopView(); });
    if (!sv || sv.ok === false) { panel.innerHTML = emptyBox('Shop data unavailable.'); return; }

    /* §10.7/§13.4 — compute these once up front so the sub-nav only offers
     * links to sections that will actually render below. */
    var stv = has('getStaffView') ? tryCall(function () { return Engine.getStaffView(); }) : null;
    var showStaff = !!(stv && stv.ok !== false);
    var tv = has('getCertifications') ? tryCall(function () { return Engine.getCertifications(); }) : null;
    var showTraining = !!(tv && tv.ok !== false);

    var html = '<h2 class="section-title">Your Shop</h2>';

    /* §14.5 — small sub-nav so nothing here requires blind scrolling. */
    html += '<nav class="shop-subnav" aria-label="Jump to a shop section">' +
      '<button type="button" class="btn btn-sm" data-action="scrollto" data-target="shop-sec-upgrade">Shop Upgrade</button>' +
      '<button type="button" class="btn btn-sm" data-action="scrollto" data-target="shop-sec-equipment">Equipment</button>' +
      (showTraining ? '<button type="button" class="btn btn-sm" data-action="scrollto" data-target="shop-sec-training">Training</button>' : '') +
      (showStaff ? '<button type="button" class="btn btn-sm" data-action="scrollto" data-target="shop-sec-staff">Staff</button>' : '') +
      '</nav>';

    /* §14.5 — surface the Assembly Bench prominently: custom builds are
     * era-available (state.customBuildsUnlocked) but the bench isn't owned
     * yet, so the payoff of buying it is obvious at a glance. */
    var equipmentList = arr(sv.equipment);
    var bench = null;
    for (var bi = 0; bi < equipmentList.length; bi++) { if (equipmentList[bi].id === 'build-bench') bench = equipmentList[bi]; }
    if (st.customBuildsUnlocked && bench && !bench.owned) {
      html += '<div class="card unlock-callout">' +
        '<div class="card-title">🔓 Custom builds are ready to unlock</div>' +
        '<p class="muted small">The era supports custom-build jobs now — you are just missing the bench. Buy the <b>' +
          esc(bench.name) + '</b> to start taking them.</p>' +
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="buy-equip" data-id="' + esc(bench.id) + '"' +
            (bench.available === false ? ' disabled title="Not available yet"' : '') +
            '>Buy — ' + esc(fm(bench.cost)) + '</button>' +
          ' <button type="button" class="btn btn-sm btn-ghost" data-action="scrollto" data-target="shop-sec-equipment">See all equipment</button>' +
        '</div></div>';
    }

    html += '<h2 class="section-title" id="shop-sec-upgrade">Shop Tier &amp; Upgrade</h2><div class="shop-grid">';

    /* current tier */
    var tier = sv.tier || {};
    html += '<div class="card">' +
      '<div class="card-title">' + esc(tier.name || 'Shop') + '</div>' +
      (tier.desc ? '<p class="muted small">' + esc(tier.desc) + '</p>' : '') +
      '<div class="meta-row small">' +
        (tier.workstationSlots !== undefined ? '<span class="chip">' + esc(tier.workstationSlots) + ' workstations</span>' : '') +
        (tier.storageSlots !== undefined ? '<span class="chip">' + esc(tier.storageSlots) + ' storage slots</span>' : '') +
        (tier.offerBonus ? '<span class="chip">+' + esc(tier.offerBonus) + ' daily offers</span>' : '') +
      '</div></div>';

    /* upgrade */
    if (sv.nextTier) {
      var nt = sv.nextTier;
      var blocked = [];
      if (nt.prestigeOk === false) blocked.push('Requires prestige tier ' + nt.minPrestige);
      if (nt.canAfford === false) blocked.push('Not enough cash');
      html += '<div class="card">' +
        '<div class="card-title">Upgrade: ' + esc(nt.name) + '</div>' +
        '<div class="meta-row"><span class="pay num">' + esc(fm(nt.cost)) + '</span>' +
          (nt.minPrestige ? '<span class="chip">Prestige tier ' + esc(nt.minPrestige) + '+ required</span>' : '') +
        '</div>' +
        (blocked.length ? '<div class="muted small">' + esc(blocked.join(' • ')) + '</div>' : '') +
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="upgrade"' +
            ' data-label="' + esc(nt.name) + '" data-cost="' + esc(fm(nt.cost)) + '"' +
            (nt.canAfford && nt.prestigeOk ? '' : ' disabled title="' + esc(blocked.join('; ') || 'Unavailable') + '"') +
          '>Upgrade shop</button>' +
        '</div></div>';
    } else {
      html += '<div class="card"><div class="card-title">Upgrade</div>' +
        '<p class="muted">You own the biggest shop in town. Nowhere left to grow but your reputation.</p></div>';
    }

    /* insurance */
    var ins = sv.insurance || {};
    html += '<div class="card"><div class="card-title">Insurance</div>' +
      '<p class="muted small">Covers most of the cost when a mishap fries a part — or you.</p>' +
      '<div class="insurance-row">' +
        '<input type="checkbox" id="insurance-toggle" data-action="insurance"' + (ins.active ? ' checked' : '') + '>' +
        '<label for="insurance-toggle">Shop insurance — <b class="num">' + esc(fm(ins.monthlyCost)) + '</b>/month</label>' +
      '</div></div>';

    html += '</div>'; /* /shop-grid */

    /* §10.7 staff */
    if (showStaff) html += staffSectionHTML(stv, st);

    /* §13.4 training & certifications */
    if (showTraining) html += trainingSectionHTML(tv, st);

    /* equipment */
    html += '<h2 class="section-title" id="shop-sec-equipment">Equipment</h2><div class="shop-grid">';
    var equipment = equipmentList;
    if (!equipment.length) {
      html += '</div>' + emptyBox('No equipment catalog available.');
      panel.innerHTML = html;
      return;
    }
    equipment.forEach(function (eq) {
      var reasons = [];
      if (!eq.owned) {
        if (eq.available === false) reasons.push('Not available yet');
        if (eq.requiresOwned === false) reasons.push('Requires the earlier model first');
      }
      var unlocks = equipUnlockLabel(eq); // §14.5
      html += '<div class="card equip-card' + (eq.owned ? ' owned' : '') + '">' +
        '<div class="card-title">' + esc(eq.name) +
          (eq.owned ? ' <span class="chip chip-status done">Owned</span>' : '') +
          (unlocks ? ' <span class="badge b-unlock" title="Owning this opens up this job type">Unlocks: ' + esc(unlocks) + '</span>' : '') +
          '</div>' +
        (eq.desc ? '<p class="muted small">' + esc(eq.desc) + '</p>' : '') +
        '<div class="job-actions">' +
          (eq.owned
            ? '<span class="muted small">Installed and ready.</span>'
            : '<button type="button" class="btn btn-primary btn-sm" data-action="buy-equip" data-id="' + esc(eq.id) + '"' +
              (reasons.length ? ' disabled title="' + esc(reasons.join('; ')) + '"' : '') +
              '>Buy — <span class="equip-cost num">' + esc(fm(eq.cost)) + '</span></button>' +
              (reasons.length ? ' <span class="muted small">' + esc(reasons.join(' • ')) + '</span>' : '')) +
        '</div></div>';
    });
    html += '</div>';
    panel.innerHTML = html;
  }

  /* ---- §10.7 staff section (Shop tab) ---- */

  function staffRoleLabel(role) {
    try {
      var roles = window.DATA && DATA.STAFF_ROLES;
      if (roles) {
        for (var i = 0; i < roles.length; i++) {
          if (roles[i].id === role) return roles[i].name;
        }
      }
    } catch (e) { /* ignore */ }
    return role ? prettySubtype(role) : '';
  }

  /** §15.1 — does this getStaffView entry need transition retraining?
   * Preferred contract: s.retrain = {needed, transitionId, transitionName?,
   * cost?, hours?}; boolean-flag fallbacks tolerated. Null = no. */
  function retrainInfoOf(s) {
    if (!s) return null;
    if (s.retrain && typeof s.retrain === 'object') {
      return s.retrain.needed === false ? null : s.retrain;
    }
    if (s.needsRetraining || s.needsRetrain) {
      return {
        needed: true,
        transitionId: s.retrainTransitionId || s.transitionId || null,
        transitionName: s.retrainTransitionName || s.transitionName || null,
        cost: s.retrainCost, hours: s.retrainHours
      };
    }
    return null;
  }

  /** §11.5 — level pips, 1-5. */
  function lvlPips(level) {
    var l = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
    if (!l) return '';
    var h = '<span class="lvl-pips" title="Level ' + l + ' of 5">';
    for (var i = 1; i <= 5; i++) h += '<span class="lvl-pip' + (i <= l ? ' on' : '') + '"></span>';
    return h + '</span>';
  }

  function staffSectionHTML(stv, st) {
    var slots = Number(stv.slots) || 0;
    var used = Number(stv.slotsUsed) || 0;
    var h = '<h2 class="section-title" id="shop-sec-staff">Staff</h2>';

    if (slots <= 0) {
      h += '<div class="note">A one-person garage — upgrade the shop to hire help.</div>';
      return h;
    }

    /* slots meter + payroll line */
    h += '<div class="staff-slots">' +
      '<div class="flex-between"><span><b class="num">' + used + '</b> / ' + slots + ' staff slots</span>' +
      (stv.totalMonthlyWages ? '<span class="muted small">Payroll: <b class="num">' + esc(fm(stv.totalMonthlyWages)) + '</b>/month (billed on the 1st)</span>' : '') +
      '</div>' + UI.barHTML(used, slots, 'grow') + '</div>';

    /* roster */
    var staff = arr(stv.staff);
    if (!staff.length) {
      h += emptyBox('No employees yet — hire from the candidates below and watch jobs go faster.');
    } else {
      h += '<div class="shop-grid">';
      staff.forEach(function (s) {
        /* §11.5 — title, level pips 1-5, XP progress toward next level */
        var roleTxt = s.title || s.roleName || staffRoleLabel(s.role);
        var xpRow = '';
        if (s.level !== undefined && s.level !== null && s.xp !== undefined && s.xp !== null) {
          if (s.nextLevelAt) {
            xpRow = '<div class="xp-row">' + UI.barHTML(s.xp, s.nextLevelAt) +
              '<span class="xp-txt">' + Math.round(Number(s.xp) || 0) + ' / ' + esc(s.nextLevelAt) + 'h XP</span></div>';
          } else {
            xpRow = '<div class="xp-row"><span class="xp-txt">Top of their craft — max level</span></div>';
          }
        }
        /* §15.1 — transition retraining state (feature-detected shape) */
        var rt = retrainInfoOf(s);
        var rtRow = '';
        if (rt) {
          var rtName = rt.transitionName || rt.name || 'the current platform shift';
          var rtBits = [];
          if (rt.cost !== undefined && rt.cost !== null) rtBits.push(fm(rt.cost));
          if (rt.hours !== undefined && rt.hours !== null) rtBits.push(rt.hours + 'h of your time');
          rtRow = '<div class="retrain-note" title="Until retrained, their speed bonus is halved on the job types this transition boosts">' +
            '⚠ Needs retraining — ' + esc(rtName) + '</div>' +
            '<div class="job-actions retrain-actions">' +
              '<button type="button" class="btn btn-primary btn-sm" data-action="retrain" data-id="' + esc(s.id) + '"' +
                (rt.transitionId ? ' data-transition="' + esc(rt.transitionId) + '"' : '') +
                '>Retrain' + (rtBits.length ? ' — ' + esc(rtBits.join(' + ')) : '') + '</button>' +
            '</div>';
        }
        h += '<div class="card staff-card' + (rt ? ' needs-retrain' : '') + '">' +
          '<div class="card-title">' + esc(s.name) +
            ' <span class="chip chip-role">' + esc(roleTxt) + '</span> ' + lvlPips(s.level) + '</div>' +
          '<div class="meta-row">' +
            (s.skill !== undefined && s.skill !== null ? '<span class="staff-skill muted small">Skill ' + Math.round(Number(s.skill) * 100) + '</span>' : '') +
            '<span class="wage num">' + esc(fm(s.wageMonthly)) + '/mo</span>' +
          '</div>' +
          xpRow +
          (s.effectNote ? '<div class="effect-note">' + esc(s.effectNote) + '</div>' : '') +
          rtRow +
          '<div class="job-actions">' +
            '<button type="button" class="btn btn-sm btn-ghost" data-action="fire" data-id="' + esc(s.id) +
              '" data-name="' + esc(s.name) + '" data-level="' + (Number(s.level) || 0) + '">Fire…</button>' +
          '</div></div>';
      });
      h += '</div>';
    }

    /* candidates */
    h += '<h3 class="sub-title">Candidates' +
      (stv.nextRefreshDay !== undefined && stv.nextRefreshDay !== null && st
        ? ' <span class="muted small">— fresh faces in ' + Math.max(0, stv.nextRefreshDay - st.day) + ' day' + (stv.nextRefreshDay - st.day === 1 ? '' : 's') + '</span>'
        : '') + '</h3>';
    var cands = arr(stv.candidates);
    if (!cands.length) {
      h += emptyBox('Nobody is answering the help-wanted ad this week — candidates refresh weekly.');
    } else {
      var full = used >= slots;
      h += '<div class="shop-grid">';
      cands.forEach(function (c) {
        h += '<div class="card staff-card">' +
          '<div class="card-title">' + esc(c.name) +
            ' <span class="chip chip-role">' + esc(c.title || c.roleName || staffRoleLabel(c.role)) + '</span>' +
            (c.level !== undefined && c.level !== null
              ? ' <span class="chip" title="Candidates start green — talent is grown in-house">L' + esc(c.level) + '</span>'
              : '') + '</div>' +
          (c.desc ? '<p class="muted small">' + esc(c.desc) + '</p>' : '') +
          '<div class="meta-row">' +
            (c.skill !== undefined && c.skill !== null ? '<span class="staff-skill muted small">Skill ' + Math.round(Number(c.skill) * 100) + '</span>' : '') +
            '<span class="wage num">' + esc(fm(c.wageMonthly)) + '/mo</span>' +
          '</div>' +
          (c.effectNote ? '<div class="effect-note">' + esc(c.effectNote) + '</div>' : '') +
          '<div class="job-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="hire" data-id="' + esc(c.id) + '"' +
            (full ? ' disabled title="All staff slots are full"' : '') + '>Hire</button>' +
          '</div></div>';
      });
      h += '</div>';
    }
    return h;
  }

  /* ---- §13.4 Training & Certifications section (Shop tab) ---- */

  function trainingSectionHTML(tv, st) {
    var earned = arr(tv.earned);
    var avail = arr(tv.available);
    var studying = tv.studying;

    var h = '<h2 class="section-title" id="shop-sec-training">Training &amp; Certifications</h2>';

    /* Graceful fully-empty state (e.g. DATA.CERTIFICATIONS still landing):
     * a single calm note instead of a stack of empty boxes. */
    if (!earned.length && !avail.length && !studying) {
      return h + emptyBox('No certifications available yet — trade certs unlock as the years roll on.');
    }

    if (!earned.length) {
      h += emptyBox('No certifications earned yet — study one below to unlock its bonus.');
    } else {
      h += '<div class="cert-chips">';
      earned.forEach(function (c) {
        h += '<span class="chip chip-cert" title="' + esc(c.effectsNote || '') + '">🎓 ' + esc(c.abbr || c.name) + '</span>';
      });
      h += '</div><ul class="cert-effects">';
      earned.forEach(function (c) {
        if (c.effectsNote) h += '<li><b>' + esc(c.abbr || c.name) + '</b> — ' + esc(c.effectsNote) + '</li>';
      });
      h += '</ul>';
    }

    if (studying) {
      var otCap = otCapValue();
      var hoursNow = Number(st.hoursLeft) || 0;
      var noHours = hoursNow <= -otCap;
      var pctDone = studying.pct !== undefined && studying.pct !== null
        ? studying.pct : (studying.hoursTotal ? (studying.hoursDone / studying.hoursTotal) * 100 : 0);
      h += '<div class="card cert-study">' +
        '<div class="card-title">Studying: ' + esc(studying.name) + '</div>' +
        '<div class="bar-row">' + animatedBar('cert-study-' + (studying.id || ''), studying.hoursDone, studying.hoursTotal, 'wide good') +
          '<span class="num small">' + esc(studying.hoursDone) + ' / ' + esc(studying.hoursTotal) + 'h' +
          (isFinite(pctDone) ? ' (' + Math.round(pctDone) + '%)' : '') + '</span></div>' +
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="study-cert"' +
            (noHours ? ' disabled title="Too exhausted — call it a day"' : '') + '>Study (spend hours)</button>' +
        '</div></div>';
    }

    h += '<h3 class="sub-title">Available</h3>';
    if (!avail.length) {
      h += emptyBox(studying
        ? 'Finish your current course before starting another.'
        : 'Nothing to study yet — certifications unlock as the years (and any prerequisites) allow.');
    } else {
      h += '<div class="shop-grid">';
      avail.forEach(function (c) {
        var canStart = c.canStart !== false && !studying;
        var reason = !canStart ? (studying ? 'Finish your current course first' : (c.reason || 'Not available yet')) : '';
        h += '<div class="card cert-card">' +
          '<div class="card-title">' + esc(c.name) + (c.abbr ? ' <span class="chip">' + esc(c.abbr) + '</span>' : '') + '</div>' +
          (c.desc ? '<p class="muted small">' + esc(c.desc) + '</p>' : '') +
          '<div class="meta-row small">' +
            '<span class="pay num">' + esc(fm(c.cost)) + '</span>' +
            '<span class="chip">' + esc(c.studyHours) + 'h study</span>' +
          '</div>' +
          '<div class="job-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="start-cert" data-id="' + esc(c.id) + '"' +
              (canStart ? '' : ' disabled title="' + esc(reason) + '"') + '>Start</button>' +
            (reason ? ' <span class="muted small">' + esc(reason) + '</span>' : '') +
          '</div></div>';
      });
      h += '</div>';
    }
    return h;
  }

  /* ================================================================== *
   * TAB: Ledger
   * ================================================================== */

  function renderLedger(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var lg = tryCall(function () { return Engine.getLedger(); });
    if (!lg || lg.ok === false) { panel.innerHTML = emptyBox('No ledger data yet.'); return; }

    var html = '<h2 class="section-title">Ledger</h2>';

    /* §15.3/§15.4 — financing & retainers (each renders only once its
     * engine feature exists; both absent = no empty shell). */
    var finHTML = creditCardHTML(st) + businessAccountsHTML(st);
    if (finHTML) html += '<div class="shop-grid ledger-fin">' + finHTML + '</div>';

    /* current month preview */
    var cur = lg.currentMonthPreview;
    if (cur) {
      html += '<h3 class="sub-title mt0">Current month' + (cur.ym ? ' (' + esc(cur.ym) + ')' : '') + ' — so far</h3>' +
        moneyKV([
          ['Revenue', cur.revenue], ['Parts cost', cur.partsCost],
          ['Fixed costs', cur.fixedCosts], ['Other', cur.other], ['Net', cur.net, true]
        ]);
    }

    /* month table */
    var months = arr(lg.months);
    html += '<h3 class="sub-title">Closed months</h3>';
    if (!months.length) {
      html += emptyBox('First month still in progress — the books close on the 1st.');
    } else {
      html += '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Month</th><th class="num">Revenue</th><th class="num">Parts</th>' +
        '<th class="num">Fixed</th><th class="num">Other</th><th class="num">Net</th>' +
        '</tr></thead><tbody>';
      months.slice().reverse().forEach(function (m) {
        var net = Number(m.net) || 0;
        html += '<tr>' +
          '<td>' + esc(m.ym) + '</td>' +
          '<td class="num">' + esc(fm(m.revenue)) + '</td>' +
          '<td class="num">' + esc(fm(m.partsCost)) + '</td>' +
          '<td class="num">' + esc(fm(m.fixedCosts)) + '</td>' +
          '<td class="num">' + esc(fm(m.other)) + '</td>' +
          '<td class="num ' + (net >= 0 ? 'up' : 'down') + '"><b>' + esc(fm(net)) + '</b></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    }

    /* lifetime — §15.5 pairs the live stats table with the badge grid */
    var lt = lg.lifetime || {};
    html += '<h3 class="sub-title" id="ledger-sec-stats">Lifetime</h3><div class="kv">' +
      kvCell('Revenue', fm(lt.revenue)) +
      kvCell('Parts cost', fm(lt.partsCost)) +
      kvCell('Fixed costs', fm(lt.fixedCosts)) +
      kvCell('Other', fm(lt.other)) +
      kvCell('Jobs completed', lt.jobsCompleted || 0) +
      kvCell('Jobs failed', lt.jobsFailed || 0) +
      kvCell('Builds delivered', lt.buildsDelivered || 0) +
      kvCell('Refurbs sold', lt.refurbsSold || 0) +
      kvCell('Days played', lt.daysPlayed || 0) +
      '</div>';

    /* §15.5 achievements — in the Ledger (not System) because this tab is
     * already the shop's record book: the lifetime table above IS the
     * "stats" half of Achievements & Stats. System stays settings/saves. */
    html += achievementsHTML();

    panel.innerHTML = html;
  }

  /* ---- §15.3 credit line card ---- */
  function creditCardHTML(st) {
    if (!has('getCredit')) return '';
    var cr = tryCall(function () { return Engine.getCredit(); });
    if (!cr || cr.ok === false) return '';

    var h = '<div class="card credit-card"><div class="card-title">Credit line</div>';
    if (!cr.unlocked) {
      h += '<p class="muted small">🔒 ' + esc(cr.reason ||
        'Banks want a name they can trust — reach prestige tier 1 (Neighborhood Fixture) to open a credit line.') + '</p></div>';
      return h;
    }

    var limit = Number(cr.limit) || 0;
    var drawn = Number(cr.drawn) || 0;
    var apr = Number(cr.apr) || 0;
    var avail = Math.max(0, limit - drawn);
    h += '<div class="bar-row"><span class="muted small">Drawn</span>' +
      UI.barHTML(drawn, limit || 1, 'wide' + (drawn > 0 ? ' over' : '')) +
      '<span class="num small">' + esc(fm(drawn)) + ' of ' + esc(fm(limit)) + '</span></div>' +
      '<div class="meta-row small">' +
        '<span class="chip">APR ' + esc((apr * 100).toFixed(1)) + '%</span>' +
        (cr.monthlyInterest !== undefined && cr.monthlyInterest !== null && drawn > 0
          ? '<span class="chip chip-risk" title="Charged on the 1st with rent">~' + esc(fm(cr.monthlyInterest)) + '/month interest</span>'
          : '') +
        '<span class="muted">' + esc(fm(avail)) + ' available</span>' +
      '</div>' +
      '<div class="credit-row">' +
        '<input type="number" id="credit-draw-amt" min="1" step="50" placeholder="Amount" aria-label="Amount to draw">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="credit-draw"' +
          (avail <= 0 ? ' disabled title="The line is fully drawn"' : '') + '>Draw</button>' +
        '<input type="number" id="credit-repay-amt" min="1" step="50" placeholder="Amount" aria-label="Amount to repay">' +
        '<button type="button" class="btn btn-sm" data-action="credit-repay"' +
          (drawn <= 0 ? ' disabled title="Nothing drawn"' : '') + '>Repay</button>' +
      '</div>' +
      '<p class="muted small">Interest on the drawn balance is charged on the 1st with rent. Drawn credit never starts the bankruptcy clock — but the interest can drag your cash under.</p>' +
      '</div>';
    return h;
  }

  /* ---- §15.4 business accounts card ---- */
  function businessAccountsHTML(st) {
    var accounts = null;
    if (has('getBusinessAccounts')) {
      var av = tryCall(function () { return Engine.getBusinessAccounts(); });
      if (Array.isArray(av)) accounts = av;
    }
    if (accounts === null && st && Array.isArray(st.accounts)) accounts = st.accounts;
    if (accounts === null) return ''; // feature not landed yet

    var h = '<div class="card accounts-card"><div class="card-title">Business accounts</div>';
    if (!accounts.length) {
      h += '<p class="muted small">No retainers yet — business accounts appear as offers once your shop is Well-Reviewed (prestige tier 2).</p></div>';
      return h;
    }
    accounts.forEach(function (a) {
      if (!a) return;
      h += '<div class="account-row">' +
        '<span class="acct-name">' + esc(a.name || 'Business client') + '</span>' +
        '<span class="meta-row small">' +
          (a.monthlyFee !== undefined && a.monthlyFee !== null ? '<span class="chip">' + esc(fm(a.monthlyFee)) + '/mo</span>' : '') +
          (a.jobsPerMonth ? '<span class="chip">' + esc(a.jobsPerMonth) + ' job' + (Number(a.jobsPerMonth) === 1 ? '' : 's') + '/mo</span>' : '') +
          (a.minRating
            ? '<span class="chip chip-risk" title="The account cancels — with a reputation hit — if your rating drops below this or you fail two of their jobs in a month">cancels under ' + esc(a.minRating) + '★</span>'
            : '') +
        '</span></div>';
    });
    h += '<p class="muted small">Retainers pay on the 1st. Keep their jobs on time and your rating up, or they walk.</p></div>';
    return h;
  }

  /* ---- §15.5 achievements grid (badge wall) ---- */
  function achievementsHTML() {
    if (!has('getAchievements')) return '';
    var list = arr(tryCall(function () { return Engine.getAchievements(); }));
    var unlocked = list.filter(function (a) { return a && a.unlocked; }).length;

    var h = '<h3 class="sub-title" id="ledger-sec-achievements">Achievements' +
      (list.length ? ' <span class="muted">— ' + unlocked + ' / ' + list.length + ' unlocked</span>' : '') + '</h3>';
    if (!list.length) {
      return h + emptyBox('No achievements defined yet — they arrive with the next engine update.');
    }
    h += '<div class="ach-grid">';
    list.forEach(function (a) {
      if (!a) return;
      var isHidden = a.hidden && !a.unlocked;
      var cls = a.unlocked ? 'unlocked' : (isHidden ? 'hidden-ach' : 'locked');
      var name = isHidden ? '???' : (a.name || a.id);
      var desc = isHidden ? 'Keep playing to discover this one.' : (a.desc || '');
      h += '<div class="ach-badge ' + cls + '" title="' + esc(desc) + '">' +
        '<span class="ach-ico">' + (a.unlocked ? '🏆' : (isHidden ? '❓' : '🔒')) + '</span>' +
        '<span class="ach-name">' + esc(name) + '</span>' +
        (desc ? '<span class="ach-desc">' + esc(desc) + '</span>' : '') +
        (a.unlocked && a.dayLabel ? '<span class="ach-day">' + esc(a.dayLabel) + '</span>' : '') +
        '</div>';
    });
    return h + '</div>';
  }

  function kvCell(k, v) {
    return '<div class="cell"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>';
  }

  function moneyKV(pairs) {
    var h = '<div class="kv">';
    pairs.forEach(function (p) {
      var val = Number(p[1]) || 0;
      var cls = p[2] ? (val >= 0 ? ' up' : ' down') : '';
      h += '<div class="cell"><div class="k">' + esc(p[0]) + '</div><div class="v' + cls + '">' + esc(fm(val)) + '</div></div>';
    });
    return h + '</div>';
  }

  /* ================================================================== *
   * TAB: News
   * ================================================================== */

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
    html += '<div class="news-feed">';
    items.forEach(function (n) {
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
        '<p class="muted small">Mute toggles live in the header (🎵 / 🔊). Audio starts after your first click — browser rules.</p>';
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

})();
