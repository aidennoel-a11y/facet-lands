import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';
import { faceColor } from './biomes.js';

const color = new Color();
const ab = new Vector3();
const ac = new Vector3();
const normal = new Vector3();

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

  // isSkirt: light and colour the face as if it were flat ground at that
  // height, so the sliver you see through an LOD crack blends right in.
  function pushTri(ax, ay, az, bx, by, bz, qx, qy, qz, varSeedX, varSeedZ, isSkirt = false) {
    if (isSkirt) {
      normal.set(0, 1, 0);
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
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      const gx = baseGx + i * step;
      const gz = baseGz + j * step;
      const flip = hash2(gx, gz, seed + 7) < 0.5;
      if (flip) {
        pushTri(gridX[a], gridY[a], gridZ[a], gridX[c], gridY[c], gridZ[c], gridX[d], gridY[d], gridZ[d], gx * 2, gz);
        pushTri(gridX[a], gridY[a], gridZ[a], gridX[d], gridY[d], gridZ[d], gridX[b], gridY[b], gridZ[b], gx * 2 + 1, gz);
      } else {
        pushTri(gridX[a], gridY[a], gridZ[a], gridX[c], gridY[c], gridZ[c], gridX[b], gridY[b], gridZ[b], gx * 2, gz);
        pushTri(gridX[b], gridY[b], gridZ[b], gridX[c], gridY[c], gridZ[c], gridX[d], gridY[d], gridZ[d], gx * 2 + 1, gz);
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
      // Outward-facing (the edges above walk clockwise seen from above).
      pushTri(px, py, pz, qx, qy, qz, qx, qy - skirtDepth, qz, p, q, true);
      pushTri(px, py, pz, qx, qy - skirtDepth, qz, px, py - skirtDepth, pz, q, p, true);
    }
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
  };
}
