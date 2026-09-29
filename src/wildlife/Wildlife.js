import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { hash2, mulberry32 } from '../noise/random.js';
import { chooseGait, footAt, rhythm, solveLeg, stepFeet, strideLength } from './Gait.js';
import * as Models from './models.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const TAU = Math.PI * 2;
const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const rnd = (a, b) => a + Math.random() * (b - a);

// Their gaits: [walking, trotting (or none), galloping] (see Gait.js).
const DOG = ['walk', 'trot', 'rotary'], HOOF = ['walk', 'trot', 'transverse'], BEAR = ['walk', null, 'rotary'], HOP = ['bound', null, 'bound'], FOWL = ['step', null, 'run'];

/**
 * The kinds of animal. Ground animals: how steep a slope they'll take
 * (`grade`: rise over run; a bison keeps to gentle ground, a deer or a bear
 * goes up a steep bank), walking and running speeds (m/s),
 * how near you can come before they bolt (`flee`, metres) and how far off
 * they settle again (`calm`), their bulk (`radius`, for trees and for
 * being hit), `health` (for hunting), how long a stride is, their gaits
 * (and how much of the way from walking to running they trot), whether
 * they'll swim. Birds: how big they're drawn (`scale`) and how near you can
 * come (`flee`).
 */
const SPECIES = {
  deer: { ground: true, grade: 0.72, model: Models.deer, max: 60, walk: 1.3, run: 11, flee: 45, calm: 130, radius: 0.5, height: 1.4, health: 60, stride: 1.6, turn: 2.5, size: 1.3, gaits: DOG, trotBand: 0.12, swims: true },
  // Elk: herds in the high meadows and the pine woods (in the autumn the
  // bulls bugle, and one in the rut will come at you).
  elk: { ground: true, grade: 0.75, model: Models.elk, max: 30, walk: 1.3, run: 12, flee: 55, calm: 140, radius: 0.55, height: 1.8, health: 90, stride: 2.1, turn: 2.2, size: 1.55, gaits: HOOF, trotBand: 0.3, swims: true, call: 'bugle' },
  // A moose: alone in the cold woods by the water; slow to run, but
  // don't come close (a bull in the rut, a cow with her calf).
  moose: { ground: true, grade: 0.7, model: Models.moose, max: 8, walk: 1.2, run: 9, flee: 18, calm: 60, radius: 0.7, height: 2.1, health: 250, stride: 2.0, turn: 1.6, size: 1.0, gaits: HOOF, trotBand: 0.85, swims: true },
  bison: { ground: true, grade: 0.4, model: Models.bison, max: 70, walk: 1.0, run: 8.5, flee: 30, calm: 85, radius: 1.0, height: 2.0, health: 200, stride: 2.2, turn: 1.4, size: 1.5, gaits: HOOF, trotBand: 0.3 },
  // Bears (in the mountain foothills): a black bear shies away; a grizzly
  // stands its ground (`aggressive`: one day it will come for you).
  blackBear: { ground: true, grade: 0.78, model: Models.blackBear, max: 16, walk: 0.9, run: 9, flee: 35, calm: 100, radius: 0.7, height: 1.3, health: 150, stride: 1.4, turn: 1.8, size: 1.3, forager: true, gaits: BEAR, swims: true },
  grizzly: { ground: true, grade: 0.78, model: Models.grizzly, max: 10, walk: 0.9, run: 10, flee: 10, calm: 40, radius: 0.8, height: 1.5, health: 260, stride: 1.6, turn: 1.6, size: 1.6, forager: true, aggressive: true, gaits: BEAR, swims: true },
  // Wild dogs: wolves in packs in the pine woods and the cold north (they
  // howl at night), coyotes on the savanna and the plains (yipping at dusk),
  // foxes alone at the woods' edges where the winters are cold.
  wolf: { ground: true, grade: 0.8, model: Models.wolf, max: 24, walk: 1.4, run: 12, flee: 40, calm: 110, radius: 0.35, height: 0.9, health: 70, stride: 1.3, turn: 3, size: 1.25, forager: true, call: 'howl', gaits: DOG, trotBand: 0.5, swims: true, scavenger: true },
  coyote: { ground: true, grade: 0.8, model: Models.coyote, max: 16, walk: 1.3, run: 11, flee: 35, calm: 100, radius: 0.28, height: 0.7, health: 40, stride: 1.1, turn: 3.5, size: 0.95, forager: true, call: 'yip', gaits: DOG, trotBand: 0.45, scavenger: true },
  fox: { ground: true, grade: 0.85, model: Models.fox, max: 14, walk: 1.1, run: 10, flee: 25, calm: 70, radius: 0.2, height: 0.5, health: 20, stride: 0.8, turn: 4, size: 0.744, forager: true, gaits: DOG, trotBand: 0.45, scavenger: true },
  // A cougar: alone in the mountains, seldom seen: it stalks you from
  // behind, freezing when you look its way, and springs.
  cougar: { ground: true, grade: 0.95, model: Models.cougar, max: 6, walk: 1.2, run: 14, flee: 25, calm: 90, radius: 0.3, height: 0.8, health: 70, stride: 1.25, turn: 4, size: 1.05, gaits: DOG, trotBand: 0.15, call: 'scream' },
  // Wild boar: a sounder of them rooting in the woods; one will charge.
  boar: { ground: true, grade: 0.72, model: Models.boar, max: 24, walk: 1.0, run: 9, flee: 24, calm: 70, radius: 0.4, height: 1.0, health: 90, stride: 0.95, turn: 3, size: 1.0, forager: true, gaits: HOOF, trotBand: 0.4, call: 'oink' },
  // Sheep in flocks on the open plains (a black face, a woolly fleece);
  // wolf pups by their den.
  sheep: { ground: true, grade: 0.7, model: Models.sheep, max: 40, walk: 1.0, run: 7.5, flee: 22, calm: 70, radius: 0.45, height: 1.0, health: 60, stride: 1.1, turn: 2.5, size: 1.21, call: 'baa', gaits: HOOF, trotBand: 0.3 },
  wolfPup: { ground: true, grade: 0.8, model: Models.wolf, max: 12, walk: 1.2, run: 8, flee: 12, calm: 40, radius: 0.2, height: 0.5, health: 20, stride: 0.7, turn: 4, size: 0.55, forager: true, gaits: DOG, trotBand: 0.5 },
  rabbit: { ground: true, grade: 0.58, model: Models.rabbit, max: 40, walk: 1.0, run: 7.5, flee: 14, calm: 40, radius: 0.3, height: 0.55, health: 10, stride: 1.0, turn: 5, size: 1.8, gaits: HOP },
  // Hares, out in the open and the cold woods: bigger, faster, white in the winter.
  hare: { ground: true, grade: 0.62, model: Models.hare, max: 20, walk: 1.2, run: 13, flee: 22, calm: 55, radius: 0.3, height: 0.65, health: 12, stride: 1.3, turn: 6, size: 2.0, gaits: HOP, tinted: true },
  // Wild turkeys: flocks in the woods (the toms gobbling and showing off
  // their fans in the spring).
  turkey: { ground: true, biped: true, grade: 0.8, model: Models.turkey, max: 30, walk: 0.9, run: 6.5, flee: 24, calm: 70, radius: 0.25, height: 1.0, health: 10, stride: 0.55, turn: 4, size: 1.0, gaits: FOWL, call: 'gobble' },
  // Ducks paddling on the ponds and lakes (up and away, if you come near).
  duck: { ground: true, biped: true, water: true, model: Models.duck, max: 30, walk: 0.5, run: 1.5, flee: 20, calm: 60, radius: 0.2, height: 0.35, health: 4, stride: 0.2, turn: 3, size: 1.3, gaits: FOWL, call: 'quack' },
  // Rattlesnakes in the dry country (not in the winter): coiling, rattling, striking.
  snake: { serpent: true, model: Models.snake, max: 10, walk: 0.35, run: 1.2, flee: 5, calm: 12, radius: 0.1, height: 0.1, health: 4, size: 1.0 },
  songbird: { bird: true, model: Models.songbird, max: 60, scale: 1.6, flee: 9, radius: 0.25, health: 2 },
  starling: { bird: true, model: Models.starling, max: 60, scale: 1.45, flee: 22, radius: 0.25, health: 2 },
  crow: { bird: true, model: Models.crow, max: 40, scale: 2.3, flee: 25, radius: 0.35, health: 4 },
  gull: { bird: true, model: Models.gull, max: 12, scale: 3.0, flee: 15, radius: 0.5, health: 6 },
  hawk: { bird: true, model: Models.hawk, max: 4, scale: 4.2, flee: 30, radius: 0.7, health: 12 },
};
// Hunting: how big a quarry each is (see wound), and the ones that will
// come for you (`predator`: how far off they see you, how near you can come
// before they come for you anyway, how hard they bite or swipe, how often,
// and from how far; a cougar ambushes).
const BULK = { deer: 'large', elk: 'large', moose: 'large', bison: 'large', blackBear: 'large', grizzly: 'large', boar: 'large', wolf: 'medium', coyote: 'medium', sheep: 'medium', cougar: 'medium', fox: 'small', rabbit: 'small', hare: 'small', wolfPup: 'small', turkey: 'small', duck: 'small', snake: 'small' };
for (const [kind, sp] of Object.entries(SPECIES)) sp.bulk = BULK[kind] ?? 'small';
SPECIES.wolf.predator = { sight: 70, close: 22, bite: 11, every: 1.3, reach: 1.4 };
SPECIES.grizzly.predator = { sight: 55, close: 25, bite: 30, every: 1.7, reach: 2.0 };
SPECIES.blackBear.predator = { sight: 35, close: 16, bite: 22, every: 1.6, reach: 1.8 };
SPECIES.cougar.predator = { sight: 65, close: 0, bite: 24, every: 1.2, reach: 1.3, ambush: true };
// The ones that stand up for themselves: charge you if you come too close
// (`close`; `rut`: nearer in the autumn, a bull or buck; `young`: a mother
// by her calf or piglets in spring), or when hurt (`hurt`), and then make off.
SPECIES.moose.charger = { close: 6, rut: 16, young: 18, hit: 30, reach: 2.2, hurt: true };
SPECIES.boar.charger = { close: 5, young: 10, hit: 18, reach: 1.2, hurt: true };
SPECIES.elk.charger = { close: 0, rut: 10, hit: 22, reach: 2.0 };
SPECIES.deer.charger = { close: 0, rut: 5, hit: 12, reach: 1.5 };
SPECIES.bison.charger = { close: 7, young: 10, hit: 35, reach: 2.2 };
// How many blows to the body each size takes to go lame, to go down, and to
// die (a blow to the head brings one down; one more finishes it).
const BLOWS = { large: [3, 5, 6], medium: [2, 3, 4], small: [1, 2, 2] };
// What a carcass gives when butchered.
const YIELD = {
  sheep: { rawMeat: 3, wool: 3 }, wolfPup: { rawMeat: 1 }, deer: { rawMeat: 4, hide: 1 }, elk: { rawMeat: 6, hide: 2 }, moose: { rawMeat: 9, hide: 2 },
  bison: { rawMeat: 6, hide: 2 }, blackBear: { rawMeat: 5, fur: 2 }, grizzly: { rawMeat: 6, fur: 2 }, wolf: { rawMeat: 2, fur: 1 }, coyote: { rawMeat: 2, fur: 1 },
  fox: { rawMeat: 1, fur: 1 }, rabbit: { rawMeat: 1 }, hare: { rawMeat: 1, fur: 1 }, boar: { rawMeat: 5, hide: 1 }, cougar: { rawMeat: 3, fur: 1 },
  turkey: { rawMeat: 2, feather: 3 }, duck: { rawMeat: 1, feather: 2 }, snake: { rawMeat: 1 },
};
// Those that are small enough to be fed on by the scavengers (and those
// too big to be dragged off whole).
const HEAVY = new Set(['bison', 'moose', 'grizzly', 'elk']);

// Songbirds come in colours: robins, finches, jays, wrens, sparrows.
const SONGBIRD_TINTS = [0xc0703a, 0xd8b040, 0x5a7ab8, 0x8a6a4a, 0xa89878, 0xb04030];
const HARE_BROWN = new Color(0.62, 0.5, 0.38);

const base = new Matrix4(), part = new Matrix4(), out = new Matrix4(), inv = new Matrix4(), lift = new Matrix4();
const euler = new Euler(0, 0, 0, 'YXZ'), quat = new Quaternion(), pos = new Vector3(), scl = new Vector3(), v3 = new Vector3();
const white = new Color(1, 1, 1), tint = new Color();
const ik = { rz: 0, a1: 0, a2: 0, kx: 0, ky: 0, kz: 0 }, foot = { x: 0, y: 0, z: 0 };
const ray = new Raycaster();
const shake = new Quaternion();

/**
 * The animals of the world round you: herds of deer, elk and bison, a
 * moose by the water, boar in the woods, rabbits and hares, turkeys, ducks
 * on the ponds, snakes in the dry country, and birds (songbirds on the
 * trees and hopping on the ground; flocks wheeling over the woods and
 * fields, settling to feed; gulls over the coast; a hawk circling high over
 * the mountains; crows flying home to roost at dusk). They come and go
 * around you as you move (out of sight, so none appear from nowhere), keep
 * to the land that suits them, walk the terrain round the trees (each foot
 * put down on the ground, one after another), and bolt, or scatter, when
 * you come too near.
 *
 * Each is a creature with a place, a heading, a state of mind and some
 * health: for hunting, see aim and wound (a hit one runs, or falls, the
 * wounds on it where it was hit; the dead lie where they fell a few
 * minutes, unless the scavengers get to them first).
 */
export class Wildlife {
  constructor(scene, materialHook = (m) => m) {
    this.scene = scene;
    this.material = materialHook(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.rigs = {};
    for (const [kind, sp] of Object.entries(SPECIES)) {
      const model = sp.model();
      const meshes = {};
      const make = (name, geometry, count, shadow) => {
        if (!geometry) return;
        const mesh = new InstancedMesh(geometry, this.material, count);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.name = `${kind} ${name}`;
        scene.add(mesh);
        meshes[name] = mesh;
      };
      if (sp.ground) {
        const n = model.legs.length / 2;
        make('body', model.body, sp.max, true);
        make('head', model.head, sp.max, true);
        make('antlers', model.antlers, sp.max, true);
        make('fan', model.fan, sp.max, true);
        make('wingL', model.wingL, sp.max, false);
        make('wingR', model.wingR, sp.max, false);
        if (model.fore) make('foreUpper', model.fore.upper, sp.max * 2, true), make('foreLower', model.fore.lower, sp.max * 2, true);
        make('hindUpper', model.hind.upper, sp.max * n, true);
        make('hindLower', model.hind.lower, sp.max * n, true);
        if (sp.tinted) for (const m of Object.values(meshes)) m.setColorAt(0, white);
        model.body.computeBoundingBox();
      } else if (sp.serpent) {
        make('segment', model.segment, sp.max * model.segments, true);
        make('head', model.head, sp.max, true);
        make('rattle', model.rattle, sp.max, false);
      } else {
        make('body', model.body, sp.max, kind === 'hawk' || kind === 'gull');
        make('wingL', model.wingL, sp.max, kind === 'hawk' || kind === 'gull');
        make('wingR', model.wingR, sp.max, kind === 'hawk' || kind === 'gull');
      }
      this.rigs[kind] = { model, meshes };
    }
    // Wounds: a dark red mark on a creature where each blow or shot went in.
    this.woundMesh = new InstancedMesh(new BoxGeometry(0.07, 0.07, 0.07), new MeshLambertMaterial({ color: 0x8a0c0c, emissive: 0x3a0404 }), 256);
    this.woundMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.woundMesh.frustumCulled = false;
    this.woundMesh.count = 0;
    this.woundMesh.name = 'wounds';
    scene.add(this.woundMesh);
    this.probe = new Mesh(undefined, this.material); // (for testing a ray against a creature's shape)
    this.animals = []; // every creature: { kind, x, y, z, heading, pitch, roll, scale, alive, health, ... }
    this.herds = [];
    this.flocks = [];
    this.wait = 0;
    this.crowCooldown = 0;
    this.time = 0;
    // What lives in each chunk of the land (see #settle): "cx,cz" -> { animals, herds, birds }.
    this.homes = new Map();
    this.last = null; // where you were, and which way you're heading
    this.heading = null;
  }

  /** Forgets every creature (a new world). */
  clear() {
    for (const a of this.animals) this.#unstick(a);
    this.animals = [];
    this.herds = [];
    this.flocks = [];
    this.homes.clear();
  }

  // A sheep become yours: out of its flock, kept (not left behind with its
  // patch of land, and saved with the world).
  #tame(a) {
    a.tame = true;
    a.keep = true;
    if (a.herd) {
      a.herd.members.splice(a.herd.members.indexOf(a), 1);
      a.herd = null;
    }
    a.chunk = null;
    a.home = { x: a.x, z: a.z };
    this.ctx?.sound?.call('baa', this.ctx.pan(a.x, a.z), 0.5);
  }

  /**
   * A tame sheep fed: if another's been fed lately close by, a lamb.
   * Returns the lamb, if there is one.
   */
  feed(a) {
    a.fed = this.time;
    const mate = this.animals.find((m) => m !== a && m.tame && m.alive && !m.young && m.kind === a.kind && this.time - (m.fed ?? -1e9) < 90 && Math.hypot(m.x - a.x, m.z - a.z) < 10);
    if (!mate || a.young) return null;
    a.fed = mate.fed = -1e9;
    const lamb = this.#spawnWalker(a.kind, (a.x + mate.x) / 2, (a.z + mate.z) / 2, null, { young: 0.5, mother: a });
    if (lamb) this.#tame(lamb);
    return lamb;
  }

  /** Your tame animals, to save: [{ kind, x, z, young, sheared }]. */
  tameJSON() {
    return this.animals.filter((a) => a.tame && a.alive && !a.gone).map((a) => ({ kind: a.kind, x: +a.x.toFixed(1), z: +a.z.toFixed(1), young: a.young ? 0.5 : 0, sheared: a.sheared ? Math.max(0, Math.round(this.time - a.sheared)) : null }));
  }

  /** Brings back your tame animals (once the land's there under them). */
  loadTame(list) {
    for (const a of this.animals) if (a.tame) a.gone = true;
    this.pendingTame = list ?? [];
  }

  /** Puts a creature at (x, z) (for testing; `o` as #spawnWalker). */
  spawn(kind, x, z, o = {}) {
    if (!this.ctx) return null;
    return SPECIES[kind]?.serpent ? this.#spawnSnake(x, z) : this.#spawnWalker(kind, x, z, null, o);
  }

  /** What kind of thing it is, for the names: its bulk, and whether it's a bird. */
  static species(kind) {
    return SPECIES[kind];
  }

  // --- Hunting --------------------------------------------------------------

  /**
   * The nearest living creature a ray from `origin` along `dir` (unit)
   * passes through, within `max` metres: { animal, distance }, or null.
   */
  raycast(origin, dir, max = 150) {
    return this.aim(origin, dir, max);
  }

  /**
   * What a ray from `origin` along unit `dir` hits first, within `max`: a
   * creature's head or its body, tested against its shape as it's drawn
   * (its pose just now: running, lying, dead). { animal, distance, head,
   * point (where it went in), normal, local (where, in the creature's own
   * frame, for its wound) }, or null. (`dead`: the dead ones too, for
   * butchering.)
   */
  aim(origin, dir, max = 150, dead = false) {
    let best = null;
    ray.set(origin, dir);
    ray.near = 0;
    for (const a of this.animals) {
      if (a.gone || (!a.alive && !dead)) continue;
      const sp = SPECIES[a.kind];
      const R = sp.bird ? 0.8 : (sp.height * 1.2 + 1.2) * a.scale;
      const ox = a.x - origin.x, oy = a.y - origin.y, oz = a.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < -R || t > max + R) continue;
      if (ox * ox + oy * oy + oz * oz - t * t > R * R) continue;
      const limit = best ? best.distance : max;
      let hit = null;
      if (sp.bird) {
        // A bird: a sphere about it.
        const r = sp.radius * a.scale * 0.5 + 0.15;
        const d2 = ox * ox + oy * oy + oz * oz - t * t;
        if (d2 < r * r) {
          const d = t - Math.sqrt(r * r - d2);
          if (d >= 0 && d < limit) hit = { distance: d, head: false, point: origin.clone().addScaledVector(dir, d), frame: null };
        }
      } else if (sp.serpent) {
        // A snake: along its length (its head a head).
        (a.segs ?? []).forEach((sg, k) => {
          const r = 0.07 * a.scale + 0.03;
          const px = sg.x - origin.x, py = sg.y + 0.03 - origin.y, pz = sg.z - origin.z;
          const tt = px * dir.x + py * dir.y + pz * dir.z, d2 = px * px + py * py + pz * pz - tt * tt;
          if (d2 > r * r) return;
          const d = tt - Math.sqrt(r * r - d2);
          if (d >= 0 && d < (hit?.distance ?? limit)) hit = { distance: d, head: k === 0, point: origin.clone().addScaledVector(dir, d), frame: null };
        });
      } else if (a.m) {
        // A beast: its body, and its head (the skull, or the neck).
        const rig = this.rigs[a.kind];
        ray.far = limit;
        for (const [geometry, frame, isHead] of [[rig.model.body, a.m, false], [rig.model.head, a.hm, true]]) {
          if (!frame) continue;
          this.probe.geometry = geometry;
          this.probe.matrixWorld.copy(frame);
          const found = ray.intersectObject(this.probe, false)[0];
          if (!found || found.distance >= (hit?.distance ?? limit)) continue;
          let head = isHead;
          if (head && rig.model.neck) {
            // (The head, not the neck.)
            v3.copy(found.point).applyMatrix4(inv.copy(frame).invert());
            const [cx, cy, cz, hx, hy, hz] = rig.model.neck;
            head = !(Math.abs(v3.x - cx) < hx && Math.abs(v3.y - cy) < hy && Math.abs(v3.z - cz) < hz);
          }
          hit = { distance: found.distance, head, point: found.point.clone(), normal: found.face?.normal.clone().transformDirection(frame), frame: isHead ? 'head' : 'body' };
        }
      }
      if (hit) best = { animal: a, ...hit };
    }
    if (best?.frame) {
      const frame = best.frame === 'head' ? best.animal.hm : best.animal.m;
      best.local = best.point.clone().applyMatrix4(inv.copy(frame).invert());
    }
    return best;
  }

  /**
   * A blow (a spear's, or an axe's) or a shot to a creature, from `from`
   * (with the `hit` from aim: where it went in, to mark the wound): to the
   * head it brings one down, and one more finishes it; to the body, a big
   * one (a deer, a bison, a bear) goes lame after three, down after five,
   * and dies at the sixth; a middling one (a wolf, a coyote) lame after
   * two, down at three, dead at four; a small one (a fox) lame after one
   * and dead at two, and a rabbit or a bird at one. Returns 'hit', 'lame',
   * 'down' or 'dead'. The rest run; a wolf or a bear turns on you; a boar
   * or a moose charges.
   */
  wound(a, { head = false, from, hit = null, sharp = 1 } = {}) {
    if (!a.alive) return 'dead';
    const sp = SPECIES[a.kind];
    // Where it went in: a mark, and it flinches.
    if (hit?.local) {
      a.marks = a.marks ?? [];
      if (a.marks.length >= 6) a.marks.shift();
      a.marks.push({ head: hit.frame === 'head', x: hit.local.x, y: hit.local.y, z: hit.local.z });
    }
    if (from) {
      const dx = a.x - from.x, dz = a.z - from.z, d = Math.hypot(dx, dz) || 1;
      a.jolt = { x: dx / d, z: dz / d, t: 0.3 };
    }
    const [lame, down, dead] = sp.bird || a.kind === 'rabbit' || a.kind === 'snake' || a.kind === 'duck' ? [1, 1, 1] : BLOWS[sp.bulk];
    let outcome;
    if (a.down) outcome = 'dead';
    else if (head) outcome = dead <= 1 ? 'dead' : 'down';
    else {
      a.hits = (a.hits ?? 0) + sharp;
      outcome = a.hits >= dead ? 'dead' : a.hits >= down ? 'down' : a.hits >= lame ? 'lame' : 'hit';
    }
    const cry = { deer: 'bleat', elk: 'bleat', sheep: 'baa', boar: 'squeal', moose: 'bellow', bison: 'grunt', rabbit: 'squeak', hare: 'squeak', turkey: 'gobble', duck: 'quack' }[a.kind];
    if (cry) this.ctx?.sound?.call(cry, this.ctx.pan(a.x, a.z), 0.6);
    if (outcome === 'dead') {
      a.alive = false;
      a.down = false;
      a.hunting = false;
      a.charging = 0;
      a.state = sp.bird ? 'falling' : 'dead';
      a.deadTime = 0;
      a.side = a.side ?? (Math.random() < 0.5 ? 1 : -1);
      a.vy = 0;
      a.feet = null;
      if (a.flying) (a.state = 'falling'), (a.vy = a.flying.vy);
      return 'dead';
    }
    if (outcome === 'down') {
      a.down = true;
      a.hunting = false;
      a.charging = 0;
      a.state = 'down';
      a.side = Math.random() < 0.5 ? 1 : -1;
      a.speed = 0;
      a.feet = null;
    }
    if (outcome === 'lame') a.lame = true;
    const at = from ?? this.ctx?.camera.position ?? a;
    if (sp.predator && !a.lame && !a.down) this.#enrage(a);
    else if (sp.charger?.hurt && !a.lame && !a.down && !a.young) this.#charge(a);
    else if (a.herd) {
      this.#alarm(a.herd, at.x, at.z);
      if (a.lame || a.down) a.hunting = false;
    } else a.fear = 8;
    return outcome;
  }

  /** Wounds a creature (from a point `from`): it flees, or dies. Returns whether it died. */
  hit(a, damage, from) {
    return this.wound(a, { from }) === 'dead';
  }

  /**
   * A spear or an arrow left sticking in a creature where it went in (the
   * mesh, and what to give back when it's butchered).
   */
  stick(a, hit, mesh, stack) {
    const frame = hit.frame === 'head' ? a.hm : a.m;
    if (!frame) return false;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    a.stuck = a.stuck ?? [];
    a.stuck.push({ mesh, stack, head: hit.frame === 'head', local: inv.copy(frame).invert().multiply(mesh.matrix).clone() });
    return true;
  }

  // Takes a creature's spears and arrows out of it (they're dropped, or lost).
  #unstick(a) {
    const got = [];
    for (const s of a.stuck ?? []) {
      this.scene.remove(s.mesh);
      if (s.stack) got.push(s.stack);
    }
    a.stuck = null;
    return got;
  }

  /**
   * Butchers a carcass: it's gone, and here's what it gave ({ id: count }),
   * and the spears and arrows that were in it ([stack]).
   */
  butcher(a) {
    if (a.alive || a.gone) return null;
    a.gone = true;
    const stuck = this.#unstick(a);
    const got = { ...(YIELD[a.kind] ?? { rawMeat: 1 }) };
    if (a.young) for (const k of Object.keys(got)) got[k] = Math.max(1, Math.floor(got[k] / 2));
    // (Picked at by scavengers first: less of it.)
    if (a.picked) got.rawMeat = Math.max(0, (got.rawMeat ?? 0) - Math.ceil(a.picked));
    Object.defineProperty(got, 'stuck', { value: stuck, enumerable: false });
    return got;
  }

  /** The dead lying near (x, z), for butchering and the like. */
  carcassesNear(x, z, r) {
    return this.animals.filter((a) => !a.alive && a.state === 'dead' && !a.gone && Math.hypot(a.x - x, a.z - z) < r);
  }

  #alarm(herd, x, z) {
    if (herd.hunting) return;
    herd.fear = { x, z };
    herd.fleeTime = 7;
  }

  // A wolf or a bear comes for you (and a wolf's pack with it).
  #enrage(a) {
    if (!SPECIES[a.kind].predator) return;
    a.hibernating = false;
    if (!a.hunting) this.ctx?.sound?.call(a.kind === 'wolf' ? 'snarl' : a.kind === 'cougar' ? 'hiss' : 'growl', this.ctx.pan(a.x, a.z), 0.8);
    a.hunting = true;
    a.notice = 9;
    a.fear = 0;
    if (a.herd) {
      a.herd.hunting = true;
      a.herd.fleeTime = 0;
      for (const m of a.herd.members) if (m.alive && !m.lame && !m.down && SPECIES[m.kind].predator) (m.hunting = true), (m.notice = 9);
    }
  }

  // A boar, a moose, a bull elk in the rut: it comes at you, head down,
  // for a few seconds (once it's hit you, it's done, and makes off).
  #charge(a) {
    if (a.charging > 0 || (a.chargeCool ?? 0) > 0) return;
    a.charging = 5;
    a.fear = 0;
    a.hibernating = false;
    const cry = { boar: 'squeal', moose: 'bellow', elk: 'bugle', bison: 'grunt', deer: 'snort' }[a.kind];
    this.ctx?.sound?.call(cry ?? 'snort', this.ctx.pan(a.x, a.z), 0.9);
    if (a.herd) a.herd.fleeTime = 0;
  }

  // A wolf or a bear watching for you: it notices you if you're in sight a
  // while (less far off if you keep low, or the trees are thick between,
  // further if the wind carries your scent to it), and warns you (a growl,
  // a snarl) and comes stalking before it charges; up close, or at its den,
  // at once. It gives up once you're well away.
  #stalk(a, sp, t, dt, ctx) {
    const p = ctx.player, pr = sp.predator;
    const able = p && p.mode === 'walk' && p.alive && !ctx.tame && !a.lame && !a.down;
    if (!able) {
      a.hunting = false;
      a.stalking = false;
      a.notice = 0;
      if (a.herd) a.herd.hunting = false;
      return;
    }
    a.forestWait = (a.forestWait ?? 0) - dt;
    if (a.forestWait <= 0) (a.forestWait = 3), (a.forest = ctx.generator.getForestDensity(a.x, a.z));
    const den = a.herd?.den ?? a.den;
    const atDen = den && Math.hypot(p.x - den.x, p.z - den.z) < 30;
    // (A mother bear with her cubs is quick to come at you.)
    const cubs = a.herd && a.kind === 'blackBear' && !a.young && a.herd.members.some((m) => m.young && m.alive);
    const sight = pr.sight * (p.crouch ? 0.55 : 1) * (0.7 + 0.3 * ctx.day) * (1 - 0.55 * (a.forest ?? 0)) * this.#scent(a, ctx);
    if (t.d < pr.close * (p.crouch ? 0.7 : 1) * (cubs ? 1.6 : 1) || atDen) a.notice = Math.max(a.notice ?? 0, 2.4);
    else if (t.d < sight) a.notice = (a.notice ?? 0) + dt;
    else a.notice = Math.max(0, (a.notice ?? 0) - dt * 0.5);
    // (A warning first: you hear it before it comes.)
    a.stalking = !a.hunting && a.notice > 0.6;
    if (a.stalking && !a.warned) {
      a.warned = true;
      ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : 'growl', ctx.pan(a.x, a.z), Math.min(0.9, 25 / (t.d + 10)));
    }
    if (!a.hunting && a.notice > 2.2) this.#enrage(a);
    if (a.hunting && t.d > pr.sight * 2.5) {
      a.hunting = false;
      a.warned = false;
      a.notice = 0;
      if (a.herd) a.herd.hunting = false;
    }
    if (a.herd?.hunting && !a.hunting) (a.hunting = true), (a.notice = 9);
  }

  // A cougar, hunting you: it notices you (less soon if you keep low), then
  // creeps up from behind, keeping low, freezing whenever you look its way;
  // close enough, and you not looking, it springs. Face it, standing tall,
  // a while, and it thinks better of it and slinks off.
  #ambush(a, sp, t, dt, ctx) {
    const p = ctx.player, pr = sp.predator;
    const able = p && p.mode === 'walk' && p.alive && !ctx.tame && !a.lame && !a.down;
    a.cool = Math.max(0, (a.cool ?? 0) - dt);
    if (!able || a.cool > 0) {
      a.hunting = false;
      a.stalking = false;
      a.notice = 0;
      return;
    }
    const f = ctx.forward, fl = Math.hypot(f.x, f.z) || 1;
    const seen = t.d < 80 && ((a.x - p.x) * f.x + (a.z - p.z) * f.z) / (fl * t.d) > Math.cos(0.9);
    a.watched = seen ? (a.watched ?? 0) + dt : Math.max(0, (a.watched ?? 0) - dt * 0.5);
    a.seen = seen;
    if (a.hunting) {
      if (t.d > pr.sight * 1.5) (a.hunting = false), (a.notice = 0);
      return;
    }
    if (t.d < pr.sight * (p.crouch ? 0.6 : 1) * this.#scent(a, ctx)) a.notice = (a.notice ?? 0) + dt;
    else a.notice = Math.max(0, (a.notice ?? 0) - dt * 0.3);
    a.stalking = a.notice > 1.5;
    if (!a.stalking) return;
    if (seen && !p.crouch && t.d < 25 && a.watched > 2.5) {
      // Stared down: off it goes.
      a.stalking = false;
      a.notice = 0;
      a.fear = 10;
      a.cool = 90;
      ctx.sound?.call('hiss', ctx.pan(a.x, a.z), 0.5);
      return;
    }
    if (!seen && t.d < 9 && t.d > 3) {
      // The spring.
      const ux = (p.x - a.x) / t.d, uz = (p.z - a.z) / t.d, sp2 = Math.min(13, t.d / 0.55);
      a.leap = { vx: ux * sp2, vz: uz * sp2, vy: 3.2, t: 0 };
      a.hunting = true;
      a.stalking = false;
      a.notice = 9;
      ctx.sound?.call('scream', ctx.pan(a.x, a.z), 0.9);
    }
  }

  // How far your scent carries to it: further downwind of you, less upwind.
  #scent(a, ctx) {
    const w = ctx.windDir, p = ctx.player;
    if (!w || !p) return 1;
    const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz) || 1;
    const along = (dx * w.x + dz * w.y) / d; // (1: it's straight downwind of you)
    return along > 0 ? 1 + 0.8 * along : 1 + 0.3 * along;
  }

  // The fire (a campfire, a torch) whose light (x, z) is in, if any: { x, z, r }.
  #fireAt(x, z, ctx, pad = 0) {
    for (const f of ctx.fires ?? []) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return f;
    return null;
  }

  // --- Coming and going -----------------------------------------------------

  /**
   * @param dt   seconds
   * @param ctx  { camera, forward (which way you look), generator, ground(x, z),
   *              trees (TreeLayer), chunkSize, seaLevel, day, dawn, dusk,
   *              winter, rain, sheltered, sound, pan(x, z) (-1 left .. 1 right),
   *              seed, tame (for testing: they pay you no mind) }
   */
  update(dt, ctx) {
    this.time += dt;
    this.ctx = ctx;
    const hidden = ctx.sheltered;
    this.hidden = hidden;
    if (hidden) {
      for (const rig of Object.values(this.rigs)) for (const m of Object.values(rig.meshes)) m.visible = false;
      this.woundMesh.visible = false;
      for (const a of this.animals) for (const st of a.stuck ?? []) st.mesh.visible = false;
      return;
    }
    for (const a of this.animals) for (const st of a.stuck ?? []) st.mesh.visible = true;
    this.wait -= dt;
    this.crowCooldown -= dt;
    if (this.wait <= 0) {
      this.wait = 0.5;
      this.#populate(ctx);
    }
    if (this.pendingTame?.length) {
      const left = [];
      for (const t of this.pendingTame) {
        if (!Number.isFinite(ctx.ground(t.x, t.z))) {
          left.push(t);
          continue;
        }
        const a = this.#spawnWalker(t.kind, t.x, t.z, null, t.young ? { young: t.young } : {});
        if (!a) continue;
        this.#tame(a);
        if (t.sheared !== null && t.sheared !== undefined) a.sheared = this.time - t.sheared;
      }
      this.pendingTame = left;
    }
    for (const herd of this.herds) this.#herd(herd, dt, ctx);
    for (const flock of this.flocks) this.#flock(flock, dt, ctx);
    for (const a of this.animals) {
      if (SPECIES[a.kind].ground) this.#walker(a, dt, ctx);
      else if (SPECIES[a.kind].serpent) this.#snake(a, SPECIES.snake, dt, ctx);
      else if (a.flock) this.#flockBird(a, dt, ctx);
      else if (a.circling) this.#circler(a, dt, ctx);
      else this.#songbird(a, dt, ctx);
    }
    // (Those flown off out of sight, or home to roost.)
    if (this.animals.some((a) => a.gone)) {
      for (const a of this.animals) if (a.gone) this.#unstick(a);
      this.animals = this.animals.filter((a) => !a.gone);
    }
    this.#draw();
  }

  #populate(ctx) {
    const { camera, generator: g, seaLevel } = ctx;
    const cx = camera.position.x, cz = camera.position.z;
    // Which way you're going (fast, the mobile birds are found ahead of you).
    if (this.last) {
      const dx = cx - this.last.x, dz = cz - this.last.z;
      this.heading = Math.hypot(dx, dz) > 4 ? Math.atan2(dx, dz) : null;
    }
    this.last = { x: cx, z: cz };
    // The land's own animals, chunk by chunk, as it comes into range.
    this.#settleAround(ctx);
    // Gone out of range (the wanderers: the land's own go with their
    // chunk), and the long dead: away.
    this.animals = this.animals.filter((a) => {
      const far = !a.chunk && !a.keep && Math.hypot(a.x - cx, a.z - cz) > (SPECIES[a.kind].bird ? 520 : 430);
      const rotted = !a.alive && a.deadTime > 180;
      if (far || rotted) this.#unstick(a);
      return !(far || rotted || a.gone);
    });
    // Scavengers (a wolf, a coyote, a fox) find the dead left lying, after a while.
    for (const c of this.animals) {
      if (c.alive || c.gone || c.claimed || c.state !== 'dead' || c.deadTime < 40 || !SPECIES[c.kind].ground) continue;
      let best = null, bd = 160;
      for (const a of this.animals) {
        if (!a.alive || !SPECIES[a.kind].scavenger || a.scavenge || a.hunting || a.young || a.herd?.den) continue;
        const d = Math.hypot(a.x - c.x, a.z - c.z);
        if (d < bd) (bd = d), (best = a);
      }
      if (best) (best.scavenge = c), (c.claimed = best);
    }
    // In the night, a bear comes for the food at your camp (see ctx.caches).
    for (const a of this.animals) {
      if (a.kind !== 'blackBear' && a.kind !== 'grizzly') continue;
      a.raidCool = Math.max(0, (a.raidCool ?? 0) - 0.5);
      if (!a.alive || a.raid || a.hunting || a.hibernating || a.young || a.raidCool > 0 || ctx.night < 0.5 || !ctx.caches) continue;
      let best = null, bd = 250;
      for (const c of ctx.caches()) {
        const d = Math.hypot(c.x - a.x, c.z - a.z);
        if (d < bd) (bd = d), (best = c);
      }
      if (best) (a.raid = best), (a.raided = false);
    }
    const alive = new Set(this.animals);
    for (const h of this.herds) h.members = h.members.filter((a) => alive.has(a));
    this.herds = this.herds.filter((h) => h.members.length);
    for (const f of this.flocks) f.birds = f.birds.filter((a) => alive.has(a));
    this.flocks = this.flocks.filter((f) => f.birds.length && !f.done);
    const count = (kind) => this.animals.filter((a) => a.kind === kind).length;

    // Somewhere suitable, out of sight: behind you or well off (or, on
    // the move, ahead of you where you're going).
    const view = Math.atan2(ctx.forward.x, ctx.forward.z);
    const spot = (near, farther, ok, tries = 14) => {
      for (let k = 0; k < tries; k++) {
        const ahead = this.heading !== null;
        const behind = !ahead && k < tries / 2;
        const a = ahead ? this.heading + rnd(-0.9, 0.9) : behind ? view + Math.PI + rnd(-1.6, 1.6) : rnd(0, TAU);
        const d = ahead || behind ? rnd(near, farther) : rnd(Math.max(near, 240), farther + 40);
        const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
        const y = g.getBaseHeight(x, z);
        if (y > seaLevel + 1 && ok(x, z, y)) return { x, z, y };
      }
      return null;
    };
    const day = ctx.day, winter = ctx.winter;

    // Flocks wheeling over the woods and fields, by day.
    if (day > 0.4 && this.flocks.filter((f) => f.kind === 'starling').length < 1) {
      const s = spot(260, 380, (x, z) => { const w = g.getBiomeWeights(x, z, {}); return w.temperate + w.savanna + w.pine > 0.6; }, 6);
      if (s) this.#spawnFlock('starling', s, Math.round(rnd(6, 12)));
    }
    // Gulls over the coast.
    if (day > 0.2 && count('gull') < 3) {
      const s = spot(120, 350, (x, z) => g.getOceanness(x, z) > 0.5, 10) ?? this.#coastSpot(ctx);
      if (s) this.#spawnCircler('gull', s);
    }
    // A hawk or an eagle, high over the mountains.
    if (day > 0.3 && count('hawk') < 1) {
      const s = spot(150, 350, (x, z) => g.getMountainness(x, z) > 0.35, 6);
      if (s) this.#spawnCircler('hawk', s);
    }
    // At dusk, crows fly over on their way home to roost.
    if (ctx.dusk > 0.25 && this.crowCooldown <= 0 && this.flocks.filter((f) => f.kind === 'crow').length < 1) {
      this.crowCooldown = rnd(20, 45);
      const a = rnd(0, TAU);
      const from = { x: cx + Math.sin(a) * 380, z: cz + Math.cos(a) * 380 };
      const b = a + Math.PI + rnd(-0.6, 0.6);
      const to = { x: cx + Math.sin(b) * 420, z: cz + Math.cos(b) * 420 };
      this.#spawnFlock('crow', { ...from, y: g.getBaseHeight(from.x, from.z) }, Math.round(rnd(4, 9)), to);
    }
  }

  // The chunks within about 400 m: each settled once as it comes into
  // range; those left well behind take their animals with them.
  #settleAround(ctx) {
    const C = ctx.chunkSize, R = 3;
    const ccx = Math.floor(ctx.camera.position.x / C), ccz = Math.floor(ctx.camera.position.z / C);
    for (const [key, home] of this.homes) {
      if (Math.hypot(home.cx - ccx, home.cz - ccz) <= R + 1.5) continue;
      for (const a of home.animals) if (!a.keep) a.gone = true;
      const herds = new Set(home.herds);
      this.herds = this.herds.filter((h) => !herds.has(h));
      this.homes.delete(key);
    }
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.hypot(dx, dz) > R + 0.5) continue;
        const cx = ccx + dx, cz = ccz + dz, key = `${cx},${cz}`;
        let home = this.homes.get(key);
        if (!home) this.homes.set(key, (home = this.#settle(cx, cz, ctx)));
        // Songbirds on its trees, once they're there (the trees near you).
        if (!home.birds && ctx.day > 0.3 && ctx.trees.crowns.get(key)) {
          home.birds = true;
          const list = ctx.trees.crowns.get(key), n = Math.round(home.rand() * 2.6 * (1 - 0.6 * ctx.winter));
          for (let k = 0; k < n && list.length; k++) {
            const i = Math.floor(home.rand() * (list.length / 5)) * 5;
            if (list[i + 3] - list[i + 2] < 2.5) continue;
            const perch = this.#perchOn(list.slice(i, i + 5), ctx);
            if (!perch) continue;
            const a = this.#spawnSongbird(perch);
            a.chunk = key;
            home.animals.push(a);
          }
        }
      }
    }
  }

  /**
   * What lives in chunk (cx, cz), from the lie of its land (the same each
   * time you come back): perhaps a herd of deer at the woods' edge, bison
   * out on the open grass, rabbits.
   */
  #settle(cx, cz, ctx) {
    const g = ctx.generator, C = ctx.chunkSize;
    const rand = mulberry32(Math.floor(hash2(cx, cz, ctx.seed ^ 0xdee7) * 4294967296));
    const home = { cx, cz, animals: [], herds: [], birds: false, rand };
    const at = () => {
      const x = (cx + 0.1 + 0.8 * rand()) * C, z = (cz + 0.1 + 0.8 * rand()) * C;
      return { x, z, y: g.getBaseHeight(x, z) };
    };
    const own = (from) => {
      for (const a of this.animals.slice(from)) (a.chunk = `${cx},${cz}`), home.animals.push(a);
    };
    // Deer, at the edges of the woods and in the clearings.
    for (let k = 0; k < 3; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1 || p.y > 150) continue;
      const w = g.getBiomeWeights(p.x, p.z, {}), f = g.getForestDensity(p.x, p.z);
      if (w.temperate + w.pine + w.smoky > 0.6 && f > 0.08 && f < 0.95 && g.getMountainness(p.x, p.z) < 0.55) {
        if (rand() < 0.28) {
          const from = this.animals.length;
          const herd = this.#group('deer', p, 2 + Math.floor(rand() * 5), rand() < 0.35);
          if (herd) home.herds.push(herd);
          own(from);
        }
        break;
      }
    }
    // Bison out on the open plains and the savanna.
    for (let k = 0; k < 3; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (((w.temperate > 0.6 && g.getPlainness(p.x, p.z) > 0.3) || w.savanna > 0.6) && g.getMountainness(p.x, p.z) < 0.3) {
        if (rand() < 0.14) {
          const from = this.animals.length;
          const herd = this.#group('bison', p, 7 + Math.floor(rand() * 10), rand() < 0.2);
          if (herd) home.herds.push(herd);
          own(from);
        }
        break;
      }
    }
    // Bears in the wooded foothills of the mountains: a black bear (now and
    // then a mother with her cubs), or, higher up, a grizzly.
    for (let k = 0; k < 2; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {}), m = g.getMountainness(p.x, p.z);
      if (((m > 0.18 && m < 0.65) || w.smoky > 0.5) && w.temperate + w.pine + w.smoky > 0.5 && g.getForestDensity(p.x, p.z) > 0.05) {
        if (rand() < 0.22 && ctx.winter < 0.5) { // (in winter they're asleep in their dens: see below)
          const from = this.animals.length;
          const kind = rand() < 0.35 + 0.5 * (m - 0.18) ? 'grizzly' : 'blackBear';
          this.#spawnWalker(kind, p.x, p.z, null);
          if (kind === 'blackBear' && rand() < 0.35) {
            // (Cubs: small, and never far from her.)
            const mother = this.animals[this.animals.length - 1];
            if (mother?.kind === kind) {
              const herd = { kind, goal: { x: p.x, z: p.z }, goalWait: rnd(15, 40), members: [mother], fear: null, fleeTime: 0 };
              mother.herd = herd;
              mother.offset = { x: 0, z: 0 };
              const cubs = 1 + Math.floor(rand() * 2);
              for (let c = 0; c < cubs; c++) {
                this.#spawnWalker(kind, p.x + rnd(-2, 2), p.z + rnd(-2, 2), herd);
                const cub = this.animals[this.animals.length - 1];
                if (cub?.herd === herd) (cub.scale *= 0.45), (cub.offset = { x: rnd(-2, 2), z: rnd(-2, 2) });
              }
              this.herds.push(herd);
              home.herds.push(herd);
            }
          }
          own(from);
        }
        break;
      }
    }
    // Wolves: a pack in the pine woods, or the cold northern forests.
    for (let k = 0; k < 2; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {});
      const cold = g.getSeasonality(p.x, p.z);
      if ((w.pine > 0.5 || (w.temperate > 0.6 && cold > 0.7)) && g.getForestDensity(p.x, p.z) > 0.2 && g.getMountainness(p.x, p.z) < 0.6) {
        if (rand() < 0.09) {
          const from = this.animals.length;
          const herd = this.#group('wolf', p, 3 + Math.floor(rand() * 4), rand() < 0.2);
          if (herd) home.herds.push(herd);
          own(from);
        }
        break;
      }
    }
    // Coyotes on the savanna and the plains: alone, or two or three.
    for (let k = 0; k < 2; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {});
      if ((w.savanna > 0.5 || (w.temperate > 0.6 && g.getPlainness(p.x, p.z) > 0.3)) && g.getMountainness(p.x, p.z) < 0.4) {
        if (rand() < 0.14) {
          const from = this.animals.length;
          const herd = this.#spawnHerd('coyote', p, 1 + Math.floor(rand() * 3));
          if (herd) home.herds.push(herd);
          own(from);
        }
        break;
      }
    }
    // A fox, at the woods' edge where the winters are cold.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {}), f = g.getForestDensity(p.x, p.z);
      if (p.y > ctx.seaLevel + 1 && w.temperate + w.pine > 0.6 && g.getSeasonality(p.x, p.z) > 0.55 && f > 0.05 && f < 0.7 && rand() < 0.16) {
        const from = this.animals.length;
        this.#spawnWalker('fox', p.x, p.z, null);
        own(from);
      }
    }
    // Rabbits in the grass and at the woods' edges.
    const bunnies = Math.floor(rand() * 4.5);
    for (let k = 0; k < bunnies; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (w.temperate + w.pine + w.savanna * 0.6 > 0.6 && g.getForestDensity(p.x, p.z) < 0.8 && g.getMountainness(p.x, p.z) < 0.45) {
        const from = this.animals.length;
        this.#spawnWalker('rabbit', p.x, p.z, null);
        own(from);
      }
    }
    // Sheep: flocks out on the open plains.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && w.temperate > 0.6 && g.getPlainness(p.x, p.z) > 0.3 && g.getForestDensity(p.x, p.z) < 0.35 && g.getMountainness(p.x, p.z) < 0.3 && rand() < 0.18) {
        const from = this.animals.length;
        const herd = this.#spawnHerd('sheep', p, 5 + Math.floor(rand() * 8));
        if (herd) home.herds.push(herd);
        own(from);
      }
    }
    // Dens in the mouths of caves: a wolf pack with its pups, or a bear
    // (in the winter, asleep in there till spring).
    for (const e of g.caves?.mouthsNear(cx * C, cz * C, (cx + 1) * C, (cz + 1) * C) ?? []) {
      const m = e.mouth;
      if (m.x < cx * C || m.x >= (cx + 1) * C || m.z < cz * C || m.z >= (cz + 1) * C) continue;
      const w = g.getBiomeWeights(m.x, m.z, {}), f = g.getForestDensity(m.x, m.z);
      if (!(w.temperate + w.pine + w.smoky + w.blackHills > 0.5 && f > 0.1)) continue;
      const roll = hash2(Math.round(m.x), Math.round(m.z), ctx.seed ^ 0xd3d);
      const kind = roll < 0.35 && (w.pine > 0.3 || g.getSeasonality(m.x, m.z) > 0.55) ? 'wolves' : roll > 0.65 ? 'bear' : null;
      if (!kind) continue;
      const from = this.animals.length;
      // (Just outside the mouth, where the ground's firm.)
      let spot = null;
      for (let k = 0; k < 8 && !spot; k++) {
        const a = (k / 8) * TAU, x = m.x + Math.sin(a) * 6, z = m.z + Math.cos(a) * 6;
        const y = ctx.ground(x, z);
        if (y > ctx.seaLevel + 1 && this.#slope(x, z, ctx) < 0.5) spot = { x, z, y };
      }
      if (!spot) continue;
      const den = { x: spot.x, z: spot.z };
      if (kind === 'wolves') {
        const herd = this.#spawnHerd('wolf', spot, 3 + Math.floor(rand() * 3));
        if (!herd) continue;
        herd.den = den;
        const pups = 2 + Math.floor(rand() * 2);
        for (let k = 0; k < pups; k++) this.#spawnWalker('wolfPup', spot.x + rnd(-2, 2), spot.z + rnd(-2, 2), herd);
        for (const a of herd.members) if (a.kind === 'wolfPup') a.offset = { x: rnd(-2, 2), z: rnd(-2, 2) };
        home.herds.push(herd);
      } else {
        this.#spawnWalker(rand() < 0.5 ? 'grizzly' : 'blackBear', spot.x, spot.z, null);
        const bear = this.animals.length > from ? this.animals[this.animals.length - 1] : null;
        if (bear) {
          bear.den = den;
          bear.home = den;
          if (ctx.winter > 0.5) bear.hibernating = true;
        }
      }
      own(from);
    }
    // Elk: herds in the high meadows and the pine woods of the mountains
    // (with calves in the spring).
    for (let k = 0; k < 2; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {}), m = g.getMountainness(p.x, p.z), f = g.getForestDensity(p.x, p.z);
      if (w.pine + w.smoky + w.temperate > 0.6 && m > 0.15 && m < 0.7 && f < 0.7) {
        if (rand() < 0.1) {
          const from = this.animals.length;
          const herd = this.#group('elk', p, 4 + Math.floor(rand() * 7), rand() < 0.3);
          if (herd) {
            if ((ctx.spring ?? 0) + (ctx.summer ?? 0) > 0.5) this.#addYoung(herd, 1 + Math.floor(rand() * 3), 0.5);
            home.herds.push(herd);
          }
          own(from);
        }
        break;
      }
    }
    // Fawns with the deer, in the spring and summer.
    for (const herd of home.herds) if (herd.kind === 'deer' && (ctx.spring ?? 0) + (ctx.summer ?? 0) > 0.5 && rand() < 0.6) {
      const from = this.animals.length;
      this.#addYoung(herd, 1 + Math.floor(rand() * 2), 0.5);
      own(from);
    }
    // A moose, in the cold woods and the wetlands (a cow with her calf, in
    // the spring and summer).
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {}), cold = g.getSeasonality(p.x, p.z);
      if (p.y > ctx.seaLevel + 1 && (w.pine > 0.4 || (w.temperate > 0.5 && cold > 0.65) || w.wetland > 0.3) && g.getForestDensity(p.x, p.z) > 0.1 && rand() < 0.08) {
        const from = this.animals.length;
        const cow = this.#spawnWalker('moose', p.x, p.z, null);
        if (cow && (ctx.spring ?? 0) + (ctx.summer ?? 0) > 0.4 && rand() < 0.55) {
          cow.antlers = false;
          const herd = { kind: 'moose', goal: { x: p.x, z: p.z }, goalWait: rnd(15, 40), members: [cow], fear: null, fleeTime: 0 };
          cow.herd = herd;
          cow.offset = { x: 0, z: 0 };
          this.#addYoung(herd, 1, 0.5);
          this.herds.push(herd);
          home.herds.push(herd);
        }
        own(from);
      }
    }
    // Wild boar: a sounder rooting in the woods, with the piglets.
    for (let k = 0; k < 2; k++) {
      const p = at();
      if (p.y < ctx.seaLevel + 1) continue;
      const w = g.getBiomeWeights(p.x, p.z, {}), f = g.getForestDensity(p.x, p.z);
      if (w.temperate + w.smoky + (w.blackHills ?? 0) > 0.6 && f > 0.3 && g.getMountainness(p.x, p.z) < 0.5) {
        if (rand() < 0.1) {
          const from = this.animals.length;
          const herd = this.#group('boar', p, 2 + Math.floor(rand() * 4), rand() < 0.35);
          if (herd) {
            if (rand() < 0.6) this.#addYoung(herd, 2 + Math.floor(rand() * 3), 0.45);
            home.herds.push(herd);
          }
          own(from);
        }
        break;
      }
    }
    // A cougar, alone, in the mountains and the high woods.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {}), m = g.getMountainness(p.x, p.z);
      if (p.y > ctx.seaLevel + 1 && (m > 0.25 || w.smoky > 0.5 || (w.blackHills ?? 0) > 0.5) && w.desert < 0.3 && rand() < 0.045) {
        const from = this.animals.length;
        this.#spawnWalker('cougar', p.x, p.z, null);
        own(from);
      }
    }
    // Hares, in the open and the cold woods.
    if (rand() < 0.35) {
      for (let k = 0, n = 1 + Math.floor(rand() * 2); k < n; k++) {
        const p = at();
        const w = g.getBiomeWeights(p.x, p.z, {});
        if (p.y > ctx.seaLevel + 1 && w.pine + w.temperate * 0.8 > 0.5 && (g.getSeasonality(p.x, p.z) > 0.5 || g.getPlainness(p.x, p.z) > 0.3) && g.getForestDensity(p.x, p.z) < 0.6) {
          const from = this.animals.length;
          this.#spawnWalker('hare', p.x, p.z, null);
          own(from);
        }
      }
    }
    // Turkeys: a flock in the open woods.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {}), f = g.getForestDensity(p.x, p.z);
      if (p.y > ctx.seaLevel + 1 && w.temperate + w.smoky > 0.6 && f > 0.15 && f < 0.8 && g.getMountainness(p.x, p.z) < 0.45 && rand() < 0.1) {
        const from = this.animals.length;
        const herd = this.#group('turkey', p, 4 + Math.floor(rand() * 6), rand() < 0.2);
        if (herd) home.herds.push(herd);
        own(from);
      }
    }
    // Ducks, on still water (a pond, a lake: not the sea), but not in a hard winter.
    for (let k = 0; k < 5 && ctx.waterAt; k++) {
      const x = (cx + 0.05 + 0.9 * rand()) * C, z = (cz + 0.05 + 0.9 * rand()) * C;
      const w = ctx.waterAt(x, z);
      if (!w || (w.speed ?? 0) > 0.8 || g.getOceanness(x, z) > 0.4 || w.level - ctx.ground(x, z) < 0.4) continue;
      if (rand() < 0.35 && ctx.winter < 0.6) {
        const from = this.animals.length;
        const herd = { kind: 'duck', goal: { x, z }, goalWait: 1e9, members: [], fear: null, fleeTime: 0 };
        for (let n = 2 + Math.floor(rand() * 5), j = 0; j < n; j++) this.#spawnWalker('duck', x + rnd(-3, 3), z + rnd(-3, 3), herd, { water: true });
        if (herd.members.length) this.herds.push(herd), home.herds.push(herd);
        own(from);
      }
      break;
    }
    // A rattlesnake in the dry country (they sleep out the winter).
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && w.desert + w.savanna + w.volcanic * 0.5 > 0.5 && ctx.winter < 0.5 && rand() < 0.3) {
        const from = this.animals.length;
        this.#spawnSnake(p.x, p.z);
        own(from);
      }
    }
    return home;
  }


  #coastSpot(ctx) {
    const { camera, generator: g, seaLevel } = ctx;
    for (let k = 0; k < 10; k++) {
      const a = rnd(0, TAU), d = rnd(150, 380);
      const x = camera.position.x + Math.sin(a) * d, z = camera.position.z + Math.cos(a) * d;
      if (g.getBaseHeight(x, z) < seaLevel && g.getOceanness(x, z) > 0.5) return { x, z, y: seaLevel };
    }
    return null;
  }

  /**
   * A spot to land on crown `c` ([x, z, bottom, top, radius]): on its top,
   * found by looking down onto the tree itself (a crown is round, and a
   * spot out from the middle is lower than its top), or null. None in
   * winter, when the broad-leaved trees stand bare.
   */
  #perchOn(c, ctx) {
    if (ctx.winter > 0.5) return null;
    for (let k = 0; k < 4; k++) {
      const f = k === 3 ? 0 : 0.35;
      const x = c[0] + rnd(-f, f) * c[4], z = c[1] + rnd(-f, f) * c[4];
      const y = ctx.trees.topAt ? ctx.trees.topAt(x, z, c[3] + 3) : c[3];
      if (y !== null && y > c[2]) return { x, y: y + 0.02, z };
    }
    return null;
  }

  // Broad-leaved crowns (see TreeLayer.crowns) within `r` of you: [x, z, bottom, top, radius].
  #crownsNear(ctx, r) {
    const { camera, trees, chunkSize } = ctx;
    const out = [];
    const cx = Math.floor(camera.position.x / chunkSize), cz = Math.floor(camera.position.z / chunkSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = trees.crowns.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 5) {
          if (list[k + 3] - list[k + 2] < 2.5) continue; // (not the bushes)
          if (Math.hypot(list[k] - camera.position.x, list[k + 1] - camera.position.z) < r) out.push(list.slice(k, k + 5));
        }
      }
    }
    return out;
  }

  /**
   * A herd of `n` (or, `alone`, just the one: not all of them keep in herds:
   * an old buck or bull elk off by himself, a lone boar, a wolf without a
   * pack, a bison bull). Returns the herd (null for a loner).
   */
  #group(kind, s, n, alone) {
    if (!alone) return this.#spawnHerd(kind, s, n);
    const a = this.#spawnWalker(kind, s.x, s.z, null);
    if (a && (kind === 'deer' || kind === 'elk')) a.antlers = Math.random() < 0.75;
    if (a && kind === 'turkey') a.tom = true;
    return null;
  }

  #spawnHerd(kind, s, n) {
    const herd = { kind, goal: { x: s.x, z: s.z }, goalWait: rnd(15, 40), members: [], fear: null, fleeTime: 0 };
    for (let k = 0; k < n; k++) {
      const a = rnd(0, TAU), d = rnd(1, kind === 'bison' ? 16 : 9);
      this.#spawnWalker(kind, s.x + Math.sin(a) * d, s.z + Math.cos(a) * d, herd);
    }
    if (!herd.members.length) return null;
    this.herds.push(herd);
    return herd;
  }

  /**
   * A creature on foot at (x, z) (in `herd`, if any). `o.young`: a young
   * one, this size of a grown one, by `o.mother`; `o.water`: on the water
   * (a duck). Returns it (or null, if the spot won't do).
   */
  #spawnWalker(kind, x, z, herd, o = {}) {
    const sp = SPECIES[kind];
    let y = this.ctx.ground(x, z);
    if (o.water) {
      const w = this.ctx.waterAt?.(x, z);
      if (!w || w.level - y < 0.2) return null;
      y = w.level;
    } else {
      if (!(y > this.ctx.seaLevel + 0.5)) return null;
      if (this.#trueSlope(x, z, this.ctx) > sp.grade) return null; // (not on a slope too steep for it)
    }
    const spread = kind === 'bison' ? 12 : 7;
    const a = {
      kind, x, z, y, heading: rnd(0, TAU), pitch: 0, roll: 0, speed: 0,
      scale: (sp.size ?? 1) * (kind === 'bison' ? rnd(0.9, 1.1) : rnd(0.85, 1.1)) * (o.young ?? 1),
      alive: true, health: sp.health, state: 'graze', timer: rnd(2, 10), phase: rnd(0, TAU), headDown: 0,
      herd, offset: { x: rnd(-1, 1) * spread, z: rnd(-1, 1) * spread },
      antlers: (kind === 'deer' || kind === 'elk' || kind === 'moose') && !o.young && Math.random() < 0.45, fear: 0, home: { x, z },
      alertCool: rnd(0, 10), step: rnd(1, 6), stepHeading: 0, headYaw: 0, lie: 0, rear: 0, cycle: Math.random(), display: 0, crouch: 0,
      tom: kind === 'turkey' && Math.random() < 0.4, young: !!o.young, mother: o.mother ?? null,
      aggressive: !!sp.aggressive, // (for later: a grizzly will charge)
    };
    a.stepHeading = a.heading;
    this.animals.push(a);
    herd?.members.push(a);
    return a;
  }

  // The young of a herd (fawns, calves, piglets): each by a grown one.
  #addYoung(herd, n, size) {
    const mothers = herd.members.filter((m) => !m.young && !m.antlers);
    for (let k = 0; k < n && mothers.length; k++) {
      const mother = mothers[k % mothers.length];
      const y = this.#spawnWalker(herd.kind, mother.x + rnd(-1.5, 1.5), mother.z + rnd(-1.5, 1.5), herd, { young: size, mother });
      if (y) y.offset = { x: mother.offset.x + rnd(-1.5, 1.5), z: mother.offset.z + rnd(-1.5, 1.5) };
    }
  }

  // A snake at (x, z), basking.
  #spawnSnake(x, z) {
    const y = this.ctx.ground(x, z);
    if (!(y > this.ctx.seaLevel + 1)) return null;
    const heading = rnd(0, TAU);
    const a = {
      kind: 'snake', x, z, y, heading, base: heading, pitch: 0, roll: 0, speed: 0, scale: rnd(0.9, 1.25), alive: true, health: SPECIES.snake.health,
      state: 'bask', timer: rnd(5, 20), phase: rnd(0, TAU), fear: 0, deadTime: 0, coil: 0, headDown: 0,
      trail: Array.from({ length: 50 }, (_, k) => ({ x: x - Math.sin(heading) * k * 0.03, z: z - Math.cos(heading) * k * 0.03, y })),
    };
    this.animals.push(a);
    return a;
  }

  #spawnSongbird(at) {
    const a = {
      kind: 'songbird', x: at.x, y: at.y, z: at.z, heading: rnd(0, TAU), pitch: 0, roll: 0,
      scale: SPECIES.songbird.scale * rnd(0.85, 1.15), alive: true, health: SPECIES.songbird.health,
      state: 'perch', timer: rnd(3, 15), flap: 0, tint: SONGBIRD_TINTS[Math.floor(Math.random() * SONGBIRD_TINTS.length)],
    };
    this.animals.push(a);
    return a;
  }

  #spawnFlock(kind, s, n, to = null) {
    const g = this.ctx.generator;
    const flock = {
      kind, anchor: { x: s.x, z: s.z }, angle: rnd(0, TAU), radius: rnd(60, 110), alt: rnd(42, 60), // (well above the tallest trees)
      centre: { x: s.x, y: s.y + 50, z: s.z }, mode: to ? 'travel' : 'fly', timer: rnd(20, 45), to, birds: [], spin: Math.random() < 0.5 ? 1 : -1,
      groundY: g.getBaseHeight(s.x, s.z),
    };
    for (let k = 0; k < n; k++) {
      const sp = SPECIES[kind];
      const a = {
        kind, x: s.x + rnd(-8, 8), y: flock.centre.y + rnd(-3, 3), z: s.z + rnd(-8, 8), vx: 0, vy: 0, vz: 0,
        heading: 0, pitch: 0, roll: 0, scale: sp.scale * rnd(0.9, 1.1), alive: true, health: sp.health,
        flock, off: { a: rnd(0, TAU), r: rnd(2, 9), h: rnd(-2.5, 2.5), w: rnd(0.3, 0.8) }, flap: rnd(0, TAU), landed: false, state: 'fly',
      };
      flock.birds.push(a);
      this.animals.push(a);
    }
    this.flocks.push(flock);
  }

  #spawnCircler(kind, s) {
    const hawk = kind === 'hawk';
    const a = {
      kind, circling: true, centre: { x: s.x, z: s.z }, radius: hawk ? rnd(60, 120) : rnd(18, 50), angle: rnd(0, TAU), dir: Math.random() < 0.5 ? 1 : -1,
      alt: hawk ? rnd(90, 140) : rnd(10, 30), speed: hawk ? rnd(9, 12) : rnd(7, 10), x: s.x, y: 0, z: s.z,
      heading: 0, pitch: 0, roll: 0, scale: SPECIES[kind].scale * rnd(0.9, 1.1), alive: true, health: SPECIES[kind].health,
      flap: 0, flapping: 0, nextFlap: rnd(2, 8), nextCall: rnd(3, 20), groundY: s.y, state: 'fly',
    };
    this.animals.push(a);
  }

  // --- Behaviour ------------------------------------------------------------

  // Tree trunks and boulders within `reach` of (x, z): [x, z, radius, ...].
  #obstacles(x, z, reach, ctx, tall = 1.2) {
    const out = [];
    // (The thick of low leaves, and whatever you've built.)
    if (ctx.trees.leafObstacles) out.push(...ctx.trees.leafObstacles(x, z, reach, ctx.ground(x, z), tall));
    if (ctx.structures) out.push(...ctx.structures.obstacles(x, z, reach));
    const C = ctx.chunkSize, cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${cx + dx},${cz + dz}`;
        const trunks = ctx.trees.trunks.get(key);
        if (trunks) for (let k = 0; k < trunks.length; k += 3) {
          if (Math.abs(trunks[k] - x) < reach && Math.abs(trunks[k + 1] - z) < reach) out.push(trunks[k], trunks[k + 1], trunks[k + 2] + 0.15);
        }
        const rocks = ctx.rocks?.boulders.get(key);
        if (rocks) for (let k = 0; k < rocks.length; k += 7) {
          if (rocks[k + 4] < 0.35) continue; // (pebbles are stepped over)
          if (Math.abs(rocks[k] - x) < reach && Math.abs(rocks[k + 1] - z) < reach) out.push(rocks[k], rocks[k + 1], Math.max(rocks[k + 3], rocks[k + 5]) * 0.9);
        }
      }
    }
    return out;
  }

  /**
   * Water within 130 m of (x, z) for animals to drink at: { x, z } in the
   * water and { bx, bz } on the bank before it, or null.
   */
  #findWater(x, z, ctx) {
    for (const r of [15, 30, 50, 75, 100, 130]) {
      const turn = Math.random() * TAU;
      for (let k = 0; k < 16; k++) {
        const a = turn + (k / 16) * TAU;
        const wx = x + Math.sin(a) * r, wz = z + Math.cos(a) * r;
        if (!ctx.waterAt(wx, wz)) continue;
        // Back from the water to the bank.
        for (let b = 2; b < r; b += 2) {
          const bx = wx - Math.sin(a) * b, bz = wz - Math.cos(a) * b;
          if (!ctx.waterAt(bx, bz)) {
            const gx = bx - Math.sin(a) * 1.5, gz = bz - Math.cos(a) * 1.5;
            return { x: wx, z: wz, bx: gx, bz: gz };
          }
        }
        return null;
      }
    }
    return null;
  }

  /** How steep the ground is at (x, z): rise over run, the steepest way. */
  #slope(x, z, ctx) {
    const e = 1.5;
    const gx = ctx.ground(x + e, z) - ctx.ground(x - e, z), gz = ctx.ground(x, z + e) - ctx.ground(x, z - e);
    const s = Math.hypot(gx, gz) / (2 * e);
    return s === s ? s : 0;
  }

  /**
   * How steep the land truly is at (x, z) (from the terrain itself, not
   * the drawn surface, which far off is smoothed over: a canyon's wall
   * there looks like a gentle bank), the steeper of that and #slope.
   */
  #trueSlope(x, z, ctx) {
    const g = ctx.generator;
    const s = this.#slope(x, z, ctx);
    if (!g) return s;
    const e = 2;
    const gx = g.getHeight(x + e, z) - g.getHeight(x - e, z), gz = g.getHeight(x, z + e) - g.getHeight(x, z - e);
    const t = Math.hypot(gx, gz) / (2 * e);
    return t === t ? Math.max(s, t) : s;
  }

  #threat(a, ctx) {
    const c = ctx.camera.position;
    return { d: Math.hypot(a.x - c.x, a.z - c.z), d3: Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z), above: c.y - a.y };
  }

  #herd(herd, dt, ctx) {
    herd.fleeTime -= dt;
    if (herd.kind === 'duck') return; // (ducks keep to their water)
    herd.goalWait -= dt;
    // At dawn and at dusk the herd goes down to the water to drink, if
    // there's some within reach: to the bank, the members spread along it.
    const when = ctx.dawn > 0.3 ? 'dawn' : ctx.dusk > 0.3 ? 'dusk' : null;
    const lead = herd.members[0];
    if (when && herd.drank !== when && !herd.drinking && herd.fleeTime <= 0 && lead && ctx.waterAt) {
      herd.drank = when;
      const water = this.#findWater(lead.x, lead.z, ctx);
      if (water) {
        herd.drinking = { ...water, until: this.time + 75 };
        herd.goal = { x: water.bx, z: water.bz };
        for (const m of herd.members) m.drank = false;
      }
    }
    if (herd.drinking && (this.time > herd.drinking.until || herd.fleeTime > 0)) {
      herd.drinking = null;
      herd.goalWait = rnd(5, 15);
    }
    if (herd.drinking) herd.goalWait = Math.max(herd.goalWait, 1);
    // Wolves howl in the night, coyotes yip at dusk and after dark, near you.
    const call = SPECIES[herd.kind]?.call;
    if ((call === 'howl' || call === 'yip' || call === 'baa') && lead) {
      herd.callWait = (herd.callWait ?? rnd(10, 40)) - dt;
      const dark = call === 'howl' ? ctx.night : call === 'baa' ? 1 : Math.max(ctx.night, ctx.dusk);
      const d = Math.hypot(lead.x - ctx.camera.position.x, lead.z - ctx.camera.position.z);
      if (herd.callWait <= 0) {
        herd.callWait = rnd(25, 70);
        if (dark > 0.5 && d < 700 && herd.fleeTime <= 0) ctx.sound?.call(call, ctx.pan(lead.x, lead.z), Math.min(1, 0.25 + 0.75 * (1 - d / 700)));
      }
    }
    // The herd drifts to fresh grazing now and then.
    // (Not while most of it is lying down.)
    if (herd.goalWait <= 0 && herd.members.filter((m) => m.state === 'rest').length * 2 > herd.members.length) herd.goalWait = rnd(8, 20);
    if (herd.goalWait <= 0 && herd.fleeTime <= 0) {
      herd.goalWait = rnd(20, 50);
      const a = rnd(0, TAU), d = rnd(15, 45);
      const lead = herd.members[0];
      // (In the autumn the grazing herds drift south, in the spring back north.)
      const migrate = herd.kind === 'deer' || herd.kind === 'bison' || herd.kind === 'sheep' ? ((ctx.autumn ?? 0) - (ctx.spring ?? 0)) * 30 : 0;
      if (lead) herd.goal = { x: lead.x + Math.sin(a) * d, z: lead.z + Math.cos(a) * d + migrate };
      if (herd.den && lead) herd.goal = { x: herd.den.x + rnd(-12, 12), z: herd.den.z + rnd(-12, 12) }; // (a pack keeps near its den)
    }
    // Where it is (its middle): the members keep together.
    let x = 0, z = 0;
    for (const m of herd.members) (x += m.x), (z += m.z);
    herd.mid = { x: x / herd.members.length, z: z / herd.members.length };
  }

  /**
   * What the ground at (x, z) is to a creature: 0 no way (the sea, a cliff,
   * a lake too deep for one that won't swim), 1 land (or water shallow
   * enough to wade), 2 water it must swim.
   */
  #footing(a, sp, x, z, ctx) {
    const y = ctx.ground(x, z);
    if (!(y === y)) return 0;
    const w = ctx.waterAt?.(x, z);
    const depth = w ? w.level - y : ctx.seaLevel - y;
    if (!w && y > ctx.seaLevel + 0.3) return 1;
    if (depth < (sp.height ?? 1) * a.scale * 0.35) return 1;
    return sp.swims ? 2 : 0;
  }

  /**
   * Which way to run from `from`: of sixteen ways round, the one most
   * nearly away that's open ground for a good way on (not into the water,
   * or up a cliff; a swimmer takes to the water if it must), keeping to the
   * way it's already going where it can. Chosen for the herd as one, and
   * looked at again twice a second (not every step, so none turn in circles
   * at the shore).
   */
  #escape(a, sp, from, ctx) {
    const holder = a.herd ?? a;
    if (holder.escape !== undefined && this.time < (holder.escapeAt ?? 0)) return holder.escape;
    const o = a.herd?.mid ?? a;
    const away = Math.atan2(o.x - from.x, o.z - from.z);
    let best = away, bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const h = away + (k / 16) * TAU;
      const off = Math.abs(angleTo(away, h));
      if (off > 2.3) continue; // (never back towards you)
      let score = Math.cos(off) * 3, clear = 0, wet = 0, y0 = ctx.ground(o.x, o.z), last = 0;
      for (const d of [4, 9, 15, 23, 32]) {
        const x = o.x + Math.sin(h) * d, z = o.z + Math.cos(h) * d;
        const kind = this.#footing(a, sp, x, z, ctx);
        if (!kind) break;
        const y = ctx.ground(x, z);
        if (Math.abs(y - y0) > sp.grade * (d - last) * 1.4) break;
        y0 = y;
        last = d;
        if (kind === 2) wet++;
        clear++;
      }
      score += clear * 1.6 - wet * 1.1 - (clear < 2 ? 6 : 0);
      if (holder.escape !== undefined) score += Math.cos(angleTo(holder.escape, h)) * 1.4;
      if (score > bestScore) (bestScore = score), (best = h);
    }
    holder.escape = best;
    holder.escapeAt = this.time + 0.5;
    return best;
  }

  #walker(a, dt, ctx) {
    const sp = SPECIES[a.kind];
    a.jolt && (a.jolt.t -= dt) <= 0 && (a.jolt = null);
    if (a.down && a.alive) {
      // Down, on its side, struggling, not getting up.
      a.speed = 0;
      a.feet = null;
      a.struggle = (a.struggle ?? 0) + dt;
      a.roll += (a.side * Math.PI * 0.45 - a.roll) * Math.min(1, dt * 4);
      a.headDown += (Math.sin(a.struggle * 2.1) * 0.5 - a.headDown) * Math.min(1, dt * 3);
      return;
    }
    if (a.hibernating && a.alive) {
      // Asleep in its den for the winter, till something wakes it: you
      // coming close, running near, a blow.
      a.lie = 1;
      a.state = 'rest';
      a.speed = 0;
      const p = ctx.player, c = ctx.camera.position;
      const d = Math.hypot(a.x - c.x, a.z - c.z);
      if (!ctx.tame && p?.mode === 'walk' && (d < 7 || (p.sprint && d < 20) || a.hits)) this.#enrage(a);
      const y = ctx.ground(a.x, a.z);
      if (y === y) a.y = y;
      return;
    }
    if (!a.alive) {
      // Down on its side, where it fell (or dragged off by a scavenger).
      a.deadTime += dt;
      a.speed = 0;
      a.feet = null;
      a.roll += (a.side * Math.PI * 0.5 - a.roll) * Math.min(1, dt * 5);
      const y = ctx.ground(a.x, a.z);
      if (y === y) a.y = y;
      return;
    }
    if (sp.water) return this.#duck(a, sp, dt, ctx);
    const herd = a.herd;
    const t = this.#threat(a, ctx);
    // How much of a threat you are: running at them, much; walking, some;
    // keeping low and moving slowly, little (and less still standing still
    // crouched). Too close for that (on the ground, or flying low over
    // them): they bolt.
    const p = ctx.player, onFoot = p && p.mode === 'walk' && p.alive;
    const stance = !onFoot ? 1 : p.crouch ? (p.moving ? 0.45 : 0.3) : p.sprint ? 1.5 : p.moving ? 1 : 0.6;
    const reach = sp.flee * stance * (t.above > 25 ? 0.5 : 1) * (onFoot ? this.#scent(a, ctx) : 1);
    if (sp.predator?.ambush) this.#ambush(a, sp, t, dt, ctx);
    else if (sp.predator && !a.young) this.#stalk(a, sp, t, dt, ctx);
    // Too close to one that stands up for itself (nearer in the rut, or by its young): it charges.
    const ch = sp.charger;
    a.chargeCool = Math.max(0, (a.chargeCool ?? 0) - dt);
    if (ch && onFoot && !ctx.tame && !a.lame && !a.young && !(a.charging > 0)) {
      const rut = ch.rut && ctx.autumn > 0.35 && (a.antlers || a.kind === 'moose' || a.kind === 'bison') ? ch.rut : 0;
      const young = ch.young && herd?.members.some((m) => m.young && m.alive) ? ch.young * (0.6 + 0.4 * (ctx.spring ?? 0)) : 0;
      if (t.d < Math.max(ch.close, rut, young) * (p.crouch ? 0.7 : 1)) this.#charge(a);
    }
    // Sheep come to you if you've wheat in your hand; follow you a while and
    // they're yours (tame: they stay where you leave them, and don't run).
    const lured = a.kind === 'sheep' && onFoot && p.lure && t.d < 16;
    if (lured) {
      a.fear = 0;
      a.followed = (a.followed ?? 0) + dt;
      if (!a.tame && a.followed > 4) this.#tame(a);
    }
    if (!ctx.tame && !a.tame && !lured && !a.hunting && !(a.charging > 0) && !a.stalking && t.d < reach && t.above < 50) {
      if (herd) {
        if (herd.fleeTime <= 0 && a.kind === 'bison') ctx.sound?.call('grunt', ctx.pan(a.x, a.z), 0.6);
        if (herd.fleeTime <= 0 && (a.kind === 'deer' || a.kind === 'elk')) ctx.sound?.call('snort', ctx.pan(a.x, a.z), 0.5);
        if (herd.fleeTime <= 0 && a.kind === 'turkey') ctx.sound?.call('gobble', ctx.pan(a.x, a.z), 0.5);
        if (herd.fleeTime <= 0 && a.kind === 'boar') ctx.sound?.call('oink', ctx.pan(a.x, a.z), 0.6);
        this.#alarm(herd, ctx.camera.position.x, ctx.camera.position.z);
      } else a.fear = 3;
      if (a.scavenge) this.#dropKill(a);
    }
    a.fear = Math.max(0, a.fear - dt);
    const fleeing = !a.hunting && !(a.charging > 0) && (herd ? herd.fleeTime > 0 : a.fear > 0);
    let want = a.heading, speed = 0;
    if (a.leap) {
      // Springing through the air at you (a cougar).
      const L = a.leap;
      L.t += dt;
      L.vy -= 9.8 * dt;
      a.x += L.vx * dt;
      a.z += L.vz * dt;
      a.air = Math.max(0, (a.air ?? 0) + L.vy * dt);
      a.pitch = -0.3;
      const land = L.t > 0.2 && a.air <= 0;
      if (land || L.t > 1.2) {
        a.leap = null;
        a.air = 0;
        if (t.d < 2.4 && p?.alive) p.damage(sp.predator.bite * 1.4, a.kind, a);
        a.attackCd = 1;
      }
      const y = ctx.ground(a.x, a.z);
      if (y === y) a.y = y + (a.air ?? 0);
      a.feet = null;
      return;
    }
    if (a.charging > 0) {
      // Charging you, head down: a hit, and it's done.
      a.charging -= dt;
      want = Math.atan2(p.x - a.x, p.z - a.z);
      speed = sp.run * 0.85;
      a.state = 'charge';
      if (t.d < ch.reach + sp.radius * a.scale && Math.abs(p.y - 1.2 - a.y) < 2.5 && onFoot) {
        p.damage(ch.hit * rnd(0.8, 1.2), a.kind, a);
        a.charging = 0;
      }
      if (!onFoot || t.d > 40) a.charging = 0;
      if (a.charging <= 0) {
        a.chargeCool = rnd(15, 30);
        a.fear = 5;
        if (herd) this.#alarm(herd, p.x, p.z);
      }
    } else if (a.hunting) {
      // Hunting you: running you down (a pack spreading out to come at you
      // from either side), then biting or swiping when in reach.
      const pr = sp.predator;
      let tx = p.x, tz = p.z;
      if (herd && t.d > 6) {
        const side = (a.offset.x >= 0 ? 1 : -1) * Math.min(1, (t.d - 6) / 15) * 6;
        const ux = (p.x - a.x) / t.d, uz = (p.z - a.z) / t.d;
        tx += -uz * side;
        tz += ux * side;
      }
      want = Math.atan2(tx - a.x, tz - a.z);
      const inReach = pr.reach + sp.radius * a.scale;
      speed = t.d > inReach ? sp.run * (t.d > 25 ? 0.95 : 0.8) : 0;
      a.state = 'hunt';
      a.attackCd = (a.attackCd ?? 0) - dt;
      a.growl = (a.growl ?? rnd(2, 6)) - dt;
      if (a.growl <= 0) {
        a.growl = rnd(4, 9);
        ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : a.kind === 'cougar' ? 'hiss' : 'growl', ctx.pan(a.x, a.z), Math.min(0.7, 12 / (t.d + 6)));
      }
      if (t.d <= inReach + 0.35 && Math.abs(p.y - 1.2 - a.y) < 2.5 && a.attackCd <= 0) {
        a.attackCd = pr.every * rnd(0.85, 1.2);
        a.lunge = 0.35;
        p.damage(pr.bite * rnd(0.8, 1.2), a.kind, a);
      }
    } else if (fleeing) {
      // Running from you: the way that's open (see #escape), with the herd.
      const from = herd?.fear ?? ctx.camera.position;
      want = this.#escape(a, sp, from, ctx);
      if (herd?.mid) {
        // (Keeping with the herd as it runs.)
        const toMid = Math.atan2(herd.mid.x - a.x, herd.mid.z - a.z);
        if (Math.hypot(herd.mid.x - a.x, herd.mid.z - a.z) > 12) want += angleTo(want, toMid) * 0.35;
      }
      if (a.kind === 'rabbit' || a.kind === 'hare') want += Math.sin(this.time * 3 + a.phase) * 0.6; // zig-zag
      speed = sp.run * (a.young ? 0.85 : 1);
      a.state = 'flee';
      a.detour = null;
      if (t.d > sp.calm && herd) herd.fleeTime = Math.min(herd.fleeTime, 0.5);
    } else if (lured) {
      want = Math.atan2(p.x - a.x, p.z - a.z);
      speed = t.d > 2.6 ? sp.walk * (t.d > 7 ? 2 : 1.3) : 0;
      a.state = speed ? 'walk' : 'look';
      a.timer = rnd(2, 5);
      if (a.tame) a.home = { x: a.x, z: a.z };
    } else if (a.scavenge && this.#scavenging(a, sp, t, ctx)) {
      want = a.scavengeWant;
      speed = a.scavengeSpeed;
    } else if (a.raid && this.#raiding(a, sp, t, ctx)) {
      want = a.raidWant;
      speed = a.raidSpeed;
    } else {
      a.timer -= dt;
      // (Going to drink, they bunch up along the bank.)
      const spread = herd?.drinking ? 0.35 : 1;
      const goal = herd ? { x: herd.goal.x + a.offset.x * spread, z: herd.goal.z + a.offset.z * spread } : a.goal ?? a.home;
      const far = Math.hypot(goal.x - a.x, goal.z - a.z);
      // Safe again: it stops and looks back the way it came.
      if (a.state === 'flee') (a.state = 'alert'), (a.timer = rnd(3, 6)), (a.alertCool = rnd(10, 20));
      if (a.state === 'charge' || a.state === 'hunt' || a.state === 'stalk' || a.state === 'wary' || a.state === 'freeze') (a.state = 'walk'), (a.timer = rnd(2, 5));
      // You coming near catch its eye: it stops, head up, and watches you
      // a while (a rabbit sits up), then goes back to what it was doing.
      a.alertCool = Math.max(0, a.alertCool - dt);
      if (t.d < sp.flee * (ctx.tame ? 1.3 : 1.8) && a.alertCool <= 0 && a.state !== 'alert' && a.state !== 'rest') {
        a.state = 'alert';
        a.timer = rnd(2.5, 6);
        a.alertCool = rnd(15, 35);
      }
      if (a.timer <= 0) {
        if (a.state === 'graze') {
          // After grazing a while: wander on a few steps (on to the herd's
          // grazing if it's moved off), lift its head to look about, or lie
          // down to rest (more in the heat of the day and at night; at dawn
          // and dusk they're up and about).
          const lull = a.kind === 'rabbit' || a.kind === 'hare' || sp.biped ? 0 : Math.min(0.55, 0.08 + 0.35 * ctx.night + 0.15 * ctx.day * (1 - ctx.dawn - ctx.dusk));
          const r = Math.random();
          if (r < lull && far < 16) (a.state = 'rest'), (a.timer = rnd(25, 80));
          else if (r < lull + 0.2) (a.state = 'look'), (a.timer = rnd(2, 5));
          else (a.state = 'walk'), (a.timer = far > 6 ? rnd(6, 14) : rnd(2, 5));
        } else (a.state = 'graze'), (a.timer = rnd(4, 14));
        const roam = a.tame ? 4 : 15;
        if (!herd && a.state === 'walk') a.goal = { x: a.home.x + rnd(-roam, roam), z: a.home.z + rnd(-roam, roam) };
        // (Which way to wander, set once: not turning on the spot.)
        a.wanderHeading = a.heading + rnd(-0.8, 0.8);
      }
      // A resting one gets up as the herd moves off.
      if (a.state === 'rest' && (far > 22 || herd?.drinking)) (a.state = 'walk'), (a.timer = rnd(6, 12));
      // At the water: down to drink.
      if (herd?.drinking && !a.drank && far < 4 && a.state !== 'alert') {
        a.drank = true;
        a.state = 'drink';
        a.timer = rnd(8, 20);
      }
      if (herd?.drinking && !a.drank && a.state !== 'alert' && a.state !== 'drink' && far > 4) (a.state = 'walk'), (a.timer = Math.max(a.timer, 3));
      if (a.state === 'walk') {
        want = far > 3 ? Math.atan2(goal.x - a.x, goal.z - a.z) : a.wanderHeading ?? a.heading;
        speed = sp.walk * (far > 25 ? 1.6 : 1);
        // A rabbit goes in bursts: a few hops, a pause, a few more.
        if (a.kind === 'rabbit' || a.kind === 'hare') speed = (this.time + a.phase * 0.3) % 1.7 < 0.8 ? sp.walk * 1.8 : 0;
      } else if (a.state === 'graze') {
        // Grazing, it steps slowly along now and then, nose down (a bear,
        // foraging, is always on the move).
        a.step -= dt;
        if (a.step <= 0) {
          want = a.stepHeading;
          speed = sp.walk * (sp.forager ? 0.5 : 0.3);
          if (a.step < -rnd(0.8, 1.6)) (a.step = sp.forager ? rnd(1, 3) : rnd(3, 9)), (a.stepHeading = a.heading + rnd(-0.6, 0.6));
        }
      } else if (a.state === 'drink' && herd?.drinking) {
        // (Turning to face the water.)
        const off = angleTo(a.heading, Math.atan2(herd.drinking.x - a.x, herd.drinking.z - a.z));
        if (Math.abs(off) > 0.3) want = a.heading + off;
      } else if (a.state === 'alert') {
        // Turning to face you if you're round behind it.
        const c = ctx.camera.position;
        const off = angleTo(a.heading, Math.atan2(c.x - a.x, c.z - a.z));
        if (Math.abs(off) > 1.1) want = a.heading + off - Math.sign(off) * 0.9;
      }
      // The young keep close by their mothers.
      if (a.young && a.mother?.alive && Math.hypot(a.mother.x - a.x, a.mother.z - a.z) > 4) {
        want = Math.atan2(a.mother.x - a.x, a.mother.z - a.z);
        speed = Math.max(speed, sp.walk * 1.4);
        if (a.state === 'rest') a.state = 'walk';
      }
      // However slowly you come, right up close it always backs away.
      const close = Math.max(3.5, sp.radius * a.scale * 3 + 2.5);
      if (onFoot && !ctx.tame && !a.tame && t.d < close && !sp.predator) {
        want = Math.atan2(a.x - p.x, a.z - p.z);
        speed = sp.walk * 1.8;
        if (a.state === 'rest' || a.state === 'graze' || a.state === 'drink') (a.state = 'walk'), (a.timer = rnd(2, 4));
      }
    }
    // Stalking you: a wolf or a bear coming on, slowly, head low; a cougar
    // creeping in low behind you, freezing when you look.
    a.crouch = (a.crouch ?? 0) + ((a.stalking && sp.predator?.ambush ? 1 : 0) - (a.crouch ?? 0)) * Math.min(1, dt * 3);
    if (a.stalking && !a.hunting && !fleeing) {
      want = Math.atan2(p.x - a.x, p.z - a.z);
      if (sp.predator.ambush) {
        speed = a.seen ? 0 : t.d > 3 ? sp.walk * 1.1 : 0;
        a.state = a.seen ? 'freeze' : 'stalk';
        // (Round behind you, not straight at you.)
        if (!a.seen && t.d > 12) want += angleTo(want, Math.atan2(-ctx.forward.x, -ctx.forward.z) + Math.PI) * 0.3;
      } else {
        speed = t.d > 8 ? sp.walk * 1.2 : 0;
        a.state = 'stalk';
      }
    }
    // Fire: the hunters won't come into its light (a campfire, a torch held
    // up): they keep off at its edge, pacing, growling.
    if ((a.hunting || a.stalking || a.raid) && !ctx.tame) {
      const fire = this.#fireAt(p.x, p.z, ctx, 1.5) ?? (a.raid ? this.#fireAt(a.raid.x, a.raid.z, ctx, 1) : null);
      if (fire) {
        const d = Math.hypot(a.x - fire.x, a.z - fire.z), out = Math.atan2(a.x - fire.x, a.z - fire.z);
        if (d < fire.r + 2) (want = out), (speed = sp.walk * 1.6);
        else if (d < fire.r + 6) (want = out + (a.offset?.x >= 0 ? 1 : -1) * Math.PI / 2), (speed = sp.walk * 0.8);
        a.state = 'wary';
        a.wary = (a.wary ?? 0) + dt;
        if ((a.growlWary = (a.growlWary ?? rnd(2, 5)) - dt) <= 0) (a.growlWary = rnd(4, 9)), ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : 'growl', ctx.pan(a.x, a.z), Math.min(0.6, 10 / (t.d + 5)));
        // (In the end it gives up and goes.)
        if (a.wary > 40) {
          a.wary = 0;
          a.hunting = a.stalking = false;
          a.notice = 0;
          if (a.herd) a.herd.hunting = false;
          if (a.raid) (a.raid = null), (a.raidCool = 400);
          a.fear = 6;
        }
      } else a.wary = Math.max(0, (a.wary ?? 0) - dt * 0.2);
    }
    // Lame: it can only hobble.
    if (a.lame) speed *= 0.45;
    // Wounded, it leaves a trail of blood.
    if ((a.hits || a.lame) && a.speed > 0.3) {
      a.bled = (a.bled ?? 0) + a.speed * dt;
      if (a.bled > 1.2) (a.bled = 0), ctx.bleed?.(a.x + rnd(-0.2, 0.2), a.z + rnd(-0.2, 0.2), a.lame ? 1 : 0.6);
    }
    // Where it looks: at you when alert, about it when looking round, a
    // little from side to side as it grazes, and the way it's turning.
    let yaw = 0;
    if (!fleeing && (a.state === 'alert' || a.state === 'freeze' || a.state === 'stalk' || a.state === 'wary')) {
      const c = ctx.camera.position;
      yaw = Math.max(-1.1, Math.min(1.1, angleTo(a.heading, Math.atan2(c.x - a.x, c.z - a.z))));
    } else if (a.state === 'look') yaw = Math.sin(this.time * 0.8 + a.phase) * 0.9;
    else if (a.state === 'graze') yaw = Math.sin(this.time * 0.7 + a.phase) * 0.15;
    else yaw = Math.max(-0.5, Math.min(0.5, angleTo(a.heading, want) * 0.7));
    a.headYaw += (yaw - a.headYaw) * Math.min(1, dt * 3);
    // Lying down (and getting up again before it moves off).
    a.lie += ((a.state === 'rest' && !fleeing ? 1 : 0) - a.lie) * Math.min(1, dt * (fleeing ? 4 : 0.9));
    speed *= 1 - smoothstep(0.1, 0.5, a.lie);
    a.rear += (((a.kind === 'rabbit' || a.kind === 'hare') && a.state === 'alert' && !fleeing ? 1 : 0) - a.rear) * Math.min(1, dt * 5);
    // A tom turkey shows off his fan in the spring.
    a.display += ((a.kind === 'turkey' && a.tom && (ctx.spring ?? 0) > 0.3 && !fleeing && (a.state === 'graze' || a.state === 'look') ? 1 : 0) - (a.display ?? 0)) * Math.min(1, dt * 2) || 0;
    // A herd keeps its spacing: none stands right on top of another.
    if (herd) {
      for (const m of herd.members) {
        if (m === a || !m.alive) continue;
        const dx = a.x - m.x, dz = a.z - m.z, d = Math.hypot(dx, dz), r = (sp.radius * a.scale + SPECIES[m.kind].radius * m.scale) * 1.6;
        if (d > 0 && d < r) (a.x += (dx / d) * (r - d) * Math.min(1, dt * 1.5)), (a.z += (dz / d) * (r - d) * Math.min(1, dt * 1.5));
      }
    }
    // Standing on ground too steep for it (the land built in under it):
    // off it, the way down.
    a.slopeCheck = (a.slopeCheck ?? Math.random()) - dt;
    if (a.slopeCheck <= 0 && !fleeing) {
      a.slopeCheck = 1;
      a.onSteep = this.#trueSlope(a.x, a.z, ctx) > sp.grade * 1.1;
      if (a.onSteep) {
        const e = 1.5, gx = ctx.ground(a.x + e, a.z) - ctx.ground(a.x - e, a.z), gz = ctx.ground(a.x, a.z + e) - ctx.ground(a.x, a.z - e);
        a.detour = { heading: Math.atan2(-gx, -gz), time: 2.5 };
        if (a.state !== 'walk') (a.state = 'walk'), (a.timer = rnd(3, 6));
      }
    }
    if (a.detour && !fleeing && speed === 0 && a.lie < 0.1) speed = sp.walk; // (walking off it)
    // A detour round water or a cliff ahead: a steady turn one way for a while.
    if (a.detour) {
      a.detour.time -= dt;
      want = a.detour.heading;
      if (a.detour.time <= 0) a.detour = null;
    }
    // Steering round the tree trunks and boulders ahead, before it reaches them.
    const body = sp.height * a.scale * 0.6, me = sp.radius * a.scale;
    if (speed > 0) {
      const look = body + 1 + a.speed * 0.8;
      const fx = Math.sin(want), fz = Math.cos(want);
      const obs = this.#obstacles(a.x, a.z, look + 2, ctx, sp.height * a.scale * 0.8);
      let steer = 0;
      for (let k = 0; k < obs.length; k += 3) {
        const ox = obs[k] - a.x, oz = obs[k + 1] - a.z, r = obs[k + 2] + me + 0.3;
        const along = ox * fx + oz * fz;
        if (along < -0.5 || along > look + r) continue;
        const side = ox * fz - oz * fx; // (+: the obstacle's to the right)
        if (Math.abs(side) > r) continue;
        steer += (side >= 0 ? -1 : 1) * (1 - Math.max(0, along) / (look + r)) * (1.2 - Math.abs(side) / r);
      }
      want += Math.max(-1.3, Math.min(1.3, steer));
    }
    // Turn (slowly from a standstill, as it sets off; not spinning on the
    // spot), speed up or slow down.
    const urgent = fleeing || a.hunting || a.charging > 0;
    const rate = sp.turn * (urgent ? 1.5 : 1) * (urgent ? 1 : 0.3 + 0.7 * Math.min(1, a.speed / sp.walk));
    a.heading += Math.max(-rate * dt, Math.min(rate * dt, angleTo(a.heading, want)));
    // (Slowing to take a sharp turn.)
    const sharp = Math.abs(angleTo(a.heading, want));
    a.speed += (speed * (1 - 0.6 * smoothstep(0.6, 1.6, sharp)) - a.speed) * Math.min(1, dt * (urgent ? 3 : a.kind === 'rabbit' || a.kind === 'hare' ? 8 : 1.5));
    // Its gait, for its speed, and the body's rhythm with the legs: it
    // surges on with each push, not gliding.
    a.gait = chooseGait(a, sp, a.speed);
    a.strideLen = strideLength(sp, a.scale, a.gait, Math.max(a.speed, sp.walk * 0.6));
    a.rh = rhythm(a.gait, a.cycle ?? 0, smoothstep(0.03, sp.walk * 0.5, a.speed));
    // Step, over ground it can go on (not into the water, or off a cliff;
    // one that swims, into the water when it must).
    let moved = 0;
    const swimming = a.swimming;
    if (a.speed > 0.01) {
      const go = a.speed * a.rh.surge * (swimming ? 0.4 : 1);
      const sx = Math.sin(a.heading), sz = Math.cos(a.heading);
      const nx = a.x + sx * go * dt, nz = a.z + sz * go * dt;
      const probe = ctx.ground(a.x + sx * (body + 1.5), a.z + sz * (body + 1.5));
      const kind = this.#footing(a, sp, nx, nz, ctx), ahead = this.#footing(a, sp, a.x + sx * (body + 1.5), a.z + sz * (body + 1.5), ctx);
      const wet = kind === 2 || ahead === 2;
      // (Not onto ground steeper than it takes; one already on such a slope
      // only makes its way down off it.)
      // (The true lie of the land ahead, a few times a second.)
      a.aheadCheck = (a.aheadCheck ?? Math.random() * 0.3) - dt;
      if (a.aheadCheck <= 0) {
        a.aheadCheck = 0.3;
        a.aheadSteep = this.#trueSlope(a.x + sx * (body + 1.5), a.z + sz * (body + 1.5), ctx) > sp.grade * 1.2;
      }
      const steep = !swimming && (a.onSteep ? probe > a.y - 0.05 : Math.abs(probe - a.y) > sp.grade * (body + 1.5) || this.#slope(nx, nz, ctx) > sp.grade * 1.2 || a.aheadSteep);
      const blocked = !kind || !ahead || (steep && !wet) || (wet && !(fleeing || swimming || a.hunting));
      if (blocked) {
        if (fleeing) (a.herd ?? a).escapeAt = 0; // (another way, then)
        else if (!a.detour) a.detour = { heading: a.heading + (Math.random() < 0.5 ? 1 : -1) * rnd(1.4, 2.2), time: rnd(1.5, 3) };
        a.speed *= Math.max(0, 1 - dt * 3);
        if (herd && herd.fleeTime <= 0 && !fleeing) herd.goal = { x: a.x - sx * 20, z: a.z - sz * 20 };
      } else {
        moved = Math.hypot(nx - a.x, nz - a.z);
        a.x = nx;
        a.z = nz;
      }
    }
    a.cycle = (a.cycle ?? Math.random()) + moved / a.strideLen;
    a.phase += (moved / sp.stride) * TAU;
    // Never inside a trunk or a boulder (its middle, nor its chest).
    for (const reach of [0, body * 0.7]) {
      const px = a.x + Math.sin(a.heading) * reach, pz = a.z + Math.cos(a.heading) * reach;
      const obs = this.#obstacles(px, pz, me + 3, ctx, sp.height * a.scale * 0.8);
      for (let k = 0; k < obs.length; k += 3) {
        const ox = px - obs[k], oz = pz - obs[k + 1], r = obs[k + 2] + me * (reach ? 0.6 : 1), d = Math.hypot(ox, oz);
        if (d >= r || d === 0) continue;
        a.x += (ox / d) * (r - d);
        a.z += (oz / d) * (r - d);
      }
    }
    const y = ctx.ground(a.x, a.z);
    if (y === y) a.y = y;
    const c0 = ctx.camera.position;
    // In deep water: swimming, low in it, only its back and head out.
    const w = sp.swims ? ctx.waterAt?.(a.x, a.z) : null;
    const H = this.rigs[a.kind].model.legs[0][1] * a.scale;
    a.swimming = !!w && w.level - a.y > H * 0.8;
    if (a.swimming) {
      a.y = w.level - H * 1.2;
      a.feet = null;
      if ((a.swash = (a.swash ?? 0) - dt) <= 0) {
        a.swash = 0.5;
        ctx.splash?.(a.x, w.level, a.z, a.scale);
        if (Math.hypot(a.x - c0.x, a.z - c0.z) < 40) ctx.sound?.call('splash', ctx.pan(a.x, a.z), 0.4);
      }
    }
    // Leaning with the slope (a little: on a slope an animal keeps its body
    // near level, its legs reaching down the slope or folding up it).
    const sx = Math.sin(a.heading), sz = Math.cos(a.heading), L = sp.height * 0.5 * a.scale / (sp.size ?? 1);
    const up = ctx.ground(a.x + sx * L, a.z + sz * L), down = ctx.ground(a.x - sx * L, a.z - sz * L);
    if (up === up && down === down && !a.swimming) a.pitch += (-Math.atan2(up - down, 2 * L) * 0.55 - a.pitch) * Math.min(1, dt * 6);
    // Its feet, put down one after another on the ground, near you (see Gait.js).
    const c = ctx.camera.position, near = Math.abs(a.x - c.x) < 150 && Math.abs(a.z - c.z) < 150;
    if (near && !a.swimming && a.lie < 0.5) {
      const landed = a.feet?.map((f) => f.up);
      stepFeet(a, sp, this.rigs[a.kind].model, dt, moved, ctx.ground);
      // Its footfalls: prints in the snow, sand and mud; splashes through the water.
      if (landed && ctx.step && Math.abs(a.x - c.x) < 70 && Math.abs(a.z - c.z) < 70) {
        a.feet.forEach((f, k) => {
          if (landed[k] && !f.up && k % 2 === (a.printSide = 1 - (a.printSide ?? 0))) ctx.step(a, f.x, f.z, a.speed > sp.walk * 2);
        });
      }
    } else a.feet = null;
    // Head down to graze, up when alarmed.
    a.lunge = Math.max(0, (a.lunge ?? 0) - dt);
    const headWant = a.lunge > 0 ? 0.55 : a.state === 'charge' ? 0.7 : fleeing ? -0.15 : { graze: 1, drink: 1.15, alert: -0.25, look: -0.05, rest: 0.35, hunt: 0.15, stalk: 0.45, freeze: 0.3, wary: 0.2 }[a.state] ?? 0.1;
    a.headDown += (headWant - a.headDown) * Math.min(1, dt * 3);
    // (Their calls: an elk bugling in the autumn, turkeys gobbling in the
    // spring mornings, a cougar's scream in the night, boar grunting.)
    this.#calls(a, sp, t, dt, ctx);
  }

  #calls(a, sp, t, dt, ctx) {
    if (!sp.call || a.herd?.members[0] !== a && a.herd && sp.call !== 'oink') return;
    a.callWait = (a.callWait ?? rnd(10, 40)) - dt;
    if (a.callWait > 0) return;
    a.callWait = rnd(20, 60);
    const d = t.d;
    const when = {
      bugle: (ctx.autumn ?? 0) > 0.35 && a.antlers ? Math.max(ctx.dawn, ctx.dusk, ctx.night * 0.6, 0.3) : 0,
      gobble: (ctx.spring ?? 0) > 0.3 && a.tom ? Math.max(ctx.dawn, 0.4) : 0.1,
      scream: a.kind === 'cougar' ? ctx.night * 0.5 : 0,
      oink: a.state === 'graze' ? 0.6 : 0,
    }[sp.call] ?? 0;
    if (Math.random() < when && d < 600) ctx.sound?.call(sp.call, ctx.pan(a.x, a.z), Math.min(1, 0.2 + 0.8 * (1 - d / 600)));
  }

  // A scavenger at a kill: to it; then dragging it off, away from you, to
  // eat (or dropping it and running, if you come near). Returns whether
  // it's busy with it (setting the way to go and how fast).
  #scavenging(a, sp, t, ctx) {
    const kill = a.scavenge;
    if (!kill || kill.gone || kill.alive) return this.#dropKill(a), false;
    const d = Math.hypot(kill.x - a.x, kill.z - a.z);
    const c = ctx.camera.position;
    if (Math.hypot(kill.x - c.x, kill.z - c.z) < 22) return this.#dropKill(a), (a.fear = 4), false;
    if (!a.dragging) {
      a.scavengeWant = Math.atan2(kill.x - a.x, kill.z - a.z);
      a.scavengeSpeed = d > 20 ? sp.walk * 2.2 : sp.walk;
      a.state = 'walk';
      if (d < 1.2 + sp.radius * a.scale) {
        a.dragging = true;
        a.dragFrom = { x: kill.x, z: kill.z };
        a.dragTime = 0;
        ctx.sound?.call('growl', ctx.pan(a.x, a.z), 0.3);
      }
      return true;
    }
    // Dragging it: backwards, away from you, the kill in its jaws.
    a.dragTime += 1 / 60;
    const away = Math.atan2(a.x - c.x, a.z - c.z);
    a.scavengeWant = away;
    a.scavengeSpeed = sp.walk * (HEAVY.has(kill.kind) ? 0 : 0.8);
    a.state = 'walk';
    const mouth = (this.rigs[a.kind].model.headPivot[2] + 0.35) * a.scale;
    if (!HEAVY.has(kill.kind)) {
      kill.x = a.x + Math.sin(a.heading) * mouth;
      kill.z = a.z + Math.cos(a.heading) * mouth;
      kill.heading = a.heading + Math.PI / 2;
    } else a.headDown = 1;
    kill.picked = (kill.picked ?? 0) + 1 / 60 / 8;
    // Eaten (or dragged off out of sight).
    if (Math.hypot(kill.x - a.dragFrom.x, kill.z - a.dragFrom.z) > 45 || a.dragTime > 50 || kill.picked > 4) {
      kill.gone = true;
      this.#unstick(kill);
      this.#dropKill(a);
    }
    return true;
  }

  #dropKill(a) {
    if (a.scavenge) a.scavenge.claimed = null;
    a.scavenge = null;
    a.dragging = false;
  }

  // A bear raiding your camp for its food, in the night: to it, and into
  // it (see ctx.raid), unless there's a fire burning there. Returns whether
  // it's at it (setting the way to go and how fast).
  #raiding(a, sp, t, ctx) {
    const r = a.raid;
    if (ctx.night < 0.3 || !ctx.raid) return (a.raid = null), false;
    const d = Math.hypot(r.x - a.x, r.z - a.z);
    a.raidWant = Math.atan2(r.x - a.x, r.z - a.z);
    a.raidSpeed = d > 2 ? sp.walk * 1.3 : 0;
    a.state = d > 2 ? 'walk' : 'graze';
    if (d < 2.2 && !a.raided) {
      a.raided = true;
      a.raidEat = 25;
      if (ctx.raid(r)) ctx.sound?.call('crash', ctx.pan(a.x, a.z), 0.8);
    }
    if (a.raided && (a.raidEat -= 1 / 60) <= 0) {
      a.raid = null;
      a.raided = false;
      a.raidCool = 600;
      return false;
    }
    return true;
  }

  // A duck: paddling about on the water, dabbling now and then; up and
  // away if you come near (a quack, a clatter of wings).
  #duck(a, sp, dt, ctx) {
    if (a.flying) {
      const F = a.flying;
      F.t -= dt;
      F.vy = Math.max(-1, F.vy - dt * 1.2);
      a.x += F.vx * dt;
      a.y += F.vy * dt;
      a.z += F.vz * dt;
      a.heading = Math.atan2(F.vx, F.vz);
      a.pitch = -0.25;
      a.flap = (a.flap ?? 0) + dt * 22;
      const floor = ctx.ground(a.x, a.z) + 6;
      if (a.y < floor && F.t < 5) a.y += (floor - a.y) * Math.min(1, dt * 2);
      if (F.t <= 0) a.gone = true;
      return;
    }
    const t = this.#threat(a, ctx), p = ctx.player;
    const stance = !p || p.mode !== 'walk' ? 1 : p.crouch ? 0.4 : p.sprint ? 1.5 : 1;
    if (!ctx.tame && t.d < sp.flee * stance && p?.alive) {
      const away = Math.atan2(a.x - p.x, a.z - p.z) + rnd(-0.5, 0.5);
      a.flying = { vx: Math.sin(away) * rnd(9, 12), vz: Math.cos(away) * rnd(9, 12), vy: rnd(3.5, 5), t: 10 };
      ctx.sound?.call('quack', ctx.pan(a.x, a.z), 0.7);
      ctx.sound?.call('flutter', ctx.pan(a.x, a.z), 0.6);
      const w = ctx.waterAt?.(a.x, a.z);
      if (w) ctx.splash?.(a.x, w.level, a.z, 0.6);
      // (The rest of them go too.)
      for (const m of a.herd?.members ?? []) if (m !== a && m.alive && !m.flying) m.startle = rnd(0.05, 0.4);
      return;
    }
    if (a.startle !== undefined && (a.startle -= dt) <= 0) {
      a.startle = undefined;
      const away = Math.atan2(a.x - ctx.camera.position.x, a.z - ctx.camera.position.z) + rnd(-0.6, 0.6);
      a.flying = { vx: Math.sin(away) * rnd(9, 12), vz: Math.cos(away) * rnd(9, 12), vy: rnd(3.5, 5), t: 10 };
      return;
    }
    // A quack now and then, near you.
    if ((a.callWait = (a.callWait ?? rnd(5, 30)) - dt) <= 0) {
      a.callWait = rnd(12, 40);
      if (t.d < 120) ctx.sound?.call('quack', ctx.pan(a.x, a.z), Math.min(0.6, 20 / (t.d + 10)));
    }
    // Paddling: slowly, turning now and then, keeping on the water near its patch.
    a.timer -= dt;
    if (a.timer <= 0) {
      a.timer = rnd(2, 7);
      const toHome = Math.atan2((a.herd?.goal ?? a.home).x - a.x, (a.herd?.goal ?? a.home).z - a.z);
      a.wanderHeading = Math.hypot((a.herd?.goal ?? a.home).x - a.x, (a.herd?.goal ?? a.home).z - a.z) > 8 ? toHome : a.heading + rnd(-1.5, 1.5);
      a.state = Math.random() < 0.3 ? 'graze' : 'walk'; // (dabbling, tail up)
    }
    const speed = a.state === 'walk' ? rnd(0.25, 0.4) : 0.05;
    a.heading += angleTo(a.heading, a.wanderHeading ?? a.heading) * Math.min(1, dt * 1.5);
    const nx = a.x + Math.sin(a.heading) * speed * dt, nz = a.z + Math.cos(a.heading) * speed * dt;
    const w = ctx.waterAt?.(nx, nz), g = ctx.ground(nx, nz);
    if (w && w.level - g > 0.15) (a.x = nx), (a.z = nz);
    else a.wanderHeading = a.heading + Math.PI + rnd(-0.8, 0.8);
    const here = ctx.waterAt?.(a.x, a.z);
    a.y = (here ? here.level : ctx.ground(a.x, a.z)) - 0.1 * a.scale + Math.sin(this.time * 1.7 + a.phase) * 0.01;
    a.pitch = a.state === 'graze' ? 0.9 : 0;
    a.headDown += ((a.state === 'graze' ? 1.2 : 0) - a.headDown) * Math.min(1, dt * 3);
    a.headYaw = Math.sin(this.time * 0.6 + a.phase) * 0.4;
    a.speed = speed;
  }

  // A snake: sliding along, its body following where its head went (the
  // S-bends of it); basking; coiling up and rattling when you come near,
  // and striking if you come nearer; then off, away.
  #snake(a, sp, dt, ctx) {
    if (!a.alive) {
      a.deadTime += dt;
      return;
    }
    const t = this.#threat(a, ctx), p = ctx.player, onFoot = p?.mode === 'walk' && p.alive && !ctx.tame;
    a.strikeCd = Math.max(0, (a.strikeCd ?? 0) - dt);
    a.strike = Math.max(0, (a.strike ?? 0) - dt);
    if (onFoot && t.d < 5 && a.state !== 'flee') {
      if (a.state !== 'coil') (a.state = 'coil'), (a.timer = rnd(4, 8));
      a.rattle = (a.rattle ?? 0) - dt;
      if (a.rattle <= 0) (a.rattle = 0.7), ctx.sound?.call('rattle', ctx.pan(a.x, a.z), Math.min(1, 3 / (t.d + 1)));
      a.heading += angleTo(a.heading, Math.atan2(p.x - a.x, p.z - a.z)) * Math.min(1, dt * 4);
      if (t.d < 1.8 && a.strikeCd <= 0) {
        a.strike = 0.25;
        a.strikeCd = 2.2;
        ctx.sound?.call('hiss', ctx.pan(a.x, a.z), 0.8);
        p.damage(7, 'snake', a);
        p.poison?.();
        if (Math.random() < 0.4) (a.state = 'flee'), (a.timer = rnd(6, 10));
      }
    } else if (a.state === 'coil' && (a.timer -= dt) <= 0) (a.state = 'flee'), (a.timer = rnd(5, 9));
    a.coil = (a.coil ?? 0) + ((a.state === 'coil' ? 1 : 0) - (a.coil ?? 0)) * Math.min(1, dt * 4);
    let speed = 0;
    if (a.state === 'flee') {
      speed = SPECIES.snake.run;
      const away = Math.atan2(a.x - p.x, a.z - p.z);
      a.base = a.base === undefined ? away : a.base + angleTo(a.base, away) * Math.min(1, dt * 2);
      if ((a.timer -= dt) <= 0) (a.state = 'slither'), (a.timer = rnd(4, 10));
    } else if (a.state === 'slither') {
      speed = SPECIES.snake.walk;
      if ((a.timer -= dt) <= 0) (a.state = Math.random() < 0.5 ? 'bask' : 'slither'), (a.timer = rnd(6, 20)), (a.base = (a.base ?? a.heading) + rnd(-1.2, 1.2));
    } else if (a.state === 'bask' && (a.timer -= dt) <= 0) (a.state = 'slither'), (a.timer = rnd(4, 10));
    if (a.state !== 'coil' && speed > 0) {
      // The S-bends: the head swinging from side to side as it goes, the
      // rest of it following the same path.
      a.wave = (a.wave ?? 0) + speed * dt * (TAU / 0.55);
      a.base = a.base ?? a.heading;
      const h = a.base + Math.sin(a.wave) * 0.7;
      const nx = a.x + Math.sin(h) * speed * dt, nz = a.z + Math.cos(h) * speed * dt;
      if (this.#footing(a, sp, nx, nz, ctx) === 1) (a.x = nx), (a.z = nz), (a.heading = h);
      else a.base += Math.PI * 0.6;
    }
    const y = ctx.ground(a.x, a.z);
    if (y === y) a.y = y;
    // The path it's come along (for the rest of its body to follow).
    a.trail = a.trail ?? [];
    const last = a.trail[0];
    if (!last || Math.hypot(last.x - a.x, last.z - a.z) > 0.03) {
      a.trail.unshift({ x: a.x, z: a.z, y: a.y });
      const model = this.rigs.snake.model;
      if (a.trail.length > (model.segments * model.spacing * a.scale) / 0.03 + 4) a.trail.pop();
    }
  }

  #songbird(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    const t = this.#threat(a, ctx);
    const scared = !ctx.tame && t.d3 < SPECIES.songbird.flee;
    a.timer -= dt;
    if (a.state === 'perch' || a.state === 'ground') {
      // Look about; on the ground, hop and peck.
      if (Math.random() < dt * 0.8) a.heading += rnd(-1.2, 1.2);
      if (a.state === 'ground') {
        a.hop = (a.hop ?? 0) - dt;
        if (a.hop <= 0) {
          a.hop = rnd(0.4, 1.4);
          const d = rnd(0.2, 0.5);
          const nx = a.x + Math.sin(a.heading) * d, nz = a.z + Math.cos(a.heading) * d;
          const ny = ctx.ground(nx, nz);
          if (ny > ctx.seaLevel + 0.2) (a.x = nx), (a.z = nz), (a.y = ny + 0.07 * a.scale);
        }
      }
      if (scared || a.timer <= 0) {
        // Off to another tree, or down to the ground beneath one (and
        // well away if you frightened it).
        const crowns = this.#crownsNear(ctx, scared ? 140 : 90);
        let c = crowns[Math.floor(Math.random() * crowns.length)];
        if (scared) c = crowns.find((k) => Math.hypot(k[0] - ctx.camera.position.x, k[1] - ctx.camera.position.z) > 40) ?? c;
        const toGround = !scared && Math.random() < 0.35;
        let to;
        const perch = c && !toGround ? this.#perchOn(c, ctx) : null;
        if (perch) to = { ...perch, state: 'perch' };
        else {
          const x = a.x + rnd(-6, 6), z = a.z + rnd(-6, 6), y = ctx.ground(x, z);
          to = y > ctx.seaLevel + 0.3 ? { x, y: y + 0.07 * a.scale, z, state: 'ground' } : null;
        }
        if (scared && !to) to = { x: a.x + (a.x - ctx.camera.position.x) * 4, y: a.y + 20, z: a.z + (a.z - ctx.camera.position.z) * 4, state: 'gone' };
        if (to) {
          const d = Math.hypot(to.x - a.x, to.y - a.y, to.z - a.z);
          // (Up over the treetops between, not through them.)
          const over = Math.max(a.y, to.y) + 3 + d * 0.06 - (a.y + to.y) / 2;
          a.path = { from: { x: a.x, y: a.y, z: a.z }, to, p: 0, dur: Math.max(0.6, (d + over) / (scared ? 9 : 6)), arc: Math.max(1 + d * 0.15, over) };
          a.state = 'fly';
          a.timer = rnd(5, 20);
          if (scared) ctx.sound?.call('flutter', ctx.pan(a.x, a.z), 0.3);
        } else a.timer = rnd(3, 8);
      }
    } else if (a.state === 'fly' && a.path) {
      const P = a.path;
      P.p = Math.min(1, P.p + dt / P.dur);
      const s = P.p * P.p * (3 - 2 * P.p);
      const nx = P.from.x + (P.to.x - P.from.x) * s, nz = P.from.z + (P.to.z - P.from.z) * s;
      const ny = P.from.y + (P.to.y - P.from.y) * s + Math.sin(Math.PI * P.p) * P.arc;
      if (Math.hypot(nx - a.x, nz - a.z) > 1e-4) a.heading = Math.atan2(nx - a.x, nz - a.z);
      a.pitch = -Math.atan2(ny - a.y, Math.hypot(nx - a.x, nz - a.z) + 1e-4) * 0.6;
      a.x = nx; a.y = ny; a.z = nz;
      a.flap += dt * 24;
      if (P.p >= 1) {
        a.state = P.to.state === 'gone' ? 'gone' : P.to.state;
        a.pitch = 0;
        a.timer = rnd(4, 16);
        if (a.state === 'gone') a.gone = true;
      }
    }
  }

  #flock(f, dt, ctx) {
    const g = ctx.generator, cam = ctx.camera.position;
    f.timer -= dt;
    const d = Math.hypot(f.centre.x - cam.x, f.centre.z - cam.z);
    if (f.mode === 'travel') {
      // Crows: on across the sky to their roost, cawing.
      const dx = f.to.x - f.centre.x, dz = f.to.z - f.centre.z, l = Math.hypot(dx, dz);
      f.centre.x += (dx / l) * 9 * dt;
      f.centre.z += (dz / l) * 9 * dt;
      f.groundY += (g.getBaseHeight(f.centre.x, f.centre.z) - f.groundY) * Math.min(1, dt);
      f.centre.y = Math.max(f.groundY, ctx.seaLevel) + f.alt;
      if (Math.random() < dt * 0.5 && d < 300) ctx.sound?.call('caw', ctx.pan(f.centre.x, f.centre.z), Math.max(0.1, 1 - d / 300));
      if (l < 20) f.done = true;
      if (f.done) for (const b of f.birds) b.gone = true;
      return;
    }
    if (f.mode === 'fly') {
      // Wheeling in great loops over their patch of country.
      f.angle += dt * 0.1 * f.spin;
      f.centre.x = f.anchor.x + Math.cos(f.angle) * f.radius;
      f.centre.z = f.anchor.z + Math.sin(f.angle * 2) * f.radius * 0.5;
      f.groundY += (g.getBaseHeight(f.centre.x, f.centre.z) - f.groundY) * Math.min(1, dt * 0.5);
      f.centre.y = Math.max(f.groundY, ctx.seaLevel) + f.alt + Math.sin(this.time * 0.3) * 5;
      if (!ctx.tame && d < 20 && Math.abs(cam.y - f.centre.y) < 20) this.#scatter(f, ctx);
      // Now and then, down to feed in an open field.
      if (f.timer <= 0) {
        f.timer = rnd(25, 50);
        const x = f.centre.x + rnd(-40, 40), z = f.centre.z + rnd(-40, 40), y = ctx.ground(x, z);
        if (y > ctx.seaLevel + 1 && g.getForestDensity(x, z) < 0.45 && Math.hypot(x - cam.x, z - cam.z) > 50) {
          f.mode = 'land';
          f.spot = { x, y, z };
          f.timer = rnd(12, 25);
          for (const b of f.birds) {
            const a = rnd(0, TAU), r = rnd(0.5, 6);
            b.land = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
            b.land.y = ctx.ground(b.land.x, b.land.z) + 0.06 * b.scale;
          }
        }
      }
    } else if (f.mode === 'land') {
      f.centre.x = f.spot.x; f.centre.z = f.spot.z; f.centre.y = f.spot.y;
      if (!ctx.tame && d < SPECIES[f.kind].flee) this.#scatter(f, ctx);
      else if (f.timer <= 0) (f.mode = 'fly'), (f.timer = rnd(25, 50)), (f.anchor = { x: f.spot.x - Math.cos(f.angle) * f.radius, z: f.spot.z - Math.sin(f.angle * 2) * f.radius * 0.5 });
    } else if (f.mode === 'scatter') {
      if (f.timer <= 0) (f.mode = 'fly'), (f.timer = rnd(30, 60));
    }
  }

  #scatter(f, ctx) {
    f.mode = 'scatter';
    f.timer = 2.5;
    const cam = ctx.camera.position;
    for (const b of f.birds) {
      const dx = b.x - cam.x, dz = b.z - cam.z, l = Math.hypot(dx, dz) || 1;
      b.vx = (dx / l) * rnd(8, 13) + rnd(-3, 3);
      b.vz = (dz / l) * rnd(8, 13) + rnd(-3, 3);
      b.vy = rnd(4, 9);
      b.landed = false;
    }
    ctx.sound?.call('flutter', ctx.pan(f.centre.x, f.centre.z), 0.6);
  }

  #flockBird(b, dt, ctx) {
    if (this.#falling(b, dt, ctx)) return;
    const f = b.flock;
    let tx, ty, tz;
    if (f.mode === 'land' && b.land) {
      tx = b.land.x; ty = b.land.y; tz = b.land.z;
      if (Math.hypot(b.x - tx, b.y - ty, b.z - tz) < 0.4) {
        // Down: hopping about, pecking.
        b.landed = true;
        b.vx = b.vy = b.vz = 0;
        b.pitch = 0;
        if (Math.random() < dt * 0.7) {
          b.heading += rnd(-1.5, 1.5);
          const nx = b.x + Math.sin(b.heading) * 0.3, nz = b.z + Math.cos(b.heading) * 0.3;
          b.land = { x: nx, z: nz, y: ctx.ground(nx, nz) + 0.06 * b.scale };
          b.x = nx; b.z = nz; b.y = b.land.y;
        }
        return;
      }
    } else {
      b.landed = false;
      if (f.mode === 'scatter') {
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.vy -= dt * 2;
        this.#bank(b, b.vx, b.vy, b.vz, dt);
        b.flap += dt * 26;
        return;
      }
      b.off.a += dt * b.off.w * f.spin;
      tx = f.centre.x + Math.cos(b.off.a) * b.off.r;
      ty = f.centre.y + b.off.h + Math.sin(this.time * 1.3 + b.off.a) * 1.2;
      tz = f.centre.z + Math.sin(b.off.a) * b.off.r;
    }
    // Steering (springy, so the flock ripples as it turns).
    const k = f.mode === 'land' ? 2.2 : 1.6;
    b.vx += ((tx - b.x) * k - b.vx * 1.3) * dt;
    b.vy += ((ty - b.y) * k - b.vy * 1.3) * dt;
    b.vz += ((tz - b.z) * k - b.vz * 1.3) * dt;
    const sp = Math.hypot(b.vx, b.vy, b.vz), max = f.kind === 'crow' ? 14 : 16;
    if (sp > max) (b.vx *= max / sp), (b.vy *= max / sp), (b.vz *= max / sp);
    if (f.mode === 'travel') {
      // (Crows: carried along with their line, not just chasing it.)
      const dx = f.to.x - f.centre.x, dz = f.to.z - f.centre.z, l = Math.hypot(dx, dz) || 1;
      b.x += (dx / l) * 9 * dt;
      b.z += (dz / l) * 9 * dt;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // (Never down through the treetops, but over them.)
    if (f.mode !== 'land') {
      const floor = ctx.ground(b.x, b.z) + 34;
      if (b.y < floor) (b.y += (floor - b.y) * Math.min(1, dt * 3)), (b.vy = Math.max(b.vy, 0));
    }
    const fx = b.vx + (f.mode === 'travel' ? (f.to.x - f.centre.x) : 0), fz = b.vz + (f.mode === 'travel' ? (f.to.z - f.centre.z) : 0);
    this.#bank(b, fx, b.vy, fz, dt);
    b.flap += dt * (b.vy > 0.5 || f.mode === 'land' ? 26 : 16);
  }

  #bank(b, vx, vy, vz, dt) {
    if (Math.hypot(vx, vz) < 0.05) return;
    const h = Math.atan2(vx, vz);
    const turn = angleTo(b.heading, h);
    b.heading += turn * Math.min(1, dt * 6);
    b.roll += (-turn * 1.5 - b.roll) * Math.min(1, dt * 4);
    b.pitch = -Math.atan2(vy, Math.hypot(vx, vz)) * 0.7;
  }

  #circler(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    // Round and round on the wind, gliding, now and then a few wingbeats.
    const hawk = a.kind === 'hawk';
    a.angle += (a.speed / a.radius) * dt * a.dir;
    const gx = a.centre.x + Math.cos(a.angle) * a.radius, gz = a.centre.z + Math.sin(a.angle) * a.radius;
    const ground = hawk ? ctx.generator.getBaseHeight(gx, gz) : ctx.seaLevel;
    a.groundY += (Math.max(ground, ctx.seaLevel) - a.groundY) * Math.min(1, dt * 0.3);
    const y = a.groundY + a.alt + Math.sin(this.time * 0.2 + a.angle) * (hawk ? 8 : 4);
    a.heading = Math.atan2(gx - a.x, gz - a.z);
    a.pitch = -Math.atan2(y - a.y, a.speed * dt + 1e-4) * 0.3;
    a.x = gx; a.y = y; a.z = gz;
    a.roll = -a.dir * (hawk ? 0.3 : 0.4);
    a.nextFlap -= dt;
    if (a.nextFlap <= 0) (a.flapping = rnd(0.8, 2)), (a.nextFlap = rnd(4, 12));
    a.flapping -= dt;
    a.flap += dt * (a.flapping > 0 ? (hawk ? 9 : 13) : 0);
    a.nextCall -= dt;
    if (a.nextCall <= 0) {
      a.nextCall = rnd(8, 25);
      const d = Math.hypot(a.x - ctx.camera.position.x, a.y - ctx.camera.position.y, a.z - ctx.camera.position.z);
      if (d < 250) ctx.sound?.call(hawk ? 'hawk' : 'gull', ctx.pan(a.x, a.z), Math.max(0.1, 1 - d / 250));
    }
    // Drifting over its patch; out to sea or away if you come close.
    const t = this.#threat(a, ctx);
    if (!ctx.tame && t.d3 < SPECIES[a.kind].flee) {
      const dx = a.x - ctx.camera.position.x, dz = a.z - ctx.camera.position.z, l = Math.hypot(dx, dz) || 1;
      a.centre.x += (dx / l) * 12 * dt;
      a.centre.z += (dz / l) * 12 * dt;
      a.flapping = Math.max(a.flapping, 0.5);
    }
  }

  // A shot bird tumbles down, then lies on the ground.
  #falling(a, dt, ctx) {
    if (a.alive) return false;
    a.deadTime += dt;
    if (a.state === 'falling') {
      a.vy = (a.vy ?? 0) - 9.8 * dt;
      a.y += a.vy * dt;
      a.roll += dt * 8;
      const y = ctx.ground(a.x, a.z);
      if (!(a.y > y + 0.05 * a.scale)) (a.state = 'dead'), (a.y = (y === y ? y : a.y) + 0.05 * a.scale), (a.roll = a.side * Math.PI * 0.5), (a.pitch = 0);
    }
    return true;
  }

  // --- Drawing --------------------------------------------------------------

  #draw() {
    const counts = {};
    for (const [kind, rig] of Object.entries(this.rigs)) {
      counts[kind] = 0;
      for (const m of Object.values(rig.meshes)) m.count = 0;
    }
    const W = this.woundMesh;
    W.count = 0;
    const ctx = this.ctx;
    for (const a of this.animals) {
      const rig = this.rigs[a.kind], sp = SPECIES[a.kind], M = rig.meshes;
      if (counts[a.kind] >= sp.max) continue;
      counts[a.kind]++;
      if (sp.serpent) {
        this.#drawSnake(a, rig, ctx);
        continue;
      }
      const colour = sp.tinted ? (ctx?.winter > 0.5 ? white : HARE_BROWN) : null;
      const put = (mesh, pivot, rx, ry, rz, order = 'YXZ', k = 1) => {
        euler.set(rx, ry, rz, order);
        quat.setFromEuler(euler);
        part.compose(pos.set(pivot[0], pivot[1], pivot[2]), quat, scl.set(k, k, k));
        out.multiplyMatrices(base, part);
        mesh.setMatrixAt(mesh.count++, out);
        if (colour) mesh.setColorAt(mesh.count - 1, colour);
        return out;
      };
      if (sp.ground) this.#drawBeast(a, sp, rig, M, put, ctx);
      else {
        euler.set(a.pitch, a.heading, a.roll, 'YXZ');
        quat.setFromEuler(euler);
        base.compose(pos.set(a.x, a.y, a.z), quat, scl.setScalar(a.scale));
        const perched = a.state === 'perch' || a.state === 'ground' || a.landed || a.state === 'dead';
        let flap = 0, fold = 0;
        if (perched) fold = 1.35;
        else flap = Math.sin(a.flap) * (a.kind === 'hawk' || a.kind === 'gull' ? 0.55 : 0.9);
        if (a.circling && !(a.flapping > 0)) flap = 0.08; // (gliding: wings held out, a slight lift)
        put(M.body, [0, 0, 0], 0, 0, 0);
        put(M.wingL, [0.05, 0.02, 0.02], 0, fold, flap - (perched ? 0.15 : 0));
        put(M.wingR, [-0.05, 0.02, 0.02], 0, -fold, -flap + (perched ? 0.15 : 0));
        if (a.tint) M.body.setColorAt(M.body.count - 1, tint.set(a.tint).lerp(white, 0.1));
        else if (a.kind === 'songbird') M.body.setColorAt(M.body.count - 1, white);
        a.m = null;
      }
      // Its wounds, and what's stuck in it.
      for (const mk of a.marks ?? []) {
        const frame = mk.head ? a.hm : a.m;
        if (!frame || W.count >= 256) continue;
        W.setMatrixAt(W.count++, out.multiplyMatrices(frame, part.makeTranslation(mk.x, mk.y, mk.z)));
      }
      for (const s of a.stuck ?? []) {
        const frame = s.head ? a.hm : a.m;
        if (!frame) continue;
        s.mesh.matrix.multiplyMatrices(frame, s.local);
        s.mesh.matrixWorldNeedsUpdate = true;
      }
    }
    W.instanceMatrix.needsUpdate = true;
    W.visible = W.count > 0;
    for (const rig of Object.values(this.rigs)) {
      for (const m of Object.values(rig.meshes)) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.visible = m.count > 0 && !this.hidden;
      }
    }
  }

  // A four-legged beast (or a bird on foot): its body, moving with its
  // legs; its head; and its legs, each foot where it's been put down.
  #drawBeast(a, sp, rig, M, put, ctx) {
    const model = rig.model, H = model.legs[0][1], s = a.scale;
    const lying = !a.alive || a.down;
    const ground = ctx?.ground;
    if (lying) {
      // On its side, turned about the middle of its body, lying along the
      // ground (on the highest of it under its length: never into it; or
      // afloat).
      const bb = model.body.boundingBox;
      const cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const hw = ((bb.max.x - bb.min.x) / 2) * 0.8, hl = ((bb.max.z - bb.min.z) / 2) * 0.8;
      const lie = Math.abs(Math.sin(a.roll));
      const sh = Math.sin(a.heading), ch = Math.cos(a.heading);
      let g = -Infinity, front = NaN, back = NaN;
      if (ground) {
        for (const f of [-1, -0.5, 0, 0.5, 1]) {
          const x = a.x + sh * (cz + f * hl) * s, z = a.z + ch * (cz + f * hl) * s;
          const y = ground(x, z);
          if (!(y === y)) continue;
          g = Math.max(g, y);
          if (f === 1) front = y;
          if (f === -1) back = y;
        }
        const w = ctx.waterAt?.(a.x, a.z);
        if (w && w.level > g) g = w.level - hw * s * 0.6;
      }
      if (!(g > -Infinity)) g = a.y;
      const pitch = front === front && back === back ? -Math.atan2(front - back, 2 * hl * s) : 0;
      euler.set(pitch, a.heading, a.roll, 'YXZ');
      quat.setFromEuler(euler);
      base.compose(pos.set(a.x, g + (hw * lie + cy * (1 - lie)) * s + 0.01, a.z), quat, scl.setScalar(s));
      base.multiply(lift.makeTranslation(0, -cy, 0));
    } else {
      // Standing, walking, running: the body rising and falling, rocking,
      // swaying and surging on with its footfalls; lying down with its
      // legs folded under it; crouching low to stalk.
      const r = a.rh ?? { bob: 0, pitch: 0, roll: 0, nod: 0 };
      const lieDrop = a.lie * H * 0.78;
      const crouch = (a.crouch ?? 0) * H * 0.3 + (a.state === 'charge' ? H * 0.06 : 0);
      let x = a.x, z = a.z;
      if (a.jolt) (x += a.jolt.x * 0.12 * s * (a.jolt.t / 0.3)), (z += a.jolt.z * 0.12 * s * (a.jolt.t / 0.3));
      euler.set(a.pitch + r.pitch - (a.rear ?? 0) * 0.55, a.heading, a.roll + r.roll, 'YXZ');
      quat.setFromEuler(euler);
      base.compose(pos.set(x, a.y + (r.bob * H - lieDrop - crouch) * s - (a.drop ?? 0), z), quat, scl.setScalar(s));
    }
    a.m = (a.m ?? new Matrix4()).copy(base);
    put(M.body, [0, 0, 0], 0, 0, 0);
    // The head: down to graze, up when alarmed, nodding with its steps (a
    // bird's thrust forward and held); limp, dead.
    const nod = a.alive ? (a.rh?.nod ?? 0) : 0;
    const bend = a.kind === 'bison' ? 0.5 : a.kind === 'rabbit' || a.kind === 'hare' ? 0.4 : sp.forager ? 0.6 : sp.biped ? 0.7 : 1.05;
    const headRx = a.alive ? a.headDown * bend + nod : 0.35;
    const hp = model.headPivot;
    const thrust = sp.biped && a.alive && !sp.water && a.speed > 0.05 ? Math.max(0, Math.sin(TAU * (a.cycle ?? 0) * 2)) * 0.05 : 0;
    const head = put(M.head, [hp[0], hp[1], hp[2] + thrust], headRx, a.alive ? a.headYaw : 0, 0);
    a.hm = (a.hm ?? new Matrix4()).copy(head);
    if (M.antlers && a.antlers) put(M.antlers, [hp[0], hp[1], hp[2] + thrust], headRx, a.alive ? a.headYaw : 0, 0);
    // A tom turkey's fan, raised.
    if (M.fan && (a.display ?? 0) > 0.05) {
      part.makeTranslation(0, 0.66, -0.3).multiply(lift.makeRotationX((1 - a.display) * 1.4)).multiply(out.makeTranslation(0, -0.66, 0.3));
      M.fan.setMatrixAt(M.fan.count++, out.multiplyMatrices(base, part));
    }
    // A duck's wings: folded, or beating as it flies.
    if (M.wingL) {
      const flying = !!a.flying && a.alive;
      const fold = flying ? 0 : 1.35, flap = flying ? Math.sin(a.flap ?? 0) * 0.9 : 0;
      put(M.wingL, model.wingAt, 0, fold, flap - (flying ? 0 : 0.15));
      put(M.wingR, [-model.wingAt[0], model.wingAt[1], model.wingAt[2]], 0, -fold, -flap + (flying ? 0 : 0.15));
    }
    // The legs.
    if (sp.water && a.alive) return; // (a duck's tucked up under it on the water, and in flight)
    let inverse = null;
    const far = !a.feet;
    model.legs.forEach((p, k) => {
      const hind = model.biped || k >= 2, limb = hind ? model.hind : model.fore;
      if (lying) {
        // Stretched out stiff (dead), or kicking (down).
        const kick = a.down && a.alive ? Math.sin(this.time * 7 + k * 1.7) * 0.3 * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.9))) : 0;
        foot.x = p[0] * 1.25;
        foot.y = p[1] * 0.14;
        foot.z = p[2] + (hind ? -1 : 1) * p[1] * (0.35 + kick);
      } else if (a.swimming) {
        // Paddling, under the water.
        foot.x = p[0];
        foot.y = p[1] - (limb.l1 + limb.l2) * 0.85;
        foot.z = p[2] + Math.sin(TAU * ((a.cycle ?? 0) * 1.5 + (k === 0 || k === 3 ? 0 : 0.5))) * 0.3 * p[1];
      } else if (!far) {
        // Where its foot is, planted on the ground (or swinging on), in its body's frame.
        const f = a.feet[k];
        inverse = inverse ?? inv.copy(base).invert();
        v3.set(f.x, f.y, f.z).applyMatrix4(inverse);
        foot.x = v3.x;
        foot.y = v3.y;
        foot.z = v3.z;
      } else footAt(foot, p, k, a.gait ?? sp.gaits[0], a.cycle ?? 0, (a.strideLen ?? sp.stride) / s, H, Math.min(1, (a.speed ?? 0) / (sp.walk * 0.3)));
      // Lying down: the legs folded under it (the fore hooves tucked back;
      // the hind legs folded as a resting deer's or sheep's are, the knee
      // forward along the belly and the foot tucked back beside the rump,
      // never the joint sticking up out behind).
      let tucked = false;
      if (a.alive && !lying && a.lie > 0.001) {
        const fy = H * 0.78 * a.lie + 0.02, fz = p[2] + (hind ? -0.22 : -0.18) * H;
        foot.x += (p[0] * 1.2 - foot.x) * a.lie;
        foot.y += (fy - foot.y) * a.lie;
        foot.z += (fz - foot.z) * a.lie;
        tucked = hind && a.lie > 0.5;
      }
      solveLeg(ik, p[0], p[1], p[2], foot.x, foot.y, foot.z, limb.l1, limb.l2, !hind || tucked);
      put(hind ? M.hindUpper : M.foreUpper, p, ik.a1, 0, ik.rz, 'ZYX');
      put(hind ? M.hindLower : M.foreLower, [ik.kx, ik.ky, ik.kz], ik.a2, 0, ik.rz, 'ZYX');
    });
  }

  // A snake: its segments along the path its head has come (or coiled up,
  // head raised), its head, the rattle (shaking) at the tail.
  #drawSnake(a, rig, ctx) {
    const M = rig.meshes, model = rig.model, s = a.scale, n = model.segments, gap = model.spacing * s;
    const trail = a.trail?.length ? a.trail : [{ x: a.x, z: a.z, y: a.y }];
    const pts = [];
    let i = 0, along = 0;
    for (let k = 0; k <= n; k++) {
      const want = k * gap;
      while (i < trail.length - 1) {
        const d = Math.hypot(trail[i + 1].x - trail[i].x, trail[i + 1].z - trail[i].z);
        if (along + d >= want) {
          const f = d > 0 ? (want - along) / d : 0;
          pts.push({ x: trail[i].x + (trail[i + 1].x - trail[i].x) * f, z: trail[i].z + (trail[i + 1].z - trail[i].z) * f });
          break;
        }
        along += d;
        i++;
      }
      if (pts.length <= k) {
        // (Past the end of the path: straight on back.)
        const lastP = pts[pts.length - 1] ?? { x: a.x, z: a.z };
        pts.push({ x: lastP.x - Math.sin(a.heading) * gap, z: lastP.z - Math.cos(a.heading) * gap });
      }
    }
    // Coiled: in a spiral, the head up in the middle, ready.
    const coil = a.alive ? a.coil ?? 0 : 0;
    if (coil > 0.01) {
      pts.forEach((pt, k) => {
        const t = n - k, ang = a.heading + t * 0.75, r = 0.04 + t * 0.011 * s;
        pt.x += (a.x + Math.sin(ang) * r - pt.x) * coil;
        pt.z += (a.z + Math.cos(ang) * r - pt.z) * coil;
      });
    }
    a.segs = pts.map((pt, k) => {
      const y = ctx?.ground(pt.x, pt.z);
      return { x: pt.x, z: pt.z, y: (y === y ? y : a.y) + (k < 4 ? coil * (0.16 - k * 0.04) * s : 0) };
    });
    const orient = (k) => {
      const p0 = a.segs[k], p1 = a.segs[Math.min(n, k + 1)];
      const h = k === n ? a.heading : Math.atan2(p0.x - p1.x, p0.z - p1.z);
      const pitch = -Math.atan2(p0.y - p1.y, gap);
      euler.set(pitch, h, a.alive ? 0 : Math.PI * 0.9, 'YXZ');
      return quat.setFromEuler(euler);
    };
    for (let k = 1; k < n; k++) {
      out.compose(pos.set(a.segs[k].x, a.segs[k].y, a.segs[k].z), orient(k), scl.set(s * (1 - k / n * 0.45), s, s));
      M.segment.setMatrixAt(M.segment.count++, out);
    }
    const lunge = (a.strike ?? 0) > 0 ? Math.sin(((0.25 - a.strike) / 0.25) * Math.PI) * 0.35 * s : 0;
    const h0 = a.segs[0];
    orient(0);
    out.compose(pos.set(h0.x + Math.sin(a.heading) * lunge, h0.y + lunge * 0.3, h0.z + Math.cos(a.heading) * lunge), quat, scl.setScalar(s));
    M.head.setMatrixAt(M.head.count++, out);
    const tail = a.segs[n];
    orient(n - 1);
    if (a.state === 'coil' && a.alive) quat.multiply(shake.setFromEuler(euler.set(0, 0, Math.sin(this.time * 60) * 0.4)));
    out.compose(pos.set(tail.x, tail.y + coil * 0.08 * s, tail.z), quat, scl.setScalar(s));
    M.rattle.setMatrixAt(M.rattle.count++, out);
    a.m = null;
    a.hm = null;
  }
}
