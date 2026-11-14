// Events: the fire at the Milchzentrale + the Niederwil fire brigade, knocking at doors, visitors, residents' car trips.
(function (NB) {
  const { E, I, map, add, place, say, angleLerp, Mover, Vehicle, laneOffset, nearestIdx } = NB.Ent;
  // ---------------------------------------------------------------- fire at the Milchzentrale + the Niederwil fire brigade
  // Clicking the dairy many times in a row sets it on fire (main.js -> E.startFire). The residents run out, the fire
  // engine comes from Niederwil (south end of the Niederwilerstrasse), parks in the dairy bay, the crew sprays the
  // building until the fire is out, climbs back in and drives off. The building stays sooty for a while.
  class Firefighter extends Mover {
    constructor(d, spot, truck) {
      super(truck.x, truck.z, map.walkCost, 2.3);
      this.d = d; this.kind = 'firefighter'; this.name = d.name; this.spot = spot; this.truck = truck;
      this.frames = NB.Models.person(d.look || {}); this.sprite = new PIXI.Sprite(); this.shown = 0; this.state = 'out';
      this.x += NB.rr(-1, 1); this.z += NB.rr(-1, 1) + 1.5; this.spray = null; this.done = false; this.lineT = NB.rr(3, 9);
      this.goTo(spot.x, spot.z);
    }
    update(dt) {
      const F = E.fire;
      if (this.state === 'out') { if (this.stepPath(dt) && F) { this.state = 'spray'; this.heading = Math.atan2(F.b.cx - this.x, F.b.cz - this.z); this.spray = { x: F.b.cx + NB.rr(-2, 2), y: F.b.top.y * 0.55, z: F.b.cz + NB.rr(-2, 2) }; } }
      else if (this.state === 'spray') {
        this.moving = false;
        if (!F || F.intensity <= 0) { this.state = 'back'; this.spray = null; this.goTo(this.truck.x, this.truck.z); }
        else if (Math.random() < dt * 0.4) this.spray = { x: F.b.cx + NB.rr(-3, 3), y: F.b.top.y * NB.rr(0.3, 0.8), z: F.b.cz + NB.rr(-3, 3) };
        this.lineT -= dt;
        if (this.lineT <= 0) { this.lineT = this.d.lead ? NB.rr(6, 11) : NB.rr(10, 18); const l = NB.pick(this.d.lines || ['Wasser marsch!']); say(this, l, { quiet: true }); if (NB.UI.onScreen(this)) NB.Audio.babble(l, this.d.voice || 0.9, { pos: this, vol: 0.6 }); }
      } else if (this.state === 'back') { if (this.stepPath(dt) || Math.hypot(this.x - this.truck.x, this.z - this.truck.z) < 3) { this.done = true; NB.world.remove(this.sprite); NB.Audio.play('door', { pos: this, vol: 0.4 }); return; } }
      this.pose(dt);
    }
    pose(dt) {
      this.shown = angleLerp(this.shown, this.heading, Math.min(1, dt * 10));
      const f = I.facing(this.shown);
      const view = f === 's' || f === 'se' || f === 'sw' ? 'down' : f === 'n' || f === 'ne' || f === 'nw' ? 'up' : f === 'e' ? 'right' : 'left';
      place(this, this.frames[view][this.moving ? [1, 0, 2, 0][Math.floor(this.anim * 7) % 4] : 0], this.x, 0, this.z);
    }
    click() { if (this.d.lead) NB.UI.discover('raphy'); const l = NB.pick(this.d.clicks || this.d.lines || ['Zrugg bliibe!']); say(this, l); NB.Audio.babble(l, this.d.voice || 0.9, { pos: this }); }
    get visible() { return true; }
    top() { return { x: this.x, y: 2.4, z: this.z }; }
  }
  E.fire = null;
  // Knocking three times: everyone inside comes out to the door, says something (grumpy at night), waits a
  // moment (waving when facing the viewer) and goes back in - their routine still says "home".
  const DOOR_DAY = ['Jo? Wer isch do?', 'Hoi! Was gits?', 'Grüezi! Chömed doch ine.', 'Ah, du bisch es! 😊', 'Momänt, ich chume!'];
  const DOOR_NIGHT = ['Wer klopft do mitten i de Nacht?! 😠', 'Mir schlofed! 💤', "Gaht's no?!", "Was isch los? Brönnt's?"];
  E.answerDoor = function (b) {
    const people = [...b.inside].filter((v) => v.kind === 'villager');
    if (!people.length) return false;
    NB.UI.discover('knock');
    const night = NB.inWindow(NB.clock.minutes(), '22:00', '06:30');
    const n = b.doorN, t = [-n[1], n[0]];
    people.forEach((v, k) => {
      v.leave();
      const off = (k - (people.length - 1) / 2) * 0.9;
      v.x = b.entryPt.x + n[0] * 0.8 + t[0] * off; v.z = b.entryPt.z + n[1] * 0.8 + t[1] * off;
      v.heading = I.towardCamera; v.path = null; v.goalKey = null;
      v.pause = NB.rr(6, 9) + k * 0.8; v.hop = 0.35;
      const line = NB.pick((night ? v.c.doorNight : v.c.doorLines) || (night ? DOOR_NIGHT : DOOR_DAY));
      setTimeout(() => { if (!v.inside) { say(v, line); if (NB.UI.onScreen(v)) NB.Audio.babble(line, v.c.voice, { pos: v }); } }, 350 + k * 700);
    });
    return true;
  };
  E.startFire = function (b) {
    if (E.fire || !map.parkings || !map.parkings.dairy) return false;
    NB.UI.discover('fire');
    const F = (E.fire = { b, t: 0, intensity: 1, phase: 'burning', truck: null, crew: [], sirenT: 0, fxT: 0 });
    // a ring of places to watch from (17-23 m out, off the street), facing the fire
    const ring = [];
    for (const r of [17, 20, 23]) for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
      const x = b.cx + Math.cos(a + r) * r, z = b.cz + Math.sin(a + r) * r, [cx, cz] = map.toCell(x, z);
      if (map.inB(cx, cz) && map.walkCost[cz * map.w + cx] && !map.inBuilding(x, z, 1.5) && map.streetDist(x, z) > 1.5) ring.push({ x, z, face: Math.atan2(b.cx - x, b.cz - z), sit: false });
    }
    map.spots = map.spots || {}; map.spots.fire = ring;
    const now = performance.now() / 1000;
    const watch = (v, until) => { v.fled = { until: now + until, place: 'fire' }; v.goalKey = null; v.path = null; v.fishing = null; };
    // residents out of the house
    for (const v of [...b.inside]) { v.leave(); watch(v, 600); v.pause = 0.6; say(v, NB.pick(['Füür! FÜÜR!', 'Use, alli use!', 'Nid scho wider!'])); NB.Audio.babble('Füür! Füür!', v.c.voice, { pos: v }); }
    // the village comes to look: everyone outdoors within 160 m, and half of those at home within 90 m
    for (const v of E.list) {
      if (v.kind !== 'villager' || v.away || v.fled || v.c.guard === 'weiher' && v.guarding) continue;
      const d = Math.hypot(v.x - b.cx, v.z - b.cz);
      if (!v.inside && d < 160) { watch(v, NB.rr(240, 420)); if (d < 40) say(v, NB.pick(['Füür! Rüef d\'Füürwehr!', 'Ui nei, d\'Milchzentrale!', 'Es brönnt!']), { quiet: true }); }
      else if (v.inside && d < 90 && Math.random() < 0.5) { v.leave(); watch(v, NB.rr(200, 360)); }
    }
    setTimeout(() => {
      if (E.fire !== F) return;
      const d = NB.Data.firebrigade || {};
      F.truck = add(new Vehicle('firetruck', true, { parkAt: map.parkings.dairy, color: '#d6252a', name: d.name || 'Füürwehr Niederwil', lines: d.lines || ['Tatü-tata!'] }));
      F.truck.siren = true;
    }, 4000);
    return true;
  };
  function updateFire(dt) {
    const F = E.fire;
    if (!F) return;
    F.t += dt;
    const b = F.b;
    // flames and smoke on the building
    F.fxT -= dt;
    if (F.fxT <= 0 && F.intensity > 0) {
      F.fxT = 0.05 / Math.max(0.15, F.intensity);
      const u = NB.rr(-b.w / 2, b.w / 2) * 0.8, v = NB.rr(-b.d / 2, b.d / 2) * 0.8, ca = Math.cos(b.angle), sa = Math.sin(b.angle);
      const x = b.cx + u * ca - v * sa, z = b.cz + u * sa + v * ca;
      NB.UI.fx(x, b.top.y * NB.rr(0.5, 1.0), z, 'fire', { vy: NB.rr(0.8, 1.6), life: NB.rr(0.5, 0.9), size: F.intensity });
      if (Math.random() < 0.5) NB.UI.fx(x, b.top.y * NB.rr(0.9, 1.1), z, 'smoke', { vy: NB.rr(1.5, 2.5), life: NB.rr(2.5, 4), size: F.intensity });
    }
    if (F.intensity > 0) { if (!F.crackle) F.crackle = NB.Audio.loop('fire', { pos: b.top, vol: 0.9 }); F.crackle.setVol(0.25 + 0.75 * F.intensity); F.crackle.update(b.top); }
    else if (F.crackle) { F.crackle.stop(); F.crackle = null; }
    if (b.sprite) b.sprite.tint = F.intensity > 0 ? (Math.floor(F.t * 8) % 2 ? 0xffb070 : 0xff9050) : 0x6e6a66;
    // the engine: siren while driving, crew out when parked
    const T = F.truck;
    if (T && !T.parked && !T.departing && !T.done) { if (!F.siren) F.siren = NB.Audio.siren({ pos: T }); else F.siren.update(T); } // on the way: siren
    else if (F.siren) { F.siren.stop(); F.siren = null; }
    if (T && T.parked && F.phase === 'burning') {
      F.phase = 'fighting';
      const crew = NB.Data.firefighters || [{ name: 'Füürwehrler' }];
      const spots = [];
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const ca = Math.cos(b.angle), sa = Math.sin(b.angle), u = Math.cos(a) * (b.w / 2 + 5), v = Math.sin(a) * (b.d / 2 + 5);
        const x = b.cx + u * ca - v * sa, z = b.cz + u * sa + v * ca, [cx, cz] = map.toCell(x, z);
        if (map.inB(cx, cz) && map.walkCost[cz * map.w + cx]) spots.push({ x, z });
      }
      spots.sort((p, q) => Math.hypot(p.x - T.x, p.z - T.z) - Math.hypot(q.x - T.x, q.z - T.z)); // nearest the engine first
      const front = spots.slice().sort((p, q) => (q.x + q.z) - (p.x + p.z))[0]; // towards the viewer: nothing hides the lead
      crew.forEach((d, i) => {
        const sp = d.lead && front ? front : (spots.filter((q) => q !== front)[i % Math.max(1, spots.length - 1)] || spots[0] || { x: T.x, z: T.z });
        const ff = add(new Firefighter(d, sp, T)); if (d.lead) { ff.lineT = 1.5; } F.crew.push(ff);
      });
    }
    if (F.phase === 'fighting') {
      const spraying = F.crew.filter((c) => c.state === 'spray').length;
      if (spraying) {
        F.intensity = Math.max(0, F.intensity - dt * 0.012 * spraying);
        F.sprayT = (F.sprayT || 0) - dt;
        if (F.sprayT <= 0) { F.sprayT = 0.35; NB.Audio.play('spray', { pos: b.top, vol: 0.35 }); NB.UI.fx(b.cx + NB.rr(-3, 3), b.top.y * 0.6, b.cz + NB.rr(-3, 3), 'steam', { vy: 1.2, life: 1.6 }); }
      }
      if (F.intensity <= 0 && F.crew.every((c) => c.done)) { F.phase = 'leaving'; T.depart(true); }
    }
    if (F.phase === 'leaving' && T.done) { F.phase = 'soot'; F.sootT = 0; for (const v of E.list) if (v.fled && v.fled.place === 'fire') v.fled.until = Math.min(v.fled.until, performance.now() / 1000 + NB.rr(5, 40)); }
    if (F.phase === 'soot') { // the walls slowly lose the soot (~10 min)
      F.sootT += dt; const k = Math.min(1, F.sootT / 600), g = Math.round(0x6e + (0xff - 0x6e) * k);
      if (b.sprite) b.sprite.tint = (g << 16) | (Math.round(0x6a + (0xff - 0x6a) * k) << 8) | Math.round(0x66 + (0xff - 0x66) * k);
      if (k >= 1) { if (b.sprite) b.sprite.tint = 0xffffff; E.fire = null; }
    }
  }

  // ---------------------------------------------------------------- visitors (Joel + Mariana from Lenzburg, by Mini)
  // NB.Data.visitors: { members: [ids], car: { color, name, lines }, arrive: ['10:30', '13:00'], leave: ['20:00', '22:00'] }.
  // Arrival / departure times are drawn once per day. The car drives in on the Niederwilerstrasse, parks in Mige's
  // yard, the visitors get out and follow their routines; at leaving time they walk back to the car and it drives off.
  class Visit {
    constructor(d, members, idx) {
      this.d = d; this.members = members; this.car = null; this.state = 'away'; this.leaveT = 0;
      const r = NB.seeded((NB.clock.day || 1) * 7 + 3 + (idx || 0) * 131), w = (a, b) => NB.toMin(a) + r() * (NB.toMin(b) - NB.toMin(a));
      this.arrive = w(d.arrive[0], d.arrive[1]);
      this.leave = d.stay ? this.arrive + d.stay[0] + r() * (d.stay[1] - d.stay[0]) : w(d.leave[0], d.leave[1]); // stay: minutes
      this.parking = (map.parkings && map.parkings[d.park || 'mige']) || (map.farmProps && map.farmProps.parking);
      this.byBus = d.by === 'bus'; // comes and goes with the Postauto (Mitteldorf stop)
      if (this.byBus) { this.stop = map.busStops.find((st) => /Mitteldorf/.test(st.name)) || map.busStops[0]; this.parking = this.stop ? { x: this.stop.x, z: this.stop.z, heading: 0 } : null; }
    }
    busHere() { const c = this.car; return c && !c.done && c.stopT > 0 && Math.hypot(c.x - this.stop.x, c.z - this.stop.z) < 16; }
    here(min) { return min >= this.arrive && min < this.leave; }
    start(instant, reverse) {
      if (!this.parking) return;
      this.state = instant ? 'visiting' : 'arriving';
      if (this.byBus) { // the Postauto from Mellingen (north-east end of the route)
        if (instant) this.members.forEach((m) => m.arrive(this.parking, true));
        else this.car = add(new Vehicle('bus', reverse == null ? false : !!reverse));
        return;
      }
      this.car = add(new Vehicle(this.d.car.type || 'mini', reverse == null ? Math.random() < 0.5 : !!reverse, { parkAt: this.parking, parkedNow: !!instant, color: this.d.car.color, name: this.d.car.name, lines: this.d.car.lines }));
      if (instant) this.members.forEach((m) => m.arrive(this.parking, true));
    }
    update(dt) {
      const min = NB.clock.minutes();
      if (this.state === 'away') { if (this.here(min)) this.start(false); return; }
      if (this.byBus) {
        if (this.state === 'arriving') { if (this.busHere() || !this.car || this.car.done) { this.state = 'visiting'; this.members.forEach((m, i) => m.arrive(this.parking, false, i)); this.car = null; } return; }
        if (this.state === 'visiting') { if (!this.here(min)) { this.state = 'leaving'; this.leaveT = 0; this.members.forEach((m) => m.goToCar(this.parking, true)); } return; }
        if (this.state === 'leaving') { // wait at the stop, then board the next Postauto
          this.leaveT += dt;
          const atStop = this.members.every((m) => m.away || Math.hypot(m.x - this.parking.x, m.z - this.parking.z) < 6) || this.leaveT > 180;
          if (atStop && (!this.car || this.car.done)) this.car = add(new Vehicle('bus', true));
          if (this.car && this.busHere() && atStop) { this.members.forEach((m) => { if (!m.away) m.enterCar(); }); this.state = 'departing'; }
          return;
        }
        if (this.state === 'departing' && (!this.car || this.car.done)) { this.state = 'away'; this.car = null; }
        return;
      }
      if (this.state === 'arriving') { if (this.car.parked) { this.state = 'visiting'; this.members.forEach((m, i) => m.arrive(this.parking, false, i)); } return; }
      if (this.state === 'visiting') { if (!this.here(min)) { this.state = 'leaving'; this.leaveT = 0; this.members.forEach((m) => m.goToCar(this.parking)); } return; }
      if (this.state === 'leaving') {
        this.leaveT += dt;
        if (this.members.every((m) => m.away) || this.leaveT > 150) {
          this.members.forEach((m) => { if (!m.away) m.enterCar(); });
          this.car.depart(Math.random() < 0.5); this.state = 'departing';
        }
        return;
      }
      if (this.state === 'departing' && (!this.car || this.car.done)) { this.state = 'away'; this.car = null; }
    }
  }
  const visits = [];

  // ---------------------------------------------------------------- residents' car trips (André's army jeep)
  // NB.Data.outings: { parking (map.parkings key), street (the street the driveway joins), car: { type, color, name, lines },
  //   trips: [{ members, go: [from, to], away: [min, max] minutes, chance, cruise, leave: { id: line }, back: { id: line } }] }
  // The car stays parked at home; for each trip that happens today the members walk to it, drive off along their
  // street and the Niederwilerstrasse, are away for a while (a cruising jeep rumbles through once) and come back.
  class Outing {
    constructor(d, idx) {
      this.d = d; this.idx = idx; this.parking = map.parkings && map.parkings[d.parking];
      this.state = 'home'; this.car = null; this.trip = null; this.cruiser = null;
      this.schedule();
    }
    schedule() {
      this.day = NB.clock.day || 1;
      const r = NB.seeded(this.day * 13 + 5 + this.idx * 97);
      this.trips = this.d.trips.map((t) => {
        const go = NB.toMin(t.go[0]) + r() * (NB.toMin(t.go[1]) - NB.toMin(t.go[0])), on = r() < (t.chance == null ? 1 : t.chance);
        return Object.assign({}, t, { goAt: go, backAt: go + t.away[0] + r() * (t.away[1] - t.away[0]), on, done: !on });
      });
    }
    members(trip) { return E.list.filter((e) => e.kind === 'villager' && trip.members.includes(e.c.id)); }
    carOpts(extra) { return Object.assign({ color: this.d.car.color, name: this.d.car.name, lines: this.d.car.lines }, extra); }
    // road between the map edge and the parking spot: Niederwilerstrasse (route) -> own street -> driveway (A*)
    road(arriving) {
      if (!this.rd) {
        const P = this.parking, route = map.route;
        const st = NB.Scene.streets.filter((q) => q.name === this.d.street).sort((a, b) => b.pts.length - a.pts.length)[0];
        const dense = [];
        st.pts.forEach(([x, z], k) => {
          if (k) { const [x0, z0] = st.pts[k - 1], n = Math.max(1, Math.ceil(Math.hypot(x - x0, z - z0) / 2)); for (let j = 1; j <= n; j++) dense.push({ x: x0 + ((x - x0) * j) / n, z: z0 + ((z - z0) * j) / n }); }
          else dense.push({ x, z });
        });
        const e = nearestIdx(dense, P);
        // drive to the nearer end of the street that joins the route (counted along the street)
        const endDist = (p) => Math.min(...route.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
        const firstOk = endDist(dense[0]) < 4, lastOk = endDist(dense[dense.length - 1]) < 4;
        const useFirst = firstOk && (!lastOk || e < dense.length - 1 - e) || (!firstOk && !lastOk && endDist(dense[0]) < endDist(dense[dense.length - 1]));
        const toEnd = useFirst ? dense.slice(0, e + 1).reverse() : dense.slice(e);
        const k = nearestIdx(route, toEnd[toEnd.length - 1]);
        const [sx, sz] = map.toCell(dense[e].x, dense[e].z), [tx, tz] = map.toCell(P.x, P.z);
        // driveway over the lawn, not across the boule court / flower beds
        const cost = map.walkCost.slice(), K = map.kochProps;
        if (K) for (let cz = 0; cz < map.h; cz++) for (let cx = 0; cx < map.w; cx++) {
          const c = map.cellCentre(cx, cz), dx = c.x - K.court.x, dz = c.z - K.court.z;
          const [a, b] = K.court.alongX ? [dx, dz] : [dz, dx];
          if (Math.abs(a) < K.court.len / 2 + 1 && Math.abs(b) < K.court.wid / 2 + 1) cost[cz * map.w + cx] = 0;
        }
        const cells = NB.findPath(cost, map.w, map.h, sx, sz, tx, tz) || [];
        const drive = cells.filter((_, j) => j % 3 === 2).map(({ x: cx, y: cz }) => Object.assign(map.cellCentre(cx, cz), { slow: true }));
        this.rd = { toEnd, k, drive };
      }
      const { toEnd, k, drive } = this.rd, route = map.route;
      const out = Math.random() < 0.5 ? route.slice(k) : route.slice(0, k + 1).reverse(); // junction -> one end of the village
      if (arriving) {
        const road = out.slice().reverse().concat(toEnd.slice().reverse());
        return laneOffset(road, 1.4).concat(drive, [{ x: this.parking.x, z: this.parking.z, slow: true }]);
      }
      return drive.slice().reverse().concat(laneOffset(toEnd.concat(out), 1.4));
    }
    // road between home and a destination bay (the petrol station on the Bremgarterstrasse): driveway -> own
    // street -> Niederwilerstrasse to its north-east end -> main road -> bay (and back)
    roadTo(dest, back) {
      this.road(true); // builds this.rd
      const { toEnd, k, drive } = this.rd, route = map.route, P = map.parkings[dest], R = NB.Scene.racer || [];
      const main = R.map(([x, z]) => ({ x, z }));
      const cut = map.fuel ? nearestIdx(main, { x: map.fuel.road[0], z: map.fuel.road[1] }) : main.length - 1;
      const toNE = route.slice(0, k + 1).reverse(); // junction -> route[0] (the north-east end, where the main road starts)
      const out = toEnd.concat(toNE, main.slice(0, cut + 1));
      if (!back) return drive.slice().reverse().concat(laneOffset(out, 1.4), [{ x: P.x, z: P.z, slow: true }]);
      return laneOffset(out.slice().reverse(), 1.4).concat(drive, [{ x: this.parking.x, z: this.parking.z, slow: true }]);
    }
    start() {
      if (!this.parking) return;
      const min = NB.clock.minutes();
      const t = this.trips.find((q) => q.on && min >= q.goAt && min < q.backAt);
      for (const q of this.trips) if (q.goAt <= min) q.done = true;
      if (t) { this.trip = t; t.cruised = true; this.state = 'out'; this.members(t).forEach((m) => { m.enterCar(); }); }
      else this.car = add(new Vehicle(this.d.car.type, false, this.carOpts({ parkAt: this.parking, parkedNow: true })));
    }
    update(dt) {
      if (!this.parking) return;
      const min = NB.clock.minutes(), newDay = (NB.clock.day || 1) !== this.day;
      if (this.state === 'home') {
        if (newDay) this.schedule();
        const t = this.trips.find((q) => !q.done && min >= q.goAt);
        if (!t) return;
        t.done = true;
        const ms = this.members(t).filter((m) => !m.away);
        if (min >= t.backAt || !this.car || !this.car.parked || ms.length < t.members.length) return; // missed (time jump) or someone is away
        this.trip = t; this.state = 'boarding'; this.t = 0;
        ms.forEach((m) => m.goToCar(this.parking, false, t.leave && t.leave[m.c.id]));
        return;
      }
      const t = this.trip;
      if (this.state === 'boarding') {
        this.t += dt;
        const ms = this.members(t);
        if (ms.every((m) => m.away) || this.t > 150) {
          ms.forEach((m) => { if (!m.away) m.enterCar(); });
          if (t.dest && map.parkings[t.dest]) { this.car.driveTo(this.roadTo(t.dest, false), map.parkings[t.dest]); this.state = 'toDest'; }
          else { this.car.departAlong(this.road(false)); this.state = 'out'; }
          if (NB.UI.onScreen(this.car)) NB.Audio.play('honk', { pos: this.car, rate: 0.85, vol: 0.5 });
        }
        return;
      }
      if (this.state === 'toDest') { // arrived at the destination (petrol station): get out, stay a while
        if (this.car.parked) { const P = map.parkings[t.dest]; this.members(t).forEach((m, i) => m.arrive(P, false, i, t.at && t.at[m.c.id])); this.state = 'atDest'; this.t = 0; }
        return;
      }
      if (this.state === 'atDest') {
        this.t += dt;
        if (this.t > (t.stay || 60)) { this.members(t).forEach((m) => m.goToCar(map.parkings[t.dest], false)); this.state = 'boardingBack'; this.t = 0; }
        return;
      }
      if (this.state === 'boardingBack') {
        this.t += dt;
        const ms = this.members(t);
        if (ms.every((m) => m.away) || this.t > 150) { ms.forEach((m) => { if (!m.away) m.enterCar(); }); this.car.driveTo(this.roadTo(t.dest, true), this.parking); this.state = 'returning'; }
        return;
      }
      if (this.state === 'out') {
        if (this.car && this.car.done) this.car = null;
        if (this.cruiser && this.cruiser.done) this.cruiser = null;
        // cruising: halfway through the ride the jeep rumbles through the village once
        if (t.cruise && !t.cruised && !this.car && min >= (t.goAt + t.backAt) / 2) { t.cruised = true; this.cruiser = add(new Vehicle(this.d.car.type, Math.random() < 0.5, this.carOpts())); }
        if ((min >= t.backAt || newDay) && !this.car && !this.cruiser) {
          this.car = add(new Vehicle(this.d.car.type, false, this.carOpts({ parkAt: this.parking, path: this.road(true) })));
          this.state = 'returning';
        }
        return;
      }
      if (this.state === 'returning' && this.car.parked) {
        this.members(t).forEach((m, i) => m.arrive(this.parking, false, i, t.back && t.back[m.c.id]));
        this.state = 'home'; this.trip = null;
        if (newDay) this.schedule();
      }
    }
  }
  const outings = [];
  Object.assign(NB.Ent, { Visit, Outing, updateFire, visits, outings });
})(window.NB);
