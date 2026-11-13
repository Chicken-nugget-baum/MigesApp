// Isometric pixel-art models. Buildings, lamps, shelters and vehicles are box models rendered by NB.Iso
// (crisp iso faces + outlines); trees, people and cats are hand-drawn pixel sprites (billboards).
// Every model returns a sprite record { tex, w, h, ox, oy, mask, light? } - (ox, oy) is the ground anchor pixel.
(function (NB) {
  const I = NB.Iso, M = (NB.Models = {}), SEASON = NB.season;

  // ---------- palettes ----------
  const WALLS = ['#f6ead2', '#f3e2cf', '#fbf5ea', '#efe3c6', '#f6dfd2', '#e9e4da', '#f4ecd9', '#dfe9e4'];
  const ROOFS = ['#c8644a', '#b05440', '#d27a52', '#8a5a48', '#9b4f3e', '#6f7486', '#c66b4e'];
  const DOORS = ['#e05a6e', '#4f8fd6', '#5bb07a', '#e8a33a', '#9a6ad0', '#a8673a'];
  const SHUTTERS = ['#4f9a6a', '#c0503f', '#4f7fbf', '#4f9a6a', null];
  const FLOWERS = ['#ff7aa8', '#ffffff', '#ffd23f', '#ff5d73'];
  const PAL = {
    spring: { leaf: ['#5fae4a', '#468f37', '#86cc66'], pine: ['#2f6b3a', '#245a2f', '#3f8048'], blossom: ['#ffb3c8', '#f7a1bb', '#ffd0dd'], snow: false },
    summer: { leaf: ['#4f9a3c', '#3c7f2e', '#6cb34f'], pine: ['#2f6b3a', '#245a2f', '#3f8048'], snow: false },
    autumn: { leaf: ['#d9822b', '#b85a1f', '#eab046'], pine: ['#2f6b3a', '#245a2f', '#3f8048'], snow: false },
    winter: { leaf: ['#e3ebf2', '#c3d1de', '#ffffff'], pine: ['#2d5f3c', '#22502f', '#3a7348'], snow: true },
  };
  const P = (M.pal = PAL[SEASON] || PAL.summer);
  const WINDOW_LIGHT = '#ffd27a';

  // ---------- houses ----------
  // b: snapped building spec { cx, cz, w (along u), d (along v), parts [{u, v, w, d, type?}] in the iso frame,
  //    levels, kind (house|garage|barn|farmhouse|chapel|beiz), roofColor (from the aerial photo), oneRoof,
  //    face ('u'|'v' = the visible face with the door), doorUV [u, v] }
  M.house = function (b, i) {
    const m = I.model();
    const small = b.kind === 'garage', chapel = b.kind === 'chapel', barnKind = b.kind === 'barn', dairy = b.kind === 'dairy';
    const homey = b.kind === 'house' || b.kind === 'farmhouse';
    const floorH = 2.8;
    const H = small ? 2.6 : barnKind ? 4.8 : chapel ? 5.5 : dairy ? Math.max(4.8, b.levels * floorH + 0.9) : b.levels * floorH + 0.4;
    const wall = chapel ? '#fbf8f2' : small ? '#d9d2c6' : barnKind ? '#c99a6b' : dairy ? '#f6f3ec' : WALLS[i % WALLS.length];
    const WOOD = '#b07a4a', PLANK = '#8f5f36';
    const roofCol = P.snow ? (i % 3 ? '#f4f7fb' : '#e9eef5') : b.roofColor || (chapel ? '#6f7486' : ROOFS[(i * 3) % ROOFS.length]);
    const parts = (b.parts && b.parts.length ? b.parts : [{ u: 0, v: 0, w: b.w, d: b.d }]).map((p) => ({ ...p, w: Math.max(1.5, p.w), d: Math.max(1.5, p.d) }));
    const insideOther = (self, u, v) => parts.some((p) => p !== self && Math.abs(u - p.u) < p.w / 2 && Math.abs(v - p.v) < p.d / 2);
    const shutter = SHUTTERS[i % SHUTTERS.length];
    const flower = FLOWERS[i % FLOWERS.length];
    // a box sticking out of the +u face (at u = fu) or the +v face (at v = fv), centred at `p` along the face
    const onFace = (axis, f, p, off, across, y, dep, len, h, col, o) =>
      axis === 'u' ? m.box(f + off, p + across - len / 2, y, dep, len, h, col, o) : m.box(p + across - len / 2, f + off, y, len, dep, h, col, o);
    const addWindow = (axis, f, p, yc, ground) => {
      onFace(axis, f, p, 0, 0, yc - 0.675, 0.08, 1.15, 1.35, '#ffffff');
      onFace(axis, f, p, 0.02, 0, yc - 0.55, 0.1, 0.9, 1.1, '#6aa4d8', { light: WINDOW_LIGHT, noOutline: true });
      if (shutter && homey) { onFace(axis, f, p, 0, -0.8, yc - 0.675, 0.08, 0.35, 1.35, shutter); onFace(axis, f, p, 0, 0.8, yc - 0.675, 0.08, 0.35, 1.35, shutter); }
      if (homey && ground && !P.snow && i % 2 === 0) { onFace(axis, f, p, 0, 0, yc - 0.95, 0.3, 1.2, 0.25, '#a8673a'); onFace(axis, f, p, 0.06, 0, yc - 0.72, 0.22, 1.1, 0.18, flower, { noOutline: true }); }
    };
    const doorAxis = b.face || 'v';
    const [du, dv] = b.doorUV || [0, b.d / 2];
    const doorF = doorAxis === 'u' ? du : dv, doorP = doorAxis === 'u' ? dv : du;
    let top = H;

    // bodies + roofs, one per block
    for (const p of parts) {
      const barn = p.type === 'barn';
      const u0 = p.u - p.w / 2, v0 = p.v - p.d / 2;
      const rh = chapel ? Math.min(p.w, p.d) * 0.7 : small ? Math.min(1.2, Math.min(p.w, p.d) * 0.3) : Math.min(5, Math.min(p.w, p.d) * 0.42);
      m.shadow(u0, v0, p.w, p.d, H + rh * 0.5);
      m.box(u0, v0, 0, p.w, p.d, H, barn ? WOOD : wall);
      if (barn) { // vertical planks on the visible faces
        for (let t = 0.6; t < p.d; t += 1.2) if (!insideOther(p, p.u + p.w / 2 + 0.2, v0 + t)) m.box(p.u + p.w / 2, v0 + t - 0.05, 0.1, 0.05, 0.1, H - 0.2, PLANK, { noOutline: true });
        for (let t = 0.6; t < p.w; t += 1.2) if (!insideOther(p, u0 + t, p.v + p.d / 2 + 0.2)) m.box(u0 + t - 0.05, p.v + p.d / 2, 0.1, 0.1, 0.05, H - 0.2, PLANK, { noOutline: true });
      } else if (homey || b.kind === 'beiz' || dairy) m.box(u0 - 0.08, v0 - 0.08, 0, p.w + 0.16, p.d + 0.16, 0.6, dairy ? '#9aa3ad' : '#b9b0a6');
      if (dairy) { // light-blue band under the eaves on the visible faces
        m.box(p.u + p.w / 2 + 0.02, v0, H - 0.9, 0.04, p.d, 0.45, '#7fb6e0', { noOutline: true });
        m.box(u0, p.v + p.d / 2 + 0.02, H - 0.9, p.w, 0.04, 0.45, '#7fb6e0', { noOutline: true });
      }
      if (!b.oneRoof) {
        const over = small ? 0.25 : 0.6;
        m.gable(u0 - over, v0 - over, H, p.w + over * 2, p.d + over * 2, rh, p.w >= p.d ? 'u' : 'v', roofCol);
        top = Math.max(top, H + rh);
      }
      // windows on the two visible faces (+u right, +v left)
      if (small || barn) continue;
      const levels = chapel || barnKind ? 1 : b.levels;
      for (const axis of ['u', 'v']) {
        const len = axis === 'u' ? p.d : p.w, f = axis === 'u' ? p.u + p.w / 2 : p.v + p.d / 2, c0 = axis === 'u' ? v0 : u0;
        const n = Math.max(1, Math.floor((len - 1.2) / (barnKind ? 5 : dairy ? 3.6 : 3.1)));
        for (let lv = 0; lv < levels; lv++) {
          const y = chapel ? 2.8 : barnKind ? 2.4 : dairy ? (lv === 0 ? 2.6 : 2.1 + lv * floorH) : 1.6 + lv * floorH;
          for (let k = 0; k < n; k++) {
            const q = c0 + ((k + 0.5) * len) / n;
            if (axis === 'u' ? insideOther(p, f + 0.3, q) : insideOther(p, q, f + 0.3)) continue; // face is inside another block
            if (lv === 0 && axis === doorAxis && Math.abs(f - doorF) < 0.2 && Math.abs(q - doorP) < 1.6) continue; // room for the door
            if (chapel && axis === 'u') continue; // the tower end
            addWindow(axis, f, q, y, lv === 0);
          }
        }
      }
    }
    // farmhouse: one long roof over living part + barn, big barn door (Tenntor) + hay hatch on the door face
    if (b.oneRoof) {
      const rh = Math.min(6, Math.min(b.w, b.d) * 0.5);
      m.shadow(-b.w / 2, -b.d / 2, b.w, b.d, H + rh * 0.5);
      m.gable(-b.w / 2 - 0.7, -b.d / 2 - 0.7, H, b.w + 1.4, b.d + 1.4, rh, b.w >= b.d ? 'u' : 'v', roofCol, { key: 1e6 }); // over both parts
      top = Math.max(top, H + rh);
      for (const p of parts.filter((q) => q.type === 'barn')) {
        const f = doorAxis === 'u' ? p.u + p.w / 2 : p.v + p.d / 2, c = doorAxis === 'u' ? p.v : p.u;
        onFace(doorAxis, f, c, 0, 0, 0, 0.14, 3.6, 3.4, '#7a4a2a');
        onFace(doorAxis, f, c, 0.1, 0, 1.6, 0.06, 3.4, 0.16, '#5a3520', { noOutline: true });
        onFace(doorAxis, f, c, 0.1, 0, 0.1, 0.06, 0.16, 3.2, '#5a3520', { noOutline: true });
        onFace(doorAxis, f, c, 0, 0, H - 1.4, 0.14, 1.4, 1.1, '#7a4a2a');
      }
    }
    if (!small && homey && i % 3 !== 2) { const p = parts[0]; m.cbox(p.u + p.w * 0.2, p.v - p.d * 0.15, top - 1.2, 0.7, 0.7, 1.6, '#a8604c', b.oneRoof ? { key: 2e6 } : undefined); }

    // door on the street-facing visible face, in line with the main block
    const doorCol = small || barnKind ? '#e4e0d8' : chapel ? '#7a4a2a' : dairy ? '#7f8c99' : DOORS[i % DOORS.length];
    const mainLen = doorAxis === 'u' ? parts[0].d : parts[0].w;
    const dw = small || barnKind ? Math.min(2.6, mainLen - 0.6) : dairy ? 3.2 : 1.1, dh = small || barnKind ? 2.2 : dairy ? 2.8 : 2.1;
    onFace(doorAxis, doorF, doorP, 0, 0, dairy ? 0.9 : 0, 0.12, dw, dh, doorCol);
    let steam = null;
    if (dairy) {
      // roll door slats, loading ramp with milk churns and crates, blue sign, steel milk tank, chimney
      for (let y = 1.3; y < 3.5; y += 0.5) onFace(doorAxis, doorF, doorP, 0.1, 0, y, 0.04, 3.0, 0.08, '#5f6b78', { noOutline: true });
      onFace(doorAxis, doorF, doorP, 0, 0, 0, 1.8, 5.2, 0.9, '#aeb5bd');
      onFace(doorAxis, doorF, doorP, 0.3, -1.6, 0.9, 0.52, 0.52, 0.85, '#d2d6db');
      onFace(doorAxis, doorF, doorP, 0.3, -1.0, 0.9, 0.52, 0.52, 0.85, '#d2d6db');
      onFace(doorAxis, doorF, doorP, 0.35, -1.6, 1.75, 0.42, 0.42, 0.12, '#9aa3ad', { noOutline: true });
      onFace(doorAxis, doorF, doorP, 0.35, -1.0, 1.75, 0.42, 0.42, 0.12, '#9aa3ad', { noOutline: true });
      onFace(doorAxis, doorF, doorP, 0.3, 1.5, 0.9, 0.6, 0.6, 0.35, '#e8c23a');
      onFace(doorAxis, doorF, doorP, 0.3, 1.5, 1.25, 0.6, 0.6, 0.35, '#3b7fb0');
      onFace(doorAxis, doorF, doorP, 0, 0, H - 2.1, 0.16, 4.6, 0.9, '#2f6fb5');
      onFace(doorAxis, doorF, doorP, 0.16, 0, H - 1.85, 0.06, 3.6, 0.4, '#ffffff', { noOutline: true });
      const p0 = parts[0], tu = p0.u + p0.w / 2 + 1.7, tv = p0.v - p0.d / 2 + 2.2; // milk tank at the +u end, a bit back
      m.cbox(tu, tv, 0, 2.2, 2.2, 5.6, '#d8dde3');
      m.cbox(tu, tv, 1.6, 2.26, 2.26, 0.14, '#aab2bb', { noOutline: true });
      m.cbox(tu, tv, 3.8, 2.26, 2.26, 0.14, '#aab2bb', { noOutline: true });
      m.pyramid(tu - 1.2, tv - 1.2, 5.6, 2.4, 2.4, 0.9, '#c3c9d0');
      m.cbox(tu + 1.14, tv, 0.2, 0.08, 0.5, 5.2, '#6b737c', { noOutline: true });
      const cu = p0.u - p0.w * 0.28, cv = p0.v + p0.d * 0.12; // chimney through the roof
      m.cbox(cu, cv, top - 1.2, 0.9, 0.9, 3.4, '#8a8f99', { key: 2e6 });
      m.cbox(cu, cv, top + 2.1, 1.1, 1.1, 0.16, '#5f6670', { noOutline: true, key: 2e6 });
      const w = I.unrot(cu, cv); steam = [w[0], w[1], top + 2.4];
    }
    if (!small && !barnKind && !dairy) {
      onFace(doorAxis, doorF, doorP, 0, 0, 0, 0.6, 1.6, 0.18, '#c9c0b6');
      onFace(doorAxis, doorF, doorP, 0.1, 0.32, 1.0, 0.1, 0.12, 0.12, '#f2c23a', { noOutline: true });
    }
    if (b.kind === 'beiz') {
      onFace(doorAxis, doorF, doorP, 0, 0, 2.65, 0.14, 1.9, 0.7, '#c0392b');
      onFace(doorAxis, doorF, doorP, 0.14, 0, 2.92, 0.06, 1.4, 0.16, '#fff6dc', { noOutline: true });
    }
    // chapel: small bell tower at the +u end of the main block, with spire and cross
    let bellTop = 0;
    if (chapel) {
      const p = parts[0], tw = 1.8, th = top + 1.2, tu = p.u + p.w / 2 - tw / 2 - 0.4;
      m.cbox(tu, p.v, 0, tw, tw, th, '#fbf8f2');
      m.box(tu + tw / 2, p.v - 0.3, th - 1.3, 0.1, 0.6, 0.8, '#3a3a48');
      m.box(tu - 0.3, p.v + tw / 2, th - 1.3, 0.6, 0.1, 0.8, '#3a3a48');
      m.pyramid(tu - tw * 0.6, p.v - tw * 0.6, th, tw * 1.2, tw * 1.2, 3, '#5b6070');
      m.cbox(tu, p.v, th + 2.9, 0.14, 0.14, 1, '#e8c547', { noOutline: true });
      m.cbox(tu, p.v, th + 3.4, 0.55, 0.14, 0.14, '#e8c547', { noOutline: true });
      bellTop = th + 1; top = th + 4;
    }
    const r = m.render();
    r.height = top; r.bellTop = bellTop; r.steam = steam;
    return r;
  };

  // ---------- hand-drawn pixel helpers ----------
  // draw(px(x, y, hex)) into a W x H canvas; shadow ellipse under the base; anchor = bottom centre
  function art(W, H, draw, o) {
    o = o || {};
    const pix = new I.Pix(W + 2, H + 2 + 3), pad = 1;
    const feet = pad + H;
    if (o.shadow !== false) pix.ellipse(pix.w / 2 + (o.shadowX || 0), feet - 0.5, (o.shadowW || W) / 2 + 0.5, o.shadowH || 2.2, '#180f28', 70);
    const px = (x, y, hex, a) => { const [r, g, b] = I.rgb(hex); pix.put(x + pad, y + pad, r, g, b, a); };
    draw(px, (x, y, w, h, hex) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, hex); });
    pix.outline(I.OUT);
    return I.finish(pix, Math.floor(pix.w / 2), feet);
  }

  // ---------- trees, bushes ----------
  const treeCache = {};
  function blobTree(seed, blossom) {
    const r = NB.seeded(seed), k = 1.5 + r() * 0.4, W = Math.round(22 * k), H = Math.round(28 * k);
    const leaf = blossom ? P.blossom : P.leaf;
    const cx = W / 2, crown = Math.round(21 * k);
    return art(W, H, (px, rect) => {
      const tw = Math.round(4 * k);
      rect(Math.round(cx - tw / 2), crown - 5, tw, H - crown + 5, '#6b4a2e'); rect(Math.round(cx + tw / 2) - 1, crown - 5, 1, H - crown + 5, '#4f3520');
      rect(Math.round(cx - tw / 2) - 1, H - 1, tw + 2, 1, '#4f3520');
      const blobs = [[cx, 10 * k, (7.5 + r() * 1.5) * k], [cx - 4.5 * k, 12 * k, (4.5 + r()) * k], [cx + 4.5 * k, 12 * k, (4.5 + r()) * k], [cx, 5.5 * k, (4.5 + r()) * k], [cx - 2 * k, 15 * k, 4 * k], [cx + 2.5 * k, 14 * k, 4 * k]];
      for (let y = 0; y < crown; y++) for (let x = 0; x < W; x++) {
        let inside = false;
        for (const [bx, by, br] of blobs) if ((x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= br * br) inside = true;
        if (!inside) continue;
        let col = leaf[0];
        const dd = (x - cx) * 0.6 + (y - 9 * k);
        if (dd > 4.5 * k) col = leaf[1]; else if (dd < -5 * k) col = leaf[2];
        if (r() < 0.1) col = r() < 0.5 ? leaf[1] : leaf[2];
        if (P.snow && y < (4 + r() * 3) * k) col = '#ffffff';
        px(x, y, col);
      }
      if (SEASON === 'autumn') for (let i = 0; i < 10; i++) px((r() * W) | 0, crown + 1 + ((r() * (H - crown - 2)) | 0), leaf[(r() * 3) | 0]);
    }, { shadowW: Math.round(20 * k), shadowH: 3.5, shadowX: 3 });
  }
  function pineTree(seed) {
    const r = NB.seeded(seed), k = 1.5 + r() * 0.4, W = Math.round(17 * k), H = Math.round(31 * k);
    const cx = (W - 1) / 2;
    return art(W, H, (px, rect) => {
      rect(Math.round(cx - 1), Math.round(23 * k), 3, H - Math.round(23 * k), '#5b3d24');
      const tiers = [[1, 11, 4.5], [6, 17, 6], [11, 24, 7.5]].map((t) => t.map((v) => v * k));
      const inside = (x, y) => tiers.some(([top, bot, hw]) => y >= top && y <= bot && Math.abs(x - cx) <= ((y - top) / (bot - top)) * hw + 0.6);
      for (let y = 0; y < Math.round(25 * k); y++) for (let x = 0; x < W; x++) {
        if (!inside(x, y)) continue;
        let col = x > cx ? P.pine[1] : P.pine[0];
        if (x < cx - 1 && r() < 0.3) col = P.pine[2];
        if (P.snow && !inside(x, y - 1)) col = '#f4f8fb'; else if (P.snow && r() < 0.1) col = '#e6eef4';
        px(x, y, col);
      }
    }, { shadowW: Math.round(14 * k), shadowH: 3, shadowX: 3 });
  }
  M.tree = function (kind, variant) {
    const key = kind + variant;
    if (!treeCache[key]) treeCache[key] = kind === 'pine' ? pineTree(variant * 31 + 7) : blobTree(variant * 17 + 3, SEASON === 'spring' && variant % 4 === 0);
    return treeCache[key];
  };
  M.bush = function (variant) {
    const key = 'bush' + variant;
    if (!treeCache[key]) {
      const r = NB.seeded(variant * 13 + 5), W = 14, H = 9;
      treeCache[key] = art(W, H, (px) => {
        const blobs = [[4, 5, 3.6], [9.5, 5, 3.6], [7, 3, 3.2]];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br)) continue;
          let col = y < 3 ? P.leaf[2] : y > 6 ? P.leaf[1] : P.leaf[0];
          if (!P.snow && SEASON !== 'autumn' && r() < 0.08) col = ['#ff7aa8', '#ffffff', '#ffd23f', '#c9b4ff'][(r() * 4) | 0];
          if (P.snow && y < 2) col = '#ffffff';
          px(x, y, col);
        }
      }, { shadowH: 1.8 });
    }
    return treeCache[key];
  };

  // ---------- street furniture ----------
  M.lamp = function () {
    if (!treeCache.lamp) {
      const m = I.model();
      m.cbox(0, 0, 0, 0.18, 0.18, 4, '#4a3f45');
      m.cbox(0, 0, 3.9, 0.5, 0.5, 0.42, '#fff2c8', { light: '#ffe08a' });
      m.cbox(0, 0, 4.3, 0.66, 0.66, 0.14, '#4a3f45');
      treeCache.lamp = m.render();
    }
    return treeCache.lamp;
  };
  // bus shelter; local +z points away from the road (heading = direction road -> shelter)
  M.busStop = function (heading) {
    const m = I.model(heading);
    m.shadow(-1.5, -0.7, 3, 1.4, 2.5);
    [-1.4, 1.4].forEach((x) => m.cbox(x, 0.6, 0, 0.12, 0.12, 2.5, '#55606e'));
    m.cbox(0, 0.65, 0.25, 2.8, 0.06, 2.1, '#bfe3f5');
    m.cbox(0, 0.35, 0.45, 2, 0.45, 0.12, '#a8673a');
    m.cbox(0, 0, 2.5, 3, 1.4, 0.15, '#55606e');
    m.cbox(1.9, -0.3, 0, 0.08, 0.08, 2.8, '#55606e');
    m.cbox(1.9, -0.3, 2.5, 0.6, 0.06, 0.6, '#ffd200');
    m.cbox(1.9, -0.34, 2.62, 0.35, 0.04, 0.36, '#2d7a3c', { noOutline: true });
    return m.render();
  };
  // wooden bench (heading = the direction you look when sitting on it)
  M.bench = function (heading) {
    const m = I.model(heading);
    m.shadow(-0.9, -0.25, 1.8, 0.5, 0.5);
    [-0.75, 0.75].forEach((x) => { m.cbox(x, 0, 0, 0.1, 0.4, 0.42, '#5a3520'); m.cbox(x, -0.22, 0.42, 0.1, 0.08, 0.5, '#5a3520'); });
    m.cbox(0, 0, 0.42, 1.8, 0.45, 0.07, '#a8673a');
    m.cbox(0, -0.22, 0.62, 1.8, 0.06, 0.32, '#a8673a');
    return m.render();
  };
  // octagonal prism (round-ish in pixel art): centre, radius, bottom y, height
  const prism8 = (m, cx, cz, r, y, h, col, o) => {
    const V = [];
    for (let k = 0; k < 8; k++) { const a = ((k + 0.5) * Math.PI) / 4; V.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, y]); }
    for (let k = 0; k < 8; k++) V.push([V[k][0], V[k][1], y + h]);
    const F = [[8, 9, 10, 11, 12, 13, 14, 15]];
    for (let k = 0; k < 8; k++) { const j = (k + 1) % 8; F.push([k, j, j + 8, k + 8]); }
    m.solid(V, F, col, o);
  };
  // little sitting place: paved round patch, round table, four stools
  // the Sitzplatz is split into pieces with their own depth: paving (ground), table, four stools (M.stool) - so people
  // sitting behind the table are drawn behind it but in front of the paving, and nobody vanishes behind one big sprite
  M.sitzPaving = function () {
    if (!treeCache.sitzPaving) { const m = I.model(); prism8(m, 0, 0, 2.6, 0, 0.04, '#d8cfbf', { key: -1e6 }); treeCache.sitzPaving = m.render({ shadow: false }); }
    return treeCache.sitzPaving;
  };
  M.sitzTable = function () {
    if (!treeCache.sitzTable) {
      const m = I.model();
      m.shadow(-0.6, -0.6, 1.2, 1.2, 0.5);
      m.cbox(0, 0, 0, 0.14, 0.14, 0.74, '#5a3520');
      prism8(m, 0, 0, 0.75, 0.74, 0.08, '#a8673a');
      treeCache.sitzTable = m.render();
    }
    return treeCache.sitzTable;
  };
  M.stool = function () {
    if (!treeCache.stool) { const m = I.model(); m.cbox(0, 0, 0, 0.08, 0.08, 0.42, '#5a3520'); prism8(m, 0, 0, 0.24, 0.42, 0.07, '#c0503f'); treeCache.stool = m.render(); }
    return treeCache.stool;
  };
  M.sitzplatz = M.sitzTable;
  // boule court: wooden frame only (the gravel is painted into the ground). w along u, d along v
  M.bouleFrame = function (w, d) {
    const key = 'boule' + w + 'x' + d;
    if (!treeCache[key]) {
      const m = I.model(), b = 0.14, h = 0.16, col = '#8a5a32';
      m.box(-w / 2 - b, -d / 2 - b, 0, w + b * 2, b, h, col); // far long / short sides first
      m.box(-w / 2 - b, -d / 2, 0, b, d, h, col);
      m.box(w / 2, -d / 2, 0, b, d, h, col);
      m.box(-w / 2 - b, d / 2, 0, w + b * 2, b, h, col);
      // a throwing circle at the -v / -u end
      const along = d >= w, cu = along ? 0 : -w / 2 + 1, cv = along ? -d / 2 + 1 : 0;
      m.box(cu - 0.25, cv - 0.25, 0, 0.5, 0.04, 0.03, '#f4f1ea', { noOutline: true });
      m.box(cu - 0.25, cv + 0.21, 0, 0.5, 0.04, 0.03, '#f4f1ea', { noOutline: true });
      m.box(cu - 0.25, cv - 0.25, 0, 0.04, 0.5, 0.03, '#f4f1ea', { noOutline: true });
      m.box(cu + 0.21, cv - 0.25, 0, 0.04, 0.5, 0.03, '#f4f1ea', { noOutline: true });
      treeCache[key] = m.render();
    }
    return treeCache[key];
  };
  // hydrangea (Hortensie): round leafy bush with big flower balls. Buds in spring, full colour in summer,
  // faded "antique" heads in autumn, dry brown heads in winter.
  const HYD = [['#7f9fe8', '#aac0f6', '#5f7fd0'], ['#ef8fbf', '#f8bbd8', '#d06a9e'], ['#a68ae0', '#c8b4f2', '#8466c4'], ['#f2f2f6', '#ffffff', '#d4d4e0']];
  M.hortensie = function (variant) {
    const key = 'hyd' + variant;
    if (!treeCache[key]) {
      const r = NB.seeded(variant * 29 + 11), W = 13, H = 11;
      const winter = SEASON === 'winter', spring = SEASON === 'spring', autumn = SEASON === 'autumn';
      const fc = HYD[variant % HYD.length].map((c) => (autumn ? NB.shade(c, 0.82) : c));
      const leaf = winter ? ['#8a7058', '#6f5845', '#9c8168'] : ['#4f8f4a', '#3c7638', '#66a85c'];
      const heads = [[3.5, 3.5, 2.6], [9, 3.2, 2.6], [6.3, 2, 2.5], [6.5, 5, 2.2]];
      treeCache[key] = art(W, H, (px) => {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const body = (x - 6.3) ** 2 / 36 + (y - 6.5) ** 2 / 20 <= 1;
          const head = !spring && heads.find(([hx, hy, hr]) => (x - hx) ** 2 + (y - hy) ** 2 <= hr * hr);
          if (head) {
            if (winter) px(x, y, y < 2 ? '#ffffff' : r() < 0.5 ? '#b49a7c' : '#9c8064');
            else px(x, y, r() < 0.25 ? fc[1] : r() < 0.15 ? fc[2] : fc[0]);
          } else if (body && !(winter && r() < 0.45)) {
            px(x, y, y < 5 ? leaf[2] : y > 8 ? leaf[1] : leaf[0]);
            if (spring && y < 6 && r() < 0.12) px(x, y, '#b8e08a'); // buds
          }
        }
      }, { shadowH: 1.6 });
    }
    return treeCache[key];
  };
  M.table = function () {
    if (!treeCache.table) {
      const m = I.model();
      m.cbox(0, 0, 0, 0.1, 0.1, 0.76, '#6a4a32');
      m.cbox(0, 0, 0.76, 1.2, 1.2, 0.08, '#a8673a');
      m.cbox(0, 0, 0.84, 0.08, 0.08, 1.5, '#e9e4da');
      m.pyramid(-1.3, -1.3, 2.1, 2.6, 2.6, 0.6, '#d94a4a');
      treeCache.table = m.render();
    }
    return treeCache.table;
  };

  // ---------- vehicles (box models, 16 headings, cached) ----------
  const vehCache = {};
  const HEADINGS = 16;
  M.vehicle = function (type, color, heading) {
    const k = ((Math.round((heading / (Math.PI * 2)) * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;
    const key = type + color + k;
    if (vehCache[key]) return vehCache[key];
    const h = (k / HEADINGS) * Math.PI * 2;
    const m = I.model(h);
    const wheel = (x, z, r) => m.cbox(x, z, 0, 0.3, r * 2, r * 2, '#2a2a2e');
    // thin panels on the four sides of a box (stripes, window bands) - never a wrapping box, whose top face
    // would paint over the body
    const panels = (cx, cz, y, w, d, h, color) => {
      [-1, 1].forEach((sgn) => { m.cbox(cx + sgn * (w / 2 + 0.03), cz, y, 0.06, d, h, color, { noOutline: true }); m.cbox(cx, cz + sgn * (d / 2 + 0.03), y, w, 0.06, h, color, { noOutline: true }); });
    };
    if (type === 'bus') {
      m.shadow(-1.25, -5, 2.5, 10, 2.4);
      [[-1.2, 3.3], [1.2, 3.3], [-1.2, -3.3], [1.2, -3.3]].forEach(([x, z]) => wheel(x, z, 0.4));
      m.cbox(0, 0, 0.4, 2.5, 10, 2.6, '#ffcc00');
      panels(0, 0, 0.62, 2.5, 10, 0.26, '#d9302a');
      panels(0, -0.4, 1.8, 2.5, 8.6, 0.9, '#2b3d55');
      m.cbox(0, 5.03, 1.5, 2.3, 0.06, 1.2, '#2b3d55', { noOutline: true });
      m.cbox(0, 0, 3.0, 2.3, 9.6, 0.2, '#f2f2ea');
      [-0.8, 0.8].forEach((x) => m.cbox(x, 5.04, 0.8, 0.4, 0.06, 0.2, '#fff8c0', { noOutline: true, light: '#fff2a0' }));
    } else if (type === 'firetruck') {
      // fire engine: red body, white stripe, ladder on the roof, blue light
      m.shadow(-1.25, -4, 2.5, 8, 2.8);
      [[-1.1, 2.6], [1.1, 2.6], [-1.1, -2.2], [1.1, -2.2]].forEach(([x, z]) => wheel(x, z, 0.5));
      m.cbox(0, 0, 0.5, 2.4, 7.8, 2.4, color);
      panels(0, 0, 1.25, 2.4, 7.8, 0.3, '#f4f4f0');
      panels(0, 2.4, 1.9, 2.4, 2.4, 0.9, '#2b3d55');
      m.cbox(0, 3.92, 2.0, 2.2, 0.06, 0.9, '#2b3d55', { noOutline: true });
      m.cbox(0, 0, 2.9, 2.3, 7.6, 0.2, '#e03a3a');
      m.cbox(0, -1.0, 3.1, 0.9, 5.6, 0.25, '#b9c0c8');
      [-0.3, 0.3].forEach((x) => m.cbox(x, -1.0, 3.35, 0.08, 5.4, 0.12, '#8a9099', { noOutline: true }));
      m.cbox(0, 2.6, 3.1, 0.6, 0.6, 0.35, '#4f8fe8', { light: '#9ac6ff' });
      [-0.8, 0.8].forEach((x) => m.cbox(x, 3.93, 1.0, 0.4, 0.06, 0.25, '#fff8c0', { noOutline: true, light: '#fff2a0' }));
    } else if (type === 'tanker') {
      // milk lorry: coloured cab, stainless tank with bands
      m.shadow(-1.25, -4.5, 2.5, 9, 2.6);
      [[-1.1, 3.2], [1.1, 3.2], [-1.1, -1.2], [1.1, -1.2], [-1.1, -2.6], [1.1, -2.6]].forEach(([x, z]) => wheel(x, z, 0.5));
      m.cbox(0, -0.4, 0.5, 2.3, 8.6, 0.5, '#3a3a40');
      m.cbox(0, 3.4, 0.6, 2.4, 2.2, 2.6, color);
      panels(0, 3.4, 1.9, 2.4, 2.2, 1.0, '#2b3d55');
      m.cbox(0, -1.2, 1.0, 2.2, 6.4, 2.0, '#dfe3e8');
      m.cbox(0, -1.2, 1.7, 2.3, 6.5, 0.14, '#b9c0c8', { noOutline: true });
      m.cbox(0, -1.2, 2.5, 2.3, 6.5, 0.14, '#b9c0c8', { noOutline: true });
      m.cbox(0, -1.2, 3.0, 1.5, 6.0, 0.4, '#eef1f4');
      m.cbox(0, 4.52, 2.2, 2.2, 0.06, 0.9, '#2b3d55', { noOutline: true });
      [-0.8, 0.8].forEach((x) => m.cbox(x, 4.53, 1.0, 0.4, 0.06, 0.25, '#fff8c0', { noOutline: true, light: '#fff2a0' }));
    } else if (type === 'mini') {
      // small two-door with a white roof and yellow mirror caps (electric Mini)
      m.shadow(-0.85, -1.9, 1.7, 3.8, 1.3);
      [[-0.78, 1.15], [0.78, 1.15], [-0.78, -1.15], [0.78, -1.15]].forEach(([x, z]) => wheel(x, z, 0.3));
      m.cbox(0, 0, 0.28, 1.7, 3.7, 0.62, color);
      m.cbox(0, -0.15, 0.9, 1.55, 2.25, 0.48, color);
      panels(0, -0.15, 0.95, 1.55, 2.25, 0.38, '#2b3d55');
      m.cbox(0, -0.15, 1.38, 1.6, 2.3, 0.1, '#f4f4f0');
      [-0.9, 0.9].forEach((x) => m.cbox(x, 0.85, 0.95, 0.12, 0.22, 0.14, '#e8d53a', { noOutline: true }));
      [-0.5, 0.5].forEach((x) => m.cbox(x, 1.88, 0.62, 0.3, 0.06, 0.26, '#fff8c0', { noOutline: true, light: '#fff2a0' }));
      [-0.55, 0.55].forEach((x) => m.cbox(x, -1.88, 0.6, 0.26, 0.06, 0.2, '#e03a3a', { noOutline: true }));
    } else if (type === 'jeep') {
      // old army jeep: olive tub, flat bonnet, fold-down windscreen, open top with roll bar, spare wheel at the back
      m.shadow(-0.8, -1.75, 1.6, 3.5, 1.3);
      [[-0.74, 1.05], [0.74, 1.05], [-0.74, -1.05], [0.74, -1.05]].forEach(([x, z]) => wheel(x, z, 0.36));
      m.cbox(0, 0, 0.34, 1.5, 3.3, 0.56, color);
      m.cbox(0, -0.55, 0.9, 1.3, 1.4, 0.04, '#3a3f2a', { noOutline: true }); // open tub floor seen from above
      [-0.35, 0.35].forEach((x) => m.cbox(x, -0.35, 0.9, 0.5, 0.16, 0.42, '#4a4632'));
      m.cbox(0, 0.48, 0.9, 1.44, 0.07, 0.5, '#a9c4dc', { noOutline: true }); // windscreen
      m.cbox(0, 0.48, 1.38, 1.5, 0.09, 0.08, color);
      [-0.68, 0.68].forEach((x) => { m.cbox(x, -1.2, 0.9, 0.08, 0.08, 0.72, '#3a3f2a'); m.cbox(x, 0.48, 0.9, 0.08, 0.09, 0.5, color); });
      m.cbox(0, -1.2, 1.58, 1.44, 0.08, 0.08, '#3a3f2a');
      m.cbox(0, 1.66, 0.45, 0.8, 0.05, 0.4, '#3a3f2a', { noOutline: true }); // grille
      [-0.55, 0.55].forEach((x) => m.cbox(x, 1.67, 0.68, 0.22, 0.05, 0.2, '#fff8c0', { noOutline: true, light: '#fff2a0' }));
      m.cbox(0.3, -1.74, 0.42, 0.62, 0.2, 0.62, '#2a2a2e'); // spare wheel
      m.cbox(-0.45, -1.7, 0.5, 0.3, 0.14, 0.4, NB.shade(color, 0.8)); // jerrycan
      m.cbox(0, 1.1, 0.91, 0.5, 0.5, 0.02, '#f4f1ea', { noOutline: true }); // white marking on the bonnet
    } else if (type === 'tractor') {
      // farm tractor: big rear wheels with yellow hubs, long bonnet, glass cab, exhaust stack
      m.shadow(-0.95, -1.7, 1.9, 3.8, 1.7);
      [-0.72, 0.72].forEach((x) => { m.cbox(x, -0.85, 0, 0.5, 1.5, 1.5, '#2a2a2e'); m.cbox(x + Math.sign(x) * 0.26, -0.85, 0.55, 0.06, 0.42, 0.42, '#e8c23a', { noOutline: true }); });
      [-0.68, 0.68].forEach((x) => m.cbox(x, 1.3, 0, 0.3, 0.84, 0.84, '#2a2a2e'));
      m.cbox(0, 0.15, 0.45, 1.1, 3.1, 0.35, '#3a3a40');
      m.cbox(0, 1.15, 0.75, 1.0, 1.9, 0.75, color);
      m.cbox(0, 2.11, 0.8, 0.9, 0.06, 0.6, '#2a2a2e', { noOutline: true });
      [-0.3, 0.3].forEach((x) => m.cbox(x, 2.13, 1.2, 0.22, 0.06, 0.16, '#fff8c0', { noOutline: true, light: '#fff2a0' }));
      m.cbox(0.38, 0.35, 1.45, 0.12, 0.12, 0.95, '#55555c');
      m.cbox(0, -0.75, 0.75, 1.3, 1.3, 0.5, color);
      m.cbox(0, -0.75, 1.25, 1.2, 1.2, 1.1, '#9ccbe0', { light: '#fff2c8' });
      m.cbox(0, -0.75, 2.35, 1.42, 1.42, 0.14, color);
    } else {
      m.shadow(-0.9, -2, 1.8, 4, 1.4);
      [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]].forEach(([x, z]) => wheel(x, z, 0.36));
      m.cbox(0, 0, 0.35, 1.8, 4, 0.8, color);
      m.cbox(0, -0.2, 1.15, 1.6, 2.1, 0.7, color);
      panels(0, -0.2, 1.25, 1.6, 2.1, 0.5, '#2b3d55');
      [-0.55, 0.55].forEach((x) => m.cbox(x, 2.03, 0.75, 0.35, 0.06, 0.16, '#fff8c0', { noOutline: true, light: '#fff2a0' }));
    }
    return (vehCache[key] = m.render());
  };

  // round hay bale (meadows in summer / autumn)
  M.bale = function (variant) {
    const key = 'bale' + (variant | 0);
    if (!treeCache[key]) {
      const m = I.model(((variant | 0) % 4) * 0.4);
      m.shadow(-0.75, -0.7, 1.5, 1.4, 1.3);
      m.cbox(0, 0, 0, 1.5, 1.4, 1.3, '#dcb75e');
      m.cbox(0, 0, 0.5, 1.54, 1.44, 0.1, '#b8903c', { noOutline: true });
      m.cbox(0, 0, 0.95, 1.54, 1.44, 0.1, '#b8903c', { noOutline: true });
      treeCache[key] = m.render();
    }
    return treeCache[key];
  };

  // reeds / cattails on the pond shore
  M.reed = function (variant) {
    const key = 'reed' + (variant | 0);
    if (!treeCache[key]) {
      const r = NB.seeded(variant * 29 + 11), W = 9, H = 15;
      treeCache[key] = art(W, H, (px, rect) => {
        const stalks = [[1, 5], [3, 2], [5, 4], [7, 6]];
        stalks.forEach(([x, top], k) => {
          const col = k % 2 ? '#6aa552' : '#8bbd63';
          for (let y = top + ((r() * 2) | 0); y < H; y++) px(x, y, P.snow && y < top + 3 ? '#f2f6f8' : col);
          if (k === 1 || k === 2) { rect(x - (k === 1 ? 0 : 1), top - 1, 2, 3, '#6b4a2e'); px(x + (k === 1 ? 1 : 0), top - 2, '#8bbd63'); }
          if (r() < 0.5) px(x + 1, H - 4 - ((r() * 4) | 0), col);
        });
      }, { shadowH: 1.2, shadowW: 7 });
    }
    return treeCache[key];
  };

  // wooden sign post with a board
  M.sign = function () {
    if (!treeCache.sign) {
      const m = I.model(I.towardCamera); // board faces the viewer
      m.shadow(-0.07, -0.07, 0.14, 0.14, 1.5);
      m.cbox(0, 0, 0, 0.14, 0.14, 1.45, '#6b4a2e');
      m.cbox(0, 0.1, 1.0, 1.3, 0.08, 0.65, '#f3e6c4');
      m.cbox(0, 0.15, 1.42, 1.1, 0.02, 0.14, '#c0392b', { noOutline: true });
      m.cbox(0, 0.15, 1.12, 0.9, 0.02, 0.08, '#4a3f45', { noOutline: true });
      treeCache.sign = m.render();
    }
    return treeCache.sign;
  };

  // ---------- ducks (drawn facing right; swim = no shadow, walk = feet + shadow) ----------
  const DUCK = {
    swim: ['......hhh.', '.....hhehk', '.....hhhh.', '......ww..', 't...bbbbb.', 'tbbbbbbbb.', '.bbbbbbb..'],
    dip: ['..........', '..........', 'tt........', '.tbbbbbb..', '..bbbbbbb.', '....bbhhh.', '.....hhhk.'],
  };
  M.duck = function (L) {
    L = Object.assign({ sex: 'm' }, L);
    const male = L.sex === 'm';
    const head = male ? '#2e7d4f' : '#8a6a4a', body = male ? '#8c7a66' : '#a58a68', wing = male ? '#6e5e4c' : '#86704f';
    const colorOf = (ch, x, y) => {
      if (ch === 'h') return head;
      if (ch === 'e') return '#1a1a1a';
      if (ch === 'k' || ch === 'f') return '#e9a23b';
      if (ch === 'w') return male ? '#f4f0e6' : body;
      if (ch === 't') return male ? '#3a3330' : wing;
      if (ch === 'b') return y === 5 && x >= 3 && x <= 6 ? wing : body;
      return body;
    };
    const mk = (rows, o) => { const right = I.rows(rows, colorOf, o); return { right, left: flipRec(right) }; };
    const bob = ['..........'].concat(DUCK.swim.slice(0, 6));
    return {
      swim: [mk(DUCK.swim, { shadow: false }), mk(bob, { shadow: false })],
      dip: mk(DUCK.dip, { shadow: false }),
      walk: [mk(DUCK.swim.concat(['...f..f...']), { shadowW: 8, shadowH: 1.4 }), mk(DUCK.swim.concat(['..f....f..']), { shadowW: 8, shadowH: 1.4 })],
    };
  };

  // petrol station: canopy on four pillars over two pumps, a small shop behind, price sign (faces +z = the road)
  M.fuelStation = function (heading) {
    const key = 'fuel' + Math.round(heading * 100);
    if (!treeCache[key]) {
      const m = I.model(heading);
      m.shadow(-6, -3.5, 12, 7, 4.6);
      m.shadow(-6, -9.5, 12, 5.5, 3.4);
      [[-5, -2.5], [5, -2.5], [-5, 2.5], [5, 2.5]].forEach(([x, z]) => m.cbox(x, z, 0, 0.4, 0.4, 4.4, '#d9dde2'));
      m.cbox(0, 0, 4.4, 12.4, 7.2, 0.5, '#f4f4f0');
      m.cbox(0, 3.62, 4.0, 12.4, 0.06, 0.9, '#2f6fb5', { noOutline: true });
      m.cbox(0, 3.64, 4.25, 12.4, 0.04, 0.2, '#f2c23a', { noOutline: true });
      [[-2.2, 0], [2.2, 0]].forEach(([x, z]) => { m.cbox(x, z, 0, 2.6, 1.2, 0.18, '#aeb5bd'); m.cbox(x, z, 0.18, 1.0, 0.7, 1.7, '#e9ecef'); m.cbox(x, z + 0.37, 0.9, 0.7, 0.04, 0.5, '#2b3d55', { noOutline: true, light: '#9ac6ff' }); m.cbox(x + 0.42, z, 0.5, 0.1, 0.5, 1.1, '#3a3a40'); });
      m.cbox(0, -7, 0, 9, 5, 3.2, '#f6f3ec');
      m.gable(-4.8, -9.8, 3.2, 9.6, 5.6, 1.4, 'u', '#8a8f99');
      m.cbox(0, -4.47, 0, 2.2, 0.06, 2.3, '#9ccbe0', { light: '#fff2c8' });
      [-3, 2.4].forEach((x) => m.cbox(x, -4.47, 1.1, 1.6, 0.06, 1.1, '#9ccbe0', { light: '#fff2c8' }));
      m.cbox(7.4, 2.5, 0, 0.25, 0.25, 5.2, '#55555c');
      m.cbox(7.4, 2.5, 4.3, 1.4, 0.3, 2.0, '#2f6fb5', { light: '#9ac6ff' });
      m.cbox(7.4, 2.68, 4.6, 1.1, 0.04, 0.3, '#ffffff', { noOutline: true });
      m.cbox(7.4, 2.68, 5.1, 1.1, 0.04, 0.3, '#ffffff', { noOutline: true });
      treeCache[key] = m.render();
    }
    return treeCache[key];
  };

  // ---------- Hirschfarm: fence segments, gate, feeding rack, shelter; pumpkin stand and piles ----------
  M.fence = function (len, heading, gate) {
    const key = 'fence' + len.toFixed(1) + '/' + Math.round(heading * 100) + (gate ? 'g' : '');
    if (!treeCache[key]) {
      const m = I.model(heading);
      const wood = gate ? '#a8824f' : '#7a5a3a', rail = gate ? '#c09a62' : '#95714a';
      // the model's length runs along its heading (+z), like a vehicle
      for (let z = -len / 2; z <= len / 2 + 0.01; z += 2) m.cbox(0, z, 0, 0.16, 0.16, 1.3, wood);
      m.cbox(0, 0, 0.5, 0.07, len, 0.1, rail, { noOutline: true });
      m.cbox(0, 0, 0.95, 0.07, len, 0.1, rail, { noOutline: true });
      if (gate) { m.cbox(0, 0, 0.2, 0.06, len - 0.3, 0.08, rail, { noOutline: true }); m.cbox(0.06, 0, 0.72, 0.05, 0.1, 0.9, rail, { noOutline: true }); }
      treeCache[key] = m.render({ shadow: false });
    }
    return treeCache[key];
  };
  M.feedRack = function (heading) {
    const key = 'rack' + Math.round(heading * 100);
    if (!treeCache[key]) {
      const m = I.model(heading);
      m.shadow(-1.1, -0.5, 2.2, 1.0, 1.6);
      [-0.9, 0.9].forEach((z) => m.cbox(0, z, 0, 0.14, 0.14, 1.7, '#6b4a2e'));
      m.cbox(-0.3, 0, 0.5, 0.08, 2.0, 0.7, '#95714a');
      m.cbox(0.3, 0, 0.5, 0.08, 2.0, 0.7, '#95714a');
      m.cbox(0, 0, 0.55, 0.5, 1.8, 0.6, '#e2c25e');
      m.gable(-0.7, -1.2, 1.7, 1.4, 2.4, 0.5, 'v', '#8a5a48');
      treeCache[key] = m.render();
    }
    return treeCache[key];
  };
  M.deerShelter = function (heading) {
    const key = 'shelter' + Math.round(heading * 100);
    if (!treeCache[key]) {
      const m = I.model(heading);
      m.shadow(-2, -1.5, 4, 3, 2.3);
      [[-1.85, -1.35], [1.85, -1.35], [-1.85, 1.35], [1.85, 1.35]].forEach(([x, z]) => m.cbox(x, z, 0, 0.18, 0.18, 2.3, '#6b4a2e'));
      m.cbox(0, -1.4, 0, 3.9, 0.12, 2.3, '#8a6a46');
      m.cbox(0, 0, 2.3, 4.3, 3.3, 0.15, '#7a4a3a');
      m.cbox(0, 0.4, 0, 2.2, 1.6, 0.25, '#e2c25e');
      treeCache[key] = m.render();
    }
    return treeCache[key];
  };
  const PUMPKIN = ['#e8812a', '#d9701f', '#f0a040', '#c8c08a', '#9fbf6a'];
  const pumpkin = (m, x, z, y, r, k) => { prism8(m, x, z, y, r, r * 1.2, PUMPKIN[k % PUMPKIN.length]); m.cbox(x, z, y + r * 1.2, 0.08, 0.08, 0.12, '#5a7a3a', { noOutline: true }); };
  M.pumpkinStand = function (heading, big) {
    const key = 'pstand' + Math.round(heading * 100) + (big ? 'B' : '');
    if (!treeCache[key]) {
      const m = I.model(heading), r = NB.seeded(21);
      m.shadow(-1.5, -0.5, 3, 1, 0.9);
      [-1.3, 1.3].forEach((x) => m.cbox(x, 0, 0, 0.12, 0.8, 0.8, '#6b4a2e'));
      m.cbox(0, 0, 0.8, 3.0, 1.0, 0.08, '#a8824f');
      for (let i = 0; i < (big ? 9 : 5); i++) pumpkin(m, -1.2 + i * (2.4 / (big ? 8 : 4)), -0.2 + ((i % 2) * 0.4), 0.88, 0.18 + r() * 0.08, i);
      m.cbox(-1.0, 0.95, 0, 0.7, 0.5, 0.45, '#b08a5a'); pumpkin(m, -1.0, 0.95, 0.45, 0.22, 2);
      if (big) { // banner on two posts: orange board with white bands ("Kürbismarkt")
        [-1.6, 1.6].forEach((x) => m.cbox(x, -0.9, 0, 0.1, 0.1, 2.3, '#6b4a2e'));
        m.cbox(0, -0.9, 1.6, 3.4, 0.06, 0.6, '#e8812a');
        m.cbox(0, -0.86, 1.82, 2.6, 0.04, 0.16, '#fff6dc', { noOutline: true });
      }
      treeCache[key] = m.render();
    }
    return treeCache[key];
  };
  M.pumpkinPile = function (variant) {
    const key = 'ppile' + variant;
    if (!treeCache[key]) {
      const m = I.model(), r = NB.seeded(variant * 7 + 3);
      m.shadow(-0.7, -0.6, 1.4, 1.2, 0.5);
      const n = 4 + ((variant % 3) * 2);
      for (let i = 0; i < n; i++) pumpkin(m, (r() - 0.5) * 1.3, (r() - 0.5) * 1.1, 0, 0.2 + r() * 0.16, i + variant);
      if (n > 5) pumpkin(m, 0, 0, 0.4, 0.26, variant + 1);
      treeCache[key] = m.render();
    }
    return treeCache[key];
  };

  // ---------- deer (drawn facing right): hinds, a stag with antlers, a spotted calf ----------
  const DEER = {
    stand: ['...........bbbb.', '...........bebbn', '..........bbbb..', '.wbbbbbbbbbb....', 'wwbbbbbbbbbbb...', '.wbbllllllbbb...', '..bbllllllbb....', '..b..b....b..b..', '..b..b....b..b..', '..b..b....b..b..'],
    walk2: ['...........bbbb.', '...........bebbn', '..........bbbb..', '.wbbbbbbbbbb....', 'wwbbbbbbbbbbb...', '.wbbllllllbbb...', '..bbllllllbb....', '.b....b..b....b.', '.b....b..b....b.', 'b.....b..b....b.'],
    graze: ['................', '................', '................', '.wbbbbbbbbbbb...', 'wwbbbbbbbbbbbb..', '.wbbllllllbbbb..', '..bbllllllbbbbb.', '..b..b....b.bbbn', '..b..b....b..be.', '..b..b....b.....'],
    lie: ['................', '................', '................', '...........bbbb.', '...........bebbn', '..........bbbb..', '.wbbbbbbbbbb....', 'wwbbbbbbbbbbb...', '.wbbllllllbbb...', '..bbbbbbbbbb....'],
  };
  const ANTLERS = ['..........a..a..', '..........aa.a..', '...........aaa..'];
  M.deer = function (L) {
    L = Object.assign({ kind: 'hind' }, L);
    const stag = L.kind === 'stag', calf = L.kind === 'calf';
    const colorOf = (ch, x, y) => {
      if (ch === 'b') { if (calf && (x + y * 3) % 7 === 0 && y >= 3 && y <= 6) return '#f0e6d2'; return stag ? '#7a4a2e' : calf ? '#a8744a' : '#8a5a3a'; }
      return { l: '#c9a37a', w: '#f4efe6', n: '#2a2222', e: '#1a1a1a', a: '#6b4a2e' }[ch];
    };
    const withAntlers = (rows, lying) => (stag ? (lying ? rows.slice(0, 3).map((r, i) => ANTLERS[i]).concat(rows.slice(3)) : ANTLERS.concat(rows)) : rows);
    const mk = (rows, o) => { const right = I.rows(rows, colorOf, o); return { right, left: flipRec(right) }; };
    const o = { shadowW: 13, shadowH: 1.8 };
    return { walk: [mk(withAntlers(DEER.stand), o), mk(withAntlers(DEER.walk2), o)], stand: mk(withAntlers(DEER.stand), o), graze: mk(withAntlers(DEER.graze, true), o), lie: mk(withAntlers(DEER.lie, true), { shadowW: 13, shadowH: 1.5 }) };
  };

  // mirror a finished sprite record horizontally
  function flipRec(f) {
    const [c, g] = NB.canvas(f.w, f.h);
    g.translate(f.w, 0); g.scale(-1, 1); g.drawImage(f.canvas, 0, 0);
    return I.wrap(c, f.w - 1 - f.ox, f.oy);
  }

  // ---------- people (hand-drawn, 10 px wide, 18 rows incl. 2 rows head-room) ----------
  const FRONT = [
    '..........', '..........',
    '...hhhh...', '..hhhhhh..', '.hhhhhhhh.', '.hssssssh.', '.sesssses.', '.ssssssss.', '..ssmmss..',
    '..tttttt..', '.tttttttt.', '.tttttttt.', '.stttttts.',
    '..pppppp..', '..pppppp..', '..pp..pp..', '..pp..pp..', '..ff..ff..',
  ];
  const BACK = FRONT.slice();
  BACK[5] = '.hhhhhhhh.'; BACK[6] = '.hhhhhhhh.'; BACK[7] = '.shhhhhhs.'; BACK[8] = '..ssssss..';
  const SIDE = [
    '..........', '..........',
    '...hhhh...', '..hhhhhh..', '..hhhhhhh.', '..hhhssss.', '..hhssses.', '..hsssssss', '...sssmm..',
    '...tttt...', '..tttttt..', '..tttttt..', '..tttstt..',
    '...pppp...', '...pppp...', '...pppp...', '...pppp...', '...fffff..',
  ];
  const LEGS = {
    front: [['..pp..pp..', '..pp..pp..', '..ff..ff..'], ['..pp..pp..', '..pp..ff..', '..ff......'], ['..pp..pp..', '..ff..pp..', '......ff..']],
    side: [['...pppp...', '...pppp...', '...fffff..'], ['..pp..pp..', '.pp....pp.', '.ff....ff.'], ['...pppp...', '...pppp...', '...fffff..']],
  };
  const setCh = (rows, y, x, ch) => { rows[y] = rows[y].substring(0, x) + ch + rows[y].substring(x + 1); };
  const setRow = (rows, y, s) => { rows[y] = s; };
  function applyLook(rows, view, L) {
    const isF = view === 'front', isB = view === 'back', isS = view === 'side';
    switch (L.hairStyle) {
      case 'long':
        for (let y = 5; y <= 11; y++) {
          if (isF) { setCh(rows, y, 0, 'h'); setCh(rows, y, 9, 'h'); }
          if (isB) for (let x = 1; x <= 8; x++) setCh(rows, y, x, 'h');
          if (isS) { setCh(rows, y, 1, 'h'); setCh(rows, y, 2, 'h'); }
        }
        break;
      case 'bun':
        if (!isS) { setRow(rows, 0, '...hhhh...'); setRow(rows, 1, '...hhhh...'); } else { setRow(rows, 1, '.hhh......'); setRow(rows, 2, '.hhhhhh...'); }
        break;
      case 'ponytail':
        if (isS) { setCh(rows, 5, 1, 'h'); setCh(rows, 6, 0, 'h'); setCh(rows, 7, 0, 'h'); setCh(rows, 8, 1, 'h'); }
        if (isB) { setCh(rows, 9, 4, 'h'); setCh(rows, 9, 5, 'h'); setCh(rows, 10, 4, 'h'); setCh(rows, 10, 5, 'h'); }
        break;
      case 'spiky': setRow(rows, 1, '..h.hh.h..'); break;
      case 'bald':
        if (isF) { setRow(rows, 2, '..........'); setRow(rows, 3, '..ssssss..'); setRow(rows, 4, '.hssssssh.'); }
        if (isB) { setRow(rows, 2, '..........'); setRow(rows, 3, '..ssssss..'); setRow(rows, 4, '.ssssssss.'); setRow(rows, 5, '.hssssssh.'); }
        if (isS) { setRow(rows, 2, '..........'); setRow(rows, 3, '..ssssss..'); setRow(rows, 4, '..hsssss..'); }
        break;
      case 'cap':
        setRow(rows, 2, '...cccc...'); setRow(rows, 3, '..cccccc..'); setRow(rows, 4, isS ? '..cccccccc' : '.cccccccc.');
        break;
      case 'straw': setRow(rows, 1, '...yyyy...'); setRow(rows, 2, '..yyyyyy..'); setRow(rows, 3, 'yyyyyyyyyy'); break;
      case 'headscarf':
        if (isF) { setRow(rows, 2, '...kkkk...'); setRow(rows, 3, '..kkkkkk..'); setRow(rows, 4, '.kkkkkkkk.'); setRow(rows, 5, '.kssssssk.'); }
        if (isB) { setRow(rows, 2, '...kkkk...'); setRow(rows, 3, '..kkkkkk..'); setRow(rows, 4, '.kkkkkkkk.'); setRow(rows, 5, '.kkkkkkkk.'); setRow(rows, 6, '.kkkkkkkk.'); setRow(rows, 7, '..kkkkkk..'); }
        if (isS) { setRow(rows, 2, '...kkkk...'); setRow(rows, 3, '..kkkkkk..'); setRow(rows, 4, '.kkkkkkk..'); setRow(rows, 5, '.kkkssss..'); }
        break;
    }
    if (L.glasses) {
      if (isF) setRow(rows, 6, '.gegssgeg.');
      if (isS) { setCh(rows, 6, 6, 'g'); setCh(rows, 6, 8, 'g'); setCh(rows, 6, 7, 'e'); }
    }
    if (L.beard) {
      if (isF) { setRow(rows, 7, '.hssssssh.'); setRow(rows, 8, '..hhmmhh..'); }
      if (isS) { setRow(rows, 7, '..hhhhssss'); setRow(rows, 8, '...hhhhh..'); }
    }
    if (L.dress) {
      if (isF || isB) { setRow(rows, 13, '.dddddddd.'); setRow(rows, 14, '.dddddddd.'); } else { setRow(rows, 13, '..dddddd..'); setRow(rows, 14, '..dddddd..'); }
      for (let y = 15; y <= 16; y++) rows[y] = rows[y].replace(/p/g, 'l');
    }
    if (L.apron && !isB) for (let y = 10; y <= 14; y++) for (let x = isS ? 6 : 3; x <= (isS ? 7 : 6); x++) if (rows[y][x] !== '.') setCh(rows, y, x, 'a');
    // embroidered bands across the top (two colours, alternating pixels) - e.g. a Mexican huipil-style blouse
    if (L.bands) for (let y = 10; y <= 11; y++) for (let x = 0; x < 10; x++) if (rows[y][x] === 't') setCh(rows, y, x, (x + y) % 2 ? 'x' : 'z');
    // a flower in the hair (above the ear on the right side; on the back of the head from behind)
    if (L.flower) {
      const fx = isF ? 7 : isB ? 1 : 2;
      setCh(rows, 3, fx, 'o'); setCh(rows, 3, fx + 1, 'o'); setCh(rows, 4, fx, 'o'); setCh(rows, 4, fx + 1, 'o'); setCh(rows, 4, fx + (isB ? 1 : 0), 'y');
    }
    // hoop earrings
    if (L.earrings) { if (isF) { setCh(rows, 7, 1, 'r'); setCh(rows, 7, 8, 'r'); } if (isS) setCh(rows, 7, 3, 'r'); }
    return rows;
  }
  M.person = function (L) {
    L = Object.assign({ skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'short', shirt: '#3a7bd5', pants: '#3a3f55', shoes: '#2a2a2a' }, L);
    const colors = {
      h: L.hair, s: L.skin, e: '#2b2b3a', m: NB.shade(L.skin, 0.78), t: L.shirt, p: L.pants, f: L.shoes,
      g: '#1e1e28', c: L.cap || '#d94a4a', y: '#e8c860', a: L.apron || '#ffffff', d: L.dress || L.shirt, l: L.legs || L.skin, k: L.scarf || '#c0392b',
      x: (L.bands || [])[0] || '#ffd23f', z: (L.bands || [])[1] || '#2fbf71', o: L.flower || '#ff4f7a', r: '#f3c84a',
    };
    const col = (ch) => colors[ch];
    const build = (base, view, legs, post) => {
      const rows = base.slice();
      rows[15] = legs[0]; rows[16] = legs[1]; rows[17] = legs[2];
      applyLook(rows, view, L);
      if (post) post(rows);
      return I.rows(rows, col, { shadowW: 8, shadowH: 1.8 });
    };
    const wave = (top) => (rows) => { // right arm raised, hand at row `top`
      setCh(rows, 12, 8, 't'); setCh(rows, 12, 9, '.');
      for (let y = top + 1; y <= 9; y++) setCh(rows, y, 9, 't');
      setCh(rows, top, 9, 's');
    };
    const side = LEGS.side.map((l) => build(SIDE, 'side', l));
    return {
      down: LEGS.front.map((l) => build(FRONT, 'front', l)),
      up: LEGS.front.map((l) => build(BACK, 'back', l)),
      right: side,
      left: side.map(flipRec),
      wave: [build(FRONT, 'front', LEGS.front[0], wave(6)), build(FRONT, 'front', LEGS.front[0], wave(5))],
      // seated (on a stool / bench): legs folded, the figure ends higher so it sits lower on the same anchor
      sit: {
        down: build(FRONT, 'front', LEGS.front[0], (rows) => { rows[13] = '..pppppp..'; rows[14] = '.pppppppp.'; rows[15] = '.ff....ff.'; rows[16] = '..........'; rows[17] = '..........'; }),
        up: build(BACK, 'back', LEGS.front[0], (rows) => { rows[13] = '..pppppp..'; rows[14] = '..pppppp..'; rows[15] = '..........'; rows[16] = '..........'; rows[17] = '..........'; }),
        right: build(SIDE, 'side', LEGS.side[0], (rows) => { rows[13] = '...ppppp..'; rows[14] = '......ppp.'; rows[15] = '......fff.'; rows[16] = '..........'; rows[17] = '..........'; }),
        left: flipRec(build(SIDE, 'side', LEGS.side[0], (rows) => { rows[13] = '...ppppp..'; rows[14] = '......ppp.'; rows[15] = '......fff.'; rows[16] = '..........'; rows[17] = '..........'; })),
      },
    };
  };

  // ---------- dogs: border collies (drawn facing right; black back and head, white blaze, chest, legs, tail tip) ----------
  const DOG = {
    walk1: ['..........bbb.', '.........bbbbb', 'wb.......bbweb', '.bb......bwwwn', '..bbbbbbbbwwwn', '..bbbbbbbwwww.', '..wbbbbbbbww..', '..ww.ww..ww.ww', '..ww.ww..ww.ww', '..ww.ww..ww.ww'],
    walk2: ['..........bbb.', '.........bbbbb', 'wb.......bbweb', '.bb......bwwwn', '..bbbbbbbbwwwn', '..bbbbbbbwwww.', '..wbbbbbbbww..', '.ww...ww.ww..w', '.ww...ww..ww.w', 'ww....ww..ww..'],
    sit: ['..........bbb.', '.........bbbbb', '.........bbweb', '.........bwwwn', '......bbbbwwwn', '....bbbbbbwww.', '..wbbbbbbbww..', '..wbbbbbbwww..', '..wwbbb..ww...', '..wwww...ww...'],
    lie: ['..............', '..............', '..............', '..........bbb.', '.........bbbbb', 'wb.......bbweb', '.bbbbbbbbbwwwn', '..bbbbbbbbwwwn', '.wwbbbbbbwwww.', '.wwww....wwww.'],
  };
  M.dog = function (L) {
    L = Object.assign({ missing: null }, L);
    const colorOf = (ch) => ({ b: '#1d1b1e', w: '#f4f2ee', e: '#c9a86a', n: '#3a3a3e' }[ch]);
    // the front-left leg is the far front leg when facing right (columns 9-10) and the near one when facing left
    const drop = (rows, cols) => rows.map((r, y) => (y >= 7 ? r.split('').map((c, x) => (cols.includes(x) ? '.' : c)).join('') : r));
    const legless = (rows, near) => (L.missing === 'frontLeft' ? drop(rows, near ? [12, 13] : [9, 10]) : rows);
    const mk = (rows, o) => ({ right: I.rows(legless(rows, false), colorOf, o), left: flipRec(I.rows(legless(rows, true), colorOf, o)) });
    const o = { shadowW: 12, shadowH: 1.8 };
    return { walk: [mk(DOG.walk1, o), mk(DOG.walk2, o)], stand: mk(DOG.walk1, o), sit: mk(DOG.sit, o), lie: mk(DOG.lie, { shadowW: 13, shadowH: 1.6 }) };
  };

  // ---------- cats (drawn facing right) ----------
  const CAT = {
    walk1: ['........c.c.', 'c.......ccc.', 'c.......cecn', '.c.ccccccccc', '..cccccccc..', '..cccccccc..', '..c.c..c.c..', '..w.w..w.w..'],
    walk2: ['........c.c.', '.c......ccc.', 'c.......cecn', 'c..ccccccccc', '..cccccccc..', '..cccccccc..', '...cc...cc..', '...ww...ww..'],
    sit: ['........c.c.', '........ccc.', '........cecn', '.......cccc.', '......ccccc.', '.....cccccc.', '....ccccccc.', 'cc..ccccccc.', '.ccccccwwcc.'],
    sleep: ['............', '............', '............', '............', '.........c.c', '...ccccccccc', '..cccccccczc', '.ccccccccccc', '..ccccccccc.'],
  };
  M.cat = function (L) {
    L = Object.assign({ fur: '#e08a3c', dark: '#a85a22', pattern: 'tabby' }, L);
    const luna = L.pattern === 'luna', mina = L.pattern === 'mina';
    const WHT = '#f8f4ec', BLK = '#2e2a2c', ORG = '#e0883a';
    const colorOf = (ch, x, y) => {
      if (ch === 'e') return luna ? '#c9cf3a' : '#c8e04a';
      if (ch === 'n') return '#f0a0b0';
      if (ch === 'z') return NB.shade(luna || mina ? WHT : L.fur, 0.6);
      if (ch === 'w') return L.pattern === 'tuxedo' || L.pattern === 'socks' || luna || mina || L.pattern === 'calico' ? '#ffffff' : L.fur;
      if (luna) {
        if (x >= 8 && y <= 2) return x <= 9 ? BLK : ORG; // head: black patch left, orange right
        if (x <= 1) return y % 2 ? BLK : ORG; // banded tail
        if (y <= 4 && x >= 3 && x <= 4) return BLK; // back patches
        if (y <= 4 && x >= 6 && x <= 7) return ORG;
        return WHT;
      }
      if (mina) { // calico, but mostly white: small orange spot on the head, one black back patch, tail tip
        if (x === 10 && y <= 1) return ORG;
        if (x === 0) return y % 2 ? BLK : ORG;
        if (y === 3 && x >= 4 && x <= 5) return BLK;
        if (y === 4 && x === 6) return ORG;
        return WHT;
      }
      if (L.pattern === 'tabby' && y >= 3 && y <= 6 && x % 3 === 0) return L.dark;
      if (L.pattern === 'tabby' && y === 1 && x === 9) return L.dark;
      if (L.pattern === 'tuxedo' && ((y >= 3 && x >= 8) || (y >= 7 && x >= 6))) return '#ffffff';
      if (L.pattern === 'calico') { const v = (x * 7 + y * 13) % 11; return v < 3 ? '#e08a3c' : v < 5 ? '#2b2b2b' : '#f6f1e8'; }
      return L.fur;
    };
    const make = (rows) => { const right = I.rows(rows, colorOf, { shadowW: 10, shadowH: 1.6 }); return { right, left: flipRec(right) }; };
    return { walk: [make(CAT.walk1), make(CAT.walk2)], sit: make(CAT.sit), sleep: make(CAT.sleep) };
  };

  // ---------- small ground glow for lamps (additive, banded like pixel art) ----------
  M.glow = function () {
    if (!treeCache.glow) {
      const W = 64, H = 32, pix = new I.Pix(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2), d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        const band = d < 0.35 ? 150 : d < 0.65 ? 95 : 45;
        pix.put(x, y, 255, 205, 120, band);
      }
      treeCache.glow = I.finish(pix, W / 2, H / 2);
    }
    return treeCache.glow;
  };
})(window.NB);
