import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, TorusGeometry, Vector3 } from 'three';
import { LEAF_GEOMETRIES, treeGeometry } from '../world/trees.js';
import { Inventory } from './Inventory.js';

const m4 = new Matrix4(), m5 = new Matrix4(), v = new Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

// The trees that give a vine or two when chopped up (climbers grow up them).
const VINY = { broadleaf: 0.6, oak: 0.7, maple: 0.5, weepingWillow: 0.8, swampWillow: 0.8, cypress: 0.7, mangrove: 0.9, jungleGiant: 1, jungleCanopy: 1, junglePalm: 0.6, treeFern: 0.6, baobab: 0.4, bamboo: 0.5, appleTree: 0.4, poplar: 0.4, aspen: 0.3, birch: 0.3, silverBirch: 0.3 };

const WOOD = new Color(0xd9b27a);

/**
 * Cuts a (non-indexed) geometry at height `cut` (in its own units): the part
 * above it (`above`) or below, with the cut face capped in pale wood.
 * Every attribute is carried over (and blended along the cut).
 */
function clipGeometry(source, cut, above) {
  const g = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(g.attributes);
  const attrs = names.map((n) => g.attributes[n]);
  const pos = g.attributes.position;
  const out = names.map(() => []);
  const edges = []; // (the new edge along the cut: pairs of points)
  const vertex = (i) => attrs.map((a) => Array.from({ length: a.itemSize }, (_, c) => a.array[i * a.itemSize + c]));
  const mix = (a, b, t) => a.map((arr, k) => arr.map((v, c) => v + (b[k][c] - v) * t));
  const inside = (y) => (above ? y >= cut : y <= cut);
  const emit = (poly) => {
    for (let k = 1; k + 1 < poly.length; k++) for (const v of [poly[0], poly[k], poly[k + 1]]) v.forEach((arr, n) => out[n].push(...arr));
  };
  for (let i = 0; i < pos.count; i += 3) {
    const tri = [vertex(i), vertex(i + 1), vertex(i + 2)];
    const ys = tri.map((v) => v[names.indexOf('position')][1]);
    const ins = ys.map(inside);
    if (ins.every(Boolean)) {
      emit(tri);
      continue;
    }
    if (!ins.some(Boolean)) continue;
    // (Clipped by the one plane: a triangle or a quad.)
    const poly = [], onCut = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3], ya = ys[k], yb = ys[(k + 1) % 3];
      if (ins[k]) poly.push(a);
      if (ins[k] !== ins[(k + 1) % 3]) {
        const c = mix(a, b, (cut - ya) / (yb - ya));
        poly.push(c);
        onCut.push(c[names.indexOf('position')]);
      }
    }
    emit(poly);
    if (onCut.length === 2) edges.push(onCut);
  }
  // Capping the cut: a fan of the new edges round their middle.
  if (edges.length) {
    let cx = 0, cz = 0;
    for (const [a, b] of edges) (cx += a[0] + b[0]), (cz += a[2] + b[2]);
    cx /= edges.length * 2;
    cz /= edges.length * 2;
    for (let [a, b] of edges) {
      // (Facing up on a stump, down under the falling part.)
      const cross = (a[0] - cx) * (b[2] - cz) - (a[2] - cz) * (b[0] - cx);
      if ((cross > 0) !== above) [a, b] = [b, a];
      for (const p of [[cx, cut, cz], a, b]) {
        names.forEach((n, k) => {
          if (n === 'position') out[k].push(p[0], cut, p[2]);
          else if (n === 'normal') out[k].push(0, above ? -1 : 1, 0);
          else if (n === 'color') out[k].push(WOOD.r, WOOD.g, WOOD.b, ...(attrs[k].itemSize === 4 ? [1] : []));
          else out[k].push(...new Array(attrs[k].itemSize).fill(0));
        });
      }
    }
  }
  const result = new BufferGeometry();
  names.forEach((n, k) => result.setAttribute(n, new BufferAttribute(new Float32Array(out[k]), attrs[k].itemSize)));
  result.computeBoundingSphere();
  return result;
}

/**
 * Felling trees with an axe: each blow bites into the trunk where you
 * first struck it (low or chest-high: wherever you swing), shakes the tree
 * and sends chips flying, the cut in the trunk growing round it blow by
 * blow; once it's cut through (more blows for a bigger tree) it
 * goes: the last of the wood at the cut holds it a moment, creaking, then
 * it tips, away from you (and the way it leans, and the wind), gathering
 * speed (a tall one slowly, a short one quick) until its trunk meets the
 * ground, bouncing once or twice, its crown crushed down against the
 * ground where it lands, the leaves bunched up there. A stump is left, for
 * good. Chop the fallen trunk a few more times and it breaks up into logs
 * you can carry (and a vine or two from the leafier trees). A bush comes
 * down in a couple of blows, for a stick or two.
 */
export class Felling {
  constructor(scene, trees, items) {
    this.scene = scene;
    this.trees = trees; // the TreeLayer
    this.items = items; // GroundItems (the logs are dropped there)
    this.hits = new Map(); // key -> { blows so far, cut (height of the cut above the tree's foot) }
    this.stumps = []; // { key, type, m (16 numbers: its transform), cut (in the tree's own units), mesh }
    this.stumpGroup = new Group();
    this.stumpGroup.name = 'stumps';
    scene.add(this.stumpGroup);
    this.falling = []; // { group, pivot, axis, angle, speed, length, fallen, chops, hit }
    this.chips = [];
    this.chipGeometry = new BoxGeometry(0.06, 0.03, 0.08);
    this.chipMaterial = new MeshLambertMaterial({ color: 0xd8b882, flatShading: true });
    this.shaking = null;
  }

  /** How many blows a tree takes. */
  blows(hit) {
    if (hit.bush) return 2;
    if (hit.type === 'bamboo') return 1; // (a single cane: one swing through it)
    return Math.round(3 + 4 * hit.t.s * Math.min(1.6, hit.t.sy));
  }

  /**
   * One blow of the axe at a standing tree, from `from` (your position),
   * striking it at height `at` (world) (`power`: 2 for an iron axe). Returns
   * 'chop' (it took the blow), 'fell' (it's coming down) or 'bush'.
   */
  chop(hit, from, at, wind = { x: 0, z: 0 }, power = 1) {
    let state = this.hits.get(hit.key);
    if (!state) {
      // (The cut goes where you first swing at it.)
      state = { blows: 0, cut: Math.max(0.25, Math.min(1.3, (at ?? hit.y + 0.8) - hit.y)) };
      this.hits.set(hit.key, state);
    }
    state.blows += power;
    this.#chips(hit.x, hit.y + state.cut, hit.z, from);
    if (state.blows < this.blows(hit)) {
      this.shaking = { hit, time: 0.3, matrix: this.trees.matrixOf(hit).clone(), from: { x: from.x, z: from.z } };
      if (!hit.bush) this.#notch(hit, state, from);
      return 'chop';
    }
    this.hits.delete(hit.key);
    this.#unnotch(state);
    if (hit.bush) {
      this.trees.remove(hit);
      return 'bush';
    }
    // Down it comes: the tree above the cut falls, a stump stays.
    const world = this.trees.matrixOf(hit).clone();
    const cut = state.cut / hit.t.sy; // (in the tree's own units)
    const whole = treeGeometry(hit.type, this.trees.bare);
    const falling = clipGeometry(whole, cut, true);
    const leaves = LEAF_GEOMETRIES[hit.type] ? clipGeometry(LEAF_GEOMETRIES[hit.type], cut, true) : null;
    this.#stump(hit.key, hit.type, world, cut);
    const pivot = new Vector3(0, cut, 0).applyMatrix4(world);
    const local = world.clone().premultiply(m4.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    const group = new Group();
    let leafMesh = null;
    for (const [geometry, material] of [[falling, this.trees.material], [leaves, this.trees.leafMaterial]]) {
      if (!geometry) continue;
      const mesh = new InstancedMesh(geometry, material, 1);
      mesh.setMatrixAt(0, local);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      if (geometry === leaves) leafMesh = mesh;
    }
    group.position.copy(pivot);
    this.scene.add(group);
    this.trees.remove(hit);
    // Which way: away from you, pulled round by the way it leans and by the wind.
    let fx = hit.x - from.x, fz = hit.z - from.z;
    const d = Math.hypot(fx, fz) || 1;
    fx = fx / d + (hit.t.leanX ?? 0) * 3 + wind.x * 0.04 + rnd(-0.25, 0.25);
    fz = fz / d + (hit.t.leanZ ?? 0) * 3 + wind.z * 0.04 + rnd(-0.25, 0.25);
    const away = Math.atan2(fx, fz);
    const axis = new Vector3(Math.cos(away), 0, -Math.sin(away)); // (tipping about this, the top swings out along `away`)
    const prof = this.trees.profile(hit.type);
    const top = (prof?.top ?? 8) * hit.t.sy - state.cut;
    this.falling.push({
      group, pivot, axis, dir: new Vector3(Math.sin(away), 0, Math.cos(away)), length: Math.max(2.5, top), hit, bounces: 0, time: 0, chops: 0, fallen: false,
      angle: rnd(0.015, 0.04), speed: rnd(0.02, 0.08),
      // (How its weight's spread: a heavy crown falls faster than a bare pole.)
      heft: rnd(0.8, 1.25) * (prof && !prof.cone ? 1.1 : 1),
      // (The hinge of wood left at the cut holds it a moment.)
      hold: rnd(0.4, 1.4),
      crown: prof ? { bottom: prof.bottom * hit.t.sy - state.cut, top, radius: prof.radius * hit.t.s, cone: prof.cone } : null,
      trunk: this.trees.trunkRadius(hit.type) * hit.t.s,
      leaves: leafMesh, leafLocal: local.clone(), leafBase: leaves ? Float32Array.from(leaves.attributes.position.array) : null,
    });
    return 'fell';
  }

  // The cut in a standing trunk, where the axe has been biting: a dark
  // groove, the pale wood showing at its lips, going round the trunk from
  // the side you've struck it, further with each blow (all the way round,
  // and it's through).
  #notch(hit, state, from) {
    const done = Math.min(1, state.blows / this.blows(hit));
    const r = this.trees.trunkRadius(hit.type) * hit.t.s * 1.02;
    const arc = Math.PI * 2 * Math.max(0.12, done);
    this.#unnotch(state);
    const group = new Group();
    const groove = new Mesh(new TorusGeometry(r, 0.018 + 0.03 * done, 4, 28, arc), this.notchDark ??= new MeshLambertMaterial({ color: 0x2e1e12 }));
    const lip = new Mesh(new TorusGeometry(r * 1.01, 0.01 + 0.015 * done, 3, 28, arc), this.chipMaterial);
    lip.position.y = 0.035 + 0.03 * done;
    group.add(groove, lip);
    // (The arc centred on the side you struck, lying round the trunk.)
    const face = Math.atan2(from.x - hit.x, from.z - hit.z);
    group.position.set(hit.x, hit.y + state.cut, hit.z);
    group.rotation.set(0, face - Math.PI / 2 + arc / 2, 0);
    for (const m of group.children) m.rotation.x = Math.PI / 2;
    this.scene.add(group);
    state.notch = group;
  }

  #unnotch(state) {
    if (!state?.notch) return;
    this.scene.remove(state.notch);
    for (const m of state.notch.children) m.geometry.dispose();
    state.notch = null;
  }

  // The crown of a falling tree, crushed down where it meets the ground:
  // no leaf goes into the ground; those that would are pushed up and
  // bunched against it instead.
  #crush(f, ground) {
    const leaves = f.leaves;
    if (!leaves) return;
    f.group.updateMatrixWorld(true);
    m4.multiplyMatrices(f.group.matrixWorld, f.leafLocal);
    m5.copy(m4).invert();
    const pos = leaves.geometry.attributes.position, base = f.leafBase;
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]).applyMatrix4(m4);
      const g = ground(v.x, v.z);
      if (Number.isFinite(g) && v.y < g + 0.06) {
        v.y = g + 0.06 + Math.min(0.9, (g + 0.06 - v.y) * 0.22);
        moved = true;
      }
      v.applyMatrix4(m5);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    if (moved) leaves.geometry.computeVertexNormals();
  }

  // A stump where a tree was felled (saved: see stumpsJSON).
  #stump(key, type, matrix, cut) {
    const geometry = clipGeometry(treeGeometry(type, true), cut, false);
    const mesh = new InstancedMesh(geometry, this.trees.material, 1);
    mesh.setMatrixAt(0, matrix);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.stumpGroup.add(mesh);
    this.stumps.push({ key, type, m: matrix.elements.map((v) => +v.toFixed(4)), cut: +cut.toFixed(3), mesh });
  }

  /** The stumps, for saving; and back from a save. */
  stumpsJSON() {
    return this.stumps.map(({ key, type, m, cut }) => ({ key, type, m, cut }));
  }

  loadStumps(list) {
    for (const st of this.stumps) st.mesh.dispose();
    this.stumpGroup.clear();
    this.stumps = [];
    for (const st of list ?? []) if (st.m?.length === 16) this.#stump(st.key, st.type, new Matrix4().fromArray(st.m), st.cut);
  }

  // How far below the tree's axis its lowest side reaches, `along` metres
  // up it from the cut: its trunk, or the spread of its crown there.
  #girth(f, along) {
    const c = f.crown;
    if (!c || along < c.bottom) return f.trunk;
    if (along > c.top) return 0;
    if (c.cone) return Math.max(f.trunk, c.radius * (c.top - along) / Math.max(0.1, c.top - c.bottom));
    const mid = (c.bottom + c.top) / 2, half = Math.max(0.1, (c.top - c.bottom) / 2);
    return Math.max(f.trunk, c.radius * Math.sqrt(Math.max(0, 1 - ((along - mid) / half) ** 2)));
  }

  // Whether the falling tree, at `angle`, touches the ground anywhere along it.
  #touches(f, angle, ground) {
    const s = Math.sin(angle), c = Math.cos(angle);
    for (let k = 1; k <= 12; k++) {
      const along = (f.length * k) / 12;
      const reach = Math.min(this.#girth(f, along), f.trunk * 1.5); // (its trunk and branches: the leaves give)
      // (Its underside: out along the fall, and down.)
      const x = f.pivot.x + f.dir.x * (s * along + c * reach * 0.3), z = f.pivot.z + f.dir.z * (s * along + c * reach * 0.3);
      const y = f.pivot.y + c * along - s * reach;
      const g = ground(x, z);
      if (Number.isFinite(g) && y <= g + 0.05) return true;
    }
    return false;
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
    if (f.hit.type === 'bamboo') {
      // A fallen cane cuts into lengths of stick in one blow.
      for (let k = 0; k < 3; k++) {
        const along = f.length * (0.15 + 0.3 * k);
        const x = f.pivot.x + f.dir.x * along, z = f.pivot.z + f.dir.z * along;
        const g = ground(x, z);
        this.items.drop(Inventory.stack('stick', 1), x, (Number.isFinite(g) ? g : f.pivot.y) + 0.4, z, { turn: Math.atan2(f.dir.x, f.dir.z) + Math.PI / 2 });
      }
      this.scene.remove(f.group);
      for (const m of f.group.children) m.dispose();
      this.falling.splice(this.falling.indexOf(f), 1);
      return true;
    }
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

  /** Chips flying off a blow at `point` (from `from`), in `color`. */
  spray(point, from, color) {
    this.#chips(point.x, point.y, point.z, from, color);
  }

  #chips(x, y, z, from, color = null) {
    const dx = from.x - x, dz = from.z - z, d = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 7; k++) {
      const mesh = new Mesh(this.chipGeometry, color ? (this.rockChips ??= new MeshLambertMaterial({ color, flatShading: true })) : this.chipMaterial);
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
        // (Rocked a little about its foot, away from the blow, in its own chunk's frame.)
        const a = sh.time > 0 ? Math.sin(sh.time * 50) * 0.03 * (sh.time / 0.3) : 0;
        const bx = sh.hit.x - sh.from.x, bz = sh.hit.z - sh.from.z, bl = Math.hypot(bx, bz) || 1;
        const rock = new Matrix4().makeTranslation(sh.hit.x, sh.hit.y, sh.hit.z)
          .multiply(new Matrix4().makeRotationAxis(v.set(bz / bl, 0, -bx / bl), a))
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
        // A rod pivoting at the cut: it tips ever faster (a tall one slower,
        // a heavy-crowned one quicker), once the hinge of wood gives.
        let accel = ((3 * 9.8) / (2 * f.length)) * Math.sin(f.angle) * f.heft;
        if (f.time < f.hold) accel *= 0.12; // (creaking, only just leaning)
        f.speed += accel * dt;
        f.speed *= 1 - 0.15 * dt; // (the air in its branches)
        const next = f.angle + f.speed * dt;
        // It stops where its crown (or trunk) meets the ground, not in it.
        if (this.#touches(f, next, ground) || next > Math.PI * 0.62) {
          if (f.bounces === 0) {
            const x = f.pivot.x + f.dir.x * Math.sin(next) * f.length * 0.6, z = f.pivot.z + f.dir.z * Math.sin(next) * f.length * 0.6;
            onLand?.(x, f.pivot.y, z, f.length);
          }
          if (f.bounces < 2 && f.speed > 0.35) {
            f.speed *= -rnd(0.15, 0.28);
            f.bounces++;
          } else {
            f.fallen = true;
            f.speed = 0;
          }
        } else f.angle = next;
      }
      f.group.quaternion.setFromAxisAngle(f.axis, f.angle);
      // (The crown crushed against the ground as it comes down, and settling.)
      if (f.leaves && f.angle > 0.35 && (!f.fallen || (f.settle = (f.settle ?? 0) + dt) < 0.3)) this.#crush(f, ground);
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
    for (const st of this.hits.values()) this.#unnotch(st);
    this.falling = [];
    this.hits.clear();
    this.loadStumps([]);
  }
}
