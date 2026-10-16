import { CanvasTexture, Color, Group, Mesh, MeshLambertMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { Puffs } from '../render/Puffs.js';
import { Inventory } from './Inventory.js';
import {
  anvilModel, bedModel, campfireModel, caughtModel, chestModel, cropModel, dryingRackModel, FENCE_LENGTH, fenceGateDoorModel, fenceGatePostsModel, fenceModel,
  furnaceModel, GATE_DOOR_WIDTH, gateDoorModel, gateFrameModel, grindstoneModel, meatStripModel, plotModel, raftModel, ROOF_SIZE, roofModel,
  ropeLengthModel, ropePathModel, ropeStakeModel, stoneWallModel, stoneFenceModel, chimneyModel, CHIMNEY_TOP, slateRoofModel, woodFloorModel, stoneFloorModel, FLOOR_SIZE, FLOOR_TOP, cellarModel, fishTrapModel, smokingRackModel, stoneWindowModel, woodWindowModel, thatchRoofModel, slateRoofPieceModel, ROOF_RISE, snareModel, stakeModel, stretchedHideModel, tanningRackModel, WALL_LENGTH, wallModel,
  logWallModel, plankWallModel, cutStoneWallModel, logFloorModel, cutStoneFloorModel, logStairsModel, plankStairsModel, stoneStairsModel, cutStairsModel, STAIRS_LENGTH, STAIRS_WIDTH, STAIRS_RISE,
  logRoofModel, shingleRoofModel, tileRoofModel, bedrollModel, strawBedModel, fancyBedModel, openWallModel, houseDoorModel, HOUSE_DOOR_WIDTH, altarModel, altarSocket, altarStoneModel, leanToModel, waterFilterModel, repairBenchModel, bridgeModel, bridgeSag, BRIDGE_WIDTH, chairModel, tableModel, shelfModel, trophyRackModel, plantingModel, coopModel, beeBoxModel, signModel, canoeModel, ladderModel } from './models.js';
import { RELICS, RELIC_COLOURS } from './items.js';

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
  // (Roofs: a sloped piece set up on top of the walls, square to the floor under it.)
  roof: { make: thatchRoofModel, roof: true, steep: 99 },
  slateRoof: { make: slateRoofPieceModel, roof: true, steep: 99, stone: true },
  woodWindow: { make: woodWindowModel, box: [WALL_LENGTH / 2, 0.28], tall: 3.3, line: 'wall', len: WALL_LENGTH },
  stoneWindow: { make: stoneWindowModel, box: [WALL_LENGTH / 2, 0.32], tall: 3.2, line: 'wall', len: WALL_LENGTH, stone: true },
  stoneWall: { make: stoneWallModel, box: [WALL_LENGTH / 2, 0.32], tall: 3.2, line: 'wall', len: WALL_LENGTH, stone: true },
  stoneFence: { make: stoneFenceModel, box: [FENCE_LENGTH / 2, 0.28], tall: 1.05, line: 'fence', len: FENCE_LENGTH, stone: true },
  chimney: { make: chimneyModel, box: [0.6, 0.6], tall: CHIMNEY_TOP, stone: true },
  // (Floors: stood on, not walked into; things are built on them. They
  // join edge to edge into one floor: see plan.)
  woodFloor: { make: woodFloorModel, box: [FLOOR_SIZE / 2, FLOOR_SIZE / 2], floor: true, steep: 1.6 },
  stoneFloor: { make: stoneFloorModel, box: [FLOOR_SIZE / 2, FLOOR_SIZE / 2], floor: true, steep: 1.6, stone: true },
  // The building sets: log (with the palisade), plank, rough stone, cut stone.
  logWall: { make: logWallModel, box: [WALL_LENGTH / 2, 0.28], tall: 3.3, line: 'wall', len: WALL_LENGTH },
  plankWall: { make: plankWallModel, box: [WALL_LENGTH / 2, 0.22], tall: 3.3, line: 'wall', len: WALL_LENGTH },
  cutStoneWall: { make: cutStoneWallModel, box: [WALL_LENGTH / 2, 0.32], tall: 3.2, line: 'wall', len: WALL_LENGTH, stone: true },
  logFloor: { make: logFloorModel, box: [FLOOR_SIZE / 2, FLOOR_SIZE / 2], floor: true, steep: 1.6 },
  cutStoneFloor: { make: cutStoneFloorModel, box: [FLOOR_SIZE / 2, FLOOR_SIZE / 2], floor: true, steep: 1.6, stone: true },
  // (Stairs: walked up, from a floor to the top of the walls: see floorTop.)
  logStairs: { make: logStairsModel, box: [STAIRS_WIDTH / 2, STAIRS_LENGTH / 2], stairs: true, steep: 1.2 },
  plankStairs: { make: plankStairsModel, box: [STAIRS_WIDTH / 2, STAIRS_LENGTH / 2], stairs: true, steep: 1.2 },
  stoneStairs: { make: stoneStairsModel, box: [STAIRS_WIDTH / 2, STAIRS_LENGTH / 2], stairs: true, steep: 1.2, stone: true },
  cutStairs: { make: cutStairsModel, box: [STAIRS_WIDTH / 2, STAIRS_LENGTH / 2], stairs: true, steep: 1.2, stone: true },
  // (Windows and doors in each set: a door swings open in the middle, the wall either side stays.)
  logWindow: { make: () => openWallModel('log', 'window'), box: [WALL_LENGTH / 2, 0.28], tall: 3.3, line: 'wall', len: WALL_LENGTH },
  logDoor: { make: () => openWallModel('log', 'door'), box: [WALL_LENGTH / 2, 0.28], tall: 3.3, line: 'wall', len: WALL_LENGTH, door: true, doorWidth: HOUSE_DOOR_WIDTH, doorStyle: 'log' },
  plankWindow: { make: () => openWallModel('plank', 'window'), box: [WALL_LENGTH / 2, 0.22], tall: 3.3, line: 'wall', len: WALL_LENGTH },
  plankDoor: { make: () => openWallModel('plank', 'door'), box: [WALL_LENGTH / 2, 0.22], tall: 3.3, line: 'wall', len: WALL_LENGTH, door: true, doorWidth: HOUSE_DOOR_WIDTH, doorStyle: 'plank' },
  stoneDoor: { make: () => openWallModel('stone', 'door'), box: [WALL_LENGTH / 2, 0.32], tall: 3.2, line: 'wall', len: WALL_LENGTH, stone: true, door: true, doorWidth: HOUSE_DOOR_WIDTH, doorStyle: 'stone' },
  cutWindow: { make: () => openWallModel('cut', 'window'), box: [WALL_LENGTH / 2, 0.32], tall: 3.2, line: 'wall', len: WALL_LENGTH, stone: true },
  cutDoor: { make: () => openWallModel('cut', 'door'), box: [WALL_LENGTH / 2, 0.32], tall: 3.2, line: 'wall', len: WALL_LENGTH, stone: true, door: true, doorWidth: HOUSE_DOOR_WIDTH, doorStyle: 'cut' },
  logRoof: { make: logRoofModel, roof: true, steep: 99 },
  shingleRoof: { make: shingleRoofModel, roof: true, steep: 99 },
  tileRoof: { make: tileRoofModel, roof: true, steep: 99, stone: true },
  bedroll: { make: bedrollModel, box: [0.5, 1.0], tall: 0.2, bed: true, tilt: true },
  strawBed: { make: strawBedModel, box: [0.55, 1.0], tall: 0.3, bed: true, tilt: true },
  fancyBed: { make: fancyBedModel, box: [0.8, 1.15], tall: 0.8, bed: true },
  // (The Lost Keep's altar: not built, found. See Game.#offer.)
  keepAltar: { make: altarModel, box: [1.0, 0.7], tall: 1.1 },
  anvil: { make: anvilModel, box: [0.5, 0.3], tall: 0.95 },
  grindstone: { make: grindstoneModel, box: [0.3, 0.45], tall: 1.2 },
  tanningRack: { make: tanningRackModel, box: [0.9, 0.2], jobs: 1 },
  // (A lean-to: a roof on poles, sheltering what's under it.)
  leanTo: { make: leanToModel, posts: [[-1.2, 0.9], [1.2, 0.9]], shelter: [1.5, 1.4] },
  // (Bridges: laid across a gorge or a river from where you stand; walked on, see floorTop. Each its own length: see build.)
  logBridge: { make: () => bridgeModel('log', 0.1, 0), bridge: 'log', circle: 0 },
  ropeBridge: { make: () => bridgeModel('rope', 0.1, 0), bridge: 'rope', circle: 0 },
  // (Furniture.)
  chair: { make: chairModel, box: [0.26, 0.26], tall: 0.5 },
  table: { make: tableModel, box: [0.7, 0.43], tall: 0.8 },
  shelf: { make: shelfModel, box: [0.65, 0.2], tall: 1.6 },
  trophyRack: { make: trophyRackModel, circle: 0.2, tall: 1.9 },
  orchardApple: { make: plantingModel, circle: 0.25, tall: 3, grows: 'appleTree' },
  orchardBerry: { make: plantingModel, circle: 0, grows: 'raspberryBush' },
  plantedOak: { make: plantingModel, circle: 0.3, tall: 6, grows: 'oak' },
  coop: { make: coopModel, box: [0.85, 0.7], tall: 1.6 },
  beeBox: { make: beeBoxModel, box: [0.3, 0.25], tall: 1.15 },
  sign: { make: signModel, box: [0.45, 0.06], tall: 1.55 },
  repairBench: { make: repairBenchModel, box: [0.8, 0.3], tall: 0.95 },
  waterFilter: { make: waterFilterModel, circle: 0.35, tall: 1.3, jobs: 2 },
  plot: { make: plotModel, circle: 0, tilt: true, reach: 1 },
  rope: { make: ropeStakeModel, circle: 0 },
  stake: { make: stakeModel, circle: 0.26, tall: 3.3 },
  chest: { make: chestModel, box: [0.52, 0.32], tall: 0.6 },
  bed: { make: bedModel, box: [0.62, 1.08], tall: 0.45, bed: true },
  dryingRack: { make: dryingRackModel, circle: 0, jobs: 4 },
  // (Stood over a campfire: what hangs in it smokes while the fire burns.)
  smokingRack: { make: smokingRackModel, jobs: 4, over: true },
  fishTrap: { make: fishTrapModel, circle: 0, water: true },
  cellar: { make: cellarModel, box: [1.3, 1.3], tall: 1.6 },
  snare: { make: snareModel, circle: 0 },
  raft: { make: raftModel, circle: 0, boat: true },
  canoe: { make: canoeModel, circle: 0, boat: true },
  ladder: { make: () => ladderModel(3), circle: 0 },
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

  model(type, upper = false) {
    const key = upper ? `${type}:upper` : type;
    return this.models[key] ?? (this.models[key] = KINDS[type].make(upper));
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
    // (On a floor, things stand on its boards or flags, not the ground under it.)
    if (!kind.floor) {
      // (Not one laid up over where you're pointing: a floor upstairs isn't in the way of building under it.)
      const bare = ground, below = (point.y ?? Infinity) + 0.3;
      ground = (px, pz) => Math.max(bare(px, pz), this.floorTop(px, pz, below) ?? -Infinity);
    }
    let level = null, upper = null;
    if (kind.floor) {
      // (Pointed up at the top of the walls round a floor: one laid up there, a storey higher, on the walls.)
      for (const f of this.list) {
        if (!KINDS[f.type].floor || Math.hypot(f.x - x, f.z - z) > FLOOR_SIZE * 1.6) continue;
        const up = f.y + 3.2;
        if (Math.abs(point.y - (up + FLOOR_TOP)) < 1.2 && point.y > f.y + 2) upper = up;
      }
    }
    if (kind.stairs) {
      // (Square to the floor it stands on, or the one nearest.)
      let near = null, bd = FLOOR_SIZE * 2;
      for (const f of this.list) {
        if (!KINDS[f.type].floor) continue;
        const d = Math.hypot(f.x - x, f.z - z);
        if (d < bd) (bd = d), (near = f);
      }
      const base = near ? near.rot : 0;
      rot = base + Math.round((rot - base) / (Math.PI / 2)) * (Math.PI / 2);
    }
    if (kind.floor) {
      // Square to the nearest floor, and edge to edge with it: one floor,
      // laid out on its grid (and level with it, where the ground allows).
      let best = null, bestD = FLOOR_SIZE * 1.6;
      for (const s of this.list) {
        if (!KINDS[s.type].floor) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bestD) (bestD = d), (best = s);
      }
      if (best) {
        const ax = Math.cos(best.rot), az = -Math.sin(best.rot), bx = Math.sin(best.rot), bz = Math.cos(best.rot);
        const u = Math.round(((x - best.x) * ax + (z - best.z) * az) / FLOOR_SIZE) * FLOOR_SIZE, v = Math.round(((x - best.x) * bx + (z - best.z) * bz) / FLOOR_SIZE) * FLOOR_SIZE;
        if (u || v) {
          x = best.x + ax * u + bx * v;
          z = best.z + az * u + bz * v;
          rot = best.rot;
          level = best.y;
        }
      } else rot = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
    }
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
      } else if (kind.line === 'wall') {
        // (Or along the edge of a floor, end to end with its corners.)
        let edge = null, bestE = 2.6;
        for (const f of this.list) {
          if (!KINDS[f.type].floor || Math.hypot(f.x - x, f.z - z) > FLOOR_SIZE * 1.5) continue;
          const fa = [Math.cos(f.rot), -Math.sin(f.rot)], fb = [Math.sin(f.rot), Math.cos(f.rot)];
          for (const [dir, along, turn] of [[fa, 1, Math.PI / 2], [fa, -1, Math.PI / 2], [fb, 1, 0], [fb, -1, 0]]) {
            const ex = f.x + dir[0] * along * (FLOOR_SIZE / 2), ez = f.z + dir[1] * along * (FLOOR_SIZE / 2);
            const d = Math.hypot(ex - x, ez - z);
            if (d < bestE) (bestE = d), (edge = { x: ex, z: ez, rot: f.rot + turn });
          }
        }
        if (edge) (x = edge.x), (z = edge.z), (rot = edge.rot);
      }
    }
    // A roof piece: square over the floor under it, up at the top of the
    // walls, sloping up away from you.
    let roofY = null;
    if (kind.roof) {
      rot = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
      let near = null, bd = FLOOR_SIZE * 1.6;
      for (const f of this.list) {
        if (!KINDS[f.type].floor && !KINDS[f.type].roof) continue;
        // (Of the storeys there, the one whose wall tops you're pointing at.)
        const top = KINDS[f.type].roof ? f.y : f.y + FLOOR_TOP + 3.2;
        const d = Math.hypot(f.x - x, f.z - z) + Math.abs(top - (point.y ?? top)) * 0.5;
        if (d < bd) (bd = d), (near = f);
      }
      if (near) {
        const ax2 = Math.cos(near.rot), az2 = -Math.sin(near.rot), bx2 = Math.sin(near.rot), bz2 = Math.cos(near.rot);
        const u = Math.round(((x - near.x) * ax2 + (z - near.z) * az2) / FLOOR_SIZE) * FLOOR_SIZE, v = Math.round(((x - near.x) * bx2 + (z - near.z) * bz2) / FLOOR_SIZE) * FLOOR_SIZE;
        x = near.x + ax2 * u + bx2 * v;
        z = near.z + az2 * u + bz2 * v;
        rot = near.rot + Math.round((rot - near.rot) / (Math.PI / 2)) * (Math.PI / 2);
        roofY = KINDS[near.type].roof ? near.y : near.y + FLOOR_TOP + 3.2;
      }
    }
    const half = kind.box ? kind.box : type === 'raft' ? [1.2, 1.3] : type === 'canoe' ? [0.4, 2.1] : [kind.circle || kind.reach || 0.5, kind.circle || kind.reach || 0.5];
    const ax = Math.cos(rot), az = -Math.sin(rot), bx = Math.sin(rot), bz = Math.cos(rot);
    let lo = Infinity, hi = -Infinity, wet = 0, wetLevel = -Infinity, deep = Infinity;
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
        wetLevel = Math.max(wetLevel, w);
        deep = Math.min(deep, w - h);
      }
    }
    let y = kind.line || type === 'stake' || kind.posts ? lo - 0.05 : kind.tilt ? ground(x, z) + 0.01 : kind.floor ? hi : lo;
    if (kind.roof) y = roofY ?? hi + 3.2;
    // (A floor laid on from another, at its level if the ground's not in the way.)
    if (kind.floor && level !== null && level >= hi - 0.05 && level < lo + 1.4) y = level;
    if (upper !== null) y = upper;
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
    if (kind.boat) {
      if (wet < corners.length || deep < 0.4) (ok = false), (why = `A ${type} needs open water`);
      y = wetLevel - 0.12;
    } else if (kind.water) {
      // (Set in the shallows, half under: at the water's edge or out in it.)
      if (wet < 4 || deep < 0.2) (ok = false), (why = 'Set it in water');
      y = wetLevel - 0.4;
    } else if (wet) (ok = false), (why = "Can't build in the water");
    else if (upper === null && hi - lo > (kind.line ? 1.4 : kind.steep ?? (kind.tilt ? 1.4 : 0.6))) (ok = false), (why = 'The ground is too steep here');
    // Nothing in the way: across its whole footprint (a wall along its
    // length; a roof just where its posts stand, as it goes over things),
    // no tree, bush, boulder, log or other thing built.
    if (ok && !kind.boat && !kind.water) {
      const spots = [];
      if (kind.roof) spots.length = 0;
      else if (kind.posts) for (const [u, v] of kind.posts) spots.push([u, v, 0.2]);
      else if (kind.floor) { if (upper === null) spots.push([0, 0, 0.1]); }
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
    return { type, x, y, z, rot, ok, why, tilt, upper: upper !== null };
  }

  // Whether something already built stands at (px, pz) (within `r`), in the
  // way of `type` going up at (x, z): why not, or null. (Lengths of the same
  // wall or fence may meet end to end; a roof goes over things.)
  #builtAt(px, pz, r, type, x, z) {
    const kind = KINDS[type];
    for (const s of this.list) {
      const k = KINDS[s.type];
      if (s.type === 'rope' || k.posts || kind.posts || k.over || kind.over || k.roof || kind.roof) continue;
      // (A floor's under things, not in their way; and floors meet edge to edge.)
      if (k.floor && !kind.floor) continue;
      if (kind.floor && !k.floor) continue;
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
    if (this.ghostType !== plan.type || this.ghostUpper !== !!plan.upper) {
      this.ghostUpper = !!plan.upper;
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = new Group();
      this.ghost.add(new Mesh(this.model(plan.type, !!plan.upper), this.ghostMaterial));
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
    const style = KINDS[type]?.doorStyle;
    return this.models[key] ?? (this.models[key] = style ? houseDoorModel(style) : type === 'fenceGate' ? fenceGateDoorModel() : gateDoorModel());
  }

  #doorWidth(type) {
    return KINDS[type]?.doorWidth ?? (type === 'fenceGate' ? FENCE_LENGTH - 0.3 : GATE_DOOR_WIDTH);
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
    const s = { id: this.nextId++, type: plan.type, x: plan.x, y: plan.y, z: plan.z, rot: plan.rot, tilt: plan.tilt ?? null, upper: !!plan.upper, lit: false, fuel: 0, jobs: [], ...extra };
    s.jobs = (s.jobs ?? []).map((j) => ({ ...j }));
    if (s.type === 'chest' || s.type === 'cellar' || s.type === 'shelf') {
      const inv = new Inventory(s.type === 'cellar' ? 24 : s.type === 'shelf' ? 6 : 10);
      if (extra.contents) extra.contents.forEach((st, i) => (inv.slots[i] = st));
      s.contents = inv;
    }
    const mesh = new Group();
    // (A bridge: its own length and rise, from here to the far side.)
    const bk = KINDS[s.type].bridge;
    const body = new Mesh(bk ? bridgeModel(bk, s.len ?? 6, s.rise ?? 0) : s.type === 'ladder' ? ladderModel(s.len ?? 3) : this.model(s.type, !!s.upper), this.material);
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
      let rope;
      if (s.path?.length > 1) rope = new Mesh(ropePathModel(s.path), this.material);
      else {
        rope = new Mesh(this.models.ropeLength ?? (this.models.ropeLength = ropeLengthModel()), this.material);
        rope.position.set(0, 0.28, 0.35);
        rope.scale.set(1, s.len + 0.3, 1);
      }
      rope.castShadow = true;
      mesh.add(rope);
    }
    if (s.type === 'keepAltar') {
      // Its sockets: a stone in each, shown once that trophy is set (see showOffered).
      s.offered ??= [];
      s.stones = RELIC_COLOURS.map((c, k) => {
        const m = new Mesh(this.models.altarStone ??= altarStoneModel(), new MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 }));
        const [x, z] = altarSocket(k);
        m.position.set(x, 0, z);
        mesh.add(m);
        return m;
      });
      this.showOffered(s);
    }
    if (s.type === 'trophyRack') {
      // (A great beast's trophy hung on its board: see showTrophy.)
      s.trophyMesh = new Mesh(undefined, this.material);
      s.trophyMesh.position.set(0, 1.25, 0.2);
      s.trophyMesh.rotation.x = -Math.PI / 2 + 0.25;
      s.trophyMesh.scale.setScalar(1.5);
      s.trophyMesh.visible = false;
      mesh.add(s.trophyMesh);
      this.showTrophy(s);
    }
    if (KINDS[s.type].grows) {
      // (A tree or bush growing there: see showPlant, and Game's plantModel.)
      s.growth ??= 0;
      s.plant = new Group();
      mesh.add(s.plant);
      this.showPlant(s);
    }
    if (s.type === 'plot') {
      s.cropMesh = new Mesh(undefined, this.material);
      s.cropMesh.castShadow = true;
      mesh.add(s.cropMesh);
      this.#showCrop(s);
    }
    if (s.type === 'fishTrap') {
      s.catchMesh = new Mesh(this.modelOf('rawFish'), this.material);
      s.catchMesh.position.set(0, 0.3, -0.1);
      s.catchMesh.rotation.y = Math.PI / 2;
      s.catchMesh.visible = (s.caught || 0) > 0;
      mesh.add(s.catchMesh);
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
    if (s.type === 'sign') this.showSign(s);
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
      } else if (s.type === 'smokingRack') {
        mesh = new Mesh(meatStripModel(j.done), this.material);
        mesh.position.set(-0.55 + (k >> 1) * 0.5 + (k % 2) * 0.2, 1.75, (k % 2 ? -1 : 1) * 0.18);
      } else if (s.type === 'tanningRack') {
        mesh = new Mesh(this.models[`hide${j.done}`] ?? (this.models[`hide${j.done}`] = stretchedHideModel(j.done)), this.material);
      } else if (s.type === 'campfire') {
        mesh = new Mesh(this.modelOf(id), this.material);
        if (id === 'pot' || id === 'waterskin' || id === 'stew') {
          const a = (k / 3) * Math.PI * 2;
          mesh.position.set(Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3);
        } else {
          // (Meat, fish, bread... laid on the stones of the ring, leaning in to the flames.)
          const a = ((1 + 3 * k) / 9) * Math.PI * 2; // (on a stone: see campfireModel)
          mesh.position.set(Math.cos(a) * 0.58, 0.2, Math.sin(a) * 0.58);
          mesh.rotation.set(0, Math.PI / 2 - a, -0.35, 'YXZ'); // (its length along the ring, tipped towards the fire)
          mesh.scale.setScalar(0.8);
        }
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

  /** What's growing in an orchard planting, drawn at its size now (and the season's: bare in winter). */
  showPlant(s) {
    if (!s.plant) return;
    s.plant.clear();
    const kind = s.type === 'orchardBerry' ? (Math.abs(Math.sin(s.x * 12.9898 + s.z * 78.233) * 43758.5453) % 1 < 0.5 ? 'raspberryBush' : 'blueberryBush') : KINDS[s.type].grows;
    const made = this.plantModel?.(kind, 0.12 + 0.88 * Math.min(1, s.growth ?? 0));
    if (made) s.plant.add(made);
    s.plantShown = Math.floor((s.growth ?? 0) * 20);
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
      if (KINDS[s.type].grows && (s.growth ?? 0) < 1) {
        // A sapling growing: a few days to a tree (a bush sooner); not in the winter.
        const season = (ctx.winter ?? 0) > 0.6 ? 0 : 0.35 + 0.8 * (ctx.spring ?? 0) + 0.65 * (ctx.summer ?? 0) + 0.25 * (ctx.autumn ?? 0);
        s.growth = Math.min(1, (s.growth ?? 0) + (dt * season * (1 + 0.4 * Math.min(1, ctx.rain ?? 0))) / (s.type === 'orchardBerry' ? 1100 : s.type === 'plantedOak' ? 1700 : 1900));
        if (Math.floor(s.growth * 20) !== s.plantShown) (this.showPlant(s), this.onChange?.());
      }
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
      // (A smoking rack smokes only over a burning fire.)
      if (kind.over && s.jobs.length && (!s.fireCheck || ctx.time > s.fireCheck)) {
        s.fireCheck = ctx.time + 1;
        s.smoking = this.list.some((f) => f.type === 'campfire' && f.lit && Math.hypot(f.x - s.x, f.z - s.z) < 1.4);
      }
      if (s.jobs.length && (!kind.fire || s.lit) && (!kind.over || s.smoking)) {
        const rate = kind.fire || kind.over ? 1 : 1 - 0.6 * (ctx.rain ?? 0);
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
      // (A chimney beside the fire draws its smoke: it rises from the top of the stack.)
      if (!s.chimneyCheck || ctx.time > s.chimneyCheck) {
        s.chimneyCheck = ctx.time + 2;
        const ch = this.list.find((c) => c.type === 'chimney' && Math.hypot(c.x - s.x, c.z - s.z) < 2.4);
        if (ch) s.smoke.uniforms.uCentre.value.set(ch.x, ch.y + CHIMNEY_TOP - (kind.fire === 'closed' ? 1.45 : 0.9) + 0.3, ch.z);
        else s.smoke.uniforms.uCentre.value.set(s.x, s.y, s.z);
      }
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
      if (k.floor || k.stairs) continue; // (stood on: see floorTop)
      if (feetY + 1.7 < s.y) continue; // (up a storey, over your head)
      if (feetY > s.y + (k.tall ?? 0.5) - 0.05 && !k.posts) continue; // (up on top)
      if (k.door && s.open && k.doorWidth) {
        // (A house door open: only the doorway's clear; the wall either side of it is in the way.)
        const side = (k.len - k.doorWidth) / 4;
        for (const end of [-1, 1]) this.#pushBox(position, radius, s, end * (k.doorWidth / 2 + side), side, k.box[1]);
        continue;
      }
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

  // Out of a box in a structure's frame: its middle `uc` along it, half-sizes hu x hv.
  #pushBox(position, radius, s, uc, hu, hv) {
    const ax = Math.cos(s.rot), az = -Math.sin(s.rot), bx = Math.sin(s.rot), bz = Math.cos(s.rot);
    const ox = position.x - s.x, oz = position.z - s.z;
    const u = ox * ax + oz * az - uc, v = ox * bx + oz * bz;
    const cu = Math.max(-hu, Math.min(hu, u)), cv = Math.max(-hv, Math.min(hv, v));
    let du = u - cu, dv = v - cv, d = Math.hypot(du, dv);
    if (d >= radius) return;
    if (d === 0) {
      const pu = hu - Math.abs(u), pv = hv - Math.abs(v);
      if (pu < pv) (du = Math.sign(u) || 1), (dv = 0), (d = -pu);
      else (du = 0), (dv = Math.sign(v) || 1), (d = -pv);
      position.x += (ax * du + bx * dv) * (radius - d);
      position.z += (az * du + bz * dv) * (radius - d);
      return;
    }
    position.x += ((ax * du + bx * dv) / d) * (radius - d);
    position.z += ((az * du + bz * dv) / d) * (radius - d);
  }

  #pushCircle(position, radius, x, z, r) {
    const ox = position.x - x, oz = position.z - z, d = Math.hypot(ox, oz), min = radius + r;
    if (d < min && d > 0) (position.x += (ox / d) * (min - d)), (position.z += (oz / d) * (min - d));
  }

  /** The top of a wall at (x, z) (within `r`), for a ladder to lean on: its height, or -Infinity. */
  wallTopAt(x, z, r = 0.4) {
    let top = -Infinity;
    for (const s of this.list) {
      const k = KINDS[s.type];
      if (!k.line || Math.abs(s.x - x) > 4 || Math.abs(s.z - z) > 4) continue;
      const ax = Math.cos(s.rot), az = -Math.sin(s.rot);
      const u = (x - s.x) * ax + (z - s.z) * az, v = Math.abs((x - s.x) * -az + (z - s.z) * ax);
      if (Math.abs(u) <= k.len / 2 && v < r + (k.box?.[1] ?? 0.25)) top = Math.max(top, s.y + (k.tall ?? 2));
    }
    return top;
  }

  /** What's built near (x, z), as circles for the animals to steer round: [x, z, radius, ...]. */
  obstacles(x, z, reach) {
    const out = [];
    for (const s of this.list) {
      if (Math.abs(s.x - x) > reach + 3 || Math.abs(s.z - z) > reach + 3) continue;
      if (s.type === 'snare' || KINDS[s.type].boat || s.type === 'rope' || s.type === 'ladder' || s.type === 'plot') continue;
      const kind = KINDS[s.type];
      if (kind.line) {
        // (Close-set, so nothing slips through: a fence pens sheep in.)
        const ax = Math.cos(s.rot), az = -Math.sin(s.rot), n = Math.round(kind.len / 0.5);
        for (let k = 0; k <= n; k++) {
          const u = -kind.len / 2 + (k / n) * kind.len;
          if (kind.door && s.open && Math.abs(u) < (kind.doorWidth ? kind.doorWidth / 2 : kind.len / 2 - 0.3)) continue;
          out.push(s.x + ax * u, s.z + az * u, 0.3);
        }
      } else if (kind.posts) {
        const c = Math.cos(s.rot), sn = Math.sin(s.rot);
        for (const [u, v] of kind.posts) out.push(s.x + u * c + v * sn, s.z - u * sn + v * c, 0.2);
      } else out.push(s.x, s.z, s.type === 'campfire' || s.type === 'furnace' ? 0.85 : KINDS[s.type].bed ? 1 : 0.5);
    }
    return out;
  }

  /** The structure nearest a ray (from `origin` along unit `dir`), within `reach`: { structure, distance }, or null. */
  pick(origin, dir, reach) {
    let best = null;
    for (const s of this.list) {
      // (A rope reaches far from its stake: down a slope it may end tens of metres off.)
      const spread = s.type === 'rope' ? 4 + (s.path?.length ? Math.max(...s.path.map(([d]) => Math.abs(d))) : 1) : 4;
      if (Math.abs(s.x - origin.x) > reach + spread || Math.abs(s.z - origin.z) > reach + spread) continue;
      // Points on it to aim at: along a wall's length; up a stake.
      const ax = Math.cos(s.rot), az = -Math.sin(s.rot), bx = Math.sin(s.rot), bz = Math.cos(s.rot);
      const points = [];
      const kd = KINDS[s.type];
      if (kd.line === 'fence') for (let k = -3; k <= 3; k++) for (const h of [0.4, 0.9]) points.push([s.x + ax * k * 0.48, s.y + h, s.z + az * k * 0.48, 0.4]);
      else if (kd.line) for (let k = -4; k <= 4; k++) for (const h of [0.6, 1.6, 2.6]) points.push([s.x + ax * k * 0.48, s.y + h, s.z + az * k * 0.48, 0.45]);
      else if (kd.posts) for (const [u, v] of kd.posts) for (const h of [0.8, 1.8]) points.push([s.x + u * Math.cos(s.rot) + v * Math.sin(s.rot), s.y + h, s.z - u * Math.sin(s.rot) + v * Math.cos(s.rot), 0.35]);
      else if (s.type === 'rope' && s.path?.length > 1) {
        for (let k = 1; k < s.path.length; k++) {
          const [d0, y0] = s.path[k - 1], [d1, y1] = s.path[k], n = Math.max(1, Math.ceil(Math.hypot(d1 - d0, y1 - y0) / 0.8));
          for (let t = 0; t <= n; t++) {
            const d = d0 + ((d1 - d0) * t) / n + 0.05, y = y0 + ((y1 - y0) * t) / n + 0.1;
            points.push([s.x + bx * d, s.y + y, s.z + bz * d, 0.5]);
          }
        }
        // (Its foot, easy to take hold of from below: the last metre or two, at a man's height over it.)
        const [fd, fy] = s.path[s.path.length - 1];
        for (const h of [0.5, 1.2, 1.9]) points.push([s.x + bx * fd, s.y + fy + h, s.z + bz * fd, 0.9]);
      } else if (s.type === 'rope') for (let h = 0; h <= s.len + 0.5; h += 0.8) points.push([s.x + bx * 0.35, s.y + 0.3 - h, s.z + bz * 0.35, 0.5]);
      else if (s.type === 'plot') points.push([s.x, s.y + 0.25, s.z, 1.1]);
      else if (kd.bridge) for (const v of [0, s.len ?? 6]) for (const side of [-1, 1]) points.push([s.x + ax * side * BRIDGE_WIDTH * 0.5 + bx * v, s.y + (s.rise ?? 0) * (v / (s.len ?? 6)) + 0.7, s.z + az * side * BRIDGE_WIDTH * 0.5 + bz * v, 0.4]);
      else if (s.type === 'trophyRack') points.push([s.x, s.y + 1.5, s.z, 0.6]);
      else if (s.type === 'coop') for (const h of [0.6, 1.2]) points.push([s.x, s.y + h, s.z, 0.9]);
      else if (s.type === 'shelf') for (const h of [0.5, 1.2]) points.push([s.x, s.y + h, s.z, 0.7]);
      else if (s.type === 'anvil' || s.type === 'grindstone') points.push([s.x, s.y + 0.8, s.z, 0.6]);
      else if (s.type === 'tanningRack') for (const h of [0.6, 1.3]) points.push([s.x, s.y + h, s.z, 0.75]);
      else if (s.type === 'stake') for (const h of [0.5, 1.4, 2.3]) points.push([s.x, s.y + h, s.z, 0.4]);
      else if (KINDS[s.type].bed) for (const v of [-0.7, 0, 0.7]) points.push([s.x + bx * v, s.y + (s.type === 'bedroll' ? 0.15 : s.type === 'strawBed' ? 0.25 : 0.35), s.z + bz * v, 0.55]);
      else if (KINDS[s.type].stairs) for (const v of [-1.5, -0.5, 0.5, 1.5]) points.push([s.x + bx * v, s.y + (STAIRS_RISE * (v + 2)) / 4, s.z + bz * v, 0.8]);
      else if (s.type === 'raft') for (const v of [-0.8, 0, 0.8]) points.push([s.x + bx * v, s.y + 0.3, s.z + bz * v, 1]);
      else if (s.type === 'canoe') for (const v of [-1.5, -0.5, 0.5, 1.5]) points.push([s.x + bx * v, s.y + 0.25, s.z + bz * v, 0.45]);
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

  /** The altar's stones: one lit in each socket whose trophy has been set (see RELICS). */
  showOffered(s) {
    s.stones?.forEach((m, k) => (m.visible = s.offered.includes(RELICS[k])));
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
      contents: s.contents?.slots, open: !!s.open, rise: s.rise, trophy: s.trophy, eggs: s.eggs, feathers: s.feathers, data: s.data, caught: s.type === 'fishTrap' ? s.caught || 0 : !!s.caught, jobs: s.jobs.map(({ stack, out, left, total, done }) => ({ stack, out, left, total, done })),
      tilt: s.tilt?.map((v) => +v.toFixed(3)) ?? null, len: s.len, path: s.path, ruinKey: s.ruinKey, crop: s.crop, growth: s.growth, watered: s.watered ? Math.round(s.watered) : 0, fed: s.fed ? Math.round(s.fed) : 0, upper: s.upper || undefined, offered: s.offered,
    }));
  }

  /**
   * A sign's words, painted on both faces of its board (dark letters on
   * the planks, as burnt in with a hot iron), wrapped to fit.
   */
  showSign(s) {
    const text = (s.data?.text ?? '').trim();
    if (s.signText === text) return;
    s.signText = text;
    for (const m of s.signFaces ?? []) (s.mesh.remove(m), m.material.map?.dispose(), m.material.dispose());
    s.signFaces = [];
    if (!text) return;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 284;
    const g = c.getContext('2d');
    g.fillStyle = '#9a7048';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < c.height; y += 36) g.fillRect(0, y, c.width, 2);
    g.fillStyle = '#2a1a10';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // (Wrapped to the board, the type as big as will fit.)
    let size = 64, lines;
    for (; size >= 22; size -= 4) {
      g.font = `bold ${size}px Georgia, serif`;
      lines = [];
      for (const para of text.split(/\n/)) {
        let line = '';
        for (const w of para.split(/\s+/)) {
          const t = line ? `${line} ${w}` : w;
          if (g.measureText(t).width > c.width - 40 && line) (lines.push(line), (line = w));
          else line = t;
        }
        lines.push(line);
      }
      if (lines.length * size * 1.15 < c.height - 30) break;
    }
    lines.forEach((l, k) => g.fillText(l, c.width / 2, c.height / 2 + (k - (lines.length - 1) / 2) * size * 1.15));
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    for (const side of [1, -1]) {
      const m = new Mesh((this.signPlane ??= new PlaneGeometry(0.86, 0.46)), new MeshLambertMaterial({ map: tex }));
      m.position.set(0, 1.25, 0.027 * side);
      if (side < 0) m.rotation.y = Math.PI;
      s.mesh.add(m);
      s.signFaces.push(m);
    }
  }

  /** A trophy rack: what's hung on it (s.trophy, an item id), shown. */
  showTrophy(s) {
    if (!s.trophyMesh) return;
    s.trophyMesh.visible = !!s.trophy;
    if (s.trophy) {
      s.trophyMesh.geometry = this.modelOf(s.trophy);
      // (Antlers and skulls mounted upright, facing out; a fish side-on along the board; pelts and the rest laid flat on it.)
      const upright = /Antlers$|Skull$|^bearClaws$/.test(s.trophy), fish = s.trophy === 'trophyFish';
      s.trophyMesh.rotation.set(upright ? 0.15 : fish ? 0 : -Math.PI / 2 + 0.25, fish ? Math.PI / 2 : 0, fish ? Math.PI / 2 : 0);
      s.trophyMesh.position.set(0, upright ? 1.45 : 1.25, upright ? 0.16 : 0.2);
      s.trophyMesh.scale.setScalar(fish ? 2.2 : 1.5);
    }
    this.onChange?.();
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
        this.build({ type: rec.type, x: rec.x, y: rec.y, z: rec.z, rot: rec.rot, tilt: rec.tilt }, { lit: rec.lit, fuel: rec.fuel, burnt: rec.burnt, contents: rec.contents, open: rec.open, caught: rec.caught, jobs: rec.jobs ?? [], len: rec.len, path: rec.path, ruinKey: rec.ruinKey, crop: rec.crop ?? null, growth: rec.growth ?? 0, watered: rec.watered ?? 0, fed: rec.fed ?? 0, rise: rec.rise, trophy: rec.trophy, eggs: rec.eggs ?? 0, feathers: rec.feathers ?? 0, data: rec.data ? { ...rec.data } : undefined });
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
      s.caught = s.type === 'fishTrap' ? rec.caught || 0 : !!rec.caught;
      if (s.catchMesh) s.catchMesh.visible = !!s.caught;
      if (rec.data) s.data = { ...rec.data };
      if (s.type === 'sign') this.showSign(s);
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
      this.build({ type: s.type, x: s.x, y: s.y, z: s.z, rot: s.rot, tilt: s.tilt }, { lit: s.lit, fuel: s.fuel, burnt: s.burnt, contents: s.contents, open: s.open, caught: s.caught, jobs: s.jobs ?? [], len: s.len, path: s.path, ruinKey: s.ruinKey, crop: s.crop ?? null, growth: s.growth ?? 0, watered: s.watered ?? 0, fed: s.fed ?? 0, upper: !!s.upper, offered: s.offered, rise: s.rise, trophy: s.trophy, eggs: s.eggs ?? 0, feathers: s.feathers ?? 0, data: s.data ? { ...s.data } : undefined });
    }
    this.onChange = quiet;
  }

  /**
   * How sheltered (x, y, z) is: `roof` (1 under a roof), `walls` (how much
   * of the way round, 0..1, walls and shut gates close it in, within 7 m).
   */
  /**
   * The top of a floor at (x, z), or null if there's none: what you stand on
   * there (from `feetY`, if it's not far over your head).
   */
  floorTop(x, z, feetY = Infinity) {
    let top = null;
    for (const s of this.list) {
      const k = KINDS[s.type];
      if (k.bridge) {
        // (A bridge: along its length, its deck, sagging in the middle if it's a rope one.)
        const len = s.len ?? 6;
        if (Math.abs(s.x - x) > len + 2 || Math.abs(s.z - z) > len + 2) continue;
        const ox = x - s.x, oz = z - s.z, u = ox * Math.cos(s.rot) - oz * Math.sin(s.rot), v = ox * Math.sin(s.rot) + oz * Math.cos(s.rot);
        if (Math.abs(u) > BRIDGE_WIDTH / 2 + 0.1 || v < -0.4 || v > len + 0.4) continue;
        const f = Math.min(1, Math.max(0, v / len));
        const t = s.y + (s.rise ?? 0) * f - bridgeSag(k.bridge, len) * Math.sin(Math.PI * f) + 0.03;
        if (t > feetY + 0.7) continue;
        if (top === null || t > top) top = t;
        continue;
      }
      if (!(k.floor || k.stairs) || Math.abs(s.x - x) > 3 || Math.abs(s.z - z) > 3) continue;
      const ox = x - s.x, oz = z - s.z, c = Math.cos(s.rot), sn = Math.sin(s.rot);
      const u = ox * c - oz * sn, v = ox * sn + oz * c;
      let t;
      if (k.stairs) {
        // (Up the flight: from its foot to the top of the walls at its head.)
        if (Math.abs(u) > STAIRS_WIDTH / 2 + 0.05 || Math.abs(v) > STAIRS_LENGTH / 2 + 0.05) continue;
        t = s.y + STAIRS_RISE * Math.min(1, Math.max(0, (v + STAIRS_LENGTH / 2) / STAIRS_LENGTH));
        if (t > feetY + 0.7) continue;
        if (top === null || t > top) top = t;
        continue;
      }
      if (Math.abs(u) > FLOOR_SIZE / 2 + 0.05 || Math.abs(v) > FLOOR_SIZE / 2 + 0.05) continue;
      t = s.y + FLOOR_TOP;
      if (t > feetY + 0.7) continue;
      if (top === null || t > top) top = t;
    }
    return top;
  }

  /** What a footstep at (x, z) lands on, if it's something built (a floor, stairs) right under your feet: 'wood' or 'rock', or null. */
  surfaceKind(x, z, feetY) {
    const top = this.floorTop(x, z, feetY);
    if (top === null || Math.abs(top - feetY) > 0.35) return null;
    for (const s of this.list) {
      const k = KINDS[s.type];
      if (k.bridge && Math.hypot(s.x - x, s.z - z) < (s.len ?? 6) + 1) return 'wood';
      if (!(k.floor || k.stairs) || Math.abs(s.x - x) > 3 || Math.abs(s.z - z) > 3) continue;
      return k.stone ? 'rock' : 'wood';
    }
    return null;
  }

  shelterAt(x, y, z) {
    let roof = 0;
    const lines = [];
    for (const s of this.list) {
      if (Math.abs(s.x - x) > 9 || Math.abs(s.z - z) > 9) continue;
      const k = KINDS[s.type];
      if (k.posts || k.roof) {
        const ox = x - s.x, oz = z - s.z, c = Math.cos(s.rot), sn = Math.sin(s.rot);
        const u = ox * c - oz * sn, v = ox * sn + oz * c;
        const [hu, hv] = k.shelter ?? [ROOF_SIZE / 2 + 0.3, ROOF_SIZE / 2 + 0.3];
        if (Math.abs(u) < hu && Math.abs(v) < hv && (k.roof ? y < s.y + ROOF_RISE && y > s.y - 4.5 : y > s.y - 1 && y < s.y + 3.6)) roof = 1;
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
