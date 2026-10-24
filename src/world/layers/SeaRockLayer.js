import { Color, DodecahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';
import { hash2 } from '../../noise/random.js';

// Rock under the sea: dark, some with green weed on it, some crusted pink
// and orange where the coral grows over it.
const STONE = [0x5a5e62, 0x4e5458, 0x66625a, 0x585248].map((c) => new Color(c));
const WEED = new Color(0x3e5a3a), CRUST = [0xc86a7a, 0xd08a4a, 0x8a6aa8].map((c) => new Color(c));
const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(), c = new Color();

/**
 * Rock formations on the sea bed, out where it's three metres deep and
 * more: tall stacks of boulders standing up off the bottom (some nearly to
 * the surface), arches of rock you can swim through, shelves and ledges,
 * and fields of tumbled boulders. Faceted, like the rocks on land; the
 * same in every visit. (Each chunk's: one instanced mesh of one boulder.)
 */
export function createSeaRockLayer(config) {
  const geometry = new DodecahedronGeometry(1, 0);
  const material = new MeshLambertMaterial({ flatShading: true });
  const CELL = 26;
  return {
    name: 'seaRocks',
    material,
    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 1) return null;
      const size = config.chunkSize, sea = config.seaLevel, x0 = cx * size, z0 = cz * size;
      let any = false;
      for (let j = 0; j <= 4 && !any; j++) for (let i = 0; i <= 4 && !any; i++) if (groundHeightAt(Math.min(size - 0.01, (i * size) / 4), Math.min(size - 0.01, (j * size) / 4)) < sea - 3) any = true;
      if (!any) return null;
      const seed = generator.seed ^ 0x5e40;
      const list = []; // [x, y, z, sx, sy, sz, rx, ry, rz, colour]
      const n = Math.ceil(size / CELL);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = Math.floor(x0 / CELL) + i, gj = Math.floor(z0 / CELL) + j;
          const h = (k) => hash2(gi * 31 + k, gj, seed);
          if (h(0) > 0.42) continue;
          const lx = (i + 0.2 + 0.6 * h(1)) * CELL, lz = (j + 0.2 + 0.6 * h(2)) * CELL;
          if (lx >= size || lz >= size) continue;
          const y = groundHeightAt(lx, lz), depth = sea - y;
          if (!(depth > 3) || generator.getOceanness(x0 + lx, z0 + lz) < 0.35) continue;
          const reef = (generator.getReef?.(x0 + lx, z0 + lz, y) ?? 0) > 0.2;
          const tone = (k) => {
            c.copy(STONE[Math.floor(h(10 + k) * STONE.length)]);
            const r = h(20 + k);
            if (reef && r < 0.55) c.lerp(CRUST[Math.floor(h(30 + k) * CRUST.length)], 0.55);
            else if (r < 0.4) c.lerp(WEED, 0.45);
            return c.clone();
          };
          const ground = (x, z) => {
            const g = groundHeightAt(Math.min(size - 0.01, Math.max(0, x)), Math.min(size - 0.01, Math.max(0, z)));
            return Number.isFinite(g) ? g : y;
          };
          const kind = h(3);
          if (kind < 0.35) {
            // A stack: boulders piled up, smaller as it goes, leaning a little.
            const tall = Math.min(depth - 0.8, 3 + h(4) * 9), lean = (h(5) - 0.5) * 0.5, dir = h(6) * Math.PI * 2;
            let at = ground(lx, lz) - 0.4, k = 0;
            while (at < ground(lx, lz) + tall && k < 9) {
              const r = (1.8 - 1.1 * (k / 8)) * (0.8 + 0.4 * h(40 + k));
              const off = (at - y) * lean;
              list.push([lx + Math.cos(dir) * off, at + r * 0.6, lz + Math.sin(dir) * off, r * 1.1, r * 0.75, r, h(50 + k) * 3, h(60 + k) * 3, h(70 + k) * 3, tone(k)]);
              at += r * 1.05;
              k++;
            }
          } else if (kind < 0.5 && depth > 5) {
            // An arch: two legs of rock, and a span across the top.
            const dir = h(7) * Math.PI, w = 3 + h(8) * 3, top = Math.min(depth - 1, 3.5 + h(9) * 3);
            const ax = Math.cos(dir) * w, az = Math.sin(dir) * w;
            for (const sg of [-1, 1]) {
              const bx = lx + ax * sg, bz = lz + az * sg, gb = ground(bx, bz);
              for (let k = 0; k < 4; k++) list.push([bx, gb + (k + 0.4) * (top / 4), bz, 1.3, top / 6, 1.3, h(80 + k) * 3, h(81 + k) * 3, 0, tone(k)]);
            }
            const gt = Math.max(ground(lx + ax, lz + az), ground(lx - ax, lz - az)) + top;
            for (let k = -2; k <= 2; k++) list.push([lx + ax * k * 0.45, gt + 0.4 - Math.abs(k) * 0.25, lz + az * k * 0.45, 1.5, 0.9, 1.4, h(90 + k) * 3, dir, 0, tone(k + 5)]);
          } else if (kind < 0.7) {
            // A shelf: flat slabs stepping down, a ledge to swim along.
            const dir = h(11) * Math.PI * 2;
            for (let k = 0; k < 5; k++) {
              const bx = lx + Math.cos(dir) * k * 2.4, bz = lz + Math.sin(dir) * k * 2.4;
              list.push([bx, ground(bx, bz) + 0.6 + (4 - k) * 0.35, bz, 2.6, 0.7, 1.8, 0.05, dir + h(100 + k) * 0.6, 0.05, tone(k)]);
            }
          } else {
            // A field of tumbled boulders.
            for (let k = 0; k < 6 + Math.floor(h(12) * 6); k++) {
              const bx = lx + (h(110 + k) - 0.5) * 12, bz = lz + (h(120 + k) - 0.5) * 12, r = 0.5 + h(130 + k) * 1.6;
              list.push([bx, ground(bx, bz) + r * 0.3, bz, r, r * 0.8, r * 1.1, h(140 + k) * 3, h(150 + k) * 3, h(160 + k) * 3, tone(k)]);
            }
          }
        }
      }
      if (!list.length) return null;
      const mesh = new InstancedMesh(geometry, material, list.length);
      list.forEach(([x, y, z, sx, sy, sz, rx, ry, rz, col], k) => {
        q.setFromEuler(e.set(rx, ry, rz));
        mesh.setMatrixAt(k, m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz)));
        mesh.setColorAt(k, col);
      });
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.name = 'seaRocks';
      return mesh;
    },

    dispose(mesh) {
      mesh.dispose();
    },
  };
}
