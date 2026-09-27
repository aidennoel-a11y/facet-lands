import { Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2, mulberry32 } from '../noise/random.js';
import * as Models from './models.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const TAU = Math.PI * 2;
const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * The kinds of animal. Ground animals: walking and running speeds (m/s),
 * how near you can come before they bolt (`flee`, metres) and how far off
 * they settle again (`calm`), their bulk (`radius`, for trees and for
 * being hit), `health` (for hunting), and how long a stride is. Birds: how
 * big they're drawn (`scale`) and how near you can come (`flee`).
 */
const SPECIES = {
  deer: { ground: true, model: Models.deer, max: 60, walk: 1.3, run: 11, flee: 45, calm: 130, radius: 0.5, height: 1.4, health: 60, stride: 1.6, turn: 2.5, size: 1.3 },
  bison: { ground: true, model: Models.bison, max: 70, walk: 1.0, run: 8.5, flee: 30, calm: 85, radius: 1.0, height: 2.0, health: 200, stride: 2.2, turn: 1.4, size: 1.5 },
  // Bears (in the mountain foothills): a black bear shies away; a grizzly
  // stands its ground (`aggressive`: one day it will come for you).
  blackBear: { ground: true, model: Models.blackBear, max: 16, walk: 0.9, run: 9, flee: 35, calm: 100, radius: 0.7, height: 1.3, health: 150, stride: 1.4, turn: 1.8, size: 1.3, forager: true },
  grizzly: { ground: true, model: Models.grizzly, max: 10, walk: 0.9, run: 10, flee: 10, calm: 40, radius: 0.8, height: 1.5, health: 260, stride: 1.6, turn: 1.6, size: 1.6, forager: true, aggressive: true },
  rabbit: { ground: true, model: Models.rabbit, max: 40, walk: 1.0, run: 7.5, flee: 14, calm: 40, radius: 0.3, height: 0.55, health: 10, stride: 1.0, turn: 5, size: 1.8 },
  songbird: { bird: true, model: Models.songbird, max: 60, scale: 1.6, flee: 9, radius: 0.25, health: 2 },
  starling: { bird: true, model: Models.starling, max: 60, scale: 1.45, flee: 22, radius: 0.25, health: 2 },
  crow: { bird: true, model: Models.crow, max: 40, scale: 2.3, flee: 25, radius: 0.35, health: 4 },
  gull: { bird: true, model: Models.gull, max: 12, scale: 3.0, flee: 15, radius: 0.5, health: 6 },
  hawk: { bird: true, model: Models.hawk, max: 4, scale: 4.2, flee: 30, radius: 0.7, health: 12 },
};
// Songbirds come in colours: robins, finches, jays, wrens, sparrows.
const SONGBIRD_TINTS = [0xc0703a, 0xd8b040, 0x5a7ab8, 0x8a6a4a, 0xa89878, 0xb04030];

const base = new Matrix4(), part = new Matrix4(), out = new Matrix4();
const euler = new Euler(0, 0, 0, 'YXZ'), quat = new Quaternion(), pos = new Vector3(), scl = new Vector3(), push = new Vector3();
const white = new Color(1, 1, 1), tint = new Color();

/**
 * The animals of the world round you: herds of deer and bison, rabbits,
 * and birds (songbirds on the trees and hopping on the ground; flocks
 * wheeling over the woods and fields, settling to feed; gulls over the
 * coast; a hawk circling high over the mountains; crows flying home to
 * roost at dusk). They come and go around you as you move (out of sight,
 * so none appear from nowhere), keep to the land that suits them, walk the
 * terrain round the trees, and bolt, or scatter, when you come too near.
 *
 * Each is a creature with a place, a heading, a state of mind and some
 * health: for hunting, see raycast and hit (a hit one runs, or falls; the
 * dead lie where they fell for a few minutes).
 */
export class Wildlife {
  constructor(scene, materialHook = (m) => m) {
    this.material = materialHook(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.rigs = {};
    for (const [kind, sp] of Object.entries(SPECIES)) {
      const model = sp.model();
      const meshes = {};
      const make = (name, geometry, count, shadow) => {
        if (!geometry) return;
        const mesh = new InstancedMesh(geometry, this.material, count);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.name = `${kind} ${name}`;
        scene.add(mesh);
        meshes[name] = mesh;
      };
      if (sp.ground) {
        make('body', model.body, sp.max, true);
        make('head', model.head, sp.max, true);
        make('antlers', model.antlers, sp.max, true);
        make('legs', model.leg, sp.max * 4, true);
      } else {
        make('body', model.body, sp.max, kind === 'hawk' || kind === 'gull');
        make('wingL', model.wingL, sp.max, kind === 'hawk' || kind === 'gull');
        make('wingR', model.wingR, sp.max, kind === 'hawk' || kind === 'gull');
      }
      this.rigs[kind] = { model, meshes };
    }
    this.animals = []; // every creature: { kind, x, y, z, heading, pitch, roll, scale, alive, health, ... }
    this.herds = [];
    this.flocks = [];
    this.wait = 0;
    this.crowCooldown = 0;
    this.time = 0;
    // What lives in each chunk of the land (see #settle): "cx,cz" -> { animals, herds, birds }.
    this.homes = new Map();
    this.last = null; // where you were, and which way you're heading
    this.heading = null;
  }

  /** Forgets every creature (a new world). */
  clear() {
    this.animals = [];
    this.herds = [];
    this.flocks = [];
    this.homes.clear();
  }

  // --- Hunting --------------------------------------------------------------

  /**
   * The nearest living creature a ray from `origin` along `dir` (unit)
   * passes through, within `max` metres: { animal, distance }, or null.
   */
  raycast(origin, dir, max = 150) {
    let best = null;
    for (const a of this.animals) {
      if (!a.alive) continue;
      const sp = SPECIES[a.kind];
      const r = sp.radius * (a.scale ?? 1) * 1.3;
      const cy = a.y + (sp.ground ? sp.height * 0.55 * a.scale : 0);
      const ox = a.x - origin.x, oy = cy - origin.y, oz = a.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > max) continue;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (d2 > r * r) continue;
      if (!best || t < best.distance) best = { animal: a, distance: t };
    }
    return best;
  }

  /** Wounds a creature (from a point `from`): it flees, or dies. Returns whether it died. */
  hit(a, damage, from) {
    if (!a.alive) return false;
    a.health -= damage;
    if (a.health <= 0) {
      a.alive = false;
      a.state = SPECIES[a.kind].bird ? 'falling' : 'dead';
      a.deadTime = 0;
      a.side = Math.random() < 0.5 ? 1 : -1;
      a.vy = 0;
      return true;
    }
    if (a.herd) this.#alarm(a.herd, from.x, from.z);
    else a.fear = 4;
    return false;
  }

  /** The dead lying near (x, z), for butchering and the like. */
  carcassesNear(x, z, r) {
    return this.animals.filter((a) => !a.alive && a.state === 'dead' && Math.hypot(a.x - x, a.z - z) < r);
  }

  #alarm(herd, x, z) {
    herd.fear = { x, z };
    herd.fleeTime = 7;
  }

  // --- Coming and going -----------------------------------------------------

  /**
   * @param dt   seconds
   * @param ctx  { camera, forward (which way you look), generator, ground(x, z),
   *              trees (TreeLayer), chunkSize, seaLevel, day, dawn, dusk,
   *              winter, rain, sheltered, sound, pan(x, z) (-1 left .. 1 right),
   *              seed, tame (for testing: they pay you no mind) }
   */
  update(dt, ctx) {
    this.time += dt;
    this.ctx = ctx;
    const hidden = ctx.sheltered;
    for (const rig of Object.values(this.rigs)) for (const m of Object.values(rig.meshes)) m.visible = !hidden;
    if (hidden) return;
    this.wait -= dt;
    this.crowCooldown -= dt;
    if (this.wait <= 0) {
      this.wait = 0.5;
      this.#populate(ctx);
    }
    for (const herd of this.herds) this.#herd(herd, dt);
    for (const flock of this.flocks) this.#flock(flock, dt, ctx);
    for (const a of this.animals) {
      if (SPECIES[a.kind].ground) this.#walker(a, dt, ctx);
      else if (a.flock) this.#flockBird(a, dt, ctx);
      else if (a.circling) this.#circler(a, dt, ctx);
      else this.#songbird(a, dt, ctx);
    }
    // (Those flown off out of sight, or home to roost.)
    if (this.animals.some((a) => a.gone)) this.animals = this.animals.filter((a) => !a.gone);
    this.#draw();
  }

  #populate(ctx) {
    const { camera, generator: g, seaLevel } = ctx;
    const cx = camera.position.x, cz = camera.position.z;
    // Which way you're going (fast, the mobile birds are found ahead of you).
    if (this.last) {
      const dx = cx - this.last.x, dz = cz - this.last.z;
      this.heading = Math.hypot(dx, dz) > 4 ? Math.atan2(dx, dz) : null;
    }
    this.last = { x: cx, z: cz };
    // The land's own animals, chunk by chunk, as it comes into range.
    this.#settleAround(ctx);
    // Gone out of range (the wanderers: the land's own go with their
    // chunk), and the long dead: away.
    this.animals = this.animals.filter((a) => {
      const far = !a.chunk && Math.hypot(a.x - cx, a.z - cz) > (SPECIES[a.kind].bird ? 520 : 430);
      const rotted = !a.alive && a.deadTime > 180;
      return !(far || rotted || a.gone);
    });
    const alive = new Set(this.animals);
    for (const h of this.herds) h.members = h.members.filter((a) => alive.has(a));
    this.herds = this.herds.filter((h) => h.members.length);
    for (const f of this.flocks) f.birds = f.birds.filter((a) => alive.has(a));
    this.flocks = this.flocks.filter((f) => f.birds.length && !f.done);
    const count = (kind) => this.animals.filter((a) => a.kind === kind).length;

    // Somewhere suitable, out of sight: behind you or well off (or, on
    // the move, ahead of you where you're going).
    const view = Math.atan2(ctx.forward.x, ctx.forward.z);
    const spot = (near, farther, ok, tries = 14) => {
      for (let k = 0; k < tries; k++) {
        const ahead = this.heading !== null;
        const behind = !ahead && k < tries / 2;
        const a = ahead ? this.heading + rnd(-0.9, 0.9) : behind ? view + Math.PI + rnd(-1.6, 1.6) : rnd(0, TAU);
        const d = ahead || behind ? rnd(near, farther) : rnd(Math.max(near, 240), farther + 40);
        const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
        const y = g.getBaseHeight(x, z);
        if (y > seaLevel + 1 && ok(x, z, y)) return { x, z, y };
      }
      return null;
    };
    const day = ctx.day, winter = ctx.winter;

    // Flocks wheeling over the woods and fields, by day.
    if (day > 0.4 && this.flocks.filter((f) => f.kind === 'starling').length < (winter > 0.5 ? 1 : 2)) {
      const s = spot(260, 380, (x, z) => { const w = g.getBiomeWeights(x, z, {}); return w.temperate + w.savanna + w.pine > 0.6; }, 6);
      if (s) this.#spawnFlock('starling', s, Math.round(rnd(9, 18)));
    }
    // Gulls over the coast.
    if (day > 0.2 && count('gull') < 5) {
      const s = spot(120, 350, (x, z) => g.getOceanness(x, z) > 0.5, 10) ?? this.#coastSpot(ctx);
      if (s) this.#spawnCircler('gull', s);
    }
    // A hawk or an eagle, high over the mountains.
    if (day > 0.3 && count('hawk') < 1) {
      const s = spot(150, 350, (x, z) => g.getMountainness(x, z) > 0.35, 6);
      if (s) this.#spawnCircler('hawk', s);
    }
    // At dusk, crows fly over on their way home to roost.
    if (ctx.dusk > 0.25 && this.crowCooldown <= 0 && this.flocks.filter((f) => f.kind === 'crow').length < 2) {
      this.crowCooldown = rnd(20, 45);
      const a = rnd(0, TAU);
      const from = { x: cx + Math.sin(a) * 380, z: cz + Math.cos(a) * 380 };
      const b = a + Math.PI + rnd(-0.6, 0.6);
      const to = { x: cx + Math.sin(b) * 420, z: cz + Math.cos(b) * 420 };
      this.#spawnFlock('crow', { ...from, y: g.getBaseHeight(from.x, from.z) }, Math.round(rnd(6, 14)), to);
    }
  }

  // The chunks within about 400 m: each settled once as it comes into
  // range; those left well behind take their animals with them.
  #settleAround(ctx) {
    const C = ctx.chunkSize, R = 3;
    const ccx = Math.floor(ctx.camera.position.x / C), ccz = Math.floor(ctx.camera.position.z / C);
    for (const [key, home] of this.homes) {
      if (Math.hypot(home.cx - ccx, home.cz - ccz) <= R + 1.5) continue;
      for (const a of home.animals) a.gone = true;
      const herds = new Set(home.herds);
      this.herds = this.herds.filter((h) => !herds.has(h));
      this.homes.delete(key);
    }
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.hypot(dx, dz) > R + 0.5) continue;
        const cx = ccx + dx, cz = ccz + dz, key = `${cx},${cz}`;
        let home = this.homes.get(key);
        if (!home) this.homes.set(key, (home = this.#settle(cx, cz, ctx)));
        // Songbirds on its trees, once they're there (the trees near you).
        if (!home.birds && ctx.day > 0.3 && ctx.trees.crowns.get(key)) {
          home.birds = true;
          const list = ctx.trees.crowns.get(key), n = Math.round(home.rand() * 4 * (1 - 0.6 * ctx.winter));
          for (let k = 0; k < n && list.length; k++) {
            const i = Math.floor(home.rand() * (list.length / 5)) * 5;
            if (list[i + 3] - list[i + 2] < 2.5) continue;
            const a = this.#spawnSongbird(list.slice(i, i + 5));
            a.chunk = key;
            home.animals.push(a);
          }
        }
      }
    }
  }

  /**
   * What lives in chunk (cx, cz), from the lie of its land (the same each
   * time you come back): perhaps a herd of deer at the woods' edge, bison
   * out on the open grass, rabbits.
   */
  #settle(cx, cz, ctx) {
    const g = ctx.generator, C = ctx.chunkSize;
    const rand = mulberry32(Math.floor(hash2(cx, cz, ctx.seed ^ 0xdee7) * 4294967296));
    const home = { cx, cz, animals: [], herds: [], birds: false, rand };
    const at = () => {
      const x = (cx + 0.1 + 0.8 * rand()) * C, z = (cz + 0.1 + 0.8 * rand()) * C;
      return { x, z, y: g.getBaseHeight(x, z) };
    };
    const own = (from) => {
      for (const a of this.animals.slice(from)) (a.chunk = `${cx},${cz}`), home.animals.push(a);
    };
    // Deer, at the edges of the woods and in the clearings.
    for (let k = 0; k < 3; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1 || p.y > 150) continue;
      const w = g.getBiomeWeights(p.x, p.z, {}), f = g.getForestDensity(p.x, p.z);
      if (w.temperate + w.pine > 0.6 && f > 0.08 && f < 0.95 && g.getMountainness(p.x, p.z) < 0.55) {
        if (rand() < 0.28) {
          const from = this.animals.length;
          const herd = this.#spawnHerd('deer', p, 2 + Math.floor(rand() * 5));
          if (herd) home.herds.push(herd);
          own(from);
        }
        break;
      }
    }
    // Bison out on the open plains and the savanna.
    for (let k = 0; k < 3; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (((w.temperate > 0.6 && g.getPlainness(p.x, p.z) > 0.3) || w.savanna > 0.6) && g.getMountainness(p.x, p.z) < 0.3) {
        if (rand() < 0.14) {
          const from = this.animals.length;
          const herd = this.#spawnHerd('bison', p, 7 + Math.floor(rand() * 10));
          if (herd) home.herds.push(herd);
          own(from);
        }
        break;
      }
    }
    // Bears in the wooded foothills of the mountains: a black bear (now and
    // then a mother with her cubs), or, higher up, a grizzly.
    for (let k = 0; k < 2; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {}), m = g.getMountainness(p.x, p.z);
      if (m > 0.18 && m < 0.65 && w.temperate + w.pine > 0.5 && g.getForestDensity(p.x, p.z) > 0.05) {
        if (rand() < 0.22) {
          const from = this.animals.length;
          const kind = rand() < 0.35 + 0.5 * (m - 0.18) ? 'grizzly' : 'blackBear';
          this.#spawnWalker(kind, p.x, p.z, null);
          if (kind === 'blackBear' && rand() < 0.35) {
            // (Cubs: small, and never far from her.)
            const mother = this.animals[this.animals.length - 1];
            if (mother?.kind === kind) {
              const herd = { kind, goal: { x: p.x, z: p.z }, goalWait: rnd(15, 40), members: [mother], fear: null, fleeTime: 0 };
              mother.herd = herd;
              mother.offset = { x: 0, z: 0 };
              const cubs = 1 + Math.floor(rand() * 2);
              for (let c = 0; c < cubs; c++) {
                this.#spawnWalker(kind, p.x + rnd(-2, 2), p.z + rnd(-2, 2), herd);
                const cub = this.animals[this.animals.length - 1];
                if (cub?.herd === herd) (cub.scale *= 0.45), (cub.offset = { x: rnd(-2, 2), z: rnd(-2, 2) });
              }
              this.herds.push(herd);
              home.herds.push(herd);
            }
          }
          own(from);
        }
        break;
      }
    }
    // Rabbits in the grass and at the woods' edges.
    const bunnies = Math.floor(rand() * 4.5);
    for (let k = 0; k < bunnies; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (w.temperate + w.pine + w.savanna * 0.6 > 0.6 && g.getForestDensity(p.x, p.z) < 0.8 && g.getMountainness(p.x, p.z) < 0.45) {
        const from = this.animals.length;
        this.#spawnWalker('rabbit', p.x, p.z, null);
        own(from);
      }
    }
    return home;
  }

  #coastSpot(ctx) {
    const { camera, generator: g, seaLevel } = ctx;
    for (let k = 0; k < 10; k++) {
      const a = rnd(0, TAU), d = rnd(150, 380);
      const x = camera.position.x + Math.sin(a) * d, z = camera.position.z + Math.cos(a) * d;
      if (g.getBaseHeight(x, z) < seaLevel && g.getOceanness(x, z) > 0.5) return { x, z, y: seaLevel };
    }
    return null;
  }

  // Broad-leaved crowns (see TreeLayer.crowns) within `r` of you: [x, z, bottom, top, radius].
  #crownsNear(ctx, r) {
    const { camera, trees, chunkSize } = ctx;
    const out = [];
    const cx = Math.floor(camera.position.x / chunkSize), cz = Math.floor(camera.position.z / chunkSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = trees.crowns.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 5) {
          if (list[k + 3] - list[k + 2] < 2.5) continue; // (not the bushes)
          if (Math.hypot(list[k] - camera.position.x, list[k + 1] - camera.position.z) < r) out.push(list.slice(k, k + 5));
        }
      }
    }
    return out;
  }

  #spawnHerd(kind, s, n) {
    const herd = { kind, goal: { x: s.x, z: s.z }, goalWait: rnd(15, 40), members: [], fear: null, fleeTime: 0 };
    for (let k = 0; k < n; k++) {
      const a = rnd(0, TAU), d = rnd(1, kind === 'bison' ? 16 : 9);
      this.#spawnWalker(kind, s.x + Math.sin(a) * d, s.z + Math.cos(a) * d, herd);
    }
    if (!herd.members.length) return null;
    this.herds.push(herd);
    return herd;
  }

  #spawnWalker(kind, x, z, herd) {
    const sp = SPECIES[kind];
    const y = this.ctx.ground(x, z);
    if (!(y > this.ctx.seaLevel + 0.5)) return;
    const a = {
      kind, x, z, y, heading: rnd(0, TAU), pitch: 0, roll: 0, speed: 0,
      scale: (sp.size ?? 1) * (kind === 'bison' ? rnd(0.9, 1.1) : rnd(0.85, 1.1)),
      alive: true, health: sp.health, state: 'graze', timer: rnd(2, 10), phase: rnd(0, TAU), headDown: 0,
      herd, offset: { x: rnd(-1, 1) * (kind === 'bison' ? 12 : 7), z: rnd(-1, 1) * (kind === 'bison' ? 12 : 7) },
      antlers: kind === 'deer' && Math.random() < 0.4, fear: 0, home: { x, z },
      aggressive: !!sp.aggressive, // (for later: a grizzly will charge)
    };
    this.animals.push(a);
    herd?.members.push(a);
  }

  #spawnSongbird(c) {
    const a = {
      kind: 'songbird', x: c[0], y: c[3] + 0.1, z: c[1], heading: rnd(0, TAU), pitch: 0, roll: 0,
      scale: SPECIES.songbird.scale * rnd(0.85, 1.15), alive: true, health: SPECIES.songbird.health,
      state: 'perch', timer: rnd(3, 15), flap: 0, tint: SONGBIRD_TINTS[Math.floor(Math.random() * SONGBIRD_TINTS.length)],
    };
    this.animals.push(a);
    return a;
  }

  #spawnFlock(kind, s, n, to = null) {
    const g = this.ctx.generator;
    const flock = {
      kind, anchor: { x: s.x, z: s.z }, angle: rnd(0, TAU), radius: rnd(60, 110), alt: rnd(42, 60), // (well above the tallest trees)
      centre: { x: s.x, y: s.y + 50, z: s.z }, mode: to ? 'travel' : 'fly', timer: rnd(20, 45), to, birds: [], spin: Math.random() < 0.5 ? 1 : -1,
      groundY: g.getBaseHeight(s.x, s.z),
    };
    for (let k = 0; k < n; k++) {
      const sp = SPECIES[kind];
      const a = {
        kind, x: s.x + rnd(-8, 8), y: flock.centre.y + rnd(-3, 3), z: s.z + rnd(-8, 8), vx: 0, vy: 0, vz: 0,
        heading: 0, pitch: 0, roll: 0, scale: sp.scale * rnd(0.9, 1.1), alive: true, health: sp.health,
        flock, off: { a: rnd(0, TAU), r: rnd(2, 9), h: rnd(-2.5, 2.5), w: rnd(0.3, 0.8) }, flap: rnd(0, TAU), landed: false, state: 'fly',
      };
      flock.birds.push(a);
      this.animals.push(a);
    }
    this.flocks.push(flock);
  }

  #spawnCircler(kind, s) {
    const hawk = kind === 'hawk';
    const a = {
      kind, circling: true, centre: { x: s.x, z: s.z }, radius: hawk ? rnd(60, 120) : rnd(18, 50), angle: rnd(0, TAU), dir: Math.random() < 0.5 ? 1 : -1,
      alt: hawk ? rnd(90, 140) : rnd(10, 30), speed: hawk ? rnd(9, 12) : rnd(7, 10), x: s.x, y: 0, z: s.z,
      heading: 0, pitch: 0, roll: 0, scale: SPECIES[kind].scale * rnd(0.9, 1.1), alive: true, health: SPECIES[kind].health,
      flap: 0, flapping: 0, nextFlap: rnd(2, 8), nextCall: rnd(3, 20), groundY: s.y, state: 'fly',
    };
    this.animals.push(a);
  }

  // --- Behaviour ------------------------------------------------------------

  // Tree trunks and boulders within `reach` of (x, z): [x, z, radius, ...].
  #obstacles(x, z, reach, ctx) {
    const out = [];
    const C = ctx.chunkSize, cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        const trunks = ctx.trees.trunks.get(key);
        if (trunks) for (let k = 0; k < trunks.length; k += 3) {
          if (Math.abs(trunks[k] - x) < reach && Math.abs(trunks[k + 1] - z) < reach) out.push(trunks[k], trunks[k + 1], trunks[k + 2] + 0.15);
        }
        const rocks = ctx.rocks?.boulders.get(key);
        if (rocks) for (let k = 0; k < rocks.length; k += 7) {
          if (rocks[k + 4] < 0.35) continue; // (pebbles are stepped over)
          if (Math.abs(rocks[k] - x) < reach && Math.abs(rocks[k + 1] - z) < reach) out.push(rocks[k], rocks[k + 1], Math.max(rocks[k + 3], rocks[k + 5]) * 0.9);
        }
      }
    }
    return out;
  }

  #threat(a, ctx) {
    const c = ctx.camera.position;
    return { d: Math.hypot(a.x - c.x, a.z - c.z), d3: Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z), above: c.y - a.y };
  }

  #herd(herd, dt) {
    herd.fleeTime -= dt;
    herd.goalWait -= dt;
    // The herd drifts to fresh grazing now and then.
    if (herd.goalWait <= 0 && herd.fleeTime <= 0) {
      herd.goalWait = rnd(20, 50);
      const a = rnd(0, TAU), d = rnd(15, 45);
      const lead = herd.members[0];
      if (lead) herd.goal = { x: lead.x + Math.sin(a) * d, z: lead.z + Math.cos(a) * d };
    }
    // Where it is (its middle): the members keep together.
    let x = 0, z = 0;
    for (const m of herd.members) (x += m.x), (z += m.z);
    herd.mid = { x: x / herd.members.length, z: z / herd.members.length };
  }

  #walker(a, dt, ctx) {
    const sp = SPECIES[a.kind];
    if (!a.alive) {
      // Down on its side, where it fell.
      a.deadTime += dt;
      a.speed = 0;
      a.roll += (a.side * Math.PI * 0.5 - a.roll) * Math.min(1, dt * 5);
      a.y = ctx.ground(a.x, a.z) + sp.radius * 0.35 * a.scale * Math.abs(Math.sin(a.roll));
      return;
    }
    const herd = a.herd;
    const t = this.#threat(a, ctx);
    // Too close (on the ground, or flying low over them): they bolt.
    const reach = sp.flee * (t.above > 25 ? 0.5 : 1);
    if (!ctx.tame && t.d < reach && t.above < 50) {
      if (herd) {
        if (herd.fleeTime <= 0 && a.kind === 'bison') ctx.sound?.call('grunt', ctx.pan(a.x, a.z), 0.6);
        if (herd.fleeTime <= 0 && a.kind === 'deer') ctx.sound?.call('snort', ctx.pan(a.x, a.z), 0.5);
        this.#alarm(herd, ctx.camera.position.x, ctx.camera.position.z);
      } else a.fear = 3;
    }
    a.fear = Math.max(0, a.fear - dt);
    const fleeing = herd ? herd.fleeTime > 0 : a.fear > 0;
    let want = a.heading, speed = 0;
    if (fleeing) {
      const from = herd?.fear ?? ctx.camera.position;
      want = Math.atan2(a.x - from.x, a.z - from.z);
      if (herd?.mid) {
        // (Keeping with the herd as it runs.)
        const toMid = Math.atan2(herd.mid.x - a.x, herd.mid.z - a.z);
        if (Math.hypot(herd.mid.x - a.x, herd.mid.z - a.z) > 12) want += angleTo(want, toMid) * 0.35;
      }
      if (a.kind === 'rabbit') want += Math.sin(this.time * 3 + a.phase) * 0.6; // zig-zag
      speed = sp.run;
      a.state = 'flee';
      if (t.d > sp.calm && herd) herd.fleeTime = Math.min(herd.fleeTime, 0.5);
    } else {
      a.timer -= dt;
      const goal = herd ? { x: herd.goal.x + a.offset.x, z: herd.goal.z + a.offset.z } : a.goal ?? a.home;
      const far = Math.hypot(goal.x - a.x, goal.z - a.z);
      if (a.state === 'flee') (a.state = 'graze'), (a.timer = rnd(1, 3));
      if (a.timer <= 0) {
        // Graze a while, then wander on a few steps (on to the herd's
        // grazing if it's moved off).
        if (a.state === 'graze') (a.state = 'walk'), (a.timer = far > 6 ? rnd(6, 14) : rnd(2, 5));
        else (a.state = 'graze'), (a.timer = rnd(4, 14));
        if (!herd && a.state === 'walk') a.goal = { x: a.home.x + rnd(-15, 15), z: a.home.z + rnd(-15, 15) };
        // (Which way to wander, set once: not turning on the spot.)
        a.wanderHeading = a.heading + rnd(-0.8, 0.8);
      }
      if (a.state === 'walk') {
        want = far > 3 ? Math.atan2(goal.x - a.x, goal.z - a.z) : a.wanderHeading ?? a.heading;
        speed = sp.walk * (far > 25 ? 1.6 : 1);
      }
    }
    // A detour round water or a cliff ahead: a steady turn one way for a while.
    if (a.detour) {
      a.detour.time -= dt;
      want = a.detour.heading;
      if (a.detour.time <= 0) a.detour = null;
    }
    // Steering round the tree trunks and boulders ahead, before it reaches them.
    const body = sp.height * a.scale * 0.6, me = sp.radius * a.scale;
    if (speed > 0) {
      const look = body + 1 + a.speed * 0.8;
      const fx = Math.sin(want), fz = Math.cos(want);
      const obs = this.#obstacles(a.x, a.z, look + 2, ctx);
      let steer = 0;
      for (let k = 0; k < obs.length; k += 3) {
        const ox = obs[k] - a.x, oz = obs[k + 1] - a.z, r = obs[k + 2] + me + 0.3;
        const along = ox * fx + oz * fz;
        if (along < -0.5 || along > look + r) continue;
        const side = ox * fz - oz * fx; // (+: the obstacle's to the right)
        if (Math.abs(side) > r) continue;
        steer += (side >= 0 ? -1 : 1) * (1 - Math.max(0, along) / (look + r)) * (1.2 - Math.abs(side) / r);
      }
      want += Math.max(-1.3, Math.min(1.3, steer));
    }
    // Turn (slowly from a standstill, as it sets off; not spinning on the
    // spot), speed up or slow down.
    const rate = sp.turn * (fleeing ? 1.5 : 1) * (0.3 + 0.7 * Math.min(1, a.speed / sp.walk));
    a.heading += Math.max(-rate * dt, Math.min(rate * dt, angleTo(a.heading, want)));
    // (Slowing to take a sharp turn.)
    const sharp = Math.abs(angleTo(a.heading, want));
    a.speed += (speed * (1 - 0.6 * smoothstep(0.6, 1.6, sharp)) - a.speed) * Math.min(1, dt * (fleeing ? 3 : 1.5));
    // Step, over ground it can walk (not into the water, or off a cliff).
    if (a.speed > 0.01) {
      const sx = Math.sin(a.heading), sz = Math.cos(a.heading);
      const nx = a.x + sx * a.speed * dt, nz = a.z + sz * a.speed * dt;
      const ny = ctx.ground(nx, nz);
      const probe = ctx.ground(a.x + sx * (body + 1.5), a.z + sz * (body + 1.5));
      if (!(ny > ctx.seaLevel + 0.4) || !(probe > ctx.seaLevel + 0.3) || Math.abs(probe - a.y) > 2.5) {
        if (!a.detour) a.detour = { heading: a.heading + (Math.random() < 0.5 ? 1 : -1) * rnd(1.4, 2.2), time: rnd(1.5, 3) };
        a.speed *= Math.max(0, 1 - dt * 3);
        if (herd && herd.fleeTime <= 0) herd.goal = { x: a.x - sx * 20, z: a.z - sz * 20 };
      } else {
        a.x = nx;
        a.z = nz;
      }
      a.phase += (a.speed / sp.stride) * TAU * dt;
    }
    // Never inside a trunk or a boulder (its middle, nor its chest).
    for (const reach of [0, body * 0.7]) {
      const px = a.x + Math.sin(a.heading) * reach, pz = a.z + Math.cos(a.heading) * reach;
      const obs = this.#obstacles(px, pz, me + 3, ctx);
      for (let k = 0; k < obs.length; k += 3) {
        const ox = px - obs[k], oz = pz - obs[k + 1], r = obs[k + 2] + me * (reach ? 0.6 : 1), d = Math.hypot(ox, oz);
        if (d >= r || d === 0) continue;
        a.x += (ox / d) * (r - d);
        a.z += (oz / d) * (r - d);
      }
    }
    const y = ctx.ground(a.x, a.z);
    if (y === y) a.y = y;
    // Leaning with the slope.
    const sx = Math.sin(a.heading), sz = Math.cos(a.heading), L = sp.height * 0.5;
    const up = ctx.ground(a.x + sx * L, a.z + sz * L), down = ctx.ground(a.x - sx * L, a.z - sz * L);
    if (up === up && down === down) a.pitch += (-Math.atan2(up - down, 2 * L) * 0.8 - a.pitch) * Math.min(1, dt * 6);
    // Head down to graze, up when alarmed.
    const headWant = a.state === 'graze' ? 1 : fleeing ? -0.15 : 0.1;
    a.headDown += (headWant - a.headDown) * Math.min(1, dt * 3);
  }

  #songbird(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    const t = this.#threat(a, ctx);
    const scared = !ctx.tame && t.d3 < SPECIES.songbird.flee;
    a.timer -= dt;
    if (a.state === 'perch' || a.state === 'ground') {
      // Look about; on the ground, hop and peck.
      if (Math.random() < dt * 0.8) a.heading += rnd(-1.2, 1.2);
      if (a.state === 'ground') {
        a.hop = (a.hop ?? 0) - dt;
        if (a.hop <= 0) {
          a.hop = rnd(0.4, 1.4);
          const d = rnd(0.2, 0.5);
          const nx = a.x + Math.sin(a.heading) * d, nz = a.z + Math.cos(a.heading) * d;
          const ny = ctx.ground(nx, nz);
          if (ny > ctx.seaLevel + 0.2) (a.x = nx), (a.z = nz), (a.y = ny + 0.07 * a.scale);
        }
      }
      if (scared || a.timer <= 0) {
        // Off to another tree, or down to the ground beneath one (and
        // well away if you frightened it).
        const crowns = this.#crownsNear(ctx, scared ? 140 : 90);
        let c = crowns[Math.floor(Math.random() * crowns.length)];
        if (scared) c = crowns.find((k) => Math.hypot(k[0] - ctx.camera.position.x, k[1] - ctx.camera.position.z) > 40) ?? c;
        const toGround = !scared && Math.random() < 0.35;
        let to;
        if (c && !toGround) to = { x: c[0] + rnd(-0.5, 0.5) * c[4], y: c[3] + 0.05, z: c[1] + rnd(-0.5, 0.5) * c[4], state: 'perch' };
        else {
          const x = a.x + rnd(-6, 6), z = a.z + rnd(-6, 6), y = ctx.ground(x, z);
          to = y > ctx.seaLevel + 0.3 ? { x, y: y + 0.07 * a.scale, z, state: 'ground' } : null;
        }
        if (scared && !to) to = { x: a.x + (a.x - ctx.camera.position.x) * 4, y: a.y + 20, z: a.z + (a.z - ctx.camera.position.z) * 4, state: 'gone' };
        if (to) {
          const d = Math.hypot(to.x - a.x, to.y - a.y, to.z - a.z);
          // (Up over the treetops between, not through them.)
          const over = Math.max(a.y, to.y) + 3 + d * 0.06 - (a.y + to.y) / 2;
          a.path = { from: { x: a.x, y: a.y, z: a.z }, to, p: 0, dur: Math.max(0.6, (d + over) / (scared ? 9 : 6)), arc: Math.max(1 + d * 0.15, over) };
          a.state = 'fly';
          a.timer = rnd(5, 20);
          if (scared) ctx.sound?.call('flutter', ctx.pan(a.x, a.z), 0.3);
        } else a.timer = rnd(3, 8);
      }
    } else if (a.state === 'fly' && a.path) {
      const P = a.path;
      P.p = Math.min(1, P.p + dt / P.dur);
      const s = P.p * P.p * (3 - 2 * P.p);
      const nx = P.from.x + (P.to.x - P.from.x) * s, nz = P.from.z + (P.to.z - P.from.z) * s;
      const ny = P.from.y + (P.to.y - P.from.y) * s + Math.sin(Math.PI * P.p) * P.arc;
      if (Math.hypot(nx - a.x, nz - a.z) > 1e-4) a.heading = Math.atan2(nx - a.x, nz - a.z);
      a.pitch = -Math.atan2(ny - a.y, Math.hypot(nx - a.x, nz - a.z) + 1e-4) * 0.6;
      a.x = nx; a.y = ny; a.z = nz;
      a.flap += dt * 24;
      if (P.p >= 1) {
        a.state = P.to.state === 'gone' ? 'gone' : P.to.state;
        a.pitch = 0;
        a.timer = rnd(4, 16);
        if (a.state === 'gone') a.gone = true;
      }
    }
  }

  #flock(f, dt, ctx) {
    const g = ctx.generator, cam = ctx.camera.position;
    f.timer -= dt;
    const d = Math.hypot(f.centre.x - cam.x, f.centre.z - cam.z);
    if (f.mode === 'travel') {
      // Crows: on across the sky to their roost, cawing.
      const dx = f.to.x - f.centre.x, dz = f.to.z - f.centre.z, l = Math.hypot(dx, dz);
      f.centre.x += (dx / l) * 9 * dt;
      f.centre.z += (dz / l) * 9 * dt;
      f.groundY += (g.getBaseHeight(f.centre.x, f.centre.z) - f.groundY) * Math.min(1, dt);
      f.centre.y = Math.max(f.groundY, ctx.seaLevel) + f.alt;
      if (Math.random() < dt * 0.5 && d < 300) ctx.sound?.call('caw', ctx.pan(f.centre.x, f.centre.z), Math.max(0.1, 1 - d / 300));
      if (l < 20) f.done = true;
      if (f.done) for (const b of f.birds) b.gone = true;
      return;
    }
    if (f.mode === 'fly') {
      // Wheeling in great loops over their patch of country.
      f.angle += dt * 0.1 * f.spin;
      f.centre.x = f.anchor.x + Math.cos(f.angle) * f.radius;
      f.centre.z = f.anchor.z + Math.sin(f.angle * 2) * f.radius * 0.5;
      f.groundY += (g.getBaseHeight(f.centre.x, f.centre.z) - f.groundY) * Math.min(1, dt * 0.5);
      f.centre.y = Math.max(f.groundY, ctx.seaLevel) + f.alt + Math.sin(this.time * 0.3) * 5;
      if (!ctx.tame && d < 20 && Math.abs(cam.y - f.centre.y) < 20) this.#scatter(f, ctx);
      // Now and then, down to feed in an open field.
      if (f.timer <= 0) {
        f.timer = rnd(25, 50);
        const x = f.centre.x + rnd(-40, 40), z = f.centre.z + rnd(-40, 40), y = ctx.ground(x, z);
        if (y > ctx.seaLevel + 1 && g.getForestDensity(x, z) < 0.45 && Math.hypot(x - cam.x, z - cam.z) > 50) {
          f.mode = 'land';
          f.spot = { x, y, z };
          f.timer = rnd(12, 25);
          for (const b of f.birds) {
            const a = rnd(0, TAU), r = rnd(0.5, 6);
            b.land = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
            b.land.y = ctx.ground(b.land.x, b.land.z) + 0.06 * b.scale;
          }
        }
      }
    } else if (f.mode === 'land') {
      f.centre.x = f.spot.x; f.centre.z = f.spot.z; f.centre.y = f.spot.y;
      if (!ctx.tame && d < SPECIES[f.kind].flee) this.#scatter(f, ctx);
      else if (f.timer <= 0) (f.mode = 'fly'), (f.timer = rnd(25, 50)), (f.anchor = { x: f.spot.x - Math.cos(f.angle) * f.radius, z: f.spot.z - Math.sin(f.angle * 2) * f.radius * 0.5 });
    } else if (f.mode === 'scatter') {
      if (f.timer <= 0) (f.mode = 'fly'), (f.timer = rnd(30, 60));
    }
  }

  #scatter(f, ctx) {
    f.mode = 'scatter';
    f.timer = 2.5;
    const cam = ctx.camera.position;
    for (const b of f.birds) {
      const dx = b.x - cam.x, dz = b.z - cam.z, l = Math.hypot(dx, dz) || 1;
      b.vx = (dx / l) * rnd(8, 13) + rnd(-3, 3);
      b.vz = (dz / l) * rnd(8, 13) + rnd(-3, 3);
      b.vy = rnd(4, 9);
      b.landed = false;
    }
    ctx.sound?.call('flutter', ctx.pan(f.centre.x, f.centre.z), 0.6);
  }

  #flockBird(b, dt, ctx) {
    if (this.#falling(b, dt, ctx)) return;
    const f = b.flock;
    let tx, ty, tz;
    if (f.mode === 'land' && b.land) {
      tx = b.land.x; ty = b.land.y; tz = b.land.z;
      if (Math.hypot(b.x - tx, b.y - ty, b.z - tz) < 0.4) {
        // Down: hopping about, pecking.
        b.landed = true;
        b.vx = b.vy = b.vz = 0;
        b.pitch = 0;
        if (Math.random() < dt * 0.7) {
          b.heading += rnd(-1.5, 1.5);
          const nx = b.x + Math.sin(b.heading) * 0.3, nz = b.z + Math.cos(b.heading) * 0.3;
          b.land = { x: nx, z: nz, y: ctx.ground(nx, nz) + 0.06 * b.scale };
          b.x = nx; b.z = nz; b.y = b.land.y;
        }
        return;
      }
    } else {
      b.landed = false;
      if (f.mode === 'scatter') {
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.vy -= dt * 2;
        this.#bank(b, b.vx, b.vy, b.vz, dt);
        b.flap += dt * 26;
        return;
      }
      b.off.a += dt * b.off.w * f.spin;
      tx = f.centre.x + Math.cos(b.off.a) * b.off.r;
      ty = f.centre.y + b.off.h + Math.sin(this.time * 1.3 + b.off.a) * 1.2;
      tz = f.centre.z + Math.sin(b.off.a) * b.off.r;
    }
    // Steering (springy, so the flock ripples as it turns).
    const k = f.mode === 'land' ? 2.2 : 1.6;
    b.vx += ((tx - b.x) * k - b.vx * 1.3) * dt;
    b.vy += ((ty - b.y) * k - b.vy * 1.3) * dt;
    b.vz += ((tz - b.z) * k - b.vz * 1.3) * dt;
    const sp = Math.hypot(b.vx, b.vy, b.vz), max = f.kind === 'crow' ? 14 : 16;
    if (sp > max) (b.vx *= max / sp), (b.vy *= max / sp), (b.vz *= max / sp);
    if (f.mode === 'travel') {
      // (Crows: carried along with their line, not just chasing it.)
      const dx = f.to.x - f.centre.x, dz = f.to.z - f.centre.z, l = Math.hypot(dx, dz) || 1;
      b.x += (dx / l) * 9 * dt;
      b.z += (dz / l) * 9 * dt;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // (Never down through the treetops, but over them.)
    if (f.mode !== 'land') {
      const floor = ctx.ground(b.x, b.z) + 34;
      if (b.y < floor) (b.y += (floor - b.y) * Math.min(1, dt * 3)), (b.vy = Math.max(b.vy, 0));
    }
    const fx = b.vx + (f.mode === 'travel' ? (f.to.x - f.centre.x) : 0), fz = b.vz + (f.mode === 'travel' ? (f.to.z - f.centre.z) : 0);
    this.#bank(b, fx, b.vy, fz, dt);
    b.flap += dt * (b.vy > 0.5 || f.mode === 'land' ? 26 : 16);
  }

  #bank(b, vx, vy, vz, dt) {
    if (Math.hypot(vx, vz) < 0.05) return;
    const h = Math.atan2(vx, vz);
    const turn = angleTo(b.heading, h);
    b.heading += turn * Math.min(1, dt * 6);
    b.roll += (-turn * 1.5 - b.roll) * Math.min(1, dt * 4);
    b.pitch = -Math.atan2(vy, Math.hypot(vx, vz)) * 0.7;
  }

  #circler(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    // Round and round on the wind, gliding, now and then a few wingbeats.
    const hawk = a.kind === 'hawk';
    a.angle += (a.speed / a.radius) * dt * a.dir;
    const gx = a.centre.x + Math.cos(a.angle) * a.radius, gz = a.centre.z + Math.sin(a.angle) * a.radius;
    const ground = hawk ? ctx.generator.getBaseHeight(gx, gz) : ctx.seaLevel;
    a.groundY += (Math.max(ground, ctx.seaLevel) - a.groundY) * Math.min(1, dt * 0.3);
    const y = a.groundY + a.alt + Math.sin(this.time * 0.2 + a.angle) * (hawk ? 8 : 4);
    a.heading = Math.atan2(gx - a.x, gz - a.z);
    a.pitch = -Math.atan2(y - a.y, a.speed * dt + 1e-4) * 0.3;
    a.x = gx; a.y = y; a.z = gz;
    a.roll = -a.dir * (hawk ? 0.3 : 0.4);
    a.nextFlap -= dt;
    if (a.nextFlap <= 0) (a.flapping = rnd(0.8, 2)), (a.nextFlap = rnd(4, 12));
    a.flapping -= dt;
    a.flap += dt * (a.flapping > 0 ? (hawk ? 9 : 13) : 0);
    a.nextCall -= dt;
    if (a.nextCall <= 0) {
      a.nextCall = rnd(8, 25);
      const d = Math.hypot(a.x - ctx.camera.position.x, a.y - ctx.camera.position.y, a.z - ctx.camera.position.z);
      if (d < 250) ctx.sound?.call(hawk ? 'hawk' : 'gull', ctx.pan(a.x, a.z), Math.max(0.1, 1 - d / 250));
    }
    // Drifting over its patch; out to sea or away if you come close.
    const t = this.#threat(a, ctx);
    if (!ctx.tame && t.d3 < SPECIES[a.kind].flee) {
      const dx = a.x - ctx.camera.position.x, dz = a.z - ctx.camera.position.z, l = Math.hypot(dx, dz) || 1;
      a.centre.x += (dx / l) * 12 * dt;
      a.centre.z += (dz / l) * 12 * dt;
      a.flapping = Math.max(a.flapping, 0.5);
    }
  }

  // A shot bird tumbles down, then lies on the ground.
  #falling(a, dt, ctx) {
    if (a.alive) return false;
    a.deadTime += dt;
    if (a.state === 'falling') {
      a.vy = (a.vy ?? 0) - 9.8 * dt;
      a.y += a.vy * dt;
      a.roll += dt * 8;
      const y = ctx.ground(a.x, a.z);
      if (!(a.y > y + 0.05 * a.scale)) (a.state = 'dead'), (a.y = (y === y ? y : a.y) + 0.05 * a.scale), (a.roll = a.side * Math.PI * 0.5), (a.pitch = 0);
    }
    return true;
  }

  // --- Drawing --------------------------------------------------------------

  #draw() {
    const counts = {};
    for (const [kind, rig] of Object.entries(this.rigs)) {
      counts[kind] = 0;
      for (const m of Object.values(rig.meshes)) m.count = 0;
    }
    for (const a of this.animals) {
      const rig = this.rigs[a.kind], sp = SPECIES[a.kind], M = rig.meshes;
      if (counts[a.kind] >= sp.max) continue;
      const i = counts[a.kind]++;
      euler.set(a.pitch, a.heading, a.roll, 'YXZ');
      quat.setFromEuler(euler);
      base.compose(pos.set(a.x, a.y, a.z), quat, scl.setScalar(a.scale));
      const put = (mesh, pivot, rx, ry, rz) => {
        euler.set(rx, ry, rz, 'YXZ');
        quat.setFromEuler(euler);
        part.compose(pos.set(pivot[0], pivot[1], pivot[2]), quat, scl.setScalar(1));
        out.multiplyMatrices(base, part);
        mesh.setMatrixAt(mesh.count++, out);
      };
      if (sp.ground) {
        const moving = Math.min(1, a.speed / sp.walk);
        const running = smoothstep(sp.walk * 1.5, sp.run * 0.7, a.speed);
        const bob = a.kind === 'rabbit' ? Math.abs(Math.sin(a.phase * 0.5)) * 0.28 * moving : Math.abs(Math.sin(a.phase)) * 0.04 * moving;
        base.elements[13] += bob; // (the body bobs as it goes; a rabbit bounds)
        put(M.body, [0, 0, 0], 0, 0, 0);
        const headRx = a.alive ? a.headDown * (a.kind === 'bison' ? 0.5 : a.kind === 'rabbit' ? 0.4 : SPECIES[a.kind].forager ? 0.6 : 1.05) + Math.sin(a.phase * 2) * 0.05 * moving : 0.3;
        put(M.head, rig.model.headPivot, headRx, a.alive && a.state === 'graze' ? Math.sin(this.time * 0.7 + a.phase) * 0.15 : 0, 0);
        if (M.antlers && a.antlers) put(M.antlers, rig.model.headPivot, headRx, 0, 0);
        // Legs: a walk (diagonal pairs), breaking into a gallop (pairs
        // together, front then back); a rabbit's hind legs push together.
        rig.model.legs.forEach((p, k) => {
          const front = k < 2, left = k % 2 === 0;
          let phase = a.phase + (front === left ? 0 : Math.PI);
          if (running) phase = a.phase + (front ? 0 : Math.PI * 0.6) + (left ? 0 : 0.35);
          const amp = a.alive ? (0.35 + 0.5 * running) * moving : 0;
          let swing = Math.sin(phase) * amp;
          if (a.kind === 'rabbit') swing = (front ? -1 : 1) * Math.max(0, Math.sin(a.phase * 0.5)) * 0.9 * moving;
          put(M.legs, p, swing + (a.alive ? 0 : (front ? -0.6 : 0.6)), 0, 0);
        });
      } else {
        const perched = a.state === 'perch' || a.state === 'ground' || a.landed || a.state === 'dead';
        let flap = 0, fold = 0;
        if (perched) fold = 1.35;
        else flap = Math.sin(a.flap) * (a.kind === 'hawk' || a.kind === 'gull' ? 0.55 : 0.9);
        if (a.circling && !(a.flapping > 0)) flap = 0.08; // (gliding: wings held out, a slight lift)
        put(M.body, [0, 0, 0], 0, 0, 0);
        put(M.wingL, [0.05, 0.02, 0.02], 0, fold, flap - (perched ? 0.15 : 0));
        put(M.wingR, [-0.05, 0.02, 0.02], 0, -fold, -flap + (perched ? 0.15 : 0));
        if (a.tint) M.body.setColorAt(M.body.count - 1, tint.set(a.tint).lerp(white, 0.1));
        else if (a.kind === 'songbird') M.body.setColorAt(M.body.count - 1, white);
      }
    }
    for (const rig of Object.values(this.rigs)) {
      for (const m of Object.values(rig.meshes)) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }
}
