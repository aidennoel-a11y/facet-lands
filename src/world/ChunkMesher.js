import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';
import { faceColor } from './biomes.js';

const color = new Color();
const ab = new Vector3();
const ac = new Vector3();
const normal = new Vector3();
const skirtNormal = new Vector3();

/**
 * Builds the triangle mesh for one chunk.
 *
 * The grid is laid out on the *finest* LOD's vertex indices, so a coarse
 * chunk's vertices land exactly on a fine chunk's vertices (same jitter,
 * same height). Every triangle gets its own three vertices, which gives
 * each face one flat normal and one flat colour: the low-poly look.
 *
 * Positions are relative to the chunk's origin to keep float precision
 * good far from the world origin.
 */
export function buildChunkGeometry(generator, config, cx, cz, resolution) {
  const { chunkSize, vertexJitter, skirtDepth } = config;
  const finest = config.lods[0].resolution;
  const step = finest / resolution; // fine-grid indices per cell at this LOD
  const fineCell = chunkSize / finest;
  const seed = generator.seed;

  const originX = cx * chunkSize;
  const originZ = cz * chunkSize;
  const baseGx = cx * finest;
  const baseGz = cz * finest;

  // 1. Vertex grid (shared positions; faces copy from here).
  const n = resolution + 1;
  const gridX = new Float32Array(n * n);
  const gridY = new Float32Array(n * n);
  const gridZ = new Float32Array(n * n);
  const jitter = vertexJitter * fineCell;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gx = baseGx + i * step;
      const gz = baseGz + j * step;
      const lx = (gx - baseGx) * fineCell + (hash2(gx, gz, seed) - 0.5) * 2 * jitter;
      const lz = (gz - baseGz) * fineCell + (hash2(gx, gz, seed ^ 0x9e3779b9) - 0.5) * 2 * jitter;
      const k = j * n + i;
      gridX[k] = lx;
      gridZ[k] = lz;
      gridY[k] = generator.getHeight(originX + lx, originZ + lz);
    }
  }

  const surfaceTris = resolution * resolution * 2;
  const skirtTris = resolution * 4 * 2;
  const totalVerts = (surfaceTris + skirtTris) * 3;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  let v = 0; // float offset into the arrays

  // Per-grid-vertex sum of surface normals, so skirts can borrow the
  // shading of the ground right above them.
  const vertexNormals = new Float32Array(n * n * 3);

  // skirtNormal: light and colour the face like the ground above it, so the
  // sliver you see through an LOD crack blends right in.
  function pushTri(ax, ay, az, bx, by, bz, qx, qy, qz, varSeedX, varSeedZ, skirtNormal = null) {
    const isSkirt = skirtNormal !== null;
    if (isSkirt) {
      normal.copy(skirtNormal);
    } else {
      ab.set(bx - ax, by - ay, bz - az);
      ac.set(qx - ax, qy - ay, qz - az);
      normal.crossVectors(ab, ac).normalize();
    }

    const mx = (ax + bx + qx) / 3;
    const my = isSkirt ? Math.max(ay, by, qy) : (ay + by + qy) / 3;
    const mz = (az + bz + qz) / 3;
    const wx = originX + mx;
    const wz = originZ + mz;
    const biome = generator.getBiome(wx, wz);
    faceColor(biome, my + generator.getColorJitter(wx, wz), normal.y, color);

    // Tiny per-face brightness shift so neighbouring faces read as facets.
    const shade = 0.93 + hash2(varSeedX, varSeedZ, seed ^ 0x51ed27) * 0.14;
    const r = color.r * shade;
    const g = color.g * shade;
    const b = color.b * shade;

    positions[v] = ax; positions[v + 1] = ay; positions[v + 2] = az;
    positions[v + 3] = bx; positions[v + 4] = by; positions[v + 5] = bz;
    positions[v + 6] = qx; positions[v + 7] = qy; positions[v + 8] = qz;
    for (let o = 0; o < 9; o += 3) {
      normals[v + o] = normal.x; normals[v + o + 1] = normal.y; normals[v + o + 2] = normal.z;
      colors[v + o] = r; colors[v + o + 1] = g; colors[v + o + 2] = b;
    }
    v += 9;
  }

  // 2. Surface: two triangles per cell, diagonal picked per cell so the
  //    pattern doesn't read as a regular grid. Winding is CCW from above.
  const cellSize = chunkSize / resolution;
  function cellTriangles(i, j) {
    const a = j * n + i;
    const b = a + 1;
    const c = a + n;
    const d = c + 1;
    const flip = hash2(baseGx + i * step, baseGz + j * step, seed + 7) < 0.5;
    return flip ? [a, c, d, a, d, b] : [a, c, b, b, c, d];
  }
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const tris = cellTriangles(i, j);
      const gx = baseGx + i * step;
      const gz = baseGz + j * step;
      for (let t = 0; t < 6; t += 3) {
        const p0 = tris[t], p1 = tris[t + 1], p2 = tris[t + 2];
        pushTri(gridX[p0], gridY[p0], gridZ[p0], gridX[p1], gridY[p1], gridZ[p1], gridX[p2], gridY[p2], gridZ[p2], gx * 2 + t / 3, gz);
        for (const p of [p0, p1, p2]) {
          vertexNormals[p * 3] += normal.x;
          vertexNormals[p * 3 + 1] += normal.y;
          vertexNormals[p * 3 + 2] += normal.z;
        }
      }
    }
  }

  // 3. Skirts: a strip hanging down from each edge. Where a detailed chunk
  //    meets a coarser one the edges don't match exactly; the skirt fills
  //    the gap so you never see through the ground.
  const edges = [
    (t) => t, // north edge, j = 0, walking +x
    (t) => (t + 1) * n - 1, // east edge, i = res, walking +z
    (t) => resolution * n + (resolution - t), // south edge, j = res, walking -x
    (t) => (resolution - t) * n, // west edge, i = 0, walking -z
  ];
  for (const edge of edges) {
    for (let t = 0; t < resolution; t++) {
      const p = edge(t);
      const q = edge(t + 1);
      const px = gridX[p], py = gridY[p], pz = gridZ[p];
      const qx = gridX[q], qy = gridY[q], qz = gridZ[q];
      skirtNormal
        .set(
          vertexNormals[p * 3] + vertexNormals[q * 3],
          vertexNormals[p * 3 + 1] + vertexNormals[q * 3 + 1],
          vertexNormals[p * 3 + 2] + vertexNormals[q * 3 + 2],
        )
        .normalize();
      // Outward-facing (the edges above walk clockwise seen from above).
      pushTri(px, py, pz, qx, qy, qz, qx, qy - skirtDepth, qz, p, q, skirtNormal);
      pushTri(px, py, pz, qx, qy - skirtDepth, qz, px, py - skirtDepth, pz, q, p, skirtNormal);
    }
  }

  // Height of the actual triangle surface at a chunk-local point (x, z).
  // Differs slightly from generator.getHeight() because the mesh is made of
  // flat triangles; things standing on the ground (trees) should use this.
  function groundHeightAt(x, z) {
    const ci = Math.floor(x / cellSize);
    const cj = Math.floor(z / cellSize);
    // Jitter can push a point into a neighbouring cell's triangles.
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= resolution || j >= resolution) continue;
        const tris = cellTriangles(i, j);
        for (let t = 0; t < 6; t += 3) {
          const p0 = tris[t], p1 = tris[t + 1], p2 = tris[t + 2];
          const x0 = gridX[p0], z0 = gridZ[p0];
          const e1x = gridX[p1] - x0, e1z = gridZ[p1] - z0;
          const e2x = gridX[p2] - x0, e2z = gridZ[p2] - z0;
          const det = e1x * e2z - e2x * e1z;
          const px = x - x0, pz = z - z0;
          const u = (px * e2z - e2x * pz) / det;
          const w = (e1x * pz - px * e1z) / det;
          if (u >= -1e-4 && w >= -1e-4 && u + w <= 1 + 1e-4) {
            return gridY[p0] + u * (gridY[p1] - gridY[p0]) + w * (gridY[p2] - gridY[p0]);
          }
        }
      }
    }
    return null; // outside this chunk's surface
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    triangles: surfaceTris,
    // Handy for decoration layers (trees, rocks...) that need heights.
    heights: { gridX, gridY, gridZ, size: n },
    groundHeightAt,
  };
}
