// PixiJS isometric pixel-art renderer: lazily painted ground chunks, buildings and props depth-sorted against
// each other, day/night + weather layers, camera (drag/zoom), picking (pixel-perfect on sprite masks), game loop.
(function (NB) {
  const I = NB.Iso, map = NB.map, S = NB.Scene, M = NB.Models;
  const canvas = document.getElementById('gl');
  const uiCanvas = document.getElementById('ui');
  const uctx = uiCanvas.getContext('2d');

  // ---------- error overlay ----------
  function showError(msg) {
    let el = document.getElementById('error');
    if (!el) { el = document.createElement('pre'); el.id = 'error'; document.body.appendChild(el); }
    el.textContent += msg + '\n';
  }
  window.addEventListener('error', (e) => showError('Fehler: ' + e.message + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));

  // ---------- scene graph ----------
  const app = new PIXI.Application();
  const world = new PIXI.Container();            // scaled + positioned by the camera
  const ground = new PIXI.Container();
  const objects = new PIXI.Container(); objects.sortableChildren = true;
  world.addChild(ground, objects);
  const lights = new PIXI.Container();           // same transform as `world`, drawn above the night tint
  const fullRect = (blend) => { const g = new PIXI.Graphics().rect(0, 0, 1, 1).fill(0xffffff); g.blendMode = blend; g.alpha = 0; return g; };
  const weatherDim = fullRect('multiply'), night = fullRect('multiply'), fog = fullRect('normal');
  const weather = new PIXI.Container();
  const C = (h) => parseInt(h.slice(1), 16);

  let W = 1, H = 1;
  const ZOOMS = [1, 2, 3, 4];
  const cam = { px: 0, py: 0, zoom: NB.clamp(parseInt(NB.params.get('zoom') || '2', 10) || 2, 1, 4) }; // centre in world pixels
  const start = NB.params.get('at') ? NB.params.get('at').split(',').map(Number) : [map.start.x, map.start.z];
  function setCentre(x, z) { const p = I.project(x, 0, z); cam.px = p[0]; cam.py = p[1]; }
  const startZoom = cam.zoom;
  function resetCam() { setCentre(start[0], start[1]); cam.zoom = startZoom; }
  resetCam();

  // ---------- buildings: snapped boxes in the (u, v) frame, drawn back to front ----------
  const blds = S.buildings.map((spec, i) => {
    const [u, v] = I.rot(spec.cx, spec.cz);
    const h = (spec.kind === 'garage' ? 3.2 : spec.levels * 2.9 + 0.6 + Math.min(5.5, Math.min(spec.w, spec.d) * 0.42)) + (spec.kind === 'chapel' ? 8 : 0);
    return { spec, i, h, u0: u - spec.w / 2, u1: u + spec.w / 2, v0: v - spec.d / 2, v1: v + spec.d / 2 };
  });
  const NBLD = blds.length;
  {
    const behind = (a, b) => a.u1 <= b.u0 + 0.01 || a.v1 <= b.v0 + 0.01;
    const depth = (b) => b.u0 + b.u1 + b.v0 + b.v1;
    const before = (j, i) => { const bj = behind(blds[j], blds[i]), bi = behind(blds[i], blds[j]); return bj !== bi ? bj : depth(blds[j]) < depth(blds[i]); };
    const state = new Uint8Array(NBLD), order = [];
    const visit = (i) => { if (state[i]) return; state[i] = 1; for (let j = 0; j < NBLD; j++) if (j !== i && before(j, i)) visit(j); state[i] = 2; order.push(i); };
    for (let i = 0; i < NBLD; i++) visit(i);
    order.forEach((i, slot) => { blds[i].slot = slot; });
  }
  const bySlot = blds.slice().sort((a, b) => a.slot - b.slot);
  const [bx0, bz0, bx1, bz1] = S.bounds;
  const dmin = Math.min(...[[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]].map(([x, z]) => I.depth(x, z)));
  const SLOT = 2000;
  // depth key for a point on the ground: drawn just before the first building that hides it. A point is hidden
  // by a box when its line of sight towards the viewer, p + t * (1, 1, 1), passes through the box.
  function zkey(x, z) {
    const [u, v] = I.rot(x, z);
    let slot = NBLD;
    for (const b of bySlot) if (Math.max(b.u0 - u, b.v0 - v, 0) <= Math.min(b.u1 - u, b.v1 - v, b.h)) { slot = b.slot; break; }
    return slot * SLOT + NB.clamp(Math.round((u + v - dmin) * 1.5), 0, SLOT - 2);
  }
  NB.world = {
    zkey,
    add: (s) => objects.addChild(s), remove: (s) => objects.removeChild(s),
    addLight: (s) => lights.addChild(s), removeLight: (s) => lights.removeChild(s),
  };
  // put a sprite record at world (x, y, z) as a static object
  function placeStatic(rec, x, y, z, z2, container) {
    const p = I.project(x, y, z);
    const s = new PIXI.Sprite(rec.tex);
    s.x = Math.round(p[0]) - rec.ox; s.y = Math.round(p[1]) - rec.oy; s.zIndex = z2;
    (container || objects).addChild(s);
    return s;
  }

  const pickables = []; // { sprite, rec, building? , info? }
  const houses = [];
  S.buildings.forEach((spec, i) => {
    const b = map.buildings[spec.id], bl = blds[i];
    const rec = M.house(spec, i);
    const z2 = bl.slot * SLOT + SLOT - 1;
    const s = placeStatic(rec, spec.cx, 0, spec.cz, z2);
    let light = null;
    if (rec.light) { light = placeStatic({ tex: rec.light, ox: rec.ox, oy: rec.oy }, spec.cx, 0, spec.cz, z2, lights); light.alpha = 0; }
    b.top = { x: spec.cx, y: rec.height + 1, z: spec.cz };
    pickables.push({ sprite: s, rec, building: b });
    houses.push({ b, light, seed: (i * 0.6180339) % 1 });
  });

  // ---------- streets as polylines (for lamps and shelters) ----------
  function polyline(pts) {
    const seg = [], cum = [0];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); cum.push(cum[i - 1] + l); }
    const len = cum[cum.length - 1];
    return {
      len,
      at(dist) {
        let i = 1; while (i < cum.length - 1 && cum[i] < dist) i++;
        const t = seg[i - 1] ? (dist - cum[i - 1]) / seg[i - 1] : 0;
        const a = pts[i - 1], b = pts[i], l = seg[i - 1] || 1;
        return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l };
      },
    };
  }

  // ---------- trees, bushes ----------
  const rnd = NB.seeded(77);
  const occupied = [];
  const freeSpot = (x, z, streetGap, bGap, gap) => map.streetDist(x, z) > streetGap && !map.inBuilding(x, z, bGap) && !occupied.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < gap);
  for (let k = 0; k < 1200 && occupied.length < 280; k++) {
    const x = NB.lerp(bx0 + 10, bx1 - 10, rnd()), z = NB.lerp(bz0 + 10, bz1 - 10, rnd());
    if (!freeSpot(x, z, 3.5, 3, 6)) continue;
    placeStatic(M.tree(rnd() < 0.2 ? 'pine' : 'leaf', (rnd() * 8) | 0), x, 0, z, zkey(x, z));
    occupied.push([x, z]);
  }
  for (let k = 0; k < 900; k++) {
    const x = NB.lerp(bx0 + 10, bx1 - 10, rnd()), z = NB.lerp(bz0 + 10, bz1 - 10, rnd());
    if (!freeSpot(x, z, 1.6, 1.5, 3) || map.streetDist(x, z) > 9) continue;
    placeStatic(M.bush((rnd() * 4) | 0), x, 0, z, zkey(x, z));
    occupied.push([x, z]);
  }

  // ---------- lamps with ground glow ----------
  const lamps = [];
  for (const s of S.streets) {
    const pl = polyline(s.pts);
    for (let d = 12, side = 1; d < pl.len - 4; d += 30, side = -side) {
      const p = pl.at(d), off = s.width / 2 + 1.4;
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      if (map.inBuilding(x, z, 0.8) || lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 14)) continue;
      const rec = M.lamp();
      placeStatic(rec, x, 0, z, zkey(x, z));
      const head = placeStatic({ tex: rec.light, ox: rec.ox, oy: rec.oy }, x, 0, z, 0, lights);
      const glow = placeStatic(M.glow(), x, 0, z, 0, lights);
      glow.blendMode = 'add'; head.alpha = 0; glow.alpha = 0;
      lamps.push({ x, z, head, glow });
    }
  }

  // ---------- bus stops, Beiz tables ----------
  for (const st of map.busStops) {
    let best = 0, bd = Infinity;
    map.route.forEach((p, k) => { const d = Math.hypot(p.x - st.x, p.z - st.z); if (d < bd) { bd = d; best = k; } });
    const a = map.route[Math.max(0, best - 1)], b = map.route[Math.min(map.route.length - 1, best + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const p = map.route[best], off = 3 + 2.2;
    const x = p.x - tz * off, z = p.z + tx * off;
    const rec = M.busStop(Math.atan2(x - p.x, z - p.z));
    const s = placeStatic(rec, x, 0, z, zkey(x, z));
    const info = { name: 'Bushaltestell «' + st.name + '»', lines: ['Nöchsti Abfahrt: wenn\'s Postauto chunnt. 🚌', 'Linie Mellige – Niederwil – Wohle.'], sound: 'click', top: { x, y: 3.6, z } };
    pickables.push({ sprite: s, rec, info });
  }
  const beiz = map.buildings.beiz;
  if (beiz) [-1, 1].forEach((sgn) => {
    const x = beiz.entryPt.x + beiz.doorN[1] * 3 * sgn + beiz.doorN[0] * 1.5, z = beiz.entryPt.z - beiz.doorN[0] * 3 * sgn + beiz.doorN[1] * 1.5;
    if (map.streetDist(x, z) > 0.5) placeStatic(M.table(), x, 0, z, zkey(x, z));
  });

  // ---------- ground: terrain codes (top-down, 2 cells / m) painted lazily into screen-aligned chunks ----------
  const TM = 2, MARGIN = 240;
  const tx0 = bx0 - MARGIN, tz0 = bz0 - MARGIN;
  const tw = Math.ceil((bx1 - bx0 + MARGIN * 2) * TM), th = Math.ceil((bz1 - bz0 + MARGIN * 2) * TM);
  const terrain = new Uint8Array(tw * th); // 0 grass, 1 sidewalk, 2 asphalt, 3 plaza
  {
    const [tc, tg] = NB.canvas(tw, th);
    tg.fillStyle = '#000'; tg.fillRect(0, 0, tw, th);
    if (S.pois && S.pois.dorfplatz) { const r = S.pois.dorfplatz; tg.fillStyle = '#0000ff'; tg.fillRect((r[0] - tx0) * TM, (r[1] - tz0) * TM, (r[2] - r[0]) * TM, (r[3] - r[1]) * TM); }
    tg.lineCap = 'round'; tg.lineJoin = 'round';
    const stroke = (s, width, col) => {
      tg.strokeStyle = col; tg.lineWidth = width * TM; tg.beginPath();
      s.pts.forEach(([x, z], k) => (k ? tg.lineTo((x - tx0) * TM, (z - tz0) * TM) : tg.moveTo((x - tx0) * TM, (z - tz0) * TM)));
      tg.stroke();
    };
    for (const s of S.streets) stroke(s, s.width + 2.4, '#ff0000');
    for (const s of S.streets) stroke(s, s.width, '#00ff00');
    const d = tg.getImageData(0, 0, tw, th).data;
    for (let i = 0; i < terrain.length; i++) terrain[i] = d[i * 4 + 1] > 127 ? 2 : d[i * 4] > 127 ? 1 : d[i * 4 + 2] > 127 ? 3 : 0;
  }
  const ter = (x, z) => {
    const ix = ((x - tx0) * TM) | 0, iz = ((z - tz0) * TM) | 0;
    return ix < 0 || iz < 0 || ix >= tw || iz >= th ? 0 : terrain[iz * tw + ix];
  };
  const snow = NB.season === 'winter';
  const GRASS = { spring: ['#86d79a', '#74c788', '#98e2aa'], summer: ['#7dcf8e', '#6cbf7d', '#8fdb9e'], autumn: ['#a8cf84', '#95bd73', '#b9db96'], winter: ['#eef3f8', '#dfe8f0', '#ffffff'] }[NB.season] || ['#7dcf8e', '#6cbf7d', '#8fdb9e'];
  const FLOWERS = { spring: ['#ffffff', '#ffe066', '#ff9ecf', '#b9a4ff'], summer: ['#ffffff', '#ffd23f', '#ff7aa8', '#ffffff'] }[NB.season];
  const ASPH = snow ? '#c9c6d2' : '#9b97a8', WALK = snow ? '#f4f1ec' : '#e6dbc5', PLAZA = snow ? '#e8e6e2' : '#b7afa4';
  const COL = {
    g: GRASS.map(I.rgb), f: (FLOWERS || []).map(I.rgb),
    a: [ASPH, NB.shade(ASPH, 0.92), NB.shade(ASPH, 1.08), NB.shade(ASPH, 0.72)].map(I.rgb),
    s: [WALK, NB.shade(WALK, 0.93), NB.shade(WALK, 1.05), NB.shade(WALK, 0.8)].map(I.rgb),
    p: [PLAZA, NB.shade(PLAZA, 0.9), NB.shade(PLAZA, 1.1), NB.shade(PLAZA, 0.7)].map(I.rgb),
  };
  const CH = 256;
  const chunks = new Map();
  let frameNo = 0;
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  const [dxdx, dzdx] = I.pxToWorld(1, 0), [dxdy, dzdy] = I.pxToWorld(0, 1);
  function paintChunk(cx, cy) {
    const img = new ImageData(CH, CH), d = img.data;
    let k = 0;
    for (let py = 0; py < CH; py++) {
      const wy = cy * CH + py;
      let [x, z] = I.pxToWorld(cx * CH + 0.5, wy + 0.5);
      for (let px = 0; px < CH; px++, x += dxdx, z += dzdx, k += 4) {
        const wx = cx * CH + px;
        const code = ter(x, z);
        const h = hash(wx, wy), r = h & 255;
        let c;
        if (code === 0) {
          c = r < 16 ? COL.g[1] : r < 26 ? COL.g[2] : COL.g[0];
          if (COL.f.length && ((h >> 8) & 255) < 2) c = COL.f[(h >> 16) & 3];
        } else if (code === 2) {
          const edge = ter(x + dxdx, z + dzdx) !== 2 || ter(x - dxdx, z - dzdx) !== 2 || ter(x + dxdy, z + dzdy) !== 2 || ter(x - dxdy, z - dzdy) !== 2;
          c = edge ? COL.a[3] : r < 18 ? COL.a[1] : r < 30 ? COL.a[2] : COL.a[0];
        } else if (code === 1) {
          const edge = ter(x + dxdx, z + dzdx) === 0 || ter(x - dxdx, z - dzdx) === 0 || ter(x + dxdy, z + dzdy) === 0 || ter(x - dxdy, z - dzdy) === 0;
          c = edge ? COL.s[3] : r < 14 ? COL.s[1] : r < 24 ? COL.s[2] : COL.s[0];
        } else {
          const row = Math.floor(wy / 3), line = wy % 3 === 0 || (wx + row * 3) % 6 === 0;
          c = line ? COL.p[3] : r < 60 ? COL.p[1] : r < 120 ? COL.p[2] : COL.p[0];
        }
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
    }
    const [c2, g] = NB.canvas(CH, CH);
    g.putImageData(img, 0, 0);
    const s = new PIXI.Sprite(PIXI.Texture.from(c2));
    s.x = cx * CH; s.y = cy * CH;
    ground.addChild(s);
    return { sprite: s, seen: frameNo };
  }
  function updateGround() {
    const x0 = Math.floor((cam.px - W / 2 / cam.zoom) / CH), x1 = Math.floor((cam.px + W / 2 / cam.zoom) / CH);
    const y0 = Math.floor((cam.py - H / 2 / cam.zoom) / CH), y1 = Math.floor((cam.py + H / 2 / cam.zoom) / CH);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const key = cx + ',' + cy;
      let c = chunks.get(key);
      if (!c) { c = paintChunk(cx, cy); chunks.set(key, c); }
      c.seen = frameNo;
    }
    if (chunks.size > 70) for (const [key, c] of chunks) if (c.seen < frameNo - 60) { ground.removeChild(c.sprite); c.sprite.texture.destroy(true); chunks.delete(key); }
  }

  // ---------- weather particles (screen space) ----------
  const PN = 360;
  const particles = [];
  {
    const mk = (w, h, hex) => { const [c, g] = NB.canvas(w, h); g.fillStyle = hex; g.fillRect(0, 0, w, h); return PIXI.Texture.from(c); };
    const rainTex = mk(1, 5, '#cfe0f5'), snowTex = mk(2, 2, '#ffffff');
    for (let i = 0; i < PN; i++) {
      const s = new PIXI.Sprite(rainTex); s.alpha = 0.8; weather.addChild(s);
      particles.push({ s, x: NB.rr(0, 2000), y: NB.rr(0, 1200), rainTex, snowTex, ph: NB.rr(0, 6) });
    }
  }
  function updateWeather(dt) {
    const w = NB.Env.weather, on = w === 'rain' || w === 'snow';
    weather.visible = on;
    if (!on) return;
    const rain = w === 'rain', t = performance.now() / 1000;
    for (const p of particles) {
      p.s.texture = rain ? p.rainTex : p.snowTex;
      p.y += (rain ? 520 : 55) * dt; p.x += rain ? -60 * dt : Math.sin(t * 1.5 + p.ph) * 18 * dt;
      if (p.y > H + 8) { p.y = -8; p.x = NB.rr(0, W + 60); }
      if (p.x < -8) p.x += W + 16; else if (p.x > W + 8) p.x -= W + 16;
      p.s.x = Math.round(p.x); p.s.y = Math.round(p.y);
    }
  }

  // ---------- sky, day/night, lamps, windows ----------
  const SKY = { day: '#bfe6ff', dusk: '#f7b98f', night: '#1c2444', grey: '#c3cbd3', fog: '#dfe5ea' };
  const mix = (a, b, t) => { const A = I.rgb(a), B = I.rgb(b); return [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t)); };
  const toHex = (c) => (c[0] << 16) | (c[1] << 8) | c[2];
  function updateSky() {
    const d = NB.Env.darkness, w = NB.Env.weather;
    const dusk = d > 0 && d < 0.75 ? 1 - Math.abs(d - 0.35) / 0.4 : 0;
    let sky = mix(SKY.day, SKY.grey, w === 'clear' ? 0 : 0.7);
    if (w === 'fog') sky = I.rgb(SKY.fog);
    sky = mix('#' + toHex(sky).toString(16).padStart(6, '0'), SKY.dusk, Math.max(0, dusk) * 0.6);
    sky = mix('#' + toHex(sky).toString(16).padStart(6, '0'), SKY.night, Math.min(1, d * 1.1));
    app.renderer.background.color = toHex(sky);
    // night tint (multiply): warm at dusk, deep blue at night
    night.tint = toHex(mix('#ffb48a', '#2c3a78', NB.clamp(d * 1.3, 0, 1)));
    night.alpha = NB.clamp(d * 0.9 + dusk * 0.28, 0, 0.9);
    weatherDim.tint = C('#aeb6c4');
    weatherDim.alpha = { cloudy: 0.3, rain: 0.42, snow: 0.22, fog: 0.2 }[w] || 0;
    fog.tint = C(SKY.fog);
    fog.alpha = w === 'fog' ? 0.5 : 0;
    for (const h of houses) if (h.light) h.light.alpha = NB.Env.windowLit(h.b, h.seed) ? NB.clamp(d * 1.6, 0, 1) : 0;
    const on = d > 0.25;
    for (const l of lamps) { l.head.alpha = on ? 1 : 0; l.glow.alpha = on ? NB.clamp(d, 0, 1) * 0.7 : 0; }
  }

  // ---------- camera / projection for the 2D overlay ----------
  function applyCamera() {
    const z = cam.zoom;
    world.scale.set(z); lights.scale.set(z);
    world.x = lights.x = Math.round(W / 2 - cam.px * z);
    world.y = lights.y = Math.round(H / 2 - cam.py * z);
  }
  NB.project = (x, y, z) => { const p = I.project(x, y, z); return [Math.round(p[0]) * cam.zoom + world.x, Math.round(p[1]) * cam.zoom + world.y]; };
  function updateView() {
    const [cx, cz] = I.pxToWorld(cam.px, cam.py);
    NB.view = { w: W, h: H, cx, cy: cz, halfW: W / (2 * I.PPM * cam.zoom) * 1.4, dist: 112 / cam.zoom, zoom: cam.zoom };
  }
  function clampCam() {
    const [x, z] = I.pxToWorld(cam.px, cam.py);
    const cx = NB.clamp(x, bx0, bx1), cz = NB.clamp(z, bz0, bz1);
    if (cx !== x || cz !== z) setCentre(cx, cz);
  }
  function zoomTo(level, sx, sy) {
    const nz = ZOOMS[NB.clamp(level, 0, ZOOMS.length - 1)];
    if (nz === cam.zoom) return;
    const ax = sx == null ? W / 2 : sx, ay = sy == null ? H / 2 : sy;
    cam.px += (ax - W / 2) * (1 / cam.zoom - 1 / nz); cam.py += (ay - H / 2) * (1 / cam.zoom - 1 / nz);
    cam.zoom = nz;
  }
  const zoomStep = (dir, sx, sy) => zoomTo(ZOOMS.indexOf(cam.zoom) + dir, sx, sy);
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    app.renderer.resize(W, H);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    uiCanvas.width = W * dpr; uiCanvas.height = H * dpr; uiCanvas.style.width = W + 'px'; uiCanvas.style.height = H + 'px';
    uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    [weatherDim, night, fog].forEach((g) => g.scale.set(W, H));
  }

  // ---------- picking (pixel-perfect on the sprite alpha masks) ----------
  function hit(sprite, rec, sx, sy) {
    const tx = Math.floor((sx - world.x) / cam.zoom - sprite.x), ty = Math.floor((sy - world.y) / cam.zoom - sprite.y);
    return tx >= 0 && ty >= 0 && tx < rec.w && ty < rec.h && rec.mask[ty * rec.w + tx] > 100;
  }
  function pick(sx, sy) {
    const cands = [];
    for (const e of NB.Entities.list) if (e.visible && e.frame && e.sprite.visible) cands.push({ sprite: e.sprite, rec: e.frame, entity: e });
    for (const p of pickables) cands.push(p);
    cands.sort((a, b) => b.sprite.zIndex - a.sprite.zIndex);
    for (const c of cands) {
      if (!hit(c.sprite, c.rec, sx, sy)) continue;
      if (c.entity) return { owner: c.entity, name: c.entity.name, entity: c.entity };
      if (c.building) return { owner: c.building.top, name: c.building.name, building: c.building };
      if (c.info) return { owner: c.info.top, name: c.info.name, info: c.info };
    }
    // forgiving: nearest entity on screen within 30 px
    let best = null, bd = 30;
    for (const e of NB.Entities.list) {
      if (!e.visible || !e.top) continue;
      const t = e.top(), p = NB.project(t.x, t.y * 0.5, t.z);
      const d = Math.hypot(p[0] - sx, p[1] - sy);
      if (d < bd) { bd = d; best = { owner: e, name: e.name, entity: e }; }
    }
    return best;
  }
  const clickCount = new Map();
  function clickBuilding(b) {
    let text;
    if (b.inside.size) {
      const who = [...b.inside].map((v) => v.name).join(' und ');
      const late = NB.inWindow(NB.clock.minutes(), '22:00', '06:30');
      text = late ? `Psst! ${who} schloft${b.inside.size > 1 ? 'e' : ''}. 💤` : `${who} ${b.inside.size > 1 ? 'sind' : 'isch'} dihei. Klopf klopf!`;
      NB.Audio.play('door', { pos: b.top });
    } else {
      const n = clickCount.get(b) || 0; clickCount.set(b, n + 1);
      text = b.occupants.length && b.kind === 'house' ? 'Niemer dihei.' : b.lines[n % b.lines.length];
      if (b.sound === 'bell') NB.Audio.bell({ pos: b.top }); else NB.Audio.play(b.sound || 'door', { pos: b.top });
    }
    NB.UI.say(b.top, text);
  }
  function tapAt(sx, sy) {
    NB.Audio.unlock();
    const h = pick(sx, sy);
    if (!h) return;
    if (h.entity) h.entity.click();
    else if (h.building) clickBuilding(h.building);
    else if (h.info) { const n = clickCount.get(h.info) || 0; clickCount.set(h.info, n + 1); NB.UI.say(h.info.top, h.info.lines[n % h.info.lines.length]); NB.Audio.play(h.info.sound, { pos: h.info.top }); }
  }

  // ---------- input: drag = pan, wheel / pinch = zoom, tap = click, hold (450 ms) on a cat = purr ----------
  let down = null, held = null, follow = null;
  const pointers = new Map();
  let pinchDist = 0;
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); down = null; return; }
    down = { x, y, lx: x, ly: y, t: performance.now(), moved: false, held: false };
    const d = down;
    setTimeout(() => {
      if (down !== d || d.moved) return;
      const h = pick(d.x, d.y);
      if (h && h.entity && h.entity.holdStart) { NB.Audio.unlock(); h.entity.holdStart(); held = h.entity; d.held = true; }
    }, 450);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > pinchDist * 1.3) { zoomStep(1, (a.x + b.x) / 2, (a.y + b.y) / 2); pinchDist = d; }
      else if (d < pinchDist / 1.3) { zoomStep(-1, (a.x + b.x) / 2, (a.y + b.y) / 2); pinchDist = d; }
      return;
    }
    if (down && !down.held) {
      if (!down.moved && Math.hypot(x - down.x, y - down.y) > 6) { down.moved = true; follow = null; }
      if (down.moved) { cam.px -= (x - down.lx) / cam.zoom; cam.py -= (y - down.ly) / cam.zoom; }
      down.lx = x; down.ly = y;
    }
    if (e.pointerType === 'mouse' && !e.buttons) {
      const now = performance.now();
      if (!canvas._lastHover || now - canvas._lastHover > 70) {
        canvas._lastHover = now;
        const h = pick(x, y);
        NB.UI.hover = h; canvas.style.cursor = h ? 'pointer' : '';
      }
    }
  });
  const release = (e) => {
    if (e) pointers.delete(e.pointerId);
    if (held) { held.holdEnd(); held = null; }
    if (down && !down.moved && !down.held && performance.now() - down.t < 450) tapAt(down.x, down.y);
    down = null;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { NB.UI.hover = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // follow an entity (cat button): camera glides to it and tracks it until the user drags
  let catIdx = -1;
  function findCat() {
    const cats = NB.Entities.list.filter((e) => e.kind === 'cat').sort((a, b) => (b.a.zoomies ? 1 : 0) - (a.a.zoomies ? 1 : 0));
    if (!cats.length) return;
    catIdx = (catIdx + 1) % cats.length;
    follow = cats[catIdx];
    NB.UI.say(follow, '🐾 ' + follow.name, { life: 2.5 });
  }
  function updateFollow(dt) {
    if (!follow) return;
    if (follow.done) { follow = null; return; }
    const p = I.project(follow.x, 0, follow.z), k = Math.min(1, dt * 3);
    cam.px += (p[0] - cam.px) * k; cam.py += (p[1] - cam.py) * k;
  }

  // ---------- loop ----------
  function frame(dtMs) {
    const dt = NB.clamp(dtMs / 1000, 0, 0.05);
    frameNo++;
    updateFollow(dt); clampCam(); applyCamera();
    updateView();
    NB.Env.update(dt);
    NB.Entities.update(dt);
    NB.UI.update(dt);
    NB.Audio.update(dt, NB.Env);
    updateGround(); updateSky(); updateWeather(dt);
    NB.UI.draw(uctx);
  }

  async function startGame() {
    await app.init({
      canvas, width: window.innerWidth, height: window.innerHeight, antialias: false, resolution: 1, autoDensity: false,
      background: SKY.day, preference: 'webgl', preserveDrawingBuffer: !!NB.params.get('nointro'), roundPixels: true,
    });
    app.stage.addChild(world, weatherDim, night, lights, weather, fog);
    resize();
    window.addEventListener('resize', resize);
    applyCamera(); updateView();
    NB.Entities.init();
    NB.UI.initDom({
      centre: () => { follow = null; resetCam(); },
      findCat,
      zoom: (f) => zoomStep(f < 1 ? 1 : -1),
    });
    app.ticker.maxFPS = 60;
    app.ticker.add((t) => { try { frame(t.deltaMS); } catch (e) { showError('Fehler: ' + e.message + '\n' + e.stack); app.ticker.stop(); } });
  }
  startGame().catch((e) => showError('Fehler: ' + e.message + '\n' + e.stack));
})(window.NB);
