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
const SETS = ['felled', 'taken', 'mushrooms'];
const MAPS = ['stumps', 'structures', 'torches', 'drops'];

// A structure's record, without what changes by the second (a fire's fuel
// burning down, a crop growing), to tell when it's really been changed.
function structureSign(rec) {
  return JSON.stringify({ ...rec, fuel: Math.round(rec.fuel / 30), growth: Math.round((rec.growth ?? 0) * 10), watered: !!rec.watered, jobs: rec.jobs?.map((j) => [j.stack?.id, j.out?.id, j.done]) });
}

export class WorldSync {
  /**
   * @param o  { mp, game, trees, mushrooms, torches, weather, clouds, seasons, wildlife, sound, pan(x, z), windStrength() }
   */
  constructor(o) {
    Object.assign(this, o);
    this.reset();
    this.mp.onWorld = (msg) => this.#receive(msg);
    // (Arrows in the host's animals, a guest's butchering, shearing, feeding: to the host.)
    this.wildlife.onAct = (k, a, data = {}) => this.mp.send({ t: 'tohost', m: { k, id: a.id, ...data } });
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
  }

  get online() {
    return this.mp.connected;
  }

  // The world as it is now, by key: the sets, and each record with its sign
  // (what tells it's changed).
  #now() {
    const g = this.game;
    const now = {
      felled: this.trees.removed, taken: g.items.taken, mushrooms: this.mushrooms?.taken ?? new Set(),
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
      now.drops.set(d.uid, [{ k: d.uid, stack: d.stack, x: r2(d.x), y: r2(d.y), z: r2(d.z) }, `${d.stack.id}:${d.stack.count}`]);
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
    for (const st of e.put?.stumps ?? []) (this.sent.stumps.set(st.k, st.k), g.felling.addStump(st));
    for (const rec of e.put?.structures ?? []) (this.sent.structures.set(rec.k, structureSign(rec)), g.structures.apply(rec));
    for (const key of e.del?.structures ?? []) (this.sent.structures.delete(key), g.structures.removeKey(key));
    for (const t of e.put?.torches ?? []) (this.sent.torches.set(t.k, String(t.lit)), this.torches.apply(t));
    for (const key of e.del?.torches ?? []) (this.sent.torches.delete(key), this.torches.removeKey(key));
    for (const d of e.put?.drops ?? []) {
      this.sent.drops.set(d.k, `${d.stack?.id}:${d.stack?.count}`);
      if (d.stack && !g.items.drops.some((o) => o.uid === d.k)) g.items.drop(d.stack, d.x, d.y + 0.05, d.z, { uid: d.k });
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
      if (m && Number.isFinite(m.id)) this.wildlife.act(m.k, m.id, m);
    }
  }

  // The host's sky, here.
  #followSky(sky) {
    if (!sky || this.mp.isHost) return;
    this.weather.follow(sky.weather);
    // (The clouds: as far along as theirs, allowing for the time it took to get here.)
    const late = Math.max(0, Math.min(5, (this.mp.roomTime() ?? 0) - (sky.at ?? 0)));
    const travel = sky.travel + late * 0.5 * (0.25 + 0.75 * (sky.wind ?? 0.5));
    if (this.clouds.travelTarget === null) this.clouds.travel = travel;
    this.clouds.travelTarget = travel;
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
    if ((this.editWait -= dt) <= 0) {
      this.editWait = EDIT_EVERY;
      this.#edits();
    }
    if (this.fx.length) {
      this.mp.send({ t: 'fx', fx: this.fx });
      this.fx = [];
    }
    if (!host) return;
    if ((this.skyWait -= dt) <= 0) {
      this.skyWait = SKY_EVERY;
      this.mp.send({ t: 'sky', sky: { weather: this.weather.toSky(), travel: +this.clouds.travel.toFixed(2), wind: this.windStrength?.() ?? 0.5, season: +this.seasons.time.toFixed(4), at: this.mp.roomTime() } });
    }
    if (this.mp.others.size && (this.wildWait -= dt) <= 0) {
      this.wildWait = WILD_EVERY;
      const points = this.others().map((o) => ({ x: o.x, z: o.z }));
      const w = this.wildlife.snapshot(points);
      w.t = +this.mp.roomTime().toFixed(3);
      this.mp.send({ t: 'wild', w });
    }
  }

  /** The others, for the host's animals to mind (see Wildlife: ctx.others). */
  others() {
    if (!this.online || !this.mp.isHost) return [];
    return [...this.mp.others.values()].filter((r) => r.root.visible).map((r) => ({
      id: r.id, x: r.root.position.x, y: r.root.position.y, z: r.root.position.z, yaw: r.yaw ?? 0, speed: r.speed ?? 0,
      crouch: !!(r.flags & 1), sprint: !!(r.flags & 2), swim: !!(r.flags & 4), fly: !!(r.flags & 8),
    }));
  }

  /** An animal's sound, for the others to hear from where it is (see Wildlife: ctx.emit). */
  emit(n, x, z, v, d) {
    if (this.online && this.fx.length < 60) this.fx.push({ n, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, v: Math.round(v * 100) / 100, d: Math.round(d) });
  }

  /** Something for one of the others alone (a bite: see Wildlife: ctx.emitTo). */
  emitTo(id, what) {
    if (this.online) this.fx.push({ to: id, ...what });
  }
}
