import { Color } from 'three';

// A biome decides how the ground looks (and later: what grows on it).
// Right now there is one biome; add more entries here and teach
// BiomeMap.pick() when to choose them.
//
// palette: colour stops by absolute height in metres. Faces between two
// stops blend between them. Colours are sRGB hex, converted once at load.
// cliff:   colour steep faces lean towards, whatever their height.
// snowLine / snow: above snowLine, flat-enough faces turn to snow.

export const BIOMES = {
  temperate: {
    id: 'temperate',
    name: 'Temperate highlands',
    palette: [
      { height: -Infinity, color: 0xcdbb83 }, // sand
      { height: 4, color: 0xcdbb83 },
      { height: 7, color: 0xa6c96a }, // meadow
      { height: 30, color: 0x86b858 },
      { height: 60, color: 0x5f9a45 }, // deep grass
      { height: 95, color: 0x7f9a52 }, // upland scrub
      { height: 120, color: 0x9391a1 }, // bare rock (violet-grey, Polaris style)
      { height: 175, color: 0x838198 },
    ],
    cliff: 0x908a9e,
    cliffSlope: [0.72, 0.5], // normal.y where cliff blending starts / is full
    snowLine: 190,
    snow: 0xf1f4f7,
  },
};

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
  const snow = smoothstep(biome.snowLine - 12, biome.snowLine + 12, height) * smoothstep(0.55, 0.75, upness);
  if (snow > 0) out.lerp(biome.snowColor, snow);

  return out;
}
