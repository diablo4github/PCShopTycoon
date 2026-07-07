/* THROWAWAY mock data for engine testing (ENGINE workstream owns this file).
 * Schema-exact per SPEC §2 + §9.1 (brand/desc), deliberately tiny: parts
 * clustered around 1983 and 1996, two era presets, two historical events,
 * minimal flavor. jobBlurbs intentionally mix the v1 string format and the v2
 * {text, customers} format to exercise the engine's defensive handling.
 * tools/sim-test.js uses this only when the real js/data/*.js files are absent
 * or incomplete.
 */
(function (root) {
  'use strict';
  var DATA = root.DATA = root.DATA || {};

  DATA.PARTS = [
    // ----- early-80s cluster -----
    { id: 'cpu-8088-477', name: 'Intel 8088 4.77MHz', category: 'cpu', brand: 'Intel',
      platformTags: ['SKT-8088'], perf: { cpu: 2 }, reliability: 90, basePrice: 120,
      introYear: 1979, eolYear: 1987, legacy: true, tier: 'mainstream', powerDraw: 5,
      desc: 'The heart of the IBM PC and every clone that followed it into offices everywhere.' },
    { id: 'cpu-v20', name: 'NEC V20', category: 'cpu', brand: 'NEC',
      platformTags: ['SKT-8088'], perf: { cpu: 3 }, reliability: 92, basePrice: 60,
      introYear: 1984, eolYear: 1990, legacy: true, tier: 'budget', powerDraw: 5,
      desc: 'A drop-in 8088 replacement that quietly ran a third faster for less money.' },
    { id: 'mobo-xt-clone', name: 'XT Clone Board', category: 'motherboard', brand: 'ValuTech',
      platformTags: ['SKT-8088', 'MEM-DIP', 'BUS-ISA8', 'STOR-FDD', 'STOR-MFM',
                     'FF-XT', 'ARCH-8BIT', 'ARCH-16'],
      perf: {}, reliability: 84, basePrice: 380, introYear: 1981, eolYear: 1988,
      legacy: true, tier: 'mainstream', powerDraw: 15,
      desc: 'Taiwanese XT-compatible board that undercut IBM and built the clone industry.' },
    { id: 'ram-64kb-dip', name: '64KB DIP RAM Set', category: 'ram', brand: 'ValuTech',
      platformTags: ['MEM-DIP'], perf: { ramMB: 0.0625 }, reliability: 88,
      basePrice: 130, introYear: 1980, eolYear: 1988, legacy: true, tier: 'mainstream',
      powerDraw: 4,
      desc: 'Nine chips to a bank, parity included — seating them all straight took practice.' },
    { id: 'ram-256kb-dip', name: '256KB DIP RAM Set', category: 'ram', brand: 'Micron',
      platformTags: ['MEM-DIP'], perf: { ramMB: 0.25 }, reliability: 87,
      basePrice: 240, introYear: 1983, eolYear: 1989, legacy: true, tier: 'premium',
      powerDraw: 6,
      desc: 'A luxurious quarter megabyte, enough to run anything 1983 could throw at it.' },
    { id: 'storage-fdd-360k', name: '360KB 5.25" Floppy Drive', category: 'storage',
      brand: 'Tandon',
      platformTags: ['STOR-FDD'], perf: { storageGB: 0.00036, speed: 1 },
      reliability: 80, basePrice: 200, introYear: 1980, eolYear: 1990, legacy: false,
      tier: 'mainstream', powerDraw: 6,
      desc: 'The workhorse double-sided floppy drive found in nearly every PC and XT clone.' },
    { id: 'storage-mfm-10mb', name: 'Seagate ST-412 10MB MFM', category: 'storage',
      brand: 'Seagate',
      platformTags: ['STOR-MFM'], perf: { storageGB: 0.01, speed: 3 },
      reliability: 70, basePrice: 800, introYear: 1982, eolYear: 1988, legacy: false,
      tier: 'premium', powerDraw: 15,
      desc: 'Ten whole megabytes of hard disk — the drive that made the XT feel serious.' },
    { id: 'gpu-cga', name: 'CGA Display Adapter', category: 'gpu', brand: 'IBM',
      platformTags: ['BUS-ISA8'], perf: { gpu: 1 }, reliability: 90, basePrice: 180,
      introYear: 1981, eolYear: 1988, legacy: true, tier: 'mainstream', powerDraw: 6,
      desc: 'Four colors at once if you squinted — color graphics for the masses, 1981 style.' },
    { id: 'psu-xt-130w', name: 'XT 130W PSU', category: 'psu', brand: 'Shenzhen OEM',
      platformTags: ['FF-XT'], perf: {}, reliability: 78, basePrice: 120, watts: 130,
      introYear: 1981, eolYear: 1989, legacy: false, tier: 'mainstream', powerDraw: 0,
      desc: 'A big flip switch and a loud fan; 130 watts was plenty for an XT-class box.' },
    { id: 'case-xt-desktop', name: 'XT Desktop Case', category: 'case', brand: 'ValuTech',
      platformTags: ['FF-XT'], perf: {}, reliability: 99, basePrice: 90,
      introYear: 1981, eolYear: 1990, legacy: false, tier: 'budget', powerDraw: 0,
      style: 2,
      desc: 'Beige steel heavy enough to double as a monitor stand, which it usually did.' },
    { id: 'os-dos21', name: 'MS-DOS 2.1', category: 'os', brand: 'Microsoft',
      platformTags: ['ARCH-8BIT', 'ARCH-16'], perf: {}, reliability: 95, basePrice: 60,
      introYear: 1983, eolYear: 1988, legacy: false, tier: 'mainstream', powerDraw: 0,
      desc: 'Subdirectories and hard disk support arrived, and the A> prompt ruled the world.' },
    { id: 'cooling-fan-80mm', name: '80mm Case Fan', category: 'cooling', brand: 'Sunon',
      platformTags: [], perf: { cool: 3 }, reliability: 85, basePrice: 15,
      introYear: 1979, eolYear: 2025, legacy: false, tier: 'budget', powerDraw: 2,
      style: 1,
      desc: 'The eternal 80-millimeter fan: cheap, everywhere, and always slightly too loud.' },
    { id: 'peripheral-dot-matrix', name: 'Epson MX-80 Dot Matrix', category: 'peripheral',
      brand: 'Epson',
      platformTags: [], perf: {}, reliability: 82, basePrice: 300,
      introYear: 1980, eolYear: 1992, legacy: false, tier: 'mainstream', powerDraw: 0,
      desc: 'The printer that put tractor-feed paper on every desk and its whine in every ear.' },
    { id: 'peripheral-crt-mono', name: '12" Mono CRT', category: 'peripheral',
      brand: 'Zenith',
      platformTags: [], perf: {}, reliability: 75, basePrice: 200,
      introYear: 1979, eolYear: 1992, legacy: false, tier: 'budget', powerDraw: 0,
      desc: 'Green phosphor glow, a brightness knob, and enough stored charge to demand respect.' },

    // ----- mid-90s cluster -----
    { id: 'cpu-p133', name: 'Pentium 133', category: 'cpu', brand: 'Intel',
      platformTags: ['SKT-7'], perf: { cpu: 90 }, reliability: 90, basePrice: 300,
      introYear: 1995, eolYear: 1999, legacy: true, tier: 'mainstream', powerDraw: 12,
      desc: 'The mid-range Pentium sweet spot of 1996 — fast enough for Windows 95 and Quake.' },
    { id: 'cpu-p200', name: 'Pentium 200', category: 'cpu', brand: 'Intel',
      platformTags: ['SKT-7'], perf: { cpu: 130 }, reliability: 90, basePrice: 550,
      introYear: 1996, introMonth: 6, eolYear: 1999, legacy: true, tier: 'premium',
      powerDraw: 15,
      desc: 'Top of the Socket 7 food chain in 1996; the chip enthusiasts saved up for.' },
    { id: 'mobo-p5-atx', name: 'Socket 7 ATX Board', category: 'motherboard', brand: 'ASUS',
      platformTags: ['SKT-7', 'MEM-SDR', 'BUS-PCI', 'BUS-ISA16', 'STOR-IDE',
                     'STOR-FDD', 'FF-ATX', 'ARCH-586', 'ARCH-386'],
      perf: {}, reliability: 86, basePrice: 180, introYear: 1995, eolYear: 2000,
      legacy: true, tier: 'mainstream', powerDraw: 20,
      desc: 'A solid Taiwanese ATX board from the era when ATX itself was the exciting part.' },
    { id: 'ram-16mb-sdr', name: '16MB SDRAM DIMM', category: 'ram', brand: 'Kingston',
      platformTags: ['MEM-SDR'], perf: { ramMB: 16 }, reliability: 90, basePrice: 120,
      introYear: 1995, eolYear: 2001, legacy: true, tier: 'mainstream', powerDraw: 4,
      desc: 'The upgrade that made Windows 95 stop swapping; 16 MB felt limitless for a year.' },
    { id: 'ram-32mb-sdr', name: '32MB SDRAM DIMM', category: 'ram', brand: 'Micron',
      platformTags: ['MEM-SDR'], perf: { ramMB: 32 }, reliability: 90, basePrice: 230,
      introYear: 1996, eolYear: 2002, legacy: true, tier: 'premium', powerDraw: 5,
      desc: 'Serious memory for serious workstations, back when 32 MB cost real money.' },
    { id: 'storage-ide-2gb', name: '2GB IDE HDD', category: 'storage', brand: 'Western Digital',
      platformTags: ['STOR-IDE'], perf: { storageGB: 2, speed: 18 }, reliability: 78,
      basePrice: 250, introYear: 1995, eolYear: 2000, legacy: false,
      tier: 'mainstream', powerDraw: 10,
      desc: 'Two gigabytes across the FAT16 line — most owners never filled half of it.' },
    { id: 'storage-ide-4gb', name: '4GB IDE HDD', category: 'storage', brand: 'Seagate',
      platformTags: ['STOR-IDE'], perf: { storageGB: 4, speed: 18 }, reliability: 77,
      basePrice: 420, introYear: 1996, introMonth: 3, eolYear: 2001, legacy: false,
      tier: 'premium', powerDraw: 11,
      desc: 'Four gigabytes in 1996 meant you archived everything and deleted nothing.' },
    { id: 'gpu-s3-trio', name: 'S3 Trio64 PCI', category: 'gpu', brand: 'S3',
      platformTags: ['BUS-PCI'], perf: { gpu: 25 }, reliability: 90, basePrice: 130,
      introYear: 1995, eolYear: 1999, legacy: true, tier: 'mainstream', powerDraw: 8,
      desc: 'The default 2D card of the mid-90s OEM world; boring, cheap, and everywhere.' },
    { id: 'gpu-voodoo1', name: '3dfx Voodoo Graphics', category: 'gpu', brand: 'Diamond',
      platformTags: ['BUS-PCI'], perf: { gpu: 80 }, reliability: 85, basePrice: 300,
      introYear: 1996, introMonth: 10, eolYear: 1999, legacy: true, tier: 'premium',
      powerDraw: 15,
      desc: 'The pass-through cable card that invented PC 3D gaming as a mass-market hobby.' },
    { id: 'psu-atx-250w', name: 'ATX 250W PSU', category: 'psu', brand: 'Shenzhen OEM',
      platformTags: ['FF-ATX'], perf: {}, reliability: 82, basePrice: 70, watts: 250,
      introYear: 1995, eolYear: 2005, legacy: false, tier: 'mainstream', powerDraw: 0,
      desc: 'Soft power-off felt like the future; 250 honest watts covered a whole Pentium build.' },
    { id: 'case-atx-mid', name: 'ATX Mid Tower', category: 'case', brand: 'InWin',
      platformTags: ['FF-ATX', 'FF-MATX'], perf: {}, reliability: 99, basePrice: 80,
      introYear: 1995, eolYear: 2010, legacy: false, tier: 'mainstream', powerDraw: 0,
      style: 5,
      desc: 'The beige mid tower of a thousand office corners, with sharp edges to prove it.' },
    { id: 'os-win95', name: 'Windows 95', category: 'os', brand: 'Microsoft',
      platformTags: ['ARCH-586', 'ARCH-386'], perf: {}, reliability: 80, basePrice: 180,
      introYear: 1995, introMonth: 8, eolYear: 2001, legacy: false, tier: 'mainstream',
      powerDraw: 0,
      desc: 'Start Me Up, midnight launch lines, and a Start button that changed the desktop.' },
    { id: 'cooling-hsf-s7', name: 'Socket 7 Heatsink/Fan', category: 'cooling',
      brand: 'Cooler Master',
      platformTags: [], perf: { cool: 4 }, reliability: 88, basePrice: 20,
      introYear: 1994, eolYear: 2002, legacy: false, tier: 'mainstream', powerDraw: 2,
      style: 2,
      desc: 'A clip, a fan, and a prayer — stock cooling for the entire Socket 7 generation.' },
    { id: 'cooling-tower-95', name: 'Big Tower Cooler', category: 'cooling',
      brand: 'Alpha',
      platformTags: [], perf: { cool: 7 }, reliability: 90, basePrice: 45,
      introYear: 1996, eolYear: 2005, legacy: false, tier: 'premium', powerDraw: 3,
      style: 7,
      desc: 'Overkill aluminum for overclockers who read newsgroups and pushed bus speeds.' },
    { id: 'peripheral-crt-15', name: '15" SVGA CRT', category: 'peripheral', brand: 'NEC',
      platformTags: [], perf: {}, reliability: 80, basePrice: 350,
      introYear: 1994, eolYear: 2004, legacy: false, tier: 'mainstream', powerDraw: 0,
      desc: 'A fifteen-inch window onto the early web, flickering gently at 60 hertz.' }
  ];

  DATA.YEAR_BASELINES = {
    1983: { cpu: 2,   gpu: 1,   ramMB: 0.25, storageGB: 0.01, laborRate: 28, buildBudget: 2200 },
    1986: { cpu: 6,   gpu: 2,   ramMB: 0.6,  storageGB: 0.03, laborRate: 31, buildBudget: 2300 },
    1990: { cpu: 16,  gpu: 5,   ramMB: 2,    storageGB: 0.08, laborRate: 36, buildBudget: 2400 },
    1993: { cpu: 40,  gpu: 10,  ramMB: 6,    storageGB: 0.4,  laborRate: 40, buildBudget: 2300 },
    1996: { cpu: 110, gpu: 30,  ramMB: 16,   storageGB: 1.6,  laborRate: 45, buildBudget: 2200 },
    2000: { cpu: 350, gpu: 200, ramMB: 96,   storageGB: 15,   laborRate: 52, buildBudget: 2000 }
  };

  DATA.ERAS = [
    { id: 'era1983', startYear: 1983, startDate: '1983-03-01',
      name: '1983 — The Repair Era',
      blurb: 'Mock: repair-only start; builds unlock 1989-09-01.',
      cash: 3000, shopTier: 0, customBuildsUnlocked: false, difficulty: 'Standard' },
    { id: 'era1996', startYear: 1996, startDate: '1996-03-04',
      name: '1996 — The Pentium Gold Rush',
      blurb: 'Mock: builds unlocked from day one.',
      cash: 9000, shopTier: 0, customBuildsUnlocked: true, difficulty: 'Easier' }
  ];

  DATA.CUSTOM_BUILD_UNLOCK_DATE = '1989-09-01';

  DATA.SHOP_TIERS = [
    { id: 0, name: 'Garage', rentBase: 350, utilitiesBase: 60, workstationSlots: 2,
      offerBonus: 0, storageSlots: 20, upgradeCost: null, minPrestige: 0, desc: 'Mock garage.' },
    { id: 1, name: 'Strip-mall Unit', rentBase: 900, utilitiesBase: 140, workstationSlots: 4,
      offerBonus: 1, storageSlots: 50, upgradeCost: 4000, minPrestige: 1, desc: 'Mock unit.' },
    { id: 2, name: 'Main Street Storefront', rentBase: 2200, utilitiesBase: 320,
      workstationSlots: 6, offerBonus: 2, storageSlots: 120, upgradeCost: 15000,
      minPrestige: 2, desc: 'Mock storefront.' },
    { id: 3, name: 'Superstore', rentBase: 6000, utilitiesBase: 900, workstationSlots: 10,
      offerBonus: 4, storageSlots: 300, upgradeCost: 60000, minPrestige: 3, desc: 'Mock superstore.' }
  ];

  DATA.EQUIPMENT = [
    { id: 'repair-bench', name: 'Repair Bench', costBase: 0, introYear: 1979,
      desc: 'Owned from start.', effects: {} },
    { id: 'diag-station', name: 'Diagnostic Station', costBase: 800, introYear: 1983,
      desc: 'Halves diagnosis time.', effects: { diagHoursMult: 0.5 } },
    { id: 'build-bench', name: 'Assembly Bench', costBase: 1200, introYear: 1983,
      desc: 'Required for custom builds.', effects: { enablesBuilds: true } },
    { id: 'software-station', name: 'Software Station', costBase: 900, introYear: 1985,
      desc: 'Required for virus jobs; software 25% faster.',
      effects: { softwareHoursMult: 0.75 } },
    { id: 'dr-rig-1', name: 'Data Recovery Rig I', costBase: 1500, introYear: 1983,
      desc: 'Data recovery tier 1.', effects: { drTier: 1 } },
    { id: 'dr-rig-2', name: 'Data Recovery Rig II', costBase: 2500, introYear: 1995,
      requires: 'dr-rig-1', desc: 'Tier 2.', effects: { drTier: 2 } },
    { id: 'dr-rig-3', name: 'Data Recovery Rig III', costBase: 4000, introYear: 2010,
      requires: 'dr-rig-2', desc: 'Tier 3.', effects: { drTier: 3 } },
    { id: 'crt-kit', name: 'CRT Discharge Kit', costBase: 350, introYear: 1983,
      desc: 'Safe CRT work.', effects: { crtSafe: true } },
    { id: 'esd-setup', name: 'ESD-Safe Setup', costBase: 400, introYear: 1983,
      desc: 'Cuts part-damage mishaps 80%.', effects: { mishapMult: 0.2 } },
    { id: 'test-bench', name: 'Burn-in Test Bench', costBase: 1000, introYear: 1983,
      desc: 'Callback rate down 40%.', effects: { callbackMult: 0.6 } }
  ];

  DATA.HISTORICAL_EVENTS = [
    { id: 'dram-1988', startDate: '1988-01-15', durationDays: 420,
      headline: 'DRAM shortage bites: memory prices triple',
      body: 'Trade restrictions and fab underinvestment have memory chips on allocation worldwide.',
      effects: [{ categories: ['ram'], priceMult: 2.8 }],
      jobVolumeMult: 1.0, demandNote: 'upgrades' },
    { id: 'sumitomo-1993', startDate: '1993-07-04', durationDays: 270,
      headline: 'Resin plant explosion rattles RAM market',
      body: 'The Sumitomo epoxy plant fire chokes off chip packaging resin; DRAM spot prices jump.',
      effects: [{ categories: ['ram'], priceMult: 1.9 }],
      jobVolumeMult: 1.0 }
  ];

  DATA.RANDOM_EVENT_TEMPLATES = [
    { id: 'tariff', weight: 2, minYear: 1983, maxYear: 2100,
      headlines: ['New import tariffs announced on computer components'],
      body: 'Importers pass fresh duties straight into street prices.',
      durationDays: [30, 90],
      effects: [{ categories: ['gpu', 'motherboard'], priceMult: [1.2, 1.5] }],
      jobVolumeMult: 1.0 },
    { id: 'competitor-closes', weight: 2, minYear: 1983, maxYear: 2100,
      headlines: ['Rival repair shop across town closes its doors'],
      body: 'Their customers need somewhere to go.',
      durationDays: [30, 60], effects: [], jobVolumeMult: 1.4 },
    { id: 'competitor-opens', weight: 1, minYear: 1983, maxYear: 2100,
      headlines: ['New computer store opens nearby'],
      body: 'Flyers everywhere. Traffic dips.',
      durationDays: [30, 60], effects: [], jobVolumeMult: 0.8 },
    { id: 'press-coverage', weight: 1, minYear: 1983, maxYear: 2100,
      headlines: ['Local paper runs a glowing profile of your shop'],
      body: 'The phone keeps ringing.',
      durationDays: [14, 30], effects: [], jobVolumeMult: 1.35 },
    { id: 'fire-sale', weight: 1, minYear: 1983, maxYear: 2100,
      headlines: ['Warehouse fire sale floods market with cheap memory'],
      body: 'A distributor dumps stock at cost.',
      durationDays: [20, 45],
      effects: [{ categories: ['ram'], priceMult: [0.6, 0.8] }],
      jobVolumeMult: 1.0 },
    { id: 'flu-season', weight: 1, minYear: 1983, maxYear: 2100,
      headlines: ['Flu season empties the streets'],
      body: 'Fewer walk-ins this month.',
      durationDays: [20, 40], effects: [], jobVolumeMult: 0.85 }
  ];

  DATA.FLAVOR = {
    firstNames: ['Pat', 'Alex', 'Sam', 'Dana', 'Chris', 'Robin', 'Lee', 'Morgan'],
    lastNames: ['Nguyen', 'Smith', 'Garcia', 'Okafor', 'Kim', 'Rossi', 'Novak', 'Baker'],
    customerTypes: [
      { id: 'home', label: 'Home user' },
      { id: 'smallbiz', label: 'Small business' },
      { id: 'student', label: 'Student' },
      { id: 'office', label: 'Office manager' },
      { id: 'gamer', label: 'Gamer', minYear: 1993 }
    ],
    faults: {
      ram: [
        { desc: 'Random crashes and parity errors', laborHours: 1 },
        { desc: 'Memory count comes up short at POST', laborHours: 2 }
      ],
      storage: [
        { desc: 'Drive grinds and fails to spin up', laborHours: 2 },
        { desc: 'Read errors all over the disk', laborHours: 2 }
      ],
      gpu: [
        { desc: 'Garbage characters all over the screen', laborHours: 1 },
        { desc: 'No video signal at power-on', laborHours: 2 }
      ],
      psu: [
        { desc: 'Dead — no fan, no lights', laborHours: 1 },
        { desc: 'Random reboots under load', laborHours: 2 }
      ],
      motherboard: [
        { desc: 'No POST, no beeps', laborHours: 3 },
        { desc: 'Intermittent lockups, swollen caps', laborHours: 3 }
      ],
      cpu: [
        { desc: 'Halts during boot, overheating CPU', laborHours: 2 }
      ],
      cooling: [
        { desc: 'Screaming fan bearing, thermal shutdowns', laborHours: 1 }
      ],
      laborOnly: [
        { desc: 'Loose seating on expansion cards', laborHours: 1 },
        { desc: 'Corroded edge connectors need cleaning', laborHours: 2 },
        { desc: 'Cable mixed up after a move', laborHours: 1 },
        { desc: 'BIOS settings scrambled', laborHours: 1 },
        { desc: 'Jammed floppy eject mechanism', laborHours: 1 },
        { desc: 'Dust-choked and overheating', laborHours: 1 }
      ]
    },
    machineAdjectives: ['dusty', 'smoke-stained', 'barn-find', 'office-surplus'],
    // v2 format ({text, customers}) for repair/build/contract; v1 plain strings
    // for the rest — the engine must accept both (§9.2).
    jobBlurbs: {
      repair: [
        { text: '"It just stopped working mid-afternoon."', customers: null },
        { text: '"The invoices are trapped on that machine."', customers: ['smallbiz', 'office'] },
        { text: '"Please, my thesis is on that machine."', customers: ['student'] },
        { text: '"It crashed right before the boss fight."', customers: ['gamer'] },
        { text: '"It worked fine until the storm."', customers: ['home'] },
        { text: '"It makes a horrible noise and dies."', customers: null }
      ],
      upgrade: ['"It is just so slow lately."', '"I need more room for my files."',
                '"Can you make this thing faster?"', '"The new software will not run."'],
      build: [
        { text: '"Build me something decent, within budget."', customers: null },
        { text: '"It has to run the new 3D games, properly."', customers: ['gamer', 'student'] },
        { text: '"We need a dependable machine for the front office."', customers: ['smallbiz', 'office'] },
        { text: '"Money is set aside — make it count."', customers: null }
      ],
      data_recovery: ['"The disk died with everything on it."',
                      '"Tell me the photos are not gone."',
                      '"Payroll is on that drive."',
                      '"I never made a backup. I know. I know."'],
      software: ['"It is acting possessed."', '"Can you set it all up for me?"',
                 '"Something is very wrong with it."', '"It keeps showing weird messages."'],
      cleaning: ['"It sounds like a vacuum cleaner."', '"Smoke came out. A little."',
                 '"It has never been opened."', '"There may be crumbs inside."'],
      peripheral: ['"The printer eats every third page."', '"The screen flickers and hums."',
                   '"It prints stripes."', '"The monitor smells hot."'],
      enthusiast: ['"Push it as far as it will go."', '"Make it look incredible."',
                   '"I want bragging rights."', '"Do not hold back."'],
      contract: [
        { text: '"We need every unit identical."', customers: ['smallbiz', 'office'] },
        { text: '"The office is expanding."', customers: ['smallbiz', 'office'] },
        { text: '"Standard spec, many units, one invoice."', customers: null },
        { text: '"Our lab needs machines by end of month."', customers: null }
      ]
    },
    peripheralItems: [
      { name: 'dot-matrix printer', minYear: 1979, maxYear: 1996 },
      { name: 'CRT monitor', minYear: 1979, maxYear: 2006, crt: true },
      { name: 'inkjet printer', minYear: 1990 }
    ],
    shopNameSuggestions: ['Circuit & Solder', 'Byte Works']
  };
})(typeof window !== 'undefined' ? window : globalThis);
