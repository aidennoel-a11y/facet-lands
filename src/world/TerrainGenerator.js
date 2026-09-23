import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hashSeed } from '../noise/random.js';
import { BIOMES, prepareBiome } from './biomes.js';
import { CaveSystem } from './caves/CaveSystem.js';

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
  constructor(seed, config = { seaLevel: 2, chunkSize: 128 }) {
    this.seedText = String(seed); // as given, so a worker can rebuild the same world
    this.seed = hashSeed(seed);
    // Separate noise fields so each layer is independent of the others.
    this.continentNoise = new SimplexNoise(this.seed);
    this.mountainMaskNoise = new SimplexNoise(this.seed + 1);
    this.ridgeNoise = new SimplexNoise(this.seed + 2);
    this.hillNoise = new SimplexNoise(this.seed + 3);
    this.flatNoise = new SimplexNoise(this.seed + 4);
    this.detailNoise = new SimplexNoise(this.seed + 5);
    this.climateNoise = new SimplexNoise(this.seed + 6);
    this.lakeNoise = new SimplexNoise(this.seed + 7);
    this.forestNoise = new SimplexNoise(this.seed + 8);
    this.grassNoise = new SimplexNoise(this.seed + 9);

    this.biomes = Object.values(BIOMES).map(prepareBiome);
    this.caves = new CaveSystem(this, config);
  }

  /** Terrain height in metres at a world position. */
  getHeight(x, z) {
    // Broad rise and fall of the land.
    const continent = this.continentNoise.fbm(x * 0.0004, z * 0.0004, 3);

    // Where mountain ranges live (0 = lowland, 1 = full mountains).
    const mask = this.getMountainness(x, z);

    // Crested ranges, with the crests softened a little so peaks aren't needles.
    const ridges = this.ridgeNoise.ridged(x * 0.0012, z * 0.0012, 4, 2, 0.47, 0.012);
    const mountains = mask * (20 + Math.pow(ridges, 1.5) * 215);

    // Rolling hills, flattened out in plains regions.
    const flatness = smoothstep(-0.15, 0.35, this.flatNoise.fbm(x * 0.0009, z * 0.0009, 2));
    const hills = this.hillNoise.fbm(x * 0.004, z * 0.004, 3) * 14 * (1 - 0.85 * flatness) * (1 - 0.6 * mask);

    // Seas where the continent noise dips, and lake basins in the lowlands.
    const sea = smoothstep(-0.05, -0.45, continent) * 34;
    const lakes = smoothstep(0.35, 0.65, this.lakeNoise.fbm(x * 0.0017, z * 0.0017, 2)) * 22 * (1 - mask);

    return 14 + continent * 16 + hills + mountains - sea - lakes;
  }

  /** How mountainous an area is: 0 = lowland, 1 = in a range. Foothills lie in between. */
  getMountainness(x, z) {
    return smoothstep(0.08, 0.5, this.mountainMaskNoise.fbm(x * 0.0006, z * 0.0006, 3));
  }

  /**
   * Small noise used to make colour bands patchy rather than contour lines.
   * Returns metres to add to a face's height before picking its colour.
   */
  getColorJitter(x, z) {
    return this.detailNoise.fbm(x * 0.01, z * 0.01, 3) * 22;
  }

  /**
   * How forested a spot is, in [0, 1]: dense woods, open meadows and the
   * odd lone tree in between.
   */
  getForestDensity(x, z) {
    const n = this.forestNoise.fbm(x * 0.0028, z * 0.0028, 3);
    return 0.05 + 0.95 * smoothstep(-0.2, 0.25, n);
  }

  /** How grassy a spot is, in [0, 1]: lush meadows and thinner patches. */
  getGrassDensity(x, z) {
    return 0.35 + 0.65 * smoothstep(-0.3, 0.3, this.grassNoise.fbm(x * 0.012, z * 0.012, 2));
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
