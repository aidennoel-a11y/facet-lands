import { BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { placeFlowers } from '../decorPlacement.js';
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
const tilt = new Quaternion(), lean = new Vector3();

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

    build({ cx, cz, lod, generator, groundHeightAt, prepared }) {
      if (lod > config.grassMaxLod || !generator.getMeadow) return null;
      // (Where they go: worked out by a chunk worker; here only if it wasn't.)
      const data = prepared && prepared.flowers !== undefined ? prepared.flowers : placeFlowers(generator, config, cx, cz, groundHeightAt, COLOURS.length);
      if (!data) return null;
      const list = [];
      for (let k = 0; k < data.length; k += 8) list.push([data[k], data[k + 1], data[k + 2], data[k + 3], data[k + 4], COLOURS[data[k + 5]], data[k + 6], data[k + 7]]);
      const stemMesh = new InstancedMesh(stems, stemMaterial, list.length);
      const headMesh = new InstancedMesh(heads, headMaterial, list.length);
      list.forEach(([x, y, z, sc, r, colour, nx, nz], k) => {
        p.set(x, y - 0.03, z);
        // (Growing out of the slope: leaning part of the way with the
        // ground, as a stem does, turning back up to the light.)
        tilt.setFromUnitVectors(yAxis, lean.set(nx * 0.6, 1, nz * 0.6).normalize());
        q.setFromAxisAngle(yAxis, r * Math.PI * 2).premultiply(tilt);
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
