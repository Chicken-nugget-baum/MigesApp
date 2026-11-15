// Villagers as data: the real Nesselnbacher (plus a few unnamed villagers).
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
    arrive: ['07:45', '09:00'], leave: ['20:00', '22:00'],
  },
  // Yves comes from Mellingen in his Toyota Celica, up the Ifangweg, and parks in front of Iris's house.
  {
    members: ['yves'], park: 'iris', street: 'Ifangweg',
    car: { type: 'celica', color: '#b8bcc2', name: 'Toyota Celica vom Yves', lines: ['De Celica vom Yves. Brumm! 🏎️', 'Japanischi Technik – lauft und lauft.', 'Nöd z\'nöch – frisch gwäsche!', 'De Yves putzt ihn jede Samschtig.'] },
    arrive: ['08:20', '09:30'], leave: ['20:30', '21:45'],
  },
  // The milk lorry collects at the Milchzentrale twice a day and stays a few minutes (stay = minutes).
  { members: [], park: 'dairy', car: { type: 'tanker', color: '#2f6fb5', name: 'Milchtransporter', lines: ["Frischi Milch für d'Chäserei!", 'Jede Morge und jede Abig: Milch abhole.', "12'000 Liter passe do dri."] }, arrive: ['07:10', '07:50'], stay: [3, 5] },
  { members: [], park: 'dairy', car: { type: 'tanker', color: '#2f6fb5', name: 'Milchtransporter', lines: ["Frischi Milch für d'Chäserei!", 'Jede Morge und jede Abig: Milch abhole.', "12'000 Liter passe do dri."] }, arrive: ['18:20', '19:00'], stay: [3, 5] },
];
// The Niederwil fire brigade (comes when the Milchzentrale burns). Raphy Naef is one of the crew.
// Residents' car trips: the car is parked at home (map.parkings[parking]); on the days a trip happens (chance) the
// members walk to it at a time drawn from `go`, drive off and come back after `away` minutes. cruise: the car
// rumbles through the village once while they're out.
NB.Data.outings = [
  {
    parking: 'koch', street: 'Ifangweg',
    car: { type: 'jeep', color: '#5b6b3a', name: 'Militärjeep vom André', lines: ['Alte Armee-Jeep, Jahrgang 1963. Lauft wie es Ührli.', 'Brumm-brumm-tuck-tuck. 🚙', 'Kei Dach, kei Problem.', 'Ehemals Schwiizer Armee. Hüt: Ifangweg 23.'] },
    trips: [
      { members: ['andre', 'monika'], go: ['08:40', '10:00'], away: [40, 75], chance: 0.6,
        leave: { monika: 'André, mir fahred zum Gisler! 🌸', andre: 'Scho wider zum Gisler? Jo guet…' },
        back: { monika: 'Lueg, nomol zwei Hortensie vom Gisler! 🌸', andre: 'Mir händ jetzt meh Hortensie als Rase.' } },
      { members: ['andre'], go: ['10:45', '12:20'], away: [8, 14], chance: 0.9, dest: 'fuel', stay: 70,
        leave: { andre: 'De Jeep bruucht Diesel. Uf zur Gratank!' },
        at: { andre: 'Volltanke, bitte. Diesel. Und de Luftdruck prüefe.' },
        back: { andre: 'Vollgtankt. 1963er Jeep, 2026er Dieselpriis…' } },
      { members: ['andre'], go: ['13:40', '16:00'], away: [25, 55], chance: 0.85, cruise: true,
        leave: { andre: 'Ich mach no e Rundi mit em Jeep. 🚙' },
        back: { andre: 'So. Rundi gmacht – de Jeep lauft wie es Ührli.' } },
    ],
  },
];
NB.Data.firebrigade = { name: 'Füürwehr Niederwil', lines: ['Tatü-tata! Platz do!', 'Füürwehr Niederwil – scho wider Nesselnbach?', 'Wasser hämmer gnueg debii.'] };
NB.Data.firefighters = [
  { name: 'Raphy Naef', lead: true, voice: 0.85, look: { skin: '#5a3a28', hair: '#1a1210', hairStyle: 'cap', cap: '#ffffff', shirt: '#c0392b', pants: '#2a2a3a', bands: ['#f2e85a', '#ffffff'], shoes: '#1a1a1a' }, // white helmet = crew leader
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
    id: 'mige', name: 'Mige', home: 'buurehuus', mige: true, rel: 'Mina und Luna sind ihri Chatze',
    about: 'Chaotisch, aber härzig – kreativ und voller Ideä. Am Morge schaffet si hert, am Namittag backt si mit Liebi.',
    look: { skin: '#f1c7a0', hair: '#ff5ab8', hairStyle: 'long', shirt: '#1f1d22', pants: '#3f68a8', shoes: '#f8f6f0', iqos: true },
    voice: 1.3, favorites: ['sitzplatz', 'hof'],
    // 08-12 home office (js/entities/mige.js: outside at the Sitzplatz, inside when it rains), from 12 free time (her own plan)
    routine: [{ at: '07:30', go: 'hof' }, { at: '08:00', go: 'homeoffice', do: 'office' }, { at: '12:00', go: 'home:buurehuus', do: 'free' }, { at: '17:30', go: 'dorfplatz' }, { at: '18:30', go: 'hof' }, { at: '19:15', go: 'sitzplatz' }, { at: '21:00', go: 'home:buurehuus' }],
    sleep: ['23:30', '07:00'],
    morningLines: ['Shit, lies doch die Nachricht richtig.', 'Scho weder es Meeting!', 'No eis Excel... ich cha nüm.', 'Wär het die Mail ohni Aahang gschickt?!', 'Du bisch stumm gschaltet!', 'Piff Paff am Nüni!'],
    afternoonLines: ['Wotsch es Stück Gagichueche?', 'Isch de Beat scho do gsi?', 'Gits en Zigi?'],
  },

  // Joel: brown short hair, black glasses, white pullover, dark jeans. Lives in Lenzburg with Mariana; the two
  // visit regularly by electric Mini (NB.Data.visitors below) and park at Mige's (`home` = their base while here).
  // Dry, short sentences, half his mind on code (vibe coding), coffee by day, beer at the Beiz, soft spot for Luna.
  // Pretends not to like "Joelito Papacito" but answers to it.
  {
    id: 'joel', name: 'Joel', home: 'buurehuus', visitor: true, cycle: true, from: 'Lenzburg', rel: 'Fründ vo de Mariana · Sohn vo de Iris · Brüeder vom Yves', about: 'Kafi am Tag, Bier am Abig, Code immer.',
    look: { skin: '#eec1a0', hair: '#6b4226', hairStyle: 'short', glasses: true, shirt: '#f4f3ee', pants: '#26324a', shoes: '#2a2a2a' },
    voice: 0.85, favorites: ['sitzplatz', 'hof', 'beiz'],
    routine: [{ at: '07:30', go: 'sitzplatz' }, { at: '10:00', go: 'hof' }, { at: '10:45', go: 'terrasse' }, { at: '12:15', go: 'sitzplatz' }, { at: '13:30', go: 'home:buurehuus' }, { at: '15:00', go: 'fischerplatz', do: 'fish' }, { at: '17:30', go: 'beiz' }, { at: '19:00', go: 'sitzplatz' }],
    arriveLines: ['Hoi Mige, sind mer!', 'Lenzburg–Nesselnbach: 25 Minute, ganz liislig.', 'Mige, dörf i de Mini alade?', 'Zerscht en Kafi. Denn alles anderi.'],
    leaveLines: ['Tschüss Mige, bis bald!', 'Hei nach Lenzburg. Mariana, chunnsch?', 'De Mini isch glade, los!', 'Mami, mir händ gässe. Ehrlich.'],
    clicks: ['Vibe Code forever! 💻', 'Ich bi nid Joelito. … Okay, chli.', 'Momänt, nur no schnäll es Feature.', 'Dörfi de Luna en Snack geh?', 'Mige – gits en Zigi?', 'Es Bier? Jo. Es Kafi? Au.'],
    random: ['Das chönnt mer automatisiere.', 'De Mini het no 80 Prozänt, langet für Lenzburg.', 'Mariana, nid so lut, de Weiher-Buur…', 'Kafi. Denn Code. Denn Bier.', 'Brüederli, zocke isch nid schaffe.'],
    night: ['No ei Commit, denn fahre mer.', 'Mige – gits en Zigi?'],
    // when Manolo runs off: calming Mariana (works only sometimes), searching along, "told you so"
    partner: 'mariana',
    calmLines: ['Schatz, ruhig. De %d chunnt immer zrugg.', 'Mariana, er macht nur sis Ding. Er isch en Hund.', 'Er schmöckt sicher nur Ente. Chill.', 'Trink zerscht en Kafi. Er chunnt.'],
    searchAlongLines: ['Okay, okay. Ich chume mit.', 'Jo guet… %d! Komm!', 'Ich nimm d\'Guetzli mit.'],
    stayReplies: ['Gsehsch. Alles guet.', 'Er isch gross. Er findet hei.'],
    backReplies: ['Gsehsch, Schatz? Er chunnt immer zrugg.', 'Ha der\'s jo gseit.', 'De %d het nur Hunger becho.'],
    foundOtherLines: ['Mariana! Ich ha ihn – de %d isch do!', '%o, er isch do! Bim Weiher. Natürlich.'],
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
    id: 'mariana', name: 'Mariana', home: 'buurehuus', visitor: true, cycle: true, from: 'Lenzburg', rel: 'Fründin vom Joel', about: 'Us Ocotlán und Guadalajara 🇲🇽 · schafft bi de Tortillería «Mas Amor» z Züri.',
    look: { skin: '#c98a5e', hair: '#1c1210', hairStyle: 'long', flower: '#ff4f7a', earrings: true, shirt: '#e4007c', bands: ['#ffd23f', '#2fbf71'], pants: '#3a3f55', shoes: '#f4f1ea' },
    voice: 1.35, favorites: ['sitzplatz', 'hof', 'weiher'],
    routine: [{ at: '07:30', go: 'sitzplatz' }, { at: '10:00', go: 'hof' }, { at: '10:45', go: 'terrasse' }, { at: '12:15', go: 'sitzplatz' }, { at: '13:30', go: 'home:buurehuus' }, { at: '15:00', go: 'fischerplatz', do: 'fish' }, { at: '17:30', go: 'sitzplatz' }],
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
    // Manolo ran off again (%d = the dog): she notices, worries, decides to look for him (or to wait), calls, finds him
    partner: 'joel',
    lostLines: ['¿%d? ¡¿MANOLO?! Joelito, wo isch de %d?!', '¡No manches! De %d isch scho wider wäg!', '¡Ay, Dios mío! %d! ¡Ven aquí!'],
    searchLines: ['Nei, Joelito, ich gang ihn jetzt go sueche! ¡Vámonos!', 'Mir gönd ihn go sueche. Sofort!', 'Ich cha nöd eifach do sitze! Gömmer!'],
    stayLines: ['…okay, Joelito. Aber wenn er in föif Minute nöd do isch…', 'Bueno… er chunnt sicher. ¿Verdad?', 'Okay. Aber ich luege jedi Minute.'],
    worryLines: ['¿Dónde está mi bebé?', 'Joelito, er isch immer no nöd do…', 'Morgan, wo isch din Brüeder?', '¡%d! … Nüt.'],
    callLines: ['¡%d! ¡MANOLO!', '¡%d, ven aquí!', 'Manolito! ¡Galletas!', '¡%d! ¿Dónde estás?'],
    foundLines: ['¡%d! ¡Aquí estás! Du chline Chintrolletta!', '¡Ahí está! %d, nie meh devo laufe!'],
    foundBackLines: ['Gracias a Dios… Nie meh, %d. ¡Nunca más!', 'Geil, alli wider binenand. 💛'],
    backLines: ['¡%d! ¡Gracias a Dios! Wo bisch du gsi?!', 'Do isch er! Ganz eleige zrugg cho. ¡Mi bebé!', '%d! Du schmöcksch nach Weiher… ¡qué asco!'],
    // when Karin's Kuba barks at Manolo and Morgan / when Karin greets her
    meetReplies: ['¡Hola Karin! Kuba, no manches, so lut!', 'Hoi Karin! De Manolo und de Morgan händ de Kuba gern. Geil!', 'Karin! ¡Qué lindo! De Kuba isch so herzig.'],
    karinLines: ['¡Hola Karin! Hoi Kuba!', 'Hoi Karin! Geil, d\'Gassirundi!'],
  },
  // Iris: Joel's and Yves's mother. Lives at Ifangweg 15 (h31). Yves is there a lot; Joel and Mariana drop by.
  {
    id: 'iris', name: 'Iris', home: 'h31', cycle: true, rel: 'Mueter vom Joel und vom Yves', about: 'Am liebschte im Garte – und mit de Nuria vo nebedra.',
    look: { skin: '#f1c7a0', hair: '#a8763e', hairStyle: 'long', shirt: '#7b5ea7', pants: '#3a3f55', shoes: '#4a3a30' },
    voice: 1.2, favorites: ['garte', 'terrasse', 'dorfplatz', 'kuerbismarkt', 'kapelle'],
    // most of her day is in her garden: watering the beds in the morning and afternoon, coffee on the terrace,
    // the fire pit in the evening
    routine: [{ at: '07:15', go: 'garte', do: 'garden' }, { at: '09:00', go: 'dorfplatz' }, { at: '10:30', go: 'terrasse' }, { at: '12:00', go: 'home:h31' }, { at: '13:30', go: 'garte', do: 'garden' }, { at: '15:30', go: 'terrasse' }, { at: '16:30', go: 'kapelle' }, { at: '17:45', go: 'garte', do: 'garden' }, { at: '19:15', go: 'fuurstell' }, { at: '21:30', go: 'home:h31' }],
    gardenLines: ['D\'Rose bruuched Wasser.', 'Mis Gmüesbeet! Lueg, d\'Rüebli chömed.', 'De Garte isch mis Paradies.', 'Die Hortensie het d\'Monika mir gschänkt.', 'Hüt no d\'Beet jäte.', 'Joel, chunnsch ächt emol go hälfe?'],
    gardenWinter: ['Im Winter schloft de Garte.', 'D\'Rose sind iipackt.', 'Ich plane scho s\'Frühlingsbeet.'],
    tagLines: ['Wart nume, ich verwütsch di! 😄', 'Uff, du bisch schnäll, Nuria!', 'Jetzt bin ich dra!'],
    sleep: ['23:00', '06:45'],
    clicks: ['Joel! Hesch gnueg gässe?', 'Mariana, wotsch no en Kafi? Uf de Terrasse?', 'Lueg mini Rose! Und d\'Hortensie!', 'Yves, rum emol dis Zimmer uf!', 'Ihr sind mir Zwei!'],
    random: ['Wenn chunnt de Joel wider?', "D'Chatze händ scho wider Hunger.", 'Am Sunntig gits Züpfe für alli.', 'De Yves isch scho wider am Zocke.'],
    night: ['Gönd is Bett, alli zäme!'],
  },
  // Yves: Joel's brother. Lives in Mellingen, comes over most days in his silver Toyota Celica to see Iris (and Mige).
  {
    id: 'yves', name: 'Yves', home: 'h31', visitor: true, cycle: true, from: 'Mellingen', rel: 'Brüeder vom Joel · Sohn vo de Iris', about: 'Chunnt mit sim silbrige Toyota Celica vo Mellige.',
    look: { skin: '#eec1a0', hair: '#4a3220', hairStyle: 'short', shirt: '#2a2a2e', pants: '#3a5f9a', shoes: '#f4f1ea' },
    voice: 0.9, favorites: ['ifangweg', 'hof', 'beiz', 'bushalt'],
    routine: [{ at: '09:00', go: 'terrasse' }, { at: '12:00', go: 'home:h31' }, { at: '13:30', go: 'ifangweg' }, { at: '15:00', go: 'terrasse' }, { at: '17:00', go: 'beiz' }, { at: '18:30', go: 'hof' }, { at: '19:15', go: 'sitzplatz' }, { at: '20:15', go: 'home:h31' }],
    arriveLines: ['De Celica lauft wie es Ührli. Hoi Mami!', 'Hoi Nesselnbach! Mami, ich bi do!', 'Vo Mellige bis do: 8 Minute mit em Celica. Tschau zäme.'],
    leaveLines: ['So, ab in Celica. Tschau Mami!', 'Zrugg uf Mellige. Bis morn!', 'Wo han ich de Schlüssel vom Celica?'],
    clicks: ['Hey Brüederli!', 'Joel, zocke mer hüt no?', 'Mariana, hesch du de Joel gseh?', 'Lass mi in Rueh, Mann!'],
    random: ['Wär chunnt go Pingpong spile?', 'De Mini vom Joel isch elektrisch. Min Celica het no en richtige Motor.', 'Mami, was gits z\'Ässe?', 'Mige, hesch Kafi?'],
    night: ['No ei Rundi, denn fahr ich hei.'],
  },
  // André Koch (Ifangweg 23): plays boule on the court in front of his house, drives an old army jeep.
  {
    id: 'andre', name: 'André Koch', home: 'h84', cycle: true, rel: 'Ma vo de Monika · Papi vo de Tanja · Grosspapi vo Louis und Nuria', about: 'Fahrt en alte Armee-Jeep und spielt Boule.',
    look: { skin: '#e8b890', hair: '#a8a8a8', hairStyle: 'cap', cap: '#5b6b3a', beard: true, shirt: '#6b7a4a', pants: '#3a4a6a', shoes: '#3a2e24' },
    voice: 0.75, favorites: ['boule', 'beiz', 'dorfplatz'],
    routine: [{ at: '07:00', go: 'home:h84' }, { at: '10:30', go: 'boule', do: 'boule' }, { at: '12:00', go: 'home:h84' }, { at: '16:30', go: 'boule', do: 'boule' }, { at: '18:00', go: 'beiz' }, { at: '19:15', go: 'home:h84' }],
    sleep: ['22:30', '06:30'],
    clicks: ['Hesch Bock uf e Partie Boule? 🎯', 'De Jeep? Alti Armee, Jahrgang 1963. Lauft wie es Ührli.', "Pointe oder tire – das isch do d'Frog.", "D'Monika und ihri Hortensie… mir händ jetzt meh Blueme als Rase."],
    random: ['Wo isch mis Säuli?', "Hüt lauft d'Chugle guet.", 'Am Samschtig gits es Turnier.', 'De Jeep bruucht nur echli Liebi und Öl.'],
    night: ['Morn spielemer wider.'],
    bouleLines: ['Pointe oder tire?', 'Konzentration…', 'Silber gäge Bronze – ich gäge mich.', "Wo isch s'Säuli?"],
    bouleGood: ['Dä ligt! 🎯', 'Perfekt ane gleit!', 'Wie im Militär: präzis.', 'Ha! Do wott ich dich gseh!'],
    bouleBad: ['Ohje… z wiit.', 'De Bode isch schief!', 'Hmpf. Das zellt nöd.', 'Kurz gseit: nei.'],
  },
  // Monika Koch (Ifangweg 23): tends her hydrangeas, loves the Gärtnerei Gisler in Niederwil.
  {
    id: 'monika', name: 'Monika Koch', home: 'h84', cycle: true, rel: 'Frau vom André · Mami vo de Tanja · Grossmami vo Louis und Nuria', about: 'Liebt Hortensie vom Gisler.',
    look: { skin: '#f1c7a0', hair: '#d9b26a', hairStyle: 'bun', shirt: '#f2a7c3', pants: '#5a6a8a', shoes: '#f4f1ea', apron: '#6aa35a', flower: '#7f9fe8' },
    voice: 1.15, favorites: ['hortensien', 'boulebank', 'kapelle'],
    routine: [{ at: '07:30', go: 'hortensien', do: 'garden' }, { at: '08:30', go: 'home:h84' }, { at: '11:00', go: 'hortensien', do: 'garden' }, { at: '12:00', go: 'home:h84' }, { at: '16:30', go: 'boulebank' }, { at: '18:00', go: 'hortensien', do: 'garden' }, { at: '19:00', go: 'home:h84' }],
    sleep: ['22:00', '06:30'],
    clicks: ['Lueg emol mini Hortensie! Alli vo de Gärtnerei Gisler. 🌸', 'Bim Gisler chönnt ich de ganz Tag sii.', 'André, nöd mit de Chugle i mini Hortensie!', 'Blau oder rosa? Das macht de Bode – seit de Gisler.'],
    random: ['Morn gang ich wider zum Gisler.', 'De Gisler hed die schönschte Hortensie wiit und breit.', 'Hesch scho mini Hortensie gseh?', 'Echli Kafi, echli Garte – perfekt.'],
    night: ['Guet Nacht, ihr Hortensie.'],
    gardenLines: ['Echli Wasser für eu… 💧', 'So schön blüehed er hüür!', 'Die hed mer de Gisler empfohle.', 'Nur nöd z viel Sunne, gäll.', 'Ihr sind mini Schätzli. 🌸'],
    gardenWinter: ['Schlofed guet, ihr Hortensie.', 'Im Früehlig gits neui vom Gisler.', "Nöd abschniide – sie bruuched d'Blüete als Schutz."],
  },
  // Ifangweg 17 (h1, new build 2021): Tanja – cousin of Joel, Mige and Yves, daughter of André and Monika Koch – with her
  // husband André (same name as her father) and their children Louis and Nuria. Louis plays football on the lawn
  // and helps his dad in the garden (`helps`).
  {
    id: 'tanja', name: 'Tanja', home: 'h1', cycle: true, kids: ['louis', 'nuria'], rel: 'Cousine vo Joel, Mige und Yves · Tochter vo André und Monika Koch · Mami vo Louis und Nuria', about: 'Wohnt mit em André und de Chind am Ifangweg 17.',
    look: { skin: '#f1c7a0', hair: '#8a5a32', hairStyle: 'ponytail', shirt: '#3aa59a', pants: '#2f3a55', shoes: '#f4f1ea', earrings: true },
    voice: 1.2, favorites: ['terrasse17', 'hortensien', 'dorfplatz', 'garte17'],
    routine: [{ at: '07:00', go: 'home:h1' }, { at: '07:28', go: 'bushalt' }, { at: '07:50', go: 'home:h1' }, { at: '09:30', go: 'boulebank' }, { at: '11:00', go: 'home:h1' }, { at: '14:00', go: 'terrasse17' }, { at: '15:30', go: 'dorfplatz' }, { at: '16:30', go: 'home:h1' }, { at: '18:30', go: 'terrasse17' }, { at: '20:30', go: 'home:h1' }],
    sleep: ['23:00', '06:30'],
    clicks: ['Louis! Nöd i d\'Fänschter schüsse!', 'Nuria, Zähnli putze isch au am Wuchenänd.', 'Ich gang no schnell zu de Mami übere.', 'De Joel isch min Cousin – de Mige und de Yves au.', 'Zwei Andrés i de Familie – das git Verwächslige.'],
    random: ['Wo isch ächt de Ball scho wieder?', 'De Papi und sini Boule…', 'Hüt Abig grilliere mer.', 'D\'Mami het wieder neui Hortensie kauft.'],
    night: ['Chind, is Bett!'],
    callKids: ['%k, chumm ine – Znacht! 🍝', '%k! Hände wäsche und denn an Tisch!', '%k, es isch Ziit!'],
    cheerKids: ['Bravo %k! 👏', 'Super, %k!', 'Was für es Goal, %k!'],
  },
  {
    id: 'andre2', name: 'André', home: 'h1', cycle: true, kids: ['louis', 'nuria'], rel: 'Ma vo de Tanja · Papi vo Louis und Nuria', about: 'Gliich heisse wie de Schwiegervater: André. Schaffet gärn im Garte.',
    look: { skin: '#e8b890', hair: '#3a2a1e', hairStyle: 'short', beard: true, shirt: '#3f68a8', pants: '#4a4238', shoes: '#3a2e24' },
    voice: 0.85, favorites: ['garte17', 'fuessball', 'terrasse17', 'beiz'],
    routine: [{ at: '06:45', go: 'home:h1' }, { at: '07:10', go: 'niederwil' }, { at: '16:45', go: 'home:h1' }, { at: '17:15', go: 'garte17', do: 'garden' }, { at: '18:15', go: 'fuessball', do: 'football' }, { at: '19:00', go: 'terrasse17' }, { at: '20:30', go: 'home:h1' }],
    sleep: ['23:00', '06:15'],
    clicks: ['Nei, ich bi de ander André. 😄', 'Louis, hol d\'Giesschanne!', 'De Rase mues gmäht werde – nach em Match.', 'Mini Schwiegermueter und ihri Hortensie…'],
    random: ['S\'Unchrut wachst schnäller als ich jäte cha.', 'Hüt goht de Louis is Goal, ich schüsse.', 'De Grill isch parat.'],
    night: ['Guet Nacht, Chind!'],
    gardenLines: ['S\'Unchrut mues weg.', 'Louis, du chasch d\'Rose giesse.', 'Echli Kompost, und es wachst.', 'De Hag mues gschnitte werde.'],
    gardenWinter: ['Im Winter isch de Garte im Winterschlof.', 'Im Früehlig säe mer neu.'],
    footballLines: ['Guete Pass!', 'Jetzt bin ich im Goal!', 'Louis, zeig wie de Embolo!', 'Nöd i d\'Hortensie vo de Grossmami!'],
    callKids: ['%k, ine cho – d\'Mami wartet!', '%k! Letschte Penalty, denn isch Schluss.'],
    cheerKids: ['Goal! Bravo %k!', 'Da hani kei Chance gha. 😄'],
    homeLines: ['Hoi zäme! Wie isch d\'Schuel gsi?', 'So, Fiirabig! Wer wott tschutte?'],
  },
  {
    id: 'louis', name: 'Louis', home: 'h1', cycle: true, parents: ['tanja', 'andre2'], helps: 'andre2', rel: 'Sohn vo de Tanja und vom André · Brüeder vo de Nuria · Grosschind vo de Kochs', about: 'Tschuttet am liebschte im Garte und hilft em Papi.',
    look: { kid: true, skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'short', shirt: '#d52b1e', pants: '#ffffff', shoes: '#2a2a2a' },
    voice: 1.6, favorites: ['fuessball', 'garte17', 'boule', 'weide'],
    routine: [{ at: '07:00', go: 'home:h1' }, { at: '07:30', go: 'bushalt' }, { at: '08:00', go: 'niederwil' }, { at: '12:00', go: 'home:h1' }, { at: '13:30', go: 'fuessball', do: 'football' }, { at: '15:00', go: 'boulebank' }, { at: '15:45', go: 'fuessball', do: 'football' }, { at: '17:00', go: 'home:h1' }, { at: '18:15', go: 'fuessball', do: 'football' }, { at: '19:15', go: 'home:h1' }],
    sleep: ['20:30', '07:00'],
    clicks: ['Wotsch mitspiele? ⚽', 'Ich wird mol Profi!', 'De Papi isch im Goal nöd so guet. Psst!', 'Ich ha hüt drü Goal gschosse!'],
    random: ['Penalty!', 'Grosspapi, spielsch Boule mit mir?', 'Nuria, gib de Ball!'],
    night: ['Nur no ei Match…'],
    gardenLines: ['Papi, wo söll ich giesse?', 'Ich ha en Wurm gfunde! 🪱', 'Sind das Rüebli?', 'Fertig – jetzt tschutte?'],
    gardenWinter: ['Isch chalt, Papi.', 'Im Winter wachst jo nüt.'],
    footballLines: ['Tooor! ⚽', 'Lueg, Papi!', 'Ich bi de Embolo!', 'Nochmal!', 'Volley!'],
    callReply: ['Nur no ei Penalty!', 'Jo-ho, Mami!', 'Fünf Minute no!'],
  },
  {
    id: 'nuria', name: 'Nuria', home: 'h1', cycle: true, parents: ['tanja', 'andre2'], rel: 'Tochter vo de Tanja und vom André · Schwöschter vom Louis · Grosschind vo de Kochs', about: 'D\'Chlii vo de Familie. Hilft de Grossmami bi de Hortensie.',
    look: { kid: true, skin: '#f1c7a0', hair: '#8a5a32', hairStyle: 'long', shirt: '#ff8ab0', pants: '#7a4aa0', shoes: '#f4f1ea', flower: '#ffd23f' },
    voice: 1.8, favorites: ['hortensien', 'terrasse17', 'fuessball'],
    routine: [{ at: '07:00', go: 'home:h1' }, { at: '07:30', go: 'bushalt' }, { at: '08:00', go: 'niederwil' }, { at: '12:00', go: 'home:h1' }, { at: '13:45', go: 'hortensien' }, { at: '15:00', go: 'fuessball', do: 'football' }, { at: '16:00', go: 'terrasse17' }, { at: '17:00', go: 'home:h1' }],
    sleep: ['20:00', '07:00'],
    clicks: ['Ich ha es Bild für d\'Grossmami gmalt!', 'De Louis tschuttet immer nur!', 'Mini Lieblingsfarb isch pink. 💗', 'Grosspapi, darf ich mit em Jeep fahre?'],
    random: ['Wo isch d\'Luna?', 'Ich wott au es Goal schüsse!', 'Lueg, en Schmetterling!'],
    night: ['Mami, no es Gschichtli?'],
    footballLines: ['Ich ha de Ball!', 'Louis, du bisch gemein!', 'Goal! Ich ha es Goal gschosse!'],
    callReply: ['Ich chume!', 'Mami, was gits?', 'Nur no schnell!'],
    gardenLines: ['Iris, wo söll ich giesse?', 'Lueg, en Schnägg! 🐌', 'Die Blueme schmöcked fein!', 'Darf ich e Rose für d\'Mami?'],
    gardenWinter: ['Isch de Garte jetzt am Schlofe?'],
    tagLines: ['Fangis! Du bisch! 😄', 'Iris, du chunnsch nöd noche!', 'Hihi!'],
  },
  // Ifangweg 18 (h25, one half of a double house with Ifangweg 16): Ernst and Regina. Ernst has a big garden railway
  // in the front garden and plays with it whenever he can.
  {
    id: 'ernst', name: 'Ernst', home: 'h25', cycle: true, rel: 'Ma vo de Regina', about: 'Het e riesigi Gartebahn im Vorgarte – Spur G, über 60 Meter Gleis.',
    look: { skin: '#e8b890', hair: '#c8c8c8', hairStyle: 'cap', cap: '#2f4f8f', glasses: true, shirt: '#8a3a2a', pants: '#3a3f55', shoes: '#3a2e24' },
    voice: 0.8, favorites: ['iisebahn', 'beiz', 'bushalt'],
    routine: [{ at: '07:30', go: 'home:h25' }, { at: '08:30', go: 'iisebahn', do: 'railway' }, { at: '11:45', go: 'home:h25' }, { at: '13:30', go: 'iisebahn', do: 'railway' }, { at: '16:00', go: 'beiz' }, { at: '17:00', go: 'iisebahn', do: 'railway' }, { at: '18:30', go: 'home:h25' }, { at: '19:30', go: 'iisebahn', do: 'railway' }, { at: '20:30', go: 'home:h25' }],
    sleep: ['22:30', '06:30'],
    clicks: ['Achtung, de Zug fahrt ab! 🚂', 'Spur G – 45 Millimeter. Die fahrt bi jedem Wätter.', 'Die roti Lok isch e Re 460 – wie bi de SBB.', 'De Bahnhof heisst Nesselnbach-Ifang. Sälber baut.', 'D\'Regina seit, ich söll weniger Gleis kaufe. Ich bi nöd iiverstande.'],
    random: ['Hüt fahrt de Güeterzug.', 'D\'Weiche klemmt wieder.', 'Im Winter mues ich d\'Gleis vom Schnee befreie.', 'Nöchscht Johr bau ich e Brugg.'],
    night: ['Morn fahre mer wieder.'],
    railLines: ['Tschu-tschu! 🚂', 'Weiche umstelle…', 'Pünktlich wie d\'SBB!', 'Achtung bim Bahnübergang!', 'Abfahrt Gleis 1!', 'De Güeterzug het Verspötig.'],
  },
  {
    id: 'regina', name: 'Regina', home: 'h25', cycle: true, rel: 'Frau vom Ernst', about: 'Wohnt mit em Ernst am Ifangweg 18. Seit, er heg meh Gleis als Rase.',
    look: { skin: '#f1c7a0', hair: '#cdb89a', hairStyle: 'short', shirt: '#b98bb0', pants: '#4a4a5a', shoes: '#f4f1ea', earrings: true },
    voice: 1.15, favorites: ['gartebahn', 'dorfplatz', 'kapelle', 'hortensien'],
    routine: [{ at: '07:30', go: 'home:h25' }, { at: '09:00', go: 'dorfplatz' }, { at: '10:30', go: 'gartebahn' }, { at: '11:30', go: 'home:h25' }, { at: '14:00', go: 'hortensien' }, { at: '15:30', go: 'gartebahn' }, { at: '16:30', go: 'kapelle' }, { at: '17:30', go: 'home:h25' }],
    sleep: ['22:30', '06:30'],
    clicks: ['Ernst! S\'Zmittag isch parat – lass d\'Iisebahn!', 'Mir händ meh Gleis als Rase.', 'Wenn er bi de Iisebahn isch, isch er glücklich.', 'Die chliine Hüüsli han ich gmalt.'],
    random: ['Wo isch de Ernst? – Dumm Frog. Bi de Bahn.', 'Hüt Abig gits Rösti.', 'D\'Monika het wieder neui Hortensie.'],
    night: ['Ernst, chumm is Bett!'],
  },
  // Ifangweg 21 (h86): Thomas Peterhans, the Gemeindeammann of Niederwil (Nesselnbach is part of the municipality).
  // He leads the Gmeiversammlig and gives the speech at the 1.-August celebration (js/entities/festivals.js).
  {
    id: 'peterhans', name: 'Thomas Peterhans', home: 'h86', cycle: true, rel: 'Gemeindeammann vo Niederwil', about: 'De Gemeindeammann (Bürgermeischter) vo Niederwil, wohnt am Ifangweg 21.',
    look: { skin: '#eec1a0', hair: '#7a6a5a', hairStyle: 'short', glasses: true, shirt: '#2f3a55', pants: '#4a4e58', shoes: '#2a2420' },
    voice: 0.9, favorites: ['dorfplatz', 'beiz', 'kapelle', 'bushalt'],
    routine: [{ at: '07:00', go: 'home:h86' }, { at: '07:40', go: 'niederwil' }, { at: '12:00', go: 'home:h86' }, { at: '13:15', go: 'niederwil' }, { at: '17:30', go: 'home:h86' }, { at: '18:30', go: 'dorfplatz' }, { at: '19:30', go: 'beiz' }, { at: '21:00', go: 'home:h86' }],
    sleep: ['23:00', '06:30'],
    clicks: ['Grüezi! Thomas Peterhans, Gemeindeammann. Was cha ich für Sie tue?', 'Mini Tür isch offe – im Gmeindhuus z Niederwil.', 'D\'Strassesanierig am Ifangweg chunnt. Versproche!', 'Am 1. August halt ich d\'Red am Dorffest. 🇨🇭', 'Nesselnbach und Niederwil – zäme sind mer stark.'],
    random: ['De Raser uf de Bremgarterstrass – mir luege das aa.', 'S\'Budget isch knapp, aber solid.', 'Händ Sie scho abgstimmt?', 'D\'Gartebahn vom Ernst – es Kulturguet!'],
    night: ['Morn isch wieder Gmeiratssitzig.'],
    greetLines: ['Grüezi Herr Gemeindeammann!'],
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
    id: 'silvia', name: 'Silvia Gehrig', home: 'milch', cycle: true, rel: 'Familie Gehrig, Milchzentrale', afterFire: ['Scho wieder het öpper bi üs klopft, bis es brennt… 😠', 'Mir baue jetzt wieder uf. Danke für nüt!', 'Bitte nümme so fescht klopfe. Bitte.', 'D\'Versicherig het gseit: s\'letscht Mol!'],
    look: { skin: '#f1c7a0', hair: '#6b4a32', hairStyle: 'bun', shirt: '#ffffff', pants: '#3a3f55', apron: '#ffffff', shoes: '#f4f1ea' },
    voice: 1.25, favorites: ['milchzentrale', 'dorfplatz', 'kapelle'],
    routine: [{ at: '05:30', go: 'home:milch' }, { at: '09:30', go: 'dorfplatz' }, { at: '10:30', go: 'home:milch' }, { at: '14:00', go: 'milchzentrale' }, { at: '14:30', go: 'home:milch' }, { at: '18:30', go: 'milchzentrale' }, { at: '19:30', go: 'home:milch' }],
    sleep: ['22:00', '05:15'],
    clicks: ['Grüezi! Wotsch es Stückli Chäs probiere? 🧀', "Üse Talchäs – drü Mönet grift.", 'Nach em Brand händ mer alles neu baut. Lueg, wie schön!', 'Roman! Reto! D\'Chunde warted!'],
    random: ['Hüt sind\'s 300 Liter Milch gsi.', 'De Rauchmälder isch jetz neu, zum Glück.', 'Wo blibt de Milchtransporter?'],
    night: ['Morn am halbi sächsi gaht\'s wider los.'],
  },
  {
    id: 'roman', name: 'Roman Gehrig', home: 'milch', cycle: true, rel: 'Familie Gehrig, Milchzentrale', afterFire: ['Scho wieder het öpper bi üs klopft, bis es brennt… 😠', 'Mir baue jetzt wieder uf. Danke für nüt!', 'Bitte nümme so fescht klopfe. Bitte.', 'D\'Versicherig het gseit: s\'letscht Mol!'],
    look: { skin: '#e8b890', hair: '#4a3220', hairStyle: 'short', shirt: '#ffffff', pants: '#2a2a3a', apron: '#ffffff', shoes: '#2a2a2a' },
    voice: 0.8, favorites: ['milchzentrale', 'beiz'],
    routine: [{ at: '05:15', go: 'home:milch' }, { at: '12:00', go: 'milchzentrale' }, { at: '12:45', go: 'home:milch' }, { at: '18:45', go: 'beiz' }, { at: '20:30', go: 'home:milch' }],
    sleep: ['22:30', '05:00'],
    clicks: ['De Chessi isch heiss – zrugg bliibe!', "D'Milch chunnt vo de Buure us em Dorf, jede Tag frisch.", 'Sit em Brand schlof i mit eim Aug offe.', 'Ich mues zrugg i d\'Chäserei!'],
    random: ['De Chäs mues no drü Mönet rife.', 'Reto, hesch de Tank putzt?', 'Buur, bring d\'Kanne vorne ane!'],
    night: ['Alles us? Chessi us? Guet.'],
  },
  {
    id: 'reto', name: 'Reto Gehrig', home: 'milch', cycle: true, rel: 'Familie Gehrig, Milchzentrale', afterFire: ['Scho wieder het öpper bi üs klopft, bis es brennt… 😠', 'Mir baue jetzt wieder uf. Danke für nüt!', 'Bitte nümme so fescht klopfe. Bitte.', 'D\'Versicherig het gseit: s\'letscht Mol!'],
    look: { skin: '#eec1a0', hair: '#8a6a4a', hairStyle: 'cap', cap: '#ffffff', shirt: '#dfe3e8', pants: '#3a5f9a', shoes: '#2a2a2a' },
    voice: 0.9, favorites: ['milchzentrale', 'unterdorf', 'beiz'],
    routine: [{ at: '05:45', go: 'milchzentrale' }, { at: '06:30', go: 'home:milch' }, { at: '10:00', go: 'unterdorf' }, { at: '11:00', go: 'home:milch' }, { at: '17:30', go: 'milchzentrale' }, { at: '18:30', go: 'home:milch' }, { at: '19:30', go: 'beiz' }, { at: '21:00', go: 'home:milch' }],
    sleep: ['23:00', '05:30'],
    clicks: ['Hoi! Milch, Joghurt, Chäs – alles vo do.', 'Ich fahr d\'Milch zu de Buure go hole.', 'Nach em Brand händ alli gholfe. Danke, Nesselnbach!', 'Jetz längts, ich mues d\'Kanne wäsche.'],
    random: ['De Tank isch voll.', 'Silvia, d\'Chunde!', 'Hoffentlich brönnt\'s nie meh.'],
    night: ['Guet Nacht, Chäserei.'],
  },
  // Karin: lives at Niederwilerstrasse 4 with Kuba, her small grey street dog (js/data/animals.js). Cheerful, chatty,
  // knows everyone in the village. Walks Kuba on the same loop several times a day (do: 'walk' = map.gassi) and
  // greets everyone she passes; when Kuba barks at another dog, she stops and chats with its owner.
  {
    id: 'karin', name: 'Karin', home: 'h95', shuffle: true, gossip: true, about: 'Fröhlich, gspröchig und kennt s ganze Dorf.',
    look: { skin: '#f0c4a0', hair: '#7a4a2a', hairStyle: 'capPony', cap: '#2f8a4a', shirt: '#2f8a4a', pants: '#2f8a4a', stripes: '#ffffff', shoes: '#f4f4f0' },
    voice: 1.3, favorites: ['dorfplatz', 'hof'],
    routine: [{ at: '06:45', go: 'gassi', do: 'walk' }, { at: '07:45', go: 'home:h95' }, { at: '10:00', go: 'dorfplatz' }, { at: '11:00', go: 'home:h95' }, { at: '12:15', go: 'gassi', do: 'walk' },
      { at: '13:00', go: 'home:h95' }, { at: '17:30', go: 'gassi', do: 'walk' }, { at: '18:45', go: 'home:h95' }, { at: '20:45', go: 'gassi', do: 'walk' }, { at: '21:30', go: 'home:h95' }],
    sleep: ['22:30', '06:30'],
    clicks: [ // Kuba always adds a "Wuff!" (chimeIn)
      'Grüezi! Dä Kuba het hüt scho drü Eichhörnli verjagt!', 'De Kuba isch chli, aber er meint, er seig en Wolf.', 'Pass uf, er bellt nume – bisse tuet er nöd.', 'Gester het er en ganze Cervelat gklaut. Frech, gäll Kuba?',
      'Häsch scho ghört? D\'Bäckerei macht jetzt Zimtschnägge!', 'Ich ha ghört, de Nachbar baut en neue Hüenerstall...', 'Weisch, wer hüt wieder z\'spät uf em Märt gsi isch? Säg\'s niemertem!',
    ],
    weatherLines: {
      sun: ['Was für es schöns Wätter für en Spaziergang!'],
      rain: ['Es gaht glaub bald go rägne – de Kuba schmöckt das immer.'],
      cold: ['Hüt isch es aber chalt, gäll? Guet, han i mis Trainerli.'],
    },
    random: ['Häsch scho ghört? D\'Bäckerei macht jetzt Zimtschnägge!', 'Ich ha ghört, de Nachbar baut en neue Hüenerstall...', 'Kuba, nöd a jede Baum!', 'Kuba! Hopp, wiiter!', 'Was für es schöns Wätter für en Spaziergang!'],
    night: ['Kuba, mir gönd is Bett. Guet Nacht!'],
    greetLines: ['Hoi %o!', 'Grüezi %o, wie gaht\'s?', 'Sali %o! Lueg, de Kuba freut sich!', '%o! Häsch scho ghört…?', 'Hoi %o, schöne Tag no!'],
    meetLines: ['Hoi %o! Kuba, pfui, nöd so lut! De %d tuet der nüt.', 'Sali %o! Ui, de Kuba und de %d – die zwei!', '%o! Häsch scho ghört, d\'Bäckerei macht jetzt Zimtschnägge?', 'Grüezi %o! De %d isch aber e Schöne.'],
    sniffLines: ['Schnüffle, Kuba, schnüffle.', 'Kuba, was häsch du wider gfunde?', 'Nöd ässe, Kuba!'],
  },
  // De Hirschbuur: runs the Hirschfarm behind Niederwilerstrasse 21.1 (lives at Niederwilerstrasse 21): feeds the deer
  // morning and evening, sells pumpkins at the stand by the street (the big Kürbismarkt in autumn).
  {
    id: 'hirschbuur', name: 'De Hirschbuur', home: 'h88', about: 'Hirschfarm und Kürbismärt.',
    look: { skin: '#e8b890', hair: '#7a5a3a', hairStyle: 'cap', cap: '#4a6a3a', shirt: '#6a8a5a', pants: '#4a4038', shoes: '#2a2a2a' },
    voice: 0.75, favorites: ['verkauf', 'hirschgehege', 'fuettern', 'beiz'],
    routine: [{ at: '06:30', go: 'fuettern' }, { at: '07:00', go: 'home:h88' }, { at: '09:00', go: 'verkauf' }, { at: '12:00', go: 'home:h88' }, { at: '13:30', go: 'verkauf' }, { at: '17:00', go: 'fuettern' }, { at: '17:45', go: 'home:h88' }, { at: '19:00', go: 'beiz' }, { at: '20:30', go: 'home:h88' }],
    sleep: ['22:00', '06:00'],
    clicks: ['Grüezi! Damhirsch, alles vo do hinde.', "D'Hirsch bruuched Rueh – bitte nid a Zuun klopfe.", 'Kürbis? Drü Franke s\'Kilo, Kasse vo Vertraue. 🎃', 'De Platzhirsch heisst eifach Platzhirsch.', 'Jetz mues i wider go füettere!'],
    random: ['Im Herbscht isch Kürbismarkt. Riesechürbis, Hokkaido, alles.', "D'Hirschchälber sind im Juni cho.", 'Heu, Rüebli und es bitzli Chraftfuetter.', 'Wer wott Hirschpfäffer? Nei, Spass.'],
    night: ['D\'Hirsch schlofed au. Guet Nacht.'],
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
  // Beat, the postman from the Post in Niederwil (js/entities/postman.js): yellow cap with messy hair, yellow uniform,
  // a big mailbag, a small grey e-scooter. Clumsy, always in a hurry, reads the postcards. Comes for the morning round
  // (and the parcels in the afternoon), rides off again when he's done.
  {
    id: 'beat', name: 'Beat', postman: true, visitor: true, from: 'Niederwil', home: 'haus12',
    about: 'De Pöschtler. Tollpatschig, immer pressant, nie pünktlich – und er liest d\'Postcharte. 🙈',
    look: { clumsy: true, round: true, messy: true, bag: true, skin: '#eab48e', hair: '#6a4a2a', hairStyle: 'cap', cap: '#ffcc00', shirt: '#ffcc00', pants: '#2a2a3a', shoes: '#111114' },
    voice: 0.95, favorites: [], routine: [],
  },
  {
    id: 'nochberi', name: 'D\'Nochberi', home: 'haus5',
    look: { skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'headscarf', scarf: '#d94a8a', shirt: '#8a6a4a', dress: '#8a6a4a' },
    voice: 1.3, favorites: ['dorfplatz', 'kuerbismarkt', 'hirschgehege', 'kapelle'],
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
    look: { kid: true, skin: '#f1c7a0', hair: '#e0b030', hairStyle: 'short', shirt: '#e08a3c', pants: '#3a5f9a' },
    voice: 1.7, favorites: ['hirschgehege', 'dorfplatz', 'weide', 'kapelle'],
    routine: [{ at: '07:30', go: 'bushalt' }, { at: '08:00', go: 'niederwil' }, { at: '12:00', go: 'home:haus10' }, { at: '13:30', go: 'weide' }, { at: '15:30', go: 'gartebahn' }, { at: '18:00', go: 'home:haus10' }],
    sleep: ['20:00', '07:00'],
    clicks: ['Fangis! Du bisch!', 'Lueg, ich cha so schnäll renne!', 'Hesch e Chatz gseh?', 'Mami! Dä/die plaget mi!'],
    random: ['Ich wott es Glace!', 'D\'Chue het mi agluegt!'],
    night: ['Ich bin no gar ned müed…'],
  },
];
