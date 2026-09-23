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
import { faceColor } from '../biomes.js';

/**
 * One tuft: a handful of single-triangle blades leaning out from a small
 * patch. Vertex colours run dark at the root to bright at the tip; the
 * instance colour (the ground colour under the tuft) tints the whole thing
 * so grass always matches the terrain it grows on. Normals point straight
 * up so blades light like the ground, not like thin walls.
 */
function tuftGeometry(blades = 7, seed = 5) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(blades * 9);
  const colors = new Float32Array(blades * 9);
  const normals = new Float32Array(blades * 9);
  for (let b = 0; b < blades; b++) {
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.45;
    const bx = Math.cos(angle) * r;
    const bz = Math.sin(angle) * r;
    const facing = rand() * Math.PI * 2;
    const half = 0.06 + rand() * 0.05;
    const height = 0.4 + rand() * 0.45;
    const lean = 0.1 + rand() * 0.25;
    const o = b * 9;
    positions.set(
      [
        bx + Math.cos(facing) * half, 0, bz + Math.sin(facing) * half,
        bx - Math.cos(facing) * half, 0, bz - Math.sin(facing) * half,
        bx + Math.cos(angle) * lean, height, bz + Math.sin(angle) * lean,
      ],
      o,
    );
    colors.set([0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 1.22, 1.22, 1.22], o);
    normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0], o);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);
const color = new Color();
const surface = { normalY: 1 };

/**
 * Grass tufts on the chunks right around the player (LOD `grassMaxLod`).
 * They sway in the wind and shrink away with distance (`grassFade`), so
 * the edge of the grassy area is never visible.
 */
export function createGrassLayer(config) {
  const geometry = tuftGeometry();
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  // Double-sided materials flip the normal on back faces, which would turn
  // the far side of every blade black. Undo the flip: both sides face up.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif',
    );
  };
  addWind(material, {
    strength: 0.25,
    speed: 1.9,
    fade: config.grassFade,
  });

  const layer = {
    name: 'grass',
    material,
    count: 0,

    build({ cx, cz, lod, groundHeightAt, generator }) {
      if (lod > config.grassMaxLod) return null;
      const { chunkSize, grassSpacing, seaLevel } = config;
      const cells = Math.round(chunkSize / grassSpacing);
      const spacing = chunkSize / cells;
      const originX = cx * chunkSize;
      const originZ = cz * chunkSize;
      const seed = generator.seed ^ 0x1b873593;

      const matrices = new Float32Array(cells * cells * 16);
      const colors = new Float32Array(cells * cells * 3);
      let count = 0;
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i;
          const gj = cz * cells + j;
          const lx = (i + hash2(gi, gj, seed + 1)) * spacing;
          const lz = (j + hash2(gi, gj, seed + 2)) * spacing;
          const wx = originX + lx;
          const wz = originZ + lz;
          if (hash2(gi, gj, seed) > generator.getGrassDensity(wx, wz)) continue;

          const ground = groundHeightAt(lx, lz, surface);
          if (!(ground >= seaLevel + 3.5) || surface.normalY < 0.8) continue; // also skips cave mouths
          if (generator.caves?.field.nearEntrance(wx, wz, 0.6)) continue; // nor under an entrance's ledge

          // Only where the ground itself is green (not sand, rock or snow).
          const colourHeight = ground + generator.getColorJitter(wx, wz);
          if (colourHeight < 6 || colourHeight > 100) continue;

          faceColor(generator.getBiome(wx, wz), colourHeight, surface.normalY, color);
          const v = 0.9 + hash2(gi, gj, seed + 3) * 0.22;
          colors.set([color.r * v, color.g * v, color.b * v], count * 3);

          const s = 0.7 + hash2(gi, gj, seed + 4) * 0.7;
          position.set(lx, ground - 0.05, lz);
          rotation.setFromAxisAngle(up, hash2(gi, gj, seed + 5) * Math.PI * 2);
          scale.set(s, s * (0.8 + hash2(gi, gj, seed + 6) * 0.5), s);
          matrix.compose(position, rotation, scale).toArray(matrices, count * 16);
          count++;
        }
      }
      if (count === 0) return null;

      const mesh = new InstancedMesh(geometry, material, count);
      mesh.name = 'grass';
      mesh.instanceMatrix.array.set(matrices.subarray(0, count * 16));
      mesh.instanceColor = new InstancedBufferAttribute(colors.slice(0, count * 3), 3);
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true; // lies in the shade of trees and hills
      mesh.userData.count = count;
      layer.count += count;
      return mesh;
    },

    dispose(mesh) {
      layer.count -= mesh.userData.count;
      mesh.dispose();
    },
  };
  return layer;
}
