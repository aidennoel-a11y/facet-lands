import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial } from 'three';
import { mulberry32 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';
import { seasonalGrass } from '../../render/Seasons.js';
import { placeGrass } from '../grassPlacement.js';

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
  seasonalGrass(material);

  const layer = {
    name: 'grass',
    material,
    count: 0,

    reuseKey: ({ lod, resolution }) => (lod > config.grassMaxLod ? 'none' : `${resolution}`),

    build({ cx, cz, lod, groundHeightAt, generator, prepared }) {
      if (lod > config.grassMaxLod) return null;
      const placed = prepared?.grass ?? placeGrass(generator, config, cx, cz, groundHeightAt);
      const { matrices, colors, count } = placed;
      if (count === 0) return null;

      const mesh = new InstancedMesh(geometry, material, count);
      mesh.name = 'grass';
      mesh.instanceMatrix.array.set(matrices);
      mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
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
