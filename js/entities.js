// Spawning and updating everything that moves (classes in js/entities/*): traffic, the racer, field tractors.
(function (NB) {
  const { E, map, add, Villager, Cat, Dog, Deer, Duck, Owl, Hedgehog, Fox, Grazer, Vehicle, FieldTractor, laneOffset, Visit, Outing, updateFire, visits, outings } = NB.Ent;
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
    // June: haymaking on the meadows; July: the combine on the grain fields; otherwise ploughing / sowing
    const mo = NB.clock.month, want = mo === 6 ? ['meadow', 'mower'] : mo === 7 ? ['grain', 'combine'] : null;
    let fields = map.fields.filter((f) => map.fieldLanes(f).length >= 3 && (fieldIndex == null || f.i === fieldIndex));
    const season = want && fields.filter((f) => f.kind === want[0]);
    const vtype = season && season.length && Math.random() < 0.8 ? want[1] : 'tractor';
    if (vtype !== 'tractor') fields = season;
    if (!fields.length) return false;
    const field = NB.pick(fields), lanes = map.fieldLanes(field);
    const n = Math.min(lanes.length, NB.ri(4, 8)), start = NB.ri(0, lanes.length - n);
    add(new FieldTractor(field, lanes.slice(start, start + n), vtype));
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
    // night animals, cows on the pasture (May - October), storks on a field (March - May)
    const k = map.buildings.kapelle, trees = NB.trees || [];
    if (trees.length) { const c = k ? { x: k.cx, z: k.cz } : map.start; add(new Owl(trees.slice().sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z))[0])); }
    for (let i = 0; i < 2; i++) add(new Hedgehog());
    const mo = NB.clock.month;
    if (map.cowField && mo >= 5 && mo <= 10) for (let i = 0; i < 6; i++) add(new Grazer('cow', map.cowField, i));
    if (map.storkField && mo >= 3 && mo <= 5) for (let i = 0; i < 3; i++) add(new Grazer('stork', map.storkField, i));
    if (map.tanjaGarden) add(new NB.Ent.Ball()); // Louis's football
    if (map.railway) { // Ernst's trains: a red loco with green coaches on the long bed, a goods train by the door
      map.railway.loops.filter((L) => L.main).forEach((L, i) => { const t = new NB.Ent.Train(L, i ? ['loco', 'wagon', 'wagon'] : ['loco', 'coach', 'coach', 'coach'], i ? 0.45 : 0.6, i ? 'Güeterzügli vom Ernst' : 'Zug vom Ernst'); add(t); t.cars.forEach((c) => add(c)); });
    }
    NB.Fest.init();
  };
  // a fox crosses a street near the middle of the view now and then at night
  let foxT = NB.rr(40, 120);
  function spawnFox(dt) {
    if (NB.Env.darkness < 0.6 || (foxT -= dt) > 0) return;
    foxT = NB.rr(120, 300);
    const v = NB.view; if (!v) return;
    const near = map.streets.filter((s) => s.kind !== 'track' && s.kind !== 'grass').map((s) => ({ s, i: s.pts.findIndex((p) => Math.hypot(p[0] - v.cx, p[1] - v.cy) < 60) })).filter((q) => q.i > 0);
    if (!near.length) return;
    const { s, i } = NB.pick(near), [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], l = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / l, nz = -(bx - ax) / l, t = Math.random();
    const mx = ax + (bx - ax) * t, mz = az + (bz - az) * t, sg = Math.random() < 0.5 ? 1 : -1;
    add(new Fox({ x: mx + nx * 18 * sg, z: mz + nz * 18 * sg }, { x: mx - nx * 18 * sg, z: mz - nz * 18 * sg }));
  }
  E.spawnFox = () => { foxT = 0; spawnFox(1); };
  E.spawnFieldTractor = spawnFieldTractor; // for tests / the console
  E.spawnRacer = spawnRacer;
  E.visits = visits;
  E.outings = outings;
  // after a jump in time (settings panel): everyone who is around goes straight to where they should be now
  E.resync = function () {
    for (const v of E.list) {
      if (v.kind !== 'villager' || v.away || v.toCar || v.searching) continue;
      if (v.inside) { (v.inBuilding || v.home).inside.delete(v); v.inside = false; v.inBuilding = null; }
      NB.Ent.releaseSpot(v); v.fishing = null; v.evading = null; v.pause = 0; v.appear();
    }
  };
  E.update = function (dt) {
    spawnTraffic(dt);
    for (const v of visits) v.update(dt);
    for (const o of outings) o.update(dt);
    updateFire(dt);
    NB.Fest.update(dt);
    spawnFox(dt);
    for (const e of E.list) e.update(dt);
    E.list = E.list.filter((e) => !e.done);
  };
})(window.NB);
