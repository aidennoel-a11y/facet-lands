import { BufferAttribute, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../../noise/random.js';
import { seasonUniforms } from '../../render/Seasons.js';

const tint = new Color();

// A mushroom's part, coloured (a shade darker underneath), for merging.
function piece(g, color, [x, y, z] = [0, 0, 0]) {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  geo.translate(x, y, z);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k += 3) {
    const low = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3 < y ? 0.8 : 1;
    tint.set(color).multiplyScalar(low);
    for (let v = 0; v < 3; v++) col.set([tint.r, tint.g, tint.b], (k + v) * 3);
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  return geo;
}

// A cap: a low faceted dome (base at y = 0).
function cap(r, h, segments = 7) {
  const g = new SphereGeometry(r, segments, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, h / r, 1);
  return g;
}

function merge(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

// Their kinds (base on the ground, about 10 to 20 cm tall at scale 1).
const KINDS = {
  // Fly agaric: a scarlet cap flecked with white, on a white stem.
  agaric: () =>
    merge([
      piece(new CylinderGeometry(0.018, 0.026, 0.14, 6), 0xf0ece0, [0, 0.07, 0]),
      piece(cap(0.075, 0.045), 0xc8281c, [0, 0.13, 0]),
      ...[[0.03, 0.02], [-0.035, 0.01], [0.005, -0.04], [-0.01, 0.035], [0.04, -0.03]].map(([x, z]) => piece(new ConeGeometry(0.009, 0.01, 4), 0xf8f4ea, [x, 0.168 - Math.hypot(x, z) * 0.5, z])),
    ]),
  // A bolete: a fat stem and a broad brown cap.
  bolete: () =>
    merge([
      piece(new CylinderGeometry(0.028, 0.04, 0.09, 6), 0xd8caa8, [0, 0.045, 0]),
      piece(cap(0.07, 0.05), 0x7a4a26, [0, 0.085, 0]),
    ]),
  // Little tan toadstools, in a clump (and in the fairy rings).
  tan: () =>
    merge([
      piece(new CylinderGeometry(0.008, 0.011, 0.1, 5), 0xe8dcc0, [0, 0.05, 0]),
      piece(cap(0.03, 0.022, 6), 0xc49a60, [0, 0.098, 0]),
      piece(new CylinderGeometry(0.007, 0.01, 0.07, 5), 0xe8dcc0, [0.04, 0.035, 0.015]),
      piece(cap(0.024, 0.018, 6), 0xb88a50, [0.04, 0.068, 0.015]),
      piece(new CylinderGeometry(0.007, 0.01, 0.085, 5), 0xe8dcc0, [-0.02, 0.042, 0.035]),
      piece(cap(0.026, 0.02, 6), 0xcca468, [-0.02, 0.083, 0.035]),
    ]),
};
const KIND_NAMES = Object.keys(KINDS);

const matrix = new Matrix4(), position = new Vector3(), rotation = new Quaternion(), scale = new Vector3(), up = new Vector3(0, 1, 0);

/**
 * Mushrooms: clumps of them at the feet of the trees in the damp woods,
 * and here and there a fairy ring out on the grass. They come up in the
 * autumn (and after rain, the rest of the year but winter), each at its
 * own time. On the chunks near you.
 */
export function createMushroomLayer() {
  const shapes = KIND_NAMES.map((k) => KINDS[k]());
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seasonUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uAutumn;\nuniform float uWet;\nuniform float uWinter;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          float season = max(uAutumn, 0.6 * uWet) * (1.0 - smoothstep(0.3, 0.7, uWinter));
          #ifdef USE_INSTANCING
            float when = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 0.6;
          #else
            float when = 0.3;
          #endif
          transformed *= smoothstep(when, when + 0.2, season);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'mushrooms';

  return {
    name: 'mushrooms',
    material,

    reuseKey: ({ lod }) => (lod > 0 ? 'none' : 'near'),

    build({ cx, cz, lod, prepared, groundHeightAt, generator, config }) {
      if (lod > 0 || !prepared?.trees) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      const seed = generator.seed ^ 0x5f00d;
      const placed = shapes.map(() => []);
      const surface = { normalY: 1 };
      const put = (kind, lx, lz, s, turn) => {
        if (lx < 0 || lz < 0 || lx >= size || lz >= size) return;
        const y = groundHeightAt(lx, lz, surface);
        if (!(y > sea + 0.6) || surface.normalY < 0.75) return;
        position.set(lx, y - 0.01, lz);
        rotation.setFromAxisAngle(up, turn);
        placed[kind].push(matrix.compose(position, rotation, scale.set(s, s * (0.85 + 0.3 * (turn % 1)), s)).clone());
      };
      // In the damp woods: a clump by the foot of about one tree in six.
      const w = generator.getBiomeWeights(x0 + size / 2, z0 + size / 2, {});
      const damp = 1 - w.desert - w.savanna - w.volcanic;
      if (damp > 0.4) {
        for (const list of Object.values(prepared.trees)) {
          for (const t of list) {
            const h = (n) => hash2(Math.floor(t.x * 10) + cx * 1300, Math.floor(t.z * 10) + cz * 1300, seed + n);
            if (h(0) > 0.17 * damp) continue;
            // (Fly agaric by the birches and pines; boletes and toadstools anywhere.)
            const kind = h(1) < 0.3 ? 0 : h(1) < 0.6 ? 1 : 2;
            const n = 2 + Math.floor(h(2) * 5);
            const a0 = h(3) * Math.PI * 2, d0 = 0.7 + h(4) * 1.6 * t.s;
            const bx = t.x + Math.cos(a0) * d0, bz = t.z + Math.sin(a0) * d0;
            for (let k = 0; k < n; k++) {
              const a = h(5 + k) * Math.PI * 2, d = h(12 + k) * 0.5;
              put(kind, bx + Math.cos(a) * d, bz + Math.sin(a) * d, 1.1 + h(19 + k) * 0.9, h(26 + k) * Math.PI * 2);
            }
          }
        }
      }
      // A fairy ring, out on the grass, in about one chunk in eight.
      const green = w.temperate + w.smoky + w.pine;
      if (green > 0.6 && hash2(cx, cz, seed + 40) < 0.13) {
        const rx = size * (0.2 + 0.6 * hash2(cx, cz, seed + 41)), rz = size * (0.2 + 0.6 * hash2(cx, cz, seed + 42));
        if (generator.getForestDensity(x0 + rx, z0 + rz) < 0.4) {
          const r = 1.8 + hash2(cx, cz, seed + 43) * 3.5, n = Math.round(r * 4.5);
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + hash2(cx + k, cz, seed + 44) * 0.2;
            const d = r * (0.94 + 0.12 * hash2(cx, cz + k, seed + 45));
            put(2, rx + Math.cos(a) * d, rz + Math.sin(a) * d, 1.2 + hash2(cx + k, cz + k, seed + 46) * 0.6, a * 3.7);
          }
        }
      }
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'mushrooms';
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
