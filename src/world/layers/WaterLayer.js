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
export function createWaterLayer({ resolution = 16, waveHeight = 0.34, skyColor = new Color(0xd6e8f7) } = {}) {
  const uniforms = { uTime: { value: 0 }, uSky: { value: skyColor } };

  const material = new MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    flatShading: true,
    shininess: 60,
    specular: 0x4f6378,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSky = uniforms.uSky;
    shader.uniforms.uWind = windStrength;
    shader.uniforms.uWinter = seasonUniforms.uWinter;
    // Fresnel: looking across the water you see the sky reflected in it,
    // looking straight down you see into it.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSky;
        uniform float uTime;
        varying float vFoam;
        varying float vCrest;
        varying vec2 vWorld;
        varying float vIce;
        float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float waterNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition) * -1.0), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fresnel * 0.35);
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, fresnel * 0.4);
        // Breaking waves: patches of foam at the water's edge, coming and going.
        float froth = waterNoise(vWorld * 0.18 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + waterNoise(vWorld * 0.47 - uTime * 0.4) * 0.4;
        float breaking = vFoam * smoothstep(0.45, 0.75, froth + 0.25 * sin(uTime * 1.1 + froth * 5.0));
        // Out at sea, whitecaps where the highest waves crest and spill over.
        float cap = vCrest * smoothstep(0.5, 0.75, waterNoise(vWorld * 0.09 + uTime * 0.12));
        float white = max(breaking, cap);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.97, 0.98), white * 0.85);
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, white * 0.7);
        // Winter: lakes freeze over.
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.74, 0.84, 0.9), vIce * 0.85);
        gl_FragColor.a = mix(gl_FragColor.a, 0.95, vIce);
        #include <fog_fragment>`,
      );
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform float uWinter;\nattribute float waveScale;\nattribute float foam;\nattribute float aFreeze;\nvarying float vFoam;\nvarying float vCrest;\nvarying vec2 vWorld;\nvarying float vIce;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vIce = aFreeze * smoothstep(0.35, 0.8, uWinter);
        vFoam = foam * (1.0 - vIce);
        vWorld = wp.xz;
        // Shallow and small water barely ripples; open, deep water rolls, more so when windy.
        // Several trains of waves crossing at odd angles, long swells and
        // short chop, so the facets tilt every which way and the sun's (or
        // moon's) glint breaks up into sparkles rather than lining up in stripes.
        vec2 q = wp.xz;
        float waves =
          sin(dot(q, vec2(0.031, 0.012)) + uTime * 0.7) +
          0.8 * sin(dot(q, vec2(-0.017, 0.036)) + uTime * 0.62 + 1.3) +
          0.6 * sin(dot(q, vec2(0.052, -0.041)) + uTime * 1.05 + 2.1) +
          0.45 * sin(dot(q, vec2(-0.083, -0.061)) + uTime * 1.35 + 0.4) +
          0.4 * sin(dot(q, vec2(0.121, 0.097)) + sin(dot(q, vec2(0.023, -0.031)) + uTime * 0.3) * 2.0 + uTime * 1.7) +
          0.3 * sin(dot(q, vec2(-0.163, 0.139)) + uTime * 2.1 + 3.7);
        transformed.y += (1.0 - vIce) * ${waveHeight.toFixed(3)} * waveScale * (0.3 + 0.7 * uWind) * waves;
        // (How near a big wave's crest this is: whitecaps, out in the open sea, most in a wind.)
        vCrest = smoothstep(1.4, 2.6, waveScale) * smoothstep(1.6, 2.8, waves) * (0.4 + 0.6 * uWind);`,
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
      geometry.boundingSphere.radius += waveHeight * 12;

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
