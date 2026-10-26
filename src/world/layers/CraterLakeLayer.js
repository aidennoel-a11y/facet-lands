import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

/**
 * The crater lakes' water (see TerrainGenerator.craterLakeAt): each small
 * round lake in its bowl, still, its own colour from what's dissolved in
 * it. Drawn by the chunk its middle is in.
 */
export const CRATER_COLOURS = [0x2ec8c0, 0x2e9a5a, 0x9ac8d8, 0xa8482a, 0xb8c040, 0x1e3a8a];
const G = 170;

export function createCraterLakeLayer(config) {
  const materials = CRATER_COLOURS.map((color) => new MeshLambertMaterial({ color, transparent: true, opacity: 0.84, depthWrite: false }));
  const layer = {
    name: 'crater lakes',
    reuseKey: ({ lod }) => (lod > 3 ? 'none' : 'craters'),
    build({ cx, cz, lod, generator }) {
      if (lod > 3 || !generator.craterLakeAt) return null;
      const size = config.chunkSize, x0 = cx * size, z0 = cz * size;
      const group = new Group();
      group.name = 'crater lakes';
      const seen = new Set();
      for (let z = z0 + G / 4; z < z0 + size + G / 2; z += G / 2) {
        for (let x = x0 + G / 4; x < x0 + size + G / 2; x += G / 2) {
          const c = generator.craterLakeAt(Math.min(x, x0 + size - 1), Math.min(z, z0 + size - 1));
          if (!c || seen.has(`${c.x},${c.z}`) || Math.floor(c.x / size) !== cx || Math.floor(c.z / size) !== cz) continue;
          seen.add(`${c.x},${c.z}`);
          // (A disc out a little past the water's edge: the bowl's sides hide the rest.)
          const N = lod > 1 ? 12 : 28, R = c.r * 1.06, pos = [];
          for (let k = 0; k < N; k++) {
            const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
            pos.push(c.x - x0, c.level, c.z - z0, c.x - x0 + Math.cos(a1) * R, c.level, c.z - z0 + Math.sin(a1) * R, c.x - x0 + Math.cos(a0) * R, c.level, c.z - z0 + Math.sin(a0) * R);
          }
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
          geometry.computeVertexNormals();
          const mesh = new Mesh(geometry, materials[c.colour]);
          mesh.renderOrder = 2;
          mesh.name = 'crater lake';
          group.add(mesh);
        }
      }
      return group.children.length ? group : null;
    },
    dispose(group) {
      for (const m of group.children) m.geometry.dispose();
    },
  };
  return layer;
}
