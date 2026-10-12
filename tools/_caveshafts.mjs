// How much of the cave air is in tall shafts (air columns more than 14 m
// high with no floor to stand on in them) against level passages.
//   node tools/_caveshafts.mjs seed x z [half] [step]
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const [seed = '8bx7a2', X = '-1400', Z = '100', half = '400', step = '8'] = process.argv.slice(2);
const g = new TerrainGenerator(seed, WORLD);
const f = g.caves.field;
let cols = 0, airCols = 0, shafts = 0, airCells = 0, shaftCells = 0;
for (let z = +Z - half; z <= +Z + +half; z += +step) for (let x = +X - half; x <= +X + +half; x += +step) {
  const H = g.getHeight(x, z), col = f.column(x, z, H), rr = f.regionRock(x, z);
  if (process.env.PASSAGES && (col.chamber || col.lush > 0.45 || col.volc > 0.45)) continue; // (passages only: not the great halls)
  cols++;
  let run = 0, any = false;
  const flush = () => { if (run * 1 > 14) (shafts++, (shaftCells += run)); run = 0; };
  for (let y = H - 8; y > f.deep - 4; y -= 1) {
    const air = f.caves(x, y, z, H, rr, col, []) < 0;
    if (air) (run++, airCells++, (any = true));
    else flush();
  }
  flush();
  if (any) airCols++;
}
console.log(`columns ${cols}, with cave ${airCols}; tall runs ${shafts} (${((100 * shafts) / Math.max(1, airCols)).toFixed(1)}% of cave columns), air in them ${((100 * shaftCells) / Math.max(1, airCells)).toFixed(1)}%`);
