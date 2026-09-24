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
//          height range it is happy in (see TreeLayer).
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
        { type: 'poplar', weight: 0.35, minHeight: 5, maxHeight: 35 },
        { type: 'maple', weight: 0.15, minHeight: 8, maxHeight: 50 },
        { type: 'birch', weight: 0.6, minHeight: 12, maxHeight: 95 },
        { type: 'pine', weight: 1.2, minHeight: 20, maxHeight: 150 },
        { type: 'spruce', weight: 0.9, minHeight: 45, maxHeight: 165 },
        { type: 'bush', weight: 0.5, minHeight: 5, maxHeight: 130 },
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
      { height: 90, color: 0x5f9446 }, // pine country
      { height: 150, color: 0x6f8f4c },
      { height: 200, color: 0xa8959a }, // bare granite
      { height: 260, color: 0xb39fa0 },
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
        { type: 'birch', weight: 0.35, minHeight: 10, maxHeight: 140 }, // aspen stands
        { type: 'bush', weight: 0.3, minHeight: 5, maxHeight: 200 },
        { type: 'deadPine', weight: 0.08, minHeight: 20, maxHeight: 230 },
      ],
    },
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
