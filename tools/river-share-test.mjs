// Rivers worked out on one thread and handed to another (as the chunk
// workers do: see ChunkManager.#shareRivers) must give exactly the land
// and water the other would have worked out itself, and quicker.
//   node tools/river-share-test.mjs [seed x z]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const [seed = 'polaris', X = '300', Z = '-200'] = process.argv.slice(2);
const pts = [];
for (let k = 0; k < 4000; k++) pts.push([+X + ((k * 7919) % 1400) - 700, +Z + ((k * 104729) % 1400) - 700]);
const sample = (g) => pts.map(([x, z]) => [g.getHeight(x, z), g.rivers.at(x, z)?.level ?? null, g.rivers.waterAt?.(x, z)?.level ?? null]);
let t = performance.now();
const a = new TerrainGenerator(seed, WORLD);
const A = sample(a);
const tA = performance.now() - t;
const delta = structuredClone(a.rivers.takeFresh()); // (as a message would carry it)
t = performance.now();
const b = new TerrainGenerator(seed, WORLD);
b.rivers.share(delta);
const B = sample(b);
const tB = performance.now() - t;
// (And one more on its own, for the world as it comes out without sharing.)
const c = new TerrainGenerator(seed, WORLD);
const C = sample(c);
let diff = 0, diffC = 0;
for (let k = 0; k < pts.length; k++) for (let j = 0; j < 3; j++) {
  diff = Math.max(diff, Math.abs((A[k][j] ?? -1e9) - (B[k][j] ?? -1e9)));
  diffC = Math.max(diffC, Math.abs((C[k][j] ?? -1e9) - (B[k][j] ?? -1e9)));
}
const size = JSON.stringify(delta).length;
const ok = diff < 1e-6 && diffC < 1e-6;
console.log(`${ok ? 'PASS' : 'FAIL'}  shared rivers give the same land and water (max apart ${diff.toExponential(1)} m, vs. its own ${diffC.toExponential(1)} m)`);
console.log(`  on its own ${tA.toFixed(0)} ms, with the rivers handed to it ${tB.toFixed(0)} ms; handed over: ${(size / 1e6).toFixed(1)} MB, ${delta.list.length} courses, ${delta.big?.finals.filter(([, v]) => v).length ?? 0} great rivers`);
