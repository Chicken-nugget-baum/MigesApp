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
  // b: snapped building spec { cx, cz, w (along u), d (along v), levels, kind, roof, face ('u'|'v') }
  M.house = function (b, i) {
    const m = I.model();
    const small = b.kind === 'garage', chapel = b.kind === 'chapel', floorH = 2.9;
    const H = small ? 2.8 : b.levels * floorH + 0.6;
    const w = Math.max(3, b.w), d = Math.max(3, b.d);
    const wall = chapel ? '#fbf8f2' : small ? '#d9d2c6' : WALLS[i % WALLS.length];
    const roofCol = P.snow ? (i % 3 ? '#f4f7fb' : '#e9eef5') : chapel ? '#6f7486' : small ? '#8a8f9c' : ROOFS[(i * 3) % ROOFS.length];
    const over = small ? 0.2 : 0.6;
    const flat = small && b.roof !== 'gabled';
    const rh = flat ? 0.3 : small ? 0.6 : chapel ? Math.min(w, d) * 0.7 : Math.min(5.5, Math.min(w, d) * 0.42);
    m.shadow(-w / 2, -d / 2, w, d, H + rh * 0.5);
    m.box(-w / 2, -d / 2, 0, w, d, H, wall);
    if (!small) m.box(-w / 2 - 0.08, -d / 2 - 0.08, 0, w + 0.16, d + 0.16, 0.7, '#b9b0a6');
    // roof (ridge along the longer side)
    const along = w >= d ? 'u' : 'v';
    if (flat) m.cbox(0, 0, H, w + 0.3, d + 0.3, rh, roofCol);
    else if (b.roof === 'hipped') m.hip(-w / 2 - over, -d / 2 - over, H, w + over * 2, d + over * 2, rh, roofCol);
    else m.gable(-w / 2 - over, -d / 2 - over, H, w + over * 2, d + over * 2, rh, along, roofCol);
    // chimney on a visible slope
    if (!small && b.kind === 'house' && i % 3 !== 2) {
      const cu = along === 'u' ? w * 0.2 : w * 0.25, cv = along === 'u' ? d * 0.25 : -d * 0.2;
      m.cbox(cu, cv, H + rh * 0.55, 0.7, 0.7, 1.2, '#a8604c');
    }

    // windows on the two visible faces (+u right, +v left); glass lights up at night (light layer)
    const shutter = SHUTTERS[i % SHUTTERS.length];
    const flower = FLOWERS[i % FLOWERS.length];
    const faceBox = (axis, p, off, across, y, dep, len, h, col, o) =>
      axis === 'u' ? m.box(w / 2 + off, p + across - len / 2, y, dep, len, h, col, o) : m.box(p + across - len / 2, d / 2 + off, y, len, dep, h, col, o);
    const addWindow = (axis, p, yc, ground) => {
      faceBox(axis, p, 0, 0, yc - 0.675, 0.08, 1.15, 1.35, '#ffffff');
      faceBox(axis, p, 0.02, 0, yc - 0.55, 0.1, 0.9, 1.1, '#6aa4d8', { light: WINDOW_LIGHT, noOutline: true });
      if (shutter && !small) { faceBox(axis, p, 0, -0.8, yc - 0.675, 0.08, 0.35, 1.35, shutter); faceBox(axis, p, 0, 0.8, yc - 0.675, 0.08, 0.35, 1.35, shutter); }
      if (!small && ground && !P.snow) { faceBox(axis, p, 0, 0, yc - 0.95, 0.3, 1.2, 0.25, '#a8673a'); faceBox(axis, p, 0.06, 0, yc - 0.72, 0.22, 1.1, 0.18, flower, { noOutline: true }); }
    };
    const doorAxis = b.face || 'v';
    if (!small) {
      const levels = chapel ? 1 : b.levels;
      for (const axis of ['u', 'v']) {
        const len = axis === 'u' ? d : w;
        const n = Math.max(1, Math.floor((len - 1.5) / 3.1));
        for (let lv = 0; lv < levels; lv++) {
          const y = chapel ? 2.6 : 1.7 + lv * floorH;
          for (let k = 0; k < n; k++) {
            const p = -len / 2 + ((k + 0.5) * len) / n;
            if (lv === 0 && axis === doorAxis && Math.abs(p) < 1.6) continue; // leave room for the door
            if (chapel && axis === 'u') continue; // the tower end
            addWindow(axis, p, y, lv === 0);
          }
        }
      }
    }
    // door on the street-facing visible face
    const doorCol = small ? '#e4e0d8' : chapel ? '#7a4a2a' : DOORS[i % DOORS.length];
    const faceLen = doorAxis === 'u' ? d : w;
    const dw = small ? Math.min(2.6, faceLen - 0.6) : 1.1, dh = small ? 2.2 : 2.1;
    const doorP = chapel ? 0 : 0;
    faceBox(doorAxis, doorP, 0, 0, 0, 0.12, dw, dh, doorCol);
    if (!small) {
      faceBox(doorAxis, doorP, 0, 0, 0, 0.6, 1.6, 0.18, '#c9c0b6');
      faceBox(doorAxis, doorP, 0.1, 0.32, 1.0, 0.1, 0.12, 0.12, '#f2c23a', { noOutline: true });
    }
    if (b.kind === 'beiz') {
      faceBox(doorAxis, doorP, 0, 0, 2.65, 0.14, 1.9, 0.7, '#c0392b');
      faceBox(doorAxis, doorP, 0.14, 0, 2.92, 0.06, 1.4, 0.16, '#fff6dc', { noOutline: true });
    }
    // chapel: bell tower at the +u end, with spire and cross
    let bellTop = 0;
    if (chapel) {
      const tw = 2.4, th = H + rh + 2.5, tu = w / 2 - tw / 2 - 0.2;
      m.cbox(tu, 0, 0, tw, tw, th, '#fbf8f2');
      m.box(tu + tw / 2, -0.35, th - 1.6, 0.1, 0.7, 1.0, '#3a3a48');
      m.box(tu - 0.35, tw / 2, th - 1.6, 0.7, 0.1, 1.0, '#3a3a48');
      m.pyramid(tu - tw * 0.6, -tw * 0.6, th, tw * 1.2, tw * 1.2, 3.6, '#5b6070');
      m.cbox(tu, 0, th + 3.5, 0.14, 0.14, 1.1, '#e8c547', { noOutline: true });
      m.cbox(tu, 0, th + 4.1, 0.6, 0.14, 0.14, '#e8c547', { noOutline: true });
      bellTop = th + 1;
    }
    const r = m.render();
    r.height = H + rh; r.bellTop = bellTop;
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
    return rows;
  }
  M.person = function (L) {
    L = Object.assign({ skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'short', shirt: '#3a7bd5', pants: '#3a3f55', shoes: '#2a2a2a' }, L);
    const colors = {
      h: L.hair, s: L.skin, e: '#2b2b3a', m: NB.shade(L.skin, 0.78), t: L.shirt, p: L.pants, f: L.shoes,
      g: '#1e1e28', c: L.cap || '#d94a4a', y: '#e8c860', a: L.apron || '#ffffff', d: L.dress || L.shirt, l: L.legs || L.skin, k: L.scarf || '#c0392b',
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
    };
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
    const luna = L.pattern === 'luna';
    const WHT = '#f8f4ec', BLK = '#2e2a2c', ORG = '#e0883a';
    const colorOf = (ch, x, y) => {
      if (ch === 'e') return luna ? '#c9cf3a' : '#c8e04a';
      if (ch === 'n') return '#f0a0b0';
      if (ch === 'z') return NB.shade(luna ? WHT : L.fur, 0.6);
      if (ch === 'w') return L.pattern === 'tuxedo' || L.pattern === 'socks' || luna || L.pattern === 'calico' ? '#ffffff' : L.fur;
      if (luna) {
        if (x >= 8 && y <= 2) return x <= 9 ? BLK : ORG; // head: black patch left, orange right
        if (x <= 1) return y % 2 ? BLK : ORG; // banded tail
        if (y <= 4 && x >= 3 && x <= 4) return BLK; // back patches
        if (y <= 4 && x >= 6 && x <= 7) return ORG;
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
