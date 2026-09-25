import { BufferAttribute, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';
import { seasonalWood } from '../../render/Seasons.js';

const BARK = [0x5a4232, 0x4e3a2c, 0x654a36];
const WOOD = new Color(0xb89468); // the cut or broken end
const MOSS = [0x5d7a34, 0x6b8a3c, 0x4f6c2e];

/** Colours a non-indexed piece face by face: `pick(face centre, normal)` gives each face's colour. */
function paint(g, pick, seed) {
  const rand = mulberry32(seed);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let f = 0; f < pos.count; f += 3) {
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const n = [(nor.getX(f) + nor.getX(f + 1) + nor.getX(f + 2)) / 3, (nor.getY(f) + nor.getY(f + 1) + nor.getY(f + 2)) / 3, (nor.getZ(f) + nor.getZ(f + 1) + nor.getZ(f + 2)) / 3];
    c.copy(pick(cy, n, rand)).multiplyScalar(0.88 + rand() * 0.24);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

const bark = (rand) => new Color(BARK[Math.floor(rand() * BARK.length)]);
const moss = (rand) => new Color(MOSS[Math.floor(rand() * MOSS.length)]);

/** A fallen log a metre long and a metre across, lying along x, centred, resting on y = 0: bark, moss along its top, pale broken ends. */
function log(seed) {
  const g = new CylinderGeometry(0.5, 0.5, 1, 7, 3).toNonIndexed();
  g.deleteAttribute('uv');
  g.rotateZ(Math.PI / 2);
  // A little lumpy and bent.
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const h = hash2(Math.round(x * 50), Math.round(pos.getY(k) * 50 + pos.getZ(k) * 70), seed);
    pos.setY(k, pos.getY(k) * (0.92 + 0.16 * h) + 0.06 * Math.sin(x * 3 + seed));
    pos.setZ(k, pos.getZ(k) * (0.92 + 0.16 * h));
  }
  g.translate(0, 0.45, 0);
  g.computeVertexNormals();
  return paint(g, (cy, n, rand) => (Math.abs(n[0]) > 0.7 ? WOOD : n[1] > 0.45 && rand() < 0.8 ? moss(rand) : bark(rand)), seed);
}

/** A stump: a short, broken-off trunk flaring into roots, its top a pale ring of cut wood. */
function stump(seed) {
  const rand = mulberry32(seed);
  const parts = [new CylinderGeometry(0.42, 0.55, 0.8, 7, 1).translate(0, 0.4, 0)];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rand() * 0.5;
    const root = new CylinderGeometry(0.05, 0.16, 0.9, 4, 1);
    root.rotateZ(Math.PI / 2 - 0.35);
    root.rotateY(-a);
    root.translate(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55);
    parts.push(root);
  }
  const g = mergeGeometries(parts.map((p) => {
    const q = p.toNonIndexed();
    q.deleteAttribute('uv');
    return q;
  }));
  g.computeVertexNormals();
  return paint(g, (cy, n, rand) => (n[1] > 0.9 && cy > 0.7 ? WOOD : cy < 0.25 && rand() < 0.4 ? moss(rand) : bark(rand)), seed);
}

const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), e = new Euler(0, 0, 0, 'YXZ');

/**
 * Fallen logs and old stumps on the forest floor (the woods of the green
 * lands, the Black Hills and the jungle), mossy along their tops, snowed
 * on in winter. Solid: you can stand on a log (see surfaceAt). On the
 * chunks near you.
 */
export function createLogLayer(config) {
  const shapes = [log(11), stump(31)]; // (one of each: their sizes and turns vary them, and it's half the draw calls)
  const material = seasonalWood(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const solids = new Map(); // "cx,cz" -> [kind (0 log, 1 stump), x, y, z, length, radius, heading, slope, ...]

  return {
    name: 'logs',
    material,

    reuseKey: ({ lod }) => (lod > 1 ? 'none' : 'near'),

    /** The top of any log or stump at (x, z) (world), or -Infinity. */
    surfaceAt(x, z) {
      const size = config.chunkSize;
      const cx = Math.floor(x / size), cz = Math.floor(z / size);
      let top = -Infinity;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = solids.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 8) {
            const ox = x - list[k + 1], oz = z - list[k + 3];
            const len = list[k + 4], r = list[k + 5];
            if (Math.abs(ox) > len + r || Math.abs(oz) > len + r) continue;
            if (list[k] === 1) {
              // A stump: its flat top (`y` is the top).
              if (ox * ox + oz * oz < r * r * 0.7) top = Math.max(top, list[k + 2]);
              continue;
            }
            // A log: round across, sloping along (`y` is the middle of its underside).
            const a = list[k + 6];
            const along = ox * Math.cos(a) - oz * Math.sin(a), across = ox * Math.sin(a) + oz * Math.cos(a);
            if (Math.abs(along) > len / 2 || Math.abs(across) >= r) continue;
            top = Math.max(top, list[k + 2] + 0.9 * r + along * list[k + 7] + Math.sqrt(r * r - across * across));
          }
        }
      }
      return top;
    },

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 1) return null;
      const size = config.chunkSize, sea = config.seaLevel;
      const x0 = cx * size, z0 = cz * size;
      const G = 9, n = Math.round(size / G), seed = generator.seed ^ 0x106;
      const placed = shapes.map(() => []), solid = [];
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const gi = cx * n + i, gj = cz * n + j;
          const keep = hash2(gi, gj, seed);
          if (keep > 0.2) continue;
          const lx = (i + 0.15 + 0.7 * hash2(gi, gj, seed + 1)) * G, lz = (j + 0.15 + 0.7 * hash2(gi, gj, seed + 2)) * G;
          const wx = x0 + lx, wz = z0 + lz;
          const w = generator.getBiomeWeights(wx, wz, {});
          const woods = w.temperate * generator.getForestDensity(wx, wz) * (1 - 0.8 * smoothstep(0.1, 0.45, generator.getPlainness(wx, wz))) + w.blackHills * 0.6 + w.jungle * 0.9 + w.wetland * 0.3;
          if (keep > 0.2 * smoothstep(0.35, 0.7, woods)) continue;
          const y = groundHeightAt(lx, lz);
          if (!(y > sea + 1.2) || y > 150) continue;
          if (generator.rivers.at(wx, wz, 2)) continue;
          if (generator.caves.field.nearEntrance(wx, wz, 3)) continue;
          const isStump = hash2(gi, gj, seed + 3) < 0.4;
          const a = hash2(gi, gj, seed + 4) * Math.PI * 2;
          if (isStump) {
            const r = 0.35 + 0.25 * hash2(gi, gj, seed + 5);
            const k = 1;
            p.set(lx, y - 0.1, lz);
            q.setFromAxisAngle(new Vector3(0, 1, 0), a);
            const sy = (0.6 + 0.8 * hash2(gi, gj, seed + 7)) * r / 0.5;
            s.set(r / 0.5, sy, r / 0.5);
            placed[k].push(m4.compose(p, q, s).clone());
            solid.push(1, wx, y - 0.1 + 0.8 * sy, wz, 0, r, 0, 0);
            continue;
          }
          // A log lies along the ground, following its slope.
          const len = 3 + 4.5 * hash2(gi, gj, seed + 5), r = 0.22 + 0.2 * hash2(gi, gj, seed + 6);
          const ca = Math.cos(a), sa = Math.sin(a);
          const ex = lx + ca * len * 0.5, ez = lz - sa * len * 0.5, bx = lx - ca * len * 0.5, bz = lz + sa * len * 0.5;
          const inside = (x, z) => x >= 0 && z >= 0 && x < size && z < size;
          if (!inside(ex, ez) || !inside(bx, bz)) continue;
          const ya = groundHeightAt(ex, ez), yb = groundHeightAt(bx, bz);
          if (!(ya > sea + 1) || !(yb > sea + 1) || Math.abs(ya - yb) > len * 0.45) continue;
          const mid = Math.min(y, (ya + yb) / 2);
          e.set(0, a, Math.atan2(ya - yb, len));
          q.setFromEuler(e);
          p.set(lx, mid - r * 0.35, lz);
          s.set(len, r * 2, r * 2);
          placed[0].push(m4.compose(p, q, s).clone());
          solid.push(0, wx, mid - r * 0.35, wz, len, r, a, (ya - yb) / len);
        }
      }
      solids.set(`${cx},${cz}`, solid);
      if (!placed.some((l) => l.length)) return null;
      const group = new Group();
      group.name = 'logs';
      group.userData.key = `${cx},${cz}`;
      group.userData.solid = solid;
      placed.forEach((list, k) => {
        if (!list.length) return;
        const mesh = new InstancedMesh(shapes[k], material, list.length);
        list.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });
      return group;
    },

    dispose(group) {
      // (Unless the chunk has been rebuilt since, with its own.)
      if (solids.get(group.userData.key) === group.userData.solid) solids.delete(group.userData.key);
      for (const mesh of group.children) mesh.dispose(); // (the shapes are shared)
    },
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
