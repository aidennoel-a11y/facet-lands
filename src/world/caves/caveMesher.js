import { BufferAttribute, BufferGeometry, Color, ConeGeometry } from 'three';
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

const WALL = [0x6f6a79, 0x77727f, 0x656170, 0x7f7a86, 0x6a6572];
const FLOOR = [0x6b6158, 0x5f564e, 0x746a5f];
const CEILING = 0x55515d;
const STONE_LOW = new Color(0x857d71);
const STONE_TIP = new Color(0xbdb4a4);

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
  let anyCave = entrances.length > 0;
  let maxTop = field.bottom;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cell;
      const z = z0 + k * cell;
      const c = k * n + i;
      H[c] = g.getHeight(x, z);
      region[c] = field.regionRock(x, z);
      if (region[c] < 10) anyCave = true;
      maxTop = Math.max(maxTop, Math.min(field.top, H[c] - field.cover));
    }
  }
  if (!anyCave) return null;

  // Vertical range: the cave band, plus any entrance tunnel.
  let top = maxTop + 4;
  for (const e of entrances) top = Math.max(top, e.maxY + 3);
  const yMin = Math.floor((field.bottom - 4) / cell) * cell;
  const ny = Math.min(96, Math.ceil((top - yMin) / cell) + 1);

  const values = new Float32Array(n * n * ny);
  let hasAir = false;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const c = k * n + i;
      const x = x0 + i * cell;
      const z = z0 + k * cell;
      for (let j = 0; j < ny; j++) {
        const y = yMin + j * cell;
        let d = field.caves(x, y, z, H[c], region[c]);
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
  return { cx, cz, x0, z0, cell, n, ny, yMin, values, H, entrances };
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

          // Colour rock by which way the face points.
          const faceSeed = hash2(Math.round(wx * 2), Math.round(cy * 2 + wz * 3), seed);
          if (nyv > 0.55) {
            color.set(FLOOR[Math.floor(faceSeed * FLOOR.length)]);
          } else if (nyv < -0.45) {
            color.set(CEILING);
          } else {
            color.set(WALL[Math.floor(faceSeed * WALL.length)]);
          }
          color.multiplyScalar(0.9 + faceSeed * 0.2);

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
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Stalagmites rising from cave floors, stalactites hanging from roofs and
 * the odd pillar where the two meet. Placed on a grid of candidate columns,
 * each checked against the cave field so they sit on real floors and roofs.
 * Returns { geometry, obstacles } (obstacles: [x, z, radius, bottom, top]
 * in world space, for collisions).
 */
export function decorateChunk(grid, field) {
  const { x0, z0, cell, ny, yMin, entrances } = grid;
  const seed = field.seed ^ 0x51f15e;
  const parts = [];
  const obstacles = [];
  const step = cell * 2;
  const f = (x, y, z) => Math.min(gridHeight(grid, x, z) - y, sampleGrid(grid, x, y, z));
  const tmp = new Color();

  const cone = (x, y, z, radius, height, down, s) => {
    const g = new ConeGeometry(radius, height, 6, 1).toNonIndexed();
    g.deleteAttribute('uv');
    if (down) g.rotateX(Math.PI);
    g.rotateY(s * 6.28);
    g.translate(x - x0, y + (down ? -height / 2 : height / 2), z - z0);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const skyArr = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v += 3) {
      const cyv = (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3;
      const t = Math.min(1, Math.max(0, down ? (y - cyv) / height : (cyv - y) / height));
      tmp.copy(STONE_LOW).lerp(STONE_TIP, t).multiplyScalar(0.9 + hash2(v, Math.round(x * 10), seed) * 0.2);
      for (let q = 0; q < 3; q++) colors.set([tmp.r, tmp.g, tmp.b], (v + q) * 3);
    }
    skyArr.fill(entrances.length ? CaveField.skyLight(entrances, x, y, z) : 0.03);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    g.setAttribute('skyLight', new BufferAttribute(skyArr, 1));
    parts.push(g);
  };

  for (let gz = step / 2; gz < field.chunkSize; gz += step) {
    for (let gx = step / 2; gx < field.chunkSize; gx += step) {
      const wx0 = x0 + gx, wz0 = z0 + gz;
      const h = hash2(Math.round(wx0), Math.round(wz0), seed);
      if (h > 0.55) continue;
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
          while (roof < floor + 30 && f(x, roof, z) < 0) roof += 0.5;
          const gap = roof - floor;
          // Nothing on the floor of an entrance tunnel: keep the way in clear.
          const inEntrance = entrances.some((e) => CaveField.inBuilt(e, x, floor, z) || CaveField.ramp(e, x, floor + 1, z) < 1.5);
          const flat = !inEntrance && f(x, floor + 0.6, z) < -0.3 && f(x + 1.5, floor - 0.5, z) >= 0 && f(x - 1.5, floor - 0.5, z) >= 0;
          const r1 = hash2(Math.round(x * 3), Math.round(floor * 3), seed + 1);
          const r2 = hash2(Math.round(z * 3), Math.round(roof * 3), seed + 2);
          if (gap > 3 && gap < 11 && r1 < 0.12 && flat) {
            // Pillar: a stalagmite and stalactite that meet.
            const radius = 0.45 + r2 * 0.4;
            cone(x, floor - 0.3, z, radius * 1.3, gap * 0.62, false, r1);
            cone(x, roof + 0.3, z, radius * 1.2, gap * 0.55, true, r2);
            obstacles.push(x, z, radius * 1.1, floor - 0.3, roof);
          } else {
            if (gap > 3.5 && flat && r1 < 0.55) {
              const height = Math.min(gap * 0.45, 1 + r1 * 4.5);
              const radius = height * (0.18 + r2 * 0.08);
              cone(x, floor - 0.3, z, radius, height + 0.3, false, r1);
              obstacles.push(x, z, radius * 0.8, floor - 0.3, floor + height);
            }
            if (gap > 4 && r2 < 0.5) {
              const height = Math.min(gap * 0.35, 0.8 + r2 * 4);
              cone(x + 0.4, roof + 0.3, z - 0.3, height * 0.17, height + 0.3, true, r2);
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
  if (!parts.length) return { geometry: null, obstacles };
  const geometry = mergeGeometries(parts);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, obstacles };
}

/**
 * Builds everything for one chunk as plain arrays (so it can come back from
 * a Web Worker without copying): the field grid for collisions, the rock
 * mesh, the stalagmite mesh and stalagmite obstacles. `grid` is null when
 * the chunk has no caves.
 */
export function buildChunkData(field, cx, cz, chunkSize) {
  const grid = sampleChunk(field, cx, cz, chunkSize);
  if (!grid) return { grid: null, rock: null, deco: null, obstacles: new Float32Array(0) };
  const rock = meshChunk(grid, field);
  const deco = decorateChunk(grid, field);
  const pack = (g) =>
    g && {
      position: g.attributes.position.array,
      normal: g.attributes.normal.array,
      color: g.attributes.color.array,
      skyLight: g.attributes.skyLight.array,
    };
  const { values, x0, z0, cell, n, ny, yMin } = grid;
  return {
    grid: { cx, cz, x0, z0, cell, n, ny, yMin, values },
    rock: pack(rock),
    deco: pack(deco.geometry),
    obstacles: new Float32Array(deco.obstacles),
  };
}

/** The ArrayBuffers inside a buildChunkData() result, for transferring. */
export function chunkDataBuffers(data) {
  const out = [];
  if (data.grid) out.push(data.grid.values.buffer);
  for (const part of [data.rock, data.deco]) if (part) for (const a of Object.values(part)) out.push(a.buffer);
  out.push(data.obstacles.buffer);
  return [...new Set(out)];
}
