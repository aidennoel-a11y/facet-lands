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
// How much more of the world is mountains than the range noise alone gives.
const MOUNTAIN_BIAS = 0.085;
const DUNE = new Color(0xe6b86e); // dune sand
const WASH = new Color(0xcdb592); // a canyon's dry wash
const LAVA = new Color(0x2b2827); // old lava
const CINDER = new Color(0x6e3b2c); // red cinders
const SCREE = new Color(0x4b423e); // a cinder cone's dark slopes
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
    this.volcanoNoise = new SimplexNoise(this.seed + 140); // volcanic highlands
    this.wetNoise = new SimplexNoise(this.seed + 141); // wetlands
    this.canyonNoise = new SimplexNoise(this.seed + 142);
    this.coastNoise = new SimplexNoise(this.seed + 143); // sea cliffs
    this.groveNoise = new SimplexNoise(this.seed + 144); // birch woods
    this._cones = new Map(); // volcano cell -> cone (or null)
    this._contX = NaN;
    this._contZ = NaN;
    this._cont = 0;
    this._range = { value: 0, size: 1, large: 0 };

    this.biomes = Object.fromEntries(BIOME_IDS.map((id) => [id, prepareBiome(BIOMES[id])]));
    this._weights = { temperate: 1, savanna: 0, desert: 0, blackHills: 0, volcanic: 0, wetland: 0 };
    this._lastWeights = { x: NaN, z: NaN, range: NaN };
    this._features = { mesa: 0, mesaTop: 0, escarp: 0, hills: 0, erg: 0, canyon: 0, canyonFloor: 0, canyonCut: 0 };
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
    const aridity = Math.min(1, Math.max(0, this.#rawAridity(x, z) + detail - 0.55 * smoothstep(-0.12, 0.4, range)));
    // Green all round volcanic country (see #volcanoBelt).
    const belt = this.#volcanoBelt(x, z);
    return belt > 0 ? aridity + (Math.min(aridity, 0.12) - aridity) * belt : aridity;
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
    const raw = 0.5 + this.aridityNoise.fbm(wx * 0.00016, wz * 0.00016, 3) * 1.3;
    // Wet, green country all round volcanic highlands.
    const belt = this.#volcanoBelt(x, z);
    return belt > 0 ? raw + (Math.min(raw, 0.1) - raw) * belt : raw;
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
      out.volcanic = m.volcanic;
      out.wetland = m.wetland;
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
    m.volcanic = out.volcanic;
    m.wetland = out.wetland;
    return out;
  }

  #biomeWeights(x, z, out, range) {
    range ??= this.#rangeField(x, z).value;
    const a = this.getAridity(x, z, range);
    const temperate = 1 - smoothstep(0.4, 0.52, a);
    const desert = smoothstep(0.705, 0.825, a);
    const savanna = Math.max(0, 1 - temperate - desert);
    // Black Hills country: a rare biome of its own, found now and then in
    // the rolling hills of the green lands (see #hillsZone).
    const hz = this.#hillsZone(x, z, range);
    const hills = hz * temperate;
    // Volcanic highlands: rarer still, deep in the green forest and hill
    // country (see #volcanoZone). (The land round a volcano is volcanic
    // country, whatever the zone says.)
    const vz = Math.max(this.#volcanoZone(x, z, range), this.#coneReach(x, z));
    const volcanic = temperate * (1 - hz) * vz;
    // Wetlands: only in the wettest, low, flat country (so never anywhere
    // near a desert: the whole savanna lies between them).
    const wz = this.#wetZone(x, z, range, a);
    const green = temperate * (1 - hz) * (1 - vz);
    out.temperate = green * (1 - wz);
    out.wetland = green * wz;
    out.savanna = savanna;
    out.desert = desert;
    out.blackHills = hills;
    out.volcanic = volcanic;
    return out;
  }

  /** The broad continent noise alone (low near the coasts), remembered for the last point. */
  #continentBase(x, z) {
    if (x !== this._contX || z !== this._contZ) {
      this._contX = x;
      this._contZ = z;
      this._cont = this.continentNoise.fbm(x * 0.0004, z * 0.0004, 3) + 0.015;
    }
    return this._cont;
  }

  /** The slow noise volcanic highlands follow (high where they are), remembered for the last point. */
  #volcanoNoise(x, z) {
    if (x !== this._vnX || z !== this._vnZ) {
      this._vnX = x;
      this._vnZ = z;
      this._vn = this.volcanoNoise.fbm(x * 0.00005 + 900, z * 0.00005 - 300, 2);
    }
    return this._vn;
  }

  /**
   * How much (x, z) lies in the wide green belt round volcanic country
   * (0..1): there the climate is wet and there are no mountain ranges (see
   * #rawAridityAt, #rangeField), nor Black Hills or wetlands, so volcanic
   * highlands stand alone in forest and hill country, kilometres from
   * anything else.
   */
  #volcanoBelt(x, z) {
    return smoothstep(0.32, 0.5, this.#volcanoNoise(x, z));
  }

  /**
   * Where volcanic highlands lie (0..1): rare, broad stretches in the heart
   * of their green belt, only where the belt is at its fullest for a good
   * kilometre all round (so there's always that much forest and hill
   * country between them and anything else).
   */
  #volcanoZone(x, z, range) {
    const zone = smoothstep(0.6, 0.7, this.#volcanoNoise(x, z));
    if (zone <= 0) return 0;
    let ring = Infinity;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      for (const d of [700, 1400]) ring = Math.min(ring, this.volcanoNoise.fbm((x + Math.cos(a) * d) * 0.00005 + 900, (z + Math.sin(a) * d) * 0.00005 - 300, 2));
    }
    return zone * smoothstep(0.48, 0.54, ring) * (1 - smoothstep(0.02, 0.2, range));
  }

  /** Where wetlands lie (0..1): patches of the wettest, low-lying, flat country. */
  #wetZone(x, z, range, aridity) {
    // (By the broad climate, which changes only slowly, so a wetland is
    // always the whole savanna's width from any desert.)
    const raw = this.#rawAridity(x, z);
    if (raw > 0.2 || aridity > 0.3 || range > 0.15) return 0;
    const zone = smoothstep(-0.45, -0.2, this.wetNoise.fbm(x * 0.00028 + 50, z * 0.00028 - 80, 2));
    if (zone <= 0) return 0;
    // (Never near volcanic country.)
    const volcanicNear = 1 - smoothstep(0.26, 0.36, this.#volcanoNoise(x, z));
    if (volcanicNear <= 0) return 0;
    const low = 1 - smoothstep(0.45, 0.75, this.#continentBase(x, z));
    let wet = zone * low * (1 - smoothstep(0.08, 0.2, raw)) * (1 - smoothstep(0.16, 0.3, aridity)) * (1 - smoothstep(0.02, 0.15, range));
    if (wet <= 0) return 0;
    // And the country all around stays green for the best part of a
    // kilometre: no dry land creeping close.
    return wet * volcanicNear * (1 - smoothstep(0.32, 0.42, this.#dryAround(x, z)));
  }

  /**
   * The driest the broad climate gets 800 m out from (x, z), measured on a
   * 64 m grid (remembered) and blended between its points, so it's smooth.
   */
  #dryAround(x, z) {
    const G = 64;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._dry ?? (this._dry = new Map());
    const at = (i, j) => {
      const key = (i + 32768) * 65536 + (j + 32768);
      let v = cache.get(key);
      if (v === undefined) {
        v = 0;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          v = Math.max(v, this.#rawAridityAt(i * G + Math.cos(a) * 800, j * G + Math.sin(a) * 800));
        }
        if (cache.size > 60000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a = at(gx, gz) + (at(gx + 1, gz) - at(gx, gz)) * fx;
    const b = at(gx, gz + 1) + (at(gx + 1, gz + 1) - at(gx, gz + 1)) * fx;
    return a + (b - a) * fz;
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
    const range = field.value + MOUNTAIN_BIAS - 0.9 * smoothstep(0.85, 1.25, this.#rawAridity(x, z));
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
      mountains += Math.pow(mask, 1.5) * 48 * (0.75 + 0.3 * size) * (1 - 0.5 * bowl) + Math.pow(core, 2) * 85 * (1 - 0.5 * bowl); // (the heart of a range lifted, so more of its peaks reach the snow)
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

    // Volcanic highlands: a raised, rough plateau of old lava, and cinder
    // cones with a crater at the top and tongues of lava down their sides.
    let volcanic = 0;
    if (w.volcanic > 0) volcanic = w.volcanic * (16 + 14 * this.volcanoNoise.fbm(x * 0.002 + 7, z * 0.002, 2));
    volcanic += this.#coneHeight(x, z);

    // Broad rise and fall of the land, lifted in dry country so seas
    // rarely reach a desert, and around mountain ranges so they don't
    // drop straight into the sea.
    const dryness = this.#rawAridity(x, z);
    const continent = this.#continentBase(x, z) + 0.34 * smoothstep(0.62, 0.8, dryness) + 0.1 * smoothstep(0.3, 0.5, dryness) + 0.5 * mask;

    // Rolling hills in the plains (bigger in some regions than others),
    // lower swells in the savanna, dunes in the desert.
    // (Noise that would only be multiplied by zero isn't evaluated.)
    let hills = 0;
    if (w.temperate + 0.45 * w.savanna !== 0 && 1 - 0.6 * mask !== 0) {
      const hilly = smoothstep(-0.45, 0.15, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
      const rolling = this.hillNoise.fbm(x * 0.0024, z * 0.0024, 3) * (5 + 17 * hilly) + this.flatNoise.fbm(x * 0.006, z * 0.006, 2) * 2.5;
      hills = rolling * (w.temperate + 0.45 * w.savanna) * (1 - 0.6 * mask);
    }
    const f = this.#features(x, z, dryness, mask, w);
    let dunes = 0;
    this._erg = f.erg;
    if (w.desert > 0) {
      // (The crests' lines bend and wander rather than running straight.)
      const qx = x + this.duneNoise.noise2D(x * 0.0021 + 7, z * 0.0021) * 70;
      const qz = z + this.duneNoise.noise2D(x * 0.0021, z * 0.0021 - 7) * 70;
      const crest = this.duneNoise.ridged(qx * 0.0048 + qz * 0.0012, qz * 0.0068 - qx * 0.001, 2, 2, 0.5, 0.02);
      const small = crest * 8 + this.duneNoise.fbm(x * 0.0012 + 50, z * 0.0012, 2) * 7;
      dunes = w.desert * (small * (1 - 0.85 * f.erg)) + (f.erg > 0 ? f.erg * this.#greatDunes(x, z) : 0);
    }

    // Seas where the continent noise dips, and lake basins in the green lowlands.
    const sea = smoothstep(-0.05, -0.45, continent) * 34;
    const lakes =
      1 - smoothstep(0, 0.4, mask) !== 0 && 1 - w.desert !== 0
        ? smoothstep(0.28, 0.72, this.lakeNoise.fbm(x * 0.0017, z * 0.0017, 2)) * 22 * (1 - smoothstep(0, 0.4, mask)) * (1 - w.desert) * (1 - 0.6 * w.savanna)
        : 0;

    const seaLevel = this.rivers.seaLevel;
    // (Few cliffs drop straight into a lake: escarpments fade out over lake basins.)
    let height = 14 + continent * 16 + hills + dunes + mountains + blackHills + volcanic + f.mesaHeight + f.escarpHeight * (1 - smoothstep(0.5, 6, lakes)) - sea - lakes;
    // Canyons cut down into it (their floors kept above the sea).
    if (f.canyonCut > 0) height -= Math.min(f.canyonCut, Math.max(0, height - (seaLevel + 3)));
    // Wetlands: the land sinks to just above the water, a maze of shallow
    // pools, mudflats and meandering channels.
    if (w.wetland > 0) {
      const target = seaLevel + this.#marsh(x, z);
      if (height > target) height += (target - height) * w.wetland;
    }
    // Lake shores (not the open sea's beaches, nor marshes): a real edge
    // rather than the land just sloping on down under the water.
    const u = height - seaLevel;
    if (u > -4.5 && u < 7) {
      const lake = (1 - smoothstep(-0.02, -0.25, continent)) * (1 - w.wetland);
      if (lake > 0) height += (this.#lakeShore(u, x, z) - u) * lake;
    }
    // Sea cliffs along stretches of the open coast.
    const ocean = smoothstep(-0.02, -0.25, continent);
    if (ocean > 0 && u > -10 && u < 60) {
      const cliffs = this.#cliffZone(x, z, w) * ocean;
      if (cliffs > 0) height += (this.#seaCliff(x, z, u) - u) * cliffs;
    }
    return height;
  }

  /**
   * Wetland ground, in metres above the water: low hummocks of marsh, with
   * pools and meandering channels dipping below it.
   */
  #marsh(x, z) {
    const hummocks = 0.7 + this.wetNoise.fbm(x * 0.004 + 3, z * 0.004 - 3, 2) * 1.2;
    const qx = x + this.wetNoise.noise2D(x * 0.004, z * 0.004 + 40) * 30;
    const qz = z + this.wetNoise.noise2D(x * 0.004 - 40, z * 0.004) * 30;
    const channel = smoothstep(0.9, 0.985, 1 - Math.abs(this.wetNoise.noise2D(qx * 0.0035, qz * 0.0035)));
    const pools = smoothstep(0.2, 0.55, this.wetNoise.fbm(x * 0.009 - 20, z * 0.009 + 20, 2));
    return hummocks - 2.4 * channel - 1.8 * pools;
  }

  /** Stretches of the open coast that rise in cliffs (0..1); the rest are coves and beaches. */
  #cliffZone(x, z, w) {
    return smoothstep(0.05, 0.3, this.coastNoise.fbm(x * 0.0007 + 11, z * 0.0007 - 3, 2)) * (1 - w.wetland) * (1 - 0.7 * w.desert);
  }

  /**
   * A cliffed coast, given the land's natural height above the sea `u`:
   * from the water it rises sheer to the cliff top (14-30 m), then on up
   * gently until it meets the land; offshore the sea deepens quickly, and
   * sea stacks, pillars of rock the sea has cut off, stand in it.
   */
  #seaCliff(x, z, u) {
    const C = 14 + 16 * (this.coastNoise.noise2D(x * 0.002, z * 0.002) * 0.5 + 0.5);
    if (u >= 0) {
      // The cliff's line wanders; its face steps back in a couple of
      // benches and is knobbled with ledges and bulges.
      const e = u + 0.25 * this.coastNoise.noise2D(x * 0.045 + 5, z * 0.045 - 5) + 0.12 * this.coastNoise.noise2D(x * 0.15 - 2, z * 0.15 + 2) + 0.07 * this.coastNoise.noise2D(x * 0.42 + 6, z * 0.42 - 1);
      const t = smoothstep(0.05, 0.7, e);
      const k = t * 3, i = Math.min(2, Math.floor(k));
      const stepped = t >= 1 ? 1 : (i + smoothstep(0.35, 1, k - i)) / 3;
      const knobs = t > 0 && t < 1 ? (this.coastNoise.noise2D(x * 0.3 + 9, z * 0.3 - 9) * 1.6 + this.coastNoise.noise2D(x * 0.75, z * 0.75) * 0.8 + this.coastNoise.noise2D(x * 1.6 - 5, z * 1.6 + 3) * 0.35) * 10 * t * (1 - t) : 0;
      return Math.max(C * stepped + knobs + Math.max(0, u - 0.7) * 0.5, u);
    }
    let h = u - 2.5 * smoothstep(0, -1, u) * (1 - smoothstep(-5, -10, u));
    if (u > -6 && u < -0.3) {
      const S = 36;
      const ci = Math.floor(x / S), cj = Math.floor(z / S);
      const s = this.seed ^ 0x57ac;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di, j = cj + dj;
          if (hash2(i, j, s) > 0.3) continue;
          const px = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * S, pz = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * S;
          const r = 4 + 5 * hash2(i, j, s + 3);
          const t = Math.hypot(x - px, z - pz) / r;
          if (t < 1) h = Math.max(h, C * (0.5 + 0.45 * hash2(i, j, s + 4)) * (1 - smoothstep(0.72, 1, t)) - 0.6 * t);
        }
      }
    }
    return h;
  }

  /**
   * The volcano whose cell is (i, j), or null: cinder cones well spread out
   * (at most one per 1.1 km cell) and only well inside volcanic country.
   */
  #cone(i, j) {
    const key = (i + 32768) * 65536 + (j + 32768);
    if (!this._cones.has(key)) {
      if (this.#coneAt(i, j)) this.#rankRegion(i, j);
      else this._cones.set(key, null);
    }
    return this._cones.get(key);
  }

  /**
   * No more than three volcanoes to a stretch of volcanic country: gathers
   * every cell of the stretch (from (i0, j0), which has a would-be volcano)
   * and keeps three of its would-be volcanoes, picked by hash. (The stretch
   * is the same whichever of its cells it's gathered from, so which three
   * stand doesn't depend on the order the world is built in.)
   */
  #rankRegion(i0, j0) {
    const C = 1100, s = this.seed ^ 0xc0e5;
    const key = (i, j) => (i + 32768) * 65536 + (j + 32768);
    const inside = (i, j) => !!this.#coneAt(i, j) || this.volcanoNoise.fbm((i + 0.5) * C * 0.00005 + 900, (j + 0.5) * C * 0.00005 - 300, 2) > 0.52;
    const seen = new Set([key(i0, j0)]);
    const stack = [i0, j0], found = [];
    while (stack.length) {
      const j = stack.pop(), i = stack.pop();
      if (this.#coneAt(i, j)) found.push([i, j]);
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        const k = key(a, b);
        if (seen.has(k)) continue;
        seen.add(k);
        if (inside(a, b)) stack.push(a, b);
      }
    }
    found.sort((p, q) => hash2(p[0], p[1], s + 13) - hash2(q[0], q[1], s + 13));
    found.forEach(([i, j], n) => this._cones.set(key(i, j), n < 3 ? this.#coneAt(i, j) : null));
  }

  /** The volcano (i, j)'s cell would have, if there were no limit to a stretch. */
  #coneAt(i, j) {
    const key = (i + 32768) * 65536 + (j + 32768);
    const cache = this._coneAt ?? (this._coneAt = new Map());
    if (cache.has(key)) return cache.get(key);
    let cone = null;
    const s = this.seed ^ 0xc0e5;
    const C = 1100;
    if (hash2(i, j, s) < 0.8) {
      const x = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * C, z = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * C;
      // (A fresh object: the shared one may be in use for the point being built.)
      const range = this.#rangeField(x, z, {}).value;
      if (this.#volcanoZone(x, z, range) > 0.45 && this.#hillsZone(x, z, range) < 0.1) {
        const R = 240 + 150 * hash2(i, j, s + 3);
        const flows = [];
        const count = 4 + Math.floor(hash2(i, j, s + 4) * 4);
        for (let k = 0; k < count; k++) {
          flows.push({ a: hash2(i + k, j, s + 5) * Math.PI * 2, len: R * (1.3 + 0.8 * hash2(i, j + k, s + 6)), thick: 3 + 4 * hash2(i - k, j, s + 7) });
        }
        cone = {
          x, z, R, seed: hash2(i, j, s + 10) * 10,
          H: 130 + 110 * hash2(i, j, s + 8),
          rc: R * (0.16 + 0.06 * hash2(i, j, s + 9)),
          depth: 30 + 25 * hash2(i, j, s + 11),
          lake: hash2(i, j, s + 12) < 0.55,
          flows,
        };
      }
    }
    cache.set(key, cone);
    return cone;
  }

  /** The volcanoes whose slopes or lava reach into a box. */
  volcanoes(minX, minZ, maxX, maxZ) {
    const C = 1100, out = [];
    for (let j = Math.floor((minZ - 900) / C); j <= Math.floor((maxZ + 900) / C); j++) {
      for (let i = Math.floor((minX - 900) / C); i <= Math.floor((maxX + 900) / C); i++) {
        const c = this.#cone(i, j);
        if (!c) continue;
        const reach = c.R * 2.2;
        if (c.x + reach > minX && c.x - reach < maxX && c.z + reach > minZ && c.z - reach < maxZ) out.push(c);
      }
    }
    return out;
  }

  /**
   * How a volcano shapes (x, z): { height, lava (0..1, on a lava flow),
   * crater (0..1, in or on the rim of a crater), cone (0..1, on its
   * slopes) }, reusing one object.
   */
  getVolcanic(x, z) {
    const out = this._volc ?? (this._volc = { height: 0, lava: 0, crater: 0, cone: 0 });
    out.height = 0;
    out.lava = 0;
    out.crater = 0;
    out.cone = 0;
    for (const c of this.#conesNear(x, z)) {
      {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz);
        if (d > c.R * 2.2) continue;
        const angle = Math.atan2(dz, dx);
        let h = 0;
        const t = d / c.R;
        if (t < 1) {
          out.cone = Math.max(out.cone, 1 - smoothstep(0.75, 1, t));
          // Concave flanks up to the rim, furrowed by gullies, then the crater bowl.
          const rimH = c.H * Math.pow(1 - c.rc / c.R, 1.5);
          if (d < c.rc) {
            h = rimH - c.depth * Math.pow(1 - (d / c.rc) ** 2, 0.7);
            out.crater = Math.max(out.crater, 1);
          } else {
            h = c.H * Math.pow(1 - t, 1.5) * (0.95 + 0.05 * this.volcanoNoise.noise2D(angle * 5 + c.seed, t * 3));
            out.crater = Math.max(out.crater, 1 - smoothstep(c.rc, c.rc * 1.6, d));
          }
        }
        // Tongues of old lava down the flanks and out over the land.
        for (const f of c.flows) {
          if (d < c.R * 0.3 || d > f.len) continue;
          let da = Math.abs(angle - f.a) % (Math.PI * 2);
          if (da > Math.PI) da = Math.PI * 2 - da;
          const halfW = 10 + d * 0.09;
          const across = (da * d) / halfW;
          if (across >= 1) continue;
          const mask = (1 - smoothstep(0.55, 1, across)) * (1 - smoothstep(0.8 * f.len, f.len, d)) * smoothstep(c.R * 0.3, c.R * 0.5, d);
          const rough = 0.75 + 0.25 * this.volcanoNoise.ridged(x * 0.04, z * 0.04, 2, 2, 0.5, 0.02);
          h += f.thick * mask * rough;
          out.lava = Math.max(out.lava, mask);
        }
        out.height = Math.max(out.height, h);
      }
    }
    return out;
  }

  /** The volcanoes that could reach into (x, z)'s 1.1 km cell (remembered per cell). */
  #conesNear(x, z) {
    const C = 1100;
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    const key = (ci + 32768) * 65536 + (cj + 32768);
    const cache = this._conesNear ?? (this._conesNear = new Map());
    let list = cache.get(key);
    if (!list) {
      list = [];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const c = this.#cone(ci + di, cj + dj);
        if (c) list.push(c);
      }
      if (cache.size > 20000) cache.clear();
      cache.set(key, list);
    }
    return list;
  }

  /** How much (x, z) is on or around a volcano (0..1): 1 on the cone, fading out beyond its foot. */
  #coneReach(x, z) {
    let reach = 0;
    for (const c of this.#conesNear(x, z)) reach = Math.max(reach, 1 - smoothstep(c.R * 0.9, c.R * 1.7, Math.hypot(x - c.x, z - c.z)));
    return reach;
  }

  #coneHeight(x, z) {
    return this.getVolcanic(x, z).height;
  }

  /**
   * Steam vents around the volcanoes near a box: [{ x, z, strength }] on
   * their crater rims and floors, and a few on their flanks.
   */
  vents(minX, minZ, maxX, maxZ) {
    const out = [];
    for (const c of this.volcanoes(minX, minZ, maxX, maxZ)) {
      const s = this.seed ^ 0x57ea;
      const n = 3 + Math.floor(hash2(Math.floor(c.x), Math.floor(c.z), s) * 4);
      for (let k = 0; k < n; k++) {
        const a = hash2(k, Math.floor(c.x), s + 1) * Math.PI * 2;
        const r = k < 3 ? c.rc * (0.5 + 0.55 * hash2(k, Math.floor(c.z), s + 2)) : c.R * (0.3 + 0.25 * hash2(k, 7, s + 3));
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (x >= minX && x < maxX && z >= minZ && z < maxZ) out.push({ x, z, strength: 0.6 + 0.4 * hash2(k, 3, s + 4), lake: c.lake && r < c.rc * 0.62 });
      }
    }
    return out;
  }

  /**
   * How much (x, z) has a cold winter (0..1): the green lands, wetlands,
   * Black Hills and volcanic highlands do; the savanna barely; the desert not.
   */
  getSeasonality(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    return w.temperate + w.wetland + w.blackHills + 0.85 * w.volcanic + 0.15 * w.savanna;
  }

  /** How much (x, z) is a cliffed stretch of the open coast (0..1). */
  getSeaCliff(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    return this.#cliffZone(x, z, w) * this.getOceanness(x, z);
  }

  /**
   * The dunes of a dune sea: scattered crescent (barchan) dunes, each
   * rising gently on the windward side to a rounded crest and dropping
   * steeply down the lee, its horns trailing downwind. They stand
   * wherever they happen to lie, not in rows: big and small, turned a
   * little this way and that, running together here into chains and
   * leaving open sand there. In some stretches great star dunes tower
   * over them, their arms spiralling out from a peak. Between them the
   * sand swells and is dimpled with small dunes every way.
   */
  #greatDunes(x, z) {
    // The wind blows from about the west-south-west, veering slowly across the sea.
    const a = 0.35 + 0.5 * this.ergNoise.noise2D(x * 0.00015 - 40, z * 0.00015 + 90);
    const ca = Math.cos(a), sa = Math.sin(a);
    const wx = x + this.ergNoise.noise2D(x * 0.004 + 21, z * 0.004) * 22;
    const wz = z + this.ergNoise.noise2D(x * 0.004, z * 0.004 - 21) * 22;
    const u = wx * ca + wz * sa; // downwind
    const v = -wx * sa + wz * ca; // across the wind
    const s = this.seed ^ 0xd00e;
    const GU = 120, GV = 100;
    const stars = smoothstep(0.1, 0.4, this.ergNoise.noise2D(x * 0.0004 + 77, z * 0.0004 - 33));
    let h = 0;
    const i0 = Math.floor(u / GU), j0 = Math.floor(v / GV);
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const r0 = hash2(i, j, s);
        if (r0 > 0.86) continue; // open sand
        const cu = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * GU;
        const cv = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * GV;
        const S = 0.6 + 0.8 * hash2(i, j, s + 3);
        const du0 = u - cu, dv0 = v - cv;
        if (hash2(i, j, s + 5) < stars * 0.55) {
          // A star dune: a peak with three to five arms spiralling out.
          const R = 62 + 48 * S * 0.8;
          const r = Math.hypot(du0, dv0);
          if (r >= R) continue;
          const n = 3 + Math.floor(hash2(i, j, s + 6) * 3);
          const theta = Math.atan2(dv0, du0) + (r / R) * 1.2 + hash2(i, j, s + 7) * 6.28;
          const arms = Math.pow(Math.abs(Math.cos((n * theta) / 2)), 2);
          const fall = Math.pow(1 - r / R, 1.3);
          const tall = (13 + 10 * hash2(i, j, s + 8)) * S;
          h = Math.max(h, tall * fall * (0.35 + 0.65 * arms) + tall * 0.25 * Math.pow(1 - r / R, 4));
          continue;
        }
        // A crescent dune, turned a little from the wind.
        const turn = (hash2(i, j, s + 4) - 0.5) * 0.6;
        const ct = Math.cos(turn), st = Math.sin(turn);
        const du = du0 * ct + dv0 * st, dv = -du0 * st + dv0 * ct;
        const half = 44 * S;
        if (Math.abs(dv) >= half) continue;
        const across = dv / half;
        const q = du - 30 * S * across * across; // past the crest (the horns trail downwind)
        const windward = 56 * S, lee = 15 * S;
        if (q <= -windward || q >= lee) continue;
        const profile = q < 0 ? 0.5 + 0.5 * Math.cos((Math.PI * q) / windward) : 0.5 + 0.5 * Math.cos((Math.PI * q) / lee);
        const body = Math.pow(Math.cos((Math.PI / 2) * across), 1.3);
        const tall = (6 + 9 * hash2(i, j, s + 8)) * S;
        h = Math.max(h, tall * body * profile);
      }
    }
    // Between them: broad swells, and small dunes dimpling the sand every way.
    const swell = this.ergNoise.fbm(x * 0.0028 + 11, z * 0.0028 - 5, 2) * 4;
    const dimples = this.ergNoise.ridged(wx * 0.011 + 3, wz * 0.011 - 8, 2, 2, 0.5, 0.02) * 2.2;
    return h + swell + dimples;
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
    out.erg = w.desert > 0 ? w.desert * smoothstep(0, 0.26, this.ergNoise.fbm(x * 0.00022 + 300, z * 0.00022 - 120, 2)) : 0;
    out.canyon = 0;
    out.canyonZone = 0;
    out.canyonFloor = 0;
    out.canyonCut = 0;
    const flatland = 1 - smoothstep(0.02, 0.3, mask);
    if (flatland <= 0) return out;
    // Canyons: deep winding gorges cut into the dry country (savanna,
    // desert and mesas, not the dune seas), with walls stepping down in
    // benches, and here and there narrowing into a slot canyon about twelve
    // metres wide. Their floors are dry washes. The walls are ragged, not
    // ruled: their line wanders a little and their faces are knobbled with
    // ledges and bulges, as steep as ever.
    const dryLand = smoothstep(0.5, 0.62, dryness) * flatland * (1 - out.erg);
    if (dryLand > 0) {
      // (Some stretches of the network die away altogether, so canyons are
      // a find rather than everywhere.)
      const reach = smoothstep(-0.2, 0.15, this.canyonNoise.noise2D(x * 0.0006 + 170, z * 0.0006 - 90));
      const zone = reach > 0 ? smoothstep(0.06, 0.28, this.canyonNoise.fbm(x * 0.00025 - 70, z * 0.00025 + 20, 2)) * dryLand * reach : 0;
      out.canyonZone = zone;
      if (zone > 0) {
        const qx = x + this.canyonNoise.noise2D(x * 0.003 + 5, z * 0.003) * 60;
        const qz = z + this.canyonNoise.noise2D(x * 0.003, z * 0.003 - 9) * 60;
        const n = this.canyonNoise.noise2D(qx * 0.0013, qz * 0.0013);
        const ragged = this.canyonNoise.noise2D(x * 0.07 + 13, z * 0.07 - 21) * 2.0 + this.canyonNoise.noise2D(x * 0.19 - 7, z * 0.19 + 3) * 0.9 + this.canyonNoise.noise2D(x * 0.45 + 2, z * 0.45 - 6) * 0.4;
        const dist = Math.abs(n) / (0.0013 * 1.7) + ragged; // metres from the canyon's line, roughly
        const slot = smoothstep(0.5, 0.66, this.canyonNoise.noise2D(x * 0.0022 + 40, z * 0.0022 - 40));
        const half = 6 + (1 - slot) * (10 + 18 * (this.canyonNoise.noise2D(x * 0.0015 - 8, z * 0.0015 + 3) * 0.5 + 0.5));
        const depth = (26 + 26 * (this.canyonNoise.noise2D(x * 0.0009 + 60, z * 0.0009) * 0.5 + 0.5)) * zone;
        const wall = 3 + (1 - slot) * (1.5 + depth * 0.12);
        if (dist < half + wall) {
          // Down in three benches (the wall's rock comes away in layers),
          // its face knobbled.
          const t = Math.max(0, (dist - half) / wall);
          const k = t * 3, i = Math.floor(k);
          const stepped = t >= 1 ? 1 : (i + smoothstep(0.55, 1, k - i)) / 3;
          const knobs = t > 0 && t < 1 ? (this.canyonNoise.noise2D(x * 0.33 + 5, z * 0.33 - 5) * 2.2 + this.canyonNoise.noise2D(x * 0.8 - 11, z * 0.8 + 7) * 0.9) * 4 * t * (1 - t) : 0;
          out.canyonCut = Math.max(0, depth * (1 - stepped) - knobs * zone);
          out.canyonFloor = dist < half ? zone : 0;
        }
        out.canyon = zone * (1 - smoothstep(half + wall, half + wall + 4, dist));
      }
    }
    const mesa = smoothstep(0.12, 0.38, this.mesaNoise.fbm(x * 0.00025 + 40, z * 0.00025 - 40, 2)) * smoothstep(0.42, 0.6, dryness) * flatland * (1 - out.erg);
    if (mesa > 0) {
      const wx = x + this.mesaNoise.noise2D(x * 0.004, z * 0.004) * 14;
      const wz = z + this.mesaNoise.noise2D(x * 0.004 + 50, z * 0.004) * 14;
      // (The wall lines are ragged, and their faces knobbled with ledges and
      // bulges, as steep as ever.)
      const m = this.mesaNoise.fbm(wx * 0.0016, wz * 0.0016, 3) + this.mesaNoise.noise2D(x * 0.05 + 3, z * 0.05 - 3) * 0.006;
      const s1 = smoothstep(0.16, 0.2, m), s2 = smoothstep(0.34, 0.375, m), s3 = smoothstep(0.5, 0.53, m);
      const wallness = 4 * (s1 * (1 - s1) + s2 * (1 - s2) + s3 * (1 - s3));
      const knobs = wallness > 0 ? (this.mesaNoise.noise2D(x * 0.3 - 9, z * 0.3 + 9) * 1.8 + this.mesaNoise.noise2D(x * 0.75 + 4, z * 0.75 - 4) * 0.8) * Math.min(1, wallness) : 0;
      const layers = s1 * 22 + s2 * 16 + s3 * 11 + knobs;
      out.mesa = mesa;
      out.mesaHeight = mesa * layers;
    }
    // Escarpments: most often in rolling hills and forest country.
    const green = w.temperate + 0.5 * w.savanna;
    const hilly = smoothstep(-0.45, 0.15, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
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
    const r = range + MOUNTAIN_BIAS - 0.9 * smoothstep(0.85, 1.25, this.#rawAridity(x, z));
    return { ...this.#features(x, z, this.#rawAridity(x, z), smoothstep(0.08, 0.55, r), w) };
  }

  /** How much (x, z) is open sea rather than an inland lake (0..1). */
  getOceanness(x, z) {
    const f = this.#rangeField(x, z);
    const dryness = this.#rawAridity(x, z);
    const mask = smoothstep(0.08, 0.55, f.value + MOUNTAIN_BIAS - 0.9 * smoothstep(0.85, 1.25, dryness));
    const continent = this.#continentBase(x, z) + 0.34 * smoothstep(0.62, 0.8, dryness) + 0.1 * smoothstep(0.3, 0.5, dryness) + 0.5 * mask;
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
    // (Wetland shores are soft: mud, grass and dirt, no rock.)
    if (p > 0.38 && this.getBiomeWeights(x, z, {}).wetland < 0.3) return { kind: 'rock', fade, ocean };
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
    // (Never near volcanic country: the volcano noise must be well below
    // where its highlands begin.)
    const zone = smoothstep(0.27, 0.43, this.hillsNoise.fbm(x * 0.00016 - 250, z * 0.00016 + 610, 2)) * (1 - smoothstep(0.26, 0.36, this.#volcanoNoise(x, z)));
    if (zone <= 0) return 0;
    // (Whole stretches of country, a few kilometres across, not scraps.)
    return zone * (1 - smoothstep(0.02, 0.2, range)) * (1 - smoothstep(0.45, 0.6, this.#rawAridity(x, z)));
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
        // Ragged outlines: the rock is jointed and weathered, never a clean cylinder.
        const ragged = 1 + 0.16 * this.hillsNoise.noise2D(x * 0.19 + i * 3.1, z * 0.19 - j * 2.3) + 0.07 * this.hillsNoise.noise2D(x * 0.55 - 4, z * 0.55 + 4);
        let h = 0;
        if (kind < 0.35) {
          // A needle.
          const r = 10 + 6 * hash2(i, j, s + 3);
          const t = (Math.hypot(dx, dz) / r) * ragged;
          if (t < 1) h = (18 + 26 * size) * Math.pow(1 - Math.pow(t, 2.6), 0.5);
        } else if (kind < 0.52) {
          // A cluster of spires.
          const count = 4 + Math.floor(hash2(i, j, s + 6) * 4);
          for (let k = 0; k < count; k++) {
            const a = hash2(i + k * 13, j, s + 7) * Math.PI * 2, out = k === 0 ? 0 : 5 + 11 * hash2(i, j + k * 13, s + 8);
            const r = 5.5 + 3 * hash2(i - k, j + k, s + 9);
            const t = (Math.hypot(dx - Math.cos(a) * out, dz - Math.sin(a) * out) / r) * ragged;
            if (t < 1) h = Math.max(h, (13 + 17 * hash2(i + k, j - k, s + 10)) * (k === 0 ? 1.15 : 1) * Math.pow(1 - Math.pow(t, 2.2), 0.5));
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
        // Knobbled faces: ledges, bulges and cracks all over the rock.
        if (h > 0) h += (this.hillsNoise.noise2D(x * 0.4 + 17, z * 0.4 - 17) * 1.3 + this.hillsNoise.noise2D(x * 0.95 - 3, z * 0.95 + 8) * 0.55) * Math.min(1, h / 6);
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
  #rangeField(x, z, out = this._range) {
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
    // No mountain ranges in the green belt round volcanic country.
    const belt = this.#volcanoBelt(x, z);
    if (belt > 0) value = value * (1 - belt) - 0.3 * belt;
    out.x = x;
    out.z = z;
    out.value = value;
    out.size = 0.5 * small + usual + 2 * large;
    out.large = large;
    return out;
  }

  /** How mountainous an area is: 0 = lowland, 1 = in a range. Foothills lie in between. */
  getMountainness(x, z) {
    return smoothstep(0.08, 0.55, this.#rangeField(x, z).value + MOUNTAIN_BIAS - 0.9 * smoothstep(0.85, 1.25, this.#rawAridity(x, z)));
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
    return 0.05 + 0.95 * smoothstep(-0.3, 0.15, n);
  }

  /**
   * Where birches (and, in the Black Hills, aspens) take over the woods
   * (0..1): stands a kilometre or two across.
   */
  getGrove(x, z) {
    return smoothstep(0.16, 0.36, this.groveNoise.fbm(x * 0.0006 + 13, z * 0.0006 - 57, 2));
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
    if (water) return water.crater ? 'Crater lake' : water.pond ? 'Pond' : water.stream ? 'Mountain stream' : 'River';
    const w = this.getBiomeWeights(x, z, {});
    const f = this.getFeatures(x, z);
    if (this.getOceanness(x, z) > 0.5 && height < sea + 34 && this.getSeaCliff(x, z) > 0.5) return 'Sea cliffs';
    if (height < sea + 2.5 && this.getOceanness(x, z) > 0.5 && w.desert < 0.5) return w.volcanic > 0.5 ? 'Black sand beach' : 'Beach';
    const mountains = this.getMountainness(x, z);
    if (mountains > 0.45) return height > 185 ? 'Snowy peaks' : 'Mountains';
    if (mountains > 0.2) return 'Foothills';
    const top = Object.keys(w).reduce((a, b) => (w[a] >= w[b] ? a : b));
    if (top === 'blackHills') return 'Black Hills';
    if (top === 'volcanic') return this.getVolcanic(x, z).crater > 0.5 ? 'Volcano' : 'Volcanic highlands';
    if (top === 'wetland') return height < sea + 2 ? 'Marsh' : 'Wetlands';
    if (f.canyon > 0.5) return f.canyonFloor > 0.5 ? 'Canyon floor' : 'Canyon';
    if (top === 'desert') return f.erg > 0.5 ? 'Dune sea' : f.mesa > 0.4 ? 'Mesas' : 'Desert';
    if (top === 'savanna') return f.mesa > 0.4 ? 'Mesas' : 'Savanna';
    if (f.escarp > 0.5 && f.escarpHeight > 4) return 'Escarpment';
    if (this.getForestDensity(x, z) > 0.55) return this.getGrove(x, z) > 0.5 && height < 110 ? 'Birch forest' : 'Forest';
    if (smoothstep(-0.45, 0.15, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2)) > 0.6) return 'Rolling hills';
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
    // Canyon floors: a pale, stony dry wash.
    if (f && f.canyonFloor > 0.3 && upness > 0.8) out.lerp(WASH, 0.75 * f.canyonFloor);
    // Volcanoes: black tongues of old lava, reddish cinders round the craters.
    if (w.volcanic > 0.02) {
      const v = this.getVolcanic(x, z);
      if (v.cone > 0) out.lerp(SCREE, 0.8 * v.cone); // bare cinder slopes
      if (v.lava > 0) out.lerp(LAVA, 0.85 * v.lava);
      if (v.crater > 0) out.lerp(CINDER, 0.6 * v.crater);
    }
    // Mesa and canyon walls: bands of red and orange sandstone.
    if (upness < 0.85 && f) {
      if (f.mesa > 0.05 || f.canyon > 0.05) {
        const band = Math.floor((height + this.detailNoise.noise2D(x * 0.02, z * 0.02) * 0.8) / 2.4);
        stratum.copy(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]);
        out.lerp(stratum, Math.max(Math.min(1, f.mesa * 1.5), f.canyon) * (1 - smoothstep(0.6, 0.85, upness)));
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
