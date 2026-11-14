// Daylight, weather state and hourly chapel bells (logic only; drawing is in js/main.js).
(function (NB) {
  // sunrise / sunset per season, roughly Aargau
  const SUN = { winter: ['08:00', '16:50'], spring: ['06:40', '19:50'], summer: ['05:45', '21:20'], autumn: ['07:15', '18:40'] };
  const WEATHER_WEIGHTS = {
    winter: { clear: 3, cloudy: 4, fog: 3, snow: 3, rain: 1 },
    spring: { clear: 5, cloudy: 3, rain: 2, fog: 1 },
    summer: { clear: 7, cloudy: 2, rain: 2, storm: 1 },
    autumn: { clear: 3, cloudy: 3, rain: 3, fog: 3 },
  };
  const ICON = { clear: '☀️', cloudy: '☁️', rain: '🌧️', fog: '🌫️', snow: '❄️', storm: '⛈️' };
  const E = (NB.Env = { darkness: 0, weather: 'clear', minutes: 0, sun: 0, flash: 0, wetT: 0 });
  E.wet = () => E.weather === 'rain' || E.weather === 'storm'; // rain or thunderstorm
  E.icon = () => (E.darkness > 0.5 && E.weather === 'clear' ? '🌙' : ICON[E.weather]);

  // by month when the season isn't forced with ?season= (Swiss time, summer time included)
  const MONTH_SUN = [['08:10', '16:55'], ['07:40', '17:40'], ['06:55', '18:25'], ['06:50', '20:10'], ['06:05', '20:50'], ['05:30', '21:25'], ['05:45', '21:20'], ['06:25', '20:40'], ['07:10', '19:35'], ['07:55', '18:30'], ['07:35', '17:00'], ['08:10', '16:40']];
  const [riseS, setS] = NB.params.get('season') ? SUN[NB.season] || SUN.summer : MONTH_SUN[NB.clock.month - 1];
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
    if (NB.cal && NB.cal.christmas) return Math.random() < 0.8 ? 'snow' : 'cloudy'; // white Christmas
    const w = Object.assign({}, WEATHER_WEIGHTS[NB.season] || WEATHER_WEIGHTS.summer);
    if (NB.cal && NB.cal.advent) w.snow = (w.snow || 0) + 3;
    let r = Math.random() * Object.values(w).reduce((s, v) => s + v, 0);
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'clear';
  }
  E.weather = fixed || pickWeather();
  let weatherLeft = NB.rr(240, 600);
  E.setWeather = function (w) { E.weather = w; weatherLeft = 900; if (w !== 'storm') E.flash = 0; }; // settings panel: stays a while

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
    // thunderstorm: lightning flashes now and then, thunder a moment later
    if (E.flash > 0) E.flash = Math.max(0, E.flash - dt * 3);
    if (E.weather === 'storm') {
      E.boltT = (E.boltT == null ? NB.rr(3, 8) : E.boltT) - dt;
      if (E.boltT <= 0) {
        E.boltT = NB.rr(6, 18); E.flash = 1;
        setTimeout(() => NB.Audio.play('thunder', { vol: NB.rr(0.6, 1) }), NB.rr(300, 2200));
        if (NB.UI && NB.UI.discover) NB.UI.discover('storm');
      }
    }
    // the streets stay wet for a while after rain (puddles)
    E.wetT = E.wet() ? Math.min(E.wetT + dt, 600) : Math.max(0, E.wetT - dt);
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
