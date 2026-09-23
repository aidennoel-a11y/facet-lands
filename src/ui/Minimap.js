import { Color, SRGBColorSpace } from 'three';
import { faceColor } from '../world/biomes.js';

/**
 * Top-down, hill-shaded map of the terrain around the camera, drawn
 * straight from the generator (no chunks needed), north up.
 */
export class Minimap {
  constructor(canvas, { samples = 96, metersPerSample = 24 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.samples = samples;
    this.metersPerSample = metersPerSample;

    this.buffer = document.createElement('canvas');
    this.buffer.width = this.buffer.height = samples;
    this.bufferCtx = this.buffer.getContext('2d');
    this.image = this.bufferCtx.createImageData(samples, samples);

    this.center = null; // world x/z the buffer was rendered around
    this.generator = null;
    this._color = new Color();
    this._rgb = { r: 0, g: 0, b: 0 };
  }

  invalidate() {
    this.center = null;
  }

  #render(generator, cx, cz) {
    const { samples: n, metersPerSample: s, image } = this;
    const half = (n * s) / 2;
    const heights = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        heights[j * (n + 1) + i] = generator.getHeight(cx - half + i * s, cz - half + j * s);
      }
    }
    const data = image.data;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const h = heights[j * (n + 1) + i];
        const hx = heights[j * (n + 1) + i + 1] - h;
        const hz = heights[(j + 1) * (n + 1) + i] - h;
        const upness = s / Math.sqrt(hx * hx + hz * hz + s * s);
        const wx = cx - half + i * s;
        const wz = cz - half + j * s;
        faceColor(generator.getBiome(wx, wz), h + generator.getColorJitter(wx, wz), upness, this._color);
        this._color.getRGB(this._rgb, SRGBColorSpace);
        // Light from the north-west.
        const shade = Math.min(1.35, Math.max(0.55, 1 + (-hx - hz) * 0.035));
        const o = (j * n + i) * 4;
        data[o] = Math.min(255, this._rgb.r * 255 * shade);
        data[o + 1] = Math.min(255, this._rgb.g * 255 * shade);
        data[o + 2] = Math.min(255, this._rgb.b * 255 * shade);
        data[o + 3] = 255;
      }
    }
    this.bufferCtx.putImageData(image, 0, 0);
    this.center = { x: cx, z: cz };
    this.generator = generator;
  }

  /** Call every frame; re-samples the terrain only after moving a while. */
  update(generator, position, heading) {
    const { samples: n, metersPerSample: s } = this;
    const redrawDistance = (n * s) / 8;
    if (
      !this.center ||
      this.generator !== generator ||
      Math.abs(position.x - this.center.x) > redrawDistance ||
      Math.abs(position.z - this.center.z) > redrawDistance
    ) {
      this.#render(generator, position.x, position.z);
    }

    const { ctx, canvas } = this;
    const w = canvas.width;
    const scale = w / (n * 0.75); // show the middle 75% so offsets never reveal edges
    const ox = (position.x - this.center.x) / s;
    const oz = (position.z - this.center.z) / s;

    ctx.save();
    ctx.clearRect(0, 0, w, w);
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(w / 2, w / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(this.buffer, -n / 2 - ox, -n / 2 - oz);
    ctx.restore();

    // Player marker, pointing the way the camera faces.
    ctx.save();
    ctx.translate(w / 2, w / 2);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff3b5c';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}
