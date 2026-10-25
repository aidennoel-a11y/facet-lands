import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { hash2, hashSeed } from '../noise/random.js';

const MAX = 400;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

/**
 * A low-poly fish a metre long (scaled down), nose to +z: a tapering body
 * of rings (deep at the shoulders, slim at the wrist of the tail), dark on
 * the back and pale underneath, its eye; a forked tail, a dorsal fin, the
 * pectoral and anal fins. (`aBody`: how far back along it each vertex is,
 * 0 at the nose to 1 at the tail's tip, for the swimming bend: see fishMaterial.)
 */
function fishGeometry() {
  const pos = [], col = [], body = [];
  const DARK = [0.2, 0.25, 0.23], MID = [0.55, 0.58, 0.54], PALE = [0.88, 0.88, 0.82], FIN = [0.42, 0.44, 0.4], EYE = [0.04, 0.04, 0.04];
  // (z along it, half-height, half-width, how far up the middle of the flank is.)
  const RINGS = [[0.5, 0.0, 0.0], [0.44, 0.06, 0.04], [0.33, 0.12, 0.075], [0.16, 0.16, 0.09], [-0.02, 0.15, 0.085], [-0.18, 0.11, 0.06], [-0.3, 0.06, 0.035], [-0.36, 0.035, 0.02]];
  const SIDES = 8;
  const ring = RINGS.map(([z, h, w]) => Array.from({ length: SIDES }, (_, k) => {
    const a = (k / SIDES) * Math.PI * 2;
    return [Math.sin(a) * w, Math.cos(a) * h, z];
  }));
  const shade = (v) => (v[1] > 0.03 ? DARK : v[1] < -0.03 ? PALE : MID);
  const tri = (a, b, c, colour = null) => {
    for (const v of [a, b, c]) {
      pos.push(...v);
      col.push(...(colour ?? shade(v)));
      body.push(Math.min(1, Math.max(0, (0.5 - v[2]) / 1.05)));
    }
  };
  for (let r = 0; r < RINGS.length - 1; r++) {
    for (let k = 0; k < SIDES; k++) {
      const a = ring[r][k], b = ring[r][(k + 1) % SIDES], c = ring[r + 1][k], d = ring[r + 1][(k + 1) % SIDES];
      if (r === 0) tri(a, d, c);
      else (tri(a, b, d), tri(a, d, c));
    }
  }
  // The eye: a dark fleck each side, just behind the snout.
  for (const sx of [-1, 1]) {
    const e0 = [sx * 0.062, 0.035, 0.38], e1 = [sx * 0.064, 0.06, 0.35], e2 = [sx * 0.064, 0.02, 0.34];
    sx > 0 ? tri(e0, e1, e2, EYE) : tri(e0, e2, e1, EYE);
  }
  // The tail: forked, two lobes.
  const wrist = [0, 0, -0.35];
  tri(wrist, [0, 0.17, -0.58], [0, 0.02, -0.47], FIN);
  tri(wrist, [0, -0.02, -0.47], [0, -0.15, -0.58], FIN);
  // The dorsal fin, along the back; the anal fin under the tail's root.
  tri([0, 0.15, 0.12], [0, 0.26, -0.02], [0, 0.13, -0.12], FIN);
  tri([0, -0.1, -0.12], [0, -0.17, -0.22], [0, -0.07, -0.26], FIN);
  // The pectoral fins, out from behind the gills.
  for (const sx of [-1, 1]) tri([sx * 0.07, -0.06, 0.22], [sx * 0.17, -0.11, 0.1], [sx * 0.07, -0.08, 0.12], FIN);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aBody', new BufferAttribute(new Float32Array(body), 1));
  g.computeVertexNormals();
  return g;
}

/**
 * Fish swim by bending: a wave running down the body, little at the head,
 * most at the tail (`aSwim`: phase, beats a second, how hard; and which
 * kind it is, for its markings: the trout's spots, the bass's dark bars,
 * the perch's stripes, the carp's gold scales, a salmon's red).
 */
function fishMaterial(hook) {
  const m = hook(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
  const previous = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    previous?.call(m, shader, renderer);
    shader.uniforms.uFishTime = fishTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBody;\nattribute vec4 aSwim;\nuniform float uFishTime;\nvarying vec3 vFishLocal;\nvarying float vFishKind;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vFishLocal = position;
        vFishKind = aSwim.w;
        {
          float wave = sin(uFishTime * aSwim.y * 6.2832 + aSwim.x - aBody * 4.0);
          transformed.x += wave * aSwim.z * (0.015 + aBody * aBody * 0.13);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFishLocal;\nvarying float vFishKind;\nfloat fishHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec3 l = vFishLocal;
          float flank = smoothstep(0.12, 0.0, abs(l.y)) ;
          int k = int(vFishKind + 0.5);
          if (k == 1) { // trout: black spots over the back and flanks, a rosy band
            float spot = step(0.86, fishHash(floor(l * vec3(40.0, 40.0, 32.0))));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.25, spot * step(-0.02, l.y));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.42, 0.42), flank * 0.35);
          } else if (k == 2) { // bass: dark bars down the flanks
            float bar = smoothstep(0.55, 0.85, sin(l.z * 48.0 + fishHash(floor(l.zzz * 6.0)) * 2.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, bar * step(-0.04, l.y) * 0.8);
          } else if (k == 3) { // perch: dark stripes, red-orange fins
            float stripe = step(0.5, sin(l.z * 70.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.4, stripe * step(-0.02, l.y) * 0.75);
            if (abs(l.x) < 0.005 && (l.y > 0.15 || l.y < -0.08)) diffuseColor.rgb = vec3(0.85, 0.35, 0.12);
          } else if (k == 4) { // carp: gold, big scales
            float scale = step(0.5, fract(l.z * 22.0 + step(0.5, fract(l.y * 22.0)) * 0.5));
            diffuseColor.rgb *= 0.9 + 0.2 * scale;
          } else if (k == 5) { // salmon in the run: red flanks, dark green head
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.16, 0.12), flank * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.16), smoothstep(0.3, 0.38, l.z) * 0.8);
          } else if (k == 6) { // the sea's: silver, glinting
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.88, 0.92), flank * 0.6);
          } else if (k == 7) { // a shark: slate grey over, white under, darker fin tips
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.92, 0.9), smoothstep(-0.01, -0.06, l.y));
            if (l.y > 0.2 || l.z < -0.5) diffuseColor.rgb *= 0.6;
          } else if (k == 8) { // a reef fish: bright, with dark bands across it
            float band = step(0.72, sin(l.z * 26.0 + 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.08, 0.12), band * 0.85);
            diffuseColor.rgb *= 1.15;
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => 'fish-swim';
  return m;
}
const fishTime = { value: 0 };
const pick = (list, h) => {
  const [tint, kind] = list[Math.floor(h * list.length) % list.length];
  return { tint, kind };
};

// Their colours: trout, char, bass; and salmon, red for the run in autumn;
// and silvery fish of the sea. (Each with its kind, for its markings: see fishMaterial.)
const RIVER_KINDS = [[0x9aa888, 1], [0x8c9a7c, 1], [0x7f8f6a, 3]];
const POND_KINDS = [[0x7a8c5a, 2], [0xc8a040, 4], [0x8a9a6a, 3]];
const SALMON = 0xc0584a;
const SEA_KINDS = [[0xb8c8d8, 6], [0x9fb4c8, 6], [0xc8c0a8, 6]];
// Over the coral: bright reef fish, banded (yellow, blue, orange, green-gold).
const REEF_KINDS = [[0xf0d040, 8], [0x3a8ad8, 8], [0xf08a30, 8], [0x8ad060, 8], [0xe86aa0, 8]];
const ANTHIAS = 0xf06a30;
// Out in the deep water: big fish cruising alone, a tuna, a grouper, a shark now and then.
const BIG_KINDS = [[0x8a9cb8, 6, 1.2, 1.9], [0x6a5a40, 2, 1.0, 1.6], [0x7c8890, 7, 1.9, 3.0]];

const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(0, 0, 0, 'YXZ'), p = new Vector3(), s = new Vector3(), tint = new Color();

/**
 * Fish, in the water round you: trout holding in the rivers facing
 * upstream, darting now and then; shoals turning slowly together in the
 * lakes and the shallow sea (seen through the clear water); one leaping
 * clear of the water now and then with a splash; and in summer and autumn
 * salmon leaping at the waterfalls, trying to get up them.
 *
 * Each has its own place in the world (picked by the world's seed, so
 * it's always there), and what it does is worked out from the clock: so
 * online, by the room's shared clock, everyone sees the same fish doing
 * the same thing (ctx.netTime).
 */
export class Fish {
  constructor(scene, materialHook = (m) => m) {
    const geometry = fishGeometry();
    this.swim = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(DynamicDrawUsage);
    geometry.setAttribute('aSwim', this.swim);
    this.mesh = new InstancedMesh(geometry, fishMaterial(materialHook), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, new Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'fish';
    scene.add(this.mesh);
    this.cells = new Map(); // where the fish are, cell by cell (see #cell): worked out once
    this.leaping = new Set(); // (those in the air last frame: a splash as they go in and come out)
    this.falls = [];
    this.wait = 0;
    this.time = 0;
    this.list = []; // (this frame's fish, drawn: { x, y, z, heading, pitch, size, tint, kind, leap })
    this.caught = new Map(); // id -> when: a fish speared or landed, gone from its water a long while
    this.spooked = new Map(); // id -> { at, dx, dz }: a fish (or a shoal) put to flight by someone close (see #spook)
  }

  clear() {
    this.cells.clear();
    this.leaping.clear();
    this.spooked.clear();
  }

  // A number 0..1 fixed by the world's seed for (i, j) and `salt`.
  #h(i, j, salt) {
    return hash2(i, j, (this.seed ^ salt) | 0);
  }

  // What lives in a cell of the water, worked out the first time it's
  // needed: a trout holding in a river (kind 'r'), a shoal in a lake or
  // the shallow sea ('s'), or nothing.
  #cell(kind, i, j, size, ctx) {
    const key = `${kind}${i},${j}`;
    const c = this.cells.get(key);
    // (Nothing there is looked at again now and then: the water may not have been worked out yet.)
    if (c && (c.v || this.time - c.at < 20)) return c.v;
    // (Only so many squares worked out a frame: flying fast over new water, the rest wait a frame or two.)
    if (this.cellBudget-- <= 0) return c?.v ?? null;
    let found = null;
    let x = (i + 0.15 + 0.7 * this.#h(i, j, 0xf151)) * size, z = (j + 0.15 + 0.7 * this.#h(i, j, 0xf152)) * size;
    let w = ctx.waterAt(x, z), bed = ctx.ground(x, z);
    if (!Number.isFinite(bed)) return null; // (the land's not there yet: later)
    const river = (w, bed) => w && w.speed > 0 && w.level - bed > 0.45;
    if (kind === 'r' && this.#h(i, j, 0xf153) < 0.55) {
      // (Looked for over the cell, a couple of metres apart: a creek's only a few metres across.)
      const o = Math.floor(this.#h(i, j, 0xf15b) * 16);
      for (let t = 0; t < 16 && !river(w, bed); t++) {
        const c = (t + o) % 16;
        x = (i + ((c % 4) + 0.5) / 4) * size;
        z = (j + (Math.floor(c / 4) + 0.5) / 4) * size;
        w = ctx.waterAt(x, z);
        bed = ctx.ground(x, z);
      }
      if (river(w, bed)) {
        const up = Math.atan2(-(w.fx ?? 0), -(w.fz ?? 0));
        found = { x, z, y: Math.max(bed + 0.15, w.level - 0.35), level: w.level, up, size: 0.36 + 0.26 * this.#h(i, j, 0xf154), ...pick(RIVER_KINDS, this.#h(i, j, 0xf155)) };
        // (It darts up into the current: so long as that's still water.)
        found.dart = ctx.waterAt(x + Math.sin(up) * 1.3, z + Math.cos(up) * 1.3) ? 1.25 : 0;
      }
    } else if (kind === 's' && this.#h(i, j, 0xf156) < (w?.lake ? 0.55 : 0.4) && w && !(w.speed > 0) && w.level - bed > 1.5 && w.level - bed < (w.lake ? 30 : 12)) {
      // (A shoal wanders round its patch of water, five metres or so each way: so it must all be deep enough.)
      let deep = true;
      for (let k = 0; k < 8 && deep; k++) {
        const px = x + Math.sin((k / 8) * TAU) * 7, pz = z + Math.cos((k / 8) * TAU) * 7;
        const pw = ctx.waterAt(px, pz), pg = ctx.ground(px, pz);
        deep = !!pw && pw.level - pg > 1.2;
      }
      if (deep) {
        const depth = w.level - bed, sea = !!w.lake, reef = sea && (ctx.generator?.getReef?.(x, z, bed) ?? 0) > 0.15;
        found = {
          wander: 1, small: 1,
          x, z, level: w.level, y: reef ? bed + Math.min(1.4, depth * 0.4) : w.level - Math.min(depth * (sea ? 0.5 : 0.4), sea ? 8 : 1.4) - 0.3, n: (reef ? 10 : 8) + Math.floor(this.#h(i, j, 0xf157) * 8),
          ...pick(reef ? REEF_KINDS : sea ? SEA_KINDS : RIVER_KINDS, this.#h(i, j, 0xf158)), speed: 0.6 + 0.6 * this.#h(i, j, 0xf159), phase: this.#h(i, j, 0xf15a) * TAU,
        };
        if (reef && this.#h(i, j, 0xf15c) < 0.6) {
          // A cloud of anthias: dozens of little orange fish hanging over the
          // coral, hardly wandering from it.
          Object.assign(found, { tint: ANTHIAS, kind: 6, n: 30 + Math.floor(this.#h(i, j, 0xf15d) * 16), y: bed + Math.min(1.1, depth * 0.35), wander: 0.35, small: 0.45, speed: 0.4 });
        }
      }
    }
    if (kind === 'b' && this.#h(i, j, 0xf180) < 0.5 && w?.lake && w.level - bed > 6) {
      // A big fish of the open sea: round a wide loop of its own, deep down.
      const depth = w.level - bed, [tint, kk, s0, s1] = BIG_KINDS[this.#h(i, j, 0xf181) < 0.22 ? 2 : this.#h(i, j, 0xf182) < 0.6 ? 0 : 1];
      found = { x, z, level: w.level, y: w.level - Math.min(depth * 0.55, 14), tint, kind: kk, size: s0 + (s1 - s0) * this.#h(i, j, 0xf183), r: 7 + 9 * this.#h(i, j, 0xf184), speed: 0.35 + 0.3 * this.#h(i, j, 0xf185), phase: this.#h(i, j, 0xf186) * TAU };
    }
    if (kind === 'p' && this.#h(i, j, 0xf170) < 0.45 && w && !(w.speed > 0) && w.level - bed > 0.55) {
      // A pond's fish: a bass or a sunfish, a carp, cruising slowly round the shallows near the top.
      const depth = w.level - bed;
      found = { x, z, level: w.level, y: w.level - Math.min(depth * 0.5, 0.6) - 0.12, size: 0.22 + 0.16 * this.#h(i, j, 0xf171), ...pick(POND_KINDS, this.#h(i, j, 0xf172)), speed: 0.25 + 0.3 * this.#h(i, j, 0xf173), phase: this.#h(i, j, 0xf174) * TAU, r: Math.min(3, 0.8 + depth) };
    }
    this.cells.set(key, { v: found, at: this.time });
    return found;
  }

  /** A fish caught (speared, or landed on a line): gone, and the rest of its shoal off in a fright. */
  take(f) {
    this.caught.set(f.id, this.time);
    // (Online: gone for everyone, for the same quarter of an hour by the room's clock: see WorldSync's 'taken'.)
    if (this.netTime !== undefined && this.shared) this.shared.add(`fish:${f.id}:${Math.floor(this.netTime / 900)}`);
    this.sim?.delete(f.id);
    const T = this.lastT ?? this.time, shoal = f.id[0] === 's' ? f.id.split(',').slice(0, 2).join(',') : null;
    if (shoal) this.spooked.set(shoal, { at: T, dx: Math.sin(f.heading ?? 0), dz: Math.cos(f.heading ?? 0) });
  }

  // Someone close by, or in the water by it: the fish (or the shoal) darts
  // off away from them, deeper, and keeps clear a while before it comes
  // back to its place. (Not shared online: each sees their own.)
  #spook(id, f, people, T) {
    const was = this.spooked.get(id);
    if (was && T - was.at < 12) return was;
    // (Some fish are bold, and let a diver come almost up to them; most
    // aren't. Each its own way, the same each time.)
    let hsh = 0;
    for (let k = 0; k < id.length; k++) hsh = (hsh * 31 + id.charCodeAt(k)) | 0;
    const bold = ((hsh >>> 0) % 100) / 100 < 0.3;
    for (const q of people) {
      let d = Math.hypot(f.x - q.x, f.z - q.z), close = q.inWater ? 7 : q.moving ? 4.5 : 3;
      if (q.under) {
        // Swimming down among them: how near in all three ways, nearer
        // still if you come at them fast.
        d = Math.hypot(d, (f.y ?? f.level - 1) - q.eye);
        close = (bold ? 1.6 : 5) + (q.moving ? (bold ? 0.6 : 2) : 0);
      } else if (Math.abs(q.y - f.level) >= 4) continue;
      if (d < close) {
        const v = { at: T, dx: (f.x - q.x) / (Math.hypot(f.x - q.x, f.z - q.z) || 1), dz: (f.z - q.z) / (Math.hypot(f.x - q.x, f.z - q.z) || 1) };
        this.spooked.set(id, v);
        return v;
      }
    }
    if (was && T - was.at >= 12) this.spooked.delete(id);
    return null;
  }

  /**
   * @param ctx  { camera, generator, ground(x, z), waterAt(x, z), traces, sound, pan(x, z),
   *              day, winter, autumn, summer, sheltered, seed, netTime, people }
   */
  update(dt, ctx) {
    this.time += dt;
    this.cellBudget = 14;
    this.seed = ctx.seed | 0;
    const T = ctx.netTime ?? this.time; // (online, the room's clock)
    fishTime.value = T;
    this.lastT = T;
    const cam = ctx.camera.position;
    this.mesh.visible = !ctx.sheltered;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 1;
      this.#findFalls(ctx);
      if (this.cells.size > 4000) this.cells.clear(); // (forgetting the water far behind)
    }
    // Who's about, to put them to flight: you (wading in, or moving along the bank), and the others online.
    const moved = this.lastCam ? Math.hypot(cam.x - this.lastCam.x, cam.z - this.lastCam.z) / Math.max(dt, 1e-3) : 0;
    this.lastCam = { x: cam.x, z: cam.z };
    const here = ctx.waterAt(cam.x, cam.z);
    const people = [{ x: cam.x, y: cam.y - 1.6, z: cam.z, eye: cam.y, moving: moved > 1.2, inWater: !!here && cam.y - 1.6 < here.level + 0.1, under: !!here && cam.y < here.level - 0.3 }];
    for (const o of ctx.people ?? []) people.push({ x: o.x, y: o.y ?? cam.y, z: o.z, moving: true, inWater: false });
    const list = (this.list = []);
    const high = cam.y - ctx.ground(cam.x, cam.z) > 120; // (not from high up)
    const fled = (id, f) => {
      const sp = this.#spook(id, f, people, T);
      if (!sp) return 0;
      const u = T - sp.at;
      return { u, away: Math.min(6, u * 8) * (1 - smoothstep(6, 12, u)), dx: sp.dx, dz: sp.dz };
    };
    if (!high) {
      // River fish, holding in the stream facing up it, swaying with the
      // current; darting up it now and then and drifting back; now and
      // then rising to take a fly off the top. (Cells of 8 m out to 60 m.)
      const R = 8, ci = Math.floor(cam.x / R), cj = Math.floor(cam.z / R);
      for (let j = cj - 8; j <= cj + 8; j++) {
        for (let i = ci - 8; i <= ci + 8; i++) {
          const f = this.#cell('r', i, j, R, ctx);
          if (!f || Math.hypot(f.x - cam.x, f.z - cam.z) > 60) continue;
          const id = `r${i},${j}`;
          const P = 4 + 7 * this.#h(i, j, 0xf160), off = this.#h(i, j, 0xf161) * P;
          const sIn = (T + off) % P;
          const along = f.dart * (sIn < 0.5 ? sIn / 0.5 : 1 - (sIn - 0.5) / (P - 0.5));
          const sway = Math.sin(T * 0.7 + off) * 0.25;
          const fish = { id, ax: f.x, az: f.z, x: f.x + Math.sin(f.up) * along + Math.cos(f.up) * sway, y: f.y, z: f.z + Math.cos(f.up) * along - Math.sin(f.up) * sway, level: f.level, heading: f.up + Math.sin(T * 0.9 + off) * 0.12, size: f.size, tint: f.tint, kind: f.kind, beat: sIn < 0.5 ? 3.2 : 1.4, amp: sIn < 0.5 ? 1.5 : 0.8, shoal: false };
          // (Rising: up to the top in a moment, a ring where it takes the fly, and down again.)
          const RP = 35 + 50 * this.#h(i, j, 0xf165), rIn = (T + this.#h(i, j, 0xf166) * RP) % RP;
          if (rIn < 0.9) {
            const k = Math.sin((rIn / 0.9) * Math.PI);
            fish.y += (f.level - 0.06 - f.y) * k;
            fish.pitch = -0.6 * Math.cos((rIn / 0.9) * Math.PI);
            fish.rising = true;
            if (rIn >= 0.45 && rIn - dt < 0.45 && Math.hypot(f.x - cam.x, f.z - cam.z) < 30) ctx.traces?.splash(fish.x, f.level, fish.z, 3, 0.5, 0.25);
          }
          const sp = fled(id, fish);
          fish.spooked = !!sp;
          if (sp) {
            // Off like a shot, away and down; back to its place a while later.
            fish.x += sp.dx * sp.away;
            fish.z += sp.dz * sp.away;
            fish.y = Math.min(fish.y, f.y - 0.15 * (1 - smoothstep(8, 12, sp.u)));
            if (sp.u < 2.5) (fish.heading = Math.atan2(sp.dx, sp.dz)), (fish.beat = 5), (fish.amp = 1.8);
            else if (sp.u > 6) (fish.heading = Math.atan2(-sp.dx, -sp.dz)), (fish.beat = 2); // (nosing its way back to its place, not sliding backwards)
            fish.pitch = 0;
          }
          list.push(fish);
        }
      }
      // Shoals in the lakes and the shallow sea, wandering round their
      // patch, each fish weaving in and out of the rest, all turning
      // together; scattering if someone comes in among them. (Cells of 40 m
      // out to 90 m; not in winter.)
      if (!(ctx.winter > 0.6)) {
        const S = 40, si = Math.floor(cam.x / S), sj = Math.floor(cam.z / S);
        for (let j = sj - 2; j <= sj + 2; j++) {
          for (let i = si - 2; i <= si + 2; i++) {
            const sh = this.#cell('s', i, j, S, ctx);
            if (!sh || Math.hypot(sh.x - cam.x, sh.z - cam.z) > 90) continue;
            const u = T * 0.12 * sh.speed + sh.phase;
            let cx = sh.x + Math.sin(u) * 5 * sh.wander, cz = sh.z + Math.sin(u * 0.7 + 1.3) * 4 * sh.wander;
            let heading = Math.atan2(Math.cos(u) * 5, Math.cos(u * 0.7 + 1.3) * 0.7 * 4);
            const sp = fled(`s${i},${j}`, { x: cx, z: cz, y: sh.y, level: sh.level });
            let spread = 1, beat = 2.2;
            if (sp) {
              cx += sp.dx * sp.away * 1.5;
              cz += sp.dz * sp.away * 1.5;
              spread = 1 + 1.4 * (1 - smoothstep(3, 10, sp.u));
              if (sp.u < 3) (heading = Math.atan2(sp.dx, sp.dz)), (beat = 5);
              else if (sp.u > 6) heading = Math.atan2(-sp.dx, -sp.dz);
            }
            for (let k = 0; k < sh.n; k++) {
              const off = (0.4 + 1.8 * this.#h(i * 31 + k, j, 0xf162)) * spread;
              // (Each weaving its own way within the shoal.)
              const wx = Math.sin(T * 0.6 + k * 1.7) * 0.5, wz = Math.cos(T * 0.47 + k * 2.3) * 0.5;
              list.push({
                id: `s${i},${j},${k}`, ax: sh.x, az: sh.z, x: cx + Math.sin(heading + k * 2.4) * off + wx, y: sh.y + (this.#h(i, j * 17 + k, 0xf163) - 0.5) * 0.6 + Math.sin(T * 0.4 + k) * 0.12, z: cz + Math.cos(heading + k * 2.4) * off + wz,
                level: sh.level, heading: heading + Math.cos(T * 0.6 + k * 1.7) * 0.25, size: (0.22 + 0.12 * this.#h(i + k, j, 0xf164)) * sh.small, tint: sh.tint, kind: sh.kind, beat: beat * (0.9 + 0.2 * this.#h(k, j, 0xf167)), amp: 1, shoal: true, spooked: !!sp,
              });
            }
          }
        }
        // The sea's big fish: each alone, round its own wide loop, sweeping
        // its tail slowly. (Cells of 60 m out to 110 m.)
        const B = 60, bi = Math.floor(cam.x / B), bj = Math.floor(cam.z / B);
        for (let j = bj - 2; j <= bj + 2; j++) {
          for (let i = bi - 2; i <= bi + 2; i++) {
            const bf = this.#cell('b', i, j, B, ctx);
            if (!bf || Math.hypot(bf.x - cam.x, bf.z - cam.z) > 110) continue;
            const u = (T * bf.speed) / bf.r + bf.phase, id = `b${i},${j}`;
            const fish = { id, ax: bf.x, az: bf.z, x: bf.x + Math.cos(u) * bf.r, y: bf.y + Math.sin(T * 0.13 + bf.phase) * 1.2, z: bf.z + Math.sin(u) * bf.r * 0.8, level: bf.level, heading: Math.atan2(-Math.sin(u), Math.cos(u) * 0.8), size: bf.size, tint: bf.tint, kind: bf.kind, beat: 0.7, amp: 0.8, shoal: false };
            const sp = fled(id, fish);
            fish.spooked = !!sp;
            if (sp && bf.kind !== 7) (fish.x += sp.dx * sp.away * 2), (fish.z += sp.dz * sp.away * 2), (fish.beat = 4); // (a shark doesn't scare)
            list.push(fish);
          }
        }
        // A pond's own fish: one or two cruising slowly round near the top,
        // turning back at the edge. (Cells of 10 m out to 50 m.)
        const W = 10, wi = Math.floor(cam.x / W), wj = Math.floor(cam.z / W);
        for (let j = wj - 5; j <= wj + 5; j++) {
          for (let i = wi - 5; i <= wi + 5; i++) {
            const pf = this.#cell('p', i, j, W, ctx);
            if (!pf || Math.hypot(pf.x - cam.x, pf.z - cam.z) > 50) continue;
            const id = `p${i},${j}`, u = T * pf.speed / pf.r + pf.phase;
            const fish = { id, ax: pf.x, az: pf.z, x: pf.x + Math.cos(u) * pf.r, y: pf.y + Math.sin(T * 0.3 + pf.phase) * 0.08, z: pf.z + Math.sin(u) * pf.r * 0.7, level: pf.level, heading: Math.atan2(-Math.sin(u), Math.cos(u) * 0.7), size: pf.size, tint: pf.tint, kind: pf.kind, beat: 1, amp: 0.7, shoal: false };
            const sp = fled(id, fish);
            fish.spooked = !!sp;
          fish.spooked = !!sp;
            if (sp) {
              fish.x += sp.dx * Math.min(sp.away, pf.r);
              fish.z += sp.dz * Math.min(sp.away, pf.r);
              fish.y -= 0.25;
              if (sp.u < 2.5) (fish.heading = Math.atan2(sp.dx, sp.dz)), (fish.beat = 4.5), (fish.amp = 1.6);
              else if (sp.u > 6) fish.heading = Math.atan2(-sp.dx, -sp.dz);
            }
            list.push(fish);
          }
        }
      }
    }
    // Each one swims there: not set down where the clock says (which would
    // jump), but steering for it, as a real fish does: speeding up and
    // easing off, turning smoothly, moving the way it's facing; never into
    // the bank or the bed, never out on the shore (where it would go, it
    // slides along the bank, or turns away); rising and sinking gently.
    if (this.caught.size) {
      for (const [id, at] of this.caught) if (this.time - at > 900) this.caught.delete(id);
      for (let k = list.length - 1; k >= 0; k--) if (this.caught.has(list[k].id)) list.splice(k, 1);
    }
    // (Online: those the others have caught, too.)
    this.netTime = ctx.netTime ?? undefined;
    if (this.netTime !== undefined && this.shared?.size) {
      const q = Math.floor(this.netTime / 900);
      for (let k = list.length - 1; k >= 0; k--) if (this.shared.has(`fish:${list[k].id}:${q}`)) list.splice(k, 1);
    }
        this.#swim(list, dt, T, ctx, cam);
    // Salmon at the falls, in summer and autumn: one after another up the
    // fall (most don't make it: they drop back).
    const run = Math.max(ctx.summer ?? 0, ctx.autumn ?? 0);
    if (run >= 0.3) {
      for (const fall of this.falls) {
        if (Math.hypot(fall.x - cam.x, fall.z - cam.z) > 90) continue;
        const P = 3.5 / run, n0 = Math.floor(T / P);
        for (let n = n0 - 2; n <= n0; n++) {
          const r = (salt) => hash2(fall.i + n * 13, fall.j, this.seed ^ salt);
          const made = r(0x5a1) < 0.35, h = Math.min(4, fall.drop + (made ? 0.6 : -0.3)), dur = 0.45 + Math.sqrt(Math.max(0.2, h)) * 0.35;
          const k = (T - n * P) / dur;
          if (k < 0 || k >= 1) continue;
          const x0 = fall.x + (r(0x5a2) * 2 - 1) * fall.w, z0 = fall.z + (r(0x5a3) * 2 - 1) * fall.w;
          const reach = made ? 2.5 : 0.8 + r(0x5a4);
          const x1 = x0 + Math.sin(fall.up) * reach, z1 = z0 + Math.cos(fall.up) * reach;
          const y0 = fall.low - 0.3, y1 = made ? fall.high - 0.3 : fall.low - 0.3;
          list.push({
            id: `f${fall.key}:${n}`, salmon: true, x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, y: y0 + (y1 - y0) * k + Math.sin(Math.PI * k) * h, level: k < 0.5 ? fall.low : y1 + 0.3,
            heading: fall.up, pitch: -Math.cos(Math.PI * k) * 0.9, size: 0.55 + 0.25 * r(0x5a5), tint: SALMON, kind: (ctx.autumn ?? 0) > 0.3 ? 5 : 6, leap: true, beat: 6, amp: 1.8,
          });
        }
      }
    }
    // (A splash as each goes up out of the water, and as it comes down.)
    const now = new Set();
    for (const f of list) {
      if (!f.leap) continue;
      now.add(f.id);
      if (!this.leaping.has(f.id)) ctx.traces?.splash(f.x, f.level, f.z, 6, 1.6, 0.8);
    }
    for (const id of this.leaping) {
      const f = this.lastLeap?.get(id);
      if (now.has(id) || !f) continue;
      ctx.traces?.splash(f.x, f.level, f.z, 10, 2, 1.1);
      if (Math.hypot(f.x - cam.x, f.z - cam.z) < 40) ctx.sound?.call('splash', ctx.pan(f.x, f.z), 0.35);
    }
    this.leaping = now;
    this.lastLeap = new Map(list.filter((f) => f.leap).map((f) => [f.id, f]));

    // Into the instanced mesh (the swimming itself, the bend of the body, is
    // the shader's: see fishMaterial; its beat kept here, so it never jumps).
    let n = 0;
    const sw = this.swim.array;
    for (const f of list) {
      if (n >= MAX || f.hidden) continue;
      e.set(f.pitch ?? 0, f.heading, f.roll ?? 0, 'YXZ');
      q.setFromEuler(e);
      this.mesh.setMatrixAt(n, m4.compose(p.set(f.x, f.y, f.z), q, s.setScalar(f.size)));
      this.mesh.setColorAt(n, tint.set(f.tint));
      sw[n * 4] = f.phase ?? (hashSeed(f.id) % 1000) * 0.0063 + T * (f.beat ?? 1.5) * TAU;
      sw[n * 4 + 1] = 0;
      sw[n * 4 + 2] = f.amp ?? 1;
      sw[n * 4 + 3] = f.kind ?? 0;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.swim.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // Room for a fish of `size` at (x, z) at height y: water deep enough, the
  // bed (under it, and under its nose and its tail) below it. Returns the
  // lowest and highest it can be there, or null.
  #room(x, z, size, sh, ch, ctx) {
    const w = ctx.waterAt(x, z);
    if (!w) return null;
    let bed = -Infinity;
    for (const k of [0, 0.5, -0.45]) {
      const g = ctx.ground(x + sh * size * k, z + ch * size * k);
      if (!Number.isFinite(g)) return null;
      bed = Math.max(bed, g);
    }
    const low = bed + size * 0.22 + 0.06, high = w.level - 0.08 - size * 0.12;
    return high - low > 0.02 ? { low, high, level: w.level } : null;
  }

  #swim(list, dt, T, ctx, cam) {
    const sim = (this.sim ??= new Map());
    const h = Math.min(dt, 0.1);
    for (const f of list) {
      if (f.salmon) continue; // (the salmon at the falls: their leaps are their own)
      let s = sim.get(f.id);
      const sh0 = Math.sin(f.heading), ch0 = Math.cos(f.heading);
      if (!s) {
        // (New in view: where it should be, if there's room for it there.)
        const room = this.#room(f.x, f.z, f.size, sh0, ch0, ctx);
        if (!room) {
          f.hidden = true;
          continue;
        }
        s = { x: f.x, z: f.z, y: Math.min(room.high, Math.max(room.low, f.y)), vx: 0, vz: 0, heading: f.heading, pitch: 0, roll: 0, phase: (hashSeed(f.id) % 1000) * 0.0063, beat: f.beat ?? 1.5, amp: f.amp ?? 1, leap: null };
        sim.set(f.id, s);
      }
      s.seen = T;
      // A leap: up out of the water and back in, a little way on (only where it'll come down in water).
      const hh = hash2(hashSeed(f.id) | 0, 7, this.seed ^ 0x1ea9);
      const P = 90 + 120 * hh, start = Math.floor((T + hh * P) / P) * P - hh * P, lh = 0.8 + 0.8 * hh, dur = 0.45 + Math.sqrt(lh) * 0.35, d = 0.8 + hh;
      const k = (T - start) / dur;
      if (!s.leap && k >= 0 && k < 0.3 && s.leapDone !== start && !f.spooked && Math.hypot(s.x - cam.x, s.z - cam.z) < 45) {
        s.leapDone = start;
        const sh = Math.sin(s.heading), ch = Math.cos(s.heading), land = ctx.waterAt(s.x + sh * d, s.z + ch * d);
        const g = ctx.ground(s.x + sh * d, s.z + ch * d);
        if (land && land.level - g > f.size * 0.6 + 0.3) s.leap = { start, dur, d, h: lh, x0: s.x, z0: s.z, y0: s.y, level: f.level };
      }
      if (s.leap) {
        const L = s.leap, u = (T - L.start) / L.dur;
        if (u >= 1) {
          s.leap = null;
          s.y = Math.min(s.y, L.level - 0.25);
        } else {
          const sh = Math.sin(s.heading), ch = Math.cos(s.heading), e = Math.max(0, u);
          s.x = L.x0 + sh * L.d * e;
          s.z = L.z0 + ch * L.d * e;
          // (Up from where it was swimming, smoothly, over the top, and back down to it.)
          const blend = smoothstep(0, 0.2, e) * (1 - smoothstep(0.8, 1, e));
          s.y = L.y0 + (L.level - 0.3 - L.y0) * blend + Math.sin(Math.PI * e) * L.h;
          s.pitch = -Math.cos(Math.PI * e) * 0.9;
          s.vx = sh * L.d / L.dur;
          s.vz = ch * L.d / L.dur;
          s.beat = 5;
          f.leap = true;
          Object.assign(f, { x: s.x, y: s.y, z: s.z, heading: s.heading, pitch: s.pitch, beat: 5, amp: 1.6 });
          s.phase += 5 * h * TAU;
          f.phase = s.phase;
          continue;
        }
      }
      // Steering: for where it means to be, at a pace for what it's doing
      // (a dart, a flight: fast; holding in the current, cruising: slow).
      const fast = (f.beat ?? 1.5) >= 4;
      const top = (fast ? 3.2 : 1.1) * (0.5 + f.size);
      let dx = f.x - s.x, dz = f.z - s.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.min(top, dist * (fast ? 3 : 1.4));
      const wx = dist > 1e-4 ? (dx / dist) * want : 0, wz = dist > 1e-4 ? (dz / dist) * want : 0;
      s.vx += (wx - s.vx) * Math.min(1, h * (fast ? 5 : 2));
      s.vz += (wz - s.vz) * Math.min(1, h * (fast ? 5 : 2));
      const speed = Math.hypot(s.vx, s.vz);
      // (Turning: toward the way it's going, or, holding still, the way it means to face.)
      const aim = speed > 0.15 * (0.5 + f.size) ? Math.atan2(s.vx, s.vz) : f.heading;
      const turn = Math.atan2(Math.sin(aim - s.heading), Math.cos(aim - s.heading));
      const rate = fast ? 7 : 2.6;
      const dh = Math.max(-rate * h, Math.min(rate * h, turn * Math.min(1, h * (fast ? 10 : 4))));
      s.heading += dh;
      s.roll += (-dh / Math.max(h, 1e-3) * 0.06 - s.roll) * Math.min(1, h * 6); // (banking a touch into a turn)
      // (It swims the way it's facing: what's off to its side it can only slip toward a little.)
      const sh = Math.sin(s.heading), ch = Math.cos(s.heading);
      const ahead = Math.max(0, s.vx * sh + s.vz * ch), side = (s.vx * ch - s.vz * sh) * 0.3;
      const mx = sh * ahead + ch * side, mz = ch * ahead - sh * side;
      let nx = s.x + mx * h, nz = s.z + mz * h;
      let room = this.#room(nx, nz, f.size, sh, ch, ctx);
      if (!room) {
        // (The bank, or the bed coming up: along it if it can, else stopped, and turning away.)
        if ((room = this.#room(nx, s.z, f.size, sh, ch, ctx))) nz = s.z;
        else if ((room = this.#room(s.x, nz, f.size, sh, ch, ctx))) nx = s.x;
        else {
          nx = s.x;
          nz = s.z;
          s.vx *= -0.3;
          s.vz *= -0.3;
          s.heading += Math.sign(turn || 1) * Math.min(1, h * 3);
          room = this.#room(s.x, s.z, f.size, sh, ch, ctx);
        }
      }
      s.x = nx;
      s.z = nz;
      // Up and down: gently toward where it means to be (quick, rising to a fly), never out of the water or into the bed.
      const ty = room ? Math.min(room.high, Math.max(room.low, f.y)) : s.y;
      const vy = (ty - s.y) * Math.min(1, h * (f.rising ? 7 : fast ? 3 : 1.2));
      s.y += vy;
      if (room) s.y = Math.min(room.high, Math.max(room.low, s.y));
      s.pitch += ((f.pitch ?? Math.max(-0.45, Math.min(0.45, -vy / Math.max(h, 1e-3) * 0.5))) - s.pitch) * Math.min(1, h * 5);
      // (Beating its tail harder the faster it goes.)
      const beat = Math.max(f.beat ?? 1.5, 0.8 + speed * 2.2 / (0.5 + f.size));
      s.beat += (beat - s.beat) * Math.min(1, h * 3);
      s.amp += ((f.amp ?? 1) * (0.7 + 0.3 * Math.min(1, speed)) - s.amp) * Math.min(1, h * 3);
      s.phase += s.beat * h * TAU;
      Object.assign(f, { x: s.x, y: s.y, z: s.z, heading: s.heading, pitch: s.pitch, roll: s.roll, phase: s.phase, amp: s.amp, leap: false });
      if (!room) f.hidden = true;
    }
    // (Forgetting those gone out of view a while.)
    if ((this.forget = (this.forget ?? 0) - dt) <= 0) {
      this.forget = 2;
      for (const [id, s] of sim) if (T - s.seen > 4) sim.delete(id);
    }
  }

  // The falls near you, for the salmon.
  #findFalls(ctx) {
    const cam = ctx.camera.position;
    this.falls = [];
    const g = ctx.generator;
    if (!g?.rivers) return;
    for (const course of g.rivers.inBox(cam.x - 90, cam.z - 90, cam.x + 90, cam.z + 90)) {
      const P = course.points;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const run = Math.hypot(b.x - a.x, b.z - a.z) || 1, drop = a.level - b.level;
        if (drop < 0.8 || drop / run < 0.4 || drop > 4.5) continue;
        if (Math.hypot(b.x - cam.x, b.z - cam.z) > 90) continue;
        this.falls.push({
          key: `${Math.round(a.x)},${Math.round(a.z)}`, i: Math.round(a.x), j: Math.round(a.z),
          x: b.x + ((b.x - a.x) / run) * 1.5, z: b.z + ((b.z - a.z) / run) * 1.5, low: b.level, high: a.level, drop, up: Math.atan2(a.x - b.x, a.z - b.z), w: Math.max(0.5, b.width * 0.3),
        });
      }
    }
  }
}
