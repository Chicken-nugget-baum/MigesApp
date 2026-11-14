// 2D overlay on top of the 3D view: speech bubbles, floating effects, hover name tag, street labels, HUD, intro.
(function (NB) {
  const U = (NB.UI = { bubbles: [], fxs: [], hover: null });
  const FONT = '"Nunito", "Segoe UI", system-ui, sans-serif';

  // world (x, y = height, z) -> screen px, or null when behind the camera
  const toScreen = (x, y, z) => NB.project(x, y, z);
  U.onScreen = function (e, margin) {
    const p = NB.project && NB.project(e.x, 0, e.z);
    if (!p) return false;
    const m = margin || 60, v = NB.view;
    return p[0] > -m && p[1] > -m && p[0] < v.w + m && p[1] < v.h + m;
  };

  // owner: entity with top() or a plain {x, y, z}
  U.say = function (owner, text, o) {
    o = o || {};
    U.bubbles = U.bubbles.filter((b) => b.owner !== owner);
    if (o.quiet && U.bubbles.length > 6) return;
    U.bubbles.push({ owner, text, t: 0, life: o.life || NB.clamp(1.8 + text.length * 0.07, 2.5, 6) });
  };
  // kind: heart | note | dust | ripple | fish | angry | steam | smoke | fire | water
  U.fx = function (x, y, z, kind, o) {
    o = o || {};
    U.fxs.push({ x, y, z, kind, vy: o.vy || 0.8, life: o.life || 1.2, t: 0, wob: Math.random() * 6, size: o.size || 1 });
  };

  U.update = function (dt) {
    U.bubbles.forEach((b) => (b.t += dt));
    U.bubbles = U.bubbles.filter((b) => b.t < b.life && !b.owner.inside && !b.owner.done);
    U.fxs.forEach((f) => { f.t += dt; f.y += f.vy * dt; });
    U.fxs = U.fxs.filter((f) => f.t < f.life);
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = NB.Env.icon() + ' ' + NB.clock.label();
  };

  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function tag(ctx, text, sx, sy) {
    ctx.font = '600 13px ' + FONT;
    const w = Math.ceil(ctx.measureText(text).width) + 14;
    ctx.fillStyle = 'rgba(40,32,48,0.85)'; roundRect(ctx, sx - w / 2, sy - 22, w, 20, 10); ctx.fill();
    ctx.fillStyle = '#fff6dc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, sx, sy - 12);
  }

  U.draw = function (ctx) {
    const v = NB.view;
    ctx.clearRect(0, 0, v.w, v.h);
    ctx.save();
    // street names on the ground
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of NB.map.labels) {
      const p = toScreen(l.at[0], 0.2, l.at[1]);
      if (!p) continue;
      const size = NB.clamp(Math.round(900 / v.dist), 11, 22);
      ctx.font = `800 ${size}px ${FONT}`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,32,48,0.6)'; ctx.strokeText(l.text, p[0], p[1]);
      ctx.fillStyle = '#ffffff'; ctx.fillText(l.text, p[0], p[1]);
    }
    // floating effects
    for (const f of U.fxs) {
      const p = toScreen(f.x + Math.sin(f.t * 4 + f.wob) * 0.1, f.y, f.z);
      if (!p) continue;
      const a = NB.clamp(1 - f.t / f.life, 0, 1);
      ctx.globalAlpha = a;
      if (f.kind === 'dust') { ctx.fillStyle = '#f3e6cc'; ctx.beginPath(); ctx.arc(p[0], p[1], 4 + f.t * 10, 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'steam') { ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#eef0f4'; ctx.beginPath(); ctx.arc(p[0], p[1], (2 + f.t * 3) * NB.view.zoom, 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'smoke') { ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#3a3538'; ctx.beginPath(); ctx.arc(p[0], p[1], (3 + f.t * 4) * f.size * NB.view.zoom, 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'fire') { // flickering flame: orange blob with a yellow core
        const r = (3 + Math.sin(f.t * 30 + f.wob) * 0.8) * (0.6 + f.size) * NB.view.zoom * (1 - f.t / f.life * 0.5);
        ctx.globalAlpha = a; ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(p[0], p[1] + r * 0.2, r * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      else if (f.kind === 'water') { ctx.fillStyle = '#8fd0ff'; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.2, NB.view.zoom * 0.7), 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'ripple') { // expanding ring on the water
        const rx = (2 + f.t * 9) * NB.view.zoom; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(p[0], p[1], rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'fish' || f.kind === 'angry') { ctx.font = '22px ' + FONT; ctx.fillText(f.kind === 'fish' ? '🐟' : '💢', p[0], p[1]); }
      else { ctx.font = '20px ' + FONT; ctx.fillStyle = f.kind === 'heart' ? '#ff4f7a' : '#fff6c0'; ctx.fillText(f.kind === 'heart' ? '❤' : '♪', p[0], p[1]); }
    }
    ctx.globalAlpha = 1;
    // fishing rods: from the hand to a tip over the water, line down to a bobbing float
    const now = performance.now() / 1000;
    for (const e of NB.Entities.list) {
      const f = e.fishing;
      if (!f || e.inside) continue;
      const hand = toScreen(e.x, 1.2, e.z), bobY = 0.05 + Math.sin(now * 2.5 + e.x) * 0.05 - (f.bite > 0 ? 0.25 : 0);
      const fl = toScreen(f.bx, bobY, f.bz);
      const tip = [hand[0] + (fl[0] - hand[0]) * 0.5, hand[1] + (fl[1] - hand[1]) * 0.5 - 12 * v.zoom];
      ctx.lineWidth = Math.max(1.5, v.zoom * 0.8); ctx.strokeStyle = '#5a3d22'; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(fl[0], fl[1]); ctx.stroke();
      ctx.fillStyle = '#e8463a'; ctx.beginPath(); ctx.arc(fl[0], fl[1], Math.max(2, v.zoom), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(fl[0], fl[1] - Math.max(1, v.zoom * 0.6), Math.max(1, v.zoom * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    // leashes: from the owner's hand to the dog's collar, sagging a little when slack
    for (const e of NB.Entities.list) {
      if (e.kind !== 'dog' || !e.a.leash || e.away || e.owner.inside || e.owner.away) continue;
      const o = e.owner, d = Math.hypot(e.x - o.x, e.z - o.z);
      if (d > 7) continue;
      const k = d > 0.01 ? 0.3 / d : 0, h = toScreen(o.x + (e.x - o.x) * k, 0.85 + (o.hopY ? o.hopY() : 0), o.z + (e.z - o.z) * k), c = toScreen(e.x, 0.75 + (e.hopY || 0), e.z);
      if (!h || !c) continue;
      const sag = Math.max(0, 3 - d) * 2.5 * v.zoom;
      ctx.lineWidth = Math.max(1, v.zoom * 0.6); ctx.strokeStyle = e.a.leash;
      ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.quadraticCurveTo((h[0] + c[0]) / 2, (h[1] + c[1]) / 2 + sag, c[0], c[1]); ctx.stroke();
    }
    // boule: balls lying on the court, the cochonnet ("Säuli"), a ball in the air
    const bg = NB.map.bouleGame;
    if (bg) {
      const br = Math.max(1.6, v.zoom * 1.0);
      const ball = (x, y, z, col, r) => {
        const p = toScreen(x, y, z); if (!p) return;
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(30,25,40,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1] - r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(Math.round(p[0] - r * 0.5), Math.round(p[1] - r * 1.6), Math.max(1, Math.round(r * 0.5)), Math.max(1, Math.round(r * 0.5)));
      };
      if (bg.coch) ball(bg.coch.x, 0, bg.coch.z, '#f0a030', br * 0.6);
      for (const b of bg.balls) ball(b.x, 0, b.z, b.col, br);
      const fl = bg.fly;
      if (fl) { const t = Math.min(1, fl.t); ball(fl.x0 + (fl.x1 - fl.x0) * t, 1.1 * (1 - t) + fl.h * Math.sin(Math.PI * t), fl.z0 + (fl.z1 - fl.z0) * t, fl.coch ? '#f0a030' : fl.col, fl.coch ? br * 0.6 : br); }
    }
    // firefighters' water jets: arc from the nozzle to the target, a few droplets
    for (const e of NB.Entities.list) {
      const sp = e.spray;
      if (!sp) continue;
      const a0 = toScreen(e.x, 1.3, e.z), a1 = toScreen(sp.x, sp.y, sp.z);
      const mx = (a0[0] + a1[0]) / 2, my = Math.min(a0[1], a1[1]) - 30 * v.zoom;
      ctx.lineWidth = Math.max(2, v.zoom * 1.2); ctx.strokeStyle = 'rgba(170,215,255,0.9)';
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(mx, my, a1[0], a1[1]); ctx.stroke();
      ctx.fillStyle = 'rgba(200,230,255,0.9)';
      for (let k = 0; k < 3; k++) { const t = ((now * 1.7 + k / 3 + e.x) % 1), ix = (1 - t) * (1 - t) * a0[0] + 2 * (1 - t) * t * mx + t * t * a1[0], iy = (1 - t) * (1 - t) * a0[1] + 2 * (1 - t) * t * my + t * t * a1[1]; ctx.beginPath(); ctx.arc(ix, iy + Math.sin(k * 2.1 + now * 5) * 2, Math.max(1, v.zoom * 0.7), 0, Math.PI * 2); ctx.fill(); }
    }
    // the crew leader keeps a name tag while fighting the fire (so you can spot Raphy)
    for (const e of NB.Entities.list) if (e.kind === 'firefighter' && e.d && e.d.lead && e.state !== 'back' && !U.bubbles.some((b) => b.owner === e)) { const t = e.top(), p = toScreen(t.x, t.y, t.z); tag(ctx, '🚒 ' + e.name, p[0], p[1]); }
    // hover name
    const h = U.hover;
    if (h && !U.bubbles.some((b) => b.owner === h.owner)) {
      const top = h.owner.top ? h.owner.top() : h.owner;
      const p = toScreen(top.x, top.y, top.z);
      if (p) tag(ctx, h.name, p[0], p[1]);
    }
    // speech bubbles
    ctx.font = '600 15px ' + FONT;
    for (const b of U.bubbles) {
      const top = b.owner.top ? b.owner.top() : b.owner;
      const p = toScreen(top.x, top.y, top.z);
      if (!p) continue;
      const lines = wrap(ctx, b.text, 210);
      const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 22;
      const hgt = lines.length * 19 + 14;
      const pop = Math.min(1, b.t * 8), fade = NB.clamp((b.life - b.t) * 3, 0, 1);
      const sx = NB.clamp(p[0], w / 2 + 6, v.w - w / 2 - 6), sy = NB.clamp(p[1] - 6, hgt + 10, v.h - 6);
      ctx.globalAlpha = fade;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(pop, pop);
      ctx.shadowColor = 'rgba(40,30,50,0.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#fffdf6';
      roundRect(ctx, -w / 2, -hgt, w, hgt, 12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(0, 9); ctx.lineTo(7, -1); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#3b2b33'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, 0, -hgt + 16 + i * 19));
      ctx.restore();
    }
    ctx.restore();
  };

  // ---------- DOM HUD ----------
  U.initDom = function (actions) {
    const muteBtn = document.getElementById('mute');
    const setMuteLabel = () => { muteBtn.textContent = NB.Audio.muted ? '🔇' : '🔊'; muteBtn.title = NB.Audio.muted ? 'Ton aa' : 'Ton us'; };
    setMuteLabel();
    muteBtn.addEventListener('click', () => { NB.Audio.unlock(); NB.Audio.setMuted(!NB.Audio.muted); setMuteLabel(); });
    document.getElementById('centre').addEventListener('click', actions.centre);
    document.getElementById('findcat').addEventListener('click', () => { NB.Audio.unlock(); actions.findCat(); });
    document.getElementById('zoomin').addEventListener('click', () => actions.zoom(0.8));
    document.getElementById('zoomout').addEventListener('click', () => actions.zoom(1.25));
    const intro = document.getElementById('intro');
    if (NB.params.get('nointro')) intro.remove();
    else document.getElementById('enter').addEventListener('click', () => {
      NB.Audio.unlock();
      intro.classList.add('gone');
      setTimeout(() => intro.remove(), 600);
      setTimeout(() => NB.Audio.horn(), 500);
    });
  };
})(window.NB);
