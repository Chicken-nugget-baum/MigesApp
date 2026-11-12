// Villagers as data. PLACEHOLDERS: replace names, looks, homes and lines with the real family / Nesselnbacher.
// Format: see PLAN.md ("Character data format"). Homes: haus1-haus12, beiz (js/data/scene.js, nearest to the centre).
// POIs: dorfplatz, bushalt, unterdorf, kapelle, beiz, ifangweg, kapellenweg, niederwilerstrasse, quartier, home:<houseId>
// Old 2D names (reuss, wald, gartebahn, niederwil, ...) still work as aliases, see js/world.js.
window.NB = window.NB || {};
NB.Data = NB.Data || {};
// Visitors who come by car: members (character ids), the car, and the windows the arrival / departure time is
// drawn from each day. Joel + Mariana from Lenzburg in their electric Mini, parked at Mige's (map.farmProps.parking).
NB.Data.visitors = [
  {
    members: ['joel', 'mariana'],
    car: { color: '#1f5c3a', name: 'Mini (elektrisch)', lines: ['Summ… (elektrisch, ganz liislig)', 'LB-Kennzeiche: Lenzburg–Nesselnbach und zrugg.', 'Lädt bi de Mige am Hof. 🔌', 'Joel und Mariana ihre Mini Cooper.'] },
    arrive: ['10:30', '13:00'], leave: ['20:00', '22:00'],
  },
  // Yves comes from Mellingen with the Postauto (by: 'bus' = gets off / boards at the Mitteldorf stop).
  { members: ['yves'], by: 'bus', car: {}, arrive: ['08:20', '09:30'], leave: ['20:30', '21:45'] },
  // The milk lorry collects at the Milchzentrale twice a day and stays a few minutes (stay = minutes).
  { members: [], park: 'dairy', car: { type: 'tanker', color: '#2f6fb5', name: 'Milchtransporter', lines: ["Frischi Milch für d'Chäserei!", 'Jede Morge und jede Abig: Milch abhole.', "12'000 Liter passe do dri."] }, arrive: ['07:10', '07:50'], stay: [3, 5] },
  { members: [], park: 'dairy', car: { type: 'tanker', color: '#2f6fb5', name: 'Milchtransporter', lines: ["Frischi Milch für d'Chäserei!", 'Jede Morge und jede Abig: Milch abhole.', "12'000 Liter passe do dri."] }, arrive: ['18:20', '19:00'], stay: [3, 5] },
];
// The Niederwil fire brigade (comes when the Milchzentrale burns). Raphy Naef is one of the crew.
NB.Data.firebrigade = { name: 'Füürwehr Niederwil', lines: ['Tatü-tata! Platz do!', 'Füürwehr Niederwil – scho wider Nesselnbach?', 'Wasser hämmer gnueg debii.'] };
NB.Data.firefighters = [
  { name: 'Raphy Naef', voice: 0.85, look: { skin: '#5a3a28', hair: '#1a1210', hairStyle: 'cap', cap: '#e8c23a', shirt: '#c0392b', pants: '#2a2a3a', bands: ['#f2e85a', '#c0392b'], shoes: '#1a1a1a' },
    lines: ['Wasser marsch!', 'Scho wider d\'Milchzentrale?!', 'Zrugg, Lüüt, das isch heiss!', 'Raphy do – mir händ\'s im Griff.'], clicks: ['Raphael Naef, Füürwehr Niederwil. Alles under Kontrolle!', 'Chasch mer en Kafi bringe, wenn\'s glöscht isch?', 'Zrugg bliibe, gäll!'] },
  { name: 'Füürwehrler Kurt', voice: 0.7, look: { skin: '#e8b890', hair: '#8a8a8a', hairStyle: 'cap', cap: '#e8c23a', shirt: '#c0392b', pants: '#2a2a3a', bands: ['#f2e85a', '#c0392b'], shoes: '#1a1a1a', beard: true },
    lines: ['Meh Druck uf de Schluuch!', 'Links bränt\'s no!', 'Ruhig bliibe, mir sind do.'] },
  { name: 'Füürwehrleri Nadja', voice: 1.2, look: { skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'cap', cap: '#e8c23a', shirt: '#c0392b', pants: '#2a2a3a', bands: ['#f2e85a', '#c0392b'], shoes: '#1a1a1a' },
    lines: ['Isch öpper no dinne?', 'Wasser marsch!', 'Fasch glöscht!'] },
];
NB.Data.characters = [
  // ---------------- family ----------------
  // Mige: pink long hair, black shirt, jeans. Lives in the Buurehuus (Niederwilerstrasse 3) with Mina and Luna.
  {
    id: 'mige', name: 'Mige', home: 'buurehuus', cycle: true,
    look: { skin: '#f1c7a0', hair: '#ff7ac8', hairStyle: 'long', shirt: '#1f1d22', pants: '#3f68a8', shoes: '#f4f1ea' },
    voice: 1.3, favorites: ['sitzplatz', 'hof', 'dorfplatz'],
    routine: [{ at: '07:30', go: 'hof' }, { at: '08:30', go: 'home:buurehuus' }, { at: '12:00', go: 'sitzplatz' }, { at: '13:00', go: 'home:buurehuus' }, { at: '17:30', go: 'dorfplatz' }, { at: '18:30', go: 'hof' }, { at: '19:15', go: 'sitzplatz' }, { at: '21:00', go: 'home:buurehuus' }],
    sleep: ['23:30', '07:00'],
    clicks: ['Mina, Luna, ÄSSE!', 'Shiiit, es lauft so viel im Gschäft.', 'Joel, hesch bock zum Vibe Code?'],
    random: ['Mina, Luna, ÄSSE!', 'Shiiit, es lauft so viel im Gschäft.', 'Joel, hesch bock zum Vibe Code?'],
    night: ['Joel, hesch bock zum Vibe Code?', 'Mina, Luna, ÄSSE!'],
  },
  {
    id: 'grosi', name: 'Grosi', home: 'haus1',
    look: { skin: '#f1c7a0', hair: '#d8d8d8', hairStyle: 'bun', shirt: '#7a4aa0', dress: '#7a4aa0', glasses: true, apron: '#ffffff' },
    voice: 1.45, favorites: ['dorfplatz', 'kapelle', 'gartebahn'],
    routine: [{ at: '08:30', go: 'dorfplatz' }, { at: '10:00', go: 'kapelle' }, { at: '11:15', go: 'home:haus1' }, { at: '14:30', go: 'gartebahn' }, { at: '16:30', go: 'home:haus1' }],
    sleep: ['21:30', '07:00'],
    clicks: ['Grüezi wohl! Wotsch es Guetzli?', 'Ou, du bisch aber gwachse!', 'Hesch scho z\'Mittag gässe?', 'Jetz lass mi aber, ich mues go chüechle!'],
    random: ['Die Chatze sind hüt wider ganz verschmust.', 'Am Sunntig git\'s Züpfe!', 'Wie d\'Ziit vergoht…'],
    night: ['Gang is Bett, es isch spoot!'],
  },
  {
    id: 'grospi', name: 'Grospi', home: 'haus1',
    look: { skin: '#e8b890', hair: '#c8c8c8', hairStyle: 'cap', cap: '#3a5f9a', shirt: '#6a8a5a', pants: '#4a4038', beard: true },
    voice: 0.75, favorites: ['beiz', 'reuss', 'gartebahn'],
    routine: [{ at: '07:30', go: 'gartebahn' }, { at: '10:00', go: 'reuss' }, { at: '11:45', go: 'home:haus1' }, { at: '15:00', go: 'beiz' }, { at: '18:00', go: 'home:haus1' }],
    sleep: ['22:00', '06:30'],
    clicks: ['Salü! Lueg emol mini Gartebahn!', 'Früener isch alles anders gsi.', 'Hesch ghört? D\'Reuss isch hüt höch.', 'Jetz längts aber, gopfriedstutz!'],
    random: ['D\'Lok bruucht wider es bitzli Öl.', 'Es Bierli am Abig schadet nüt.', 'Hüt biisse d\'Fisch.'],
    night: ['Jo jo, ich gang jo scho hei.'],
  },
  {
    id: 'mami', name: 'Mami', home: 'haus2',
    look: { skin: '#f1c7a0', hair: '#8a5a32', hairStyle: 'long', shirt: '#d94a6a', pants: '#3a3f55' },
    voice: 1.25, favorites: ['dorfplatz', 'quartier', 'bushalt'],
    routine: [{ at: '07:15', go: 'bushalt' }, { at: '08:00', go: 'home:haus2' }, { at: '10:00', go: 'dorfplatz' }, { at: '12:00', go: 'home:haus2' }, { at: '16:00', go: 'quartier' }, { at: '18:00', go: 'home:haus2' }],
    sleep: ['23:00', '06:30'],
    clicks: ['Hoi Schatz!', 'Hesch dini Hausufzgi gmacht?', 'Ich mues no go poschte.', 'Jetz isch aber gnueg, gäll!'],
    random: ['S\'Znacht isch am sächsi parat!', 'Wer het mini Schlüssel gseh?'],
    night: ['Psst, alli schlofed scho.'],
  },
  {
    id: 'papi', name: 'Papi', home: 'haus2',
    look: { skin: '#e8b890', hair: '#3a2a1a', hairStyle: 'short', shirt: '#2a5fb0', pants: '#2a2a3a', glasses: true },
    voice: 0.85, favorites: ['beiz', 'casino', 'quartier'],
    routine: [{ at: '06:45', go: 'bushalt' }, { at: '07:30', go: 'niederwil' }, { at: '17:30', go: 'home:haus2' }, { at: '19:30', go: 'beiz' }, { at: '21:00', go: 'home:haus2' }],
    sleep: ['23:30', '06:15'],
    clicks: ['Hoi zäme!', 'Ich gang schaffe, tschüss!', 'Wär het s\'Auto wider so parkiert?', 'Uf jetz, lass mi in Rueh!'],
    random: ['Hüt isch es stressig gsi.', 'Am Wuchenänd gömmer go wandere.'],
    night: ['Guet Nacht!'],
  },
  {
    id: 'gotti', name: 'Gotti', home: 'haus3',
    look: { skin: '#f1c7a0', hair: '#e0b030', hairStyle: 'ponytail', shirt: '#2f9a8a', pants: '#3a3f55' },
    voice: 1.35, favorites: ['dorfplatz', 'gnadenthal', 'reuss'],
    routine: [{ at: '09:00', go: 'gnadenthal' }, { at: '12:00', go: 'home:haus3' }, { at: '14:00', go: 'reuss' }, { at: '17:00', go: 'dorfplatz' }, { at: '19:00', go: 'home:haus3' }],
    sleep: ['23:00', '07:30'],
    clicks: ['Hoi du! Schön di z\'gseh!', 'Chunnsch mit a d\'Reuss?', 'Ich ha dir öppis mitbrocht!', 'Nei jetz, gnueg kitzlet!'],
    random: ['Was für es schöns Wätter!', 'D\'Ente sind so herzig.'],
    night: ['Schlof guet!'],
  },
  {
    id: 'goetti', name: 'Götti', home: 'haus4',
    look: { skin: '#d9a27a', hair: '#2a2a2a', hairStyle: 'spiky', shirt: '#c0392b', pants: '#2a2a3a' },
    voice: 0.9, favorites: ['casino', 'beiz', 'wald'],
    routine: [{ at: '08:00', go: 'wald' }, { at: '11:30', go: 'home:haus4' }, { at: '14:00', go: 'casino' }, { at: '18:00', go: 'beiz' }, { at: '20:30', go: 'home:haus4' }],
    sleep: ['00:00', '07:30'],
    clicks: ['Hey, alles klar?', 'Wotsch en Witz ghöre?', 'Wieso isch d\'Chue uf de Wiese? Will si ned flüüge cha!', 'Gnueg glachet für hüt!'],
    random: ['Im Wald hets hüt Pilz.', 'Wer chunnt mit is Casino?'],
    night: ['Nur no eis Bierli…'],
  },
  // Joel: brown short hair, black glasses, white pullover, dark jeans. Lives in Lenzburg with Mariana; the two
  // visit regularly by electric Mini (NB.Data.visitors below) and park at Mige's (`home` = their base while here).
  // Dry, short sentences, half his mind on code (vibe coding), coffee by day, beer at the Beiz, soft spot for Luna.
  // Pretends not to like "Joelito Papacito" but answers to it.
  {
    id: 'joel', name: 'Joel', home: 'buurehuus', visitor: true, cycle: true,
    look: { skin: '#eec1a0', hair: '#6b4226', hairStyle: 'short', glasses: true, shirt: '#f4f3ee', pants: '#26324a', shoes: '#2a2a2a' },
    voice: 0.85, favorites: ['sitzplatz', 'hof', 'beiz'],
    routine: [{ at: '10:00', go: 'hof' }, { at: '10:45', go: 'home:h31' }, { at: '12:15', go: 'sitzplatz' }, { at: '13:30', go: 'home:buurehuus' }, { at: '15:00', go: 'fischerplatz', do: 'fish' }, { at: '17:30', go: 'beiz' }, { at: '19:00', go: 'sitzplatz' }],
    arriveLines: ['Hoi Mige, sind mer!', 'Lenzburg–Nesselnbach: 25 Minute, ganz liislig.', 'Mige, dörf i de Mini alade?', 'Zerscht en Kafi. Denn alles anderi.'],
    leaveLines: ['Tschüss Mige, bis bald!', 'Hei nach Lenzburg. Mariana, chunnsch?', 'De Mini isch glade, los!', 'Mami, mir händ gässe. Ehrlich.'],
    clicks: ['Vibe Code forever! 💻', 'Ich bi nid Joelito. … Okay, chli.', 'Momänt, nur no schnäll es Feature.', 'Dörfi de Luna en Snack geh?', 'Mige – gits en Zigi?', 'Es Bier? Jo. Es Kafi? Au.'],
    random: ['Das chönnt mer automatisiere.', 'De Mini het no 80 Prozänt, langet für Lenzburg.', 'Mariana, nid so lut, de Weiher-Buur…', 'Kafi. Denn Code. Denn Bier.', 'Brüederli, zocke isch nid schaffe.'],
    night: ['No ei Commit, denn fahre mer.', 'Mige – gits en Zigi?'],
    // fishing at the Löli-Weiher (secretly – the Weiher-Buur chases them away)
    fishLines: ['Psst, de Weiher-Buur dörf üs nid gseh!', 'Hüt biisst sicher eine.', 'Mariana, lueg, de Schwimmer!', 'So ruhig. Fasch wie Code ohni Bugs.'],
    biteLines: ['Es biisst!', 'Ha eine! 🐟', 'Ui, en Grosse!', 'Mist, abghaue. Wie en Bug.'],
    caughtLines: ['Ups… verwütscht! Hau ab, Mariana!', 'Mir sind nur am Luege gsi, ehrlich!', 'Schnäll, hei!'],
  },
  // Mariana: Joel's girlfriend, from Ocotlán (Jalisco), later Guadalajara, now Lenzburg. Works in Zürich at the
  // tortillería "Mas Amor" (authentic tortillas, import/export of Mexican products). Warm, direct, the one who starts
  // things ("Gömmer?"), everything good is "geil", Joel is only ever "Joelito Papacito", Spanish slips out under
  // emotion (¡No manches! ¡Chintrolletta! ¡Órale!). Always cold here, cooks tacos for everyone, phones her parents a lot.
  // Look: dark skin, long black hair with a flower, hoop earrings, embroidered blouse in rosa mexicano.
  {
    id: 'mariana', name: 'Mariana', home: 'buurehuus', visitor: true, cycle: true,
    look: { skin: '#c98a5e', hair: '#1c1210', hairStyle: 'long', flower: '#ff4f7a', earrings: true, shirt: '#e4007c', bands: ['#ffd23f', '#2fbf71'], pants: '#3a3f55', shoes: '#f4f1ea' },
    voice: 1.35, favorites: ['sitzplatz', 'hof', 'weiher'],
    routine: [{ at: '10:00', go: 'hof' }, { at: '10:45', go: 'home:h31' }, { at: '12:15', go: 'sitzplatz' }, { at: '13:30', go: 'home:buurehuus' }, { at: '15:00', go: 'fischerplatz', do: 'fish' }, { at: '17:30', go: 'sitzplatz' }],
    arriveLines: ['¡Hola! Mina, Luna, mir sind do!', 'Geil, Nesselnbach! Gömmer zerscht zu de Chatze?', 'Hoi Mige! Ich ha Tortillas vo Mas Amor debii. 🌮', '¡No manches! Isch das wider chalt do.'],
    leaveLines: ['Gömmer, Joelito Papacito. Hasta mañana, Nesselnbach!', '¡Adiós! Bis zum nöchschte Mol!', 'Joelito, hesch de Schlüssel? ¡Vámonos!', 'Morn am sächsi Tortillas mache. Gömmer hei.'],
    clicks: ['Joelito Papacito, gömmer go fische?', 'Das sind Manolo und Morgan, mini Border Collies. Morgan het drü Bei – und isch de schnällscht!', 'Geil, d\'Luna isch wider do!', 'Hüt chochi Tacos für alli. Geil, oder? 🌮', 'Ich schaffe bi Mas Amor in Züri – die beschte Tortillas vo de Schwiiz!', '¡No manches! Scho wider Räge?', '¡Chintrolletta! Jetz längts aber, gömmer.'],
    random: ['Manolo! Morgan! ¡Vengan! Geil, so bravi Hünd.', 'Z\'Ocotlán isch es jetz 30 Grad. Do: zäh. ¡No manches!', 'Iris, dini Züpfe isch geil. Fasch so guet wie Tamales.', 'Yves, gömmer go fische? Nei? Feigling.', 'Mir importiere jetz au Salsa und Mezcal. Geil, oder?', 'Joelito Papacito, leg s\'Handy wäg.', 'In Guadalajara git\'s a jedere Egge Tacos. Do: Cervelat.'],
    night: ['Buenas noches, Nesselnbach. Gömmer, Joelito?'],
    // calls home to Ocotlán (said with a pause, facing the viewer)
    phoneLines: ['¡Hola mamá! Sí, es isch chalt. Immer.', '¡Papá! Ich ha hüt 2000 Tortillas gmacht.', 'Mamá, de Joelito seit hallo. … Sí, de Papacito.', 'Mamá, d\'Chatze sind geil do. Luna und Mina.', 'Papá, sí, mir chömed a Wiehnacht uf Ocotlán.'],
    fishLines: ['Joelito, du machsch z\'vill Lärm! ¡Silencio!', 'So schön ruhig do am Weiher… geil.', 'Ha eine! …nei, nur Alge. ¡Chintrolletta!', 'Chunnt de Weiher-Buur? ¡Cuidado!'],
    biteLines: ['¡Órale! Geil, de isch riesig!', 'Joelito Papacito, lueg, min isch grösser!', 'Es zieht! ¡Rápido!'],
    caughtLines: ['¡Chintrolletta! Joelito, renn!', '¡No manches! Mir sind scho wäg!', '¡Córrele, Papacito!'],
  },
  // Iris: Joel's and Yves's mother. Lives at Ifangweg 15 (h31). Yves is there a lot; Joel and Mariana drop by.
  {
    id: 'iris', name: 'Iris', home: 'h31', cycle: true,
    look: { skin: '#f1c7a0', hair: '#a8763e', hairStyle: 'long', shirt: '#7b5ea7', pants: '#3a3f55', shoes: '#4a3a30' },
    voice: 1.2, favorites: ['ifangweg', 'dorfplatz', 'kapelle', 'sitzplatz'],
    routine: [{ at: '07:30', go: 'ifangweg' }, { at: '09:00', go: 'dorfplatz' }, { at: '10:30', go: 'home:h31' }, { at: '12:00', go: 'home:h31' }, { at: '14:00', go: 'ifangweg' }, { at: '16:00', go: 'kapelle' }, { at: '17:30', go: 'home:h31' }, { at: '19:15', go: 'sitzplatz' }, { at: '21:30', go: 'home:h31' }],
    sleep: ['23:00', '06:45'],
    clicks: ['Joel! Hesch gnueg gässe?', 'Mariana, wotsch no en Kafi?', 'Yves, rum emol dis Zimmer uf!', 'Ihr sind mir Zwei!'],
    random: ['Wenn chunnt de Joel wider?', "D'Chatze händ scho wider Hunger.", 'Am Sunntig gits Züpfe für alli.', 'De Yves isch scho wider am Zocke.'],
    night: ['Gönd is Bett, alli zäme!'],
  },
  // Yves: Joel's brother. Lives in Mellingen, comes over with the Postauto most days to see Iris (and Mige).
  {
    id: 'yves', name: 'Yves', home: 'h31', visitor: true, cycle: true,
    look: { skin: '#eec1a0', hair: '#4a3220', hairStyle: 'short', shirt: '#2a2a2e', pants: '#3a5f9a', shoes: '#f4f1ea' },
    voice: 0.9, favorites: ['ifangweg', 'hof', 'beiz', 'bushalt'],
    routine: [{ at: '09:00', go: 'home:h31' }, { at: '12:00', go: 'home:h31' }, { at: '13:30', go: 'ifangweg' }, { at: '15:00', go: 'home:h31' }, { at: '17:00', go: 'beiz' }, { at: '18:30', go: 'hof' }, { at: '19:15', go: 'sitzplatz' }, { at: '20:15', go: 'home:h31' }],
    arriveLines: ["S'Postauto isch pünktlich gsi, für einisch.", 'Hoi Nesselnbach! Mami, ich bi do!', 'Vo Mellige bis do: 12 Minute. Tschau zäme.'],
    leaveLines: ['Ich mues s\'Postauto verwütsche. Tschau Mami!', 'Zrugg uf Mellige. Bis morn!', 'Wenn chunnt das Postauto ändlich?'],
    clicks: ['Hey Brüederli!', 'Joel, zocke mer hüt no?', 'Mariana, hesch du de Joel gseh?', 'Lass mi in Rueh, Mann!'],
    random: ['Wär chunnt go Pingpong spile?', 'De Mini vom Joel isch scho geil. Ich ha s\'Postauto.', 'Mami, was gits z\'Ässe?', 'Mige, hesch Kafi?'],
    night: ['No ei Rundi, denn gang i uf s\'Postauto.'],
  },
  // ---------------- villagers ----------------
  {
    id: 'buur', name: 'De Buur', home: 'haus6',
    look: { skin: '#d9a27a', hair: '#5a3a22', hairStyle: 'straw', shirt: '#3a6f9a', pants: '#3a4a6a', beard: true },
    voice: 0.7, favorites: ['feld', 'weide', 'unterdorf'],
    routine: [{ at: '05:30', go: 'weide' }, { at: '06:20', go: 'milchzentrale' }, { at: '07:00', go: 'unterdorf' }, { at: '09:00', go: 'feld' }, { at: '12:00', go: 'home:haus6' }, { at: '13:30', go: 'feld' }, { at: '17:00', go: 'weide' }, { at: '18:10', go: 'milchzentrale' }, { at: '19:00', go: 'home:haus6' }],
    sleep: ['21:00', '05:00'],
    clicks: ['Grüessech! Lueg, mis Feld!', 'De Traktor lauft wie gschmiert.', 'Hüt wird gheuet!', 'Ich ha kei Ziit, ich mues schaffe!'],
    random: ['Hoffentlich rägnet\'s bald.', 'D\'Furche müend grad si.', 'S\'Chorn staht guet dis Johr.', 'D\'Milch mues no i d\'Milchzentrale.'],
    night: ['Morn isch früe Tagwach.'],
  },
  // The Gehrigs: Silvia, Roman and Reto own and run the Milchzentrale at Kapellenweg 1 (milk collection + cheese
  // dairy, they live above it). It burned down recently and has been rebuilt.
  {
    id: 'silvia', name: 'Silvia Gehrig', home: 'milch', cycle: true,
    look: { skin: '#f1c7a0', hair: '#6b4a32', hairStyle: 'bun', shirt: '#ffffff', pants: '#3a3f55', apron: '#ffffff', shoes: '#f4f1ea' },
    voice: 1.25, favorites: ['milchzentrale', 'dorfplatz', 'kapelle'],
    routine: [{ at: '05:30', go: 'home:milch' }, { at: '09:30', go: 'dorfplatz' }, { at: '10:30', go: 'home:milch' }, { at: '14:00', go: 'milchzentrale' }, { at: '14:30', go: 'home:milch' }, { at: '18:30', go: 'milchzentrale' }, { at: '19:30', go: 'home:milch' }],
    sleep: ['22:00', '05:15'],
    clicks: ['Grüezi! Wotsch es Stückli Chäs probiere? 🧀', "Üse Talchäs – drü Mönet grift.", 'Nach em Brand händ mer alles neu baut. Lueg, wie schön!', 'Roman! Reto! D\'Chunde warted!'],
    random: ['Hüt sind\'s 300 Liter Milch gsi.', 'De Rauchmälder isch jetz neu, zum Glück.', 'Wo blibt de Milchtransporter?'],
    night: ['Morn am halbi sächsi gaht\'s wider los.'],
  },
  {
    id: 'roman', name: 'Roman Gehrig', home: 'milch', cycle: true,
    look: { skin: '#e8b890', hair: '#4a3220', hairStyle: 'short', shirt: '#ffffff', pants: '#2a2a3a', apron: '#ffffff', shoes: '#2a2a2a' },
    voice: 0.8, favorites: ['milchzentrale', 'beiz'],
    routine: [{ at: '05:15', go: 'home:milch' }, { at: '12:00', go: 'milchzentrale' }, { at: '12:45', go: 'home:milch' }, { at: '18:45', go: 'beiz' }, { at: '20:30', go: 'home:milch' }],
    sleep: ['22:30', '05:00'],
    clicks: ['De Chessi isch heiss – zrugg bliibe!', "D'Milch chunnt vo de Buure us em Dorf, jede Tag frisch.", 'Sit em Brand schlof i mit eim Aug offe.', 'Ich mues zrugg i d\'Chäserei!'],
    random: ['De Chäs mues no drü Mönet rife.', 'Reto, hesch de Tank putzt?', 'Buur, bring d\'Kanne vorne ane!'],
    night: ['Alles us? Chessi us? Guet.'],
  },
  {
    id: 'reto', name: 'Reto Gehrig', home: 'milch', cycle: true,
    look: { skin: '#eec1a0', hair: '#8a6a4a', hairStyle: 'cap', cap: '#ffffff', shirt: '#dfe3e8', pants: '#3a5f9a', shoes: '#2a2a2a' },
    voice: 0.9, favorites: ['milchzentrale', 'unterdorf', 'beiz'],
    routine: [{ at: '05:45', go: 'milchzentrale' }, { at: '06:30', go: 'home:milch' }, { at: '10:00', go: 'unterdorf' }, { at: '11:00', go: 'home:milch' }, { at: '17:30', go: 'milchzentrale' }, { at: '18:30', go: 'home:milch' }, { at: '19:30', go: 'beiz' }, { at: '21:00', go: 'home:milch' }],
    sleep: ['23:00', '05:30'],
    clicks: ['Hoi! Milch, Joghurt, Chäs – alles vo do.', 'Ich fahr d\'Milch zu de Buure go hole.', 'Nach em Brand händ alli gholfe. Danke, Nesselnbach!', 'Jetz längts, ich mues d\'Kanne wäsche.'],
    random: ['De Tank isch voll.', 'Silvia, d\'Chunde!', 'Hoffentlich brönnt\'s nie meh.'],
    night: ['Guet Nacht, Chäserei.'],
  },
  {
    id: 'wirtin', name: 'D\'Wirtin', home: 'beiz',
    look: { skin: '#f1c7a0', hair: '#a03a2a', hairStyle: 'bun', shirt: '#2f7a3c', dress: '#2f7a3c', apron: '#ffffff' },
    voice: 1.2, favorites: ['beiz', 'dorfplatz'],
    routine: [{ at: '07:00', go: 'dorfplatz' }, { at: '09:00', go: 'beiz' }, { at: '15:00', go: 'home:beiz' }, { at: '17:00', go: 'beiz' }],
    sleep: ['00:30', '06:30'],
    clicks: ['Willkomme i de Beiz!', 'Was dörf\'s sii?', 'Hüt git\'s Cordon bleu!', 'Zahle bitte, bevor du gohsch!'],
    random: ['De Stammtisch isch wider voll.', 'Wer het s\'Bier bstellt?'],
    night: ['Polizeistund, zäme!'],
  },
  {
    id: 'poeschtler', name: 'De Pöschtler', home: 'haus12',
    look: { skin: '#e8b890', hair: '#5a3a22', hairStyle: 'cap', cap: '#ffcc00', shirt: '#ffcc00', pants: '#2a2a3a' },
    voice: 1.0, favorites: ['quartier', 'dorfplatz', 'niederwil'],
    routine: [{ at: '08:00', go: 'quartier' }, { at: '10:00', go: 'niederwil' }, { at: '12:00', go: 'home:haus12' }, { at: '13:30', go: 'quartier' }, { at: '16:00', go: 'home:haus12' }],
    sleep: ['22:00', '06:00'],
    clicks: ['Poscht isch do!', 'Es Päckli für di!', 'Wieder kei Brief für di, sorry.', 'Ich ha\'s pressant!'],
    random: ['De Hund vo Huus 5 bällt immer.', 'So vill Päckli hüt!'],
  },
  {
    id: 'nochberi', name: 'D\'Nochberi', home: 'haus5',
    look: { skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'headscarf', scarf: '#d94a8a', shirt: '#8a6a4a', dress: '#8a6a4a' },
    voice: 1.3, favorites: ['dorfplatz', 'quartier', 'kapelle'],
    routine: [{ at: '08:00', go: 'quartier' }, { at: '10:00', go: 'dorfplatz' }, { at: '12:00', go: 'home:haus5' }, { at: '15:00', go: 'dorfplatz' }, { at: '17:30', go: 'home:haus5' }],
    sleep: ['22:00', '06:30'],
    clicks: ['Hesch scho ghört?', 'Weisch, wer zügled?', 'Das hesch aber ned vo mir!', 'Ich säg nüt meh!'],
    random: ['D\'Gartebahn isch wider z\'lut.', 'Wer het die Blueme do pflanzt?'],
  },
  {
    id: 'fischer', name: 'De Fischer', home: 'haus9',
    look: { skin: '#d9a27a', hair: '#8a8a8a', hairStyle: 'straw', shirt: '#4a6a3a', pants: '#3a3a3a', beard: true },
    voice: 0.8, favorites: ['reuss', 'wald', 'gnadenthal'],
    routine: [{ at: '06:00', go: 'reuss' }, { at: '11:00', go: 'home:haus9' }, { at: '14:00', go: 'reuss' }, { at: '19:00', go: 'beiz' }, { at: '21:00', go: 'home:haus9' }],
    sleep: ['22:30', '05:30'],
    clicks: ['Pssst! D\'Fisch!', 'Hüt isch e Forälle gsi, sooo gross!', 'Muesch ned so lut sii!', 'Jetz sind alli Fisch furt!'],
    random: ['D\'Reuss isch hüt ruhig.', 'Do hinde hets en Biber.'],
  },
  {
    id: 'chind', name: 'S\'Nochberschind', home: 'haus10',
    look: { skin: '#f1c7a0', hair: '#e0b030', hairStyle: 'short', shirt: '#e08a3c', pants: '#3a5f9a' },
    voice: 1.7, favorites: ['gartebahn', 'dorfplatz', 'weide', 'kapelle'],
    routine: [{ at: '07:30', go: 'bushalt' }, { at: '08:00', go: 'niederwil' }, { at: '12:00', go: 'home:haus10' }, { at: '13:30', go: 'weide' }, { at: '15:30', go: 'gartebahn' }, { at: '18:00', go: 'home:haus10' }],
    sleep: ['20:00', '07:00'],
    clicks: ['Fangis! Du bisch!', 'Lueg, ich cha so schnäll renne!', 'Hesch e Chatz gseh?', 'Mami! Dä/die plaget mi!'],
    random: ['Ich wott es Glace!', 'D\'Chue het mi agluegt!'],
    night: ['Ich bin no gar ned müed…'],
  },
];
