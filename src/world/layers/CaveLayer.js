import {
  BufferAttribute,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  ShaderChunk,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Cave material: vertex-coloured rock whose *daylight* (sun, moon and sky
 * ambient) is scaled by the per-vertex `skyLight` value, so tunnels get
 * darker the deeper you go. Point lights (torches) are left untouched, so
 * a torch lights a deep cave just as brightly as the mouth.
 */
function caveMaterial() {
  // Front faces only: the tunnel is only ever seen from inside, and anything
  // poking out of a hillside stays invisible from outside.
  const material = new MeshLambertMaterial({ vertexColors: true });
  const lights = ShaderChunk.lights_fragment_begin.replace(
    '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
    'vec3 caveBeforeSky = reflectedLight.directDiffuse;\n#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
  );
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skyLight;\nvarying float vSkyLight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyLight = skyLight;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkyLight;')
      .replace(
        '#include <lights_fragment_begin>',
        `${lights}
        reflectedLight.directDiffuse = caveBeforeSky + (reflectedLight.directDiffuse - caveBeforeSky) * vSkyLight;
        irradiance *= vSkyLight;`,
      );
  };
  material.customProgramCacheKey = () => 'cave';
  return material;
}

/** Merged glowing crystal clusters for one cave (world coordinates). */
function crystalGeometry(crystals) {
  const parts = [];
  const up = new Vector3(0, 1, 0);
  for (const c of crystals) {
    for (let k = 0; k < 3; k++) {
      const g = new OctahedronGeometry(c.size * (0.5 + k * 0.25), 0);
      g.scale(0.35, 1.4, 0.35);
      g.rotateZ((k - 1) * 0.5);
      // Point the cluster out of the wall.
      g.applyQuaternion(new Quaternion().setFromUnitVectors(up, c.dir));
      g.translate(c.x + (k - 1) * 0.25, c.y, c.z + (k - 1) * 0.2);
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      const count = g.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const col = new Color(c.hex);
      for (let i = 0; i < count; i++) {
        const shade = 0.75 + (Math.floor(i / 3) % 3) * 0.15; // facet shading
        colors.set([col.r * shade, col.g * shade, col.b * shade], i * 3);
      }
      g.setAttribute('color', new BufferAttribute(colors, 3));
      parts.push(g.index ? g.toNonIndexed() : g);
    }
  }
  return parts.length ? mergeGeometries(parts) : null;
}

/**
 * Adds cave tunnels to the chunk that holds each cave's entrance, for
 * chunks up to `caveMaxLod` (the ones with full-detail terrain, which is
 * where the mouths are cut).
 */
export function createCaveLayer(config) {
  const material = caveMaterial();
  const crystalMaterial = new MeshBasicMaterial({ vertexColors: true });
  const crystalCache = new WeakMap();

  const layer = {
    name: 'caves',
    material,
    crystalMaterial,

    build({ cx, cz, lod, generator }) {
      if (lod > config.caveMaxLod || !generator.caves) return null;
      const size = config.chunkSize;
      const x0 = cx * size;
      const z0 = cz * size;
      const caves = generator.caves
        .near(x0, z0, x0 + size, z0 + size)
        .filter((c) => c.entrance.x >= x0 && c.entrance.x < x0 + size && c.entrance.z >= z0 && c.entrance.z < z0 + size);
      if (!caves.length) return null;

      const group = new Group();
      group.name = 'caves';
      group.position.set(-x0, 0, -z0); // cave geometry is in world space
      for (const cave of caves) {
        const geometry = generator.caves.geometry(cave);
        const mesh = new Mesh(geometry, material);
        mesh.name = `cave ${cave.id}`;
        mesh.receiveShadow = true;
        mesh.userData.solid = true; // torches can be placed on it
        group.add(mesh);

        let crystals = crystalCache.get(geometry);
        if (crystals === undefined) {
          crystals = crystalGeometry(geometry.userData.crystals);
          crystalCache.set(geometry, crystals);
        }
        if (crystals) group.add(new Mesh(crystals, crystalMaterial));
      }
      return group;
    },
    // Geometry is cached by the cave system and reused, so nothing to free.
  };
  return layer;
}
