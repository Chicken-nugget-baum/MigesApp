// Cats as data. area: a POI name (see js/data/scene.js) or a rect [x0, z0, x1, z1] in metres.
window.NB = window.NB || {};
NB.Data = NB.Data || {};
NB.Data.animals = [
  { kind: 'cat', name: 'Mimi', area: 'dorfplatz', look: { fur: '#e08a3c', dark: '#a85a22', pattern: 'tabby' }, voice: 1.1 },
  { kind: 'cat', name: 'Tiger', area: 'niederwilerstrasse', look: { fur: '#9a8a74', dark: '#4a3f33', pattern: 'tabby' }, voice: 0.9 },
  { kind: 'cat', name: 'Schnurrli', area: 'unterdorf', look: { fur: '#2b2b2b', pattern: 'tuxedo' }, voice: 1.0 },
  // Luna: calico (from a photo). Can't talk – only "Miau"/"Mauz". Click = zoomies, hold = purr. Lives at the Buurehuus.
  { kind: 'cat', name: 'Luna', area: 'hof', about: 'Glückschatz vo de Mige · cha nöd rede, nur Miau.', look: { pattern: 'luna' }, voice: 1.25, zoomies: true, dogs: true, words: ['Miau!', 'Mauz.', 'Miau?', 'Mauuuz!', 'Miiiau.'] },
  // Mina: calico too, but mostly white. She talks (and isn't shy about it). Lives at the Buurehuus.
  { kind: 'cat', name: 'Mina', area: 'hof', about: 'Glückschatz vo de Mige · d\'Chefin vom Hof.', look: { pattern: 'mina' }, voice: 1.1, dogs: true,
    talk: ['Chlöpfle bitte.', 'Gib mir Snacks, du Schiss!', 'Wo blibt mis Znacht?!', 'Chlöpfle. Jetzt.', "Ich bi d'Chefin vom Hof."] },
  { kind: 'cat', name: 'Fleckli', area: 'kapelle', look: { fur: '#e08a3c', pattern: 'socks' }, voice: 1.15 },
  { kind: 'cat', name: 'Minka', area: 'kapellenweg', look: { fur: '#f2ede4', dark: '#c8b8a0', pattern: 'tabby' }, voice: 1.2 },
  // Mariana's Border Collies. They follow her everywhere (owner), wait outside when she is indoors, come and go
  // with her in the Mini. Morgan lost his front left leg. Luna and Mina (`dogs: true`) like to ride on their backs.
  // plays: the two chase each other round her when she sits still. roamer: Manolo runs off now and then and does his
  // own thing for a few minutes (Mariana panics, Joel tries to calm her; sometimes they go and look for him).
  { kind: 'dog', name: 'Manolo', owner: 'mariana', about: 'Border Collie · haut gärn ab und macht sis eigete Ding.', side: -1, plays: true, roamer: true, voice: 0.85, look: {}, clicks: ['Wuff!', 'Wuff wuff!', 'Hecheln… 🐾', '¡Guau!'] },
  { kind: 'dog', name: 'Morgan', owner: 'mariana', about: 'Border Collie mit drü Bei – und glich de Schnällscht.', side: 1, plays: true, voice: 1.0, look: { missing: 'frontLeft' }, clicks: ['Wuff!', 'Drü Bei, null Problem. Wuff!', '¡Guau guau!', 'Hopp hopp hopp!'] },
  // Kuba: Karin's small grey street dog (mixed breed, scruffy, one floppy ear). Always on the red leash, goes indoors
  // with her (indoor), barks at every other dog (barksAtDogs: Karin stops and chats with the owner), barks a lot (loud),
  // adds a "Wuff!" whenever Karin is clicked (chimeIn).
  { kind: 'dog', name: 'Kuba', owner: 'karin', about: 'Chline graue Strassehund · bellt jede Hund aa.', side: 1, voice: 1.35, look: { breed: 'mutt' }, leash: '#d42a2a', indoor: true, barksAtDogs: true, loud: true, chimeIn: true,
    clicks: ['Wuff!', 'Wuff! Wuff!', 'WUFF!', '*schnüffel* … Wuff!'] },
  // Fallow deer on the Hirschfarm behind Niederwilerstrasse 21.1 (paddock = map.deer). kind: stag | hind | calf
  { kind: 'deer', name: 'De Platzhirsch', look: { kind: 'stag' } },
  { kind: 'deer', name: 'Hirschkue Bella', look: { kind: 'hind' } },
  { kind: 'deer', name: 'Hirschkue Flora', look: { kind: 'hind' } },
  { kind: 'deer', name: 'Hirschkue Nora', look: { kind: 'hind' } },
  { kind: 'deer', name: 'Hirschchalb Fritzli', look: { kind: 'calf' } },
  { kind: 'deer', name: 'Hirschchalb Lisi', look: { kind: 'calf' } },
  // Ducks on the Löli-Weiher (area = pond + shore). sex: 'm' = green-headed drake, 'f' = brown duck.
  { kind: 'duck', name: 'Erpel Edi', area: 'weiher', look: { sex: 'm' }, voice: 0.9 },
  { kind: 'duck', name: 'Ente Emma', area: 'weiher', look: { sex: 'f' }, voice: 1.1 },
  { kind: 'duck', name: 'Erpel Fritz', area: 'weiher', look: { sex: 'm' }, voice: 0.95 },
  { kind: 'duck', name: 'Ente Lotti', area: 'weiher', look: { sex: 'f' }, voice: 1.2 },
  { kind: 'duck', name: 'Ente Rosa', area: 'weiher', look: { sex: 'f' }, voice: 1.05 },
];
