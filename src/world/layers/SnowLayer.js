import { DodecahedronGeometry, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Euler, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { seasonUniforms } from '../../render/Seasons.js';

// Faceted lumps of snow: drifts on the ground, caps on the boulders.
function lump(base) {
  const g = base.toNonIndexed();
  g.deleteAttribute('uv');
  // Flat underneath; the upper corners pushed about a little.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const s = 0.85 + (h - Math.floor(h)) * 0.3;
    p.setXYZ(i, x * s, Math.max(0, y) * s, z * s);
  }
  g.computeVertexNormals();
  return g;
}
const DRIFT = lump(new IcosahedronGeometry(1, 1));
const CAP = lump(new DodecahedronGeometry(1, 0));

const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), e = new Euler();

/**
 * Snow that lies: in the lands with a real winter, drifts of faceted snow
 * build up over the ground as the winter sets in (and after a snowfall),
 * and caps of it on the boulders, each drift and cap growing in (and
 * later shrinking away) at its own point in the winter, so the snow comes
 * in patches and fills in. On the chunks round about you.
 *
 * @param rocks  the rock layer (for its boulders, to cap)
 */
export function createSnowLayer(config, rocks) {
  const material = new MeshLambertMaterial({ color: 0xf1f5fa, flatShading: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seasonUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSnow;\nuniform float uWinter;\nuniform float uSnowfall;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          // aSnow: how cold a winter it is here, and at what point in the
          // winter this lump of snow builds up.
          float cold = smoothstep(0.3, 0.6, aSnow.x);
          float cover = max(uWinter * 1.1, uSnowfall) * cold;
          transformed *= smoothstep(aSnow.y, aSnow.y + 0.2, cover);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'snow-lumps';
  const meshes = new Set();

  const layer = {
    name: 'snow',
    material,

    // (Nothing to draw with no snow about.)
    update() {
      const on = Math.max(seasonUniforms.uWinter.value, seasonUniforms.uSnowfall.value) > 0.05;
      for (const m of meshes) m.visible = on;
    },

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 1) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      // (Only where the winters are cold at all.)
      let cold = 0;
      for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) cold = Math.max(cold, generator.getSeasonality(x0 + u * size, z0 + v * size));
      if (cold < 0.3) return null;
      const seed = generator.seed ^ 0x5a0f;
      const surface = { normalY: 1 };
      const drifts = [], info = [];
      // Drifts over the open ground.
      const G = 9;
      for (let j = 0; j < size / G; j++) {
        for (let i = 0; i < size / G; i++) {
          const gi = cx * 100 + i, gj = cz * 100 + j;
          if (hash2(gi, gj, seed) > 0.55) continue;
          const lx = (i + hash2(gi, gj, seed + 1)) * G, lz = (j + hash2(gi, gj, seed + 2)) * G;
          const y = groundHeightAt(lx, lz, surface);
          if (!(y > sea + 1.2) || surface.normalY < 0.8) continue;
          if (generator.rivers?.at(x0 + lx, z0 + lz, 1)) continue;
          const w = 1.2 + hash2(gi, gj, seed + 3) * 2.6;
          p.set(lx, y - 0.08, lz);
          q.setFromEuler(e.set(0, hash2(gi, gj, seed + 4) * Math.PI * 2, 0));
          s.set(w, 0.16 + hash2(gi, gj, seed + 5) * 0.3, w * (0.6 + 0.5 * hash2(gi, gj, seed + 6)));
          drifts.push(m4.compose(p, q, s).clone());
          info.push(generator.getSeasonality(x0 + lx, z0 + lz), 0.15 + 0.7 * hash2(gi, gj, seed + 7));
        }
      }
      // Caps on the boulders.
      const caps = [], capInfo = [];
      const boulders = rocks?.boulders.get(`${cx},${cz}`) ?? [];
      for (let k = 0; k < boulders.length; k += 7) {
        const [bx, bz, by, hx, hy, hz, turn] = boulders.slice(k, k + 7);
        if (hy < 0.35) continue;
        p.set(bx - x0, by + hy * 0.72, bz - z0);
        q.setFromEuler(e.set(0, turn, 0));
        s.set(hx * 0.82, Math.min(0.5, hy * 0.3), hz * 0.82);
        caps.push(m4.compose(p, q, s).clone());
        capInfo.push(generator.getSeasonality(bx, bz), 0.05 + 0.4 * hash2(Math.floor(bx), Math.floor(bz), seed + 8));
      }
      if (!drifts.length && !caps.length) return null;
      const make = (shape, list, data) => {
        const geometry = shape.clone();
        geometry.setAttribute('aSnow', new InstancedBufferAttribute(new Float32Array(data), 2));
        const mesh = new InstancedMesh(geometry, material, list.length);
        list.forEach((m, k) => mesh.setMatrixAt(k, m));
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.name = 'snow';
        meshes.add(mesh);
        layer.update();
        return mesh;
      };
      const out = make(DRIFT, drifts, info);
      if (caps.length) out.add(make(CAP, caps, capInfo));
      return out;
    },

    dispose(mesh) {
      for (const m of [mesh, ...mesh.children]) {
        meshes.delete(m);
        m.geometry.dispose(); // (a clone, with its own attribute)
        m.dispose();
      }
    },
  };
  return layer;
}
