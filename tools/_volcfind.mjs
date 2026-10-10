// A spot in a volcanic cavern, over its floor: node tools/_volcfind.mjs [seed]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const g = new TerrainGenerator(process.argv[2] ?? 'polaris', WORLD), f = g.caves.field;
for (let k = 0; k < 60000; k++) {
  const x = Math.round(Math.sin(k * 12.9898) * 4000), z = Math.round(Math.sin(k * 78.233) * 4000);
  if (f.volcAt(x, z) < 0.7) continue;
  const H = g.getHeight(x, z), col = f.column(x, z, H), vf = f.volcanicFloor(x, z);
  const y = vf.floor + 4;
  if (f.caves(x, y, z, H, f.regionRock(x, z), col) < -2 && f.caves(x, y + 6, z, H, f.regionRock(x, z), col) < -1) { console.log(JSON.stringify([x, z, +y.toFixed(1), +vf.lava.toFixed(1)])); break; }
}
