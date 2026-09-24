import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import { hash2 } from '../noise/random.js';

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
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
      // How much grass the biome here grows.
      if (keep > density * generator.pickBiome(wx, wz, hash2(gi, gj, seed + 7)).grass) continue;
      const river = generator.rivers?.at(wx, wz, 3);
      if (river && river.d < river.water + 2.5) continue; // nor on a river's muddy banks (reeds grow there)

      generator.surfaceColor(wx, wz, colourHeight, surface.normalY, color, jitter);
      const v = 0.9 + hash2(gi, gj, seed + 3) * 0.22;
      colors.set([color.r * v, color.g * v, color.b * v], count * 3);

      const s = 0.7 + hash2(gi, gj, seed + 4) * 0.7;
      position.set(lx, ground - 0.05, lz);
      rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 5) * Math.PI * 2);
      scale.set(s, s * (0.8 + hash2(gi, gj, seed + 6) * 0.5), s);
      matrix.compose(position, rotation, scale).toArray(matrices, count * 16);
      count++;
    }
  }
  return { matrices: matrices.slice(0, count * 16), colors: colors.slice(0, count * 3), count };
}
