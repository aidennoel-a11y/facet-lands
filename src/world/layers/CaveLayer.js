import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, ShaderChunk, Vector3 } from 'three';
import { bonesModel, crystalModel, glowcapModel } from '../../survival/models.js';

/**
 * Cave material: vertex-coloured rock whose *daylight* (sun, moon and sky
 * ambient) is scaled by the per-vertex `skyLight` value, so caves get
 * darker the further you are from an entrance. Point lights (torches) are
 * left untouched, so a torch lights a deep cave just as brightly as the mouth.
 */
/** Night vision (testing): 1 lifts the cave darkening completely. */
export const caveNightVision = { value: 0 };

function caveMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const lights = ShaderChunk.lights_fragment_begin.replace(
    '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
    'vec3 caveBeforeSky = reflectedLight.directDiffuse;\n#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
  );
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightVision = caveNightVision;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skyLight;\nvarying float vSkyLight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyLight = skyLight;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkyLight;\nuniform float uNightVision;')
      .replace(
        '#include <lights_fragment_begin>',
        `${lights}
        float caveSky = max(vSkyLight, uNightVision);
        reflectedLight.directDiffuse = caveBeforeSky + (reflectedLight.directDiffuse - caveBeforeSky) * caveSky;
        irradiance *= caveSky;`,
      );
  };
  material.customProgramCacheKey = () => 'cave';
  return material;
}

/**
 * Adds cave rock (and stalagmites / stalactites) to the chunks near the
 * player, up to `caveMaxLod`. The meshes come from the cave system, which
 * builds them from the procedural cave field on a background worker and
 * keeps them cached, so a chunk changing detail level reuses them.
 */
export function createCaveLayer(config) {
  const material = caveMaterial();
  // The cave finds that are only to look at: crystals and glowcaps giving
  // their own soft light, and old bones (dim, as everything is down there).
  const glow = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  const bone = new MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0x4a4a4a });
  const shapes = { 2: crystalModel(), 3: glowcapModel(), 4: bonesModel() };
  const tints = { 2: [0x7fe0ff, 0xc08aff, 0x9affd8], 3: [0x7affc8, 0x8ad8ff] };
  const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), up = new Vector3(0, 1, 0), c = new Color();
  const finds = (features, x0, z0) => {
    const out = [];
    for (const kind of [2, 3, 4]) {
      const list = [];
      for (let k = 0; k < features.length; k += 6) if (features[k] === kind) list.push(k);
      if (!list.length) continue;
      const mesh = new InstancedMesh(shapes[kind], kind === 4 ? bone : glow, list.length);
      list.forEach((k, n) => {
        mesh.setMatrixAt(n, m4.compose(p.set(features[k + 1] - x0, features[k + 2] - 0.05, features[k + 3] - z0), q.setFromAxisAngle(up, features[k + 4]), s.setScalar(features[k + 5])));
        if (tints[kind]) mesh.setColorAt(n, c.set(tints[kind][Math.floor(features[k + 4] * 10) % tints[kind].length]));
      });
      mesh.computeBoundingSphere();
      mesh.name = 'cave finds';
      out.push(mesh);
    }
    return out;
  };

  const layer = {
    name: 'caves',
    material,
    onFinds: null, // (cx, cz, features, group): the iron ore, to pick up (see GroundItems.addCave)
    onGone: null,

    reuseKey: ({ lod }) => (lod > config.caveMaxLod ? 'none' : 'caves'),

    build({ cx, cz, lod, generator }) {
      if (lod > config.caveMaxLod || !generator.caves) return null;
      const caves = generator.caves;
      const entry = caves.chunk(cx, cz, true);
      const group = new Group();
      group.name = 'caves';
      group.userData.chunk = [cx, cz];
      group.userData.caves = caves;
      // From the surface only chunks with a mouth can show any cave (see ChunkManager.setVisibility).
      const size = config.chunkSize;
      group.userData.hasMouth = caves
        .mouthsNear(cx * size - 16, cz * size - 16, (cx + 1) * size + 16, (cz + 1) * size + 16)
        .some((e) => e.mouth.x > cx * size - 16 && e.mouth.x < (cx + 1) * size + 16 && e.mouth.z > cz * size - 16 && e.mouth.z < (cz + 1) * size + 16);
      // Caves are built on a background worker; add them when they arrive.
      caves.whenReady(entry, (data) => {
        if (group.userData.disposed) return;
        if (data.rock) {
          const rock = new Mesh(data.rock, material);
          rock.name = 'cave rock';
          rock.castShadow = false; // (underground: the land over it already shades it from the sun)
          rock.receiveShadow = true;
          rock.userData.solid = true; // torches can be placed on it
          group.add(rock);
        }
        if (data.features?.length) {
          for (const mesh of finds(data.features, cx * size, cz * size)) group.add(mesh);
          layer.onFinds?.(cx, cz, data.features, group);
        }
        if (data.deco) {
          const stones = new Mesh(data.deco, material);
          stones.name = 'cave stalagmites';
          stones.castShadow = false;
          stones.receiveShadow = true;
          stones.userData.solid = true;
          group.add(stones);
        }
      });
      return group;
    },

    dispose(group) {
      // Geometry belongs to the cave system's cache; just let it know we're done.
      group.userData.disposed = true;
      const [cx, cz] = group.userData.chunk;
      for (const mesh of group.children) if (mesh.isInstancedMesh) mesh.dispose();
      layer.onGone?.(cx, cz);
      group.userData.caves.release(cx, cz);
    },
  };
  return layer;
}
