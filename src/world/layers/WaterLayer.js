import { BufferAttribute, BufferGeometry, Color, Mesh, MeshPhongMaterial } from 'three';
import { hash2 } from '../../noise/random.js';
import { windStrength } from '../../render/wind.js';

const SHALLOW = new Color(0x4fbfc4);
const DEEP = new Color(0x2c67b0);
const color = new Color();

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Low-poly water for every chunk that dips below sea level.
 *
 * Each chunk gets a jittered triangle sheet at sea level (same resolution
 * everywhere, so neighbouring sheets always line up). Faces are coloured by
 * how deep the ground is underneath: see-through turquoise at the shore,
 * deep blue further out. A small vertex shader rolls gentle waves across it,
 * driven by world position so the waves flow across chunk borders, and a
 * fresnel term mixes in the sky colour (`skyColor`, kept live by the caller)
 * at grazing angles, so the sea glows orange at sunset and dark at night.
 */
export function createWaterLayer({ resolution = 16, waveHeight = 0.28, skyColor = new Color(0xd6e8f7) } = {}) {
  const uniforms = { uTime: { value: 0 }, uSky: { value: skyColor } };

  const material = new MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    flatShading: true,
    shininess: 80,
    specular: 0x6f8fb0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSky = uniforms.uSky;
    shader.uniforms.uWind = windStrength;
    // Fresnel: looking across the water you see the sky reflected in it,
    // looking straight down you see into it.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSky;')
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition) * -1.0), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fresnel * 0.35);
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, fresnel * 0.4);
        #include <fog_fragment>`,
      );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nattribute float waveScale;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        // Shallow and small water barely ripples; open, deep water rolls, more so when windy.
        transformed.y += ${waveHeight.toFixed(3)} * waveScale * (0.25 + 0.75 * uWind) * (
          sin(wp.x * 0.04 + uTime * 0.7) +
          cos(wp.z * 0.034 + uTime * 0.55) +
          0.4 * sin((wp.x + wp.z) * 0.1 + uTime * 1.2));`,
      );
  };

  return {
    name: 'water',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    reuseKey: ({ resolution }) => `${resolution}`,

    build({ cx, cz, heights, generator, config }) {
      const { seaLevel, chunkSize, vertexJitter } = config;

      // Skip chunks that are entirely dry.
      let minGround = Infinity;
      for (let k = 0; k < heights.gridY.length; k++) minGround = Math.min(minGround, heights.gridY[k]);
      if (minGround > seaLevel + 1) return null;

      const n = resolution + 1;
      const cell = chunkSize / resolution;
      const originX = cx * chunkSize;
      const originZ = cz * chunkSize;
      const seed = generator.seed ^ 0x2545f491;

      const xs = new Float32Array(n * n);
      const zs = new Float32Array(n * n);
      const ground = new Float32Array(n * n);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = cx * resolution + i;
          const gj = cz * resolution + j;
          const k = j * n + i;
          xs[k] = i * cell + (hash2(gi, gj, seed) - 0.5) * 2 * vertexJitter * cell;
          zs[k] = j * cell + (hash2(gi, gj, seed ^ 0x5bd1e995) - 0.5) * 2 * vertexJitter * cell;
          ground[k] = generator.getHeight(originX + xs[k], originZ + zs[k]);
        }
      }

      const positions = [];
      const colors = [];
      const waves = [];
      const addTri = (a, b, c, variation) => {
        // Keep faces with any corner under water; drop fully dry ones.
        const wet = seaLevel + 1.5;
        if (ground[a] > wet && ground[b] > wet && ground[c] > wet) return;
        const depth = seaLevel - (ground[a] + ground[b] + ground[c]) / 3;
        const t = smoothstep(-1, 16, depth);
        color.copy(SHALLOW).lerp(DEEP, t).multiplyScalar(0.96 + variation * 0.08);
        const alpha = 0.68 + 0.26 * t;
        for (const k of [a, b, c]) {
          positions.push(xs[k], seaLevel, zs[k]);
          colors.push(color.r, color.g, color.b, alpha);
          waves.push(0.1 + 0.9 * smoothstep(1, 16, seaLevel - ground[k]));
        }
      };

      for (let j = 0; j < resolution; j++) {
        for (let i = 0; i < resolution; i++) {
          const a = j * n + i;
          const b = a + 1;
          const c = a + n;
          const d = c + 1;
          const gi = cx * resolution + i;
          const gj = cz * resolution + j;
          const v0 = hash2(gi * 2, gj, seed + 3);
          const v1 = hash2(gi * 2 + 1, gj, seed + 3);
          if (hash2(gi, gj, seed + 9) < 0.5) {
            addTri(a, c, d, v0);
            addTri(a, d, b, v1);
          } else {
            addTri(a, c, b, v0);
            addTri(b, c, d, v1);
          }
        }
      }
      if (positions.length === 0) return null;

      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
      geometry.setAttribute('waveScale', new BufferAttribute(new Float32Array(waves), 1));
      geometry.computeBoundingSphere();
      // Waves move vertices a little; pad the bounds so culling stays correct.
      geometry.boundingSphere.radius += waveHeight * 3;

      const mesh = new Mesh(geometry, material);
      mesh.name = 'water';
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      return mesh;
    },

    dispose(object) {
      object.geometry.dispose();
    },
  };
}
