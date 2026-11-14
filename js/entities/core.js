// Shared bits for everything that moves (js/entities/*): sprite placement, spots, the walking Mover, routines.
// Units: metres, x = east, z = south. Each entity owns a PIXI.Sprite (`sprite`) and the sprite record of its
// current frame (`frame`, for picking).
(function (NB) {
  const I = NB.Iso;
  const map = NB.map;
  const E = (NB.Entities = { list: [] });
  const add = (e) => { E.list.push(e); if (e.sprite) NB.world.add(e.sprite); return e; };
  const say = (who, text, o) => NB.UI && NB.UI.say(who, text, o);
  const angleLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
  // place a sprite record at world (x, y, z); depth-sorted against buildings
  function place(e, rec, x, y, z, zBias) {
    const p = I.project(x, y, z), s = e.sprite;
    e.frame = rec;
    if (s.texture !== rec.tex) s.texture = rec.tex;
    s.x = Math.round(p[0]) - rec.ox; s.y = Math.round(p[1]) - rec.oy;
    s.zIndex = NB.world.zkey(x, z) + (zBias || 0);
  }
  // ---- spots: villagers claim a place so they don't stand on top of each other ----
  const claimed = new Map(); // key -> villager
  function claimSpot(v, place) {
    releaseSpot(v);
    const named = map.spots && map.spots[place];
    if (named) {
      const free = named.filter((sp) => !claimed.has(sp));
      if (free.length) { const pool = free.filter((q) => q.sit && !q.bench).length ? free.filter((q) => q.sit && !q.bench) : free.some((q) => q.sit) ? free.filter((q) => q.sit) : free; const sp = NB.pick(pool); claimed.set(sp, v); v.spot = sp; v.spotKey = sp; return sp; }
    }
    for (let k = 0; k < 8; k++) {
      const t = map.randomIn(place, v.cost);
      if (!t) return null;
      const key = 'c:' + Math.round(t.x) + ',' + Math.round(t.z);
      if (!claimed.has(key) || k === 7) { claimed.set(key, v); v.spot = { x: t.x, z: t.z, sit: false }; v.spotKey = key; return v.spot; }
    }
    return null;
  }
  function releaseSpot(v) { if (v.spotKey) { if (claimed.get(v.spotKey) === v) claimed.delete(v.spotKey); v.spotKey = null; } v.spot = null; v.seated = false; }

  // ---------------------------------------------------------------- movement on the walk grid
  class Mover {
    constructor(x, z, cost, speed) {
      this.x = x; this.z = z; this.cost = cost; this.speed = speed;
      this.path = null; this.heading = 0; this.moving = false; this.anim = 0;
    }
    goTo(x, z) {
      const [sx, sz] = map.toCell(this.x, this.z), [tx, tz] = map.toCell(x, z);
      const p = NB.findPath(this.cost, map.w, map.h, sx, sz, tx, tz);
      this.path = p && p.length ? p.map(({ x: cx, y: cz }) => map.cellCentre(cx, cz)) : null;
      if (this.path) { const last = this.path[this.path.length - 1]; if (Math.hypot(last.x - x, last.z - z) < 2.5) this.path[this.path.length - 1] = { x, z }; }
      return !!p;
    }
    stepPath(dt) {
      this.moving = false;
      if (!this.path) return true;
      const n = this.path[0];
      const dx = n.x - this.x, dz = n.z - this.z, d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        this.x = n.x; this.z = n.z; this.path.shift();
        if (!this.path.length) { this.path = null; return true; }
      } else {
        this.x += (dx / d) * step; this.z += (dz / d) * step;
        this.heading = Math.atan2(dx, dz);
        this.moving = true; this.anim += dt;
      }
      return false;
    }
  }

  // ---------------------------------------------------------------- villagers
  function resolveGoal(c, min) {
    min = (min - (c._lag || 0) + 1440) % 1440; // everyone a little late or early: not all set off (and path-find) at the full hour
    if (c.sleep && NB.inWindow(min, c.sleep[0], c.sleep[1])) return { place: 'home', sleep: true };
    const r = c._routine;
    if (r.length) {
      let cur = r[r.length - 1];
      for (const e of r) if (NB.toMin(e.at) <= min) cur = e;
      return { place: cur.go, act: cur.do || null };
    }
    return null;
  }
  NB.Ent = { I, map, E, add, say, angleLerp, place, claimSpot, releaseSpot, Mover, resolveGoal };
})(window.NB);
