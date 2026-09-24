import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../noise/random.js';

const REGION = 1024; // up to three river sources per region this size
const REACH = 3; // rivers run under 3 regions, so these many regions around a point hold every river that can reach it
const CELL = 32; // spatial index cell (m)
const STEP = 8; // river path spacing (m)
const MAX_STEPS = 300; // so a river is at most ~2.4 km long
const INFLUENCE = 26; // how far past its bank a river still shapes the land (m)
const FALL_SLOPE = 0.22; // ground steeper than this: the river drops in waterfalls

/**
 * Rivers: each rises high in a mountain range, most often from a small
 * alpine lake (a tarn) sitting in a hollow, otherwise from a spring. From
 * there it follows the land downhill (steepest descent, with momentum and
 * a slow meander) until it runs into a lake or the sea. If it can't go on
 * (flat or hollow ground, or it would circle back on itself) it pools into
 * a lake of its own right there, so every river runs into standing water.
 *
 * A river's water level only ever falls along it. On gentle ground it
 * follows the land; on steep ground it runs level and then drops in a
 * waterfall, again and again, stepping down the mountainside. Rivers widen
 * as they go.
 *
 * The terrain is carved to match (see carve()): a riverbed below the
 * water, banks just above it (raised where the land beside would be lower
 * than the water, so water never floats over land), and valley sides
 * rising from there. Lakes get a basin and a rim the same way.
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
    this.cells = new Map(); // index cell -> segments and lakes near it
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
    for (let attempt = 0; attempt < 16 && made < 3; attempt++) {
      const x = (rx + rand()) * REGION;
      const z = (rz + rand()) * REGION;
      // Sources lie high in the mountains, away from the desert.
      if (g.getMountainness(x, z) < 0.45) continue;
      const h = g.getBaseHeight(x, z);
      if (h < 55 || h > 210) continue;
      if (g.getBiomeWeights(x, z, {}).desert > 0.2) continue;
      const river = this.#makeRiver(x, z, rand);
      if (river) {
        this.#add(river);
        made++;
      }
    }
  }

  /** Base height and its slope (gradient) at (x, z). */
  #ground(x, z) {
    const g = this.generator;
    const b = g.getBaseHeight(x, z);
    const gx = (g.getBaseHeight(x + 4, z) - g.getBaseHeight(x - 4, z)) / 8;
    const gz = (g.getBaseHeight(x, z + 4) - g.getBaseHeight(x, z - 4)) / 8;
    return { b, gx, gz, slope: Math.hypot(gx, gz) };
  }

  /**
   * A lake at (x, z) of about radius r: its water sits just below the
   * lowest point of the land around it, so it's held in by the land. The
   * lowest point is where it overflows (its outlet). Returns the lake with
   * { x, z, r, level, seed, outlet: [dx, dz] }.
   */
  #lake(x, z, r, maxLevel, rand) {
    const g = this.generator;
    let low = Infinity, outlet = [1, 0];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const h = g.getBaseHeight(x + Math.cos(a) * r * 1.1, z + Math.sin(a) * r * 1.1);
      if (h < low) {
        low = h;
        outlet = [Math.cos(a), Math.sin(a)];
      }
    }
    return { x, z, r, level: Math.min(maxLevel, low - 0.4), seed: rand() * 100, outlet };
  }

  /**
   * A whole river from a source near (x, z): its source lake (if any), its
   * course, and the lake it ends in (if it makes its own). Null if it's too
   * short to count.
   */
  #makeRiver(x, z, rand) {
    let start, source = null, width;
    const here = this.#ground(x, z);
    if (here.slope < 0.2 && rand() < 0.8) {
      // A tarn in a hollow: the river leaves from its lowest side.
      source = this.#lake(x, z, 12 + rand() * 14, Infinity, rand);
      if (here.b - source.level > 7) source = null; // no hollow here after all
    }
    if (source) {
      const [ox, oz] = source.outlet;
      start = { x: x + ox * source.r * 0.8, z: z + oz * source.r * 0.8, level: source.level, dir: source.outlet };
      width = 3.5;
    } else {
      // A spring: a trickle that widens.
      start = { x, z, level: here.b - 0.6, dir: null };
      width = 2.2;
    }
    const course = this.#trace(start, width, rand);
    if (!course || course.points.length < 12) return null;
    return { source, points: course.points, lake: course.lake };
  }

  /**
   * Follows the land downhill. Returns { points, lake }: the course, and
   * the lake it pools into if it makes its own (null when it reaches an
   * existing lake or the sea).
   */
  #trace(start, width0, rand) {
    const points = [];
    let px = start.x, pz = start.z;
    let dir = start.dir;
    let level = start.level;
    const pool = () => {
      const last = points[points.length - 1];
      const d = dir ?? [1, 0];
      const r = Math.min(45, 14 + last.width * 1.5 + rand() * 18);
      const lake = this.#lake(last.x + d[0] * r * 0.75, last.z + d[1] * r * 0.75, r, last.level, rand);
      lake.level = Math.max(lake.level, last.level - 8);
      // Run on into it (dropping into it, if it lies lower).
      points.push({ x: last.x + d[0] * r * 0.45, z: last.z + d[1] * r * 0.45, level: lake.level, width: last.width });
      return { points, lake: lake.level > this.seaLevel + 0.3 ? lake : null };
    };

    for (let i = 0; i < MAX_STEPS; i++) {
      const { b, gx, gz, slope } = this.#ground(px, pz);
      // Circling back on itself: it's in a hollow; it pools here.
      if (i > 10 && points.some((p, k) => k < points.length - 10 && Math.hypot(p.x - px, p.z - pz) < 40)) return pool();

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

      // The water only ever falls. On gentle ground it follows the land;
      // on steep ground it runs level, then drops in a waterfall into a
      // pool below and runs level again.
      const width = width0 + Math.min(10.5, (i * STEP) / 110);
      const target = b - 0.8;
      if (target < level - 0.02) {
        const fall = slope > FALL_SLOPE && i > 0;
        const next = Math.max(this.seaLevel + 0.1, fall ? target - 2.2 : target);
        if (fall && level - next > 1.2 && points.length) {
          // The lip of the fall, just before it.
          points.push({ x: px - dir[0] * 1.5, z: pz - dir[1] * 1.5, level: level - 0.02, width });
        }
        level = next;
      } else {
        level = Math.max(this.seaLevel + 0.1, level - 0.02);
      }
      points.push({ x: px, z: pz, level, width });

      if (b < this.seaLevel - 0.3) {
        // Into a lake or the sea: carry on a little way so the mouths merge.
        points.push({ x: px + dir[0] * STEP, z: pz + dir[1] * STEP, level, width });
        return { points, lake: null };
      }
      // Ground rising ahead of it (it's in a hollow) or low flat land far
      // from any water: it pools here.
      if (b - level > 6) return points.length >= 12 ? pool() : null;
      if (i >= 25 && b < this.seaLevel + 8 && slope < 0.05) return pool();
      px += dir[0] * STEP;
      pz += dir[1] * STEP;
    }
    return pool();
  }

  #index(item, minX, minZ, maxX, maxZ) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
        const k = this.#key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(item);
      }
    }
  }

  #add(river) {
    const { points } = river;
    river.id = this.list.length;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, la: a.level, lb: b.level, wa: a.width, wb: b.width };
      const r = Math.max(a.width, b.width) / 2 + INFLUENCE;
      this.#index(seg, Math.min(a.x, b.x) - r, Math.min(a.z, b.z) - r, Math.max(a.x, b.x) + r, Math.max(a.z, b.z) + r);
    }
    for (const lake of [river.source, river.lake]) {
      if (!lake) continue;
      const r = lake.r * 1.35 + 60;
      this.#index({ lake }, lake.x - r, lake.z - r, lake.x + r, lake.z + r);
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    const grow = (x, z, m) => {
      minX = Math.min(minX, x - m); maxX = Math.max(maxX, x + m);
      minZ = Math.min(minZ, z - m); maxZ = Math.max(maxZ, z + m);
    };
    for (const p of points) grow(p.x, p.z, 20);
    for (const lake of [river.source, river.lake]) if (lake) grow(lake.x, lake.z, lake.r * 1.35 + 2);
    river.bounds = { minX, maxX, minZ, maxZ };
    this.list.push(river);
  }

  /** River segments and lakes that may shape (x, z). */
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

  /** A lake's (wobbly) radius in the direction of (x, z). */
  static lakeRadius(lake, x, z) {
    const a = Math.atan2(z - lake.z, x - lake.x);
    return lake.r * (1 + 0.16 * Math.sin(a * 3 + lake.seed) + 0.08 * Math.sin(a * 5 + lake.seed * 2));
  }

  /**
   * The land at (x, z) with rivers and their lakes carved into it, given
   * the natural height `base`.
   */
  carve(x, z, base) {
    const near = this.#near(x, z);
    if (!near) return base;
    let h = base;
    const m = this._m;
    // The nearest water, for raising the bank beside it.
    let bank = -Infinity, inWater = false;
    for (const item of near) {
      if (item.lake) {
        const lake = item.lake;
        const r = Rivers.lakeRadius(lake, x, z);
        const d = Math.hypot(x - lake.x, z - lake.z);
        if (d < r) {
          const t = d / r;
          h = Math.min(h, lake.level - (1 + lake.r * 0.12) * (1 - t * t));
          inWater = true;
        } else {
          // Shore: rising gently from the water's edge until it meets the land.
          h = Math.min(h, lake.level + 0.1 + Math.max(0, d - r - 2) * 0.45);
          if (d < r + 7) bank = Math.max(bank, lake.level + 0.3 - Math.max(0, d - r - 2) * 0.6);
        }
        continue;
      }
      const { d, level, half } = Rivers.#measure(item, x, z, m);
      if (d > half + INFLUENCE) continue;
      if (d < half) {
        const s = d / half;
        h = Math.min(h, level - (0.7 + half * 0.2) * (1 - s * s));
        inWater = true;
      } else {
        h = Math.min(h, level + 0.25 + Math.max(0, d - half - 2.5) * 0.6);
        if (d < half + 7) bank = Math.max(bank, level + 0.25 - Math.max(0, d - half - 2.5) * 0.6);
      }
    }
    // Banks never lower than the water beside them (except out at sea).
    if (!inWater && bank > h && base > this.seaLevel - 0.5) h = bank;
    return h;
  }

  /**
   * The river or lake at (x, z), if any within `margin` metres of its
   * water: { d (from the middle / centre), level, half (half-width or
   * radius), lake }. Else null.
   */
  at(x, z, margin = 0) {
    const near = this.#near(x, z);
    if (!near) return null;
    let best = null;
    const m = {};
    for (const item of near) {
      if (item.lake) {
        const lake = item.lake;
        const d = Math.hypot(x - lake.x, z - lake.z);
        const r = Rivers.lakeRadius(lake, x, z);
        if (d > r + margin) continue;
        if (!best || d - r < best.d - best.half) best = { d, level: lake.level, half: r, lake: true };
        continue;
      }
      Rivers.#measure(item, x, z, m);
      if (m.d > m.half + margin) continue;
      if (!best || m.d - m.half < best.d - best.half) best = { ...m, lake: false };
    }
    return best;
  }

  /** Rivers that pass near a box (for drawing their water). */
  inBox(minX, minZ, maxX, maxZ) {
    this.#ensure((minX + maxX) / 2, (minZ + maxZ) / 2);
    return this.list.filter(({ bounds: b }) => b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ);
  }
}
