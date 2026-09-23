// Builds cave chunks off the main thread, so exploring never stutters while
// new caves are generated. It rebuilds its own copy of the world generator
// from the seed, which makes exactly the same caves as the main thread's.
import { TerrainGenerator } from '../TerrainGenerator.js';
import { buildChunkData, chunkDataBuffers } from './caveMesher.js';

let world = null; // { seed, generator }

self.onmessage = (event) => {
  const { id, seed, config, cx, cz } = event.data;
  if (!world || world.seed !== seed) world = { seed, generator: new TerrainGenerator(seed, config) };
  const data = buildChunkData(world.generator.caves.field, cx, cz, config.chunkSize);
  self.postMessage({ id, data }, chunkDataBuffers(data));
};
