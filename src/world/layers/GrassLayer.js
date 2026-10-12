import { BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial, Vector4 } from 'three';
import { mulberry32 } from '../../noise/random.js';
import { addWind } from '../../render/wind.js';
import { seasonalGrass } from '../../render/Seasons.js';
import { placeGrass } from '../grassPlacement.js';
import { cloudShadowUniforms } from '../../render/cloudShadow.js';
import { cutUniforms } from '../../render/grassCut.js';

/**
 * Spots cleared of grass (x, z, radius, 0): where something stands on the
 * ground (a campfire, a chest, a bed...), the tufts inside shrink away to
 * nothing, so grass never grows up through it. Filled in each moment with
 * what's built near you (see main); unused ones have radius 0.
 */
export const GRASS_CLEARINGS = 64;
export const grassClearings = { value: Array.from({ length: GRASS_CLEARINGS }, () => new Vector4(0, 0, 0, 0)) };

/**
 * What's pushing through the grass (x, z, radius, 0): you, and the bigger
 * animals near you. The tufts round each bend away from it and lie over
 * (see main, which fills these in each moment; unused ones radius 0).
 */
export const GRASS_PUSHERS = 12;
export const grassPushers = { value: Array.from({ length: GRASS_PUSHERS }, () => new Vector4(0, 0, 0, 0)) };

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
 * Sedge: a stiff, upright fan of long, narrow blades, a deep green, by
 * the water and in the marshes.
 */
function sedgeGeometry(seed = 31) {
  const rand = mulberry32(seed);
  const pos = [], col = [], nor = [];
  for (let k = 0; k < 9; k++) {
    const angle = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.18;
    const bx = Math.cos(angle) * r, bz = Math.sin(angle) * r;
    const facing = rand() * Math.PI * 2, half = 0.025 + rand() * 0.02;
    const h = 0.75 + rand() * 0.55, lean = 0.08 + rand() * 0.22;
    pos.push(bx + Math.cos(facing) * half, 0, bz + Math.sin(facing) * half, bx - Math.cos(facing) * half, 0, bz - Math.sin(facing) * half, bx + Math.cos(angle) * lean, h, bz + Math.sin(angle) * lean);
    col.push(0.5, 0.58, 0.48, 0.5, 0.58, 0.48, 0.95, 1.12, 0.85);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  return g;
}

/**
 * Fine grass: a low, soft spray of many thin, arching blades whose tips
 * have turned straw-gold.
 */
function fineGeometry(seed = 41) {
  const rand = mulberry32(seed);
  const pos = [], col = [], nor = [];
  for (let k = 0; k < 10; k++) {
    const angle = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.4;
    const bx = Math.cos(angle) * r, bz = Math.sin(angle) * r;
    const facing = rand() * Math.PI * 2, half = 0.02 + rand() * 0.02;
    const h = 0.3 + rand() * 0.3, lean = 0.2 + rand() * 0.3;
    pos.push(bx + Math.cos(facing) * half, 0, bz + Math.sin(facing) * half, bx - Math.cos(facing) * half, 0, bz - Math.sin(facing) * half, bx + Math.cos(angle) * (r + lean), h, bz + Math.sin(angle) * (r + lean));
    col.push(0.65, 0.65, 0.6, 0.65, 0.65, 0.6, 1.45, 1.32, 0.78);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
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
export function createGrassLayer(config, { far = false } = {}) {
  // (The far grass: the same tufts, sparser and bigger, out to the next
  // ring of chunks: see placeGrass.)
  const maxLod = far ? config.farGrassMaxLod : config.grassMaxLod;
  // Ordinary tufts, tall seeding stalks, broad, many-bladed clumps, sedges
  // and fine golden grass.
  const geometries = [tuftGeometry(), tallGeometry(), tuftGeometry(10, 23), sedgeGeometry(), fineGeometry()];
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
    fade: far ? config.farGrassFade : config.grassFade,
    gust: 0.3,
  });
  seasonalGrass(material);
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uClearings = grassClearings;
    shader.uniforms.uPushers = grassPushers;
    shader.uniforms.uBurnMap = cloudShadowUniforms.uBurnMap;
    shader.uniforms.uBurnOrigin = cloudShadowUniforms.uBurnOrigin;
    shader.uniforms.uBurnSize = cloudShadowUniforms.uBurnSize;
    Object.assign(shader.uniforms, cutUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uClearings[${GRASS_CLEARINGS}];\nuniform vec4 uPushers[${GRASS_PUSHERS}];\nuniform sampler2D uBurnMap;\nuniform vec2 uBurnOrigin;\nuniform float uBurnSize;\nuniform sampler2D uCutMap;\nuniform vec2 uCutOrigin;\nuniform float uCutSize;\nvarying float vBurnt;`)
      .replace(
        '#include <project_vertex>',
        /* glsl */ `{
          vec2 tuft = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          float keep = 1.0;
          for (int i = 0; i < ${GRASS_CLEARINGS}; i++) {
            vec4 c = uClearings[i];
            if (c.z <= 0.0) break; // (they're packed at the front: the first empty one ends them)
            keep = min(keep, smoothstep(c.z * 0.85, c.z + 0.35, distance(tuft, c.xy)));
          }
          // Bent away from whatever is pushing through it (the bend in the
          // tuft's own frame: the push turned back through its rotation).
          vec2 push = vec2(0.0);
          for (int i = 0; i < ${GRASS_PUSHERS}; i++) {
            vec4 q = uPushers[i];
            if (q.z <= 0.0) break;
            vec2 off = tuft - q.xy;
            float d = length(off);
            float f = 1.0 - smoothstep(q.z * 0.4, q.z * 1.6, d);
            if (f > 0.0) push += (off / max(d, 0.05)) * f;
          }
          float pushed = min(1.0, length(push));
          if (pushed > 0.0) {
            vec3 local = transpose(mat3(instanceMatrix)) * vec3(push.x, 0.0, push.y);
            vec2 lp = normalize(local.xz) * pushed;
            transformed.xz += lp * transformed.y * 0.9;
            transformed.y *= 1.0 - 0.45 * pushed;
          }
          // Burnt: most of it gone, the rest charred black stubble. Cut with a sickle: stubble.
          vec2 buv = (tuft - uBurnOrigin) / uBurnSize;
          float burnt = (buv.x > 0.0 && buv.y > 0.0 && buv.x < 1.0 && buv.y < 1.0) ? smoothstep(0.35, 0.8, texture2D(uBurnMap, buv).r) : 0.0;
          float spared = step(0.8, fract(sin(dot(floor(tuft * 3.0), vec2(12.9898, 78.233))) * 43758.5453));
          keep *= mix(1.0, spared * 0.35, burnt);
          vBurnt = burnt;
          vec2 cuv = (tuft - uCutOrigin) / uCutSize;
          float cut = (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) ? texture2D(uCutMap, cuv).r : 0.0;
          transformed.y *= 1.0 - 0.85 * cut;
          transformed *= keep;
        }
        #include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBurnt;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.045, 0.04), vBurnt);');
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|clearings-push-burn-cut`;

  const layer = {
    name: far ? 'farGrass' : 'grass',
    material,
    count: 0,

    reuseKey: ({ lod, resolution }) => (lod > maxLod ? 'none' : `${resolution}`),

    build({ cx, cz, lod, groundHeightAt, generator, prepared }) {
      if (lod > maxLod) return null;
      const placed = (far ? prepared?.farGrass : prepared?.grass) ?? placeGrass(generator, config, cx, cz, groundHeightAt, far);
      const { matrices, colors, count } = placed;
      if (count === 0) return null;
      const kinds = placed.kinds ?? new Uint8Array(count);
      // Sorted into one instanced mesh per kind.
      const meshes = geometries.map((geometry, kind) => {
        let n = 0;
        for (let k = 0; k < count; k++) if (kinds[k] === kind) n++;
        if (!n) return null;
        const m = new Float32Array(n * 16), c = new Float32Array(n * 3), w = new Float32Array(n);
        let at = 0;
        for (let k = 0; k < count; k++) {
          if (kinds[k] !== kind) continue;
          m.set(matrices.subarray(k * 16, k * 16 + 16), at * 16);
          c.set(colors.subarray(k * 3, k * 3 + 3), at * 3);
          w[at] = placed.warms?.[k] ?? 0;
          at++;
        }
        // (Its own copy of the blade, a handful of triangles, to carry each
        // tuft's warmth: in and near the jungle, no autumn, no winter.)
        const blade = geometry.clone();
        blade.setAttribute('aWarm', new InstancedBufferAttribute(w, 1));
        const mesh = new InstancedMesh(blade, material, n);
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
      for (const child of mesh.children) child.geometry.dispose(), child.dispose();
      mesh.geometry.dispose();
      mesh.dispose();
    },
  };
  return layer;
}
