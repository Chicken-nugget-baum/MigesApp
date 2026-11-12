// Isometric pixel-art toolkit: projection (world metres -> iso pixels), building snapping to the iso grid,
// and a tiny software rasterizer that turns box/prism models into crisp, outlined pixel sprites.
// World: x = east, z = south, y = up (metres). Screen: 2:1 isometric, the viewer looks from +x +z.
(function (NB) {
  const I = (NB.Iso = {});
  const PPM = (I.PPM = 16);           // pixels per metre along a ground axis (a 1 m tile is 16 x 8 px)
  const HALF = PPM / 2, QUART = PPM / 4;
  // World yaw: rotates the whole map before projecting (0 = east goes down-right). Tune so the main streets
  // run along the iso axes; buildings are snapped to this frame.
  const YAW = (I.YAW = 0);
  const c = Math.cos(YAW), s = Math.sin(YAW);
  const OUT = (I.OUT = '#2a2030');

  // crisp pixels when magnified, smooth (mipmapped) when the overview zoom shrinks sprites below 1:1
  if (window.PIXI) Object.assign(PIXI.TextureSource.defaultOptions, { scaleMode: 'nearest', magFilter: 'nearest', minFilter: 'linear', mipmapFilter: 'linear', autoGenerateMipmaps: true });

  // world (x, z) -> rotated ground frame (u, v): u = screen down-right, v = screen down-left
  I.rot = (x, z) => [x * c - z * s, x * s + z * c];
  I.unrot = (u, v) => [u * c + v * s, -u * s + v * c];
  I.uvToPx = (u, v, y) => [(u - v) * HALF, (u + v) * QUART - (y || 0) * HALF];
  // world metres -> world pixels (float). Camera/zoom are applied by main.js
  I.project = (x, y, z) => { const r = I.rot(x, z); return I.uvToPx(r[0], r[1], y); };
  I.pxToUV = (px, py) => [(px / HALF + py / QUART) / 2, (py / QUART - px / HALF) / 2];
  I.pxToWorld = (px, py) => { const r = I.pxToUV(px, py); return I.unrot(r[0], r[1]); };
  I.depth = (x, z) => { const r = I.rot(x, z); return r[0] + r[1]; };

  // heading (atan2(dx, dz), world) -> 8-way screen facing: e se s sw w nw n ne
  const FACES = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  I.facing = function (heading) {
    const [du, dv] = I.rot(Math.sin(heading), Math.cos(heading));
    const a = Math.atan2((du + dv) / 2, du - dv);
    return FACES[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  };
  { const d = I.unrot(1, 1); I.towardCamera = Math.atan2(d[0], d[1]); }

  // Snap an OSM building box to the iso grid (rotation by at most 45 deg about its centre) and move its door
  // to a visible face (+u or +v) - the one closest to the real street side. Entry point 1.5 m outside the door.
  I.snapBuilding = function (b) {
    let k = Math.round((b.angle + YAW) / (Math.PI / 2));
    const odd = ((k % 2) + 2) % 2 === 1;
    if (odd) { const w = b.w; b.w = b.d; b.d = w; k -= 1; } // w is now the extent along u, d along v
    b.angle = (k * Math.PI) / 2 - YAW;
    // blocks (L/T-shaped outlines, farmhouse living part + barn) turn with the building:
    // after the 90 deg frame swap a block at (u, v) is at (-v, u)
    // then express them in the iso frame (angle 180 deg mirrors u and v), so the building frame = iso frame
    const ca0 = Math.cos(b.angle), sa0 = Math.sin(b.angle);
    b.parts = (b.parts && b.parts.length ? b.parts : [{ u: 0, v: 0, w: b.w, d: b.d }])
      .map((p) => (odd ? { ...p, u: -p.v, v: p.u, w: p.d, d: p.w } : { ...p }))
      .map((p) => { const [U, V] = I.rot(p.u * ca0 - p.v * sa0, p.u * sa0 + p.v * ca0); return { ...p, u: U, v: V }; });
    b.angle = -YAW;
    const [nu, nv] = I.rot(b.doorN[0], b.doorN[1]);
    b.face = nu >= nv ? 'u' : 'v';
    // door on the outside wall in line with the main block (parts[0]) on the visible face
    const mp = b.parts[0];
    let du, dv;
    if (b.face === 'u') { dv = mp.v; du = Math.max(...b.parts.filter((q) => Math.abs(dv - q.v) < q.d / 2).map((q) => q.u + q.w / 2)); }
    else { du = mp.u; dv = Math.max(...b.parts.filter((q) => Math.abs(du - q.u) < q.w / 2).map((q) => q.v + q.d / 2)); }
    b.doorUV = [du, dv];
    const N = b.face === 'u' ? I.unrot(1, 0) : I.unrot(0, 1);
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    const at = (u, v) => [b.cx + u * ca - v * sa, b.cz + u * sa + v * ca];
    b.doorN = [N[0], N[1]];
    b.door = at(du, dv);
    b.entry = [b.door[0] + N[0] * 1.5, b.door[1] + N[1] * 1.5];
    return b;
  };

  // ---------------------------------------------------------------- colours
  const rgbCache = {};
  const rgb = (hex) => rgbCache[hex] || (rgbCache[hex] = NB.hexToRgb(hex));
  I.rgb = rgb;
  const LIGHT = (() => { const l = [-0.5, 0.95, 0.3]; const n = Math.hypot(...l); return l.map((v) => v / n); })(); // (u, y, v)
  const AMB = 0.6, DIF = 0.46, STEPS = 14;
  function shadeFor(n) { // n = (u, y, v) outward normal
    const d = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    return Math.round((AMB + DIF * d) * STEPS) / STEPS;
  }

  // ---------------------------------------------------------------- pixel buffer
  function Pix(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  Pix.prototype.put = function (x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (a == null || a >= 255) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; return; }
    const da = d[i + 3] / 255, sa = a / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa; d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa; d[i + 3] = oa * 255;
  };
  // scanline polygon fill; calls cb(x, y) for every pixel whose centre is inside
  function scanPoly(pts, cb) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const xs = [];
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5; xs.length = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= yc) === (b[1] <= yc)) continue;
        xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.ceil(xs[k] - 0.5), xb = Math.ceil(xs[k + 1] - 0.5);
        for (let x = xa; x < xb; x++) cb(x, y);
      }
    }
  }
  I.scanPoly = scanPoly;
  Pix.prototype.fillPoly = function (pts, hex, a) { const [r, g, b] = rgb(hex); scanPoly(pts, (x, y) => this.put(x, y, r, g, b, a)); };
  Pix.prototype.rect = function (x, y, w, h, hex, a) { const [r, g, b] = rgb(hex); for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, r, g, b, a); };
  Pix.prototype.ellipse = function (cx, cy, rx, ry, hex, a) {
    const [r, g, b] = rgb(hex);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, r, g, b, a);
      }
  };
  // 1 px outline around every solid (alpha >= thr) pixel
  Pix.prototype.outline = function (hex, thr) {
    const { w, h, d } = this, [r, g, b] = rgb(hex || OUT), t = thr || 200;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] >= t;
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) add.push(x, y);
    }
    for (let i = 0; i < add.length; i += 2) this.put(add[i], add[i + 1], r, g, b);
    return this;
  };
  Pix.prototype.toCanvas = function () {
    const [c2, g] = NB.canvas(this.w, this.h);
    g.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return c2;
  };
  Pix.prototype.alphaMask = function () {
    const m = new Uint8Array(this.w * this.h);
    for (let i = 0; i < m.length; i++) m[i] = this.d[i * 4 + 3];
    return m;
  };
  I.Pix = Pix;

  // Finished sprite: { canvas, w, h, ox, oy, mask, tex, light? } - (ox, oy) = pixel of the model's ground origin
  I.finish = function (pix, ox, oy, lightPix) {
    const r = { canvas: pix.toCanvas(), w: pix.w, h: pix.h, ox, oy, mask: pix.alphaMask() };
    r.tex = PIXI.Texture.from(r.canvas);
    if (lightPix) r.light = PIXI.Texture.from(lightPix.toCanvas());
    return r;
  };
  // wrap a plain 2D canvas (hand-drawn pixel art) as a sprite record
  I.wrap = function (canvas, ox, oy) {
    const g = canvas.getContext('2d'), d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const mask = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3];
    return { canvas, w: canvas.width, h: canvas.height, ox, oy, mask, tex: PIXI.Texture.from(canvas) };
  };

  // ---------------------------------------------------------------- box / prism models -> sprite
  // Parts are convex solids in the model frame. Without a heading the frame is (u, v, y) directly (buildings);
  // with `heading` (world, atan2(dx, dz)) the frame is the model's local (x, z, y), +z forward (vehicles).
  function Model(heading) { this.heading = heading; this.parts = []; this.shadows = []; }
  I.model = (heading) => new Model(heading);
  Model.prototype.toUV = function (lx, lz) {
    if (this.heading == null) return [lx, lz];
    const h = this.heading;
    return I.rot(lx * Math.cos(h) + lz * Math.sin(h), -lx * Math.sin(h) + lz * Math.cos(h));
  };
  // generic convex solid: verts [[lx, lz, y]...], faces [[i, j, k, ...]...] (any winding)
  Model.prototype.solid = function (verts, faces, color, opts) {
    opts = opts || {};
    const vs = verts.map(([lx, lz, y]) => { const [u, v] = this.toUV(lx, lz); return [u, v, y]; });
    const cen = [0, 0, 0]; vs.forEach((p) => { cen[0] += p[0] / vs.length; cen[1] += p[1] / vs.length; cen[2] += p[2] / vs.length; });
    this.parts.push({ vs, faces, color, cen, light: opts.light, noOutline: opts.noOutline, key: opts.key != null ? opts.key : cen[0] + cen[1] + cen[2] * 0.002 });
    return this;
  };
  // box: min corner (lx, lz, y), size (dx, dz, dy)
  Model.prototype.box = function (lx, lz, y, dx, dz, dy, color, opts) {
    const V = [[lx, lz, y], [lx + dx, lz, y], [lx + dx, lz + dz, y], [lx, lz + dz, y],
      [lx, lz, y + dy], [lx + dx, lz, y + dy], [lx + dx, lz + dz, y + dy], [lx, lz + dz, y + dy]];
    const F = [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    return this.solid(V, F, color, opts);
  };
  // box centred at (cx, cz) like three.js BoxGeometry + position (y = bottom)
  Model.prototype.cbox = function (cx, cz, y, w, d, h, color, opts) { return this.box(cx - w / 2, cz - d / 2, y, w, d, h, color, opts); };
  // pyramid / cone: square base (min corner, size) at y, apex at (cx, cz, y + h)
  Model.prototype.pyramid = function (lx, lz, y, dx, dz, h, color, opts) {
    const V = [[lx, lz, y], [lx + dx, lz, y], [lx + dx, lz + dz, y], [lx, lz + dz, y], [lx + dx / 2, lz + dz / 2, y + h]];
    return this.solid(V, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], color, opts);
  };
  // gable roof: footprint (min corner, size) at y, ridge height h, ridge along 'u' (x) or 'v' (z)
  Model.prototype.gable = function (lx, lz, y, dx, dz, h, along, color, opts) {
    const V = [[lx, lz, y], [lx + dx, lz, y], [lx + dx, lz + dz, y], [lx, lz + dz, y]];
    let F;
    if (along === 'v') { V.push([lx + dx / 2, lz, y + h], [lx + dx / 2, lz + dz, y + h]); F = [[0, 3, 5, 4], [1, 2, 5, 4], [0, 1, 4], [2, 3, 5]]; }
    else { V.push([lx, lz + dz / 2, y + h], [lx + dx, lz + dz / 2, y + h]); F = [[0, 1, 5, 4], [2, 3, 4, 5], [1, 2, 5], [3, 0, 4]]; }
    return this.solid(V, F, color, opts);
  };
  // hipped roof: ridge of length |dx - dz| along the longer side
  Model.prototype.hip = function (lx, lz, y, dx, dz, h, color, opts) {
    const V = [[lx, lz, y], [lx + dx, lz, y], [lx + dx, lz + dz, y], [lx, lz + dz, y]];
    const r = Math.abs(dx - dz) / 2, cx = lx + dx / 2, cz = lz + dz / 2;
    if (dx >= dz) V.push([cx - r, cz, y + h], [cx + r, cz, y + h]); else V.push([cx, cz - r, y + h], [cx, cz + r, y + h]);
    const F = dx >= dz ? [[0, 1, 5, 4], [1, 2, 5], [2, 3, 4, 5], [3, 0, 4]] : [[0, 1, 4], [1, 2, 5, 4], [2, 3, 5], [3, 0, 4, 5]];
    return this.solid(V, F, color, opts);
  };
  // ground shadow of a footprint (min corner, size) with height h, cast along the light
  Model.prototype.shadow = function (lx, lz, dx, dz, h) {
    const su = (-LIGHT[0] / LIGHT[1]) * h, sv = (-LIGHT[2] / LIGHT[1]) * h;
    const base = [[lx, lz], [lx + dx, lz], [lx + dx, lz + dz], [lx, lz + dz]].map(([a, b]) => this.toUV(a, b));
    const shifted = base.map(([u, v]) => [u + su, v + sv]);
    this.shadows.push(base, shifted);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.shadows.push([base[i], base[j], shifted[j], shifted[i]]); }
    return this;
  };
  Model.prototype.render = function (opts) {
    opts = opts || {};
    // project everything, find bounds
    const P = (u, v, y) => I.uvToPx(u, v, y);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
    for (const part of this.parts) { part.px = part.vs.map((v) => P(v[0], v[1], v[2])); part.px.forEach(grow); }
    const shadowPolys = this.shadows.map((poly) => poly.map(([u, v]) => P(u, v, 0)));
    shadowPolys.forEach((poly) => poly.forEach(grow));
    const pad = 2;
    const ox = pad - Math.floor(x0), oy = pad - Math.floor(y0);
    const w = Math.ceil(x1) - Math.floor(x0) + pad * 2 + 1, h = Math.ceil(y1) - Math.floor(y0) + pad * 2 + 1;
    const pix = new Pix(w, h);
    const light = this.parts.some((p) => p.light) ? new Pix(w, h) : null;
    const off = (p) => [p[0] + ox, p[1] + oy];
    // shadow (ground level, drawn first; parts cover it)
    if (shadowPolys.length) {
      const sm = new Uint8Array(w * h);
      shadowPolys.forEach((poly) => scanPoly(poly.map(off), (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) sm[y * w + x] = 1; }));
      for (let i = 0; i < sm.length; i++) if (sm[i]) pix.put(i % w, (i / w) | 0, 24, 18, 40, 80);
    }
    // parts back to front
    const parts = this.parts.slice().sort((a, b) => a.key - b.key);
    const fm = new Uint8Array(w * h), fc = new Uint32Array(w * h);
    for (const part of parts) {
      const base = rgb(part.color);
      let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
      for (const f of part.faces) {
        // outward normal (cross product, flipped to point away from the solid's centre)
        const a = part.vs[f[0]], b = part.vs[f[1]], d = part.vs[f[2]];
        const e1 = [b[0] - a[0], b[2] - a[2], b[1] - a[1]], e2 = [d[0] - a[0], d[2] - a[2], d[1] - a[1]]; // (u, y, v)
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const fcn = [0, 0, 0]; f.forEach((i) => { fcn[0] += part.vs[i][0] / f.length; fcn[1] += part.vs[i][2] / f.length; fcn[2] += part.vs[i][1] / f.length; });
        const toF = [fcn[0] - part.cen[0], fcn[1] - part.cen[2], fcn[2] - part.cen[1]];
        if (n[0] * toF[0] + n[1] * toF[1] + n[2] * toF[2] < 0) n = n.map((v) => -v);
        const nl = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / nl);
        if (n[0] + n[1] + n[2] <= 0.001) continue; // back face (view direction is (1, 1, 1))
        const sh = shadeFor(n);
        const col = base.map((v) => NB.clamp(Math.round(sh < 1 ? v * sh : v + (255 - v) * (sh - 1)), 0, 255));
        const packed = (col[0] << 16) | (col[1] << 8) | col[2];
        const lc = part.light ? rgb(part.light) : null;
        scanPoly(f.map((i) => off(part.px[i])), (x, y) => {
          if (x < 0 || y < 0 || x >= w || y >= h) return;
          const k = y * w + x; fm[k] = 1; fc[k] = packed;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
          if (lc) light.put(x, y, lc[0], lc[1], lc[2]);
        });
      }
      if (bx1 < bx0) continue;
      const oc = base.map((v) => Math.round(v * 0.5));
      const inM = (x, y) => x >= 0 && y >= 0 && x < w && y < h && fm[y * w + x];
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const k = y * w + x;
        if (!fm[k]) continue;
        const edge = !part.noOutline && !(inM(x - 1, y) && inM(x + 1, y) && inM(x, y - 1) && inM(x, y + 1));
        if (edge) pix.put(x, y, oc[0], oc[1], oc[2]);
        else pix.put(x, y, (fc[k] >> 16) & 255, (fc[k] >> 8) & 255, fc[k] & 255);
      }
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) fm[y * w + x] = 0;
    }
    if (!opts.noOutline) pix.outline(OUT);
    return I.finish(pix, ox, oy, light);
  };

  // ---------------------------------------------------------------- hand-drawn pixel sprites (billboards)
  // rows: array of strings; colorOf(ch, x, y) -> hex or null. Adds an iso drop shadow under the feet and an outline.
  // Anchor: bottom centre (feet).
  I.rows = function (rows, colorOf, opts) {
    opts = opts || {};
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const pad = 1, sh = opts.shadow === false ? 0 : 3;
    const pix = new Pix(w + pad * 2, h + pad * 2 + sh);
    const feet = pad + h; // first row below the feet
    if (sh) pix.ellipse(pix.w / 2, feet - 0.5 + (opts.shadowY || 0), (opts.shadowW || w) / 2 + 0.5, (opts.shadowH || 2), '#180f28', 70);
    for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const col = colorOf(ch, x, y);
      if (col) { const [r, g, b] = rgb(col); pix.put(x + pad, y + pad, r, g, b); }
    }
    pix.outline(OUT);
    return I.finish(pix, Math.floor(pix.w / 2), feet);
  };
  I.flipRows = function (rows) {
    const w = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => r.padEnd(w, '.').split('').reverse().join(''));
  };
})(window.NB);
