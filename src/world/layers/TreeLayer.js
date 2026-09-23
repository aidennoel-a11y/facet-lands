import { Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { addWind, windDepthMaterial } from '../../render/wind.js';
import { LEAF_GEOMETRIES, TREE_GEOMETRIES } from '../trees.js';

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);
const tint = new Color();

/**
 * Scatters trees over nearby chunks.
 *
 * Candidate spots sit on a jittered world grid (`treeSpacing` apart), so a
 * given tree is always in the same place whichever LOD builds its chunk.
 * Each spot is kept or skipped by the forest-density noise, then checked
 * for water, slope and altitude, and finally given a species from its
 * biome's `trees` list. Every species in a chunk is one InstancedMesh, plus
 * a second one for its semi-transparent leaf triangles sharing the same
 * transforms. Trees sway in the wind and cast shadows.
 */
export function createTreeLayer() {
  const WIND = { strength: 0.012, speed: 1.1 };
  const material = addWind(new MeshLambertMaterial({ vertexColors: true, flatShading: true }), WIND);
  const leafMaterial = addWind(
    new MeshLambertMaterial({
      vertexColors: true,
      transparent: true, // each leaf carries its own alpha in its vertex colour
      side: DoubleSide,
      depthWrite: false,
    }),
    WIND,
  );
  // Light the far side of each leaf cluster as if it faced outwards too, so
  // leaves seen against the sky glow green instead of turning black.
  const windCompile = leafMaterial.onBeforeCompile;
  leafMaterial.onBeforeCompile = (shader, renderer) => {
    windCompile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif',
    );
  };
  const depthMaterial = windDepthMaterial(WIND);

  const layer = {
    name: 'trees',
    material,
    leafMaterial,
    count: 0, // trees currently loaded, for the HUD
    trunks: new Map(), // "cx,cz" -> [x, z, radius, ...] in world space, for collisions

    /**
     * Pushes a circle (the walking player) out of any tree trunk it overlaps.
     * Bushes are soft and can be walked through.
     */
    collide(position, radius, chunkSize) {
      const cx = Math.floor(position.x / chunkSize);
      const cz = Math.floor(position.z / chunkSize);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = layer.trunks.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 3) {
            const ox = position.x - list[k];
            const oz = position.z - list[k + 1];
            const min = radius + list[k + 2];
            const d2 = ox * ox + oz * oz;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            position.x += (ox / d) * (min - d);
            position.z += (oz / d) * (min - d);
          }
        }
      }
    },

    build({ cx, cz, lod, groundHeightAt, generator, config }) {
      if (lod > config.treeMaxLod) return null;
      const { chunkSize, treeSpacing, seaLevel, treeScale } = config;
      const cells = Math.round(chunkSize / treeSpacing);
      const spacing = chunkSize / cells;
      const originX = cx * chunkSize;
      const originZ = cz * chunkSize;
      const seed = generator.seed ^ 0x7f4a7c15;

      const placed = {}; // species -> [{x, y, z, s, sy, rot, shade}]
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i;
          const gj = cz * cells + j;
          const keep = hash2(gi, gj, seed);
          const lx = (i + 0.1 + 0.8 * hash2(gi, gj, seed + 1)) * spacing;
          const lz = (j + 0.1 + 0.8 * hash2(gi, gj, seed + 2)) * spacing;
          const wx = originX + lx;
          const wz = originZ + lz;

          const biome = generator.getBiome(wx, wz);
          const trees = biome.trees;
          if (!trees || keep > generator.getForestDensity(wx, wz) * trees.density) continue;

          const ground = groundHeightAt(lx, lz);
          if (!(ground >= seaLevel + 1.2)) continue; // outside the chunk, in water or over a cave mouth

          // Too steep for roots? (height change per metre)
          const slope =
            Math.abs(generator.getHeight(wx + 2, wz) - generator.getHeight(wx - 2, wz)) +
            Math.abs(generator.getHeight(wx, wz + 2) - generator.getHeight(wx, wz - 2));
          if (slope / 4 > 0.95) continue;

          // Pick a species that is happy at this height (edges blurred a bit).
          const h = ground + (hash2(gi, gj, seed + 3) - 0.5) * 16;
          let total = 0;
          for (const s of trees.species) if (h >= s.minHeight && h <= s.maxHeight) total += s.weight;
          if (total === 0) continue;
          let pick = hash2(gi, gj, seed + 4) * total;
          let species = null;
          for (const s of trees.species) {
            if (h < s.minHeight || h > s.maxHeight) continue;
            pick -= s.weight;
            if (pick <= 0) {
              species = s;
              break;
            }
          }
          species ??= trees.species[trees.species.length - 1];

          const size = (0.75 + hash2(gi, gj, seed + 5) * 0.6) * treeScale;
          (placed[species.type] ??= []).push({
            x: lx,
            // Sink the base a little so trunks never float on sloped faces.
            y: ground - 0.3 * size,
            z: lz,
            s: size,
            sy: size * (0.85 + hash2(gi, gj, seed + 6) * 0.35),
            rot: hash2(gi, gj, seed + 7) * Math.PI * 2,
            shade: hash2(gi, gj, seed + 8),
          });
        }
      }

      const trunks = [];
      for (const [type, list] of Object.entries(placed)) {
        if (type === 'bush') continue;
        for (const t of list) trunks.push(originX + t.x, originZ + t.z, 0.3 * t.s);
      }

      const group = new Group();
      group.name = 'trees';
      let count = 0;
      for (const [type, list] of Object.entries(placed)) {
        const mesh = new InstancedMesh(TREE_GEOMETRIES[type], material, list.length);
        mesh.name = type;
        list.forEach((t, k) => {
          position.set(t.x, t.y, t.z);
          rotation.setFromAxisAngle(up, t.rot);
          scale.set(t.s, t.sy, t.s);
          mesh.setMatrixAt(k, matrix.compose(position, rotation, scale));
          // Slight per-tree brightness/warmth change so forests aren't flat.
          const v = 0.82 + t.shade * 0.3;
          mesh.setColorAt(k, tint.setRGB(v * (0.96 + t.shade * 0.08), v, v * 0.95));
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.customDepthMaterial = depthMaterial;
        group.add(mesh);
        count += list.length;

        // Leaf facets only up close; far away they'd be sub-pixel anyway.
        const leafGeometry = lod <= config.leafMaxLod ? LEAF_GEOMETRIES[type] : null;
        if (leafGeometry) {
          const leavesMesh = new InstancedMesh(leafGeometry, leafMaterial, list.length);
          leavesMesh.name = `${type} leaves`;
          leavesMesh.instanceMatrix = mesh.instanceMatrix;
          leavesMesh.instanceColor = mesh.instanceColor;
          leavesMesh.computeBoundingSphere();
          leavesMesh.castShadow = true; // dappled shade under the crown
          leavesMesh.receiveShadow = true;
          leavesMesh.customDepthMaterial = depthMaterial;
          group.add(leavesMesh);
        }
      }
      if (count === 0) return null;
      group.userData.count = count;
      group.userData.key = `${cx},${cz}`;
      group.userData.trunks = trunks;
      layer.count += count;
      layer.trunks.set(group.userData.key, trunks);
      return group;
    },

    dispose(group) {
      layer.count -= group.userData.count;
      // A rebuilt chunk (new LOD) may already have registered its trunks.
      if (layer.trunks.get(group.userData.key) === group.userData.trunks) layer.trunks.delete(group.userData.key);
      for (const mesh of group.children) mesh.dispose(); // geometry is shared
    },
  };
  return layer;
}
