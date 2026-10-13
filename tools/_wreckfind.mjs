import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
import { wreckSite } from '../src/world/layers/WreckLayer.js';
const g = new TerrainGenerator(process.argv[2] ?? 'polaris', WORLD);
const found = [];
const t0 = Date.now();
for (let K = -8; K <= 8; K++) for (let I = -8; I <= 8; I++) { const s = wreckSite(I, K, g, WORLD.seaLevel); if (s) found.push([Math.round(s.x), Math.round(s.z), +s.y.toFixed(1)]); }
console.log(found.length, 'wrecks in 15x15 km', JSON.stringify(found.slice(0, 6)), (Date.now() - t0) + 'ms');
