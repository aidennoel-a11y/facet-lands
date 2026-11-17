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

// --- Sunflowers ---------------------------------------------------------------------
// (The flowers of some of the meadows: data colour 10. See placeFlowers.)
export const SUNFLOWER = 10;
/** The sun's direction, for the sunflowers to turn to (set to DayNight's sunDir by main). */
export const sunflowerSun = { value: new Vector3(1, 0.5, 0) };

/** Coloured triangles into a geometry: [[a, b, c, colour], ...]. */
function painted(tris) {
  const pos = [], col = [], c = new Color();
  for (const [a, b, d, colour] of tris) {
    pos.push(...a, ...b, ...d);
    c.set(colour);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

/** A sunflower's stalk, 1 m tall (scaled up to its height), thick and hairy-green, with big heart-shaped leaves up it. */
function sunflowerStalk() {
  const tris = [], G = 0x4a7a2a, GL = 0x5f9434, GD = 0x3a6422;
  const ring = (y, r) => [0, 1, 2, 3, 4].map((k) => [Math.cos((k / 5) * Math.PI * 2) * r, y, Math.sin((k / 5) * Math.PI * 2) * r]);
  const a = ring(0, 0.03), b = ring(1, 0.02);
  for (let k = 0; k < 5; k++) {
    const m = (k + 1) % 5;
    tris.push([a[k], b[k], b[m], G], [a[k], b[m], a[m], G]);
  }
  // (The leaves: broad, pointed, drooping a little, round the stalk.)
  for (let k = 0; k < 5; k++) {
    const y = 0.22 + k * 0.15, ang = k * 2.4, ca = Math.cos(ang), sa = Math.sin(ang), L = 0.3 - k * 0.03, W = 0.12 - k * 0.01;
    const base = [ca * 0.02, y, sa * 0.02], tip = [ca * L, y - 0.08, sa * L];
    const side = (s) => [ca * L * 0.45 - sa * W * s, y + 0.03, sa * L * 0.45 + ca * W * s];
    tris.push([base, side(1), tip, k % 2 ? GL : GD], [base, tip, side(-1), k % 2 ? GD : GL]);
  }
  return painted(tris);
}

/**
 * A sunflower's head, facing +z, its middle at the origin: the big brown
 * seed-disc, a ring of golden petals round it, green bracts behind. (Turned
 * to the sun in the shader: see sunflowerMaterial.)
 */
function sunflowerHead() {
  const tris = [], N = 16, R0 = 0.13, R1 = 0.3;
  const DISC = 0x4a2c14, DISC_RIM = 0x6a4420, PETAL = 0xf2c018, PETAL_TIP = 0xf6d84a, BRACT = 0x4f7a2a;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    const at = (a, r, z = 0) => [Math.cos(a) * r, Math.sin(a) * r, z];
    tris.push([[0, 0, 0.035], at(a1, R0, 0.01), at(a0, R0, 0.01), k % 2 ? DISC : DISC_RIM]); // (the disc, domed a little)
    tris.push([at(a0, R0 * 0.95, 0.005), at(a1, R0 * 0.95, 0.005), at(am, R1, -0.02), k % 2 ? PETAL : PETAL_TIP]); // (a petal)
    tris.push([at(a1, R0 * 0.9, -0.02), at(a0, R0 * 0.9, -0.02), [0, 0, -0.07], BRACT]); // (the green back)
  }
  return painted(tris);
}

/** The heads' material: each turned to face the sun (east before dawn), drooping at night; seasonal, swaying a little. */
function sunflowerMaterial(bloom) {
  const m = bloom(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), 'sunflower-head');
  const previous = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uSunflowerSun = sunflowerSun;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uSunflowerSun;
mat3 sunflowerTurn() {
  vec3 sd = normalize(uSunflowerSun);
  float day = smoothstep(-0.08, 0.12, sd.y);
  // (By day the sun's way, tilted up towards it; by night east, waiting for it, and drooping.)
  vec3 face = normalize(mix(vec3(1.0, -0.45, 0.0), vec3(sd.x, clamp(sd.y, -0.1, 0.75) * 0.8, sd.z), day));
  float yaw = atan(face.x, face.z), pitch = -asin(clamp(face.y, -0.95, 0.95));
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  return ry * rx;
}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = sunflowerTurn() * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = sunflowerTurn() * transformed;');
    previous?.call(m, shader, renderer);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ''}|sunturn`;
  return m;
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
  const sunStalks = sunflowerStalk(), sunHeads = sunflowerHead();
  const sunStalkMaterial = bloom(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, flatShading: true }), 'sunflower-stalk');
  const sunHeadMaterial = sunflowerMaterial(bloom);
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
      const list = [], heather = [], suns = [];
      for (let k = 0; k < data.length; k += 8) if (data[k + 5] === SUNFLOWER) suns.push([data[k], data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 6], data[k + 7]]);
      else (data[k + 5] >= 7 ? heather : list).push([data[k], data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 5] >= 7 ? HEATHER[data[k + 5] - 7] : COLOURS[data[k + 5]], data[k + 6], data[k + 7]]);
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
      // (The sunflowers: tall stalks, their heads turned to the sun.)
      if (suns.length) {
        const stalks = new InstancedMesh(sunStalks, sunStalkMaterial, suns.length), hds = new InstancedMesh(sunHeads, sunHeadMaterial, suns.length);
        suns.forEach(([x, y, z, sc, r], k) => {
          const h = sc; // (the stalk's height, m)
          p.set(x, y - 0.05, z);
          q.setFromAxisAngle(yAxis, r * Math.PI * 2);
          s.set(1 + 0.3 * r, h, 1 + 0.3 * r);
          stalks.setMatrixAt(k, m4.compose(p, q, s));
          // (The head on top: no turn of its own, so it faces the sun the same as all the rest.)
          p.set(x, y - 0.05 + h * 0.99, z);
          q.identity();
          s.setScalar(0.85 + 0.45 * r);
          hds.setMatrixAt(k, m4.compose(p, q, s));
        });
        stalks.computeBoundingSphere();
        hds.computeBoundingSphere();
        stalks.castShadow = hds.castShadow = true;
        stalks.receiveShadow = hds.receiveShadow = true;
        stalks.name = 'sunflower stalks';
        hds.name = 'sunflowers';
        headMesh.add(stalks, hds);
      }
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
