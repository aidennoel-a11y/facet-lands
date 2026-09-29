// How much of the world each biome and kind of country covers, averaged
// over several worlds: `size` km squares centred on the origin, sampled
// every `step` m.   node tools/biomes.mjs [size km = 50] [step m = 500] seed...
// (QUICK=1: the biome weights only, skipping the slower kinds of country.)
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
const args = process.argv.slice(2);
const size = +(args[0] ?? 50) * 1000, step = +(args[1] ?? 500);
const seeds = args.length > 2 ? args.slice(2) : ['polaris', '8pglu1', 'wi6eri', 'xpnn8c', 'd8qa9l'];
const weights = {}, labels = {};
let n = 0;
for (const seed of seeds) {
  const g = new TerrainGenerator(seed, { seaLevel: 2, chunkSize: 128 });
  for (let z = -size / 2; z < size / 2; z += step) for (let x = -size / 2; x < size / 2; x += step) {
    const w = g.getBiomeWeights(x, z, {});
    for (const k in w) weights[k] = (weights[k] ?? 0) + w[k];
    if (!process.env.QUICK) {
      const label = g.describe(x, z, true);
      labels[label] = (labels[label] ?? 0) + 1;
    }
    n++;
  }
}
const pct = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.padEnd(20)} ${((100 * v) / n).toFixed(2)}%`).join('\n');
console.log(`Biome weights (${seeds.length} worlds, ${size / 1000} km square, every ${step} m):\n` + pct(weights));
console.log('\nKind of country (as the map names it):\n' + pct(labels));
