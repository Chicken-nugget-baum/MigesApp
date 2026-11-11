// Daylight, weather state and hourly chapel bells (logic only; drawing is in js/main.js).
(function (NB) {
  // sunrise / sunset per season, roughly Aargau
  const SUN = { winter: ['08:00', '16:50'], spring: ['06:40', '19:50'], summer: ['05:45', '21:20'], autumn: ['07:15', '18:40'] };
  const WEATHER_WEIGHTS = {
    winter: { clear: 3, cloudy: 4, fog: 3, snow: 3, rain: 1 },
    spring: { clear: 5, cloudy: 3, rain: 2, fog: 1 },
    summer: { clear: 7, cloudy: 2, rain: 2 },
    autumn: { clear: 3, cloudy: 3, rain: 3, fog: 3 },
  };
  const ICON = { clear: '☀️', cloudy: '☁️', rain: '🌧️', fog: '🌫️', snow: '❄️' };
  const E = (NB.Env = { darkness: 0, weather: 'clear', minutes: 0, sun: 0 });
  E.icon = () => (E.darkness > 0.5 && E.weather === 'clear' ? '🌙' : ICON[E.weather]);

  const [riseS, setS] = SUN[NB.season] || SUN.summer;
  const rise = NB.toMin(riseS), set = NB.toMin(setS);
  function computeDarkness(min) {
    const tw = 55;
    let d;
    if (min >= rise + tw && min <= set - tw) d = 0;
    else if (min > set - tw && min < set + tw) d = (min - (set - tw)) / (2 * tw);
    else if (min > rise - tw && min < rise + tw) d = 1 - (min - (rise - tw)) / (2 * tw);
    else d = 1;
    return NB.clamp(d, 0, 1);
  }

  const fixed = NB.params.get('weather');
  function pickWeather() {
    const w = WEATHER_WEIGHTS[NB.season] || WEATHER_WEIGHTS.summer;
    let r = Math.random() * Object.values(w).reduce((s, v) => s + v, 0);
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'clear';
  }
  E.weather = fixed || pickWeather();
  let weatherLeft = NB.rr(240, 600);

  // bells from the Heiligkreuz-Kapelle tower
  let lastHour = Math.floor(NB.clock.minutes() / 60);
  E.ringBells = function (count) {
    const k = NB.map.buildings.kapelle;
    if (!k) return;
    const pos = { x: k.cx, z: k.cz };
    for (let i = 0; i < count; i++) setTimeout(() => {
      NB.Audio.bell({ pos });
      if (NB.UI) NB.UI.fx(k.cx + NB.rr(-1, 1), 12, k.cz, 'note', { vy: 1.2, life: 2.2 });
    }, i * 1700);
  };

  E.update = function (dt) {
    const min = NB.clock.minutes();
    E.minutes = min;
    E.darkness = computeDarkness(min);
    // sun progress across the day 0..1 (for the light direction)
    E.sun = NB.clamp((min - rise) / (set - rise), 0, 1);
    if (!fixed) {
      weatherLeft -= dt;
      if (weatherLeft <= 0) {
        E.weather = pickWeather();
        weatherLeft = NB.rr(240, 600);
        if (NB.season === 'winter' && E.weather === 'rain' && Math.random() < 0.6) E.weather = 'snow';
      }
    }
    const hour = Math.floor(min / 60);
    if (hour !== lastHour) { lastHour = hour; if (hour >= 7 && hour <= 22) E.ringBells(hour % 12 || 12); }
  };

  // which windows are lit
  E.windowLit = function (b, seed) {
    if (E.darkness < 0.2 || b.kind === 'garage') return false;
    const min = E.minutes;
    if (b.kind === 'chapel') return NB.inWindow(min, '17:00', '06:00') ? seed < 0.6 : false;
    if (b.kind === 'beiz') return !NB.inWindow(min, '00:30', '06:00');
    const late = NB.inWindow(min, '23:00', '06:00');
    if (b.inside.size) return late ? seed < 0.15 : seed < 0.9;
    return late ? false : seed < 0.35;
  };
})(window.NB);
