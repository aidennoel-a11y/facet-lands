import { hash2 } from '../noise/random.js';

/**
 * The temperate rainforest's great fallen trunks that came down across a
 * boulder: each lies with its top end up on the rock and its foot on the
 * ground twenty-odd metres off, so there's room to walk in under it by the
 * rock. Worked out alike for the rock (see rockCandidates, which puts the
 * boulder there) and the log (see placeLogs). Pure, for the workers too.
 *
 * For chunk (cx, cz): [{ bx, bz (the boulder, world), sx, sy, sz, ry,
 * ux, uz (the log's top end), lx, lz (its foot), r (its radius) }].
 */
export function leanSites(generator, config, cx, cz) {
  const size = config.chunkSize, x0 = cx * size, z0 = cz * size;
  const G = 32, n = Math.round(size / G), seed = generator.seed ^ 0x1ea7;
  const out = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gi = cx * n + i, gj = cz * n + j;
    if (hash2(gi, gj, seed) > 0.32) continue;
    const bx = x0 + (i + 0.3 + 0.4 * hash2(gi, gj, seed + 1)) * G, bz = z0 + (j + 0.3 + 0.4 * hash2(gi, gj, seed + 2)) * G;
    const w = generator.getBiomeWeights(bx, bz, {});
    if ((w.rainforest ?? 0) < 0.55) continue;
    const s = hash2(gi, gj, seed + 3);
    const sx = 3.8 + 1.4 * s, sy = 4.6 + 1.4 * hash2(gi, gj, seed + 4), sz = 3.8 + 1.4 * hash2(gi, gj, seed + 5);
    const t = hash2(gi, gj, seed + 6) * Math.PI * 2, dx = Math.cos(t), dz = Math.sin(t);
    const len = 20 + 8 * hash2(gi, gj, seed + 7), r = 0.85 + 0.35 * hash2(gi, gj, seed + 8);
    // (Its top end just past the rock's middle, over its crown; its foot out on the ground.)
    const ux = bx - dx * 1.2, uz = bz - dz * 1.2, lx = ux + dx * len, lz = uz + dz * len;
    const inside = (x, z) => x > x0 + 2 && z > z0 + 2 && x < x0 + size - 2 && z < z0 + size - 2;
    if (!inside(bx - dx * sx, bz - dz * sz) || !inside(lx, lz)) continue;
    const hb = generator.getHeight(bx, bz), hl = generator.getHeight(lx, lz);
    if (!(hb > config.seaLevel + 1.5) || !(hl > config.seaLevel + 1.5) || Math.abs(hb - hl) > 7) continue;
    if (generator.rivers.at(bx, bz, sx + 2) || generator.rivers.at(lx, lz, 2) || generator.rivers.at((bx + lx) / 2, (bz + lz) / 2, 2)) continue;
    if (generator.caves?.field?.nearEntrance?.(bx, bz, sx + 4)) continue;
    if (generator.greatBoulderAt?.(bx, bz) || generator.greatBoulderAt?.(lx, lz) || generator.greatBoulderAt?.((bx + lx) / 2, (bz + lz) / 2)) continue;
    out.push({ bx, bz, sx, sy, sz, ry: hash2(gi, gj, seed + 9) * Math.PI * 2, ux, uz, lx, lz, r, len });
  }
  return out;
}
