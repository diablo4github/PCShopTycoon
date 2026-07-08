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
      slots: { ram: 4, gpu: 5, storage: 2 },
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
    { id: 'cpu-mock-k6', name: 'Mock K6-2 300', category: 'cpu', brand: 'AMD',
      platformTags: ['SKT-7'], perf: { cpu: 260 }, reliability: 89, basePrice: 380,
      introYear: 1997, eolYear: 2002, legacy: true, tier: 'mainstream', powerDraw: 17,
      desc: 'Mock late-90s Socket 7 chip — keeps 1998-era builds feasible.' },
    { id: 'mobo-p5-atx', name: 'Socket 7 ATX Board', category: 'motherboard', brand: 'ASUS',
      platformTags: ['SKT-7', 'MEM-SDR', 'BUS-PCI', 'BUS-ISA16', 'STOR-IDE',
                     'STOR-FDD', 'FF-ATX', 'ARCH-586', 'ARCH-386'],
      slots: { ram: 4, gpu: 3, storage: 2 },
      perf: {}, reliability: 86, basePrice: 180, introYear: 1995, eolYear: 2000,
      legacy: true, tier: 'mainstream', powerDraw: 20,
      desc: 'A solid Taiwanese ATX board from the era when ATX itself was the exciting part.' },
    { id: 'mobo-p5-matx', name: 'Socket 7 Budget mATX Board', category: 'motherboard',
      brand: 'PCChips',
      platformTags: ['SKT-7', 'MEM-SDR', 'BUS-PCI', 'STOR-IDE', 'STOR-FDD',
                     'FF-MATX', 'ARCH-586', 'ARCH-386'],
      slots: { ram: 2, gpu: 1, storage: 2 },
      perf: {}, reliability: 80, basePrice: 95, introYear: 1995, eolYear: 2002,
      legacy: true, tier: 'budget', powerDraw: 18,
      desc: 'Two DIMM slots and one usable PCI slot — the corner-cutting classic.' },
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
    // §12.2: Voodoo2 SLI pair (3D add-ons — need a 2D card beside them)
    { id: 'gpu-mock-voodoo2', name: 'Mock Voodoo2 12MB', category: 'gpu', brand: '3dfx',
      platformTags: ['BUS-PCI'], sliTag: 'VOODOO2', addonOnly: true,
      perf: { gpu: 115 }, reliability: 91, basePrice: 299,
      introYear: 1998, introMonth: 2, eolYear: 2001, legacy: true, tier: 'premium',
      powerDraw: 17,
      desc: 'Scan-line interleave: two of these render alternating lines.' },
    { id: 'gpu-mock-voodoo2-b', name: 'Mock Monster V2 (Voodoo2)', category: 'gpu',
      brand: 'Diamond',
      platformTags: ['BUS-PCI'], sliTag: 'VOODOO2', addonOnly: true,
      perf: { gpu: 115 }, reliability: 90, basePrice: 289,
      introYear: 1998, introMonth: 3, eolYear: 2001, legacy: true, tier: 'premium',
      powerDraw: 17,
      desc: 'The brand-variant Voodoo2, preferably bought in pairs.' },

    // ----- compact 2006 cluster (SLI/RAM-heavy/mobile-era scenarios) -----
    { id: 'cpu-mock-c2d', name: 'Mock Core 2 Duo', category: 'cpu', brand: 'Intel',
      platformTags: ['SKT-M06'], perf: { cpu: 900 }, reliability: 92, basePrice: 250,
      introYear: 2004, eolYear: 2018, legacy: false, tier: 'mainstream', powerDraw: 65,
      desc: 'Mock mid-2000s dual core.' },
    { id: 'mobo-sli06', name: 'Mock nForce SLI Board', category: 'motherboard',
      brand: 'ASUS',
      platformTags: ['SKT-M06', 'MEM-DDR2', 'BUS-PCIE', 'STOR-SATA', 'FF-ATX',
                     'ARCH-X64'],
      slots: { ram: 4, gpu: 2, storage: 4 },
      perf: {}, reliability: 88, basePrice: 150, introYear: 2004, eolYear: 2018,
      legacy: false, tier: 'mainstream', powerDraw: 25,
      desc: 'Mock dual-x16 SLI-certified board.' },
    { id: 'ram-mock-1gb', name: 'Mock 1GB DDR2 Stick', category: 'ram', brand: 'Kingston',
      platformTags: ['MEM-DDR2'], perf: { ramMB: 1024 }, reliability: 91, basePrice: 90,
      introYear: 2004, eolYear: 2018, legacy: false, tier: 'mainstream', powerDraw: 3,
      desc: 'Mock DDR2 stick — stack four for the RAM-maxed crowd.' },
    { id: 'storage-mock-sata', name: 'Mock 160GB SATA HDD', category: 'storage',
      brand: 'Seagate',
      platformTags: ['STOR-SATA'], perf: { storageGB: 160, speed: 40 }, reliability: 82,
      basePrice: 90, introYear: 2004, eolYear: 2018, legacy: false, tier: 'mainstream',
      powerDraw: 8,
      desc: 'Mock mid-2000s SATA drive.' },
    { id: 'gpu-mock-7900', name: 'Mock GeForce 7900 GT', category: 'gpu', brand: 'NVIDIA',
      platformTags: ['BUS-PCIE'], sliTag: 'SLI-MOCK', perf: { gpu: 950 },
      reliability: 88, basePrice: 280, introYear: 2004, eolYear: 2018, legacy: false,
      tier: 'premium', powerDraw: 80,
      desc: 'Mock SLI-capable card — two of them beat any single card here.' },
    { id: 'gpu-mock-x1300', name: 'Mock Radeon X1300', category: 'gpu', brand: 'ATI',
      platformTags: ['BUS-PCIE'], perf: { gpu: 400 }, reliability: 90, basePrice: 90,
      introYear: 2004, eolYear: 2018, legacy: false, tier: 'budget', powerDraw: 30,
      desc: 'Mock budget PCIe card with no pairing tricks.' },
    { id: 'psu-mock-500', name: 'Mock ATX 500W PSU', category: 'psu', brand: 'Corsair',
      platformTags: ['FF-ATX'], perf: {}, reliability: 90, basePrice: 80, watts: 500,
      introYear: 2004, eolYear: 2018, legacy: false, tier: 'mainstream', powerDraw: 0,
      desc: 'Mock mid-2000s PSU with SLI headroom.' },
    { id: 'os-mock-xp', name: 'Mock Windows XP', category: 'os', brand: 'Microsoft',
      platformTags: ['ARCH-X64'], perf: {}, reliability: 85, basePrice: 120,
      introYear: 2001, eolYear: 2012, legacy: false, tier: 'mainstream', powerDraw: 0,
      desc: 'Mock 2000s OS.' },
    // §12.3: one expansion part (bus-tag overlap, never required in builds)
    { id: 'expansion-mock-sound', name: 'Mock Sound Blaster', category: 'expansion',
      brand: 'Creative',
      platformTags: ['BUS-PCI', 'BUS-ISA16'], perf: {}, reliability: 88, basePrice: 120,
      introYear: 1992, eolYear: 2003, legacy: true, tier: 'mainstream', powerDraw: 5,
      desc: 'Mock sound card — flavor hardware on the expansion bus.' },
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
    2000: { cpu: 350, gpu: 200, ramMB: 96,   storageGB: 15,   laborRate: 52, buildBudget: 2000 },
    2006: { cpu: 700, gpu: 600, ramMB: 1024, storageGB: 160,  laborRate: 58, buildBudget: 1900 },
    2015: { cpu: 4000, gpu: 4000, ramMB: 8192, storageGB: 1000, laborRate: 68, buildBudget: 1800 }
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

  // §10.1 step templates (compact but real-shaped: wildcards + era windows + conds)
  DATA.TASK_STEPS = [
    { type: 'repair', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Interview customer & log symptoms', hours: 0.25 },
        { label: 'Open case & ground yourself', hours: 0.25 },
        { label: 'Reseat, clean & correct the fault', hours: 0.75 },
        { label: 'Set jumpers & CMOS options', hours: 0.25, maxYear: 1997 },
        { label: 'POST test & button up', hours: 0.5 }
      ] },
    { type: 'repair', partCategory: 'storage', subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Back up readable data first', hours: 0.5 },
        { label: 'Open case & ground yourself', hours: 0.25 },
        { label: 'Swap the drive', hours: 0.5 },
        { label: 'Low-level format & verify', hours: 0.5, maxYear: 1992 },
        { label: 'Restore data & test', hours: 0.5 }
      ] },
    { type: 'upgrade', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Confirm compatibility & clearances', hours: 0.25 },
        { label: 'Install the new part', hours: 0.5 },
        { label: 'Update drivers & configuration', hours: 0.25, minYear: 1995 },
        { label: 'Burn-in & hand-off', hours: 0.5 }
      ] },
    { type: 'software', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Back up user files', hours: 0.5 },
        { label: 'Install & configure software', hours: 0.75 },
        { label: 'Verify boot & applications', hours: 0.25 }
      ] },
    { type: 'cleaning', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Blow out dust & vacuum filters', hours: 0.25 },
        { label: 'Clean contacts & fans', hours: 0.25 },
        { label: 'Reassemble & smoke test', hours: 0.25 }
      ] },
    { type: 'peripheral', partCategory: null, subtype: 'crt', minYear: null, maxYear: null,
      steps: [
        { label: 'Discharge the tube safely', hours: 0.25, cond: 'crt-kit' },
        { label: 'Open chassis & inspect boards', hours: 0.5 },
        { label: 'Repair fault & re-solder joints', hours: 0.75 },
        { label: 'Calibrate & soak test', hours: 0.5 }
      ] },
    { type: 'peripheral', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Strip down & inspect', hours: 0.5 },
        { label: 'Replace worn mechanism', hours: 0.5 },
        { label: 'Reassemble & test feed', hours: 0.5 }
      ] },
    { type: 'data_recovery', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Image the failing media', hours: 1 },
        { label: 'Reconstruct file tables', hours: 1 },
        { label: 'Verify & deliver recovered data', hours: 0.5 }
      ] },
    { type: 'build', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Lay out parts & prep case', hours: 0.5 },
        { label: 'Mount board, CPU & memory', hours: 1 },
        { label: 'Fit drives, PSU & cards', hours: 1 },
        { label: 'Cable up & first POST', hours: 0.5 },
        { label: 'Install OS & drivers', hours: 1 },
        { label: 'Benchmark & stability pass', hours: 0.5, minYear: 1997 }
      ] },
    { type: 'enthusiast', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Baseline benchmarks', hours: 0.5 },
        { label: 'Fit upgraded cooling', hours: 0.5 },
        { label: 'Tune clocks & voltages', hours: 0.75 },
        { label: 'Stress test overnight pass', hours: 0.5 }
      ] },
    { type: 'refurb', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Strip, clean & inventory the box', hours: 1 },
        { label: 'Swap the dead part', hours: 1 },
        { label: 'Reassemble & configure', hours: 1 },
        { label: 'Burn-in before sale', hours: 1 }
      ] },
    { type: 'contract', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Prep unit on the bench', hours: 0.5 },
        { label: 'Install per-unit hardware', hours: 0.5 },
        { label: 'Configure & QA to spec', hours: 0.5 }
      ] },
    { type: 'callback', partCategory: null, subtype: null, minYear: null, maxYear: null,
      steps: [
        { label: 'Review original work ticket', hours: 0.25 },
        { label: 'Reproduce & rework the fault', hours: 0.75 },
        { label: 'Extended test before return', hours: 0.5 }
      ] },
    // §12.4 device repair — tablet template intentionally absent so the
    // engine's synthesized fallback path gets exercised on mock.
    { type: 'device_repair', partCategory: null, subtype: 'apple', minYear: null, maxYear: null,
      steps: [
        { label: 'Intake & symptom interview', hours: 0.25 },
        { label: 'Crack the case & discharge', hours: 0.5 },
        { label: 'Swap SIMMs / drive / module', hours: 0.5 },
        { label: 'Reassemble & boot test', hours: 0.5 }
      ] },
    { type: 'device_repair', partCategory: null, subtype: 'smartphone', minYear: null, maxYear: null,
      steps: [
        { label: 'Intake & full-function test', hours: 0.25 },
        { label: 'Heat & pry the assembly', hours: 0.5 },
        { label: 'Swap the faulty module', hours: 0.5 },
        { label: 'Reseal, calibrate & retest', hours: 0.5 }
      ] }
  ];

  // §12.4 device tables (Apple + mobile) — tiny but schema-exact
  DATA.APPLE_MACHINES = [
    { id: 'mock-mac-plus', name: 'Mock Macintosh Plus', family: 'APPLE-68K',
      introYear: 1986, eolYear: 1996, ramUpgradable: true, hddUpgradable: true,
      cpuUpgradable: false, basePriceRange: [70, 110],
      faultCategories: ['ram', 'logic-board', 'screen', 'floppy'],
      desc: 'Mock first serviceable Mac: SIMM slots and SCSI.' },
    { id: 'mock-powermac-g3', name: 'Mock Power Mac G3', family: 'APPLE-PPC',
      introYear: 1997, eolYear: 2003, ramUpgradable: true, hddUpgradable: true,
      cpuUpgradable: false, basePriceRange: [90, 140],
      faultCategories: ['logic-board', 'storage', 'ram', 'psu'],
      desc: 'Mock tool-less tower, tech-beloved.' },
    { id: 'mock-mbp-retina', name: 'Mock MacBook Pro Retina', family: 'APPLE-INTEL',
      introYear: 2012, eolYear: 2018, ramUpgradable: false, hddUpgradable: true,
      cpuUpgradable: false, basePriceRange: [110, 180],
      faultCategories: ['battery', 'screen', 'storage', 'logic-board'],
      desc: 'Mock hinge-year machine: soldered RAM, glued battery.' }
  ];
  DATA.MOBILE_DEVICES = [
    { id: 'mock-phone-4', kind: 'smartphone', name: 'Mock Phone 4', brand: 'Apple',
      introYear: 2010, eolYear: 2016, tier: 'premium' },
    { id: 'mock-droid', kind: 'smartphone', name: 'Mock Droid', brand: 'Motorola',
      introYear: 2012, eolYear: 2024, tier: 'budget' },
    { id: 'mock-tab', kind: 'tablet', name: 'Mock Tab', brand: 'Samsung',
      introYear: 2011, eolYear: 2022, tier: 'mainstream' }
  ];
  DATA.MOBILE_FAULTS = {
    screen: [
      { desc: 'Cracked display assembly', laborHours: 1, partsCostFactor: 0.35,
        complaints: ['"I dropped it face-down. Spiderweb city."',
                     '"Half the touch does not touch anymore."'],
        faultDescs: ['Shattered glass and digitizer', 'Fractured panel — assembly swap'] }
    ],
    battery: [
      { desc: 'Swollen battery', laborHours: 0.75, partsCostFactor: 0.12,
        complaints: ['"It dies at 40% like clockwork."',
                     '"The back is bulging. That is new."'],
        faultDescs: ['Cell past cycle life', 'Swollen cell pressing the case'] }
    ],
    'charge-port': [
      { desc: 'Lint-packed charging port', laborHours: 1, partsCostFactor: 0.08,
        complaints: ['"It only charges at one exact cable angle."',
                     '"I jiggle the plug for ten seconds every night."'],
        faultDescs: ['Port packed with lint', 'Cracked charge-port flex'] }
    ]
  };

  // §10.7 staff roles (ids match the engine fallbacks / real data)
  DATA.STAFF_ROLES = [
    { id: 'tech', name: 'Technician',
      desc: 'Bench work: repairs, upgrades, refurbs, peripherals, cleaning, devices.',
      jobTypes: ['repair', 'upgrade', 'refurb', 'peripheral', 'cleaning', 'callback',
                 'device_repair'],
      wageFactor: 1 },
    { id: 'software', name: 'Software Specialist',
      desc: 'OS installs, virus cleanup, data recovery.',
      jobTypes: ['software', 'data_recovery'], wageFactor: 1.05 },
    { id: 'builder', name: 'Builder',
      desc: 'Custom builds, contracts, enthusiast work.',
      jobTypes: ['build', 'contract', 'enthusiast'], wageFactor: 1.1 },
    { id: 'apprentice', name: 'Apprentice',
      desc: 'Helps with everything at half effect. Cheap.',
      jobTypes: ['repair', 'upgrade', 'refurb', 'peripheral', 'cleaning', 'callback',
                 'software', 'data_recovery', 'build', 'contract', 'enthusiast'],
      wageFactor: 0.5 }
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
        { desc: 'Random crashes and parity errors', laborHours: 1,
          complaints: ['"It crashes at random moments, no pattern at all."',
                       '"Sometimes it locks up with a weird beep."'] },
        { desc: 'Memory count comes up short at POST', laborHours: 2,
          complaints: ['"The number it shows at startup got smaller."',
                       '"It says something about memory when it boots."'] }
      ],
      storage: [
        { desc: 'Drive grinds and fails to spin up', laborHours: 2,
          complaints: ['"It makes a horrible grinding noise and gives up."',
                       '"There is a clunk-clunk sound and nothing loads."'] },
        { desc: 'Read errors all over the disk', laborHours: 2,
          complaints: ['"Half my files will not open anymore."',
                       '"It keeps saying error reading drive."'] }
      ],
      gpu: [
        { desc: 'Garbage characters all over the screen', laborHours: 1,
          complaints: ['"The screen fills with confetti nonsense."',
                       '"Everything on screen looks scrambled."'] },
        { desc: 'No video signal at power-on', laborHours: 2,
          complaints: ['"The screen stays black but the fans run."',
                       '"It powers on but shows nothing at all."'] }
      ],
      psu: [
        { desc: 'Dead — no fan, no lights', laborHours: 1,
          complaints: ['"It is completely dead. Nothing. Silence."',
                       '"No lights, no fan, no anything."'] },
        { desc: 'Random reboots under load', laborHours: 2,
          complaints: ['"It restarts itself whenever I do real work."',
                       '"It reboots out of nowhere, mostly when busy."'] }
      ],
      motherboard: [
        { desc: 'No POST, no beeps', laborHours: 3,
          complaints: ['"It powers up but never gets anywhere."',
                       '"No beep, no picture, just fans."'] },
        { desc: 'Intermittent lockups, swollen caps', laborHours: 3,
          complaints: ['"It freezes a few times a day, then works fine."',
                       '"Some days fine, some days it just stops."'] }
      ],
      cpu: [
        { desc: 'Halts during boot, overheating CPU', laborHours: 2,
          complaints: ['"It gets partway through starting and stops."',
                       '"It boots, runs a minute, then freezes solid."'] }
      ],
      cooling: [
        { desc: 'Screaming fan bearing, thermal shutdowns', laborHours: 1,
          complaints: ['"It sounds like a jet engine, then turns off."',
                       '"The fan screams and then it shuts itself down."'] }
      ],
      laborOnly: [
        { desc: 'Loose seating on expansion cards', laborHours: 1,
          complaints: ['"It works if I wiggle it. That is bad, right?"',
                       '"A thump on the desk fixes it. Usually."'] },
        { desc: 'Corroded edge connectors need cleaning', laborHours: 2,
          complaints: ['"It has been flaky ever since the damp winter."',
                       '"Sometimes the keyboard just is not there."'] },
        { desc: 'Cable mixed up after a move', laborHours: 1,
          complaints: ['"It has not worked since we moved offices."',
                       '"My nephew rearranged the plugs. Sorry."'] },
        { desc: 'BIOS settings scrambled', laborHours: 1,
          complaints: ['"It asks strange questions when it starts now."',
                       '"The date resets and then it will not boot right."'] },
        { desc: 'Jammed floppy eject mechanism', laborHours: 1,
          complaints: ['"The disk went in and never came back out."',
                       '"There might be two disks in there. Maybe three."'] },
        { desc: 'Dust-choked and overheating', laborHours: 1,
          complaints: ['"It gets hot and slow by the afternoon."',
                       '"It smells warm. Is that normal? It is not, is it."'] }
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
      { name: 'dot-matrix printer', minYear: 1979, maxYear: 1996, kind: 'printer',
        complaints: ['"It eats every third sheet of paper."',
                     '"The printing goes faint then stops mid-page."'],
        faultDescs: ['Worn platen feed rollers', 'Print head pins jammed with ink'] },
      { name: 'CRT monitor', minYear: 1979, maxYear: 2006, crt: true, kind: 'crt',
        complaints: ['"The picture shrinks and flickers and hums."',
                     '"It smells hot and the picture bends sideways."'],
        faultDescs: ['Dried-out flyback joints need re-soldering',
                     'Failing capacitors in the deflection board'] },
      { name: 'inkjet printer', minYear: 1990, kind: 'printer',
        complaints: ['"It prints stripes instead of words."',
                     '"Everything comes out the wrong colour."'],
        faultDescs: ['Clogged print head & dried ink lines',
                     'Failed carriage position sensor'] },
      { name: 'external modem', minYear: 1983, maxYear: 2004, kind: 'modem',
        complaints: ['"It dials, screams, then gives up."',
                     '"It has not connected since the thunderstorm."'],
        faultDescs: ['Lightning-struck line driver chip', 'Cooked voltage regulator'] },
      { name: 'mechanical keyboard', minYear: 1979, kind: 'input',
        complaints: ['"Some keys need a real hammer blow to work."',
                     '"The spacebar sticks and repeats forever."'],
        faultDescs: ['Corroded switch contacts under the worst keys',
                     'Cracked solder joints on the controller row'] }
    ],
    shopNameSuggestions: ['Circuit & Solder', 'Byte Works']
  };
})(typeof window !== 'undefined' ? window : globalThis);
