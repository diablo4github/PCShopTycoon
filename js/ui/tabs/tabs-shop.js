/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/tabs/tabs-shop.js  (§17.3 split)
 * The Shop tab: tier + §16.2b ROI upgrade card, insurance, equipment grid
 * with §14.5 unlock badges + Assembly-Bench callout, §10.7 staff (incl.
 * §15.1 retraining), §13.4 training & certifications, §16.1 sub-tabs.
 * Moved verbatim from the tabs.js monolith — zero behavior change.
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var T = UI.tabs = UI.tabs || {};
  var S = T.shared;

  var esc = S.esc, fm = S.fm, tryCall = S.tryCall, arr = S.arr,
      getState = S.getState, emptyBox = S.emptyBox,
      prettySubtype = S.prettySubtype, has = S.has, otCapValue = S.otCapValue,
      animatedBar = S.animatedBar;

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

  /* §16.2b — plain-language ROI box for the upgrade card. Renders only
   * when the engine ships the fields (monthlyCostDelta / slotsDelta /
   * offerBonusDelta / staffSlotsDelta / paybackMonths on nextTier);
   * paybackMonths === null gets the honest "not profitable yet" line,
   * undefined omits the payback sentence entirely. */
  function roiBoxHTML(nt) {
    if (!nt) return '';
    var known = nt.monthlyCostDelta !== undefined || nt.slotsDelta !== undefined ||
      nt.offerBonusDelta !== undefined || nt.staffSlotsDelta !== undefined ||
      nt.paybackMonths !== undefined;
    if (!known) return '';
    var bits = [];
    if (nt.monthlyCostDelta !== undefined && nt.monthlyCostDelta !== null) {
      bits.push('Rent &amp; utilities rise <b class="num">' + esc(fm(nt.monthlyCostDelta)) + '</b>/month.');
    }
    var adds = [];
    if (nt.slotsDelta) adds.push('+' + esc(nt.slotsDelta) + ' workstation' + (Number(nt.slotsDelta) === 1 ? '' : 's'));
    if (nt.offerBonusDelta) adds.push('+' + esc(nt.offerBonusDelta) + ' offer' + (Number(nt.offerBonusDelta) === 1 ? '' : 's') + '/day');
    if (nt.staffSlotsDelta) adds.push('+' + esc(nt.staffSlotsDelta) + ' staff slot' + (Number(nt.staffSlotsDelta) === 1 ? '' : 's'));
    if (adds.length) bits.push('Adds ' + adds.join(', ') + '.');
    if (nt.paybackMonths !== undefined) {
      bits.push(nt.paybackMonths === null
        ? esc(nt.paybackReason || "You aren't profitable enough yet for this to pay for itself — build income first.")
        : 'Rough payback: <b>~' + esc(nt.paybackMonths) + ' month' + (Number(nt.paybackMonths) === 1 ? '' : 's') + '</b> at your current daily net.');
    }
    return bits.length ? '<div class="roi-box">' + bits.join(' ') + '</div>' : '';
  }

  function renderShop(panel) {
    var st = getState();
    if (!st) { panel.innerHTML = emptyBox('Waiting for the engine to load…'); return; }
    var sv = tryCall(function () { return Engine.getShopView(); });
    if (!sv || sv.ok === false) { panel.innerHTML = emptyBox('Shop data unavailable.'); return; }
    var cash = Number(st.cash) || 0;

    var stv = has('getStaffView') ? tryCall(function () { return Engine.getStaffView(); }) : null;
    var showStaff = !!(stv && stv.ok !== false);
    var tv = has('getCertifications') ? tryCall(function () { return Engine.getCertifications(); }) : null;
    var showTraining = !!(tv && tv.ok !== false);

    var equipmentList = arr(sv.equipment);
    var bench = null;
    var buyableCount = 0;
    equipmentList.forEach(function (eq) {
      if (eq.id === 'build-bench') bench = eq;
      if (!eq.owned && eq.available !== false) buyableCount++;
    });
    /* §14.5 callout condition — shown on the Equipment pill (§16.1) with a
     * 🔓 marker on the pill itself so it's discoverable from any pill. */
    var calloutActive = !!(st.customBuildsUnlocked && bench && !bench.owned);

    /* §16.1 — true sub-tabs replace the v0.5.1 scroll-anchors. */
    var pills = [
      { id: 'upgrade', label: 'Shop Upgrade' },
      { id: 'equipment', label: 'Equipment' + (calloutActive ? ' 🔓' : ''), count: buyableCount,
        title: calloutActive ? 'A build-unlocking bench is waiting here' : 'Benches, rigs and kits' },
      { id: 'training', label: 'Training', count: showTraining ? arr(tv.available).length : undefined, hidden: !showTraining },
      { id: 'staff', label: 'Staff', count: showStaff ? arr(stv.staff).length : undefined, hidden: !showStaff }
    ];
    var cur = UI.activeSubTab('shop', pills);

    var html = '<h2 class="section-title">Your Shop</h2>' + UI.subTabsHTML('shop', pills);

    if (cur === 'upgrade') {
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
        /* §16.3a — precise shortfall, never a silent no-op */
        if (nt.canAfford === false) blocked.push('Need ' + fm(Math.max(0, (Number(nt.cost) || 0) - cash)) + ' more');
        html += '<div class="card">' +
          '<div class="card-title">Upgrade: ' + esc(nt.name) + '</div>' +
          '<div class="meta-row"><span class="pay num">' + esc(fm(nt.cost)) + '</span>' +
            (nt.minPrestige ? '<span class="chip">Prestige tier ' + esc(nt.minPrestige) + '+ required</span>' : '') +
          '</div>' +
          roiBoxHTML(nt) +
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
    }

    if (cur === 'staff' && showStaff) html += staffSectionHTML(stv, st);

    if (cur === 'training' && showTraining) html += trainingSectionHTML(tv, st);

    if (cur === 'equipment') {
      /* §14.5/§16.1 — the Assembly-Bench callout stays visible on the
       * Equipment pill. */
      if (calloutActive) {
        var benchShort = Math.max(0, (Number(bench.cost) || 0) - cash);
        html += '<div class="card unlock-callout">' +
          '<div class="card-title">🔓 Custom builds are ready to unlock</div>' +
          '<p class="muted small">The era supports custom-build jobs now — you are just missing the bench. Buy the <b>' +
            esc(bench.name) + '</b> to start taking them.</p>' +
          '<div class="job-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="buy-equip" data-id="' + esc(bench.id) + '"' +
              (bench.available === false ? ' disabled title="Not available yet"'
                : (benchShort > 0 ? ' disabled title="Need ' + esc(fm(benchShort)) + ' more"' : '')) +
              '>Buy — ' + esc(fm(bench.cost)) + '</button>' +
            (benchShort > 0 ? ' <span class="muted small">Need ' + esc(fm(benchShort)) + ' more</span>' : '') +
          '</div></div>';
      }

      html += '<h2 class="section-title" id="shop-sec-equipment">Equipment</h2><div class="shop-grid">';
      if (!equipmentList.length) {
        html += '</div>' + emptyBox('No equipment catalog available.');
        panel.innerHTML = html;
        return;
      }
      equipmentList.forEach(function (eq) {
        var reasons = [];
        if (!eq.owned) {
          if (eq.available === false) reasons.push('Not available yet');
          if (eq.requiresOwned === false) reasons.push('Requires the earlier model first');
          /* §16.3a — an unaffordable buy is disabled with the shortfall,
           * never a silent dead click. */
          var eqShort = Math.max(0, (Number(eq.cost) || 0) - cash);
          if (!reasons.length && eqShort > 0) reasons.push('Need ' + fm(eqShort) + ' more');
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
    }

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
          /* §16.3a — unaffordable retraining is disabled with the shortfall */
          var rtShort = (rt.cost !== undefined && rt.cost !== null && st)
            ? Math.max(0, Number(rt.cost) - (Number(st.cash) || 0)) : 0;
          rtRow = '<div class="retrain-note" title="Until retrained, their speed bonus is halved on the job types this transition boosts">' +
            '⚠ Needs retraining — ' + esc(rtName) + '</div>' +
            '<div class="job-actions retrain-actions">' +
              '<button type="button" class="btn btn-primary btn-sm" data-action="retrain" data-id="' + esc(s.id) + '"' +
                (rt.transitionId ? ' data-transition="' + esc(rt.transitionId) + '"' : '') +
                (rtShort > 0 ? ' disabled title="Need ' + esc(fm(rtShort)) + ' more"' : '') +
                '>Retrain' + (rtBits.length ? ' — ' + esc(rtBits.join(' + ')) : '') + '</button>' +
              (rtShort > 0 ? ' <span class="muted small">Need ' + esc(fm(rtShort)) + ' more</span>' : '') +
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

  /** §19.9 #15 — a plain-language "what this cert gets you" line for an
   * AVAILABLE cert. Prefers an engine-shipped effectsNote; otherwise derives
   * one from the raw cert effects via Engine.humanizeJobTypes (mirroring the
   * engine's own note builder so copy stays consistent, and skipping any bit
   * we can't phrase without raw type ids — §19.9 #10). */
  function certUnlocksLine(c) {
    if (c.effectsNote) return c.effectsNote;
    if (!has('certById') || typeof Engine.humanizeJobTypes !== 'function') return '';
    var raw = tryCall(function () { return Engine.certById(c.id); });
    var ef = raw && raw.effects;
    if (!ef) return '';
    var bits = [];
    try {
      var k, pct;
      if (ef.jobTimeMult) {
        for (k in ef.jobTimeMult) if (Object.prototype.hasOwnProperty.call(ef.jobTimeMult, k)) {
          pct = Math.round((1 - ef.jobTimeMult[k]) * 100);
          if (pct) bits.push((k === 'all' ? 'All work' : Engine.humanizeJobTypes([k])) + ' ' + pct + '% faster');
        }
      }
      if (ef.payMult) {
        for (k in ef.payMult) if (Object.prototype.hasOwnProperty.call(ef.payMult, k)) {
          pct = Math.round((ef.payMult[k] - 1) * 100);
          if (pct) bits.push(Engine.humanizeJobTypes([k]) + ' pay +' + pct + '%');
        }
      }
      if (ef.callbackMult !== null && ef.callbackMult !== undefined && ef.callbackMult !== 1)
        bits.push('callbacks ' + Math.round((1 - ef.callbackMult) * 100) + '% less likely');
      if (ef.reliabilityBonus) bits.push('+' + ef.reliabilityBonus + ' effective reliability');
      if (ef.prestigeBonus) bits.push('+' + ef.prestigeBonus + ' prestige tier');
      if (Array.isArray(ef.unlocks) && ef.unlocks.length)
        bits.push('unlocks ' + Engine.humanizeJobTypes(ef.unlocks).toLowerCase());
    } catch (e) { /* partial line is fine */ }
    return bits.join(', ');
  }

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
        /* §16.3a — starting a cert you can't afford is a disabled state
         * with the shortfall, not a silent engine bounce. */
        if (canStart && st && c.cost !== undefined && c.cost !== null) {
          var certShort = Math.max(0, Number(c.cost) - (Number(st.cash) || 0));
          if (certShort > 0) { canStart = false; reason = 'Need ' + fm(certShort) + ' more'; }
        }
        var unl = certUnlocksLine(c);   // §19.9 #15
        h += '<div class="card cert-card">' +
          '<div class="card-title">' + esc(c.name) + (c.abbr ? ' <span class="chip">' + esc(c.abbr) + '</span>' : '') + '</div>' +
          (c.desc ? '<p class="muted small">' + esc(c.desc) + '</p>' : '') +
          (unl ? '<p class="small cert-unlocks"><b>What it gets you:</b> ' + esc(unl) + '</p>' : '') +
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

  /* ---- actions ---- */
  T.registerActions({
    'upgrade': function (el) {
      var label = el.getAttribute('data-label') || 'the next tier';
      var cost = el.getAttribute('data-cost') || '';
      UI.confirm(
        'Upgrade the shop to ' + label + (cost ? ' for ' + cost : '') + '? Rent and utilities go up with the bigger space.',
        function () { UI.act(function () { return Engine.upgradeShop(); }, 'Shop upgraded!'); },
        { yesLabel: 'Upgrade', title: 'Upgrade shop', danger: false }
      );
    },
    'buy-equip': function (el) {
      var eid = el.getAttribute('data-id');
      UI.act(function () { return Engine.buyEquipment(eid); }, 'Equipment purchased');
    },
    'hire': function (el) { /* §10.7 */
      var cid = el.getAttribute('data-id');
      UI.act(function () { return Engine.hireStaff(cid); }, 'Welcome aboard — they start right away');
    },
    'study-cert': function () { /* §13.4 */
      var scr = UI.act(function () { return Engine.studyCert(); });
      if (scr && scr.ok !== false) {
        UI.toast(scr.completed ? 'Certification complete!' : ('Studied ' + (scr.hoursSpent != null ? scr.hoursSpent + 'h' : '')), 'success');
      }
    },
    'start-cert': function (el) { /* §13.4 */
      var certId = el.getAttribute('data-id');
      UI.act(function () { return Engine.startCertification(certId); }, 'Enrolled — study hours in the Shop tab to complete it');
    },
    'retrain': function (el) { /* §15.1 — transition retraining (owner time + cost) */
      if (!has('retrainStaff')) { UI.toast('Retraining is not available yet', 'info'); return; }
      var rtId = el.getAttribute('data-id');
      var rtTrans = el.getAttribute('data-transition') || undefined;
      var rtr = UI.act(function () { return Engine.retrainStaff(rtId, rtTrans); });
      if (rtr && rtr.ok !== false) {
        UI.toast('Retrained — back to full speed on the new platform' +
          (rtr.cost ? ' (' + fm(rtr.cost) + ')' : ''), 'success', 5000);
      }
    },
    'fire': function (el) { /* §10.7 + §11.5 (veterans hurt twice as much) */
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
    }
  });

  T.registerChangeActions({
    'insurance': function (el) {
      UI.act(function () { return Engine.setInsurance(!!el.checked); });
    }
  });

  T.registerTab('shop', renderShop);

})();
