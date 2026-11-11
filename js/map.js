// The village layout: an abstract Nesselnbach (Aargau) with the road to Niederwil.
// Coordinates are in tiles (16 px). x grows east, y grows south.
(function (NB) {
  const T = NB.TILE, TER = NB.TER;
  const W = 112, H = 84;
  const map = (NB.map = {
    w: W, h: H,
    terrain: new Uint8Array(W * H), crop: new Uint8Array(W * H), solid: new Uint8Array(W * H),
    fences: [], flowerbeds: [], props: [], buildings: {}, pois: {}, lights: [], labels: [], track: null,
  });
  const inB = (map.inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H);
  map.ter = (x, y) => (inB(x, y) ? map.terrain[y * W + x] : TER.GRASS);
  const rnd = NB.seeded(2024);

  function rect(x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) map.terrain[y * W + x] = t;
  }
  function solidRect(x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inB(x, y)) map.solid[y * W + x] = 1;
  }
  const isSolid = (x, y) => !inB(x, y) || map.solid[y * W + x] === 1;
  const hardSurface = (t) => t === TER.ROAD || t === TER.STREET || t === TER.PATH || t === TER.PLAZA || t === TER.DIRT;

  // ---------------- terrain ----------------
  // Reuss river along the east edge
  for (let y = 0; y < H; y++) {
    const cx = 99 + Math.round(2.5 * Math.sin(y / 8) + Math.sin(y / 3.1) * 0.6);
    rect(cx - 2, y, cx + 3, y, TER.WATER);
  }
  // Fields west of the farm
  rect(5, 3, 25, 21, TER.FIELD);
  rect(5, 25, 25, 35, TER.FIELD);
  for (let y = 3; y <= 35; y++)
    for (let x = 5; x <= 25; x++) {
      const crop = y <= 21 ? (x < 12 ? 0 : x < 19 ? (y < 12 ? 2 : 1) : 3) : x < 15 ? 1 : 0;
      map.crop[y * W + x] = crop;
    }
  rect(5, 22, 27, 24, TER.PATH); // field track
  rect(26, 14, 27, 24, TER.PATH);
  // Farm yard
  rect(28, 13, 46, 18, TER.DIRT);
  // Hauptstrasse / Kantonsstrasse 296 (Mellingen <-> Bremgarten)
  rect(54, 0, 56, H - 1, TER.ROAD);
  // Niederwilerstrasse to Niederwil
  rect(3, 52, 53, 53, TER.ROAD);
  // side streets
  rect(57, 27, 88, 28, TER.STREET); // Dorfstrasse Ost
  rect(89, 27, 94, 27, TER.PATH); // down to the Reuss
  rect(64, 29, 65, 47, TER.STREET); // Quartierstrasse
  rect(57, 46, 84, 47, TER.STREET);
  rect(57, 66, 86, 67, TER.STREET); // Gnadenthalstrasse
  rect(47, 17, 53, 18, TER.PATH); // Hofweg
  rect(57, 31, 61, 37, TER.PLAZA); // Dorfplatz
  rect(4, 48, 17, 51, TER.STREET); // Niederwil Dorfstrasse
  rect(9, 41, 10, 47, TER.STREET);
  rect(9, 54, 10, 60, TER.STREET);

  map.dash = (x, y) => x === 55 && y % 2 === 0 && !(y >= 51 && y <= 54) && !(y >= 26 && y <= 29) && !(y >= 45 && y <= 48) && !(y >= 65 && y <= 68);
  map.dashH = (x, y) => y === 52 && x > 18 && x < 52 && x % 2 === 0;

  // ---------------- buildings ----------------
  const WALLS = ['#f3e6c8', '#efe2d0', '#f6f1e6', '#e9dcc0', '#f0e0d0', '#e6e0d6'];
  const ROOFS = ['#a3452f', '#8a3a2a', '#b85a3a', '#6b4a3a', '#7a3b2a', '#5b5f6b'];
  const SHUTTERS = ['#2f7a3c', '#a3302a', '#3a5f9a', '#2f7a3c', null];

  function building(id, name, x, y, w, h, style, extra) {
    const s = Object.assign({ w, h, chimney: true, seed: x * 3 + y }, style);
    const art = NB.Art.building(s);
    solidRect(x, y, x + w - 1, y + h - 1);
    const door = s.door != null ? s.door : Math.floor(w / 2);
    const entry = { x: x + door, y: y + h };
    const b = Object.assign({ id, name, x, y, w, h, entry, kind: s.kind || 'house', occupants: [] }, extra || {});
    b.prop = {
      type: 'building', ref: b, img: art.canvas,
      x: x * T - art.offX, y: y * T - art.over - art.top,
      sortY: (y + h) * T, name, hit: { x: x * T, y: y * T - art.over, w: w * T, h: h * T + art.over },
    };
    art.windows.forEach((wd) => map.lights.push({ kind: 'window', x: x * T + wd.x, y: y * T - art.over + wd.y, r: 16, building: b, seed: rnd() }));
    map.props.push(b.prop);
    map.buildings[id] = b;
    map.pois['home:' + id] = [entry.x, entry.y, entry.x, entry.y];
    return b;
  }
  const house = (id, name, x, y, w, h, i, extra) =>
    building(id, name, x, y, w, h, {
      wall: WALLS[i % WALLS.length], roof: ROOFS[i % ROOFS.length], shutters: SHUTTERS[i % SHUTTERS.length],
      timber: i % 3 === 0, flowers: true, seed: i,
    }, extra);

  // Landmarks
  building('kapelle', 'Kapälle Nesselnbach', 66, 20, 5, 6, { kind: 'chapel', wall: '#f2efe8', roof: '#5b5f6b', door: 2, chimney: false },
    { lines: ['Bimm… bamm… 🔔', 'D\'Kapälle isch offe. Chum ine go luege!', 'Es isch ganz still do inne.'], sound: 'bell' });
  building('beiz', 'D\'Beiz', 45, 29, 6, 4, { wall: '#f3e6c8', roof: '#a3452f', timber: true, shutters: '#2f7a3c', sign: '#c0392b', flowers: true, door: 3 },
    { lines: ['Prost! 🍺', 'Hüt git\'s Cordon bleu mit Pommes.', 'Stammtisch isch am Friitig!'], sound: 'clink' });
  building('casino', 'Casino Nesselnbach', 46, 40, 4, 3, { wall: '#e9d8b0', roof: '#7a3b2a', sign: '#2a5fb0', door: 1 },
    { lines: ['S\'Casino – do isch öppe mol Fescht!', 'Hüt kei Veranstaltig. Schad!'], sound: 'door' });
  building('hof', 'Buurehuus', 29, 9, 6, 4, { wall: '#efe2c4', roof: '#8a3a2a', timber: true, shutters: '#2f7a3c', flowers: true, door: 2 },
    { lines: ['Do wohnt de Buur.', 'S\'schmöckt nach Heu und Chüe.'], sound: 'door' });
  building('schuer', 'Schüür', 37, 8, 8, 5, { kind: 'barn', wall: '#8a4b2a', roof: '#6b4a3a', door: 4, chimney: false },
    { lines: ['Muuuh! (us de Schüür)', 'Voll Heu bis under s\'Dach.'], sound: 'moo' });
  building('gnadenthal', 'Gnadenthal', 84, 57, 10, 5, { kind: 'gnadenthal', wall: '#efe6d2', roof: '#a3452f', door: 5, chimney: false },
    { lines: ['S\'ehemalige Chloster Gnadenthal a de Reuss.', 'Ganz alti Muure – scho sit em 13. Johrhundert.'], sound: 'bell' });

  // Family & village houses (names get filled in from the character data)
  house('haus1', 'Huus 1', 67, 31, 4, 4, 0);
  house('haus2', 'Huus 2', 73, 31, 4, 4, 1);
  house('haus3', 'Huus 3', 79, 31, 4, 4, 2);
  house('haus4', 'Huus 4', 67, 39, 4, 4, 3);
  house('haus5', 'Huus 5', 73, 39, 4, 4, 4);
  house('haus6', 'Huus 6', 79, 39, 4, 4, 5);
  house('haus7', 'Huus 7', 38, 44, 4, 3, 6);
  house('haus8', 'Huus 8', 32, 44, 4, 3, 7);
  house('haus9', 'Huus 9', 73, 21, 4, 4, 8);
  house('haus10', 'Huus 10', 58, 57, 5, 4, 9);
  house('haus11', 'Huus 11', 45, 57, 4, 4, 10);
  house('haus12', 'Huus 12', 59, 49, 4, 3, 11);

  // Niederwil (just the edge of it)
  house('nw1', 'Niederwil', 3, 43, 4, 4, 2, { lines: ['Willkomme z\'Niederwil!'] });
  house('nw2', 'Niederwil', 12, 43, 4, 3, 4, { lines: ['Nochbersdorf Niederwil.'] });
  house('nw3', 'Niederwil', 3, 56, 4, 4, 1, { lines: ['Do isch scho Niederwil.'] });
  house('nw4', 'Niederwil', 12, 56, 5, 3, 5, { lines: ['Grüezi us Niederwil!'] });
  building('nwkirche', 'Kirche Niederwil', 4, 35, 5, 6, { kind: 'chapel', wall: '#f4f0e6', roof: '#6b4a3a', door: 2, chimney: false },
    { lines: ['D\'Kirche vo Niederwil.', 'Bimm-bamm!'], sound: 'bell' });
  rect(6, 41, 8, 47, TER.PATH);

  // ---------------- connect doors to the street network ----------------
  function connect(sx, sy) {
    if (hardSurface(map.ter(sx, sy))) return;
    const prev = new Map();
    const key = (x, y) => y * W + x;
    const q = [[sx, sy]];
    prev.set(key(sx, sy), -1);
    while (q.length) {
      const [x, y] = q.shift();
      if (hardSurface(map.ter(x, y))) {
        let k = prev.get(key(x, y));
        while (k !== -1 && k !== undefined) {
          const px = k % W, py = (k / W) | 0;
          map.terrain[k] = TER.PATH;
          k = prev.get(key(px, py));
        }
        return;
      }
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (!inB(nx, ny) || isSolid(nx, ny) || map.ter(nx, ny) === TER.WATER || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), key(x, y));
        q.push([nx, ny]);
      }
    }
  }
  Object.values(map.buildings).forEach((b) => connect(b.entry.x, b.entry.y));

  // ---------------- pasture with fence ----------------
  for (let x = 29; x <= 47; x++) {
    if (x !== 38) map.fences.push({ x, y: 19, dir: 'h' });
    map.fences.push({ x, y: 28, dir: 'h' });
  }
  for (let y = 20; y <= 27; y++) { map.fences.push({ x: 29, y, dir: 'v' }); map.fences.push({ x: 47, y, dir: 'v' }); }
  map.fences.forEach((f) => { map.solid[f.y * W + f.x] = 1; });
  rect(38, 19, 38, 19, TER.PATH);

  // ---------------- small props ----------------
  function prop(img, tx, ty, opts) {
    // anchored bottom-centre on tile (tx, ty)
    opts = opts || {};
    const x = tx * T + T / 2 - img.width / 2 + (opts.dx || 0);
    const y = (ty + 1) * T - img.height + (opts.dy || 0);
    const p = Object.assign({ type: 'prop', img, x, y, sortY: (ty + 1) * T + (opts.dy || 0) - 1 }, opts);
    if (opts.name) p.hit = { x, y, w: img.width, h: img.height };
    if (opts.solid) map.solid[ty * W + tx] = 1;
    map.props.push(p);
    return p;
  }
  map.prop = prop;

  const fountain = prop(NB.Art.fountain(), 59, 34, { solid: true, name: 'Dorfbrunne', lines: ['Plätscher… 💧', 'S\'Wasser isch iiskalt!', 'Nöd inegumpe!'], sound: 'splash' });
  map.solid[34 * W + 58] = 1; map.solid[34 * W + 60] = 1;
  map.fountain = fountain;
  prop(NB.Art.bench(), 57, 32, { dx: 2 });
  prop(NB.Art.bench(), 61, 36, { dx: -2 });
  prop(NB.Art.bench(), 69, 26, {});
  prop(NB.Art.busStop(), 57, 40, { name: 'Bushaltestell «Nesselnbach, Dorf»', lines: ['Nöchsti Abfahrt: wenn\'s Postauto chunnt. 🚌', 'Richtig Bremgarte und Mellige.'], sound: 'click' });
  prop(NB.Art.busStop(), 53, 38, { name: 'Bushaltestell «Nesselnbach, Dorf»', lines: ['Richtig Mellige / Bade.'], sound: 'click' });
  prop(NB.Art.placeSign(true), 52, 51, { name: 'Ortstafele Nesselnbach', lines: ['Nesselnbach – Gmeind Niederwil AG'], sound: 'click' });
  prop(NB.Art.placeSign(true), 18, 51, { name: 'Ortstafele Niederwil', lines: ['Niederwil – Willkomme!'], sound: 'click' });
  prop(NB.Art.placeSign(true), 57, 9, { name: 'Ortstafele Nesselnbach', lines: ['Nesselnbach. Richtig Mellige ↑'], sound: 'click' });
  prop(NB.Art.placeSign(true), 53, 75, { name: 'Ortstafele Nesselnbach', lines: ['Nesselnbach. Richtig Bremgarte ↓'], sound: 'click' });
  [[30, 15], [33, 16], [44, 15]].forEach(([x, y]) => prop(NB.Art.hayBale(), x, y, { solid: true, name: 'Heuballe', lines: ['Heu! Für d\'Chüe im Winter.'], sound: 'click' }));
  [[45, 33], [50, 34]].forEach(([x, y]) => prop(NB.Art.table(), x, y, {}));

  // street lamps
  const lampAt = (x, y) => {
    prop(NB.Art.lamp(), x, y, {});
    map.lights.push({ kind: 'lamp', x: x * T + T / 2, y: (y + 1) * T - 20, r: 42 });
  };
  [14, 22, 30, 38, 44, 50, 58, 64, 72].forEach((y) => lampAt(53, y));
  [[57, 30], [62, 38], [66, 29], [76, 29], [64, 48], [72, 45], [62, 68], [80, 68], [20, 54], [32, 54], [44, 54], [8, 50]].forEach(([x, y]) => {
    if (!isSolid(x, y) && map.ter(x, y) !== TER.WATER) lampAt(x, y);
  });

  // flower beds
  map.flowerbeds.push({ x: 57, y: 30, w: 5, h: 1 }, { x: 62, y: 31, w: 1, h: 6 }, { x: 66, y: 26, w: 1, h: 1 }, { x: 70, y: 26, w: 1, h: 1 });

  // garden railway (Gartebahn) next to Huus 10
  map.track = { cx: 67 * T, cy: 62 * T, rx: 3.6 * T, ry: 2.1 * T };
  prop(NB.Art.placeSign(false), 63, 60, { name: 'Gartebahn', lines: ['Tschu-tschuuu! D\'Gartebahn fahrt.'], sound: 'whistle' });

  // ---------------- trees ----------------
  const reserved = [
    [28, 13, 47, 28], [56, 29, 63, 38], [62, 58, 71, 66], [44, 28, 52, 35], [57, 39, 59, 42],
  ];
  const nearHard = (x, y, d) => {
    for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++) if (inB(xx, yy) && (hardSurface(map.ter(xx, yy)))) return true;
    return false;
  };
  const nearSolid = (x, y) => {
    for (let yy = y - 1; yy <= y + 2; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (inB(xx, yy) && map.solid[yy * W + xx]) return true;
    return false;
  };
  const nearWater = (x, y, d) => {
    for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++) if (map.ter(xx, yy) === TER.WATER) return true;
    return false;
  };
  function tryTree(x, y, kind) {
    if (!inB(x, y) || map.ter(x, y) !== TER.GRASS || isSolid(x, y) || nearHard(x, y, 1) || nearSolid(x, y) || map.ter(x, y + 1) === TER.WATER) return false;
    if (reserved.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) return false;
    const variant = (rnd() * 6) | 0;
    const img = kind === 'bush' ? NB.Art.bush(variant) : NB.Art.tree(kind, variant);
    prop(img, x, y, { solid: true, dx: Math.round((rnd() - 0.5) * 4), tree: true });
    return true;
  }
  function forest(x0, y0, x1, y1, density, pineShare) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (rnd() < density) tryTree(x, y, rnd() < pineShare ? 'pine' : 'leaf');
  }
  forest(76, 1, 94, 15, 0.5, 0.65);
  forest(2, 64, 30, 82, 0.45, 0.5);
  forest(70, 71, 94, 82, 0.35, 0.4);
  forest(28, 0, 50, 5, 0.3, 0.5);
  forest(104, 0, 111, 83, 0.35, 0.5);
  forest(0, 0, 3, 40, 0.3, 0.6);
  for (let y = 0; y < H; y++) for (let x = 85; x < 106; x++) if (nearWater(x, y, 2) && rnd() < 0.18) tryTree(x, y, 'leaf');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rnd() < 0.018) tryTree(x, y, rnd() < 0.3 ? 'pine' : 'leaf');
  Object.values(map.buildings).forEach((b) => {
    for (let i = 0; i < 6; i++) {
      const x = b.x - 2 + ((rnd() * (b.w + 4)) | 0), y = b.y - 2 + ((rnd() * (b.h + 4)) | 0);
      tryTree(x, y, rnd() < 0.45 ? 'bush' : 'leaf');
    }
  });

  // ---------------- points of interest ----------------
  Object.assign(map.pois, {
    dorfplatz: [57, 31, 61, 37], kapelle: [66, 26, 70, 26], bushalt: [57, 39, 58, 41], beiz: [44, 33, 51, 35],
    casino: [45, 43, 50, 44], hof: [28, 13, 46, 18], feld: [6, 22, 25, 24], weide: [30, 20, 46, 27],
    reuss: [90, 20, 95, 60], gnadenthal: [83, 62, 94, 65], gartebahn: [63, 59, 70, 65], niederwil: [4, 48, 17, 51],
    wald: [76, 16, 90, 18], quartier: [64, 29, 84, 47],
  });

  map.labels = [
    { text: 'Nesselnbach', x: 60.5, y: 16, size: 2 },
    { text: 'Niederwil', x: 10, y: 33, size: 1.4 },
    { text: 'Reuss', x: 99.5, y: 38, size: 1.2 },
    { text: 'Gnadenthal', x: 89, y: 54.5, size: 1 },
    { text: '↑ Mellige', x: 55.5, y: 1.2, size: 1 },
    { text: '↓ Bremgarte', x: 55.5, y: 82.5, size: 1 },
  ];

  // ---------------- movement cost grids ----------------
  const N = W * H;
  map.walkCost = new Float32Array(N);
  map.animalCost = new Float32Array(N);
  map.waterCost = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = map.terrain[i];
    const walk = { [TER.GRASS]: 2.2, [TER.ROAD]: 1.4, [TER.STREET]: 1, [TER.PATH]: 1, [TER.PLAZA]: 1, [TER.DIRT]: 1.1, [TER.FIELD]: 3, [TER.WATER]: 0 }[t];
    map.walkCost[i] = map.solid[i] ? 0 : walk;
    map.animalCost[i] = map.solid[i] || t === TER.WATER ? 0 : t === TER.ROAD ? 2 : 1;
    map.waterCost[i] = t === TER.WATER ? 1 : 0;
  }
  // doors must stay reachable
  Object.values(map.buildings).forEach((b) => { const i = b.entry.y * W + b.entry.x; if (!map.walkCost[i]) map.walkCost[i] = 1; });

  map.randomIn = function (area, cost) {
    const [x0, y0, x1, y1] = typeof area === 'string' ? map.pois[area] : area;
    for (let i = 0; i < 60; i++) {
      const x = NB.ri(x0, x1), y = NB.ri(y0, y1);
      if (inB(x, y) && cost[y * W + x]) return { x, y };
    }
    return null;
  };
})(window.NB);
