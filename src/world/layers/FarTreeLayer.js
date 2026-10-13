import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshLambertMaterial,
  Sphere,
  Vector3,
} from 'three';
import { seasonalTrees } from '../../render/Seasons.js';
import { FALL, TREE_GEOMETRIES } from '../trees.js';
import { packFarTrees, placeTrees } from '../treePlacement.js';
import { SMALL_PLANTS } from './TreeLayer.js';

const CONES = new Set(['pine', 'spruce', 'larch', 'redwood']);
const SPIKES = new Set(['deadPine', 'cactus', 'charredSnag', 'bamboo']); // (bamboo: a single cane)
const CLUMPS = new Set();
// Crowns held high on a bare trunk (and its bark colour).
const UMBRELLAS = { jungleGiant: 0x857560, jungleCanopy: 0x6e604c, junglePalm: 0x7d6a52, treeFern: 0x44342a };
const BARK = { ...UMBRELLAS, birch: 0xd9d6cc, silverBirch: 0xe0ddd2, aspen: 0xcfd0c4, baobab: 0x8a7a66, acacia: 0x6a5240 };

/**
 * A few-triangle stand-in for each kind of tree, fitted to its real
 * model, in its crown's colours. The `detailed` ones (for the middle
 * distance) keep each tree's character: a conifer two tiers of boughs on a
 * trunk, a broad-leaved tree a lumpy round crown on its trunk (white for
 * the birches), shaded darker underneath; the jungle's giants, palms and
 * tree ferns a flat crown up on a trunk. Further off, the simplest shapes:
 * conifers a cone, dead trees and cacti a spike, bamboo a tall clump,
 * everything else a diamond.
 */
function farGeometry(type, detailed) {
  const real = TREE_GEOMETRIES[type];
  const crown = real.userData.crown ?? real;
  crown.computeBoundingBox();
  const box = crown.boundingBox;
  // Average colour of the crown (or the whole tree).
  const colours = crown.attributes.color;
  const avg = new Color(0, 0, 0);
  for (let k = 0; k < colours.count; k++) avg.r += colours.getX(k), avg.g += colours.getY(k), avg.b += colours.getZ(k);
  avg.multiplyScalar(1 / Math.max(1, colours.count));
  const season = real.attributes.aSeason;
  const most = (get) => (season ? Math.max(...Array.from({ length: season.count }, (_, k) => get(k))) : 0);
  const deciduous = most((k) => season.getX(k));
  const snowy = season ? season.getY(0) : 0;
  const flowers = Math.min(1, most((k) => season.getZ(k))); // (not the fruit)
  const leafy = [deciduous, snowy, flowers], woody = [0, snowy, 0];

  const centre = box.getCenter(new Vector3());
  const half = box.getSize(new Vector3()).multiplyScalar(0.5);
  const r = (half.x + half.z) / 2;
  const y0 = box.min.y, h = box.max.y - box.min.y;
  const positions = [], cols = [], seasons = [];
  const shade = (k) => avg.clone().multiplyScalar(k);
  const bark = new Color(BARK[type] ?? 0x5e4a38);
  const ring = (y, radius, sides, turn = 0, lumpy = 0) =>
    Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2 + turn;
      const q = radius * (1 + lumpy * (Math.sin(k * 12.9898 + y * 78.233 + type.length * 3.1) * 0.5));
      return [centre.x + Math.cos(a) * q, y, centre.z + Math.sin(a) * q];
    });
  const tri = (a, b, c, ca = avg, cb = ca, cc = ca, sea = leafy) => {
    positions.push(...a, ...b, ...c);
    for (const col of [ca, cb, cc]) cols.push(col.r, col.g, col.b);
    for (let k = 0; k < 3; k++) seasons.push(...sea);
  };
  // A slim three-sided trunk from the ground up to `top` under the crown.
  const trunk = (top, tw) => {
    const foot = Array.from({ length: 3 }, (_, k) => [Math.cos((k / 3) * Math.PI * 2) * tw * 1.4, 0, Math.sin((k / 3) * Math.PI * 2) * tw * 1.4]);
    const head = Array.from({ length: 3 }, (_, k) => [centre.x + Math.cos((k / 3) * Math.PI * 2) * tw, top, centre.z + Math.sin((k / 3) * Math.PI * 2) * tw]);
    for (let k = 0; k < 3; k++) {
      const m = (k + 1) % 3;
      tri(foot[k], head[m], foot[m], bark, bark, bark, woody);
      tri(foot[k], head[k], head[m], bark, bark, bark, woody);
    }
  };
  if (UMBRELLAS[type]) {
    // The crown's bulk (not the vines or fronds trailing below it): from
    // under its middle, to its top.
    const ys = Array.from({ length: crown.attributes.position.count }, (_, k) => crown.attributes.position.getY(k)).sort((a, b) => a - b);
    const mid = ys[Math.floor(ys.length * 0.6)];
    const low = Math.max(box.min.y, mid - (box.max.y - mid) * 1.1);
    const dark = shade(0.72), light = shade(1.15), deep = shade(0.58);
    if (type === 'junglePalm' || type === 'treeFern') {
      // Palms and tree ferns: a star of fronds arching out and drooping
      // from the crown, each a long narrow blade creased down its middle.
      const fronds = detailed ? 7 : 5;
      const crownY = box.max.y - (box.max.y - low) * 0.25;
      const hub = [centre.x, crownY, centre.z];
      for (let k = 0; k < fronds; k++) {
        const a = (k / fronds) * Math.PI * 2 + type.length;
        const ca = Math.cos(a), sa = Math.sin(a);
        const reach = r * (0.9 + 0.15 * Math.sin(k * 2.3));
        const tip = [centre.x + ca * reach, crownY - (crownY - low) * 0.9, centre.z + sa * reach];
        const w = reach * 0.22;
        const midR = reach * 0.55, midY = crownY + (box.max.y - crownY) * 0.6;
        const left = [centre.x + ca * midR - sa * w, midY, centre.z + sa * midR + ca * w];
        const right = [centre.x + ca * midR + sa * w, midY, centre.z + sa * midR - ca * w];
        tri(hub, left, tip, light, avg, dark);
        tri(hub, tip, right, light, dark, avg);
        tri(hub, tip, left, dark, deep, dark); // (and seen from below)
        tri(hub, right, tip, dark, dark, deep);
      }
      trunk(crownY, Math.max(0.2, r * 0.06));
    } else {
      // Jungle giants and the canopy trees: a broad, flattened, lumpy crown
      // (clumps of foliage, dark underneath) high on a bare trunk, with a
      // smaller clump off to one side up close, so it's never a neat shape.
      const sides = detailed ? 8 : 6;
      const lobe = (cx, cz, yb, yt, rad, turn, lump) => {
        const lo = Array.from({ length: sides }, (_, k) => {
          const a = (k / sides) * Math.PI * 2 + turn, q = rad * (1 + lump * Math.sin(k * 12.9898 + type.length * 3.1));
          return [cx + Math.cos(a) * q, yb + (yt - yb) * 0.3, cz + Math.sin(a) * q];
        });
        const hi = Array.from({ length: sides }, (_, k) => {
          const a = ((k + 0.5) / sides) * Math.PI * 2 + turn, q = rad * 0.72 * (1 + lump * Math.sin(k * 7.13 + type.length));
          return [cx + Math.cos(a) * q, yb + (yt - yb) * (0.72 + 0.12 * Math.sin(k * 3.7)), cz + Math.sin(a) * q];
        });
        const top = [cx, yt, cz], under = [cx, yb, cz];
        for (let k = 0; k < sides; k++) {
          const m = (k + 1) % sides;
          const p = (k + sides - 1) % sides;
          // (Wound as the other crowns here are, facing out.)
          tri(lo[k], lo[m], under, dark, dark, deep);
          tri(lo[m], lo[k], hi[k], avg, avg, light);
          tri(hi[p], hi[k], lo[k], light, light, avg);
          tri(hi[p], top, hi[k], light, light, light);
        }
      };
      const yb = low + (box.max.y - low) * 0.1;
      lobe(centre.x, centre.z, yb, box.max.y, r * 0.95, Math.PI / 6, 0.22);
      if (detailed) {
        const a = type.length * 1.7;
        lobe(centre.x + Math.cos(a) * r * 0.55, centre.z + Math.sin(a) * r * 0.55, yb - (box.max.y - yb) * 0.25, yb + (box.max.y - yb) * 0.55, r * 0.5, 0, 0.3);
      }
      trunk(yb + (box.max.y - yb) * 0.2, Math.max(0.25, r * 0.07));
    }
  } else if (CLUMPS.has(type) || SPIKES.has(type) || (CONES.has(type) && !detailed)) {
    const spike = SPIKES.has(type), clump = CLUMPS.has(type);
    const sides = spike ? 3 : 5;
    const base = ring(spike || clump ? 0 : y0, spike ? Math.min(r, 0.45) : r * (clump ? 0.7 : 0.95), sides);
    const top = [centre.x, box.max.y, centre.z];
    for (let k = 0; k < sides; k++) tri(base[(k + 1) % sides], base[k], top);
  } else if (CONES.has(type)) {
    // Two tiers of boughs, darker at their skirts, on a short trunk.
    const dark = shade(0.78), light = shade(1.15);
    const tier = (yb, yt, rad, turn) => {
      const base = ring(yb, rad, 6, turn);
      const top = [centre.x, yt, centre.z];
      for (let k = 0; k < 6; k++) tri(base[(k + 1) % 6], base[k], top, dark, dark, light);
    };
    tier(y0, y0 + h * 0.7, r * 0.95, 0);
    tier(y0 + h * 0.42, box.max.y, r * 0.62, Math.PI / 6);
    trunk(y0 + h * 0.1, Math.max(0.2, r * 0.09));
  } else if (detailed) {
    // A lumpy, rounded crown, dark underneath and bright on top, on its trunk.
    const lo = ring(y0 + h * 0.3, r * 0.88, 6, 0, 0.25), hi = ring(y0 + h * 0.66, r * 0.9, 6, Math.PI / 6, 0.25);
    const top = [centre.x, box.max.y, centre.z], bottom = [centre.x, y0, centre.z];
    const under = shade(0.7), low = shade(0.9), high = shade(1.05), crest = shade(1.18);
    for (let k = 0; k < 6; k++) {
      const m = (k + 1) % 6;
      tri(lo[k], lo[m], bottom, low, low, under);
      tri(lo[m], lo[k], hi[k], low, low, high);
      tri(hi[k], hi[m], lo[m], high, high, low);
      tri(hi[m], hi[k], top, high, high, crest);
    }
    trunk(y0 + h * 0.35, Math.max(0.18, r * 0.08));
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
  g.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
  g.setAttribute('aSeason', new BufferAttribute(new Float32Array(seasons), 3));
  // (Its species' own autumn colour: see FALL.)
  const fall = FALL[type] ?? [0.85, 0.45, 0.06], falls = new Float32Array(seasons.length);
  for (let k = 0; k < falls.length; k += 3) falls.set(fall, k);
  g.setAttribute('aFall', new BufferAttribute(falls, 3));
  return g;
}

/**
 * The furthest trees of all (past a kilometre): each just a picture of
 * the tree, a flat card turned to face you (two triangles), drawn once from
 * the tree's real model, head on, into a sheet of them (see buildImpostors).
 * At that distance a tree's a handful of pixels, and a picture of it looks
 * more like it than a few-sided solid. The sheet's top half holds the
 * trees' colours; its bottom half, for each pixel, what it is (leaves or
 * not, snow-catching or not, and which way it faces): so the cards still
 * turn with the seasons like the rest.
 */
const CELL = 128; // (pixels a side of each picture)
const COLS = 8;
const impostors = { target: null, cells: new Map(), rows: 1 };

function impostorTypes() {
  return Object.keys(TREE_GEOMETRIES).filter((t) => !SMALL_PLANTS.has(t));
}

/** Each kind of tree's size, for its card: half its width (from the trunk out), and its height. */
function treeBox(type) {
  const g = TREE_GEOMETRIES[type];
  g.computeBoundingBox();
  const b = g.boundingBox;
  const half = Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z)) * 1.04;
  return { half, top: b.max.y * 1.03 };
}

/** Draws every kind of tree into the sheet of pictures (once, at the start). */
export function buildImpostors(renderer) {
  if (impostors.target) return impostors.target.texture;
  const types = impostorTypes();
  const rows = Math.ceil(types.length / COLS);
  const target = new WebGLRenderTarget(COLS * CELL, rows * CELL * 2, { minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true });
  const vertex = /* glsl */ `
    attribute vec3 aSeason;
    varying vec3 vCol;
    varying vec3 vSea;
    varying vec3 vNorm;
    void main() {
      vCol = color;
      vSea = aSeason;
      vNorm = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const colour = new ShaderMaterial({
    vertexColors: true,
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying vec3 vSea;
      varying vec3 vNorm;
      void main() {
        if (vSea.z > 1.5) discard; // (no fruit)
        // (A little of its roundness kept: lighter on top and to the front, darker beneath.)
        vec3 n = normalize(vNorm);
        float shade = 0.82 + 0.16 * n.y + 0.08 * n.z;
        gl_FragColor = vec4(vCol * shade, 1.0);
      }`,
  });
  const kind = new ShaderMaterial({
    vertexColors: true,
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying vec3 vSea;
      varying vec3 vNorm;
      void main() {
        if (vSea.z > 1.5) discard;
        gl_FragColor = vec4(clamp(vSea.x, 0.0, 1.0), clamp(vSea.y, 0.0, 1.0), normalize(vNorm).y * 0.5 + 0.5, 1.0);
      }`,
  });
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, 0, 0.1, 400);
  camera.position.set(0, 0, 200);
  camera.lookAt(0, 0, 0);
  const before = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, scissor: renderer.getScissorTest() };
  renderer.setRenderTarget(target);
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  types.forEach((type, k) => {
    const geometry = TREE_GEOMETRIES[type];
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const { half, top } = treeBox(type);
    Object.assign(camera, { left: -half, right: half, top, bottom: 0 });
    camera.position.y = 0;
    camera.updateProjectionMatrix();
    const col = k % COLS, row = Math.floor(k / COLS);
    impostors.cells.set(type, { col, row, half, top });
    const mesh = new Mesh(geometry, colour);
    scene.add(mesh);
    for (const [material, y0, avg] of [[colour, (rows + row) * CELL, true], [kind, row * CELL, false]]) {
      mesh.material = material;
      // (Cleared to the tree's own colour, see-through: so its edges, blurred into the background far off, don't darken.)
      renderer.setClearColor(avg ? crownColour(type) : 0x000000, 0);
      renderer.setViewport(col * CELL, y0, CELL, CELL);
      renderer.setScissor(col * CELL, y0, CELL, CELL);
      renderer.clear();
      renderer.render(scene, camera);
    }
    scene.remove(mesh);
  });
  renderer.setScissorTest(before.scissor);
  renderer.autoClear = before.autoClear;
  renderer.setClearColor(before.colour, before.alpha);
  renderer.setRenderTarget(before.target);
  colour.dispose();
  kind.dispose();
  impostors.target = target;
  impostors.rows = rows;
  return target.texture;
}

function crownColour(type) {
  const real = TREE_GEOMETRIES[type], crown = real.userData.crown ?? real, c = crown.attributes.color, avg = new Color(0, 0, 0);
  for (let k = 0; k < c.count; k++) avg.r += c.getX(k), avg.g += c.getY(k), avg.b += c.getZ(k);
  return avg.multiplyScalar(1 / Math.max(1, c.count));
}

/** A tree's card: two triangles, as wide and tall as the tree, mapped to its picture. */
function impostorGeometry(type) {
  const { col, row, half, top } = impostors.cells.get(type);
  const rows = impostors.rows;
  const u0 = col / COLS, u1 = (col + 1) / COLS;
  // (The colour pictures are the sheet's top half: v from the top half's foot.)
  const v0 = (rows + row) / (rows * 2), v1 = (rows + row + 1) / (rows * 2);
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-half, 0, 0, half, 0, 0, half, top, 0, -half, top, 0]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]), 2));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(12).fill(0), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aSeason', new BufferAttribute(new Float32Array(12), 3));
  const fall = FALL[type] ?? [0.85, 0.45, 0.06];
  g.setAttribute('aFall', new BufferAttribute(new Float32Array([...fall, ...fall, ...fall, ...fall]), 3));
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
        // aSpot: position (world), size; aShape: height, turn, shade, warmth.
        {
          float c = cos(aShape.y), s = sin(aShape.y);
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
          // Fuller with distance: a tree a kilometre or two off is a
          // pixel or less, and a forest of them would read as thin and
          // patchy; broadened (and a little taller), they keep its cover.
          float far = smoothstep(300.0, 1800.0, distance(aSpot.xz, cameraPosition.xz));
          transformed *= vec3(aSpot.w * (1.0 + 0.9 * far), aShape.x * (1.0 + 0.25 * far), aSpot.w * (1.0 + 0.9 * far));
          transformed += aSpot.xyz;
          vShade = 0.82 + aShape.z * 0.3;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vec3(vShade * (0.96 + (vShade - 0.82) * 0.27), vShade, vShade * 0.95);');
  };
  material.customProgramCacheKey = () => 'far-trees';
  seasonalTrees(material, false, 'aShape.z', 'aShape.w', 'aSpot.y');

  // The furthest: the cards (see buildImpostors), turned about their upright to face you.
  const impostorUniform = { value: null };
  const cardMaterial = new MeshLambertMaterial();
  cardMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uImpostor = impostorUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSpot;\nattribute vec4 aShape;\nvarying float vShade;\nvarying vec2 vImpUv;')
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `vec3 toCam = cameraPosition - aSpot.xyz;
        vec2 camFlat = normalize(toCam.xz + vec2(1e-4, 0.0));
        // (Lit as though it faced up and towards you: like a crown's top and front.)
        vec3 objectNormal = normalize(vec3(camFlat.x, 0.0, camFlat.y) * 0.55 + vec3(0.0, 0.85, 0.0));`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `float far = smoothstep(300.0, 1800.0, length(toCam.xz));
        // (Mirrored or not, tree by tree, so a wood isn't all one tree.)
        float mirror = sin(aShape.y) < 0.0 ? -1.0 : 1.0;
        vec3 right = vec3(camFlat.y, 0.0, -camFlat.x);
        vec3 transformed = right * position.x * mirror * aSpot.w * (1.0 + 0.9 * far) + vec3(0.0, position.y * aShape.x * (1.0 + 0.25 * far), 0.0) + aSpot.xyz;
        vImpUv = uv;
        vShade = 0.82 + aShape.z * 0.3;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uImpostor;\nvarying float vShade;\nvarying vec2 vImpUv;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `vec4 impColour = texture2D(uImpostor, vImpUv);
        if (impColour.a < 0.4) discard;
        diffuseColor.rgb = impColour.rgb;
        diffuseColor.rgb *= vec3(vShade * (0.96 + (vShade - 0.82) * 0.27), vShade, vShade * 0.95);
        vec4 impKind = texture2D(uImpostor, vImpUv - vec2(0.0, 0.5));
        #define vSeason vec3(impKind.r, impKind.g, 0.0)
        #define vSeasonUp (impKind.b * 2.0 - 1.0)
        #include <color_fragment>`,
      );
  };
  cardMaterial.customProgramCacheKey = () => 'far-tree-cards';
  seasonalTrees(cardMaterial, false, 'aShape.z', 'aShape.w', 'aSpot.y');

  // One pool per kind of tree in each square of the land (TILE chunks a
  // side): instances packed at the front, a chunk's handle knowing which
  // slots are its own. A square out of view (behind you, off to the side)
  // isn't drawn at all: its pool's bounds are the square's.
  const TILE = 6;
  const pools = new Map();
  function pool(type, detailed, tx, tz) {
    // (The furthest, the cards, once their pictures are drawn.)
    const card = !detailed && impostors.cells.has(type);
    const key = `${type}:${card ? 2 : detailed ? 1 : 0}:${tx},${tz}`;
    let p = pools.get(key);
    if (!p) {
      const geometry = card ? impostorGeometry(type) : farGeometry(type, detailed);
      p = { geometry, mesh: null, capacity: 0, count: 0, spot: null, shape: null, owner: [], slot: [], lo: Infinity, hi: -1 };
      grow(p, 256);
      const size = TILE * config.chunkSize;
      // (The square, from well below the sea to above the highest trees on the highest peaks.)
      geometry.boundingSphere = new Sphere(new Vector3((tx + 0.5) * size, 150, (tz + 0.5) * size), Math.hypot(size / 2, size / 2, 300));
      p.mesh = new Mesh(geometry, card ? cardMaterial : material);
      p.mesh.frustumCulled = true;
      p.mesh.name = `far ${type}`;
      group.add(p.mesh);
      pools.set(key, p);
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
  function add(handle, type, detailed, data, tx, tz) {
    const p = pool(type, detailed, tx, tz);
    const n = data.length / 8;
    if (p.count + n > p.capacity) grow(p, Math.max(p.capacity * 2, p.count + n));
    const slots = [];
    for (let k = 0; k < n; k++) {
      const i = p.count++;
      p.spot.array.set([data[k * 8], data[k * 8 + 1], data[k * 8 + 2], data[k * 8 + 3]], i * 4);
      p.shape.array.set([data[k * 8 + 4], data[k * 8 + 5], data[k * 8 + 6], data[k * 8 + 7]], i * 4); // (w: how warm: see seasonalTrees)
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
    cardMaterial,
    count: 0,

    /** Draws the furthest trees' pictures (needs the renderer): call once, before the world's built. */
    prepare(renderer) {
      impostorUniform.value = buildImpostors(renderer);
    },

    update() {
      for (const [key, p] of pools) {
        p.geometry.instanceCount = p.count;
        p.mesh.visible = p.count > 0;
        // (A square left behind, long empty: let go of.)
        p.idle = p.count ? 0 : (p.idle ?? 0) + 1;
        if (p.idle > 600) {
          group.remove(p.mesh);
          p.geometry.dispose();
          pools.delete(key);
          continue;
        }
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

    reuseKey: ({ lod, resolution, config }) => (lod > config.treeMaxLod && lod <= config.farTreeMaxLod ? `far:${resolution}:${lod <= config.farTreeDetailLod}` : 'none'),

    build({ cx, cz, lod, groundHeightAt, generator, config, prepared }) {
      if (lod <= config.treeMaxLod || lod > config.farTreeMaxLod) return null;
      // Worked out by the chunk's worker, or here.
      const trees = prepared?.farTrees ?? packFarTrees(placeTrees(generator, config, cx, cz, groundHeightAt, null), cx, cz, config.chunkSize);
      const handle = [];
      let count = 0;
      // (Their character out to the middle distance; the simplest shapes beyond.)
      const detailed = lod <= config.farTreeDetailLod;
      for (const [type, data] of Object.entries(trees)) {
        if (!data.length || SMALL_PLANTS.has(type)) continue; // (no bushes far off)
        add(handle, type, detailed, data, Math.floor(cx / TILE), Math.floor(cz / TILE));
        count += data.length / 8;
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
