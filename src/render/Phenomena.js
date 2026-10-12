import { Color, CylinderGeometry, DoubleSide, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';
import { Puffs } from './Puffs.js';
import { burnMap, cloudShadowUniforms } from './cloudShadow.js';

// (Seeded, so what a volcano or a fire gives off is the same for everyone
// online: reseeded from where it is before it's made. See reseed.)
let seedState = 1;
const random = () => {
  let t = (seedState = (seedState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const reseed = (...n) => (seedState = n.reduce((h, v) => (Math.imul(h ^ Math.round(v), 0x9e3779b1) ^ (h >>> 13)) | 0, 0x2545f491));
const rnd = (a, b) => a + random() * (b - a);
// (A number 0..1 for these, the same for everyone.)
const hash01 = (...n) => {
  let h = n.reduce((h, v) => Math.imul(h ^ Math.round(v), 0x85ebca6b) ^ (h >>> 13), 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
};
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const FLAMES = [new Color(1, 0.55, 0.12), new Color(1, 0.78, 0.25), new Color(0.95, 0.3, 0.06)];
const SMOKE = new Color(0.26, 0.25, 0.24);

/**
 * Wildfires. Now and then lightning strikes something that will burn (or
 * a campfire left in the dry, or you with flint and steel) and a fire
 * starts. It spreads over the land a few metres at a time, as far as
 * there's anything to burn: through dry grass fastest, through the woods,
 * with the wind and up the slopes quicker, against them slower; it stops
 * at water, bare rock, sand and snow, at ground it's burnt already, and
 * dies in the rain. The flames are on what's burning: low over the grass,
 * up the trunks and through the crowns of the trees and bushes (which, if
 * they burn long enough, lose their leaves: see Felling.scorch). It leaves
 * the ground black, which greens over again in a couple of days (see
 * cloudShadow's burn map), and the trees grow back (see Felling.regrow).
 *
 * The land is in 4 m cells: each catches, burns a while (longer where it's
 * wooded), and goes out, setting its neighbours alight as it burns.
 */
const CELL = 4;
const MAP = 256; // the burn map: cells across, round you (1 km)
const ck = (i, k) => (i + 1e5) * 3e5 + (k + 1e5);
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export class Wildfires {
  constructor(scene) {
    this.scene = scene;
    this.cells = new Map(); // key -> { i, k, state (1 burning, 2 burnt), t, dur, fuel, day, flames: [slots], smoke: [slots], trees }
    this.burning = new Set();
    this.fuelCache = new Map();
    this.heightCache = new Map();
    this.fuel = null; // (x, z, r) => the trees and bushes there (see TreeLayer.within)
    this.fuelAt = null; // (x, z) => how much there is to burn there, 0 (none) .. 1.5 (dry grass under trees)
    this.onScorch = null; // (tree) => it's lost its leaves
    // The flames and smoke: a pool of puffs, given out to the cells as they catch.
    this.flames = new Puffs(scene, 3000, () => ({ offset: [0, -1e4, 0], velocity: [0, 0, 0], period: 1, phase: 0, from: 0, to: 0, colour: FLAMES[0], glow: 1 }), { opacity: 0.9 });
    this.smoke = new Puffs(scene, 900, () => ({ offset: [0, -1e4, 0], velocity: [0, 0, 0], period: 1, phase: 0, from: 0, to: 0, colour: SMOKE, glow: 0 }), { opacity: 0.35 });
    this.freeFlames = Array.from({ length: 3000 }, (_, k) => 2999 - k);
    this.freeSmoke = Array.from({ length: 900 }, (_, k) => 899 - k);
    this.puffsDirty = false;
    // The burn map: how burnt (r) and how alight (g) each cell round you is.
    this.map = new Uint8Array(MAP * MAP * 4);
    this.mapOrigin = { i: null, k: null };
    this.mapDirty = true;
    this.mapWait = 0;
    this.spreadWait = 0;
    this.crackle = 0;
    this.day = 0;
  }

  // (How much there is to burn in a cell: worked out once.)
  #fuel(i, k) {
    const key = ck(i, k);
    let f = this.fuelCache.get(key);
    if (f === undefined) {
      if (this.fuelCache.size > 200000) this.fuelCache.clear();
      f = this.fuelAt ? this.fuelAt((i + 0.5) * CELL, (k + 0.5) * CELL) : 0.6;
      this.fuelCache.set(key, f);
    }
    return f;
  }

  /** A fire at (x, y, z) (where lightning struck, and it caught; or set). */
  ignite(x, y, z, ground) {
    this.ground = ground ?? this.ground;
    const i = Math.floor(x / CELL), k = Math.floor(z / CELL);
    this.#light(i, k, true);
  }

  // (The lie of the ground in a cell, at its middle: worked out once.)
  #height(i, k) {
    const key = ck(i, k);
    let h = this.heightCache.get(key);
    if (h === undefined) {
      if (this.heightCache.size > 200000) this.heightCache.clear();
      h = (this.ground ?? (() => 0))((i + 0.5) * CELL, (k + 0.5) * CELL);
      this.heightCache.set(key, h);
    }
    return h;
  }

  #light(i, k, forced = false) {
    const key = ck(i, k);
    const old = this.cells.get(key);
    if (old && (old.state === 1 || this.day - old.day < 3)) return false; // (burning, or burnt not long ago: nothing left)
    const fuel = this.#fuel(i, k);
    if (fuel < (forced ? 0.04 : 0.08)) return false;
    if (this.burning.size > 2500) return false; // (as much fire as there can be at once)
    const x0 = i * CELL, z0 = k * CELL, cx = x0 + CELL / 2, cz = z0 + CELL / 2;
    const ground = this.ground ?? (() => 0);
    const trees = (this.fuel?.(cx, cz, CELL * 0.72) ?? []).slice(0, 4).map((t) => ({ t, burnt: 0, scorched: false }));
    const cell = { i, k, state: 1, t: 0, dur: 18 + 22 * Math.min(1, fuel) + (trees.length ? 45 : 0) + Math.random() * 10, fuel, day: this.day, flames: [], smoke: [], trees };
    this.cells.set(key, cell);
    this.burning.add(cell);
    // The flames: low over the grass, more where there's more to burn.
    const add = (pool, free, list, p) => {
      const slot = free.pop();
      if (slot === undefined) return;
      pool.setSlot(slot, p);
      list.push(slot);
    };
    // (Flames shared out: fewer to a cell when the fire's big, none far
    // from you, where they couldn't be made out anyway.)
    const eye = this.eye;
    const far = eye && Math.hypot(cx - eye.x, cz - eye.z) > 500;
    const spare = this.freeFlames.length;
    const ration = far ? 0 : spare > 1500 ? 1 : spare > 500 ? 0.5 : 0.25;
    const nGrass = Math.round((1 + 3 * Math.min(1, fuel)) * ration);
    for (let n = 0; n < nGrass; n++) {
      const px = x0 + Math.random() * CELL, pz = z0 + Math.random() * CELL;
      add(this.flames, this.freeFlames, cell.flames, { offset: [px, ground(px, pz) + 0.1, pz], velocity: [0, rnd(1.2, 2.4), 0], period: rnd(0.6, 1.1), phase: Math.random(), from: rnd(0.5, 1.0) * (0.6 + 0.4 * Math.min(1, fuel)), to: 0.12, colour: FLAMES[Math.floor(Math.random() * 3)], glow: 1 });
    }
    // Up the trunks and through the crowns of the trees and bushes in it.
    for (const { t } of trees) {
      const c = t.crown, trunkTop = t.bush ? c.top : c.bottom;
      if (!t.bush && ration > 0.3) {
        for (let n = 0; n < 2; n++) {
          const h = t.y + (trunkTop - t.y) * (n + Math.random()) / 2, a = Math.random() * Math.PI * 2;
          add(this.flames, this.freeFlames, cell.flames, { offset: [t.x + Math.cos(a) * t.radius, h, t.z + Math.sin(a) * t.radius], velocity: [0, rnd(1.5, 2.5), 0], period: rnd(0.6, 1), phase: Math.random(), from: rnd(0.5, 0.9), to: 0.15, colour: FLAMES[Math.floor(Math.random() * 3)], glow: 1 });
        }
      }
      const n = Math.round((t.bush ? 3 : Math.min(8, 3 + Math.round(c.radius))) * ration);
      for (let m = 0; m < n; m++) {
        const v = Math.random(), h = c.bottom + (c.top - c.bottom) * v * 0.9;
        const spread = c.radius * (c.cone ? 1 - v * 0.85 : Math.sin(Math.PI * (0.15 + 0.85 * v))) * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        add(this.flames, this.freeFlames, cell.flames, { offset: [t.x + Math.cos(a) * spread, h, t.z + Math.sin(a) * spread], velocity: [0, rnd(2.2, 3.6), 0], period: rnd(0.8, 1.3), phase: Math.random(), from: rnd(1.2, 2.2) * (t.bush ? 0.7 : 1), to: 0.2, colour: FLAMES[Math.floor(Math.random() * 3)], glow: 1 });
      }
      if (!far) add(this.smoke, this.freeSmoke, cell.smoke, { offset: [t.x, c.top, t.z], velocity: [0, rnd(3, 5), 0], period: rnd(8, 13), phase: Math.random(), from: rnd(1.5, 3), to: rnd(9, 15), colour: SMOKE.clone().multiplyScalar(rnd(0.8, 1.4)), glow: 0 });
    }
    if (!far && Math.random() < (trees.length ? 0.15 : 0.3)) add(this.smoke, this.freeSmoke, cell.smoke, { offset: [cx, ground(cx, cz) + 1.2, cz], velocity: [0, rnd(2.5, 4), 0], period: rnd(7, 11), phase: Math.random(), from: rnd(1, 2), to: rnd(6, 11), colour: SMOKE.clone().multiplyScalar(rnd(0.8, 1.4)), glow: 0 });
    this.puffsDirty = true;
    this.#texel(cell);
    return true;
  }

  #out(cell) {
    cell.state = 2;
    cell.day = this.day;
    this.burning.delete(cell);
    for (const slot of cell.flames) this.flames.hideSlot(slot), this.freeFlames.push(slot);
    for (const slot of cell.smoke) this.smoke.hideSlot(slot), this.freeSmoke.push(slot);
    cell.flames.length = cell.smoke.length = 0;
    cell.trees = null;
    this.puffsDirty = true;
    this.#texel(cell);
  }

  // (One cell's texel in the burn map, if it's on it.)
  #texel(cell) {
    const o = this.mapOrigin;
    if (o.i === null) return;
    const u = cell.i - o.i, v = cell.k - o.k;
    if (u < 0 || v < 0 || u >= MAP || v >= MAP) return;
    const p = (v * MAP + u) * 4;
    const age = this.day - cell.day;
    this.map[p] = cell.state === 1 ? 200 : Math.round(255 * (age < 1 ? 1 : Math.max(0, 1 - (age - 1) / 2)));
    this.map[p + 1] = cell.state === 1 ? 255 : 0;
    this.mapDirty = true;
  }

  /** Where fires are burning just now, for the animals to keep away: [{ x, z, r }]. */
  zones() {
    // (The burning cells, a sample of them, each a little circle of fire.)
    const out = [];
    let n = 0;
    const step = Math.max(1, Math.floor(this.burning.size / 40));
    for (const c of this.burning) if (n++ % step === 0) out.push({ x: (c.i + 0.5) * CELL, z: (c.k + 0.5) * CELL, r: CELL * 2 });
    return out;
  }

  /**
   * How hot it is at (x, y, z) (your feet) from the fires: 0 (nowhere
   * near) .. 1 (in the flames): on burning ground, or in a burning tree's
   * crown or against its trunk.
   */
  heatAt(x, y, z, ground) {
    let heat = 0;
    const i = Math.floor(x / CELL), k = Math.floor(z / CELL);
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const c = this.cells.get(ck(i + di, k + dk));
      if (!c || c.state !== 1 || c.t < 2) continue;
      if (!di && !dk && y - ground(x, z) < 1.2) heat = Math.max(heat, Math.min(1, c.t / 4));
      for (const b of c.trees ?? []) {
        if (b.scorched) continue;
        const t = b.t, h = Math.hypot(x - t.x, z - t.z);
        if (h < t.radius + 0.8 && y < t.crown.top && y > t.y - 1) heat = 1;
      }
    }
    return heat;
  }

  /** @param ctx { time, day (world days), wind: { x, z } (m/s), rain (0..1), light (Color), night (0..1), camera, sound, pan(x, z), ground(x, z) } */
  update(dt, ctx) {
    this.day = ctx.day ?? this.day;
    this.eye = ctx.camera.position;
    this.ground = ctx.ground ?? this.ground;
    const rain = ctx.rain ?? 0;
    // Spreading, a few times a second.
    this.spreadWait -= dt;
    if (this.spreadWait <= 0 && this.burning.size) {
      const step = 0.25 - this.spreadWait;
      this.spreadWait = 0.25;
      const wl = Math.hypot(ctx.wind.x, ctx.wind.z), wx = wl > 0.1 ? ctx.wind.x / wl : 0, wz = wl > 0.1 ? ctx.wind.z / wl : 0, windy = Math.min(1, wl / 7);
      for (const c of [...this.burning]) {
        c.t += step * (1 + 2 * rain);
        // (The trees it's reached: burning a while, they lose their leaves.)
        for (const b of c.trees ?? []) {
          if (b.scorched) continue;
          b.burnt += step;
          if (b.burnt > (b.t.bush ? 14 : 32)) (b.scorched = true), this.onScorch?.(b.t);
        }
        if (c.t >= c.dur || (rain > 0.5 && Math.random() < step * 0.04 * rain)) {
          this.#out(c);
          continue;
        }
        // Setting the cells round it alight: by what's there to burn, with
        // the wind and up the slope quicker; less as it burns down.
        const strength = Math.min(1, c.fuel) * (c.t < 2 ? 0.4 : c.t > c.dur - 6 ? 0.5 : 1) * (1 - 0.9 * rain);
        if (strength <= 0.02) continue;
        const h0 = this.#height(c.i, c.k);
        for (const [di, dk] of N8) {
          const ni = c.i + di, nk = c.k + dk;
          const there = this.cells.get(ck(ni, nk));
          if (there && (there.state === 1 || this.day - there.day < 3)) continue;
          const fuel = this.#fuel(ni, nk);
          if (fuel < 0.08) continue;
          const dl = di && dk ? Math.SQRT2 : 1;
          const along = (di * wx + dk * wz) / dl;
          const h1 = this.#height(ni, nk);
          const up = Math.max(-0.5, Math.min(1.5, (h1 - h0) / (CELL * dl)));
          // (About half a metre a second through good grass downwind; a
          // creep against the wind; faster up a slope, slower down one.)
          const rate = 0.05 * Math.min(1, fuel) * strength * (0.35 + windy * (3 * Math.max(0, along) - 0.25 * Math.max(0, -along)) + (1 - windy) * 0.6) * (1 + 1.2 * up) / dl;
          if (Math.random() < rate * step) this.#light(ni, nk);
        }
      }
    }
    // The flames and smoke.
    for (const p of [this.flames, this.smoke]) {
      const u = p.uniforms;
      u.uTime.value = ctx.time;
      u.uAmount.value = this.burning.size ? 1 : 0;
      u.uLight.value.copy(ctx.light);
      u.uGlow.value = 1 + 1.5 * ctx.night;
    }
    this.smoke.uniforms.uWind.value.set(ctx.wind.x * 0.8, 0, ctx.wind.z * 0.8);
    this.flames.uniforms.uWind.value.set(ctx.wind.x * 0.15, 0, ctx.wind.z * 0.15);
    if (this.puffsDirty) {
      this.flames.flush();
      this.smoke.flush();
      this.puffsDirty = false;
    }
    // Crackling, from the nearest of it.
    this.crackle -= dt;
    if (this.crackle <= 0 && this.burning.size) {
      this.crackle = rnd(0.5, 1.2);
      const cam = ctx.camera.position;
      let best = null, bd = 80;
      for (const c of this.burning) {
        const d = Math.hypot((c.i + 0.5) * CELL - cam.x, (c.k + 0.5) * CELL - cam.z);
        if (d < bd) (bd = d), (best = c);
      }
      if (best) ctx.sound?.call('crackle', ctx.pan((best.i + 0.5) * CELL, (best.k + 0.5) * CELL), Math.min(1, 1 - bd / 80 + this.burning.size / 400));
    }
    // The burn map: round you, kept up as the fire moves and the ground greens over.
    this.mapWait -= dt;
    if (this.mapWait <= 0) {
      this.mapWait = 0.4;
      const cam = ctx.camera.position;
      const oi = Math.round(cam.x / CELL / 64) * 64 - MAP / 2, ok = Math.round(cam.z / CELL / 64) * 64 - MAP / 2;
      const moved = oi !== this.mapOrigin.i || ok !== this.mapOrigin.k;
      this.regreenWait = (this.regreenWait ?? 0) - 0.4;
      if (moved || this.regreenWait <= 0) {
        // (All of it afresh: when you've moved on, and every so often as the burnt ground greens.)
        this.regreenWait = 6;
        this.mapOrigin = { i: oi, k: ok };
        this.map.fill(0);
        for (const [key, c] of this.cells) {
          if (c.state === 2 && this.day - c.day > 3) {
            this.cells.delete(key); // (green again: forgotten)
            continue;
          }
          this.#texel(c);
        }
        this.mapDirty = true;
      }
      if (this.mapDirty) {
        burnMap.image.data.set(this.map);
        burnMap.needsUpdate = true;
        cloudShadowUniforms.uBurnOrigin.value.set(this.mapOrigin.i * CELL, this.mapOrigin.k * CELL);
        cloudShadowUniforms.uBurnSize.value = MAP * CELL;
        this.mapDirty = false;
      }
    }
  }

  /** The burnt and burning ground, for saving: [i, k, state, day, ...] (only what's still to be seen). */
  toJSON() {
    const out = [];
    for (const c of this.cells.values()) if (this.day - c.day <= 3) out.push(c.i, c.k, c.state, +c.day.toFixed(3));
    return out;
  }

  load(list) {
    this.clear();
    for (let n = 0; n + 3 < (list?.length ?? 0); n += 4) {
      const [i, k, state, day] = list.slice(n, n + 4);
      // (A fire that was burning when the world was left: it's burnt out since.)
      this.cells.set(ck(i, k), { i, k, state: 2, t: 0, dur: 0, fuel: 0, day: state === 1 ? day + 0.01 : day, flames: [], smoke: [], trees: null });
    }
    this.mapOrigin = { i: null, k: null };
  }

  clear() {
    for (const c of [...this.burning]) this.#out(c);
    this.cells.clear();
    this.burning.clear();
    this.fuelCache.clear();
    this.heightCache.clear();
    this.map.fill(0);
    burnMap.image.data.fill(0);
    burnMap.needsUpdate = true;
    this.mapOrigin = { i: null, k: null };
  }
}

/**
 * The volcanoes' own life, by what state each is in (see TerrainGenerator's
 * cones):
 *  - erupting: a plume of smoke leaning on the wind, steam off its lava
 *    lake and where its flow runs into water (no glowing spatter or ash),
 *    rumbling, the ground trembling;
 *  - simmering: its lava lake smoking;
 *  - dead, with a lake in its crater: a few wisps of steam off the water.
 */
export class Volcanoes {
  constructor(scene) {
    this.scene = scene;
    this.active = new Map(); // key -> { c, parts: [Puffs], kind }
    this.wait = 0;
    this.shake = 0;
  }

  // What a volcano gives off, as Puffs centred on its crater (and on where its flow meets water).
  #make(c, generator) {
    reseed(c.x, c.z, 3);
    const parts = [];
    const add = (p, x, y, z, role) => (p.uniforms.uCentre.value.set(x, y, z), (p.role = role), parts.push(p));
    const rim = generator.getBaseHeight(c.x + c.rc * 1.05, c.z);
    const pool = generator.craterLevel(c); // (the lava lake's, or the water's, level)
    if (c.state === 'erupting' || c.state === 'simmering') {
      // Smoke: a plume rising from the crater and leaning away on the wind
      // (heavier from one erupting). No glowing spatter or ash: just smoke and steam.
      const erupting = c.state === 'erupting';
      add(new Puffs(this.scene, erupting ? 60 : 30, () => {
        const a = random() * Math.PI * 2, d = random() * c.rc * 0.5;
        const grey = erupting ? rnd(0.36, 0.55) : rnd(0.5, 0.68);
        return { offset: [Math.cos(a) * d, -rnd(0, 10), Math.sin(a) * d], velocity: [0, erupting ? rnd(6, 10) : rnd(3, 5), 0], period: rnd(22, 30), phase: random(), from: rnd(8, 16), to: erupting ? rnd(45, 70) : rnd(25, 40), colour: new Color(grey, grey * 0.98, grey * 0.96), glow: 0 };
      }, { opacity: erupting ? 0.55 : 0.4 }), c.x, rim, c.z, 'plume');
    }
    if (c.state === 'erupting') {
      // Steam off the lava lake, and where its flow runs into water, steam boiling up.
      add(new Puffs(this.scene, 20, () => {
        const a = random() * Math.PI * 2, d = Math.sqrt(random()) * c.rc * 0.5;
        const w = rnd(0.82, 0.95);
        return { offset: [Math.cos(a) * d, 0, Math.sin(a) * d], velocity: [0, rnd(1.5, 3), 0], period: rnd(6, 10), phase: random(), from: rnd(1, 2), to: rnd(5, 9), colour: new Color(w, w, w), glow: 0 };
      }, { opacity: 0.3 }), c.x, pool + 0.3, c.z, 'wisps');
      const end = generator.lavaEnd?.(c);
      if (end?.water) {
        add(new Puffs(this.scene, 40, () => {
          const a = random() * Math.PI * 2, d = random() * 4;
          const w = rnd(0.85, 0.97);
          return { offset: [Math.cos(a) * d, 0, Math.sin(a) * d], velocity: [0, rnd(2.5, 5), 0], period: rnd(5, 9), phase: random(), from: rnd(1.5, 3), to: rnd(8, 14), colour: new Color(w, w, w), glow: 0 };
        }, { opacity: 0.32 }), end.x, generator.getBaseHeight(end.x, end.z) + 0.5, end.z, 'steam');
      }
    }
    if (c.state === 'dead' && c.lake) {
      // A few wisps of steam off the crater lake.
      add(new Puffs(this.scene, 24, () => {
        const a = random() * Math.PI * 2, d = Math.sqrt(random()) * c.rc * 0.5;
        const w = rnd(0.86, 0.96);
        return { offset: [Math.cos(a) * d, 0, Math.sin(a) * d], velocity: [0, rnd(0.8, 1.6), 0], period: rnd(6, 11), phase: random(), from: rnd(0.6, 1.2), to: rnd(3, 6), colour: new Color(w, w, w), glow: 0 };
      }, { opacity: 0.3 }), c.x, pool + 0.3, c.z, 'wisps');
    }
    return parts;
  }

  /** @param ctx { time, camera, generator, wind: { x, z }, light (Color), night (0..1), sound, pan(x, z) } */
  update(dt, ctx) {
    const cam = ctx.camera.position;
    this.wait -= dt;
    if (this.wait <= 0 && ctx.generator) {
      this.wait = 3;
      const near = ctx.generator.volcanoes(cam.x - 3000, cam.z - 3000, cam.x + 3000, cam.z + 3000)
        .filter((c) => c.lava || c.lake)
        .sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z))
        .slice(0, 3);
      const keep = new Set();
      for (const c of near) {
        const key = `${Math.round(c.x)},${Math.round(c.z)}`;
        keep.add(key);
        if (!this.active.has(key)) this.active.set(key, { c, parts: this.#make(c, ctx.generator) });
      }
      for (const [key, v] of this.active) {
        if (keep.has(key)) continue;
        for (const p of v.parts) p.dispose();
        this.active.delete(key);
      }
    }
    let nearest = Infinity;
    for (const { parts, c } of this.active.values()) {
      for (const p of parts) {
        const u = p.uniforms;
        u.uTime.value = ctx.time;
        u.uLight.value.copy(ctx.light);
        if (p.role === 'plume') u.uWind.value.set(ctx.wind.x * 1.4, 0, ctx.wind.z * 1.4);
        else if (p.role === 'steam' || p.role === 'wisps') u.uWind.value.set(ctx.wind.x * 0.5, 0, ctx.wind.z * 0.5);
      }
      if (c.lava) nearest = Math.min(nearest, Math.hypot(c.x - cam.x, c.z - cam.z) * (c.state === 'erupting' ? 1 : 1.6));
    }
    // A rumble now and then when you're near one awake; the ground trembles.
    this.shake = Math.max(0, this.shake - dt / 2.5);
    // (When, by the clock: online, the room's, so everyone near hears it at once.)
    const T = ctx.netTime ?? ctx.time, slot = Math.floor(T / 45), at = slot * 45 + 40 * hash01(slot, 11);
    const due = T >= at && this.rumbled !== slot && hash01(slot, 12) < 0.75;
    if (due) this.rumbled = slot;
    if (nearest < 1600 && due && T - at < 2) {
      const near = 1 - nearest / 1600;
      ctx.sound?.call('rumble', 0, 0.3 + 0.7 * near);
      this.shake = near;
    }
  }

  clear() {
    for (const v of this.active.values()) for (const p of v.parts) p.dispose();
    this.active.clear();
  }
}

const wallVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const wallFragment = /* glsl */ `
  uniform vec3 colour;
  uniform vec3 haze;
  uniform float hazeAmount;
  uniform float opacity;
  uniform float time;
  uniform float seed;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }
  void main() {
    // A haboob: a towering bank of dust, its top heaped in great rounded
    // heads rolling up and over, dense and dark at its foot, the heads lit
    // pale; hazed with distance like any far thing.
    float x = vUv.x * 55.0 + seed * 31.0;
    float heads = fbm(vec2(x * 0.16, time * 0.025 + seed));
    float top = 0.35 + 0.55 * heads;
    vec2 q = vec2(x * 0.3, vUv.y * 11.0 - time * 0.12);
    float puffs = fbm(q + 1.7 * fbm(q * 0.6 + vec2(time * 0.02, seed)));
    // (Round-edged, puffy, not a hard line.)
    float edge = top - vUv.y + (puffs - 0.5) * 0.22;
    float body = smoothstep(-0.01, 0.1, edge);
    float ends = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));
    // Light: on the upper faces of the heads, shadowed in their folds and at the foot.
    float lit = smoothstep(0.0, 0.18, 0.18 - edge) ;
    float shade = (0.5 + 0.45 * puffs) * (0.7 + 0.3 * smoothstep(0.0, 0.8, vUv.y)) + 0.35 * lit;
    vec3 c = mix(colour * shade, haze, hazeAmount);
    gl_FragColor = vec4(c, opacity * body * ends * (0.8 + 0.2 * puffs));
    #include <colorspace_fragment>
  }`;

/**
 * Sandstorms, in the deserts: now and then a towering brown wall of dust
 * rolls in from upwind, blots out the sun when it arrives and fills the
 * air with blowing sand for a minute or two, then moves on. `amount` (how
 * deep in it you are, 0..1) is for the fog and the light (see main).
 */
export class Sandstorm {
  constructor(scene, Rain) {
    this.state = 'idle';
    this.amount = 0;
    this.distance = 0;
    // (Two banks, one a little behind the other, for depth.)
    const geometry = new CylinderGeometry(1, 1, 1, 96, 1, true, -1.1, 2.2).translate(0, 0.5, 0);
    this.walls = [0, 1].map((k) => {
      const material = new ShaderMaterial({
        uniforms: { colour: { value: new Color(0xb89a6a) }, haze: { value: new Color() }, hazeAmount: { value: 0 }, opacity: { value: 0 }, time: { value: 0 }, seed: { value: k * 3.7 + 1 } },
        vertexShader: wallVertex,
        fragmentShader: wallFragment,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      });
      const wall = new Mesh(geometry, material);
      wall.frustumCulled = false;
      wall.visible = false;
      wall.renderOrder = 2 - k;
      scene.add(wall);
      return wall;
    });
    this.wall = this.walls[0];
    this.material = this.walls[0].material;
    this.sand = new Rain(scene); // (blowing sand: the rain's streaks, driven sideways)
    this.from = new Vector3();
  }

  /** Start one now: `forced` (for testing) blows in wherever you are, and closer. */
  start(forced = false) {
    this.state = 'coming';
    this.distance = forced ? 700 : 1500;
    this.forced = forced;
  }

  /**
   * @param ctx { time, camera, desert (0..1, here), rain, wind: { x, z }, light (Color), ground }
   */
  update(dt, ctx) {
    const cam = ctx.camera.position;
    const w = Math.hypot(ctx.wind.x, ctx.wind.z) || 1;
    const ux = ctx.wind.x / w, uz = ctx.wind.z / w; // (downwind)
    if (this.state === 'idle') {
      // A storm's chance every four minutes, by the clock (online, the
      // room's: everyone out in the desert sees the same one roll in).
      const T = ctx.netTime ?? ctx.time, n = Math.floor(T / 240), t0 = n * 240 + 60 * hash01(n, 21), age = T - t0;
      this.dur = 60 + 60 * hash01(n, 22);
      if (hash01(n, 20) < 0.25 && ctx.desert > 0.6 && ctx.rain < 0.05 && this.storm !== n && age >= 0 && age < 47 + this.dur) {
        this.storm = n;
        this.forced = false;
        if (age < 47) (this.state = 'coming'), (this.distance = 1500 - 32 * age);
        else (this.state = 'in'), (this.until = 47 + this.dur - age);
      }
    } else if (this.state === 'coming') {
      this.distance -= 32 * dt;
      if (this.distance <= 0 || (ctx.desert < 0.3 && !this.forced)) (this.state = 'in'), (this.until = this.forced ? rnd(60, 120) : this.dur);
    } else if (this.state === 'in') {
      this.until -= dt;
      this.amount = Math.min(1, this.amount + dt / 8);
      if (this.until <= 0 || (ctx.desert < 0.2 && !this.forced)) (this.state = 'going'), (this.forced = false), (this.distance = 0);
    } else if (this.state === 'going') {
      this.amount = Math.max(0, this.amount - dt / 20);
      this.distance -= 32 * dt; // (off downwind, away from you)
      if (this.amount <= 0 && this.distance < -1500) this.state = 'idle';
    }
    // The wall: an arc of dust upwind as it comes, downwind as it goes.
    const showing = this.state === 'coming' || (this.state === 'going' && this.amount < 0.6);
    this.walls.forEach((wall, k) => {
      wall.visible = showing;
      if (!showing) return;
      const d = Math.max(60, Math.abs(this.distance)) * (1 + k * 0.07);
      const toward = this.distance > 0 ? -1 : 1; // (upwind, or downwind)
      // (Its foot well down, so the land in front hides it; tall, darkening the sky.)
      wall.position.set(cam.x, ctx.ground(cam.x, cam.z) - 80, cam.z);
      wall.scale.set(d, 360 + k * 50, d);
      // (Its arc centred on the way it lies from you.)
      wall.rotation.y = Math.atan2(ux * toward, uz * toward) + k * 0.05;
      const u = wall.material.uniforms;
      u.time.value = ctx.time;
      u.opacity.value = (k ? 0.6 : 0.95) * smoothstep(60, 250, Math.abs(this.distance)) * (this.state === 'going' ? 1 - this.amount / 0.6 : 1);
      u.colour.value.set(k ? 0xa88a5c : 0xb89a6a).multiply(ctx.light);
      if (ctx.fog) u.haze.value.copy(ctx.fog);
      u.hazeAmount.value = ctx.fog ? 0.45 * smoothstep(250, 1600, d) : 0;
    });
    // Blowing sand.
    this.sand.update(ctx.time, cam, this.amount, ctx.wind, 1, ctx.light);
    if (this.amount > 0.01) {
      this.sand.uniforms.fall.value.set(ux * 24, -1.5, uz * 24);
      this.sand.uniforms.colour.value.set(0xc8a878).multiply(ctx.light);
    }
  }
}

/**
 * Dust devils, out on the savanna and in the desert on hot, dry
 * afternoons: a spinning funnel of dust, wider at the top, wandering over
 * the ground on the breeze for half a minute or so, then dying away.
 * `spawn()` sets one going near you (for testing).
 */
export class DustDevils {
  constructor(scene) {
    this.scene = scene;
    this.devils = []; // (one asked for, for testing: see spawn)
    this.shown = new Map(); // the land's own, by when and where: key -> devil (see update)
    this.desert = new Map(); // (whether a cell's spot is desert: worked out once)
    const N = 160;
    const seeds = new Float32Array(N * 4);
    let t = 0x5eed; // (the same specks for everyone)
    const random = () => ((t = (Math.imul(t ^ (t >>> 15), 1 | t) + 0x6d2b79f5) >>> 0), (t >>> 8) / 16777216);
    for (let k = 0; k < N; k++) seeds.set([random(), random() * Math.PI * 2, 0.4 + 0.6 * random(), 0.5 + random()], k * 4);
    const geometry = new IcosahedronGeometry(1, 0);
    geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    this.geometry = geometry;
    this.count = N;
  }

  #make() {
    const uniforms = UniformsUtils.merge([UniformsLib.fog, {
      uTime: { value: 0 }, uCentre: { value: new Vector3() }, uHeight: { value: 30 }, uRadius: { value: 4 }, uAmount: { value: 0 },
      uLight: { value: new Color(1, 1, 1) }, uColour: { value: new Color(0xc4a676) },
    }]);
    const material = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; // height (0..1) it starts at, angle, how far out, size
        uniform float uTime;
        uniform vec3 uCentre;
        uniform float uHeight;
        uniform float uRadius;
        uniform float uAmount;
        varying float vAlpha;
        varying float vShade;
        #include <fog_pars_vertex>
        void main() {
          // Each speck rises slowly up the funnel, whirling round it: a turn
          // every few seconds low down where it's tight, lazier up where it
          // spreads out, the whirl surging and easing with the gusts. The
          // column sways, its top wandering behind its foot.
          float h = fract(aSeed.x + uTime * 0.025);
          float gust = 1.0 + 0.2 * sin(uTime * 0.4 + aSeed.x * 2.0) + 0.08 * sin(uTime * 1.1);
          float a = aSeed.y + uTime * (0.55 - 0.3 * h) * gust + aSeed.x * 40.0; // (a slow, lazy whirl: a turn every ten seconds or so)
          float r = uRadius * (0.25 + 0.9 * h) * aSeed.z * (1.0 + 0.1 * sin(uTime * 0.5 + aSeed.y * 3.0));
          float lean = h * h * 0.25 * uHeight;
          vec2 sway = vec2(cos(uTime * 0.12), sin(uTime * 0.16)) * lean * 0.5;
          vec3 c = uCentre + vec3(cos(a) * r + lean * 0.3 + sway.x, h * uHeight, sin(a) * r + sway.y);
          float size = aSeed.w * (0.5 + 1.6 * h) * step(0.001, uAmount);
          vec4 mvPosition = viewMatrix * vec4(c + position * size, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = sin(3.14159 * h) * uAmount * (1.0 - 0.4 * h);
          vShade = 0.7 + 0.3 * max(normal.y, 0.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColour;
        uniform vec3 uLight;
        varying float vAlpha;
        varying float vShade;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = vec4(uColour * uLight * vShade, vAlpha * 0.55);
          #include <fog_fragment>
        }`,
    });
    const mesh = new InstancedMesh(this.geometry, material, this.count);
    for (let k = 0; k < this.count; k++) mesh.setMatrixAt(k, new Matrix4());
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return mesh;
  }

  /** One near (x, z) now (`near`: closer, for testing). */
  spawn(x, z, near = false) {
    if (this.devils.length >= 3) this.devils[0].life = Math.min(this.devils[0].life, this.devils[0].age + 6); // (the oldest dies away)
    const a = random() * Math.PI * 2, d = near ? rnd(30, 50) : rnd(60, 160);
    this.devils.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, age: 0, life: rnd(30, 55), height: rnd(25, 45), radius: rnd(3, 6), turn: random() * Math.PI * 2, mesh: this.#make() });
  }

  /**
   * The land's dust devils: now and then, in a hot, dry desert afternoon,
   * one whirls up somewhere out on the sand or the dunes, wanders over it
   * on the breeze for half a minute or so and dies away. Rare (a few an
   * afternoon). Each 400 m of desert has its chance every five minutes,
   * and where and when it rises, and where it wanders, are worked out from
   * the clock (online, the room's: ctx.netTime), so everyone sees the same.
   *
   * @param ctx { time, netTime, camera, generator, seed, hour, rain, winter, wind: { x, z }, light, ground(x, z) }
   */
  update(dt, ctx) {
    const T = ctx.netTime ?? ctx.time, cam = ctx.camera.position, S = 400, P = 300;
    const h = (i, j, n, salt) => {
      let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((j | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((n | 0) + salt, 0x27d4eb2f) ^ (ctx.seed | 0);
      x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
      x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
      return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
    };
    const fit = ctx.hour > 12 && ctx.hour < 17.5 && ctx.rain < 0.05 && ctx.winter < 0.4;
    const want = new Map();
    if (fit && ctx.generator) {
      const ci = Math.floor(cam.x / S), cj = Math.floor(cam.z / S);
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let i = ci - 1; i <= ci + 1; i++) {
          for (let n = Math.floor(T / P) - 1; n <= Math.floor(T / P); n++) {
            if (h(i, j, n, 1) > 0.12) continue; // (most chances, nothing)
            const t0 = n * P + h(i, j, n, 2) * 200, life = 30 + 25 * h(i, j, n, 3), age = T - t0;
            if (age < 0 || age > life) continue;
            const x0 = (i + 0.1 + 0.8 * h(i, j, n, 4)) * S, z0 = (j + 0.1 + 0.8 * h(i, j, n, 5)) * S;
            // (Only out on the desert's sand and dunes.)
            const key = `${i},${j}`;
            if (!this.desert.has(key)) this.desert.set(key, ctx.generator.getBiomeWeights(x0, z0, {}).desert > 0.6);
            if (!this.desert.get(key)) continue;
            // Wandering on the breeze, this way and that.
            const turn = h(i, j, n, 6) * Math.PI * 2;
            const x = x0 + ctx.wind.x * 0.3 * age + Math.cos(turn) * 1.1 * age + 6 * Math.sin(age * 0.11 + turn);
            const z = z0 + ctx.wind.z * 0.3 * age + Math.sin(turn) * 1.1 * age + 6 * Math.cos(age * 0.13 + turn);
            want.set(`${key},${n}`, { x, z, age, life, height: 25 + 20 * h(i, j, n, 7), radius: 3 + 3 * h(i, j, n, 8) });
          }
        }
      }
      if (this.desert.size > 400) this.desert.clear();
    }
    // (Made and done away with as they come and go.)
    for (const [key, d] of this.shown) {
      if (want.has(key)) continue;
      this.#dispose(d);
      this.shown.delete(key);
    }
    for (const [key, w] of want) {
      let d = this.shown.get(key);
      if (!d) this.shown.set(key, (d = { mesh: this.#make() }));
      Object.assign(d, w);
      this.#show(d, ctx, T);
    }
    // (One asked for, for testing: wandering by itself.)
    for (const d of this.devils) {
      d.age += dt;
      d.x += (ctx.wind.x * 0.3 + Math.cos(d.turn) * 1.1) * dt;
      d.z += (ctx.wind.z * 0.3 + Math.sin(d.turn) * 1.1) * dt;
      this.#show(d, ctx, T);
      if (d.age >= d.life) (this.#dispose(d), (d.done = true));
    }
    this.devils = this.devils.filter((d) => !d.done);
  }

  #show(d, ctx, T) {
    const u = d.mesh.material.uniforms;
    const y = ctx.ground(d.x, d.z);
    u.uCentre.value.set(d.x, Number.isFinite(y) ? y - 0.5 : ctx.camera.position.y - 2, d.z);
    u.uTime.value = T;
    u.uHeight.value = d.height;
    u.uRadius.value = d.radius;
    u.uAmount.value = Math.min(1, d.age / 4) * (1 - smoothstep(d.life - 6, d.life, d.age));
    u.uLight.value.copy(ctx.light);
  }

  #dispose(d) {
    this.scene.remove(d.mesh);
    d.mesh.material.dispose();
    d.mesh.dispose();
  }
}
