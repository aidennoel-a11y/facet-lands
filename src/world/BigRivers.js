import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../noise/random.js';
import { easeBends } from './bends.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The lower of a and b, rounded off over `k` where they meet. */
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const REGION = 8500; // at most one river rises in each region this size
const SOURCE = 0.25; // it rises within this fraction of the region's size from its middle
const CHANCE = 1; // how many regions try for one (most find a way to the water)
const STEP = 48; // metres between a river's points
const MAX_STEPS = 330; // at most ~16 km long, so a river (and its valley) never reaches past the regions two out from its own (see #shape)
const REACH = 2; // regions out from a point whose rivers can reach it (see #ensure)
const MIN_LENGTH = 1500;
const CELL = 256; // spatial index cell (m)
const VALLEY = 650; // how far out past its flood plain a river's valley reaches (m)
const JOIN = 260; // a river coming this close to a bigger one runs into it
const GRID = 128; // spacing of the broad land's remembered grid (m: it's smooth)
const LOW = 15; // open water is looked for only where the broad land (see #land) lies less than this above the sea
const LAKE_CLEAR = 8; // a river that would come to a lake rises this many points (STEP apart) beyond it instead
const BEND = (20 * Math.PI) / 180; // the most it turns at any one point (STEP apart): bends some 350 m round, or wider

/**
 * Rivers: great slow rivers, some forty to over a hundred metres across,
 * ten times a creek. Few of them (at most one to an 8.5 km region), each
 * rising from a lake in the hills, the Smoky Mountains or up in the ranges, and winding down the
 * broadest, lowest ground it can find, the way real rivers keep to the
 * floors of the great valleys, until it reaches a lake or the sea. A river
 * that comes near another joins it; creeks and mountain streams run into
 * them (see Rivers).
 *
 * They're traced over the broad lie of the land (TerrainGenerator.
 * broadHeight: the continent and the ranges, without the hills), looking a
 * few hundred metres ahead for the lowest way on, so they follow the
 * valleys; then the land is carved to match: a deep channel, low banks, a
 * broad flat flood plain and the valley's sides curving up to meet the
 * land round about. Its water only ever falls, so where the land rises
 * across its course it cuts down through it.
 *
 * Deterministic region by region: a river's course depends only on its
 * own region and, where it joins another, on rivers of lower rank near it.
 */
export class BigRivers {
  constructor(generator, { seaLevel }) {
    this.generator = generator;
    this.seaLevel = seaLevel;
    this.seed = generator.seed ^ 0x1b873593;
    this.wiggle = new SimplexNoise(this.seed);
    this.raws = new Map(); // region -> raw course (or null)
    this.finals = new Map(); // region -> finished river (or null)
    this.covered = new Set(); // regions whose rivers are all in the index
    this.cells = new Map(); // index cell -> segments
    this.list = [];
    this.broad = new Map();
    this._m = {};
    this._lastX = NaN;
    this._lastZ = NaN;
    this.lastEdge = Infinity; // metres from the nearest river's channel, as of the last carve()
    this.work = 0; // counts regions made ready (see TerrainGenerator.getBaseHeight)
  }

  static #key(i, j) {
    return (i + 32768) * 65536 + (j + 32768);
  }

  #rank(i, j) {
    return hash2(i, j, this.seed ^ 0x5bd1e995);
  }

  /** The broad land, from a remembered grid, blended. */
  #land(x, z) {
    const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID);
    const fx = x / GRID - gx, fz = z / GRID - gz;
    const at = (i, j) => {
      const k = BigRivers.#key(i, j);
      let v = this.broad.get(k);
      if (v === undefined) {
        v = this.generator.broadHeight(i * GRID, j * GRID);
        if (this.broad.size > 200000) this.broad.clear();
        this.broad.set(k, v);
      }
      return v;
    };
    const a = at(gx, gz) + (at(gx + 1, gz) - at(gx, gz)) * fx;
    const b = at(gx, gz + 1) + (at(gx + 1, gz + 1) - at(gx, gz + 1)) * fx;
    return a + (b - a) * fz;
  }

  /** The broad climate's dryness (see TerrainGenerator.broadDryness), from a remembered grid, blended. */
  #dry(x, z) {
    const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID);
    const fx = x / GRID - gx, fz = z / GRID - gz;
    const cache = this.dryGrid ?? (this.dryGrid = new Map());
    const at = (i, j) => {
      const k = BigRivers.#key(i, j);
      let v = cache.get(k);
      if (v === undefined) {
        v = this.generator.broadDryness(i * GRID, j * GRID);
        if (cache.size > 200000) cache.clear();
        cache.set(k, v);
      }
      return v;
    };
    const a = at(gx, gz) + (at(gx + 1, gz) - at(gx, gz)) * fx;
    const b = at(gx, gz + 1) + (at(gx + 1, gz + 1) - at(gx, gz + 1)) * fx;
    return a + (b - a) * fz;
  }

  /** The broad dryness (as #dry), for the creeks to tell the desert by cheaply. */
  dry(x, z) {
    return this.#dry(x, z);
  }

  /** The real land (TerrainGenerator.landHeight) at point (i, j) of a remembered 64 m grid. */
  #realPoint(i, j) {
    const k = BigRivers.#key(i, j);
    const cache = this.realGrid ?? (this.realGrid = new Map());
    let v = cache.get(k);
    if (v === undefined) {
      v = this.generator.landHeight(i * 64, j * 64);
      if (cache.size > 200000) cache.clear();
      cache.set(k, v);
    }
    return v;
  }

  /** The real land at the nearest point of the remembered 64 m grid: for finding water. */
  #real(x, z) {
    return this.#realPoint(Math.round(x / 64), Math.round(z / 64));
  }

  /** The real land from the remembered 64 m grid, blended between its points. */
  #realAt(x, z) {
    const gx = Math.floor(x / 64), gz = Math.floor(z / 64);
    const fx = x / 64 - gx, fz = z / 64 - gz;
    const a = this.#realPoint(gx, gz) + (this.#realPoint(gx + 1, gz) - this.#realPoint(gx, gz)) * fx;
    const b = this.#realPoint(gx, gz + 1) + (this.#realPoint(gx + 1, gz + 1) - this.#realPoint(gx, gz + 1)) * fx;
    return a + (b - a) * fz;
  }

  /**
   * 1 if (x, z) lies in a lake as the broad lie of the land has it (low
   * enough for the water, as #trace looks for it, and not the open sea),
   * else 0. (Quick: the real land isn't looked at.)
   */
  #lake(x, z) {
    if (this.#land(x, z) >= this.seaLevel + 3) return 0;
    // (Whether it's the open sea: at the nearest point of a remembered grid.)
    const i = Math.round(x / GRID), j = Math.round(z / GRID), k = BigRivers.#key(i, j);
    const cache = this.seaGrid ?? (this.seaGrid = new Map());
    let v = cache.get(k);
    if (v === undefined) {
      v = this.generator.getOceanness(i * GRID, j * GRID);
      if (cache.size > 200000) cache.clear();
      cache.set(k, v);
    }
    return v <= 0.5 ? 1 : 0;
  }

  /** How wide a river is `k` points (of STEP) down from its spring: a stream there, some 40 m within the first kilometre, on to 120. */
  static width(k) {
    return 6 + (Math.min(120, 40 + k * STEP * 0.011) - 6) * smoothstep(0, 22, k);
  }

  /** The real land (TerrainGenerator.landHeight) exactly, remembered in `memo` (a Map). */
  #exactLand(memo, x, z) {
    const key = `${x},${z}`;
    let h = memo.get(key);
    if (h === undefined) memo.set(key, (h = this.generator.landHeight(x, z)));
    return h;
  }

  /**
   * Whether a traced course, shaped as it will run (see #shape), reaches
   * the sea: if so it's the region's river (and its shape is kept for #final).
   */
  #keep(k, course) {
    // (A quick look: not settled into the land, the remembered grid only.)
    if (!this.#shape(course, null, null, true)) return false;
    this.raws.set(k, course);
    return true;
  }

  /** The course a river of region (i, j) would take on its own (or null). */
  #raw(i, j) {
    const k = BigRivers.#key(i, j);
    if (this.raws.has(k)) return this.raws.get(k);
    this.raws.set(k, null);
    const g = this.generator;
    const rand = mulberry32(hash2(i, j, this.seed) * 4294967296);
    if (rand() > CHANCE) return null;
    // A Smoky Mountains blob centred in the region: its river comes first,
    // down the valley laid out for it (see TerrainGenerator.smokyTrunks),
    // and on from there to the water.
    for (const trunk of g.smokyTrunks(i * REGION, j * REGION, (i + 1) * REGION, (j + 1) * REGION)) {
      const course = this.#trace(trunk[0].x, trunk[0].z, rand, trunk);
      // (Only one that, settled into the land and smoothed as it will be,
      // still runs out into the open sea, touching no lake on the way.)
      if (course && this.#keep(k, course)) return course;
    }
    // Candidate springs, the highest (furthest from the sea) tried first.
    const spots = [];
    for (let k = 0; k < 20; k++) {
      const x = (i + 0.5 + (rand() - 0.5) * 2 * SOURCE) * REGION;
      const z = (j + 0.5 + (rand() - 0.5) * 2 * SOURCE) * REGION;
      const b = this.#land(x, z);
      // (Down in the Smoky Mountains' valleys first, the lowest of them:
      // they're the rivers' country. Elsewhere, the highest ground first.)
      // (Up in the mountains too: a range's high valleys feed rivers.)
      const smoky = g.smokyBlobAt(x, z);
      const high = b > 150 ? smoothstep(0.4, 0.6, g.getMountainness(x, z)) : 0;
      if (b > 16 && b < 200 + smoky * 120 + high * 160) spots.push({ x, z, b, rank: smoky > 0.3 ? 1000 - b : b });
    }
    // (And anywhere in the region, springs in the Smoky Mountains' valleys:
    // wherever they lie in it, rivers rise there.)
    for (let k = 0; k < 16; k++) {
      const x = (i + 0.5 + (rand() - 0.5) * 0.9) * REGION;
      const z = (j + 0.5 + (rand() - 0.5) * 0.9) * REGION;
      const smoky = g.smokyBlobAt(x, z);
      if (smoky < 0.5) continue;
      const b = this.#land(x, z);
      if (b > 16 && b < 320) spots.push({ x, z, b, rank: 1000 - b });
    }
    spots.sort((p, q) => q.rank - p.rank);
    for (const { x, z } of spots.slice(0, 10)) {
      // It rises in the hill country, the foothills or the mountains
      // (not in the desert).
      if (g.getAridity(x, z) > 0.7) continue;
      const course = this.#trace(x, z, rand);
      if (course && this.#keep(k, course)) return course;
    }
    return null;
  }

  /**
   * Follows the broad land down from (x, z): at each step it looks a few
   * hundred metres ahead in a fan of directions and takes the lowest way
   * on (never turning sharply), until the real land drops under the water
   * of a lake or the sea. Returns its points, or null.
   */
  #trace(x, z, rand, prefix = null) {
    const g = this.generator;
    // (Given a `prefix`, the course starts along it and is traced on from its end.)
    const points = prefix ? prefix.map((p) => ({ x: p.x, z: p.z })) : [{ x, z }];
    let dir = null;
    let px = x, pz = z;
    if (prefix) {
      const a = prefix[prefix.length - 2], b = prefix[prefix.length - 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      dir = [(b.x - a.x) / l, (b.z - a.z) / l];
      px = b.x;
      pz = b.z;
    }
    const phase = rand() * 100;
    for (let step = points.length - 1; step < MAX_STEPS; step++) {
      let best = null, bestScore = Infinity;
      const tries = dir ? 9 : 16;
      const base = dir ? Math.atan2(dir[1], dir[0]) : 0;
      // (Rivers run on away from where they rose, never round and back.)
      const ox = px - x, oz = pz - z, od = Math.hypot(ox, oz);
      const away = od > 200 ? [ox / od, oz / od] : [0, 0];
      for (let t = 0; t < tries; t++) {
        const turn = dir ? (t - (tries - 1) / 2) * (Math.PI / 20) : (t / tries) * Math.PI * 2;
        const a = base + turn;
        const ux = Math.cos(a), uz = Math.sin(a);
        let score = this.#land(px + ux * 120, pz + uz * 120) * 0.5 + this.#land(px + ux * 280, pz + uz * 280) * 0.35 + this.#land(px + ux * 520, pz + uz * 520) * 0.15 + Math.abs(turn) * 6 - (ux * away[0] + uz * away[1]) * 14;
        // (Shying away from the desert: it keeps to the greener country.)
        score += 60 * smoothstep(0.62, 0.78, this.#dry(px + ux * 400, pz + uz * 400)) + 160 * smoothstep(0.5, 0.7, this.#dry(px + ux * 200, pz + uz * 200));
        // (And from lakes: it runs on round them, to the sea.)
        score += 400 * (this.#lake(px + ux * 120, pz + uz * 120) + this.#lake(px + ux * 280, pz + uz * 280));
        if (score < bestScore) {
          bestScore = score;
          best = [ux, uz];
        }
      }
      // A slow meander.
      const a = Math.atan2(best[1], best[0]) + this.wiggle.noise2D(px * 0.0012 + phase, pz * 0.0012) * 0.35;
      dir = [Math.cos(a), Math.sin(a)];
      px += dir[0] * STEP;
      pz += dir[1] * STEP;
      // Round in a loop: it's stuck.
      for (let k = 0; k < points.length - 8; k++) if (Math.hypot(points[k].x - px, points[k].z - pz) < 180) return null;
      points.push({ x: px, z: pz });
      // (Never out into a desert: along its edge at most.)
      if (this.#dry(px, pz) > 0.8) return null; // (where the desert takes over)
      // (And by the biomes themselves: never into a desert or a dune sea,
      // only along the edge where it meets the savanna.)
      if (step % 4 === 0 && this.#dry(px, pz) > 0.6) {
        const w = g.getBiomeWeights(px, pz, {});
        if (w.desert + w.saltFlat > 0.5) return null;
      }
      // (The real land's looked at only where the broad lie is low enough for water.)
      // It ends where it reaches the open sea. (One that would run into a
      // lake on the way is no river: there's none from here.)
      if (this.#land(px, pz) < this.seaLevel + 3 && this.#real(px, pz) < this.seaLevel - 0.3) {
        if (g.getOceanness(px, pz) <= 0.5) return null;
        points.push({ x: px + dir[0] * STEP, z: pz + dir[1] * STEP });
        return points.length * STEP >= MIN_LENGTH ? points : null;
      }
    }
    return null;
  }

  /**
   * The river of region (i, j) as it finally runs (or null): its raw
   * course, cut short where it meets a river of lower rank (it runs into
   * that one), with its water levels and widths.
   */
  #final(i, j) {
    const k = BigRivers.#key(i, j);
    if (this.finals.has(k)) return this.finals.get(k);
    this.finals.set(k, null);
    const raw = this.#raw(i, j);
    if (!raw) return null;
    const rank = this.#rank(i, j);
    let cut = raw.length, into = null;
    // (Only rivers of the regions round about: rivers ending in the water,
    // not in each other, only rarely come close.)
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        if (this.#rank(i + di, j + dj) >= rank) continue;
        const other = this.#raw(i + di, j + dj);
        if (!other) continue;
        // (Quick: is it anywhere near?)
        let near = false;
        for (let a = 0; a < cut && !near; a += 6) for (let b = 0; b < other.length; b += 6) if (Math.hypot(raw[a].x - other[b].x, raw[a].z - other[b].z) < JOIN + 600) { near = true; break; }
        if (!near) continue;
        const river = this.#final(i + di, j + dj);
        if (!river) continue;
        const P = river.points;
        for (let a = 1; a < cut; a++) {
          for (let b = 0; b < P.length; b++) {
            if (Math.hypot(raw[a].x - P[b].x, raw[a].z - P[b].z) < JOIN + P[b].width / 2) {
              cut = a;
              into = { river, b };
              break;
            }
          }
        }
      }
    }
    const course = raw.slice(0, cut);
    if (into) {
      // It runs on into the middle of the one it joins.
      const q = into.river.points[into.b];
      course.push({ x: q.x, z: q.z });
    }
    if (course.length * STEP < MIN_LENGTH * (into ? 0.6 : 1)) return null;
    // Its shape: as worked out for #raw if it runs on to the sea as it was
    // traced, else worked out again. (The exact land under its points,
    // looked at there, is remembered: it's needed below.)
    const g = this.generator;
    const exact = new Map();
    const shape = this.#shape(course, into, (x, z) => this.#exactLand(exact, x, z));
    if (!shape) return null;
    ({ into } = shape);
    // The land under each point: the exact height under it, and the
    // remembered grid's to either side (where that's dry land: a lake or the
    // sea beside it is no floor for it to run along).
    const sea = this.seaLevel;
    const points = shape.path.map(([x, z], k, P) => {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      const left = this.#real(x + nx * 40, z + nz * 40), right = this.#real(x - nx * 40, z - nz * 40);
      const ground = Math.min(exact.get(`${x},${z}`) ?? g.landHeight(x, z), left < sea ? Infinity : left, right < sea ? Infinity : right);
      return { x, z, level: 0, width: 0, ground };
    });
    // Its water: a little below the real land, and only ever falling (so
    // where the land rises across its course, it cuts down through it).
    let level = Infinity;
    for (const [k, p] of points.entries()) {
      // (Shallow at its spring, cutting deeper as it grows.)
      level = Math.min(level - 0.01, p.ground - 0.8 - 1.7 * smoothstep(0, 22, k));
      p.level = Math.max(sea + 0.03, level);
    }
    // And easing down to where it ends: its mouth at the level of the sea
    // (or of the river it joins), never perched above it, rising gently
    // upstream from there (at most 2.5 m a kilometre), so down its lower
    // reaches it runs level with the low country beside it. (Upstream it
    // cuts down into the land instead: its valley.)
    const end = into ? into.river.points[into.b].level : sea + 0.03;
    points[points.length - 1].level = end;
    for (let k = points.length - 2; k >= 0; k--) points[k].level = Math.min(points[k].level, points[k + 1].level + STEP * 0.0025);
    // (Never below the water it runs into.)
    for (const p of points) p.level = Math.max(p.level, end);
    // Broadening downstream, from a stream at its spring to about 40 m
    // within the first kilometre, and on to 120.
    const n = points.length;
    points.forEach((p, k) => {
      p.width = BigRivers.width(k);
    });
    if (into) points[n - 1].width = Math.max(points[n - 2].width, into.river.points[into.b].width * 0.6);
    // (Its mouth opens out into the sea: see carve.)
    const mouth = into ? null : { x: points[n - 1].x, z: points[n - 1].z, r: points[n - 1].width + 40 };
    // It rises from a lake at its head: a spring-fed pool in a hollow, some
    // fifty to eighty metres across, at the level of its water there.
    const head = points[0];
    const source = { x: head.x, z: head.z, r: 26 + 16 * hash2(i, j, this.seed ^ 0x50c3), level: head.level };
    const river = { points, pond: null, tarn: null, kind: 'river', big: true, region: [i, j], joins: !!into, source, mouth };
    this.finals.set(k, river);
    return river;
  }

  /**
   * A course as it finally runs, given its raw points (and, if it runs into
   * another river, `into`, which its last point is the middle of): settled
   * into the real land (see #settle) and smoothed (see #smooth), then cut
   * short where it first comes to open water, beside its channel or under
   * it. That must be the open sea: it ends there, its mouth running on out
   * a little way into the sea. Where it would come to a lake on the way, it
   * rises beyond the lake instead, well clear of it (LAKE_CLEAR), so no river
   * ever runs into or through a lake. Returns { path: [[x, z], ...] STEP
   * apart, into (null if it now reaches the sea before the river it was to
   * join) }, or null if it never reaches the sea (or the river it joins),
   * or too little of it is left. (`land`: see #firstWater. `quick`: a first
   * look, for #raw, not settled into the land, under its middle only, on
   * the remembered grid's nearest points.)
   */
  #shape(raw, into, land = null, quick = false) {
    const keep = into ? 1 : 0;
    const points = raw.map((p) => ({ x: p.x, z: p.z }));
    if (!quick) this.#settle(points, keep);
    let path = this.#smooth(points, keep);
    // (Into another river: its last stretch, into the middle of that one, isn't looked at.)
    const upTo = () => (into ? path.length - 2 : path.length - 1);
    let from = 0, wet = null, extended = false;
    for (;;) {
      wet = this.#firstWater(path, from, upTo(), land, quick);
      if (!wet && !into && !extended) {
        // (Its trace ended at the water's edge as the coarser grid has it:
        // on straight ahead a little way, to where the water really is.)
        const [ax, az] = path[path.length - 2], [bx, bz] = path[path.length - 1], l = Math.hypot(bx - ax, bz - az) || 1;
        for (let q = 1; q <= 6 && path.length - 1 < MAX_STEPS + 6; q++) path.push([bx + ((bx - ax) / l) * STEP * q, bz + ((bz - az) / l) * STEP * q]);
        extended = true;
        continue;
      }
      if (!wet || wet.ocean) break;
      from = wet.k + LAKE_CLEAR;
    }
    if (!wet) {
      if (!into) return null;
      path = path.slice(from);
      return path.length * STEP >= MIN_LENGTH * 0.6 ? { path, into } : null;
    }
    // It ends where it reaches the sea: its last stretch carries straight
    // on out into the water, for half its width and a little more.
    const [x, z] = wet.at, [ux, uz] = wet.dir;
    path = path.slice(from, wet.k + 1);
    if (!path.length) return null;
    if (Math.hypot(path[path.length - 1][0] - x, path[path.length - 1][1] - z) > STEP * 0.3) path.push([x, z]);
    const out = BigRivers.width(wet.k - from) / 2 + 24;
    for (let d = Math.min(STEP, out); ; d = Math.min(d + STEP, out)) {
      path.push([x + ux * d, z + uz * d]);
      if (d >= out) break;
    }
    // (Short enough that it, its valley and its mouth never reach past the
    // regions two out from its own: see REACH.)
    if (path.length * STEP < MIN_LENGTH || from + path.length - 1 > MAX_STEPS + 6) return null;
    return { path, into: null };
  }

  /**
   * Where a course (points STEP apart, rising at point `from`) first comes
   * to open water (the real land, from the remembered grid, under the lake
   * or sea): under its middle, or beside it, out past its banks. Looked at
   * every 16 m along its stretches from `from` up to `upTo`. Returns { k
   * (the stretch), at: [x, z] (its middle there), dir (its way on), ocean
   * (whether that water is the open sea) }, or null. (Given `land`, the
   * exact land at (x, z), that's looked at under each of its points too.)
   */
  #firstWater(path, from, upTo, land = null, quick = false) {
    const g = this.generator, sea = this.seaLevel, wet = sea - 0.3;
    for (let k = from; k < Math.min(upTo, path.length - 1); k++) {
      const [ax, az] = path[k], [bx, bz] = path[k + 1];
      const l = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / l, uz = (bz - az) / l;
      const side = BigRivers.width(k - from) / 2 + 6;
      for (let s = 0; s < l; s += 16) {
        const x = ax + ux * s, z = az + uz * s;
        // (Its middle, then either side.)
        for (const o of quick ? [0] : [0, side, -side]) {
          const px = x - uz * o, pz = z + ux * o;
          // (Only where the broad lie of the land is low enough for water.)
          const low = this.#land(px, pz) < sea + LOW;
          if (!(low && (quick ? this.#real(px, pz) : this.#realAt(px, pz)) < wet) && !(land && s === 0 && o === 0 && land(px, pz) < wet)) continue;
          // Open sea, or a lake? Looked at here and on out into it.
          const dx = o ? -uz * Math.sign(o) : ux, dz = o ? ux * Math.sign(o) : uz;
          let ocean = false;
          for (const d of [0, 150, 300]) if (g.getOceanness(px + dx * d, pz + dz * d) > 0.5) ocean = true;
          return { k, at: [x, z], dir: [ux, uz], ocean };
        }
      }
    }
    return null;
  }

  /**
   * Rounds a course's bends into smooth curves: a broad rolling average
   * along it, then corner cutting, then its points spaced out evenly
   * again (STEP apart), then any sharp bend left eased out (see BEND),
   * leaving its two ends where they are (and the last `keep` points).
   * Returns [[x, z], ...].
   */
  #smooth(points, keep) {
    let P = points.map((p) => [p.x, p.z]);
    // (First a broad rolling average along it, some 300 m either way: a
    // great river swings round in wide bends, never a sharp one.)
    const fixed = Math.max(1, keep);
    for (let pass = 0; pass < 3; pass++) {
      const Q = P.map((p) => p.slice());
      for (let k = 1; k < P.length - fixed; k++) {
        const R = Math.min(6, k, P.length - fixed - k); // (tapering to the ends, which stay put)
        let sx = 0, sz = 0, w = 0;
        for (let q = -R; q <= R; q++) {
          const f = R + 1 - Math.abs(q);
          sx += P[k + q][0] * f;
          sz += P[k + q][1] * f;
          w += f;
        }
        Q[k] = [sx / w, sz / w];
      }
      P = Q;
    }
    const tail = P.slice(P.length - fixed);
    let body = P.slice(0, P.length - fixed + 1);
    for (let it = 0; it < 3; it++) {
      const out = [body[0]];
      for (let k = 0; k < body.length - 1; k++) {
        const [ax, az] = body[k], [bx, bz] = body[k + 1];
        out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
      }
      out.push(body[body.length - 1]);
      body = out;
    }
    P = body.concat(tail.slice(1));
    // (Evenly spaced again.)
    const even = [P[0]];
    let carry = 0;
    for (let k = 1; k < P.length; k++) {
      const [ax, az] = P[k - 1], [bx, bz] = P[k];
      const l = Math.hypot(bx - ax, bz - az);
      let t = STEP - carry;
      while (t <= l) {
        even.push([ax + ((bx - ax) * t) / l, az + ((bz - az) * t) / l]);
        t += STEP;
      }
      carry = l - (t - STEP);
    }
    const last = P[P.length - 1];
    if (Math.hypot(even[even.length - 1][0] - last[0], even[even.length - 1][1] - last[1]) > STEP * 0.3) even.push(last);
    else even[even.length - 1] = last;
    // (And any bend still sharp, near its ends where the average tapers off,
    // eased out: nowhere does it turn more than BEND at one point.)
    return easeBends(even, BEND, 1, even.length - 1 - fixed);
  }

  /**
   * Lets a course settle into the real land: each point moves across its
   * course onto the lowest ground within a few hundred metres (the floor
   * of the valley it's running down), smoothly, so the river keeps to the
   * valley floors rather than running over the hills between them. Leaves
   * the last `keep` points where they are.
   */
  #settle(points, keep) {
    const n = points.length;
    const shift = new Float32Array(n);
    const normals = points.map((p, k) => {
      const a = points[Math.max(0, k - 1)], b = points[Math.min(n - 1, k + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l];
    });
    // (Never into a lake or the sea beside it: it keeps to the dry valley floor.)
    const low = (p, [nx, nz], o) => {
      const h = this.#real(p.x + nx * o, p.z + nz * o);
      return h < this.seaLevel - 0.3 ? Infinity : h;
    };
    // (Every other point; the ones between are smoothed in below.)
    for (let k = 1; k < n - keep; k++) {
      if (k % 2 === 0 && k + 1 < n - keep) continue;
      let best = 0, bestH = Infinity;
      for (let o = -320; o <= 320; o += 106) {
        const h = low(points[k], normals[k], o) + Math.abs(o) * 0.01;
        if (h < bestH) {
          bestH = h;
          best = o;
        }
      }
      shift[k] = best;
    }
    for (let k = 2; k < n - keep - 1; k += 2) shift[k] = (shift[k - 1] + shift[k + 1]) / 2;
    // Smoothed along the course, easing in from its source.
    const smooth = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let sum = 0, w = 0;
      for (let q = -3; q <= 3; q++) {
        const i = k + q;
        if (i < 0 || i >= n) continue;
        const f = 4 - Math.abs(q);
        sum += shift[i] * f;
        w += f;
      }
      smooth[k] = k >= n - keep ? 0 : (sum / w) * Math.min(1, k / 4);
    }
    for (let k = 0; k < n; k++) {
      const p = points[k];
      p.x += normals[k][0] * smooth[k];
      p.z += normals[k][1] * smooth[k];
    }
  }

  /** Makes sure every river that can shape (x, z) is in the index. */
  #ensure(x, z) {
    const ri = Math.floor(x / REGION), rj = Math.floor(z / REGION);
    const k = BigRivers.#key(ri, rj);
    if (this.covered.has(k)) return;
    this.covered.add(k);
    this.work++;
    // (While they're worked out, the land they look at leaves out the sea
    // caves: see TerrainGenerator.#seaCliff.)
    const g = this.generator, was = g._riverWork;
    g._riverWork = true;
    try {
      for (let dj = -REACH; dj <= REACH; dj++) {
        for (let di = -REACH; di <= REACH; di++) {
          const river = this.#final(ri + di, rj + dj);
          if (!river || river.indexed) continue;
          river.indexed = true;
          this.#index(river);
        }
      }
    } finally {
      g._riverWork = was;
    }
  }

  #index(river) {
    const P = river.points;
    let along = 0, total = 0;
    for (let i = 0; i < P.length - 1; i++) total += Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const seg = {
        ax: a.x, az: a.z, bx: b.x, bz: b.z, la: a.level, lb: b.level, wa: a.width, wb: b.width, along, total,
        source: i === 0 ? river.source ?? null : null,
        mouth: i === P.length - 2 ? river.mouth ?? null : null,
      };
      along += Math.hypot(b.x - a.x, b.z - a.z);
      const r = Math.max(a.width, b.width) / 2 + BigRivers.plain(Math.max(a.width, b.width) / 2) + VALLEY;
      for (let cz = Math.floor((Math.min(a.z, b.z) - r) / CELL); cz <= Math.floor((Math.max(a.z, b.z) + r) / CELL); cz++) {
        for (let cx = Math.floor((Math.min(a.x, b.x) - r) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + r) / CELL); cx++) {
          const k = BigRivers.#key(cx, cz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(seg);
        }
      }
      minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
      minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    }
    const m = 80;
    river.bounds = { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
    this.list.push(river);
  }

  /** How wide a river's flood plain is (m, past its bank), given its half-width. */
  static plain(half) {
    return 40 + half * 1.6;
  }

  static #measure(seg, x, z, out) {
    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / len2));
    out.d = Math.hypot(seg.ax + dx * t - x, seg.az + dz * t - z);
    out.end = t <= 0 || t >= 1;
    out.level = seg.la + (seg.lb - seg.la) * t;
    out.water = (seg.wa + (seg.wb - seg.wa) * t) / 2;
    out.half = out.water;
    const run = Math.sqrt(len2);
    out.fx = dx / run;
    out.fz = dz / run;
    out.drop = (seg.la - seg.lb) / run;
    out.along = seg.along + t * run;
    return out;
  }

  #near(x, z) {
    this.#ensure(x, z);
    return this.cells.get(BigRivers.#key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  /**
   * The land at (x, z) with the rivers' valleys carved into it, given the
   * land as it would be (`h`).
   */
  carve(x, z, h) {
    this.lastEdge = Infinity;
    this._lastX = x;
    this._lastZ = z;
    const near = this.#near(x, z);
    if (!near) return h;
    const m = this._m;
    let low = Infinity, edge = Infinity, levee = -Infinity, leveeWeight = 0;
    for (const seg of near) {
      BigRivers.#measure(seg, x, z, m);
      const { d, level: L, half } = m;
      const u = d - half;
      const fp = BigRivers.plain(half);
      if (u > fp + VALLEY) continue;
      edge = Math.min(edge, u);
      let t;
      if (u < 0) {
        // The channel: deepest in the middle.
        const s = d / half;
        t = L - 0.8 - (1.5 + half * 0.05) * (1 - s * s);
      } else if (u < 8) {
        t = L - 0.4 + u * 0.25; // the bank
      } else if (u < fp) {
        t = L + 1.6 + (u - 8) * 0.012; // the flood plain
      } else {
        // The valley's sides, steepening out to where they meet the land.
        const s = u - fp;
        t = L + 1.6 + (fp - 8) * 0.012 + s * 0.05 + (s / VALLEY) ** 2 * 170;
      }
      if (t < low) low = t;
      // Its mouth: the land round its end falls away under the sea, so it
      // opens out into the water, no spit or bar of land across it.
      if (seg.mouth) {
        const M = seg.mouth, e = Math.hypot(x - M.x, z - M.z);
        if (e < M.r) {
          const q = this.seaLevel - 0.8 + 2.6 * smoothstep(0.5, 1, e / M.r);
          if (q < low) low = q;
        }
      }
      // The lake it rises from: a round bowl, with a low bank round it.
      if (seg.source) {
        const S = seg.source, e = Math.hypot(x - S.x, z - S.z) - S.r;
        if (e < 12) {
          const q = e < 0 ? S.level - 1.2 - 3.5 * (1 - ((e + S.r) / S.r) ** 2) : S.level - 0.4 + e * 0.25;
          if (q < low) low = q;
          edge = Math.min(edge, e);
        }
      }
      // (Where the land beside it lies lower than the water, a low natural
      // levee holds the river in.)
      // (None near its end, where it opens out into the sea or the river
      // it joins.)
      if (u >= 0 && u < fp && L + 0.7 > levee) {
        levee = L + 0.7;
        leveeWeight = (1 - smoothstep(fp * 0.6, fp, u)) * smoothstep(150, 600, seg.total - m.along);
      }
    }
    if (low === Infinity) return h;
    this.lastEdge = edge;
    // In the channel. (Where it runs out into the sea, never building its bed
    // up above the sea's own floor.)
    if (edge < 0) return h < this.seaLevel + 0.2 ? low + (Math.min(low, h) - low) * smoothstep(this.seaLevel + 0.2, this.seaLevel - 0.8, h) : low;
    let out = smin(h, low, edge < 20 ? 1 : 10);
    // (Only on dry land: never building banks up out of a lake or the sea.)
    if (levee > out && h > this.seaLevel + 0.3) out += (levee - out) * leveeWeight * smoothstep(this.seaLevel + 0.3, this.seaLevel + 1.5, h);
    return out;
  }

  /** Metres from the nearest river's channel edge (Infinity if none near). */
  edgeAt(x, z) {
    if (x === this._lastX && z === this._lastZ) return this.lastEdge;
    const near = this.#near(x, z);
    if (!near) return Infinity;
    const m = this._m;
    let edge = Infinity;
    for (const seg of near) {
      edge = Math.min(edge, BigRivers.#measure(seg, x, z, m).d - m.half);
      if (seg.source) edge = Math.min(edge, Math.hypot(x - seg.source.x, z - seg.source.z) - seg.source.r);
    }
    return edge;
  }

  /**
   * The river water at (x, z), within `margin` metres of a channel:
   * { d, level, water, half, fx, fz, drop, along, across, inset } (the
   * lowest water where two channels overlap), or null.
   */
  waterAt(x, z, margin = 0) {
    const near = this.#near(x, z);
    if (!near) return null;
    const m = this._m;
    let best = null;
    for (const seg of near) {
      BigRivers.#measure(seg, x, z, m);
      // (The lake it rises from.)
      if (seg.source) {
        const S = seg.source, d = Math.hypot(x - S.x, z - S.z);
        if (d < S.r + margin && (!best || (d < S.r && !best.inside))) {
          best = { d, level: S.level, water: S.r, half: S.r, fx: 0, fz: 0, drop: 0, along: 0, across: d / S.r, inset: S.r - d, inside: d < S.r, lake: true };
        }
      }
      if (m.d > m.half + margin) continue;
      const inside = m.d < m.half;
      if (!best || (inside && (!best.inside || m.level < best.level)) || (!best.inside && !inside && m.d - m.half < best.d - best.half)) {
        best = { d: m.d, level: m.level, water: m.water, half: m.half, fx: m.fx, fz: m.fz, drop: m.drop, along: m.along, across: m.d / m.half, inset: m.half - m.d, inside };
      }
    }
    return best;
  }

  /** Rivers passing near a box (for drawing their water). */
  inBox(minX, minZ, maxX, maxZ) {
    this.#ensure((minX + maxX) / 2, (minZ + maxZ) / 2);
    return this.list.filter(({ bounds: b }) => b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ);
  }
}
