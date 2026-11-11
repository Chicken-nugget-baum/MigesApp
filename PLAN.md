# Nesselnbach – interactive low-poly 3D village

Handoff notes so work can continue on another computer. Status as of 2026-11-11 (night): switched to low-poly 3D (three.js), only the three streets.

## Idea
A living low-poly 3D version of **Nesselnbach** (Ortsteil of Niederwil AG, Reusstal, Freiamt).
**The village itself is the main character** – there is no player. Inspiration: https://maegwilli.duckdns.org/ (needs a login, wasn't viewable).

- Villagers walk around **on their own** (daily routines, favourite places, go home at night).
- Users **click** on things and they react; **every character reacts differently** (speech bubble, animation, own "voice" babble sound). Repeated clicks escalate ("Jetz längts aber!").
- **Cats** wander around; click → **"Miau"**, hold → **purr** with hearts. Sleeping cats wake up ("Mrrr?").
- More life: the **Postauto** on the Niederwilerstrasse (horn "Tü-ta-to", stops Unterdorf + Mitteldorf), cars, chapel bells every full hour. (Cows, chickens, ducks and the Gartebahn existed in the 2D version and were dropped with the 3D switch.)
- Day/night follows real Swiss time (Europe/Zurich), windows + street lamps light up; weather (clear/cloudy/rain/fog/snow) and seasons by month.

## Decisions (from the user)
1. Art: everything is modelled in code (`js/models.js`, simple three.js shapes), no asset files.
2. Map: **only Niederwilerstrasse, Ifangweg and Kapellenweg to the Heiligkreuz-Kapelle** (2026-11-11), with the real houses along them (OpenStreetMap). Clean, smooth streets.
3. Villagers: **recognisable Nesselnbachers, family first** (they already know about it). Characters are defined as data.
4. Language: **Swiss German, Aargauer dialect** for all texts.
5. Art style: **real 3D, low-poly** (2026-11-11, replaced the pixel art): blocky houses with gabled/hipped roofs, shutters + flower boxes, round chibi villagers, soft shadows, pastel colours, tilted camera that pans/rotates/zooms (MapControls). Font: Nunito.
6. **Luna** = the family cat (white calico from a photo: black/orange patches on head and back, banded tail, white chest/paws, yellow-green eyes). Click → **zoomies** (sprints in zig-zags, hops, dust puffs for ~6 s), hold → purr. Data flag `zoomies: true`, model pattern `luna`.

## Tech
- Plain JavaScript, **no bundler for game code**, classic `<script>` tags (works from `file://` and on GitHub Pages). Global namespace `window.NB`.
- three.js WebGL scene (`canvas#gl`) + a 2D overlay canvas (`canvas#ui`) for speech bubbles, name tags, street labels, hearts/notes.
- Units are metres; x = east, z = south; models face +z.
- **npm libraries, vendored**: `npm install` runs `scripts/vendor.mjs` (postinstall), which builds browser files into `vendor/` (committed, so Pages works without node_modules):
  - `three` + MapControls – bundled by `esbuild` (devDependency) into `vendor/three.js` (`window.THREE`)
  - `zzfx` – synthesized sound effects (no audio files); ES module turned into `window.zzfx`/`window.ZZFX`
  - `@fontsource/nunito` – the UI font (woff2)
- Node scripts: `npm run check` (syntax check), `npm start` (static server on :8080), `npm run shot -- <outDir> "time=22:00&weather=rain" ...` (headless Chrome/Edge screenshots via SwiftShader; env `BUDGET=ms` sets the virtual time).
- Test URL params: `?time=22:00`, `?speed=60`, `?season=winter`, `?weather=clear|cloudy|rain|fog|snow`, `?at=-180,84` (camera target in metres), `?dist=120` (camera distance), `?nointro=1`.
- Performance: static meshes are merged per material (`bake()` in `js/main.js`), so each house is only a few draw calls.

## Real map pipeline (OpenStreetMap → 3D scene)
- `npm run osm` → `scripts/osm.mjs` downloads roads, buildings, water, landuse, POIs for bbox 47.371,8.278 – 47.399,8.312 via Overpass into `osm/raw.json` (committed so the scene can be rebuilt offline).
- `npm run scene` → `scripts/build-scene.mjs` keeps only Niederwilerstrasse (6 m), Ifangweg (4.5 m), Kapellenweg (4 m) and the buildings within 42 m of them, and writes `js/data/scene.js`: street polylines, buildings as oriented boxes (centre, size, angle, levels, roof shape, door facing the street), bus stops, Postauto route, POIs, labels. Origin [960, 1200] m from the bbox NW corner. Don't edit `scene.js` by hand – change the generator and rerun.
- Real geography: Niederwilerstrasse from the Landstrasse junction past Unterdorf and Mitteldorf to Wolff's Stübli (= the Beiz, id `beiz`); Ifangweg loop; Kapellenweg west to the **Heiligkreuz-Kapelle** (id `kapelle`, bell tower).
- The 12 houses nearest the centre become `haus1`–`haus12` (family/villager homes), the rest `h#` / `g#` (garages).
- Invented: the Dorfplatz next to the Mitteldorf stop. Old 2D POI names (reuss, wald, gartebahn, niederwil, …) still work as aliases (`js/world.js`).
- Map data © OpenStreetMap contributors (ODbL) – credited on the intro screen.

## Files
| File | Status | Content |
|---|---|---|
| `js/util.js` | done | helpers, seeded RNG, Zurich clock (`?time`, `?speed`), season |
| `js/path.js` | done | A* pathfinding (`NB.findPath`) on the 2 m walk grid |
| `js/data/scene.js` | generated | streets, buildings, stops, route, POIs from OpenStreetMap (see pipeline) |
| `js/world.js` | done | `NB.map`: walk/animal cost grids, street distance, building specs (`inside`, lines, sounds, entry points), POIs + aliases, bus route |
| `js/models.js` | done | low-poly models: houses (gabled/hipped roofs, windows that glow at night, shutters, flower boxes, door on the street side, snowy roofs in winter), chapel with bell tower, Beiz sign, seasonal trees, bushes, lamps, bus shelter, tables, chibi villagers, cats (incl. Luna), Postauto, cars |
| `js/audio.js` | done | ZzFX sounds: meow, babble voices per character, bell, Postauto horn (C#–E–A), ambience (birds/crickets/rain); **purr is custom-synthesized** (filtered noise pulsed ~25 Hz with a breathing cycle, seamless loop); unlock on first click |
| `js/env.js` | done | daylight/darkness by season, sun progress, weather state machine, which windows are lit, hourly bells |
| `js/entities.js` | done | Villager (routine, home at night, click reactions, walk/wave animation), Cat (idle/sit/sleep, meow, hold = purr, Luna zoomies), Vehicle (Postauto + cars on the real route, keep right, stop at stops) |
| `js/ui.js` | done | 2D overlay: speech bubbles, hover name tag, street labels, hearts/notes/dust; HUD (clock, zoom, centre, mute), intro "Iitrete" |
| `js/data/characters.js` | **placeholders** | family + villagers as data (see format below) |
| `js/data/animals.js` | done | cats: Mimi, Tiger, Schnurrli, Luna, Fleckli, Minka |
| `js/main.js` | done | three.js renderer: ground, smooth street ribbons with sidewalks, houses, trees, lamps with ground glow, light + sky + fog by time/weather, rain/snow particles, MapControls camera, raycast click/hover/long-press, game loop |
| `index.html`, `css/style.css` | done | page shell, two canvases, HUD pills, intro card |

Script order: three, zzfx, util, path, data/scene, world, models, audio, env, entities, ui, data/characters, data/animals, main.

## Character data format
```js
{
  id: 'grosi', name: 'Grosi', home: 'haus1',
  look: { skin: '#f1c7a0', hair: '#d8d8d8', hairStyle: 'bun', shirt: '#7a4aa0', dress: '#7a4aa0', glasses: true, apron: '#ffffff' },
  // hairStyle: short | long | bun | ponytail | spiky | bald | cap | straw | headscarf; extras: glasses, beard, dress, apron, cap, scarf
  voice: 1.4,                       // babble pitch
  favorites: ['dorfplatz', 'kapelle'],
  routine: [{ at: '08:00', go: 'dorfplatz' }, { at: '12:00', go: 'home:haus1' }],
  sleep: ['21:30', '06:30'],
  clicks: ['Grüezi wohl! Wotsch es Guetzli?', 'Ou, du bisch aber gwachse!', 'Jetz lass mi aber!'], // escalating
  random: ['Hesch scho z\'Mittag gässe?'],
  night: ['Gang is Bett, es isch spoot!'],
}
```
POIs: `dorfplatz, bushalt, unterdorf, kapelle, beiz, ifangweg, kapellenweg, niederwilerstrasse, quartier, home:<houseId>` (or a rect `[x0, z0, x1, z1]` in metres). Homes: `haus1`–`haus12`, `beiz`, plus other building ids in `scene.js`.

## Next steps
1. ~~2D pixel version~~ → replaced by low-poly 3D (screenshots checked: day, night, rain, winter snow, overview).
2. Test in a real browser: clicking people, cats (long-press purr, Luna zoomies), houses, chapel bell, Postauto; tune sounds by ear.
3. Fill in the real family members in `js/data/characters.js` (currently placeholder roles: Grosi, Grospi, Mami, Papi, Gotti, Götti + villagers).
4. Publish: GitHub Pages needs a **public** repo (or a paid plan for private Pages).

## Setup on a new computer
- `git clone https://github.com/Chicken-nugget-baum/MigesApp.git`
- Node.js LTS (`winget install OpenJS.NodeJS.LTS --scope user`), then `npm install` (also refreshes `vendor/`).
- To view: open `index.html` directly, or `npm start` and go to http://localhost:8080/
