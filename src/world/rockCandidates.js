import { hash2 } from '../noise/random.js';

/** How many rock shapes there are of each stone (see RockLayer). */
export const ROCK_SHAPE_COUNT = 5;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Where rocks can go in a chunk and how they look: everything that
 * doesn't depend on the chunk's mesh (the costly part, sampling the
 * terrain around each spot). Pure (no three.js), so a worker can work it
 * out too; RockLayer caches the lists.
 */
export function rockCandidates(generator, config, cx, cz) {
  const list = [];
  const { chunkSize, seaLevel } = config;
  const spacing = 5;
  const cells = Math.round(chunkSize / spacing);
  const step = chunkSize / cells;
  const x0 = cx * chunkSize;
  const z0 = cz * chunkSize;
  const seed = generator.seed ^ 0x3c6ef372;
  const { snowLine } = generator.getBiome(x0 + chunkSize / 2, z0 + chunkSize / 2);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gi = cx * cells + i;
      const gj = cz * cells + j;
      const lx = (i + hash2(gi, gj, seed + 1)) * step;
      const lz = (j + hash2(gi, gj, seed + 2)) * step;
      const wx = x0 + lx;
      const wz = z0 + lz;

      // Boulders pile up at the foot of steep mountainsides (rock that
      // fell from above): flattish ground with a steep face rising just
      // uphill. The mountainsides themselves stay clear; a few rocks lie
      // everywhere else, more in the foothills.
      //
      // (Worked out in stages, cheapest first: a spot whose roll is higher
      // than any chance it could have is let go before the costly samples
      // of the land around it. The rocks come out just the same.)
      const roll = hash2(gi, gj, seed);
      const m = generator.getMountainness(wx, wz);
      const foothill = Math.max(0, 1 - Math.abs(m - 0.45) / 0.35);
      // Black Hills: granite boulders strewn everywhere among the pines,
      // heaped up the steep granite too.
      const bw = generator.getBiomeWeights(wx, wz, {});
      const granite = bw.blackHills;
      // Redwood forests: mossy boulders and stones here and there among the giants.
      const red = bw.redwood;
      // Round a volcano that blew itself apart: a vast field of the
      // boulders and rocks it threw out, black and brown.
      const blast = bw.volcanic + bw.temperate + bw.pine + bw.smoky > 0.3 && bw.desert < 0.5 ? generator.blastAt(wx, wz) : 0;
      // Dry country and mesas: sandstone rocks, not grey stone.
      const { mesa, erg, escarp } = generator.getFeatures(wx, wz);
      if (erg > 0.3) continue; // no rocks in a dune sea, just sand
      const land = generator.getHeight(wx, wz);
      // Wetlands are soft mud and grass: few stones.
      // (And the volcanic highlands: rock heaped on their rocky ground,
      // hardly any out on the native grass.)
      const soft = (1 - 0.85 * bw.wetland) * (bw.volcanic > 0.05 ? 1 + bw.volcanic * (2.2 * generator.getVolcanicRocky(wx, wz) - 0.8) : 1);
      // Stones along river banks, on the mud just beside the water.
      const river = generator.rivers.at(wx, wz, 3.5);
      const bank = river && river.d > river.water + 0.4 ? 1 : 0;
      // Flat, bare stone high in the mountains: strewn with boulders
      // and rubble, so it's never a dead plain.
      const jitter = generator.getColorJitter(wx, wz);
      const colourHeight = land + jitter;
      const bare = smoothstep(132, 150, colourHeight) * (1 - smoothstep(snowLine - 20, snowLine - 8, colourHeight));
      const cliffy = m > 0.05 || Math.max(m, mesa, escarp, granite) > 0.05;
      const shoreMax = land < seaLevel + 5.5 ? 1.4 : 0;
      // Round the volcanoes: black basalt blocks heaped along the lava and
      // round the craters.
      let lavaRock = 0, strewn = 0, toe = 0;
      if (bw.volcanic > 0.2) {
        const v = generator.getVolcanic(wx, wz);
        lavaRock = 0.7 * Math.max(v.lava, 0.8 * v.crater) * bw.volcanic;
        // Thick along both sides of a live flow, all over a dead volcano,
        // and heaped where a flow ends: black lava rock and boulders.
        // (However soft the ground about: thick, whatever it's like.)
        toe = v.toe;
        strewn = Math.max(0.9 * v.flowSide, 0.6 * v.dead, 1.6 * v.toe);
      }
      // Big boulders fallen into the water at the foot of a cliff that
      // rises straight out of it (sea cliffs, lake cliffs). (Only looked
      // for where the roll could still win.)
      let surf = 0;
      const base = (0.025 + 0.2 * foothill + (cliffy ? 0.95 : 0) + 0.45 * bank + 0.55 * bare + 0.6 * shoreMax + 0.9 * granite + 0.16 * red + 1.1 * blast + lavaRock) * soft + strewn;
      // (Under a sea cliff they always lie there, all along its foot.)
      if (land < seaLevel + 1 && land > seaLevel - 9 && roll <= base + 1) {
        // (A quick look first: is there high ground close by at all?)
        let rise = 0;
        for (let k = 0; k < 4; k++) rise = Math.max(rise, (generator.getHeight(wx + (k === 0 ? 20 : k === 1 ? -20 : 0), wz + (k === 2 ? 20 : k === 3 ? -20 : 0)) - seaLevel) / 20);
        if (rise < 0.3) rise = 0;
        for (let k = 0; k < 8 && rise > 0 && rise < 0.9; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.5;
          for (const d of [8, 16, 26]) rise = Math.max(rise, (generator.getHeight(wx + Math.cos(a) * d, wz + Math.sin(a) * d) - seaLevel) / d);
        }
        surf = rise > 0.45 ? smoothstep(0.45, 0.9, rise) * (0.7 + 0.3 * smoothstep(0.1, 0.4, generator.getSeaCliff(wx, wz))) : 0;
        // (Round an island's cliffs, great heaps of fallen rock.)
        if (surf > 0 && generator.islandAt(wx, wz) > 0.2) surf = Math.min(1.6, surf * 1.8 + 0.2);
      }
      if (roll > (0.025 + 0.2 * foothill + (cliffy ? 0.95 : 0) + 0.45 * bank + 0.55 * bare + 0.6 * shoreMax + 0.9 * granite + 0.16 * red + 1.1 * blast + lavaRock) * soft + strewn + surf) continue;

      const gx = (generator.getHeight(wx + 2, wz) - generator.getHeight(wx - 2, wz)) / 4;
      const gz = (generator.getHeight(wx, wz + 2) - generator.getHeight(wx, wz - 2)) / 4;
      const slope = Math.hypot(gx, gz);
      if (slope > 0.55 + 0.4 * granite + 1.5 * surf + 0.5 * blast + 0.4 * strewn) continue;
      const flat = 1 - smoothstep(0.2, 0.45, slope);
      const heap = granite * (0.4 + 0.6 * smoothstep(0.2, 0.7, slope));
      if (roll > (0.025 + 0.2 * foothill * flat + (cliffy ? 0.95 * flat : 0) + 0.45 * bank + 0.55 * bare * flat + 0.6 * shoreMax + 0.9 * heap + 0.16 * red + 1.1 * blast + lavaRock) * soft + strewn + surf) continue;
      const dry = bw.desert + bw.savanna > 0.5 || mesa > 0.1;
      let foot = 0, cliff = 0;
      if (flat > 0 && cliffy) {
        let rise = 0;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          for (const d of [16, 32]) rise = Math.max(rise, (generator.getHeight(wx + Math.cos(a) * d, wz + Math.sin(a) * d) - land) / d);
        }
        // Mesas shed only a scattering of rock, not great heaps.
        const shed = 1 - 0.8 * mesa;
        foot = smoothstep(0.3, 0.6, rise) * flat * shed;
        cliff = smoothstep(0.75, 1.3, rise) * flat * shed; // under a cliff: the biggest heaps
      }
      const stony = bare * flat;
      // Shores: rock outcrops on beaches and lake edges, stones along the rest of a lake's edge.
      const shore = land < seaLevel + 5.5 ? generator.getShore(wx, wz, land) : null;
      const shoreRock = shore ? (shore.kind === 'rock' ? (shore.ocean ? 1.4 : 1) : shore.ocean ? 0 : 0.08) * Math.max(shore.fade, 0.6) : 0;
      // Open grassy plains: only the odd stone.
      const plain = generator.getPlainness(wx, wz);
      const chance = ((0.025 + 0.2 * foothill * flat) * (1 - 0.8 * plain) + 0.75 * foot + 0.2 * cliff + 0.25 * bank + 0.55 * stony + 0.6 * shoreRock + 0.9 * granite * (0.4 + 0.6 * smoothstep(0.2, 0.7, slope)) + 0.16 * red + 1.1 * blast + lavaRock) * soft + strewn + surf;
      // (And on open grassland, plains and meadows, 70% fewer again.)
      const open = bw.temperate > 0.5 ? Math.max(plain, bw.temperate * (1 - smoothstep(0.45, 0.6, generator.getForestDensity(wx, wz))) * (1 - smoothstep(0.3, 0.5, foothill))) : 0;
      if (roll > chance * (1 - 0.7 * open)) continue;

      const r = hash2(gi, gj, seed + 3);
      const boulder = surf > 0 || r < lavaRock || r < (bank ? 0.12 : 0.1 + 0.15 * foothill + 0.7 * foot + 0.2 * cliff + 0.45 * stony + (shore && shore.kind === 'rock' ? 0.35 : 0) + 0.5 * granite + 0.4 * red + 0.55 * blast + 0.35 * strewn + 0.4 * toe);
      if (boulder && surf <= 0 && hash2(gi, gj, seed + 31) < 0.3 * open) continue; // (and a third fewer boulders out on the grassland)
      if (generator.caves.field.nearEntrance(wx, wz, 1.5)) continue; // keep cave entrances clear
      if (generator.nearTidePool?.(wx, wz)) continue; // and tide pools
      if (!bank && generator.rivers.at(wx, wz, 1)) continue; // and rivers
      if ((lavaRock > 0 || strewn > 0) && generator.onLiveLava?.(wx, wz)) continue; // and a live lava flow
      let size = boulder ? 1.3 + hash2(gi, gj, seed + 4) * (1.6 + 1.2 * foothill + 3.2 * foot + 2.5 * cliff + 2.2 * stony + 2.5 * granite + 1.2 * red + 3.5 * blast + 1.2 * strewn) * (bank ? 0.4 : 1) : (0.25 + hash2(gi, gj, seed + 4) * 0.6) * (bank ? 1.4 : 1);
      // (Fallen into the water: big enough to stand out of it.)
      if (surf > 0) size = Math.max(size, 2.2 + hash2(gi, gj, seed + 12) * 3.2, (seaLevel - land) * 0.9);
      const sx = size * (0.8 + hash2(gi, gj, seed + 5) * 0.5);
      // Big fallen boulders stand chunkier and taller.
      const sy = size * (0.55 + hash2(gi, gj, seed + 6) * 0.45 + (boulder ? 0.35 * Math.max(foot, cliff) : 0));
      const sz = size * (0.8 + hash2(gi, gj, seed + 7) * 0.5);
      list.push({
        lx, lz, wx, wz, jitter, boulder, slope, sx, sy, sz, surf: surf > 0,
        rx: (hash2(gi, gj, seed + 8) - 0.5) * 0.5,
        ry: hash2(gi, gj, seed + 9) * Math.PI * 2,
        rz: (hash2(gi, gj, seed + 10) - 0.5) * 0.5,
        shape: Math.floor(hash2(gi, gj, seed + 11) * ROCK_SHAPE_COUNT) + (blast > 0.15 ? 3 * ROCK_SHAPE_COUNT : bw.volcanic > 0.5 || strewn > 0.1 ? 2 * ROCK_SHAPE_COUNT : dry ? ROCK_SHAPE_COUNT : 0),
      });
    }
  }
  list.snowLine = snowLine;
  return list;
}
