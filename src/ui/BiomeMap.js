import { paintFog } from './mapFog.js';
import { MAP_LABELS } from './mapLabels.js';

const TILE = 64; // samples per tile edge
const SCALES = [4, 8, 16, 32, 64, 128]; // metres per sample (per map pixel)
const MAX_PENDING = 14; // map tiles being worked out at once (spread over the land's workers)
const RGB = MAP_LABELS.map(([, c]) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);

const STYLE = `
.biome-map { position: fixed; inset: 0; z-index: 50; display: none; background: rgba(12, 18, 28, 0.82); color: #fff;
  font: 13px/1.3 system-ui, sans-serif; align-items: center; justify-content: center; gap: 18px; padding: 16px; box-sizing: border-box; }
.biome-map.open { display: flex; }
.biome-map canvas { border-radius: 12px; max-height: 100%; box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5); cursor: crosshair; touch-action: none; max-width: 100%; }
.biome-map .side { display: flex; flex-direction: column; gap: 8px; max-height: 100%; overflow: auto; min-width: 190px; }
.biome-map .title { font-size: 18px; font-weight: 700; }
.biome-map .hint { opacity: 0.75; font-size: 12px; }
.biome-map .where { font-weight: 600; min-height: 1.3em; }
.biome-map .legend { display: grid; grid-template-columns: 1fr; gap: 2px; }
.biome-map .legend button { all: unset; display: flex; align-items: center; gap: 7px; padding: 2px 4px; border-radius: 5px; cursor: pointer; }
.biome-map .legend button:hover, .biome-map .legend button.on { background: rgba(255, 255, 255, 0.14); }
.biome-map .legend i { width: 14px; height: 14px; border-radius: 3px; flex: none; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3); }
.biome-map .shows { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; }
.biome-map .shows label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.biome-map .close { all: unset; position: absolute; top: 14px; right: 18px; font-size: 22px; cursor: pointer; opacity: 0.8; }
@media (max-width: 760px) { .biome-map { flex-direction: column; } .biome-map .side { max-height: 32vh; } }
`;

/**
 * The big map, for finding your way (and testing): the land for kilometres
 * round, coloured by the kind of country (as the biome readout names it)
 * and hill-shaded, drawn tile by tile by the chunk workers. Drag to look
 * around, scroll to zoom, click anywhere to fly there; pick a kind of
 * country in the legend to light up where it is. B or Esc closes it.
 *
 * @param task      (message) => Promise of a worker's result (ChunkManager.task)
 * @param where     () => { x, z, heading } where you are
 * @param teleport  (x, z) => take you there
 */
export class BiomeMap {
  constructor({ task, where, teleport, ruins, fog, keep, more, landmarks, wrecks }) {
    this.wrecks = wrecks; // ((x, z, r) => the shipwrecks to mark, round there: testing)
    this.landmarks = landmarks; // ((x, z, r) => the landmarks to mark: { x, z, name, found })
    this.more = more; // (() => whether the ruins aren't all worked out yet: drawn again in a moment)
    this.keep = keep; // (() => { x, z, r } where the Lost Keep is marked, or null)
    this.fog = fog; // (() => { explored, size } in survival, or null: see mapFog)
    this.ruins = ruins; // ((x, z, r) => the ruins to mark, round there)
    this.task = task;
    this.where = where;
    this.teleport = teleport;
    this.tiles = new Map(); // "scale:tx:tz" -> { canvas } | 'pending'
    this.pending = 0;
    this.scale = 16;
    this.centre = { x: 0, z: 0 };
    this.highlight = -1;
    this.epoch = 0; // bumped for a new world: tiles still coming for the old one are dropped
    this.zoomDelta = 0; // scrolling so far towards the next zoom step

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    this.root = document.createElement('div');
    this.root.className = 'biome-map';
    this.root.innerHTML = `<button class="close" aria-label="Close map">✕</button><canvas></canvas><div class="side"><div class="title">Map</div>
      <div class="hint">Drag to look around · scroll to zoom · click to fly there · <b>B</b> closes</div><div class="where"></div><div class="shows"></div><div class="legend"></div></div>`;
    document.body.append(this.root);
    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.whereEl = this.root.querySelector('.where');
    // What's marked on it, each to show or hide (remembered): see draw.
    this.show = { ruins: true, keep: true, wrecks: true, landmarks: true };
    try {
      Object.assign(this.show, JSON.parse(localStorage.getItem('facet-lands:mapShow') ?? '{}'));
    } catch {}
    const shows = this.root.querySelector('.shows');
    for (const [key, name] of [['ruins', 'Ruins'], ['keep', 'Lost Keep'], ['landmarks', 'Landmarks'], ['wrecks', 'Wrecks']]) {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox"${this.show[key] ? ' checked' : ''}> ${name}`;
      l.querySelector('input').addEventListener('change', (e) => {
        this.show[key] = e.target.checked;
        try {
          localStorage.setItem('facet-lands:mapShow', JSON.stringify(this.show));
        } catch {}
        this.draw();
      });
      shows.append(l);
    }
    const legend = this.root.querySelector('.legend');
    MAP_LABELS.forEach(([name, colour], k) => {
      const b = document.createElement('button');
      b.innerHTML = `<i style="background:${colour}"></i>${name}`;
      b.addEventListener('click', () => {
        this.highlight = this.highlight === k ? -1 : k;
        legend.querySelectorAll('button').forEach((el, n) => el.classList.toggle('on', n === this.highlight));
        for (const tile of this.tiles.values()) if (tile !== 'pending') this.#paint(tile);
        this.draw();
      });
      legend.append(b);
    });
    this.root.querySelector('.close').addEventListener('click', () => this.close());
    this.#input();
  }

  get isOpen() {
    return this.root.classList.contains('open');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    const p = this.where();
    this.centre = { x: p.x, z: p.z };
    this.root.classList.add('open');
    // (As big as the window allows: the side panel beside it, or under it on a narrow screen.)
    const narrow = window.innerWidth < 760;
    this.canvas.width = Math.max(240, Math.floor(window.innerWidth - (narrow ? 32 : 250)));
    this.canvas.height = Math.max(240, Math.floor(window.innerHeight * (narrow ? 0.62 : 1) - 32));
    this.draw();
  }

  close() {
    this.root.classList.remove('open');
  }

  /**
   * While the map's shut, works out a few tiles round (x, z) ahead of time
   * (the coarse picture first, then the usual fine one, nearest first, a
   * couple at once), so it's mostly there already when it's opened.
   */
  prefetch(x, z) {
    if (this.isOpen || this.pending >= 2) return;
    for (const [scale, reach] of [[64, 2], [16, 4]]) {
      const span = TILE * scale, cx = Math.floor(x / span), cz = Math.floor(z / span);
      const want = [];
      for (let tz = cz - reach; tz <= cz + reach; tz++) for (let tx = cx - reach; tx <= cx + reach; tx++) if (!this.tiles.has(`${scale}:${tx}:${tz}`)) want.push([tx, tz, Math.hypot(tx - cx, tz - cz)]);
      want.sort((a, b) => a[2] - b[2]);
      for (const [tx, tz] of want) {
        if (this.pending >= 2) return;
        this.#request(tx, tz, scale);
      }
    }
  }

  /** Forgets every tile (a new world: the seed changed), redrawing if open. */
  reset() {
    this.epoch++;
    this.tiles.clear();
    this.pending = 0;
    this.draw();
  }

  /** World position under canvas pixel (px, py). */
  #toWorld(px, py) {
    const { width, height } = this.canvas;
    return { x: this.centre.x + (px - width / 2) * this.scale, z: this.centre.z + (py - height / 2) * this.scale };
  }

  #input() {
    let drag = null;
    const c = this.canvas;
    const pixel = (e) => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
    };
    c.addEventListener('pointerdown', (e) => {
      drag = { start: pixel(e), centre: { ...this.centre }, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const [px, py] = pixel(e);
      const w = this.#toWorld(px, py);
      this.whereEl.textContent = `${this.#labelAt(px, py) ?? '…'} · ${Math.round(w.x)}, ${Math.round(w.z)}`;
      if (!drag) return;
      const dx = px - drag.start[0], dy = py - drag.start[1];
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        this.centre = { x: drag.centre.x - dx * this.scale, z: drag.centre.z - dy * this.scale };
        this.draw();
      }
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const w = this.#toWorld(...pixel(e));
        this.close();
        this.teleport(w.x, w.z);
      }
      drag = null;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      // (A trackpad sends a stream of small scrolls, a mouse wheel bigger
      // clicks: a zoom step only once they add up to a proper scroll, and
      // at most one step at a time, so it never races right in or out.)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (Math.sign(e.deltaY) !== Math.sign(this.zoomDelta)) this.zoomDelta = 0;
      this.zoomDelta += e.deltaY * unit;
      const now = performance.now();
      if (Math.abs(this.zoomDelta) < 90 || now - (this.lastZoom ?? 0) < 180) return;
      const k = SCALES.indexOf(this.scale) + (this.zoomDelta > 0 ? 1 : -1);
      this.zoomDelta = 0;
      this.lastZoom = now;
      if (k < 0 || k >= SCALES.length) return;
      // Zoom about the point under the cursor.
      const [px, py] = pixel(e);
      const before = this.#toWorld(px, py);
      this.scale = SCALES[k];
      const after = this.#toWorld(px, py);
      this.centre.x += before.x - after.x;
      this.centre.z += before.z - after.z;
      this.draw();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  // (The label under a canvas pixel, if its tile is drawn.)
  #labelAt(px, py) {
    const w = this.#toWorld(px, py);
    const fog = this.fog?.();
    if (fog && !fog.explored.has(`${Math.floor(w.x / fog.size)},${Math.floor(w.z / fog.size)}`)) return null; // (not yet explored: nothing known)
    const span = TILE * this.scale;
    const tx = Math.floor(w.x / span), tz = Math.floor(w.z / span);
    const tile = this.tiles.get(`${this.scale}:${tx}:${tz}`);
    if (!tile || tile === 'pending') return null;
    const i = Math.floor((w.x - tx * span) / this.scale), j = Math.floor((w.z - tz * span) / this.scale);
    const k = tile.labels[j * TILE + i];
    return MAP_LABELS[k]?.[0] ?? null;
  }

  /** The map's own label at a world point, from a tile already drawn (null if none is yet). */
  labelAtWorld(x, z) {
    const span = TILE * this.scale;
    const tx = Math.floor(x / span), tz = Math.floor(z / span);
    const tile = this.tiles.get(`${this.scale}:${tx}:${tz}`);
    if (!tile || tile === 'pending') return null;
    const i = Math.min(TILE - 1, Math.floor((x - tx * span) / this.scale)), j = Math.min(TILE - 1, Math.floor((z - tz * span) / this.scale));
    return MAP_LABELS[tile.labels[j * TILE + i]]?.[0] ?? null;
  }

  #request(tx, tz, scale) {
    const key = `${scale}:${tx}:${tz}`;
    const epoch = this.epoch;
    this.tiles.set(key, 'pending');
    this.pending++;
    this.task({ kind: 'map', x0: tx * TILE * scale, z0: tz * TILE * scale, n: TILE, s: scale })
      .then(({ labels, shade }) => {
        if (epoch !== this.epoch) return; // (the old world's)
        const tile = { labels, shade, canvas: document.createElement('canvas') };
        tile.canvas.width = tile.canvas.height = TILE;
        this.#paint(tile);
        this.tiles.set(key, tile);
      })
      .catch(() => epoch === this.epoch && this.tiles.delete(key))
      .finally(() => {
        if (epoch !== this.epoch) return;
        this.pending--;
        if (this.isOpen) this.draw();
      });
  }

  // The nearest coarser tile already in that covers tile (tx, tz) at `scale`, and where in it: { tile, sx, sy, size }, or null.
  #coarser(tx, tz, scale) {
    for (let s2 = scale * 2; s2 <= SCALES[SCALES.length - 1] * 4; s2 *= 2) {
      const f = s2 / scale, ctx = Math.floor(tx / f), ctz = Math.floor(tz / f);
      const tile = this.tiles.get(`${s2}:${ctx}:${ctz}`);
      if (tile && tile !== 'pending') return { tile, sx: ((tx - ctx * f) * TILE) / f, sy: ((tz - ctz * f) * TILE) / f, size: TILE / f };
    }
    return null;
  }

  // Colours a tile's picture (dimming all but the highlighted kind of country).
  #paint(tile) {
    const ctx = tile.canvas.getContext('2d');
    const img = ctx.createImageData(TILE, TILE);
    for (let k = 0; k < TILE * TILE; k++) {
      const c = RGB[tile.labels[k]] ?? [120, 120, 120];
      const lit = 0.72 + (tile.shade[k] / 255) * 0.56;
      const dim = this.highlight >= 0 && tile.labels[k] !== this.highlight ? 0.3 : 1;
      img.data[k * 4] = Math.min(255, c[0] * lit * dim);
      img.data[k * 4 + 1] = Math.min(255, c[1] * lit * dim);
      img.data[k * 4 + 2] = Math.min(255, c[2] * lit * dim);
      img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  draw() {
    if (!this.isOpen) return;
    const { ctx, canvas, scale } = this;
    const w = canvas.width, n = canvas.height;
    ctx.fillStyle = '#1b2433';
    ctx.fillRect(0, 0, w, n);
    ctx.imageSmoothingEnabled = false;
    const span = TILE * scale;
    const x0 = this.centre.x - (w / 2) * scale, z0 = this.centre.z - (n / 2) * scale;
    const want = [], wantCoarse = new Set();
    for (let tz = Math.floor(z0 / span); tz * span < z0 + n * scale; tz++) {
      for (let tx = Math.floor(x0 / span); tx * span < x0 + w * scale; tx++) {
        const tile = this.tiles.get(`${scale}:${tx}:${tz}`);
        const px = Math.round((tx * span - x0) / scale), py = Math.round((tz * span - z0) / scale); // (whole pixels: no seams)
        if (tile && tile !== 'pending') ctx.drawImage(tile.canvas, px, py, TILE + 1, TILE + 1);
        else {
          // (Not in yet: the same ground from a coarser tile, blockier, till it is.)
          const coarse = this.#coarser(tx, tz, scale);
          if (coarse) ctx.drawImage(coarse.tile.canvas, coarse.sx, coarse.sy, coarse.size, coarse.size, px, py, TILE + 1, TILE + 1);
          else if (scale * 4 <= SCALES[SCALES.length - 1]) wantCoarse.add(`${Math.floor((tx * span) / (span * 4))}:${Math.floor((tz * span) / (span * 4))}`);
          if (!tile) want.push([tx, tz, Math.hypot(px + TILE / 2 - w / 2, py + TILE / 2 - n / 2)]);
        }
      }
    }
    // First a quick, coarse picture of the whole view (each tile four times the
    // ground: a sixteenth of the work), then the fine tiles, nearest the
    // middle first, as many at once as the workers can take.
    for (const k of wantCoarse) {
      if (this.pending >= MAX_PENDING) break;
      const [cx, cz] = k.split(':').map(Number);
      if (!this.tiles.has(`${scale * 4}:${cx}:${cz}`)) this.#request(cx, cz, scale * 4);
    }
    want.sort((a, b) => a[2] - b[2]);
    for (const [tx, tz] of want) {
      if (this.pending >= MAX_PENDING) break;
      this.#request(tx, tz, scale);
    }
    // (In survival: only the land you've explored.)
    const fog = this.fog?.();
    if (fog) ctx.drawImage(paintFog((this.fogMask ??= document.createElement('canvas')), w, n, fog.explored, fog.size, (x, z) => [(x - x0) / scale, (z - z0) / scale], scale), 0, 0);
    // The ruins, as little orange keeps.
    const found = !this.show.ruins ? [] : this.ruins?.(this.centre.x, this.centre.z, Math.hypot(w, n) * scale * 0.5, (x, z) => this.labelAtWorld(x, z)) ?? [];
    const km = this.show.keep ? this.keep?.() : null;
    if (km) {
      const kx = (km.x - x0) / scale, ky = (km.z - z0) / scale;
      if (km.r) {
        ctx.beginPath();
        ctx.arc(kx, ky, Math.max(6, km.r / scale), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232, 184, 64, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#e8b840';
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(kx - 6, ky + 5); ctx.lineTo(kx - 6, ky - 3); ctx.lineTo(kx - 3, ky - 3); ctx.lineTo(kx - 3, ky - 7); ctx.lineTo(kx + 3, ky - 7); ctx.lineTo(kx + 3, ky - 3); ctx.lineTo(kx + 6, ky - 3); ctx.lineTo(kx + 6, ky + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = 'bold 11px system-ui';
      ctx.fillText('The Lost Keep', kx + 9, ky + 4);
    }
    for (const r of found) {
      if (r.keep) continue;
      const rx = (r.x - x0) / scale, ry = (r.z - z0) / scale;
      if (rx < -6 || ry < -6 || rx > w + 6 || ry > n + 6) continue;
      ctx.fillStyle = '#e0a040';
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1.5;
      ctx.fillRect(rx - 4, ry - 3, 8, 6);
      ctx.strokeRect(rx - 4, ry - 3, 8, 6);
      ctx.fillRect(rx - 4, ry - 6, 2.4, 3);
      ctx.fillRect(rx + 1.6, ry - 6, 2.4, 3);
    }
    // The shipwrecks: a little hull, brown on the beaches, ringed in blue where it's sunk out at sea.
    for (const s of (this.show.wrecks && this.wrecks?.(this.centre.x, this.centre.z, Math.hypot(w, n) * scale * 0.5)) || []) {
      const sx = (s.x - x0) / scale, sy = (s.z - z0) / scale;
      if (sx < -6 || sy < -6 || sx > w + 6 || sy > n + 6) continue;
      if (s.city) {
        // (A drowned city: a ringed column.)
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#6ab8e8';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#c8ccc0';
        ctx.fillRect(sx - 5, sy - 5, 10, 2);
        ctx.fillRect(sx - 3, sy - 3, 2, 7);
        ctx.fillRect(sx + 1, sy - 3, 2, 7);
        ctx.fillRect(sx - 5, sy + 4, 10, 2);
        continue;
      }
      if (s.sunken) {
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#6ab8e8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy - 1); ctx.lineTo(sx + 6, sy - 1); ctx.lineTo(sx + 3.5, sy + 3); ctx.lineTo(sx - 3.5, sy + 3);
      ctx.closePath();
      ctx.fillStyle = '#8a5a34';
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy - 1); ctx.lineTo(sx + 1, sy - 7);
      ctx.stroke();
    }
    // The landmarks: a gold star and its name (a hollow one, only shown you by the standing stones).
    for (const l of (this.show.landmarks && this.landmarks?.(this.centre.x, this.centre.z, Math.hypot(w, n) * scale * 0.5)) || []) {
      const lx = (l.x - x0) / scale, ly = (l.z - z0) / scale;
      if (lx < -6 || ly < -6 || lx > w + 6 || ly > n + 6) continue;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 3 : 7;
        ctx.lineTo(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = l.found ? '#f2d060' : 'rgba(242, 208, 96, 0.25)';
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.font = 'bold 11px system-ui';
      ctx.fillStyle = '#fff8e0';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(l.name, lx + 9, ly + 4);
      ctx.fillText(l.name, lx + 9, ly + 4);
    }
    if (this.more?.() && !this.moreSoon) this.moreSoon = setTimeout(() => ((this.moreSoon = null), this.draw()), 60);
    // You, as an arrow.
    const p = this.where();
    const mx = (p.x - x0) / scale, my = (p.z - z0) / scale;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(p.heading);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#ff3b4a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // A scale bar.
    const metres = scale * 100;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(10, n - 30, 120, 22);
    ctx.fillStyle = '#fff';
    ctx.fillRect(16, n - 16, 100, 3);
    ctx.font = '11px system-ui';
    ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, 16, n - 20);
  }
}
