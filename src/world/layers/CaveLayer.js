import { BoxGeometry, BufferAttribute, Color, DoubleSide, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, ShaderChunk, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bonesModel } from '../../survival/models.js';

/**
 * Cave material: vertex-coloured rock whose *daylight* (sun, moon and sky
 * ambient) is scaled by the per-vertex `skyLight` value, so caves get
 * darker the further you are from an entrance. Point lights (torches) are
 * left untouched, so a torch lights a deep cave just as brightly as the mouth.
 */
/** Night vision (testing): 1 lifts the cave darkening completely. */
export const caveNightVision = { value: 0 };
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
const details = new Set();
let inside = false;
const detail = (mesh) => {
  details.add(mesh);
  mesh.visible = inside;
  return mesh;
};

// The vines hanging in the lush caves: four kinds, each a unit length
// (hanging from y = 0 down to y = -1), scaled to its length. Drawn with the
// cave rock's own material, so lit (and glowing) the same way.
function vineGeometry(kind) {
  const parts = [];
  const add = (g, colour, glow = [0.03, 0.09, 0.04]) => {
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

/** Swims the cave fish and flies the bats (call every frame); `eye`: where you are, if underground. */
export function updateCaveLife(time, eye = null) {
  caveTime.value = time;
  if (!!eye !== inside) {
    inside = !!eye;
    for (const m of details) m.visible = inside;
  }
  if (!inside) return;
  // Vines: pushed aside where you walk through them, swinging back after.
  for (const set of vineSets) {
    if (Math.abs(eye.x - set.cx) > 110 || Math.abs(eye.z - set.cz) > 110) continue;
    for (const v of set.vines) {
      const dx = v.x - eye.x, dz = v.z - eye.z;
      const close = Math.abs(dx) < 2.5 && Math.abs(dz) < 2.5 && eye.y > v.top - v.len - 0.2 && eye.y - 1.7 < v.top;
      if (!close && !v.moving) continue;
      const dt = Math.min(0.05, time - (v.t ?? time));
      v.t = time;
      let tx = 0, tz = 0;
      if (close) {
        const d = Math.hypot(dx, dz), reach = 0.7 + v.width * 0.25;
        if (d < reach) {
          const push = ((reach - d) / reach) * 1.1, u = d > 1e-3 ? 1 / d : 0;
          // (Its foot swung away from you, as far as you're into it, along the bit you're touching.)
          const along = Math.min(1, Math.max(0.2, (v.top - (eye.y - 0.8)) / v.len));
          (tx = dx * u * push / along), (tz = dz * u * push / along);
        }
      }
      // A spring, damped: out to where you push it, and back.
      v.vx = (v.vx ?? 0) + ((tx - v.sx) * 30 - v.vx * 4) * dt;
      v.vz = (v.vz ?? 0) + ((tz - v.sz) * 30 - v.vz * 4) * dt;
      v.sx += v.vx * dt;
      v.sz += v.vz * dt;
      v.moving = Math.abs(v.sx) + Math.abs(v.sz) + Math.abs(v.vx) + Math.abs(v.vz) > 0.003 || close;
      if (!v.moving) (v.sx = 0), (v.sz = 0), (v.vx = 0), (v.vz = 0), (v.t = undefined);
      placeVine(set, v);
    }
  }
  for (const flock of roostFlocks) {
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
    shoal.fish.forEach((f, k) => {
      const a = time * f.speed + f.phase;
      fp.set(f.x + Math.cos(a) * f.r - shoal.x0, f.y, f.z + Math.sin(a) * f.r - shoal.z0);
      fq.setFromAxisAngle(fUp, -a + (f.speed > 0 ? Math.PI : 0));
      shoal.mesh.setMatrixAt(k, fm.compose(fp, fq, fs));
    });
    shoal.mesh.instanceMatrix.needsUpdate = true;
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
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
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
    const mesh = new InstancedMesh(fishGeometry, fishMaterial, fish.length);
    mesh.name = 'cave fish';
    mesh.frustumCulled = false;
    return { mesh, fish, x0, z0 };
  };

  const layer = {
    name: 'caves',
    material,
    onFinds: null, // (cx, cz, features, group): the iron ore, to pick up (see GroundItems.addCave)
    onGone: null,

    reuseKey: ({ lod }) => (lod > config.caveMaxLod ? 'none' : 'caves'),

    build({ cx, cz, lod, generator }) {
      if (lod > config.caveMaxLod || !generator.caves) return null;
      const caves = generator.caves;
      const entry = caves.chunk(cx, cz, true);
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
      // Caves are built on a background worker; add them when they arrive.
      caves.whenReady(entry, (data) => {
        if (group.userData.disposed) return;
        if (data.rock) {
          const rock = new Mesh(data.rock, material);
          rock.name = 'cave rock';
          rock.castShadow = false; // (underground: the land over it already shades it from the sun)
          rock.receiveShadow = true;
          rock.userData.solid = true; // torches can be placed on it
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
            mesh.frustumCulled = false;
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
      });
      return group;
    },

    dispose(group) {
      // Geometry belongs to the cave system's cache; just let it know we're done.
      group.userData.disposed = true;
      if (group.userData.shoal) shoals.delete(group.userData.shoal);
      for (const f of group.userData.flocks ?? []) roostFlocks.delete(f);
      if (group.userData.vineSet) vineSets.delete(group.userData.vineSet);
      group.traverse((m) => details.delete(m));
      const [cx, cz] = group.userData.chunk;
      for (const mesh of group.children) if (mesh.isInstancedMesh) mesh.dispose();
      layer.onGone?.(cx, cz);
      group.userData.caves.release(cx, cz);
    },
  };
  return layer;
}
