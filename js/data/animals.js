// Cats as data. area: a POI name (see js/data/scene.js) or a rect [x0, z0, x1, z1] in metres.
window.NB = window.NB || {};
NB.Data = NB.Data || {};
NB.Data.animals = [
  { kind: 'cat', name: 'Mimi', area: 'dorfplatz', look: { fur: '#e08a3c', dark: '#a85a22', pattern: 'tabby' }, voice: 1.1 },
  { kind: 'cat', name: 'Tiger', area: 'niederwilerstrasse', look: { fur: '#9a8a74', dark: '#4a3f33', pattern: 'tabby' }, voice: 0.9 },
  { kind: 'cat', name: 'Schnurrli', area: 'unterdorf', look: { fur: '#2b2b2b', pattern: 'tuxedo' }, voice: 1.0 },
  // Luna: the family cat (white calico, from a photo). Click = zoomies, hold = purr.
  { kind: 'cat', name: 'Luna', area: 'ifangweg', look: { pattern: 'luna' }, voice: 1.25, zoomies: true },
  { kind: 'cat', name: 'Fleckli', area: 'kapelle', look: { fur: '#e08a3c', pattern: 'socks' }, voice: 1.15 },
  { kind: 'cat', name: 'Minka', area: 'kapellenweg', look: { fur: '#f2ede4', dark: '#c8b8a0', pattern: 'tabby' }, voice: 1.2 },
];
