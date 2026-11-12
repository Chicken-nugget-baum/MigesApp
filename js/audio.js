// Sounds, synthesized with ZzFX (vendor/zzfx.js, from the zzfx npm package). No audio files.
// ZzFX params: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
//   pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
(function (NB) {
  const Z = window.ZZFX;
  const A = (NB.Audio = { muted: false, ok: !!Z });
  try { A.muted = localStorage.getItem('nb-muted') === '1'; } catch (e) { /* storage blocked */ }

  const SFX = {
    meow: [0.9, 0.08, 560, 0.03, 0.12, 0.22, 0, 1.8, 6, -0.6, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.05, 0, 1400],
    mrr: [0.7, 0.05, 180, 0.02, 0.1, 0.12, 1, 1, 2, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.7, 0.03, 0.5],
    bell: [0.8, 0, 392, 0.005, 0.25, 2.6, 0, 1, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0.4, 0.3],
    bellHi: [0.3, 0, 988, 0.005, 0.1, 1.6, 0, 1, 0, 0, 0, 0, 0, 0, 0.4, 0, 0, 0.3, 0.2],
    moo: [1, 0.05, 150, 0.12, 0.7, 0.35, 2, 1, -0.5, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.9, 0.1, 0.1, 500],
    cluck: [0.45, 0.15, 650, 0, 0.02, 0.05, 2, 1, -10, 0, 0, 0, 0.07, 0, 0, 0, 0, 0.8, 0, 0, 1800],
    quack: [0.7, 0.1, 420, 0, 0.07, 0.08, 2, 1, -6, 0, 0, 0, 0, 0.4, 0, 0.1, 0, 0.8, 0.02, 0, 1200],
    splash: [0.6, 0.1, 900, 0, 0.06, 0.4, 4, 1, -2, 0, 0, 0, 0, 2, 0, 0, 0, 0.6, 0.1],
    clink: [0.5, 0, 2100, 0, 0.01, 0.35, 0, 1, 0, 0, 900, 0.03, 0, 0, 0, 0, 0, 0.4],
    whistle: [0.5, 0, 920, 0.04, 0.45, 0.15, 0, 1, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0.9, 0, 0.15],
    click: [0.35, 0, 1300, 0, 0, 0.02, 1],
    door: [0.5, 0.05, 160, 0, 0.04, 0.12, 1, 1, 0, 0, 0, 0, 0.05, 0.6],
    pop: [0.35, 0, 700, 0, 0.02, 0.07, 0, 1, 14],
    honk: [0.4, 0, 340, 0.01, 0.18, 0.05, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1600],
    engine: [0.35, 0.05, 55, 0.05, 0.6, 0.2, 2, 1, 0, 0, 0, 0, 0.04, 1, 0, 0, 0, 0.8, 0, 0.6, 400],
    chirp: [0.12, 0.3, 2600, 0.01, 0.03, 0.06, 0, 1, 30, 0, 0, 0, 0.05],
    cricket: [0.05, 0.1, 4200, 0, 0.12, 0.02, 0, 1, 0, 0, 0, 0, 0.02, 0, 0, 0, 0, 1, 0, 1],
    fire: [0.4, 0.2, 90, 0.05, 0.4, 0.25, 4, 1, 0, 0, 0, 0, 0.06, 2.5, 0, 0, 0, 0.7, 0.05, 0.4, 900],
    siren1: [0.5, 0, 620, 0.02, 0.45, 0.08, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 2400],
    siren2: [0.5, 0, 465, 0.02, 0.45, 0.08, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 2400],
    spray: [0.25, 0.1, 3000, 0.02, 0.25, 0.15, 4, 1, 0, 0, 0, 0, 0, 1.5, 0, 0, 0, 0.6, 0.05],
  };

  // volume/pan from a world position relative to the camera
  function spatial(pos) {
    if (!pos || !NB.view) return { vol: 1, pan: 0 };
    const v = NB.view, cx = v.cx, cy = v.cy, half = v.halfW || 300;
    const pz = pos.z != null ? pos.z : pos.y;
    const dx = pos.x - cx, dy = pz - cy, d = Math.hypot(dx, dy);
    return { vol: NB.clamp(1.2 - d / (half * 2.2), 0, 1), pan: NB.clamp(dx / (half * 1.5), -0.8, 0.8) };
  }

  A.unlock = function () {
    if (Z && Z.audioContext.state !== 'running') Z.audioContext.resume();
  };
  A.setMuted = function (m) {
    A.muted = m;
    try { localStorage.setItem('nb-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (m) A.stopAll();
  };

  // play(name, {pos, rate, vol}) -> source or null
  A.play = function (name, o) {
    o = o || {};
    if (!Z || A.muted || Z.audioContext.state !== 'running') return null;
    const p = SFX[name];
    if (!p) return null;
    const s = spatial(o.pos);
    const vol = (o.vol == null ? 1 : o.vol) * s.vol;
    if (vol < 0.03) return null;
    try {
      return Z.playSamples([Z.buildSamples(...p)], vol, o.rate || 1, s.pan, !!o.loop);
    } catch (e) { return null; }
  };

  // Realistic purr: brown-ish noise, low-passed, pulsed at ~25 Hz (laryngeal twitches),
  // shaped by a breathing cycle (louder exhale, softer & slightly faster inhale). Loops seamlessly.
  let purrBuf = null;
  function purrSamples() {
    if (purrBuf) return purrBuf;
    const sr = Z.sampleRate, cycle = 2.4, n = Math.round(sr * cycle);
    const out = new Float32Array(n);
    let lp1 = 0, lp2 = 0, brown = 0, phase = 0;
    const rnd = NB.seeded(77);
    for (let i = 0; i < n; i++) {
      const t = i / sr, c = t / cycle;
      // breath: exhale 0..0.55, pause, inhale 0.62..0.95, pause
      const exhale = c < 0.55 ? Math.sin((c / 0.55) * Math.PI) : 0;
      const inhale = c > 0.62 && c < 0.95 ? Math.sin(((c - 0.62) / 0.33) * Math.PI) : 0;
      const breath = Math.pow(exhale, 0.6) * 1.0 + Math.pow(inhale, 0.6) * 0.6;
      const rate = inhale > 0 ? 27 : 23; // pulses per second
      phase += rate / sr;
      const p = phase % 1;
      const pulse = Math.pow(Math.max(0, Math.sin(p * Math.PI)), 6); // short soft thumps
      brown = (brown + (rnd() * 2 - 1) * 0.08) * 0.985;
      const raw = brown + (rnd() * 2 - 1) * 0.08;
      lp1 += (raw - lp1) * 0.06; // ~420 Hz
      lp2 += (lp1 - lp2) * 0.06;
      out[i] = lp2 * pulse * breath * 7;
    }
    // 30 ms fade at the loop seam
    const f = Math.round(sr * 0.03);
    for (let i = 0; i < f; i++) { out[i] *= i / f; out[n - 1 - i] *= i / f; }
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (let i = 0; i < n; i++) out[i] = (out[i] / (peak || 1)) * 0.9;
    return (purrBuf = out);
  }

  // looping sound with stop(); used for purring
  const loops = new Set();
  A.loop = function (name, o) {
    let src = null;
    if (name === 'purr') {
      if (Z && !A.muted && Z.audioContext.state === 'running') {
        const s = spatial(o && o.pos);
        try { src = Z.playSamples([purrSamples()], 2.2 * Math.max(0.15, s.vol), 1, s.pan, true); } catch (e) { src = null; }
      }
    } else src = A.play(name, Object.assign({}, o, { loop: true }));
    if (!src) return { stop() {}, setVol() {} };
    const h = {
      stop() { try { src.gainNode.gain.setTargetAtTime(0, Z.audioContext.currentTime, 0.08); src.stop(Z.audioContext.currentTime + 0.4); } catch (e) { /* ended */ } loops.delete(h); },
      setVol(v) { try { src.gainNode.gain.value = Z.volume * v; } catch (e) { /* ignore */ } },
    };
    loops.add(h);
    return h;
  };
  A.stopAll = function () { [...loops].forEach((h) => h.stop()); };

  // Animal-Crossing-like babble: one blip per syllable, pitch from the character's voice
  A.babble = function (text, voice, o) {
    o = o || {};
    if (!Z || A.muted) return;
    const n = NB.clamp(Math.round(text.replace(/[^a-zäöü]/gi, '').length / 3), 2, 14);
    const base = 210 * (voice || 1);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (A.muted || Z.audioContext.state !== 'running') return;
        const s = spatial(o.pos);
        const vol = 0.35 * (o.vol || 1) * s.vol;
        if (vol < 0.03) return;
        const f = base * NB.rr(0.85, 1.25);
        try { Z.playSamples([Z.buildSamples(1, 0.05, f, 0.005, 0.035, 0.04, 1, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8)], vol, 1, s.pan); } catch (e) { /* ignore */ }
      }, i * 75);
    }
  };

  // Postauto three-tone horn: C# - E - A ("Dü-da-do")
  A.horn = function (o) {
    [277.2, 329.6, 440].forEach((f, i) => setTimeout(() => {
      if (A.muted || !Z || Z.audioContext.state !== 'running') return;
      const s = spatial(o && o.pos);
      if (s.vol < 0.03) return;
      try { Z.playSamples([Z.buildSamples(0.9, 0, f, 0.02, i === 2 ? 0.45 : 0.22, 0.08, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 1800)], 0.6 * s.vol, 1, s.pan); } catch (e) { /* ignore */ }
    }, i * 300));
  };

  // ---- chapel bell: a real toll (assets/sounds/bell.mp3, CC0, see assets/sounds/README.md); if the file can't be
  // loaded (file://, offline) an additive synthesized bell (hum, prime, tierce, quint, nominal partials) is used.
  let bellBuf = null, bellSynth = null, bellLoading = false;
  function loadBell() {
    if (bellBuf || bellLoading || !Z || location.protocol === 'file:') return;
    bellLoading = true;
    fetch('assets/sounds/bell.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => Z.audioContext.decodeAudioData(ab)).then((buf) => { bellBuf = buf; }).catch(() => { bellLoading = false; bellBuf = null; });
  }
  function synthBell() {
    if (bellSynth) return bellSynth;
    const sr = Z.sampleRate, dur = 5.5, n = Math.round(sr * dur), out = new Float32Array(n), f0 = 392;
    // partial: [ratio, amplitude, decay seconds]  (minor-third bell profile)
    const P = [[0.5, 0.5, 4.5], [1, 1, 3.2], [1.19, 0.6, 1.8], [1.5, 0.4, 1.5], [2.0, 0.5, 1.1], [2.51, 0.25, 0.7], [3.0, 0.15, 0.5], [4.2, 0.08, 0.3]];
    for (let i = 0; i < n; i++) {
      const t = i / sr; let v = 0;
      for (const [r, a, d] of P) v += a * Math.exp(-t / d) * Math.sin(2 * Math.PI * f0 * r * t * (1 + 0.0004 * Math.sin(t * 7)));
      out[i] = v * Math.min(1, t * 400) * 0.28;
    }
    return (bellSynth = out);
  }
  A.bell = function (o) {
    o = o || {};
    if (!Z || A.muted || Z.audioContext.state !== 'running') return;
    const s = spatial(o.pos), vol = (o.vol == null ? 1 : o.vol) * s.vol;
    if (vol < 0.03) return;
    loadBell();
    try {
      const ctx = Z.audioContext;
      if (bellBuf) {
        const src = ctx.createBufferSource(); src.buffer = bellBuf; src.playbackRate.value = o.rate || 1;
        const g = ctx.createGain(); g.gain.value = Z.volume * vol * 0.9;
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) pan.pan.value = s.pan;
        src.connect(g); if (pan) { g.connect(pan); pan.connect(ctx.destination); } else g.connect(ctx.destination);
        src.start();
      } else Z.playSamples([synthBell()], vol, o.rate || 1, s.pan);
    } catch (e) { /* ignore */ }
  };
  if (Z) { const kick = () => { loadBell(); window.removeEventListener('pointerdown', kick); }; window.addEventListener('pointerdown', kick); }

  // ---- emergency siren: alternating two-tone horn ("Tatü-tata"), seamless loop, follows the vehicle
  let sirenBuf = null;
  function sirenSamples() {
    if (sirenBuf) return sirenBuf;
    const sr = Z.sampleRate, cycle = 1.3, n = Math.round(sr * cycle), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr, half = t < cycle / 2, f = half ? 435 : 580, u = (half ? t : t - cycle / 2) / (cycle / 2);
      const env = Math.min(1, u * 40, (1 - u) * 40);
      const ph = 2 * Math.PI * f * t;
      out[i] = (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph) + 0.12 * Math.sin(4 * ph)) * env * 0.35;
    }
    return (sirenBuf = out);
  }
  A.siren = function (o) {
    let src = null;
    if (Z && !A.muted && Z.audioContext.state === 'running') { try { src = Z.playSamples([sirenSamples()], 1, 1, 0, true); } catch (e) { src = null; } }
    const h = {
      update(pos) { if (!src) return; const s = spatial(pos); try { src.gainNode.gain.value = Z.volume * Math.max(0.25, s.vol) * 0.9; } catch (e) { /* ignore */ } },
      stop() { try { src.gainNode.gain.setTargetAtTime(0, Z.audioContext.currentTime, 0.1); src.stop(Z.audioContext.currentTime + 0.5); } catch (e) { /* ended */ } loops.delete(h); },
    };
    if (src) { loops.add(h); h.update(o && o.pos); }
    return h;
  };

  // ambience: birds by day, crickets on summer nights (no rain sound: it sounded bad)
  let nextChirp = 2;
  A.update = function (dt, env) {
    if (!Z || A.muted || Z.audioContext.state !== 'running') return;
    const wet = env.weather === 'rain';
    nextChirp -= dt;
    if (nextChirp <= 0) {
      nextChirp = NB.rr(1.5, 6);
      const night = env.darkness > 0.4;
      if (!night && !wet && NB.season !== 'winter') {
        const k = NB.ri(1, 3);
        for (let i = 0; i < k; i++) setTimeout(() => A.play('chirp', { vol: 0.8, rate: NB.rr(0.8, 1.3) }), i * 140);
      } else if (night && NB.season === 'summer' && !wet) {
        A.play('cricket', { vol: 0.8 });
      }
    }
  };
})(window.NB);
