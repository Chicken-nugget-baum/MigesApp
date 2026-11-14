// Settings panel (⚙️, or a tap on the clock): time (pause, faster, jump to an hour), a festival day to visit
// (reloads with ?date=&time=), the weather, and the volume of voices, sounds, ambience and music.
(function (NB) {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hhmm = (m) => pad(Math.floor(m / 60)) + ':' + pad(Math.floor(m % 60));
  const DAYS = ['Sunntig', 'Mänttig', 'Ziischtig', 'Mittwuch', 'Dunschtig', 'Friitig', 'Samschtig'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'Auguscht', 'September', 'Oktober', 'November', 'Dezämber'];
  // the first day from (month, day) on that is one of the weekdays
  const firstWeekday = (y, mo, d, days) => { const t = new Date(y, mo - 1, d); while (!days.includes(t.getDay())) t.setDate(t.getDate() + 1); return t; };
  function feasts(y) {
    const E = NB.easter(y), add = (d, n) => { const t = new Date(d); t.setDate(t.getDate() + n); return t; };
    return [
      { icon: '🎭', name: 'Fasnacht', date: add(E, -52), time: '14:05' },
      { icon: '🥚', name: 'Oschtere', date: E, time: '10:00' },
      { icon: '🇨🇭', name: '1. August', date: new Date(y, 7, 1), time: '21:40' },
      { icon: '🎠', name: 'Dorfmärt', date: firstWeekday(y, 9, 17, [6]), time: '11:00' },
      { icon: '🎃', name: 'Kürbismärt', date: new Date(y, 9, 10), time: '11:00' },
      { icon: '🏮', name: 'Räbeliechtli', date: firstWeekday(y, 11, 7, [5, 6]), time: '18:05' },
      { icon: '🗳️', name: 'Gmeiversammlig', date: firstWeekday(y, 11, 24, [5]), time: '19:50' },
      { icon: '🎅', name: 'Samichlaus', date: new Date(y, 11, 6), time: '17:50' },
      { icon: '🎄', name: 'Wiehnacht', date: new Date(y, 11, 24), time: '19:00' },
      { icon: '🥂', name: 'Silvester', date: new Date(y, 11, 31), time: '23:55' },
      { icon: '🫕', name: 'Fondue-Abig', date: firstWeekday(y, 1, 8, [5]), time: '19:15' },
    ];
  }
  function go(date, time) {
    const q = new URLSearchParams(location.search);
    ['date', 'time', 'speed', 'season'].forEach((k) => q.delete(k));
    if (date) { q.set('date', date); q.set('time', time); }
    location.search = q.toString();
  }

  NB.Settings = {
    init(actions) {
      const panel = $('settings'); if (!panel) return;
      const C = NB.clock, open = () => { panel.classList.toggle('hidden'); $('found').classList.add('hidden'); sync(); }, close = () => panel.classList.add('hidden');
      $('settingsbtn').addEventListener('click', open);
      $('clock').addEventListener('click', open);
      $('setclose').addEventListener('click', close);
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === ' ' && e.target === document.body) { C.setPaused(!C.paused); sync(); e.preventDefault(); } });
      // today
      const d = new Date(C.year, C.month - 1, C.date), on = { fest: '🇨🇭 Dorffest', fasnacht: '🎭 Fasnacht', easter: '🥚 Oschtere', christmas: '🎄 Wiehnacht', advent: '🕯️ Advänt', raebeli: '🏮 Räbeliechtli', samichlaus: '🎅 Samichlaus', silvester: '🥂 Silvester', neujahr: '🎉 Neujohr', maert: '🎠 Dorfmärt', gmv: '🗳️ Gmeiversammlig', fondueVisits: '🫕 Fondue-Abig' };
      const today = Object.keys(on).filter((k) => NB.cal[k]).map((k) => on[k]);
      $('settoday').textContent = DAYS[d.getDay()] + ', ' + C.date + '. ' + MONTHS[C.month - 1] + ' ' + C.year + (NB.params.get('date') ? ' (usgwählt)' : '') + (today.length ? ' · ' + today.join(', ') : '');
      // time
      const slider = $('tslider'), tlabel = $('tlabel');
      let dragging = false;
      slider.addEventListener('input', () => { dragging = true; tlabel.textContent = hhmm(+slider.value); });
      slider.addEventListener('change', () => { dragging = false; C.setTime(+slider.value); NB.Entities.resync(); sync(); });
      $('tpause').addEventListener('click', () => { C.setPaused(!C.paused); sync(); });
      panel.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { C.setSpeed(+b.dataset.speed); C.setPaused(false); sync(); }));
      $('tnow').addEventListener('click', () => { C.toNow(); NB.Entities.resync(); sync(); });
      // festival days
      // the next one of each (or this year's, when a date is chosen already)
      const days = $('days'), now = new Date(), today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const list = feasts(C.year).map((f, i) => (f.date < today0 && !NB.params.get('date') ? feasts(C.year + 1)[i] : f));
      days.innerHTML = '<button class="chip" data-i="-1">📅 Hüt</button>' + list.map((f, i) => `<button class="chip" data-i="${i}" title="${f.date.getDate()}. ${MONTHS[f.date.getMonth()]} ${f.date.getFullYear()}, ${f.time}">${f.icon} ${f.name}</button>`).join('');
      days.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; if (i < 0) go(null); else go(iso(list[i].date), list[i].time); }));
      // weather
      panel.querySelectorAll('[data-weather]').forEach((b) => b.addEventListener('click', () => { NB.Env.setWeather(b.dataset.weather); sync(); }));
      // volume
      panel.querySelectorAll('[data-vol]').forEach((r) => {
        r.value = Math.round(NB.Audio.vol[r.dataset.vol] * 100);
        r.addEventListener('input', () => { NB.Audio.unlock(); NB.Audio.setVol(r.dataset.vol, r.value / 100); if (NB.Audio.muted && r.value > 0) { NB.Audio.setMuted(false); actions.muteChanged(); } });
        r.addEventListener('change', () => NB.Audio.play(r.dataset.vol === 'voice' ? 'pop' : r.dataset.vol === 'music' ? 'brass' : r.dataset.vol === 'amb' ? 'chirp' : 'meow', { cat: r.dataset.vol, vol: 0.8 }));
      });
      function sync() {
        $('tpause').textContent = C.paused ? '▶️' : '⏸️';
        $('tpause').classList.toggle('on', C.paused);
        panel.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', !C.paused && +b.dataset.speed === C.speed));
        panel.querySelectorAll('[data-weather]').forEach((b) => b.classList.toggle('on', b.dataset.weather === NB.Env.weather));
        if (!dragging) { slider.value = Math.round(C.minutes()); tlabel.textContent = C.label(); }
      }
      setInterval(() => { if (!panel.classList.contains('hidden')) sync(); }, 500);
      sync();
    },
  };
})(window.NB);
