import { Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { addWind, gustAt, windReach, windDepthMaterial, windDirection, windStrength, windTime } from '../../render/wind.js';
import { seasonalTrees, seasonUniforms } from '../../render/Seasons.js';
import { LEAF_GEOMETRIES, NO_COLLIDE, STIFF, TREE_GEOMETRIES, treeGeometry } from '../trees.js';
import { placeTrees } from '../treePlacement.js';

const matrix = new Matrix4();
const position = new Vector3();
const scaleAbout = new Matrix4(), scaleBy = new Matrix4(); // (a sapling: see restore)
const rotation = new Quaternion();
const spin = new Quaternion();
const lean = new Vector3();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);
const tint = new Color();
const ray = new Raycaster();
const down = new Vector3(0, -1, 0);

/**
 * Trees on the nearby chunks (where they stand: see placeTrees). Every
 * species in a chunk is one InstancedMesh, plus
 * a second one for its semi-transparent leaf triangles sharing the same
 * transforms. Trees sway in the wind and cast shadows.
 */
// How thick each kind of trunk is (at chest height, for a tree of size 1),
// and how far off centre it stands (the acacia leans).
const TRUNK_RADIUS = { pine: 0.31, spruce: 0.27, broadleaf: 0.34, birch: 0.19, poplar: 0.27, maple: 0.33, acacia: 0.27, deadPine: 0.27, cactus: 0.4, cypress: 0.5, swampWillow: 0.38,
  oak: 0.5, larch: 0.25, silverBirch: 0.2, aspen: 0.19, baobab: 1.05, joshuaTree: 0.28, charredSnag: 0.28, treeFern: 0.22, weepingWillow: 0.42, mangrove: 0.8, jungleGiant: 0.75, junglePalm: 0.22, bamboo: 0.9, jungleCanopy: 0.45, appleTree: 0.26, redwood: 1.1 };
const TRUNK_OFFSET = { acacia: 0.4 };

// A broad-leaved (deciduous) tree's crown, for a tree of size 1: { bottom,
// top, radius }, or null for the evergreens (remembered).
const CROWNS = new Map();
function crownOf(type) {
  if (!CROWNS.has(type)) {
    const g = TREE_GEOMETRIES[type], crown = g.userData.crown;
    const season = g.attributes.aSeason;
    let leafy = 0;
    for (let k = 0; season && k < season.count; k++) leafy = Math.max(leafy, season.getX(k));
    let out = null;
    if (crown && leafy > 0.5) {
      crown.computeBoundingBox();
      const b = crown.boundingBox;
      out = { bottom: b.min.y, top: b.max.y, radius: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2 };
    }
    CROWNS.set(type, out);
  }
  return CROWNS.get(type);
}

// Every species' crown, for a tree of size 1: { bottom, top, radius, cone }
// (a cone narrows to its tip: pines and the like), or null. For the leaves'
// hitboxes: you can push a little way into the leaves, not through them.
const PROFILES = new Map();
const CONES = new Set(['pine', 'spruce', 'larch', 'deadPine', 'cypress']);
export const SMALL_PLANTS = new Set(['bush', 'raspberryBush', 'blueberryBush', 'dryBush', 'smallCactus']);
function profileOf(type) {
  if (!PROFILES.has(type)) {
    const crown = TREE_GEOMETRIES[type]?.userData.crown;
    let out = null;
    if (crown) {
      crown.computeBoundingBox();
      const b = crown.boundingBox;
      out = { bottom: b.min.y, top: b.max.y, radius: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2, cone: CONES.has(type) };
    }
    PROFILES.set(type, out);
  }
  return PROFILES.get(type);
}

/** Which tree this is, for good (see TreeLayer.remove). */
const treeKey = (cx, cz, type, t) => `${cx},${cz},${type},${Math.round(t.x * 4)},${Math.round(t.z * 4)}`;

/**
 * @param rocks  the rock layer, if any: trees don't grow on its boulders
 */
export function createTreeLayer({ rocks = null } = {}) {
  const WIND = { strength: 0.012, speed: 1.1, gust: 0.004 }; // (leaning a little in the gusts)
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

  // The trees' meshes, to swap their shapes as the seasons turn (bare
  // boughs showing, or hidden in the leaves: see treeGeometry).
  const meshes = new Set();
  let bare = false;
  const groups = new Map(); // "cx,cz" -> the chunk's trees (see topAt)

  const layer = {
    name: 'trees',

    /**
     * The height of the top of whatever tree stands at (x, z) (world), or
     * null if there's none there: for a bird to land on its crown, and
     * not in the air beside it.
     */
    topAt(x, z, from = 400) {
      const size = layer.chunkSize;
      const group = size && groups.get(`${Math.floor(x / size)},${Math.floor(z / size)}`);
      if (!group) return null;
      group.updateMatrixWorld();
      ray.set(position.set(x, from, z), down);
      ray.far = from + 50;
      const hits = ray.intersectObjects(group.children.filter((m) => !m.name.endsWith(' leaves')), false);
      return hits.length ? hits[0].point.y : null;
    },

    update() {
      // (Before the crowns start to fall, which is at 0.55 of winter; and
      // not flickering back and forth about it.)
      const w = seasonUniforms.uWinter.value;
      const now = bare ? w > 0.4 : w > 0.5;
      if (now === bare) return;
      bare = now;
      for (const mesh of meshes) mesh.geometry = treeGeometry(mesh.name, bare);
    },
    material,
    leafMaterial,
    count: 0, // trees currently loaded, for the HUD
    trunks: new Map(), // "cx,cz" -> [x, z, radius, ...] in world space, for collisions
    bushes: new Map(), // "cx,cz" -> [x, z, radius, ...]: soft to walk through, but nothing's built in one (see solidAt)
    crowns: new Map(), // "cx,cz" -> [x, z, bottom, top, radius, ...] of broad-leaved crowns (world), for falling leaves
    foliage: new Map(), // "cx,cz" -> [x, z, bottom, top, radius, cone, ...] of every crown (world), for the leaves' hitboxes
    frames: new Map(), // "cx,cz" -> [x, z, y, rot, s, sy, ...] of each swaying crowned tree (world), for swayAt

    /**
     * How far the wind has moved the branch at (x, y, z) in a tree's crown
     * just now (the same sway as the trees' shader, see addWind), into
     * `out` {x, z}: for a bird sitting there to move with it. Zero if
     * there's no swaying tree there.
     */
    swayAt(x, y, z, chunkSize, out) {
      out.x = out.z = 0;
      const list = layer.frames.get(`${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`);
      if (!list) return out;
      let best = -1, bestD = 49;
      for (let k = 0; k < list.length; k += 6) {
        const d = (list[k] - x) ** 2 + (list[k + 1] - z) ** 2;
        if (d < bestD) (bestD = d), (best = k);
      }
      if (best < 0) return out;
      const [ox, oz, oy, rot, sc, sy] = list.slice(best, best + 6);
      const c = Math.cos(rot), sn = Math.sin(rot), dx = x - ox, dz = z - oz;
      // (Where that is on the tree's own model, unturned and unscaled.)
      const lx = (dx * c - dz * sn) / sc, lz = (dx * sn + dz * c) / sc, ly = Math.max(0, (y - oy) / sy);
      const ph = windTime.value * WIND.speed + ox * 0.045 + oz * 0.037;
      const reach = windReach(ly), bend = reach * WIND.strength * windStrength.value;
      const g = reach * WIND.gust * gustAt(ox, oz), d = windDirection.value;
      const mx = (Math.sin(ph) + 0.35 * Math.sin(ph * 2.7 + lz)) * bend + d.x * g;
      const mz = (0.6 * Math.cos(ph * 0.8) + 0.25 * Math.sin(ph * 3.1 + lx)) * bend + d.y * g;
      // (Back into the world: scaled and turned as the tree is.)
      out.x = (mx * c + mz * sn) * sc;
      out.z = (-mx * sn + mz * c) * sc;
      return out;
    },
    removed: new Set(), // trees felled (see remove), saved with the world

    /**
     * The tree whose trunk (or, for a bush, whose leaves) a ray from
     * `origin` along unit `dir` meets within `reach`: { key, type, t
     * (as placed), x, y, z (its foot, world), radius, height, bush,
     * distance }, or null.
     */
    pick(origin, dir, reach) {
      const size = layer.chunkSize;
      if (!size) return null;
      const ccx = Math.floor(origin.x / size), ccz = Math.floor(origin.z / size);
      let best = null;
      const a = dir.x * dir.x + dir.z * dir.z;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const group = groups.get(`${ccx + dx},${ccz + dz}`);
          if (!group) continue;
          const { placed, cx, cz } = group.userData;
          for (const [type, list] of Object.entries(placed)) {
            const bush = NO_COLLIDE.has(type);
            const prof = profileOf(type);
            for (const t of list) {
              if (t.removed) continue;
              const x = cx * size + t.x, z = cz * size + t.z;
              if (Math.abs(x - origin.x) > reach + 3 || Math.abs(z - origin.z) > reach + 3) continue;
              const radius = bush ? (prof?.radius ?? 0.8) * t.s * 0.8 : (TRUNK_RADIUS[type] ?? 0.3) * t.s;
              const height = bush ? (prof?.top ?? 1.2) * t.sy : Math.max(2, (prof?.bottom ?? 3) * t.sy);
              const ox = origin.x - x, oz = origin.z - z;
              let tt = a > 1e-6 ? -(ox * dir.x + oz * dir.z) / a : 0;
              tt = Math.max(0, Math.min(reach, tt));
              const hd = Math.hypot(ox + dir.x * tt, oz + dir.z * tt);
              const y = origin.y + dir.y * tt;
              if (hd > radius + 0.25 || y < t.y - 0.4 || y > t.y + height + 0.3) continue;
              if (!best || tt < best.distance) best = { key: treeKey(cx, cz, type, t), type, t, x, y: t.y, z, radius, height, bush, distance: tt, group };
            }
          }
        }
      }
      return best;
    },

    /**
     * The trees and bushes standing within `r` of (x, z) (world): as `pick`
     * finds them, with their crowns ({ bottom, top, radius, cone }, world
     * heights) to set alight.
     */
    within(x, z, r) {
      const size = layer.chunkSize, out = [];
      if (!size) return out;
      const c0x = Math.floor((x - r) / size), c1x = Math.floor((x + r) / size), c0z = Math.floor((z - r) / size), c1z = Math.floor((z + r) / size);
      for (let cz = c0z; cz <= c1z; cz++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const group = groups.get(`${cx},${cz}`);
          if (!group) continue;
          for (const [type, list] of Object.entries(group.userData.placed)) {
            if (type === 'cactus' || type === 'smallCactus') continue;
            const bush = NO_COLLIDE.has(type), prof = profileOf(type);
            for (const t of list) {
              if (t.removed) continue;
              const tx = cx * size + t.x, tz = cz * size + t.z;
              if ((tx - x) ** 2 + (tz - z) ** 2 > r * r) continue;
              const crown = { bottom: t.y + (prof?.bottom ?? 0.3) * t.sy, top: t.y + (prof?.top ?? 1.2) * t.sy, radius: (prof?.radius ?? 0.8) * t.s, cone: !!prof?.cone };
              out.push({ key: treeKey(cx, cz, type, t), type, t, x: tx, y: t.y, z: tz, bush, radius: bush ? crown.radius * 0.8 : (TRUNK_RADIUS[type] ?? 0.3) * t.s, crown, group });
            }
          }
        }
      }
      return out;
    },

    /** How tall a species' crown reaches, for a tree of size 1. */
    profileTop(type) {
      return profileOf(type)?.top ?? 6;
    },

    /** A species' crown, for a tree of size 1: { bottom, top, radius, cone }, or null. */
    profile(type) {
      return profileOf(type);
    },

    /** How thick a species' trunk is, for a tree of size 1. */
    trunkRadius(type) {
      return TRUNK_RADIUS[type] ?? 0.3;
    },

    /** Whether the deciduous trees are bare now (winter). */
    get bare() {
      return bare;
    },

    /** The transform a picked tree is drawn with (world). */
    matrixOf(hit, out = new Matrix4()) {
      const mesh = hit.group.userData.meshes[hit.type];
      mesh.getMatrixAt(hit.t.index, out);
      return out.premultiply(hit.group.matrixWorld);
    },

    /** A standing tree by its key, as `pick` finds it (online: one someone else is felling), or null. */
    findKey(key) {
      const [cx, cz, type] = key.split(',');
      const group = groups.get(`${cx},${cz}`);
      const size = layer.chunkSize;
      if (!group || !size || layer.removed.has(key)) return null;
      for (const t of group.userData.placed[type] ?? []) {
        if (t.removed || treeKey(+cx, +cz, type, t) !== key) continue;
        const prof = profileOf(type), bush = NO_COLLIDE.has(type);
        return { key, type, t, x: +cx * size + t.x, y: t.y, z: +cz * size + t.z, group, bush, radius: bush ? (prof?.radius ?? 0.8) * t.s * 0.8 : (TRUNK_RADIUS[type] ?? 0.3) * t.s };
      }
      return null;
    },

    /**
     * A tree burnt down growing back (see Felling.regrow): no longer gone,
     * and drawn `grown` of its full size (0..1) about its foot, its world
     * transform `world` (as matrixOf gave it). Returns whether it's drawn
     * (its chunk is loaded); either way, it's there from now on.
     */
    restore(key, world, grown = 1) {
      layer.removed.delete(key);
      const [cx, cz, type] = key.split(',');
      const group = groups.get(`${cx},${cz}`);
      if (!group) return false;
      const t = (group.userData.placed[type] ?? []).find((t) => treeKey(+cx, +cz, type, t) === key);
      const mesh = group.userData.meshes[type];
      if (!t || !mesh) return false;
      const size = layer.chunkSize;
      if (t.removed) {
        t.removed = false;
        // (Solid again, its trunk.)
        if (!NO_COLLIDE.has(type)) layer.trunks.get(group.userData.key)?.push(+cx * size + t.x, +cz * size + t.z, (TRUNK_RADIUS[type] ?? 0.3) * t.s);
      }
      group.updateMatrixWorld();
      matrix.copy(group.matrixWorld).invert().multiply(world);
      if (grown < 1) {
        // (Small, about its foot: a sapling.)
        const foot = position.setFromMatrixPosition(matrix);
        matrix.premultiply(scaleAbout.makeTranslation(-foot.x, -foot.y, -foot.z)).premultiply(scaleBy.makeScale(grown, grown, grown)).premultiply(scaleAbout.makeTranslation(foot.x, foot.y, foot.z));
      }
      mesh.setMatrixAt(t.index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },

    /** Takes away a tree by its key (felled by someone else, online): now, if it's drawn, else when it is. */
    removeKey(key) {
      const hit = layer.findKey(key);
      if (hit) layer.remove(hit);
      else layer.removed.add(key);
    },

    /** Takes a tree away, for good (felled): no longer drawn, nor in the way. */
    remove(hit) {
      layer.removed.add(hit.key);
      hit.t.removed = true;
      const mesh = hit.group.userData.meshes[hit.type];
      mesh.setMatrixAt(hit.t.index, matrix.makeScale(0, 0, 0));
      mesh.instanceMatrix.needsUpdate = true;
      const key = hit.group.userData.key;
      const cut = (list, stride) => {
        if (!list) return;
        for (let k = 0; k < list.length; k += stride) {
          if (Math.abs(list[k] - hit.x) < 0.05 && Math.abs(list[k + 1] - hit.z) < 0.05) {
            list.splice(k, stride);
            return;
          }
        }
      };
      cut(layer.trunks.get(key), 3);
      cut(layer.bushes.get(key), 3);
      cut(layer.crowns.get(key), 5);
      cut(layer.foliage.get(key), 6);
      cut(layer.frames.get(key), 6);
    },

    /**
     * The leaves of the trees round a walking body (a circle at `position`,
     * feet at `feetY`, `height` tall): pushed out of the thick of them (you
     * can lean a little way in, not walk through), and how much they slow
     * you (1: not at all).
     */
    leaves(position, radius, feetY, height = 1.8) {
      const size = layer.chunkSize;
      if (!size) return 1;
      const cx = Math.floor(position.x / size), cz = Math.floor(position.z / size);
      let slow = 1;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = layer.foliage.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 6) {
            const ox = position.x - list[k], oz = position.z - list[k + 1];
            if (Math.abs(ox) > 8 || Math.abs(oz) > 8) continue;
            const bottom = list[k + 2], top = list[k + 3];
            const low = Math.max(bottom, feetY + 0.35);
            if (low > feetY + height || top < feetY + 0.35) continue;
            // (A pine's crown is widest at its foot.)
            const r = list[k + 4] * (list[k + 5] ? Math.max(0.25, (top - low) / (top - bottom)) : 1);
            const d = Math.hypot(ox, oz);
            if (d > r + radius) continue;
            // (Hard going: down to a fifth of your pace in the thick of a
            // bush or the low boughs, and more for each one you're in.)
            slow *= 0.2 + 0.8 * Math.min(1, Math.max(0, (d - r * 0.4) / (r * 0.6 + radius)));
            const hard = r * 0.55 + radius;
            if (d < hard && d > 0) {
              position.x += (ox / d) * (hard - d);
              position.z += (oz / d) * (hard - d);
            }
          }
        }
      }
      return Math.max(0.12, slow);
    },

    /**
     * The top of the trees over (x, z): the highest crown (or bush) whose
     * spread reaches within `pad` metres of it, or -Infinity. (For birds:
     * over the treetops, not through them.)
     */
    canopyTop(x, z, pad = 0.5) {
      const size = layer.chunkSize;
      if (!size) return -Infinity;
      const cx = Math.floor(x / size), cz = Math.floor(z / size);
      let top = -Infinity;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = layer.foliage.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 6) {
            const ox = x - list[k], oz = z - list[k + 1], r = list[k + 4] + pad;
            if (Math.abs(ox) > r || Math.abs(oz) > r || ox * ox + oz * oz > r * r || list[k + 3] <= top) continue;
            top = list[k + 3];
          }
        }
      }
      return top;
    },

    /** The thick of the leaves near (x, z) at the height of an animal `tall` metres high: circles [x, z, radius, ...]. */
    leafObstacles(x, z, reach, groundY, tall) {
      const size = layer.chunkSize;
      const out = [];
      if (!size) return out;
      const cx = Math.floor(x / size), cz = Math.floor(z / size);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = layer.foliage.get(`${cx + dx},${cz + dz}`);
          if (!list) continue;
          for (let k = 0; k < list.length; k += 6) {
            if (Math.abs(list[k] - x) > reach || Math.abs(list[k + 1] - z) > reach) continue;
            const bottom = list[k + 2], top = list[k + 3];
            const low = Math.max(bottom, groundY + 0.3);
            if (low > groundY + tall || top < groundY + 0.3) continue;
            const r = list[k + 4] * (list[k + 5] ? Math.max(0.25, (top - low) / (top - bottom)) : 1);
            out.push(list[k], list[k + 1], r * 0.55);
          }
        }
      }
      return out;
    },

    /**
     * What stands within `r` of (x, z) that nothing can be built over:
     * 'tree' (a trunk) or 'bush' (its crown), or null.
     */
    solidAt(x, z, r, chunkSize) {
      const cx = Math.floor(x / chunkSize), cz = Math.floor(z / chunkSize);
      for (const [map, what, k] of [[layer.trunks, 'tree', 1], [layer.bushes, 'bush', 0.8]]) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const list = map.get(`${cx + dx},${cz + dz}`);
            if (!list) continue;
            for (let i = 0; i < list.length; i += 3) {
              const min = r + list[i + 2] * k;
              if ((x - list[i]) ** 2 + (z - list[i + 1]) ** 2 < min * min) return what;
            }
          }
        }
      }
      return null;
    },

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
      lod > config.treeMaxLod ? 'none' : `${resolution}:${lod <= config.leafMaxLod}:${lod <= (config.treeShadowLod ?? Infinity)}`,

    build({ cx, cz, lod, groundHeightAt, generator, config, prepared }) {
      if (lod > config.treeMaxLod) return null;
      const { chunkSize, treeSpacing } = config;
      layer.chunkSize = chunkSize;
      const cells = Math.round(chunkSize / treeSpacing);
      const spacing = chunkSize / cells;
      const originX = cx * chunkSize;
      const originZ = cz * chunkSize;
      // (Worked out by the chunk's worker, or here.)
      const all = prepared?.trees ?? placeTrees(generator, config, cx, cz, groundHeightAt, rocks ? rocks.bouldersNear(cx, cz, generator, spacing) : null);
      // (Not the ones felled; each remembers where it is in its mesh.)
      const placed = {};
      // (None where old stone stands: see keepOut.)
      const out = layer.keepOut?.(originX - 30, originZ - 30, originX + chunkSize + 30, originZ + chunkSize + 30) ?? [];
      for (const [type, list] of Object.entries(all)) {
        const kept = [];
        for (const t0 of list) {
          if (layer.removed.size && layer.removed.has(treeKey(cx, cz, type, t0))) continue;
          if (out.length && out.some(([x, z, r]) => (originX + t0.x - x) ** 2 + (originZ + t0.z - z) ** 2 < r * r)) continue;
          kept.push({ ...t0, index: kept.length });
        }
        if (kept.length) placed[type] = kept;
      }

      const trunks = [], bushes = [];
      for (const [type, list] of Object.entries(placed)) {
        if (NO_COLLIDE.has(type)) {
          const r = profileOf(type)?.radius ?? 0.6;
          for (const t of list) bushes.push(originX + t.x, originZ + t.z, r * t.s);
          continue;
        }
        const r = TRUNK_RADIUS[type] ?? 0.3, off = TRUNK_OFFSET[type] ?? 0;
        // (A tree turned by `rot` about the vertical has its own x axis along (cos rot, -sin rot).)
        for (const t of list) trunks.push(originX + t.x + Math.cos(t.rot) * off * t.s, originZ + t.z - Math.sin(t.rot) * off * t.s, r * t.s);
      }

      // Where the broad-leaved trees' crowns are (for falling leaves), on the nearer chunks.
      const crowns = [];
      if (lod <= 1) {
        for (const [type, list] of Object.entries(placed)) {
          const c = crownOf(type);
          if (!c) continue;
          for (const t of list) crowns.push(originX + t.x, originZ + t.z, t.y + c.bottom * t.sy, t.y + c.top * t.sy, c.radius * t.s);
        }
      }

      // The swaying trees with crowns (for the birds perched in them, see swayAt).
      const frames = [];
      if (lod <= 1) {
        for (const [type, list] of Object.entries(placed)) {
          if (!crownOf(type) || STIFF.has(type)) continue;
          for (const t of list) frames.push(originX + t.x, originZ + t.z, t.y, t.rot, t.s, t.sy);
        }
      }

      // Every crown near enough to walk into, for the leaves' hitboxes.
      const foliage = [];
      if (lod <= 1) {
        for (const [type, list] of Object.entries(placed)) {
          const c = profileOf(type);
          if (!c || STIFF.has(type)) continue;
          for (const t of list) foliage.push(originX + t.x, originZ + t.z, t.y + c.bottom * t.sy, t.y + c.top * t.sy, c.radius * t.s, c.cone ? 1 : 0);
        }
      }

      const group = new Group();
      group.name = 'trees';
      group.userData.placed = placed;
      group.userData.meshes = {};
      group.userData.cx = cx;
      group.userData.cz = cz;
      let count = 0;
      for (const [type, list] of Object.entries(placed)) {
        // (Bushes and the little cacti only near you: further off they're
        // specks, and a great many triangles.)
        if (lod > 1 && SMALL_PLANTS.has(type)) continue;
        const stiff = STIFF.has(type);
        const mesh = new InstancedMesh(treeGeometry(type, bare), stiff ? stiffMaterial : material, list.length);
        mesh.name = type;
        meshes.add(mesh);
        group.userData.meshes[type] = mesh;
        list.forEach((t, k) => {
          position.set(t.x, t.y, t.z);
          // Spin about the trunk, then tip over by the lean.
          lean.set(t.leanZ, 0, -t.leanX);
          const angle = Math.min(0.21, lean.length());
          rotation.setFromAxisAngle(lean.normalize(), angle).multiply(spin.setFromAxisAngle(up, t.rot));
          scale.set(t.s, t.sy, t.s);
          mesh.setMatrixAt(k, matrix.compose(position, rotation, scale));
          // Slight per-tree brightness/warmth change so forests aren't flat.
          // (And how warm the country is where it stands, carried in how much
          // less blue it is than green: see seasonalTrees.)
          const v = 0.82 + t.shade * 0.3;
          mesh.setColorAt(k, tint.setRGB(v * (0.96 + t.shade * 0.08), v, v * (0.95 - 0.1 * (t.warm ?? 0))));
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = lod <= (config.treeShadowLod ?? Infinity); // (out past the shadows' reach, none to cast)
        mesh.userData.smallShadow = NO_COLLIDE.has(type); // (a bush: its shadow only close by, see ChunkManager.cull)
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
          leavesMesh.userData.smallShadow = NO_COLLIDE.has(type);
          leavesMesh.receiveShadow = true;
          leavesMesh.customDepthMaterial = depthMaterial;
          group.add(leavesMesh);
        }
      }
      if (count === 0) return null;
      group.userData.count = count;
      group.userData.key = `${cx},${cz}`;
      group.userData.trunks = trunks;
      group.userData.crowns = crowns;
      group.userData.foliage = foliage;
      group.userData.frames = frames;
      layer.count += count;
      layer.foliage.set(group.userData.key, foliage);
      layer.trunks.set(group.userData.key, trunks);
      layer.bushes.set(group.userData.key, bushes);
      group.userData.bushes = bushes;
      layer.crowns.set(group.userData.key, crowns);
      layer.frames.set(group.userData.key, frames);
      groups.set(group.userData.key, group);
      return group;
    },

    dispose(group) {
      layer.count -= group.userData.count;
      // A rebuilt chunk (new LOD) may already have registered its trunks.
      if (layer.trunks.get(group.userData.key) === group.userData.trunks) layer.trunks.delete(group.userData.key);
      if (layer.bushes.get(group.userData.key) === group.userData.bushes) layer.bushes.delete(group.userData.key);
      if (layer.crowns.get(group.userData.key) === group.userData.crowns) layer.crowns.delete(group.userData.key);
      if (layer.foliage.get(group.userData.key) === group.userData.foliage) layer.foliage.delete(group.userData.key);
      if (layer.frames.get(group.userData.key) === group.userData.frames) layer.frames.delete(group.userData.key);
      if (groups.get(group.userData.key) === group) groups.delete(group.userData.key);
      for (const mesh of group.children) {
        meshes.delete(mesh);
        mesh.dispose(); // geometry is shared
      }
    },
  };
  return layer;
}
