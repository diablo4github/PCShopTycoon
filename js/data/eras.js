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

  // §2.5 — shop tiers
  DATA.SHOP_TIERS = [
    {
      id: 0, name: "Garage",
      rentBase: 350, utilitiesBase: 80,
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
      desc: "A dedicated clean bench with parts bins and torque drivers. Required for custom builds and build contracts.",
      effects: { enablesBuilds: true } },
    { id: "software-station", name: "Software Station", costBase: 900, introYear: 1985,
      desc: "A dedicated machine with every boot disk, driver, and scanner you need. Required for virus removal; software jobs 25% faster.",
      effects: { softwareHoursMult: 0.75 } },
    { id: "dr-rig-1", name: "Data Recovery Rig I", costBase: 1500, introYear: 1983,
      desc: "Drive imagers, alignment tools, and a lot of patience. Enables basic data recovery work.",
      effects: { drTier: 1 } },
    { id: "dr-rig-2", name: "Data Recovery Rig II", costBase: 2500, introYear: 1995, requires: "dr-rig-1",
      desc: "Cleanroom hood, platter-swap jigs, and firmware tools for modern high-density drives.",
      effects: { drTier: 2 } },
    { id: "dr-rig-3", name: "Data Recovery Rig III", costBase: 4000, introYear: 2010, requires: "dr-rig-2",
      desc: "Chip-off readers and flash reconstruction gear for SSDs and controllers that died young.",
      effects: { drTier: 3 } },
    { id: "crt-kit", name: "CRT Discharge Kit", costBase: 400, introYear: 1983,
      desc: "High-voltage probe, discharge wand, and insulated gloves. Work on monitors without gambling your heartbeat.",
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

})(typeof window !== 'undefined' ? window : globalThis);
