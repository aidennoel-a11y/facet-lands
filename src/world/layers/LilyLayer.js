import { BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2, mulberry32 } from '../../noise/random.js';

const PAD = new Color(0x4f7d34);
const PAD_LIGHT = new Color(0x6f9a45);
const FLOWER = new Color(0xf2c6d8);
const FLOWER_HEART = new Color(0xf4d35e);

/**
 * A lily pad: a flat, round leaf with a notch cut into it, low-poly, and
 * sometimes a small pink flower on it.
 */
function padGeometry(seed, flower) {
  const rand = mulberry32(seed);
  const positions = [];
  const colors = [];
  const tri = (a, b, c, col) => {
    positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
  };
  const n = 9;
  const notch = rand() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const a0 = notch + 0.35 + (k / n) * (Math.PI * 2 - 0.7), a1 = notch + 0.35 + ((k + 1) / n) * (Math.PI * 2 - 0.7);
    const r0 = 0.9 + rand() * 0.15, r1 = 0.9 + rand() * 0.15;
    const col = PAD.clone().lerp(PAD_LIGHT, rand() * 0.6);
    tri([0, 0, 0], [Math.cos(a1) * r1, 0, Math.sin(a1) * r1], [Math.cos(a0) * r0, 0, Math.sin(a0) * r0], col);
  }
  if (flower) {
    // Petals: a little ring of pink triangles tipped up, a yellow heart.
    const cx = 0.2, cz = -0.1;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      tri([cx, 0.05, cz], [cx + Math.cos(a + 0.35) * 0.28, 0.18, cz + Math.sin(a + 0.35) * 0.28], [cx + Math.cos(a - 0.35) * 0.28, 0.18, cz + Math.sin(a - 0.35) * 0.28], FLOWER);
    }
    tri([cx - 0.07, 0.12, cz], [cx + 0.07, 0.12, cz], [cx, 0.12, cz + 0.08], FLOWER_HEART);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  g.computeVertexNormals();
  return g;
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);

/**
 * Lily pads floating in clusters on the still pools and channels of the
 * wetlands, a few in flower, on the chunks near you.
 */
export function createLilyLayer(config) {
  const shapes = [padGeometry(11, false), padGeometry(23, false), padGeometry(37, true)];
  const material = new MeshLambertMaterial({ vertexColors: true });

  return {
    name: 'lilies',
    material,

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, heights, generator, groundHeightAt }) {
      if (lod > 1) return null;
      const size = config.chunkSize;
      const sea = config.seaLevel;
      let low = Infinity;
      for (const y of heights.gridY) low = Math.min(low, y);
      const x0 = cx * size, z0 = cz * size;
      // (The wetlands' water, or the Cascades' still pools and ponds.)
      const falls = !!generator.landmarks?.fallsInBox(x0, z0, x0 + size, z0 + size);
      const wet = low <= sea - 0.3 && generator.getBiomeWeights(x0 + size / 2, z0 + size / 2, {}).wetland >= 0.15;
      if (!wet && !falls) return null;
      const seed = generator.seed ^ 0x11b7a3;
      const spacing = 1.4;
      const cells = Math.round(size / spacing);
      const step = size / cells;
      const placed = shapes.map(() => []);
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i, gj = cz * cells + j;
          const wx = x0 + (i + hash2(gi, gj, seed + 1)) * step, wz = z0 + (j + hash2(gi, gj, seed + 2)) * step;
          // In clusters.
          const patch = Math.sin(wx * 0.11 + Math.sin(wz * 0.08) * 2.5) * Math.sin(wz * 0.09 - Math.sin(wx * 0.06) * 2);
          if (hash2(gi, gj, seed) > patch * 1.4 - 0.35) continue;
          const ground = groundHeightAt(wx - x0, wz - z0);
          let level = sea;
          if (falls) {
            // (On a pool's still water, out of the ripples, in the shallows.)
            const w = generator.landmarks.fallsWater(wx, wz);
            if (!w || !w.pond || w.ripple || w.inset < 0.8 || !(ground > w.level - 2.4 && ground < w.level - 0.3)) continue;
            level = w.level;
          } else {
            if (!(ground > sea - 1.8 && ground < sea - 0.25)) continue; // shallow, still water
            if (generator.getBiomeWeights(wx, wz, {}).wetland < 0.5) continue;
          }
          const s = 0.45 + hash2(gi, gj, seed + 3) * 0.5;
          position.set(wx - x0, level + 0.035, wz - z0);
          rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 4) * Math.PI * 2);
          scale.set(s, 1, s);
          const kind = hash2(gi, gj, seed + 5) < 0.08 ? 2 : hash2(gi, gj, seed + 6) < 0.5 ? 0 : 1;
          placed[kind].push(matrix.compose(position, rotation, scale).clone());
        }
      }
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'lilies';
      placed.forEach((list, k) => {
        if (!list.length) return;
        const mesh = new InstancedMesh(shapes[k], material, list.length);
        list.forEach((m, n) => mesh.setMatrixAt(n, m));
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        group.add(mesh);
      });
      return group;
    },

    dispose(group) {
      for (const mesh of group.children) mesh.dispose(); // (the pad shapes are shared)
    },
  };
}
