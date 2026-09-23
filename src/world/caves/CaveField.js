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
 *  - Entrances: some hillsides get a sloping ramp dug from the surface down
 *    into the nearest tunnel or room. Near an entrance ("mouth zone") the
 *    field also includes the ground surface itself, so the mouth and the
 *    ground around it are one seamless mesh.
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

    this.bottom = -30; // deepest cave floor (m)
    this.top = 55; // highest cave roof, away from entrances (m)
    this.cover = 7; // rock kept between caves and the ground above

    this.entranceRegion = 256; // one possible entrance per region this size
    this.mouthRadius = 3.4; // ramp radius
    this.zoneRadius = 12; // around a mouth the cave mesh also draws the ground
    this.cutRadius = 9.5; // terrain triangles this close to a mouth are removed
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
    // run level rather than plunge.
    const f = 1 / 72;
    const a = this.tunnelA.noise3D(x * f, y * f * 1.7, z * f);
    const b = this.tunnelB.noise3D(x * f, y * f * 1.7, z * f);
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
   * Picks a hillside in the region and digs a ramp from it, sloping into the
   * hill at about 30 degrees, until it reaches cave air. Regions with no
   * suitable hillside, or no cave within reach, get no entrance.
   */
  #makeEntrance(rx, rz) {
    const g = this.generator;
    const R = this.entranceRegion;
    const rand = mulberry32(hash2(rx, rz, this.seed) * 4294967296);
    if (rand() > 0.85) return null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const x = (rx + 0.2 + rand() * 0.6) * R;
      const z = (rz + 0.2 + rand() * 0.6) * R;
      const h = g.getHeight(x, z);
      if (h < this.seaLevel + 8) continue;
      const gx = (g.getHeight(x + 3, z) - g.getHeight(x - 3, z)) / 6;
      const gz = (g.getHeight(x, z + 3) - g.getHeight(x, z - 3)) / 6;
      const slope = Math.hypot(gx, gz);
      if (slope < 0.18 || slope > 1.2) continue;
      const dx = gx / slope;
      const dz = gz / slope; // uphill, into the hill

      for (let L = 14; L <= 80; L += 4) {
        const tx = x + dx * L;
        const tz = z + dz * L;
        const ty = h - 2 - L * 0.58;
        if (ty < this.bottom + 3) break;
        const H = g.getHeight(tx, tz);
        const rr = this.regionRock(tx, tz);
        // End in cave air with solid floor close below (no ramp into a pit)...
        if (this.caves(tx, ty, tz, H, rr) < -1.5 && this.caves(tx, ty - 4.5, tz, H, rr) > 0 && this.#rampHasFloor(x, h, z, dx, dz, L, ty)) {
          // Start the ramp a little outside the hill so the mouth opens cleanly.
          const start = { x: x - dx * 3, y: h + 0.8, z: z - dz * 3 };
          const end = { x: tx, y: ty, z: tz };
          return {
            id: `${rx},${rz}`,
            mouth: { x, y: h, z },
            start,
            end,
            r: this.mouthRadius,
            minY: Math.min(start.y, end.y) - this.mouthRadius,
            maxY: Math.max(start.y, end.y) + this.mouthRadius,
            bounds: {
              minX: Math.min(start.x, end.x) - this.zoneRadius,
              maxX: Math.max(start.x, end.x) + this.zoneRadius,
              minZ: Math.min(start.z, end.z) - this.zoneRadius,
              maxZ: Math.max(start.z, end.z) + this.zoneRadius,
            },
          };
        }
      }
    }
    return null;
  }

  /**
   * ...never pass over a void on the way down (so you can walk back up), and
   * keep rock overhead once past the mouth (so it never breaks the surface).
   */
  #rampHasFloor(x, h, z, dx, dz, L, ty) {
    const g = this.generator;
    for (let t = 0.1; t < 0.97; t += 0.08) {
      const px = x + dx * L * t;
      const pz = z + dz * L * t;
      const py = h + 0.8 + (ty - h - 0.8) * t;
      const H = g.getHeight(px, pz);
      if (this.caves(px, py - this.mouthRadius - 2, pz, H, this.regionRock(px, pz)) < 0) return false;
      if (L * t > this.cutRadius - 2 && H - (py + this.mouthRadius) < 2.5) return false;
    }
    return true;
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

  /** Signed distance to an entrance ramp (a capsule): negative inside. */
  static ramp(e, x, y, z) {
    const { start: a, end: b } = e;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (dx * dx + dy * dy + dz * dz)));
    const qx = a.x + dx * t - x, qy = a.y + dy * t - y, qz = a.z + dz * t - z;
    // Flatten the bottom a little so the ramp has a walkable floor.
    const floorLift = Math.max(0, -qy - e.r * 0.55) * 1.8;
    return Math.sqrt(qx * qx + qy * qy + qz * qz) + floorLift - e.r;
  }

  /** Horizontal distance from (x, z) to the nearest mouth in a list. */
  static mouthDistance(entrances, x, z) {
    let best = Infinity;
    for (const e of entrances) best = Math.min(best, Math.hypot(x - e.mouth.x, z - e.mouth.z));
    return best;
  }

  /**
   * The full field used for meshing and collision: caves, entrance ramps,
   * and (only inside a mouth zone) the ground surface. Positive = solid.
   */
  density(x, y, z, entrances, H = this.generator.getHeight(x, z), regionRock = this.regionRock(x, z)) {
    let d = this.caves(x, y, z, H, regionRock);
    for (const e of entrances) {
      if (y < e.minY - 2 || y > e.maxY + 2) continue;
      d = Math.min(d, CaveField.ramp(e, x, y, z));
    }
    if (entrances.length && CaveField.mouthDistance(entrances, x, z) < this.zoneRadius) d = Math.min(d, H - y);
    return d;
  }
}
