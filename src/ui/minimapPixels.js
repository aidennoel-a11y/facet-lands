import { Color, SRGBColorSpace } from 'three';

const SHALLOW = new Color(0x4fbfc4);
const DEEP = new Color(0x2c67b0);
const colour = new Color();
const rgb = { r: 0, g: 0, b: 0 };

/**
 * The minimap's picture of the land around (cx, cz): `n` x `n` samples,
 * `s` metres apart, hill-shaded, as RGBA pixels. Only three.js colours, so
 * a worker can draw it.
 */
export function minimapPixels(generator, cx, cz, n, s, seaLevel) {
  const half = (n * s) / 2;
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      heights[j * (n + 1) + i] = generator.getHeight(cx - half + i * s, cz - half + j * s);
    }
  }
  const data = new Uint8ClampedArray(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = heights[j * (n + 1) + i];
      const hx = heights[j * (n + 1) + i + 1] - h;
      const hz = heights[(j + 1) * (n + 1) + i] - h;
      const upness = s / Math.sqrt(hx * hx + hz * hz + s * s);
      const wx = cx - half + i * s;
      const wz = cz - half + j * s;
      let shade;
      const river = generator.rivers?.at(wx, wz, 1);
      if (h < seaLevel || river) {
        colour.copy(SHALLOW).lerp(DEEP, Math.min(1, Math.max(0, seaLevel - h) / 16));
        shade = 1;
      } else {
        const jitter = generator.getColorJitter(wx, wz);
        generator.surfaceColor(wx, wz, h + jitter, upness, colour, jitter);
        // Forests read a touch darker, like the woods on a paper map.
        if (h < 140) colour.multiplyScalar(1 - 0.3 * generator.getForestDensity(wx, wz) * generator.getBiomeWeights(wx, wz, {}).temperate);
        // Light from the north-west.
        shade = Math.min(1.35, Math.max(0.55, 1 + (-hx - hz) * 0.035));
      }
      colour.getRGB(rgb, SRGBColorSpace);
      const o = (j * n + i) * 4;
      data[o] = Math.min(255, rgb.r * 255 * shade);
      data[o + 1] = Math.min(255, rgb.g * 255 * shade);
      data[o + 2] = Math.min(255, rgb.b * 255 * shade);
      data[o + 3] = 255;
    }
  }
  return data;
}
