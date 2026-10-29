import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';
import { CaveField } from '../caves/CaveField.js';
import { ROCK_SHAPES } from './RockLayer.js';

// Colours for an entrance's rock, by biome: grey-violet rock, soil and
// moss in the green lands; drier soil and grass in the savanna; sandstone
// and sand in the desert.
const TEMPERATE = {
  soil: [0x7b6a55, 0x735f4b, 0x85725b],
  rock: [0x8a8597, 0x7e798c, 0x908b9d, 0x767183],
  darkRock: [0x6c6778, 0x625e6e, 0x716c7c],
  path: [0x8b7a64, 0x7f6e5a, 0x857462, 0x796955],
  caveWall: [0x6f6a79, 0x77727f, 0x656170, 0x7f7a86],
  caveFloor: [0x6b6158, 0x5f564e, 0x746a5f],
  ceiling: [0x5d5967, 0x55515d, 0x625e6c],
  top: [0x7a9a4e, 0x6f8f47, 0x86a457], // moss
  boulderTint: null,
};
const SAVANNA = {
  ...TEMPERATE,
  soil: [0x8a6a4c, 0x7f6045, 0x94735a],
  path: [0x9a8062, 0x8e7659, 0xa38a6a],
  top: [0xc2b05e, 0xb8a656, 0xcdbd6c], // dry grass
};
const DESERT = {
  soil: [0xdcc088, 0xd2b47c, 0xe3c892], // sand
  rock: [0xc08c66, 0xb5825e, 0xc99a70, 0xab7a58], // sandstone
  darkRock: [0x9a6a4e, 0x8f6248, 0xa2724f],
  path: [0xd8bd86, 0xcfb27a, 0xdcc28e],
  caveWall: [0x9a7560, 0x8f6c58, 0xa37d66, 0x86664f],
  caveFloor: [0x8c6f55, 0x7f644d, 0x94775c],
  ceiling: [0x7a5e4c, 0x6f5645, 0x836452],
  top: [0xe0c68e, 0xd6b983, 0xe6cf9a], // drifted sand
  boulderTint: new Color(0xc08c66),
};

/** The colour set for an entrance at (x, z): its most prevalent biome. */
function coloursAt(generator, x, z) {
  const w = generator.getBiomeWeights(x, z, {});
  const green = 1 - w.desert - w.savanna; // (every other biome is green country)
  if (w.desert >= w.savanna && w.desert >= green) return DESERT;
  return w.savanna > green ? SAVANNA : TEMPERATE;
}

const tint = new Color();

/**
 * Collects flat-coloured triangles given in an entrance's own axes
 * (u along it, v across, y up) and turns them into chunk-local geometry.
 */
class Builder {
  constructor(e, x0, z0, seed, colours) {
    this.e = e;
    this.colours = colours;
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
    if (typeof facing === 'function') facing = facing(a, b, c);
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
    if (palette === 'mossy') {
      // Moss on faces that look up, bare rock on the steep ones.
      const ny = Math.abs(n[1]) / Math.hypot(n[0], n[1], n[2]);
      palette = ny > 0.72 && h < 0.85 ? this.colours.top : this.colours.rock;
    }
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
 * The rock around one cave entrance, generated from its shape (see
 * CaveField): craggy walls with a band of soil at the top lining the pit
 * the terrain leaves open, an uneven floor strewn with rubble, an
 * overhanging rock outcrop over the far end with boulders on it and moss
 * where it faces the sky, the rough rock tunnel beyond the mouth, and a few
 * boulders on the rim. Every entrance's shape and every facet's nudge come
 * from its seed, so no two look alike. Returns chunk-local geometries.
 */
function buildEntrance(e, generator, groundHeightAt, x0, z0) {
  const s = e.shape;
  const P = coloursAt(generator, s.ox, s.oz);
  const b = new Builder(e, x0, z0, generator.seed ^ 0x6a09e667, P);
  const rand = mulberry32(hash2(Math.round(s.ox), Math.round(s.oz), generator.seed ^ 0x3c6ef372) * 4294967296);
  const floorAt = (u) => CaveField.floorAt(e, u);
  const half = (u) => CaveField.halfWidth(e, u);
  const centre = (u) => CaveField.centreAt(e, u);
  const arch = (u) => CaveField.archAt(e, u);
  // The ground at local (u, v): the terrain mesh where there is one, else the land.
  const ground = (u, v) => {
    const [x, z] = CaveField.world(e, u, v);
    const h = groundHeightAt(x - x0, z - z0);
    return Number.isFinite(h) ? h : generator.getBaseHeight(x, z);
  };
  const jitter = (u, v, k) => hash2(Math.round(u * 13 + v * 3), Math.round(v * 13 - u * 5), generator.seed + k);
  // Faces in the pit look in towards the middle of it.
  const intoPit = (p, q, r) => {
    const u = (p[0] + q[0] + r[0]) / 3, v = (p[1] + q[1] + r[1]) / 3;
    const tu = Math.min(Math.max(u, 1.5), s.L - 0.5);
    return [tu - u, centre(tu) - v, 0];
  };

  // 1. Pit walls, hanging from the terrain's cut edge down below the floor:
  //    a band of soil at the top, then rock that bulges in and is undercut
  //    here and there. The top edge follows the cut edge (sampled as finely
  //    as the pit's shape) so wall and ground meet without a gap.
  const kL = Math.round(s.L / s.step);
  const path = [];
  for (let k = kL; k >= 0; k--) path.push([k * s.step, s.c[k] + s.hw[k]]); // right side, back to front
  const tipFrom = path.length - 1;
  for (const f of [0.66, 0.33]) path.push([0, s.c[0] - s.hw[0] + 2 * s.hw[0] * f]); // across the front
  const tipTo = path.length;
  for (let k = 0; k <= kL; k++) path.push([k * s.step, s.c[k] - s.hw[k]]); // left side, front to back
  const outward = path.map((_, i) => {
    const p = path[Math.max(0, i - 1)], q = path[Math.min(path.length - 1, i + 1)];
    const du = q[0] - p[0], dv = q[1] - p[1], l = Math.hypot(du, dv) || 1;
    return [dv / l, -du / l]; // the path runs counter-clockwise round the pit
  });
  const top = path.map(([u, v], i) => [u, v, ground(u + outward[i][0] * 0.03, v + outward[i][1] * 0.03)]);
  const columns = new Set([0, tipFrom, tipTo, path.length - 1]);
  for (let i = 0; i < path.length; i += 3) columns.add(i);
  const cols = [...columns].sort((i, j) => i - j);
  const rows = [[], [], [], [], []]; // soil, rock, lower rock, foot, bottom
  for (const i of cols) {
    const [u, v] = path[i];
    const [ou, ov] = outward[i];
    const end = i === 0 || i === path.length - 1; // under the outcrop, meeting the tunnel
    const at = (y, push) => [u - ou * push, v - ov * push, y];
    const g = top[i][2];
    const floor = floorAt(u);
    const f = floor - 0.5;
    const depth = g - f;
    const soil = Math.min(1.1, depth * 0.22) * (0.5 + jitter(u, v, 1) * 0.8);
    const y1 = g - soil - (depth - soil) * (0.25 + jitter(u, v, 2) * 0.25);
    const y2 = floor + 0.25 + (y1 - floor - 0.25) * (0.3 + jitter(u, v, 3) * 0.35);
    rows[0].push(at(g - soil, end ? 0 : 0.05 + jitter(u, v, 4) * 0.25));
    rows[1].push(at(Math.max(y1, floor + 0.3), end ? 0 : (jitter(u, v, 5) - 0.45) * 0.9));
    rows[2].push(at(Math.max(y2, floor + 0.28), end ? 0 : (jitter(u, v, 6) - 0.45) * 0.7));
    rows[3].push(at(floor + 0.25, 0)); // straight down to the floor, so no crack shows along it
    rows[4].push([u, v, f]);
  }
  b.zip(top, rows[0], P.soil, intoPit, true);
  b.zip(rows[0], rows[1], P.rock, intoPit, true);
  b.zip(rows[1], rows[2], P.rock, intoPit, true);
  b.zip(rows[2], rows[3], P.darkRock, intoPit, true);
  b.zip(rows[3], rows[4], P.darkRock, intoPit, true);

  // 2. The floor, from the front of the pit to the end of the rock tunnel:
  //    bumpy, a little higher by the walls, tucked under them at the edges.
  const us = new Set([s.L, s.E]);
  for (let u = 0; u < s.E; u += 1.5) us.add(Math.round(u * 100) / 100);
  const along = [...us].sort((p, q) => p - q);
  const across = [-1, -0.5, 0, 0.5, 1];
  const floorRows = along.map((u, r) =>
    across.map((f, c) => {
      const edge = r === 0 || r === along.length - 1 || c === 0 || c === across.length - 1;
      const v = centre(u) + f * (half(u) + 0.12);
      return [u, v, floorAt(u) + (edge ? 0 : (jitter(u, f, 7) - 0.4) * 0.22 + 0.08 * (1 - f * f))];
    }),
  );
  for (let r = 0; r < floorRows.length - 1; r++) {
    const u = along[r];
    const open = along[r + 1] <= s.L - s.ledge;
    for (let c = 0; c < across.length - 1; c++) {
      const palette = u >= s.L ? P.caveFloor : jitter(u, c, 8) < 0.2 ? P.rock : P.path;
      b.quad(floorRows[r][c], floorRows[r + 1][c], floorRows[r + 1][c + 1], floorRows[r][c + 1], palette, [0, 0, 1], open);
    }
  }

  // 3. The rock tunnel past the mouth: rings of an arched profile swept
  //    along its (bending) centre line, each pushed out unevenly.
  const profile = [[-1, -0.5], [-1, 0.2]];
  for (let k = 0; k <= 8; k++) profile.push([Math.cos(Math.PI - (k * Math.PI) / 8), Math.sin(Math.PI - (k * Math.PI) / 8)]);
  profile.push([1, 0.2], [1, -0.5]);
  const heightOf = (u, [f, a], k) => (k < 2 || k > profile.length - 3 ? a : arch(u) * 0.5 + arch(u) * 0.5 * a);
  const ringAt = (u, rough) => {
    const mid = floorAt(u) + arch(u) * 0.45;
    return profile.map((p, k) => {
      const v = centre(u) + p[0] * half(u);
      const y = floorAt(u) + heightOf(u, p, k);
      if (!rough || k < 2 || k > profile.length - 3) return [u, v, y];
      // Pushed outwards from the middle (never in, so it never narrows the way).
      const dv = v - centre(u), dy = y - mid, l = Math.hypot(dv, dy) || 1;
      const push = 0.1 + jitter(u, k, 9) * 0.45;
      return [u + (jitter(u, k, 10) - 0.5) * 0.5, v + (dv / l) * push, y + (dy / l) * push];
    });
  };
  const ringUs = [s.L];
  for (let u = s.L + 1.5; u < s.E - 0.7; u += 1.5) ringUs.push(u);
  ringUs.push(s.E);
  const rings = ringUs.map((u, i) => ringAt(u, i > 0 && i < ringUs.length - 1));
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < profile.length - 1; k++) {
      const p = rings[r][k], q = rings[r][k + 1];
      const roof = k >= 3 && k <= profile.length - 5;
      const u = (p[0] + q[0]) / 2;
      const facing = [0, centre(u) - (p[1] + q[1]) / 2, floorAt(u) + arch(u) * 0.45 - (p[2] + q[2]) / 2];
      b.quad(p, rings[r + 1][k], rings[r + 1][k + 1], q, roof ? P.ceiling : P.caveWall, facing, false);
    }
  }

  // 4. The rock face above the tunnel's mouth, up to the outcrop.
  const mouth = rings[0];
  const face = [-1, -0.5, 0, 0.5, 1].map((f) => [s.L, centre(s.L) + f * half(s.L), s.yLedge]);
  b.zip(face, mouth.slice(2, profile.length - 2), P.rock, [-1, 0, 0], false);

  // 5. The outcrop: a craggy mass of rock over the far end of the pit, its
  //    underside roofing the mouth, its front edge ragged, domed on top and
  //    sinking into the ground at its sides and back.
  const cL = centre(s.L), hL = half(s.L);
  const spanL = hL + 1.4 + rand() * 1.4, spanR = hL + 1.4 + rand() * 1.4;
  const count = Math.max(6, Math.ceil((spanL + spanR) / 1.2));
  const vs = [];
  for (let j = 0; j <= count; j++) vs.push(cL - spanL + ((spanL + spanR) * j) / count);
  // Ragged, and curving back into the ground beyond the pit's sides, so the
  // outcrop is a rounded mass rather than a flat lid.
  const lip = vs.map((v) => s.L - s.ledge + (rand() - 0.5) * 1.2 + Math.max(0, Math.abs(v - cL) - hL + 0.3) * 1.1);
  const last = vs.length - 1;
  const outer = (j) => j === 0 || j === last;
  const dome = 0.8 + rand() * 0.9;
  const slabTop = (u, v, j) => {
    if (outer(j)) return ground(u, v) - 0.35;
    const t = (v - cL) / (v < cL ? spanL : spanR);
    return ground(u, v) + 0.3 + dome * (1 - t * t) + rand() * 0.35;
  };
  // Underside.
  const under = [
    vs.map((v, j) => [lip[j], v, s.yLedge]),
    vs.map((v, j) => [(lip[j] + s.L) / 2, v, s.yLedge + (outer(j) ? 0 : rand() * 0.4)]),
    vs.map((v) => [s.L, v, s.yLedge]),
  ];
  for (let r = 0; r < 2; r++) {
    for (let j = 1; j < last - 1; j++) b.quad(under[r][j], under[r + 1][j], under[r + 1][j + 1], under[r][j + 1], P.ceiling, [0, 0, -1], false);
  }
  // Front face, in three bands pushed out unevenly.
  const faceBottom = vs.map((v, j) => (outer(j) ? [lip[j], v, ground(lip[j], v) - 0.4] : [lip[j], v, s.yLedge]));
  const faceTop = vs.map((v, j) => [lip[j] - 0.3, v, slabTop(lip[j] - 0.3, v, j)]);
  const band = (t, out) => vs.map((v, j) => [lip[j] - (outer(j) ? 0.1 : out()), v, faceBottom[j][2] + (faceTop[j][2] - faceBottom[j][2]) * t]);
  const faceRows = [faceBottom, band(0.35, () => 0.2 + rand() * 0.6), band(0.7, () => 0.1 + rand() * 0.5), faceTop];
  for (let r = 0; r < faceRows.length - 1; r++) {
    for (let j = 0; j < last; j++) b.quad(faceRows[r][j], faceRows[r][j + 1], faceRows[r + 1][j + 1], faceRows[r + 1][j], P.rock, [-1, 0, 0], true);
  }
  // Top.
  const topRows = [
    faceTop,
    vs.map((v, j) => [(lip[j] + s.L) / 2, v, slabTop((lip[j] + s.L) / 2, v, j)]),
    vs.map((v, j) => [s.L + 0.4, v, slabTop(s.L + 0.4, v, j)]),
    vs.map((v, j) => [s.L + 1.5, v, (slabTop(s.L + 1.5, v, j) + ground(s.L + 1.5, v)) / 2 - 0.1]),
    vs.map((v) => [s.back, v, ground(s.back, v) - 0.35]),
  ];
  for (let r = 0; r < topRows.length - 1; r++) {
    for (let j = 0; j < last; j++) b.quad(topRows[r][j], topRows[r + 1][j], topRows[r + 1][j + 1], topRows[r][j + 1], 'mossy', [0, 0, 1], true);
  }

  // 6. Where the rock tunnel meets the winding one: a flange of rock round
  //    it (hiding the seam), and the floor carrying on across the short
  //    chamber where the cave takes over, ending in a small step down.
  const end = rings[rings.length - 1];
  const centreY = floorAt(s.E) + arch(s.E) * 0.45;
  const flange = end.map(([u, v, y]) => {
    const dv = v - centre(s.E), l = Math.hypot(dv, y - centreY) || 1;
    return [u, v + (dv / l) * 1.3, y + ((y - centreY) / l) * 1.3];
  });
  for (let k = 0; k < end.length - 1; k++) b.quad(end[k], end[k + 1], flange[k + 1], flange[k], P.caveWall, [1, 0, 0], false);
  const ue = s.E + 1.5;
  const endRow = [
    [s.E, centre(s.E) - half(s.E) - 0.12],
    [s.E, centre(s.E) + half(s.E) + 0.12],
    [ue, centre(ue) + half(ue) + 1.2],
    [ue, centre(ue) - half(ue) - 1.2],
  ].map(([u, v]) => [u, v, floorAt(u) - 0.05]);
  b.quad(endRow[0], endRow[3], endRow[2], endRow[1], P.caveFloor, [0, 0, 1], false);
  const fe = floorAt(ue) - 0.05;
  b.quad([ue, endRow[3][1], fe], [ue, endRow[2][1], fe], [ue, endRow[2][1], fe - 0.9], [ue, endRow[3][1], fe - 0.9], P.caveFloor, [1, 0, 0], false);

  const parts = [b.geometry()];

  // 7. Boulders: a few big ones heaped on and beside the outcrop, some on
  //    the rim of the pit, and rubble on its floor.
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const place = (u, v, y, size, sunk) => {
    const geometry = ROCK_SHAPES[Math.floor(rand() * ROCK_SHAPES.length)].clone();
    rotation.setFromEuler(new Euler((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5));
    scale.set(size * (0.8 + rand() * 0.5), size * (0.55 + rand() * 0.4), size * (0.8 + rand() * 0.5));
    const at = b.at(u, v, y - size * sunk);
    matrix.compose(new Vector3(...at), rotation, scale);
    geometry.applyMatrix4(matrix);
    if (P.boulderTint) {
      const colour = geometry.attributes.color.clone();
      for (let i = 0; i < colour.count; i++) {
        tint.setRGB(colour.getX(i), colour.getY(i), colour.getZ(i)).lerp(P.boulderTint, 0.7);
        colour.setXYZ(i, tint.r, tint.g, tint.b);
      }
      geometry.setAttribute('color', colour);
    }
    const sky = u < s.L - s.ledge ? 1 : CaveField.skyLight([e], at[0] + x0, at[1], at[2] + z0);
    geometry.setAttribute('skyLight', new BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(sky), 1));
    parts.push(geometry);
  };
  const heaped = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < heaped; k++) {
    const u = s.L - s.ledge + 0.5 + rand() * (s.ledge + 1);
    const side = rand() < 0.5 ? -1 : 1;
    const v = cL + side * (hL + 0.3 + rand() * (side < 0 ? spanL - hL : spanR - hL));
    place(u, v, ground(u, v) + 0.3, 1.2 + rand() * 1.3, 0.3);
  }
  const rim = Math.floor(rand() * 5);
  for (let k = 0; k < rim; k++) {
    const u = 1 + rand() * Math.max(0.5, s.L - s.ledge - 2);
    const v = centre(u) + (rand() < 0.5 ? -1 : 1) * (half(u) + 0.8 + rand() * 1.8);
    place(u, v, ground(u, v), 0.5 + rand() * 1.1, 0.25);
  }
  const rubble = 2 + Math.floor(rand() * 5);
  for (let k = 0; k < rubble; k++) {
    const u = 1 + rand() * (s.E - 2);
    const v = centre(u) + (rand() < 0.5 ? -1 : 1) * Math.max(0, half(u) - 0.35 - rand() * 0.8);
    place(u, v, floorAt(u), 0.25 + rand() * 0.35, 0.2);
  }

  return parts;
}

/**
 * The built part of each cave entrance (walls, ramp, ledge, lined tunnel),
 * on full-detail chunks: the ones whose terrain has the entrance's hole.
 */
/**
 * The collar of rock at the top of a natural opening (see CaveField's
 * natural openings): for a shaft, its rough round wall from the cut edge of
 * the ground down to where the cave takes over, soil at the top and rock
 * below, overhanging where the shaft widens under the lip; for a mouth in
 * a cliff, a short rough arched tunnel into the face, its floor level.
 */
function buildNatural(e, generator, groundHeightAt, x0, z0) {
  const P = coloursAt(generator, e.x, e.z);
  const b = new Builder(e, x0, z0, generator.seed ^ 0x51ed27, P);
  const ground = (u, v) => {
    const [x, z] = CaveField.world(e, u, v);
    const h = groundHeightAt(x - x0, z - z0);
    return Number.isFinite(h) ? h : generator.getHeight(x, z);
  };
  if (e.kind !== 'mouth') {
    const N = e.kind === 'abyss' ? 40 : 24, rows = 6, depth = e.top - e.tubeTop + 2.5;
    const inward = (p, q, r) => [-(p[0] + q[0] + r[0]), -(p[1] + q[1] + r[1]), 0];
    const ring = (k) => Array.from({ length: N + 1 }, (_, i) => {
      const a = ((i % N) / N) * Math.PI * 2;
      if (k === 0) return [Math.cos(a) * e.r, Math.sin(a) * e.r, ground(Math.cos(a) * (e.r + 0.25), Math.sin(a) * (e.r + 0.25)) + 0.02];
      const y = e.top - (depth * k) / rows;
      const R = CaveField.shaftRadius(e, a, y) * (1 + 0.08 * (hash2(i % N, k, e.seed) - 0.5));
      return [Math.cos(a) * R, Math.sin(a) * R, y];
    });
    let upper = ring(0);
    for (let k = 0; k < rows; k++) {
      const lower = ring(k + 1);
      for (let i = 0; i < N; i++) b.quad(upper[i], upper[i + 1], lower[i + 1], lower[i], k === 0 ? P.soil : P.rock, inward, k < 2);
      upper = lower;
    }
  } else {
    // (Rings round the tunnel every metre, its floor flattened, each a little rough.)
    const M = 14, floor = e.cy - e.r * 0.55;
    const ring = (u) => Array.from({ length: M + 1 }, (_, j) => {
      const t = ((j % M) / M) * Math.PI * 2, R = e.r * (1 + 0.12 * (hash2(Math.round(u * 3), j % M, e.seed) - 0.5));
      return [u, Math.cos(t) * R, Math.max(e.cy + Math.sin(t) * R, floor)];
    });
    const inward = (p, q, r) => [0, -(p[1] + q[1] + r[1]), e.cy * 3 - (p[2] + q[2] + r[2])];
    let prev = ring(-1);
    for (let u = 0; u <= e.L; u += 1) {
      const next = ring(u);
      for (let j = 0; j < M; j++) b.quad(prev[j], next[j], next[j + 1], prev[j + 1], prev[j][2] <= floor + 0.01 ? P.path : P.rock, inward, u < e.uTop + 1);
      prev = next;
    }
  }
  return [b.geometry()];
}

export function createEntranceLayer(config, material) {
  return {
    name: 'entrances',

    reuseKey: ({ resolution }) => (resolution >= config.detailResolution ? `full:${resolution}` : 'none'),

    build({ cx, cz, resolution, groundHeightAt, generator }) {
      if (resolution < config.detailResolution || !generator.caves) return null;
      const size = config.chunkSize;
      const x0 = cx * size, z0 = cz * size;
      const entrances = generator.caves
        .mouthsNear(x0, z0, x0 + size, z0 + size)
        .filter((e) => Math.floor(e.shape.ox / size) === cx && Math.floor(e.shape.oz / size) === cz);
      if (!entrances.length) return null;
      const geometry = mergeGeometries(entrances.flatMap((e) => (e.natural ? buildNatural : buildEntrance)(e, generator, groundHeightAt, x0, z0)));
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
