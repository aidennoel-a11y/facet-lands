import { BufferAttribute, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, Euler } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../../noise/random.js';
import { seasonalWood } from '../../render/Seasons.js';
import { placeLogs } from '../decorPlacement.js';

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

const m4 = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3(), e = new Euler(0, 0, 0, 'YXZ'), yAxis = new Vector3(0, 1, 0);

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

    build({ cx, cz, lod, generator, groundHeightAt, prepared }) {
      if (lod > 1) return null;
      // (Where they lie: worked out by a chunk worker; here only if it wasn't.)
      const found = prepared && prepared.logs !== undefined ? prepared.logs : placeLogs(generator, config, cx, cz, groundHeightAt);
      const placed = shapes.map(() => []), solid = found?.solid ?? [];
      const P = found?.pieces ?? [];
      for (let k = 0; k < P.length; k += 9) {
        p.set(P[k + 1], P[k + 2], P[k + 3]);
        if (P[k] === 1) q.setFromAxisAngle(yAxis, P[k + 4]);
        else q.setFromEuler(e.set(0, P[k + 4], P[k + 5]));
        s.set(P[k + 6], P[k + 7], P[k + 8]);
        placed[P[k]].push(m4.compose(p, q, s).clone());
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
        mesh.userData.smallShadow = true; // (sticks and fallen logs: their shadows only close by)
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
