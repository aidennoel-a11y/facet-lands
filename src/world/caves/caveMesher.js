import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry } from 'three';
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
const WATER_COLOUR = [0.16, 0.3, 0.36], LAVA_COLOUR = [1, 0.42, 0.1];

/** The cave kind at a world point, from the chunk's coarse grid of scores (see sampleChunk). */
export function biomeIn(grid, x, y, z) {
  const { kinds, kStep, x0, z0 } = grid;
  if (!kinds) return 0;
  const fx = Math.min(3.999, Math.max(0, (x - x0) / kStep)), fz = Math.min(3.999, Math.max(0, (z - z0) / kStep));
  const i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
  const a = kinds[k * 5 + i], b = kinds[k * 5 + i + 1], c = kinds[(k + 1) * 5 + i], d = kinds[(k + 1) * 5 + i + 1];
  const mix = (key) => (a[key] * (1 - tx) + b[key] * tx) * (1 - tz) + (c[key] * (1 - tx) + d[key] * tx) * tz;
  return CaveField.biomeAt({ lush: mix('lush'), volcanic: mix('volcanic'), ice: mix('ice'), dry: mix('dry') }, y);
}

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
  // The kind of cave country, on a coarse grid (5 x 5 over the chunk).
  const kStep = chunkSize / 4, kinds = [];
  for (let k = 0; k <= 4; k++) for (let i = 0; i <= 4; i++) kinds.push(field.biomeScores(x0 + i * kStep, z0 + k * kStep));
  return { cx, cz, x0, z0, cell, n, ny, yMin, values, H, entrances, cols, kinds, kStep };
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
export function meshChunk(grid, field) {
  const { x0, z0, cell, n, ny, yMin, values, H, entrances } = grid;
  const seed = field.seed;
  const positions = [];
  const colors = [];
  const sky = [];
  const glows = [];
  const color = new Color();

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

  const tri = [0, 0, 0];
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
          const kind = biomeIn(grid, wx, cy, wz), pal = PALETTES[kind];
          if (nyv > 0.55) {
            color.set(pal.floor[Math.floor(faceSeed * pal.floor.length)]);
          } else if (nyv < -0.45) {
            color.set(pal.ceiling);
          } else {
            color.set(pal.wall[Math.floor(faceSeed * pal.wall.length)]);
          }
          color.multiplyScalar(0.9 + faceSeed * 0.2);
          // Some of it gives its own light: cracks of glowing rock on a
          // volcanic floor, a faint blue in the ice, glowing moss here and
          // there in the lush caves.
          const g2 = hash2(Math.round(wx * 3 + 11), Math.round(cy * 3 - wz * 2), seed + 3);
          let gr = 0, gg = 0, gb = 0;
          if (kind === 2 && nyv > 0.3 && g2 < 0.12) (gr = 0.9), (gg = 0.32), (gb = 0.06);
          else if (kind === 2 && g2 < 0.03) (gr = 0.6), (gg = 0.18), (gb = 0.04);
          else if (kind === 3) (gr = 0.02), (gg = 0.05), (gb = 0.08);
          else if (kind === 1 && nyv > 0.3 && g2 < 0.05) (gr = 0.05), (gg = 0.32), (gb = 0.2);

          for (let q = 0; q < 3; q++) {
            const ev = tri[q];
            let px = edgeX[ev], py = edgeY[ev], pz = edgeZ[ev];
            // Every adjustment depends only on the vertex's own world position,
            // so triangles (and chunks) sharing a corner move it identically.
            const wxv = x0 + px, wyv = py, wzv = z0 + pz;
            // Where the rock meets the ground surface (the rim of a mouth),
            // leave the vertex on the surface so it meets the terrain.
            if (Math.abs(gridHeight(grid, wxv, wzv) - wyv) >= 0.35) {
              // Rock: a small nudge for a rougher facet pattern.
              px += jitter(wxv, wyv, wzv, 1);
              py += jitter(wxv, wyv, wzv, 2) * 0.6;
              pz += jitter(wxv, wyv, wzv, 3);
            }
            positions.push(px, py, pz);
            colors.push(color.r, color.g, color.b);
            glows.push(gr, gg, gb);
            sky.push(entrances.length ? CaveField.skyLight(entrances, x0 + px, py, z0 + pz) : 0.03);
          }
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
  const quad = (list, x, y, z, h) => {
    const a = x - x0, b = z - z0;
    list.push(a - h, y, b - h, a - h, y, b + h, a + h, y, b + h, a - h, y, b - h, a + h, y, b + h, a + h, y, b - h);
  };
  for (let gz = step / 2; gz < field.chunkSize; gz += step) {
    for (let gx = step / 2; gx < field.chunkSize; gx += step) {
      const x = x0 + gx, z = z0 + gz;
      const col = cols[Math.min(n - 1, Math.round(gz / cell)) * n + Math.min(n - 1, Math.round(gx / cell))];
      // The lake in a great chamber's hollows; a river in its bed (only
      // where it has one: where it runs out into a chamber's open air, no
      // water hangs there). Wherever the floor rises over the water, the
      // rock hides the sheet: so its edge is where the water meets the floor.
      let level = null;
      const ch = col.chamber;
      if (ch && ch.e < 1 && !(f(x, ch.c.lake - 4, z) < 0 && f(x, ch.c.lake - 8, z) < 0)) level = ch.c.lake;
      const rv = field.riverAt(x, z, gridHeight(grid, x, z));
      if (rv && rv.across < rv.half * 0.92 && rv.fade > 0.5 && f(x, rv.level - 2.6, z) >= 0) level = Math.max(level ?? -Infinity, rv.level - 0.2);
      if (level === null) continue;
      quad(biomeIn(grid, x, level, z) === 2 ? parts.lava : parts.water, x, level, z, step / 2 + 0.05);
    }
  }
  for (let k = 0; k < pools.length; k += 4) {
    const [px, py, pz, r] = [pools[k], pools[k + 1], pools[k + 2], pools[k + 3]];
    const list = biomeIn(grid, px, py, pz) === 2 ? parts.lava : parts.water;
    for (let a = 0; a < 7; a++) {
      const a0 = (a / 7) * Math.PI * 2, a1 = ((a + 1) / 7) * Math.PI * 2;
      list.push(px - x0, py, pz - z0, px - x0 + Math.cos(a1) * r, py, pz - z0 + Math.sin(a1) * r, px - x0 + Math.cos(a0) * r, py, pz - z0 + Math.sin(a0) * r);
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
  const obstacles = [];
  const floors = []; // [x, y, z, random, roof, ...]: open cave floor, for the finds (see below)
  const roofs = []; // [x, y, z, random, ...]: high roofs, for bats
  const pools = [];
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
    parts.push(g);
  };
  const cone = (x, y, z, radius, height, down, s, kind) => {
    const pal = PALETTES[kind];
    const g = new ConeGeometry(radius, height, kind === 2 ? 6 : kind === 3 ? 5 : 6, 1).toNonIndexed();
    g.deleteAttribute('uv');
    if (down) g.rotateX(Math.PI);
    g.rotateY(s * 6.28);
    g.translate(x - x0, y + (down ? -height / 2 : height / 2), z - z0);
    low.set(pal.low);
    tip.set(pal.tip);
    piece(g, x, y, z, (c, cyv, v) => {
      const t = Math.min(1, Math.max(0, down ? (y - cyv) / height : (cyv - y) / height));
      c.copy(low).lerp(tip, t).multiplyScalar(0.9 + hash2(v, Math.round(x * 10), seed) * 0.2);
    }, kind === 2 && !down ? [0.35, 0.1, 0.02] : kind === 3 ? [0.03, 0.06, 0.09] : null);
  };
  const box = (x, y, z, w, h, d, colour, glow = null, ry = 0) => {
    const g = new BoxGeometry(w, h, d).toNonIndexed();
    g.deleteAttribute('uv');
    g.rotateY(ry);
    g.translate(x - x0, y, z - z0);
    piece(g, x, y, z, (c) => c.set(colour), glow);
  };

  for (let gz = step / 2; gz < field.chunkSize; gz += step) {
    for (let gx = step / 2; gx < field.chunkSize; gx += step) {
      const wx0 = x0 + gx, wz0 = z0 + gz;
      const h = hash2(Math.round(wx0), Math.round(wz0), seed);
      if (h > 0.75) continue;
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
            if (gap > 3 && gap < 11 && r1 < 0.12 && flat) {
              // Pillar: a stalagmite and stalactite that meet.
              const radius = 0.45 + r2 * 0.4;
              cone(x, floor - 0.3, z, radius * 1.3, gap * 0.62, false, r1, kind);
              cone(x, roof + 0.3, z, radius * 1.2, gap * 0.55, true, r2, kind);
              obstacles.push(x, z, radius * 1.1, floor - 0.3, roof);
            } else {
              if (gap > 3.5 && flat && r1 < (kind === 2 ? 0.7 : 0.55)) {
                // (Volcanic: squat basalt; ice: thin and tall.)
                const height = Math.min(gap * 0.45, kind === 3 ? 1.5 + r1 * 6 : 1 + r1 * 4.5) * (kind === 2 ? 0.6 : 1);
                const radius = height * (kind === 2 ? 0.32 : kind === 3 ? 0.12 : 0.18 + r2 * 0.08);
                cone(x, floor - 0.3, z, radius, height + 0.3, false, r1, kind);
                obstacles.push(x, z, radius * 0.8, floor - 0.3, floor + height);
              }
              if (gap > 4 && r2 < (kind === 3 ? 0.85 : 0.5)) {
                // (Icicles: many, long and thin.)
                const height = Math.min(gap * 0.35, kind === 3 ? 1.2 + r2 * 6 : 0.8 + r2 * 4);
                cone(x + 0.4, roof + 0.3, z - 0.3, height * (kind === 3 ? 0.09 : 0.17), height + 0.3, true, r2, kind);
                if (kind === 3 && r2 < 0.4) cone(x - 0.5, roof + 0.2, z + 0.4, height * 0.06, height * 0.7, true, r1, kind);
              }
            }
          }
          // Lush: vines hanging from the roof, a few long ones.
          if (kind === 1 && gap > 3 && r3 < 0.45) {
            for (let k = 0; k < 3; k++) {
              const len = Math.min(gap - 1.2, 1.2 + hash2(k, Math.round(x * 9), seed + 6) * 5);
              const ox = (hash2(k, Math.round(z * 9), seed + 7) - 0.5) * 2.2, oz = (hash2(k + 5, Math.round(x * 9), seed + 7) - 0.5) * 2.2;
              if (f(x + ox, roof - 0.3, z + oz) >= 0) continue;
              box(x + ox, roof + 0.3 - len / 2, z + oz, 0.07, len, 0.07, k === 1 ? 0x4a7a30 : 0x3e6a2a, null, k);
              if (k === 0) box(x + ox, roof + 0.3 - len, z + oz, 0.12, 0.12, 0.12, 0xe8c050, [0.5, 0.36, 0.08], 0.5); // (a glowberry at its end)
            }
          }
          // Glow-worms: tiny lights speckling the high roofs (most of all in the great chambers, and the lush caves).
          if (gap > 7 && kind !== 2 && kind !== 3 && r3 < (kind === 1 ? 0.8 : gap > 25 ? 0.7 : 0.25)) {
            for (let k = 0; k < (gap > 25 ? 10 : 6); k++) {
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
    if (r > 0.97 && kind !== 3 && f(x + 2, y + 0.3, z) >= 0 && f(x - 2, y + 0.3, z) >= 0 && f(x, y + 0.3, z + 2) >= 0 && f(x, y + 0.3, z - 2) >= 0) {
      pools.push(x, y + 0.12, z, 1.6 + (r - 0.97) * 60);
      continue;
    }
    const table = [
      [1, 0.04 + 0.03 * deep],
      [5, kind === 2 ? 0.01 : 0.03],
      [10, deep > 0.4 ? 0.03 * deep : 0],
      [6, y < -60 ? 0.012 + 0.02 * deep : 0],
      [2, kind === 3 ? 0.07 : 0.025 + 0.03 * deep],
      [3, kind === 1 ? 0.09 : kind === 2 || kind === 3 ? 0 : 0.04],
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
  if (!parts.length) return { geometry: null, obstacles, features, pools };
  const geometry = mergeGeometries(parts);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, obstacles, features, pools };
}

/**
 * Builds everything for one chunk as plain arrays (so it can come back from
 * a Web Worker without copying): the field grid for collisions, the rock
 * mesh, the stalagmite mesh and stalagmite obstacles. `grid` is null when
 * the chunk has no caves.
 */
export function buildChunkData(field, cx, cz, chunkSize) {
  const grid = sampleChunk(field, cx, cz, chunkSize);
  if (!grid) return { grid: null, rock: null, deco: null, obstacles: new Float32Array(0), features: new Float32Array(0), pools: new Float32Array(0), water: null, lava: null };
  const rock = meshChunk(grid, field);
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
    deco: pack(deco.geometry),
    obstacles: new Float32Array(deco.obstacles),
    features: new Float32Array(deco.features),
    pools: new Float32Array(deco.pools),
    water: liquid.water ?? null,
    lava: liquid.lava ?? null,
  };
}

/** The ArrayBuffers inside a buildChunkData() result, for transferring. */
export function chunkDataBuffers(data) {
  const out = [];
  if (data.grid) out.push(data.grid.values.buffer);
  for (const part of [data.rock, data.deco, data.water, data.lava]) if (part) for (const a of Object.values(part)) out.push(a.buffer);
  out.push(data.obstacles.buffer);
  if (data.features) out.push(data.features.buffer);
  if (data.pools) out.push(data.pools.buffer);
  return [...new Set(out)];
}
