import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';

/**
 * Molten lava in the volcanoes that have it (see TerrainGenerator's
 * cones): a lake of it in the crater, and on an erupting one a live flow
 * down the flank in a shallow channel between levees, running under a
 * rock roof in places (a lava tube) and showing through its skylights,
 * until it meets water, where it stops, crusted over.
 *
 * Only orange and black, like the real thing: the molten rock a deep,
 * glowing orange, rippled in slow folds bowed downstream (the middle runs
 * ahead of the edges), black crust forming at its edges and further down
 * the flow as it cools, crazed with orange cracks. It creeps: a few
 * centimetres a second. (Unlit, so it glows at night.)
 */
export function createLavaLayer(config) {
  const uniforms = { uTime: { value: 0 } };
  const material = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aLava;\nvarying vec4 vLava;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLava = aLava;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        varying vec4 vLava;
        float lavaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float lavaNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(lavaHash(i), lavaHash(i + vec2(1.0, 0.0)), f.x), mix(lavaHash(i + vec2(0.0, 1.0)), lavaHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float lavaFbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int k = 0; k < 4; k++) {
            s += a * lavaNoise(p);
            p = p * 2.03 + vec2(17.1, 9.3);
            a *= 0.5;
          }
          return s;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // vLava: x = metres along the flow (or across the lake), y = metres
        // across it, z = how near its edge (0 middle, 1 edge), w = how far
        // it's cooled (0 fresh from the vent .. 1 crusted over), or -1: the lake.
        float lake = step(vLava.w, -0.5);
        float edge = vLava.z, cool = max(vLava.w, 0.0);
        // (Creeping: the flow some 15 cm a second, the lake's crust drifting slower still.)
        vec2 p = lake > 0.5 ? vLava.xy - vec2(uTime * 0.04, uTime * 0.025) : vec2(vLava.x - uTime * 0.15, vLava.y);
        float warp = lavaFbm(p * 0.12);
        // Ropy folds across the flow, bowed downstream; on the lake, slow swirls.
        float fold = lake > 0.5
          ? sin(lavaFbm(p * 0.08) * 14.0 + warp * 4.0)
          : sin((p.x + 0.09 * vLava.y * vLava.y) * 1.3 + warp * 5.0);
        float n = lavaFbm(p * vec2(0.22, 0.4) + 3.0);
        float grain = lavaFbm(p * 0.7 + 11.0);
        // Molten: deep orange, the folds' crests a brighter orange, the
        // middle of the flow hottest.
        vec3 deep = vec3(0.5, 0.08, 0.01), bright = vec3(0.98, 0.34, 0.04);
        vec3 molten = mix(deep, bright, clamp(0.4 + 0.5 * fold * (0.55 + 0.45 * grain) + 0.25 * (1.0 - edge) - 0.25 * cool, 0.0, 1.0));
        // Crust: black, forming at the edges and as it cools (thicker down
        // the flow), broken into plates by glowing orange cracks.
        float crustAmount = lake > 0.5 ? 0.6 + 0.3 * smoothstep(0.6, 1.0, edge) : 0.2 + smoothstep(0.5, 1.0, edge) * 0.7 + cool * 0.7;
        float crust = smoothstep(0.64 - 0.45 * crustAmount, 0.68 - 0.45 * crustAmount, n + 0.15 * (grain - 0.5));
        float crack = (1.0 - smoothstep(0.0, 0.035, abs(lavaFbm(p * 0.35 + 5.0) - 0.5))) * (1.0 - 0.7 * cool);
        vec3 black = mix(vec3(0.03, 0.022, 0.02), vec3(0.09, 0.05, 0.035), grain);
        vec3 crustColour = mix(black, deep * 0.9, crack * 0.85);
        diffuseColor.rgb = mix(molten, crustColour, crust);`,
      );
  };
  material.customProgramCacheKey = () => 'lava-flow';

  // The flows built, to settle onto the land as it's drawn (see drape).
  const meshes = new Set();
  let drapeWait = 0;

  // Far off, the land is drawn coarsely, its big triangles lying below the
  // true slope: a flow there would float over them. So each strip of it
  // across the flow settles onto the land as drawn either side of it
  // (`ground`: (x, z) => the height of the land as drawn), never higher
  // than its own level.
  const drape = (mesh, ground) => {
    const { rows, rowOf, dipOf } = mesh.userData.drape;
    const ys = rows.map((r) => {
      let g = -Infinity;
      for (const [x, z] of r.pts) {
        const h = ground(x, z);
        if (!Number.isFinite(h)) return r.y;
        g = Math.max(g, h);
      }
      return Math.min(r.y, g + 0.25);
    });
    const pos = mesh.geometry.attributes.position;
    let changed = false;
    for (let i = 0; i < rowOf.length; i++) {
      if (rowOf[i] < 0) continue;
      const y = ys[rowOf[i]] - dipOf[i];
      if (pos.getY(i) !== y) (pos.setY(i, y), (changed = true));
    }
    if (changed) pos.needsUpdate = true;
  };

  return {
    name: 'lava',
    material,
    ground: null, // (set from outside: the land's height as drawn)

    update(time) {
      uniforms.uTime.value = time;
      // (Twice a second: the land round you is drawn more finely as you come nearer.)
      drapeWait -= 1;
      if (this.ground && drapeWait <= 0) {
        drapeWait = 30;
        for (const mesh of meshes) drape(mesh, this.ground);
      }
    },

    reuseKey: ({ lod }) => (lod > 3 ? 'none' : 'lava'),

    build({ cx, cz, lod, generator }) {
      if (lod > 3 || !generator.volcanoes) return null;
      const size = config.chunkSize;
      const x0 = cx * size, z0 = cz * size;
      // (Each volcano's lava is built with the chunk holding its summit.)
      const cones = generator.volcanoes(x0, z0, x0 + size, z0 + size).filter((c) => c.lava && c.x >= x0 && c.x < x0 + size && c.z >= z0 && c.z < z0 + size);
      if (!cones.length) return null;
      const positions = [], lava = [], rowOf = [], dipOf = [], rows = [];
      // (`r`: the strip across the flow a point's on, see drape; -1 the lake.
      // A flow's edges dip down under its banks, so they never stand out of the ground.)
      const push = (x, y, z, along, across, edge, cool, r) => {
        const dip = r >= 0 && edge > 0.99 ? 0.8 : 0;
        positions.push(x - x0, y - dip, z - z0);
        lava.push(along, across, edge, cool);
        rowOf.push(r);
        dipOf.push(dip);
      };
      for (const c of cones) {
        // The lake: a disc in the crater, below its rim (in rings, so its edge can crust).
        const level = generator.craterLevel(c);
        const r = c.rc * 0.62, n = 36, rings = [0, 0.55, 0.85, 1];
        for (let i = 0; i < rings.length - 1; i++) {
          for (let k = 0; k < n; k++) {
            const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
            const pt = (a, f) => [c.x + Math.cos(a) * r * f, level, c.z + Math.sin(a) * r * f, Math.cos(a) * r * f, Math.sin(a) * r * f, f, -1];
            const p00 = pt(a0, rings[i]), p01 = pt(a1, rings[i]), p10 = pt(a0, rings[i + 1]), p11 = pt(a1, rings[i + 1]);
            for (const q of [p00, p11, p10, p00, p01, p11]) push(...q, -1);
          }
        }
        // The live flow: along its channel (under the roof where it's a
        // tube), down to where it meets water.
        if (c.active && c.flows.length) {
          let prev = null;
          const f = c.flows[0], end = generator.lavaEnd(c), d0 = c.rc * 0.6; // (from the lake's edge, out through the notch in the rim)
          for (let d = d0; d < end.d; d += 3) {
            const p = generator.lavaPath(c, d);
            if (!p) continue;
            const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
            const px = c.x + ca * d, pz = c.z + sa * d;
            const floor = generator.getBaseHeight(px, pz) - (p.tube ? 3.6 : 0);
            // (Brimming in its channel, level with the land it cut; cooling as it goes, crusted over at its end.)
            const y = floor + 1.0;
            const half = p.half * 1.12; // (its edges tucked under the levees)
            const cool = Math.min(1, 0.6 * ((d - d0) / (f.len * 0.85 - d0)) + Math.max(0, 1 - (end.d - d) / 40)); // (crusting over towards its end, into the rubble there)
            const pts = [-1, -0.5, 0, 0.5, 1].map((t) => [px - sa * half * t, y, pz + ca * half * t, d, half * t, Math.abs(t), cool, rows.length]);
            rows.push({ y, pts: pts.map((q) => [q[0], q[2]]) });
            if (prev) {
              for (let k = 0; k < 4; k++) for (const q of [prev[k], pts[k], prev[k + 1], prev[k + 1], pts[k], pts[k + 1]]) push(...q);
            }
            prev = pts;
          }
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('aLava', new BufferAttribute(new Float32Array(lava), 4));
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = 'lava';
      mesh.userData.drape = { rows, rowOf, dipOf, x0, z0 };
      meshes.add(mesh);
      if (this.ground) drape(mesh, this.ground);
      return mesh;
    },

    dispose(mesh) {
      meshes.delete(mesh);
      mesh.geometry.dispose();
    },
  };
}
