// Everything that moves: villagers, cats, the Postauto and cars. Units: metres, x = east, z = south.
// Each entity owns a PIXI.Sprite (`sprite`) and the sprite record of its current frame (`frame`, for picking).
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
    if (c.sleep && NB.inWindow(min, c.sleep[0], c.sleep[1])) return { place: 'home', sleep: true };
    const r = c._routine;
    if (r.length) {
      let cur = r[r.length - 1];
      for (const e of r) if (NB.toMin(e.at) <= min) cur = e;
      return { place: cur.go, act: cur.do || null };
    }
    return null;
  }

  class Villager extends Mover {
    constructor(c) {
      const home = map.buildings[c.home];
      super(home.entryPt.x, home.entryPt.z, map.walkCost, NB.rr(1.3, 1.6));
      this.c = c; this.kind = 'villager'; this.name = c.name; this.home = home;
      this.frames = NB.Models.person(c.look || {}); this.sprite = new PIXI.Sprite(); this.shown = 0;
      c._routine = (c.routine || []).slice().sort((a, b) => NB.toMin(a.at) - NB.toMin(b.at));
      this.inside = false; this.wait = NB.rr(0, 3); this.pause = 0; this.hop = 0;
      this.clicks = 0; this.lastClick = -99; this.chatCd = NB.rr(10, 30); this.favUntil = 0; this.fav = null;
      this.baseSpeed = this.speed; this.fishing = null; this.fled = null; this.guarding = null; this.guardT = NB.rr(60, 200); this.lastShout = -99;
      this.away = false; this.toCar = null;
      if (c.visitor) this.away = true; // visitors (Joel + Mariana from Lenzburg) are not here until their car arrives
      else { home.occupants.push(this); this.appear(); }
      this.heading = Math.random() * 6.28;
    }
    // put the villager where the routine says they should be right now
    appear() {
      const g = this.currentGoal(), home = this.home;
      this.goalKey = null; this.path = null;
      if (g.place === 'home' || g.place.startsWith('home:')) { this.target = this.homeOf(g.place) || home; this.enter(); }
      else { const s = claimSpot(this, g.place); if (s) { this.x = s.x; this.z = s.z; if (s.sit) { this.seated = true; this.heading = s.face; } } }
    }
    // ---- visitors: arrive with the car, walk back to it when it is time to go ----
    arrive(p, instant, idx, line0) {
      this.away = false; this.toCar = null; this.inside = false; this.fishing = null; this.fled = null;
      if (instant) { this.appear(); return; }
      this.x = p.x + NB.rr(-1, 1) + (idx || 0) * 1.5; this.z = p.z + NB.rr(-1, 1) + 1.2; this.goalKey = null; this.path = null;
      this.pause = 1.5 + (idx || 0) * 0.7; this.heading = I.towardCamera;
      const line = line0 || NB.pick(this.c.arriveLines || ['Hoi zäme!']);
      say(this, line); if (NB.UI.onScreen(this)) NB.Audio.babble(line, this.c.voice, { pos: this });
      NB.Audio.play(this.waitForBus ? 'door' : 'cardoor', { pos: this, vol: 0.6 });
    }
    goToCar(p, waitForBus, line0) {
      this.toCar = p; this.waitForBus = !!waitForBus; this.goalKey = null; this.path = null; this.fishing = null;
      const line = line0 || NB.pick(this.c.leaveLines || ['Tschüss zäme!']);
      say(this, line); if (NB.UI.onScreen(this)) NB.Audio.babble(line, this.c.voice, { pos: this });
    }
    enterCar() {
      if (this.inside) { (this.inBuilding || this.home).inside.delete(this); this.inside = false; this.inBuilding = null; }
      NB.Audio.play(this.waitForBus ? 'door' : 'cardoor', { pos: this, vol: 0.6 });
      this.away = true; this.toCar = null; this.waitForBus = false; this.path = null; this.fishing = null; this.moving = false; releaseSpot(this);
    }
    currentGoal() {
      const now = performance.now() / 1000;
      if (this.toCar) return { place: 'car', pt: this.toCar }; // visitors walking back to their car
      if (this.fled && now < this.fled.until) return { place: this.fled.place || 'home', flee: true }; // chased away / evacuated
      if (this.guarding && now < this.guarding.until) return { place: this.c.guard, guard: true }; // the owner checks on his pond
      const g = resolveGoal(this.c, NB.clock.minutes());
      if (g) return g;
      if (!this.fav || now > this.favUntil) { this.fav = NB.pick(this.c.favorites && this.c.favorites.length ? this.c.favorites : ['dorfplatz']); this.favUntil = now + NB.rr(60, 150); }
      return { place: this.fav };
    }
    homeOf(place) { return place === 'home' ? this.home : place.startsWith('home:') ? map.buildings[place.slice(5)] : null; }
    enter() { this.inside = true; this.path = null; releaseSpot(this); const b = this.target || this.home; b.inside.add(this); this.inBuilding = b; }
    leave() {
      const b = this.inBuilding || this.home;
      b.inside.delete(this);
      this.x = b.entryPt.x; this.z = b.entryPt.z; this.heading = Math.atan2(b.doorN[0], b.doorN[1]);
      this.inside = false; this.inBuilding = null;
      NB.Audio.play('door', { pos: this, vol: 0.4 });
    }
    // a vehicle is coming: run to the nearest side of the street and wait until it has passed
    evade(v) {
      if (this.inside || this.evading) return;
      const g = (x, z) => map.streetDist(x, z);
      let nx = g(this.x + 0.5, this.z) - g(this.x - 0.5, this.z), nz = g(this.x, this.z + 0.5) - g(this.x, this.z - 0.5);
      let l = Math.hypot(nx, nz);
      if (l < 0.2) { // right on the centre line: go to the side we're already on (relative to the car)
        const hx = Math.sin(v.heading), hz = Math.cos(v.heading), side = (this.x - v.x) * hz - (this.z - v.z) * hx >= 0 ? 1 : -1;
        nx = hz * side; nz = -hx * side; l = 1;
      }
      nx /= l; nz /= l;
      const ok = (x, z) => { const [cx, cz] = map.toCell(x, z); return map.inB(cx, cz) && map.walkCost[cz * map.w + cx] > 0 && g(x, z) >= 1.6; };
      let spot = null;
      for (const sg of [1, -1]) {
        let tx = this.x, tz = this.z;
        for (let k = 0; k < 24 && g(tx, tz) < 1.6; k++) { tx += nx * sg * 0.5; tz += nz * sg * 0.5; }
        if (ok(tx, tz)) { spot = [tx, tz]; break; }
      }
      for (let r = 2; !spot && r <= 10; r++) for (let k = 0; k < 16 && !spot; k++) {
        const a = (k / 16) * Math.PI * 2, x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
        if (ok(x, z)) spot = [x, z];
      }
      if (!spot) return;
      const [tx, tz] = spot;
      this.evading = { v, x: tx, z: tz, t: 0 };
      this.pause = 0; this.moving = true;
      if (Math.random() < 0.45) say(this, v.type === 'bus' ? NB.pick(["S'Postauto!", 'Ui, de Bus!']) : v.type === 'tractor' ? NB.pick(['De Buur mit em Traktor!', 'Tuck-tuck-tuck!', 'Hoi Buur!']) : NB.pick(['Achtung, es Auto!', "Hopp, uf d'Siite!", 'Ui!', 'Langsam!']), { quiet: true });
    }
    updateEvade(dt) {
      const e = this.evading; e.t += dt;
      const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz);
      this.moving = d > 0.05;
      if (this.moving) { const step = Math.min(d, 3.6 * dt); this.x += (dx / d) * step; this.z += (dz / d) * step; this.heading = Math.atan2(dx, dz); this.anim += dt * 1.8; }
      else this.heading = Math.atan2(e.v.x - this.x, e.v.z - this.z); // watch it drive past
      const v = e.v, ahead = (this.x - v.x) * Math.sin(v.heading) + (this.z - v.z) * Math.cos(v.heading);
      if ((v.done || ahead < -4 || e.t > 12) && e.t > 0.6) { this.evading = null; this.path = null; this.goalKey = null; }
    }
    update(dt) {
      const now = performance.now() / 1000;
      if (this.away) return this.pose(dt);
      if (this.hop > 0) this.hop = Math.max(0, this.hop - dt);
      if (this.fled && now >= this.fled.until) this.fled = null;
      if (this.guarding && now >= this.guarding.until) this.guarding = null;
      if (this.c.guard && !this.guarding && !this.fled) {
        const asleep = this.c.sleep && NB.inWindow(NB.clock.minutes(), this.c.sleep[0], this.c.sleep[1]);
        this.guardT -= dt;
        if (this.guardT <= 0 && !asleep) { this.guardT = NB.rr(150, 360); this.guarding = { until: now + NB.rr(50, 90) }; }
      }
      if (this.guarding && !this.inside) this.lookForPoachers(now);
      this.speed = this.baseSpeed * (this.fled ? 1.9 : 1);
      if (this.evading) { this.updateEvade(dt); return this.pose(dt); }
      if (this.pause > 0) { this.pause -= dt; this.moving = false; return this.pose(dt); }
      const g = this.currentGoal();
      const building = this.homeOf(g.place);
      if (g.place !== this.goalKey) {
        this.goalKey = g.place; this.target = building; this.path = null; this.act = g.act || null; this.fishing = null; this.gardenT = null; this.waterT = 0;
        if (map.bouleGame && map.bouleGame.by === this) map.bouleGame.fly = null;
        releaseSpot(this);
        if (this.inside && this.inBuilding !== building) this.leave();
        if (!this.inside) {
          if (building) this.goTo(building.entryPt.x, building.entryPt.z);
          else if (g.pt) this.goTo(g.pt.x, g.pt.z);
          else { const t = claimSpot(this, g.place); if (t) this.goTo(t.x, t.z); }
        }
      }
      if (this.inside) return this.pose(dt);
      const done = this.stepPath(dt);
      if (done) {
        if (building) {
          if (Math.hypot(this.x - building.entryPt.x, this.z - building.entryPt.z) < 2.5 || !this.goTo(building.entryPt.x, building.entryPt.z)) this.enter();
        } else if (g.pt) {
          if (Math.hypot(this.x - g.pt.x, this.z - g.pt.z) < 3 || !this.goTo(g.pt.x, g.pt.z)) { if (this.waitForBus) { this.moving = false; this.heading = I.towardCamera; } else this.enterCar(); }
        } else if (this.act === 'fish' && map.fishing) {
          if (!this.fishing) this.startFishing();
          this.updateFishing(dt);
        } else if (this.act === 'boule' && map.kochProps) {
          this.updateBoule(dt);
        } else if (this.act === 'garden' && map.kochProps) {
          this.updateGarden(dt);
        } else {
          if (this.spot && this.spot.sit && !this.seated && Math.hypot(this.x - this.spot.x, this.z - this.spot.z) < 1.2) { this.seated = true; this.heading = this.spot.face; this.wait = NB.rr(60, 180); }
          this.wait -= dt;
          if (this.wait <= 0) { this.wait = NB.rr(3, 12); const t = claimSpot(this, g.place); if (t) this.goTo(t.x, t.z); }
          this.chatCd -= dt;
          if (this.chatCd <= 0) { this.chatCd = NB.rr(25, 60); this.chat(); }
        }
      }
      this.pose(dt);
    }
    pose(dt) {
      const s = this.sprite;
      s.visible = !this.inside && !this.away;
      if (this.inside || this.away) return;
      if (this.moving) this.seated = false;
      this.shown = angleLerp(this.shown, this.heading, Math.min(1, dt * 10));
      const f = I.facing(this.shown);
      const view = f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left';
      let rec;
      if (this.seated && this.frames.sit && this.pause <= 0) rec = this.frames.sit[view];
      else if (this.pause > 0 && this.hop <= 0 && view === 'down') rec = this.frames.wave[Math.floor(performance.now() / 220) % 2]; // wave
      else rec = this.frames[view][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0];
      place(this, rec, this.x, this.hopY(), this.z);
    }
    // ---- boule at Ifangweg 23 (routine entry with do: 'boule'): throw the cochonnet ("Säuli"), then six balls
    //      (two sets, he plays both sides), count, collect, start again. Balls are drawn by NB.UI ----
    updateBoule(dt) {
      const K = map.kochProps, g = map.bouleGame || (map.bouleGame = { coch: null, balls: [], fly: null, wait: 2 });
      g.by = this; this.moving = false; this.heading = K.throwFace;
      const talk = (lines, p) => { if (Math.random() < p) { const l = NB.pick(lines); say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: 0.5 }); } };
      if (g.fly) {
        g.fly.t += dt / g.fly.dur;
        if (g.fly.t < 1) return;
        const fl = g.fly; g.fly = null;
        if (fl.coch) { g.coch = { x: fl.x1, z: fl.z1 }; return; }
        const hit = g.balls.some((b) => Math.hypot(b.x - fl.x1, b.z - fl.z1) < 0.5);
        g.balls.push({ x: fl.x1, z: fl.z1, col: fl.col });
        if (NB.UI.onScreen(this)) NB.Audio.play(hit ? 'clink' : 'click', { pos: { x: fl.x1, z: fl.z1 }, vol: hit ? 0.7 : 0.25, rate: hit ? 1 : 0.6 });
        const d = Math.hypot(fl.x1 - g.coch.x, fl.z1 - g.coch.z);
        if (d < 0.3) talk(this.c.bouleGood || ['Dä ligt! 🎯'], 0.7);
        else if (d > 1.4) talk(this.c.bouleBad || ['Ohje…'], 0.5);
        else if (hit) talk(['Klack! 💥', 'Tire! Wäg mit dere!'], 0.6);
        return;
      }
      g.wait -= dt;
      this.chatCd -= dt;
      if (this.chatCd <= 0) { this.chatCd = NB.rr(30, 60); talk(this.c.bouleLines || ['Pointe oder tire?'], 1); }
      if (g.wait > 0) return;
      const T = K.dir, N = [T[1], -T[0]], S0 = K.throwPt;
      const pt = (a, c) => ({ x: S0.x + T[0] * a + N[0] * c, z: S0.z + T[1] * a + N[1] * c });
      const hand = { x: this.x + Math.sin(this.heading) * 0.3, z: this.z + Math.cos(this.heading) * 0.3 };
      if (!g.coch) { // the cochonnet first
        const p = pt(NB.rr(6, 9.5), NB.rr(-0.8, 0.8));
        g.fly = { coch: true, x0: hand.x, z0: hand.z, x1: p.x, z1: p.z, t: 0, dur: 0.9, h: 1.0 }; g.wait = NB.rr(2.5, 4);
        this.hop = 0.2;
      } else if (g.balls.length < 6) {
        const sp = Math.random() < 0.55 ? 0.35 : 1.5;
        let a = (g.coch.x - S0.x) * T[0] + (g.coch.z - S0.z) * T[1] + NB.rr(-sp, sp), c = (g.coch.x - S0.x) * N[0] + (g.coch.z - S0.z) * N[1] + NB.rr(-sp, sp);
        a = NB.clamp(a, 2, K.court.len - 1.3); c = NB.clamp(c, -K.court.wid / 2 + 0.25, K.court.wid / 2 - 0.25);
        const p = pt(a, c);
        g.fly = { x0: hand.x, z0: hand.z, x1: p.x, z1: p.z, t: 0, dur: 1.2, h: 2.2, col: g.balls.length % 2 ? '#b08d57' : '#c9ccd6' };
        g.wait = NB.rr(4, 7); this.hop = 0.2;
      } else { // count: the ball nearest to the cochonnet wins, then pick them all up
        const best = g.balls.slice().sort((p, q) => Math.hypot(p.x - g.coch.x, p.z - g.coch.z) - Math.hypot(q.x - g.coch.x, q.z - g.coch.z))[0];
        talk(best.col === '#c9ccd6' ? ['Silber gwünnt! 🥈', 'Punkt für Silber!'] : ['Bronze gwünnt! 🥉', 'Punkt für Bronze!'], 0.8);
        g.balls = []; g.coch = null; g.wait = NB.rr(6, 10);
      }
    }
    // ---- tending the hydrangeas (routine entry with do: 'garden'): water a bush, then move on to the next one ----
    updateGarden(dt) {
      const sp = this.spot, b = sp && sp.bush;
      this.moving = false;
      if (sp && sp.face != null) this.heading = sp.face;
      if (this.gardenT == null) {
        this.gardenT = NB.rr(12, 20); this.waterT = 0;
        const winter = NB.season === 'winter', lines = (winter && this.c.gardenWinter) || this.c.gardenLines;
        if (lines && Math.random() < 0.45) { const l = NB.pick(lines); say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: 0.5 }); }
      }
      this.gardenT -= dt; this.waterT += dt;
      const canWater = b && NB.season !== 'winter' && !['rain', 'snow'].includes(NB.Env.weather) && NB.Env.darkness < 0.75;
      if (canWater && this.waterT < 4.5) {
        this.dropT = (this.dropT || 0) - dt;
        if (this.dropT <= 0) { this.dropT = 0.1; NB.UI.fx(b.x + NB.rr(-0.35, 0.35), 1.0, b.z + NB.rr(-0.35, 0.35), 'water', { vy: -1.6, life: 0.55 }); }
      }
      if (this.gardenT <= 0) { this.gardenT = null; const t = claimSpot(this, 'hortensien'); if (t) this.goTo(t.x, t.z); }
    }
    // ---- fishing at the Löli-Weiher (routine entry with do: 'fish') ----
    startFishing() {
      const f = map.fishing;
      let dx = f.cx - this.x, dz = f.cz - this.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let k = 4; while (k < 16 && map.pondDist(this.x + dx * k, this.z + dz * k) > -1.5) k += 1;
      this.fishing = { bx: this.x + dx * k + NB.rr(-1, 1), bz: this.z + dz * k + NB.rr(-1, 1), bite: 0, next: NB.rr(25, 70) };
      this.heading = Math.atan2(dx, dz); this.moving = false;
    }
    updateFishing(dt) {
      const f = this.fishing;
      this.moving = false;
      if (f.bite > 0) f.bite -= dt;
      f.next -= dt;
      if (f.next <= 0) {
        f.next = NB.rr(40, 100); f.bite = 1.6;
        say(this, NB.pick(this.c.biteLines || ['Es biisst!', 'Ha eine! 🐟', 'Ui, en Grosse!', 'Hmpf, wider wäg.']));
        NB.UI.fx(f.bx, 0.3, f.bz, 'fish', { vy: 1.4, life: 1.4 }); NB.UI.fx(f.bx, 0.05, f.bz, 'ripple', { vy: 0, life: 1.2 });
        if (NB.UI.onScreen(this)) NB.Audio.play('splash', { pos: { x: f.bx, z: f.bz }, vol: 0.7 });
      }
      this.chatCd -= dt;
      if (this.chatCd <= 0) { this.chatCd = NB.rr(25, 55); const line = NB.pick(this.c.fishLines || ['Psst… d\'Fisch!']); say(this, line, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(line, this.c.voice, { pos: this, vol: 0.5 }); }
    }
    // ---- the pond owner: shout at anyone fishing nearby and send them home ----
    lookForPoachers(now) {
      for (const v of E.list) {
        if (v.kind !== 'villager' || !v.fishing || Math.hypot(v.x - this.x, v.z - this.z) > 15) continue;
        if (now - this.lastShout > 5) {
          this.lastShout = now;
          const line = NB.pick(this.c.guardLines || ['Hey! Wäg vo do!']);
          say(this, line); NB.Audio.babble(line, this.c.voice, { pos: this });
          NB.UI.fx(this.x + 0.6, 2.6, this.z, 'angry', { vy: 0.6, life: 1.5 });
          this.heading = Math.atan2(v.x - this.x, v.z - this.z); this.pause = 2.5; this.path = null;
        }
        v.caught(this);
      }
    }
    caught(by) {
      if (this.fled) return;
      const now = performance.now() / 1000;
      this.fishing = null; this.fled = { until: now + NB.rr(110, 180) }; this.goalKey = null; this.path = null;
      const line = NB.pick(this.c.caughtLines || ['Ups! Verwütscht!']);
      say(this, line); NB.Audio.babble(line, this.c.voice, { pos: this });
      this.heading = Math.atan2(by.x - this.x, by.z - this.z); this.pause = 0.9; this.hop = 0.35;
    }
    chat() {
      const other = E.list.find((o) => o !== this && o.kind === 'villager' && !o.inside && !o.away && Math.hypot(o.x - this.x, o.z - this.z) < 5);
      const night = this.c.sleep && NB.inWindow(NB.clock.minutes(), this.c.sleep[0], this.c.sleep[1]);
      let line = other && Math.random() < 0.6 ? NB.pick(['Sali ', 'Hoi ', 'Grüezi ', 'Tschau ']) + other.name + '!' : NB.pick((night && this.c.night) || this.c.random || ['Schöne Tag hüt!']);
      if (this.c.phoneLines && !other && Math.random() < 0.4) { line = '📱 ' + NB.pick(this.c.phoneLines); this.pause = 6; this.hop = 0; this.heading = I.towardCamera; } // a call home
      if (!line) return;
      say(this, line, { quiet: true });
      if (NB.UI.onScreen(this)) NB.Audio.babble(line, this.c.voice, { pos: this, vol: 0.5 });
    }
    click() {
      if (this.state === 'flee') { this.speak(NB.pick(['Nöd jetzt!', 'Mrrau!'])); return; }
      const now = performance.now() / 1000;
      this.clicks = now - this.lastClick < 6 ? this.clicks + 1 : 0;
      this.lastClick = now;
      const night = this.c.sleep && NB.inWindow(NB.clock.minutes(), this.c.sleep[0], this.c.sleep[1]);
      const lines = night && this.c.night ? this.c.night : this.c.clicks || ['Grüezi!'];
      this.cycleIdx = ((this.cycleIdx == null ? -1 : this.cycleIdx) + 1) % lines.length;
      const line = this.c.cycle ? lines[this.cycleIdx] : lines[Math.min(this.clicks, lines.length - 1)];
      say(this, line);
      NB.Audio.babble(line, this.c.voice, { pos: this });
      this.pause = 3.5; this.hop = 0.35;
      this.heading = I.towardCamera; // turn towards the viewer
    }
    get visible() { return !this.inside && !this.away; }
    hopY() { return this.hop > 0 ? Math.sin((this.hop / 0.35) * Math.PI) * 0.4 : 0; }
    top() { return { x: this.x, y: 2.4 + this.hopY(), z: this.z }; }
  }

  // ---------------------------------------------------------------- cats
  class Cat extends Mover {
    constructor(a) {
      super(0, 0, map.animalCost, 1.4);
      this.a = a; this.kind = 'cat'; this.name = a.name; this.area = a.area;
      this.frames = NB.Models.cat(a.look || {}); this.sprite = new PIXI.Sprite(); this.dir = 'right';
      this.state = 'idle'; this.timer = NB.rr(1, 6); this.clicks = 0; this.lastClick = -99; this.purrT = 0; this.held = false;
      const s = map.randomIn(this.area, this.cost) || map.start;
      this.x = s.x; this.z = s.z; this.heading = Math.random() * 6.28;
    }
    speak(text) { say(this, this.a.words ? NB.pick(this.a.words) : text); }
    sleepy() {
      const m = NB.clock.minutes(), night = NB.Env.darkness > 0.6;
      return night ? 0.7 : NB.inWindow(m, '12:30', '15:00') ? 0.45 : 0.15;
    }
    update(dt) {
      if (this.state === 'flee') {
        if (this.stepPath(dt) || !this.path) { this.state = 'sit'; this.speed = 1.4; this.timer = NB.rr(2, 5); }
        return this.pose(dt);
      }
      if (this.state === 'zoom') { this.updateZoomies(dt); return this.pose(dt); }
      if (this.state === 'ride') {
        const d = this.ride; this.rideT -= dt;
        if (!d || d.away || d.done || this.rideT <= 0 || this.purrT > 0 || this.held) { this.dismount(); return this.pose(dt); }
        this.x = d.x; this.z = d.z; this.dir = d.dir; this.heading = d.heading;
        return this.pose(dt);
      }
      if (this.purrT > 0 || this.held) {
        this.purrT -= dt; this.state = 'sit';
        this.heartT = (this.heartT || 0) - dt;
        if (this.heartT <= 0) { this.heartT = 0.35; NB.UI.fx(this.x + NB.rr(-0.3, 0.3), 1.0, this.z, 'heart', { vy: 0.9, life: 1.2 }); }
        if (this.purrT <= 0 && !this.held && this.purr) { this.purr.stop(); this.purr = null; }
        return this.pose(dt);
      }
      if (this.state === 'walk') { if (this.stepPath(dt)) { this.state = 'idle'; this.timer = NB.rr(2, 8); } return this.pose(dt); }
      this.timer -= dt;
      if (this.timer <= 0) {
        const r = Math.random();
        const dog = this.a.dogs && NB.Env.darkness < 0.6 ? E.list.find((o) => o.kind === 'dog' && !o.away && !o.rider && Math.hypot(o.x - this.x, o.z - this.z) < 7) : null;
        if (dog && r < 0.35) { this.mount(dog); }
        else if (r < this.sleepy()) { this.state = 'sleep'; this.timer = NB.rr(20, 60); }
        else if (r < 0.6) {
          const t = map.randomIn(this.area, this.cost);
          if (t && Math.hypot(t.x - this.x, t.z - this.z) < 30 && this.goTo(t.x, t.z)) this.state = 'walk';
          else { this.state = 'sit'; this.timer = NB.rr(3, 10); }
        } else { this.state = 'sit'; this.timer = NB.rr(3, 10); }
      }
      this.pose(dt);
    }
    // ---- riding on a dog's back (Luna and Mina love Mariana's dogs) ----
    mount(dog) {
      this.ride = dog; dog.rider = this; this.state = 'ride'; this.rideT = NB.rr(15, 40); this.path = null;
      this.speak('Mrrp!'); NB.Audio.play('mrr', { pos: this, rate: 1.3 });
      NB.UI.fx(this.x, 0.2, this.z, 'dust', { vy: 0.4, life: 0.5 });
      say(dog, NB.pick(['Wuff?!', '…wuff.', 'Hmpf.']), { quiet: true });
      const o = dog.owner;
      if (o && !o.inside && !o.away && Math.hypot(o.x - this.x, o.z - this.z) < 12) say(o, NB.pick([`¡No manches! D'${this.name} ridet uf em ${dog.name}!`, `${dog.name}, du bisch es Taxi. Geil.`, `${this.name}, abe vom ${dog.name}! …okay, bliib.`]), { quiet: true });
    }
    dismount() {
      const d = this.ride;
      if (d) { d.rider = null; this.x = d.x + NB.rr(-0.8, 0.8); this.z = d.z + 0.7; }
      this.ride = null; this.state = 'sit'; this.timer = NB.rr(3, 8);
      NB.UI.fx(this.x, 0.15, this.z, 'dust', { vy: 0.4, life: 0.5 });
    }
    // ---- zoomies: sprint in zig-zags around the spot, hop, kick up dust, then sit down proud ----
    startZoomies() {
      if (this.ride) this.dismount();
      this.state = 'zoom'; this.zoomT = NB.rr(5, 7); this.path = null; this.dustT = 0;
      this.zoomHome = { x: this.x, z: this.z };
      this.speed = 7;
      this.speak(NB.pick(['Brrrrt!', '*ZOOMIES!* 💨', 'Mrrrrp-mrrp!', 'Wiiii!']));
      NB.Audio.play('mrr', { pos: this, rate: 1.6 });
      this.zoomLeg();
    }
    zoomLeg() {
      for (let k = 0; k < 12; k++) {
        const x = this.zoomHome.x + NB.rr(-9, 9), z = this.zoomHome.z + NB.rr(-9, 9);
        const [cx, cz] = map.toCell(x, z);
        if (map.inB(cx, cz) && this.cost[cz * map.w + cx] && Math.hypot(x - this.x, z - this.z) > 3 && this.goTo(x, z)) return;
      }
    }
    updateZoomies(dt) {
      this.zoomT -= dt; this.dustT -= dt; this.anim += dt * 1.5;
      if (this.dustT <= 0 && this.moving) { this.dustT = 0.08; NB.UI.fx(this.x - Math.sin(this.heading) * 0.4, 0.15, this.z - Math.cos(this.heading) * 0.4, 'dust', { vy: 0.4, life: 0.5 }); }
      if (Math.random() < dt * 0.8) NB.Audio.play('click', { pos: this, vol: 0.25, rate: NB.rr(1.5, 2.2) });
      if (this.hopT > 0) this.hopT -= dt;
      if ((this.stepPath(dt) || !this.path) && this.zoomT > 0) { if (Math.random() < 0.35) this.hopT = 0.3; this.zoomLeg(); }
      if (this.zoomT <= 0) {
        this.state = 'sit'; this.timer = NB.rr(4, 8); this.path = null; this.speed = 1.4;
        this.speak(NB.pick(['Mrrp. 😼', '*hächel* …nomol?', 'Ich bi de schnällscht!']));
      }
    }
    pose(dt) {
      const zoom = this.state === 'zoom', moving = this.moving;
      const hop = zoom ? Math.abs(Math.sin(this.anim * 16)) * 0.12 + (this.hopT > 0 ? Math.sin((this.hopT / 0.3) * Math.PI) * 0.6 : 0) : 0;
      if (moving) { const f = I.facing(this.heading); if (f === 'e' || f === 'se' || f === 'ne') this.dir = 'right'; else if (f === 'w' || f === 'sw' || f === 'nw') this.dir = 'left'; }
      const F = this.frames;
      if (this.state === 'ride') { place(this, F.sit[this.dir], this.x, 0.6, this.z, 1); return; }
      const set = moving ? F.walk[Math.floor(this.anim * (zoom ? 14 : 6)) % 2] : this.state === 'sleep' ? F.sleep : F.sit;
      place(this, set[this.dir], this.x, hop, this.z);
    }
    click() {
      const now = performance.now() / 1000;
      const again = now - this.lastClick < 3;
      this.clicks = again ? this.clicks + 1 : 0; this.lastClick = now;
      if (this.state === 'ride') { this.speak(NB.pick(['Miau! (vo do obe)', 'Mrrrp.', 'Miau?'])); NB.Audio.play('meow', { pos: this, rate: this.a.voice || 1 }); return; }
      if (this.a.zoomies && this.state !== 'sleep') { if (this.state !== 'zoom') this.startZoomies(); else this.zoomT += 1.5; return; }
      if (this.state === 'sleep') { this.state = 'sit'; this.timer = NB.rr(4, 8); this.speak('Mrrr?'); NB.Audio.play('mrr', { pos: this }); }
      else if (again) this.startPurr(2.8);
      else {
        this.state = 'sit'; this.path = null; this.timer = NB.rr(3, 6);
        const talk = this.a.talk;
        if (talk) { this.talkIdx = ((this.talkIdx == null ? -1 : this.talkIdx) + 1) % talk.length; this.speak(Math.random() < 0.2 ? 'Miau.' : talk[this.talkIdx]); }
        else this.speak(NB.pick(['Miau!', 'Miau?', 'Miiiau!']));
        NB.Audio.play('meow', { pos: this, rate: this.a.voice || 1 });
      }
    }
    // a vehicle is coming: dash a few metres off to the side (sleeping cats wake up first)
    scare(v) {
      if (this.state === 'flee' || (this.scaredT && performance.now() / 1000 < this.scaredT)) return;
      this.scaredT = performance.now() / 1000 + 6;
      const hx = Math.sin(v.heading), hz = Math.cos(v.heading);
      const side = (this.x - v.x) * hz - (this.z - v.z) * hx >= 0 ? 1 : -1; // which side of the car we are on
      for (let k = 0; k < 10; k++) {
        const d = NB.rr(4, 8), x = this.x + hz * side * d + hx * NB.rr(-2, 2), z = this.z - hx * side * d + hz * NB.rr(-2, 2);
        const [cx, cz] = map.toCell(x, z);
        if (map.inB(cx, cz) && this.cost[cz * map.w + cx] && map.streetDist(x, z) > 1 && this.goTo(x, z)) {
          if (this.purr) { this.purr.stop(); this.purr = null; }
          if (this.state === 'sleep') this.speak('Mrrr!');
          else if (Math.random() < 0.5) this.speak(NB.pick(['Pfffff! 🙀', 'Mrrrau!', v.type === 'bus' ? 'Hey, du grosse Chischte!' : 'Hey, du Raser!']));
          this.purrT = 0; this.held = false; this.state = 'flee'; this.speed = 5; this.anim += 0.5;
          return;
        }
      }
    }
    startPurr(t) {
      if (this.state === 'sleep') this.speak('Mrrr?');
      if (this.state === 'zoom') { this.state = 'sit'; this.speed = 1.4; }
      this.path = null; this.purrT = Math.max(this.purrT, t);
      if (!this.purr) { this.purr = NB.Audio.loop('purr', { pos: this }); this.speak('Rrrrr… ♥'); }
    }
    holdStart() { if (this.state === 'flee') return false; this.held = true; this.startPurr(1); return true; }
    holdEnd() { this.held = false; this.purrT = Math.max(this.purrT, 0.6); }
    get visible() { return true; }
    top() { return { x: this.x, y: 1.1, z: this.z }; }
  }

  // ---------------------------------------------------------------- dogs (Mariana's Border Collies)
  // Follow their owner: one on each side a step behind, trotting / running to keep up, straight line when the way is
  // clear, A* otherwise. Wait lying at the door while she is indoors; away (invisible) when she is away.
  class Dog extends Mover {
    constructor(a, owner) {
      super(owner.x, owner.z, map.walkCost, 2.4);
      this.a = a; this.kind = 'dog'; this.name = a.name; this.owner = owner; this.side = a.side || 1;
      this.frames = NB.Models.dog(a.look || {}); this.sprite = new PIXI.Sprite(); this.dir = 'right';
      this.away = true; this.idleT = 0; this.replanT = 0; this.rider = null; this.barkT = NB.rr(20, 60); this.hopT = 0;
      this.sprite.visible = false;
    }
    clear(x0, z0, x1, z1) { // straight line free of buildings / water?
      const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d);
      for (let i = 1; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (map.inBuilding(x, z, 0.5) || map.pondDist(x, z) < 0.8) return false; }
      return true;
    }
    update(dt) {
      const o = this.owner;
      if (this.hopT > 0) this.hopT -= dt;
      if (o.away) { if (!this.away) { this.away = true; this.sprite.visible = false; } return; }
      if (this.away) { this.away = false; this.x = o.x + NB.rr(-1, 1) + this.side; this.z = o.z + 1.2; this.path = null; }
      let tx, tz, slack = 1.3;
      if (o.inside) {
        const b = o.inBuilding || o.home, t = [-b.doorN[1], b.doorN[0]];
        tx = b.entryPt.x + b.doorN[0] * 1.6 + t[0] * this.side * 1.3; tz = b.entryPt.z + b.doorN[1] * 1.6 + t[1] * this.side * 1.3; slack = 0.9;
      } else {
        const hx = Math.sin(o.heading), hz = Math.cos(o.heading);
        tx = o.x - hx * 1.1 + hz * this.side * 1.1; tz = o.z - hz * 1.1 - hx * this.side * 1.1;
      }
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      const far = Math.hypot(o.x - this.x, o.z - this.z);
      if (d > (this.moving ? 0.5 : slack + 1.2)) {
        this.speed = far > 9 ? 4.2 : o.fled ? 3.6 : 2.4;
        if (this.clear(this.x, this.z, tx, tz)) {
          this.path = null;
          const step = Math.min(d, this.speed * dt);
          this.x += (dx / d) * step; this.z += (dz / d) * step; this.heading = Math.atan2(dx, dz); this.moving = true; this.anim += dt;
        } else {
          this.replanT -= dt;
          if (!this.path && this.replanT <= 0) {
            this.replanT = 1.2;
            if (!this.goTo(tx, tz) && !this.goTo(o.x, o.z)) { // no path (target on the table, in a wall...): squeeze straight through
              const step = Math.min(d, this.speed * dt * 8); this.x += (dx / d) * step; this.z += (dz / d) * step; this.heading = Math.atan2(dx, dz);
            }
          }
          if (this.path) { if (this.stepPath(dt)) this.moving = false; } else this.moving = false;
        }
        this.idleT = 0;
      } else {
        this.moving = false; this.idleT += dt;
        if (far > 25 && !o.inside) { this.x = o.x + this.side; this.z = o.z + 1; } // lost her (teleport in a car etc.)
        if (this.idleT > 1.5) this.heading = o.inside ? Math.atan2(-this.side, 1) : Math.atan2(o.x - this.x, o.z - this.z);
      }
      this.barkT -= dt;
      if (this.barkT <= 0) { this.barkT = NB.rr(25, 90); if (NB.UI.onScreen(this) && !o.fishing) { say(this, 'Wuff!', { quiet: true, life: 1.5 }); NB.Audio.play('bark', { pos: this, vol: 0.6, rate: this.a.voice || 1 }); } }
      this.pose(dt);
    }
    pose(dt) {
      this.sprite.visible = !this.away;
      if (this.away) return;
      if (this.moving) { const f = I.facing(this.heading); if (f === 'e' || f === 'se' || f === 'ne') this.dir = 'right'; else if (f === 'w' || f === 'sw' || f === 'nw') this.dir = 'left'; }
      const F = this.frames;
      const set = this.moving ? F.walk[Math.floor(this.anim * (this.speed > 3 ? 9 : 6)) % 2] : this.idleT < 5 ? F.stand : this.idleT < 14 ? F.sit : F.lie;
      const hop = this.hopT > 0 ? Math.sin((this.hopT / 0.3) * Math.PI) * 0.35 : 0;
      place(this, set[this.dir], this.x, hop, this.z);
    }
    click() {
      say(this, NB.pick(this.a.clicks || ['Wuff!']));
      NB.Audio.play('bark', { pos: this, rate: this.a.voice || 1 });
      this.hopT = 0.3; this.idleT = 0;
      if (this.rider) this.rider.dismount();
    }
    get visible() { return !this.away; }
    top() { return { x: this.x, y: 1.1, z: this.z }; }
  }

  // ---------------------------------------------------------------- ducks on the Löli-Weiher
  class Duck extends Mover {
    constructor(a) {
      super(0, 0, map.duckCost, 0.9);
      this.a = a; this.kind = 'duck'; this.name = a.name; this.area = a.area;
      this.frames = NB.Models.duck(a.look || {}); this.sprite = new PIXI.Sprite(); this.dir = Math.random() < 0.5 ? 'left' : 'right';
      this.state = 'float'; this.timer = NB.rr(1, 6); this.rippleT = 0; this.boost = 0;
      const s = map.randomIn(this.area, this.cost) || (map.fishing ? { x: map.fishing.cx, z: map.fishing.cz } : map.start);
      this.x = s.x; this.z = s.z; this.heading = Math.random() * 6.28;
    }
    swimTo(maxDist) {
      for (let k = 0; k < 8; k++) {
        const t = map.randomIn(this.area, this.cost);
        if (t && Math.hypot(t.x - this.x, t.z - this.z) < maxDist && this.goTo(t.x, t.z)) { this.state = 'swim'; return true; }
      }
      return false;
    }
    update(dt) {
      if (this.boost > 0) this.boost -= dt;
      this.speed = this.boost > 0 ? 2.4 : 0.9;
      const onWater = map.pondDist(this.x, this.z) < 0;
      if (this.state === 'swim') {
        if (this.stepPath(dt)) { this.state = 'float'; this.timer = NB.rr(2, 9); }
        this.rippleT -= dt;
        if (onWater && this.rippleT <= 0 && NB.UI.onScreen(this)) { this.rippleT = 0.6; NB.UI.fx(this.x - Math.sin(this.heading) * 0.4, 0.02, this.z - Math.cos(this.heading) * 0.4, 'ripple', { vy: 0, life: 1.4 }); }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) {
          const r = Math.random(), night = NB.Env.darkness > 0.6;
          if (!night && r < 0.5) { if (!this.swimTo(25)) this.timer = NB.rr(2, 6); }
          else if (onWater && r < 0.72) { this.state = 'dip'; this.timer = NB.rr(1, 2.2); if (NB.UI.onScreen(this)) NB.UI.fx(this.x, 0.02, this.z, 'ripple', { vy: 0, life: 1.2 }); }
          else { this.state = 'float'; this.timer = NB.rr(2, night ? 20 : 8); }
        }
      }
      if (Math.random() < dt * 0.015 && NB.UI.onScreen(this)) { say(this, 'Quack!', { quiet: true, life: 1.5 }); NB.Audio.play('quack', { pos: this, vol: 0.6, rate: this.a.voice || 1 }); }
      this.pose(dt);
    }
    pose(dt) {
      const onWater = map.pondDist(this.x, this.z) < 0;
      if (this.moving) { const f = I.facing(this.heading); if (f === 'e' || f === 'se' || f === 'ne') this.dir = 'right'; else if (f === 'w' || f === 'sw' || f === 'nw') this.dir = 'left'; }
      const F = this.frames, t = performance.now() / 1000;
      let set;
      if (this.state === 'dip') set = F.dip;
      else if (onWater) set = F.swim[Math.abs(Math.floor(t * (this.moving ? 3 : 1.6) + this.x)) % 2];
      else set = this.moving ? F.walk[Math.floor(this.anim * 6) % 2] : F.walk[0];
      place(this, set[this.dir], this.x, 0, this.z);
    }
    click() {
      say(this, NB.pick(['Quack!', 'Quaaak!', 'Quack quack!', 'Nack nack!']));
      NB.Audio.play('quack', { pos: this, rate: (this.a.voice || 1) * NB.rr(0.9, 1.15) });
      NB.UI.fx(this.x, 0.02, this.z, 'ripple', { vy: 0, life: 1.2 });
      this.boost = 2.5; this.state = 'float'; this.timer = 0.2;
      if (!this.swimTo(30)) this.state = 'float';
    }
    get visible() { return true; }
    top() { return { x: this.x, y: 0.7, z: this.z }; }
  }

  // ---------------------------------------------------------------- vehicles on Niederwilerstrasse
  const CAR_COLORS = ['#e05a5a', '#4f8fd6', '#f2f2ea', '#4a4a55', '#9aa0aa', '#5bb07a', '#e8b030'];
  const TRACTOR_COLORS = ['#2f8f3a', '#d23c2a', '#2a5fb0', '#2f8f3a'];
  const TRACTOR_LINES = {
    spring: ['Gsäit wird! 🌱', 'Tuck-tuck-tuck!', "D'Erde isch parat."],
    summer: ['Ärnte! ☀️', 'Tuck-tuck-tuck!', 'Hüt wird gheuet!'],
    autumn: ['Pflüege, bevor\'s chalt wird.', 'Tuck-tuck-tuck!', "S'Feld mues umegräblet si."],
    winter: ['Tuck-tuck-tuck!', 'Im Winter rueht s\'Feld.', 'Mischt usfüere!'],
  };
  function laneOffset(pts, off) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { x: p.x - (dz / l) * off, z: p.z + (dx / l) * off }; // right-hand side
    });
  }
  const nearestIdx = (pts, p) => { let best = 0, bd = Infinity; pts.forEach((q, k) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = k; } }); return best; };
  class Vehicle {
    // opts: { parkAt: {x, z, heading}, parkedNow, color, name, lines } - a car that leaves the road and parks (visitors)
    constructor(type, reverse, opts) {
      opts = opts || {};
      this.type = type; this.kind = 'vehicle';
      const base = map.route.slice(); if (reverse) base.reverse();
      this.pts = laneOffset(base, 1.5);
      this.x = this.pts[0].x; this.z = this.pts[0].z; this.i = 1; this.heading = 0; this.life = 0;
      this.color = opts.color || NB.pick(type === 'tractor' ? TRACTOR_COLORS : CAR_COLORS); this.sprite = new PIXI.Sprite(); this.shown = null;
      this.maxSpeed = type === 'bus' ? 7 : type === 'tractor' ? 4 : type === 'mini' ? 7 : type === 'tanker' ? 6 : type === 'firetruck' ? 15 : type === 'jeep' ? 6.5 : NB.rr(8, 10);
      this.speed = this.maxSpeed; this.stopT = 0; this.done = false; this.putT = 0; this.pull = 0;
      this.name = opts.name || (type === 'bus' ? 'Postauto' : type === 'tractor' ? 'Traktor' : 'Auto');
      this.lines = opts.lines || null;
      this.parkAt = opts.parkAt || null; this.parked = false; this.departing = false;
      if (this.parkAt) {
        const k = nearestIdx(base, this.parkAt);
        if (opts.parkedNow) { this.pts = []; this.i = 0; this.x = this.parkAt.x; this.z = this.parkAt.z; this.heading = this.shown = this.parkAt.heading; this.parked = true; this.life = 5; }
        else this.pts = laneOffset(base.slice(0, k + 1), 1.5).concat([{ x: this.parkAt.x, z: this.parkAt.z }]);
      }
      if (opts.path && !opts.parkedNow) { this.pts = opts.path; this.x = this.pts[0].x; this.z = this.pts[0].z; this.i = 1; }
      this.stops = [];
      if (type === 'bus') for (const s of map.busStops) {
        let best = -1, bd = 8;
        base.forEach((p, k) => { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = k; } });
        if (best > 0) this.stops.push(best);
      }
    }
    // leave the parking spot along a given path
    departAlong(pts) {
      this.pts = [{ x: this.x, z: this.z }].concat(pts); this.i = 1;
      this.parked = false; this.departing = true; this.life = 5; this.speed = 0;
    }
    // from the parking spot back onto the road and out of the village
    depart(reverse) {
      const base = map.route.slice(); if (reverse) base.reverse();
      const k = nearestIdx(base, this.parkAt);
      this.pts = [{ x: this.x, z: this.z }].concat(laneOffset(base.slice(k), 1.5)); this.i = 1;
      this.parked = false; this.departing = true; this.life = 5; this.speed = 0;
    }
    update(dt) {
      this.life += dt;
      if (this.parked) return this.pose(dt);
      if (this.type === 'tractor') tractorNoise(this, dt);
      else if (this.type === 'jeep') tractorNoise(this, dt, 1.45);
      const p = this.pts[this.i];
      if (!p) {
        if (this.parkAt && !this.departing) { this.parked = true; this.speed = 0; this.heading = this.parkAt.heading; return this.pose(dt); }
        this.done = true; stopEngine(this); NB.world.remove(this.sprite); return;
      }
      if (this.stopT > 0) { this.stopT -= dt; if (this.stopT <= 0 && NB.UI.onScreen(this) && NB.Env.darkness < 0.7) NB.Audio.horn({ pos: this }); return this.pose(dt); }
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.01) this.heading = Math.atan2(dx, dz);
      let target = this.maxSpeed;
      if (this.parkAt && (this.i >= this.pts.length - 1 || (this.departing && this.i <= 1))) target = Math.min(target, 3); // crawl into / out of the yard
      if (p.slow) target = Math.min(target, 3.2); // driveway
      // people on the street ahead jump aside, cats scurry off
      for (const o of E.list) {
        if (o.kind === 'cat') {
          const ox = o.x - this.x, oz = o.z - this.z, ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
          if (ahead > -1 && ahead < 24 && side < 3.5) o.scare(this);
          continue;
        }
        if (o.kind !== 'villager' || o.inside || o.away || o.evading) continue;
        const ox = o.x - this.x, oz = o.z - this.z, ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (ahead > 0 && ahead < (this.type === 'firetruck' ? 45 : 26) && side < 5 && map.streetDist(o.x, o.z) < 1.2) o.evade(this);
      }
      // blocked for a while (someone standing in the way): creep on regardless; the fire engine has right of way
      this.blockedT = this.speed < 0.3 ? (this.blockedT || 0) + dt : 0;
      if (this.type === 'firetruck') { /* emergency: others get out of the way */ }
      else if (this.blockedT < 6) for (const o of E.list) {
        if (o === this || o.parked || (o.kind !== 'vehicle' && !(o.kind === 'villager' && !o.inside && !o.away) && o.kind !== 'cat' && !(o.kind === 'dog' && !o.away))) continue;
        const ox = o.x - this.x, oz = o.z - this.z;
        const ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (!(ahead > 0 && ahead < 14 && side < 2)) continue;
        if (o.kind === 'vehicle') { if (!(o.stopT > 0 && o.pull > 0.6)) target = Math.min(target, Math.max(0, (ahead - 8) * 1.5)); }
        else if (o.evading || o.state === 'flee') { if (side < 1.4) target = Math.min(target, 3 + ahead * 0.5); } // already getting out of the way: just slow down
        else target = Math.min(target, Math.max(0, (ahead - 3.5) * 1.5));
      } else target = Math.min(target, 2);
      this.speed += NB.clamp(target - this.speed, -12 * dt, (this.type === 'firetruck' ? 8 : 4) * dt);
      const step = this.speed * dt;
      if (d <= step) { this.x = p.x; this.z = p.z; if (this.stops.includes(this.i)) { this.stopT = 6; this.speed = 0; } this.i++; }
      else { this.x += (dx / d) * step; this.z += (dz / d) * step; }
      this.pose(dt);
    }
    pose(dt) {
      this.shown = this.shown == null ? this.heading : angleLerp(this.shown, this.heading, Math.min(1, dt * 6));
      // the Postauto pulls in to the right at its stops so cars can pass
      this.pull += NB.clamp((this.stopT > 0.6 ? 1 : 0) - this.pull, -2 * dt, 2 * dt);
      const po = this.pull * 1.4;
      place(this, NB.Models.vehicle(this.type, this.color, this.shown), this.x - Math.cos(this.heading) * po, 0, this.z + Math.sin(this.heading) * po);
      // fade in / out at the ends of the street (not when pulling into the yard)
      const left = this.pts.length - this.i, arriving = this.parkAt && !this.departing;
      this.sprite.alpha = Math.min(1, this.life / 0.8, left < 2 && !arriving ? Math.max(0, left / 2) : 1);
    }
    click() {
      if (this.lines) { say(this, NB.pick(this.lines)); NB.Audio.play(this.type === 'mini' ? 'honkMini' : 'honkTruck', { pos: this, rate: this.type === 'mini' ? 1.35 : 1, vol: 0.7 }); }
      else if (this.type === 'bus') { say(this, NB.pick(['Tü-ta-to! 🎺', 'Nöchsti Halt: Nesselnbach, Mitteldorf.', 'Bitte iistiige!'])); NB.Audio.horn({ pos: this }); }
      else if (this.type === 'tractor') { say(this, NB.pick(TRACTOR_LINES[NB.season] || TRACTOR_LINES.summer)); NB.Audio.play('honkTractor', { pos: this, rate: 0.7 }); }
      else { say(this, NB.pick(['Tüüt tüüt!', 'Ich ha\'s pressant!', 'Langsam dur s\'Dorf, gäll!'])); NB.Audio.play('honk', { pos: this }); }
    }
    get visible() { return true; }
    top() { return { x: this.x, y: this.type === 'bus' || this.type === 'tanker' || this.type === 'firetruck' ? 3.8 : this.type === 'tractor' ? 2.9 : 2.3, z: this.z }; }
  }
  // diesel putter while the tractor is on screen (overlapping short engine samples)
  function tractorNoise(t, dt, rate) {
    if (NB.Audio.has('tractor')) { // real engine loop that follows the tractor
      if (!t.engine) t.engine = NB.Audio.loop('tractor', { pos: t, vol: 0.5, rate: rate || 1 });
      else t.engine.update(t, rate || 1);
      return;
    }
    t.putT -= dt;
    if (t.putT > 0) return;
    t.putT = 0.55;
    if (NB.UI.onScreen(t)) NB.Audio.play('engine', { pos: t, vol: 0.2, rate: rate || 1 });
  }
  const stopEngine = (t) => { if (t.engine) { t.engine.stop(); t.engine = null; } };

  // ---------------------------------------------------------------- tractor working a field
  // Drives a block of rows (map.fieldLanes) back and forth, kicks up dust, then fades out at the last row.
  class FieldTractor {
    constructor(field, lanes) {
      this.kind = 'tractor'; this.type = 'tractor'; this.name = 'Traktor'; this.field = field;
      this.lanes = lanes; this.i = 0; this.leg = 'row'; this.target = lanes[0].b;
      this.color = NB.pick(TRACTOR_COLORS); this.sprite = new PIXI.Sprite(); this.shown = null;
      this.x = lanes[0].a.x; this.z = lanes[0].a.z; this.heading = Math.atan2(this.target.x - this.x, this.target.z - this.z);
      this.life = 0; this.fade = 1; this.done = false; this.leaving = false; this.dustT = 0; this.putT = NB.rr(0, 0.5); this.pauseT = 0;
    }
    update(dt) {
      this.life += dt;
      if (this.leaving) {
        this.fade -= dt * 0.7;
        if (this.fade <= 0) { this.done = true; stopEngine(this); NB.world.remove(this.sprite); return; }
        return this.pose(dt);
      }
      if (this.pauseT > 0) { this.pauseT -= dt; tractorNoise(this, dt, 0.8); return this.pose(dt); }
      const t = this.target, dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
      const speed = this.leg === 'row' ? 3.2 : 4.5;
      if (d > 0.01) this.heading = Math.atan2(dx, dz);
      const step = Math.min(d, speed * dt);
      if (d > 0) { this.x += (dx / d) * step; this.z += (dz / d) * step; }
      if (d <= speed * dt + 0.01) {
        if (this.leg === 'row') {
          this.i++;
          if (this.i >= this.lanes.length) this.leaving = true;
          else { this.leg = 'turn'; this.target = this.lanes[this.i].a; }
        } else { this.leg = 'row'; this.target = this.lanes[this.i].b; }
      }
      this.dustT -= dt;
      if (this.leg === 'row' && this.dustT <= 0 && NB.UI.onScreen(this)) {
        this.dustT = 0.16;
        NB.UI.fx(this.x - Math.sin(this.heading) * 2 + NB.rr(-0.6, 0.6), 0.3, this.z - Math.cos(this.heading) * 2 + NB.rr(-0.6, 0.6), 'dust', { vy: 0.5, life: 1.0 });
      }
      tractorNoise(this, dt, this.leg === 'row' ? 0.9 : 1.05);
      this.pose(dt);
    }
    pose(dt) {
      this.shown = this.shown == null ? this.heading : angleLerp(this.shown, this.heading, Math.min(1, dt * 4));
      place(this, NB.Models.vehicle('tractor', this.color, this.shown), this.x, 0, this.z);
      this.sprite.alpha = Math.min(1, this.life / 1.2, this.fade);
    }
    click() {
      say(this, NB.pick(TRACTOR_LINES[NB.season] || TRACTOR_LINES.summer));
      NB.Audio.play('honkTractor', { pos: this, rate: 0.7 });
      this.pauseT = 2.5; // the farmer stops for a chat
    }
    get visible() { return true; }
    top() { return { x: this.x, y: 2.9, z: this.z }; }
  }

  // ---------------------------------------------------------------- fire at the Milchzentrale + the Niederwil fire brigade
  // Clicking the dairy many times in a row sets it on fire (main.js -> E.startFire). The residents run out, the fire
  // engine comes from Niederwil (south end of the Niederwilerstrasse), parks in the dairy bay, the crew sprays the
  // building until the fire is out, climbs back in and drives off. The building stays sooty for a while.
  class Firefighter extends Mover {
    constructor(d, spot, truck) {
      super(truck.x, truck.z, map.walkCost, 2.3);
      this.d = d; this.kind = 'firefighter'; this.name = d.name; this.spot = spot; this.truck = truck;
      this.frames = NB.Models.person(d.look || {}); this.sprite = new PIXI.Sprite(); this.shown = 0; this.state = 'out';
      this.x += NB.rr(-1, 1); this.z += NB.rr(-1, 1) + 1.5; this.spray = null; this.done = false; this.lineT = NB.rr(3, 9);
      this.goTo(spot.x, spot.z);
    }
    update(dt) {
      const F = E.fire;
      if (this.state === 'out') { if (this.stepPath(dt) && F) { this.state = 'spray'; this.heading = Math.atan2(F.b.cx - this.x, F.b.cz - this.z); this.spray = { x: F.b.cx + NB.rr(-2, 2), y: F.b.top.y * 0.55, z: F.b.cz + NB.rr(-2, 2) }; } }
      else if (this.state === 'spray') {
        this.moving = false;
        if (!F || F.intensity <= 0) { this.state = 'back'; this.spray = null; this.goTo(this.truck.x, this.truck.z); }
        else if (Math.random() < dt * 0.4) this.spray = { x: F.b.cx + NB.rr(-3, 3), y: F.b.top.y * NB.rr(0.3, 0.8), z: F.b.cz + NB.rr(-3, 3) };
        this.lineT -= dt;
        if (this.lineT <= 0) { this.lineT = NB.rr(8, 16); const l = NB.pick(this.d.lines || ['Wasser marsch!']); say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.d.voice || 0.9, { pos: this, vol: 0.6 }); }
      } else if (this.state === 'back') { if (this.stepPath(dt) || Math.hypot(this.x - this.truck.x, this.z - this.truck.z) < 3) { this.done = true; NB.world.remove(this.sprite); NB.Audio.play('door', { pos: this, vol: 0.4 }); return; } }
      this.pose(dt);
    }
    pose(dt) {
      this.shown = angleLerp(this.shown, this.heading, Math.min(1, dt * 10));
      const f = I.facing(this.shown);
      const view = f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left';
      place(this, this.frames[view][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0], this.x, 0, this.z);
    }
    click() { const l = NB.pick(this.d.clicks || this.d.lines || ['Zrugg bliibe!']); say(this, l); NB.Audio.babble(l, this.d.voice || 0.9, { pos: this }); }
    get visible() { return true; }
    top() { return { x: this.x, y: 2.4, z: this.z }; }
  }
  E.fire = null;
  E.startFire = function (b) {
    if (E.fire || !map.parkings || !map.parkings.dairy) return false;
    const F = (E.fire = { b, t: 0, intensity: 1, phase: 'burning', truck: null, crew: [], sirenT: 0, fxT: 0 });
    // residents out of the house, to the village square
    for (const v of [...b.inside]) { v.leave(); v.fled = { until: performance.now() / 1000 + 400, place: 'dorfplatz' }; v.goalKey = null; v.path = null; v.pause = 0.6; say(v, NB.pick(['Füür! FÜÜR!', 'Use, alli use!', 'Nid scho wider!'])); NB.Audio.babble('Füür! Füür!', v.c.voice, { pos: v }); }
    for (const v of E.list) if (v.kind === 'villager' && !v.inside && !v.away && !v.fled && Math.hypot(v.x - b.cx, v.z - b.cz) < 30) { v.fled = { until: performance.now() / 1000 + 300, place: 'dorfplatz' }; v.goalKey = null; v.path = null; say(v, NB.pick(['Füür! Rüef d\'Füürwehr!', 'Ui nei, d\'Milchzentrale!', 'Wäg do!']), { quiet: true }); }
    setTimeout(() => {
      if (E.fire !== F) return;
      const d = NB.Data.firebrigade || {};
      F.truck = add(new Vehicle('firetruck', true, { parkAt: map.parkings.dairy, color: '#d6252a', name: d.name || 'Füürwehr Niederwil', lines: d.lines || ['Tatü-tata!'] }));
      F.truck.siren = true;
    }, 4000);
    return true;
  };
  function updateFire(dt) {
    const F = E.fire;
    if (!F) return;
    F.t += dt;
    const b = F.b;
    // flames and smoke on the building
    F.fxT -= dt;
    if (F.fxT <= 0 && F.intensity > 0) {
      F.fxT = 0.05 / Math.max(0.15, F.intensity);
      const u = NB.rr(-b.w / 2, b.w / 2) * 0.8, v = NB.rr(-b.d / 2, b.d / 2) * 0.8, ca = Math.cos(b.angle), sa = Math.sin(b.angle);
      const x = b.cx + u * ca - v * sa, z = b.cz + u * sa + v * ca;
      NB.UI.fx(x, b.top.y * NB.rr(0.5, 1.0), z, 'fire', { vy: NB.rr(0.8, 1.6), life: NB.rr(0.5, 0.9), size: F.intensity });
      if (Math.random() < 0.5) NB.UI.fx(x, b.top.y * NB.rr(0.9, 1.1), z, 'smoke', { vy: NB.rr(1.5, 2.5), life: NB.rr(2.5, 4), size: F.intensity });
    }
    if (F.intensity > 0) { if (!F.crackle) F.crackle = NB.Audio.loop('fire', { pos: b.top, vol: 0.9 }); F.crackle.setVol(0.25 + 0.75 * F.intensity); F.crackle.update(b.top); }
    else if (F.crackle) { F.crackle.stop(); F.crackle = null; }
    if (b.sprite) b.sprite.tint = F.intensity > 0 ? (Math.floor(F.t * 8) % 2 ? 0xffb070 : 0xff9050) : 0x6e6a66;
    // the engine: siren while driving, crew out when parked
    const T = F.truck;
    if (T && !T.parked && !T.departing && !T.done) { if (!F.siren) F.siren = NB.Audio.siren({ pos: T }); else F.siren.update(T); } // on the way: siren
    else if (F.siren) { F.siren.stop(); F.siren = null; }
    if (T && T.parked && F.phase === 'burning') {
      F.phase = 'fighting';
      const crew = NB.Data.firefighters || [{ name: 'Füürwehrler' }];
      const spots = [];
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const ca = Math.cos(b.angle), sa = Math.sin(b.angle), u = Math.cos(a) * (b.w / 2 + 5), v = Math.sin(a) * (b.d / 2 + 5);
        const x = b.cx + u * ca - v * sa, z = b.cz + u * sa + v * ca, [cx, cz] = map.toCell(x, z);
        if (map.inB(cx, cz) && map.walkCost[cz * map.w + cx]) spots.push({ x, z });
      }
      spots.sort((p, q) => Math.hypot(p.x - T.x, p.z - T.z) - Math.hypot(q.x - T.x, q.z - T.z)); // nearest the engine first
      crew.forEach((d, i) => { const sp = spots[i % Math.max(1, spots.length)] || { x: T.x, z: T.z }; F.crew.push(add(new Firefighter(d, sp, T))); });
    }
    if (F.phase === 'fighting') {
      const spraying = F.crew.filter((c) => c.state === 'spray').length;
      if (spraying) {
        F.intensity = Math.max(0, F.intensity - dt * 0.012 * spraying);
        F.sprayT = (F.sprayT || 0) - dt;
        if (F.sprayT <= 0) { F.sprayT = 0.35; NB.Audio.play('spray', { pos: b.top, vol: 0.35 }); NB.UI.fx(b.cx + NB.rr(-3, 3), b.top.y * 0.6, b.cz + NB.rr(-3, 3), 'steam', { vy: 1.2, life: 1.6 }); }
      }
      if (F.intensity <= 0 && F.crew.every((c) => c.done)) { F.phase = 'leaving'; T.depart(true); }
    }
    if (F.phase === 'leaving' && T.done) { F.phase = 'soot'; F.sootT = 0; }
    if (F.phase === 'soot') { // the walls slowly lose the soot (~10 min)
      F.sootT += dt; const k = Math.min(1, F.sootT / 600), g = Math.round(0x6e + (0xff - 0x6e) * k);
      if (b.sprite) b.sprite.tint = (g << 16) | (Math.round(0x6a + (0xff - 0x6a) * k) << 8) | Math.round(0x66 + (0xff - 0x66) * k);
      if (k >= 1) { if (b.sprite) b.sprite.tint = 0xffffff; E.fire = null; }
    }
  }

  // ---------------------------------------------------------------- visitors (Joel + Mariana from Lenzburg, by Mini)
  // NB.Data.visitors: { members: [ids], car: { color, name, lines }, arrive: ['10:30', '13:00'], leave: ['20:00', '22:00'] }.
  // Arrival / departure times are drawn once per day. The car drives in on the Niederwilerstrasse, parks in Mige's
  // yard, the visitors get out and follow their routines; at leaving time they walk back to the car and it drives off.
  class Visit {
    constructor(d, members, idx) {
      this.d = d; this.members = members; this.car = null; this.state = 'away'; this.leaveT = 0;
      const r = NB.seeded((NB.clock.day || 1) * 7 + 3 + (idx || 0) * 131), w = (a, b) => NB.toMin(a) + r() * (NB.toMin(b) - NB.toMin(a));
      this.arrive = w(d.arrive[0], d.arrive[1]);
      this.leave = d.stay ? this.arrive + d.stay[0] + r() * (d.stay[1] - d.stay[0]) : w(d.leave[0], d.leave[1]); // stay: minutes
      this.parking = (map.parkings && map.parkings[d.park || 'mige']) || (map.farmProps && map.farmProps.parking);
      this.byBus = d.by === 'bus'; // comes and goes with the Postauto (Mitteldorf stop)
      if (this.byBus) { this.stop = map.busStops.find((st) => /Mitteldorf/.test(st.name)) || map.busStops[0]; this.parking = this.stop ? { x: this.stop.x, z: this.stop.z, heading: 0 } : null; }
    }
    busHere() { const c = this.car; return c && !c.done && c.stopT > 0 && Math.hypot(c.x - this.stop.x, c.z - this.stop.z) < 16; }
    here(min) { return min >= this.arrive && min < this.leave; }
    start(instant, reverse) {
      if (!this.parking) return;
      this.state = instant ? 'visiting' : 'arriving';
      if (this.byBus) { // the Postauto from Mellingen (north-east end of the route)
        if (instant) this.members.forEach((m) => m.arrive(this.parking, true));
        else this.car = add(new Vehicle('bus', reverse == null ? false : !!reverse));
        return;
      }
      this.car = add(new Vehicle(this.d.car.type || 'mini', reverse == null ? Math.random() < 0.5 : !!reverse, { parkAt: this.parking, parkedNow: !!instant, color: this.d.car.color, name: this.d.car.name, lines: this.d.car.lines }));
      if (instant) this.members.forEach((m) => m.arrive(this.parking, true));
    }
    update(dt) {
      const min = NB.clock.minutes();
      if (this.state === 'away') { if (this.here(min)) this.start(false); return; }
      if (this.byBus) {
        if (this.state === 'arriving') { if (this.busHere() || !this.car || this.car.done) { this.state = 'visiting'; this.members.forEach((m, i) => m.arrive(this.parking, false, i)); this.car = null; } return; }
        if (this.state === 'visiting') { if (!this.here(min)) { this.state = 'leaving'; this.leaveT = 0; this.members.forEach((m) => m.goToCar(this.parking, true)); } return; }
        if (this.state === 'leaving') { // wait at the stop, then board the next Postauto
          this.leaveT += dt;
          const atStop = this.members.every((m) => m.away || Math.hypot(m.x - this.parking.x, m.z - this.parking.z) < 6) || this.leaveT > 180;
          if (atStop && (!this.car || this.car.done)) this.car = add(new Vehicle('bus', true));
          if (this.car && this.busHere() && atStop) { this.members.forEach((m) => { if (!m.away) m.enterCar(); }); this.state = 'departing'; }
          return;
        }
        if (this.state === 'departing' && (!this.car || this.car.done)) { this.state = 'away'; this.car = null; }
        return;
      }
      if (this.state === 'arriving') { if (this.car.parked) { this.state = 'visiting'; this.members.forEach((m, i) => m.arrive(this.parking, false, i)); } return; }
      if (this.state === 'visiting') { if (!this.here(min)) { this.state = 'leaving'; this.leaveT = 0; this.members.forEach((m) => m.goToCar(this.parking)); } return; }
      if (this.state === 'leaving') {
        this.leaveT += dt;
        if (this.members.every((m) => m.away) || this.leaveT > 150) {
          this.members.forEach((m) => { if (!m.away) m.enterCar(); });
          this.car.depart(Math.random() < 0.5); this.state = 'departing';
        }
        return;
      }
      if (this.state === 'departing' && (!this.car || this.car.done)) { this.state = 'away'; this.car = null; }
    }
  }
  const visits = [];

  // ---------------------------------------------------------------- residents' car trips (André's army jeep)
  // NB.Data.outings: { parking (map.parkings key), street (the street the driveway joins), car: { type, color, name, lines },
  //   trips: [{ members, go: [from, to], away: [min, max] minutes, chance, cruise, leave: { id: line }, back: { id: line } }] }
  // The car stays parked at home; for each trip that happens today the members walk to it, drive off along their
  // street and the Niederwilerstrasse, are away for a while (a cruising jeep rumbles through once) and come back.
  class Outing {
    constructor(d, idx) {
      this.d = d; this.idx = idx; this.parking = map.parkings && map.parkings[d.parking];
      this.state = 'home'; this.car = null; this.trip = null; this.cruiser = null;
      this.schedule();
    }
    schedule() {
      this.day = NB.clock.day || 1;
      const r = NB.seeded(this.day * 13 + 5 + this.idx * 97);
      this.trips = this.d.trips.map((t) => {
        const go = NB.toMin(t.go[0]) + r() * (NB.toMin(t.go[1]) - NB.toMin(t.go[0])), on = r() < (t.chance == null ? 1 : t.chance);
        return Object.assign({}, t, { goAt: go, backAt: go + t.away[0] + r() * (t.away[1] - t.away[0]), on, done: !on });
      });
    }
    members(trip) { return E.list.filter((e) => e.kind === 'villager' && trip.members.includes(e.c.id)); }
    carOpts(extra) { return Object.assign({ color: this.d.car.color, name: this.d.car.name, lines: this.d.car.lines }, extra); }
    // road between the map edge and the parking spot: Niederwilerstrasse (route) -> own street -> driveway (A*)
    road(arriving) {
      if (!this.rd) {
        const P = this.parking, route = map.route;
        const st = NB.Scene.streets.filter((q) => q.name === this.d.street).sort((a, b) => b.pts.length - a.pts.length)[0];
        const dense = [];
        st.pts.forEach(([x, z], k) => {
          if (k) { const [x0, z0] = st.pts[k - 1], n = Math.max(1, Math.ceil(Math.hypot(x - x0, z - z0) / 2)); for (let j = 1; j <= n; j++) dense.push({ x: x0 + ((x - x0) * j) / n, z: z0 + ((z - z0) * j) / n }); }
          else dense.push({ x, z });
        });
        const e = nearestIdx(dense, P);
        // drive to the nearer end of the street that joins the route (counted along the street)
        const endDist = (p) => Math.min(...route.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
        const firstOk = endDist(dense[0]) < 4, lastOk = endDist(dense[dense.length - 1]) < 4;
        const useFirst = firstOk && (!lastOk || e < dense.length - 1 - e) || (!firstOk && !lastOk && endDist(dense[0]) < endDist(dense[dense.length - 1]));
        const toEnd = useFirst ? dense.slice(0, e + 1).reverse() : dense.slice(e);
        const k = nearestIdx(route, toEnd[toEnd.length - 1]);
        const [sx, sz] = map.toCell(dense[e].x, dense[e].z), [tx, tz] = map.toCell(P.x, P.z);
        // driveway over the lawn, not across the boule court / flower beds
        const cost = map.walkCost.slice(), K = map.kochProps;
        if (K) for (let cz = 0; cz < map.h; cz++) for (let cx = 0; cx < map.w; cx++) {
          const c = map.cellCentre(cx, cz), dx = c.x - K.court.x, dz = c.z - K.court.z;
          const [a, b] = K.court.alongX ? [dx, dz] : [dz, dx];
          if (Math.abs(a) < K.court.len / 2 + 1 && Math.abs(b) < K.court.wid / 2 + 1) cost[cz * map.w + cx] = 0;
        }
        const cells = NB.findPath(cost, map.w, map.h, sx, sz, tx, tz) || [];
        const drive = cells.filter((_, j) => j % 3 === 2).map(({ x: cx, y: cz }) => Object.assign(map.cellCentre(cx, cz), { slow: true }));
        this.rd = { toEnd, k, drive };
      }
      const { toEnd, k, drive } = this.rd, route = map.route;
      const out = Math.random() < 0.5 ? route.slice(k) : route.slice(0, k + 1).reverse(); // junction -> one end of the village
      if (arriving) {
        const road = out.slice().reverse().concat(toEnd.slice().reverse());
        return laneOffset(road, 1.4).concat(drive, [{ x: this.parking.x, z: this.parking.z, slow: true }]);
      }
      return drive.slice().reverse().concat(laneOffset(toEnd.concat(out), 1.4));
    }
    start() {
      if (!this.parking) return;
      const min = NB.clock.minutes();
      const t = this.trips.find((q) => q.on && min >= q.goAt && min < q.backAt);
      for (const q of this.trips) if (q.goAt <= min) q.done = true;
      if (t) { this.trip = t; t.cruised = true; this.state = 'out'; this.members(t).forEach((m) => { m.enterCar(); }); }
      else this.car = add(new Vehicle(this.d.car.type, false, this.carOpts({ parkAt: this.parking, parkedNow: true })));
    }
    update(dt) {
      if (!this.parking) return;
      const min = NB.clock.minutes(), newDay = (NB.clock.day || 1) !== this.day;
      if (this.state === 'home') {
        if (newDay) this.schedule();
        const t = this.trips.find((q) => !q.done && min >= q.goAt);
        if (!t) return;
        t.done = true;
        const ms = this.members(t).filter((m) => !m.away);
        if (min >= t.backAt || !this.car || !this.car.parked || ms.length < t.members.length) return; // missed (time jump) or someone is away
        this.trip = t; this.state = 'boarding'; this.t = 0;
        ms.forEach((m) => m.goToCar(this.parking, false, t.leave && t.leave[m.c.id]));
        return;
      }
      const t = this.trip;
      if (this.state === 'boarding') {
        this.t += dt;
        const ms = this.members(t);
        if (ms.every((m) => m.away) || this.t > 150) {
          ms.forEach((m) => { if (!m.away) m.enterCar(); });
          this.car.departAlong(this.road(false)); this.state = 'out';
          if (NB.UI.onScreen(this.car)) NB.Audio.play('honk', { pos: this.car, rate: 0.85, vol: 0.5 });
        }
        return;
      }
      if (this.state === 'out') {
        if (this.car && this.car.done) this.car = null;
        if (this.cruiser && this.cruiser.done) this.cruiser = null;
        // cruising: halfway through the ride the jeep rumbles through the village once
        if (t.cruise && !t.cruised && !this.car && min >= (t.goAt + t.backAt) / 2) { t.cruised = true; this.cruiser = add(new Vehicle(this.d.car.type, Math.random() < 0.5, this.carOpts())); }
        if ((min >= t.backAt || newDay) && !this.car && !this.cruiser) {
          this.car = add(new Vehicle(this.d.car.type, false, this.carOpts({ parkAt: this.parking, path: this.road(true) })));
          this.state = 'returning';
        }
        return;
      }
      if (this.state === 'returning' && this.car.parked) {
        this.members(t).forEach((m, i) => m.arrive(this.parking, false, i, t.back && t.back[m.c.id]));
        this.state = 'home'; this.trip = null;
        if (newDay) this.schedule();
      }
    }
  }
  const outings = [];

  let nextCar = 4, nextBus = 8, busDir = 0, nextTractor = 14;
  // a tractor works a field by day (not in winter, not in rain/snow); otherwise one may drive through the village
  function spawnFieldTractor(fieldIndex) {
    const fields = map.fields.filter((f) => map.fieldLanes(f).length >= 3 && (fieldIndex == null || f.i === fieldIndex));
    if (!fields.length) return false;
    const field = NB.pick(fields), lanes = map.fieldLanes(field);
    const n = Math.min(lanes.length, NB.ri(4, 8)), start = NB.ri(0, lanes.length - n);
    add(new FieldTractor(field, lanes.slice(start, start + n)));
    return true;
  }
  function spawnTraffic(dt) {
    const m = NB.clock.minutes();
    const nightQuiet = NB.inWindow(m, '00:30', '05:30');
    nextCar -= dt; nextBus -= dt; nextTractor -= dt;
    if (nextBus <= 0) { nextBus = NB.rr(50, 90); if (!nightQuiet) add(new Vehicle('bus', busDir++ % 2 === 1)); }
    if (nextCar <= 0) { nextCar = nightQuiet ? NB.rr(40, 90) : NB.rr(12, 30); add(new Vehicle('car', Math.random() < 0.5)); }
    if (nextTractor <= 0) {
      nextTractor = NB.rr(90, 200);
      const working = NB.inWindow(m, '07:00', '19:30') && NB.season !== 'winter' && !['rain', 'snow'].includes(NB.Env.weather);
      const busy = E.list.some((e) => e.kind === 'tractor');
      if (working && !busy && Math.random() < 0.75) spawnFieldTractor();
      else if (!nightQuiet && Math.random() < 0.5) add(new Vehicle('tractor', Math.random() < 0.5));
    }
  }

  E.init = function () {
    (NB.Data.characters || []).forEach((c) => {
      if (!map.buildings[c.home]) { console.warn('unknown home', c.home, c.id); return; }
      add(new Villager(c));
    });
    Object.values(map.buildings).forEach((b) => { if (b.occupants.length && b.kind === 'house') b.name = 'Huus vo ' + b.occupants.map((v) => v.name).join(' & ') + (b.addr ? ' (' + b.addr + ')' : ''); });
    (NB.Data.visitors || []).forEach((d, idx) => {
      const members = E.list.filter((e) => e.kind === 'villager' && (d.members || []).includes(e.c.id));
      const v = new Visit(d, members, idx); visits.push(v);
      if (v.here(NB.clock.minutes())) v.start(true);
    });
    (NB.Data.outings || []).forEach((d, idx) => { const o = new Outing(d, idx); outings.push(o); o.start(); });
    (NB.Data.animals || []).filter((a) => a.kind === 'cat').forEach((a) => add(new Cat(a)));
    if (map.water.length) (NB.Data.animals || []).filter((a) => a.kind === 'duck').forEach((a) => add(new Duck(a)));
    (NB.Data.animals || []).filter((a) => a.kind === 'dog').forEach((a) => { const o = E.list.find((e) => e.kind === 'villager' && e.c.id === a.owner); if (o) add(new Dog(a, o)); });
  };
  E.spawnFieldTractor = spawnFieldTractor; // for tests / the console
  E.visits = visits;
  E.outings = outings;
  E.update = function (dt) {
    spawnTraffic(dt);
    for (const v of visits) v.update(dt);
    for (const o of outings) o.update(dt);
    updateFire(dt);
    for (const e of E.list) e.update(dt);
    E.list = E.list.filter((e) => !e.done);
  };
})(window.NB);
