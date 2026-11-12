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
      else { const s = map.randomIn(g.place, this.cost); if (s) { this.x = s.x; this.z = s.z; } }
    }
    // ---- visitors: arrive with the car, walk back to it when it is time to go ----
    arrive(p, instant, idx) {
      this.away = false; this.toCar = null; this.inside = false; this.fishing = null; this.fled = null;
      if (instant) { this.appear(); return; }
      this.x = p.x + NB.rr(-1, 1) + (idx || 0) * 1.5; this.z = p.z + NB.rr(-1, 1) + 1.2; this.goalKey = null; this.path = null;
      this.pause = 1.5 + (idx || 0) * 0.7; this.heading = I.towardCamera;
      const line = NB.pick(this.c.arriveLines || ['Hoi zäme!']);
      say(this, line); if (NB.UI.onScreen(this)) NB.Audio.babble(line, this.c.voice, { pos: this });
      NB.Audio.play('door', { pos: this, vol: 0.5 });
    }
    goToCar(p) {
      this.toCar = p; this.goalKey = null; this.path = null; this.fishing = null;
      const line = NB.pick(this.c.leaveLines || ['Tschüss zäme!']);
      say(this, line); if (NB.UI.onScreen(this)) NB.Audio.babble(line, this.c.voice, { pos: this });
    }
    enterCar() {
      if (this.inside) { (this.inBuilding || this.home).inside.delete(this); this.inside = false; this.inBuilding = null; }
      this.away = true; this.toCar = null; this.path = null; this.fishing = null; this.moving = false;
      NB.Audio.play('door', { pos: this, vol: 0.5 });
    }
    currentGoal() {
      const now = performance.now() / 1000;
      if (this.toCar) return { place: 'car', pt: this.toCar }; // visitors walking back to their car
      if (this.fled && now < this.fled.until) return { place: 'home', flee: true }; // chased away: run home, come back later
      if (this.guarding && now < this.guarding.until) return { place: this.c.guard, guard: true }; // the owner checks on his pond
      const g = resolveGoal(this.c, NB.clock.minutes());
      if (g) return g;
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
        this.goalKey = g.place; this.target = building; this.path = null; this.act = g.act || null; this.fishing = null;
        if (this.inside && this.inBuilding !== building) this.leave();
        if (!this.inside) {
          if (building) this.goTo(building.entryPt.x, building.entryPt.z);
          else if (g.pt) this.goTo(g.pt.x, g.pt.z);
          else { const t = map.randomIn(g.place, this.cost); if (t) this.goTo(t.x, t.z); }
        }
      }
      if (this.inside) return this.pose(dt);
      const done = this.stepPath(dt);
      if (done) {
        if (building) {
          if (Math.hypot(this.x - building.entryPt.x, this.z - building.entryPt.z) < 2.5 || !this.goTo(building.entryPt.x, building.entryPt.z)) this.enter();
        } else if (g.pt) {
          if (Math.hypot(this.x - g.pt.x, this.z - g.pt.z) < 3 || !this.goTo(g.pt.x, g.pt.z)) this.enterCar();
        } else if (this.act === 'fish' && map.fishing) {
          if (!this.fishing) this.startFishing();
          this.updateFishing(dt);
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
      s.visible = !this.inside && !this.away;
      if (this.inside || this.away) return;
      this.shown = angleLerp(this.shown, this.heading, Math.min(1, dt * 10));
      const f = I.facing(this.shown);
      const view = f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left';
      let rec;
      if (this.pause > 0 && this.hop <= 0 && view === 'down') rec = this.frames.wave[Math.floor(performance.now() / 220) % 2]; // wave
      else rec = this.frames[view][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0];
      place(this, rec, this.x, this.hopY(), this.z);
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
    // a vehicle is coming: dash a few metres off to the side (sleeping cats wake up first)
    scare(v) {
      if (this.state === 'zoom' || this.purrT > 0 || this.held || (this.scaredT && performance.now() / 1000 < this.scaredT)) return;
      this.scaredT = performance.now() / 1000 + 6;
      const hx = Math.sin(v.heading), hz = Math.cos(v.heading);
      const side = (this.x - v.x) * hz - (this.z - v.z) * hx >= 0 ? 1 : -1; // which side of the car we are on
      for (let k = 0; k < 10; k++) {
        const d = NB.rr(4, 8), x = this.x + hz * side * d + hx * NB.rr(-2, 2), z = this.z - hx * side * d + hz * NB.rr(-2, 2);
        const [cx, cz] = map.toCell(x, z);
        if (map.inB(cx, cz) && this.cost[cz * map.w + cx] && map.streetDist(x, z) > 1 && this.goTo(x, z)) {
          if (this.state === 'sleep') this.speak('Mrrr!');
          this.state = 'walk'; this.anim += 0.5; this.timer = NB.rr(3, 8);
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
    holdStart() { this.held = true; this.startPurr(1); return true; }
    holdEnd() { this.held = false; this.purrT = Math.max(this.purrT, 0.6); }
    get visible() { return true; }
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
      this.maxSpeed = type === 'bus' ? 7 : type === 'tractor' ? 4 : type === 'mini' ? 7 : NB.rr(8, 10);
      this.speed = this.maxSpeed; this.stopT = 0; this.done = false; this.putT = 0;
      this.name = opts.name || (type === 'bus' ? 'Postauto' : type === 'tractor' ? 'Traktor' : 'Auto');
      this.lines = opts.lines || null;
      this.parkAt = opts.parkAt || null; this.parked = false; this.departing = false;
      if (this.parkAt) {
        const k = nearestIdx(base, this.parkAt);
        if (opts.parkedNow) { this.pts = []; this.i = 0; this.x = this.parkAt.x; this.z = this.parkAt.z; this.heading = this.shown = this.parkAt.heading; this.parked = true; this.life = 5; }
        else this.pts = laneOffset(base.slice(0, k + 1), 1.5).concat([{ x: this.parkAt.x, z: this.parkAt.z }]);
      }
      this.stops = [];
      if (type === 'bus') for (const s of map.busStops) {
        let best = -1, bd = 8;
        base.forEach((p, k) => { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = k; } });
        if (best > 0) this.stops.push(best);
      }
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
      const p = this.pts[this.i];
      if (!p) {
        if (this.parkAt && !this.departing) { this.parked = true; this.speed = 0; this.heading = this.parkAt.heading; return this.pose(dt); }
        this.done = true; NB.world.remove(this.sprite); return;
      }
      if (this.stopT > 0) { this.stopT -= dt; if (this.stopT <= 0 && NB.UI.onScreen(this) && NB.Env.darkness < 0.7) NB.Audio.horn({ pos: this }); return this.pose(dt); }
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.01) this.heading = Math.atan2(dx, dz);
      let target = this.maxSpeed;
      if (this.parkAt && (this.i >= this.pts.length - 1 || (this.departing && this.i <= 1))) target = Math.min(target, 3); // crawl into / out of the yard
      // people on the street ahead jump aside, cats scurry off
      for (const o of E.list) {
        if (o.kind === 'cat') {
          const ox = o.x - this.x, oz = o.z - this.z, ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
          if (ahead > -1 && ahead < 14 && side < 3) o.scare(this);
          continue;
        }
        if (o.kind !== 'villager' || o.inside || o.away || o.evading) continue;
        const ox = o.x - this.x, oz = o.z - this.z, ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (ahead > 0 && ahead < 26 && side < 5 && map.streetDist(o.x, o.z) < 1.2) o.evade(this);
      }
      // blocked for a while (someone standing in the way): creep on regardless
      this.blockedT = this.speed < 0.3 ? (this.blockedT || 0) + dt : 0;
      if (this.blockedT < 6) for (const o of E.list) {
        if (o === this || o.parked || (o.kind !== 'vehicle' && !(o.kind === 'villager' && !o.inside && !o.away) && o.kind !== 'cat')) continue;
        const ox = o.x - this.x, oz = o.z - this.z;
        const ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (ahead > 0 && ahead < 14 && side < 2) target = Math.min(target, Math.max(0, (ahead - (o.kind === 'vehicle' ? 8 : 3.5)) * 1.5));
      } else target = Math.min(target, 2);
      this.speed += NB.clamp(target - this.speed, -12 * dt, 4 * dt);
      const step = this.speed * dt;
      if (d <= step) { this.x = p.x; this.z = p.z; if (this.stops.includes(this.i)) { this.stopT = 6; this.speed = 0; } this.i++; }
      else { this.x += (dx / d) * step; this.z += (dz / d) * step; }
      this.pose(dt);
    }
    pose(dt) {
      this.shown = this.shown == null ? this.heading : angleLerp(this.shown, this.heading, Math.min(1, dt * 6));
      place(this, NB.Models.vehicle(this.type, this.color, this.shown), this.x, 0, this.z);
      // fade in / out at the ends of the street (not when pulling into the yard)
      const left = this.pts.length - this.i, arriving = this.parkAt && !this.departing;
      this.sprite.alpha = Math.min(1, this.life / 0.8, left < 2 && !arriving ? Math.max(0, left / 2) : 1);
    }
    click() {
      if (this.lines) { say(this, NB.pick(this.lines)); NB.Audio.play('honk', { pos: this, rate: 1.35, vol: 0.6 }); }
      else if (this.type === 'bus') { say(this, NB.pick(['Tü-ta-to! 🎺', 'Nöchsti Halt: Nesselnbach, Mitteldorf.', 'Bitte iistiige!'])); NB.Audio.horn({ pos: this }); }
      else if (this.type === 'tractor') { say(this, NB.pick(TRACTOR_LINES[NB.season] || TRACTOR_LINES.summer)); NB.Audio.play('honk', { pos: this, rate: 0.7 }); }
      else { say(this, NB.pick(['Tüüt tüüt!', 'Ich ha\'s pressant!', 'Langsam dur s\'Dorf, gäll!'])); NB.Audio.play('honk', { pos: this }); }
    }
    get visible() { return true; }
    top() { return { x: this.x, y: this.type === 'bus' ? 3.8 : this.type === 'tractor' ? 2.9 : 2.3, z: this.z }; }
  }
  // diesel putter while the tractor is on screen (overlapping short engine samples)
  function tractorNoise(t, dt, rate) {
    t.putT -= dt;
    if (t.putT > 0) return;
    t.putT = 0.55;
    if (NB.UI.onScreen(t)) NB.Audio.play('engine', { pos: t, vol: 0.2, rate: rate || 1 });
  }

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
        if (this.fade <= 0) { this.done = true; NB.world.remove(this.sprite); return; }
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
      NB.Audio.play('honk', { pos: this, rate: 0.7 });
      this.pauseT = 2.5; // the farmer stops for a chat
    }
    get visible() { return true; }
    top() { return { x: this.x, y: 2.9, z: this.z }; }
  }

  // ---------------------------------------------------------------- visitors (Joel + Mariana from Lenzburg, by Mini)
  // NB.Data.visitors: { members: [ids], car: { color, name, lines }, arrive: ['10:30', '13:00'], leave: ['20:00', '22:00'] }.
  // Arrival / departure times are drawn once per day. The car drives in on the Niederwilerstrasse, parks in Mige's
  // yard, the visitors get out and follow their routines; at leaving time they walk back to the car and it drives off.
  class Visit {
    constructor(d, members) {
      this.d = d; this.members = members; this.car = null; this.state = 'away'; this.leaveT = 0;
      const r = NB.seeded((NB.clock.day || 1) * 7 + 3), w = (a, b) => NB.toMin(a) + r() * (NB.toMin(b) - NB.toMin(a));
      this.arrive = w(d.arrive[0], d.arrive[1]); this.leave = w(d.leave[0], d.leave[1]);
      this.parking = map.farmProps && map.farmProps.parking;
    }
    here(min) { return min >= this.arrive && min < this.leave; }
    start(instant, reverse) {
      if (!this.parking) return;
      this.state = instant ? 'visiting' : 'arriving';
      this.car = add(new Vehicle('mini', reverse == null ? Math.random() < 0.5 : !!reverse, { parkAt: this.parking, parkedNow: !!instant, color: this.d.car.color, name: this.d.car.name, lines: this.d.car.lines }));
      if (instant) this.members.forEach((m) => m.arrive(this.parking, true));
    }
    update(dt) {
      const min = NB.clock.minutes();
      if (this.state === 'away') { if (this.here(min)) this.start(false); return; }
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
    Object.values(map.buildings).forEach((b) => { if (b.occupants.length && /^Huus \d/.test(b.name)) b.name = 'Huus vo ' + b.occupants.map((v) => v.name).join(' & '); });
    for (const d of NB.Data.visitors || []) {
      const members = E.list.filter((e) => e.kind === 'villager' && d.members.includes(e.c.id));
      if (!members.length) continue;
      const v = new Visit(d, members); visits.push(v);
      if (v.here(NB.clock.minutes())) v.start(true);
    }
    (NB.Data.animals || []).filter((a) => a.kind === 'cat').forEach((a) => add(new Cat(a)));
    if (map.water.length) (NB.Data.animals || []).filter((a) => a.kind === 'duck').forEach((a) => add(new Duck(a)));
  };
  E.spawnFieldTractor = spawnFieldTractor; // for tests / the console
  E.visits = visits;
  E.update = function (dt) {
    spawnTraffic(dt);
    for (const v of visits) v.update(dt);
    for (const e of E.list) e.update(dt);
    E.list = E.list.filter((e) => !e.done);
  };
})(window.NB);
