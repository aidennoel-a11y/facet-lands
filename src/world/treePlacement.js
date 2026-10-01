import { hash2 } from '../noise/random.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Where the trees in a chunk stand, and what they are.
 *
 * Candidate spots sit on a jittered world grid (`treeSpacing` apart), so a
 * given tree is always in the same place whichever LOD builds its chunk
 * (near trees and far ones alike). Each spot is kept or skipped by the
 * forest-density noise, then checked for water, slope and altitude, and
 * finally given a species from its biome's `trees` list.
 *
 * @param groundHeightAt  (lx, lz) => the chunk's surface height (chunk-local)
 * @param boulders        [x, z, radius, ...] (world) where no tree may grow, or null
 * @returns species -> [{ x, y, z (chunk-local), s, sy, rot, shade, leanX, leanZ }]
 * Pure (no three.js), so a worker can do it too.
 */
export function placeTrees(generator, config, cx, cz, groundHeightAt, boulders = null) {
  const { chunkSize, treeSpacing, seaLevel, treeScale } = config;
  const cells = Math.round(chunkSize / treeSpacing);
  const spacing = chunkSize / cells;
  const originX = cx * chunkSize;
  const originZ = cz * chunkSize;
  const seed = generator.seed ^ 0x7f4a7c15;

  const placed = {}; // species -> [{x, y, z, s, sy, rot, shade}]
  // Boulders nearby, binned by cell: no tree grows out of a rock.
  const blocked = new Map();
  if (boulders) {
    const list = boulders;
    for (let k = 0; k < list.length; k += 3) {
      const i = Math.floor((list[k] - originX) / spacing), j = Math.floor((list[k + 1] - originZ) / spacing);
      const key = `${i},${j}`;
      if (!blocked.has(key)) blocked.set(key, []);
      blocked.get(key).push(list[k], list[k + 1], list[k + 2]);
    }
  }
  const onRock = (wx, wz, i, j) => {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const list = blocked.get(`${i + di},${j + dj}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 3) if (Math.hypot(wx - list[k], wz - list[k + 1]) < list[k + 2] + 0.6) return true;
      }
    }
    return false;
  };
  // Where the tree spot in grid cell (gi, gj) is, and how big its tree would be.
  const spot = (gi, gj) => ({
    x: (gi + 0.1 + 0.8 * hash2(gi, gj, seed + 1)) * spacing,
    z: (gj + 0.1 + 0.8 * hash2(gi, gj, seed + 2)) * spacing,
    s: (0.75 + hash2(gi, gj, seed + 5) * 0.6) * treeScale,
  });
  // Trees don't grow into each other: of two spots too close together,
  // only the one ranking higher (a fixed coin toss per spot, so
  // neighbouring chunks agree) can hold a tree, if it's likely to.
  const crowded = (gi, gj, likely) => {
    const me = spot(gi, gj);
    const rank = hash2(gi, gj, seed + 14);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = gi + di, nj = gj + dj;
        if (hash2(ni, nj, seed + 14) < rank) continue; // it gives way to us
        if (hash2(ni, nj, seed) > likely) continue; // it wouldn't be a tree anyway
        const other = spot(ni, nj);
        if (Math.hypot(other.x - me.x, other.z - me.z) < 1.7 * (me.s + other.s) * 0.5) return true;
      }
    }
    return false;
  };
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gi = cx * cells + i;
      const gj = cz * cells + j;
      const keep = hash2(gi, gj, seed);
      const lx = (i + 0.1 + 0.8 * hash2(gi, gj, seed + 1)) * spacing;
      const lz = (j + 0.1 + 0.8 * hash2(gi, gj, seed + 2)) * spacing;
      const wx = originX + lx;
      const wz = originZ + lz;

      // Near a biome border, each spot takes one biome or the other at random.
      const biome = generator.pickBiome(wx, wz, hash2(gi, gj, seed + 11));
      const trees = biome.trees;
      let likely = (trees ? (trees.clumped ? generator.getForestDensity(wx, wz) : 1) * trees.density * (config.treeDensity ?? 1) : 0);
      // The parkland's birches and aspens stand in thick groves, with open
      // grassland between them (only the odd lone tree out there).
      if (biome.id === 'parkland') likely = (0.015 + 0.6 * generator.getParklandGrove(wx, wz)) * (config.treeDensity ?? 1);
      // Round an alpine lake below the snow, a ring of trees.
      const lake = trees && biome.id === 'temperate' ? generator.rivers.at(wx, wz, 30) : null;
      const lakeside = !!(lake && lake.alpine && lake.level < 170);
      if (lakeside) likely = Math.max(likely, 0.6);
      // Palms round an oasis.
      const oasis = biome.id === 'desert' && generator.oasisAt ? generator.oasisAt(wx, wz) : 0;
      if (oasis > 0.2) likely = Math.max(likely, 0.45 * oasis);
      if (!trees || keep > likely) continue;
      if (biome.id === 'desert' && oasis <= 0.2 && generator.getFeatures(wx, wz).erg > 0.3) continue; // nothing grows in a dune sea
      if (biome.id === 'volcanic' && hash2(gi, gj, seed + 15) < 0.92 * generator.getVolcanic(wx, wz).cone) continue; // cinder cones are nearly bare
      if (biome.id === 'volcanic' && generator.onSinter(wx, wz)) continue; // nor on a hot spring's crust
      if (biome.id === 'blackHills' && generator.getFormation(wx, wz) > 3) continue; // nor up on the granite spires and domes
      // Open plains are treeless: grass as far as you can see.
      if (biome.id === 'temperate' && hash2(gi, gj, seed + 16) < smoothstep(0.1, 0.45, generator.getPlainness(wx, wz))) continue;
      if (crowded(gi, gj, likely)) continue;
      if (onRock(wx, wz, i, j)) continue;

      const ground = groundHeightAt(lx, lz);
      // (In a wetland trees grow down to the water, and dead ones stand
      // drowned in the shallows.)
      const marsh = biome.id === 'wetland' || biome.id === 'mangrove';
      if (!(ground >= seaLevel + (marsh ? -0.8 : 1.2))) continue; // outside the chunk, in water or over a cave mouth
      if (generator.caves.field.nearEntrance(wx, wz, 3)) continue; // keep cave entrances clear
      if (generator.rivers.at(wx, wz, 1.5)) continue; // nor in a river or right on its bank
      // How high and how steep, from the land itself rather than this level
      // of detail's mesh (far off, its big triangles can pass metres above
      // or below the ground on a mountainside), so trees don't come and go
      // as you approach.
      const hx0 = generator.getHeight(wx - 2, wz), hx1 = generator.getHeight(wx + 2, wz);
      const hz0 = generator.getHeight(wx, wz - 2), hz1 = generator.getHeight(wx, wz + 2);
      const land = (hx0 + hx1 + hz0 + hz1) / 4;
      // Nothing but cacti grows on sand (beaches included).
      const colourHeight = land + generator.getColorJitter(wx, wz);
      if (biome.id !== 'desert' && !marsh && colourHeight < 7) continue;
      // Nor on bare rock: the grey band up the mountains, and faces
      // steep enough to show rock (the same test the ground's colour
      // uses). Steep slopes that are still green keep their trees.
      const gradX = (hx1 - hx0) / 4;
      const gradZ = (hz1 - hz0) / 4;
      const upness = 1 / Math.sqrt(1 + gradX * gradX + gradZ * gradZ);
      const r = hash2(gi, gj, seed + 12);
      const cliff = 1 - smoothstep(0.5, 0.72, upness);
      // (The Smoky Mountains are wooded right over their tops: no bare
      // rock band and no tree line there, only thinner woods up high, half
      // as thick on the highest tops.)
      const smoky = biome.id === 'smoky';
      if (r < Math.max(cliff, lakeside || smoky ? 0 : smoothstep(128, 146, colourHeight))) continue;
      // And ever fewer the higher you go (the tree line).
      if (!lakeside && hash2(gi, gj, seed + 13) < (smoky ? 0.5 * smoothstep(120, 200, land) : smoothstep(85, 150, land) * 0.9)) continue;

      // Too steep for roots? (height change per metre)
      if (Math.abs(gradX) + Math.abs(gradZ) > 1.5) continue;

      // Pick a species that is happy at this height (edges blurred a bit).
      // In a birch wood (or aspen stand) the `grove` species take over.
      const h = land + (hash2(gi, gj, seed + 3) - 0.5) * 16;
      const grove = trees.species.some((s) => s.grove) ? generator.getGrove(wx, wz) : 0;
      const weight = (s) => s.weight * (s.grove ? 1 + 14 * grove : 1 - 0.85 * grove);
      let total = 0;
      for (const s of trees.species) if (h >= s.minHeight && h <= s.maxHeight) total += weight(s);
      if (total === 0) continue;
      let pick = hash2(gi, gj, seed + 4) * total;
      let species = null;
      for (const s of trees.species) {
        if (h < s.minHeight || h > s.maxHeight) continue;
        pick -= weight(s);
        if (pick <= 0) {
          species = s;
          break;
        }
      }
      species ??= trees.species[trees.species.length - 1];
      if (oasis > 0.2) species = { type: hash2(gi, gj, seed + 17) < 0.8 ? 'junglePalm' : 'dryBush' };
      // Thickets of bamboo along the jungle's edges.
      if (biome.id === 'jungle' || biome.id === 'temperate' || biome.id === 'wetland') {
        const j = generator.getBiomeWeights(wx, wz, {}).jungle;
        if (j > 0.05 && j < 0.75 && hash2(gi, gj, seed + 18) < 0.8 * Math.sin(Math.PI * (j - 0.05) / 0.7)) species = { type: 'bamboo' };
      }
      // (Only cypresses, mangroves and dead trees stand out in the water.)
      if (marsh && ground < seaLevel + 0.4 && !IN_WATER.has(species.type)) continue;
      // (Cacti thin out towards a desert's edges: few where it meets the savanna.)
      if ((species.type === 'cactus' || species.type === 'smallCactus') && hash2(gi, gj, seed + 19) > smoothstep(0.55, 0.97, generator.getBiomeWeights(wx, wz, {}).desert)) continue;
      // (On a mangrove coast the mangroves keep to the water's edge and the
      // shallows; the drier ground between is open salt grass.)
      if (biome.id === 'mangrove' && species.type === 'mangrove' && ground > seaLevel + 1.3) continue;

      const size = (0.75 + hash2(gi, gj, seed + 5) * 0.6) * treeScale;
      if (species.type === 'bamboo') {
        // A thicket: a clump of separate canes, each of its own height and lean.
        const list = (placed.bamboo ??= []);
        const canes = 5 + Math.floor(hash2(gi, gj, seed + 19) * 5);
        for (let c = 0; c < canes; c++) {
          const a = hash2(gi + c * 17, gj, seed + 20) * Math.PI * 2, d = c ? 0.3 + 1.1 * hash2(gi, gj + c * 17, seed + 21) : 0;
          const cx = lx + Math.cos(a) * d, cz = lz + Math.sin(a) * d;
          const cs = (0.8 + 0.4 * hash2(gi + c, gj - c, seed + 22)) * treeScale;
          list.push({
            x: cx, y: ground - 0.2, z: cz, s: cs * 0.9, sy: cs * (0.7 + 0.45 * hash2(gi - c, gj + c, seed + 23)),
            rot: a + (hash2(gi + c, gj + c, seed + 24) - 0.5) * 1.2, shade: hash2(gi + c * 3, gj, seed + 25),
            leanX: Math.cos(a) * 0.03 - gradX * 0.1, leanZ: Math.sin(a) * 0.03 - gradZ * 0.1,
          });
        }
        continue;
      }
      (placed[species.type] ??= []).push({
        x: lx,
        // Sink the base a little so trunks never float on sloped faces.
        y: ground - 0.3 * size,
        z: lz,
        s: size,
        sy: size * (0.85 + hash2(gi, gj, seed + 6) * 0.35),
        rot: hash2(gi, gj, seed + 7) * Math.PI * 2,
        shade: hash2(gi, gj, seed + 8),
        // No tree grows perfectly straight: a small random lean, plus a
        // lean downhill on slopes (up to about 12 degrees).
        leanX: (hash2(gi, gj, seed + 9) - 0.5) * 0.08 - gradX * 0.16,
        leanZ: (hash2(gi, gj, seed + 10) - 0.5) * 0.08 - gradZ * 0.16,
      });
    }
  }

  return placed;
}

const IN_WATER = new Set(['deadPine', 'cypress', 'mangrove']);

/** The kinds of tree, in a fixed order (far trees are packed by index). */
export const TREE_TYPES = ['pine', 'spruce', 'broadleaf', 'birch', 'poplar', 'maple', 'bush', 'deadPine', 'acacia', 'cactus', 'smallCactus', 'dryBush', 'cypress', 'swampWillow',
  'oak', 'larch', 'silverBirch', 'aspen', 'baobab', 'joshuaTree', 'ocotillo', 'charredSnag', 'treeFern', 'weepingWillow', 'mangrove', 'jungleGiant', 'junglePalm', 'bamboo', 'jungleCanopy',
  'appleTree', 'raspberryBush', 'blueberryBush', 'redwood'];

/**
 * Packs placed trees (see placeTrees) for the far-tree layer: per type, a
 * Float32Array of [x, y, z (world), size, height, turn, shade] per tree.
 */
export function packFarTrees(placed, cx, cz, chunkSize) {
  const out = {};
  const ox = cx * chunkSize, oz = cz * chunkSize;
  for (const [type, list] of Object.entries(placed)) {
    const a = new Float32Array(list.length * 7);
    list.forEach((t, k) => a.set([ox + t.x, t.y, oz + t.z, t.s, t.sy, t.rot, t.shade], k * 7));
    out[type] = a;
  }
  return out;
}
