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
  function place(e, rec, x, y, z) {
    const p = I.project(x, y, z), s = e.sprite;
    e.frame = rec;
    if (s.texture !== rec.tex) s.texture = rec.tex;
    s.x = Math.round(p[0]) - rec.ox; s.y = Math.round(p[1]) - rec.oy;
    s.zIndex = NB.world.zkey(x, z);
  }

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
      return { place: cur.go };
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
      home.occupants.push(this);
      const g = this.currentGoal();
      if (g.place === 'home' || g.place.startsWith('home:')) { this.target = this.homeOf(g.place) || home; this.enter(); }
      else { const s = map.randomIn(g.place, this.cost); if (s) { this.x = s.x; this.z = s.z; } }
      this.heading = Math.random() * 6.28;
    }
    currentGoal() {
      const g = resolveGoal(this.c, NB.clock.minutes());
      if (g) return g;
      const now = performance.now() / 1000;
      if (!this.fav || now > this.favUntil) { this.fav = NB.pick(this.c.favorites && this.c.favorites.length ? this.c.favorites : ['dorfplatz']); this.favUntil = now + NB.rr(60, 150); }
      return { place: this.fav };
    }
    homeOf(place) { return place === 'home' ? this.home : place.startsWith('home:') ? map.buildings[place.slice(5)] : null; }
    enter() { this.inside = true; this.path = null; const b = this.target || this.home; b.inside.add(this); this.inBuilding = b; }
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
      let tx = this.x, tz = this.z;
      for (let k = 0; k < 16 && g(tx, tz) < 1.6; k++) { tx += nx * 0.5; tz += nz * 0.5; }
      const [cx, cz] = map.toCell(tx, tz);
      if (!map.inB(cx, cz) || !map.walkCost[cz * map.w + cx]) return;
      this.evading = { v, x: tx, z: tz, t: 0 };
      this.pause = 0; this.moving = true;
      if (Math.random() < 0.45) say(this, v.type === 'bus' ? NB.pick(["S'Postauto!", 'Ui, de Bus!']) : NB.pick(['Achtung, es Auto!', "Hopp, uf d'Siite!", 'Ui!', 'Langsam!']), { quiet: true });
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
      if (this.hop > 0) this.hop = Math.max(0, this.hop - dt);
      if (this.evading) { this.updateEvade(dt); return this.pose(dt); }
      if (this.pause > 0) { this.pause -= dt; this.moving = false; return this.pose(dt); }
      const g = this.currentGoal();
      const building = this.homeOf(g.place);
      if (g.place !== this.goalKey) {
        this.goalKey = g.place; this.target = building; this.path = null;
        if (this.inside && this.inBuilding !== building) this.leave();
        if (!this.inside) {
          if (building) this.goTo(building.entryPt.x, building.entryPt.z);
          else { const t = map.randomIn(g.place, this.cost); if (t) this.goTo(t.x, t.z); }
        }
      }
      if (this.inside) return this.pose(dt);
      const done = this.stepPath(dt);
      if (done) {
        if (building) {
          if (Math.hypot(this.x - building.entryPt.x, this.z - building.entryPt.z) < 2.5 || !this.goTo(building.entryPt.x, building.entryPt.z)) this.enter();
        } else {
          this.wait -= dt;
          if (this.wait <= 0) { this.wait = NB.rr(3, 12); const t = map.randomIn(g.place, this.cost); if (t) this.goTo(t.x, t.z); }
          this.chatCd -= dt;
          if (this.chatCd <= 0) { this.chatCd = NB.rr(25, 60); this.chat(); }
        }
      }
      this.pose(dt);
    }
    pose(dt) {
      const s = this.sprite;
      s.visible = !this.inside;
      if (this.inside) return;
      this.shown = angleLerp(this.shown, this.heading, Math.min(1, dt * 10));
      const f = I.facing(this.shown);
      const view = f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left';
      let rec;
      if (this.pause > 0 && this.hop <= 0 && view === 'down') rec = this.frames.wave[Math.floor(performance.now() / 220) % 2]; // wave
      else rec = this.frames[view][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0];
      place(this, rec, this.x, this.hopY(), this.z);
    }
    chat() {
      const other = E.list.find((o) => o !== this && o.kind === 'villager' && !o.inside && Math.hypot(o.x - this.x, o.z - this.z) < 5);
      const night = this.c.sleep && NB.inWindow(NB.clock.minutes(), this.c.sleep[0], this.c.sleep[1]);
      const line = other && Math.random() < 0.6 ? NB.pick(['Sali ', 'Hoi ', 'Grüezi ', 'Tschau ']) + other.name + '!' : NB.pick((night && this.c.night) || this.c.random || ['Schöne Tag hüt!']);
      if (!line) return;
      say(this, line, { quiet: true });
      if (NB.UI.onScreen(this)) NB.Audio.babble(line, this.c.voice, { pos: this, vol: 0.5 });
    }
    click() {
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
    get visible() { return !this.inside; }
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
      if (this.state === 'zoom') { this.updateZoomies(dt); return this.pose(dt); }
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
        if (r < this.sleepy()) { this.state = 'sleep'; this.timer = NB.rr(20, 60); }
        else if (r < 0.6) {
          const t = map.randomIn(this.area, this.cost);
          if (t && Math.hypot(t.x - this.x, t.z - this.z) < 30 && this.goTo(t.x, t.z)) this.state = 'walk';
          else { this.state = 'sit'; this.timer = NB.rr(3, 10); }
        } else { this.state = 'sit'; this.timer = NB.rr(3, 10); }
      }
      this.pose(dt);
    }
    // ---- zoomies: sprint in zig-zags around the spot, hop, kick up dust, then sit down proud ----
    startZoomies() {
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
      const set = moving ? F.walk[Math.floor(this.anim * (zoom ? 14 : 6)) % 2] : this.state === 'sleep' ? F.sleep : F.sit;
      place(this, set[this.dir], this.x, hop, this.z);
    }
    click() {
      const now = performance.now() / 1000;
      const again = now - this.lastClick < 3;
      this.clicks = again ? this.clicks + 1 : 0; this.lastClick = now;
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
    startPurr(t) {
      if (this.state === 'sleep') this.speak('Mrrr?');
      if (this.state === 'zoom') { this.state = 'sit'; this.speed = 1.4; }
      this.path = null; this.purrT = Math.max(this.purrT, t);
      if (!this.purr) { this.purr = NB.Audio.loop('purr', { pos: this }); this.speak('Rrrrr… ♥'); }
    }
    holdStart() { this.held = true; this.startPurr(1); return true; }
    holdEnd() { this.held = false; this.purrT = Math.max(this.purrT, 0.6); }
    get visible() { return true; }
    top() { return { x: this.x, y: 1.1, z: this.z }; }
  }

  // ---------------------------------------------------------------- vehicles on Niederwilerstrasse
  const CAR_COLORS = ['#e05a5a', '#4f8fd6', '#f2f2ea', '#4a4a55', '#9aa0aa', '#5bb07a', '#e8b030'];
  function laneOffset(pts, off) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { x: p.x - (dz / l) * off, z: p.z + (dx / l) * off }; // right-hand side
    });
  }
  class Vehicle {
    constructor(type, reverse) {
      this.type = type; this.kind = 'vehicle';
      const base = map.route.slice(); if (reverse) base.reverse();
      this.pts = laneOffset(base, 1.5);
      this.x = this.pts[0].x; this.z = this.pts[0].z; this.i = 1; this.heading = 0; this.life = 0;
      this.color = NB.pick(CAR_COLORS); this.sprite = new PIXI.Sprite(); this.shown = null;
      this.maxSpeed = type === 'bus' ? 7 : NB.rr(8, 10);
      this.speed = this.maxSpeed; this.stopT = 0; this.done = false;
      this.name = type === 'bus' ? 'Postauto' : 'Auto';
      this.stops = [];
      if (type === 'bus') for (const s of map.busStops) {
        let best = -1, bd = 8;
        base.forEach((p, k) => { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = k; } });
        if (best > 0) this.stops.push(best);
      }
    }
    update(dt) {
      this.life += dt;
      const p = this.pts[this.i];
      if (!p) { this.done = true; NB.world.remove(this.sprite); return; }
      if (this.stopT > 0) { this.stopT -= dt; if (this.stopT <= 0 && NB.UI.onScreen(this) && NB.Env.darkness < 0.7) NB.Audio.horn({ pos: this }); return this.pose(dt); }
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.01) this.heading = Math.atan2(dx, dz);
      let target = this.maxSpeed;
      // people on the street ahead jump aside
      for (const o of E.list) {
        if (o.kind !== 'villager' || o.inside || o.evading) continue;
        const ox = o.x - this.x, oz = o.z - this.z, ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (ahead > 0 && ahead < 26 && side < 5 && map.streetDist(o.x, o.z) < 1.2) o.evade(this);
      }
      for (const o of E.list) {
        if (o === this || (o.kind !== 'vehicle' && !(o.kind === 'villager' && !o.inside) && o.kind !== 'cat')) continue;
        const ox = o.x - this.x, oz = o.z - this.z;
        const ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (ahead > 0 && ahead < 14 && side < 2) target = Math.min(target, Math.max(0, (ahead - (o.kind === 'vehicle' ? 8 : 3.5)) * 1.5));
      }
      this.speed += NB.clamp(target - this.speed, -12 * dt, 4 * dt);
      const step = this.speed * dt;
      if (d <= step) { this.x = p.x; this.z = p.z; if (this.stops.includes(this.i)) { this.stopT = 6; this.speed = 0; } this.i++; }
      else { this.x += (dx / d) * step; this.z += (dz / d) * step; }
      this.pose(dt);
    }
    pose(dt) {
      this.shown = this.shown == null ? this.heading : angleLerp(this.shown, this.heading, Math.min(1, dt * 6));
      place(this, NB.Models.vehicle(this.type, this.color, this.shown), this.x, 0, this.z);
      // fade in / out at the ends of the street
      const left = this.pts.length - this.i;
      this.sprite.alpha = Math.min(1, this.life / 0.8, left < 2 ? Math.max(0, left / 2) : 1);
    }
    click() {
      if (this.type === 'bus') { say(this, NB.pick(['Tü-ta-to! 🎺', 'Nöchsti Halt: Nesselnbach, Mitteldorf.', 'Bitte iistiige!'])); NB.Audio.horn({ pos: this }); }
      else { say(this, NB.pick(['Tüüt tüüt!', 'Ich ha\'s pressant!', 'Langsam dur s\'Dorf, gäll!'])); NB.Audio.play('honk', { pos: this }); }
    }
    get visible() { return true; }
    top() { return { x: this.x, y: this.type === 'bus' ? 3.8 : 2.3, z: this.z }; }
  }

  let nextCar = 4, nextBus = 8, busDir = 0;
  function spawnTraffic(dt) {
    const m = NB.clock.minutes();
    const nightQuiet = NB.inWindow(m, '00:30', '05:30');
    nextCar -= dt; nextBus -= dt;
    if (nextBus <= 0) { nextBus = NB.rr(50, 90); if (!nightQuiet) add(new Vehicle('bus', busDir++ % 2 === 1)); }
    if (nextCar <= 0) { nextCar = nightQuiet ? NB.rr(40, 90) : NB.rr(12, 30); add(new Vehicle('car', Math.random() < 0.5)); }
  }

  E.init = function () {
    (NB.Data.characters || []).forEach((c) => {
      if (!map.buildings[c.home]) { console.warn('unknown home', c.home, c.id); return; }
      add(new Villager(c));
    });
    Object.values(map.buildings).forEach((b) => { if (b.occupants.length && /^Huus \d/.test(b.name)) b.name = 'Huus vo ' + b.occupants.map((v) => v.name).join(' & '); });
    (NB.Data.animals || []).filter((a) => a.kind === 'cat').forEach((a) => add(new Cat(a)));
  };
  E.update = function (dt) {
    spawnTraffic(dt);
    for (const e of E.list) e.update(dt);
    E.list = E.list.filter((e) => !e.done);
  };
})(window.NB);
