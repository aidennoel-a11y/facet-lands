# Facet Lands

A low-poly, procedurally generated world built with [three.js](https://threejs.org).
The ground is made entirely of flat-shaded triangles, colored by height
(sand → meadow → deep grass → scrub → violet-grey rock → snow), with steep faces
turning to rock. The world streams in as chunks around the camera, so it never ends.

## Run it

```bash
npm install
npm run dev      # opens a local dev server (http://localhost:5173)
npm run build    # production build in dist/
```

### Controls

| Input | Action |
| --- | --- |
| Drag (mouse / touch) | Look around |
| `W` `A` `S` `D` / arrows | Fly |
| `Space` / `E`, `Ctrl` / `Q` | Up / down |
| `Shift` | Fly faster |
| Mouse wheel | Change cruising speed |
| `F` | Toggle auto-fly |
| `G` | Show the triangles (wireframe) |

Type any seed into the panel and press **Build**, or press **Random**. The same seed
always makes the same world.

## How it works

```
src/
  config.js                 world settings: chunk size, view distance, LODs, jitter
  main.js                   scene, lights, sky, loop, HUD wiring
  noise/
    random.js               seeded PRNG + stateless integer hash
    SimplexNoise.js         seeded 2D simplex noise, fbm, ridged multifractal
  world/
    TerrainGenerator.js     height + biome at any (x, z): the one source of truth
    biomes.js               biome definitions and the face-coloring rule
    ChunkMesher.js          turns one chunk into a triangle mesh
    ChunkManager.js         loads/unloads chunks around the camera, LOD, build budget
  controls/FlyControls.js   free-fly camera that stays above the ground
  ui/Minimap.js             hill-shaded top-down map
```

**Terrain shape** (`TerrainGenerator.getHeight`): a broad "continent" noise sets
the general rise and fall; a low-frequency mask decides where mountain ranges
are, and inside them ridged noise makes sharp crests; elsewhere gentle hills are
flattened further by a "flatness" noise to leave open plains.

**Triangles** (`ChunkMesher`): each chunk is a grid of cells, two triangles per
cell. Vertices are nudged randomly (but deterministically) so the mesh doesn't
look like a grid, and each cell's diagonal is flipped at random. Every triangle
has its own vertices, so each face gets one normal and one color: the faceted look.

**Chunks and LOD** (`ChunkManager`): chunks within `viewDistance` of the camera
are loaded, the rest dropped. Near chunks use 32×32 cells, farther ones 16×16 and
8×8. Building is capped at a few milliseconds per frame (nearest first), and a
chunk that changes detail level is swapped only once its new mesh is ready. Small
"skirts" hang from each chunk's edges to hide cracks between detail levels.
Fog hides the loading edge.

## Extending it

### Biomes

`biomes.js` holds a `BIOMES` map. Add an entry with its own palette:

```js
desert: {
  id: 'desert',
  name: 'Desert',
  palette: [
    { height: -Infinity, color: 0xe3c98d },
    { height: 60, color: 0xd9a86a },
    { height: 140, color: 0xb07a52 },
  ],
  cliff: 0xa0674a,
  cliffSlope: [0.75, 0.55],
  snowLine: Infinity,
  snow: 0xffffff,
},
```

Then decide where it goes in `TerrainGenerator.getBiome()`. The generator already
has `getClimate(x, z)` (temperature and moisture noise) for exactly this. For
biomes that should also change the *shape* of the land (flat deserts, jagged
tundra), blend each biome's height function by climate weight inside `getHeight`
so borders stay smooth.

### Trees, rocks, water: chunk layers

Anything that belongs to a chunk can be added as a layer. `build()` runs every
time a chunk is built and whatever it returns is added to that chunk and removed
with it:

```js
const waterMaterial = new THREE.MeshLambertMaterial({ color: 0x4f86c6, transparent: true, opacity: 0.85 });

chunks.addLayer({
  name: 'water',
  build({ cx, cz, config }) {
    const size = config.chunkSize;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(size / 2, 0, size / 2),
      waterMaterial,
    );
    water.position.y = config.seaLevel;
    return water;
  },
  dispose(object) {
    object.geometry.dispose();
  },
});
```

A tree layer would do the same with an `InstancedMesh`: scatter points with the
seeded `hash2()`, read the ground height from `generator.getHeight(x, z)`, skip
steep or high spots, and only build it for near LODs (`lod <= 1`) to keep
distant chunks cheap.
