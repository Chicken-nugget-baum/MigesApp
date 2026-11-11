// 3D renderer (three.js): scene setup, smooth streets, day/night lighting, weather, camera controls, picking, game loop.
(function (NB) {
  const THREE = window.THREE, map = NB.map, S = NB.Scene;
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

  // ---------- renderer, scene, camera ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!NB.params.get('nointro') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = (NB.world3d = new THREE.Scene());
  const camera = (NB.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2500));
  const controls = new THREE.MapControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.screenSpacePanning = false;
  controls.minDistance = 8; controls.maxDistance = 420;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.22;
  controls.zoomToCursor = true;
  const start = NB.params.get('at') ? NB.params.get('at').split(',').map(Number) : [map.start.x, map.start.z];
  const startDist = parseFloat(NB.params.get('dist')) || 55;
  function resetCam() {
    controls.target.set(start[0], 0, start[1]);
    camera.position.set(start[0] + startDist * 0.35, startDist * 0.75, start[1] + startDist * 0.62);
    controls.update();
  }
  resetCam();

  // ---------- seasonal colours ----------
  const GRASS = { spring: '#86d79a', summer: '#7dcf8e', autumn: '#a8cf84', winter: '#eef3f8' }[NB.season] || '#7dcf8e';
  const ASPHALT = NB.season === 'winter' ? '#c9c6d2' : '#a19dae';
  const WALK = NB.season === 'winter' ? '#f4f1ec' : '#eadfcb';

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#d8eeff', '#7fbf8f', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);

  // ---------- static batching: merge all meshes under `root` per material (fewer draw calls) ----------
  function bake(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const key = o.material.uuid + (o.castShadow ? 's' : '');
      if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, parts: [] });
      groups.get(key).parts.push(o);
    });
    const ud = root.userData;
    const merged = [];
    const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3();
    for (const { mat, cast, parts } of groups.values()) {
      let n = 0;
      const geos = parts.map((o) => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry; n += g.attributes.position.count; return [o, g]; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let k = 0;
      for (const [o, g] of geos) {
        m4.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(m4);
        const p = g.attributes.position, q = g.attributes.normal;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++, k++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m4); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
          if (q) { v.fromBufferAttribute(q, i).applyMatrix3(nm).normalize(); nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z; }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.userData = ud;
      merged.push(mesh);
    }
    root.clear();
    merged.forEach((m) => root.add(m));
    return root;
  }

  // ---------- ground ----------
  const [bx0, bz0, bx1, bz1] = S.bounds;
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0 + 1400, bz1 - bz0 + 1400), new THREE.MeshStandardMaterial({ color: GRASS, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); ground.receiveShadow = true;
  scene.add(ground);

  // ---------- smooth streets ----------
  function ribbon(pts, width, y, color) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const n = Math.max(2, Math.ceil(curve.getLength() / 0.7));
    const sp = curve.getSpacedPoints(n);
    const pos = [], idx = [];
    for (let i = 0; i < sp.length; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      pos.push(sp[i].x - tz * width / 2, y, sp[i].z + tx * width / 2, sp[i].x + tz * width / 2, y, sp[i].z - tx * width / 2);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
    // round caps so street joins look clean
    [sp[0], sp[sp.length - 1]].forEach((p) => {
      const c = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 20), m);
      c.rotation.x = -Math.PI / 2; c.position.set(p.x, y, p.z); c.receiveShadow = true; scene.add(c);
    });
  }
  for (const s of S.streets) ribbon(s.pts, s.width + 2.4, 0.02, WALK);
  for (const s of S.streets) ribbon(s.pts, s.width, 0.045, ASPHALT);

  // ---------- buildings ----------
  const pickables = [];
  const houses = [];
  S.buildings.forEach((spec, i) => {
    const b = map.buildings[spec.id];
    const g = NB.Models.house(spec, i);
    g.traverse((o) => { o.userData.building = b; });
    bake(g); scene.add(g); pickables.push(g);
    b.model = g; b.top = { x: spec.cx, y: g.userData.height + 1, z: spec.cz };
    houses.push({ b, mat: g.userData.windowMat, seed: (i * 0.6180339) % 1 });
  });

  // ---------- trees, bushes ----------
  const rnd = NB.seeded(77);
  const props = new THREE.Group(); scene.add(props);
  const occupied = [];
  const freeSpot = (x, z, streetGap, bGap, treeGap) => map.streetDist(x, z) > streetGap && !map.inBuilding(x, z, bGap) && !occupied.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < treeGap);
  for (let k = 0; k < 900 && occupied.length < 260; k++) {
    const x = NB.lerp(bx0 + 10, bx1 - 10, rnd()), z = NB.lerp(bz0 + 10, bz1 - 10, rnd());
    if (!freeSpot(x, z, 3.5, 3, 6)) continue;
    const t = NB.Models.tree(rnd, rnd() < 0.2 ? 'pine' : 'leaf');
    t.position.set(x, 0, z); t.rotation.y = rnd() * 6.28; props.add(t); occupied.push([x, z]);
  }
  for (let k = 0; k < 700; k++) {
    const x = NB.lerp(bx0 + 10, bx1 - 10, rnd()), z = NB.lerp(bz0 + 10, bz1 - 10, rnd());
    if (!freeSpot(x, z, 1.6, 1.5, 3) || map.streetDist(x, z) > 9) continue;
    const bsh = NB.Models.bush(rnd); bsh.position.set(x, 0, z); bsh.rotation.y = rnd() * 6.28; props.add(bsh); occupied.push([x, z]);
  }

  // ---------- lamps with ground glow ----------
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,214,140,1)'); gr.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const lamps = [];
  for (const s of S.streets) {
    const curve = new THREE.CatmullRomCurve3(s.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const len = curve.getLength();
    for (let d = 12, side = 1; d < len - 4; d += 30, side = -side) {
      const p = curve.getPointAt(d / len), t = curve.getTangentAt(d / len);
      const off = s.width / 2 + 1.4;
      const x = p.x - t.z * off * side, z = p.z + t.x * off * side;
      if (map.inBuilding(x, z, 0.8) || lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 14)) continue;
      const lamp = NB.Models.lamp(); lamp.position.set(x, 0, z); props.add(lamp);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.08, z); scene.add(glow);
      lamps.push({ x, z, head: lamp.userData.headMat, glow });
    }
  }

  // ---------- bus stops, Beiz tables ----------
  for (const st of map.busStops) {
    let best = 0, bd = Infinity;
    map.route.forEach((p, k) => { const d = Math.hypot(p.x - st.x, p.z - st.z); if (d < bd) { bd = d; best = k; } });
    const a = map.route[Math.max(0, best - 1)], b = map.route[Math.min(map.route.length - 1, best + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const p = map.route[best], off = 3 + 2.2;
    const shelter = NB.Models.busStop();
    shelter.position.set(p.x - tz * off, 0, p.z + tx * off);
    shelter.rotation.y = Math.atan2(tz, -tx) + Math.PI / 2;
    shelter.userData.info = { name: 'Bushaltestell «' + st.name + '»', lines: ['Nöchsti Abfahrt: wenn\'s Postauto chunnt. 🚌', 'Linie Mellige – Niederwil – Wohle.'], sound: 'click', top: { x: shelter.position.x, y: 3.6, z: shelter.position.z } };
    shelter.traverse((o) => { o.userData.info = shelter.userData.info; });
    bake(shelter); scene.add(shelter); pickables.push(shelter);
  }
  const beiz = map.buildings.beiz;
  if (beiz) [-1, 1].forEach((s) => {
    const x = beiz.entryPt.x + beiz.doorN[1] * 3 * s + beiz.doorN[0] * 1.5, z = beiz.entryPt.z - beiz.doorN[0] * 3 * s + beiz.doorN[1] * 1.5;
    if (map.streetDist(x, z) > 0.5) { const t = NB.Models.table(); t.position.set(x, 0, z); props.add(t); }
  });

  bake(props);

  // ---------- weather particles ----------
  const PN = 1800;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) { pPos[i * 3] = NB.rr(-50, 50); pPos[i * 3 + 1] = NB.rr(0, 40); pPos[i * 3 + 2] = NB.rr(-50, 50); }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.25, transparent: true, opacity: 0.85, depthWrite: false });
  const particles = new THREE.Points(pGeo, pMat); particles.frustumCulled = false; scene.add(particles);

  // ---------- sky, fog, day/night ----------
  const C = (h) => new THREE.Color(h);
  const SKY = { day: C('#bfe6ff'), dusk: C('#f7b98f'), night: C('#1c2444'), grey: C('#c3cbd3'), fog: C('#dfe5ea') };
  scene.fog = new THREE.Fog(SKY.day.clone(), 300, 900);
  scene.background = SKY.day.clone();
  const tmp = new THREE.Color();
  function updateSky() {
    const d = NB.Env.darkness, w = NB.Env.weather;
    const dusk = d > 0 && d < 0.75 ? 1 - Math.abs(d - 0.35) / 0.4 : 0;
    tmp.copy(SKY.day);
    if (w === 'cloudy' || w === 'rain' || w === 'snow') tmp.lerp(SKY.grey, 0.7);
    if (w === 'fog') tmp.copy(SKY.fog);
    tmp.lerp(SKY.dusk, Math.max(0, dusk) * 0.6).lerp(SKY.night, Math.min(1, d * 1.1) * (w === 'fog' ? 0.85 : 1));
    scene.background.copy(tmp); scene.fog.color.copy(tmp);
    const dist = camera.position.distanceTo(controls.target);
    if (w === 'fog') { scene.fog.near = 15; scene.fog.far = 160; }
    else { scene.fog.near = dist + 120; scene.fog.far = dist + 700; }
    // sun / moon
    const dim = { clear: 1, cloudy: 0.55, rain: 0.4, fog: 0.5, snow: 0.55 }[w] || 1;
    const a = Math.PI * (0.1 + 0.8 * NB.Env.sun);
    const T = controls.target;
    sun.position.set(T.x - Math.cos(a) * 90, 60 + Math.sin(a) * 120, T.z + 45);
    sun.target.position.copy(T);
    sun.intensity = (1 - d) * 2.4 * dim + d * 0.35;
    sun.shadow.intensity = NB.clamp(dim * 1.2 - d * 0.5, 0.25, 1);
    sun.color.set(d > 0.6 ? '#9fb4ff' : dusk > 0.3 ? '#ffc58f' : '#fff1d6');
    hemi.intensity = 1.25 * (1 - d * 0.7) * (0.75 + dim * 0.25);
    hemi.color.set(d > 0.6 ? '#6f80b8' : '#d8eeff');
    hemi.groundColor.set(d > 0.6 ? '#2a3a40' : '#7fbf8f');
    // shadow area follows the camera
    const half = NB.clamp(dist * 0.9, 40, 170);
    const sc = sun.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 420; sc.updateProjectionMatrix(); }
    // windows, lamps
    for (const h of houses) if (h.mat) h.mat.emissiveIntensity = NB.Env.windowLit(h.b, h.seed) ? 1.4 * d : 0;
    const on = d > 0.25;
    for (const l of lamps) { l.head.emissiveIntensity = on ? 2.2 : 0; l.glow.material.opacity = on ? d * 0.75 : 0; }
  }
  function updateWeather(dt) {
    const w = NB.Env.weather, T = controls.target;
    particles.visible = w === 'rain' || w === 'snow';
    if (!particles.visible) return;
    const rain = w === 'rain';
    pMat.size = rain ? 0.2 : 0.3; pMat.color.set(rain ? '#cfe0f5' : '#ffffff');
    particles.position.set(T.x, 0, T.z);
    const t = performance.now() / 1000;
    for (let i = 0; i < PN; i++) {
      pPos[i * 3 + 1] -= (rain ? 22 : 2.2) * dt;
      if (!rain) pPos[i * 3] += Math.sin(t + i) * 0.4 * dt;
      if (pPos[i * 3 + 1] < 0) { pPos[i * 3 + 1] = 40; pPos[i * 3] = NB.rr(-50, 50); pPos[i * 3 + 2] = NB.rr(-50, 50); }
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  // ---------- projection for the 2D overlay ----------
  const v3 = new THREE.Vector3();
  let W = 1, H = 1;
  NB.project = (x, y, z) => {
    v3.set(x, y, z).project(camera);
    if (v3.z > 1 || v3.z < -1) return null;
    return [((v3.x + 1) / 2) * W, ((1 - v3.y) / 2) * H];
  };
  function updateView() {
    const T = controls.target, dist = camera.position.distanceTo(T);
    NB.view = { w: W, h: H, cx: T.x, cy: T.z, halfW: dist * 0.6, dist };
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    uiCanvas.width = W * dpr; uiCanvas.height = H * dpr; uiCanvas.style.width = W + 'px'; uiCanvas.style.height = H + 'px';
    uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(sx, sy) {
    ndc.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const ents = NB.Entities.list.filter((e) => e.visible && e.model).map((e) => e.model);
    const hits = ray.intersectObjects(ents.concat(pickables), true);
    for (const h of hits) {
      const u = h.object.userData;
      if (u.entity) return { owner: u.entity, name: u.entity.name, entity: u.entity };
      if (u.building) return { owner: u.building.top, name: u.building.name, building: u.building };
      if (u.info) return { owner: u.info.top, name: u.info.name, info: u.info };
    }
    // forgiving: nearest entity on screen within 30 px
    let best = null, bd = 30;
    for (const e of NB.Entities.list) {
      if (!e.visible || !e.top) continue;
      const t = e.top(), p = NB.project(t.x, t.y * 0.5, t.z);
      if (!p) continue;
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
  // tap = short press without moving; hold (450 ms) on a cat = purr
  let down = null, held = null;
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    down = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), moved: false, held: false };
    const d = down;
    setTimeout(() => {
      if (down !== d || d.moved) return;
      const h = pick(d.x, d.y);
      if (h && h.entity && h.entity.holdStart) { NB.Audio.unlock(); h.entity.holdStart(); held = h.entity; d.held = true; controls.enabled = false; }
    }, 450);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (down && Math.hypot(x - down.x, y - down.y) > 6) { down.moved = true; follow = null; }
    if (e.pointerType === 'mouse' && !e.buttons) {
      const now = performance.now();
      if (!canvas._lastHover || now - canvas._lastHover > 70) {
        canvas._lastHover = now;
        const h = pick(x, y);
        NB.UI.hover = h; canvas.style.cursor = h ? 'pointer' : '';
      }
    }
  });
  const release = () => {
    if (held) { held.holdEnd(); held = null; controls.enabled = true; }
    if (down && !down.moved && !down.held && performance.now() - down.t < 450) tapAt(down.x, down.y);
    down = null;
  };
  window.addEventListener('pointerup', release);
  canvas.addEventListener('pointerleave', () => { NB.UI.hover = null; });

  // follow an entity (cat button): camera glides to it and tracks it until the user drags
  let follow = null, catIdx = -1;
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
    const T = controls.target, k = Math.min(1, dt * 3);
    const dx = (follow.x - T.x) * k, dz = (follow.z - T.z) * k;
    T.x += dx; T.z += dz; camera.position.x += dx; camera.position.z += dz;
    const off = camera.position.clone().sub(T), len = off.length();
    if (len > 24) camera.position.copy(T).add(off.setLength(len + (24 - len) * k));
  }

  // keep the camera over the village
  function clampTarget() {
    const T = controls.target, before = T.clone();
    T.x = NB.clamp(T.x, bx0, bx1); T.z = NB.clamp(T.z, bz0, bz1);
    camera.position.add(T.clone().sub(before));
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = NB.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    updateFollow(dt); controls.update(); clampTarget();
    updateView();
    NB.Env.update(dt);
    NB.Entities.update(dt);
    NB.UI.update(dt);
    NB.Audio.update(dt, NB.Env);
    updateSky(); updateWeather(dt);
    renderer.render(scene, camera);
    NB.UI.draw(uctx);
    requestAnimationFrame(frame);
  }

  function startGame() {
    resize();
    window.addEventListener('resize', resize);
    updateView();
    NB.Entities.init();
    NB.UI.initDom({
      centre: () => { follow = null; resetCam(); },
      findCat,
      zoom: (f) => {
        const T = controls.target, off = camera.position.clone().sub(T);
        const len = NB.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
        camera.position.copy(T).add(off.setLength(len));
      },
    });
    requestAnimationFrame(frame);
  }
  try { startGame(); } catch (e) { showError('Fehler: ' + e.message + '\n' + e.stack); }
})(window.NB);
