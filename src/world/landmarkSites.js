import { hash2 } from '../noise/random.js';

/**
 * The world's landmarks: where each of the twelve kinds stands. Each kind
 * has its own lattice of great squares (`cell` m across) and at most one
 * site in a square, set at the first of a few spots in its middle that
 * suits it: the country it needs (`fits`), then the lie of the land
 * (`land`: high or low, steep or level, on a rise or in a hollow). The
 * ones that are hollows (`basin`) the terrain itself carves: see basinAt.
 *
 *   { kind, key, x, z, rot, seed }
 */
export const LANDMARKS = {
  elderTree: { name: 'The Elder Tree', cell: 2600, land: (h, slope) => h > 4 && slope < 0.22, // (on level ground in the deep woods)
    what: 'An ancient tree, the oldest thing in the forest: rest beneath it and your wounds close fast',
    fits: (w, m, f) => w.temperate + w.parkland + w.smoky + w.redwood > 0.6 && m < 0.45 && f > 0.35 },
  stoneArch: { name: 'The Stone Arch', cell: 2600, land: (h, slope, rise) => slope < 0.4 && rise > -2, // (on open rock, not down in a wash)
    what: 'A great arch of red rock among boulders and spires: from under it the land round about is laid out on your map',
    fits: (w, m) => w.badlands + 0.8 * w.desert + w.blackHills > 0.45 && m < 0.6 },
  crystalLake: { name: 'Crystal Lake', cell: 3000, tries: 14, land: (h, slope, rise) => h > 30 && rise < -1.5 && slope < 0.4, // (in a high bowl among the peaks, where the water gathers)
    basin: { r: 34, d: 7, steep: 0.35 }, what: 'A clear mountain lake ringed with crystals, some taller than a house: its water is safe to drink, and crystals lie on its shore',
    fits: (w, m) => m > 0.22 && m < 0.65 && w.desert + w.savanna + w.badlands < 0.2 },
  // (A lake high on a wooded hillside, and below it a chain of pools, each
  // spilling over its lip in falls into the next: see cascadePools.)
  cascades: { name: 'The Cascades', cell: 3000, tries: 12, cascade: true, land: (h, slope) => h > 25 && slope > 0.1 && slope < 0.55, // (on a hillside, for the water to step down)
    what: 'A high lake spilling down a hillside in falls from one turquoise pool to the next: clean water, and the fish there bite fast',
    fits: (w, m, f) => w.temperate + w.smoky + w.parkland + w.pine + w.redwood + w.wetland > 0.6 && m < 0.7 },
  standingStones: { name: 'The Standing Stones', cell: 2600, land: (h, slope, rise) => h > 6 && rise > 1.5 && slope < 0.2, // (on the crown of a low hill, seen from all round)
    what: 'A ring of old stones: stood in it, the other landmarks near are shown on your map',
    fits: (w, m, f, open) => (open > 0.25 || w.blackHills > 0.5 || w.parkland > 0.5) && m < 0.3 },
  sunkenForest: { name: 'The Sunken Forest', cell: 3000, tries: 12, land: (h, slope, rise) => h > 1 && h < 35 && slope < 0.12 && rise < 1, // (low, flat, wet ground where water lies)
    basin: { r: 40, d: 3, steep: 0.2 }, what: 'Dead trees standing in still water where a forest drowned: bog iron lies in the shallows',
    fits: (w, m, f) => (w.wetland > 0.4 || (w.temperate + w.smoky > 0.6 && f > 0.45)) && m < 0.3 },
  petrifiedLog: { name: 'The Petrified Log', cell: 2600, land: (h, slope) => slope < 0.15, // (weathering out of the flats)
    what: 'A giant tree turned to stone long ago: flint and agate weather out of it',
    fits: (w) => w.desert + w.badlands > 0.6 },
  boneField: { name: 'The Bone Field', cell: 2600, land: (h, slope) => slope < 0.12, // (out on the open flats)
    what: 'The bleached bones of something enormous, and the spears of the hunters who found it: arrows and an old map',
    fits: (w) => w.desert + w.savanna > 0.6 },
  hotPools: { name: 'The Hot Pools', cell: 3000, land: (h, slope) => h > 10 && slope > 0.06 && slope < 0.35, // (on a gentle slope, for the terraces to step down)
    basin: { r: 13, d: 2.2, steep: 0.3 }, hot: true, what: 'Steaming pools on white terraces: warm through and heal in them, and scrape up their salts',
    fits: (w, m) => w.volcanic > 0.3 || (m > 0.45 && w.smoky + w.blackHills + w.pine > 0.3) || m > 0.6 },
  // (Twice as wide and three times as deep as it was: a pit 100 m across and
  // 80 m down, its walls rough, not sheer; only on high ground, so its floor
  // stays above the sea's level and dry.)
  greatSinkhole: { name: 'The Great Sinkhole', cell: 3200, tries: 10, land: (h, slope) => h > 40 && slope < 0.2, // (as deep as the land lets it be, and no deeper)
    basin: { r: 52, d: 84, steep: 0.3, dry: true, rough: 5 }, what: 'The ground fallen away into a vast round pit: bats roost in it, coal shows in its walls',
    fits: (w, m) => w.temperate + w.smoky + w.parkland + w.blackHills + w.pine > 0.6 && m < 0.5 },
  // (Not a landmark to find: the great glaciers lying in the high valleys
  // of the snowy peaks. Placed the same way; never on the map.)
  glacier: { name: 'Glacier', cell: 1500, hidden: true, chance: 0.85, tries: 14, land: (h, slope, rise) => h > 120 && rise < -2.5 && slope < 0.7,
    what: '', fits: (w, m, f, open, cold) => m > 0.6 && cold > 0.4 },
};
export const LANDMARK_KINDS = Object.keys(LANDMARKS);
/** The ones to be found (on the map, an achievement each). */
export const FOUND_KINDS = LANDMARK_KINDS.filter((k) => !LANDMARKS[k].hidden);
const BASIN_KINDS = LANDMARK_KINDS.filter((k) => LANDMARKS[k].basin || LANDMARKS[k].cascade);

// (A smooth wobbly noise, for a pit's rough walls.)
const wob = (x, z, s) => Math.sin(x * 0.11 + s) * Math.cos(z * 0.13 - s) + 0.5 * Math.sin(x * 0.29 - z * 0.23 + s * 2) + 0.25 * Math.sin(x * 0.61 + z * 0.53 + s * 3);

export class LandmarkSites {
  constructor(generator) {
    this.g = generator;
    this.cache = new Map();
  }

  /** Whether the square's been worked out already (the site's cheap to ask for, then). */
  known(kind, i, k) {
    return this.cache.has((LANDMARK_KINDS.indexOf(kind) * 100003 + i) * 100019 + k);
  }

  /** The site of `kind` in its square (i, k), or null. */
  site(kind, i, k) {
    const ki = LANDMARK_KINDS.indexOf(kind);
    const key = (ki * 100003 + i) * 100019 + k;
    let s = this.cache.get(key);
    if (s !== undefined) return s;
    s = null;
    const L = LANDMARKS[kind], C = L.cell, seed = (this.g.seed ^ 0x1a7d) + ki * 7919;
    // (Some squares have none: the landmarks are found, not met at every turn.)
    if (hash2(i, k, seed) < (L.chance ?? 0.375)) {
      const w = {};
      for (let t = 0; t < (L.tries ?? 6) && !s; t++) {
        const x = (i + 0.15 + 0.7 * hash2(i * 3 + t, k, seed + 1)) * C, z = (k + 0.15 + 0.7 * hash2(i, k * 3 + t, seed + 2)) * C;
        // (The cheap questions first.)
        this.g.getBiomeWeights(x, z, w);
        for (const id of ['temperate', 'parkland', 'smoky', 'redwood', 'badlands', 'desert', 'blackHills', 'savanna', 'wetland', 'volcanic', 'pine']) w[id] ??= 0;
        if ((w.saltFlat ?? 0) > 0.3 || (w.mangrove ?? 0) > 0.3) continue;
        const m = this.g.getMountainness(x, z), f = L.needs?.forest === false ? 0 : this.g.getForestDensity(x, z);
        const open = w.temperate > 0.5 ? 1 - Math.min(1, f * 1.6) : 0;
        const cold = kind === 'glacier' ? this.g.getSeasonality(x, z) : 0;
        if (!L.fits(w, m, f, open, cold)) continue;
        if (this.g.getOceanness(x, z) > 0.05) continue;
        // (Then the lie of the land: high or low, steep or level, standing up
        // over the country round or down in a hollow.)
        if (L.land && !this.#lie(x, z, L.land)) continue;
        s = { kind, key: `${kind}:${i},${k}`, x, z, rot: hash2(i, k, seed + 3) * Math.PI * 2, seed: Math.floor(hash2(i, k, seed + 4) * 1e9) };
      }
    }
    if (this.cache.size > 20000) this.cache.clear();
    this.cache.set(key, s);
    return s;
  }

  // The land's height asked for mid-way through its working out another
  // point (see levelOf): what it remembers of that point put back after.
  #probe(fn) {
    const g = this.g, keep = { ...g._weights }, erg = g._erg, was = this.busy;
    this.busy = true;
    try {
      return fn((x, z) => g.getHeight(x, z));
    } finally {
      this.busy = was;
      Object.assign(g._weights, keep);
      g._erg = erg;
    }
  }

  #lie(x, z, test) {
    return this.#probe((H) => {
      const h = H(x, z), sea = this.g.rivers?.seaLevel ?? 0;
      const sx = (H(x + 12, z) - H(x - 12, z)) / 24, sz = (H(x, z + 12) - H(x, z - 12)) / 24;
      let ring = 0;
      for (let k = 0; k < 8; k++) ring += H(x + Math.cos(k * 0.785) * 70, z + Math.sin(k * 0.785) * 70) / 8;
      return test(h - sea, Math.hypot(sx, sz), h - ring);
    });
  }

  /**
   * The sites round (x, z) out to `r` that are worked out already, working
   * out `budget` more of the squares (nearest first) as it goes: for the
   * map, which fills in over a moment. { sites, more }
   */
  survey(x, z, r, budget = 6) {
    const sites = [], todo = [];
    for (const kind of LANDMARK_KINDS) {
      const C = LANDMARKS[kind].cell;
      for (let k = Math.floor((z - r) / C); k <= Math.floor((z + r) / C); k++) {
        for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) {
          if (!this.known(kind, i, k)) todo.push([kind, i, k, Math.hypot((i + 0.5) * C - x, (k + 0.5) * C - z)]);
          else {
            const s = this.site(kind, i, k);
            if (s && Math.abs(s.x - x) <= r && Math.abs(s.z - z) <= r) sites.push(s);
          }
        }
      }
    }
    todo.sort((a, b) => a[3] - b[3]);
    for (const [kind, i, k] of todo.slice(0, budget)) {
      const s = this.site(kind, i, k);
      if (s) sites.push(s);
    }
    return { sites, more: todo.length > budget };
  }

  /** Every site within `r` of (x, z). */
  near(x, z, r) {
    const out = [];
    for (const kind of LANDMARK_KINDS) {
      const C = LANDMARKS[kind].cell;
      for (let k = Math.floor((z - r) / C); k <= Math.floor((z + r) / C); k++) {
        for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) {
          const s = this.site(kind, i, k);
          if (s && Math.abs(s.x - x) <= r && Math.abs(s.z - z) <= r) out.push(s);
        }
      }
    }
    return out;
  }

  /**
   * A site's pools (its hollows): the lake or pit of a basin kind, or the
   * cascades' chain of them. Each { x, z, r, d, steep, dry, rough, level }
   * (`level`: its water, the lowest of its rim a little under), worked out
   * once from the land as it is before they're dug.
   */
  poolsOf(s) {
    if (s.pools) return s.pools;
    const L = LANDMARKS[s.kind];
    if (L.basin) {
      s.pools = [{ x: s.x, z: s.z, ...L.basin, seed: s.seed }];
      // (A dry pit no deeper than keeps its floor above the sea's level.)
      if (L.basin.dry) s.pools[0].d = Math.min(L.basin.d, this.#probe((H) => H(s.x, s.z)) - (this.g.rivers?.seaLevel ?? 2) - 8);
    } else if (L.cascade) s.pools = this.#cascadePools(s);
    else s.pools = [];
    for (const p of s.pools) if (!p.dry && p.level === undefined) p.level = this.#rimLevel(p);
    // (Each pool's water below the one above it, so it spills down, never back.)
    for (let i = 1; i < s.pools.length; i++) s.pools[i].level = Math.min(s.pools[i].level, s.pools[i - 1].level - 0.8);
    s.extent = Math.max(...s.pools.map((p) => Math.hypot(p.x - s.x, p.z - s.z) + p.r), 0) * 1.15;
    return s.pools;
  }

  // The cascades: a lake on the hillside, then pool after pool down the
  // fall of the land below it, each touching the next, wandering a little.
  #cascadePools(s) {
    return this.#probe((H) => {
      const gx = (H(s.x + 25, s.z) - H(s.x - 25, s.z)) / 50, gz = (H(s.x, s.z + 25) - H(s.x, s.z - 25)) / 50;
      let dir = Math.atan2(-gz, -gx); // (downhill)
      const R = (n) => (Math.sin(s.seed * 0.001 + n * 12.9898) * 43758.5453) % 1;
      const rnd = (n, a, b) => a + (b - a) * Math.abs(R(n));
      const pools = [{ x: s.x, z: s.z, r: 34, d: 5, steep: 0.35, seed: s.seed, lake: true }];
      let prev = pools[0], prevH = H(s.x, s.z);
      for (let i = 1; i <= 10; i++) {
        const r = rnd(i, 10, 17);
        dir += rnd(i + 50, -0.35, 0.35);
        const step = (prev.r + r) * 1.08;
        const x = prev.x + Math.cos(dir) * step, z = prev.z + Math.sin(dir) * step, h = H(x, z);
        if (h > prevH - 0.8) {
          // (Not falling away here: look a little to either side for where it does.)
          let found = null;
          for (const turn of [0.5, -0.5, 0.9, -0.9]) {
            const tx = prev.x + Math.cos(dir + turn) * step, tz = prev.z + Math.sin(dir + turn) * step, th = H(tx, tz);
            if (th < prevH - 0.8) (found = [tx, tz, th]), (dir += turn);
            if (found) break;
          }
          if (!found) break;
          prev = { x: found[0], z: found[1], r, d: 2.6, steep: 0.4, seed: s.seed + i };
          prevH = found[2];
        } else {
          prev = { x, z, r, d: 2.6, steep: 0.4, seed: s.seed + i };
          prevH = h;
        }
        pools.push(prev);
      }
      return pools;
    });
  }

  #rimLevel(p) {
    return this.#probe((H) => {
      let low = Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        low = Math.min(low, H(p.x + Math.cos(a) * p.r * 1.08, p.z + Math.sin(a) * p.r * 1.08));
      }
      return low - 0.5;
    });
  }

  /** A single-hollow site's water level (see poolsOf). */
  levelOf(s) {
    return this.poolsOf(s)[0]?.level;
  }

  /** The sites with hollows whose square (x, z) is in, with their pools. */
  *#hollowsAt(x, z) {
    for (const kind of BASIN_KINDS) {
      const C = LANDMARKS[kind].cell;
      const s = this.site(kind, Math.floor(x / C), Math.floor(z / C));
      if (!s) continue;
      const pools = this.poolsOf(s);
      if (Math.abs(x - s.x) > s.extent || Math.abs(z - s.z) > s.extent) continue;
      yield [s, pools];
    }
  }

  /**
   * How far the land is let down at (x, z) by a landmark's hollow (the
   * sinkhole's pit, a lake's bowl, the cascades' pools): metres, 0 for
   * none. (The sites sit in the middle of their squares, so only the
   * square it's in need be asked.)
   */
  basinAt(x, z, h = null) {
    if (this.busy) return 0;
    let d = 0;
    for (const [, pools] of this.#hollowsAt(x, z)) {
      for (const p of pools) {
        const dx = x - p.x, dz = z - p.z;
        if (Math.abs(dx) > p.r * 1.15 || Math.abs(dz) > p.r * 1.15) continue;
        // (Not quite round: its edge wanders in and out a little.)
        const a = Math.atan2(dz, dx), w = 1 + 0.07 * Math.sin(a * 5 + p.seed) + 0.04 * Math.sin(a * 11 + p.seed * 0.7);
        const r = Math.hypot(dx, dz) / (p.r * w);
        if (r >= 1) continue;
        const t = Math.min(1, Math.max(0, (r - p.steep) / (1 - p.steep)));
        let dip = p.d * (1 - t * t * (3 - 2 * t));
        // (A pit's walls rough: ledges and gullies, buttresses and bays.)
        if (p.rough) dip += p.rough * wob(x, z, p.seed % 100) * Math.sin(Math.min(1, t * 1.15) * Math.PI);
        if (p.dry || h === null) {
          d = Math.max(d, dip);
          continue;
        }
        // (A lake or a pool: dug down to below its water, level from bank to
        // bank; on a slope the uphill side is a cut bank, a cliff.)
        d = Math.max(d, h - Math.min(h, p.level + 0.7 - dip));
      }
    }
    return d;
  }

  /** Whether (x, z), its ground at `h`, is under a landmark's water (no grass, no flowers there). */
  underWater(x, z, h) {
    if (this.busy) return false;
    for (const [, pools] of this.#hollowsAt(x, z)) {
      for (const p of pools) {
        if (p.dry) continue;
        if (Math.hypot(x - p.x, z - p.z) < p.r * 1.1 && h < p.level + 0.25) return true;
      }
    }
    return false;
  }
}
