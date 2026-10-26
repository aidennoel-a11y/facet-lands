import { Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { shroomGeometry, shroomHeight, shroomOf } from '../caves/giantShrooms.js';
import { addShroomSet, removeShroomSet, shroomsCut } from './CaveLayer.js';

const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), UP = new Vector3(0, 1, 0);

/**
 * The mushroom islands far out in the deep sea (see
 * TerrainGenerator.mushroomIslandAt): instead of trees, giant mushrooms
 * standing over the mycelium, domes and toadstools and parasols, taller
 * than the cave ones. They're the cave forests' kin: stood on, walked
 * round, cut down and gathered just as those are (see CaveLayer).
 */
export function createMushroomIslandLayer(config) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const geometries = new Map();
  const geometry = (kind, capIndex) => {
    const key = `${kind}:${capIndex}`;
    if (!geometries.has(key)) geometries.set(key, shroomGeometry(kind, capIndex));
    return geometries.get(key);
  };
  return {
    name: 'mushroomIslands',
    material,

    reuseKey: ({ lod }) => (lod > 2 ? 'none' : 'near'),

    build({ cx, cz, lod, generator, groundHeightAt }) {
      if (lod > 2 || !generator.mushroomIslandAt) return null;
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size;
      // (Cheaply first: any island at all here?)
      let any = false;
      for (const [u, v] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]]) if (generator.mushroomIslandAt(x0 + u * size, z0 + v * size) > 0) any = true;
      if (!any) return null;
      const G = 9, cells = Math.floor(size / G), seed = generator.seed ^ 0x6d5a;
      const byKey = new Map(), list = [];
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i, gj = cz * cells + j;
          const lx = (i + 0.15 + 0.7 * hash2(gi, gj, seed + 1)) * G, lz = (j + 0.15 + 0.7 * hash2(gi, gj, seed + 2)) * G;
          const wx = x0 + lx, wz = z0 + lz, m = generator.mushroomIslandAt(wx, wz);
          if (m < 0.6 || hash2(gi, gj, seed) > 0.42 * m) continue;
          const y = groundHeightAt(lx, lz);
          if (!(y > config.seaLevel + 2.5)) continue;
          const sd = hash2(gi, gj, seed + 3), shroom = shroomOf(sd);
          const height = shroomHeight(shroom.kind, sd, 40) * 1.35;
          const g = { x: wx, y: y + 0.25, z: wz, height, s: sd, kind: shroom.kind, ratio: shroom.ratio, turn: (sd * 7.3) % (Math.PI * 2), key: `isle:${gi},${gj}`, i: list.length };
          g.cut = shroomsCut.has(g.key);
          const key = `${shroom.kind}:${shroom.capIndex}`;
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(g);
          list.push(g);
        }
      }
      if (!list.length) return null;
      const group = new Group();
      group.name = 'mushroom island';
      for (const [key, gs] of byKey) {
        const [kind, capIndex] = key.split(':').map(Number);
        const mesh = new InstancedMesh(geometry(kind, capIndex), material, gs.length);
        mesh.name = 'island giant mushrooms';
        mesh.castShadow = mesh.receiveShadow = true;
        gs.forEach((g, n) => {
          g.mesh = mesh;
          g.index = n;
          mesh.setMatrixAt(n, g.cut ? m4.makeScale(0, 0, 0) : m4.compose(p.set(g.x - x0, g.y - 0.3, g.z - z0), q.setFromAxisAngle(UP, g.turn), s.setScalar(g.height)));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
      const set = { list, cx: x0 + size / 2, cz: z0 + size / 2, material, caves: null };
      addShroomSet(set);
      group.userData.set = set;
      return group;
    },

    dispose(group) {
      removeShroomSet(group.userData.set);
      for (const mesh of group.children) mesh.dispose(); // (the shapes are shared)
    },
  };
}
