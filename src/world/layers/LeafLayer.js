import { BufferAttribute, Color, DodecahedronGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2, mulberry32 } from '../../noise/random.js';
import { seasonUniforms } from '../../render/Seasons.js';

// The trees that drop their leaves.
const DECIDUOUS = new Set(['broadleaf', 'birch', 'poplar', 'maple', 'oak', 'silverBirch', 'aspen', 'weepingWillow', 'swampWillow']);
const LEAF_COLORS = [0xb85a1c, 0xd08a2a, 0x8e3a18, 0xc9a23a, 0x6e4a22, 0xa8461e].map((c) => new Color(c));

/** A low heap of fallen leaves: a squashed, lumpy mound of facets in autumn colours, base at y = 0. */
function pile(seed, base) {
  const rand = mulberry32(seed);
  const g = (base === 'ico' ? new IcosahedronGeometry(1, 0) : new DodecahedronGeometry(1, 0)).toNonIndexed();
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k);
    const lump = 0.85 + 0.3 * hash2(Math.round(pos.getX(k) * 50), Math.round(pos.getZ(k) * 50), seed);
    pos.setXYZ(k, pos.getX(k) * lump, Math.max(0, y) * 0.28 * lump - 0.02, pos.getZ(k) * lump);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) {
    const c = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)];
    const shade = 0.85 + rand() * 0.3;
    for (let k = 0; k < 3; k++) colors.set([c.r * shade, c.g * shade, c.b * shade], (f + k) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);

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
            if (!(y > generator.rivers.seaLevel + 0.5)) continue;
            const s = 0.6 + h(7 + k) * 0.9;
            position.set(lx, y, lz);
            rotation.setFromAxisAngle(up, h(10 + k) * Math.PI * 2);
            scale.set(s, s * (0.7 + 0.6 * h(13 + k)), s * (0.7 + 0.5 * h(16 + k)));
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
