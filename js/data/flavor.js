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
    // v0.3 (§10.5): every fault carries customer-voice complaints (symptoms only, no part-name spoilers).
    faults: {
      ram: [
        { desc: "Random crashes and parity errors under load", laborHours: 1, complaints: ["It crashes at random and flashes some 'parity error' message at me.", "It just dies in the middle of things — no pattern I can find."] },
        { desc: "Memory count comes up short at boot", laborHours: 1, complaints: ["The number it counts up at startup looks smaller than it used to.", "Programs refuse to open, saying there isn't enough room to run."] },
        { desc: "Constant blue screens from a bad memory module", laborHours: 1.5, complaints: ["Blue screens. Constantly. A different message every time.", "Every hour or so the whole screen goes blue and it restarts itself."] },
        { desc: "Machine beeps endlessly and refuses to POST", laborHours: 1, complaints: ["It just beeps over and over and never starts up.", "Turn it on and it screams beeps at me. Nothing ever shows on screen."] },
        { desc: "Corrupted files from failing memory", laborHours: 2, complaints: ["Files keep coming up scrambled or won't open at all.", "Documents I saved yesterday are garbage today."] }
      ],
      storage: [
        { desc: "Drive makes a rhythmic clicking and won't spin up", laborHours: 2, complaints: ["It makes this tick... tick... tick sound and never gets going.", "There's a rhythmic clicking from inside and the screen just waits forever."] },
        { desc: "Boot failure: operating system not found", laborHours: 1.5, complaints: ["It says 'operating system not found'. It found it fine last week.", "Black screen with a message about no system. I didn't change anything!"] },
        { desc: "Bad sectors spreading — drive dying", laborHours: 2, complaints: ["It freezes when opening certain files, and it's getting worse.", "Long pauses, odd noises, and now some folders won't open at all."] },
        { desc: "Drive vanishes from the system intermittently", laborHours: 1.5, complaints: ["Some days it starts fine, other days it acts like half of it is missing.", "My files disappear and reappear depending on its mood."] },
        { desc: "Grinding from the drive bay, files crawling", laborHours: 2, complaints: ["Horrible grinding noise and everything takes forever to open.", "It sounds like it's chewing gravel in there."] }
      ],
      gpu: [
        { desc: "No video output — dead video card", laborHours: 1, complaints: ["The machine sounds like it's running but the screen stays black.", "Power light on, fans on, picture: none."] },
        { desc: "Garbage and artifacts all over the display", laborHours: 1.5, complaints: ["The screen fills with weird characters and colored confetti.", "Random blocks and squiggles all over everything I open."] },
        { desc: "Display cuts out when the machine warms up", laborHours: 2, complaints: ["The picture's fine for ten minutes, then it blinks out.", "The longer it runs, the worse the picture gets, until it just quits."] },
        { desc: "Vertical stripes from failing video hardware", laborHours: 1, complaints: ["There are colored stripes down the whole screen.", "Vertical lines everywhere — like looking through a picket fence."] },
        { desc: "3D crashes from failing video memory", laborHours: 1.5, complaints: ["Games quit to the desktop after a few minutes.", "Anything with graphics crashes; plain typing seems fine."] }
      ],
      psu: [
        { desc: "Dead power supply — no signs of life", laborHours: 1, complaints: ["Nothing happens. No light, no fan, nothing at all.", "It's completely dead — like it's not even plugged in. It is. I checked."] },
        { desc: "Random shutdowns under heavy load", laborHours: 1.5, complaints: ["It switches itself off when I'm working it hard.", "Big jobs make it die halfway through. Small stuff is fine."] },
        { desc: "Blown supply — pop and burning smell", laborHours: 1, complaints: ["There was a loud POP and now there's a burnt smell.", "It smelled like fireworks for a second and hasn't turned on since."] },
        { desc: "Failing supply fan screaming", laborHours: 1, complaints: ["Something inside howls like a jet taking off.", "The noise from the back is unbearable — you can hear it two rooms away."] },
        { desc: "Sagging rails — reboots under external load", laborHours: 1.5, complaints: ["It restarts itself whenever the printer starts up.", "Every time something else on the power strip kicks in, it reboots."] }
      ],
      motherboard: [
        { desc: "Leaking capacitors bulging on the system board", laborHours: 3, complaints: ["It's gotten flaky, and there's a faint fishy smell from the case.", "Random freezes, and it takes a few tries to start in the morning."] },
        { desc: "No POST, no beep — dead system board", laborHours: 2.5, complaints: ["Absolutely nothing on screen — not even a beep.", "The fans spin, but it never even tries to start."] },
        { desc: "Ports failing one by one", laborHours: 2, complaints: ["First the printer port died, now another one. It's spreading.", "Things I plug in stopped being recognized, one by one."] },
        { desc: "Corroded traces from a leaked clock battery", laborHours: 3, complaints: ["It forgets the date, and it's acting stranger every week.", "There's crusty blue fuzz inside near the bottom. Is that bad?"] },
        { desc: "Intermittent board — boots every third try", laborHours: 2, complaints: ["It starts maybe one time in three.", "Some mornings it boots, some mornings it just sits there."] }
      ],
      cpu: [
        { desc: "Processor dead — powers on but never runs", laborHours: 1.5, complaints: ["It powers up but never actually starts doing anything.", "Lights and fans, but the screen never wakes up."] },
        { desc: "Overheating processor throttling the machine", laborHours: 1, complaints: ["It gets slower and slower the longer it runs.", "After an hour it's crawling, and the case is hot to the touch."] },
        { desc: "Bent pins after a botched home upgrade", laborHours: 2, complaints: ["I tried an upgrade myself. It has not gone well.", "After my little DIY project it won't start at all. Please don't judge."] },
        { desc: "Processor failing under load — math errors", laborHours: 1.5, complaints: ["Big spreadsheets come out with wrong numbers, then it locks up.", "Heavy work makes it freeze or spit out errors."] }
      ],
      cooling: [
        { desc: "Seized fan; machine shuts down in minutes", laborHours: 0.5, complaints: ["It shuts itself down after a few minutes, every single time.", "It runs briefly, gets hot, and quits."] },
        { desc: "Heatsink clogged with years of dust", laborHours: 1, complaints: ["It's hotter and louder than it's ever been.", "The vents barely blow any air and the whole desk warms up."] },
        { desc: "Snapped mounting bracket, cooler hanging loose", laborHours: 1, complaints: ["Something came loose inside — I can hear it shift when I move it.", "There was a crack sound; now it overheats almost instantly."] },
        { desc: "Fan bearing whine", laborHours: 0.5, complaints: ["A high-pitched whine that's driving the whole office mad.", "It whines like a mosquito the entire time it's on."] }
      ],
      laborOnly: [
        { desc: "Loose seating on expansion cards", laborHours: 1, complaints: ["Sometimes it starts perfectly; sometimes half of it is missing.", "It works if I thump the case. I know I shouldn't thump the case."] },
        { desc: "Cable worked itself loose inside the case", laborHours: 0.5, complaints: ["It stopped seeing one of its own pieces mid-week.", "It rattled around in the car and hasn't been right since."] },
        { desc: "Jumpers set wrong after a DIY upgrade attempt", laborHours: 1, complaints: ["I changed some little switches inside. It got worse.", "After my upgrade attempt it thinks it's a different machine entirely."] },
        { desc: "Connector pins bent and shorting on the chassis", laborHours: 1, complaints: ["It crashes whenever anything bumps the desk.", "Nudge the case and it dies instantly. Every time."] },
        { desc: "Drive cable installed backwards", laborHours: 0.5, complaints: ["I reconnected everything after cleaning. Now: nothing.", "It won't start since I had the cover off. The light just blinks at me."] },
        { desc: "Corrupted configuration; setup needs rebuilding", laborHours: 1.5, complaints: ["It asks me strange questions at startup now.", "Every morning it forgets what it is and demands 'setup'."] },
        { desc: "Dead clock battery lost the machine's settings", laborHours: 0.5, complaints: ["It thinks it's January 1980 every single morning.", "It forgets the time and its settings whenever it's unplugged."] },
        { desc: "Loose screw shorting on the system board", laborHours: 0.5, complaints: ["Something metallic slides around inside when I move it.", "There's a rattle, and now it dies if I tilt the case."] }
      ]
    },
    machineAdjectives: [
      "dusty", "smoke-stained", "barn-find", "office-surplus", "coffee-splashed", "yellowed",
      "sun-faded", "sticker-covered", "garage-kept", "flood-salvaged", "estate-sale", "school-surplus",
      "cigarette-tarred", "attic-fresh", "well-loved", "mystery-box"
    ],
    // v2 (§9.2): blurbs are { text, customers: [customerTypeIds] | null } — null = fits anyone.
    jobBlurbs: {
      repair: [
        { text: "It makes a horrible noise and then just... stops. Please tell me it's cheap.", customers: null },
        { text: "It smells like burning plastic when I turn it on. That's bad, right?", customers: null },
        { text: "It was working fine last night, and this morning — nothing. We invoice on this machine!", customers: ["smallbiz", "office"] },
        { text: "The front desk computer is dead and customers are staring at us.", customers: ["smallbiz", "office"] },
        { text: "The screen went black mid-game and never came back. I've tried turning it off and on. Twice.", customers: ["gamer", "student"] },
        { text: "It crashed during finals week and won't even start. My whole semester is on there.", customers: ["student"] },
        { text: "My kid says it's 'toast.' I need a second opinion from a professional.", customers: ["home", "senior"] },
        { text: "It died mid-render and the client call is Thursday. Save me.", customers: ["creator"] },
        { text: "One of my rigs dropped offline overnight. Every hour down is money burned.", customers: ["miner"] },
        { text: "I've soldered a few things in my day, but this one has me beat.", customers: ["hobbyist", "senior"] }
      ],
      upgrade: [
        { text: "It takes five minutes to open anything. Make it faster, whatever it takes.", customers: null },
        { text: "The new software says my machine doesn't meet 'minimum requirements.' Rude, but fix it.", customers: null },
        { text: "Everyone says I need more memory. I don't know what that means, but here's the machine.", customers: ["home", "senior"] },
        { text: "My nephew says this thing is a dinosaur. Modernize it — within reason.", customers: ["senior", "home"] },
        { text: "I just need it to run one specific program. The box lists things I don't own.", customers: ["office", "smallbiz"] },
        { text: "Payroll software update says we're 'below spec' now. It runs the whole office, so fix it fast.", customers: ["smallbiz", "office"] },
        { text: "The new game launches Friday and my frame rate is a war crime. Upgrade me.", customers: ["gamer", "student"] },
        { text: "My exports take all night. More cores, more memory, whatever eats the render queue.", customers: ["creator"] },
        { text: "I want to try the new algorithm but my cards need a better platform under them.", customers: ["miner", "hobbyist"] }
      ],
      build: [
        { text: "Build it like you'd build your own. That's the whole spec.", customers: null },
        { text: "Here's my budget. Every dollar past it comes out of my vacation fund, so don't.", customers: null },
        { text: "I've saved up all year for this. Build me something that'll turn heads.", customers: ["gamer", "student", "creator"] },
        { text: "My friend's machine loads everything instantly. I want to beat it. Comfortably.", customers: ["gamer", "student"] },
        { text: "I need a machine for the office — reliable, boring, and on budget. Surprise me with neither.", customers: ["office", "smallbiz"] },
        { text: "Something simple for email and the grandkids' photos. Big text, please.", customers: ["senior", "home"] },
        { text: "Family machine for homework and taxes. If it survives the kids, it's a win.", customers: ["home"] },
        { text: "I need it to edit video without sounding like a leaf blower. Storage. Lots of storage.", customers: ["creator"] },
        { text: "A tinker box — something I can open up and fiddle with on weekends without crying.", customers: ["hobbyist"] },
        { text: "Max cards, minimum everything else. It lives in the garage; looks don't matter.", customers: ["miner"] }
      ],
      data_recovery: [
        { text: "I deleted the wrong folder and then, in a panic, I made it worse.", customers: null },
        { text: "The drive fell off the desk. It was on. I know, I know.", customers: null },
        { text: "My thesis is on that drive. My ONLY copy. Please. I'm begging you.", customers: ["student"] },
        { text: "Ten years of family photos. The drive just clicks now. Whatever it costs.", customers: ["home", "senior"] },
        { text: "Forty years of letters and my address book. My son says it's probably gone. Prove him wrong.", customers: ["senior"] },
        { text: "Our accounts are on there and tax season starts Monday.", customers: ["smallbiz", "office"] },
        { text: "The customer database died with the drive. We're back to paper and panic.", customers: ["smallbiz", "office"] },
        { text: "Three years of raw footage on one drive. Yes, I know. I KNOW. Please help.", customers: ["creator"] },
        { text: "My wallet keys are on that disk. I will pay you a percentage. A generous one.", customers: ["miner", "hobbyist"] }
      ],
      software: [
        { text: "There are seventeen toolbars in my browser and I installed exactly none of them.", customers: null },
        { text: "Fresh start, please. Wipe it and set it up like new — but keep my stuff.", customers: null },
        { text: "It's asking me to pay money to unlock my own files. This is extortion. Fix it.", customers: ["smallbiz", "office", "home"] },
        { text: "Pop-ups. So many pop-ups. It beeps at me even when it's off. I think.", customers: ["senior", "home"] },
        { text: "My grandson installed 'a few games' and now nothing works.", customers: ["senior"] },
        { text: "Something's mining on my machine and it isn't me. Get it out.", customers: ["gamer", "miner", "student"] },
        { text: "My plugins fight each other and the whole suite crashes on export. Untangle it.", customers: ["creator", "hobbyist"] },
        { text: "Every machine in the office got the same weird email. One of us clicked it. Guess whose computer I'm carrying.", customers: ["office", "smallbiz"] },
        { text: "I tried installing a second operating system and now there's only a blinking cursor.", customers: ["hobbyist", "student"] }
      ],
      cleaning: [
        { text: "I opened the case to look inside and closed it immediately. You need to see this.", customers: null },
        { text: "It sounds like a hair dryer and heats the whole room. Just clean it, please.", customers: null },
        { text: "It shuts itself off when it gets hot. Summer's coming. Help.", customers: null },
        { text: "The cat sleeps on it. Draw your own conclusions.", customers: ["home", "senior"] },
        { text: "There may or may not be a decade of cigarette smoke in there. There is.", customers: ["home", "hobbyist", "senior"] },
        { text: "My rig's temps creep up every match. I need airflow, not excuses.", customers: ["gamer", "student"] },
        { text: "The render box breathes dust like a dragon. Make it quiet before the voiceover session.", customers: ["creator"] },
        { text: "Shop floor dust got into everything. The quote machine wheezes louder than the compressor.", customers: ["smallbiz", "office"] },
        { text: "These cards have been running hot for two years straight. Deep-clean the lot.", customers: ["miner"] }
      ],
      peripheral: [
        { text: "The printer eats every third page and I've started taking it personally.", customers: null },
        { text: "The monitor flickers until I smack it. I'd like a more professional solution.", customers: null },
        { text: "My modem dials, screams, and gives up. I hear that's not normal anymore.", customers: ["home", "senior"] },
        { text: "Half the keys stick and the spacebar needs a running start.", customers: ["home", "office"] },
        { text: "The screen's gone all green and wavy. It's like working inside an aquarium.", customers: ["office", "senior"] },
        { text: "Invoices come out striped. The customers think it's a design choice. It is not.", customers: ["smallbiz"] },
        { text: "Reception's monitor buzzes like a wasp. It's all anyone can hear on the phone.", customers: ["office", "smallbiz"] },
        { text: "The grandchildren set the printer to Dutch, I think. It also no longer prints.", customers: ["senior", "home"] }
      ],
      enthusiast: [
        { text: "Quiet, cold, and fast. Pick all three, that's why I'm paying a professional.", customers: null },
        { text: "I've overclocked it myself and now it won't boot. Make it go faster anyway.", customers: null },
        { text: "I want every last megahertz this thing can give. Warranty is a suggestion.", customers: ["gamer", "hobbyist"] },
        { text: "Make it faster than my brother's. That's the entire specification.", customers: ["gamer", "student"] },
        { text: "I saw a build online with lights everywhere. I want that, but tasteful. But lights everywhere.", customers: ["gamer", "student", "creator"] },
        { text: "The stream needs a glow-up. Make the case the star of the background shot.", customers: ["creator"] },
        { text: "Undervolt them all. Every watt saved is pure margin.", customers: ["miner"] },
        { text: "I read a forum thread about delidding. I'm not brave enough, but you might be.", customers: ["hobbyist"] }
      ],
      contract: [
        { text: "We're outfitting the whole office. Identical machines, on time, no drama.", customers: ["office", "smallbiz"] },
        { text: "The school board approved the budget. Twelve machines by end of month.", customers: ["office"] },
        { text: "Our firm is expanding — we need workstations for the new hires, all the same spec.", customers: ["office", "smallbiz"] },
        { text: "Corporate says buy local. Congratulations, you're local. Here's the purchase order.", customers: ["smallbiz", "office"] },
        { text: "Every register in the shop gets replaced this quarter. Quote me the lot.", customers: ["smallbiz"] }
      ]
    },
    // v0.3 (§10.5): every item carries kind + symptom complaints + diagnosis-reveal faultDescs.
    peripheralItems: [
      { name: "dot-matrix printer", kind: "printer", minYear: 1979, maxYear: 1996,
        complaints: ["It jams every few pages and shreds the paper.", "The print's gotten so faint you can barely read it."],
        faultDescs: ["Worn platen and shredded feed tractors", "Dried-out ribbon path and misaligned print head"] },
      { name: "daisy-wheel printer", kind: "printer", minYear: 1979, maxYear: 1990,
        complaints: ["It types over the same spot until the paper tears.", "It stops mid-letter and just hums angrily."],
        faultDescs: ["Stripped carriage drive gear", "Jammed daisy wheel and a tired hammer solenoid"] },
      { name: "CRT monitor", kind: "crt", crt: true, minYear: 1979, maxYear: 2006,
        complaints: ["The picture shrank to one bright line across the middle.", "It crackles, and there's a faint electrical smell."],
        faultDescs: ["Failing flyback transformer", "Vertical deflection circuit failure"] },
      { name: "green-screen terminal monitor", kind: "crt", crt: true, minYear: 1979, maxYear: 1992,
        complaints: ["The text swims and wobbles like it's underwater.", "It takes half an hour before the picture settles down."],
        faultDescs: ["Drifting deflection capacitors", "Cold solder joints on the drive board"] },
      { name: "acoustic-coupler modem", kind: "modem", minYear: 1979, maxYear: 1986,
        complaints: ["It connects, then drops the moment anyone talks nearby.", "All I ever get is screeching — never a connection."],
        faultDescs: ["Perished rubber cups leaking room noise", "Drifted carrier-detect circuit"] },
      { name: "external dial-up modem", kind: "modem", minYear: 1982, maxYear: 2004,
        complaints: ["It dials, screams, and gives up. Every time.", "It worked fine at the old house. Not here."],
        faultDescs: ["Lightning-damaged line transformer", "Corroded phone-jack contacts and mangled settings"] },
      { name: "mechanical keyboard", kind: "input", minYear: 1979,
        complaints: ["Half the keys need a hammer blow to register.", "The spacebar sticks and then repeats forever."],
        faultDescs: ["Decades of crumbs and oxidized contacts", "Cracked stabilizer and worn switch springs"] },
      { name: "serial mouse", kind: "input", minYear: 1983, maxYear: 1999,
        complaints: ["The pointer leaps around the screen like a flea.", "It only tracks in one direction now."],
        faultDescs: ["Filthy rollers and a worn ball", "Cracked encoder wheel"] },
      { name: "inkjet printer", kind: "printer", minYear: 1990,
        complaints: ["Everything prints in stripes.", "It says it's printing. Nothing ever comes out."],
        faultDescs: ["Clogged print head needing a deep clean", "Failed carriage belt and dried nozzles"] },
      { name: "laser printer", kind: "printer", minYear: 1985,
        complaints: ["Every page has the same gray smudge down one side.", "It grinds loudly and jams halfway through every job."],
        faultDescs: ["Worn drum and dirty transfer corona", "Failed fuser roller and pickup clutch"] },
      { name: "flatbed scanner", kind: "scanner", minYear: 1988,
        complaints: ["Every scan has the same line through it.", "It whirs, clunks, and gives up before finishing."],
        faultDescs: ["Dirty optics and a failing lamp", "Slipping carriage belt"] },
      { name: "CD-ROM drive", kind: "other", minYear: 1992, maxYear: 2012,
        complaints: ["It spins up, clunks, and spits the disc back out.", "It only reads discs on the third or fourth try."],
        faultDescs: ["Failed laser sled mechanism", "Dirty lens and a worn spindle motor"] },
      { name: "Zip drive", kind: "other", minYear: 1995, maxYear: 2003,
        complaints: ["It clicks over and over and then eats the cartridge.", "Disks that worked yesterday come up unreadable today."],
        faultDescs: ["The infamous click-of-death head failure", "Misaligned heads chewing cartridges"] },
      { name: "LCD monitor", kind: "lcd", minYear: 1999,
        complaints: ["The picture is there, but it's almost too dark to see.", "It flickers pink for ten minutes, then settles down."],
        faultDescs: ["Failing backlight and inverter", "Bulging capacitors on the power board"] },
      { name: "webcam", kind: "other", minYear: 1999,
        complaints: ["Everyone says I look like a ghost in a fog bank.", "It disconnects mid-call. Every call."],
        faultDescs: ["Failed sensor board", "Broken strain relief and a flaky connector"] },
      { name: "wireless router", kind: "other", minYear: 2001,
        complaints: ["The internet dies every evening at eight sharp.", "It works right next to it, but not in the next room."],
        faultDescs: ["Overheating and crashing under load", "Failed antenna amplifier stage"] },
      { name: "USB flash drive", kind: "other", minYear: 2002,
        complaints: ["The computer wants to format it. My files are ON there!", "It has to be wiggled at a precise angle before anything sees it."],
        faultDescs: ["Cracked solder on the connector", "Failing controller — data still recoverable"] },
      { name: "gaming headset", kind: "other", minYear: 2008,
        complaints: ["Only one ear works unless I hold the cable just right.", "My teammates say I sound like a robot underwater."],
        faultDescs: ["Broken wire at the jack strain relief", "Failed microphone capsule"] },
      { name: "USB microphone", kind: "other", minYear: 2010,
        complaints: ["There's a hum underneath everything I record.", "It cuts to dead silence at random."],
        faultDescs: ["Ground-loop hum from a cracked shield joint", "Failing interface board"] },
      { name: "ultrawide monitor", kind: "lcd", minYear: 2015,
        complaints: ["One half of the screen is dimmer than the other.", "It flashes black for a second, several times an hour."],
        faultDescs: ["Failing backlight zone driver", "Loose internal video board connection"] }
    ],
    // v0.3 (§10.7): candidate name pool for the staff market.
    staffNames: [
      "Marty Kowalczyk", "Renee Okafor", "Gus Tremblay", "Dolores Pham", "Big Ed Rutkowski",
      "Sal DiMarco", "June Nakagawa", "Herb Callahan", "Rosa Villanueva", "Ted Brzezinski",
      "Winnie Achebe", "Cliff Sandoval", "Marge Halvorsen", "Dewey Watts", "Anh Truong",
      "Bernice Kaplan", "Otis Redfield", "Paulina Cruz", "Vern Osterberg", "Kenji Morita",
      "Lucille Draper", "Ray-Ray Jefferson", "Ingrid Halloran", "Mo Farouk", "Betsy Lindstrom",
      "Chip Delacroix", "Yolanda Reyes", "Stu Grabowski", "Priyanka Rao", "Wendell Fontaine"
    ],
    shopNameSuggestions: [
      "Circuit & Solder", "The Byte Shop", "Silicon Alley Repair", "Motherboard Medics",
      "Chips & Tips Computing", "The Blue Screen Clinic", "Kilobyte Corner", "TurboTech Services",
      "Golden Screwdriver PC", "Cache & Carry Computers", "Reboot Repair Co.", "The Soldering Iron",
      "Downtown Data Works", "Front Panel Computing", "Iron Case PC Lab", "Warm Boot Workshop"
    ]
  };

  // §10.1 — step-based task templates. Most-specific match wins:
  // type exact; partCategory/subtype exact-or-null; minYear/maxYear window.
  // Step-level minYear/maxYear filter steps by job year; cond: "cooler"|"crt-kit" resolved by engine.
  DATA.TASK_STEPS = [
    // ---------------- repair (per fault category) ----------------
    { type: "repair", partCategory: "cpu", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Open case & ground yourself", hours: 0.25 },
      { label: "Isolate fault to the processor", hours: 0.25 },
      { label: "Remove CPU cooler", hours: 0.25, cond: "cooler", minYear: 1990 },
      { label: "Swap processor", hours: 0.5 },
      { label: "Set clock & jumper settings", hours: 0.25, maxYear: 1997 },
      { label: "Update BIOS & microcode", hours: 0.25, minYear: 1995 },
      { label: "Reassemble & POST test", hours: 0.5 }
    ] },
    { type: "repair", partCategory: "ram", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Open case & ground yourself", hours: 0.25 },
      { label: "Run memory diagnostic to find bad bank", hours: 0.5 },
      { label: "Reseat modules & clean contacts", hours: 0.25 },
      { label: "Replace faulty memory", hours: 0.25 },
      { label: "Set DIP switches & verify count", hours: 0.25, maxYear: 1993 },
      { label: "Full memory test pass & close up", hours: 0.5 }
    ] },
    { type: "repair", partCategory: "storage", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Attempt emergency data backup", hours: 0.5 },
      { label: "Replace failed drive", hours: 0.5 },
      { label: "Low-level format & set interleave", hours: 0.5, maxYear: 1991 },
      { label: "Partition, format & restore data", hours: 0.75 },
      { label: "Clone image onto new drive", hours: 0.5, minYear: 2010 },
      { label: "Verify boot & surface scan", hours: 0.25 }
    ] },
    { type: "repair", partCategory: "gpu", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Test with known-good display & cable", hours: 0.25 },
      { label: "Replace video card", hours: 0.5 },
      { label: "Set display switches & jumpers", hours: 0.25, maxYear: 1997 },
      { label: "Install video drivers", hours: 0.5, minYear: 1995 },
      { label: "Test all display modes", hours: 0.5 }
    ] },
    { type: "repair", partCategory: "psu", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Test rails with a meter", hours: 0.5 },
      { label: "Replace power supply", hours: 0.5 },
      { label: "Route & tidy power cabling", hours: 0.25 },
      { label: "Full-load stability test", hours: 0.5 }
    ] },
    { type: "repair", partCategory: "motherboard", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Strip machine to the bench", hours: 0.75 },
      { label: "Inspect board & read POST codes", hours: 0.5 },
      { label: "Swap system board", hours: 0.75 },
      { label: "Transfer CPU, memory & cards", hours: 0.5 },
      { label: "Set board jumpers & switches", hours: 0.25, maxYear: 1997 },
      { label: "Configure BIOS & boot order", hours: 0.25, minYear: 1995 },
      { label: "Rebuild & burn-in", hours: 0.75 }
    ] },
    { type: "repair", partCategory: "cooling", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Open case & inspect airflow path", hours: 0.25 },
      { label: "Replace failed fan or cooler", hours: 0.5 },
      { label: "Apply fresh thermal compound", hours: 0.25, minYear: 1993 },
      { label: "Temperature test under load", hours: 0.25 }
    ] },
    { type: "repair", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [ // laborOnly & fallback
      { label: "Interview customer & log symptoms", hours: 0.25 },
      { label: "Open case & inspect", hours: 0.25 },
      { label: "Reseat cards, cables & connectors", hours: 0.5 },
      { label: "Clean contacts & correct settings", hours: 0.25 },
      { label: "POST test & burn-in", hours: 0.5 }
    ] },
    // ---------------- upgrade (per category) ----------------
    { type: "upgrade", partCategory: "ram", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Confirm upgrade goal with customer", hours: 0.25 },
      { label: "Open case & ground yourself", hours: 0.25 },
      { label: "Install memory upgrade", hours: 0.25 },
      { label: "Set DIP switches & verify count", hours: 0.25, maxYear: 1993 },
      { label: "Run full memory diagnostic", hours: 0.5 },
      { label: "Close up & document new spec", hours: 0.25 }
    ] },
    { type: "upgrade", partCategory: "storage", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Confirm upgrade goal with customer", hours: 0.25 },
      { label: "Back up user data", hours: 0.5 },
      { label: "Mount & cable new drive", hours: 0.25 },
      { label: "Set master/slave jumpers", hours: 0.25, minYear: 1986, maxYear: 2005 },
      { label: "Partition & format", hours: 0.5 },
      { label: "Migrate system to new drive", hours: 0.5, minYear: 2010 },
      { label: "Verify boot & restore data", hours: 0.25 }
    ] },
    { type: "upgrade", partCategory: "gpu", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Confirm upgrade goal with customer", hours: 0.25 },
      { label: "Remove old video card", hours: 0.25 },
      { label: "Install new video card", hours: 0.25 },
      { label: "Set display switches & jumpers", hours: 0.25, maxYear: 1994 },
      { label: "Install drivers & set display modes", hours: 0.5, minYear: 1995 },
      { label: "Benchmark before & after", hours: 0.5, minYear: 1997 },
      { label: "Verify output & close up", hours: 0.25 }
    ] },
    { type: "upgrade", partCategory: "cpu", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Confirm upgrade goal with customer", hours: 0.25 },
      { label: "Remove CPU cooler", hours: 0.25, cond: "cooler", minYear: 1990 },
      { label: "Swap processor", hours: 0.5 },
      { label: "Set bus & multiplier jumpers", hours: 0.25, maxYear: 1997 },
      { label: "Update BIOS", hours: 0.5, minYear: 1995 },
      { label: "Stress test & verify speed", hours: 0.5 }
    ] },
    { type: "upgrade", partCategory: "psu", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Confirm upgrade goal with customer", hours: 0.25 },
      { label: "Remove old supply", hours: 0.25 },
      { label: "Fit & wire new supply", hours: 0.5 },
      { label: "Tidy cabling for airflow", hours: 0.25 },
      { label: "Full-load test", hours: 0.25 }
    ] },
    { type: "upgrade", partCategory: "cooling", subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Confirm upgrade goal with customer", hours: 0.25 },
      { label: "Remove old cooler", hours: 0.25 },
      { label: "Clean mount & apply fresh compound", hours: 0.25 },
      { label: "Fit new cooling", hours: 0.25 },
      { label: "Thermal test under load", hours: 0.5 }
    ] },
    { type: "upgrade", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Confirm upgrade goal with customer", hours: 0.25 },
      { label: "Open case & prep", hours: 0.25 },
      { label: "Install upgrade", hours: 0.5 },
      { label: "Configure & test", hours: 0.5 }
    ] },
    // ---------------- build / enthusiast ----------------
    { type: "build", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Review parts list against the brief", hours: 0.5 },
      { label: "Prep case & fit standoffs", hours: 0.25 },
      { label: "Install power supply", hours: 0.25 },
      { label: "Assemble board, CPU & memory", hours: 0.75 },
      { label: "Mount board in case", hours: 0.5 },
      { label: "Install drives", hours: 0.25 },
      { label: "Install video & expansion cards", hours: 0.25 },
      { label: "Cable up & tidy", hours: 0.5 },
      { label: "First POST & setup", hours: 0.25 },
      { label: "Set jumpers & CMOS options", hours: 0.25, maxYear: 1997 },
      { label: "Install operating system", hours: 0.75 },
      { label: "Install drivers & updates", hours: 0.5, minYear: 1995 },
      { label: "Benchmark & validate targets", hours: 0.25, minYear: 1997 },
      { label: "Final QC & handoff", hours: 0.25 }
    ] },
    { type: "enthusiast", partCategory: null, subtype: "overclock", minYear: null, maxYear: null, steps: [
      { label: "Agree goals & risks with customer", hours: 0.25 },
      { label: "Record baseline benchmarks", hours: 0.5 },
      { label: "Raise clocks stepwise", hours: 0.75 },
      { label: "Tune voltage & cooling", hours: 0.5 },
      { label: "Torture test for stability", hours: 1.0 },
      { label: "Final benchmark & report card", hours: 0.5 }
    ] },
    { type: "enthusiast", partCategory: null, subtype: "aesthetic", minYear: null, maxYear: null, steps: [
      { label: "Plan theme & layout with customer", hours: 0.5 },
      { label: "Strip & prep the case", hours: 0.5 },
      { label: "Install lighting & fans", hours: 0.75 },
      { label: "Custom-route & comb cables", hours: 0.75 },
      { label: "Sync lighting profiles", hours: 0.5, minYear: 2016 },
      { label: "Glamour check & handoff", hours: 0.25 }
    ] },
    { type: "enthusiast", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Agree goals with customer", hours: 0.25 },
      { label: "Baseline the machine", hours: 0.5 },
      { label: "Perform the tuning work", hours: 1.0 },
      { label: "Stability test & report", hours: 0.75 }
    ] },
    // ---------------- refurb / callback / contract ----------------
    { type: "refurb", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Intake assessment & valuation", hours: 0.5 },
      { label: "Strip down & deep clean", hours: 0.75 },
      { label: "Replace the faulty part", hours: 0.75 },
      { label: "Reseat & service everything else", hours: 0.5 },
      { label: "Fresh OS & era software load", hours: 0.75 },
      { label: "Overnight burn-in checklist", hours: 0.5 },
      { label: "Polish, price & shelf", hours: 0.25 }
    ] },
    { type: "callback", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Review original work ticket", hours: 0.25 },
      { label: "Reproduce the complaint", hours: 0.5 },
      { label: "Rework the fault properly", hours: 0.75 },
      { label: "Extended re-test", hours: 0.5 },
      { label: "Apology & careful handoff", hours: 0.25 }
    ] },
    { type: "contract", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Stage parts for the unit", hours: 0.5 },
      { label: "Assemble unit to spec sheet", hours: 1.0 },
      { label: "Load standard software image", hours: 0.5 },
      { label: "Label & asset-tag", hours: 0.25 },
      { label: "QC checklist & sign-off", hours: 0.5 }
    ] },
    // ---------------- software ----------------
    { type: "software", partCategory: null, subtype: "os_install", minYear: null, maxYear: null, steps: [
      { label: "Back up user data", hours: 0.5 },
      { label: "Wipe & partition", hours: 0.25 },
      { label: "Install operating system", hours: 0.75 },
      { label: "Install drivers & updates", hours: 0.5, minYear: 1995 },
      { label: "Restore data & settings", hours: 0.5 },
      { label: "Final checks & handoff notes", hours: 0.25 }
    ] },
    { type: "software", partCategory: null, subtype: "virus", minYear: null, maxYear: null, steps: [
      { label: "Interview & isolate the machine", hours: 0.25 },
      { label: "Boot from clean media & scan", hours: 0.75 },
      { label: "Remove infection & repair system files", hours: 0.75 },
      { label: "Patch & harden the system", hours: 0.25, minYear: 1998 },
      { label: "Verify clean & brief the customer", hours: 0.5 }
    ] },
    { type: "software", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Interview & note the misbehavior", hours: 0.25 },
      { label: "Clean up & reconfigure software", hours: 0.75 },
      { label: "Test the customer's workflow", hours: 0.5 },
      { label: "Write up what changed", hours: 0.25 }
    ] },
    // ---------------- cleaning ----------------
    { type: "cleaning", partCategory: null, subtype: "thermal_paste", minYear: null, maxYear: null, steps: [
      { label: "Intake & temperature baseline", hours: 0.25 },
      { label: "Remove cooler", hours: 0.25 },
      { label: "Clean off old compound", hours: 0.25 },
      { label: "Apply fresh paste & remount", hours: 0.25 },
      { label: "Before/after thermal comparison", hours: 0.5 }
    ] },
    { type: "cleaning", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Intake & photos", hours: 0.25 },
      { label: "Blow out dust (outside!)", hours: 0.5 },
      { label: "Clean fans & filters", hours: 0.25 },
      { label: "Tidy cabling for airflow", hours: 0.25 },
      { label: "Thermal check & handoff", hours: 0.25 }
    ] },
    // ---------------- data recovery (era media) ----------------
    { type: "data_recovery", partCategory: null, subtype: null, minYear: null, maxYear: 1994, steps: [
      { label: "Assess media & drive condition", hours: 0.5 },
      { label: "Clean heads & check alignment", hours: 0.5 },
      { label: "Sector-by-sector rescue copy", hours: 0.75 },
      { label: "Patch FAT & carve lost files", hours: 0.75 },
      { label: "Verify & copy out to fresh disks", hours: 0.5 }
    ] },
    { type: "data_recovery", partCategory: null, subtype: null, minYear: 1995, maxYear: 2009, steps: [
      { label: "Assess drive & SMART readout", hours: 0.5 },
      { label: "Image drive to the bench machine", hours: 1.0 },
      { label: "Swap PCB or heads if needed", hours: 0.75 },
      { label: "Rebuild partition table & carve files", hours: 0.75 },
      { label: "Verify & deliver on new media", hours: 0.5 }
    ] },
    { type: "data_recovery", partCategory: null, subtype: null, minYear: 2010, maxYear: null, steps: [
      { label: "Assess drive & controller state", hours: 0.5 },
      { label: "Image the flash before it fades", hours: 0.75 },
      { label: "Chip-off / controller-level work", hours: 1.0 },
      { label: "Reconstruct filesystem & carve files", hours: 0.75 },
      { label: "Verify & hand off on new media", hours: 0.5 }
    ] },
    // ---------------- peripheral (per kind) ----------------
    { type: "peripheral", partCategory: null, subtype: "printer", minYear: null, maxYear: null, steps: [
      { label: "Intake & test print", hours: 0.25 },
      { label: "Clean rollers, head & paper path", hours: 0.5 },
      { label: "Replace worn feed & wear parts", hours: 0.5 },
      { label: "Align & calibrate", hours: 0.25 },
      { label: "Test pages & handoff", hours: 0.25 }
    ] },
    { type: "peripheral", partCategory: null, subtype: "crt", minYear: null, maxYear: null, steps: [
      { label: "Intake & symptom check", hours: 0.25 },
      { label: "Discharge tube & verify zero voltage", hours: 0.25, cond: "crt-kit" },
      { label: "Open back & inspect HV section", hours: 0.5 },
      { label: "Replace failed flyback/section parts", hours: 0.75 },
      { label: "Adjust focus & geometry", hours: 0.5 },
      { label: "Soak test", hours: 0.5 }
    ] },
    { type: "peripheral", partCategory: null, subtype: "lcd", minYear: null, maxYear: null, steps: [
      { label: "Intake & symptom check", hours: 0.25 },
      { label: "Disassemble panel housing", hours: 0.5 },
      { label: "Replace backlight/inverter or driver board", hours: 0.75 },
      { label: "Reassemble", hours: 0.25 },
      { label: "Calibrate & dead-pixel check", hours: 0.25 }
    ] },
    { type: "peripheral", partCategory: null, subtype: "modem", minYear: null, maxYear: null, steps: [
      { label: "Intake & line test", hours: 0.25 },
      { label: "Check port config & init strings", hours: 0.25, maxYear: 2005 },
      { label: "Replace line-side components", hours: 0.5 },
      { label: "Flash firmware", hours: 0.25, minYear: 1996 },
      { label: "Connection & throughput test", hours: 0.25 }
    ] },
    { type: "peripheral", partCategory: null, subtype: "input", minYear: null, maxYear: null, steps: [
      { label: "Intake & fault confirmation", hours: 0.25 },
      { label: "Full teardown & clean", hours: 0.5 },
      { label: "Replace worn switches or rollers", hours: 0.5 },
      { label: "Lubricate & reassemble", hours: 0.25 },
      { label: "Key-by-key / tracking test", hours: 0.25 }
    ] },
    { type: "peripheral", partCategory: null, subtype: "scanner", minYear: null, maxYear: null, steps: [
      { label: "Intake & test scan", hours: 0.25 },
      { label: "Clean glass & optics", hours: 0.25 },
      { label: "Replace belt or lamp", hours: 0.5 },
      { label: "Recalibrate carriage", hours: 0.5 },
      { label: "Verify scan quality", hours: 0.25 }
    ] },
    { type: "peripheral", partCategory: null, subtype: "other", minYear: null, maxYear: null, steps: [
      { label: "Intake & inspect", hours: 0.25 },
      { label: "Disassemble & clean", hours: 0.5 },
      { label: "Replace failed component", hours: 0.5 },
      { label: "Reassemble & full test", hours: 0.5 }
    ] },
    { type: "peripheral", partCategory: null, subtype: null, minYear: null, maxYear: null, steps: [
      { label: "Intake & inspect", hours: 0.25 },
      { label: "Service & clean mechanism", hours: 0.5 },
      { label: "Replace worn parts", hours: 0.5 },
      { label: "Full function test", hours: 0.5 }
    ] },
    // ---------------- device repair (v0.4b §12.4: Apple & mobile) ----------------
    { type: "device_repair", partCategory: null, subtype: "apple", minYear: null, maxYear: 1997, steps: [
      { label: "Intake & symptom interview", hours: 0.25 },
      { label: "Crack the case (long Torx & case spreader)", hours: 0.5 },
      { label: "Discharge the built-in CRT", hours: 0.25, cond: "crt-kit" },
      { label: "Swap SIMMs / drive via SCSI chain", hours: 0.5 },
      { label: "Repair analog or logic board fault", hours: 0.75 },
      { label: "Reassemble & boot from System disks", hours: 0.5 }
    ] },
    { type: "device_repair", partCategory: null, subtype: "apple", minYear: 1998, maxYear: 2011, steps: [
      { label: "Intake & symptom interview", hours: 0.25 },
      { label: "Open case via panel or side door", hours: 0.25 },
      { label: "Swap RAM/drive through access bay", hours: 0.5 },
      { label: "Repair board, PSU or optical fault", hours: 0.75 },
      { label: "Reinstall Mac OS & updates", hours: 0.5 },
      { label: "Burn-in & handoff", hours: 0.25 }
    ] },
    { type: "device_repair", partCategory: null, subtype: "apple", minYear: 2012, maxYear: null, steps: [
      { label: "Intake & run Apple diagnostics", hours: 0.25 },
      { label: "Remove pentalobe screws & release lid", hours: 0.25 },
      { label: "Heat-gun the adhesive & free the battery", hours: 0.5 },
      { label: "Swap display/battery/board module", hours: 0.75 },
      { label: "Calibrate battery & verify sensors", hours: 0.5 },
      { label: "Reseal, torque check & handoff", hours: 0.25 }
    ] },
    { type: "device_repair", partCategory: null, subtype: "smartphone", minYear: null, maxYear: null, steps: [
      { label: "Intake & full-function test grid", hours: 0.25 },
      { label: "Heat & pry the screen assembly", hours: 0.5 },
      { label: "Pentalobe/tri-point teardown", hours: 0.25, minYear: 2011 },
      { label: "Ultrasonic-bath board clean", hours: 0.5, minYear: 2012 },
      { label: "Transfer components to the new part", hours: 0.5 },
      { label: "Reassemble & seal", hours: 0.25 },
      { label: "Battery calibration & final test grid", hours: 0.5 }
    ] },
    { type: "device_repair", partCategory: null, subtype: "tablet", minYear: null, maxYear: null, steps: [
      { label: "Intake & full-function test grid", hours: 0.25 },
      { label: "Heat-gun the adhesive frame", hours: 0.5 },
      { label: "Lift the glass with picks & suction", hours: 0.5 },
      { label: "Swap panel, battery or port flex", hours: 0.5 },
      { label: "Rebond, clamp & cure", hours: 0.5 },
      { label: "Battery calibration & final test", hours: 0.5 }
    ] }
  ];

})(typeof window !== 'undefined' ? window : globalThis);
