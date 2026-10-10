import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry, LatheGeometry, Vector2 } from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../../noise/random.js';
import { CaveField } from './CaveField.js';

export const CELLS = 40; // grid cells per chunk edge (3.2 m each for 128 m chunks)

// Marching-cubes corner offsets (x, y, z) and the corner pair on each edge,
// in the standard (Paul Bourke) order used by three's tables.
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// Each kind of cave its own rock (see CaveField.biomeAt): plain grey
// stone; lush, mossy and green; volcanic, black basalt; ice; dry sandstone.
const PALETTES = [
  { wall: [0x6f6a79, 0x77727f, 0x656170, 0x7f7a86, 0x6a6572], floor: [0x6b6158, 0x5f564e, 0x746a5f], ceiling: 0x55515d, low: 0x857d71, tip: 0xbdb4a4 },
  { wall: [0x5c6852, 0x66705a, 0x53604c, 0x6e7862, 0x4f5a48], floor: [0x4a6a30, 0x557a38, 0x42602a, 0x5f7f3e], ceiling: 0x48523f, low: 0x5a6a48, tip: 0x8a9a74 },
  { wall: [0x302c30, 0x38333a, 0x2a2629, 0x3e383c, 0x332d2e], floor: [0x3a2e28, 0x2e2420, 0x44342a], ceiling: 0x252124, low: 0x3a3236, tip: 0x5a4a44 },
  { wall: [0x98b6cc, 0xaac6da, 0x88a8c0, 0xb8d2e2, 0x9cbcd2], floor: [0xd8e4ee, 0xcadae6, 0xe2ecf2], ceiling: 0x7c9ab4, low: 0xa8c4d8, tip: 0xe8f4fc },
  { wall: [0x9a7a58, 0xa88a64, 0x8a6a4a, 0xb0906a, 0x94704e], floor: [0xb09070, 0xa08060, 0xb89a78], ceiling: 0x7a5e44, low: 0x9a7e60, tip: 0xc8b090 },
];
const STONE_LOW = new Color(0x857d71);
const STONE_TIP = new Color(0xbdb4a4);
const WATER_COLOUR = [0.08, 0.17, 0.21], LAVA_COLOUR = [1, 0.42, 0.1];

/** The cave kind at a world point, from the chunk's coarse grid of scores (see sampleChunk). */
export function biomeIn(grid, x, y, z) {
  return caveAt(grid, x, y, z).kind;
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The cave at a world point: its kind (see CaveField.biomeAt), and how
 * green it is, 0..1, which (unlike the kind) fades gradually across the
 * edge of the lush country: so the moss thins out, and its glow with it,
 * over tens of metres, never stopping dead at a line.
 */
export function caveAt(grid, x, y, z) {
  const { kinds, kStep, x0, z0, cols, n, cell } = grid;
  if (!kinds) return { kind: 0, green: 0 };
  // (A great chamber is all one kind, through and through: the kind of the country over its middle.)
  if (cols) {
    const col = cols[Math.min(n - 1, Math.max(0, Math.round((z - z0) / cell))) * n + Math.min(n - 1, Math.max(0, Math.round((x - x0) / cell)))];
    const ch = col?.chamber;
    if (ch && ch.e < 1.1 && ch.c.scores && y < ch.c.y + ch.c.ry && y > ch.c.floor - 12) {
      const kind = CaveField.biomeAt(ch.c.scores, ch.c.y);
      return { kind, green: kind === 1 ? 1 : 0 };
    }
  }
  const fx = Math.min(3.999, Math.max(0, (x - x0) / kStep)), fz = Math.min(3.999, Math.max(0, (z - z0) / kStep));
  const i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
  const a = kinds[k * 5 + i], b = kinds[k * 5 + i + 1], c = kinds[(k + 1) * 5 + i], d = kinds[(k + 1) * 5 + i + 1];
  const mix = (key) => (a[key] * (1 - tx) + b[key] * tx) * (1 - tz) + (c[key] * (1 - tx) + d[key] * tx) * tz;
  const scores = { lush: mix('lush'), volcanic: mix('volcanic'), ice: mix('ice'), dry: mix('dry') };
  const kind = CaveField.biomeAt(scores, y);
  // (Green where the lush outweighs the rest, fading out below the line the kind changes at.)
  const other = Math.max(scores.volcanic + Math.max(0, (-88 - y) / 20) * 0.9, scores.ice, scores.dry);
  const green = kind === 1 ? 1 : kind === 0 ? smooth(0.25, 0.5, scores.lush) * (1 - smooth(0.35, 0.5, other)) : 0;
  return { kind, green };
}

// Moss in patches, not face by face: a slow wavy field over the rock, so it
// lies in sheets and drifts, with bare stone between.
const mossField = (x, y, z) => 0.5 + 0.25 * Math.sin(x * 0.23 + y * 0.11 + Math.sin(z * 0.17) * 2) + 0.25 * Math.sin(z * 0.21 - y * 0.13 + Math.sin(x * 0.19) * 2);
const MOSS = [0x4a6a2e, 0x55783a, 0x3e5e28, 0x608a40, 0x4f7034];

/**
 * Samples the cave field for one chunk. The grid stores caves + entrance
 * tunnels and their built parts (not the ground surface), so physics can
 * use it directly; meshing folds the ground in per column.
 */
export function sampleChunk(field, cx, cz, chunkSize) {
  const g = field.generator;
  const cell = chunkSize / CELLS;
  const x0 = cx * chunkSize;
  const z0 = cz * chunkSize;
  const entrances = field.entrancesNear(x0 - cell, z0 - cell, x0 + chunkSize + cell, z0 + chunkSize + cell);
  const n = CELLS + 1;

  // Per-column terrain height and region mask.
  const H = new Float32Array(n * n);
  const region = new Float32Array(n * n);
  const cols = new Array(n * n);
  let anyCave = entrances.length > 0, anyDeep = false;
  let maxTop = field.bottom;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cell;
      const z = z0 + k * cell;
      const c = k * n + i;
      H[c] = g.getHeight(x, z);
      region[c] = field.regionRock(x, z);
      cols[c] = field.column(x, z, H[c]);
      if (region[c] < 10) anyCave = true;
      if (field.deepRock(cols[c]) < 10) (anyCave = true), (anyDeep = true);
      maxTop = Math.max(maxTop, Math.min(field.top, H[c] - field.cover));
    }
  }
  if (!anyCave) return null;

  // Vertical range: the cave band (down to the deep caves, if any are
  // here), plus any entrance tunnel.
  let top = maxTop + 4;
  for (const e of entrances) top = Math.max(top, e.maxY + 3);
  const yMin = Math.floor(((anyDeep ? field.deep : field.bottom) - 6) / cell) * cell;
  const ny = Math.min(140, Math.ceil((top - yMin) / cell) + 1);

  const values = new Float32Array(n * n * ny);
  let hasAir = false;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const c = k * n + i;
      const x = x0 + i * cell;
      const z = z0 + k * cell;
      for (let j = 0; j < ny; j++) {
        const y = yMin + j * cell;
        let d = field.caves(x, y, z, H[c], region[c], cols[c], entrances);
        for (const e of entrances) {
          if (y < e.minY - 2 || y > e.maxY + 2) continue;
          d = Math.min(d, CaveField.ramp(e, x, y, z), CaveField.hull(e, x, y, z));
        }
        values[c * ny + j] = d;
        if (d < 0) hasAir = true;
      }
    }
  }
  if (!hasAir) return null;
  passable(values, n, ny, x0, z0, cell, yMin, entrances);
  // The kind of cave country, on a coarse grid (5 x 5 over the chunk).
  for (const col of cols) if (col.chamber) col.chamber.c.scores ??= field.biomeScores(col.chamber.c.x, col.chamber.c.z);
  const kStep = chunkSize / 4, kinds = [];
  for (let k = 0; k <= 4; k++) for (let i = 0; i <= 4; i++) kinds.push(field.biomeScores(x0 + i * kStep, z0 + k * kStep));
  return { cx, cz, x0, z0, cell, n, ny, yMin, values, H, entrances, cols, kinds, kStep };
}

/**
 * No cave where you couldn't get through it: slits of air too low to stand
 * in or too narrow to pass (air at a grid point with rock right above and
 * below it, or right on both sides of it both ways), and little pockets
 * shut in rock all round, are filled in. (Not by the entrances: their
 * ways down are laid out to be walked.) The physics reads this same grid,
 * so what's filled is solid as well as unseen.
 */
function passable(values, n, ny, x0, z0, cell, yMin, entrances) {
  const at = (i, j, k) => (k * n + i) * ny + j;
  const nearEntrance = (i, j, k) => {
    const x = x0 + i * cell, y = yMin + j * cell, z = z0 + k * cell;
    return entrances.some((e) => x > e.bounds.minX - 6 && x < e.bounds.maxX + 6 && z > e.bounds.minZ - 6 && z < e.bounds.maxZ + 6 && y > e.minY - 6 && y < e.maxY + 6);
  };
  // Slits.
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k < n - 1; k++) for (let i = 1; i < n - 1; i++) for (let j = 1; j < ny - 1; j++) {
      const c = at(i, j, k), v = values[c];
      if (v >= 0 || v < -1.4) continue; // (deeper in the air than that, there's room enough)
      const low = values[c - 1] >= 0 && values[c + 1] >= 0;
      const thin = values[at(i - 1, j, k)] >= 0 && values[at(i + 1, j, k)] >= 0 && values[at(i, j, k - 1)] >= 0 && values[at(i, j, k + 1)] >= 0;
      if ((low || thin) && !nearEntrance(i, j, k)) values[c] = 0.6;
    }
  }
  // Pockets: air shut in on every side within the chunk, however big, with
  // no way in from anywhere (nor an entrance): unreachable, so not built.
  const seen = new Uint8Array(values.length);
  const stack = [];
  for (let c0 = 0; c0 < values.length; c0++) {
    if (seen[c0] || values[c0] >= 0) continue;
    const comp = [];
    let edge = false;
    stack.push(c0);
    seen[c0] = 1;
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      const j = c % ny, col = (c - j) / ny, i = col % n, k = (col - i) / n;
      if (i === 0 || k === 0 || i === n - 1 || k === n - 1) edge = true; // (it may go on into the next chunk)
      for (const d of [1, -1, ny, -ny, n * ny, -n * ny]) {
        const q = c + d;
        if (q < 0 || q >= values.length || seen[q] || values[q] >= 0) continue;
        if ((d === 1 && j === ny - 1) || (d === -1 && j === 0)) continue;
        if ((d === ny && i === n - 1) || (d === -ny && i === 0)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (edge) continue;
    if (comp.some((c) => { const j = c % ny, col = (c - j) / ny, i = col % n, k = (col - i) / n; return nearEntrance(i, j, k); })) continue;
    for (const c of comp) values[c] = 0.6;
  }
}

/** Trilinear sample of a chunk grid at world coordinates (caller checks bounds). */
export function sampleGrid(grid, x, y, z) {
  const { x0, z0, cell, n, ny, yMin, values } = grid;
  const fx = (x - x0) / cell;
  const fz = (z - z0) / cell;
  const fy = (y - yMin) / cell;
  const i = Math.min(n - 2, Math.max(0, Math.floor(fx)));
  const k = Math.min(n - 2, Math.max(0, Math.floor(fz)));
  const j = Math.min(ny - 2, Math.max(0, Math.floor(fy)));
  const tx = fx - i, tz = fz - k, ty = fy - j;
  const b0 = (k * n + i) * ny + j; // (i, j, k)
  const bx = b0 + ny; // (i + 1, j, k)
  const bz = b0 + n * ny; // (i, j, k + 1)
  const bxz = bz + ny; // (i + 1, j, k + 1)
  const c00 = values[b0] * (1 - tx) + values[bx] * tx;
  const c10 = values[b0 + 1] * (1 - tx) + values[bx + 1] * tx;
  const c01 = values[bz] * (1 - tx) + values[bxz] * tx;
  const c11 = values[bz + 1] * (1 - tx) + values[bxz + 1] * tx;
  return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
}

/** Terrain height inside the grid, bilinear from the per-column samples. */
function gridHeight(grid, x, z) {
  const { x0, z0, cell, n, H } = grid;
  const fx = Math.min(n - 1.0001, Math.max(0, (x - x0) / cell));
  const fz = Math.min(n - 1.0001, Math.max(0, (z - z0) / cell));
  const i = Math.floor(fx), k = Math.floor(fz);
  const tx = fx - i, tz = fz - k;
  const c = k * n + i;
  return (H[c] * (1 - tx) + H[c + 1] * tx) * (1 - tz) + (H[c + n] * (1 - tx) + H[c + n + 1] * tx) * tz;
}

/**
 * Marching cubes over the chunk grid, with the ground surface folded in
 * (field = min(ground - y, caves)) so cave walls end where they meet the
 * ground. Triangles that are just the ground are dropped: the terrain mesh
 * draws the ground, including the hole at each mouth. Returns chunk-local
 * geometry, flat-shaded, with per-face colours.
 */
export function meshChunk(grid, field, out = {}) {
  const { x0, z0, cell, n, ny, yMin, values, H, entrances } = grid;
  const seed = field.seed;
  const positions = [];
  const colors = [];
  const sky = [];
  const glows = [];
  // (And the same rock plainer, each triangle left whole: for the chunks
  // further off, where the fine facets can't be made out: see CaveLayer.)
  const far = { positions: [], colors: [], glows: [], sky: [] };
  const color = new Color();
  // The lava's glow on the rock round a lava lake: strongest just over the
  // lava, fading up the walls and away from its shore, smooth from corner
  // to corner (each vertex its own, by where it is).
  const lavaLit = new Map();
  const lavaGlow = (x, y, z) => {
    const key = `${Math.round(x * 4)},${Math.round(y * 4)},${Math.round(z * 4)}`;
    let v = lavaLit.get(key);
    if (v !== undefined) return v;
    v = 0;
    const here = field.volcanicFloor(x, z), h = y - here.lava;
    if (h > -2 && h < 18) {
      let lit = 0;
      for (const [dx, dz, w] of [[0, 0, 0.4], [6, 0, 0.15], [-6, 0, 0.15], [0, 6, 0.15], [0, -6, 0.15]]) {
        const f = dx || dz ? field.volcanicFloor(x + dx, z + dz) : here;
        if (f.floor < f.lava - 0.2 && field.volcAt(x + dx, z + dz) > 0.45) lit += w;
      }
      v = lit * Math.exp(-Math.max(0, h) / 6);
    }
    lavaLit.set(key, v);
    return v;
  };

  // Corner offsets into `values` / `H`, and each edge's corner pair as offsets.
  const cornerIndex = CORNERS.map(([ox, oy, oz]) => (oz * n + ox) * ny + oy);
  const cornerColumn = CORNERS.map(([ox, , oz]) => oz * n + ox);
  const cornerY = CORNERS.map(([, oy]) => oy);
  const cornerVal = new Float64Array(8);
  const edgeX = new Float64Array(12), edgeY = new Float64Array(12), edgeZ = new Float64Array(12);

  // Small deterministic nudge per vertex (keyed on world position so chunks
  // agree on shared vertices) for a rockier facet pattern.
  const jitter = (x, y, z, axis) => (hash2(Math.round(x * 3.1 + y * 7.7), Math.round(z * 3.1 - y * 5.3), seed + axis) - 0.5) * 0.7;

  // Which heights of each column hold cave air? Cells away from cave air
  // and away from a mouth can only produce plain ground (which the terrain
  // mesh draws), so they're skipped outright: most of the chunk.
  const lowAir = new Int32Array(n * n).fill(ny);
  const highAir = new Int32Array(n * n).fill(-1);
  for (let c = 0; c < n * n; c++) {
    for (let j = 0; j < ny; j++) {
      if (values[c * ny + j] < 0) {
        if (j < lowAir[c]) lowAir[c] = j;
        highAir[c] = j;
      }
    }
  }

  const tri = [0, 0, 0], rim = [false, false, false], corner = new Float64Array(9);
  for (let k = 0; k < n - 1; k++) {
    for (let i = 0; i < n - 1; i++) {
      const colBase = (k * n + i) * ny;
      const col = k * n + i;
      let jFrom = Math.min(lowAir[col], lowAir[col + 1], lowAir[col + n], lowAir[col + n + 1]) - 1;
      let jTo = Math.max(highAir[col], highAir[col + 1], highAir[col + n], highAir[col + n + 1]) + 1;
      if (jTo < 0) continue; // solid rock (or plain ground) all the way
      jFrom = Math.max(0, jFrom);
      jTo = Math.min(ny - 1, jTo);
      for (let j = jFrom; j < jTo; j++) {
        const base = colBase + j;
        const cellY = yMin + j * cell;
        let index = 0;
        for (let c = 0; c < 8; c++) {
          const v = Math.min(H[col + cornerColumn[c]] - (cellY + cornerY[c] * cell), values[base + cornerIndex[c]]);
          cornerVal[c] = v;
          if (v < 0) index |= 1 << c;
        }
        const bits = edgeTable[index];
        if (bits === 0) continue;

        for (let e = 0; e < 12; e++) {
          if (!(bits & (1 << e))) continue;
          const a = EDGES[e][0], b = EDGES[e][1];
          const va = cornerVal[a], vb = cornerVal[b];
          const t = va === vb ? 0.5 : va / (va - vb);
          const A = CORNERS[a], B = CORNERS[b];
          edgeX[e] = (i + A[0] + (B[0] - A[0]) * t) * cell;
          edgeY[e] = yMin + (j + A[1] + (B[1] - A[1]) * t) * cell;
          edgeZ[e] = (k + A[2] + (B[2] - A[2]) * t) * cell;
        }

        const tb = index * 16;
        for (let t = 0; triTable[tb + t] !== -1; t += 3) {
          tri[0] = triTable[tb + t];
          tri[1] = triTable[tb + t + 1];
          tri[2] = triTable[tb + t + 2];
          const cxL = (edgeX[tri[0]] + edgeX[tri[1]] + edgeX[tri[2]]) / 3;
          const cy = (edgeY[tri[0]] + edgeY[tri[1]] + edgeY[tri[2]]) / 3;
          const czL = (edgeZ[tri[0]] + edgeZ[tri[1]] + edgeZ[tri[2]]) / 3;
          const wx = x0 + cxL;
          const wz = z0 + czL;

          // Ground or cave? On the ground surface the ground term is the smaller one.
          const ground = gridHeight(grid, wx, wz) - cy;
          const isGround = ground < 2.5 && ground <= sampleGrid(grid, wx, cy, wz) + 0.05;
          if (isGround) continue; // plain ground: the terrain mesh draws it
          // Wholly inside an entrance's built part: EntranceLayer draws that.
          if (entrances.some((e) => tri.every((ev) => CaveField.inBuilt(e, x0 + edgeX[ev], edgeY[ev], z0 + edgeZ[ev])))) continue;

          // Face normal from the table's winding.
          const ax = edgeX[tri[0]], ay = edgeY[tri[0]], az = edgeZ[tri[0]];
          const e1x = edgeX[tri[1]] - ax, e1y = edgeY[tri[1]] - ay, e1z = edgeZ[tri[1]] - az;
          const e2x = edgeX[tri[2]] - ax, e2y = edgeY[tri[2]] - ay, e2z = edgeZ[tri[2]] - az;
          let nx = e1y * e2z - e1z * e2y;
          let nyv = e1z * e2x - e1x * e2z;
          let nz = e1x * e2y - e1y * e2x;
          const len = Math.hypot(nx, nyv, nz);
          if (len < 1e-9) continue; // degenerate
          nx /= len; nyv /= len; nz /= len;
          // The normal must point into the air, i.e. down the field's
          // gradient. Get the gradient from this cell's own corner values.
          const u = cxL / cell - i, w = czL / cell - k, t2 = (cy - yMin) / cell - j;
          const c = cornerVal;
          const gx =
            (1 - t2) * (1 - w) * (c[1] - c[0]) + t2 * (1 - w) * (c[2] - c[3]) + (1 - t2) * w * (c[5] - c[4]) + t2 * w * (c[6] - c[7]);
          const gy =
            (1 - u) * (1 - w) * (c[3] - c[0]) + u * (1 - w) * (c[2] - c[1]) + (1 - u) * w * (c[7] - c[4]) + u * w * (c[6] - c[5]);
          const gz =
            (1 - u) * (1 - t2) * (c[4] - c[0]) + u * (1 - t2) * (c[5] - c[1]) + (1 - u) * t2 * (c[7] - c[3]) + u * t2 * (c[6] - c[2]);
          if (nx * gx + nyv * gy + nz * gz > 0) {
            const tmp = tri[1];
            tri[1] = tri[2];
            tri[2] = tmp;
            nx = -nx; nyv = -nyv; nz = -nz;
          }

          // Colour rock by which way the face points, in this cave's kind of rock.
          const faceSeed = hash2(Math.round(wx * 2), Math.round(cy * 2 + wz * 3), seed);
          const here = caveAt(grid, wx, cy, wz), kind = here.kind;
          // (The lush caves are plain stone under all their greenery.)
          const pal = PALETTES[kind === 1 ? 0 : kind];
          if (nyv > 0.55) {
            color.set(pal.floor[Math.floor(faceSeed * pal.floor.length)]);
          } else if (nyv < -0.45) {
            color.set(pal.ceiling);
          } else {
            color.set(pal.wall[Math.floor(faceSeed * pal.wall.length)]);
          }
          color.multiplyScalar(0.9 + faceSeed * 0.2);
          // Moss over it, where it's green: nearly all the floor, much of the
          // walls, some of the roof; in sheets, each face a shade of its own.
          const g2 = hash2(Math.round(wx * 3 + 11), Math.round(cy * 3 - wz * 2), seed + 3);
          const cover = (nyv > 0.55 ? 0.95 : nyv < -0.45 ? 0.45 : 0.7) * here.green;
          const mossy = here.green > 0 && mossField(wx, cy, wz) * 0.75 + g2 * 0.25 < cover;
          if (mossy) color.set(MOSS[Math.floor(g2 * MOSS.length * 7) % MOSS.length]).multiplyScalar(0.85 + faceSeed * 0.3);
          // Some of it gives its own light: a faint blue in the ice. (The lush caves are as
          // dark as any: what lights them is what glows in them, the
          // glow-worms and glowcaps and glowberries.)
          let gr = 0, gg = 0, gb = 0;
          // (Volcanic rock glows only where the lava is: see the lava, and its light.)
          if (kind === 3) (gr = 0.02), (gg = 0.05), (gb = 0.08);

          for (let q = 0; q < 3; q++) {
            const ev = tri[q];
            let px = edgeX[ev], py = edgeY[ev], pz = edgeZ[ev];
            // Every adjustment depends only on the vertex's own world position,
            // so triangles (and chunks) sharing a corner move it identically.
            const wxv = x0 + px, wyv = py, wzv = z0 + pz;
            // Where the rock meets the ground surface (the rim of a mouth),
            // leave the vertex on the surface so it meets the terrain.
            rim[q] = Math.abs(gridHeight(grid, wxv, wzv) - wyv) < 0.35;
            if (!rim[q]) {
              // Rock: a small nudge for a rougher facet pattern.
              px += jitter(wxv, wyv, wzv, 1);
              py += jitter(wxv, wyv, wzv, 2) * 0.6;
              pz += jitter(wxv, wyv, wzv, 3);
            }
            corner[q * 3] = px, corner[q * 3 + 1] = py, corner[q * 3 + 2] = pz;
          }
          // Finer facets: every triangle split in four (every one, or a split
          // side would leave a crack beside an unsplit one), the new corners (the
          // middles of its sides) pushed in or out a little, so the rock is
          // rough and craggy close to. (The push depends only on where the
          // middle is, so the triangle beside it, sharing that side, moves
          // it the same way: no gaps.)
          const emit = (a, b, c, shade, to = null) => {
            const P = to ? to.positions : positions, C = to ? to.colors : colors, G = to ? to.glows : glows, S = to ? to.sky : sky;
            for (const v of [a, b, c]) {
              P.push(v[0], v[1], v[2]);
              C.push(color.r * shade, color.g * shade, color.b * shade);
              if (v[1] > -118 && v[1] < -76) {
                const l = lavaGlow(x0 + v[0], v[1], z0 + v[2]);
                G.push(gr + 0.5 * l, gg + 0.16 * l, gb + 0.03 * l);
              } else G.push(gr, gg, gb);
              S.push(entrances.length ? CaveField.skyLight(entrances, x0 + v[0], v[1], z0 + v[2]) : 0.03);
            }
          };
          const A = [corner[0], corner[1], corner[2]], B = [corner[3], corner[4], corner[5]], Cc = [corner[6], corner[7], corner[8]];
          const mid = (P, Q, rimmed) => {
            const m = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2, (P[2] + Q[2]) / 2];
            if (rimmed) return m;
            const wx = x0 + m[0], wz = z0 + m[2];
            const k = 0.32;
            m[0] += (hash2(Math.round(wx * 4), Math.round(m[1] * 4 + wz * 3), seed + 11) - 0.5) * 2 * k;
            m[1] += (hash2(Math.round(wz * 4), Math.round(m[1] * 4 - wx * 3), seed + 12) - 0.5) * 2 * k;
            m[2] += (hash2(Math.round(m[1] * 4), Math.round(wx * 3 + wz * 4), seed + 13) - 0.5) * 2 * k;
            return m;
          };
          const AB = mid(A, B, rim[0] || rim[1]), BC = mid(B, Cc, rim[1] || rim[2]), CA = mid(Cc, A, rim[2] || rim[0]);
          const sh = (n) => 0.92 + hash2(Math.round(wx * 3 + n), Math.round(cy * 3 - n), seed + 14) * 0.16;
          emit(A, AB, CA, sh(1));
          emit(AB, B, BC, sh(2));
          emit(CA, BC, Cc, sh(3));
          emit(AB, BC, CA, sh(4));
          emit(A, B, Cc, sh(0), far);
        }
      }
    }
  }
  if (!positions.length) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('skyLight', new BufferAttribute(new Float32Array(sky), 1));
  geometry.setAttribute('glow', new BufferAttribute(new Float32Array(glows), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const plain = new BufferGeometry();
  plain.setAttribute('position', new BufferAttribute(new Float32Array(far.positions), 3));
  plain.setAttribute('color', new BufferAttribute(new Float32Array(far.colors), 3));
  plain.setAttribute('skyLight', new BufferAttribute(new Float32Array(far.sky), 1));
  plain.setAttribute('glow', new BufferAttribute(new Float32Array(far.glows), 3));
  plain.computeVertexNormals();
  out.far = plain;
  return geometry;
}

/**
 * The still water (or, in volcanic country, lava) lying in the low places:
 * the lakes in the great chambers' hollows and the rivers in their beds;
 * and small pools on ordinary cave floors (`pools`: [x, y, z, r, ...]).
 * Flat sheets, a little under 2 m square each. { water, lava } (chunk-local).
 */
export function liquidChunk(grid, field, pools) {
  const { x0, z0, n, cell, cols } = grid;
  const parts = { water: [], lava: [] };
  const step = 2;
  const f = (x, y, z) => Math.min(gridHeight(grid, x, z) - y, sampleGrid(grid, x, y, z));
  // (Each corner at its own water's level there, worked out from where the
  // corner is: so squares side by side meet exactly, even where the level
  // slopes, as a river's does and the lava's.)
  const quad = (list, x, z, h, levelAt) => {
    const a = x - x0, b = z - z0;
    const y00 = levelAt(x - h, z - h), y01 = levelAt(x - h, z + h), y11 = levelAt(x + h, z + h), y10 = levelAt(x + h, z - h);
    list.push(a - h, y00, b - h, a - h, y01, b + h, a + h, y11, b + h, a - h, y00, b - h, a + h, y11, b + h, a + h, y10, b - h);
  };
  for (let gz = step / 2; gz < field.chunkSize; gz += step) {
    for (let gx = step / 2; gx < field.chunkSize; gx += step) {
      const x = x0 + gx, z = z0 + gz;
      const col = cols[Math.min(n - 1, Math.round(gz / cell)) * n + Math.min(n - 1, Math.round(gx / cell))];
      // The lake in a great chamber's hollows; a river in its bed (only
      // where it has one: where it runs out into a chamber's open air, no
      // water hangs there). Wherever the floor rises over the water, the
      // rock hides the sheet: so its edge is where the water meets the floor.
      let level = null, levelAt = null;
      const ch = col.chamber;
      if (ch && ch.e < 1 && !(f(x, ch.c.lake - 4, z) < 0 && f(x, ch.c.lake - 8, z) < 0)) (level = ch.c.lake), (levelAt = () => ch.c.lake);
      const rv = field.riverAt(x, z, gridHeight(grid, x, z));
      if (rv && rv.across < rv.half * 0.92 && rv.fade > 0.5 && f(x, rv.level - 2.6, z) >= 0 && rv.level - 0.2 > (level ?? -Infinity)) {
        level = rv.level - 0.2;
        levelAt = (px, pz) => (field.riverAt(px, pz, 1e4)?.level ?? rv.level) - 0.2;
      }
      // (The lava lakes in the volcanic caverns' low ground.)
      if (col.volc > 0.45) {
        const vf = field.volcanicFloor(x, z);
        if (vf.floor < vf.lava && f(x, vf.lava - 6, z) >= 0 && vf.lava > (level ?? -Infinity)) (level = vf.lava), (levelAt = (px, pz) => field.volcanicFloor(px, pz).lava);
      }
      if (level === null) continue;
      quad(biomeIn(grid, x, level, z) === 2 ? parts.lava : parts.water, x, z, step / 2, levelAt); // (edge to edge, never overlapping: no seams)
    }
  }
  for (let k = 0; k < pools.length; k += 4) {
    const [px, py, pz, r] = [pools[k], pools[k + 1], pools[k + 2], pools[k + 3]];
    const list = biomeIn(grid, px, py, pz) === 2 ? parts.lava : parts.water;
    const N = 14, rr = (a) => r * (0.85 + 0.3 * hash2(Math.round(px * 3) + (a % N), Math.round(pz * 3), 77));
    for (let a = 0; a < N; a++) {
      const a0 = (a / N) * Math.PI * 2, a1 = ((a + 1) / N) * Math.PI * 2, r0 = rr(a), r1 = rr(a + 1);
      list.push(px - x0, py, pz - z0, px - x0 + Math.cos(a1) * r1, py, pz - z0 + Math.sin(a1) * r1, px - x0 + Math.cos(a0) * r0, py, pz - z0 + Math.sin(a0) * r0);
    }
  }
  const out = {};
  for (const [key, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const position = new Float32Array(list);
    const colour = new Float32Array(list.length), c = key === 'lava' ? LAVA_COLOUR : WATER_COLOUR;
    for (let v = 0; v < list.length; v += 3) colour.set(c, v);
    out[key] = { position, colour };
  }
  return out;
}

/**
 * Stalagmites rising from cave floors, stalactites hanging from roofs and
 * the odd pillar where the two meet, each in its cave's kind of rock: in
 * the ice they're icicles, long and pale; in volcanic country, stubby black
 * basalt with embers at the tips; in lush caves vines hang from the roof
 * too, and everywhere glow-worms speckle the high roofs like stars. Placed
 * on a grid of candidate columns, each checked against the cave field so
 * they sit on real floors and roofs. Returns { geometry, obstacles,
 * features, pools } (obstacles: [x, z, radius, bottom, top] in world
 * space, for collisions; pools: [x, y, z, radius]).
 */
export function decorateChunk(grid, field) {
  const { x0, z0, cell, ny, yMin, entrances } = grid;
  const seed = field.seed ^ 0x51f15e;
  const parts = [];
  const plants = []; // (the soft growths on the floor: never solid, see CaveLayer)
  let into = parts;
  const obstacles = [];
  const floors = []; // [x, y, z, random, roof, ...]: open cave floor, for the finds (see below)
  const roofs = []; // [x, y, z, random, ...]: high roofs, for bats
  const pools = [];
  const vines = [];
  const geysers = []; // [x, lip y, z, strength, ...]: the steaming ones
  const lights = []; // [x, y, z, kind, ...]: glowing things that light the cave round them (0 glow-worms, 1 glowcaps)
  const step = cell * 2;
  const f = (x, y, z) => Math.min(gridHeight(grid, x, z) - y, sampleGrid(grid, x, y, z));
  const tmp = new Color(), low = new Color(), tip = new Color();

  const piece = (g, x, y, z, colourAt, glow = null) => {
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3), glows = new Float32Array(pos.count * 3), skyArr = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v += 3) {
      colourAt(tmp, (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3, v);
      for (let q = 0; q < 3; q++) {
        colors.set([tmp.r, tmp.g, tmp.b], (v + q) * 3);
        if (glow) glows.set(glow, (v + q) * 3);
      }
    }
    skyArr.fill(entrances.length ? CaveField.skyLight(entrances, x, y, z) : 0.03);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    g.setAttribute('skyLight', new BufferAttribute(skyArr, 1));
    g.setAttribute('glow', new BufferAttribute(glows, 3));
    into.push(g);
  };
  // What a formation's made of, by where it stands: mostly the cave's own
  // rock (the walls' colour), or pale calcite, or warm flowstone, or
  // stained red with iron. (Ice is ice, and basalt basalt.)
  const shades = (kind, x, z) => {
    const pal = PALETTES[kind];
    if (kind === 2 || kind === 3) return [pal.low, pal.tip];
    const h = hash2(Math.round(x * 2 + 5), Math.round(z * 2 - 5), seed + 21);
    const wall = PALETTES[kind === 1 ? 0 : kind].wall;
    if (h < 0.4) return [wall[Math.floor(h * 12) % wall.length], wall[(Math.floor(h * 12) + 2) % wall.length]];
    if (h < 0.6) return [pal.low, pal.tip];
    if (h < 0.75) return [0xb8b2a6, 0xece8de]; // (calcite)
    if (h < 0.9) return [0xa08462, 0xd2bc94]; // (flowstone)
    return [0x845c48, 0xb0846a]; // (iron-stained)
  };
  const cone = (x, y, z, radius, height, down, s, kind) => {
    const pal = PALETTES[kind], [lo, hi] = shades(kind, x, z);
    const g = new ConeGeometry(radius, height, kind === 2 ? 6 : kind === 3 ? 5 : 6, 1).toNonIndexed();
    g.deleteAttribute('uv');
    if (down) g.rotateX(Math.PI);
    g.rotateY(s * 6.28);
    g.translate(x - x0, y + (down ? -height / 2 : height / 2), z - z0);
    low.set(lo);
    tip.set(hi);
    piece(g, x, y, z, (c, cyv, v) => {
      const t = Math.min(1, Math.max(0, down ? (y - cyv) / height : (cyv - y) / height));
      c.copy(low).lerp(tip, t).multiplyScalar(0.9 + hash2(v, Math.round(x * 10), seed) * 0.2);
    }, kind === 3 ? [0.03, 0.06, 0.09] : null);
  };
  // A softer formation, turned on a lathe: rounded, a little lumpy, with a
  // blunt tip (not a spear); or a column, where a stalagmite and the
  // stalactite over it have grown down and up to meet halfway, pinched at
  // the waist where they joined. Many more triangles than a cone.
  const lathe = (x, y, z, radius, height, down, s, kind, column = false) => {
    const [lo, hi] = shades(kind, x, z), pts = [];
    const N = column ? 12 : 8;
    // (A soft one rises to a blunt, rounded top: a dome, not a point.)
    const top = radius * (0.32 + 0.2 * ((s * 7) % 1));
    const body = column ? height : height - top;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const lump = 1 + 0.12 * Math.sin(t * 17 + s * 30) + 0.08 * Math.sin(t * 41 + s * 11);
      let r;
      if (column) {
        const u = Math.abs(2 * t - 1); // (0 at the waist, 1 at the floor and roof)
        r = radius * (0.32 + 0.68 * u ** 1.6) * lump;
      } else r = (top + (radius - top) * Math.pow(1 - t, 1.3)) * lump;
      pts.push(new Vector2(Math.max(0.02, r), t * body));
    }
    if (!column) for (let k = 1; k <= 4; k++) {
      const a = (k / 4) * (Math.PI / 2);
      pts.push(new Vector2(Math.max(0.001, top * Math.cos(a)), body + top * Math.sin(a)));
    }
    const g = new LatheGeometry(pts, column ? 10 : 8).toNonIndexed();
    g.deleteAttribute('uv');
    if (down) g.rotateX(Math.PI);
    g.rotateY(s * 6.28);
    g.translate(x - x0, y, z - z0);
    low.set(lo);
    tip.set(hi);
    piece(g, x, y, z, (c, cyv, v) => {
      let t = Math.min(1, Math.max(0, down ? (y - cyv) / height : (cyv - y) / height));
      if (column) t = 1 - Math.abs(2 * t - 1);
      c.copy(low).lerp(tip, t).multiplyScalar(0.88 + hash2(v, Math.round(x * 10), seed) * 0.24);
    }, kind === 3 ? [0.03, 0.06, 0.09] : null);
  };
  const box = (x, y, z, w, h, d, colour, glow = null, ry = 0) => {
    const g = new BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('uv');
    g.rotateY(ry);
    g.translate(x - x0, y, z - z0);
    piece(g, x, y, z, (c) => c.set(colour), glow);
  };

  // A boulder fallen from the roof long ago, half sunk in the floor.
  const boulder = (x, y, z, r, colour, s, glow = null) => {
    const g = new DodecahedronGeometry(r, 0);
    g.deleteAttribute('uv');
    g.scale(1 + s * 0.4, 0.6 + s * 0.3, 1.2 - s * 0.3);
    g.rotateY(s * 6.28);
    g.translate(x - x0, y + r * 0.25, z - z0);
    piece(g, x, y, z, (c, cyv, v) => c.set(colour).multiplyScalar(0.85 + hash2(v, Math.round(x * 7), seed + 9) * 0.25), glow);
    obstacles.push(x, z, r * 0.95, y - 0.3, y + r * 0.9);
  };
  // A fern of the dark: four or five long fronds, arching out.
  const fern = (x, y, z, size, s) => {
    for (let k = 0; k < 5; k++) {
      const a = s * 6.28 + k * 1.3;
      const g = new BoxGeometry(0.08 * size, 0.012, 0.55 * size).toNonIndexed();
      g.deleteAttribute('uv');
      g.translate(0, 0, 0.27 * size);
      g.rotateX(-0.55 - (k % 2) * 0.25);
      g.rotateY(a);
      g.translate(x - x0, y + 0.05, z - z0);
      piece(g, x, y, z, (c) => c.set(k % 2 ? 0x4a7a30 : 0x5a8a38));
    }
  };

  // A young plant sprouting in the dark: a pale stem, curling, broad leaves
  // opening along it and at its top (some knee-high, some up to your chest).
  const sprout = (x, y, z, s) => {
    const h = 0.4 + ((s * 37) % 1) * 1.0;
    const stem = new CylinderGeometry(0.018, 0.03, h, 5).toNonIndexed();
    stem.deleteAttribute('uv');
    stem.rotateZ(((s * 13) % 1 - 0.5) * 0.3);
    stem.translate(x - x0, y + h / 2, z - z0);
    piece(stem, x, y, z, (c) => c.set(0x8aa860));
    for (let k = 0; k < 5; k++) {
      const t = 0.35 + k * 0.15, a = s * 30 + k * 2.4, size = 0.12 + (k === 4 ? 0.12 : k * 0.03);
      const leaf = new BoxGeometry(size * 2, 0.012, size).toNonIndexed();
      leaf.deleteAttribute('uv');
      leaf.translate(size, 0, 0);
      leaf.rotateZ(k === 4 ? 0.5 : 0.25);
      leaf.rotateY(a);
      leaf.translate(x - x0, y + h * Math.min(1, t), z - z0);
      piece(leaf, x, y, z, (c) => c.set(k % 2 ? 0x5a9a3c : 0x6aaa48));
    }
  };

  // A geyser's cone: a broad mound of crusted mineral (pale yellow-white at
  // its lip), and a dark throat sunk in its top. Returns the lip's height.
  const geyser = (x, y, z, R, H, s) => {
    const pts = [
      new Vector2(R, -0.3), new Vector2(R * 0.85, H * 0.25), new Vector2(R * 0.62, H * 0.6), new Vector2(R * 0.42, H * 0.92),
      new Vector2(R * 0.34, H), new Vector2(R * 0.24, H * 0.9), new Vector2(R * 0.16, H * 0.55), new Vector2(0.02, H * 0.35),
    ];
    const g = new LatheGeometry(pts, 11).toNonIndexed();
    g.deleteAttribute('uv');
    g.rotateY(s * 6.28);
    g.translate(x - x0, y, z - z0);
    piece(g, x, y, z, (c, cyv, v) => {
      const t = Math.min(1, Math.max(0, (cyv - y) / H));
      const inner = t > 0.6 && hash2(v, 3, seed) < 0.5 ? 1 : 0;
      c.set(inner ? 0x2a2224 : t > 0.8 ? 0xd8cf9a : t > 0.5 ? 0xa8987a : 0x3a3236).multiplyScalar(0.88 + hash2(v, Math.round(x * 9), seed + 2) * 0.24);
    });
    obstacles.push(x, z, R * 0.7, y - 0.3, y + H);
    return y + H;
  };

  for (let gz = step / 2; gz < field.chunkSize; gz += step) {
    for (let gx = step / 2; gx < field.chunkSize; gx += step) {
      const wx0 = x0 + gx, wz0 = z0 + gz;
      const h = hash2(Math.round(wx0), Math.round(wz0), seed);
      if (h > 0.85) continue;
      const x = wx0 + (hash2(Math.round(wx0), 7, seed) - 0.5) * cell;
      const z = wz0 + (hash2(Math.round(wz0), 9, seed) - 0.5) * cell;
      const surface = gridHeight(grid, x, z);

      // Walk down the column, finding floors (air above rock) and the roof above each.
      let prev = f(x, yMin + (ny - 1) * cell, z);
      for (let y = yMin + (ny - 2) * cell; y > yMin; y -= cell * 0.5) {
        const v = f(x, y, z);
        if (prev < 0 && v >= 0 && y < surface - 4) {
          // Refine the floor.
          let lo = y, hi = y + cell * 0.5;
          for (let r = 0; r < 5; r++) {
            const mid = (lo + hi) / 2;
            if (f(x, mid, z) >= 0) lo = mid;
            else hi = mid;
          }
          const floor = (lo + hi) / 2;
          let roof = floor + 0.5;
          while (roof < floor + 90 && f(x, roof, z) < 0) roof += roof < floor + 30 ? 0.5 : 2;
          const gap = roof - floor;
          const kind = biomeIn(grid, x, floor, z);
          // Nothing on the floor of an entrance tunnel: keep the way in clear.
          const inEntrance = entrances.some((e) => CaveField.inBuilt(e, x, floor, z) || CaveField.ramp(e, x, floor + 1, z) < 1.5);
          const flat = !inEntrance && f(x, floor + 0.6, z) < -0.3 && f(x + 1.5, floor - 0.5, z) >= 0 && f(x - 1.5, floor - 0.5, z) >= 0;
          const r1 = hash2(Math.round(x * 3), Math.round(floor * 3), seed + 1);
          const r2 = hash2(Math.round(z * 3), Math.round(roof * 3), seed + 2);
          const r3 = hash2(Math.round(x * 5 + 3), Math.round(roof * 5 - z), seed + 4);
          if (!inEntrance && gap > 2.2 && f(x, floor + 0.4, z) < -0.2) floors.push(x, floor, z, hash2(Math.round(x * 7), Math.round(floor * 7), seed + 5), roof);
          if (gap > 9 && h < 0.4) roofs.push(x, roof, z, r3);
          if (h < 0.55) {
            if (gap > 3 && gap < 40 && r1 < 0.16 && flat) {
              // A column: stalagmite and stalactite grown together, in any
              // cave where the roof's in reach (great ones under high roofs).
              const radius = 0.5 + r2 * 0.8 + gap * 0.07;
              lathe(x, floor - 0.4, z, radius, gap + 0.8, false, r1, kind, true);
              obstacles.push(x, z, radius * 0.75, floor - 0.3, roof);
            } else {
              const soft = r2 > 0.22 || kind === 1; // (most rounded and soft-topped; a few sharp)
              if (gap > 3.5 && flat && r1 < (kind === 2 ? 0.7 : 0.55)) {
                // (Volcanic: squat basalt; ice: thin and tall. Where the roof's
                // high, some grow huge: towers of stone half way to it.)
                const giant = gap > 14 && r1 < 0.24 ? 2.6 : 1;
                const height = Math.min(gap * (giant > 1 ? 0.6 : 0.45), (kind === 3 ? 2.5 + r1 * 10 : 2 + r1 * 9) * giant) * (kind === 2 ? 0.6 : 1);
                const radius = height * (kind === 2 ? 0.32 : kind === 3 ? 0.12 : 0.18 + r2 * 0.08) * (soft ? 1.2 : 1);
                if (soft && kind !== 3) lathe(x, floor - 0.3, z, radius, height + 0.3, false, r1, kind);
                else cone(x, floor - 0.3, z, radius, height + 0.3, false, r1, kind);
                obstacles.push(x, z, radius * 0.8, floor - 0.3, floor + height);
                // (And the stalactite over it, reaching down: sometimes near enough to touch.)
                if (r3 < 0.35 && gap > height + 2) {
                  const down = Math.min(gap - height - (r3 < 0.12 ? 0.1 : 1.2), (gap - height) * 0.9);
                  if (down > 1) lathe(x, roof + 0.3, z, Math.min(radius, down * 0.25), down + 0.3, true, r2, kind);
                }
              }
              if (gap > 4 && r2 < (kind === 3 ? 0.85 : 0.5)) {
                // (Icicles: many, long and thin.)
                const height = Math.min(gap * 0.4, kind === 3 ? 2 + r2 * 10 : 1.5 + r2 * 8);
                if (kind !== 3 && r1 > 0.3) lathe(x + 0.4, roof + 0.3, z - 0.3, height * 0.2, height + 0.3, true, r2, kind);
                else cone(x + 0.4, roof + 0.3, z - 0.3, height * (kind === 3 ? 0.09 : 0.17), height + 0.3, true, r2, kind);
                if (kind === 3 && r2 < 0.4) cone(x - 0.5, roof + 0.2, z + 0.4, height * 0.06, height * 0.7, true, r1, kind);
              }
            }
          }
          // Lush: vines hanging from the roof, of several kinds (see
          // CaveLayer: drawn there, so they swing aside as you push through).
          // [x, top, z, length, kind, width, turn]: kinds 0 a thin strand, 1 a
          // leafy vine, 2 a wide curtain of them, 3 one hung with glowberries.
          // (A few pale root strands in the plain caves too.)
          if ((kind === 1 && gap > 3 && r3 < 0.85) || (kind === 0 && gap > 3 && r3 < 0.06)) {
            for (let k = 0; k < (kind === 1 ? 6 : 2); k++) {
              const hv = hash2(k, Math.round(x * 9), seed + 6);
              const len = Math.min(gap - 1.4, 1.5 + hv * hv * 9);
              const ox = (hash2(k, Math.round(z * 9), seed + 7) - 0.5) * step, oz = (hash2(k + 5, Math.round(x * 9), seed + 7) - 0.5) * step;
              if (len < 1 || f(x + ox, roof - 0.3, z + oz) >= 0) continue;
              // (The roof right over it: hung from the rock itself.)
              let top = roof - 0.3;
              while (top < roof + 2 && f(x + ox, top + 0.2, z + oz) < 0) top += 0.2;
              const pick = hash2(k + 9, Math.round((x - z) * 7), seed + 8);
              const vk = kind === 0 ? 0 : pick < 0.3 ? 0 : pick < 0.62 ? 1 : pick < 0.82 ? 2 : 3;
              vines.push(x + ox, top + 0.1, z + oz, Math.min(len, top - floor - 1.2), vk, vk === 2 ? 0.8 + pick : 0.8 + hv * 0.6, pick * 6.28);
            }
          }
          // Volcanic: geysers here and there on the floor, some steaming.
          if (kind === 2 && !inEntrance && flat && gap > 5 && r3 > 0.78) {
            const R = 1.4 + (r3 - 0.78) * 9, H = 0.8 + r2 * 1.8;
            const lip = geyser(x + 0.3, floor, z + 0.3, R, H, r1);
            if (r1 < 0.65) geysers.push(x + 0.3, lip, z + 0.3, 0.6 + r2);
          }
          // Boulders on the floor, here and there (squat and dark in volcanic
          // country, pale in the ice).
          // (Mostly knee-high, a few great ones: up to six metres, where there's room.)
          if (!inEntrance && gap > 2.8 && r2 > 0.86 && f(x, floor - 0.6, z) >= 0) {
            const t = (r2 - 0.86) / 0.14;
            const big = t > 0.8 ? ((t - 0.8) / 0.2) * 4.6 : 0;
            const r = Math.min(0.45 + 1.1 * t + big, gap * 0.45);
            boulder(x + 0.6, floor, z - 0.4, r, PALETTES[kind].wall[Math.floor(r1 * 5) % PALETTES[kind].wall.length], r1, kind === 3 ? [0.03, 0.06, 0.09] : null);
          }
          // Lush: ferns, moss in soft clumps and small glowing growths over the floor.
          if (kind === 1 && !inEntrance && gap > 1.6) {
            into = plants;
            for (let k = 0; k < 7; k++) {
              const ox = (hash2(k, Math.round(x * 11), seed + 15) - 0.5) * step, oz = (hash2(k + 3, Math.round(z * 11), seed + 15) - 0.5) * step;
              let fy = floor + 0.5;
              while (fy > floor - 1.5 && f(x + ox, fy, z + oz) < 0) fy -= 0.15;
              if (fy <= floor - 1.5 || f(x + ox, fy + 0.6, z + oz) >= 0) continue;
              const pick = hash2(k + 7, Math.round((x + z) * 5), seed + 16);
              // (Mostly moss: soft cushions of it all over the floor; ferns among it.)
              if (pick < 0.2) fern(x + ox, fy, z + oz, 0.8 + pick * 4, pick * 9);
              else if (pick < 0.32) sprout(x + ox, fy, z + oz, pick);
              else if (pick < 0.93) {
                // A cushion of moss: lumpy, and speckled (each little facet
                // its own green, a few paler or yellowed), tufts poking up.
                const r = 0.3 + (pick - 0.32) * 1.4;
                const g = new IcosahedronGeometry(r, 1);
                g.deleteAttribute('uv');
                const pos = g.attributes.position;
                for (let v = 0; v < pos.count; v++) {
                  const k = 1 + 0.18 * Math.sin(pos.getX(v) * 23 + pos.getZ(v) * 17) * Math.sin(pos.getY(v) * 19);
                  pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k, pos.getZ(v) * k);
                }
                g.scale(1.4, 0.32, 1.2);
                g.translate(x + ox - x0, fy + 0.02, z + oz - z0);
                piece(g, x, fy, z, (c, cyv, v) => {
                  const h = hash2(v, Math.round((x + ox) * 50 + (z + oz) * 30), seed + 31);
                  c.set(h < 0.08 ? 0x8aa24e : h < 0.16 ? 0x2e4a1e : MOSS[Math.floor(h * 31) % MOSS.length]);
                });
                for (let t = 0; t < 4; t++) {
                  const a = t * 1.7 + pick * 20, d = r * 0.6 * ((t * 37) % 10) / 10;
                  const tuft = new ConeGeometry(0.025, 0.12 + (t % 2) * 0.08, 4).toNonIndexed();
                  tuft.deleteAttribute('uv');
                  tuft.translate(x + ox + Math.cos(a) * d - x0, fy + r * 0.3 + 0.06, z + oz + Math.sin(a) * d - z0);
                  piece(tuft, x, fy, z, (c) => c.set(t % 2 ? 0x6a9a44 : 0x7aaa50));
                }
              } else {
                // A clump of little glowing mushrooms, giving a soft light.
                for (let m = 0; m < 5; m++) {
                  const mx = x + ox + Math.cos(m * 2.4 + pick * 9) * 0.18 * (m % 3), mz = z + oz + Math.sin(m * 2.4 + pick * 9) * 0.18 * (m % 3), h = 0.08 + (m % 3) * 0.06;
                  box(mx, fy + h / 2, mz, 0.025, h, 0.025, 0xd8f0e0, [0.1, 0.3, 0.22]);
                  const cap = new ConeGeometry(0.06 + (m % 2) * 0.03, 0.05, 7).toNonIndexed();
                  cap.deleteAttribute('uv');
                  cap.translate(mx - x0, fy + h + 0.02, mz - z0);
                  piece(cap, mx, fy, mz, (c) => c.set(0x9affd0), [0.35, 0.95, 0.7]);
                }
                lights.push(x + ox, fy + 0.4, z + oz, 1);
              }
            }
            into = parts;
          }
          // Glow-worms: tiny lights speckling the high roofs (most of all in the great chambers, and the lush caves).
          // (Thick in the lush caves, on every roof; and the nearest of
          // them light the cave round them: see CaveLayer.)
          if (gap > (kind === 1 ? 4 : 7) && kind !== 2 && kind !== 3 && r3 < (kind === 1 ? 1 : gap > 25 ? 0.7 : 0.25)) {
            if (kind === 1 || gap > 25) lights.push(x, roof - 0.8, z, 0);
            for (let k = 0; k < (kind === 1 ? 16 : gap > 25 ? 10 : 6); k++) {
              const ox = (hash2(k, Math.round(x * 13), seed + 8) - 0.5) * step, oz = (hash2(k + 9, Math.round(z * 13), seed + 8) - 0.5) * step;
              let ry = roof;
              while (ry > roof - 3 && f(x + ox, ry, z + oz) >= 0) ry -= 0.25;
              if (ry <= roof - 3) continue;
              box(x + ox, ry + 0.05, z + oz, gap > 25 ? 0.16 : 0.09, gap > 25 ? 0.16 : 0.09, gap > 25 ? 0.16 : 0.09, 0x9affe8, [0.5, 1.1, 1.0], k);
            }
          }
          y = floor - cell; // continue below this floor
          prev = f(x, y, z);
          continue;
        }
        prev = v;
      }
    }
  }
  // What's to be found on the cave floors: [kind, x, y, z, turn, size, ...].
  // Kinds: 1 iron ore, 2 crystals, 3 glowcaps, 4 bones, 5 coal, 6 gold ore,
  // 7 cave mushrooms, 8 deathcaps, 10 mountain iron ore, 11 bat guano,
  // 12 a bat roost (on the roof over it). The deeper, the richer: iron
  // and coal everywhere; the dark ore that steel is made from below 40 m
  // down; gold only far down, past 60.
  const features = [];
  let iron = 0;
  for (let k = 0; k < floors.length; k += 5) {
    const [x, y, z, r, roof] = floors.slice(k, k + 5);
    const kind = biomeIn(grid, x, y, z);
    const deep = Math.min(1, Math.max(0, -y / 100));
    // (Still pools in hollows of the floor: only where the floor holds water.)
    // A pond, where the floor dips into a hollow: the water lies level in
    // it, up to a little below its rim all round (the sheet reaches past
    // the shore, under the rock, so its edge is wherever water meets
    // floor), never hanging over a drop.
    if (r > (kind === 2 ? 0.76 : 0.84) && kind !== 3 && kind !== 1) {
      const level = y + 0.75, R = 3 + (r - 0.84) * 28;
      let rim = 0, sound = true;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (f(x + Math.cos(a) * R, level + 0.1, z + Math.sin(a) * R) >= 0) rim++;
        if (k % 3 === 0 && f(x + Math.cos(a) * R * 0.5, level - 2.5, z + Math.sin(a) * R * 0.5) < 0) sound = false;
      }
      if (rim >= 10 && sound && f(x, level + 0.4, z) < 0) {
        pools.push(x, level, z, R + 0.6);
        continue;
      }
    }
    const table = [
      [1, 0.04 + 0.03 * deep],
      [5, kind === 2 ? 0.01 : 0.03],
      [10, deep > 0.4 ? 0.03 * deep : 0],
      [6, y < -60 ? 0.012 + 0.02 * deep : 0],
      [2, kind === 3 ? 0.07 : 0.025 + 0.03 * deep],
      [3, kind === 1 ? 0.16 : kind === 2 || kind === 3 ? 0 : 0.04],
      [7, kind === 1 ? 0.07 : kind === 0 || kind === 4 ? 0.035 : 0],
      [8, kind === 2 || kind === 3 ? 0 : 0.018],
      [4, 0.015],
      [11, kind === 0 || kind === 1 || kind === 4 ? (roof - y > 9 ? 0.03 : 0.006) : 0],
    ];
    let acc = 0, pick = 0;
    for (const [id, chance] of table) {
      acc += chance;
      if (r < acc) {
        pick = id;
        break;
      }
    }
    if (!pick) continue;
    if (pick === 1) iron++;
    const size = pick === 1 ? 0.8 + (r * 37 % 1) * 0.4 : pick === 5 ? 1.6 + (r * 37 % 1) * 0.8 : pick === 6 || pick === 10 ? 1.3 + (r * 37 % 1) * 0.4 : 0.7 + (r * 13 % 1) * 0.8;
    features.push(pick, x, y, z, r * 71 % 6.28, size);
    if (pick === 11 && roof - y > 6) features.push(12, x, roof, z, r * 31 % 6.28, 1); // (the roost the guano fell from)
  }
  for (let k = 0; iron < 2 && k < floors.length; k += 5 * 5) {
    const [x, y, z, r] = floors.slice(k, k + 4);
    if (r < 0.35) continue; // (something's there already)
    features.push(1, x, y, z, r * 71 % 6.28, 0.9);
    iron++;
  }
  // Bat roosts on the high roofs of the plainer caves, too.
  for (let k = 0; k < roofs.length; k += 4) {
    const [x, y, z, r] = roofs.slice(k, k + 4);
    const kind = biomeIn(grid, x, y, z);
    if (r < 0.03 && (kind === 0 || kind === 1 || kind === 4)) features.push(12, x, y, z, r * 97 % 6.28, 1);
  }
  const merge = (list) => {
    if (!list.length) return null;
    const g = mergeGeometries(list);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  return { geometry: merge(parts), plants: merge(plants), obstacles, features, pools, vines, lights, geysers };
}

/**
 * Builds everything for one chunk as plain arrays (so it can come back from
 * a Web Worker without copying): the field grid for collisions, the rock
 * mesh, the stalagmite mesh and stalagmite obstacles. `grid` is null when
 * the chunk has no caves.
 */
export function buildChunkData(field, cx, cz, chunkSize) {
  const grid = sampleChunk(field, cx, cz, chunkSize);
  if (!grid) return { grid: null, rock: null, rockFar: null, deco: null, plants: null, obstacles: new Float32Array(0), features: new Float32Array(0), pools: new Float32Array(0), vines: new Float32Array(0), lights: new Float32Array(0), geysers: new Float32Array(0), water: null, lava: null };
  const plain = {};
  const rock = meshChunk(grid, field, plain);
  const deco = decorateChunk(grid, field);
  const liquid = liquidChunk(grid, field, deco.pools);
  const pack = (g) =>
    g && {
      position: g.attributes.position.array,
      normal: g.attributes.normal.array,
      color: g.attributes.color.array,
      skyLight: g.attributes.skyLight.array,
      glow: g.attributes.glow.array,
    };
  const { values, x0, z0, cell, n, ny, yMin } = grid;
  return {
    grid: { cx, cz, x0, z0, cell, n, ny, yMin, values },
    rock: pack(rock),
    rockFar: rock ? pack(plain.far) : null,
    deco: pack(deco.geometry),
    plants: pack(deco.plants),
    obstacles: new Float32Array(deco.obstacles),
    features: new Float32Array(deco.features),
    pools: new Float32Array(deco.pools),
    vines: new Float32Array(deco.vines),
    lights: new Float32Array(deco.lights),
    geysers: new Float32Array(deco.geysers),
    water: liquid.water ?? null,
    lava: liquid.lava ?? null,
  };
}

/** The ArrayBuffers inside a buildChunkData() result, for transferring. */
export function chunkDataBuffers(data) {
  const out = [];
  if (data.grid) out.push(data.grid.values.buffer);
  for (const part of [data.rock, data.rockFar, data.deco, data.plants, data.water, data.lava]) if (part) for (const a of Object.values(part)) out.push(a.buffer);
  out.push(data.obstacles.buffer);
  if (data.features) out.push(data.features.buffer);
  if (data.pools) out.push(data.pools.buffer);
  if (data.vines) out.push(data.vines.buffer);
  if (data.lights) out.push(data.lights.buffer);
  if (data.geysers) out.push(data.geysers.buffer);
  return [...new Set(out)];
}
