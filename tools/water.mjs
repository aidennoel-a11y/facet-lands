// What water there is round a spot: the great rivers, creeks and lakes in
// an 8 km box, and how long working them out took (as each chunk worker must).
//   node tools/water.mjs <seed> <x> <z>
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
const [seed = 'polaris', x = 0, z = 0] = process.argv.slice(2);
const g = new TerrainGenerator(seed, { seaLevel: 2, chunkSize: 128 });
const t = performance.now();
const kinds = {};
for (const r of g.rivers.inBox(+x - 4000, +z - 4000, +x + 4000, +z + 4000)) {
  const k = r.big ? 'river' : r.kind;
  kinds[k] = (kinds[k] || 0) + 1;
}
console.log(kinds, ((performance.now() - t) / 1000).toFixed(1) + 's');
