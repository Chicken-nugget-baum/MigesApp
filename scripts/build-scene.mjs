// Builds the 3D scene data (js/data/scene.js) for Nesselnbach:
//  - streets (centre lines) from OpenStreetMap (osm/raw.json): Niederwilerstrasse, Ifangweg, Kapellenweg
//  - buildings from the official cadastral survey + building register (osm/av.json, see scripts/av.mjs):
//    only buildings whose address is on one of the three streets; real outlines, floors, roof colours
//  - driveways, sidewalks and pools near those streets (cadastral survey)
// Units: metres. x = east, z = south. Run: npm run scene
// Data: © OpenStreetMap contributors (ODbL); Amtliche Vermessung Kanton Aargau; GWR (BFS); SWISSIMAGE (swisstopo).
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('osm/raw.json', 'utf8'));
const av = JSON.parse(readFileSync('osm/av.json', 'utf8'));
const [S, Wb, N] = raw.bbox;
const LON_M = 111320 * Math.cos((((S + N) / 2) * Math.PI) / 180);
const ORIGIN = [960, 1200]; // metres from the OSM bbox NW corner: centre of the scene
const fromWgs = (lat, lon) => [(lon - Wb) * LON_M - ORIGIN[0], (N - lat) * 111320 - ORIGIN[1]];
const toL = (p) => fromWgs(p.lat, p.lon).map((v) => +v.toFixed(2));
// LV95 -> WGS84 (swisstopo approximation, < 1 m) -> local
function fromLv95([E, Nn]) {
  const y = (E - 2600000) / 1e6, x = (Nn - 1200000) / 1e6;
  const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
  return fromWgs((p * 100) / 36, (l * 100) / 36).map((v) => +v.toFixed(2));
}
const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry);
const STREET_NAMES = ['Niederwilerstrasse', 'Ifangweg', 'Kapellenweg'];

// ---------------- geometry helpers ----------------
const distSeg = ([px, pz], [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return [Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), [ax + t * dx, az + t * dz]];
};
const area = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); };
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const inPoly = ([x, z], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const openRing = (pts) => (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts);
// minimum-area oriented rectangle (rotating the polygon edges)
function obb(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, z] of pts) { const u = x * c - z * s, v = x * s + z * c; minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
    const ar = (maxU - minU) * (maxV - minV);
    if (!best || ar < best.ar) {
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      const ci = Math.cos(ang), si = Math.sin(ang);
      best = { ar, cx: cu * ci - cv * si, cz: cu * si + cv * ci, w: maxU - minU, d: maxV - minV, angle: ang };
    }
  }
  if (best.d > best.w) { [best.w, best.d] = [best.d, best.w]; best.angle += Math.PI / 2; }
  return best;
}
// world <-> building frame (u along the long side, v across), centred on the OBB
const toFrame = (o, [x, z]) => { const c = Math.cos(o.angle), s = Math.sin(o.angle), dx = x - o.cx, dz = z - o.cz; return [dx * c + dz * s, -dx * s + dz * c]; };
const fromFrame = (o, [u, v]) => { const c = Math.cos(o.angle), s = Math.sin(o.angle); return [o.cx + u * c - v * s, o.cz + u * s + v * c]; };

// Split an outline into a few rectangles (in the building frame) so L/T-shaped houses get proper roofs.
function rectParts(pts, o) {
  const loc = pts.map((p) => toFrame(o, p));
  if (area(pts) / (o.w * o.d) > 0.9) return [{ u: 0, v: 0, w: o.w, d: o.d }];
  const lines = (vals, lo, hi) => {
    const s = [lo, hi, ...vals].sort((a, b) => a - b), out = [];
    for (const v of s) if (!out.length || v - out[out.length - 1] > 1.2) out.push(v); else if (v === hi) out[out.length - 1] = hi;
    return out;
  };
  const us = lines(loc.map((p) => p[0]), -o.w / 2, o.w / 2), vs = lines(loc.map((p) => p[1]), -o.d / 2, o.d / 2);
  const nu = us.length - 1, nv = vs.length - 1;
  const fill = [], used = [];
  for (let j = 0; j < nv; j++) {
    fill.push([]); used.push([]);
    for (let i = 0; i < nu; i++) {
      const cu = (us[i] + us[i + 1]) / 2, cv = (vs[j] + vs[j + 1]) / 2;
      const w = us[i + 1] - us[i], d = vs[j + 1] - vs[j];
      // a cell counts if most of it is inside (sample 3x3)
      let k = 0; for (const a of [-0.3, 0, 0.3]) for (const b of [-0.3, 0, 0.3]) if (inPoly([cu + a * w, cv + b * d], loc)) k++;
      fill[j].push(k >= 5); used[j].push(false);
    }
  }
  const parts = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    if (!fill[j][i] || used[j][i]) continue;
    let i2 = i; while (i2 + 1 < nu && fill[j][i2 + 1] && !used[j][i2 + 1]) i2++;
    let j2 = j; while (j2 + 1 < nv && fill[j2 + 1].slice(i, i2 + 1).every((f, k) => f && !used[j2 + 1][i + k])) j2++;
    for (let jj = j; jj <= j2; jj++) for (let ii = i; ii <= i2; ii++) used[jj][ii] = true;
    const w = us[i2 + 1] - us[i], d = vs[j2 + 1] - vs[j];
    parts.push({ u: (us[i] + us[i2 + 1]) / 2, v: (vs[j] + vs[j2 + 1]) / 2, w, d });
  }
  const good = parts.filter((p) => Math.min(p.w, p.d) >= 1.5).sort((a, b) => b.w * b.d - a.w * a.d).slice(0, 6);
  return good.length ? good : [{ u: 0, v: 0, w: o.w, d: o.d }];
}

// ---------------- streets (OSM centre lines) ----------------
const streets = ways
  .filter((w) => w.tags.highway === 'residential' && STREET_NAMES.includes(w.tags.name))
  .map((w) => ({ name: w.tags.name, width: 5, pts: w.geometry.map(toL) }))
  .filter((s) => s.pts.every(([, z]) => z > -300)); // drop the far-away Niederwilerstrasse near Tägerig
const SOUTH_LIMIT = 260;
for (const s of streets) s.pts = s.pts.filter(([, z]) => z < SOUTH_LIMIT);
function nearestStreet(p) {
  let best = { d: Infinity };
  for (const s of streets) for (let i = 1; i < s.pts.length; i++) {
    const [d, q] = distSeg(p, s.pts[i - 1], s.pts[i]);
    if (d < best.d) best = { d, q, s };
  }
  return best;
}

// ---------------- cadastral surfaces ----------------
const surf = av.surfaces.map((s) => ({ ...s, rings: s.rings.map((r) => openRing(r.map(fromLv95))) }));
// real street width: twice the median distance from the centre line to the road surface edge
const roadEdges = surf.filter((s) => s.art === 'Strasse_Weg').flatMap((s) => s.rings.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]])));
const widthCache = {};
for (const name of STREET_NAMES) {
  const samples = [];
  for (const s of streets.filter((x) => x.name === name)) for (let i = 1; i < s.pts.length; i++) {
    const m = [(s.pts[i - 1][0] + s.pts[i][0]) / 2, (s.pts[i - 1][1] + s.pts[i][1]) / 2];
    let dmin = Infinity; for (const [a, b] of roadEdges) dmin = Math.min(dmin, distSeg(m, a, b)[0]);
    if (dmin < 6) samples.push(dmin);
  }
  samples.sort((a, b) => a - b);
  widthCache[name] = samples.length ? Math.max(3.5, Math.min(7.5, +(samples[Math.floor(samples.length / 2)] * 2).toFixed(1))) : 5;
}
for (const s of streets) s.width = widthCache[s.name];

// ---------------- buildings (only addresses on the three streets) ----------------
const gwr = new Map(av.buildings.map((b) => [b.egid, b]));
// aerial roof colour -> a slightly brighter, more saturated "cozy" version
function cozy(hex) {
  if (!hex) return null;
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  s = Math.min(0.55, s * 1.7 + 0.05); const L = Math.min(0.62, l * 1.15 + 0.06);
  const C = (1 - Math.abs(2 * L - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - C / 2;
  const [r1, g1, b1] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return '#' + [r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
const blds = [];
for (const s of surf.filter((x) => x.art === 'Gebaeude')) {
  const a = gwr.get(s.egid);
  if (!a || !STREET_NAMES.includes(a.street) || a.place !== 'Nesselnbach') continue;
  const pts = s.rings[0];
  const ar = area(pts);
  if (ar < 4) continue;
  const c = centroid(pts);
  const ns = nearestStreet(c);
  const o = obb(pts);
  const parts = rectParts(pts, o);
  const addr = a.street + ' ' + a.nr;
  const isChapel = /Kapelle/.test(a.name || '');
  const out = !a.floors; // outbuildings have no floor count in the register
  const kind = isChapel ? 'chapel' : out ? (ar < 70 ? 'garage' : 'barn') : 'house';
  const levels = a.floors || 1;
  // door: side of the largest part that faces the nearest street
  const main = parts[0];
  const mc = fromFrame(o, [main.u, main.v]);
  const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
  const sides = [
    { n: [-sa, ca], half: main.d / 2 }, { n: [sa, -ca], half: main.d / 2 },
    { n: [ca, sa], half: main.w / 2 }, { n: [-ca, -sa], half: main.w / 2 },
  ].map((sd) => ({ ...sd, mid: [mc[0] + sd.n[0] * sd.half, mc[1] + sd.n[1] * sd.half] }));
  const toStreet = [ns.q[0] - mc[0], ns.q[1] - mc[1]];
  sides.sort((p, q) => (q.n[0] * toStreet[0] + q.n[1] * toStreet[1]) - (p.n[0] * toStreet[0] + p.n[1] * toStreet[1]));
  const door = sides[0];
  blds.push({
    kind, name: a.name || null, addr, egid: a.egid, year: a.year, flats: a.flats || 0,
    cx: +o.cx.toFixed(2), cz: +o.cz.toFixed(2), angle: +o.angle.toFixed(4), w: +o.w.toFixed(2), d: +o.d.toFixed(2),
    parts: parts.map((p) => ({ u: +p.u.toFixed(2), v: +p.v.toFixed(2), w: +p.w.toFixed(2), d: +p.d.toFixed(2) })),
    levels, roof: 'gabled', roofColor: cozy(s.roof),
    outline: pts.map((p) => p.map((v) => +v.toFixed(2))),
    door: door.mid.map((v) => +v.toFixed(2)), doorN: door.n.map((v) => +v.toFixed(3)),
    entry: [+(door.mid[0] + door.n[0] * 1.6).toFixed(2), +(door.mid[1] + door.n[1] * 1.6).toFixed(2)],
    street: a.street, dist: Math.hypot(c[0], c[1]),
  });
}
// landmarks
const nodeL = (re) => { const e = raw.elements.find((x) => x.tags && re.test(x.tags.name || '')); return e ? (e.type === 'node' ? toL(e) : centroid(e.geometry.map(toL))) : null; };
const chapel = blds.find((b) => b.kind === 'chapel');
Object.assign(chapel, { id: 'kapelle', name: 'Heiligkreuz-Kapälle' });
// the village pub: the Vereinslokal "Casino" (Niederwilerstrasse 17.1)
const casino = blds.find((b) => /Casino/.test(b.name || ''));
Object.assign(casino, { id: 'beiz', kind: 'beiz', name: 'Casino (Vereinslokal)' });
// Niederwilerstrasse 3: old farmhouse, one long roof; seen from the street the living part is on the
// left (south, +u) and the barn on the right (north, -u)
const farm = blds.find((b) => b.addr === 'Niederwilerstrasse 3');
if (farm) {
  const live = Math.min(9, farm.w * 0.42);
  Object.assign(farm, {
    id: 'buurehuus', kind: 'farmhouse', name: 'Buurehuus', levels: 2, oneRoof: true,
    parts: [
      { u: +(farm.w / 2 - live / 2).toFixed(2), v: 0, w: +live.toFixed(2), d: farm.d, type: 'house' },
      { u: +(-live / 2).toFixed(2), v: 0, w: +(farm.w - live).toFixed(2), d: farm.d, type: 'barn' },
    ],
  });
  // door of the living part, facing the street
  const ca = Math.cos(farm.angle), sa = Math.sin(farm.angle), hu = farm.parts[0].u;
  const n = farm.doorN, along = Math.abs(n[0] * ca + n[1] * sa) > 0.7;
  if (!along) {
    const half = farm.d / 2;
    farm.door = [farm.cx + hu * ca + n[0] * half, farm.cz + hu * sa + n[1] * half].map((v) => +v.toFixed(2));
    farm.entry = [farm.door[0] + n[0] * 1.6, farm.door[1] + n[1] * 1.6].map((v) => +v.toFixed(2));
  }
}
// homes for the family / villagers: the 12 houses closest to the centre
blds.filter((b) => !b.id && b.kind === 'house').sort((a, b) => a.dist - b.dist).slice(0, 12).forEach((b, i) => { b.id = 'haus' + (i + 1); });
let n = 0;
blds.forEach((b) => { if (!b.id) b.id = (b.kind === 'house' ? 'h' : 'g') + ++n; delete b.dist; });

// driveways, sidewalks, pools close to the three streets / chosen buildings
const nearStuff = (p) => nearestStreet(p).d < 30;
const surfaces = surf
  .filter((s) => ['Trottoir', 'uebrige_befestigte', 'Wasserbecken'].includes(s.art))
  .filter((s) => nearStuff(centroid(s.rings[0])) && area(s.rings[0]) > 2)
  .map((s) => ({ art: s.art === 'Trottoir' ? 'walk' : s.art === 'Wasserbecken' ? 'pool' : 'paved', rings: s.rings }));

// ---------------- bus stops, routes, POIs ----------------
const stops = [
  { name: 'Nesselnbach, Unterdorf', at: nodeL(/^Nesselnbach Unterdorf$/) },
  { name: 'Nesselnbach, Mitteldorf', at: nodeL(/^Nesselnbach Mitteldorf$/) },
].filter((s) => s.at);
// the bus / car route: Niederwilerstrasse from the Landstrasse junction to the south edge
const nw = streets.filter((s) => s.name === 'Niederwilerstrasse');
const route = [];
let cur = nw.find((s) => s.pts[0][0] > 200) || nw[0];
const used = new Set();
while (cur && !used.has(cur)) {
  used.add(cur);
  route.push(...(route.length ? cur.pts.slice(1) : cur.pts));
  const end = route[route.length - 1];
  cur = nw.find((s) => !used.has(s) && Math.hypot(s.pts[0][0] - end[0], s.pts[0][1] - end[1]) < 1);
}
const allPts = streets.flatMap((s) => s.pts);
const bounds = [
  Math.min(...allPts.map((p) => p[0])) - 50, Math.min(...allPts.map((p) => p[1])) - 50,
  Math.max(...allPts.map((p) => p[0])) + 50, Math.max(...allPts.map((p) => p[1])) + 50,
].map((v) => Math.round(v));
// ---------------- water (OSM natural=water near the streets: the Löli-Weiher) ----------------
// The map grows to include a pond that lies within 120 m of the street area.
const water = ways
  .filter((w) => w.tags.natural === 'water' && w.geometry.length >= 4)
  .map((w) => ({ name: w.tags.name || 'Weiher', pts: openRing(w.geometry.map(toL)) }))
  .filter((w) => {
    const xs = w.pts.map((p) => p[0]), zs = w.pts.map((p) => p[1]);
    return Math.max(...xs) > bounds[0] - 120 && Math.min(...xs) < bounds[2] + 120 && Math.max(...zs) > bounds[1] - 120 && Math.min(...zs) < bounds[3] + 120;
  });
for (const w of water) {
  const xs = w.pts.map((p) => p[0]), zs = w.pts.map((p) => p[1]);
  bounds[0] = Math.min(bounds[0], Math.round(Math.min(...xs) - 30)); bounds[1] = Math.min(bounds[1], Math.round(Math.min(...zs) - 30));
  bounds[2] = Math.max(bounds[2], Math.round(Math.max(...xs) + 30)); bounds[3] = Math.max(bounds[3], Math.round(Math.max(...zs) + 30));
}
// ---------------- gravel track to the Löli-Weiher (OSM highway=track "Kapellenweg", grade1) ----------------
// Added after the bounds are final; kept off the pond shore (>= 5 m from the water) and clipped to the map.
const TRACK_IDS = [102806510];
const tracks = ways
  .filter((w) => TRACK_IDS.includes(w.id))
  .map((w) => ({ name: w.tags.name || 'Feldweg', kind: 'track', width: 3, pts: w.geometry.map(toL).filter(([, z]) => z > bounds[1] + 6) }));
for (const t of tracks) for (const p of t.pts) for (const w of water) {
  const c = centroid(w.pts);
  for (let guard = 0; guard < 40; guard++) {
    let d = Infinity;
    for (let i = 0, j = w.pts.length - 1; i < w.pts.length; j = i++) d = Math.min(d, distSeg(p, w.pts[j], w.pts[i])[0]);
    if (inPoly(p, w.pts)) d = -d;
    if (d >= 5) break;
    const l = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1;
    p[0] = +(p[0] + (p[0] - c[0]) / l).toFixed(1); p[1] = +(p[1] + (p[1] - c[1]) / l).toFixed(1);
  }
}
streets.push(...tracks.filter((t) => t.pts.length >= 2));

// ---------------- Milchzentrale (village dairy: milk collection + cheese) ----------------
// Kapellenweg 1: the Gehrigs' Milchzentrale (milk collection + cheese dairy, flats above).
const MILCH_EGID = '559171'; // Kapellenweg 1 (Gehrig)
const milch = blds.find((b) => b.egid === MILCH_EGID);
if (milch) Object.assign(milch, { id: 'milch', kind: 'dairy', name: 'Milchzentrale' });

// ---------------- main road east: "Bremgarterstrasse" (OSM calls this stretch Landstrasse) to the roundabout ----------------
// From the Niederwilerstrasse junction along the Landstrasse to the roundabout (OSM 37379186), the roundabout itself
// and a stub of the Bremgarterstrasse beyond. The map grows to include them. Also the petrol station (OSM amenity=fuel).
let racer = null, fuel = null, kreisel = null;
{
  const wayPts = (id) => { const w = ways.find((x) => x.id === id); return w ? w.geometry.map(toL) : []; };
  const chain = (ids, start) => {
    const pts = []; let cur = start;
    for (const id of ids) {
      let p = wayPts(id); if (!p.length) continue;
      if (Math.hypot(p[p.length - 1][0] - cur[0], p[p.length - 1][1] - cur[1]) < Math.hypot(p[0][0] - cur[0], p[0][1] - cur[1])) p = p.slice().reverse();
      pts.push(...(pts.length ? p.slice(1) : p)); cur = pts[pts.length - 1];
    }
    return pts;
  };
  const mainPts = chain([781771250, 990154109, 11846299], [229, -167]);
  const ring = openRing(wayPts(37379186));
  const bremPts = wayPts(24331930).slice(0, 4);
  if (mainPts.length > 2 && ring.length > 4) {
    const all = mainPts.concat(ring, bremPts);
    bounds[2] = Math.max(bounds[2], Math.round(Math.max(...all.map((p) => p[0])) + 40));
    bounds[3] = Math.max(bounds[3], Math.round(Math.max(...all.map((p) => p[1])) + 40));
    streets.push({ name: 'Bremgarterstrasse', kind: 'main', width: 7.2, pts: mainPts });
    streets.push({ name: 'Kreisel', kind: 'main', width: 6.5, pts: ring.concat([ring[0]]) });
    if (bremPts.length > 1) streets.push({ name: 'Bremgarterstrasse', kind: 'main', width: 7.2, pts: bremPts });
    kreisel = centroid(ring).map((v) => +v.toFixed(1));
    // the racer's route: main road, round the roundabout (OSM ring order = direction of travel), out on the Bremgarterstrasse
    const nearest = (pts, p) => pts.reduce((bi, q, i) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(pts[bi][0] - p[0], pts[bi][1] - p[1]) ? i : bi), 0);
    const end = mainPts[mainPts.length - 1], i0 = nearest(ring, end), i1 = bremPts.length ? nearest(ring, bremPts[0]) : (i0 + ring.length - 1) % ring.length;
    const arc = [];
    for (let i = i0, k = 0; k <= ring.length; i = (i + 1) % ring.length, k++) { arc.push(ring[i]); if (i === i1 && k > 0) break; }
    racer = mainPts.concat(arc, bremPts.slice(1));
    // petrol station beside the road: 13 m off the centre line on its real side, facing the road
    const fuelNode = raw.elements.find((e) => e.type === 'node' && e.tags && e.tags.amenity === 'fuel');
    if (fuelNode) {
      const p = fromWgs(fuelNode.lat, fuelNode.lon);
      let best = { d: Infinity };
      for (let i = 1; i < mainPts.length; i++) { const [d, q] = distSeg(p, mainPts[i - 1], mainPts[i]); if (d < best.d) best = { d, q, a: mainPts[i - 1], b: mainPts[i] }; }
      const dx = best.b[0] - best.a[0], dz = best.b[1] - best.a[1], l = Math.hypot(dx, dz) || 1;
      const side = (p[0] - best.q[0]) * (-dz / l) + (p[1] - best.q[1]) * (dx / l) >= 0 ? 1 : -1;
      const nx = (-dz / l) * side, nz = (dx / l) * side;
      fuel = { name: fuelNode.tags.name || 'Tankstelle', x: +(best.q[0] + nx * 13).toFixed(1), z: +(best.q[1] + nz * 13).toFixed(1), heading: +Math.atan2(dx / l, dz / l).toFixed(3), road: [+best.q[0].toFixed(1), +best.q[1].toFixed(1)], n: [+nx.toFixed(3), +nz.toFixed(3)] };
    }
  }
}

// ---------------- Ifangweg 15 (Iris): hipped roof wings, light walls, brown tiles (from the aerial photo) ----------------
const iris = blds.find((b) => b.egid === '559217');
if (iris) Object.assign(iris, { roof: 'hipped', roofColor: '#8f6e5a', wallColor: '#ece8df', garden: true });

// ---------------- fields (OSM landuse: farmland / meadow / orchard around the village) ----------------
// Kept when they overlap the painted ground (bounds + margin). Crop kinds rotate per field (grain, meadow, root
// crops) so the landscape has variety; `angle` is the long axis of the field (furrow / tractor direction).
const FIELD_MARGIN = 240, CROPS = ['grain', 'meadow', 'root', 'grain', 'meadow', 'grain'];
const overlaps = (pts, m) => {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return Math.max(...xs) > bounds[0] - m && Math.min(...xs) < bounds[2] + m && Math.max(...zs) > bounds[1] - m && Math.min(...zs) < bounds[3] + m;
};
const fields = ways
  .filter((w) => ['farmland', 'meadow', 'orchard'].includes(w.tags.landuse))
  .map((w) => ({ landuse: w.tags.landuse, pts: openRing(w.geometry.map(toL)) }))
  .filter((f) => f.pts.length >= 3 && area(f.pts) > 2000 && overlaps(f.pts, FIELD_MARGIN))
  .sort((a, b) => area(b.pts) - area(a.pts))
  .map((f, i) => {
    const o = obb(f.pts);
    return { kind: f.landuse === 'meadow' ? 'meadow' : CROPS[i % CROPS.length], landuse: f.landuse, area: Math.round(area(f.pts)), angle: +o.angle.toFixed(3), pts: f.pts };
  });
// POI rect for a field: its bounding box clipped to the map, shrunk a little
const fieldRect = (f) => {
  const xs = f.pts.map((p) => p[0]), zs = f.pts.map((p) => p[1]);
  const r = [Math.max(Math.min(...xs), bounds[0] + 20), Math.max(Math.min(...zs), bounds[1] + 20), Math.min(Math.max(...xs), bounds[2] - 20), Math.min(Math.max(...zs), bounds[3] - 20)];
  return r[2] - r[0] > 20 && r[3] - r[1] > 20 ? r.map((v) => +v.toFixed(1)) : null;
};
const inMap = fields.filter((f) => overlaps(f.pts, -30) && fieldRect(f));
const feld = inMap.find((f) => f.kind !== 'meadow') || inMap[0], weide = inMap.find((f) => f.kind === 'meadow') || feld;
const around = (p, r) => [p[0] - r, p[1] - r, p[0] + r, p[1] + r].map((v) => +v.toFixed(1));
const midOf = (name) => { const s = streets.filter((x) => x.name === name).sort((a, b) => b.pts.length - a.pts.length)[0]; return s.pts[Math.floor(s.pts.length / 2)]; };
const mittel = stops.find((s) => /Mitteldorf/.test(s.name));
const pois = {
  kapelle: around(chapel.entry, 4),
  beiz: around(casino.entry, 4),
  hof: farm ? around(farm.entry, 9) : around(casino.entry, 9),
  bushalt: around(mittel ? mittel.at : midOf('Niederwilerstrasse'), 4),
  dorfplatz: around(mittel ? mittel.at : midOf('Niederwilerstrasse'), 8),
  unterdorf: around(stops[0] ? stops[0].at : route[2], 5),
  ifangweg: around(midOf('Ifangweg'), 10),
  kapellenweg: around(midOf('Kapellenweg'), 10),
  niederwilerstrasse: around(midOf('Niederwilerstrasse'), 10),
  quartier: [bounds[0] + 40, bounds[1] + 40, bounds[2] - 40, bounds[3] - 40],
};
if (feld) pois.feld = fieldRect(feld);
if (weide) pois.weide = fieldRect(weide);
if (milch) pois.milchzentrale = around(milch.entry, 6);
if (fuel) pois.tankstelle = around([fuel.x, fuel.z], 7);
if (kreisel) pois.kreisel = around(kreisel, 14);
for (const w of water) { // the pond with its shore, and the fishing spot on the shore nearest the village
  const xs = w.pts.map((p) => p[0]), zs = w.pts.map((p) => p[1]);
  pois.weiher = [Math.min(...xs) - 8, Math.min(...zs) - 8, Math.max(...xs) + 8, Math.max(...zs) + 8].map((v) => +v.toFixed(1));
  const c = centroid(w.pts), p = w.pts.slice().sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))[0];
  const d = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1;
  w.fishing = [+(p[0] + ((p[0] - c[0]) / d) * 4).toFixed(1), +(p[1] + ((p[1] - c[1]) / d) * 4).toFixed(1)];
  w.centre = c.map((v) => +v.toFixed(1));
  pois.fischerplatz = around(w.fishing, 3);
}
const labels = STREET_NAMES.map((name) => ({ text: name, at: midOf(name) }));
if (racer) labels.push({ text: 'Bremgarterstrasse', at: racer[Math.floor(racer.length / 3)] });

const scene = {
  source: 'OpenStreetMap contributors (ODbL); Amtliche Vermessung Kanton Aargau; GWR (BFS); SWISSIMAGE (swisstopo)',
  origin: ORIGIN, bounds, streets, buildings: blds, surfaces, fields, water, stops, route, racer, fuel, kreisel, pois, labels, start: mittel ? mittel.at : [0, 0],
};
writeFileSync('js/data/scene.js', '// Generated by scripts/build-scene.mjs (OpenStreetMap, Amtliche Vermessung AG, GWR, SWISSIMAGE). Do not edit by hand.\n' +
  'window.NB = window.NB || {};\nNB.Scene = ' + JSON.stringify(scene) + ';\n');
const k = {}; blds.forEach((b) => { k[b.kind] = (k[b.kind] || 0) + 1; });
console.log(`streets ${streets.length} (widths ${JSON.stringify(widthCache)}), buildings ${blds.length} ${JSON.stringify(k)}, multi-part ${blds.filter((b) => b.parts.length > 1).length}, surfaces ${surfaces.length}, fields ${fields.length} (${fields.map((f) => f.kind).join('/')}), water ${water.map((w) => w.name).join('/')}, tracks ${tracks.length}, dairy ${milch ? milch.addr : 'none'}, route pts ${route.length}`);
