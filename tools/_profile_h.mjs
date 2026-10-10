// Ground height and biome weights along a line: node tools/_profile_h.mjs seed x0 z0 x1 z1 [n]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const [seed, x0, z0, x1, z1, n = 40] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD);
for (let k = 0; k <= +n; k++) {
  const t = k / n, x = +x0 + (x1 - x0) * t, z = +z0 + (z1 - z0) * t;
  const w = g.getBiomeWeights(x, z, {});
  const top = Object.entries(w).filter(([, v]) => v > 0.05).map(([b, v]) => `${b}:${v.toFixed(2)}`).join(' ');
  console.log(x.toFixed(0), z.toFixed(0), g.getHeight(x, z).toFixed(1), top);
}
