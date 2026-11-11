// Downloads OpenStreetMap data (roads, buildings, water, landuse, POIs) for a bounding box
// and stores it in osm/raw.json. Run: node scripts/osm.mjs south west north east
// Data © OpenStreetMap contributors, ODbL.
import { writeFileSync, mkdirSync } from 'node:fs';

const [s, w, n, e] = process.argv.slice(2).map(Number);
if ([s, w, n, e].some(Number.isNaN)) { console.error('usage: node scripts/osm.mjs south west north east'); process.exit(1); }
const bbox = `${s},${w},${n},${e}`;
const query = `[out:json][timeout:120];
(
  way[highway](${bbox});
  way[building](${bbox});
  way[waterway](${bbox});
  way[natural~"water|wood"](${bbox});
  relation[natural=water](${bbox});
  way[landuse](${bbox});
  way[leisure](${bbox});
  node[amenity](${bbox});
  node[place](${bbox});
  way[amenity](${bbox});
  way[historic](${bbox});
  node[highway=bus_stop](${bbox});
);
out geom tags;`;

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
for (const url of MIRRORS) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 90000);
    const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), signal: ctl.signal, headers: { 'User-Agent': 'pixel-village-map/1.0' } });
    clearTimeout(t);
    const text = await r.text();
    const json = JSON.parse(text);
    mkdirSync('osm', { recursive: true });
    writeFileSync('osm/raw.json', JSON.stringify({ bbox: [s, w, n, e], elements: json.elements }));
    console.log(`${url}: ${json.elements.length} elements -> osm/raw.json`);
    process.exit(0);
  } catch (err) {
    console.warn('failed', url, String(err.message).slice(0, 80));
  }
}
process.exit(1);
