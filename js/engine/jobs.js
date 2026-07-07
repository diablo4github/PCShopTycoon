/* Circuit & Solder — engine/jobs.js
 * Job generation (era gating & weights §5.4), offers, diagnosis, needs/options,
 * installPart, build configurator, workJob (speed & soft workstation cap),
 * completion (payout, rating, callback roll §5.5), data recovery, CRT/ESD
 * mishaps, refurb machines & as-is market, contracts, abandonJob.
 */
(function (root) {
  'use strict';
  var Engine = root.Engine = root.Engine || {};
  var Jobs = Engine.Jobs = {};

  function CFG() { return Engine.CONFIG; }
  function FLAVOR() { return Engine.getData().FLAVOR || {}; }
  function P() { return Engine.Pricing; }

  // ---------- lookup helpers (ids may arrive as strings from the DOM) ----------
  Jobs.findActive = function (state, jobId) {
    var id = Number(jobId);
    for (var i = 0; i < state.jobs.active.length; i++)
      if (state.jobs.active[i].id === id) return state.jobs.active[i];
    return null;
  };
  Jobs.findOffer = function (state, jobId) {
    var id = Number(jobId);
    for (var i = 0; i < state.jobs.offers.length; i++)
      if (state.jobs.offers[i].id === id) return state.jobs.offers[i];
    return null;
  };
  function removeFrom(arr, job) {
    var i = arr.indexOf(job);
    if (i !== -1) arr.splice(i, 1);
  }
  function err(msg) { return { ok: false, error: msg }; }

  function isBuildJob(job) {
    return job.type === 'build' || job.subtype === 'aesthetic' ||
           job.subtype === 'contract_build_custom';
  }

  // Purchasable today: released & not pruned.
  function purchasable(part, state) {
    return P().isReleased(part, state) && !P().isPruned(part, state);
  }
  function purchasableByCategory(state, cat) {
    var parts = Engine.partsByCategory(cat), out = [];
    for (var i = 0; i < parts.length; i++)
      if (purchasable(parts[i], state)) out.push(parts[i]);
    return out;
  }
  Jobs.purchasableByCategory = purchasableByCategory;

  // ------------------------------------------------------------------
  // Offer generation (overnight step 7)
  // ------------------------------------------------------------------
  Jobs.generateOffers = function (state, summary) {
    var C = CFG();
    var tier = Engine.tierInfo(state);
    var rep = state.reputation;
    var volumeMult = 1;
    for (var i = 0; i < state.market.activeEvents.length; i++)
      volumeMult *= state.market.activeEvents[i].jobVolumeMult || 1;
    var base = C.OFFER_BASE + (tier.offerBonus || 0) + rep.prestige +
               Math.round(rep.rating - 3);
    var count = Engine.clamp(Math.round(base * volumeMult), 2,
                             C.OFFER_HARD_MAX + (tier.offerBonus || 0));
    var made = [];
    for (var n = 0; n < count; n++) {
      var job = makeOffer(state);
      if (!job) continue;
      state.jobs.offers.push(job);
      made.push(job.title);
    }
    if (summary) summary.newOffers = summary.newOffers.concat(made);
    return made;
  };

  function customerFor(state, year) {
    var F = FLAVOR();
    var types = (F.customerTypes || [{ id: 'home', label: 'Home user' }]).filter(function (t) {
      return (t.minYear == null || year >= t.minYear) &&
             (t.maxYear == null || year <= t.maxYear);
    });
    var t = Engine.pick(types) || { id: 'home' };
    var name = (Engine.pick(F.firstNames || ['Sam']) || 'Sam') + ' ' +
               (Engine.pick(F.lastNames || ['Doe']) || 'Doe');
    return { name: name, type: t.id };
  }
  function blurbFor(type) {
    var b = (FLAVOR().jobBlurbs || {})[type];
    return (b && b.length) ? Engine.pick(b) : '';
  }
  function machineFlavor(state, year) {
    var cpus = purchasableByCategory(state, 'cpu').filter(function (p) {
      return year - p.introYear <= 9;
    });
    var c = Engine.pick(cpus.length ? cpus : purchasableByCategory(state, 'cpu'));
    return c ? c.name + ' system' : 'aging system';
  }

  // pay = laborRate(year) * hoursRequired * difficultyMult * typeMult  (§5.4)
  function basePay(state, type, hoursRequired, difficulty) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var dm = C.DIFF_MULT[Engine.clamp(difficulty, 1, 5) - 1];
    var tm = C.TYPE_MULT[type] != null ? C.TYPE_MULT[type] : 1;
    return Engine.round2(Engine.laborRate(year) * hoursRequired * dm * tm);
  }

  function requiredDrTier(year) { return year < 1995 ? 1 : (year < 2010 ? 2 : 3); }
  Jobs.requiredDrTier = requiredDrTier;

  function makeOffer(state) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var equip = Engine.equipEffects(state);
    var rep = state.reputation;
    var F = FLAVOR();

    // Era-gated weighted type pool (§5.4)
    var pool = [];
    function add(type, subtype, w) { if (w > 0) pool.push({ type: type, subtype: subtype, w: w }); }
    var faultCats = repairFaultCategories(state);
    if (faultCats.length) add('repair', null, 10);
    var upgCats = ['ram', 'storage', 'gpu'].filter(function (c) {
      return purchasableByCategory(state, c).length > 0;
    });
    if (upgCats.length) add('upgrade', null, 5);
    if (purchasableByCategory(state, 'os').length) add('software', 'os_install', 2);
    if (year >= 1988 && Engine.equipmentOwned(state, 'software-station'))
      add('software', 'virus', (year >= 1995 && year <= 2010) ? 6 : 2);
    add('cleaning', null, 2);
    add('peripheral', 'printer', 1.5);
    if (year <= 2005) add('peripheral', 'crt', 1.5);
    if (equip.drTier >= 1) add('data_recovery', null, 2);
    if (state.customBuildsUnlocked && equip.enablesBuilds) add('build', null, 3);
    if (year >= 1997 && rep.prestige >= 1 && purchasableByCategory(state, 'cooling').length)
      add('enthusiast', 'overclock', 1);
    if (year >= 2010 && rep.prestige >= 1) add('enthusiast', 'aesthetic', 1);
    if (rep.prestige >= 2 &&
        (state.lastContractDay == null ||
         state.day - state.lastContractDay >= C.CONTRACT_MIN_DAYS_BETWEEN))
      add('contract', null, 0.8);
    if (!pool.length) return null;

    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += pool[i].w;
    var r = Engine.rand() * total, choice = pool[0];
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { choice = pool[i]; break; } }

    var job = {
      id: state.jobs.nextId++,
      type: choice.type, subtype: choice.subtype || null,
      rush: false,
      title: '', blurb: blurbFor(choice.type),
      customer: customerFor(state, year),
      pay: 0,
      offeredDay: state.day, deadlineDay: state.day + Engine.randInt(C.DEADLINE_MIN, C.DEADLINE_MAX),
      difficulty: Engine.randInt(1, 3),
      speed: 'standard',
      status: 'offer',
      hoursRequired: 1, hoursDone: 0,
      diagnosed: true, needsDiagnosis: false,
      fault: null,
      needs: [],
      build: null,
      units: 1, unitsDone: 0,
      machine: null,
      drTier: 0,
      crt: false,
      result: null
    };
    var bl = Engine.baselineFor(year);

    switch (choice.type) {
      case 'repair': {
        var cat = Engine.pick(faultCats);
        var tmpl = Engine.pick((F.faults || {})[cat] || [{ desc: 'Mystery gremlins', laborHours: 2 }]);
        job.fault = {
          desc: tmpl.desc,
          partCategory: cat === 'laborOnly' ? null : cat,
          laborHours: Engine.clamp(Math.round(tmpl.laborHours || 2), 1, 3)
        };
        job.hoursRequired = job.fault.laborHours;
        job.needsDiagnosis = true; job.diagnosed = false;
        job.title = 'Repair: ' + machineFlavor(state, year) + ' ' +
          Engine.pick(["won't boot", 'keeps crashing', 'is acting up',
                       'is making noises', 'died overnight']);
        break;
      }
      case 'upgrade': {
        var uc = Engine.pick(upgCats);
        var label = { ram: 'More memory', storage: 'Bigger storage', gpu: 'Better graphics' }[uc];
        job.needs = [{ category: uc, anyOfTags: null, minPerf: null, qty: 1,
                       filledPartIds: [], label: label }];
        job.hoursRequired = 1;
        job.title = 'Upgrade: ' + label.toLowerCase() + ' for a ' + machineFlavor(state, year);
        break;
      }
      case 'software': {
        if (choice.subtype === 'virus') {
          job.hoursRequired = 2;
          job.title = 'Software: virus cleanup';
        } else {
          job.hoursRequired = Engine.randInt(1, 2);
          job.needs = [{ category: 'os', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Operating system' }];
          job.title = 'Software: fresh OS install';
        }
        break;
      }
      case 'cleaning': {
        if (year >= 1997 && Engine.chance(0.4)) {
          job.subtype = 'thermal_paste';
          job.title = 'Cleaning: dust-out & fresh thermal paste';
          job.hoursRequired = 1;
        } else {
          job.title = 'Cleaning: full dust-out';
          job.hoursRequired = Engine.pick([0.5, 1]);
        }
        break;
      }
      case 'peripheral': {
        var items = (F.peripheralItems || []).filter(function (it) {
          return year >= (it.minYear || 0) && year <= (it.maxYear || 9999) &&
                 (choice.subtype === 'crt' ? it.crt : !it.crt);
        });
        var item = Engine.pick(items);
        var itemName = item ? item.name : (choice.subtype === 'crt' ? 'CRT monitor' : 'printer');
        job.crt = choice.subtype === 'crt';
        job.hoursRequired = Engine.randInt(1, 2);
        job.title = 'Peripheral: ' + itemName + ' repair';
        break;
      }
      case 'data_recovery': {
        job.drTier = requiredDrTier(year);
        job.hoursRequired = Engine.randInt(2, 3);
        job.difficulty = Engine.randInt(2, 4);
        job.title = 'Data recovery: dying drive (rig tier ' + job.drTier + ')';
        break;
      }
      case 'build': {
        var budget = Engine.round2(bl.buildBudget *
          Engine.uniform(C.BUILD_BUDGET_SPREAD_MIN, C.BUILD_BUDGET_SPREAD_MAX));
        var cases = Object.keys(C.USECASE_TARGETS).filter(function (u) {
          return u !== 'gaming' || year >= 1993;
        });
        var useCase = Engine.pick(cases);
        var t = C.USECASE_TARGETS[useCase];
        job.build = {
          budget: budget, useCase: useCase,
          minPerf: {
            cpu: Engine.round2(bl.cpu * t.cpu), gpu: Engine.round2(bl.gpu * t.gpu),
            ramMB: Engine.round2(bl.ramMB * t.ramMB),
            storageGB: Engine.round2(bl.storageGB * t.storageGB)
          },
          minStyle: 0, parts: [], validated: false, committed: false
        };
        job.pay = budget;
        job.difficulty = Engine.randInt(2, 4);
        job.hoursRequired = C.BUILD_HOURS +
          (budget > bl.buildBudget * 1.15 ? C.BUILD_HOURS_PREMIUM_EXTRA : 0);
        job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX);
        job.title = 'Custom build: ' + useCase + ' PC (' + Engine.fmtMoney(budget) + ' budget)';
        break;
      }
      case 'enthusiast': {
        job.difficulty = Engine.randInt(3, 5);
        if (choice.subtype === 'overclock') {
          job.hoursRequired = 2;
          job.needs = [{ category: 'cooling', anyOfTags: null, minPerf: null, qty: 1,
                         filledPartIds: [], label: 'Beefier cooling' }];
          job.title = 'Enthusiast: overclock & cooling job';
        } else { // aesthetic: a build with a style bar
          var abudget = Engine.round2(bl.buildBudget * Engine.uniform(1.0, 1.5));
          var at = C.USECASE_TARGETS.gaming;
          job.build = {
            budget: abudget, useCase: 'gaming',
            minPerf: {
              cpu: Engine.round2(bl.cpu * at.cpu), gpu: Engine.round2(bl.gpu * at.gpu),
              ramMB: Engine.round2(bl.ramMB * at.ramMB),
              storageGB: Engine.round2(bl.storageGB * at.storageGB)
            },
            minStyle: C.AESTHETIC_MIN_STYLE, parts: [], validated: false, committed: false
          };
          job.pay = abudget;
          job.hoursRequired = C.BUILD_HOURS + 1;
          job.deadlineDay = state.day + Engine.randInt(4, C.DEADLINE_MAX);
          job.title = 'Enthusiast: showpiece build (' + Engine.fmtMoney(abudget) + ')';
        }
        break;
      }
      case 'contract': {
        state.lastContractDay = state.day;
        job.units = Engine.randInt(C.CONTRACT_UNITS_MIN, C.CONTRACT_UNITS_MAX);
        job.difficulty = 3;
        var perUnit = Engine.randInt(C.CONTRACT_UNIT_HOURS_MIN, C.CONTRACT_UNIT_HOURS_MAX);
        job.perUnitHours = perUnit;
        job.hoursRequired = perUnit * job.units;
        job.deadlineDay = state.day + Engine.randInt(C.CONTRACT_DEADLINE_MIN, C.CONTRACT_DEADLINE_MAX);
        var buildContract = state.customBuildsUnlocked && equip.enablesBuilds && Engine.chance(0.5);
        if (buildContract) {
          job.subtype = 'contract_build';
          job.needs = ['ram', 'storage'].filter(function (c) {
            return purchasableByCategory(state, c).length > 0;
          }).map(function (c) {
            return { category: c, anyOfTags: null, minPerf: null, qty: job.units,
                     filledPartIds: [], label: 'Per-unit ' + c };
          });
          job.title = 'Contract: assemble ' + job.units + ' office machines';
        } else {
          job.subtype = 'contract_upgrade';
          var cc = Engine.pick(['ram', 'storage'].filter(function (c) {
            return purchasableByCategory(state, c).length > 0;
          })) || 'ram';
          job.needs = [{ category: cc, anyOfTags: null, minPerf: null, qty: job.units,
                         filledPartIds: [], label: 'Per-unit ' + cc + ' upgrade' }];
          job.title = 'Contract: upgrade ' + job.units + ' office machines';
        }
        break;
      }
    }

    if (!isBuildJob(job) && job.type !== 'contract') {
      job.pay = basePay(state, job.type, job.hoursRequired, job.difficulty);
    } else if (job.type === 'contract') {
      job.pay = basePay(state, 'contract', job.hoursRequired, job.difficulty);
    }

    // Rush jobs: repair/software/upgrade, 8%: due today, pay x1.8 (§5.4)
    if ((job.type === 'repair' || job.type === 'software' || job.type === 'upgrade') &&
        Engine.chance(C.RUSH_CHANCE)) {
      job.rush = true;
      job.deadlineDay = job.offeredDay;
      job.pay = Engine.round2(job.pay * C.RUSH_PAY_MULT);
      job.title = 'RUSH — ' + job.title;
    }
    return job;
  }

  function repairFaultCategories(state) {
    var F = FLAVOR();
    var out = [], faults = F.faults || {};
    var cats = Object.keys(faults);
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      if (!faults[c] || !faults[c].length) continue;
      if (c === 'laborOnly') { out.push(c, c); continue; } // double weight: no part needed
      if (purchasableByCategory(state, c).length) out.push(c);
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Offer lifecycle
  // ------------------------------------------------------------------
  Jobs.acceptOffer = function (state, jobId) {
    var job = Jobs.findOffer(state, jobId);
    if (!job) return err('Offer not found');
    var slots = Engine.tierInfo(state).workstationSlots;
    var activeNonRefurb = state.jobs.active.filter(function (j) { return j.type !== 'refurb'; });
    if (activeNonRefurb.length >= slots * CFG().HARD_CAP_SLOTS_MULT)
      return err('All workstations committed — finish something first');
    removeFrom(state.jobs.offers, job);
    job.status = 'active';
    state.jobs.active.push(job);
    return { ok: true };
  };

  Jobs.declineOffer = function (state, jobId) {
    var job = Jobs.findOffer(state, jobId);
    if (!job) return err('Offer not found');
    removeFrom(state.jobs.offers, job);
    state.declinesToday = (state.declinesToday || 0) + 1;
    if (state.declinesToday === CFG().DECLINES_FREE_PER_DAY + 1) {
      Engine.pushScore(state, CFG().DECLINE_DING_SCORE); // word gets around
      Engine.pushNews(state, 'job', 'Turning away a lot of work',
        'Word gets around when the shop keeps saying no.');
    }
    return { ok: true };
  };

  Jobs.setJobSpeed = function (state, jobId, speed) {
    if (!CFG().SPEED[speed]) return err('Unknown speed: ' + speed);
    var job = Jobs.findActive(state, jobId) || Jobs.findOffer(state, jobId);
    if (!job) return err('Job not found');
    if (job.status === 'done' || job.status === 'sold') return err('Job already finished');
    job.speed = speed;
    return { ok: true };
  };

  // ------------------------------------------------------------------
  // Diagnosis
  // ------------------------------------------------------------------
  Jobs.diagnoseJob = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    if (!job.needsDiagnosis) return err('Nothing to diagnose');
    if (job.diagnosed) return err('Already diagnosed');
    var equip = Engine.equipEffects(state);
    var hours = Engine.round2(1 * equip.diagHoursMult);
    if (state.hoursLeft < hours) return err('Not enough hours left today (' + hours + 'h needed)');
    state.hoursLeft = Engine.round2(state.hoursLeft - hours);
    job.diagnosed = true;
    var fault = job.fault || { desc: 'No fault found', partCategory: null, laborHours: 1 };
    if (fault.partCategory) {
      var need = { category: fault.partCategory, anyOfTags: null, minPerf: null,
                   qty: 1, filledPartIds: [], label: 'Replacement ' + fault.partCategory };
      // Refurbs: replacement must fit the machine's motherboard.
      if (job.type === 'refurb' && job.machine) {
        var mobo = null;
        for (var i = 0; i < job.machine.partIds.length; i++) {
          var mp = Engine.partById(job.machine.partIds[i]);
          if (mp && mp.category === 'motherboard') mobo = mp;
        }
        var prefix = Engine.Compat.namespaceForCategory(fault.partCategory);
        if (mobo && prefix) {
          var tags = Engine.Compat.tagsInNamespace(mobo, prefix);
          if (tags.length) need.anyOfTags = tags;
        }
      }
      job.needs = [need];
    }
    return { ok: true, hoursSpent: hours,
             fault: { desc: fault.desc, partCategory: fault.partCategory } };
  };

  // ------------------------------------------------------------------
  // Needs & parts
  // ------------------------------------------------------------------
  function candidateOk(part, need, state) {
    if (!part || part.category !== need.category) return false;
    if (!purchasable(part, state)) return false;
    if (need.anyOfTags && need.anyOfTags.length) {
      var hit = false, tags = part.platformTags || [];
      for (var i = 0; i < need.anyOfTags.length; i++)
        if (tags.indexOf(need.anyOfTags[i]) !== -1) { hit = true; break; }
      if (!hit) return false;
    }
    if (need.minPerf) {
      var keys = Object.keys(need.minPerf);
      for (var k = 0; k < keys.length; k++) {
        if (((part.perf || {})[keys[k]] || 0) < need.minPerf[keys[k]]) return false;
      }
    }
    return true;
  }

  Jobs.getJobNeeds = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return [];
    var out = [];
    for (var i = 0; i < job.needs.length; i++) {
      var need = job.needs[i];
      var options = [];
      var cands = purchasableByCategory(state, need.category);
      for (var c = 0; c < cands.length; c++) {
        var part = cands[c];
        if (!candidateOk(part, need, state)) continue;
        var inv = Engine.inventoryEntry(state, part.id);
        if (inv && inv.qty > 0) {
          options.push({ partId: part.id, name: part.name, source: 'inventory',
                         price: 0, inStock: inv.qty });
        } else {
          options.push({ partId: part.id, name: part.name, source: 'market',
                         price: P().priceOf(part, state, { buy: true }), inStock: 0 });
        }
      }
      options.sort(function (a, b) { return a.price - b.price; });
      out.push({ index: i, label: need.label, category: need.category,
                 qty: need.qty, filled: need.filledPartIds.length, options: options });
    }
    return out;
  };

  // Supply-run rule: first market/as-is purchase of the day costs 0.5h.
  function supplyRun(state) {
    if (state.supplyRunDoneToday) return { ok: true, hours: 0 };
    var h = CFG().SUPPLY_RUN_HOURS;
    if (state.hoursLeft < h)
      return err('No time left for a supply run today (' + h + 'h needed)');
    state.hoursLeft = Engine.round2(state.hoursLeft - h);
    state.supplyRunDoneToday = true;
    return { ok: true, hours: h };
  }

  Jobs.installPart = function (state, jobId, needIndex, partId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    var idx = Number(needIndex);
    var need = job.needs[idx];
    if (!need) return err('No such part slot');
    if (need.filledPartIds.length >= need.qty) return err('That slot is already filled');
    var part = Engine.partById(partId);
    if (!candidateOk(part, need, state))
      return err(part ? part.name + ' does not fit this job' : 'Unknown part');

    var C = CFG();
    var equip = Engine.equipEffects(state);
    var mishapP = C.MISHAP_PART_DAMAGE * equip.mishapMult;
    var toFill = need.qty - need.filledPartIds.length;
    var spent = 0, filledNow = 0, mishaps = 0;

    for (var u = 0; u < toFill; u++) {
      var inv = Engine.inventoryEntry(state, part.id);
      var chargePrice = P().priceOf(part, state); // customer-markup basis (undiscounted)
      if (inv && inv.qty > 0) {
        Engine.inventoryRemove(state, part.id, 1);
      } else {
        var buyPrice = P().priceOf(part, state, { buy: true });
        if (state.cash < buyPrice) {
          if (filledNow > 0 || mishaps > 0) break; // partial fill (contracts)
          return err('Not enough cash for ' + part.name + ' (' + Engine.fmtMoney(buyPrice) + ')');
        }
        var run = supplyRun(state);
        if (!run.ok) { if (filledNow > 0 || mishaps > 0) break; return run; }
        Engine.addCash(state, -buyPrice);
        Engine.ledgerAdd(state, 'partsCost', buyPrice);
        spent = Engine.round2(spent + buyPrice);
      }
      // ESD / handling mishap: part destroyed, must re-source (§5.5)
      if (Engine.chance(mishapP)) {
        mishaps++;
        if (state.shop.insurance) {
          var refund = Engine.round2(chargePrice * C.INSURANCE_COVER);
          Engine.addCash(state, refund);
          Engine.ledgerAdd(state, 'other', -refund);
        }
        Engine.pushNews(state, 'mishap', 'Static zap on the bench',
          'A ' + part.name + ' died during installation' +
          (state.shop.insurance ? ' — insurance covered most of it.' : '.'));
        continue;
      }
      need.filledPartIds.push(part.id);
      job.partsUsed = job.partsUsed || [];
      job.partsUsed.push({ partId: part.id, price: chargePrice });
      filledNow++;
      // Refurb: swap the replacement into the machine
      if (job.type === 'refurb' && job.machine && job.machine.faultPartIdx != null) {
        job.machine.partIds[job.machine.faultPartIdx] = part.id;
      }
    }
    return { ok: true, cost: spent, filledNow: filledNow,
             mishap: mishaps > 0, mishaps: mishaps,
             filled: need.filledPartIds.length, qty: need.qty };
  };

  // ------------------------------------------------------------------
  // Build configurator
  // ------------------------------------------------------------------
  var BUILD_CATS = ['cpu', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case',
                    'cooling', 'os'];

  function buildJobOrErr(state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return { error: 'Job not active' };
    if (!isBuildJob(job) || !job.build) return { error: 'Not a custom-build job' };
    return { job: job };
  }
  function selectedMobo(job) {
    for (var i = 0; i < job.build.parts.length; i++) {
      var p = Engine.partById(job.build.parts[i]);
      if (p && p.category === 'motherboard') return p;
    }
    return null;
  }

  Jobs.getBuildCatalog = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return { categories: {} };
    var job = g.job;
    var mobo = selectedMobo(job);
    var categories = {};
    for (var c = 0; c < BUILD_CATS.length; c++) {
      var cat = BUILD_CATS[c];
      var list = [];
      var cands = purchasableByCategory(state, cat);
      for (var i = 0; i < cands.length; i++) {
        var part = cands[i];
        var fit = (cat === 'motherboard') ? { fits: true, why: '' }
                                          : Engine.Compat.fits(part, mobo);
        var inv = Engine.inventoryEntry(state, part.id);
        list.push({
          partId: part.id, name: part.name,
          price: P().priceOf(part, state, { buy: true }),
          perf: part.perf || {}, tags: (part.platformTags || []).slice(),
          watts: part.watts || 0, style: part.style || 0,
          inStock: inv ? inv.qty : 0,
          compatible: fit.fits, why: fit.why
        });
      }
      list.sort(function (a, b) { return a.price - b.price; });
      categories[cat] = list;
    }
    return { categories: categories };
  };

  Jobs.setBuildPart = function (state, jobId, category, partId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return err(g.error);
    var job = g.job;
    if (job.build.committed) return err('Build already committed');
    if (BUILD_CATS.indexOf(category) === -1) return err('Unknown category: ' + category);
    // Clear existing selection in this category
    job.build.parts = job.build.parts.filter(function (pid) {
      var p = Engine.partById(pid);
      return p && p.category !== category;
    });
    if (partId != null && partId !== '') {
      var part = Engine.partById(partId);
      if (!part || part.category !== category) return err('That part is not a ' + category);
      if (!purchasable(part, state)) return err(part.name + ' is not on the market');
      job.build.parts.push(part.id);
    }
    job.build.validated = false;
    return { ok: true };
  };

  Jobs.validateBuild = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return { valid: false, problems: [g.error], perf: {}, meetsTarget: false,
                          style: 0, partsCost: 0, budget: 0, underBudget: false };
    var job = g.job;
    var b = job.build;
    var res = Engine.Compat.validatePartList(b.parts, {
      requireFull: true, minPerfGpu: b.minPerf ? b.minPerf.gpu : null,
      year: Engine.currentYear(state)
    });
    var partsCost = 0;
    for (var i = 0; i < b.parts.length; i++) {
      partsCost = Engine.round2(partsCost + P().priceOf(b.parts[i], state, { buy: true }));
    }
    var perf = { cpu: res.perf.cpu, gpu: res.perf.gpu, ramMB: res.perf.ramMB,
                 storageGB: res.perf.storageGB, composite: res.composite };
    var meets = true, mp = b.minPerf || {};
    if ((perf.cpu || 0) < (mp.cpu || 0)) meets = false;
    if ((perf.gpu || 0) < (mp.gpu || 0)) meets = false;
    if ((perf.ramMB || 0) < (mp.ramMB || 0)) meets = false;
    if ((perf.storageGB || 0) < (mp.storageGB || 0)) meets = false;
    if (res.style < (b.minStyle || 0)) meets = false;
    return {
      valid: res.valid, problems: res.problems, perf: perf,
      meetsTarget: meets, style: res.style,
      partsCost: partsCost, budget: b.budget,
      underBudget: partsCost <= b.budget
    };
  };

  Jobs.commitBuild = function (state, jobId) {
    var g = buildJobOrErr(state, jobId);
    if (g.error) return err(g.error);
    var job = g.job;
    if (job.build.committed) return err('Build already committed');
    var v = Jobs.validateBuild(state, jobId);
    if (!v.valid) return err('Build has problems: ' + v.problems.join('; '));
    if (!v.meetsTarget) return err("Build doesn't meet the customer's targets yet");
    // Cost of parts not already in inventory
    var toBuy = [], cost = 0, i, part;
    for (i = 0; i < job.build.parts.length; i++) {
      part = Engine.partById(job.build.parts[i]);
      var inv = Engine.inventoryEntry(state, part.id);
      if (inv && inv.qty > 0 &&
          // count how many of this part are already claimed from stock in this build
          claimedSoFar(job.build.parts, i, part.id) < inv.qty) continue;
      toBuy.push(part);
      cost = Engine.round2(cost + P().priceOf(part, state, { buy: true }));
    }
    if (state.cash < cost)
      return err('Not enough cash for parts (' + Engine.fmtMoney(cost) + ' needed)');
    if (toBuy.length) {
      var run = supplyRun(state);
      if (!run.ok) return run;
    }
    job.partsUsed = job.partsUsed || [];
    for (i = 0; i < job.build.parts.length; i++) {
      part = Engine.partById(job.build.parts[i]);
      var chargePrice = P().priceOf(part, state);
      var inv2 = Engine.inventoryEntry(state, part.id);
      if (inv2 && inv2.qty > 0) {
        Engine.inventoryRemove(state, part.id, 1);
      } else {
        var buyPrice = P().priceOf(part, state, { buy: true });
        Engine.addCash(state, -buyPrice);
        Engine.ledgerAdd(state, 'partsCost', buyPrice);
      }
      job.partsUsed.push({ partId: part.id, price: chargePrice });
    }
    job.build.committed = true;
    job.build.validated = true;   // UI contract: hides configurator, shows Work
    job.needs = [];
    return { ok: true, cost: cost };
  };
  function claimedSoFar(partIds, uptoIdx, partId) {
    var n = 0;
    for (var i = 0; i < uptoIdx; i++) if (partIds[i] === partId) n++;
    return n;
  }

  // ------------------------------------------------------------------
  // Working & completion
  // ------------------------------------------------------------------
  function readinessProblem(state, job) {
    if (job.needsDiagnosis && !job.diagnosed) return 'Diagnose it first';
    if (isBuildJob(job) && job.build && !job.build.committed)
      return 'Configure and commit the build first';
    for (var i = 0; i < job.needs.length; i++) {
      if (job.needs[i].filledPartIds.length < job.needs[i].qty)
        return 'Missing parts: ' + job.needs[i].label;
    }
    return null;
  }

  function effectiveMult(state, job) {
    var C = CFG();
    var m = C.SPEED[job.speed] ? C.SPEED[job.speed].hoursMult : 1;
    if (job.type === 'software')
      m *= Engine.equipEffects(state).softwareHoursMult;
    // Soft workstation cap: beyond slots on the same day => +50% hours (§2.5)
    var slots = Engine.tierInfo(state).workstationSlots;
    var worked = state.workedToday || [];
    if (worked.indexOf(job.id) === -1 && worked.length >= slots)
      m *= C.SOFT_CAP_HOURS_MULT;
    return m;
  }

  Jobs.workJob = function (state, jobId, hours) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    if (job.status === 'done') return err('Already finished — sell it');
    var problem = readinessProblem(state, job);
    if (problem) return err(problem);
    if (state.hoursLeft < 0.5) return err('No hours left today');

    var C = CFG();
    var equip = Engine.equipEffects(state);
    // CRT safety: working a CRT job without the discharge kit risks injury (§5.5)
    if (job.crt && !equip.crtSafe && Engine.chance(C.MISHAP_CRT)) {
      var year = Engine.currentYear(state);
      var medical = Engine.round2(Engine.laborRate(year) * C.CRT_MEDICAL_LABOR_HOURS);
      var covered = state.shop.insurance ? Engine.round2(medical * C.INSURANCE_COVER) : 0;
      Engine.addCash(state, -(medical - covered));
      Engine.ledgerAdd(state, 'other', medical - covered);
      state.hoursLeft = 0;
      state.injuryDaysLeft = C.INJURY_DAYS;
      Engine.pushNews(state, 'mishap', 'CRT discharge injury!',
        'The tube bit back. Medical bill ' + Engine.fmtMoney(medical) +
        (covered ? ' (insurance covered ' + Engine.fmtMoney(covered) + ')' : '') +
        '. You will lose the next ' + C.INJURY_DAYS + ' days.');
      return { ok: true, hoursSpent: 0, completed: false, mishap: 'crt' };
    }

    var m = effectiveMult(state, job);
    var remainingEff = Math.max(0, (job.hoursRequired - job.hoursDone) * m);
    var want = (hours == null) ? remainingEff : Math.max(0, Number(hours) || 0);
    var spend = Math.min(state.hoursLeft, want, remainingEff);
    spend = Math.ceil(spend * 2 - 1e-9) / 2;              // half-hour granularity
    spend = Math.min(spend, state.hoursLeft);
    if (spend < 0.5) return err('Not enough time for a work session');

    state.hoursLeft = Engine.round2(state.hoursLeft - spend);
    job.hoursDone = Math.min(job.hoursRequired,
                             Engine.round2(job.hoursDone + spend / m) * 1);
    state.workedToday = state.workedToday || [];
    if (state.workedToday.indexOf(job.id) === -1) state.workedToday.push(job.id);
    if (job.perUnitHours) {
      job.unitsDone = Math.min(job.units, Math.floor(job.hoursDone / job.perUnitHours));
    }

    var completed = job.hoursDone >= job.hoursRequired - 1e-9;
    var result = null;
    if (completed) result = completeJob(state, job);
    return { ok: true, hoursSpent: spend, completed: completed, result: result };
  };

  function avgReliabilityFactor(job) {
    var used = job.partsUsed || [];
    if (!used.length) return 1;
    var sum = 0, n = 0;
    for (var i = 0; i < used.length; i++) {
      var p = Engine.partById(used[i].partId);
      if (p && p.reliability) { sum += p.reliability; n++; }
    }
    if (!n) return 1;
    var avg = sum / n;
    var f = Math.pow(100 / Math.max(1, avg), 2);
    return Math.min(CFG().CALLBACK_RELIABILITY_CAP, f);
  }

  function completeJob(state, job) {
    var C = CFG();
    var notes = [];
    var payout = 0;
    var year = Engine.currentYear(state);
    var speed = C.SPEED[job.speed] || C.SPEED.standard;

    // Refurb: becomes "ready to sell", no payout yet
    if (job.type === 'refurb') {
      job.status = 'done';
      job.machine.condition = Engine.round2(
        Engine.uniform(C.REFURB_COND_MIN, C.REFURB_COND_MAX));
      job.result = { onTime: true, score: null, payout: 0,
                     notes: ['Machine repaired — ready to sell'] };
      Engine.pushNews(state, 'job', 'Refurb ready: ' + job.machine.name,
        'Bench-tested and ready for a buyer.');
      return job.result;
    }

    var score = 5.0 + speed.scoreDelta;
    var drFailed = false;

    if (job.type === 'data_recovery') {
      var owned = Engine.equipEffects(state).drTier;
      var chance = C.DR_BASE + C.DR_PER_TIER * owned
                 - 0.15 * Math.max(0, (job.drTier || 1) - owned)
                 + (job.speed === 'quick' ? C.DR_QUICK : 0)
                 + (job.speed === 'meticulous' ? C.DR_MET : 0);
      chance = Engine.clamp(chance, C.DR_MIN, C.DR_MAX);
      if (!Engine.chance(chance)) {
        drFailed = true;
        score = C.SCORE_DR_FAIL;
        notes.push('Data unrecoverable — no charge');
        Engine.pushNews(state, 'job', 'Data recovery failed',
          'Some platters keep their secrets. The customer left empty-handed.');
      }
    }

    if (!drFailed) {
      payout = job.pay || 0;
      // Customer pays parts at 1.25x market for repair/upgrade-style work (§5.4)
      var customerPaysParts = job.type === 'repair' || job.type === 'upgrade' ||
        job.type === 'contract' || job.type === 'callback' ||
        (job.type === 'software' && job.subtype === 'os_install') ||
        (job.type === 'enthusiast' && job.subtype === 'overclock');
      if (customerPaysParts && job.partsUsed && job.partsUsed.length) {
        var partsCharge = 0;
        for (var i = 0; i < job.partsUsed.length; i++)
          partsCharge += job.partsUsed[i].price * C.PARTS_MARKUP;
        partsCharge = Engine.round2(partsCharge);
        payout = Engine.round2(payout + partsCharge);
        notes.push('Parts billed at 1.25x: ' + Engine.fmtMoney(partsCharge));
      }
      if (isBuildJob(job) && job.build) {
        // Build pay = budget; bonuses for overdelivering (§5.5)
        var mp = job.build.minPerf || {};
        var v = Engine.Compat.validatePartList(job.build.parts, {
          requireFull: true, minPerfGpu: mp.gpu, year: year });
        var ratio = 99;
        if (mp.cpu > 0) ratio = Math.min(ratio, v.perf.cpu / mp.cpu);
        if (mp.gpu > 0) ratio = Math.min(ratio, v.perf.gpu / mp.gpu);
        if (mp.ramMB > 0) ratio = Math.min(ratio, v.perf.ramMB / mp.ramMB);
        if (mp.storageGB > 0) ratio = Math.min(ratio, v.perf.storageGB / mp.storageGB);
        if (ratio >= C.BUILD_PERF_BONUS_AT) { score += C.BUILD_PERF_BONUS; notes.push('Overdelivered on performance'); }
        var spentOnParts = 0;
        for (var b = 0; b < (job.partsUsed || []).length; b++)
          spentOnParts += job.partsUsed[b].price;
        if (job.build.budget > 0 && spentOnParts <= job.build.budget * C.BUILD_BUDGET_BONUS_AT) {
          score += C.BUILD_BUDGET_BONUS; notes.push('Came in well under budget');
        }
        Engine.pushNews(state, 'job', 'Custom build delivered',
          job.title + ' — ' + Engine.fmtMoney(payout));
        state.ledger.lifetime.buildsDelivered++;
      }
      if (payout > 0) {
        Engine.addCash(state, payout);
        Engine.ledgerAdd(state, 'revenue', payout);
      }
    }

    score = Engine.clamp(score, 0, 5);
    Engine.pushScore(state, score);
    state.reputation.jobsCompleted++;
    state.ledger.lifetime.jobsCompleted++;

    // Warranty callback roll (§5.5) — real customer work only
    if (job.type !== 'callback' && !drFailed) {
      var cb = speed.callbackBase * avgReliabilityFactor(job) *
               Engine.equipEffects(state).callbackMult;
      cb = Engine.clamp(cb, C.CALLBACK_MIN, C.CALLBACK_MAX);
      var fired = Engine.chance(cb);
      state.jobs.completedRecent.push({
        jobId: job.id, title: job.title, day: state.day,
        callbackRolledDay: fired ?
          state.day + Engine.randInt(C.CALLBACK_DELAY_MIN, C.CALLBACK_DELAY_MAX) : null,
        callbackChance: Engine.round2(cb * 1000) / 1000,
        fired: fired,
        origHours: job.hoursRequired
      });
    }

    job.status = 'done';
    job.result = { onTime: job.deadlineDay == null || state.day <= job.deadlineDay,
                   score: score, payout: payout, notes: notes };
    removeFrom(state.jobs.active, job);
    return job.result;
  }
  Jobs.completeJob = completeJob;

  Jobs.abandonJob = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job) return err('Job not active');
    removeFrom(state.jobs.active, job);
    if (job.type === 'refurb') {
      var value = machinePartsValue(state, job.machine);
      var scrap = Engine.round2(value * CFG().REFURB_SCRAP_RATIO);
      Engine.addCash(state, scrap);
      Engine.ledgerAdd(state, 'other', -scrap);
      Engine.pushNews(state, 'job', 'Scrapped: ' + job.machine.name,
        'Stripped for parts — recovered ' + Engine.fmtMoney(scrap) + '.');
      return { ok: true, scrapped: scrap };
    }
    Engine.pushScore(state, CFG().SCORE_ABANDON);
    state.reputation.jobsFailed++;
    state.ledger.lifetime.jobsFailed++;
    Engine.pushNews(state, 'job', 'Job abandoned: ' + job.title,
      job.customer.name + ' will not be recommending the shop.');
    return { ok: true };
  };

  // Deadline sweep + offer expiry (overnight step 4)
  Jobs.deadlineSweep = function (state, summary) {
    var C = CFG();
    var i, job;
    for (i = state.jobs.active.length - 1; i >= 0; i--) {
      job = state.jobs.active[i];
      if (job.deadlineDay != null && state.day > job.deadlineDay && job.status === 'active') {
        state.jobs.active.splice(i, 1);
        Engine.pushScore(state, C.SCORE_LATE);
        state.reputation.jobsFailed++;
        state.ledger.lifetime.jobsFailed++;
        job.status = 'done';
        job.result = { onTime: false, score: C.SCORE_LATE, payout: 0, notes: ['Missed the deadline'] };
        Engine.pushNews(state, 'job', 'Deadline missed: ' + job.title,
          job.customer.name + ' took their machine elsewhere.');
        summary.expired.push(job.title + ' (deadline missed)');
      }
    }
    for (i = state.jobs.offers.length - 1; i >= 0; i--) {
      job = state.jobs.offers[i];
      var tooOld = state.day - job.offeredDay > C.OFFER_EXPIRY_DAYS;
      var pastDeadline = job.deadlineDay != null && state.day > job.deadlineDay;
      if (tooOld || pastDeadline) state.jobs.offers.splice(i, 1); // silent expiry
    }
  };

  // Callback arrivals (overnight step 5)
  Jobs.processCallbacks = function (state, summary) {
    var C = CFG();
    var list = state.jobs.completedRecent;
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (e.fired && e.callbackRolledDay === state.day) {
        var job = {
          id: state.jobs.nextId++,
          type: 'callback', subtype: null, rush: false,
          title: 'Callback: ' + e.title,
          blurb: '"It is doing it again."',
          customer: { name: 'Returning customer', type: 'home' },
          pay: 0,
          offeredDay: state.day, deadlineDay: state.day + 3,
          difficulty: 2, speed: 'standard', status: 'active',
          hoursRequired: Math.max(0.5, Engine.round2((e.origHours || 2) * C.CALLBACK_HOURS_FRACTION)),
          hoursDone: 0,
          diagnosed: true, needsDiagnosis: false,
          fault: null, needs: [], build: null,
          units: 1, unitsDone: 0, machine: null, drTier: 0, crt: false, result: null
        };
        state.jobs.active.push(job);      // auto-accepted, pay 0
        state.reputation.callbacks++;
        Engine.pushScore(state, C.CALLBACK_ARRIVAL_SCORE);  // rep ding on arrival
        Engine.pushNews(state, 'job', 'Warranty callback: ' + e.title,
          'The fix did not hold. Make it right for free.');
        summary.callbacks.push(e.title);
        e.fired = false; // consumed
      }
      if (state.day - e.day > C.COMPLETED_RECENT_KEEP_DAYS) list.splice(i, 1);
    }
  };

  // ------------------------------------------------------------------
  // As-is market & refurbs
  // ------------------------------------------------------------------
  function machinePartsValue(state, machine) {
    var v = 0;
    for (var i = 0; i < machine.partIds.length; i++)
      v += P().priceOf(machine.partIds[i], state) || 0;
    return Engine.round2(v);
  }
  Jobs.machinePartsValue = machinePartsValue;

  function generateMachine(state) {
    var C = CFG();
    var year = Engine.currentYear(state);
    var mobos = purchasableByCategory(state, 'motherboard').filter(function (m) {
      return year - m.introYear <= C.ASIS_MAX_AGE_YEARS;
    });
    if (!mobos.length) mobos = purchasableByCategory(state, 'motherboard');
    var mobo = Engine.pick(mobos);
    if (!mobo) return null;
    var partIds = [mobo.id];
    var cats = ['cpu', 'ram', 'storage', 'psu', 'case'];
    for (var c = 0; c < cats.length; c++) {
      var options = purchasableByCategory(state, cats[c]).filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var part = Engine.pick(options);
      if (!part) return null; // can't assemble an era machine
      partIds.push(part.id);
    }
    if (!mobo.integratedVideo) {
      var gpus = purchasableByCategory(state, 'gpu').filter(function (p) {
        return Engine.Compat.fits(p, mobo).fits;
      });
      var gpu = Engine.pick(gpus);
      if (gpu) partIds.push(gpu.id);
    }
    // Fault: usually one dead part (never the board — replacements must fit it)
    var faultIdx = null;
    if (Engine.chance(0.75)) {
      var faultable = [];
      for (var i = 1; i < partIds.length; i++) {
        var fp = Engine.partById(partIds[i]);
        if (fp && ['cpu', 'ram', 'storage', 'gpu', 'psu'].indexOf(fp.category) !== -1)
          faultable.push(i);
      }
      if (faultable.length) faultIdx = Engine.pick(faultable);
    }
    var hints = {
      cpu: 'halts at POST', ram: 'beeping at boot', storage: 'drive grinds horribly',
      gpu: 'no video on boot', psu: 'completely dead', none: 'just needs some love'
    };
    var faultCat = faultIdx != null ? Engine.partById(partIds[faultIdx]).category : 'none';
    var adjective = Engine.pick((FLAVOR().machineAdjectives || ['dusty'])) || 'dusty';
    var machineYear = Engine.clamp(
      Engine.randInt(mobo.introYear, Math.min(year, (mobo.eolYear || year) + 2)),
      mobo.introYear, year);
    var value = machinePartsValue(state, { partIds: partIds });
    var ask = Engine.round2(value * Engine.uniform(C.ASIS_ASK_MIN, C.ASIS_ASK_MAX));
    return {
      id: 'm' + (state.asIsNextId++),
      name: adjective + ' ' + mobo.name + ' machine',
      year: machineYear,
      askPrice: Math.max(10, ask),
      hint: hints[faultCat],
      partIds: partIds,
      faultPartIdx: faultIdx,
      listedDay: state.day
    };
  }

  // Overnight step 6: churn listings, keep 2-5.
  Jobs.refreshAsIsMarket = function (state) {
    var C = CFG();
    for (var i = state.asIsMarket.length - 1; i >= 0; i--) {
      if (Engine.chance(C.ASIS_CHURN)) state.asIsMarket.splice(i, 1);
    }
    var target = Engine.randInt(C.ASIS_MIN, C.ASIS_MAX);
    var guard = 0;
    while (state.asIsMarket.length < target && guard++ < 12) {
      var m = generateMachine(state);
      if (!m) break;
      state.asIsMarket.push(m);
    }
  };

  Jobs.buyAsIsMachine = function (state, machineId) {
    var machine = null;
    for (var i = 0; i < state.asIsMarket.length; i++) {
      if (String(state.asIsMarket[i].id) === String(machineId)) { machine = state.asIsMarket[i]; break; }
    }
    if (!machine) return err('That machine is gone');
    if (state.cash < machine.askPrice)
      return err('Not enough cash (' + Engine.fmtMoney(machine.askPrice) + ' asked)');
    var run = supplyRun(state);
    if (!run.ok) return run;
    Engine.addCash(state, -machine.askPrice);
    Engine.ledgerAdd(state, 'partsCost', machine.askPrice);
    removeFrom(state.asIsMarket, machine);

    var C = CFG();
    var faultPart = machine.faultPartIdx != null ?
        Engine.partById(machine.partIds[machine.faultPartIdx]) : null;
    var job = {
      id: state.jobs.nextId++,
      type: 'refurb', subtype: null, rush: false,
      title: 'Refurb: ' + machine.name,
      blurb: '"' + machine.hint + '"',
      customer: { name: 'Shop project', type: 'home' },
      pay: null,
      offeredDay: state.day, deadlineDay: null,
      difficulty: faultPart ? 3 : 2,
      speed: 'standard', status: 'active',
      hoursRequired: Engine.randInt(C.REFURB_HOURS_MIN, C.REFURB_HOURS_MAX),
      hoursDone: 0,
      diagnosed: false, needsDiagnosis: true,
      fault: faultPart ?
        { desc: 'Dead ' + faultPart.name, partCategory: faultPart.category,
          laborHours: 2 } :
        { desc: 'Nothing broken — just filthy and misconfigured', partCategory: null,
          laborHours: 2 },
      needs: [],
      build: null, units: 1, unitsDone: 0,
      machine: { name: machine.name, year: machine.year, partIds: machine.partIds.slice(),
                 askPrice: machine.askPrice, boughtFor: machine.askPrice,
                 faultPartIdx: machine.faultPartIdx, condition: null },
      drTier: 0, crt: false, result: null
    };
    state.jobs.active.push(job);
    return { ok: true, jobId: job.id };
  };

  function refurbEstimate(state, job) {
    var C = CFG();
    var cond = (job.machine && job.machine.condition != null) ? job.machine.condition : 1.0;
    var year = Engine.currentYear(state);
    return Engine.round2(machinePartsValue(state, job.machine) * C.REFURB_SALE_RATIO * cond +
                         Engine.laborRate(year) * C.REFURB_PREMIUM_HOURS);
  }

  Jobs.appraiseRefurb = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job || job.type !== 'refurb' || !job.machine) return { estimate: 0 };
    return { estimate: refurbEstimate(state, job) };
  };

  Jobs.sellRefurb = function (state, jobId) {
    var job = Jobs.findActive(state, jobId);
    if (!job || job.type !== 'refurb') return err('Not a refurb job');
    if (job.status !== 'done') return err('Fix it up before selling');
    var price = refurbEstimate(state, job);
    Engine.addCash(state, price);
    Engine.ledgerAdd(state, 'revenue', price);
    state.ledger.lifetime.refurbsSold++;
    job.status = 'sold';
    removeFrom(state.jobs.active, job);
    Engine.pushNews(state, 'money', 'Refurb sold: ' + job.machine.name,
      'Out the door for ' + Engine.fmtMoney(price) + ' (paid ' +
      Engine.fmtMoney(job.machine.boughtFor) + ').');
    return { ok: true, price: price };
  };
})(typeof window !== 'undefined' ? window : globalThis);
