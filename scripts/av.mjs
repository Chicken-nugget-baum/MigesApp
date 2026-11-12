// Downloads official Swiss open data for Nesselnbach into osm/av.json (used by build-scene.mjs):
//  - building footprints, roads, sidewalks, driveways, pools from the cadastral survey
//    (Amtliche Vermessung, Kanton Aargau, WFS via geodienste.ch, layer LCSF = Bodenbedeckung)
//  - building attributes from the federal building register (GWR, BFS, via api3.geo.admin.ch):
//    address, floors, category, construction year
//  - roof colours sampled from the SWISSIMAGE aerial photo (swisstopo WMS)
// Coordinates stay in LV95 (EPSG:2056, metres). Run: npm run av
import { writeFileSync, mkdirSync } from 'node:fs';
import jpeg from 'jpeg-js';

const BBOX = [2663900, 1248650, 2664750, 1249400]; // E0, N0, E1, N1
const KEEP = new Set(['Gebaeude', 'Strasse_Weg', 'Trottoir', 'uebrige_befestigte', 'Wasserbecken', 'Gartenanlage']);

async function get(url, type) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return type === 'buf' ? Buffer.from(await r.arrayBuffer()) : r.json();
    } catch (e) { if (i === 2) throw e; console.warn('retry', e.message); }
  }
}
const r2 = (v) => Math.round(v * 100) / 100;

// 1) cadastral land cover
console.log('cadastral survey (LCSF)…');
const lcsf = await get('https://geodienste.ch/db/av_0/deu?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:LCSF'
  + `&BBOX=${BBOX.join(',')},urn:ogc:def:crs:EPSG::2056&OUTPUTFORMAT=geojson&SRSNAME=urn:ogc:def:crs:EPSG::2056`);
const surfaces = lcsf.features.filter((f) => KEEP.has(f.properties.Art)).map((f) => ({
  art: f.properties.Art, egid: f.properties.GWR_EGID || null,
  rings: f.geometry.coordinates.map((ring) => ring.map(([e, n]) => [r2(e), r2(n)])),
}));
console.log(' ', surfaces.length, 'surfaces');

// 2) building register, paged (50 per page)
console.log('building register (GWR)…');
const gwr = new Map();
for (let off = 0; ; off += 50) {
  const j = await get('https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryEnvelope'
    + `&geometry=${BBOX.join(',')}&imageDisplay=1000,1000,96&mapExtent=${BBOX.join(',')}&tolerance=0`
    + `&layers=all:ch.bfs.gebaeude_wohnungs_register&returnGeometry=false&sr=2056&limit=50&offset=${off}`);
  const res = j.results || [];
  for (const { attributes: a } of res) {
    gwr.set(a.egid, {
      egid: a.egid, street: (a.strname && a.strname[0]) || null, nr: a.deinr || null, place: a.dplzname || null,
      name: a.gbez || null, floors: a.gastw, cat: a.gkat, cls: a.gklas, year: a.gbauj || null, period: a.gbaup || null,
      flats: a.ganzwhg, area: a.garea, at: [r2(a.gkode), r2(a.gkodn)],
    });
  }
  if (res.length < 50) break;
}
console.log(' ', gwr.size, 'buildings');

// 3) roof colours from the aerial photo (0.5 m / px)
console.log('aerial photo (SWISSIMAGE)…');
const RES = 0.5, W = Math.round((BBOX[2] - BBOX[0]) / RES), H = Math.round((BBOX[3] - BBOX[1]) / RES);
const img = jpeg.decode(await get('https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage'
  + `&STYLES=&CRS=EPSG:2056&BBOX=${BBOX.join(',')}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/jpeg`, 'buf'), { useTArray: true });
function inRing(e, n, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > n) !== (yj > n) && e < ((xj - xi) * (n - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function roofColour(ring) {
  const es = ring.map((p) => p[0]), ns = ring.map((p) => p[1]);
  const px = [];
  for (let e = Math.min(...es); e <= Math.max(...es); e += RES) for (let n = Math.min(...ns); n <= Math.max(...ns); n += RES) {
    if (!inRing(e, n, ring)) continue;
    const x = Math.floor((e - BBOX[0]) / RES), y = Math.floor((BBOX[3] - n) / RES);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const k = (y * img.width + x) * 4;
    const rgb = [img.data[k], img.data[k + 1], img.data[k + 2]];
    const lum = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11;
    if (lum > 35) px.push([lum, rgb]); // skip deep shadow
  }
  if (!px.length) return null;
  px.sort((a, b) => a[0] - b[0]);
  const mid = px.slice(Math.floor(px.length * 0.3), Math.ceil(px.length * 0.8)); // drop shadows + highlights
  const avg = [0, 1, 2].map((i) => Math.round(mid.reduce((s, p) => s + p[1][i], 0) / mid.length));
  return '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('');
}
for (const s of surfaces) if (s.art === 'Gebaeude') s.roof = roofColour(s.rings[0]);

mkdirSync('osm', { recursive: true });
writeFileSync('osm/av.json', JSON.stringify({
  source: 'Amtliche Vermessung Kanton Aargau (geodienste.ch), GWR (BFS), SWISSIMAGE (swisstopo)',
  crs: 'EPSG:2056', bbox: BBOX, surfaces, buildings: [...gwr.values()],
}));
console.log('osm/av.json written');
