import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial } from 'three';
import { hash2 } from '../../noise/random.js';

/**
 * Geysers erupting (see TerrainGenerator.hotSprings): every minute or two
 * each one throws a column of water and steam fifteen to thirty metres up
 * for a few seconds, blocky drops arcing out and falling back, then it
 * settles to a wisp of steam again (the steam is VentLayer's). Worked out
 * on the GPU from the time, so it costs nothing per frame; on the chunks
 * near you.
 */
export function createGeyserLayer(config) {
  const uniforms = { uTime: { value: 0 } };
  const cube = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial({ color: 0xf4f8fa, emissive: 0x55626a, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aStart;\nattribute vec4 aDrop;\nattribute vec2 aCycle;\nvarying float vFade;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `// aCycle: x = seconds between eruptions, y = phase (0..1).
        // aDrop: x = when in the eruption it's thrown (0..1), y = how hard,
        // z = which way it leans, w = size.
        float t = mod(uTime + aCycle.y * aCycle.x, aCycle.x);
        float dur = 7.0, life = 2.8;
        float age = t - aDrop.x * dur;
        float on = step(0.0, age) * step(age, life);
        // The column is strongest in the middle of the eruption.
        float surge = sin(3.14159 * clamp(aDrop.x, 0.0, 1.0));
        float v = (12.0 + 12.0 * aDrop.y) * (0.55 + 0.45 * surge);
        float rise = max(0.0, v * age - 4.9 * age * age);
        vec3 spread = vec3(cos(aDrop.z), 0.0, sin(aDrop.z)) * (0.3 + age * (0.6 + 1.4 * (1.0 - surge)));
        vec3 transformed = position * aDrop.w * (0.6 + 0.5 * age) * on + aStart + spread * on + vec3(0.0, rise, 0.0);
        vFade = on * (1.0 - smoothstep(0.55 * life, life, age));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= 0.8 * vFade;');
  };
  material.customProgramCacheKey = () => 'geyser';

  return {
    name: 'geysers',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    reuseKey: ({ lod }) => (lod > 2 ? 'none' : 'near'),

    build({ cx, cz, lod, generator }) {
      if (lod > 2 || !generator.hotSprings) return null;
      const size = config.chunkSize;
      const x0 = cx * size, z0 = cz * size;
      const geysers = generator.hotSprings(x0, z0, x0 + size, z0 + size).filter((g) => g.geyser && g.x >= x0 && g.x < x0 + size && g.z >= z0 && g.z < z0 + size);
      if (!geysers.length) return null;
      const starts = [], drops = [], cycles = [];
      const seed = generator.seed ^ 0x6e75;
      for (const g of geysers) {
        const y = generator.getHeight(g.x, g.z);
        if (y < config.seaLevel + 1) continue;
        for (let k = 0; k < 110; k++) {
          const h = (n) => hash2(Math.floor(g.x) + k * 13, Math.floor(g.z) - k * 7, seed + n);
          starts.push(g.x - x0 + (h(1) - 0.5) * 0.8, y, g.z - z0 + (h(2) - 0.5) * 0.8);
          drops.push(h(3), h(4) * g.strength, h(5) * Math.PI * 2, 0.35 + 0.55 * h(6));
          cycles.push(g.period, g.phase);
        }
      }
      if (!starts.length) return null;
      const geometry = cube.clone();
      geometry.setAttribute('aStart', new InstancedBufferAttribute(new Float32Array(starts), 3));
      geometry.setAttribute('aDrop', new InstancedBufferAttribute(new Float32Array(drops), 4));
      geometry.setAttribute('aCycle', new InstancedBufferAttribute(new Float32Array(cycles), 2));
      const mesh = new InstancedMesh(geometry, material, starts.length / 3);
      mesh.frustumCulled = false; // it moves on the GPU; there are only a few
      mesh.renderOrder = 5;
      mesh.name = 'geyser';
      return mesh;
    },

    dispose(mesh) {
      mesh.geometry.dispose();
      mesh.dispose();
    },
  };
}
