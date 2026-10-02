import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
} from 'three';
import { mulberry32 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';
import { reedData } from '../reedData.js';

const STEM_LOW = new Color(0x4d6b2f);
const STEM_HIGH = new Color(0x9caf5a);
const HEAD = new Color(0x6b4428); // cattail heads
const SEDGE_LOW = new Color(0x55702e);
const SEDGE_HIGH = new Color(0xa8b860);

/**
 * One clump of reeds: tall, thin, slightly leaning blades (each a narrow
 * triangle), some topped with a brown cattail head (`heads`: how many).
 * Rushes: tall plain stems, no heads. Sedge: low, many, arching blades.
 */
function reedGeometry(seed = 7, { heads = 0.45, blades = 11, tall = [1.3, 1.0], lean = [0.05, 0.25], width = [0.035, 0.03], low = STEM_LOW, high = STEM_HIGH } = {}) {
  const rand = mulberry32(seed);
  const positions = [];
  const colors = [];
  const normals = [];
  const tri = (a, b, c, ca, cb, cc) => {
    positions.push(...a, ...b, ...c);
    colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  };
  for (let k = 0; k < blades; k++) {
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.5;
    const bx = Math.cos(angle) * r, bz = Math.sin(angle) * r;
    const facing = rand() * Math.PI * 2;
    const half = width[0] + rand() * width[1];
    const height = tall[0] + rand() * tall[1];
    const bend = lean[0] + rand() * lean[1];
    const tx = bx + Math.cos(angle) * bend, tz = bz + Math.sin(angle) * bend;
    const fx = Math.cos(facing) * half, fz = Math.sin(facing) * half;
    tri([bx + fx, 0, bz + fz], [bx - fx, 0, bz - fz], [tx, height, tz], low, low, high);
    if (rand() < heads) {
      // A cattail: a fat brown sausage of a head just below the tip, and
      // the thin spike above it.
      const y0 = height * 0.66, y1 = height * 0.86, w = 0.075;
      const at = (y) => [bx + (tx - bx) * (y / height), bz + (tz - bz) * (y / height)];
      const [ax, az] = at(y0), [cx, cz] = at(y1);
      const ring = (x, y, z, r) => Array.from({ length: 6 }, (_, n) => [x + Math.cos((n / 6) * Math.PI * 2) * r, y, z + Math.sin((n / 6) * Math.PI * 2) * r]);
      const lo = ring(ax, y0, az, w), hi = ring(cx, y1, cz, w);
      const bottom = [ax, y0 - 0.04, az], top = [cx, y1 + 0.04, cz];
      for (let n = 0; n < 6; n++) {
        const m = (n + 1) % 6;
        tri(lo[n], lo[m], hi[n], HEAD, HEAD, HEAD);
        tri(hi[n], lo[m], hi[m], HEAD, HEAD, HEAD);
        tri(bottom, lo[m], lo[n], HEAD, HEAD, HEAD);
        tri(top, hi[n], hi[m], HEAD, HEAD, HEAD);
      }
      tri([cx + 0.012, y1, cz], [cx - 0.012, y1, cz], [tx, height + 0.12, tz], STEM_HIGH, STEM_HIGH, STEM_HIGH);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return g;
}


/**
 * Reeds along river banks and lake edges, in clumps on the mud at the
 * water's edge (and a little way into the shallows), on the chunks near you. They sway in the
 * wind like the grass.
 */
export function createReedLayer(config) {
  // Three kinds of clump (see reedData's kinds): cattails, rushes, sedge.
  const geometries = [
    reedGeometry(7),
    reedGeometry(11, { heads: 0, blades: 14, tall: [1.0, 1.1], width: [0.02, 0.02] }),
    reedGeometry(23, { heads: 0, blades: 18, tall: [0.45, 0.45], lean: [0.15, 0.35], width: [0.03, 0.03], low: SEDGE_LOW, high: SEDGE_HIGH }),
  ];
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif',
    );
  };
  addWind(material, { strength: 0.3, speed: 1.6 });

  return {
    name: 'reeds',

    reuseKey: ({ lod, resolution }) => (lod > 1 ? 'none' : `${resolution}`),

    build({ cx, cz, lod, groundHeightAt, generator, heights, prepared }) {
      if (lod > 1 || !generator.rivers) return null;
      // (Worked out by the chunk's worker, or here.)
      const data = prepared && prepared.reeds !== undefined ? prepared.reeds : reedData(generator, config, cx, cz, groundHeightAt, heights);
      if (!data) return null;
      const group = new Group();
      group.name = 'reeds';
      geometries.forEach((geometry, kind) => {
        const which = [];
        data.shades.forEach((_, k) => (data.kinds?.[k] ?? 0) === kind && which.push(k));
        if (!which.length) return;
        const mesh = new InstancedMesh(geometry, material, which.length);
        mesh.name = 'reeds';
        const colours = new Float32Array(which.length * 3);
        which.forEach((k, n) => {
          mesh.instanceMatrix.array.set(data.matrices.subarray(k * 16, k * 16 + 16), n * 16);
          const v = data.shades[k];
          colours.set([v, v, v], n * 3);
        });
        mesh.instanceColor = new InstancedBufferAttribute(colours, 3);
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });
      return group;
    },

    dispose(group) {
      for (const mesh of group.children) mesh.dispose();
    },
  };
}
