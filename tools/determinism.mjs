// Checks the world comes out the same whichever order it's asked about in
// (as the chunk workers each do in their own order): two generators, the
// first asked about spots far off first, the second straight about the
// test points; heights, water and biomes compared at every test point.
//   node tools/determinism.mjs [seed] [x] [z]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
const [seed = 'polaris', cx = 0, cz = 0] = process.argv.slice(2);
const cfg = { seaLevel: 2, chunkSize: 128 };
const a = new TerrainGenerator(seed, cfg), b = new TerrainGenerator(seed, cfg);
for (const [dx, dz] of [[20000, 0], [-15000, 12000], [0, -18000]]) a.getHeight(+cx + dx, +cz + dz); // (warm up elsewhere first)
const pts = [];
for (let k = 0; k < 60; k++) pts.push([+cx + Math.cos(k * 2.4) * k * 90, +cz + Math.sin(k * 2.4) * k * 90]);
let bad = 0;
for (const [x, z] of pts.slice().reverse()) b.getHeight(x, z);
for (const [x, z] of pts) {
  const ha = a.getHeight(x, z), hb = b.getHeight(x, z);
  const wa = a.rivers.waterAt(x, z, 0)?.level ?? null, wb = b.rivers.waterAt(x, z, 0)?.level ?? null;
  const ba = a.describe(x, z, true), bb = b.describe(x, z, true);
  if (Math.abs(ha - hb) > 1e-6 || wa !== wb || ba !== bb) {
    bad++;
    if (bad <= 10) console.log('DIFF at', x | 0, z | 0, { ha: ha.toFixed(3), hb: hb.toFixed(3), wa, wb, ba, bb });
  }
}
console.log(bad ? `${bad} of ${pts.length} points differ` : `all ${pts.length} points agree`);
process.exit(bad ? 1 : 0);
