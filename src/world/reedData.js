import { Matrix4, Quaternion, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';

// Where the reeds stand in a chunk (see ReedLayer), worked out as plain
// arrays so a chunk's worker can do it.

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);


function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/**
 * The reeds of chunk (cx, cz): { matrices (16 floats each, chunk-local),
 * shades, kinds (0 cattails, 1 rushes, 2 sedge: see ReedLayer) }, or null
 * if there are none.
 */
export function reedData(generator, config, cx, cz, groundHeightAt, heights) {
  const size = config.chunkSize;
  const x0 = cx * size, z0 = cz * size;
  const sea = config.seaLevel;
  let low = Infinity;
  for (const y of heights.gridY) low = Math.min(low, y);
  const shoreline = low < sea + 0.5; // a lake or sea edge runs through
  if (!shoreline && !generator.rivers.inBox(x0, z0, x0 + size, z0 + size).length && !generator.landmarks?.fallsInBox(x0, z0, x0 + size, z0 + size)) return null;
  const seed = generator.seed ^ 0x2f1b3c77;
  const spacing = 1.6;
  const cells = Math.round(size / spacing);
  const step = size / cells;
  const matrices = [];
  const shades = [];
  const kinds = [];
  // How hard the winter is where each clump stands (they die back, and the
  // water freezes over those standing in it), and whether it stands in the
  // water: [cold, wet] a clump. (Cold on a 24 m grid, remembered.)
  const climate = [], colds = new Map();
  const coldAt = (wx, wz) => {
    const key = Math.floor(wx / 24) * 65536 + Math.floor(wz / 24);
    let v = colds.get(key);
    if (v === undefined) colds.set(key, (v = smoothstep(0.45, 0.75, generator.getSeasonality(Math.floor(wx / 24) * 24 + 12, Math.floor(wz / 24) * 24 + 12))));
    return v;
  };
  // (Which kind of clump: mostly rushes and sedge, cattails here and there.)
  const kindOf = (gi, gj, low) => {
    const r = hash2(gi, gj, seed + 8);
    return low ? (r < 0.75 ? 2 : 1) : r < 0.22 ? 0 : r < 0.6 ? 1 : 2;
  };
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gi = cx * cells + i, gj = cz * cells + j;
      const lx = (i + hash2(gi, gj, seed + 1)) * step;
      const lz = (j + hash2(gi, gj, seed + 2)) * step;
      const wx = x0 + lx, wz = z0 + lz;
      const river = generator.rivers.at(wx, wz, 2.2);
      if (!river) {
        // Lake edges: in patches along the muddy water line (not the sea).
        if (!shoreline) continue;
        const ground = groundHeightAt(lx, lz);
        // In wetlands reeds crowd the pools and channels, out into the
        // shallows and up over the wet ground.
        if (!(ground > sea - 1.6 && ground < sea + 1.3)) continue;
        const w = generator.getBiomeWeights(wx, wz, {});
        // (And the mangroves' salt shallows: sea grass, rushes and weeds
        // all through the water among the roots.)
        const marsh = Math.max(w.wetland, w.mangrove);
        if (!(ground > sea - 0.7 - 0.9 * marsh && ground < sea + 0.45 + 0.8 * marsh)) continue;
        const shore = generator.getShore(wx, wz, ground);
        if (!shore || (shore.ocean && w.mangrove < 0.4)) continue;
        const patch = 0.5 + 0.5 * Math.sin(wx * 0.07 + Math.sin(wz * 0.05) * 3);
        if (hash2(gi, gj, seed) > patch * (0.8 + 0.5 * marsh) - 0.15 + 0.35 * marsh) continue;
        // (Some low: weeds and grass just out of the water, not all tall reeds.)
        const weed = w.mangrove > 0.4 && ground > sea - 0.5 && hash2(gi, gj, seed + 7) < 0.5;
        const s = (weed ? 0.4 + hash2(gi, gj, seed + 3) * 0.3 : 0.8 + hash2(gi, gj, seed + 3) * 0.55);
        position.set(lx, ground - 0.1, lz);
        rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 4) * Math.PI * 2);
        scale.set(s, s * (0.85 + hash2(gi, gj, seed + 5) * 0.4), s);
        matrices.push(matrix.compose(position, rotation, scale).clone());
        shades.push(0.85 + hash2(gi, gj, seed + 6) * 0.3);
        kinds.push(kindOf(gi, gj, weed));
        climate.push(coldAt(wx, wz) * (1 - generator.getOceanness(wx, wz)), ground < sea - 0.05 ? 1 : 0);
        continue;
      }
      if (river.stream && generator.getMountainness(wx, wz) > 0.3) continue; // mountain streams: gravel, no reeds
      const e = river.d - river.water; // from the water's edge: negative in the water
      if (e < -Math.min(1.2, river.water * 0.6)) continue;
      // In patches, thickest right at the edge.
      const patch = 0.5 + 0.5 * Math.sin(wx * 0.09 + Math.sin(wz * 0.07) * 3);
      // (Round the Cascades' pools and ponds: thicker, in more of the bank.)
      const lush = river.falls ? 1 : 0;
      if (hash2(gi, gj, seed) > Math.min(1, patch * (1 + 0.6 * lush) + 0.25 * lush) * (1 - Math.abs(e + 0.2) / (2.4 + 0.8 * lush))) continue;
      const ground = groundHeightAt(lx, lz);
      if (!Number.isFinite(ground)) continue;
      const s = 0.75 + hash2(gi, gj, seed + 3) * 0.5;
      position.set(lx, Math.min(ground, river.level + 0.1) - 0.1, lz);
      rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 4) * Math.PI * 2);
      scale.set(s, s * (0.85 + hash2(gi, gj, seed + 5) * 0.4), s);
      matrices.push(matrix.compose(position, rotation, scale).clone());
      shades.push(0.85 + hash2(gi, gj, seed + 6) * 0.3);
      kinds.push(kindOf(gi, gj, false));
      climate.push(coldAt(wx, wz), e < 0 && ground < river.level - 0.05 ? 1 : 0);
    }
  }
  if (!matrices.length) return null;
  const out = new Float32Array(matrices.length * 16);
  matrices.forEach((m, k) => m.toArray(out, k * 16));
  return { matrices: out, shades: new Float32Array(shades), kinds: new Uint8Array(kinds), climate: new Float32Array(climate) };
}
