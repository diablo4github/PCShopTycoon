(function (root) {
  'use strict';
  var DATA = root.DATA = root.DATA || {};

  // §2.4 — six start presets
  DATA.ERAS = [
    {
      id: "era1983", startYear: 1983, startDate: "1983-03-01",
      name: "1983 — The Repair Era",
      blurb: "The home-computer boom has put beige boxes on desks everywhere, and every one of them breaks. Nobody builds their own PC yet — clone parts are scarce and customers just want their machine back by Friday. Fix boards, recover floppies, and keep the lights on. Custom building won't be a business until the clone-parts market matures in 1989.",
      cash: 3000, shopTier: 0,
      customBuildsUnlocked: false,
      difficulty: "Standard — repairs only until Sep 1989"
    },
    {
      id: "era1991", startYear: 1991, startDate: "1991-04-01",
      name: "1991 — Clone Wars",
      blurb: "The 386 era is in full swing and the clone market has cracked wide open. Whitebox builders are undercutting IBM on every corner, VGA is the new must-have, and a garage shop with good hands can assemble machines cheaper than the big brands. Margins are real if you can keep parts moving.",
      cash: 6000, shopTier: 0,
      customBuildsUnlocked: true,
      difficulty: "Standard"
    },
    {
      id: "era1996", startYear: 1996, startDate: "1996-03-04",
      name: "1996 — The Pentium Gold Rush",
      blurb: "Windows 95 lit a fire under the whole industry: everyone needs more RAM, a bigger hard disk, and a modem for this Internet thing. Pentium boxes fly off the bench and 3D accelerators are about to change gaming forever. Demand is roaring — ride it while it lasts.",
      cash: 9000, shopTier: 0,
      customBuildsUnlocked: true,
      difficulty: "Easier — booming demand"
    },
    {
      id: "era2004", startYear: 2004, startDate: "2004-03-01",
      name: "2004 — Broadband & Big Boxes",
      blurb: "Broadband is spreading, LAN parties are packed, and the spyware epidemic keeps the software bench busy around the clock. Athlon 64 versus Pentium 4 has enthusiasts arguing in every forum. Big-box retailers squeeze margins on new machines, but service, upgrades, and custom gaming rigs still pay well.",
      cash: 14000, shopTier: 0,
      customBuildsUnlocked: true,
      difficulty: "Standard"
    },
    {
      id: "era2013", startYear: 2013, startDate: "2013-03-04",
      name: "2013 — The Post-PC Squeeze",
      blurb: "Tablets and phones are eating the low end and pundits keep declaring the PC dead. But gamers, creators, and small businesses still need real machines, and the DIY scene has never been healthier. SSD upgrades are the easiest sell in shop history — survive the squeeze by being the specialist the big stores can't be.",
      cash: 20000, shopTier: 0,
      customBuildsUnlocked: true,
      difficulty: "Harder — shrinking mainstream market"
    },
    {
      id: "era2021", startYear: 2021, startDate: "2021-01-04",
      name: "2021 — The Great GPU Drought",
      blurb: "A pandemic sent everyone home to work and game on PCs — and then crypto miners and scalpers bought every graphics card on Earth. Demand is historic, but stock is a nightmare and customers are furious about prices. If you can source parts, you can name your price. If you can't, good luck.",
      cash: 30000, shopTier: 0,
      customBuildsUnlocked: true,
      difficulty: "Hard — GPU shortage, wild prices"
    }
  ];

  DATA.CUSTOM_BUILD_UNLOCK_DATE = "1989-09-01";

  // §15.2 — curated, scored scenario starts (exactly these 4; dates are spec-pinned).
  // Engine scoring contract: score = round(cash * scoring.cashWeight
  //   + rating * scoring.ratingWeight) + sum of earned bonus points.
  // Bonus semantics: for LOWER-IS-BETTER stats ("contractsFailed", "graceDays",
  // "jobsFailed") the bonus is earned when the final value is <= threshold; for all
  // other stats it is earned when the final value is >= threshold. Scenarios start
  // fresh games, so ledger.lifetime counters double as scenario counters;
  // "contractsFailed" (failed contract-type jobs) and "graceDays" (days spent in the
  // negative-cash grace window) are new engine-tracked counters; "prestige" and
  // "rating" read from state.reputation.
  DATA.SCENARIOS = [
    {
      id: "y2k-rush", name: "Y2K Rush",
      startDate: "1998-06-01", endDate: "2000-03-01",
      cash: 10000, shopTier: 1,
      blurb: "It's June 1998 and every business in town just realized their PCs might not survive New Year's Eve. Compliance contracts and software work are raining down on any shop that can hit a deadline. Staff up, take the retainers, and don't you dare deliver late — the score rewards banked cash and a spotless contract record.",
      difficultyNote: "Standard — deadline pressure; one failed contract kills the bonus",
      modifiers: { jobWeightMult: { contract: 1.8, software: 1.6 }, offerMult: 1.25 },
      scoring: {
        cashWeight: 0.012, ratingWeight: 40,
        bonus: [
          { stat: "contractsFailed", threshold: 0, points: 200, label: "Every contract delivered — zero Y2K casualties" },
          { stat: "jobsCompleted", threshold: 100, points: 100, label: "A hundred machines through the bench" }
        ]
      }
    },
    {
      id: "dotcom-survivor", name: "Dot-com Survivor",
      startDate: "2000-03-01", endDate: "2001-12-31",
      cash: 9000, shopTier: 1,
      blurb: "March 2000: the Nasdaq just peaked, and the crash is about to land on your lease. Demand is drying up, the rent was signed in boom times, and liquidators are flooding the market with barely-used gear. Run lean, keep the rating up, and outlast the winter — coming out solvent is the victory.",
      difficultyNote: "Hard — slumping demand under boom-era rent",
      modifiers: { jobWeightMult: { build: 0.7, contract: 0.7 }, rentMult: 1.4, offerMult: 0.8 },
      scoring: {
        cashWeight: 0.02, ratingWeight: 50,
        bonus: [
          { stat: "graceDays", threshold: 0, points: 120, label: "Never fell into the red" },
          { stat: "prestige", threshold: 1, points: 100, label: "Grew the shop's name in a downturn" }
        ]
      }
    },
    {
      id: "flood-trader", name: "Flood Trader",
      startDate: "2011-08-01", endDate: "2012-12-31",
      cash: 10000, shopTier: 0,
      blurb: "August 2011. Monsoon season is building over Thailand, where a quarter of the world's hard drives are made — and nobody is watching the weather but you. Modest cash, a garage, and about sixty days of calm. Whatever you stock before October will be worth double after it.",
      difficultyNote: "Standard — a market-timing puzzle; stockpile early",
      modifiers: { jobWeightMult: { data_recovery: 1.3, upgrade: 1.2 } },
      scoring: {
        cashWeight: 0.015, ratingWeight: 30,
        bonus: [
          { stat: "refurbsSold", threshold: 12, points: 150, label: "Flipped a dozen machines through the drought" },
          { stat: "graceDays", threshold: 0, points: 70, label: "Speculated without going broke" }
        ]
      }
    },
    {
      id: "shortage-shop", name: "Shortage Shop",
      startDate: "2020-03-01", endDate: "2021-12-31",
      cash: 16000, shopTier: 1,
      blurb: "March 2020: the world just went home, and it took every webcam, GPU, and desktop with it. Demand is historic, stock is a rumor, and customers will remember who treated them fairly. Source what you can, build what you're able, and let your reputation grow through the drought — the score weighs your name as heavily as your bank balance.",
      difficultyNote: "Hard — historic demand, scarce parts",
      modifiers: { jobWeightMult: { build: 1.3, software: 1.2 }, offerMult: 1.15 },
      scoring: {
        cashWeight: 0.01, ratingWeight: 60,
        bonus: [
          { stat: "buildsDelivered", threshold: 8, points: 150, label: "Delivered eight custom rigs in the great shortage" },
          { stat: "jobsFailed", threshold: 3, points: 100, label: "Kept your promises when parts were scarce" }
        ]
      }
    }
  ];

  // §18.1 — era-banded wholesale distributors. grayMarket channels: minPrestige 0,
  // deep discount, short lead — but the engine applies a −10 reliability penalty
  // (floor 40) on consumed parts; the blurb states the no-warranty tradeoff honestly.
  // Exactly ONE gray channel is available in any year 1983-2025 (bands tile, no overlap),
  // and every year also has at least one legitimate channel.
  DATA.DISTRIBUTORS = [
    {
      id: "compupost", name: "Compu-Post Catalog Supply",
      minYear: 1983, maxYear: 1996, minPrestige: 0,
      blurb: "A toll-free number, a fat newsprint catalog, and a warehouse in New Hampshire. Everything ships parcel post — allow a few days, and read the RMA policy twice.",
      baseDiscount: 0.05, leadDays: 4, specialty: null, grayMarket: false
    },
    {
      id: "heartland", name: "Heartland Components Wholesale",
      minYear: 1991, maxYear: 2004, minPrestige: 1,
      blurb: "A regional two-step distributor with a sales rep who knows your name and a dock full of whitebox staples. Net terms appear once they trust you.",
      baseDiscount: 0.06, leadDays: 3, specialty: ["motherboard", "cpu", "ram"], grayMarket: false
    },
    {
      id: "nexlink", name: "NexLink Online Supply",
      minYear: 1998, maxYear: 2012, minPrestige: 1,
      blurb: "The web storefront that put the paper catalogs out to pasture — live stock counts, overnight options, and prices that change while your coffee cools.",
      baseDiscount: 0.07, leadDays: 2, specialty: ["storage", "gpu"], grayMarket: false
    },
    {
      id: "summit", name: "Summit Broadline Distribution",
      minYear: 2001, minPrestige: 2,
      blurb: "A national broadliner with genuine allocation muscle — the outfit the big chains buy through. High minimums, professional terms, and first call when stock runs tight.",
      baseDiscount: 0.08, leadDays: 3, specialty: null, grayMarket: false
    },
    {
      id: "fulfillhub", name: "FulfillHub Dropship Platform",
      minYear: 2013, minPrestige: 1,
      blurb: "Plug the shop into the platform and skip the shelf: they hold the stock, you keep the margin. The fees nibble, but the catalog is bottomless.",
      baseDiscount: 0.05, leadDays: 2, specialty: ["peripheral", "expansion"], grayMarket: false
    },
    {
      id: "swapmeet", name: "Fairgrounds Swap Meet",
      minYear: 1983, maxYear: 1999, minPrestige: 0,
      blurb: "Folding tables of pulls, surplus, and 'new' parts in unmarked boxes at prices no distributor can touch. No receipts, no warranty — what you carry home is what you own.",
      baseDiscount: 0.18, leadDays: 1, specialty: null, grayMarket: true
    },
    {
      id: "bidwire", name: "BidWire Online Auctions",
      minYear: 2000, maxYear: 2012, minPrestige: 0,
      blurb: "Gray-import and liquidation lots, one bid away and cheaper than any invoice you could show a rep. Seller ratings are the only warranty on offer.",
      baseDiscount: 0.2, leadDays: 2, specialty: null, grayMarket: true
    },
    {
      id: "pacrim-direct", name: "PacRim Direct Dropship",
      minYear: 2013, minPrestige: 0,
      blurb: "Factory-adjacent stock shipped straight from overseas at prices that make reps wince. No warranty, no returns, occasional mystery firmware — the savings are the whole story.",
      baseDiscount: 0.2, leadDays: 2, specialty: null, grayMarket: true
    }
  ];

  // §21.5/§21.3 — DATA.BUSINESS_KINDS: era-windowed business-account archetypes.
  // Housed here (not flavor.js) because it's a structural, era-banded reference
  // table shaped exactly like DISTRIBUTORS above (id/minYear/maxYear/blurb) rather
  // than a narrative name/blurb pool — same organizing logic as DISTRIBUTORS,
  // EQUIPMENT, and CERTIFICATIONS living in this file. §21.3 accounts read
  // {kind, seats, ...} from here; the account's own name still comes from
  // FLAVOR.businessNames (a kind is a category — "law office" — a name is the
  // specific instance — "Whitfield & Moss, Attorneys at Law").
  DATA.BUSINESS_KINDS = [
    {
      id: "typing-pool", label: "Typing Pool", minYear: 1983, maxYear: 1994,
      seats: [6, 16],
      blurb: "Rows of word-processing terminals turn out correspondence and legal boilerplate all day; ribbons wear out, daisy wheels crack, and someone's always jammed the platen."
    },
    {
      id: "print-shop", label: "Print Shop", minYear: 1983, maxYear: 2025,
      seats: [4, 10],
      blurb: "Prepress and quick-print jobs run nonstop from a handful of desktop-publishing machines; toner dust and round-the-clock duty cycles cook power supplies and printers alike."
    },
    {
      id: "law-office", label: "Law Office", minYear: 1983, maxYear: 2025,
      seats: [3, 8],
      blurb: "Billing software and case files live on a few workhorse desktops the partners refuse to replace; drives fill up, backups get forgotten, and everything is somehow due Friday."
    },
    {
      id: "mail-order-warehouse", label: "Mail-Order Warehouse", minYear: 1983, maxYear: 2025,
      seats: [6, 18],
      blurb: "Order desks and a warehouse floor run on inventory and shipping terminals that never get to power down; dust, forklift vibration, and nonstop uptime take their toll."
    },
    {
      id: "tax-office", label: "Tax Preparation Office", minYear: 1984, maxYear: 2025,
      seats: [4, 10],
      blurb: "Every January the machines wake from a year of neglect to crunch returns nonstop until April; overworked drives and abused printers pick the worst possible week to fail."
    },
    {
      id: "video-store", label: "Video Rental Store", minYear: 1985, maxYear: 2005,
      seats: [3, 8],
      blurb: "Rental terminals track every tape and late fee across a scuffed front counter; a jammed demo unit in the window is a bigger crisis to them than the register."
    },
    {
      id: "medical-clinic", label: "Medical Clinic", minYear: 1985, maxYear: 2025,
      seats: [5, 14],
      blurb: "Patient scheduling and billing can't afford downtime; front-desk PCs take a beating from constant use, waiting-room fingers, and reception-area coffee."
    },
    {
      id: "design-studio", label: "Design Studio", minYear: 1988, maxYear: 2025,
      seats: [3, 8],
      blurb: "A handful of overpowered workstations chew through layouts and renders at all hours; heat, dust, and a designer's refusal to reboot mid-project are the usual killers."
    },
    {
      id: "architecture-firm", label: "Architecture Firm", minYear: 1990, maxYear: 2025,
      seats: [4, 10],
      blurb: "CAD workstations and a plotter run drafting jobs against tight deadlines; oversized files and bigger renders push storage and cooling past their limits."
    },
    {
      id: "isp", label: "Local Internet Service Provider", minYear: 1993, maxYear: 2008,
      seats: [6, 16],
      blurb: "A rack of modems and a handful of support-desk PCs keep dial-up subscribers connected; overheating modem banks and cranky terminal software are a daily fire drill."
    },
    {
      id: "dotcom-startup", label: "Dot-Com Startup", minYear: 1996, maxYear: 2001,
      seats: [8, 18],
      blurb: "A loft full of mismatched desktops runs the website, the demo, and the investor pitch deck on borrowed time and borrowed money; nobody budgeted for maintenance."
    },
    {
      id: "lan-cafe", label: "LAN Cafe", minYear: 1998, maxYear: 2012,
      seats: [10, 24],
      blurb: "Rows of identical gaming rigs run flat-out for paying customers by the hour; clogged fans, abused controllers, and one dead machine means a line out the door."
    },
    {
      id: "crypto-outfit", label: "Crypto Mining Outfit", minYear: 2013, maxYear: 2025,
      seats: [4, 12],
      blurb: "Racks of GPUs grind away around the clock chasing coins in a garage or spare unit; relentless heat and dust wear through fans and cards faster than anywhere else on the route."
    },
    {
      id: "esports-den", label: "E-Sports Den", minYear: 2015, maxYear: 2025,
      seats: [10, 24],
      blurb: "High-refresh gaming rigs and a streaming rack run tournament practice and broadcasts back to back; spilled energy drinks and marathon sessions are hard on every peripheral."
    }
  ];

  // §2.5 — shop tiers
  DATA.SHOP_TIERS = [
    {
      id: 0, name: "Garage",
      rentBase: 350, utilitiesBase: 70,
      workstationSlots: 2, offerBonus: 0, storageSlots: 20,
      upgradeCost: null, minPrestige: 0,
      desc: "A workbench, a shelf, and the family car parked outside. Cheap, cramped, and where every legend starts."
    },
    {
      id: 1, name: "Strip-mall Unit",
      rentBase: 900, utilitiesBase: 140,
      workstationSlots: 4, offerBonus: 1, storageSlots: 50,
      upgradeCost: 4000, minPrestige: 1,
      desc: "A real storefront between the laundromat and the sandwich place. Walk-in traffic and room for a second bench."
    },
    {
      id: 2, name: "Main Street Storefront",
      rentBase: 2200, utilitiesBase: 320,
      workstationSlots: 6, offerBonus: 2, storageSlots: 120,
      upgradeCost: 15000, minPrestige: 2,
      desc: "Big windows, real signage, and a service counter. The shop people recommend by name."
    },
    {
      id: 3, name: "Superstore",
      rentBase: 6000, utilitiesBase: 900,
      workstationSlots: 10, offerBonus: 4, storageSlots: 300,
      upgradeCost: 60000, minPrestige: 3,
      desc: "A warehouse-scale operation with a full service department. Contracts, fleets, and pallets of inventory."
    }
  ];

  // §2.6 — equipment (engine consumes these exact effect keys)
  DATA.EQUIPMENT = [
    { id: "repair-bench", name: "Repair Bench", costBase: 0, introYear: 1979,
      desc: "A sturdy bench, hand tools, and a soldering iron. You own it already.",
      effects: {} },
    { id: "diag-station", name: "Diagnostic Station", costBase: 800, introYear: 1983,
      desc: "POST cards, loopback plugs, and reference manuals. Halves diagnosis time.",
      effects: { diagHoursMult: 0.5 } },
    { id: "oscilloscope", name: "Bench Oscilloscope", costBase: 650, introYear: 1983,
      desc: "See the signals instead of guessing. Cuts diagnosis time by a quarter.",
      effects: { diagHoursMult: 0.75 } },
    { id: "build-bench", name: "Assembly Bench", costBase: 1200, introYear: 1983,
      desc: "A dedicated clean bench with parts bins and torque drivers. Unlocks custom-build jobs and build contracts.",
      effects: { enablesBuilds: true }, unlocksLabel: "Custom Builds" },
    { id: "software-station", name: "Software Station", costBase: 900, introYear: 1985,
      desc: "A dedicated machine with every boot disk, driver, and scanner you need. Unlocks virus-removal jobs (from 1988) and speeds all software work, including OS installs, by 25%.",
      effects: { softwareHoursMult: 0.75 }, unlocksLabel: "Virus Removal" },
    { id: "dr-rig-1", name: "Data Recovery Rig I", costBase: 1500, introYear: 1983,
      desc: "Drive imagers, alignment tools, and a lot of patience. Unlocks data recovery jobs (tier 1).",
      effects: { drTier: 1 }, unlocksLabel: "Data Recovery" },
    { id: "dr-rig-2", name: "Data Recovery Rig II", costBase: 2500, introYear: 1995, requires: "dr-rig-1",
      desc: "Cleanroom hood, platter-swap jigs, and firmware tools for modern high-density drives. Upgrades your data recovery work to tier 2.",
      effects: { drTier: 2 }, unlocksLabel: "Data Recovery II" },
    { id: "dr-rig-3", name: "Data Recovery Rig III", costBase: 4000, introYear: 2010, requires: "dr-rig-2",
      desc: "Chip-off readers and flash reconstruction gear for SSDs and controllers that died young. Upgrades your data recovery work to tier 3.",
      effects: { drTier: 3 }, unlocksLabel: "Data Recovery III" },
    { id: "crt-kit", name: "CRT Discharge Kit", costBase: 400, introYear: 1983,
      desc: "High-voltage probe, discharge wand, and insulated gloves. Prevents CRT-discharge mishaps when servicing monitors and all-in-ones.",
      effects: { crtSafe: true } },
    { id: "esd-setup", name: "ESD-Safe Setup", costBase: 400, introYear: 1983,
      desc: "Grounded mats, wrist straps, and antistatic bags. Cuts part-damage mishaps by 80%.",
      effects: { mishapMult: 0.2 } },
    { id: "test-bench", name: "Burn-in Test Bench", costBase: 1000, introYear: 1983,
      desc: "Soak-test every job before it leaves. Callback rate down 40%.",
      effects: { callbackMult: 0.6 } },
    { id: "burn-in-rack", name: "Overnight Burn-in Rack", costBase: 900, introYear: 1990,
      desc: "A rack that stress-tests finished machines overnight. Fewer embarrassing returns.",
      effects: { callbackMult: 0.8 } },
    { id: "imaging-kit", name: "Disk Imaging Kit", costBase: 700, introYear: 2005,
      desc: "Clone, wipe, and deploy drives in batches. Software jobs 10% faster.",
      effects: { softwareHoursMult: 0.9 } }
  ];

  // §10.7 — employee roles. wageMonthly ≈ laborRate × 110 × skill × wageFactor (engine).
  DATA.STAFF_ROLES = [
    {
      id: "tech", name: "Technician",
      desc: "Bench all-rounder: teardowns, swaps, and tune-ups. Speeds up hands-on hardware work.",
      jobTypes: ["repair", "upgrade", "refurb", "peripheral", "cleaning", "callback"],
      wageFactor: 1.0
    },
    {
      id: "software", name: "Software Specialist",
      desc: "Lives in boot disks, registries, and recovery tools. Speeds up software and data-recovery work.",
      jobTypes: ["software", "data_recovery"],
      wageFactor: 1.05
    },
    {
      id: "builder", name: "Builder",
      desc: "Assembly-line hands and a tuner's patience. Speeds up builds, contracts, and enthusiast work.",
      jobTypes: ["build", "contract", "enthusiast"],
      wageFactor: 1.1
    },
    {
      id: "apprentice", name: "Apprentice",
      desc: "Eager, cheap, and everywhere at once. Helps a little with every kind of job.",
      jobTypes: ["repair", "upgrade", "refurb", "peripheral", "cleaning", "callback",
                 "software", "data_recovery", "build", "contract", "enthusiast"],
      wageFactor: 0.5
    }
  ];

  // Apprentice covers device_repair too (v0.4b); Technician gains it below via jobTypes edit in place.
  DATA.STAFF_ROLES[0].jobTypes.push("device_repair");
  DATA.STAFF_ROLES[3].jobTypes.push("device_repair");

  // §12.4 / research §3.2 — Apple machines (repair/upgrade-only devices; never in the PC build catalog).
  DATA.APPLE_MACHINES = [
    { id: "mac-128k", name: "Macintosh 128K", family: "APPLE-68K", introYear: 1984, eolYear: 1988, ramUpgradable: false, hddUpgradable: false, cpuUpgradable: false, basePriceRange: [70, 110], faultCategories: ["logic-board", "screen", "floppy"], desc: "The original Mac: 128K of RAM soldered to the board and no expansion at all. Repair means analog-board and floppy work behind a CRT that bites." },
    { id: "mac-plus", name: "Macintosh Plus", family: "APPLE-68K", introYear: 1986, eolYear: 1996, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [70, 110], faultCategories: ["ram", "logic-board", "screen", "floppy"], desc: "The first serviceable Mac: SIMM slots for RAM and a SCSI port for external drives. A shop staple for a full decade of upgrades." },
    { id: "mac-se", name: "Macintosh SE", family: "APPLE-68K", introYear: 1987, eolYear: 1995, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [80, 120], faultCategories: ["logic-board", "screen", "storage", "floppy"], desc: "The SE added an internal drive bay and a PDS slot — third-party accelerator cards became a genuine shop service." },
    { id: "mac-ii", name: "Macintosh II", family: "APPLE-68K", introYear: 1987, eolYear: 1994, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [100, 160], faultCategories: ["logic-board", "storage", "psu", "ram"], desc: "Apple's first truly expandable machine: six NuBus slots, color video, and a conventional case a technician could love." },
    { id: "mac-classic", name: "Macintosh Classic", family: "APPLE-68K", introYear: 1990, eolYear: 1996, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [60, 90], faultCategories: ["logic-board", "screen", "storage"], desc: "The $999 compact Mac that filled classrooms — and later, repair benches, as its analog boards aged badly." },
    { id: "quadra-700", name: "Macintosh Quadra 700", family: "APPLE-68K", introYear: 1991, eolYear: 1997, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [110, 170], faultCategories: ["logic-board", "storage", "ram", "psu"], desc: "The 68040 workstation Mac in a minitower — easy RAM and drive service, plus the leaking-capacitor curse of its era." },
    { id: "powermac-6100", name: "Power Macintosh 6100/60", family: "APPLE-PPC", introYear: 1994, eolYear: 1999, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [80, 120], faultCategories: ["logic-board", "storage", "ram"], desc: "The first PowerPC Mac in a pizza-box case — RAM and drive swaps are simple; everything else is cramped." },
    { id: "powermac-7500", name: "Power Macintosh 7500", family: "APPLE-PPC", introYear: 1995, eolYear: 2001, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [100, 150], faultCategories: ["logic-board", "storage", "ram", "psu"], desc: "The 7500's flip-open case and CPU daughtercard made it the hot-rodder's Mac — third-party G3 upgrades kept them alive for years." },
    { id: "powermac-g3", name: "Power Macintosh G3 (Beige)", family: "APPLE-PPC", introYear: 1997, eolYear: 2003, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [90, 140], faultCategories: ["logic-board", "storage", "ram", "psu"], desc: "The most tech-friendly Mac era begins: tool-less panels, PCI slots, easy bays. A pleasure ticket when one rolls in." },
    { id: "imac-g3", name: "iMac G3", family: "APPLE-PPC", introYear: 1998, eolYear: 2004, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [80, 130], faultCategories: ["screen", "storage", "ram", "logic-board"], desc: "Bondi blue and USB-only. RAM hides behind a bottom panel; deeper work means splitting a CRT all-in-one — charge accordingly." },
    { id: "powermac-g4", name: "Power Mac G4", family: "APPLE-PPC", introYear: 1999, eolYear: 2006, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [100, 160], faultCategories: ["logic-board", "storage", "ram", "psu"], desc: "The side-door G4 tower opens with one latch to a flat, fully exposed board — the gold standard of Mac serviceability." },
    { id: "powermac-g5", name: "Power Mac G5", family: "APPLE-PPC", introYear: 2003, eolYear: 2009, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [120, 190], faultCategories: ["logic-board", "storage", "ram", "psu", "cooling"], desc: "The aluminum G5 tower is gorgeous and heavy, with liquid-cooled models that leak with age — the last PowerPC hurrah." },
    { id: "imac-2006", name: "iMac (Core Duo)", family: "APPLE-INTEL", introYear: 2006, eolYear: 2012, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [90, 140], faultCategories: ["screen", "storage", "ram", "psu"], desc: "Intel iMacs keep a RAM door but bury the drive behind the display glass — suction cups and patience required." },
    { id: "macbook-white", name: "MacBook (White)", family: "APPLE-INTEL", introYear: 2006, eolYear: 2012, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [80, 130], faultCategories: ["battery", "screen", "storage", "keyboard"], desc: "Three screws behind the battery expose RAM and drive — the friendliest Apple laptop a shop ever serviced. Top cases crack on schedule." },
    { id: "mbp-unibody", name: "MacBook Pro (Unibody)", family: "APPLE-INTEL", introYear: 2008, eolYear: 2014, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [100, 160], faultCategories: ["battery", "screen", "storage", "logic-board"], desc: "The unibody bottom plate comes off to a tidy layout — RAM, drive, and battery swaps in minutes. Technicians still miss it." },
    { id: "macpro-cheese", name: "Mac Pro (Cheese Grater)", family: "APPLE-INTEL", introYear: 2009, eolYear: 2016, ramUpgradable: true, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [130, 200], faultCategories: ["logic-board", "storage", "ram", "psu", "gpu"], desc: "The most repairable Mac ever built: sliding drive sleds, eight DIMM slots, real PCIe. Treat it like the workstation it is." },
    { id: "mbp-retina", name: "MacBook Pro Retina", family: "APPLE-INTEL", introYear: 2012, eolYear: 2018, ramUpgradable: false, hddUpgradable: true, cpuUpgradable: false, basePriceRange: [110, 180], faultCategories: ["battery", "screen", "storage", "logic-board"], desc: "2012 is the hinge year: RAM soldered, battery glued, pentalobe screws. Storage stays swappable — everything else is surgery." },
    { id: "macpro-trashcan", name: "Mac Pro (Trash Can)", family: "APPLE-INTEL", introYear: 2013, eolYear: 2019, ramUpgradable: true, hddUpgradable: false, cpuUpgradable: false, basePriceRange: [140, 210], faultCategories: ["logic-board", "gpu", "cooling", "ram"], desc: "A sealed thermal core with RAM as the only user-serviceable part — and GPU boards that cook themselves. Beautiful, cursed." },
    { id: "macmini-2018", name: "Mac Mini (2018)", family: "APPLE-INTEL", introYear: 2018, eolYear: 2023, ramUpgradable: true, hddUpgradable: false, cpuUpgradable: false, basePriceRange: [90, 140], faultCategories: ["logic-board", "storage", "ram"], desc: "The 2018 Mini quietly restored socketed RAM behind an antenna plate — a brief, welcome throwback before the SoC era." },
    { id: "mba-m1", name: "MacBook Air M1", family: "APPLE-SILICON", introYear: 2020, eolYear: 2027, ramUpgradable: false, hddUpgradable: false, cpuUpgradable: false, basePriceRange: [100, 160], faultCategories: ["battery", "screen", "logic-board"], desc: "Unified memory fused to the SoC: zero upgrade path, full stop. Shop work is batteries, screens, and board-level heroics." },
    { id: "mbp-m1pro", name: "MacBook Pro 14\"/16\" (M1 Pro/Max)", family: "APPLE-SILICON", introYear: 2021, eolYear: 2027, ramUpgradable: false, hddUpgradable: false, cpuUpgradable: false, basePriceRange: [150, 230], faultCategories: ["battery", "screen", "logic-board", "speaker-mic"], desc: "Serialized, parts-paired components complicate independent repair — displays and batteries swap, but the machine argues about it." },
    { id: "mac-studio", name: "Mac Studio", family: "APPLE-SILICON", introYear: 2022, eolYear: 2027, ramUpgradable: false, hddUpgradable: false, cpuUpgradable: false, basePriceRange: [150, 230], faultCategories: ["logic-board", "psu", "cooling"], desc: "A dense aluminum puck with fixed memory and semi-locked storage — port and fan service is realistic, upgrades are not." },
    { id: "macpro-silicon", name: "Mac Pro (Apple Silicon)", family: "APPLE-SILICON", introYear: 2023, eolYear: 2027, ramUpgradable: false, hddUpgradable: false, cpuUpgradable: false, basePriceRange: [180, 280], faultCategories: ["logic-board", "psu", "gpu"], desc: "PCIe slots return, but the RAM is fused to the package — the first Mac Pro in history with no memory upgrade at all." }
  ];

  // §12.4 / research §4 — mobile devices (repair-only; never in the PC parts/compat pipeline).
  DATA.MOBILE_DEVICES = [
    { id: "iphone-2007", kind: "smartphone", name: "iPhone (Original)", brand: "Apple", introYear: 2007, eolYear: 2010, tier: "premium" },
    { id: "bb-bold", kind: "smartphone", name: "BlackBerry Bold", brand: "BlackBerry", introYear: 2008, eolYear: 2012, tier: "mainstream" },
    { id: "iphone-4", kind: "smartphone", name: "iPhone 4", brand: "Apple", introYear: 2010, eolYear: 2014, tier: "premium" },
    { id: "galaxy-s3", kind: "smartphone", name: "Samsung Galaxy S III", brand: "Samsung", introYear: 2012, eolYear: 2016, tier: "mainstream" },
    { id: "iphone-5", kind: "smartphone", name: "iPhone 5", brand: "Apple", introYear: 2012, eolYear: 2016, tier: "premium" },
    { id: "moto-g", kind: "smartphone", name: "Moto G", brand: "Motorola", introYear: 2013, eolYear: 2017, tier: "budget" },
    { id: "iphone-6", kind: "smartphone", name: "iPhone 6", brand: "Apple", introYear: 2014, eolYear: 2018, tier: "premium" },
    { id: "galaxy-s7", kind: "smartphone", name: "Samsung Galaxy S7", brand: "Samsung", introYear: 2016, eolYear: 2020, tier: "mainstream" },
    { id: "budget-android", kind: "smartphone", name: "Budget Android Handset", brand: "Shenzhen OEM", introYear: 2016, eolYear: 2024, tier: "budget" },
    { id: "iphone-x", kind: "smartphone", name: "iPhone X", brand: "Apple", introYear: 2017, eolYear: 2021, tier: "premium" },
    { id: "iphone-11", kind: "smartphone", name: "iPhone 11", brand: "Apple", introYear: 2019, eolYear: 2024, tier: "mainstream" },
    { id: "galaxy-zflip", kind: "smartphone", name: "Samsung Galaxy Z Flip", brand: "Samsung", introYear: 2021, eolYear: 2026, tier: "premium" },
    { id: "galaxy-s21", kind: "smartphone", name: "Samsung Galaxy S21", brand: "Samsung", introYear: 2021, eolYear: 2025, tier: "mainstream" },
    { id: "iphone-14", kind: "smartphone", name: "iPhone 14", brand: "Apple", introYear: 2022, eolYear: 2027, tier: "premium" },
    { id: "pixel-7", kind: "smartphone", name: "Google Pixel 7", brand: "Google", introYear: 2022, eolYear: 2026, tier: "mainstream" },
    { id: "ipad-1", kind: "tablet", name: "iPad (1st gen)", brand: "Apple", introYear: 2010, eolYear: 2013, tier: "mainstream" },
    { id: "ipad-2", kind: "tablet", name: "iPad 2", brand: "Apple", introYear: 2011, eolYear: 2015, tier: "mainstream" },
    { id: "nexus-7", kind: "tablet", name: "Nexus 7", brand: "Google", introYear: 2012, eolYear: 2016, tier: "budget" },
    { id: "ipad-air", kind: "tablet", name: "iPad Air", brand: "Apple", introYear: 2013, eolYear: 2018, tier: "mainstream" },
    { id: "galaxy-tab-s", kind: "tablet", name: "Samsung Galaxy Tab S", brand: "Samsung", introYear: 2014, eolYear: 2018, tier: "mainstream" },
    { id: "ipad-pro", kind: "tablet", name: "iPad Pro", brand: "Apple", introYear: 2015, eolYear: 2021, tier: "premium" },
    { id: "fire-hd", kind: "tablet", name: "Amazon Fire HD", brand: "Amazon", introYear: 2018, eolYear: 2024, tier: "budget" },
    { id: "ipad-9", kind: "tablet", name: "iPad (9th gen)", brand: "Apple", introYear: 2021, eolYear: 2027, tier: "mainstream" }
  ];

  // §12.4 — mobile fault templates (subject-first per §10.5: symptoms in complaints, diagnosis in faultDescs).
  DATA.MOBILE_FAULTS = {
    "screen": [
      { desc: "Cracked or dead display assembly", laborHours: 1, partsCostFactor: 0.35,
        complaints: ["I dropped it face-down and now it's a spiderweb.", "The screen lights up but half of it doesn't respond to touch."],
        faultDescs: ["Shattered glass and damaged digitizer layer", "Fractured display panel — full assembly swap required"] }
    ],
    "battery": [
      { desc: "Worn-out or swollen battery", laborHours: 0.75, partsCostFactor: 0.12,
        complaints: ["It dies at 40% like clockwork.", "The back is bulging. It didn't used to bulge, right?"],
        faultDescs: ["Battery past its cycle life, capacity collapsed", "Swollen cell pressing the case apart — replace immediately"] }
    ],
    "charge-port": [
      { desc: "Worn or lint-packed charging port", laborHours: 1, partsCostFactor: 0.08,
        complaints: ["It only charges if I hold the cable at an exact angle.", "I have to jiggle the plug for ten seconds every night."],
        faultDescs: ["Port packed with pocket lint and corroded contacts", "Cracked charge-port flex — connector replacement needed"] }
    ],
    "water-damage": [
      { desc: "Liquid ingress and corrosion", laborHours: 2, partsCostFactor: 0.2,
        complaints: ["It went in the wash. It was only a minute. Please.", "It fell in the lake, dried in rice, and now it does... this."],
        faultDescs: ["Corrosion across board connectors — ultrasonic clean required", "Liquid indicators tripped; shorted power rail on the board"] }
    ],
    "camera": [
      { desc: "Failed or blurry camera module", laborHours: 0.75, partsCostFactor: 0.15,
        complaints: ["Every photo looks like it was taken in fog.", "The camera app opens to a black square."],
        faultDescs: ["Cracked lens cover scattering light", "Failed camera module flex — module swap required"] }
    ],
    "speaker-mic": [
      { desc: "Dead speaker or microphone", laborHours: 0.75, partsCostFactor: 0.1,
        complaints: ["Nobody can hear me unless I'm on speakerphone.", "Everything sounds like it's underwater."],
        faultDescs: ["Blown speaker driver", "Mic membrane clogged or failed — assembly replacement"] }
    ],
    "button": [
      { desc: "Stuck or unresponsive button", laborHours: 0.5, partsCostFactor: 0.06,
        complaints: ["The power button needs a thumb-war to click.", "The volume rocker just... stopped rocking."],
        faultDescs: ["Worn button dome and gunked mechanism", "Torn button flex cable — replacement needed"] }
    ]
  };


  // §13.4 — DATA.CERTIFICATIONS: era-gated owner-progression track. Engine year-scales
  // costBase (1983-scale) and folds effects into its multiplier paths alongside
  // equipment & staff. effects use ONLY this vocabulary (engine consumes these keys):
  //   jobTimeMult: { <jobType>|"all": <0-1 mult> }   // < 1 speeds work
  //   payMult:     { <jobType>|<category>: <mult> }    // > 1 raises pay
  //   callbackMult: <0-1 mult>                         // < 1 fewer callbacks
  //   prestigeBonus: <int>                             // reputation nudge
  //   reliabilityBonus: <int>                          // steadier workmanship
  //   unlocks: [ <jobType> ... ]                       // grants a job type
  DATA.CERTIFICATIONS = [
    {
      id: "novell-cne", name: "Novell Certified NetWare Engineer", abbr: "CNE",
      minYear: 1990, costBase: 600, studyHours: 40,
      desc: "Novell's NetWare ran the file and print servers of nearly every LAN-equipped office in the early 1990s. The CNE credential certified you could install, tune, and rescue those servers — the ticket to lucrative business contract work.",
      effects: { payMult: { contract: 1.12 }, prestigeBonus: 1 }
    },
    {
      id: "comptia-aplus", name: "CompTIA A+", abbr: "A+",
      minYear: 1993, costBase: 250, studyHours: 24,
      desc: "The industry's foundational hardware and repair certification, launched by CompTIA in 1993. It proved a technician knew PCs inside out — the baseline credential most shops and employers came to expect, and the natural first rung on the ladder.",
      effects: { jobTimeMult: { repair: 0.9, upgrade: 0.9 }, reliabilityBonus: 2 }
    },
    {
      id: "microsoft-mcse", name: "Microsoft Certified Systems Engineer", abbr: "MCSE",
      minYear: 1994, costBase: 900, studyHours: 48,
      desc: "As Windows NT pushed into server rooms, the MCSE became the marquee Microsoft credential for designing and running Windows-based networks. It was demanding, expensive, and highly sought after through the dot-com years.",
      effects: { jobTimeMult: { software: 0.88 }, payMult: { contract: 1.1 }, prestigeBonus: 1 }
    },
    {
      id: "cisco-ccna", name: "Cisco Certified Network Associate", abbr: "CCNA",
      minYear: 1998, costBase: 750, studyHours: 44,
      desc: "Cisco's routers and switches were the plumbing of the exploding internet, and the CCNA certified you could configure and troubleshoot them. It opened the door to networking contracts far beyond a typical repair bench's reach.",
      effects: { payMult: { contract: 1.15 }, prestigeBonus: 1 }
    },
    {
      id: "comptia-networkplus", name: "CompTIA Network+", abbr: "Network+",
      minYear: 1999, costBase: 350, studyHours: 30, prereq: "comptia-aplus",
      desc: "Introduced in 1999 as the vendor-neutral companion to A+, Network+ covered cabling, protocols, and troubleshooting the small networks every office and home was suddenly building. The recommended next step after A+.",
      effects: { payMult: { contract: 1.1 }, callbackMult: 0.95 }
    },
    {
      id: "microsoft-mcsa", name: "Microsoft Certified Systems Administrator", abbr: "MCSA",
      minYear: 2001, costBase: 700, studyHours: 40,
      desc: "Launched alongside Windows 2000/XP-era server products, the MCSA certified day-to-day administration of Windows systems — a more attainable, hands-on credential than the full engineer track for shops doing steady software and setup work.",
      effects: { jobTimeMult: { software: 0.9 }, payMult: { software: 1.1 } }
    },
    {
      id: "comptia-securityplus", name: "CompTIA Security+", abbr: "Security+",
      minYear: 2002, costBase: 450, studyHours: 32, prereq: "comptia-networkplus",
      desc: "As always-on broadband turned every PC into a target, Security+ (2002) certified the fundamentals of malware removal, hardening, and safe configuration. Exactly the knowledge the spyware and ransomware epidemics made a shop's bread and butter.",
      effects: { jobTimeMult: { software: 0.85 }, prestigeBonus: 1 }
    },
    {
      id: "apple-acmt", name: "Apple Certified Macintosh Technician", abbr: "ACMT",
      minYear: 2005, costBase: 550, studyHours: 32,
      desc: "Apple's own technician credential certified you to service Macs and, later, its mobile devices to Apple's exacting standards. As the Mac and iPhone user base swelled, ACMT turned Apple repair from a gamble into a specialty.",
      effects: { jobTimeMult: { device_repair: 0.85 }, payMult: { device_repair: 1.12 }, reliabilityBonus: 2 }
    },
    {
      id: "iacrb-cdrp", name: "Certified Data Recovery Professional", abbr: "CDRP",
      minYear: 2008, costBase: 1200, studyHours: 40,
      desc: "A specialist credential in the delicate art of pulling data off failed drives — head swaps, platter transfers, firmware repair, and flash reconstruction. Rare, respected, and the key to charging real money for the jobs nobody else will touch.",
      effects: { jobTimeMult: { data_recovery: 0.85 }, payMult: { data_recovery: 1.2 }, unlocks: ["data_recovery"] }
    },
    {
      id: "aws-saa", name: "AWS Certified Solutions Architect", abbr: "AWS SAA",
      minYear: 2013, costBase: 900, studyHours: 36,
      desc: "As computing moved to the cloud, AWS certifications became the modern equivalent of the old server credentials, proving you could architect and migrate workloads onto Amazon's infrastructure. A forward-looking cert for a shop chasing bigger business contracts.",
      effects: { payMult: { contract: 1.18 }, prestigeBonus: 1 }
    }
  ];

})(typeof window !== 'undefined' ? window : globalThis);
