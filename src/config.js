// Central place for world tuning. Units are metres.

export const WORLD = {
  seed: 'polaris',

  // Chunking
  chunkSize: 128, // world units per chunk edge
  viewDistance: 18, // radius in chunks that stays loaded around the camera (2.3 km)
  chunkBuildBudgetMs: 6, // max time per frame spent building chunk meshes

  // Level of detail: cells per chunk edge, picked by distance (in chunks).
  // Every level must divide the one above it so vertices line up at seams.
  lods: [
    { maxDistance: 1, resolution: 64 }, // 2 m triangles right around you; grass lives here
    { maxDistance: 3, resolution: 32 }, // 4 m
    { maxDistance: 5, resolution: 16 }, // 8 m (rocks out to here, 640 m)
    { maxDistance: 8, resolution: 16 }, // 8 m, far trees (to 1 km)
    { maxDistance: 12, resolution: 8 }, // 16 m, far trees (to 1.5 km)
    { maxDistance: Infinity, resolution: 4 }, // 32 m, far trees, out to the edge of the view
  ],

  // Low-poly look
  vertexJitter: 0.35, // fraction of a cell each vertex is nudged in x/z
  // Chunks at least this detailed are "full detail": cave mouths are cut
  // into them, and they're refined along rivers and shores.
  detailResolution: 32,
  // Far chunks (this LOD and beyond) have their ground merged into tiles of
  // this many chunks a side, one draw call a tile rather than one a chunk.
  groundMergeLod: 4,
  groundTile: 4,
  skirtDepth: 6, // hides cracks where chunks of different LOD meet (less than the rock over caves)

  // Water fills everything below this height (seas and lakes).
  seaLevel: 2,

  // Trees
  treeSpacing: 6, // metres between candidate tree spots (lower = denser)
  treeDensity: 0.92, // and the chance of a tree at each, overall
  treeMaxLod: 2, // chunks at this LOD or closer get full trees (out to 640 m; the leaf clusters only near)
  treeShadowLod: 1, // and cast shadows out to this LOD (the shadows reach no further)
  farTreeMaxLod: 5, // and out to this LOD, simple far ones (see FarTreeLayer)
  farTreeDetailLod: 4, // the far ones with their character (trunk, tiers, round crowns) to here (1.5 km); plainer beyond
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
  dayLengthMinutes: 24, // one full day/night cycle (real minutes)
  daysPerSeason: 2, // spring, summer, autumn and winter each last this many days
  startHour: 9.5,

  // Shadows follow the camera and cover a square this many metres across.
  shadowExtent: 440,
  shadowMapSize: 4096,
};
