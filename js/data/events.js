(function (root) {
  'use strict';
  var DATA = root.DATA = root.DATA || {};

  // §2.7 — dated historical events (priceMult = scalar peak; engine ramps in/out)
  DATA.HISTORICAL_EVENTS = [
    {
      id: "dram-1988",
      startDate: "1988-01-15", durationDays: 420,
      headline: "DRAM shortage bites: memory prices triple",
      body: "US-Japan trade sanctions and production cutbacks have collided with booming PC demand. Distributors are rationing DRAM chips, and spot prices for 256K parts have nearly tripled since summer.",
      effects: [{ categories: ["ram"], priceMult: 2.8 }],
      jobVolumeMult: 1.05,
      demandNote: "memory upgrades gold rush"
    },
    {
      id: "sumitomo-1993",
      startDate: "1993-07-04", durationDays: 300,
      headline: "Explosion at Sumitomo resin plant rocks memory market",
      body: "A blast at Sumitomo Chemical's Niihama plant has knocked out the source of over half the world's epoxy resin used in chip packaging. Memory brokers are already quoting double for SIMMs.",
      effects: [{ categories: ["ram"], priceMult: 2.2 }],
      demandNote: "RAM spike"
    },
    {
      id: "win95-launch",
      startDate: "1995-08-24", durationDays: 150,
      headline: "Windows 95 launches at midnight — lines around the block",
      body: "Rolling Stones on the ads, customers camped outside stores, and every machine in town suddenly needs 8 megs and a bigger hard disk. The upgrade wave is on.",
      effects: [
        { categories: ["os"], priceMult: 1.1 },
        { categories: ["ram"], priceMult: 1.25 }
      ],
      jobVolumeMult: 1.5,
      demandNote: "upgrade wave"
    },
    {
      id: "dotcom-boom",
      startDate: "1998-10-01", durationDays: 540,
      headline: "Dot-com fever: everyone is getting online, and getting a PC",
      body: "The stock market can't stop climbing and neither can PC sales. Startups are buying machines by the dozen and every household wants a second computer for the Internet.",
      effects: [{ categories: ["cpu", "ram", "storage"], priceMult: 1.1 }],
      jobVolumeMult: 1.4,
      demandNote: "boom-time demand"
    },
    {
      id: "y2k-rush",
      startDate: "1999-04-01", durationDays: 270,
      headline: "Y2K countdown: businesses scramble to replace aging PCs",
      body: "Compliance consultants have every office in a panic about the millennium bug. Old 486s are being retired by the truckload and replacement orders are stacking up.",
      effects: [{ categories: ["motherboard", "cpu"], priceMult: 1.12 }],
      jobVolumeMult: 1.45,
      demandNote: "compliance replacements"
    },
    {
      id: "dotcom-bust",
      startDate: "2000-04-14", durationDays: 540,
      headline: "Nasdaq crashes: the dot-com party is over",
      body: "Startups are folding weekly and liquidators are flooding the market with barely-used equipment. Corporate IT budgets are frozen and walk-in traffic is thinning out.",
      effects: [{ categories: ["cpu", "ram", "motherboard", "gpu"], priceMult: 0.85 }],
      jobVolumeMult: 0.7,
      demandNote: "slump"
    },
    {
      id: "gfc-2008",
      startDate: "2008-10-01", durationDays: 400,
      headline: "Financial crisis hits Main Street: customers repair, not replace",
      body: "Credit has seized up and nobody is buying new machines. The silver lining for repair shops: everyone wants their old box to last one more year.",
      effects: [{ categories: ["cpu", "gpu", "motherboard"], priceMult: 0.9 }],
      jobVolumeMult: 0.9,
      demandNote: "repair over replace"
    },
    {
      id: "thailand-flood-2011",
      startDate: "2011-10-15", durationDays: 400,
      headline: "Thailand floods swamp hard drive factories — prices double overnight",
      body: "Monsoon floods have submerged industrial estates around Bangkok where a quarter of the world's hard drives are built. Western Digital's plants are underwater and distributors have stopped quoting prices.",
      effects: [{ categories: ["storage"], priceMult: 2.4 }],
      demandNote: "HDD spike"
    },
    {
      id: "crypto-2017",
      startDate: "2017-06-01", durationDays: 330,
      headline: "Ethereum mining craze empties graphics card shelves",
      body: "Miners are buying GPUs six at a time and gamers can't find a mid-range card at any sane price. Retailers are limiting purchases to one per customer — where stock exists at all.",
      effects: [{ categories: ["gpu"], priceMult: 1.9 }],
      jobVolumeMult: 1.1,
      demandNote: "GPU shortage"
    },
    {
      id: "covid-wfh-2020",
      startDate: "2020-03-15", durationDays: 365,
      headline: "Lockdown: the world works (and learns) from home",
      body: "Offices and schools have shut their doors overnight. Webcams, monitors, and anything with a keyboard are selling out as households scramble to outfit home offices.",
      effects: [{ categories: ["peripheral"], priceMult: 1.5 }],
      jobVolumeMult: 1.4,
      demandNote: "home-office surge"
    },
    {
      id: "gpu-drought-2020",
      startDate: "2020-09-17", durationDays: 560,
      headline: "The Great GPU Drought: crypto, scalpers, and a silicon shortage",
      body: "New GeForce and Radeon launches evaporated in seconds, bots are scalping everything, and a global chip shortage means no relief for months. Street prices are running double MSRP and climbing.",
      effects: [
        { categories: ["gpu"], priceMult: 2.6 },
        { categories: ["cpu"], priceMult: 1.25 }
      ],
      jobVolumeMult: 1.15,
      demandNote: "GPU famine"
    }
  ];

  // §2.8 — repeatable random event templates (priceMult/durationDays = [min,max] ranges)
  DATA.RANDOM_EVENT_TEMPLATES = [
    {
      id: "tariff", weight: 2, minYear: 1983, maxYear: 2100,
      headlines: [
        "New import tariffs announced on computer components",
        "Trade dispute slaps duties on imported electronics",
        "Customs crackdown raises landed cost of imported boards"
      ],
      body: "Importers say the new duties will be passed straight through to distributors and, ultimately, to your invoice.",
      durationDays: [30, 90],
      effects: [{ categories: ["gpu", "motherboard"], priceMult: [1.2, 1.5] }],
      jobVolumeMult: 1.0
    },
    {
      id: "distributor-bankruptcy", weight: 2, minYear: 1983, maxYear: 2100,
      headlines: [
        "Regional parts distributor files for bankruptcy",
        "Major component wholesaler shuts its doors overnight",
        "Distributor collapse leaves dealers scrambling for stock"
      ],
      body: "With one of the region's biggest wholesalers gone, remaining suppliers are quoting higher prices and longer lead times on affected lines.",
      durationDays: [30, 75],
      effects: [{ categories: ["ram", "storage"], priceMult: [1.3, 1.7] }],
      jobVolumeMult: 1.0
    },
    {
      id: "competitor-closes", weight: 2, minYear: 1983, maxYear: 2100,
      headlines: [
        "Rival computer shop across town closes its doors",
        "Competitor calls it quits — their customers need a new shop",
        "Local rival liquidates; service customers left stranded"
      ],
      body: "Another shop's loss is your gain: orphaned customers are looking for somewhere new to take their machines.",
      durationDays: [45, 120],
      effects: [],
      jobVolumeMult: 1.4
    },
    {
      id: "competitor-opens", weight: 2, minYear: 1983, maxYear: 2100,
      headlines: [
        "New computer store opens nearby with splashy grand-opening deals",
        "Chain electronics outlet adds a service counter down the street",
        "Flashy new rival undercuts service rates across town"
      ],
      body: "The new shop's grand-opening pricing is drawing away walk-in traffic, at least until the novelty wears off.",
      durationDays: [45, 120],
      effects: [],
      jobVolumeMult: 0.8
    },
    {
      id: "press-coverage", weight: 1, minYear: 1983, maxYear: 2100,
      headlines: [
        "Local paper runs glowing feature on your shop",
        "Your shop named a local favorite in reader poll",
        "TV consumer segment praises your honest repair work"
      ],
      body: "Word of mouth is priceless, but press coverage is a close second. The phone is ringing more than usual.",
      durationDays: [14, 30],
      effects: [],
      jobVolumeMult: 1.35
    },
    {
      id: "warehouse-fire-sale", weight: 2, minYear: 1983, maxYear: 2100,
      headlines: [
        "Distributor clears warehouse in massive fire sale",
        "Liquidation auction floods market with cut-price components",
        "Overstocked importer dumps inventory at fire-sale prices"
      ],
      body: "A warehouse clear-out has flooded the channel with cheap stock. Smart shops are filling their shelves while it lasts.",
      durationDays: [20, 45],
      effects: [{ categories: ["case", "psu", "cooling"], priceMult: [0.6, 0.8] }],
      jobVolumeMult: 1.0
    },
    {
      id: "flu-season", weight: 2, minYear: 1983, maxYear: 2100,
      headlines: [
        "Nasty flu season keeps customers home",
        "Bug going around town — foot traffic down everywhere",
        "Half the neighborhood is out sick this week"
      ],
      body: "Between sick days and quarantined households, fewer machines are making it to the counter this month.",
      durationDays: [14, 45],
      effects: [],
      jobVolumeMult: 0.75
    },
    {
      id: "port-congestion", weight: 1, minYear: 1995, maxYear: 2100,
      headlines: [
        "Port congestion delays container shipments of electronics",
        "Freight backlog leaves component orders stuck offshore",
        "Shipping snarl squeezes component supply chains"
      ],
      body: "Containers full of components are sitting at anchor. Until the backlog clears, distributors are charging a premium for what's on hand.",
      durationDays: [30, 80],
      effects: [{ categories: ["motherboard", "storage", "psu"], priceMult: [1.15, 1.4] }],
      jobVolumeMult: 1.0
    },
    {
      id: "swap-meet", weight: 1, minYear: 1985, maxYear: 2100,
      headlines: [
        "Big computer swap meet comes to the fairgrounds",
        "Weekend computer show draws hobbyists from three counties",
        "Regional computer fair sparks a wave of upgrade fever"
      ],
      body: "The swap meet always leaves a trail of half-finished projects and impulse purchases that need professional help.",
      durationDays: [10, 21],
      effects: [],
      jobVolumeMult: 1.25
    }
  ];

})(typeof window !== 'undefined' ? window : globalThis);
