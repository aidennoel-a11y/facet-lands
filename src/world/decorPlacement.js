import { hash2 } from '../noise/random.js';

// Where the small things go on a chunk (wildflowers in the meadows, corals
// on the reefs, the surf bursting on the rocks): worked out by the chunk
// workers (see chunkWorker), so the main thread only has to put the
// pieces together. Each is a plain list; the layers draw them (see
// FlowerLayer, CoralLayer, SeaCoastLayer).

/**
 * The wildflowers in a chunk's meadows (see TerrainGenerator.getMeadow):
 * [x, y, z (chunk-local), size, turn (0..1), colour index, slope x, slope z] for
 * each, flat in a Float32Array; null if there are none.
 */
export function placeFlowers(generator, config, cx, cz, groundHeightAt, colours = 7) {
  if (!generator.getMeadow) return null;
  const size = config.chunkSize, sea = config.seaLevel;
  const x0 = cx * size, z0 = cz * size;
  // (A quick look first: any meadow here at all?)
  let any = 0;
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) any = Math.max(any, generator.getMeadow(x0 + (i * size) / 4, z0 + (j * size) / 4));
  if (any < 0.05) return null;
  const G = 1.0, n = Math.round(size / G), seed = generator.seed ^ 0xf10e;
  const surface = { normalY: 1 };
  const list = [];
  let cell = -1, meadow = 0, stream = false;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = cx * n + i, gj = cz * n + j;
      const keep = hash2(gi, gj, seed);
      if (keep > 0.7) continue;
      const lx = (i + hash2(gi, gj, seed + 1)) * G, lz = (j + hash2(gi, gj, seed + 2)) * G;
      // (The meadow looked up once per 8 m patch.)
      const c = Math.floor(lx / 8) * 64 + Math.floor(lz / 8);
      if (c !== cell) {
        cell = c;
        meadow = generator.getMeadow(x0 + Math.floor(lx / 8) * 8 + 4, z0 + Math.floor(lz / 8) * 8 + 4);
        // (And whether a stream's anywhere near the patch: then each
        // flower is checked against it.)
        stream = meadow > 0.05 && !!generator.rivers?.at(x0 + Math.floor(lx / 8) * 8 + 4, z0 + Math.floor(lz / 8) * 8 + 4, 8);
      }
      if (keep > 0.7 * meadow) continue;
      const y = groundHeightAt(lx, lz, surface);
      if (!(y > sea + 1.5) || surface.normalY < 0.85 || y > 150) continue;
      if (stream && generator.rivers.at(x0 + lx, z0 + lz, 1.5)) continue; // (not in a stream, nor right on its bank)
      if (generator.onLiveLava?.(x0 + lx, z0 + lz)) continue; // (nor on a lava flow)
      if (generator.landmarks?.underWater(x0 + lx, z0 + lz, y)) continue; // (nor under a landmark's water)
      // A few colours to a patch.
      const tone = generator.meadowNoise.noise2D((x0 + lx) * 0.03, (z0 + lz) * 0.03) * 0.5 + 0.5;
      const pick = Math.floor((tone * 3 + hash2(gi, gj, seed + 3) * 1.6) % colours);
      list.push(lx, y, lz, 0.7 + 0.7 * hash2(gi, gj, seed + 4), hash2(gi, gj, seed + 5), pick, surface.normalX ?? 0, surface.normalZ ?? 0);
    }
  }
  return list.length ? new Float32Array(list) : null;
}

/**
 * The corals on a chunk's reef (see TerrainGenerator.getReef):
 * [kind, x, y, z (chunk-local), turn (0..1), size, stretch, colour index]
 * for each, flat in a Float32Array; null if there are none. (`kinds`,
 * `colours`: how many of each the layer has.)
 */
export function placeCorals(generator, config, cx, cz, groundHeightAt, gridY, kinds = 4, colours = 7) {
  const size = config.chunkSize, sea = config.seaLevel;
  let low = Infinity;
  for (const y of gridY) low = Math.min(low, y);
  if (low > sea - 0.6) return null; // no sea here
  const x0 = cx * size, z0 = cz * size;
  const seed = generator.seed ^ 0xc0a2;
  const spacing = 1.8;
  const cells = Math.round(size / spacing);
  const step = size / cells;
  const list = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gi = cx * cells + i, gj = cz * cells + j;
      if (hash2(gi, gj, seed) > 0.55) continue;
      const wx = x0 + (i + hash2(gi, gj, seed + 1)) * step, wz = z0 + (j + hash2(gi, gj, seed + 2)) * step;
      const ground = groundHeightAt(wx - x0, wz - z0);
      if (!Number.isFinite(ground)) continue;
      const reef = generator.getReef(wx, wz, ground);
      if (hash2(gi, gj, seed + 3) > reef) continue;
      // (Not in the sand channels between the coral heads: see TerrainGenerator.surfaceColor.)
      if (generator.coastNoise && 1 - Math.abs(generator.coastNoise.noise2D(wx * 0.04 + 9, wz * 0.012 - 4)) > 0.82) continue;
      const kind = Math.floor(hash2(gi, gj, seed + 4) * kinds);
      const s = 0.7 + hash2(gi, gj, seed + 5) * 1.1;
      list.push(kind, wx - x0, ground - 0.05, wz - z0, hash2(gi, gj, seed + 6), s, 0.8 + 0.5 * hash2(gi, gj, seed + 7), Math.floor(hash2(gi, gj, seed + 8) * colours));
    }
  }
  return list.length ? new Float32Array(list) : null;
}

/**
 * Where the waves meet rock in a chunk: the foot of the cliffs, the edges
 * of the ledges; each with the way out to sea and how much of a cliff
 * there is: [{ x, z, out: [x, z], rock }].
 */
export function surfSpots(generator, x0, z0, size, sea) {
  const spots = [];
  const S = 6;
  for (let j = 0; j < size / S; j++) {
    for (let i = 0; i < size / S; i++) {
      const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S;
      const h = generator.getBaseHeight(x, z);
      if (h < sea - 0.4 || h > sea + 3.5) continue;
      let out = null;
      for (let k = 0; k < 8 && !out; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (generator.getBaseHeight(x + Math.cos(a) * 5, z + Math.sin(a) * 5) < sea - 1) out = [Math.cos(a), Math.sin(a)];
      }
      if (!out || generator.getOceanness(x, z) < 0.5) continue;
      const rock = Math.max(generator.getSeaCliff(x, z), 0.3);
      if (hash2(Math.floor(x), Math.floor(z), 0x5a1f) > 0.35 + 0.5 * rock) continue;
      // How open to the sea it is: of a ring of ways out across the water,
      // how many run on four hundred metres without meeting land. (A cove
      // or an inlet shut in by the land all round lies still: no swell
      // reaches it to break, but in a storm.)
      let open = 0;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
        let clear = 0;
        for (let d = 40; d <= 400; d += 40) {
          if (generator.getBaseHeight(x + cx * d, z + cz * d) > sea - 0.2) break;
          clear = d;
        }
        open += clear >= 400 ? 1 : clear / 800;
      }
      spots.push({ x, z, out, rock, open: open / 12 });
    }
  }
  return spots;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The fallen logs and old stumps on a chunk's woodland floor: { pieces, solid }.
 * `pieces`: [kind (0 a log, 1 a stump), x, y, z (chunk-local), turn,
 * tilt, scale x, y, z] for each, flat; `solid` as LogLayer keeps them, to
 * be walked on. Null if there are none.
 */
export function placeLogs(generator, config, cx, cz, groundHeightAt) {
  const size = config.chunkSize, sea = config.seaLevel;
  const x0 = cx * size, z0 = cz * size;
  const G = 9, n = Math.round(size / G), seed = generator.seed ^ 0x106;
  const pieces = [], solid = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = cx * n + i, gj = cz * n + j;
      const keep = hash2(gi, gj, seed);
      if (keep > 0.2) continue;
      const lx = (i + 0.15 + 0.7 * hash2(gi, gj, seed + 1)) * G, lz = (j + 0.15 + 0.7 * hash2(gi, gj, seed + 2)) * G;
      const wx = x0 + lx, wz = z0 + lz;
      const w = generator.getBiomeWeights(wx, wz, {});
      const woods = w.temperate * generator.getForestDensity(wx, wz) * (1 - 0.8 * smoothstep(0.1, 0.45, generator.getPlainness(wx, wz))) + w.blackHills * 0.6 + w.jungle * 0.9 + w.wetland * 0.3 + w.pine * 0.8;
      if (keep > 0.2 * smoothstep(0.35, 0.7, woods)) continue;
      const y = groundHeightAt(lx, lz);
      if (!(y > sea + 1.2) || y > 150) continue;
      if (generator.rivers.at(wx, wz, 2)) continue;
      if (generator.caves.field.nearEntrance(wx, wz, 3)) continue;
      // Never on a cliff or a steep slope (judged from the land itself,
      // not this mesh, which far off smooths a cliff into a bank).
      const gap = 1.5;
      const gx = generator.getHeight(wx + gap, wz) - generator.getHeight(wx - gap, wz), gz = generator.getHeight(wx, wz + gap) - generator.getHeight(wx, wz - gap);
      if (Math.hypot(gx, gz) / (2 * gap) > 0.45) continue;
      const isStump = hash2(gi, gj, seed + 3) < 0.4;
      const a = hash2(gi, gj, seed + 4) * Math.PI * 2;
      if (isStump) {
        const r = 0.35 + 0.25 * hash2(gi, gj, seed + 5);
        const sy = (0.6 + 0.8 * hash2(gi, gj, seed + 7)) * r / 0.5;
        pieces.push(1, lx, y - 0.1, lz, a, 0, r / 0.5, sy, r / 0.5);
        solid.push(1, wx, y - 0.1 + 0.8 * sy, wz, 0, r, 0, 0);
        continue;
      }
      // A log lies along the ground, following its slope.
      const len = 3 + 4.5 * hash2(gi, gj, seed + 5), r = 0.22 + 0.2 * hash2(gi, gj, seed + 6);
      const ca = Math.cos(a), sa = Math.sin(a);
      const ex = lx + ca * len * 0.5, ez = lz - sa * len * 0.5, bx = lx - ca * len * 0.5, bz = lz + sa * len * 0.5;
      const inside = (x, z) => x >= 0 && z >= 0 && x < size && z < size;
      if (!inside(ex, ez) || !inside(bx, bz)) continue;
      const ya = groundHeightAt(ex, ez), yb = groundHeightAt(bx, bz);
      if (!(ya > sea + 1) || !(yb > sea + 1) || Math.abs(ya - yb) > len * 0.45) continue;
      const mid = Math.min(y, (ya + yb) / 2);
      pieces.push(0, lx, mid - r * 0.35, lz, a, Math.atan2(ya - yb, len), len, r * 2, r * 2);
      solid.push(0, wx, mid - r * 0.35, wz, len, r, a, (ya - yb) / len);
    }
  }
  return pieces.length ? { pieces: new Float32Array(pieces), solid } : null;
}

/**
 * The plants of the forest floor (the jungle's, ferns under the pines), on
 * the chunks right round you: [kind, x, y, z (chunk-local), size, turn
 * (0..1), colour pick (0..1)] for each, flat; null if there are none.
 */
export function placeUnderstory(generator, config, cx, cz, groundHeightAt) {
  const size = config.chunkSize, sea = config.seaLevel;
  const x0 = cx * size, z0 = cz * size;
  // (A quick look first: any of the forests that have an understory?)
  const cover = (x, z) => {
    const w = generator.getBiomeWeights(x, z, {});
    return [w.jungle, w.pine * 0.12, (w.cascades ?? 0) * 0.55];
  };
  let any = 0;
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) any = Math.max(any, ...cover(x0 + (i * size) / 4, z0 + (j * size) / 4));
  if (any < 0.02) return null;
  const G = 2.2, n = Math.round(size / G), seed = generator.seed ^ 0x0d57;
  const surface = { normalY: 1 };
  const list = [];
  let cell = -1, here = [0, 0, 0];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = cx * n + i, gj = cz * n + j;
      const keep = hash2(gi, gj, seed);
      if (keep > 0.95) continue;
      const lx = (i + hash2(gi, gj, seed + 1)) * G, lz = (j + hash2(gi, gj, seed + 2)) * G;
      // (The forests looked up once per 8 m patch.)
      const c = Math.floor(lx / 8) * 64 + Math.floor(lz / 8);
      if (c !== cell) {
        cell = c;
        here = cover(x0 + Math.floor(lx / 8) * 8 + 4, z0 + Math.floor(lz / 8) * 8 + 4);
      }
      const r = hash2(gi, gj, seed + 3);
      // Jungle: all three kinds; elsewhere, ferns.
      // (The jungle floor crowded with plants: hardly a bare patch.)
      // (The Cascades: lush, ferns everywhere and small leafy plants among them.)
      const jungle = here[0] * 0.92, ferns = here[1];
      // (Thickest of all along the water: ferns crowding the banks.)
      let lush = here[2];
      if (lush > 0.02) {
        const sh = generator.rivers?.shoreAt(x0 + lx, z0 + lz, 7);
        if (sh && sh.e > 0) lush = Math.min(0.92, lush + 0.6 * (1 - sh.e / 7));
      }
      if (keep > Math.max(jungle, ferns * 0.6, lush)) continue;
      const kind = keep < jungle ? Math.floor(r * 3) : keep < lush && r < (lush > here[2] + 0.1 ? 0.12 : 0.3) ? 1 : 2;
      const y = groundHeightAt(lx, lz, surface);
      if (!(y > sea + 1) || surface.normalY < 0.7) continue;
      if (generator.rivers?.at(x0 + lx, z0 + lz, 1)) continue;
      if (generator.landmarks?.underWater(x0 + lx, z0 + lz, y)) continue;
      const small = keep >= jungle && kind === 1 ? 0.5 : 1; // (the Cascades' leafy plants knee-high)
      list.push(kind, lx, y - 0.05, lz, (0.8 + 0.8 * hash2(gi, gj, seed + 4)) * small, hash2(gi, gj, seed + 5), hash2(gi, gj, seed + 6));
    }
  }
  return list.length ? new Float32Array(list) : null;
}
