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
    what: 'A great arch of red rock: from under it the land round about is laid out on your map',
    fits: (w, m) => w.badlands + 0.8 * w.desert + w.blackHills > 0.45 && m < 0.6 },
  crystalLake: { name: 'Crystal Lake', cell: 3000, tries: 14, land: (h, slope, rise) => h > 30 && rise < -1.5 && slope < 0.4, // (in a high bowl among the peaks, where the water gathers)
    basin: { r: 34, d: 7, steep: 0.35 }, what: 'A clear mountain lake ringed with crystals: its water is safe to drink, and crystals lie on its shore',
    fits: (w, m) => m > 0.22 && m < 0.65 && w.desert + w.savanna + w.badlands < 0.2 },
  twinFalls: { name: 'Twin Falls', cell: 3000, land: (h, slope) => h > 10 && slope > 0.3 && slope < 1.1, // (on a steep wooded hillside, for the cliff)
    basin: { r: 15, d: 4, steep: 0.45 }, what: 'Two falls side by side down a cliff into a cold pool: clean water, and the fish there bite fast',
    fits: (w, m, f) => m > 0.28 && f > 0.25 && w.desert + w.savanna < 0.2 },
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
    what: 'The bleached bones of something enormous, and the camp of the hunters who found it: arrows and an old map',
    fits: (w) => w.desert + w.savanna > 0.6 },
  glacierCave: { name: 'The Glacier Cave', cell: 3000, tries: 14, land: (h, slope) => h > 100 && slope > 0.1 && slope < 1.2, // (high up a mountainside, under the snow)
    what: 'A grotto of blue ice high in the mountains: crystals in its walls, and clean meltwater',
    fits: (w, m, f, open, cold) => m > 0.5 && cold > 0.4 },
  hotPools: { name: 'The Hot Pools', cell: 3000, land: (h, slope) => h > 10 && slope > 0.06 && slope < 0.35, // (on a gentle slope, for the terraces to step down)
    basin: { r: 13, d: 2.2, steep: 0.3 }, hot: true, what: 'Steaming pools on white terraces: warm through and heal in them, and scrape up their salts',
    fits: (w, m) => w.volcanic > 0.3 || (m > 0.45 && w.smoky + w.blackHills + w.pine > 0.3) || m > 0.6 },
  eagleSpire: { name: 'Eagle Spire', cell: 2800, tries: 12, land: (h, slope, rise) => h > 15 && rise > 2, // (on a knoll or a ridge, standing up over everything)
    what: 'A lone needle of rock with eagles nesting on top: feathers lie round its foot, and from by it you see far',
    fits: (w, m) => (m > 0.35 && m < 0.85) || w.blackHills > 0.5 || w.badlands > 0.6 },
  greatSinkhole: { name: 'The Great Sinkhole', cell: 3200, land: (h, slope) => h > 8 && slope < 0.12, // (on level limestone country)
    basin: { r: 26, d: 28, steep: 0.82, dry: true }, what: 'The ground fallen away into a deep round pit: bats roost in it, coal shows in its walls',
    fits: (w, m) => w.temperate + w.smoky + w.parkland + w.blackHills > 0.6 && m < 0.35 },
};
export const LANDMARK_KINDS = Object.keys(LANDMARKS);
const BASIN_KINDS = LANDMARK_KINDS.filter((k) => LANDMARKS[k].basin);

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
    if (hash2(i, k, seed) < 0.5) {
      const w = {};
      for (let t = 0; t < (L.tries ?? 6) && !s; t++) {
        const x = (i + 0.15 + 0.7 * hash2(i * 3 + t, k, seed + 1)) * C, z = (k + 0.15 + 0.7 * hash2(i, k * 3 + t, seed + 2)) * C;
        // (The cheap questions first.)
        this.g.getBiomeWeights(x, z, w);
        for (const id of ['temperate', 'parkland', 'smoky', 'redwood', 'badlands', 'desert', 'blackHills', 'savanna', 'wetland', 'volcanic', 'pine']) w[id] ??= 0;
        if ((w.saltFlat ?? 0) > 0.3 || (w.mangrove ?? 0) > 0.3) continue;
        const m = this.g.getMountainness(x, z), f = L.needs?.forest === false ? 0 : this.g.getForestDensity(x, z);
        const open = w.temperate > 0.5 ? 1 - Math.min(1, f * 1.6) : 0;
        const cold = kind === 'glacierCave' ? this.g.getSeasonality(x, z) : 0;
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
   * How far the land is let down at (x, z) by a landmark's hollow (the
   * sinkhole's pit, a lake's bowl): metres, 0 for none. (The sites sit in
   * the middle of their squares, so only the square it's in need be asked.)
   */
  basinAt(x, z, h = null) {
    if (this.busy) return 0;
    let d = 0;
    for (const kind of BASIN_KINDS) {
      const L = LANDMARKS[kind], C = L.cell;
      const s = this.site(kind, Math.floor(x / C), Math.floor(z / C));
      if (!s) continue;
      const b = L.basin, dx = x - s.x, dz = z - s.z;
      if (Math.abs(dx) > b.r * 1.15 || Math.abs(dz) > b.r * 1.15) continue;
      // (Not quite round: its edge wanders in and out a little.)
      const a = Math.atan2(dz, dx), wob = 1 + 0.07 * Math.sin(a * 5 + s.seed) + 0.04 * Math.sin(a * 11 + s.seed * 0.7);
      const r = Math.hypot(dx, dz) / (b.r * wob);
      if (r >= 1) continue;
      const t = Math.min(1, Math.max(0, (r - b.steep) / (1 - b.steep)));
      const dip = b.d * (1 - t * t * (3 - 2 * t));
      if (b.dry || h === null) {
        d = Math.max(d, dip);
        continue;
      }
      // (A lake or a pool: dug down to below its water, level from bank to
      // bank, the water as high as the lowest of its rim lets it stand; on a
      // slope the uphill side is a cut bank, a cliff.)
      const level = this.levelOf(s);
      d = Math.max(d, h - Math.min(h, level + 0.7 - dip));
    }
    return d;
  }

  /**
   * A lake's water level: the lowest of its rim, a little under (worked
   * out once, from the land as it is before the hollow's dug).
   */
  levelOf(s) {
    if (s.level !== undefined) return s.level;
    const b = LANDMARKS[s.kind].basin, g = this.g;
    // (The land's own answers asked for here, mid-way through its working
    // out another point: what it remembers of that point put back after.)
    const lo = this.#probe((H) => {
      let low = Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        low = Math.min(low, H(s.x + Math.cos(a) * b.r * 1.08, s.z + Math.sin(a) * b.r * 1.08));
      }
      return low;
    });
    s.level = lo - 0.5;
    return s.level;
  }
}
