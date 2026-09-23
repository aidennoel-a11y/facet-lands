import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';
import { CaveField } from '../caves/CaveField.js';
import { ROCK_SHAPES } from './RockLayer.js';

const SOIL = [0x7b6a55, 0x735f4b, 0x85725b];
const PIT_ROCK = [0x8a8597, 0x7e798c, 0x908b9d, 0x767183];
const PATH = [0x8b7a64, 0x7f6e5a, 0x857462, 0x796955];
const CAVE_WALL = [0x6f6a79, 0x77727f, 0x656170, 0x7f7a86];
const CAVE_FLOOR = [0x6b6158, 0x5f564e, 0x746a5f];
const CEILING = [0x5d5967, 0x55515d, 0x625e6c];
const MOSS = [0x7a9a4e, 0x6f8f47, 0x86a457];

/**
 * Collects flat-coloured triangles given in an entrance's own axes
 * (u along it, v across, y up) and turns them into chunk-local geometry.
 */
class Builder {
  constructor(e, x0, z0, seed) {
    this.e = e;
    this.x0 = x0;
    this.z0 = z0;
    this.seed = seed;
    this.positions = [];
    this.colors = [];
    this.sky = [];
    this.color = new Color();
  }

  /** Local (u, v, y) to chunk-local [x, y, z]. */
  at(u, v, y) {
    const [x, z] = CaveField.world(this.e, u, v);
    return [x - this.x0, y, z - this.z0];
  }

  /**
   * One triangle, wound so its front faces `facing` (a local [u, v, y]
   * direction), coloured from `palette`. `open`: in daylight (else it
   * darkens with distance into the cave, like the cave rock).
   */
  tri(a, b, c, palette, facing, open) {
    const A = this.at(...a);
    let B = this.at(...b);
    let C = this.at(...c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] < 1e-8) return; // degenerate
    const { dx, dz } = this.e.shape;
    const fx = dx * facing[0] - dz * facing[1];
    const fz = dz * facing[0] + dx * facing[1];
    if (n[0] * fx + n[1] * facing[2] + n[2] * fz < 0) [B, C] = [C, B];

    const mx = (A[0] + B[0] + C[0]) / 3 + this.x0;
    const my = (A[1] + B[1] + C[1]) / 3;
    const mz = (A[2] + B[2] + C[2]) / 3 + this.z0;
    const h = hash2(Math.round(mx * 5), Math.round(mz * 5 + my * 3), this.seed);
    this.color.set(palette[Math.floor(h * palette.length)]).multiplyScalar(0.9 + hash2(Math.round(my * 7), Math.round(mx * 3), this.seed) * 0.18);
    for (const p of [A, B, C]) {
      this.positions.push(p[0], p[1], p[2]);
      this.colors.push(this.color.r, this.color.g, this.color.b);
      this.sky.push(open ? 1 : CaveField.skyLight([this.e], p[0] + this.x0, p[1], p[2] + this.z0));
    }
  }

  /** A quad a-b-c-d (in order around it). */
  quad(a, b, c, d, palette, facing, open) {
    this.tri(a, b, c, palette, facing, open);
    this.tri(a, c, d, palette, facing, open);
  }

  /**
   * Stitches a strip of triangles between two polylines running the same
   * way (they may have different numbers of points).
   */
  zip(upper, lower, palette, facing, open) {
    let i = 0, j = 0;
    const U = upper.length - 1, L = lower.length - 1;
    while (i < U || j < L) {
      if (j === L || (i < U && (i + 1) / U <= (j + 1) / L)) {
        this.tri(upper[i], upper[i + 1], lower[j], palette, facing, open);
        i++;
      } else {
        this.tri(upper[i], lower[j + 1], lower[j], palette, facing, open);
        j++;
      }
    }
  }

  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    g.setAttribute('skyLight', new BufferAttribute(new Float32Array(this.sky), 1));
    g.computeVertexNormals();
    return g;
  }
}

/**
 * The built part of one cave entrance (see CaveField): rock-and-soil walls
 * lining the pit the terrain leaves open, a dirt ramp down it, a mossy rock
 * ledge over its far end with the tunnel's arched mouth beneath, a short
 * arched tunnel lined with smooth rock, and a few boulders on the rim.
 * Returns chunk-local geometries.
 */
function buildEntrance(e, generator, groundHeightAt, x0, z0) {
  const s = e.shape;
  const b = new Builder(e, x0, z0, generator.seed ^ 0x6a09e667);
  const rand = mulberry32(hash2(Math.round(s.ox), Math.round(s.oz), generator.seed ^ 0x3c6ef372) * 4294967296);
  const floorAt = (u) => CaveField.floorAt(e, u);
  const half = (u) => CaveField.halfWidth(e, u);
  // The ground at local (u, v): the terrain mesh where there is one, else the land.
  const ground = (u, v) => {
    const [x, z] = CaveField.world(e, u, v);
    const h = groundHeightAt(x - x0, z - z0);
    return Number.isFinite(h) ? h : generator.getHeight(x, z);
  };
  const jitter = (u, v, k) => hash2(Math.round(u * 13 + v * 3), Math.round(v * 13 - u * 5), generator.seed + k);

  // 1. Pit walls, hanging from the terrain's cut edge down below the ramp:
  //    a band of soil at the top, rock below. The top edge follows the cut
  //    edge closely so wall and ground meet without a gap.
  const outline = e.hole;
  const count = outline.length;
  const cornerTop = outline.map(([u, v], i) => {
    // Just outside the corner, along the bisector of its two edges.
    const [pu, pv] = outline[(i + count - 1) % count], [nu, nv] = outline[(i + 1) % count];
    let ou = (v - pv) / Math.hypot(u - pu, v - pv) + (nv - v) / Math.hypot(nu - u, nv - v);
    let ov = -(u - pu) / Math.hypot(u - pu, v - pv) - (nu - u) / Math.hypot(nu - u, nv - v);
    const l = Math.hypot(ou, ov) || 1;
    return ground(u + (ou / l) * 0.05, v + (ov / l) * 0.05);
  });
  const rowPoint = (u, v, out, g, depth, push) => [u - out[0] * push, v - out[1] * push, g - depth];
  for (let i = 0; i < count; i++) {
    const a = outline[i], c = outline[(i + 1) % count];
    if (a[0] === s.L && c[0] === s.L) continue; // the back edge: the ledge and tunnel mouth are there
    const du = c[0] - a[0], dv = c[1] - a[1];
    const len = Math.hypot(du, dv);
    const out = [dv / len, -du / len]; // outward (the outline runs counter-clockwise)
    const facing = [-out[0], -out[1], 0];
    const fine = Math.max(1, Math.ceil(len / 0.5));
    const top = [];
    for (let k = 0; k <= fine; k++) {
      const u = a[0] + (du * k) / fine, v = a[1] + (dv * k) / fine;
      const g = k === 0 ? cornerTop[i] : k === fine ? cornerTop[(i + 1) % count] : ground(u + out[0] * 0.03, v + out[1] * 0.03);
      top.push([u, v, g]);
    }
    const coarse = Math.max(1, Math.round(len / 1.8));
    const soil = [], low = [], bottom = [];
    for (let k = 0; k <= coarse; k++) {
      const t = k / coarse;
      const u = a[0] + du * t, v = a[1] + dv * t;
      const g = top[Math.round(t * fine)][2];
      const f = floorAt(u) - 0.5;
      const corner = k === 0 || k === coarse; // shared with the next wall: keep on the outline
      const soilDepth = Math.min(1.3, (g - f) * 0.3);
      soil.push(rowPoint(u, v, out, g, soilDepth, corner ? 0 : 0.12 + jitter(u, v, 1) * 0.2));
      low.push(rowPoint(u, v, out, g, soilDepth + (g - soilDepth - f) * (0.4 + jitter(u, v, 2) * 0.2), corner ? 0 : jitter(u, v, 3) * 0.35));
      bottom.push([u, v, f]);
    }
    b.zip(top, soil, SOIL, facing, true);
    b.zip(soil, low, PIT_ROCK, facing, true);
    b.zip(low, bottom, PIT_ROCK, facing, true);
  }

  // 2. The ramp, from the pit's tip to the end of the lined tunnel.
  const us = [0, s.tipLen];
  for (let u = s.tipLen + 2.1; u < s.L - 0.8; u += 2.1) us.push(u);
  us.push(s.L);
  for (let u = s.L + 2.4; u < s.E - 0.8; u += 2.4) us.push(u);
  us.push(s.E);
  const across = [-1, -0.5, 0, 0.5, 1];
  const rows = us.map((u, r) =>
    across.map((f, c) => {
      const edge = r === 0 || r === us.length - 1 || c === 0 || c === across.length - 1;
      // The edges tuck a little under the walls, so no crack shows between them.
      return [u, f * (half(u) + 0.12), floorAt(u) + (edge ? 0 : (jitter(u, f, 4) - 0.5) * 0.14)];
    }),
  );
  for (let r = 0; r < rows.length - 1; r++) {
    const inTunnel = us[r] >= s.L;
    const open = us[r + 1] <= s.L - s.ledge;
    for (let c = 0; c < across.length - 1; c++) {
      b.quad(rows[r][c], rows[r + 1][c], rows[r + 1][c + 1], rows[r][c + 1], inTunnel ? CAVE_FLOOR : PATH, [0, 0, 1], open);
    }
  }

  // 3. The lined tunnel: an arch (straight walls, rounded roof) swept from
  //    the mouth to the winding tunnel.
  const profile = [[-1, -0.5], [-1, s.wallH]];
  for (let k = 1; k <= 5; k++) {
    const th = Math.PI - (k * Math.PI) / 6;
    profile.push([Math.cos(th), s.wallH + (s.archH - s.wallH) * Math.sin(th)]);
  }
  profile.push([1, s.wallH], [1, -0.5]);
  const ringAt = (u, rough) =>
    profile.map(([f, h], k) => {
      const inner = rough && k > 0 && k < profile.length - 1;
      // Walls only lean in (leaning out would open a crack along the floor).
      const dv = !inner ? 0 : Math.abs(f) === 1 ? -f * jitter(u, k, 5) * 0.3 : (jitter(u, k, 5) - 0.5) * 0.5;
      return [u, f * s.w + dv, floorAt(u) + h + (inner ? (jitter(u, k, 6) - 0.5) * 0.35 : 0)];
    });
  const rings = [ringAt(s.L, false), ringAt((s.L + s.E) / 2, true), ringAt(s.E, false)];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < profile.length - 1; k++) {
      const p = rings[r][k], q = rings[r][k + 1];
      const roof = profile[k][1] >= s.wallH && profile[k + 1][1] >= s.wallH && k > 0 && k < profile.length - 2;
      const facing = [0, -(p[1] + q[1]) / 2, floorAt(p[0]) + 1.8 - (p[2] + q[2]) / 2];
      b.quad(p, rings[r + 1][k], rings[r + 1][k + 1], q, roof ? CEILING : CAVE_WALL, facing, false);
    }
  }

  // 4. The rock face around the tunnel's mouth, up to the ledge.
  const mouth = rings[0];
  const apex = 4; // index of the top of the arch in `profile`
  for (const [from, to, v] of [[1, apex, -s.w], [apex, profile.length - 2, s.w]]) {
    const corner = [s.L, v, s.yLedge];
    for (let k = from; k < to; k++) b.tri(corner, mouth[k], mouth[k + 1], PIT_ROCK, [-1, 0, 0], false);
  }

  // 5. The ledge: a slab of rock over the far end of the pit, its underside
  //    level with the top of the arch, mossy on top, sinking into the ground
  //    at its sides and back.
  const cols = [-(s.w + 2.2), -(s.w + 0.6), -s.w / 2, 0, s.w / 2, s.w + 0.6, s.w + 2.2];
  const lip = cols.map(() => s.L - s.ledge + (rand() - 0.6) * 0.8); // ragged front edge
  const lastCol = cols.length - 1;
  const outer = (c) => c === 0 || c === lastCol;
  // Domed: highest along the middle, sinking into the ground at the sides.
  const slabTop = (u, v, c) => {
    if (outer(c)) return ground(u, v) - 0.35;
    const t = v / (s.w + 0.6);
    return ground(u, v) + 0.35 + 0.65 * (1 - t * t) + rand() * 0.25;
  };
  // Underside.
  const under = [
    cols.map((v, c) => [lip[c], v, s.yLedge]),
    cols.map((v, c) => [(lip[c] + s.L) / 2, v, s.yLedge + (c > 1 && c < lastCol - 1 ? (rand() - 0.5) * 0.3 : 0)]),
    cols.map((v) => [s.L, v, s.yLedge]),
  ];
  for (let r = 0; r < 2; r++) {
    for (let c = 1; c < lastCol - 1; c++) {
      b.quad(under[r][c], under[r + 1][c], under[r + 1][c + 1], under[r][c + 1], CEILING, [0, 0, -1], false);
    }
  }
  // Front face.
  const faceBottom = cols.map((v, c) => (outer(c) ? [lip[c], v, ground(lip[c], v) - 0.4] : [lip[c], v, s.yLedge]));
  const faceTop = cols.map((v, c) => [lip[c] - 0.3, v, slabTop(lip[c] - 0.3, v, c)]);
  const faceMid = cols.map((v, c) => [lip[c] - 0.35 - rand() * 0.35, v, (faceBottom[c][2] + faceTop[c][2]) / 2]);
  for (let c = 0; c < lastCol; c++) {
    b.quad(faceBottom[c], faceBottom[c + 1], faceMid[c + 1], faceMid[c], PIT_ROCK, [-1, 0, 0], true);
    b.quad(faceMid[c], faceMid[c + 1], faceTop[c + 1], faceTop[c], PIT_ROCK, [-1, 0, 0], true);
  }
  // Top.
  const topRows = [
    faceTop,
    cols.map((v, c) => [(lip[c] + s.L) / 2, v, slabTop((lip[c] + s.L) / 2, v, c)]),
    cols.map((v, c) => [s.L + 0.4, v, slabTop(s.L + 0.4, v, c)]),
    cols.map((v, c) => [s.L + 1.5, v, (slabTop(s.L + 1.5, v, c) + ground(s.L + 1.5, v)) / 2 - 0.1]),
    cols.map((v) => [s.back, v, ground(s.back, v) - 0.35]),
  ];
  for (let r = 0; r < topRows.length - 1; r++) {
    for (let c = 0; c < lastCol; c++) {
      const palette = r < 3 && c > 0 && c < lastCol - 1 ? MOSS : PIT_ROCK;
      b.quad(topRows[r][c], topRows[r + 1][c], topRows[r + 1][c + 1], topRows[r][c + 1], palette, [0, 0, 1], true);
    }
  }

  // 6. Where the lined tunnel meets the winding one: a flange of rock round
  //    the arch (hiding the seam) and the end of the ramp.
  const end = rings[2];
  const centreY = floorAt(s.E) + 1.6;
  const flange = end.map(([u, v, y]) => {
    const l = Math.hypot(v, y - centreY) || 1;
    return [u, v + (v / l) * 1.3, y + ((y - centreY) / l) * 1.3];
  });
  for (let k = 0; k < end.length - 1; k++) b.quad(end[k], end[k + 1], flange[k + 1], flange[k], CAVE_WALL, [1, 0, 0], false);
  // The ramp carries on across the short chamber where the cave takes over
  // (as wide as the chamber), ending in a small step down.
  const ue = s.E + 1.5, fe = floorAt(ue) - 0.05, wide = s.w + 1.2;
  const endRow = [[s.E, -s.w - 0.12], [s.E, s.w + 0.12], [ue, wide], [ue, -wide]].map(([u, v]) => [u, v, floorAt(u) - 0.05]);
  b.quad(endRow[0], endRow[3], endRow[2], endRow[1], CAVE_FLOOR, [0, 0, 1], false);
  b.quad([ue, -wide, fe], [ue, wide, fe], [ue, wide, fe - 0.9], [ue, -wide, fe - 0.9], CAVE_FLOOR, [1, 0, 0], false);

  const parts = [b.geometry()];

  // 7. A few boulders on the rim and the ledge.
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const place = (u, v, y, size) => {
    const geometry = ROCK_SHAPES[Math.floor(rand() * ROCK_SHAPES.length)].clone();
    rotation.setFromEuler(new Euler((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.4));
    scale.set(size * (0.9 + rand() * 0.4), size * (0.6 + rand() * 0.3), size * (0.9 + rand() * 0.4));
    matrix.compose(new Vector3(...b.at(u, v, y - size * 0.25)), rotation, scale);
    geometry.applyMatrix4(matrix);
    geometry.setAttribute('skyLight', new BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1), 1));
    parts.push(geometry);
  };
  const rimRocks = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < rimRocks; k++) {
    const u = 1.5 + rand() * (s.L - s.ledge - 2.5);
    const v = (rand() < 0.5 ? -1 : 1) * (s.w + 1 + rand() * 1.4);
    place(u, v, ground(u, v), 0.6 + rand() * 1.1);
  }
  const u = (s.L - s.ledge + s.L) / 2 + rand();
  const v = (rand() - 0.5) * s.w;
  place(u, v, ground(u, v) + 0.5, 0.7 + rand() * 0.6);

  return parts;
}

/**
 * The built part of each cave entrance (walls, ramp, ledge, lined tunnel),
 * on full-detail chunks: the ones whose terrain has the entrance's hole.
 */
export function createEntranceLayer(config, material) {
  return {
    name: 'entrances',

    build({ cx, cz, resolution, groundHeightAt, generator }) {
      if (resolution !== config.lods[0].resolution || !generator.caves) return null;
      const size = config.chunkSize;
      const x0 = cx * size, z0 = cz * size;
      const entrances = generator.caves
        .mouthsNear(x0, z0, x0 + size, z0 + size)
        .filter((e) => Math.floor(e.shape.ox / size) === cx && Math.floor(e.shape.oz / size) === cz);
      if (!entrances.length) return null;
      const geometry = mergeGeometries(entrances.flatMap((e) => buildEntrance(e, generator, groundHeightAt, x0, z0)));
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = 'cave entrance';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.solid = true; // torches can go on it
      return mesh;
    },

    dispose(mesh) {
      mesh.geometry.dispose();
    },
  };
}
