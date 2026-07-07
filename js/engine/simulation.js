/* Circuit & Solder — engine/simulation.js
 * Overnight pipeline exactly in SPEC §5.3 order, morning summary assembly,
 * monthly billing & ledger, grace/bankruptcy, prestige recompute, custom-build
 * unlock news, random event firing, as-is market churn.
 */
(function (root) {
  'use strict';
  var Engine = root.Engine = root.Engine || {};
  var Sim = Engine.Sim = {};

  function CFG() { return Engine.CONFIG; }

  Sim.newSummary = function () {
    return { dateStr: '', skippedSunday: false, newOffers: [], expired: [],
             callbacks: [], priceMovers: [], news: [], charges: [], payouts: [],
             graceWarning: null, gameOver: false,
             overtimeNote: null };
  };

  /* Run ONE calendar night. Steps numbered per SPEC §5.3. */
  Sim.processNight = function (state, summary) {
    var C = CFG();

    // 1. Advance the clock. Overtime (§9.4): a negative hoursLeft carries into
    // the morning — hoursLeft = 8 + carried, never below OVERTIME_MORNING_MIN.
    var carried = Math.min(0, state.hoursLeft || 0);
    state.day += 1;
    state.hoursLeft = carried < 0 ?
      Math.max(C.OVERTIME_MORNING_MIN, state.hoursPerDay + carried) :
      state.hoursPerDay;
    if (carried < 0 && summary) {
      summary.overtimeNote = 'Worked ' + Engine.round2(-carried) +
        'h of overtime — starting today with ' + state.hoursLeft + 'h.';
    }
    state.supplyRunDoneToday = false;
    state.workedToday = [];
    state.declinesToday = 0;
    state.ledger.lifetime.daysPlayed++;
    if (state.injuryDaysLeft > 0) {
      state.injuryDaysLeft--;
      state.hoursLeft = 0;
      Engine.pushNews(state, 'mishap', 'Recovering from the CRT injury',
        state.injuryDaysLeft > 0 ? 'Still on the mend — another day lost.'
                                 : 'Back on the bench tomorrow.');
    }

    // 2. Historical events start/stop + random event firing
    Sim.updateEvents(state);

    // 3. Nightly price noise + history
    Engine.Pricing.nightlyUpdate(state);

    // 4. Deadline sweep + offer expiry
    Engine.Jobs.deadlineSweep(state, summary);

    // 5. Warranty callback arrivals
    Engine.Jobs.processCallbacks(state, summary);

    // 6. As-is market churn
    Engine.Jobs.refreshAsIsMarket(state);

    // 7. New offers
    Engine.Jobs.generateOffers(state, summary);

    // 8. Monthly billing on the 1st
    var di = Engine.dateInfo(state.day, state);
    if (di.isFirstOfMonth) Sim.monthlyBilling(state, summary, di);

    // 9. Custom-build unlock check
    Sim.unlockCheck(state);

    // 10. Grace / bankruptcy
    Sim.graceCheck(state, summary);

    // 11. Prestige recompute (never demotes)
    Sim.prestigeRecompute(state);
  };

  // ------------------------------------------------------------------
  // Events (§5.3 step 2)
  // ------------------------------------------------------------------
  function isActiveEvent(state, id) {
    for (var i = 0; i < state.market.activeEvents.length; i++)
      if (state.market.activeEvents[i].id === id) return true;
    return false;
  }

  Sim.updateEvents = function (state) {
    var C = CFG();
    var DATA = Engine.getData();
    var i, ev;

    // End events whose time is up
    for (i = state.market.activeEvents.length - 1; i >= 0; i--) {
      ev = state.market.activeEvents[i];
      if (state.day >= ev.endDay) {
        state.market.activeEvents.splice(i, 1);
        if (ev.kind === 'historical') {
          Engine.pushNews(state, 'event', 'Market update: ' + ev.name + ' ends',
            'Prices and demand drift back toward normal.');
        }
      }
    }

    // Start historical events whose window covers today (handles mid-window starts)
    var hist = DATA.HISTORICAL_EVENTS || [];
    for (i = 0; i < hist.length; i++) {
      var h = hist[i];
      var startDay = Engine.dayIndexOfISO(h.startDate, state);
      var endDay = startDay + (h.durationDays || 30);
      if (state.day >= startDay && state.day < endDay && !isActiveEvent(state, h.id)) {
        state.market.activeEvents.push({
          id: h.id, kind: 'historical', name: h.headline || h.id,
          headline: h.headline || h.id,
          startDay: startDay, endDay: endDay,
          effects: (h.effects || []).map(copyEffect),
          jobVolumeMult: h.jobVolumeMult || 1
        });
        Engine.pushNews(state, 'event', h.headline || h.id, h.body || '');
      }
    }

    // Random events: ~4%/template/night, era-gated, max 2 active random events
    var year = Engine.currentYear(state);
    var templates = DATA.RANDOM_EVENT_TEMPLATES || [];
    for (i = 0; i < templates.length; i++) {
      var t = templates[i];
      var activeRandom = state.market.activeEvents.filter(function (e) {
        return e.kind === 'random';
      }).length;
      if (activeRandom >= C.MAX_RANDOM_EVENTS) break;
      if (year < (t.minYear || 0) || year > (t.maxYear || 9999)) continue;
      if (!Engine.chance(C.RANDOM_EVENT_NIGHTLY_CHANCE * (t.weight || 1) / 2)) continue;
      Sim.fireRandomEvent(state, t);
    }
  };

  function copyEffect(ef) {
    var out = { categories: (ef.categories || []).slice(), priceMult: ef.priceMult };
    if (Array.isArray(ef.priceMult))
      out.priceMult = Engine.round2(Engine.uniform(ef.priceMult[0], ef.priceMult[1]));
    if (ef.tags) out.tags = ef.tags.slice();
    return out;
  }

  Sim.fireRandomEvent = function (state, t, durationOverride) {
    var dur = durationOverride ||
      (Array.isArray(t.durationDays) ? Engine.randInt(t.durationDays[0], t.durationDays[1])
                                     : (t.durationDays || 30));
    var headline = Array.isArray(t.headlines) ? Engine.pick(t.headlines)
                                              : (t.headlines || t.headline || t.id);
    var inst = {
      id: t.id + '#' + state.day, kind: 'random', name: headline, headline: headline,
      startDay: state.day, endDay: state.day + dur,
      effects: (t.effects || []).map(copyEffect),
      jobVolumeMult: t.jobVolumeMult || 1
    };
    state.market.activeEvents.push(inst);
    Engine.pushNews(state, 'event', headline, t.body || '');
    return inst;
  };

  // ------------------------------------------------------------------
  // Monthly billing & ledger close (§5.3 step 8)
  // ------------------------------------------------------------------
  Sim.monthlyBilling = function (state, summary, di) {
    var C = CFG();
    var year = di.y;
    var scale = Engine.yearScale(year);
    var tier = Engine.tierInfo(state);

    // Close out the old month by opening the new one (months newest last)
    var ym = di.y + '-' + (di.m < 10 ? '0' : '') + di.m;
    var cur = Engine.curMonth(state);
    if (!cur || cur.ym !== ym) {
      state.ledger.months.push({ ym: ym, revenue: 0, partsCost: 0, fixedCosts: 0,
                                 other: 0, net: 0 });
      // keep the ledger bounded (defensive; UI shows months anyway)
      while (state.ledger.months.length > 600) state.ledger.months.shift();
    }

    function charge(label, amount) {
      amount = Engine.round2(amount);
      if (amount <= 0) return;
      Engine.addCash(state, -amount);
      Engine.ledgerAdd(state, 'fixedCosts', amount);
      summary.charges.push({ label: label, amount: -amount });
    }
    charge('Rent (' + tier.name + ')', (tier.rentBase || 0) * scale);
    charge('Utilities', (tier.utilitiesBase || 0) * scale);
    if (state.shop.insurance) {
      charge('Insurance premium',
             Engine.laborRate(year) * C.INSURANCE_MONTHLY_LABOR_MULT);
    }
    var st = Engine.storageInfo(state);
    if (st.overage > 0) charge('Storage overage (' + st.overage + ' slots)',
                               st.overage * st.feePerSlot);
  };

  // ------------------------------------------------------------------
  // Custom-build unlock (§5.3 step 9)
  // ------------------------------------------------------------------
  Sim.unlockCheck = function (state) {
    if (state.customBuildsUnlocked) return;
    var iso = Engine.getData().CUSTOM_BUILD_UNLOCK_DATE || '1989-09-01';
    if (state.day >= Engine.dayIndexOfISO(iso, state)) {
      state.customBuildsUnlocked = true;
      Engine.pushNews(state, 'system', 'The clone-parts market has matured',
        'Compatible components are cheap and everywhere. Custom PC building is ' +
        'now a viable business — get an assembly bench and start quoting builds.');
    }
  };

  // ------------------------------------------------------------------
  // Grace / bankruptcy (§5.3 step 10)
  // ------------------------------------------------------------------
  Sim.graceCheck = function (state, summary) {
    var C = CFG();
    var f = state.flags;
    if (state.cash < 0) {
      if (f.graceDeadlineDay == null) {
        f.graceDeadlineDay = state.day + C.GRACE_DAYS;
        Engine.pushNews(state, 'money', 'The account is overdrawn',
          'Creditors give you ' + C.GRACE_DAYS + ' days to get back in the black.');
      }
      if (state.day > f.graceDeadlineDay) {
        f.gameOver = true;
        f.gameOverReason = 'Bankruptcy — the creditors called time.';
        summary.gameOver = true;
        Engine.pushNews(state, 'money', 'Bankrupt',
          'The shutters come down for the last time.');
        return;
      }
      var daysLeft = f.graceDeadlineDay - state.day;
      summary.graceWarning = 'Cash negative — ' + daysLeft + ' day' +
        (daysLeft === 1 ? '' : 's') + ' to recover';
    } else if (f.graceDeadlineDay != null) {
      f.graceDeadlineDay = null;
      Engine.pushNews(state, 'money', 'Back in the black',
        'The creditors relax. Keep it that way.');
    }
  };

  // ------------------------------------------------------------------
  // Prestige (§5.3 step 11)
  // ------------------------------------------------------------------
  Sim.prestigeRecompute = function (state) {
    var C = CFG();
    var rep = state.reputation;
    var eligible = 0;
    for (var t = 1; t < C.PRESTIGE_TIERS.length; t++) {
      if (rep.jobsCompleted >= C.PRESTIGE_TIERS[t].jobs &&
          rep.rating >= C.PRESTIGE_TIERS[t].rating) eligible = t;
    }
    if (eligible > rep.prestige) {          // never demotes
      rep.prestige = eligible;
      var label = C.PRESTIGE_TIERS[eligible].label;
      Engine.pushNews(state, 'prestige', 'The shop is now "' + label + '"',
        'Word of mouth is compounding. Expect more business.');
      // Press-coverage volume boost on promotion
      var templates = Engine.getData().RANDOM_EVENT_TEMPLATES || [];
      var press = null;
      for (var i = 0; i < templates.length; i++)
        if (templates[i].id === 'press-coverage') press = templates[i];
      if (press) Sim.fireRandomEvent(state, press);
      else Sim.fireRandomEvent(state, {
        id: 'press-coverage', headlines: ['Local press covers the rising shop'],
        body: 'A nice write-up brings the customers in.',
        durationDays: [C.PRESS_BOOST_DAYS, C.PRESS_BOOST_DAYS],
        effects: [], jobVolumeMult: C.PRESS_BOOST_MULT
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
