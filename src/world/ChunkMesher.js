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

  // Cave mouths (full detail only): triangles sitting over an entrance
  // tunnel's air are left out, opening a hole straight into it. Worked out
  // first because the hole's rim adds triangles.
  const caveSystem = resolution === finest ? generator.caves : null;
  const mouths = caveSystem ? caveSystem.mouthsNear(originX, originZ, originX + chunkSize, originZ + chunkSize) : [];
  const cut = new Set(); // (cell index * 2 + triangle) of removed triangles
  const overAir = (k) => caveSystem.cutsTerrain(mouths, originX + gridX[k], gridY[k], originZ + gridZ[k]);
  if (mouths.length) {
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const tris = cellTriangles(i, j);
        for (let t = 0; t < 6; t += 3) {
          const p0 = tris[t], p1 = tris[t + 1], p2 = tris[t + 2];
          const corners = overAir(p0) + overAir(p1) + overAir(p2);
          const centre = caveSystem.cutsTerrain(
            mouths,
            originX + (gridX[p0] + gridX[p1] + gridX[p2]) / 3,
            (gridY[p0] + gridY[p1] + gridY[p2]) / 3,
            originZ + (gridZ[p0] + gridZ[p1] + gridZ[p2]) / 3,
            0.3,
          );
          // Triangles mostly over the tunnel; the rim walls line the edge of
          // the hole, so the bit of rock a partly-covered triangle exposes is hidden.
          if (centre && corners >= 2) cut.add((j * resolution + i) * 2 + t / 3);
        }
      }
    }
  }

  const surfaceTris = resolution * resolution * 2;
  const skirtTris = resolution * 4 * 2;
  const rimTris = cut.size * 3 * 2; // at most a wall quad per cut triangle edge
  const totalVerts = (surfaceTris + skirtTris + rimTris) * 3;
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
        if (cut.has((j * resolution + i) * 2 + t / 3)) continue;
        pushTri(gridX[p0], gridY[p0], gridZ[p0], gridX[p1], gridY[p1], gridZ[p1], gridX[p2], gridY[p2], gridZ[p2], gx * 2 + t / 3, gz);
        for (const p of [p0, p1, p2]) {
          vertexNormals[p * 3] += normal.x;
          vertexNormals[p * 3 + 1] += normal.y;
          vertexNormals[p * 3 + 2] += normal.z;
        }
      }
    }
  }

  // 2b. Cave mouth rims: rock walls hanging from the edge of each hole, facing
  //     into it, so the opening looks dug into the ground rather than cut out.
  if (cut.size) {
    const edgeUse = new Map(); // "a,b" -> { cut: [triangle centres], kept: count }
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const tris = cellTriangles(i, j);
        for (let t = 0; t < 6; t += 3) {
          const isCut = cut.has((j * resolution + i) * 2 + t / 3);
          const tri = [tris[t], tris[t + 1], tris[t + 2]];
          const cx3 = (gridX[tri[0]] + gridX[tri[1]] + gridX[tri[2]]) / 3;
          const cz3 = (gridZ[tri[0]] + gridZ[tri[1]] + gridZ[tri[2]]) / 3;
          for (let e = 0; e < 3; e++) {
            const a = tri[e], b = tri[(e + 1) % 3];
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            let use = edgeUse.get(key);
            if (!use) edgeUse.set(key, (use = { a, b, cut: [], kept: 0 }));
            if (isCut) use.cut.push([cx3, cz3]);
            else use.kept++;
          }
        }
      }
    }
    const rimNormal = new Vector3();
    for (const { a, b, cut: cutSides, kept } of edgeUse.values()) {
      if (cutSides.length !== 1) continue; // not on the hole's edge (or inside it)
      const [ccx, ccz] = cutSides[0];
      const mx = (gridX[a] + gridX[b]) / 2;
      const mz = (gridZ[a] + gridZ[b]) / 2;
      if (!kept) {
        // Edge on the chunk border: only add a wall if the ground across it is solid.
        const ox = 2 * mx - ccx, oz = 2 * mz - ccz;
        if (caveSystem.cutsTerrain(mouths, originX + ox, (gridY[a] + gridY[b]) / 2, originZ + oz, 0)) continue;
      }
      const depth = 4.5;
      rimNormal.set(ccx - mx, 0, ccz - mz).normalize(); // into the hole
      const ax = gridX[a], ay = gridY[a], az = gridZ[a];
      const bx = gridX[b], by = gridY[b], bz = gridZ[b];
      // Wind the quad so its front faces into the hole: (a, b, b-below) faces
      // along (ez, 0, -ex).
      const ex = bx - ax, ez = bz - az;
      const faceIn = ez * rimNormal.x - ex * rimNormal.z > 0;
      if (faceIn) {
        pushTri(ax, ay, az, bx, by, bz, bx, by - depth, bz, a, b, rimNormal);
        pushTri(ax, ay, az, bx, by - depth, bz, ax, ay - depth, az, b, a, rimNormal);
      } else {
        pushTri(bx, by, bz, ax, ay, az, ax, ay - depth, az, a, b, rimNormal);
        pushTri(bx, by, bz, ax, ay - depth, az, bx, by - depth, bz, b, a, rimNormal);
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
  // Skirts are shallower than the rock over any cave, and stop short of an
  // entrance ramp running underneath, so they never wall a cave off.
  const ramps = generator.caves ? generator.caves.mouthsNear(originX, originZ, originX + chunkSize, originZ + chunkSize) : [];
  const skirtBottom = (k) =>
    ramps.length
      ? generator.caves.skirtBottom(ramps, originX + gridX[k], gridY[k], originZ + gridZ[k], skirtDepth)
      : gridY[k] - skirtDepth;
  for (const edge of edges) {
    for (let t = 0; t < resolution; t++) {
      const p = edge(t);
      const q = edge(t + 1);
      const px = gridX[p], py = gridY[p], pz = gridZ[p];
      const qx = gridX[q], qy = gridY[q], qz = gridZ[q];
      const pb = skirtBottom(p);
      const qb = skirtBottom(q);
      skirtNormal
        .set(
          vertexNormals[p * 3] + vertexNormals[q * 3],
          vertexNormals[p * 3 + 1] + vertexNormals[q * 3 + 1],
          vertexNormals[p * 3 + 2] + vertexNormals[q * 3 + 2],
        )
        .normalize();
      if (skirtNormal.lengthSq() === 0) skirtNormal.set(0, 1, 0);
      // Outward-facing (the edges above walk clockwise seen from above).
      pushTri(px, py, pz, qx, qy, qz, qx, qb, qz, p, q, skirtNormal);
      pushTri(px, py, pz, qx, qb, qz, px, pb, pz, q, p, skirtNormal);
    }
  }

  // Height of the actual triangle surface at a chunk-local point (x, z).
  // Differs slightly from generator.getHeight() because the mesh is made of
  // flat triangles; things standing on the ground (trees) should use this.
  // If `out` is given, out.normalY receives how flat the triangle is (1 = flat).
  // Returns NaN over a cave mouth (no ground there) and null outside the chunk.
  function groundHeightAt(x, z, out) {
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
            if (cut.size && cut.has((j * resolution + i) * 2 + t / 3)) return NaN;
            const e1y = gridY[p1] - gridY[p0];
            const e2y = gridY[p2] - gridY[p0];
            if (out) {
              const nx = e1y * e2z - e1z * e2y;
              const ny = e1z * e2x - e1x * e2z;
              const nz = e1x * e2y - e1y * e2x;
              out.normalY = Math.abs(ny) / Math.hypot(nx, ny, nz);
            }
            return gridY[p0] + u * e1y + w * e2y;
          }
        }
      }
    }
    return null; // outside this chunk's surface
  }

  const geometry = new BufferGeometry();
  // Trim the unused space left by any triangles cut for cave mouths.
  geometry.setAttribute('position', new BufferAttribute(v < positions.length ? positions.slice(0, v) : positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(v < normals.length ? normals.slice(0, v) : normals, 3));
  geometry.setAttribute('color', new BufferAttribute(v < colors.length ? colors.slice(0, v) : colors, 3));
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
