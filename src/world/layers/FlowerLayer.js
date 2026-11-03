import { BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { placeFlowers } from '../decorPlacement.js';
import { seasonUniforms } from '../../render/Seasons.js';
import { addWind } from '../../render/wind.js';

// Wildflowers: lupins, buttercups, daisies, poppies, cornflowers, clover...
const COLOURS = [0x8a5cc9, 0xf2d23c, 0xf4f1e6, 0xd8322e, 0x4f7fd6, 0xe07ab8, 0xf29a3a].map((c) => new Color(c));
// (And the heather, high in the mountains: its purples and pinks, from 7 on in the data.)
const HEATHER = [0xffffff, 0xf0e4f4, 0xe4ece0].map((c) => new Color(c)); // (shades only: the clump has its own colours)

/**
 * A clump of heather: a low cushion of dark, needle-fine foliage, and
 * rising from it wiry stems, each ending in a spike of tiny purple-pink
 * bells; the colours its own (the instance colour only shades it).
 * Some 50 triangles.
 */
function heatherClump() {
  const pos = [], col = [];
  const tri = (a, b, c, hex) => {
    pos.push(...a, ...b, ...c);
    const k = new Color(hex);
    for (let v = 0; v < 3; v++) col.push(k.r, k.g, k.b);
  };
  const FOLIAGE = [0x34512a, 0x42602e, 0x3a4a26], STEM = 0x5a4a30, BELLS = [0x9a4fa8, 0xb868b0, 0x86408e, 0xa85aa0];
  // (The cushion: narrow blades fanning out low from the middle.)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.3, r = 0.26 + (k % 3) * 0.05, w = 0.07;
    const tip = [Math.cos(a) * r, 0.1 + (k % 2) * 0.05, Math.sin(a) * r];
    tri([-Math.sin(a) * w, 0.02, Math.cos(a) * w], [Math.sin(a) * w, 0.02, -Math.cos(a) * w], tip, FOLIAGE[k % 3]);
    tri([0, 0.14, 0], [-Math.sin(a) * w * 0.6, 0.03, Math.cos(a) * w * 0.6], tip, FOLIAGE[(k + 1) % 3]);
  }
  // (The stems, each with its spike of bells: a slim three-sided spire, purple.)
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.5, r = k === 0 ? 0 : 0.08 + (k % 3) * 0.06, lean = 0.06 + (k % 2) * 0.05;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, h = 0.3 + (k % 3) * 0.07;
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean, mid = h * 0.5;
    const mx = bx + (tx - bx) * 0.5, mz = bz + (tz - bz) * 0.5;
    tri([bx - 0.012, 0.02, bz], [bx + 0.012, 0.02, bz], [mx, mid, mz], STEM);
    const sw = 0.035, bell = BELLS[k % BELLS.length];
    for (let f = 0; f < 3; f++) {
      const b0 = (f / 3) * Math.PI * 2, b1 = b0 + (Math.PI * 2) / 3;
      tri([mx + Math.cos(b0) * sw, mid, mz + Math.sin(b0) * sw], [mx + Math.cos(b1) * sw, mid, mz + Math.sin(b1) * sw], [tx, h, tz], bell);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

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
  const stems = stem(), heads = head(), clump = heatherClump();
  const heatherMaterial = addWind(new MeshLambertMaterial({ side: DoubleSide, flatShading: true, vertexColors: true }), { strength: 0.012, speed: 1.4 });
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
      const list = [], heather = [];
      for (let k = 0; k < data.length; k += 8) (data[k + 5] >= 7 ? heather : list).push([data[k], data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 5] >= 7 ? HEATHER[data[k + 5] - 7] : COLOURS[data[k + 5]], data[k + 6], data[k + 7]]);
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
      // (The heather: low clumps hugging the ground, not on stems; there all year.)
      if (heather.length) {
        const hm = new InstancedMesh(clump, heatherMaterial, heather.length);
        heather.forEach(([x, y, z, sc, r, colour, nx, nz], k) => {
          p.set(x, y - 0.02, z);
          tilt.setFromUnitVectors(yAxis, lean.set(nx, 1, nz).normalize());
          q.setFromAxisAngle(yAxis, r * Math.PI * 2).premultiply(tilt);
          s.set(sc, sc * (0.7 + 0.6 * r), sc);
          hm.setMatrixAt(k, m4.compose(p, q, s));
          hm.setColorAt(k, colour);
        });
        hm.computeBoundingSphere();
        hm.receiveShadow = true;
        hm.name = 'heather';
        headMesh.add(hm);
      }
      return headMesh;
    },

    dispose(mesh) {
      for (const child of mesh.children) child.dispose();
      mesh.dispose(); // (the shapes are shared)
    },
  };
}
