import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';
import { CaveField } from './caves/CaveField.js';


const color = new Color();
const ab = new Vector3();
const ac = new Vector3();
const normal = new Vector3();
const skirtNormal = new Vector3();

/**
 * Builds the triangle mesh for one chunk: works out its data (see
 * computeChunkData, which a worker can do) and wraps it up (chunkFromData).
 */
export function buildChunkGeometry(generator, config, cx, cz, resolution) {
  return chunkFromData(generator, config, cx, cz, resolution, computeChunkData(generator, config, cx, cz, resolution));
}

/** The lattice and cell-diagonal helpers every part of a chunk agrees on. */
function chunkGrid(seed, config, cx, cz, resolution) {
  const { chunkSize } = config;
  const finest = config.lods[0].resolution;
  const step = finest / resolution;
  return {
    step,
    baseGx: cx * finest,
    baseGz: cz * finest,
    n: resolution + 1,
    cellSize: chunkSize / resolution,
    /** A cell's hash for picking its diagonal (the same as ever on the lattice). */
    cellHash: (gx, gz, salt) => (step >= 2 ? hash2(gx / 2, gz / 2, seed + salt) : hash2(gx, gz, seed + salt + 1000)),
  };
}

/**
 * Works out the triangle mesh for one chunk, as plain arrays (so it can be
 * done in a worker and handed over):
 *   positions, normals, colors  the faces, three vertices each
 *   gridX, gridY, gridZ         the vertex grid
 *   fineCells, fineOffsets, fineTris  the refined cells' triangles
 *   triangles                   surface triangles, for the stats
 *
 * The grid is laid out on the *finest* LOD's vertex indices, so a coarse
 * chunk's vertices land exactly on a fine chunk's vertices (same jitter,
 * same height). Every triangle gets its own three vertices, which gives
 * each face one flat normal and one flat colour: the low-poly look.
 *
 * Positions are relative to the chunk's origin to keep float precision
 * good far from the world origin.
 */
export function computeChunkData(generator, config, cx, cz, resolution) {
  const { chunkSize, vertexJitter, skirtDepth, detailResolution } = config;
  const finest = config.lods[0].resolution;
  const step = finest / resolution; // fine-grid indices per cell at this LOD
  const fineCell = chunkSize / finest;
  const seed = generator.seed;
  // The lattice every level of detail shares (every other fine vertex, 4 m
  // apart): its vertices are jittered by up to a third of its cell. The
  // finest level's extra vertices sit between them, nudged a little.
  const latticeCell = fineCell * 2;
  const bigJitter = vertexJitter * latticeCell;
  const smallJitter = vertexJitter * fineCell * 0.45;
  const lattice = (li, lj) => [
    li * latticeCell + (hash2(li, lj, seed) - 0.5) * 2 * bigJitter,
    lj * latticeCell + (hash2(li, lj, seed ^ 0x9e3779b9) - 0.5) * 2 * bigJitter,
  ];
  /** Where fine-grid vertex (gx, gz) sits, relative to this chunk's corner. */
  function vertexAt(gx, gz) {
    let x, z;
    const ox = gx & 1, oz = gz & 1;
    if (!ox && !oz) {
      [x, z] = lattice(gx / 2, gz / 2);
    } else {
      // Between lattice vertices: their average, nudged.
      const i0 = (gx - ox) / 2, j0 = (gz - oz) / 2;
      x = 0;
      z = 0;
      const corners = [[i0, j0], [i0 + ox, j0], [i0, j0 + oz], [i0 + ox, j0 + oz]];
      for (const [i, j] of corners) {
        const [px, pz] = lattice(i, j);
        x += px / 4;
        z += pz / 4;
      }
      x += (hash2(gx, gz, seed + 0x51) - 0.5) * 2 * smallJitter;
      z += (hash2(gx, gz, seed + 0x52) - 0.5) * 2 * smallJitter;
    }
    return [x - originX, z - originZ];
  }
  /** A cell's hash for picking its diagonal (the same as ever on the lattice). */
  const cellHash = (gx, gz, salt) => (step >= 2 ? hash2(gx / 2, gz / 2, seed + salt) : hash2(gx, gz, seed + salt + 1000));

  const originX = cx * chunkSize;
  const originZ = cz * chunkSize;
  const baseGx = cx * finest;
  const baseGz = cz * finest;

  // 1. Vertex grid (shared positions; faces copy from here).
  const n = resolution + 1;
  const gridX = new Float32Array(n * n);
  const gridY = new Float32Array(n * n);
  const gridZ = new Float32Array(n * n);
  // (At coarse detail each point stands for the land round it: the
  // generator averages features smaller than that, like dunes, rather
  // than catching a crest here and a hollow there.)
  generator.footprint = chunkSize / resolution;
  try {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [lx, lz] = vertexAt(baseGx + i * step, baseGz + j * step);
        const k = j * n + i;
        gridX[k] = lx;
        gridZ[k] = lz;
        gridY[k] = generator.getHeight(originX + lx, originZ + lz);
      }
    }
  } finally {
    generator.footprint = 0;
  }

  // Cave entrances (full detail only): each entrance's pit is cut out of
  // the surface exactly. The pit is a strip of convex pieces; triangles
  // they overlap are clipped against them, so the hole's edge follows the
  // pit's winding outline cleanly (EntranceLayer builds the rock that lines
  // it). Worked out first because clipping adds triangles.
  const caveSystem = resolution >= detailResolution ? generator.caves : null;
  const holes = caveSystem
    ? caveSystem
        .mouthsNear(originX, originZ, originX + chunkSize, originZ + chunkSize)
        .filter(({ holeBounds: b }) => b.maxX > originX && b.minX < originX + chunkSize && b.maxZ > originZ && b.minZ < originZ + chunkSize)
    : [];
  // Pieces in chunk-local x/z, counter-clockwise, with their bounds.
  const outlines = holes.flatMap((e) =>
    e.holePieces.map((piece) => {
      const points = piece.map(([u, v]) => {
        const [x, z] = CaveField.world(e, u, v);
        return [x - originX, z - originZ];
      });
      const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
      return { points, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    }),
  );
  const clipped = new Map(); // (cell index * 2 + triangle) -> pieces left over: [[x, y, z] x3, ...]
  let clippedTris = 0;
  if (outlines.length) {
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const tris = cellTriangles(i, j);
        for (let t = 0; t < 6; t += 3) {
          const ids = [tris[t], tris[t + 1], tris[t + 2]];
          let pieces = [ids.map((k) => [gridX[k], gridY[k], gridZ[k]])];
          let touched = false;
          for (const outline of outlines) {
            if (Math.max(...ids.map((k) => gridX[k])) < outline.minX || Math.min(...ids.map((k) => gridX[k])) > outline.maxX) continue;
            if (Math.max(...ids.map((k) => gridZ[k])) < outline.minZ || Math.min(...ids.map((k) => gridZ[k])) > outline.maxZ) continue;
            const next = [];
            for (const piece of pieces) {
              const rest = subtractOutline(piece, outline.points);
              if (rest !== null) touched = true;
              next.push(...(rest ?? [piece]));
            }
            pieces = next;
          }
          if (!touched) continue;
          const out = [];
          for (const piece of pieces) for (let q = 1; q < piece.length - 1; q++) out.push([piece[0], piece[q], piece[q + 1]]);
          clipped.set((j * resolution + i) * 2 + t / 3, out);
          clippedTris += out.length;
        }
      }
    }
  }

  // Finer triangles along rivers and lake shores (full detail only), so
  // their trenches and banks can take shape: a cell there is split into
  // eight triangles around its centre (a 2 m mesh instead of 4 m). A cell
  // next to one is fanned around its centre too, taking in the midpoints
  // of the edges it shares with finer cells, so no cracks open between
  // them. Cells near a cave mouth are left alone (they may be clipped).
  // (At the finest level, 2 m, only steep canyon and mesa walls need it.)
  const coarse = chunkSize / resolution >= 4;
  const fine = resolution >= detailResolution ? refineCells() : null;
  let fineTris = 0;
  let splitEdges = 0;
  if (fine) {
    fineTris = fine.count;
    splitEdges = fine.borderSplits;
  }

  const surfaceTris = resolution * resolution * 2;
  const skirtTris = resolution * 4 * 2 + splitEdges * 2;
  const totalVerts = (surfaceTris + skirtTris + clippedTris + fineTris) * 3;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const colds = new Float32Array(totalVerts); // how cold the winter is here (for the snow)
  let v = 0; // float offset into the arrays

  // Per-grid-vertex sum of surface normals, so skirts can borrow the
  // shading of the ground right above them.
  const vertexNormals = new Float32Array(n * n * 3);

  // skirtNormal: light and colour the face like the ground above it, so the
  // sliver you see through an LOD crack blends right in.
  // colorAt: [x, y, z] to colour the face as if it were centred there (the
  // pieces of a clipped triangle all take the whole triangle's colour).
  function pushTri(ax, ay, az, bx, by, bz, qx, qy, qz, varSeedX, varSeedZ, skirtNormal = null, colorAt = null) {
    const isSkirt = skirtNormal !== null;
    if (isSkirt) {
      normal.copy(skirtNormal);
    } else {
      ab.set(bx - ax, by - ay, bz - az);
      ac.set(qx - ax, qy - ay, qz - az);
      normal.crossVectors(ab, ac).normalize();
    }

    const mx = colorAt ? colorAt[0] : (ax + bx + qx) / 3;
    const my = colorAt ? colorAt[1] : isSkirt ? Math.max(ay, by, qy) : (ay + by + qy) / 3;
    const mz = colorAt ? colorAt[2] : (az + bz + qz) / 3;
    const wx = originX + mx;
    const wz = originZ + mz;
    const jitter = generator.getColorJitter(wx, wz);
    generator.surfaceColor(wx, wz, my + jitter, normal.y, color, jitter);

    // Tiny per-face brightness shift so neighbouring faces read as facets.
    const shade = 0.93 + hash2(varSeedX, varSeedZ, seed ^ 0x51ed27) * 0.14;
    const cold = generator.getSeasonality(wx, wz);
    colds[v / 3] = colds[v / 3 + 1] = colds[v / 3 + 2] = cold;
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
    const flip = cellHash(baseGx + i * step, baseGz + j * step, 7) < 0.5;
    return flip ? [a, c, d, a, d, b] : [a, c, b, b, c, d];
  }
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const tris = cellTriangles(i, j);
      const gx = baseGx + i * step;
      const gz = baseGz + j * step;
      const finer = fine && fine.cells.get(j * resolution + i);
      if (finer) {
        const corners = [tris[0], tris[1], tris[2], tris[3], tris[4], tris[5]];
        for (let t = 0; t < finer.length; t += 9) {
          pushTri(finer[t], finer[t + 1], finer[t + 2], finer[t + 3], finer[t + 4], finer[t + 5], finer[t + 6], finer[t + 7], finer[t + 8], gx * 8 + t / 9, gz + 100003);
          for (const p of corners) {
            vertexNormals[p * 3] += normal.x / 3;
            vertexNormals[p * 3 + 1] += normal.y / 3;
            vertexNormals[p * 3 + 2] += normal.z / 3;
          }
        }
        continue;
      }
      for (let t = 0; t < 6; t += 3) {
        const p0 = tris[t], p1 = tris[t + 1], p2 = tris[t + 2];
        const pieces = clipped.get((j * resolution + i) * 2 + t / 3);
        if (pieces) {
          const centre = [
            (gridX[p0] + gridX[p1] + gridX[p2]) / 3,
            (gridY[p0] + gridY[p1] + gridY[p2]) / 3,
            (gridZ[p0] + gridZ[p1] + gridZ[p2]) / 3,
          ];
          for (const [a, b, c] of pieces) {
            pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], gx * 2 + t / 3, gz, null, centre);
          }
          if (!pieces.length) continue;
        } else {
          pushTri(gridX[p0], gridY[p0], gridZ[p0], gridX[p1], gridY[p1], gridZ[p1], gridX[p2], gridY[p2], gridZ[p2], gx * 2 + t / 3, gz);
        }
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
  // Skirts are shallower than the rock over any cave, and stop short of an
  // entrance ramp running underneath, so they never wall a cave off.
  const ramps = generator.caves ? generator.caves.mouthsNear(originX, originZ, originX + chunkSize, originZ + chunkSize) : [];
  const skirtBottom = (x, y, z, depth = skirtDepth) =>
    ramps.length ? generator.caves.skirtBottom(ramps, originX + x, y, originZ + z, depth) : y - depth;
  // The edge each skirt segment hangs from, as a key into the midpoints of split edges.
  const edgeKeys = [
    (t) => fine?.edgeKey(t, 0, 0),
    (t) => fine?.edgeKey(resolution, t, 1),
    (t) => fine?.edgeKey(resolution - t - 1, resolution, 0),
    (t) => fine?.edgeKey(0, resolution - t - 1, 1),
  ];
  for (let e = 0; e < 4; e++) {
    const edge = edges[e];
    // (Only as deep as the crack could be: a coarser neighbour's edge cuts
    // straight across a few of this one's points, so the gap is never more
    // than the land rises and falls over them. On flat ground, a sliver.)
    const ys = new Float32Array(resolution + 1);
    for (let t = 0; t <= resolution; t++) ys[t] = gridY[edge(t)];
    const depthAt = (t) => {
      let lo = Infinity, hi = -Infinity;
      for (let k = Math.max(0, t - 4); k <= Math.min(resolution, t + 5); k++) (lo = Math.min(lo, ys[k])), (hi = Math.max(hi, ys[k]));
      // (Plus a little for the bumps between the points of a coarse mesh.)
      return Math.min(skirtDepth, 0.3 + (hi - lo) * 1.1 + (chunkSize / resolution) * 0.06);
    };
    for (let t = 0; t < resolution; t++) {
      const depth = depthAt(t);
      const p = edge(t);
      const q = edge(t + 1);
      const mid = fine ? fine.mids.get(edgeKeys[e](t)) : undefined;
      skirtNormal
        .set(
          vertexNormals[p * 3] + vertexNormals[q * 3],
          vertexNormals[p * 3 + 1] + vertexNormals[q * 3 + 1],
          vertexNormals[p * 3 + 2] + vertexNormals[q * 3 + 2],
        )
        .normalize();
      if (skirtNormal.lengthSq() === 0) skirtNormal.set(0, 1, 0);
      const points = mid ? [[gridX[p], gridY[p], gridZ[p]], mid, [gridX[q], gridY[q], gridZ[q]]] : [[gridX[p], gridY[p], gridZ[p]], [gridX[q], gridY[q], gridZ[q]]];
      for (let k = 0; k < points.length - 1; k++) {
        const [px, py, pz] = points[k];
        const [qx, qy, qz] = points[k + 1];
        const pb = skirtBottom(px, py, pz, depth);
        const qb = skirtBottom(qx, qy, qz, depth);
        // Outward-facing (the edges above walk clockwise seen from above).
        pushTri(px, py, pz, qx, qy, qz, qx, qb, qz, p, q, skirtNormal);
        pushTri(px, py, pz, qx, qb, qz, px, pb, pz, q, p, skirtNormal);
      }
    }
  }

  // Which cells get finer triangles (see above), and those triangles.
  function refineCells() {
    const sea = config.seaLevel;
    const m = resolution + 2; // cells from -1 to resolution (a ring round the chunk, to match its neighbours)
    const ring = new Map();
    const corner = (i, j) => {
      if (i >= 0 && j >= 0 && i < n && j < n) {
        const k = j * n + i;
        return [gridX[k], gridY[k], gridZ[k]];
      }
      const key = (j + 1) * (n + 2) + (i + 1);
      let c = ring.get(key);
      if (!c) {
        const [lx, lz] = vertexAt(baseGx + i * step, baseGz + j * step);
        c = [lx, generator.getHeight(originX + lx, originZ + lz), lz];
        ring.set(key, c);
      }
      return c;
    };
    const mouths = generator.caves
      ? generator.caves.mouthsNear(originX - 16, originZ - 16, originX + chunkSize + 16, originZ + chunkSize + 16)
      : [];
    const want = new Uint8Array(m * m);
    // Is there canyon, mesa, Black Hills or sea-cliff country here at all?
    // (Checked on a coarse grid first, so the rest of the world doesn't pay for it.)
    let walled = false;
    for (let j = -1; j <= 5 && !walled; j++) {
      for (let i = -1; i <= 5 && !walled; i++) {
        const x = originX + (i / 4) * chunkSize, z = originZ + (j / 4) * chunkSize;
        const f = generator.getFeatures(x, z);
        const bw = generator.getBiomeWeights(x, z, {});
        walled = f.canyonZone > 0 || f.mesa > 0.02 || bw.blackHills > 0.05 || bw.badlands > 0.05 || generator.getSeaCliff(x, z) > 0.05;
      }
    }
    for (let j = -1; j <= resolution; j++) {
      for (let i = -1; i <= resolution; i++) {
        const cs = [corner(i, j), corner(i + 1, j), corner(i, j + 1), corner(i + 1, j + 1)];
        let lo = Infinity, hi = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const [x, y, z] of cs) {
          lo = Math.min(lo, y); hi = Math.max(hi, y);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        const cx = originX + (minX + maxX) / 2, cz = originZ + (minZ + maxZ) / 2;
        const shore = lo < sea + 3 && hi > sea - 2.5;
        const water = coarse && !shore ? generator.rivers.at(cx, cz, 7) : null;
        // (Along a great river, only its banks: the water's middle needs no finer faces.)
        let yes = coarse && (shore || (water !== null && (!water.big || water.d > water.half - 10)));
        // Steep walls of canyons, mesas, Black Hills rock and sea cliffs:
        // more, smaller faces, so a wall is never one great sheer triangle
        // and a spire never a single spike.
        if (!yes && walled && hi - lo > (coarse ? 5 : 3)) {
          const f = generator.getFeatures(cx, cz);
          yes = f.canyon > 0.1 || f.mesa > 0.1 || generator.getBiomeWeights(cx, cz, {}).blackHills > 0.2 || generator.getSeaCliff(cx, cz) > 0.1;
        }
        // (The badlands' ridges and knobs: finer faces wherever they rise at all.)
        if (!yes && walled && hi - lo > 1.5) yes = generator.getBiomeWeights(cx, cz, {}).badlands > 0.2;
        for (const e of mouths) {
          const b = e.holeBounds;
          if (yes && b.maxX > originX + minX - 8 && b.minX < originX + maxX + 8 && b.maxZ > originZ + minZ - 8 && b.minZ < originZ + maxZ + 8) yes = false;
        }
        want[(j + 1) * m + (i + 1)] = yes ? 1 : 0;
      }
    }
    const flag = (i, j) => want[(j + 1) * m + (i + 1)] === 1;
    const edgeKey = (i, j, vertical) => ((j + 1) * m + (i + 1)) * 2 + vertical;
    const mids = new Map();
    const mid = (a, b, key) => {
      let p = mids.get(key);
      if (!p) {
        const x = (a[0] + b[0]) / 2, z = (a[2] + b[2]) / 2;
        p = [x, generator.getHeight(originX + x, originZ + z), z];
        mids.set(key, p);
      }
      return p;
    };
    const cells = new Map();
    let count = 0, borderSplits = 0;
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const self = flag(i, j);
        const north = self || flag(i, j - 1), south = self || flag(i, j + 1);
        const west = self || flag(i - 1, j), east = self || flag(i + 1, j);
        if (!(north || south || west || east)) continue;
        const a = corner(i, j), b = corner(i + 1, j), c = corner(i, j + 1), d = corner(i + 1, j + 1);
        // Round the cell the same way its triangles wind (a, c, d, b).
        const poly = [a];
        if (west) poly.push(mid(a, c, edgeKey(i, j, 1)));
        poly.push(c);
        if (south) poly.push(mid(c, d, edgeKey(i, j + 1, 0)));
        poly.push(d);
        if (east) poly.push(mid(b, d, edgeKey(i + 1, j, 1)));
        poly.push(b);
        if (north) poly.push(mid(a, b, edgeKey(i, j, 0)));
        const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
        const centre = [cx, generator.getHeight(originX + cx, originZ + cz), cz];
        const tris = new Float32Array(poly.length * 9);
        for (let k = 0; k < poly.length; k++) tris.set([...centre, ...poly[k], ...poly[(k + 1) % poly.length]], k * 9);
        cells.set(j * resolution + i, tris);
        count += poly.length;
        if (j === 0 && north) borderSplits++;
        if (j === resolution - 1 && south) borderSplits++;
        if (i === 0 && west) borderSplits++;
        if (i === resolution - 1 && east) borderSplits++;
      }
    }
    return { cells, count, mids, edgeKey, borderSplits };
  }

  // The refined cells, flattened.
  const fineCells = new Int32Array(fine ? fine.cells.size : 0);
  const fineOffsets = new Int32Array(fineCells.length + 1);
  let fineLength = 0;
  if (fine) for (const tris of fine.cells.values()) fineLength += tris.length;
  const fineData = new Float32Array(fineLength);
  if (fine) {
    let c = 0, o = 0;
    for (const [cell, tris] of fine.cells) {
      fineCells[c] = cell;
      fineOffsets[c] = o;
      fineData.set(tris, o);
      o += tris.length;
      c++;
    }
    fineOffsets[c] = o;
  }

  return {
    // (Trimmed of any unused space: clipped pieces too thin to keep.)
    positions: v < positions.length ? positions.slice(0, v) : positions,
    normals: v < normals.length ? normals.slice(0, v) : normals,
    colors: v < colors.length ? colors.slice(0, v) : colors,
    colds: v < colors.length ? colds.slice(0, v / 3) : colds,
    gridX, gridY, gridZ,
    fineCells, fineOffsets, fineTris: fineData,
    triangles: surfaceTris + (fine ? fine.count - fine.cells.size * 2 : 0),
  };
}

/** The typed arrays in a chunk's data, to hand over from a worker without copying. */
export function chunkDataBuffers(data) {
  return [data.positions, data.normals, data.colors, data.colds, data.gridX, data.gridY, data.gridZ, data.fineCells, data.fineOffsets, data.fineTris].map((a) => a.buffer);
}

/**
 * Wraps a chunk's data (from computeChunkData) up as a geometry, and a
 * function giving the height of its actual triangle surface.
 */
export function chunkFromData(generator, config, cx, cz, resolution, data) {
  const { heights, groundHeightAt } = chunkSurface(generator, config, cx, cz, resolution, data);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  geometry.setAttribute('aCold', new BufferAttribute(data.colds, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, triangles: data.triangles, heights, groundHeightAt };
}

/**
 * A chunk's actual triangle surface, from its data: { heights (the vertex
 * grid), groundHeightAt(x, z, out) }.
 */
export function chunkSurface(generator, config, cx, cz, resolution, data) {
  const { chunkSize, detailResolution } = config;
  const { gridX, gridY, gridZ } = data;
  const { n, cellSize, step, baseGx, baseGz, cellHash } = chunkGrid(generator.seed, config, cx, cz, resolution);
  const originX = cx * chunkSize, originZ = cz * chunkSize;
  const fine = new Map();
  for (let c = 0; c < data.fineCells.length; c++) fine.set(data.fineCells[c], data.fineTris.subarray(data.fineOffsets[c], data.fineOffsets[c + 1]));
  const holes = resolution >= detailResolution && generator.caves
    ? generator.caves
        .mouthsNear(originX, originZ, originX + chunkSize, originZ + chunkSize)
        .filter(({ holeBounds: b }) => b.maxX > originX && b.minX < originX + chunkSize && b.maxZ > originZ && b.minZ < originZ + chunkSize)
    : [];
  function cellTriangles(i, j) {
    const a = j * n + i;
    const b = a + 1;
    const c = a + n;
    const d = c + 1;
    const flip = cellHash(baseGx + i * step, baseGz + j * step, 7) < 0.5;
    return flip ? [a, c, d, a, d, b] : [a, c, b, b, c, d];
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
        // Skip cells whose corners' bounding box (plus a hair) can't hold
        // the point: same answer as testing their triangles, much cheaper.
        const a = j * n + i;
        if (
          x < Math.min(gridX[a], gridX[a + n]) - 0.01 ||
          x > Math.max(gridX[a + 1], gridX[a + n + 1]) + 0.01 ||
          z < Math.min(gridZ[a], gridZ[a + 1]) - 0.01 ||
          z > Math.max(gridZ[a + n], gridZ[a + n + 1]) + 0.01
        ) continue;
        const finer = fine.get(j * resolution + i);
        if (finer) {
          for (let t = 0; t < finer.length; t += 9) {
            const y = onTriangle(x, z, finer[t], finer[t + 1], finer[t + 2], finer[t + 3], finer[t + 4], finer[t + 5], finer[t + 6], finer[t + 7], finer[t + 8], out);
            if (y !== null) return y;
          }
          continue;
        }
        const tris = cellTriangles(i, j);
        for (let t = 0; t < 6; t += 3) {
          const p0 = tris[t], p1 = tris[t + 1], p2 = tris[t + 2];
          const y = onTriangle(x, z, gridX[p0], gridY[p0], gridZ[p0], gridX[p1], gridY[p1], gridZ[p1], gridX[p2], gridY[p2], gridZ[p2], out);
          if (y !== null) {
            if (holes.length && holes.some((e) => CaveField.inHole(e, x + originX, z + originZ))) return NaN;
            return y;
          }
        }
      }
    }
    return null; // outside this chunk's surface
  }

  return {
    // Handy for decoration layers (trees, rocks...) that need heights.
    heights: { gridX, gridY, gridZ, size: n },
    groundHeightAt,
  };
}

// Height of the triangle (a, b, c) at (x, z), or null if (x, z) isn't on it.
function onTriangle(x, z, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const e1x = bx - ax, e1z = bz - az;
  const e2x = cx - ax, e2z = cz - az;
  const det = e1x * e2z - e2x * e1z;
  const px = x - ax, pz = z - az;
  const u = (px * e2z - e2x * pz) / det;
  const w = (e1x * pz - px * e1z) / det;
  if (!(u >= -1e-4 && w >= -1e-4 && u + w <= 1 + 1e-4)) return null;
  const e1y = by - ay;
  const e2y = cy - ay;
  if (out) {
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    out.normalY = Math.abs(ny) / Math.hypot(nx, ny, nz);
  }
  return ay + u * e1y + w * e2y;
}

/**
 * Keeps the part of a convex polygon (points [x, y, z], lying in one plane)
 * outside a convex outline ([x, z] points, counter-clockwise). Returns the
 * convex pieces left, or null if the polygon doesn't touch the outline.
 * Heights are interpolated along the polygon's edges, so the pieces stay
 * in its plane and meet the neighbouring triangles exactly.
 */
function subtractOutline(polygon, outline) {
  const sides = outline.map(([ax, az], i) => {
    const [bx, bz] = outline[(i + 1) % outline.length];
    return (p) => (bx - ax) * (p[2] - az) - (bz - az) * (p[0] - ax); // > 0 inside
  });
  // Wholly outside one edge: untouched.
  if (sides.some((side) => polygon.every((p) => side(p) <= 1e-6))) return null;
  const pieces = [];
  let rest = polygon;
  for (const side of sides) {
    const outside = clipPolygon(rest, (p) => -side(p));
    if (outside.length >= 3 && polygonArea(outside) > 1e-4) pieces.push(outside);
    rest = clipPolygon(rest, side);
    if (rest.length < 3) break;
  }
  return pieces; // what's left in `rest` is inside the outline: dropped
}

/** Sutherland-Hodgman: the part of a convex polygon where f(p) >= 0. */
function clipPolygon(points, f) {
  const out = [];
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    const q = points[(k + 1) % points.length];
    const fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return out;
}

/** Area of a polygon's footprint (x/z). */
function polygonArea(points) {
  let a = 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[k], q = points[(k + 1) % points.length];
    a += p[0] * q[2] - q[0] * p[2];
  }
  return Math.abs(a) / 2;
}
