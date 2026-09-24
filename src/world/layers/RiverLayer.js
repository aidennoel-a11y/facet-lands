import { BufferAttribute, BufferGeometry, Color, Mesh, MeshPhongMaterial } from 'three';

const RIVER = new Color(0x4fbfc4).lerp(new Color(0x2c67b0), 0.3);
const FOAM = new Color(0xe8f4f6);

/**
 * River water (see Rivers): a ribbon along each river at its water
 * level, a little wider than its bed so its edges tuck under the banks.
 * Light streaks drift down it in chevrons pointing downstream (quicker
 * where it's steeper), so you can see which way it flows; steep stretches
 * would show as white water.
 *
 * The ribbon stops where the river meets a lake or the sea. Drawn on the
 * chunks near you, whose terrain is detailed enough to hold the riverbed.
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
      .replace('#include <common>', '#include <common>\nattribute vec4 flow;\nvarying vec4 vFlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = flow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSky;\nvarying vec4 vFlow;')
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `// flow: x = metres along the river, y = -1..1 across it, z = speed, w = white water.
        float phase = vFlow.x * 0.42 - abs(vFlow.y) * 1.6 - uTime * vFlow.z * 2.4;
        float streak = smoothstep(0.72, 0.97, sin(phase) * 0.5 + 0.5 + 0.35 * sin(vFlow.x * 0.11 + vFlow.y * 2.3));
        gl_FragColor.rgb += streak * step(0.01, vFlow.z) * (0.13 + 0.25 * vFlow.w);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.97, 0.98), vFlow.w * (0.55 + 0.25 * sin(phase * 2.0)));
        gl_FragColor.a = mix(gl_FragColor.a, 1.0, vFlow.w * 0.6);
        float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition) * -1.0), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fresnel * 0.3 * (1.0 - vFlow.w));
        #include <fog_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'river';

  return {
    name: 'rivers',
    material,

    update(time) {
      uniforms.uTime.value = time;
    },

    build({ cx, cz, lod, generator, config }) {
      if (lod > 1 || !generator.rivers) return null;
      const { chunkSize, seaLevel } = config;
      const x0 = cx * chunkSize, z0 = cz * chunkSize;
      const rivers = generator.rivers.inBox(x0, z0, x0 + chunkSize, z0 + chunkSize);
      if (!rivers.length) return null;

      const positions = [];
      const colors = [];
      const flows = [];
      const vertex = (x, y, z, c, alpha, flow) => {
        positions.push(x - x0, y, z - z0);
        colors.push(c.r, c.g, c.b, alpha);
        flows.push(...flow);
      };
      const inChunk = (x, z) => x >= x0 && x < x0 + chunkSize && z >= z0 && z < z0 + chunkSize;

      for (const river of rivers) {
        const { points } = river;
        // Each point's sideways direction, averaged over its neighbours so
        // consecutive quads share edges; and its distance along the river.
        const side = [];
        const along = [0];
        for (let i = 0; i < points.length; i++) {
          const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
          const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
          side.push([-dz / l, dx / l]);
          if (i > 0) along.push(along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
        }
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          if (!inChunk((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
          // Into the sea (or a sea-level lake): its water covers it from here.
          const g = (p) => generator.getHeight(p.x, p.z);
          if (g(a) < seaLevel - 0.2 && g(b) < seaLevel - 0.2) continue;
          const run = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const drop = (a.level - b.level) / run;
          const white = Math.min(1, Math.max(0, (drop - 0.25) / 0.5)); // rapids and waterfalls
          const speed = 0.6 + Math.min(2.4, drop * 6);
          const shade = 0.95 + ((i * 7) % 5) * 0.02;
          const c = RIVER.clone().multiplyScalar(shade).lerp(FOAM, white * 0.5);
          const edge = (k, s) => {
            const p = points[k];
            const half = p.width / 2 + 1.3;
            return [p.x + side[k][0] * half * s, p.level + 0.12, p.z + side[k][1] * half * s, along[k], s];
          };
          const quad = [edge(i, -1), edge(i + 1, -1), edge(i + 1, 1), edge(i, 1)];
          for (const k of [0, 2, 1, 0, 3, 2]) {
            const [x, y, z, u, s] = quad[k];
            vertex(x, y, z, c, 0.84, [u, s, speed, white]);
          }
        }
      }
      if (!positions.length) return null;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
      geometry.setAttribute('flow', new BufferAttribute(new Float32Array(flows), 4));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = 'river';
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      return mesh;
    },

    dispose(mesh) {
      mesh.geometry.dispose();
    },
  };
}
