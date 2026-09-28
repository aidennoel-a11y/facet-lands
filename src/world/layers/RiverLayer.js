import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  PlaneGeometry,
  Color,
  DoubleSide,
} from 'three';

// How bright the waterfalls' mist is (the daylight on it): set by the caller.
export const mistLight = { value: 1 };
import { riverData } from '../riverData.js';
import { seasonalWater, seasonUniforms } from '../../render/Seasons.js';
import { SPARKLE_HEAD, sparkleUniforms } from '../../render/waterSparkle.js';

/**
 * River, stream and pond water (see Rivers) as one surface that fills the
 * trenches: each chunk near you gets a sheet sampled every 2 m at the level
 * of the water there (see Rivers.waterAt), running a little way on under the banks so the
 * land itself cuts the waterline. So a river flows straight out of its
 * source pond, and two rivers meeting merge into one sheet. At a lake or
 * the sea it takes on that water's colour and runs on over it a little,
 * so the two meet without a seam (it's drawn first, so the lake doesn't
 * show through it twice).
 *
 * The water is see-through, and flows: its surface runs downstream, little
 * humps of water and the ripples over them carried along by the current
 * (quicker where it's steeper), catching the sky and the sun as they go;
 * froth races down over rapids and falls. Waterfalls
 * throw blocky spray: cubes of water tumbling over the lip and splashing
 * up where it lands (all worked out on the GPU from the time).
 */
export function createRiverLayer(skyColor, skyTop = new Color(0x7fb4e6)) {
  const uniforms = { uTime: { value: 0 }, uSky: { value: skyColor }, uSkyTop: { value: skyTop } };
  const material = new MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    shininess: 120,
    specular: 0x8aa4bc,
    side: DoubleSide, // (seen from underneath, too)
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, sparkleUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        attribute vec4 flow;
        attribute float streaks;
        attribute float aMouth;
        varying float vMouth;
        varying vec4 vFlow;
        varying float vStreaks;
        varying vec2 vRiverWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vFlow = flow;
        vStreaks = streaks;
        vMouth = aMouth;
        vRiverWorld = (modelMatrix * vec4(transformed, 1.0)).xz;
        // The current: little humps of water running downstream (quicker
        // and higher where it's steep, heaving over rapids), none at the banks.
        {
          float run = uTime * (0.8 + 2.2 * flow.z);
          float mid = 1.0 - smoothstep(0.6, 1.0, abs(flow.y));
          float amp = (0.025 + 0.035 * flow.z + 0.12 * flow.w) * mid * step(0.01, flow.z) * streaks;
          transformed.y += amp * (0.6 * sin(flow.x * 0.8 - run * 0.8 + flow.y * 1.3) + 0.4 * sin(flow.x * 1.9 - run * 1.9 - flow.y * 2.1));
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform vec3 uSky;
        uniform vec3 uSkyTop;
        varying vec4 vFlow;
        varying float vStreaks;
        varying float vMouth;
        varying vec2 vRiverWorld;
        float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float waterNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), f.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        // The water's surface, carried along by the current: in the river's
        // own frame (metres along it, and across it), so it runs downstream
        // and bends with the river. Swirls, and finer ripples over them.
        float riverSurface(vec2 f, float run) {
          vec2 q = vec2(f.x, f.y * 2.6);
          return waterNoise(vec2(q.x * 0.3 - run * 0.3, q.y * 0.5)) * 0.5
               + waterNoise(vec2(q.x * 0.8 - run * 0.85, q.y * 1.2 + 3.1)) * 0.32
               + waterNoise(vec2(q.x * 2.1 - run * 2.3, q.y * 2.8 - 7.0)) * 0.18;
        }
        ${SPARKLE_HEAD}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        {
          // The surface's facets, then the flowing ripples over them (as a
          // bump on the surface: see perturbNormalArb).
          vec3 px = dFdx(vViewPosition), py = dFdy(vViewPosition);
          vec3 geo = normalize(cross(px, py));
          float run = uTime * (0.8 + 2.2 * vFlow.z);
          // (Its slope taken along and across the flow, then carried onto
          // the screen by the chain rule: smooth, where the screen
          // derivatives of the noise itself would sparkle pixel by pixel.)
          float e = 0.3;
          float h = riverSurface(vFlow.xy, run);
          vec2 hs = vec2(riverSurface(vFlow.xy + vec2(e, 0.0), run) - h, riverSurface(vFlow.xy + vec2(0.0, e * 0.25), run) - h) / vec2(e, e * 0.25);
          float bump = (0.12 + 0.18 * min(1.0, vFlow.z) + 0.5 * vFlow.w) * (1.0 - smoothstep(30.0, 140.0, length(vViewPosition))) * vStreaks;
          vec2 dh = (hs.x * vec2(dFdx(vFlow.x), dFdy(vFlow.x)) + hs.y * vec2(dFdx(vFlow.y), dFdy(vFlow.y))) * bump;
          vec3 r1 = cross(py, geo), r2 = cross(geo, px);
          float det = dot(px, r1);
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          float tilt = length(grad) / max(abs(det), 1e-9);
          grad *= min(1.0, 0.5 / max(tilt, 1e-6)); // (never tipped more than about 27°)
          normal = normalize(abs(det) * geo - grad);
          if (dot(normal, vec3(0.0, 0.0, 1.0)) < 0.0 && dot(geo, vec3(0.0, 0.0, 1.0)) > 0.0) normal = geo;
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `{
          // flow: x = metres along the river, y = out from its middle (1 at
          // the channel's edge), z = speed, w = white water.
          float run = uTime * (0.8 + 2.2 * vFlow.z);
          vec3 V = normalize(vViewPosition); // (towards the eye)
          float nv = clamp(dot(normal, V), 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
          vec3 R = (vec4(reflect(-V, normal), 0.0) * viewMatrix).xyz;
          vec3 sky = mix(uSky, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.35));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, sky, fres * 0.75 * (1.0 - vFlow.w));
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, fres * 0.6);
          // White water: froth racing down over rapids and falls, a little
          // along the banks where it's quick.
          float froth = waterNoise(vec2(vFlow.x * 0.7 - run * 0.9, vFlow.y * 3.2)) * 0.65 + waterNoise(vec2(vFlow.x * 1.8 - run * 2.0, vFlow.y * 6.0 + 5.0)) * 0.35;
          float white = vFlow.w * smoothstep(0.55 - 0.45 * vFlow.w, 0.85 - 0.3 * vFlow.w, froth);
          white = max(white, smoothstep(0.85, 1.05, abs(vFlow.y)) * smoothstep(0.6, 0.8, froth) * 0.35 * min(1.0, vFlow.z * 0.6) * vStreaks);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.97, 0.98), white * 0.85);
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, white * 0.7);
          // Sun glitter on the smooth stretches (not under a cloud's shadow), and rings in the rain.
          float calm = (1.0 - vFlow.w) * (1.0 - white);
          gl_FragColor.rgb += sunGlitter(vRiverWorld, normal, -V, uTime) * calm * (1.0 - uCloudStrength * texture2D(uCloudShadow, (vCloudXZ - uCloudOrigin) / uCloudSize).r * 1.6);
          gl_FragColor.rgb += rainRings(vRiverWorld, uTime) * 0.2 * calm;
          gl_FragColor.a *= vMouth; // (giving way to the lake or sea it runs into)
        }
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'river-v3';
  seasonalWater(material); // ponds freeze in winter

  // Waterfall spray: little cubes, each flying on its own arc (start, velocity,
  // how long it lives, when it starts) and shrinking away as it lands.
  const cube = new BoxGeometry(1, 1, 1);
  const sprayMaterial = new MeshLambertMaterial({ color: 0xeef7fa, emissive: 0x4a6068 });
  sprayMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWinter = seasonUniforms.uWinter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWinter;\nattribute vec3 aStart;\nattribute vec3 aVelocity;\nattribute vec3 aLife;\nattribute float aIce;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `// aLife: x = lifetime (s), y = phase (0..1), z = size.
        float age = fract(uTime / aLife.x + aLife.y) * aLife.x;
        float k = age / aLife.x;
        float spin = aLife.y * 40.0 + age * 3.0;
        vec3 p = position;
        p.xz = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * p.xz;
        float frozen = 1.0 - aIce * smoothstep(0.35, 0.8, uWinter); // (none off a frozen fall)
        vec3 transformed = p * aLife.z * (1.0 - k * k) * frozen + aStart + aVelocity * age + vec3(0.0, -4.9 * age * age, 0.0);`,
      );
  };
  sprayMaterial.customProgramCacheKey = () => 'spray-ice';

  // Waterfall mist: soft, pale puffs billowing up from the foot of a fall,
  // swelling and thinning away, always facing you.
  const mistMaterial = new MeshBasicMaterial({ color: 0xeef4f6, transparent: true, depthWrite: false });
  mistMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uMistLight = mistLight;
    shader.uniforms.uWinter = seasonUniforms.uWinter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWinter;\nattribute vec3 aMist;\nattribute vec4 aMistLife;\nattribute float aMistIce;\nvarying vec2 vMistUv;\nvarying float vMistAlpha;')
      .replace(
        '#include <project_vertex>',
        /* glsl */ `// aMistLife: x = lifetime (s), y = phase (0..1), z = size, w = rise.
        float age = fract(uTime / aMistLife.x + aMistLife.y);
        vec3 centre = aMist + vec3(sin(aMistLife.y * 40.0 + uTime * 0.3) * 0.8 * age, age * aMistLife.w, cos(aMistLife.y * 31.0 + uTime * 0.25) * 0.8 * age);
        vec4 mvPosition = modelViewMatrix * vec4(centre, 1.0);
        mvPosition.xy += position.xy * aMistLife.z * (0.5 + 1.1 * age);
        gl_Position = projectionMatrix * mvPosition;
        vMistUv = position.xy;
        vMistAlpha = sin(3.14159 * age) * (1.0 - aMistIce * smoothstep(0.35, 0.8, uWinter));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMistLight;\nvarying vec2 vMistUv;\nvarying float vMistAlpha;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= uMistLight;\ndiffuseColor.a *= vMistAlpha * 0.3 * (1.0 - smoothstep(0.12, 0.5, length(vMistUv)));',
      );
  };
  mistMaterial.customProgramCacheKey = () => 'mist-ice';
  const puff = new PlaneGeometry(1, 1);
  puff.deleteAttribute('normal');
  puff.deleteAttribute('uv');

  function mist({ mist: at, mistLife, mistIce }) {
    const geometry = new InstancedBufferGeometry();
    geometry.index = puff.index;
    geometry.setAttribute('position', puff.attributes.position);
    geometry.setAttribute('aMist', new InstancedBufferAttribute(at, 3));
    geometry.setAttribute('aMistLife', new InstancedBufferAttribute(mistLife, 4));
    geometry.setAttribute('aMistIce', new InstancedBufferAttribute(mistIce ?? new Float32Array(at.length / 3), 1));
    geometry.instanceCount = at.length / 3;
    const mesh = new Mesh(geometry, mistMaterial);
    mesh.frustumCulled = false; // (it moves on the GPU; there are only a few)
    mesh.renderOrder = 3; // (over the water)
    mesh.name = 'mist';
    return mesh;
  }

  /** The spray of a chunk's waterfalls (see riverData), as a mesh. */
  function spray({ starts, velocities, lives, ice }) {
    const geometry = cube.clone();
    geometry.setAttribute('aStart', new InstancedBufferAttribute(starts, 3));
    geometry.setAttribute('aVelocity', new InstancedBufferAttribute(velocities, 3));
    geometry.setAttribute('aLife', new InstancedBufferAttribute(lives, 3));
    geometry.setAttribute('aIce', new InstancedBufferAttribute(ice ?? new Float32Array(lives.length / 3), 1));
    const mesh = new InstancedMesh(geometry, sprayMaterial, starts.length / 3);
    mesh.frustumCulled = false; // it moves on the GPU; there are only a few
    mesh.name = 'spray';
    return mesh;
  }

  return {
    name: 'rivers',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, config, prepared }) {
      if (lod > 1 || !generator.rivers) return null;
      // (Worked out by the chunk's worker, or here.)
      const data = prepared && prepared.river !== undefined ? prepared.river : riverData(generator, config, cx, cz);
      if (!data) return null;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      geometry.setAttribute('color', new BufferAttribute(data.colors, 4));
      geometry.setAttribute('flow', new BufferAttribute(data.flows, 4));
      geometry.setAttribute('streaks', new BufferAttribute(data.streaks, 1));
      geometry.setAttribute('aMouth', new BufferAttribute(data.mouths, 1));
      geometry.setAttribute('aFreeze', new BufferAttribute(data.freezes, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.boundingSphere.radius += 0.5; // (the current heaves it a little)
      const mesh = new Mesh(geometry, material);
      mesh.name = 'river';
      mesh.renderOrder = 0; // before the lake or sea, so where it runs on over one that doesn't show through
      mesh.receiveShadow = true;
      const group = new Group();
      group.name = 'rivers';
      group.add(mesh);
      const falls = data.spray ? spray(data.spray) : null;
      if (falls) group.add(falls);
      if (data.spray?.mist) group.add(mist(data.spray));
      return group;
    },

    dispose(group) {
      for (const child of group.children) {
        if (child.name === 'mist') {
          child.geometry.index = null; // (the puff's shape is shared)
          child.geometry.deleteAttribute('position');
        }
        child.geometry.dispose();
        if (child.isInstancedMesh) child.dispose();
      }
    },
  };
}
