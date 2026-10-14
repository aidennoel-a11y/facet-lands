import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';
import { hash2 } from '../noise/random.js';
import { Inventory } from './Inventory.js';
import { ITEMS } from './items.js';
import * as M from './models.js';
import { coalModel, goldOreModel, mountainOreModel, swordModel, arrowModel, axeModel, boltModel, bowModel, crossbowModel, hoeModel, sickleModel, shearsModel, fishModel, flintModel, ironBarModel, ironModel, logModel, meatModel, pickaxeModel, potModel, rockModel, rodModel, skinModel, spearModel, stickModel, waterskinModel } from './models.js';

const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(), up = new Vector3(0, 1, 0), tint = new Color();
const hidden = new Matrix4().makeScale(0, 0, 0);

// What lies about on the ground by itself, per kind: its model.
const NATURAL = { stick: stickModel, rock: rockModel, flint: flintModel };
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Ore, lying in the rock: a vein to break out with a pickaxe, never picked up by hand (see Game.#mine).
export const ORE_NODES = new Set(['iron', 'coal', 'goldOre', 'mountainOre']);
export const WILD_CROPS = { wildWheat: 'wheat', wildCorn: 'corn', wildPotato: 'potato', wildCarrot: 'carrot' };
// (Things that are built: a small one of what it builds. See model.)
const BUILT = {
  campfire: M.campfireModel, furnace: M.furnaceModel, wall: M.wallModel, gate: M.gateFrameModel, stake: M.stakeModel, chest: M.chestModel, bed: M.bedModel,
  dryingRack: M.dryingRackModel, snare: M.snareModel, raft: M.raftModel, roof: M.thatchRoofModel, hideRoof: M.thatchRoofModel, fence: M.fenceModel, fenceGate: M.fenceGatePostsModel,
  anvil: M.anvilModel, grindstone: M.grindstoneModel, tanningRack: M.tanningRackModel,
  woodFloor: M.woodFloorModel, stoneFloor: M.stoneFloorModel, stoneWall: M.stoneWallModel, stoneFence: M.stoneFenceModel, chimney: M.chimneyModel, slateRoof: M.slateRoofPieceModel, woodWindow: M.woodWindowModel, stoneWindow: M.stoneWindowModel,
  cellar: M.cellarModel, fishTrap: M.fishTrapModel, smokingRack: M.smokingRackModel,
  logWall: M.logWallModel, plankWall: M.plankWallModel, cutStoneWall: M.cutStoneWallModel, logFloor: M.logFloorModel, cutStoneFloor: M.cutStoneFloorModel,
  logStairs: M.logStairsModel, plankStairs: M.plankStairsModel, stoneStairs: M.stoneStairsModel, cutStairs: M.cutStairsModel,
  logWindow: () => M.openWallModel('log', 'window'), logDoor: () => M.openWallModel('log', 'door'), plankWindow: () => M.openWallModel('plank', 'window'), plankDoor: () => M.openWallModel('plank', 'door'),
  stoneDoor: () => M.openWallModel('stone', 'door'), cutWindow: () => M.openWallModel('cut', 'window'), cutDoor: () => M.openWallModel('cut', 'door'),
  chair: M.chairModel, table: M.tableModel, shelf: M.shelfModel, trophyRack: M.trophyRackModel, coop: M.coopModel, logBridge: () => M.bridgeModel('log', 2.5, 0), ropeBridge: () => M.bridgeModel('rope', 2.5, 0),
  leanTo: M.leanToModel, waterFilter: M.waterFilterModel, repairBench: M.repairBenchModel,
  logRoof: M.logRoofModel, shingleRoof: M.shingleRoofModel, tileRoof: M.tileRoofModel, bedroll: M.bedrollModel, strawBed: M.strawBedModel, fancyBed: M.fancyBedModel,
};

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
    this.glowMaterial = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
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
    if (variant === 'node') return (this.models[key] ??= M.oreNodeModel(id));
    if (variant === 'boulder') return (this.models[key] ??= M.ironBoulderModel());
    // (A wild crop: a small stand of it, ripe, as a farmed one in a plot but a patch about a metre across.)
    if (WILD_CROPS[id]) return (this.models[key] ??= M.wildCropModel(WILD_CROPS[id]));
    if (!this.models[key]) {
      const steel = [0xb8c0c8, 0xeef2f6];
      const make = {
        stick: stickModel, rock: rockModel, flint: flintModel, iron: ironModel, log: logModel, deerSkin: skinModel,
        spear: () => spearModel(), steelSpear: () => spearModel(0x9aa4b0),
        axe: () => axeModel(), steelAxe: () => axeModel(...steel),
        pickaxe: () => pickaxeModel(), steelPickaxe: () => pickaxeModel(...steel),
        rawMeat: () => meatModel(false), rawFowl: () => meatModel(false), cookedMeat: () => meatModel(true), rawFish: () => fishModel(false), cookedFish: () => fishModel(true), smokedMeat: () => meatModel(true), smokedFish: () => fishModel(true),
        forgedSpear: () => spearModel(0xd8e0ea), forgedAxe: () => axeModel(0xdfe6ee, 0xffffff), forgedPickaxe: () => pickaxeModel(0xdfe6ee, 0xffffff),
        crossbow: crossbowModel, bolt: boltModel, hoe: hoeModel, sickle: sickleModel, shears: shearsModel, steelBar: () => ironBarModel(0xe4eaf0),
        bow: bowModel, arrow: arrowModel, fishingRod: rodModel, waterskin: waterskinModel, pot: potModel, ironBar: ironBarModel,
        coal: coalModel, mountainOre: mountainOreModel, goldOre: goldOreModel, goldBar: () => ironBarModel(0xe0b440), sword: () => swordModel(),
        // (Everything else, each its own shape.)
        vine: M.vineModel, rope: M.ropeModel, hide: M.hideModel, fur: M.furModel, pelt: M.tannedFurModel, wool: M.woolModel, feather: M.featherModel, charcoal: M.charcoalModel,
        grizzlyPelt: M.grizzlyPeltModel, alphaFang: M.fangModel, paleFur: M.paleFurModel, greatAntlers: M.antlersModel, greatHide: M.greatHideModel, crocHide: M.crocHideModel,
        lionPelt: M.lionPeltModel, tigerPelt: M.tigerPeltModel, venomSac: M.venomSacModel, boarTusk: M.tusksModel, caveBearPelt: M.caveBearPeltModel,
        seedWheat: () => M.seedsModel(0xd8b464), seedCorn: () => M.seedsModel(0xe8c030), seedPotato: () => M.potatoModel(), seedCarrot: () => M.seedsModel(0x7a6a4a), wheat: M.wheatModel,
        berries: M.berriesModel, apple: M.appleModel, mushroom: () => M.mushroomModel(), jerky: M.jerkyModel, corn: () => M.cornModel(false), roastCorn: () => M.cornModel(true),
        potato: () => M.potatoModel(false), bakedPotato: () => M.potatoModel(true), carrot: M.carrotModel, dough: M.doughModel, bread: M.breadModel, stew: M.stewModel,
        honey: () => M.seedsModel(0xe8a020), rawEgg: () => M.eggModel(false), cookedEgg: () => M.eggModel(true), salt: () => M.seedsModel(0xf4f2ee), straw: M.wheatModel, sand: () => M.seedsModel(0xe2c88a),
        flintSteel: () => M.flintSteelModel(false), fineFlintSteel: () => M.flintSteelModel(true),
        oldSword: () => swordModel(0xa8aca4, 0xc8ccc4, 0xb08a3a), oldMap: () => M.hideModel(),
        fangSword: () => swordModel(0xf0e8d4, 0xfaf4e4, 0x5a4a3a), antlerBow: () => bowModel(true, 0xcbb690), tuskPickaxe: () => pickaxeModel(0xe8dcc0, 0xf4ecd8),
        poisonArrow: () => arrowModel(0x6a9a3a), poisonBolt: () => boltModel(0x6a9a3a),
        saddle: () => M.saddleModel(false), greatSaddle: () => M.saddleModel(true), bandage: M.bandageModel, torch: M.torchModel, coalTorch: M.torchModel,
        coat: () => M.coatModel(0xa8743e, 0x8a5a2e), furCloak: () => M.coatModel(0x8a7458, 0xa89070), paleCloak: () => M.coatModel(0xe8e4dc, 0xf4f0ea), caveCloak: () => M.coatModel(0x3a3634, 0x4a4644),
        armour: () => M.coatModel(0x7a5230, 0x5a3a20, 0x8a6038), steelArmour: () => M.coatModel(0x5a4a3a, 0x4a3a2a, 0xb8c0c8),
        scarArmour: () => M.coatModel(0x4a3426, 0x3a281c, 0xb8c0c8), lionArmour: () => M.coatModel(0xc89a5a, 0x6a4026, 0xb8c0c8),
        tigerArmour: () => M.coatModel(0xd8823a, 0x1e1612, 0xb8c0c8), crocArmour: () => M.coatModel(0x5a6a44, 0x3a4a2e, 0xb8c0c8),
        crystal: M.crystalItemModel, silk: M.woolModel, silkRope: M.ropeModel, glowcap: () => M.mushroomModel(0x7affc8, 0xd8f0e8), caveLamp: M.caveLampModel, guano: M.guanoModel,
        caveMushroom: () => M.mushroomModel(0xd8ccb8, 0xece4d0), deathcap: () => M.mushroomModel(0xe8e4c8, 0xf4f0e0, 0), blindFish: () => fishModel(false),
      }[id];
      const built = BUILT[id];
      this.models[key] = make ? make() : built ? M.miniature(built()) : ITEMS[id]?.spawns ? M.spawnerModel() : M.parcelModel();
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
    const found = { stick: [], rock: [], flint: [], seedWheat: [], seedCorn: [], seedPotato: [], seedCarrot: [], coal: [], iron: [], mountainOre: [], goldOre: [], wildWheat: [], wildCorn: [], wildPotato: [], wildCarrot: [] };
    const items = [];
    // (The country, sampled every 32 m.)
    const land = new Map();
    const at = (x, z) => {
      const k = `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
      let v = land.get(k);
      if (!v) {
        const w = generator.getBiomeWeights(x, z, {});
        // (On top of a mesa, the caprock: gold lies about up there.)
        const f = generator.getFeatures(x, z);
        v = { w, forest: generator.getForestDensity(x, z), mount: generator.getMountainness(x, z), mesaTop: f.mesa > 0.35 && f.mesaHeight > 17 * f.mesa };
        land.set(k, v);
      }
      return v;
    };
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const gi = cx * 100 + i, gj = cz * 100 + j;
        const h = hash2(gi, gj, seed);
        const lx = (i + 0.15 + 0.7 * hash2(gi, gj, seed + 1)) * G, lz = (j + 0.15 + 0.7 * hash2(gi, gj, seed + 2)) * G;
        const { w, forest, mount, mesaTop } = at(x0 + lx, z0 + lz);
        const wooded = Math.max(forest * (w.temperate + w.smoky + w.pine + w.blackHills + w.wetland), w.jungle, 0.6 * w.pine, 0.6 * w.smoky);
        const pStick = 0.03 + 0.4 * wooded;
        const pRock = 0.05 + 0.12 * mount + 0.06 * (w.savanna + w.desert) + 0.04 * w.volcanic;
        const pFlint = wooded > 0.35 || mount > 0.3 ? 0.02 : 0.004;
        // Wild seed in the open grass: wheat and carrot on the plains,
        // corn on the savanna, potatoes up in the hills and the cold.
        const pSeed = 0.007 * (1 - Math.min(1, forest * 1.6)) * Math.min(1, w.temperate + w.savanna + w.smoky + 0.5 * w.pine);
        let id = null;
        const pGold = mesaTop ? 0.005 : 0;
        // Wild crops out on the open plains (and the parkland's meadows), now and then: wheat the likeliest.
        const pWild = 0.005 * (1 - Math.min(1, forest * 1.8)) * Math.min(1, w.temperate + 0.6 * w.parkland);
        if (h > 1 - pGold) id = 'goldOre';
        else if (h > 1 - pGold - pWild) {
          const r = hash2(gi, gj, seed + 7);
          id = r < 0.45 ? 'wildWheat' : r < 0.65 ? 'wildCarrot' : r < 0.85 ? 'wildPotato' : 'wildCorn';
        }
        else if (h < pFlint) id = 'flint';
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
        // High in the mountains, some of the loose stone is coal, or the dark
        // ore that steel is made from (see Game.#mine).
        // Now and then, among the loose stones, a lump of rusty iron ore showing
        // through: once in a while anywhere, far more often in the mountains and
        // their foothills.
        if (id === 'rock' && hash2(gi, gj, seed + 8) < 0.01 + 0.035 * smoothstep(0.3, 0.6, mount)) id = 'iron';
        else if (id === 'rock' && y > 150) {
          const r = hash2(gi, gj, seed + 6) * smoothstep(150, 200, y);
          if (r > 0.82) id = 'mountainOre';
          else if (r > 0.6) id = 'coal';
        }
        if (generator.rivers?.at(x0 + lx, z0 + lz, 0.5)) continue;
        const turn = hash2(gi, gj, seed + 3) * Math.PI * 2;
        const item = { key, id, x: x0 + lx, y, z: z0 + lz, turn, index: found[id].length, node: ORE_NODES.has(id) };
        if (id === 'iron') (item.size = 2.1), (item.boulder = true); // (a boulder with iron in it: see ironBoulderModel)
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
      const mesh = new InstancedMesh(this.model(id, id === 'iron' ? 'boulder' : ORE_NODES.has(id) ? 'node' : ''), this.material, list.length);
      mesh.name = id;
      list.forEach((it, k) => {
        // (Wild crops: each patch its own size, and sunk a little where the ground slopes.)
        const wild = WILD_CROPS[id] ? 0.8 + 0.5 * ((it.turn * 7.31) % 1) : 1;
        mesh.setMatrixAt(k, m4.compose(p.set(it.x - x0, it.y - (wild !== 1 ? 0.05 : 0), it.z - z0), q.setFromAxisAngle(up, it.turn), s.setScalar(wild)));
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
    // (What lies on the cave floors to be picked up, by kind: see decorateChunk.)
    const PICK = { 1: 'iron', 2: 'crystal', 3: 'glowcap', 5: 'coal', 6: 'goldOre', 7: 'caveMushroom', 8: 'deathcap', 10: 'mountainOre', 11: 'guano' };
    const byId = {};
    for (let k = 0; k < features.length; k += 6) {
      const id = PICK[features[k]];
      if (!id) continue;
      const key = `cave:${cx},${cz},${k / 6}`;
      if (this.taken.has(key)) continue;
      (byId[id] ??= []).push({ key, id, x: features[k + 1], y: features[k + 2], z: features[k + 3], turn: features[k + 4], size: features[k + 5] });
    }
    const C = this.config.chunkSize, x0 = cx * C, z0 = cz * C; // (the cave chunk's group sits at its corner)
    const all = [], meshes = [];
    for (const [id, items] of Object.entries(byId)) {
      // (Crystals and glowcaps give their own soft light; the rest lit only a little, as by a faint glimmer.)
      const glow = id === 'crystal' || id === 'glowcap';
      const mesh = new InstancedMesh(id === 'crystal' ? (this.models.caveCrystal ??= M.crystalModel()) : id === 'glowcap' ? (this.models.caveGlowcap ??= M.glowcapModel()) : this.model(id, ORE_NODES.has(id) ? 'node' : ''), glow ? this.glowMaterial : this.caveMaterial, items.length);
      mesh.name = `cave ${id}`;
      items.forEach((it, k) => {
        it.index = k;
        it.mesh = mesh;
        it.size = glow ? it.size * (id === 'crystal' ? 0.8 : 1.2) : ORE_NODES.has(id) ? 0.85 + (it.size % 0.4) : it.size;
        it.node = ORE_NODES.has(id);
        mesh.setMatrixAt(k, m4.compose(p.set(it.x - x0, it.y - 0.05, it.z - z0), q.setFromAxisAngle(up, it.turn), s.setScalar(it.size)));
        if (glow) mesh.setColorAt(k, tint.set(id === 'crystal' ? [0x7fe0ff, 0xc08aff, 0x9affd8][Math.floor(it.turn * 10) % 3] : [0x7affc8, 0x8ad8ff][Math.floor(it.turn * 10) % 2]));
        all.push(it);
      });
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.userData.caveDetail = true; // (drawn only once you're inside: see CaveLayer)
      parent.add(mesh);
      meshes.push(mesh);
    }
    if (!all.length) return;
    this.caves.set(`${cx},${cz}`, { items: all, meshes });
  }

  removeCave(cx, cz) {
    const c = this.caves.get(`${cx},${cz}`);
    if (!c) return;
    for (const mesh of c.meshes) mesh.dispose();
    this.caves.delete(`${cx},${cz}`);
  }

  /** Drops a stack at (x, y, z): it falls and settles on the ground. `stuck`: a spear standing where it landed. */
  drop(stack, x, y, z, { vy = 0, vx = 0, vz = 0, turn = Math.random() * Math.PI * 2, tilt = null, uid = null } = {}) {
    const mesh = new Mesh(this.model(stack.id), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, turn, 0);
    if (tilt) mesh.quaternion.copy(tilt);
    this.dropGroup.add(mesh);
    // (Each with its own name, to be known by online: see WorldSync.)
    const d = { stack, x, y, z, vy, vx, vz, mesh, turn, settled: false, stuck: !!tilt, age: 0, uid: uid ?? `${this.uidPrefix ?? 'me'}.${(this.nextUid = (this.nextUid ?? 0) + 1)}` };
    this.drops.push(d);
    return d;
  }

  /** Takes away a dropped stack by its uid (someone else picked it up, online). */
  removeDrop(uid) {
    const d = this.drops.find((d) => d.uid === uid);
    if (!d) return;
    this.drops.splice(this.drops.indexOf(d), 1);
    this.dropGroup.remove(d.mesh);
  }

  /** Something on the ground taken by someone else (online), by its key. */
  takeKey(key) {
    this.taken.add(key);
    for (const { items } of [...this.chunks.values(), ...this.caves.values()]) {
      for (const it of items ?? []) {
        if (it.key !== key || it.gone) continue;
        it.gone = true;
        it.mesh.setMatrixAt(it.index, hidden);
        it.mesh.instanceMatrix.needsUpdate = true;
        return;
      }
    }
  }

  /** @param ground (x, z, fromY) => height (what it lands on, from as high as it is: a floor, a cave floor) */
  update(dt, ground) {
    for (const d of this.drops) {
      d.age += dt;
      if (d.settled) continue;
      const g = ground(d.x, d.z, d.y + 0.3);
      d.vy -= 18 * dt;
      d.y += d.vy * dt;
      // (Thrown: carried along through the air, slowed by it.)
      if (d.vx || d.vz) {
        d.x += d.vx * dt;
        d.z += d.vz * dt;
        const drag = Math.exp(-dt * 0.6);
        d.vx *= drag;
        d.vz *= drag;
        d.mesh.rotation.x += dt * 6;
      }
      if (!Number.isFinite(g) || d.y <= g) {
        if (Number.isFinite(g)) d.y = g;
        d.settled = true;
        if (Number.isFinite(g) && !d.stuck) this.#rest(d, ground);
      }
      d.mesh.position.set(d.x, d.y, d.z);
    }
  }

  // A dropped thing come to rest: moved aside off anything already lying
  // there (not one inside another), laid along the slope of the ground under
  // it, and lifted so none of it sinks into the ground.
  #rest(d, ground) {
    const geo = d.mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box = geo.boundingBox;
    d.restR = Math.min(0.6, Math.max(0.12, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.45));
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const o of this.drops) {
        if (o === d || !o.settled || o.restR === undefined || Math.abs(o.y - d.y) > 1) continue;
        let dx = d.x - o.x, dz = d.z - o.z;
        const dist = Math.hypot(dx, dz), need = d.restR + o.restR;
        if (dist >= need) continue;
        if (dist < 1e-3) (dx = Math.cos(d.turn ?? pass)), (dz = Math.sin(d.turn ?? pass));
        const len = Math.hypot(dx, dz);
        d.x = o.x + (dx / len) * need;
        d.z = o.z + (dz / len) * need;
        moved = true;
      }
      if (!moved) break;
    }
    const from = d.y + 0.5, y = ground(d.x, d.z, from);
    if (Number.isFinite(y)) d.y = y;
    // (The lie of the ground under it.)
    const e = 0.25, h = (x, z) => {
      const v = ground(x, z, from);
      return Number.isFinite(v) ? v : d.y;
    };
    const normal = new Vector3(-(h(d.x + e, d.z) - h(d.x - e, d.z)) / (2 * e), 1, -(h(d.x, d.z + e) - h(d.x, d.z - e)) / (2 * e)).normalize();
    if (normal.y < 0.55) {
      // (Too steep to lie along: as steep as it can.)
      const hl = Math.hypot(normal.x, normal.z) || 1, k = Math.sqrt(1 - 0.55 * 0.55) / hl;
      normal.set(normal.x * k, 0.55, normal.z * k);
    }
    const yaw = new Quaternion().setFromAxisAngle(up, d.turn ?? 0);
    d.mesh.quaternion.setFromUnitVectors(up, normal).multiply(yaw);
    // (Its underside on the ground, not in it.)
    d.y += Math.max(0, -box.min.y) * normal.y + 0.01;
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

  /** The wild crops standing within `r` of (x, z) (see WILD_CROPS). */
  wildNear(x, z, r) {
    const C = this.config.chunkSize, out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const src = this.chunks.get(`${Math.floor(x / C) + dx},${Math.floor(z / C) + dz}`);
        for (const it of src?.items ?? []) if (!it.gone && WILD_CROPS[it.id] && Math.hypot(it.x - x, it.z - z) < r) out.push(it);
      }
    }
    return out;
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
            consider(it.x, it.y + (it.boulder ? 0.4 : it.node ? 0.2 : 0.08), it.z, it.node ? 0.42 * (it.size ?? 1) : it.key.startsWith('cave:') ? 0.25 * (it.size ?? 1) : 0.18, (t) => ({ kind: 'ground', item: it, id: it.id, distance: t }));
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
