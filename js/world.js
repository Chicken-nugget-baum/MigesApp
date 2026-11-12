// World logic built from js/data/scene.js: walk grid for pathfinding, buildings, POIs, vehicle route.
// Units: metres, x = east, z = south.
(function (NB) {
  const S = NB.Scene;
  S.buildings.forEach((b) => NB.Iso.snapBuilding(b)); // iso pixel art: buildings sit on the iso grid, doors on a visible face
  const C = 2; // metres per path-finding cell
  const [bx0, bz0, bx1, bz1] = S.bounds;
  const W = Math.ceil((bx1 - bx0) / C), H = Math.ceil((bz1 - bz0) / C);
  const map = (NB.map = {
    cell: C, w: W, h: H, x0: bx0, z0: bz0, bounds: S.bounds,
    streets: S.streets, buildings: {}, pois: {}, labels: S.labels, start: { x: S.start[0], z: S.start[1] },
  });
  map.inB = (cx, cz) => cx >= 0 && cz >= 0 && cx < W && cz < H;
  map.toCell = (x, z) => [Math.floor((x - bx0) / C), Math.floor((z - bz0) / C)];
  map.cellCentre = (cx, cz) => ({ x: bx0 + (cx + 0.5) * C, z: bz0 + (cz + 0.5) * C });

  const distSeg = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  };
  map.streetDist = function (x, z) {
    let best = Infinity, w = 0;
    for (const s of S.streets) for (let i = 1; i < s.pts.length; i++) {
      const d = distSeg(x, z, s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]) - s.width / 2;
      if (d < best) { best = d; w = s.width; }
    }
    return best; // <0 = on the street
  };
  // is (x, z) inside a building's box (+ margin)?
  map.inBuilding = function (x, z, margin) {
    for (const b of S.buildings) {
      const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
      const dx = x - b.cx, dz = z - b.cz;
      const u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
      const m = margin || 0;
      if (Math.abs(u) > b.w / 2 + m || Math.abs(v) > b.d / 2 + m) continue;
      for (const p of b.parts || [{ u: 0, v: 0, w: b.w, d: b.d }]) if (Math.abs(u - p.u) <= p.w / 2 + m && Math.abs(v - p.v) <= p.d / 2 + m) return b;
    }
    return null;
  };

  // ---------------- grids ----------------
  const N = W * H;
  map.walkCost = new Float32Array(N);
  map.animalCost = new Float32Array(N);
  map.onStreet = new Uint8Array(N);
  for (let cz = 0; cz < H; cz++)
    for (let cx = 0; cx < W; cx++) {
      const { x, z } = map.cellCentre(cx, cz);
      const i = cz * W + cx;
      const blocked = map.inBuilding(x, z, 0.4);
      const sd = map.streetDist(x, z);
      map.onStreet[i] = sd < 0 ? 1 : 0;
      map.walkCost[i] = blocked ? 0 : sd < 0.5 ? 1 : sd < 2.5 ? 1.6 : 2.6; // people like streets and sidewalks
      map.animalCost[i] = blocked ? 0 : sd < 0 ? 2 : 1; // cats prefer gardens
    }

  // ---------------- buildings ----------------
  const LINES = {
    chapel: { lines: ['Bimm… bamm… 🔔', 'D\'Heiligkreuz-Kapälle. Ganz still do inne.', 'Do brönnt immer e Cherze.'], sound: 'bell' },
    beiz: { lines: ['Prost! 🍺', 'S\'Casino – s\'Vereinslokal vo Nesselnbach.', 'Stammtisch isch am Friitig!'], sound: 'clink' },
    farmhouse: { lines: ["S'Buurehuus, Niederwilerstrasse 3.", "Links wohne, rächts d'Schüür.", "Do wohne d'Mina und d'Luna. 🐾"], sound: 'door' },
    barn: { lines: ['%a', 'Do schmöckt\'s nach Heu.'], sound: 'door' },
    garage: { lines: ['%a', 'Do staht s\'Velo.'], sound: 'door' },
    house: { lines: ['%a', 'Do wohnt\'s sich schön.'], sound: 'door' },
  };
  S.buildings.forEach((spec, i) => {
    const l = LINES[spec.kind] || LINES.house;
    const name = ['chapel', 'beiz', 'farmhouse'].includes(spec.kind) ? spec.name : spec.addr || spec.name || 'Huus';
    const info = (spec.name && spec.kind !== 'house' ? spec.name + ', ' : '') + (spec.addr || '') + (spec.year ? ', baut ' + spec.year : '') + (spec.flats > 1 ? ', ' + spec.flats + ' Wohnige' : '') + '.';
    const b = Object.assign({}, spec, {
      i, name, occupants: [], inside: new Set(),
      entryPt: { x: spec.entry[0], z: spec.entry[1] },
      lines: l.lines.map((s) => s.replace('%a', info)), sound: l.sound,
    });
    // make sure the doorstep is walkable
    const [ex, ez] = map.toCell(b.entryPt.x, b.entryPt.z);
    if (map.inB(ex, ez) && !map.walkCost[ez * W + ex]) map.walkCost[ez * W + ex] = 1.6;
    map.buildings[b.id] = b;
    map.pois['home:' + b.id] = [b.entryPt.x - 0.5, b.entryPt.z - 0.5, b.entryPt.x + 0.5, b.entryPt.z + 0.5];
  });
  Object.assign(map.pois, S.pois);
  // Buurehuus (Niederwilerstrasse 3): bench next to the front door, sitting place beyond the living part
  // (= left of the house as seen from the street)
  const farm = map.buildings.buurehuus;
  if (farm) {
    const hp = farm.parts.find((p) => p.type === 'house') || farm.parts[0], bp = farm.parts.find((p) => p.type === 'barn');
    const toW = (u, v) => { const [x, z] = NB.Iso.unrot(u, v); return [farm.cx + x, farm.cz + z]; };
    let du = bp ? hp.u - bp.u : 1, dv = bp ? hp.v - bp.v : 0; const dl = Math.hypot(du, dv) || 1; du /= dl; dv /= dl;
    const reach = (Math.abs(du) * hp.w) / 2 + (Math.abs(dv) * hp.d) / 2 + 4;
    const [tx, tz] = toW(hp.u + du * reach, hp.v + dv * reach);
    // bench: against the wall beside the door, on the side towards the living part
    const n = farm.doorN, t = [-n[1], n[0]], dw = NB.Iso.unrot(du, dv);
    const sg = t[0] * dw[0] + t[1] * dw[1] >= 0 ? 1 : -1;
    const bx = farm.door[0] + t[0] * sg * 2 + n[0] * 0.5, bz = farm.door[1] + t[1] * sg * 2 + n[1] * 0.5;
    map.farmProps = { bench: { x: bx, z: bz, heading: Math.atan2(n[0], n[1]) }, table: { x: tx, z: tz } };
    map.pois.sitzplatz = [tx - 2.2, tz - 2.2, tx + 2.2, tz + 2.2];
    // the table itself is not walkable
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = map.cellCentre(cx, cz);
      if (Math.hypot(c.x - tx, c.z - tz) < 1) { map.walkCost[cz * W + cx] = 0; map.animalCost[cz * W + cx] = 0; }
    }
  }
  // POIs from older data that don't exist in this small scene
  const ALIAS = { casino: 'beiz', niederwil: 'niederwilerstrasse', reuss: 'kapellenweg', wald: 'kapellenweg', gnadenthal: 'kapellenweg', gartebahn: 'ifangweg', feld: 'kapellenweg', weide: 'kapellenweg', schuel: 'niederwilerstrasse' };
  for (const [k, v] of Object.entries(ALIAS)) if (!map.pois[k]) map.pois[k] = map.pois[v];

  // vehicle route (Niederwilerstrasse) and bus stops
  map.route = S.route.map(([x, z]) => ({ x, z }));
  map.busStops = S.stops.map((s) => ({ name: s.name, x: s.at[0], z: s.at[1] }));

  // random walkable point inside a POI rect (metres); returns {x, z} or null
  map.randomIn = function (area, cost) {
    const a = typeof area === 'string' ? map.pois[area] : area;
    if (!a) return null;
    for (let k = 0; k < 80; k++) {
      const x = NB.rr(a[0], a[2]), z = NB.rr(a[1], a[3]);
      const [cx, cz] = map.toCell(x, z);
      if (map.inB(cx, cz) && cost[cz * W + cx]) return map.cellCentre(cx, cz);
    }
    return null;
  };
})(window.NB);
