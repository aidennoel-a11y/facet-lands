import { minimapPixels } from './minimapPixels.js';

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
    this.caveMouths = [];
    // (message) => Promise of the pixels: a worker to draw the map in (see ChunkManager.task).
    this.worker = null;
    this.pending = false;
  }

  invalidate() {
    this.center = null;
    this.pending = false;
  }

  /**
   * Redraws the map around (cx, cz): in a worker if one's offered (the
   * old picture stays up, shifted, until the new one's ready), else here.
   */
  #render(generator, cx, cz, seaLevel) {
    const { samples: n, metersPerSample: s } = this;
    const finish = (pixels) => {
      this.image.data.set(pixels);
      this.bufferCtx.putImageData(this.image, 0, 0);
      const half = (n * s) / 2;
      // Cave mouths in view, drawn as markers on top.
      this.caveMouths = generator.caves
        ? generator.caves.mouthsNear(cx - half, cz - half, cx + half, cz + half).map((e) => e.mouth)
        : [];
      this.center = { x: cx, z: cz };
    };
    this.generator = generator;
    if (this.worker && this.center) {
      if (this.pending) return; // one at a time
      this.pending = true;
      this.worker({ kind: 'minimap', cx, cz, n, s, seaLevel }).then(
        (pixels) => {
          this.pending = false;
          if (this.generator === generator) finish(pixels);
        },
        () => {
          this.pending = false;
          finish(minimapPixels(generator, cx, cz, n, s, seaLevel));
        },
      );
      return;
    }
    finish(minimapPixels(generator, cx, cz, n, s, seaLevel));
  }

  /** Call every frame; re-samples the terrain only after moving a while. */
  update(generator, position, heading, seaLevel) {
    const { samples: n, metersPerSample: s } = this;
    const redrawDistance = (n * s) / 8;
    if (
      !this.center ||
      this.generator !== generator ||
      Math.abs(position.x - this.center.x) > redrawDistance ||
      Math.abs(position.z - this.center.z) > redrawDistance
    ) {
      this.#render(generator, position.x, position.z, seaLevel);
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
    for (const mouth of this.caveMouths) {
      const x = (mouth.x - position.x) / s;
      const z = (mouth.z - position.z) / s;
      ctx.beginPath();
      ctx.arc(x, z, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#1b1720';
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = '#f4efe6';
      ctx.stroke();
    }
    // Ruins you've found (a small grey keep), and the mark an old map
    // made (a red cross: at the map's edge, pointing, if it's further off).
    const edge = (n * 0.75) / 2 - 4;
    for (const m of this.marks ?? []) {
      let x = (m.x - position.x) / s, z = (m.z - position.z) / s;
      const d = Math.hypot(x, z);
      if (m.kind === 'goal') {
        if (d > edge) (x *= edge / d), (z *= edge / d);
        ctx.save();
        ctx.translate(x, z);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-3, -3); ctx.lineTo(3, 3); ctx.moveTo(3, -3); ctx.lineTo(-3, 3);
        ctx.stroke();
        ctx.strokeStyle = '#c0281a';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      } else if (d >= edge && m.edge) {
        // (A ruin off the map: a small mark at its edge, the way to go.)
        x *= edge / d;
        z *= edge / d;
        ctx.fillStyle = '#e0a040';
        ctx.strokeStyle = '#2a2420';
        ctx.lineWidth = 0.8;
        ctx.fillRect(x - 1.6, z - 1.6, 3.2, 3.2);
        ctx.strokeRect(x - 1.6, z - 1.6, 3.2, 3.2);
      } else if (d < edge) {
        ctx.fillStyle = m.edge ? '#e0a040' : '#6e6c68';
        ctx.strokeStyle = '#f4efe6';
        ctx.lineWidth = 0.8;
        ctx.fillRect(x - 2.2, z - 2.2, 4.4, 4.4);
        ctx.strokeRect(x - 2.2, z - 2.2, 4.4, 4.4);
      }
    }
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
