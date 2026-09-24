import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../noise/random.js';

const REGION = 768; // up to three river sources per region this size
const REACH = 3; // rivers run under 3 regions, so these many regions around a point hold every river that can reach it
const CELL = 32; // spatial index cell (m)
const STEP = 8; // river path spacing (m)
const MAX_STEPS = 260; // so a river is at most ~2 km long
const INFLUENCE = 26; // how far past its bank a river still shapes the land (m)

/**
 * Lowland rivers: each rises from a spring in the rolling hills of the
 * plains or savanna and follows the land downhill (steepest descent, with
 * momentum and a slow meander) until it runs into a lake or the sea. A
 * river that can't get there (it stalls on flat ground, meets rising
 * ground, steep ground, circles back on itself or runs too far) isn't
 * kept, so every river you see winds calmly into open water.
 *
 * A river's water level falls steadily along it, following the land a
 * little below the surface. The terrain is carved to match (see carve()):
 * a riverbed below the water, banks just above it (raised where the land
 * beside would be lower than the water, so water never floats over land),
 * and gentle valley sides rising from there. Rivers widen as they go.
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
    this.cells = new Map(); // index cell -> segments near it
    this.list = [];
    this._m = {};
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
    for (let attempt = 0; attempt < 40 && made < 3; attempt++) {
      const x = (rx + rand()) * REGION;
      const z = (rz + rand()) * REGION;
      // Springs rise in the hills of the plains and savanna: not in the
      // mountains, not in the desert.
      if (g.getMountainness(x, z) > 0.15) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 10 || h > 70) continue;
      if (g.getBiomeWeights(x, z, {}).desert > 0.2) continue;
      const points = this.#trace(x, z, h);
      if (points) {
        this.#add(points);
        made++;
      }
    }
  }

  /**
   * Follows the land downhill from a spring. Returns the course, or null if
   * it never reaches open water.
   */
  #trace(x, z, h0) {
    const g = this.generator;
    const points = [];
    let px = x, pz = z;
    let dir = null;
    let level = h0 - 0.6;
    for (let i = 0; i < MAX_STEPS; i++) {
      const b = g.getBaseHeight(px, pz);
      const gx = (g.getBaseHeight(px + 4, pz) - g.getBaseHeight(px - 4, pz)) / 8;
      const gz = (g.getBaseHeight(px, pz + 4) - g.getBaseHeight(px, pz - 4)) / 8;
      const slope = Math.hypot(gx, gz);
      // Only through gentle country: no rapids or falls.
      if (slope > 0.3) return null;
      // Circling back on itself: it's stuck in a hollow.
      if (i > 10 && points.some((p, k) => k < points.length - 10 && Math.hypot(p.x - px, p.z - pz) < 40)) return null;

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
        dx = dir[0] * 0.65 + dx * 0.35;
        dz = dir[1] * 0.65 + dz * 0.35;
      }
      // A slow meander.
      const a = this.meander.noise2D(px * 0.004, pz * 0.004) * 0.35;
      const ca = Math.cos(a), sa = Math.sin(a);
      [dx, dz] = [dx * ca - dz * sa, dx * sa + dz * ca];
      const l = Math.hypot(dx, dz) || 1;
      dir = [dx / l, dz / l];

      // The water falls steadily, following the land a little below it.
      level = Math.max(this.seaLevel + 0.1, Math.min(level - 0.02, b - 0.8));
      const width = 2.5 + Math.min(9, (i * STEP) / 140);
      points.push({ x: px, z: pz, level, width });

      if (b < this.seaLevel - 0.3) {
        // Into a lake or the sea: carry on a little way so the mouth opens out.
        points.push({ x: px + dir[0] * STEP, z: pz + dir[1] * STEP, level, width });
        return points.length >= 15 ? points : null;
      }
      // Ground rising ahead of it: it would need a gorge.
      if (b - level > 5) return null;
      px += dir[0] * STEP;
      pz += dir[1] * STEP;
    }
    return null;
  }

  #add(points) {
    const river = { points, id: this.list.length };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, la: a.level, lb: b.level, wa: a.width, wb: b.width };
      const r = Math.max(a.width, b.width) / 2 + INFLUENCE;
      for (let cz = Math.floor((Math.min(a.z, b.z) - r) / CELL); cz <= Math.floor((Math.max(a.z, b.z) + r) / CELL); cz++) {
        for (let cx = Math.floor((Math.min(a.x, b.x) - r) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + r) / CELL); cx++) {
          const k = this.#key(cx, cz);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(seg);
        }
      }
    }
    for (const p of points) {
      minX = Math.min(minX, p.x - 20); maxX = Math.max(maxX, p.x + 20);
      minZ = Math.min(minZ, p.z - 20); maxZ = Math.max(maxZ, p.z + 20);
    }
    river.bounds = { minX, maxX, minZ, maxZ };
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

  /** The land at (x, z) with rivers carved into it, given the natural height `base`. */
  carve(x, z, base) {
    const near = this.#near(x, z);
    if (!near) return base;
    let h = base;
    const m = this._m;
    let bank = -Infinity, inWater = false;
    for (const seg of near) {
      const { d, level, half } = Rivers.#measure(seg, x, z, m);
      if (d > half + INFLUENCE) continue;
      if (d < half) {
        const s = d / half;
        h = Math.min(h, level - (0.6 + half * 0.15) * (1 - s * s));
        inWater = true;
      } else {
        // Valley side: from just above the water up to the land.
        h = Math.min(h, level + 0.25 + Math.max(0, d - half - 2.5) * 0.5);
        if (d < half + 7) bank = Math.max(bank, level + 0.25 - Math.max(0, d - half - 2.5) * 0.6);
      }
    }
    // Banks never lower than the water beside them (except out in a lake or the sea).
    if (!inWater && bank > h && base > this.seaLevel - 0.5) h = bank;
    return h;
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
