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

const REGION = 768; // at most one river and one mountain stream rise per region this size
const RIVER_REACH = 4; // a river stays within this many regions of where it rises
const STREAM_REACH = 2; // likewise a stream
const CELL = 32; // spatial index cell (m)
const STEP = 8; // path spacing (m)
const RIVER_STEPS = 400; // a river is at most ~3 km long
const STREAM_STEPS = 170; // a stream at most ~1.4 km
const BEND = (20 * Math.PI) / 180; // the most a course turns at any one point (STEP apart): bends some 35 m round, or wider
const INFLUENCE = 150; // how far past its channel a river still shapes the land (m): its valley (see valleyWidth)

/**
 * Rivers and mountain streams, all ending in open water:
 *
 *  - Rivers rise from a pond in the rolling hills of the plains or savanna
 *    and wind calmly downhill (steepest descent, with momentum and a slow
 *    meander) into a lake or the sea. One that can't (it stalls, meets
 *    rising or steep ground, loops or runs too far) isn't kept. A river is
 *    as wide as it is long: short ones stay skinny, long ones broaden.
 *  - Mountain streams rise high in the ranges (from a spring, or a small
 *    tarn in a hollow) and run straight down the slopes, following the
 *    land, so they tumble in white water where it's steep and fall over
 *    cliffs, until they join a river or reach open water.
 *
 * Water levels only ever fall along a course. The terrain is carved to
 * match (see carve()): each runs down the floor of its own valley, broad
 * and gentle-floored for a river (broadening downstream), a narrow V for a
 * mountain stream, the valley's sides easing up into the lie of the land.
 * At the water: a bed below it, a channel at least ~5 m wide kept under
 * the water level (the mesh is finer along rivers, so its triangles always
 * have corners in it and never bridge over the water), a strip of mud,
 * then a steep cut bank up to the valley floor (raised where the land
 * beside would be lower, so water never floats). Ponds get a basin and
 * banks. Rivers trace the fall of the land closely, so they run where the
 * land is lowest, as real ones do.
 *
 * Generated region by region from the seed. Streams are only traced once
 * every river that could reach them exists, so any chunk (or worker),
 * asking in any order, sees the same water.
 */
export class Rivers {
  static STREAMS = true; // mountain streams (running straight down the slopes, in rapids)
  static CASCADES = false; // their stepped pools and falls, and waterfalls off cliffs (off: they didn't sit convincingly in the land)

  constructor(generator, { seaLevel }) {
    this.generator = generator;
    this.big = generator.bigRivers; // the great rivers (creeks and streams run into them)
    this.seaLevel = seaLevel;
    this.seed = generator.seed ^ 0x6c8e9cf5;
    this.meander = new SimplexNoise(this.seed);
    this.riverRegions = new Set();
    this.streamRegions = new Set();
    this.covered = new Set();
    this.cells = new Map(); // index cell -> segments and ponds (rivers and streams)
    this.riverCells = new Map(); // index cell -> river segments only (streams join these)
    this.list = [];
    this._m = {};
    // (What's been worked out here since it was last handed on to the
    // other threads: see takeFresh and share.)
    this.fresh = { list: [], rivers: [], streams: [], covered: [] };
    this.src = null;
  }

  /**
   * What's been worked out here since last asked (or null): to hand to the
   * other threads building the same world (see share), so they needn't
   * work it all out again themselves. (With the great rivers': see BigRivers.)
   */
  takeFresh() {
    const f = this.fresh, big = this.big.takeFresh();
    if (!f.list.length && !f.rivers.length && !f.streams.length && !f.covered.length && !big) return null;
    this.fresh = { list: [], rivers: [], streams: [], covered: [] };
    return { ...f, big };
  }

  /**
   * What another thread worked out (from its takeFresh), taken in: its
   * courses and lakes, for the regions not worked out here already (the
   * same as they'd come out here), into the index.
   */
  share(d) {
    if (d.big) this.big.share(d.big);
    const had = (src) => (src[0] === 'r' ? this.riverRegions : this.streamRegions).has(Number(src.slice(1)));
    for (const river of d.list) if (!had(river.src)) this.#put(river, true);
    for (const k of d.rivers) this.riverRegions.add(k);
    for (const k of d.streams) this.streamRegions.add(k);
    for (const k of d.covered) this.covered.add(k);
  }

  #key(i, j) {
    return (i + 32768) * 65536 + (j + 32768);
  }

  /** Makes sure every river and stream that can reach (x, z) exists. */
  #ensure(x, z) {
    const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION);
    const key = this.#key(rx, rz);
    if (this.covered.has(key)) return;
    // (The land they're traced over leaves out the rubble at lava flows'
    // ends: see TerrainGenerator.lavaEnd.)
    const g = this.generator;
    g._noToe = (g._noToe ?? 0) + 1;
    try {
      for (let dz = -RIVER_REACH; dz <= RIVER_REACH; dz++) {
        for (let dx = -RIVER_REACH; dx <= RIVER_REACH; dx++) this.#ensureRivers(rx + dx, rz + dz);
      }
      for (let dz = -STREAM_REACH; dz <= STREAM_REACH; dz++) {
        for (let dx = -STREAM_REACH; dx <= STREAM_REACH; dx++) this.#ensureStreams(rx + dx, rz + dz);
      }
    } finally {
      g._noToe--;
    }
    this.covered.add(key);
    this.fresh.covered.push(key);
  }

  #ensureRivers(rx, rz) {
    const k = this.#key(rx, rz);
    if (this.riverRegions.has(k)) return;
    this.riverRegions.add(k);
    this.fresh.rivers.push(k);
    const src = this.src;
    this.src = `r${k}`;
    this.#craterLakes(rx, rz);
    this.#alpineLakes(rx, rz);
    this.#hotSprings(rx, rz);
    this.#oases(rx, rz);
    const g = this.generator;
    const rand = mulberry32(hash2(rx, rz, this.seed) * 4294967296);
    let made = 0;
    for (let attempt = 0; attempt < 110 && made < 6; attempt++) {
      const x = (rx + rand()) * REGION;
      const z = (rz + rand()) * REGION;
      // Rivers rise in the hills and foothills of the plains and savanna
      // (where mountain streams come down to meet them), not in the desert.
      if (g.getMountainness(x, z) > 0.45) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 14 || h > 140) continue;
      if (g.getBiomeWeights(x, z, {}).desert > 0.2) continue;
      if (this.big.waterAt(x, z, 80)) continue; // (not down in a great river's flood plain)
      const pond = this.#pond(x, z, 6 + rand() * 7, rand, 0.12);
      if (!pond) continue;
      const course = this.#trace(pond, 'creek');
      // (Long rivers first: at the start only a course of about half a
      // kilometre or more will do.)
      if (course && Rivers.#good(course, 'creek') && (attempt >= 25 || course.length * STEP >= 480)) {
        this.#add(course, pond, 'creek');
        made++;
      }
    }
    this.src = src;
  }

  #ensureStreams(rx, rz) {
    const k = this.#key(rx, rz);
    if (this.streamRegions.has(k)) return;
    this.streamRegions.add(k);
    this.fresh.streams.push(k);
    if (!Rivers.STREAMS) return;
    // Every creek a stream from here could meet must exist first (those
    // close enough to; one further off it may cross rather than join).
    const reach = STREAM_REACH + 1;
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) this.#ensureRivers(rx + dx, rz + dz);
    const src = this.src;
    this.src = `s${k}`;
    const g = this.generator;
    const rand = mulberry32(hash2(rx, rz, this.seed ^ 0x51ab) * 4294967296);
    let made = 0;
    const siblings = []; // points of streams already made here: a new one meeting one joins it
    for (let attempt = 0; attempt < 70 && made < 1; attempt++) {
      const x = (rx + rand()) * REGION;
      const z = (rz + rand()) * REGION;
      // Streams rise high in the ranges.
      if (g.getMountainness(x, z) < 0.3) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 45 || h > 240) continue;
      if (g.getBiomeWeights(x, z, {}).desert > 0.1) continue;
      // Every stream rises from a small tarn, where there's a hollow for one.
      if (this.big.waterAt(x, z, 80)) continue;
      const pond = this.#pond(x, z, 6 + rand() * 7, rand, 0.3);
      if (!pond) continue;
      const course = this.#trace(pond, 'stream', rand, siblings);
      if (course && Rivers.#good(course, 'stream')) {
        siblings.push(...course);
        this.#add(course, pond, 'stream', course.tarn);
        made++;
      }
    }
    if (Rivers.CASCADES) this.#cliffFalls(rx, rz, rand, siblings);
    this.src = src;
  }

  /**
   * Waterfalls off cliffs: now and then a spring on top of an escarpment
   * or a sea cliff (never a mesa) feeds a little stream that runs to the
   * edge and pours over it, into the sea or on down the land below.
   */
  #cliffFalls(rx, rz, rand, siblings) {
    const g = this.generator;
    for (let attempt = 0; attempt < 120; attempt++) {
      let x = (rx + rand()) * REGION;
      let z = (rz + rand()) * REGION;
      const f = g.getFeatures(x, z);
      if (f.mesa > 0.05) continue;
      if (!(f.escarp > 0.5 && f.escarpHeight > 6) && !(g.getSeaCliff(x, z) > 0.5)) continue;
      const h = g.getBaseHeight(x, z);
      if (h < this.seaLevel + 8) continue;
      // Find the nearest edge (where the land drops away sharply), and
      // put the spring a little way back from it on the top.
      let edge = null;
      for (let d = 30; d <= 180 && !edge; d += 30) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          if (h - g.getBaseHeight(x + Math.cos(a) * d, z + Math.sin(a) * d) > 8) {
            edge = { a, d };
            break;
          }
        }
      }
      if (!edge) continue;
      const back = Math.max(0, edge.d - 45);
      x += Math.cos(edge.a) * back;
      z += Math.sin(edge.a) * back;
      if (g.getFeatures(x, z).mesa > 0.05) continue;
      const pond = this.#pond(x, z, 4 + rand() * 3, rand, 0.3);
      if (!pond) continue;
      pond.cliff = true;
      const course = this.#trace(pond, 'stream', rand, siblings);
      if (!course || course.length < 4) continue;
      // It must really go over: one drop of 5 m or more between two points.
      let fall = 0;
      for (let i = 0; i < course.length - 1; i++) fall = Math.max(fall, course[i].level - course[i + 1].level);
      if (fall < 5) continue;
      siblings.push(...course);
      this.#add(course, pond, 'stream', course.tarn);
      return;
    }
  }

  /**
   * Only courses that look right are kept (fewer, but all good ones):
   *  - long enough to be worth having;
   *  - a stream mostly runs gently down a valley: its overall fall is
   *    modest, with a few waterfalls at most, spaced well apart (no
   *    staircase straight down a mountainside);
   *  - a river winds a little rather than running dead straight.
   */
  static #good(points, kind) {
    const n = points.length;
    let length = 0;
    for (let i = 1; i < n; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    const straight = Math.hypot(points[n - 1].x - points[0].x, points[n - 1].z - points[0].z);
    if (kind === 'creek') return length >= 450 && length / Math.max(1, straight) >= 1.04;
    if (length < 350) return false;
    if ((points[0].level - points[n - 1].level) / length > 0.14) return false;
    let falls = 0, last = -99;
    for (let i = 0; i < n - 1; i++) {
      const run = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z) || 1;
      if ((points[i].level - points[i + 1].level) / run > 0.4) {
        if (i - last < 3) return false; // falls must be well apart
        falls++;
        last = i;
      }
    }
    return falls <= 6;
  }

  /**
   * A pond at (x, z) of about radius r, on ground no steeper than
   * `maxSlope`: its water sits just below the lowest point of the land
   * around it, so it's held in; that lowest point is its outlet.
   */
  #pond(x, z, r, rand, maxSlope) {
    const g = this.generator;
    const gx = (g.getBaseHeight(x + 4, z) - g.getBaseHeight(x - 4, z)) / 8;
    const gz = (g.getBaseHeight(x, z + 4) - g.getBaseHeight(x, z - 4)) / 8;
    if (Math.hypot(gx, gz) > maxSlope) return null;
    let low = Infinity, outlet = [1, 0];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const h = g.getBaseHeight(x + Math.cos(a) * r * 1.2, z + Math.sin(a) * r * 1.2);
      if (h < low) {
        low = h;
        outlet = [Math.cos(a), Math.sin(a)];
      }
    }
    const level = low - 0.35;
    if (level < this.seaLevel + 1) return null;
    return {
      x, z, r, level, seed: rand() * 100, outlet,
      // The course leaves from its outlet, starting inside the pond so the
      // water runs on unbroken.
      start: { x: x + outlet[0] * r * 0.55, z: z + outlet[1] * r * 0.55 },
    };
  }

  /** The pond or lake whose water covers (x, z), if any. */
  #pondAt(x, z) {
    const list = this.cells.get(this.#key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    for (const item of list) {
      const p = item.pond;
      if (p && Math.hypot(x - p.x, z - p.z) < Rivers.pondRadius(p, x, z) + 1) return p;
    }
    return null;
  }

  /** The river (not stream) water at (x, z), if any: { level } */
  #riverAt(x, z) {
    const list = this.riverCells.get(this.#key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    const m = {};
    for (const seg of list) {
      Rivers.#measure(seg, x, z, m);
      if (m.d < m.half + 1.5) return { level: m.level };
    }
    return null;
  }

  /**
   * Follows the land downhill from a source ({ x, z, level } or a pond).
   * Returns the course (points with x, z, level, width), or null if it
   * never gets to open water.
   */
  #trace(source, kind, rand, siblings = null) {
    const g = this.generator;
    // A stream that reaches the lowlands carries on as a river.
    let stream = kind === 'stream';
    let lowland = 0;
    const points = [];
    let px = source.start ? source.start.x : source.x;
    let pz = source.start ? source.start.z : source.z;
    let dir = source.outlet ? [...source.outlet] : null;
    let level = source.level;
    // (A spring on a cliff top stays a stream until it has gone over the edge.)
    let fell = !source.cliff;
    // How far the land must fall below a pool before the stream drops out
    // of it: real falls, not a staircase of little steps.
    let dropNeeded = stream ? 3 + rand() * 3 : 0;
    let poolStart = 0; // (where the pool now forming began)
    // The pool now forming lies no higher than the land anywhere along it
    // or across its breadth: it's dug down into the slope as a trench,
    // never held up above the land. (Only so far, though: a deep hollow it
    // passes over is just deeper water.)
    const settle = () => {
      let low = level;
      for (let k = poolStart; k < points.length; k++) if (points[k].cascade && points[k].low !== undefined) low = Math.min(low, points[k].low - 0.3);
      low = Math.max(low, level - 8);
      if (low >= level) return;
      for (let k = poolStart; k < points.length; k++) if (points[k].cascade) points[k].level = Math.min(points[k].level, low);
      level = Math.max(this.seaLevel + 0.03, low);
    };
    const steps = stream ? STREAM_STEPS + RIVER_STEPS : RIVER_STEPS;
    for (let i = 0; i < steps; i++) {
      const b = g.getBaseHeight(px, pz);
      const gx = (g.getBaseHeight(px + 4, pz) - g.getBaseHeight(px - 4, pz)) / 8;
      const gz = (g.getBaseHeight(px, pz + 4) - g.getBaseHeight(px, pz - 4)) / 8;
      const slope = Math.hypot(gx, gz);
      if (stream && fell && i > 8 && slope < 0.15 && g.getMountainness(px, pz) < 0.15) {
        stream = false;
        lowland = points.length;
      }
      if (stream && i >= STREAM_STEPS) return null;
      // Never out into a desert or a dune sea (along the edge of one, where
      // it meets the savanna, at most).
      // (Only looked at where it's dry enough for one: deserts are all drier
      // than 0.67 by TerrainGenerator.broadDryness.)
      if (i % 4 === 0 && this.big.dry(px, pz) > 0.55) {
        const w = g.getBiomeWeights(px, pz, {});
        if (w.desert + w.saltFlat > 0.5) return null;
      }
      // Rivers keep to gentle country (streams tumble down anything).
      if (!stream && slope > 0.45) return null;
      // Circling back on itself: it's stuck in a hollow.
      if (i > 10 && points.some((p, k) => k < points.length - 10 && Math.hypot(p.x - px, p.z - pz) < 40)) return kind === 'stream' ? this.#tarn(points, rand, lowland) : null;

      let dx, dz;
      if (slope > 0.004) {
        dx = -gx / slope;
        dz = -gz / slope;
      } else if (dir) {
        [dx, dz] = dir; // flat: carry on the way it was going
      } else {
        return null;
      }
      if (dir) {
        // Momentum, so it bends smoothly instead of zig-zagging (less for
        // streams, which follow the fall of the land closely).
        const keep = stream ? 0.45 : 0.65;
        dx = dir[0] * keep + dx * (1 - keep);
        dz = dir[1] * keep + dz * (1 - keep);
      }
      // A slow meander.
      const a = this.meander.noise2D(px * 0.004, pz * 0.004) * (stream ? 0.2 : 0.25);
      const ca = Math.cos(a), sa = Math.sin(a);
      [dx, dz] = [dx * ca - dz * sa, dx * sa + dz * ca];
      const l = Math.hypot(dx, dz) || 1;
      dir = [dx / l, dz / l];

      // The water only ever falls. Rivers, and streams on gentle ground,
      // follow the land a little below it. On steep ground a stream steps
      // down in cascades: a pool dug level into the slope, until the land
      // falls away below it, then a waterfall over the pool's lip into the
      // next pool, and so on down the mountain.
      // Rivers cut down into the land, deeper as they grow; streams on
      // gentle ground too.
      const target = b - (stream ? (slope > 0.15 ? 0.5 : 1.1) : 1.3 + Math.min(1.1, (points.length * STEP) / 700));
      const cascade = stream && slope > 0.15 && Rivers.CASCADES;
      if (cascade) {
        // Steep ground: a pool held level behind its rock lip, until the
        // land has fallen well away below it; then the water pours over
        // in one fall into the next pool, dug a little into the slope.
        if (target < level - dropNeeded) {
          settle();
          const next = Math.max(this.seaLevel + 0.03, Math.min(target - 0.8, level - 0.3));
          if (level - next > 3) fell = true;
          if (points.length) points.push({ x: px - dir[0] * 4, z: pz - dir[1] * 4, level: level - 0.02, width: 0, cascade: true, lip: true });
          poolStart = points.length;
          level = next;
          dropNeeded = 3 + rand() * 3;
        } else {
          level = Math.max(this.seaLevel + 0.03, level - 0.02);
        }
      } else if (stream) {
        settle(); // (the pool it has left, if any)
        level = Math.max(this.seaLevel + 0.03, Math.min(level - 0.02, target));
        poolStart = points.length + 1; // (any pool starts after this)
      } else {
        settle();
        poolStart = points.length + 1;
        // A river eases down into its trench (no sudden step at its source)
        // but never runs above the land.
        level = Math.max(this.seaLevel + 0.03, Math.min(level - 0.02, Math.max(target, level - 0.35), b - 0.4));
      }
      // (The lowest of the land here, across a pool's breadth.)
      const low = cascade ? Math.min(b, g.getBaseHeight(px - dir[1] * 3.6, pz + dir[0] * 3.6), g.getBaseHeight(px + dir[1] * 3.6, pz - dir[0] * 3.6)) : b;
      points.push({ x: px, z: pz, level, width: 0, cascade, base: b, low });

      // Reaching a lake up in the hills (an alpine lake, a tarn...): it
      // runs into it, rather than on down under its water in steps.
      if (i > 3) {
        const lake = this.#pondAt(px, pz);
        if (lake && lake.level <= level + 0.3) {
          const last = points[points.length - 1];
          last.level = Math.max(lake.level, Math.min(last.level, lake.level + 0.05));
          return points.length >= 10 ? Rivers.#widen(points, kind === 'stream', lowland) : null;
        }
      }
      // Reaching a great river: it runs into it, and ends there. (Never on
      // across it: where it has cut down below the river's water, its last
      // stretch is held up level with the river, so the two waters meet.)
      const big = this.big.waterAt(px, pz, 0);
      if (big && big.inside) {
        for (const p of points) p.level = Math.max(p.level, big.level);
        const last = points[points.length - 1];
        last.level = Math.max(big.level, Math.min(last.level, big.level + 0.05));
        points.push({ x: px + dir[0] * STEP, z: pz + dir[1] * STEP, level: last.level, width: 0 });
        return points.length >= 10 ? Rivers.#widen(points, kind === 'stream', lowland) : null;
      }
      if (b < this.seaLevel) {
        // Into a lake or the sea: carry on a little way so the mouth opens out.
        points.push({ x: px + dir[0] * STEP, z: pz + dir[1] * STEP, level, width: 0 });
        return Rivers.#widen(points, kind === 'stream', lowland);
      }
      if (kind === 'stream' && i > 3) {
        // Reaching a river (or another stream from here): it joins it.
        const sibling = siblings && siblings.find((p) => Math.hypot(p.x - px, p.z - pz) < 7 && p.level <= level + 0.3);
        const found = sibling ? { level: sibling.level } : this.#riverAt(px, pz);
        // (Only into water no higher than its own: never up into a river.)
        const river = found && found.level <= level + 0.3 ? found : null;
        if (river) {
          const last = points[points.length - 1];
          last.level = Math.max(river.level, Math.min(last.level, river.level + 0.05));
          return points.length >= 10 ? Rivers.#widen(points, true, lowland) : null;
        }
      }
      // Ground rising ahead of it: it would need a gorge. (A stream pools
      // in the hollow short of it, rather than dug into the rise.)
      if (b - level > (stream ? 9 : 6.5)) {
        points.pop();
        return kind === 'stream' ? this.#tarn(points, rand, lowland) : null;
      }
      px += dir[0] * STEP;
      pz += dir[1] * STEP;
    }
    return null;
  }

  /**
   * A stream caught in a hollow high in the mountains pools there: it ends
   * in a small tarn at its last point, its water no higher than the
   * stream's and held in by the land around it.
   */
  #tarn(points, rand, lowland) {
    if (points.length < 10) return null;
    const last = points[points.length - 1];
    const pond = this.#pond(last.x, last.z, 6 + rand() * 7, rand, Infinity);
    if (!pond) return null;
    pond.level = Math.min(pond.level, last.level);
    if (last.level - pond.level > 4) return null; // it would have to drop into a pit
    last.level = Math.max(pond.level, last.level);
    const course = Rivers.#widen(points, true, lowland);
    if (course) course.tarn = pond;
    return course;
  }

  /**
   * Widths along a course: a trickle at its source, broadening with its
   * length. A stream stays narrow (to 4 m) in the mountains; if it runs on
   * into the lowlands (from point `lowland`) it broadens there like a river.
   */
  static #widen(points, stream, lowland = 0) {
    if (points.length < (stream ? 10 : 15)) return null;
    const n = points.length;
    // Water never runs uphill.
    for (let i = 1; i < n; i++) points[i].level = Math.min(points[i].level, points[i - 1].level);
    const length = n * STEP;
    if (!stream || lowland === 0) {
      const end = stream ? Math.min(4, Math.max(1.6, 1.2 + length / 250)) : Math.min(13, Math.max(2.2, 1.4 + length / 110));
      const start = stream ? 1 : 1.3;
      points.forEach((p, i) => {
        p.width = start + (end - start) * Math.pow(i / (n - 1), 0.7);
      });
      return stream ? Rivers.#terraces(points) : points;
    }
    const mid = Math.min(4, Math.max(1.6, 1.2 + (lowland * STEP) / 250));
    const end = Math.min(13, Math.max(mid + 0.5, mid + ((n - lowland) * STEP) / 110));
    points.forEach((p, i) => {
      p.width = i < lowland ? 1 + (mid - 1) * Math.pow(i / lowland, 0.7) : mid + (end - mid) * Math.pow((i - lowland) / Math.max(1, n - 1 - lowland), 0.7);
    });
    return Rivers.#terraces(points);
  }

  /**
   * Cascades spread out into broad terraces: wide pools stepping down the
   * slope, the water pouring over each lip across its whole width (easing
   * in and out over a couple of points).
   */
  static #terraces(points) {
    const wide = points.map((p) => (p.cascade ? 1 : 0));
    points.forEach((p, i) => {
      const t = Math.max(wide[i], 0.5 * (wide[i - 1] ?? 0), 0.5 * (wide[i + 1] ?? 0));
      if (t > 0) p.width = Math.max(p.width, p.width + (5 - p.width) * t);
      // (The water pours over a lip narrower than the pools either side.)
      if (p.lip) p.width = Math.min(p.width, 2.2 + p.width * 0.25);
    });
    return points;
  }

  #index(map, item, minX, minZ, maxX, maxZ) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
        const k = this.#key(cx, cz);
        let list = map.get(k);
        if (!list) map.set(k, (list = []));
        list.push(item);
      }
    }
  }

  /**
   * Lakes in the craters of the volcanoes whose tops are in this region
   * (some craters are dry): held in by the crater itself, a third of the
   * way up from its floor.
   */
  #craterLakes(rx, rz) {
    const g = this.generator;
    if (!g.volcanoes) return;
    const x0 = rx * REGION, z0 = rz * REGION;
    for (const c of g.volcanoes(x0, z0, x0 + REGION, z0 + REGION)) {
      if (!c.lake || c.x < x0 || c.x >= x0 + REGION || c.z < z0 || c.z >= z0 + REGION) continue;
      const pond = { x: c.x, z: c.z, r: c.rc * 0.6, level: g.craterLevel ? g.craterLevel(c) : g.getBaseHeight(c.x, c.z) + c.depth * 0.35, seed: c.seed, natural: true, crater: true };
      this.#put({ points: [], pond, tarn: null, kind: 'lake' });
    }
  }

  /**
   * Alpine lakes: now and then a lake a few dozen metres across lies in
   * a hollow high in the mountains, milky turquoise with rock flour from
   * the glaciers (at most one per region).
   */
  #alpineLakes(rx, rz) {
    const g = this.generator;
    const rand = mulberry32(hash2(rx, rz, this.seed ^ 0xa1be) * 4294967296);
    if (rand() > 0.65) return;
    for (let attempt = 0; attempt < 25; attempt++) {
      let x = (rx + rand()) * REGION, z = (rz + rand()) * REGION;
      if (g.getMountainness(x, z) < 0.3) continue; // (up in the ranges, or down in their foothills)
      // Roll on down into the hollow below.
      for (let k = 0; k < 30; k++) {
        const gx = (g.getBaseHeight(x + 5, z) - g.getBaseHeight(x - 5, z)) / 10;
        const gz = (g.getBaseHeight(x, z + 5) - g.getBaseHeight(x, z - 5)) / 10;
        const slope = Math.hypot(gx, gz);
        if (slope < 0.02) break;
        x -= (gx / slope) * 8;
        z -= (gz / slope) * 8;
      }
      // (A hollow belongs to the region it lies in, so two never share one.)
      if (Math.floor(x / REGION) !== rx || Math.floor(z / REGION) !== rz) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 60 || h > 260) continue;
      const bw = g.getBiomeWeights(x, z, {});
      if (bw.temperate + bw.pine < 0.5) continue;
      const pond = this.#pond(x, z, 20 + rand() * 25, rand, 0.35);
      if (!pond || pond.level < h + 0.3) continue; // it needs a real hollow to hold it
      pond.tint = 1;
      pond.alpine = true;
      this.#put({ points: [], pond, tarn: null, kind: 'lake' });
      return;
    }
  }

  /** The pools of the hot springs in this region (see TerrainGenerator.hotSprings). */
  #hotSprings(rx, rz) {
    const g = this.generator;
    if (!g.hotSprings) return;
    const x0 = rx * REGION, z0 = rz * REGION;
    const rand = mulberry32(hash2(rx, rz, this.seed ^ 0x40c5) * 4294967296);
    for (const sp of g.hotSprings(x0, z0, x0 + REGION, z0 + REGION)) {
      if (sp.geyser || sp.x < x0 || sp.x >= x0 + REGION || sp.z < z0 || sp.z >= z0 + REGION) continue;
      const pond = this.#pond(sp.x, sp.z, sp.r, rand, Infinity);
      if (!pond) continue;
      pond.tint = 2;
      pond.hot = true;
      this.#put({ points: [], pond, tarn: null, kind: 'lake' });
    }
  }

  /** The pools of the oases in this region (see TerrainGenerator.oases). */
  #oases(rx, rz) {
    const g = this.generator;
    if (!g.oases) return;
    const x0 = rx * REGION, z0 = rz * REGION;
    const rand = mulberry32(hash2(rx, rz, this.seed ^ 0x0a51) * 4294967296);
    for (const o of g.oases(x0, z0, x0 + REGION, z0 + REGION)) {
      const pond = this.#pond(o.x, o.z, o.r, rand, Infinity);
      if (!pond) continue;
      pond.oasis = true;
      this.#put({ points: [], pond, tarn: null, kind: 'lake' });
    }
  }

  #add(points, pond, kind, tarn = null) {
    // (Its bends rounded off: a rolling average of its course, some 30 m
    // either way, twice over, tapering to its two ends, which stay put.)
    for (let pass = 0; pass < 2; pass++) {
      const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
      for (let k = 1; k < points.length - 1; k++) {
        const R = Math.min(4, k, points.length - 1 - k);
        let sx = 0, sz = 0, w = 0;
        for (let q = -R; q <= R; q++) {
          const f = R + 1 - Math.abs(q);
          sx += xs[k + q] * f;
          sz += zs[k + q] * f;
          w += f;
        }
        points[k].x = sx / w;
        points[k].z = sz / w;
      }
    }
    // (And any bend still sharp, near its ends where the average tapers off,
    // eased out: nowhere does it turn more than BEND at one point.)
    const P = easeBends(points.map((p) => [p.x, p.z]), BEND);
    points.forEach((p, k) => {
      p.x = P[k][0];
      p.z = P[k][1];
    });
    this.#put({ points, pond, tarn, kind });
  }

  /**
   * A course (or a lake) into the index and the list, as it is (smoothed
   * already): yours, or one worked out by another thread (see share).
   */
  #put(river, shared = false) {
    const { points, pond, tarn, kind } = river;
    river.id = this.list.length;
    river.src ??= this.src; // (the region it was made for)
    if (!shared) this.fresh.list.push(river);
    let along = 0; // metres from the source
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, la: a.level, lb: b.level, wa: a.width, wb: b.width, stream: kind === 'stream', along };
      along += Math.hypot(b.x - a.x, b.z - a.z);
      const r = Rivers.channel(Math.max(a.width, b.width) / 2) + Math.min(INFLUENCE, Rivers.valleyWidth(kind === 'stream', seg.along + STEP) * 1.3);
      const box = [Math.min(a.x, b.x) - r, Math.min(a.z, b.z) - r, Math.max(a.x, b.x) + r, Math.max(a.z, b.z) + r];
      this.#index(this.cells, seg, ...box);
      if (kind === 'creek') this.#index(this.riverCells, seg, ...box);
    }
    for (const p of [pond, tarn]) {
      if (!p) continue;
      const r = p.r * 1.3 + 30;
      this.#index(this.cells, { pond: p }, p.x - r, p.z - r, p.x + r, p.z + r);
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const grow = (x, z, m) => {
      minX = Math.min(minX, x - m); maxX = Math.max(maxX, x + m);
      minZ = Math.min(minZ, z - m); maxZ = Math.max(maxZ, z + m);
    };
    for (const p of points) grow(p.x, p.z, 20);
    for (const p of [pond, tarn]) if (p) grow(p.x, p.z, p.r * 1.3 + 2);
    river.bounds = { minX, maxX, minZ, maxZ };
    this.list.push(river);
  }

  /** Segments and ponds that may shape (x, z). */
  #near(x, z) {
    this.#ensure(x, z);
    return this.cells.get(this.#key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  /**
   * Half-width of the channel kept under water, given half the water's
   * width: never narrower than 2.4 m, so the terrain's triangles (about
   * 2 m where the mesh is refined along rivers) always have corners in it
   * and can't bridge over the water.
   */
  static channel(halfWidth) {
    return Math.max(halfWidth + 0.6, 2.4);
  }

  /**
   * How far above the water the bank stands, `e` metres out from the
   * channel's edge: a strip of wet mud at the water, then a steep cut bank
   * (slope `k`) up to the level of the land, then the valley side.
   */
  static bankRise(e, k) {
    if (e < 0.6) return 0;
    const top = 0.6 + 3.3 / k;
    return e < top ? (e - 0.6) * k : 3.3 + (e - top) * 0.45;
  }

  /**
   * How far out (m, from the channel's edge) a river's valley reaches: a
   * river's broadens downstream, from some 40 m near its source to 150 m
   * for a big river in the lowlands; a mountain stream's is a narrow V.
   */
  static valleyWidth(stream, along) {
    return stream ? 24 : 40 + Math.min(110, along * 0.05);
  }

  /**
   * How far above the water the land stands `e` metres out from the
   * channel's edge, in a valley `w` wide: the bank (see bankRise), then a
   * gentle floor, the sides rising ever more steeply out to the valley's
   * rim, where it meets the lie of the land.
   */
  static valleyRise(e, k, w, stream) {
    if (e < 0.6) return 0;
    const top = 0.6 + 3.3 / k;
    if (e < top) return (e - 0.6) * k;
    const u = e - top, f = u / w;
    return 3.3 + u * (stream ? 0.3 : 0.08) + f * f * w * (stream ? 1.6 : 1.1);
  }

  /**
   * Distance to a segment's nearest point from (x, z), and there its water
   * level, water half-width (`water`) and channel half-width (`half`).
   */
  static #measure(seg, x, z, out) {
    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
    const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / (dx * dx + dz * dz || 1)));
    out.d = Math.hypot(seg.ax + dx * t - x, seg.az + dz * t - z);
    out.end = t <= 0 || t >= 1; // beyond the stretch's start or end
    out.level = seg.la + (seg.lb - seg.la) * t;
    out.water = (seg.wa + (seg.wb - seg.wa) * t) / 2;
    out.half = Rivers.channel(out.water);
    out.stream = seg.stream;
    // Which way it flows, and how steeply (level drop per metre).
    const run = Math.hypot(dx, dz) || 1;
    out.fx = dx / run;
    out.fz = dz / run;
    out.drop = (seg.la - seg.lb) / run;
    out.along = seg.along + t * run;
    return out;
  }

  /** A pond's (wobbly) radius in the direction of (x, z). */
  static pondRadius(pond, x, z) {
    const a = Math.atan2(z - pond.z, x - pond.x);
    return pond.r * (1 + 0.14 * Math.sin(a * 3 + pond.seed) + 0.07 * Math.sin(a * 5 + pond.seed * 2));
  }

  /**
   * The land at (x, z) with rivers, streams and ponds carved into it, given
   * the natural height `base`, and `rough`, small bumps to add where the
   * water doesn't shape the land (they fade out towards the banks).
   */
  carve(x, z, base, rough = 0) {
    // (The bumps fade out towards a great river's water too.)
    rough *= smoothstep(4, 14, this.big.edgeAt(x, z));
    const near = this.#near(x, z);
    if (!near) return base + rough;
    let h = base;
    const m = this._m;
    // Under water the bed is set just under the water level (dug down, or
    // built up where the land dips), so water never hangs above the land.
    // Where channels overlap (at a bend, or around a waterfall), the bed is
    // the lowest of the stretches the point lies alongside; a stretch that
    // only reaches it with its end (the pool below a waterfall, say) may
    // lower it just a little, so a pool's sides are never dug down to the
    // pool below it.
    let bank = -Infinity, inWater = false, wet = Infinity, wetEnd = Infinity, k = 0;
    let edge = Infinity; // metres out from the nearest channel's edge
    for (const item of near) {
      if (item.pond) {
        const pond = item.pond;
        const d = Math.hypot(x - pond.x, z - pond.z);
        const r = Rivers.pondRadius(pond, x, z);
        const rr = Math.max(r, 2.4);
        edge = Math.min(edge, d - rr);
        if (d < rr) {
          const t = d / rr;
          wet = Math.min(wet, pond.level - 0.15 - (0.6 + pond.r * 0.12) * (1 - t * t));
          inWater = true;
        } else {
          // (A crater's own walls hold its lake: they're left as they are.)
          // (Further out the bank steepens and steepens, so it meets rising
          // land as a slope, never leaving a wall cut into a mountainside.)
          if (!pond.natural) {
            const e = d - rr;
            h = Math.min(h, pond.level + 0.2 + Rivers.bankRise(e, 0.6) + 0.07 * Math.max(0, e - 8) ** 2);
          }
          if (d < rr + 8) bank = Math.max(bank, pond.level + 0.2 - Math.max(0, d - rr - 3.2) * 0.6);
        }
        continue;
      }
      const { d, level, half, water } = Rivers.#measure(item, x, z, m);
      const w = Rivers.valleyWidth(item.stream, m.along);
      if (d > half + w * 1.3) continue;
      edge = Math.min(edge, d - half);
      if (d < half) {
        // Under the water: the bed, then the channel's margin just below the
        // water level out to its edge.
        const s = d / water;
        const bed = d < water ? level - 0.3 - (0.4 + water * 0.15) * (1 - s * s) : level - 0.15;
        if (m.end) wetEnd = Math.min(wetEnd, bed);
        else wet = Math.min(wet, bed);
        inWater = true;
      } else {
        // The bank: mud at the water, a steep cut bank (steeper in some
        // places than others) up to the land, then the valley side.
        // (The land eases into the valley, rather than meeting it in a crease.)
        if (k === 0) k = 0.75 + 0.55 * (this.meander.noise2D(x * 0.02 + 40, z * 0.02) + 1);
        h = smin(h, level + 0.2 + Rivers.valleyRise(d - half, item.stream ? k * 0.8 : k, w, item.stream), d - half < 8 ? 0.5 : 4);
        if (d < half + 8) bank = Math.max(bank, level + 0.2 - Math.max(0, d - half - 3.2) * 0.6);
      }
    }
    if (inWater) {
      if (wet === Infinity) wet = wetEnd;
      else if (wetEnd < wet) wet = Math.max(wetEnd, wet - 0.4);
      if (base <= this.seaLevel - 0.5) return Math.min(h, wet);
      // The bed is dug down, or built up a little over a dip; but where the
      // land falls well away below the water (over a cliff, down a fall),
      // it's left as it is: the water falls through the air there, rather
      // than on a channel built out from the rock.
      return wet < base + 1.5 ? wet : h;
    }
    // Banks never lower than the water beside them (except where the land
    // drops away under a fall, and never built up out of a lake or the sea:
    // no strips of land along a creek out into the water it runs into).
    if (bank > h && bank - base < 1.5) h += (bank - h) * smoothstep(this.seaLevel - 0.1, this.seaLevel + 0.4, base);
    return h + rough * smoothstep(5, 14, edge);
  }

  /**
   * The river, stream or pond at (x, z), if any within `margin` metres of
   * its channel: { d (from the middle), level, water (water half-width),
   * half (channel half-width), stream, pond }. Else null.
   */
  at(x, z, margin = 0) {
    const near = this.#near(x, z) ?? [];
    let best = null;
    const m = {};
    for (const item of near) {
      if (item.pond) {
        const pond = item.pond;
        const d = Math.hypot(x - pond.x, z - pond.z);
        const r = Rivers.pondRadius(pond, x, z);
        const half = Math.max(r, 4.5);
        if (d > half + margin) continue;
        if (!best || d - half < best.d - best.half) best = { d, level: pond.level, water: r, half, stream: false, pond: true, crater: !!pond.crater, alpine: !!pond.alpine, hot: !!pond.hot, oasis: !!pond.oasis, fx: 0, fz: 0, drop: 0 };
        continue;
      }
      Rivers.#measure(item, x, z, m);
      if (m.d > m.half + margin) continue;
      if (!best || m.d - m.half < best.d - best.half) best = { ...m, pond: false };
    }
    const big = this.big.waterAt(x, z, margin);
    if (big && (!best || big.d - big.half < best.d - best.half)) best = { ...big, stream: false, pond: false, big: true };
    return best;
  }

  /**
   * How far (x, z) lies from the edge of the nearest water, of any river,
   * stream or pond, if within `margin` metres of it: { e (metres out from
   * the water's edge, the edge of the channel or pond that carve() keeps
   * under the water; below 0 under the water), stream }, or null. Every
   * water that covers the point counts (a stream running into a pond is
   * under the pond's water all the way in), so the colours painted under
   * the water and along the banks (see TerrainGenerator.surfaceColor)
   * follow the water's real edge.
   */
  shoreAt(x, z, margin = 0) {
    const near = this.#near(x, z) ?? [];
    let best = null;
    const m = this._s ?? (this._s = {});
    for (const item of near) {
      let e, stream = false;
      if (item.pond) {
        const pond = item.pond;
        e = Math.hypot(x - pond.x, z - pond.z) - Math.max(Rivers.pondRadius(pond, x, z), 2.4);
      } else {
        Rivers.#measure(item, x, z, m);
        e = m.d - m.half;
        stream = m.stream;
      }
      if (e <= margin && (!best || e < best.e)) best = { e, stream };
    }
    const big = this.big.waterAt(x, z, margin);
    if (big && (!best || big.d - big.half < best.e)) best = { e: big.d - big.half, stream: false };
    return best;
  }

  /**
   * The water surface at (x, z), within `margin` metres of a channel:
   * { level, fx, fz (flow direction), drop (per metre), along (metres from
   * its source), across (from its middle, 1 at the channel's edge), inset
   * (how far in from the channel's edge), pond }, or null. Where channels overlap (two
   * rivers meeting, a stream's pools and falls) the water takes the lowest
   * of their levels, just as carve() digs the bed under the lowest, so the
   * two run together as one.
   */
  waterAt(x, z, margin = 0) {
    const creek = this.#creekWaterAt(x, z, margin);
    const b = this.big.waterAt(x, z, margin);
    if (!b) return creek;
    const big = { level: b.level, fx: b.fx, fz: b.fz, drop: b.drop, along: b.along, across: b.across, inset: b.inset, pond: false, tint: 0, big: true };
    if (!creek) return big;
    // (Inside a great river's channel, its water: a creek running into it
    // never shows through as a step.)
    if (b.inside) return big;
    return creek.inset > 0 || creek.inset > big.inset ? creek : big;
  }

  #creekWaterAt(x, z, margin) {
    const near = this.#near(x, z);
    if (!near) return null;
    const m = this._w ?? (this._w = {});
    let best = null, bestGap = Infinity; // nearest channel
    let low = null, lowEnd = null; // lowest channel we're inside (alongside a stretch, or past its end)
    for (const item of near) {
      let d, half, level, fx = 0, fz = 0, drop = 0, along = 0, end = false, pond = false;
      if (item.pond) {
        const p = item.pond;
        d = Math.hypot(x - p.x, z - p.z);
        half = Math.max(Rivers.pondRadius(p, x, z), 2.4);
        level = p.level;
        pond = true;
      } else {
        Rivers.#measure(item, x, z, m);
        ({ d, half, level, fx, fz, drop, along, end } = m);
      }
      if (d > half + margin) continue;
      const found = { level, fx, fz, drop, along, across: d / half, inset: half - d, pond, tint: pond ? item.pond.tint || 0 : 0 };
      if (d - half < bestGap) {
        bestGap = d - half;
        best = found;
      }
      if (d < half) {
        if (end) {
          if (!lowEnd || level < lowEnd.level) lowEnd = found;
        } else if (!low || level < low.level) low = found;
      }
    }
    if (!best) return null;
    if (!low) return lowEnd ?? best;
    // (As carve(): a stretch reaching here only with its end lowers it a little at most.)
    if (lowEnd && lowEnd.level < low.level) return { ...low, level: Math.max(lowEnd.level, low.level - 0.4) };
    return low;
  }

  /** Rivers and streams that pass near a box (for drawing their water). */
  inBox(minX, minZ, maxX, maxZ) {
    this.#ensure((minX + maxX) / 2, (minZ + maxZ) / 2);
    const creeks = this.list.filter(({ bounds: b }) => b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ);
    const big = this.big.inBox(minX, minZ, maxX, maxZ);
    return big.length ? creeks.concat(big) : creeks;
  }
}
