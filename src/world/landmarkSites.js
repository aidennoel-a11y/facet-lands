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
  // (Not a landmark to find: the falls of the Cascades. On a cliff top a
  // pond, spilling through a notch in its bank over the edge in a fall
  // into a pool at the cliff's foot, and that pool on over the next cliff
  // into the next, and so on down; a big lake at the top spilling over
  // two edges. One to a square or so, all over the Cascades: see fallsPools.)
  falls: { name: 'Falls', cell: 200, hidden: true, falls: true, chance: 0.9, tries: 3, needs: { forest: false },
    what: '', fits: (w) => (w.cascades ?? 0) > 0.75 },
};
export const LANDMARK_KINDS = Object.keys(LANDMARKS);
/** The ones to be found (on the map, an achievement each). */
export const FOUND_KINDS = LANDMARK_KINDS.filter((k) => !LANDMARKS[k].hidden);
const BASIN_KINDS = LANDMARK_KINDS.filter((k) => LANDMARKS[k].basin || LANDMARKS[k].falls);

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
        for (const id of ['temperate', 'parkland', 'cascades', 'smoky', 'redwood', 'badlands', 'desert', 'blackHills', 'savanna', 'wetland', 'volcanic', 'pine']) w[id] ??= 0;
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
    } else if (L.falls) s.pools = this.#fallsPools(s);
    else s.pools = [];
    for (const p of s.pools) if (!p.dry && p.level === undefined) p.level = this.#rimLevel(p);
    s.runs ??= [];
    s.drops ??= [];
    s.extent = Math.max(...s.pools.map((p) => Math.hypot(p.x - s.x, p.z - s.z) + p.r), ...s.runs.map((q) => Math.max(Math.hypot(q.x0 - s.x, q.z0 - s.z), Math.hypot(q.x1 - s.x, q.z1 - s.z)) + q.w), 0) * 1.15;
    return s.pools;
  }

  /**
   * The falls (see LANDMARKS.falls): their pools (the pond at the top
   * first), and on the site `runs` (the notch from a pool to the cliff's
   * edge: { x0, z0, x1, z1, w, level }) and `drops` (the falls: from the
   * lip at { x, z }, outwards along { dx, dz }, `prof` [out, height] down
   * the face to the pool below, `w` wide).
   */
  #fallsPools(s) {
    s.runs = [];
    s.drops = [];
    let st = s.seed >>> 0;
    const R = () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296;
    const pools = this.#probe((H) => {
      // (From where it was put, or failing that a few spots round about.)
      for (let t = 0; t < 5; t++) {
        const ox = t ? (R() - 0.5) * 160 : 0, oz = t ? (R() - 0.5) * 160 : 0;
        const pools = this.#fallsFrom(H, s, s.x + ox, s.z + oz, R);
        if (pools.length) return pools;
        s.runs = [];
        s.drops = [];
      }
      return [];
    });
    return pools;
  }

  #fallsFrom(H, s, x0, z0, R) {
    {
      const pools = [];
      // (The nearest edge from there: a cliff's top.)
      const edge = this.#edge(H, x0, z0, H(x0, z0), 0, 80, null);
      if (!edge) return pools;
      // The pond: set back from the edge on the level top, dug a little
      // into it, its water just under the lowest of its bank.
      const big = R() < 0.3, r = big ? 15 + R() * 10 : 7 + R() * 6;
      const sx = edge.x - edge.dx * (r + 5), sz = edge.z - edge.dz * (r + 5);
      let low = Infinity;
      for (let k = 0; k < 16; k++) low = Math.min(low, H(sx + Math.cos(k * 0.3927) * r * 1.1, sz + Math.sin(k * 0.3927) * r * 1.1));
      if (low < edge.top - 3.5 || H(sx, sz) > edge.top + 4) return pools; // (not on a level top)
      const src = { x: sx, z: sz, r, d: 2 + r * 0.06, steep: 0.35, seed: s.seed, level: low - 0.6, source: true };
      pools.push(src);
      this.#fall(H, s, pools, src, edge, R, 0);
      // (A big lake spills over a second edge too, if there's one near.)
      if (big) {
        const e2 = this.#edge(H, sx, sz, low, r + 2, r + 70, [-edge.dx, -edge.dz, -0.2]);
        if (e2) this.#fall(H, s, pools, src, e2, R, 0);
      }
      // (A pond that goes nowhere isn't kept: every one here is a fall's source.)
      return s.drops.length ? pools : [];
    }
  }

  /**
   * The nearest cliff edge from (x, z), going out `d0` to `d1` m, on ground
   * about as high as `ref` (the same tier): where the land just past it
   * has dropped 8 m or more. `aim` [dx, dz, cos]: only the ways within
   * that of it. { x, z (the lip), dx, dz, top }, or null.
   */
  #edge(H, x, z, ref, d0, d1, aim) {
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.1, dx = Math.cos(a), dz = Math.sin(a);
      if (aim && dx * aim[0] + dz * aim[1] < aim[2]) continue;
      const hs = [];
      for (let d = d0, i = 0; d <= d1 + 9; d += 3, i++) {
        hs.push(H(x + dx * d, z + dz * d));
        if (i < 3) continue;
        const j = i - 3, h = hs[j], dj = d0 + j * 3;
        if (best && dj >= best.d) break;
        if (Math.abs(h - ref) > 4) break; // (off this tier: up a cliff, or down one too soon)
        if (h - hs[i] > 8) {
          // (The lip: where it starts to drop.)
          let t = dj;
          while (t < dj + 9 && H(x + dx * (t + 1), z + dz * (t + 1)) > h - 1.2) t++;
          best = { x: x + dx * t, z: z + dz * t, dx, dz, top: h, d: dj };
          break;
        }
      }
    }
    return best;
  }

  /** A fall over `edge` from the pool `from`, into a pool at the cliff's foot; and on from that over the next edge, if there's one. */
  #fall(H, s, pools, from, edge, R, depth) {
    const level = from.level, { dx, dz } = edge;
    // The foot of the cliff (where the face eases off), and the face's line down to it.
    const face = [];
    let foot = null;
    for (let t = 0; t <= 50; t += 1) {
      const h = H(edge.x + dx * t, edge.z + dz * t);
      face.push(h);
      if (t >= 3 && !foot && h < level - 5 && face[t - 3] - h < 2.4) foot = { t: t - 1.5, h: face[t - 2] };
      if (foot && t > foot.t + 14) break;
    }
    if (!foot) return;
    const fx = edge.x + dx * foot.t, fz = edge.z + dz * foot.t;
    // The pool there: its back under the foot of the fall, its water the
    // lowest of its bank less a little.
    const r2 = Math.min(12, Math.max(5, (level - foot.h) * 0.32)) + R() * 2;
    const bx = fx + dx * r2 * 0.45, bz = fz + dz * r2 * 0.45;
    let low = Infinity;
    for (let k = 0; k < 16; k++) low = Math.min(low, H(bx + Math.cos(k * 0.3927) * r2 * 1.08, bz + Math.sin(k * 0.3927) * r2 * 1.08));
    const l2 = Math.min(low - 0.5, foot.h - 0.3);
    if (level - l2 < 6) return; // (not much of a fall)
    if (pools.some((p) => Math.hypot(p.x - bx, p.z - bz) < p.r + r2 * 0.8)) return;
    const w = Math.min(from.r * 0.7, 2.4 + R() * 2.2 + (from.source ? from.r * 0.06 : 0));
    const pool = { x: bx, z: bz, r: r2, d: 2.6, steep: 0.45, seed: s.seed + pools.length * 7919, level: l2 };
    pools.push(pool);
    // The notch from the pool through its bank to the lip, its water the pool's.
    s.runs.push({ x0: from.x + dx * from.r * 0.75, z0: from.z + dz * from.r * 0.75, x1: edge.x + dx * 0.6, z1: edge.z + dz * 0.6, w, level });
    // The fall: from the lip, out over the rock (as far as the water's
    // thrown, or the rock juts), down into the pool.
    const prof = [];
    let out = 0;
    for (let i = 0; i <= 12; i++) {
      const v = i / 12, y = level - v * (level - l2);
      let t = 0.3 + 1.8 * Math.sqrt(v);
      for (let q = 0; q < face.length; q++) if (face[q] < y - 0.4) { t = Math.max(t, q + 0.7); break; }
      out = Math.max(out, t);
      prof.push([out, y]);
    }
    s.drops.push({ x: edge.x, z: edge.z, dx, dz, w: w * (1 + R() * 0.6), prof, top: level, bottom: l2, pool: pools.length - 1 });
    // And on down: over the next edge on from this pool, if there's one.
    if (depth < 4) {
      const e = this.#edge(H, bx, bz, l2 + 0.8, r2 + 2, r2 + 60, [dx, dz, 0.25]);
      if (e) this.#fall(H, s, pools, pool, e, R, depth + 1);
    }
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
      const C = LANDMARKS[kind].cell, ci = Math.floor(x / C), ck = Math.floor(z / C);
      // (The falls run on out of their squares: the ones round about asked too.)
      const n = LANDMARKS[kind].falls ? 1 : 0;
      for (let k = ck - n; k <= ck + n; k++) {
        for (let i = ci - n; i <= ci + n; i++) {
          const s = this.site(kind, i, k);
          if (!s) continue;
          const pools = this.poolsOf(s);
          if (Math.abs(x - s.x) > s.extent || Math.abs(z - s.z) > s.extent) continue;
          yield [s, pools];
        }
      }
    }
  }

  // (How far (x, z) is from a run's middle line.)
  static #along(q, x, z) {
    const ux = q.x1 - q.x0, uz = q.z1 - q.z0, L2 = ux * ux + uz * uz || 1;
    const t = Math.min(1, Math.max(0, ((x - q.x0) * ux + (z - q.z0) * uz) / L2));
    return Math.hypot(x - q.x0 - ux * t, z - q.z0 - uz * t);
  }

  /** Whether (x, z) is within `margin` of the falls' water (no trees growing there). */
  nearFalls(x, z, margin = 2) {
    if (this.busy) return false;
    for (const [s, pools] of this.#hollowsAt(x, z)) {
      if (s.kind !== 'falls') continue;
      for (const p of pools) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.12 + margin) return true;
      for (const q of s.runs) if (LandmarkSites.#along(q, x, z) < q.w / 2 + margin) return true;
    }
    return false;
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
    for (const [s, pools] of this.#hollowsAt(x, z)) {
      // (The falls' notches: a channel through the bank, its bed under the water, its sides sloping up.)
      if (s.runs?.length && h !== null) {
        for (const q of s.runs) {
          const e = LandmarkSites.#along(q, x, z) - q.w / 2;
          if (e > 4) continue;
          d = Math.max(d, h - Math.min(h, q.level - 0.7 + Math.max(0, e) * 1.3));
        }
      }
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
    for (const [s, pools] of this.#hollowsAt(x, z)) {
      for (const q of s.runs ?? []) if (h < q.level + 0.2 && LandmarkSites.#along(q, x, z) < q.w / 2) return true;
      for (const p of pools) {
        if (p.dry) continue;
        if (Math.hypot(x - p.x, z - p.z) < p.r * 1.1 && h < p.level + 0.25) return true;
      }
    }
    return false;
  }
}
