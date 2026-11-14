// Animals: cats, dogs (Mariana's Border Collies, Karin's Kuba), the deer of the Hirschfarm, the ducks on the Weiher.
(function (NB) {
  const { E, I, map, place, say, Mover } = NB.Ent;
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
        const dog = this.a.dogs && NB.Env.darkness < 0.6 ? E.list.find((o) => o.kind === 'dog' && !o.away && !o.rider && !o.a.leash && o.state === 'follow' && Math.hypot(o.x - this.x, o.z - this.z) < 7) : null;
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
      if (NB.UI.onScreen(this)) NB.UI.discover('ride');
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
      NB.UI.discover('zoomies');
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
      NB.UI.discover('purr');
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
      this.meetCd = NB.rr(5, 15); this.meetT = 0; this.woofT = 0; this.sniffAt = null; this.view = 'right';
      this.state = 'follow'; this.potter = false; this.playCd = NB.rr(20, 60); this.roamCd = NB.rr(240, 600);
      (owner.dogs || (owner.dogs = [])).push(this);
      this.sprite.visible = false;
    }
    bark(line) {
      say(this, line || 'Wuff!', { life: 1.6 });
      NB.Audio.play('bark', { pos: this, vol: 0.8, rate: this.a.voice || 1 });
      this.hopT = 0.3; this.idleT = 0;
    }
    // another dog in sight (Kuba, `barksAtDogs`): bark, both owners stop and chat for a few seconds, then carry on
    meet(other) {
      if (NB.UI.onScreen(this)) NB.UI.discover('kuba');
      const o = this.owner, p = other.owner;
      this.meetT = 8; this.lookAt = other; this.bark('Wuff! Wuff!'); this.woofT = 1.2;
      other.lookAt = this; other.meetT = 8; other.woofT = 0.8;
      if (o.inside || o.seated || o.fishing) return;
      const dur = NB.rr(6, 9);
      o.pause = dur; o.heading = Math.atan2(p.x - o.x, p.z - o.z); o.hop = 0;
      o.later = { t: 0.9, line: NB.pick(o.c.meetLines || ['Hoi %o!']).replace('%o', p.name).replace('%d', other.name) };
      if (!p.seated && !p.fishing && !p.toCar) { p.pause = dur; p.heading = Math.atan2(o.x - p.x, o.z - p.z); p.hop = 0; }
      p.later = { t: 3.2, line: NB.pick(p.c.meetReplies || ['Hoi ' + o.name + '! Hoi ' + this.name + '!', 'Jo, de ' + this.name + ' isch wider bi Stimm!']) };
    }
    clear(x0, z0, x1, z1) { // straight line free of buildings / water?
      const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d);
      for (let i = 1; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (map.inBuilding(x, z, 0.5) || map.pondDist(x, z) < 0.8) return false; }
      return true;
    }
    // where the dog hangs around: next to the owner, or at the door while she is indoors
    base() {
      const o = this.owner;
      if (!o.inside) return { x: o.x, z: o.z };
      const b = o.inBuilding || o.home;
      return { x: b.entryPt.x + b.doorN[0] * 2.5, z: b.entryPt.z + b.doorN[1] * 2.5 };
    }
    // a free spot r0..r1 m from (cx, cz) that the dog can run to in a straight line
    spotNear(cx, cz, r0, r1) {
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * 6.28, r = NB.rr(r0, r1), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!map.inBuilding(x, z, 0.6) && map.pondDist(x, z) > 1 && map.streetDist(x, z) > -0.5 && this.clear(this.x, this.z, x, z)) return { x, z };
      }
      return null;
    }
    // straight run (or a path round obstacles) towards (tx, tz); true when there
    runTo(tx, tz, speed, dt) {
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      this.speed = speed;
      if (d < 0.4) { this.moving = false; return true; }
      if (this.clear(this.x, this.z, tx, tz)) {
        this.path = null;
        const step = Math.min(d, speed * dt);
        this.x += (dx / d) * step; this.z += (dz / d) * step; this.heading = Math.atan2(dx, dz); this.moving = true; this.anim += dt;
      } else {
        this.replanT -= dt;
        if (!this.path && this.replanT <= 0) { this.replanT = 1; this.goTo(tx, tz); }
        if (!this.path || this.stepPath(dt)) { this.moving = false; return !this.path; }
      }
      return false;
    }
    // ---- the two Border Collies play: one runs zigzag around the owner, the other chases; tag = swap ----
    startPlay(p) {
      const t = NB.rr(14, 28);
      for (const [a, b] of [[this, p], [p, this]]) { a.state = 'play'; a.partner = b; a.playT = t; a.target = null; a.potter = false; a.sniffAt = null; a.path = null; }
      this.chaser = Math.random() < 0.5; p.chaser = !this.chaser; this.tagT = p.tagT = 1.5;
      this.bark('Wuff!'); p.woofT = 0.5;
    }
    endPlay() {
      for (const a of [this, this.partner]) if (a && a.state === 'play') { a.state = 'follow'; a.partner = null; a.target = null; a.playCd = NB.rr(60, 160); a.path = null; }
    }
    updatePlay(dt) {
      const o = this.owner, p = this.partner;
      this.playT -= dt;
      if (this.playT <= 0 || !p || p.state !== 'play' || p.away || o.toCar || o.searching || (o.moving && Math.hypot(o.x - this.x, o.z - this.z) > 12)) { this.endPlay(); return false; }
      const c = this.base(), fast = this.a.look && this.a.look.missing ? 4.4 : 5.2; // Morgan: three legs, nearly as quick
      this.tagT -= dt; this.idleT = 0;
      if (this.chaser) {
        this.runTo(p.x, p.z, fast, dt);
        if (Math.hypot(p.x - this.x, p.z - this.z) < 0.9 && this.tagT <= 0) { // tagged! now the other one chases
          this.chaser = false; p.chaser = true; this.tagT = p.tagT = 1.2; p.hopT = 0.3; p.target = null;
          this.target = this.spotNear(c.x, c.z, 3, 7);
          if (Math.random() < 0.5) this.bark(NB.pick(['Wuff!', 'Wuff wuff!'])); else p.woofT = 0.3;
        }
      } else {
        if (!this.target || Math.hypot(this.target.x - this.x, this.target.z - this.z) < 0.6 || Math.hypot(this.target.x - c.x, this.target.z - c.z) > 9) {
          this.target = this.spotNear(c.x, c.z, 2.5, 7) || { x: c.x, z: c.z };
          if (Math.random() < 0.25) this.hopT = 0.3;
        }
        if (this.runTo(this.target.x, this.target.z, fast * 0.95, dt) === false && !this.moving) this.target = null;
      }
      if (Math.random() < dt * 0.15) this.bark(NB.pick(['Wuff!', 'Wuff wuff!', '*hechel*']));
      return true;
    }
    // ---- Manolo (`roamer`) runs off and does his own thing for a few minutes; Mariana notices and worries ----
    startRoam() {
      const o = this.owner, from = { x: o.x, z: o.z };
      const cand = ['weiher', 'hirschgehege', 'dorfplatz', 'kuerbismarkt', 'milchzentrale', 'ifangweg', 'kapellenweg', 'feld', 'weide']
        .map((n) => map.randomIn(n, this.cost)).filter((t) => t && Math.hypot(t.x - from.x, t.z - from.z) > 35 && Math.hypot(t.x - from.x, t.z - from.z) < 110);
      const t = NB.pick(cand);
      if (!t || !this.goTo(t.x, t.z)) return false;
      if (this.state === 'play') this.endPlay();
      this.state = 'roam'; this.roamT = NB.rr(100, 220); this.wanderT = 0; this.noticeT = NB.rr(3, 6); this.worryT = NB.rr(25, 40);
      this.potter = false; this.sniffAt = null; this.roamRun = true;
      if (NB.UI.onScreen(this)) this.bark(NB.pick(['Wuff!', '*schnüffel* … !']));
      return true;
    }
    comeBack() { this.state = 'return'; this.path = null; this.replanT = 0; }
    updateRoam(dt) {
      const o = this.owner;
      if (this.noticeT > 0 && (this.noticeT -= dt) <= 0) o.lostDog(this);
      if (o.toCar && this.state === 'roam') this.comeBack(); // time to go home: he runs back
      if (this.state === 'roam') {
        this.roamT -= o.searching ? dt * 0.25 : dt; // while they look for him he mostly stays out until found
        if (this.roamT <= 0) { this.comeBack(); return; }
        if (o.worried === this && !o.searching && !o.inside && (this.worryT -= dt) <= 0) { // she keeps looking around for him
          this.worryT = NB.rr(25, 45);
          const l = NB.pick(o.c.worryLines || ['Wo isch er?']).replace(/%d/g, this.name); say(o, l, { quiet: true }); if (NB.UI.onScreen(o)) NB.Audio.babble(l, o.c.voice, { pos: o, vol: 0.5 });
        }
        if (this.path) { this.speed = this.roamRun === false ? 2.2 : 4.0; if (this.stepPath(dt)) { this.roamRun = false; this.moving = false; } this.idleT = 0; this.sniffing = false; return; }
        this.moving = false; this.wanderT -= dt; this.idleT += dt;
        if (this.wanderT <= 0) { // doing his own thing: trot about, sniff, lie in the grass
          this.wanderT = NB.rr(3, 9); this.sniffing = false;
          const r = Math.random();
          if (r < 0.55) { const t = map.randomIn([this.x - 10, this.z - 10, this.x + 10, this.z + 10], this.cost); if (t) { this.goTo(t.x, t.z); this.roamRun = false; } }
          else if (r < 0.85) { this.sniffing = true; this.idleT = 0; if (Math.random() < 0.3 && NB.UI.onScreen(this)) say(this, NB.pick(['*schnüffel*', '*schnüffel schnüffel*']), { quiet: true, life: 1.4 }); }
          else this.idleT = 15; // flop down
        }
        return;
      }
      // coming back: run to her (path replanned now and then, she may be walking)
      this.sniffing = false; this.idleT = 0;
      this.replanT -= dt;
      if (this.replanT <= 0) { this.replanT = 2; this.goTo(o.x, o.z); }
      this.speed = 4.4;
      const near = Math.hypot(o.x - this.x, o.z - this.z) < (o.inside ? 6 : 2.5);
      if (near || (!this.path && Math.hypot(o.x - this.x, o.z - this.z) < 6)) { this.state = 'follow'; this.path = null; this.roamCd = NB.rr(300, 720); o.dogBack(this); return; }
      if (this.path) this.stepPath(dt); else { this.x += (o.x - this.x) * Math.min(1, dt); this.z += (o.z - this.z) * Math.min(1, dt); }
    }
    update(dt) {
      const o = this.owner;
      if (this.hopT > 0) this.hopT -= dt;
      if (this.meetT > 0 && (this.meetT -= dt) <= 0) this.lookAt = null;
      if (o.away || (o.inside && this.a.indoor)) { if (!this.away) { this.away = true; this.sprite.visible = false; this.sniffAt = null; this.state = 'follow'; this.partner = null; this.path = null; o.worried = null; o.searching = null; } return; } // indoor dogs go in with her
      if (this.away) { this.away = false; this.x = o.x + NB.rr(-1, 1) + this.side; this.z = o.z + 1.2; this.path = null; }
      if (this.woofT > 0 && (this.woofT -= dt) <= 0) this.bark();
      if (this.a.barksAtDogs && (this.meetCd -= dt) <= 0) {
        this.meetCd = 1;
        const other = E.list.find((d) => d !== this && d.kind === 'dog' && !d.away && d.owner !== o && Math.hypot(d.x - this.x, d.z - this.z) < 8);
        if (other) { this.meetCd = NB.rr(80, 140); this.meet(other); }
      }
      if (this.state === 'roam' || this.state === 'return') { this.updateRoam(dt); return this.pose(dt); }
      if (this.state === 'play' && this.updatePlay(dt)) return this.pose(dt);
      // now and then: Manolo is off; the two start a game when she sits still for a while
      if (this.a.roamer && !o.inside && !o.toCar && (this.roamCd -= dt) <= 0) { this.roamCd = NB.rr(60, 120); if (this.startRoam()) return this.pose(dt); }
      if (this.a.plays && !o.moving && !o.toCar && this.idleT > 3 && (this.playCd -= dt) <= 0) {
        this.playCd = NB.rr(8, 20);
        const p = E.list.find((d) => d !== this && d.kind === 'dog' && d.owner === o && d.a.plays && d.state === 'follow' && !d.away);
        if (p && Math.random() < 0.5) { this.startPlay(p); return this.pose(dt); }
      }
      let tx, tz, slack = 1.3;
      if (o.moving) this.potter = false;
      if ((o.sniffT > 0 && !o.inside) || this.potter) { // nose to the ground somewhere near her (on the walk's stops, or pottering about)
        const c = this.base();
        if (!this.sniffAt) { const q = this.a.leash ? this.spotNear(c.x, c.z, 1.2, 2.2) : this.spotNear(c.x, c.z, 1.5, 5); if (q) this.sniffAt = { x: q.x, z: q.z, t: NB.rr(2.5, 5) }; else this.potter = false; }
        if (this.sniffAt && (this.sniffAt.t -= dt) <= 0) { this.sniffAt = null; if (Math.random() < 0.4) say(this, NB.pick(['*schnüffel*', '*schnüffel schnüffel*', '?!']), { quiet: true, life: 1.4 }); if (this.potter && Math.random() < 0.45) this.potter = false; }
      } else this.sniffAt = null;
      if (this.sniffAt) { tx = this.sniffAt.x; tz = this.sniffAt.z; slack = 0.3; }
      else if (o.inside) {
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
        if (!this.potter && this.idleT > 5 && !o.moving && Math.random() < dt / 9) this.potter = true; // go and have a sniff about
        if (this.lookAt) this.heading = Math.atan2(this.lookAt.x - this.x, this.lookAt.z - this.z);
        else if (this.sniffAt) this.heading = Math.atan2(this.sniffAt.x - o.x, this.sniffAt.z - o.z);
        else if (this.idleT > 1.5) this.heading = o.inside ? Math.atan2(-this.side, 1) : Math.atan2(o.x - this.x, o.z - this.z);
      }
      this.sniffing = !!this.sniffAt && !this.moving;
      this.barkT -= dt;
      if (this.barkT <= 0) { this.barkT = this.a.loud ? NB.rr(12, 40) : NB.rr(25, 90); if (NB.UI.onScreen(this) && !o.fishing) { say(this, 'Wuff!', { quiet: true, life: 1.5 }); NB.Audio.play('bark', { pos: this, vol: 0.6, rate: this.a.voice || 1 }); } }
      this.pose(dt);
    }
    pose(dt) {
      this.sprite.visible = !this.away;
      if (this.away) return;
      const F = this.frames, f = I.facing(this.heading);
      if (this.moving || this.lookAt || this.sniffAt) { if (f === 'e' || f === 'se' || f === 'ne') this.dir = 'right'; else if (f === 'w' || f === 'sw' || f === 'nw') this.dir = 'left'; }
      this.view = F.stand.down && f === 's' ? 'down' : F.stand.up && f === 'n' ? 'up' : this.dir; // four views (Kuba)
      const happy = F.wag && (this.idleT < 5 || this.lookAt || this.owner.pause > 0);
      const set = this.moving ? F.walk[Math.floor(this.anim * (this.speed > 3 ? 9 : 6)) % 2] : this.sniffing && F.sniff ? F.sniff : happy ? F.wag[Math.floor(performance.now() / 140) % 2] : this.idleT < 5 ? F.stand : this.idleT < 14 ? F.sit : F.lie;
      const hop = this.hopT > 0 ? Math.sin((this.hopT / 0.3) * Math.PI) * 0.35 : 0;
      this.hopY = hop;
      place(this, set[this.view] || set[this.dir], this.x, hop, this.z);
    }
    click() {
      say(this, NB.pick(this.a.clicks || ['Wuff!']));
      NB.Audio.play('bark', { pos: this, rate: this.a.voice || 1 });
      this.hopT = 0.3; this.idleT = 0;
      if (this.rider) this.rider.dismount();
      if (this.state === 'roam' && this.a.roamer) { say(this, NB.pick(['Wuff? … Oh. Mariana!', '*Ohre spitze* … Wuff!']), { life: 2 }); this.comeBack(); } // clicked: he remembers her
    }
    get visible() { return !this.away; }
    top() { return { x: this.x, y: 1.1, z: this.z }; }
  }

  // ---------------------------------------------------------------- deer in the paddock of the Hirschfarm
  class Deer extends Mover {
    constructor(a) {
      super(0, 0, map.deerCost, 1.1);
      this.a = a; this.kind = 'deer'; this.name = a.name; this.frames = NB.Models.deer(a.look || {}); this.sprite = new PIXI.Sprite();
      this.dir = Math.random() < 0.5 ? 'left' : 'right'; this.state = 'graze'; this.timer = NB.rr(2, 8); this.alarm = 0; this.hopT = 0;
      const s = map.randomIn([map.deer.B[0] - 40, map.deer.B[1] - 40, map.deer.B[0] + 40, map.deer.B[1] + 40], this.cost) || map.deer.rack;
      this.x = s.x; this.z = s.z; this.heading = Math.random() * 6.28;
    }
    // run to the spot farthest from `from` inside the paddock
    flee(from) {
      let best = null;
      for (let k = 0; k < 12; k++) { const t = map.randomIn([map.deer.B[0] - 40, map.deer.B[1] - 40, map.deer.B[0] + 40, map.deer.B[1] + 40], this.cost); if (t) { const d = Math.hypot(t.x - from.x, t.z - from.z); if (!best || d > best.d) best = { t, d }; } }
      if (best && this.goTo(best.t.x, best.t.z)) { this.state = 'walk'; this.alarm = NB.rr(3, 6); this.hopT = 0.35; this.anim += 1; }
    }
    update(dt) {
      if (this.hopT > 0) this.hopT -= dt;
      if (this.alarm > 0) this.alarm -= dt;
      this.speed = this.alarm > 0 ? 4.5 : 1.1;
      // dogs and people right at the fence make them nervous
      if (this.alarm <= 0 && Math.random() < dt * 0.5) {
        const near = E.list.find((o) => (o.kind === 'dog' && !o.away || o.kind === 'villager' && !o.inside && !o.away && o.moving) && Math.hypot(o.x - this.x, o.z - this.z) < (o.kind === 'dog' ? 9 : 4));
        if (near) this.flee(near);
      }
      if (this.state === 'walk') { if (this.stepPath(dt)) { this.state = this.alarm > 0 ? 'stand' : 'graze'; this.timer = NB.rr(3, 10); } return this.pose(dt); }
      this.timer -= dt; this.moving = false;
      if (this.timer <= 0) {
        const r = Math.random(), night = NB.Env.darkness > 0.5;
        if (night && r < 0.7) { this.state = 'lie'; this.timer = NB.rr(30, 90); }
        else if (r < 0.45) { const t = map.randomIn([this.x - 12, this.z - 12, this.x + 12, this.z + 12], this.cost); if (t && Math.hypot(t.x - this.x, t.z - this.z) > 2 && this.goTo(t.x, t.z)) this.state = 'walk'; else { this.state = 'graze'; this.timer = NB.rr(4, 12); } }
        else if (r < 0.8) { this.state = 'graze'; this.timer = NB.rr(5, 16); }
        else { this.state = 'stand'; this.timer = NB.rr(3, 8); }
      }
      this.pose(dt);
    }
    pose(dt) {
      if (this.moving) { const f = I.facing(this.heading); if (f === 'e' || f === 'se' || f === 'ne') this.dir = 'right'; else if (f === 'w' || f === 'sw' || f === 'nw') this.dir = 'left'; }
      const F = this.frames;
      const set = this.moving ? F.walk[Math.floor(this.anim * (this.alarm > 0 ? 10 : 5)) % 2] : this.state === 'graze' ? F.graze : this.state === 'lie' ? F.lie : F.stand;
      const hop = this.hopT > 0 ? Math.sin((this.hopT / 0.35) * Math.PI) * 0.5 : 0;
      place(this, set[this.dir], this.x, hop, this.z);
    }
    click() {
      NB.UI.discover('deer');
      say(this, NB.pick(['…!', '*schnuuft*', '…', 'Fiep!']), { life: 1.5 });
      NB.Audio.play('snort', { pos: this, rate: this.a.look && this.a.look.kind === 'stag' ? 0.8 : 1.1 });
      this.flee(this);
      for (const o of E.list) if (o !== this && o.kind === 'deer' && Math.hypot(o.x - this.x, o.z - this.z) < 10 && o.alarm <= 0) o.flee(this);
    }
    get visible() { return true; }
    top() { return { x: this.x, y: 1.5, z: this.z }; }
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
  Object.assign(NB.Ent, { Cat, Dog, Deer, Duck });
})(window.NB);
