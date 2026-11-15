// Beat, the postman from the Post in Niederwil: rides through the village on his grey e-scooter in no real order,
// forgets houses and turns back, gets off at each house and walks to the door. Clumsy: delivers to the wrong
// house now and then, trips over his own feet, loses letters from his bag, wobbles when Kuba barks at him.
// Click him: a line and a letter falls out; the 5th click in a row (once ever) he hands you a parcel.
(function (NB) {
  const { E, I, map, add, place, say, Villager } = NB.Ent;
  const RIDE = 5, WALK = 1.9, RUN = 2.8;
  const LINES = {
    gossip: ['Uhh, de Yves esch in Malaysia gsii – er het en Karte vo dete verschickt!', 'Scho weder es Päckli för d Mige?', 'Wer bstellt immer Kacke uf Temu?'],
    oops: ['Mach ändlich mal die Adressänderig.', 'Ups... das isch glaub di falsch Huusnummere gsi.', 'Ich bi nöd z\'spät – d\'Poscht isch eifach früeh!', 'Wo isch jetzt dä Brief härecho? Er isch doch grad no do gsi...'],
    cold: ['Himmelherrgott, es esch so chalt!'],
  };
  const PARCEL = 'Ahh, do esch no dis Päckli. Bstell ned emmer so scheiss uf Temu.';
  const TRIP = ['Hoppla!', 'Uuups! 😵', 'Wäääh – nüt passiert!', 'Wer het die Stäge do anegstellt?!'];
  const FORGOT = ['Ah nei! %a vergässe!', 'Momänt… %a! Zrugg!', 'Mist, de Brief für %a isch no im Sack!'];
  const READ = ['*liest heimlich d\'Charte* … aha! 🙈', '*lueget d\'Charte aa* Oh lala… 🙈', 'Schöni Grüess us de Ferie… 🙈'];
  const cold = () => NB.season === 'winter' || NB.Env.weather === 'snow' || [11, 12, 1, 2, 3].includes(NB.clock.month);
  // rides on streets and sidewalks, cuts across gardens only near the houses
  let rideCost = null;
  const getRideCost = () => rideCost || (rideCost = map.walkCost.map((w) => (w === 1 ? 1 : w <= 1.6 ? 1.8 : w * 4)));
  const walkable = (x, z) => { const [cx, cz] = map.toCell(x, z); return map.inB(cx, cz) && map.walkCost[cz * map.w + cx] > 0; };
  const label = (b) => b.addr || b.name;
  const entry = () => map.route.find((p) => walkable(p.x, p.z)) || map.route[0]; // where the road from Niederwil comes in

  // a letter fluttering out of the bag, lying on the ground until he picks it up
  class Letter {
    constructor(x, z) {
      Object.assign(this, { kind: 'letter', name: 'Brief vom Beat', x, z, y: 1.3, vx: NB.rr(-1.2, 1.2), vz: NB.rr(-1.2, 1.2), t: 0, sprite: new PIXI.Sprite() });
      NB.Audio.play('rustle', { pos: this });
    }
    update(dt) {
      if (this.y > 0) {
        this.t += dt; this.y = Math.max(0, this.y - 0.75 * dt);
        const nx = this.x + (this.vx + Math.sin(this.t * 5) * 0.8) * dt, nz = this.z + this.vz * dt;
        if (walkable(nx, nz)) { this.x = nx; this.z = nz; }
        this.vx *= 1 - dt * 0.6; this.vz *= 1 - dt * 0.6;
      }
      place(this, NB.Models.letter(this.y > 0 ? 1 + (Math.floor(this.t * 5) % 2) : 0), this.x, this.y, this.z, 0.3);
    }
    click() { say({ x: this.x, y: 0.6, z: this.z }, NB.pick(['En Brief! Für wer isch dä ächt? 💌', 'Beat! Du hesch öppis verlore!', 'Pssst – nöd ufmache!']), { life: 2.2 }); NB.Audio.play('rustle', { pos: this }); }
    get visible() { return !this.done; }
    top() { return { x: this.x, y: 0.5, z: this.z }; }
  }

  // the parcel he hands you: held out towards you, then up and away into your backpack (also Mige's treats: rec)
  class Parcel {
    constructor(by, rec) { Object.assign(this, { kind: 'parcel', name: 'Päckli', by, rec: rec || NB.Models.parcel(), t: 0, sprite: new PIXI.Sprite() }); }
    update(dt) {
      const b = this.by, k = (this.t += dt), up = Math.max(0, k - 1.8);
      const d = 0.55 + Math.min(1, k * 2) * 0.25, x = b.x + Math.sin(I.towardCamera) * d, z = b.z + Math.cos(I.towardCamera) * d;
      place(this, this.rec, x, 0.9 + up * up * 6, z, 1);
      this.sprite.alpha = Math.max(0, 1 - up * 1.2);
      if (k > 2.7) { this.done = true; NB.world.remove(this.sprite); }
    }
    get visible() { return false; }
  }

  class Postman extends Villager {
    constructor(c) {
      super(c);
      this.scoot = { sprite: new PIXI.Sprite() }; NB.world.add(this.scoot.sprite);
      this.state = null; this.mounted = false; this.streak = 0; this.roundDay = null; this.talkT = 0;
      this.wobbleT = 0; this.stumbleT = 0; this.scratchT = 0; this.kubaCd = 0; this.sx = 0; this.sz = 0; this.sh = 0;
    }
    // Monday - Saturday morning, weekdays also in the afternoon (the parcels); not on Sundays and holidays
    onDuty(m) {
      const C = NB.cal || {};
      if (NB.clock.weekday === 0 || C.christmas || C.neujahr || C.august1) return null;
      if (NB.inWindow(m, '09:10', '11:50')) return 'am';
      if (NB.clock.weekday !== 6 && NB.inWindow(m, '14:20', '16:10')) return 'pm';
      return null;
    }
    startRound(shift) {
      this.roundDay = NB.clock.day + shift;
      const houses = Object.values(map.buildings).filter((b) => b.kind === 'house' && b.entryPt);
      this.todo = houses.filter(() => Math.random() < (shift === 'pm' ? 0.35 : 0.65)); // not everyone gets post every day
      const mige = map.buildings.buurehuus; if (mige && !this.todo.includes(mige)) this.todo.push(mige); // Mige always has a parcel
      this.forgot = []; this.wrongs = 0;
      const p = entry(), R = map.route, q = R[R.indexOf(p) + 1] || R[1];
      this.away = false; this.x = p.x; this.z = p.z; this.mounted = true; this.heading = Math.atan2(q.x - p.x, q.z - p.z);
      this.dropT = NB.rr(40, 110); this.chatCd = NB.rr(20, 40);
      this.next();
    }
    // the zig-zag: mostly one of the nearest houses, but often not the nearest (that one he "forgets" for later)
    next() {
      this.house = null; this.forgetT = null; this.state = 'ride'; this.mounted = true;
      if (!this.onDuty(NB.clock.minutes()) || (!this.todo.length && !this.forgot.length && !this.priority)) { // round over: off to Niederwil
        this.leaving = true; this.rideTo(entry()); return;
      }
      let b;
      if (this.priority) { b = this.priority; this.priority = null; }
      else if (!this.todo.length) b = this.forgot.shift();
      else {
        const near = this.todo.slice().sort((p, q) => Math.hypot(p.cx - this.x, p.cz - this.z) - Math.hypot(q.cx - this.x, q.cz - this.z));
        if (Math.random() < 0.12) b = NB.pick(this.todo); // wherever
        else if (near.length > 2 && Math.random() < 0.3) { b = NB.pick(near.slice(1, 5)); this.forgot.push(near[0]); this.todo.splice(this.todo.indexOf(near[0]), 1); if (Math.random() < 0.6) this.forgetT = NB.rr(3, 7); }
        else b = near[0];
        this.todo.splice(this.todo.indexOf(b), 1);
      }
      this.house = b; this.rideToHouse(b);
    }
    // ride towards the door and park where the street or sidewalk ends (or just short of the door)
    rideToHouse(b) {
      const e = b.entryPt, mige = E.list.find((v) => v.c && v.c.id === 'mige');
      if (mige && mige.beatComing && b === mige.home) mige.beatComing(this); // she drops everything and runs to the door
      this.rideTo(e);
      const P = this.path; if (!P || P.length < 2) return;
      let k = P.length - 1;
      while (k > 0 && (() => { const [cx, cz] = map.toCell(P[k].x, P[k].z); return map.walkCost[cz * map.w + cx] > 1.6; })()) k--;
      if (Math.hypot(P[k].x - e.x, P[k].z - e.z) > 9) k = Math.max(0, P.length - 4);
      this.path = P.slice(0, k + 1);
    }
    rideTo(p) {
      this.cost = getRideCost(); this.speed = RIDE; this.mounted = true; this.state = 'ride';
      if (!this.goTo(p.x, p.z)) this.path = [{ x: p.x, z: p.z }];
    }
    walkTo(p, speed) { this.cost = map.walkCost; this.speed = speed; if (!this.goTo(p.x, p.z)) this.path = [{ x: p.x, z: p.z }]; }
    getOff() { this.mounted = false; this.sx = this.x; this.sz = this.z; this.sh = this.heading; NB.Audio.play('click', { pos: this, rate: 0.6, vol: 0.4 }); }
    line(lines, o) { const l = NB.pick(lines); say(this, l, o); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: o && o.quiet ? 0.55 : 1 }); return l; }
    dropLetter() { const l = add(new Letter(this.x + NB.rr(-0.3, 0.3), this.z + NB.rr(-0.3, 0.3))); return l; }
    chase(letter) { this.letter = letter; this.chaseT = 0; this.chaseLife = 20; if (this.mounted) this.getOff(); this.state = 'chase'; this.walkTo(letter, RUN); }
    evade(v) { if (!this.mounted) super.evade(v); }
    update(dt) {
      if (this.later && (this.later.t -= dt) <= 0) { const l = this.later.line; this.later = null; if (!this.away) say(this, l, { quiet: true }); }
      const m = NB.clock.minutes(), shift = this.onDuty(m);
      if (this.away) {
        if (shift && this.roundDay !== NB.clock.day + shift) this.startRound(shift);
        return this.pose(dt);
      }
      if (this.hop > 0) this.hop = Math.max(0, this.hop - dt);
      this.wobbleT = Math.max(0, this.wobbleT - dt); this.stumbleT = Math.max(0, this.stumbleT - dt); this.scratchT = Math.max(0, this.scratchT - dt); this.kubaCd -= dt;
      if (this.talkT > 0) { // stopped for a chat (clicked)
        this.talkT -= dt; this.moving = false;
        if (this.talkT <= 0 && this.pendingLetter) { const l = this.pendingLetter; this.pendingLetter = null; this.chase(l); }
        return this.pose(dt);
      }
      if (this.evading) { this.updateEvade(dt); return this.pose(dt); }
      const S = this.state;
      if (S === 'ride') this.updateRide(dt);
      else if (S === 'walk') {
        if (this.tripT != null && (this.tripT -= dt) <= 0) { // over his own feet
          this.tripT = null; this.stumbleT = 1.4; this.state = 'trip';
          this.line(TRIP); NB.Audio.play('thud', { pos: this, vol: 0.6 });
          NB.UI.fx(this.x, 0.2, this.z, 'dust', { vy: 0.4, life: 0.8 });
        } else if (this.stepPath(dt)) this.atDoor();
      } else if (S === 'trip') { this.moving = false; if (this.stumbleT <= 0) this.state = 'walk'; }
      else if (S === 'deliver' || S === 'fetch' || S === 'oops') this.updateDoor(dt);
      else if (S === 'back') { if (this.stepPath(dt)) { this.x = this.sx; this.z = this.sz; this.heading = this.sh; this.next(); } }
      else if (S === 'chase') this.updateChase(dt);
      this.pose(dt);
    }
    updateRide(dt) {
      const base = this.wobbleT > 0 ? RIDE * 0.35 : RIDE;
      this.speed = base;
      // forgot the house he skipped: turn round
      if (this.forgetT != null && (this.forgetT -= dt) <= 0 && this.forgot.length && this.house) {
        this.forgetT = null; this.todo.push(this.house);
        this.house = this.forgot.pop(); this.line(FORGOT.map((l) => l.replace('%a', label(this.house))));
        this.rideToHouse(this.house); this.hop = 0.25;
      }
      // a letter flies out of the bag
      if ((this.dropT -= dt) <= 0) {
        this.dropT = NB.rr(60, 140);
        const l = this.dropLetter();
        setTimeout(() => { if (!this.away && this.state === 'ride' && !l.done) { this.line(['Halt! Min Brief! ✉️', 'Neeei, nöd scho wider!', 'Momänt, momänt!']); this.chase(l); } }, 900);
      }
      // Kuba barks at him: wobble, nearly falls off, carries on
      const kuba = this.kubaCd <= 0 && E.list.find((e) => e.kind === 'dog' && e.name === 'Kuba' && e.visible && e.sprite.visible && Math.hypot(e.x - this.x, e.z - this.z) < 7);
      if (kuba) {
        this.kubaCd = 120; this.wobbleT = 2;
        kuba.bark('Wuff! Wuff! Wuff!'); kuba.woofT = 0.7;
        this.line(['Uiiii! Ruhig, Kuba, ruhig! 😰', 'Hoppla – de Kuba wider!', 'Wääh! Ich ha doch kei Wurscht!']);
        NB.Audio.play('beep', { pos: this, vol: 0.6 });
        if (kuba.owner && !kuba.owner.later) kuba.owner.later = { t: 1.6, line: NB.pick(['Kuba! Lass de Beat in Rueh!', 'Sorry Beat! Er meint\'s nöd bös.', 'Kuba, pfui!']) };
      }
      if (!this.stepPath(dt)) return;
      if (this.leaving) { this.leaving = false; this.away = true; this.state = null; this.mounted = false; return; }
      // at the house: off the scooter, to the door (sometimes over his own feet)
      const b = this.house; if (!b) return this.next();
      this.getOff(); this.state = 'walk'; this.tripT = Math.random() < 0.2 ? NB.rr(0.4, 1.4) : null;
      this.walkTo(b.entryPt, WALK);
    }
    atDoor() {
      const b = this.house;
      this.state = 'deliver'; this.doorT = 1.8; this.moving = false; this.heading = Math.atan2(-b.doorN[0], -b.doorN[1]);
      NB.Audio.play('click', { pos: this, rate: 0.8, vol: 0.5 }); // the letterbox flap
      if (Math.random() < 0.22 && NB.UI.onScreen(this)) this.line(READ, { quiet: true });
      this.wrong = this.wrongs < 3 && Math.random() < 0.15;
      const mige = E.list.find((v) => v.c && v.c.id === 'mige' && v.home === b);
      if (mige) {
        this.wrong = false;
        if (mige.gotParcel && !mige.inside && !mige.away && Math.hypot(mige.x - this.x, mige.z - this.z) < 5) { say(this, 'Scho weder es Päckli för d Mige?'); mige.gotParcel(this); }
      }
    }
    updateDoor(dt) {
      this.moving = false;
      if ((this.doorT -= dt) > 0) return;
      const b = this.house;
      if (this.state === 'deliver' && this.wrong) { // ...the wrong house
        this.wrongs++; this.state = 'oops'; this.doorT = 2.6; this.scratchT = 2.6; this.heading = I.towardCamera;
        this.line(['Ups... das isch glaub di falsch Huusnummere gsi.', 'Hmm… ' + label(b) + '? Nei, das stimmt nöd. 🤔']);
        return;
      }
      if (this.state === 'oops') { this.state = 'fetch'; this.doorT = 1.6; this.heading = Math.atan2(-b.doorN[0], -b.doorN[1]); say(this, '*holt de Brief zrugg*', { quiet: true }); NB.Audio.play('click', { pos: this, rate: 0.8, vol: 0.5 }); return; }
      if (this.state === 'fetch') { // the right one is next door
        const n = Object.values(map.buildings).filter((q) => q.kind === 'house' && q !== b && q.entryPt).sort((p, q) => Math.hypot(p.cx - b.cx, p.cz - b.cz) - Math.hypot(q.cx - b.cx, q.cz - b.cz))[0];
        if (n) { this.todo = this.todo.filter((q) => q !== n); this.forgot = this.forgot.filter((q) => q !== n); this.priority = n; }
      }
      this.state = 'back'; this.walkTo({ x: this.sx, z: this.sz }, WALK);
    }
    updateChase(dt) {
      const L = this.letter;
      this.chaseLife -= dt;
      if (!L || L.done || this.chaseLife <= 0) { if (L && !L.done) { L.done = true; NB.world.remove(L.sprite); } this.state = 'back'; this.walkTo({ x: this.sx, z: this.sz }, WALK); return; }
      if ((this.chaseT -= dt) <= 0) { this.chaseT = 0.6; this.walkTo(L, RUN); }
      const arrived = this.stepPath(dt);
      if (Math.hypot(L.x - this.x, L.z - this.z) < 0.8 && L.y <= 0.05 || (arrived && L.y <= 0.05 && Math.hypot(L.x - this.x, L.z - this.z) < 2.5)) {
        L.done = true; NB.world.remove(L.sprite); NB.Audio.play('rustle', { pos: this });
        this.hop = 0.3; if (NB.UI.onScreen(this)) this.line(['Ha di! 😅', 'Puh. Nomol Glück gha.', 'Do bisch jo, du Schlingel.'], { quiet: true });
        this.state = 'back'; this.walkTo({ x: this.sx, z: this.sz }, WALK);
      }
    }
    click() {
      this.streak = NB.Ent.prevClicked === this ? this.streak + 1 : 1;
      this.talkT = 3.5; this.moving = false; this.hop = 0.35;
      if (!this.mounted) this.heading = I.towardCamera;
      if (this.streak >= 5 && !NB.UI.store.get('beatParcel', false)) { // the secret: a parcel for you
        NB.UI.store.set('beatParcel', true); this.streak = 0; this.talkT = 5.5;
        say(this, PARCEL, { life: 6 }); NB.Audio.babble(PARCEL, this.c.voice, { pos: this });
        add(new Parcel(this)); NB.Audio.play('rustle', { pos: this });
        setTimeout(() => { NB.UI.give({ id: 'paeckli', icon: '📦', name: 'Päckli vom Beat', about: 'Vo Temu. Was isch ächt drin? 🤫' }); NB.UI.discover('paeckli'); }, 2600);
        return;
      }
      const pool = LINES.gossip.concat(LINES.oops, cold() ? LINES.cold : []).filter((l) => l !== this.lastLine);
      const l = (this.lastLine = NB.pick(pool));
      say(this, l); NB.Audio.babble(l, this.c.voice, { pos: this });
      if (!this.pendingLetter && this.state !== 'chase') this.pendingLetter = this.dropLetter(); // a letter falls out of the bag
    }
    pose(dt) {
      const s = this.sprite, sc = this.scoot.sprite;
      s.visible = sc.visible = !this.away;
      if (this.away) return;
      if (this.moving) this.seated = false;
      this.shown = NB.Ent.angleLerp(this.shown, this.heading, Math.min(1, dt * 10));
      const f = I.facing(this.shown), view = f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left';
      const t = performance.now() / 1000, w = this.wobbleT > 0 ? Math.sin(t * 28) * 0.12 * Math.min(1, this.wobbleT) : 0;
      const hx = Math.cos(this.shown) * w, hz = -Math.sin(this.shown) * w; // sideways wobble
      if (this.mounted) {
        place(this.scoot, NB.Models.scooter(this.shown + w * 2), this.x + hx, 0, this.z + hz, 0);
        const back = Math.sin(this.shown) * -0.18, backZ = Math.cos(this.shown) * -0.18; // sits on the seat, behind the middle
        place(this, this.frames.sit[view], this.x + back + hx * 2, 0.3 + this.hopY() * 0.5, this.z + backZ + hz * 2, 0.5);
        return;
      }
      place(this.scoot, NB.Models.scooter(this.sh), this.sx, 0, this.sz, 0);
      if (this.stumbleT > 0) return place(this, this.frames.stumble[Math.floor(t * 9) % 2], this.x, Math.abs(Math.sin(t * 9)) * 0.15, this.z);
      if (this.scratchT > 0) return place(this, this.frames.scratch[Math.floor(t * 4) % 2], this.x, 0, this.z);
      if (this.talkT > 0 && view === 'down') return place(this, this.frames.wave[Math.floor(t / 0.22) % 2], this.x, this.hopY(), this.z);
      place(this, this.frames[view][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0], this.x, this.hopY(), this.z);
    }
    get visible() { return !this.away; }
    top() { return { x: this.x, y: (this.mounted ? 2.7 : 2.4) + this.hopY(), z: this.z }; }
  }
  Object.assign(NB.Ent, { Postman, Letter, Parcel });
})(window.NB);
