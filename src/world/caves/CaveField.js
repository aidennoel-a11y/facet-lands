import { SimplexNoise } from '../../noise/SimplexNoise.js';
import { hash2, mulberry32 } from '../../noise/random.js';

/**
 * The procedural cave field: for any point it says how far (roughly, in
 * metres) you are from cave air. Positive = solid rock, negative = air.
 *
 * Built like the terrain, from noise, so caves are endless and the same
 * seed always makes the same caves:
 *
 *  - Tunnels: where two 3D noise fields are both near zero at once. That
 *    happens along long, winding, branching lines, so tunnels form
 *    connected networks that run for kilometres.
 *  - Rooms: where a third, lower-frequency noise field peaks, big squat
 *    caverns open up. Tunnels run in and out of them, linking rooms into
 *    cave systems.
 *  - A regional mask switches caves off in some areas, and a band keeps
 *    them between `bottom` and `top`, always with `cover` metres of rock
 *    under the ground surface, so they never break through by accident.
 *  - Entrances: on hillsides and open ground, a winding tunnel is dug from
 *    the surface down into the network. The terrain mesh opens a hole where
 *    it sits over that tunnel, lined with a rock rim.
 */
export class CaveField {
  constructor(generator, { seaLevel, chunkSize }) {
    this.generator = generator;
    this.seaLevel = seaLevel;
    const seed = generator.seed ^ 0x2c1b3c6d;
    this.seed = seed;
    this.tunnelA = new SimplexNoise(seed + 1);
    this.tunnelB = new SimplexNoise(seed + 2);
    this.rooms = new SimplexNoise(seed + 3);
    this.region = new SimplexNoise(seed + 4);
    this.warp = new SimplexNoise(seed + 5);

    this.bottom = -30; // deepest cave floor (m)
    this.top = 55; // highest cave roof, away from entrances (m)
    this.cover = 7; // rock kept between caves and the ground above

    this.entranceRegion = 256; // one possible entrance per region this size
    this.mouthRadius = 3.4; // ramp radius
    this.zoneRadius = 12; // margin kept around an entrance's tunnel (bounds, grid height)
    this.cutRadius = 9.5; // roughly how far the opening reaches from the mouth point
    this.entrances = new Map();
    this.chunkSize = chunkSize;
  }

  /** Are there caves anywhere in this column? Cheap 2D check, used to skip work. */
  regionRock(x, z) {
    return (0.12 - this.region.noise2D(x * 0.0021, z * 0.0021)) * 60;
  }

  /**
   * Cave field without entrances or the ground surface. `H` is the terrain
   * height of this column and `regionRock` its regionRock() value (pass them
   * in when evaluating many points in one column).
   */
  caves(x, y, z, H, regionRock) {
    const ceiling = Math.min(this.top, H - this.cover);
    const rock = Math.max(regionRock, y - ceiling, this.bottom - y);
    if (rock > 10) return rock; // far from any cave: skip the 3D noise

    // Tunnels: both noises near zero. Squashed vertically so they tend to
    // run level rather than plunge, and sampled through a domain warp (a
    // slow 2D noise that shoves the coordinates around) so they snake and
    // twist instead of running in long smooth arcs.
    const wx = x + this.warp.noise2D(x / 95, z / 95) * 26;
    const wz = z + this.warp.noise2D(x / 95 + 40, z / 95 - 40) * 26;
    const wy = y + this.warp.noise2D(x / 70 - 80, z / 70 + 80) * 7;
    const f = 1 / 64;
    const a = this.tunnelA.noise3D(wx * f, wy * f * 1.7, wz * f);
    const b = this.tunnelB.noise3D(wx * f, wy * f * 1.7, wz * f);
    const tunnel = (Math.sqrt(a * a + b * b) - 0.16) * 34;

    // Rooms: broad, flattened blobs.
    const r = this.rooms.noise3D(x / 52, (y / 52) * 2.1, z / 52);
    const room = (0.42 - r) * 30;

    return Math.max(rock, Math.min(tunnel, room));
  }

  // --- Entrances ---------------------------------------------------------------

  /** The entrance in one region (or null), cached. */
  entrance(rx, rz) {
    const key = `${rx},${rz}`;
    if (this.entrances.has(key)) return this.entrances.get(key);
    const e = this.#makeEntrance(rx, rz);
    this.entrances.set(key, e);
    return e;
  }

  /**
   * Picks a spot in the region (a hillside or open ground) and digs a winding
   * tunnel down from it: a chain of short segments, each turning a little
   * left or right and sloping down about 25 degrees, until it reaches cave
   * air with a floor just below. Every segment must keep a floor under it
   * (no drops you can't climb back up) and, past the mouth, rock over it
   * (so it never breaks the surface). Regions with no spot that works get
   * no entrance.
   */
  #makeEntrance(rx, rz) {
    const g = this.generator;
    const R = this.entranceRegion;
    const rand = mulberry32(hash2(rx, rz, this.seed) * 4294967296);
    if (rand() > 0.85) return null;
    const r = this.mouthRadius;
    const segLength = 8;

    for (let attempt = 0; attempt < 16; attempt++) {
      const x = (rx + 0.2 + rand() * 0.6) * R;
      const z = (rz + 0.2 + rand() * 0.6) * R;
      const h = g.getHeight(x, z);
      if (h < this.seaLevel + 8) continue;
      const gx = (g.getHeight(x + 3, z) - g.getHeight(x - 3, z)) / 6;
      const gz = (g.getHeight(x, z + 3) - g.getHeight(x, z - 3)) / 6;
      const slope = Math.hypot(gx, gz);
      if (slope > 1.2) continue;
      // Into the hill on a slope; any direction on open ground, where the
      // first stretch dips more steeply to get under the surface quickly.
      const hillside = slope > 0.15;
      let yaw = hillside ? Math.atan2(gz, gx) : rand() * Math.PI * 2;

      const points = [{ x: x - Math.cos(yaw) * 2, y: h + 1, z: z - Math.sin(yaw) * 2 }];
      let travelled = 0;
      let ok = false;
      for (let seg = 0; seg < 12; seg++) {
        const p = points[points.length - 1];
        if (seg > 0) yaw += (rand() - 0.5) * 1.1; // turn up to ~30 degrees either way
        const pitch = !hillside && seg < 2 ? 0.62 : 0.44; // about 35 or 25 degrees down
        const run = Math.cos(pitch) * segLength;
        const q = { x: p.x + Math.cos(yaw) * run, y: p.y - Math.sin(pitch) * segLength, z: p.z + Math.sin(yaw) * run };
        if (q.y < this.bottom + 4) break;
        // Check along the new segment: floor below, and rock above once past the mouth.
        let valid = true;
        for (let t = 0.25; t <= 1.001 && valid; t += 0.25) {
          const sx = p.x + (q.x - p.x) * t, sy = p.y + (q.y - p.y) * t, sz = p.z + (q.z - p.z) * t;
          const H = g.getHeight(sx, sz);
          const rr = this.regionRock(sx, sz);
          if (this.caves(sx, sy - r - 2, sz, H, rr) < 0) valid = false; // a void under the tunnel
          const fromMouth = Math.hypot(sx - x, sz - z);
          if (fromMouth > this.cutRadius + 3 && H - (sy + r) < 2) valid = false; // too close to the surface
        }
        if (!valid) break;
        points.push(q);
        travelled += segLength;
        const H = g.getHeight(q.x, q.z);
        const rr = this.regionRock(q.x, q.z);
        if (travelled >= 16 && this.caves(q.x, q.y, q.z, H, rr) < -1.5 && this.caves(q.x, q.y - 4.5, q.z, H, rr) > 0) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;

      const segments = [];
      for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
      const xs = points.map((p) => p.x), ys = points.map((p) => p.y), zs = points.map((p) => p.z);
      return {
        id: `${rx},${rz}`,
        mouth: { x, y: h, z },
        start: points[0],
        end: points[points.length - 1],
        segments,
        r,
        minY: Math.min(...ys) - r * 1.4,
        maxY: Math.max(...ys) + r * 1.4,
        bounds: {
          minX: Math.min(...xs) - this.zoneRadius,
          maxX: Math.max(...xs) + this.zoneRadius,
          minZ: Math.min(...zs) - this.zoneRadius,
          maxZ: Math.max(...zs) + this.zoneRadius,
        },
      };
    }
    return null;
  }

  /** Entrances whose ramp or mouth zone comes near a box. */
  entrancesNear(minX, minZ, maxX, maxZ) {
    const R = this.entranceRegion;
    const reach = 100;
    const out = [];
    for (let rz = Math.floor((minZ - reach) / R); rz <= Math.floor((maxZ + reach) / R); rz++) {
      for (let rx = Math.floor((minX - reach) / R); rx <= Math.floor((maxX + reach) / R); rx++) {
        const e = this.entrance(rx, rz);
        if (!e) continue;
        const b = e.bounds;
        if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
        out.push(e);
      }
    }
    return out;
  }

  /** Signed distance to an entrance tunnel (a chain of capsules): negative inside. */
  static ramp(e, x, y, z) {
    let best = Infinity;
    for (let s = 0; s < e.segments.length; s++) {
      const [a, b] = e.segments[s];
      // The first stretch is wider, so the mouth opens generously.
      const r = s === 0 ? e.r * 1.4 : e.r;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (dx * dx + dy * dy + dz * dz)));
      const qx = a.x + dx * t - x, qy = a.y + dy * t - y, qz = a.z + dz * t - z;
      // Flatten the bottom a little so the tunnel has a walkable floor.
      const floorLift = Math.max(0, -qy - r * 0.55) * 1.8;
      best = Math.min(best, Math.sqrt(qx * qx + qy * qy + qz * qz) + floorLift - r);
    }
    return best;
  }
}
