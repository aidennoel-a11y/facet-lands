// Finds underground places to look at: a river, and caves of each kind.   node tools/_cavefind.mjs [seed]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
import { CaveField } from '../src/world/caves/CaveField.js';
import { sampleChunk, sampleGrid } from '../src/world/caves/caveMesher.js';
const grids = new Map();
const gridAt = (x, z) => { const k = `${Math.floor(x / 128)},${Math.floor(z / 128)}`; if (!grids.has(k)) grids.set(k, sampleChunk(f, Math.floor(x / 128), Math.floor(z / 128), 128)); return grids.get(k); };
const air = (x, y, z) => { const gr = gridAt(x, z); return gr && y > gr.yMin && y < gr.yMin + (gr.ny - 1) * gr.cell ? sampleGrid(gr, x, y, z) : 50; };
const g = new TerrainGenerator(process.argv[2] ?? 'polaris', WORLD), f = g.caves.field;
const found = {};
for (let k = 0; k < 40000 && Object.keys(found).length < 6; k++) {
  const x = Math.round(Math.sin(k * 12.9898) * 3000), z = Math.round(Math.sin(k * 78.233) * 3000);
  const H = g.getHeight(x, z), col = f.column(x, z, H);
  if (col.river && col.river.across < 1 && !found.river) {
    const y = col.river.level + 1.6;
    if (air(x, y, z) < -0.5 && air(x, col.river.level - 2.6, z) > 0) found.river = [x, z, +y.toFixed(1)];
  }
  if (k % 7) continue;
  const s = f.biomeScores(x, z);
  for (let y = 40; y > -110; y -= 3) {
    if (f.caves(x, y, z, H, f.regionRock(x, z), col) < -1 && f.caves(x, y - 3, z, H, f.regionRock(x, z), col) > 0 && air(x, y, z) < -1 && air(x, y + 2, z) < -0.5) {
      const kind = ['plain', 'lush', 'volcanic', 'ice', 'dry'][CaveField.biomeAt(s, y)];
      if (!found[kind]) found[kind] = [x, z, y + 1.5];
      break;
    }
  }
}
console.log(JSON.stringify(found));
