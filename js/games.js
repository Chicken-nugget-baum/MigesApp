// Small games inside the village: "Wo isch…?" (find someone against the clock), feeding the ducks (tap the pond),
// a boule duel against André (tap the court), and one small quest a day ("Bring de Mige es Bier vom Casino").
// main.js passes taps to NB.Games.tap(hit, worldPoint) first; NB.UI.draw calls NB.Games.draw(ctx).
(function (NB) {
  const G = (NB.Games = {});
  const L = () => NB.Entities.list;
  const byId = (id) => L().find((e) => e.c && e.c.id === id);
  const byName = (n) => L().find((e) => e.name === n);
  const store = () => NB.UI.store;
  const banner = (html) => { const el = document.getElementById('game'); if (!el) return; el.innerHTML = html || ''; el.classList.toggle('hidden', !html); };
  const sayAt = (who, l, o) => { NB.UI.say(who, l, o); if (who.c) NB.Audio.babble(l, who.c.voice || 1, { pos: who }); };

  // ---------------------------------------------------------------- "Wo isch…?"
  const TARGETS = [['Manolo', 'de Manolo'], ['Morgan', 'de Morgan'], ['Kuba', 'de Kuba'], ['Luna', "d'Luna"], ['Mina', "d'Mina"], ['Karin', "d'Karin"], ['Mige', "d'Mige"], ['Joel', 'de Joel'], ['Mariana', "d'Mariana"], ['Iris', "d'Iris"], ['De Hirschbuur', 'de Hirschbuur'], ['Raphy Naef', 'de Raphy'], ['De Platzhirsch', 'de Platzhirsch'], ['Erpel Edi', 'de Erpel Edi']];
  let hunt = null;
  G.startSearch = function () {
    if (hunt) { hunt = null; banner(''); return; }
    const ok = TARGETS.filter(([n]) => { const e = byName(n); return e && e.visible && !e.inside && !e.away; });
    if (!ok.length) return;
    const [n, label] = NB.pick(ok);
    hunt = { e: byName(n), label, t: 0, max: 90 };
    NB.Audio.play('chime');
  };
  function updateSearch(dt) {
    if (!hunt) return;
    hunt.t += dt;
    const left = Math.max(0, hunt.max - hunt.t), best = store().get('searchBest', null);
    banner(`🔍 Wo isch ${hunt.label}? <b>${Math.ceil(left)} s</b>${best ? ` · Rekord ${best} s` : ''} <button id="gameX" title="Ufhöre">×</button>`);
    const x = document.getElementById('gameX'); if (x) x.onclick = () => { hunt = null; banner(''); };
    if (left <= 0 || hunt.e.done) { NB.UI.say({ x: NB.view.cx, y: 2, z: NB.view.cy }, `Ziit um! ${hunt.label[0].toUpperCase() + hunt.label.slice(1)} isch dörte gsi. 😅`, { life: 3 }); NB.follow(hunt.e); hunt = null; banner(''); }
  }
  function foundTarget(e) {
    if (!hunt || e !== hunt.e) return false;
    const s = Math.round(hunt.t), best = store().get('searchBest', null);
    if (!best || s < best) store().set('searchBest', s);
    NB.UI.say(e, `🎉 Gfunde in ${s} s!${!best || s < best ? ' Neue Rekord!' : ''}`, { life: 3 });
    NB.Audio.play('chime'); NB.UI.fx(e.x, 2, e.z, 'heart', { vy: 1, life: 1.5 });
    NB.UI.discover('search'); hunt = null; banner('');
    return false; // the click still does its normal thing
  }

  // ---------------------------------------------------------------- feeding the ducks
  function feedDucks(p) {
    for (let k = 0; k < 8; k++) NB.UI.fx(p.x + NB.rr(-0.8, 0.8), 1.5, p.z + NB.rr(-0.8, 0.8), 'crumb', { vy: -1.6, life: 0.9 });
    setTimeout(() => NB.UI.fx(p.x, 0.02, p.z, 'ripple', { vy: 0, life: 1.4 }), 800);
    const ducks = L().filter((d) => d.kind === 'duck' && Math.hypot(d.x - p.x, d.z - p.z) < 70);
    ducks.forEach((d, i) => setTimeout(() => d.feed && d.feed(p.x, p.z), i * 250));
    if (ducks.length) { NB.UI.discover('ducks'); NB.UI.say({ x: p.x, y: 1.2, z: p.z }, NB.pick(['🍞 Brotbrösmeli für d\'Ente!', 'Quack-quack – Znüni!', '🦆🦆🦆']), { life: 2 }); }
    NB.Audio.play('splash', { pos: p, vol: 0.4 });
  }

  // ---------------------------------------------------------------- boule duel against André
  let duel = null;
  const K = () => NB.map.kochProps;
  const courtPt = (a, c) => { const k = K(), T = k.dir, N = [T[1], -T[0]]; return { x: k.throwPt.x + T[0] * a + N[0] * c, z: k.throwPt.z + T[1] * a + N[1] * c }; };
  const local = (p) => { const k = K(), T = k.dir, N = [T[1], -T[0]], dx = p.x - k.throwPt.x, dz = p.z - k.throwPt.z; return [dx * T[0] + dz * T[1], dx * N[0] + dz * N[1]]; };
  const inCourt = (p) => { const [a, c] = local(p), k = K(); return a > 1 && a < k.court.len && Math.abs(c) < k.court.wid / 2 + 0.5; };
  function startDuel() {
    const a = byId('andre');
    if (!K() || !a || a.inside || a.away) return false;
    const g = NB.map.bouleGame || (NB.map.bouleGame = { coch: null, balls: [], fly: null, wait: 2 });
    g.balls = []; g.fly = null; g.duel = true;
    duel = { turn: 'andre', mine: 0, his: 0, wait: 1.5, a };
    const c = courtPt(NB.rr(6, 9), NB.rr(-0.7, 0.7)); g.coch = c;
    sayAt(a, NB.pick(['E Duell? Gärn! Ich wirf s\'Säuli scho. 🎯', 'Du gäge mich? Hopp, los gaht\'s!']));
    return true;
  }
  function throwBall(from, to, col, who) {
    const g = NB.map.bouleGame;
    g.fly = { x0: from.x, z0: from.z, x1: to.x, z1: to.z, t: 0, dur: 1.2, h: 2.2, col, who };
  }
  function updateDuel(dt) {
    if (!duel) return;
    const g = NB.map.bouleGame, a = duel.a;
    if (a.inside || a.away) { duel = null; g.duel = false; banner(''); return; }
    a.heading = K().throwFace;
    if (g.fly) {
      g.fly.t += dt / g.fly.dur;
      if (g.fly.t < 1) return;
      const f = g.fly; g.fly = null;
      const hit = g.balls.some((b) => Math.hypot(b.x - f.x1, b.z - f.z1) < 0.5);
      g.balls.push({ x: f.x1, z: f.z1, col: f.col, who: f.who });
      NB.Audio.play(hit ? 'clink' : 'click', { pos: { x: f.x1, z: f.z1 }, vol: hit ? 0.7 : 0.3, rate: hit ? 1 : 0.6 });
      duel.turn = duel.mine >= 3 && duel.his >= 3 ? 'count' : f.who === 'me' ? (duel.his < 3 ? 'andre' : 'me') : duel.mine < 3 ? 'me' : 'andre';
      duel.wait = 1.2;
    }
    const left = `Du: ${3 - duel.mine} · André: ${3 - duel.his}`;
    if (duel.turn === 'me') banner(`🎯 Boule gäge de André – <b>tipp uf d'Bahn</b>, wo dini Kugle söll lande. (${left}) <button id="gameX">×</button>`);
    else banner(`🎯 Boule gäge de André… (${left}) <button id="gameX">×</button>`);
    const x = document.getElementById('gameX'); if (x) x.onclick = () => { duel = null; g.duel = false; g.balls = []; g.coch = null; banner(''); };
    if ((duel.wait -= dt) > 0) return;
    if (duel.turn === 'andre') {
      const [ca, cc] = local(g.coch), sp = Math.random() < 0.5 ? 0.35 : 1.3;
      throwBall({ x: a.x, z: a.z }, courtPt(ca + NB.rr(-sp, sp), cc + NB.rr(-sp, sp)), '#b08d57', 'andre'); duel.his++; a.hop = 0.2;
    } else if (duel.turn === 'count') {
      const d = (b) => Math.hypot(b.x - g.coch.x, b.z - g.coch.z), best = g.balls.slice().sort((p, q) => d(p) - d(q))[0];
      if (best.who === 'me') { sayAt(a, NB.pick(['Was?! Du hesch gwunne! Revanche! 😤', 'Guet gspielt… das nöchscht Mol nöd.'])); NB.UI.discover('boule'); NB.Audio.play('chime'); }
      else sayAt(a, NB.pick(['Jo, jo – Erfahrig zahlt sich us. 😎', 'Gwunne! Aber knapp.', 'Bronze gwünnt – wie immer.']));
      duel = null; banner('');
      setTimeout(() => { g.balls = []; g.coch = null; g.duel = false; }, 6000);
    }
  }
  function myThrow(p) {
    const k = K(), from = courtPt(0.4, -0.6), e = 0.8;
    const [a, c] = local({ x: p.x + NB.rr(-e, e), z: p.z + NB.rr(-e, e) });
    throwBall(from, courtPt(NB.clamp(a, 2, k.court.len - 1), NB.clamp(c, -k.court.wid / 2 + 0.25, k.court.wid / 2 - 0.25)), '#c9ccd6', 'me');
    duel.mine++; duel.turn = 'wait';
  }

  // ---------------------------------------------------------------- one small quest a day
  const QUESTS = [
    { giver: 'mige', ask: 'Du, chönntsch mer es Bier vom Casino bringe? 🍺', item: '🍺', src: (h) => h.building && h.building.kind === 'beiz', srcLine: 'Es Bier für d\'Mige? Bitte schön! 🍺', to: 'mige', thanks: 'Merci viel mal! Prost! 🍺', text: "Bring de Mige es Bier vom Casino" },
    { giver: 'iris', ask: "Bringsch mer e Hortensie vo de Monika? D'Blaue sind so schön. 🌸", item: '🌸', src: (h) => h.info && h.info.name === 'Hortensie', srcLine: 'E blaui Hortensie – d\'Monika wird\'s verchrafte. 🌸', to: 'iris', thanks: 'Wunderschön! Merci viel mal! 🌸', text: "Bring de Iris e Hortensie vo de Monika" },
    { giver: 'karin', ask: 'De Kuba hätt so gärn es Guetzli vo de Iris… 🍪', item: '🍪', src: (h) => h.entity && h.entity.c && h.entity.c.id === 'iris', srcLine: 'Es Guetzli für de Kuba? Natürlich! 🍪', to: 'kuba', thanks: 'WUFF! WUFF! 🍪', text: 'Hol bi de Iris es Guetzli für de Kuba' },
    { giver: 'reto', ask: 'Bringsch de Monika es Stuck Chäs vo üsere Milchzentrale? 🧀', item: '🧀', src: (h) => h.building && h.building.kind === 'dairy', srcLine: 'Es Stuck Bergchäs – mit Gruess vo de Gehrigs! 🧀', to: 'monika', thanks: 'Oh, Chäs vo de Gehrigs! Merci vielmol! 🧀', text: 'Bring de Monika Chäs vo de Milchzentrale' },
    { giver: 'andre', ask: 'Hol mer doch es Bier im Casino – ich mues d\'Boule-Bahn räche. 🍺', item: '🍺', src: (h) => h.building && h.building.kind === 'beiz', srcLine: 'Es Bier für de André? Do häsch. 🍺', to: 'andre', thanks: 'Merci! Jetzt spielt sich\'s besser. 🍺', text: 'Bring em André es Bier vom Casino' },
    { giver: 'hirschbuur', ask: 'Chönntsch de Iris en Kürbis vo mim Stand bringe? 🎃', item: '🎃', src: (h) => h.info && h.info.name === 'Hirschfarm', srcLine: 'En schöne Kürbis – für d\'Iris. 🎃', to: 'iris', thanks: 'En Kürbis vom Hirschbuur! Do gits Suppe. 🎃', text: 'Bring de Iris en Kürbis vo de Hirschfarm' },
  ];
  const day = NB.clock.year + '-' + NB.clock.month + '-' + NB.clock.date;
  const quest = QUESTS[Math.floor(NB.seeded(NB.clock.day * 13 + NB.clock.year)() * QUESTS.length)];
  let qs = null; // { day, step: 0 not offered | 1 accepted | 2 carrying | 3 done }
  const loadQ = () => qs || (qs = (store().get('quest', {}).day === day ? store().get('quest', {}) : { day, step: 0 }));
  const saveQ = () => store().set('quest', qs);
  function questTap(h) {
    loadQ();
    const e = h.entity, id = e && (e.c ? e.c.id : e.name === 'Kuba' ? 'kuba' : null);
    if (qs.step === 0 && id === quest.giver) { sayAt(e, quest.ask); qs.step = 1; saveQ(); return true; }
    if (qs.step === 1 && quest.src(h)) { NB.UI.say(h.entity || h.info && h.info.top || h.building.top, quest.srcLine, { life: 3 }); NB.Audio.play('pop'); qs.step = 2; saveQ(); return true; }
    if (qs.step === 2 && id === quest.to) {
      NB.UI.say(e, quest.thanks, { life: 3 }); if (e.c) NB.Audio.babble(quest.thanks, e.c.voice || 1, { pos: e }); else NB.Audio.play('bark', { pos: e });
      NB.UI.fx(e.x, 2.2, e.z, 'heart', { vy: 1, life: 1.5 }); NB.Audio.play('chime'); qs.step = 3; saveQ(); NB.UI.discover('quest');
      const n = store().get('questsDone', 0) + 1; store().set('questsDone', n);
      return true;
    }
    return false;
  }
  function questHud() {
    const el = document.getElementById('quest'); if (!el) return;
    loadQ();
    const giver = byId(quest.giver);
    const txt = qs.step === 0 ? (giver ? `📜 ${giver.name} bruucht Hilf – chlick si/ihn aa.` : '') : qs.step === 1 ? `📜 ${quest.text}` : qs.step === 2 ? `📜 ${quest.text} – ${quest.item} debii!` : '📜 Hüt erledigt ✓';
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('hidden', !txt);
  }

  // ---------------------------------------------------------------- hooks from main.js / ui.js
  // h: pick result (or null), p: the world point under the tap. Return true = the tap is used up.
  G.tap = function (h, p) {
    if (duel && duel.turn === 'me' && p && inCourt(p)) { myThrow(p); return true; }
    if (h && h.info && h.info.name === 'Boule-Bahn' && !duel && startDuel()) return true;
    if (h && h.entity) foundTarget(h.entity);
    if (h && questTap(h)) return true;
    if (!h && p && NB.map.pondDist(p.x, p.z) < -0.5) { feedDucks(p); return true; }
    return false;
  };
  let hudT = 0;
  G.update = function (dt) { updateSearch(dt); updateDuel(dt); if ((hudT -= dt) <= 0) { hudT = 0.5; questHud(); } };
  G.active = () => !!duel;
  // an arrow at the edge of the screen towards the search target (after 25 s)
  G.draw = function (ctx) {
    if (!hunt || hunt.t < 25) return;
    const v = NB.view, p = NB.project(hunt.e.x, 1, hunt.e.z);
    if (!p || (p[0] > 30 && p[1] > 60 && p[0] < v.w - 30 && p[1] < v.h - 30)) return;
    const cx = v.w / 2, cy = v.h / 2, a = Math.atan2(p[1] - cy, p[0] - cx), r = Math.min(v.w, v.h) / 2 - 40;
    ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a);
    ctx.fillStyle = 'rgba(192,57,43,0.9)'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
})(window.NB);
