import { BufferAttribute, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../../noise/random.js';
import { windStrength, windTime } from '../../render/wind.js';

/**
 * The stranger corners of the land, near you:
 *  - the petrified forests (see TerrainGenerator.petrifiedAt): the stone
 *    stumps of a forest long gone, banded grey, lavender, rust and amber,
 *    and its great trunks lying broken where they fell;
 *  - the giant flower meadows (giantMeadowAt): wildflowers on stalks taller
 *    than you, nodding in the wind, bees and butterflies about them;
 *  - the glowing swamps (glowSwampAt): fungi and reed-tips and specks on
 *    the water that glow blue-green in the dark.
 * The stone trunks are solid (see wonderCollide); the flowers you push through.
 */
const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), UP = new Vector3(0, 1, 0), tint = new Color();

// (Each face its own colour from `colourAt(y)`, flat-shaded.)
function coloured(g, colourAt) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let v = 0; v < pos.count; v += 3) {
    colourAt(tint, (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3, v);
    for (let k = 0; k < 3; k++) col.set([tint.r, tint.g, tint.b], (v + k) * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// The stone's bands, up a trunk: grey, lavender, rust, amber, cream.
const BANDS = [0x8e8a86, 0x9a84a0, 0xa86a52, 0xc89a5a, 0xd8ccb0, 0x6e6a70].map((c) => new Color(c));
const banded = (c, y, v) => c.copy(BANDS[(Math.floor(y * 3.1 + (v % 7) * 0.13) % BANDS.length + BANDS.length) % BANDS.length]).multiplyScalar(0.88 + ((v * 37) % 10) * 0.025);

/** A stone stump, height 1 (scaled), broken off ragged at the top. */
function stumpGeometry() {
  const g = new CylinderGeometry(0.32, 0.42, 1, 7, 3, false);
  const pos = g.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    if (y > 0.49) pos.setY(v, y - 0.25 * Math.abs(Math.sin(v * 2.7))); // (snapped off)
    pos.setX(v, pos.getX(v) * (1 + 0.08 * Math.sin(v * 1.9)));
  }
  g.translate(0, 0.5, 0);
  return coloured(g, banded);
}

/** A fallen trunk, broken into lengths lying end to end, along +z, 1 long (scaled). */
function logGeometry() {
  const parts = [];
  let z = -0.5;
  for (let k = 0; k < 4; k++) {
    const len = [0.3, 0.22, 0.26, 0.18][k];
    const g = new CylinderGeometry(0.035 - k * 0.003, 0.038 - k * 0.003, len, 7, 1);
    g.rotateX(Math.PI / 2);
    g.rotateZ(k * 0.4);
    g.translate((k % 2 ? 0.01 : -0.008), 0.03, z + len / 2);
    parts.push(g.index ? g.toNonIndexed() : g);
    z += len + 0.012;
  }
  return coloured(mergeGeometries(parts.map((g) => (g.deleteAttribute('uv'), g))), (c, y, v) => banded(c, v * 0.07, v));
}

// Giant flowers (height 1, scaled): a stalk with a couple of leaves, the
// bloom on top: petals (tinted each its own colour) and a centre.
function stalkGeometry() {
  const parts = [new CylinderGeometry(0.012, 0.02, 1, 5).translate(0, 0.5, 0)];
  for (const [y, a] of [[0.35, 0], [0.55, 2.4], [0.72, 4.1]]) {
    const leaf = new ConeGeometry(0.05, 0.22, 4);
    leaf.scale(1, 1, 0.25);
    leaf.rotateZ(-1.0);
    leaf.translate(0.1, y, 0);
    leaf.rotateY(a);
    parts.push(leaf);
  }
  return coloured(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g))), (c, y, v) => c.set(v % 3 ? 0x4f8a34 : 0x5f9a3c));
}
function petalsGeometry(n, len, cup) {
  const parts = [];
  for (let k = 0; k < n; k++) {
    const petal = new ConeGeometry(len * 0.32, len, 4);
    petal.scale(1, 1, 0.28);
    petal.rotateZ(-Math.PI / 2 + cup);
    petal.translate(len * 0.5, 1.0, 0);
    petal.rotateY((k / n) * Math.PI * 2);
    parts.push(petal.index ? petal.toNonIndexed() : petal);
  }
  return coloured(mergeGeometries(parts.map((g) => (g.deleteAttribute('uv'), g))), (c, y, v) => c.setScalar(0.88 + ((v * 13) % 7) * 0.02));
}
function centreGeometry() {
  const g = new DodecahedronGeometry(0.07, 0);
  g.scale(1, 0.5, 1);
  g.translate(0, 1.02, 0);
  return coloured(g, (c, y, v) => c.set(v % 2 ? 0xd89a20 : 0x8a5a18));
}
const FLOWER_COLOURS = [0xf06aa0, 0xf8d040, 0xb070e0, 0xffffff, 0xf08a3a, 0xe84040, 0x70a0f0].map((c) => new Color(c));

// (Swaying in the wind: the stalk's top most, every part of a flower alike.)
function swaying(material, key) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.uniforms.uWind = windStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        float phase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29;
        float bend = position.y * position.y * (0.05 + 0.08 * uWind);
        transformed.x += sin(uTime * 1.3 + phase) * bend;
        transformed.z += cos(uTime * 1.1 + phase * 1.4) * bend * 0.7;`,
      );
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// The glowing swamp's things: a clump of fungi, a glowing reed-tip, a speck on the water.
const glowShroom = () => {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 2.4, d = k ? 0.12 : 0, h = 0.08 + (k % 3) * 0.05;
    parts.push(new CylinderGeometry(0.012, 0.015, h, 4).translate(Math.cos(a) * d, h / 2, Math.sin(a) * d));
    parts.push(new ConeGeometry(0.05 + (k % 2) * 0.02, 0.04, 6).translate(Math.cos(a) * d, h + 0.015, Math.sin(a) * d));
  }
  const g = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => (x.deleteAttribute('uv'), x)));
  return g;
};

const STUMP = stumpGeometry(), LOG = logGeometry(), STALK = stalkGeometry(), CENTRE = centreGeometry();
const PETALS = [petalsGeometry(10, 0.22, 0.15), petalsGeometry(6, 0.26, 0.5), petalsGeometry(16, 0.18, 0.05)];
const SHROOM = glowShroom(), SPECK = new OctahedronGeometry(0.05, 0), REEDTIP = new IcosahedronGeometry(0.06, 0);

// Every chunk's solid stone trunks (for wonderCollide), and its flowers (for the bees and butterflies).
const solids = new Map(); // "cx,cz" -> [x, z, r, top, ...]
const flowers = new Map(); // "cx,cz" -> [x, y (bloom), z, ...]

/** Pushes a walker (at `position`, feet at `feetY`) out of the stone trunks. */
export function wonderCollide(position, radius, feetY, chunkSize) {
  const cx = Math.floor(position.x / chunkSize), cz = Math.floor(position.z / chunkSize);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = solids.get(`${cx + dx},${cz + dz}`);
      if (!list) continue;
      for (let k = 0; k < list.length; k += 4) {
        if (feetY > list[k + 3] - 0.3) continue; // (stood on top of it)
        const ox = position.x - list[k], oz = position.z - list[k + 1], r = list[k + 2] + radius, d = Math.hypot(ox, oz);
        if (d < r && d > 1e-4) (position.x = list[k] + (ox / d) * r), (position.z = list[k + 1] + (oz / d) * r);
      }
    }
  }
}

export function createWonderLayer(config) {
  const stone = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const plant = swaying(new MeshLambertMaterial({ vertexColors: true, flatShading: true }), 'giant-flower');
  const glow = new MeshBasicMaterial({ color: 0x5affd8 });
  const glowBlue = new MeshBasicMaterial({ color: 0x6ad0ff });
  // Bees and butterflies about the flowers nearest you.
  const BEES = 70, FLIES = 40;
  const bees = new InstancedMesh(new OctahedronGeometry(0.035, 0).scale(1, 0.8, 1.4), new MeshLambertMaterial({ color: 0x302010, emissive: 0x403000 }), BEES);
  const wing = new PlaneGeometry(0.12, 0.09).translate(0.06, 0, 0);
  const flies = new InstancedMesh(mergeGeometries([wing.clone(), wing.clone().rotateY(Math.PI)]), new MeshLambertMaterial({ side: 2 }), FLIES);
  for (const m of [bees, flies]) (m.count = 0), (m.frustumCulled = false);
  for (let k = 0; k < FLIES; k++) flies.setColorAt(k, tint.set([0xf0a020, 0xffffff, 0x60a0f0, 0xf060a0][k % 4]));
  const swarm = new Group();
  swarm.name = 'meadow bees and butterflies';
  swarm.add(bees, flies);

  const layer = {
    name: 'wonders',
    material: stone,
    swarm, // (added to the scene by main)
    eye: null, // (the camera's position: set by main, for the bees and butterflies)
    night: 0, // (how dark it is, 0..1: set by main, for the glow)

    reuseKey: ({ lod }) => (lod > 2 ? 'none' : lod > 0 ? 'far' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 2 || !generator.petrifiedAt) return null;
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size, seed = generator.seed ^ 0x3a9b;
      // (Cheaply first: is any of it near this chunk at all?)
      const probe = (fn) => [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].some(([u, v]) => fn(x0 + u * size, z0 + v * size) > 0.05);
      const pet = probe((x, z) => generator.petrifiedAt(x, z)), meadow = lod <= 1 && probe((x, z) => generator.giantMeadowAt(x, z)), swamp = lod === 0 && probe((x, z) => generator.glowSwampAt(x, z));
      if (!pet && !meadow && !swamp) return null;
      const group = new Group();
      group.name = 'wonders';
      const key = `${cx},${cz}`;
      const placed = (G, salt, fn) => {
        const cells = Math.floor(size / G);
        for (let j = 0; j < cells; j++) {
          for (let i = 0; i < cells; i++) {
            const gi = cx * cells + i, gj = cz * cells + j;
            const lx = (i + 0.15 + 0.7 * hash2(gi, gj, seed + salt)) * G, lz = (j + 0.15 + 0.7 * hash2(gi, gj, seed + salt + 1)) * G;
            fn(lx, lz, gi, gj, (k) => hash2(gi, gj, seed + salt + 2 + k));
          }
        }
      };
      const instanced = (geometry, material, list, name, shadow = true) => {
        if (!list.length) return null;
        const mesh = new InstancedMesh(geometry, material, list.length);
        list.forEach(([m, c], n) => {
          mesh.setMatrixAt(n, m);
          if (c) mesh.setColorAt(n, c);
        });
        mesh.name = name;
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        return mesh;
      };
      if (pet) {
        const stumps = [], logs = [], solid = [];
        placed(9, 10, (lx, lz, gi, gj, r) => {
          const pf = generator.petrifiedAt(x0 + lx, z0 + lz);
          if (pf < 0.2 || r(0) > 0.55 * pf) return;
          const y = groundHeightAt(lx, lz);
          if (!(y > config.seaLevel + 0.5)) return;
          if (r(1) < 0.62) {
            const h = 0.6 + r(2) * r(2) * 4.5, w = 0.8 + r(3) * 1.1;
            stumps.push([m4.compose(p.set(lx, y - 0.25, lz), q.setFromAxisAngle(UP, r(4) * 6.28), s.set(w, h, w)).clone()]);
            solid.push(x0 + lx, z0 + lz, 0.4 * w, y + h - 0.25);
          } else {
            const len = 8 + r(2) * 14, w = 0.7 + r(3) * 0.9;
            q.setFromAxisAngle(UP, r(4) * 6.28);
            logs.push([m4.compose(p.set(lx, y - 0.25 * w, lz), q, s.set(len * w * 0.9, len * w * 0.9, len)).clone()]);
            // (Its length solid, a few points along it.)
            const dx = Math.sin(r(4) * 6.28), dz = Math.cos(r(4) * 6.28);
            for (let t = -0.4; t <= 0.4; t += 0.2) solid.push(x0 + lx + dx * t * len, z0 + lz + dz * t * len, 0.035 * len * w * 0.9 + 0.1, y + 0.07 * len * w);
          }
        });
        instanced(STUMP, stone, stumps, 'petrified stumps');
        instanced(LOG, stone, logs, 'petrified logs');
        if (solid.length) solids.set(key, solid), (group.userData.solid = key);
      }
      if (meadow) {
        const stalks = [], blooms = [[], [], []], centres = [], tops = [];
        placed(lod === 0 ? 3.2 : 5.5, 20, (lx, lz, gi, gj, r) => {
          const gm = generator.giantMeadowAt(x0 + lx, z0 + lz);
          if (gm < 0.15 || r(0) > 0.85 * gm) return;
          const y = groundHeightAt(lx, lz);
          if (!(y > config.seaLevel + 1)) return;
          const h = 2.4 + r(1) * 2.4, kind = Math.floor(r(2) * 3), turn = r(3) * 6.28;
          const lean = (r(4) - 0.5) * 0.25;
          q.setFromAxisAngle(UP, turn).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), lean));
          const m = m4.compose(p.set(lx, y - 0.05, lz), q, s.set(h, h, h)).clone();
          stalks.push([m]);
          blooms[kind].push([m, FLOWER_COLOURS[Math.floor(r(5) * FLOWER_COLOURS.length)]]);
          centres.push([m]);
          tops.push(x0 + lx, y + h, z0 + lz);
        });
        instanced(STALK, plant, stalks, 'giant flower stalks', lod === 0);
        blooms.forEach((list, k) => instanced(PETALS[k], plant, list, 'giant flower blooms', lod === 0));
        instanced(CENTRE, plant, centres, 'giant flower centres', false);
        if (tops.length) flowers.set(key, tops), (group.userData.flowers = key);
      }
      if (swamp) {
        const shrooms = [], tips = [], specks = [];
        placed(2.5, 30, (lx, lz, gi, gj, r) => {
          const gs = generator.glowSwampAt(x0 + lx, z0 + lz);
          if (gs < 0.2 || r(0) > 0.6 * gs) return;
          const y = groundHeightAt(lx, lz);
          if (!Number.isFinite(y)) return;
          if (y < config.seaLevel + 0.1) {
            // (Out on the water: a speck of light, floating.)
            for (let k = 0; k < 3; k++) specks.push([m4.compose(p.set(lx + (r(1 + k) - 0.5) * 2, config.seaLevel + 0.03, lz + (r(4 + k) - 0.5) * 2), q.identity(), s.setScalar(0.6 + r(7 + k))).clone()]);
            return;
          }
          if (r(1) < 0.55) shrooms.push([m4.compose(p.set(lx, y - 0.02, lz), q.setFromAxisAngle(UP, r(2) * 6.28), s.setScalar(1 + r(3) * 1.6)).clone()]);
          else tips.push([m4.compose(p.set(lx, y + 1.1 + r(2) * 0.6, lz), q.identity(), s.setScalar(0.7 + r(3) * 0.6)).clone()]);
        });
        instanced(SHROOM, glow, shrooms, 'glowing swamp fungi', false);
        instanced(REEDTIP, glowBlue, tips, 'glowing reed tips', false);
        instanced(SPECK, glow, specks, 'glowing specks on the water', false);
      }
      return group.children.length ? group : null;
    },

    update(time) {
      // The glow: faint by day, bright at night.
      const k = 0.35 + 0.65 * Math.min(1, layer.night * 1.3);
      glow.color.setRGB(0.35 * k, 1.0 * k, 0.85 * k);
      glowBlue.color.setRGB(0.42 * k, 0.82 * k, 1.0 * k);
      // The bees and butterflies, about the giant flowers near you (by day).
      const e = layer.eye;
      if (!e || layer.night > 0.6) {
        bees.count = flies.count = 0;
        return;
      }
      const near = [];
      const C = config.chunkSize, cx = Math.floor(e.x / C), cz = Math.floor(e.z / C);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const list = flowers.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 3) if (Math.abs(list[k] - e.x) < 45 && Math.abs(list[k + 2] - e.z) < 45) near.push(k / 3 + (dx + 1) * 1e4 + (dz + 1) * 3e4, list[k], list[k + 1], list[k + 2]);
      }
      const n = near.length / 4;
      if (!n) {
        bees.count = flies.count = 0;
        return;
      }
      for (let k = 0; k < BEES; k++) {
        const f = (k * 7) % n, fx = near[f * 4 + 1], fy = near[f * 4 + 2], fz = near[f * 4 + 3];
        const a = time * (2.2 + (k % 5) * 0.5) + k * 1.7, r = 0.3 + (k % 4) * 0.18;
        bees.setMatrixAt(k, m4.compose(p.set(fx + Math.cos(a) * r, fy + 0.1 + Math.sin(a * 1.9) * 0.15, fz + Math.sin(a) * r), q.setFromAxisAngle(UP, -a), s.setScalar(1)));
      }
      for (let k = 0; k < FLIES; k++) {
        // (A butterfly: drifting from flower to flower, wings beating.)
        const leg = Math.floor(time / 6 + k * 0.37), t = time / 6 + k * 0.37 - leg;
        const f0 = (k * 13 + leg * 7) % n, f1 = (k * 13 + (leg + 1) * 7) % n, ease = t * t * (3 - 2 * t);
        const fx = near[f0 * 4 + 1] + (near[f1 * 4 + 1] - near[f0 * 4 + 1]) * ease, fz = near[f0 * 4 + 3] + (near[f1 * 4 + 3] - near[f0 * 4 + 3]) * ease;
        const fy = near[f0 * 4 + 2] + (near[f1 * 4 + 2] - near[f0 * 4 + 2]) * ease + 0.4 + Math.sin(t * Math.PI) * 1.2 + Math.sin(time * 3 + k) * 0.15;
        const flap = Math.sin(time * 14 + k) * 0.9;
        q.setFromAxisAngle(UP, Math.atan2(near[f1 * 4 + 1] - near[f0 * 4 + 1], near[f1 * 4 + 3] - near[f0 * 4 + 3]));
        flies.setMatrixAt(k, m4.compose(p.set(fx, fy, fz), q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), flap)), s.setScalar(1.3)));
      }
      bees.count = BEES;
      flies.count = FLIES;
      bees.instanceMatrix.needsUpdate = flies.instanceMatrix.needsUpdate = true;
    },

    dispose(group) {
      if (group.userData.solid) solids.delete(group.userData.solid);
      if (group.userData.flowers) flowers.delete(group.userData.flowers);
      for (const m of group.children) m.dispose(); // (the shapes are shared)
    },
  };
  return layer;
}
