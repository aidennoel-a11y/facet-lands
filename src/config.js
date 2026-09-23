// Central place for world tuning. Units are metres.

export const WORLD = {
  seed: 'polaris',

  // Chunking
  chunkSize: 128, // world units per chunk edge
  viewDistance: 9, // radius in chunks that stays loaded around the camera
  chunkBuildBudgetMs: 6, // max time per frame spent building chunk meshes

  // Level of detail: cells per chunk edge, picked by distance (in chunks).
  // Every level must divide the one above it so vertices line up at seams.
  lods: [
    { maxDistance: 2, resolution: 32 }, // 4 m triangles near the camera
    { maxDistance: 5, resolution: 16 },
    { maxDistance: Infinity, resolution: 8 },
  ],

  // Low-poly look
  vertexJitter: 0.35, // fraction of a cell each vertex is nudged in x/z
  skirtDepth: 30, // hides cracks where chunks of different LOD meet

  // Water fills everything below this height (seas and lakes).
  seaLevel: 2,

  // Trees
  treeSpacing: 6, // metres between candidate tree spots (lower = denser)
  treeMaxLod: 1, // only chunks at this LOD or closer get trees
};
