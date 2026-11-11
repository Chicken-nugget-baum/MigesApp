# Nesselnbach – interactive pixel-art village

Handoff notes so work can continue on another computer. Status as of 2026-11-11.

## Idea
A living pixel-art version of **Nesselnbach** (Ortsteil of Niederwil AG, Reusstal, Freiamt).
**The village itself is the main character** – there is no player. Inspiration: https://maegwilli.duckdns.org/ (needs a login, wasn't viewable).

- Villagers walk around **on their own** (daily routines, favourite places, go home at night).
- Users **click** on things and they react; **every character reacts differently** (speech bubble, animation, own "voice" babble sound). Repeated clicks escalate ("Jetz längts aber!").
- **Cats** wander around; click → **"Miau"**, click again / hold → **purr** with hearts. Sleeping cats wake up ("Mrrr?").
- More life: cows on the Weide ("Muuuh"), chickens in the Hof, ducks on the Reuss, the **Postauto** on the Kantonsstrasse (horn "Tü-ta-to"), cars/tractor, chapel bells every full hour, Dorfbrunne, a Gartebahn (garden railway) loop.
- Day/night follows real Swiss time (Europe/Zurich), windows + street lamps light up; weather (clear/cloudy/rain/fog/snow) and seasons by month.

## Decisions (from the user)
1. Art: free asset packs were chosen. **So far all art is drawn in code** (`js/art.js`), because no single free pack has Swiss houses + walking villagers + cats in one style. The generators return canvases, so a pack can still be swapped in later.
2. Map: more or less the whole village, abstract – only the important stuff – **plus the road to Niederwil**.
3. Villagers: **recognisable Nesselnbachers, family first** (they already know about it). Characters are defined later as data.
4. Language: **Swiss German, Aargauer dialect** for all texts.

## Tech
- Plain JavaScript, **no build step**, classic `<script>` tags (works from `file://` and on GitHub Pages). Global namespace `window.NB`.
- HTML5 canvas, pixel art scaled with smoothing off; sounds synthesized with WebAudio (no audio files).
- Node.js is only used for `node --check` and a local test server. Headless Chrome screenshots (`chrome --headless --screenshot`) are used to check the look.
- Test URL params (planned): `?time=22:00`, `?speed=60`, `?season=winter`, `?weather=rain`, `?nointro=1`.

## Files
| File | Status | Content |
|---|---|---|
| `js/util.js` | done | helpers, seeded RNG, Zurich clock (`?time`, `?speed`), season, terrain codes `NB.TER` |
| `js/path.js` | done | A* pathfinding (`NB.findPath(cost, w, h, sx, sy, tx, ty)`) |
| `js/art.js` | done | seasonal palettes, ground tiles, trees, buildings (house/chapel/barn/Gnadenthal), props, people generator (`NB.Art.person(look)` → down/up/left/right × 3 frames), cat/cow/chicken/duck, Postauto/car/tractor, train cars, heart/note |
| `js/map.js` | done | 112×84 tile map: Kantonsstrasse 296 (x 54–56), Niederwilerstrasse (y 52–53) to Niederwil, Dorfplatz with Brunne, Kapälle, Beiz, Casino, Hof + Schüür + fields + fenced Weide, 12 houses (`haus1`–`haus12`) for family/villagers, Reuss + Gnadenthal, forests, lamps, POIs, cost grids |
| `js/audio.js` | **todo** | WebAudio: meow, purr, babble voices per character, bell, Postauto horn (C#–E–A), moo, cluck, quack, splash, clink, whistle, ambience (birds/crickets/rain); unlock on first click |
| `js/env.js` | **todo** | daylight/darkness by season, light overlay (windows/lamps), weather state machine + particles, hourly bells |
| `js/entities.js` | **todo** | Villager (routine, home at night, click reactions), Animal (cat/cow/chicken/duck), Vehicle (bus stops at y 40), Train (ellipse on `map.track`) |
| `js/ui.js` | **todo** | speech bubbles, hover name tag, place labels, HUD (clock, mute, centre), intro overlay "Iitrete" |
| `js/data/characters.js` | **todo** | family + villagers as data (see format below) |
| `js/data/animals.js` | **todo** | cats (Mimi, Tiger, Schnurrli, Luna, Fleckli), cows (Blüemli, Rosi, Fleck, Sternli), chickens, ducks |
| `js/main.js` | **todo** | game loop, camera (drag, wheel/pinch zoom), click hit-testing, y-sorted drawing, error overlay |
| `index.html`, `css/style.css` | **todo** | page shell, Google Font (e.g. Pixelify Sans) |

Note: `js/map.js` builds the map immediately when loaded and needs `NB.Art` → script order: util, path, art, map, audio, env, entities, ui, data, main.

## Character data format (planned)
```js
{
  id: 'grosi', name: 'Grosi', home: 'haus1',
  look: { skin: '#f1c7a0', hair: '#d8d8d8', hairStyle: 'bun', shirt: '#7a4aa0', dress: '#7a4aa0', glasses: true, apron: '#ffffff' },
  // hairStyle: short | long | bun | ponytail | spiky | bald | cap | straw | headscarf; extras: glasses, beard, dress, apron, cap, scarf, legs
  voice: 1.4,                       // babble pitch
  favorites: ['dorfplatz', 'kapelle'],
  routine: [{ at: '08:00', go: 'dorfplatz' }, { at: '12:00', go: 'home:haus1' }],
  sleep: ['21:30', '06:30'],
  clicks: ['Grüezi wohl! Wotsch es Guetzli?', 'Ou, du bisch aber gwachse!', 'Jetz lass mi aber!'], // escalating
  random: ['Hesch scho z\'Mittag gässe?'],
  night: ['Gang is Bett, es isch spoot!'],
}
```
POIs: `dorfplatz, kapelle, bushalt, beiz, casino, hof, feld, weide, reuss, gnadenthal, gartebahn, niederwil, wald, quartier, home:<houseId>`.

## Next steps
1. Write the todo files above, then `index.html`.
2. Check: `node --check js/*.js`, then headless Chrome screenshots at different `?time=` / `?weather=` values; fix visuals.
3. Fill in the real family members (names, looks, lines in Aargauer Dialekt, which house).
4. Publish: GitHub Pages needs a **public** repo (or a paid plan for private Pages).

## Setup on a new computer
- `git clone https://github.com/Chicken-nugget-baum/MigesApp.git`
- Optional: Node.js LTS (`winget install OpenJS.NodeJS.LTS --scope user`) for checks.
- To view: open `index.html` in a browser (once it exists).
