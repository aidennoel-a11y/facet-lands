import { BoxGeometry, Color, CylinderGeometry, DodecahedronGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';

// Sinter: the pale, crusted rock that builds up round hot springs and geysers.
const SINTER = [0xe8e0cc, 0xd9d0bb, 0xf0ead8, 0xcfc4ac, 0xdcc9a0].map((c) => new Color(c));
const slab = new DodecahedronGeometry(1, 0).toNonIndexed();
slab.scale(1, 0.35, 1);
slab.computeVertexNormals();
const vent = new CylinderGeometry(0.55, 0.7, 0.3, 7);
const m4 = new Matrix4(), pos = new Vector3(), rot = new Quaternion(), scl = new Vector3(), yAxis = new Vector3(0, 1, 0);

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
  const sinterMaterial = new MeshLambertMaterial({ flatShading: true });
  const ventMaterial = new MeshLambertMaterial({ color: 0x2a2622 });
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
        float v = (15.0 + 14.0 * aDrop.y) * (0.55 + 0.45 * surge);
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
      const springs = generator.hotSprings(x0, z0, x0 + size, z0 + size).filter((g) => g.x >= x0 && g.x < x0 + size && g.z >= z0 && g.z < z0 + size);
      if (!springs.length) return null;
      const group = new Group();
      group.name = 'geysers';
      const starts = [], drops = [], cycles = [], rims = [], vents = [];
      const seed = generator.seed ^ 0x6e75;
      for (const g of springs) {
        const y = generator.getHeight(g.x, g.z);
        if (y < config.seaLevel + 1) continue;
        const h = (k, n) => hash2(Math.floor(g.x) + k * 13, Math.floor(g.z) - k * 7, seed + n);
        // A rim of sinter slabs round the pool, or round the geyser's vent
        // with a crusted apron spreading out from it.
        const ring = g.geyser ? 1.3 : g.r * 1.05;
        const count = g.geyser ? 9 : Math.round(8 + g.r * 2.2);
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2 + h(k, 20) * 0.4;
          const d = ring * (0.95 + 0.2 * h(k, 21));
          const px = g.x + Math.cos(a) * d, pz = g.z + Math.sin(a) * d;
          const s = (g.geyser ? 0.6 : 0.8) + 0.7 * h(k, 22);
          rims.push([px - x0, generator.getHeight(px, pz) + 0.05, pz - z0, s, h(k, 23)]);
        }
        const apron = g.geyser ? 14 : Math.round(6 + g.r);
        for (let k = 0; k < apron; k++) {
          const a = h(k, 30) * Math.PI * 2, d = ring * (1.3 + 1.4 * h(k, 31));
          const px = g.x + Math.cos(a) * d, pz = g.z + Math.sin(a) * d;
          rims.push([px - x0, generator.getHeight(px, pz) - 0.05, pz - z0, 0.7 + 0.9 * h(k, 32), h(k, 33)]);
        }
        if (!g.geyser) continue;
        vents.push([g.x - x0, y, g.z - z0]);
        for (let k = 0; k < 160; k++) {
          starts.push(g.x - x0 + (h(k, 1) - 0.5) * 0.8, y, g.z - z0 + (h(k, 2) - 0.5) * 0.8);
          drops.push(h(k, 3), h(k, 4) * g.strength, h(k, 5) * Math.PI * 2, 0.35 + 0.6 * h(k, 6));
          cycles.push(g.period, g.phase);
        }
      }
      if (rims.length) {
        const mesh = new InstancedMesh(slab, sinterMaterial, rims.length);
        rims.forEach(([x, y, z, s, r], k) => {
          pos.set(x, y, z);
          rot.setFromAxisAngle(yAxis, r * Math.PI * 2);
          scl.set(s, s * (0.6 + 0.6 * r), s * (0.8 + 0.4 * r));
          mesh.setMatrixAt(k, m4.compose(pos, rot, scl));
          mesh.setColorAt(k, SINTER[Math.floor(r * SINTER.length)]);
        });
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      for (const [x, y, z] of vents) {
        const v = new Mesh(vent, ventMaterial);
        v.position.set(x, y - 0.05, z);
        group.add(v);
      }
      if (starts.length) {
        const geometry = cube.clone();
        geometry.setAttribute('aStart', new InstancedBufferAttribute(new Float32Array(starts), 3));
        geometry.setAttribute('aDrop', new InstancedBufferAttribute(new Float32Array(drops), 4));
        geometry.setAttribute('aCycle', new InstancedBufferAttribute(new Float32Array(cycles), 2));
        const mesh = new InstancedMesh(geometry, material, starts.length / 3);
        mesh.frustumCulled = false; // it moves on the GPU; there are only a few
        mesh.renderOrder = 5;
        mesh.name = 'geyser';
        group.add(mesh);
      }
      return group.children.length ? group : null;
    },

    dispose(group) {
      for (const child of group.children) {
        if (child.name === 'geyser') child.geometry.dispose(); // (the rest share theirs)
        child.dispose?.();
      }
    },
  };
}
