// Mige (Niederwilerstrasse 3): home office in the morning (outside at the Sitzplatz with her laptop, inside with a
// blue glow at the window when it rains), free time from 12: bakes Gagichueche and Zimtschnägge (smoke from the
// chimney - black when she burns one), makes Essiggurken, brings them to Karin and Monika, smoke breaks with her
// Iqos in front of the house, waits for Beat. Chaos: forgets her Iqos and runs back, drops everything when Beat comes.
// Click: a line for the time of day; the 5th click in a row: a meeting excuse (morning) or a treat (afternoon, once).
(function (NB) {
  const { E, I, map, add, place, say, releaseSpot, Villager } = NB.Ent;
  const TREATS = {
    Gagichueche: { id: 'gagi', icon: '🍫', name: 'Es Stück Gagichueche vo de Mige', about: 'Schoggichueche, no warm. Mit Liebi bache. 💕' },
    Zimtschnägge: { id: 'zimt', icon: '🌀', name: 'Zimtschnägge vo de Mige', about: 'Früsch us em Ofe – mit vill Zimt.' },
    Essiggurken: { id: 'gurke', icon: '🥒', name: 'Es Glas Essiggurke vo de Mige', about: 'Sälber iigmacht. Knackig und suur.' },
  };
  const badWeather = () => ['rain', 'storm', 'snow'].includes(NB.Env.weather);
  const morning = () => NB.inWindow(NB.clock.minutes(), '08:00', '12:00');

  class Mige extends Villager {
    constructor(c) {
      super(c);
      this.basketFrames = NB.Models.person(Object.assign({}, c.look, { basket: '#6a3a22' }));
      this.lap = { sprite: new PIXI.Sprite() }; NB.world.add(this.lap.sprite); this.lap.sprite.visible = false;
      this.streak = 0; this.mode = null; this.iqosT = 0; this.puffT = 0;
      // named spots at the Sitzplatz: her seat (facing the viewer), standing places for smoke breaks and waiting
      const S = (map.spots && map.spots.sitzplatz) || [];
      const seat = S.filter((s) => s.sit && !s.bench).sort((a, b) => I.depth(a.x, a.z) - I.depth(b.x, b.z))[0];
      const stand = S.filter((s) => !s.sit);
      map.spots.homeoffice = seat ? [seat].concat(S.filter((s) => s.sit && !s.bench && s !== seat)) : [];
      map.spots.rauchpause = stand.length ? stand : S;
      map.spots.uf_beat = stand.slice().sort((a, b) => map.streetDist(a.x, a.z) - map.streetDist(b.x, b.z)).slice(0, 2);
      for (const k of ['homeoffice', 'rauchpause', 'uf_beat']) map.pois[k] = map.pois.sitzplatz;
    }
    // ---- the day: routine entries do: 'office' (08-12) and do: 'free' (12-17:30, a plan made once a day) ----
    currentGoal() {
      if (this.mode) return { place: 'mode:' + this.mode.kind };
      let g = super.currentGoal();
      if (g.act === 'office' && badWeather()) g = { place: 'home:' + this.home.id, act: 'office' };
      else if (g.act === 'free') g = this.freeGoal();
      return (this.g = g);
    }
    makePlan() {
      let t = 12 * 60; const end = 17 * 60 + 30, tasks = [], C = NB.cal || {};
      const push = (kind, dur, o) => { if (t < end) tasks.push(Object.assign({ kind, from: t, to: Math.min(end, t + dur) }, o)); t += dur; };
      const first = NB.pick(['Gagichueche', 'Zimtschnägge']), second = first === 'Gagichueche' ? 'Zimtschnägge' : 'Gagichueche';
      push('smoke', 10);
      push('bake', NB.ri(45, 70), { item: first, burnt: Math.random() < 0.15 });
      push('deliver', 40, { item: first });
      push('smoke', 8);
      push('pickles', NB.ri(30, 45), { item: 'Essiggurken' });
      if (NB.clock.weekday >= 1 && NB.clock.weekday <= 5 && !C.christmas && !C.neujahr && !C.august1) { t = Math.max(t, 14 * 60 + 25); push('wait', 20); } // the parcels come in the afternoon
      push('lounge', 20); push('smoke', 8);
      push('bake', NB.ri(40, 60), { item: second, burnt: Math.random() < 0.15 });
      push('lounge', 120);
      this.plan = { day: NB.clock.day, tasks };
    }
    freeGoal() {
      if (!this.plan || this.plan.day !== NB.clock.day) this.makePlan();
      const m = NB.clock.minutes(), task = this.plan.tasks.find((k) => m >= k.from && m < k.to) || { kind: 'lounge' };
      if (task !== this.task) { this.task = task; if (task.kind === 'bake' || task.kind === 'pickles') this.lastMade = task; }
      if (task.kind === 'wait' && this.parcelDay === NB.clock.day) return { place: 'sitzplatz' }; // Beat was already here
      switch (task.kind) {
        case 'smoke': return { place: 'rauchpause', act: 'smoke' };
        case 'wait': return { place: 'uf_beat', act: 'wait' };
        case 'bake': case 'pickles': return { place: 'home:' + this.home.id, act: 'bake' };
        case 'deliver': return task.done ? { place: 'sitzplatz' } : { place: 'home:' + this.home.id, act: 'bake' };
        default: return { place: 'sitzplatz' };
      }
    }
    // ---- acts outside (called by Villager.update when she has arrived at her spot) ----
    updateAct(dt, g) {
      const talk = (lines, p) => { if (Math.random() < p) { const l = NB.pick(lines); say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this, vol: 0.5 }); } };
      this.chatCd -= dt;
      if (g.act === 'office' && this.spot) {
        this.moving = false; this.seated = true; this.heading = this.spot.face;
        if (this.chatCd <= 0) { this.chatCd = NB.rr(30, 70); talk(this.c.morningLines, 0.8); }
        if (NB.UI.onScreen(this) && Math.random() < dt * 3) NB.Audio.play('click', { pos: this, vol: 0.12, rate: NB.rr(1.6, 2.2) }); // tippe-tippe
        return true;
      }
      if (g.act === 'smoke') {
        this.moving = false; this.seated = false; this.heading = I.towardCamera;
        if ((this.puffT -= dt) <= 0) { this.puffT = NB.rr(2.5, 4.5); NB.UI.fx(this.x + 0.25, 1.9, this.z + 0.25, 'steam', { vy: 0.5, life: 1.6 }); }
        if (this.chatCd <= 0) { this.chatCd = NB.rr(25, 50); talk(['Gits en Zigi?', 'Nur no eis Terea… 💨', 'Isch de Beat scho do gsi?'], 0.6); }
        return true;
      }
      if (g.act === 'wait') {
        this.moving = false; this.seated = false;
        const r = map.route[Math.floor(map.route.length / 2)]; this.heading = Math.atan2(r.x - this.x, r.z - this.z); // looks down the street
        if (this.chatCd <= 0) { this.chatCd = NB.rr(20, 40); talk(['Isch de Beat scho do gsi?', 'Wo blibt de Beat?!', 'Mis Päckli müesst hüt cho… 📦'], 0.8); }
        return true;
      }
      return false;
    }
    // ---- inside: the laptop glow, baking (smoke from the chimney, a smell now and then) ----
    insideUpdate(dt) {
      const g = this.g || {}, b = this.home;
      if (g.act === 'office') { b.laptop = true; return; }
      const T = this.task;
      if (g.act !== 'bake' || !T || (T.kind !== 'bake' && T.kind !== 'pickles')) return;
      const m = NB.clock.minutes(), frac = (m - T.from) / Math.max(1, T.to - T.from), burnt = T.burnt && frac > 0.6, ch = NB.chimneyOf ? NB.chimneyOf(b) : b.top;
      if (!NB.UI.onScreen(ch, 120)) return;
      if (T.kind === 'bake' && (this.smokeT = (this.smokeT || 0) - dt) <= 0) {
        this.smokeT = burnt ? 0.25 : 0.5;
        NB.UI.fx(ch.x + NB.rr(-0.15, 0.15), ch.y, ch.z + NB.rr(-0.15, 0.15), burnt ? 'smoke' : 'steam', { vy: NB.rr(0.9, 1.4), life: 2.4, size: 0.8 });
      }
      if (burnt && !T.said) { T.said = true; say({ x: b.entryPt.x, y: 2.4, z: b.entryPt.z }, NB.pick(['Neeeiii! De ' + T.item + '! 🔥', 'Shit, verbrännt! 🔥😩']), { life: 3 }); }
      if ((this.smellT = (this.smellT || NB.rr(4, 10)) - dt) <= 0) {
        this.smellT = NB.rr(18, 30);
        const l = burnt ? '♨️ … es schmöckt verbrännt 😬' : T.kind === 'pickles' ? '♨️ Essig-Duft… 🥒 *Gläser klirre*' : '♨️ Mmmh, ' + T.item + '-Duft 😋';
        say({ x: ch.x, y: ch.y + 0.6, z: ch.z }, l, { life: 2.6, quiet: true });
      }
    }
    // ---- modes: bringing treats to Karin and Monika, running to Beat, going back for the Iqos ----
    startMode(kind, o) {
      if (this.inside) { this.noIqos = true; this.leave(); }
      releaseSpot(this); this.seated = false; this.evading = null; this.fishing = null; this.goalKey = null; this.path = null;
      this.mode = Object.assign({ kind, t: 0 }, o);
    }
    endMode() { this.mode = null; this.goalKey = null; this.path = null; this.speed = this.baseSpeed; }
    startDeliver(task) {
      const who = ['karin', 'monika'].map((id) => E.list.find((v) => v.kind === 'villager' && v.c.id === id)).filter((v) => v && v.home);
      if (!who.length) { task.done = true; return; }
      const made = this.lastMade || task;
      this.startMode('deliver', { task, who, i: 0, item: made.item || task.item, burnt: made.burnt });
      this.talkLine(['So, ab zu de Karin und de Monika! 🧺', 'Es Körbli voll ' + this.mode.item + '. 🧺']);
      this.speed = this.baseSpeed; this.goTo(who[0].home.entryPt.x, who[0].home.entryPt.z);
    }
    beatComing(beat) {
      if (this.away || (this.mode && this.mode.kind === 'beat') || this.parcelDay === NB.clock.day) return;
      if (this.c.sleep && NB.inWindow(NB.clock.minutes(), this.c.sleep[0], this.c.sleep[1])) return;
      if (Math.hypot(this.x - this.home.entryPt.x, this.z - this.home.entryPt.z) > 150) return;
      if (this.mode && this.mode.kind === 'deliver') this.mode.task.done = true; // the basket can wait
      this.startMode('beat', { beat });
      this.talkLine(['DE BEAT!! 📦', 'Mis Päckli! Mis Päckli!', 'Beat! Warte, bin scho do!']); this.hop = 0.35;
      this.speed = this.baseSpeed * 2.3; const e = this.home.entryPt; this.goTo(e.x, e.z);
    }
    gotParcel() {
      this.parcelDay = NB.clock.day;
      setTimeout(() => { this.talkLine(['Mis Päckli!! 😍', 'Merci Beat! Du bisch de Bescht! 📦', 'Ändlich! 🥳']); this.hop = 0.4; for (let k = 0; k < 3; k++) NB.UI.fx(this.x + NB.rr(-0.4, 0.4), 2.2, this.z, 'heart', { vy: 0.8 }); }, 1500);
      if (this.mode && this.mode.kind === 'beat') this.mode.done = 5;
    }
    talkLine(lines) { const l = NB.pick(lines); say(this, l); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.c.voice, { pos: this }); return l; }
    leave() {
      super.leave();
      if (!this.noIqos && !this.mode && Math.random() < 0.12) this.iqosT = NB.rr(1.5, 3); // ...without her Iqos
      this.noIqos = false;
    }
    updateMode(dt) {
      const M = this.mode; M.t += dt;
      const run = (spd) => { this.speed = this.baseSpeed * spd; const d = this.stepPath(dt); if (this.moving && spd > 1.5) this.anim += dt * 0.8; return d; };
      if (M.kind === 'iqos') {
        if (M.inside != null) { if ((M.inside -= dt) <= 0) { this.noIqos = true; this.leave(); this.talkLine(['Ha\'s! 😅', 'So. Jetzt aber.']); this.endMode(); } return; }
        if (run(2.2)) { const b = this.home; this.inside = true; b.inside.add(this); this.inBuilding = b; this.target = b; M.inside = 3; }
        return;
      }
      if (M.kind === 'beat') {
        if (M.done != null) { this.moving = false; if ((M.done -= dt) <= 0) this.endMode(); return; }
        const arrived = run(2.3);
        if (arrived) { this.moving = false; const b = M.beat; if (b && !b.away) this.heading = Math.atan2(b.x - this.x, b.z - this.z); }
        if (M.t > 150 || !M.beat || M.beat.away) { this.talkLine(['Hmpf. Dänn halt nöd.', 'De Beat isch wider verbii gfahre?!']); this.endMode(); }
        return;
      }
      if (M.kind === 'deliver') {
        if (M.stopT != null) { this.moving = false; if ((M.stopT -= dt) > 0) return; M.stopT = null; M.i++; const n = M.who[M.i];
          if (n) this.goTo(n.home.entryPt.x, n.home.entryPt.z); else { M.home = true; const e = this.home.entryPt; this.goTo(e.x, e.z); } return; }
        if (!run(1) && M.t < 600) return;
        if (M.home || M.t >= 600) { M.task.done = true; this.endMode(); return; }
        const r = M.who[M.i], e = r.home.entryPt, what = M.item === 'Essiggurken' ? 'Essiggurke' : M.item;
        this.heading = Math.atan2(-r.home.doorN[0], -r.home.doorN[1]); M.stopT = 5;
        this.talkLine(['Hoi ' + r.name + '! Ich ha der ' + what + ' bracht! 🧺' + (M.burnt ? ' (Er isch echli schwarz worde… 😅)' : ''), r.name + ', lueg was ich der bache ha! 🧺']);
        const near = !r.away && !r.inside && Math.hypot(r.x - this.x, r.z - this.z) < 20;
        const thanks = NB.pick(['Mmmh, merci Mige! 😍', 'Oh, wie lieb vo dir! 💕', 'Du bisch e Schatz, Mige!']);
        if (near) { r.later = { t: 1.6, line: thanks }; r.hop = 0.35; r.pause = 3; r.heading = Math.atan2(this.x - r.x, this.z - r.z); setTimeout(() => NB.UI.fx(r.x, 2.3, r.z, 'heart', { vy: 0.8 }), 1600); }
        else if (r.inside && r.inBuilding === r.home) setTimeout(() => { say({ x: e.x, y: 2.2, z: e.z }, thanks, { life: 2.5 }); NB.UI.fx(e.x, 2, e.z, 'heart', { vy: 0.8 }); }, 1800);
        else setTimeout(() => this.talkLine(['Nöd dihei – ich stell\'s vor d\'Tür. 🧺']), 1800);
        this.hop = 0.3;
      }
    }
    update(dt) {
      this.home.laptop = false;
      if (this.away) return super.update(dt);
      if (this.mode) {
        if (this.hop > 0) this.hop = Math.max(0, this.hop - dt);
        if (this.later && (this.later.t -= dt) <= 0) { const l = this.later.line; this.later = null; say(this, l, { quiet: true }); }
        if (this.pause > 0) { this.pause -= dt; this.moving = false; } else this.updateMode(dt);
        return this.pose(dt);
      }
      // forgot her Iqos: stop, turn round, run back into the house
      if (this.iqosT > 0 && !this.inside && (this.iqosT -= dt) <= 0) {
        this.startMode('iqos'); this.talkLine(['Mis Iqos! 🙈', 'Shit, s\'Iqos!', 'Momänt – mis Iqos isch no dinne!']); this.hop = 0.3; this.pause = 0.8;
        const e = this.home.entryPt; this.goTo(e.x, e.z); return this.pose(dt);
      }
      const T = this.task, g = this.g;
      if (T && T.kind === 'deliver' && !T.done && g && g.act === 'bake' && NB.inWindow(NB.clock.minutes(), '12:00', '17:30')) { this.startDeliver(T); return this.pose(dt); }
      super.update(dt);
      if (this.inside && this.inBuilding === this.home) this.insideUpdate(dt);
    }
    pose(dt) {
      const F = this.frames;
      if (this.mode && this.mode.kind === 'deliver') this.frames = this.basketFrames;
      super.pose(dt);
      this.frames = F;
      const g = this.g || {}, out = !this.inside && !this.away && !this.mode, f = I.facing(this.shown), front = f === 's' || f === 'se' || f === 'sw';
      const office = out && g.act === 'office' && this.seated && this.spot && !this.moving;
      if (office) { // typing; the laptop on the table in front of her
        if (front && this.pause <= 0) place(this, F.type[Math.floor(performance.now() / 160) % 2], this.x, 0, this.z);
        const tb = map.farmProps && map.farmProps.table, sx = this.spot.x, sz = this.spot.z;
        if (tb) { const dx = sx - tb.x, dz = sz - tb.z, l = Math.hypot(dx, dz) || 1; place(this.lap, NB.Models.laptop(Math.atan2(dx, dz)), tb.x + (dx / l) * 0.35, 0.83, tb.z + (dz / l) * 0.35, 0.3); }
      } else if (out && g.act === 'smoke' && !this.moving && this.pause <= 0 && front && this.spot && Math.hypot(this.x - this.spot.x, this.z - this.spot.z) < 1) {
        place(this, F.smoke, this.x, 0, this.z);
      }
      this.lap.sprite.visible = !!office;
    }
    chat() { this.c.random = morning() ? this.c.morningLines : this.c.afternoonLines; super.chat(); }
    click() {
      this.streak = NB.Ent.prevClicked === this ? this.streak + 1 : 1;
      const am = morning(), store = NB.UI.store;
      let line;
      if (this.streak >= 5) {
        this.streak = 0;
        if (am) line = 'Ich ha jetzt würkli kei Ziit, ich bi im Meeting!';
        else if (!store.get('migeGift', false)) { // a treat for you: what she made today (or something random)
          store.set('migeGift', true);
          const item = NB.pick(Object.keys(TREATS)), T = TREATS[item];
          line = NB.pick(['Do, für di! ' + T.icon + ' Mit Liebi gmacht.', 'Nimm doch es bitzeli mit! ' + T.icon]);
          add(new NB.Ent.Parcel(this, NB.Models.treat(T.id))); NB.Audio.play('pop', { pos: this });
          setTimeout(() => { NB.UI.give({ id: 'mige-' + T.id, icon: T.icon, name: T.name, about: T.about }); NB.UI.discover('migeGift'); }, 2600);
        }
      }
      if (!line) line = NB.pick((am ? this.c.morningLines : this.c.afternoonLines).filter((l) => l !== this.lastLine));
      this.lastLine = line;
      say(this, line); NB.Audio.babble(line, this.c.voice, { pos: this });
      this.pause = 3.5; this.hop = 0.35;
      if (!this.seated) this.heading = I.towardCamera;
    }
    doingText() {
      const M = this.mode, g = this.g || {}, T = this.task;
      if (M) return { deliver: 'bringt ' + (M.who[M.i] ? 'de ' + M.who[M.i].name : 'öpperem') + ' ' + M.item + ' 🧺', beat: 'rennt zum Beat! 📦', iqos: 'het ihres Iqos vergässe 🙈' }[M.kind];
      if (g.act === 'office') return this.inside ? 'im Homeoffice (dinne) 💻' : this.seated ? 'im Homeoffice uf em Sitzplatz 💻' : null;
      if (g.act === 'smoke' && !this.moving) return 'macht e Rauchpause 💨';
      if (g.act === 'wait' && !this.moving) return 'wartet uf de Beat und ihri Päckli 📦';
      if (g.act === 'bake' && this.inside && T) return T.kind === 'pickles' ? 'macht Essiggurke 🥒' : T.burnt && (NB.clock.minutes() - T.from) / Math.max(1, T.to - T.from) > 0.6 ? 'het de ' + T.item + ' verbrännt 🔥' : 'backt ' + T.item + ' 🍰';
      return null;
    }
  }
  Object.assign(NB.Ent, { Mige });
})(window.NB);
