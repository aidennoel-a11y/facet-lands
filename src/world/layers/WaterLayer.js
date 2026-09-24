import { BufferAttribute, BufferGeometry, Color, Mesh, MeshPhongMaterial } from 'three';
import { waterData } from '../waterData.js';
import { windStrength } from '../../render/wind.js';
import { seasonUniforms } from '../../render/Seasons.js';

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
 * Along the open coast the shallows foam white where the waves break,
 * most of all at the foot of sea cliffs.
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
    shader.uniforms.uWinter = seasonUniforms.uWinter;
    // Fresnel: looking across the water you see the sky reflected in it,
    // looking straight down you see into it.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSky;\nuniform float uTime;\nvarying float vFoam;\nvarying vec2 vWorld;\nvarying float vIce;')
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition) * -1.0), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fresnel * 0.35);
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, fresnel * 0.4);
        // Breaking waves: foam rolling in, surging and falling back.
        float surge = sin(uTime * 1.3 + dot(vWorld, vec2(0.11, 0.07))) * 0.5 + 0.5;
        float breaking = vFoam * smoothstep(0.25, 0.95, surge + 0.35 * sin(dot(vWorld, vec2(0.6, -0.45)) + uTime * 2.1));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.97, 0.98), breaking * 0.85);
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, breaking * 0.7);
        // Winter: lakes freeze over.
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.74, 0.84, 0.9), vIce * 0.85);
        gl_FragColor.a = mix(gl_FragColor.a, 0.95, vIce);
        #include <fog_fragment>`,
      );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform float uWinter;\nattribute float waveScale;\nattribute float foam;\nattribute float aFreeze;\nvarying float vFoam;\nvarying vec2 vWorld;\nvarying float vIce;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vIce = aFreeze * smoothstep(0.35, 0.8, uWinter);
        vFoam = foam * (1.0 - vIce);
        vWorld = wp.xz;
        // Shallow and small water barely ripples; open, deep water rolls, more so when windy.
        transformed.y += (1.0 - vIce) * ${waveHeight.toFixed(3)} * waveScale * (0.25 + 0.75 * uWind) * (
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

    build({ cx, cz, heights, generator, config, prepared }) {
      // (Worked out by the chunk's worker, or here.)
      const data = prepared?.water !== undefined ? prepared.water : waterData(generator, config, cx, cz, heights, resolution);
      if (!data) return null;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      geometry.setAttribute('color', new BufferAttribute(data.colors, 4));
      geometry.setAttribute('waveScale', new BufferAttribute(data.waves, 1));
      geometry.setAttribute('foam', new BufferAttribute(data.foams, 1));
      geometry.setAttribute('aFreeze', new BufferAttribute(data.freezes, 1));
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
