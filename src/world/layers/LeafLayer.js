import { BufferAttribute, BufferGeometry, Color, DodecahedronGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2, mulberry32 } from '../../noise/random.js';
import { seasonUniforms } from '../../render/Seasons.js';

// The trees that drop their leaves.
const DECIDUOUS = new Set(['broadleaf', 'birch', 'poplar', 'maple', 'oak', 'silverBirch', 'aspen', 'weepingWillow', 'swampWillow']);
const LEAF_COLORS = [0xb85a1c, 0xd08a2a, 0x8e3a18, 0xc9a23a, 0x6e4a22, 0xa8461e].map((c) => new Color(c));

/**
 * A heap of fallen leaves, base at y = 0: a low, soft mound (finer than a
 * rock's facets, flattened right down), and over it and spilling out round
 * its edge the leaves themselves, each a little pointed blade of its own
 * colour lying at its own tilt, curled up a touch at the tip.
 */
function pile(seed, base) {
  const rand = mulberry32(seed);
  const g = (base === 'ico' ? new IcosahedronGeometry(1, 1) : new DodecahedronGeometry(1, 1)).toNonIndexed();
  const pos = g.attributes.position;
  const out = [], col = [];
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const lump = 0.88 + 0.24 * hash2(Math.round(x * 50), Math.round(z * 50), seed);
    out.push(x * lump, Math.max(0, y) * 0.2 * lump - 0.03, z * lump);
  }
  for (let f = 0; f < pos.count; f += 3) {
    const c = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)], shade = 0.7 + rand() * 0.3;
    for (let k = 0; k < 3; k++) col.push(c.r * shade, c.g * shade, c.b * shade);
  }
  // The leaves on it: thicker over the top, a scatter of them out past its edge.
  for (let n = 0; n < 70; n++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 1.35;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const cy = Math.max(0, 0.2 * (1 - (r / 1.05) ** 2)) + 0.012;
    const turn = rand() * Math.PI * 2, len = 0.07 + rand() * 0.07, wide = len * (0.35 + rand() * 0.25);
    const tx = Math.cos(turn), tz = Math.sin(turn), sx = -tz, sz = tx, curl = 0.02 + rand() * 0.04;
    const tipX = cx + tx * len, tipZ = cz + tz * len, tailX = cx - tx * len, tailZ = cz - tz * len;
    const c = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)], shade = 0.95 + rand() * 0.35;
    const quad = [[tailX, cy, tailZ], [cx + sx * wide, cy + 0.006, cz + sz * wide], [tipX, cy + curl, tipZ], [cx - sx * wide, cy + 0.006, cz - sz * wide]];
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) {
      for (const v of [quad[i], quad[j], quad[k]]) out.push(...v);
      for (let m = 0; m < 3; m++) col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(out), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  return geo;
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0), normal = new Vector3(), tilt = new Quaternion();

/**
 * Autumn's fallen leaves, heaped under the trees that drop them: they
 * pile up as autumn comes and settle away into the ground (and under the
 * snow) as winter comes. On the chunks near you.
 */
export function createLeafLayer() {
  const shapes = [pile(3, 'dodeca'), pile(9, 'ico')];
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAutumn = seasonUniforms.uAutumn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uAutumn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= smoothstep(0.05, 0.6, uAutumn);');
  };
  material.customProgramCacheKey = () => 'leaf-piles';

  return {
    name: 'leaves',
    material,

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, prepared, groundHeightAt, generator, config }) {
      const size = config.chunkSize;
      if (lod > 1 || !prepared?.trees) return null;
      const seed = generator.seed ^ 0x1eaf;
      const placed = shapes.map(() => []);
      for (const [type, list] of Object.entries(prepared.trees)) {
        if (!DECIDUOUS.has(type)) continue;
        for (const t of list) {
          const h = (n) => hash2(Math.floor(t.x * 10) + cx * 1300, Math.floor(t.z * 10) + cz * 1300, seed + n);
          const count = 1 + Math.floor(h(0) * 3);
          for (let k = 0; k < count; k++) {
            const a = h(1 + k) * Math.PI * 2, d = 0.8 + h(4 + k) * 2.4 * t.s;
            const lx = t.x + Math.cos(a) * d, lz = t.z + Math.sin(a) * d;
            if (lx < 0 || lz < 0 || lx >= size || lz >= size) continue;
            const y = groundHeightAt(lx, lz);
            if (!(y > config.seaLevel + 0.5)) continue;
            const s = 0.6 + h(7 + k) * 0.9;
            // (Lying with the ground: tilted to its slope, its uphill edge a little sunk.)
            const hx = groundHeightAt(Math.min(size - 0.01, lx + 0.8), lz) - groundHeightAt(Math.max(0, lx - 0.8), lz), hz = groundHeightAt(lx, Math.min(size - 0.01, lz + 0.8)) - groundHeightAt(lx, Math.max(0, lz - 0.8));
            normal.set(-hx / 1.6, 1, -hz / 1.6);
            if (!(Math.abs(hx) < 2) || !(Math.abs(hz) < 2)) normal.set(0, 1, 0);
            tilt.setFromUnitVectors(up, normal.normalize());
            position.set(lx, y - 0.06 * s * Math.hypot(hx, hz), lz);
            rotation.setFromAxisAngle(up, h(10 + k) * Math.PI * 2).premultiply(tilt);
            scale.set(s, s * (0.8 + 0.5 * h(13 + k)), s * (0.75 + 0.45 * h(16 + k)));
            placed[k % shapes.length].push(matrix.compose(position, rotation, scale).clone());
          }
        }
      }
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'leaves';
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
      for (const mesh of group.children) mesh.dispose(); // (the shapes are shared)
    },
  };
}
