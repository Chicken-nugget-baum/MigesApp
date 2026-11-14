// Vehicles: cars, the Postauto, tractors (driving through and working the fields), the fire engine, the jeep, the racer.
(function (NB) {
  const { E, map, place, say, angleLerp } = NB.Ent;
  // ---------------------------------------------------------------- vehicles on Niederwilerstrasse
  const CAR_COLORS = ['#e05a5a', '#4f8fd6', '#f2f2ea', '#4a4a55', '#9aa0aa', '#5bb07a', '#e8b030'];
  const TRACTOR_COLORS = ['#2f8f3a', '#d23c2a', '#2a5fb0', '#2f8f3a'];
  const TRACTOR_LINES = {
    spring: ['Gsäit wird! 🌱', 'Tuck-tuck-tuck!', "D'Erde isch parat."],
    summer: ['Ärnte! ☀️', 'Tuck-tuck-tuck!', 'Hüt wird gheuet!'],
    autumn: ['Pflüege, bevor\'s chalt wird.', 'Tuck-tuck-tuck!', "S'Feld mues umegräblet si."],
    winter: ['Tuck-tuck-tuck!', 'Im Winter rueht s\'Feld.', 'Mischt usfüere!'],
  };
  function laneOffset(pts, off) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { x: p.x - (dz / l) * off, z: p.z + (dx / l) * off }; // right-hand side
    });
  }
  const nearestIdx = (pts, p) => { let best = 0, bd = Infinity; pts.forEach((q, k) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = k; } }); return best; };
  class Vehicle {
    // opts: { parkAt: {x, z, heading}, parkedNow, color, name, lines } - a car that leaves the road and parks (visitors)
    constructor(type, reverse, opts) {
      opts = opts || {};
      this.type = type; this.kind = 'vehicle';
      const base = map.route.slice(); if (reverse) base.reverse();
      this.pts = laneOffset(base, 1.5);
      this.x = this.pts[0].x; this.z = this.pts[0].z; this.i = 1; this.heading = 0; this.life = 0;
      this.color = opts.color || NB.pick(type === 'tractor' ? TRACTOR_COLORS : CAR_COLORS); this.sprite = new PIXI.Sprite(); this.shown = null;
      this.maxSpeed = type === 'bus' ? 7 : type === 'tractor' ? 4 : type === 'mini' ? 7 : type === 'tanker' ? 6 : type === 'firetruck' ? 15 : type === 'jeep' ? 6.5 : type === 'racer' ? 31 : NB.rr(8, 10);
      this.speed = this.maxSpeed; this.stopT = 0; this.done = false; this.putT = 0; this.pull = 0;
      this.name = opts.name || (type === 'bus' ? 'Postauto' : type === 'tractor' ? 'Traktor' : 'Auto');
      this.lines = opts.lines || null;
      this.parkAt = opts.parkAt || null; this.parked = false; this.departing = false;
      if (this.parkAt) {
        const k = nearestIdx(base, this.parkAt);
        if (opts.parkedNow) { this.pts = []; this.i = 0; this.x = this.parkAt.x; this.z = this.parkAt.z; this.heading = this.shown = this.parkAt.heading; this.parked = true; this.life = 5; }
        else this.pts = laneOffset(base.slice(0, k + 1), 1.5).concat([{ x: this.parkAt.x, z: this.parkAt.z }]);
      }
      if (opts.path && !opts.parkedNow) { this.pts = opts.path; this.x = this.pts[0].x; this.z = this.pts[0].z; this.i = 1; }
      this.stops = [];
      if (type === 'bus') for (const s of map.busStops) {
        let best = -1, bd = 8;
        base.forEach((p, k) => { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < bd) { bd = d; best = k; } });
        if (best > 0) this.stops.push(best);
      }
    }
    // leave the parking spot along a given path
    departAlong(pts) {
      this.pts = [{ x: this.x, z: this.z }].concat(pts); this.i = 1;
      this.parked = false; this.departing = true; this.life = 5; this.speed = 0;
    }
    // drive a path and park at its end (e.g. to the petrol station and back)
    driveTo(pts, parkAt) {
      this.pts = [{ x: this.x, z: this.z }].concat(pts); this.i = 1;
      this.parkAt = parkAt; this.parked = false; this.departing = false; this.life = 5; this.speed = 0;
    }
    // from the parking spot back onto the road and out of the village
    depart(reverse) {
      const base = map.route.slice(); if (reverse) base.reverse();
      const k = nearestIdx(base, this.parkAt);
      this.pts = [{ x: this.x, z: this.z }].concat(laneOffset(base.slice(k), 1.5)); this.i = 1;
      this.parked = false; this.departing = true; this.life = 5; this.speed = 0;
    }
    update(dt) {
      this.life += dt;
      if (this.parked) return this.pose(dt);
      if (this.type === 'tractor') tractorNoise(this, dt);
      else if (this.type === 'jeep') tractorNoise(this, dt, 1.45);
      const p = this.pts[this.i];
      if (!p) {
        if (this.parkAt && !this.departing) { this.parked = true; this.speed = 0; this.heading = this.parkAt.heading; return this.pose(dt); }
        this.done = true; stopEngine(this); NB.world.remove(this.sprite); return;
      }
      if (this.stopT > 0) { this.stopT -= dt; if (this.stopT <= 0 && NB.UI.onScreen(this) && NB.Env.darkness < 0.7) NB.Audio.horn({ pos: this }); return this.pose(dt); }
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.01) this.heading = Math.atan2(dx, dz);
      let target = this.maxSpeed;
      if (this.parkAt && (this.i >= this.pts.length - 1 || (this.departing && this.i <= 1))) target = Math.min(target, 3); // crawl into / out of the yard
      if (this.type === 'racer') { // full throttle, then hard on the brakes for the roundabout (the last stretch of the path)
        const left = this.pts.length - this.i;
        if (left <= (this.brakeAt || 8)) target = Math.min(target, 7);
        this.roarT = (this.roarT || 0) - dt;
        if (this.roarT <= 0) { this.roarT = 6.4; NB.Audio.play('racer', { pos: this, vol: 0.9, rate: this.speed > 20 ? 1.1 : 0.95 }); }
        if (this.speed < 12 && this.blockedT > 2 && left > (this.brakeAt || 8)) target = Math.max(target, 6); // never fully stuck behind someone
      }
      if (p.slow) target = Math.min(target, 3.2); // driveway
      // people on the street ahead jump aside, cats scurry off
      for (const o of E.list) {
        if (o.kind === 'cat') {
          const ox = o.x - this.x, oz = o.z - this.z, ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
          if (ahead > -1 && ahead < 24 && side < 3.5) o.scare(this);
          continue;
        }
        if (o.kind !== 'villager' || o.inside || o.away || o.evading) continue;
        const ox = o.x - this.x, oz = o.z - this.z, ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (ahead > 0 && ahead < (this.type === 'firetruck' ? 45 : this.type === 'racer' ? 70 : 26) && side < 5 && map.streetDist(o.x, o.z) < 1.2) o.evade(this);
        if (this.type === 'racer' && this.speed > 18 && Math.abs(ahead) < 20 && side < 14 && Math.random() < dt * 0.6 && !o.raserT) { o.raserT = performance.now(); say(o, NB.pick(['Raser!', 'Langsamer, du Löli!', "Jede Abig s'gliiche!", 'Das git no es Unglück!', 'Nummere ufschriibe!']), { quiet: true }); }
      }
      // blocked for a while (someone standing in the way): creep on regardless; the fire engine has right of way
      this.blockedT = this.speed < 0.3 ? (this.blockedT || 0) + dt : 0;
      if (this.type === 'firetruck') { /* emergency: others get out of the way */ }
      else if (this.blockedT < 6) for (const o of E.list) {
        if (o === this || o.parked || (o.kind !== 'vehicle' && !(o.kind === 'villager' && !o.inside && !o.away) && o.kind !== 'cat' && !(o.kind === 'dog' && !o.away))) continue;
        const ox = o.x - this.x, oz = o.z - this.z;
        const ahead = (ox * dx + oz * dz) / (d || 1), side = Math.abs(ox * dz - oz * dx) / (d || 1);
        if (!(ahead > 0 && ahead < 14 && side < 2)) continue;
        if (o.kind === 'vehicle') { if (!(o.stopT > 0 && o.pull > 0.6)) target = Math.min(target, Math.max(0, (ahead - 8) * 1.5)); }
        else if (o.evading || o.state === 'flee') { if (side < 1.4) target = Math.min(target, 3 + ahead * 0.5); } // already getting out of the way: just slow down
        else target = Math.min(target, Math.max(0, (ahead - 3.5) * 1.5));
      } else target = Math.min(target, 2);
      this.speed += NB.clamp(target - this.speed, -(this.type === 'racer' ? 18 : 12) * dt, (this.type === 'firetruck' ? 8 : this.type === 'racer' ? 11 : 4) * dt);
      const step = this.speed * dt;
      if (d <= step) { this.x = p.x; this.z = p.z; if (this.stops.includes(this.i)) { this.stopT = 6; this.speed = 0; } this.i++; }
      else { this.x += (dx / d) * step; this.z += (dz / d) * step; }
      this.pose(dt);
    }
    pose(dt) {
      this.shown = this.shown == null ? this.heading : angleLerp(this.shown, this.heading, Math.min(1, dt * 6));
      // the Postauto pulls in to the right at its stops so cars can pass
      this.pull += NB.clamp((this.stopT > 0.6 ? 1 : 0) - this.pull, -2 * dt, 2 * dt);
      const po = this.pull * 1.4;
      place(this, NB.Models.vehicle(this.type, this.color, this.shown), this.x - Math.cos(this.heading) * po, 0, this.z + Math.sin(this.heading) * po);
      // fade in / out at the ends of the street (not when pulling into the yard)
      const left = this.pts.length - this.i, arriving = this.parkAt && !this.departing;
      this.sprite.alpha = Math.min(1, this.life / 0.8, left < 2 && !arriving ? Math.max(0, left / 2) : 1);
    }
    click() {
      if (this.lines) { say(this, NB.pick(this.lines)); NB.Audio.play(this.type === 'mini' ? 'honkMini' : 'honkTruck', { pos: this, rate: this.type === 'mini' ? 1.35 : 1, vol: 0.7 }); }
      else if (this.type === 'bus') { say(this, NB.pick(['Tü-ta-to! 🎺', 'Nöchsti Halt: Nesselnbach, Mitteldorf.', 'Bitte iistiige!'])); NB.Audio.horn({ pos: this }); }
      else if (this.type === 'tractor') { say(this, NB.pick(TRACTOR_LINES[NB.season] || TRACTOR_LINES.summer)); NB.Audio.play('honkTractor', { pos: this, rate: 0.7 }); }
      else if (this.type === 'racer') { say(this, NB.pick(['BRRRRAAAP!', 'Us em Wäg, ich ha Vollgas!', 'Bis zum Kreisel und zrugg. Jede Abig.', 'Mini Mueter weiss nüt dervo.'])); NB.Audio.play('racer', { pos: this, vol: 0.8, rate: 1.2 }); }
      else { say(this, NB.pick(['Tüüt tüüt!', 'Ich ha\'s pressant!', 'Langsam dur s\'Dorf, gäll!'])); NB.Audio.play('honk', { pos: this }); }
    }
    get visible() { return true; }
    top() { return { x: this.x, y: this.type === 'bus' || this.type === 'tanker' || this.type === 'firetruck' ? 3.8 : this.type === 'tractor' ? 2.9 : 2.3, z: this.z }; }
  }
  // diesel putter while the tractor is on screen (overlapping short engine samples)
  function tractorNoise(t, dt, rate) {
    if (NB.Audio.has('tractor')) { // real engine loop that follows the tractor
      if (!t.engine) t.engine = NB.Audio.loop('tractor', { pos: t, vol: 0.5, rate: rate || 1 });
      else t.engine.update(t, rate || 1);
      return;
    }
    t.putT -= dt;
    if (t.putT > 0) return;
    t.putT = 0.55;
    if (NB.UI.onScreen(t)) NB.Audio.play('engine', { pos: t, vol: 0.2, rate: rate || 1 });
  }
  const stopEngine = (t) => { if (t.engine) { t.engine.stop(); t.engine = null; } };

  // ---------------------------------------------------------------- tractor working a field
  // Drives a block of rows (map.fieldLanes) back and forth, kicks up dust, then fades out at the last row.
  class FieldTractor {
    constructor(field, lanes) {
      this.kind = 'tractor'; this.type = 'tractor'; this.name = 'Traktor'; this.field = field;
      this.lanes = lanes; this.i = 0; this.leg = 'row'; this.target = lanes[0].b;
      this.color = NB.pick(TRACTOR_COLORS); this.sprite = new PIXI.Sprite(); this.shown = null;
      this.x = lanes[0].a.x; this.z = lanes[0].a.z; this.heading = Math.atan2(this.target.x - this.x, this.target.z - this.z);
      this.life = 0; this.fade = 1; this.done = false; this.leaving = false; this.dustT = 0; this.putT = NB.rr(0, 0.5); this.pauseT = 0;
    }
    update(dt) {
      this.life += dt;
      if (this.leaving) {
        this.fade -= dt * 0.7;
        if (this.fade <= 0) { this.done = true; stopEngine(this); NB.world.remove(this.sprite); return; }
        return this.pose(dt);
      }
      if (this.pauseT > 0) { this.pauseT -= dt; tractorNoise(this, dt, 0.8); return this.pose(dt); }
      const t = this.target, dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
      const speed = this.leg === 'row' ? 3.2 : 4.5;
      if (d > 0.01) this.heading = Math.atan2(dx, dz);
      const step = Math.min(d, speed * dt);
      if (d > 0) { this.x += (dx / d) * step; this.z += (dz / d) * step; }
      if (d <= speed * dt + 0.01) {
        if (this.leg === 'row') {
          this.i++;
          if (this.i >= this.lanes.length) this.leaving = true;
          else { this.leg = 'turn'; this.target = this.lanes[this.i].a; }
        } else { this.leg = 'row'; this.target = this.lanes[this.i].b; }
      }
      this.dustT -= dt;
      if (this.leg === 'row' && this.dustT <= 0 && NB.UI.onScreen(this)) {
        this.dustT = 0.16;
        NB.UI.fx(this.x - Math.sin(this.heading) * 2 + NB.rr(-0.6, 0.6), 0.3, this.z - Math.cos(this.heading) * 2 + NB.rr(-0.6, 0.6), 'dust', { vy: 0.5, life: 1.0 });
      }
      tractorNoise(this, dt, this.leg === 'row' ? 0.9 : 1.05);
      this.pose(dt);
    }
    pose(dt) {
      this.shown = this.shown == null ? this.heading : angleLerp(this.shown, this.heading, Math.min(1, dt * 4));
      place(this, NB.Models.vehicle('tractor', this.color, this.shown), this.x, 0, this.z);
      this.sprite.alpha = Math.min(1, this.life / 1.2, this.fade);
    }
    click() {
      say(this, NB.pick(TRACTOR_LINES[NB.season] || TRACTOR_LINES.summer));
      NB.Audio.play('honkTractor', { pos: this, rate: 0.7 });
      this.pauseT = 2.5; // the farmer stops for a chat
    }
    get visible() { return true; }
    top() { return { x: this.x, y: 2.9, z: this.z }; }
  }
  Object.assign(NB.Ent, { Vehicle, FieldTractor, laneOffset, nearestIdx });
})(window.NB);
