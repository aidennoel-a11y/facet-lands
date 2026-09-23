import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import { hash2, mulberry32 } from '../noise/random.js';

const REGION = 384; // metres; each region may hold one cave
const MAX_REACH = 320; // how far a cave can wander from its region
const STEP = 7; // metres between rings along a tunnel
const RING = 8; // corners per ring (low poly)
const MOUTH_SEGMENTS = 4; // segments near the entrance that may cut the terrain

const ROCK = [0x6f6a79, 0x77727f, 0x656170, 0x7f7a86];
const CEILING = 0x57535f;
const FLOOR = 0x5d5249;
const CRYSTALS = [0x6ff3ff, 0xb98bff, 0x7dffb0];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** Closest point on segment a-b to p: returns t in [0, 1] and squared distance. */
function segmentProjection(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2, 0, 1);
  const qx = ax + dx * t - px, qy = ay + dy * t - py, qz = az + dz * t - pz;
  return { t, d2: qx * qx + qy * qy + qz * qz };
}

/**
 * Worm-style caves that burrow into hillsides.
 *
 * Each 384 m region may hold one cave. It starts on a hillside, heads into
 * the hill and down, then wanders underground (staying well below the
 * surface and above sea level), sometimes swelling into a chamber, before
 * pinching shut. Everything is derived from the seed, so the same caves
 * come back every time.
 *
 * The cave is a chain of rings (`points`, each { x, y, z, r }) with a flat
 * floor. The first few segments also cut a hole in the terrain mesh so you
 * can walk in.
 */
export class CaveSystem {
  constructor(generator, { seaLevel }) {
    this.generator = generator;
    this.seaLevel = seaLevel;
    this.seed = generator.seed ^ 0x6c8e9cf5;
    this.regions = new Map();
    this.geometries = new Map();
  }

  region(rx, rz) {
    const key = `${rx},${rz}`;
    let caves = this.regions.get(key);
    if (!caves) {
      caves = this.#generate(rx, rz);
      this.regions.set(key, caves);
    }
    return caves;
  }

  /** Caves whose bounds come within `margin` of the box. */
  near(minX, minZ, maxX, maxZ, margin = 0) {
    const out = [];
    const r0x = Math.floor((minX - MAX_REACH) / REGION);
    const r1x = Math.floor((maxX + MAX_REACH) / REGION);
    const r0z = Math.floor((minZ - MAX_REACH) / REGION);
    const r1z = Math.floor((maxZ + MAX_REACH) / REGION);
    for (let rz = r0z; rz <= r1z; rz++) {
      for (let rx = r0x; rx <= r1x; rx++) {
        for (const cave of this.region(rx, rz)) {
          const b = cave.bounds;
          if (b.maxX + margin < minX || b.minX - margin > maxX || b.maxZ + margin < minZ || b.minZ - margin > maxZ) continue;
          out.push(cave);
        }
      }
    }
    return out;
  }

  #generate(rx, rz) {
    const g = this.generator;
    const rand = mulberry32(hash2(rx, rz, this.seed) * 4294967296);
    if (rand() > 0.6) return [];

    // Find a hillside: dry, not too flat, not a cliff.
    let start = null;
    for (let attempt = 0; attempt < 14 && !start; attempt++) {
      const x = (rx + 0.15 + rand() * 0.7) * REGION;
      const z = (rz + 0.15 + rand() * 0.7) * REGION;
      const h = g.getHeight(x, z);
      if (h < this.seaLevel + 10) continue;
      const gx = (g.getHeight(x + 3, z) - g.getHeight(x - 3, z)) / 6;
      const gz = (g.getHeight(x, z + 3) - g.getHeight(x, z - 3)) / 6;
      const slope = Math.hypot(gx, gz);
      if (slope < 0.25 || slope > 1.3) continue;
      start = { x, z, h, uphill: Math.atan2(gz, gx) };
    }
    if (!start) return [];

    const baseR = 3.6 + rand() * 1.6;
    const segments = 22 + Math.floor(rand() * 14);
    const chamberAt = rand() < 0.6 ? 8 + Math.floor(rand() * (segments - 14)) : -1;

    let yaw = start.uphill;
    let pitch = -0.28;
    const pos = new Vector3(start.x, start.h + baseR * 0.2, start.z);
    const points = [];
    for (let i = 0; i <= segments; i++) {
      let r = baseR * (0.85 + 0.3 * rand());
      if (i === 0) r = baseR * 1.15; // a slightly wider mouth
      if (chamberAt >= 0 && i >= chamberAt && i <= chamberAt + 3) r *= i === chamberAt || i === chamberAt + 3 ? 1.5 : 2.1;
      const last = i === segments;
      if (i >= segments - 2) r *= last ? 0.35 : 0.65; // pinch shut
      points.push({ x: pos.x, y: pos.y, z: pos.z, r });
      if (last) break;

      // Steer: dive into the hill, then wander, never breaking the surface.
      yaw += (rand() - 0.5) * 0.55;
      if (i >= 3) pitch = clamp(pitch + (rand() - 0.5) * 0.25, -0.3, 0.22);
      const nx = pos.x + Math.cos(yaw) * Math.cos(pitch) * STEP;
      const nz = pos.z + Math.sin(yaw) * Math.cos(pitch) * STEP;
      let ny = pos.y + Math.sin(pitch) * STEP;
      if (i + 1 > MOUTH_SEGMENTS) {
        const roof = g.getHeight(nx, nz) - (r * 1.6 + 5); // keep rock overhead (room for a chamber)
        if (ny > roof) {
          ny = Math.max(roof, pos.y - STEP * 0.9); // dive, but stay walkable
          pitch = Math.min(pitch, -0.2);
        }
        if (ny > roof + 1) break; // a valley we can't get under: end here
      }
      if (ny - r < this.seaLevel + 3) {
        if (i + 1 > MOUTH_SEGMENTS && g.getHeight(nx, nz) - (r + 5) < this.seaLevel + r + 3) break;
        ny = this.seaLevel + r + 3;
        pitch = Math.max(pitch, 0.1);
      }
      pos.set(nx, ny, nz);
    }
    // Make sure the tunnel ends in a pinch even if we stopped early.
    if (points.length < 6) return [];
    const tail = points.length - 1;
    points[tail].r = Math.min(points[tail].r, baseR * 0.35);
    points[tail - 1].r = Math.min(points[tail - 1].r, baseR * 0.65);

    const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
    for (const p of points) {
      bounds.minX = Math.min(bounds.minX, p.x - p.r);
      bounds.maxX = Math.max(bounds.maxX, p.x + p.r);
      bounds.minZ = Math.min(bounds.minZ, p.z - p.r);
      bounds.maxZ = Math.max(bounds.maxZ, p.z + p.r);
    }
    const mouth = points.slice(0, MOUTH_SEGMENTS + 1);
    const mouthBounds = {
      minX: Math.min(...mouth.map((p) => p.x - p.r)),
      maxX: Math.max(...mouth.map((p) => p.x + p.r)),
      minZ: Math.min(...mouth.map((p) => p.z - p.r)),
      maxZ: Math.max(...mouth.map((p) => p.z + p.r)),
    };
    return [{ id: `${rx},${rz}`, points, bounds, mouthBounds, entrance: points[0], crystalSeed: rand() }];
  }

  /**
   * Is this point inside a tunnel? Tests each segment as a capsule.
   * `scale` shrinks or grows the radius (e.g. 0.9 when cutting terrain).
   */
  #insideCave(cave, x, y, z, scale = 1, segmentLimit = Infinity, openMouth = false) {
    const pts = cave.points;
    const n = Math.min(pts.length - 1, segmentLimit);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1];
      const { t, d2 } = segmentProjection(a.x, a.y, a.z, b.x, b.y, b.z, x, y, z);
      // The tunnel starts at the mouth: nothing behind it counts as inside.
      if (openMouth && i === 0 && t <= 0) continue;
      const r = (a.r + (b.r - a.r) * t) * scale;
      if (d2 < r * r) return { a, b, t, r: a.r + (b.r - a.r) * t };
    }
    return null;
  }

  /** Should the terrain triangle whose centre is here be cut away? */
  cutsTerrain(caves, x, y, z) {
    for (const cave of caves) {
      const b = cave.mouthBounds;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (this.#insideCave(cave, x, y, z, 0.92, MOUTH_SEGMENTS, true)) return true;
    }
    return false;
  }

  /**
   * The highest tunnel roof directly under (x, z) and below `belowY`, or
   * -Infinity. Chunk skirts stop above this so they never wall off a cave.
   */
  roofUnder(caves, x, z, belowY) {
    let best = -Infinity;
    for (const cave of caves) {
      const b = cave.bounds;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      const pts = cave.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], c = pts[i + 1];
        const { t, d2 } = segmentProjection(a.x, 0, a.z, c.x, 0, c.z, x, 0, z);
        const r = (a.r + (c.r - a.r) * t) * 1.25;
        if (d2 > r * r) continue;
        const top = a.y + (c.y - a.y) * t + r;
        if (top < belowY && top > best) best = top;
      }
    }
    return best;
  }

  /** Is the ground surface at (x, z) a cave mouth (no terrain to stand on)? */
  isHole(x, z) {
    const y = this.generator.getHeight(x, z);
    return this.cutsTerrain(this.near(x, z, x, z), x, y, z);
  }

  /**
   * The cave floor under a point inside a tunnel, or null if the point
   * isn't inside one. `y` should be roughly chest height.
   */
  floorAt(x, y, z) {
    let best = null;
    for (const cave of this.near(x, z, x, z)) {
      const hit = this.#insideCave(cave, x, y, z, 1.05, Infinity, true);
      if (!hit) continue;
      const { a, b, t, r } = hit;
      const centreY = a.y + (b.y - a.y) * t;
      const floor = centreY - 0.5 * r;
      const ceiling = centreY + 0.75 * r;
      if (best === null || floor > best.floor) best = { floor, ceiling };
    }
    return best;
  }

  /** Low-poly tunnel mesh for a cave, in world coordinates (cached). */
  geometry(cave) {
    let g = this.geometries.get(cave.id);
    if (!g) {
      g = buildCaveGeometry(cave, this.generator);
      this.geometries.set(cave.id, g);
    }
    return g;
  }
}

/**
 * Rings of RING corners around each path point, joined into an inward-facing
 * tube. The bottom of every ring is flattened into a walkable floor, corners
 * are jittered for a rocky look, and near the mouth any corner that would
 * poke out of the hillside is pulled down onto it. Each vertex carries a
 * `skyLight` value: 1 at the mouth fading to near 0 deep inside, which the
 * cave material uses to dim daylight (but not torchlight).
 */
function buildCaveGeometry(cave, generator) {
  const pts = cave.points;
  const rings = [];
  const up = new Vector3(0, 1, 0);
  const dir = new Vector3();
  const side = new Vector3();
  const vert = new Vector3();
  let along = 0;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    dir.set(next.x - prev.x, next.y - prev.y, next.z - prev.z).normalize();
    side.crossVectors(dir, up).normalize();
    const localUp = new Vector3().crossVectors(side, dir).normalize();
    if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z);
    const light = clamp(1 - along / 38, 0.05, 1);

    const ring = [];
    for (let k = 0; k < RING; k++) {
      const angle = (k / RING) * Math.PI * 2 + 0.2;
      let s = Math.sin(angle) * 0.85;
      let c = Math.cos(angle);
      const floor = s < -0.5;
      if (floor) s = -0.5; // flat floor
      else {
        const jitter = 0.82 + hash2(i * 17 + k, 3, generator.seed) * 0.36;
        s *= jitter;
        c *= jitter;
      }
      vert.set(p.x, p.y, p.z).addScaledVector(side, c * p.r).addScaledVector(localUp, s * p.r);
      if (i <= MOUTH_SEGMENTS) {
        const ground = generator.getHeight(vert.x, vert.z);
        if (vert.y > ground - 0.25) vert.y = ground - 0.25; // tuck under the hillside
      }
      ring.push({ x: vert.x, y: vert.y, z: vert.z, light, floor });
    }
    rings.push(ring);
  }

  const positions = [];
  const colors = [];
  const sky = [];
  const color = new Color();
  const a = new Vector3();
  const b = new Vector3();
  const n = new Vector3();
  let faceIndex = 0;

  const addTri = (p0, p1, p2, isFloor) => {
    a.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    b.set(p2.x - p0.x, p2.y - p0.y, p2.z - p0.z);
    n.crossVectors(a, b).normalize();
    if (isFloor) color.set(FLOOR);
    else if (n.y < -0.5) color.set(CEILING);
    else color.set(ROCK[faceIndex % ROCK.length]);
    color.multiplyScalar(0.88 + hash2(faceIndex, 11, 99) * 0.24);
    faceIndex++;
    for (const q of [p0, p1, p2]) {
      positions.push(q.x, q.y, q.z);
      colors.push(color.r, color.g, color.b);
      sky.push(q.light);
    }
  };

  // Tube walls, wound so they face inwards.
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      const p00 = rings[i][k], p01 = rings[i][k2];
      const p10 = rings[i + 1][k], p11 = rings[i + 1][k2];
      const isFloor = p00.floor && p01.floor;
      addTri(p00, p01, p10, isFloor);
      addTri(p01, p11, p10, isFloor);
    }
  }
  // Cap the far end.
  const last = rings[rings.length - 1];
  const end = pts[pts.length - 1];
  const tip = { x: end.x + dir.x * end.r, y: end.y, z: end.z + dir.z * end.r, light: last[0].light, floor: false };
  for (let k = 0; k < RING; k++) addTri(last[k], last[(k + 1) % RING], tip, false);

  // Glowing crystals on the walls, deeper in.
  const crystals = [];
  const rand = mulberry32(Math.floor(cave.crystalSeed * 4294967296));
  for (let i = 5; i < rings.length - 1; i++) {
    if (rand() > 0.45) continue;
    const k = Math.floor(rand() * RING);
    const q = rings[i][k];
    if (q.floor) continue;
    const p = pts[i];
    const out = new Vector3(q.x - p.x, q.y - p.y, q.z - p.z).normalize();
    crystals.push({ x: q.x - out.x * 0.3, y: q.y - out.y * 0.3, z: q.z - out.z * 0.3, dir: out.negate(), hex: CRYSTALS[Math.floor(rand() * CRYSTALS.length)], size: 0.4 + rand() * 0.6 });
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  g.setAttribute('skyLight', new BufferAttribute(new Float32Array(sky), 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.crystals = crystals;
  return g;
}
