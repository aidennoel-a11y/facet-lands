import { boundsOf } from '../../render/cullBounds.js';
import { BoxGeometry, BufferAttribute, Color, DoubleSide, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, ShaderChunk, Sphere, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bonesModel } from '../../survival/models.js';
import { salamander as salamanderModel } from '../../wildlife/models.js';
import { shroomGeometry, shroomOf, shroomPieces } from '../caves/giantShrooms.js';
import { caveQueueFocus } from '../caves/CaveSystem.js';

/**
 * Cave material: vertex-coloured rock whose *daylight* (sun, moon and sky
 * ambient) is scaled by the per-vertex `skyLight` value, so caves get
 * darker the further you are from an entrance. Point lights (torches) are
 * left untouched, so a torch lights a deep cave just as brightly as the mouth.
 */
/** Night vision (testing): 1 lifts the cave darkening completely. */
export const caveNightVision = { value: 0 };
/** Where you are, and whether underground: which caves are wanted (see the layer's update; set by main). */
export const caveFocus = { under: false, atMouth: false, x: 0, z: 0 };
let caveRescue = null; // (see CaveSystem.rescue)
/** The time, for the water's shimmer and the fish (see updateCaveLife). */
export const caveTime = { value: 0 };

// The water and the lava underground: flat sheets, a slow shimmer moving
// over them (the water dark and clear, a little light of its own so it
// shows; the lava glowing).
function liquidMaterial(lava) {
  const material = lava
    ? new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })
    : new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, side: DoubleSide, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCaveTime = caveTime;
    shader.uniforms.uNightVision = caveNightVision;
    // (No daylight down here, as on the rock round it: only a torch's light shows the water.)
    if (!lava) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNightVision;')
        .replace('#include <lights_fragment_begin>', `${ShaderChunk.lights_fragment_begin.replace('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', 'vec3 caveBeforeSky = reflectedLight.directDiffuse;\n#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )')}
          float caveSky = max(0.03, uNightVision);
          reflectedLight.directDiffuse = caveBeforeSky + (reflectedLight.directDiffuse - caveBeforeSky) * caveSky;
          irradiance *= caveSky;`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLiquidAt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLiquidAt = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLiquidAt;\nuniform float uCaveTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ripple = sin(vLiquidAt.x * 0.9 + uCaveTime * ${lava ? '0.4' : '1.1'}) * sin(vLiquidAt.z * 0.7 - uCaveTime * ${lava ? '0.3' : '0.8'});
        diffuseColor.rgb *= ${lava ? '0.85 + 0.3 * ripple' : '0.9 + 0.2 * ripple'};`);
  };
  material.customProgramCacheKey = () => (lava ? 'cave lava' : 'cave water');
  return material;
}

// The life in the dark water: blind white fish, a few to each stretch of
// it, nosing slowly round. (Moved each frame: see updateCaveLife.)
const shoals = new Set();
const fishGeometry = (() => {
  const body = new OctahedronGeometry(0.06, 0).scale(0.7, 0.6, 2.2);
  const tail = new BoxGeometry(0.005, 0.06, 0.06).translate(0, 0, -0.15);
  const g = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
})();
const fishMaterial = new MeshBasicMaterial({ color: 0xc8ccd0, transparent: true, opacity: 0.85 });
// And in the bigger stretches of it, now and then, a giant salamander, half
// as long as you are tall: lying still on the bottom in the shallows, or
// pulling itself slowly along, its tail swaying.
const salamanderGeometry = (() => {
  const m = salamanderModel(), parts = [m.body.index ? m.body.toNonIndexed() : m.body.clone()];
  const head = (m.head.index ? m.head.toNonIndexed() : m.head.clone()).translate(...m.headPivot);
  parts.push(head);
  for (const [x, y, z] of m.legs) parts.push(new BoxGeometry(0.06, y, 0.07).toNonIndexed().translate(x, y / 2, z));
  const keep = (g) => {
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.color) g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.4), 3));
    return g;
  };
  const g = mergeGeometries(parts.map(keep));
  g.scale(0.6, 0.6, 0.6);
  g.computeVertexNormals();
  return g;
})();
const salamanderMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
const fm = new Matrix4(), fq = new Quaternion(), fp = new Vector3(), fs = new Vector3(1, 1, 1), fUp = new Vector3(0, 1, 0);

// Bats flitting about under their roosts in the dark: a few awake at any
// time, darting round in loops, wings beating (more when you come near).
export const roostFlocks = new Set();
const batGeometry = (() => {
  const body = new BoxGeometry(0.05, 0.04, 0.09).toNonIndexed();
  const wings = new BoxGeometry(0.36, 0.006, 0.1).translate(0, 0.01, 0).toNonIndexed();
  const g = mergeGeometries([body, wings]);
  g.computeVertexNormals();
  return g;
})();
const batMaterial = new MeshLambertMaterial({ color: 0x2a2220, emissive: 0x0c0a09 });
const bp = new Vector3(), bs = new Vector3(), bq = new Quaternion(), be = new Euler();

// What's only drawn once you're inside the caves (everything but the bare
// rock): the stalagmites, plants, boulders, finds, water, fish and bats.
// (And only near you: the small things, the plants, vines, finds, bats and
// fish, in the chunks round yours; the big shapes, stalagmites and
// pillars, the water and lava, a chunk further. Beyond that it's too far
// and too dark to see them, and they cost the most to draw.)
const details = new Set();
const rocks = new Set(); // (each chunk's rock: finely faceted near you, plainer further off)
let inside = false;
const FAR_DETAILS = new Set(['cave stalagmites', 'cave water', 'cave lava', 'cave steam', 'cave lava smoke', 'cave crystal', 'cave giant mushrooms']);
let eyeChunk = null, ringWait = 0;
const chunkOf = (mesh) => {
  let p = mesh;
  while (p && !p.userData.chunk) p = p.parent;
  return p?.userData.chunk ?? null;
};
const shown = (mesh) => {
  if (!inside) return false;
  if (!eyeChunk) return true;
  const c = mesh.userData.ringChunk ??= chunkOf(mesh);
  if (!c) return true;
  const ring = Math.max(Math.abs(c[0] - eyeChunk[0]), Math.abs(c[1] - eyeChunk[1]));
  return ring <= (FAR_DETAILS.has(mesh.name) ? 2 : 1);
};
const detail = (mesh) => {
  details.add(mesh);
  mesh.visible = false; // (until it's placed in its chunk: see updateCaveLife)
  ringWait = 0;
  return mesh;
};

// The vines hanging in the lush caves: four kinds, each a unit length
// (hanging from y = 0 down to y = -1), scaled to its length. Drawn with the
// cave rock's own material, so lit (and glowing) the same way.
function vineGeometry(kind) {
  const parts = [];
  const add = (g, colour, glow = [0, 0, 0]) => {
    g = g.toNonIndexed();
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new Color(colour);
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    g.setAttribute('glow', new BufferAttribute(new Float32Array(n * 3).map((_, i) => glow[i % 3]), 3));
    g.setAttribute('skyLight', new BufferAttribute(new Float32Array(n).fill(0.03), 1));
    parts.push(g);
  };
  if (kind === 0) {
    // A thin strand, a few small leaves down it.
    add(new BoxGeometry(0.04, 1, 0.04).translate(0, -0.5, 0), 0x3e6a2a);
    for (let k = 1; k < 5; k++) add(new BoxGeometry(0.1, 0.012, 0.05).rotateY(k * 1.9).translate(0.03, -k * 0.2, 0), 0x5a8a38);
  } else if (kind === 1) {
    // A leafy vine: a stem with leaves in pairs all the way down.
    add(new BoxGeometry(0.06, 1, 0.06).translate(0, -0.5, 0), 0x3a5e26);
    for (let k = 0; k < 9; k++) {
      const y = -0.06 - k * 0.11;
      add(new BoxGeometry(0.2, 0.014, 0.1).rotateZ(-0.4).rotateY(k * 0.9).translate(0.08, y, 0), k % 2 ? 0x4f8a34 : 0x5f9a3e);
    }
  } else if (kind === 2) {
    // A curtain: a row of strands of different lengths hanging side by side.
    for (let k = 0; k < 7; k++) {
      const l = 0.55 + ((k * 37) % 9) / 20;
      add(new BoxGeometry(0.07, l, 0.03).translate((k - 3) * 0.09, -l / 2, (k % 2) * 0.03), k % 3 ? 0x46722e : 0x548a36);
    }
  } else {
    // Hung with glowberries.
    add(new BoxGeometry(0.05, 1, 0.05).translate(0, -0.5, 0), 0x3e6a2a);
    for (let k = 1; k < 6; k++) add(new BoxGeometry(0.09, 0.05, 0.09).translate(0.05 * (k % 2 ? 1 : -1), -k * 0.17, 0), 0xf0c860, [0.6, 0.42, 0.1]);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}
const vineShapes = [0, 1, 2, 3].map(vineGeometry);
const vineSets = new Set(); // (each chunk's vines: see updateCaveLife)
// What glows in the caves gives a little light round it too: crystals,
// glowcaps, glowberries, lava. The nearest few (see caveGlowLights) are
// lent real lights, with the torches (see Torches.update).
const glowSets = new Set();
export const caveGlowLights = [];

// The giant mushrooms (see giantShrooms): each chunk's, drawn by kind;
// those cut down (by key, saved with the world), and the pieces of the ones
// falling apart now.
const shroomSets = new Set();
export const shroomsCut = new Set();
const debris = [];
const dm = new Matrix4(), dq = new Quaternion(), dp = new Vector3(), ds = new Vector3(), de = new Euler();

/** The giant mushroom along a ray from `origin` (unit `dir`) within `reach`: { set, i, x, y, z, height, s, distance } or null. */
export function pickShroom(origin, dir, reach) {
  let best = null;
  for (const set of shroomSets) {
    if (Math.abs(set.cx - origin.x) > 100 || Math.abs(set.cz - origin.z) > 100) continue;
    for (const g of set.list) {
      if (g.cut || Math.abs(g.x - origin.x) > reach + 6 || Math.abs(g.z - origin.z) > reach + 6) continue;
      const stemR = Math.max(0.35, g.height * (g.kind === 2 ? 0.17 : 0.08)) + 0.15, capR = g.height * g.ratio;
      // (Its stem, and its cap: stepped along the ray.)
      for (let t = 0.3; t <= reach; t += 0.2) {
        const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
        const h = Math.hypot(px - g.x, pz - g.z), up = py - g.y;
        if ((h < stemR && up > -0.3 && up < g.height) || (h < capR && up > g.height * 0.8 && up < g.height * 1.25)) {
          if (!best || t < best.distance) best = { ...g, set, distance: t };
          break;
        }
      }
    }
  }
  return best;
}

/** Giant mushrooms out on the surface too (see MushroomIslandLayer): to stand on, cut down and walk round as the cave ones are. */
export const addShroomSet = (set) => shroomSets.add(set);
export const removeShroomSet = (set) => shroomSets.delete(set);

/** A giant mushroom cut down by someone else (online): gone here too, without the tumble. */
export function cutShroomKey(key) {
  shroomsCut.add(key);
  for (const set of shroomSets) {
    const g = set.list.find((o) => o.key === key);
    if (!g || g.cut) continue;
    g.cut = true;
    g.mesh.setMatrixAt(g.index, dm.makeScale(0, 0, 0));
    g.mesh.instanceMatrix.needsUpdate = true;
    set.caves?.clearObstacle?.(g.x, g.z);
  }
}

/** Pushes a walker (circle at `position`, feet at `feetY`) out of the giant mushrooms' stems. */
export function shroomCollide(position, radius, feetY) {
  for (const set of shroomSets) {
    if (Math.abs(set.cx - position.x) > 80 || Math.abs(set.cz - position.z) > 80) continue;
    for (const g of set.list) {
      if (g.cut || Math.abs(g.x - position.x) > 3 || Math.abs(g.z - position.z) > 3) continue;
      if (feetY > g.y + g.height * 0.8 || feetY < g.y - 2) continue; // (over its cap, or a floor below)
      const r = Math.max(0.35, g.height * (g.kind === 2 ? 0.17 : 0.08)) + radius;
      const dx = position.x - g.x, dz = position.z - g.z, d = Math.hypot(dx, dz);
      if (d < r && d > 1e-4) (position.x = g.x + (dx / d) * r), (position.z = g.z + (dz / d) * r);
    }
  }
}

// Each kind's caps (see giantShrooms: at height 1): [out from the stem, rim height, radius, dome height].
const CAP_TOPS = [
  [[0, 0.97, 0.42, 0.18]],
  [[0.32, 0.95, 0.38, 0.16]],
  [[0, 0.55, 0.62, 0.42]],
  [[0, 0.99, 0.58, 0.1]],
  [[0, 0.98, 0.3, 0.12], [Math.sin(0.42) * 0.72, Math.cos(0.42) * 0.72 - 0.02, 0.24, 0.12], [-Math.sin(0.38) * 0.6, Math.cos(0.38) * 0.6 - 0.02, 0.22, 0.12]],
];

/**
 * The top of a giant mushroom's cap under (x, z), for standing on: the
 * highest no more than a step above your feet (`feetY`), or -Infinity.
 */
export function shroomCapAt(x, z, feetY) {
  let best = -Infinity;
  for (const set of shroomSets) {
    if (Math.abs(set.cx - x) > 80 || Math.abs(set.cz - z) > 80) continue;
    for (const g of set.list) {
      if (g.cut || Math.abs(g.x - x) > g.height || Math.abs(g.z - z) > g.height) continue;
      const c = Math.cos(g.turn), s = Math.sin(g.turn);
      for (const [out, rim, r, dome] of CAP_TOPS[g.kind] ?? CAP_TOPS[0]) {
        const px = g.x + out * c * g.height, pz = g.z - out * s * g.height, R = r * g.height;
        const d = Math.hypot(x - px, z - pz);
        if (d >= R) continue;
        const top = g.y - 0.3 + (rim + dome * Math.sqrt(1 - (d / R) ** 2)) * g.height;
        if (top <= feetY + 0.5 && top > best) best = top;
      }
    }
  }
  return best;
}

/**
 * Down it comes, falling apart: hidden, out of the way (its obstacle
 * taken away), and its pieces tumbling to the floor; remembered as cut.
 * Returns what it gives: [[id, n], ...].
 */
export function fellShroom(hit, scene, away) {
  const g = hit.set.list[hit.i];
  if (g.cut) return [];
  g.cut = true;
  shroomsCut.add(g.key);
  g.mesh.setMatrixAt(g.index, dm.makeScale(0, 0, 0));
  g.mesh.instanceMatrix.needsUpdate = true;
  hit.set.caves?.clearObstacle?.(g.x, g.z);
  const shroom = shroomOf(g.s);
  for (const piece of shroomPieces(shroom.kind, shroom.capIndex)) {
    const mesh = new Mesh(piece.geometry, hit.set.material);
    const [cx, cy, cz] = piece.centre;
    mesh.position.set(g.x + Math.cos(g.turn) * cx * g.height + Math.sin(g.turn) * cz * g.height, g.y + cy * g.height, g.z - Math.sin(g.turn) * cx * g.height + Math.cos(g.turn) * cz * g.height);
    mesh.scale.setScalar(g.height);
    mesh.rotation.y = g.turn;
    scene.add(mesh);
    const out = Math.random() * Math.PI * 2;
    debris.push({
      mesh, vx: Math.sin(away) * 2 + Math.cos(out) * 1.5, vy: 1 + Math.random() * 2, vz: Math.cos(away) * 2 + Math.sin(out) * 1.5,
      spin: [rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)], floor: g.y + 0.05, life: 25, scene,
    });
  }
  return shroom.glows ? [['caveMushroom', 2 + Math.floor(g.height / 4)], ['glowcap', 2]] : [['caveMushroom', 2 + Math.floor(g.height / 3)]];
}
const rnd = (a, b) => a + Math.random() * (b - a);
let glowWait = 0;
const UPV = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0), vq = new Quaternion(), vt = new Vector3(), vs = new Vector3(), vp = new Vector3();

/** Sets one vine's matrix: hanging from its top, swung by (sx, sz) (its foot pushed that way, in metres per metre). */
function placeVine(set, v) {
  vt.set(v.sx, -1, v.sz).normalize();
  vq.setFromUnitVectors(DOWN, vt);
  const spin = fq.setFromAxisAngle(fUp, v.turn);
  vq.multiply(spin);
  set.meshes[v.kind].setMatrixAt(v.index, fm.compose(vp.set(v.x - set.x0, v.top, v.z - set.z0), vq, vs.set(v.width, v.len, v.width)));
  set.meshes[v.kind].instanceMatrix.needsUpdate = true;
}

// Steam rising from the geysers: soft pale puffs, swelling as they climb
// and drifting, each vent breathing harder now and then.
const steams = new Set();
const steamGeometry = new OctahedronGeometry(0.35, 1);
const steamMaterial = new MeshBasicMaterial({ color: 0xd8d4d0, transparent: true, opacity: 0.22, depthWrite: false });
const PUFFS = 14;
// (And the smoke off the lava lakes: slow, dark, rising high into the roof.)
const smokeMaterial = new MeshBasicMaterial({ color: 0x3e3834, transparent: true, opacity: 0.26, depthWrite: false });

/** Swims the cave fish and flies the bats (call every frame); `eye`: where you are, if underground. */
export function updateCaveLife(time, eye = null) {
  const dt = Math.min(0.1, Math.max(0, time - (caveTime.value || time)));
  caveTime.value = time;
  // The pieces of a mushroom cut down: tumbling to the floor, lying a while, sinking away.
  for (let k = debris.length - 1; k >= 0; k--) {
    const d = debris[k], m = d.mesh;
    d.life -= dt;
    if (m.position.y > d.floor + 0.1) {
      d.vy -= 9.8 * dt;
      m.position.x += d.vx * dt;
      m.position.y = Math.max(d.floor, m.position.y + d.vy * dt);
      m.position.z += d.vz * dt;
      m.rotation.x += d.spin[0] * dt;
      m.rotation.z += d.spin[2] * dt;
    } else if (d.life < 3) m.position.y -= dt * 0.3;
    if (d.life <= 0) {
      d.scene.remove(m);
      debris.splice(k, 1);
    }
  }
  if (!!eye !== inside) {
    inside = !!eye;
    ringWait = 0;
  }
  if (time > ringWait) {
    ringWait = time + 0.5;
    const size = 128;
    eyeChunk = eye ? [Math.floor(eye.x / size), Math.floor(eye.z / size)] : null;
    for (const m of details) m.visible = shown(m);
    for (const m of rocks) {
      const c = (m.userData.ringChunk ??= chunkOf(m));
      const near = !eyeChunk || !c || Math.max(Math.abs(c[0] - eyeChunk[0]), Math.abs(c[1] - eyeChunk[1])) <= 1;
      m.geometry = near ? m.userData.near : m.userData.far;
    }
  }
  if (!inside) {
    caveGlowLights.length = 0;
    return;
  }
  if (time > glowWait) {
    glowWait = time + 0.3;
    const near = [];
    for (const set of glowSets) {
      if (Math.abs(eye.x - set.cx) > 170 || Math.abs(eye.z - set.cz) > 170) continue;
      for (const g of set.list) {
        const d = (g.x - eye.x) ** 2 + (g.y - eye.y) ** 2 + (g.z - eye.z) ** 2;
        if (d < (g.lava ? 70 * 70 : 100 * 100)) near.push([d, g]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    caveGlowLights.length = 0;
    // (The lava's light first, the nearest few spots of it, as far as it
    // reaches; then the nearest of the rest.)
    let lava = 0;
    for (const [d, g] of near) if (g.lava && lava < 5 && d < 70 * 70) caveGlowLights.push(g), lava++;
    // (The rest by how near they are for how far each reaches: a strong one a
    // way off before a faint one close by.)
    near.sort((a, b) => Math.sqrt(a[0]) / a[1].reach - Math.sqrt(b[0]) / b[1].reach);
    for (const [, g] of near) if (!g.lava && caveGlowLights.length < 11) caveGlowLights.push(g);
  }
  for (const st of steams) {
    if (Math.abs(eye.x - st.cx) > 160 || Math.abs(eye.z - st.cz) > 160) continue;
    let k = 0;
    for (const v of st.vents) {
      const surge = 0.6 + 0.4 * Math.max(0, Math.sin(time * 0.4 + v.phase));
      for (let p = 0; p < PUFFS; p++) {
        const t = (time * 0.22 * (0.8 + v.s * 0.4) + p / PUFFS + v.phase) % 1;
        const rise = t * 7 * v.s * surge;
        bp.set(v.x - st.x0 + Math.sin(time * 0.7 + p * 2.1) * t * 0.9, v.y + rise, v.z - st.z0 + Math.cos(time * 0.5 + p * 1.3) * t * 0.9);
        const sz = (0.4 + t * 2.4) * (1 - t * t) * v.s;
        st.mesh.setMatrixAt(k++, fm.compose(bp, bq.identity(), bs.setScalar(Math.max(0.01, sz))));
      }
    }
    st.mesh.instanceMatrix.needsUpdate = true;
  }
  for (const flock of roostFlocks) {
    if (!flock.mesh.visible) continue;
    // (Come near with a light and they all take wing, fast and wild.)
    const near = eye ? Math.hypot(eye.x - flock.x, eye.y - flock.y, eye.z - flock.z) : 99;
    const stir = near < 10 ? 1 : near < 25 ? 0.5 : 0.2;
    flock.bats.forEach((b, k) => {
      const awake = k < Math.ceil(flock.bats.length * stir);
      const t = time * b.speed * (0.6 + stir) + b.phase;
      const r = awake ? b.r : 0;
      bp.set(flock.x + Math.cos(t) * r + Math.sin(t * 2.3 + b.phase) * r * 0.3 - flock.x0, flock.y - (awake ? b.drop + Math.sin(t * 1.7) * 0.8 : 0.15), flock.z + Math.sin(t) * r * b.squash - flock.z0);
      be.set(0, -t + (b.speed > 0 ? 0 : Math.PI), awake ? Math.sin(t * 3) * 0.3 : 0, 'YXZ');
      bq.setFromEuler(be);
      const flap = awake ? 0.35 + 0.65 * Math.abs(Math.sin(time * 22 + b.phase * 5)) : 0.15;
      flock.mesh.setMatrixAt(k, fm.compose(bp, bq, bs.set(flap, 1, 1)));
    });
    flock.mesh.instanceMatrix.needsUpdate = true;
  }
  for (const shoal of shoals) {
    if (!shoal.mesh.visible) continue;
    shoal.fish.forEach((f, k) => {
      const a = time * f.speed + f.phase;
      fp.set(f.x + Math.cos(a) * f.r - shoal.x0, f.y, f.z + Math.sin(a) * f.r - shoal.z0);
      fq.setFromAxisAngle(fUp, -a + (f.speed > 0 ? Math.PI : 0));
      shoal.mesh.setMatrixAt(k, fm.compose(fp, fq, fs));
    });
    shoal.mesh.instanceMatrix.needsUpdate = true;
    if (shoal.newtMesh) {
      shoal.newts.forEach((f, k) => {
        // (Long stops, lying still; then a slow pull onward.)
        const a = time * f.speed + f.phase + 0.6 * Math.sin(time * 0.05 + f.phase);
        fp.set(f.x + Math.cos(a) * f.r - shoal.x0, f.y, f.z + Math.sin(a) * f.r - shoal.z0);
        fq.setFromAxisAngle(fUp, -a + (f.speed > 0 ? 0 : Math.PI) + 0.12 * Math.sin(time * 0.8 + f.phase));
        shoal.newtMesh.setMatrixAt(k, fm.compose(fp, fq, fs));
      });
      shoal.newtMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// Bats hanging asleep from a roost on the roof, in a dark huddle.
const roostGeometry = (() => {
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, r = 0.15 + (k % 3) * 0.18;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = -0.12 - (k % 2) * 0.05;
    parts.push(new BoxGeometry(0.07, 0.16, 0.06).translate(x, y, z).toNonIndexed());
    parts.push(new BoxGeometry(0.02, 0.05, 0.02).translate(x, -0.02, z).toNonIndexed()); // (the feet, hooked on)
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
})();
const roostMaterial = new MeshLambertMaterial({ color: 0x2a2220, emissive: 0x0a0806 });

function caveMaterial() {
  // (Both sides drawn: where the rock's craggy facets fold over on a thin
  // edge, you see the fold, not a hole through to nothing.)
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
  const lights = ShaderChunk.lights_fragment_begin.replace(
    '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
    'vec3 caveBeforeSky = reflectedLight.directDiffuse;\n#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
  );
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightVision = caveNightVision;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skyLight;\nattribute vec3 glow;\nvarying float vSkyLight;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkyLight = skyLight;\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkyLight;\nvarying vec3 vGlow;\nuniform float uNightVision;')
      // (Rock that gives its own light: glowing cracks, glow-worms, the faint blue of the ice.)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;')
      .replace(
        '#include <lights_fragment_begin>',
        `${lights}
        float caveSky = max(vSkyLight, uNightVision);
        reflectedLight.directDiffuse = caveBeforeSky + (reflectedLight.directDiffuse - caveBeforeSky) * caveSky;
        irradiance *= caveSky;`,
      );
  };
  material.customProgramCacheKey = () => 'cave';
  return material;
}

/**
 * Adds cave rock (and stalagmites / stalactites) to the chunks near the
 * player, up to `caveMaxLod`. The meshes come from the cave system, which
 * builds them from the procedural cave field on a background worker and
 * keeps them cached, so a chunk changing detail level reuses them.
 */
export function createCaveLayer(config) {
  const material = caveMaterial();
  // What's only to look at: old bones (dim, as everything is down there),
  // and the bats' roosts. (Ore, crystals, glowcaps and the rest, to be
  // picked up: see GroundItems.addCave.)
  const bone = new MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0x4a4a4a });
  const bones = bonesModel();
  const water = liquidMaterial(false), lava = liquidMaterial(true);
  const m4 = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), up = new Vector3(0, 1, 0);
  const finds = (features, x0, z0) => {
    const out = [];
    for (const [kind, geometry, mat] of [[4, bones, bone], [12, roostGeometry, roostMaterial]]) {
      const list = [];
      for (let k = 0; k < features.length; k += 6) if (features[k] === kind) list.push(k);
      if (!list.length) continue;
      const mesh = new InstancedMesh(geometry, mat, list.length);
      list.forEach((k, n) => {
        mesh.setMatrixAt(n, m4.compose(p.set(features[k + 1] - x0, features[k + 2] - (kind === 4 ? 0.05 : 0), features[k + 3] - z0), q.setFromAxisAngle(up, features[k + 4]), s.setScalar(features[k + 5])));
      });
      mesh.computeBoundingSphere();
      mesh.name = kind === 4 ? 'cave bones' : 'cave bats';
      out.push(mesh);
    }
    return out;
  };
  // A few blind fish in a stretch of water (chunk-local water geometry).
  const shoal = (geometry, x0, z0, seed) => {
    const pos = geometry.attributes.position;
    const fish = [];
    const tris = pos.count / 3;
    for (let k = 0; k < Math.min(8, Math.ceil(tris / 60)); k++) {
      const t = Math.floor(((Math.sin(seed * 12.9 + k * 78.2) * 43758.5) % 1 + 1) % 1 * tris) * 3;
      fish.push({ x: pos.getX(t) + x0, y: pos.getY(t) - 0.25, z: pos.getZ(t) + z0, r: 0.5 + (k % 3) * 0.4, speed: (k % 2 ? 1 : -1) * (0.25 + (k % 4) * 0.08), phase: k * 1.7 });
    }
    if (!fish.length) return null;
    // (A salamander or two in the bigger lakes, about half of them.)
    const newts = [];
    if (tris > 50 && ((Math.sin(seed * 7.7) * 9871.3) % 1 + 1) % 1 < 0.5) {
      for (let k = 0; k < 1 + Math.floor(tris / 400) && k < 3; k++) {
        const t = Math.floor(((Math.sin(seed * 3.1 + k * 41.7) * 24634.6) % 1 + 1) % 1 * tris) * 3;
        newts.push({ x: pos.getX(t) + x0, y: pos.getY(t) - 0.55, z: pos.getZ(t) + z0, r: 1.5 + k, speed: (k % 2 ? 1 : -1) * 0.05, phase: k * 2.3 + seed });
      }
    }
    let newtMesh = null;
    if (newts.length) {
      newtMesh = new InstancedMesh(salamanderGeometry, salamanderMaterial, newts.length);
      newtMesh.name = 'cave salamanders';
      newtMesh.boundingSphere = boundsOf(newts.flatMap((f) => [f.x - x0, f.y, f.z - z0]), 5);
    }
    const mesh = new InstancedMesh(fishGeometry, fishMaterial, fish.length);
    mesh.name = 'cave fish';
    // (Its bounds: round the circles they swim, so it's left out when off the screen.)
    mesh.boundingSphere = boundsOf(fish.flatMap((f) => [f.x - x0, f.y, f.z - z0]), 2.2);
    return { mesh, fish, x0, z0, newts, newtMesh };
  };

  const waiting = new Set(); // (chunk groups whose caves aren't asked for yet)
  const layer = {
    name: 'caves',
    material,
    onFinds: null, // (cx, cz, features, group): the iron ore, to pick up (see GroundItems.addCave)
    onGone: null,

    reuseKey: ({ lod }) => (lod > config.caveMaxLod ? 'none' : 'caves'),

    build({ cx, cz, lod, generator }) {
      if (lod > config.caveMaxLod || !generator.caves) return null;
      const caves = generator.caves;
      caveRescue = (x, z) => caves.rescue(x, z);
      const group = new Group();
      group.name = 'caves';
      group.userData.chunk = [cx, cz];
      group.userData.caves = caves;
      // From the surface only chunks with a mouth can show any cave (see ChunkManager.setVisibility).
      const size = config.chunkSize;
      group.userData.mouths = caves
        .mouthsNear(cx * size - 16, cz * size - 16, (cx + 1) * size + 16, (cz + 1) * size + 16)
        .filter((e) => e.mouth.x > cx * size - 16 && e.mouth.x < (cx + 1) * size + 16 && e.mouth.z > cz * size - 16 && e.mouth.z < (cz + 1) * size + 16)
        .map((e) => e.mouth);
      group.userData.hasMouth = group.userData.mouths.length > 0;
      // (Nothing's built yet: only once it's wanted, see layer.update.)
      waiting.add(group);
      return group;
    },

    // The caves under a chunk are only built when they could be seen: when
    // you're underground (all of them round you), or on the surface, those
    // by a cave mouth you're near (to see down into it). Elsewhere on the
    // surface, no cave work at all.
    update() {
      (caveQueueFocus.x = caveFocus.x), (caveQueueFocus.z = caveFocus.z); // (the caves nearest you built first)
      if (caveFocus.under || caveFocus.atMouth) caveRescue?.(caveFocus.x, caveFocus.z);
      if (!waiting.size) return;
      const size = config.chunkSize, f = caveFocus;
      // (Coming up to a cave mouth: the caves all round you get built too,
      // ahead of time, so the way in isn't a black void when you get there.)
      const any = waiting.values().next().value;
      const approaching = !f.under && any.userData.caves.mouthsNear(f.x - 220, f.z - 220, f.x + 220, f.z + 220).length > 0;
      const wanted = [];
      for (const group of waiting) {
        const [cx, cz] = group.userData.chunk;
        const d = Math.hypot((cx + 0.5) * size - f.x, (cz + 0.5) * size - f.z);
        let want = f.under || (approaching && d < size * 3);
        if (!want) {
          // (A mouth within reach of you, in this chunk or the next.)
          const near = group.userData.near ??= group.userData.caves
            .mouthsNear((cx - 1) * size, (cz - 1) * size, (cx + 2) * size, (cz + 2) * size)
            .map((e) => e.mouth);
          want = near.some((m) => Math.hypot(m.x - f.x, m.z - f.z) < 220);
        }
        if (want) wanted.push([d, group]);
      }
      // (The nearest first: they're built in the order asked for.)
      wanted.sort((a, b) => a[0] - b[0]);
      for (const [, group] of wanted) {
        waiting.delete(group);
        populate(group);
      }
    },

    dispose(group) {
      if (waiting.delete(group)) return; // (never built)
      // Geometry belongs to the cave system's cache; just let it know we're done.
      group.userData.disposed = true;
      if (group.userData.shoal) shoals.delete(group.userData.shoal);
      for (const f of group.userData.flocks ?? []) roostFlocks.delete(f);
      if (group.userData.vineSet) vineSets.delete(group.userData.vineSet);
      if (group.userData.steam) steams.delete(group.userData.steam);
      if (group.userData.smoke) steams.delete(group.userData.smoke);
      if (group.userData.shroomSet) shroomSets.delete(group.userData.shroomSet);
      if (group.userData.glowSet) glowSets.delete(group.userData.glowSet);
      group.traverse((m) => (details.delete(m), rocks.delete(m)));
      const [cx, cz] = group.userData.chunk;
      for (const mesh of group.children) if (mesh.isInstancedMesh) mesh.dispose();
      layer.onGone?.(cx, cz);
      group.userData.caves.release(cx, cz);
    },
  };

  // Asks for a chunk's caves (built on a background worker) and adds them when they arrive.
  function populate(group) {
      const [cx, cz] = group.userData.chunk;
      const caves = group.userData.caves, size = config.chunkSize;
      const entry = caves.chunk(cx, cz, true);
      caves.whenReady(entry, (data) => {
        if (group.userData.disposed) return;
        if (data.rock) {
          const rock = new Mesh(data.rock, material);
          rock.name = 'cave rock';
          rock.castShadow = false; // (underground: the land over it already shades it from the sun)
          rock.receiveShadow = true;
          rock.userData.solid = true; // torches can be placed on it
          // (Further off than the chunks round you, the plainer rock: see updateCaveLife.)
          rock.userData.near = data.rock;
          rock.userData.far = data.rockFar ?? data.rock;
          rocks.add(rock);
          ringWait = 0;
          group.add(rock);
        }
        if (data.features?.length) {
          for (const mesh of finds(data.features, cx * size, cz * size)) group.add(detail(mesh));
          // (A few bats out and about under each roost.)
          for (let k = 0; k < data.features.length; k += 6) {
            if (data.features[k] !== 12) continue;
            const n = 4 + (k % 5), fx = data.features[k + 1], fy = data.features[k + 2], fz = data.features[k + 3];
            const bats = Array.from({ length: n }, (_, j) => ({ r: 1.5 + ((j * 7 + k) % 5) * 0.8, drop: 1.2 + (j % 3) * 0.7, squash: 0.5 + (j % 4) * 0.15, speed: (j % 2 ? 1 : -1) * (1.6 + (j % 3) * 0.5), phase: j * 2.1 + k }));
            const mesh = new InstancedMesh(batGeometry, batMaterial, n);
            mesh.name = 'cave bats flying';
            // (Its bounds: round where they wheel under the roost.)
            mesh.boundingSphere = new Sphere(new Vector3(fx - cx * size, fy - 1.5, fz - cz * size), 7);
            group.add(detail(mesh));
            const flock = { mesh, bats, x: fx, y: fy, z: fz, x0: cx * size, z0: cz * size };
            roostFlocks.add(flock);
            (group.userData.flocks ??= []).push(flock);
          }
          layer.onFinds?.(cx, cz, data.features, group);
          for (const m of group.children) if (m.userData.caveDetail) detail(m); // (the ore and the rest, to pick up)
        }
        // The water lying in the dark, its fish; the lava.
        if (data.water) {
          const w = new Mesh(data.water, water);
          w.name = 'cave water';
          w.renderOrder = 2;
          group.add(detail(w));
          const sh = shoal(data.water, cx * size, cz * size, cx * 31 + cz);
          if (sh) {
            group.add(detail(sh.mesh));
            if (sh.newtMesh) group.add(detail(sh.newtMesh));
            shoals.add(sh);
            group.userData.shoal = sh;
          }
        }
        if (data.lava) {
          const l = new Mesh(data.lava, lava);
          l.name = 'cave lava';
          group.add(detail(l));
        }
        if (data.deco) {
          const stones = new Mesh(data.deco, material);
          stones.name = 'cave stalagmites';
          stones.castShadow = false;
          stones.receiveShadow = true;
          stones.userData.solid = true;
          group.add(detail(stones));
        }
        if (data.plants) {
          // (Ferns and moss: you walk through them, and nothing stops on them.)
          const plants = new Mesh(data.plants, material);
          plants.name = 'cave plants';
          plants.receiveShadow = true;
          group.add(detail(plants));
        }
        if (data.giants?.length) {
          // The giant mushrooms: one instanced mesh to each kind and cap colour in the chunk.
          const byKey = new Map(), list = [];
          for (let k = 0, i = 0; k < data.giants.length; k += 5, i++) {
            const s0 = data.giants[k + 4], shroom = shroomOf(s0);
            const key = `${shroom.kind}:${shroom.capIndex}`;
            if (!byKey.has(key)) byKey.set(key, []);
            const g = { x: data.giants[k], y: data.giants[k + 1], z: data.giants[k + 2], height: data.giants[k + 3], s: s0, kind: shroom.kind, ratio: shroom.ratio, turn: (s0 * 7.3) % (Math.PI * 2), key: `${cx},${cz},${i}`, i: list.length };
            g.cut = shroomsCut.has(g.key);
            byKey.get(key).push(g);
            list.push(g);
          }
          for (const [key, gs] of byKey) {
            const [kind, capIndex] = key.split(':').map(Number);
            const mesh = new InstancedMesh(shroomGeometry(kind, capIndex), material, gs.length);
            mesh.name = 'cave giant mushrooms';
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            gs.forEach((g, n) => {
              g.mesh = mesh;
              g.index = n;
              if (g.cut) mesh.setMatrixAt(n, dm.makeScale(0, 0, 0));
              else mesh.setMatrixAt(n, dm.compose(dp.set(g.x - cx * size, g.y - 0.3, g.z - cz * size), dq.setFromAxisAngle(UPV, g.turn), ds.setScalar(g.height)));
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            group.add(detail(mesh));
          }
          // (Those cut down in an earlier visit: out of the way.)
          for (const g of list) if (g.cut) caves.clearObstacle?.(g.x, g.z);
          const set = { list, cx: (cx + 0.5) * size, cz: (cz + 0.5) * size, material, caves };
          shroomSets.add(set);
          group.userData.shroomSet = set;
        }
        if (data.geysers?.length) {
          const vents = [];
          for (let k = 0; k < data.geysers.length; k += 4) vents.push({ x: data.geysers[k], y: data.geysers[k + 1], z: data.geysers[k + 2], s: data.geysers[k + 3], phase: (k * 0.37) % 1 * 6 });
          const mesh = new InstancedMesh(steamGeometry, steamMaterial, vents.length * PUFFS);
          mesh.name = 'cave steam';
          // (Its bounds: up the columns of steam over the vents.)
          mesh.boundingSphere = boundsOf(vents.flatMap((v) => [v.x - cx * size, v.y, v.z - cz * size, v.x - cx * size, v.y + 7 * v.s, v.z - cz * size]), 4);
          mesh.renderOrder = 3;
          group.add(detail(mesh));
          const st = { vents, mesh, x0: cx * size, z0: cz * size, cx: (cx + 0.5) * size, cz: (cz + 0.5) * size };
          steams.add(st);
          group.userData.steam = st;
        }
        if (data.vines?.length) {
          const counts = [0, 0, 0, 0], list = [];
          for (let k = 0; k < data.vines.length; k += 7) {
            const kind = data.vines[k + 4];
            list.push({ x: data.vines[k], top: data.vines[k + 1], z: data.vines[k + 2], len: data.vines[k + 3], kind, width: data.vines[k + 5], turn: data.vines[k + 6], index: counts[kind]++, sx: 0, sz: 0 });
          }
          const set = { vines: list, meshes: [], x0: cx * size, z0: cz * size, cx: (cx + 0.5) * size, cz: (cz + 0.5) * size };
          set.meshes = counts.map((n, kind) => {
            if (!n) return null;
            const mesh = new InstancedMesh(vineShapes[kind], material, n);
            mesh.name = 'cave vines';
            group.add(detail(mesh));
            return mesh;
          });
          for (const v of list) placeVine(set, v);
          for (const m of set.meshes) m?.computeBoundingSphere();
          vineSets.add(set);
          group.userData.vineSet = set;
        }
        {
          const list = [];
          const f = data.features ?? [];
          for (let k = 0; k < f.length; k += 6) {
            if (f[k] === 2) list.push({ x: f[k + 1], y: f[k + 2] + 0.6, z: f[k + 3], strength: 11, reach: 18, colour: 0x7fd8ff, steady: true });
            else if (f[k] === 3) list.push({ x: f[k + 1], y: f[k + 2] + 0.4, z: f[k + 3], strength: 9, reach: 15, colour: 0x7affc8, steady: true });
          }
          const li = data.lights ?? [];
          for (let k = 0; k < li.length; k += 4) {
            if (li[k + 3] === 0) list.push({ x: li[k], y: li[k + 1], z: li[k + 2], strength: 12, reach: 24, colour: 0x7ae8e0, steady: true });
            else if (li[k + 3] === 2) list.push({ x: li[k], y: li[k + 1], z: li[k + 2], strength: 16, reach: 28, colour: 0xb69aff, steady: true }); // (a crystal cluster)
            else if (li[k + 3] === 3) list.push({ x: li[k], y: li[k + 1], z: li[k + 2], strength: 18, reach: 32, colour: 0x6ae0d0, steady: true }); // (a glowing mushroom cap)
            else list.push({ x: li[k], y: li[k + 1], z: li[k + 2], strength: 12, reach: 20, colour: 0x8affc8, steady: true });
          }
          const v = data.vines ?? [];
          for (let k = 0; k < v.length; k += 7) if (v[k + 4] === 3) list.push({ x: v[k], y: v[k + 1] - v[k + 3] * 0.6, z: v[k + 2], strength: 5, reach: 11, colour: 0xf0c060, steady: true });
          // (Lava: a light every so often over it, deep orange.)
          const lp = data.lava?.attributes.position;
          // (A lava lake: a light over every 12 m or so of it, strong and far-reaching.)
          if (lp) {
            const cells = new Map();
            for (let k = 0; k < lp.count; k++) {
              const x = lp.getX(k) + cx * size, z = lp.getZ(k) + cz * size, key = `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
              const c = cells.get(key);
              if (c) (c.x += x), (c.y += lp.getY(k)), (c.z += z), c.n++;
              else cells.set(key, { x, y: lp.getY(k), z, n: 1 });
            }
            for (const c of cells.values()) list.push({ x: c.x / c.n, y: c.y / c.n + 2.5, z: c.z / c.n, strength: 24, reach: 32, colour: 0xff6420, lava: true });
            // Smoke rising off it, here and there over the lake.
            const vents = [];
            let k = 0;
            for (const c of cells.values()) if (k++ % 2 === 0 && vents.length < 20) vents.push({ x: c.x / c.n, y: c.y / c.n + 0.3, z: c.z / c.n, s: 1.7, phase: (k * 0.61) % 1 * 6 });
            if (vents.length) {
              const mesh = new InstancedMesh(steamGeometry, smokeMaterial, vents.length * PUFFS);
              mesh.name = 'cave lava smoke';
              mesh.boundingSphere = boundsOf(vents.flatMap((v) => [v.x - cx * size, v.y, v.z - cz * size, v.x - cx * size, v.y + 13, v.z - cz * size]), 6);
              mesh.renderOrder = 3;
              group.add(detail(mesh));
              const st = { vents, mesh, x0: cx * size, z0: cz * size, cx: (cx + 0.5) * size, cz: (cz + 0.5) * size };
              steams.add(st);
              group.userData.smoke = st;
            }
          }
          if (list.length) {
            const gs = { list, cx: (cx + 0.5) * size, cz: (cz + 0.5) * size };
            glowSets.add(gs);
            group.userData.glowSet = gs;
          }
        }
      });
  }
  return layer;
}
