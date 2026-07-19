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
      "Ingrid", "Noah", "Fatima", "Ethan", "Rosa", "Caleb", "Nadia", "Jared", "Lucia", "Wes",
      // v0.9 §19.9(#17) — quiet nods to computing history; ordinary enough as first
      // names to combine with any surname and pass unnoticed
      "Ada", "Grace", "Vint"
    ],
    lastNames: [
      "Nguyen", "Kowalski", "Ramirez", "O'Brien", "Chen", "Petersen", "Washington", "Gutierrez", "Kaminski", "Blackwell",
      "Sato", "Fitzgerald", "Delgado", "Hoffman", "Okafor", "Lindqvist", "Marino", "Vasquez", "Sherman", "Park",
      "Whitaker", "Rosenberg", "Castillo", "Duffy", "Kim", "Novak", "Pearson", "Ortega", "Slater", "Huang",
      "McAllister", "Silva", "Brandt", "Tucker", "Reyes", "Olsen", "Faulkner", "Dominguez", "Weiss", "Choi",
      "Barnett", "Moreau", "Copeland", "Ferraro", "Singh", "Larsen", "Whitfield", "Mendoza", "Kirby", "Tanaka",
      "Holloway", "Beaumont", "Cruz", "Gallagher", "Patel", "Sorensen", "Mercer", "Ibarra", "Quinn", "Zhang",
      "Ashford", "Romano", "Drummond", "Espinoza", "Kaur", "Lindgren", "Prescott", "Navarro", "Stein", "Watts",
      // v0.9 §19.9(#17) — historical-computing surnames, ordinary enough to pass unnoticed
      "Babbage", "Turing", "Cray"
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
        { desc: "Random crashes and parity errors under load", laborHours: 1, complaints: ["It crashes at random and flashes some 'parity error' message at me.", "It falls over at random — worse the more I have open at once. One thing at a time seems fine.", "It falls over every time I try to run {SW}, though other things seem fine."] },
        { desc: "Memory count comes up short at boot", laborHours: 1, complaints: ["The number it counts up at startup looks smaller than it used to.", "Programs refuse to open, saying there isn't enough room to run."] },
        { desc: "Constant blue screens from a bad memory module", laborHours: 1.5, complaints: ["Blue screens. Constantly. A different message every time.", "Every hour or so the whole screen goes blue and it restarts itself."] },
        { desc: "Machine beeps endlessly and refuses to POST", laborHours: 1, complaints: ["It just beeps over and over and never starts up.", "Turn it on and it screams beeps at me. Nothing ever shows on screen."] },
        { desc: "Corrupted files from failing memory", laborHours: 2, complaints: ["Files I just saved come up scrambled — but everything from last year opens fine.", "Big copies come out mangled, and the same file copies differently every time I try."] }
      ],
      storage: [
        { desc: "Drive makes a rhythmic clicking and won't spin up", laborHours: 2, complaints: ["It makes this tick... tick... tick sound and never gets going.", "There's a rhythmic clicking from inside and the screen just waits forever."] },
        { desc: "Boot failure: operating system not found", laborHours: 1.5, complaints: ["It says 'operating system not found'. It found it fine last week.", "Black screen with a message about no system. I didn't change anything!"] },
        { desc: "Bad sectors spreading — drive dying", laborHours: 2, complaints: ["It freezes when opening certain files, and it's getting worse.", "Long pauses, odd noises, and now some folders won't open at all."] },
        { desc: "Drive vanishes from the system intermittently", laborHours: 1.5, complaints: ["Some days it boots right up; other days it claims there's nothing to boot from at all.", "My files disappear and reappear depending on its mood."] },
        { desc: "Grinding from the drive bay, files crawling", laborHours: 2, complaints: ["Horrible grinding noise and everything takes forever to open.", "It sounds like it's chewing gravel in there."] }
      ],
      gpu: [
        { desc: "No video output — dead video card", laborHours: 1, complaints: ["It starts with one long beep and two short ones, and nothing ever shows on the screen.", "Power light on, fans on, picture: none."] },
        { desc: "Garbage and artifacts all over the display", laborHours: 1.5, complaints: ["The screen fills with weird characters and colored confetti.", "Random blocks and squiggles all over everything I open."] },
        { desc: "Display cuts out when the machine warms up", laborHours: 2, complaints: ["The picture's fine for ten minutes, then it blinks out.", "The longer it runs, the worse the picture gets, until it just quits."] },
        { desc: "Vertical stripes from failing video hardware", laborHours: 1, complaints: ["There are colored stripes down the whole screen.", "Vertical lines everywhere — like looking through a picket fence."] },
        { desc: "3D crashes from failing video memory", laborHours: 1.5, complaints: ["Games quit to the desktop after a few minutes.", "Anything with graphics crashes; plain typing seems fine.", "{GAME} dumps me to the desktop after a few minutes, every time."] }
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
        { desc: "Processor dead — powers on but never runs", laborHours: 1.5, complaints: ["It powers up but never actually starts doing anything.", "The fans spin up to full blast and stay there roaring, but the screen never wakes up."] },
        { desc: "Overheating processor throttling the machine", laborHours: 1, complaints: ["It gets slower and slower the longer it runs.", "After an hour it's crawling, and the case is hot to the touch.", "Open {SW} and within minutes it slows to a crawl and the case bakes."] },
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
        { text: "I've soldered a few things in my day, but this one has me beat.", customers: ["hobbyist", "senior"] },
        { text: "The screen went black in the middle of {GAME} and never came back on.", customers: ["gamer", "student"] },
        { text: "It froze hard while I had {OFFICE} open and now it won't even start.", customers: ["smallbiz", "office"] }
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
        { text: "I want to try the new algorithm but my cards need a better platform under them.", customers: ["miner", "hobbyist"] },
        { text: "{GAME} runs like a slideshow on this thing. Fix that, please.", customers: ["gamer", "student"] },
        { text: "The new {OFFICE} update says we're below the minimum spec now. The whole office runs on it.", customers: ["office", "smallbiz"] },
        { text: "{CREATIVE} chokes the moment I load a big project. I need more machine under it.", customers: ["creator"] }
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
        { text: "Max cards, minimum everything else. It lives in the garage; looks don't matter.", customers: ["miner"] },
        { text: "It has to run {GAME} maxed out without breaking a sweat. That's the brief.", customers: ["gamer", "student"] },
        { text: "Something that flies through {CREATIVE} exports. Speed first, everything else second.", customers: ["creator"] }
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
        { text: "My wallet keys are on that disk. I will pay you a percentage. A generous one.", customers: ["miner", "hobbyist"] },
        { text: "Every {CREATIVE} project I've ever made was on that drive. It just clicks now.", customers: ["creator"] }
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
        { text: "I tried installing a second operating system and now there's only a blinking cursor.", customers: ["hobbyist", "student"] },
        { text: "Something broke and now {SW} crashes the second I open it. Everything else is fine.", customers: null }
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
        { text: "These cards have been running hot for two years straight. Deep-clean the lot.", customers: ["miner"] },
        { text: "My temps spike the second {GAME} loads in. It didn't used to do that.", customers: ["gamer", "student"] }
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
        { text: "I read a forum thread about delidding. I'm not brave enough, but you might be.", customers: ["hobbyist"] },
        { text: "I want a rock-solid framerate in {GAME} no matter how long I've been playing. Tune it.", customers: ["gamer", "student"] }
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
      "Chip Delacroix", "Yolanda Reyes", "Stu Grabowski", "Priyanka Rao", "Wendell Fontaine",
      // v0.9 §19.9(#17) — era-appropriate homages & puns; altered spellings keep them deniable
      "Ada Lovejoy", "Gary Kildare", "Linus Thorwald", "Steve Wozniacki",
      "Doug Engelbert", "Laura Kroft"
    ],
    shopNameSuggestions: [
      "Circuit & Solder", "The Byte Shop", "Silicon Alley Repair", "Motherboard Medics",
      "Chips & Tips Computing", "The Blue Screen Clinic", "Kilobyte Corner", "TurboTech Services",
      "Golden Screwdriver PC", "Cache & Carry Computers", "Reboot Repair Co.", "The Soldering Iron",
      "Downtown Data Works", "Front Panel Computing", "Iron Case PC Lab", "Warm Boot Workshop"
    ],
    // v0.6 (§15.4): local businesses for retainer/business-account offers.
    // Period-neutral small-town institutions — plausible clients any year 1983-2025.
    businessNames: [
      "Whitfield & Moss, Attorneys at Law", "Harborview Dental Group", "Lakeside Realty",
      "Grand Avenue Printing Co.", "TriCounty Insurance Agency", "Beacon Hill Accounting",
      "Sunrise Medical Clinic", "Miller's Hardware & Supply", "Valley Veterinary Clinic",
      "Fairway Motors", "The Daily Courier", "Redwood Architecture Studio",
      "Pinnacle Staffing Services", "Custom House Travel", "Northgate Public Library",
      "Delgado Bros. Construction"
    ],
    // §21.5 — client referral flavor: a high-loyalty client's referral (§21.1)
    // rebrands a fresh offer as "referred by <client>"; these lines carry that
    // credit in the client's own voice. Placeholder convention: curly-brace
    // tokens as elsewhere in this file ({SW}/{GAME}/...), here {name} resolved
    // by the engine to the referring client's name.
    referralBlurbs: [
      "{name} told everyone at the office you're the only shop worth calling.",
      "{name} says you fixed it right the first time, and that's rare enough to talk about.",
      "{name} wouldn't stop talking about the turnaround time and sent a friend your way.",
      "{name} swears by you now and figured somebody else deserved the same treatment.",
      "{name} passed your number along before the ink on the receipt was even dry.",
      "{name} has been telling anyone who'll listen that you're worth the drive.",
      "{name} vouched for you personally, which — knowing {name} — is not given lightly.",
      "{name} said you were the first shop that didn't talk down to them, and sent someone your way."
    ],
    // §21.5/§21.3 — business ecosystem news: monthly health-tick outcomes
    // (growth/shrink/churn) narrated with {name} (the account) and {seats}
    // (the seat count involved), same curly-brace placeholder style as the
    // {SW}/{GAME}/{OFFICE}/{CREATIVE} tokens above.
    businessNews: {
      growth: [
        "{name} just signed on {seats} more seats — seems your work made the rounds internally.",
        "Business is good at {name}: they're expanding by {seats} seats and crediting the shop that keeps their machines running.",
        "{name} added {seats} new positions this quarter, and every one of them needs a machine from you.",
        "Word around {name} is that reliable equipment finally let them grow — {seats} more seats, all yours to outfit.",
        "{name} is hiring again: {seats} more desks, {seats} more machines, and your name came up first."
      ],
      shrink: [
        "{name} is trimming down — {seats} seats gone quiet, and the machines that went with them.",
        "Belt-tightening at {name}: {seats} fewer seats this month, and fewer service calls to match.",
        "{name} let {seats} positions go. The remaining machines are still yours to keep running.",
        "{name} is downsizing by {seats} seats — a rough stretch, by the sound of it.",
        "Quiet at {name} lately: {seats} seats sit empty and the machines behind them are gathering dust."
      ],
      churn: [
        "{name} has closed the account. After {seats} seats' worth of neglected machines, they finally called someone else.",
        "{name} is gone — the account's canceled, all {seats} seats and all, and the last few service calls apparently weren't enough to save it.",
        "{name} pulled the account after one too many late repairs. {seats} seats, gone to a competitor.",
        "The retainer with {name} just ended. Hard to blame them, given how those {seats} seats had been running.",
        "{name} canceled outright. Whatever goodwill was left across {seats} unhappy seats finally ran out."
      ]
    },
    // §21.5/§21.1 — client loyalty tier labels (0..100 scale, era-neutral warm
    // wording, not gamey). CONFIG.LOYALTY_REGULAR (~40) is the engine's
    // "regular" threshold; the "Regular" tier below starts there by design.
    loyaltyTiers: [
      { minLoyalty: 0, label: "New face" },
      { minLoyalty: 20, label: "Repeat customer" },
      { minLoyalty: 40, label: "Regular" },
      { minLoyalty: 60, label: "Trusted regular" },
      { minLoyalty: 80, label: "Old friend" }
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
      { label: "Attempt emergency data backup", hours: 0.5, wait: true },
      { label: "Replace failed drive", hours: 0.5 },
      { label: "Low-level format & set interleave", hours: 0.5, maxYear: 1991 },
      { label: "Partition, format & restore data", hours: 0.75, wait: true },
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
      { label: "Swap system board", hours: 1.0 },
      { label: "Transfer CPU, memory & cards", hours: 0.5 },
      { label: "Set board jumpers & switches", hours: 0.25, maxYear: 1997 },
      { label: "Configure BIOS & boot order", hours: 0.25, minYear: 1995 },
      { label: "Rebuild & burn-in", hours: 1.0 }
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
      { label: "Back up user data", hours: 0.5, wait: true },
      { label: "Mount & cable new drive", hours: 0.5 },
      { label: "Set master/slave jumpers", hours: 0.25, minYear: 1986, maxYear: 2005 },
      { label: "Partition & format", hours: 0.5, wait: true },
      { label: "Migrate system to new drive", hours: 0.5, minYear: 2010, wait: true },
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
      { label: "Install operating system", hours: 0.75, wait: true },
      { label: "Install drivers & updates", hours: 0.5, minYear: 1995, wait: true },
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
      { label: "Fresh OS & era software load", hours: 0.75, wait: true },
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
      { label: "Back up user data", hours: 0.5, wait: true },
      { label: "Wipe & partition", hours: 0.25 },
      { label: "Install operating system", hours: 1.0, wait: true },
      { label: "Install drivers & updates", hours: 0.5, minYear: 1995, wait: true },
      { label: "Restore data & settings", hours: 0.5, wait: true },
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
      { label: "Open back & inspect HV section", hours: 0.75 },
      { label: "Replace failed flyback/section parts", hours: 1.0 },
      { label: "Adjust focus & geometry", hours: 0.75 },
      { label: "Soak test", hours: 0.75, wait: true }
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
      { label: "Rebond, clamp & cure", hours: 0.5, wait: true },
      { label: "Battery calibration & final test", hours: 0.5 }
    ] }
  ];


  // §13.2 — DATA.ARTICLES: long-form educational Wiki articles that unlock as the
  // calendar crosses each transition. Body is Markdown-lite: paragraphs separated by
  // \n\n, **bold**, and "- " bullet lines ONLY (UI renders a safe subset).
  // Housed here (not events.js) because it's long-form reference/flavor content, like
  // the rest of DATA.FLAVOR, rather than a dated feed.
  DATA.ARTICLES = [
    {
      id: "article-bus-wars",
      title: "The Expansion Bus Wars: ISA to PCIe",
      category: "buses",
      unlockYear: 2006,
      summary: "How the slot your graphics card plugs into went from an 8-bit ISA edge connector to a scalable PCIe lane, and why it took a genuine industry fight to get there.",
      body: "Every expansion card needs a road back to the CPU, and for the first decade of the PC that road was the 8-bit, then 16-bit, ISA bus. It was cheap and universal, but by the late 1980s graphics and hard-disk controllers were starving for bandwidth ISA simply couldn't provide.\n\nIBM tried to fix this on its own terms with the proprietary Micro Channel Architecture in 1987, charging licensing fees for the privilege of using it. The rest of the clone industry revolted: nine manufacturers, the so-called **Gang of Nine**, banded together in 1988 to publish EISA, an open standard that kept the ISA-compatible ecosystem alive without paying IBM a cent.\n\nThe next real leap came from a narrower, more urgent problem: 3D graphics. VESA Local Bus (VLB) briefly tied expansion slots directly to the 486's own memory bus for speed, but it was electrically fragile and short-lived. Intel's PCI, introduced in 1992 and mainstream by the mid-90s, replaced it with a properly engineered, CPU-independent bus that scaled far better — and it's still recognizable in spirit today.\n\nGraphics cards outgrew even PCI within a few years, so Intel carved out AGP in 1997 as a dedicated slot just for the video card, trading flexibility for a fast, direct path to memory. That, too, was eventually superseded: PCI Express, specified in 2002 and dominant by the mid-2000s, unified everything into a single scalable, point-to-point serial interconnect where a slot's bandwidth is just a matter of how many lanes it's wired with.\n\nA short list of what changed along the way:\n- ISA (1981): 8/16-bit, shared bus, slow but universal\n- MCA (1987): IBM-proprietary, technically capable, commercially rejected\n- EISA (1988): open, ISA-compatible answer to MCA\n- VLB (1992): fast but tied awkwardly to the 486's own bus\n- PCI (1992): the first properly engineered general-purpose bus\n- AGP (1997): a dedicated fast lane just for graphics\n- PCIe (2002-present): scalable serial lanes that replaced all of the above\n\nEvery motherboard you build on today still reflects this history, right down to why old expansion cards from different eras were never interchangeable."
    },
    {
      id: "article-filesystems",
      title: "From FAT to NTFS to exFAT: The Filesystem Story",
      category: "storage",
      unlockYear: 2010,
      summary: "The unglamorous but essential story of how your operating system keeps track of where your files actually live on the disk.",
      body: "A filesystem is just a bookkeeping scheme — a way of recording which sectors on a disk belong to which file, and it matters more than most users ever realize. DOS shipped with FAT12, then FAT16, simple flat structures adequate for floppy disks and small hard drives but hopeless once drives grew past a few hundred megabytes.\n\nWindows 95's OSR2 update introduced **FAT32** in 1996, extending addressable space and cutting wasted 'slack' space on larger drives, and it became the consumer standard for the rest of the decade. But FAT had no real concept of permissions, no journaling to recover from a crash mid-write, and a hard 4GB single-file size limit that would eventually collide head-on with DVD rips and large video files.\n\nMicrosoft's answer had actually shipped years earlier, just not to consumers: **NTFS**, introduced with Windows NT in 1993, brought file permissions, encryption, compression, and a transaction journal that could recover a half-written file after a crash instead of just corrupting it. It took until Windows XP in 2001 for NTFS to become the default for ordinary home users, finally merging the robust NT filesystem with mainstream Windows.\n\nFlash storage introduced a new problem NTFS wasn't built for: cheap USB drives and SD cards needed something lightweight enough for tiny embedded controllers, but FAT32's 4GB file cap was untenable for growing video and camera files. Microsoft's exFAT, introduced in 2006 and widely adopted for SDXC cards and large flash drives by the early 2010s, solved this specifically for removable flash media — it isn't trying to replace NTFS on a boot drive, just to give portable storage a lightweight, patent-licensed, large-file-capable option that works cleanly across Windows, macOS, and Linux alike.\n\n- FAT12/FAT16 (early 1980s): tiny, simple, floppy and early-HDD scale\n- FAT32 (1996): larger drives, still no permissions or journaling\n- NTFS (1993, mainstream 2001): permissions, journaling, encryption\n- exFAT (2006): lightweight, large-file-friendly format for flash media\n\nA repair shop's day-to-day still runs into this directly: a customer's 'corrupted' flash drive is very often just a filesystem mismatch, not a dead chip."
    },
    {
      id: "article-megahertz-myth",
      title: "The Megahertz Myth: Why Clock Speed Stopped Being King",
      category: "cpu",
      unlockYear: 2006,
      summary: "For twenty years, a bigger number on the box meant a faster PC. Then it quietly stopped being true.",
      body: "Through most of the 1990s, buying a faster PC was refreshingly simple: find the biggest clock-speed number you could afford. A 100MHz Pentium beat a 66MHz one, full stop, because the underlying architectures generation to generation were similar enough that clock speed was a fair proxy for real performance.\n\nThat relationship began to strain in the early 2000s. Intel's Pentium 4, built around the **NetBurst** architecture, was explicitly designed to hit very high clock speeds — eventually over 3.5GHz — at the expense of doing less real work per clock cycle. AMD's competing Athlon chips ran at lower advertised clock speeds but frequently outperformed the Pentium 4 in real workloads, forcing AMD to invent 'model numbers' (like Athlon XP 2400+) just to stop customers from dismissing a good chip over a smaller MHz figure on the box.\n\nThe myth finally broke in public in 2006, when Intel itself abandoned the NetBurst approach and launched the **Core** microarchitecture. The Core 2 Duo ran at lower clock speeds than the Pentium 4 chips it replaced, yet delivered dramatically better performance at a fraction of the power draw and heat. Intel had essentially admitted, with its own product line, that raw megahertz had never been the right thing to optimize for.\n\nWhat actually matters instead is a tangle of factors clock speed alone can't capture:\n- instructions per clock (IPC) — how much useful work each cycle actually does\n- core and thread count — how much work can happen in parallel\n- cache size and memory bandwidth — how often the CPU sits idle waiting on data\n- power and thermal headroom — how long peak speed can actually be sustained\n\nModern CPU marketing still lists a clock speed, but reviewers and shoppers alike now treat it as one number among many rather than the whole story — a hard-won lesson from two decades of chasing a number that mattered less than everyone assumed."
    },
    {
      id: "article-3d-acceleration",
      title: "3D Acceleration: From Voodoo to Ray Tracing",
      category: "gpu",
      unlockYear: 2018,
      summary: "The graphics card went from an optional add-on card that only ran a handful of games to the single most expensive part in a modern gaming PC.",
      body: "Before 1996, 'graphics acceleration' mostly meant faster 2D — pushing Windows around the screen a little quicker. Real-time 3D rendering was the domain of expensive workstations, until **3dfx's Voodoo Graphics** card arrived in late 1996 as an add-on board dedicated purely to 3D, sitting alongside a regular 2D video card and requiring a pass-through cable between the two.\n\nThe results were startling enough that 3D accelerators went from curiosity to must-have within about two years. id Software's GLQuake showed just how much smoother and richer id's own Quake engine looked when 3D math ran on dedicated silicon instead of the CPU, and a wave of competitors — Nvidia's Riva, ATI's Rage, and 3dfx's own Voodoo2 (famous for letting two cards run in tandem, an early hint at multi-GPU) — chased the same market.\n\nNvidia's GeForce 256 in 1999 folded transform-and-lighting math directly onto the GPU, a feature Nvidia's marketing dubbed the first true 'GPU.' ATI's Radeon line pushed programmable shaders through the early 2000s, letting developers write custom lighting and effect code instead of relying on a handful of fixed, built-in modes — the foundation of every modern game engine's visual style.\n\nFor most of the 2000s and 2010s, more raw shader power and higher resolutions were the whole story: bigger chips, more memory, higher clocks. That changed again in 2018, when Nvidia's **RTX 20-series** added dedicated hardware for real-time ray tracing — simulating how individual rays of light actually bounce around a scene — plus AI-driven upscaling (DLSS) to claw back the performance ray tracing's realism costs.\n\n- 1996: 3dfx Voodoo — the first mainstream dedicated 3D accelerator\n- 1999: GeForce 256 — hardware transform & lighting, the first 'GPU'\n- early 2000s: programmable shaders (Radeon, GeForce FX/6-series)\n- 2018: RTX ray tracing + AI upscaling become the new frontier\n\nTwenty-five years after the Voodoo card, the GPU had gone from an optional accessory to, in many builds, the single most expensive and most fought-over component in the whole machine."
    },
    {
      id: "article-ram-generations",
      title: "RAM Generations: From DIP Chips to DDR5",
      category: "memory",
      unlockYear: 2022,
      summary: "Every memory upgrade in this shop's history, from hand-seated DIP chips to today's DDR5 modules, follows the same relentless curve: more capacity, more bandwidth, lower voltage.",
      body: "The earliest PCs used memory built from individual **DIP** (dual in-line package) chips, seated directly into sockets on the motherboard a row at a time. Upgrading memory meant carefully pressing in fragile chips by hand, one bent leg away from a dead bank — a genuinely nerve-wracking repair-bench task.\n\nSIMMs (single in-line memory modules) arrived in the mid-1980s and turned that ordeal into something closer to today's experience: whole banks of chips soldered onto a small card that clicked into a single slot. 30-pin SIMMs gave way to wider 72-pin SIMMs as 386 and 486 systems needed more bandwidth than a narrow 8-bit path could deliver, usually requiring modules to be installed in matched pairs or quads to fill a full bus width.\n\nThe Pentium era brought **DIMMs** (dual in-line memory modules) and, critically, **SDRAM**, which synchronized memory operations to the system clock instead of running asynchronously — a real speed unlock. DDR ('double data rate') SDRAM followed in the early 2000s, transferring data on both the rising and falling edge of the clock signal to effectively double throughput without doubling clock speed.\n\nEach DDR generation since has repeated the same trade-off: higher transfer speeds, lower operating voltage, and a new physical notch position so older modules can't be forced into newer slots (and vice versa) by mistake.\n\n- DIP (1970s-80s): hand-seated individual chips\n- 30-pin then 72-pin SIMM (mid-80s-90s): modules replace individual chips\n- SDRAM DIMMs (late 1990s): memory synchronized to the system clock\n- DDR (2000), DDR2 (2003), DDR3 (2007), DDR4 (2014): doubling transfer rate and easing voltage roughly every several years\n- DDR5 (2021-22): higher bandwidth, on-module voltage regulation, higher stable capacities\n\nA shop technician from 1985 handling a modern DDR5 kit would recognize almost nothing about the physical module — but the underlying job, giving the CPU somewhere fast enough to keep its data, has never changed."
    },
    {
      id: "article-sockets-slots",
      title: "Sockets and Slots: A Short History of Plugging In a CPU",
      category: "cpu",
      unlockYear: 2012,
      summary: "Why CPUs sometimes plug into a socket, sometimes slide into a slot like an expansion card, and what that says about how a chip is actually built.",
      body: "For most of the PC's history, a CPU has plugged into a **socket** — a grid of pins or contact pads on the motherboard designed for exactly one family of chips. Socket names changed constantly as pin counts and voltages shifted generation to generation: Socket 3 for late 486s, Socket 7 for the Pentium and its many clones, Socket 370 for later Pentium IIIs, and so on through Socket 478, 775, 1155, 1700, and AM4/AM5 on the AMD side.\n\nIntel took a strange detour in the late 1990s. The Pentium II and early Pentium III shipped not as a bare chip in a socket but as a small daughtercard — CPU die and L2 cache together — that slid into a slot (**Slot 1**) much like an expansion card, connectors along one edge. It solved a real problem: early L2 cache chips couldn't be packed onto the same die as the CPU yet, so putting them on a nearby card kept the electrical path short. As soon as manufacturing let Intel put cache directly on the CPU die itself, the slot approach became pointless, and Intel quietly returned to sockets by 2000.\n\nA socket or slot's real job is defining a contract: which chips physically fit, and — separately — which chips are electrically and logically compatible once they do. A new socket usually means a new memory type, a new bus, or a new voltage/power delivery scheme too, which is why a socket upgrade so often forces a whole-platform upgrade rather than a simple CPU swap.\n\n- Socket-based CPUs: the norm before and after the late-90s slot detour\n- Slot 1 / Slot A (1997-2000): a brief era when CPU + cache shared one card\n- A socket change usually means a chipset, memory, and often a whole-motherboard change too\n\nUnderstanding which socket a customer's board uses — and whether a 'compatible-looking' chip actually matches the electrical generation, not just the physical pin pattern — is one of the most basic, and most consequential, checks in this trade."
    },
    {
      id: "article-multi-gpu",
      title: "The Rise and Fall of Multi-GPU Gaming",
      category: "gpu",
      unlockYear: 2020,
      summary: "For about fifteen years, running two or more graphics cards together was the ultimate enthusiast flex. Then the industry quietly let it die.",
      body: "3dfx's Voodoo2 in 1998 popularized the idea that two identical graphics cards, wired together with a short cable, could split rendering work and roughly double frame rates. It was niche and expensive, but it planted an idea that would define a whole era of enthusiast PC building.\n\nNvidia revived and rebranded the concept as **SLI** (Scalable Link Interface) in 2004, and ATI/AMD answered with **CrossFire** shortly after. Motherboard makers built entire product lines around dual-GPU (and eventually triple- and quad-GPU) support, and the extra pair of PCIe x16 slots on a high-end board became a status symbol independent of whether anyone actually filled them.\n\nThe practical reality was messier than the marketing. Multi-GPU scaling depended on game-specific driver profiles that had to be built and maintained title by title, frame pacing between cards was often uneven ('microstutter'), and the performance gain from a second card was reliably well short of a clean 2x. Many buyers who paid a premium for a second GPU quietly discovered it did nothing at all in games without a profile for it.\n\nAs single GPUs grew enormously more powerful through the 2010s, and as game engines increasingly relied on rendering techniques that were difficult to split cleanly across multiple cards at all, the whole approach lost its rationale. Nvidia dropped SLI support from consumer drivers for anything below its very top tier starting with the RTX 20-series in 2018, and formally ended SLI support in new consumer GPU drivers entirely by 2020. AMD's CrossFire faded on the same timeline.\n\n- 1998: Voodoo2 SLI — the original two-card idea\n- 2004: Nvidia SLI and AMD CrossFire formalize multi-GPU for the DIY market\n- mid-2000s-2010s: a genuine enthusiast status symbol, if an unreliable one\n- 2018-2020: Nvidia and AMD both wind consumer multi-GPU support down\n\nToday's 'multi-GPU' setups that persist are almost entirely in professional workstations and datacenters splitting compute workloads, not games splitting frames — the consumer dream of doubling your frame rate by buying a second card is, for practical purposes, over."
    },
    {
      id: "article-windows-visual",
      title: "Windows, Reskinned: A Visual History",
      category: "os",
      unlockYear: 2015,
      summary: "Every Windows release rearranges the furniture; only a few actually changed the house. Here's how the desktop got from tiled program windows to the modern Start menu.",
      body: "Windows 1.0 in 1985 couldn't even let windows overlap — everything tiled edge to edge, a limitation imposed partly by an old lawsuit-averse design choice and partly by hardware that could barely redraw the screen fast enough anyway. Windows 2.0 lifted that restriction, and by Windows 3.0 in 1990 and 3.1 in 1992, Program Manager's grid of icon groups had become the interface an entire generation of office workers learned computing on.\n\n**Windows 95** threw Program Manager out entirely in favor of the Start menu and taskbar, a layout so effective that, with only incremental changes, it survived essentially unchanged through Windows 98, Me, 2000, and XP. XP added a blue-and-green 'Luna' theme that looked toy-like to some critics but made the OS visually approachable at exactly the moment PCs were becoming genuinely mainstream household items.\n\nWindows Vista in 2007 introduced **Aero**, a glass-like, translucent theme with real-time window previews and shadows — visually ambitious, but demanding enough on then-current graphics hardware that it partly fed Vista's reputation for sluggishness. Windows 7 kept Aero but polished the rough edges, and remained many users' favorite Windows release for years afterward.\n\nWindows 8 in 2012 took the biggest visual swing since 95, replacing the Start menu entirely with a full-screen, touch-first tile interface ('Metro') — a design clearly built for tablets, foisted onto hundreds of millions of mouse-and-keyboard desktops. The backlash was immediate and severe enough that Windows 8.1 restored a Start button, and Windows 10 in 2015 brought back a proper Start menu (now with some Metro-style tiles folded in), effectively admitting the experiment had gone too far. Windows 11 in 2021 centered the taskbar and rounded the corners, a much gentler evolution than 8's leap.\n\n- 1985-1992: tiled, then overlapping windows on a DOS-based OS\n- 1995-2001: the Start menu and taskbar become the enduring template\n- 2007: Aero glass arrives (and taxes the hardware of its era)\n- 2012: Metro's touch-first redesign meets desktop backlash\n- 2015-2021: a walk back toward a familiar, mouse-friendly desktop\n\nThe throughline across four decades is less about any single design trend and more about Microsoft repeatedly relearning how much its desktop userbase resists having the furniture rearranged."
    },
    {
      id: "article-beige-to-rgb",
      title: "From Beige Box to RGB Rig: The Aesthetic Turn",
      category: "culture",
      unlockYear: 2016,
      summary: "For most of the PC's history nobody was meant to look at the case. Then, slowly, the case became the point.",
      body: "For the first fifteen-plus years of the PC industry, cases were almost uniformly beige or off-white steel boxes, designed to sit under a desk unseen, not to be admired. Function dictated form completely: a case just needed to hold a motherboard, route airflow adequately, and not cost much to stamp out by the millions.\n\nApple's translucent, colorful **iMac G3** in 1998 was an early jolt to that assumption on the consumer side, proving people would pay attention to — and pay a premium for — a computer that looked deliberately designed rather than merely enclosed. On the PC side, the shift came from the bottom up, driven by modders rather than manufacturers: enthusiasts cutting acrylic windows into case side panels by hand, running cold-cathode lighting tubes, and painting cases in colors no OEM would have shipped.\n\nCase manufacturers caught up through the 2000s, first with cheap tinted side-panel windows as an off-the-shelf option, then with purpose-built windowed cases, LED case fans, and increasingly elaborate cable-routing channels specifically so a clean interior would be visible rather than hidden. Water cooling, once a purely thermal enthusiast pursuit, became as much a visual centerpiece — colored coolant, acrylic tubing bent into geometric runs — as a cooling solution.\n\nThe 2010s added **addressable RGB lighting**, letting every fan, RAM stick, and cooler independently cycle through millions of colors and sync to software-controlled lighting profiles, effectively turning the whole build into a programmable light show behind glass. What had once been a subculture of a subculture became, by the mid-2010s, mainstream enough that motherboard and component makers built RGB lighting and software ecosystems into products by default, whether the buyer wanted it or not.\n\n- pre-1998: uniform beige, form purely follows function\n- late 1990s-2000s: iMac's color, and modder-driven windowed cases\n- 2000s-2010s: cable management and water cooling become visual crafts\n- mid-2010s onward: addressable RGB becomes a default expectation\n\nA build's looks are now routinely part of the sales pitch, a complete reversal from an industry that spent its first fifteen years actively hiding its own hardware from view."
    },
    {
      id: "article-ssd-revolution",
      title: "The SSD Revolution",
      category: "storage",
      unlockYear: 2013,
      summary: "No single upgrade in this shop's whole history made a machine feel faster, instantly, than swapping a spinning hard drive for a solid-state one.",
      body: "Hard drives spent their entire history bound by a simple physical limit: a spinning platter and a moving read/write head can only get to a given piece of data so fast, no matter how clever the electronics around them get. **Solid-state drives**, built from NAND flash memory with no moving parts at all, sidestep that limit completely — there's no arm to swing and no platter to wait on.\n\nEarly SSDs in the mid-2000s were prohibitively expensive per gigabyte and, ironically, sometimes not even reliably faster than a good hard drive due to immature controllers. That began changing rapidly around 2008-2010 as flash prices fell and companies like Intel and later Samsung and Crucial shipped drives with genuinely well-engineered controllers, wear-leveling, and TRIM support (added to Windows 7 in 2009) to keep performance from degrading as a drive filled up.\n\nBy the early 2010s, SSD prices had fallen enough that a modest-capacity SSD as a boot drive — paired with a larger, cheaper hard drive for bulk storage — became the single most common, and most recommended, upgrade any shop could sell. Boot times that had taken a minute or more dropped to seconds; applications that visibly loaded piece by piece simply appeared. No CPU or GPU upgrade in this era delivered a comparably dramatic, universally noticeable jump for the price.\n\nThe interface kept pace as flash got faster than the aging SATA connection could carry: **NVMe** drives, connecting directly over PCI Express lanes instead of the decades-old SATA protocol, arrived in the mid-2010s and multiplied throughput many times over, turning storage from a bottleneck into one of the fastest parts of the whole system.\n\n- mid-2000s: early SSDs, expensive and not always reliably faster\n- 2008-2010: better controllers and falling prices make SSDs genuinely worthwhile\n- early-mid 2010s: SSD-as-boot-drive becomes the default recommended upgrade\n- mid-2010s onward: NVMe over PCIe multiplies flash storage speed again\n\nFor a repair shop, the SSD swap has one more underrated virtue: with no moving parts to wear out or fail under vibration, it's also simply more reliable than the drives it replaced."
    },
    {
      id: "article-post-pc-squeeze",
      title: "The Post-PC Squeeze: Tablets, Phones, and the 'Death' of the Desktop",
      category: "business",
      unlockYear: 2013,
      summary: "For a few years in the early 2010s, plenty of serious people assumed the traditional PC's days were numbered. It didn't quite work out that way.",
      body: "The iPhone's 2007 debut and the iPad's 2010 launch made mobile devices capable of tasks — email, web browsing, media, casual gaming — that had once required sitting down at a desktop or laptop. Global PC shipments, which had grown almost every year since the 1980s, actually began shrinking in the early 2010s as more households satisfied more of their computing needs with a phone or tablet instead of replacing an aging PC on schedule.\n\nCommentators at the time coined the term **'post-PC era'** to describe this shift, and some predicted the traditional desktop would fade into a niche product for specialists within a decade. Netbooks, a brief category of ultra-cheap small laptops that had boomed in the late 2000s, largely collapsed as tablets ate the same low end of the market from a different angle.\n\nWhat actually happened was narrower than the most dramatic predictions: the PC's *low end* — casual browsing, email, light media consumption — genuinely did move to phones and tablets, and that segment of PC sales never fully recovered. But gaming, content creation, software development, and serious multitasking all remained tasks tablets and phones simply couldn't do as well, and demand in those segments stayed resilient or even grew. Custom PC building, in particular, thrived throughout this period specifically because it served needs mobile devices couldn't touch.\n\nRepair and upgrade shops that survived the squeeze generally did it by leaning into specialization — gaming builds, small-business workstations, and the technical repair work regular consumers increasingly couldn't do themselves on sealed mobile hardware — rather than competing for the shrinking pool of casual home users buying a machine just to check email.\n\n- 2007-2010: iPhone and iPad arrive, mobile computing goes mainstream\n- early 2010s: PC shipments decline for the first time in the industry's history\n- netbooks collapse as tablets absorb the cheap, casual-use segment\n- gaming, creation, and business PCs prove durably resistant to the squeeze\n\nThe PC didn't die; it got smaller in the segments mobile could serve and stayed essential in the ones it couldn't."
    },
    {
      id: "article-shortage-era",
      title: "The Shortage Era: Crypto, COVID, and the Great GPU Drought",
      category: "business",
      unlockYear: 2022,
      summary: "Between 2017 and 2022, buying a graphics card at its official price was, for long stretches, close to impossible — and the reasons kept changing.",
      body: "Graphics cards had occasionally sold out at launch before, but the shortages that began in 2017 were different in scale and duration. Ethereum and other cryptocurrencies could be **mined** profitably using consumer GPUs, and as coin prices rose, miners bought mid-range and high-end cards by the truckload, often faster than manufacturers could restock shelves. Retail prices for popular cards ran well above their official list price for the better part of a year before the market cooled.\n\nJust as that first wave settled, an unrelated shock hit in 2020: the COVID-19 pandemic sent millions of people home to work, attend school, and entertain themselves entirely on their own computers, spiking demand for PCs and components at the exact moment factory shutdowns and shipping disruptions were constraining supply. A second, larger cryptocurrency boom overlapped almost perfectly with this demand surge, and a broader global semiconductor shortage — affecting everything from cars to game consoles — compounded all of it at once.\n\nThe result, from roughly late 2020 through 2022, was a GPU market where scalpers and bots routinely bought new cards within seconds of release to resell at double or triple list price, and where waiting for a 'normal' launch-price purchase could mean waiting the better part of a year. Manufacturers experimented with purchase limits, ID verification, and even mining-limited card variants aimed at making mining unprofitable enough that gaming cards would flow back to gamers.\n\nThe shortage finally eased through 2022 as cryptocurrency's Ethereum blockchain switched away from the mining-based system that had driven GPU demand in the first place ('the Merge'), coinciding with a broader crypto price downturn and factories catching up on backlogged orders.\n\n- 2017-2018: first crypto-driven GPU shortage (Ethereum mining boom)\n- 2020: COVID-19 demand shock plus a global chip shortage\n- 2020-2021: a second, larger crypto boom overlaps with COVID demand\n- 2022: Ethereum's move away from mining, plus easing supply, ends the drought\n\nFor half a decade, 'just buy a graphics card' was rarely as simple as it sounds — a genuinely unusual stretch in an industry more used to gradually falling prices than gradually rising ones."
    },
    {
      id: "article-clone-industry",
      title: "Compatible or Bust: The Birth of the PC Clone Industry",
      category: "business",
      unlockYear: 1990,
      summary: "IBM never intended to create an entire industry of competitors building machines identical to its own — but an accident of its own design choices did exactly that.",
      body: "When IBM built the original PC in 1981, it made two decisions that seemed sensible at the time and turned out to reshape the entire computing industry. First, it built the machine almost entirely from off-the-shelf parts anyone could buy, rather than custom IBM-only components. Second, it published the PC's full technical reference manual, including the complete BIOS source code listing, to encourage third parties to build add-on hardware and software for it.\n\nThat openness was supposed to build an accessory ecosystem, not competitors. But because the BIOS listing was public, and because copyright law protected the literal code but not the *functions* it performed, companies realized they could legally build a fully IBM-compatible BIOS by having engineers who had never seen IBM's code implement the same functions from a written specification — a **clean-room** process, famously used by Phoenix Technologies and Compaq's own engineers.\n\nA legally clean, functionally identical BIOS meant a company could build a machine running the exact same software as an IBM PC, without infringing anything. **Compaq** proved it worked first, in late 1982 and early 1983, with its Compaq Portable — and crucially, Compaq wasn't just cheaper, it eventually out-innovated IBM outright, shipping the first 386 PC in 1986 months before IBM had one ready.\n\nA flood of Taiwanese, Korean, and American clone makers followed through the 1980s, driving prices down and innovation up in a way a single-vendor market never would have. IBM's own PS/2 line in 1987 tried to reclaim control with the proprietary Micro Channel bus, but the clone industry simply built its own open standard (EISA) rather than pay IBM's licensing fees, and IBM's grip on 'its own' platform never recovered.\n\n- 1981: IBM ships an open, easily-cloned PC design\n- 1982-83: clean-room BIOS clones (Compaq, Phoenix) make legal clones possible\n- mid-1980s: a flood of low-cost clone makers out-competes IBM on price\n- 1986-88: clone makers begin out-innovating IBM technically, not just on price\n\nEvery whitebox shop that has ever assembled a 'generic' PC from parts, this one included, is a direct descendant of that 1982-83 clean-room engineering trick."
    },
    {
      id: "article-multimedia-pc",
      title: "The Multimedia PC: CD-ROMs, Sound Cards, and the MPC Standard",
      category: "culture",
      unlockYear: 1996,
      summary: "Before broadband and streaming, 'multimedia' meant something very specific: a PC that could actually make sound and play a disc, which for years was not a given.",
      body: "The first decade of the PC was almost entirely silent and text-based by default — a stock PC's built-in speaker could barely manage a beep, and there was no standard way to read anything beyond a floppy disk. **Sound cards** changed the first half of that: Creative Labs' Sound Blaster line, starting in 1989, added FM synthesis and digitized audio on a single ISA card compatible with the existing AdLib software library, and quickly became the de facto standard PC games were built to target.\n\nOptical storage solved the second half. **CD-ROM drives**, adapted from the audio CD format, could hold roughly 650MB — hundreds of times a floppy disk's capacity — making it practical to ship games, encyclopedias, and software with full-motion video, recorded speech, and enormous asset libraries that would never have fit on a stack of floppies.\n\nIndustry groups formalized this combination as the **MPC (Multimedia PC) standard** starting in 1990, specifying a minimum CPU, RAM, sound card, and CD-ROM drive a machine needed to carry the 'Multimedia PC' badge. It gave both software publishers and confused shoppers a baseline to build around and buy against, at a moment when 'multimedia' was marketed as the industry's next big thing.\n\nGames and reference software of the era leaned hard into the format's novelty: full-motion-video 'interactive movie' games, talking encyclopedias like Encarta, and atmospheric puzzle games like Myst that were built specifically to showcase what a CD-ROM-and-sound-card PC could now do that a floppy-only machine couldn't.\n\n- 1989: Sound Blaster establishes the PC sound-card standard\n- 1990: the MPC standard defines a baseline 'multimedia' PC\n- early-to-mid 1990s: CD-ROM drives become a standard PC fixture\n- CD-based games and reference software define the era's software identity\n\nBy the time broadband and streaming media made 'multimedia' a meaningless catch-all term, the sound card and CD-ROM drive it once specifically described had already become permanent, unremarkable parts of every PC on the bench."
    },
    {
      id: "article-laptops-form-factor",
      title: "Laptops, Luggables, and the Shrinking Form Factor",
      category: "form-factor",
      unlockYear: 2001,
      summary: "The path from a 28-pound 'portable' computer to a laptop thin enough to slide into an envelope took twenty-five years of shrinking batteries, screens, and expectations.",
      body: "The Compaq Portable and its imitators in the early 1980s stretched the definition of 'portable' about as far as it could go: a suitcase-sized machine with a small built-in CRT screen and a carrying handle, weighing around 28 pounds, meant to be carried between locations rather than used on the actual move. Enthusiasts affectionately (and accurately) called these 'luggables.'\n\nGenuine battery-powered laptops with flat LCD screens emerged through the mid-to-late 1980s, though early LCD panels were dim, low-contrast, and far more expensive than a desktop CRT for a comparable machine. Weight and battery life improved gradually rather than dramatically for years — a 'laptop' in the early 1990s was still a heavy, expensive, compromise-laden purchase compared to a desktop of similar capability.\n\nApple's **PowerBook** line in the early 1990s got the basic ergonomic layout right — a palm rest below the keyboard, a pointing device centered beneath it — in a way most of the industry quickly copied. Through the rest of the 1990s and 2000s, laptops slowly closed the performance gap with desktops as mobile-specific CPU designs (rather than simply lower-clocked desktop chips) matured.\n\nApple pushed the form factor again with the **MacBook Air** in 2008, an aggressively thin design that sacrificed an optical drive and most ports for portability, kicking off an industry-wide 'ultrabook' trend as competitors scrambled to build comparably thin machines. Meanwhile a parallel, cheaper track — 2007's Eee PC and the netbook boom it started — briefly proved there was also real demand for laptops prioritizing low cost and portability over raw performance, before tablets absorbed much of that same casual-use demand a few years later.\n\n- early 1980s: 20+ pound 'luggables' with built-in CRT screens\n- mid-late 1980s: true battery-powered LCD laptops, expensive and compromised\n- early 1990s: PowerBook establishes the modern keyboard/trackpad layout\n- 2008: the MacBook Air pushes the whole industry toward thin-and-light\n\nA repair shop's laptop work has tracked this whole shrinking arc directly: less standardized, more glued and soldered, and steadily less field-serviceable with every generation that got thinner."
    },
    {
      id: "article-browser-wars",
      title: "The Browser Wars",
      category: "business",
      unlockYear: 2000,
      summary: "For most of the 1990s and 2000s, which browser a PC shipped with wasn't just a software choice — it was a battle for control of how people experienced the entire Internet.",
      body: "Netscape Navigator, released in late 1994 by many of the same people who had built the earlier Mosaic browser, dominated the early commercial Web so completely that by the mid-1990s it held something like 80% market share. Its runaway 1995 IPO helped convince Wall Street that Internet companies deserved their own valuation rules entirely — an early spark of the dot-com boom.\n\nMicrosoft, having largely missed the Internet's early growth, responded by bundling its own **Internet Explorer** browser directly into Windows starting in 1995, free of charge, and steadily improving it release over release. Because nearly every new PC already ran Windows, IE's built-in presence gave it a distribution advantage no amount of Netscape's technical quality could fully counter, and this bundling strategy became the subject of a landmark US antitrust case against Microsoft in the late 1990s.\n\nBy the early 2000s Internet Explorer had displaced Netscape almost entirely, reaching well over 90% market share at its peak — and, with serious competition gone, Microsoft's own development pace on IE slowed considerably for years. That stagnation created an opening: Mozilla, built from Netscape's open-sourced codebase, released **Firefox** in 2004, offering tabbed browsing, extensions, and a faster, more standards-compliant engine that won back a meaningful share of technical and enthusiast users.\n\nGoogle entered in 2008 with **Chrome**, built around a fast JavaScript engine and a security model that isolated each tab into its own process so one crashing page couldn't take down the whole browser. Chrome's combination of speed, simplicity, and Google's own considerable distribution muscle let it overtake both Internet Explorer and Firefox within a few years, becoming the new dominant browser by the early 2010s — a position it has held ever since.\n\n- 1994-96: Netscape dominates the commercial Web's early years\n- 1995-2001: Microsoft bundles IE with Windows and overtakes Netscape\n- 2004: Firefox, from Netscape's open-sourced code, revives real competition\n- 2008 onward: Chrome overtakes both and becomes the new default\n\nEach 'winner' of the browser wars won for a different reason — content quality, distribution, or engineering speed — a pattern that has repeated in plenty of tech-platform fights since."
    },
    {
      id: "article-death-of-floppy",
      title: "The Death of the Floppy Disk",
      category: "storage",
      unlockYear: 2003,
      summary: "For twenty years the floppy disk was simply how you moved files between machines. Then, over the course of about a decade, it quietly disappeared from new PCs entirely.",
      body: "The 5.25-inch floppy disk, holding as little as 360KB in the IBM PC's original format, was for years the *only* practical way to install software or move files between two machines that weren't directly cabled together. The sturdier, higher-capacity 3.5-inch floppy — encased in rigid plastic rather than a flexible paper sleeve, and holding up to 1.44MB in its final common form — gradually displaced the 5.25-inch format through the mid-to-late 1980s.\n\nBy the early-to-mid 1990s, though, software itself was outgrowing the floppy far faster than the format's capacity was improving. A single CD-ROM held roughly 650MB, versus a 3.5-inch floppy's 1.44MB — installing a large program from CD meant one disc; installing the same program from floppies could mean swapping a dozen or more disks in sequence, an experience nobody defended even at the time.\n\nApple made the first symbolically bold move away from the format, shipping the 1998 **iMac G3** with no floppy drive at all, betting that the newly available USB port and USB flash storage could fill the gap. It was controversial at launch — critics worried customers would be unable to move files at all — but the bet paid off as USB peripherals, including the first USB flash drives around 2000, proliferated almost immediately.\n\nPC manufacturers followed more gradually through the early 2000s, and by the mid-2000s a floppy drive had gone from a standard fixture to an optional, often-omitted extra. Windows XP, released in 2001, was the last mainstream Windows version many users installed at least partly from floppy media (for driver disks and the like); by the time Windows Vista shipped in 2007, floppy drives were rare enough in new PCs that the format was functionally obsolete for everyday use.\n\n- early-mid 1980s: 5.25-inch floppies give way to sturdier 3.5-inch disks\n- 1990s: CD-ROMs make the floppy's tiny capacity look increasingly absurd\n- 1998: the iMac G3 ships with no floppy drive, betting on USB instead\n- early-to-mid 2000s: floppy drives quietly disappear from new PCs\n\nThe format outlived its usefulness by years mostly out of institutional inertia — old BIOS update procedures and legacy hardware kept a trickle of floppy drives shipping well after almost nobody needed one for ordinary files."
    },
    {
      id: "article-lan-to-livestream",
      title: "LAN Parties to Live Streams: How Multiplayer Gaming Changed",
      category: "culture",
      unlockYear: 2005,
      summary: "Multiplayer gaming went from physically hauling a tower and a CRT to a friend's house to broadcasting yourself playing to strangers around the world — without ever leaving your desk.",
      body: "Early multiplayer PC gaming was overwhelmingly a **local** affair by necessity: dial-up modems were too slow and unreliable for fast-paced action games, so competitive play meant physically networking machines together in the same room. **LAN parties** — friends hauling their entire PC tower, monitor, and a tangle of cables to someone's house or a rented hall for a weekend of networked Doom, Quake, or later Counter-Strike — became a genuine cultural institution of PC gaming through the 1990s and into the 2000s.\n\nBroadband internet, spreading through the late 1990s and 2000s, gradually removed the practical need to be in the same room at all. Games built explicitly around persistent online worlds and matchmaking — **World of Warcraft** in 2004 chief among them — proved millions of players would rather log in from home than travel anywhere, and the traditional LAN party's practical rationale steadily eroded even as a devoted subculture kept smaller events alive for years afterward.\n\nDigital distribution changed the business side of the same shift: **Steam**, launched by Valve in 2003, turned buying, patching, and eventually playing games into something that happened entirely online rather than through a boxed disc — removing another reason multiplayer gaming needed to happen anywhere near other physical hardware.\n\nThe final piece arrived once broadband was fast and common enough to support not just playing together but *watching* each other play: platforms built for game **livestreaming**, alongside broadcast-focused software like OBS Studio (2012), let anyone broadcast their own gameplay to an audience of strangers in real time. Watching games became, for a huge audience, as popular a pastime as playing them — an entertainment category that had no real equivalent in the LAN-party era at all.\n\n- 1990s-early 2000s: LAN parties as the practical answer to slow/unreliable internet\n- 2003: Steam moves game purchase and distribution fully online\n- 2004: WoW proves persistent online worlds beat local networking for scale\n- early 2010s onward: livestreaming turns watching games into its own pastime\n\nThe cables, the CRTs, and the all-night drive to a friend's basement are mostly gone — but the social core of playing games with other people that LAN parties were built around never really went away, it just moved onto the internet."
    },
    {
      id: "article-linux-rise",
      title: "The Rise of Linux and Open Source on the Desktop",
      category: "os",
      unlockYear: 2004,
      summary: "A Finnish student's 1991 hobby project became the operating system running most of the world's servers and phones — even as it never quite conquered the desktop the way its earliest fans hoped.",
      body: "Linus Torvalds' original 1991 Usenet post describing his 'hobby' operating system undersold what was coming: Linux, released under the GNU GPL open-source license, let anyone freely use, study, modify, and redistribute the code — a sharp break from the closed, commercially licensed operating systems that dominated the era.\n\nThat openness meant Linux development could draw on volunteer contributors worldwide rather than a single company's payroll, and by the mid-to-late 1990s a genuine ecosystem of Linux **distributions** — Red Hat, Debian, SUSE, and later Ubuntu — packaged the kernel together with a full set of usable software and installers aimed at real users, not just kernel hackers.\n\nEarly desktop Linux struggled with driver support, unfamiliar interfaces, and software compatibility gaps that kept it a hobbyist and server-room tool rather than a mainstream consumer choice — a limitation it never fully shook on ordinary home desktops. Its real dominance emerged somewhere else entirely: web servers, where Linux's stability, zero licensing cost, and open customization made it the backbone of the dot-com boom's infrastructure, and later Android, whose entire mobile operating system is itself built on the Linux kernel.\n\nUbuntu's 2004 debut made desktop Linux meaningfully more approachable than earlier distributions, with a genuinely usable graphical installer and a focus on out-of-the-box hardware support, winning over a real (if still modest) slice of enthusiasts and Windows refugees. Valve's later investment in SteamOS and the Proton compatibility layer, culminating in the Steam Deck, gave Linux gaming a credibility it had lacked for its entire prior history.\n\n- 1991: Linus Torvalds announces Linux as a hobby project\n- mid-late 1990s: distributions and a real ecosystem take shape\n- Linux dominates servers and, via Android, mobile — but not the desktop\n- 2004: Ubuntu makes desktop Linux meaningfully more approachable\n\nLinux's story isn't really one of conquering the desktop at all — it's the story of open-source software quietly becoming the invisible foundation underneath most of the computing world instead."
    },
    {
      id: "article-80plus-efficiency",
      title: "80 PLUS and the Quiet Efficiency Revolution",
      category: "business",
      unlockYear: 2008,
      summary: "A power supply wastes some of the electricity it converts as heat — and for most of the PC's history, nobody outside an engineering lab tracked how much.",
      body: "Every power supply converts wall AC into the various DC voltages a PC's components need, and that conversion is never perfectly efficient — some energy is always lost as heat. For most of the PC's early history this waste simply wasn't measured or marketed at all; consumers picked a PSU by wattage rating and price, with efficiency an invisible afterthought even to reasonably informed buyers.\n\nThe **80 PLUS** certification program, introduced in 2004, changed that by independently testing power supplies and certifying units that hit at least 80% efficiency across a range of typical loads — meaning no more than 20% of the power drawn from the wall was wasted as heat rather than delivered to components. It gave buyers, and reviewers, a simple, comparable benchmark where none had existed before.\n\nThe program expanded into a tiered system — Bronze, Silver, Gold, Platinum, and eventually Titanium — each requiring higher efficiency at multiple load levels, letting a shopper compare PSUs the same way they might compare a refrigerator's energy rating. Higher-efficiency units commanded a real price premium, but paid it back over time through lower electricity bills and, just as importantly to a repair shop, ran measurably cooler, which meant less thermal stress on components and a longer working life before failure.\n\nBy the late 2000s and into the 2010s, 80 PLUS certification had gone from a niche differentiator to a standard line item on nearly every serious power supply's box, and PSU-related failures (bad capacitors, overloaded rails) became somewhat rarer on well-rated units as a direct result of the tighter engineering the certification demanded.\n\n- pre-2004: PSU efficiency almost entirely unmeasured and unmarketed\n- 2004: 80 PLUS establishes the first widely recognized efficiency baseline\n- Bronze/Silver/Gold/Platinum/Titanium tiers give shoppers a clear ladder\n- efficiency becomes a standard selling point, not just a spec-sheet curiosity\n\nIt's a quiet kind of progress compared to a new GPU architecture or CPU generation, but a Gold or Platinum PSU running cooler and wasting less power is exactly the kind of unglamorous reliability upgrade a good shop should always be recommending."
    },
    {
      id: "article-pc-audio",
      title: "Beeps to Bitstreams: How PC Audio Grew Up",
      category: "culture",
      unlockYear: 1998,
      summary: "The PC was born nearly mute — one square-wave beeper on the motherboard. Getting from there to studio-grade sound on every board took fifteen years and a format war or two.",
      body: "The original IBM PC made exactly one kind of sound: a small speaker wired to a timer chip that could produce a square wave at a chosen pitch. One voice, no volume control, no mixing — every boot beep, error tone, and heroic attempt at game music came from that single channel. Programmers squeezed astonishing tricks out of it, but the hardware was a doorbell, not an instrument.\n\nThe first real upgrade arrived in 1987 with the AdLib card, built around Yamaha's OPL2 chip. It made sound the way 80s synthesizers did: **FM synthesis**, where one oscillator rapidly modulates the frequency of another to conjure brassy leads, electric pianos, and bells out of pure math — no recordings involved. For the first time, PC games had actual music, with chords.\n\nCreative Labs' **Sound Blaster** (1989) kept the same OPL2 FM chip for music but added the piece AdLib lacked: a digital channel that could play back real recorded sound — speech, explosions, drum hits — plus a game port for a joystick. That combination made it the de facto standard for a decade; 'Sound Blaster compatible' became a phrase printed on game boxes the way system requirements are today.\n\nThe next leap traded math for memory. **General MIDI** and wavetable synthesis — Roland's Sound Canvas, the Gravis Ultrasound, and later the AWE32 — stored actual recorded snippets of real instruments and replayed them at pitch, so game soundtracks could sound like a real ensemble instead of an FM approximation. By the late 90s, CD audio and software mixing pushed further still, and the sound card's days were numbered: AC'97 codecs, then Intel's High Definition Audio spec in 2004, folded clean multichannel sound onto every motherboard for pennies. Audio went from a $200 add-on card to a checkbox nobody thinks about.\n\n- 1981: PC speaker — one square-wave voice on a timer chip\n- 1987: AdLib — OPL2 two-operator FM synthesis, real music from math\n- 1989: Sound Blaster — FM plus digital playback; the compatibility standard\n- early 90s: General MIDI and wavetable — sampled real instruments\n- 1997-2004: AC'97 to HD Audio — sound moves onto the motherboard for good\n\nListen closely to this game's own soundtrack: it re-creates these techniques era by era. The early years play a single square-wave voice that cuts itself off exactly like the PC speaker did; the 90s skin uses honest two-operator FM synthesis, the same trick as an AdLib; and the later eras layer detuned synth pads the way onboard audio finally made effortless."
    }
  ];


  // §13.3 — DATA.PERIOD_SOFTWARE: real era software titles used to fill copy tokens
  // ({SW}/{GAME}/{OFFICE}/{CREATIVE}) in faults[].complaints and jobBlurbs (engine's
  // fillCopyTokens picks an era- and customer-appropriate title; untokened variants
  // are kept everywhere too so nothing breaks if a token can't resolve).
  DATA.PERIOD_SOFTWARE = [
    { name: "VisiCalc", minYear: 1979, maxYear: 1985, kind: "office", customers: null },
    { name: "WordStar", minYear: 1983, maxYear: 1992, kind: "office", customers: null },
    { name: "Lotus 1-2-3", minYear: 1983, maxYear: 1996, kind: "office", customers: ["smallbiz", "office"] },
    { name: "dBASE", minYear: 1983, maxYear: 1995, kind: "office", customers: ["smallbiz", "office"] },
    { name: "WordPerfect", minYear: 1983, maxYear: 2000, kind: "office", customers: ["smallbiz", "office", "student"] },
    { name: "MS-DOS", minYear: 1983, maxYear: 1995, kind: "os", customers: null },
    { name: "AutoCAD", minYear: 1983, maxYear: 2025, kind: "creative", customers: ["smallbiz", "office"] },
    { name: "Zork", minYear: 1983, maxYear: 1990, kind: "game", customers: ["home", "student", "hobbyist"] },
    { name: "Microsoft Flight Simulator", minYear: 1983, maxYear: 1998, kind: "game", customers: ["home", "hobbyist"] },
    { name: "TurboTax", minYear: 1984, maxYear: 2025, kind: "utility", customers: ["home", "smallbiz"] },
    { name: "King's Quest", minYear: 1984, maxYear: 1994, kind: "game", customers: ["home", "student"] },
    { name: "Adobe Illustrator", minYear: 1987, maxYear: 2025, kind: "creative", customers: ["creator"] },
    { name: "SimCity", minYear: 1989, maxYear: 1999, kind: "game", customers: ["home", "student"] },
    { name: "Photoshop", minYear: 1990, maxYear: 2025, kind: "creative", customers: ["creator", "hobbyist"] },
    { name: "Norton AntiVirus", minYear: 1991, maxYear: 2015, kind: "utility", customers: null },
    { name: "WinZip", minYear: 1991, maxYear: 2010, kind: "utility", customers: null },
    { name: "Premiere", minYear: 1991, maxYear: 2025, kind: "creative", customers: ["creator"] },
    { name: "QuickBooks", minYear: 1992, maxYear: 2025, kind: "office", customers: ["smallbiz"] },
    { name: "Windows 3.1", minYear: 1992, maxYear: 1998, kind: "os", customers: null },
    { name: "Wolfenstein 3D", minYear: 1992, maxYear: 1998, kind: "game", customers: ["gamer", "student"] },
    { name: "Myst", minYear: 1993, maxYear: 1999, kind: "game", customers: ["home", "student", "gamer"] },
    { name: "Doom", minYear: 1993, maxYear: 2000, kind: "game", customers: ["gamer", "student", "hobbyist"] },
    { name: "Encarta", minYear: 1993, maxYear: 2009, kind: "office", customers: ["student", "home"] },
    { name: "America Online (AOL)", minYear: 1993, maxYear: 2006, kind: "web", customers: ["home", "senior"] },
    { name: "Netscape Navigator", minYear: 1994, maxYear: 2003, kind: "web", customers: null },
    { name: "Windows 95", minYear: 1995, maxYear: 2001, kind: "os", customers: null },
    { name: "Internet Explorer", minYear: 1995, maxYear: 2010, kind: "web", customers: null },
    { name: "ICQ", minYear: 1996, maxYear: 2004, kind: "web", customers: ["student", "home"] },
    { name: "Quake", minYear: 1996, maxYear: 2002, kind: "game", customers: ["gamer", "student"] },
    { name: "Winamp", minYear: 1997, maxYear: 2010, kind: "utility", customers: ["student", "gamer", "home"] },
    { name: "Office 97", minYear: 1997, maxYear: 2003, kind: "office", customers: ["smallbiz", "office"] },
    { name: "AOL Instant Messenger", minYear: 1997, maxYear: 2012, kind: "web", customers: ["student", "home"] },
    { name: "Napster", minYear: 1999, maxYear: 2001, kind: "web", customers: ["student", "gamer", "home"] },
    { name: "Office XP", minYear: 2001, maxYear: 2006, kind: "office", customers: ["smallbiz", "office"] },
    { name: "Blender", minYear: 2002, maxYear: 2025, kind: "creative", customers: ["creator", "hobbyist"] },
    { name: "Skype", minYear: 2003, maxYear: 2020, kind: "utility", customers: null },
    { name: "Steam", minYear: 2003, maxYear: 2025, kind: "utility", customers: ["gamer", "student", "hobbyist"] },
    { name: "Firefox", minYear: 2004, maxYear: 2025, kind: "web", customers: null },
    { name: "World of Warcraft", minYear: 2004, maxYear: 2020, kind: "game", customers: ["gamer", "student"] },
    { name: "Half-Life 2", minYear: 2004, maxYear: 2012, kind: "game", customers: ["gamer", "student"] },
    { name: "CCleaner", minYear: 2004, maxYear: 2020, kind: "utility", customers: null },
    { name: "Crysis", minYear: 2007, maxYear: 2013, kind: "game", customers: ["gamer"] },
    { name: "Chrome", minYear: 2008, maxYear: 2025, kind: "web", customers: null },
    { name: "Spotify", minYear: 2008, maxYear: 2025, kind: "web", customers: null },
    { name: "League of Legends", minYear: 2009, maxYear: 2025, kind: "game", customers: ["gamer", "student"] },
    { name: "Microsoft Office 365", minYear: 2011, maxYear: 2025, kind: "office", customers: ["smallbiz", "office", "student"] },
    { name: "Minecraft", minYear: 2011, maxYear: 2025, kind: "game", customers: ["gamer", "student", "home"] },
    { name: "OBS Studio", minYear: 2012, maxYear: 2025, kind: "creative", customers: ["creator", "gamer"] },
    { name: "Discord", minYear: 2015, maxYear: 2025, kind: "web", customers: ["gamer", "student"] },
    { name: "Fortnite", minYear: 2017, maxYear: 2025, kind: "game", customers: ["gamer", "student"] },
    { name: "Zoom", minYear: 2019, maxYear: 2025, kind: "utility", customers: ["office", "smallbiz", "student", "home"] },
    { name: "Stable Diffusion", minYear: 2022, maxYear: 2025, kind: "creative", customers: ["creator", "hobbyist"] }
  ];

  // ================================================================ v0.7 §17.1
  // Craft Update text tables. Field names are the binding ENGINE contract.

  // Mid-job discoveries (repair/upgrade/build + device_repair). Each entry:
  //   category      — part category being worked when this can fire ("device" =
  //                   device_repair jobs)
  //   minYear/maxYear — optional era gate (inclusive)
  //   text          — bench voice, first person, honest
  //   addCategory   — part category of the approved add-on need, or null for
  //                   device-billed/labor-style add-ons (no catalog part)
  //   addLaborHours — extra bench hours if approved (0.1-hour grid)
  DATA.DISCOVERIES = [
    { category: "storage", text: "While I had the drive out, the power supply's casing is bulging at the seam and it smells faintly of burnt varnish. I wouldn't trust it through the summer.", addCategory: "psu", addLaborHours: 0.4 },
    { category: "storage", maxYear: 1990, text: "While the hard disk was out I ran the floppy — the head rail is dry and it squeals like a coffee grinder. Servicing it now is cheaper than the disk it eventually chews.", addCategory: "storage", addLaborHours: 0.4 },
    { category: "motherboard", maxYear: 1992, text: "Down at board level I got a look inside the power supply — the line-filter caps are the old waxy RIFA type, and one is already crazed. When those let go it's smoke, stink, and a scared customer.", addCategory: "psu", addLaborHours: 0.4 },
    { category: "motherboard", minYear: 1985, maxYear: 1996, text: "The clock battery has leaked — green fuzz creeping along the traces from the corner of the board. I cleaned what I could reach, but one memory bank already tests flaky from the corrosion.", addCategory: "ram", addLaborHours: 0.3 },
    { category: "motherboard", minYear: 1985, maxYear: 1995, text: "Thermal cycling has walked half the socketed chips out of their seats — classic chip creep. I pressed everything home, but one memory module's contacts are corroded past saving.", addCategory: "ram", addLaborHours: 0.3 },
    { category: "psu", minYear: 2002, maxYear: 2007, text: "Swapping the supply gave me a clear view of the board: half the electrolytics around the voltage regulators are doming — the bad-cap plague. It runs today, but that board is on borrowed time.", addCategory: "motherboard", addLaborHours: 0.6 },
    { category: "psu", minYear: 2012, text: "With the supply out, that old boot drive is the loudest thing on the bench — bearings whining, seek times to match. A solid-state drive would transform this machine for pocket money.", addCategory: "storage", addLaborHours: 0.3 },
    { category: "gpu", minYear: 1996, text: "The heatsink under this card is wearing a felt coat of dust and the fan barely turns. A proper cooler swap while everything is already apart would spare you the next callout.", addCategory: "cooling", addLaborHours: 0.3 },
    { category: "gpu", minYear: 2006, text: "Every time this card loads up, the 12-volt rail sags and the drives click. The supply is marginal for this class of hardware — replacing it now beats a crash mid-game later.", addCategory: "psu", addLaborHours: 0.4 },
    { category: "ram", minYear: 1998, text: "Memory's swapped and testing clean, but while the box was on the bench the hard drive threw SMART reallocated-sector warnings. It boots fine today; it won't forever.", addCategory: "storage", addLaborHours: 0.3 },
    { category: "ram", minYear: 1986, maxYear: 1998, text: "The memory checked out, but the expansion card beside it was seated at an angle and one edge-connector finger is scorched. It should be replaced before it drags the whole bus down.", addCategory: "expansion", addLaborHours: 0.3 },
    { category: "cpu", minYear: 1997, text: "The old thermal compound under this heatsink has dried to chalk — the chip has been running a fever for years. Fresh paste is part of the job; a better cooler is the real fix.", addCategory: "cooling", addLaborHours: 0.2 },
    { category: "cpu", minYear: 2017, text: "The chip is healthy — the little stock cooler sitting on it isn't. Eight cores under that slab of aluminum will throttle the minute anything works hard. A tower cooler ends it.", addCategory: "cooling", addLaborHours: 0.2 },
    { category: "cooling", minYear: 1995, text: "New cooler's on, but listen: that grinding is the power supply's fan bearing, not mine. When it finally seizes, the supply cooks itself inside an afternoon.", addCategory: "psu", addLaborHours: 0.4 },
    { category: "device", minYear: 2010, text: "The screen didn't crack on its own — the battery underneath is swelling and pushed the glass out of its frame. It has to come out before it vents.", addCategory: null, addLaborHours: 0.4 },
    { category: "device", minYear: 1997, maxYear: 2008, text: "The heatsink popped off for cleaning and the thermal paste underneath had gone to gray dust years ago — it's been running hotter than the fans ever let on. Repasting it now, while the case is already open, is cheap insurance against a slow-cooked logic board.", addCategory: null, addLaborHours: 0.3 },
    { category: "device", minYear: 1999, maxYear: 2007, text: "With the board already out, I can see a row of capacitors along the power section doming at the top — the industry-wide bad batch these years shipped with. They're still holding today, but when they let go they tend to take the board down with them.", addCategory: null, addLaborHours: 0.5 },
    { category: "device", minYear: 2006, text: "The display flex runs straight through the hinge, and thousands of open-close cycles have cracked the copper inside — that's the flicker, not the panel. It's too brittle to reseat safely; it wants a fresh cable while the hinge is already stripped down.", addCategory: null, addLaborHours: 0.4 },
    { category: "device", minYear: 2009, text: "The charging port's solder joints have fractured from years of the cable yanking sideways — it only charges if you hold it at just the right angle. I can resolder and brace the port now while the case is already open, or it's a callback waiting to happen.", addCategory: null, addLaborHours: 0.3 }
  ];

  // Diagnosis-fork flavor (repair/device_repair): patch-vs-proper in honest
  // tradeoff voice. Keyed by fault category; "device" covers device_repair;
  // "generic" is the laborOnly-compatible fallback.
  DATA.FORK_TEXT = {
    ram: {
      patchLabel: "Reseat & clean the contacts",
      patchDesc: "An eraser pass on the contacts and a firm reseat will hold for a while — flaky connections have a way of finding their way back.",
      properLabel: "Replace the module",
      properDesc: "A new stick costs a part but tests clean and stays fixed. No mystery beeps at two in the morning next month."
    },
    storage: {
      patchLabel: "Remap & patch it",
      patchDesc: "I can remap the bad sectors and coax it back to booting — but a drive that has started dying doesn't change its mind.",
      properLabel: "Replace the drive",
      properDesc: "A fresh drive with the data copied over ends the problem for good. Costs a part; saves the data while it's still readable."
    },
    gpu: {
      patchLabel: "Reflow & re-seat the card",
      patchDesc: "A careful reflow and fresh thermal pads can bring a flaky card back — for a season, maybe two. It's a stay of execution, not a pardon.",
      properLabel: "Replace the card",
      properDesc: "A replacement card fixes it outright and tests stable under a full hour of load. The artifacts don't come back."
    },
    psu: {
      patchLabel: "Swap the fan & worst caps",
      patchDesc: "A new fan and the worst capacitors replaced keeps this supply alive on a budget — but a stressed supply fails downhill, and it takes other parts with it.",
      properLabel: "Replace the supply",
      properDesc: "A new unit is the boring, correct answer. Half the ghosts in a flaky machine turn out to live in the power supply."
    },
    motherboard: {
      patchLabel: "Patch the trace & reseat",
      patchDesc: "I can bridge the damaged trace and reseat everything that moves — board-level patches hold right up until the day they don't.",
      properLabel: "Replace the board",
      properDesc: "A replacement board is more labor and more money — and also the end of the intermittent faults instead of a truce with them."
    },
    cpu: {
      patchLabel: "Back the clock off",
      patchDesc: "Underclocking a degraded chip usually stabilizes it — the machine limps, but slower and honest about it.",
      properLabel: "Replace the processor",
      properDesc: "A replacement chip restores full speed and stops the crashes at the source instead of hiding them."
    },
    cooling: {
      patchLabel: "Clean & re-lube the fan",
      patchDesc: "A full cleanout and a drop of oil in the bearing buys a quieter season — but bearings that have started grinding never really heal.",
      properLabel: "Replace the cooler",
      properDesc: "A new cooler is cheap insurance on every other part in the case. Heat is the tax everything else pays."
    },
    device: {
      patchLabel: "Seat it & glue the frame",
      patchDesc: "I can reseat the connector and glue the frame square — it will survive gentle hands, not a back pocket or a gym bag.",
      properLabel: "Replace the failed part",
      properDesc: "A proper part swap with fresh adhesive brings it back to factory feel, and the repair outlives the phone."
    },
    generic: {
      patchLabel: "Quick fix & out the door",
      patchDesc: "A cleanup, a reseat, and a test pass gets it out the door today — most of these stay fixed, and the ones that don't come back angrier.",
      properLabel: "Do it properly",
      properDesc: "The thorough pass costs more bench time, but the fault stays fixed and the machine leaves with a clean bill of health."
    }
  };

  // Overclock tuning flavor (enthusiast jobs): era bands teaching the period's
  // real method. Bands cover 1983-2100; conservative/balanced/aggressive are the
  // player-facing option lines.
  DATA.TUNING_TEXT = [
    {
      minYear: 1983, maxYear: 1997, method: "Jumpers & bus clocks",
      conservative: "Move the bus-speed jumper up one step and leave the voltage alone — most chips of this era take a single grade without complaint.",
      balanced: "Set the bus jumpers a grade past spec and add an I/O wait state for the fussier ISA cards, then burn it in overnight before it ships.",
      aggressive: "Swap the clock crystal and max the bus jumpers — the classic gamble: free 486 speed if the cache chips keep up, corrupted disk writes if they don't."
    },
    {
      minYear: 1998, maxYear: 2009, method: "FSB & multipliers",
      conservative: "Raise the front-side bus one notch at stock voltage — the Celeron 300A trick in miniature, safe on almost any decent board of the day.",
      balanced: "Push the FSB with a modest core-voltage bump and drop the memory divider so the RAM stays in spec; a night of stress testing tells the truth.",
      aggressive: "Chase the legend: a big FSB jump with the voltage raised to match. When a budget chip catches a $600 one it's glorious — when it doesn't, it reboots mid-benchmark."
    },
    {
      minYear: 2010, maxYear: 2016, method: "Unlocked multipliers & BCLK",
      conservative: "Add two bins to the multiplier on this unlocked chip and switch on the XMP memory profile — nearly free performance at stock voltage.",
      balanced: "Set a fixed all-core multiplier with a small vcore bump and steady the droop with load-line calibration, then stress it for a full evening.",
      aggressive: "Push the vcore toward the community's red line and find out what this sample drew in the silicon lottery — big bins, or a lesson in thermals."
    },
    {
      minYear: 2017, maxYear: 2100, method: "Boost tuning & PBO",
      conservative: "Modern chips mostly tune themselves — enable the memory profile and lift the boost limits a hair, then let the firmware do the pushing.",
      balanced: "Dial in the boost overrides with per-core offsets and an undervolt where the sample allows — more sustained clocks at less heat, the modern win.",
      aggressive: "Flatten every limit: maximum boost scalar or a manual all-core with serious cooling behind it. The gains are real, and so is the power bill."
    }
  ];

})(typeof window !== 'undefined' ? window : globalThis);
