import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial, Vector4 } from 'three';
import { mulberry32 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';
import { seasonalGrass } from '../../render/Seasons.js';
import { placeGrass } from '../grassPlacement.js';

/**
 * Spots cleared of grass (x, z, radius, 0): where something stands on the
 * ground (a campfire, a chest, a bed...), the tufts inside shrink away to
 * nothing, so grass never grows up through it. Filled in each moment with
 * what's built near you (see main); unused ones have radius 0.
 */
export const GRASS_CLEARINGS = 24;
export const grassClearings = { value: Array.from({ length: GRASS_CLEARINGS }, () => new Vector4(0, 0, 0, 0)) };

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
 * Tall grass gone to seed (plains, savanna): a few long, thin stalks, each
 * topped with a pale seed head.
 */
function tallGeometry(seed = 9) {
  const rand = mulberry32(seed);
  const pos = [], col = [], nor = [];
  const blade = (a, b, c, ca, cb, cc) => {
    pos.push(...a, ...b, ...c);
    col.push(...ca, ...cb, ...cc);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  };
  for (let k = 0; k < 6; k++) {
    const angle = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.3;
    const bx = Math.cos(angle) * r, bz = Math.sin(angle) * r;
    const facing = rand() * Math.PI * 2, half = 0.03 + rand() * 0.02;
    const h = 0.9 + rand() * 0.6, lean = 0.1 + rand() * 0.25;
    const tx = bx + Math.cos(angle) * lean, tz = bz + Math.sin(angle) * lean;
    const dark = [0.6, 0.6, 0.6], bright = [1.2, 1.2, 1.2], seedHead = [1.55, 1.42, 1.05];
    blade([bx + Math.cos(facing) * half, 0, bz + Math.sin(facing) * half], [bx - Math.cos(facing) * half, 0, bz - Math.sin(facing) * half], [tx, h, tz], dark, dark, bright);
    // The seed head: a narrow spindle at the top.
    const hx = tx + Math.cos(angle) * 0.04, hz = tz + Math.sin(angle) * 0.04;
    blade([tx + Math.cos(facing) * 0.04, h - 0.18, tz + Math.sin(facing) * 0.04], [tx - Math.cos(facing) * 0.04, h - 0.18, tz - Math.sin(facing) * 0.04], [hx, h + 0.12, hz], seedHead, seedHead, seedHead);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  return g;
}

/**
 * Grass tufts on the chunks right around the player (LOD `grassMaxLod`).
 * They sway in the wind and shrink away with distance (`grassFade`), so
 * the edge of the grassy area is never visible.
 */
export function createGrassLayer(config) {
  // Ordinary tufts, tall seeding stalks, and broad, many-bladed clumps.
  const geometries = [tuftGeometry(), tallGeometry(), tuftGeometry(14, 23)];
  geometries[2].scale(1.6, 0.8, 1.6);
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  // Double-sided materials flip the normal on back faces, which would turn
  // the far side of every blade black. Undo the flip: both sides face up.
  // (And as a gust rolls over it, the grass lies over and shows paler.)
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 + 0.2 * vGust;');
  };
  addWind(material, {
    strength: 0.25,
    speed: 1.9,
    fade: config.grassFade,
    gust: 0.3,
  });
  seasonalGrass(material);
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uClearings = grassClearings;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uClearings[${GRASS_CLEARINGS}];`)
      .replace(
        '#include <project_vertex>',
        /* glsl */ `{
          vec2 tuft = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          float keep = 1.0;
          for (int i = 0; i < ${GRASS_CLEARINGS}; i++) {
            vec4 c = uClearings[i];
            if (c.z > 0.0) keep = min(keep, smoothstep(c.z * 0.85, c.z + 0.35, distance(tuft, c.xy)));
          }
          transformed *= keep;
        }
        #include <project_vertex>`,
      );
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|clearings`;

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
      const kinds = placed.kinds ?? new Uint8Array(count);
      // Sorted into one instanced mesh per kind.
      const meshes = geometries.map((geometry, kind) => {
        let n = 0;
        for (let k = 0; k < count; k++) if (kinds[k] === kind) n++;
        if (!n) return null;
        const m = new Float32Array(n * 16), c = new Float32Array(n * 3);
        let at = 0;
        for (let k = 0; k < count; k++) {
          if (kinds[k] !== kind) continue;
          m.set(matrices.subarray(k * 16, k * 16 + 16), at * 16);
          c.set(colors.subarray(k * 3, k * 3 + 3), at * 3);
          at++;
        }
        const mesh = new InstancedMesh(geometry, material, n);
        mesh.name = 'grass';
        mesh.instanceMatrix.array.set(m);
        mesh.instanceColor = new InstancedBufferAttribute(c, 3);
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true; // lies in the shade of trees and hills
        return mesh;
      }).filter(Boolean);
      const root = meshes[0];
      for (const m of meshes.slice(1)) root.add(m);
      root.userData.count = count;
      layer.count += count;
      return root;
    },

    dispose(mesh) {
      layer.count -= mesh.userData.count;
      for (const child of mesh.children) child.dispose();
      mesh.dispose();
    },
  };
  return layer;
}
