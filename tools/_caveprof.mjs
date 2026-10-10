// Time per step of building cave chunks: node tools/_caveprof.mjs [seed] [n]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
import { sampleChunk, meshChunk, decorateChunk, liquidChunk, buildChunkData } from '../src/world/caves/caveMesher.js';
const [seed = 'polaris', N = '10'] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD), f = g.caves.field;
buildChunkData(f, 40, 40, WORLD.chunkSize);
const T = { sample: 0, mesh: 0, deco: 0, liquid: 0 };
for (let k = 0; k < +N; k++) {
  const cx = (k * 7) % 23 - 11, cz = Math.floor(k * 3.3) % 17 - 8;
  let t = performance.now(); const grid = sampleChunk(f, cx, cz, WORLD.chunkSize); T.sample += performance.now() - t;
  if (!grid) continue;
  t = performance.now(); meshChunk(grid, f); T.mesh += performance.now() - t;
  t = performance.now(); const d = decorateChunk(grid, f); T.deco += performance.now() - t;
  t = performance.now(); liquidChunk(grid, f, d.pools); T.liquid += performance.now() - t;
}
console.log(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v / N)])));
