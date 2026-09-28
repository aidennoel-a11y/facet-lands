import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { LEAF_GEOMETRIES, treeGeometry } from '../world/trees.js';
import { Inventory } from './Inventory.js';

const m4 = new Matrix4(), v = new Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

// The trees that give a vine or two when chopped up (climbers grow up them).
const VINY = { broadleaf: 0.6, oak: 0.7, maple: 0.5, weepingWillow: 0.8, swampWillow: 0.8, cypress: 0.7, mangrove: 0.9, jungleGiant: 1, jungleCanopy: 1, junglePalm: 0.6, treeFern: 0.6, baobab: 0.4, bamboo: 0.5, appleTree: 0.4, poplar: 0.4, aspen: 0.3, birch: 0.3, silverBirch: 0.3 };

/**
 * Felling trees with an axe: each blow shakes the tree and sends chips
 * flying; enough of them (more for a bigger tree) and it falls, pivoting
 * on its stump and gathering speed as it goes, away from you, until it
 * crashes down onto the ground (bouncing a little). Chop the fallen trunk
 * a few more times and it breaks up into logs you can carry (and a vine or
 * two from the leafier trees). A bush comes down in a couple of blows, for
 * a stick or two.
 */
export class Felling {
  constructor(scene, trees, items) {
    this.scene = scene;
    this.trees = trees; // the TreeLayer
    this.items = items; // GroundItems (the logs are dropped there)
    this.hits = new Map(); // key -> blows so far
    this.falling = []; // { group, pivot, axis, angle, speed, length, fallen, chops, hit }
    this.chips = [];
    this.chipGeometry = new BoxGeometry(0.06, 0.03, 0.08);
    this.chipMaterial = new MeshLambertMaterial({ color: 0xd8b882, flatShading: true });
    this.shaking = null;
  }

  /** How many blows a tree takes. */
  blows(hit) {
    if (hit.bush) return 2;
    return Math.round(3 + 4 * hit.t.s * Math.min(1.6, hit.t.sy));
  }

  /**
   * One blow of the axe at a standing tree, from `from` (your position).
   * Returns 'chop' (it took the blow), 'fell' (it's coming down) or, for a
   * bush, the sticks it gave.
   */
  chop(hit, from, ground) {
    const n = (this.hits.get(hit.key) ?? 0) + 1;
    this.hits.set(hit.key, n);
    this.#chips(hit.x, hit.y + 1, hit.z, from);
    if (n < this.blows(hit)) {
      this.shaking = { hit, time: 0.25, matrix: this.trees.matrixOf(hit).clone() };
      return 'chop';
    }
    this.hits.delete(hit.key);
    if (hit.bush) {
      this.trees.remove(hit);
      return 'bush';
    }
    // Down it comes: a copy of the tree to fall, the tree itself gone.
    const world = this.trees.matrixOf(hit).clone();
    const group = new Group();
    const pivot = new Vector3().setFromMatrixPosition(world);
    const local = world.clone().premultiply(m4.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    for (const [geometry, material] of [[treeGeometry(hit.type, false), this.trees.material], [LEAF_GEOMETRIES[hit.type], this.trees.leafMaterial]]) {
      if (!geometry) continue;
      const mesh = new InstancedMesh(geometry, material, 1);
      mesh.setMatrixAt(0, local);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    group.position.copy(pivot);
    this.scene.add(group);
    this.trees.remove(hit);
    // Away from you, a little to one side or the other.
    const away = Math.atan2(hit.x - from.x, hit.z - from.z) + rnd(-0.35, 0.35);
    const axis = new Vector3(Math.cos(away), 0, -Math.sin(away)); // (tipping about this, the top swings out along `away`)
    const height = (this.trees.profileTop?.(hit.type) ?? 8) * hit.t.sy;
    this.falling.push({ group, pivot, axis, dir: new Vector3(Math.sin(away), 0, Math.cos(away)), angle: 0.06, speed: 0.3, length: Math.max(3, height), fallen: false, chops: 0, hit, bounces: 0, time: 0 });
    return 'fell';
  }

  /** The fallen trunk a ray meets (within reach): its falling record, or null. */
  pickFallen(origin, dir, reach) {
    let best = null;
    for (const f of this.falling) {
      if (!f.fallen) continue;
      // (Along the trunk as it lies: a few points.)
      for (let k = 0.05; k <= 0.9; k += 0.12) {
        const along = f.length * k;
        const c = v.copy(f.pivot).addScaledVector(f.dir, Math.sin(f.angle) * along);
        c.y += Math.cos(f.angle) * along + 0.3;
        const ox = c.x - origin.x, oy = c.y - origin.y, oz = c.z - origin.z;
        const t = ox * dir.x + oy * dir.y + oz * dir.z;
        if (t < 0 || t > reach + 0.5) continue;
        const off = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
        if (off > 0.9) continue;
        if (!best || t < best.distance) best = { fallen: f, distance: t };
      }
    }
    return best;
  }

  /** One blow at a fallen trunk: after a few, it breaks up into logs (and maybe vines). Returns true when it has. */
  chopFallen(f, from, ground) {
    f.chops++;
    const c = v.copy(f.pivot).addScaledVector(f.dir, Math.sin(f.angle) * f.length * 0.3);
    this.#chips(c.x, c.y + 0.4, c.z, from);
    if (f.chops < 3) return false;
    const logs = Math.max(2, Math.min(6, Math.round(f.length / 2.5)));
    for (let k = 0; k < logs; k++) {
      const along = f.length * (0.08 + 0.55 * (k / Math.max(1, logs - 1)));
      const x = f.pivot.x + f.dir.x * along + rnd(-0.4, 0.4), z = f.pivot.z + f.dir.z * along + rnd(-0.4, 0.4);
      const g = ground(x, z);
      this.items.drop(Inventory.stack('log', 1), x, (Number.isFinite(g) ? g : f.pivot.y) + 0.6, z, { turn: Math.atan2(f.dir.x, f.dir.z) + Math.PI / 2 + rnd(-0.3, 0.3) });
    }
    const viny = VINY[f.hit.type] ?? 0.1;
    const vines = Math.random() < viny ? 1 + (Math.random() < viny * 0.6 ? 1 : 0) : 0;
    for (let k = 0; k < vines; k++) {
      const along = f.length * rnd(0.6, 0.9);
      const x = f.pivot.x + f.dir.x * along, z = f.pivot.z + f.dir.z * along;
      const g = ground(x, z);
      this.items.drop(Inventory.stack('vine', 1), x, (Number.isFinite(g) ? g : f.pivot.y) + 0.5, z);
    }
    // A stick or two from the branches.
    for (let k = 0; k < 2; k++) {
      const along = f.length * rnd(0.5, 0.8);
      const x = f.pivot.x + f.dir.x * along + rnd(-1, 1), z = f.pivot.z + f.dir.z * along + rnd(-1, 1);
      const g = ground(x, z);
      this.items.drop(Inventory.stack('stick', 1), x, (Number.isFinite(g) ? g : f.pivot.y) + 0.5, z);
    }
    this.scene.remove(f.group);
    for (const m of f.group.children) m.dispose();
    this.falling.splice(this.falling.indexOf(f), 1);
    return true;
  }

  #chips(x, y, z, from) {
    const dx = from.x - x, dz = from.z - z, d = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 7; k++) {
      const mesh = new Mesh(this.chipGeometry, this.chipMaterial);
      mesh.position.set(x + (dx / d) * 0.3, y + rnd(-0.3, 0.3), z + (dz / d) * 0.3);
      this.scene.add(mesh);
      this.chips.push({ mesh, vx: (dx / d) * rnd(1, 3) + rnd(-1.5, 1.5), vy: rnd(1.5, 4), vz: (dz / d) * rnd(1, 3) + rnd(-1.5, 1.5), life: rnd(0.6, 1.1), spin: rnd(5, 15) });
    }
  }

  /**
   * @param ground (x, z) => height
   * @param onLand (x, y, z, size) => void: a tree hits the ground (for the sound)
   */
  update(dt, ground, onLand) {
    // A shaken tree quivers from the blow.
    if (this.shaking) {
      const sh = this.shaking;
      sh.time -= dt;
      const mesh = sh.hit.group.userData.meshes[sh.hit.type];
      if (!sh.hit.t.removed) {
        // (Rocked a little about its foot, in its own chunk's frame.)
        const a = sh.time > 0 ? Math.sin(sh.time * 60) * 0.025 * (sh.time / 0.25) : 0;
        const rock = new Matrix4().makeTranslation(sh.hit.x, sh.hit.y, sh.hit.z)
          .multiply(new Matrix4().makeRotationAxis(v.set(1, 0, 0), a))
          .multiply(new Matrix4().makeTranslation(-sh.hit.x, -sh.hit.y, -sh.hit.z));
        m4.copy(sh.matrix).premultiply(rock).premultiply(new Matrix4().copy(sh.hit.group.matrixWorld).invert());
        mesh.setMatrixAt(sh.hit.t.index, m4);
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (sh.time <= 0) this.shaking = null;
    }
    for (const f of this.falling) {
      f.time += dt;
      if (!f.fallen) {
        // A rod pivoting on its foot: it tips ever faster.
        const accel = (3 * 9.8) / (2 * f.length) * Math.sin(f.angle);
        f.speed += accel * dt;
        f.angle += f.speed * dt;
        // Has it reached the ground? (Where its trunk would be, well out along it.)
        const reach = f.length * 0.6;
        const x = f.pivot.x + f.dir.x * Math.sin(f.angle) * reach, z = f.pivot.z + f.dir.z * Math.sin(f.angle) * reach;
        const y = f.pivot.y + Math.cos(f.angle) * reach;
        const g = ground(x, z);
        if ((Number.isFinite(g) && y <= g + 0.35) || f.angle > Math.PI * 0.6) {
          if (f.bounces === 0) onLand?.(x, y, z, f.length);
          if (f.bounces < 2 && f.speed > 0.4) {
            f.speed *= -0.22;
            f.bounces++;
          } else {
            f.fallen = true;
            f.speed = 0;
          }
          f.angle = Math.min(f.angle, Math.PI * 0.6);
        }
      }
      f.group.quaternion.setFromAxisAngle(f.axis, f.angle);
      // (A trunk left lying is gone after a long while.)
      if (f.fallen && f.time > 600) f.gone = true;
    }
    for (const f of this.falling.filter((x) => x.gone)) {
      this.scene.remove(f.group);
      for (const m of f.group.children) m.dispose();
      this.falling.splice(this.falling.indexOf(f), 1);
    }
    for (const c of this.chips) {
      c.life -= dt;
      c.vy -= 12 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += c.spin * dt;
      c.mesh.rotation.z += c.spin * 0.7 * dt;
      const g = ground(c.mesh.position.x, c.mesh.position.z);
      if (Number.isFinite(g) && c.mesh.position.y < g) (c.mesh.position.y = g), (c.vx = c.vy = c.vz = 0), (c.spin = 0);
      if (c.life <= 0) this.scene.remove(c.mesh);
    }
    this.chips = this.chips.filter((c) => c.life > 0);
  }

  clear() {
    for (const f of this.falling) this.scene.remove(f.group);
    this.falling = [];
    this.hits.clear();
  }
}
