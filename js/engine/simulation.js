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
             certsEarned: [],            // §13.4 certifications completed since last morning
             achievements: [],           // §15.5 achievements unlocked since last morning
             accountJobs: [],            // §15.4 auto-accepted retainer jobs overnight
             deliveries: [],             // §18.1 distributor orders that arrived overnight
             scenarioComplete: null };   // §15.2 {grade, score, name} when a scenario ends
  };

  /* Run ONE calendar night. Steps numbered per SPEC §5.3. */
  Sim.processNight = function (state, summary) {
    var C = CFG();

    // 1. Advance the clock. Overtime (§9.4): a negative hoursLeft carries into
    // the morning — hoursLeft = 8 + carried, never below OVERTIME_MORNING_MIN.
    var carried = Math.min(0, state.hoursLeft || 0);
    state.day += 1;
    state.hoursLeft = Engine.round1(carried < 0 ?           // §14.8: 0.1h grid
      Math.max(C.OVERTIME_MORNING_MIN, state.hoursPerDay + carried) :
      state.hoursPerDay);
    if (carried < 0 && summary) {
      summary.overtimeNote = 'Worked ' + Engine.round1(-carried) +
        'h of overtime — starting today with ' + state.hoursLeft + 'h.';
    }
    state.supplyRunDoneToday = false;
    state.workedToday = [];
    state.declinesToday = 0;
    state.arrivedToday = {};   // §19.9: cleared each morning before deliveries
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
    // 2d. §15.1 Era transitions: warning -> start -> end news bookkeeping.
    Sim.updateTransitions(state);

    // 3. Nightly price noise + history
    Engine.Pricing.nightlyUpdate(state);

    // 4. Deadline sweep + offer expiry
    Engine.Jobs.deadlineSweep(state, summary);

    // 5. Warranty callback arrivals
    Engine.Jobs.processCallbacks(state, summary);

    // 5b. §18.1: distributor orders arriving this morning land in inventory
    Sim.deliverOrders(state, summary);

    // 6. As-is market churn
    Engine.Jobs.refreshAsIsMarket(state);

    // 6c. §18.1: weekly distributor deal rotation (Mondays; first night seeds).
    // Rolls for EVERY era-active distributor regardless of unlock so player
    // pace/prestige can never shift the market stream's draw count (§17.5).
    Sim.rotateDeals(state);

    // 6b. Staff candidate market refreshes weekly (§10.7)
    if (state.staffNextRefreshDay == null || state.day >= state.staffNextRefreshDay) {
      Sim.refreshStaffMarket(state);
      state.staffNextRefreshDay = state.day + C.STAFF_REFRESH_DAYS;
    }

    // 7. New offers — §10.6: the shop is closed on Sunday, no offer batch
    var di = Engine.dateInfo(state.day, state);
    if (!di.isSunday) Engine.Jobs.generateOffers(state, summary);
    // 7b. §15.4: business-account auto-jobs land on open days too
    if (!di.isSunday) Engine.Jobs.generateAccountJobs(state, summary);

    // 8. Monthly billing on the 1st
    if (di.isFirstOfMonth) Sim.monthlyBilling(state, summary, di);

    // 9. Custom-build unlock check
    Sim.unlockCheck(state);

    // 10. Grace / bankruptcy
    Sim.graceCheck(state, summary);

    // 11. Prestige recompute (never demotes)
    Sim.prestigeRecompute(state);

    // 12. §15.4: an account walks if the rolling rating breaches its floor or
    // the shop failed too many of its jobs this month.
    Sim.accountHealthCheck(state, summary);

    // 13. §15.2: scenario end-date check (a completion, NOT a game over)
    Sim.scenarioCheck(state, summary);

    // 14. §15.5: achievements sweep (unlocks surface in the morning summary)
    Sim.checkAchievements(state, summary);

    // 15. §16.2b: nightly cumulative-net sample feeding the trailing 14-day
    // daily-net average behind the shop-upgrade payback estimate. Lazily
    // created — a v7 save without it simply starts sampling tonight.
    var lt = state.ledger.lifetime;
    state.netHistory = state.netHistory || [];
    state.netHistory.push({
      day: state.day,
      cum: Engine.round2(lt.revenue - lt.partsCost - lt.fixedCosts - lt.other)
    });
    while (state.netHistory.length > CFG().NET_HISTORY_DAYS + 1)
      state.netHistory.shift();
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

    // Random events: ~4%/template/night, era-gated, max 2 active random events.
    // §15.6: difficulty scales the firing chance of NEGATIVE templates only
    // (price spikes / demand slumps); positive ones fire at the same rate.
    var year = Engine.currentYear(state);
    var templates = DATA.RANDOM_EVENT_TEMPLATES || [];
    var negMult = Engine.difficultyFor(state).negEventMult || 1;
    for (i = 0; i < templates.length; i++) {
      var t = templates[i];
      var activeRandom = state.market.activeEvents.filter(function (e) {
        return e.kind === 'random' && !e.playerFired;   // §17.5: world noise only
      }).length;
      if (activeRandom >= C.MAX_RANDOM_EVENTS) break;
      if (year < (t.minYear || 0) || year > (t.maxYear || 9999)) continue;
      var chance = C.RANDOM_EVENT_NIGHTLY_CHANCE * (t.weight || 1) / 2;
      if (negMult !== 1 && Sim.isNegativeEventTemplate(t)) chance *= negMult;
      if (!Engine.chance(chance, 'market')) continue;   // §17.5
      Sim.fireRandomEvent(state, t);
    }
  };
  // §15.6 heuristic: an event template is "negative" when it slumps job volume
  // or spikes prices (harder buying). Tunable-free, works on any template shape.
  Sim.isNegativeEventTemplate = function (t) {
    if (!t) return false;
    if ((t.jobVolumeMult || 1) < 1) return true;
    return (t.effects || []).some(function (ef) {
      var pm = ef && ef.priceMult;
      if (Array.isArray(pm)) pm = (pm[0] + pm[1]) / 2;
      return (pm || 1) > 1;
    });
  };

  function copyEffect(ef, stream) {
    var str = typeof stream === 'string' ? stream : 'market';   // .map passes an index
    var out = { categories: (ef.categories || []).slice(), priceMult: ef.priceMult };
    if (Array.isArray(ef.priceMult))
      out.priceMult = Engine.round2(Engine.uniform(ef.priceMult[0], ef.priceMult[1], str));
    if (ef.tags) out.tags = ef.tags.slice();
    return out;
  }

  // §17.5: nightly world rolls draw on 'market' (default); PLAYER-triggered
  // fires (prestige press coverage) pass 'misc' so player pace can never
  // reshuffle the world's as-is/event trajectory.
  Sim.fireRandomEvent = function (state, t, durationOverride, stream) {
    var str = stream || 'market';
    var dur = durationOverride ||
      (Array.isArray(t.durationDays) ? Engine.randInt(t.durationDays[0], t.durationDays[1], str)
                                     : (t.durationDays || 30));
    var headline = Array.isArray(t.headlines) ? Engine.pick(t.headlines, str)
                                              : (t.headlines || t.headline || t.id);
    var inst = {
      id: t.id + '#' + state.day, kind: 'random', name: headline, headline: headline,
      startDay: state.day, endDay: state.day + dur,
      effects: (t.effects || []).map(function (ef) { return copyEffect(ef, str); }),
      jobVolumeMult: t.jobVolumeMult || 1
    };
    // Player-triggered fires don't count against the world's random-event cap
    // (§17.5: the nightly roll count must not depend on player pace).
    if (str === 'misc') inst.playerFired = true;
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
    // §15.6 difficulty + §15.2 scenario rent modifiers stack multiplicatively.
    // §17.4: Survival adds compounding quarterly rent creep, capped.
    var diffSet = Engine.difficultyFor(state);
    var rentMult = diffSet.rentMult || 1;
    if (diffSet.rentCreepQuarterly > 0) {
      var quarters = Math.floor(state.day / 91);
      rentMult *= Math.min(diffSet.rentCreepCap || 999,
                           Math.pow(1 + diffSet.rentCreepQuarterly, quarters));
    }
    var scen = Engine.currentScenario(state);
    if (scen && scen.modifiers && scen.modifiers.rentMult > 0)
      rentMult *= scen.modifiers.rentMult;
    charge('Rent (' + tier.name + ')', (tier.rentBase || 0) * scale * rentMult);
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
    // §15.3: interest on the drawn credit balance, billed with the rent.
    // Interest CAN drag cash negative, but the drawn balance itself never
    // touches the grace clock (see graceCheck — it only reads state.cash).
    var credit = state.credit || { drawn: 0 };
    if (credit.drawn > 0) {
      var apr = Engine.creditAprFor(year);
      charge('Credit interest (' + Math.round(apr * 100) + '% APR on ' +
             Engine.fmtMoney(credit.drawn) + ')',
             credit.drawn * apr / 12);
    }
    // §15.4: business-account retainers pay on the 1st (revenue), and each
    // account's monthly job/fail counters reset for the new month.
    for (var a = 0; a < (state.accounts || []).length; a++) {
      var acct = state.accounts[a];
      var fee = Engine.round2(acct.monthlyFee || 0);
      if (fee > 0) {
        Engine.addCash(state, fee);
        Engine.ledgerAdd(state, 'revenue', fee);
        summary.payouts.push({ label: 'Retainer — ' + acct.name, amount: fee });
      }
      acct.jobsThisMonth = 0;
      acct.failsThisMonth = 0;
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
    var n = Engine.randInt(C.STAFF_CANDIDATES_MIN, C.STAFF_CANDIDATES_MAX, 'misc');
    var out = [];
    for (var i = 0; i < n; i++) {
      var role = Engine.pick(roles, 'misc');
      var level = Engine.randInt(1, C.STAFF_CANDIDATE_MAX_LEVEL, 'misc');
      var skill = Engine.staffSkillFor(level);
      out.push({
        id: 'c' + (state.staffNextId = (state.staffNextId || 1) + 1),
        name: (Engine.pick(F.firstNames || ['Jo'], 'misc') || 'Jo') + ' ' +
              (Engine.pick(F.lastNames || ['Doe'], 'misc') || 'Doe'),
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
    var f = state.flags;
    // §15.6: grace length comes from the difficulty set (14 at Standard).
    // §15.3: drawn credit is a LIABILITY, not negative cash — only state.cash
    // below zero ticks this clock (interest can drag it there, though).
    var graceDays = Engine.difficultyFor(state).graceDays || CFG().GRACE_DAYS;
    if (state.cash < 0) {
      // §15.2: scenario scoring counts every day spent in the red
      state.ledger.lifetime.graceDays = (state.ledger.lifetime.graceDays || 0) + 1;
      if (f.graceDeadlineDay == null) {
        f.graceDeadlineDay = state.day + graceDays;
        Engine.pushNews(state, 'warning', 'The account is overdrawn',
          'Creditors give you ' + graceDays + ' days to get back in the black.');
      }
      if (state.day > f.graceDeadlineDay) {
        f.gameOver = true;
        f.gameOverReason = 'Bankruptcy — the creditors called time.';
        summary.gameOver = true;
        Engine.pushNews(state, 'warning', 'Bankrupt',
          'The shutters come down for the last time.');
        return;
      }
      var daysLeft = f.graceDeadlineDay - state.day;
      summary.graceWarning = 'Cash negative — ' + daysLeft + ' day' +
        (daysLeft === 1 ? '' : 's') + ' to recover';
    } else if (f.graceDeadlineDay != null) {
      f.graceDeadlineDay = null;
      Engine.recordAchievementEvent(state, 'grace-recovered');   // §15.5
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
      // §17.5: player-earned promotion — draws ride 'misc', not 'market'.
      // PRESS_BOOST_DAYS governs PROMOTION-fired press (the data template's
      // own 14-30d range stays authoritative for world-rolled instances):
      // early tiers land close together, and back-to-back 20-30d boosts
      // overlapped into a near-permanent +1..+2 offer ramp at 1983.
      if (press) Sim.fireRandomEvent(state, press, C.PRESS_BOOST_DAYS, 'misc');
      else Sim.fireRandomEvent(state, {
        id: 'press-coverage', headlines: ['Local press covers the rising shop'],
        body: 'A nice write-up brings the customers in.',
        durationDays: [C.PRESS_BOOST_DAYS, C.PRESS_BOOST_DAYS],
        effects: [], jobVolumeMult: C.PRESS_BOOST_MULT
      }, C.PRESS_BOOST_DAYS, 'misc');
    }
  };

  // ------------------------------------------------------------------
  // §15.1 Era transitions — warning/start/end news bookkeeping. The economic
  // effects (demandMix weights, obsolete-tag price bleed, staff penalty) are
  // computed LIVE from the date everywhere else; state.transitionsFired only
  // dedups the news so each fires exactly once per save.
  // ------------------------------------------------------------------
  Sim.updateTransitions = function (state) {
    var list = Engine.transitionsData();
    if (!list.length) return;
    state.transitionsFired = state.transitionsFired || {};
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var w = Engine.transitionWindow(t, state);
      var rec = state.transitionsFired[t.id] ||
                { warned: false, started: false, ended: false };
      if (!rec.warned && state.day >= w.warnDay) {
        // A late warning after the start would read backwards — skip it then.
        if (state.day < w.startDay && t.newsLead) {
          Engine.pushNews(state, 'transition', t.newsLead,
            'Industry chatter says a platform shift is coming. Staff will need ' +
            'retraining, and stock on the old standard will bleed value once it lands.');
        }
        rec.warned = true;
      }
      if (!rec.started && state.day >= w.startDay && state.day < w.endDay) {
        Engine.pushNews(state, 'transition', 'Transition underway: ' + (t.name || t.id),
          (t.body || '') + (Engine.transitionBoostTypes(t).length ?
            ' Retrain the crew — unretrained techs work the hot job types at half effect.' : ''));
        rec.started = true;
        rec.warned = true;
      }
      if (!rec.ended && state.day >= w.endDay) {
        Engine.pushNews(state, 'transition', 'The dust settles: ' + (t.name || t.id),
          'The market has moved on. The new platform is simply how things are now.');
        rec.ended = true;
        rec.started = true;
        rec.warned = true;
        // §15.5: rode it out with the whole crew retrained (needs a crew)
        if ((state.staff || []).length > 0 &&
            state.staff.every(function (m) {
              return (m.retrainedFor || []).indexOf(t.id) !== -1;
            })) {
          Engine.recordAchievementEvent(state, 'transition-retrained');
        }
      }
      state.transitionsFired[t.id] = rec;
    }
  };

  // ------------------------------------------------------------------
  // §15.4 Business accounts — nightly health check: an account cancels (with
  // a rep hit) when the rolling rating breaches its floor or the shop failed
  // ACCOUNT_FAILS_CANCEL of its jobs inside one month.
  // ------------------------------------------------------------------
  Sim.accountHealthCheck = function (state, summary) {
    var C = CFG();
    var accounts = state.accounts || [];
    for (var i = accounts.length - 1; i >= 0; i--) {
      var acct = accounts[i];
      var reason = null;
      if (state.reputation.rating < acct.minRating)
        reason = 'the shop rating fell below ' + acct.minRating.toFixed(1);
      else if ((acct.failsThisMonth || 0) >= C.ACCOUNT_FAILS_CANCEL)
        reason = 'too many of their jobs failed this month';
      if (!reason) continue;
      accounts.splice(i, 1);
      Engine.pushScore(state, C.ACCOUNT_CANCEL_SCORE,
        { title: 'Account: ' + acct.name, reasons: ['lost a business account'] });
      Engine.pushNews(state, 'money', 'Account cancelled: ' + acct.name,
        'They pulled the retainer — ' + reason + '. Word travels in business circles.');
      if (summary) summary.expired.push('Business account: ' + acct.name + ' (cancelled)');
    }
  };

  // ------------------------------------------------------------------
  // §15.2 Scenario completion — reaching endDate ENDS the run (completion
  // screen, not game over). The result is computed and FROZEN here so
  // continueSandbox() can't retroactively change the grade.
  // ------------------------------------------------------------------
  function scenarioStatValue(state, stat) {
    var lt = state.ledger.lifetime;
    switch (stat) {
      case 'cash': return state.cash;
      case 'rating': return state.reputation.rating;
      case 'prestige': return state.reputation.prestige;
      case 'jobsCompleted': return lt.jobsCompleted || 0;
      case 'jobsFailed': return lt.jobsFailed || 0;
      case 'buildsDelivered': return lt.buildsDelivered || 0;
      case 'refurbsSold': return lt.refurbsSold || 0;
      case 'revenue': return lt.revenue || 0;
      case 'contractsFailed': return lt.contractsFailed || 0;
      case 'graceDays': return lt.graceDays || 0;
      case 'callbacks': return state.reputation.callbacks || 0;
      default: return 0;
    }
  }
  var LOWER_IS_BETTER_STATS = ['contractsFailed', 'graceDays', 'jobsFailed', 'callbacks'];
  /* Engine scoring contract (documented beside DATA.SCENARIOS):
   * score = round(cash*cashWeight + rating*ratingWeight) + earned bonus pts.
   * Lower-is-better stats earn their bonus at value <= threshold; the rest
   * at value >= threshold. */
  Sim.computeScenarioResult = function (state, scen) {
    var C = CFG();
    var scoring = (scen && scen.scoring) || {};
    var cashPts = Math.round((state.cash || 0) * (scoring.cashWeight || 0));
    var ratingPts = Math.round(state.reputation.rating * (scoring.ratingWeight || 0));
    var lines = [
      { label: 'Banked cash', value: Engine.fmtMoney(state.cash), points: cashPts },
      { label: 'Reputation', value: state.reputation.rating.toFixed(2) + ' of 5',
        points: ratingPts }
    ];
    var score = cashPts + ratingPts;
    var bonuses = scoring.bonus || [];
    for (var i = 0; i < bonuses.length; i++) {
      var b = bonuses[i];
      if (!b || !b.stat) continue;
      var v = scenarioStatValue(state, b.stat);
      var met = LOWER_IS_BETTER_STATS.indexOf(b.stat) !== -1 ?
        v <= b.threshold : v >= b.threshold;
      var pts = met ? (b.points || 0) : 0;
      score += pts;
      lines.push({ label: b.label || b.stat,
                   value: met ? 'achieved' : 'missed (' + v + ')',
                   points: pts });
    }
    var grade = 'D';
    var grades = C.SCENARIO_GRADES || [];
    for (var g = 0; g < grades.length; g++) {
      if (score >= grades[g].min) { grade = grades[g].grade; break; }
    }
    return { score: score, grade: grade, lines: lines,
             name: (scen && scen.name) || (state.scenario && state.scenario.id) || '' };
  };
  Sim.scenarioCheck = function (state, summary) {
    var sc = state.scenario;
    if (!sc || !sc.active || state.flags.gameOver) return;
    if (state.day < sc.endDay) return;
    var scen = Engine.scenarioById(sc.id);
    var result = Sim.computeScenarioResult(state, scen);
    sc.active = false;
    sc.completed = true;
    sc.result = result;   // frozen — sandbox play afterwards can't change it
    Engine.recordAchievementEvent(state, 'scenario-complete');
    Engine.recordAchievementEvent(state, 'scenario-grade-' + result.grade);
    Engine.pushNews(state, 'system', 'Scenario complete: ' + result.name,
      'Final grade ' + result.grade + ' (' + result.score + ' points). ' +
      'Start a fresh game or keep the shop running in sandbox.');
    if (summary) summary.scenarioComplete =
      { grade: result.grade, score: result.score, name: result.name };
  };

  // ------------------------------------------------------------------
  // §18.1 Distributors — wholesale supply relationships. Cheaper-but-slower
  // vs instant retail: upfront payment, lead days, weekly Monday deals,
  // loyalty tiers, and one honest gray-market channel per broad era.
  // ------------------------------------------------------------------
  // Defensive fallback so the engine (and mock runs) work before/without the
  // DATA workstream's authored DATA.DISTRIBUTORS table.
  var DIST_FALLBACK = [
    { id: 'heartland-mail', name: 'Heartland Components Mail-Order',
      minYear: 1983, maxYear: 1996, minPrestige: 0, baseDiscount: 0.05,
      leadDays: 4, specialty: ['ram', 'storage'], grayMarket: false,
      blurb: 'A catalog house out of Des Moines. Allow four business days ' +
             'and check the money order twice.' },
    { id: 'valley-wholesale', name: 'Valley Micro Wholesale',
      minYear: 1991, maxYear: 2006, minPrestige: 1, baseDiscount: 0.07,
      leadDays: 3, specialty: ['cpu', 'motherboard'], grayMarket: false,
      blurb: 'The regional distributor every white-box builder knows. ' +
             'Net terms are for shops they trust.' },
    { id: 'partstream', name: 'PartStream Online Supply',
      minYear: 2003, minPrestige: 1, baseDiscount: 0.06,
      leadDays: 2, specialty: null, grayMarket: false,
      blurb: 'Web storefront, real warehouse. The tracking page actually works.' },
    { id: 'swap-meet', name: 'Sunday Swap Meet Stalls',
      minYear: 1983, minPrestige: 0, baseDiscount: 0.18,
      leadDays: 1, specialty: null, grayMarket: true,
      blurb: 'Cash only, no receipts, no questions. The prices are great ' +
             'and the failure rate is your problem.' }
  ];
  Sim.distributorTable = function () {
    var t = Engine.getData().DISTRIBUTORS;
    return (Array.isArray(t) && t.length) ? t : DIST_FALLBACK;
  };

  // Lazy state block (v9 saves carry it; lazy-init keeps old fixtures safe).
  Sim.distState = function (state) {
    if (!state.distributors) {
      state.distributors = { spend: {}, tier: {}, deals: {}, lastDealDay: -1 };
    }
    if (!state.pendingOrders) state.pendingOrders = [];
    if (!state.grayStock) state.grayStock = {};
    if (state.nextOrderId == null) state.nextOrderId = 1;
    return state.distributors;
  };

  // Era-active distributors — YEAR-dependent only (never player-dependent),
  // so weekly deal rotation consumes a stable number of market-stream draws.
  Sim.eraDistributors = function (state) {
    var year = Engine.currentYear(state);
    return Sim.distributorTable().filter(function (d) {
      return year >= (d.minYear || 0) && year <= (d.maxYear || 9999);
    });
  };
  function distById(state, id) {
    var list = Sim.eraDistributors(state);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // Relationship: lifetime spend vs year-scaled thresholds; promotions are
  // sticky (a relationship, once earned, does not regress).
  function relThreshold(state, tierIdx) {
    return Engine.laborRate(Engine.currentYear(state)) *
           CFG().DIST_REL_LABOR_MULTS[tierIdx];
  }
  function computedRelTier(state, distId) {
    var ds = Sim.distState(state);
    var spend = ds.spend[distId] || 0;
    var tier = 0;
    for (var t = 1; t < CFG().DIST_REL_LABOR_MULTS.length; t++) {
      if (spend >= relThreshold(state, t)) tier = t;
    }
    return tier;
  }
  Sim.distRelationship = function (state, distId) {
    var ds = Sim.distState(state);
    return Math.max(ds.tier[distId] || 0, computedRelTier(state, distId));
  };

  // Category price pressure from active events (copyEffect resolves priceMult
  // to a number). >1.05 = shortage, <0.95 = glut. Tag-scoped effects are
  // ignored here — deals trade in whole categories.
  function categoryEventMult(state, category) {
    var mult = 1;
    var evs = state.market.activeEvents || [];
    for (var i = 0; i < evs.length; i++) {
      var effs = evs[i].effects || [];
      for (var j = 0; j < effs.length; j++) {
        var ef = effs[j];
        if (!ef || typeof ef.priceMult !== 'number') continue;
        if ((ef.categories || []).indexOf(category) !== -1) mult *= ef.priceMult;
      }
    }
    return mult;
  }
  Sim.isShortageCategory = function (state, cat) {
    return categoryEventMult(state, cat) > 1.05;
  };
  Sim.isGlutCategory = function (state, cat) {
    return categoryEventMult(state, cat) < 0.95;
  };

  function purchasablePool(state, categories) {
    var pool = [];
    var seen = {};
    var parts = Engine.getData().PARTS || [];
    for (var i = 0; i < parts.length; i++) {
      var cat = parts[i].category;
      if (categories && categories.indexOf(cat) === -1) continue;
      if (!seen[cat]) {
        seen[cat] = Engine.Jobs.purchasableByCategory(state, cat);
      }
    }
    Object.keys(seen).forEach(function (c) { pool = pool.concat(seen[c]); });
    return pool;
  }

  /* Weekly Monday deal rotation (market stream). The first night after boot
   * seeds an initial set so a mid-week start still has a supplier page. */
  Sim.rotateDeals = function (state) {
    var C = CFG();
    var ds = Sim.distState(state);
    var di = Engine.dateInfo(state.day, state);
    if (ds.lastDealDay >= 0 && di.weekday !== 1) return;
    if (ds.lastDealDay === state.day) return;
    ds.lastDealDay = state.day;
    var expires = state.day + 7;
    var list = Sim.eraDistributors(state);
    var newDeals = {};
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var n = Engine.randInt(C.DIST_DEALS_PER_WEEK[0], C.DIST_DEALS_PER_WEEK[1], 'market');
      var deals = [];
      for (var k = 0; k < n; k++) {
        var lean = Engine.chance(C.DIST_DEAL_SPECIALTY_CHANCE, 'market');
        var pool = (lean && d.specialty && d.specialty.length) ?
          purchasablePool(state, d.specialty) : purchasablePool(state, null);
        if (!pool.length) pool = purchasablePool(state, null);
        if (!pool.length) continue;
        var part = Engine.pick(pool, 'market');
        var disc = Engine.uniform(C.DIST_DEAL_RANGE[0], C.DIST_DEAL_RANGE[1], 'market');
        var glut = Sim.isGlutCategory(state, part.category);
        if (glut) disc += C.DIST_DEAL_GLUT_BONUS;   // gluts cut deeper
        disc = Math.min(C.DIST_DEAL_CAP, Engine.round2(disc));
        deals.push({ partId: part.id, dealDiscount: disc,
                     maxQty: Engine.randInt(C.DIST_DEAL_MAXQTY[0], C.DIST_DEAL_MAXQTY[1], 'market'),
                     bought: 0, expiresDay: expires, glut: glut });
      }
      newDeals[d.id] = deals;
    }
    ds.deals = newDeals;
  };

  /* Resolve a stored deal against TODAY's world: expiry, remaining units, and
   * the shortage rule — deals on shorted categories vanish, except
   * Preferred+ keeps a small list-price allocation (the loyalty payoff). */
  function resolveDeal(state, dl, rel) {
    if (state.day >= dl.expiresDay) return null;
    var part = Engine.partById(dl.partId);
    if (!part) return null;
    var remaining = dl.maxQty - (dl.bought || 0);
    if (remaining <= 0) return null;
    if (Sim.isShortageCategory(state, part.category)) {
      if (rel < 2) return null;
      var allocCap = Math.min(CFG().DIST_ALLOC_QTY, dl.maxQty);
      remaining = Math.min(remaining, allocCap - (dl.bought || 0));
      if (remaining <= 0) return null;
      return { dl: dl, part: part, allocation: true, discount: 0,
               remaining: remaining, glut: false };
    }
    return { dl: dl, part: part, allocation: false, discount: dl.dealDiscount,
             remaining: remaining, glut: !!dl.glut };
  }
  function liveDealFor(state, dist, partId, rel) {
    var deals = Sim.distState(state).deals[dist.id] || [];
    for (var i = 0; i < deals.length; i++) {
      if (deals[i].partId !== partId) continue;
      var live = resolveDeal(state, deals[i], rel);
      if (live) return live;
    }
    return null;
  }

  function distUnlockInfo(state, dist) {
    var need = dist.minPrestige || 0;
    if ((state.reputation.prestige || 0) >= need) return { unlocked: true };
    var tiers = CFG().PRESTIGE_TIERS;
    var label = (tiers[need] && tiers[need].label) || ('prestige ' + need);
    return { unlocked: false,
             lockedReason: 'Requires shop prestige "' + label + '"' };
  }
  function partIsOrderable(state, part) {
    var list = Engine.Jobs.purchasableByCategory(state, part.category);
    for (var i = 0; i < list.length; i++) if (list[i].id === part.id) return true;
    return false;
  }
  function effLeadDays(dist, rel) {
    var C = CFG();
    var lead = dist.leadDays || 3;
    if (rel >= 3) lead -= C.DIST_PARTNER_LEAD_CUT;   // Partner perk
    return Math.max(C.DIST_LEAD_MIN, lead);
  }

  /* Price a prospective order WITHOUT side effects (UI live preview uses
   * this; placeOrder builds on it). Deal pricing stacks with relationship
   * but NOT bulk tiers; shortage allocations are strictly list price. */
  Sim.quoteOrder = function (state, distributorId, partId, qty) {
    var C = CFG();
    var dist = distById(state, distributorId);
    if (!dist) return { ok: false, error: 'No such distributor this era' };
    var un = distUnlockInfo(state, dist);
    if (!un.unlocked) return { ok: false, error: un.lockedReason };
    var part = Engine.partById(partId);
    if (!part) return { ok: false, error: 'Unknown part' };
    qty = Math.floor(Number(qty));
    if (!(qty >= 1)) return { ok: false, error: 'Order at least one unit' };
    if (qty > 99) return { ok: false, error: 'Distributors cap single orders at 99 units' };
    if (!partIsOrderable(state, part)) {
      return { ok: false, error: part.name + ' is not in this year’s catalogs' };
    }
    var rel = Sim.distRelationship(state, dist.id);
    var retail = Engine.Pricing.priceOf(part, state, { buy: true });
    var disc = (dist.baseDiscount || 0) + (C.DIST_REL_DISCOUNTS[rel] || 0);
    if (dist.specialty && dist.specialty.indexOf(part.category) !== -1) {
      disc += C.DIST_SPECIALTY_BONUS;
    }
    var live = liveDealFor(state, dist, partId, rel);
    var isDeal = false, isAlloc = false;
    if (live && qty <= live.remaining) {
      isDeal = true; isAlloc = live.allocation;
      disc = isAlloc ? 0 : disc + live.discount;
    } else {
      for (var t = 0; t < C.DIST_QTY_TIERS.length; t++) {
        if (qty >= C.DIST_QTY_TIERS[t].qty) { disc += C.DIST_QTY_TIERS[t].disc; break; }
      }
    }
    disc = Math.min(C.DIST_TOTAL_DISC_CAP, Engine.round2(disc));
    var lead = effLeadDays(dist, rel);
    var unitCost = Engine.round2(retail * (1 - disc));
    return { ok: true, distributorId: dist.id, partId: part.id, qty: qty,
             unitCost: unitCost, total: Engine.round2(unitCost * qty),
             discount: disc, retailUnit: retail,
             leadDays: lead, arrivesDay: state.day + lead,
             deal: isDeal, allocation: isAlloc, gray: !!dist.grayMarket };
  };

  // Is this era-active distributor unlocked for the shop's current prestige?
  // (Trivial public wrapper over distUnlockInfo — §20.3's getSourceCatalog
  // needs a locked/unlocked read without duplicating the prestige-gate logic.)
  Sim.distUnlocked = function (state, distributorId) {
    var d = distById(state, distributorId);
    if (!d) return false;
    return distUnlockInfo(state, d).unlocked;
  };

  /* §20.1: the money/relationship/deal/pendingOrders side of a distributor
   * order, factored out of placeOrder so the shopping cart's checkout can
   * reuse it WITHOUT re-charging cash or re-spending hours (the cart bills
   * one flat CHECKOUT_HOURS for the whole checkout, not per line). Splits
   * the quoted qty across jobLinks (§20.2 job-linked cart lines) — placeOrder
   * itself always passes [] (whole qty, no job attribution, exactly the old
   * single-pendingOrder shape). Callers charge q.total themselves. */
  Sim.applyOrderExecution = function (state, dist, part, q, jobLinks) {
    var C = CFG();
    var base = { source: 'dist', distributorId: dist.id, partId: part.id,
                 partName: part.name, distName: dist.name, gray: !!dist.grayMarket };
    var orders = Engine.pushSplitOrders(state, base, q.qty, q.unitCost, q.arrivesDay, jobLinks);
    var ds = Sim.distState(state);
    var dealRemaining = null;
    if (q.deal) {
      var rel0 = Sim.distRelationship(state, dist.id);
      var live = liveDealFor(state, dist, part.id, rel0);
      if (live) {
        live.dl.bought = (live.dl.bought || 0) + q.qty;
        // §19.9 (#11): the caller re-renders the row from this, immediately
        var after = resolveDeal(state, live.dl, rel0);
        dealRemaining = after ? after.remaining : 0;
      }
    }
    // Relationship accrual + sticky promotion
    ds.spend[dist.id] = Engine.round2((ds.spend[dist.id] || 0) + q.total);
    var before = ds.tier[dist.id] || 0;
    var now = computedRelTier(state, dist.id);
    var promoted = null;
    if (now > before) {
      ds.tier[dist.id] = now;
      promoted = C.DIST_REL_LABELS[now];
      Engine.pushNews(state, 'prestige',
        dist.name + ' upgraded you to ' + promoted,
        'Lifetime business earned it: ' +
        (C.DIST_REL_DISCOUNTS[now] * 100).toFixed(0) + '% loyalty discount' +
        (now >= 3 ? ', a day off every lead time,' : '') +
        (now >= 2 ? ' and priority allocation during shortages.' : '.'));
    }
    return { orders: orders, dealRemaining: dealRemaining, promoted: promoted };
  };

  Sim.placeOrder = function (state, distributorId, partId, qty) {
    var C = CFG();
    var q = Sim.quoteOrder(state, distributorId, partId, qty);
    if (!q.ok) return q;
    if (state.cash < q.total) {
      return { ok: false, error: 'Distributors want payment up front (' +
               Engine.fmtMoney(q.total) + ')' };
    }
    var sp = Engine.spendHours(state, C.DIST_ORDER_HOURS);   // the paperwork
    if (!sp.ok) return sp;
    Engine.addCash(state, -q.total);
    Engine.ledgerAdd(state, 'partsCost', q.total);
    var dist = distById(state, distributorId);
    var part = Engine.partById(partId);
    var res = Sim.applyOrderExecution(state, dist, part, q, []);
    return { ok: true, orderId: res.orders[0] ? res.orders[0].id : null,
             unitCost: q.unitCost, total: q.total,
             arrivesDay: q.arrivesDay, leadDays: q.leadDays,
             deal: q.deal, allocation: q.allocation,
             dealRemaining: res.dealRemaining,   // §19.9 (#11)
             promoted: res.promoted };
  };

  /* Cancel before ship day only (an order arriving tomorrow is on the truck).
   * 10% restocking fee; refunded spend no longer counts toward loyalty (no
   * place-and-cancel farming), but an earned tier never regresses. */
  Sim.cancelOrder = function (state, orderId) {
    var C = CFG();
    var orders = state.pendingOrders || [];
    var o = null, idx = -1;
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].id === Number(orderId)) { o = orders[i]; idx = i; break; }
    }
    if (!o) return { ok: false, error: 'No such pending order' };
    if (o.arrivesDay - state.day < 2) {
      return { ok: false, error: 'Too late — the ' + o.partName +
               ' order has already shipped' };
    }
    var fee = Engine.round2(o.total * C.DIST_CANCEL_FEE);
    var refund = Engine.round2(o.total - fee);
    Engine.addCash(state, refund);
    Engine.ledgerAdd(state, 'partsCost', -o.total);
    Engine.ledgerAdd(state, 'other', fee);
    var ds = Sim.distState(state);
    ds.spend[o.distributorId] = Math.max(0,
      Engine.round2((ds.spend[o.distributorId] || 0) - refund));
    orders.splice(idx, 1);
    Engine.pushNews(state, 'money', 'Order cancelled: ' + o.partName,
      Engine.fmtMoney(refund) + ' refunded (' + Engine.fmtMoney(fee) +
      ' restocking fee kept).');
    return { ok: true, refund: refund, fee: fee };
  };

  /* Overnight delivery into inventory. Storage rules stay real: a big order
   * can push the shop into overage fees at month end (§16). */
  Sim.deliverOrders = function (state, summary) {
    // §19.3: committed builds whose market parts land this morning
    (state.jobs.active || []).forEach(function (job) {
      if (job.partsArriveDay != null && state.day >= job.partsArriveDay) {
        job.partsArriveDay = null;
        if (summary && summary.deliveries)
          summary.deliveries.push('Build parts for "' + job.title + '"');
        Engine.pushNews(state, 'money', 'Parts delivered',
          'Everything for "' + job.title + '" is on the bench.');
      }
    });
    if (!state.pendingOrders || !state.pendingOrders.length) return;
    var keep = [];
    for (var i = 0; i < state.pendingOrders.length; i++) {
      var o = state.pendingOrders[i];
      if (o.arrivesDay > state.day) { keep.push(o); continue; }
      // §19.3: orders bound to a job slot install themselves on arrival;
      // anything that no longer fits (job gone, slot filled) is shop stock.
      var toStock = o.qty, line;
      if (o.jobId != null) {
        var rec = Engine.Jobs.receiveOrderedParts(state, o);
        toStock = rec.leftover;
        if (rec.landed > 0) {
          line = rec.landed + '× ' + o.partName +
                 (rec.jobTitle ? ' — fitted to "' + rec.jobTitle + '"' : '');
          if (summary && summary.deliveries) summary.deliveries.push(line);
          Engine.pushNews(state, 'money', 'Parts delivered: ' + o.partName,
            rec.landed + ' unit' + (rec.landed > 1 ? 's' : '') +
            (rec.jobTitle ? ' went straight onto "' + rec.jobTitle + '".' :
                            ' arrived.'));
        }
      }
      if (toStock > 0) {
        Engine.inventoryAdd(state, o.partId, toStock, o.unitCost);
        state.arrivedToday = state.arrivedToday || {};
        state.arrivedToday[o.partId] = true;   // §19.9: UI delivery-row flash
        if (o.gray) {
          state.grayStock = state.grayStock || {};
          state.grayStock[o.partId] = (state.grayStock[o.partId] || 0) + toStock;
        }
        line = toStock + '× ' + o.partName + ' from ' + o.distName;
        if (summary && summary.deliveries) summary.deliveries.push(line);
        Engine.pushNews(state, 'money', 'Delivery: ' + o.partName,
          toStock + ' unit' + (toStock > 1 ? 's' : '') + ' from ' + o.distName +
          ' into stock at ' + Engine.fmtMoney(o.unitCost) + ' each.');
      }
    }
    state.pendingOrders = keep;
  };

  /* The Suppliers view: unlocked distributors in full, locked ones listed
   * with a readable reason. Deals are resolved against today's world. */
  Sim.getDistributors = function (state) {
    var C = CFG();
    var ds = Sim.distState(state);
    return Sim.eraDistributors(state).map(function (d) {
      var un = distUnlockInfo(state, d);
      if (!un.unlocked) {
        return { id: d.id, name: d.name, blurb: d.blurb || '',
                 grayMarket: !!d.grayMarket, locked: true,
                 lockedReason: un.lockedReason };
      }
      var rel = Sim.distRelationship(state, d.id);
      var deals = (ds.deals[d.id] || []).map(function (dl) {
        var live = resolveDeal(state, dl, rel);
        if (!live) return null;
        var disc = live.allocation ? 0 :
          Math.min(C.DIST_TOTAL_DISC_CAP, Engine.round2(
            (d.baseDiscount || 0) + (C.DIST_REL_DISCOUNTS[rel] || 0) +
            ((d.specialty && d.specialty.indexOf(live.part.category) !== -1) ?
              C.DIST_SPECIALTY_BONUS : 0) + live.discount));
        return { partId: live.part.id, name: live.part.name,
                 category: live.part.category,
                 dealDiscount: live.allocation ? 0 : live.dl.dealDiscount,
                 unitCost: Engine.round2(
                   Engine.Pricing.priceOf(live.part, state, { buy: true }) * (1 - disc)),
                 maxQty: live.dl.maxQty, remaining: live.remaining,
                 expiresDay: live.dl.expiresDay,
                 allocation: live.allocation, glut: live.glut };
      }).filter(function (x) { return x != null; });
      return { id: d.id, name: d.name, blurb: d.blurb || '',
               locked: false,
               relationship: rel, relationshipLabel: C.DIST_REL_LABELS[rel],
               effDiscount: Engine.round2((d.baseDiscount || 0) +
                                          (C.DIST_REL_DISCOUNTS[rel] || 0)),
               specialtyBonus: C.DIST_SPECIALTY_BONUS,
               leadDays: effLeadDays(d, rel),
               specialty: d.specialty ? d.specialty.slice() : null,
               grayMarket: !!d.grayMarket,
               lifetimeSpend: ds.spend[d.id] || 0,
               nextTierSpend: rel < 3 ? Engine.round2(relThreshold(state, rel + 1)) : null,
               deals: deals };
    });
  };

  /* Pending-orders view with ETA + cancellability (UI list). */
  Sim.getPendingOrders = function (state) {
    Sim.distState(state);
    return (state.pendingOrders || []).map(function (o) {
      return { id: o.id, partId: o.partId, partName: o.partName,
               distributorId: o.distributorId, distName: o.distName,
               qty: o.qty, unitCost: o.unitCost, total: o.total,
               arrivesDay: o.arrivesDay,
               etaDays: Math.max(0, o.arrivesDay - state.day),
               cancellable: (o.arrivesDay - state.day) >= 2,
               gray: !!o.gray };
    });
  };

  // ------------------------------------------------------------------
  // §15.5 Achievements sweep — every check is state-derived (event-driven
  // ones read the counters recorded via Engine.recordAchievementEvent), so a
  // single sweep point can never double-unlock: state.achievements[id] guards.
  // ------------------------------------------------------------------
  Sim.checkAchievements = function (state, summary) {
    if (state.flags.gameOver) return [];
    state.achievements = state.achievements || {};
    var table = Engine.ACHIEVEMENTS || [];
    var unlocked = [];
    for (var i = 0; i < table.length; i++) {
      var a = table[i];
      if (state.achievements[a.id] != null) continue;   // never twice
      var hit = false;
      try { hit = !!a.check(state); } catch (e) { hit = false; }   // never throw
      if (!hit) continue;
      state.achievements[a.id] = state.day;
      unlocked.push(a.name);
      Engine.pushNews(state, 'achievement', 'Achievement: ' + a.name, a.desc || '');
      if (summary && summary.achievements) summary.achievements.push(a.name);
    }
    return unlocked;
  };
})(typeof window !== 'undefined' ? window : globalThis);
