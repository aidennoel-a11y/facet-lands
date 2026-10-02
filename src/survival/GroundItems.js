import { Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';
import { hash2 } from '../noise/random.js';
import { Inventory } from './Inventory.js';
import { ITEMS } from './items.js';
import { arrowModel, axeModel, boltModel, bowModel, crossbowModel, hoeModel, shearsModel, bundleModel, fishModel, flintModel, ironBarModel, ironModel, logModel, meatModel, pickaxeModel, potModel, rockModel, rodModel, skinModel, spearModel, stickModel, waterskinModel } from './models.js';

const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(), up = new Vector3(0, 1, 0);
const hidden = new Matrix4().makeScale(0, 0, 0);

// What lies about on the ground by itself, per kind: its model.
const NATURAL = { stick: stickModel, rock: rockModel, flint: flintModel };
const BUNDLE_COLOURS = { berries: 0xb01830, apple: 0xc8261c, mushroom: 0xc49a60, vine: 0x4f8a34, flintSteel: 0x5a6070, fineFlintSteel: 0x9aa4b0, coat: 0xa8743e, armour: 0x7a5230, torch: 0x8a5d38, campfire: 0x7a5232, wall: 0x8a6a44, gate: 0x8a6a44, stake: 0x8a6a44, chest: 0x8a6038, furnace: 0x8a867e, bed: 0xece6d8, dryingRack: 0x8a5d38, snare: 0x6fae4c, raft: 0x7a5232, jerky: 0x6a2e18, stew: 0x8a4a2a, wool: 0xf0ece0, bandage: 0xece6d8, hide: 0xb06a58, fur: 0x7a6a58, pelt: 0xc4a47a, feather: 0xe8e0d0, rope: 0xb89a60, charcoal: 0x2a2624, wheat: 0xe0bc64, seedWheat: 0xd8b464, seedCorn: 0xe8c030, seedPotato: 0xb08a58, seedCarrot: 0x7a6a4a, corn: 0xf0c830, roastCorn: 0xd89a28, potato: 0xb89060, bakedPotato: 0x8a5a30, carrot: 0xe8762a, dough: 0xece0c4, bread: 0xb8763a, furCloak: 0x8a7458, roof: 0xc8a860, fence: 0x8a6a44, fenceGate: 0x8a6a44, anvil: 0x4a5058, grindstone: 0x9a968e, tanningRack: 0x8a5d38 };

/**
 * Things on the ground to pick up:
 *  - what lies about by itself, the same in every visit to a place: sticks
 *    under the trees, small rocks everywhere (more in the mountains and
 *    the dry country), and here and there a nodule of flint in the woods
 *    and the mountains; (a chunk layer: on the chunks right round you);
 *  - iron ore lying in the caves (see addCave);
 *  - whatever's been dropped: logs from a felled tree, a thrown spear,
 *    meat, things you let go of. These fall to the ground and settle.
 * Whatever's been picked up stays picked up (`taken`, saved with the world).
 */
export class GroundItems {
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // (Deep in a cave there's no daylight: the ore's lit only a little, as if by a faint glimmer.)
    this.caveMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0x6a6a6a, emissive: 0x1a1410 });
    this.models = {};
    this.taken = new Set();
    this.chunks = new Map(); // "cx,cz" -> { items: [{ key, id, x, y, z, mesh, index }] }
    this.caves = new Map(); // "cx,cz" -> { items, group }
    this.drops = []; // { stack, x, y, z, vy, mesh, settled, stuck }
    this.dropGroup = new Group();
    this.dropGroup.name = 'dropped items';
    scene.add(this.dropGroup);
    const self = this;

    /** The chunk layer: what lies about by itself. */
    this.layer = {
      name: 'ground items',
      reuseKey: ({ lod }) => (lod > 0 ? 'none' : 'near'),
      build(args) {
        return self.#buildChunk(args);
      },
      dispose(group) {
        if (self.chunks.get(group.userData.key)?.group === group) self.chunks.delete(group.userData.key);
        for (const mesh of group.children) mesh.dispose();
      },
    };
  }

  model(id, variant = '') {
    const key = id + variant;
    if (!this.models[key]) {
      const steel = [0xb8c0c8, 0xeef2f6];
      const make = {
        stick: stickModel, rock: rockModel, flint: flintModel, iron: ironModel, log: logModel, deerSkin: skinModel,
        spear: () => spearModel(), steelSpear: () => spearModel(0x9aa4b0),
        axe: () => axeModel(), steelAxe: () => axeModel(...steel),
        pickaxe: () => pickaxeModel(), steelPickaxe: () => pickaxeModel(...steel),
        rawMeat: () => meatModel(false), cookedMeat: () => meatModel(true), rawFish: () => fishModel(false), cookedFish: () => fishModel(true),
        forgedSpear: () => spearModel(0xd8e0ea), forgedAxe: () => axeModel(0xdfe6ee, 0xffffff), forgedPickaxe: () => pickaxeModel(0xdfe6ee, 0xffffff),
        crossbow: crossbowModel, bolt: boltModel, hoe: hoeModel, shears: shearsModel, steelBar: () => ironBarModel(0xe4eaf0),
        bow: bowModel, arrow: arrowModel, fishingRod: rodModel, waterskin: waterskinModel, pot: potModel, ironBar: ironBarModel,
      }[id];
      this.models[key] = make ? make() : bundleModel(BUNDLE_COLOURS[id] ?? 0x9a8a6a);
    }
    return this.models[key];
  }

  #buildChunk({ cx, cz, lod, generator, groundHeightAt, config }) {
    if (lod > 0) return null;
    const size = config.chunkSize, sea = config.seaLevel;
    const x0 = cx * size, z0 = cz * size;
    const seed = generator.seed ^ 0x9e3779;
    const G = 6, cells = Math.floor(size / G);
    const surface = { normalY: 1 };
    const found = { stick: [], rock: [], flint: [], seedWheat: [], seedCorn: [], seedPotato: [], seedCarrot: [] };
    const items = [];
    // (The country, sampled every 32 m.)
    const land = new Map();
    const at = (x, z) => {
      const k = `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
      let v = land.get(k);
      if (!v) {
        const w = generator.getBiomeWeights(x, z, {});
        v = { w, forest: generator.getForestDensity(x, z), mount: generator.getMountainness(x, z) };
        land.set(k, v);
      }
      return v;
    };
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const gi = cx * 100 + i, gj = cz * 100 + j;
        const h = hash2(gi, gj, seed);
        const lx = (i + 0.15 + 0.7 * hash2(gi, gj, seed + 1)) * G, lz = (j + 0.15 + 0.7 * hash2(gi, gj, seed + 2)) * G;
        const { w, forest, mount } = at(x0 + lx, z0 + lz);
        const wooded = Math.max(forest * (w.temperate + w.smoky + w.pine + w.blackHills + w.wetland), w.jungle, 0.6 * w.pine, 0.6 * w.smoky);
        const pStick = 0.03 + 0.4 * wooded;
        const pRock = 0.05 + 0.12 * mount + 0.06 * (w.savanna + w.desert) + 0.04 * w.volcanic;
        const pFlint = wooded > 0.35 || mount > 0.3 ? 0.02 : 0.004;
        // Wild seed in the open grass: wheat and carrot on the plains,
        // corn on the savanna, potatoes up in the hills and the cold.
        const pSeed = 0.007 * (1 - Math.min(1, forest * 1.6)) * Math.min(1, w.temperate + w.savanna + w.smoky + 0.5 * w.pine);
        let id = null;
        if (h < pFlint) id = 'flint';
        else if (h < pFlint + pStick) id = 'stick';
        else if (h < pFlint + pStick + pRock) id = 'rock';
        else if (h < pFlint + pStick + pRock + pSeed) {
          const r = hash2(gi, gj, seed + 5);
          id = w.savanna > 0.5 ? 'seedCorn' : mount > 0.3 || w.pine > 0.5 ? 'seedPotato' : r < 0.6 ? 'seedWheat' : 'seedCarrot';
        }
        if (!id) continue;
        const key = `${cx},${cz},${i},${j}`;
        if (this.taken.has(key)) continue;
        const y = groundHeightAt(lx, lz, surface);
        if (!(y > sea + 0.3) || surface.normalY < 0.72) continue;
        if (generator.rivers?.at(x0 + lx, z0 + lz, 0.5)) continue;
        const turn = hash2(gi, gj, seed + 3) * Math.PI * 2;
        const item = { key, id, x: x0 + lx, y, z: z0 + lz, turn, index: found[id].length };
        found[id].push(item);
        items.push(item);
      }
    }
    if (!items.length) return null;
    const group = new Group();
    group.name = 'ground items';
    group.userData.key = `${cx},${cz}`;
    for (const [id, list] of Object.entries(found)) {
      if (!list.length) continue;
      const mesh = new InstancedMesh(this.model(id), this.material, list.length);
      mesh.name = id;
      list.forEach((it, k) => {
        mesh.setMatrixAt(k, m4.compose(p.set(it.x - x0, it.y, it.z - z0), q.setFromAxisAngle(up, it.turn), s.setScalar(1)));
        it.mesh = mesh;
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.chunks.set(group.userData.key, { group, items });
    return group;
  }

  /**
   * A cave chunk's finds (see decorateChunk): its iron ore, to pick up.
   * `features`: [kind, x, y, z, turn, size, ...] (kind 1: iron ore).
   */
  addCave(cx, cz, features, parent) {
    const items = [];
    for (let k = 0; k < features.length; k += 6) {
      if (features[k] !== 1) continue;
      const key = `cave:${cx},${cz},${k / 6}`;
      if (this.taken.has(key)) continue;
      items.push({ key, id: 'iron', x: features[k + 1], y: features[k + 2], z: features[k + 3], turn: features[k + 4], size: features[k + 5], index: items.length });
    }
    if (!items.length) return;
    const mesh = new InstancedMesh(this.model('iron'), this.caveMaterial, items.length);
    mesh.name = 'iron ore';
    const C = this.config.chunkSize, x0 = cx * C, z0 = cz * C; // (the cave chunk's group sits at its corner)
    items.forEach((it, k) => {
      mesh.setMatrixAt(k, m4.compose(p.set(it.x - x0, it.y - 0.05, it.z - z0), q.setFromAxisAngle(up, it.turn), s.setScalar(it.size)));
      it.mesh = mesh;
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    parent.add(mesh);
    this.caves.set(`${cx},${cz}`, { items, mesh });
  }

  removeCave(cx, cz) {
    const c = this.caves.get(`${cx},${cz}`);
    if (!c) return;
    c.mesh.dispose();
    this.caves.delete(`${cx},${cz}`);
  }

  /** Drops a stack at (x, y, z): it falls and settles on the ground. `stuck`: a spear standing where it landed. */
  drop(stack, x, y, z, { vy = 0, turn = Math.random() * Math.PI * 2, tilt = null } = {}) {
    const mesh = new Mesh(this.model(stack.id), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, turn, 0);
    if (tilt) mesh.quaternion.copy(tilt);
    this.dropGroup.add(mesh);
    const d = { stack, x, y, z, vy, mesh, settled: false, stuck: !!tilt, age: 0 };
    this.drops.push(d);
    return d;
  }

  /** @param ground (x, z) => height */
  update(dt, ground) {
    for (const d of this.drops) {
      d.age += dt;
      if (d.settled) continue;
      const g = ground(d.x, d.z);
      d.vy -= 18 * dt;
      d.y += d.vy * dt;
      if (!Number.isFinite(g) || d.y <= g) {
        if (Number.isFinite(g)) d.y = g;
        d.settled = true;
      }
      d.mesh.position.set(d.x, d.y, d.z);
    }
  }

  /**
   * The nearest thing to pick up along a ray from `origin` (unit `dir`),
   * within `reach`: { kind: 'ground' | 'drop', item, id, distance }, or null.
   */
  /** Whether an item `id` (e.g. a stick) lies within `r` of (x, z) on the ground. */
  lying(x, z, r, id) {
    const C = this.config.chunkSize, src = this.chunks.get(`${Math.floor(x / C)},${Math.floor(z / C)}`);
    return !!src?.items.some((it) => !it.gone && it.id === id && Math.abs(it.x - x) < r && Math.abs(it.z - z) < r);
  }

  pick(origin, dir, reach) {
    let best = null, bestScore = Infinity;
    const consider = (x, y, z, radius, make) => {
      const ox = x - origin.x, oy = y - origin.y, oz = z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > reach + radius) return;
      const off = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - t * t));
      const allow = radius + 0.2 + t * 0.06;
      if (off > allow) return;
      const score = off / allow + t * 0.02;
      if (score < bestScore) (bestScore = score), (best = make(t));
    };
    const C = this.config.chunkSize, ccx = Math.floor(origin.x / C), ccz = Math.floor(origin.z / C);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const src of [this.chunks.get(`${ccx + dx},${ccz + dz}`), this.caves.get(`${ccx + dx},${ccz + dz}`)]) {
          if (!src) continue;
          for (const it of src.items) {
            if (it.gone) continue;
            if (Math.abs(it.x - origin.x) > reach + 1 || Math.abs(it.z - origin.z) > reach + 1) continue;
            consider(it.x, it.y + 0.08, it.z, it.id === 'iron' ? 0.35 * (it.size ?? 1) : 0.18, (t) => ({ kind: 'ground', item: it, id: it.id, distance: t }));
          }
        }
      }
    }
    for (const d of this.drops) {
      if (Math.abs(d.x - origin.x) > reach + 2 || Math.abs(d.z - origin.z) > reach + 2) continue;
      consider(d.x, d.y + 0.15, d.z, d.stack.id === 'log' ? 0.5 : 0.25, (t) => ({ kind: 'drop', item: d, id: d.stack.id, distance: t }));
    }
    return best;
  }

  /** Picks up what `pick` found: returns its stack (and it's gone from the ground). */
  take(target) {
    if (target.kind === 'drop') {
      const d = target.item;
      this.drops.splice(this.drops.indexOf(d), 1);
      this.dropGroup.remove(d.mesh);
      return d.stack;
    }
    const it = target.item;
    it.gone = true;
    this.taken.add(it.key);
    it.mesh.setMatrixAt(it.index, hidden);
    it.mesh.instanceMatrix.needsUpdate = true;
    return Inventory.stack(it.id, 1);
  }

  /** Puts a taken stack back where it was (there was no room for it). */
  untake(target) {
    if (target.kind === 'drop') {
      this.drops.push(target.item);
      this.dropGroup.add(target.item.mesh);
      return;
    }
    const it = target.item;
    it.gone = false;
    this.taken.delete(it.key);
    const C = this.config.chunkSize;
    const inCave = it.key.startsWith('cave:');
    const ox = Math.floor(it.x / C) * C, oz = Math.floor(it.z / C) * C;
    it.mesh.setMatrixAt(it.index, m4.compose(p.set(it.x - ox, it.y - (inCave ? 0.05 : 0), it.z - oz), q.setFromAxisAngle(up, it.turn), s.setScalar(it.size ?? 1)));
    it.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const d of this.drops) this.dropGroup.remove(d.mesh);
    this.drops = [];
    this.taken.clear();
  }

  /** Food lying on the ground spoils too. */
  spoil(dt) {
    for (const d of [...this.drops]) {
      if (d.stack.fresh === undefined) continue;
      d.stack.fresh -= dt;
      if (d.stack.fresh <= 0) {
        this.drops.splice(this.drops.indexOf(d), 1);
        this.dropGroup.remove(d.mesh);
      }
    }
  }

  get names() {
    return ITEMS;
  }
}
