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
    for (const [nx, nz, half] of [[ca, sa, ih.w / 2], [-ca, -sa, ih.w / 2], [-sa, ca, ih.d / 2], [sa, -ca, ih.d / 2]]) {
      const px = ih.cx + nx * (half + 8), pz = ih.cz + nz * (half + 8), sd = map.streetDist(px, pz), blocked = map.inBuilding(px, pz, 2);
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
    map.pois.terrasse = box(map.spots.terrasse, 1); map.pois.fuurstell = box(map.spots.fuurstell, 1); map.pois.garte = box(map.spots.garte, 1);
    // fields never reach into the garden; hedges, shed, table, pit are not walkable
    const fieldAt0 = map.fieldAt; map.fieldAt = (x, z) => (inside(x, z, 1) ? null : fieldAt0(x, z));
    const blockers = G.hedges.map((h) => ({ x: h.p.x, z: h.p.z, r: 1.6 })).concat([{ x: G.table.x, z: G.table.z, r: 0.8 }, { x: G.pit.x, z: G.pit.z, r: 0.9 }, { x: G.shed.x, z: G.shed.z, r: 1.6 }], G.trees.map((tr) => ({ x: tr.p.x, z: tr.p.z, r: 0.6 })));
    for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
      const c = map.cellCentre(cx, cz), i = cz * W + cx;
      if (inside(c.x, c.z, 0) && map.walkCost[i]) map.walkCost[i] = Math.min(map.walkCost[i], 1.6); // a garden is nice to walk in
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
