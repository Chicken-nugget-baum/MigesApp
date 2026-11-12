# Nesselnbach – interactive isometric pixel-art village

Handoff notes so work can continue on another computer. Status as of 2026-11-12: **isometric pixel art on PixiJS** (Joel), with official Swiss building data, the Buurehuus, Mina, Luna and Mige ported onto it.

## Idea
A living isometric pixel-art version of **Nesselnbach** (Ortsteil of Niederwil AG, Reusstal, Freiamt).
**The village itself is the main character** – there is no player. Inspiration: https://maegwilli.duckdns.org/ (needs a login, wasn't viewable).

- Villagers walk around **on their own** (daily routines, favourite places, go home at night).
- Users **click** on things and they react; **every character reacts differently** (speech bubble, animation, own "voice" babble sound). Repeated clicks escalate ("Jetz längts aber!").
- **Cats** wander around; click → **"Miau"**, hold → **purr** with hearts. Sleeping cats wake up ("Mrrr?").
- More life: the **Postauto** on the Niederwilerstrasse (horn "Tü-ta-to", stops Unterdorf + Mitteldorf), cars, chapel bells every full hour. (Cows, chickens, ducks and the Gartebahn existed in the 2D version and were dropped with the 3D switch.)
- Day/night follows real Swiss time (Europe/Zurich), windows + street lamps light up; weather (clear/cloudy/rain/fog/snow) and seasons by month.

## Decisions (from the user)
1. Art: everything is drawn in code (`js/models.js`), no asset files. Buildings/vehicles/lamps are box models rasterized by `js/iso.js` into pixel sprites; people, cats, trees are hand-drawn pixel sprites.
2. Map: **only Niederwilerstrasse, Ifangweg and Kapellenweg to the Heiligkreuz-Kapelle** (2026-11-11), with the real houses along them (OpenStreetMap). Clean, smooth streets.
3. Villagers: **recognisable Nesselnbachers, family first** (they already know about it). Characters are defined as data.
4. Language: **Swiss German, Aargauer dialect** for all texts.
5. Art style: **isometric pixel art** (2026-11-12, replaced the low-poly 3D, which had replaced the top-down pixel art): 2:1 iso, 16 px per metre, crisp pixels with dark outlines, flat-shaded iso faces (top light, left mid, right dark), baked drop shadows, pastel colours. Houses have gabled/hipped roofs, shutters + flower boxes, doors on a visible face; chapel with tower + spire. Camera pans (drag) and zooms in integer steps 1-4x (wheel/pinch/buttons); no rotation. Font: Nunito for the UI.
6. **Luna** = the family cat (white calico from a photo: black/orange patches on head and back, banded tail, white chest/paws, yellow-green eyes). Click → **zoomies** (sprints in zig-zags, hops, dust puffs for ~6 s), hold → purr. Data flag `zoomies: true`, model pattern `luna`.

## Tech
- Plain JavaScript, **no bundler for game code**, classic `<script>` tags (works from `file://` and on GitHub Pages). Global namespace `window.NB`.
- PixiJS v8 WebGL stage (`canvas#gl`, nearest-neighbour textures, `image-rendering: pixelated`) + a 2D overlay canvas (`canvas#ui`) for speech bubbles, name tags, street labels, hearts/notes.
- Units are metres; x = east, z = south, y = up; vehicles face +z. `NB.Iso.project(x, y, z)` -> world pixels (2:1 iso, viewer at +x +z, `NB.Iso.YAW` rotates the whole map); `NB.project` -> screen pixels (camera applied).
- **Depth sorting**: buildings are topologically sorted once (axis-aligned boxes in the iso frame, slots of 2000 zIndex each); everything else gets `NB.world.zkey(x, z)` = slot of the first building that hides the point (exact line-of-sight test against the building box) + depth within the slot.
- **Ground** is painted lazily: a top-down terrain-code map (2 cells/m: grass, sidewalk, asphalt, plaza) is rasterized once with canvas strokes of the street polylines; screen-aligned 256 px chunks are generated per pixel (hash speckles, curb lines, cobbles) when they scroll into view and cached.
- **Buildings are snapped** to the iso grid; their blocks (`parts`) turn with them and are stored in the iso frame, the door goes on the outside wall in line with the main block (`doorUV`) (`NB.Iso.snapBuilding` in `js/world.js`): rotated by at most 45 deg about their centre, the door moved to the visible face (+u or +v) nearest the real street side, entry point recomputed. Pathfinding uses the snapped boxes.
- Day/night = full-screen multiply tint (dusk orange -> night blue) + a `lights` layer above it (lit windows, lamp heads, additive lamp glow); weather = grey multiply dim, fog overlay, rain/snow particle sprites in screen space.
- **npm libraries, vendored**: `npm install` runs `scripts/vendor.mjs` (postinstall), which builds browser files into `vendor/` (committed, so Pages works without node_modules):
  - `pixi.js` – bundled by `esbuild` (devDependency) into `vendor/pixi.js` (`window.PIXI`)
  - `zzfx` – synthesized sound effects (no audio files); ES module turned into `window.zzfx`/`window.ZZFX`
  - `@fontsource/nunito` – the UI font (woff2)
- Node scripts: `npm run check` (syntax check), `npm start` (static server on :8080), `npm run shot -- <outDir> "time=22:00&weather=rain" ...` (headless Chrome/Edge screenshots via SwiftShader; env `BUDGET=ms` sets the virtual time).
- Test URL params: `?time=22:00`, `?speed=60`, `?season=winter`, `?weather=clear|cloudy|rain|fog|snow`, `?at=-180,84` (camera target in metres), `?zoom=1..4`, `?nointro=1`.
- Note: `npm run shot` uses Chrome's virtual time budget, which barely advances the animation loop (vehicles never arrive). For live checks drive headless Chrome over the DevTools protocol instead (load the page, wait real seconds, `Page.captureScreenshot`).

## Real map pipeline (official Swiss data + OSM → 3D scene)
- `npm run osm` → `scripts/osm.mjs` downloads OpenStreetMap data (bbox 47.371,8.278 – 47.399,8.312) into `osm/raw.json`. Used for the **street centre lines** and bus stops.
- `npm run av` → `scripts/av.mjs` downloads official open data into `osm/av.json` (LV95 coordinates):
  - **Amtliche Vermessung Kanton Aargau** (WFS geodienste.ch, layer LCSF): surveyed building outlines (with EGID), road surfaces, sidewalks, driveways, pools
  - **GWR** building register (api3.geo.admin.ch): address, floors, category, year, flats per EGID
  - **SWISSIMAGE** aerial photo (wms.geo.admin.ch): roof colour sampled inside each outline
- `npm run scene` → `scripts/build-scene.mjs` writes `js/data/scene.js`: only buildings whose **address** is on Niederwilerstrasse, Ifangweg or Kapellenweg (Nesselnbach), with real outlines split into rectangular blocks (each gets a gable roof), floors from GWR, roof colour from the aerial photo (a bit brighter/saturated). Street widths measured from the surveyed road surface. Don't edit `scene.js` by hand.
- Google Maps / Street View is not used (its terms forbid extracting data); facade colours are still invented.
- **Buurehuus** = Niederwilerstrasse 3 (id `buurehuus`, kind `farmhouse`): one long roof, living part on the left (south) as seen from the street, wooden barn with Tenntor on the right. Home of **Mige** (pink long hair, black shirt, jeans) plus Mina and Luna, **Iris** (Joel's mother) lives at **Ifangweg 15** (`h31`); **Yves** (Joel's brother) lives in Mellingen and comes with the **Postauto** most days (`NB.Data.visitors` entry with `by: 'bus'`: gets off when a bus stops at Mitteldorf, waits at the stop and boards the next one when leaving); he spends the day at Iris's, the Beiz and Mige's. Joel and Mariana visit Iris at 10:45. **Mariana**: from Ocotlán / Guadalajara, works at the tortillería "Mas Amor" in Zürich; "geil", "gömmer", "Joelito Papacito", ¡No manches! / ¡Chintrolletta! / ¡Órale!; `phoneLines` = calls to her parents (said standing still with 📱). **Joel**: dry, short, vibe coding, coffee and beer. Occupied houses are named "Huus vo … (address)". **Joel** (brown short hair, black glasses, white pullover, dark jeans) and **Mariana** (Mexican: dark skin, long black hair with a flower, hoop earrings, embroidered rosa-mexicano blouse, Spanish mixed into her lines) visit from Lenzburg (see Visitors) – click lines cycle via `cycle: true`. Bench next to the front door (`M.bench`), and left of the house (beyond the living part) a small paved **Sitzplatz** with a round table and four stools (`M.sitzplatz`, POI `sitzplatz`; placed in `js/world.js` -> `map.farmProps`).
- **Traffic:** villagers on the street run to the nearest side when a car or the Postauto comes within ~25 m (`Villager.evade`, triggered in `Vehicle.update`) and wait until it has passed.
- **Fields:** `build-scene.mjs` also exports the OpenStreetMap `landuse=farmland/meadow/orchard` polygons around the village (`fields`, those overlapping the painted ground) with a crop kind rotating per field (`grain`, `meadow`, `root`) and the long-axis `angle`. In the game they are terrain codes 4–6 (`js/main.js`): furrows 1 m apart along the field axis, seasonal palettes (brown soil + green sprouts in spring, golden grain / mown stripes in summer, stubble / ploughed in autumn, snow in winter), flowers on meadows, round **hay bales** on meadows in summer/autumn (clickable). Trees and bushes stay off the fields; crops cost more to walk across. POIs `feld` and `weide` are the biggest crop field / meadow inside the map (De Buur's routine uses them).
- **Tractors:** `M.vehicle('tractor', ...)` (big rear wheels, bonnet, glass cab, exhaust). Two behaviours in `js/entities.js`: a `Vehicle` of type `tractor` drives the Postauto route at 4 m/s (cars queue behind it, villagers jump aside), and a `FieldTractor` works a block of 4–8 rows of a field back and forth (`NB.map.fieldLanes(field)`: boustrophedon rows 3.6 m apart, inside the map, clear of buildings/streets) with dust puffs and a diesel putter, then fades out. Field work only 07:00–19:30, not in winter / rain / snow; one at a time. Click = seasonal farmer line, the field tractor stops for a chat.
- **Löli-Weiher:** the real pond (OSM `natural=water`, NW of the village) is exported as `water` and the map bounds grow to include it. Terrain codes 7 (water: dark edge, glints) and 8 (2.5 m sandy shore band); water is unwalkable, reeds (`M.reed`) along the shore, the owner's sign (`M.sign`, clickable) at the **fishing spot** (POI `fischerplatz`: the shore point nearest the village; `weiher` = pond + shore). **Ducks** (`js/data/animals.js`, kind `duck`, `M.duck`: drake / duck, swim with bob, dip, waddle on the shore) swim on `map.duckCost`, leave ripples, quack when clicked and paddle off. **Fishing:** a routine entry with `do: 'fish'` (Joel and **Mariana** 15:00–17:30) makes the villager stand at the spot facing the water; the rod and bobbing float are drawn by `js/ui.js`; bites every 40–100 s (🐟 + splash). **De Weiher-Buur** (Kapellenweg 14, `guard: 'weiher'`) walks round his pond on his routine and additionally every 2.5–6 min; anyone fishing within 15 m gets shouted at (`guardLines`, 💢) and runs home at double speed (`caughtLines`) for 2–3 min, then the routine brings them back.
- **Visitors from Lenzburg:** Joel and Mariana don't live in Nesselnbach. `NB.Data.visitors` (`js/data/characters.js`) describes the visit: members, the car (**electric Mini**, `M.vehicle('mini')`: white roof, yellow mirror caps, colour in data), and the windows the arrival (10:30–13:00) and departure (20:00–22:00) times are drawn from once per day (`NB.clock.day`). `Visit` in `js/entities.js`: the Mini drives in on the Niederwilerstrasse, leaves the road at the nearest route point and parks in Mige's yard (`map.farmProps.parking`, barn side of the front door); the two get out (`arriveLines`), follow their routines (`home:buurehuus` = at Mige's), and at leaving time walk back to the car (`leaveLines`), get in and the Mini drives off. Outside the visit they are `away` (invisible, not occupants). Characters flagged `visitor: true` need no `sleep`. Starting the page inside the visit window puts the Mini parked and the two at their routine places. Test hook: `NB.Entities.visits[0].start(false)`.
- **Track to the Löli-Weiher:** the OSM `highway=track` "Kapellenweg" (grade 1, id 102806510) is exported as a street with `kind: 'track'` (3 m, gravel): terrain code 9 (loose stones, darker rim), no sidewalk, no lamps; pushed >= 5 m off the pond shore. Walkable like a street (the anglers use it).
- **Milchzentrale** (`id: 'milch'`, kind `dairy`): **Kapellenweg 1** (`MILCH_EGID` in `build-scene.mjs`), owned and run by **Silvia, Roman and Reto Gehrig** (they live above it, `home:milch`). It burned down recently and was rebuilt: **clicking it 7 times within 10 s sets it on fire** (`E.startFire` in `js/entities.js`): residents and neighbours run to the Dorfplatz, flames/smoke fx, the building glows; after 4 s the **fire engine** (`M.vehicle('firetruck')`, siren) comes from Niederwil (south end of the Niederwilerstrasse, `reverse = true`) and parks in the dairy bay; the crew (`NB.Data.firefighters`: **Raphy Naef** – Raphael, black, from Niederwil – plus two) runs to the visible sides and sprays (water-jet arcs in `js/ui.js`), the fire dies down in about a minute, they get back in and the engine leaves; the walls stay sooty (sprite tint) for ~10 min. Model: cream walls with a light-blue band, grey plinth, wide roll door on a loading ramp with milk churns and crates, blue sign, steel milk tank with cone top at the +u end, chimney with **steam** (`rec.steam` -> `js/main.js` emits `steam` fx 05:00–20:00). POI `milchzentrale`. The Gehrigs work inside (the click text says they are "am Chäse"), **De Buur** brings milk at 06:20 and 18:10, and a **milk lorry** (`M.vehicle('tanker')`, `NB.Data.visitors` entries with `members: []`, `park: 'dairy'`, `stay: [min, max]` minutes) parks beside the loading door twice a day (`map.parkings.dairy`).
- Landmarks: Heiligkreuz Kapelle = Kapellenweg 10 (`kapelle`), the Beiz = Vereinslokal "Casino", Niederwilerstrasse 17.1 (`beiz`). The 12 houses nearest the centre are `haus1`–`haus12` (family homes), others `h#`, outbuildings `g#`.
- Credits on the intro screen: OpenStreetMap (ODbL), Amtliche Vermessung AG, GWR (BFS), SWISSIMAGE (swisstopo).

## Files
| File | Status | Content |
|---|---|---|
| `js/util.js` | done | helpers, seeded RNG, Zurich clock (`?time`, `?speed`), season |
| `js/path.js` | done | A* pathfinding (`NB.findPath`) on the 2 m walk grid |
| `js/data/scene.js` | generated | streets (OSM), buildings (cadastral survey + GWR: outlines split into blocks, floors, roof colours), driveways/pools, fields (OSM landuse), stops, route, POIs (see pipeline) |
| `js/iso.js` | done | `NB.Iso`: iso projection + inverse, 8-way facing from a heading, building snapping, pixel rasterizer (`Pix`), box/prism model builder (`model().box/cbox/gable/hip/pyramid/shadow().render()` -> outlined sprite with optional night-light layer), `rows()` for hand-drawn sprites with drop shadow |
| `js/world.js` | done | snaps buildings, then `NB.map`: walk/animal cost grids, street distance, building specs (`inside`, lines, sounds, entry points), POIs + aliases, bus route |
| `js/models.js` | done | pixel-art models: houses (gabled/hipped roofs, lit windows at night, shutters, flower boxes, chimney, door + step on the visible street side, snowy roofs in winter), chapel with tower/spire/cross, Beiz sign, seasonal trees (2 kinds, 8 variants) and bushes, lamps (with light), bus shelter, tables with umbrella, villagers (front/back/side, 3 walk frames, 2 wave frames), cats (walk/sit/sleep, patterns incl. Luna), Postauto + cars (16 headings, cached) |
| `js/audio.js` | done | ZzFX sounds: meow, babble voices per character, bell, Postauto horn (C#–E–A), ambience (birds/crickets/rain); **purr is custom-synthesized** (filtered noise pulsed ~25 Hz with a breathing cycle, seamless loop); unlock on first click |
| `js/env.js` | done | daylight/darkness by season, sun progress, weather state machine, which windows are lit, hourly bells |
| `js/entities.js` | done | Villager (routine, home at night, click reactions, walk/wave frames, faces the viewer when clicked), Cat (idle/sit/sleep, meow, hold = purr, Luna zoomies), Vehicle (Postauto + cars on the real route, keep right, stop at stops, fade in/out). Each has a `sprite` and the current `frame` record (for pixel-perfect picking) |
| `js/ui.js` | done | 2D overlay: speech bubbles, hover name tag, street labels, hearts/notes/dust; HUD (clock, zoom, centre, mute), intro "Iitrete" |
| `js/data/characters.js` | **placeholders** | family + villagers as data (see format below) |
| `js/data/animals.js` | done | ducks on the Löli-Weiher; cats: Mimi, Tiger, Schnurrli, Fleckli, Minka, plus **Luna** (calico, only says Miau/Mauz: `words`) and **Mina** (calico, mostly white, talks: `talk`), both at the Buurehuus (POI `hof`) |
| `js/main.js` | done | PixiJS renderer: building depth order + `NB.world.zkey`, lazy ground chunks, houses + window-light sprites, trees/bushes, lamps + glow, shelters, tables, day/night + weather layers, camera (drag, wheel/pinch zoom, follow cat), pixel-perfect picking on sprite masks, click/hover/long-press, game loop |
| `index.html`, `css/style.css` | done | page shell, two canvases, HUD pills, intro card |

Script order: pixi, zzfx, util, path, data/scene, iso, world, models, audio, env, entities, ui, data/characters, data/animals, main.

## Character data format
```js
{
  id: 'grosi', name: 'Grosi', home: 'haus1',
  look: { skin: '#f1c7a0', hair: '#d8d8d8', hairStyle: 'bun', shirt: '#7a4aa0', dress: '#7a4aa0', glasses: true, apron: '#ffffff' },
  // hairStyle: short | long | bun | ponytail | spiky | bald | cap | straw | headscarf; extras: glasses, beard, dress, apron, cap, scarf,
  // flower (hex: flower in the hair), earrings (true: gold hoops), bands ([hex, hex]: embroidered bands across the top)
  voice: 1.4,                       // babble pitch
  favorites: ['dorfplatz', 'kapelle'],
  routine: [{ at: '08:00', go: 'dorfplatz' }, { at: '12:00', go: 'home:haus1' }], // optional do: 'fish' at the fischerplatz
  sleep: ['21:30', '06:30'],
  clicks: ['Grüezi wohl! Wotsch es Guetzli?', 'Ou, du bisch aber gwachse!', 'Jetz lass mi aber!'], // escalating
  random: ['Hesch scho z\'Mittag gässe?'],
  night: ['Gang is Bett, es isch spoot!'],
}
```
POIs: `dorfplatz, bushalt, unterdorf, kapelle, beiz, hof, sitzplatz, feld, weide, weiher, fischerplatz, milchzentrale, ifangweg, kapellenweg, niederwilerstrasse, quartier, home:<houseId>` (or a rect `[x0, z0, x1, z1]` in metres). Homes: `haus1`–`haus12`, `beiz`, plus other building ids in `scene.js`.

## Next steps
1. ~~2D pixel version~~ → ~~low-poly 3D~~ → isometric pixel art (screenshots checked: day, dusk, night, rain, fog, winter snow, overview, chapel, Beiz, Postauto; clicks on villagers and houses verified headless).
1b. Polish ideas: more ground detail (flower beds, gravel at the chapel, hedges), vehicle headlight glow at night, 8-direction villager sprites, an optional 0.5x overview zoom (needs a smoothed downscale), rotate-by-90° views (would need re-rendered building sprites).
2. Test in a real browser: clicking people, cats (long-press purr, Luna zoomies), houses, chapel bell, Postauto; tune sounds by ear.
3. Fill in the real family members in `js/data/characters.js` (currently placeholder roles: Grosi, Grospi, Mami, Papi, Gotti, Götti + villagers).
4. Publish: GitHub Pages needs a **public** repo (or a paid plan for private Pages).

## Setup on a new computer
- `git clone https://github.com/Chicken-nugget-baum/MigesApp.git`
- Node.js LTS (`winget install OpenJS.NodeJS.LTS --scope user`), then `npm install` (also refreshes `vendor/`).
- To view: open `index.html` directly, or `npm start` and go to http://localhost:8080/
