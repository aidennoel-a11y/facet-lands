// Central place for world tuning. Units are metres.

export const WORLD = {
  seed: 'polaris',

  // Chunking
  chunkSize: 128, // world units per chunk edge
  viewDistance: 18, // radius in chunks that stays loaded around the camera (2.3 km)
  chunkBuildBudgetMs: 3.5, // max time per frame spent building chunk meshes (more is quicker to fill in, but stutters as you walk)

  // Level of detail: cells per chunk edge, picked by distance (in chunks).
  // Every level must divide the one above it so vertices line up at seams.
  lods: [
    { maxDistance: 1, resolution: 64 }, // 2 m triangles right around you; grass lives here
    { maxDistance: 3, resolution: 64 }, // 2 m, out to 384 m
    { maxDistance: 5, resolution: 32 }, // 4 m (rocks out to here, 640 m)
    { maxDistance: 8, resolution: 16 }, // 8 m, far trees (to 1 km)
    { maxDistance: 12, resolution: 8 }, // 16 m, far trees (to 1.5 km)
    { maxDistance: Infinity, resolution: 4 }, // 32 m, far trees, out to the edge of the view
  ],

  // Low-poly look
  vertexJitter: 0.35, // fraction of a cell each vertex is nudged in x/z
  // Chunks at least this detailed are "full detail": cave mouths are cut
  // into them, and they're refined along rivers and shores.
  detailResolution: 64,
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
  treeMaxLod: 1, // chunks at this LOD or closer get full trees (out to 384 m; the leaf clusters only near; simpler far ones beyond)
  treeShadowLod: 1, // and cast shadows out to this LOD (the shadows reach no further)
  farTreeMaxLod: 5, // and out to this LOD, simple far ones (see FarTreeLayer)
  farTreeDetailLod: 3, // the far ones with their character (trunk, tiers, round crowns) to here (1 km); plainer beyond
  treeScale: 1.6, // overall tree size multiplier
  leafMaxLod: 0, // leaf clusters only on chunks this close

  // Wildlife: for testing, the animals pay you no mind (no bolting or scattering).
  tameWildlife: false,

  // Caves (their mouths are cut into full-detail terrain only)
  caveMaxLod: 0, // (caves built only round you: underground the haze hides anything further)

  // Rocks: boulders up to this LOD, small stones one level closer
  rockMaxLod: 2,

  // Grass
  grassSpacing: 1.6, // metres between grass tufts
  grassMaxLod: 0,
  grassFade: [80, 125], // tufts shrink away between these distances (m)
  // And beyond them, out to the next ring of chunks, sparse, bigger clumps
  // of far grass (on the nearer chunks too, under the close grass), so the
  // grassland doesn't stop dead a hundred metres off.
  farGrassMaxLod: 1,
  farGrassSpacing: 5.5,
  farGrassFade: [230, 290],

  // Sun, moon and sky
  dayLengthMinutes: 24, // one full day/night cycle (real minutes)
  daysPerSeason: 2, // spring, summer, autumn and winter each last this many days
  startHour: 9.5,

  // Shadows follow the camera and cover a square this many metres across.
  shadowExtent: 440,
  shadowMapSize: 4096,
};
