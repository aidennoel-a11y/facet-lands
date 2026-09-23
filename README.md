# Facet Lands

A low-poly, procedurally generated world built with [three.js](https://threejs.org).
The ground is made entirely of flat-shaded triangles, colored by height
(sea bed → beach sand → meadow → deep grass → scrub → violet-grey rock → snow caps on
the highest peaks), with steep faces turning to rock. Seas and lakes fill the low
ground, forests of pines, broadleaf trees and bushes cover the land, and grass tufts
sway around your feet. A sun and moon cross the sky in a day/night cycle and cast
shadows on everything, including your own when you walk. The world streams in as
chunks around the camera, so it never ends.

## Run it

```bash
npm install
npm run dev      # opens a local dev server (http://localhost:5173)
npm run build    # production build in dist/
```

### Controls

Tick **Fly** (or press `V`) to switch between flying and walking.

| Input | Flying | Walking |
| --- | --- | --- |
| Drag (mouse / touch) | Look around | Look around |
| `W` `A` `S` `D` / arrows | Fly where you look | Walk |
| `Space` | Up | Jump |
| `Ctrl` / `Q` | Down | – |
| `Shift` | Fly faster | Sprint |
| Mouse wheel | Change cruising speed | – |
| `F` | Auto-move forward | Auto-move forward |
| `G` | Show the triangles (wireframe) | same |
| `T` | Pause / resume the day cycle | same |
| `H` | Shadows on / off (for slower computers) | same |

Walking has gravity, stops you at slopes too steep to climb, blocks you at tree
trunks (bushes you can walk through), and makes you swim in deep water.

**Time of day:** drag the Time slider to any hour, or jump straight to Dawn, Noon,
Dusk or Night. Untick **Day cycle** (`T`) to hold that time while you look around.
A full day lasts `dayLengthMinutes` (8 by default) in `config.js`.

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
    trees.js                low-poly tree models (pine, broadleaf, bush, dead pine)
    layers/
      WaterLayer.js         per-chunk water sheet, colored by depth, animated waves
      TreeLayer.js          scatters instanced trees (and their leaf triangles) over nearby chunks
      GrassLayer.js         grass tufts around the player, tinted to match the ground
  render/
    DayNight.js             sky dome shader (sun, moon, stars), lights, fog, moving shadow box
    wind.js                 vertex-shader sway shared by trees and grass
  player/PlayerBody.js      invisible walking body that casts your shadow
  controls/PlayerControls.js  fly and walk modes: gravity, slopes, trunks, swimming
  ui/Minimap.js             hill-shaded top-down map
```

**Terrain shape** (`TerrainGenerator.getHeight`): a broad "continent" noise sets
the general rise and fall and dips into seas; a low-frequency mask decides where
mountain ranges are, and inside them ridged noise makes sharp crests; elsewhere
gentle hills are flattened further by a "flatness" noise to leave open plains, and
a lake noise scoops basins out of the lowlands.

**Snow** (`biomes.js`): faces above the biome's `snowLine` (138 m) turn white unless
they are near-vertical cliffs. The line is blurred by noise so the caps look natural.

**Water** (`layers/WaterLayer.js`): every chunk that dips below `seaLevel` gets a
jittered triangle sheet. Each face is colored by the depth of the ground under it,
from see-through turquoise at the shore to deep blue, and a vertex shader rolls
small waves across it by world position so they flow over chunk borders.

**Trees** (`layers/TreeLayer.js`): candidate spots sit on a jittered world grid
(`treeSpacing`), so a tree is always in the same place. A forest-density noise
makes woods and clearings; spots under water or too steep are skipped; the biome's
`trees` list picks a species that suits the height (broadleaf low, pines higher,
the odd dead pine near the tree line). Trees stand on the actual triangle surface,
using `groundHeightAt` from the mesher, and each species in a chunk is one
`InstancedMesh`, plus one for its semi-transparent leaf triangles floating around
the crown. `treeScale` sets their overall size. Only chunks up to `treeMaxLod` get
trees.

**Triangles** (`ChunkMesher`): each chunk is a grid of cells, two triangles per
cell. Vertices are nudged randomly (but deterministically) so the mesh doesn't
look like a grid, and each cell's diagonal is flipped at random. Every triangle
has its own vertices, so each face gets one normal and one color: the faceted look.

**Sky, sun and shadows** (`render/DayNight.js`): one number, the hour, drives
everything. The sun circles east → south → west on a tilted path; the sky shader
draws the gradient, a warm glow around the sun at sunrise and sunset, the sun and
moon discs and stars at night. Fog takes the horizon colour so the distance always
blends into the sky. A single directional light plays the sun by day and the moon
by night and casts shadows; its shadow box (`shadowExtent`, `shadowMapSize`) follows
the camera and snaps to whole shadow-map texels so shadows don't shimmer.

**Your shadow** (`player/PlayerBody.js`): in walk mode a simple blocky body stands
where you are. Its material draws nothing on screen but it still renders into the
shadow map, so looking down you see your shadow walk, swing its arms and jump.

**Wind** (`render/wind.js`): trees and grass bend in the vertex shader, more the
higher up a vertex is, with a phase that varies by position so gusts ripple across
the land. Shadow depth materials use the same code so shadows sway too.

**Grass** (`layers/GrassLayer.js`): tufts of single-triangle blades on the chunks
right around you (`grassMaxLod`), coloured by the ground they stand on, and shrunk
away with distance (`grassFade`) so there's no visible edge.

**Chunks and LOD** (`ChunkManager`): chunks within `viewDistance` of the camera
are loaded, the rest dropped. Near chunks use 32×32 cells, farther ones 16×16 and
8×8. Building is capped at a few milliseconds per frame (nearest first, and what's
in front of the camera before what's behind), and a
chunk that changes detail level is swapped only once its new mesh is ready. Small
"skirts" hang from each chunk's edges to hide cracks between detail levels.
Fog hides the loading edge. Chunks out of view stay loaded but aren't drawn
(frustum culling), so turning around is instant.

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

### Changing trees per biome

Each biome has a `trees` entry: an overall `density` and a list of species with a
weight and a height range. A desert biome might use `density: 0.1` with only
bushes; a taiga biome only pines. New tree models go in `trees.js`.

### More things per chunk: layers

Water and trees are both chunk layers, and anything else (rocks, grass, houses)
can be one too. `build(context)` runs every time a chunk is built and whatever it
returns is added to that chunk and removed with it; `update(time)` runs every frame.

```js
chunks.addLayer({
  name: 'rocks',
  build({ cx, cz, lod, groundHeightAt, generator, config }) {
    // return an Object3D positioned in chunk-local coordinates, or null
  },
  dispose(object) {
    // free anything this layer created for the chunk
  },
});
```
