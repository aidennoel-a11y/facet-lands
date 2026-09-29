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
export function placeGrass(generator, config, cx, cz, groundHeightAt) {
  const { chunkSize, grassSpacing, seaLevel } = config;
  const cells = Math.round(chunkSize / grassSpacing);
  const spacing = chunkSize / cells;
  const originX = cx * chunkSize;
  const originZ = cz * chunkSize;
  const seed = generator.seed ^ 0x1b873593;

  const matrices = new Float32Array(cells * cells * 16);
  const colors = new Float32Array(cells * cells * 3);
  const kinds = new Uint8Array(cells * cells); // 0 tuft, 1 tall seeding stalks, 2 broad clump (see GrassLayer)
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
      // How much grass the biome here grows.
      const oasis = generator.oasisAt ? generator.oasisAt(wx, wz) : 0;
      if (keep > density * Math.max(generator.pickBiome(wx, wz, hash2(gi, gj, seed + 7)).grass, oasis)) continue;
      const river = generator.rivers?.at(wx, wz, 3);
      if (river && river.d < river.water + 2.5) continue; // nor on a river's muddy banks (reeds grow there)

      generator.surfaceColor(wx, wz, colourHeight, surface.normalY, color, jitter);
      // (Bare grey rock and snow are all but colourless; grassland isn't.)
      const hi = Math.max(color.r, color.g, color.b), lo = Math.min(color.r, color.g, color.b);
      if (hi - lo < 0.2 * hi) continue;
      const v = 0.9 + hash2(gi, gj, seed + 3) * 0.22;
      colors.set([color.r * v, color.g * v, color.b * v], count * 3);

      const s = 0.7 + hash2(gi, gj, seed + 4) * 0.7;
      // On the open plains and the savanna the grass grows long, with tall
      // seeding stalks and broad clumps among the tufts.
      const plain = generator.getPlainness(wx, wz);
      const tallLand = Math.max(plain, 0.9 * generator.getBiomeWeights(wx, wz, {}).savanna);
      // And patches, a few dozen metres to a couple of hundred across, where
      // it grows tall and rank (nearly twice as long) or cropped short.
      const n = generator.grassNoise.fbm(wx * 0.006 + 50, wz * 0.006 - 50, 2);
      const tall = smoothstep(0.08, 0.38, n), short = smoothstep(-0.08, -0.38, n);
      const long = (1 + 0.9 * tallLand) * (1 + 0.95 * tall) * (1 - 0.4 * short);
      const stalky = Math.min(1, tallLand + 0.6 * tall);
      const pick = hash2(gi, gj, seed + 8);
      const kind = pick < 0.35 * stalky ? 1 : pick < 0.35 * stalky + 0.12 + 0.15 * stalky ? 2 : 0;
      kinds[count] = kind;
      position.set(lx, ground - 0.05, lz);
      rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 5) * Math.PI * 2);
      scale.set(s, s * (0.8 + hash2(gi, gj, seed + 6) * 0.5) * (kind === 1 ? 1 : long), s);
      matrix.compose(position, rotation, scale).toArray(matrices, count * 16);
      count++;
    }
  }
  return { matrices: matrices.slice(0, count * 16), colors: colors.slice(0, count * 3), kinds: kinds.slice(0, count), count };
}
