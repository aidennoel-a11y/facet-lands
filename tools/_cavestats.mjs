// Cave chunk build cost and size, old vs new: node tools/_cavestats.mjs [seed] [n]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
import { buildChunkData } from '../src/world/caves/caveMesher.js';
const [seed = 'polaris', N = '12'] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD);
const f = g.caves.field;
let ms = 0, tris = 0, worst = 0, deepChunks = 0; const kinds = {}; let water = 0, lava = 0, pools = 0; const times = [];
buildChunkData(f, 40, 40, WORLD.chunkSize); // (warm up)
for (let k = 0; k < +N; k++) {
  const cx = (k * 7) % 23 - 11, cz = Math.floor(k * 3.3) % 17 - 8;
  const t = performance.now();
  const d = buildChunkData(f, cx, cz, WORLD.chunkSize);
  const dt = performance.now() - t;
  ms += dt; times.push(dt); worst = Math.max(worst, dt);
  tris += d.rock ? d.rock.position.length / 9 : 0;
  if (d.grid && d.grid.yMin < -60) deepChunks++;
  for (let q = 0; q < d.features.length; q += 6) kinds[d.features[q]] = (kinds[d.features[q]] ?? 0) + 1;
  water += d.water ? d.water.position.length / 9 : 0; lava += d.lava ? d.lava.position.length / 9 : 0; pools += d.pools.length / 4;
}
times.sort((a, b) => a - b);
console.log({ kinds, water, lava, pools });
console.log({ chunks: +N, medianMs: Math.round(times[times.length >> 1]), avgMs: +(ms / N).toFixed(0), worstMs: +worst.toFixed(0), avgTris: Math.round(tris / N), deepChunks });
// Where are chambers near the start?
const list = [];
for (let iz = -4; iz <= 4; iz++) for (let ix = -4; ix <= 4; ix++) { const c = f.chamber(ix, iz); if (c) list.push([Math.round(c.x), Math.round(c.z), Math.round(c.y), Math.round(c.rx), Math.round(c.rz), Math.round(c.ry)]); }
console.log('chambers', list.length, list.slice(0, 6));
