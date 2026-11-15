// Villagers: routines, spots, visits, fishing, boule, the garden, the Gassirunde, looking for a dog that ran off.
(function (NB) {
  const { E, I, map, place, say, angleLerp, claimSpot, releaseSpot, Mover, resolveGoal } = NB.Ent;
  class Villager extends Mover {
    constructor(c) {
      const home = map.buildings[c.home];
      super(home.entryPt.x, home.entryPt.z, map.walkCost, NB.rr(1.3, 1.6));
      this.c = c; this.kind = 'villager'; this.name = c.name; this.home = home;
      this.frames = NB.Models.person(NB.Fest.costume(c.look || {}, c.name.length * 3 + c.name.charCodeAt(0))); this.sprite = new PIXI.Sprite(); this.shown = 0;
      c._routine = (c.routine || []).slice().sort((a, b) => NB.toMin(a.at) - NB.toMin(b.at));
      c._lag = NB.rr(0, 4); // minutes
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
      else if (g.act === 'walk' && map.gassi) { const w = NB.pick(map.gassi); this.x = w.x; this.z = w.z; }
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
      if (this.searching) return { place: 'search', search: true }; // looking for a dog that ran off
      if (this.fled && now < this.fled.until) return { place: this.fled.place || 'home', flee: true }; // chased away / evacuated
      if (this.guarding && now < this.guarding.until) return { place: this.c.guard, guard: true }; // the owner checks on his pond
      const fg = NB.Fest.goal(this); if (fg) return fg; // festivals, Sunday Zopf, the snowman, the jeep
      const g = resolveGoal(this.c, NB.clock.minutes());
      if (this.c.helps && !(g && ['niederwil', 'bushalt'].includes(g.place))) { // Louis joins his dad when he works in the garden
        const h = E.list.find((v) => v.kind === 'villager' && v.c.id === this.c.helps);
        if (h && h.act === 'garden' && !h.inside && !h.away && h.goalKey && h.goalKey !== 'search') return { place: h.goalKey, act: 'garden' };
      }
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
      if (v.type === 'racer' && NB.UI.onScreen(this)) NB.UI.discover('racer');
      if (v.type === 'racer') NB.Fest.news('racer');
      if (Math.random() < 0.45) say(this, v.type === 'bus' ? NB.pick(["S'Postauto!", 'Ui, de Bus!']) : v.type === 'tractor' ? NB.pick(['De Buur mit em Traktor!', 'Tuck-tuck-tuck!', 'Hoi Buur!']) : v.type === 'racer' ? NB.pick(['RASER!', 'Wäg do, de spinnt!', 'Ui ui ui!']) : NB.pick(['Achtung, es Auto!', "Hopp, uf d'Siite!", 'Ui!', 'Langsam!']), { quiet: true });
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
      if (this.later && (this.later.t -= dt) <= 0) { // an answer a moment later (someone greeted us)
        const l = this.later.line; this.later = null;
        if (!this.inside) { say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: 0.6 }); }
      }
      if (this.fled && now >= this.fled.until) this.fled = null;
      if (this.guarding && now >= this.guarding.until) this.guarding = null;
      if (this.c.guard && !this.guarding && !this.fled) {
        const asleep = this.c.sleep && NB.inWindow(NB.clock.minutes(), this.c.sleep[0], this.c.sleep[1]);
        this.guardT -= dt;
        if (this.guardT <= 0 && !asleep) { this.guardT = NB.rr(150, 360); this.guarding = { until: now + NB.rr(50, 90) }; }
      }
      if (this.guarding && !this.inside) this.lookForPoachers(now);
      this.speed = this.baseSpeed * (this.fled ? 1.9 : this.searching ? 1.7 : 1);
      if (this.decideT > 0 && (this.decideT -= dt) <= 0) this.decideSearch();
      if (this.evading) { this.updateEvade(dt); return this.pose(dt); }
      if (this.pause > 0) { this.pause -= dt; this.moving = false; return this.pose(dt); }
      const g = this.currentGoal();
      const building = this.homeOf(g.place);
      if (g.place !== this.goalKey) {
        this.goalKey = g.place; this.target = building; this.path = null; this.act = g.act || null; this.fishing = null; this.gardenT = null; this.waterT = 0; this.sniffT = 0;
        if (map.bouleGame && map.bouleGame.by === this) map.bouleGame.fly = null;
        releaseSpot(this);
        if (this.inside && this.inBuilding !== building) this.leave();
        if (!this.inside) {
          if (building) this.goTo(building.entryPt.x, building.entryPt.z);
          else if (g.pt) this.goTo(g.pt.x, g.pt.z);
          else if (g.search) this.searchT = 0;
          else if (this.act === 'walk' && map.gassi) { // join the loop at the nearest waypoint
            const W = map.gassi; this.walkIdx = W.reduce((b, w, i) => (Math.hypot(w.x - this.x, w.z - this.z) < Math.hypot(W[b].x - this.x, W[b].z - this.z) ? i : b), 0); this.stopped = true;
            this.goTo(W[this.walkIdx].x, W[this.walkIdx].z);
          } else { const t = claimSpot(this, g.place); if (t) this.goTo(t.x, t.z); }
        }
      }
      if (this.inside) return this.pose(dt);
      if (g.search) { this.updateSearch(dt); return this.pose(dt); }
      if (this.act === 'walk' && map.gassi) this.walkTalk(dt);
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
        } else if (this.act === 'garden') {
          this.updateGarden(dt);
        } else if (this.act === 'play' && map.irisGarden) {
          this.updatePlay(dt);
        } else if (this.act === 'railway' && map.railway) {
          this.updateRailway(dt);
        } else if (this.act === 'football' && map.tanjaGarden && map.tanjaGarden.ball) {
          this.updateFootball(dt);
        } else if (this.act === 'walk' && map.gassi) {
          this.updateWalk(dt);
        } else if (this.updateAct && this.updateAct(dt, g)) { // acts of a subclass (Mige: office, smoke, waiting for Beat)
        } else if (g.place === 'fire' && this.spot) { // watching the fire: stand, face it, comment
          this.moving = false; this.heading = this.spot.face;
          this.chatCd -= dt;
          if (this.chatCd <= 0) { this.chatCd = NB.rr(12, 30); const l = NB.pick(this.c.fireLines || ["Oh nei, d'Milchzentrale!", 'Hoffentli isch niemer dinne!', 'Lueg, de Rauch!', "D'Füürwehr vo Niederwil chunnt!", 'Scho wider…', 'Zum Glück sind d\'Gehrigs dusse.']); say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: 0.5 }); }
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
      if (g.duel) { this.moving = false; return; } // playing against you (js/games.js)
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
    // ---- a dog ran off (Manolo): she notices and panics, Joel (c.partner) tries to calm her down; then either
    //      they go and look for him or she (grudgingly) waits until he comes back by himself ----
    talk(lines, o) { const l = NB.pick(lines); say(this, l, o); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this }); }
    partnerNear() { return this.c.partner && E.list.find((v) => v.kind === 'villager' && v.c.id === this.c.partner && !v.away && !v.inside && !v.toCar && Math.hypot(v.x - this.x, v.z - this.z) < 30); }
    lostDog(d) {
      if (this.away || this.toCar || this.inside || this.worried) return;
      this.worried = d;
      if (NB.UI.onScreen(this) || NB.UI.onScreen(d)) NB.UI.discover('manolo');
      NB.Fest.news('manolo');
      this.talk((this.c.lostLines || ['%d?! Wo isch de %d?']).map((l) => l.replace(/%d/g, d.name)));
      this.pause = 2.5; this.hop = 0.35; this.heading = Math.atan2(d.x - this.x, d.z - this.z);
      const j = this.partnerNear();
      if (j) {
        j.later = { t: 2.6, line: NB.pick(j.c.calmLines || ['Er chunnt scho zrugg.']).replace(/%d/g, d.name) };
        if (!j.seated && !j.fishing) { j.pause = 4; j.heading = Math.atan2(this.x - j.x, this.z - j.z); }
        this.decideT = 6; this.decision = Math.random() < 0.5; // Joel's calming works only sometimes
      } else { this.decideT = 2.5; this.decision = true; }
    }
    decideSearch() {
      const d = this.worried;
      if (!d || d.state !== 'roam') return;
      const j = this.partnerNear();
      if (this.decision) {
        this.talk((this.c.searchLines || ['Ich gang ihn go sueche!']).map((l) => l.replace(/%d/g, d.name)));
        this.searching = d; this.goalKey = null;
        if (j) { j.searching = d; j.goalKey = null; j.later = { t: 1.8, line: NB.pick(j.c.searchAlongLines || ['Okay, ich chume mit.']).replace(/%d/g, d.name) }; }
      } else {
        this.talk((this.c.stayLines || ['Okay… mir warte.']).map((l) => l.replace(/%d/g, d.name)));
        if (j) j.later = { t: 2.2, line: NB.pick(j.c.stayReplies || ['Gsehsch. Alles guet.']) };
      }
    }
    updateSearch(dt) {
      const d = this.searching;
      if (!d || d.state !== 'roam' || d.away) { this.searching = null; this.goalKey = null; return; }
      const dist = Math.hypot(d.x - this.x, d.z - this.z);
      if (dist < 5) { // found him
        const o = d.owner, j = o.partnerNear && o.partnerNear();
        if (this === o) this.talk((this.c.foundLines || ['Do bisch jo!']).map((l) => l.replace(/%d/g, d.name)));
        else { this.talk((this.c.foundOtherLines || ['Ich ha ihn!']).map((l) => l.replace(/%d/g, d.name).replace(/%o/g, o.name))); }
        d.comeBack(); d.foundBy = this; d.hopT = 0.3;
        if (NB.UI.onScreen(this)) NB.UI.discover('manoloFound');
        for (const v of [o, j]) if (v) { v.searching = null; v.goalKey = null; }
        this.searching = null; this.goalKey = null;
        return;
      }
      this.searchT -= dt;
      if (this.searchT <= 0 || !this.path) { // head roughly where he is (they don't know exactly), calling his name
        this.searchT = NB.rr(4, 7);
        const e = dist < 30 ? 0 : Math.min(12, dist * 0.2); // close enough: they've spotted him
        if (!this.goTo(d.x + NB.rr(-e, e), d.z + NB.rr(-e, e))) this.goTo(d.x, d.z);
        if (Math.random() < 0.6) this.talk((this.c.callLines || ['%d!']).map((l) => l.replace(/%d/g, d.name)), { quiet: true });
      }
      this.stepPath(dt);
    }
    dogBack(d) {
      const found = d.foundBy; d.foundBy = null;
      if (this.worried !== d) return;
      this.worried = null; this.decideT = 0;
      if (this.inside || this.away) return;
      this.talk((this.c[found ? 'foundBackLines' : 'backLines'] || ['Do bisch jo wider!']).map((l) => l.replace(/%d/g, d.name)));
      this.hop = 0.35; this.pause = 2;
      const j = this.partnerNear();
      if (j && !found) j.later = { t: 2.4, line: NB.pick(j.c.backReplies || ['Gsehsch?']).replace(/%d/g, d.name) };
    }
    // ---- the Gassirunde (routine entry with do: 'walk'): follow map.gassi waypoint by waypoint, round and round;
    //      at a `stop` the dog sniffs around for a while. Greets everyone she passes (she knows them all) ----
    walkTalk(dt) {
      this.chatCd -= dt;
      if (this.chatCd <= 0) {
        this.chatCd = NB.rr(4, 8);
        this.greeted = this.greeted || new Map();
        const now = performance.now() / 1000;
        const o = E.list.find((v) => v !== this && v.kind === 'villager' && !v.inside && !v.away && Math.hypot(v.x - this.x, v.z - this.z) < 6 && now - (this.greeted.get(v) || -999) > 240);
        if (o) {
          this.greeted.set(o, now); this.chatCd = NB.rr(20, 40);
          const l = NB.pick(this.c.greetLines || ['Hoi %o!']).replace('%o', o.name);
          say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: 0.6 });
          if (!o.later) o.later = { t: NB.rr(1.2, 2.2), line: NB.pick(o.c.karinLines || ['Hoi ' + this.name + '!', 'Sali ' + this.name + ', sali Kuba!', 'Grüezi ' + this.name + '!']) };
        } else if (Math.random() < 0.12) this.chat();
      }
    }
    updateWalk(dt) {
      const W = map.gassi, w = W[this.walkIdx];
      this.moving = false;
      if (this.sniffT > 0) { this.sniffT -= dt; return; }
      if (w.stop && !this.stopped) {
        this.stopped = true; this.sniffT = NB.rr(7, 13); this.heading = I.towardCamera;
        if (Math.random() < 0.5) { const l = NB.pick(this.c.sniffLines || ['Schnüffle, Kuba, schnüffle.']); say(this, l, { quiet: true }); }
        return;
      }
      this.stopped = false;
      this.walkIdx = (this.walkIdx + 1) % W.length;
      const n = W[this.walkIdx];
      if (!this.goTo(n.x, n.z)) this.path = [{ x: n.x, z: n.z }];
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
      const canWater = b && NB.season !== 'winter' && !['rain', 'storm', 'snow'].includes(NB.Env.weather) && NB.Env.darkness < 0.75;
      if (canWater && this.waterT < 4.5) {
        this.dropT = (this.dropT || 0) - dt;
        if (this.dropT <= 0) { this.dropT = 0.1; NB.UI.fx(b.x + NB.rr(-0.35, 0.35), 1.0, b.z + NB.rr(-0.35, 0.35), 'water', { vy: -1.6, life: 0.55 }); }
      }
      if (this.gardenT <= 0) { this.gardenT = null; const t = claimSpot(this, map.spots && map.spots[this.goalKey] ? this.goalKey : 'hortensien'); if (t) this.goTo(t.x, t.z); }
    }
    // ---- football on the lawn at Ifangweg 17 (routine entry with do: 'football'): whoever is nearest runs to the ball
    //      and shoots at the goal or passes; when the dad plays too he stands in the goal ----
    updateFootball(dt) {
      const G = map.tanjaGarden, B = G.ball;
      const players = E.list.filter((v) => v.kind === 'villager' && v.act === 'football' && v.goalKey === this.goalKey && !v.inside && !v.away && !v.path);
      const keeper = players.length > 1 ? players.find((v) => v.c.id === 'andre2') : null;
      const run = (x, z, sp) => { const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz); this.moving = d > 0.15; if (this.moving) { const k = Math.min(d, sp * dt); this.x += (dx / d) * k; this.z += (dz / d) * k; this.heading = Math.atan2(dx, dz); this.anim += dt * sp / 1.4; } return d; };
      this.moving = false;
      if (this === keeper) { // in the goal, moving across with the ball
        const [, bv] = G.local(B.x, B.z), [, gv] = G.local(G.goal.x, G.goal.z), p = G.at(G.U0 + 1.9, NB.clamp(bv, gv - G.goalHalf, gv + G.goalHalf));
        if (run(p.x, p.z, 2) < 0.15) this.heading = Math.atan2(B.x - this.x, B.z - this.z);
        return;
      }
      const field = players.filter((v) => v !== keeper), chaser = field.sort((a, b) => Math.hypot(a.x - B.x, a.z - B.z) - Math.hypot(b.x - B.x, b.z - B.z))[0];
      if (this !== chaser || B.speed() > 2.5 || B.goalT > 0) { this.heading = Math.atan2(B.x - this.x, B.z - this.z); return; }
      if (run(B.x, B.z, 2.8) > 0.5) return;
      // kick: at the goal (mostly), else a pass or into the open lawn
      const L = G.lawn, mates = field.filter((v) => v !== this), [, gv] = G.local(G.goal.x, G.goal.z);
      let t;
      if (Math.random() < (keeper ? 0.7 : 0.55)) { t = G.at(G.U0 + 0.6, gv + NB.rr(-G.goalHalf - 0.7, G.goalHalf + 0.7)); B.shot = this; }
      else if (mates.length && Math.random() < 0.6) { const m = NB.pick(mates); t = { x: m.x, z: m.z }; B.shot = null; }
      else { const sp = NB.pick(map.spots.fuessball); t = { x: sp.x, z: sp.z }; B.shot = null; } // into the open lawn
      const dx = t.x - B.x, dz = t.z - B.z, d = Math.hypot(dx, dz) || 1, v = NB.clamp(d * 1.1, 4, 9);
      B.vx = (dx / d) * v; B.vz = (dz / d) * v; B.vy = Math.random() < 0.3 ? 3 : 0.8;
      if (NB.UI.onScreen(this)) NB.Audio.play('pop', { pos: this, rate: 0.55, vol: 0.6 });
      if (this.c.footballLines && Math.random() < 0.2 && B.shot !== this) { const l = NB.pick(this.c.footballLines.slice(1)); say(this, l, { quiet: true }); }
    }
    // ---- tag on Iris's lawn (Iris and Nuria): round and round, one chasing the other; who's "it" swaps now and then ----
    updatePlay(dt) {
      const G = map.irisGarden, P = (map.playTag = map.playTag || { a: 0, dir: 1, swapT: 8, chaser: 'iris' });
      const mates = E.list.filter((v) => v.kind === 'villager' && v.act === 'play' && v.goalKey === this.goalKey && !v.inside && !v.path);
      this.moving = false;
      if (mates.length < 2) { if (this.spot) this.heading = this.spot.face; return; } // waiting for the other one
      if (this === mates[0]) { // one of them moves the game on
        P.a += dt * 1.5 * P.dir;
        if ((P.swapT -= dt) <= 0) {
          P.swapT = NB.rr(6, 11); P.dir = -P.dir; P.chaser = P.chaser === 'iris' ? 'nuria' : 'iris';
          const it = mates.find((v) => v.c.id === P.chaser); if (it && it.c.tagLines) say(it, NB.pick(it.c.tagLines), { quiet: true });
        }
      }
      const behind = this.c.id === P.chaser ? -0.9 * P.dir : 0, a = P.a + behind, r = 2.2;
      const x = G.play.x + Math.cos(a) * r, z = G.play.z + Math.sin(a) * r * 0.8, dx = x - this.x, dz = z - this.z;
      if (Math.hypot(dx, dz) > 0.01) { this.heading = Math.atan2(dx, dz); this.moving = true; this.anim += dt * 1.6; }
      this.x = x; this.z = z;
      if (Math.random() < dt * 0.15) this.hop = 0.4;
    }
    // ---- the garden railway at Ifangweg 18 (routine entry with do: 'railway'): Ernst at the controls, the trains run
    //      while he's there; now and then he walks over to the other bed ----
    updateRailway(dt) {
      const R = map.railway;
      this.moving = false; if (this.spot) this.heading = this.spot.face;
      R.onAt = performance.now();
      this.railT = (this.railT == null ? NB.rr(50, 110) : this.railT) - dt;
      this.lineT = (this.lineT == null ? NB.rr(8, 20) : this.lineT) - dt;
      if (this.lineT <= 0) {
        this.lineT = NB.rr(25, 50);
        const watcher = E.list.find((v) => v.kind === 'villager' && v !== this && !v.inside && v.goalKey === 'gartebahn' && Math.hypot(v.x - this.x, v.z - this.z) < 12);
        const l = watcher && Math.random() < 0.5 ? NB.pick(['Wotsch emol Fahrdienschtleiter sii, ' + watcher.name + '?', 'Lueg, ' + watcher.name + ': jetzt chunnt de Schnällzug!', watcher.name + ', nöd uf d\'Gleis stah!']) : NB.pick(this.c.railLines || ['Tschu-tschu!']);
        say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: 0.5 });
      }
      if (this.railT <= 0) { this.railT = null; const t = claimSpot(this, 'iisebahn'); if (t) this.goTo(t.x, t.z); }
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
      if (NB.UI.onScreen(this)) NB.UI.discover('poacher');
      NB.Fest.news('poacher');
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
      if (this.c.gossip && Math.random() < 0.5 && NB.Fest.gossip()) line = NB.Fest.gossip(); // Karin passes on what happened
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
      let line = this.c.cycle ? lines[this.cycleIdx] : lines[Math.min(this.clicks, lines.length - 1)];
      if (this.c.shuffle && !night) { // a random line, plus the ones that fit today's weather
        const wl = this.c.weatherLines || {}, w = NB.Env.weather, cold = NB.season === 'winter' || w === 'snow';
        const pool = lines.concat(w === 'clear' && NB.Env.darkness < 0.5 && !cold ? wl.sun || [] : [], ['cloudy', 'rain', 'storm', 'fog'].includes(w) ? wl.rain || [] : [], cold || (NB.season === 'autumn' && w !== 'clear') ? wl.cold || [] : []).filter((l) => l !== this.lastLine);
        line = NB.pick(pool);
      }
      // memory: how often you've clicked them today; the Gehrigs are grumpy for a few days after their dairy burned
      const day = NB.clock.year + '-' + NB.clock.month + '-' + NB.clock.date, mem = NB.UI.store.get('clicks', {});
      if (mem.day !== day) { mem.day = day; mem.n = {}; }
      const n = (mem.n[this.c.id] || 0) + 1; mem.n[this.c.id] = n; NB.UI.store.set('clicks', mem);
      const fireAt = NB.UI.store.get('fireAt', 0);
      if ([5, 10, 20, 50, 100].includes(n)) line = NB.pick(n >= 20 ? [`${n} Mol hüt! Hesch nüt Bessers z'tue? 😄`, `Du hesch mi hüt scho ${n} Mol aagchlickt. Rekord!`] : [`Du hesch mi hüt scho ${n} Mol aagchlickt!`, `Scho wieder du? Das isch s'${n}. Mol hüt!`]);
      else if (this.c.afterFire && fireAt && Date.now() - fireAt < 3 * 86400000 && Math.random() < 0.5) line = NB.pick(this.c.afterFire);
      this.lastLine = line;
      say(this, line);
      for (const d of this.dogs || []) if (d.a.chimeIn) d.woofT = 1.1;
      NB.Audio.babble(line, this.c.voice, { pos: this });
      this.pause = 3.5; this.hop = 0.35;
      this.heading = I.towardCamera; // turn towards the viewer
    }
    get visible() { return !this.inside && !this.away; }
    hopY() { return this.hop > 0 ? Math.sin((this.hop / 0.35) * Math.PI) * 0.4 : 0; }
    top() { return { x: this.x, y: 2.4 + this.hopY(), z: this.z }; }
  }
  // the football on the lawn at Ifangweg 17: rolls, bounces, stays on the lawn; a goal when it crosses the goal line
  // between the posts (the keeper saves some); drawn by NB.UI
  class Ball {
    constructor() { const G = map.tanjaGarden, L = G.lawn, p = G.at((L.u0 + L.u1) / 2, (L.v0 + L.v1) / 2); Object.assign(this, { kind: 'ball', name: 'Ball', x: p.x, z: p.z, y: 0, vx: 0, vz: 0, vy: 0, goalT: 0, shot: null }); G.ball = this; }
    speed() { return Math.hypot(this.vx, this.vz); }
    update(dt) {
      const G = map.tanjaGarden, L = G.lawn;
      if (this.goalT > 0 && (this.goalT -= dt) <= 0) { const p = G.at((L.u0 + L.u1) / 2 + 2, (L.v0 + L.v1) / 2); this.x = p.x; this.z = p.z; this.vx = this.vz = this.vy = 0; }
      if (this.goalT > 0 && this.goalT < 1.5) return;
      this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt; this.vy -= 12 * dt;
      if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) > 1.5 ? -this.vy * 0.45 : 0; }
      const f = Math.max(0, 1 - (this.y > 0 ? 0.2 : 1.4) * dt); this.vx *= f; this.vz *= f;
      let [u, v] = G.local(this.x, this.z);
      const [, gv] = G.local(G.goal.x, G.goal.z), inMouth = Math.abs(v - gv) < G.goalHalf;
      if (u < G.U0 + 1.3 && inMouth && this.goalT <= 0 && this.speed() > 1) { // over the line
        const keeper = E.list.find((e) => e.kind === 'villager' && e.c.id === 'andre2' && e.act === 'football' && !e.inside && Math.hypot(e.x - this.x, e.z - this.z) < 1.6);
        if (keeper && Math.random() < 0.45) { // saved
          this.vx = -this.vx * 0.6; this.vz = -this.vz * 0.6; u = G.U0 + 1.4;
          say(keeper, NB.pick(['Ghalte! 🧤', 'Nöd mit mir!', 'Parade!']), { quiet: true });
        } else {
          this.goalT = 2.5; this.vx *= 0.2; this.vz *= 0.2;
          const who = this.shot || E.list.find((e) => e.kind === 'villager' && e.act === 'football' && !e.inside);
          if (who) { say(who, (who.c.footballLines || ['Goal!'])[0], { quiet: false }); who.hop = 0.6; if (who.c.parents) NB.Fest.cheer(who); }
          if (NB.UI.onScreen(this)) { NB.Audio.play('cheer', { pos: this, vol: 0.35 }); NB.UI.discover('goal'); for (let k = 0; k < 6; k++) NB.UI.fx(this.x, 1, this.z, 'confetti', { vy: 1.5, vx: NB.rr(-1, 1), g: 2, life: 1.2, col: NB.pick(['#d52b1e', '#ffffff']) }); }
          return;
        }
      }
      // bounce off the edges of the lawn (and the hedge behind the goal)
      if (u < L.u0 - 0.5 || u > L.u1 + 1 || v < L.v0 - 0.5 || v > L.v1 + 0.5) {
        const cu = NB.clamp(u, L.u0 - 0.5, L.u1 + 1), cv = NB.clamp(v, L.v0 - 0.5, L.v1 + 0.5), p = G.at(cu, cv);
        const nu = u !== cu, nv = v !== cv, c = G.at(1, 0), o = G.at(0, 0), ux = c.x - o.x, uz = c.z - o.z; // the u axis in world
        let lu = this.vx * ux + this.vz * uz, lv = this.vx * uz * -1 + this.vz * ux; // velocity in (u, v)
        if (nu) lu = -lu * 0.5; if (nv) lv = -lv * 0.5;
        const vxy = [lu * ux - lv * uz, lu * uz + lv * ux]; this.vx = vxy[0]; this.vz = vxy[1];
        this.x = p.x; this.z = p.z;
      }
    }
    get visible() { return false; }
  }

  // a train on one of the garden railway loops: the loco and its cars are each pickable entities, placed along the
  // loop; it runs while Ernst plays (map.railway.onAt) or for a while after a click on it
  class Train {
    constructor(loop, kinds, speed, name) {
      this.kind = 'trainctl'; this.loop = loop; this.speed = speed; this.v = 0; this.d = Math.random() * loop.len; this.clackT = 0; this.whistleT = NB.rr(8, 20);
      this.cars = kinds.map((k, i) => ({ kind: 'train', name, car: k, i, train: this, sprite: new PIXI.Sprite(), heading: 0, x: 0, z: 0, update() {}, get visible() { return true; },
        top() { return { x: this.x, y: 0.6, z: this.z }; }, click() { this.train.click(this); } }));
      this.place();
    }
    at(d) { // point + heading at distance d along the loop
      const L = this.loop, n = L.pts.length; d = ((d % L.len) + L.len) % L.len;
      let i = 1; while (i < L.cum.length - 1 && L.cum[i] < d) i++;
      const p = L.pts[i - 1], q = L.pts[i % n], t = (d - L.cum[i - 1]) / ((L.cum[i] - L.cum[i - 1]) || 1);
      return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, h: Math.atan2(q.x - p.x, q.z - p.z) };
    }
    place() { for (const c of this.cars) { const a = this.at(this.d - c.i * 0.64); c.x = a.x; c.z = a.z; c.heading = a.h; place(c, NB.Models.miniCar(c.car, a.h), a.x, 0, a.z, 2); } }
    click(car) {
      const R = map.railway; R.clickUntil = performance.now() + 25000;
      say(car, NB.pick(['Tschu-tschu! 🚂', 'Alles iistiege!', 'Nöchschte Halt: Nesselnbach-Ifang.', 'Pünktlich wie d\'SBB.']), { life: 2.5 });
      NB.Audio.play('whistle', { pos: car, rate: 1.4, vol: 0.5 }); NB.UI.discover('iisebahn');
    }
    update(dt) {
      const R = map.railway, now = performance.now(), on = now - (R.onAt || -1e9) < 1500 || now < (R.clickUntil || 0);
      this.v += NB.clamp((on ? this.speed : 0) - this.v, -0.5 * dt, 0.4 * dt);
      if (this.v < 0.005) return;
      this.d += this.v * dt; this.place();
      const loco = this.cars[0];
      if (!NB.UI.onScreen(loco, 40) || NB.view.zoom < 2) return;
      if ((this.clackT -= dt * (this.v / this.speed)) <= 0) { this.clackT = 0.45; NB.Audio.play('click', { pos: loco, rate: 0.55, vol: 0.18 }); setTimeout(() => NB.Audio.play('click', { pos: loco, rate: 0.5, vol: 0.14 }), 110); }
      if ((this.whistleT -= dt) <= 0) { this.whistleT = NB.rr(14, 30); NB.Audio.play('whistle', { pos: loco, rate: 1.4, vol: 0.35 }); if (on && now - (R.onAt || -1e9) < 1500) NB.UI.discover('iisebahn'); }
    }
  }

  Object.assign(NB.Ent, { Ball, Train, Villager });
})(window.NB);
