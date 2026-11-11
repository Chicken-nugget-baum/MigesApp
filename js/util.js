// Shared helpers, clock and global namespace.
window.NB = window.NB || {};
(function (NB) {
  NB.TILE = 16;
  NB.params = new URLSearchParams(location.search);
  // Terrain codes
  NB.TER = { GRASS: 0, ROAD: 1, STREET: 2, PATH: 3, PLAZA: 4, DIRT: 5, FIELD: 6, WATER: 7 };

  NB.seeded = function (seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  NB.rr = (a, b) => a + Math.random() * (b - a);
  NB.ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  NB.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  NB.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  NB.lerp = (a, b, t) => a + (b - a) * t;

  NB.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  };

  NB.hexToRgb = function (hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  NB.shade = function (hex, f) {
    // f < 1 darker, f > 1 lighter
    const [r, g, b] = NB.hexToRgb(hex);
    const m = (v) => NB.clamp(Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)), 0, 255);
    return '#' + [m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  };

  // ---- Clock (Swiss time, overridable with ?time=HH:MM and ?speed=N) ----
  function zurichParts() {
    const parts = new Intl.DateTimeFormat('de-CH', {
      timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit',
      month: 'numeric', hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    return { h: get('hour') % 24, m: get('minute'), s: get('second'), month: get('month') };
  }
  NB.toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  NB.inWindow = function (min, from, to) {
    const a = NB.toMin(from), b = NB.toMin(to);
    return a <= b ? min >= a && min < b : min >= a || min < b;
  };

  const zp = zurichParts();
  const startMin = NB.params.get('time') ? NB.toMin(NB.params.get('time')) : zp.h * 60 + zp.m + zp.s / 60;
  const speed = parseFloat(NB.params.get('speed') || '1');
  const startReal = Date.now();
  NB.clock = {
    month: zp.month,
    speed,
    minutes() {
      return (((startMin + ((Date.now() - startReal) / 60000) * speed) % 1440) + 1440) % 1440;
    },
    label() {
      const m = this.minutes();
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
    },
  };

  const seasonByMonth = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  NB.season = NB.params.get('season') || seasonByMonth[zp.month - 1];
})(window.NB);
