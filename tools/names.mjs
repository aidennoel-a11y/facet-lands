// The share of the world each name the biome readout shows takes (see
// TerrainGenerator.describe; the quick form, as the big map draws it),
// averaged over several worlds: `size` km squares centred on the origin,
// sampled every `step` m.   node tools/names.mjs [size km = 40] [step m = 400] seed...
// (Every seed is worked out in its own process, at once.)
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
const args = process.argv.slice(2);
if (process.env.NAMES_CHILD) {
  const { TerrainGenerator } = await import('../src/world/TerrainGenerator.js');
  const [size, step, seed] = [+args[0] * 1000, +args[1], args[2]];
  const g = new TerrainGenerator(seed, { seaLevel: 2, chunkSize: 128 });
  const n = Math.round(size / step), counts = {};
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const name = g.describe(-size / 2 + (i + 0.5) * step, -size / 2 + (j + 0.5) * step, true);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  process.send({ counts, total: n * n });
  process.exit(0);
}
const size = args[0] ?? 40, step = args[1] ?? 400;
const seeds = args.length > 2 ? args.slice(2) : ['polaris', '8pglu1', 'wi6eri', 'xpnn8c', 'd8qa9l'];
const results = await Promise.all(seeds.map((seed) => new Promise((done) => {
  const child = fork(fileURLToPath(import.meta.url), [size, step, seed], { env: { ...process.env, NAMES_CHILD: 1 } });
  child.on('message', done);
})));
const counts = {};
let total = 0;
for (const r of results) {
  total += r.total;
  for (const k in r.counts) counts[k] = (counts[k] ?? 0) + r.counts[k];
}
console.log(`${seeds.length} worlds, ${size} km square, every ${step} m\n`);
for (const k of Object.keys(counts).sort((a, b) => counts[b] - counts[a])) console.log(`${k.padEnd(24)} ${((100 * counts[k]) / total).toFixed(2).padStart(6)}%`);
