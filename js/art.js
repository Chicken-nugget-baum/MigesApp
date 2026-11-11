// All pixel art is generated here in code (tiles, buildings, people, animals, vehicles).
// To swap in an asset pack later, replace the generator functions with image loaders
// that return canvases/images of the same size.
(function (NB) {
  const T = NB.TILE;
  const TER = NB.TER;
  const OUT = '#2a2030';
  const Art = (NB.Art = {});

  // ---------- seasonal palettes ----------
  const PAL = {
    spring: { grass: ['#78c25a', '#68b04c', '#8ad06c'], flowers: ['#ffffff', '#ffe066', '#ff9ecf', '#b9a4ff'],
      leaf: ['#5fae4a', '#468f37', '#86cc66'], pine: ['#2f6b3a', '#245a2f', '#3f8048'], path: '#b8925f', dirt: '#a07a4a',
      soil: '#8a6644', crops: ['#7cbf55', '#6a9a40', '#f2d43a', '#5fae4a'], water: '#3f7fc4', snow: false },
    summer: { grass: ['#6db34f', '#5ea043', '#7fc35f'], flowers: ['#ffffff', '#ffd23f', '#ff7aa8'],
      leaf: ['#4f9a3c', '#3c7f2e', '#6cb34f'], pine: ['#2f6b3a', '#245a2f', '#3f8048'], path: '#bf9a64', dirt: '#a8824e',
      soil: '#8a6644', crops: ['#e0c35a', '#3f8f35', '#8aa04a', '#4f9f3c'], water: '#3a7bc2', snow: false },
    autumn: { grass: ['#93a84c', '#829742', '#a6b85e'], flowers: null,
      leaf: ['#d9822b', '#b85a1f', '#eab046'], pine: ['#2f6b3a', '#245a2f', '#3f8048'], path: '#b08a5a', dirt: '#9a7446',
      soil: '#7a5a3c', crops: ['#c9b07a', '#c8b060', '#7a5a3c', '#5a9a3c'], water: '#3a72b0', snow: false },
    winter: { grass: ['#e8eef3', '#d5dfe8', '#f6f9fb'], flowers: null,
      leaf: ['#e3ebf2', '#c3d1de', '#ffffff'], pine: ['#2d5f3c', '#22502f', '#3a7348'], path: '#cfc8c0', dirt: '#c4bab0',
      soil: '#bfb3a5', crops: ['#eef3f6', '#eef3f6', '#eef3f6', '#eef3f6'], water: '#56789a', snow: true },
  };
  Art.pal = PAL[NB.season] || PAL.summer;
  const P = Art.pal;

  // ---------- helpers ----------
  function px(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }

  function outline(c, color) {
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    const d = g.getImageData(0, 0, W, H).data;
    const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[(y * W + x) * 4 + 3]);
    g.fillStyle = color || OUT;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (a(x, y)) continue;
        if (a(x + 1, y) > 128 || a(x - 1, y) > 128 || a(x, y + 1) > 128 || a(x, y - 1) > 128) g.fillRect(x, y, 1, 1);
      }
    return c;
  }
  Art.outline = outline;

  // rows: array of strings; colorOf(ch, x, y) -> css color or null
  function fromRows(rows, colorOf, pad) {
    pad = pad == null ? 1 : pad;
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const [c, g] = NB.canvas(w + pad * 2, h + pad * 2);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === '.' || ch === ' ') continue;
        const col = colorOf(ch, x, y);
        if (col) px(g, x + pad, y + pad, col);
      }
    if (pad) outline(c);
    return c;
  }
  Art.fromRows = fromRows;

  function flipX(src) {
    const [c, g] = NB.canvas(src.width, src.height);
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }
  Art.flipX = flipX;

  // ---------- ground ----------
  const roadLike = (t) => t === TER.ROAD || t === TER.STREET;

  function paintTile(g, map, x, y) {
    const t = map.terrain[y * map.w + x];
    const ox = x * T, oy = y * T;
    const r = NB.seeded(x * 7919 + y * 104729 + 13);
    const nb = (dx, dy) => map.ter(x + dx, y + dy);
    switch (t) {
      case TER.GRASS: {
        g.fillStyle = P.grass[0]; g.fillRect(ox, oy, T, T);
        for (let i = 0; i < 14; i++) px(g, ox + ((r() * T) | 0), oy + ((r() * T) | 0), r() < 0.5 ? P.grass[1] : P.grass[2]);
        if (r() < 0.35) {
          const tx = ox + 1 + ((r() * 12) | 0), ty = oy + 3 + ((r() * 11) | 0);
          g.fillStyle = P.grass[1]; g.fillRect(tx, ty, 1, 2); g.fillRect(tx + 2, ty - 1, 1, 2);
        }
        if (P.flowers && r() < 0.13) {
          const n = 1 + ((r() * 3) | 0);
          for (let i = 0; i < n; i++) px(g, ox + 1 + ((r() * 14) | 0), oy + 1 + ((r() * 14) | 0), P.flowers[(r() * P.flowers.length) | 0]);
        }
        break;
      }
      case TER.ROAD:
      case TER.STREET: {
        const base = t === TER.ROAD ? '#696a72' : '#7b7b82';
        g.fillStyle = base; g.fillRect(ox, oy, T, T);
        for (let i = 0; i < 10; i++) px(g, ox + ((r() * T) | 0), oy + ((r() * T) | 0), r() < 0.5 ? NB.shade(base, 0.88) : NB.shade(base, 1.12));
        if (P.snow) for (let i = 0; i < 5; i++) px(g, ox + ((r() * T) | 0), oy + ((r() * T) | 0), '#e8eef3');
        g.fillStyle = '#b9b4aa';
        if (!roadLike(nb(-1, 0))) g.fillRect(ox, oy, 1, T);
        if (!roadLike(nb(1, 0))) g.fillRect(ox + T - 1, oy, 1, T);
        if (!roadLike(nb(0, -1))) g.fillRect(ox, oy, T, 1);
        if (!roadLike(nb(0, 1))) g.fillRect(ox, oy + T - 1, T, 1);
        if (map.dash && map.dash(x, y)) { g.fillStyle = '#f2f2ea'; g.fillRect(ox + 7, oy + 3, 2, 9); }
        if (map.dashH && map.dashH(x, y)) { g.fillStyle = '#f2f2ea'; g.fillRect(ox + 3, oy + 15, 9, 1); }
        break;
      }
      case TER.PATH:
      case TER.DIRT: {
        const base = t === TER.PATH ? P.path : P.dirt;
        g.fillStyle = base; g.fillRect(ox, oy, T, T);
        for (let i = 0; i < 12; i++) px(g, ox + ((r() * T) | 0), oy + ((r() * T) | 0), r() < 0.6 ? NB.shade(base, 0.85) : NB.shade(base, 1.15));
        if (t === TER.DIRT && !P.snow) for (let i = 0; i < 3; i++) { g.fillStyle = '#e2c46a'; g.fillRect(ox + ((r() * 13) | 0), oy + ((r() * 15) | 0), 3, 1); }
        break;
      }
      case TER.PLAZA: {
        g.fillStyle = '#7e786f'; g.fillRect(ox, oy, T, T);
        for (let row = 0; row < 4; row++)
          for (let col = -1; col < 4; col++) {
            const sx = ox + col * 4 + (row % 2 ? 2 : 0), sy = oy + row * 4;
            const x0 = Math.max(sx, ox), x1 = Math.min(sx + 3, ox + T);
            if (x1 <= x0) continue;
            g.fillStyle = ['#a39d93', '#9a948a', '#aca69b'][(r() * 3) | 0];
            if (P.snow && r() < 0.4) g.fillStyle = '#e4e9ee';
            g.fillRect(x0, sy, x1 - x0, 3);
          }
        break;
      }
      case TER.FIELD: {
        const crop = map.crop[y * map.w + x];
        g.fillStyle = P.soil; g.fillRect(ox, oy, T, T);
        const cc = P.crops[crop];
        for (let yy = 0; yy < T; yy++) {
          if ((oy + yy) % 4 < 2) {
            g.fillStyle = cc; g.fillRect(ox, oy + yy, T, 1);
            for (let i = 0; i < 3; i++) px(g, ox + ((r() * T) | 0), oy + yy, NB.shade(cc, r() < 0.5 ? 0.85 : 1.12));
            if (crop === 3 && NB.season === 'summer' && r() < 0.5) px(g, ox + ((r() * T) | 0), oy + yy, '#f08a24');
          }
        }
        break;
      }
      case TER.WATER: {
        g.fillStyle = P.water; g.fillRect(ox, oy, T, T);
        for (let i = 0; i < 3; i++) { g.fillStyle = NB.shade(P.water, 1.25); g.fillRect(ox + ((r() * 12) | 0), oy + ((r() * 15) | 0), 3, 1); }
        g.fillStyle = NB.shade(P.water, 0.8);
        for (let i = 0; i < 2; i++) g.fillRect(ox + ((r() * 12) | 0), oy + ((r() * 15) | 0), 2, 1);
        const bank = P.snow ? '#dfe6ec' : '#cdb98a';
        g.fillStyle = bank;
        if (nb(-1, 0) !== TER.WATER) g.fillRect(ox, oy, 2, T);
        if (nb(1, 0) !== TER.WATER) g.fillRect(ox + T - 2, oy, 2, T);
        break;
      }
    }
  }

  function paintFence(g, f) {
    const ox = f.x * T, oy = f.y * T;
    const wood = P.snow ? '#7a5636' : '#8a5a32', dark = '#5e3c20';
    if (f.dir === 'h') {
      g.fillStyle = wood; g.fillRect(ox, oy + 6, T, 2); g.fillRect(ox, oy + 10, T, 2);
      g.fillStyle = dark; g.fillRect(ox, oy + 8, T, 1); g.fillRect(ox, oy + 12, T, 1);
      g.fillStyle = wood; g.fillRect(ox + 1, oy + 4, 2, 10); g.fillRect(ox + 9, oy + 4, 2, 10);
      g.fillStyle = dark; g.fillRect(ox + 3, oy + 4, 1, 10); g.fillRect(ox + 11, oy + 4, 1, 10);
    } else {
      g.fillStyle = wood; g.fillRect(ox + 7, oy, 2, T);
      g.fillStyle = dark; g.fillRect(ox + 9, oy, 1, T);
      g.fillStyle = wood; g.fillRect(ox + 6, oy + 2, 4, 3); g.fillRect(ox + 6, oy + 10, 4, 3);
    }
  }

  function paintTrack(g, tr) {
    const cx = tr.cx, cy = tr.cy;
    for (let a = 0; a < Math.PI * 2; a += 0.11) {
      const c = Math.cos(a), s = Math.sin(a);
      g.fillStyle = '#7a5838';
      g.fillRect(Math.round(cx + c * tr.rx) - 1, Math.round(cy + s * tr.ry) - 1, 3, 3);
    }
    for (let a = 0; a < Math.PI * 2; a += 0.012) {
      const c = Math.cos(a), s = Math.sin(a);
      g.fillStyle = '#9aa0a8';
      px(g, Math.round(cx + c * (tr.rx - 1.5)), Math.round(cy + s * (tr.ry - 1.5)), '#9aa0a8');
      px(g, Math.round(cx + c * (tr.rx + 1.5)), Math.round(cy + s * (tr.ry + 1.5)), '#9aa0a8');
    }
  }

  function paintFlowerbed(g, b) {
    const r = NB.seeded(b.x * 31 + b.y * 17);
    for (let y = b.y * T; y < (b.y + b.h) * T; y++)
      for (let x = b.x * T; x < (b.x + b.w) * T; x++) {
        const v = r();
        if (v < 0.55) px(g, x, y, '#6b4a30');
        else if (v < 0.85) px(g, x, y, P.snow ? '#e4ebf0' : '#4f9a3c');
        else if (!P.snow) px(g, x, y, ['#ff5d73', '#ffd23f', '#ffffff', '#c58cff'][(r() * 4) | 0]);
      }
  }

  Art.renderGround = function (map) {
    const [c, g] = NB.canvas(map.w * T, map.h * T);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) paintTile(g, map, x, y);
    (map.flowerbeds || []).forEach((b) => paintFlowerbed(g, b));
    (map.fences || []).forEach((f) => paintFence(g, f));
    if (map.track) paintTrack(g, map.track);
    return c;
  };

  // ---------- trees ----------
  function blobTree(seed) {
    const r = NB.seeded(seed);
    const W = 22, H = 28;
    const [c, g] = NB.canvas(W, H);
    g.fillStyle = '#6b4a2e'; g.fillRect(9, 16, 4, 11);
    g.fillStyle = '#4f3520'; g.fillRect(12, 16, 1, 11); g.fillRect(8, 26, 6, 1);
    const blobs = [[11, 10, 7.5 + r() * 1.5], [6.5, 12, 4.5 + r()], [15.5, 12, 4.5 + r()], [11, 5.5, 4.5 + r()]];
    for (let y = 0; y < 21; y++)
      for (let x = 0; x < W; x++) {
        let inside = false;
        for (const [bx, by, br] of blobs) if ((x - bx) ** 2 + (y - by) ** 2 <= br * br) inside = true;
        if (!inside) continue;
        let col = P.leaf[0];
        const d = (x - 11) * 0.6 + (y - 9);
        if (d > 4.5) col = P.leaf[1];
        else if (d < -5) col = P.leaf[2];
        if (r() < 0.12) col = r() < 0.5 ? P.leaf[1] : P.leaf[2];
        px(g, x, y, col);
      }
    if (NB.season === 'autumn') for (let i = 0; i < 8; i++) px(g, (r() * W) | 0, 22 + ((r() * 5) | 0), P.leaf[(r() * 3) | 0]);
    return outline(c);
  }

  function pineTree(seed) {
    const r = NB.seeded(seed);
    const W = 17, H = 31;
    const [c, g] = NB.canvas(W, H);
    g.fillStyle = '#5b3d24'; g.fillRect(7, 23, 3, 7);
    const tiers = [[1, 11, 4.5], [6, 17, 6], [11, 24, 7.5]];
    const inside = (x, y) => tiers.some(([top, bot, hw]) => y >= top && y <= bot && Math.abs(x - 8) <= ((y - top) / (bot - top)) * hw + 0.6);
    for (let y = 0; y < 25; y++)
      for (let x = 0; x < W; x++) {
        if (!inside(x, y)) continue;
        let col = x > 8 ? P.pine[1] : P.pine[0];
        if (x < 7 && r() < 0.3) col = P.pine[2];
        if (P.snow && !inside(x, y - 1)) col = '#f4f8fb';
        else if (P.snow && r() < 0.1) col = '#e6eef4';
        px(g, x, y, col);
      }
    return outline(c);
  }

  const treeCache = {};
  Art.tree = function (kind, variant) {
    const key = kind + variant;
    if (!treeCache[key]) treeCache[key] = kind === 'pine' ? pineTree(variant * 97 + 5) : blobTree(variant * 131 + 7);
    return treeCache[key];
  };

  Art.bush = function (variant) {
    const key = 'bush' + variant;
    if (treeCache[key]) return treeCache[key];
    const r = NB.seeded(variant * 53 + 1);
    const [c, g] = NB.canvas(14, 10);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 14; x++) {
        const inside = ((x - 4) ** 2) / 16 + ((y - 5.5) ** 2) / 16 <= 1 || ((x - 9.5) ** 2) / 16 + ((y - 5) ** 2) / 20 <= 1;
        if (!inside) continue;
        px(g, x, y, y > 6 ? P.leaf[1] : r() < 0.2 ? P.leaf[2] : P.leaf[0]);
      }
    if (!P.snow && NB.season !== 'autumn' && r() < 0.6) for (let i = 0; i < 3; i++) px(g, 2 + ((r() * 10) | 0), 2 + ((r() * 5) | 0), ['#ff5d73', '#ffffff', '#ffd23f'][i % 3]);
    return (treeCache[key] = outline(c));
  };

  // ---------- buildings ----------
  // spec: { w, h (tiles), wall, roof, timber, shutters, chimney, kind, door (tile col), sign }
  Art.building = function (s) {
    const W = s.w * T, footH = s.h * T, over = 10;
    const tower = s.kind === 'chapel' ? 40 : s.kind === 'gnadenthal' ? 30 : 0;
    const H = footH + over;
    const PADX = 2;
    const [c, g] = NB.canvas(W + PADX * 2 + 2, H + tower + 2);
    const top = tower + 1;
    const roofH = Math.round(H * (s.kind === 'barn' ? 0.55 : 0.5));
    const fTop = top + roofH, fH = H - roofH;
    const ox = PADX + 1;
    const r = NB.seeded(s.w * 13 + s.h * 7 + (s.seed || 0));
    const windows = [];

    // facade
    g.fillStyle = s.wall; g.fillRect(ox, fTop, W, fH);
    if (s.kind === 'barn') {
      for (let x = ox; x < ox + W; x += 3) { g.fillStyle = NB.shade(s.wall, 0.82); g.fillRect(x, fTop, 1, fH); }
    }
    g.fillStyle = NB.shade(s.wall, 0.85); g.fillRect(ox + W - 2, fTop, 2, fH);
    g.fillStyle = '#8a8378'; g.fillRect(ox, fTop + fH - 3, W, 3);

    if (s.timber) {
      const beam = '#5a3a22';
      g.fillStyle = beam;
      g.fillRect(ox, fTop, W, 1);
      const mid = fTop + Math.floor(fH / 2);
      g.fillRect(ox, mid, W, 1);
      for (let x = ox; x <= ox + W - 1; x += 12) g.fillRect(x, fTop, 1, fH - 3);
      g.fillRect(ox + W - 1, fTop, 1, fH - 3);
      for (let x = ox; x + 12 <= ox + W; x += 24) {
        for (let i = 0; i < 12; i++) {
          px(g, x + i, fTop + Math.round((i * (mid - fTop)) / 12), beam);
        }
      }
    }

    // door
    const doorW = s.kind === 'barn' ? 20 : 8, doorH = s.kind === 'barn' ? 18 : 12;
    const doorX = ox + (s.door != null ? s.door : Math.floor(s.w / 2)) * T + T / 2 - doorW / 2;
    const doorY = fTop + fH - doorH;
    // windows
    if (s.kind !== 'barn') {
      const rows = fH >= 36 ? 2 : 1;
      const n = Math.max(1, Math.floor((W - 6) / 14));
      for (let row = 0; row < rows; row++) {
        const wy = rows === 2 ? (row === 0 ? fTop + 5 : fTop + fH - 15) : fTop + Math.max(4, Math.floor(fH / 2) - 6);
        for (let i = 0; i < n; i++) {
          const wx = Math.round(ox + ((i + 0.5) * W) / n) - 3;
          if (row === rows - 1 && wx + 8 > doorX - 2 && wx < doorX + doorW + 2) continue;
          if (s.kind === 'chapel' && wx > ox + W - 18) continue;
          // shutters
          if (s.shutters) { g.fillStyle = s.shutters; g.fillRect(wx - 2, wy, 2, 7); g.fillRect(wx + 6, wy, 2, 7); }
          g.fillStyle = '#f4efe6'; g.fillRect(wx, wy, 6, 7);
          g.fillStyle = '#5b88b5'; g.fillRect(wx + 1, wy + 1, 4, 5);
          g.fillStyle = '#89b4dc'; g.fillRect(wx + 1, wy + 1, 1, 2);
          g.fillStyle = '#f4efe6'; g.fillRect(wx + 1, wy + 3, 4, 1);
          if (!P.snow && s.flowers && row === rows - 1 && r() < 0.6) {
            g.fillStyle = '#7a4a2a'; g.fillRect(wx - 1, wy + 7, 8, 2);
            px(g, wx, wy + 6, '#ff5d73'); px(g, wx + 2, wy + 6, '#ffd23f'); px(g, wx + 4, wy + 6, '#ff5d73');
          }
          windows.push({ x: wx + 3 - PADX - 1, y: wy + 3 - top });
        }
      }
    }
    if (s.kind === 'chapel') {
      // tall coloured window
      const wx = ox + 6, wy = fTop + 4;
      g.fillStyle = '#e8e4da'; g.fillRect(wx, wy, 8, fH - 9);
      for (let y = wy + 1; y < wy + fH - 10; y++)
        for (let x = wx + 1; x < wx + 7; x++) px(g, x, y, ['#d94a4a', '#3a6fd1', '#f2c23a', '#4aa05a'][(x + y * 3) % 4]);
      windows.push({ x: wx + 4 - PADX - 1, y: wy + 8 - top });
    }
    // door
    if (s.kind === 'barn') {
      g.fillStyle = '#5c3218'; g.fillRect(doorX, doorY, doorW, doorH);
      g.fillStyle = '#7a4524'; g.fillRect(doorX + 1, doorY + 1, doorW / 2 - 1, doorH - 1); g.fillRect(doorX + doorW / 2 + 1, doorY + 1, doorW / 2 - 2, doorH - 1);
      g.fillStyle = '#e6d9c0';
      for (let i = 0; i < doorH; i++) { px(g, doorX + Math.round((i * (doorW / 2 - 1)) / doorH), doorY + i, '#e6d9c0'); px(g, doorX + doorW / 2 - 1 - Math.round((i * (doorW / 2 - 1)) / doorH), doorY + i, '#e6d9c0'); }
    } else {
      g.fillStyle = '#4a2c18'; g.fillRect(doorX - 1, doorY - 1, doorW + 2, doorH + 1);
      g.fillStyle = s.doorColor || '#7a4a2a'; g.fillRect(doorX, doorY, doorW, doorH);
      g.fillStyle = NB.shade(s.doorColor || '#7a4a2a', 0.8); g.fillRect(doorX + doorW / 2, doorY, 1, doorH);
      px(g, doorX + doorW - 2, doorY + 6, '#f2c23a');
    }
    // sign board
    if (s.sign) {
      const sx = doorX + doorW + 3, sy = fTop + 2;
      g.fillStyle = '#3a2a1a'; g.fillRect(sx, sy, 14, 6);
      g.fillStyle = s.sign; g.fillRect(sx + 1, sy + 1, 12, 4);
      for (let i = 0; i < 5; i++) px(g, sx + 2 + i * 2, sy + 3, '#ffffff');
    }

    // roof
    const roof = s.roof;
    const rx = ox - 2, rw = W + 4;
    g.fillStyle = roof; g.fillRect(rx, top, rw, roofH);
    for (let y = top + 3; y < top + roofH; y += 4) {
      g.fillStyle = NB.shade(roof, 0.8); g.fillRect(rx, y, rw, 1);
      for (let x = rx + ((y / 4) % 2 ? 2 : 0); x < rx + rw; x += 5) px(g, x, y - 1, NB.shade(roof, 0.88));
    }
    g.fillStyle = NB.shade(roof, 1.25); g.fillRect(rx, top, rw, 2);
    g.fillStyle = NB.shade(roof, 0.65); g.fillRect(rx, top + roofH - 2, rw, 2);
    if (P.snow) {
      g.fillStyle = '#f2f6f9'; g.fillRect(rx, top, rw, Math.floor(roofH * 0.7));
      g.fillStyle = '#dbe4ec';
      for (let y = top + 3; y < top + Math.floor(roofH * 0.7); y += 4) g.fillRect(rx, y, rw, 1);
    }
    if (s.chimney) {
      const cx = rx + 6 + ((r() * (rw - 16)) | 0);
      g.fillStyle = '#9a5a4a'; g.fillRect(cx, top - 6, 5, 9);
      g.fillStyle = '#5a3028'; g.fillRect(cx - 1, top - 7, 7, 2);
    }

    // towers
    if (s.kind === 'chapel') {
      const tw = 12, tx = ox + W - tw - 2, ty = 1;
      g.fillStyle = '#ece8e0'; g.fillRect(tx, ty + 12, tw, fTop + fH - ty - 12);
      g.fillStyle = '#cfc9bd'; g.fillRect(tx + tw - 2, ty + 12, 2, fTop + fH - ty - 12);
      g.fillStyle = '#4a4a55'; g.fillRect(tx + 3, ty + 18, 6, 7); // bell window
      g.fillStyle = '#c9a43a'; g.fillRect(tx + 5, ty + 21, 2, 3); // bell
      g.fillStyle = '#4a4a55'; g.fillRect(tx + 5, ty + 32, 2, 8);
      // spire
      for (let i = 0; i < 12; i++) { g.fillStyle = i < 3 ? '#3b3f4a' : '#555b68'; g.fillRect(tx + 6 - Math.floor(i / 2), ty + i, Math.max(1, Math.floor(i / 2) * 2 + 1) , 1); }
      g.fillStyle = '#e8c547'; g.fillRect(tx + 6, ty - 1, 1, 4); g.fillRect(tx + 5, ty, 3, 1);
    }
    if (s.kind === 'gnadenthal') {
      const tw = 12, tx = ox + Math.floor(W / 2) - 6, ty = 1;
      g.fillStyle = '#efe6d2'; g.fillRect(tx, ty + 10, tw, fTop - ty - 6);
      g.fillStyle = '#4a4a55'; g.fillRect(tx + 4, ty + 16, 4, 6);
      g.fillStyle = '#3f7a5a'; // onion dome (green copper)
      const dome = [2, 4, 6, 8, 10, 10, 8, 6, 12];
      dome.forEach((wd, i) => g.fillRect(tx + 6 - wd / 2, ty + 1 + i, wd, 1));
      g.fillStyle = '#e8c547'; g.fillRect(tx + 6, ty - 2, 1, 4);
    }

    outline(c);
    return { canvas: c, offX: ox, top, over, windows };
  };

  // ---------- small props ----------
  const propCache = {};
  function cached(key, fn) { return propCache[key] || (propCache[key] = fn()); }

  Art.lamp = () => cached('lamp', () => {
    const [c, g] = NB.canvas(7, 24);
    g.fillStyle = '#3a3a44'; g.fillRect(3, 4, 1, 19); g.fillRect(2, 22, 3, 2);
    g.fillStyle = '#2a2a32'; g.fillRect(1, 1, 5, 3);
    g.fillStyle = '#ffe9a8'; g.fillRect(2, 4, 3, 1);
    return outline(c);
  });
  Art.bench = () => cached('bench', () => {
    const [c, g] = NB.canvas(15, 8);
    g.fillStyle = '#8a5a32'; g.fillRect(0, 0, 15, 2); g.fillRect(0, 3, 15, 2);
    g.fillStyle = '#5e3c20'; g.fillRect(1, 5, 1, 3); g.fillRect(13, 5, 1, 3); g.fillRect(0, 2, 15, 1);
    return outline(c);
  });
  Art.fountain = () => cached('fountain', () => {
    const rows = [
      '.........ss.........',
      '........ssss........',
      '........sbbs........',
      '........ssss........',
      '..oooooosssssoooooo.',
      '.osssssssssssssssso.',
      'osswwwwwwssswwwwwwso',
      'oswwwwwwwssswwwwwwso',
      'oswwwwwwwwwwwwwwwwso',
      'osswwwwwwwwwwwwwwsso',
      '.osssssssssssssssso.',
      '..oooooooooooooooo..',
    ];
    return fromRows(rows, (ch) => ({ s: '#a8a49a', o: '#8a867c', w: P.snow ? '#b7d4ea' : '#5aa0e0', b: '#5aa0e0' })[ch]);
  });
  Art.busStop = () => cached('busstop', () => {
    const [c, g] = NB.canvas(20, 22);
    g.fillStyle = '#3a3a44'; g.fillRect(2, 6, 1, 15); g.fillRect(15, 6, 1, 15);
    g.fillStyle = 'rgba(180,215,240,0.55)'; g.fillRect(3, 7, 12, 13);
    g.fillStyle = '#55555f'; g.fillRect(1, 4, 16, 3);
    g.fillStyle = '#8a5a32'; g.fillRect(4, 15, 10, 2);
    g.fillStyle = '#3a3a44'; g.fillRect(18, 4, 1, 17);
    g.fillStyle = '#ffd200'; g.fillRect(16, 0, 5, 6);
    g.fillStyle = '#2d7a3c'; g.fillRect(17, 1, 1, 4); g.fillRect(19, 1, 1, 4); g.fillRect(18, 3, 1, 1);
    return outline(c);
  });
  Art.placeSign = (blue) => cached('sign' + blue, () => {
    const [c, g] = NB.canvas(22, 16);
    g.fillStyle = '#6a6a72'; g.fillRect(3, 8, 1, 8); g.fillRect(18, 8, 1, 8);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 22, 10);
    g.fillStyle = blue ? '#2a5fb0' : '#ffffff'; g.fillRect(1, 1, 20, 8);
    g.fillStyle = blue ? '#ffffff' : '#222222';
    for (let i = 0; i < 8; i++) g.fillRect(3 + i * 2, 4, 1, 2);
    return outline(c);
  });
  Art.hayBale = () => cached('hay', () => {
    const rows = ['..yyyyyy..', '.yyhyyhyy.', 'yyhyyyyhyy', 'yhyyhyyyhy', 'yyyyyyhyyy', 'yyhyyyyyhy', '.yyyhyyyy.', '..yyyyyy..'];
    return fromRows(rows, (ch) => ({ y: P.snow ? '#e8e2cf' : '#e2c46a', h: '#b8963e' })[ch]);
  });
  Art.table = () => cached('table', () => {
    const rows = ['...rrrrrrr...', '.rrwrrwrrwr..', 'rrrrrrrrrrrr.', '.....p.......', '.....p.......', '..tttttttt...', '..t......t...'];
    return fromRows(rows, (ch) => ({ r: '#d94a4a', w: '#ffffff', p: '#555', t: '#8a5a32' })[ch]);
  });

  // ---------- people ----------
  // base templates 10 wide; two rows head-room on top
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

  function setCh(rows, y, x, ch) { rows[y] = rows[y].substring(0, x) + ch + rows[y].substring(x + 1); }
  function setRow(rows, y, s) { rows[y] = s; }

  function applyLook(rows, view, L) {
    const isF = view === 'front', isB = view === 'back', isS = view === 'side';
    // hair styles
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
      case 'spiky':
        setRow(rows, 1, '..h.hh.h..');
        break;
      case 'bald':
        if (isF) { setRow(rows, 2, '..........'); setRow(rows, 3, '..ssssss..'); setRow(rows, 4, '.hssssssh.'); }
        if (isB) { setRow(rows, 2, '..........'); setRow(rows, 3, '..ssssss..'); setRow(rows, 4, '.ssssssss.'); setRow(rows, 5, '.hsssssh..'.replace('h..', 'sh.')); }
        if (isS) { setRow(rows, 2, '..........'); setRow(rows, 3, '..ssssss..'); setRow(rows, 4, '..hsssss..'); }
        break;
      case 'cap':
        if (isF) { setRow(rows, 2, '...cccc...'); setRow(rows, 3, '..cccccc..'); setRow(rows, 4, '.cccccccc.'); }
        if (isB) { setRow(rows, 2, '...cccc...'); setRow(rows, 3, '..cccccc..'); setRow(rows, 4, '.cccccccc.'); }
        if (isS) { setRow(rows, 2, '...cccc...'); setRow(rows, 3, '..cccccc..'); setRow(rows, 4, '..ccccccccc'.slice(0, 10)); }
        break;
      case 'straw':
        setRow(rows, 1, '...yyyy...'); setRow(rows, 2, '..yyyyyy..'); setRow(rows, 3, 'yyyyyyyyyy');
        break;
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
      for (let y = 13; y <= 14; y++) rows[y] = rows[y].replace(/p/g, 'd');
      if (isF || isB) { setRow(rows, 13, '.dddddddd.'); setRow(rows, 14, '.dddddddd.'); }
      if (isS) { setRow(rows, 13, '..dddddd..'); setRow(rows, 14, '..dddddd..'); }
      for (let y = 15; y <= 16; y++) rows[y] = rows[y].replace(/p/g, 'l');
    }
    if (L.apron && !isB) {
      for (let y = 10; y <= 14; y++) for (let x = isS ? 6 : 3; x <= (isS ? 7 : 6); x++) if (rows[y][x] !== '.') setCh(rows, y, x, 'a');
    }
    return rows;
  }

  Art.person = function (L) {
    L = Object.assign({ skin: '#f1c7a0', hair: '#5a3a22', hairStyle: 'short', shirt: '#3a7bd5', pants: '#3a3f55', shoes: '#2a2a2a' }, L);
    const colors = {
      h: L.hair, s: L.skin, e: '#2b2b3a', m: NB.shade(L.skin, 0.78), t: L.shirt, p: L.pants, f: L.shoes,
      g: '#1e1e28', c: L.cap || '#d94a4a', y: '#e8c860', a: L.apron || '#ffffff', d: L.dress || L.shirt, l: L.legs || L.skin,
      k: L.scarf || '#c0392b',
    };
    const col = (ch) => colors[ch];
    const build = (base, view, legs) => {
      const rows = base.slice();
      rows[15] = legs[0]; rows[16] = legs[1]; rows[17] = legs[2];
      return fromRows(applyLook(rows, view, L), col);
    };
    const side = LEGS.side.map((l) => build(SIDE, 'side', l));
    return {
      down: LEGS.front.map((l) => build(FRONT, 'front', l)),
      up: LEGS.front.map((l) => build(BACK, 'back', l)),
      right: side,
      left: side.map(flipX),
    };
  };

  // ---------- animals (all drawn facing right) ----------
  const CAT = {
    walk1: ['........c.c.', 'c.......ccc.', 'c.......cecn', '.c.ccccccccc', '..cccccccc..', '..cccccccc..', '..c.c..c.c..', '..w.w..w.w..'],
    walk2: ['........c.c.', '.c......ccc.', 'c.......cecn', 'c..ccccccccc', '..cccccccc..', '..cccccccc..', '...cc...cc..', '...ww...ww..'],
    sit: ['........c.c.', '........ccc.', '........cecn', '.......cccc.', '......ccccc.', '.....cccccc.', '....ccccccc.', 'cc..ccccccc.', '.ccccccwwcc.'],
    sleep: ['............', '............', '............', '............', '.........c.c', '...ccccccccc', '..cccccccczc', '.ccccccccccc', '..ccccccccc.'],
  };
  Art.cat = function (L) {
    L = Object.assign({ fur: '#e08a3c', dark: '#a85a22', pattern: 'tabby' }, L);
    const make = (rows) => {
      const c = fromRows(rows, (ch, x, y) => {
        if (ch === 'e') return '#c8e04a';
        if (ch === 'n') return '#f0a0b0';
        if (ch === 'z') return NB.shade(L.fur, 0.6);
        if (ch === 'w') return L.pattern === 'tuxedo' || L.pattern === 'socks' ? '#ffffff' : L.fur;
        if (L.pattern === 'tabby' && y >= 3 && y <= 6 && x % 3 === 0) return L.dark;
        if (L.pattern === 'tabby' && y === 1 && x === 9) return L.dark;
        if (L.pattern === 'tuxedo' && ((y >= 3 && x >= 8) || (y >= 7 && x >= 6))) return '#ffffff';
        if (L.pattern === 'calico') {
          const v = (x * 7 + y * 13) % 11;
          if (v < 3) return '#e08a3c';
          if (v < 5) return '#2b2b2b';
          return '#f6f1e8';
        }
        return L.fur;
      });
      return { right: c, left: flipX(c) };
    };
    return { walk: [make(CAT.walk1), make(CAT.walk2)], sit: make(CAT.sit), sleep: make(CAT.sleep) };
  };

  const COW = [
    '.............w..',
    '............cccc',
    '.ccccccccccccecc',
    'cccccccccccccccc',
    'tcccccccccccmmmm',
    'tccccccccccc.mmm',
    't.cccccccccc....',
    '..cuucccccccc...',
    '..cc.cc...cc.cc.',
    '..cc.cc...cc.cc.',
    '..kk.kk...kk.kk.',
  ];
  Art.cow = function (L) {
    L = Object.assign({ fur: '#8b5a3c', spots: null }, L);
    const color = (ch, x, y) => {
      if (ch === 'w') return '#efe6d2';
      if (ch === 'k') return '#2a2a2a';
      if (ch === 'm') return '#d9b6a0';
      if (ch === 'u') return '#f0a8b8';
      if (ch === 't') return y === 6 ? '#2a2a2a' : L.fur;
      if (ch === 'e') return '#1a1a1a';
      if (L.spots && ((x * 5 + y * 3) % 9 < 3) && x < 12) return L.spots;
      return L.fur;
    };
    const stand = COW;
    const walk = COW.slice(0, 8).concat(['..cc..cc.cc..cc.', '...cc.cc..cc.cc.', '...kk.kk..kk.kk.']);
    const graze = COW.map((row, y) => {
      // move head (cols 12-15) down by 3 rows
      const src = y - 3 >= 0 ? COW[y - 3].slice(12) : '....';
      return row.slice(0, 12) + (y >= 1 ? src : '....');
    });
    const make = (rows) => { const c = fromRows(rows, color); return { right: c, left: flipX(c) }; };
    return { stand: make(stand), walk: make(walk), graze: make(graze) };
  };

  const HEN = {
    stand: ['....rr.', '...www.', '...wewy', 'w.wwww.', 'wwwwww.', '.wwww..', '..y.y..'],
    walk: ['....rr.', '...www.', '...wewy', 'w.wwww.', 'wwwwww.', '.wwww..', '.y...y.'],
    peck: ['.......', '.......', 'w.www..', 'wwwwwrr', 'wwwwwwe', '.wwww.y', '..y.y..'],
  };
  Art.chicken = function (L) {
    L = Object.assign({ body: '#f4efe6' }, L);
    const color = (ch) => ({ r: '#d9302a', w: L.body, e: '#1a1a1a', y: '#f0b030' })[ch];
    const make = (rows) => { const c = fromRows(rows, color); return { right: c, left: flipX(c) }; };
    return { stand: make(HEN.stand), walk: make(HEN.walk), peck: make(HEN.peck) };
  };

  Art.duck = function (L) {
    L = Object.assign({ head: '#2f7a3c', body: '#9a8a74' }, L);
    const rows = ['......gg.', '......gey', '.....ww..', 'kbbbbbbb.', '.bbbbbbb.', '..bbbbb..'];
    const color = (ch) => ({ g: L.head, e: '#111', y: '#f0b030', w: L.ring || L.head, k: '#3a3a3a', b: L.body })[ch];
    const c = fromRows(rows, color);
    return { right: c, left: flipX(c) };
  };

  // ---------- vehicles (top-down, facing down / south) ----------
  function flipY(src) {
    const [c, g] = NB.canvas(src.width, src.height);
    g.translate(0, src.height); g.scale(1, -1); g.drawImage(src, 0, 0);
    return c;
  }
  Art.bus = () => cached('bus', () => {
    const [c, g] = NB.canvas(18, 38);
    g.fillStyle = '#2a2a2a'; g.fillRect(1, 6, 1, 6); g.fillRect(16, 6, 1, 6); g.fillRect(1, 26, 1, 6); g.fillRect(16, 26, 1, 6);
    g.fillStyle = '#ffcc00'; g.fillRect(2, 1, 14, 36);
    g.fillStyle = '#ffdf4a'; g.fillRect(4, 4, 10, 28);
    g.fillStyle = '#e0a800'; g.fillRect(2, 1, 1, 36); g.fillRect(15, 1, 1, 36);
    g.fillStyle = '#d9302a'; g.fillRect(2, 33, 14, 1);
    g.fillStyle = '#2b3d55'; g.fillRect(3, 33, 12, 3); // windscreen (front = bottom)
    g.fillStyle = '#c9ccd1'; g.fillRect(6, 9, 6, 4); g.fillRect(6, 20, 6, 3); // roof hatches
    g.fillStyle = '#fff8c0'; g.fillRect(3, 36, 2, 1); g.fillRect(13, 36, 2, 1);
    return { down: outline(c), up: outline(flipY(c)) };
  });
  Art.car = (color) => cached('car' + color, () => {
    const [c, g] = NB.canvas(12, 20);
    g.fillStyle = '#222'; g.fillRect(0, 3, 1, 4); g.fillRect(11, 3, 1, 4); g.fillRect(0, 13, 1, 4); g.fillRect(11, 13, 1, 4);
    g.fillStyle = color; g.fillRect(1, 1, 10, 18);
    g.fillStyle = NB.shade(color, 1.25); g.fillRect(3, 6, 6, 7);
    g.fillStyle = '#2b3d55'; g.fillRect(2, 13, 8, 3); g.fillRect(2, 4, 8, 2);
    g.fillStyle = '#fff8c0'; g.fillRect(2, 18, 2, 1); g.fillRect(8, 18, 2, 1);
    return { down: outline(c), up: outline(flipY(c)) };
  });
  Art.tractor = () => cached('tractor', () => {
    const [c, g] = NB.canvas(14, 20);
    g.fillStyle = '#222'; g.fillRect(0, 2, 3, 7); g.fillRect(11, 2, 3, 7); g.fillRect(1, 14, 2, 4); g.fillRect(11, 14, 2, 4);
    g.fillStyle = '#3f9a3c'; g.fillRect(3, 1, 8, 9); g.fillRect(4, 10, 6, 9);
    g.fillStyle = '#2b3d55'; g.fillRect(4, 3, 6, 5);
    g.fillStyle = '#f2c23a'; g.fillRect(5, 18, 4, 1);
    return { down: outline(c), up: outline(flipY(c)) };
  });
  Art.trainCar = (color) => cached('train' + color, () => {
    const [c, g] = NB.canvas(9, 6);
    g.fillStyle = color; g.fillRect(0, 0, 9, 6);
    g.fillStyle = NB.shade(color, 0.7); g.fillRect(0, 5, 9, 1);
    g.fillStyle = '#ffe9a8'; g.fillRect(2, 2, 2, 2); g.fillRect(5, 2, 2, 2);
    return c;
  });

  // ---------- effects ----------
  Art.heart = () => cached('heart', () => fromRows(['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'], () => '#ff4f7a', 0));
  Art.note = () => cached('note', () => fromRows(['..nn', '..n.', '..n.', 'nnn.', 'nn..'], () => '#fff6c0', 0));
})(window.NB);
