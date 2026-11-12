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

  // ---------------- fields (OSM farmland around the village) ----------------
  const inPoly = (x, z, ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  map.fields = (S.fields || []).map((f, i) => {
    const xs = f.pts.map((p) => p[0]), zs = f.pts.map((p) => p[1]);
    return Object.assign({ i, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }, f);
  });
  // the field at (x, z), or null
  map.fieldAt = function (x, z) {
    for (const f of map.fields) {
      const b = f.bbox;
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      if (inPoly(x, z, f.pts)) return f;
    }
    return null;
  };

  // ---------------- water (the Löli-Weiher) ----------------
  map.water = (S.water || []).map((w, i) => {
    const xs = w.pts.map((p) => p[0]), zs = w.pts.map((p) => p[1]);
    return Object.assign({ i, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }, w);
  });
  // signed distance to the nearest pond edge (negative = in the water); Infinity far away
  map.pondDist = function (x, z) {
    let best = Infinity;
    for (const w of map.water) {
      const b = w.bbox;
      if (x < b[0] - 12 || x > b[2] + 12 || z < b[1] - 12 || z > b[3] + 12) continue;
      let d = Infinity;
      for (let i = 0, j = w.pts.length - 1; i < w.pts.length; j = i++) d = Math.min(d, distSeg(x, z, w.pts[j][0], w.pts[j][1], w.pts[i][0], w.pts[i][1]));
      if (inPoly(x, z, w.pts)) d = -d;
      best = Math.min(best, d);
    }
    return best;
  };
  map.fishing = map.water[0] ? { x: map.water[0].fishing[0], z: map.water[0].fishing[1], cx: map.water[0].centre[0], cz: map.water[0].centre[1] } : null;

  // ---------------- grids ----------------
  const N = W * H;
  map.walkCost = new Float32Array(N);
  map.animalCost = new Float32Array(N);
  map.duckCost = new Float32Array(N);
  map.onStreet = new Uint8Array(N);
  for (let cz = 0; cz < H; cz++)
    for (let cx = 0; cx < W; cx++) {
      const { x, z } = map.cellCentre(cx, cz);
      const i = cz * W + cx;
      const pd = map.pondDist(x, z);
      const blocked = map.inBuilding(x, z, 0.4) || pd < 0.6;
      const sd = map.streetDist(x, z);
      map.duckCost[i] = pd < -0.3 ? 1 : pd < 2.5 && !map.inBuilding(x, z, 0.4) ? 2.5 : 0; // ducks swim, sometimes waddle on the shore
      map.onStreet[i] = sd < 0 ? 1 : 0;
      const field = sd > 2.5 && map.fieldAt(x, z);
      map.walkCost[i] = blocked ? 0 : sd < 0.5 ? 1 : sd < 2.5 ? 1.6 : field && field.kind !== 'meadow' ? 3.5 : 2.6; // people like streets and sidewalks, not crops
      map.animalCost[i] = blocked ? 0 : sd < 0 ? 2 : field ? 1.3 : 1; // cats prefer gardens
    }

  // ---------------- buildings ----------------
  const LINES = {
    chapel: { lines: ['Bimm… bamm… 🔔', 'D\'Heiligkreuz-Kapälle. Ganz still do inne.', 'Do brönnt immer e Cherze.'], sound: 'bell' },
    beiz: { lines: ['Prost! 🍺', 'S\'Casino – s\'Vereinslokal vo Nesselnbach.', 'Stammtisch isch am Friitig!'], sound: 'clink' },
    farmhouse: { lines: ["S'Buurehuus, Niederwilerstrasse 3.", "Links wohne, rächts d'Schüür.", "Do wohne d'Mige, d'Mina und d'Luna. 🐾", "De Joel und d'Mariana parkiere ihre Mini do, wenn si us Lenzburg cho sind."], sound: 'door' },
    barn: { lines: ['%a', 'Do schmöckt\'s nach Heu.'], sound: 'door' },
    garage: { lines: ['%a', 'Do staht s\'Velo.'], sound: 'door' },
    dairy: { lines: ["D'Milchzentrale vo de Gehrigs – Silvia, Roman und Reto. Do wird d'Milch gsammlet und Chäs gmacht. 🧀", 'Mmh, es schmöckt nach frischem Chäs!', "Am Morge und am Abig chömed d'Buure mit de Milchkanne.", "Isch letschthin abebrönnt – jetz isch alles wider neu. Also bitte nid z'fescht klopfe!"], sound: 'clink' },
    house: { lines: ['%a', 'Do wohnt\'s sich schön.'], sound: 'door' },
  };
  S.buildings.forEach((spec, i) => {
    const l = LINES[spec.kind] || LINES.house;
    const name = ['chapel', 'beiz', 'farmhouse', 'dairy'].includes(spec.kind) ? spec.name : spec.addr || spec.name || 'Huus';
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
    // visitors' parking spot: in the yard on the barn side of the front door, a car length off the wall
    let parking = null;
    for (const [k, m] of [[7, 4.5], [9, 4.5], [6, 6], [11, 4], [7, 7], [5, 3.5], [13, 5]]) {
      const x = farm.door[0] - t[0] * sg * k + n[0] * m, z = farm.door[1] - t[1] * sg * k + n[1] * m;
      if (!map.inBuilding(x, z, 1.4) && map.streetDist(x, z) > 1.5) { parking = { x, z, heading: Math.atan2(t[0] * sg, t[1] * sg) }; break; }
    }
    map.farmProps = { bench: { x: bx, z: bz, heading: Math.atan2(n[0], n[1]) }, table: { x: tx, z: tz }, parking };
    map.parkings = { mige: parking };
    // named spots at the Sitzplatz so people don't stack: 4 stools round the table, 2 bench seats, standing places
    const seats = [];
    for (const [u, v] of [[1.25, 0], [-1.25, 0], [0, 1.25], [0, -1.25]]) {
      const [ox, oz] = NB.Iso.unrot(u * 1.2, v * 1.2);
      seats.push({ x: tx + ox, z: tz + oz, face: Math.atan2(-ox, -oz), sit: true });
    }
    const bh = Math.atan2(n[0], n[1]), px = Math.cos(bh), pz = -Math.sin(bh);
    for (const k of [-0.5, 0.5]) seats.push({ x: bx + px * k, z: bz + pz * k, face: bh, sit: true, bench: true });
    for (let a = 0.4; a < Math.PI * 2; a += Math.PI / 3) {
      const x = tx + Math.cos(a) * 3.4, z = tz + Math.sin(a) * 3.4;
      if (!map.inBuilding(x, z, 0.6) && map.streetDist(x, z) > 0.5) seats.push({ x, z, face: Math.atan2(tx - x, tz - z), sit: false });
    }
    map.spots = { sitzplatz: seats };
    map.pois.sitzplatz = [tx - 2.2, tz - 2.2, tx + 2.2, tz + 2.2];
    // the table itself is not walkable
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = map.cellCentre(cx, cz);
      if (Math.hypot(c.x - tx, c.z - tz) < 1) { map.walkCost[cz * W + cx] = 0; map.animalCost[cz * W + cx] = 0; }
    }
  }
  // Milchzentrale: a parking bay for the milk lorry beside the loading door
  const milch = map.buildings.milch;
  if (milch) {
    map.parkings = map.parkings || {};
    // candidates on a ring around the building; prefer the side towards the viewer (+x +z) and near the door
    const ca = Math.cos(milch.angle), sa = Math.sin(milch.angle);
    let best = null;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const u = Math.cos(a) * (milch.w / 2 + 6), v = Math.sin(a) * (milch.d / 2 + 6);
      const x = milch.cx + u * ca - v * sa, z = milch.cz + u * sa + v * ca;
      if (x < bx0 + 5 || x > bx1 - 5 || z < bz0 + 5 || z > bz1 - 5 || map.inBuilding(x, z, 2.5) || map.streetDist(x, z) > 60 || map.streetDist(x, z) < 2) continue;
      const score = -2 * Math.max(0, map.streetDist(x, z) - 3) + 0.4 * (x - milch.cx) - 0.3 * Math.hypot(x - milch.door[0], z - milch.door[1]); // by the street, to the right (not hidden)
      if (!best || score > best.score) {
        const alongU = Math.abs(Math.cos(a)) * milch.d > Math.abs(Math.sin(a)) * milch.w; // at the short ends park along v
        best = { score, x, z, heading: alongU ? Math.atan2(-sa, ca) : Math.atan2(ca, sa) };
      }
    }
    if (best) map.parkings.dairy = { x: best.x, z: best.z, heading: best.heading };
  }
  // POIs from older data that don't exist in this small scene
  const ALIAS = { casino: 'beiz', niederwil: 'niederwilerstrasse', reuss: 'kapellenweg', wald: 'kapellenweg', gnadenthal: 'kapellenweg', gartebahn: 'ifangweg', feld: 'kapellenweg', weide: 'kapellenweg', schuel: 'niederwilerstrasse' };
  for (const [k, v] of Object.entries(ALIAS)) if (!map.pois[k]) map.pois[k] = map.pois[v];

  // vehicle route (Niederwilerstrasse) and bus stops
  map.route = S.route.map(([x, z]) => ({ x, z }));
  map.busStops = S.stops.map((s) => ({ name: s.name, x: s.at[0], z: s.at[1] }));

  // random walkable point inside a POI rect (metres); returns {x, z} or null
  // tractor lanes across a field: rows along the field's long axis, 3.6 m apart, driven back and forth
  // (boustrophedon). Only the parts inside the painted ground, clear of buildings and streets. Cached per field.
  const laneCache = new Map();
  map.fieldLanes = function (f) {
    if (laneCache.has(f)) return laneCache.get(f);
    const a = f.angle, dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
    let t0 = Infinity, t1 = -Infinity, s0 = Infinity, s1 = -Infinity;
    for (const [x, z] of f.pts) { const t = x * dx + z * dz, s = x * nx + z * nz; t0 = Math.min(t0, t); t1 = Math.max(t1, t); s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
    const M = 40;
    const ok = (x, z) => x > bx0 - M && x < bx1 + M && z > bz0 - M && z < bz1 + M && inPoly(x, z, f.pts) && !map.inBuilding(x, z, 2.5) && map.streetDist(x, z) > 2.5 && map.pondDist(x, z) > 4;
    const rows = [];
    let flip = false;
    for (let s = s0 + 3; s < s1 - 2; s += 3.6, flip = !flip) {
      const runs = []; let run = null;
      for (let t = t0; t <= t1; t += 1) {
        if (ok(dx * t + nx * s, dz * t + nz * s)) { if (run) run[1] = t; else run = [t, t]; }
        else if (run) { runs.push(run); run = null; }
      }
      if (run) runs.push(run);
      const segs = runs.filter((r) => r[1] - r[0] >= 12).map(([ta, tb]) => [ta + 1.5, tb - 1.5]);
      if (flip) segs.reverse();
      for (const [ta, tb] of segs) {
        const A = { x: dx * ta + nx * s, z: dz * ta + nz * s }, B = { x: dx * tb + nx * s, z: dz * tb + nz * s };
        rows.push(flip ? { a: B, b: A } : { a: A, b: B });
      }
    }
    laneCache.set(f, rows);
    return rows;
  };

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
