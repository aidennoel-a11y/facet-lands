import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

/**
 * The mountain lakes' water (see TerrainGenerator.mountainLakeAt): each long
 * lake lying along its valley floor, still and deep, dark blue-green, drawn
 * by the chunk its middle is in (its shore wavering as the land's does).
 */

export function createMountainLakeLayer(config) {
  const material = new MeshLambertMaterial({ color: 0x2a6a7a, transparent: true, opacity: 0.86, depthWrite: false });
  return {
    name: 'mountain lakes',
    reuseKey: ({ lod }) => (lod > 3 ? 'none' : 'mountainLakes'),
    build({ cx, cz, lod, generator }) {
      if (lod > 3 || !generator.mountainLakeAt) return null;
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size;
      // (The lake whose middle is in this chunk, if any: looked for at the chunk's middle, its cell and those round it.)
      const lake = generator.mountainLakeAt(x0 + size / 2, z0 + size / 2) ?? findIn(generator, x0, z0, size);
      if (!lake || Math.floor(lake.x / size) !== cx || Math.floor(lake.z / size) !== cz) return null;
      const N = lod > 1 ? 24 : 56, ca = Math.cos(lake.a), sa = Math.sin(lake.a), pos = [];
      const edge = (k) => {
        const b = (k / N) * Math.PI * 2, wob = 1 / (1 + 0.06 * Math.sin(b * 5 + lake.s));
        // (Out a little past the water's edge: the land round it hides the rest.)
        const u = Math.cos(b) * lake.L * 1.04 * wob, v = Math.sin(b) * lake.W * 1.04 * wob;
        return [lake.x + u * ca - v * sa - x0, lake.z + u * sa + v * ca - z0];
      };
      for (let k = 0; k < N; k++) {
        const [ax, az] = edge(k), [bx, bz] = edge(k + 1);
        pos.push(lake.x - x0, lake.level, lake.z - z0, bx, lake.level, bz, ax, lake.level, az);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = 2;
      mesh.name = 'mountain lake';
      const group = new Group();
      group.name = 'mountain lakes';
      group.add(mesh);
      return group;
    },
    dispose(group) {
      for (const m of group.children) m.geometry.dispose();
    },
  };
}

// (A lake whose middle lies in the chunk, though the chunk's own middle is past its shore.)
function findIn(generator, x0, z0, size) {
  for (const [fx, fz] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
    const l = generator.mountainLakeAt(x0 + fx * size, z0 + fz * size);
    if (l) return l;
  }
  return null;
}
