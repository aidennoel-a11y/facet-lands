import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hashSeed } from '../noise/random.js';
import { BIOME_IDS, BIOMES, blendedFaceColor, prepareBiome } from './biomes.js';
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

    this.aridityNoise = new SimplexNoise(this.seed + 10);
    this.hillRegionNoise = new SimplexNoise(this.seed + 11);
    this.duneNoise = new SimplexNoise(this.seed + 12);

    this.biomes = Object.fromEntries(BIOME_IDS.map((id) => [id, prepareBiome(BIOMES[id])]));
    this._weights = { temperate: 1, savanna: 0, desert: 0 };
    this.caves = new CaveSystem(this, config);
  }

  /**
   * How dry the climate is at (x, z), 0 (wet) to 1 (arid). Changes over
   * kilometres, warped so the biome borders wander rather than run straight.
   */
  getAridity(x, z) {
    const wx = x + this.aridityNoise.noise2D(x * 0.0005 + 31, z * 0.0005 - 17) * 350;
    const wz = z + this.aridityNoise.noise2D(x * 0.0005 - 53, z * 0.0005 + 71) * 350;
    const n = this.aridityNoise.fbm(wx * 0.00016, wz * 0.00016, 3);
    return Math.min(1, Math.max(0, 0.43 + n * 1.3));
  }

  /**
   * How much each biome holds at (x, z), summing to 1: temperate (plains
   * and forest) where it's wet, then savanna, then desert where it's driest.
   * Because they follow one climate value in that order, a desert can only
   * border savanna; near a border both count, and everything blends.
   * Pass `out` to reuse an object.
   */
  getBiomeWeights(x, z, out = {}) {
    const a = this.getAridity(x, z);
    const temperate = 1 - smoothstep(0.3, 0.42, a);
    const desert = smoothstep(0.62, 0.74, a);
    out.temperate = temperate;
    out.savanna = Math.max(0, 1 - temperate - desert);
    out.desert = desert;
    return out;
  }

  /** Terrain height in metres at a world position. */
  getHeight(x, z) {
    const w = this.getBiomeWeights(x, z, this._weights);

    // Mountain ranges: wide, well apart, only in the plains and savanna. The
    // land first builds up into broad foothills (`mask`), and the crested
    // peaks rise only from the heart of the range (`core`).
    const range = this.#rangeNoise(x, z);
    const dry = (1 - w.desert) ** 3;
    const mask = smoothstep(0.08, 0.56, range) * dry;
    let mountains = 0;
    if (mask > 0) {
      const core = smoothstep(0.3, 0.68, range) * dry;
      const ridges = core > 0 ? this.ridgeNoise.ridged(x * 0.0008, z * 0.0008, 4, 2, 0.47, 0.012) : 0;
      mountains = Math.pow(mask, 1.5) * 48 + core * Math.pow(ridges, 1.6) * 190;
    }

    // Broad rise and fall of the land, lifted in dry country so seas
    // rarely reach a desert, and around mountain ranges so they don't
    // drop straight into the sea.
    const continent = this.continentNoise.fbm(x * 0.0004, z * 0.0004, 3) + 0.34 * w.desert + 0.1 * w.savanna + 0.5 * mask;

    // Rolling hills in the plains (bigger in some regions than others),
    // lower swells in the savanna, dunes in the desert.
    const hilly = smoothstep(-0.25, 0.35, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
    const rolling = this.hillNoise.fbm(x * 0.0024, z * 0.0024, 3) * (5 + 17 * hilly) + this.flatNoise.fbm(x * 0.006, z * 0.006, 2) * 2.5;
    const hills = rolling * (w.temperate + 0.45 * w.savanna) * (1 - 0.6 * mask);
    let dunes = 0;
    if (w.desert > 0) {
      const crest = this.duneNoise.ridged(x * 0.0045 + z * 0.0015, z * 0.0075, 2, 2, 0.5, 0.02);
      dunes = w.desert * (crest * 8 + this.duneNoise.fbm(x * 0.0012 + 50, z * 0.0012, 2) * 7);
    }

    // Seas where the continent noise dips, and lake basins in the green lowlands.
    const sea = smoothstep(-0.05, -0.45, continent) * 34;
    const lakes = smoothstep(0.35, 0.65, this.lakeNoise.fbm(x * 0.0017, z * 0.0017, 2)) * 22 * (1 - smoothstep(0, 0.4, mask)) * (1 - w.desert) * (1 - 0.6 * w.savanna);

    return 14 + continent * 16 + hills + dunes + mountains - sea - lakes;
  }

  /** Where mountain ranges lie: a smooth, slow noise (ranges where it's high). */
  #rangeNoise(x, z) {
    return this.mountainMaskNoise.fbm(x * 0.00026, z * 0.00026, 2);
  }

  /** How mountainous an area is: 0 = lowland, 1 = in a range. Foothills lie in between. */
  getMountainness(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    return smoothstep(0.08, 0.56, this.#rangeNoise(x, z)) * (1 - w.desert) ** 3;
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

  /** The biome with the most weight at a world position. */
  getBiome(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    let best = 'temperate';
    for (const id in w) if (w[id] > w[best]) best = id;
    return this.biomes[best];
  }

  /**
   * A biome picked at random by weight (`r` in [0, 1)), so things placed
   * near a border mix naturally: trees, grass...
   */
  pickBiome(x, z, r) {
    const w = this.getBiomeWeights(x, z, {});
    for (const id in w) {
      r -= w[id];
      if (r < 0) return this.biomes[id];
    }
    return this.biomes.temperate;
  }

  /** Ground colour of a face at (x, z): blended across the biomes there. */
  surfaceColor(x, z, height, upness, out) {
    return blendedFaceColor(this.biomes, this.getBiomeWeights(x, z, {}), height, upness, out);
  }
}
