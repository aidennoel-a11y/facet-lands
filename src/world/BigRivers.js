import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../noise/random.js';

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
const MAX_STEPS = 330; // at most ~16 km long, so a river (and its valley) never reaches past the regions two out from its own
const REACH = 2; // regions out from a point whose rivers can reach it (see #ensure)
const MIN_LENGTH = 1500;
const CELL = 256; // spatial index cell (m)
const VALLEY = 650; // how far out past its flood plain a river's valley reaches (m)
const JOIN = 260; // a river coming this close to a bigger one runs into it
const GRID = 128; // spacing of the broad land's remembered grid (m: it's smooth)

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
    this.deltas = [];
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

  /** The real land (TerrainGenerator.landHeight) at the nearest point of a remembered 64 m grid: for finding water. */
  #real(x, z) {
    const i = Math.round(x / 64), j = Math.round(z / 64), k = BigRivers.#key(i, j);
    const cache = this.realGrid ?? (this.realGrid = new Map());
    let v = cache.get(k);
    if (v === undefined) {
      v = this.generator.landHeight(i * 64, j * 64);
      if (cache.size > 200000) cache.clear();
      cache.set(k, v);
    }
    return v;
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
      if (course) {
        this.raws.set(k, course);
        return course;
      }
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
      if (course) {
        this.raws.set(k, course);
        return course;
      }
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
        score += 60 * smoothstep(0.62, 0.78, this.#dry(px + ux * 400, pz + uz * 400));
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
      // (The real land's looked at only where the broad lie is low enough for water.)
      if (this.#land(px, pz) < this.seaLevel + 3 && this.#bigWater(px, pz, dir) && this.#real(px, pz) < this.seaLevel - 0.8) {
        // Into a lake or the sea: on a little way, so its mouth opens out.
        for (let k = 1; k <= 3; k++) points.push({ x: px + dir[0] * STEP * k, z: pz + dir[1] * STEP * k });
        return points.length * STEP >= MIN_LENGTH ? points : null;
      }
    }
    return null;
  }

  /**
   * Whether the water a river has reached at (x, z), heading `dir`, is a
   * real lake or the sea (not a pond or a hollow): the open sea, or water
   * over most of the ground a few hundred metres on ahead and to the sides.
   */
  #bigWater(x, z, dir) {
    const g = this.generator;
    if (g.getOceanness(x, z) > 0.5) return true;
    let wet = 0;
    const a0 = Math.atan2(dir[1], dir[0]);
    for (let k = 0; k < 7; k++) {
      const a = a0 + (k - 3) * 0.45, d = k % 2 ? 260 : 420;
      if (this.#land(x + Math.cos(a) * d, z + Math.sin(a) * d) < this.seaLevel) wet++;
    }
    return wet >= 5;
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
    let points = raw.slice(0, cut).map((p) => ({ x: p.x, z: p.z, level: 0, width: 0 }));
    if (into) {
      // It runs on into the middle of the one it joins.
      const q = into.river.points[into.b];
      points.push({ x: q.x, z: q.z, level: 0, width: 0 });
    }
    if (points.length * STEP < MIN_LENGTH * (into ? 0.6 : 1)) return null;
    this.#settle(points, into ? 1 : 0);
    points = this.#smooth(points, into ? 1 : 0);
    // Its water: a little below the real land, and only ever falling (so
    // where the land rises across its course, it cuts down through it).
    const g = this.generator;
    let level = Infinity;
    for (const [k, p] of points.entries()) {
      // (Shallow at its spring, cutting deeper as it grows.)
      level = Math.min(level - 0.01, p.ground - 0.8 - 1.7 * smoothstep(0, 22, k));
      p.level = Math.max(this.seaLevel + 0.03, level);
    }
    // And easing down to where it ends: its mouth at the level of the lake
    // or sea (or of the river it joins), never perched above it, rising
    // gently upstream from there (at most 2.5 m a kilometre), so down its
    // lower reaches it runs level with the low country beside it. (Upstream
    // it cuts down into the land instead: its valley.)
    const end = into ? into.river.points[into.b].level : this.seaLevel + 0.03;
    points[points.length - 1].level = end;
    for (let k = points.length - 2; k >= 0; k--) points[k].level = Math.min(points[k].level, points[k + 1].level + STEP * 0.0025);
    // (Never below the water it runs into.)
    for (const p of points) p.level = Math.max(p.level, end);
    // Broadening downstream, from a stream at its spring to about 40 m
    // within the first kilometre, and on to 120.
    const n = points.length;
    points.forEach((p, k) => {
      p.width = 6 + (Math.min(120, 40 + k * STEP * 0.011) - 6) * smoothstep(0, 22, k);
    });
    if (into) points[n - 1].width = Math.max(points[n - 2].width, into.river.points[into.b].width * 0.6);
    // It rises from a lake at its head: a spring-fed pool in a hollow, some
    // fifty to eighty metres across, at the level of its water there.
    const head = points[0];
    const source = { x: head.x, z: head.z, r: 26 + 16 * hash2(i, j, this.seed ^ 0x50c3), level: head.level };
    const river = { points, pond: null, tarn: null, kind: 'river', big: true, region: [i, j], joins: !!into, source };
    if (!into) this.#delta(river, i, j);
    this.finals.set(k, river);
    return river;
  }

  /**
   * Rounds a course's bends into smooth curves (corner cutting, a few
   * times over), then spaces its points out evenly again (STEP apart),
   * leaving its two ends where they are (and the last `keep` points) and
   * working out the ground under each point again.
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
    const g = this.generator;
    return even.map(([x, z], k) => {
      const a = even[Math.max(0, k - 1)], b = even[Math.min(even.length - 1, k + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      // (The land under it and to either side: the exact height under it, and the remembered grid's round about.)
      const ground = Math.min(g.landHeight(x, z), this.#real(x + nx * 40, z + nz * 40), this.#real(x - nx * 40, z - nz * 40));
      return { x, z, level: 0, width: 0, ground };
    });
  }

  /**
   * Lets a course settle into the real land: each point moves across its
   * course onto the lowest ground within a few hundred metres (the floor
   * of the valley it's running down), smoothly, so the river keeps to the
   * valley floors rather than running over the hills between them. Leaves
   * the last `keep` points where they are. Sets each point's `ground`.
   */
  #settle(points, keep) {
    const g = this.generator;
    const n = points.length;
    const shift = new Float32Array(n);
    const normals = points.map((p, k) => {
      const a = points[Math.max(0, k - 1)], b = points[Math.min(n - 1, k + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l];
    });
    const low = (p, [nx, nz], o) => this.#real(p.x + nx * o, p.z + nz * o);
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
      const [nx, nz] = normals[k];
      p.ground = Math.min(this.#real(p.x, p.z), this.#real(p.x + nx * 30, p.z + nz * 30), this.#real(p.x - nx * 30, p.z - nz * 30));
    }
  }

  /**
   * Where a river runs out into the sea (or a great lake), a delta: some
   * half a kilometre short of its mouth it splits into two or three
   * narrower channels fanning out to the water, and the shallows between
   * them build up into low flats of sand and silt just above the water.
   */
  #delta(river, i, j) {
    const P = river.points, n = P.length;
    if (n < 20) return;
    const g = this.generator;
    const end = P[n - 1];
    if (g.getOceanness(end.x, end.z) < 0.5) return; // (only out into the open sea)
    const apex = P[n - 14];
    const dx = end.x - apex.x, dz = end.z - apex.z, dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl, uz = dz / dl;
    const s = this.seed ^ 0xde17a;
    const count = 2 + (hash2(i, j, s) < 0.5 ? 1 : 0);
    const angles = count === 2 ? [-0.5, 0.45] : [-0.6, 0.05, 0.55];
    river.branches = [];
    for (let b = 0; b < count; b++) {
      const turn = angles[b] + (hash2(i + b, j, s + 1) - 0.5) * 0.2;
      const len = 14 + Math.floor(hash2(i, j + b, s + 2) * 6);
      const pts = [{ x: apex.x, z: apex.z, level: apex.level, width: apex.width * 0.5 }];
      const seaward = Math.atan2(uz, ux);
      let a = seaward + turn, x = apex.x, z = apex.z;
      for (let k = 1; k <= len; k++) {
        // (Easing round towards the sea, never past it, winding a little.)
        a += (seaward + turn * 0.35 - a) * 0.08 + this.wiggle.noise2D(x * 0.004 + b * 13, z * 0.004) * 0.05;
        x += Math.cos(a) * STEP;
        z += Math.sin(a) * STEP;
        const f = k / len;
        pts.push({ x, z, level: Math.max(this.seaLevel + 0.03, apex.level + (this.seaLevel + 0.03 - apex.level) * Math.min(1, f * 1.6)), width: apex.width * (0.5 - 0.15 * f) });
      }
      river.branches.push({ points: pts, pond: null, tarn: null, kind: 'river', big: true, branch: true });
    }
    river.delta = { x: apex.x, z: apex.z, ux, uz, r: (14 + 6) * STEP * 1.15, level: this.seaLevel };
  }

  /** How high a delta's flats lift the land at (x, z) (or -Infinity): just above the water, fanning out seawards from its apex. */
  #deltaFlat(x, z) {
    let best = -Infinity;
    for (const d of this.deltas) {
      const ox = x - d.x, oz = z - d.z, dist = Math.hypot(ox, oz);
      if (dist > d.r) continue;
      const ahead = (ox * d.ux + oz * d.uz) / (dist || 1);
      const fan = smoothstep(-0.2, 0.25, ahead) * (1 - smoothstep(d.r * 0.7, d.r, dist));
      if (fan <= 0) continue;
      const lumps = this.wiggle.noise2D(x * 0.012 + 7, z * 0.012 - 3) * 0.5 + this.wiggle.noise2D(x * 0.03, z * 0.03) * 0.08;
      best = Math.max(best, d.level + (0.35 + 0.5 * fan + lumps * fan) * fan - (1 - fan) * 2);
    }
    return best;
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
          for (const b of river.branches ?? []) this.#index(b);
          if (river.delta) this.deltas.push(river.delta);
        }
      }
    } finally {
      g._riverWork = was;
    }
  }

  #index(river) {
    const P = river.points;
    let along = 0;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, la: a.level, lb: b.level, wa: a.width, wb: b.width, along, source: i === 0 ? river.source ?? null : null };
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
    if (this.deltas.length) {
      const flat = this.#deltaFlat(x, z);
      if (flat > h) h = flat;
    }
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
      if (u >= 0 && u < fp && L + 0.7 > levee) {
        levee = L + 0.7;
        leveeWeight = 1 - smoothstep(fp * 0.6, fp, u);
      }
    }
    if (low === Infinity) return h;
    this.lastEdge = edge;
    if (edge < 0) return low; // in the channel
    let out = smin(h, low, edge < 20 ? 1 : 10);
    if (levee > out) out += (levee - out) * leveeWeight;
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
