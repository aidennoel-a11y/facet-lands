import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshPhongMaterial } from 'three';
import { waterData } from '../waterData.js';
import { windDirection, windStrength } from '../../render/wind.js';
import { seasonUniforms } from '../../render/Seasons.js';
import { SPARKLE_HEAD, sparkleUniforms } from '../../render/waterSparkle.js';

/**
 * The lakes and the sea, for every chunk that dips below sea level: a sheet
 * of water at sea level (the same grid everywhere, so neighbouring sheets
 * line up), shading from see-through turquoise in the shallows to deep blue.
 *
 * It moves like water: trains of rolling Gerstner waves (their crests
 * sharp, their troughs broad, travelling at the speed real waves of their
 * length do) run downwind across it, big out on the open sea and in a
 * wind, barely a lap on a pond; over them, fine ripples play in the light.
 * It reflects the sky as water does (hardly at all looking straight down,
 * like a mirror looking across it), the sun glittering on it. Along the
 * coast, lines of foam roll in to the shore and wash up it, the surf
 * breaking whitest under the cliffs, and out at sea the highest crests
 * spill over in whitecaps. In a cold winter the lakes freeze over.
 */
// How stormy it is at sea (0..1): only then does the surf break on the shores of a sheltered cove.
export const seaStorm = { value: 0 };

export function createWaterLayer({ resolution = 16, waveHeight = 0.45, skyColor = new Color(0xd6e8f7), skyTop = new Color(0x7fb4e6) } = {}) {
  const uniforms = { uTime: { value: 0 }, uSky: { value: skyColor }, uSkyTop: { value: skyTop } };

  const material = new MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    shininess: 140,
    specular: 0x9ab0c4,
    side: DoubleSide, // (seen from underneath, too)
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, sparkleUniforms);
    shader.uniforms.uWind = windStrength;
    shader.uniforms.uWindDir = windDirection;
    shader.uniforms.uWinter = seasonUniforms.uWinter;
    shader.uniforms.uSeaStorm = seaStorm;
    const f = (n) => n.toFixed(4);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform float uWind;
        uniform vec2 uWindDir;
        uniform float uWinter;
        uniform float uSeaStorm;
        attribute float waveScale;
        attribute float foam;
        attribute float aFreeze;
        attribute float aDepth;
        varying float vFoam;
        varying float vCrest;
        varying vec2 vWorld;
        varying float vIce;
        varying float vDepth;
        varying float vSurfY;
        varying vec3 vWaveN;
        // One train of Gerstner waves: direction (angle off the wind),
        // length (m), height (share of the whole), phase. Adds its lift and
        // sideways push to disp, and its tilt to the normal.
        void gerstner(vec2 p, float turn, float len, float share, float phase, float amp, inout vec3 disp, inout vec3 n, inout float crest) {
          float c = cos(turn), s = sin(turn);
          vec2 d = vec2(uWindDir.x * c - uWindDir.y * s, uWindDir.x * s + uWindDir.y * c);
          float k = 6.2831853 / len;
          float a = amp * share;
          float w = sqrt(9.8 * k);
          float th = k * dot(d, p) - w * uTime + phase;
          float q = min(1.0, 0.55 / (k * a * 4.0 + 1e-4));
          float co = cos(th), si = sin(th);
          disp += vec3(q * a * d.x * co, a * si, q * a * d.y * co);
          n += vec3(-d.x * k * a * co, -q * k * a * si, -d.y * k * a * co);
          crest += share * si;
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `vec4 wp = modelMatrix * vec4(position, 1.0);
        vIce = aFreeze * smoothstep(0.35, 0.8, uWinter);
        // (foam: the surf, with how open the water is to the sea packed in
        // above it, in sixteenths: see waterData. Shut in, it lies still.)
        float foamOpen = floor(foam * 0.5) / 16.0;
        float foamSurf = foam - 2.0 * floor(foam * 0.5);
        vFoam = foamSurf * max(smoothstep(0.15, 0.35, foamOpen), smoothstep(0.45, 0.85, uSeaStorm)) * (1.0 - vIce);
        vWorld = wp.xz;
        vDepth = aDepth;
        // The waves: several trains crossing at odd angles about the wind,
        // long swells and shorter seas. Open, deep water rolls, more so in a
        // wind; shallow and small water barely laps.
        float amp = ${f(waveHeight)} * waveScale * (0.3 + 0.7 * uWind) * (1.0 - vIce);
        vec3 disp = vec3(0.0), wn = vec3(0.0, 1.0, 0.0);
        float crest = 0.0;
        gerstner(wp.xz, 0.0, 74.0, 1.0, 0.0, amp, disp, wn, crest);
        gerstner(wp.xz, 0.55, 43.0, 0.6, 1.7, amp, disp, wn, crest);
        gerstner(wp.xz, -0.75, 25.0, 0.34, 4.1, amp, disp, wn, crest);
        gerstner(wp.xz, 1.35, 15.0, 0.18, 2.3, amp, disp, wn, crest);
        vWaveN = normalize(wn);
        // (How near a big wave's crest this is: whitecaps, out in the open sea, most in a wind.)
        vCrest = smoothstep(1.4, 2.6, waveScale) * smoothstep(1.2, 1.9, crest) * (0.4 + 0.6 * uWind);
        vec3 objectNormal = vWaveN;`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += disp;\nvSurfY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uSky;
        uniform vec3 uSkyTop;
        uniform float uTime;
        uniform float uWind;
        uniform vec2 uWindDir;
        varying float vFoam;
        varying float vCrest;
        varying vec2 vWorld;
        varying float vIce;
        varying float vDepth;
        varying float vSurfY;
        varying vec3 vWaveN;
        float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float waterNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        // Fine ripples: three sizes of them drifting with the wind.
        float ripples(vec2 p) {
          vec2 d = uWindDir * uTime;
          return waterNoise(p * 0.32 - d * 0.5) * 0.55 + waterNoise(p * 0.9 + vec2(-d.y, d.x) * 0.7) * 0.3 + waterNoise(p * 2.3 - d * 1.6) * 0.15;
        }
        ${SPARKLE_HEAD}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        {
          // The waves' own tilt, then the ripples over it (fading out with
          // distance, where they'd only shimmer).
          float fine = (1.0 - smoothstep(50.0, 240.0, length(vViewPosition))) * (0.35 + 0.65 * uWind) * (1.0 - vIce);
          float e = 0.35;
          float h0 = ripples(vWorld);
          vec2 g = vec2(ripples(vWorld + vec2(e, 0.0)) - h0, ripples(vWorld + vec2(0.0, e)) - h0) / e;
          vec3 nw = normalize(vWaveN + vec3(-g.x, 0.0, -g.y) * 0.9 * fine);
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `{
          // The sky in it: little looking straight down, a mirror looking
          // across (Fresnel), the zenith's colour overhead in it, the
          // horizon's low down.
          vec3 V = normalize(vViewPosition); // (towards the eye)
          float nv = clamp(dot(normal, V), 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
          vec3 R = (vec4(reflect(-V, normal), 0.0) * viewMatrix).xyz;
          vec3 sky = mix(uSky, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.25));
          // (Seen from under the water: no sky mirrored in it; see below.)
          float below = step(cameraPosition.y, vSurfY);
          float mirror = fres * (1.0 - vIce) * (1.0 - below);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, sky, mirror * 0.8);
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, mirror * 0.8);
          // Foam: waves breaking in the shallows, coming and going; lines of
          // it rolling in to the shore and washing up it (on the open coast
          // most; a lake just laps); whitecaps out at sea.
          float froth = waterNoise(vWorld * 0.18 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + waterNoise(vWorld * 0.47 - uTime * 0.4) * 0.4;
          float breaking = vFoam * smoothstep(0.45, 0.75, froth + 0.25 * sin(uTime * 1.1 + froth * 5.0));
          float shore = 1.0 - smoothstep(0.2, 3.2, vDepth);
          float roll = fract(vDepth * 0.42 + uTime * 0.14 + waterNoise(vWorld * 0.04) * 0.9);
          float line = smoothstep(0.78, 0.93, roll) * (1.0 - smoothstep(0.93, 1.0, roll)) * smoothstep(0.3, 0.7, waterNoise(vWorld * 0.35 + uTime * 0.15));
          float swash = (1.0 - smoothstep(-0.2, 0.35, vDepth)) * (0.55 + 0.45 * sin(uTime * 0.9 + vWorld.x * 0.05 + vWorld.y * 0.07));
          float coast = min(1.0, 0.3 + vFoam * 2.0);
          float lap = max(line * shore, swash) * coast;
          float cap = vCrest * smoothstep(0.5, 0.75, waterNoise(vWorld * 0.09 + uTime * 0.12));
          float white = max(max(breaking, cap), lap) * (1.0 - vIce) * (1.0 - 0.7 * below);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.97, 0.98), white * 0.85);
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, white * 0.75);
          // Sun glitter (not where a cloud's shadow lies), and rings in the rain.
          float open = (1.0 - vIce) * (1.0 - white) * (1.0 - below);
          gl_FragColor.rgb += sunGlitter(vWorld, normal, -V, uTime) * open * (1.0 - uCloudStrength * texture2D(uCloudShadow, (vCloudXZ - uCloudOrigin) / uCloudSize).r * 1.6);
          gl_FragColor.rgb += rainRings(vWorld, uTime) * 0.22 * open;
          #ifdef USE_FOG
          // (Out past Snell's window, some 49° off straight up, the surface
          // mirrors the dim water under it; inside it, the sky shines through.)
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor * 1.1, uSky * 0.75 + fogColor * 0.4, smoothstep(0.6, 0.8, abs(dot(normal, V)))), below);
          #endif
          gl_FragColor.a = mix(gl_FragColor.a, 0.92, below);
          // Winter: lakes freeze over.
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.74, 0.84, 0.9), vIce * 0.85);
          gl_FragColor.a = mix(gl_FragColor.a, 0.95, vIce);
        }
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'water-v2';

  return {
    name: 'water',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    /**
     * The waves' lift at (x, z) (the water `depth` deep there, `ocean` how
     * open the sea), as the shader draws them: { y (m above the still
     * water), nx, nz (the surface's tilt) }. For what floats on it.
     */
    waveAt(x, z, depth, ocean, out = {}) {
      const sm = (a, b, v) => { const q = Math.min(1, Math.max(0, (v - a) / (b - a))); return q * q * (3 - 2 * q); };
      const scale = 0.1 + 0.9 * sm(1, 16, depth) + 2.4 * (depth >= 6 ? sm(6, 30, depth) * sm(0.4, 0.8, ocean) : 0);
      const amp = waveHeight * scale * (0.3 + 0.7 * windStrength.value), wd = windDirection.value, time = uniforms.uTime.value;
      let y = 0, nx = 0, nz = 0;
      for (const [turn, len, share, phase] of [[0, 74, 1, 0], [0.55, 43, 0.6, 1.7], [-0.75, 25, 0.34, 4.1], [1.35, 15, 0.18, 2.3]]) {
        const c = Math.cos(turn), s = Math.sin(turn), dx = wd.x * c - wd.y * s, dz = wd.x * s + wd.y * c;
        const k = (Math.PI * 2) / len, a = amp * share, th = k * (dx * x + dz * z) - Math.sqrt(9.8 * k) * time + phase;
        y += a * Math.sin(th);
        nx -= dx * k * a * Math.cos(th);
        nz -= dz * k * a * Math.cos(th);
      }
      out.y = y;
      out.nx = nx;
      out.nz = nz;
      return out;
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
      geometry.setAttribute('aDepth', new BufferAttribute(data.depths, 1));
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(data.positions.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      geometry.computeBoundingSphere();
      // Waves move vertices about; pad the bounds so culling stays correct.
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
