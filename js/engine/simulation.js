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
             overtimeNote: null,
             levelUps: [],               // §11.5 staff level-ups since last morning
             certsEarned: [] };          // §13.4 certifications completed since last morning
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

    // 1b. §11.6: running wait steps (burn-ins, scans) complete free overnight —
    // before the deadline sweep so an overnight burn-in never "misses" its due
    // date. §11.5: day-time level-ups surface in this morning's summary.
    Engine.Jobs.completeWaitsOvernight(state);
    if (summary && state.levelUpsToday && state.levelUpsToday.length) {
      summary.levelUps = summary.levelUps.concat(state.levelUpsToday);
    }
    state.levelUpsToday = [];
    // §13.4: a cert finished mid-day (via studyCert) surfaces in this morning's
    // summary, same pattern as staff level-ups above.
    if (summary && state.certsEarnedToday && state.certsEarnedToday.length) {
      summary.certsEarned = summary.certsEarned.concat(state.certsEarnedToday);
    }
    state.certsEarnedToday = [];

    // 2. Historical events start/stop + random event firing
    Sim.updateEvents(state);
    // 2b. §13.1 Tech Chronicle: fire dated almanac entries whose date == today.
    // Fully separate from the market-event system above — zero price effect.
    Sim.fireChronicle(state);
    // 2c. §13.2 Milestone Wiki articles: one-time news the first time the
    // calendar crosses an article's unlock point.
    Sim.articleUnlockCheck(state);

    // 3. Nightly price noise + history
    Engine.Pricing.nightlyUpdate(state);

    // 4. Deadline sweep + offer expiry
    Engine.Jobs.deadlineSweep(state, summary);

    // 5. Warranty callback arrivals
    Engine.Jobs.processCallbacks(state, summary);

    // 6. As-is market churn
    Engine.Jobs.refreshAsIsMarket(state);

    // 6b. Staff candidate market refreshes weekly (§10.7)
    if (state.staffNextRefreshDay == null || state.day >= state.staffNextRefreshDay) {
      Sim.refreshStaffMarket(state);
      state.staffNextRefreshDay = state.day + C.STAFF_REFRESH_DAYS;
    }

    // 7. New offers — §10.6: the shop is closed on Sunday, no offer batch
    var di = Engine.dateInfo(state.day, state);
    if (!di.isSunday) Engine.Jobs.generateOffers(state, summary);

    // 8. Monthly billing on the 1st
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
    // §10.7/§11.5: staff wages from the fixed level table, year-rescaled on
    // the 1st, listed in the summary.
    for (var w = 0; w < (state.staff || []).length; w++) {
      var member = state.staff[w];
      var role = Engine.staffRoleById(member.role);
      member.skill = Engine.staffSkillFor(member.level || 1);
      member.wageMonthly = Engine.staffWageFor(year, member.skill,
                                               role ? role.wageFactor : 1);
      charge('Wages — ' + member.name + ' (' +
             (member.title || (role ? role.name : member.role)) + ')',
             member.wageMonthly);
    }
  };

  // ------------------------------------------------------------------
  // §10.7/§11.5: staff candidate market (2-4 candidates, weekly refresh).
  // Candidates only ever spawn L1-L2 — elite talent must be grown in-house.
  // ------------------------------------------------------------------
  Sim.refreshStaffMarket = function (state) {
    var C = CFG();
    var F = Engine.getData().FLAVOR || {};
    var year = Engine.currentYear(state);
    var roles = Engine.staffRoles().filter(function (r) {
      return r.minYear == null || year >= r.minYear;
    });
    if (!roles.length) { state.staffMarket = []; return; }
    var n = Engine.randInt(C.STAFF_CANDIDATES_MIN, C.STAFF_CANDIDATES_MAX);
    var out = [];
    for (var i = 0; i < n; i++) {
      var role = Engine.pick(roles);
      var level = Engine.randInt(1, C.STAFF_CANDIDATE_MAX_LEVEL);
      var skill = Engine.staffSkillFor(level);
      out.push({
        id: 'c' + (state.staffNextId = (state.staffNextId || 1) + 1),
        name: (Engine.pick(F.firstNames || ['Jo']) || 'Jo') + ' ' +
              (Engine.pick(F.lastNames || ['Doe']) || 'Doe'),
        role: role.id,
        level: level,
        xp: C.STAFF_LEVEL_THRESHOLDS[level - 1],
        skill: skill,
        title: Engine.staffTitleFor(role, level),
        wageMonthly: Engine.staffWageFor(year, skill, role.wageFactor)
      });
    }
    state.staffMarket = out;
  };

  // ------------------------------------------------------------------
  // §13.1 Tech Chronicle — a dated almanac of real computing history, distinct
  // from the §2.7 market-event system: never touches prices/demand. Entries
  // fire as news exactly on their date; getChronicle() (api.js) separately
  // exposes the full history up to today regardless of whether the game was
  // even running on the entry's exact date.
  // ------------------------------------------------------------------
  Sim.fireChronicle = function (state) {
    var entries = Engine.getData().CHRONICLE;
    if (!Array.isArray(entries) || !entries.length) return;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || !e.date) continue;
      if (Engine.dayIndexOfISO(e.date, state) === state.day) {
        Engine.pushNews(state, 'chronicle', e.headline || '', e.body || '');
      }
    }
  };

  // ------------------------------------------------------------------
  // §13.2 Milestone Wiki articles — fire a one-time news note the first time
  // the calendar crosses an article's unlock point. getArticles()/getArticle()
  // (api.js) compute unlock state live from the date, independent of this
  // bookkeeping flag; state.articlesSeen only dedups the news firing.
  // ------------------------------------------------------------------
  Sim.articleUnlocked = function (a, state) {
    if (!a) return false;
    if (a.unlockDate) return state.day >= Engine.dayIndexOfISO(a.unlockDate, state);
    return Engine.currentYear(state) >= (a.unlockYear || 0);
  };
  Sim.articleUnlockCheck = function (state) {
    var arts = Engine.getData().ARTICLES;
    if (!Array.isArray(arts) || !arts.length) return;
    state.articlesSeen = state.articlesSeen || [];
    for (var i = 0; i < arts.length; i++) {
      var a = arts[i];
      if (!a || !a.id || state.articlesSeen.indexOf(a.id) !== -1) continue;
      if (Sim.articleUnlocked(a, state)) {
        state.articlesSeen.push(a.id);
        Engine.pushNews(state, 'chronicle', 'New Wiki article: ' + (a.title || a.id),
          a.summary || '');
      }
    }
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
    // §13.4: certification prestigeBonus nudges the eligible tier, capped.
    eligible = Math.min(C.PRESTIGE_TIERS.length - 1,
                        eligible + Engine.certPrestigeBonus(state));
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
