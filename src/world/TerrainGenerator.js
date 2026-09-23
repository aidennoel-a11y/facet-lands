import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hashSeed } from '../noise/random.js';
import { BIOMES, prepareBiome } from './biomes.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The single source of truth for "what is at world position (x, z)".
 * Chunks, the minimap and (later) trees/water all ask this object, so the
 * world stays consistent no matter who builds what, or in which order.
 */
export class TerrainGenerator {
  constructor(seed) {
    this.seed = hashSeed(seed);
    // Separate noise fields so each layer is independent of the others.
    this.continentNoise = new SimplexNoise(this.seed);
    this.mountainMaskNoise = new SimplexNoise(this.seed + 1);
    this.ridgeNoise = new SimplexNoise(this.seed + 2);
    this.hillNoise = new SimplexNoise(this.seed + 3);
    this.flatNoise = new SimplexNoise(this.seed + 4);
    this.detailNoise = new SimplexNoise(this.seed + 5);
    this.climateNoise = new SimplexNoise(this.seed + 6);

    this.biomes = Object.values(BIOMES).map(prepareBiome);
  }

  /** Terrain height in metres at a world position. */
  getHeight(x, z) {
    // Broad rise and fall of the land.
    const continent = this.continentNoise.fbm(x * 0.0004, z * 0.0004, 3);

    // Where mountain ranges live (0 = lowland, 1 = full mountains).
    const mask = smoothstep(0.08, 0.5, this.mountainMaskNoise.fbm(x * 0.0006, z * 0.0006, 3));

    // Sharp-crested ranges.
    const ridges = this.ridgeNoise.ridged(x * 0.0013, z * 0.0013, 5);
    const mountains = mask * (20 + Math.pow(ridges, 1.6) * 230);

    // Rolling hills, flattened out in plains regions.
    const flatness = smoothstep(-0.15, 0.35, this.flatNoise.fbm(x * 0.0009, z * 0.0009, 2));
    const hills = this.hillNoise.fbm(x * 0.004, z * 0.004, 3) * 14 * (1 - 0.85 * flatness) * (1 - 0.6 * mask);

    return 14 + continent * 16 + hills + mountains;
  }

  /**
   * Small noise used to make colour bands patchy rather than contour lines.
   * Returns metres to add to a face's height before picking its colour.
   */
  getColorJitter(x, z) {
    return this.detailNoise.fbm(x * 0.01, z * 0.01, 3) * 22;
  }

  /**
   * Climate values in [-1, 1]. Unused while there is a single biome, but
   * this is where temperature/moisture maps come from once there are more.
   */
  getClimate(x, z) {
    return {
      temperature: this.climateNoise.fbm(x * 0.0002, z * 0.0002, 2),
      moisture: this.climateNoise.fbm(x * 0.0002 + 500, z * 0.0002 + 500, 2),
    };
  }

  /** Biome at a world position. */
  getBiome(x, z) {
    if (this.biomes.length === 1) return this.biomes[0];
    // Example rule for when more biomes exist: pick by climate.
    const { temperature, moisture } = this.getClimate(x, z);
    const index = Math.floor(((temperature + moisture) * 0.25 + 0.5) * this.biomes.length);
    return this.biomes[Math.min(this.biomes.length - 1, Math.max(0, index))];
  }
}
