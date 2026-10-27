import { Color } from 'three';

// A biome decides how the ground looks and what grows on it. Which biome
// is where comes from TerrainGenerator.getBiomeWeights(): a slow climate
// field running wet -> dry picks temperate plains and forest, then savanna,
// then desert, so a desert only ever borders savanna. Near a border both
// biomes count, and colours, grass and trees blend between them.
//
// palette: colour stops by absolute height in metres. Faces between two
// stops blend between them. Colours are sRGB hex, converted once at load.
// cliff:   colour steep faces lean towards, whatever their height.
// snowLine / snow: above snowLine, all but the sheerest faces turn to snow.
// trees:   what grows here. density scales the whole forest (clumped by the
//          forest noise when `clumped`); each species has a weight and a
//          height range it is happy in (see TreeLayer). `grove` species
//          take over where the grove noise says (birch woods, aspen stands).
// grass:   how much grass grows (0..1).

export const BIOMES = {
  temperate: {
    id: 'temperate',
    name: 'Temperate highlands',
    palette: [
      { height: -Infinity, color: 0x7d8466 }, // deep lake / sea bed
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xd8c690 }, // beach sand
      { height: 5, color: 0xd8c690 },
      { height: 8, color: 0xa6c96a }, // meadow
      { height: 30, color: 0x86b858 },
      { height: 60, color: 0x5f9a45 }, // deep grass
      { height: 95, color: 0x7f9a52 }, // upland scrub
      { height: 122, color: 0x8e9868 }, // alpine meadow
      { height: 148, color: 0x9391a1 }, // bare rock (violet-grey, Polaris style)
      { height: 210, color: 0x838198 },
    ],
    cliff: 0x908a9e,
    cliffSlope: [0.72, 0.5], // normal.y where cliff blending starts / is full
    snowLine: 185, // peaks above this get snow caps
    snow: 0xf1f4f7,
    grass: 1,
    trees: {
      density: 1,
      clumped: true,
      species: [
        { type: 'broadleaf', weight: 1, minHeight: 6, maxHeight: 55 },
        { type: 'oak', weight: 0.5, minHeight: 5, maxHeight: 70 },
        { type: 'poplar', weight: 0.35, minHeight: 5, maxHeight: 35 },
        { type: 'maple', weight: 0.15, minHeight: 8, maxHeight: 50 },
        // (Birches mostly out in the parkland: see that biome.)
        { type: 'birch', weight: 0.15, minHeight: 6, maxHeight: 110 },
        { type: 'silverBirch', weight: 0.06, minHeight: 6, maxHeight: 90 },
        { type: 'pine', weight: 1.2, minHeight: 20, maxHeight: 150 },
        { type: 'spruce', weight: 0.9, minHeight: 45, maxHeight: 165 },
        { type: 'larch', weight: 0.4, minHeight: 60, maxHeight: 165 },
        { type: 'bush', weight: 0.5, minHeight: 5, maxHeight: 130 },
        { type: 'raspberryBush', weight: 0.22, minHeight: 5, maxHeight: 110 },
        { type: 'appleTree', weight: 0.15, minHeight: 5, maxHeight: 70 }, // (now and then, among the others)
        { type: 'deadPine', weight: 0.06, minHeight: 30, maxHeight: 160 },
      ],
    },
  },

  savanna: {
    id: 'savanna',
    name: 'Savanna',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xdcc58c }, // beach sand
      { height: 5, color: 0xdcc58c },
      { height: 8, color: 0xcdbd6c }, // dry golden grass
      { height: 30, color: 0xc2b05e },
      { height: 60, color: 0xaaa458 }, // greener where it's higher
      { height: 95, color: 0x9f956a }, // scrub
      { height: 122, color: 0x9c9670 }, // high grassland
      { height: 148, color: 0x9a8f98 }, // bare rock, warmer
      { height: 210, color: 0x8a8394 },
    ],
    cliff: 0x9a8a8e,
    cliffSlope: [0.72, 0.5],
    snowLine: 185,
    snow: 0xf1f4f7,
    grass: 0.75,
    trees: {
      density: 0.3,
      clumped: true,
      species: [
        { type: 'acacia', weight: 1, minHeight: 5, maxHeight: 140 },
        { type: 'baobab', weight: 0.14, minHeight: 5, maxHeight: 90 },
        { type: 'dryBush', weight: 0.8, minHeight: 5, maxHeight: 140 },
        { type: 'broadleaf', weight: 0.08, minHeight: 6, maxHeight: 60 },
      ],
    },
  },

  // Black Hills country: rounded granite domes and needles under dark
  // ponderosa pine forest, meadows between; no snow.
  blackHills: {
    id: 'blackHills',
    name: 'Black Hills',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xd8c690 },
      { height: 5, color: 0xd8c690 },
      { height: 8, color: 0x9cc063 }, // meadow
      { height: 40, color: 0x7aa84f },
      { height: 70, color: 0x5f9446 }, // pine country
      { height: 110, color: 0x6f8f4c },
      { height: 140, color: 0xa8959a }, // bare granite
      { height: 200, color: 0xb39fa0 },
    ],
    cliff: 0xb09c9c, // pinkish-grey granite
    cliffSlope: [0.7, 0.48],
    snowLine: 999,
    snow: 0xf1f4f7,
    grass: 0.9,
    trees: {
      density: 1.15,
      clumped: true,
      species: [
        { type: 'pine', weight: 2.4, minHeight: 8, maxHeight: 230 }, // ponderosa
        { type: 'spruce', weight: 0.5, minHeight: 60, maxHeight: 230 },
        { type: 'aspen', weight: 0.4, minHeight: 10, maxHeight: 160, grove: true }, // aspen stands
        { type: 'oak', weight: 0.2, minHeight: 5, maxHeight: 90 }, // bur oak, low down
        { type: 'bush', weight: 0.3, minHeight: 5, maxHeight: 200 },
        { type: 'blueberryBush', weight: 0.2, minHeight: 20, maxHeight: 200 },
        { type: 'deadPine', weight: 0.08, minHeight: 20, maxHeight: 230 },
      ],
    },
  },

  // The Smoky Mountains: old worn-down mountains, rounded ridge after ridge
  // under deep mixed forest (oak, maple, tulip poplar, hemlock and pine,
  // spruce on the high crests), laurel thickets below; blue haze.
  smoky: {
    id: 'smoky',
    name: 'Smoky Mountains',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xc9b98a },
      { height: 5, color: 0x9fb068 },
      { height: 8, color: 0x7aa84f },
      { height: 40, color: 0x5f9446 }, // forest floor
      { height: 90, color: 0x557f3e },
      { height: 140, color: 0x5d7a44 },
      { height: 170, color: 0x6f8a4c }, // grassy balds on the high tops, not bare rock
      { height: 220, color: 0x7f9154 },
    ],
    cliff: 0x77805e, // (steep slopes are scrubby ground, rock only in the steepest)
    cliffSlope: [0.6, 0.38],
    snowLine: 9999, // (never snow-capped: they're not that high, and green to the top)
    snow: 0xf1f4f7,
    grass: 0.6,
    trees: {
      density: 1.125, // (a tenth fewer than they were)
      clumped: false,
      species: [
        { type: 'broadleaf', weight: 1, minHeight: -99, maxHeight: 150 },
        { type: 'oak', weight: 0.7, minHeight: -99, maxHeight: 140 },
        { type: 'maple', weight: 0.6, minHeight: -99, maxHeight: 150 },
        { type: 'poplar', weight: 0.45, minHeight: -99, maxHeight: 110 },
        { type: 'birch', weight: 0.2, minHeight: 40, maxHeight: 999 },
        { type: 'pine', weight: 0.6, minHeight: -99, maxHeight: 999 },
        { type: 'spruce', weight: 0.5, minHeight: 95, maxHeight: 999 },
        { type: 'bush', weight: 0.5, minHeight: -99, maxHeight: 180 },
        { type: 'raspberryBush', weight: 0.25, minHeight: -99, maxHeight: 120 },
        { type: 'blueberryBush', weight: 0.2, minHeight: 60, maxHeight: 999 },
        { type: 'appleTree', weight: 0.12, minHeight: -99, maxHeight: 80 },
      ],
    },
  },

  // Volcanic highlands: dark basalt and cinders, black sand where they
  // meet the sea, thin grass and scattered hardy pines.
  volcanic: {
    id: 'volcanic',
    name: 'Volcanic highlands',
    palette: [
      { height: -Infinity, color: 0x3a3a38 },
      { height: -14, color: 0x3f3d3b },
      { height: 0, color: 0x363333 }, // black sand
      { height: 5, color: 0x3b3837 },
      { height: 8, color: 0x55603f }, // dark, mossy grass
      { height: 30, color: 0x5f6a44 },
      { height: 60, color: 0x626448 }, // thin scrub on old lava
      { height: 95, color: 0x55524c },
      { height: 130, color: 0x4a4644 }, // bare basalt and cinders
      { height: 200, color: 0x5a3f38 }, // reddish cinders up high
    ],
    cliff: 0x3b3737, // basalt
    cliffSlope: [0.62, 0.45], // (only the steep faces: the gentle ones are grass)
    snowLine: 230,
    snow: 0xeef1f4,
    grass: 0.4,
    trees: {
      density: 0.35,
      clumped: true,
      species: [
        { type: 'pine', weight: 1.4, minHeight: 6, maxHeight: 160 },
        { type: 'spruce', weight: 0.5, minHeight: 40, maxHeight: 180 },
        { type: 'larch', weight: 0.4, minHeight: 50, maxHeight: 190 },
        { type: 'treeFern', weight: 0.7, minHeight: 5, maxHeight: 110 },
        { type: 'bush', weight: 0.8, minHeight: 5, maxHeight: 150 },
        { type: 'charredSnag', weight: 0.3, minHeight: 10, maxHeight: 200 },
        { type: 'deadPine', weight: 0.15, minHeight: 10, maxHeight: 200 },
      ],
    },
  },

  // Wetlands: low marshes and swamps just above the water, pools and
  // channels everywhere, mudflats at their edges; bald cypresses hung with
  // moss standing out in the water, swamp willows on the drier hummocks,
  // dead trees drowned in the pools.
  wetland: {
    id: 'wetland',
    name: 'Wetlands',
    palette: [
      { height: -Infinity, color: 0x4a4834 },
      { height: -3, color: 0x55543a },
      { height: 1.6, color: 0x6a6341 }, // mudflats
      { height: 2.6, color: 0x667f40 }, // wet marsh grass
      { height: 5, color: 0x749448 },
      { height: 12, color: 0x7fa250 },
      { height: 30, color: 0x86b858 },
      { height: 60, color: 0x5f9a45 },
      { height: 95, color: 0x7f9a52 },
    ],
    cliff: 0x7a7258,
    cliffSlope: [0.72, 0.5],
    snowLine: 185,
    snow: 0xf1f4f7,
    grass: 1,
    trees: {
      density: 0.55,
      clumped: true,
      species: [
        { type: 'cypress', weight: 1.4, minHeight: -99, maxHeight: 60 },
        { type: 'swampWillow', weight: 1.0, minHeight: -99, maxHeight: 60 },
        { type: 'weepingWillow', weight: 0.9, minHeight: -99, maxHeight: 60 },
        { type: 'mangrove', weight: 0.8, minHeight: -99, maxHeight: 60 },
        { type: 'bush', weight: 0.6, minHeight: -99, maxHeight: 60 },
        { type: 'deadPine', weight: 0.35, minHeight: -99, maxHeight: 60 },
        { type: 'poplar', weight: 0.1, minHeight: -99, maxHeight: 60 },
      ],
    },
  },

  // Pine forest: dark, close-set conifers (pine, spruce, larch) over a floor
  // of needles, moss and the odd fern, in the hills leading up to the
  // mountains; cold winters.
  pine: {
    id: 'pine',
    name: 'Pine forest',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xc9b98a }, // shore
      { height: 5, color: 0xa7a070 },
      { height: 8, color: 0x6d7f42 }, // needles and moss
      { height: 30, color: 0x5f7a3c },
      { height: 60, color: 0x566f38 },
      { height: 95, color: 0x6a7448 },
      { height: 122, color: 0x7f8660 },
      { height: 148, color: 0x9391a1 }, // bare rock
      { height: 210, color: 0x838198 },
    ],
    cliff: 0x8a8696,
    cliffSlope: [0.72, 0.5],
    snowLine: 185,
    snow: 0xf1f4f7,
    grass: 0.35,
    trees: {
      density: 0.55, // (open enough to walk through: see the crowns' collisions)
      clumped: false,
      species: [
        { type: 'pine', weight: 1.3, minHeight: -99, maxHeight: 160 },
        { type: 'spruce', weight: 1, minHeight: -99, maxHeight: 170 },
        { type: 'larch', weight: 0.35, minHeight: 20, maxHeight: 170 },
        { type: 'deadPine', weight: 0.05, minHeight: -99, maxHeight: 170 },
        { type: 'bush', weight: 0.15, minHeight: -99, maxHeight: 130 },
        { type: 'blueberryBush', weight: 0.3, minHeight: -99, maxHeight: 150 },
      ],
    },
  },

  // Jungles: steaming lowland rainforest, a dense, dark green floor under
  // giant trees whose canopies close overhead and trail vines, with palms
  // and tree ferns beneath. Warm all year (no autumn, no snow).
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    palette: [
      { height: -Infinity, color: 0x5d6a4a },
      { height: -3, color: 0x65703f },
      { height: 0, color: 0x8d8a55 }, // muddy shore
      { height: 3, color: 0x4c7a30 },
      { height: 12, color: 0x3f7228 }, // dark, lush undergrowth
      { height: 40, color: 0x46802e },
      { height: 90, color: 0x557f38 },
    ],
    cliff: 0x5f6a4c, // mossy rock
    cliffSlope: [0.72, 0.5],
    snowLine: 999,
    snow: 0xf1f4f7,
    grass: 0.6,
    trees: {
      density: 1.5,
      clumped: false,
      species: [
        { type: 'jungleCanopy', weight: 1.8, minHeight: -99, maxHeight: 999 },
        { type: 'jungleGiant', weight: 0.55, minHeight: -99, maxHeight: 999 },
        { type: 'junglePalm', weight: 0.7, minHeight: -99, maxHeight: 999 },
        { type: 'treeFern', weight: 0.6, minHeight: -99, maxHeight: 999 },
        { type: 'mangrove', weight: 0.25, minHeight: -99, maxHeight: 999 },
        { type: 'bush', weight: 1.1, minHeight: -99, maxHeight: 999 }, // (thickets among the trunks)
      ],
    },
  },

  // Cherry blossom highlands: in some ranges, a band of lush rolling
  // foothills right at the mountains' feet, wooded with cherry trees
  // in clouds of pink blossom, maples and pines among them.
  cherry: {
    id: 'cherry',
    name: 'Cherry blossom highlands',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -10, color: 0xa99c72 },
      { height: 0, color: 0xc9b98a },
      { height: 4, color: 0x8fb45c },
      { height: 20, color: 0x78b04e }, // (lush, bright foothill grass)
      { height: 70, color: 0x68a248 },
      { height: 130, color: 0x5e9244 },
      { height: 190, color: 0x6e8a56 },
    ],
    cliff: 0x7a7a6c, // (grey granite, mossy)
    cliffSlope: [0.62, 0.42],
    snowLine: 9999,
    snow: 0xf1f4f7,
    grass: 0.95,
    trees: {
      density: 0.85,
      clumped: true,
      species: [
        { type: 'cherryBlossom', weight: 1.4, minHeight: -99, maxHeight: 999 },
        { type: 'cherryRound', weight: 1.2, minHeight: -99, maxHeight: 999 }, // (the older, rounder kind: the two together)
        { type: 'maple', weight: 0.5, minHeight: 20, maxHeight: 999 },
        { type: 'pine', weight: 0.45, minHeight: 60, maxHeight: 999 },
        { type: 'bush', weight: 0.5, minHeight: -99, maxHeight: 999 },
        { type: 'bamboo', weight: 0.15, minHeight: -99, maxHeight: 60 },
      ],
    },
  },

  // Mountain foothills jungle: the foothills all round one of the few warm
  // ranges without snowy peaks: thick with jungle trees, palms and tree
  // ferns, bamboo among them; the mountains themselves green too, with
  // more bare rock showing on their steeper faces.
  jungleFoothills: {
    id: 'jungleFoothills',
    name: 'Mountain foothills jungle',
    palette: [
      { height: -Infinity, color: 0x6d7456 },
      { height: -10, color: 0x9a9068 },
      { height: 0, color: 0xb7aa7c },
      { height: 4, color: 0x6f9a44 },
      { height: 20, color: 0x5c9a3a }, // (fern and moss under the trees)
      { height: 90, color: 0x52883a },
      { height: 180, color: 0x5a8a40 }, 
      { height: 260, color: 0x667a52 },
    ],
    cliff: 0x6e7066, // (mossed grey rock on the steepest faces)
    cliffSlope: [0.66, 0.46],
    snowLine: 9999,
    snow: 0xf1f4f7,
    grass: 0.8,
    trees: {
      density: 1.0,
      clumped: false,
      species: [
        { type: 'jungleCanopy', weight: 1.4, minHeight: -99, maxHeight: 999 },
        { type: 'jungleGiant', weight: 0.5, minHeight: -99, maxHeight: 140 },
        { type: 'bamboo', weight: 0.6, minHeight: -99, maxHeight: 999 },
        { type: 'treeFern', weight: 0.5, minHeight: -99, maxHeight: 999 },
        { type: 'junglePalm', weight: 0.35, minHeight: -99, maxHeight: 90 },
        { type: 'bush', weight: 0.5, minHeight: -99, maxHeight: 999 },
      ],
    },
  },

  // Jungle mountains: the mountains of a jungle range, rising out of its
  // foothills jungle: green right up to their tops, moss and ferns over
  // them, grey rock showing on every steeper face; thick jungle up their
  // lower slopes, thinning out only high up to tree ferns and scrub.
  jungleMountains: {
    id: 'jungleMountains',
    name: 'Jungle mountains',
    palette: [
      { height: -Infinity, color: 0x6d7456 },
      { height: 0, color: 0xb7aa7c },
      { height: 4, color: 0x6f9a44 },
      { height: 40, color: 0x5c9a3a },
      { height: 75, color: 0x6e7a40 }, // (bare red-brown earth showing through the green, in bands)
      { height: 100, color: 0x4f8a36 },
      { height: 125, color: 0x7a6a48 },
      { height: 145, color: 0x56883a },
      { height: 170, color: 0x76684a },
      { height: 240, color: 0x5e7a48 },
    ],
    cliff: 0x6c6e66,
    cliffSlope: [0.78, 0.55],
    snowLine: 9999,
    snow: 0xf1f4f7,
    grass: 0.8,
    trees: {
      density: 1.0, // (as thick as a jungle's on the lower slopes: see placeTrees, the tree line high up)
      clumped: false,
      species: [
        { type: 'jungleCanopy', weight: 1.6, minHeight: -99, maxHeight: 200 },
        { type: 'jungleGiant', weight: 0.6, minHeight: -99, maxHeight: 130 },
        { type: 'treeFern', weight: 0.8, minHeight: -99, maxHeight: 999 },
        { type: 'junglePalm', weight: 0.3, minHeight: -99, maxHeight: 120 },
        { type: 'bamboo', weight: 0.25, minHeight: -99, maxHeight: 150 },
        { type: 'bush', weight: 0.6, minHeight: -99, maxHeight: 999 },
      ],
    },
  },

  // Bamboo forest: now and then by a jungle's edge, or by a jungle range's
  // foothills: tall canes standing each on its own, a few broadleaf trees and bushes among them.
  bamboo: {
    id: 'bamboo',
    name: 'Bamboo forest',
    palette: [
      { height: -Infinity, color: 0x6d7456 },
      { height: -10, color: 0x9a9068 },
      { height: 0, color: 0xb7aa7c },
      { height: 4, color: 0x6f9a44 },
      { height: 20, color: 0x5c9a3a },
      { height: 90, color: 0x52883a },
      { height: 180, color: 0x5c7c42 },
    ],
    cliff: 0x6a6e58,
    cliffSlope: [0.66, 0.46],
    snowLine: 9999,
    snow: 0xf1f4f7,
    grass: 0.7,
    trees: {
      density: 1.0,
      clumped: false,
      species: [
        { type: 'bamboo', weight: 3.2, minHeight: -99, maxHeight: 999 },
        { type: 'broadleaf', weight: 0.25, minHeight: -99, maxHeight: 999 },
        { type: 'bush', weight: 0.4, minHeight: -99, maxHeight: 999 },
      ],
    },
  },

  // Birch and aspen parkland: open, tall, golden-green grassland with
  // white-trunked groves of birch and aspen scattered over it, between the
  // plains and the forests.
  parkland: {
    id: 'parkland',
    name: 'Birch & aspen parkland',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xd8c690 },
      { height: 5, color: 0xd8c690 },
      { height: 8, color: 0xb4c96a }, // tall pale grass
      { height: 30, color: 0xa3c060 },
      { height: 60, color: 0x93b457 },
      { height: 95, color: 0x8fa35a },
      { height: 122, color: 0x8e9868 },
      { height: 148, color: 0x9391a1 },
      { height: 210, color: 0x838198 },
    ],
    cliff: 0x908a9e,
    cliffSlope: [0.72, 0.5],
    snowLine: 185,
    snow: 0xf1f4f7,
    grass: 1,
    trees: {
      density: 0.2, // (open: groves and lone trees over the grass)
      clumped: true,
      species: [
        { type: 'birch', weight: 1, minHeight: 4, maxHeight: 140 },
        { type: 'silverBirch', weight: 0.5, minHeight: 4, maxHeight: 120 },
        { type: 'aspen', weight: 0.9, minHeight: 4, maxHeight: 150 },
        { type: 'bush', weight: 0.25, minHeight: 4, maxHeight: 130 },
        { type: 'raspberryBush', weight: 0.12, minHeight: 4, maxHeight: 110 },
        { type: 'pine', weight: 0.08, minHeight: 20, maxHeight: 150 },
      ],
    },
  },

  // The Cascades: escarpment country, the land stepping up in tiers of
  // dark, wet, mossy cliffs, the tops green and gently rolling, ponds on
  // them spilling over the edges in falls into pools below (see
  // TerrainGenerator.cascadesRelief, and the falls: landmarkSites).
  cascades: {
    id: 'cascades',
    name: 'Cascades',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xc9b98a },
      { height: 5, color: 0x8fb562 },
      { height: 8, color: 0x6fae4c }, // lush grass
      { height: 40, color: 0x5fa244 },
      { height: 80, color: 0x5a9a42 },
      { height: 120, color: 0x6a9a4c },
      { height: 160, color: 0x7f9a5c },
      { height: 210, color: 0x838198 },
    ],
    cliff: 0x4f5250, // (dark, wet rock)
    cliffSlope: [0.62, 0.42],
    snowLine: 9999,
    snow: 0xf1f4f7,
    grass: 1,
    trees: {
      density: 0.55, // (woods here and there on the tops and below the cliffs, open grass between)
      clumped: true,
      species: [
        { type: 'broadleaf', weight: 1, minHeight: 4, maxHeight: 200 },
        { type: 'oak', weight: 0.5, minHeight: 4, maxHeight: 200 },
        { type: 'birch', weight: 0.4, minHeight: 4, maxHeight: 200 },
        { type: 'spruce', weight: 0.5, minHeight: 4, maxHeight: 200 },
        { type: 'treeFern', weight: 0.15, minHeight: 4, maxHeight: 120 },
        { type: 'bush', weight: 0.7, minHeight: 4, maxHeight: 200 },
        { type: 'raspberryBush', weight: 0.2, minHeight: 4, maxHeight: 200 },
        { type: 'blueberryBush', weight: 0.15, minHeight: 4, maxHeight: 200 },
      ],
    },
  },

  // Mangrove coast (like Florida's): flat, low shores running out into
  // warm shallows, dark mud and brackish channels, mangroves standing on
  // their stilt roots out in the water.
  mangrove: {
    id: 'mangrove',
    name: 'Mangrove coast',
    palette: [
      { height: -Infinity, color: 0x5f6448 },
      { height: -3, color: 0x6c6a48 },
      { height: 1.4, color: 0x6e6446 }, // tidal mud
      { height: 2.8, color: 0x6f8a44 }, // salt grass
      { height: 6, color: 0x7a9a4c },
      { height: 14, color: 0x86ab55 },
      { height: 40, color: 0x7fa850 },
      { height: 95, color: 0x7f9a52 },
    ],
    cliff: 0x7a7258,
    cliffSlope: [0.72, 0.5],
    snowLine: 999,
    snow: 0xf1f4f7,
    grass: 0.8,
    trees: {
      density: 0.9,
      clumped: false,
      species: [
        { type: 'mangrove', weight: 3, minHeight: -99, maxHeight: 12 },
        { type: 'junglePalm', weight: 0.35, minHeight: 2, maxHeight: 60 }, // (cabbage palms)
        { type: 'cypress', weight: 0.3, minHeight: -99, maxHeight: 30 },
        { type: 'bush', weight: 0.3, minHeight: 2, maxHeight: 60 },
        { type: 'oak', weight: 0.2, minHeight: 4, maxHeight: 60 }, // (live oaks inland)
      ],
    },
  },

  // Salt flats: the dry beds of old lakes in the heart of the deserts,
  // dead flat and white, the salt crust cracked into plates.
  saltFlat: {
    id: 'saltFlat',
    name: 'Salt flats',
    palette: [
      { height: -Infinity, color: 0xdcd6c8 },
      { height: 0, color: 0xe9e5da },
      { height: 60, color: 0xf0ede4 },
      { height: 120, color: 0xe4ddcc },
    ],
    cliff: 0xc08c66, // (the desert's sandstone round about)
    cliffSlope: [0.7, 0.45],
    snowLine: 400,
    snow: 0xf1f4f7,
    grass: 0,
    trees: null,
  },

  desert: {
    id: 'desert',
    name: 'Desert',
    palette: [
      { height: -Infinity, color: 0x8f8a6c },
      { height: -14, color: 0xb8a574 },
      { height: 0, color: 0xe6d29c },
      { height: 14, color: 0xe8cf92 }, // pale sand
      { height: 32, color: 0xe2c083 },
      { height: 55, color: 0xd6ad72 }, // deeper, redder sand
      { height: 90, color: 0xc99a6c },
    ],
    cliff: 0xc08c66, // sandstone
    cliffSlope: [0.7, 0.45],
    snowLine: 400,
    snow: 0xf1f4f7,
    grass: 0,
    trees: {
      density: 0.045,
      clumped: false,
      species: [
        { type: 'cactus', weight: 1, minHeight: -99, maxHeight: 999 },
        { type: 'smallCactus', weight: 1.3, minHeight: -99, maxHeight: 999 },
        { type: 'dryBush', weight: 0.25, minHeight: -99, maxHeight: 999 },
        { type: 'joshuaTree', weight: 0.35, minHeight: -99, maxHeight: 999 },
        { type: 'ocotillo', weight: 0.4, minHeight: -99, maxHeight: 999 },
      ],
    },
  },

  // Redwood forest: groves of giant redwoods in the heart of a pine forest
  // near a lake or the sea, their trunks soaring bare to far-off crowns,
  // the floor beneath deep in shade, rust-brown litter and ferns, mossy
  // boulders here and there among them.
  redwood: {
    id: 'redwood',
    name: 'Redwood forest',
    palette: [
      { height: -Infinity, color: 0x7d8466 },
      { height: -14, color: 0xa99c72 },
      { height: 0, color: 0xc9b98a },
      { height: 5, color: 0x8d7a58 },
      { height: 8, color: 0x6f5a3c }, // rust-brown litter
      { height: 30, color: 0x6a6038 },
      { height: 60, color: 0x5d6436 },
      { height: 95, color: 0x6a7448 },
      { height: 122, color: 0x7f8660 },
      { height: 148, color: 0x9391a1 },
      { height: 210, color: 0x838198 },
    ],
    cliff: 0x86808e,
    cliffSlope: [0.72, 0.5],
    snowLine: 185,
    snow: 0xf1f4f7,
    grass: 0.35,
    trees: {
      density: 0.31, // (giants: half as many as a pine forest's trees)
      clumped: false,
      species: [
        { type: 'redwood', weight: 1, minHeight: -99, maxHeight: 999 }, // (nothing but redwoods)
      ],
    },
  },

  // Badlands (like the Badlands of South Dakota): sharp, eroded ridges,
  // spires and buttes banded cream, buff, rose and grey, gullied all over,
  // over a floor of dry prairie grass.
  badlands: {
    id: 'badlands',
    name: 'Badlands',
    palette: [
      { height: -Infinity, color: 0x8f8a6c },
      { height: -14, color: 0xb8a574 },
      { height: 0, color: 0xd8c690 },
      { height: 6, color: 0xb9b06c }, // dry prairie grass on the floor
      { height: 40, color: 0xb5a46a },
      { height: 90, color: 0xc9b48a },
    ],
    cliff: 0xd2c2a4, // pale clay
    cliffSlope: [0.86, 0.6],
    snowLine: 400,
    snow: 0xf1f4f7,
    grass: 0.35,
    trees: {
      density: 0.02,
      clumped: false,
      species: [
        { type: 'dryBush', weight: 1, minHeight: -99, maxHeight: 999 },
        { type: 'bush', weight: 0.3, minHeight: -99, maxHeight: 999 },
      ],
    },
  },
};

export const BIOME_IDS = Object.keys(BIOMES);

/** Converts a biome definition's hex colours to linear THREE.Colors once. */
export function prepareBiome(def) {
  return {
    ...def,
    stops: def.palette.map((s) => ({ height: s.height, color: new Color(s.color) })),
    cliffColor: new Color(def.cliff),
    snowColor: new Color(def.snow),
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Colour for a single terrain face.
 * @param biome   prepared biome
 * @param height  face height in metres (already perturbed for patchiness)
 * @param upness  face normal's y component: 1 = flat, 0 = vertical
 * @param out     THREE.Color to write into
 */
export function faceColor(biome, height, upness, out) {
  const stops = biome.stops;
  let i = 1;
  while (i < stops.length && height > stops[i].height) i++;
  if (i >= stops.length) {
    out.copy(stops[stops.length - 1].color);
  } else {
    const a = stops[i - 1];
    const b = stops[i];
    const t = a.height === -Infinity ? 1 : (height - a.height) / (b.height - a.height);
    out.copy(a.color).lerp(b.color, t);
  }

  // Steep faces become rock.
  const [start, full] = biome.cliffSlope;
  const cliff = 1 - smoothstep(full, start, upness);
  if (cliff > 0) out.lerp(biome.cliffColor, cliff);

  // Snow settles on the flatter faces up high.
  const snow = smoothstep(biome.snowLine - 10, biome.snowLine + 10, height) * smoothstep(0.3, 0.5, upness);
  if (snow > 0) out.lerp(biome.snowColor, snow);

  return out;
}

const blendTmp = new Color();

/**
 * faceColor() across several biomes at once: each biome's colour, weighted
 * by `weights` (biome id -> weight, summing to 1). `biomes` maps id ->
 * prepared biome.
 */
export function blendedFaceColor(biomes, weights, height, upness, out) {
  out.setRGB(0, 0, 0);
  for (const id in weights) {
    const w = weights[id];
    if (w <= 0.001) continue;
    if (w >= 0.999) return faceColor(biomes[id], height, upness, out);
    faceColor(biomes[id], height, upness, blendTmp);
    out.r += blendTmp.r * w;
    out.g += blendTmp.g * w;
    out.b += blendTmp.b * w;
  }
  return out;
}
