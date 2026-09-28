import { Color, Group, Mesh, MeshLambertMaterial } from 'three';
import { Puffs } from '../render/Puffs.js';
import { Inventory } from './Inventory.js';
import { campfireModel, chestModel, stakeModel, WALL_LENGTH, wallModel } from './models.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const FLAMES = [new Color(1, 0.55, 0.12), new Color(1, 0.75, 0.25), new Color(1, 0.38, 0.08)];
const SMOKE = new Color(0.55, 0.53, 0.5);
const FUEL_START = 300; // seconds a new fire burns
const FUEL_LOG = 180; // and each log added
const FUEL_MAX = 900;

// Each kind: its footprint for collisions (a box half-length × half-depth,
// or a circle), and whether it's lit.
const KINDS = {
  campfire: { make: campfireModel, circle: 0 },
  wall: { make: wallModel, box: [WALL_LENGTH / 2, 0.28] },
  stake: { make: stakeModel, circle: 0.26 },
  chest: { make: chestModel, box: [0.52, 0.32] },
};

/**
 * What you've built: campfires, palisade walls, sharpened logs, chests.
 * Set down where you point (a see-through preview shows where first:
 * green where it can go, red where it can't); walls snap end to end to
 * make a line of palisade. Solid to you and the animals. Campfires are
 * lit with flint and steel and burn on their logs (add more to keep one
 * going), warming you when near and cooking meat; chests hold ten stacks.
 * Everything is saved with the world.
 */
export class Structures {
  constructor(scene) {
    this.scene = scene;
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
  }

  model(type) {
    return this.models[type] ?? (this.models[type] = KINDS[type].make());
  }

  // --- Building ------------------------------------------------------------------

  /**
   * Where `type` would go if set down at `point`, facing `yaw` (the way you
   * look): { x, y, z, rot, ok, why }. Walls lie across your view and snap
   * onto the end of a wall nearby. `ground(x, z)` is the height; `wet(x, z)`
   * whether it's water.
   */
  plan(type, point, yaw, ground, wet) {
    let x = point.x, z = point.z;
    let rot = yaw;
    if (type === 'wall') {
      // Across your view, and onto the end of another wall if one's close.
      const ax = Math.cos(rot), az = -Math.sin(rot);
      let best = null, bestD = 1.6;
      for (const s of this.list) {
        if (s.type !== 'wall') continue;
        const sx = Math.cos(s.rot), sz = -Math.sin(s.rot);
        for (const end of [1, -1]) {
          const ex = s.x + sx * end * WALL_LENGTH / 2, ez = s.z + sz * end * WALL_LENGTH / 2;
          for (const mine of [1, -1]) {
            const mx = x + ax * mine * WALL_LENGTH / 2, mz = z + az * mine * WALL_LENGTH / 2;
            const d = Math.hypot(mx - ex, mz - ez);
            if (d < bestD) (bestD = d), (best = { ex, ez, mine });
          }
        }
      }
      if (best) {
        x = best.ex - ax * best.mine * WALL_LENGTH / 2;
        z = best.ez - az * best.mine * WALL_LENGTH / 2;
      }
    }
    // The ground under it: it sits on the lowest point (a wall's logs sink
    // into the higher ground), but not on ground too uneven.
    const kind = KINDS[type];
    const half = kind.box ? kind.box : [kind.circle || 0.5, kind.circle || 0.5];
    const ax = Math.cos(rot), az = -Math.sin(rot), bx = Math.sin(rot), bz = Math.cos(rot);
    let lo = Infinity, hi = -Infinity, water = false;
    for (const [u, v] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0]]) {
      const px = x + ax * u * half[0] + bx * v * half[1], pz = z + az * u * half[0] + bz * v * half[1];
      const h = ground(px, pz);
      if (!Number.isFinite(h)) continue;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      if (wet(px, pz)) water = true;
    }
    const y = type === 'wall' || type === 'stake' ? lo - 0.05 : (type === 'chest' ? lo : ground(x, z));
    let ok = true, why = '';
    if (water) (ok = false), (why = "Can't build in the water");
    else if (hi - lo > (type === 'wall' ? 1.4 : 0.6)) (ok = false), (why = 'The ground is too steep here');
    else {
      for (const s of this.list) {
        const d = Math.hypot(s.x - x, s.z - z);
        const r = (s.type === 'wall' ? WALL_LENGTH / 2 : 0.6) + (type === 'wall' ? WALL_LENGTH / 2 : 0.6);
        if (d < 0.3 || (d < r * 0.5 && !(type === 'wall' && s.type === 'wall'))) {
          ok = false;
          why = 'Something is in the way';
          break;
        }
      }
    }
    return { type, x, y, z, rot, ok, why };
  }

  /** Shows the see-through preview of `plan` (or hides it: null). */
  preview(plan) {
    if (!plan) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (this.ghostType !== plan.type) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = new Mesh(this.model(plan.type), this.ghostMaterial);
      this.ghost.renderOrder = 4;
      this.scene.add(this.ghost);
      this.ghostType = plan.type;
    }
    this.ghost.visible = true;
    this.ghost.position.set(plan.x, plan.y, plan.z);
    this.ghost.rotation.set(0, plan.rot, 0);
    this.ghostMaterial.emissive.setHex(plan.ok ? 0x2a8a3a : 0xa02a2a);
  }

  /** Builds it. Returns the new structure. */
  build(plan, extra = {}) {
    const s = { id: this.nextId++, type: plan.type, x: plan.x, y: plan.y, z: plan.z, rot: plan.rot, lit: false, fuel: 0, ...extra };
    if (s.type === 'campfire' && s.fuel === undefined) s.fuel = 0;
    if (s.type === 'chest') {
      const inv = new Inventory(10);
      if (extra.contents) extra.contents.forEach((st, i) => (inv.slots[i] = st));
      s.contents = inv;
    }
    const mesh = new Mesh(this.model(s.type), this.material);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.set(0, s.rot, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.structure = s;
    this.group.add(mesh);
    s.mesh = mesh;
    this.list.push(s);
    if (s.type === 'campfire' && s.lit) this.#kindle(s);
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

  // --- Fires ---------------------------------------------------------------------

  /** Lights a campfire (with flint and steel). Returns false if it has nothing to burn. */
  light(s) {
    if (s.type !== 'campfire' || s.lit) return false;
    if (s.fuel <= 0) s.fuel = s.burnt ? 0 : FUEL_START;
    if (s.fuel <= 0) return false;
    s.lit = true;
    this.#kindle(s);
    this.onChange?.();
    return true;
  }

  /** Adds a log to a campfire: it burns on longer (and can be lit again once burnt out). */
  feed(s) {
    if (s.type !== 'campfire' || s.fuel >= FUEL_MAX - 30) return false;
    s.fuel = Math.min(FUEL_MAX, s.fuel + FUEL_LOG);
    s.burnt = false;
    this.onChange?.();
    return true;
  }

  #kindle(s) {
    if (s.flames) return;
    const flames = new Puffs(this.scene, 26, () => {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 0.25;
      return { offset: [Math.cos(a) * d, 0.15, Math.sin(a) * d], velocity: [0, rnd(0.8, 1.4), 0], period: rnd(0.6, 1.0), phase: Math.random(), from: rnd(0.22, 0.34), to: 0.04, colour: FLAMES[Math.floor(Math.random() * 3)], glow: 1 };
    }, { opacity: 0.9 });
    const smoke = new Puffs(this.scene, 16, () => {
      const a = Math.random() * Math.PI * 2;
      return { offset: [Math.cos(a) * 0.1, 0.9, Math.sin(a) * 0.1], velocity: [0, rnd(1.1, 1.7), 0], period: rnd(5, 8), phase: Math.random(), from: rnd(0.2, 0.35), to: rnd(1.4, 2.4), colour: SMOKE.clone().multiplyScalar(rnd(0.85, 1.2)), glow: 0 };
    }, { opacity: 0.4 });
    for (const pf of [flames, smoke]) pf.uniforms.uCentre.value.set(s.x, s.y, s.z);
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
   * Burns the fires down, and gives back their lights (for the torches' pool
   * of lights: see Torches.update). @param ctx { time, wind, light (Color) }
   */
  update(dt, ctx) {
    const lights = [];
    for (const s of this.list) {
      if (s.type !== 'campfire' || !s.lit) continue;
      s.fuel -= dt;
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
      lights.push({ x: s.x, y: s.y + 0.8, z: s.z, strength: 13 * (0.4 + 0.6 * dying), reach: 18 });
    }
    return lights;
  }

  /** How warm a lit fire keeps you at (x, y, z): 1 right by it, fading out by 8 m. */
  warmthAt(x, y, z) {
    let w = 0;
    for (const s of this.list) {
      if (s.type !== 'campfire' || !s.lit) continue;
      const d = Math.hypot(s.x - x, (s.y - y) * 0.5, s.z - z);
      w = Math.max(w, 1 - Math.max(0, d - 3) / 5);
    }
    return Math.max(0, w);
  }

  /** Whether (x, z) is right in a burning fire (it hurts). */
  inFire(x, z) {
    return this.list.some((s) => s.type === 'campfire' && s.lit && Math.hypot(s.x - x, s.z - z) < 0.55);
  }

  // --- Solid to you and to the animals ------------------------------------------

  /** Pushes a circle (you, walking: feet at `feetY`) out of what's built. */
  collide(position, radius, feetY) {
    for (const s of this.list) {
      const k = KINDS[s.type];
      if (Math.abs(s.x - position.x) > 5 || Math.abs(s.z - position.z) > 5) continue;
      if (feetY > s.y + (s.type === 'chest' ? 0.6 : 3.3)) continue; // (up on top)
      if (k.circle) {
        const ox = position.x - s.x, oz = position.z - s.z, d = Math.hypot(ox, oz), min = radius + k.circle;
        if (d < min && d > 0) (position.x += (ox / d) * (min - d)), (position.z += (oz / d) * (min - d));
      } else if (k.box) {
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

  /** What's built near (x, z), as circles for the animals to steer round: [x, z, radius, ...]. */
  obstacles(x, z, reach) {
    const out = [];
    for (const s of this.list) {
      if (Math.abs(s.x - x) > reach + 3 || Math.abs(s.z - z) > reach + 3) continue;
      if (s.type === 'wall') {
        const ax = Math.cos(s.rot), az = -Math.sin(s.rot);
        for (let k = -2; k <= 2; k++) out.push(s.x + ax * k * 0.9, s.z + az * k * 0.9, 0.55);
      } else out.push(s.x, s.z, s.type === 'campfire' ? 0.8 : 0.5);
    }
    return out;
  }

  /** The structure nearest a ray (from `origin` along unit `dir`), within `reach`: { structure, distance }, or null. */
  pick(origin, dir, reach) {
    let best = null;
    for (const s of this.list) {
      if (Math.abs(s.x - origin.x) > reach + 4 || Math.abs(s.z - origin.z) > reach + 4) continue;
      // Points on it to aim at: along a wall's length; up a stake.
      const ax = Math.cos(s.rot), az = -Math.sin(s.rot);
      const points = [];
      if (s.type === 'wall') for (let k = -4; k <= 4; k++) for (const h of [0.6, 1.6, 2.6]) points.push([s.x + ax * k * 0.48, s.y + h, s.z + az * k * 0.48, 0.45]);
      else if (s.type === 'stake') for (const h of [0.5, 1.4, 2.3]) points.push([s.x, s.y + h, s.z, 0.4]);
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

  // --- Saving ----------------------------------------------------------------------

  toJSON() {
    return this.list.map((s) => ({ type: s.type, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), rot: +s.rot.toFixed(3), lit: s.lit, fuel: Math.round(s.fuel), burnt: !!s.burnt, contents: s.contents?.slots }));
  }

  load(list) {
    for (const s of [...this.list]) this.remove(s);
    const quiet = this.onChange;
    this.onChange = null;
    for (const s of list ?? []) this.build({ type: s.type, x: s.x, y: s.y, z: s.z, rot: s.rot }, { lit: s.lit, fuel: s.fuel, burnt: s.burnt, contents: s.contents });
    this.onChange = quiet;
  }

  /** Where the nearest lit fire is to (x, z) and how far: for its crackle. */
  nearestFire(x, z) {
    let best = null;
    for (const s of this.list) {
      if (s.type !== 'campfire' || !s.lit) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (!best || d < best.d) best = { s, d };
    }
    return best;
  }
}
