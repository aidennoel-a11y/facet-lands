import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { hash2, mulberry32 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';

const STEM_LOW = new Color(0x4d6b2f);
const STEM_HIGH = new Color(0x9caf5a);
const HEAD = new Color(0x6b4428); // cattail heads

/**
 * One clump of reeds: tall, thin, slightly leaning blades (each a narrow
 * triangle), a few topped with a brown cattail head.
 */
function reedGeometry(seed = 7) {
  const rand = mulberry32(seed);
  const positions = [];
  const colors = [];
  const normals = [];
  const tri = (a, b, c, ca, cb, cc) => {
    positions.push(...a, ...b, ...c);
    colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  };
  for (let k = 0; k < 11; k++) {
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.5;
    const bx = Math.cos(angle) * r, bz = Math.sin(angle) * r;
    const facing = rand() * Math.PI * 2;
    const half = 0.035 + rand() * 0.03;
    const height = 1.3 + rand() * 1.0;
    const lean = 0.05 + rand() * 0.25;
    const tx = bx + Math.cos(angle) * lean, tz = bz + Math.sin(angle) * lean;
    const fx = Math.cos(facing) * half, fz = Math.sin(facing) * half;
    tri([bx + fx, 0, bz + fz], [bx - fx, 0, bz - fz], [tx, height, tz], STEM_LOW, STEM_LOW, STEM_HIGH);
    if (rand() < 0.35) {
      // A cattail: a small brown spindle just below the tip.
      const y0 = height * 0.72, y1 = height * 0.9, w = 0.07;
      const px = bx + (tx - bx) * 0.8, pz = bz + (tz - bz) * 0.8;
      for (const [ox, oz] of [[w, 0], [0, w], [-w, 0], [0, -w]]) {
        tri([px + ox, y0, pz + oz], [px - oz, y0, pz + ox], [px, y1, pz], HEAD, HEAD, HEAD);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return g;
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);

/**
 * Reeds along river banks and lake edges, in clumps on the mud at the
 * water's edge (and a little way into the shallows), on the chunks near you. They sway in the
 * wind like the grass.
 */
export function createReedLayer(config) {
  const geometry = reedGeometry();
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

    build({ cx, cz, lod, groundHeightAt, generator, heights }) {
      if (lod > 1 || !generator.rivers) return null;
      const size = config.chunkSize;
      const x0 = cx * size, z0 = cz * size;
      const sea = config.seaLevel;
      let low = Infinity;
      for (const y of heights.gridY) low = Math.min(low, y);
      const shoreline = low < sea + 0.5; // a lake or sea edge runs through
      if (!shoreline && !generator.rivers.inBox(x0, z0, x0 + size, z0 + size).length) return null;
      const seed = generator.seed ^ 0x2f1b3c77;
      const spacing = 1.6;
      const cells = Math.round(size / spacing);
      const step = size / cells;
      const matrices = [];
      const shades = [];
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i, gj = cz * cells + j;
          const lx = (i + hash2(gi, gj, seed + 1)) * step;
          const lz = (j + hash2(gi, gj, seed + 2)) * step;
          const wx = x0 + lx, wz = z0 + lz;
          const river = generator.rivers.at(wx, wz, 2.2);
          if (!river) {
            // Lake edges: in patches along the muddy water line (not the sea).
            if (!shoreline) continue;
            const ground = groundHeightAt(lx, lz);
            // In wetlands reeds crowd the pools and channels, out into the
            // shallows and up over the wet ground.
            if (!(ground > sea - 1.1 && ground < sea + 1.3)) continue;
            const marsh = generator.getBiomeWeights(wx, wz, {}).wetland;
            if (!(ground > sea - 0.7 - 0.4 * marsh && ground < sea + 0.45 + 0.8 * marsh)) continue;
            const shore = generator.getShore(wx, wz, ground);
            if (!shore || shore.ocean) continue;
            const patch = 0.5 + 0.5 * Math.sin(wx * 0.07 + Math.sin(wz * 0.05) * 3);
            if (hash2(gi, gj, seed) > patch * (0.8 + 0.5 * marsh) - 0.15 + 0.2 * marsh) continue;
            const s = 0.8 + hash2(gi, gj, seed + 3) * 0.55;
            position.set(lx, ground - 0.1, lz);
            rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 4) * Math.PI * 2);
            scale.set(s, s * (0.85 + hash2(gi, gj, seed + 5) * 0.4), s);
            matrices.push(matrix.compose(position, rotation, scale).clone());
            shades.push(0.85 + hash2(gi, gj, seed + 6) * 0.3);
            continue;
          }
          if (river.stream && generator.getMountainness(wx, wz) > 0.3) continue; // mountain streams: gravel, no reeds
          const e = river.d - river.water; // from the water's edge: negative in the water
          if (e < -Math.min(1.2, river.water * 0.6)) continue;
          // In patches, thickest right at the edge.
          const patch = 0.5 + 0.5 * Math.sin(wx * 0.09 + Math.sin(wz * 0.07) * 3);
          if (hash2(gi, gj, seed) > patch * (1 - Math.abs(e + 0.2) / 2.4)) continue;
          const ground = groundHeightAt(lx, lz);
          if (!Number.isFinite(ground)) continue;
          const s = 0.75 + hash2(gi, gj, seed + 3) * 0.5;
          position.set(lx, Math.min(ground, river.level + 0.1) - 0.1, lz);
          rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 4) * Math.PI * 2);
          scale.set(s, s * (0.85 + hash2(gi, gj, seed + 5) * 0.4), s);
          matrices.push(matrix.compose(position, rotation, scale).clone());
          shades.push(0.85 + hash2(gi, gj, seed + 6) * 0.3);
        }
      }
      if (!matrices.length) return null;
      const mesh = new InstancedMesh(geometry, material, matrices.length);
      mesh.name = 'reeds';
      matrices.forEach((m, k) => mesh.setMatrixAt(k, m));
      const colours = new Float32Array(matrices.length * 3);
      shades.forEach((v, k) => colours.set([v, v, v], k * 3));
      mesh.instanceColor = new InstancedBufferAttribute(colours, 3);
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },

    dispose(mesh) {
      mesh.dispose();
    },
  };
}
