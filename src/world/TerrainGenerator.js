import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hashSeed } from '../noise/random.js';
import { BIOME_IDS, BIOMES, blendedFaceColor, prepareBiome } from './biomes.js';
import { CaveSystem } from './caves/CaveSystem.js';
import { Rivers } from './Rivers.js';
import { Color } from 'three';

const RIVERBANK = new Color(0x9c9482);
const RIVERBED = new Color(0x6f6a5c);

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
    this.rangeSizeNoise = new SimplexNoise(this.seed + 13);
    this.spikeNoise = new SimplexNoise(this.seed + 14);
    this.bowlNoise = new SimplexNoise(this.seed + 15);
    this.ruggedNoise = new SimplexNoise(this.seed + 16);
    this._range = { value: 0, size: 1, large: 0 };

    this.biomes = Object.fromEntries(BIOME_IDS.map((id) => [id, prepareBiome(BIOMES[id])]));
    this._weights = { temperate: 1, savanna: 0, desert: 0 };
    this.rivers = new Rivers(this, config);
    this.caves = new CaveSystem(this, config);
  }

  /**
   * How dry the climate is at (x, z), 0 (wet) to 1 (arid). Changes over
   * kilometres, warped so the biome borders wander rather than run straight.
   */
  getAridity(x, z, range = this.#rangeField(x, z).value) {
    // Mountains catch the rain: around a range the land is greener, so a
    // desert gives way to savanna before it reaches the mountains, rather
    // than cutting through them.
    return Math.min(1, Math.max(0, this.#rawAridity(x, z) - 0.55 * smoothstep(-0.12, 0.4, range)));
  }

  /** The climate's dryness before mountains have their say (can exceed 1 in the driest deserts). */
  #rawAridity(x, z) {
    const wx = x + this.aridityNoise.noise2D(x * 0.0005 + 31, z * 0.0005 - 17) * 350;
    const wz = z + this.aridityNoise.noise2D(x * 0.0005 - 53, z * 0.0005 + 71) * 350;
    return 0.5 + this.aridityNoise.fbm(wx * 0.00016, wz * 0.00016, 3) * 1.3;
  }

  /**
   * How much each biome holds at (x, z), summing to 1: temperate (plains
   * and forest) where it's wet, then savanna, then desert where it's driest.
   * Because they follow one climate value in that order, a desert can only
   * border savanna; near a border both count, and everything blends.
   * Pass `out` to reuse an object.
   */
  getBiomeWeights(x, z, out = {}, range) {
    const a = this.getAridity(x, z, range);
    const temperate = 1 - smoothstep(0.3, 0.42, a);
    const desert = smoothstep(0.62, 0.74, a);
    out.temperate = temperate;
    out.savanna = Math.max(0, 1 - temperate - desert);
    out.desert = desert;
    return out;
  }

  /** Terrain height in metres at a world position (rivers carved in). */
  getHeight(x, z) {
    return this.rivers.carve(x, z, this.getBaseHeight(x, z));
  }

  /** The land before rivers are carved into it (rivers are traced over this). */
  getBaseHeight(x, z) {
    const field = this.#rangeField(x, z);
    const w = this.getBiomeWeights(x, z, this._weights, field.value);

    // Mountain ranges: well apart, from half
    // to twice the usual size (bigger ones stand taller). The land first
    // builds up into broad foothills (`mask`), and the crested peaks rise
    // only from the heart of the range (`core`). Now and then a range has
    // spiky peaks: narrower, sharper and higher. Ranges only stand in the
    // plains and savanna: they make the land around them wetter (see
    // getAridity), so deserts keep their distance.
    // In the very driest deserts even that isn't enough: there the ranges
    // fade away, slowly, over a kilometre or so.
    const { size, large } = field;
    const range = field.value - 0.9 * smoothstep(0.85, 1.25, this.#rawAridity(x, z));
    const mask = smoothstep(0.08, 0.55, range);
    let mountains = 0;
    if (mask > 0) {
      const core = smoothstep(0.3, 0.68, range);
      // Bowls and valleys cut into the range, deepest in its heart, so it's
      // not one solid massif: sheltered hollows low enough for forest,
      // between the ridges and peaks.
      const bowl = core > 0 ? smoothstep(0.02, 0.45, this.bowlNoise.fbm(x * 0.0012, z * 0.0012, 2)) * core : 0;
      if (core > 0) {
        // Broader crests on the bigger ranges.
        let ridges = this.ridgeNoise.ridged(x * 0.0008, z * 0.0008, 4, 2, 0.47, 0.012);
        if (large > 0) ridges += (this.ridgeNoise.ridged(x * 0.00052 + 91, z * 0.00052 - 37, 4, 2, 0.47, 0.012) - ridges) * large;
        const spiky = smoothstep(0.3, 0.6, this.spikeNoise.fbm(x * 0.0003, z * 0.0003, 2));
        const peaks = Math.pow(ridges, 1.6 + 1.3 * spiky) * (1 + 1.0 * spiky);
        // Knobbly shoulders and spurs, so high ground is never a flat plateau.
        const rugged = this.ruggedNoise.fbm(x * 0.0035, z * 0.0035, 2) * 18;
        mountains = core * (peaks * 205 * (0.65 + 0.5 * size) * (1 - 0.7 * bowl) + rugged);
      }
      mountains += Math.pow(mask, 1.5) * 48 * (0.75 + 0.3 * size) * (1 - 0.5 * bowl);
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

  /**
   * Where mountain ranges lie: a smooth, slow noise (ranges where it's
   * high). A still slower noise picks the scale region by region: ranges
   * half the usual size, usual, or twice it, blending between. Returns
   * { value, size (0.5..2), large (0..1, how much of the 2x scale) },
   * reusing one object.
   */
  #rangeField(x, z) {
    const t = Math.min(1, Math.max(0, 0.5 + this.rangeSizeNoise.fbm(x * 0.00007, z * 0.00007, 2) * 1.3));
    const small = 1 - smoothstep(0, 0.45, t);
    const large = smoothstep(0.55, 1, t);
    const usual = 1 - small - large;
    const f = 0.00013;
    let value = 0;
    if (small > 0) value += small * this.mountainMaskNoise.fbm(x * f * 2 + 311, z * f * 2 - 173, 2);
    if (usual > 0) value += usual * this.mountainMaskNoise.fbm(x * f, z * f, 2);
    if (large > 0) value += large * this.mountainMaskNoise.fbm(x * f * 0.5 - 517, z * f * 0.5 + 229, 2);
    const out = this._range;
    out.value = value;
    out.size = 0.5 * small + usual + 2 * large;
    out.large = large;
    return out;
  }

  /** How mountainous an area is: 0 = lowland, 1 = in a range. Foothills lie in between. */
  getMountainness(x, z) {
    return smoothstep(0.08, 0.55, this.#rangeField(x, z).value - 0.9 * smoothstep(0.85, 1.25, this.#rawAridity(x, z)));
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
    blendedFaceColor(this.biomes, this.getBiomeWeights(x, z, {}), height, upness, out);
    // Gravel along river banks, darker on the bed.
    const river = this.rivers.at(x, z, 2.5);
    if (river) {
      const t = 1 - smoothstep(river.half - 0.5, river.half + 2.5, river.d);
      out.lerp(river.d < river.half - 0.5 ? RIVERBED : RIVERBANK, t * 0.8);
    }
    return out;
  }
}
