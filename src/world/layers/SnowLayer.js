import { ConeGeometry, DodecahedronGeometry, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Euler, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { seasonUniforms } from '../../render/Seasons.js';
import { fallIce } from '../riverData.js';

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
// An icicle: a thin cone hanging point down from y = 0 to y = -1.
const ICICLE = new ConeGeometry(1, 1, 5).toNonIndexed();
ICICLE.deleteAttribute('uv');
ICICLE.rotateX(Math.PI);
ICICLE.translate(0, -0.5, 0);
ICICLE.computeVertexNormals();

const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), e = new Euler();

// Snow (and ice) that builds up through the winter, each piece at its own
// point in it (see aSnow).
function seasonal(material, key) {
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
  material.customProgramCacheKey = () => key;
  return material;
}

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
  const material = seasonal(new MeshLambertMaterial({ color: 0xf1f5fa, flatShading: true }), 'snow-lumps');
  // (Icicles: clear blue-white ice.)
  const ice = seasonal(new MeshLambertMaterial({ color: 0xcfe6f4, emissive: 0x1a2a36, flatShading: true, transparent: true, opacity: 0.88 }), 'snow-icicles');
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
      const drifts = [], info = [], seasonal = new Map();
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
          // (How cold its winters are: broad, so looked up once per 16 m patch.)
          const c = Math.floor(lx / 16) * 64 + Math.floor(lz / 16);
          if (!seasonal.has(c)) seasonal.set(c, generator.getSeasonality(x0 + Math.floor(lx / 16) * 16 + 8, z0 + Math.floor(lz / 16) * 16 + 8));
          info.push(seasonal.get(c), 0.15 + 0.7 * hash2(gi, gj, seed + 7));
        }
      }
      // Caps on the boulders.
      const caps = [], capInfo = [], icicles = [], iceInfo = [];
      const boulders = rocks?.boulders.get(`${cx},${cz}`) ?? [];
      for (let k = 0; k < boulders.length; k += 7) {
        const [bx, bz, by, hx, hy, hz, turn] = boulders.slice(k, k + 7);
        if (hy < 0.35) continue;
        p.set(bx - x0, by + hy * 0.72, bz - z0);
        q.setFromEuler(e.set(0, turn, 0));
        s.set(hx * 0.82, Math.min(0.5, hy * 0.3), hz * 0.82);
        caps.push(m4.compose(p, q, s).clone());
        capInfo.push(generator.getSeasonality(bx, bz), 0.05 + 0.4 * hash2(Math.floor(bx), Math.floor(bz), seed + 8));
        // Icicles hanging from the cap's rim, in the depth of winter.
        const ix = Math.floor(bx * 7), iz = Math.floor(bz * 7);
        if (hy > 0.6 && hash2(ix, iz, seed + 9) < 0.5) {
          const n = 3 + Math.floor(hash2(ix, iz, seed + 10) * 5);
          for (let t = 0; t < n; t++) {
            const a = turn + (t / n) * Math.PI * 2 + hash2(ix + t, iz, seed + 11) * 0.6;
            // (Out on the boulder's rim, a little under the cap's lip.)
            const rx = Math.cos(a) * hx * 0.78, rz = Math.sin(a) * hz * 0.78;
            p.set(bx - x0 + rx, by + hy * 0.55, bz - z0 + rz);
            const len = 0.2 + hash2(ix + t, iz, seed + 12) * 0.5, r = 0.03 + 0.03 * hash2(ix, iz + t, seed + 13);
            icicles.push(m4.compose(p, q.identity(), s.set(r, len, r)).clone());
            iceInfo.push(generator.getSeasonality(bx, bz), 0.7 + 0.2 * hash2(ix + t, iz + t, seed + 14));
          }
        }
      }
      // Icicles, a curtain of them, over the lip of a frozen waterfall.
      for (const course of generator.rivers?.inBox(x0, z0, x0 + size, z0 + size) ?? []) {
        const P = course.points;
        for (let k = 0; k < P.length - 1; k++) {
          const a = P[k], b = P[k + 1];
          if (a.x < x0 || a.x >= x0 + size || a.z < z0 || a.z >= z0 + size) continue;
          const run = Math.hypot(b.x - a.x, b.z - a.z) || 1, fall = a.level - b.level;
          if (fall / run < 0.4 || fall < 0.8) continue;
          const frozen = fallIce(generator, a.x, a.z);
          if (frozen < 0.3) continue;
          const ux = (b.x - a.x) / run, uz = (b.z - a.z) / run;
          const width = Math.max(1.5, Math.max(a.width, b.width) * 0.9);
          const n = Math.round(width * 3);
          for (let t = 0; t < n; t++) {
            const h = hash2(Math.floor(a.x * 3) + t, Math.floor(a.z * 3), seed + 15);
            const across = (t / Math.max(1, n - 1) - 0.5) * width;
            p.set(a.x - x0 - uz * across + ux * 0.3, a.level + 0.1, a.z - z0 + ux * across + uz * 0.3);
            const len = fall * (0.35 + 0.65 * h) + 0.3, r = 0.1 + 0.18 * h * Math.min(1, fall / 3);
            icicles.push(m4.compose(p, q.identity(), s.set(r, len, r)).clone());
            iceInfo.push(1, 0.55 + 0.3 * h * (1 - frozen));
          }
        }
      }
      if (!drifts.length && !caps.length && !icicles.length) return null;
      const make = (shape, list, data, mat = material) => {
        const geometry = shape.clone();
        geometry.setAttribute('aSnow', new InstancedBufferAttribute(new Float32Array(data), 2));
        const mesh = new InstancedMesh(geometry, mat, list.length);
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
      if (icicles.length) out.add(make(ICICLE, icicles, iceInfo, ice));
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
