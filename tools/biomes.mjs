// How much of the world each biome covers, and how big its patches are,
// averaged over several worlds: `size` km squares centred on the origin,
// sampled every `step` m.   node tools/biomes.mjs [size km = 40] [step m = 250] seed...
// Share: the biome weights (blended borders counted fractionally).
// Patches: each sample is given its strongest biome; touching samples of
// the same biome make one patch (flood fill), if it's at least half a
// square kilometre. Patches cut by the square's
// edge count as they are, so the biggest kinds read a little small.
// (QUICK=1: shares only, no patches.)
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
const args = process.argv.slice(2);
const size = +(args[0] ?? 40) * 1000, step = +(args[1] ?? 250);
const seeds = args.length > 2 ? args.slice(2) : ['polaris', '8pglu1', 'wi6eri', 'xpnn8c', 'd8qa9l'];
const n = Math.round(size / step);
const share = {}, patches = {};
let samples = 0;
for (const seed of seeds) {
  const g = new TerrainGenerator(seed, { seaLevel: 2, chunkSize: 128 });
  const top = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const w = g.getBiomeWeights(-size / 2 + (i + 0.5) * step, -size / 2 + (j + 0.5) * step, {});
    let best = null;
    for (const k in w) {
      share[k] = (share[k] ?? 0) + w[k];
      if (!best || w[k] > w[best]) best = k;
    }
    top[j * n + i] = best;
    samples++;
  }
  if (process.env.QUICK) continue;
  const seen = new Uint8Array(n * n);
  for (let s = 0; s < n * n; s++) {
    if (seen[s]) continue;
    const kind = top[s], stack = [s];
    seen[s] = 1;
    let cells = 0;
    while (stack.length) {
      const c = stack.pop(), i = c % n, j = (c - i) / n;
      cells++;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const d = b * n + a;
        if (!seen[d] && top[d] === kind) (seen[d] = 1), stack.push(d);
      }
    }
    // (Scraps along a blended border, under half a square kilometre, aren't patches.)
    if (cells * step * step < 5e5) continue;
    (patches[kind] ??= []).push((cells * step * step) / 1e6);
  }
}
const rows = Object.entries(share).sort((a, b) => b[1] - a[1]);
console.log(`${seeds.length} worlds, ${size / 1000} km square, every ${step} m\n`);
console.log('biome          share    patches/world   average patch   largest');
for (const [k, v] of rows) {
  const p = patches[k] ?? [];
  const avg = p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0;
  const big = p.length ? Math.max(...p) : 0;
  console.log(`${k.padEnd(13)} ${((100 * v) / samples).toFixed(2).padStart(6)}%   ${(p.length / seeds.length).toFixed(1).padStart(8)}      ${avg.toFixed(1).padStart(7)} km²   ${big.toFixed(0).padStart(5)} km²`);
}
