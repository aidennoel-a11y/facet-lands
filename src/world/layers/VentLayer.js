import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial } from 'three';
import { hash2 } from '../../noise/random.js';

/**
 * Steam from the volcanoes' vents (see TerrainGenerator.vents): each vent
 * breathes out a plume of blocky puffs that rise, drift with the wind,
 * swell and fade. Worked out on the GPU from the time, so it costs nothing
 * per frame; on the chunks near you.
 */
export function createVentLayer(config) {
  const uniforms = { uTime: { value: 0 } };
  const cube = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial({ color: 0xf2f4f5, emissive: 0x5a5e62, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aStart;\nattribute vec4 aPuff;\nvarying float vFade;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `// aPuff: x = lifetime (s), y = phase (0..1), z = size, w = drift direction.
        float age = fract(uTime / aPuff.x + aPuff.y);
        float spin = aPuff.y * 30.0 + age * 1.5;
        vec3 p = position;
        p.xz = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * p.xz;
        float grow = aPuff.z * (0.4 + 1.8 * age);
        vec3 drift = vec3(cos(aPuff.w), 0.0, sin(aPuff.w)) * (age * 6.0);
        vec3 transformed = p * grow + aStart + drift + vec3(0.0, age * 16.0, 0.0);
        vFade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.45, 1.0, age));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= 0.55 * vFade;');
  };
  material.customProgramCacheKey = () => 'steam';

  return {
    name: 'vents',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    reuseKey: ({ lod }) => (lod > 2 ? 'none' : 'near'),

    build({ cx, cz, lod, generator }) {
      if (lod > 2 || !generator.vents) return null;
      const size = config.chunkSize;
      const x0 = cx * size, z0 = cz * size;
      const vents = generator.vents(x0, z0, x0 + size, z0 + size);
      if (!vents.length) return null;
      const starts = [], puffs = [];
      const seed = generator.seed ^ 0x5eab;
      for (const v of vents) {
        // (The land before rivers: a hot spring's steam rises from about its water.)
        const y = v.level ?? generator.getBaseHeight(v.x, v.z);
        const count = Math.round(14 + 14 * v.strength);
        for (let k = 0; k < count; k++) {
          const h = (n) => hash2(Math.floor(v.x) + k * 17, Math.floor(v.z) - k * 11, seed + n);
          starts.push(v.x - x0 + (h(1) - 0.5) * 2.5, y + 0.2, v.z - z0 + (h(2) - 0.5) * 2.5);
          puffs.push(5 + 3 * h(3), h(4), (0.9 + 1.1 * h(5)) * v.strength, 0.6 + (h(6) - 0.5) * 0.9);
        }
      }
      const geometry = cube.clone();
      geometry.setAttribute('aStart', new InstancedBufferAttribute(new Float32Array(starts), 3));
      geometry.setAttribute('aPuff', new InstancedBufferAttribute(new Float32Array(puffs), 4));
      const mesh = new InstancedMesh(geometry, material, starts.length / 3);
      mesh.frustumCulled = false; // it moves on the GPU; there are only a few
      mesh.renderOrder = 5;
      mesh.name = 'steam';
      return mesh;
    },

    dispose(mesh) {
      mesh.geometry.dispose();
      mesh.dispose();
    },
  };
}
