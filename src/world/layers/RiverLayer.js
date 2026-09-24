import { BufferAttribute, BufferGeometry, Color, Mesh } from 'three';

const RIVER = new Color(0x4fbfc4).lerp(new Color(0x2c67b0), 0.3);

/**
 * River water: a ribbon along each river (see Rivers), at its water level,
 * a little wider than its bed so it tucks under the banks, drawn with the
 * lake water's material. Sloping where the river runs downhill; it stops
 * where the river meets a lake or the sea (their water takes over).
 */
export function createRiverLayer(water) {
  return {
    name: 'rivers',

    build({ cx, cz, lod, generator, config }) {
      if (lod > 2 || !generator.rivers) return null;
      const { chunkSize, seaLevel } = config;
      const x0 = cx * chunkSize, z0 = cz * chunkSize;
      const rivers = generator.rivers.inBox(x0, z0, x0 + chunkSize, z0 + chunkSize);
      if (!rivers.length) return null;

      const positions = [];
      const colors = [];
      const waves = [];
      for (const { points } of rivers) {
        // Each point's sideways direction, averaged over its neighbours so
        // consecutive quads share edges.
        const side = points.map((p, i) => {
          const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
          const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
          return [-dz / l, dx / l];
        });
        const edge = (i, s) => {
          const p = points[i];
          const half = p.width / 2 + 0.35;
          return [p.x + side[i][0] * half * s - x0, p.level + 0.15, p.z + side[i][1] * half * s - z0];
        };
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
          if (mx < x0 || mx >= x0 + chunkSize || mz < z0 || mz >= z0 + chunkSize) continue;
          // Into the lake or sea: its own water covers it from here.
          if (generator.getHeight(a.x, a.z) < seaLevel - 0.2 && generator.getHeight(b.x, b.z) < seaLevel - 0.2) continue;
          const quad = [edge(i, -1), edge(i + 1, -1), edge(i + 1, 1), edge(i, 1)];
          for (const k of [0, 2, 1, 0, 3, 2]) {
            positions.push(...quad[k]);
            const shade = 0.95 + ((i * 7) % 5) * 0.02;
            colors.push(RIVER.r * shade, RIVER.g * shade, RIVER.b * shade, 0.82);
            waves.push(0.04);
          }
        }
      }
      if (!positions.length) return null;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
      geometry.setAttribute('waveScale', new BufferAttribute(new Float32Array(waves), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, water.material);
      mesh.name = 'river';
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      return mesh;
    },

    dispose(mesh) {
      mesh.geometry.dispose();
    },
  };
}
