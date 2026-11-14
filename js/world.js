// World logic built from js/data/scene.js: walk grid for pathfinding, buildings, POIs, vehicle route.
// Units: metres, x = east, z = south.
(function (NB) {
  const S = NB.Scene;
  S.buildings.forEach((b) => NB.Iso.snapBuilding(b)); // iso pixel art: buildings sit on the iso grid, doors on a visible face
  // neighbours chat on the lane between Ifangweg 15 and 17 (map.spots.schwatz, set below once the map exists)
  // a lane to a house ends right at its (snapped) front door: straight on from the street, then up to the door
  for (const st of S.streets) {
    const b = st.kind === 'lane' && st.to && S.buildings.find((q) => q.addr === st.to);
    if (!b) continue;
    const [p0, p1] = st.pts, dx = p1[0] - p0[0], dz = p1[1] - p0[1], l2 = dx * dx + dz * dz || 1;
    const t = ((b.entry[0] - p0[0]) * dx + (b.entry[1] - p0[1]) * dz) / l2, bend = [p0[0] + dx * t, p0[1] + dz * t]; // on the lane's line, level with the door
    st.pts = [p0, p1, bend, [b.door[0] + b.doorN[0] * 0.3, b.door[1] + b.doorN[1] * 0.3]].map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]);
  }
  const C = 2; // metres per path-finding cell
  const [bx0, bz0, bx1, bz1] = S.bounds;
  const tWorld = performance.now();
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
  map.sdGrid = new Float32Array(N); // street distance per cell (cheap lookups)
  map.bldGrid = new Uint8Array(N); // 1 = inside / right next to a building
  for (let cz = 0; cz < H; cz++)
    for (let cx = 0; cx < W; cx++) {
      const { x, z } = map.cellCentre(cx, cz);
      const i = cz * W + cx;
      const pd = map.pondDist(x, z);
      const inB = map.inBuilding(x, z, 0.4), blocked = inB || pd < 0.6;
      const sd = map.streetDist(x, z);
      map.duckCost[i] = pd < -0.3 ? 1 : pd < 2.5 && !inB ? 2.5 : 0; // ducks swim, sometimes waddle on the shore
      map.onStreet[i] = sd < 0 ? 1 : 0; map.sdGrid[i] = sd; map.bldGrid[i] = inB ? 1 : 0;
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
  // Ifangweg 23 (André + Monika Koch): boule court in front of the door, a bench beside it, Monika's hydrangeas
  // (from the Gärtnerei Gisler) by the door and at the end of the court, a parking spot for André's jeep
  const koch = Object.values(map.buildings).find((b) => b.addr === 'Ifangweg 23');
  if (koch) {
    // the court goes on the side of the house that faces the fields (between house and farmland): pick the facade
    // whose outward normal reaches a field soonest and is not blocked by buildings or the street
    const kca = Math.cos(koch.angle), ksa = Math.sin(koch.angle);
    let side = null;
    for (const [nx, nz, half] of [[kca, ksa, koch.w / 2], [-kca, -ksa, koch.w / 2], [-ksa, kca, koch.d / 2], [ksa, -kca, koch.d / 2]]) {
      let dist = 60;
      for (let r = 3; r <= 50; r += 2) if (map.fieldAt(koch.cx + nx * (half + r), koch.cz + nz * (half + r))) { dist = r; break; }
      const px = koch.cx + nx * (half + 7), pz = koch.cz + nz * (half + 7);
      const blocked = map.inBuilding(px, pz, 1.5) || map.streetDist(px, pz) < 3 || map.pondDist(px, pz) < 8;
      const score = dist + (blocked ? 100 : 0);
      if (!side || score < side.score) side = { score, n: [nx, nz], half, dist };
    }
    const n = side.n, t = [-n[1], n[0]], D = [koch.cx + n[0] * side.half, koch.cz + n[1] * side.half]; // "door" = centre of that facade
    const at = (a, m) => ({ x: D[0] + t[0] * a + n[0] * m, z: D[1] + t[1] * a + n[1] * m });
    const L = 12, WD = 3, A0 = 1, M0 = Math.max(4.4, Math.min(6.2, side.dist - WD / 2 - 0.6)); // court between facade and field edge
    const onCourt = (p, pad) => { const a = (p.x - D[0]) * t[0] + (p.z - D[1]) * t[1] - A0, m = (p.x - D[0]) * n[0] + (p.z - D[1]) * n[1] - M0; return Math.abs(a) < L / 2 + pad && Math.abs(m) < WD / 2 + pad; };
    const free = (p, r) => !map.inBuilding(p.x, p.z, r) && map.streetDist(p.x, p.z) > 1.5 && !onCourt(p, r);
    const C = at(A0, M0), throwPt = at(A0 - L / 2 + 1, M0);
    // bench on the far side of the court, looking at it
    const bench = Object.assign(at(A0 - 1, M0 + WD / 2 + 1.3), { heading: Math.atan2(-n[0], -n[1]) });
    // hydrangeas: two beds either side of the door, three bushes beyond the far end of the court
    const bushes = [];
    for (const a of [-3.2, -1.9, 1.9, 3.2]) { const p = at(a, 0.8); if (free(p, 0.2)) bushes.push(Object.assign(p, { stand: at(a, 2.1), face: Math.atan2(-n[0], -n[1]) })); }
    for (const m of [M0 - 1.3, M0, M0 + 1.3]) { const p = at(A0 + L / 2 + 1.2, m); if (free(p, 0.2)) bushes.push(Object.assign(p, { stand: at(A0 + L / 2 + 2.3, m), face: Math.atan2(-t[0], -t[1]) })); }
    // the jeep: beyond the far end of the court (towards the viewer, so no house hides it), else beside it
    let parking = null;
    for (const [a, m] of [[A0 + L / 2 + 4.8, M0 + 0.5], [A0 + L / 2 + 4.8, M0 + 3], [A0 + L / 2 + 4.8, M0 - 2], [A0, M0 + WD / 2 + 4.5], [A0 - L / 2 - 3.5, M0 + 1], [A0 - L / 2 - 3.5, M0 + 4]]) {
      const p = at(a, m);
      if (free(p, 1.8) && !map.fieldAt(p.x, p.z) && !bushes.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 2.6)) { parking = { x: p.x, z: p.z, heading: Math.atan2(n[0], n[1]) }; break; }
    }
    map.kochProps = { court: { x: C.x, z: C.z, len: L, wid: WD, alongX: Math.abs(t[0]) > Math.abs(t[1]) }, corners: [at(A0 - L / 2, M0 - WD / 2), at(A0 + L / 2, M0 - WD / 2), at(A0 + L / 2, M0 + WD / 2), at(A0 - L / 2, M0 + WD / 2)],
      throwPt, throwFace: Math.atan2(t[0], t[1]), dir: t, bench, bushes, parking };
    map.parkings = map.parkings || {};
    if (parking) map.parkings.koch = parking;
    map.spots = map.spots || {};
    map.spots.boule = [{ x: throwPt.x, z: throwPt.z, face: Math.atan2(t[0], t[1]), sit: false }];
    const bh = bench.heading, px = Math.cos(bh), pz = -Math.sin(bh);
    map.spots.boulebank = [-0.5, 0.5].map((k) => ({ x: bench.x + px * k, z: bench.z + pz * k, face: bh, sit: true, bench: true }));
    map.spots.hortensien = bushes.map((b) => ({ x: b.stand.x, z: b.stand.z, face: b.face, sit: false, bush: b }));
    const box = (p, r) => [p.x - r, p.z - r, p.x + r, p.z + r];
    map.pois.boule = box(throwPt, 0.8);
    map.pois.boulebank = box(bench, 1.2);
    map.pois.hortensien = box(at(0, 2.1), 2.5);
    // bushes and the bench are not walkable
    for (const p of bushes.concat([bench])) {
      const [c0x, c0z] = map.toCell(p.x - 1, p.z - 1), [c1x, c1z] = map.toCell(p.x + 1, p.z + 1);
      for (let cz = Math.max(0, c0z); cz <= Math.min(H - 1, c1z); cz++) for (let cx = Math.max(0, c0x); cx <= Math.min(W - 1, c1x); cx++) {
        const c = map.cellCentre(cx, cz);
        if (Math.hypot(c.x - p.x, c.z - p.z) < (p === bench ? 0.6 : 0.5)) { map.walkCost[cz * W + cx] = 0; map.animalCost[cz * W + cx] = 0; }
      }
    }
  }
  // petrol station (Gratank, Bremgarterstrasse): bay at the pumps for refuelling cars
  map.fuel = S.fuel || null;
  if (map.fuel) {
    map.parkings = map.parkings || {};
    const f = map.fuel, hx = Math.sin(f.heading), hz = Math.cos(f.heading); // along the road
    map.parkings.fuel = { x: f.x - f.n[0] * 3.2 + hx * 0.5, z: f.z - f.n[1] * 3.2 + hz * 0.5, heading: f.heading }; // under the canopy, road side of the pumps
    // the station footprint is not walkable
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = map.cellCentre(cx, cz), dx = c.x - f.x, dz = c.z - f.z, a = dx * hx + dz * hz, m = dx * f.n[0] + dz * f.n[1];
      if (Math.abs(a) < 7 && m > -4.5 && m < 10.5) { map.walkCost[cz * W + cx] = 0; map.animalCost[cz * W + cx] = 0; }
    }
  }
  // Iris's garden at Ifangweg 15: on the side away from the Ifangweg (south): terrace with table, chairs and a lounge
  // bench, lawn with a curved stone path, flower beds and hydrangeas, a vegetable patch, hedges along the edges, trees,
  // a seating circle with a fire pit and white shrubs at the far end, a garden shed
  const ih = Object.values(map.buildings).find((b) => b.garden);
  if (ih) {
    const ca = Math.cos(ih.angle), sa = Math.sin(ih.angle);
    let side = null; // facade farthest from the street
    const roadDist = (x, z) => { // distance to the real streets (not the little lane to Ifangweg 19, which runs past the house)
      let d = Infinity;
      for (const st of S.streets) if (st.kind !== 'lane') for (let i = 1; i < st.pts.length; i++) {
        const [ax, az] = st.pts[i - 1], [bx, bz] = st.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = NB.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
        d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t) - st.width / 2);
      }
      return d;
    };
    for (const [nx, nz, half] of [[ca, sa, ih.w / 2], [-ca, -sa, ih.w / 2], [-sa, ca, ih.d / 2], [sa, -ca, ih.d / 2]]) {
      const px = ih.cx + nx * (half + 8), pz = ih.cz + nz * (half + 8), sd = roadDist(px, pz), blocked = map.inBuilding(px, pz, 2);
      if (!blocked && (!side || sd > side.sd)) side = { sd, n: [nx, nz], half, across: half === ih.w / 2 ? ih.d / 2 : ih.w / 2 };
    }
    const n = side.n, t = [-n[1], n[0]], B = [ih.cx + n[0] * side.half, ih.cz + n[1] * side.half];
    const at = (a, m) => ({ x: B[0] + t[0] * a + n[0] * m, z: B[1] + t[1] * a + n[1] * m });
    const A0 = -side.across - 2, A1 = side.across + 3, M1 = 26; // garden rectangle in (a, m)
    const local = (x, z) => [(x - B[0]) * t[0] + (z - B[1]) * t[1], (x - B[0]) * n[0] + (z - B[1]) * n[1]];
    const inside = (x, z, pad) => { const [a, m] = local(x, z); return a > A0 - (pad || 0) && a < A1 + (pad || 0) && m > -(pad || 0) && m < M1 + (pad || 0); };
    const G = (map.irisGarden = { B, t, n, at, local, inside, A0, A1, M1, angle: Math.atan2(t[1], t[0]) });
    G.terrace = { a0: -5, a1: 5, m0: 0.4, m1: 4.6 };
    G.table = at(-1, 2.6); G.chairs = [at(-2.4, 2.6), at(0.4, 2.6)]; G.lounge = [at(3.6, 1.6), at(3.6, 3.2)];
    G.pit = at(A1 - 4.5, M1 - 4); G.pitSeats = [at(A1 - 4.5 - 2.2, M1 - 4), at(A1 - 4.5, M1 - 4 - 2.2)];
    G.path = [at(0, 4.6), at(-4, 12), at(2, 18), G.pit];
    G.veg = { a0: A0 + 1.5, a1: A0 + 5.5, m0: 13, m1: 18 };
    G.beds = [at(-6.2, 0.9), at(6.2, 0.9), at(A1 - 1.2, 8), at(A1 - 1.2, 14), at(A0 + 1.2, 8), at(A1 - 1.5, M1 - 1.5), at(A1 - 8.5, M1 - 1.5)];
    G.hyd = [at(A0 + 1.3, 21), at(A1 - 1.3, 20), at(-6.8, 5.5), at(6.8, 5.5)];
    G.trees = [{ p: at(A0 + 2.5, 24), kind: 'leaf', v: 2 }, { p: at(A1 - 2, 3), kind: 'leaf', v: 5 }, { p: at(A0 + 1.5, 10.5), kind: 'pine', v: 1 }, { p: at(4, 11), kind: 'leaf', v: 6 }];
    G.shed = at(A0 + 2.2, 2.5); G.shedHeading = Math.atan2(t[0], t[1]);
    G.hedges = []; // east and west edges, south edge
    for (let m = 1; m < M1; m += 3) { G.hedges.push({ p: at(A1 + 0.3, m + 1.5), h: Math.atan2(n[0], n[1]), len: 3 }); if (m > 6) G.hedges.push({ p: at(A0 - 0.3, m + 1.5), h: Math.atan2(n[0], n[1]), len: 3 }); }
    for (let a = A0; a < A1; a += 3) G.hedges.push({ p: at(a + 1.5, M1 + 0.3), h: Math.atan2(t[0], t[1]), len: Math.min(3, A1 - a) });
    G.hedges = G.hedges.filter((h) => !map.inBuilding(h.p.x, h.p.z, 0.8) && map.streetDist(h.p.x, h.p.z) > 1);
    // spots: terrace seats, fire-pit seats, gardening stations (water the beds, hydrangeas and the vegetables)
    map.spots = map.spots || {};
    const faceTo = (p, q) => Math.atan2(q.x - p.x, q.z - p.z);
    map.spots.terrasse = G.chairs.map((c) => ({ x: c.x, z: c.z, face: faceTo(c, G.table), sit: true })).concat(G.lounge.map((c) => ({ x: c.x, z: c.z, face: Math.atan2(n[0], n[1]), sit: true })), [at(-3.5, 1.5), at(1.5, 1.2)].map((c) => ({ x: c.x, z: c.z, face: faceTo(c, G.table), sit: false })));
    map.spots.fuurstell = G.pitSeats.map((c) => ({ x: c.x, z: c.z, face: faceTo(c, G.pit), sit: true })).concat([at(A1 - 4.5 + 2.2, M1 - 4)].map((c) => ({ x: c.x, z: c.z, face: faceTo(c, G.pit), sit: false })));
    const stations = G.beds.map((b, i) => ({ bush: b, stand: at(...(() => { const [a, m] = local(b.x, b.z); return [a + (a > 0 ? -1.6 : 1.6), m + (m < 2 ? 1.4 : m > M1 - 3 ? -1.4 : 0)]; })()) }))
      .concat(G.hyd.map((b) => ({ bush: b, stand: at(...(() => { const [a, m] = local(b.x, b.z); return [a + (a > 0 ? -1.6 : 1.6), m]; })()) })), [{ bush: at((G.veg.a0 + G.veg.a1) / 2, (G.veg.m0 + G.veg.m1) / 2), stand: at(G.veg.a1 + 1.2, (G.veg.m0 + G.veg.m1) / 2) }]);
    map.spots.garte = stations.map((st) => ({ x: st.stand.x, z: st.stand.z, face: faceTo(st.stand, st.bush), sit: false, bush: st.bush }));
    const box = (ps, r) => [Math.min(...ps.map((p) => p.x)) - r, Math.min(...ps.map((p) => p.z)) - r, Math.max(...ps.map((p) => p.x)) + r, Math.max(...ps.map((p) => p.z)) + r];
    map.spots.spielwiese = [at(-1.5, 10), at(1.5, 11)].map((c) => ({ x: c.x, z: c.z, face: 0, sit: false })); // Iris and Nuria play tag on the lawn
    G.play = at(0, 10.5);
    map.pois.terrasse = box(map.spots.terrasse, 1); map.pois.fuurstell = box(map.spots.fuurstell, 1); map.pois.garte = box(map.spots.garte, 1); map.pois.spielwiese = box(map.spots.spielwiese, 1.5);
    // fields never reach into the garden; hedges, shed, table, pit are not walkable
    const fieldAt0 = map.fieldAt; map.fieldAt = (x, z) => (inside(x, z, 1) ? null : fieldAt0(x, z));
    const blockers = G.hedges.map((h) => ({ x: h.p.x, z: h.p.z, r: 1.6 })).concat([{ x: G.table.x, z: G.table.z, r: 0.8 }, { x: G.pit.x, z: G.pit.z, r: 0.9 }, { x: G.shed.x, z: G.shed.z, r: 1.6 }], G.trees.map((tr) => ({ x: tr.p.x, z: tr.p.z, r: 0.6 })));
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = map.cellCentre(cx, cz), i = cz * W + cx;
      if (inside(c.x, c.z, 0) && map.walkCost[i]) map.walkCost[i] = Math.min(map.walkCost[i], 1.6); // a garden is nice to walk in
      if (blockers.some((b) => Math.hypot(c.x - b.x, c.z - b.z) < b.r)) { map.walkCost[i] = 0; map.animalCost[i] = 0; }
    }
  }
  // a parking spot in front of Iris's house (Ifangweg 15), between the house and the Ifangweg: Yves's Celica
  const irisB = Object.values(map.buildings).find((b) => b.addr === 'Ifangweg 15');
  if (irisB) {
    const ifang = S.streets.filter((q) => q.name === 'Ifangweg' && !q.kind);
    let best = null; // the point of the Ifangweg nearest the house
    for (const q of ifang) for (let i = 1; i < q.pts.length; i++) {
      const [ax, az] = q.pts[i - 1], [bx, bz] = q.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = NB.clamp(((irisB.cx - ax) * dx + (irisB.cz - az) * dz) / l2, 0, 1), x = ax + dx * t, z = az + dz * t, d = Math.hypot(irisB.cx - x, irisB.cz - z);
      if (!best || d < best.d) best = { d, x, z, w: q.width, along: [dx / Math.sqrt(l2), dz / Math.sqrt(l2)] };
    }
    if (best) {
      const n = [(irisB.cx - best.x) / best.d, (irisB.cz - best.z) / best.d], tc = [Math.sin(NB.Iso.towardCamera), Math.cos(NB.Iso.towardCamera)];
      const seen = (x, z) => { for (let t = 0.5; t <= 14; t += 0.75) if (map.inBuilding(x + tc[0] * t, z + tc[1] * t, 0.3)) return false; return true; };
      const cands = [];
      for (const sd of [0, 3, -3, 6, -6, 9, -9, 12, -12]) for (const k of [2.6, 3.6]) {
        const x = best.x + n[0] * (best.w / 2 + k) + best.along[0] * sd, z = best.z + n[1] * (best.w / 2 + k) + best.along[1] * sd, [cx, cz] = map.toCell(x, z);
        if (map.inBuilding(x, z, 1.6) || !map.inB(cx, cz) || !map.walkCost[cz * W + cx] || (map.irisGarden && map.irisGarden.inside(x, z, 0.5)) || map.streetDist(x, z) < 1.2) continue;
        cands.push({ x, z, ok: seen(x, z) && seen(x + best.along[0] * 2, z + best.along[1] * 2) && seen(x - best.along[0] * 2, z - best.along[1] * 2) });
      }
      const c = cands.find((q) => q.ok) || cands[0]; // one we can see, if there is one
      if (c) { map.parkings = map.parkings || {}; map.parkings.iris = { x: c.x, z: c.z, heading: Math.atan2(best.along[0], best.along[1]) }; } // parallel to the street
    }
  }
  {
    const lane = S.streets.find((q) => q.kind === 'lane' && q.to === 'Ifangweg 19');
    if (lane) {
      const [a, b] = lane.pts, t = 0.75, p = { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t }, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      map.spots = map.spots || {};
      map.spots.schwatz = [1, -1].map((k) => ({ x: p.x + nx * 0.9 * k, z: p.z + nz * 0.9 * k, face: Math.atan2(-nx * k, -nz * k), sit: false })); // facing each other
      map.pois.schwatz = [p.x - 2, p.z - 2, p.x + 2, p.z + 2];
    }
  }
  // Ifangweg 17 (Tanja, André, Louis, Nuria), from the aerial photo: the door faces the Ifangweg (north); a big lawn on
  // the west side where Louis plays football (a goal at the far end), a paved terrace along the south and west of the
  // house, beds along the hedges that André and Louis look after, a tree in the south-east corner
  const th = Object.values(map.buildings).find((b) => b.lawn);
  if (th) {
    const U = [Math.cos(th.angle), Math.sin(th.angle)], V = [-Math.sin(th.angle), Math.cos(th.angle)];
    const sv = V[0] * th.doorN[0] + V[1] * th.doorN[1] > 0 ? -1 : 1, su = U[0] < 0 ? -1 : 1; // +v away from the door, +u east
    const at = (u, v) => ({ x: th.cx + U[0] * u * su + V[0] * v * sv, z: th.cz + U[1] * u * su + V[1] * v * sv });
    const local = (x, z) => { const dx = x - th.cx, dz = z - th.cz; return [(dx * U[0] + dz * U[1]) * su, (dx * V[0] + dz * V[1]) * sv]; };
    const hw = th.w / 2, hd = th.d / 2, U1 = hw + 1.5, V0 = -hd - 3, V1 = hd + 6;
    // the lawn reaches west up to 12 m, but stops 1.5 m short of the neighbour's house (Ifangweg 21)
    const clearCol = (u) => { for (let v = V0 - 1; v <= V1 + 1; v += 0.75) { const p = at(u, v), q = map.inBuilding(p.x, p.z, 1.5); if (q && q !== th) return false; } return true; };
    let U0 = -hw - 12; while (U0 < -hw - 5 && !clearCol(U0 - 0.6)) U0 += 0.5;
    const inside = (x, z, pad) => { const [u, v] = local(x, z), q = pad || 0; return u > U0 - q && u < U1 + q && v > V0 - q && v < V1 + q; };
    const G = (map.tanjaGarden = { at, local, inside, U0, U1, V0, V1, hw, hd, hU: Math.atan2(U[0] * su, U[1] * su), hV: Math.atan2(V[0] * sv, V[1] * sv) });
    G.terrace = [[-hw - 1.3, 0, hd + 0.2, hd + 3], [-hw - 1.3, -hw, -hd + 1, hd + 3]]; // [u0, u1, v0, v1]
    G.table = at(-hw * 0.55, hd + 1.7); G.chairs = [at(-hw * 0.55 - 1.3, hd + 1.7), at(-hw * 0.55 + 1.3, hd + 1.7)];
    G.lawn = { u0: U0 + 1, u1: -hw - 4, v0: V0 + 1, v1: hd + 3 }; // the play area: not right behind the house
    G.goal = at(U0 + 1.2, (V0 + 1 + hd + 3) / 2); G.goalHalf = 1.5; // posts along v, facing +u
    G.beds = [at(U0 + 0.9, V0 + 2), at(-hw - 3, V1 - 0.9), at(-hw + 3, V1 - 0.9), at(1, V1 - 0.9), at(U0 + 0.9, V1 - 2)];
    G.tree = at(U1 - 1.5, V1 - 1.5);
    G.hedges = [];
    for (let v = V0; v < V1; v += 3) G.hedges.push({ p: at(U0 - 0.3, v + 1.5), h: G.hV, len: Math.min(3, V1 - v) });
    for (let u = U0; u < U1; u += 3) G.hedges.push({ p: at(u + 1.5, V1 + 0.3), h: G.hU, len: Math.min(3, U1 - u) });
    for (let u = U0; u < -hw - 3; u += 3) G.hedges.push({ p: at(u + 1.5, V0 - 0.3), h: G.hU, len: 3 });
    G.hedges = G.hedges.filter((h) => !map.inBuilding(h.p.x, h.p.z, 1.6) && map.streetDist(h.p.x, h.p.z) > 1); // 3 m pieces: keep them off every house
    G.beds = G.beds.filter((b) => !map.inBuilding(b.x, b.z, 1));
    map.spots = map.spots || {};
    const faceTo = (p, q) => Math.atan2(q.x - p.x, q.z - p.z), box = (ps, r) => [Math.min(...ps.map((p) => p.x)) - r, Math.min(...ps.map((p) => p.z)) - r, Math.max(...ps.map((p) => p.x)) + r, Math.max(...ps.map((p) => p.z)) + r];
    map.spots.terrasse17 = G.chairs.map((c) => ({ x: c.x, z: c.z, face: faceTo(c, G.table), sit: true })).concat([at(-hw * 0.55, hd + 2.8)].map((c) => ({ x: c.x, z: c.z, face: faceTo(c, G.table), sit: false })));
    map.spots.garte17 = G.beds.map((b) => { const [u, v] = local(b.x, b.z), st = at(u + (u < U0 + 2 ? 1.5 : 0), v + (v > V1 - 2 ? -1.5 : v < V0 + 3 ? 1.5 : 0)); return { x: st.x, z: st.z, face: faceTo(st, b), sit: false, bush: b }; });
    const tc = [Math.sin(NB.Iso.towardCamera), Math.cos(NB.Iso.towardCamera)];
    const seen = (p) => { for (let t = 0.5; t <= 12; t += 0.75) if (map.inBuilding(p.x + tc[0] * t, p.z + tc[1] * t, 0.3)) return false; return true; }; // no roof between it and us
    const lawnPts = [];
    for (let a = 0.1; a < 1; a += 0.15) for (let b = 0.1; b < 1; b += 0.15) { const L = G.lawn, p = at(L.u0 + (L.u1 - L.u0) * a, L.v0 + (L.v1 - L.v0) * b); if (seen(p)) lawnPts.push(p); }
    G.seen = seen;
    map.spots.fuessball = (lawnPts.length ? lawnPts : [at(G.lawn.u0 + 3, 0)]).filter((p, i) => i % 3 === 0).map((p) => ({ x: p.x, z: p.z, face: faceTo(p, G.goal), sit: false }));
    map.pois.terrasse17 = box(map.spots.terrasse17, 1); map.pois.garte17 = box(map.spots.garte17, 1); map.pois.fuessball = box(map.spots.fuessball, 1.5);
    const fieldAt1 = map.fieldAt; map.fieldAt = (x, z) => (inside(x, z, 1) ? null : fieldAt1(x, z));
    const blockers = G.hedges.map((h) => ({ x: h.p.x, z: h.p.z, r: 1.6 })).concat([{ x: G.table.x, z: G.table.z, r: 0.8 }, { x: G.tree.x, z: G.tree.z, r: 0.6 }]);
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = map.cellCentre(cx, cz), i = cz * W + cx;
      if (!inside(c.x, c.z, 2)) continue;
      if (inside(c.x, c.z, 0) && map.walkCost[i]) map.walkCost[i] = Math.min(map.walkCost[i], 1.6);
      if (blockers.some((b) => Math.hypot(c.x - b.x, c.z - b.z) < b.r)) { map.walkCost[i] = 0; map.animalCost[i] = 0; }
    }
  }
  // Hirschfarm behind Niederwilerstrasse 21.1: fenced deer paddock on the side away from the street, with a gate,
  // a feeding rack and a shelter; pumpkin stand (Kürbismarkt) by the street in front of the building
  const hf = Object.values(map.buildings).find((b) => b.addr === 'Niederwilerstrasse 21.1');
  if (hf) {
    const n = [-hf.doorN[0], -hf.doorN[1]], t = [-n[1], n[0]]; // n = away from the street (the back of the building)
    const half = Math.abs(n[0] * Math.cos(hf.angle) + n[1] * Math.sin(hf.angle)) * hf.w / 2 + Math.abs(-n[0] * Math.sin(hf.angle) + n[1] * Math.cos(hf.angle)) * hf.d / 2;
    const B = [hf.cx + n[0] * half, hf.cz + n[1] * half]; // centre of the back wall
    const at = (a, m) => ({ x: B[0] + t[0] * a + n[0] * m, z: B[1] + t[1] * a + n[1] * m });
    let A = 15, M0 = 4, M1 = 27;
    const cornersOk = () => [at(-A, M0), at(A, M0), at(A, M1), at(-A, M1)].every((c) => !map.inBuilding(c.x, c.z, 1) && map.streetDist(c.x, c.z) > 2 && c.x > bx0 + 4 && c.x < bx1 - 4 && c.z > bz0 + 4 && c.z < bz1 - 4);
    for (let k = 0; k < 6 && !cornersOk(); k++) { A -= 2; M1 -= 2; }
    const gate = at(-A + 4, M0), rack = at(2, M0 + 7), shelter = at(A - 5, M1 - 3.5), feed = at(-A + 4, M0 + 3);
    const local = (x, z) => [(x - B[0]) * t[0] + (z - B[1]) * t[1], (x - B[0]) * n[0] + (z - B[1]) * n[1]];
    const inside = (x, z, pad) => { const [a, m] = local(x, z); return Math.abs(a) < A - (pad || 0) && m > M0 + (pad || 0) && m < M1 - (pad || 0); };
    const onFence = (x, z) => { const [a, m] = local(x, z); const nearA = Math.abs(Math.abs(a) - A) < 0.7 && m > M0 - 0.7 && m < M1 + 0.7, nearM = (Math.abs(m - M0) < 0.7 || Math.abs(m - M1) < 0.7) && Math.abs(a) < A + 0.7; return (nearA || nearM) && Math.hypot(x - gate.x, z - gate.z) > 1.6; };
    map.deer = { B, t, n, A, M0, M1, at, local, inside, onFence, gate, rack, shelter, feed, name: 'Hirschfarm' };
    map.deerCost = new Float32Array(N);
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = map.cellCentre(cx, cz), i = cz * W + cx;
      const inP = inside(c.x, c.z, 0.9), fence = onFence(c.x, c.z), blk = map.inBuilding(c.x, c.z, 0.4) || Math.hypot(c.x - rack.x, c.z - rack.z) < 1.2 || Math.hypot(c.x - shelter.x, c.z - shelter.z) < 1.6;
      map.deerCost[i] = inP && !fence && !blk ? 1 : 0;
      if (fence) { map.walkCost[i] = 0; map.animalCost[i] = 0; }
      else if (inside(c.x, c.z, 0) && !(Math.hypot(c.x - feed.x, c.z - feed.z) < 2.6 || Math.hypot(c.x - gate.x, c.z - gate.z) < 2.6)) { map.walkCost[i] = 0; map.animalCost[i] = 0; } // people stay outside (except the feeding corner)
    }
    // pumpkin stand at the Niederwilerstrasse in front of the farm: on the verge 4.5 m off the road edge, on the
    // buildings' side, where nothing hides it (towards the viewer), facing the road
    let stand = null;
    {
      let q = null, qd = Infinity, qt = null; // nearest point on the Niederwilerstrasse to the farm building
      for (const st of S.streets) { if (st.name !== 'Niederwilerstrasse') continue; for (let i = 1; i < st.pts.length; i++) {
        const [ax, az] = st.pts[i - 1], [bxx, bzz] = st.pts[i], dx = bxx - ax, dz = bzz - az, l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((hf.cx - ax) * dx + (hf.cz - az) * dz) / l2)), px = ax + u * dx, pz = az + u * dz, d = Math.hypot(px - hf.cx, pz - hf.cz);
        if (d < qd) { qd = d; q = [px, pz]; qt = [dx / Math.sqrt(l2), dz / Math.sqrt(l2)]; }
      } }
      if (q) {
        const side = (hf.cx - q[0]) * -qt[1] + (hf.cz - q[1]) * qt[0] >= 0 ? 1 : -1, nx = -qt[1] * side, nz = qt[0] * side; // towards the buildings
        let best = null;
        for (const a of [0, 8, -8, 16, -16, 24, -24, 32]) {
          const x = q[0] + qt[0] * a + nx * 7.5, z = q[1] + qt[1] * a + nz * 7.5;
          if (map.inBuilding(x, z, 2.5) || map.streetDist(x, z) < 2 || map.fieldAt(x, z)) continue;
          const score = (x + z) - Math.abs(a) * 0.3;
          if (!best || score > best.score) best = { score, x, z };
        }
        if (best) stand = { x: best.x, z: best.z, heading: Math.atan2(-nx, -nz) };
      }
    }
    map.deer.stand = stand;
    map.spots = map.spots || {};
    const vis = [];
    for (let a = -A + 1.5; a <= A - 1.5; a += 4) { const p = at(a, M0 - 1.4); if (!map.inBuilding(p.x, p.z, 0.5)) vis.push({ x: p.x, z: p.z, face: Math.atan2(n[0], n[1]), sit: false }); }
    map.spots.hirschgehege = vis;
    map.spots.fuettern = [{ x: feed.x, z: feed.z, face: Math.atan2(rack.x - feed.x, rack.z - feed.z), sit: false }];
    if (stand) {
      const fx = Math.sin(stand.heading), fz = Math.cos(stand.heading);
      map.spots.verkauf = [{ x: stand.x - fx * 1.3, z: stand.z - fz * 1.3, face: stand.heading, sit: false }];
      map.spots.kuerbismarkt = [-1.6, 0, 1.6].map((k) => ({ x: stand.x + fx * 1.6 - fz * k, z: stand.z + fz * 1.6 + fx * k, face: Math.atan2(-fx, -fz), sit: false }));
      for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) { const c = map.cellCentre(cx, cz); if (Math.hypot(c.x - stand.x, c.z - stand.z) < 1.2) { map.walkCost[cz * W + cx] = 0; } }
      map.pois.kuerbismarkt = [stand.x - 4, stand.z - 4, stand.x + 4, stand.z + 4];
      map.pois.verkauf = [stand.x - 2, stand.z - 2, stand.x + 2, stand.z + 2];
    }
    map.pois.hirschgehege = [Math.min(...vis.map((v) => v.x)) - 1, Math.min(...vis.map((v) => v.z)) - 1, Math.max(...vis.map((v) => v.x)) + 1, Math.max(...vis.map((v) => v.z)) + 1];
    map.pois.fuettern = [feed.x - 1.5, feed.z - 1.5, feed.x + 1.5, feed.z + 1.5];
    map.pois.hirschfarm = map.pois.hirschgehege;
  }
  // Ifangweg 18 (Ernst and Regina): a big garden railway in the front garden (aerial photo): a long gravel bed on the
  // west side running from the house to the street and a smaller one east of the door, each with track loops,
  // little houses, a station and trees. Loops are closed polylines the trains run on (js/entities/villagers.js)
  const rb = Object.values(map.buildings).find((b) => b.addr === 'Ifangweg 18');
  if (rb) {
    const n = rb.doorN, t = [-n[1], n[0]], E0 = rb.entryPt;
    const tW = t[0] < 0 ? t : [-t[0], -t[1]]; // +a = west, towards Ifangweg 20
    const at = (a, m) => ({ x: E0.x + tW[0] * a + n[0] * m, z: E0.z + tW[1] * a + n[1] * m });
    // a stadium (rounded rectangle) along m, centre (a, m), half-length hl (straight part), radius r
    const stadium = (a, m, hl, r, step) => {
      const pts = [];
      for (let k = 0; k <= 1; k++) {
        const s = k ? -1 : 1;
        for (let q = -hl; q <= hl; q += step) pts.push([a + r * s, m + q * s]);
        for (let ang = 0; ang < Math.PI; ang += step / r) pts.push([a + r * s * Math.cos(ang), m + (hl + r * Math.sin(ang) * 0.999) * s]);
      }
      return pts;
    };
    const eight = (a, m, ra, rm, step) => { const pts = []; for (let u = 0; u < Math.PI * 2; u += step / Math.max(ra, rm)) { const d = 1 + Math.sin(u) ** 2; pts.push([a + (ra * Math.sin(u) * Math.cos(u)) / d * 1.6, m + (rm * Math.cos(u)) / d]); } return pts; };
    const toW = (pts) => pts.map(([a, m]) => at(a, m));
    const beds = [
      { name: 'west', a: 7.6, m: 2.2, hl: 4.2, r: 1.9 }, // the long one, beside the house down to the street
      { name: 'door', a: -3, m: 3.6, hl: 0.8, r: 1.9 },
    ].filter((b) => [[b.a, b.m], [b.a + b.r, b.m + b.hl + b.r], [b.a - b.r, b.m - b.hl - b.r], [b.a + b.r, b.m - b.hl - b.r], [b.a - b.r, b.m + b.hl + b.r]].every(([a, m]) => { const p = at(a, m); return !map.inBuilding(p.x, p.z, 0.2) && map.streetDist(p.x, p.z) > 0.6; }));
    if (beds.length) {
      const R = (map.railway = { at, beds: [], loops: [], decor: [], n, tW });
      for (const b of beds) {
        b.outline = toW(stadium(b.a, b.m, b.hl, b.r + 0.35, 0.25)); // the gravel bed (a bit bigger than the outer track)
        const main = toW(stadium(b.a, b.m, b.hl, b.r - 0.25, 0.15));
        const inner = b.name === 'west' ? toW(eight(b.a, b.m, b.r * 0.55, b.hl + b.r * 0.4, 0.12)) : toW(eight(b.a, b.m, b.r * 0.6, b.hl + b.r * 0.5, 0.12));
        R.beds.push(b); R.loops.push({ bed: b.name, pts: main, main: true }, { bed: b.name, pts: inner });
        // the station by the outer track (west bed), little houses and trees inside the loops
        if (b.name === 'west') R.decor.push({ kind: 'station', p: at(b.a - b.r - 0.05, b.m - 0.4) }, { kind: 'house', p: at(b.a + 0.9, b.m - b.hl - 0.5), v: 0 }, { kind: 'house', p: at(b.a - 0.8, b.m + b.hl + 0.6), v: 1 }, { kind: 'tree', p: at(b.a + 1.1, b.m + 1.6) }, { kind: 'tree', p: at(b.a - 1.1, b.m - 1.9) }, { kind: 'tree', p: at(b.a + 0.2, b.m + b.hl + 1.3) }, { kind: 'church', p: at(b.a - 0.9, b.m - b.hl - 0.4) });
        else R.decor.push({ kind: 'house', p: at(b.a + 1.1, b.m + 1.4), v: 2 }, { kind: 'tree', p: at(b.a - 1.0, b.m - 1.6) }, { kind: 'tree', p: at(b.a + 1.2, b.m - 1.3) });
      }
      for (const L of R.loops) { L.cum = [0]; for (let i = 1; i <= L.pts.length; i++) { const p = L.pts[i - 1], q = L.pts[i % L.pts.length]; L.cum.push(L.cum[i - 1] + Math.hypot(q.x - p.x, q.z - p.z)); } L.len = L.cum[L.cum.length - 1]; }
      // where Ernst stands to play (on the driveway between the beds) and where the others stand to watch
      const BW = beds.find((b) => b.name === 'west'), BD = beds.find((b) => b.name === 'door');
      const faceTo = (p, q) => Math.atan2(q.x - p.x, q.z - p.z);
      const ctl = [];
      if (BW) ctl.push({ p: at(BW.a - BW.r - 0.9, BW.m + 1.2), bed: at(BW.a, BW.m) });
      if (BD) ctl.push({ p: at(BD.a + BD.r + 0.9, BD.m), bed: at(BD.a, BD.m) });
      map.spots = map.spots || {};
      map.spots.iisebahn = ctl.map((c) => ({ x: c.p.x, z: c.p.z, face: faceTo(c.p, c.bed), sit: false }));
      const watch = [];
      for (const b of beds) for (const [da, dm] of [[0, b.hl + b.r + 1.2], [b.r + 0.9, -b.hl], [-b.r - 0.9, -b.hl - 0.8], [b.r + 0.9, b.hl]]) { const p = at(b.a + da, b.m + dm); if (!map.inBuilding(p.x, p.z, 0.4) && map.streetDist(p.x, p.z) > -1.5 && !ctl.some((c) => Math.hypot(c.p.x - p.x, c.p.z - p.z) < 1)) watch.push({ x: p.x, z: p.z, face: faceTo(p, at(b.a, b.m)), sit: false }); }
      map.spots.gartebahn = watch;
      const box = (ps, r) => [Math.min(...ps.map((p) => p.x)) - r, Math.min(...ps.map((p) => p.z)) - r, Math.max(...ps.map((p) => p.x)) + r, Math.max(...ps.map((p) => p.z)) + r];
      map.pois.iisebahn = box(map.spots.iisebahn, 1); map.pois.gartebahn = box(watch.length ? watch : map.spots.iisebahn, 1);
      // the beds are not walked on
      const inBed = (x, z) => beds.some((b) => { const dx = x - E0.x, dz = z - E0.z, a = dx * tW[0] + dz * tW[1], m = dx * n[0] + dz * n[1], qm = Math.max(0, Math.abs(m - b.m) - b.hl); return Math.hypot(a - b.a, qm) < b.r + 0.3; });
      R.inBed = inBed;
      for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) { const c = map.cellCentre(cx, cz); if (Math.abs(c.x - E0.x) < 16 && Math.abs(c.z - E0.z) < 16 && inBed(c.x, c.z)) { map.walkCost[cz * W + cx] = 0; map.animalCost[cz * W + cx] = 0; } }
    }
  }
  // the viewpoint on the Schänisweg (first curve after the houses): a bench looking down at Nesselnbach and a wayside
  // cross beside it; a waypoint further along the track for the walk (js/entities/festivals.js)
  if (S.viewpoint) {
    const V = S.viewpoint, f = V.face, px = Math.cos(f), pz = -Math.sin(f); // across the view
    map.viewpoint = { x: V.x, z: V.z, face: f, bench: { x: V.x, z: V.z }, cross: { x: V.x + px * 1.9 - Math.sin(f) * 0.4, z: V.z + pz * 1.9 - Math.cos(f) * 0.4 } };
    map.spots = map.spots || {};
    map.spots.aussicht = [-0.45, 0.45].map((k) => ({ x: V.x + px * k - Math.sin(f) * 0.25, z: V.z + pz * k - Math.cos(f) * 0.25, face: f, sit: true, bench: true }))
      .concat([{ x: map.viewpoint.cross.x + Math.sin(f) * 1.1, z: map.viewpoint.cross.z + Math.cos(f) * 1.1, face: f + Math.PI, sit: false }, { x: V.x - px * 1.6, z: V.z - pz * 1.6, face: f, sit: false }]);
    map.pois.aussicht = [V.x - 3, V.z - 3, V.x + 3, V.z + 3];
    const fieldAtV = map.fieldAt; map.fieldAt = (x, z) => (Math.hypot(x - V.x, z - V.z) < 5 ? null : fieldAtV(x, z)); // a bit of meadow round the bench
    // the walk: out along the Schänisweg (past the end of the houses), along the grass path to the bench, on to the
    // Nesselnbacherstrasse, then home (js/entities/festivals.js)
    const sw = S.streets.find((q) => q.name === 'Schänisweg' && !q.kind), grass = S.streets.find((q) => q.kind === 'grass');
    const tr = S.streets.find((q) => q.name === 'Schänisweg' && q.kind === 'track');
    if (sw && tr) { const e = [sw.pts[0], sw.pts[sw.pts.length - 1]].sort((p, q) => Math.hypot(p[0] - tr.pts[0][0], p[1] - tr.pts[0][1]) - Math.hypot(q[0] - tr.pts[0][0], q[1] - tr.pts[0][1]))[0]; map.pois.schaenisweg = [e[0] - 2, e[1] - 2, e[0] + 2, e[1] + 2]; }
    if (grass && tr) {
      const d = (p) => Math.min(...tr.pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))), ends = [grass.pts[0], grass.pts[grass.pts.length - 1]];
      const [x, z] = d(ends[0]) > d(ends[1]) ? ends[0] : ends[1]; // the Nesselnbacherstrasse end
      map.pois.feldwaeg = [x - 2, z - 2, x + 2, z + 2];
    }
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

  // Karin's Gassirunde with Kuba (from Niederwilerstrasse 4), always the same loop: up the Niederwilerstrasse past the
  // Buurehuus to the Kapellenweg junction, on to the Dorfplatz, then the whole Ifangweg back down. Waypoints every
  // ~8 m on the road edge; `stop`: Kuba sniffs around there for a while
  {
    const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;
    const If = S.streets.find((s) => s.name === 'Ifangweg');
    const iA = If && If.pts[0], iB = If && If.pts[If.pts.length - 1];
    const A = If && S.streets.find((s) => s.name === 'Niederwilerstrasse' && s.pts.some((p) => near(p, iB, 1)));
    const J = A && A.pts[0];
    const B = A && S.streets.find((s) => s !== A && s.name === 'Niederwilerstrasse' && s.pts.some((p) => near(p, J, 1)) && s.pts.some((p) => near(p, iA, 8)));
    const seg = (pts, a, b) => {
      const idx = (q) => pts.reduce((bi, p, i) => (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(pts[bi][0] - q[0], pts[bi][1] - q[1]) ? i : bi), 0);
      const ia = idx(a), ib = idx(b);
      return ia <= ib ? pts.slice(ia, ib + 1) : pts.slice(ib, ia + 1).reverse();
    };
    if (B) {
      const line = seg(A.pts, iB, J).concat(seg(B.pts, J, iA), If.pts.slice(0, -1));
      const loop = [];
      for (let i = 0; i < line.length; i++) {
        const [ax, az] = line[i], [bx, bz] = line[(i + 1) % line.length], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
        if (l < 0.5) continue;
        const nx = dz / l, nz = -dx / l; // the right-hand road edge
        for (let u = 0; u < l; u += 8) {
          const x = ax + (dx * u) / l, z = az + (dz * u) / l;
          let o = 0;
          for (let k = 0.5; k <= 6; k += 0.5) { const sd = map.streetDist(x + nx * k, z + nz * k); if (sd >= 0.1) { o = k; break; } }
          const px = x + nx * o, pz = z + nz * o, [cx, cz] = map.toCell(px, pz);
          loop.push(map.inB(cx, cz) && map.walkCost[cz * W + cx] > 0 ? { x: px, z: pz } : { x, z });
        }
      }
      for (const poi of ['hof', 'dorfplatz', 'ifangweg']) {
        const a = map.pois[poi]; if (!a) continue;
        const cx = (a[0] + a[2]) / 2, cz = (a[1] + a[3]) / 2;
        loop.reduce((b, w) => (Math.hypot(w.x - cx, w.z - cz) < Math.hypot(b.x - cx, b.z - cz) ? w : b)).stop = poi;
      }
      map.gassi = loop;
    }
  }

  // ---------------- festivals, seasons, animals: where things go ----------------
  // a free spot (x, z) between minD and maxD m from (cx, cz): nothing within `clear` m is a building, a street (2 m)
  // or water; ok(x, z) for extra conditions. Nearest first.
  const freeAt = (x, z, clear) => { // grid lookups only: every cell within `clear` m walkable, no building, 2 m off streets
    const [c0, r0] = map.toCell(x, z), k = Math.ceil(clear / C);
    for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
      if (dx * dx + dz * dz > k * k) continue;
      const cx = c0 + dx, cz = r0 + dz;
      if (!map.inB(cx, cz)) return false;
      const i = cz * W + cx;
      if (!map.walkCost[i] || map.bldGrid[i] || map.sdGrid[i] < 2) return false;
    }
    return true;
  };
  map.freeSpot = function (cx, cz, minD, maxD, clear, ok) {
    for (let d = minD; d <= maxD; d += 2) for (let a = 0; a < 6.28; a += 2 / Math.max(d, 1)) {
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (freeAt(x, z, clear) && (!ok || ok(x, z))) return { x, z };
    }
    return null;
  };
  const blockDisc = (x, z, r) => { // only the cells round (x, z)
    const [c0, r0] = map.toCell(x, z), k = Math.ceil(r / C) + 1;
    for (let cz = Math.max(0, r0 - k); cz <= Math.min(H - 1, r0 + k); cz++) for (let cx = Math.max(0, c0 - k); cx <= Math.min(W - 1, c0 + k); cx++) { const c = map.cellCentre(cx, cz); if (Math.hypot(c.x - x, c.z - z) < r) { map.walkCost[cz * W + cx] = 0; map.animalCost[cz * W + cx] = 0; } }
  };
  const poiC = (n) => { const a = map.pois[n]; return a && { x: (a[0] + a[2]) / 2, z: (a[1] + a[3]) / 2 }; };
  {
    const dp = poiC('dorfplatz');
    // Dorffest (31 July / 1 August): festival tent, sausage grill and beer benches on the lawn next to the Dorfplatz;
    // the 1.-August bonfire out on a field; spots: fest (benches + round the grill)
    const lot = dp && map.freeSpot(dp.x, dp.z, 18, 70, 9, (x, z) => !map.fieldAt(x, z));
    if (lot) {
      const toDp = Math.atan2(dp.x - lot.x, dp.z - lot.z), fx = Math.sin(toDp), fz = Math.cos(toDp), sx = fz, sz = -fx; // f: towards the plaza
      const at = (f, s) => ({ x: lot.x + fx * f + sx * s, z: lot.z + fz * f + sz * s });
      const tent = at(-2.5, 0), grill = at(3, 4.5), tables = [at(2.5, -3), at(4.8, -0.5), at(5.5, -4.5)], banner = at(5.5, 3.5);
      map.fest = { lot, heading: toDp, tent, grill, tables, banner };
      const seats = [];
      for (const t of tables) for (const k of [-0.8, 0, 0.8]) for (const sd of [-1, 1]) seats.push({ x: t.x + sx * k + fx * sd * 0.9, z: t.z + sz * k + fz * sd * 0.9, face: Math.atan2(-fx * sd, -fz * sd), sit: true });
      for (let k = 0; k < 5; k++) { const a = toDp + Math.PI + (k - 2) * 0.55, g = { x: grill.x + Math.sin(a) * 1.8, z: grill.z + Math.cos(a) * 1.8 }; seats.push({ x: g.x, z: g.z, face: Math.atan2(grill.x - g.x, grill.z - g.z), sit: false }); }
      map.festSpots = seats;
      map.pois.fest = [lot.x - 7, lot.z - 7, lot.x + 7, lot.z + 7];
      if (NB.cal && NB.cal.fest) {
        map.spots = map.spots || {}; map.spots.fest = seats;
        blockDisc(tent.x, tent.z, 3.2); blockDisc(grill.x, grill.z, 0.9); tables.forEach((t) => blockDisc(t.x, t.z, 0.7));
      }
    }
    // the bonfire: on the nearest field, well away from houses
    const bf = dp && map.freeSpot(dp.x, dp.z, 50, 200, 10, (x, z) => { const f = map.fieldAt(x, z); return f && !map.inBuilding(x, z, 15); });
    map.bonfire = bf;
    // Christmas tree on the plaza (Advent), the snowman on the lawn next to it (winter)
    map.xmasTree = dp && map.freeSpot(dp.x, dp.z, 4, 30, 2.2, (x, z) => !map.fieldAt(x, z));
    if (map.xmasTree && NB.cal && NB.cal.advent) blockDisc(map.xmasTree.x, map.xmasTree.z, 1.4);
    const st = map.start;
    map.snowman = map.freeSpot(st.x + 12, st.z + 8, 4, 50, 3, (x, z) => !map.fieldAt(x, z) && (!map.xmasTree || Math.hypot(x - map.xmasTree.x, z - map.xmasTree.z) > 6) && (!map.fest || Math.hypot(x - map.fest.lot.x, z - map.fest.lot.z) > 12));
    if (map.snowman) map.spots = Object.assign(map.spots || {}, { schneemaa: [0, 2.1, 4.2].map((a) => ({ x: map.snowman.x + Math.cos(a) * 1.4, z: map.snowman.z + Math.sin(a) * 1.4, face: Math.atan2(-Math.cos(a), -Math.sin(a)), sit: false })) });
    if (map.snowman) map.pois.schneemaa = [map.snowman.x - 2, map.snowman.z - 2, map.snowman.x + 2, map.snowman.z + 2];
    // Easter eggs: one in the garden of each of the houses nearest the village centre, on the side facing the viewer
    const houses = Object.values(map.buildings).filter((b) => b.kind === 'house').sort((p, q) => Math.hypot(p.cx - st.x, p.cz - st.z) - Math.hypot(q.cx - st.x, q.cz - st.z)).slice(0, 26);
    const rnd = NB.seeded(2026);
    map.eggSpots = [];
    for (const b of houses) {
      if (map.eggSpots.length >= 10) break;
      const q = map.freeSpot(b.cx, b.cz, Math.max(b.w, b.d) / 2 + 2, Math.max(b.w, b.d) / 2 + 7, 0.8, (x, z) => !map.fieldAt(x, z) && NB.Iso.depth(x, z) > NB.Iso.depth(b.cx, b.cz) && rnd() < 0.5);
      if (q && map.eggSpots.every((e) => Math.hypot(e.x - q.x, e.z - q.z) > 15)) map.eggSpots.push(Object.assign(q, { house: b.name }));
    }
    // cows on a meadow near the village (May to October), storks on a field (spring)
    const fieldRect = (kinds, w, d) => {
      for (let r = 60; r <= 400; r += 20) for (let a = 0; a < 6.28; a += 12 / r) {
        const x = st.x + Math.cos(a) * r, z = st.z + Math.sin(a) * r, f = map.fieldAt(x, z);
        if (!f || !kinds.includes(f.kind) || x < bx0 + 20 || x > bx1 - 20 || z < bz0 + 20 || z > bz1 - 20) continue;
        const ok = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]].every(([u, v]) => { const f2 = map.fieldAt(x + u, z + v); return f2 === f && !map.inBuilding(x + u, z + v, 6) && map.streetDist(x + u, z + v) > 4; });
        if (ok) return [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
      }
      return null;
    };
    map.cowField = fieldRect(['meadow'], 34, 26);
    map.storkField = fieldRect(['grain', 'root'], 40, 30);
    const cal = NB.cal || {};
    map.spots = map.spots || {};
    // Silvester: everyone stands on the festival lawn, looking up
    if (lot && (cal.silvester || cal.neujahr)) {
      const ring = [];
      for (const [r, n] of [[3, 7], [5.2, 11], [7.2, 14]]) for (let k = 0; k < n; k++) { const a = (k / n) * 6.28 + r, x = lot.x + Math.cos(a) * r, z = lot.z + Math.sin(a) * r; if (freeAt(x, z, 0.4)) ring.push({ x, z, face: Math.atan2(lot.x - x, lot.z - z) + Math.PI, sit: false }); }
      map.spots.silvester = ring; map.pois.silvester = map.pois.fest;
    }
    // Dorfmärt: stands in a horseshoe round a Rösslispiel; buyers in front of the stands, Reto and the Hirschbuur behind theirs
    if (lot && cal.maert) {
      const toDp = map.fest.heading, STANDS = [
        { id: 'chaes', name: 'Chässtand vo de Gehrigs', awning: '#e8c23a', goods: ['#f2d36a', '#e8b84a', '#f6e6a0'], lines: ['Nesselnbacher Bergchäs – en Mocke?', 'Früsch vo de Milchzentrale. 🧀', 'Raclette, Tilsiter, Mutschli.'] },
        { id: 'magebrot', name: 'Magebrot & Mandle', awning: '#d52b1e', goods: ['#8a4a2a', '#c8823a', '#a85a2a'], lines: ['Magebrot! 100 Gramm 3 Franke. 🍪', 'Brönnti Mandle, no warm.', 'Lebchueche mit Herz.'] },
        { id: 'gmues', name: 'Gmües vom Hirschbuur', awning: '#3f8a3a', goods: ['#ff8a2a', '#e05a3a', '#7aba4a'], lines: ['Kürbis, Rüebli, Öpfel – alles vo do. 🎃', 'De Hirschbuur het au Hirschwurscht.', 'Biozertifiziert? Nei. Aber guet!'] },
        { id: 'glace', name: 'Glace & Sirup', awning: '#ff8ab0', goods: ['#ffd0e0', '#a0d8ff', '#fff2b0'], lines: ['Erdbeeri oder Vanille? 🍦', 'Himbeersirup für d\'Chind.', 'Es Glace, bitte!'] },
        { id: 'basteln', name: 'Basar vom Fraueverein', awning: '#4f7aff', goods: ['#b06aff', '#ffd23f', '#5bd06a'], lines: ['Gstrickti Socke und Topflappe.', 'Alles für en guete Zweck. 💛', 'Konfi us em eigete Garte.'] },
      ];
      map.maert = { carousel: { x: lot.x, z: lot.z }, stands: [] };
      STANDS.forEach((st, i) => {
        const a = toDp + Math.PI / 2 + (i / (STANDS.length - 1)) * Math.PI, x = lot.x + Math.sin(a) * 6.6, z = lot.z + Math.cos(a) * 6.6;
        const face = Math.atan2(lot.x - x, lot.z - z), fx = Math.sin(face), fz = Math.cos(face);
        map.maert.stands.push(Object.assign({ x, z, heading: face }, st));
        blockDisc(x, z, 1.3);
        (map.spots.maert = map.spots.maert || []).push(...[-0.8, 0.8].map((k) => ({ x: x + fx * 1.7 + fz * k, z: z + fz * 1.7 - fx * k, face: face + Math.PI, sit: false, stand: st.id })));
        map.spots[st.id] = [{ x: x - fx * 1.75, z: z - fz * 1.75, face, sit: false }];
      });
      blockDisc(lot.x, lot.z, 2.6);
      map.spots.rossli = Array.from({ length: 6 }, (_, k) => { const a = toDp + Math.PI + (k - 2.5) * 0.35; return { x: lot.x + Math.sin(a) * 3.6, z: lot.z + Math.cos(a) * 3.6, face: a + Math.PI, sit: false }; });
      map.pois.maert = map.pois.fest;
    }
    // Samichlaus (5 / 6 December): where he stands in front of the neighbour child's house (Niederwilerstrasse 13)
    const kidHome = map.buildings.haus10;
    if (kidHome && cal.samichlaus) { // in the garden on the side we look at, so the visit isn't hidden behind the house
      const b = kidHome, r = Math.max(b.w, b.d) / 2, dep = NB.Iso.depth(b.cx, b.cz), e = b.entryPt;
      const tc = [Math.sin(NB.Iso.towardCamera), Math.cos(NB.Iso.towardCamera)];
      const seen = (x, z) => { for (let t = 0.5; t <= 16; t += 0.75) if (map.inBuilding(x + tc[0] * t, z + tc[1] * t, 0.2)) return false; return true; }; // no house between it and us
      const at = map.freeSpot(b.cx, b.cz, r + 2, r + 14, 1.2, (x, z) => NB.Iso.depth(x, z) > dep && !map.inBuilding(x, z, 2.5) && seen(x, z) && seen(x + 1.8, z) && seen(x - 1.8, z) && seen(x, z + 1.8) && seen(x, z - 1.8)) || { x: e.x + b.doorN[0] * 2.6, z: e.z + b.doorN[1] * 2.6 };
      const side = [1, -1].map((k) => ({ x: at.x + tc[1] * 1.8 * k, z: at.z - tc[0] * 1.8 * k })); // left or right of him on screen
      const kid = side.find((p) => !map.inBuilding(p.x, p.z, 1) && seen(p.x, p.z)) || side[0];
      map.chlaus = { at, face: Math.atan2(kid.x - at.x, kid.z - at.z) };
      map.spots.chlaus = [{ x: kid.x, z: kid.z, face: Math.atan2(at.x - kid.x, at.z - kid.z), sit: false }];
      map.pois.chlaus = [kid.x - 1, kid.z - 1, kid.x + 1, kid.z + 1];
    }
  }

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
  NB.worldMs = Math.round(performance.now() - tWorld);
})(window.NB);
