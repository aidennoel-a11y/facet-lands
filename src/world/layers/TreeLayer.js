import { Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { addWind, windDepthMaterial } from '../../render/wind.js';
import { seasonalTrees } from '../../render/Seasons.js';
import { LEAF_GEOMETRIES, NO_COLLIDE, STIFF, TREE_GEOMETRIES } from '../trees.js';
import { placeTrees } from '../treePlacement.js';

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const spin = new Quaternion();
const lean = new Vector3();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);
const tint = new Color();

/**
 * Trees on the nearby chunks (where they stand: see placeTrees). Every
 * species in a chunk is one InstancedMesh, plus
 * a second one for its semi-transparent leaf triangles sharing the same
 * transforms. Trees sway in the wind and cast shadows.
 */
// How thick each kind of trunk is (at chest height, for a tree of size 1),
// and how far off centre it stands (the acacia leans).
const TRUNK_RADIUS = { pine: 0.31, spruce: 0.27, broadleaf: 0.34, birch: 0.19, poplar: 0.27, maple: 0.33, acacia: 0.27, deadPine: 0.27, cactus: 0.4, cypress: 0.5, swampWillow: 0.38,
  oak: 0.5, larch: 0.25, silverBirch: 0.2, aspen: 0.19, baobab: 1.05, joshuaTree: 0.28, charredSnag: 0.28, treeFern: 0.22, weepingWillow: 0.42, mangrove: 0.8 };
const TRUNK_OFFSET = { acacia: 0.4 };

/**
 * @param rocks  the rock layer, if any: trees don't grow on its boulders
 */
export function createTreeLayer({ rocks = null } = {}) {
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
  seasonalTrees(material);
  seasonalTrees(leafMaterial, true);
  const depthMaterial = windDepthMaterial(WIND);
  // Cacti stand stiff: no sway.
  const stiffMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

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

    reuseKey: ({ lod, resolution, config }) =>
      lod > config.treeMaxLod ? 'none' : `${resolution}:${lod <= config.leafMaxLod}`,

    build({ cx, cz, lod, groundHeightAt, generator, config, prepared }) {
      if (lod > config.treeMaxLod) return null;
      const { chunkSize, treeSpacing } = config;
      const cells = Math.round(chunkSize / treeSpacing);
      const spacing = chunkSize / cells;
      const originX = cx * chunkSize;
      const originZ = cz * chunkSize;
      // (Worked out by the chunk's worker, or here.)
      const placed = prepared?.trees ?? placeTrees(generator, config, cx, cz, groundHeightAt, rocks ? rocks.bouldersNear(cx, cz, generator, spacing) : null);

      const trunks = [];
      for (const [type, list] of Object.entries(placed)) {
        if (NO_COLLIDE.has(type)) continue;
        const r = TRUNK_RADIUS[type] ?? 0.3, off = TRUNK_OFFSET[type] ?? 0;
        // (A tree turned by `rot` about the vertical has its own x axis along (cos rot, -sin rot).)
        for (const t of list) trunks.push(originX + t.x + Math.cos(t.rot) * off * t.s, originZ + t.z - Math.sin(t.rot) * off * t.s, r * t.s);
      }

      const group = new Group();
      group.name = 'trees';
      let count = 0;
      for (const [type, list] of Object.entries(placed)) {
        const stiff = STIFF.has(type);
        const mesh = new InstancedMesh(TREE_GEOMETRIES[type], stiff ? stiffMaterial : material, list.length);
        mesh.name = type;
        list.forEach((t, k) => {
          position.set(t.x, t.y, t.z);
          // Spin about the trunk, then tip over by the lean.
          lean.set(t.leanZ, 0, -t.leanX);
          const angle = Math.min(0.21, lean.length());
          rotation.setFromAxisAngle(lean.normalize(), angle).multiply(spin.setFromAxisAngle(up, t.rot));
          scale.set(t.s, t.sy, t.s);
          mesh.setMatrixAt(k, matrix.compose(position, rotation, scale));
          // Slight per-tree brightness/warmth change so forests aren't flat.
          const v = 0.82 + t.shade * 0.3;
          mesh.setColorAt(k, tint.setRGB(v * (0.96 + t.shade * 0.08), v, v * 0.95));
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (!stiff) mesh.customDepthMaterial = depthMaterial;
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
