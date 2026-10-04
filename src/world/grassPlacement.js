import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const up = new Vector3(0, 1, 0);
const color = new Color();
const surface = { normalY: 1 };

/**
 * Where the grass tufts in a chunk stand, how big and turned they are and
 * what colour (the ground's under them): { matrices (16 floats each,
 * chunk-local), colors (3 each), count }. Only three.js maths, so a worker
 * can do it too.
 */
export function placeGrass(generator, config, cx, cz, groundHeightAt, far = false) {
  const { chunkSize, seaLevel } = config;
  // (The far grass: sparser, bigger clumps, seen from a distance.)
  const grassSpacing = far ? config.farGrassSpacing : config.grassSpacing;
  const cells = Math.round(chunkSize / grassSpacing);
  const spacing = chunkSize / cells;
  const originX = cx * chunkSize;
  const originZ = cz * chunkSize;
  const seed = generator.seed ^ (far ? 0x2c1b3c6d : 0x1b873593);

  const matrices = new Float32Array(cells * cells * 16);
  const colors = new Float32Array(cells * cells * 3);
  const kinds = new Uint8Array(cells * cells); // 0 tuft, 1 tall seeding stalks, 2 broad clump, 3 sedge, 4 fine golden grass (see GrassLayer)
  let count = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gi = cx * cells + i;
      const gj = cz * cells + j;
      const lx = (i + hash2(gi, gj, seed + 1)) * spacing;
      const lz = (j + hash2(gi, gj, seed + 2)) * spacing;
      const wx = originX + lx;
      const wz = originZ + lz;
      // Cheapest tests first (every biome's grass is at most 1, so a spot
      // failing on density alone fails anyway).
      const keep = hash2(gi, gj, seed);
      const density = generator.getGrassDensity(wx, wz);
      if (keep > density) continue;
      const ground = groundHeightAt(lx, lz, surface);
      if (!(ground >= seaLevel + 0.7) || surface.normalY < 0.8) continue; // also skips cave mouths
      // Near the water only on a lake's grassy shore patches.
      const shore = ground < seaLevel + 5.5 ? generator.getShore(wx, wz, ground) : null;
      if (ground < seaLevel + 3.5 && !(shore && shore.kind === 'grass')) continue;
      if (shore && shore.kind !== 'grass' && shore.fade > 0.5) continue;
      if (generator.caves?.field.nearEntrance(wx, wz, 0.6)) continue; // nor under an entrance's ledge
      // Only where the ground itself is green (not sand, rock or snow).
      const jitter = generator.getColorJitter(wx, wz);
      const colourHeight = ground + jitter;
      if ((colourHeight < 6 && !(shore && shore.kind === 'grass')) || colourHeight > 140) continue;
      if (generator.onSinter && generator.getBiomeWeights(wx, wz, {}).volcanic > 0.5 && generator.onSinter(wx, wz)) continue; // nor on a hot spring's crust
      if (generator.onLiveLava?.(wx, wz)) continue; // nor on a lava flow
      // How much grass the biome here grows.
      const oasis = generator.oasisAt ? generator.oasisAt(wx, wz) : 0;
      if (keep > density * Math.max(generator.pickBiome(wx, wz, hash2(gi, gj, seed + 7)).grass, oasis)) continue;
      const river = generator.rivers?.at(wx, wz, 3);
      if (river && river.d < river.water + 2.5) continue; // nor on a river's muddy banks (reeds grow there)

      generator.surfaceColor(wx, wz, colourHeight, surface.normalY, color, jitter);
      // (Bare grey rock and snow are all but colourless; grassland isn't.)
      const hi = Math.max(color.r, color.g, color.b), lo = Math.min(color.r, color.g, color.b);
      if (hi - lo < 0.2 * hi) continue;
      // How near the water (a river, stream, pond, lake or the sea): the
      // grass there grows lush and green, with sedges among it.
      const bank = generator.rivers?.shoreAt(wx, wz, 22);
      const wet = Math.max(bank ? 1 - smoothstep(3, 22, bank.e) : 0, 1 - smoothstep(seaLevel + 1.5, seaLevel + 6, ground));
      // Patches of a few dozen metres where it runs a richer green or turns
      // golden, and every tuft a little different: greener by the water.
      const tint = generator.grassNoise.fbm(wx * 0.018 + 90, wz * 0.018 - 30, 2) * 1.8 + (hash2(gi, gj, seed + 9) - 0.5) * 0.9 - 1.3 * wet;
      const v = 0.9 + hash2(gi, gj, seed + 3) * 0.22;
      if (tint < 0) {
        const t = Math.min(1, -tint) * 0.85;
        colors.set([color.r * v * (1 - 0.25 * t), color.g * v * (1 + 0.22 * t), color.b * v * (1 - 0.3 * t)], count * 3);
      } else {
        const t = Math.min(1, tint) * 0.85;
        colors.set([color.r * v * (1 + 0.45 * t), color.g * v * (1 + 0.12 * t), color.b * v * (1 - 0.45 * t)], count * 3);
      }

      const s = (0.7 + hash2(gi, gj, seed + 4) * 0.7) * (far ? 1.7 : 1);
      // On the open plains and the savanna the grass grows long, with tall
      // seeding stalks and broad clumps among the tufts.
      const plain = generator.getPlainness(wx, wz);
      const bw = generator.getBiomeWeights(wx, wz, {});
      // (Long in the birch and aspen parkland too.)
      const tallLand = Math.max(plain, 0.9 * bw.savanna, 1.1 * bw.parkland);
      // And patches, a few dozen metres to a couple of hundred across, where
      // it grows tall and rank (nearly twice as long) or cropped short.
      const n = generator.grassNoise.fbm(wx * 0.006 + 50, wz * 0.006 - 50, 2);
      const tall = smoothstep(0.08, 0.38, n), short = smoothstep(-0.08, -0.38, n);
      const long = (1 + 0.9 * tallLand) * (1 + 0.95 * tall) * (1 - 0.4 * short) * (1 + 0.25 * bw.parkland);
      const stalky = Math.min(1, tallLand + 0.6 * tall);
      const pick = hash2(gi, gj, seed + 8);
      // Sedges by the water and in the marshes; fine golden-headed grass
      // where it runs yellow.
      const sedge = Math.min(0.6, 0.55 * wet + 0.4 * (bw.wetland + bw.mangrove));
      const golden = 0.25 * smoothstep(0, 0.8, tint) + 0.06;
      const kind = pick < sedge ? 3 : pick < sedge + golden ? 4 : pick < sedge + golden + 0.35 * stalky ? 1 : pick < sedge + golden + 0.35 * stalky + 0.12 + 0.15 * stalky ? 2 : 0;
      kinds[count] = kind;
      position.set(lx, ground - 0.05, lz);
      rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 5) * Math.PI * 2);
      scale.set(s, s * (0.8 + hash2(gi, gj, seed + 6) * 0.5) * (kind === 1 || kind === 3 ? 1 + 0.3 * wet : long), s);
      matrix.compose(position, rotation, scale).toArray(matrices, count * 16);
      count++;
    }
  }
  return { matrices: matrices.slice(0, count * 16), colors: colors.slice(0, count * 3), kinds: kinds.slice(0, count), count };
}
