// Builds chunks off the main thread: the terrain mesh, where rocks lie,
// and where the far trees stand. It rebuilds its own copy of the world
// generator from the seed, which makes exactly the same world as the main
// thread's (whatever order anything is asked for in).
import { TerrainGenerator } from './TerrainGenerator.js';
import { chunkDataBuffers, chunkSurface, computeChunkData } from './ChunkMesher.js';
import { rockCandidates } from './rockCandidates.js';
import { packFarTrees, placeTrees } from './treePlacement.js';
import { placeGrass } from './grassPlacement.js';
import { waterData } from './waterData.js';
import { riverData } from './riverData.js';
import { reedData } from './reedData.js';
import { minimapPixels } from '../ui/minimapPixels.js';
import { mapTile } from '../ui/mapLabels.js';

let world = null; // { seed, generator }
const rocks = new Map(); // "cx,cz" -> rock candidates (recently used last)

function rocksAt(cx, cz, config) {
  const key = `${cx},${cz}`;
  let list = rocks.get(key);
  if (list) rocks.delete(key);
  else list = rockCandidates(world.generator, config, cx, cz);
  rocks.set(key, list);
  if (rocks.size > 300) rocks.delete(rocks.keys().next().value);
  return list;
}

self.onmessage = (event) => {
  const { id, seed, config, cx, cz, resolution, wantRocks, wantTrees, wantGrass, wantFarTrees, wantRivers } = event.data;
  if (!world || world.seed !== seed) {
    world = { seed, generator: new TerrainGenerator(seed, config) };
    rocks.clear();
  }
  const g = world.generator;
  if (event.data.kind === 'describe') {
    // What kind of country the player is in (for the panel).
    self.postMessage({ id, result: g.describe(event.data.x, event.data.z) });
    return;
  }
  if (event.data.kind === 'waterSounds') {
    // The waterfalls and running water near the player (for their sounds).
    const { x, z } = event.data, R = 260;
    const falls = [], runs = [];
    for (const course of g.rivers.inBox(x - R, z - R, x + R, z + R)) {
      const P = course.points;
      let best = null;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, run = Math.hypot(dx, dz) || 1, drop = a.level - b.level;
        if (drop / run >= 0.4 && drop >= 0.8 && Math.hypot(b.x - x, b.z - z) < R) falls.push({ x: b.x, y: b.level, z: b.z, drop, width: Math.max(a.width, b.width) });
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (run * run)));
        const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(px - x, pz - z);
        if (d < 150 && (!best || d < best.d)) best = { d, x: px, z: pz, y: a.level + (b.level - a.level) * t, steep: drop / run, width: a.width + (b.width - a.width) * t, stream: course.kind === 'stream' };
      }
      if (best) runs.push(best);
    }
    const near = (p) => Math.hypot(p.x - x, p.z - z);
    falls.sort((p, q) => near(p) - near(q));
    runs.sort((p, q) => p.d - q.d);
    self.postMessage({ id, result: { falls: falls.slice(0, 8), runs: runs.slice(0, 6) } });
    return;
  }
  if (event.data.kind === 'map') {
    // A tile of the big map.
    const { x0, z0, n, s } = event.data;
    const result = mapTile(g, x0, z0, n, s);
    self.postMessage({ id, result }, [result.labels.buffer, result.shade.buffer]);
    return;
  }
  if (event.data.kind === 'minimap') {
    const { n, s, seaLevel } = event.data;
    const result = minimapPixels(g, cx, cz, n, s, seaLevel);
    self.postMessage({ id, result }, [result.buffer]);
    return;
  }
  const data = computeChunkData(g, config, cx, cz, resolution);
  const out = { id, data, rocks: null, trees: null, grass: null, farTrees: null, water: null };
  if (wantRocks) {
    // This chunk's rocks and its neighbours' (trees keep off boulders across the border).
    out.rocks = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = rocksAt(cx + dx, cz + dz, config);
        out.rocks.push({ cx: cx + dx, cz: cz + dz, list: Array.from(list), snowLine: list.snowLine });
      }
    }
  }
  const transfer = [];
  const { groundHeightAt, heights } = chunkSurface(g, config, cx, cz, resolution, data);
  // The lake or sea over it, if any.
  out.water = waterData(g, config, cx, cz, heights);
  if (out.water) for (const a of Object.values(out.water)) transfer.push(a.buffer);
  // River, stream and pond water, and the reeds along their banks.
  if (wantRivers) {
    out.river = riverData(g, config, cx, cz);
    if (out.river) {
      for (const k of ['positions', 'colors', 'flows', 'streaks', 'freezes']) transfer.push(out.river[k].buffer);
      if (out.river.spray) for (const a of Object.values(out.river.spray)) transfer.push(a.buffer);
    }
    out.reeds = reedData(g, config, cx, cz, groundHeightAt, heights);
    if (out.reeds) transfer.push(out.reeds.matrices.buffer, out.reeds.shades.buffer);
  }
  if (wantTrees) {
    // Where the trees stand, off the boulders (as RockLayer.bouldersNear).
    const cells = Math.round(config.chunkSize / config.treeSpacing);
    const margin = config.chunkSize / cells;
    const size = config.chunkSize;
    const x0 = cx * size - margin, z0 = cz * size - margin;
    const x1 = (cx + 1) * size + margin, z1 = (cz + 1) * size + margin;
    const boulders = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const c of rocksAt(cx + dx, cz + dz, config)) {
          if (c.boulder && c.wx > x0 && c.wx < x1 && c.wz > z0 && c.wz < z1) boulders.push(c.wx, c.wz, Math.max(c.sx, c.sz) * 0.93);
        }
      }
    }
    out.trees = placeTrees(g, config, cx, cz, groundHeightAt, boulders);
  }
  if (wantGrass) {
    out.grass = placeGrass(g, config, cx, cz, groundHeightAt);
    transfer.push(out.grass.matrices.buffer, out.grass.colors.buffer, out.grass.kinds.buffer);
  }
  if (wantFarTrees) {
    out.farTrees = packFarTrees(placeTrees(g, config, cx, cz, groundHeightAt, null), cx, cz, config.chunkSize);
    for (const a of Object.values(out.farTrees)) transfer.push(a.buffer);
  }
  transfer.push(...chunkDataBuffers(data));
  self.postMessage(out, transfer);
};
