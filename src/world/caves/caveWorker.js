// Builds cave chunks off the main thread, so exploring never stutters while
// new caves are generated. It rebuilds its own copy of the world generator
// from the seed, which makes exactly the same caves as the main thread's.
import { TerrainGenerator } from '../TerrainGenerator.js';
import { buildChunkData, chunkDataBuffers } from './caveMesher.js';

let world = null; // { seed, generator }

self.onmessage = (event) => {
  const { id, kind, seed, config, cx, cz } = event.data;
  if (!world || world.seed !== seed) world = { seed, generator: new TerrainGenerator(seed, config) };
  // (The rivers the land's workers have worked out: taken in, so they needn't
  // be worked out again here before a cave can be. See ChunkManager.#shareRivers.)
  if (kind === 'rivers') return world.generator.rivers.share(event.data.delta);
  // (A world starting: made ready, with a cave by where you are, ahead of
  // the first you come to, rather than then.)
  if (kind === 'warm') {
    buildChunkData(world.generator.caves.field, cx, cz, config.chunkSize);
    handOn();
    return void self.postMessage({ id, warmed: true });
  }
  const data = buildChunkData(world.generator.caves.field, cx, cz, config.chunkSize);
  self.postMessage({ id, data }, chunkDataBuffers(data));
  handOn();
};

// (What this one has worked out of the lie of the land, the rivers and the
// natural openings: handed on, for the other cave builders and the land's
// builders not to work out again. See CaveSystem and ChunkManager.#shareRivers.)
function handOn() {
  const delta = world.generator.rivers?.takeFresh?.();
  if (delta) self.postMessage({ kind: 'rivers', seed: world.seed, delta });
};
