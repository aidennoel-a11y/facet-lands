import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../noise/random.js';

const REGION = 768; // up to three rivers (and three streams) rise per region this size
const RIVER_REACH = 3; // a river stays within this many regions of where it rises
const STREAM_REACH = 2; // likewise a stream
const CELL = 32; // spatial index cell (m)
const STEP = 8; // path spacing (m)
const RIVER_STEPS = 260; // a river is at most ~2 km long
const STREAM_STEPS = 170; // a stream at most ~1.4 km
const INFLUENCE = 26; // how far past its channel a river still shapes the land (m)

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
 * match (see carve()): a bed below the water; a channel at least 9 m wide
 * kept just under the water level, so the terrain's ~4 m triangles always
 * have corners in it and never bridge over the water; banks just above the
 * water (raised where the land beside would be lower, so water never
 * floats); and valley sides rising from there. Ponds get a basin and rim.
 *
 * Generated region by region from the seed. Streams are only traced once
 * every river that could reach them exists, so any chunk (or worker),
 * asking in any order, sees the same water.
 */
export class Rivers {
  constructor(generator, { seaLevel }) {
    this.generator = generator;
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
  }

  #key(i, j) {
    return (i + 32768) * 65536 + (j + 32768);
  }

  /** Makes sure every river and stream that can reach (x, z) exists. */
  #ensure(x, z) {
    const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION);
    const key = this.#key(rx, rz);
    if (this.covered.has(key)) return;
    for (let dz = -RIVER_REACH; dz <= RIVER_REACH; dz++) {
      for (let dx = -RIVER_REACH; dx <= RIVER_REACH; dx++) this.#ensureRivers(rx + dx, rz + dz);
    }
    for (let dz = -STREAM_REACH; dz <= STREAM_REACH; dz++) {
      for (let dx = -STREAM_REACH; dx <= STREAM_REACH; dx++) this.#ensureStreams(rx + dx, rz + dz);
    }
    this.covered.add(key);
  }

  #ensureRivers(rx, rz) {
    const k = this.#key(rx, rz);
    if (this.riverRegions.has(k)) return;
    this.riverRegions.add(k);
    const g = this.generator;
    const rand = mulberry32(hash2(rx, rz, this.seed) * 4294967296);
    let made = 0;
    for (let attempt = 0; attempt < 40 && made < 3; attempt++) {
      const x = (rx + rand()) * REGION;
      const z = (rz + rand()) * REGION;
      // Rivers rise in the hills and foothills of the plains and savanna
      // (where mountain streams come down to meet them), not in the desert.
      if (g.getMountainness(x, z) > 0.35) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 10 || h > 110) continue;
      if (g.getBiomeWeights(x, z, {}).desert > 0.2) continue;
      const pond = this.#pond(x, z, 6 + rand() * 7, rand, 0.12);
      if (!pond) continue;
      const course = this.#trace(pond, 'river');
      if (course) {
        this.#add(course, pond, 'river');
        made++;
      }
    }
  }

  #ensureStreams(rx, rz) {
    const k = this.#key(rx, rz);
    if (this.streamRegions.has(k)) return;
    // Every river a stream from here could meet must exist first.
    const reach = STREAM_REACH + RIVER_REACH;
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) this.#ensureRivers(rx + dx, rz + dz);
    this.streamRegions.add(k);
    const g = this.generator;
    const rand = mulberry32(hash2(rx, rz, this.seed ^ 0x51ab) * 4294967296);
    let made = 0;
    const siblings = []; // points of streams already made here: a new one meeting one joins it
    for (let attempt = 0; attempt < 70 && made < 4; attempt++) {
      const x = (rx + rand()) * REGION;
      const z = (rz + rand()) * REGION;
      // Streams rise high in the ranges.
      if (g.getMountainness(x, z) < 0.3) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 45 || h > 240) continue;
      if (g.getBiomeWeights(x, z, {}).desert > 0.1) continue;
      // Half rise from a small tarn where there's a hollow for one.
      const pond = rand() < 0.5 ? this.#pond(x, z, 5 + rand() * 6, rand, 0.12) : null;
      const start = pond ?? { x, z, level: h - 0.5, outlet: null };
      const course = this.#trace(start, 'stream', rand, siblings);
      if (course) {
        siblings.push(...course);
        this.#add(course, pond, 'stream', course.tarn);
        made++;
      }
    }
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
      // The course leaves from its outlet.
      start: { x: x + outlet[0] * r, z: z + outlet[1] * r },
    };
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
    const steps = stream ? STREAM_STEPS + RIVER_STEPS : RIVER_STEPS;
    for (let i = 0; i < steps; i++) {
      const b = g.getBaseHeight(px, pz);
      const gx = (g.getBaseHeight(px + 4, pz) - g.getBaseHeight(px - 4, pz)) / 8;
      const gz = (g.getBaseHeight(px, pz + 4) - g.getBaseHeight(px, pz - 4)) / 8;
      const slope = Math.hypot(gx, gz);
      if (stream && i > 8 && slope < 0.15 && g.getMountainness(px, pz) < 0.15) {
        stream = false;
        lowland = points.length;
      }
      if (stream && i >= STREAM_STEPS) return null;
      // Rivers keep to gentle country (streams tumble down anything).
      if (!stream && slope > 0.3) return null;
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
      const a = this.meander.noise2D(px * 0.004, pz * 0.004) * (stream ? 0.2 : 0.35);
      const ca = Math.cos(a), sa = Math.sin(a);
      [dx, dz] = [dx * ca - dz * sa, dx * sa + dz * ca];
      const l = Math.hypot(dx, dz) || 1;
      dir = [dx / l, dz / l];

      // The water falls steadily, following the land a little below it
      // (so a stream pours down steep ground and over cliffs).
      level = Math.max(this.seaLevel + 0.1, Math.min(level - 0.02, b - (stream ? 0.5 : 0.8)));
      points.push({ x: px, z: pz, level, width: 0 });

      if (b < this.seaLevel - 0.3) {
        // Into a lake or the sea: carry on a little way so the mouth opens out.
        points.push({ x: px + dir[0] * STEP, z: pz + dir[1] * STEP, level, width: 0 });
        return Rivers.#widen(points, kind === 'stream', lowland);
      }
      if (kind === 'stream' && i > 3) {
        // Reaching a river (or another stream from here): it joins it.
        const sibling = siblings && siblings.find((p) => Math.hypot(p.x - px, p.z - pz) < 7 && p.level <= level + 0.3);
        const river = sibling ? { level: sibling.level } : this.#riverAt(px, pz);
        if (river) {
          const last = points[points.length - 1];
          last.level = Math.max(river.level, Math.min(last.level, river.level + 0.05));
          return points.length >= 10 ? Rivers.#widen(points, true, lowland) : null;
        }
      }
      // Ground rising ahead of it: it would need a gorge.
      if (b - level > (stream ? 9 : 5)) return kind === 'stream' ? this.#tarn(points, rand, lowland) : null;
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
    const length = n * STEP;
    if (!stream || lowland === 0) {
      const end = stream ? Math.min(4, Math.max(1.6, 1.2 + length / 250)) : Math.min(13, Math.max(2.2, 1.4 + length / 110));
      const start = stream ? 1 : 1.3;
      points.forEach((p, i) => {
        p.width = start + (end - start) * Math.pow(i / (n - 1), 0.7);
      });
      return points;
    }
    const mid = Math.min(4, Math.max(1.6, 1.2 + (lowland * STEP) / 250));
    const end = Math.min(13, Math.max(mid + 0.5, mid + ((n - lowland) * STEP) / 110));
    points.forEach((p, i) => {
      p.width = i < lowland ? 1 + (mid - 1) * Math.pow(i / lowland, 0.7) : mid + (end - mid) * Math.pow((i - lowland) / Math.max(1, n - 1 - lowland), 0.7);
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

  #add(points, pond, kind, tarn = null) {
    const river = { points, pond, tarn, kind, id: this.list.length };
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, la: a.level, lb: b.level, wa: a.width, wb: b.width, stream: kind === 'stream' };
      const r = Rivers.channel(Math.max(a.width, b.width) / 2) + INFLUENCE;
      const box = [Math.min(a.x, b.x) - r, Math.min(a.z, b.z) - r, Math.max(a.x, b.x) + r, Math.max(a.z, b.z) + r];
      this.#index(this.cells, seg, ...box);
      if (kind === 'river') this.#index(this.riverCells, seg, ...box);
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
   * width: never narrower than 4.5 m, so the terrain's triangles (about
   * 4 m) always have corners in it and can't bridge over the water.
   */
  static channel(halfWidth) {
    return Math.max(halfWidth + 0.8, 4.5);
  }

  /**
   * Distance to a segment's nearest point from (x, z), and there its water
   * level, water half-width (`water`) and channel half-width (`half`).
   */
  static #measure(seg, x, z, out) {
    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
    const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / (dx * dx + dz * dz || 1)));
    out.d = Math.hypot(seg.ax + dx * t - x, seg.az + dz * t - z);
    out.level = seg.la + (seg.lb - seg.la) * t;
    out.water = (seg.wa + (seg.wb - seg.wa) * t) / 2;
    out.half = Rivers.channel(out.water);
    out.stream = seg.stream;
    return out;
  }

  /** A pond's (wobbly) radius in the direction of (x, z). */
  static pondRadius(pond, x, z) {
    const a = Math.atan2(z - pond.z, x - pond.x);
    return pond.r * (1 + 0.14 * Math.sin(a * 3 + pond.seed) + 0.07 * Math.sin(a * 5 + pond.seed * 2));
  }

  /** The land at (x, z) with rivers, streams and ponds carved into it, given the natural height `base`. */
  carve(x, z, base) {
    const near = this.#near(x, z);
    if (!near) return base;
    let h = base;
    const m = this._m;
    let bank = -Infinity, inWater = false;
    for (const item of near) {
      if (item.pond) {
        const pond = item.pond;
        const d = Math.hypot(x - pond.x, z - pond.z);
        const r = Rivers.pondRadius(pond, x, z);
        const rr = Math.max(r, 4.5);
        if (d < rr) {
          const t = d / rr;
          h = Math.min(h, pond.level - 0.1 - (0.5 + pond.r * 0.1) * (1 - t * t));
          inWater = true;
        } else {
          h = Math.min(h, pond.level + 0.2 + Math.max(0, d - rr - 1.5) * 0.45);
          if (d < rr + 6) bank = Math.max(bank, pond.level + 0.2 - Math.max(0, d - rr - 1.5) * 0.6);
        }
        continue;
      }
      const { d, level, half, water } = Rivers.#measure(item, x, z, m);
      if (d > half + INFLUENCE) continue;
      if (d < half) {
        // Under the water: the bed, then the channel's margin just below the
        // water level out to its edge.
        if (d < water) {
          const s = d / water;
          h = Math.min(h, level - 0.2 - (0.3 + water * 0.12) * (1 - s * s));
        } else {
          h = Math.min(h, level - 0.1);
        }
        inWater = true;
      } else {
        // Valley side: from just above the water up to the land.
        h = Math.min(h, level + 0.2 + Math.max(0, d - half - 1.5) * 0.5);
        if (d < half + 6) bank = Math.max(bank, level + 0.2 - Math.max(0, d - half - 1.5) * 0.6);
      }
    }
    // Banks never lower than the water beside them (except out in a lake or the sea).
    if (!inWater && bank > h && base > this.seaLevel - 0.5) h = bank;
    return h;
  }

  /**
   * The river, stream or pond at (x, z), if any within `margin` metres of
   * its channel: { d (from the middle), level, water (water half-width),
   * half (channel half-width), stream, pond }. Else null.
   */
  at(x, z, margin = 0) {
    const near = this.#near(x, z);
    if (!near) return null;
    let best = null;
    const m = {};
    for (const item of near) {
      if (item.pond) {
        const pond = item.pond;
        const d = Math.hypot(x - pond.x, z - pond.z);
        const r = Rivers.pondRadius(pond, x, z);
        const half = Math.max(r, 4.5);
        if (d > half + margin) continue;
        if (!best || d - half < best.d - best.half) best = { d, level: pond.level, water: r, half, stream: false, pond: true };
        continue;
      }
      Rivers.#measure(item, x, z, m);
      if (m.d > m.half + margin) continue;
      if (!best || m.d - m.half < best.d - best.half) best = { ...m, pond: false };
    }
    return best;
  }

  /** Rivers and streams that pass near a box (for drawing their water). */
  inBox(minX, minZ, maxX, maxZ) {
    this.#ensure((minX + maxX) / 2, (minZ + maxZ) / 2);
    return this.list.filter(({ bounds: b }) => b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ);
  }
}
