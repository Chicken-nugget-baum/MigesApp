// Low-poly 3D models (three.js). Everything faces +z ("south") by default. Units: metres.
(function (NB) {
  const THREE = window.THREE;
  const M = (NB.Models = {});
  const SEASON = NB.season;

  // ---------- materials (cached by colour) ----------
  const mats = {};
  const mat = (color, opts) => {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0, flatShading: true }, opts));
    return mats[key];
  };
  M.mat = mat;
  function mesh(geo, material, shadow) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow !== false; m.receiveShadow = true;
    return m;
  }
  const box = (w, h, d, color) => mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color) : color);
  M.box = box;

  // ---------- palettes ----------
  const WALLS = ['#f6ead2', '#f3e2cf', '#fbf5ea', '#efe3c6', '#f6dfd2', '#e9e4da', '#f4ecd9', '#dfe9e4'];
  const ROOFS = ['#c8644a', '#b05440', '#d27a52', '#8a5a48', '#9b4f3e', '#6f7486', '#c66b4e'];
  const DOORS = ['#e05a6e', '#4f8fd6', '#5bb07a', '#e8a33a', '#9a6ad0', '#a8673a'];
  const SHUTTERS = ['#4f9a6a', '#c0503f', '#4f7fbf', '#4f9a6a', null];
  const LEAF = {
    spring: ['#7ccf8a', '#5dbb73', '#ffb3c8'], summer: ['#5fbf75', '#4aa862', '#7fd38e'],
    autumn: ['#f0a24c', '#e07b3c', '#f7c46a'], winter: ['#e8eef4', '#dfe8f0', '#ffffff'],
  }[SEASON] || ['#5fbf75', '#4aa862', '#7fd38e'];
  M.leaf = LEAF;

  // gable roof as a triangular prism, ridge along x
  function gableRoof(w, d, h, color) {
    const g = new THREE.BufferGeometry();
    const x = w / 2, z = d / 2;
    const v = [
      -x, 0, -z, x, 0, -z, x, h, 0, -x, h, 0, // back slope
      -x, 0, z, -x, h, 0, x, h, 0, x, 0, z, // front slope
      -x, 0, -z, -x, h, 0, -x, 0, z, // left gable
      x, 0, -z, x, 0, z, x, h, 0, // right gable
      -x, 0, -z, -x, 0, z, x, 0, z, x, 0, -z, // bottom
    ];
    const idx = [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12, 14, 15, 16, 14, 16, 17];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return mesh(g, mat(color));
  }
  // hipped roof (pyramid-ish), ridge along x
  function hipRoof(w, d, h, color) {
    const g = new THREE.BufferGeometry();
    const x = w / 2, z = d / 2, r = Math.max(0, x - z);
    const v = [-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z, -r, h, 0, r, h, 0];
    const idx = [0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0, 0, 1, 2, 0, 2, 3];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return mesh(g, mat(color));
  }

  // ---------- houses ----------
  // b: { cx, cz, w, d, angle, levels, kind, roof, doorN, seed }
  M.house = function (b, i) {
    const grp = new THREE.Group();
    const floorH = 2.9, small = b.kind === 'garage';
    const H = small ? 2.8 : b.levels * floorH + 0.6;
    const wall = b.kind === 'chapel' ? '#fbf8f2' : small ? '#d9d2c6' : WALLS[i % WALLS.length];
    const roofCol = SEASON === 'winter' ? (i % 3 ? '#f4f7fb' : '#e9eef5') : b.kind === 'chapel' ? '#6f7486' : small ? '#8a8f9c' : ROOFS[(i * 3) % ROOFS.length];
    const w = Math.max(3, b.w), d = Math.max(3, b.d);
    // body + stone base
    const body = box(w, H, d, wall); body.position.y = H / 2; grp.add(body);
    if (!small) { const base = box(w + 0.08, 0.7, d + 0.08, '#b9b0a6'); base.position.y = 0.35; grp.add(base); }
    // roof
    const over = small ? 0.2 : 0.6;
    const rh = small ? 0.6 : b.kind === 'chapel' ? d * 0.75 : Math.min(5.5, d * 0.42);
    const roof = small && b.roof !== 'gabled' ? box(w + 0.3, 0.3, d + 0.3, roofCol)
      : b.roof === 'hipped' ? hipRoof(w + over * 2, d + over * 2, rh, roofCol) : gableRoof(w + over * 2, d + over * 2, rh, roofCol);
    roof.position.y = H + (small && b.roof !== 'gabled' ? 0.15 : 0);
    grp.add(roof);
    // chimney
    if (!small && b.kind === 'house' && i % 3 !== 2) { const c = box(0.7, 1.6, 0.7, '#a8604c'); c.position.set(w * 0.25, H + rh * 0.55, -d * 0.15); grp.add(c); }

    // windows (shared per-house material so they can light up at night)
    const winMat = new THREE.MeshStandardMaterial({ color: '#6aa4d8', roughness: 0.4, emissive: '#ffcf7a', emissiveIntensity: 0 });
    grp.userData.windowMat = winMat;
    const frame = mat('#ffffff');
    const shutter = SHUTTERS[i % SHUTTERS.length];
    const addWindow = (x, y, z, rotY) => {
      const f = box(1.15, 1.35, 0.08, frame); f.castShadow = false;
      const gl = mesh(new THREE.BoxGeometry(0.9, 1.1, 0.1), winMat, false);
      const wg = new THREE.Group(); wg.add(f); wg.add(gl);
      if (shutter && !small) { const sl = box(0.35, 1.35, 0.08, shutter), sr = sl.clone(); sl.position.x = -0.8; sr.position.x = 0.8; wg.add(sl, sr); }
      if (!small && y < 2.5 && SEASON !== 'winter') {
        const bx = box(1.2, 0.25, 0.3, '#a8673a'); bx.position.set(0, -0.8, 0.15); wg.add(bx);
        const fl = box(1.1, 0.18, 0.22, ['#ff7aa8', '#ffffff', '#ffd23f', '#ff5d73'][i % 4]); fl.position.set(0, -0.62, 0.15); wg.add(fl);
      }
      wg.position.set(x, y, z); wg.rotation.y = rotY; grp.add(wg);
    };
    if (!small) {
      const nW = Math.max(1, Math.floor((w - 1.5) / 3)), nD = Math.max(1, Math.floor((d - 1.5) / 3.2));
      const levels = b.kind === 'chapel' ? 1 : b.levels;
      for (let lv = 0; lv < levels; lv++) {
        const y = (b.kind === 'chapel' ? 2.6 : 1.7 + lv * floorH);
        for (let k = 0; k < nW; k++) {
          const x = -w / 2 + ((k + 0.5) * w) / nW;
          addWindow(x, y, d / 2 + 0.05, 0); addWindow(x, y, -d / 2 - 0.05, Math.PI);
        }
        for (let k = 0; k < nD; k++) {
          const z = -d / 2 + ((k + 0.5) * d) / nD;
          addWindow(w / 2 + 0.05, y, z, Math.PI / 2); addWindow(-w / 2 - 0.05, y, z, -Math.PI / 2);
        }
      }
    }
    // door on the side facing the street (doorN is in world space -> convert to local)
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    const ln = [b.doorN[0] * ca + b.doorN[1] * sa, -b.doorN[0] * sa + b.doorN[1] * ca]; // world -> local (rotation by -angle)
    const along = Math.abs(ln[0]) > Math.abs(ln[1]);
    const dg = new THREE.Group();
    const doorCol = small ? '#e4e0d8' : b.kind === 'chapel' ? '#7a4a2a' : DOORS[i % DOORS.length];
    const dw = small ? Math.min(2.6, (along ? d : w) - 0.6) : 1.1, dh = small ? 2.2 : 2.1;
    const door = box(dw, dh, 0.12, doorCol); door.position.y = dh / 2;
    dg.add(door);
    if (!small) { const step = box(1.6, 0.18, 0.6, '#c9c0b6'); step.position.set(0, 0.09, 0.3); dg.add(step); const knob = box(0.1, 0.1, 0.1, '#f2c23a'); knob.position.set(0.35, 1.05, 0.08); dg.add(knob); }
    if (along) { dg.position.set(Math.sign(ln[0]) * (w / 2 + 0.06), 0, 0); dg.rotation.y = Math.sign(ln[0]) * Math.PI / 2; }
    else { dg.position.set(0, 0, Math.sign(ln[1]) * (d / 2 + 0.06)); dg.rotation.y = ln[1] > 0 ? 0 : Math.PI; }
    grp.add(dg);

    // chapel: bell tower with spire and cross on the street-facing end
    if (b.kind === 'chapel') {
      const tw = 2.4, th = H + rh + 2.5;
      const tower = box(tw, th, tw, '#fbf8f2'); tower.position.set(-w / 2 + tw / 2 + 0.2, th / 2, 0); grp.add(tower);
      const bellWin = box(tw + 0.05, 0.9, 0.6, '#3a3a48'); bellWin.position.set(tower.position.x, th - 1, 0); grp.add(bellWin);
      const spire = mesh(new THREE.ConeGeometry(tw * 0.78, 3.6, 4), mat('#5b6070')); spire.rotation.y = Math.PI / 4; spire.position.set(tower.position.x, th + 1.8, 0); grp.add(spire);
      const c1 = box(0.12, 1.1, 0.12, '#e8c547'), c2 = box(0.6, 0.12, 0.12, '#e8c547');
      c1.position.set(tower.position.x, th + 4.1, 0); c2.position.set(tower.position.x, th + 4.2, 0); grp.add(c1, c2);
      grp.userData.bellTop = th + 1;
    }
    // Beiz: sign above the door
    if (b.kind === 'beiz') {
      const sign = box(1.8, 0.7, 0.12, '#c0392b'); sign.position.y = 3; sign.position.z = 0.1; dg.add(sign);
      const txt = box(1.4, 0.15, 0.14, '#fff6dc'); txt.position.set(0, 3, 0.12); dg.add(txt);
    }
    grp.position.set(b.cx, 0, b.cz);
    grp.rotation.y = -b.angle;
    grp.userData.height = H + rh;
    return grp;
  };

  // ---------- nature ----------
  M.tree = function (rnd, kind) {
    const g = new THREE.Group();
    if (kind === 'pine') {
      const t = box(0.35, 1.2, 0.35, '#7a5236'); t.position.y = 0.6; g.add(t);
      const col = SEASON === 'winter' ? '#3d8a66' : '#3f9a6a';
      [[2.2, 2.6, 1.6], [1.7, 2.2, 3.0], [1.1, 1.8, 4.2]].forEach(([r, h, y]) => { const c = mesh(new THREE.ConeGeometry(r, h, 7), mat(col)); c.position.y = y; g.add(c); });
      if (SEASON === 'winter') { const s = mesh(new THREE.ConeGeometry(0.8, 1, 7), mat('#ffffff')); s.position.y = 5; g.add(s); }
    } else {
      const h = 1.6 + rnd() * 0.8;
      const t = mesh(new THREE.CylinderGeometry(0.22, 0.32, h, 6), mat('#8a5a3a')); t.position.y = h / 2; g.add(t);
      const blossom = SEASON === 'spring' && rnd() < 0.3;
      const cols = blossom ? ['#ffb3c8', '#f7a1bb', '#ffd0dd'] : LEAF;
      const n = 3 + ((rnd() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const r = 1.1 + rnd() * 0.7;
        const s = mesh(new THREE.IcosahedronGeometry(r, 0), mat(cols[k % cols.length]));
        s.position.set((rnd() - 0.5) * 1.6, h + 0.9 + rnd() * 1.1, (rnd() - 0.5) * 1.6);
        s.rotation.set(rnd() * 3, rnd() * 3, 0);
        g.add(s);
      }
    }
    const sc = 0.85 + rnd() * 0.4;
    g.scale.set(sc, sc, sc);
    return g;
  };
  M.bush = function (rnd) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = mesh(new THREE.IcosahedronGeometry(0.55 + rnd() * 0.3, 0), mat(LEAF[k % 2]));
      s.position.set((k - 1) * 0.6, 0.45, (rnd() - 0.5) * 0.4); g.add(s);
    }
    if (SEASON !== 'winter' && SEASON !== 'autumn' && rnd() < 0.7) {
      const fc = ['#ff7aa8', '#ffffff', '#ffd23f', '#c9b4ff'][(rnd() * 4) | 0];
      for (let k = 0; k < 4; k++) { const f = box(0.14, 0.14, 0.14, fc); f.castShadow = false; f.position.set((rnd() - 0.5) * 1.6, 0.85 + rnd() * 0.2, (rnd() - 0.5) * 0.6); g.add(f); }
    }
    return g;
  };
  M.lamp = function () {
    const g = new THREE.Group();
    const p = mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), mat('#4a3f45')); p.position.y = 2; g.add(p);
    const headMat = new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffd27a', emissiveIntensity: 0, flatShading: true });
    const head = mesh(new THREE.BoxGeometry(0.45, 0.35, 0.45), headMat, false); head.position.y = 4.1; g.add(head);
    const cap = box(0.6, 0.12, 0.6, '#4a3f45'); cap.position.y = 4.33; g.add(cap);
    g.userData.headMat = headMat;
    return g;
  };
  M.busStop = function () {
    const g = new THREE.Group();
    const roof = box(3, 0.15, 1.4, '#55606e'); roof.position.y = 2.5; g.add(roof);
    [[-1.4, -0.6], [1.4, -0.6]].forEach(([x, z]) => { const p = box(0.1, 2.5, 0.1, '#55606e'); p.position.set(x, 1.25, z); g.add(p); });
    const glass = mesh(new THREE.BoxGeometry(2.8, 2.2, 0.05), new THREE.MeshStandardMaterial({ color: '#bfe3f5', transparent: true, opacity: 0.45 }), false);
    glass.position.set(0, 1.3, -0.65); g.add(glass);
    const bench = box(2, 0.12, 0.45, '#a8673a'); bench.position.set(0, 0.5, -0.35); g.add(bench);
    const pole = box(0.08, 2.8, 0.08, '#55606e'); pole.position.set(1.9, 1.4, 0.3); g.add(pole);
    const sign = box(0.6, 0.6, 0.06, '#ffd200'); sign.position.set(1.9, 2.8, 0.3); g.add(sign);
    const h = box(0.35, 0.35, 0.08, '#2d7a3c'); h.position.set(1.9, 2.8, 0.31); g.add(h);
    return g;
  };
  M.table = function () {
    const g = new THREE.Group();
    const top = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 10), mat('#a8673a')); top.position.y = 0.8; g.add(top);
    const leg = box(0.1, 0.8, 0.1, '#6a4a32'); leg.position.y = 0.4; g.add(leg);
    const pole = box(0.06, 2.4, 0.06, '#e9e4da'); pole.position.y = 1.2; g.add(pole);
    const um = mesh(new THREE.ConeGeometry(1.4, 0.6, 8), mat('#d94a4a')); um.position.y = 2.4; g.add(um);
    return g;
  };

  // ---------- people (chibi) ----------
  M.person = function (L) {
    L = Object.assign({ skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'short', shirt: '#3a7bd5', pants: '#3a3f55', shoes: '#2a2a2a' }, L);
    const g = new THREE.Group(), parts = {};
    const legGeo = new THREE.BoxGeometry(0.22, 0.6, 0.24);
    const mkLeg = (x) => { const lg = new THREE.Group(); const m = mesh(legGeo, mat(L.dress ? L.legs || L.skin : L.pants)); m.position.y = -0.3; lg.add(m); const sh = box(0.24, 0.12, 0.32, L.shoes); sh.position.set(0, -0.6, 0.04); lg.add(sh); lg.position.set(x, 0.66, 0); g.add(lg); return lg; };
    parts.legL = mkLeg(-0.14); parts.legR = mkLeg(0.14);
    const body = new THREE.Group(); body.position.y = 0.66; g.add(body); parts.body = body;
    const torso = L.dress ? mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.75, 8), mat(L.dress)) : box(0.56, 0.62, 0.36, L.shirt);
    torso.position.y = L.dress ? 0.3 : 0.31; body.add(torso);
    if (L.dress) { const top = box(0.5, 0.3, 0.34, L.shirt); top.position.y = 0.55; body.add(top); }
    if (L.apron) { const ap = box(0.4, 0.55, 0.05, L.apron); ap.position.set(0, 0.32, 0.2); body.add(ap); }
    const armGeo = new THREE.BoxGeometry(0.16, 0.5, 0.18);
    const mkArm = (x) => { const a = new THREE.Group(); const m = mesh(armGeo, mat(L.shirt)); m.position.y = -0.22; a.add(m); const hd = box(0.16, 0.14, 0.16, L.skin); hd.position.y = -0.52; a.add(hd); a.position.set(x, 0.6, 0); body.add(a); return a; };
    parts.armL = mkArm(-0.37); parts.armR = mkArm(0.37);
    // big chibi head
    const head = new THREE.Group(); head.position.y = 0.95; body.add(head); parts.head = head;
    const skull = box(0.72, 0.66, 0.66, L.skin); skull.position.y = 0.33; head.add(skull);
    const eye = (x) => { const e = box(0.09, 0.14, 0.04, '#2b2b3a'); e.castShadow = false; e.position.set(x, 0.32, 0.34); head.add(e); };
    eye(-0.15); eye(0.15);
    const blush = (x) => { const e = box(0.12, 0.06, 0.03, '#f2a0a0'); e.castShadow = false; e.position.set(x, 0.2, 0.335); head.add(e); };
    blush(-0.24); blush(0.24);
    if (L.glasses) { const gl = box(0.56, 0.05, 0.04, '#1e1e28'); gl.position.set(0, 0.36, 0.35); head.add(gl); }
    if (L.beard) { const bd = box(0.6, 0.22, 0.12, L.hair); bd.position.set(0, 0.06, 0.33); head.add(bd); }
    const hair = mat(L.hair);
    const H = (w, h, d, x, y, z, m) => { const b = mesh(new THREE.BoxGeometry(w, h, d), m || hair); b.position.set(x, y, z); head.add(b); return b; };
    switch (L.hairStyle) {
      case 'bald': H(0.74, 0.18, 0.5, 0, 0.25, -0.12); break;
      case 'cap': H(0.78, 0.22, 0.72, 0, 0.72, 0, mat(L.cap || '#d94a4a')); H(0.6, 0.06, 0.3, 0, 0.64, 0.45, mat(L.cap || '#d94a4a')); H(0.76, 0.3, 0.2, 0, 0.45, -0.28); break;
      case 'straw': { const brim = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 10), mat('#e8c860')); brim.position.y = 0.7; head.add(brim); const crown = mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.28, 10), mat('#e8c860')); crown.position.y = 0.85; head.add(crown); break; }
      case 'headscarf': H(0.78, 0.36, 0.72, 0, 0.6, -0.02, mat(L.scarf || '#c0392b')); H(0.3, 0.3, 0.2, 0, 0.25, -0.4, mat(L.scarf || '#c0392b')); break;
      case 'bun': H(0.76, 0.24, 0.7, 0, 0.66, -0.02); H(0.32, 0.3, 0.3, 0, 0.88, -0.2); H(0.76, 0.4, 0.15, 0, 0.42, -0.31); break;
      case 'ponytail': H(0.76, 0.24, 0.7, 0, 0.66, -0.02); H(0.76, 0.4, 0.15, 0, 0.42, -0.31); H(0.2, 0.5, 0.2, 0, 0.3, -0.45); break;
      case 'long': H(0.76, 0.24, 0.7, 0, 0.66, -0.02); H(0.78, 0.85, 0.18, 0, 0.25, -0.3); H(0.12, 0.6, 0.5, -0.38, 0.35, -0.05); H(0.12, 0.6, 0.5, 0.38, 0.35, -0.05); break;
      case 'spiky': H(0.76, 0.2, 0.7, 0, 0.66, -0.02); for (let k = -1; k <= 1; k++) { const c = mesh(new THREE.ConeGeometry(0.14, 0.3, 4), hair); c.position.set(k * 0.22, 0.88, 0); head.add(c); } break;
      default: H(0.76, 0.22, 0.7, 0, 0.66, -0.02); H(0.76, 0.35, 0.15, 0, 0.45, -0.31); H(0.76, 0.12, 0.12, 0, 0.6, 0.3);
    }
    g.userData.parts = parts;
    return g;
  };

  // ---------- cats ----------
  // pattern: tabby | tuxedo | socks | calico | luna (white calico with black/orange patches, banded tail)
  M.cat = function (L) {
    L = Object.assign({ fur: '#e08a3c', dark: '#a85a22', pattern: 'tabby' }, L);
    const g = new THREE.Group(), parts = {};
    const luna = L.pattern === 'luna';
    const WHT = '#f8f4ec', BLK = '#2e2a2c', ORG = '#e0883a';
    const base = luna ? WHT : L.pattern === 'calico' ? WHT : L.fur;
    const body = new THREE.Group(); body.position.y = 0.3; g.add(body); parts.body = body;
    const torso = box(0.32, 0.26, 0.62, base); body.add(torso);
    const belly = box(0.26, 0.06, 0.5, L.pattern === 'tuxedo' || L.pattern === 'socks' || luna ? WHT : base); belly.position.y = -0.11; body.add(belly);
    // patches / stripes on the back
    const patch = (w, d, x, z, c) => { const p = box(w, 0.04, d, c); p.castShadow = false; p.position.set(x, 0.14, z); body.add(p); };
    if (luna) { patch(0.26, 0.2, -0.02, -0.14, BLK); patch(0.24, 0.18, 0.03, 0.08, ORG); patch(0.12, 0.1, 0.1, -0.24, ORG); }
    else if (L.pattern === 'calico') { patch(0.2, 0.2, 0, -0.1, BLK); patch(0.22, 0.2, 0.02, 0.15, ORG); }
    else if (L.pattern === 'tabby') for (let k = -2; k <= 2; k++) patch(0.33, 0.05, 0, k * 0.11, L.dark);
    // legs
    const legCol = L.pattern === 'tuxedo' || L.pattern === 'socks' || luna || L.pattern === 'calico' ? WHT : base;
    parts.legs = [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.2], [0.1, -0.2]].map(([x, z]) => { const lg = box(0.08, 0.2, 0.08, legCol); lg.position.set(x, 0.1, z); g.add(lg); return lg; });
    // head
    const head = new THREE.Group(); head.position.set(0, 0.2, 0.36); body.add(head); parts.head = head;
    const sk = box(0.3, 0.26, 0.26, luna || L.pattern === 'calico' ? WHT : base); head.add(sk);
    if (luna) {
      // black patch over one eye, orange over the other, white blaze + muzzle (like the photo)
      const hp = (w, h, x, y, c) => { const p = box(w, h, 0.03, c); p.castShadow = false; p.position.set(x, y, 0.135); head.add(p); };
      hp(0.12, 0.14, -0.08, 0.04, BLK); hp(0.11, 0.13, 0.09, 0.05, ORG);
      const cap1 = box(0.15, 0.04, 0.24, BLK); cap1.position.set(-0.075, 0.14, -0.01); head.add(cap1);
      const cap2 = box(0.15, 0.04, 0.24, ORG); cap2.position.set(0.075, 0.14, -0.01); head.add(cap2);
    }
    const earCol = (x) => (luna ? (x < 0 ? BLK : ORG) : L.pattern === 'tuxedo' ? '#2b2b2b' : base);
    [-0.09, 0.09].forEach((x) => { const e = mesh(new THREE.ConeGeometry(0.06, 0.13, 4), mat(earCol(x))); e.position.set(x, 0.18, -0.02); head.add(e); });
    const eyeCol = luna ? '#c9cf3a' : '#c8e04a';
    [-0.07, 0.07].forEach((x) => { const e = box(0.06, 0.06, 0.03, eyeCol); e.castShadow = false; e.position.set(x, 0.03, 0.14); head.add(e); const p = box(0.025, 0.05, 0.035, '#1a1a1a'); p.position.set(x, 0.03, 0.145); head.add(p); });
    const nose = box(0.05, 0.035, 0.03, '#f2a0b0'); nose.position.set(0, -0.04, 0.145); head.add(nose);
    // tail (segments, banded for Luna)
    const tail = new THREE.Group(); tail.position.set(0, 0.08, -0.3); body.add(tail); parts.tail = tail;
    for (let k = 0; k < 4; k++) {
      const c = luna ? (k % 2 ? BLK : ORG) : L.pattern === 'tabby' && k % 2 ? L.dark : L.pattern === 'calico' ? (k % 2 ? BLK : ORG) : base;
      const s = box(0.07, 0.07, 0.12, c); s.position.set(0, k * 0.07, -k * 0.09); tail.add(s);
    }
    g.userData.parts = parts;
    g.scale.setScalar(1.7); // a bit bigger than life so they're easy to find and click
    return g;
  };

  // ---------- vehicles ----------
  const wheel = (x, z) => { const w = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), mat('#2a2a2e')); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); return w; };
  M.bus = function () {
    const g = new THREE.Group();
    const b = box(2.5, 2.6, 10, '#ffcc00'); b.position.y = 1.7; g.add(b);
    const stripe = box(2.52, 0.25, 10.02, '#d9302a'); stripe.position.y = 0.75; g.add(stripe);
    const win = box(2.54, 0.9, 8.6, '#2b3d55'); win.position.set(0, 2.25, -0.4); g.add(win);
    const ws = box(2.3, 1.2, 0.08, '#2b3d55'); ws.position.set(0, 2.1, 5.01); g.add(ws);
    const roof = box(2.3, 0.2, 9.6, '#f2f2ea'); roof.position.y = 3.05; g.add(roof);
    [[-1.2, 3.3], [1.2, 3.3], [-1.2, -3.3], [1.2, -3.3]].forEach(([x, z]) => g.add(wheel(x, z)));
    [-0.8, 0.8].forEach((x) => { const l = box(0.4, 0.2, 0.05, '#fff8c0'); l.position.set(x, 0.9, 5.02); g.add(l); });
    return g;
  };
  M.car = function (color) {
    const g = new THREE.Group();
    const b = box(1.8, 0.8, 4, color); b.position.y = 0.75; g.add(b);
    const cab = box(1.6, 0.7, 2.1, color); cab.position.set(0, 1.5, -0.2); g.add(cab);
    const gl = box(1.62, 0.5, 2.0, '#2b3d55'); gl.position.set(0, 1.5, -0.2); g.add(gl);
    [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]].forEach(([x, z]) => g.add(wheel(x, z)));
    [-0.55, 0.55].forEach((x) => { const l = box(0.35, 0.15, 0.05, '#fff8c0'); l.position.set(x, 0.85, 2.01); g.add(l); });
    return g;
  };
})(window.NB);
