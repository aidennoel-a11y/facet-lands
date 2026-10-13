import { Quaternion } from 'three';
import { Structures } from '../survival/Structures.js';
import { Torches } from '../items/Torches.js';

// Online, one world for everyone (see Multiplayer and server/server.mjs).
//
//  - What's done to the world (trees felled and their stumps, things
//    picked up and dropped, built, lit, opened, dug, torches put up) goes
//    to the server, which keeps it and passes it on; whoever joins later is
//    sent the lot. Each player's own changes are found by comparing the
//    world now with what was last sent, twice a second (see #edits).
//  - The host runs the sky: the weather, the drifting clouds, the season.
//    The others follow it (see Weather.follow). The wind blows by the
//    room's shared clock, so the grass bends and the gusts roll the same
//    for everyone.
//  - The host runs the animals, around everyone; the others draw them as
//    they're sent (see Wildlife.snapshot, receive). Their calls are heard
//    by all, from where they are; a bite reaches whoever it was meant for;
//    an arrow from one of the others reaches the host's animal.

const EDIT_EVERY = 0.5;
const SKY_EVERY = 2;
const WILD_EVERY = 1 / 5;
const SETS = ['felled', 'taken', 'mushrooms', 'broken'];
const MAPS = ['stumps', 'structures', 'torches', 'drops'];

// A structure's record, without what changes by the second (a fire's fuel
// burning down, a crop growing), to tell when it's really been changed.
function structureSign(rec) {
  return JSON.stringify({ ...rec, fuel: Math.round(rec.fuel / 30), growth: Math.round((rec.growth ?? 0) * 10), watered: !!rec.watered, jobs: rec.jobs?.map((j) => [j.stack?.id, j.out?.id, j.done]) });
}

export class WorldSync {
  /**
   * @param o  { mp, game, trees, mushrooms, torches, weather, clouds, seasons, wildlife, lightning, sound, pan(x, z), windStrength(), dayNight, dayLength() (minutes) }
   */
  constructor(o) {
    Object.assign(this, o);
    this.reset();
    this.mp.onWorld = (msg) => this.#receive(msg);
    // (Arrows in the host's animals, a guest's butchering, shearing, feeding: to the host.)
    this.wildlife.onAct = (k, a, data = {}) => this.mp.send({ t: 'tohost', m: { k, id: a.id, ...data } });
    // (Your felling, blow by blow, the fall, the trunk cut up: for the others to see.)
    this.game.felling.onEvent = (e) => this.online && this.fx.push(e);
    // (The host's storm strikes round any of you, and each strike goes out.)
    this.lightning.centres = () => this.others();
    // (Your spears and arrows: for the others to see fly, and hear.)
    this.game.onShot = (f) => {
      if (!this.online) return;
      this.fx.push({ k: 'shot', ...f });
      this.emit('whoosh', f.p[0], f.p[2], 0.5, 1, true);
    };
    this.lightning.onBolt = (b) => this.online && this.mp.isHost && this.fx.push({ k: 'bolt', ...b });
  }

  reset() {
    this.sent = { ...Object.fromEntries(SETS.map((k) => [k, new Set()])), ...Object.fromEntries(MAPS.map((k) => [k, new Map()])) };
    this.started = false;
    this.pending = [];
    this.editWait = 0;
    this.skyWait = 0;
    this.wildWait = 0;
    this.fx = [];
    this.wasHost = null;
    this.crownsSent = new Set();
    this.crownWait = 0;
  }

  get online() {
    return this.mp.connected;
  }

  // The world as it is now, by key: the sets, and each record with its sign
  // (what tells it's changed).
  #now() {
    const g = this.game;
    const now = {
      felled: this.trees.removed, taken: g.items.taken, mushrooms: this.mushrooms?.taken ?? new Set(), broken: g.rocks?.removed ?? new Set(),
      stumps: new Map(), structures: new Map(), torches: new Map(), drops: new Map(),
    };
    for (const st of g.felling.stumpsJSON()) now.stumps.set(st.key, [{ k: st.key, ...st }, st.key]);
    for (const rec of g.structures.toJSON()) {
      const k = Structures.key(rec);
      now.structures.set(k, [{ k, ...rec }, structureSign(rec)]);
    }
    for (const t of this.torches.records()) now.torches.set(t.k, [t, String(t.lit)]);
    for (const d of g.items.drops) {
      const r2 = (v) => Math.round(v * 100) / 100;
      // (Which way it lies: stuck in the ground as it went in, or turned as it fell.)
      const q = d.stuck ? d.mesh.quaternion.toArray().map(r2) : undefined;
      now.drops.set(d.uid, [{ k: d.uid, stack: d.stack, x: r2(d.x), y: r2(d.y), z: r2(d.z), q, turn: q ? undefined : r2(d.mesh.rotation.y) }, `${d.stack.id}:${d.stack.count}`]);
    }
    return now;
  }

  // Your changes since last time: sent, and remembered as sent.
  #edits() {
    const now = this.#now();
    const e = { add: {}, put: {}, del: {} };
    let any = false;
    for (const k of SETS) {
      const sent = this.sent[k], list = [];
      for (const key of now[k]) if (!sent.has(key)) (list.push(key), sent.add(key));
      if (list.length) (e.add[k] = list), (any = true);
    }
    for (const k of MAPS) {
      const sent = this.sent[k], put = [], del = [];
      for (const [key, [rec, sign]] of now[k]) if (sent.get(key) !== sign) (put.push(rec), sent.set(key, sign));
      for (const key of sent.keys()) if (!now[k].has(key)) (del.push(key), sent.delete(key));
      if (put.length) (e.put[k] = put), (any = true);
      if (del.length) (e.del[k] = del), (any = true);
    }
    if (any) this.mp.send({ t: 'edit', e });
  }

  // Someone else's changes, made here (and remembered as sent, so they
  // don't go back).
  #apply(e) {
    const g = this.game;
    for (const key of e.add?.felled ?? []) (this.sent.felled.add(key), this.trees.removeKey(key));
    for (const key of e.add?.taken ?? []) (this.sent.taken.add(key), g.items.takeKey(key));
    for (const key of e.add?.mushrooms ?? []) (this.sent.mushrooms.add(key), this.mushrooms?.takeKey(key));
    for (const key of e.add?.broken ?? []) (this.sent.broken.add(key), g.rocks?.removeKey(key));
    for (const st of e.put?.stumps ?? []) (this.sent.stumps.set(st.k, st.k), g.felling.addStump(st));
    for (const rec of e.put?.structures ?? []) (this.sent.structures.set(rec.k, structureSign(rec)), g.structures.apply(rec));
    for (const key of e.del?.structures ?? []) (this.sent.structures.delete(key), g.structures.removeKey(key));
    for (const t of e.put?.torches ?? []) (this.sent.torches.set(t.k, String(t.lit)), this.torches.apply(t));
    for (const key of e.del?.torches ?? []) (this.sent.torches.delete(key), this.torches.removeKey(key));
    for (const d of e.put?.drops ?? []) {
      this.sent.drops.set(d.k, `${d.stack?.id}:${d.stack?.count}`);
      if (!d.stack || g.items.drops.some((o) => o.uid === d.k)) continue;
      const tilt = Array.isArray(d.q) && d.q.length === 4 ? new Quaternion(...d.q) : null;
      const dropped = g.items.drop(d.stack, d.x, d.y + (tilt ? 0 : 0.05), d.z, { uid: d.k, tilt, turn: Number.isFinite(d.turn) ? d.turn : undefined });
      if (tilt) dropped.settled = true;
    }
    for (const key of e.del?.drops ?? []) (this.sent.drops.delete(key), g.items.removeDrop(key));
  }

  #receive(msg) {
    if (msg.t === 'edit') {
      if (this.started) this.#apply(msg.e);
      else this.pending.push(msg.e);
    } else if (msg.t === 'sky') this.#followSky(msg.sky);
    else if (msg.t === 'wild') {
      if (!this.mp.isHost) this.wildlife.receive(msg.w, msg.w.t);
    } else if (msg.t === 'fx') {
      for (const f of msg.fx) this.#play(f);
    } else if (msg.t === 'tohost' && this.mp.isHost) {
      const m = msg.m;
      if (m?.k === 'crowns' && typeof m.key === 'string' && Array.isArray(m.list)) this.wildlife.remoteCrowns.set(m.key, m.list);
      else if (m && Number.isFinite(m.id)) this.wildlife.act(m.k, m.id, m);
    }
  }

  // The host's sky, here.
  #followSky(sky) {
    if (!sky || this.mp.isHost) return;
    this.weather.follow(sky.weather);
    // (The clouds: as far along as theirs, allowing for the time it took to get here.)
    const late = Math.max(0, Math.min(5, (this.mp.roomTime() ?? 0) - (sky.at ?? 0)));
    const travel = sky.travel + late * 0.25 * (0.25 + 0.75 * (sky.wind ?? 0.5)); // (as Clouds drift: see its update)
    if (this.clouds.travelTarget === null) this.clouds.travel = travel;
    this.clouds.travelTarget = travel;
    // The time of day: the host's, as it is now (it ran on while this came).
    // (Kept to it all along: a slower computer's clock would fall behind.)
    if (Number.isFinite(sky.hour) && this.dayNight) {
      const rate = sky.playing ? 24 / (this.dayLength() * 60) : 0;
      const target = (((sky.hour + late * rate) % 24) + 24) % 24;
      let diff = target - this.dayNight.hour;
      diff = ((diff + 36) % 24) - 12; // (the short way round midnight)
      this.dayNight.hour = (this.dayNight.hour + (Math.abs(diff) > 0.1 ? diff : diff * 0.5) + 24) % 24;
    }
    if (Number.isFinite(sky.season) && this.seasons.auto) {
      let d = sky.season - this.seasons.time;
      d = ((d % 4) + 6) % 4 - 2;
      this.seasons.time = (this.seasons.time + (Math.abs(d) > 0.05 ? d : d * 0.5) + 4) % 4;
    }
  }

  // A sound from one of the animals (or the like), where it happened: as
  // loud as it was for the one it was made for, allowing for how much
  // nearer or further you are.
  #play(f) {
    if (f.to !== undefined) {
      // (Meant for one of us: a bite.)
      if (f.to !== this.mp.id) return;
      if (f.k === 'hurt') this.game.player.damage(f.amount, f.kind);
      else if (f.k === 'poison') this.game.player.poison();
      return;
    }
    if (f.k === 'chop' || f.k === 'fell' || f.k === 'trunk') {
      // (Someone else felling: the blows, the tree coming down, the trunk cut up.)
      this.game.felling.remote(f);
      if (f.k === 'chop') {
        const hit = this.trees.findKey(f.key), cam = this.game.camera.position;
        const d = hit ? Math.hypot(hit.x - cam.x, hit.z - cam.z) : Infinity;
        if (d < 120) this.sound.call('chop', this.pan(hit.x, hit.z), Math.min(0.5, 6 / (d + 6)));
      }
      return;
    }
    if (f.k === 'shot') return this.game.ghostShot(f);
    if (f.k === 'bolt') return this.lightning.strikeAt(f.x, f.z, f.seed, f.pulses);
    if (!f.n) return;
    const cam = this.game.camera.position;
    const d = Math.hypot(f.x - cam.x, f.z - cam.z);
    const fall = (r) => 1 / (1 + (r / 25) ** 2);
    const v = Math.min(1, f.v * Math.min(4, fall(d) / fall(f.d ?? d)));
    if (v < 0.02 || d > 900) return;
    this.sound.call(f.n, this.pan(f.x, f.z), v);
  }

  /**
   * Call every frame (after the world's update): sends your changes, and,
   * the host, the sky and the animals.
   */
  update() {
    // (By the clock, not the frames: on a slow computer too, it all goes out in time.)
    const t = performance.now() / 1000, dt = Math.min(5, t - (this.lastAt ?? t));
    this.lastAt = t;
    if (!this.online) {
      if (this.wasHost !== null) {
        // (Off line again: the animals and the sky are yours.)
        this.wildlife.mirror = false;
        this.weather.following = false;
        this.lightning.follower = false;
        this.clouds.travelTarget = null;
        this.reset();
      }
      return;
    }
    const host = this.mp.isHost;
    if (host !== this.wasHost) {
      // Becoming the host, or joining: the animals are yours to run, or the host's.
      if (this.wasHost === false && host) {
        this.weather.following = false;
        this.clouds.travelTarget = null;
        this.wildlife.mirror = false;
        this.wildlife.clear(); // (theirs were only drawn: yours come now)
      }
      if (!host) {
        this.wildlife.clear();
        this.wildlife.mirror = true;
      }
      this.lightning.follower = !host; // (the host's storm strikes for everyone)
      this.crownsSent.clear(); // (a new host: the trees round you, for its animals, again)
      this.wasHost = host;
    }
    // (Once the world's loaded: the world as the room has it, then yours from here on.)
    // (A different world loaded: its changes are sent afresh.)
    if (this.started && this.game.seed !== this.seed) this.reset(), (this.wasHost = host);
    if (!this.started) {
      const w0 = this.mp.welcome;
      if (this.game.seed === null || this.game.seed === undefined || String(this.game.seed) !== String(w0?.world?.seed)) return;
      this.seed = this.game.seed;
      this.started = true;
      const w = this.mp.welcome;
      if (w?.edits) this.#apply(w.edits);
      for (const e of this.pending) this.#apply(e);
      this.pending = [];
      if (w?.sky) this.#followSky(w.sky);
      this.game.items.uidPrefix = `p${this.mp.id}r${Math.floor(Math.random() * 1e6)}`;
    }
    // (Before the edits: a tree's fall goes out before the news that it's gone.)
    if (this.fx.length) {
      this.mp.send({ t: 'fx', fx: this.fx });
      this.fx = [];
    }
    if ((this.editWait -= dt) <= 0) {
      this.editWait = EDIT_EVERY;
      this.#edits();
    }
    if (!host) {
      if ((this.crownWait -= dt) <= 0) {
        this.crownWait = 2;
        this.#sendCrowns();
      }
      return;
    }
    if ((this.skyWait -= dt) <= 0) {
      this.skyWait = SKY_EVERY;
      this.mp.send({ t: 'sky', sky: { weather: this.weather.toSky(), travel: +this.clouds.travel.toFixed(2), wind: this.windStrength?.() ?? 0.5, season: +this.seasons.time.toFixed(4), hour: +this.dayNight.hour.toFixed(4), playing: this.dayNight.playing !== false, at: this.mp.roomTime() } });
    }
    if (this.mp.others.size && (this.wildWait -= dt) <= 0) {
      this.wildWait = WILD_EVERY;
      const points = this.others().map((o) => ({ x: o.x, z: o.z }));
      const w = this.wildlife.snapshot(points);
      w.t = +this.mp.roomTime().toFixed(3);
      this.mp.send({ t: 'wild', w });
    }
  }

  // A guest's: the trees round you, chunk by chunk, to the host, so its
  // songbirds and monkeys can settle in them (see Wildlife.remoteCrowns).
  #sendCrowns() {
    const C = this.game.config?.chunkSize ?? 64, cam = this.game.camera.position;
    const ccx = Math.floor(cam.x / C), ccz = Math.floor(cam.z / C);
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const key = `${ccx + dx},${ccz + dz}`;
        if (this.crownsSent.has(key)) continue;
        const list = this.trees.crowns.get(key);
        if (!list) continue;
        this.crownsSent.add(key);
        this.mp.send({ t: 'tohost', m: { k: 'crowns', key, list: Array.from(list, (v) => Math.round(v * 10) / 10) } });
      }
    }
  }

  /** Where the others are (online; anyone): [{ x, z }], for the frogs to dive from. */
  people() {
    if (!this.online) return [];
    return [...this.mp.others.values()].filter((r) => r.root.visible).map((r) => ({ x: r.root.position.x, z: r.root.position.z }));
  }

  /** The others, for the host's animals to mind (see Wildlife: ctx.others). */
  others() {
    if (!this.online || !this.mp.isHost) return [];
    return [...this.mp.others.values()].filter((r) => r.root.visible).map((r) => ({
      id: r.id, x: r.root.position.x, y: r.root.position.y, z: r.root.position.z, yaw: r.yaw ?? 0, speed: r.speed ?? 0,
      crouch: !!(r.flags & 1), sprint: !!(r.flags & 2), swim: !!(r.flags & 4), fly: !!(r.flags & 8),
    }));
  }

  /**
   * An animal's sound, for everyone to hear from where it is (see
   * Wildlife: ctx.emit): the others, and you too (unless `heard`: it was
   * made for you, and you've heard it), as loud as it is from where you are.
   */
  emit(n, x, z, v, d, heard = false) {
    if (!this.online) return;
    const f = { n, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, v: Math.round(v * 100) / 100, d: Math.round(d) };
    if (this.fx.length < 60) this.fx.push(f);
    if (!heard) this.#play(f);
  }

  /** Something for one of the others alone (a bite: see Wildlife: ctx.emitTo). */
  emitTo(id, what) {
    if (this.online) this.fx.push({ to: id, ...what });
  }
}
