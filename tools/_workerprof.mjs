// The chunk worker's work for the land round a point, run here in Node
// (one worker doing it all), timed: node --cpu-prof tools/_workerprof.mjs [seed x z]
globalThis.self = { postMessage() {} };
const { WORLD } = await import('../src/config.js');
await import('../src/world/chunkWorker.js');
const [seed = 'polaris', X = '300', Z = '-200'] = process.argv.slice(2);
const C = WORLD.chunkSize, ccx = Math.floor(+X / C), ccz = Math.floor(+Z / C);
const lodFor = (d) => WORLD.lods.findIndex((l) => d <= l.maxDistance);
const jobs = [];
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) jobs.push([dx, dz]);
jobs.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
const t0 = performance.now();
let n = 0;
for (const [dx, dz] of jobs) {
  const lod = lodFor(Math.max(Math.abs(dx), Math.abs(dz)));
  const t = performance.now();
  self.onmessage({ data: { id: n++, seed, config: WORLD, cx: ccx + dx, cz: ccz + dz, resolution: WORLD.lods[lod].resolution, wantRocks: lod <= Math.max(WORLD.rockMaxLod, WORLD.treeMaxLod), wantTrees: lod <= WORLD.treeMaxLod, wantGrass: lod <= WORLD.grassMaxLod, wantFarGrass: lod <= (WORLD.farGrassMaxLod ?? -1), wantFarTrees: false, wantRivers: true, wantReeds: lod <= 1 } });
  if (n <= 3 || n % 8 === 0) console.log(`chunk ${n} (${dx},${dz}) lod ${lod}: ${(performance.now() - t).toFixed(0)} ms`);
}
console.log(`all ${jobs.length}: ${(performance.now() - t0).toFixed(0)} ms`);
