// Builds the 3D scene data (js/data/scene.js) from OpenStreetMap data (osm/raw.json).
// Only Niederwilerstrasse, Ifangweg and Kapellenweg (to the Heiligkreuz-Kapelle) in Nesselnbach,
// plus the real buildings along them. Units: metres. x = east, z = south. Run: npm run scene
// Map data © OpenStreetMap contributors (ODbL).
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('osm/raw.json', 'utf8'));
const [S, Wb, N] = raw.bbox;
const LON_M = 111320 * Math.cos((((S + N) / 2) * Math.PI) / 180);
const ORIGIN = [960, 1200]; // metres from bbox NW corner: centre of the scene
const toL = (p) => [+((p.lon - Wb) * LON_M - ORIGIN[0]).toFixed(2), +((N - p.lat) * 111320 - ORIGIN[1]).toFixed(2)];
const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry);

// ---------------- streets ----------------
const WIDTH = { Niederwilerstrasse: 6, Ifangweg: 4.5, Kapellenweg: 4 };
const streets = ways
  .filter((w) => w.tags.highway === 'residential' && WIDTH[w.tags.name])
  .map((w) => ({ name: w.tags.name, width: WIDTH[w.tags.name], pts: w.geometry.map(toL) }))
  .filter((s) => s.pts.every(([, z]) => z > -300)); // drop the far-away Niederwilerstrasse near Tägerig

// clip Niederwilerstrasse south of Wolff's Stübli
const SOUTH_LIMIT = 260;
for (const s of streets) s.pts = s.pts.filter(([, z]) => z < SOUTH_LIMIT);

// ---------------- geometry helpers ----------------
const distSeg = ([px, pz], [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return [Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), [ax + t * dx, az + t * dz]];
};
function nearestStreet(p) {
  let best = { d: Infinity };
  for (const s of streets) for (let i = 1; i < s.pts.length; i++) {
    const [d, q] = distSeg(p, s.pts[i - 1], s.pts[i]);
    if (d < best.d) best = { d, q, s };
  }
  return best;
}
const area = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); };
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
// minimum-area oriented rectangle (rotating the polygon edges)
function obb(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
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
  // long side = w
  if (best.d > best.w) { [best.w, best.d] = [best.d, best.w]; best.angle += Math.PI / 2; }
  return best;
}

// ---------------- buildings along the streets ----------------
const SMALL = /garage|garages|shed|carport|roof|hut/;
const blds = [];
for (const w of ways) {
  const t = w.tags;
  if (!t.building) continue;
  const pts = w.geometry.map(toL);
  if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const c = centroid(pts);
  const ns = nearestStreet(c);
  if (ns.d > 42) continue;
  const a = area(pts);
  if (a < 18) continue;
  const o = obb(pts);
  const small = SMALL.test(t.building);
  const levels = +t['building:levels'] || (small ? 1 : a > 450 ? 3 : 2);
  // door on the box side that faces the nearest street
  const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
  const sides = [
    { n: [-sa, ca], half: o.d / 2 }, { n: [sa, -ca], half: o.d / 2 },
    { n: [ca, sa], half: o.w / 2 }, { n: [-ca, -sa], half: o.w / 2 },
  ].map((sd) => ({ ...sd, mid: [o.cx + sd.n[0] * sd.half, o.cz + sd.n[1] * sd.half] }));
  const toStreet = [ns.q[0] - o.cx, ns.q[1] - o.cz];
  sides.sort((p, q) => (q.n[0] * toStreet[0] + q.n[1] * toStreet[1]) - (p.n[0] * toStreet[0] + p.n[1] * toStreet[1]));
  const door = sides[0];
  blds.push({
    kind: small ? 'garage' : t.building === 'chapel' ? 'chapel' : 'house', name: t.name || null,
    cx: +o.cx.toFixed(2), cz: +o.cz.toFixed(2), w: +o.w.toFixed(2), d: +o.d.toFixed(2), angle: +o.angle.toFixed(4),
    levels, roof: t['roof:shape'] || (a > 600 ? 'hipped' : 'gabled'),
    door: door.mid.map((v) => +v.toFixed(2)), doorN: door.n.map((v) => +v.toFixed(3)),
    entry: [+(door.mid[0] + door.n[0] * 1.6).toFixed(2), +(door.mid[1] + door.n[1] * 1.6).toFixed(2)],
    street: ns.s.name, dist: Math.hypot(c[0], c[1]),
  });
}
// landmarks
const nodeL = (re) => { const e = raw.elements.find((x) => x.tags && re.test(x.tags.name || '')); return e ? (e.type === 'node' ? toL(e) : centroid(e.geometry.map(toL))) : null; };
const closest = (p) => blds.reduce((b, x) => (Math.hypot(x.cx - p[0], x.cz - p[1]) < Math.hypot(b.cx - p[0], b.cz - p[1]) ? x : b));
const chapel = blds.find((b) => b.kind === 'chapel') || closest(nodeL(/^Heiligkreuz Kapelle$/));
Object.assign(chapel, { id: 'kapelle', kind: 'chapel', name: 'Heiligkreuz-Kapälle' });
const wolff = closest(nodeL(/^Wolff's Stübli$/));
Object.assign(wolff, { id: 'beiz', kind: 'beiz', name: 'Wolff\'s Stübli' });
// homes for the family / villagers: the 12 houses closest to the centre
blds.filter((b) => !b.id && b.kind === 'house').sort((a, b) => a.dist - b.dist).slice(0, 12).forEach((b, i) => { b.id = 'haus' + (i + 1); });
let n = 0;
blds.forEach((b) => { if (!b.id) b.id = (b.kind === 'garage' ? 'g' : 'h') + ++n; delete b.dist; });

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
const around = (p, r) => [p[0] - r, p[1] - r, p[0] + r, p[1] + r].map((v) => +v.toFixed(1));
const midOf = (name) => { const s = streets.filter((x) => x.name === name).sort((a, b) => b.pts.length - a.pts.length)[0]; return s.pts[Math.floor(s.pts.length / 2)]; };
const mittel = stops.find((s) => /Mitteldorf/.test(s.name));
const pois = {
  kapelle: around(chapel.entry, 4),
  beiz: around(wolff.entry, 4),
  bushalt: around(mittel ? mittel.at : midOf('Niederwilerstrasse'), 4),
  dorfplatz: around(mittel ? mittel.at : midOf('Niederwilerstrasse'), 8),
  unterdorf: around(stops[0] ? stops[0].at : route[2], 5),
  ifangweg: around(midOf('Ifangweg'), 10),
  kapellenweg: around(midOf('Kapellenweg'), 10),
  niederwilerstrasse: around(midOf('Niederwilerstrasse'), 10),
  quartier: [bounds[0] + 40, bounds[1] + 40, bounds[2] - 40, bounds[3] - 40],
};
const labels = ['Niederwilerstrasse', 'Ifangweg', 'Kapellenweg'].map((name) => ({ text: name, at: midOf(name) }));

const scene = {
  source: 'OpenStreetMap contributors (ODbL)', origin: ORIGIN, bounds,
  streets, buildings: blds, stops, route, pois, labels, start: mittel ? mittel.at : [0, 0],
};
writeFileSync('js/data/scene.js', '// Generated by scripts/build-scene.mjs from OpenStreetMap data (© OpenStreetMap contributors, ODbL). Do not edit by hand.\n' +
  'window.NB = window.NB || {};\nNB.Scene = ' + JSON.stringify(scene) + ';\n');
console.log(`streets ${streets.length}, buildings ${blds.length}, route pts ${route.length}, bounds ${bounds}`);
