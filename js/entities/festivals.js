// Festivals, seasons and small daily stories (NB.cal in js/util.js says which days are on; places in js/world.js):
// the Dorffest + 1. August (evening at the festival tent, bonfire, fireworks), Fasnacht (costumes, a Guggenmusik
// band on the village loop), the Easter egg hunt, Kürbismarkt shoppers, Sunday Zopf at Iris's, the snowman,
// André warming up his jeep at seven, and the news Karin passes on. Also: the Räbeliechtli-Umzug (November), the
// Samichlaus with Schmutzli and donkey (5 / 6 December), Silvester on the festival lawn, the Dorfmärt with a
// Rösslispiel (September), the Gmeiversammlig in the Casino and fondue evenings in winter.
(function (NB) {
  const { E, I, map, add, place, say, Mover, claimSpot } = NB.Ent;
  const cal = NB.cal || {};
  const F = (NB.Fest = {});
  const talk = (who, lines, o) => { const l = typeof lines === 'string' ? lines : NB.pick(lines); say(who, l, o); if (NB.UI.onScreen(who)) NB.Audio.babble(l, (who.c && who.c.voice) || 1, { pos: who, vol: 0.6 }); return l; };

  // ---------------------------------------------------------------- news (Karin passes it on)
  const today = NB.clock.year + '-' + NB.clock.month + '-' + NB.clock.date;
  const NEWS = {
    fire: "D'Milchzentrale vo de Gehrigs het brennt! Scho wieder!",
    manolo: 'De Manolo vo de Mariana isch wieder abghaue – die arm Mariana!',
    poacher: 'De Weiher-Buur het wieder öpper bim Fische verwütscht!',
    racer: 'Geschter Obig isch wieder so en Raser dur d\'Bremgarterstrass – lebensgföhrlich!',
    jeep: 'De André het am Morge wieder sin Jeep laufe lah. Am siebni!',
    fireworks: 'S\'Füürwerk geschter – wunderschön, gäll?',
    eggs: 'D\'Oschtereier sind alli gfunde worde!',
    gugge: 'D\'Guggemusig isch dure – mini Ohre!',
    raebeli: 'Hesch d\'Räbeliechtli gseh? So schön!',
    chlaus: 'De Samichlaus isch bim Nochberschind gsi – mit em Esel!',
    silvester: 'Es guets Neus! Das Füürwerk um Mitternacht…',
    gmv: 'A de Gmeiversammlig händs s\'Budget aagnoh. Knapp!',
    maert: 'Am Dorfmärt het de Reto sin ganze Chäs verchauft!',
    fondue: 'Geschter Fondue – ich schmöck hüt no noch Chäs.',
  };
  let news = null; // loaded on first use (NB.UI comes later in the page)
  const loadNews = () => news || (news = (NB.UI.store.get('news', []) || []).filter((n) => Date.now() - n.t < 2 * 86400000));
  F.news = function (id) {
    if (!NEWS[id]) return;
    loadNews();
    news = news.filter((n) => n.id !== id).concat([{ id, t: Date.now() }]).slice(-8);
    NB.UI.store.set('news', news);
  };
  F.gossip = () => (loadNews().length ? 'Häsch ghört? ' + NEWS[NB.pick(news.slice(-3)).id] : null);

  // ---------------------------------------------------------------- where people should be (overrides routines)
  const HOME_FAM = ['iris', 'yves', 'joel', 'mariana', 'mige'];
  F.goal = function (v) {
    const c = v.c, min = NB.clock.minutes();
    if (cal.fest && map.spots && map.spots.fest && !c.noFest && (NB.inWindow(min, '18:00', '23:30') || (cal.august1 && NB.inWindow(min, '11:00', '13:00')))) return { place: 'fest' };
    if (cal.sunday && HOME_FAM.includes(c.id) && NB.inWindow(min, '09:30', '11:30') && map.spots && map.spots.terrasse) return { place: 'terrasse', act: c.id === 'iris' ? 'zopf' : null };
    if (c.id === 'chind' && NB.season === 'winter' && map.spots && map.spots.schneemaa && NB.inWindow(min, '09:15', '11:30')) return { place: 'schneemaa' };
    if (c.id === 'andre' && jeep.on) return { place: 'jeep' };
    if (party() && map.spots && map.spots.silvester && !c.noFest) return { place: 'silvester' };
    if (c.id === 'chind' && CH.state && CH.state !== 'leave' && CH.kidCalled) return { place: 'chlaus' };
    const ng = neighbourGoal(c); if (ng) return ng; // Iris with Nuria, Iris chatting with Tanja or André
    const wg = walkGoal(c); if (wg) return wg; // a walk along the Schänisweg to the viewpoint
    if (cal.maert && map.maert) { const g = maertGoal(c, min); if (g) return g; }
    if (cal.gmv && GMV_WHO(c) && NB.inWindow(min, '19:40', '22:00')) return { place: 'home:beiz' };
    if (F.fondue && NB.inWindow(min, '18:30', '21:45')) for (const fd of F.fondue) {
      if (fd.guests.includes(c.id)) return { place: 'home:' + fd.host.id };
      if (fd.residents.includes(c.id) && fd.guests.length) return { place: 'home' };
    }
    return null;
  };

  // Fasnacht: most people wear a costume (bright clothes, a mask, a funny hat)
  const COSTUME = [['#ff3a6a', '#ffd23f'], ['#3ad06a', '#ff8a2a'], ['#4f7aff', '#ffffff'], ['#b06aff', '#ffd23f'], ['#ff8a2a', '#2a2a2a'], ['#ffffff', '#d52b1e']];
  F.costume = function (look, seed) {
    if (!cal.fasnacht || (seed * 0.737) % 1 > 0.7) return look;
    const [a, b] = COSTUME[Math.floor(seed * 7) % COSTUME.length];
    return Object.assign({}, look, { shirt: a, pants: b, bands: [b, a], hairStyle: seed % 2 ? 'cap' : 'straw', cap: b, mask: seed % 3 ? b : '#ffffff', dress: null, apron: null });
  };

  // ---------------------------------------------------------------- fireworks + bonfire (1. August)
  const COLORS = ['#ff4a4a', '#ffd23f', '#4fa3ff', '#7dff8a', '#ff8af0', '#ffffff', '#ff9a2a'];
  // a burst: peony (a ball of stars), willow (gold, drooping, long), ring, crossette (stars that split again)
  // or a double (a second colour inside)
  const spark = (x, y, z, vx, vy, vz, o) => NB.UI.fx(x, y, z, 'spark', Object.assign({ vx, vy, vz, g: 3.2, drag: 0.7, life: NB.rr(1.8, 2.6) }, o));
  function ball(x, y, z, n, sp, o) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, e = Math.asin(NB.rr(-1, 1)), v = sp * NB.rr(0.85, 1.1);
      spark(x, y, z, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 1, Math.sin(a) * Math.cos(e) * v, Object.assign({ col: NB.pick(o.cols) }, o.fx));
    }
  }
  function burst(x, y, z, kind) {
    const col = NB.pick(COLORS), col2 = NB.pick(COLORS), type = kind || NB.pick(['peony', 'peony', 'willow', 'ring', 'crossette', 'double']);
    NB.UI.fx(x, y, z, 'flash', { vy: 0, life: 0.45, col: type === 'willow' ? '#ffcf6a' : col });
    if (type === 'peony') ball(x, y, z, 64, 8.5, { cols: [col, col, col2] });
    else if (type === 'willow') ball(x, y, z, 54, 6.5, { cols: ['#ffcf6a', '#ffb040'], fx: { life: NB.rr(3.2, 4.2), g: 1.6, drag: 1.4, tail: 1 } });
    else if (type === 'ring') { const n = 44, t = NB.rr(0, 6.28); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; spark(x, y, z, Math.cos(a) * 9, Math.sin(a) * Math.sin(t) * 6 + 1, Math.sin(a) * Math.cos(t) * 9, { col }); } ball(x, y, z, 14, 3, { cols: [col2] }); }
    else if (type === 'crossette') { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, e = NB.rr(-0.5, 0.7); NB.UI.fx(x, y, z, 'spark', { vx: Math.cos(a) * Math.cos(e) * 7, vy: Math.sin(e) * 7 + 1, vz: Math.sin(a) * Math.cos(e) * 7, g: 2, drag: 0.4, life: 0.75, col, onEnd: (f) => ball(f.x, f.y, f.z, 7, 4.5, { cols: [col2, '#ffffff'], fx: { life: NB.rr(0.9, 1.4) } }) }); } }
    else { ball(x, y, z, 54, 9, { cols: [col] }); setTimeout(() => ball(x, y, z, 26, 4.5, { cols: [col2] }), 260); }
    NB.Audio.play('boom', { pos: { x, z }, vol: 0.9, rate: NB.rr(0.85, 1.15) });
    if (type !== 'willow') setTimeout(() => NB.Audio.play('crackle', { pos: { x, z }, vol: 0.55 }), 450);
  }
  function launch(from, o) {
    o = o || {};
    const x = from.x + NB.rr(-3, 3), z = from.z + NB.rr(-3, 3), h = o.h || NB.rr(11, 18), vy = 15;
    const f = { x, y: 0.5, z, kind: 'rocket', vy, vx: NB.rr(-1, 1), vz: NB.rr(-1, 1), g: 0, life: h / vy, t: 0, wob: 0, size: 1 };
    f.onEnd = () => burst(f.x, f.y, f.z, o.kind);
    NB.UI.fxs.push(f);
    NB.Audio.play('rocket', { pos: { x, z }, vol: 0.45, rate: NB.rr(0.9, 1.1) });
  }
  F.launch = launch;
  // the Gemeindeammann's 1.-August speech at the festival tent (20:30), line by line, applause at the end
  const SPEECH = ['Liebi Mitbürgerinne und Mitbürger vo Niederwil und Nesselnbach…', '125 Johr Niederwil-Nesselnbach – das isch es Gschänk.', 'Mir händ zäme vill erreicht: d\'Milchzentrale isch wieder ufbaut, d\'Gartebahn fahrt…', 'Es Hoch uf d\'Schwiiz – und uf üses Dorf! 🇨🇭'];
  const speech = { i: 0, t: 0 };
  function updateSpeech(dt) {
    if (!cal.august1 || speech.i >= SPEECH.length || !NB.inWindow(NB.clock.minutes(), '20:30', '21:15')) return;
    const p = E.list.find((v) => v.kind === 'villager' && v.c.id === 'peterhans');
    if (!p || p.inside || p.away || p.moving || !map.fest || Math.hypot(p.x - map.fest.lot.x, p.z - map.fest.lot.z) > 12) return;
    if ((speech.t -= dt) > 0) return;
    speech.t = 7; talk(p, SPEECH[speech.i++]);
    if (speech.i === SPEECH.length) { NB.Audio.play('cheer', { pos: p, vol: 0.9 }); E.list.filter((v) => v.kind === 'villager' && v !== p && !v.inside && Math.hypot(v.x - p.x, v.z - p.z) < 15).slice(0, 4).forEach((v, k) => { v.later = { t: 1.5 + k, line: NB.pick(['Bravo! 👏', 'Hoch!', 'Schöni Red, Thomas!', 'Prost! 🍺']) }; }); }
  }
  let rocketT = 2, fireLoop = null, fireFxT = 0;
  function updateFest(dt) {
    if (!cal.fest) return;
    updateSpeech(dt);
    const min = NB.clock.minutes(), dark = NB.Env.darkness > 0.6;
    const from = map.bonfire || (map.fest && map.fest.lot);
    // fireworks: 1 August 21:30-00:30 (lots), 31 July a few around 22:30
    const show = dark && from && (cal.august1 ? NB.inWindow(min, '21:30', '23:59') || NB.inWindow(min, '00:00', '00:30') : NB.inWindow(min, '22:15', '22:45'));
    if (show && (rocketT -= dt) <= 0) {
      rocketT = cal.august1 ? NB.rr(0.5, 2.4) : NB.rr(2, 6);
      const spot = Math.random() < 0.8 && map.fest ? map.fest.lot : from;
      launch(spot);
      if (NB.UI.onScreen(spot, 300)) { NB.UI.discover('fireworks'); F.news('fireworks'); }
    }
    // the bonfire burns on the evening of 1 August
    const B = map.bonfire, burning = B && cal.august1 && NB.inWindow(min, '21:00', '23:59');
    if (burning) {
      if ((fireFxT -= dt) <= 0 && NB.UI.onScreen(B, 200)) {
        fireFxT = 0.06;
        NB.UI.fx(B.x + NB.rr(-1.2, 1.2), NB.rr(0.5, 2.5), B.z + NB.rr(-1.2, 1.2), 'fire', { vy: NB.rr(2, 4), life: NB.rr(0.6, 1.2), size: 1.6 });
        if (Math.random() < 0.3) NB.UI.fx(B.x, 4, B.z, 'smoke', { vy: 2, life: 3, size: 1.5 });
        NB.UI.discover('bonfire');
      }
      if (!fireLoop && NB.UI.onScreen(B, 200)) fireLoop = NB.Audio.loop && NB.Audio.loop('fire', { pos: B, vol: 0.6 });
      if (fireLoop) fireLoop.update(B);
    } else if (fireLoop) { fireLoop.stop(); fireLoop = null; }
  }

  // ---------------------------------------------------------------- Guggenmusik (Fasnacht): a band on the village loop
  const TUNES = [
    [[0, 1], [4, 1], [7, 1], [12, 2], [7, 1], [9, 1], [7, 2], [4, 1], [5, 1], [4, 1], [2, 1], [0, 3]],
    [[7, 1], [7, 1], [9, 1], [7, 1], [12, 2], [11, 2], [7, 1], [7, 1], [9, 1], [7, 1], [14, 2], [12, 2]],
  ];
  // ---------------------------------------------------------------- walkers in a column: a leader and the ones following his trail
  const screenRight = (dx, dz) => { const p = I.project(0, 0, 0), q = I.project(dx, 0, dz); return q[0] >= p[0]; };
  const view4 = (h) => { const f = I.facing(h); return f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left'; };
  class Walker extends Mover {
    constructor(frames, o) {
      super(o.x || 0, o.z || 0, map.walkCost, o.speed || 1.1);
      this.frames = frames; this.side = !frames.down; // animals: side views only
      this.kind = o.kind || 'walker'; this.name = o.name; this.lead = o.lead || null; this.gap = o.gap || 16; // trail points (10 cm) behind
      this.bob = o.bob || 0; this.lines = o.lines; this.lantern = o.lantern || null; this.about = o.about;
      this.sprite = new PIXI.Sprite(); this.trail = []; this.heading = o.heading || 0; this.done = false; this.dir = 'right';
    }
    record() { const lt = this.trail[this.trail.length - 1]; if (!lt || Math.hypot(lt.x - this.x, lt.z - this.z) >= 0.1) { this.trail.push({ x: this.x, z: this.z }); if (this.trail.length > 700) this.trail.shift(); } }
    follow(dt) { // stand on the leader's trail, `gap` points back
      const tr = this.lead.trail, p = tr[Math.max(0, tr.length - 1 - this.gap)] || this.lead;
      const dx = p.x - this.x, dz = p.z - this.z; this.moving = Math.hypot(dx, dz) > 0.02;
      if (this.moving) { this.heading = Math.atan2(dx, dz); this.anim += dt; }
      this.x = p.x; this.z = p.z;
    }
    loop(dt, frac) { // the leader walks the village loop (map.gassi); true when `frac` of it is done
      if (!this.stepPath(dt)) return false;
      this.wp = (this.wp + 1) % map.gassi.length; this.legs = (this.legs || 0) + 1;
      if (this.legs > map.gassi.length * frac) return true;
      this.path = [map.gassi[this.wp]];
      return false;
    }
    pose() {
      if (this.side) {
        if (this.moving) this.dir = screenRight(Math.sin(this.heading), Math.cos(this.heading)) ? 'right' : 'left';
        place(this, this.frames.walk[this.moving ? Math.floor(this.anim * 5) % 2 : 0][this.dir], this.x, 0, this.z);
      } else {
        const y = this.bob ? Math.abs(Math.sin(performance.now() / 200 + this.gap)) * this.bob : 0;
        place(this, this.frames[view4(this.heading)][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0], this.x, y, this.z);
      }
    }
    update(dt) { if (this.lead) { this.follow(dt); this.pose(); } } // leaders are driven by their festival
    remove() { this.done = true; NB.world.remove(this.sprite); }
    click() { if (this.lines) talk(this, this.lines); }
    get visible() { return true; }
    top() { return { x: this.x, y: this.side ? 1.7 : 2.6, z: this.z }; }
  }
  // a column on the village loop, starting at a random waypoint
  function column(make, n) {
    const start = Math.floor(Math.random() * map.gassi.length), lead = make(0, null), all = [lead];
    lead.x = map.gassi[start].x; lead.z = map.gassi[start].z; lead.wp = (start + 1) % map.gassi.length; lead.path = [map.gassi[lead.wp]];
    // the trail they have "already walked": back along the loop, so the column starts lined up
    const N = map.gassi.length, back = [];
    for (let k = 0, p = { x: lead.x, z: lead.z }; k < N && back.length < n * 20; k++) {
      const q = map.gassi[(start - k - 1 + N * 2) % N], d = Math.hypot(q.x - p.x, q.z - p.z);
      for (let t = 0.1; t <= d; t += 0.1) back.push({ x: p.x + ((q.x - p.x) * t) / d, z: p.z + ((q.z - p.z) * t) / d });
      p = q;
    }
    lead.trail = back.reverse().concat([{ x: lead.x, z: lead.z }]);
    for (let i = 1; i < n; i++) { const g = make(i, lead); g.lead = lead; g.follow(0); all.push(g); }
    lead.band = all; all.forEach((g) => add(g));
    return lead;
  }

  class Gugge extends Walker {
    constructor(i, lead) {
      const [a, b] = COSTUME[i % COSTUME.length];
      super(NB.Models.person({ skin: '#f1c7a0', hair: '#2a2a2a', hairStyle: i % 2 ? 'straw' : 'cap', cap: b, shirt: a, pants: b, bands: [b, a], mask: i % 3 ? '#ffffff' : b, shoes: '#2a2a2a' }),
        { kind: 'gugge', name: i === 0 ? 'Guggemusig «Reuss-Schränzer»' : 'Guggemusiger', lead, gap: i * 16, bob: 0.12 });
      this.tuneT = 1;
    }
    update(dt) {
      if (this.lead) { this.follow(dt); return this.pose(); }
      if (this.loop(dt, 0.6)) { this.band.forEach((g) => g.remove()); F.news('gugge'); return; }
      this.record();
      if ((this.tuneT -= dt) <= 0 && NB.UI.onScreen(this, 200)) { // a tune: brass + drum, confetti
        const tune = NB.pick(TUNES), beat = 0.22;
        this.tuneT = NB.Audio.melody('brass', tune, beat, { pos: this, vol: 0.8 }) + NB.rr(2, 4);
        for (let k = 0; k < 14; k++) setTimeout(() => NB.Audio.play('drum', { pos: this, vol: 0.7 }), k * beat * 2 * 1000);
        NB.UI.discover('gugge');
      }
      if (Math.random() < dt * 3) NB.UI.fx(this.x + NB.rr(-2, 2), 3.5, this.z + NB.rr(-2, 2), 'confetti', { vy: -0.6, vx: NB.rr(-0.5, 0.5), life: 2.5, col: NB.pick(COLORS) });
      this.pose();
    }
    click() { talk(this, ['Schränz! 🎺', 'Rüüüdig! 🥁', 'Hopp Gugge!', 'Fasnacht isch nur eimol im Johr!']); NB.Audio.melody('brass', TUNES[0].slice(0, 5), 0.18, { pos: this }); }
  }
  const guggeDone = new Set();
  function updateGugge() {
    if (!cal.fasnacht || !map.gassi) return;
    const min = NB.clock.minutes();
    for (const at of ['14:00', '19:30']) {
      if (guggeDone.has(at) || min < NB.toMin(at) || min > NB.toMin(at) + 25) continue;
      guggeDone.add(at);
      column((i, lead) => new Gugge(i, lead), 8);
    }
  }

  // ---------------------------------------------------------------- Easter eggs in the gardens
  const eggKey = 'eggs-' + NB.clock.year;
  class Egg {
    constructor(p, i) { this.kind = 'egg'; this.name = 'Oschterei'; this.i = i; this.x = p.x; this.z = p.z; this.sprite = new PIXI.Sprite(); place(this, NB.Models.egg(i), this.x, 0, this.z); }
    update() {}
    click() {
      const got = new Set(NB.UI.store.get(eggKey, [])); got.add(this.i); NB.UI.store.set(eggKey, [...got]);
      NB.Audio.play('chime', { pos: this }); NB.UI.fx(this.x, 0.8, this.z, 'heart', { vy: 1, life: 1.2 });
      say({ x: this.x, y: 1.2, z: this.z }, `🥚 Oschterei gfunde! (${got.size}/${map.eggSpots.length})`, { life: 3 });
      this.done = true; NB.world.remove(this.sprite);
      if (got.size >= map.eggSpots.length) { NB.UI.discover('eggs'); F.news('eggs'); }
    }
    get visible() { return true; }
    top() { return { x: this.x, y: 0.6, z: this.z }; }
  }

  // ---------------------------------------------------------------- Kürbismarkt shoppers (autumn, by day)
  const SHOP_LINES = ['Ui, die sind aber schön!', 'Eine für d\'Suppe, eine für vor d\'Tür. 🎃', 'Was choschtet de Grossi?', 'Für Halloween – de Grösst, bitte!', 'Butternuss oder Hokkaido?'];
  class Shopper extends Mover {
    constructor(from, where) {
      super(from.x, from.z, map.walkCost, NB.rr(1.2, 1.5));
      this.kind = 'shopper'; this.name = NB.pick(['Kundin', 'Kunde', 'Bsuecherin us Wohle', 'Bsuecher us Bremgarte', 'Familie Meier']); this.from = from;
      const r = Math.random(), skin = NB.pick(['#f1c7a0', '#e8b890', '#c98a5e', '#8a5a3a']);
      this.frames = NB.Models.person({ skin, hair: NB.pick(['#2a1a10', '#8a5a32', '#d8b060', '#c8c8c8']), hairStyle: NB.pick(['short', 'long', 'ponytail', 'cap', 'bun']), shirt: NB.pick(['#e05a5a', '#4f8fd6', '#5bb07a', '#e8b030', '#7a4aa0']), pants: NB.pick(['#2a2a3a', '#3f68a8', '#5a4a3a']), cap: NB.pick(['#d94a4a', '#2f6fb5']), glasses: r < 0.3 });
      this.sprite = new PIXI.Sprite(); this.state = 'go'; this.t = 0; this.heading = 0;
      const sp = claimSpot(this, where || 'kuerbismarkt'); this.spot = sp; this.where = where;
      if (!sp) this.state = 'leave';
      else if (!this.goTo(sp.x, sp.z)) { this.goTo(sp.x - Math.sin(sp.face) * 2, sp.z - Math.cos(sp.face) * 2); (this.path = this.path || []).push({ x: sp.x, z: sp.z }); } // the last step onto the spot by the stand
    }
    update(dt) {
      if (this.state === 'go') { if (this.stepPath(dt)) { this.state = 'shop'; this.t = NB.rr(40, 100); this.heading = this.spot.face; if (Math.random() < 0.6) talk(this, this.where ? MAERT_LINES : SHOP_LINES, { quiet: true }); } }
      else if (this.state === 'shop') { this.moving = false; if ((this.t -= dt) <= 0) { NB.Ent.releaseSpot(this); this.state = 'leave'; this.carry = true; this.goTo(this.from.x, this.from.z); } }
      else if (this.stepPath(dt)) { if (!this.path && Math.hypot(this.x - this.from.x, this.z - this.from.z) > 3 && !this.retried) { this.retried = true; this.goTo(this.from.x, this.from.z); return; } this.done = true; NB.world.remove(this.sprite); return; }
      const f = I.facing(this.heading), view = f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left';
      place(this, this.frames[view][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0], this.x, 0, this.z);
    }
    click() { talk(this, this.carry ? ['Lueg, min Kürbis! 🎃', 'Dä wird e Suppe.'] : SHOP_LINES); }
    get visible() { return true; }
    top() { return { x: this.x, y: 2.4, z: this.z }; }
  }
  let shopT = 5, maertT = 3;
  const MAERT_LINES = ['Es Säckli Magebrot, bitte!', 'Lueg, de Chäs vo de Gehrigs!', 'Wie vill choschtet d\'Socke?', 'Ich nimm zwei Glace. 🍦', 'Was für en schöne Märt!'];
  function updateShoppers(dt) {
    if (cal.maert && map.spots && map.spots.maert && map.busStops && map.busStops.length && NB.inWindow(NB.clock.minutes(), '10:00', '17:00') && (maertT -= dt) <= 0) { // visitors from Niederwil and Bremgarten
      maertT = NB.rr(15, 35);
      if (E.list.filter((e) => e.kind === 'shopper').length < 7) { const st = NB.pick(map.busStops); add(new Shopper({ x: st.x, z: st.z }, 'maert')); }
    }
    if (NB.season !== 'autumn' || !map.spots || !map.spots.kuerbismarkt || !map.busStops || !map.busStops.length) return;
    if (!NB.inWindow(NB.clock.minutes(), '09:00', '17:00') || (shopT -= dt) > 0) return;
    shopT = NB.rr(25, 60);
    if (E.list.filter((e) => e.kind === 'shopper').length >= 4) return;
    const st = NB.pick(map.busStops);
    add(new Shopper({ x: st.x, z: st.z }));
  }

  // ---------------------------------------------------------------- André warms up the jeep at seven
  const jeep = { on: false, t: 0, done: false };
  function updateJeep(dt) {
    const min = NB.clock.minutes(), P = map.parkings && map.parkings.koch;
    if (!P) return;
    if (!jeep.done && !jeep.on && NB.inWindow(min, '07:00', '07:04')) {
      const a = E.list.find((v) => v.kind === 'villager' && v.c.id === 'andre');
      if (!a || a.away) { jeep.done = true; return; }
      jeep.on = true; jeep.t = 120; jeep.andre = a;
      map.spots = map.spots || {};
      map.spots.jeep = [{ x: P.x + Math.cos(P.heading) * 1.6, z: P.z - Math.sin(P.heading) * 1.6, face: Math.atan2(-Math.cos(P.heading), Math.sin(P.heading)), sit: false }];
    }
    if (!jeep.on) return;
    if (!NB.inWindow(min, '06:55', '07:25')) { jeep.on = false; jeep.done = true; if (jeep.andre) jeep.andre.goalKey = null; return; }
    const a = jeep.andre, near = !a.inside && !a.moving && Math.hypot(a.x - P.x, a.z - P.z) < 9;
    if (!near) return;
    jeep.t -= dt;
    jeep.engT = (jeep.engT || 0) - dt;
    if (jeep.engT <= 0) { jeep.engT = 0.5; NB.Audio.play('engine', { pos: P, vol: 0.9, rate: 0.8 }); if (NB.UI.onScreen(P)) NB.UI.fx(P.x - Math.sin(P.heading) * 2, 0.5, P.z - Math.cos(P.heading) * 2, 'smoke', { vy: 0.6, life: 2.4, size: 0.8 }); }
    if (!jeep.said) { jeep.said = true; talk(a, ['So, de Jeep mues warm laufe. 🚙', 'Brumm-brumm – en 1963er bruucht Ziit am Morge.']); F.news('jeep'); NB.UI.discover('jeep'); }
    if (!jeep.moan && jeep.t < 100) {
      jeep.moan = true;
      const n = E.list.filter((v) => v.kind === 'villager' && v !== a && !v.away && Math.hypot(v.x - P.x, v.z - P.z) < 70).sort((p, q) => Math.hypot(p.x - P.x, p.z - P.z) - Math.hypot(q.x - P.x, q.z - P.z))[0];
      if (n) n.later = { t: 0.5, line: n.inside ? 'André!! S\'isch siebni am Morge! 😠' : NB.pick(['André, muesch de Jeep würkli jede Morge laufe lah?', 'Es stinkt bis do äne, André!', 'Guete Morge au, André… 🙄']) };
      const m = E.list.find((v) => v.kind === 'villager' && v.c.id === 'monika');
      if (m) m.later = { t: 4, line: 'André! D\'Nochbere!' };
    }
    if (jeep.t <= 0) { jeep.on = false; jeep.done = true; a.goalKey = null; talk(a, 'So, warm. Jetzt chan er wieder schlofe.'); }
  }

  // ---------------------------------------------------------------- Sunday Zopf on Iris's terrace
  let zopf = 0;
  function updateZopf() {
    if (!cal.sunday) return;
    const min = NB.clock.minutes(), iris = E.list.find((v) => v.kind === 'villager' && v.c.id === 'iris');
    if (!iris || iris.inside || !NB.inWindow(min, '09:40', '11:20') || !iris.spot || Math.hypot(iris.x - iris.spot.x, iris.z - iris.spot.z) > 1.5) return;
    const now = performance.now() / 1000;
    if (now - zopf < 70) return;
    zopf = now;
    talk(iris, ['De Zopf isch parat! 🍞 Chömed go ässe!', 'Sunntigszopf, früsch us em Ofe!', 'Wer wott no Anke und Konfi?']);
    NB.UI.fx(iris.x, 2.2, iris.z, 'heart', { vy: 1, life: 1.5 });
    const guests = E.list.filter((v) => v.kind === 'villager' && v !== iris && ['yves', 'joel', 'mariana', 'mige'].includes(v.c.id) && !v.away && !v.inside && Math.hypot(v.x - iris.x, v.z - iris.z) < 12);
    const R = { joel: ['Mami, de Zopf isch de bescht. Ehrlich.', 'Kafi und Zopf. Perfekt.'], mariana: ['¡Qué rico! Iris, dini Züpfe isch geil!', 'Mmh, fasch so guet wie Tortillas. Fasch.'], yves: ['Ich nimm no es Stuck.', 'Mami, hesch no Konfi?'], mige: ['Iris, de Zopf isch mega!', 'Ich nimm eis für d\'Mina mit. Nei, Spass.'] };
    guests.forEach((g, i) => { g.later = { t: 2.5 + i * 2.2, line: NB.pick(R[g.c.id]) }; });
    if (NB.UI.onScreen(iris)) NB.UI.discover('zopf');
  }

  // ---------------------------------------------------------------- the deer farmer brings hay by tractor
  let feedTractor = null;
  function updateFeeding() {
    const D = map.deer, hb = E.list.find((v) => v.kind === 'villager' && v.c.id === 'hirschbuur');
    if (!D || !hb) return;
    const feeding = !hb.inside && !hb.away && hb.goalKey === 'fuettern' && Math.hypot(hb.x - D.feed.x, hb.z - D.feed.z) < 8;
    F.feeding = feeding;
    if (feeding && !feedTractor) { // parked outside the gate, a trailer of hay behind it
      const out = D.at(-D.A + 4, D.M0 - 4.5), h = Math.atan2(D.t[0], D.t[1]);
      feedTractor = { kind: 'tractor', name: 'Traktor vom Hirschbuur', x: out.x, z: out.z, sprite: new PIXI.Sprite(), update() {}, get visible() { return true; }, top() { return { x: this.x, y: 2.9, z: this.z }; },
        click() { say(this, NB.pick(['Heu für d\'Hirsch! 🦌', 'Zweimol am Tag gits Fueter.', 'Tuck-tuck – Fuetertraktor.'])); NB.Audio.play('honkTractor', { pos: this, rate: 0.8 }); NB.UI.discover('feeding'); } };
      place(feedTractor, NB.Models.vehicle('tractor', '#2f8f3a', h), out.x, 0, out.z);
      add(feedTractor);
      if (NB.UI.onScreen(feedTractor)) NB.Audio.play('honkTractor', { pos: feedTractor, rate: 0.8 });
    }
    if (!feeding && feedTractor) { feedTractor.done = true; NB.world.remove(feedTractor.sprite); feedTractor = null; }
  }

  // ---------------------------------------------------------------- Räbeliechtli-Umzug: children with carved-turnip lanterns
  const KIDS = [['#d94a4a', '#2a3a5a', '#e0b030'], ['#2f6fb5', '#3a3a3a', '#5a3a22'], ['#e8b030', '#5a4a3a', '#2a1a10'], ['#5bb07a', '#2a2a3a', '#d8b060'], ['#b06aff', '#3a5f9a', '#8a5a32'], ['#ff8a2a', '#2a3a5a', '#2a1a10'], ['#4fb0c0', '#4a3a5a', '#c8c8c8']];
  const SONG = [[0, 1], [0, 1], [2, 1], [0, 1], [5, 2], [4, 2], [0, 1], [0, 1], [2, 1], [0, 1], [7, 2], [5, 2], [null, 1]];
  const KID_LINES = ['Räbeliechtli, Räbeliechtli, wo gosch hii? 🏮', 'Lueg mis Liechtli!', 'Ich ha mini Räbe sälber gschnitzt!', 'Mis Liechtli isch es Mondgsicht. 🌙', 'Mir isch chalt a d\'Füess.', 'Mis Liechtli isch usgange! – Ah nei, es brönnt no.'];
  function raebeliKid(i, lead) {
    const first = i === 0, last = i === 13;
    if (first || last) return new Walker(NB.Models.person({ skin: '#f1c7a0', hair: first ? '#8a5a32' : '#2a1a10', hairStyle: first ? 'bun' : 'short', shirt: first ? '#7a4aa0' : '#3f68a8', pants: '#2a2a3a', scarf: '#d52b1e' }),
      { kind: 'raebeli', name: first ? 'D\'Lehrerin' : 'En Papi', lead, gap: i * 12, speed: 0.8, lantern: '#ffb040', lines: first ? ['Hopp Chind, schön zäme bliibe!', 'Und jetzt no einisch, alli zäme! 🎶', 'Achtung, es Auto – uf d\'Siite!'] : ['Mis Chind isch da vorne, s\'zweit vo links.', 'Brrr, chalt hüt. Aber schön.'] });
    const [t, p, h] = KIDS[i % KIDS.length];
    return new Walker(NB.Models.person({ kid: true, skin: NB.pick(['#f1c7a0', '#e8b890', '#c98a5e']), hair: h, hairStyle: NB.pick(['short', 'long', 'ponytail', 'cap', 'bun']), cap: NB.pick(['#d94a4a', '#2f6fb5', '#5bb07a']), shirt: t, pants: p, scarf: NB.pick(['#d52b1e', '#ffd23f', '#2f6fb5']) }),
      { kind: 'raebeli', name: 'Chind mit Räbeliechtli', lead, gap: i * 12, lantern: '#ff9a3a', lines: KID_LINES, about: 'Am Räbeliechtli-Umzug.' });
  }
  let raebeli = null, raebeliDone = false, songT = 2;
  function updateRaebeli(dt) {
    if (!cal.raebeli || !map.gassi) return;
    const min = NB.clock.minutes();
    if (!raebeli && !raebeliDone && NB.inWindow(min, '18:00', '18:30')) {
      raebeliDone = true;
      raebeli = column(raebeliKid, 14);
      raebeli.update = function (dt2) { // the teacher leads; the children sing now and then
        if (this.loop(dt2, 0.7)) { this.band.forEach((g) => g.remove()); raebeli = null; F.news('raebeli'); return; }
        this.record(); this.pose();
      };
    }
    if (!raebeli) return;
    if ((songT -= dt) <= 0) {
      songT = 14;
      const mid = raebeli.band[6];
      if (NB.UI.onScreen(mid, 150)) {
        NB.Audio.melody('sing', SONG, 0.42, { pos: mid, vol: 0.7 });
        talk(mid, KID_LINES[0], { quiet: true });
        NB.UI.discover('raebeli');
      }
    }
    // people come to their doors and look
    for (const v of E.list) {
      if (v.kind !== 'villager' || v.inside || v.away || v.saw === 'raebeli' || Math.hypot(v.x - raebeli.x, v.z - raebeli.z) > 10) continue;
      v.saw = 'raebeli'; v.later = { t: NB.rr(0.5, 2.5), line: NB.pick(['Wie schön! 🏮', 'Ah, d\'Räbeliechtli!', 'Das hämmer als Chind au gmacht.', 'Lueg, die Liechtli!']) };
    }
  }

  // ---------------------------------------------------------------- Samichlaus, Schmutzli and the donkey visit the neighbour child
  const CH = (F.chlaus = { state: null });
  const CHLAUS_LINES = ['Ho… nei, ich bi nöd de Wiehnachtsmaa. Ich bi de Samichlaus! 🎅', 'Bisch au brav gsi?', 'Im goldige Buech staht alles drin.'];
  function startChlaus() {
    const C0 = map.chlaus, pool = (map.gassi || []).filter((w) => { const d = Math.hypot(w.x - C0.at.x, w.z - C0.at.z); return d > 50 && d < 130; });
    const from = pool.length ? NB.pick(pool) : map.start;
    const lead = new Walker(NB.Models.person({ skin: '#f1c7a0', hair: '#f4f4f4', hairStyle: 'mitre', cap: '#c0202a', beard: true, longBeard: true, shirt: '#c0202a', pants: '#c0202a', dress: '#c0202a', robe: true, shoes: '#2a2a2a' }),
      { kind: 'chlaus', name: 'De Samichlaus', x: from.x, z: from.z, speed: 0.85, lines: CHLAUS_LINES, about: 'Chunnt jede 6. Dezämber us em Wald.' });
    const schmutzli = new Walker(NB.Models.person({ skin: '#e8b890', hair: '#2a1a10', hairStyle: 'hood', cap: '#4a3426', beard: true, shirt: '#4a3426', pants: '#4a3426', dress: '#4a3426', robe: true, shoes: '#2a2a2a' }),
      { kind: 'chlaus', name: 'De Schmutzli', lead, gap: 16, lines: ['Ich trag de Sack. 🎒', 'Psst – i de Rute sind nur Zweigli.', 'Nüssli und Mandarindli!'], about: 'De Helfer vom Samichlaus.' });
    const esel = new Walker(NB.Models.donkey(), { kind: 'chlaus', name: 'De Esel', lead, gap: 34, lines: ['I-aaah! 🫏', '(Er wott es Rüebli.)'], about: 'Treit d\'Säck vom Samichlaus.' });
    esel.click = function () { talk(this, this.lines); NB.Audio.play('heehaw', { pos: this }); };
    [schmutzli, esel].forEach((g) => { g.x = from.x; g.z = from.z; });
    lead.goTo(C0.at.x, C0.at.z);
    Object.assign(CH, { state: 'come', lead, schmutzli, esel, from, t: 0, step: 0, jingleT: 1, kidCalled: true, asked: false }); // the child heads home to wait
    [lead, schmutzli, esel].forEach((g) => add(g));
  }
  const VISIT = [ // [seconds, who, line]
    [0, 'lead', 'Grüess di! De Samichlaus chunnt us em tüüfe Wald. 🎅'],
    [4, 'kid', 'G-grüezi Samichlaus…'],
    [8, 'lead', 'Im goldige Buech staht: du hesch fliissig ghulfe – aber au mängisch d\'Chatze plaget!'],
    [14, 'kid', 'Ich ha es Värsli glernt!'],
    [17, 'kid', 'Samichlaus, du liebe Maa, lueg mi bitte fründlich aa. Bi fasch immer brav gsi – drum tue öppis i mis Säckli dri!'],
    [25, 'lead', 'Wunderschön! Schmutzli, gib em sis Säckli.'],
    [28, 'schmutzli', 'Do: Nüssli, Mandarindli und en Lebchueche. 🍊'],
    [31, 'kid', 'Merci vielmol, Samichlaus! 😊'],
    [34, 'lead', 'Und blib brav – bis nöchscht Johr!'],
  ];
  function updateChlaus(dt) {
    if (!cal.samichlaus || !map.chlaus) return;
    const min = NB.clock.minutes();
    if (!CH.state) { if (!CH.done && NB.inWindow(min, '17:45', '18:30')) startChlaus(); return; }
    const L = CH.lead, kid = E.list.find((v) => v.kind === 'villager' && v.c.id === 'chind');
    if (CH.state !== 'visit') { L.stepPath(dt); L.record(); }
    L.pose();
    if ((CH.jingleT -= dt) <= 0) { CH.jingleT = CH.state === 'visit' ? 9 : 4; if (NB.UI.onScreen(L)) NB.Audio.play('jingle', { pos: L, vol: 0.7 }); }
    if (CH.state === 'come') {
      if (!L.path) { CH.state = 'visit'; CH.t = 0; CH.step = 0; L.heading = map.chlaus.face; L.moving = false; }
      for (const v of E.list) if (v.kind === 'villager' && !v.inside && !v.away && v.saw !== 'chlaus' && Math.hypot(v.x - L.x, v.z - L.z) < 12) { v.saw = 'chlaus'; v.later = { t: NB.rr(0.3, 2), line: NB.pick(['De Samichlaus! 🎅', 'Grüezi Samichlaus!', 'Oh, de Esel isch jo herzig!']) }; }
    } else if (CH.state === 'visit') {
      CH.t += dt;
      const here = kid && !kid.inside && !kid.away && Math.hypot(kid.x - L.x, kid.z - L.z) < 5;
      const coming = kid && !kid.away && !kid.inside;
      if (!here && CH.step === 0 && CH.t > 6 && !CH.asked) { CH.asked = true; talk(L, coming ? 'Wo isch ächt s\'Nochberschind? Ah, do chunnt\'s!' : 'Isch öpper dihei? 🔔'); }
      if (!here && CH.step === 0 && CH.t > (coming ? 150 : 25)) { talk(L, 'Niemer dihei? Denn stell ich s\'Säckli vor d\'Tür.'); CH.step = VISIT.length; CH.t = 30; }
      if (here && CH.step === 0 && CH.t0 == null) CH.t0 = CH.t; // the script starts when the child is there
      const st = CH.t - (CH.t0 || 0);
      while (here && CH.step < VISIT.length && st >= VISIT[CH.step][0]) {
        const [, who, line] = VISIT[CH.step++], w = who === 'kid' ? kid : CH[who];
        talk(w, line);
        if (who === 'schmutzli') { for (let k = 0; k < 10; k++) NB.UI.fx(kid.x, 1.4, kid.z, 'crumb', { vy: NB.rr(1, 2.5), vx: NB.rr(-0.6, 0.6), g: 3, life: 1 }); NB.UI.fx(kid.x, 2.4, kid.z, 'heart', { vy: 1, life: 1.5 }); setTimeout(() => NB.Audio.play('heehaw', { pos: CH.esel }), 1500); }
        if (NB.UI.onScreen(L)) { NB.UI.discover('samichlaus'); F.news('chlaus'); }
      }
      if (CH.step >= VISIT.length && (here ? st > VISIT[VISIT.length - 1][0] + 3 : CH.t > 31)) { CH.state = 'leave'; CH.kidCalled = false; if (kid) kid.goalKey = null; L.goTo(CH.from.x, CH.from.z); }
    } else if (CH.state === 'leave' && !L.path) {
      [L, CH.schmutzli, CH.esel].forEach((g) => g.remove()); CH.state = null; CH.done = true;
    }
  }

  // ---------------------------------------------------------------- Silvester: everyone out on the festival lawn, fireworks at midnight
  function party() {
    if (!cal.silvester && !cal.neujahr) return false;
    const min = NB.clock.minutes(), d = NB.clock.dayOffset();
    return (cal.silvester && d === 0 && min >= NB.toMin('23:20')) || (((cal.neujahr && d === 0) || (cal.silvester && d === 1)) && min < NB.toMin('00:50'));
  }
  let sylT = 3, prevMin = NB.clock.minutes(), lastCount = 0;
  const NEWYEAR = ['Es guets Neus! 🥂', 'Prosit Neujahr! 🎆', 'E guets Neus Johr!', 'Gsundheit und Glück im neue Johr!', 'Prost! 🍾'];
  function updateSilvester(dt) {
    if (!cal.silvester && !cal.neujahr) return;
    const min = NB.clock.minutes(), was = prevMin; prevMin = min;
    if (!party()) return;
    const lot = map.fest && map.fest.lot, yards = (map.eggSpots || []).concat(lot ? [lot] : []);
    if (!yards.length) return;
    // the countdown in the last ten seconds
    if (min > 1439.82) { const n = Math.ceil((1440 - min) * 60); if (n !== lastCount && n <= 10 && n >= 1) { lastCount = n; say({ x: lot.x, y: 5, z: lot.z }, n + '…', { life: 1 }); } }
    if (was > 1400 && min < 40) { // midnight
      lastCount = 0;
      NB.Env.ringBells(12); NB.Audio.play('cheer', { pos: lot, vol: 1 }); NB.Audio.play('clink', { pos: lot });
      say({ x: lot.x, y: 5, z: lot.z }, '🎉 ' + (NB.clock.year + 1) + '! 🎉', { life: 5 });
      E.list.filter((v) => v.kind === 'villager' && !v.inside && !v.away && Math.hypot(v.x - lot.x, v.z - lot.z) < 20).forEach((v, i) => { v.later = { t: 0.6 + i * 0.7, line: NB.pick(NEWYEAR) }; });
      for (let k = 0; k < 8; k++) setTimeout(() => launch(NB.pick(yards)), k * 220);
      for (let k = 0; k < 40; k++) NB.UI.fx(lot.x + NB.rr(-5, 5), 4, lot.z + NB.rr(-5, 5), 'confetti', { vy: -0.5, vx: NB.rr(-0.6, 0.6), life: 3, col: NB.pick(COLORS) });
      if (NB.UI.onScreen(lot, 300)) NB.UI.discover('silvester');
      F.news('silvester');
    }
    const heavy = min < NB.toMin('00:25') || min > 1439.5, dark = NB.Env.darkness > 0.6;
    if (dark && (sylT -= dt) <= 0) {
      sylT = heavy && min < 600 ? NB.rr(0.2, 0.8) : min < 600 ? NB.rr(3, 8) : NB.rr(5, 14); // a few early ones, a storm after midnight
      launch(lot && Math.random() < 0.5 ? lot : NB.pick(yards));
      if (lot && NB.UI.onScreen(lot, 300)) NB.UI.discover('fireworks');
    }
  }

  // ---------------------------------------------------------------- Dorfmärt with a Rösslispiel (September)
  const WALTZ = [[0, 1], [4, 1], [7, 1], [12, 2], [11, 1], [9, 2], [7, 1], [5, 1], [4, 1], [2, 2], [7, 1], [11, 1], [14, 2], [12, 3]];
  function maertGoal(c, min) {
    if (!NB.inWindow(min, '09:30', '17:00')) return null;
    if (c.id === 'reto') return { place: 'chaes' };
    if (c.id === 'hirschbuur') return { place: 'gmues' };
    if (c.id === 'chind') return NB.inWindow(min, '13:30', '16:30') ? { place: 'rossli' } : null;
    const r = NB.seeded(c.name.length * 31 + c.name.charCodeAt(0) + NB.clock.day)(), from = 600 + Math.floor(r * 300); // 10:00 - 15:00, for 1.5 hours
    if (r > 0.75 || min < from || min > from + 90) return null;
    return { place: r < 0.15 ? 'rossli' : 'maert' };
  }
  let organT = 2;
  function updateMaert(dt) {
    if (!cal.maert || !map.maert) return;
    const C0 = map.maert.carousel;
    if (!NB.inWindow(NB.clock.minutes(), '10:00', '17:00') || (organT -= dt) > 0) return;
    organT = 3;
    if (NB.UI.onScreen(C0, 100)) { organT = NB.Audio.melody('organ', WALTZ, 0.26, { pos: C0, vol: 0.6 }) + 1.5; NB.UI.discover('maert'); }
  }
  F.carouselOn = () => cal.maert && NB.inWindow(NB.clock.minutes(), '10:00', '17:00');

  // ---------------------------------------------------------------- Gmeiversammlig in the Casino (June and November, a Friday at 20:00)
  const GMV_WHO = (c) => !c.visitor && !['chind', 'wirtin'].includes(c.id);
  const AGENDA = ['Traktandum 1: S\'Protokoll vo de letschte Versammlig.', 'Traktandum 2: Budget ' + (NB.clock.year + 1) + '. Wer isch defür? ✋', 'Antrag aagnoh – 41 Ja, 12 Nei.', 'Traktandum 3: Strassesanierig Ifangweg.', 'Wortmeldig: Und was isch mit em Raser uf de Bremgarterstrass?!', 'Wortmeldig vom André: De Jeep isch nöd z\'lut!', 'Verschiedenes: Wer het de Schlüssel vom Füürwehrmagazin?', 'Applaus für de Gemeindeammann. 👏'];
  const AFTER = ['Die Strassesanierig wird tüür.', 'S\'Budget isch dure. Knapp, aber dure.', 'Jetzt no es Bier im Casino? 🍺', 'Zwei Stund für drü Traktande…', 'Guet, dass mer drüber gredt händ.'];
  const gmv = { t: 6, seen: new Set(), said: new Set(), k: 0 };
  function updateGmv(dt) {
    if (!cal.gmv) return;
    const b = map.buildings.beiz, min = NB.clock.minutes();
    if (!b) return;
    if (NB.inWindow(min, '20:00', '21:58') && b.inside.size > 3 && (gmv.t -= dt) <= 0) {
      gmv.t = NB.rr(12, 20);
      const chair = [...b.inside].find((v) => v.c.id === 'peterhans'); // the Gemeindeammann leads the meeting
      if (NB.UI.onScreen(b.top)) { const l = AGENDA[gmv.k++ % AGENDA.length]; say(b.top, (chair && /^Traktandum|^Antrag|^Applaus/.test(l) ? '🎤 Peterhans: ' : '') + l); NB.Audio.babble('Traktandum zwei Budget', chair ? chair.c.voice : 1.1, { pos: b.top, vol: 0.6 }); NB.UI.discover('gmv'); }
      if (gmv.k === 3) F.news('gmv');
    }
    for (const v of E.list) {
      if (v.kind !== 'villager') continue;
      if (v.inBuilding === b && GMV_WHO(v.c)) gmv.seen.add(v);
      else if (gmv.seen.has(v) && !v.inside && !gmv.said.has(v) && NB.inWindow(min, '21:58', '23:00')) { gmv.said.add(v); if (Math.random() < 0.6) v.later = { t: NB.rr(0.5, 3), line: NB.pick(AFTER) }; }
    }
  }
  F.gmvOn = () => cal.gmv && NB.inWindow(NB.clock.minutes(), '19:40', '22:00');

  // ---------------------------------------------------------------- fondue evenings in winter: warm windows, a guest or two
  F.fondue = null;
  function initFondue() {
    if (!cal.fondue) return;
    const r = NB.seeded(NB.clock.day * 17 + NB.clock.year), homes = new Map();
    for (const v of E.list) if (v.kind === 'villager' && !v.c.visitor && v.home && !['beiz', 'milch'].includes(v.home.id)) (homes.get(v.home) || homes.set(v.home, []).get(v.home)).push(v);
    const hosts = [...homes.keys()].sort((a, b) => a.id.localeCompare(b.id)).sort(() => r() - 0.5).slice(0, 2);
    const free = E.list.filter((v) => v.kind === 'villager' && !v.c.visitor && !['chind', 'wirtin'].includes(v.c.id) && !hosts.includes(v.home)).sort(() => r() - 0.5);
    F.fondue = hosts.map((h) => ({ host: h, residents: homes.get(h).map((v) => v.c.id), guests: cal.fondueVisits ? free.splice(0, 1 + Math.floor(r() * 2)).map((v) => v.c.id) : [] }));
  }
  F.warm = (b) => !!(F.fondue && F.fondue.some((f) => f.host === b) && NB.inWindow(NB.clock.minutes(), '18:15', '22:00'));
  // a line for a click on a building while something special goes on in there (null = the usual)
  F.buildingLine = function (b) {
    if (b.kind === 'beiz' && F.gmvOn() && b.inside.size > 2) { NB.UI.discover('gmv'); return `🗳️ Gmeiversammlig im Casino – ${b.inside.size} Lüüt. ` + NB.pick(AGENDA); }
    if (F.warm(b) && b.inside.size) {
      NB.UI.discover('fondue');
      const who = [...b.inside].map((v) => v.name).join(', ');
      return '🫕 Fondue-Plausch: ' + who + '. ' + NB.pick(['Wer s\'Brot verlüürt, zahlt e Rundi!', 'Mmh, das schmöckt bis uf d\'Strooss.', 'Mit Kirsch und Wiisswii – figugegl!', 'Vergiss s\'Grosi nöd – s\'Chruschteli am Bode!']);
    }
    return null;
  };

  // ---------------------------------------------------------------- families: parents call the kids in, cheer, see them off
  const fam = { prev: new Map(), bus: '', home: null };
  const person = (id) => E.list.find((v) => v.kind === 'villager' && v.c.id === id);
  const kidName = (line, kid) => line.replace('%k', kid.name);
  F.cheer = function (kid) { // a goal: the parents who are outside and near cheer (not every single time)
    const now = performance.now() / 1000;
    if (now - (fam.cheerAt || -99) < 25 || Math.random() < 0.35) return;
    fam.cheerAt = now;
    for (const id of kid.c.parents || []) { const p = person(id); if (p && !p.inside && !p.away && p.c.cheerKids && Math.hypot(p.x - kid.x, p.z - kid.z) < 25) p.later = { t: NB.rr(0.8, 2), line: kidName(NB.pick(p.c.cheerKids), kid) }; }
  };
  function updateFamily() {
    const min = NB.clock.minutes(), day = NB.clock.day;
    for (const kid of E.list) {
      if (kid.kind !== 'villager' || !kid.c.parents) continue;
      const was = fam.prev.get(kid); fam.prev.set(kid, kid.goalKey);
      // the kid is called in: the goal turns to home in the evening while they're out
      if (was && was !== kid.goalKey && kid.goalKey && kid.goalKey.startsWith('home') && !kid.inside && NB.inWindow(min, '16:30', '21:30')) {
        const ps = kid.c.parents.map(person).filter((p) => p && !p.away && p.c.callKids), p = ps.find((q) => !q.inside) || ps[0];
        if (!p) continue;
        const line = kidName(NB.pick(p.c.callKids), kid);
        if (p.inside) say((p.inBuilding || p.home).top, line); else p.later = { t: 0.3, line };
        if (kid.c.callReply) kid.later = { t: 2.5, line: NB.pick(kid.c.callReply) };
      }
    }
    // the school bus: mum checks the Znüni
    if (fam.bus !== day && NB.inWindow(min, '07:30', '07:45')) {
      const t = person('tanja'), kids = ['louis', 'nuria'].map(person).filter((k) => k && !k.inside && t && Math.hypot(k.x - t.x, k.z - t.z) < 12);
      if (t && !t.inside && kids.length) { fam.bus = day; talk(t, NB.pick(['Händ er eues Znüni? 🍎', 'Tschüss ihr zwei – lerned guet!', 'Louis, Jacke zue!'])); kids[0].later = { t: 2, line: NB.pick(['Tschüss Mami!', 'Jo, Mami…']) }; }
    }
    // Papi comes home from work: the kids are happy
    const a = person('andre2');
    if (a && a.c.homeLines) {
      if (a.goalKey === 'niederwil') fam.home = 'away';
      if (fam.home === 'away' && a.goalKey !== 'niederwil' && !a.inside && Math.hypot(a.x - a.home.entryPt.x, a.z - a.home.entryPt.z) < 14) {
        fam.home = 'back'; talk(a, NB.pick(a.c.homeLines));
        ['louis', 'nuria'].map(person).forEach((k, i) => { if (k && !k.inside && !k.away && Math.hypot(k.x - a.x, k.z - a.z) < 30) { k.later = { t: 1.5 + i, line: NB.pick(['Papi! 🤗', 'Papi isch da!', 'Tschuttisch mit mir?']) }; k.hop = 0.5; } });
      }
    }
  }

  // ---------------------------------------------------------------- neighbours at the Ifangweg: Iris likes to play with Nuria (help in
  // the garden or a game of tag), and she chats with Tanja or André on the lane between their houses
  const nb = (F.neighbours = { t: NB.rr(60, 150), kid: null, chat: null, chatT: NB.rr(90, 200) });
  const secs = () => performance.now() / 1000;
  const outside = (v) => v && !v.inside && !v.away && !v.toCar && !v.searching && !v.fled && !v.evading;
  function neighbourGoal(c) {
    if (nb.kid && secs() < nb.kid.until && (c.id === 'iris' || c.id === 'nuria')) return nb.kid.mode === 'garden' ? { place: 'garte', act: 'garden' } : { place: 'spielwiese', act: 'play' };
    if (nb.chat && secs() < nb.chat.until && (c.id === nb.chat.a.c.id || c.id === nb.chat.b.c.id)) return { place: 'schwatz' };
    return null;
  }
  const CHATS = {
    tanja: [
      [['iris', 'Hoi Tanja! Wie gohts de Chind?'], ['tanja', 'Guet, danke! De Louis tschuttet de ganz Tag.'], ['iris', 'Und d\'Nuria hilft mir mängisch im Garte – so härzig!'], ['tanja', 'Sie redet nur no vo dine Rose. 🌹']],
      [['tanja', 'Hoi Iris! Dini Hortensie blüehe jo wunderschön.'], ['iris', 'Die het mir dini Mami gschänkt!'], ['tanja', 'Typisch d\'Mami. 😄'], ['iris', 'Grüess si vo mir!']],
      [['iris', 'Tanja, chunnt de Joel am Wuchenänd?'], ['tanja', 'Er het gseit, er chunnt mit de Mariana und de Hünd.'], ['iris', 'Denn mach ich Züpfe für alli.']],
    ],
    andre2: [
      [['iris', 'Hoi André! Din Rase isch jo es richtigs Fuessballfäld.'], ['andre2', 'Isch es au, Iris. 😄 De Louis het scho wieder es Loch im Netz.'], ['iris', 'Pass uf mini Blueme uf!'], ['andre2', 'Versproche – ich stell mi is Goal.']],
      [['andre2', 'Iris, chönntsch mir es paar Setzling geh?'], ['iris', 'Natürlich! Tomate oder Zucchetti?'], ['andre2', 'Beides – de Louis isst alles.']],
      [['iris', 'André, de Hag zwüsche üs mues gschnitte werde.'], ['andre2', 'Am Samschtig, versproche.'], ['iris', 'Das hesch letscht Wuche au gseit. 😄']],
    ],
  };
  function updateNeighbours(dt) {
    const min = NB.clock.minutes(), iris = person('iris'), nuria = person('nuria'), now = secs();
    if (!iris) return;
    // Iris calls Nuria over (by day, when both are outside and nothing else is on)
    if (nb.kid && (now >= nb.kid.until || !NB.inWindow(min, '09:00', '18:45'))) { nb.kid = null; [iris, nuria].forEach((v) => { if (v) v.goalKey = null; }); }
    if (!nb.kid && nuria && (nb.t -= dt) <= 0) {
      nb.t = NB.rr(200, 420);
      const ok = NB.inWindow(min, '09:00', '18:00') && outside(iris) && outside(nuria) && !nb.chat && !['niederwil', 'bushalt'].includes(nuria.goalKey) && Math.hypot(iris.x - nuria.x, iris.z - nuria.z) < 70 && NB.Env.weather !== 'rain' && NB.Env.weather !== 'storm';
      if (ok && Math.random() < 0.7) {
        const mode = NB.season !== 'winter' && Math.random() < 0.5 ? 'garden' : 'play';
        nb.kid = { mode, until: now + NB.rr(180, 360) };
        talk(iris, mode === 'garden' ? NB.pick(['Nuria! Wotsch mir im Garte hälfe? 🌸', 'Nuria, chumm, mir giessed d\'Blueme!']) : NB.pick(['Nuria, chunnsch cho Fangis spiele? 😄', 'Nuria! Wotsch mit mir spiele?']));
        nuria.later = { t: 2, line: NB.pick(['Jaaa! 😊', 'Ich chume, Iris!', 'Juhui!']) };
        [iris, nuria].forEach((v) => { v.goalKey = null; });
      }
    }
    // a chat across the lane with Tanja or André
    if (nb.chat) {
      const { a, b } = nb.chat, sp = map.spots.schwatz, there = (v) => !v.path && !v.inside && sp.some((q) => Math.hypot(q.x - v.x, q.z - v.z) < 1.2);
      if (now >= nb.chat.until || !outside(a) || !outside(b)) { nb.chat = null; a.goalKey = b.goalKey = null; return; }
      if (there(a) && there(b)) {
        a.heading = Math.atan2(b.x - a.x, b.z - a.z); b.heading = Math.atan2(a.x - b.x, a.z - b.z);
        if ((nb.chat.lineT -= dt) <= 0) {
          const L = nb.chat.lines[nb.chat.i++];
          if (!L) { nb.chat.until = now + 3; return; }
          talk(L[0] === 'iris' ? (a.c.id === 'iris' ? a : b) : (a.c.id === 'iris' ? b : a), L[1]); nb.chat.lineT = 4;
        }
      }
      return;
    }
    if (!map.spots || !map.spots.schwatz || (nb.chatT -= dt) > 0) return;
    nb.chatT = NB.rr(180, 360);
    const partner = ['tanja', 'andre2'].map(person).filter((v) => outside(v) && v.act !== 'football' && v.goalKey !== 'niederwil' && Math.hypot(v.x - iris.x, v.z - iris.z) < 60)[0];
    if (!partner || !outside(iris) || nb.kid || !NB.inWindow(min, '08:00', '21:00') || Math.random() < 0.3) return;
    nb.chat = { a: iris, b: partner, until: now + 180, i: 0, lineT: 0, lines: NB.pick(CHATS[partner.c.id]) };
    iris.goalKey = partner.goalKey = null;
  }

  // ---------------------------------------------------------------- a walk on the Schänisweg: out to the bench with the view over
  // Nesselnbach, sit a while, on along the field track, then back home (the routine takes over)
  const WALKERS = [['ernst', 'regina'], ['andre', 'monika'], ['karin'], ['iris'], ['tanja', 'andre2'], ['peterhans'], ['mige'], ['silvia', 'roman'], ['nochberi']];
  const VIEW_LINES = ['Was für e Ussicht uf Nesselnbach! 😍', 'Lueg, mer gseht d\'Kapälle!', 'Do obe isch es so friedlich.', 'De schönscht Platz vom ganze Dorf.', 'Und det hinde – d\'Reuss.'];
  const BUSY = ['fest', 'silvester', 'chlaus', 'schwatz', 'spielwiese', 'home:beiz', 'maert', 'rossli', 'chaes', 'gmues'];
  const walks = [];
  let walkT = 20;
  function walkGoal(c) {
    const w = walks.find((q) => q.ids.includes(c.id));
    return w ? { place: w.stage === 'via' ? 'schaenisweg' : w.stage === 'on' ? 'feldwaeg' : 'aussicht' } : null;
  }
  function updateWalks(dt) {
    const V = map.viewpoint;
    if (!V) return;
    const min = NB.clock.minutes(), dry = !['rain', 'storm', 'snow'].includes(NB.Env.weather);
    for (let i = walks.length - 1; i >= 0; i--) {
      const w = walks[i], ms = w.ids.map(person);
      w.age += dt;
      const end = () => { walks.splice(i, 1); ms.forEach((m) => { if (m) m.goalKey = null; }); };
      if (w.age > 1500 || ms.some((m) => !m || m.away || m.searching || m.toCar)) { end(); continue; }
      const arrived = (poi) => ms.every((m) => !m.path && !m.inside && map.pois[poi] && Math.hypot(m.x - (map.pois[poi][0] + map.pois[poi][2]) / 2, m.z - (map.pois[poi][1] + map.pois[poi][3]) / 2) < 5);
      if (w.stage === 'via' && (!map.pois.schaenisweg || ms.every((m) => !m.inside && Math.hypot(m.x - (map.pois.schaenisweg[0] + 2), m.z - (map.pois.schaenisweg[1] + 2)) < 8))) { w.stage = 'out'; ms.forEach((m) => { m.goalKey = null; }); } // past the houses: on to the bench
      if (w.stage === 'out' && arrived('aussicht')) {
        w.stage = 'sit'; w.t = NB.rr(70, 160);
        talk(ms[0], NB.pick(VIEW_LINES));
        if (ms[1]) ms[1].later = { t: 3, line: NB.pick(['Ja, wunderschön.', 'Do chöme mer z\'wenig ane.', 'Gäll – und so ruhig.', '🙏']) };
        if (NB.UI.onScreen(V)) NB.UI.discover('aussicht');
      } else if (w.stage === 'sit' && (w.t -= dt) <= 0) { w.stage = map.pois.feldwaeg ? 'on' : 'done'; ms.forEach((m) => { m.goalKey = null; }); }
      else if (w.stage === 'on' && arrived('feldwaeg')) w.stage = 'done';
      if (w.stage === 'done') end();
    }
    if ((walkT -= dt) > 0) return;
    walkT = NB.rr(240, 480);
    if (walks.length >= 2 || !dry || !NB.inWindow(min, '09:00', '19:30')) return;
    const free = (m) => m && !m.away && !m.toCar && !m.searching && !m.fled && !BUSY.includes(m.goalKey) && !(nb.kid && ['iris', 'nuria'].includes(m.c.id)) && !walks.some((q) => q.ids.includes(m.c.id));
    const pool = WALKERS.filter((g) => g.every((id) => free(person(id))));
    if (!pool.length) return;
    const ids = NB.pick(pool);
    walks.push({ ids, stage: 'via', age: 0, t: 0 });
    ids.map(person).forEach((m, k) => { m.goalKey = null; if (!k && !m.inside) m.later = { t: 0.5, line: NB.pick(['Ich gang no echli go spaziere. 🚶', 'Es Ründeli am Schänisweg?', 'Chumm, mir gönd zum Bänkli.']) }; });
  }
  F.walks = walks; F.startWalk = (ids) => { walks.push({ ids, stage: 'via', age: 0, t: 0 }); ids.map(person).forEach((m) => { if (m) m.goalKey = null; }); }; // console / tests

  // ---------------------------------------------------------------- spawn + update
  F.init = function () {
    initFondue();
    if (F.fondue && NB.inWindow(NB.clock.minutes(), '18:30', '21:45')) NB.Entities.resync(); // guests already at the table
    if (cal.fest || cal.silvester || cal.neujahr) NB.Audio.prewarm(['boom', 'crackle', 'rocket', 'cheer']);
    if (cal.fasnacht) NB.Audio.prewarm(['brass', 'drum']);
    if (cal.samichlaus) NB.Audio.prewarm(['jingle', 'heehaw']);
    if (cal.raebeli) NB.Audio.prewarm(['sing']);
    if (cal.maert) NB.Audio.prewarm(['organ']);
    if (cal.easter && map.eggSpots) { const got = new Set(NB.UI.store.get(eggKey, [])); map.eggSpots.forEach((p, i) => { if (!got.has(i)) add(new Egg(p, i)); }); }
  };
  F.update = function (dt) {
    updateFest(dt); updateGugge(); updateShoppers(dt); updateJeep(dt); updateZopf(); updateFeeding();
    updateRaebeli(dt); updateChlaus(dt); updateSilvester(dt); updateMaert(dt); updateGmv(dt); updateFamily(); updateNeighbours(dt); updateWalks(dt);
  };
  Object.assign(NB.Ent, { Walker, Gugge, Egg, Shopper });
})(window.NB);
