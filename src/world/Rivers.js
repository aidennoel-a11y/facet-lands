import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../noise/random.js';

const REGION = 1024; // up to three river sources per region this size
const REACH = 3; // rivers run under 3 regions, so these many regions around a point hold every river that can reach it
const CELL = 32; // spatial index cell (m)
const STEP = 8; // river path spacing (m)
const MAX_STEPS = 300; // so a river is at most ~2.4 km long
const INFLUENCE = 26; // how far past its bank a river still shapes the land (m)

/**
 * Rivers: springs high in the mountains, each traced downhill over the
 * natural land (steepest descent, with some momentum and a slow meander)
 * until it reaches a lake or the sea. Rivers that can't get there within
 * ~2.4 km, or would need too deep a gorge, are dropped, so every river runs
 * from the mountains into standing water.
 *
 * A river's water level only ever falls along it, so it always flows
 * downhill. The terrain is carved to match (see carve()): a riverbed below
 * the water, low banks just above it, and valley sides rising from there.
 * Rivers widen as they go.
 *
 * Like everything else, rivers are generated on demand, region by region,
 * from the seed, so any chunk (or worker) sees the same rivers.
 */
export class Rivers {
  constructor(generator, { seaLevel }) {
    this.generator = generator;
    this.seaLevel = seaLevel;
    this.seed = generator.seed ^ 0x6c8e9cf5;
    this.meander = new SimplexNoise(this.seed);
    this.generated = new Set(); // regions whose rivers exist
    this.covered = new Set(); // regions whose whole neighbourhood is generated
    this.cells = new Map(); // index cell -> segments passing near it
    this.list = [];
  }

  #key(i, j) {
    return (i + 32768) * 65536 + (j + 32768);
  }

  /** Makes sure every river that can reach (x, z) exists. */
  #ensure(x, z) {
    const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION);
    const key = this.#key(rx, rz);
    if (this.covered.has(key)) return;
    for (let dz = -REACH; dz <= REACH; dz++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const k = this.#key(rx + dx, rz + dz);
        if (this.generated.has(k)) continue;
        this.generated.add(k);
        this.#generate(rx + dx, rz + dz);
      }
    }
    this.covered.add(key);
  }

  #generate(rx, rz) {
    const g = this.generator;
    const rand = mulberry32(hash2(rx, rz, this.seed) * 4294967296);
    let made = 0;
    for (let attempt = 0; attempt < 16 && made < 3; attempt++) {
      const x = (rx + rand()) * REGION;
      const z = (rz + rand()) * REGION;
      // Springs rise high in the mountains, away from the desert.
      if (g.getMountainness(x, z) < 0.45) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 50 || h > 190) continue;
      if (g.getBiomeWeights(x, z, {}).desert > 0.2) continue;
      const traced = this.#trace(x, z);
      if (traced) {
        this.#add(traced.points, traced.lake);
        made++;
      }
    }
  }

  /**
   * Follows the land downhill from a spring. Returns { points, lake } (the
   * lake it pools into, if it makes its own), or null if it never gets to
   * standing water.
   */
  #trace(x, z) {
    const g = this.generator;
    const points = [];
    let px = x, pz = z;
    let dir = null;
    let level = Infinity;
    for (let i = 0; i < MAX_STEPS; i++) {
      const b = g.getBaseHeight(px, pz);
      const gx = (g.getBaseHeight(px + 4, pz) - g.getBaseHeight(px - 4, pz)) / 8;
      const gz = (g.getBaseHeight(px, pz + 4) - g.getBaseHeight(px, pz - 4)) / 8;
      const slope = Math.hypot(gx, gz);
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
        // Momentum, so it bends smoothly instead of zig-zagging.
        dx = dir[0] * 0.72 + dx * 0.28;
        dz = dir[1] * 0.72 + dz * 0.28;
      }
      // A slow meander.
      const a = this.meander.noise2D(px * 0.004, pz * 0.004) * 0.35;
      const ca = Math.cos(a), sa = Math.sin(a);
      [dx, dz] = [dx * ca - dz * sa, dx * sa + dz * ca];
      const l = Math.hypot(dx, dz) || 1;
      dir = [dx / l, dz / l];

      // The water only ever falls: never above the land here, a little
      // lower each step, never below the sea.
      level = Math.max(this.seaLevel + 0.1, Math.min(level - 0.03, b - 0.8));
      const width = 5 + Math.min(9, (i * STEP) / 160);
      points.push({ x: px, z: pz, level, width });
      if (b < this.seaLevel - 0.3) {
        // Into a lake or the sea: carry on a little way so the mouths merge.
        points.push({ x: px + dir[0] * STEP, z: pz + dir[1] * STEP, level, width });
        return points.length >= 14 ? { points, lake: null } : null;
      }
      if (i >= 25 && b < this.seaLevel + 8 && slope < 0.05) {
        // Down on low, flat land with no water in reach: it pools into a
        // lake of its own, a little further on.
        const r = 30 + (hash2(Math.round(px), Math.round(pz), this.seed) * 35);
        const lake = { x: px + dir[0] * r * 0.8, z: pz + dir[1] * r * 0.8, r, seed: hash2(Math.round(pz), Math.round(px), this.seed) * 100 };
        points.push({ x: px + dir[0] * r * 0.5, z: pz + dir[1] * r * 0.5, level: this.seaLevel + 0.1, width });
        return { points, lake };
      }
      if (b - level > 12) return null; // it would need too deep a gorge
      px += dir[0] * STEP;
      pz += dir[1] * STEP;
    }
    return null;
  }

  #add(points, lake) {
    const river = { points, lake, id: this.list.length };
    if (lake) {
      // Index the lake like a segment of zero length, with its own reach.
      const seg = { lake };
      const r = lake.r * 1.3 + 70;
      for (let cz = Math.floor((lake.z - r) / CELL); cz <= Math.floor((lake.z + r) / CELL); cz++) {
        for (let cx = Math.floor((lake.x - r) / CELL); cx <= Math.floor((lake.x + r) / CELL); cx++) {
          const k = this.#key(cx, cz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(seg);
        }
      }
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, la: a.level, lb: b.level, wa: a.width, wb: b.width };
      const r = Math.max(a.width, b.width) / 2 + INFLUENCE;
      const x0 = Math.floor((Math.min(a.x, b.x) - r) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + r) / CELL);
      const z0 = Math.floor((Math.min(a.z, b.z) - r) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + r) / CELL);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = this.#key(cx, cz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(seg);
        }
      }
      minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
      minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    }
    river.bounds = { minX: minX - 20, maxX: maxX + 20, minZ: minZ - 20, maxZ: maxZ + 20 };
    this.list.push(river);
  }

  /** River segments that may shape (x, z). */
  #near(x, z) {
    this.#ensure(x, z);
    return this.cells.get(this.#key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  /** Distance, water level and half-width of a segment's nearest point to (x, z). */
  static #measure(seg, x, z, out) {
    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
    const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / (dx * dx + dz * dz)));
    out.d = Math.hypot(seg.ax + dx * t - x, seg.az + dz * t - z);
    out.level = seg.la + (seg.lb - seg.la) * t;
    out.half = (seg.wa + (seg.wb - seg.wa) * t) / 2;
    return out;
  }

  /**
   * The land at (x, z) with rivers carved into it, given the natural height
   * `base`: a riverbed below the water, low banks just above it (raised a
   * touch where the land dips, so water never spills), and valley sides
   * rising to meet the land.
   */
  carve(x, z, base) {
    const near = this.#near(x, z);
    if (!near) return base;
    let h = base;
    const m = this._m ?? (this._m = {});
    for (const seg of near) {
      if (seg.lake) {
        h = Math.min(h, this.#lakeBed(seg.lake, x, z, base));
        continue;
      }
      const { d, level, half } = Rivers.#measure(seg, x, z, m);
      if (d > half + INFLUENCE) continue;
      let river;
      if (d < half) {
        const s = d / half;
        river = Math.min(base, level - (0.9 + half * 0.22) * (1 - s * s));
      } else {
        river = Math.min(base, level + 0.1 + (d - half - 2) * 0.6);
        if (d < half + 2.5) river = Math.max(river, level + 0.1);
      }
      h = Math.min(h, river);
    }
    return h;
  }

  /**
   * A lake a river made for itself: a wobbly round basin dug below sea
   * level (so the water there fills it), its shore easing into the land.
   */
  #lakeBed(lake, x, z, base) {
    const dx = x - lake.x, dz = z - lake.z;
    const a = Math.atan2(dz, dx);
    const r = lake.r * (1 + 0.18 * Math.sin(a * 3 + lake.seed) + 0.1 * Math.sin(a * 5 + lake.seed * 2));
    const d = Math.hypot(dx, dz);
    if (d < r) return Math.min(base, this.seaLevel - 3.5 * (1 - (d / r) ** 2));
    // Shore: rising gently from the water's edge until it meets the land.
    return Math.min(base, this.seaLevel + (d - r) * 0.45);
  }

  /**
   * The river at (x, z), if any within `margin` metres of its water:
   * { d (from the middle), level, half (half-width) }. Else null.
   */
  at(x, z, margin = 0) {
    const near = this.#near(x, z);
    if (!near) return null;
    let best = null;
    const m = {};
    for (const seg of near) {
      if (seg.lake) continue;
      Rivers.#measure(seg, x, z, m);
      if (m.d > m.half + margin) continue;
      if (!best || m.d - m.half < best.d - best.half) best = { ...m };
    }
    return best;
  }

  /** Rivers that pass near a box (for drawing their water). */
  inBox(minX, minZ, maxX, maxZ) {
    this.#ensure((minX + maxX) / 2, (minZ + maxZ) / 2);
    return this.list.filter(({ bounds: b }) => b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ);
  }
}

