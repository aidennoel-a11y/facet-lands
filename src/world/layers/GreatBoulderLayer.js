import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshLambertMaterial } from 'three';
import { hash2 } from '../../noise/random.js';
import { boulderMake, boulderRing, boulderRough, boulderWobble } from '../TerrainGenerator.js';

const TILE = 600; // (m: the boulders are drawn in tiles this size)
const REACH = 2600; // (m: drawn this far round you; they're big, and seen from far off)
const SIDES = 40, RINGS = 24;
const STONE = {
  bristle: [0xe6e2d8, 0xd8d4c8, 0xeeebe4, 0xccc8bc],
  granite: [0xc8b49a, 0xbca48c, 0xd0bca4, 0xb09c88],
};
const tint = new Color(), shade = new Color();

/**
 * The great boulders (see TerrainGenerator.greatBouldersIn): real rock, not
 * part of the land's height map, so their sides can curve in under them as
 * a boulder's do. Each one a lumpy, rounded, blocky shape, drawn with the
 * very shape the ground under you is worked out from (see main's groundAt),
 * so you stand on their tops and walk in under the curve of their sides.
 */
export class GreatBoulderLayer {
  constructor(scene) {
    this.generator = null;
    this.group = new Group();
    this.group.name = 'great boulders';
    scene.add(this.group);
    this.material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.tiles = new Map();
    this.wait = 0;
  }

  update(x, z, dt, generator, reach = REACH, loaded = () => true) {
    reach = Math.min(REACH, reach); // (never past where the land itself is drawn)
    // (A new world: its own boulders.)
    if (generator !== this.generator) {
      for (const mesh of this.tiles.values()) if (mesh) this.group.remove(mesh), mesh.geometry.dispose();
      this.tiles.clear();
      this.generator = generator;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 0.4;
    const ti = Math.floor(x / TILE), tj = Math.floor(z / TILE), R = Math.ceil(reach / TILE);
    const want = new Set();
    let built = 0;
    for (let j = tj - R; j <= tj + R; j++) for (let i = ti - R; i <= ti + R; i++) {
      const cx = (i + 0.5) * TILE - x, cz = (j + 0.5) * TILE - z;
      if (Math.hypot(cx, cz) > reach + TILE * 0.3) continue;
      const key = `${i},${j}`;
      want.add(key);
      if (!this.tiles.has(key) && built < 2) {
        // (Nearest first: two tiles at most each time, so it never stalls.)
        this.tiles.set(key, this.#tile(i, j));
        built++;
      }
    }
    for (const [key, mesh] of this.tiles) {
      // (Only once the land under them is there: never hanging in the air over land not yet drawn.)
      if (mesh && !mesh.visible) mesh.visible = loaded(mesh.userData.cx, mesh.userData.cz);
      if (want.has(key)) continue;
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
      }
      this.tiles.delete(key);
    }
  }

  #tile(i, j) {
    const list = this.generator.greatBouldersIn(i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE);
    if (!list.length) return null;
    const pos = [], col = [];
    for (const b of list) boulderMesh(b, pos, col);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.material);
    // (Waiting on the land under its boulders: where the first of them stands.)
    mesh.userData.cx = list[0].x;
    mesh.userData.cz = list[0].z;
    mesh.visible = false;
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
}

/**
 * One boulder's faces (into `pos`, `col`): rings up from its underside to
 * its crown, each ring its outline (lumpy, blocky-round) at that height,
 * so its sides curve in under it to the bottom.
 */
function boulderMesh(b, pos, col) {
  const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
  const palette = STONE[b.kind] ?? STONE.bristle;
  const pts = [];
  const m = boulderMake(b);
  for (let r = 0; r <= RINGS; r++) {
    // (From the bottom, s = -1, to the top, s = 1; its top planed flat if it's one of those.)
    const s = Math.min(m.flat, -1 + (2 * r) / RINGS);
    const q = boulderRing(b, s);
    const y = b.y + (s < 0 ? 0.85 : 1) * s * b.c;
    const ring = [];
    for (let k = 0; k < SIDES; k++) {
      const th = (k / SIDES) * Math.PI * 2, cx = Math.cos(th), cz = Math.sin(th);
      const n = Math.pow(Math.pow(Math.abs(cx), m.p) + Math.pow(Math.abs(cz), m.p), 1 / m.p);
      // (A little roughness on the faces.)
      const lump = 1 + (hash2(k * 7 + r * 131, Math.round(b.seed * 10), 0xb0) - 0.5) * 0.06;
      const w = boulderWobble(b, th) * (s >= m.flat ? boulderRing(b, m.flat) : q) * lump;
      const u = (cx / n) * w * b.a, v = (cz / n) * w * b.b;
      // (Then roughened, as the land is: pushed out or in along its face.)
      const px = b.x + u * ca - v * sa, pz = b.z + u * sa + v * ca;
      const ox = px - b.x, oy = (y - b.y) * 1.2, oz = pz - b.z, ol = Math.hypot(ox, oy, oz) || 1;
      const d = boulderRough(b, px, y, pz);
      ring.push([px + (ox / ol) * d, y + (oy / ol) * d, pz + (oz / ol) * d]);
    }
    pts.push(ring);
  }
  // (A flat top: closed with a cap over its last ring.)
  if (m.flat < 1) pts.push(Array.from({ length: SIDES }, () => [b.x, b.y + m.flat * b.c, b.z]));
  const rings = pts.length - 1;
  const face = (p0, p1, p2, r, k) => {
    const h = hash2(k * 13 + r, Math.round(b.seed * 100), 0xb1);
    tint.setHex(palette[Math.floor(h * palette.length)]);
    // (Darker underneath, in the shade of its own bulk.)
    // (Patchy, as the land's colour is: weathered darker in places, streaked down the face, darker still in the cracks.)
    const mx = (p0[0] + p1[0] + p2[0]) / 3, my = (p0[1] + p1[1] + p2[1]) / 3, mz = (p0[2] + p1[2] + p2[2]) / 3;
    const patch = 0.88 + 0.12 * Math.sin(mx * 0.07 + mz * 0.05 + b.seed) * Math.cos(mz * 0.06 - my * 0.03);
    const crack = boulderRough(b, mx, my, mz) < -0.6 * Math.min(4, Math.min(b.a, b.b, b.c) * 0.09) ? 0.78 : 1;
    shade.copy(tint).multiplyScalar((0.62 + 0.38 * Math.min(1, (r / RINGS) * 1.6)) * (0.9 + 0.2 * h) * patch * crack);
    for (const p of [p0, p1, p2]) {
      pos.push(p[0], p[1], p[2]);
      col.push(shade.r, shade.g, shade.b);
    }
  };
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < SIDES; k++) {
      const a = pts[r][k], bb = pts[r][(k + 1) % SIDES], c = pts[r + 1][k], d = pts[r + 1][(k + 1) % SIDES];
      // (Outward-facing, wound anticlockwise seen from outside; none where a ring is a single point.)
      if (r > 0) face(a, c, bb, Math.min(r, RINGS), k);
      if (r < rings - 1 || m.flat < 1) face(bb, c, d, Math.min(r, RINGS), k);
    }
  }
}
