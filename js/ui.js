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
  // kind: heart | note | dust
  U.fx = function (x, y, z, kind, o) {
    o = o || {};
    U.fxs.push({ x, y, z, kind, vy: o.vy || 0.8, life: o.life || 1.2, t: 0, wob: Math.random() * 6 });
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
      else { ctx.font = '20px ' + FONT; ctx.fillStyle = f.kind === 'heart' ? '#ff4f7a' : '#fff6c0'; ctx.fillText(f.kind === 'heart' ? '❤' : '♪', p[0], p[1]); }
    }
    ctx.globalAlpha = 1;
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
