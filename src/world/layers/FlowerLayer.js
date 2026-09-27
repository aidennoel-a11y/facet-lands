import { BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { seasonUniforms } from '../../render/Seasons.js';
import { addWind } from '../../render/wind.js';

// Wildflowers: lupins, buttercups, daisies, poppies, cornflowers, clover...
const COLOURS = [0x8a5cc9, 0xf2d23c, 0xf4f1e6, 0xd8322e, 0x4f7fd6, 0xe07ab8, 0xf29a3a].map((c) => new Color(c));

/** A flower's stem, 0.45 m tall. */
function stem() {
  const g = new ConeGeometry(0.018, 0.45, 3, 1).toNonIndexed();
  g.translate(0, 0.225, 0);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Its heads: a little bunch of three, each five petals round a centre, at the top. */
function head() {
  const pos = [];
  const R = 0.12;
  for (const [ox, oy, oz, sc] of [[0, 0.47, 0, 1], [0.1, 0.4, 0.06, 0.8], [-0.07, 0.36, -0.09, 0.7]]) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, b = a + 0.5, c = a - 0.5, r = R * sc;
      pos.push(ox, oy + 0.02, oz, ox + Math.cos(c) * r, oy, oz + Math.sin(c) * r, ox + Math.cos(b) * r, oy, oz + Math.sin(b) * r);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), yAxis = new Vector3(0, 1, 0);

/**
 * Wildflower meadows (see TerrainGenerator.getMeadow): flowers thick in
 * the grass, a few colours to a patch, swaying in the wind; they come out
 * in spring, are at their best in summer and fade away in autumn. On the
 * chunks right around you.
 */
export function createFlowerLayer(config) {
  const stems = stem(), heads = head();
  const bloom = (material, key) => {
    addWind(material, { strength: 0.03, speed: 1.6 });
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      shader.uniforms.uAutumn = seasonUniforms.uAutumn;
      shader.uniforms.uWinter = seasonUniforms.uWinter;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uAutumn;\nuniform float uWinter;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= (1.0 - smoothstep(0.2, 0.8, uAutumn)) * (1.0 - smoothstep(0.0, 0.3, uWinter));');
    };
    const prevKey = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${key}`;
    return material;
  };
  const stemMaterial = bloom(new MeshLambertMaterial({ color: 0x4f7a32 }), 'flower-stem');
  const headMaterial = bloom(new MeshLambertMaterial({ side: DoubleSide }), 'flower-head');

  return {
    name: 'flowers',
    material: headMaterial,

    reuseKey: ({ lod }) => (lod > config.grassMaxLod ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > config.grassMaxLod || !generator.getMeadow) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      // (A quick look first: any meadow here at all?)
      let any = 0;
      for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) any = Math.max(any, generator.getMeadow(x0 + (i * size) / 4, z0 + (j * size) / 4));
      if (any < 0.05) return null;
      const G = 1.0, n = Math.round(size / G), seed = generator.seed ^ 0xf10e;
      const surface = { normalY: 1 };
      const list = [];
      let cell = -1, meadow = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = cx * n + i, gj = cz * n + j;
          const keep = hash2(gi, gj, seed);
          if (keep > 0.7) continue;
          const lx = (i + hash2(gi, gj, seed + 1)) * G, lz = (j + hash2(gi, gj, seed + 2)) * G;
          // (The meadow looked up once per 8 m patch.)
          const c = Math.floor(lx / 8) * 64 + Math.floor(lz / 8);
          if (c !== cell) {
            cell = c;
            meadow = generator.getMeadow(x0 + Math.floor(lx / 8) * 8 + 4, z0 + Math.floor(lz / 8) * 8 + 4);
          }
          if (keep > 0.7 * meadow) continue;
          const y = groundHeightAt(lx, lz, surface);
          if (!(y > sea + 1.5) || surface.normalY < 0.85 || y > 150) continue;
          if (generator.rivers?.at(x0 + lx, z0 + lz, 1.5)) continue; // (not in a stream, nor right on its bank)
          // A few colours to a patch.
          const tone = generator.meadowNoise.noise2D((x0 + lx) * 0.03, (z0 + lz) * 0.03) * 0.5 + 0.5;
          const pick = Math.floor((tone * 3 + hash2(gi, gj, seed + 3) * 1.6) % COLOURS.length);
          list.push([lx, y, lz, 0.7 + 0.7 * hash2(gi, gj, seed + 4), hash2(gi, gj, seed + 5), COLOURS[pick]]);
        }
      }
      if (!list.length) return null;
      const stemMesh = new InstancedMesh(stems, stemMaterial, list.length);
      const headMesh = new InstancedMesh(heads, headMaterial, list.length);
      list.forEach(([x, y, z, sc, r, colour], k) => {
        p.set(x, y - 0.03, z);
        q.setFromAxisAngle(yAxis, r * Math.PI * 2);
        s.set(sc, sc * (0.8 + 0.5 * r), sc);
        m4.compose(p, q, s);
        stemMesh.setMatrixAt(k, m4);
        headMesh.setMatrixAt(k, m4);
        headMesh.setColorAt(k, colour);
      });
      stemMesh.computeBoundingSphere();
      headMesh.computeBoundingSphere();
      headMesh.add(stemMesh);
      headMesh.name = 'flowers';
      return headMesh;
    },

    dispose(mesh) {
      mesh.children[0]?.dispose();
      mesh.dispose(); // (the shapes are shared)
    },
  };
}
