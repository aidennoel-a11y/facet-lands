// Steepest height jumps in a square: node tools/_jumps.mjs seed cx cz half [step]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const [seed, cx, cz, half, step = 4] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD);
const out = [];
for (let z = +cz - half; z <= +cz + +half; z += +step) for (let x = +cx - half; x <= +cx + +half; x += +step) {
  const h = g.getHeight(x, z), hx = g.getHeight(x + +step, z), hz = g.getHeight(x, z + +step);
  const s = Math.max(Math.abs(hx - h), Math.abs(hz - h)) / step;
  out.push([s, x, z, h]);
}
out.sort((a, b) => b[0] - a[0]);
for (const [s, x, z, h] of out.slice(0, 15)) {
  const w = g.getBiomeWeights(x, z, {});
  console.log(s.toFixed(2), x, z, h.toFixed(1), Object.entries(w).filter(([, v]) => v > 0.05).map(([b, v]) => `${b}:${v.toFixed(2)}`).join(' '));
}
