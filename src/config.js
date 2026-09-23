// Central place for world tuning. Units are metres.

export const WORLD = {
  seed: 'polaris',

  // Chunking
  chunkSize: 128, // world units per chunk edge
  viewDistance: 9, // radius in chunks that stays loaded around the camera
  chunkBuildBudgetMs: 6, // max time per frame spent building chunk meshes

  // Level of detail: cells per chunk edge, picked by distance (in chunks).
  // Every level must divide the one above it so vertices line up at seams.
  // The first two share a resolution; level 0 only exists so layers such as
  // grass can be limited to the chunks right around the player.
  lods: [
    { maxDistance: 1, resolution: 32 }, // 4 m triangles; grass lives here
    { maxDistance: 2, resolution: 32 },
    { maxDistance: 5, resolution: 16 },
    { maxDistance: Infinity, resolution: 8 },
  ],

  // Low-poly look
  vertexJitter: 0.35, // fraction of a cell each vertex is nudged in x/z
  skirtDepth: 6, // hides cracks where chunks of different LOD meet (less than the rock over caves)

  // Water fills everything below this height (seas and lakes).
  seaLevel: 2,

  // Trees
  treeSpacing: 6, // metres between candidate tree spots (lower = denser)
  treeMaxLod: 2, // only chunks at this LOD or closer get trees
  treeScale: 1.6, // overall tree size multiplier
  leafMaxLod: 0, // leaf clusters only on chunks this close

  // Caves (their mouths are cut into full-detail terrain only)
  caveMaxLod: 1,

  // Rocks: boulders up to this LOD, small stones one level closer
  rockMaxLod: 2,

  // Grass
  grassSpacing: 1.6, // metres between grass tufts
  grassMaxLod: 0,
  grassFade: [70, 115], // tufts shrink away between these distances (m)

  // Sun, moon and sky
  dayLengthMinutes: 8, // one full day/night cycle
  startHour: 9.5,

  // Shadows follow the camera and cover a square this many metres across.
  shadowExtent: 360,
  shadowMapSize: 4096,
};
