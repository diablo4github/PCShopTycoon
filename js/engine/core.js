/* Circuit & Solder — engine/core.js
 * Engine namespace bootstrap, CONFIG (all balance constants), seeded RNG,
 * date utilities, money helpers, YEAR_BASELINES interpolation, year scaling.
 * SPEC §0 prologue: loads in browser and under Node require().
 */
(function (root) {
  'use strict';
  var Engine = root.Engine = root.Engine || {};

  // ------------------------------------------------------------------
  // Balance constants — ALL tunables live here (SPEC §7).
  // ------------------------------------------------------------------
  Engine.CONFIG = {
    HOURS_PER_DAY: 8,            // work hours per day
    SUPPLY_RUN_HOURS: 0.5,       // first market/as-is purchase of the day
    OFFER_EXPIRY_DAYS: 3,        // offers older than this silently expire
    GRACE_DAYS: 14,              // days to recover from negative cash

    // Speed settings: hours multiplier, callback base chance, score delta (§5.5)
    SPEED: {
      quick:      { hoursMult: 0.7, callbackBase: 0.12,  scoreDelta: -0.6 },
      standard:   { hoursMult: 1.0, callbackBase: 0.05,  scoreDelta: 0 },
      meticulous: { hoursMult: 1.5, callbackBase: 0.015, scoreDelta: 0.4 }
    },
    CALLBACK_MIN: 0.005, CALLBACK_MAX: 0.35,       // clamp on callback chance
    CALLBACK_DELAY_MIN: 3, CALLBACK_DELAY_MAX: 30, // days out when fired
    CALLBACK_HOURS_FRACTION: 0.5,                  // callback job hours vs original
    CALLBACK_ARRIVAL_SCORE: 0.5,   // low score pushed when a callback arrives (rep ding)
    CALLBACK_RELIABILITY_CAP: 2.5, // cap on (100/avgReliability)^2
    COMPLETED_RECENT_KEEP_DAYS: 35,

    PARTS_MARKUP: 1.25,          // customer pays 1.25x market for parts (repair/upgrade)
    SELL_PART_RATIO: 0.7,        // sellPart returns 70% of market
    PRESTIGE_BUY_DISCOUNT: 0.02, // 1 - 0.02*prestigeTier when buying

    // Pricing (§5.2)
    NOISE_STEP: 0.03, NOISE_MIN: 0.85, NOISE_MAX: 1.15,
    HIST_CAP: 30,                // price history cap per part
    NEWS_CAP: 200,
    PRUNE_YEARS_PAST_EOL: 25,    // drop hist/noise for parts this long past EOL
    AGE: {
      INTRO_PREMIUM: 1.15,       // launch premium, decays over first 6 months
      FLOOR_PREMIUM: 0.40,       // decay floor, premium tier
      FLOOR_STD: 0.35,           // decay floor, other tiers
      DECAY_K: 2.2,              // exponential decay constant
      LEGACY_MAX: 2.8,           // scarcity ceiling for legacy parts post-EOL
      LEGACY_RAMP_YEARS: 8,      // years post-EOL to reach ceiling
      NONLEGACY_FLOOR: 0.12,     // non-legacy decay target post-EOL
      NONLEGACY_DECAY_YEARS: 4
    },
    EVENT_RAMP_IN: 0.15,         // fraction of duration ramping to peak
    EVENT_RAMP_OUT: 0.25,        // fraction ramping back to 1
    RANDOM_EVENT_NIGHTLY_CHANCE: 0.04, // per template per night (~1-2/month)
    MAX_RANDOM_EVENTS: 2,

    // As-is / refurb (§5.4, retuned per §9.5/§9.6: slower market, pricier asks,
    // smaller flip premium so flips land 1.2-1.8x the jobs $/hour, not 3x+)
    ASIS_MAX: 4,                 // listing cap
    ASIS_CHURN: 0.08,            // nightly chance each listing churns (~2wk shelf life)
    ASIS_ARRIVAL_CHANCE: 0.33,   // <=1 new arrival/night (~1 per 3 nights) below cap
    ASIS_START_MIN: 2, ASIS_START_MAX: 4,     // listings seeded at newGame
    ASIS_ASK_MIN: 0.45, ASIS_ASK_MAX: 0.55,   // ask vs part value (§9.6: 40-55%)
    REFURB_SALE_RATIO: 0.68,     // of part value (§9.6 override of §5.4's 0.85:
                                 //   keeps flips at 1.2-1.8x the jobs $/hour)
    REFURB_COND_MIN: 0.95, REFURB_COND_MAX: 1.05,
    REFURB_PREMIUM_HOURS: 3,     // working-machine premium = laborRate*this (§9.6)
    REFURB_SCRAP_RATIO: 0.25,    // abandon: 25% of parts value
    REFURB_HOURS_MIN: 3, REFURB_HOURS_MAX: 5,  // §9.6: flips are slower work now
    ASIS_MAX_AGE_YEARS: 12,      // how far back as-is machines reach
    // §9.5 strip-for-parts
    STRIP_HOURS: 1.5,
    STRIP_SURVIVAL: 0.9, STRIP_SURVIVAL_ESD: 0.97,

    // Mishaps (§5.5)
    MISHAP_PART_DAMAGE: 0.03,    // per install; esd-setup effects.mishapMult applies
    MISHAP_CRT: 0.08,            // per work session on CRT job without crt-kit
    CRT_MEDICAL_LABOR_HOURS: 20, // medical cost = laborRate * this
    INSURANCE_COVER: 0.7,
    INJURY_DAYS: 2,

    INSURANCE_MONTHLY_LABOR_MULT: 2,  // monthly premium = laborRate * this
    STORAGE_FEE_LABOR_DIV: 10,        // feePerSlot = laborRate/10 per overage slot

    // Job pay (§5.4, retuned per §9.6: honest labor is the era-1 backbone —
    // repairs also bill a bench fee; typical 1983 repair lands $60-110).
    TYPE_MULT: {
      repair: 0.8, upgrade: 0.7, software: 0.85, cleaning: 0.6, peripheral: 0.6,
      data_recovery: 1.4, enthusiast: 1.25, contract: 0.65, build: 0, refurb: 0,
      callback: 0
    },
    BENCH_FEE_LABOR_MULT: 0.45,  // §9.6: repairs add ~0.5x laborRate bench fee to payout
    // §9.2 — which customer types can receive which job type. Key is "type",
    // "type:subtype", or "build:<useCase>"; most specific key wins; absent = broad.
    CUSTOMER_JOB_AFFINITY: {
      'build:gaming': ['gamer', 'student', 'creator'],
      'build:workstation': ['smallbiz', 'office', 'creator'],
      'build:server': ['smallbiz', 'office'],
      'enthusiast:overclock': ['gamer', 'student', 'creator'],
      'enthusiast:aesthetic': ['gamer', 'student', 'creator'],
      'contract': ['smallbiz', 'office'],
      'peripheral': ['office', 'smallbiz', 'home']
    },
    // §9.2 — customer tastes ("Swears by Seagate drives")
    TASTE_CHANCE: 0.35,          // fraction of eligible jobs that carry a taste
    TASTE_BONUS_MIN: 10, TASTE_BONUS_MAX: 20,  // payout bonus % when matched
    TASTE_SCORE_BONUS: 0.2,      // score bonus when matched (never a penalty)
    // §9.4 — overtime
    overtimeCap: 3,              // hoursLeft floor is -overtimeCap
    OVERTIME_MORNING_MIN: 5,     // morning hours never drop below this
    // Relative frequency of repair fault sources; labor-only & cheap-part faults
    // dominate so the 1.25x parts markup doesn't print money in expensive-part eras.
    FAULT_CATEGORY_WEIGHTS: {
      laborOnly: 5.5, cooling: 1.5, psu: 1.4, ram: 1.1, storage: 0.8,
      gpu: 0.8, cpu: 0.6, motherboard: 0.5
    },
    DIFF_MULT: [0.9, 1.05, 1.2, 1.4, 1.6],  // index difficulty-1
    RUSH_CHANCE: 0.08, RUSH_PAY_MULT: 1.8,
    OFFER_BASE: 2, OFFER_HARD_MAX: 6,       // clamp(…, 2, 6+offerBonus)
    DEADLINE_MIN: 2, DEADLINE_MAX: 7,
    CONTRACT_DEADLINE_MIN: 12, CONTRACT_DEADLINE_MAX: 25,
    CONTRACT_UNITS_MIN: 4, CONTRACT_UNITS_MAX: 8,
    CONTRACT_MIN_DAYS_BETWEEN: 7,           // <=1/week
    CONTRACT_UNIT_HOURS_MIN: 1, CONTRACT_UNIT_HOURS_MAX: 2,

    // Data recovery success (§5.5): 0.50 + 0.18*ownedTier -0.10 quick +0.10 meticulous
    DR_BASE: 0.50, DR_PER_TIER: 0.18, DR_QUICK: -0.10, DR_MET: 0.10,
    DR_MIN: 0.15, DR_MAX: 0.97,

    // Ratings & prestige (§5.3.11, §5.5)
    RATING_HISTORY: 25, RATING_SEED: 3.0,
    SCORE_LATE: 0.5, SCORE_ABANDON: 1.0, SCORE_DR_FAIL: 1.0,
    BUILD_PERF_BONUS_AT: 1.15, BUILD_PERF_BONUS: 0.3,
    BUILD_BUDGET_BONUS_AT: 0.85, BUILD_BUDGET_BONUS: 0.3,
    DECLINES_FREE_PER_DAY: 5, DECLINE_DING_SCORE: 2.5,
    PRESTIGE_TIERS: [
      { jobs: 0,   rating: 0,   label: 'Unknown' },
      { jobs: 15,  rating: 3.0, label: 'Neighborhood Fixture' },
      { jobs: 40,  rating: 3.5, label: 'Well-Reviewed' },
      { jobs: 100, rating: 4.0, label: 'Renowned' },
      { jobs: 250, rating: 4.5, label: 'Legendary' }
    ],
    PRESS_BOOST_MULT: 1.35, PRESS_BOOST_DAYS: 21,   // fired on prestige-up

    // Workstations
    SOFT_CAP_HOURS_MULT: 1.5,    // jobs beyond slots worked same day take +50% hours
    HARD_CAP_SLOTS_MULT: 2,      // acceptOffer fails at active non-refurb >= slots*2

    // Compatibility / builds (§5.1)
    PSU_HEADROOM: 1.15,
    INTEGRATED_GPU_PERF: 2,
    NORM_CAP: 3,
    COMPOSITE_W: { cpu: 0.35, gpu: 0.30, ramMB: 0.20, storageGB: 0.15 },
    BUILD_BUDGET_SPREAD_MIN: 0.8, BUILD_BUDGET_SPREAD_MAX: 1.3,
    BUILD_HOURS: 3, BUILD_HOURS_PREMIUM_EXTRA: 1,   // +1h when budget > 1.15x baseline
    // useCase perf targets as fraction of YEAR_BASELINES
    USECASE_TARGETS: {
      office:      { cpu: 0.5, gpu: 0.12, ramMB: 0.5, storageGB: 0.4 },
      gaming:      { cpu: 0.8, gpu: 0.9,  ramMB: 0.7, storageGB: 0.5 },
      workstation: { cpu: 1.0, gpu: 0.4,  ramMB: 1.0, storageGB: 1.0 },
      server:      { cpu: 0.8, gpu: 0.05, ramMB: 1.1, storageGB: 1.1 }
    },
    AESTHETIC_MIN_STYLE: 8,      // combined case+cooling style for aesthetic builds

    NEW_BADGE_DAYS: 90           // market "isNew" window
  };

  // ------------------------------------------------------------------
  // Live state reference (set by api.js newGame/importSave)
  // ------------------------------------------------------------------
  Engine._state = null;
  Engine.getData = function () { return root.DATA || {}; };

  // Part index (data is static after load)
  var _partIdx = null, _partIdxLen = -1;
  Engine.partById = function (id) {
    var parts = (Engine.getData().PARTS) || [];
    if (!_partIdx || _partIdxLen !== parts.length) {
      _partIdx = {}; _partIdxLen = parts.length;
      for (var i = 0; i < parts.length; i++) _partIdx[parts[i].id] = parts[i];
    }
    return _partIdx[id] || null;
  };
  Engine.partsByCategory = function (cat) {
    var parts = (Engine.getData().PARTS) || [], out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i].category === cat) out.push(parts[i]);
    return out;
  };

  // ------------------------------------------------------------------
  // Seeded RNG — mulberry32 over state.rngState (SPEC §0)
  // ------------------------------------------------------------------
  Engine.rand = function () {
    var s = Engine._state;
    if (!s) return 0.5; // no state yet; deterministic fallback (never used in play)
    s.rngState = (s.rngState + 0x6D2B79F5) | 0;
    var t = s.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Engine.randInt = function (min, max) { // inclusive
    return min + Math.floor(Engine.rand() * (max - min + 1));
  };
  Engine.uniform = function (a, b) { return a + Engine.rand() * (b - a); };
  Engine.pick = function (arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Engine.rand() * arr.length)];
  };
  Engine.chance = function (p) { return Engine.rand() < p; };

  // ------------------------------------------------------------------
  // Numeric hygiene
  // ------------------------------------------------------------------
  Engine.round2 = function (x) {
    if (!isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  };
  Engine.clamp = function (x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); };
  Engine.fmtMoney = function (x) {
    x = Engine.round2(x || 0);
    var neg = x < 0; if (neg) x = -x;
    var s = x.toFixed(2);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-$' : '$') + parts[0] + '.' + parts[1];
  };

  // ------------------------------------------------------------------
  // Date utilities. Canonical time = state.day (0 = startDate). ISO <-> day index.
  // ------------------------------------------------------------------
  var MONTHS = ['January','February','March','April','May','June','July','August',
                'September','October','November','December'];
  var WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  Engine.isoToEpochDay = function (iso) { // "1983-03-01" -> days since 1970-01-01
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return 0;
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  };
  Engine.epochDayToParts = function (epochDay) {
    var d = new Date(epochDay * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
             weekday: d.getUTCDay() };
  };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Absolute day index for an ISO date, relative to current game's start date.
  Engine.dayIndexOfISO = function (iso, state) {
    var s = state || Engine._state;
    var start = s ? s.startDate : '1983-03-01';
    return Engine.isoToEpochDay(iso) - Engine.isoToEpochDay(start);
  };

  Engine.dateInfo = function (dayIndex, state) {
    var s = state || Engine._state;
    var start = s ? s.startDate : '1983-03-01';
    var ep = Engine.isoToEpochDay(start) + (dayIndex | 0);
    var p = Engine.epochDayToParts(ep);
    var iso = p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
    return {
      iso: iso, y: p.y, m: p.m, d: p.d,
      weekday: p.weekday, weekdayName: WEEKDAYS[p.weekday],
      monthName: MONTHS[p.m - 1],
      label: WEEKDAYS[p.weekday] + ', ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y,
      isSunday: p.weekday === 0,
      isFirstOfMonth: p.d === 1
    };
  };

  // Fractional year for a day index (for pricing/baselines).
  Engine.yearFloat = function (dayIndex, state) {
    var di = Engine.dateInfo(dayIndex, state);
    var startOfYear = Engine.isoToEpochDay(di.y + '-01-01');
    var ep = Engine.isoToEpochDay(di.iso);
    return di.y + (ep - startOfYear) / 365.25;
  };
  Engine.currentYear = function (state) {
    var s = state || Engine._state;
    return Engine.dateInfo(s ? s.day : 0, s).y;
  };

  // ------------------------------------------------------------------
  // YEAR_BASELINES interpolation + year scaling (laborRate ratio) — SPEC §2.3/§2.5
  // ------------------------------------------------------------------
  var FIELDS = ['cpu', 'gpu', 'ramMB', 'storageGB', 'laborRate', 'buildBudget'];
  var _blKeys = null, _blSrc = null;
  function baselineKeys() {
    var bl = Engine.getData().YEAR_BASELINES || {};
    if (_blSrc !== bl) {
      _blKeys = Object.keys(bl).map(Number).sort(function (a, b) { return a - b; });
      _blSrc = bl;
    }
    return _blKeys;
  }
  Engine.baselineFor = function (year) {
    var bl = Engine.getData().YEAR_BASELINES || {};
    var keys = baselineKeys();
    var out = {}, i, f;
    if (!keys.length) { // defensive fallback
      for (i = 0; i < FIELDS.length; i++) out[FIELDS[i]] = 1;
      out.laborRate = 28; out.buildBudget = 2200;
      return out;
    }
    if (year <= keys[0]) return copyBaseline(bl[keys[0]]);
    if (year >= keys[keys.length - 1]) return copyBaseline(bl[keys[keys.length - 1]]);
    var lo = keys[0], hi = keys[keys.length - 1];
    for (i = 0; i < keys.length - 1; i++) {
      if (year >= keys[i] && year <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
    }
    var t = hi === lo ? 0 : (year - lo) / (hi - lo);
    var a = bl[lo], b = bl[hi];
    for (i = 0; i < FIELDS.length; i++) {
      f = FIELDS[i];
      var av = a[f] != null ? a[f] : 1, bv = b[f] != null ? b[f] : av;
      out[f] = av + (bv - av) * t;
    }
    return out;
  };
  function copyBaseline(b) {
    var out = {};
    for (var i = 0; i < FIELDS.length; i++) out[FIELDS[i]] = (b && b[FIELDS[i]] != null) ? b[FIELDS[i]] : 1;
    return out;
  }
  Engine.laborRate = function (year) { return Engine.baselineFor(year).laborRate || 28; };
  // Year scaling: rent/equipment/upgrade cost = base1983 * laborRate(y)/laborRate(1983)
  Engine.yearScale = function (year) {
    var base = Engine.laborRate(1983) || 28;
    return (Engine.laborRate(year) || base) / base;
  };

  // ------------------------------------------------------------------
  // Shared state helpers (used across engine modules)
  // ------------------------------------------------------------------
  Engine.pushNews = function (state, kind, headline, body) {
    var di = Engine.dateInfo(state.day, state);
    state.news.unshift({ day: state.day, dateStr: di.label, headline: String(headline),
                         body: String(body || ''), kind: kind || 'system' });
    if (state.news.length > Engine.CONFIG.NEWS_CAP) state.news.length = Engine.CONFIG.NEWS_CAP;
  };

  // Ledger: revenue/partsCost/fixedCosts/other stored as positive magnitudes;
  // "other" positive = expense. net = revenue - partsCost - fixedCosts - other.
  Engine.curMonth = function (state) {
    var months = state.ledger.months;
    return months[months.length - 1];
  };
  Engine.ledgerAdd = function (state, field, amount) {
    var m = Engine.curMonth(state);
    if (!m) return;
    m[field] = Engine.round2((m[field] || 0) + amount);
    m.net = Engine.round2((m.revenue || 0) - (m.partsCost || 0) - (m.fixedCosts || 0) - (m.other || 0));
    var lt = state.ledger.lifetime;
    if (field === 'revenue') lt.revenue = Engine.round2(lt.revenue + amount);
    else if (field === 'partsCost') lt.partsCost = Engine.round2(lt.partsCost + amount);
    else if (field === 'fixedCosts') lt.fixedCosts = Engine.round2(lt.fixedCosts + amount);
    else if (field === 'other') lt.other = Engine.round2(lt.other + amount);
  };
  Engine.addCash = function (state, amount) {
    state.cash = Engine.round2(state.cash + amount);
  };

  Engine.equipmentOwned = function (state, id) {
    return state.shop.equipment.indexOf(id) !== -1;
  };
  // Merge owned equipment effects into one object (multiplicative keys multiplied).
  Engine.equipEffects = function (state) {
    var eq = Engine.getData().EQUIPMENT || [];
    var out = { diagHoursMult: 1, softwareHoursMult: 1, mishapMult: 1, callbackMult: 1,
                drTier: 0, enablesBuilds: false, crtSafe: false };
    for (var i = 0; i < eq.length; i++) {
      if (!Engine.equipmentOwned(state, eq[i].id)) continue;
      var ef = eq[i].effects || {};
      if (ef.diagHoursMult != null) out.diagHoursMult *= ef.diagHoursMult;
      if (ef.softwareHoursMult != null) out.softwareHoursMult *= ef.softwareHoursMult;
      if (ef.mishapMult != null) out.mishapMult *= ef.mishapMult;
      if (ef.callbackMult != null) out.callbackMult *= ef.callbackMult;
      if (ef.drTier != null && ef.drTier > out.drTier) out.drTier = ef.drTier;
      if (ef.enablesBuilds) out.enablesBuilds = true;
      if (ef.crtSafe) out.crtSafe = true;
    }
    return out;
  };
  Engine.tierInfo = function (state) {
    var tiers = Engine.getData().SHOP_TIERS || [];
    return tiers[state.shop.tier] || { id: 0, name: 'Garage', rentBase: 350, utilitiesBase: 60,
      workstationSlots: 2, offerBonus: 0, storageSlots: 20, upgradeCost: null, minPrestige: 0 };
  };

  Engine.inventoryEntry = function (state, partId) {
    for (var i = 0; i < state.inventory.length; i++)
      if (state.inventory[i].partId === partId) return state.inventory[i];
    return null;
  };
  Engine.inventoryAdd = function (state, partId, qty, unitCost) {
    var e = Engine.inventoryEntry(state, partId);
    if (!e) { e = { partId: partId, qty: 0, avgCost: 0 }; state.inventory.push(e); }
    var total = e.avgCost * e.qty + unitCost * qty;
    e.qty += qty;
    e.avgCost = e.qty > 0 ? Engine.round2(total / e.qty) : 0;
  };
  Engine.inventoryRemove = function (state, partId, qty) {
    var e = Engine.inventoryEntry(state, partId);
    if (!e || e.qty < qty) return false;
    e.qty -= qty;
    if (e.qty === 0) {
      var i = state.inventory.indexOf(e);
      state.inventory.splice(i, 1);
    }
    return true;
  };
  Engine.storageInfo = function (state) {
    var used = 0;
    for (var i = 0; i < state.inventory.length; i++) used += state.inventory[i].qty;
    var slots = Engine.tierInfo(state).storageSlots || 20;
    var year = Engine.currentYear(state);
    return {
      used: used,
      capacity: slots,
      free: Math.max(0, slots - used),
      overage: Math.max(0, used - slots),
      feePerSlot: Engine.round2(Engine.laborRate(year) / Engine.CONFIG.STORAGE_FEE_LABOR_DIV)
    };
  };

  // ------------------------------------------------------------------
  // Overtime-aware hour spending (§9.4). Any hour-consuming action may push
  // hoursLeft negative down to -overtimeCap; an action that would break the
  // floor is refused. Returns {ok:true} or {ok:false, error}.
  // ------------------------------------------------------------------
  Engine.spendHours = function (state, cost) {
    var cap = Engine.CONFIG.overtimeCap;
    if (state.hoursLeft - cost < -cap - 1e-9) {
      return { ok: false, error: 'Too exhausted — call it a day' };
    }
    state.hoursLeft = Engine.round2(state.hoursLeft - cost);
    return { ok: true };
  };
  // Hours still spendable today including the overtime allowance.
  Engine.hoursAvailable = function (state) {
    return Math.max(0, Engine.round2(state.hoursLeft + Engine.CONFIG.overtimeCap));
  };

  // ------------------------------------------------------------------
  // Human-readable platform-tag labels (§9.7 Wiki)
  // ------------------------------------------------------------------
  var TAG_LABELS = {
    'SKT-SLOT1': 'Slot 1', 'SKT-SLOTA': 'Slot A', 'SKT-A': 'Socket A',
    'SKT-7': 'Socket 7', 'SKT-5': 'Socket 5', 'SKT-370': 'Socket 370',
    'SKT-478': 'Socket 478', 'SKT-775': 'LGA 775', 'SKT-1155': 'LGA 1155',
    'SKT-1150': 'LGA 1150', 'SKT-1151': 'LGA 1151', 'SKT-1200': 'LGA 1200',
    'SKT-1700': 'LGA 1700', 'SKT-2011': 'LGA 2011',
    'SKT-AM2': 'Socket AM2', 'SKT-AM3': 'Socket AM3', 'SKT-AM4': 'Socket AM4',
    'SKT-AM5': 'Socket AM5', 'SKT-FM2': 'Socket FM2', 'SKT-939': 'Socket 939',
    'SKT-754': 'Socket 754', 'SKT-462': 'Socket A (462)',
    'MEM-DIP': 'DIP memory chips', 'MEM-30SIMM': '30-pin SIMM',
    'MEM-72SIMM': '72-pin SIMM', 'MEM-SDR': 'SDRAM', 'MEM-RDRAM': 'RDRAM',
    'MEM-DDR': 'DDR', 'MEM-DDR2': 'DDR2', 'MEM-DDR3': 'DDR3',
    'MEM-DDR4': 'DDR4', 'MEM-DDR5': 'DDR5',
    'BUS-ISA8': '8-bit ISA', 'BUS-ISA16': '16-bit ISA', 'BUS-VLB': 'VESA Local Bus',
    'BUS-PCI': 'PCI', 'BUS-AGP': 'AGP', 'BUS-PCIE': 'PCI Express',
    'STOR-FDD': 'Floppy', 'STOR-MFM': 'MFM', 'STOR-IDE': 'IDE/PATA',
    'STOR-SCSI': 'SCSI', 'STOR-SATA': 'SATA', 'STOR-NVME': 'NVMe',
    'FF-XT': 'XT form factor', 'FF-AT': 'AT form factor', 'FF-ATX': 'ATX',
    'FF-MATX': 'Micro-ATX', 'FF-ITX': 'Mini-ITX',
    'ARCH-8BIT': '8-bit', 'ARCH-16': '16-bit x86', 'ARCH-386': '32-bit (386+)',
    'ARCH-586': 'Pentium-class', 'ARCH-X64': '64-bit x86'
  };
  Engine.tagLabel = function (tag) {
    if (TAG_LABELS[tag]) return TAG_LABELS[tag];
    var m = /^([A-Z]+)-(.+)$/.exec(String(tag || ''));
    if (!m) return String(tag || '');
    if (m[1] === 'SKT') return 'Socket ' + m[2];
    return m[2];
  };

  // Rating = mean of last 25 scores.
  Engine.pushScore = function (state, score) {
    score = Engine.clamp(Engine.round2(score), 0, 5);
    var h = state.reputation.history;
    h.push(score);
    while (h.length > Engine.CONFIG.RATING_HISTORY) h.shift();
    var sum = 0;
    for (var i = 0; i < h.length; i++) sum += h[i];
    state.reputation.rating = Engine.round2(sum / h.length);
    return score;
  };
})(typeof window !== 'undefined' ? window : globalThis);
