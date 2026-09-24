import { Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2 } from '../../noise/random.js';
import { addWind, windDepthMaterial } from '../../render/wind.js';
import { seasonalTrees } from '../../render/Seasons.js';
import { LEAF_GEOMETRIES, NO_COLLIDE, STIFF, TREE_GEOMETRIES } from '../trees.js';

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const spin = new Quaternion();
const lean = new Vector3();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);
const tint = new Color();
const surface = { normalY: 1 };

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

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
// How thick each kind of trunk is (at chest height, for a tree of size 1),
// and how far off centre it stands (the acacia leans).
const TRUNK_RADIUS = { pine: 0.31, spruce: 0.27, broadleaf: 0.34, birch: 0.19, poplar: 0.27, maple: 0.33, acacia: 0.27, deadPine: 0.27, cactus: 0.4 };
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

    build({ cx, cz, lod, groundHeightAt, generator, config }) {
      if (lod > config.treeMaxLod) return null;
      const { chunkSize, treeSpacing, seaLevel, treeScale } = config;
      const cells = Math.round(chunkSize / treeSpacing);
      const spacing = chunkSize / cells;
      const originX = cx * chunkSize;
      const originZ = cz * chunkSize;
      const seed = generator.seed ^ 0x7f4a7c15;

      const placed = {}; // species -> [{x, y, z, s, sy, rot, shade}]
      // Boulders nearby, binned by cell: no tree grows out of a rock.
      const blocked = new Map();
      if (rocks) {
        const list = rocks.bouldersNear(cx, cz, generator, spacing);
        for (let k = 0; k < list.length; k += 3) {
          const i = Math.floor((list[k] - originX) / spacing), j = Math.floor((list[k + 1] - originZ) / spacing);
          const key = `${i},${j}`;
          if (!blocked.has(key)) blocked.set(key, []);
          blocked.get(key).push(list[k], list[k + 1], list[k + 2]);
        }
      }
      const onRock = (wx, wz, i, j) => {
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const list = blocked.get(`${i + di},${j + dj}`);
            if (!list) continue;
            for (let k = 0; k < list.length; k += 3) if (Math.hypot(wx - list[k], wz - list[k + 1]) < list[k + 2] + 0.6) return true;
          }
        }
        return false;
      };
      // Where the tree spot in grid cell (gi, gj) is, and how big its tree would be.
      const spot = (gi, gj) => ({
        x: (gi + 0.1 + 0.8 * hash2(gi, gj, seed + 1)) * spacing,
        z: (gj + 0.1 + 0.8 * hash2(gi, gj, seed + 2)) * spacing,
        s: (0.75 + hash2(gi, gj, seed + 5) * 0.6) * treeScale,
      });
      // Trees don't grow into each other: of two spots too close together,
      // only the one ranking higher (a fixed coin toss per spot, so
      // neighbouring chunks agree) can hold a tree, if it's likely to.
      const crowded = (gi, gj, likely) => {
        const me = spot(gi, gj);
        const rank = hash2(gi, gj, seed + 14);
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = gi + di, nj = gj + dj;
            if (hash2(ni, nj, seed + 14) < rank) continue; // it gives way to us
            if (hash2(ni, nj, seed) > likely) continue; // it wouldn't be a tree anyway
            const other = spot(ni, nj);
            if (Math.hypot(other.x - me.x, other.z - me.z) < 1.7 * (me.s + other.s) * 0.5) return true;
          }
        }
        return false;
      };
      for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
          const gi = cx * cells + i;
          const gj = cz * cells + j;
          const keep = hash2(gi, gj, seed);
          const lx = (i + 0.1 + 0.8 * hash2(gi, gj, seed + 1)) * spacing;
          const lz = (j + 0.1 + 0.8 * hash2(gi, gj, seed + 2)) * spacing;
          const wx = originX + lx;
          const wz = originZ + lz;

          // Near a biome border, each spot takes one biome or the other at random.
          const biome = generator.pickBiome(wx, wz, hash2(gi, gj, seed + 11));
          const trees = biome.trees;
          const likely = (trees ? (trees.clumped ? generator.getForestDensity(wx, wz) : 1) * trees.density : 0);
          if (!trees || keep > likely) continue;
          if (biome.id === 'desert' && generator.getFeatures(wx, wz).erg > 0.3) continue; // nothing grows in a dune sea
          if (biome.id === 'volcanic' && hash2(gi, gj, seed + 15) < 0.92 * generator.getVolcanic(wx, wz).cone) continue; // cinder cones are nearly bare
          if (crowded(gi, gj, likely)) continue;
          if (onRock(wx, wz, i, j)) continue;

          const ground = groundHeightAt(lx, lz, surface);
          // (In a wetland trees grow down to the water, and dead ones stand
          // drowned in the shallows.)
          const marsh = biome.id === 'wetland';
          if (!(ground >= seaLevel + (marsh ? -0.8 : 1.2))) continue; // outside the chunk, in water or over a cave mouth
          if (generator.caves.field.nearEntrance(wx, wz, 3)) continue; // keep cave entrances clear
          if (generator.rivers.at(wx, wz, 1.5)) continue; // nor in a river or right on its bank
          // Nothing but cacti grows on sand (beaches included).
          const colourHeight = ground + generator.getColorJitter(wx, wz);
          if (biome.id !== 'desert' && !marsh && colourHeight < 7) continue;
          // Nor on bare rock: the grey band up the mountains, and faces
          // steep enough to show rock (the same test the ground's colour
          // uses). Steep slopes that are still green keep their trees.
          // (How steep, from the land itself rather than this level of
          // detail's mesh, so trees don't come and go as you approach.)
          const gradX = (generator.getHeight(wx + 2, wz) - generator.getHeight(wx - 2, wz)) / 4;
          const gradZ = (generator.getHeight(wx, wz + 2) - generator.getHeight(wx, wz - 2)) / 4;
          const upness = 1 / Math.sqrt(1 + gradX * gradX + gradZ * gradZ);
          const r = hash2(gi, gj, seed + 12);
          const cliff = 1 - smoothstep(0.5, 0.72, upness);
          if (r < Math.max(cliff, smoothstep(128, 146, colourHeight))) continue;
          // And ever fewer the higher you go (the tree line).
          if (hash2(gi, gj, seed + 13) < smoothstep(85, 150, ground) * 0.9) continue;

          // Too steep for roots? (height change per metre)
          if (Math.abs(gradX) + Math.abs(gradZ) > 1.5) continue;

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
          if (marsh && ground < seaLevel + 0.4 && species.type !== 'deadPine') continue;

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
            // No tree grows perfectly straight: a small random lean, plus a
            // lean downhill on slopes (up to about 12 degrees).
            leanX: (hash2(gi, gj, seed + 9) - 0.5) * 0.08 - gradX * 0.16,
            leanZ: (hash2(gi, gj, seed + 10) - 0.5) * 0.08 - gradZ * 0.16,
          });
        }
      }

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
