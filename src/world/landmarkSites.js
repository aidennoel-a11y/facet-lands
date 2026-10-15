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
  falls: { name: 'Falls', cell: 170, hidden: true, falls: true, riverWater: true, chance: 1, tries: 6, needs: { forest: false },
    what: '', fits: (w) => (w.cascades ?? 0) > 0.75 },
  // (Nor this: small still ponds lying in the flat ground at the foot of the
  // Cascades' cliffs, lily pads on them, reeds round them.)
  mere: { name: 'Pond', cell: 110, hidden: true, chance: 0.65, tries: 5, riverWater: true, needs: { forest: false }, land: (h, slope, rise) => h > 3 && slope < 0.06 && Math.abs(rise) < 1.5,
    basin: { r: 10, d: 1.8, steep: 0.35 }, what: '', fits: (w) => (w.cascades ?? 0) > 0.85 },
};
export const LANDMARK_KINDS = Object.keys(LANDMARKS);
/** The ones to be found (on the map, an achievement each). */
export const FOUND_KINDS = LANDMARK_KINDS.filter((k) => !LANDMARKS[k].hidden);
const BASIN_KINDS = LANDMARK_KINDS.filter((k) => LANDMARKS[k].basin || LANDMARKS[k].falls);

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

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
      if (s.kind === 'mere') {
        // (Of a size, some 10 to 26 m across; none where the falls' pools or a creek lie.)
        const p = s.pools[0];
        p.r *= 0.5 + ((s.seed % 1000) / 1000) * 0.8;
        p.mere = true;
        s.pools = [];
        s.runs = [];
        s.drops = [];
        s.extent = 0;
        if (!this.#fallsClear(p.x, p.z, p.r + 12) || this.#creekNear(p.x, p.z, p.r + 8)) return s.pools;
        s.pools = [p];
      }
      // (A dry pit no deeper than keeps its floor above the sea's level.)
      if (L.basin.dry) s.pools[0].d = Math.min(L.basin.d, this.#probe((H) => H(s.x, s.z)) - (this.g.rivers?.seaLevel ?? 2) - 8);
    } else if (L.falls) s.pools = this.#fallsPools(s);
    else s.pools = [];
    for (const p of s.pools) if (!p.dry && p.level === undefined) p.level = this.#rimLevel(p);
    s.runs ??= [];
    s.drops ??= [];
    s.extent = Math.max(...s.pools.map((p) => Math.hypot(p.x - s.x, p.z - s.z) + p.r * (p.st ?? 1) * 1.3), ...s.runs.map((q) => Math.max(Math.hypot(q.x0 - s.x, q.z0 - s.z), Math.hypot(q.x1 - s.x, q.z1 - s.z)) + q.w), 0) * 1.15;
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
      // (From where it was put, or spots round about: of the first few
      // that make falls, the one with the most falls and steps down.)
      let best = null, found = 0;
      for (let t = 0; t < 30 && found < 4; t++) {
        const ox = t ? (R() - 0.5) * 190 : 0, oz = t ? (R() - 0.5) * 190 : 0;
        s.runs = [];
        s.drops = [];
        const pools = this.#fallsFrom(H, s, s.x + ox, s.z + oz, R);
        if (!pools.length) continue;
        found++;
        const score = s.drops.length + 1.5 * pools.filter((p) => p.basin).length + R() * 0.5;
        if (!best || score > best.score) best = { pools, runs: s.runs, drops: s.drops, score };
      }
      s.runs = best?.runs ?? [];
      s.drops = best?.drops ?? [];
      return best?.pools ?? [];
    });
    return pools;
  }

  #fallsFrom(H, s, x0, z0, R) {
    const pools = [];
    // (The nearest cliff from there.)
    const edge = this.#edge(H, x0, z0, H(x0, z0), 0, 80, null, 6);
    // (Only a cliff in its own square: never the same one as a neighbour's.)
    const C = LANDMARKS.falls.cell;
    if (!edge || Math.floor(edge.x / C) !== Math.floor(s.x / C) || Math.floor(edge.z / C) !== Math.floor(s.z / C)) return pools;
    // Two or three falls over it side by side, from a lake on the top or a
    // pond each, all pouring into one great pool along its foot...
    const lips = this.#lipsAlong(H, edge, R, 2 + (R() < 0.6 ? 1 : 0) + (R() < 0.25 ? 1 : 0));
    const basin = lips && this.#basinFor(H, s, pools, lips, R);
    if (!basin || !this.#feed(H, s, pools, basin, lips, R)) return [];
    // ...and it spilling on over the next cliff into the next great pool,
    // a fall or two more off the top joining it there, and so on down.
    let from = basin;
    for (let depth = 0; depth < 3; depth++) {
      const e = this.#edge(H, from.x, from.z, from.level + 2, from.r + 2, from.r * (from.st ?? 1) + 160, [lips[0].dx, lips[0].dz, -0.1], 7, 6);
      if (!e) break;
      const more = this.#lipsAlong(H, e, R, 2 + (R() < 0.4 ? 1 : 0));
      const next = more && this.#basinFor(H, s, pools, more, R);
      if (!next) break;
      if (!this.#pour(H, s, from, more[0], next, R, true)) {
        pools.splice(pools.indexOf(next), 1);
        break;
      }
      if (more.length > 1) this.#feed(H, s, pools, next, more.slice(1), R);
      from = next;
    }
    return pools;
  }

  // (Where the face below a lip eases off: the cliff's foot. { t (out from the lip), h, x, z }, or null.)
  #footOf(H, lip) {
    const face = [];
    for (let t = 0; t <= 50; t++) {
      face.push(H(lip.x + lip.dx * t, lip.z + lip.dz * t));
      if (t >= 3 && face[t] < lip.top - 6 && face[t - 3] - face[t] < 2.4) return { t: t - 1.5, h: face[t - 2], x: lip.x + lip.dx * (t - 1.5), z: lip.z + lip.dz * (t - 1.5) };
    }
    return null;
  }

  /**
   * Up to `n` lips along the cliff whose edge is `edge` (it first), well
   * apart, all coming down to its foot at about the same height. Each with
   * its `foot`. Or null.
   */
  #lipsAlong(H, edge, R, n) {
    const foot = this.#footOf(H, edge);
    if (!foot) return null;
    const wide = () => 4 + R() * 8; // (how wide each fall is)
    const lips = [{ ...edge, foot, w: wide() }];
    const offs = [6, 9, 12, 15, 18, 22, 26, 30, 35, -6, -9, -12, -15, -18, -22, -26, -30, -35];
    for (let i = offs.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [offs[i], offs[j]] = [offs[j], offs[i]];
    }
    const px = -edge.dz, pz = edge.dx;
    for (const o of offs) {
      if (lips.length >= n) break;
      const qx = edge.x + px * o - edge.dx * 14, qz = edge.z + pz * o - edge.dz * 14, ref = H(qx, qz);
      if (Math.abs(ref - edge.top) > 6) continue;
      const lip = this.#edge(H, qx, qz, ref, 0, 30, [edge.dx, edge.dz, 0.7], 6);
      const w = wide();
      if (!lip || lips.some((l) => Math.hypot(l.x - lip.x, l.z - lip.z) < (l.w + w) / 2 + 4)) continue;
      const f = this.#footOf(H, lip);
      if (f && Math.abs(f.h - foot.h) < 5) lips.push({ ...lip, foot: f, w });
    }
    return lips;
  }

  /**
   * A great pool along the foot of the cliff under `lips`, drawn out long
   * enough that every one of their falls comes down into it, its back a
   * little in under the foot (never back as far as the top), its water just
   * under the lowest of its bank. Lips it can't take are dropped (from the
   * end). Added to `pools`; or null if there's no room.
   */
  #basinFor(H, s, pools, lips, R) {
    let shrink = 1;
    while (lips.length) {
      let dx = 0, dz = 0, fx = 0, fz = 0;
      for (const l of lips) (dx += l.dx), (dz += l.dz), (fx += l.x), (fz += l.z);
      const dl = Math.hypot(dx, dz) || 1;
      (dx /= dl), (dz /= dl), (fx /= lips.length), (fz /= lips.length);
      const ux = -dz, uz = dx;
      let lo = 0, hi = 0;
      for (const l of lips) {
        const u = (l.x - fx) * ux + (l.z - fz) * uz;
        (lo = Math.min(lo, u)), (hi = Math.max(hi, u));
      }
      // (Big: some 15 to 26 m across the short way, its back reaching in
      // under the cliff's foot no further than the face goes.)
      const b = (21 + R() * 14) * (shrink ?? 1), back = Math.min(...lips.map((l) => Math.max(0, l.foot.t - 0.4))); // (right in to the cliff's face below the lips)
      const a = Math.max(b * 1.2, (hi - lo) / 2 + Math.max(...lips.map((l) => l.w)) * 0.75 + 6), st = a / b, mid = (lo + hi) / 2;
      // (Its back right under the lips, a metre or so out from them: the falls come down into it against the cliff.)
      const gap = 1.2 + b * 0.03;
      const x = fx + ux * mid + dx * (b + gap), z = fz + uz * mid + dz * (b + gap);
      let ok = true;
      let low = Infinity;
      for (let q = 0; q < 24 && ok; q++) {
        const c = Math.cos(q * 0.2618) * a * 1.08, n = Math.sin(q * 0.2618) * b * 1.08;
        low = Math.min(low, H(x + ux * c + dx * n, z + uz * c + dz * n));
      }
      const level = Math.min(low - 0.5, ...lips.map((l) => l.foot.h - 0.3));
      // (Not dug down into a pit, in the middle or at either end: the land round it holds it.)
      const deep = ok ? Math.max(H(x, z), H(x + ux * a * 0.8, z + uz * a * 0.8), H(x - ux * a * 0.8, z - uz * a * 0.8)) : 0;
      // (Nor over another pool at about its height.)
      if (ok && this.g.bigRivers?.waterAt(x, z, a + 10)) ok = false; // (nor in a great river)
      // (Where it would run into another pool: one at about its height, they
      // join as one sheet of water at the same level; otherwise, no.)
      let lvl = level;
      const join = [];
      for (const p of pools) {
        if (!ok || Math.hypot(p.x - x, p.z - z) > p.r * (p.st ?? 1) + a * 0.9 + 6) continue;
        if (Math.abs(p.level - level) < 2.5) (lvl = Math.min(lvl, p.level)), join.push(p);
        else ok = false;
      }
      // (One sheet of water: a pool it joins that stands higher comes down to
      // the shared level too, the falls into it landing there; but not one a
      // fall already pours out of, its lip left high and dry.)
      if (ok && join.some((p) => p.level > lvl + 0.01 && s.drops.some((q) => Math.abs(q.top - p.level) < 0.01 && Math.hypot(q.x - p.x, q.z - p.z) < p.r * (p.st ?? 1) + 50))) ok = false;
      const settle = () => {
        for (const p of join) {
          if (p.level <= lvl + 0.01) continue;
          for (const q of s.drops) {
            if (Math.abs(q.bottom - p.level) > 0.01 || Math.hypot(q.ix - p.x, q.iz - p.z) > p.r * (p.st ?? 1) * 1.4) continue;
            const t = q.top - 0.05, f = (t - lvl) / Math.max(0.01, t - q.bottom);
            for (const pt of q.prof) if (pt[1] < t) pt[1] = t - (t - pt[1]) * f;
            q.bottom = lvl;
          }
          p.level = lvl;
        }
      };
      // (Nor any creek running through it.)
      if (ok && this.#creekNear(x, z, a + 10)) ok = false;
      if (ok && level >= deep - 4 && lips.every((l) => l.top - level >= 7)) {
        const p = { x, z, r: b, st, ux, uz, d: 3 + b * 0.06, steep: 0.5, seed: s.seed + pools.length * 7919, level: lvl, basin: true };
        settle();
        pools.push(p);
        return p;
      }
      // (Smaller, if there's not room; then without the furthest fall.)
      if ((shrink ?? 1) > 0.5) shrink = (shrink ?? 1) * 0.8;
      else (lips.pop(), (shrink = 1));
    }
    return null;
  }

  /**
   * The falls over `lips` into `basin`: each from a pond of its own set
   * back on the top, or all from one lake there, or (where there's one
   * close already) from that, through another notch. How many were made.
   */
  #feed(H, s, pools, basin, lips, R) {
    let made = 0;
    const pond = (x, z, r) => {
      let low = Infinity;
      for (let q = 0; q < 16; q++) low = Math.min(low, H(x + Math.cos(q * 0.3927) * r * 1.1, z + Math.sin(q * 0.3927) * r * 1.1));
      const level = low - 0.6;
      if (pools.some((p) => Math.abs(p.level - level) < 5 && Math.hypot(p.x - x, p.z - z) < p.r * (p.st ?? 1) + r + 2)) return null;
      if (level < H(x, z) - 4.5 || level < basin.level + 6) return null; // (on a fairly level top, well above the pool)
      if (this.#creekNear(x, z, r + 10)) return null; // (no creek running through it)
      const p = { x, z, r, d: 2 + r * 0.06, steep: 0.35, seed: s.seed + pools.length * 7919, level, source: true };
      pools.push(p);
      return p;
    };
    if (lips.length >= 2 && R() < 0.8) {
      // One lake on the top, spilling through a notch to each fall.
      let mx = 0, mz = 0, dx = 0, dz = 0;
      for (const l of lips) (mx += l.x / lips.length), (mz += l.z / lips.length), (dx += l.dx), (dz += l.dz);
      const dl = Math.hypot(dx, dz) || 1;
      const rl = Math.min(45, Math.max(15 + R() * 14, Math.max(...lips.map((l) => Math.hypot(l.x - mx, l.z - mz) + l.w / 2)) * 0.9));
      const lake = pond(mx - (dx / dl) * (rl + 6), mz - (dz / dl) * (rl + 6), rl);
      if (lake) for (const lip of lips) if (this.#pour(H, s, lake, lip, basin, R, false)) made++;
      if (made) return made;
      if (lake) pools.splice(pools.indexOf(lake), 1);
    }
    for (const lip of lips) {
      const near = pools.find((p) => p.source && Math.abs(p.level - lip.top) < 4 && Math.hypot(p.x - lip.x, p.z - lip.z) < p.r + 30);
      const r = Math.max(11 + R() * 12, lip.w * 0.9);
      const p = near ?? pond(lip.x - lip.dx * (r + 4), lip.z - lip.dz * (r + 4), r);
      if (!p) continue;
      if (this.#pour(H, s, p, lip, basin, R, false)) made++;
      else if (!near) pools.splice(pools.indexOf(p), 1);
    }
    return made;
  }

  /**
   * The water from pool `from` through a notch in its bank to the lip at
   * `edge`, and over it in a fall down the face into pool `to` (it must
   * land in it). Whether it could.
   */
  #pour(H, s, from, edge, to, R, outlet) {
    const level = from.level, { dx, dz } = edge;
    if (level - to.level < 5) return false;
    const face = [];
    for (let t = 0; t <= 40; t += 0.5) face.push(H(edge.x + dx * t, edge.z + dz * t));
    // The fall: from the lip, thrown out a little in a short arc, straight
    // down into the pool. It must fall clear of the rock all the way (the
    // face as it'll be, the pool dug in under it) and come down in the
    // pool; if it can't, now and then (one fall in four or so) the lip
    // runs out over the water on a shelf, up to 6 m, and it leaps from the
    // end of that; otherwise there's no fall here. Never bent out or
    // carried along a bench to meet the water.
    for (let q = 0; q < face.length; q++) {
      const fx = edge.x + dx * q * 0.5, fz = edge.z + dz * q * 0.5;
      if (LandmarkSites.ell(to, fx, fz)[0] < to.r * 0.95) face[q] = Math.min(face[q], to.level - 0.5);
    }
    const faceAt = (o) => face[Math.min(face.length - 1, Math.max(0, Math.round(o * 2)))];
    const arc = (j, k = 2.2) => {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const v = i / 14, y = level - 0.05 - v * (level - 0.05 - to.level);
        const o = j + 0.4 + k * Math.sqrt(v);
        // (Where the rock stands in its way, the water has worn it back into an alcove: see basinAt.)
        pts.push([o, y]);
      }
      const [o] = pts[pts.length - 1];
      const [ld, la] = LandmarkSites.ell(to, edge.x + dx * o, edge.z + dz * o);
      return ld < to.r * LandmarkSites.wob(to, la) * 0.96 ? pts : null;
    };
    // (Thrown out as far as a fall that size would be, a few metres at most, to come down in the water.)
    let prof = null, ledge = 0;
    for (const k of [2.2, 3, 3.8, 4.6]) if (!prof) prof = arc(0, k);
    // (Now and then the lip overhangs the pool on a shelf of rock anyway, where one would land in it.)
    if (prof && R() < 0.2) {
      for (let j = 1.5; j <= 3; j += 0.5) {
        const p2 = arc(j);
        if (p2) (prof = p2), (ledge = j);
        if (p2) break;
      }
    } else if (!prof && R() < 0.3) {
      for (let j = 1.5; j <= 3 && !prof; j += 0.5) if ((prof = arc(j))) ledge = j;
    }
    if (!prof) return false;
    let out = prof[prof.length - 1][0];
    // (And it starts back in the notch, at its water: no seam at the lip.)
    prof.unshift([ledge - 1.4, level + 0.03], [ledge - 0.3, level + 0.01]); // (rolling smoothly over the edge)
    const ix = edge.x + dx * out, iz = edge.z + dz * out;
    const w = Math.min(edge.w ?? 6, from.r * (from.st ?? 1) * 1.4) * (outlet ? 1.2 : 1);
    // (Never one fall over another: each with room of its own along the cliff.)
    if (s.drops.some((o) => Math.hypot(o.x - edge.x, o.z - edge.z) < (o.w + w) / 2 + 4 || Math.hypot(o.ix - ix, o.iz - iz) < (o.w + w) / 2 + 3)) return false;
    // (The notch: from inside the pool, out to the lip.)
    const ax = edge.x - from.x, az = edge.z - from.z, al = Math.hypot(ax, az) || 1;
    const start = Math.max(0, Math.min(al - 2, from.r * 0.7));
    // (Its water must reach the lip plainly: the lip about at the pool's
    // water, a short notch, never a deep cut through a ridge.)
    if (edge.top - level > (outlet ? 6 : 3) || al - start > (outlet ? 45 : 18)) return false;
    for (let k = 1; k < 8; k++) {
      const f = start + ((al - start) * k) / 8;
      if (H(from.x + (ax / al) * f, from.z + (az / al) * f) > level + (outlet ? 6 : 3.5)) return false; // (a creek's channel cut down through any rise)
    }
    s.runs.push({ x0: from.x + (ax / al) * start, z0: from.z + (az / al) * start, x1: edge.x + dx * (ledge + 0.3), z1: edge.z + dz * (ledge + 0.3), w, level, cut: ledge ? 0 : 3 });
    s.drops.push({ x: edge.x, z: edge.z, dx, dz, w, prof, top: level, bottom: to.level, ix, iz, ledge });
    return true;
  }

  /**
   * The nearest cliff edge from (x, z), going out `d0` to `d1` m, on ground
   * about as high as `ref` (the same tier): where the land just past it
   * has dropped 8 m or more. `aim` [dx, dz, cos]: only the ways within
   * that of it. { x, z (the lip), dx, dz, top }, or null.
   */
  #edge(H, x, z, ref, d0, d1, aim, tol = 4, drop = 8) {
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
        if (Math.abs(h - ref) > tol) break; // (off this tier: up a cliff, or down one too soon)
        if (h - hs[i] > drop) {
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

  /** How far out a pool's edge lies that way (times its radius): lobed and uneven, like a lake's. */
  static wob(p, a) {
    const k = p.seed % 97;
    // (A great pool's side under the cliff runs straight along it; its open side wanders in lobes.)
    const amp = p.basin ? smoothstep(-0.5, 0.3, -Math.sin(a)) : 1;
    return 1 + amp * 0.13 * Math.sin(a * 2 + k) + amp * (0.08 * Math.sin(a * 3 + k * 1.7) + 0.05 * Math.sin(a * 5 + p.seed) + 0.03 * Math.sin(a * 11 + p.seed * 0.7));
  }

  // (Whether no falls' pool or notch lies within `r` of (x, z).)
  #fallsClear(x, z, r) {
    const C = LANDMARKS.falls.cell;
    for (let k = Math.floor((z - r) / C) - 1; k <= Math.floor((z + r) / C) + 1; k++) {
      for (let i = Math.floor((x - r) / C) - 1; i <= Math.floor((x + r) / C) + 1; i++) {
        const f = this.site('falls', i, k);
        if (!f) continue;
        for (const p of this.poolsOf(f)) if (Math.hypot(p.x - x, p.z - z) < p.r * (p.st ?? 1) * 1.3 + r) return false;
        for (const q of f.runs) if (LandmarkSites.#along(q, x, z) < q.w + r) return false;
      }
    }
    return true;
  }

  // (Whether a creek or river runs within `r` of (x, z).)
  #creekNear(x, z, r) {
    for (const c of this.g.rivers?.inBox(x - r, z - r, x + r, z + r) ?? []) {
      for (const q of c.points ?? []) if (Math.abs(q.x - x) < r && Math.abs(q.z - z) < r && Math.hypot(q.x - x, q.z - z) < r) return true;
    }
    return false;
  }

  /**
   * How far (x, z) is from a pool's middle, and which way: for one drawn
   * out long (`st` times as long along { ux, uz } as across), in metres
   * across it, as if it were round. [distance, angle]
   */
  static ell(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    if (!p.st) return [Math.hypot(dx, dz), Math.atan2(dz, dx)];
    const u = (dx * p.ux + dz * p.uz) / p.st, v = -dx * p.uz + dz * p.ux;
    return [Math.hypot(u, v), Math.atan2(v, u)];
  }

  // (How far (x, z) is from a run's middle line.)
  static #along(q, x, z) {
    const ux = q.x1 - q.x0, uz = q.z1 - q.z0, L2 = ux * ux + uz * uz || 1;
    const t = Math.min(1, Math.max(0, ((x - q.x0) * ux + (z - q.z0) * uz) / L2));
    return Math.hypot(x - q.x0 - ux * t, z - q.z0 - uz * t);
  }

  /**
   * The falls' water at (x, z), out to `margin` past its edge, as the
   * rivers have theirs (see Rivers.waterAt): their pools still and clear
   * (churned white where a fall comes down), their notches running quick
   * to the lip. Or null.
   */
  fallsWater(x, z, margin = 0) {
    if (this.busy) return null;
    let best = null;
    for (const [s, pools] of this.#hollowsAt(x, z)) {
      if (!LANDMARKS[s.kind].riverWater) continue;
      for (const p of pools) {
        const dx = x - p.x, dz = z - p.z;
        if (Math.abs(dx) > p.r * (p.st ?? 1) * 1.35 + margin || Math.abs(dz) > p.r * (p.st ?? 1) * 1.35 + margin) continue;
        const [d, a] = LandmarkSites.ell(p, x, z), half = p.r * LandmarkSites.wob(p, a);
        if (d > half + margin) continue;
        // (White where a fall lands, and rings of ripples running out from
        // it across the pool, dying away.)
        let foam = 0, di = Infinity, R = 1;
        for (const q of s.drops) {
          if (Math.abs(q.bottom - p.level) > 0.01) continue;
          const dq = Math.hypot(x - q.ix, z - q.iz);
          foam = Math.max(foam, 1 - Math.min(1, dq / (q.w * 0.9 + 1.5)));
          if (dq < di) (di = dq), (R = q.w * 2 + 16);
        }
        const ripple = di < R;
        const w = { level: p.level, fx: 0, fz: 0, drop: 0.25 + 0.5 * foam * foam, along: ripple ? di : d, across: ripple ? 0.5 + 0.48 * smoothstep(0.25 * R, R, di) : d / half, inset: half - d, half, pond: true, tint: 1, ripple };
        if (!best || w.inset > best.inset) best = w;
      }
      for (const q of s.runs) {
        const ux = q.x1 - q.x0, uz = q.z1 - q.z0, L = Math.hypot(ux, uz) || 1;
        const raw = ((x - q.x0) * ux + (z - q.z0) * uz) / (L * L), t = Math.min(1, Math.max(0, raw));
        if (raw * L > L + 0.2) continue; // (none out past the lip: there it's the fall)
        const d = Math.hypot(x - q.x0 - ux * t, z - q.z0 - uz * t), half = q.w / 2;
        if (d > half + margin) continue;
        // (Quickening as it nears the lip.)
        const drop = 0.1 + 0.25 * Math.min(1, Math.max(0, (t * L - L + 4) / 4));
        const speed = 0.6 + drop * 6;
        const w = { level: q.level, fx: (ux / L) * speed, fz: (uz / L) * speed, drop, along: t * L, across: d / half, inset: half - d, half, pond: false, tint: 0 };
        if (!best || w.inset > best.inset) best = w;
      }
    }
    return best;
  }

  /** Whether any of the falls' water may lie in the box (for drawing it). */
  fallsInBox(x0, z0, x1, z1) {
    for (const kind of ['falls', 'mere']) {
      const C = LANDMARKS[kind].cell;
      for (let k = Math.floor(z0 / C) - 1; k <= Math.floor(z1 / C) + 1; k++) {
        for (let i = Math.floor(x0 / C) - 1; i <= Math.floor(x1 / C) + 1; i++) {
          const s = this.site(kind, i, k);
          if (!s || !this.poolsOf(s).length) continue;
          if (s.x + s.extent > x0 && s.x - s.extent < x1 && s.z + s.extent > z0 && s.z - s.extent < z1) return true;
        }
      }
    }
    return false;
  }

  /** The falls (drops) whose lip lies in the box. */
  dropsIn(x0, z0, x1, z1) {
    const out = [], C = LANDMARKS.falls.cell;
    for (let k = Math.floor(z0 / C) - 1; k <= Math.floor(z1 / C) + 1; k++) {
      for (let i = Math.floor(x0 / C) - 1; i <= Math.floor(x1 / C) + 1; i++) {
        const s = this.site('falls', i, k);
        if (!s || !this.poolsOf(s).length) continue;
        for (const d of s.drops) if (d.x >= x0 && d.x < x1 && d.z >= z0 && d.z < z1) out.push(d);
      }
    }
    return out;
  }

  /** Whether (x, z) is within `margin` of the falls' water (no trees growing there). */
  nearFalls(x, z, margin = 2) {
    if (this.busy) return false;
    for (const [s, pools] of this.#hollowsAt(x, z)) {
      if (!LANDMARKS[s.kind].riverWater) continue;
      for (const p of pools) { const [d, a] = LandmarkSites.ell(p, x, z); if (d < p.r * LandmarkSites.wob(p, a) * 1.05 + margin) return true; }
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
      // (A fall's shelf: the cliff's top running out over its pool in a
      // spur, the water's channel down the middle of it between banks,
      // its end and sides dropping sheer. The land itself, built up.)
      if (h !== null) {
        for (const q of s.drops ?? []) {
          if (!q.ledge) continue;
          const ox = x - q.x, oz = z - q.z, t = ox * q.dx + oz * q.dz, u = Math.abs(-ox * q.dz + oz * q.dx);
          if (t < -1 || t > q.ledge + 0.4 || u > q.w / 2 + 3) continue;
          const bank = q.top + 0.8 + 0.4 * Math.sin(t * 0.9 + u);
          return h - (u < q.w / 2 ? q.top - 0.7 : bank - Math.max(0, u - q.w / 2 - 2) * 0.6);
        }
      }
      // (Behind each fall, the alcove it has worn into the cliff: the rock
      // cut back to just behind the falling water, all the way down.)
      if (h !== null) {
        for (const q of s.drops ?? []) {
          const ox = x - q.x, oz = z - q.z, t = ox * q.dx + oz * q.dz, u = Math.abs(-ox * q.dz + oz * q.dx);
          const t0 = (q.ledge ?? 0) + 0.4, t1 = q.prof[q.prof.length - 1][0];
          if (t < t0 || t > t1 + 0.5 || u > q.w / 2 + 1.2) continue;
          // (The water's height where it's that far out.)
          let y = q.bottom;
          for (let i = 1; i < q.prof.length; i++) {
            const [o0, y0] = q.prof[i - 1], [o1, y1] = q.prof[i];
            if (t <= o1 && o1 > o0) { y = y0 + ((t - o0) / (o1 - o0)) * (y1 - y0); break; }
          }
          const cut = y - 1.2 - Math.max(0, u - q.w / 2) * 0.8;
          if (h > cut) d = Math.max(d, h - cut);
        }
      }
      // (The falls' notches: a channel through the bank, its bed under the water, its sides sloping up.)
      if (s.runs?.length && h !== null) {
        for (const q of s.runs) {
          // (Cut on a little way past the lip, so no lip of land stands up between the water and the fall.)
          const L = Math.hypot(q.x1 - q.x0, q.z1 - q.z0) || 1, k = (L + (q.cut ?? 0)) / L;
          const e = LandmarkSites.#along({ x0: q.x0, z0: q.z0, x1: q.x0 + (q.x1 - q.x0) * k, z1: q.z0 + (q.z1 - q.z0) * k }, x, z) - q.w / 2;
          if (e > 4) continue;
          d = Math.max(d, h - Math.min(h, q.level - 0.7 + Math.max(0, e) * 1.3));
        }
      }
      for (const p of pools) {
        const dx = x - p.x, dz = z - p.z;
        if (Math.abs(dx) > p.r * (p.st ?? 1) * 1.35 || Math.abs(dz) > p.r * (p.st ?? 1) * 1.35) continue;
        // (Not quite round: its edge wanders in and out a little.)
        const [dd, a] = LandmarkSites.ell(p, x, z), w = LandmarkSites.wob(p, a);
        const r = dd / (p.r * w);
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
        if (h < p.level + 0.25) { const [d, a] = LandmarkSites.ell(p, x, z); if (d < p.r * LandmarkSites.wob(p, a) * 1.05) return true; }
      }
    }
    return false;
  }
}
