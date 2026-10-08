# Facet Lands

A low-poly, procedurally generated world built with [three.js](https://threejs.org).
The ground is made entirely of flat-shaded triangles, colored by height
(sea bed → beach sand → meadow → deep grass → scrub → violet-grey rock → snow caps on
the highest peaks), with steep faces turning to rock. Seas and lakes fill the low
ground, forests of six kinds of tree cover the land, and grass tufts sway around
your feet. Caves burrow into the hillsides; carry torches in to light them.
Low-poly clouds drift overhead, lifting over the mountains, and the wind comes and
goes. A sun and moon cross the sky in a
day/night cycle and cast shadows on everything, including your own when you walk,
and ray-marched light shafts and ambient occlusion finish the picture. The world streams in as
chunks around the camera, so it never ends.

## About the game (a summary for people and AI assistants)

**What it is.** Facet Lands is an open-world survival and exploration game
that runs in the browser (three.js, plain JavaScript, no framework). The world
is endless and made from a seed: the same seed always gives the same land. You
can fly over it to explore, or walk it and try to survive. Up to a few friends
can share a world online.

**The vibe.** Quiet, lonely and real, in a low-poly style. Everything is
flat-shaded triangles, but it behaves like the real outdoors: real biomes (the
Smoky Mountains, the Black Hills, redwoods, badlands, mangrove coasts), real
animals that act like animals, weather that comes and goes, seasons that
turn, and nights that are truly dark and frightening. It should feel like
being alone in the wild, not like an arcade game. Nothing is cartoonish: the
sounds are natural, colours are muted and earthy, and the UI is small and
calm. Smooth play matters: no flashing, no popping or stutter as the world
loads.

**The world**
- 14 biomes: temperate highlands, pine forest, redwood forest, birch & aspen
  parkland, Smoky Mountains, Black Hills, volcanic highlands (geysers, lava,
  hot springs), wetlands, mangrove coast, jungle, savanna, desert (with
  oases and dune seas), salt flats and badlands. Snow-capped peaks, mesas,
  sea cliffs and sea caves.
- Rivers that run downhill to the sea, lakes, waterfalls, caves to explore
  with torches, and coral and kelp in the sea.
- More than 30 kinds of tree, plus grass, flowers, reeds, mushrooms, fallen
  logs and boulders. Trees are drawn out to the horizon.
- Day and night with a moon that has phases. Moonless nights are pitch dark,
  and your eyes take a while to adjust. Seasons (spring to winter, with
  autumn colours and snow), and weather from clear skies through rain to
  thunderstorms, with wind and clouds.

**Living things.** Deer, elk, moose, bison, bears, wolves, coyotes, foxes,
cougars and other big cats, boar, sheep, mountain goats, rabbits, crocodiles,
monkeys, pandas, birds, ducks, fish, frogs and insects. Prey runs from you,
predators hunt at night, and crocodiles lurk in the water.

**Playing**
- Three modes: **Survival**, **Creative** (everything available) and
  **Testing** (developer tools).
- Survival tracks health, hunger, thirst and warmth. Cold, heat, falls,
  drowning and animals can kill you.
- **Death in survival is permanent.** The world's save is wiped, and that
  seed can never be played in survival again. The goal is to live as long
  as you can: the top right shows the day of this life, the season and
  your longest life. A quiet message marks a week, a month and a year
  (a year is four seasons of `daysPerSeason` days: 12 each, the last 2 the
  turn into the next, when the snow melts or the leaves turn, kind by kind;
  late in the autumn one early snow falls and melts before winter).
- You gather wood, stone, vines, hides and ore, then hunt with a spear, bow
  or crossbow, fish, farm, cook, and build: campfires, walls, gates, roofs,
  beds, chests, furnaces, rafts.
- **Progression** follows a crafting tree of four tiers. **Stone** is open
  from the start. **Camp** opens when you set down a campfire. **Iron**
  opens when you smelt an iron bar. **Steel** opens when you smelt a steel
  bar. Press Tab to see the tree. The tiers are defined in `TIERS` in
  `src/survival/items.js`.
- Worlds are saved in the browser. Online play goes through a small Node
  WebSocket server (`server/`), which shares the seed, the clock, the
  players and their edits to the world.

**How the code is laid out**
- `src/world/`: the terrain generator, biomes, rivers and caves.
  `ChunkManager` streams chunks with levels of detail, built in web workers
  (`chunkWorker.js`). The things on each chunk are drawn by layers in
  `src/world/layers/`.
- `src/survival/`: the game itself (`Game.js`), items and recipes
  (`items.js`), the HUD, inventory and building.
- `src/wildlife/`: animals, fish and insects.
- `src/render/`: day and night, weather, seasons, sound and effects.
- `src/net/`: multiplayer.
- `src/ui/`: the start menu, minimap and hotbar.
- World tuning is in `src/config.js`; quality presets are in
  `src/quality.js`.
- `tools/`: headless-browser scripts used to test and screenshot the game.

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
| `R` | Ray effects (light shafts, ambient occlusion) on / off | same |
| `N` | Night vision (for testing: lights everything, caves included) | same |
| Click / tap | Use the selected hotbar item (place a torch) | same |
| Right-click | Pick up the torch you point at | same |
| `1`–`9` | Choose a hotbar slot | same (the wheel also scrolls it while walking) |

**Hotbar and torches:** slot 1 is a torch: click the ground, a cave floor or a
wall to place one (walking you can reach 8 m, flying much further). Slot 2 picks
torches back up, as does right-clicking one. Torches are saved per seed in your
browser, so they're still there next time.

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
    trees.js                low-poly tree models and their leaf clusters
    Clouds.js               drifting low-poly clouds, solid and see-through
    layers/
      WaterLayer.js         per-chunk water sheet, colored by depth, animated waves
      TreeLayer.js          scatters instanced trees (and their leaf triangles) over nearby chunks
      GrassLayer.js         grass tufts around the player, tinted to match the ground
  render/
    DayNight.js             sky dome shader (sun, moon, stars), lights, fog, moving shadow box
    RayEffects.js           screen-space ray marching: light shafts and ambient occlusion
  world/layers/RockLayer.js rocks and boulders, thickest in the foothills
    wind.js                 vertex-shader sway shared by trees and grass
  player/PlayerBody.js      invisible walking body that casts your shadow
  world/caves/
    CaveField.js            the procedural cave field: tunnels, rooms, entrance ramps
    caveMesher.js           marching cubes + stalagmites for one chunk
    caveWorker.js           builds cave chunks on a background thread
    CaveSystem.js           cave cache, terrain cut-outs, collisions and floors
  world/layers/CaveLayer.js adds cave rock and stalagmites to nearby chunks
  items/Torches.js          placeable torches with a shared pool of point lights
  ui/Hotbar.js              the 9-slot hotbar
  controls/PlayerControls.js  fly and walk modes: gravity, slopes, trunks, swimming
  ui/Minimap.js             hill-shaded top-down map
```

**Terrain shape** (`TerrainGenerator.getHeight`): a broad "continent" noise sets
the general rise and fall and dips into seas; a low-frequency mask decides where
mountain ranges are, and inside them ridged noise (with slightly rounded crests)
makes the ridges; elsewhere
gentle hills are flattened further by a "flatness" noise to leave open plains, and
a lake noise scoops basins out of the lowlands.

**Snow** (`biomes.js`): faces above the biome's `snowLine` (125 m) turn white unless
they are near-vertical cliffs. The line is blurred by noise so the caps look natural.

**Water** (`layers/WaterLayer.js`): every chunk that dips below `seaLevel` gets a
jittered triangle sheet. Each face is colored by the depth of the ground under it,
from see-through turquoise at the shore to deep blue, and a vertex shader rolls
small waves across it by world position so they flow over chunk borders. Waves
scale with the depth under each vertex, so ponds and small lakes stay almost still
while open water rolls.

**Tree models** (`world/trees.js`): six trees plus bushes and dead pines:

| Tree | Look | Grows at |
| --- | --- | --- |
| Broadleaf | Round, lumpy five-blob crown | 6–55 m |
| Poplar | Tall, narrow column | 5–35 m |
| Autumn maple | Broad crown in orange and red (rare) | 8–50 m |
| Birch | Slim white trunk with dark marks, airy yellow-green crown | 12–75 m |
| Pine | Four drooping cone tiers | 20–110 m |
| Spruce | Six narrow, dark blue-green tiers | 45–125 m |

Crowns are overlapping blobs (or stacked cones) whose corners are pushed in and out
so no face sits on a perfect sphere, coloured per face from shaded bottom to sunlit
top. Each leafy tree also has semi-transparent leaf clusters, flat three-sided
pyramids set right into the crown's own faces (sunward faces more often), which
break up the silhouette and dapple the shade.
To add a tree, write a function returning a merged geometry in `trees.js`, add it
(and optionally its leaves) to `TREE_GEOMETRIES` / `LEAF_GEOMETRIES`, and list it
in a biome's `trees.species`.

**Trees** (`layers/TreeLayer.js`): candidate spots sit on a jittered world grid
(`treeSpacing`), so a tree is always in the same place. A forest-density noise
makes woods and clearings; spots under water or too steep are skipped; the biome's
`trees` list picks a species that suits the height (broadleaf low, pines higher,
the odd dead pine near the tree line). No tree stands perfectly straight: each
leans a little at random, and more on slopes, downhill. Trees stand on the actual triangle surface,
using `groundHeightAt` from the mesher, and each species in a chunk is one
`InstancedMesh`, plus one for its leaf clusters (only on the nearest chunks,
`leafMaxLod`). `treeScale` sets their overall size. Only chunks up to `treeMaxLod` get
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

**Caves** (`world/caves/`): caves come from a 3D field, built from noise just
like the terrain, so they go on forever and the same seed always gives the same
caves. Tunnels form wherever two 3D noise fields are both close to zero, which
traces long, branching passages that link up into networks; the coordinates are
warped by a slow 2D noise first, so the passages snake and twist. A third, slower
noise field opens big squat rooms along them. A regional mask leaves some areas
solid, and caves stay between -30 m and 55 m, always under at least 7 m of rock.

Entrances appear on hillsides and on open ground alike. Each is a winding tunnel
dug down from the surface: a chain of 8 m segments, each turning up to about 30
degrees left or right and sloping down about 25 degrees (35 at first on flat
ground), until it reaches cave air with a floor just below. Every segment must
keep a floor under it and rock over it, so you can always walk back out. At the
surface, the terrain opens a hole exactly where it sits over the tunnel, lined
with a rock rim, and the cave rock carries on below: the ground is only ever the
terrain's own triangles.

Each nearby chunk samples the field on a 3.2 m grid and turns it into faceted rock
with marching cubes, on a background worker so exploring doesn't stutter.
Stalagmites rise from floors, stalactites hang from roofs and the odd pillar
joins the two. Walking uses the same field, so floors, walls, roofs and
stalagmites are solid where you see them. Daylight fades the further you are from
an entrance (the cave shader dims sun, moon and sky light by a per-vertex
`skyLight` value) but torchlight doesn't, and underground a dark haze replaces
the sky. Cave mouths show as dark dots on the minimap.

**Rocks** (`layers/RockLayer.js`): five lumpy low-poly rock shapes in grey-violet
stone, some with moss on top, scattered everywhere but far thicker in the
foothills (where mountainous and lowland meet) and on steep ground. Boulders show
from further away and block you when walking; small stones only near you.

**Drawing only what you can see:** three.js already skips every mesh outside the
camera's view. On top of that, caves are only drawn from the surface in chunks
with a mouth (or when you're near one), and deep underground (more than 60 m from
an entrance) the terrain, trees, grass, water and clouds aren't drawn at all.

**Torches** (`items/Torches.js`): a stick with a flickering two-layer flame and a
glow. The light itself comes from a fixed pool of 6 point lights handed to the
torches nearest you each frame; the light count never changes, so placing torches
never makes the renderer recompile its shaders.

**Clouds** (`world/Clouds.js`): each cloud is a row of lumpy icosahedron puffs
with a flat base, white on top and blue-grey underneath. About a third are wispy
and see-through; the solid ones cast moving shadows and block the sun. They drift
with the wind in a square around the camera and wrap around at the edges, where
the fog hides them. Each cloud checks the ground under its footprint (and a little
ahead of it) and rises smoothly over mountains rather than passing through them. They pick up a tint from the sky, so they turn pink and orange
at sunset.

**Ray effects** (`render/RayEffects.js`): browsers don't expose ray-tracing
hardware, so the scene is drawn into an off-screen image and its depth buffer,
and a final shader marches rays through that depth buffer. Short rays around each
pixel find nearby geometry that blocks sky light (ambient occlusion: contact
shading at tree bases and in creases). A ray from each pixel towards the sun on
screen counts how much open sky lies that way, so beams of light stream between
clouds, trunks and peaks. Toggle with `R`.

**Wind** (`render/wind.js`): trees and grass bend in the vertex shader, more the
higher up a vertex is, with a phase that varies by position so gusts ripple across
the land. The wind's strength wanders slowly between still spells and gusty
spells (shown in the panel), and clouds and water waves follow it too. Shadow depth materials use the same code so shadows sway too.

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
