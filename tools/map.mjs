// Top-down map of the world, as the in-game map (B) draws it, rivers and all.
// node tools/map.mjs <seed> <centreX> <centreZ> <pixels (multiple of 64)> <metres per pixel> <out.png>
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { MAP_LABELS, mapTile } from '../src/ui/mapLabels.js';
import zlib from 'zlib'; import fs from 'fs';
const [seed, cx, cz, n, s, out] = process.argv.slice(2);
const N = +n, S = +s, T = 64;
const g = new TerrainGenerator(seed, { seaLevel: 2, chunkSize: 128 });
const x0 = +cx - N * S / 2, z0 = +cz - N * S / 2;
const labels = new Uint8Array(N * N), shade = new Uint8Array(N * N);
for (let ty = 0; ty < N / T; ty++) for (let tx = 0; tx < N / T; tx++) {
  const r = mapTile(g, x0 + tx * T * S, z0 + ty * T * S, T, S);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { labels[(ty * T + j) * N + tx * T + i] = r.labels[j * T + i]; shade[(ty * T + j) * N + tx * T + i] = r.shade[j * T + i]; }
}
const rgb = MAP_LABELS.map(([, c]) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)));
const px = Buffer.alloc(N * (N * 3 + 1));
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = rgb[labels[j * N + i]] ?? [255, 0, 255]; const f = 0.72 + shade[j * N + i] / 255 * 0.56; const p = j * (N * 3 + 1) + 1 + i * 3; for (let k = 0; k < 3; k++) px[p + k] = Math.min(255, c[k] * f); }
const crc = (b) => { let c, t = []; for (let k = 0; k < 256; k++) { c = k; for (let q = 0; q < 8; q++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(N, 0); ih.writeUInt32BE(N, 4); ih[8] = 8; ih[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]));
console.log('done');
