import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, hashSeed, mulberry32 } from '../noise/random.js';
import { BIOME_IDS, BIOMES, blendedFaceColor, prepareBiome } from './biomes.js';
import { CaveSystem } from './caves/CaveSystem.js';
import { Rivers } from './Rivers.js';
import { BigRivers } from './BigRivers.js';
import { LandmarkSites } from './landmarkSites.js';
import { Color } from 'three';

const RIVERBED = new Color(0x55493b);
const LAKE_FLOOR = new Color(0x6a6658); // (stone and gravel under a landmark's lake: see surfaceColor)
// How much more of the world is mountains than the range noise alone gives.
/**
 * The knobs for how much of the world each biome takes (measure the result
 * with tools/biomes.mjs, or tools/names.mjs for the names the readout
 * shows). Each says which way to turn it, and roughly what a step does.
 */
export const BIOME_TUNING = {
  // Where the green country gives way to the savanna (aridity): higher, less savanna and more green land (+0.01 ≈ -1.2% savanna).
  savannaStart: 0.414,
  // Where the savanna gives way to the desert: higher, less desert.
  desertStart: 0.76,
  // How much of the world lies in the mountain ranges: higher, more mountains and foothills (+0.01 ≈ +1%).
  mountainBias: 0.097,
  // How high (m) the foothills count as mountains: lower, more mountains, fewer foothills.
  mountainsAbove: 103,
  // Jungles: lower, more jungle (-0.01 ≈ +0.25%).
  jungle: -0.005,
  // Pine forests: their size (radius scale): higher, more pine forest.
  pine: 1.15,
  // Redwood forests in the heart of the pine forests near a lake or the sea: lower, more redwood.
  redwood: 0.0,
  // Mangrove coasts on the warm green coasts: lower, more mangrove.
  mangrove: -0.7,
  // How dry a green coast may be and still have mangroves (below where the savanna starts): higher, more.
  mangroveDry: 0.06,
  // How far in from the open sea the mangroves reach (m): higher, more.
  mangroveReach: 1500,
  // Mesas in the dry country: lower, more mesas.
  mesa: 0.06,
  // Wetlands and marshes: their size: higher, more.
  wetland: 1.6,
  // How much of the wetlands is glowing swamp: lower, more.
  glowSwamp: 0.22,
  // Glowing swamps of their own in the green lowlands: the chance of one per square this size (m).
  glowCell: 8000,
  glowChance: 0.55,
  // Badlands in the savanna and the desert: the chance of a patch per 6 km square, and their size.
  badlands: 0.2,
  badlandsSize: 0.78, // (radius: 0.78 ≈ 40% smaller patches)
  // The Cascades (escarpment country with falls): the chance of a patch per 3.2 km square.
  cascades: 0.75,
  // How much of the green country is forest rather than plains: higher, more forest.
  forest: -0.11, // (-0.11: 1% of the map from forest to plains)
};
const MOUNTAIN_BIAS = BIOME_TUNING.mountainBias;
// The Cascades' tiers: where each steps up (on its noise), and how far (m).
const CASCADE_TIERS = [[-0.24, 12], [-0.04, 15], [0.16, 13]];
const T = BIOME_TUNING;
const DUNE = new Color(0xe6b86e); // dune sand
// The reef itself, every surface of it grown over: the low encrusting and
// mound corals, sponges and weed, in a living reef's mix of colours (the
// tans and ochres, cream, rose and coral pink, orange, yellow-green, lilac,
// teal), patch by patch (see surfaceColor).
const SEA_CRUST = [0x4a6a3a, 0x5a7a42, 0x3e5e36, 0x66784a, 0x546a50, 0x6a5a58, 0x4e6644].map((c) => new Color(c));
const CORALS = [0xb08a58, 0xc8a070, 0xd8ccb0, 0xc8708a, 0xd88a5a, 0xa4b058, 0x9a7ab0, 0x5aa0a0, 0x8a6a44, 0xc0b070].map((c) => new Color(c));
const SINTER = new Color(0xe6dcc4); // crusts round hot springs
const MAT = new Color(0xd2803a); // microbial mats at a hot spring's edge
// (Each pool's own: the heat-loving microbes' colours change with the water's heat: see HOT_POOLS in riverData.)
const MATS = [0xd2803a, 0xe0a030, 0xb8b040, 0xc86a2a, 0xd8c060, 0x9a7a40].map((c) => new Color(c));
const WASH = new Color(0xcdb592); // a canyon's dry wash
const LAVA = new Color(0x2b2827); // old lava
const CINDER = new Color(0x6e3b2c); // red cinders
const SCREE = new Color(0x4b423e); // a cinder cone's dark slopes
const ICE = new Color(0x9fcbe0); // glacier ice
const ICE_DEEP = new Color(0x5e9cc8), CREVASSE = new Color(0x3e78a8);
const GLACIER_SNOW = [0xf2f6fa, 0xe8eff6, 0xdfe9f2, 0xf6f8fa].map((c) => new Color(c));
const MORAINE = [0x6a6660, 0x7a756c, 0x5a5650, 0x8a847a].map((c) => new Color(c));
const pickColor = (list, h) => list[Math.floor(h * list.length)];
const ICY_ROCK = new Color(0x7d8ea4); // rock glazed with ice
const GRAVEL = new Color(0x8a8590);
const CASCADE_MOSS = new Color(0x3a7a2a); // thick moss on the Cascades' ground
const CASCADE_CLAY = new Color(0x8e5c40); // bare reddish clay
const CASCADE_ROCK = [0x4a4d4c, 0x585b58, 0x3f4342].map((c) => new Color(c)); // their basalt, layer on layer
// Tide pools: the water held in them, and the rock lip round them, in metres above the sea.
export const TIDE_LEVEL = 0.62;
const TIDE_LIP = 0.8;
const CAVE_DARK = new Color(0x3b3842); // the back of a sea cave, out of the light
const OASIS = new Color(0x7fa84a); // the green round an oasis
const BASALT = new Color(0x1c1a1b); // fresh black basalt
const WET_ROCK = new Color(0x5e5a60); // rock shelves the sea washes over
const POOL_FLOOR = new Color(0x3f5a3a); // weed on a tide pool's floor
const SHORE = {
  mud: new Color(0x5f4a36),
  dirt: new Color(0x7d6547),
  grass: new Color(0x8fbc5c),
  rock: new Color(0x8a8597),
};
// Black sand, the banded ground of a petrified forest, a glowing swamp's moss (see surfaceColor).
const BLACK_SAND = new Color(0x2e2c2e);
const CRATER_SCORCH = new Color(0x4a443e), CRATER_DUST = new Color(0xa49a8a); // (a meteor crater's blasted bowl, and the dust thrown out round it)
const PETRIFIED_BANDS = [new Color(0x9a948e), new Color(0xa88ea8), new Color(0xb47860), new Color(0xd8c8a8)];
const GLOW_MOSS = new Color(0x2e5248);
// Mushroom islands' ground (see surfaceColor).
const MYCELIUM = new Color(0x8a7a86), MYCELIUM_PALE = new Color(0xa898a0), MYCELIUM_DARK = new Color(0x6e5e70);

// Sandstone strata on mesa walls, bottom to top, repeating.
// Each biome's own lake and river banks: the mud at the water's edge, the
// grass of the bank (greener than the land round about) and, where the
// biome is a stony one, its rock (`rock`: how much of the bank is rock,
// 0 none). Blended by the biomes' weights, so they change gradually.
const BANKS = {
  temperate: { mud: 0x5f4d38, bank: 0x7fb24e, rock: 0 },
  smoky: { mud: 0x5a4a38, bank: 0x6ca447, rock: 0 },
  parkland: { mud: 0x6a5a3e, bank: 0x9cc25a, rock: 0 },
  cascades: { mud: 0x4f4a3e, bank: 0x5fa244, rock: 0.35, rockColor: 0x4f5250 },
  pine: { mud: 0x5a4c3e, bank: 0x6f9a4c, rock: 0.1, rockColor: 0x8a8590 },
  jungle: { mud: 0x5a4430, bank: 0x4f9a3c, rock: 0 },
  wetland: { mud: 0x4f4232, bank: 0x6a8e44, rock: 0 },
  mangrove: { mud: 0x4f4232, bank: 0x6a8e44, rock: 0 },
  volcanic: { mud: 0x363333, bank: 0x5d6d41, rock: 0 }, // black sand, native grass (its rocky ground: see getVolcanicRocky)
  savanna: { mud: 0xa48a5e, bank: 0xa6b25a, rock: 0 },
  desert: { mud: 0xc9a974, bank: 0xb7b066, rock: 0 },
  saltFlat: { mud: 0xc9a974, bank: 0xb7b066, rock: 0 },
  blackHills: { mud: 0x5f4a36, bank: 0x7c9a52, rock: 0.3, rockColor: 0x8a8597 },
};
for (const b of Object.values(BANKS)) {
  b.mud = new Color(b.mud);
  b.bank = new Color(b.bank);
  b.rockColor = new Color(b.rockColor ?? 0x8a8597);
}
// The badlands' bands of clay and sandstone, bottom to top (repeating).
const BADLANDS = [0xd9c9a8, 0xc7a07e, 0xe6dcc6, 0xb98b78, 0xa59a8c, 0xdcc49a, 0xc79a86].map((c) => new Color(c));
/** A key for cell (i, j) of a grid, for a Map: a small integer, quick to look up. */
const cellKey = (i, j) => ((i + 32768) << 16) | ((j + 32768) & 0xffff);

const VOLCANIC_ROCK = new Color(0x5e5955); // the volcanic highlands' rocky ground
const bankTmp = new Color();

const STRATA = [0xc4744a, 0xd89a64, 0xb05a3c, 0xe2b482, 0xa8583a, 0xcf8455].map((c) => new Color(c));
const stratum = new Color();
const STRATA_MID = new Color(0xc98458); // (the bands' average, to soften them towards)

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * A sea cave's roof over the water, in metres above the sea, `a` metres
 * back into the cliff and `b` across the mouth: an arch, lower towards the
 * back (and down into the rock beyond the mouth's sides).
 */
export function caveRoof(c, a, b) {
  const q = Math.min(1, Math.abs(b) / c.w);
  return c.A * Math.sqrt(1 - q * q) * (1 - 0.45 * smoothstep(c.d * 0.4, c.d, a)) - 0.4;
}

/**
 * A sandstone arch (see TerrainGenerator.mesaArches) is one band of rock
 * bowed over from one foot to the other, like Delicate Arch: thick where it
 * rises out of the ground, thinning over the crown, bending a little out
 * of line. Its middle line at `a` (0 at foot A, up over the crown at π/2,
 * to foot B at π): { x, y, z }, the direction across the band in the arch's
 * plane `n` ([x, y, z], out from the opening), the sideways direction
 * `side` ([x, 0, z]), and the band's half-thickness `th` (along n) and
 * half-width `wd` (sideways).
 */
export function mesaArchAt(arch, a) {
  const centre = (q) => {
    const s = (1 - Math.cos(q)) / 2, sin = Math.max(0, Math.sin(q));
    const along = s + arch.lean * 0.08 * sin; // (the crown off to one side: one leg stands steeper)
    const off = arch.bend * sin * arch.H * 0.12; // (bowed a little out of line)
    const y = arch.base - 1.5 + (arch.top - arch.leg * 0.5 - arch.base + 1.5) * Math.pow(sin, 0.72);
    return [along, off, y];
  };
  const vx = arch.bx - arch.ax, vz = arch.bz - arch.az, L = Math.hypot(vx, vz);
  const ux = vx / L, uz = vz / L;
  const [s, off, y] = centre(a);
  const e = 0.004, p0 = centre(Math.max(0, a - e)), p1 = centre(Math.min(Math.PI, a + e));
  // The tangent (along the axis, up), and across it, pointing out (up at the crown).
  const tl = (p1[0] - p0[0]) * L, ty = p1[2] - p0[2], tn = Math.hypot(tl, ty) || 1;
  const nl = -ty / tn, ny = tl / tn;
  const thin = Math.sin(a);
  return {
    x: arch.ax + ux * s * L - uz * off,
    z: arch.az + uz * s * L + ux * off,
    y,
    n: [ux * nl, ny, uz * nl],
    side: [-uz, 0, ux],
    th: arch.leg * (0.5 + 0.55 * Math.pow(1 - thin, 1.5)) * (a < Math.PI / 2 ? 1 + 0.12 * arch.lean : 1 - 0.12 * arch.lean),
    wd: arch.leg * (0.6 + 0.45 * (1 - thin)),
  };
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
    this._config = config;
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
    this.smokyNoise = new SimplexNoise(this.seed + 149); // Smoky Mountains country
    this.jungleMtnNoise = new SimplexNoise(this.seed + 171); // the jungle mountains' peaks
    this.valleyNoise = new SimplexNoise(this.seed + 151); // the valleys through the hills
    this._islands = new Map(); // (see #island)
    this.mesaNoise = new SimplexNoise(this.seed + 19);
    this.escarpNoise = new SimplexNoise(this.seed + 20);
    this.volcanoNoise = new SimplexNoise(this.seed + 140); // volcanic highlands
    this.wetNoise = new SimplexNoise(this.seed + 141); // wetlands
    this.canyonNoise = new SimplexNoise(this.seed + 142);
    this.coastNoise = new SimplexNoise(this.seed + 143); // sea cliffs
    this.groveNoise = new SimplexNoise(this.seed + 144); // birch woods
    this.jungleNoise = new SimplexNoise(this.seed + 145); // jungles
    this.pineNoise = new SimplexNoise(this.seed + 148); // pine forests
    this.meadowNoise = new SimplexNoise(this.seed + 147); // wildflower meadows
    this._cones = new Map(); // volcano cell -> cone (or null)
    this._contX = NaN;
    this._contZ = NaN;
    this._cont = 0;
    this._range = { value: 0, size: 1, large: 0 };

    this.biomes = Object.fromEntries(BIOME_IDS.map((id) => [id, prepareBiome(BIOMES[id])]));
    this._weights = Object.fromEntries(BIOME_IDS.map((id) => [id, id === 'temperate' ? 1 : 0]));
    this._lastWeights = { x: NaN, z: NaN, range: NaN };
    this._features = { mesa: 0, mesaTop: 0, escarp: 0, hills: 0, erg: 0, canyon: 0, canyonFloor: 0, canyonCut: 0 };
    this._erg = 0; // the last point's dune sea, for its roughness
    this.footprint = 0; // metres between the points of the mesh being built (see ChunkMesher)
    this.bigRivers = new BigRivers(this, config);
    this.rivers = new Rivers(this, config);
    this.landmarks = new LandmarkSites(this); // (the twelve kinds of landmark, and the hollows some of them are)
    this.caves = new CaveSystem(this, config);
  }

  /**
   * How dry the climate is at (x, z), 0 (wet) to 1 (arid). Changes over
   * kilometres, warped so the biome borders wander rather than run straight.
   */
  getAridity(x, z, range = this.#rangeField(x, z).value) {
    // A desert always has a wide band of savanna round it: within a few
    // hundred metres of desert country the land is never greener than savanna.
    const a = this.#baseAridity(x, z, range);
    if (a >= 0.6) return a;
    // (And savanna of its own here and there out in the green country: a
    // rounded stretch of dry grassland and scattered trees, dry enough for
    // savanna but never for desert.)
    const own = 0.6 * this.#savannaBlob(x, z);
    if (a >= 0.52) return Math.max(a, own);
    return Math.max(a, own, 0.52 * smoothstep(0.62, 0.7, this.#aridRange(x, z, 1)));
  }

  /** Where savanna stands on its own, away from any desert (0..1). */
  #savannaBlob(x, z) {
    return this.#blobs('savanna', x, z, 7000, 0.45, 1400, 2600, 0x5a7a, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value;
      const a = this.#baseAridity(px, pz, r);
      // (Out in the green country, well away from any desert, clear of the
      // ranges and of volcanic country, on dry land.)
      return a < 0.48 && r < 0.25 && this.#aridRange(px, pz, 0) < 0.6 && this.#volcanoBelt(px, pz) < 0.3 && this.#continentBase(px, pz) - this._contLift > -0.45 ? 1 : 0;
    });
  }

  #baseAridity(x, z, range) {
    // Mountains catch the rain: around a range the land is greener, so a
    // desert gives way to savanna before it reaches the mountains, rather
    // than cutting through them.
    // Finer detail on top of the broad climate breaks biomes into smaller
    // patches (the land's shape follows only the broad climate, so it
    // stays smooth).
    // (Only near a real border between the kinds of country, where it makes
    // the border wander: deep in green country it never raises a speck of
    // savanna, nor deep in the dry country a speck of green.)
    const base = this.#rawAridity(x, z) - 0.55 * smoothstep(-0.12, 0.4, range);
    const border = smoothstep(0.22, 0.34, base) * (1 - smoothstep(0.8, 0.95, base));
    const detail = border > 0 ? this.aridityNoise.fbm(x * 0.0005 + 300, z * 0.0005 - 300, 2) * 0.22 * border : 0;
    const aridity = Math.min(1, Math.max(0, base + detail));
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
      for (const id of BIOME_IDS) out[id] = m[id];
      return out;
    }
    this.#biomeWeights(x, z, out, range);
    m.x = x;
    m.z = z;
    m.range = range;
    for (const id of BIOME_IDS) m[id] = out[id];
    return out;
  }

  #biomeWeights(x, z, out, range) {
    range ??= this.#rangeField(x, z).value;
    const a = this.getAridity(x, z, range);
    const temperate = 1 - smoothstep(T.savannaStart, T.savannaStart + 0.2, a); // (broad transitions, not a line on the map)
    const desert = smoothstep(T.desertStart, T.desertStart + 0.2, a);
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
    // The Smoky Mountains: old, worn-down mountains, long rounded ridges
    // under deep forest, in stretches of the wet green country (see #smokyZone).
    const sz = temperate * (1 - hz) * (1 - vz) > 0 ? this.#smokyZone(x, z, range) : 0;
    const smoky = temperate * (1 - hz) * (1 - vz) * sz;
    // Wetlands: only in the wettest, low, flat country (so never anywhere
    // near a desert: the whole savanna lies between them).
    let wz = this.#wetZone(x, z, range, a);
    const green = temperate * (1 - hz) * (1 - vz) * (1 - sz);
    // Jungles: in the warmest, wettest lowlands, well away from dry
    // country and mountains (see #jungleZone).
    // (A jungle is jungle right through: wetlands, forest and plains give way to it.)
    const jz = green > 0 ? this.#jungleZone(x, z, range, a) : 0;
    // Round most jungles, a narrow ring of swampy wetland where the jungle
    // gives way to the forest and plains (broken here and there).
    if (green > 0 && a <= 0.5) {
      const suit = this.#jungleSuit(x, z);
      const ring = smoothstep(0.13, 0.19, suit) * (1 - smoothstep(0.27, 0.33, suit));
      if (ring > 0) wz = Math.max(wz, ring * smoothstep(-0.35, -0.05, this.wetNoise.noise2D(x * 0.0012 + 17, z * 0.0012 - 3)));
    }
    // (No swamp of either kind ever in or right by the mountains: there it would be a pit.)
    if (wz > 0) wz *= 1 - smoothstep(0.05, 0.2, this.#mountainsAround(x, z));
    // Pine forests: in the hill country leading up to the mountain ranges
    // (see #pineZone).
    const rest = green * (1 - wz) * (1 - jz);
    const pz = rest > 0 ? this.#pineZone(x, z, range, a) : 0;
    // Redwood forests: in the heart of some pine forests (surrounded by
    // them), near a lake or the sea.
    const rz = pz > 0.5 ? this.#redwoodZone(x, z) * smoothstep(0.6, 0.95, pz) : 0;
    const open = rest * (1 - pz);
    // Birch and aspen parkland: rounded stretches of the green lowlands
    // (not up towards the ranges), open grass with groves in it.
    const pk = open > 0 ? this.#parkland(x, z, range) : 0;
    // The Cascades: escarpment country, stepping up in tiers of cliffs
    // with falls pouring off them (see cascadesRelief).
    const ck = open > 0 ? this.#cascadesZone(x, z, range) : 0;
    out.temperate = open * (1 - pk) * (1 - ck);
    out.parkland = open * pk * (1 - ck);
    out.cascades = open * ck;
    out.pine = rest * pz * (1 - rz);
    out.redwood = rest * pz * rz;
    out.wetland = green * wz;
    out.jungle = green * jz * (1 - wz);
    // Badlands: patches of eroded, banded clay and sandstone in the
    // savanna, the desert and the salt flats.
    const bl = savanna + desert > 0.02 ? this.#badlands(x, z) : 0;
    // (And now and then out in the savanna too: the Black Hills rising out of the dry grassland, as they do.)
    const dh = savanna > 0.3 && !this._probing ? this.#dryHills(x, z, range) * (1 - bl) : 0;
    out.savanna = savanna * (1 - bl) * (1 - dh);
    // Salt flats: the dry beds of old lakes in the heart of the deserts.
    const sf = desert > 0.5 ? this.#saltFlat(x, z) : 0;
    out.desert = desert * (1 - sf) * (1 - bl);
    out.saltFlat = desert * sf * (1 - bl);
    out.badlands = (savanna + desert) * bl;
    out.blackHills = hills + savanna * dh;
    // (The Smoky Mountains reach out over the edge of the savanna too, the green coming with them.)
    const ssz = out.savanna > 0.02 && !this._probing ? (sz || this.#smokyZone(x, z, range)) : 0;
    const smokySavanna = out.savanna * ssz;
    out.savanna -= smokySavanna;
    out.smoky = smoky + smokySavanna;
    out.volcanic = volcanic;
    // Round the mountains: their foothills, never jungle (it gives way to the
    // ordinary woods there). The jungle mountains are country of their own,
    // ringed by the foothills jungle (see #jungleMtnBlob). And here and there in the foothills, a grove
    // of cherry blossom highlands (see #cherryLand); by the jungles and the
    // foothills jungle, now and then a bamboo forest (see #bambooLand).
    // They take over the green country where they are.
    if (!this._probing) {
      const mtn = this.getMountainness(x, z), band = smoothstep(0.32, 0.5, mtn);
      // (The jungle mountains: country of their own, see #jungleMtn.)
      const jb = this.#jungleMtn(x, z, mtn);
      if (band > 0 && out.jungle > 0) {
        const j = out.jungle * band * (1 - jb);
        out.jungle -= j;
        out.temperate += j;
      }
      const own = Math.min(1, out.temperate + out.parkland + out.cascades + out.pine + out.redwood + out.jungle + out.wetland + out.smoky);
      // (The jungle range's mountains themselves, its high ground: the jungle mountains, green, rocky. Its
      // lower ground round them, the foothills jungle.)
      const km = smoothstep(0.5, 0.8, jb);
      const kj = smoothstep(0.12, 0.45, jb) * (1 - km); // (all of it its own: nothing else mixed in)
      const cl = this.#cherryLand(x, z), bl = this.#bambooLand(x, z);
      const kc = cl * own * (1 - kj - km), kb = bl * own * (1 - kj - km - kc);
      if (kj + km + kc + kb > 0) for (const id of BIOME_IDS) out[id] *= 1 - kj - km - kc - kb;
      out.jungleFoothills = kj;
      out.jungleMountains = km;
      out.cherry = kc;
      out.bamboo = kb;
    } else (out.cherry = 0), (out.bamboo = 0), (out.jungleFoothills = 0), (out.jungleMountains = 0);
    // And now and then a glowing swamp of its own out in the green lowlands
    // (see #glowBlob): wetland, taking over whatever was there.
    const gb = this._probing ? 0 : this.#glowBlob(x, z);
    if (gb > 0) {
      for (const id of BIOME_IDS) out[id] *= 1 - gb;
      out.wetland += gb;
    }
    // On the open sea's warm coasts: mangroves. They take over whatever
    // was there.
    // (Not over the wetlands: they stay as they are.)
    let m = this.#mangrove(x, z, a, range) * (1 - smoothstep(0.2, 0.5, out.wetland));
    if (m > 0) m *= smoothstep(0.35, 0.7, this.#mangroveSpread(x, z)); // (kept off its edges: see #mangroveSpread)
    if (m > 0) for (const id of BIOME_IDS) out[id] *= 1 - m;
    out.mangrove = m;
    return out;
  }

  /** Where birch and aspen parkland lies in the green country (0..1). */
  #parkland(x, z, range) {
    const low = 1 - smoothstep(0.15, 0.3, smoothstep(0.08, 0.55, range + MOUNTAIN_BIAS - this.#drySuppress(x, z)));
    if (low <= 0) return 0;
    return low * this.#blobs('parkland', x, z, 5000, 1, 1300, 2600, 0xb12c, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value;
      const a = this.getAridity(px, pz, r);
      // (Cool green country, well clear of the ranges, the savanna and the jungles.)
      return a < 0.34 && r < 0.2 && this.#volcanoBelt(px, pz) < 0.3 && this.#jungleNear(px, pz) < 0.05 && this.#continentBase(px, pz) - this._contLift > -0.35 ? 1 : 0;
    });
  }

  /** Where the Cascades lie in the green country (0..1). */
  #cascadesZone(x, z, range) {
    const low = 1 - smoothstep(0.1, 0.25, smoothstep(0.08, 0.55, range + MOUNTAIN_BIAS - this.#drySuppress(x, z)));
    if (low <= 0) return 0;
    return low * this.#blobs('cascades', x, z, 3200, T.cascades, 825, 1300, 0xca5c, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value;
      const a = this.getAridity(px, pz, r);
      // (Wet green country clear of the ranges, the sea, the savanna, the
      // jungles, the volcanoes and the Smoky Mountains.)
      return a < 0.4 && r < 0.3 && this.#volcanoBelt(px, pz) < 0.3 && this.#jungleNear(px, pz) < 0.05 && this.#smokyBlob(px, pz) < 0.05 && this.#continentBase(px, pz) - this._contLift > -0.45 ? 1 : 0;
    }) * (1 - smoothstep(0, 0.15, this.#seaCoast(x, z)));
  }

  /**
   * The Cascades' land (metres to add): broad tiers stepping up across the
   * country, each ending in a cliff 15 to 25 m tall, its line ragged with
   * bays and headlands, its face dark rock knobbled with ledges; the tops
   * gently rolling.
   */
  cascadesRelief(x, z, w = 1) {
    const N = this.escarpNoise;
    const wx = x + N.noise2D(x * 0.0025 + 11, z * 0.0025) * 45, wz = z + N.noise2D(x * 0.0025, z * 0.0025 - 11) * 45;
    const ragged = N.noise2D(x * 0.018 + 3, z * 0.018 - 3) * 0.022 + N.noise2D(x * 0.05 - 8, z * 0.05 + 2) * 0.006;
    const inside = smoothstep(0.5, 0.97, w); // (out towards the edge, smooth gentle swells, no ragged steps)
    const m = N.fbm(wx * 0.0008 + 500, wz * 0.0008 - 500, 3) + ragged * inside;
    // (Sheer in the heart of the country; out towards its edge the steps
    // soften into slopes, and the land eases down into what's round it.)
    const sharp = 0.006 / Math.max(0.012, inside * inside); // (soft slopes until well inside the country)
    let h = 0, face = 0;
    CASCADE_TIERS.forEach(([e, H], i) => {
      const t = smoothstep(e, e + sharp, m);
      // (Each cliff higher in some places and lower in others along its
      // length: from a low step up to a good cliff.)
      const tall = 0.45 + 0.95 * smoothstep(-0.7, 0.8, N.noise2D(x * 0.0011 + i * 37.1, z * 0.0011 - i * 19.3));
      h += t * H * tall;
      face = Math.max(face, 4 * t * (1 - t) * Math.min(1, tall) * w);
    });
    // (Ledges and bulges on the faces; the tops gently rolling.)
    const knobs = face > 0 ? (N.noise2D(x * 0.21 + 5, z * 0.21 - 5) * 1.2 + N.ridged(x * 0.09 - 3, z * 0.09 + 9, 2, 2, 0.5, 0.05) * 1.3) * face : 0;
    const swell = N.fbm(x * 0.0045 + 40, z * 0.0045, 2) * 2.5 + N.fbm(x * 0.0012 - 70, z * 0.0012 + 30, 2) * 4;
    return 3 + h + knobs + swell;
  }

  /**
   * The Cascades' share of the biomes round (x, z), smoothed over some 60 m
   * (on a 16 m grid, remembered, blended between its points).
   */
  #cascadesShare(x, z) {
    const G = 16, gx = Math.floor(x / G), gz = Math.floor(z / G), fx = x / G - gx, fz = z / G - gz;
    const cache = this._cascShare ?? (this._cascShare = new Map()), o = {};
    const at = (i, j) => {
      const key = (i + 65536) * 131072 + (j + 65536);
      let v = cache.get(key);
      if (v === undefined) {
        const cx = i * G, cz = j * G;
        v = this.getBiomeWeights(cx, cz, o).cascades;
        for (const [r, k] of [[30, 8], [60, 8]]) for (let q = 0; q < k; q++) v += this.getBiomeWeights(cx + Math.cos(q * 0.785 + r) * r, cz + Math.sin(q * 0.785 + r) * r, o).cascades;
        v /= 17;
        if (cache.size > 80000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a = at(gx, gz) + (at(gx + 1, gz) - at(gx, gz)) * fx, b = at(gx, gz + 1) + (at(gx + 1, gz + 1) - at(gx, gz + 1)) * fx;
    const v = a + (b - a) * fz;
    this._lastWeights.x = NaN; // (the remembered weights were another point's)
    return v;
  }

  /** Where redwoods take over in the heart of a pine forest near a lake or the sea (0..1). */
  #redwoodZone(x, z) {
    const groves = smoothstep(T.redwood, T.redwood + 0.15, this.lakeNoise.fbm(x * 0.0005 - 40, z * 0.0005 + 70, 2));
    if (groves <= 0) return 0;
    // (Near the water: a lake basin or the open sea's coast within a kilometre or so.)
    const lake = smoothstep(0.2, 0.4, this.lakeNoise.fbm(x * 0.0017, z * 0.0017, 2) + 0.25 * this.lakeNoise.fbm(x * 0.0006 + 9, z * 0.0006, 2));
    // (And well away from the big mountain ranges: on the low ground.)
    const ranges = 1 - smoothstep(0.12, 0.25, this.#rangeField(x, z, {}).value);
    if (ranges <= 0) return 0;
    return groves * ranges * Math.max(lake, this.#seaCoast(x, z));
  }

  /** Where badlands lie in the dry country (0..1). */
  #badlands(x, z) {
    return this.#blobs('badlands', x, z, 6000, T.badlands, 700 * T.badlandsSize, 1500 * T.badlandsSize, 0xbad1, (px, pz) => (this.getAridity(px, pz) > T.savannaStart + 0.25 && this.#rangeField(px, pz, {}).value < 0.1 && this.#seaCoast(px, pz) < 0.02 && this.getOceanness(px, pz) < 0.02 ? 1 : 0)) * (1 - smoothstep(0, 0.2, this.#seaCoast(x, z)));
  }

  /**
   * The badlands' land (metres to add): sharp, eroded ridges and buttes of
   * banded clay over a flat floor, gullied all over.
   */
  badlandsRelief(x, z) {
    // Where the eroded country stands, and the open prairie floor between.
    const field = smoothstep(-0.45, -0.15, this.mesaNoise.fbm(x * 0.0014 - 70, z * 0.0014 + 40, 2));
    if (field <= 0) return 0;
    // (Warped, so no ridge runs dead straight.)
    const wx = x + this.mesaNoise.noise2D(x * 0.005 + 7, z * 0.005) * 30, wz = z + this.mesaNoise.noise2D(x * 0.005, z * 0.005 + 7) * 30;
    // Ridges branching into ridges: each finer set of spurs grows only off
    // the ridges of the set above it (a ridged multifractal), so the main
    // ridges throw off sediment spurs down their flanks, and those smaller
    // spurs again, with gullies between every one.
    let h = 0, weight = 1, f = 0.0055, amp = 1;
    for (let o = 0; o < 4; o++) {
      let r = 1 - Math.abs(this.mesaNoise.noise2D(wx * f + o * 37.1, wz * f - o * 19.7));
      r *= r; // (crests sharpened, but rounded, never a needle)
      r *= weight;
      h += r * amp;
      weight = Math.min(1, r * 2.2);
      f *= 2.15;
      amp *= 0.5;
    }
    // (Every height between the floor and the crests, falling away down
    // each spur: no flat cap, no two levels.)
    h = Math.pow(smoothstep(0.08, 1.7, h), 1.25) * 58 * field;
    // The harder bands just showing as faint ledges.
    const step = 3, t = (h % step) / step;
    return 0.85 * h + 0.15 * (Math.floor(h / step) * step + smoothstep(0.3, 0.7, t) * step);
  }

  /** Where salt flats lie deep in the desert (0..1): dead flat, white. */
  #saltFlat(x, z) {
    return this.#blobs('salt', x, z, 7000, 0.7, 700, 1500, 0x5a17, (px, pz) => {
      // (Only in the driest heart of a desert, clear of ranges.)
      if (this.#rawAridityAt(px, pz) < 1.1) return 0;
      return this.#rangeField(px, pz, {}).value < 0.05 && this.#dryAround(px, pz) > 1.0 ? 1 : 0;
    });
  }

  /**
   * How much the open sea's shore is near (x, z) (0..1): on the land within
   * half a kilometre or so of it (`reach` m), and the shallows just off it.
   * On a 64 m grid (remembered) and blended between its points.
   */
  #seaCoast(x, z, reach = 600) {
    const G = 64;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const caches = this._seaCoast ?? (this._seaCoast = new Map());
    const cache = caches.get(reach) ?? (caches.set(reach, new Map()), caches.get(reach));
    const basin = (px, pz) => this.#seaBasin(px, pz, this.#rangeField(px, pz, {}), this.#rawAridityAt(px, pz));
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        const cx = i * G, cz = j * G;
        const here = basin(cx, cz);
        v = 0;
        if (here < 0.95) {
          let near = here;
          for (let k = 0; k < 8 && near < 0.5; k++) {
            const a = (k / 8) * Math.PI * 2;
            near = Math.max(near, basin(cx + Math.cos(a) * reach, cz + Math.sin(a) * reach));
          }
          v = smoothstep(0.15, 0.5, near) * (1 - smoothstep(0.75, 0.95, here));
          if (v > 0) v *= smoothstep(0.3, 0.6, this.#openSea(cx, cz));
        }
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /**
   * Mangrove coast (0..1) along stretches of the open sea's warm, humid
   * shores (Florida's), given the climate there (`a`) and the range field.
   */
  #mangrove(x, z, a, range) {
    // (Warm, but on the green coasts: never next to a savanna or a desert.)
    let m = (1 - smoothstep(T.savannaStart + T.mangroveDry, T.savannaStart + T.mangroveDry + 0.07, a)) * (1 - smoothstep(0.02, 0.32, range)); // (fading out slowly up into hills: no wall where they meet)
    if (m > 0) m *= smoothstep(T.mangrove, T.mangrove + 0.2, this.coastNoise.fbm(x * 0.00028 + 310, z * 0.00028 - 170, 2));
    if (m <= 0 || this.#volcanoBelt(x, z) > 0.3) return 0;
    return m * smoothstep(0, 0.45, this.#seaCoast(x, z, T.mangroveReach)); // (eased in over a good distance from the coast: no wall where the hills behind meet it)
  }

  /**
   * The mangrove coasts' share spread smooth over a few hundred metres (on
   * a 48 m grid, remembered): the land is brought down to the swamp by
   * this, so it slopes down to it over that distance, high ground behind
   * it or not, never a wall where the swamp's edge would be. (The swamp
   * itself, its trees and mud, keeps to where this is well up: see
   * #biomeWeights.)
   */
  #mangroveSpread(x, z) {
    const G = 48;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._mangroveSpread ?? (this._mangroveSpread = new Map());
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        const cx = i * G, cz = j * G;
        // (Quick outs first: no mangrove coast for hundreds of metres round
        // where the coast noise is well low, or it's dry or up in the ranges.)
        let coast = this.coastNoise.fbm(cx * 0.00028 + 310, cz * 0.00028 - 170, 2) > T.mangrove - 0.1 ? 1 : 0;
        if (coast) {
          const range = this.#rangeField(cx, cz, {}).value;
          coast = range < 0.5 && this.getAridity(cx, cz, range) < T.savannaStart + 0.06 ? this.#seaCoast(cx, cz, T.mangroveReach) : -1;
        }
        for (let k = 0; k < 8 && coast === 0; k++) coast = this.#seaCoast(cx + Math.cos((k / 8) * Math.PI * 2) * 400, cz + Math.sin((k / 8) * Math.PI * 2) * 400, T.mangroveReach);
        v = 0;
        if (coast > 0) {
          const one = (px, pz) => {
            const range = this.#rangeField(px, pz, {}).value;
            return this.#mangrove(px, pz, this.getAridity(px, pz, range), range);
          };
          let sum = one(cx, cz) * 2;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            sum += one(cx + Math.cos(a) * 110, cz + Math.sin(a) * 110) + one(cx + Math.cos(a + 0.4) * 230, cz + Math.sin(a + 0.4) * 230) + one(cx + Math.cos(a + 0.2) * 350, cz + Math.sin(a + 0.2) * 350) * 0.6;
          }
          v = sum / 22.8;
        }
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    return (at(gx, gz) * (1 - fx) + at(gx + 1, gz) * fx) * (1 - fz) + (at(gx, gz + 1) * (1 - fx) + at(gx + 1, gz + 1) * fx) * fz;
  }

  /** The broad continent noise alone (low near the coasts), remembered for the last point. */
  #continentBase(x, z) {
    if (x !== this._contX || z !== this._contZ) {
      this._contX = x;
      this._contZ = z;
      // (Broad oceans tens of kilometres across, well apart; the smaller
      // dips of the continent are lakes.)
      // Away from them the continent stands higher (fewer, smaller
      // lakes), though the land itself is no higher: `_contLift` is how
      // much of it is that.
      const basin = smoothstep(0.15, 0.35, this.continentNoise.fbm(x * 0.00005 + 500, z * 0.00005 - 700, 2));
      this._contLift = 0.45 * (1 - basin);
      this._cont = this.continentNoise.fbm(x * 0.0004, z * 0.0004, 3) + 0.015 + this._contLift - 0.8 * basin;
    }
    return this._cont;
  }

  /** The slow noise volcanic highlands follow (high where they are), remembered for the last point. */
  #volcanoNoise(x, z) {
    if (x !== this._vnX || z !== this._vnZ) {
      this._vnX = x;
      this._vnZ = z;
      // (Warped, so the edges of volcanic country wander rather than run
      // for kilometres in a straight line, as such slow noise does.)
      const wx = x + this.volcanoNoise.fbm(x * 0.0004 + 31, z * 0.0004 - 57, 2) * 1400;
      const wz = z + this.volcanoNoise.fbm(x * 0.0004 - 83, z * 0.0004 + 19, 2) * 1400;
      this._vn = this.volcanoNoise.fbm(wx * 0.00005 + 900, wz * 0.00005 - 300, 2);
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

  /** How much (x, z) is right by volcanic country, in the green round it but not in it (0..1). */
  volcanicNear(x, z) {
    const n = this.#volcanoNoise(x, z);
    return smoothstep(0.42, 0.46, n) * (1 - smoothstep(0.48, 0.51, n));
  }

  /**
   * Where volcanic highlands lie (0..1): rare, broad stretches in the heart
   * of their green belt, only where the belt is at its fullest for a good
   * kilometre all round (so there's always that much forest and hill
   * country between them and anything else).
   */
  #volcanoZone(x, z, range) {
    if (smoothstep(0.51, 0.61, this.#volcanoNoise(x, z)) <= 0) return 0;
    // (Never a little scrap of it: under about a square kilometre, it goes.)
    // (Mountain ranges cut into it too, so they count before it's sized.)
    const keep = this.#minSize('volcanic', x, z, (px, pz) => this.#volcanoRaw(px, pz) * (1 - smoothstep(0.02, 0.2, this.#rangeField(px, pz, {}).value)), 0.5, 4.5);
    return keep > 0 ? this.#volcanoRaw(x, z) * keep * (1 - smoothstep(0.02, 0.2, range)) : 0;
  }

  /** Volcanic highlands before they're kept to a good size (see #volcanoZone). */
  #volcanoRaw(x, z) {
    const zone = smoothstep(0.51, 0.61, this.#volcanoNoise(x, z));
    if (zone <= 0) return 0;
    let ring = Infinity;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      for (const d of [700, 1400]) ring = Math.min(ring, this.#volcanoNoise(x + Math.cos(a) * d, z + Math.sin(a) * d));
    }
    return zone * smoothstep(0.4, 0.46, ring);
  }

  /**
   * Rounded patches of some kind of country (0..1 at (x, z)): now and then
   * (`chance`) in each `C`-metre cell, a blob `rmin` to `rmax` metres in
   * radius, its outline wobbling, centred where the country suits it
   * (`suit` at its middle, and fairly well most of the way out; and
   * `centre`, if given, of its middle and radius). Blobs,
   * never strips or lines; and never smaller than `rmin` across. Remembered.
   */
  #blobs(key, x, z, C, chance, rmin, rmax, salt, suit, centre = null) {
    const all = this._blobs ?? (this._blobs = {});
    const cache = all[key] ?? (all[key] = new Map());
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    // (The blobs of the cells round about, gathered once for the cell
    // (x, z) is in: the next point asked for is most often in it too.)
    let near = cache.near;
    if (!near || cache.ci !== ci || cache.cj !== cj) {
      const nears = cache.nears ?? (cache.nears = new Map()), k = cellKey(ci, cj);
      near = nears.get(k);
      if (!near) {
        near = [];
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const b = this.#blobCell(cache, ci + di, cj + dj, C, chance, rmin, rmax, this.seed ^ salt, suit, centre);
            if (b) near.push(b);
          }
        }
        if (nears.size > 2000) nears.clear();
        nears.set(k, near);
      }
      cache.near = near;
      cache.ci = ci;
      cache.cj = cj;
    }
    let best = 0;
    for (let n = 0; n < near.length; n++) {
      const b = near[n];
      const dx = x - b.x, dz = z - b.z, reach = b.r * 1.35, d2 = dx * dx + dz * dz;
      if (d2 > reach * reach * 1.000001) continue; // (quickly, before the exact distance)
      // (Well inside, however its outline wobbles: wholly in it.)
      const inner = b.r * 0.525;
      if (d2 < inner * inner) return 1;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const a = Math.atan2(dz, dx);
      const r = b.r * (1 + 0.15 * Math.sin(a * 3 + b.s) + 0.08 * Math.sin(a * 5 + b.s * 2) + 0.04 * Math.sin(a * 9 + b.s * 3));
      best = Math.max(best, 1 - smoothstep(r * 0.72, r, d));
    }
    return best;
  }

  /** The blob of cell (i, j) for #blobs (or null), remembered. */
  #blobCell(cache, i, j, C, chance, rmin, rmax, s, suit, centre) {
    const k = cellKey(i, j);
    let b = cache.get(k);
    if (b !== undefined) return b;
    b = null;
    // (A few spots tried in the cell for its middle.)
    for (let t = 0; t < 6 && !b && hash2(i, j, s) < chance; t++) {
      const bx = (i + 0.2 + 0.6 * hash2(i + t * 71, j, s + 1)) * C, bz = (j + 0.2 + 0.6 * hash2(i, j + t * 71, s + 2)) * C;
      const r = rmin + (rmax - rmin) * hash2(i, j, s + 3);
      let ok = suit(bx, bz) > 0.5 && (!centre || centre(bx, bz, r));
      // (And most of the way round, half way out.)
      for (let q = 0, misses = 0; q < 8 && ok; q++) {
        const a = (q / 8) * Math.PI * 2;
        if (suit(bx + Math.cos(a) * r * 0.5, bz + Math.sin(a) * r * 0.5) < 0.2) ok = ++misses <= 4;
      }
      if (ok) b = { x: bx, z: bz, r, s: hash2(i, j, s + 4) * 100 };
    }
    if (cache.size > 4000) cache.clear();
    cache.set(k, b);
    return b;
  }

  /**
   * Keeps a patch of some kind of country (`raw` at a point, 0..1) only
   * where it's part of a real stretch of it, a rounded one: the patch is
   * shrunk by about 650 m all round (`R` cells of 128 m) and grown back
   * (a morphological opening), so anything narrower than about 1.3 km (a
   * strip, a thin arm, a scrap) goes, and what stays is blobs, never lines.
   * Worked out on a 128 m grid (remembered per kind) and blended between
   * its points.
   */
  #minSize(key, x, z, raw, need, R = 5) {
    const G = 128; // (R grid cells: 640 m by default)
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const all = this._minSize ?? (this._minSize = {});
    const cache = all[key] ?? (all[key] = { raw: new Map(), eroded: new Map(), opened: new Map() });
    const memo = (map, i, j, f) => {
      const k = cellKey(i, j);
      let v = map.get(k);
      if (v === undefined) {
        v = f(i, j);
        if (map.size > 40000) map.clear();
        map.set(k, v);
      }
      return v;
    };
    // (The disc: its middle, and rings at half and all of its radius.)
    // (Stopping as soon as the answer's settled: past the thresholds below, it makes no difference.)
    const disc = (i, j, f, pick, done) => {
      let v = f(i, j);
      for (const [d, n, off] of R > 5 ? [[R / 3, 8, 0], [(R * 2) / 3, 14, 0.5], [R, 20, 0]] : [[R / 2, 8, 0], [R, 12, 0.5]]) {
        for (let q = 0; q < n && !done(v); q++) {
          const a = ((q + off) / n) * Math.PI * 2;
          v = pick(v, f(i + Math.round(Math.cos(a) * d), j + Math.round(Math.sin(a) * d)));
        }
      }
      return v;
    };
    const rawAt = (i, j) => memo(cache.raw, i, j, () => raw(i * G, j * G));
    const eroded = (i, j) => memo(cache.eroded, i, j, () => disc(i, j, rawAt, Math.min, (v) => v <= need * 0.4));
    const opened = (i, j) => memo(cache.opened, i, j, () => disc(i, j, eroded, Math.max, (v) => v >= need * 0.6));
    const a = opened(gx, gz) + (opened(gx + 1, gz) - opened(gx, gz)) * fx;
    const b = opened(gx, gz + 1) + (opened(gx + 1, gz + 1) - opened(gx, gz + 1)) * fx;
    // (Its whole breadth at least half way into the kind of country.)
    return smoothstep(need * 0.4, need * 0.6, a + (b - a) * fz);
  }

  /**
   * Where pine forests lie (0..1): broad stretches of the green hill
   * country towards the mountains, kept whole (no scraps).
   */
  #pineZone(x, z, range, aridity) {
    // (Rounded forests a few kilometres across, rising round the foot of
    // the mountains: each centred where the country suits it, then kept
    // only where it's cool and green enough.)
    const blob = this.#blobs('pine', x, z, 5600, 1, 1500 * T.pine, 3000 * T.pine, 0x9e11, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value;
      if (this.getAridity(px, pz, r) > 0.42) return 0;
      // (Jungles keep well away from mountains, so near them there's none to check for.)
      const cool = smoothstep(0.04, 0.16, this.#mountainsAround(px, pz));
      return cool > 0 ? cool * (1 - smoothstep(0.36, 0.44, this.#aridAround(px, pz))) : 0;
    });
    if (blob <= 0) return 0;
    if (aridity > 0.45) return 0;
    // (Pine country is the flanks of the mountains and their foothills,
    // giving way to broadleaf forest and plains further out: never down by
    // a jungle.)
    const mountainous = smoothstep(0.02, 0.14, this.#mountainsAround(x, z));
    if (mountainous <= 0) return 0;
    return blob * mountainous * (1 - smoothstep(0.02, 0.15, this.#jungleNear(x, z))) * (1 - smoothstep(0.4, 0.46, this.#aridAround(x, z)));
  }

  #pineZoneRaw(x, z, range, aridity, noise = true, cooled = true) {
    // A cool country: on the flanks of the mountains (with a range within
    // a few hundred metres: jungles, which keep well away from mountains,
    // never meet them), and with no dry country, savanna or hotter, for the
    // best part of a kilometre round.
    if (aridity > 0.45) return 0;
    const zone = noise ? smoothstep(-0.22, -0.04, this.pineNoise.fbm(x * 0.00012 - 410, z * 0.00012 + 230, 2)) : 1;
    if (zone <= 0) return 0;
    const cool = cooled ? smoothstep(0.15, 0.3, this.#mountainsAround(x, z)) : 1;
    if (cool <= 0) return 0;
    const noJungle = 1 - smoothstep(0.05, 0.3, this.#jungleNear(x, z));
    return zone * cool * noJungle * (1 - smoothstep(0.36, 0.44, this.#aridAround(x, z)));
  }

  /**
   * How much jungle there could be within about 550 m of (x, z) (the most
   * of its raw zone there), on a 64 m grid (remembered) and blended
   * between its points: for keeping the cool forests well away.
   */
  #jungleNear(x, z) {
    const G = 64;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._jungleNear ?? (this._jungleNear = new Map());
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        const jz = (px, pz) => {
          const r = this.#rangeField(px, pz, {}).value;
          return this.#jungleZoneRaw(px, pz, r, this.getAridity(px, pz, r));
        };
        v = jz(i * G, j * G);
        for (const d of [300, 550]) for (let k = 0; k < 8 && v < 1; k++) {
          const a = ((k + (d > 300 ? 0.5 : 0)) / 8) * Math.PI * 2;
          v = Math.max(v, jz(i * G + Math.cos(a) * d, j * G + Math.sin(a) * d));
        }
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /**
   * Where jungles lie (0..1): broad stretches of the warmest, wettest
   * lowlands, deep in the green country: forests, plains, wetlands and the
   * sea may border them, but never dry country, mountains, the Black Hills
   * or volcanic highlands.
   */
  // The ranges (a tenth or so of the land they stand in) warm and wet
  // enough for jungle to come up to their feet: 0..1, broad and smooth.
  #tropicRange(x, z) {
    return smoothstep(0.34, 0.46, this.jungleNoise.fbm(x * 0.00006 - 410, z * 0.00006 + 230, 2));
  }

  // A cherry blossom grove (0..1): uncommon, a rounded patch half a
  // kilometre or so across, in the green foothills right by the mountains
  // (never up on the peaks, nor where the snow lies).
  #cherryLand(x, z) {
    // (The country it's looked for in as it is without groves: see #probe.)
    return this.#blobs('cherry', x, z, 3600, 0.45, 230, 380, 0xc4e2, (px, pz) => {
      // (Quick: the green, well-watered country on a range's lower slopes, below the snow.)
      const m = this.getMountainness(px, pz);
      if (m > 0.62 || this.#mountainsAround(px, pz) < 0.22) return 0;
      return this.getAridity(px, pz) < 0.36 && this.#jungleSuit(px, pz) < 0.05 ? 1 : 0;
    });
  }

  // A bamboo forest (0..1): now and then, a rounded patch a little under a
  // kilometre across by a jungle's edge, or by the foothills of a jungle range.
  #bambooLand(x, z) {
    return this.#blobs('bamboo', x, z, 3000, 0.4, 250, 450, 0xba3b, (px, pz) => {
      const j = this.#jungleSuit(px, pz);
      const byJungle = j > 0.02 && j < 0.3;
      const byRange = this.#tropicRange(px, pz) > 0.3 && this.#mountainsAround(px, pz) > 0.12 && this.getMountainness(px, pz) < 0.35;
      if (!byJungle && !byRange) return 0;
      return this.getAridity(px, pz) < 0.42 ? 1 : 0; // (and green country: not the dry)
    });
  }

  /**
   * The highlands' own lie of the land (m, to add): green foothills, the
   * ground rolling up towards the ranges in broad, rounded hills and
   * spurs with soft valleys between (the mountains' own slopes rise
   * behind them as anywhere). A little rounder and gentler in the cherry
   * country, a little steeper-sided in the bamboo.
   */
  highlandRelief(x, z, cherry) {
    const wx = x + this.mesaNoise.noise2D(x * 0.002 + 5, z * 0.002) * 60, wz = z + this.mesaNoise.noise2D(x * 0.002, z * 0.002 + 5) * 60;
    const hills = this.jungleNoise.noise2D(wx * 0.0028 + 13, wz * 0.0028 + 71) * 0.5 + 0.5;
    const knolls = this.jungleNoise.noise2D(wx * 0.007 - 41, wz * 0.007 + 9) * 0.5 + 0.5;
    const shape = 1.6 - 0.3 * cherry; // (how sharply the hills rise: the cherry country's softer)
    return 4 + 22 * Math.pow(hills, shape) + 6 * knolls * hills;
  }

  #jungleZone(x, z, range, aridity) {
    if (aridity > 0.5) return 0;
    // (Smoothed over a few hundred metres: a jungle is one rounded stretch
    // of country, never a strip or a scatter of patches. And none smaller
    // than half a square kilometre or so: shrunk by 380 m and grown back.)
    const zone = (px, pz) => smoothstep(T.jungle, T.jungle + 0.2, this.#jungleSuit(px, pz));
    const j = zone(x, z);
    return j > 0 ? j * this.#minSize('jungle', x, z, zone, 0.5, 3) : 0;
  }

  // How suited to jungle the country round (x, z) is: its raw zone averaged
  // over 250 m round, on a 64 m grid (remembered) and blended between its points.
  #jungleSuit(x, z) {
    const G = 64;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._jungleSuit ?? (this._jungleSuit = new Map());
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        const jz = (px, pz) => {
          const r = this.#rangeField(px, pz, {}).value;
          return this.#jungleZoneRaw(px, pz, r, this.getAridity(px, pz, r));
        };
        v = jz(i * G, j * G) * 2;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          v += jz(i * G + Math.cos(a) * 250, j * G + Math.sin(a) * 250);
        }
        v /= 10;
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /**
   * The driest the climate gets within about 600 m of (x, z) (as
   * getAridity, the biomes' own measure, before the savanna round deserts
   * is added), on a 64 m grid (remembered) and blended between its points.
   */
  #aridAround(x, z) {
    return this.#aridRange(x, z, 0);
  }

  // (Both at once: [driest within 600 m, driest within 300 m], from the point and rings 300 m and 600 m out.)
  #aridRange(x, z, which) {
    const G = 128; // (smooth: it takes in 600 m all round)
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._aridAround ?? (this._aridAround = new Map());
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        const ar = (px, pz) => this.#baseAridity(px, pz, this.#rangeField(px, pz, {}).value);
        let hi = ar(i * G, j * G), near = hi;
        for (const d of [300, 600]) for (let k = 0; k < 8; k++) {
          const a = ((k + (d > 300 ? 0.5 : 0)) / 8) * Math.PI * 2;
          const q = ar(i * G + Math.cos(a) * d, j * G + Math.sin(a) * d);
          if (q > hi) hi = q;
          if (d === 300 && q > near) near = q;
        }
        if (cache.size > 400000) cache.clear();
        cache.set(key, (v = [hi, near]));
      }
      return v[which];
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  #jungleZoneRaw(x, z, range, aridity) {
    if (aridity > 0.44) return 0;
    const zone = smoothstep(-0.62, -0.36, this.jungleNoise.fbm(x * 0.00018 + 70, z * 0.00018 - 30, 2));
    if (zone <= 0) return 0;
    const volcanicNear = 1 - smoothstep(0.4, 0.5, this.#volcanoNoise(x, z));
    if (volcanicNear <= 0) return 0;
    // (Well clear of the Black Hills: their noise must be well below where they begin.)
    const hillsClear = 1 - smoothstep(0.08, 0.18, this.hillsNoise.fbm(x * 0.0001 - 250, z * 0.0001 + 610, 2));
    if (hillsClear <= 0) return 0;
    // (And never near the Smoky Mountains or the Black Hills: a good
    // kilometre and more of forest and plains between them. A jungle only
    // borders wetlands, lakes, the sea, forests and plains.)
    const upland = (px, pz) => Math.max(this.#smokyBlob(px, pz), this.#hillsBlob(px, pz), this.#savannaBlob(px, pz));
    let smoky = upland(x, z);
    for (let k = 0; k < 8 && smoky < 0.05; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const d of [900, 1800]) smoky = Math.max(smoky, upland(x + Math.cos(a) * d, z + Math.sin(a) * d));
    }
    if (smoky >= 0.3) return 0;
    const wet = 1 - smoothstep(0.3, 0.44, aridity);
    // (No mountains within a few hundred metres, no dry country within the best part of a kilometre.)
    // (Save in a tenth or so of the ranges, the warm, wet ones: there the
    // jungle comes right up into the foothills, and the highlands between
    // them are bamboo and cherry country: see #highland.)
    const clear = (1 - smoothstep(0.42, 0.47, this.#aridAround(x, z))) * (1 - smoothstep(0.05, 0.16, this.#mountainsAround(x, z)) * (1 - this.#tropicRange(x, z)));
    // (Not where the land lies low and waterlogged: that's wetland.)
    const marshy = this.#wetZoneRaw(x, z, range, aridity);
    return smoothstep(0.25, 0.6, zone * volcanicNear * hillsClear * wet * clear) * (1 - smoothstep(0.1, 0.5, marshy)) * (1 - smoothstep(0.02, 0.3, smoky));
  }



  /**
   * A glowing swamp standing on its own (0..1): now and then (one to a
   * glowCell square or so) a rounded one, half a kilometre to a kilometre
   * across, out in the flat, well-watered green country, well away from the
   * ranges, volcanic country and the sea.
   */
  #glowBlob(x, z) {
    return this.#blobs('glow', x, z, T.glowCell, T.glowChance, 450, 850, 0x610b, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value;
      return r < 0.05 && this.getAridity(px, pz, r) < 0.36 && this.#volcanoBelt(px, pz) < 0.3 && this.#mountainsAround(px, pz) < 0.05 && this.#seaCoast(px, pz) < 0.05 && this.getOceanness(px, pz) < 0.1 ? 1 : 0;
    });
  }

  /**
   * Where the jungle mountains stand (0..1): now and then (one to a 3.5 km
   * square or so, in the green, well-watered country) a rounded stretch of them, two and a
   * half to four and a half kilometres across, well clear of the ranges, the volcanic country and the
   * Smoky Mountains. Their own country, not a range's: see landHeight.
   */
  #jungleMtn(x, z, mtn = null) {
    const b = this.#jungleMtnBlob(x, z);
    // (Fading out before any mountain range's own ground: never running into one.)
    return b > 0 ? b * (1 - smoothstep(0.08, 0.24, mtn ?? this.getMountainness(x, z))) : 0;
  }

  #jungleMtnBlob(x, z) {
    return this.#blobs('jmtn', x, z, 2100, 1, 1300, 2200, 0x7a12, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value;
      if (this.getMountainness(px, pz) > 0.35 || this.#volcanoBelt(px, pz) > 0.6 || this.#smokyBlob(px, pz) > 0.05) return 0;
      // (In the green, well-watered country: they bring their own jungle with them, see #biomeWeights.)
      // (Out into the savanna too: they bring their own wet with them.)
      return this.getAridity(px, pz, r) < 0.515 && this.#continentBase(px, pz) - this._contLift > -0.32 ? 1 : 0;
    }, (px, pz, rad) => {
      // (No mountain range within 2 km of its edge, so it never runs into one. See also #jungleMtn.)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        for (const d of [rad + 1000, rad + 2000]) if (this.getMountainness(px + Math.cos(a) * d, pz + Math.sin(a) * d) > 0.6) return false;
      }
      return true;
    });
  }

  /** Where wetlands lie (0..1): patches of the wettest, low-lying, flat country. */
  #wetZone(x, z, range, aridity) {
    let zone = smoothstep(0, 0.35, this.#wetZoneRaw(x, z, range, aridity, false));
    if (zone <= 0) return 0;
    // (Not in the land rising into the Smoky Mountains: a marsh there would be a pit. Nor anywhere
    // in or by a range: no swamp ever lies in the mountains.)
    if (!this._probing) zone *= 1 - smoothstep(0.02, 0.25, this.#smokyLift(x, z));
    zone *= 1 - smoothstep(0.05, 0.2, this.#mountainsAround(x, z));
    if (zone <= 0) return 0;
    return zone * this.#blobs('wet', x, z, 3500, 1, 1100 * T.wetland, 2000 * T.wetland, 0x3e7a, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value;
      return smoothstep(0, 0.35, this.#wetZoneRaw(px, pz, r, this.getAridity(px, pz, r), false));
    });
  }

  #wetZoneRaw(x, z, range, aridity, noise = true) {
    // (By the broad climate, which changes only slowly, so a wetland is
    // always the whole savanna's width from any desert.)
    const raw = this.#rawAridity(x, z);
    if (raw > 0.2 || aridity > 0.3 || range > 0.15) return 0;
    const zone = noise ? smoothstep(-0.45, -0.2, this.wetNoise.fbm(x * 0.00017 + 50, z * 0.00017 - 80, 2)) : 1;
    if (zone <= 0) return 0;
    // (Never near volcanic country.)
    const volcanicNear = 1 - smoothstep(0.26, 0.36, this.#volcanoNoise(x, z));
    if (volcanicNear <= 0) return 0;
    const low = 1 - smoothstep(0.45, 0.75, this.#continentBase(x, z) - this._contLift);
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
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        v = 0;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          v = Math.max(v, this.#rawAridityAt(i * G + Math.cos(a) * 800, j * G + Math.sin(a) * 800));
        }
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /**
   * How much the dry country holds mountain ranges down (0..0.9): they
   * fade out towards the deserts. Worked out from the broad climate,
   * averaged over half a kilometre round (on a 64 m grid, remembered, and
   * blended between its points), so a range rises gradually out of the
   * dry plains rather than switching on in a wall.
   */
  #drySuppress(x, z) {
    const G = 128; // (smooth: it takes in 450 m all round)
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._drySup ?? (this._drySup = new Map());
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        let sum = this.#rawAridityAt(i * G, j * G) * 2;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          sum += this.#rawAridityAt(i * G + Math.cos(a) * 450, j * G + Math.sin(a) * 450);
        }
        v = 0.9 * smoothstep(0.8, 1.3, sum / 10);
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /**
   * The most mountainous the land gets within about 330 m of (x, z) (0..1),
   * measured on a 64 m grid (remembered) and blended between its points:
   * mesas keep well clear of mountain ranges.
   */
  #mountainsAround(x, z) {
    const G = 64;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._mtnNear ?? (this._mtnNear = new Map());
    const m = (px, pz) => smoothstep(0.08, 0.55, this.#rangeField(px, pz, {}).value + MOUNTAIN_BIAS - this.#drySuppress(px, pz));
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        v = m(i * G, j * G);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          for (const d of [170, 380]) v = Math.max(v, m(i * G + Math.cos(a) * d, j * G + Math.sin(a) * d));
        }
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /**
   * The weakest the mountain range field gets within about 400 m of (x, z)
   * (as getBaseHeight measures it), on a 64 m grid (remembered) and blended
   * between its points: the peaks keep that far in from a range's edge.
   */
  #rangeInner(x, z) {
    const G = 64;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._rangeInner ?? (this._rangeInner = new Map());
    const m = (px, pz) => this.#rangeField(px, pz, {}).value + MOUNTAIN_BIAS - this.#drySuppress(px, pz);
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        v = m(i * G, j * G);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          for (const d of [200, 400]) v = Math.min(v, m(i * G + Math.cos(a) * d, j * G + Math.sin(a) * d));
        }
        if (cache.size > 400000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /** Terrain height in metres at a world position (rivers carved in). */
  getHeight(x, z) {
    const base = this.getBaseHeight(x, z);
    const rough = this.#roughness(x, z, base);
    // (Rivers are traced over the land as it truly is, whatever mesh
    // asked first: the footprint is set aside while they're found.)
    const fp = this.footprint;
    this.footprint = 0;
    try {
      // (Let down where a landmark's a hollow: the great sinkhole, a lake's bowl.)
      const h = this.rivers.carve(x, z, base, rough);
      let g = h - this.landmarks.basinAt(x, z, h);
      if (!this._probing) g = this.#craterCarve(x, z, g);
      // (Built up where a glacier lies: its ice is the land's top there.)
      return g + (g > this.rivers.seaLevel + 60 ? this.landmarks.glacierAt(x, z, g)?.ice ?? 0 : 0);
    } finally {
      this.footprint = fp;
    }
  }

  /**
   * Small bumps and hollows a few metres across, and broader lumps and
   * hummocks, so the land underfoot is never smooth: gentle in the grass
   * and on sand, rougher up in the mountains, flattening out only right at
   * the water's edge (and never dipping into a puddle below the water
   * beside it). Added after rivers are traced (they follow the land without
   * these), and faded out along their banks.
   */
  #roughness(x, z, base) {
    const sea = this.rivers.seaLevel;
    if (base < sea + 0.25) return 0;
    const shore = smoothstep(sea + 0.25, sea + 1.5, base);
    const soft = (1 - 0.6 * this._weights.desert) * (1 - this._erg) * (1 - 0.92 * this._weights.saltFlat); // (salt flats: dead flat)
    const amount = (0.32 + 0.8 * smoothstep(50, 170, base)) * soft;
    let r = (this.roughNoise.noise2D(x * 0.13, z * 0.13) + 0.45 * this.roughNoise.noise2D(x * 0.29 + 17, z * 0.29 - 9)) * amount;
    r += (this.roughNoise.noise2D(x * 0.05 - 31, z * 0.05 + 11) * 0.7 + this.roughNoise.noise2D(x * 0.021 + 5, z * 0.021 - 40) * 0.9) * soft;
    // (A live lava flow's channel and levees lie smooth, the banks level either side.)
    if (this._weights.volcanic > 0.05) r *= 1 - Math.max(this.#lavaCalm(x, z), this.#craterCalm(x, z));
    return Math.max(r * shore, sea + 0.25 - base);
  }

  /**
   * The land before creeks are carved into it (they're traced over this),
   * with the great rivers' valleys (see BigRivers).
   */
  getBaseHeight(x, z) {
    const h = this.landHeight(x, z);
    if (this._probing) return h;
    const work = this.bigRivers.work;
    const out = this.bigRivers.carve(x, z, h);
    // (Rivers just traced for this looked at other land, leaving its
    // weights behind: worked out again here, so what follows sees this point's.)
    if (this.bigRivers.work !== work) this.landHeight(x, z);
    return out;
  }

  /**
   * The broad lie of the land at (x, z): the continent, the seas and
   * lakes, and the ranges as broad highlands, without the hills and peaks.
   * The great rivers find their way over this (see BigRivers).
   */
  broadHeight(x, z) {
    const field = this.#rangeField(x, z, {});
    const range = field.value + MOUNTAIN_BIAS - this.#drySuppress(x, z);
    const mask = smoothstep(0.08, 0.55, range), core = smoothstep(0.3, 0.72, range);
    const dry = this.#rawAridityAt(x, z);
    const cont = this.#continentBase(x, z);
    const contLift = this._contLift; // (kept now: what follows looks at other points, which replace it)
    const continent = cont + 0.34 * smoothstep(0.62, 0.8, dry) + 0.1 * smoothstep(0.3, 0.5, dry) + 0.5 * mask;
    const lakes = smoothstep(0.28, 0.72, this.lakeNoise.fbm(x * 0.0017, z * 0.0017, 2)) * 22 * (1 - smoothstep(0, 0.4, mask));
    // (And the Smoky Mountains' great swells, so rivers find their way
    // along the troughs between them rather than through them.)
    let smoky = 0;
    // (Worked out only where a Smoky Mountains blob lies: it's costly.)
    const lift = this.#smokyBlob(x, z) > 0 ? this.#smokyLift(x, z) : 0;
    if (lift > 0) {
      const qx = x + this.smokyNoise.noise2D(x * 0.00025 + 40, z * 0.00025) * 500;
      const qz = z + this.smokyNoise.noise2D(x * 0.00025, z * 0.00025 - 40) * 500;
      smoky = lift * (10 + 212 * smoothstep(-0.6, 1.0, this.smokyNoise.fbm(qx * 0.00042 + 311, qz * 0.00055 - 97, 2)));
    }
    return 14 + (continent - contLift) * 16 + Math.pow(mask, 1.5) * 48 + Math.pow(core, 1.5) * 150 - smoothstep(-0.05, -0.45, continent) * 34 - lakes + smoky;
  }

  /**
   * The broad climate's dryness at (x, z), as the biomes follow it but
   * without the finer detail (quick): past about 0.76 it's desert.
   */
  broadDryness(x, z) {
    return this.#rawAridityAt(x, z) - 0.55 * smoothstep(-0.12, 0.4, this.#rangeField(x, z, {}).value);
  }

  /** The land before any rivers (the great rivers are traced over its broad lie: see broadHeight). */
  landHeight(x, z) {
    // (First: it looks at the land round about.)
    const smokyLift = this._probing ? 0 : this.#smokyLift(x, z);
    // (Copied: the biome weights, worked out next, can look at the ranges
    // round about, the first time they're looked at, into the same
    // remembered field; this point's would be lost, and the land here
    // would come out differently the first time it's asked for.)
    const field = { ...this.#rangeField(x, z) };
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
    const range = field.value + MOUNTAIN_BIAS - this.#drySuppress(x, z);
    const mask = smoothstep(0.08, 0.55, range);
    let mountains = 0;
    if (mask > 0) {
      // (The peaks rise only where the range is strong for some 400 m all
      // round: every range starts with a good band of foothills, rather
      // than a mountainside standing straight up out of the plain.)
      const core = smoothstep(0.3, 0.72, Math.min(range, this._probing ? range : this.#rangeInner(x, z) + 0.06));
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
        // Knobs, ledges and gullies all over the rock, so a steep face is
        // never a smooth, flat plane.
        const knobs = (this.ruggedNoise.noise2D(x * 0.045 - 71, z * 0.045 + 33) * 4 + this.ruggedNoise.ridged(x * 0.024 + 5, z * 0.024 - 5, 2, 2, 0.5, 0.05) * 6) * smoothstep(0.02, 0.2, peaks);
        mountains = Math.pow(core, 1.5) * (peaks * 260 * (0.65 + 0.5 * size) * (1 - bowl) + rugged + crags + knobs);
      }
      // Foothills: rolling hills that grow as the land climbs towards the
      // range, so it never rises straight out of the plain.
      const foot = mask * (1 - smoothstep(0.1, 0.6, core));
      if (foot > 0) mountains += foot * (this.hillNoise.fbm(x * 0.0032 + 71, z * 0.0032 - 13, 3) * 0.5 + 0.5) * 26;
      mountains += Math.pow(mask, 1.5) * 48 * (0.75 + 0.3 * size) * (1 - 0.5 * bowl) + Math.pow(core, 2) * 30 * (1 - 0.5 * bowl); // (the heart of a range lifted, so more of its peaks reach the snow)
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

    // The Smoky Mountains: enormous rolling swells, like a dune sea's
    // scaled up a hundredfold: high rounded tops and deep low troughs a
    // couple of kilometres apart, never a steep drop, forested all over.
    // (Their height comes from a softened, spread-out version of where the
    // biome is, so the country climbs into them over a kilometre or so,
    // never up a wall at the edge: see #smokyLift.)
    let smoky = 0;
    if (smokyLift > 0) {
      const qx = x + this.smokyNoise.noise2D(x * 0.00025 + 40, z * 0.00025) * 500;
      const qz = z + this.smokyNoise.noise2D(x * 0.00025, z * 0.00025 - 40) * 500;
      // (Tall rolling hills: the tops a little lower than they were, the
      // troughs between them deeper, and more of them, closer together.)
      const n = this.smokyNoise.fbm(qx * 0.00042 + 311, qz * 0.00055 - 97, 2);
      // (Rounded tops: the swell never saturates into a plateau.)
      const swell = smoothstep(-0.6, 1.0, n);
      const rolls = this.hillNoise.fbm(x * 0.0014 + 50, z * 0.0014 - 20, 2) * 28 + this.hillNoise.noise2D(x * 0.0032 - 90, z * 0.0032 + 15) * 8;
      // (A broad valley down the Smoky Mountains' river: laid down first,
      // the hills shaped round it. See #smokyTrunks.)
      const valley = this._probing ? 0 : 1 - smoothstep(80, 800, this.#trunkDistance(x, z));
      smoky = smokyLift * (10 + 212 * swell * (1 - 0.92 * valley) + rolls * (0.7 + 0.8 * swell) * (1 - 0.7 * valley));
    }

    // Volcanic highlands: a raised, rough plateau of old lava, and cinder
    // cones with a crater at the top and tongues of lava down their sides.
    let volcanic = 0;
    if (w.volcanic > 0) volcanic = w.volcanic * (16 + 14 * this.volcanoNoise.fbm(x * 0.002 + 7, z * 0.002, 2));
    volcanic += this.#coneHeight(x, z);
    if (w.volcanic > 0.5) volcanic += this.#springRelief(x, z);

    // Broad rise and fall of the land, lifted in dry country so seas
    // rarely reach a desert, and around mountain ranges so they don't
    // drop straight into the sea.
    const dryness = this.#rawAridity(x, z);
    const continent = this.#continentBase(x, z) + 0.34 * smoothstep(0.62, 0.8, dryness) + 0.1 * smoothstep(0.3, 0.5, dryness) + 0.5 * mask;
    const contLift = this._contLift;

    // Rolling hills in the plains (bigger in some regions than others),
    // lower swells in the savanna, dunes in the desert.
    // (Noise that would only be multiplied by zero isn't evaluated.)
    let hills = 0;
    const greenLand = w.temperate + (w.pine || 0) + (w.redwood || 0);
    if (greenLand + 0.45 * w.savanna !== 0 && 1 - 0.6 * mask !== 0) {
      const hilly = smoothstep(-0.41, 0.19, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
      const rolling = this.hillNoise.fbm(x * 0.0024, z * 0.0024, 3) * (5 + 17 * hilly) + this.flatNoise.fbm(x * 0.006, z * 0.006, 2) * 2.5;
      hills = rolling * (greenLand + 0.45 * w.savanna) * (1 - 0.6 * mask);
    }
    // Valleys: the hill country (and the Smoky Mountains) is cut by a
    // branching network of broad valleys, main ones a kilometre or so
    // apart with smaller side valleys running into them, their floors
    // rounded, so the land drains along them as real hill country does.
    let valleys = 0;
    const relief = (greenLand + 0.45 * w.savanna) * (1 - 0.6 * mask) * (0.4 + 0.6 * smoothstep(-0.41, 0.19, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2))) + 0.6 * mask * (1 - smoothstep(0.3, 0.72, range)) + smokyLift * 0.9;
    if (relief > 0.02) {
      const vx = x + this.valleyNoise.noise2D(x * 0.0011 + 3, z * 0.0011) * 170;
      const vz = z + this.valleyNoise.noise2D(x * 0.0011, z * 0.0011 - 3) * 170;
      const main = 1 - smoothstep(0, 0.2, Math.abs(this.valleyNoise.noise2D(vx * 0.0008, vz * 0.0008)));
      const side = 1 - smoothstep(0, 0.14, Math.abs(this.valleyNoise.noise2D(vx * 0.0021 + 40, vz * 0.0021 - 40)));
      valleys = relief * (14 * main * main * (3 - 2 * main) + 5 * side * side);
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
      dunes = w.desert * (small * (1 - f.erg)) + (f.erg > 0 ? f.erg * this.#dunesSeen(x, z) : 0);
      // An oasis lies in a broad hollow among the dunes.
      if (f.erg > 0 && !this._probing) {
        const n = this.#oasisNear(x, z);
        if (n) {
          const r = n.oasis.r;
          dunes = dunes * smoothstep(r * 1.8, r * 3.6, n.d) - 3 * (1 - smoothstep(r * 0.8, r * 2.6, n.d)) * f.erg;
        }
      }
    }

    // Seas where the continent noise dips, and lake basins in the green lowlands.
    const sea = smoothstep(-0.05, -0.45, continent) * 34;
    const lakes =
      1 - smoothstep(0, 0.4, mask) !== 0 && 1 - w.desert !== 0
        ? smoothstep(0.28, 0.72, this.lakeNoise.fbm(x * 0.0017, z * 0.0017, 2)) * 22 * (1 - smoothstep(0, 0.4, mask)) * (1 - w.desert) * (1 - 0.6 * w.savanna) * (1 - w.cascades) // (the Cascades' water is their falls' own lakes and pools)
        : 0;

    const seaLevel = this.rivers.seaLevel;
    // (Few cliffs drop straight into a lake: escarpments fade out over lake basins.)
    const badlands = w.badlands > 0.005 ? w.badlands * this.badlandsRelief(x, z) : 0;
    // (The Cascades' tiers likewise fade out over lake basins.)
    // (Their share smoothed over the ground round about, so where another
    // kind of country meets them sharply the land still eases up into them.)
    const cw = !this._probing && this.#cascadesZone(x, z, field.value) > 0 ? this.#cascadesShare(x, z) : 0;
    const cascades = cw > 0.005 ? cw * this.cascadesRelief(x, z, cw) * (1 - smoothstep(0.5, 6, lakes)) : 0;
    const hw = (w.cherry ?? 0) + (w.bamboo ?? 0);
    const highland = hw > 0.005 ? hw * this.highlandRelief(x, z, (w.cherry ?? 0) / hw) * (1 - smoothstep(0.5, 6, lakes)) : 0;
    // The jungle mountains (see #jungleMtnBlob): a massif of steep green
    // mountains, several summits to it, sharp ridges running down from them
    // between deep valleys, rising out of the jungle wherever they stand, low
    // country or high (the higher the land, the taller they grow).
    let jungleMtn = 0;
    const jb = this._probing ? 0 : this.#jungleMtn(x, z);
    if (jb > 0) {
      const N = this.jungleMtnNoise;
      const qx = x + N.noise2D(x * 0.0005 + 31, z * 0.0005) * 260, qz = z + N.noise2D(x * 0.0005, z * 0.0005 - 31) * 260;
      // (The mass of it: broad mountains, their summits a kilometre or so apart.)
      const mass = smoothstep(-0.45, 0.75, N.fbm(qx * 0.0009 + 13, qz * 0.0009 - 7, 3));
      // (Ridges down their flanks, sharp along their crests.)
      const ridges = Math.pow(N.ridged(qx * 0.0024, qz * 0.0024, 3, 2.1, 0.5, 0.02), 1.5);
      const rough = N.fbm(qx * 0.012 + 50, qz * 0.012 - 50, 2) * 6;
      const high = 0.65 + 0.55 * smoothstep(0, 60, 14 + (continent - contLift) * 16);
      // (Rising to a high heart: real mountains, their summits two or three
      // hundred metres over the jungle round them, above the trees.)
      const core = Math.pow(smoothstep(0.12, 0.85, jb), 1.25);
      const peak = (140 + 180 * mass) * (0.6 + 0.4 * ridges) + 45 * ridges;
      jungleMtn = smoothstep(0, 0.9, jb) * 8 + core * (peak * high + rough);
    }
    let height = 14 + (continent - contLift) * 16 + hills + dunes + mountains + blackHills + smoky + jungleMtn + volcanic + badlands + cascades + highland + f.mesaHeight + f.escarpHeight * (1 - smoothstep(0.5, 6, lakes)) - sea - lakes;
    // (Valleys only in land well above the water: never new lakes.)
    if (valleys > 0) height -= valleys * smoothstep(seaLevel + 3, seaLevel + 30, height);
    // Canyons cut down into it (their floors kept above the sea).
    if (f.canyonCut > 0) height -= Math.min(f.canyonCut, Math.max(0, height - (seaLevel + 3)));
    // Wetlands: the land sinks to just above the water, a maze of shallow
    // pools, mudflats and meandering channels.
    if (w.wetland > 0) {
      const target = seaLevel + this.#marsh(x, z);
      // (High ground at its edge, hills, isn't pulled flat but slopes on
      // down into it: never a wall where the two meet.)
      if (height > target) height += (target - height) * w.wetland * (1 - smoothstep(4, 40, height - target) * (1 - w.wetland * w.wetland));
    }
    // Salt flats: dead flat, a metre or so below the desert round them.
    if (w.saltFlat > 0) {
      const flat = 14 + (continent - contLift) * 16 + mountains - sea - 1.2;
      height += (flat - height) * smoothstep(0.05, 0.6, w.saltFlat / (w.saltFlat + w.desert));
    }
    // Mangrove coasts: the land eases down to a maze of mud banks and
    // channels just above the tide, and the sea off them shoals into warm
    // shallows a metre or so deep, where the mangroves stand.
    // (By the swamp's share spread smooth, so whatever's behind it, hills
    // or a mountain plateau, comes down to it on a long slope.)
    // (The far-reaching planning, rivers and probes, makes do with the plain share: quicker.)
    const mangrove = this._probing || this._riverWork ? w.mangrove : w.wetland < 0.5 ? smoothstep(0.04, 0.6, this.#mangroveSpread(x, z)) * (1 - smoothstep(0.2, 0.5, w.wetland)) : 0;
    if (mangrove > 0) {
      const target = seaLevel - 0.7 + 0.7 * this.#marsh(x, z);
      if (height > target) height += (target - height) * mangrove;
      else if (height < target - 1.4) height += (target - 1.4 - height) * mangrove * (1 - smoothstep(seaLevel - 14, seaLevel - 22, height));
    }
    const soft = w.wetland + w.mangrove;
    // Islands, here and there out in a lake or the sea: a wooded hump of
    // land with a beach round it (shaped by the lake shore below).
    if (height < seaLevel - 0.5 && !this._probing && !this._riverWork && soft < 0.3) { // (not while the great rivers are worked out: see BigRivers.#ensure)
      const lift = this.#islandHeight(x, z);
      // (Fading out towards the marshes, not cut off: no wall in the sea where they stop.)
      if (lift > height) height += (lift - height) * (1 - smoothstep(0.15, 0.3, soft));
    }
    // Lake shores (not the open sea's beaches, nor marshes): a real edge
    // rather than the land just sloping on down under the water.
    const u = height - seaLevel;
    // (Only a great stretch of water is the open sea: see #openSea.)
    const ocean = u > -90 && u < 60 ? smoothstep(-0.02, -0.25, continent) * this.#openSea(x, z) : 0;
    if (u > -4.5 && u < 7) {
      const lake = (1 - ocean) * Math.max(0, 1 - soft);
      if (lake > 0) height += (this.#lakeShore(u, x, z) - u) * lake;
    }
    // Sea cliffs along stretches of the open coast.
    if (ocean > 0 && u > -10 && u < 60) {
      const cliffs = this.#cliffZone(x, z, w) * ocean;
      // (Round an island, half as tall: never a wall higher than the island.)
      const isle = cliffs > 0 && !this._probing && !this._riverWork ? this.islandAt(x, z) : 0;
      if (cliffs > 0) height += (this.#seaCliff(x, z, u, 1 - 0.5 * isle) - u) * cliffs;
      // Along some stretches, a broad shelf of rock the waves have planed
      // off, a few tens of metres out from the cliff, dotted with tide pools.
      if (cliffs > 0.3 && u < 0) height = seaLevel + this.#shelf(x, z, u, height - seaLevel, smoothstep(0.3, 0.6, cliffs));
    }
    // Broad sandy beaches along stretches of the open coast (not under
    // sea cliffs): the land eases up out of the sea more gently, so the
    // sand runs a long way back before the grass begins.
    if (ocean > 0 && height > seaLevel && height < seaLevel + 8) {
      const beachy = smoothstep(-0.1, 0.25, this.coastNoise.noise2D(x * 0.0015 + 55, z * 0.0015 - 21)) * smoothstep(0.2, 0.6, ocean) * (1 - this.#cliffZone(x, z, w)) * Math.max(0, 1 - soft);
      if (beachy > 0) {
        const t = (height - seaLevel) / 8;
        height += (seaLevel + 8 * Math.pow(t, 2.6) - height) * beachy;
      }
    }
    // Coral reefs off the open coast (not off cliffs, wetlands or volcanic
    // shores): built up off a sandy floor seven to eleven metres down, the
    // reef itself: broad tables of it cut through by narrow canyons, and
    // out on the sand, coral heads (bommies) standing up alone, steep-sided,
    // their knobbly tops a metre or three under the surface.
    if (ocean > 0.3 && u < -1.2 && u > -40) {
      // (Near the coast only: out in the deep they give way to open sea.)
      const reef = this.#reefZone(x, z, w) * smoothstep(0.3, 0.7, ocean) * (1 - smoothstep(-0.2, -0.34, continent)) * (1 - this.#cliffZone(x, z, w));
      if (reef > 0) {
        const N = this.coastNoise, depth = height - seaLevel;
        const floor = Math.max(depth, -7 - 4 * (N.noise2D(x * 0.01 + 3, z * 0.01 - 8) * 0.5 + 0.5));
        const raise = this.#reefRaise(x, z);
        const top = -1.3 - 1.8 * (N.noise2D(x * 0.05 - 7, z * 0.05 + 3) * 0.5 + 0.5) - 0.6 * (N.noise2D(x * 0.35, z * 0.35) * 0.5 + 0.5);
        const target = floor + (Math.max(top, floor) - floor) * raise;
        // (Built up off the shelf, not off the deep: fading out down the slope, never a wall where it stops.)
        height = seaLevel + depth + (target - depth) * reef * (1 - smoothstep(12, 26, -depth));
      }
    }
    // The open sea floor isn't flat: over much of it rock rises out of the
    // sand in great rounded masses, ten to forty metres across, knobbly on
    // top, standing up steep-sided off the bed, joined here and there into
    // long ridges with gullies between, the tallest of them a good way up
    // towards the surface (never to it); and between them the sand lies in
    // low ripples. (Nothing narrower than the land's mesh can show: no
    // spikes, no sheer walls drawn as slivers.)
    if (ocean > 0.35 && u < -4 && u > -60) {
      const N = this.coastNoise, deep = -u, k = smoothstep(0.35, 0.6, ocean) * smoothstep(4, 8, deep) * (1 - smoothstep(44, 58, deep));
      const patch = this.getSeaRock(x, z);
      let lift = 0;
      if (patch > 0) {
        const mass = N.fbm(x * 0.016 - 51, z * 0.016 + 83, 2);
        const body = smoothstep(-0.32, 0.3, mass + 0.3 * patch - 0.15);
        const ridge = Math.pow(1 - Math.abs(N.noise2D(x * 0.0085 + 17, z * 0.0085 - 29)), 5) * smoothstep(-0.2, 0.2, mass);
        const lumps = 0.7 + 0.3 * (N.noise2D(x * 0.06 + 5, z * 0.06 - 3) * 0.5 + 0.5) + 0.12 * N.noise2D(x * 0.13, z * 0.13);
        lift = patch * Math.max(body, ridge * 0.75) * lumps * Math.min(15, deep * 0.72);
      }
      const ripples = 0.12 * Math.sin(x * 0.55 + this.coastNoise.noise2D(x * 0.05, z * 0.05) * 3) * (1 - patch);
      // (Never nearer the surface than a couple of metres, wherever the bed already is.)
      height += (Math.max(0, Math.min(lift, seaLevel - height - 2.5)) + ripples) * k;
    }
    // The legs of sandstone arches in mesa country (their spans are SeaCoastLayer's).
    if (f.mesa > 0.2 && !this._probing) {
      const legs = this.#archLegs(x, z);
      if (legs > height) height = legs;
    }
    // A live lava flow runs level across: the ground either side of it, out
    // past its levees, as high as at its middle (so its banks stand level
    // with each other, wherever it crosses the slope), easing back into the
    // flank beyond.
    if (w.volcanic > 0.05 && !this._levelling) {
      const level = this.#lavaLevel(x, z);
      if (level) {
        height += (level.target - height) * level.k;
        this.getBiomeWeights(x, z, this._weights, field.value); // (the middle's were looked at: this point's again)
      }
      // A crater holding a lake (of water or of lava): its bowl shaped to
      // the lake, the floor under it below its level, the shore rising
      // out of it all round, so it never hangs over the slope.
      for (const c of this.#conesNear(x, z)) {
        if (!(c.lake || c.lava)) continue;
        const d = Math.hypot(x - c.x, z - c.z);
        // Where a live flow spills out of the crater: the rim notched down
        // to the lava lake's level, so the lake runs out through the gap
        // into the flow at one height (its channel cut into the notch's floor).
        if (c.active && d < c.rc * 2.4) {
          const p = this.lavaPath(c, d);
          if (p) {
            const angle = Math.atan2(z - c.z, x - c.x);
            let da = angle - p.angle;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            const k = 1 - smoothstep(p.half * 1.3, p.half * 2.4, Math.abs(da * d));
            const target = this.craterLevel(c) + 0.2 + (this.#lavaChannel(c, d, angle)?.dh ?? 0);
            if (k > 0 && d > c.rc * 0.6 && height > target) {
              this._notch = height + (target - height) * k; // (applied after the shore, below)
            }
          }
        }
        if (d > c.rc) {
          if (this._notch !== undefined) (height = this._notch), (this._notch = undefined);
          continue;
        }
        const L = this.craterLevel(c);
        // (A water lake's edge wobbles in and out, as Rivers draws it: the bowl follows it.)
        const a = Math.atan2(z - c.z, x - c.x);
        const r = c.rc * 0.6 * (c.lake ? 1 + 0.14 * Math.sin(a * 3 + c.seed) + 0.07 * Math.sin(a * 5 + c.seed * 2) : 1);
        if (d < r) height = Math.min(height, L - 0.5 - 2.5 * (1 - (d / r) ** 2));
        else {
          // (The shore: a little above the lake all round, so its edge never hangs over
          // the slope (a water lake's edge wobbles out a little: the bed's dug there), then the crater's own wall.)
          height += (Math.max(height, L + 0.3) - height) * (1 - smoothstep(c.rc * 0.85, c.rc, d));
        }
        if (this._notch !== undefined) (height = Math.min(height, this._notch)), (this._notch = undefined);
        this.getBiomeWeights(x, z, this._weights, field.value);
      }
    }
    return height;
  }

  /**
   * The level of the lake in volcano c's crater (of water or of molten
   * lava): a third of the way up from its floor. (Remembered.)
   */
  craterLevel(c) {
    if (c._level === undefined) {
      this._levelling = true;
      try {
        c._level = this.landHeight(c.x, c.z) + c.depth * (c.lake ? 0.35 : 0.3);
      } finally {
        this._levelling = false;
      }
    }
    return c._level;
  }

  // Beside a live lava flow: { target (the height the land there would have
  // with the flow's middle as level as its banks), k (how much: 1 by the
  // flow, 0 well off it) }, or null.
  #lavaLevel(x, z) {
    for (const c of this.#conesNear(x, z)) {
      if (!c.active) continue;
      const d = Math.hypot(x - c.x, z - c.z);
      const p = this.lavaPath(c, d);
      if (!p) continue;
      const angle = Math.atan2(z - c.z, x - c.x);
      let da = angle - p.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const lateral = Math.abs(da * d);
      if (lateral > p.half * 3.4) continue;
      this._levelling = true;
      let middle;
      try {
        middle = this.landHeight(c.x + Math.cos(p.angle) * d, c.z + Math.sin(p.angle) * d);
      } finally {
        this._levelling = false;
      }
      // (The middle's height has the channel cut into it: put that back, and this point's own instead.)
      const here = this.#lavaChannel(c, d, angle)?.dh ?? 0, there = this.#lavaChannel(c, d, p.angle)?.dh ?? 0;
      return { target: middle - there + here, k: 1 - smoothstep(p.half * 2.2, p.half * 3.4, lateral) };
    }
    return null;
  }

  // Islands: one to a 640 m cell or none, standing only where the water
  // is deep enough all round it (so never joined to the shore). Remembered.
  #island(i, j) {
    const key = i * 100003 + j;
    let isl = this._islands.get(key);
    if (isl !== undefined) return isl;
    isl = null;
    const seed = this.seed ^ 0x51a4d;
    if (hash2(i, j, seed) < 0.33) { // (40% fewer than there were)
      const C = 640;
      const r = 40 + 130 * Math.pow(hash2(i, j, seed + 1), 1.5);
      const x = (i + 0.2 + 0.6 * hash2(i, j, seed + 2)) * C, z = (j + 0.2 + 0.6 * hash2(i, j, seed + 3)) * C;
      const probe = this.#probe(), sea = this.rivers.seaLevel;
      let ok = probe.getBaseHeight(x, z) < sea - 3;
      for (let k = 0; ok && k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ok = probe.getBaseHeight(x + Math.cos(a) * r * 1.5, z + Math.sin(a) * r * 1.5) < sea - 1;
      }
      if (ok) {
        isl = { x, z, r, top: sea + 2.5 + 10 * (r / 170) + 4 * hash2(i, j, seed + 4) };
        // (Far out in the deep sea, some are mushroom islands: grey-violet
        // mycelium for ground, giant mushrooms for trees. See MushroomIslandLayer.)
        if (probe.getBaseHeight(x, z) < sea - 22 && hash2(i, j, seed + 5) < 0.45) isl.mushroom = true;
        // (And others, out in the deep sea, coral atolls: a ring of low sandy
        // islets round a shallow lagoon, the reef all round it.)
        else if (probe.getBaseHeight(x, z) < sea - 14 && hash2(i, j, seed + 6) < 0.5) (isl.atoll = true), (isl.top = sea + 2.6 + 1.2 * hash2(i, j, seed + 7)), (isl.r = Math.max(isl.r, 90));
      }
    }
    if (this._islands.size > 4000) this._islands.clear();
    this._islands.set(key, isl);
    return isl;
  }

  /** The ground of an island at (x, z) (or -Infinity: none there). */
  #islandHeight(x, z) {
    const C = 640, ci = Math.floor(x / C), cj = Math.floor(z / C);
    const sea = this.rivers.seaLevel;
    let best = -Infinity;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const isl = this.#island(i, j);
        if (!isl) continue;
        const d = Math.hypot(x - isl.x, z - isl.z);
        if (d > isl.r * 3.6) continue;
        // (A ragged, bays-and-points outline, not a circle.)
        const t = d / (isl.r * (0.75 + 0.5 * (this.coastNoise.noise2D(x * 0.008 + 61, z * 0.008 - 17) * 0.5 + 0.5)));
        let h;
        if (isl.atoll && t < 1.25) {
          // (An atoll: a narrow ring of sand and palms, broken by channels
          // into islets, round a lagoon a few metres deep; the reef sloping
          // away outside it.)
          const ring = Math.exp(-(((t - 0.86) / 0.09) ** 2));
          const islets = smoothstep(-0.25, 0.15, this.coastNoise.noise2D(Math.atan2(z - isl.z, x - isl.x) * 2.2 + isl.x * 0.001, isl.z * 0.001));
          const lagoon = sea - 2.2 - 2.5 * smoothstep(0.75, 0.2, t) - this.hillNoise.fbm(x * 0.03, z * 0.03, 2) * 0.8;
          h = Math.max(lagoon, sea - 0.8 + (isl.top - sea + 0.8) * ring * islets + (ring > 0.3 ? -0.6 * (1 - islets) : 0));
          if (t > 0.95) h = Math.min(h, sea - 1.5 - (t - 0.95) * isl.r * 0.25);
        } else if (t < 1) {
          const dome = Math.pow(1 - t * t, 1.4);
          h = sea - 1.5 + (isl.top - sea + 1.5) * dome + this.hillNoise.fbm(x * 0.02, z * 0.02, 2) * 1.5 * dome;
        } else h = sea - 1.5 - (t - 1) * isl.r * 0.3 - Math.pow(Math.max(0, t - 1.6), 2) * isl.r * 0.6; // (the underwater skirt: steepening on down, so it's well under the sea floor round it before it ends)
        if (h > best) best = h;
      }
    }
    return best;
  }

  /** Whether (x, z) is on (or in the lagoon of) a coral atoll (see #island): 0..1. */
  atollAt(x, z) {
    const C = 640, ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const isl = this.#island(i, j);
      if (isl?.atoll) best = Math.max(best, 1 - smoothstep(isl.r * 1.0, isl.r * 1.5, Math.hypot(x - isl.x, z - isl.z)));
    }
    return best;
  }

  /** Whether (x, z) is on a mushroom island (see #island): 0..1. */
  mushroomIslandAt(x, z) {
    const C = 640, ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const isl = this.#island(i, j);
      if (isl?.mushroom) best = Math.max(best, 1 - smoothstep(isl.r * 0.9, isl.r * 1.4, Math.hypot(x - isl.x, z - isl.z)));
    }
    return best;
  }

  /** Whether (x, z) is on (or just off) an island: 0..1. */
  islandAt(x, z) {
    const C = 640, ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const isl = this.#island(i, j);
      if (isl) best = Math.max(best, 1 - smoothstep(isl.r * 0.9, isl.r * 1.4, Math.hypot(x - isl.x, z - isl.z)));
    }
    return best;
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
    return smoothstep(0.05, 0.3, this.coastNoise.fbm(x * 0.0007 + 11, z * 0.0007 - 3, 2)) * (1 - w.wetland - w.mangrove) * (1 - 0.7 * w.desert);
  }

  /**
   * A cliffed coast, given the land's natural height above the sea `u`:
   * from the water it rises sheer to the cliff top (14-30 m), then on up
   * gently until it meets the land; offshore the sea deepens quickly, and
   * sea stacks, pillars of rock the sea has cut off, stand in it.
   */
  #seaCliff(x, z, u, scale = 1) {
    const h = this.#seaCliffRock(x, z, u, scale);
    // Sea caves: narrow inlets running back into the cliff under a roof of
    // rock (the roof is SeaCaveLayer's), their floor awash, rising to a
    // shingle beach at the back.
    // (Not while the great rivers are being worked out: they don't need them, and they're slow to find.)
    if (this._probing || this._riverWork || h < -2) return h;
    let out = h;
    for (const c of this.#seaCavesNear(x, z)) {
      const a = (x - c.x) * c.nx + (z - c.z) * c.nz;
      if (a < -4 || a > c.d + 1) continue;
      const b = Math.abs((x - c.x) * -c.nz + (z - c.z) * c.nx);
      const half = c.w * (1 - smoothstep(c.d * 0.6, c.d, a));
      if (b > half + 1) continue;
      const floor = -1.6 + 2.6 * smoothstep(c.d * 0.45, c.d * 0.95, a) + 0.3 * this.coastNoise.noise2D(x * 0.4, z * 0.4);
      const wall = smoothstep(half - 1.2, half + 0.6, b);
      if (out > floor) out = floor + (out - floor) * wall;
    }
    return out;
  }

  #seaCliffRock(x, z, u, scale = 1) {
    // (A fifth lower than they were: some 11 to 27 m; `scale` lower again round islands.)
    const C = (11 + 13 * (this.coastNoise.noise2D(x * 0.002, z * 0.002) * 0.5 + 0.5)) * scale;
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
    // At the cliff's foot, a ragged ledge of fallen rock, just awash.
    if (u > -3.5) {
      const rubble = this.coastNoise.ridged(x * 0.16 + 3, z * 0.16 - 7, 2, 2, 0.5, 0.05);
      const ledge = -1.3 + 2.4 * rubble + 0.5 * this.coastNoise.noise2D(x * 0.45 - 8, z * 0.45 + 2);
      h += Math.max(0, ledge - h) * smoothstep(-3.5, -0.8, u);
    }
    // Sea stacks: pillars of rock the sea has cut off, each standing on a
    // broad, ribbed skirt of fallen rock and ledges, awash at its foot.
    if (u > -9 && u < 0) {
      const fade = smoothstep(0, -0.8, u) * (1 - smoothstep(-6, -9, u));
      const S = 36;
      const ci = Math.floor(x / S), cj = Math.floor(z / S);
      const s = this.seed ^ 0x57ac;
      let stack = -Infinity;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di, j = cj + dj;
          if (hash2(i, j, s) > 0.18) continue;
          const px = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * S, pz = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * S;
          const r = 6 + 6 * hash2(i, j, s + 3);
          const dx = x - px, dz = z - pz;
          const d = Math.hypot(dx, dz) / r;
          if (d >= 2.5) continue;
          // The stack: a stout, tapering block of rock, no taller than about
          // twice its width, stepped where layers of it have broken away,
          // its outline ragged and its sides knobbled. Some are arches: two
          // legs, the rock between them worn through (the span over the gap,
          // one band of rock bowed from foot to foot, is SeaCoastLayer's;
          // here, the ledged rock its feet stand in).
          const H = Math.min(C * (0.3 + 0.35 * hash2(i, j, s + 4)), r * 2.2);
          const arch = this.#archAt(i, j, px, pz, r, H);
          const legs = arch ? [[arch.ax, arch.az, arch.leg], [arch.bx, arch.bz, arch.leg]] : [[px, pz, r]];
          for (const [lx, lz, lr] of legs) {
            const t = (Math.hypot(x - lx, z - lz) / lr) * (1 + 0.16 * this.coastNoise.noise2D(x * 0.2 + i, z * 0.2 - j));
            if (t < 1) {
              let top = arch ? Math.min(H * 0.35, 6) * Math.pow(1 - t, 1.2) + 1.5 : H * Math.pow(1 - Math.pow(t, 2.4), 0.55);
              top -= 0.9 * (top / 2.6 - Math.floor(top / 2.6)); // ledges
              const knobs = this.coastNoise.noise2D(x * 0.35 - 3, z * 0.35 + 5) * 1.2 * smoothstep(0.4, 0.9, t);
              stack = Math.max(stack, top + knobs);
            }
          }
          // The skirt: ribs of rock running out from the pillar, rubble between.
          // (Round each of an arch's legs, leaving the sea open under it.)
          const ribs = 0.5 + 0.5 * Math.cos(Math.atan2(dz, dx) * 7 + hash2(i, j, s + 5) * 6.28 + this.coastNoise.noise2D(x * 0.08, z * 0.08) * 2.5);
          const rubble = this.coastNoise.ridged(x * 0.2 - 11, z * 0.2 + 5, 2, 2, 0.5, 0.05);
          const skirt = arch
            ? 1 - smoothstep(0.7, 1.5, Math.min(Math.hypot(x - arch.ax, z - arch.az), Math.hypot(x - arch.bx, z - arch.bz)) / (arch.leg * 1.5))
            : 1 - smoothstep(0.9, 2.5, d);
          stack = Math.max(stack, -4 + (4.2 + 1.8 * ribs + 1.3 * rubble) * skirt);
        }
      }
      if (stack > h) h += (stack - h) * fade;
    }
    return h;
  }

  /**
   * The sea stack of cell (i, j) (centre px, pz, radius r, height H), if
   * it's an arch: two legs, `leg` in radius, either side of the centre,
   * the rock worn through between them. Else null.
   */
  #archAt(i, j, px, pz, r, H) {
    const s = this.seed ^ 0x57ac;
    if (H < 7 || hash2(i, j, s + 6) > 0.4) return null;
    const a = hash2(i, j, s + 7) * Math.PI, L = r * 1.2;
    const ca = Math.cos(a) * L, sa = Math.sin(a) * L;
    return { x: px, z: pz, r, H, ax: px - ca, az: pz - sa, bx: px + ca, bz: pz + sa, leg: r * 0.55 };
  }

  /** Sea arches whose centre lies in a box, standing in the sea (see #archAt). */
  seaArches(minX, minZ, maxX, maxZ) {
    const S = 36, s = this.seed ^ 0x57ac, sea = this.rivers.seaLevel;
    const out = [];
    for (let j = Math.floor(minZ / S) - 1; j <= Math.floor(maxZ / S); j++) {
      for (let i = Math.floor(minX / S) - 1; i <= Math.floor(maxX / S); i++) {
        if (hash2(i, j, s) > 0.18 || hash2(i, j, s + 6) > 0.4) continue;
        const px = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * S, pz = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * S;
        if (px < minX || pz < minZ || px >= maxX || pz >= maxZ) continue;
        if (this.getSeaCliff(px, pz) < 0.3) continue;
        // (Only on the dry coasts: desert, savanna, badlands.)
        const aw = this.getBiomeWeights(px, pz, {});
        if (aw.desert + aw.savanna + aw.badlands < 0.5) continue;
        const C = 14 + 16 * (this.coastNoise.noise2D(px * 0.002, pz * 0.002) * 0.5 + 0.5);
        const r = 6 + 6 * hash2(i, j, s + 3);
        const H = Math.min(C * (0.3 + 0.35 * hash2(i, j, s + 4)), r * 2.2);
        const arch = this.#archAt(i, j, px, pz, r, H);
        if (!arch) continue;
        // Both feet must stand on rock out of the sea, with the gap between them open.
        const ha = this.getBaseHeight(arch.ax, arch.az) - sea, hb = this.getBaseHeight(arch.bx, arch.bz) - sea;
        if (ha < 0.8 || hb < 0.8 || this.getBaseHeight(px, pz) - sea > -0.8) continue;
        // (Standing out in the sea, not on the shore.)
        if (this.getOceanness(px, pz) < 0.5) continue;
        // One band of rock bowed over the gap (see mesaArchAt), its feet in the surf.
        Object.assign(arch, {
          base: sea - 2, top: sea + H, band: true,
          lean: hash2(i, j, s + 11) * 2 - 1, bend: hash2(i, j, s + 12) * 2 - 1, seed: Math.floor(hash2(i, j, s + 13) * 1e6),
        });
        out.push(arch);
      }
    }
    return out;
  }

  /**
   * The sandstone arch of 260 m cell (i, j) in mesa country, or null: on
   * the flats between the mesas, two stout legs of layered sandstone with
   * a span of rock between them, worn through (as in Arches National
   * Park). Found on the land as it is without arches (the probe).
   */
  #mesaArch(i, j) {
    const cache = this._mesaArches ?? (this._mesaArches = new Map());
    const key = cellKey(i, j);
    if (cache.has(key)) return cache.get(key);
    const s = this.seed ^ 0xa4c2, G = 260;
    let arch = null;
    if (hash2(i, j, s) < 0.5) {
      const px = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * G, pz = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * G;
      const probe = this.#probe();
      const f = probe.getFeatures(px, pz);
      if (f.mesa > 0.35 && f.erg < 0.1 && f.canyon < 0.05) {
        const a = hash2(i, j, s + 3) * Math.PI, L = 8 + 6 * hash2(i, j, s + 4);
        const ca = Math.cos(a) * L, sa = Math.sin(a) * L;
        const h0 = probe.getBaseHeight(px, pz), ha = probe.getBaseHeight(px - ca, pz - sa), hb = probe.getBaseHeight(px + ca, pz + sa);
        const low = Math.min(h0, ha, hb);
        if (Math.max(h0, ha, hb) - low < 2.5 && low > this.rivers.seaLevel + 4) {
          const H = 15 + 12 * hash2(i, j, s + 5);
          arch = { x: px, z: pz, ax: px - ca, az: pz - sa, bx: px + ca, bz: pz + sa, angle: a, leg: 3.4 + 1.6 * hash2(i, j, s + 6), H, r: L * 0.5, base: low, top: low + H, sandstone: true,
            lean: hash2(i, j, s + 7) * 2 - 1, bend: hash2(i, j, s + 8) * 2 - 1, seed: Math.floor(hash2(i, j, s + 9) * 1e6), band: true };
        }
      }
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, arch);
    return arch;
  }

  /**
   * The natural bridge of 700 m cell (i, j), or null: now and then a
   * canyon is spanned by a broad band of its own rock from rim to rim, its
   * ends rooted back in the walls, its top level with the rims (you can
   * walk across it, and along the floor under it). Found on the land as it
   * is without it (the probe): a spot on a canyon's floor, and the shortest
   * way across from there to both rims.
   */
  #canyonBridge(i, j) {
    const cache = this._bridges ?? (this._bridges = new Map());
    const key = cellKey(i, j);
    if (cache.has(key)) return cache.get(key);
    const s = this.seed ^ 0xb81d, G = 700;
    let bridge = null;
    const probe = this.#probe();
    for (let t = 0; t < 8 && !bridge && hash2(i, j, s) < 0.8; t++) {
      const px = (i + 0.15 + 0.7 * hash2(i + t * 37, j, s + 1)) * G, pz = (j + 0.15 + 0.7 * hash2(i, j + t * 37, s + 2)) * G;
      const f = probe.getFeatures(px, pz);
      if (!(f.canyonFloor > 0.6 && f.canyonCut > 20)) continue;
      // (Only in the dry country: desert, savanna, badlands.)
      const bw = this.getBiomeWeights(px, pz, {});
      if (bw.desert + bw.savanna + bw.badlands < 0.5) continue;
      const floor = probe.getBaseHeight(px, pz), rimAt = floor + f.canyonCut * 0.85;
      // (How far to the rim, each way round.)
      const out = (a) => {
        for (let d = 4; d < 70; d += 2) if (probe.getBaseHeight(px + Math.cos(a) * d, pz + Math.sin(a) * d) > rimAt) return d;
        return Infinity;
      };
      let best = null;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI, d1 = out(a), d2 = out(a + Math.PI);
        if (d1 + d2 < 120 && (!best || d1 + d2 < best.d1 + best.d2)) best = { a, d1, d2 };
      }
      if (!best) continue;
      const ca = Math.cos(best.a), sa = Math.sin(best.a), back = 0.3 * (best.d1 + best.d2) + 6;
      const ax = px - ca * (best.d2 + back), az = pz - sa * (best.d2 + back), bx = px + ca * (best.d1 + back), bz = pz + sa * (best.d1 + back);
      const rim = Math.min(probe.getBaseHeight(px - ca * (best.d2 + 4), pz - sa * (best.d2 + 4)), probe.getBaseHeight(px + ca * (best.d1 + 4), pz + sa * (best.d1 + 4)));
      const leg = 4.5 + 2 * hash2(i, j, s + 3);
      bridge = { x: (ax + bx) / 2, z: (az + bz) / 2, ax, az, bx, bz, angle: best.a, leg, H: rim - floor, r: (best.d1 + best.d2) / 2, base: rim - f.canyonCut * 0.35, top: rim + 0.6, sandstone: true,
        lean: 0, bend: (hash2(i, j, s + 4) * 2 - 1) * 0.4, seed: Math.floor(hash2(i, j, s + 5) * 1e6), band: true, bridge: true };
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, bridge);
    return bridge;
  }

  /** Natural bridges over the canyons whose middle lies in a box (see #canyonBridge). */
  canyonBridges(minX, minZ, maxX, maxZ) {
    const G = 700, out = [];
    for (let j = Math.floor(minZ / G); j <= Math.floor(maxZ / G); j++) {
      for (let i = Math.floor(minX / G); i <= Math.floor(maxX / G); i++) {
        const b = this.#canyonBridge(i, j);
        if (b && b.x >= minX && b.z >= minZ && b.x < maxX && b.z < maxZ) out.push(b);
      }
    }
    return out;
  }

  /** Sandstone arches whose centre lies in a box (see #mesaArch). */
  mesaArches(minX, minZ, maxX, maxZ) {
    const G = 260, out = [];
    for (let j = Math.floor(minZ / G); j <= Math.floor(maxZ / G); j++) {
      for (let i = Math.floor(minX / G); i <= Math.floor(maxX / G); i++) {
        const a = this.#mesaArch(i, j);
        if (a && a.x >= minX && a.z >= minZ && a.x < maxX && a.z < maxZ) out.push(a);
      }
    }
    return out;
  }

  // The height of the rock the feet of any sandstone arch stand in at
  // (x, z) (a low, ledged apron of it, spreading out round each foot), or -Infinity.
  #archLegs(x, z) {
    const G = 260;
    const ci = Math.floor(x / G), cj = Math.floor(z / G);
    let best = -Infinity;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const a = this.#mesaArch(i, j);
        if (!a || Math.abs(x - a.x) > 30 || Math.abs(z - a.z) > 30) continue;
        const ca = Math.cos(a.angle), sa = Math.sin(a.angle);
        for (const [lx, lz] of [[a.ax, a.az], [a.bx, a.bz]]) {
          const dx = x - lx, dz = z - lz;
          const u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
          const e = Math.hypot(u / (a.leg * 2.1), v / (a.leg * 1.7)) * (1 + 0.14 * this.mesaNoise.noise2D(x * 0.3, z * 0.3));
          if (e >= 1) continue;
          let top = Math.min(7, a.H * 0.3) * Math.pow(1 - e, 1.4);
          top -= 0.5 * (top / 1.6 - Math.floor(top / 1.6)); // ledges, layer by layer
          best = Math.max(best, a.base + top);
        }
      }
    }
    return best;
  }

  /** Tide pool sites around (x, z): hollows in the rock ledges at the foot of sea cliffs. */
  #poolsNear(x, z) {
    const T = 12, s = this.seed ^ 0x71de;
    const ci = Math.floor(x / T), cj = Math.floor(z / T);
    const out = [];
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (hash2(i, j, s) > 0.45) continue;
        out.push({ x: (i + 0.25 + 0.5 * hash2(i, j, s + 1)) * T, z: (j + 0.25 + 0.5 * hash2(i, j, s + 2)) * T, r: 2.5 + 2.5 * hash2(i, j, s + 3) });
      }
    }
    return out;
  }

  /** Is (x, z) in or right by a tide pool (for keeping boulders out of them)? */
  nearTidePool(x, z) {
    if (this.getSeaCliff(x, z) < 0.5) return false;
    return this.#poolsNear(x, z).some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 2.2 + 2);
  }

  /**
   * Tide pools with their centre in a box that may hold water: sites on a
   * cliffed coast. (Whether one really formed, walled all round above its
   * water, is for whoever draws it to check against the ground.)
   */
  tidePools(minX, minZ, maxX, maxZ) {
    const T = 12, s = this.seed ^ 0x71de;
    const out = [];
    for (let j = Math.floor(minZ / T); j <= Math.floor(maxZ / T); j++) {
      for (let i = Math.floor(minX / T); i <= Math.floor(maxX / T); i++) {
        if (hash2(i, j, s) > 0.45) continue;
        const x = (i + 0.25 + 0.5 * hash2(i, j, s + 1)) * T, z = (j + 0.25 + 0.5 * hash2(i, j, s + 2)) * T;
        if (x < minX || z < minZ || x >= maxX || z >= maxZ) continue;
        if (this.getSeaCliff(x, z) < 0.6) continue;
        out.push({ x, z, r: 2.5 + 2.5 * hash2(i, j, s + 3), level: this.rivers.seaLevel + TIDE_LEVEL, seed: hash2(i, j, s + 4) });
      }
    }
    return out;
  }

  /**
   * A second generator for the same world, asked things this one may need
   * to know in the middle of working out a height (where asking itself
   * would upset the working). It makes no sea caves, nor hollows for oases.
   */
  #probe() {
    return this._probe ?? (this._probe = Object.assign(new TerrainGenerator(this.seedText, this._config), { _probing: true }));
  }

  /**
   * The oasis of 600 m cell (i, j), or null: deep in a dune sea, a
   * spring-fed pool (radius r) in a hollow among the dunes, ringed with
   * grass and palms.
   */
  #oasis(i, j) {
    const cache = this._oases ?? (this._oases = new Map());
    const key = cellKey(i, j);
    if (cache.has(key)) return cache.get(key);
    const s = this.seed ^ 0x0a515, G = 600;
    let oasis = null;
    if (hash2(i, j, s) < 0.55) {
      const x = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * G, z = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * G;
      const probe = this.#probe();
      // (Well inland: dry sand all round, the sea and any lake well away.)
      const dry = (px, pz) => probe.getBaseHeight(px, pz) > this.rivers.seaLevel + 6;
      if (probe.getFeatures(x, z).erg > 0.75 && dry(x, z) && [0, 1, 2, 3, 4, 5].every((k) => dry(x + Math.cos(k * 1.05) * 90, z + Math.sin(k * 1.05) * 90))) {
        oasis = { x, z, r: 14 + 12 * hash2(i, j, s + 3) };
      }
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, oasis);
    return oasis;
  }

  /** The nearest oasis to (x, z) within a few hundred metres: { oasis, d }, or null. */
  #oasisNear(x, z) {
    const G = 600;
    const ci = Math.floor(x / G), cj = Math.floor(z / G);
    let best = null;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const o = this.#oasis(i, j);
        if (!o) continue;
        const d = Math.hypot(x - o.x, z - o.z);
        if (d < o.r * 4 && (!best || d < best.d)) best = { oasis: o, d };
      }
    }
    return best;
  }

  /** Oases whose pool lies in a box. */
  oases(minX, minZ, maxX, maxZ) {
    const G = 600, out = [];
    for (let j = Math.floor(minZ / G); j <= Math.floor(maxZ / G); j++) {
      for (let i = Math.floor(minX / G); i <= Math.floor(maxX / G); i++) {
        const o = this.#oasis(i, j);
        if (o && o.x >= minX && o.z >= minZ && o.x < maxX && o.z < maxZ) out.push(o);
      }
    }
    return out;
  }

  /** How much (x, z) is an oasis's green ring (0..1): grass and palms round its pool. */
  oasisAt(x, z) {
    if (this.getBiomeWeights(x, z, {}).desert < 0.3) return 0;
    const n = this.#oasisNear(x, z);
    if (!n) return 0;
    const edge = n.oasis.r * (2.4 + 0.5 * this.detailNoise.noise2D(x * 0.03 + 9, z * 0.03 - 9));
    return 1 - smoothstep(edge - 8, edge, n.d);
  }

  /** Sea caves whose cells are round (x, z) (see #seaCave). */
  #seaCavesNear(x, z) {
    const G = 120;
    const ci = Math.floor(x / G), cj = Math.floor(z / G);
    const out = this._cavesNear ?? (this._cavesNear = []);
    out.length = 0;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const c = this.#seaCave(i, j);
        if (c) out.push(c);
      }
    }
    return out;
  }

  /** Sea caves whose mouth lies in a box. */
  seaCaves(minX, minZ, maxX, maxZ) {
    const G = 120, out = [];
    for (let j = Math.floor(minZ / G) - 1; j <= Math.floor(maxZ / G) + 1; j++) {
      for (let i = Math.floor(minX / G) - 1; i <= Math.floor(maxX / G) + 1; i++) {
        const c = this.#seaCave(i, j);
        if (c && c.x >= minX && c.z >= minZ && c.x < maxX && c.z < maxZ) out.push(c);
      }
    }
    return out;
  }

  /**
   * The sea cave of 120 m cell (i, j), or null: where a tall cliff rises
   * straight from the sea, a mouth `w` metres (half-width) across and `A`
   * high at the foot of the cliff, the cave running `d` metres back into it
   * along (nx, nz). Found on the land as it is without caves (a second
   * generator that makes none), so it's the same whoever asks first.
   */
  #seaCave(i, j) {
    const cache = this._seaCaves ?? (this._seaCaves = new Map());
    const key = cellKey(i, j);
    if (cache.has(key)) return cache.get(key);
    let cave = null;
    const s = this.seed ^ 0x5eca;
    const G = 120;
    if (hash2(i, j, s) < 0.7) {
      // (All of it asked of the probe: this may be in the middle of working
      // out a height, and mustn't have its working disturbed.)
      const probe = this.#probe();
      // A few tries at a spot on a cliffed coast.
      for (let k = 0; k < 3 && !cave; k++) {
        const px = (i + 0.1 + 0.8 * hash2(i, j, s + 1 + k * 10)) * G, pz = (j + 0.1 + 0.8 * hash2(i, j, s + 2 + k * 10)) * G;
        if (probe.getSeaCliff(px, pz) > 0.4) cave = probe.#findCave(px, pz, i, j, s);
      }
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, cave);
    return cave;
  }

  // (On the probe generator: find the cliff's foot near (px, pz), and check it's a good one.)
  #findCave(px, pz, i, j, s) {
    const sea = this.rivers.seaLevel;
    const h = (x, z) => this.getBaseHeight(x, z) - sea;
    // Which way the land rises (up the cliff).
    let gx = h(px + 20, pz) - h(px - 20, pz), gz = h(px, pz + 20) - h(px, pz - 20);
    let g = Math.hypot(gx, gz);
    if (g < 1e-3) return null;
    let nx = gx / g, nz = gz / g;
    // March in from the sea to the foot of the cliff.
    let face = null;
    for (let t = -60; t < 60; t += 1.5) {
      const x = px + nx * t, z = pz + nz * t;
      if (h(x, z) < -0.5 && h(x + nx * 4, z + nz * 4) > 6) {
        face = [x + nx * 1.5, z + nz * 1.5];
        break;
      }
    }
    if (!face) return null;
    const [fx, fz] = face;
    // Square up to the cliff there.
    gx = h(fx + nx * 2 + 3, fz + nz * 2) - h(fx + nx * 2 - 3, fz + nz * 2);
    gz = h(fx + nx * 2, fz + nz * 2 + 3) - h(fx + nx * 2, fz + nz * 2 - 3);
    g = Math.hypot(gx, gz);
    if (g < 1e-3) return null;
    nx = gx / g;
    nz = gz / g;
    const w = 2.8 + 1.8 * hash2(i, j, s + 3), d = 16 + 12 * hash2(i, j, s + 4);
    // Sea in front; a tall cliff above and all the way back; cliff on both sides.
    if (h(fx - nx * 6, fz - nz * 6) > -0.8) return null;
    let top = Infinity;
    for (const t of [4, d * 0.5, d + 2]) top = Math.min(top, h(fx + nx * t, fz + nz * t));
    for (const side of [-1, 1]) {
      const sx = -nz * side * (w + 3), sz = nx * side * (w + 3);
      for (const t of [3, d * 0.5]) top = Math.min(top, h(fx + nx * t + sx, fz + nz * t + sz));
    }
    const A = Math.min(3.5 + 3.5 * hash2(i, j, s + 5), top - 6);
    if (A < 3) return null;
    return { x: fx, z: fz, nx, nz, w, d, A, top: top + sea };
  }

  /**
   * Rock overhead at (x, z): the roof of a sea cave or the span of a sea
   * arch, as { bottom, top } heights, or null. (For standing on them.)
   */
  overhangAt(x, z) {
    const sea = this.rivers.seaLevel;
    for (const c of this.#seaCavesNear(x, z)) {
      const a = (x - c.x) * c.nx + (z - c.z) * c.nz;
      const b = (x - c.x) * -c.nz + (z - c.z) * c.nx;
      if (a < -1 || a > c.d + 1 || Math.abs(b) > c.w) continue;
      const roof = caveRoof(c, a, b);
      return { cave: true, bottom: sea + roof, top: this.getBaseHeight(c.x + c.nx * a - c.nz * (c.w + 1.5), c.z + c.nz * a + c.nx * (c.w + 1.5)) };
    }
    const S = 36;
    for (const arch of [...this.seaArches(x - S * 1.5, z - S * 1.5, x + S * 1.5, z + S * 1.5), ...this.mesaArches(x - 300, z - 300, x + 300, z + 300), ...this.canyonBridges(x - 120, z - 120, x + 120, z + 120)]) {
      const vx = arch.bx - arch.ax, vz = arch.bz - arch.az, L2 = vx * vx + vz * vz;
      const t = ((x - arch.ax) * vx + (z - arch.az) * vz) / L2;
      if (t < 0 || t > 1) continue;
      if (arch.band) {
        // (Over the band where it passes: its underside and top here.)
        const b = mesaArchAt(arch, Math.acos(1 - 2 * t));
        if (Math.hypot(x - b.x, z - b.z) > b.wd * 0.8 + Math.abs(b.n[0] * vx + b.n[2] * vz) / Math.sqrt(L2) * b.th) continue;
        const reach = b.th / Math.max(0.3, Math.abs(b.n[1]));
        return { bottom: b.y - reach, top: Math.min(arch.top, b.y + reach) };
      }
    }
    return null;
  }

  /**
   * A wave-cut rock shelf and its tide pools, given the land's natural
   * height above the sea `u` and the coast as shaped so far `h` (both
   * relative to the sea), `amount` of it (0..1).
   */
  #shelf(x, z, u, h, amount) {
    const shelf = amount * smoothstep(-0.15, 0.15, this.coastNoise.noise2D(x * 0.0035 - 40, z * 0.0035 + 25)) * smoothstep(-10, -8, u);
    if (shelf > 0) {
      const rubble = this.coastNoise.ridged(x * 0.16 + 3, z * 0.16 - 7, 2, 2, 0.5, 0.05);
      const bench = 0.15 + 0.55 * rubble + 0.25 * this.coastNoise.noise2D(x * 0.12 + 4, z * 0.12 - 6);
      h += Math.max(0, bench - h) * shelf;
    }
    // Tide pools: hollows in the rock, each walled round by a lip of rock
    // that holds the water in when the sea is below it.
    const rocky = Math.max(shelf, amount * smoothstep(-3.5, -0.8, u));
    if (rocky > 0.5 && h > -1.6 && h < 2) {
      for (const p of this.#poolsNear(x, z)) {
        const d = Math.hypot(x - p.x, z - p.z) / p.r;
        if (d >= 1.5) continue;
        const lip = TIDE_LIP + 0.08 * this.coastNoise.noise2D(x * 0.9, z * 0.9);
        if (d > 0.6) h = Math.max(h, lip * (1 - smoothstep(1.25, 1.5, d)) + h * smoothstep(1.25, 1.5, d));
        else h = Math.min(Math.max(h, 0.15), TIDE_LEVEL - 0.15 - 0.3 * (1 - (d / 0.6) ** 2));
      }
    }
    return h;
  }

  /**
   * The volcano whose cell is (i, j), or null: cinder cones well spread out
   * (at most one per 1.1 km cell) and only well inside volcanic country.
   */
  #cone(i, j) {
    const key = cellKey(i, j);
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
    const key = (i, j) => cellKey(i, j);
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
    const key = cellKey(i, j);
    const cache = this._coneAt ?? (this._coneAt = new Map());
    if (cache.has(key)) return cache.get(key);
    let cone = null;
    const s = this.seed ^ 0xc0e5;
    const C = 1100;
    if (hash2(i, j, s) < 0.8) {
      const x = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * C, z = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * C;
      // (A fresh object: the shared one may be in use for the point being built.)
      const range = this.#rangeField(x, z, {}).value;
      // (Deep inside the volcanic highlands: the country all round it volcanic too.)
      const deep = (px, pz) => this.#volcanoZone(px, pz, this.#rangeField(px, pz, {}).value);
      if (this.#volcanoZone(x, z, range) > 0.85 && this.#hillsZone(x, z, range) < 0.1 && [0, 1, 2, 3, 4, 5].every((k) => deep(x + Math.cos(k * 1.047) * 420, z + Math.sin(k * 1.047) * 420) > 0.55)) {
        const R = 240 + 150 * hash2(i, j, s + 3);
        const flows = [];
        const count = 4 + Math.floor(hash2(i, j, s + 4) * 4);
        for (let k = 0; k < count; k++) {
          flows.push({ a: hash2(i + k, j, s + 5) * Math.PI * 2, len: R * (1.3 + 0.8 * hash2(i, j + k, s + 6)), thick: 3 + 4 * hash2(i - k, j, s + 7) });
        }
        // What state it's in: four in ten dead (half of those holding a
        // crater lake, steaming a little), four in ten erupting (a fountain
        // of lava in the crater and a live flow down one flank, over its
        // first tongue of old lava), one in ten blown apart (a broad,
        // ruined crater, one side of its rim gone), and one in ten
        // simmering (a lake of molten lava in the crater, smoking).
        const r = hash2(i, j, s + 13);
        const state = r < 0.4 ? 'dead' : r < 0.8 ? 'erupting' : r < 0.9 ? 'blown' : 'simmering';
        const blown = state === 'blown';
        cone = {
          x, z, R, seed: hash2(i, j, s + 10) * 10, state,
          H: (130 + 110 * hash2(i, j, s + 8)) * (blown ? 0.55 : 1),
          rc: R * (blown ? 0.42 + 0.08 * hash2(i, j, s + 9) : 0.16 + 0.06 * hash2(i, j, s + 9)),
          depth: (30 + 25 * hash2(i, j, s + 11)) * (blown ? 1.4 : 1),
          breach: hash2(i, j, s + 15) * Math.PI * 2, // (blown: the side its rim's gone from)
          lava: state === 'erupting' || state === 'simmering',
          active: state === 'erupting',
          lake: state === 'dead' && hash2(i, j, s + 12) < 0.5,
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
    const out = this._volc ?? (this._volc = { height: 0, lava: 0, crater: 0, cone: 0, channel: 0, blocks: 0, cold: 0, flowSide: 0, dead: 0, toe: 0 });
    out.height = 0;
    out.toe = 0;
    out.cold = 0;
    out.flowSide = 0;
    out.dead = 0;
    out.channel = 0;
    out.blocks = 0;
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
        // (Black rock strewn thick over a dead volcano, and along both sides of a live flow: see rockCandidates.)
        if (c.state === 'dead') out.dead = Math.max(out.dead, 1 - smoothstep(c.R * 0.8, c.R * 1.7, d));
        if (c.active && c.flows.length) {
          const lp = this.lavaPath(c, d);
          if (lp) {
            let dl = angle - lp.angle;
            dl = Math.abs(Math.atan2(Math.sin(dl), Math.cos(dl)) * d);
            out.flowSide = Math.max(out.flowSide, smoothstep(lp.half * 1.7, lp.half * 2.3, dl) * (1 - smoothstep(lp.half * 4, lp.half * 9, dl)));
          }
          // (Where it ends: a broad lobe of black rubble it's pushed up, the front of the flow.)
          // (Not while rivers or a flow's end are being worked out, nor in a
          // quick look (see #probe): they don't need it, and it would set off
          // working out more of them, and more, far and wide.)
          const e = this._noToe || this._probing || this._riverWork ? null : this.lavaEnd(c), de = e ? Math.hypot(x - e.x, z - e.z) : Infinity;
          if (de < 70) {
            out.toe = Math.max(out.toe, 1 - smoothstep(15, 65, de));
            h += 2.2 * (1 - smoothstep(8, 45, de)) * (0.7 + 0.3 * this.volcanoNoise.ridged(x * 0.08, z * 0.08, 2, 2, 0.5, 0.02));
          }
        }
        if (t < 1) {
          out.cone = Math.max(out.cone, 1 - smoothstep(0.75, 1, t));
          // Concave flanks up to the rim, furrowed by gullies, then the crater bowl.
          let rimH = c.H * Math.pow(1 - c.rc / c.R, 1.5);
          // (Blown apart: the rim ragged, broken down low on one side, where the blast went out.)
          let ruin = 1;
          if (c.state === 'blown') {
            let db = angle - c.breach;
            db = Math.abs(Math.atan2(Math.sin(db), Math.cos(db)));
            ruin = (0.25 + 0.75 * smoothstep(0.35, 1.3, db)) * (0.8 + 0.35 * this.volcanoNoise.ridged(angle * 3 + c.seed, t * 4, 2, 2, 0.5, 1));
            rimH *= ruin;
          }
          // (A dead or blown volcano's bowl: black volcanic rock.)
          if (c.state === 'dead' || c.state === 'blown') out.cold = Math.max(out.cold, 1 - smoothstep(c.rc * 0.95, c.rc * 1.25, d));
          if (d < c.rc) {
            h = rimH - c.depth * Math.pow(1 - (d / c.rc) ** 2, 0.7) * (c.state === 'blown' ? Math.min(1, ruin + 0.3) : 1);
            out.crater = Math.max(out.crater, 1);
          } else {
            // (Across a live flow, the flank's furrows follow the flow: its two banks alike.)
            const lp = c.active ? this.lavaPath(c, d) : null;
            let na = angle;
            if (lp) {
              let dl = angle - lp.angle;
              dl = Math.atan2(Math.sin(dl), Math.cos(dl));
              if (Math.abs(dl * d) < lp.half * 3) na = lp.angle;
              else if (Math.abs(dl * d) < lp.half * 5) na = lp.angle + dl * smoothstep(lp.half * 3, lp.half * 5, Math.abs(dl * d));
            }
            h = c.H * Math.pow(1 - t, 1.5) * (0.95 + 0.05 * this.volcanoNoise.noise2D(na * 5 + c.seed, t * 3)) * (c.state === 'blown' ? 0.6 + 0.4 * Math.min(1, ruin + smoothstep(0.5, 1, t)) : 1);
            out.crater = Math.max(out.crater, 1 - smoothstep(c.rc, c.rc * 1.6, d));
          }
        }
        // A live flow: a channel down the flank between levees of fresh
        // lava, in places roofed over into a lava tube (skylights here and there).
        if (c.active && c.flows.length) {
          const ch = this.#lavaChannel(c, d, angle);
          if (ch) {
            h += ch.dh;
            if (ch.open) out.lava = Math.max(out.lava, 1);
            out.channel = Math.max(out.channel, ch.open);
            out.blocks = Math.max(out.blocks, ch.block);
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
          // (Beside the live flow, smooth: its banks stand level with each other.)
          const live = c.active && f === c.flows[0] ? 1 - smoothstep(0.35, 0.8, across) : 0;
          const rough = 0.75 + 0.25 * this.volcanoNoise.ridged(x * 0.04, z * 0.04, 2, 2, 0.5, 0.02);
          h += f.thick * mask * (rough + (0.9 - rough) * live);
          out.lava = Math.max(out.lava, mask);
        }
        out.height = Math.max(out.height, h);
      }
    }
    return out;
  }

  /**
   * A live lava flow's path (volcano `c`'s first tongue): from the crater's
   * rim down the flank, wandering a little. For a distance `d` from the
   * summit: { angle (of its middle line), half (its channel's half-width),
   * tube (0: it's open all the way) }, or null past its ends.
   */
  lavaPath(c, d) {
    const f = c.flows[0];
    const d0 = c.rc * 0.55, d1 = f.len * 0.85; // (from out in the crater's lava lake)
    if (d < d0 || d > d1) return null;
    const u = (d - d0) / (d1 - d0);
    const angle = f.a + 0.07 * Math.sin(d * 0.018 + c.seed) + 0.04 * Math.sin(d * 0.047 - c.seed * 2);
    // (Open all the way down: one river of lava, no tubes.)
    return { angle, half: 3.2 + d * 0.012, tube: 0, d0, d1, u };
  }

  // How much (x, z) is in a crater holding a lake (1), fading out over its rim (0): smooth there.
  #craterCalm(x, z) {
    let calm = 0;
    for (const c of this.#conesNear(x, z)) {
      if (!(c.lake || c.lava)) continue;
      calm = Math.max(calm, 1 - smoothstep(c.rc * 0.8, c.rc * 1.1, Math.hypot(x - c.x, z - c.z)));
    }
    return calm;
  }

  // How much (x, z) is on a live lava flow or its levees (1), fading out beyond them (0).
  #lavaCalm(x, z) {
    let calm = 0;
    for (const c of this.#conesNear(x, z)) {
      if (!c.active) continue;
      const d = Math.hypot(x - c.x, z - c.z);
      const p = this.lavaPath(c, d);
      if (!p) continue;
      let da = Math.atan2(z - c.z, x - c.x) - p.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      calm = Math.max(calm, 1 - smoothstep(p.half * 2, p.half * 3.2, Math.abs(da * d)));
    }
    return calm;
  }

  /**
   * How thick the debris a blown-apart volcano threw out lies at (x, z)
   * (0..1): heaped round the ruined crater and out the way the blast went,
   * thinning out a long way off.
   */
  blastAt(x, z) {
    let b = 0;
    // (It reaches a long way: the cones of the cells two round.)
    const C = 1100, ci = Math.floor(x / C), cj = Math.floor(z / C);
    const cones = [];
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const c = this.#cone(ci + di, cj + dj);
      if (c) cones.push(c);
    }
    for (const c of cones) {
      if (c.state !== 'blown') continue;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.R * 6.4) continue;
      let da = Math.atan2(z - c.z, x - c.x) - c.breach;
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      const reach = c.R * (2.8 + 3.6 * (1 - smoothstep(0.3, 1.4, da))); // (furthest out the way it blew)
      b = Math.max(b, (1 - smoothstep(c.rc * 0.6, reach, d)) * (d < c.rc * 0.5 ? 0.5 : 1));
    }
    return b;
  }

  /**
   * The open molten lava nearest (x, z): { d (metres to its edge across
   * the land, 0 over it), y (its surface there) }, or null if there's none
   * within a few hundred metres. (A crater's lava lake, a live flow.)
   */
  lavaNear(x, z) {
    let best = null;
    for (const c of this.#conesNear(x, z)) {
      if (!c.lava) continue;
      const dist = Math.hypot(x - c.x, z - c.z);
      if (dist > c.R * 4) continue;
      const lake = Math.max(0, dist - c.rc * 0.62);
      if (!best || lake < best.d) best = { d: lake, y: this.craterLevel(c) };
      if (!c.active) continue;
      const p = this.lavaPath(c, dist), end = this.lavaEnd(c);
      if (!p || dist > end.d) continue;
      let da = Math.atan2(z - c.z, x - c.x) - p.angle;
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)) * dist);
      const d = Math.max(0, da - p.half);
      if (d < best.d) best = { d, y: this.getBaseHeight(c.x + Math.cos(p.angle) * dist, c.z + Math.sin(p.angle) * dist) + 1.0 };
    }
    return best;
  }

  /**
   * How an awake volcano (erupting or simmering) has burnt the land at
   * (x, z): 2 on its cone (nothing grows), 1 round its foot and along
   * its flow (only dead trees stand), 0 untouched.
   */
  scorchAt(x, z) {
    let s = 0;
    for (const c of this.#conesNear(x, z)) {
      if (!c.lava) continue;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.R * 1.05) return 2;
      if (d < c.R * 1.9) s = 1;
      if (c.active) {
        const p = this.lavaPath(c, d);
        if (p) {
          let da = Math.atan2(z - c.z, x - c.x) - p.angle;
          da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)) * d);
          if (da < p.half * 3) return 2;
          if (da < p.half * 12) s = 1;
        }
        const e = this.lavaEnd(c);
        const de = Math.hypot(x - e.x, z - e.z);
        if (de < 75) return 2; // (bare over the rubble at its end)
        if (de < 140) s = 1;
      }
    }
    return s;
  }

  /** Whether (x, z) is on a live lava flow or its levees (nothing grows or lies there). */
  onLiveLava(x, z) {
    for (const c of this.#conesNear(x, z)) {
      if (!c.active) continue;
      const d = Math.hypot(x - c.x, z - c.z);
      const p = this.lavaPath(c, d);
      if (!p) continue;
      let da = Math.atan2(z - c.z, x - c.x) - p.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da * d) < p.half * 2) return true;
    }
    return false;
  }

  /**
   * Where volcano c's live flow ends: down its path from the crater until
   * it meets water (a river, a lake, the sea), where it stops, steaming,
   * crusting over. { d (its distance from the summit), x, z, water
   * (whether it ran into water) }. (Remembered.)
   */
  lavaEnd(c) {
    if (c._end) return c._end;
    if (c._ending) return null; // (finding it: the land looked at meanwhile without the rubble at its end)
    c._ending = true;
    this._noToe = (this._noToe ?? 0) + 1; // (the land along it without any flow's rubble: the same however it's come to)
    try {
      return this.#findLavaEnd(c);
    } finally {
      c._ending = false;
      this._noToe--;
    }
  }

  #findLavaEnd(c) {
    const f = c.flows[0];
    let end = { d: f.len * 0.85, x: c.x + Math.cos(f.a) * f.len * 0.85, z: c.z + Math.sin(f.a) * f.len * 0.85, water: false };
    for (let d = c.rc * 1.02; d < f.len * 0.85; d += 2) {
      const p = this.lavaPath(c, d);
      if (!p) continue;
      const x = c.x + Math.cos(p.angle) * d, z = c.z + Math.sin(p.angle) * d;
      if (this.getBaseHeight(x, z) < this.rivers.seaLevel + 0.3 || this.rivers.at(x, z, p.half * 0.5)) {
        end = { d, x, z, water: true };
        break;
      }
    }
    return (c._end = end);
  }

  // The live flow's channel at (distance d, angle) from volcano c's summit:
  // { dh (height change), open (0..1, open lava there), block (0..1, on its
  // fresh black levees) }. A
  // shallow channel, the lava brimming in it, between two low levees of
  // cooled lava the same height either side (or roofed over, a tube).
  #lavaChannel(c, d, angle) {
    const p = this.lavaPath(c, d);
    if (!p) return null;
    let da = angle - p.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const across = Math.abs(da * d) / p.half;
    if (across > 2.4) return null;
    let dh = 0, open = 0;
    if (!p.tube) {
      dh -= 1.2 * (1 - smoothstep(0.85, 1.15, across)); // (the channel's floor)
      open = 1 - smoothstep(0.85, 1.05, across);
    } else dh += 0.6 * (1 - smoothstep(0.9, 1.25, across)); // (the tube's roof, a low hump)
    // The levees: a smooth ridge along each bank, alike on both sides.
    // (None up in the crater: there the lake runs out between the notch's walls.)
    const levee = Math.max(0, 1 - Math.abs(across - 1.35) / 0.6) ** 2 * (1 - smoothstep(0.85, 1.0, d / p.d1)) * smoothstep(c.rc, c.rc * 1.4, d);
    dh += 1.1 * levee;
    return { dh, open, block: Math.min(1, levee * 2 + open) };
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
   * The hot spring or geyser in 180 m cell (i, j), or null: only well
   * inside volcanic country, off the cones and their lava.
   * { x, z, r (pool radius), geyser, period (s between eruptions), phase, strength }
   */
  #springAt(i, j) {
    const key = cellKey(i, j);
    const cache = this._springs ?? (this._springs = new Map());
    if (cache.has(key)) return cache.get(key);
    const springs = [];
    const s = this.seed ^ 0x5b1e;
    const C = 180;
    const ok = (x, z, need = 0.75) => {
      // (Fresh objects: the shared ones may be in use for the point being built.)
      const w = this.getBiomeWeights(x, z, {}, this.#rangeField(x, z, {}).value);
      if (!(w.volcanic > need)) return false;
      const v = this.getVolcanic(x, z);
      return v.cone < 0.2 && v.lava < 0.1;
    };
    if (hash2(i, j, s) < 0.5) {
      const x = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * C, z = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * C;
      if (ok(x, z)) {
        springs.push({
          x, z,
          r: 4 + 4 * hash2(i, j, s + 3),
          geyser: hash2(i, j, s + 4) < 0.35,
          hue: Math.floor(hash2(i, j, s + 8) * 6), // (its colours: see Rivers' hot pools, and the mats round it)
          period: 45 + 60 * hash2(i, j, s + 5),
          phase: hash2(i, j, s + 6),
          strength: 0.7 + 0.3 * hash2(i, j, s + 7),
        });
      }
    }
    // Geothermal fields: here and there in the volcanic country, a patch
    // where the ground is riddled with them, pools and geysers crowded
    // close together (see #geothermalField).
    const cx = (i + 0.5) * C, cz = (j + 0.5) * C;
    const field = this.#geothermalField(cx, cz);
    if (field) {
      const rand = mulberry32(hash2(i, j, s + 40) * 4294967296);
      const n = 3 + Math.floor(rand() * 4);
      for (let t = 0; t < 40 && springs.length < n + 1; t++) {
        const x = i * C + 8 + rand() * (C - 16), z = j * C + 8 + rand() * (C - 16);
        if (Math.hypot(x - field.x, z - field.z) > field.r) continue;
        if (springs.some((o) => Math.hypot(o.x - x, o.z - z) < 13)) continue;
        if (!ok(x, z, 0.6)) continue;
        springs.push({ x, z, r: 2.5 + 2.5 * rand(), geyser: rand() < 0.4, period: 30 + 60 * rand(), phase: rand(), strength: 0.6 + 0.4 * rand(), hue: Math.floor(rand() * 6) });
      }
    }
    if (cache.size > 20000) cache.clear();
    cache.set(key, springs);
    return springs;
  }

  /**
   * The geothermal field (a patch 70-130 m across, thick with hot springs
   * and geysers) that (x, z) lies near, if any: { x, z, r }. About a third
   * of the 720 m squares of the volcanic country hold one.
   */
  #geothermalField(x, z) {
    const F = 720, s = this.seed ^ 0x6e07;
    const fi = Math.floor(x / F), fj = Math.floor(z / F);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = fi + di, j = fj + dj;
        if (hash2(i, j, s) > 0.35) continue;
        const f = { x: (i + 0.25 + 0.5 * hash2(i, j, s + 1)) * F, z: (j + 0.25 + 0.5 * hash2(i, j, s + 2)) * F, r: 70 + 60 * hash2(i, j, s + 3) };
        if (Math.hypot(x - f.x, z - f.z) > f.r + 130) continue;
        const w = this.getBiomeWeights(f.x, f.z, {}, this.#rangeField(f.x, f.z, {}).value);
        if (w.volcanic > 0.7) return f;
      }
    }
    return null;
  }

  /** The hot springs and geysers in or near a box. */
  hotSprings(minX, minZ, maxX, maxZ) {
    const C = 180, out = [];
    for (let j = Math.floor((minZ - 20) / C); j <= Math.floor((maxZ + 20) / C); j++) {
      for (let i = Math.floor((minX - 20) / C); i <= Math.floor((maxX + 20) / C); i++) {
        for (const sp of this.#springAt(i, j)) if (sp.x > minX - 20 && sp.x < maxX + 20 && sp.z > minZ - 20 && sp.z < maxZ + 20) out.push(sp);
      }
    }
    return out;
  }

  /** The nearest hot spring or geyser to (x, z) within 40 m, with its distance, or null. */
  #nearestSpring(x, z) {
    const C = 180;
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = null, bd = 40;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      for (const sp of this.#springAt(ci + di, cj + dj)) {
        const d = Math.hypot(x - sp.x, z - sp.z);
        if (d < bd) { bd = d; best = sp; }
      }
    }
    return best ? { spring: best, d: bd } : null;
  }

  /**
   * Whether (x, z) is on the bare crust round a hot spring or geyser (where
   * nothing grows).
   */
  onSinter(x, z) {
    const n = this.#nearestSpring(x, z);
    return !!n && n.d < (n.spring.geyser ? 12 : n.spring.r * 2.6);
  }

  /** A geyser's low mound of sinter, with its vent in the top. */
  #springRelief(x, z) {
    const n = this.#nearestSpring(x, z);
    if (!n || !n.spring.geyser || n.d > 9) return 0;
    const t = n.d / 9;
    return 1.8 * Math.pow(1 - t, 1.3) - (n.d < 0.9 ? 0.5 : 0);
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
        if (x >= minX && x < maxX && z >= minZ && z < maxZ) {
          const lake = c.lake && r < c.rc * 0.62;
          // (On a crater lake, at its water: as Rivers lays it, a third of the way up from the crater's floor.)
          out.push({ x, z, strength: 0.6 + 0.4 * hash2(k, 3, s + 4), lake, level: lake ? this.landHeight(c.x, c.z) + c.depth * 0.35 : undefined });
        }
      }
    }
    // Hot springs steam gently; geysers breathe steam between eruptions.
    for (const sp of this.hotSprings(minX, minZ, maxX, maxZ)) {
      if (sp.x >= minX && sp.x < maxX && sp.z >= minZ && sp.z < maxZ) out.push({ x: sp.x, z: sp.z, strength: sp.geyser ? 0.8 : 0.5, lake: !sp.geyser });
    }
    return out;
  }

  /**
   * How much (x, z) has a cold winter (0..1): the green lands, wetlands,
   * Black Hills and volcanic highlands do; the savanna barely; the desert not.
   */
  getSeasonality(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    const s = w.temperate + w.pine + 0.9 * w.redwood + w.wetland + w.blackHills + w.smoky + 0.85 * w.volcanic + 0.15 * w.savanna + 0.1 * w.badlands + w.parkland + w.cascades;
    // (Near a jungle its warmth reaches out past its edge: no autumn there, and no snow.)
    return s * (1 - smoothstep(0.05, 0.45, this.jungleNear(x, z)));
  }

  /**
   * How near the jungle (x, z) is (0..1): the most jungle there is within
   * about 450 m. On a 128 m grid (remembered), blended between its points.
   */
  jungleNear(x, z) {
    const G = 128, gx = Math.floor(x / G), gz = Math.floor(z / G), fx = x / G - gx, fz = z / G - gz;
    const cache = (this._jungleNear ??= new Map());
    if (cache.size > 400000) cache.clear();
    const corner = (i, j) => {
      const key = i * 65536 + j;
      let v = cache.get(key);
      if (v === undefined) {
        const cx = i * G, cz = j * G;
        v = this.getBiomeWeights(cx, cz, {}).jungle;
        for (let k = 0; k < 8 && v < 1; k++) {
          const a = (k / 8) * Math.PI * 2;
          for (const r of [220, 450]) v = Math.max(v, this.getBiomeWeights(cx + Math.cos(a) * r, cz + Math.sin(a) * r, {}).jungle * (r > 300 ? 0.7 : 1));
        }
        cache.set(key, v);
      }
      return v;
    };
    const a = corner(gx, gz), b = corner(gx + 1, gz), c = corner(gx, gz + 1), d = corner(gx + 1, gz + 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /** How much (x, z) is a cliffed stretch of the open coast (0..1). */
  getSeaCliff(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    return this.#cliffZone(x, z, w) * this.getOceanness(x, z);
  }

  /**
   * The great dunes at (x, z), as a mesh of the current coarseness
   * (`footprint`, metres between its points) should show them: averaged
   * over the ground each point stands for when that's coarse, so a far,
   * coarse mesh shows the dunes' swell rather than a spike on every crest
   * it happens to hit.
   */
  #dunesSeen(x, z) {
    const fp = this.footprint;
    if (!(fp >= 6)) return this.#greatDunes(x, z);
    const o = fp * 0.6;
    let sum = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += this.#greatDunes(x + i * o, z + j * o);
    return sum / 9;
  }

  /**
   * The dunes of a dune sea: rounded mounds of sand, one after another,
   * big and small, over a gently swelling sea of sand.
   */
  #greatDunes(x, z) {
    const s = this.seed ^ 0xd00e;
    const C = 70;
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    let h = 0;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (hash2(i, j, s) > 0.9) continue; // a gap now and then
        const px = (i + 0.2 + 0.6 * hash2(i, j, s + 1)) * C;
        const pz = (j + 0.2 + 0.6 * hash2(i, j, s + 2)) * C;
        const size = hash2(i, j, s + 3);
        const R = 32 + 22 * size;
        const d2 = ((x - px) ** 2 + (z - pz) ** 2) / (R * R);
        if (d2 >= 1) continue;
        const t = 1 - d2;
        h = Math.max(h, (4 + 9 * size) * t * t);
      }
    }
    return h + this.ergNoise.fbm(x * 0.0025 + 11, z * 0.0025 - 5, 2) * 3;
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
    const erg = (px, pz) => smoothstep(0, 0.26, this.ergNoise.fbm(px * 0.00022 + 300, pz * 0.00022 - 120, 2));
    out.erg = w.desert > 0 ? w.desert * erg(x, z) : 0;
    if (out.erg > 0) out.erg *= this.#minSize('erg', x, z, (px, pz) => erg(px, pz) * smoothstep(0.7, 0.8, this.#rawAridityAt(px, pz)), 0.8);
    out.canyon = 0;
    out.canyonZone = 0;
    out.canyonFloor = 0;
    out.canyonCut = 0;
    const flatland = 1 - smoothstep(0.02, 0.3, mask);
    // Canyons: deep winding gorges cut into the dry country (savanna,
    // desert and mesas, not the dune seas), and now and then into the
    // forests and the foothills of the ranges, with walls stepping down in
    // benches, and here and there narrowing into a slot canyon about twelve
    // metres wide. Their floors are dry washes. The walls are ragged, not
    // ruled: their line wanders a little and their faces are knobbled with
    // ledges and bulges, as steep as ever.
    const dryLand = Math.max(smoothstep(0.5, 0.62, dryness), 0.5 * w.temperate * (1 - w.wetland) * (1 - w.blackHills) * (1 - w.jungle))
      * (1 - smoothstep(0.35, 0.6, mask)) * (1 - out.erg)
      * (this._probing ? 1 : 1 - smoothstep(0, 0.02, this.#smokyLift(x, z))); // (none cut into the Smoky Mountains, nor anywhere near the land rising into them)
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
        // (Broad enough walls that they're many faces tall, never one
        // long stretched triangle, their lines broken by gullies and ribs.)
        const wall = 4 + (1 - slot) * (3 + depth * 0.3);
        if (dist < half + wall + 6) {
          // Down in five benches (the wall's rock comes away in layers,
          // some harder than others), its face knobbled and cracked, cut
          // by gullies and standing out in ribs and buttresses, like a
          // mountainside's.
          const gully = this.canyonNoise.ridged(x * 0.045 + 31, z * 0.045 - 17, 3, 2, 0.5, 0.05);
          const d2 = dist - (gully - 0.45) * 5 * (1 - slot * 0.6);
          const t = Math.max(0, (d2 - half) / wall);
          const k = t * 5, i = Math.floor(k);
          const hard = 0.45 + 0.35 * (this.canyonNoise.noise2D(i * 7.3 + 1, x * 0.004 + z * 0.004) * 0.5 + 0.5);
          const stepped = t >= 1 ? 1 : (i + smoothstep(hard, 1, k - i)) / 5;
          const face = t > 0 && t < 1 ? 4 * t * (1 - t) : 0;
          // (Broad ledges and bulges rather than a fine prickly texture.)
          const knobs = face > 0 ? (this.canyonNoise.noise2D(x * 0.18 + 5, z * 0.18 - 5) * 2.2 + this.canyonNoise.ridged(x * 0.09 - 3, z * 0.09 + 9, 2, 2, 0.5, 0.05) * 2.0) * 1.3 * face : 0;
          out.canyonCut = Math.max(0, depth * (1 - stepped) - knobs * zone);
          out.canyonFloor = d2 < half ? zone : 0;
        }
        out.canyon = zone * (1 - smoothstep(half + wall + 3, half + wall + 8, dist));
      }
    }
    if (flatland <= 0) return out;
    const mesaLand = (px, pz, dry) => smoothstep(T.mesa, T.mesa + 0.26, this.mesaNoise.fbm(px * 0.00025 + 40, pz * 0.00025 - 40, 2)) * smoothstep(0.42, 0.6, dry);
    let mesa = mesaLand(x, z, dryness) * flatland * (1 - out.erg);
    if (mesa > 0) mesa *= this.#minSize('mesa', x, z, (px, pz) => mesaLand(px, pz, this.#rawAridityAt(px, pz)), 0.8);
    // (Never within a few hundred metres of a mountain range.)
    if (mesa > 0) mesa *= 1 - smoothstep(0.3, 0.45, this.#mountainsAround(x, z));
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
    const green = w.temperate + w.pine + w.redwood + w.smoky + 0.5 * w.savanna;
    const hilly = smoothstep(-0.41, 0.19, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
    const wooded = smoothstep(-0.2, 0.25, this.forestNoise.fbm(x * 0.0045, z * 0.0045, 3));
    const escarp = smoothstep(0.32 - 0.22 * Math.max(hilly, wooded), 0.5 - 0.2 * Math.max(hilly, wooded), this.escarpNoise.fbm(x * 0.0003, z * 0.0003, 2)) * flatland * green
      * (this._probing ? 1 : 1 - smoothstep(0, 0.3, this.#smokyLift(x, z))); // (no cliff steps in the Smoky Mountains)
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
    const r = range + MOUNTAIN_BIAS - this.#drySuppress(x, z);
    return { ...this.#features(x, z, this.#rawAridity(x, z), smoothstep(0.08, 0.55, r), w) };
  }

  /** How much (x, z) is open sea rather than an inland lake (0..1). */
  getOceanness(x, z) {
    const raw = this.#seaBasin(x, z, this.#rangeField(x, z), this.#rawAridity(x, z));
    return raw > 0 ? raw * this.#openSea(x, z) : 0;
  }

  /** How much (x, z) lies where the continent dips under the sea (0..1), whether it's a great sea or not. */
  #seaBasin(x, z, field, dryness) {
    const mask = smoothstep(0.08, 0.55, field.value + MOUNTAIN_BIAS - this.#drySuppress(x, z));
    const continent = this.#continentBase(x, z) + 0.34 * smoothstep(0.62, 0.8, dryness) + 0.1 * smoothstep(0.3, 0.5, dryness) + 0.5 * mask;
    return smoothstep(-0.02, -0.25, continent);
  }

  /**
   * Whether the water round (x, z) is the open sea (1) or only a lake,
   * however big (0): the open sea is where a good share of the land for
   * three kilometres round has dipped under it. Measured on a 256 m grid
   * (remembered) and blended between its points.
   */
  #openSea(x, z) {
    const G = 256;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this._openSea ?? (this._openSea = new Map());
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        const cx = i * G, cz = j * G;
        const wet = (px, pz) => (this.#seaBasin(px, pz, this.#rangeField(px, pz, {}), this.#rawAridityAt(px, pz)) > 0.5 ? 1 : 0);
        let n = wet(cx, cz), t = 1;
        for (const [d, k] of [[900, 8], [1800, 12], [3000, 16]]) {
          for (let q = 0; q < k; q++) {
            const a = ((q + 0.5) / k) * Math.PI * 2;
            n += wet(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
            t++;
          }
        }
        v = smoothstep(0.3, 0.45, n / t);
        if (cache.size > 20000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
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
    if (!this.#waterNear(x, z)) return null; // (low ground away from any water is just land)
    if (this.getBiomeWeights(x, z, {}).desert > 0.5) return null;
    const ocean = this.getOceanness(x, z) > 0.5;
    const fade = 1 - smoothstep(sea + 3.5, sea + 5.5, height);
    const p = this.detailNoise.noise2D(x * 0.05, z * 0.05);
    if (ocean) {
      const w = this.getBiomeWeights(x, z, {});
      if (w.mangrove > 0.5) return height < sea + 1.2 ? { kind: 'mud', fade, ocean } : null; // (soft, muddy shores)
      return p > 0.55 && height > sea - 0.5 ? { kind: 'rock', fade: fade * 0.6, ocean } : null;
    }
    // (A lake's or river's banks: each biome's own, see BANKS.)
    const w = this.getBiomeWeights(x, z, {});
    if (height < sea + 0.7) return { kind: 'mud', fade, ocean, color: this.#bankColor(w, 'mud', new Color()) };
    let rock = 0;
    for (const id in BANKS) rock += (w[id] ?? 0) * BANKS[id].rock;
    if (rock > 0 && p > 1 - 1.6 * rock) return { kind: 'rock', fade, ocean, color: this.#bankColor(w, 'rockColor', new Color()) };
    return { kind: 'grass', fade: fade * 0.55, ocean, color: this.#bankColor(w, 'bank', new Color()) };
  }

  /** A part ('mud', 'bank' or 'rockColor') of the banks (BANKS), blended by the biome weights `w`. */
  #bankColor(w, part, out) {
    out.setRGB(0, 0, 0);
    let sum = 0;
    for (const id in BANKS) {
      const k = w[id] ?? 0;
      if (k <= 0) continue;
      const c = BANKS[id][part];
      out.r += c.r * k;
      out.g += c.g * k;
      out.b += c.b * k;
      sum += k;
    }
    return sum > 0 ? out.multiplyScalar(1 / sum) : out.copy(SHORE.grass);
  }

  /**
   * The volcanic highlands' rocky ground (0..1): broad stretches of bare,
   * broken basalt among the native grass.
   */
  getVolcanicRocky(x, z) {
    return smoothstep(0.18, 0.34, this.detailNoise.fbm(x * 0.0035 - 400, z * 0.0035 + 260, 3));
  }

  /**
   * Whether open water (a lake or the sea) lies within about 24 m of
   * (x, z): the land before rivers, on a 12 m grid (remembered).
   */
  #waterNear(x, z) {
    const G = 12;
    const sea = this.rivers.seaLevel;
    const cache = this._wet ?? (this._wet = new Map());
    const gx = Math.round(x / G), gz = Math.round(z / G);
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const key = (gx + di + 32768) * 65536 + (gz + dj + 32768);
        let wet = cache.get(key);
        if (wet === undefined) {
          wet = this.getBaseHeight((gx + di) * G, (gz + dj) * G) < sea - 0.2;
          if (cache.size > 200000) cache.clear();
          cache.set(key, wet);
        }
        if (wet) return true;
      }
    }
    return false;
  }

  /**
   * How much the land here is given to steep rock faces (mountains, mesas,
   * escarpments, Black Hills, the Cascades): 0..1. Where boulders gather at the foot of cliffs.
   */
  getCliffiness(x, z) {
    const f = this.getFeatures(x, z), w = this.getBiomeWeights(x, z, {});
    return Math.max(this.getMountainness(x, z), f.mesa, f.escarp, w.blackHills, 0.8 * w.cascades);
  }

  /**
   * Black Hills country (0..1): rare patches of the rolling hills, away
   * from mountain ranges and the dry country.
   */
  /**
   * How much the land is lifted into the Smoky Mountains at (x, z), 0..1:
   * where the biome is, spread out and softened over the best part of a
   * kilometre (a blur over a 160 m grid of it, remembered), so the land
   * rises into them gently rather than up a wall at the biome's edge.
   */
  #smokyLift(x, z) {
    // (Often asked for the same point twice running: the last answer is remembered.)
    if (x === this._liftX && z === this._liftZ) return this._lift;
    const v = this.#smokyLiftAt(x, z);
    this._liftX = x;
    this._liftZ = z;
    this._lift = v;
    return v;
  }

  #smokyLiftAt(x, z) {
    // (Nothing at all unless a blob of them lies near: the spread reaches
    // at most some 640 m past where the biome is, and it's only in their blobs.)
    if (!this.#smokyBlobNear(x, z, 700)) return 0;
    const G = 160, R = 3;
    const cache = this._smokyLift ?? (this._smokyLift = { raw: new Map(), blur: new Map() });
    const probe = this.#probe();
    const raw = (i, j) => {
      const k = cellKey(i, j);
      let v = cache.raw.get(k);
      if (v === undefined) {
        v = probe.#smokyWeight(i * G, j * G);
        if (cache.raw.size > 60000) cache.raw.clear();
        cache.raw.set(k, v);
      }
      return v;
    };
    const blur = (i, j) => {
      const k = cellKey(i, j);
      let v = cache.blur.get(k);
      if (v === undefined) {
        let sum = 0, weight = 0;
        for (let b = -R; b <= R; b++) {
          for (let a = -R; a <= R; a++) {
            const w = 1 - Math.hypot(a, b) / (R + 1);
            if (w <= 0) continue;
            sum += raw(i + a, j + b) * w;
            weight += w;
          }
        }
        v = sum / weight;
        if (cache.blur.size > 20000) cache.blur.clear();
        cache.blur.set(k, v);
      }
      return v;
    };
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const a = blur(gx, gz) + (blur(gx + 1, gz) - blur(gx, gz)) * fx;
    const b = blur(gx, gz + 1) + (blur(gx + 1, gz + 1) - blur(gx, gz + 1)) * fx;
    return smoothstep(0.03, 0.8, a + (b - a) * fz);
  }

  #smokyZone(x, z, range) {
    const blob = this.#smokyBlob(x, z);
    if (blob <= 0) return 0;
    // (Never up against a range's snowy peaks: a band of lower country,
    // several hundred metres at least, between them.)
    const clear = 1 - smoothstep(0.35, 0.55, this.#mountainsAround(x, z));
    return clear > 0 ? blob * clear * this.#broadFit(x, z, range, 0.12) * this.#greenBuffer(x, z, 0.12) : 0;
  }

  /** The Black Hills out in the savanna (0..1): rounded stretches a few kilometres across, now and then. */
  #dryHills(x, z, range) {
    return this.#blobs('hillsDry', x, z, 7500, 1, 1900, 3200, 0xd4b1, (px, pz) => {
      const r = this.#rangeField(px, pz, {}).value, a = this.getAridity(px, pz, r);
      // (The open savanna, well short of the desert, clear of the ranges and of volcanic country.)
      return a > T.savannaStart + 0.12 && a < T.desertStart - 0.02 && r < 0.12 && this.#volcanoNoise(px, pz) < 0.26 ? 1 : 0;
    }) * (1 - smoothstep(0.15, 0.4, range));
  }

  /** Where the Black Hills' blobs lie (0..1), before they're fitted to the land. */
  #hillsBlob(x, z) {
    return this.#blobs('hills', x, z, 8000, 1, 1500, 2600, 0xb1ac, (px, pz) => this.#greenFit(px, pz));
  }

  /**
   * The Smoky Mountains' rivers, laid down before their hills: every blob
   * of them has one, running from its middle out through its edge towards
   * the lower, greener country beyond. The hills are shaped round it (a
   * broad valley: see landHeight), and a great river rises at its head and
   * follows it out (see BigRivers). Returns the trunks (their points,
   * 48 m apart) of the blobs centred in the box.
   */
  smokyTrunks(minX, minZ, maxX, maxZ) {
    const C = 4000, out = [];
    for (let cj = Math.floor(minZ / C); cj <= Math.floor(maxZ / C); cj++) {
      for (let ci = Math.floor(minX / C); ci <= Math.floor(maxX / C); ci++) {
        const b = this.#smokyBlobCell(ci, cj);
        if (b && b.x >= minX && b.x < maxX && b.z >= minZ && b.z < maxZ) out.push(this.#trunk(b));
      }
    }
    return out;
  }

  /** The Smoky Mountains' share of getBiomeWeights at (x, z), worked out alone (quicker). */
  #smokyWeight(x, z) {
    const range = this.#rangeField(x, z, {}).value;
    const a = this.getAridity(x, z, range);
    const temperate = 1 - smoothstep(0.375, 0.575, a);
    if (temperate <= 0) return 0;
    const hz = this.#hillsZone(x, z, range);
    const vz = Math.max(this.#volcanoZone(x, z, range), this.#coneReach(x, z));
    const open = temperate * (1 - hz) * (1 - vz);
    if (open <= 0) return 0;
    const smoky = open * this.#smokyZone(x, z, range);
    if (smoky <= 0) return 0;
    const m = this.#mangrove(x, z, a, range);
    return smoky * (1 - (m > 0 ? m * smoothstep(0.35, 0.7, this.#mangroveSpread(x, z)) : 0));
  }

  /** Whether a Smoky Mountains blob's outline comes within `margin` metres of (x, z). */
  #smokyBlobNear(x, z, margin) {
    const C = 4000, ci = Math.floor(x / C), cj = Math.floor(z / C);
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const b = this.#smokyBlobCell(ci + di, cj + dj);
        if (b && Math.hypot(x - b.x, z - b.z) < b.r * 1.3 + margin) return true;
      }
    }
    return false;
  }

  /** How much (x, z) lies in a Smoky Mountains blob (0..1: quick, their outline only). */
  smokyBlobAt(x, z) {
    return this.#smokyBlob(x, z);
  }

  /** The Smoky Mountains blob of cell (ci, cj) of their 4 km grid, or null. */
  #smokyBlobCell(ci, cj) {
    const C = 4000, k = cellKey(ci, cj);
    let b = this._blobs?.smoky?.get(k);
    if (b === undefined) {
      this.#smokyBlob((ci + 0.5) * C, (cj + 0.5) * C);
      b = this._blobs.smoky.get(k) ?? null;
    }
    return b;
  }

  /** A Smoky Mountains blob's river trunk (remembered on it). */
  #trunk(b) {
    if (b.trunk) return b.trunk;
    // (Out towards the lowest, greenest land beyond the blob.)
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + b.s;
      const px = b.x + Math.cos(a) * b.r * 1.6, pz = b.z + Math.sin(a) * b.r * 1.6;
      const score = this.broadHeight(px, pz) + 200 * smoothstep(0.5, 0.7, this.getAridity(px, pz, this.#rangeField(px, pz, {}).value));
      if (score < bestScore) (bestScore = score), (best = a);
    }
    const pts = [];
    let a = best, x = b.x, z = b.z;
    const n = Math.ceil((b.r * 1.2) / 48);
    for (let k = 0; k <= n; k++) {
      pts.push({ x, z });
      // (Winding, never straying far from its heading.)
      a += (best - a) * 0.08 + this.smokyNoise.noise2D(x * 0.0016 + b.s, z * 0.0016 - b.s) * 0.12;
      x += Math.cos(a) * 48;
      z += Math.sin(a) * 48;
    }
    b.trunk = pts;
    return pts;
  }

  /** Metres from (x, z) to the nearest Smoky Mountains river trunk (Infinity if none near). */
  #trunkDistance(x, z) {
    const C = 4000, ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = Infinity;
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const b = this.#smokyBlobCell(ci + di, cj + dj);
        if (!b || Math.hypot(x - b.x, z - b.z) > b.r * 1.3 + 900) continue;
        const P = this.#trunk(b);
        // (Every third point is near enough for a valley 1.5 km across.)
        for (let k = 3; k < P.length; k += 3) {
          const p = P[k - 3], q = P[k];
          const dx = q.x - p.x, dz = q.z - p.z, l2 = dx * dx + dz * dz;
          const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / l2));
          best = Math.min(best, Math.hypot(p.x + dx * t - x, p.z + dz * t - z));
        }
      }
    }
    return best;
  }

  /** Where the Smoky Mountains' blobs lie (0..1), before they're fitted to the land. */
  #smokyBlob(x, z) {
    return this.#blobs('smoky', x, z, 4000, 1, 3300, 5300, 0x5a0c, (px, pz) => this.#greenFit(px, pz, 0.08, 0.12));
  }

  #smokyZoneRaw(x, z, range, noise = true) {
    // Stretches of country several kilometres across, fading in over the
    // best part of a kilometre (no hard edge), clear of the Black Hills,
    // the volcanic country and the high ranges, and well inside the green
    // lands.
    const zone = (noise ? smoothstep(0.1, 0.3, this.smokyNoise.fbm(x * 0.00008 + 130, z * 0.00008 - 420, 2)) : 1)
      * (1 - smoothstep(0.26, 0.36, this.#volcanoNoise(x, z)));
    if (zone <= 0) return 0;
    const dryNear = 1 - smoothstep(0.4, 0.5, this.#aridAround(x, z));
    return zone * dryNear * (1 - smoothstep(0.05, 0.3, range)) * (1 - smoothstep(0.42, 0.56, this.#rawAridity(x, z)));
  }

  /**
   * How well a blob of hill country (the Black Hills, the Smoky Mountains)
   * fits at (x, z) once it's there: everywhere but deep in a mountain
   * range or volcanic country (its outline stays round, not cut to fit).
   */
  /** Whether (x, z) is green country clear of the ranges and volcanic country: somewhere a blob of hill country can be centred. */
  #greenFit(x, z, looser = 0, nearRanges = 0) {
    const range = this.#rangeField(x, z, {}).value;
    // (On dry land, well in from any sea.)
    if (this.#continentBase(x, z) < 0.02) return 0;
    return (1 - smoothstep(0.34 + looser, 0.44 + looser, this.getAridity(x, z, range))) * (1 - smoothstep(0.0 + nearRanges, 0.15 + nearRanges, range)) * (1 - smoothstep(0.26, 0.36, this.#volcanoNoise(x, z)));
  }

  /**
   * Green country for the best part of a kilometre round (0..1): the
   * Smoky Mountains and the Black Hills end in a band of plains and forest,
   * never right up against the savanna.
   */
  #greenBuffer(x, z, looser = 0) {
    return 1 - smoothstep(0.3 + looser, 0.37 + looser, this.#aridRange(x, z, 0));
  }

  #broadFit(x, z, range, looser = 0) {
    return (1 - smoothstep(0.15 + looser, 0.4 + looser, range)) * (1 - smoothstep(0.3, 0.4, this.#volcanoNoise(x, z)));
  }

  #hillsZone(x, z, range) {
    const blob = this.#hillsBlob(x, z);
    return blob > 0 ? blob * this.#broadFit(x, z, range) * this.#greenBuffer(x, z) : 0;
  }

  #hillsZoneRaw(x, z, range, noise = true) {
    // (Never near volcanic country: the volcano noise must be well below
    // where its highlands begin.)
    const zone = (noise ? smoothstep(0.07, 0.23, this.hillsNoise.fbm(x * 0.0001 - 250, z * 0.0001 + 610, 2)) : 1) * (1 - smoothstep(0.26, 0.36, this.#volcanoNoise(x, z)));
    if (zone <= 0) return 0;
    // (Whole stretches of country, a few kilometres across, not scraps.)
    // (And fading out gradually, well before the savanna: the country
    // within the best part of a kilometre must be green.)
    const dryNear = 1 - smoothstep(0.43, 0.52, this.#aridAround(x, z));
    return zone * dryNear * (1 - smoothstep(0.02, 0.2, range)) * (1 - smoothstep(0.45, 0.6, this.#rawAridity(x, z)));
  }

  /**
   * How far a Black Hills rock formation (needle, spires, fin, castle or
   * bald dome) rises out of the land at (x, z), in metres: bare rock where
   * nothing grows.
   */
  getFormation(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    if (w.blackHills < 0.2) return 0;
    const domes = Math.pow(smoothstep(-0.2, 0.7, this.hillsNoise.fbm(x * 0.0021, z * 0.0021, 3)), 1.4);
    return this.#needles(x, z, domes) * smoothstep(0.35, 0.8, w.blackHills);
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
        // Rock faces worn like a mountain's: ribs and gullies, not smooth sides.
        const rib = (px, pz) => 0.72 + 0.4 * this.hillsNoise.ridged(px * 0.11 + i * 5.3, pz * 0.11 - j * 4.1, 3, 2, 0.5, 0.05);
        if (kind < 0.18) {
          // A lone needle: stout, a broad foot tapering to a worn point
          // (never a thin spike standing alone).
          const r = 11 + 6 * hash2(i, j, s + 3);
          const H = Math.min(16 + 14 * size, r * 1.7);
          const lean = 0.25 * hash2(i, j, s + 11), la = hash2(i, j, s + 12) * Math.PI * 2;
          const t0 = (Math.hypot(dx, dz) / r) * ragged;
          if (t0 < 1.4) {
            const up = H * Math.max(0, 1 - t0);
            const t = (Math.hypot(dx - Math.cos(la) * lean * up, dz - Math.sin(la) * lean * up) / r) * ragged;
            if (t < 1) h = H * Math.pow(1 - t, 1.2) * rib(x, z);
          }
        } else if (kind < 0.55) {
          // A cluster of spires (like the Cathedral Spires): a crowd of
          // pointed pinnacles, the middle ones tallest, leaning this way
          // and that.
          const count = 4 + Math.floor(hash2(i, j, s + 6) * 5);
          for (let k = 0; k < count; k++) {
            const a = hash2(i + k * 13, j, s + 7) * Math.PI * 2, out = k === 0 ? 0 : 5 + 12 * hash2(i, j + k * 13, s + 8);
            const r = 6 + 3.5 * hash2(i - k, j + k, s + 9);
            const H = Math.min((12 + 16 * hash2(i + k, j - k, s + 10)) * (1 - 0.35 * out / 17), r * 2.4);
            const lean = 0.35 * hash2(i + k, j + k, s + 13), la = hash2(i - k, j - k, s + 14) * Math.PI * 2;
            const cxk = dx - Math.cos(a) * out, czk = dz - Math.sin(a) * out;
            const t0 = (Math.hypot(cxk, czk) / r) * ragged;
            if (t0 >= 1.5) continue;
            const up = H * Math.max(0, 1 - t0);
            const t = (Math.hypot(cxk - Math.cos(la) * lean * up, czk - Math.sin(la) * lean * up) / r) * ragged;
            if (t < 1) h = Math.max(h, H * Math.pow(1 - t, 1.15) * rib(x + k * 7, z - k * 5));
          }
          // A rubbly, rocky base binding them together.
          const base = 1 - smoothstep(10, 24, Math.hypot(dx, dz) * ragged);
          if (base > 0) h = Math.max(h, base * (4 + 3 * rib(x, z)));
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
        if (h > 0) h += (this.hillsNoise.noise2D(x * 0.3 + 17, z * 0.3 - 17) * 1.6 + this.hillsNoise.noise2D(x * 0.8 - 3, z * 0.8 + 8) * 0.6) * Math.min(1, h / 6);
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
    // (And the last point worked out, whatever it was asked for into.)
    const last = this._rangeLast ?? (this._rangeLast = { x: NaN, z: NaN, value: 0, size: 1, large: 0 });
    if (x === last.x && z === last.z) {
      out.x = x;
      out.z = z;
      out.value = last.value;
      out.size = last.size;
      out.large = last.large;
      return out;
    }
    const t = Math.min(1, Math.max(0, 0.5 + this.rangeSizeNoise.fbm(x * 0.00007, z * 0.00007, 2) * 1.3));
    const small = 1 - smoothstep(0, 0.45, t);
    const large = smoothstep(0.55, 1, t);
    const usual = 1 - small - large;
    const f = 0.00013;
    let value = 0;
    if (small > 0) value += small * this.mountainMaskNoise.fbm(x * f * 2 + 311, z * f * 2 - 173, 2);
    if (usual > 0) value += usual * this.mountainMaskNoise.fbm(x * f, z * f, 2);
    if (large > 0) value += large * this.mountainMaskNoise.fbm(x * f * 0.5 - 517, z * f * 0.5 + 229, 2);
    // Now and then a horseshoe of mountains: a range curving most of the way round in a ring a few
    // kilometres across, open on one side, a broad valley in the middle (see #horseshoe).
    const hs = this.#horseshoe(x, z);
    if (hs > value) value += (hs - value) * smoothstep(0, 0.25, hs);
    // No mountain ranges in the green belt round volcanic country (fading
    // out gently, over a kilometre or two, from the broad, smooth lie of
    // it: never a range cut off in a wall at its edge).
    const belt = smoothstep(0.26, 0.54, this.volcanoNoise.fbm(x * 0.00005 + 900, z * 0.00005 - 300, 2));
    if (belt > 0) value = value * (1 - belt) - 0.3 * belt;
    out.x = x;
    out.z = z;
    out.value = value;
    out.size = 0.5 * small + usual + 2 * large;
    out.large = large;
    last.x = x;
    last.z = z;
    last.value = value;
    last.size = out.size;
    last.large = large;
    return out;
  }

  /**
   * The horseshoe ranges' share of the range field at (x, z): one in three
   * 16 km cells of dry land has one, a ring 5 to 10 km across of mountains
   * a kilometre or two wide, curving round two-thirds or more of the way
   * and open on one side, its line wavering. (Remembered cell by cell.)
   */
  #horseshoe(x, z) {
    const C = 16000, ci = Math.floor(x / C), ck = Math.floor(z / C);
    // (The horseshoes that could reach this cell, kept for the cell last asked about: asked a great deal.)
    if (ci !== this._hsCi || ck !== this._hsCk) {
      this._hsCi = ci;
      this._hsCk = ck;
      this._hsNear = this.#horseshoesNear(ci, ck);
    }
    let best = 0;
    for (const h of this._hsNear) {
      if (Math.abs(x - h.x) > h.reach || Math.abs(z - h.z) > h.reach) continue;
      const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
      if (d > h.reach) continue;
      const a = Math.atan2(dz, dx);
      const R = h.R * (1 + 0.1 * Math.sin(a * 3 + h.s) + 0.05 * Math.sin(a * 7 + h.s * 2));
      const across = Math.abs(d - R) / h.w;
      if (across > 2) continue;
      // (Fading out round the open side.)
      const off = Math.abs(Math.atan2(Math.sin(a - h.gap), Math.cos(a - h.gap)));
      const arm = smoothstep(h.open - 0.25, h.open + 0.25, off);
      best = Math.max(best, 0.6 * arm * Math.max(0, 1 - across * across * 0.5) * (0.85 + 0.15 * Math.sin(a * 11 + h.s)));
    }
    return best;
  }

  // The horseshoes of the cells round cell (ci, ck): those that are there.
  #horseshoesNear(ci, ck) {
    const C = 16000, cache = (this._horseshoes ??= new Map()), out = [];
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, k = ck + dk, key = (i + 32768) * 65536 + (k + 32768);
      let h = cache.get(key);
      if (h === undefined) {
        h = null;
        const r = (t) => hash2(i * 3 + t, k * 5 - t, this.seed ^ 0x45e5);
        if (r(0) < 0.33) {
          const cx = (i + 0.3 + 0.4 * r(1)) * C, cz = (k + 0.3 + 0.4 * r(2)) * C;
          // (On the continent, not out in an ocean basin.)
          const basin = smoothstep(0.15, 0.35, this.continentNoise.fbm(cx * 0.00005 + 500, cz * 0.00005 - 700, 2));
          const cont = this.continentNoise.fbm(cx * 0.0004, cz * 0.0004, 3) + 0.015 + 0.45 * (1 - basin) - 0.8 * basin;
          if (basin < 0.3 && cont > 0.05) {
            const R = 2600 + 2400 * r(3), w = 700 + 500 * r(4);
            h = { x: cx, z: cz, R, w, reach: R * 1.4 + w * 2, gap: r(5) * Math.PI * 2, open: 0.8 + 0.5 * r(6), s: r(7) * 10 };
          }
        }
        if (cache.size > 2000) cache.clear();
        cache.set(key, h);
      }
      if (h) out.push(h);
    }
    return out;
  }

  /** How mountainous an area is: 0 = lowland, 1 = in a range. Foothills lie in between. */
  getMountainness(x, z) {
    return smoothstep(0.08, 0.55, this.#rangeField(x, z).value + MOUNTAIN_BIAS - this.#drySuppress(x, z));
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
    // (Thicker woods over the hill country, more open over the flatter
    // country: the plains.)
    const hilly = smoothstep(-0.41, 0.19, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2));
    const n = this.forestNoise.fbm(x * 0.0045, z * 0.0045, 3) + T.forest + 0.22 * (hilly - 0.5);
    // (The land rising towards a range opens out into grassy foothill
    // country; the range's own slopes are wooded again.)
    const m = this.getMountainness(x, z);
    // (Only part way: wooded still, with clearings, so it never reads as a bare patch next to the pine forests.)
    const open = m > 0.08 && m < 0.5 ? 0.5 * smoothstep(0.08, 0.3, m) * (1 - smoothstep(0.4, 0.5, m)) : 0;
    return (0.05 + 0.95 * smoothstep(-0.3, 0.15, n)) * (1 - open);
  }

  /**
   * Coral reef at (x, z), where the sea bed is `ground` metres high
   * (0..1): patches in the warm, clear shallows off the desert and savanna
   * coasts of the open sea.
   */
  getReef(x, z, ground) {
    const sea = this.rivers.seaLevel;
    if (ground > sea - 0.6 || ground < sea - 12) return 0;
    // (All round an atoll, and in its lagoon, reef.)
    const zone = Math.max(this.#reefZone(x, z, this.getBiomeWeights(x, z, {})), this.atollAt(x, z));
    if (zone <= 0) return 0;
    const patch = smoothstep(-0.45, -0.05, this.coastNoise.fbm(x * 0.012 + 40, z * 0.012 - 40, 2));
    if (patch <= 0) return 0;
    const ocean = smoothstep(0.3, 0.6, this.getOceanness(x, z));
    // (The coral grows on the reef itself, its tops and walls, hardly at all on the sand floor round it.)
    return zone * patch * ocean * (0.15 + 0.85 * smoothstep(0.15, 0.5, this.#reefRaise(x, z))) * smoothstep(sea - 0.6, sea - 1.2, ground);
  }

  /**
   * Kelp forest (0..1) at (x, z) with the sea floor at `ground`: great
   * beds of it in the cool, open sea off the green lands, rooted three to
   * sixteen metres down (not where coral reefs grow).
   */
  getKelp(x, z, ground) {
    const sea = this.rivers.seaLevel;
    if (ground > sea - 2.5 || ground < sea - 16) return 0;
    const beds = smoothstep(0.0, 0.25, this.coastNoise.fbm(x * 0.004 - 70, z * 0.004 + 35, 2));
    if (beds <= 0) return 0;
    const w = this.getBiomeWeights(x, z, {});
    const cool = smoothstep(0.45, 0.7, w.temperate + w.pine + w.redwood + w.wetland + w.blackHills + w.smoky + w.volcanic + w.parkland + w.cascades);
    if (cool <= 0) return 0;
    const ocean = smoothstep(0.4, 0.7, this.getOceanness(x, z));
    const depth = smoothstep(sea - 2.5, sea - 4, ground) * (1 - smoothstep(sea - 13, sea - 16, ground));
    return beds * cool * ocean * depth * (1 - this.#reefZone(x, z, w));
  }

  /**
   * How far the reef at (x, z) stands up off the sand (0 the floor, 1 the
   * reef's top): broad tables of reef cut through by narrow canyons, and
   * out on the sand the lone coral heads.
   */
  #reefRaise(x, z) {
    const N = this.coastNoise;
    const tables = smoothstep(0.0, 0.25, N.noise2D(x * 0.007 - 21, z * 0.007 + 44));
    const canyon = 1 - smoothstep(0.04, 0.3, Math.abs(N.noise2D(x * 0.017 + 7, z * 0.017 - 3)));
    const b = N.noise2D(x * 0.045 + 13, z * 0.045 - 9) * 0.8 + N.noise2D(x * 0.1 - 5, z * 0.1 + 2) * 0.2;
    const heads = smoothstep(0.2, 0.55, b) * (1 - 0.5 * tables);
    return Math.max(tables * (1 - canyon), heads);
  }

  /** How much (x, z) of the open sea floor is rocky ground (0 sand .. 1), its ridges and knolls rising out of the sand (see landHeight). */
  getSeaRock(x, z) {
    return smoothstep(-0.3, 0.1, this.coastNoise.fbm(x * 0.006 + 311, z * 0.006 - 97, 2));
  }

  /** Stretches of the open coast with coral reefs off them (0..1). */
  #reefZone(x, z, w) {
    return smoothstep(0.08, 0.3, this.coastNoise.fbm(x * 0.0035 + 140, z * 0.0035 - 60, 2)) * (1 - w.wetland) * (1 - w.volcanic);
  }

  /**
   * How much (x, z) is open plains (0..1): the green lowlands away from
   * the woods, the rolling hills and the mountains. No trees grow there,
   * and the grass is long.
   */
  getPlainness(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    if (w.temperate < 0.05) return 0;
    const open = 1 - smoothstep(0.45, 0.55, this.getForestDensity(x, z));
    if (open <= 0) return 0;
    const flat = 1 - smoothstep(0.52, 0.62, smoothstep(-0.41, 0.19, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2)));
    if (flat <= 0) return 0;
    return w.temperate * open * flat * (1 - smoothstep(0.12, 0.2, this.getMountainness(x, z)));
  }

  /**
   * Where birches (and, in the Black Hills, aspens) take over the woods
   * (0..1): stands a kilometre or two across.
   */
  /**
   * Wildflower meadows (0..1): patches of the open plains and the grassy
   * foothills below the mountains where flowers crowd the grass.
   */
  getMeadow(x, z) {
    const patch = smoothstep(0.1, 0.35, this.meadowNoise.fbm(x * 0.0022 + 11, z * 0.0022 - 19, 2));
    if (patch <= 0) return 0;
    const plain = this.getPlainness(x, z);
    const m = this.getMountainness(x, z);
    const foothill = smoothstep(0.28, 0.42, m) * (1 - smoothstep(0.6, 0.72, m));
    const open = foothill > 0 ? (1 - smoothstep(0.45, 0.6, this.getForestDensity(x, z))) * this.getBiomeWeights(x, z, {}).temperate : 0;
    return patch * Math.max(plain, foothill * open);
  }

  // A smooth field (0..1) worked out by `fn(px, pz)` on a G m grid
  // (remembered, under `name`) and blended between its points.
  #gridField(name, x, z, G, fn) {
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const fx = x / G - gx, fz = z / G - gz;
    const cache = this[name] ?? (this[name] = new Map());
    const at = (i, j) => {
      const key = cellKey(i, j);
      let v = cache.get(key);
      if (v === undefined) {
        v = fn(i * G, j * G);
        if (cache.size > 40000) cache.clear();
        cache.set(key, v);
      }
      return v;
    };
    const a0 = at(gx, gz), a = a0 + (at(gx + 1, gz) - a0) * fx;
    const b0 = at(gx, gz + 1), b = b0 + (at(gx + 1, gz + 1) - b0) * fx;
    return a + (b - a) * fz;
  }

  /**
   * A petrified forest (0..1): now and then in the dry country (the
   * savanna, the badlands, the desert's edge), the stone trunks of a
   * forest long gone, standing and fallen, over ground banded grey,
   * lavender and rust (see PetrifiedLayer).
   */
  petrifiedAt(x, z) {
    const zone = smoothstep(0.58, 0.66, this.mesaNoise.fbm(x * 0.0008 + 300, z * 0.0008 - 120, 2)); // (rare: a few patches in all the dry country)
    if (zone <= 0) return 0;
    const w = this.getBiomeWeights(x, z, {});
    // (Out on the open, even ground of the savanna and the desert: never the badlands, nor where the land
    // steps up and down sharply, the mesas, the escarpments, the canyons.)
    const open = zone * smoothstep(0.45, 0.8, w.savanna + 0.6 * w.desert) * (1 - smoothstep(0.05, 0.25, w.badlands)) * (1 - w.saltFlat) * (1 - w.mangrove);
    if (open <= 0) return 0;
    const f = this.getFeatures(x, z);
    return open * (1 - smoothstep(0.1, 0.25, f.mesa)) * (1 - smoothstep(0.2, 0.4, f.escarp)) * (1 - smoothstep(0.2, 0.4, f.canyon));
  }

  /**
   * A giant flower meadow (0..1): wildflowers taller than you, humming with
   * bees and butterflies. Uncommon, and only out in the green lowlands,
   * plains and woods all round it for half a kilometre (see FlowerLayer).
   */
  giantMeadowAt(x, z) {
    const zone = smoothstep(0.4, 0.52, this.meadowNoise.fbm(x * 0.0006 - 40, z * 0.0006 + 90, 2));
    if (zone <= 0) return 0;
    const sea = this.rivers.seaLevel;
    const around = this.#gridField('_giantMeadow', x, z, 96, (px, pz) => {
      const ok = (qx, qz) => {
        const w = this.getBiomeWeights(qx, qz, {});
        return w.temperate + w.parkland > 0.85 && this.getMountainness(qx, qz) < 0.25 && this.getBaseHeight(qx, qz) > sea + 3 ? 1 : 0;
      };
      if (!ok(px, pz)) return 0;
      let n = 2;
      for (let k = 0; k < 8; k++) n += ok(px + Math.cos((k / 8) * Math.PI * 2) * 500, pz + Math.sin((k / 8) * Math.PI * 2) * 500);
      return smoothstep(7.5, 9.5, n);
    });
    return zone * around;
  }

  /**
   * Whether (x, z) is in a giant flower meadow as the map has it (the map's
   * own reading of the country there, on a 16 m grid, remembered): where
   * the giant flowers grow, and nowhere else (see WonderLayer, GroundItems).
   */
  inGiantMeadow(x, z) {
    if (this.giantMeadowAt(x, z) < 0.4) return false; // (quick: nowhere near one)
    const G = 16, i = Math.floor(x / G), k = Math.floor(z / G), key = i * 1000003 + k;
    const cache = (this._inMeadow ??= new Map());
    let v = cache.get(key);
    if (v === undefined) {
      if (cache.size > 50000) cache.clear();
      v = this.describe((i + 0.5) * G, (k + 0.5) * G, true) === 'Giant flower meadow';
      cache.set(key, v);
    }
    return v;
  }

  /** A glowing swamp (0..1): part of some of the wetlands, where at night the water, the moss and the fungi glow blue-green. */
  glowSwampAt(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    if (w.wetland < 0.2) return 0;
    return Math.max(w.wetland * smoothstep(T.glowSwamp, T.glowSwamp + 0.14, this.wetNoise.fbm(x * 0.0008 + 77, z * 0.0008 - 41, 2)), this.#glowBlob(x, z));
  }

  /**
   * Meteor craters: uncommon (one in a few kilometres' stretch of land, and
   * not every stretch), anywhere on the land but the steepest mountains. A
   * round bowl blasted out, 70 to 220 m across, its rim heaped up, and the
   * ground thrown out round it for a long way (see WonderLayer: the rocks
   * and boulders flung out; GroundItems: the iron of the meteorite itself).
   * Returns the crater whose reach (`reach` times its radius) takes in (x, z):
   * { x, z, r, depth, rim, d }, or null.
   */
  meteorCraterAt(x, z, reach = 3.5) {
    const G = 2600, I = Math.floor(x / G), K = Math.floor(z / G);
    let best = null;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const c = this.#meteorCrater(I + di, K + dk);
      if (!c) continue;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * reach && (!best || d / c.r < best.d / best.r)) best = { ...c, d };
    }
    return best;
  }

  #meteorCrater(I, K) {
    const cache = (this._meteors ??= new Map()), key = I * 100003 + K;
    if (cache.has(key)) return cache.get(key);
    if (cache.size > 20000) cache.clear();
    this._craterNew = true; // (other points looked at: see #craterCarve)
    let c = null;
    const G = 2600, h = (k) => hash2(I * 7 + k * 1013, K * 13 - k * 619, this.seed ^ 0x3e7e);
    if (h(0) < 0.32) {
      const x = (I + 0.2 + 0.6 * h(1)) * G, z = (K + 0.2 + 0.6 * h(2)) * G;
      const r = 35 + 75 * h(3) * h(3), depth = 0.24 * r, rim = 0.07 * r, sea = this.rivers.seaLevel;
      // (Dry land all round it, high enough that its bowl stays above the water, and not up among the peaks.)
      // (Looked at quickly, as the land lies before its rivers: see #probe.)
      const pr = this.#probe();
      let ok = pr.getMountainness(x, z) < 0.6;
      for (let k = 0; k < 9 && ok; k++) {
        const a = (k / 8) * Math.PI * 2, d = k ? r * 1.2 : 0;
        if (!(pr.landHeight(x + Math.cos(a) * d, z + Math.sin(a) * d) > sea + depth + 4)) ok = false;
      }
      if (ok) c = { x, z, r, depth, rim };
    }
    cache.set(key, c);
    return c;
  }

  /** The land at (x, z), `g` high, with the meteor craters' bowls blasted out and their rims and ejecta heaped. */
  #craterCarve(x, z, g) {
    this._craterNew = false;
    const c = this.meteorCraterAt(x, z, 3.2);
    // (Craters just laid out looked at other land, leaving its weights behind: worked out again for this point.)
    if (this._craterNew) this.landHeight(x, z);
    if (!c) return g;
    const t = c.d / c.r;
    // (The bowl, its floor rounded; the rim; the thrown-out ground thinning away outside it.)
    if (t < 1) return g + c.depth * (t * t - 1) + c.rim * t * t * t;
    return g + c.rim * Math.max(0, 1 / (t * t * t) - 1 / 32.8) * 1.03;
  }

  /** Black sand on the beach (0..1): the coasts by volcanic country, and here and there a stretch of dark volcanic shore elsewhere. */
  blackSandAt(x, z) {
    const w = this.getBiomeWeights(x, z, {});
    // (Volcanic country here, or within half a kilometre inland: its shore. Three
    // stretches of such shore in four are black sand, the rest pale.)
    let v = w.volcanic + this.#volcanoZone(x, z, this.#rangeField(x, z, {}).value) * 0.5;
    if (v < 0.2 && this.getOceanness(x, z) > 0.3) for (const [dx, dz] of [[450, 0], [-450, 0], [0, 450], [0, -450]]) v = Math.max(v, 0.9 * this.getBiomeWeights(x + dx, z + dz, {}).volcanic);
    const volc = smoothstep(0.02, 0.2, v) * smoothstep(-0.44, -0.36, this.coastNoise.noise2D(x * 0.0004 + 71, z * 0.0004 - 19));
    const stretch = smoothstep(0.42, 0.54, this.coastNoise.fbm(x * 0.0005 + 500, z * 0.0005 - 200, 2)) * (1 - w.desert - w.saltFlat);
    return Math.max(volc, stretch) * (1 - w.mangrove);
  }

  getGrove(x, z) {
    return smoothstep(0.16, 0.36, this.groveNoise.fbm(x * 0.0006 + 13, z * 0.0006 - 57, 2));
  }

  /** How grassy a spot is, in [0, 1]: lush meadows and thinner patches. */
  /**
   * The birch and aspen groves of the parkland (0..1): thick stands a
   * hundred metres or a few hundred across, with open grassland between
   * them where hardly a tree grows.
   */
  getParklandGrove(x, z) {
    const n = this.groveNoise.fbm(x * 0.0042 + 210, z * 0.0042 - 140, 3) + 0.25 * this.groveNoise.noise2D(x * 0.02 - 33, z * 0.02 + 71);
    return smoothstep(0.02, 0.2, n);
  }

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
    // (A redwood forest's own: wherever it has much of a share, it's all
    // redwood, no other forest's trees mixed in at its edges.)
    if (w.redwood > 0.1) return this.biomes.redwood;
    // (Nor palms anywhere near one: the jungle's and the mangrove coast's
    // trees are left out of the pick wherever the redwoods reach.)
    const skip = w.redwood > 0.005 ? (id) => id === 'mangrove' || id === 'jungle' : () => false;
    let total = 0;
    for (const id in w) if (!skip(id)) total += w[id];
    r *= total;
    for (const id in w) {
      if (skip(id)) continue;
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
  describe(x, z, quick = false, known = null) {
    const sea = this.rivers.seaLevel;
    // (`quick`, for the big map: the land before rivers, and none of the
    // small features, so a whole map's worth is quick to work out. It may
    // pass the height, `known`, already worked out for its shading.)
    const heightAt = quick ? (px, pz) => this.getBaseHeight(px, pz) : (px, pz) => this.getHeight(px, pz);
    const height = known ?? heightAt(x, z);
    if (height < sea - 0.3) {
      if (this.getOceanness(x, z) <= 0.5) return 'Lake';
      if (!quick && height > sea - 3 && this.getSeaCliff(x, z) > 0.5) {
        const over = this.overhangAt(x, z);
        if (over) return over.cave ? 'Sea cave' : 'Sea arch';
      }
      if (this.getKelp(x, z, height) > 0.35) return 'Kelp forest';
      return this.getReef(x, z, height) > 0.4 ? 'Coral reef' : 'Ocean';
    }
    const water = quick ? null : this.rivers.at(x, z, 0);
    if (water) return water.crater ? 'Crater lake' : water.hot ? 'Hot spring' : water.alpine ? 'Alpine lake' : water.oasis ? 'Oasis' : water.pond ? 'Pond' : water.stream ? 'Mountain stream' : water.big ? 'River' : 'Creek';
    if (this.mushroomIslandAt(x, z) > 0.5) return 'Mushroom island';
    if (this.meteorCraterAt(x, z, 1.3)) return 'Meteor crater';
    if (this.atollAt?.(x, z) > 0.5) return 'Coral atoll';
    if (this.islandAt(x, z) > 0.5) return 'Island';
    const w = this.getBiomeWeights(x, z, {});
    const f = this.getFeatures(x, z);
    if (this.getOceanness(x, z) > 0.5 && height < sea + 34 && this.getSeaCliff(x, z) > 0.5) {
      const over = quick ? null : this.overhangAt(x, z);
      if (over) return over.cave ? 'Sea cave' : 'Sea arch';
      if (!quick && height < sea + 1.5 && this.#poolsNear(x, z).some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 1.5)) return 'Tide pools';
      return 'Sea cliffs';
    }
    if (w.mangrove > 0.5) return 'Mangrove coast';
    if (height < sea + 2.5 && this.getOceanness(x, z) > 0.5 && w.desert < 0.5) return this.blackSandAt(x, z) > 0.5 ? 'Black sand beach' : 'Beach';
    if (f.canyon > 0.5) return f.canyonFloor > 0.5 ? 'Canyon floor' : 'Canyon';
    const mountains = this.getMountainness(x, z);
    // (Land the Smoky Mountains lift is theirs, never a range's snowy peaks.)
    if (mountains > 0.45 && w.smoky > 0.2 && this.#smokyLift(x, z) > 0.5) return 'Smoky Mountains';
    if (mountains > 0.45) {
      // (A jungle range's mountains are green to their tops, however high: no snow on them.)
      if (w.jungleMountains > 0.5) return 'Jungle mountains';
      if (height > 181) return 'Snowy peaks';
      // Mountains are bare rock: above the trees, or sheer. Wooded slopes
      // lower down are the foothills.
      const steep = Math.abs(heightAt(x + 3, z) - heightAt(x - 3, z)) / 6 + Math.abs(heightAt(x, z + 3) - heightAt(x, z - 3)) / 6;
      if (w.jungleMountains > 0.5) return 'Jungle mountains';
      if (height + this.getColorJitter(x, z) > T.mountainsAbove || steep > 0.72) return 'Mountains';
      // (A cherry grove, the foothills jungle, a bamboo forest: on the range's lower slopes, theirs.)
      if (w.cherry > 0.5) return 'Cherry blossom highlands';
      if (w.jungleFoothills > 0.5) return 'Mountain foothills jungle';
      if (w.bamboo > 0.5) return 'Bamboo forest';
      // (The lower slopes of a range read as the country they are: hills,
      // plains, woods.)
      if (mountains > 0.62) {
        // (Forest on the flanks of the range: pine country.)
        if (w.redwood > 0.5) return 'Redwood forest';
        if (w.pine > 0.5) return 'Pine forest';
        return 'Mountain foothills';
      }
    }
    const top = Object.keys(w).reduce((a, b) => (w[a] >= w[b] ? a : b));
    if (top === 'blackHills') return 'Black Hills';
    if (top === 'smoky') return 'Smoky Mountains';
    if (top === 'volcanic') {
      const n = this.#nearestSpring(x, z);
      if (n && n.spring.geyser && n.d < 12) return 'Geyser';
      if (n && n.d < n.spring.r * 3) return 'Hot springs';
      return this.getVolcanic(x, z).cone > 0.5 ? 'Volcano' : 'Volcanic highlands';
    }
    if (top === 'cherry') return 'Cherry blossom highlands';
    if (top === 'jungleMountains') return 'Jungle mountains';
    if (top === 'jungleFoothills') return 'Mountain foothills jungle';
    if (top === 'bamboo') return 'Bamboo forest';
    if (top === 'wetland' && this.glowSwampAt(x, z) > 0.5) return 'Glowing swamp';
    if (top === 'wetland') return height < sea + 2 ? 'Marsh' : 'Wetlands';
    if (top === 'jungle') return 'Jungle';
    if (top === 'pine') return 'Pine forest';
    if (top === 'redwood') return 'Redwood forest';
    if ((top === 'savanna' || top === 'desert') && this.petrifiedAt(x, z) > 0.5) return 'Petrified forest';
    if (top === 'badlands') return 'Badlands';
    if (top === 'desert' && this.oasisAt(x, z) > 0.3) return 'Oasis';
    if (top === 'desert') return f.erg > 0.5 ? 'Dune sea' : f.mesa > 0.28 ? 'Mesas' : 'Desert';
    if (top === 'savanna') return f.mesa > 0.28 ? 'Mesas' : 'Savanna';
    if (f.escarp > 0.5 && f.escarpHeight > 4) return 'Escarpment';
    if (top === 'parkland') return 'Birch & aspen parkland';
    if (top === 'cascades') return 'Cascades';
    if (top === 'redwood') return 'Redwood forest';
    if (top === 'badlands') return 'Badlands';
    if (top === 'saltFlat') return 'Salt flats';
    // (Forest: the woods, and the hill country they stand in, wooded or not.)
    if (this.getForestDensity(x, z) > 0.55 || smoothstep(-0.41, 0.19, this.hillRegionNoise.fbm(x * 0.0007, z * 0.0007, 2)) > 0.6) return 'Forest';
    if (this.giantMeadowAt(x, z) > 0.5) return 'Giant flower meadow';
    return this.getMeadow(x, z) > 0.5 ? 'Wildflower meadow' : 'Plains';
  }

  surfaceColor(x, z, height, upness, out, jitter = this.getColorJitter(x, z)) {
    const w = this.getBiomeWeights(x, z, {});
    // (The colour jitter never pulls land well above the water down into
    // the beach-sand band: sand only by the water.)
    const sea = this.rivers.seaLevel;
    const ground = height - jitter; // `height` has the colour jitter added
    // (And the sand only on the sea's beaches: low ground by a river or a
    // lake takes the biome's own banks, see getShore.)
    let land = smoothstep(sea + 1.5, sea + 3.5, ground);
    if (land < 1 && ground > sea + 0.6) land = Math.max(land, 1 - smoothstep(0.3, 0.55, this.getOceanness(x, z)));
    height = Math.max(height, 8.5 * land);
    // (Where the land rises into the Smoky Mountains, it's coloured as
    // they are, green to the tops: no bare rock or snow on their flanks.)
    if (w.smoky > 0.01 && w.smoky < 0.99 && height > 100) {
      const lift = this.#smokyLift(x, z);
      if (lift > 0) {
        let moved = 0;
        for (const id of BIOME_IDS) {
          if (id === 'smoky') continue;
          moved += w[id] * lift;
          w[id] *= 1 - lift;
        }
        w.smoky += moved;
      }
    }
    blendedFaceColor(this.biomes, w, height, upness, out);
    // Under a landmark's lake or pool (the crystal lake, a crater lake, a
    // cenote): stone and gravel, never the grass of the land round it.
    if (ground > sea && this.landmarks?.underWater(x, z, ground - 0.3)) out.lerp(LAKE_FLOOR, 0.85);
    // A mushroom island: its ground a mat of grey-violet mycelium, above the beach.
    if (land > 0 && ground < sea + 40) {
      const myc = this.mushroomIslandAt(x, z) * land;
      if (myc > 0.01) {
        const k = hash2(Math.floor(x * 0.7), Math.floor(z * 0.7), this.seed ^ 0x3c1);
        out.lerp(k < 0.15 ? MYCELIUM_PALE : k < 0.3 ? MYCELIUM_DARK : MYCELIUM, smoothstep(0.2, 0.7, myc));
      }
    }
    // Black sand on the beaches of volcanic shores (and under the shallows by them).
    if (ground < sea + 4.5) {
      const bs = this.blackSandAt(x, z);
      if (bs > 0.01) out.lerp(BLACK_SAND, bs * (1 - 0.8 * smoothstep(sea + 3, sea + 4.5, ground)) * (upness > 0.6 ? 1 : 0.5));
    }
    if (land > 0.5) {
      // A petrified forest: the ground banded in grey, lavender, rust and cream.
      const pf = w.savanna + w.desert > 0.3 ? this.petrifiedAt(x, z) : 0;
      if (pf > 0.01) {
        const band = ground * 0.28 + this.detailNoise.noise2D(x * 0.02, z * 0.02) * 1.4;
        out.lerp(PETRIFIED_BANDS[((Math.floor(band) % 4) + 4) % 4], 0.55 * smoothstep(0.1, 0.6, pf));
      }
      // A meteor crater: its bowl scorched dark, the thrown-out ground round it pale with rock dust.
      const mc = this.meteorCraterAt(x, z, 2.6);
      if (mc) {
        const t = mc.d / mc.r;
        if (t < 1.05) out.lerp(CRATER_SCORCH, 0.55 * (1 - smoothstep(0.85, 1.05, t)) + 0.1);
        else out.lerp(CRATER_DUST, 0.45 * (1 - smoothstep(1.05, 2.6, t)) * (0.7 + 0.3 * this.detailNoise.noise2D(x * 0.08, z * 0.08)));
      }
      // A glowing swamp: its moss darker, blue-green.
      const gs = w.wetland > 0.2 ? this.glowSwampAt(x, z) : 0;
      if (gs > 0.01) out.lerp(GLOW_MOSS, 0.45 * gs);
    }
    // Salt flats: the white crust cracked into plates, each a little
    // different, with darker seams between them.
    if (w.saltFlat > 0.05 && upness > 0.9) {
      const qx = x / 7 + this.detailNoise.noise2D(x * 0.05, z * 0.05) * 0.6, qz = z / 7 + this.detailNoise.noise2D(x * 0.05 + 30, z * 0.05 - 30) * 0.6;
      const fx = qx - Math.floor(qx), fz = qz - Math.floor(qz);
      const seam = Math.min(fx, 1 - fx, fz, 1 - fz) < 0.09 ? 0.86 : 0.96 + 0.07 * hash2(Math.floor(qx), Math.floor(qz), this.seed ^ 0x5a17);
      out.multiplyScalar(1 + (seam - 1) * smoothstep(0.05, 0.5, w.saltFlat));
    }
    // Ice up in the snow: the steep faces are icy blue-grey rock, and here
    // and there the snow gives way to blue glacier ice.
    if (height > 170 && w.temperate + w.pine + w.savanna > 0.5) {
      const up = smoothstep(175, 205, height);
      const steep = 1 - smoothstep(0.35, 0.6, upness);
      const glacier = smoothstep(0.15, 0.45, this.detailNoise.noise2D(x * 0.012 + 90, z * 0.012 - 40)) * smoothstep(0.45, 0.6, upness) * (1 - smoothstep(0.85, 0.95, upness));
      if (steep > 0) out.lerp(ICY_ROCK, 0.55 * steep * up);
      if (glacier > 0) out.lerp(ICE, 0.75 * glacier * up);
    }
    // A glacier's ice: snow lying on it, the blue ice showing in the
    // crevasses across its flow and in its steep front, and along its sides
    // and its snout the dark rock and grit of its moraines.
    const gl = height > this.rivers.seaLevel + 60 ? this.landmarks.glacierAt(x, z, height) : null;
    if (gl) {
      const N = this.detailNoise;
      const snowy = pickColor(GLACIER_SNOW, hash2(Math.floor(x / 3), Math.floor(z / 3), this.seed ^ 0x61ac));
      let c = snowy;
      // (Crevasses: bands across the flow, broken and wandering, where it bends and stretches.)
      const band = Math.sin(gl.u * 0.42 + N.noise2D(x * 0.03, z * 0.03) * 4 + gl.v * gl.v * 0.004);
      if (band > 0.72 && gl.q < 0.8 && N.noise2D(x * 0.08 + 7, z * 0.08) > -0.2) c = CREVASSE;
      if (upness < 0.75) c = upness < 0.55 ? ICE_DEEP : ICE; // (its steep front and the walls of its seracs)
      out.lerp(c, smoothstep(0.1, 0.8, gl.ice));
      // (The moraines: rock and grit along its edges and heaped at its snout.)
      const moraine = smoothstep(0.78, 0.94, gl.q) * (1 - smoothstep(0.96, 1, gl.q));
      if (moraine > 0) out.lerp(MORAINE[Math.floor(hash2(Math.floor(x / 2), Math.floor(z / 2), this.seed ^ 0x3a0e) * MORAINE.length)], 0.8 * moraine);
    }
    // The rocky ground of the sea floor: crusted over with weed, sponge and
    // coralline algae, dull greens, rose and purple, in patches.
    if (ground < this.rivers.seaLevel - 4 && this.getOceanness(x, z) > 0.4) {
      const rock = this.getSeaRock(x, z) * smoothstep(this.rivers.seaLevel - 4, this.rivers.seaLevel - 7, ground);
      if (rock > 0.05) out.lerp(SEA_CRUST[Math.floor(hash2(Math.floor(x / 3), Math.floor(z / 3), this.seed ^ 0x5ea1) * SEA_CRUST.length)], (0.4 + 0.35 * (1 - upness)) * rock);
    }
    // Coral reefs in the warm shallows: the reef grown over in patches of
    // colour, the sand floor round it left pale.
    if (ground < this.rivers.seaLevel - 0.6) {
      const reef = this.getReef(x, z, ground);
      if (reef > 0) out.lerp(CORALS[Math.floor(hash2(Math.floor(x / 3), Math.floor(z / 3), this.seed ^ 0xc0a1) * CORALS.length)], 0.5 * reef);
    }
    // Round hot springs and geysers: orange mats of heat-loving microbes at
    // the water's edge, then pale crusts of sinter.
    if (w.volcanic > 0.5) {
      const n = this.#nearestSpring(x, z);
      if (n) {
        const r = n.spring.geyser ? 3 : n.spring.r;
        const q = n.d / r;
        // (Rings of colour out from the water: the mats, streaked, then the pale crust.)
        const mat = MATS[n.spring.hue ?? 0], streak = 0.5 + 0.5 * Math.sin(Math.atan2(z - n.spring.z, x - n.spring.x) * 7 + q * 3);
        if (q < 3) out.lerp(q < 1.2 ? mat : q < 1.7 ? (streak > 0.4 ? mat : MAT) : SINTER, 0.85 * (1 - smoothstep(2.2, 3, q)));
      }
    }
    // Lake shores: mud, dirt, grass and rock; rocky outcrops on beaches.
    const shore = ground < 9 ? this.getShore(x, z, ground) : null;
    if (shore) out.lerp(shore.color ?? SHORE[shore.kind], 0.85 * shore.fade);
    // Fallen rock at the foot of sea cliffs and round sea stacks.
    if (ground < 7 && ground > -3) {
      const cliffs = this.getSeaCliff(x, z);
      if (cliffs > 0.2) {
        out.lerp(SHORE.rock, 0.85 * smoothstep(0.2, 0.5, cliffs) * (1 - smoothstep(4, 7, ground)));
        // The rock shelves at the cliff's foot: dark, wet rock; weed and
        // barnacles on the floors of the tide pools.
        if (ground < sea + 1.4) {
          const wet = smoothstep(0.4, 0.7, cliffs) * (1 - smoothstep(sea + 0.9, sea + 1.4, ground));
          out.lerp(WET_ROCK, 0.8 * wet);
          if (wet > 0 && ground < sea + 0.3 && this.#poolsNear(x, z).some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 0.7)) out.lerp(POOL_FLOOR, 0.85 * wet);
        }
        // In the gloom under a sea cave's roof.
        if (ground < sea + 3) {
          for (const c of this.#seaCavesNear(x, z)) {
            const a = (x - c.x) * c.nx + (z - c.z) * c.nz;
            const b = Math.abs((x - c.x) * -c.nz + (z - c.z) * c.nx);
            if (a > 0 && a < c.d + 1 && b < c.w + 1) out.lerp(CAVE_DARK, 0.4 + 0.5 * smoothstep(0, c.d * 0.7, a));
          }
        }
      }
    }
    // Dune seas: warm golden sand all over.
    const f = w.desert + w.savanna > 0.2 ? this.getFeatures(x, z) : null;
    if (f && f.erg > 0) {
      out.lerp(DUNE, 0.85 * f.erg * (1 - smoothstep(0.05, 0.5, w.saltFlat)));
      const oasis = this.oasisAt(x, z);
      if (oasis > 0) out.lerp(OASIS, 0.9 * oasis);
    }
    // Canyon floors: a pale, stony dry wash.
    if (f && f.canyonFloor > 0.3 && upness > 0.8) out.lerp(WASH, 0.75 * f.canyonFloor);
    // Volcanoes: black tongues of old lava, reddish cinders round the craters.
    if (w.volcanic > 0.02) {
      // Native grass, and broad stretches of bare, rocky ground.
      const rocky = this.getVolcanicRocky(x, z);
      if (rocky > 0 && height > 8) {
        // (Broken up: lighter and darker basalt, tufts of grass between.)
        const n = this.detailNoise.noise2D(x * 0.09 + 17, z * 0.09 - 5);
        bankTmp.copy(VOLCANIC_ROCK).lerp(BASALT, 0.35 * smoothstep(0.1, 0.6, n));
        out.lerp(bankTmp, (0.55 + 0.35 * smoothstep(-0.5, 0.2, n)) * rocky * smoothstep(0.02, 0.4, w.volcanic));
      }
      const v = this.getVolcanic(x, z);
      if (v.cone > 0) out.lerp(SCREE, 0.8 * v.cone); // bare cinder slopes
      if (v.lava > 0) out.lerp(LAVA, 0.85 * v.lava);
      // Beside a live flow: its levees of fresh black lava.
      if (v.blocks > 0) out.lerp(BASALT, 0.9 * v.blocks);
      if (v.toe > 0) out.lerp(BASALT, 0.9 * v.toe); // (the black rubble at a flow's end)
      if (v.crater > 0) out.lerp(CINDER, 0.6 * v.crater * (1 - v.cold));
      if (v.cold > 0) out.lerp(BASALT, 0.85 * v.cold); // (a dead crater's bowl: black volcanic rock)
    }
    // Badlands: the ridges and buttes banded cream, buff, rose and grey
    // (only the floor between them grassed).
    if (w.badlands > 0.02) {
      const rise = this.badlandsRelief(x, z) * w.badlands; // (how far up the ridges)
      // (Bare clay on the slopes; grass on the floor and over the flat tables.)
      const bare = smoothstep(1.5, 4, rise) * (1 - 0.85 * smoothstep(0.95, 0.99, upness));
      if (bare > 0) {
        // (By the true height of the ground, without the colour jitter: level stripes right round every ridge.)
        const band = Math.floor((ground + this.detailNoise.noise2D(x * 0.01, z * 0.01) * 0.6) / 2.2);
        out.lerp(BADLANDS[((band % BADLANDS.length) + BADLANDS.length) % BADLANDS.length], 0.9 * bare * smoothstep(0.02, 0.5, w.badlands));
      }
    }
    // The Cascades' ground: thick moss in patches, and here and there bare
    // reddish clay, more of it down by the water.
    if (w.cascades > 0.2 && upness > 0.8) {
      const lush = smoothstep(0.2, 0.6, w.cascades) * smoothstep(0.8, 0.9, upness);
      const n1 = this.detailNoise.noise2D(x * 0.045 + 21, z * 0.045 - 13) + 0.5 * this.detailNoise.noise2D(x * 0.13 - 4, z * 0.13 + 8);
      const n2 = this.detailNoise.noise2D(x * 0.03 - 77, z * 0.03 + 41) + 0.4 * this.detailNoise.noise2D(x * 0.11 + 9, z * 0.11 - 2);
      const wet = this.rivers.shoreAt(x, z, 10);
      if (n1 > 0.25) out.lerp(CASCADE_MOSS, 0.75 * lush * smoothstep(0.25, 0.55, n1));
      const clay = n2 - (wet && wet.e > 0 ? 0.5 * (1 - wet.e / 10) : 0);
      if (clay < -0.6) out.lerp(CASCADE_CLAY, 0.8 * lush * smoothstep(-0.6, -0.85, clay));
    }
    // The Cascades' cliffs: bare dark basalt in layers, all of every face
    // that's at all steep (no green on them).
    if (w.cascades > 0.05 && upness < 0.9) {
      const face = (1 - smoothstep(0.78, 0.9, upness)) * smoothstep(0.05, 0.5, w.cascades);
      const layer = Math.floor((ground + this.detailNoise.noise2D(x * 0.03, z * 0.03) * 0.8) / 2.6);
      out.lerp(CASCADE_ROCK[((layer % 3) + 3) % 3], face);
    }
    // Mesa and canyon walls: bands of red and orange sandstone.
    // (Fading gradually into the rock round about: an escarpment's walls
    // turn to sandstone as the country dries out towards mesa country.)
    // (Looked up on any steep face, not just in the dry country: otherwise
    // the sandstone would stop dead where the dry country's share drops.)
    const fw = f ?? (upness < 0.85 ? this.getFeatures(x, z) : null);
    if (upness < 0.85 && fw) {
      const f = fw;
      // (Canyons and escarpments are sandstone only in the dry country,
      // turning so gradually from the grey rock of the green country.)
      const arid = f.escarp > 0.05 || f.canyon > 0 ? this.#rawAridity(x, z) : 0;
      const sand = Math.max(smoothstep(0.02, 0.45, f.mesa), f.canyon * smoothstep(0.3, 0.55, arid), f.escarp * smoothstep(0.38, 0.62, arid));
      if (sand > 0.02) {
        // (Broad bands, gently contrasted: easy on the eye.)
        const band = Math.floor((height + this.detailNoise.noise2D(x * 0.02, z * 0.02) * 1.2) / 5);
        stratum.copy(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]).lerp(STRATA_MID, 0.45);
        const patchy = sand < 1 ? 0.75 + 0.25 * this.detailNoise.noise2D(x * 0.05 + 3, z * 0.05 - 3) : 1;
        out.lerp(stratum, Math.min(1, sand * patchy) * (1 - smoothstep(0.6, 0.85, upness)));
      }
    }
    // Muddy banks along rivers and ponds (gravel along mountain streams),
    // fading to dirt and then the land's own colour.
    // (Measured from the edge of whatever water covers the point, so the
    // bed is one colour right out to the waterline, even where a stream runs
    // into a pond, and the mud starts only at the water's edge: no brown
    // band of bank colour under the water.)
    // (Not up the Cascades' cliffs, where they come down to a pool: rock to the water.)
    const river = w.cascades > 0.3 && upness < 0.8 ? null : this.rivers.shoreAt(x, z, 4);
    if (river) {
      const e = river.e; // metres from the water's edge
      const gravel = river.stream && this.getMountainness(x, z) > 0.3;
      if (e < 0) out.lerp(RIVERBED, 0.85);
      else if (e < 1.8) out.lerp(gravel ? GRAVEL : this.#bankColor(w, 'mud', bankTmp), 0.85);
      // (Then the biome's own green bank, not a band of bare dirt.)
      else out.lerp(gravel ? GRAVEL : this.#bankColor(w, 'bank', bankTmp), 0.6 * (1 - smoothstep(1.5, 4, e)) * (0.7 + 0.3 * this.detailNoise.noise2D(x * 0.3, z * 0.3)));
    }
    return out;
  }
}
