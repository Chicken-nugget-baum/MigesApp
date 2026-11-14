// Spawning and updating everything that moves (classes in js/entities/*): traffic, the racer, field tractors.
(function (NB) {
  const { E, map, add, Villager, Cat, Dog, Deer, Duck, Vehicle, FieldTractor, laneOffset, Visit, Outing, updateFire, visits, outings } = NB.Ent;
  let nextCar = 4, nextBus = 8, busDir = 0, nextTractor = 14, nextRacer = NB.rr(20, 60);
  // the evening racer: after 20:00 a car tears along the Bremgarterstrasse to the roundabout
  function spawnRacer() {
    const R = NB.Scene.racer;
    if (!R || R.length < 3 || E.list.some((e) => e.type === 'racer')) return false;
    const path = laneOffset(R.map(([x, z]) => ({ x, z })), 1.6);
    const v = add(new Vehicle('racer', false, { path, color: NB.pick(['#f2c230', '#111318', '#e03a3a', '#f4f4f0']), name: 'Raser' }));
    v.brakeAt = Math.max(6, R.length - Math.max(0, R.findIndex(([x, z]) => Math.hypot(x - NB.Scene.kreisel[0], z - NB.Scene.kreisel[1]) < 45)) + 1); // brake from ~45 m before the roundabout
    return true;
  }
  // a tractor works a field by day (not in winter, not in rain/snow); otherwise one may drive through the village
  function spawnFieldTractor(fieldIndex) {
    const fields = map.fields.filter((f) => map.fieldLanes(f).length >= 3 && (fieldIndex == null || f.i === fieldIndex));
    if (!fields.length) return false;
    const field = NB.pick(fields), lanes = map.fieldLanes(field);
    const n = Math.min(lanes.length, NB.ri(4, 8)), start = NB.ri(0, lanes.length - n);
    add(new FieldTractor(field, lanes.slice(start, start + n)));
    return true;
  }
  function spawnTraffic(dt) {
    const m = NB.clock.minutes();
    const nightQuiet = NB.inWindow(m, '00:30', '05:30');
    nextCar -= dt; nextBus -= dt; nextTractor -= dt; nextRacer -= dt;
    if (nextRacer <= 0) { nextRacer = NB.rr(240, 480); if (NB.inWindow(m, '20:00', '23:30')) spawnRacer(); }
    if (nextBus <= 0) { nextBus = NB.rr(50, 90); if (!nightQuiet) add(new Vehicle('bus', busDir++ % 2 === 1)); }
    if (nextCar <= 0) { nextCar = nightQuiet ? NB.rr(40, 90) : NB.rr(12, 30); add(new Vehicle('car', Math.random() < 0.5)); }
    if (nextTractor <= 0) {
      nextTractor = NB.rr(90, 200);
      const working = NB.inWindow(m, '07:00', '19:30') && NB.season !== 'winter' && !['rain', 'snow'].includes(NB.Env.weather);
      const busy = E.list.some((e) => e.kind === 'tractor');
      if (working && !busy && Math.random() < 0.75) spawnFieldTractor();
      else if (!nightQuiet && Math.random() < 0.5) add(new Vehicle('tractor', Math.random() < 0.5));
    }
  }

  E.init = function () {
    (NB.Data.characters || []).forEach((c) => {
      if (!map.buildings[c.home]) { console.warn('unknown home', c.home, c.id); return; }
      add(new Villager(c));
    });
    Object.values(map.buildings).forEach((b) => { if (b.occupants.length && b.kind === 'house') b.name = 'Huus vo ' + b.occupants.map((v) => v.name).join(' & ') + (b.addr ? ' (' + b.addr + ')' : ''); });
    (NB.Data.visitors || []).forEach((d, idx) => {
      const members = E.list.filter((e) => e.kind === 'villager' && (d.members || []).includes(e.c.id));
      const v = new Visit(d, members, idx); visits.push(v);
      if (v.here(NB.clock.minutes())) v.start(true);
    });
    (NB.Data.outings || []).forEach((d, idx) => { const o = new Outing(d, idx); outings.push(o); o.start(); });
    (NB.Data.animals || []).filter((a) => a.kind === 'cat').forEach((a) => add(new Cat(a)));
    if (map.water.length) (NB.Data.animals || []).filter((a) => a.kind === 'duck').forEach((a) => add(new Duck(a)));
    if (map.deer) (NB.Data.animals || []).filter((a) => a.kind === 'deer').forEach((a) => add(new Deer(a)));
    (NB.Data.animals || []).filter((a) => a.kind === 'dog').forEach((a) => { const o = E.list.find((e) => e.kind === 'villager' && e.c.id === a.owner); if (o) add(new Dog(a, o)); });
  };
  E.spawnFieldTractor = spawnFieldTractor; // for tests / the console
  E.spawnRacer = spawnRacer;
  E.visits = visits;
  E.outings = outings;
  E.update = function (dt) {
    spawnTraffic(dt);
    for (const v of visits) v.update(dt);
    for (const o of outings) o.update(dt);
    updateFire(dt);
    for (const e of E.list) e.update(dt);
    E.list = E.list.filter((e) => !e.done);
  };
})(window.NB);
