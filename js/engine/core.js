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

    // Speed settings: hours multiplier & score delta. (v0.3: callback chance now
    // comes from CALLBACK_MATRIX below; callbackBase kept for save-era tooling.)
    SPEED: {
      quick:      { hoursMult: 0.7, callbackBase: 0.12,  scoreDelta: -0.6 },
      standard:   { hoursMult: 1.0, callbackBase: 0.05,  scoreDelta: 0 },
      meticulous: { hoursMult: 1.5, callbackBase: 0.015, scoreDelta: 0.4 }
    },
    // §10.2 callback risk matrix: chance = base + perDiff x difficulty (x ESD 0.6
    // on the difficulty term), then x reliability factor x test-bench mult.
    CALLBACK_MATRIX: {
      quick:      { base: 0.04,  perDiff: 0.035 },
      standard:   { base: 0.02,  perDiff: 0.01 },
      meticulous: { base: 0.005, perDiff: 0.003 }
    },
    ESD_DIFF_TERM_MULT: 0.6,
    CALLBACK_MIN: 0.005, CALLBACK_MAX: 0.40,       // clamp on callback chance (§10.2)
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
    // §17: 0.33 -> 0.42 -> 0.46. Decision moments (§17.1 approvals / PSU
    // swaps) raised the dedicated-jobs lane's $/day, and the diagnose-wedge
    // fix raised it again (the 0.42 calibration was measured against the
    // bug-taxed lane). The flip lane is supply-capped, so arrivals get a
    // matching nudge to hold the long-standing "jobs never out-earn a
    // dedicated flipper by more than 3x" band.
    ASIS_ARRIVAL_CHANCE: 0.46,   // <=1 new arrival/night below cap
    ASIS_START_MIN: 2, ASIS_START_MAX: 4,     // listings seeded at newGame
    ASIS_ASK_MIN: 0.45, ASIS_ASK_MAX: 0.55,   // ask vs part value (§9.6: 40-55%)
    // §14.3: retuned 0.66 -> 0.75 alongside the new used-market saturation
    // mechanic and the §14.8 time-quantization pass (both of which shifted
    // jobs' effective $/hour up sharply — quantization removed artificial
    // half-hour rounding padding that used to inflate small jobs' tracked
    // hours far more than refurbs' chunkier steps) so flips still clear the
    // intended 1.2-1.8x jobs' $/hour band (§9.6) rather than falling behind.
    // Of part value (§9.6 origin: override of §5.4's 0.85). §18 retune
    // 0.745 -> 0.71: the v0.7/v0.8 supply work (arrivals 0.33 -> 0.46 plus
    // weekly deal rotation reshuffling the market stream) left the mixed-bot
    // flip lane clearing ~2.1x jobs' $/hour at 1983 — above the §9.6
    // 1.2-1.8x band. Trimming sale value ~4.7% brings per-flip margin back
    // inside the band without touching supply or hours (0.71 measured
    // 1.83 median — one more notch).
    // §20.1 retune 0.70 -> 0.59: the cart replaces assignPart's old per-call
    // cash-affordability gate with atomic-checkout batching — a customer-job
    // bot no longer stalls mid-repair on a single unaffordable retail buy, so
    // jobs' $/hour rose across the board while flips' $/hour (already a much
    // smaller 6-sale sample per 40-day run) didn't move the same way. At the
    // fixed gate seeds the 1983 median flips/jobs ratio drifted to 3.29x;
    // trimming sale value ~16% re-centers it at 1.50x median (cash band and
    // offer ramp both unaffected — verified at the gate seeds).
    REFURB_SALE_RATIO: 0.59,
    // §13.6: condition scales flip PROCEEDS but is not in the bot's buy decision
    // and consumes the same single RNG draw whatever its range — so nudging the
    // mean 0.93->0.99 restores flip-margin headroom (ratio back toward ~1.4)
    // after the offer-ramp retune WITHOUT perturbing the deterministic stream.
    REFURB_COND_MIN: 0.90, REFURB_COND_MAX: 1.00,  // buyers price in "refurb",
                                 //   mean 0.95, still within §5.4's 0.9-1.1 band
    // §14.3: bumped 3 -> 8. This flat premium scales with laborRate(year), so
    // it grows across eras the same way job pay does — needed so a dedicated
    // flip strategy keeps pace with a dedicated jobs strategy in LATER eras
    // too (parts-value*ratio alone fell behind faster there).
    REFURB_PREMIUM_HOURS: 8,     // working-machine premium = laborRate*this (§9.6/§14.3)
    REFURB_SCRAP_RATIO: 0.25,    // abandon: 25% of parts value
    REFURB_HOURS_MIN: 3, REFURB_HOURS_MAX: 5,  // §9.6: flips are slower work now
    // §14.3 used-market saturation: each refurb sale within a rolling window
    // depresses the NEXT sale's parts-value proceeds (diminishing returns for
    // a pure-flip spam strategy; recovers linearly as sales age out of the
    // window). Applies only to the parts-value*ratio*condition term, not the
    // flat working-machine labor premium.
    REFURB_SAT_WINDOW_DAYS: 21,
    REFURB_SAT_PER_SALE: 0.15,   // depression contributed by one recent sale (full weight)
    REFURB_SAT_MAX: 0.19,        // cap on cumulative depression (floor = 1 - this)
                                 //   (§15 retune 0.20 -> 0.19: the v0.6 features add
                                 //   seeded draws to the nightly stream, reshuffling the
                                 //   gate-seed runs; 0.19 re-centers BOTH flip guards)
    REFURB_VARIANCE_SPREAD: 0.08, // §14.3: widened flip outcome variance (sale-day noise)
    ASIS_MAX_AGE_YEARS: 12,      // how far back as-is machines reach
    ASIS_MAX_VALUE_BB_MULT: 1.0, // dealers keep machines worth > buildBudget x this
    // §9.5 strip-for-parts
    STRIP_HOURS: 1.5,
    STRIP_SURVIVAL: 0.9, STRIP_SURVIVAL_ESD: 0.97,

    // §10.1 step-based tasks
    PREMIUM_STEP_NUDGE: 0.25,    // premium part adds this to its install step
    // §10.2 derived difficulty: base by type + category bonus + premium/legacy
    DIFF_BASE: { repair: 2, upgrade: 1, software: 1, cleaning: 1, peripheral: 2,
                 data_recovery: 3, build: 2, enthusiast: 3, contract: 3,
                 refurb: 2, callback: 2, device_repair: 2 },
    DIFF_CAT_BONUS: { motherboard: 1, cpu: 1 },
    LEGACY_MACHINE_YEARS: 8,     // machine older than this => +1 difficulty
    // §10.5 peripheral kinds set difficulty (CRT rebuild > mouse fix)
    PERIPHERAL_KIND_DIFF: { crt: 3, printer: 2, lcd: 2, modem: 2, scanner: 2,
                            input: 1, other: 2 },
    // §10.4/§14.2 overspend: installed price > max(mult x original, original+laborRate)
    // is a mild overspend; > OVERSPEND_HARD_MULT x original is a hard one.
    // Graded, waived for taste-match/enthusiast; never combined with a downgrade
    // ding on the same part.
    OVERSPEND_MULT: 1.75,
    OVERSPEND_HARD_MULT: 2.5,
    OVERSPEND_SCORE_MILD: 0.25,
    OVERSPEND_SCORE_HARD: 0.5,
    // §14.2 downgrade: installed replacement's class-defining metric (cpu/ram/
    // storage/gpu) is below the original's — repair only (upgrade is hard-
    // gated by §14.1). Waived for labor-only faults (no part swap => moot) and
    // budget-conscious customers (job.budgetAsk).
    DOWNGRADE_SCORE: 0.4,
    BUDGET_REPAIR_CHANCE: 0.12,  // §14.2: fraction of repairs that are budget/for-parts asks
    // §10.7 staff
    STAFF_SLOTS: [0, 1, 3, 6],   // by shop tier (garage = solo)
    STAFF_WAGE_BASE: 110,        // wageMonthly ~ laborRate x this x skill x wageFactor
    STAFF_SKILL_MIN: 0.15, STAFF_SKILL_MAX: 0.35,
    STAFF_DECAY: 0.75,           // k-th helper contributes skill x 0.75^(k-1)
    APPRENTICE_EFFECT: 0.5,      // apprentices help every job type at half skill
    STAFF_REFRESH_DAYS: 7,       // candidate market refresh cadence
    STAFF_CANDIDATES_MIN: 2, STAFF_CANDIDATES_MAX: 4,
    SEVERANCE_MONTHS: 0.5,       // firing costs wageMonthly x this
    FIRE_REP_SCORE: 2.5,         // small rep ding when firing (doubled at L4+, §11.5)
    // §11.5 staff XP & levels: fixed thresholds (boosted-hours) & skill table.
    // Wage stays laborRate x 110 x skill x wageFactor — fixing skill per level
    // fixes the wage table too (year-rescaled on the 1st).
    STAFF_LEVEL_THRESHOLDS: [0, 40, 120, 280, 520],  // xp to REACH L1..L5
    STAFF_SKILL_TABLE: [0.16, 0.20, 0.25, 0.30, 0.36],
    STAFF_TITLES: ['Junior', '', 'Experienced', 'Senior', 'Master'],
    STAFF_CANDIDATE_MAX_LEVEL: 2,   // elite talent must be grown in-house (§11.5)
    // §11.2 offer ramp-down (§13.6 retune: the rating term's transition sits at
    //   rating = 3 + 0.5*OFFER_RATING_DIV, so a garage that has clawed to ~4.3★
    //   still sits a notch below the +1 offer bump — keeps the 1983 40-day mean
    //   comfortably under the 3.6 gate instead of pinning at the tier cap).
    OFFER_TIER_CAPS: [4, 6, 8, 11],   // offers/night cap by shop tier
    OFFER_RATING_DIV: 3.0,       // divisor in clamp(round((rating-3)/div), -1, 1)
    OFFER_EVENT_ADJ_MAX: 3,      // cap on the positive event-surge term (walk-ins)
    OFFER_BUSY_THRESHOLD: 10,    // pending offers >= this halves new arrivals
    // §11.6 waiting steps
    WAIT_START_HOURS: 0.1,       // labor cost to set a wait step running

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
      callback: 0, device_repair: 1.0
    },
    BENCH_FEE_LABOR_MULT: 0.5,   // §9.6: repairs add ~0.5x laborRate bench fee to payout
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
    // §19.3: rush jobs pay 1.8 -> 2.2 — the premium now also covers auto-rush
    // shipping on their market fills (same-day parts at no extra charge).
    RUSH_CHANCE: 0.08, RUSH_PAY_MULT: 2.2,
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
    // Promotion press: 21 -> 14 days after the §17.1 diagnose-wedge fix.
    // Faster job flow reaches tiers 1-2 within ~20 days of a 1983 start;
    // 21d boosts overlapped into an always-on ramp (median 3.77 offers/day
    // vs the 3.6 band). 14d keeps the celebration, ends the overlap.
    PRESS_BOOST_MULT: 1.35, PRESS_BOOST_DAYS: 14,   // fired on prestige-up

    // Workstations
    SOFT_CAP_HOURS_MULT: 1.5,    // jobs beyond slots worked same day take +50% hours
    // §16.2d: accept-cap tightened 2.0 -> 1.5 (playtest P1.4 — "accept
    // everything" overbooked a solo shop into 14-19% deadline failures).
    HARD_CAP_SLOTS_MULT: 1.5,    // acceptOffer fails at active non-refurb >= slots*1.5
    ACCEPT_WARN_LOAD: 0.8,       // §16.2d: acceptOffer warns when committed std hours
                                 //   exceed this fraction of workable hours pre-deadline
    // §16.2b: late-era shop upgrades cost-scale capped (playtest P1.2 — 2021
    // tier-1 at yearScale x3.39 = $13.6k never paid back; x2.2 lands ~$8.8k).
    UPGRADE_COST_SCALE_CAP: 2.2,
    NET_HISTORY_DAYS: 14,        // trailing window for the §16.2b payback estimate
    // §16.3b: stock pulls on customer jobs bill at min(current, avgCost x this)
    // x the 1.25 markup (playtest P2.2 — legacy drift let stockpiles bill ~10x
    // cost; the shop's own builds/flips keep full buy-ahead-of-shock upside).
    STOCK_BILL_CAP: 1.5,

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

    // §12.1/§12.2 motherboard slots & multi-GPU
    SLOT_DEFAULTS: { ram: 99, gpu: 99, storage: 99 },  // boards without slots data
    MULTI_GPU_SECOND: 0.65,         // 2nd matched card adds 65% of its score
    MULTI_GPU_SECOND_VOODOO: 0.90,  // Voodoo2 scan-line interleave: near-ideal
    MULTI_GPU_CHANCE: 0.35,         // gaming build asks for a pair (when feasible)
    RAM_HEAVY_CHANCE: 0.30,         // office/ws/server build goes RAM-maxed (2003+)
    RAM_HEAVY_STICK_MULT: 2.5,      // target = 2.5x biggest stick => needs 3+ sticks
    VOODOO2_WINDOW: [1998, 2000],   // §12.2 accurate multi-GPU request windows
    SLI_WINDOW: [2005, 2016],
    // §12.4 device repair (Apple + mobile)
    DEVICE_REPAIR_TAIL_YEARS: 6,    // devices repairable this long past EOL
    DEVICE_APPLE_WEIGHT: 1.2,       // offer-pool weight (repairs are 10)
    DEVICE_MOBILE_RAMP: { 2009: 1.5, 2013: 4, 2016: 6 },  // boom-era volume ramp
    DEVICE_TIER_FACTOR: { budget: 2, mainstream: 4, premium: 7, flagship: 10 },
    TABLET_VALUE_MULT: 1.5,         // bigger panels cost more (research §4.1)
    APPLE_VALUE_MULT: 2.0,          // device value = mid(basePriceRange) x this
    APPLE_MODERN_YEAR: 2012,        // the soldered-RAM/glued-battery hinge year
    APPLE_MODERN_PARTS_MULT: 1.5,   // post-2012 Apple parts cost more

    NEW_BADGE_DAYS: 90,          // market "isNew" window

    // §13.4 certifications — effects fold multiplicatively/additively alongside
    // equipment & staff, sensibly capped so no single track dominates the game.
    CERT_TIME_MULT_FLOOR: 0.5,      // combined cert job-time mult never drops below this
    CERT_PAY_MULT_CEIL: 1.6,        // combined cert pay mult never exceeds this
    CERT_CALLBACK_MULT_FLOOR: 0.4,  // combined cert callback mult never drops below this
    CERT_PRESTIGE_BONUS_CAP: 2,     // extra prestige tiers a full cert roster can grant
    CERT_RELIABILITY_BONUS_CAP: 15, // extra "avg reliability" points certs can add

    // §15.1 era transitions (DATA.TRANSITIONS drives which/when)
    TRANSITION_WARN_LEAD_DAYS: 60,  // newsLead fires this many days before start
    TRANSITION_OBSOLETE_BLEED: 0.5, // obsolete-tag parts lose up to this fraction of
                                    // value, ramping over the window (permanent after)
    TRANSITION_UNRETRAINED_MULT: 0.5, // staff contribution mult on boosted types until retrained
    // §15.2 scenario grading: score thresholds for S/A/B/C (else D). Data
    // scoring weights should be tuned so a solid run lands ~500-900 points.
    SCENARIO_GRADES: [{ grade: 'S', min: 900 }, { grade: 'A', min: 700 },
                      { grade: 'B', min: 500 }, { grade: 'C', min: 300 }],
    // §15.3 credit line
    CREDIT_PRESTIGE_MIN: 1,
    CREDIT_LIMIT_LABOR_MULT: 40,    // limit = laborRate(year) x this x (1 + prestige)
    CREDIT_APR_TABLE: { 1983: 0.19, 1995: 0.12, 2010: 0.08, 2021: 0.07 },  // interpolated
    CREDIT_PAPERWORK_HOURS: 0.1,    // per draw/repay operation (overtime rules)
    // §15.4 repeat customers
    REGULAR_SCORE_MIN: 4,           // completion score that earns a spot in state.regulars
    REGULARS_CAP: 30,
    REGULAR_PAY_MULT: 1.10,         // loyalty premium on a returning regular's job
    REGULAR_FAIL_EXTRA: 0.3,        // extra score reduction when a regular's job fails
    REGULAR_CHANCE_BASE: 0.10,      // per-offer chance a regular returns, at rating 3...
    REGULAR_CHANCE_PER_STAR: 0.06,  // ...plus this per rating point above 3, capped
    REGULAR_CHANCE_MAX: 0.35,
    REGULAR_TASTE_BONUS: 15,        // regulars' persistent taste bonusPct
    // §15.4 business accounts
    ACCOUNT_PRESTIGE_MIN: 2,
    ACCOUNT_OFFER_CHANCE: 0.04,     // per night when eligible (~monthly)
    ACCOUNT_MAX_ACTIVE: 3,
    ACCOUNT_FEE_LABOR_MULT: 6,      // monthlyFee = laborRate(year) x this (whole $)
    ACCOUNT_JOBS_MIN: 2, ACCOUNT_JOBS_MAX: 4,   // auto-jobs per month
    ACCOUNT_MIN_RATING_DELTA: 0.7,  // minRating = clamp(rating - this, floor, cap)
    ACCOUNT_MIN_RATING_FLOOR: 2.5, ACCOUNT_MIN_RATING_CAP: 4.0,
    ACCOUNT_FAILS_CANCEL: 2,        // failed account jobs in a month -> cancel
    ACCOUNT_CANCEL_SCORE: 1.5,      // rep hit pushed when an account cancels
    ACCOUNT_DEADLINE_MIN: 5, ACCOUNT_DEADLINE_MAX: 10,  // relaxed deadlines
    // §15.6 difficulty multiplier sets (sandbox eras; scenarios pin standard).
    // Balance guards stay pinned to standard.
    DIFFICULTY: {
      relaxed:  { cashMult: 1.3, rentMult: 0.85, payMult: 1.1,  graceDays: 21,
                  negEventMult: 0.7,
                  rentCreepQuarterly: 0, rentCreepCap: 1, offerDelta: 0, storageMult: 1 },
      standard: { cashMult: 1.0, rentMult: 1.0,  payMult: 1.0,  graceDays: 14,
                  negEventMult: 1.0,
                  rentCreepQuarterly: 0, rentCreepCap: 1, offerDelta: 0, storageMult: 1 },
      // §17.4: Survival got real teeth — compounding rent creep, a 7-day
      // grace window, one fewer nightly offer, harsher negative events, and
      // a 25% tighter free-storage threshold. Standard/Relaxed untouched.
      survival: { cashMult: 0.8, rentMult: 1.15, payMult: 0.95, graceDays: 7,
                  negEventMult: 1.5,
                  rentCreepQuarterly: 0.02, rentCreepCap: 1.6,
                  offerDelta: -1, storageMult: 0.75 }
    },

    // §17.1 job decision moments — at most ONE per job, rolled at generation
    // on the faults stream. Chances/effects all tunable here.
    DECISION_CHANCE: 0.35,          // eligible jobs that get a fork/approval armed
    TUNING_CHANCE: 1.0,             // overclock jobs: the tuning choice IS the job
    FORK_PATCH: { hoursMult: 0.6, payMult: 0.85, callbackMult: 2.2,
                  devicePartsMult: 0.3 },
    APPROVAL_CALL_HOURS: 0.1,       // the customer call (0.1h grid, overtime rules)
    APPROVAL_YES_CHANCE: 0.8,       // seeded on the faults stream
    APPROVAL_ADD_HOURS: 1,          // labor added by an approved add-on
    // "glad you caught that" completion bonus. 0.2 -> 0.1 after the §17.1
    // diagnose-wedge fix: with diagnoses flowing at full speed, 0.2
    // compounded through rating -> prestige -> offer ramp and pushed the
    // 1983 guard median past its 3.6/day band. Delight texture stays.
    APPROVAL_DELIGHT_SCORE: 0.1,
    APPROVAL_SKIP_CALLBACK_MULT: 1.5, // leaving a discovery alone raises callback risk
    TUNING: {
      conservative: { scoreBonus: 0.15, risk: 0 },
      balanced:     { scoreBonus: 0.3,  risk: 0.08 },
      aggressive:   { scoreBonus: 0.5,  risk: 0.18 }
    },
    TUNING_UNSTABLE_SCORE: 0.2,     // rating ding when a hot tune doesn't hold
    TUNING_REDO_HOURS: 1,           // bench time to back off & re-burn-in
    // §17.1 PSU gate (overseer audit): an upgrade part pushing machine draw
    // past watts/PSU_HEADROOM needs an approved PSU swap first.
    PSU_SWAP_HOURS: 0.5,            // labor for the quoted PSU swap (0.1h grid)
    PSU_SWAP_HEADROOM_MULT: 1.35,   // the quoted replacement PSU's watts margin

    // §18.1 distributors — wholesale supply: cheaper-but-slower vs retail.
    DIST_QTY_TIERS: [               // bulk tiers ON TOP of base+relationship
      { qty: 25, disc: 0.10 },
      { qty: 10, disc: 0.06 },
      { qty: 5,  disc: 0.03 }
    ],
    DIST_ORDER_HOURS: 0.2,          // paperwork per order (0.1h grid, overtime rules)
    DIST_CANCEL_FEE: 0.10,          // restocking fee, pre-ship cancels only
    DIST_REL_DISCOUNTS: [0, 0.01, 0.02, 0.03],   // New/Regular/Preferred/Partner
    // Lifetime-spend promotion thresholds, year-scaled: threshold($) =
    // laborRate(currentYear) x mult — a Regular in 1983 and one in 2021 both
    // represent "a real customer", not the same nominal dollars. Calibrated
    // so one mid-size order can't leapfrog tiers: at 1996 (laborRate ~$45)
    // Regular ≈ $1.35k, Preferred ≈ $6.8k, Partner ≈ $18k lifetime (the
    // first rung is reachable inside a wholesale-leaning 60-day run).
    DIST_REL_LABOR_MULTS: [0, 30, 150, 400],
    DIST_REL_LABELS: ['New', 'Regular', 'Preferred', 'Partner'],
    DIST_SPECIALTY_BONUS: 0.03,     // extra off in a distributor's specialty categories
                                    //   (0.02 left the 1996 margin median at the band floor)
    DIST_PARTNER_LEAD_CUT: 1,       // Partner shaves a lead day...
    DIST_LEAD_MIN: 1,               // ...never below 1
    DIST_DEALS_PER_WEEK: [1, 2],    // Monday rotation, per era-active distributor
    DIST_DEAL_RANGE: [0.12, 0.25],  // weekly deal discount band
    DIST_DEAL_GLUT_BONUS: 0.05,     // glut categories (price-slump events) cut deeper
    DIST_DEAL_CAP: 0.30,            // deal discount ceiling after glut bonus
    DIST_DEAL_MAXQTY: [3, 8],       // units per deal
    DIST_DEAL_SPECIALTY_CHANCE: 0.6, // deals lean into the distributor's specialty
    DIST_TOTAL_DISC_CAP: 0.35,      // sanity ceiling on any stacked order discount
    DIST_ALLOC_QTY: 3,              // shortage allocation cap at Preferred+ (list price)
    DIST_GRAY_REL_PENALTY: 10,      // gray-market parts: -10 reliability when consumed
    DIST_GRAY_REL_FLOOR: 40,        // ...never below 40

    // §19.3 universal logistics — three honest supply tiers: wholesale
    // (2-5 days, cheapest), retail (next morning, list price), rush
    // (same-day, list + premium).
    RETAIL_LEAD_DAYS: 1,            // market buys arrive next morning
    RUSH_SURCHARGE_PCT: 0.25,       // same-day premium on the order total...
    RUSH_SURCHARGE_MIN: 10,         // ...never less than this
    DEADLINE_PAD_PARTS: 1,          // repairs/upgrades wait for parts now
    DEADLINE_PAD_BUILD: 2,          // builds & contracts source many parts

    // §19.6 stock builds & peripheral bundles
    STOCK_BUILD_FRESH_MIN: 1.05,    // freshness premium over parts value
    STOCK_BUILD_FRESH_MAX: 1.15,
    BUNDLE_MAX: 3,                  // peripherals attachable to any machine sale
    BUNDLE_VALUE_MULT: 1.15,        // each adds market value x this

    // §19.7 primary-vs-removable storage
    PRIMARY_STORAGE_YEAR: 1988,     // builds need a non-removable drive from here
    MACHINE_FLOPPY_YEARS: [1983, 1995],  // era-typical extra floppy in customer machines

    // v0.9.1 shopping cart — one flat checkout cost regardless of line count
    // (cheaper than the old 0.5h SUPPLY_RUN_HOURS habit it replaces for part
    // purchases). Courier fee reuses RUSH_SURCHARGE_MIN/PCT at cart level.
    CHECKOUT_HOURS: 0.2
  };

  // ------------------------------------------------------------------
  // Live state reference (set by api.js newGame/importSave)
  // ------------------------------------------------------------------
  Engine.VERSION = '0.9.1';      // v0.9.1: parseFloat-compatible with the UI's >=0.4 gate
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
  // Seeded RNG — §17.5: five NAMED mulberry32 streams in state.rng
  // {prices, offers, faults, market, misc}, seeded from the game seed +
  // fixed salts. Draws route by domain so new features' draws in one domain
  // never reshuffle the others (the v0.5-v0.6.1 "gate-seed churn" killer):
  //   prices — nightly noise walk & price history
  //   offers — offer generation, customers, tastes, copy, regulars, accounts
  //   faults — fault categories/templates, §17.1 decision & discovery rolls
  //   market — as-is machines, refurb condition/sale variance, market events
  //   misc   — mishaps, callbacks, DR success, strip survival, staff market
  // ------------------------------------------------------------------
  var RNG_SALTS = {
    prices: 0x1F123BB5, offers: 0x9E3779B9, faults: 0xC2B2AE3D,
    market: 0x27D4EB2F, misc: 0x165667B1
  };
  Engine.RNG_STREAMS = ['prices', 'offers', 'faults', 'market', 'misc'];
  function mixSeed(seed, salt) {
    var t = (seed ^ salt) | 0;
    t = Math.imul(t ^ (t >>> 16), 0x45D9F3B);
    t = Math.imul(t ^ (t >>> 16), 0x45D9F3B);
    return (t ^ (t >>> 16)) | 0;
  }
  // Fresh stream states for a game seed (newGame + the v7->v8 migration).
  Engine.seedRngStreams = function (seed) {
    var rng = {};
    for (var i = 0; i < Engine.RNG_STREAMS.length; i++) {
      var name = Engine.RNG_STREAMS[i];
      rng[name] = mixSeed(seed | 0, RNG_SALTS[name]);
    }
    return rng;
  };
  Engine.rand = function (stream) {
    var s = Engine._state;
    if (!s) return 0.5; // no state yet; deterministic fallback (never used in play)
    if (!s.rng) s.rng = Engine.seedRngStreams(s.rngState != null ? s.rngState : s.seed);
    var key = RNG_SALTS[stream] ? stream : 'misc';
    s.rng[key] = (s.rng[key] + 0x6D2B79F5) | 0;
    var t = s.rng[key];
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Engine.randInt = function (min, max, stream) { // inclusive
    return min + Math.floor(Engine.rand(stream) * (max - min + 1));
  };
  Engine.uniform = function (a, b, stream) { return a + Engine.rand(stream) * (b - a); };
  Engine.pick = function (arr, stream) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Engine.rand(stream) * arr.length)];
  };
  Engine.chance = function (p, stream) { return Engine.rand(stream) < p; };

  // ------------------------------------------------------------------
  // Numeric hygiene
  // ------------------------------------------------------------------
  Engine.round2 = function (x) {
    if (!isFinite(x)) return 0;
    return Math.round((x + Number.EPSILON) * 100) / 100;
  };
  // §14.8: the time-accounting grid — every hour quantity (step hours,
  // hoursRequired/hoursLeft, overtime, wait-starts, study, supply runs) snaps
  // to the nearest 0.1h (6 min). Normalizes -0 to plain 0.
  Engine.round1 = function (x) {
    if (!isFinite(x)) return 0;
    var r = Math.round((x + Number.EPSILON) * 10) / 10;
    return r === 0 ? 0 : r;
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

  // §19.9 (#10): human labels for job types — engine copy must never emit
  // raw id lists like "software/data_recovery".
  Engine.JOB_TYPE_LABELS = {
    repair: 'repairs', upgrade: 'upgrades', software: 'software work',
    data_recovery: 'data recovery', cleaning: 'cleanings',
    build: 'custom builds', contract: 'contract work',
    enthusiast: 'enthusiast work', peripheral: 'peripheral fixes',
    device_repair: 'device repairs', refurb: 'refurb work',
    callback: 'callbacks', business_account: 'account work'
  };
  Engine.jobTypeLabel = function (t) {
    return Engine.JOB_TYPE_LABELS[t] || String(t).replace(/_/g, ' ');
  };
  Engine.humanizeJobTypes = function (types) {
    var labels = (types || []).map(Engine.jobTypeLabel);
    if (!labels.length) return '';
    var s = labels.length === 1 ? labels[0] :
      labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // §19.9 (#16): dynamic capacity units. Input is MB (the engine's ramMB
  // axis); storageGB callers pass gb * 1024. "64 KB", "640 KB", "8 MB",
  // "1.2 GB", "2 TB" — never "0.0625 MB".
  Engine.fmtCapacity = function (mb) {
    if (mb == null || !isFinite(mb)) return '?';
    function n(x) {
      var r = Math.round(x * 10) / 10;
      return (r % 1 === 0) ? String(Math.round(r)) : r.toFixed(1);
    }
    var kb = mb * 1024;
    if (kb < 1000) return n(kb) + ' KB';
    if (mb < 1000) return n(mb) + ' MB';
    var gb = mb / 1024;
    if (gb < 1000) return n(gb) + ' GB';
    return n(gb / 1024) + ' TB';
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
  // ------------------------------------------------------------------
  // v0.9.1 shopping cart — shared low-level state-shape helpers used by
  // jobs.js (assignPart job-linking) and api.js (the cart mutators
  // themselves). No dependency on Pricing/Sim so this can live in core.js.
  // ------------------------------------------------------------------
  Engine.cartOf = function (state) {
    if (!state.cart || typeof state.cart !== 'object') state.cart = { nextId: 1, items: [] };
    if (!Array.isArray(state.cart.items)) state.cart.items = [];
    if (state.cart.nextId == null) state.cart.nextId = 1;
    return state.cart;
  };
  // Units of `partId` already sitting in the cart earmarked for this exact
  // job/need slot (summed across every cart line that carries a link to it).
  Engine.cartQtyForNeed = function (state, jobId, needIndex) {
    var cart = state.cart;
    if (!cart || !Array.isArray(cart.items)) return 0;
    var total = 0;
    for (var i = 0; i < cart.items.length; i++) {
      var links = cart.items[i].jobLinks || [];
      for (var j = 0; j < links.length; j++) {
        if (links[j].jobId === jobId && links[j].needIndex === needIndex) total += links[j].qty;
      }
    }
    return total;
  };
  // Add (or top up) a RETAIL cart line carrying a job link — the un-stocked
  // half of assignPart (§20.2). Merges into an existing retail+partId line
  // exactly like a manual addToCart would, and folds into any existing link
  // for the SAME job/need rather than creating a duplicate entry.
  Engine.cartAddJobLink = function (state, jobId, needIndex, partId, qty) {
    var cart = Engine.cartOf(state);
    var item = null;
    for (var i = 0; i < cart.items.length; i++) {
      if (cart.items[i].source === 'retail' && cart.items[i].partId === partId) {
        item = cart.items[i]; break;
      }
    }
    if (!item) {
      item = { id: cart.nextId++, source: 'retail', partId: partId, qty: 0, jobLinks: [] };
      cart.items.push(item);
    }
    item.qty += qty;
    var link = null;
    for (var j = 0; j < item.jobLinks.length; j++) {
      if (item.jobLinks[j].jobId === jobId && item.jobLinks[j].needIndex === needIndex) {
        link = item.jobLinks[j]; break;
      }
    }
    if (link) link.qty += qty;
    else item.jobLinks.push({ jobId: jobId, needIndex: needIndex, qty: qty });
    return { ok: true, itemId: item.id };
  };
  // §20.2: release ONE unit of a job's cart-linked (not-yet-filled) retail
  // reservation for a need — unassignPart's counterpart for an in-cart slot.
  // Matches the first cart item carrying a jobLink for {jobId, needIndex}
  // (optionally constrained to a specific partId); shrinks/removes that link
  // and the cart line's qty together, removing the line entirely at zero.
  Engine.cartReleaseNeedLink = function (state, jobId, needIndex, partId, qty) {
    qty = qty || 1;
    var cart = state.cart;
    if (!cart || !Array.isArray(cart.items)) return { ok: false, error: 'Nothing in the cart for that slot' };
    for (var i = 0; i < cart.items.length; i++) {
      var item = cart.items[i];
      if (partId != null && item.partId !== partId) continue;
      var links = item.jobLinks || [];
      for (var j = 0; j < links.length; j++) {
        if (links[j].jobId !== jobId || links[j].needIndex !== needIndex) continue;
        var take = Math.min(qty, links[j].qty);
        links[j].qty -= take;
        item.qty -= take;
        if (links[j].qty <= 0) links.splice(j, 1);
        if (item.qty <= 0) cart.items.splice(i, 1);
        return { ok: true, qty: take, partId: item.partId };
      }
    }
    return { ok: false, error: 'Nothing in the cart for that slot' };
  };
  // A job left the active list (completed/abandoned/deadline-swept/etc) —
  // strip every cart jobLink that points at it. The cart LINE itself (and its
  // qty) survives; it just stops being "for" a job that no longer exists.
  // Never leaves an orphan jobLink behind (sim-test invariant, §20.2).
  Engine.cartUnlinkJob = function (state, jobId) {
    var cart = state.cart;
    if (!cart || !Array.isArray(cart.items)) return [];
    var unlinked = [];
    for (var i = 0; i < cart.items.length; i++) {
      var links = cart.items[i].jobLinks;
      if (!links || !links.length) continue;
      for (var j = links.length - 1; j >= 0; j--) {
        if (links[j].jobId === jobId) {
          unlinked.push({ jobId: links[j].jobId, needIndex: links[j].needIndex });
          links.splice(j, 1);
        }
      }
    }
    return unlinked;
  };
  // Push one pendingOrder, auto-incrementing nextOrderId. `base` carries
  // source-specific fields (source, distributorId, partId, partName,
  // distName, gray); jobId/needIndex may be null for plain shop stock.
  Engine.pushPendingOrder = function (state, base, qty, unitCost, arrivesDay, jobId, needIndex) {
    state.nextOrderId = state.nextOrderId || 1;
    state.pendingOrders = state.pendingOrders || [];
    var order = {
      id: state.nextOrderId++, source: base.source, distributorId: base.distributorId,
      partId: base.partId, partName: base.partName, distName: base.distName,
      qty: qty, unitCost: unitCost, total: Engine.round2(unitCost * qty),
      placedDay: state.day, arrivesDay: arrivesDay, gray: !!base.gray,
      jobId: jobId != null ? jobId : null, needIndex: needIndex != null ? needIndex : null
    };
    state.pendingOrders.push(order);
    return order;
  };
  // Split a qty across jobLinks [{jobId,needIndex,qty}], with any remainder
  // landing as a plain-stock order. unitCost/arrivesDay are shared across the
  // whole split — bulk/deal pricing is computed once on the FULL qty, never
  // re-quoted per chunk, so what the cart showed is exactly what's charged.
  Engine.pushSplitOrders = function (state, base, qty, unitCost, arrivesDay, jobLinks) {
    var orders = [], allocated = 0;
    (jobLinks || []).forEach(function (jl) {
      var q = Math.min(jl.qty, qty - allocated);
      if (q <= 0) return;
      allocated += q;
      orders.push(Engine.pushPendingOrder(state, base, q, unitCost, arrivesDay, jl.jobId, jl.needIndex));
    });
    var leftover = qty - allocated;
    if (leftover > 0) orders.push(Engine.pushPendingOrder(state, base, leftover, unitCost, arrivesDay, null, null));
    return orders;
  };

  Engine.storageInfo = function (state) {
    var used = 0;
    for (var i = 0; i < state.inventory.length; i++) used += state.inventory[i].qty;
    var slots = Engine.tierInfo(state).storageSlots || 20;
    // §17.4: Survival tightens the free-storage threshold by 25%
    slots = Math.max(1, Math.floor(slots * (Engine.difficultyFor(state).storageMult || 1)));
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
    state.hoursLeft = Engine.round1(state.hoursLeft - cost);   // §14.8: 0.1h grid
    // §15.5: hitting the overtime floor exactly is achievement-worthy
    if (state.hoursLeft <= -cap + 1e-9 && Engine.recordAchievementEvent)
      Engine.recordAchievementEvent(state, 'overtime-floor');
    return { ok: true };
  };
  // Hours still spendable today including the overtime allowance.
  Engine.hoursAvailable = function (state) {
    return Math.max(0, Engine.round1(state.hoursLeft + Engine.CONFIG.overtimeCap));
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

  // ------------------------------------------------------------------
  // Staff (§10.7)
  // ------------------------------------------------------------------
  // Fallback roles so the engine works before/without DATA.STAFF_ROLES.
  var FALLBACK_STAFF_ROLES = [
    { id: 'technician', name: 'Technician',
      desc: 'Bench work: repairs, upgrades, refurbs, peripherals, cleaning.',
      jobTypes: ['repair', 'upgrade', 'refurb', 'peripheral', 'cleaning', 'callback',
                 'device_repair'],
      wageFactor: 1 },
    { id: 'software', name: 'Software Specialist',
      desc: 'OS installs, virus cleanup, data recovery.',
      jobTypes: ['software', 'data_recovery'], wageFactor: 1 },
    { id: 'builder', name: 'Builder',
      desc: 'Custom builds, contracts, enthusiast work.',
      jobTypes: ['build', 'contract', 'enthusiast'], wageFactor: 1.1 },
    { id: 'apprentice', name: 'Apprentice',
      desc: 'Helps with everything, at half effect. Cheap.',
      jobTypes: [], wageFactor: 0.55 }
  ];
  Engine.staffRoles = function () {
    var roles = Engine.getData().STAFF_ROLES;
    return (Array.isArray(roles) && roles.length) ? roles : FALLBACK_STAFF_ROLES;
  };
  Engine.staffRoleById = function (id) {
    var roles = Engine.staffRoles();
    for (var i = 0; i < roles.length; i++) if (roles[i].id === id) return roles[i];
    return null;
  };
  function isApprenticeRole(role) {
    return role && (role.id === 'apprentice' || !(role.jobTypes || []).length);
  }
  Engine.isApprenticeRole = isApprenticeRole;
  /* §12.4: device repair is Technician work. Role data that predates v0.4b
   * won't list 'device_repair', so any role covering 'repair' covers it —
   * the software specialist (software/data_recovery only) never does. */
  function roleCoversType(role, jobType) {
    var types = (role && role.jobTypes) || [];
    if (types.indexOf(jobType) !== -1) return true;
    return jobType === 'device_repair' && types.indexOf('repair') !== -1;
  }
  Engine.roleCoversType = roleCoversType;

  /* §10.7: time multiplier for an action on job type T = 1 / (1 + S),
   * S = sum over applicable staff (by contribution desc) of skill x 0.75^(k-1);
   * apprentices contribute skill x 0.5 to every type. */
  Engine.staffTimeMult = function (state, jobType) {
    var C = Engine.CONFIG;
    if (!state.staff || !state.staff.length) return 1;
    // §15.1: during an active transition, staff who haven't retrained for it
    // contribute at half effect on the job types the transition boosts.
    var penaltyIds = [];
    var actives = Engine.activeTransitions(state);
    for (var a = 0; a < actives.length; a++) {
      if (Engine.transitionBoostTypes(actives[a]).indexOf(jobType) !== -1)
        penaltyIds.push(actives[a].id);
    }
    var contribs = [];
    for (var i = 0; i < state.staff.length; i++) {
      var st = state.staff[i];
      var role = Engine.staffRoleById(st.role);
      if (!role) continue;
      var eff = null;
      if (isApprenticeRole(role)) eff = st.skill * C.APPRENTICE_EFFECT;
      else if (roleCoversType(role, jobType)) eff = st.skill;
      if (eff == null) continue;
      for (var p = 0; p < penaltyIds.length; p++) {
        if ((st.retrainedFor || []).indexOf(penaltyIds[p]) === -1)
          eff *= C.TRANSITION_UNRETRAINED_MULT;
      }
      contribs.push(eff);
    }
    if (!contribs.length) return 1;
    contribs.sort(function (a, b) { return b - a; });
    var S = 0;
    for (var k = 0; k < contribs.length; k++)
      S += contribs[k] * Math.pow(C.STAFF_DECAY, k);
    return 1 / (1 + S);
  };
  Engine.staffWageFor = function (year, skill, wageFactor) {
    return Engine.round2(Engine.laborRate(year) * Engine.CONFIG.STAFF_WAGE_BASE *
                         skill * (wageFactor || 1));
  };

  // ------------------------------------------------------------------
  // Staff XP & levels (§11.5) — fixed tables, no rolled values
  // ------------------------------------------------------------------
  Engine.staffSkillFor = function (level) {
    var t = Engine.CONFIG.STAFF_SKILL_TABLE;
    return t[Engine.clamp(level, 1, t.length) - 1];
  };
  Engine.staffTitleFor = function (role, level) {
    var prefix = Engine.CONFIG.STAFF_TITLES[Engine.clamp(level, 1, 5) - 1] || '';
    var base = role ? role.name : 'Employee';
    return prefix ? prefix + ' ' + base : base;
  };
  // Nearest level for a legacy rolled skill (v3 -> v4 migration).
  Engine.staffLevelForSkill = function (skill) {
    var t = Engine.CONFIG.STAFF_SKILL_TABLE, best = 1, dist = Infinity;
    for (var i = 0; i < t.length; i++) {
      var d = Math.abs((skill || t[0]) - t[i]);
      if (d < dist) { dist = d; best = i + 1; }
    }
    return best;
  };
  /* Accrue XP = hours of actions each applicable staffer boosted (§11.5).
   * Level-ups update skill/wage/title from the fixed tables, push news, and
   * queue a morning-summary line via state.levelUpsToday. */
  Engine.accrueStaffXp = function (state, jobType, hours) {
    if (!state.staff || !state.staff.length || !(hours > 0)) return;
    var C = Engine.CONFIG;
    var year = Engine.currentYear(state);
    for (var i = 0; i < state.staff.length; i++) {
      var m = state.staff[i];
      var role = Engine.staffRoleById(m.role);
      if (!role) continue;
      var applicable = isApprenticeRole(role) || roleCoversType(role, jobType);
      if (!applicable) continue;
      m.xp = Engine.round2((m.xp || 0) + hours);
      while ((m.level || 1) < C.STAFF_LEVEL_THRESHOLDS.length &&
             m.xp >= C.STAFF_LEVEL_THRESHOLDS[m.level || 1]) {
        m.level = (m.level || 1) + 1;
        m.skill = Engine.staffSkillFor(m.level);
        m.wageMonthly = Engine.staffWageFor(year, m.skill, role.wageFactor);
        m.title = Engine.staffTitleFor(role, m.level);
        var msg = m.name + ' is now ' + m.title + ' (level ' + m.level + ')';
        Engine.pushNews(state, 'system', 'Level up: ' + m.name,
          msg + '. New wage ' + Engine.fmtMoney(m.wageMonthly) + '/month.');
        state.levelUpsToday = state.levelUpsToday || [];
        state.levelUpsToday.push(msg);
      }
    }
  };

  // ------------------------------------------------------------------
  // §13.4 Certifications — an era-authentic owner-progression track. Fallback
  // table (so the engine works before/without DATA.CERTIFICATIONS lands),
  // same shape the DATA table must use: {id,name,abbr,minYear,costBase,
  // studyHours,desc,prereq?,effects}. effects vocabulary (exact keys the
  // engine consumes): jobTimeMult:{type|"all":mult}, payMult:{type|category:
  // mult}, callbackMult:mult, prestigeBonus:n, reliabilityBonus:n,
  // unlocks:["jobtype",...].
  // ------------------------------------------------------------------
  var FALLBACK_CERTIFICATIONS = [
    { id: 'comptia-aplus', name: 'CompTIA A+', abbr: 'A+', minYear: 1993,
      costBase: 220, studyHours: 20,
      desc: 'The entry-level bench cert — broad hardware/software troubleshooting.',
      effects: { jobTimeMult: { repair: 0.92, upgrade: 0.92 }, reliabilityBonus: 3 } },
    { id: 'novell-cne', name: 'Novell CNE', abbr: 'CNE', minYear: 1990,
      costBase: 260, studyHours: 24,
      desc: 'NetWare administration — the credential office IT ran on in the 90s.',
      effects: { payMult: { contract: 1.08 }, unlocks: ['contract'] } },
    { id: 'microsoft-mcse', name: 'Microsoft MCSE', abbr: 'MCSE', minYear: 1994,
      costBase: 340, studyHours: 36,
      desc: 'Systems Engineer track — Windows NT domains, deep OS expertise.',
      effects: { jobTimeMult: { software: 0.85 }, payMult: { software: 1.05 } } },
    { id: 'microsoft-mcsa', name: 'Microsoft MCSA', abbr: 'MCSA', minYear: 1998,
      costBase: 220, studyHours: 22,
      desc: 'Systems Administrator — the lighter-weight companion to the MCSE.',
      effects: { payMult: { software: 1.08 } } },
    { id: 'cisco-ccna', name: 'Cisco CCNA', abbr: 'CCNA', minYear: 1998,
      costBase: 300, studyHours: 30,
      desc: 'Networking fundamentals — routers, switches, and small-office LANs.',
      effects: { unlocks: ['contract'], payMult: { contract: 1.1 } } },
    { id: 'comptia-network-plus', name: 'CompTIA Network+', abbr: 'Network+',
      minYear: 1999, costBase: 220, studyHours: 20, prereq: 'comptia-aplus',
      desc: 'Vendor-neutral networking — cabling, protocols, small-business LANs.',
      effects: { jobTimeMult: { contract: 0.9 }, unlocks: ['contract'] } },
    { id: 'comptia-security-plus', name: 'CompTIA Security+', abbr: 'Security+',
      minYear: 2002, costBase: 260, studyHours: 24, prereq: 'comptia-network-plus',
      desc: 'Baseline security practice — safer builds, fewer comebacks.',
      effects: { callbackMult: 0.9 } },
    { id: 'data-recovery-cert', name: 'Certified Data Recovery Professional',
      abbr: 'CDRP', minYear: 1996, costBase: 300, studyHours: 26,
      desc: 'Platter-level recovery technique for failing and dead drives.',
      effects: { jobTimeMult: { data_recovery: 0.85 }, payMult: { data_recovery: 1.12 } } },
    { id: 'apple-acmt', name: 'Apple Certified Mac Technician', abbr: 'ACMT',
      minYear: 2005, costBase: 280, studyHours: 22,
      desc: 'Factory-authorized Apple service procedures and diagnostics.',
      effects: { jobTimeMult: { device_repair: 0.88 }, reliabilityBonus: 3 } },
    { id: 'cloud-plus', name: 'CompTIA Cloud+', abbr: 'Cloud+', minYear: 2015,
      costBase: 320, studyHours: 28, prereq: 'comptia-security-plus',
      desc: 'Modern cloud/managed-services fundamentals — the shop goes hybrid.',
      effects: { unlocks: ['enthusiast'], prestigeBonus: 1 } }
  ];
  Engine.certifications = function () {
    var certs = Engine.getData().CERTIFICATIONS;
    return (Array.isArray(certs) && certs.length) ? certs : FALLBACK_CERTIFICATIONS;
  };
  Engine.certById = function (id) {
    var certs = Engine.certifications();
    for (var i = 0; i < certs.length; i++) if (certs[i].id === id) return certs[i];
    return null;
  };
  // Merge every earned cert's effects into one object. Defensive against
  // missing/old-save state (no training field yet, unknown cert ids, etc).
  Engine.certEffects = function (state) {
    var C = Engine.CONFIG;
    var out = { jobTimeMult: {}, payMult: {}, callbackMult: 1, prestigeBonus: 0,
                reliabilityBonus: 0, unlocks: [] };
    var earned = (state && state.training && state.training.certsEarned) || [];
    for (var i = 0; i < earned.length; i++) {
      var cert = Engine.certById(earned[i]);
      if (!cert || !cert.effects) continue;
      var ef = cert.effects;
      var k;
      if (ef.jobTimeMult) {
        for (k in ef.jobTimeMult) if (Object.prototype.hasOwnProperty.call(ef.jobTimeMult, k))
          out.jobTimeMult[k] = (out.jobTimeMult[k] != null ? out.jobTimeMult[k] : 1) * ef.jobTimeMult[k];
      }
      if (ef.payMult) {
        for (k in ef.payMult) if (Object.prototype.hasOwnProperty.call(ef.payMult, k))
          out.payMult[k] = (out.payMult[k] != null ? out.payMult[k] : 1) * ef.payMult[k];
      }
      if (ef.callbackMult != null) out.callbackMult *= ef.callbackMult;
      if (ef.prestigeBonus) out.prestigeBonus += ef.prestigeBonus;
      if (ef.reliabilityBonus) out.reliabilityBonus += ef.reliabilityBonus;
      if (Array.isArray(ef.unlocks)) {
        for (var u = 0; u < ef.unlocks.length; u++)
          if (out.unlocks.indexOf(ef.unlocks[u]) === -1) out.unlocks.push(ef.unlocks[u]);
      }
    }
    out.callbackMult = Engine.clamp(out.callbackMult, C.CERT_CALLBACK_MULT_FLOOR, 1);
    out.prestigeBonus = Engine.clamp(out.prestigeBonus, 0, C.CERT_PRESTIGE_BONUS_CAP);
    out.reliabilityBonus = Engine.clamp(out.reliabilityBonus, 0, C.CERT_RELIABILITY_BONUS_CAP);
    return out;
  };
  Engine.certTimeMult = function (state, jobType) {
    var ce = Engine.certEffects(state);
    var m = 1;
    if (ce.jobTimeMult.all != null) m *= ce.jobTimeMult.all;
    if (jobType && ce.jobTimeMult[jobType] != null) m *= ce.jobTimeMult[jobType];
    return Engine.clamp(m, Engine.CONFIG.CERT_TIME_MULT_FLOOR, 1.2);
  };
  Engine.certPayMult = function (state, jobType, category) {
    var ce = Engine.certEffects(state);
    var m = 1;
    if (jobType && ce.payMult[jobType] != null) m *= ce.payMult[jobType];
    if (category && ce.payMult[category] != null) m *= ce.payMult[category];
    return Engine.clamp(m, 1, Engine.CONFIG.CERT_PAY_MULT_CEIL);
  };
  Engine.certCallbackMult = function (state) { return Engine.certEffects(state).callbackMult; };
  Engine.certPrestigeBonus = function (state) { return Engine.certEffects(state).prestigeBonus; };
  Engine.certReliabilityBonus = function (state) { return Engine.certEffects(state).reliabilityBonus; };
  Engine.certUnlocksJobType = function (state, jobType) {
    return Engine.certEffects(state).unlocks.indexOf(jobType) !== -1;
  };

  // ------------------------------------------------------------------
  // §13.3 Period software in job copy — fillCopyTokens replaces {SW}/{GAME}/
  // {OFFICE}/{CREATIVE} tokens with an era-valid, customer-appropriate title
  // drawn from DATA.PERIOD_SOFTWARE via the seeded RNG (deterministic). No
  // match => the token is dropped cleanly (no literal braces, no double
  // spaces). Gracefully handles DATA.PERIOD_SOFTWARE being absent (old data).
  // ------------------------------------------------------------------
  var COPY_TOKEN_RE = /\{(SW|GAME|OFFICE|CREATIVE)\}/g;
  var COPY_TOKEN_KIND = { SW: null, GAME: 'game', OFFICE: 'office', CREATIVE: 'creative' };
  function periodSoftwareCandidates(year, customerType, kind) {
    var list = Engine.getData().PERIOD_SOFTWARE;
    if (!Array.isArray(list) || !list.length) return [];
    function fits(s, honorCustomer) {
      if (!s || !s.name) return false;
      if (kind && s.kind !== kind) return false;
      if (s.minYear != null && year < s.minYear) return false;
      if (s.maxYear != null && year > s.maxYear) return false;
      if (honorCustomer && Array.isArray(s.customers) && s.customers.length && customerType &&
          s.customers.indexOf(customerType) === -1) return false;
      return true;
    }
    var cands = list.filter(function (s) { return fits(s, true); });
    if (!cands.length) cands = list.filter(function (s) { return fits(s, false); });
    return cands;
  }
  Engine.fillCopyTokens = function (str, ctx) {
    if (typeof str !== 'string' || str.indexOf('{') === -1) return str || '';
    ctx = ctx || {};
    var year = ctx.year != null ? ctx.year :
      (Engine._state ? Engine.currentYear(Engine._state) : 2000);
    var customerType = ctx.customerType || null;
    var out = str.replace(COPY_TOKEN_RE, function (m, key) {
      var cands = periodSoftwareCandidates(year, customerType, COPY_TOKEN_KIND[key]);
      var pick = cands.length ? Engine.pick(cands, ctx.stream) : null;   // §17.5
      return pick ? pick.name : '';
    });
    // Hardening (§13.6): a player must NEVER see a literal brace token — strip
    // any residual {WORD} (e.g. an unknown/typo'd token in data) cleanly too.
    if (out.indexOf('{') !== -1) out = out.replace(/\{[A-Za-z0-9_]*\}/g, '');
    // Collapse stray whitespace / space-before-punctuation left by a dropped
    // token so no double spaces or orphaned punctuation survive.
    out = out.replace(/[ \t]{2,}/g, ' ');
    out = out.replace(/[ \t]+([.,!?;:])/g, '$1');
    return out.trim();
  };

  // Rating = mean of the last 25 outcome scores. §17.2: history entries are
  // now {score, day, jobId?, title, reasons[]} so the player can SEE why the
  // stars moved (v8 migration wraps old plain numbers; the mean tolerates
  // both shapes defensively).
  Engine.entryScore = function (e) { return typeof e === 'number' ? e : (e ? e.score : 0); };
  Engine.pushScore = function (state, score, meta) {
    score = Engine.clamp(Engine.round2(score), 0, 5);
    var h = state.reputation.history;
    h.push({
      score: score,
      day: state.day,
      jobId: meta && meta.jobId != null ? meta.jobId : null,
      title: (meta && meta.title) || null,
      reasons: (meta && Array.isArray(meta.reasons)) ? meta.reasons.slice() : []
    });
    while (h.length > Engine.CONFIG.RATING_HISTORY) h.shift();
    var sum = 0;
    for (var i = 0; i < h.length; i++) sum += Engine.entryScore(h[i]);
    state.reputation.rating = Engine.round2(sum / h.length);
    return score;
  };

  // ------------------------------------------------------------------
  // §15.1 Era transitions — helpers over DATA.TRANSITIONS (tolerates the
  // table being absent while the DATA workstream authors it).
  // ------------------------------------------------------------------
  Engine.transitionsData = function () {
    var t = Engine.getData().TRANSITIONS;
    return Array.isArray(t) ? t : [];
  };
  Engine.transitionById = function (id) {
    var list = Engine.transitionsData();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  // {startDay, endDay, warnDay} in the state's day-index space.
  Engine.transitionWindow = function (t, state) {
    var startDay = Engine.dayIndexOfISO(t.startDate, state);
    return {
      startDay: startDay,
      endDay: startDay + (t.durationDays || 365),
      warnDay: startDay - Engine.CONFIG.TRANSITION_WARN_LEAD_DAYS
    };
  };
  Engine.activeTransitions = function (state) {
    if (!state) return [];
    var out = [], list = Engine.transitionsData();
    for (var i = 0; i < list.length; i++) {
      var w = Engine.transitionWindow(list[i], state);
      if (state.day >= w.startDay && state.day < w.endDay) out.push(list[i]);
    }
    return out;
  };
  // Job types this transition BOOSTS (demandMix mult > 1) — the set that
  // gates staff retraining penalties (§15.1c).
  Engine.transitionBoostTypes = function (t) {
    var mix = (t && t.demandMix) || {}, out = [];
    for (var k in mix) {
      if (Object.prototype.hasOwnProperty.call(mix, k) && mix[k] > 1) out.push(k);
    }
    return out;
  };

  // ------------------------------------------------------------------
  // §15.2 Scenarios — helpers over DATA.SCENARIOS (tolerates absence).
  // ------------------------------------------------------------------
  Engine.scenariosData = function () {
    var s = Engine.getData().SCENARIOS;
    return Array.isArray(s) ? s : [];
  };
  Engine.scenarioById = function (id) {
    var list = Engine.scenariosData();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  // The DATA definition of the state's ACTIVE scenario (null in sandbox play,
  // after completion, or if the table went missing).
  Engine.currentScenario = function (state) {
    if (!state || !state.scenario || !state.scenario.active) return null;
    return Engine.scenarioById(state.scenario.id);
  };
  // §15.6: the difficulty multiplier set for this save (standard fallback).
  Engine.difficultyFor = function (state) {
    var D = Engine.CONFIG.DIFFICULTY;
    return (state && D[state.difficulty]) || D.standard;
  };

  // ------------------------------------------------------------------
  // §15.3 Credit line — era-appropriate APR from the CONFIG table, linearly
  // interpolated between the anchor years (clamped outside the range).
  // ------------------------------------------------------------------
  Engine.creditAprFor = function (year) {
    var table = Engine.CONFIG.CREDIT_APR_TABLE || {};
    var years = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
    if (!years.length) return 0.1;
    if (year <= years[0]) return table[years[0]];
    if (year >= years[years.length - 1]) return table[years[years.length - 1]];
    for (var i = 0; i < years.length - 1; i++) {
      if (year >= years[i] && year <= years[i + 1]) {
        var f = (year - years[i]) / (years[i + 1] - years[i]);
        return table[years[i]] + f * (table[years[i + 1]] - table[years[i]]);
      }
    }
    return table[years[years.length - 1]];
  };

  // ------------------------------------------------------------------
  // §15.5 Achievements — engine-defined table (no DATA dependency). Each
  // entry: {id, name, desc, hidden?, check(state)}. Event-count-driven checks
  // read state.achievementEvents (written via Engine.recordAchievementEvent —
  // both engine internals and Engine.markAchievementEvent feed it).
  // ------------------------------------------------------------------
  Engine.recordAchievementEvent = function (state, tag) {
    if (!state || !tag) return;
    state.achievementEvents = state.achievementEvents || {};
    var e = state.achievementEvents[tag] || { count: 0, lastDay: null };
    e.count += 1;
    e.lastDay = state.day;
    state.achievementEvents[tag] = e;
  };
  function evCount(state, tag) {
    var e = (state.achievementEvents || {})[tag];
    return e ? e.count : 0;
  }
  function evLastDay(state, tag) {
    var e = (state.achievementEvents || {})[tag];
    return e ? e.lastDay : null;
  }
  Engine.ACHIEVEMENTS = [
    { id: 'first-repair', name: 'Screwdriver Ready',
      desc: 'Complete your first job.',
      check: function (s) { return s.reputation.jobsCompleted >= 1; } },
    { id: 'jobs-50', name: 'Regular Fixture',
      desc: 'Complete 50 jobs.',
      check: function (s) { return s.reputation.jobsCompleted >= 50; } },
    { id: 'jobs-250', name: 'Neighborhood Institution',
      desc: 'Complete 250 jobs.',
      check: function (s) { return s.reputation.jobsCompleted >= 250; } },
    { id: 'jobs-1000', name: 'A Life at the Bench',
      desc: 'Complete 1,000 jobs.',
      check: function (s) { return s.reputation.jobsCompleted >= 1000; } },
    { id: 'first-flip', name: 'One Careful Owner',
      desc: 'Sell your first refurbished machine.',
      check: function (s) { return s.ledger.lifetime.refurbsSold >= 1; } },
    { id: 'flips-25', name: 'Used-Market Mogul',
      desc: 'Sell 25 refurbished machines.',
      check: function (s) { return s.ledger.lifetime.refurbsSold >= 25; } },
    { id: 'first-build', name: 'It POSTs!',
      desc: 'Deliver your first custom build.',
      check: function (s) { return s.ledger.lifetime.buildsDelivered >= 1; } },
    { id: 'builds-50', name: 'Boutique Builder',
      desc: 'Deliver 50 custom builds.',
      check: function (s) { return s.ledger.lifetime.buildsDelivered >= 50; } },
    { id: 'first-sli', name: 'Double Vision',
      desc: 'Deliver a build with a matched multi-GPU pair.',
      check: function (s) { return evCount(s, 'sli-build') >= 1; } },
    { id: 'first-device', name: 'Beyond the Beige Box',
      desc: 'Complete a device repair (Apple, phone, or tablet).',
      check: function (s) { return evCount(s, 'device-repair') >= 1; } },
    { id: 'first-strip', name: 'Organ Donor',
      desc: 'Strip a machine for parts.',
      check: function (s) { return evCount(s, 'strip') >= 1; } },
    { id: 'first-cert', name: 'Framed on the Wall',
      desc: 'Earn a certification.',
      check: function (s) { return ((s.training || {}).certsEarned || []).length >= 1; } },
    { id: 'certs-5', name: 'Alphabet Soup',
      desc: 'Earn five certifications.',
      check: function (s) { return ((s.training || {}).certsEarned || []).length >= 5; } },
    { id: 'l5-employee', name: 'Master and Apprentice',
      desc: 'Grow an employee to level 5.',
      check: function (s) {
        return (s.staff || []).some(function (m) { return (m.level || 1) >= 5; });
      } },
    { id: 'full-crew', name: 'Full House',
      desc: 'Employ six staff at once.',
      check: function (s) { return (s.staff || []).length >= 6; } },
    { id: 'revenue-100k', name: 'Six Figures',
      desc: 'Bank $100,000 of lifetime revenue.',
      check: function (s) { return s.ledger.lifetime.revenue >= 100000; } },
    { id: 'revenue-1m', name: 'The Million-Dollar Bench',
      desc: 'Bank $1,000,000 of lifetime revenue.',
      check: function (s) { return s.ledger.lifetime.revenue >= 1000000; } },
    { id: 'cash-50k', name: 'Rainy-Day Fund',
      desc: 'Hold $50,000 cash at once.',
      check: function (s) { return s.cash >= 50000; } },
    { id: 'rating-5-50', name: 'Five Stars, No Notes',
      desc: 'Hold a 5.0 rating with at least 50 jobs completed.',
      check: function (s) {
        return s.reputation.jobsCompleted >= 50 && s.reputation.rating >= 4.95;
      } },
    { id: 'prestige-2', name: 'Well-Reviewed',
      desc: 'Reach prestige tier 2.',
      check: function (s) { return s.reputation.prestige >= 2; } },
    { id: 'prestige-4', name: 'Legendary',
      desc: 'Reach the top prestige tier.',
      check: function (s) { return s.reputation.prestige >= 4; } },
    { id: 'superstore', name: 'Superstore',
      desc: 'Upgrade to the top shop tier.',
      check: function (s) { return s.shop.tier >= 3; } },
    { id: 'no-callbacks-30', name: 'Built to Last',
      desc: '30 straight days without a warranty callback (20+ jobs done).',
      check: function (s) {
        if (s.day < 30 || s.reputation.jobsCompleted < 20) return false;
        var last = evLastDay(s, 'callback-arrived');
        return last == null || s.day - last >= 30;
      } },
    { id: 'gpu-hoarder', name: 'I Was Here First',
      desc: 'Hold 10+ graphics cards in stock during a GPU price spike.',
      check: function (s) {
        var spike = (s.market.activeEvents || []).some(function (ev) {
          return (ev.effects || []).some(function (ef) {
            return (ef.priceMult || 1) > 1.3 &&
                   (!ef.categories || ef.categories.indexOf('gpu') !== -1);
          });
        });
        if (!spike) return false;
        var gpus = 0;
        for (var i = 0; i < (s.inventory || []).length; i++) {
          var p = Engine.partById(s.inventory[i].partId);
          if (p && p.category === 'gpu') gpus += s.inventory[i].qty;
        }
        return gpus >= 10;
      } },
    { id: 'transition-retrained', name: 'Ahead of the Curve',
      desc: 'Ride out a platform transition with every tech retrained.',
      check: function (s) { return evCount(s, 'transition-retrained') >= 1; } },
    { id: 'scenario-complete', name: 'Challenge Accepted',
      desc: 'Complete any scenario.',
      check: function (s) { return evCount(s, 'scenario-complete') >= 1; } },
    { id: 'scenario-s', name: 'Flawless Run',
      desc: 'Earn an S grade on a scenario.',
      check: function (s) { return evCount(s, 'scenario-grade-S') >= 1; } },
    { id: 'wiki-reader', name: 'Student of History',
      desc: 'Read 10 Wiki articles.',
      check: function (s) { return evCount(s, 'article-read') >= 10; } },
    { id: 'regular-10', name: 'The Usual, Please',
      desc: 'Serve the same regular customer 10 times.',
      check: function (s) {
        return (s.regulars || []).some(function (r) { return (r.jobs || 0) >= 10; });
      } },
    { id: 'account-signed', name: 'On Retainer',
      desc: 'Sign your first business account.',
      check: function (s) { return evCount(s, 'account-signed') >= 1; } },
    // Hidden ones — fun to stumble into; getAchievements masks them as "???".
    { id: 'crt-bite', name: 'The Tube Bites Back', hidden: true,
      desc: 'Get bitten by a CRT you should not have opened.',
      hint: 'Some old monitors hold a grudge — and a charge.',
      check: function (s) { return evCount(s, 'crt-injury') >= 1; } },
    { id: 'night-owl', name: 'Closing Time? Never Heard of It', hidden: true,
      desc: 'Work yourself all the way to the overtime floor.',
      hint: 'How late can one bench night go?',
      check: function (s) { return evCount(s, 'overtime-floor') >= 1; } },
    { id: 'comeback', name: 'Back from the Brink', hidden: true,
      desc: 'Recover from a negative bank balance.',
      hint: 'Something about clawing your way out of the red…',
      check: function (s) { return evCount(s, 'grace-recovered') >= 1; } },
    { id: 'credit-clean', name: 'Paid in Full', hidden: true,
      desc: 'Draw on the credit line and pay every cent back.',
      hint: 'Bankers remember the ones who settle up.',
      check: function (s) { return evCount(s, 'credit-repaid-full') >= 1; } }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
