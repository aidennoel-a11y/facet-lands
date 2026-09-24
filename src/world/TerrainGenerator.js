import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, hashSeed } from '../noise/random.js';
import { BIOME_IDS, BIOMES, blendedFaceColor, prepareBiome } from './biomes.js';
import { CaveSystem } from './caves/CaveSystem.js';
import { Rivers } from './Rivers.js';
import { Color } from 'three';

const MUD = new Color(0x5f4a36);
const DIRT = new Color(0x7d6547);
const RIVERBED = new Color(0x55493b);
const ICE = new Color(0x9fcbe0); // glacier ice
const DUNE = new Color(0xe6b86e); // dune sand
const DUNE_SLIP = new Color(0xc98a4c); // a dune's steep lee side
const duneSand = new Color();
const ICY_ROCK = new Color(0x7d8ea4); // rock glazed with ice
const GRAVEL = new Color(0x8a8590);
const SHORE = {
  mud: new Color(0x5f4a36),
  dirt: new Color(0x7d6547),
  grass: new Color(0x8fbc5c),
  rock: new Color(0x8a8597),
};
// Sandstone strata on mesa walls, bottom to top, repeating.
const STRATA = [0xc4744a, 0xd89a64, 0xb05a3c, 0xe2b482, 0xa8583a, 0xcf8455].map((c) => new Color(c));
const stratum = new Color();

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
    this.roughNoise = new SimplexNoise(this.seed + 131);
    this.forestNoise = new SimplexNoise(this.seed + 8);
    this.grassNoise = new SimplexNoise(this.seed + 9);

    this.aridityNoise = new SimplexNoise(this.seed + 10);
    this.hillRegionNoise = new SimplexNoise(this.seed + 11);
    this.duneNoise = new SimplexNoise(this.seed + 12);
    this.ergNoise = new SimplexNoise(this.seed + 137);
    this.rangeSizeNoise = new SimplexNoise(this.seed + 13);
    this.spikeNoise = new SimplexNoise(this.seed + 14);
    this.bowlNoise = new SimplexNoise(this.seed + 15);
    this.ruggedNoise = new SimplexNoise(this.seed + 16);
    this.massifNoise = new SimplexNoise(this.seed + 17);
    this.hillsNoise = new SimplexNoise(this.seed + 18); // Black Hills country
    this.mesaNoise = new SimplexNoise(this.seed + 19);
    this.escarpNoise = new SimplexNoise(this.seed + 20);
    this._range = { value: 0, size: 1, large: 0 };

    this.biomes = Object.fromEntries(BIOME_IDS.map((id) => [id, prepareBiome(BIOMES[id])]));
    this._weights = { temperate: 1, savanna: 0, desert: 0, blackHills: 0 };
    this._lastWeights = { x: NaN, z: NaN, range: NaN };
    this._features = { mesa: 0, mesaTop: 0, escarp: 0, hills: 0, erg: 0 };
    this._erg = 0; // the last point's dune sea, for its roughness
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
    // Finer detail on top of the broad climate breaks biomes into smaller
    // patches (the land's shape follows only the broad climate, so it
    // stays smooth).
    const detail = this.aridityNoise.fbm(x * 0.0007 + 300, z * 0.0007 - 300, 2) * 0.3;
    return Math.min(1, Math.max(0, this.#rawAridity(x, z) + detail - 0.55 * smoothstep(-0.12, 0.4, range)));
  }

  /** The climate's dryness before mountains have their say (can exceed 1 in the driest deserts). */
  #rawAridity(x, z) {
    // Asked for several times per point: remember the last one.
    if (x === this._aridX && z === this._aridZ) return this._arid;
    this._aridX = x;
    this._aridZ = z;
    this._arid = this.#rawAridityAt(x, z);
    return this._arid;
  }

  #rawAridityAt(x, z) {
    const wx = x + this.aridityNoise.noise2D(x * 0.0008 + 31, z * 0.0008 - 17) * 260;
    const wz = z + this.aridityNoise.noise2D(x * 0.0008 - 53, z * 0.0008 + 71) * 260;
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
    if (range === undefined) range = this.#rangeField(x, z).value;
    // Asked for several times per point (height, colour, grass...): the
    // last answer is remembered.
    const m = this._lastWeights;
    if (m.x === x && m.z === z && m.range === range) {
      out.temperate = m.temperate;
      out.savanna = m.savanna;
      out.desert = m.desert;
      out.blackHills = m.blackHills;
      return out;
    }
    this.#biomeWeights(x, z, out, range);
    m.x = x;
    m.z = z;
    m.range = range;
    m.temperate = out.temperate;
    m.savanna = out.savanna;
    m.desert = out.desert;
    m.blackHills = out.blackHills;
    return out;
  }

  #biomeWeights(x, z, out, range) {
    const a = this.getAridity(x, z, range);
    const temperate = 1 - smoothstep(0.3, 0.42, a);
    const desert = smoothstep(0.62, 0.74, a);
    // Black Hills country: a rare biome of its own, found now and then in
    // the rolling hills of the green lands (see #hillsZone).
    const hills = this.#hillsZone(x, z, range ?? this.#rangeField(x, z).value) * temperate;
    out.temperate = temperate * (1 - hills);
    out.savanna = Math.max(0, 1 - temperate - desert);
    out.desert = desert;
    out.blackHills = hills;
    return out;
  }

  /** Terrain height in metres at a world position (rivers carved in). */
  getHeight(x, z) {
    const base = this.getBaseHeight(x, z);
    return this.rivers.carve(x, z, base, this.#roughness(x, z, base));
  }

  /**
   * Small bumps and hollows a few metres across, so the land underfoot is
   * never smooth: slight in the grass, rougher up in the mountains, gentle
   * on sand, none at the water's edge. Added after rivers are traced (they
   * follow the land without these), and faded out along their banks.
   */
  #roughness(x, z, base) {
    const sea = this.rivers.seaLevel;
    if (base < sea + 0.4) return 0;
    const shore = smoothstep(sea + 0.4, sea + 2.5, base);
    const amount = (0.22 + 0.8 * smoothstep(50, 170, base)) * (1 - 0.6 * this._weights.desert) * (1 - this._erg) * shore;
    return (this.roughNoise.noise2D(x * 0.13, z * 0.13) + 0.45 * this.roughNoise.noise2D(x * 0.29 + 17, z * 0.29 - 9)) * amount;
  }

  /** The land before rivers are carved into it (rivers are traced over this). */
  getBaseHeight(x, z) {
    const field = this.#rangeField(x, z);
    const w = this.getBiomeWeights(x, z, this._weights, field.value);

    // Mountain ranges: well apart, from half to twice the usual size
    // (bigger ones stand taller). The land first builds up into broad
    // foothills (`mask`), and the crested peaks rise from the range's inner
    // part (`core`), growing gradually from its edge so a range never
    // starts with a wall. Deep in the heart of a range (`heart`), where
    // there are already many mountains, the peaks crowd closer together
    // and some ranges get spiky ones: narrower, sharper and higher. Ranges
    // only stand in the plains and savanna: they make the land around them
    // wetter (see getAridity), so deserts keep their distance; in the very
    // driest deserts they fade away, slowly, over a kilometre or so.
    const { size, large } = field;
    const range = field.value - 0.9 * smoothstep(0.85, 1.25, this.#rawAridity(x, z));
    const mask = smoothstep(0.08, 0.55, range);
    let mountains = 0;
    if (mask > 0) {
      const core = smoothstep(0.3, 0.72, range);
      // Broad bowls and valleys in the range, so it's not one solid massif:
      // sheltered hollows low enough for forest, between ridges and peaks.
      const bowl = core > 0 ? smoothstep(0, 0.6, this.bowlNoise.fbm(x * 0.0007, z * 0.0007, 2)) * core * 0.6 : 0;
      if (core > 0) {
        const heart = smoothstep(0.52, 0.85, range);
        // Broader crests on the bigger ranges.
        // Crests follow warped coordinates, so they bend and branch rather
        // than running in long straight lines.
        const qx = x + this.massifNoise.noise2D(x * 0.00035 + 17, z * 0.00035) * 220;
        const qz = z + this.massifNoise.noise2D(x * 0.00035, z * 0.00035 - 29) * 220;
        let ridges = this.ridgeNoise.ridged(qx * 0.0008, qz * 0.0008, 4, 2, 0.47, 0.012);
        if (large > 0) ridges += (this.ridgeNoise.ridged(qx * 0.00052 + 91, qz * 0.00052 - 37, 4, 2, 0.47, 0.012) - ridges) * large;
        // More, closer peaks in the heart.
        if (heart > 0) ridges += (this.ridgeNoise.ridged(qx * 0.0016 - 211, qz * 0.0016 + 157, 3, 2, 0.47, 0.02) - ridges) * 0.4 * heart;
        // Some ranges are massifs rather than lines: a broad knot of peaks
        // clustered together, rising from one mass. Its summits are crested
        // knots of ridges, not smooth domes.
        const massif = smoothstep(0.1, 0.45, this.massifNoise.fbm(x * 0.00022 - 400, z * 0.00022 + 700, 2));
        if (massif > 0) {
          const knots = this.massifNoise.ridged(qx * 0.0017 + 55, qz * 0.0017 - 91, 3, 2, 0.5, 0.015);
          const blob = 0.12 + 0.25 * core + 0.6 * knots;
          ridges += (blob + 0.4 * ridges - ridges) * massif;
        }
        const spiky = smoothstep(0.3, 0.6, this.spikeNoise.fbm(x * 0.0003, z * 0.0003, 2)) * heart * (1 - massif);
        const peaks = Math.pow(ridges, 1.7 + 1.1 * spiky) * (1 + 0.75 * spiky);
        // Knobbly shoulders and spurs, so high ground is never a flat plateau
        // or one smooth dome; rougher the higher it gets. Up high, jagged
        // crags: sharp little ridges and gullies over the peaks' flanks.
        const high = smoothstep(0.06, 0.35, peaks);
        const rugged = this.ruggedNoise.fbm(x * 0.0035, z * 0.0035, 2) * (18 + 16 * high);
        const crags = high > 0 ? (this.ruggedNoise.ridged(x * 0.011 + 13, z * 0.011 - 7, 3, 2, 0.5, 0.01) - 0.3) * 22 * high : 0;
        mountains = Math.pow(core, 1.5) * (peaks * 260 * (0.65 + 0.5 * size) * (1 - bowl) + rugged + crags);
      }
      mountains += Math.pow(mask, 1.5) * 48 * (0.75 + 0.3 * size) * (1 - 0.5 * bowl);
      // The very tallest peaks are tamed: above 300 m they rise ever more
      // slowly (never past about 460), their tips rounding off a little
      // rather than shooting up into needles.
      if (mountains > 300) {
        const over = mountains - 300;
        mountains = 300 + over / (1 + over / 160);
      }
    }

    // Black Hills country: the land rises into rounded granite domes under
    // pine forest, crowned with piles of huge boulders (tors), and here and
    // there a sheer granite needle juts up, its top worn round.
    const hz = w.blackHills;
    let blackHills = 0;
    if (hz > 0) {
      const domes = Math.pow(smoothstep(-0.2, 0.7, this.hillsNoise.fbm(x * 0.0021, z * 0.0021, 3)), 1.4);
      const heart = smoothstep(0.35, 0.8, hz);
      blackHills = hz * (22 + domes * 55) + heart * domes * this.#tors(x, z) + heart * this.#needles(x, z, domes);
    }

    // Broad rise and fall of the land, lifted in dry country so seas
    // rarely reach a desert, and around mountain ranges so they don't
    // drop straight into the sea.
    const dryness = this.#rawAridity(x, z);
    const continent = this.continentNoise.fbm(x * 0.0004, z * 0.0004, 3) + 0.34 * smoothstep(0.62, 0.8, dryness) + 0.1 * smoothstep(0.3, 0.5, dryness) + 0.5 * mask;

    // Rolling hills in the plains (bigger in some regions than others),
    // lower swells in the savanna, dunes in the desert.
    // (Noise that would only be multiplied by zero isn't evaluated.)
    let hills = 0;
    if (w.temperate + 0.45 * w.savanna !== 0 && 1 - 0.6 * mask !== 0) {
      const hilly = smoothstep(-0.25, 0.35, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
      const rolling = this.hillNoise.fbm(x * 0.0024, z * 0.0024, 3) * (5 + 17 * hilly) + this.flatNoise.fbm(x * 0.006, z * 0.006, 2) * 2.5;
      hills = rolling * (w.temperate + 0.45 * w.savanna) * (1 - 0.6 * mask);
    }
    const f = this.#features(x, z, dryness, mask, w);
    let dunes = 0;
    this._erg = f.erg;
    if (w.desert > 0) {
      const crest = this.duneNoise.ridged(x * 0.0045 + z * 0.0015, z * 0.0075, 2, 2, 0.5, 0.02);
      const small = crest * 8 + this.duneNoise.fbm(x * 0.0012 + 50, z * 0.0012, 2) * 7;
      dunes = w.desert * (small * (1 - 0.85 * f.erg)) + (f.erg > 0 ? f.erg * this.#greatDunes(x, z) : 0);
    }

    // Seas where the continent noise dips, and lake basins in the green lowlands.
    const sea = smoothstep(-0.05, -0.45, continent) * 34;
    const lakes =
      1 - smoothstep(0, 0.4, mask) !== 0 && 1 - w.desert !== 0
        ? smoothstep(0.28, 0.72, this.lakeNoise.fbm(x * 0.0017, z * 0.0017, 2)) * 22 * (1 - smoothstep(0, 0.4, mask)) * (1 - w.desert) * (1 - 0.6 * w.savanna)
        : 0;

    const height = 14 + continent * 16 + hills + dunes + mountains + blackHills + f.mesaHeight + f.escarpHeight - sea - lakes;
    // Lake shores (not the open sea's beaches): a real edge rather than
    // the land just sloping on down under the water.
    const u = height - this.rivers.seaLevel;
    if (u > -4.5 && u < 7) {
      const lake = 1 - smoothstep(-0.02, -0.25, continent);
      if (lake > 0) return height + (this.#lakeShore(u, x, z) - u) * lake;
    }
    return height;
  }

  /**
   * The dunes of a dune sea: fields of crescent dunes, each 8 to 18 m tall,
   * rising gently on the windward side to a rounded crest and dropping
   * more steeply down the lee, its horns trailing downwind. They stand in
   * staggered rows about 95 m apart with hollows between them, and
   * smaller dunes cross them at an angle, so the sand is shaped every way
   * rather than in long parallel ridges.
   */
  #greatDunes(x, z) {
    // The wind blows from about the west-south-west, veering slowly across the sea.
    const a = 0.35 + 0.35 * this.ergNoise.noise2D(x * 0.00015 - 40, z * 0.00015 + 90);
    const ca = Math.cos(a), sa = Math.sin(a);
    const u0 = x * ca + z * sa; // downwind
    const v = -x * sa + z * ca; // across the wind
    const u = u0 + this.ergNoise.noise2D(v * 0.006, u0 * 0.002) * 28;
    const L = 95;
    const s = this.seed ^ 0xd00e;
    // Smooth profile: rounded crest (at `crestAt` of the way along) and hollows.
    const profile = (t, crestAt) => (t < crestAt ? 0.5 - 0.5 * Math.cos((Math.PI * t) / crestAt) : 0.5 + 0.5 * Math.cos((Math.PI * (t - crestAt)) / (1 - crestAt)));
    let h = 0;
    const k0 = Math.floor(u / L);
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      // Along each row, separate crescents (staggered from row to row).
      const W = 75;
      const along = v / W + hash2(k, 0, s);
      const m = Math.floor(along);
      const f = along - m - 0.5; // -0.5 .. 0.5 across this crescent
      const shift = 34 * f * f; // its horns trail downwind
      const t = (u - shift - k * L) / L;
      if (t < 0 || t > 1) continue;
      const mound = Math.pow(Math.cos(Math.PI * f), 1.5);
      const tall = 8 + 10 * hash2(k, m, s + 1);
      h = Math.max(h, profile(t, 0.62) * tall * mound);
    }
    // Smaller dunes crossing at an angle.
    const b = a + 1.15;
    const u2 = x * Math.cos(b) + z * Math.sin(b) + this.ergNoise.noise2D(x * 0.008 + 3, z * 0.008) * 12;
    const L2 = 58;
    const t2 = u2 / L2 - Math.floor(u2 / L2);
    const cross = profile(t2, 0.6) * (2.5 + 2.5 * (this.ergNoise.noise2D(x * 0.01 - 9, z * 0.01 + 4) * 0.5 + 0.5));
    const swell = this.ergNoise.noise2D(x * 0.0035 + 11, z * 0.0035 - 5) * 2.5;
    return h + cross + swell;
  }

  /**
   * The land's height above a lake's water, `u`, reshaped into a shore: a
   * low shelf of mud and grass at the water, then a bank (up to a couple of
   * metres high here, barely there in marshy stretches) up to the land;
   * under the water a shallow shelf, then a drop-off into the deep.
   */
  #lakeShore(u, x, z) {
    if (u >= 0) {
      const bank = 0.3 + 1.9 * smoothstep(-0.35, 0.45, this.lakeNoise.noise2D(x * 0.012 + 31, z * 0.012 - 17));
      const shelf = 0.8, steep = 0.3, relax = 2 * bank + 1;
      if (u < shelf) return u * 0.3; // the shelf, just above the water
      const low = shelf * 0.3;
      if (u < shelf + steep) return low + ((u - shelf) / steep) * bank; // the bank
      const top = low + bank, end = shelf + steep + relax;
      if (u < end) return top + ((u - shelf - steep) / relax) * (end - top); // back to the land
      return u;
    }
    const d = -u;
    if (d < 1.4) return -d * 0.3; // shallows
    if (d < 2.2) return -(0.42 + ((d - 1.4) / 0.8) * 1.6); // the drop-off
    if (d < 4.5) return -(2.02 + ((d - 2.2) / 2.3) * (4.5 - 2.02)); // back to the lake bed
    return u;
  }

  /**
   * Mesas and escarpments at (x, z) (reusing one object):
   *  - erg (0..1): a dune sea, in the desert: nothing but great dunes of sand
   *  - mesa (0..1): mesa country, in the dry savanna and desert: flat-topped
   *    hills with sheer sides, stepping up in two or three layers.
   *  - escarp (0..1): escarpment country in the green lowlands: now and
   *    then the land drops in a sheer cliff.
   * `mesaHeight` and `escarpHeight` are what they add to the land.
   */
  #features(x, z, dryness, mask, w) {
    const out = this._features;
    out.mesa = 0;
    out.mesaHeight = 0;
    out.escarp = 0;
    out.escarpHeight = 0;
    // Dune seas: great stretches of the desert that are nothing but sand.
    out.erg = w.desert > 0 ? w.desert * smoothstep(0.02, 0.28, this.ergNoise.fbm(x * 0.00022 + 300, z * 0.00022 - 120, 2)) : 0;
    const flatland = 1 - smoothstep(0.02, 0.3, mask);
    if (flatland <= 0) return out;
    const mesa = smoothstep(0.12, 0.38, this.mesaNoise.fbm(x * 0.00025 + 40, z * 0.00025 - 40, 2)) * smoothstep(0.42, 0.6, dryness) * flatland * (1 - out.erg);
    if (mesa > 0) {
      const wx = x + this.mesaNoise.noise2D(x * 0.004, z * 0.004) * 14;
      const wz = z + this.mesaNoise.noise2D(x * 0.004 + 50, z * 0.004) * 14;
      const m = this.mesaNoise.fbm(wx * 0.0016, wz * 0.0016, 3);
      const layers = smoothstep(0.16, 0.2, m) * 22 + smoothstep(0.34, 0.375, m) * 16 + smoothstep(0.5, 0.53, m) * 11;
      out.mesa = mesa;
      out.mesaHeight = mesa * layers;
    }
    // Escarpments: most often in rolling hills and forest country.
    const green = w.temperate + 0.5 * w.savanna;
    const hilly = smoothstep(-0.25, 0.35, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
    const wooded = smoothstep(-0.2, 0.25, this.forestNoise.fbm(x * 0.0045, z * 0.0045, 3));
    const escarp = smoothstep(0.32 - 0.22 * Math.max(hilly, wooded), 0.5 - 0.2 * Math.max(hilly, wooded), this.escarpNoise.fbm(x * 0.0003, z * 0.0003, 2)) * flatland * green;
    if (escarp > 0) {
      const e = this.escarpNoise.fbm(x * 0.0011 + 100, z * 0.0011 - 100, 2);
      const tall = 10 + 10 * (this.escarpNoise.noise2D(x * 0.0006 - 20, z * 0.0006) * 0.5 + 0.5);
      out.escarp = escarp;
      out.escarpHeight = escarp * smoothstep(0.08, 0.095, e) * tall;
    }
    return out;
  }

  /** Mesas and escarpments at (x, z): { mesa, mesaHeight, escarp, escarpHeight }. */
  getFeatures(x, z) {
    const range = this.#rangeField(x, z).value;
    const w = this.getBiomeWeights(x, z, {}, range);
    const r = range - 0.9 * smoothstep(0.85, 1.25, this.#rawAridity(x, z));
    return { ...this.#features(x, z, this.#rawAridity(x, z), smoothstep(0.08, 0.55, r), w) };
  }

  /** How much (x, z) is open sea rather than an inland lake (0..1). */
  getOceanness(x, z) {
    const f = this.#rangeField(x, z);
    const dryness = this.#rawAridity(x, z);
    const mask = smoothstep(0.08, 0.55, f.value - 0.9 * smoothstep(0.85, 1.25, dryness));
    const continent = this.continentNoise.fbm(x * 0.0004, z * 0.0004, 3) + 0.34 * smoothstep(0.62, 0.8, dryness) + 0.1 * smoothstep(0.3, 0.5, dryness) + 0.5 * mask;
    return smoothstep(-0.02, -0.25, continent);
  }

  /**
   * What the shore is like at (x, z), for ground at `height` near the water
   * line: lakes are edged with mud at the water, then patches of dirt, grass
   * and rock; the sea's sandy beaches have outcrops of rock. Returns
   * { kind: 'mud' | 'dirt' | 'grass' | 'rock', fade (0..1), ocean }, or null
   * away from the shore (and in the desert). Colours, grass, reeds and
   * rocks all follow this, so they agree.
   */
  getShore(x, z, height) {
    const sea = this.rivers.seaLevel;
    if (height > sea + 5.5 || height < sea - 3) return null;
    if (this.getBiomeWeights(x, z, {}).desert > 0.5) return null;
    const ocean = this.getOceanness(x, z) > 0.5;
    const fade = 1 - smoothstep(sea + 3.5, sea + 5.5, height);
    const p = this.detailNoise.noise2D(x * 0.05, z * 0.05);
    if (ocean) return p > 0.55 && height > sea - 0.5 ? { kind: 'rock', fade: fade * 0.6, ocean } : null;
    if (height < sea + 0.7) return { kind: 'mud', fade, ocean };
    if (p > 0.38) return { kind: 'rock', fade, ocean };
    if (this.grassNoise.noise2D(x * 0.08 + 7, z * 0.08) > -0.15) return { kind: 'grass', fade, ocean };
    return { kind: 'dirt', fade, ocean };
  }

  /**
   * How much the land here is given to steep rock faces (mountains, mesas,
   * escarpments, Black Hills): 0..1. Where boulders gather at the foot of cliffs.
   */
  getCliffiness(x, z) {
    const f = this.getFeatures(x, z);
    return Math.max(this.getMountainness(x, z), f.mesa, f.escarp, this.getBiomeWeights(x, z, {}).blackHills);
  }

  /**
   * Black Hills country (0..1): rare patches of the rolling hills, away
   * from mountain ranges and the dry country.
   */
  #hillsZone(x, z, range) {
    const zone = smoothstep(0.3, 0.46, this.hillsNoise.fbm(x * 0.00024 - 250, z * 0.00024 + 610, 2));
    if (zone <= 0) return 0;
    const hilly = smoothstep(-0.2, 0.25, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
    return zone * hilly * (1 - smoothstep(0.02, 0.2, range)) * (1 - smoothstep(0.45, 0.6, this.#rawAridity(x, z)));
  }

  /**
   * Tors: piles of huge rounded granite boulders, three to five in most 34 m cells,
   * each a smooth dome (no sharp edges), stacked where they overlap.
   */
  #tors(x, z) {
    const C = 34;
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    const s = this.seed ^ 0x70c5;
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (hash2(i, j, s) > 0.85) continue;
        const cx = (i + 0.5) * C, cz = (j + 0.5) * C;
        const count = 3 + Math.floor(hash2(i, j, s + 1) * 3);
        for (let k = 0; k < count; k++) {
          const px = cx + (hash2(i + k * 31, j, s + 2) - 0.5) * 20;
          const pz = cz + (hash2(i, j + k * 31, s + 3) - 0.5) * 20;
          const r = 6 + 7 * hash2(i + k, j - k, s + 4);
          const d2 = ((x - px) ** 2 + (z - pz) ** 2) / (r * r);
          if (d2 >= 1) continue;
          // A boulder: a squashed dome, sitting a little into the ground.
          best = Math.max(best, r * (0.55 + 0.35 * hash2(i - k, j + k, s + 5)) * Math.sqrt(1 - d2) - 1.5);
        }
      }
    }
    return Math.max(0, best);
  }

  /**
   * Granite formations, well spread out (one per 70 m cell at most, only
   * where the hills are high), each one of:
   *  - a needle: a sheer spire with a rounded, weathered top;
   *  - a cluster of spires: a tight crowd of thin pinnacles (like the
   *    Cathedral Spires);
   *  - a fin: a long, narrow blade of rock with a ragged crest;
   *  - a castle: a blocky, sheer-sided tower of jointed granite, stepped
   *    at the top;
   *  - a bald dome: a smooth whaleback of bare granite, faintly banded
   *    where sheets of rock have peeled away.
   */
  #needles(x, z, domes) {
    const C = 70;
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    const s = this.seed ^ 0x5eed;
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (hash2(i, j, s) > 0.8 * domes) continue;
        const px = (i + 0.25 + 0.5 * hash2(i, j, s + 1)) * C;
        const pz = (j + 0.25 + 0.5 * hash2(i, j, s + 2)) * C;
        const dx = x - px, dz = z - pz;
        if (dx * dx + dz * dz > 45 * 45) continue;
        const kind = hash2(i, j, s + 5);
        const size = hash2(i, j, s + 4);
        let h = 0;
        if (kind < 0.35) {
          // A needle.
          const r = 10 + 6 * hash2(i, j, s + 3);
          const t = Math.hypot(dx, dz) / r;
          if (t < 1) h = (18 + 26 * size) * Math.pow(1 - Math.pow(t, 2.6), 0.5);
        } else if (kind < 0.52) {
          // A cluster of spires.
          const count = 4 + Math.floor(hash2(i, j, s + 6) * 4);
          for (let k = 0; k < count; k++) {
            const a = hash2(i + k * 13, j, s + 7) * Math.PI * 2, out = k === 0 ? 0 : 5 + 11 * hash2(i, j + k * 13, s + 8);
            const r = 3.5 + 2.5 * hash2(i - k, j + k, s + 9);
            const t = Math.hypot(dx - Math.cos(a) * out, dz - Math.sin(a) * out) / r;
            if (t < 1) h = Math.max(h, (16 + 24 * hash2(i + k, j - k, s + 10)) * (k === 0 ? 1.15 : 1) * Math.pow(1 - Math.pow(t, 2.2), 0.5));
          }
        } else if (kind < 0.68) {
          // A fin: a long narrow blade, turned any way, its crest ragged.
          const a = hash2(i, j, s + 6) * Math.PI;
          const u = dx * Math.cos(a) + dz * Math.sin(a), v = -dx * Math.sin(a) + dz * Math.cos(a);
          const len = 22 + 18 * size, wide = 4 + 3 * hash2(i, j, s + 3);
          const e = Math.hypot(u / len, v / wide);
          if (e < 1) {
            const crest = 1 - 0.35 * Math.abs(u / len) + 0.18 * this.hillsNoise.noise2D(u * 0.12 + i * 7, j * 3.1);
            h = (14 + 16 * hash2(i, j, s + 7)) * crest * Math.pow(1 - Math.pow(e, 3), 0.45);
          }
        } else if (kind < 0.82) {
          // A castle: a squarish tower (a superellipse), sheer-sided, with
          // a second, smaller tier standing on its top.
          const a = hash2(i, j, s + 6) * Math.PI;
          const u = dx * Math.cos(a) + dz * Math.sin(a), v = -dx * Math.sin(a) + dz * Math.cos(a);
          const r = 11 + 7 * size, H = 12 + 12 * hash2(i, j, s + 7);
          const d = Math.pow(Math.pow(Math.abs(u / r), 4) + Math.pow(Math.abs(v / (r * 0.8)), 4), 0.25);
          if (d < 1) {
            const ox = r * 0.25 * (hash2(i, j, s + 8) - 0.5), oz = r * 0.25 * (hash2(i, j, s + 9) - 0.5);
            const d2 = Math.pow(Math.pow(Math.abs((u - ox) / (r * 0.55)), 4) + Math.pow(Math.abs((v - oz) / (r * 0.45)), 4), 0.25);
            h = smoothstep(1, 0.8, d) * H + smoothstep(1, 0.8, d2) * H * 0.4;
          }
        } else {
          // A bald dome, faintly banded by peeling sheets of rock.
          const r = 22 + 10 * size;
          const t = Math.hypot(dx, dz) / r;
          if (t < 1) {
            const dome = (18 + 12 * hash2(i, j, s + 7)) * Math.sqrt(1 - t * t);
            h = dome - 0.6 * (dome / 3 - Math.floor(dome / 3));
          }
        }
        best = Math.max(best, h);
      }
    }
    return best;
  }

  /**
   * Where mountain ranges lie: a smooth, slow noise (ranges where it's
   * high). A still slower noise picks the scale region by region: ranges
   * half the usual size, usual, or twice it, blending between. Returns
   * { value, size (0.5..2), large (0..1, how much of the 2x scale) },
   * reusing one object.
   */
  #rangeField(x, z) {
    const out = this._range;
    if (x === out.x && z === out.z) return out; // asked for several times per point
    const t = Math.min(1, Math.max(0, 0.5 + this.rangeSizeNoise.fbm(x * 0.00007, z * 0.00007, 2) * 1.3));
    const small = 1 - smoothstep(0, 0.45, t);
    const large = smoothstep(0.55, 1, t);
    const usual = 1 - small - large;
    const f = 0.00013;
    let value = 0;
    if (small > 0) value += small * this.mountainMaskNoise.fbm(x * f * 2 + 311, z * f * 2 - 173, 2);
    if (usual > 0) value += usual * this.mountainMaskNoise.fbm(x * f, z * f, 2);
    if (large > 0) value += large * this.mountainMaskNoise.fbm(x * f * 0.5 - 517, z * f * 0.5 + 229, 2);
    out.x = x;
    out.z = z;
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
    const n = this.forestNoise.fbm(x * 0.0045, z * 0.0045, 3);
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
  /**
   * What kind of country (x, z) is, in a word or two, for showing where
   * you are: "Forest", "Rolling hills", "Mountains", "Dune sea", "Lake"...
   */
  describe(x, z) {
    const sea = this.rivers.seaLevel;
    const height = this.getHeight(x, z);
    if (height < sea - 0.3) return this.getOceanness(x, z) > 0.5 ? 'Ocean' : 'Lake';
    const water = this.rivers.at(x, z, 0);
    if (water) return water.pond ? 'Pond' : water.stream ? 'Mountain stream' : 'River';
    const w = this.getBiomeWeights(x, z, {});
    const f = this.getFeatures(x, z);
    if (height < sea + 2.5 && this.getOceanness(x, z) > 0.5 && w.desert < 0.5) return 'Beach';
    const mountains = this.getMountainness(x, z);
    if (mountains > 0.45) return height > 185 ? 'Snowy peaks' : 'Mountains';
    if (mountains > 0.2) return 'Foothills';
    const top = Object.keys(w).reduce((a, b) => (w[a] >= w[b] ? a : b));
    if (top === 'blackHills') return 'Black Hills';
    if (top === 'desert') return f.erg > 0.5 ? 'Dune sea' : f.mesa > 0.4 ? 'Mesas' : 'Desert';
    if (top === 'savanna') return f.mesa > 0.4 ? 'Mesas' : 'Savanna';
    if (f.escarp > 0.5 && f.escarpHeight > 4) return 'Escarpment';
    if (this.getForestDensity(x, z) > 0.55) return 'Forest';
    if (smoothstep(-0.25, 0.35, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2)) > 0.6) return 'Rolling hills';
    return 'Plains';
  }

  surfaceColor(x, z, height, upness, out, jitter = this.getColorJitter(x, z)) {
    const w = this.getBiomeWeights(x, z, {});
    blendedFaceColor(this.biomes, w, height, upness, out);
    // Ice up in the snow: the steep faces are icy blue-grey rock, and here
    // and there the snow gives way to blue glacier ice.
    if (height > 170 && w.temperate + w.savanna > 0.5) {
      const up = smoothstep(175, 205, height);
      const steep = 1 - smoothstep(0.35, 0.6, upness);
      const glacier = smoothstep(0.15, 0.45, this.detailNoise.noise2D(x * 0.012 + 90, z * 0.012 - 40)) * smoothstep(0.45, 0.6, upness) * (1 - smoothstep(0.85, 0.95, upness));
      if (steep > 0) out.lerp(ICY_ROCK, 0.55 * steep * up);
      if (glacier > 0) out.lerp(ICE, 0.75 * glacier * up);
    }
    // Lake shores: mud, dirt, grass and rock; rocky outcrops on beaches.
    const ground = height - jitter; // `height` has the colour jitter added
    const shore = ground < 9 ? this.getShore(x, z, ground) : null;
    if (shore) out.lerp(SHORE[shore.kind], 0.85 * shore.fade);
    // Dune seas: warm golden sand, deeper orange on the steep slip faces.
    const f = w.desert + w.savanna > 0.2 ? this.getFeatures(x, z) : null;
    if (f && f.erg > 0) out.lerp(duneSand.copy(DUNE).lerp(DUNE_SLIP, smoothstep(0.93, 0.78, upness)), 0.85 * f.erg);
    // Mesa walls: bands of red and orange sandstone.
    if (upness < 0.85 && f) {
      if (f.mesa > 0.05) {
        const band = Math.floor((height + this.detailNoise.noise2D(x * 0.02, z * 0.02) * 0.8) / 2.4);
        stratum.copy(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]);
        out.lerp(stratum, Math.min(1, f.mesa * 1.5) * (1 - smoothstep(0.6, 0.85, upness)));
      }
    }
    // Muddy banks along rivers and ponds (gravel along mountain streams),
    // fading to dirt and then the land's own colour.
    const river = this.rivers.at(x, z, 4);
    if (river) {
      const e = river.d - river.water; // metres from the water's edge
      const gravel = river.stream && this.getMountainness(x, z) > 0.3;
      if (e < -0.3) out.lerp(RIVERBED, 0.85);
      else if (e < 1.8) out.lerp(gravel ? GRAVEL : MUD, 0.85);
      else out.lerp(gravel ? GRAVEL : DIRT, 0.8 * (1 - smoothstep(river.half - river.water + 1.5, river.half - river.water + 4, e)) * (0.7 + 0.3 * this.detailNoise.noise2D(x * 0.3, z * 0.3)));
    }
    return out;
  }
}
