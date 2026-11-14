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
      year: 'numeric', month: 'numeric', day: 'numeric', hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    const r = { h: get('hour') % 24, m: get('minute'), s: get('second'), year: get('year'), month: get('month'), day: get('day') };
    // ?date=2026-08-01, ?date=08-01 or ?date=1.8. (any day of the year, for testing festivals and seasons)
    const q = NB.params.get('date');
    if (q) {
      let m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y = r.year, mo, d;
      if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else if ((m = q.match(/^(\d{1,2})-(\d{1,2})$/))) { mo = +m[1]; d = +m[2]; }
      else if ((m = q.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/))) { d = +m[1]; mo = +m[2]; if (m[3]) y = +m[3]; }
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) { r.year = y; r.month = mo; r.day = d; }
    }
    return r;
  }
  NB.toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  NB.inWindow = function (min, from, to) {
    const a = NB.toMin(from), b = NB.toMin(to);
    return a <= b ? min >= a && min < b : min >= a || min < b;
  };

  const zp = zurichParts();
  const realMin = () => { const q = zurichParts(); return q.h * 60 + q.m + q.s / 60; };
  const startMin = NB.params.get('time') ? NB.toMin(NB.params.get('time')) : zp.h * 60 + zp.m + zp.s / 60;
  // game time = base + real time since `ref` x speed; pause, speed and jumps (settings panel) re-base it
  let base = startMin, ref = Date.now(), speed = parseFloat(NB.params.get('speed') || '1') || 1, paused = false;
  const total = () => base + (paused ? 0 : ((Date.now() - ref) / 60000) * speed);
  const rebase = () => { base = total(); ref = Date.now(); };
  NB.clock = {
    year: zp.year,
    month: zp.month,
    date: zp.day,
    weekday: new Date(zp.year, zp.month - 1, zp.day).getDay(), // 0 = Sunday
    day: zp.month * 31 + zp.day, // changes once a day (seeds per-day variation)
    get speed() { return speed; },
    get paused() { return paused; },
    minutes() { return ((total() % 1440) + 1440) % 1440; },
    dayOffset() { return Math.floor(total() / 1440); }, // midnights passed since the page was opened (Silvester -> Neujahr)
    setSpeed(s) { rebase(); speed = s; },
    setPaused(p) { rebase(); paused = !!p; },
    setTime(m) { base = this.dayOffset() * 1440 + m; ref = Date.now(); },
    toNow() { this.setTime(realMin()); speed = 1; paused = false; }, // the real time of day (the chosen ?date stays)
    label() {
      const m = this.minutes();
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
    },
  };

  // ---- calendar: which festival / special days are on today ----
  const easter = (y) => { // Meeus/Jones/Butcher
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  };
  NB.easter = easter;
  {
    const today = new Date(zp.year, zp.month - 1, zp.day), E = easter(zp.year), days = (a) => Math.round((today - a) / 86400000);
    const de = days(E), md = zp.month * 100 + zp.day;
    NB.cal = {
      fest: md === 731 || md === 801, // Dorffest 125 Jahre Niederwil-Nesselnbach + 1. August
      august1: md === 801,
      fasnacht: de >= -52 && de <= -46, // Schmutzige Donnerstag .. Aschermittwoch
      easter: de >= -2 && de <= 1, // Karfreitag .. Ostermontag
      advent: md >= 1201 && md <= 1231 || md <= 106,
      christmas: md >= 1224 && md <= 1226,
      sunday: NB.clock.weekday === 0,
      // Räbeliechtli-Umzug: the Friday and Saturday evenings in mid-November
      raebeli: zp.month === 11 && zp.day >= 7 && zp.day <= 21 && (NB.clock.weekday === 5 || NB.clock.weekday === 6),
      samichlaus: md === 1205 || md === 1206,
      silvester: md === 1231,
      neujahr: md === 101,
      // Dorfmärt with a Rösslispiel: the second-last weekend in September
      maert: zp.month === 9 && ((NB.clock.weekday === 6 && zp.day >= 17 && zp.day <= 23) || (NB.clock.weekday === 0 && zp.day >= 18 && zp.day <= 24)),
      // Gmeiversammlig in the Casino: a Friday in June and the last one in November
      gmv: NB.clock.weekday === 5 && ((zp.month === 6 && zp.day >= 8 && zp.day <= 14) || (zp.month === 11 && zp.day >= 24 && zp.day <= 30)),
      // fondue evenings: December to February; on Friday, Saturday and Sunday people visit each other
      fondue: zp.month === 12 || zp.month <= 2,
      fondueVisits: (zp.month === 12 || zp.month <= 2) && [0, 5, 6].includes(NB.clock.weekday),
    };
  }

  const seasonByMonth = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  NB.season = NB.params.get('season') || seasonByMonth[zp.month - 1];
})(window.NB);
