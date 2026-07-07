(function (root) {
  'use strict';
  var DATA = root.DATA = root.DATA || {};

  DATA.FLAVOR = {
    firstNames: [
      "Pat", "Dale", "Terry", "Sandra", "Miguel", "Wanda", "Gary", "Denise", "Frank", "Carol",
      "Ruth", "Harold", "Gloria", "Vince", "Marcia", "Leon", "Doris", "Stan", "Peggy", "Walt",
      "Ramona", "Chuck", "Lois", "Ernie", "Beverly", "Ray", "Judy", "Marvin", "Connie", "Phil",
      "Angela", "Kevin", "Tina", "Doug", "Sheila", "Brian", "Monica", "Jeff", "Karen", "Steve",
      "Latoya", "Craig", "Melissa", "Todd", "Rachel", "Omar", "Heather", "Jason", "Amber", "Derek",
      "Priya", "Kyle", "Jasmine", "Trevor", "Megan", "Andre", "Brittany", "Cody", "Vanessa", "Marcus",
      "Aisha", "Logan", "Chloe", "Dmitri", "Sofia", "Tyler", "Mei", "Brandon", "Zoe", "Hector",
      "Ingrid", "Noah", "Fatima", "Ethan", "Rosa", "Caleb", "Nadia", "Jared", "Lucia", "Wes"
    ],
    lastNames: [
      "Nguyen", "Kowalski", "Ramirez", "O'Brien", "Chen", "Petersen", "Washington", "Gutierrez", "Kaminski", "Blackwell",
      "Sato", "Fitzgerald", "Delgado", "Hoffman", "Okafor", "Lindqvist", "Marino", "Vasquez", "Sherman", "Park",
      "Whitaker", "Rosenberg", "Castillo", "Duffy", "Kim", "Novak", "Pearson", "Ortega", "Slater", "Huang",
      "McAllister", "Silva", "Brandt", "Tucker", "Reyes", "Olsen", "Faulkner", "Dominguez", "Weiss", "Choi",
      "Barnett", "Moreau", "Copeland", "Ferraro", "Singh", "Larsen", "Whitfield", "Mendoza", "Kirby", "Tanaka",
      "Holloway", "Beaumont", "Cruz", "Gallagher", "Patel", "Sorensen", "Mercer", "Ibarra", "Quinn", "Zhang",
      "Ashford", "Romano", "Drummond", "Espinoza", "Kaur", "Lindgren", "Prescott", "Navarro", "Stein", "Watts"
    ],
    customerTypes: [
      { id: "home", label: "Home user" },
      { id: "smallbiz", label: "Small business" },
      { id: "student", label: "Student" },
      { id: "office", label: "Office manager" },
      { id: "hobbyist", label: "Hobbyist" },
      { id: "senior", label: "Retiree" },
      { id: "gamer", label: "Gamer", minYear: 1993 },
      { id: "creator", label: "Content creator", minYear: 2008 },
      { id: "miner", label: "Crypto miner", minYear: 2013 }
    ],
    faults: {
      ram: [
        { desc: "Random crashes and parity errors under load", laborHours: 1 },
        { desc: "Memory count comes up short at boot", laborHours: 1 },
        { desc: "Constant blue screens blamed on a bad memory module", laborHours: 1.5 },
        { desc: "Machine beeps endlessly and refuses to POST — dead RAM", laborHours: 1 },
        { desc: "Corrupted files and flaky behavior traced to failing memory", laborHours: 2 }
      ],
      storage: [
        { desc: "Drive makes a rhythmic clicking and won't spin up", laborHours: 2 },
        { desc: "Boot failure: operating system not found", laborHours: 1.5 },
        { desc: "Bad sectors spreading — drive needs replacement before it dies", laborHours: 2 },
        { desc: "Drive vanishes from the system intermittently", laborHours: 1.5 },
        { desc: "Grinding noise from the drive bay, files taking forever to open", laborHours: 2 }
      ],
      gpu: [
        { desc: "No video output — screen stays black on power-up", laborHours: 1 },
        { desc: "Garbage characters and artifacts all over the display", laborHours: 1.5 },
        { desc: "Display cuts out when the machine warms up", laborHours: 2 },
        { desc: "Vertical stripes across the screen from a failing video card", laborHours: 1 },
        { desc: "Games crash to desktop — video memory failing", laborHours: 1.5 }
      ],
      psu: [
        { desc: "Machine completely dead, not even a fan twitch", laborHours: 1 },
        { desc: "Random shutdowns under heavy load", laborHours: 1.5 },
        { desc: "Burning smell and a loud pop from the power supply", laborHours: 1 },
        { desc: "Power supply fan screaming like a jet engine", laborHours: 1 },
        { desc: "Machine reboots itself whenever the printer kicks on — failing PSU", laborHours: 1.5 }
      ],
      motherboard: [
        { desc: "Leaking capacitors bulging on the system board", laborHours: 3 },
        { desc: "No POST, no beep — dead system board", laborHours: 2.5 },
        { desc: "Ports failing one by one; board on its way out", laborHours: 2 },
        { desc: "Corroded traces from a leaked clock battery", laborHours: 3 },
        { desc: "Machine only boots every third try — flaky board", laborHours: 2 }
      ],
      cpu: [
        { desc: "System powers on but processor never comes alive", laborHours: 1.5 },
        { desc: "Overheating processor throttling the whole machine", laborHours: 1 },
        { desc: "Bent pins after a botched home upgrade attempt", laborHours: 2 },
        { desc: "Processor fails under load — math errors and lockups", laborHours: 1.5 }
      ],
      cooling: [
        { desc: "CPU fan seized solid; machine shuts down after minutes", laborHours: 0.5 },
        { desc: "Heatsink clogged with a decade of dust and pet hair", laborHours: 1 },
        { desc: "Cooler mounting bracket snapped, heatsink hanging loose", laborHours: 1 },
        { desc: "Fan bearing whine driving the whole office crazy", laborHours: 0.5 }
      ],
      laborOnly: [
        { desc: "Loose seating on expansion cards", laborHours: 1 },
        { desc: "Cable worked itself loose inside the case", laborHours: 0.5 },
        { desc: "Jumpers set wrong after a DIY upgrade attempt", laborHours: 1 },
        { desc: "Connector pins bent and shorting against the chassis", laborHours: 1 },
        { desc: "Drive cable installed backwards — machine won't boot", laborHours: 0.5 },
        { desc: "Corrupted configuration; needs setup rebuilt from scratch", laborHours: 1.5 },
        { desc: "Dead clock battery lost all the machine's settings", laborHours: 0.5 },
        { desc: "Screw rattling around loose on the system board", laborHours: 0.5 }
      ]
    },
    machineAdjectives: [
      "dusty", "smoke-stained", "barn-find", "office-surplus", "coffee-splashed", "yellowed",
      "sun-faded", "sticker-covered", "garage-kept", "flood-salvaged", "estate-sale", "school-surplus",
      "cigarette-tarred", "attic-fresh", "well-loved", "mystery-box"
    ],
    jobBlurbs: {
      repair: [
        "It was working fine last night, and this morning — nothing. We invoice on this machine!",
        "My kid says it's 'toast.' I need a second opinion from a professional.",
        "It makes a horrible noise and then just... stops. Please tell me it's cheap.",
        "The screen went black mid-game and never came back. I've tried turning it off and on. Twice.",
        "It smells like burning plastic when I turn it on. That's bad, right?"
      ],
      upgrade: [
        "Everyone says I need more memory. I don't know what that means, but here's the machine.",
        "The new software says my machine doesn't meet 'minimum requirements.' Rude, but fix it.",
        "It takes five minutes to open anything. Make it faster, whatever it takes.",
        "My nephew says this thing is a dinosaur. Modernize it — within reason.",
        "I just need it to run one specific program. The box lists things I don't own."
      ],
      build: [
        "I've saved up all year for this. Build me something that'll turn heads.",
        "I need a machine for the office — reliable, boring, and on budget. Surprise me with neither.",
        "Build it like you'd build your own. That's the whole spec.",
        "My friend's machine loads everything instantly. I want to beat it. Comfortably.",
        "Here's my budget. Every dollar past it comes out of my vacation fund, so don't."
      ],
      data_recovery: [
        "My thesis is on that drive. My ONLY copy. Please. I'm begging you.",
        "Ten years of family photos. The drive just clicks now. Whatever it costs.",
        "Our accounts are on there and tax season starts Monday.",
        "I deleted the wrong folder and then, in a panic, I made it worse.",
        "The drive fell off the desk. It was on. I know, I know."
      ],
      software: [
        "There are seventeen toolbars in my browser and I installed exactly none of them.",
        "It's asking me to pay money to unlock my own files. This is extortion. Fix it.",
        "Fresh start, please. Wipe it and set it up like new — but keep my stuff.",
        "Pop-ups. So many pop-ups. It beeps at me even when it's off. I think.",
        "My grandson installed 'a few games' and now nothing works."
      ],
      cleaning: [
        "I opened the case to look inside and closed it immediately. You need to see this.",
        "It sounds like a hair dryer and heats the whole room. Just clean it, please.",
        "The cat sleeps on it. Draw your own conclusions.",
        "It shuts itself off when it gets hot. Summer's coming. Help.",
        "There may or may not be a decade of cigarette smoke in there. There is."
      ],
      peripheral: [
        "The printer eats every third page and I've started taking it personally.",
        "The monitor flickers until I smack it. I'd like a more professional solution.",
        "My modem dials, screams, and gives up. I hear that's not normal anymore.",
        "Half the keys stick and the spacebar needs a running start.",
        "The screen's gone all green and wavy. It's like working inside an aquarium."
      ],
      enthusiast: [
        "I want every last megahertz this thing can give. Warranty is a suggestion.",
        "Make it faster than my brother's. That's the entire specification.",
        "I saw a build online with lights everywhere. I want that, but tasteful. But lights everywhere.",
        "Quiet, cold, and fast. Pick all three, that's why I'm paying a professional.",
        "I've overclocked it myself and now it won't boot. Make it go faster anyway."
      ],
      contract: [
        "We're outfitting the whole office. Identical machines, on time, no drama.",
        "The school board approved the budget. Twelve machines by end of month.",
        "Our firm is expanding — we need workstations for the new hires, all the same spec.",
        "Corporate says buy local. Congratulations, you're local. Here's the purchase order."
      ]
    },
    peripheralItems: [
      { name: "dot-matrix printer", minYear: 1979, maxYear: 1996 },
      { name: "daisy-wheel printer", minYear: 1979, maxYear: 1990 },
      { name: "CRT monitor", minYear: 1979, maxYear: 2006, crt: true },
      { name: "green-screen terminal monitor", minYear: 1979, maxYear: 1992, crt: true },
      { name: "acoustic-coupler modem", minYear: 1979, maxYear: 1986 },
      { name: "external dial-up modem", minYear: 1982, maxYear: 2004 },
      { name: "mechanical keyboard", minYear: 1979 },
      { name: "serial mouse", minYear: 1983, maxYear: 1999 },
      { name: "inkjet printer", minYear: 1990 },
      { name: "laser printer", minYear: 1985 },
      { name: "flatbed scanner", minYear: 1988 },
      { name: "CD-ROM drive", minYear: 1992, maxYear: 2012 },
      { name: "Zip drive", minYear: 1995, maxYear: 2003 },
      { name: "LCD monitor", minYear: 1999 },
      { name: "webcam", minYear: 1999 },
      { name: "wireless router", minYear: 2001 },
      { name: "USB flash drive", minYear: 2002 },
      { name: "gaming headset", minYear: 2008 },
      { name: "USB microphone", minYear: 2010 },
      { name: "ultrawide monitor", minYear: 2015 }
    ],
    shopNameSuggestions: [
      "Circuit & Solder", "The Byte Shop", "Silicon Alley Repair", "Motherboard Medics",
      "Chips & Tips Computing", "The Blue Screen Clinic", "Kilobyte Corner", "TurboTech Services",
      "Golden Screwdriver PC", "Cache & Carry Computers", "Reboot Repair Co.", "The Soldering Iron",
      "Downtown Data Works", "Front Panel Computing", "Iron Case PC Lab", "Warm Boot Workshop"
    ]
  };

})(typeof window !== 'undefined' ? window : globalThis);
