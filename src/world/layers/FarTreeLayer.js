import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import { seasonalTrees } from '../../render/Seasons.js';
import { TREE_GEOMETRIES } from '../trees.js';
import { packFarTrees, placeTrees } from '../treePlacement.js';

const CONES = new Set(['pine', 'spruce']);
const SPIKES = new Set(['deadPine', 'cactus']);

/**
 * A few-triangle stand-in for each kind of tree, fitted to its real
 * model: conifers a cone, dead trees and cacti a spike, everything else a
 * diamond the size of its crown, all in the crown's average colour.
 */
function farGeometry(type) {
  const real = TREE_GEOMETRIES[type];
  const crown = real.userData.crown ?? real;
  crown.computeBoundingBox();
  const box = crown.boundingBox;
  // Average colour of the crown (or the whole tree).
  const colours = crown.attributes.color;
  const avg = new Color(0, 0, 0);
  for (let k = 0; k < colours.count; k++) avg.r += colours.getX(k), avg.g += colours.getY(k), avg.b += colours.getZ(k);
  avg.multiplyScalar(1 / Math.max(1, colours.count));
  const deciduous = real.attributes.aSeason ? Math.max(...Array.from({ length: real.attributes.aSeason.count }, (_, k) => real.attributes.aSeason.getX(k))) : 0;
  const snowy = real.attributes.aSeason ? real.attributes.aSeason.getY(0) : 0;

  const centre = box.getCenter(new Vector3());
  const half = box.getSize(new Vector3()).multiplyScalar(0.5);
  const r = (half.x + half.z) / 2;
  const positions = [];
  const ring = (y, radius, sides, turn = 0) =>
    Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2 + turn;
      return [centre.x + Math.cos(a) * radius, y, centre.z + Math.sin(a) * radius];
    });
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  if (CONES.has(type) || SPIKES.has(type)) {
    const sides = SPIKES.has(type) ? 3 : 5;
    const base = ring(SPIKES.has(type) ? 0 : box.min.y, SPIKES.has(type) ? Math.min(r, 0.45) : r * 0.95, sides);
    const top = [centre.x, box.max.y, centre.z];
    for (let k = 0; k < sides; k++) tri(base[(k + 1) % sides], base[k], top);
  } else {
    const mid = ring(centre.y, r, 4, Math.PI / 4);
    const top = [centre.x, box.max.y, centre.z], bottom = [centre.x, box.min.y, centre.z];
    for (let k = 0; k < 4; k++) {
      tri(mid[(k + 1) % 4], mid[k], top);
      tri(mid[k], mid[(k + 1) % 4], bottom);
    }
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.computeVertexNormals();
  const n = positions.length / 3;
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).map((_, i) => [avg.r, avg.g, avg.b][i % 3]), 3));
  const season = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) season.set([deciduous, snowy], k * 2);
  g.setAttribute('aSeason', new BufferAttribute(season, 2));
  return g;
}

/**
 * Trees out to the edge of the view, beyond the full-detail ones: a
 * handful of triangles each (see farGeometry), standing exactly where the
 * real trees do (see placeTrees), so as you come closer they simply gain
 * their detail. All the far trees of a kind are one instanced mesh for the
 * whole world (a single draw call), each chunk adding and removing its own.
 * They turn with the seasons like the near trees, and cast no shadows
 * (they're beyond the shadows' reach anyway).
 */
export function createFarTreeLayer(config) {
  const group = new Group();
  group.name = 'far trees';
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSpot;\nattribute vec4 aShape;\nvarying float vShade;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        // aSpot: position (world), size; aShape: height, turn, shade.
        {
          float c = cos(aShape.y), s = sin(aShape.y);
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
          transformed *= vec3(aSpot.w, aShape.x, aSpot.w);
          transformed += aSpot.xyz;
          vShade = 0.82 + aShape.z * 0.3;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vec3(vShade * (0.96 + (vShade - 0.82) * 0.27), vShade, vShade * 0.95);');
  };
  material.customProgramCacheKey = () => 'far-trees';
  seasonalTrees(material, false, 'aShape.z');

  // One pool per kind of tree: instances packed at the front, a chunk's
  // handle knowing which slots are its own.
  const pools = new Map();
  function pool(type) {
    let p = pools.get(type);
    if (!p) {
      const geometry = farGeometry(type);
      p = { geometry, mesh: null, capacity: 0, count: 0, spot: null, shape: null, owner: [], slot: [], lo: Infinity, hi: -1 };
      grow(p, 4096);
      p.mesh = new Mesh(geometry, material);
      p.mesh.frustumCulled = false; // spread over the whole world
      p.mesh.name = `far ${type}`;
      group.add(p.mesh);
      pools.set(type, p);
    }
    return p;
  }
  function grow(p, capacity) {
    const spot = new Float32Array(capacity * 4), shape = new Float32Array(capacity * 4);
    if (p.spot) {
      spot.set(p.spot.array.subarray(0, p.count * 4));
      shape.set(p.shape.array.subarray(0, p.count * 4));
    }
    p.spot = new InstancedBufferAttribute(spot, 4).setUsage(DynamicDrawUsage);
    p.shape = new InstancedBufferAttribute(shape, 4).setUsage(DynamicDrawUsage);
    p.geometry.setAttribute('aSpot', p.spot);
    p.geometry.setAttribute('aShape', p.shape);
    p.capacity = capacity;
    p.lo = 0;
    p.hi = p.count - 1;
  }
  const touch = (p, i) => {
    p.lo = Math.min(p.lo, i);
    p.hi = Math.max(p.hi, i);
  };
  function add(handle, type, data) {
    const p = pool(type);
    const n = data.length / 7;
    if (p.count + n > p.capacity) grow(p, Math.max(p.capacity * 2, p.count + n));
    const slots = [];
    for (let k = 0; k < n; k++) {
      const i = p.count++;
      p.spot.array.set([data[k * 7], data[k * 7 + 1], data[k * 7 + 2], data[k * 7 + 3]], i * 4);
      p.shape.array.set([data[k * 7 + 4], data[k * 7 + 5], data[k * 7 + 6], 0], i * 4);
      p.owner[i] = slots;
      p.slot[i] = k;
      slots.push(i);
      touch(p, i);
    }
    handle.push({ p, slots });
  }
  function remove(handle) {
    for (const { p, slots } of handle) {
      for (let s = 0; s < slots.length; s++) {
        const i = slots[s];
        const last = --p.count;
        if (i !== last) {
          // Move the last instance into the gap.
          p.spot.array.copyWithin(i * 4, last * 4, last * 4 + 4);
          p.shape.array.copyWithin(i * 4, last * 4, last * 4 + 4);
          const owner = p.owner[last], at = p.slot[last];
          owner[at] = i;
          p.owner[i] = owner;
          p.slot[i] = at;
          touch(p, i);
        }
        p.owner[last] = undefined;
      }
    }
    handle.length = 0;
  }

  const layer = {
    name: 'farTrees',
    group,
    material,
    count: 0,

    update() {
      for (const p of pools.values()) {
        p.geometry.instanceCount = p.count;
        if (p.hi < p.lo) continue;
        for (const a of [p.spot, p.shape]) {
          a.clearUpdateRanges();
          a.addUpdateRange(p.lo * 4, (p.hi - p.lo + 1) * 4);
          a.needsUpdate = true;
        }
        p.lo = Infinity;
        p.hi = -1;
      }
    },

    reuseKey: ({ lod, resolution, config }) => (lod > config.treeMaxLod && lod <= config.farTreeMaxLod ? `far:${resolution}` : 'none'),

    build({ cx, cz, lod, groundHeightAt, generator, config, prepared }) {
      if (lod <= config.treeMaxLod || lod > config.farTreeMaxLod) return null;
      // Worked out by the chunk's worker, or here.
      const trees = prepared?.farTrees ?? packFarTrees(placeTrees(generator, config, cx, cz, groundHeightAt, null), cx, cz, config.chunkSize);
      const handle = [];
      let count = 0;
      for (const [type, data] of Object.entries(trees)) {
        if (!data.length) continue;
        add(handle, type, data);
        count += data.length / 7;
      }
      if (!count) return null;
      // A stand-in for the chunk's trees (they're drawn by the pools).
      const stub = new Group();
      stub.name = 'far trees';
      stub.userData.handle = handle;
      stub.userData.count = count;
      layer.count += count;
      return stub;
    },

    dispose(stub) {
      layer.count -= stub.userData.count;
      remove(stub.userData.handle);
    },
  };
  return layer;
}
