import { Color, Group, Mesh, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { Puffs } from '../render/Puffs.js';
import { Inventory } from './Inventory.js';
import {
  anvilModel, bedModel, campfireModel, caughtModel, chestModel, cropModel, dryingRackModel, FENCE_LENGTH, fenceGateDoorModel, fenceGatePostsModel, fenceModel,
  furnaceModel, GATE_DOOR_WIDTH, gateDoorModel, gateFrameModel, grindstoneModel, meatStripModel, plotModel, raftModel, ROOF_SIZE, roofModel,
  ropeLengthModel, ropeStakeModel, snareModel, stakeModel, stretchedHideModel, tanningRackModel, WALL_LENGTH, wallModel,
} from './models.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const FLAMES = [new Color(1, 0.55, 0.12), new Color(1, 0.75, 0.25), new Color(1, 0.38, 0.08)];
const SMOKE = new Color(0.55, 0.53, 0.5);
const FUEL_START = 450; // seconds a new fire burns
const FUEL_LOG = 270; // and each log added
const FUEL_MAX = 1350;
// How long a crop takes to ripen (seconds, in a good season).
export const GROW = { wheat: 420, corn: 600, potato: 480, carrot: 360 };
const UP = new Vector3(0, 1, 0), tq = new Quaternion(), yq = new Quaternion(), nv = new Vector3();
const R = ROOF_SIZE / 2 - 0.15;

// Each kind: its model, its footprint for collisions (a box half-length ×
// half-depth, or a circle, or nothing), how tall (for standing on top),
// whether it burns (`fire`), and how many things it can work on at once
// (`jobs`: meat cooking on a fire, ore smelting, strips drying on a rack).
// (`line`: a wall, a fence: they join end to end, `len` long; `door`: a gate;
// `posts`: a roof's, what's solid of it; `tilt`: laid on the slope of the ground.)
const KINDS = {
  campfire: { make: campfireModel, circle: 0, fire: 'open', jobs: 3, tilt: true, reach: 0.8 },
  furnace: { make: furnaceModel, circle: 0.72, tall: 1.4, fire: 'closed', jobs: 4 },
  wall: { make: wallModel, box: [WALL_LENGTH / 2, 0.28], tall: 3.3, line: 'wall', len: WALL_LENGTH },
  gate: { make: gateFrameModel, box: [WALL_LENGTH / 2, 0.28], tall: 3.3, line: 'wall', len: WALL_LENGTH, door: true },
  fence: { make: fenceModel, box: [FENCE_LENGTH / 2, 0.12], tall: 1.2, line: 'fence', len: FENCE_LENGTH },
  fenceGate: { make: fenceGatePostsModel, box: [FENCE_LENGTH / 2, 0.12], tall: 1.2, line: 'fence', len: FENCE_LENGTH, door: true },
  roof: { make: roofModel, posts: [[R, R], [-R, R], [R, -R], [-R, -R]], box: [ROOF_SIZE / 2, ROOF_SIZE / 2], tall: 4.1, steep: 1.2 },
  anvil: { make: anvilModel, box: [0.5, 0.3], tall: 0.95 },
  grindstone: { make: grindstoneModel, box: [0.3, 0.45], tall: 1.2 },
  tanningRack: { make: tanningRackModel, box: [0.9, 0.2], jobs: 1 },
  plot: { make: plotModel, circle: 0, tilt: true, reach: 1 },
  rope: { make: ropeStakeModel, circle: 0 },
  stake: { make: stakeModel, circle: 0.26, tall: 3.3 },
  chest: { make: chestModel, box: [0.52, 0.32], tall: 0.6 },
  bed: { make: bedModel, box: [0.62, 1.08], tall: 0.45 },
  dryingRack: { make: dryingRackModel, circle: 0, jobs: 4 },
  snare: { make: snareModel, circle: 0 },
  raft: { make: raftModel, circle: 0 },
};

/**
 * What you've built: campfires, furnaces, palisade walls and gates,
 * sharpened logs, chests, beds, drying racks, snares, rafts.
 *
 * Set down where you point (a see-through preview shows where first: green
 * where it can go, red where it can't); walls and gates snap end to end to
 * make a line of palisade. Solid to you and the animals (a gate only when
 * shut). Fires are lit with flint and steel and burn on their logs (add
 * more to keep one going), warming you when near; on a campfire meat cooks
 * (a minute), a waterskin boils and a pot of stew bubbles; in a furnace iron
 * ore smelts into bars; on a drying rack meat and fish dry into jerky. A
 * snare catches rabbits; a raft floats. Everything is saved with the world.
 */
export class Structures {
  /** @param modelOf (id) => geometry: how a thing (meat, a pot...) looks, for what's cooking */
  constructor(scene, modelOf) {
    this.scene = scene;
    this.modelOf = modelOf;
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.models = {};
    this.list = [];
    this.group = new Group();
    this.group.name = 'structures';
    scene.add(this.group);
    this.ghostMaterial = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, emissive: 0x2a8a3a });
    this.ghost = null;
    this.ghostType = null;
    this.nextId = 1;
    this.onChange = null; // (called whenever something's built, lit or taken: to save)
    this.onDone = null; // (s, stack): something's finished cooking, smelting or drying
  }

  model(type) {
    return this.models[type] ?? (this.models[type] = KINDS[type].make());
  }

  // --- Building ------------------------------------------------------------------

  /**
   * Where `type` would go if set down at `point`, facing `yaw` (the way you
   * look): { x, y, z, rot, ok, why }. Walls and gates lie across your view
   * and snap onto the end of one nearby. `ground(x, z)` is the height;
   * `water(x, z)` the water's level there, or null. (A raft goes on water;
   * nothing else does.)
   */
  plan(type, point, yaw, ground, water, blocked = null) {
    let x = point.x, z = point.z;
    let rot = yaw;
    const kind = KINDS[type];
    if (kind.line) {
      // Across your view, and onto the end of another wall or gate (a fence
      // or its gate) if one's close.
      const ax = Math.cos(rot), az = -Math.sin(rot), L = kind.len;
      let best = null, bestD = 1.6;
      for (const s of this.list) {
        const k = KINDS[s.type];
        if (k.line !== kind.line) continue;
        const sx = Math.cos(s.rot), sz = -Math.sin(s.rot);
        for (const end of [1, -1]) {
          const ex = s.x + (sx * end * k.len) / 2, ez = s.z + (sz * end * k.len) / 2;
          for (const mine of [1, -1]) {
            const mx = x + (ax * mine * L) / 2, mz = z + (az * mine * L) / 2;
            const d = Math.hypot(mx - ex, mz - ez);
            if (d < bestD) (bestD = d), (best = { ex, ez, mine });
          }
        }
      }
      if (best) {
        x = best.ex - (ax * best.mine * L) / 2;
        z = best.ez - (az * best.mine * L) / 2;
      }
    }
    const half = kind.box ? kind.box : type === 'raft' ? [1.2, 1.3] : [kind.circle || kind.reach || 0.5, kind.circle || kind.reach || 0.5];
    const ax = Math.cos(rot), az = -Math.sin(rot), bx = Math.sin(rot), bz = Math.cos(rot);
    let lo = Infinity, hi = -Infinity, wet = 0, level = -Infinity, deep = Infinity;
    const corners = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0]];
    for (const [u, v] of corners) {
      const px = x + ax * u * half[0] + bx * v * half[1], pz = z + az * u * half[0] + bz * v * half[1];
      const h = ground(px, pz);
      if (!Number.isFinite(h)) continue;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      const w = water(px, pz);
      if (w !== null && w > h + 0.05) {
        wet++;
        level = Math.max(level, w);
        deep = Math.min(deep, w - h);
      }
    }
    let y = kind.line || type === 'stake' || type === 'roof' ? lo - 0.05 : kind.tilt ? ground(x, z) + 0.01 : lo;
    // (Laid on the slope: its tilt, from the lie of the ground under it.)
    let tilt = null;
    if (kind.tilt) {
      const e = half[0];
      const gx = (ground(x + e, z) - ground(x - e, z)) / (2 * e), gz = (ground(x, z + e) - ground(x, z - e)) / (2 * e);
      if (Number.isFinite(gx) && Number.isFinite(gz)) {
        tilt = [-gx, -gz];
        // (Sat on the ground's bumps, never sunk into them: raised until
        // nothing of its footprint is under the ground.)
        let under = 0;
        for (const [u, v] of corners) {
          const dx = ax * u * half[0] + bx * v * half[1], dz = az * u * half[0] + bz * v * half[1];
          const h = ground(x + dx, z + dz);
          if (Number.isFinite(h)) under = Math.max(under, h - (y + gx * dx + gz * dz));
        }
        y += under;
      }
    }
    let ok = true, why = '';
    if (type === 'raft') {
      if (wet < corners.length || deep < 0.4) (ok = false), (why = 'A raft needs open water');
      y = level - 0.12;
    } else if (wet) (ok = false), (why = "Can't build in the water");
    else if (hi - lo > (kind.line ? 1.4 : kind.steep ?? (kind.tilt ? 1.4 : 0.6))) (ok = false), (why = 'The ground is too steep here');
    // Nothing in the way: across its whole footprint (a wall along its
    // length; a roof just where its posts stand, as it goes over things),
    // no tree, bush, boulder, log or other thing built.
    if (ok && type !== 'raft') {
      const spots = [];
      if (type === 'roof') for (const [u, v] of kind.posts) spots.push([u, v, 0.2]);
      else if (kind.line) for (let u = -half[0] + 0.15; u <= half[0] - 0.15 + 1e-6; u += 0.4) spots.push([u, 0, half[1]]);
      else for (const fu of [-1, -0.5, 0, 0.5, 1]) for (const fv of [-1, -0.5, 0, 0.5, 1]) spots.push([fu * half[0] * 0.85, fv * half[1] * 0.85, 0.12]);
      for (const [u, v, r] of spots) {
        const px = x + ax * u + bx * v, pz = z + az * u + bz * v;
        const what = blocked?.(px, pz, r) ?? this.#builtAt(px, pz, r, type, x, z);
        if (what) {
          ok = false;
          why = what;
          break;
        }
      }
    }
    return { type, x, y, z, rot, ok, why, tilt };
  }

  // Whether something already built stands at (px, pz) (within `r`), in the
  // way of `type` going up at (x, z): why not, or null. (Lengths of the same
  // wall or fence may meet end to end; a roof goes over things.)
  #builtAt(px, pz, r, type, x, z) {
    const kind = KINDS[type];
    for (const s of this.list) {
      const k = KINDS[s.type];
      if (s.type === 'rope' || s.type === 'roof' || type === 'roof') continue;
      if (kind.line && k.line === kind.line) {
        if (Math.hypot(s.x - x, s.z - z) < k.len * 0.5) return 'Something is in the way';
        continue;
      }
      const half = k.box ? k.box : [k.circle || k.reach || 0.5, k.circle || k.reach || 0.5];
      const ax = Math.cos(s.rot), az = -Math.sin(s.rot), bx = Math.sin(s.rot), bz = Math.cos(s.rot);
      const u = (px - s.x) * ax + (pz - s.z) * az, v = (px - s.x) * bx + (pz - s.z) * bz;
      if (Math.abs(u) < half[0] + r && Math.abs(v) < half[1] + r) return 'Something is in the way';
    }
    return null;
  }

  /** Shows the see-through preview of `plan` (or hides it: null). */
  preview(plan) {
    if (!plan) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (this.ghostType !== plan.type) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = new Group();
      this.ghost.add(new Mesh(this.model(plan.type), this.ghostMaterial));
      if (KINDS[plan.type].door) {
        const door = new Mesh(this.doorModel(plan.type), this.ghostMaterial);
        door.position.x = -this.#doorWidth(plan.type) / 2;
        this.ghost.add(door);
      }
      for (const m of this.ghost.children) m.renderOrder = 4;
      this.scene.add(this.ghost);
      this.ghostType = plan.type;
    }
    this.ghost.visible = true;
    this.ghost.position.set(plan.x, plan.y, plan.z);
    this.#orient(this.ghost, plan.rot, plan.tilt);
    this.ghostMaterial.emissive.setHex(plan.ok ? 0x2a8a3a : 0xa02a2a);
  }

  doorModel(type = 'gate') {
    const key = `${type}Door`;
    return this.models[key] ?? (this.models[key] = type === 'fenceGate' ? fenceGateDoorModel() : gateDoorModel());
  }

  #doorWidth(type) {
    return type === 'fenceGate' ? FENCE_LENGTH - 0.3 : GATE_DOOR_WIDTH;
  }

  // Turned to face `rot`, and laid on the slope (`tilt`: the ground's slope, [-dy/dx, -dy/dz]).
  #orient(obj, rot, tilt) {
    yq.setFromAxisAngle(UP, rot);
    if (tilt) {
      nv.set(tilt[0], 1, tilt[1]).normalize();
      obj.quaternion.copy(tq.setFromUnitVectors(UP, nv)).multiply(yq);
    } else obj.quaternion.copy(yq);
  }

  /** Builds it. Returns the new structure. */
  build(plan, extra = {}) {
    const s = { id: this.nextId++, type: plan.type, x: plan.x, y: plan.y, z: plan.z, rot: plan.rot, tilt: plan.tilt ?? null, lit: false, fuel: 0, jobs: [], ...extra };
    s.jobs = (s.jobs ?? []).map((j) => ({ ...j }));
    if (s.type === 'chest') {
      const inv = new Inventory(10);
      if (extra.contents) extra.contents.forEach((st, i) => (inv.slots[i] = st));
      s.contents = inv;
    }
    const mesh = new Group();
    const body = new Mesh(this.model(s.type), this.material);
    body.castShadow = true;
    body.receiveShadow = true;
    mesh.add(body);
    if (KINDS[s.type].door) {
      // (The door swings on its hinge at the left post.)
      s.door = new Mesh(this.doorModel(s.type), this.material);
      s.door.castShadow = true;
      s.door.position.x = -this.#doorWidth(s.type) / 2;
      s.door.rotation.y = s.open ? -Math.PI / 2 : 0;
      mesh.add(s.door);
    }
    if (s.type === 'rope') {
      // (Hanging from its stake, over the edge and down the cliff.)
      s.len = s.len ?? 5;
      const rope = new Mesh(this.models.ropeLength ?? (this.models.ropeLength = ropeLengthModel()), this.material);
      rope.position.set(0, 0.28, 0.35);
      rope.scale.set(1, s.len + 0.3, 1);
      rope.castShadow = true;
      mesh.add(rope);
    }
    if (s.type === 'plot') {
      s.cropMesh = new Mesh(undefined, this.material);
      s.cropMesh.castShadow = true;
      mesh.add(s.cropMesh);
      this.#showCrop(s);
    }
    if (s.type === 'snare') {
      s.catchMesh = new Mesh(caughtModel(), this.material);
      s.catchMesh.visible = !!s.caught;
      mesh.add(s.catchMesh);
    }
    s.jobGroup = new Group();
    mesh.add(s.jobGroup);
    mesh.position.set(s.x, s.y, s.z);
    this.#orient(mesh, s.rot, s.tilt);
    mesh.userData.structure = s;
    this.group.add(mesh);
    s.mesh = mesh;
    this.list.push(s);
    if (KINDS[s.type].fire && s.lit) this.#kindle(s);
    this.#showJobs(s);
    this.onChange?.();
    return s;
  }

  /** Takes a structure down (it goes back in your pack as the item it was). */
  remove(s) {
    this.#douse(s);
    this.group.remove(s.mesh);
    this.list.splice(this.list.indexOf(s), 1);
    this.onChange?.();
  }

  /** Opens or shuts a gate. */
  toggle(s) {
    if (!KINDS[s.type].door) return;
    s.open = !s.open;
    this.onChange?.();
  }

  // --- Fires, and what's worked on at them ---------------------------------------

  /** Lights a campfire or furnace (with flint and steel). Returns false if it has nothing to burn. */
  light(s) {
    if (!KINDS[s.type].fire || s.lit) return false;
    if (s.fuel <= 0) s.fuel = s.burnt ? 0 : FUEL_START;
    if (s.fuel <= 0) return false;
    s.lit = true;
    s.litTime = 0;
    this.#kindle(s);
    this.onChange?.();
    return true;
  }

  /** Adds a log to a fire: it burns on longer (and can be lit again once burnt out). */
  feed(s) {
    if (!KINDS[s.type].fire || s.fuel >= FUEL_MAX - 30) return false;
    s.fuel = Math.min(FUEL_MAX, s.fuel + FUEL_LOG);
    s.burnt = false;
    this.onChange?.();
    return true;
  }

  /**
   * Sets something to work at `s`: `stack` (one thing: meat, a waterskin, a
   * pot, ore) becomes `out` (a stack) after `seconds` (of burning, for a
   * fire). Returns false if there's no room.
   */
  work(s, stack, out, seconds) {
    const room = KINDS[s.type].jobs ?? 0;
    if (s.jobs.length >= room) return false;
    s.jobs.push({ stack, out, left: seconds, total: seconds, done: false });
    this.#showJobs(s);
    this.onChange?.();
    return true;
  }

  /** Takes everything that's finished at `s` (its stacks), leaving the rest working. */
  takeDone(s) {
    const done = s.jobs.filter((j) => j.done).map((j) => j.out);
    s.jobs = s.jobs.filter((j) => !j.done);
    if (done.length) {
      this.#showJobs(s);
      this.onChange?.();
    }
    return done;
  }

  /** Takes everything at `s`, done or not (as it is). */
  takeAll(s) {
    const all = s.jobs.map((j) => (j.done ? j.out : j.stack));
    s.jobs = [];
    this.#showJobs(s);
    this.onChange?.();
    return all;
  }

  // What's being worked on, drawn: meat over the fire, strips on the rack.
  #showJobs(s) {
    const g = s.jobGroup;
    if (!g) return;
    g.clear();
    s.jobs.forEach((j, k) => {
      const id = j.done ? j.out.id : j.stack.id;
      let mesh;
      if (s.type === 'dryingRack') {
        mesh = new Mesh(meatStripModel(j.done), this.material);
        mesh.position.set(-0.5 + k * 0.33, 1.18, 0);
      } else if (s.type === 'tanningRack') {
        mesh = new Mesh(this.models[`hide${j.done}`] ?? (this.models[`hide${j.done}`] = stretchedHideModel(j.done)), this.material);
      } else if (s.type === 'campfire') {
        mesh = new Mesh(this.modelOf(id), this.material);
        const a = (k / 3) * Math.PI * 2;
        mesh.position.set(Math.cos(a) * 0.3, id === 'pot' || id === 'waterskin' || id === 'stew' ? 0.35 : 0.62, Math.sin(a) * 0.3);
        if (id !== 'pot' && id !== 'waterskin' && id !== 'stew') mesh.scale.setScalar(0.8);
      } else return;
      mesh.castShadow = true;
      g.add(mesh);
    });
  }

  // --- The farm ------------------------------------------------------------------

  /** Sows a plot with `crop` (wheat, corn, potato, carrot). */
  sow(s, crop) {
    if (s.type !== 'plot' || s.crop) return false;
    s.crop = crop;
    s.growth = 0;
    this.#showCrop(s);
    this.onChange?.();
    return true;
  }

  /** Waters a plot: it grows faster a while. */
  water(s) {
    s.watered = 240;
    this.onChange?.();
  }

  /** Spreads bat guano on a plot: it grows twice as fast for a good while (and saved). */
  feed(s) {
    s.fed = 900;
    this.onChange?.();
  }

  /** Takes a ripe crop in: what it was ({ crop }), and the plot's bare again. */
  harvest(s) {
    if (!s.crop || s.growth < 1) return null;
    const crop = s.crop;
    s.crop = null;
    s.growth = 0;
    this.#showCrop(s);
    this.onChange?.();
    return crop;
  }

  // The crop in a plot, drawn as it grows (and ripens).
  #showCrop(s) {
    const m = s.cropMesh;
    if (!m) return;
    m.visible = !!s.crop;
    if (!s.crop) return;
    const ripe = s.growth >= 1;
    const key = `crop:${s.crop}:${ripe}`;
    m.geometry = this.models[key] ?? (this.models[key] = cropModel(s.crop, ripe));
    const g = 0.12 + 0.88 * Math.min(1, s.growth);
    m.scale.set(0.6 + 0.4 * g, g, 0.6 + 0.4 * g);
    m.position.y = 0.06;
    s.shown = Math.floor(s.growth * 20);
  }

  #kindle(s) {
    if (s.flames) return;
    const closed = KINDS[s.type].fire === 'closed';
    const flames = new Puffs(this.scene, closed ? 14 : 26, () => {
      const a = Math.random() * Math.PI * 2, d = Math.random() * (closed ? 0.15 : 0.25);
      return { offset: [Math.cos(a) * d, closed ? 0.2 : 0.15, Math.sin(a) * d], velocity: [0, rnd(0.6, 1.2), 0], period: rnd(0.6, 1.0), phase: Math.random(), from: rnd(0.18, 0.3), to: 0.04, colour: FLAMES[Math.floor(Math.random() * 3)], glow: 1 };
    }, { opacity: 0.9 });
    const smoke = new Puffs(this.scene, 16, () => {
      const a = Math.random() * Math.PI * 2;
      return { offset: [Math.cos(a) * 0.1, closed ? 1.45 : 0.9, Math.sin(a) * 0.1], velocity: [0, rnd(1.1, 1.7), 0], period: rnd(5, 8), phase: Math.random(), from: rnd(0.2, 0.35), to: rnd(1.4, 2.4), colour: SMOKE.clone().multiplyScalar(rnd(0.85, 1.2)), glow: 0 };
    }, { opacity: 0.4 });
    // (A furnace's fire is in its mouth, at the front.)
    const fx = closed ? Math.sin(s.rot) * 0.45 : 0, fz = closed ? Math.cos(s.rot) * 0.45 : 0;
    flames.uniforms.uCentre.value.set(s.x + fx, s.y, s.z + fz);
    smoke.uniforms.uCentre.value.set(s.x, s.y, s.z);
    s.flames = flames;
    s.smoke = smoke;
  }

  #douse(s) {
    if (!s.flames) return;
    s.flames.dispose();
    s.smoke.dispose();
    s.flames = s.smoke = null;
  }

  /**
   * Burns the fires down, works on what's at them, swings the gates, and
   * gives back the fires' lights (for the torches' pool of lights: see
   * Torches.update). @param ctx { time, wind, light (Color), rain }
   */
  update(dt, ctx) {
    const lights = [];
    for (const s of this.list) {
      const kind = KINDS[s.type];
      if (s.type === 'plot' && s.crop && s.growth < 1) {
        // Growing: best in the spring and summer, none in the winter;
        // faster watered, or in the rain.
        const season = (ctx.winter ?? 0) > 0.6 ? 0 : 0.35 + 0.8 * (ctx.spring ?? 0) + 0.65 * (ctx.summer ?? 0) + 0.25 * (ctx.autumn ?? 0);
        s.watered = Math.max(0, (s.watered ?? 0) - dt);
        const wet = 1 + 0.6 * Math.min(1, (ctx.rain ?? 0) + (s.watered > 0 ? 1 : 0));
        s.fed = Math.max(0, (s.fed ?? 0) - dt);
        const fed = s.fed > 0 ? 2 : 1; // (guano on it)
        s.growth = Math.min(1, s.growth + (dt * season * wet * fed) / (GROW[s.crop] ?? 480));
        if (Math.floor(s.growth * 20) !== s.shown) this.#showCrop(s);
        if (s.growth >= 1) this.onChange?.();
      }
      if (s.door) {
        const want = s.open ? -Math.PI / 2 : 0;
        s.door.rotation.y += Math.max(-dt * 2.5, Math.min(dt * 2.5, want - s.door.rotation.y));
      }
      // What's being worked on: at a fire, while it burns; on a rack, always (slower in the rain).
      if (s.jobs.length && (!kind.fire || s.lit)) {
        const rate = kind.fire ? 1 : 1 - 0.6 * (ctx.rain ?? 0);
        for (const j of s.jobs) {
          if (j.done) continue;
          j.left -= dt * rate;
          if (j.left <= 0) {
            j.done = true;
            this.#showJobs(s);
            this.onDone?.(s, j.out);
            this.onChange?.();
          }
        }
      }
      if (!kind.fire || !s.lit) continue;
      // (In a cave, out of the wind, a fire burns slow: twice as long.)
      s.underground ??= !!this.underground?.(s.x, s.y, s.z);
      s.fuel -= dt * (s.underground ? 0.5 : 1);
      s.litTime = (s.litTime ?? 0) + dt;
      if (s.fuel <= 0) {
        s.lit = false;
        s.burnt = true;
        s.fuel = 0;
        this.#douse(s);
        this.onChange?.();
        continue;
      }
      const dying = Math.min(1, s.fuel / 30);
      for (const pf of [s.flames, s.smoke]) {
        pf.uniforms.uTime.value = ctx.time;
        pf.uniforms.uWind.value.set(ctx.wind.x * 0.08, 0, ctx.wind.z * 0.08);
        pf.uniforms.uAmount.value = pf === s.flames ? 0.5 + 0.5 * dying : 1;
        pf.uniforms.uLight.value.copy(ctx.light);
      }
      lights.push({ x: s.x, y: s.y + 0.8, z: s.z, strength: (kind.fire === 'closed' ? 9 : 13) * (0.4 + 0.6 * dying), reach: 18 });
    }
    return lights;
  }

  /** How warm a lit fire keeps you at (x, y, z): 1 right by it, fading out by 8 m (a furnace, 6 m; `extra` m further, in a shelter). */
  warmthAt(x, y, z, extra = 0) {
    let w = 0;
    for (const s of this.list) {
      if (!KINDS[s.type].fire || !s.lit) continue;
      const d = Math.hypot(s.x - x, (s.y - y) * 0.5, s.z - z);
      w = Math.max(w, 1 - Math.max(0, d - (s.type === 'furnace' ? 2 : 3) - extra) / (s.type === 'furnace' ? 4 : 5));
    }
    return Math.max(0, w);
  }

  /** Whether (x, z) is right in a burning campfire (it hurts). */
  inFire(x, z) {
    return this.list.some((s) => s.type === 'campfire' && s.lit && Math.hypot(s.x - x, s.z - z) < 0.55);
  }

  // --- Solid to you and to the animals ------------------------------------------

  /** Pushes a circle (you, walking: feet at `feetY`) out of what's built. */
  collide(position, radius, feetY) {
    for (const s of this.list) {
      const k = KINDS[s.type];
      if (Math.abs(s.x - position.x) > 5 || Math.abs(s.z - position.z) > 5) continue;
      if (feetY > s.y + (k.tall ?? 0.5) - 0.05 && !k.posts) continue; // (up on top)
      if (k.door && s.open) {
        // (Only its posts are in the way.)
        const ax = Math.cos(s.rot), az = -Math.sin(s.rot);
        for (const end of [-1, 1]) this.#pushCircle(position, radius, s.x + ax * end * (k.len / 2 - 0.2), s.z + az * end * (k.len / 2 - 0.2), k.line === 'fence' ? 0.12 : 0.26);
        continue;
      }
      if (k.posts) {
        // (A roof: only its posts, below it.)
        const c = Math.cos(s.rot), sn = Math.sin(s.rot);
        for (const [u, v] of k.posts) this.#pushCircle(position, radius, s.x + u * c + v * sn, s.z - u * sn + v * c, 0.14);
        continue;
      }
      if (k.circle) this.#pushCircle(position, radius, s.x, s.z, k.circle);
      else if (k.box) {
        // Into the box's own frame, out of it by the nearest side, and back.
        const ax = Math.cos(s.rot), az = -Math.sin(s.rot), bx = Math.sin(s.rot), bz = Math.cos(s.rot);
        const ox = position.x - s.x, oz = position.z - s.z;
        const u = ox * ax + oz * az, v = ox * bx + oz * bz;
        const cu = Math.max(-k.box[0], Math.min(k.box[0], u)), cv = Math.max(-k.box[1], Math.min(k.box[1], v));
        let du = u - cu, dv = v - cv, d = Math.hypot(du, dv);
        if (d >= radius) continue;
        if (d === 0) {
          // (Right inside: out the nearest face.)
          const pu = k.box[0] - Math.abs(u), pv = k.box[1] - Math.abs(v);
          if (pu < pv) (du = Math.sign(u) || 1), (dv = 0), (d = -pu);
          else (du = 0), (dv = Math.sign(v) || 1), (d = -pv);
          const push = radius - d;
          position.x += (ax * du + bx * dv) * push;
          position.z += (az * du + bz * dv) * push;
          continue;
        }
        const push = radius - d;
        position.x += ((ax * du + bx * dv) / d) * push;
        position.z += ((az * du + bz * dv) / d) * push;
      }
    }
  }

  #pushCircle(position, radius, x, z, r) {
    const ox = position.x - x, oz = position.z - z, d = Math.hypot(ox, oz), min = radius + r;
    if (d < min && d > 0) (position.x += (ox / d) * (min - d)), (position.z += (oz / d) * (min - d));
  }

  /** What's built near (x, z), as circles for the animals to steer round: [x, z, radius, ...]. */
  obstacles(x, z, reach) {
    const out = [];
    for (const s of this.list) {
      if (Math.abs(s.x - x) > reach + 3 || Math.abs(s.z - z) > reach + 3) continue;
      if (s.type === 'snare' || s.type === 'raft' || s.type === 'rope' || s.type === 'plot') continue;
      const kind = KINDS[s.type];
      if (kind.line) {
        // (Close-set, so nothing slips through: a fence pens sheep in.)
        const ax = Math.cos(s.rot), az = -Math.sin(s.rot), n = Math.round(kind.len / 0.5);
        for (let k = 0; k <= n; k++) {
          const u = -kind.len / 2 + (k / n) * kind.len;
          if (kind.door && s.open && Math.abs(u) < kind.len / 2 - 0.3) continue;
          out.push(s.x + ax * u, s.z + az * u, 0.3);
        }
      } else if (kind.posts) {
        const c = Math.cos(s.rot), sn = Math.sin(s.rot);
        for (const [u, v] of kind.posts) out.push(s.x + u * c + v * sn, s.z - u * sn + v * c, 0.2);
      } else out.push(s.x, s.z, s.type === 'campfire' || s.type === 'furnace' ? 0.85 : s.type === 'bed' ? 1 : 0.5);
    }
    return out;
  }

  /** The structure nearest a ray (from `origin` along unit `dir`), within `reach`: { structure, distance }, or null. */
  pick(origin, dir, reach) {
    let best = null;
    for (const s of this.list) {
      if (Math.abs(s.x - origin.x) > reach + 4 || Math.abs(s.z - origin.z) > reach + 4) continue;
      // Points on it to aim at: along a wall's length; up a stake.
      const ax = Math.cos(s.rot), az = -Math.sin(s.rot), bx = Math.sin(s.rot), bz = Math.cos(s.rot);
      const points = [];
      const kd = KINDS[s.type];
      if (kd.line === 'fence') for (let k = -3; k <= 3; k++) for (const h of [0.4, 0.9]) points.push([s.x + ax * k * 0.48, s.y + h, s.z + az * k * 0.48, 0.4]);
      else if (kd.line) for (let k = -4; k <= 4; k++) for (const h of [0.6, 1.6, 2.6]) points.push([s.x + ax * k * 0.48, s.y + h, s.z + az * k * 0.48, 0.45]);
      else if (kd.posts) for (const [u, v] of kd.posts) for (const h of [0.8, 1.8]) points.push([s.x + u * Math.cos(s.rot) + v * Math.sin(s.rot), s.y + h, s.z - u * Math.sin(s.rot) + v * Math.cos(s.rot), 0.35]);
      else if (s.type === 'rope') for (let h = 0; h <= s.len + 0.5; h += 0.8) points.push([s.x + bx * 0.35, s.y + 0.3 - h, s.z + bz * 0.35, 0.5]);
      else if (s.type === 'plot') points.push([s.x, s.y + 0.25, s.z, 1.1]);
      else if (s.type === 'anvil' || s.type === 'grindstone') points.push([s.x, s.y + 0.8, s.z, 0.6]);
      else if (s.type === 'tanningRack') for (const h of [0.6, 1.3]) points.push([s.x, s.y + h, s.z, 0.75]);
      else if (s.type === 'stake') for (const h of [0.5, 1.4, 2.3]) points.push([s.x, s.y + h, s.z, 0.4]);
      else if (s.type === 'bed') for (const v of [-0.7, 0, 0.7]) points.push([s.x + bx * v, s.y + 0.35, s.z + bz * v, 0.55]);
      else if (s.type === 'raft') for (const v of [-0.8, 0, 0.8]) points.push([s.x + bx * v, s.y + 0.3, s.z + bz * v, 1]);
      else if (s.type === 'furnace') for (const h of [0.4, 1]) points.push([s.x, s.y + h, s.z, 0.75]);
      else if (s.type === 'dryingRack') for (const h of [0.5, 1.1]) points.push([s.x, s.y + h, s.z, 0.6]);
      else points.push([s.x, s.y + (s.type === 'chest' ? 0.35 : 0.25), s.z, s.type === 'campfire' ? 0.75 : 0.6]);
      for (const [cx, cy, cz, r] of points) {
        const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
        const t = ox * dir.x + oy * dir.y + oz * dir.z;
        if (t < 0 || t > reach + r) continue;
        const off = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
        if (off > r) continue;
        if (!best || t < best.distance) best = { structure: s, distance: t };
      }
    }
    return best;
  }

  /** Moves a structure (a raft being paddled). */
  move(s, x, y, z, rot) {
    Object.assign(s, { x, y, z, rot });
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.y = rot;
  }

  // --- Saving ----------------------------------------------------------------------

  toJSON() {
    const r = (v) => +v.toFixed(2);
    return this.list.map((s) => ({
      type: s.type, x: r(s.x), y: r(s.y), z: r(s.z), rot: +s.rot.toFixed(3), lit: s.lit, fuel: Math.round(s.fuel), burnt: !!s.burnt,
      contents: s.contents?.slots, open: !!s.open, caught: !!s.caught, jobs: s.jobs.map(({ stack, out, left, total, done }) => ({ stack, out, left, total, done })),
      tilt: s.tilt?.map((v) => +v.toFixed(3)) ?? null, len: s.len, crop: s.crop, growth: s.growth, watered: s.watered ? Math.round(s.watered) : 0, fed: s.fed ? Math.round(s.fed) : 0,
    }));
  }

  /** A structure's name online: what it is and where (they never move). */
  static key(s) {
    const r = (v) => (+(+v).toFixed(2)).toFixed(1); // (the same from a structure and from its record, rounded to centimetres)
    return `${s.type}:${r(s.x)}:${r(s.y)}:${r(s.z)}`;
  }

  /**
   * One structure as someone else has it (online: built, lit, opened,
   * worked at): made, or brought up to date. (Its record as in toJSON.)
   */
  apply(rec) {
    if (!KINDS[rec.type]) return;
    const key = Structures.key(rec);
    const s = this.list.find((o) => Structures.key(o) === key);
    const quiet = this.onChange;
    this.onChange = null;
    try {
      if (!s) {
        this.build({ type: rec.type, x: rec.x, y: rec.y, z: rec.z, rot: rec.rot, tilt: rec.tilt }, { lit: rec.lit, fuel: rec.fuel, burnt: rec.burnt, contents: rec.contents, open: rec.open, caught: rec.caught, jobs: rec.jobs ?? [], len: rec.len, crop: rec.crop ?? null, growth: rec.growth ?? 0, watered: rec.watered ?? 0, fed: rec.fed ?? 0 });
        return;
      }
      s.fuel = rec.fuel;
      s.burnt = rec.burnt;
      if (rec.lit && !s.lit) this.light(s);
      else if (!rec.lit && s.lit) (s.lit = false), this.#douse(s);
      s.fuel = rec.fuel;
      if (s.door && !!rec.open !== !!s.open) {
        s.open = !!rec.open;
        s.door.rotation.y = s.open ? -Math.PI / 2 : 0;
      }
      if (s.contents && rec.contents) rec.contents.forEach((st, i) => (s.contents.slots[i] = st));
      s.jobs = (rec.jobs ?? []).map((j) => ({ ...j }));
      this.#showJobs(s);
      s.caught = !!rec.caught;
      if (s.catchMesh) s.catchMesh.visible = s.caught;
      if (s.type === 'plot') {
        s.crop = rec.crop ?? null;
        s.growth = rec.growth ?? 0;
        s.watered = rec.watered ?? 0;
        s.fed = rec.fed ?? 0;
        this.#showCrop(s);
      }
    } finally {
      this.onChange = quiet;
    }
  }

  /** Takes down a structure by its key (someone else did, online). */
  removeKey(key) {
    const s = this.list.find((o) => Structures.key(o) === key);
    if (!s) return;
    const quiet = this.onChange;
    this.onChange = null;
    this.remove(s);
    this.onChange = quiet;
  }

  load(list) {
    for (const s of [...this.list]) this.remove(s);
    const quiet = this.onChange;
    this.onChange = null;
    for (const s of list ?? []) {
      if (!KINDS[s.type]) continue;
      this.build({ type: s.type, x: s.x, y: s.y, z: s.z, rot: s.rot, tilt: s.tilt }, { lit: s.lit, fuel: s.fuel, burnt: s.burnt, contents: s.contents, open: s.open, caught: s.caught, jobs: s.jobs ?? [], len: s.len, crop: s.crop ?? null, growth: s.growth ?? 0, watered: s.watered ?? 0, fed: s.fed ?? 0 });
    }
    this.onChange = quiet;
  }

  /**
   * How sheltered (x, y, z) is: `roof` (1 under a roof), `walls` (how much
   * of the way round, 0..1, walls and shut gates close it in, within 7 m).
   */
  shelterAt(x, y, z) {
    let roof = 0;
    const lines = [];
    for (const s of this.list) {
      if (Math.abs(s.x - x) > 9 || Math.abs(s.z - z) > 9) continue;
      const k = KINDS[s.type];
      if (s.type === 'roof') {
        const ox = x - s.x, oz = z - s.z, c = Math.cos(s.rot), sn = Math.sin(s.rot);
        const u = ox * c - oz * sn, v = ox * sn + oz * c;
        if (Math.abs(u) < ROOF_SIZE / 2 + 0.3 && Math.abs(v) < ROOF_SIZE / 2 + 0.3 && y > s.y - 1 && y < s.y + 3.6) roof = 1;
      } else if (k.line === 'wall' && !(k.door && s.open)) {
        const ax = Math.cos(s.rot), az = -Math.sin(s.rot);
        lines.push([s.x - (ax * k.len) / 2, s.z - (az * k.len) / 2, s.x + (ax * k.len) / 2, s.z + (az * k.len) / 2]);
      }
    }
    let shut = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, dx = Math.sin(a) * 7, dz = Math.cos(a) * 7;
      if (lines.some(([x1, z1, x2, z2]) => {
        const ex = x2 - x1, ez = z2 - z1, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) return false;
        const t = ((x1 - x) * ez - (z1 - z) * ex) / den, u = ((x1 - x) * dz - (z1 - z) * dx) / den;
        return t > 0 && t < 1 && u > -0.05 && u < 1.05;
      })) shut++;
    }
    return { roof, walls: shut / 12 };
  }

  /** The nearest of `type` built within `r` of (x, z), or null. */
  nearest(type, x, z, r) {
    let best = null, bd = r;
    for (const s of this.list) {
      if (s.type !== type) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) (bd = d), (best = s);
    }
    return best;
  }

  /** Where the nearest lit fire is to (x, z) and how far: for its crackle. */
  nearestFire(x, z) {
    let best = null;
    for (const s of this.list) {
      if (!KINDS[s.type].fire || !s.lit) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (!best || d < best.d) best = { s, d };
    }
    return best;
  }

  /** Whether `s` is a fire (campfire or furnace). */
  isFire(s) {
    return !!KINDS[s?.type]?.fire;
  }
}
