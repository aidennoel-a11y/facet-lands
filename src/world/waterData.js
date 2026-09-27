import { Color } from 'three';
import { hash2 } from '../noise/random.js';

const SHALLOW = new Color(0x39a9b2);
const DEEP = new Color(0x1b4a8c);
const color = new Color();

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The lake and sea water over a chunk (see WaterLayer), as arrays:
 * { positions, colors, waves, foams, freezes, depths }, or null where it's
 * dry. The colours shade smoothly from the turquoise shallows to the deep
 * blue, and are see-through where it's shallow; `depths` is how deep the
 * water is at each corner (for the foam washing up the shore).
 * Only three.js colours, so a worker can do it too.
 */
export function waterData(generator, config, cx, cz, heights, resolution = 16) {
  const { seaLevel, chunkSize, vertexJitter } = config;

  // Skip chunks that are entirely dry.
  let minGround = Infinity;
  for (let k = 0; k < heights.gridY.length; k++) minGround = Math.min(minGround, heights.gridY[k]);
  if (minGround > seaLevel + 1) return null;

  const n = resolution + 1;
  const cell = chunkSize / resolution;
  const originX = cx * chunkSize;
  const originZ = cz * chunkSize;
  const seed = generator.seed ^ 0x2545f491;

  const xs = new Float32Array(n * n);
  const zs = new Float32Array(n * n);
  const ground = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = cx * resolution + i;
      const gj = cz * resolution + j;
      const k = j * n + i;
      xs[k] = i * cell + (hash2(gi, gj, seed) - 0.5) * 2 * vertexJitter * cell;
      zs[k] = j * cell + (hash2(gi, gj, seed ^ 0x5bd1e995) - 0.5) * 2 * vertexJitter * cell;
      ground[k] = generator.getHeight(originX + xs[k], originZ + zs[k]);
    }
  }

  // Surf along the open coast: in the shallows, strongest under cliffs.
  const surf = new Float32Array(n * n);
  // The open sea: waves build the further out (the deeper) it is.
  const swell = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) {
    const depth = seaLevel - ground[k];
    if (depth < 6) continue;
    const x = originX + xs[k], z = originZ + zs[k];
    swell[k] = smoothstep(6, 30, depth) * smoothstep(0.4, 0.8, generator.getOceanness(x, z));
  }
  // Lakes (not the open sea) in lands with a cold winter freeze over.
  const freeze = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (ground[k] < seaLevel + 1.5) {
      const x = originX + xs[k], z = originZ + zs[k];
      freeze[k] = generator.getSeasonality(x, z) * (1 - generator.getOceanness(x, z));
    }
    const depth = seaLevel - ground[k];
    if (depth < -1 || depth > 3.5) continue;
    const x = originX + xs[k], z = originZ + zs[k];
    if (generator.getOceanness(x, z) < 0.5) continue;
    surf[k] = (1 - smoothstep(0.2, 1.8, depth)) * (0.35 + 0.65 * generator.getSeaCliff(x, z));
  }

  const positions = [];
  const colors = [];
  const waves = [];
  const foams = [];
  const freezes = [];
  const depths = [];
  const addTri = (a, b, c) => {
    // Keep faces with any corner under water; drop fully dry ones.
    const wet = seaLevel + 1.5;
    if (ground[a] > wet && ground[b] > wet && ground[c] > wet) return;
    for (const k of [a, b, c]) {
      const depth = seaLevel - ground[k];
      const t = smoothstep(-1, 16, depth);
      color.copy(SHALLOW).lerp(DEEP, t);
      positions.push(xs[k], seaLevel, zs[k]);
      colors.push(color.r, color.g, color.b, 0.6 + 0.38 * smoothstep(-0.5, 8, depth));
      depths.push(Math.max(-2, Math.min(40, depth)));
      waves.push(0.1 + 0.9 * smoothstep(1, 16, seaLevel - ground[k]) + 2.4 * swell[k]);
      foams.push(surf[k]);
      freezes.push(freeze[k]);
    }
  };

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      const gi = cx * resolution + i;
      const gj = cz * resolution + j;
      if (hash2(gi, gj, seed + 9) < 0.5) {
        addTri(a, c, d);
        addTri(a, d, b);
      } else {
        addTri(a, c, b);
        addTri(b, c, d);
      }
    }
  }
  if (positions.length === 0) return null;

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    waves: new Float32Array(waves),
    foams: new Float32Array(foams),
    freezes: new Float32Array(freezes),
    depths: new Float32Array(depths),
  };
}
