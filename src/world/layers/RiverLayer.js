import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
} from 'three';
import { riverData } from '../riverData.js';
import { seasonalWater } from '../../render/Seasons.js';

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
 * The water is see-through, and flows: soft, broken streaks drift
 * downstream along it (quicker where it's steeper); white water down
 * rapids and falls. Waterfalls
 * throw blocky spray: cubes of water tumbling over the lip and splashing
 * up where it lands (all worked out on the GPU from the time).
 */
export function createRiverLayer(skyColor) {
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 flow;\nattribute float streaks;\nvarying vec4 vFlow;\nvarying float vStreaks;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = flow;\nvStreaks = streaks;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSky;\nvarying vec4 vFlow;\nvarying float vStreaks;')
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `// flow: x = metres along the river, y = out from its middle (1 at the
        // channel's edge), z = speed, w = white water.
        // Soft streaks drifting downstream: short and broken, in lanes that
        // wander across the channel (no stripes straight across it).
        float phase = vFlow.x * 0.42 - uTime * vFlow.z * 2.4;
        float lanes = sin(vFlow.y * 5.3 + sin(vFlow.x * 0.09) * 1.7) * 0.5 + 0.5;
        float along = sin(vFlow.x * 0.31 - uTime * vFlow.z * 1.8 + sin(vFlow.y * 3.1 + vFlow.x * 0.05) * 2.2) * 0.5 + 0.5;
        float streak = smoothstep(0.55, 0.95, along * lanes);
        gl_FragColor.rgb += streak * step(0.01, vFlow.z) * (0.07 + 0.22 * vFlow.w) * vStreaks;
        gl_FragColor.a = min(1.0, gl_FragColor.a + streak * 0.12 * step(0.01, vFlow.z) * vStreaks);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.97, 0.98), vFlow.w * (0.55 + 0.25 * sin(phase * 2.0)));
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, vFlow.w * 0.6);
        float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition) * -1.0), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fresnel * 0.3 * (1.0 - vFlow.w));
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'river';
  seasonalWater(material); // ponds freeze in winter

  // Waterfall spray: little cubes, each flying on its own arc (start, velocity,
  // how long it lives, when it starts) and shrinking away as it lands.
  const cube = new BoxGeometry(1, 1, 1);
  const sprayMaterial = new MeshLambertMaterial({ color: 0xeef7fa, emissive: 0x4a6068 });
  sprayMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aStart;\nattribute vec3 aVelocity;\nattribute vec3 aLife;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `// aLife: x = lifetime (s), y = phase (0..1), z = size.
        float age = fract(uTime / aLife.x + aLife.y) * aLife.x;
        float k = age / aLife.x;
        float spin = aLife.y * 40.0 + age * 3.0;
        vec3 p = position;
        p.xz = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * p.xz;
        vec3 transformed = p * aLife.z * (1.0 - k * k) + aStart + aVelocity * age + vec3(0.0, -4.9 * age * age, 0.0);`,
      );
  };
  sprayMaterial.customProgramCacheKey = () => 'spray';

  /** The spray of a chunk's waterfalls (see riverData), as a mesh. */
  function spray({ starts, velocities, lives }) {
    const geometry = cube.clone();
    geometry.setAttribute('aStart', new InstancedBufferAttribute(starts, 3));
    geometry.setAttribute('aVelocity', new InstancedBufferAttribute(velocities, 3));
    geometry.setAttribute('aLife', new InstancedBufferAttribute(lives, 3));
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
      geometry.setAttribute('aFreeze', new BufferAttribute(data.freezes, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = 'river';
      mesh.renderOrder = 0; // before the lake or sea, so where it runs on over one that doesn't show through
      mesh.receiveShadow = true;
      const group = new Group();
      group.name = 'rivers';
      group.add(mesh);
      const falls = data.spray ? spray(data.spray) : null;
      if (falls) group.add(falls);
      return group;
    },

    dispose(group) {
      for (const child of group.children) {
        child.geometry.dispose();
        if (child.isInstancedMesh) child.dispose();
      }
    },
  };
}
