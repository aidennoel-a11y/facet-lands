import { AdditiveBlending, BoxGeometry, Color, DynamicDrawUsage, Euler, Frustum, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, Raycaster, Sphere, Vector3 } from 'three';
import { hash2, mulberry32 } from '../noise/random.js';
import { chooseGait, footAt, rhythm, solveLeg, stepFeet, strideLength } from './Gait.js';
import * as Models from './models.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const TAU = Math.PI * 2;
const SWAY = { x: 0, z: 0 };
// The calls that carry far (see #vocalize).
const LOUD_CALLS = new Set(['howl', 'bugle', 'roar', 'moose', 'crocBellow', 'jaguar', 'scream', 'yip', 'trumpet', 'hyena', 'hippo']);
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
  deer: { ground: true, grade: 0.54, model: Models.deer, max: 60, walk: 1.3, run: 12, flee: 45, calm: 130, radius: 0.5, height: 1.4, health: 60, stride: 1.6, turn: 2.5, size: 1.3, gaits: ['walk', 'trot', 'deerGallop'], trotBand: 0.08, swims: true },
  // Elk: herds in the high meadows and the pine woods (in the autumn the
  // bulls bugle, and one in the rut will come at you).
  elk: { ground: true, grade: 0.56, model: Models.elk, max: 30, walk: 1.3, run: 12, flee: 55, calm: 140, radius: 0.55, height: 1.8, health: 90, stride: 2.1, turn: 2.2, size: 1.55, gaits: HOOF, trotBand: 0.3, swims: true, call: 'bugle' },
  // A moose: alone in the cold woods by the water; slow to run, but
  // don't come close (a bull in the rut, a cow with her calf).
  moose: { ground: true, grade: 0.52, model: Models.moose, max: 8, walk: 1.2, run: 9, flee: 18, calm: 60, radius: 0.7, height: 2.1, health: 250, stride: 2.0, turn: 1.6, size: 1.0, gaits: HOOF, trotBand: 0.85, swims: true },
  bison: { ground: true, grade: 0.3, model: Models.bison, max: 70, walk: 1.0, run: 8.5, flee: 30, calm: 85, radius: 1.0, height: 2.0, health: 200, stride: 2.2, turn: 1.4, size: 1.5, gaits: HOOF, trotBand: 0.3 },
  // Bears (in the mountain foothills): a black bear shies away; a grizzly
  // stands its ground (`aggressive`: one day it will come for you).
  blackBear: { ground: true, grade: 0.58, model: Models.blackBear, max: 16, walk: 0.9, run: 9, flee: 35, calm: 100, radius: 0.7, height: 1.3, health: 150, stride: 1.4, turn: 1.8, size: 1.3, forager: true, gaits: BEAR, swims: true },
  grizzly: { ground: true, grade: 0.58, model: Models.grizzly, max: 10, walk: 0.9, run: 10, flee: 10, calm: 40, radius: 0.8, height: 1.5, health: 260, stride: 1.6, turn: 1.6, size: 1.6, forager: true, aggressive: true, gaits: BEAR, swims: true },
  // Wild dogs: wolves in packs in the pine woods and the cold north (they
  // howl at night), coyotes on the savanna and the plains (yipping at dusk),
  // foxes alone at the woods' edges where the winters are cold.
  wolf: { ground: true, grade: 0.6, model: Models.wolf, max: 24, walk: 1.4, run: 12, flee: 40, calm: 110, radius: 0.35, height: 0.9, health: 70, stride: 1.3, turn: 3, size: 1.25, forager: true, call: 'howl', gaits: DOG, trotBand: 0.5, swims: true, scavenger: true },
  coyote: { ground: true, grade: 0.6, model: Models.coyote, max: 16, walk: 1.3, run: 11, flee: 35, calm: 100, radius: 0.28, height: 0.7, health: 40, stride: 1.1, turn: 3.5, size: 0.95, forager: true, call: 'yip', gaits: DOG, trotBand: 0.45, scavenger: true },
  fox: { ground: true, grade: 0.64, model: Models.fox, max: 14, walk: 1.1, run: 10, flee: 25, calm: 70, radius: 0.2, height: 0.5, health: 20, stride: 0.8, turn: 4, size: 0.744, forager: true, gaits: DOG, trotBand: 0.45, scavenger: true },
  // A cougar: alone in the mountains, seldom seen: it stalks you from
  // behind, freezing when you look its way, and springs.
  cougar: { ground: true, grade: 0.71, model: Models.cougar, max: 6, walk: 1.2, run: 14, flee: 25, calm: 90, radius: 0.3, height: 0.8, health: 70, stride: 1.25, turn: 4, size: 1.05, gaits: DOG, trotBand: 0.15, call: 'scream' },
  // Wild boar: a sounder of them rooting in the woods; one will charge.
  boar: { ground: true, grade: 0.54, model: Models.boar, max: 24, walk: 1.0, run: 9, flee: 24, calm: 70, radius: 0.4, height: 1.0, health: 90, stride: 0.95, turn: 3, size: 1.0, forager: true, gaits: HOOF, trotBand: 0.4, call: 'oink' },
  // Sheep in flocks on the open plains (a black face, a woolly fleece);
  // wolf pups by their den.
  sheep: { ground: true, grade: 0.52, model: Models.sheep, max: 60, walk: 1.0, run: 7.5, flee: 22, calm: 70, radius: 0.45, height: 1.0, health: 60, stride: 1.1, turn: 2.5, size: 1.21, call: 'baa', gaits: HOOF, trotBand: 0.3 },
  wolfPup: { ground: true, grade: 0.6, model: Models.wolf, max: 12, walk: 1.2, run: 8, flee: 12, calm: 40, radius: 0.2, height: 0.5, health: 20, stride: 0.7, turn: 4, size: 0.55, forager: true, gaits: DOG, trotBand: 0.5 },
  rabbit: { ground: true, grade: 0.43, model: Models.rabbit, max: 40, walk: 1.0, run: 7.5, flee: 14, calm: 40, radius: 0.3, height: 0.55, health: 10, stride: 1.0, turn: 5, size: 1.8, gaits: HOP },
  // Hares, out in the open and the cold woods: bigger, faster, white in the winter.
  hare: { ground: true, grade: 0.46, model: Models.hare, max: 20, walk: 1.2, run: 13, flee: 22, calm: 55, radius: 0.3, height: 0.65, health: 12, stride: 1.3, turn: 6, size: 2.0, gaits: HOP, tinted: true },
  // Wild turkeys: flocks in the woods (the toms gobbling and showing off
  // their fans in the spring).
  turkey: { ground: true, biped: true, grade: 0.8, model: Models.turkey, max: 30, walk: 0.9, run: 6.5, flee: 24, calm: 70, radius: 0.25, height: 1.0, health: 10, stride: 0.55, turn: 4, size: 1.0, gaits: FOWL, call: 'gobble' },
  // Ducks paddling on the ponds and lakes (up and away, if you come near).
  beaver: { ground: true, water: true, diver: true, model: Models.beaver, max: 20, walk: 0.5, run: 1.6, flee: 14, calm: 50, radius: 0.3, height: 0.4, health: 18, stride: 0.3, turn: 2.5, size: 1.15, gaits: DOG, trotBand: 0.5 },
  duck: { ground: true, biped: true, water: true, model: Models.duck, max: 60, walk: 0.5, run: 1.5, flee: 20, calm: 60, radius: 0.2, height: 0.35, health: 4, stride: 0.2, turn: 3, size: 1.3, gaits: FOWL, call: 'quack' },
  // Rattlesnakes in the dry country (not in the winter): coiling, rattling, striking.
  // The jungle's big cats: tigers (heavy, striped, deadly) and black
  // panthers (smaller, ambushing from cover); giant pandas, placid, munching
  // in the bamboo; crocodiles lying at the water's edge in the mangroves
  // and the jungle lakes; mountain goats on the crags and in the badlands.
  tiger: { ground: true, grade: 0.64, model: Models.tiger, max: 8, walk: 1.1, run: 15, flee: 20, calm: 90, radius: 0.4, height: 1.0, health: 180, stride: 1.5, turn: 3.2, size: 1.2, gaits: DOG, trotBand: 0.15, swims: true, call: 'growl' },
  panther: { ground: true, grade: 0.71, model: Models.panther, max: 8, walk: 1.2, run: 15, flee: 25, calm: 90, radius: 0.3, height: 0.8, health: 80, stride: 1.25, turn: 4, size: 1.05, gaits: DOG, trotBand: 0.15, call: 'scream' },
  panda: { ground: true, grade: 0.52, model: Models.panda, max: 8, walk: 0.7, run: 5, flee: 12, calm: 40, radius: 0.6, height: 1.2, health: 160, stride: 1.2, turn: 1.6, size: 1.05, forager: true, gaits: BEAR },
  crocodile: { ground: true, grade: 0.38, model: Models.crocodile, max: 80, fearless: true, walk: 0.5, run: 6, flee: 6, calm: 30, radius: 0.6, height: 0.5, health: 200, stride: 0.7, turn: 1.5, size: 1.6, gaits: DOG, trotBand: 0.6, swims: true },
  mountainGoat: { ground: true, grade: 1.0, model: Models.mountainGoat, max: 24, walk: 1.0, run: 9, flee: 30, calm: 80, radius: 0.35, height: 1.0, health: 70, stride: 1.0, turn: 3, size: 1.15, gaits: HOOF, trotBand: 0.35, call: 'baa' },
  jaguar: { ground: true, grade: 0.71, model: Models.jaguar, max: 6, walk: 1.1, run: 14, flee: 20, calm: 90, radius: 0.35, height: 0.9, health: 130, stride: 1.3, turn: 3.6, size: 1.1, gaits: DOG, trotBand: 0.15, swims: true, call: 'jaguar' },
  // Monkeys: troops up in the jungle's crowns, leaping from tree to tree,
  // climbing down the trunks now and then (see #monkey).
  monkey: { bird: true, climber: true, model: Models.monkey, max: 40, scale: 1.0, flee: 14, radius: 0.25, health: 15 },
  snake: { serpent: true, model: Models.snake, max: 10, walk: 0.35, run: 1.2, flee: 5, calm: 12, radius: 0.1, height: 0.1, health: 4, size: 1.0 },
  songbird: { bird: true, model: Models.songbird, max: 60, scale: 1.6, flee: 9, radius: 0.25, health: 2 },
  starling: { bird: true, model: Models.starling, max: 60, scale: 1.45, flee: 22, radius: 0.25, health: 2 },
  crow: { bird: true, model: Models.crow, max: 40, scale: 2.3, flee: 25, radius: 0.35, health: 4 },
  gull: { bird: true, model: Models.gull, max: 12, scale: 3.0, flee: 15, radius: 0.5, health: 6 },
  hawk: { bird: true, model: Models.hawk, max: 4, scale: 4.2, flee: 30, radius: 0.7, health: 12 },
  // An owl: out at night in the woods, sitting up in the trees, hooting; it drops on rabbits (see #owl).
  owl: { bird: true, model: Models.hawk, max: 4, scale: 2.4, flee: 8, radius: 0.35, health: 6, coloured: true },
  // The savanna's: lions (a pride: lionesses and a maned male, lying up by
  // day, hunting at dusk and in the dark), hyenas (a clan, scavenging, bold
  // at night), elephants (a herd, peaceful till provoked), hippos (in the
  // water, and not to be gone near).
  lion: { ground: true, grade: 0.64, model: Models.lion, max: 14, walk: 1.1, run: 15, flee: 20, calm: 80, radius: 0.4, height: 1.0, health: 170, stride: 1.5, turn: 3, size: 1.12, gaits: DOG, trotBand: 0.15, swims: true, call: 'roar' },
  hyena: { ground: true, grade: 0.64, model: Models.hyena, max: 14, walk: 1.3, run: 12, flee: 26, calm: 80, radius: 0.32, height: 0.85, health: 70, stride: 1.2, turn: 3.5, size: 1.05, forager: true, gaits: DOG, trotBand: 0.5, scavenger: true, call: 'hyena' },
  elephant: { ground: true, grade: 0.38, model: Models.elephant, max: 14, walk: 1.1, run: 7, flee: 16, calm: 45, radius: 1.5, height: 3.3, health: 600, stride: 2.6, turn: 1.0, size: 1.3, gaits: HOOF, trotBand: 0.6, swims: true, call: 'trumpet' },
  hippo: { ground: true, grade: 0.38, model: Models.hippo, max: 10, fearless: true, walk: 0.7, run: 8, flee: 0, calm: 20, radius: 1.0, height: 1.6, health: 420, stride: 1.2, turn: 1.4, size: 1.0, gaits: HOOF, trotBand: 0.7, swims: true, call: 'hippo' },
  // The desert's camels (a string of them, unbothered), and scorpions
  // there and in the badlands (small, and their sting poisons).
  camel: { ground: true, grade: 0.41, model: Models.camel, max: 16, walk: 1.2, run: 10, flee: 22, calm: 60, radius: 0.6, height: 2.2, health: 180, stride: 2.0, turn: 1.8, size: 1.0, gaits: HOOF, trotBand: 0.4, call: 'camel' },
  scorpion: { ground: true, grade: 0.9, model: Models.scorpion, max: 10, fearless: true, walk: 0.25, run: 1.4, flee: 0, calm: 3, radius: 0.12, height: 0.12, health: 3, stride: 0.06, turn: 4, size: 1.6, gaits: DOG, trotBand: 0.5 },
  // A python, by the jungle's water and in its trees' roots (see #snake).
  python: { serpent: true, model: Models.python, max: 6, walk: 0.3, run: 1.0, flee: 3, calm: 10, radius: 0.15, height: 0.2, health: 60, size: 1.0 },
  // Bats from the caves (at dusk, or startled by a torch), and eagles high
  // over the Smoky Mountains and the Black Hills.
  bat: { bird: true, model: Models.bat, max: 40, scale: 0.9, flee: 4, radius: 0.15, health: 1 },
  eagle: { bird: true, model: Models.eagle, max: 3, scale: 5.6, flee: 35, radius: 0.9, health: 16 },
  // Vultures: over the open, dry country, gathering in the sky over
  // anything dead (see #carrion); crows do the same in the woods.
  vulture: { bird: true, model: Models.vulture, max: 18, scale: 4.8, flee: 22, radius: 0.8, health: 10 },
  // Wild horses: a herd led by a stallion, on the open grassland (the
  // temperate highlands, the parkland, the savanna, the Black Hills). Shy:
  // they run from anything hunting and from you coming at them fast. Come
  // slowly with food in your hand and they settle (see #horse): a tame one
  // can be led, fed, saddled and ridden (see Game).
  horse: { ground: true, grade: 0.56, model: Models.horse, max: 30, walk: 1.5, run: 15, flee: 32, calm: 100, radius: 0.6, height: 1.8, health: 160, stride: 2.2, turn: 2.4, size: 1.08, gaits: HOOF, trotBand: 0.35, swims: true, call: 'neigh' },
  // Goats, gone wild: small bands on the hills, the scrub and the badlands'
  // edges (lower than the mountain goats). Lured with grain like sheep; a
  // tame nanny gives milk (a pail: see Game).
  goat: { ground: true, grade: 0.95, model: Models.goat, max: 30, walk: 1.0, run: 8, flee: 24, calm: 70, radius: 0.35, height: 0.95, health: 55, stride: 1.0, turn: 3, size: 1.0, gaits: HOOF, trotBand: 0.35, call: 'goat' },
  // Wild donkeys: small bands on the dry plains, the desert's edge and the
  // savanna, hardy and sure-footed. Settled like a horse; tame, it won't
  // take a saddle but carries big packs (see Game). A horse and a donkey,
  // both tame and fed close together: a mule, the best pack animal there is
  // (and one that can be ridden), though it never has young of its own.
  donkey: { ground: true, grade: 0.66, model: Models.donkey, max: 20, walk: 1.3, run: 11, flee: 26, calm: 90, radius: 0.5, height: 1.4, health: 120, stride: 1.8, turn: 2.6, size: 0.85, gaits: HOOF, trotBand: 0.35, swims: true, call: 'bray' },
  mule: { ground: true, grade: 0.66, model: Models.mule, max: 12, walk: 1.4, run: 13, flee: 28, calm: 90, radius: 0.55, height: 1.6, health: 150, stride: 2.0, turn: 2.5, size: 1.0, gaits: HOOF, trotBand: 0.35, swims: true, call: 'bray' },
};
// (Horses, donkeys, mules: settled, kept, fed and led alike.)
export const EQUINE = new Set(['horse', 'donkey', 'mule']);
// Hunting: how big a quarry each is (see wound), and the ones that will
// come for you (`predator`: how far off they see you, how near you can come
// before they come for you anyway, how hard they bite or swipe, how often,
// and from how far; a cougar ambushes).
const BULK = { horse: 'large', donkey: 'large', mule: 'large', lion: 'large', hyena: 'medium', elephant: 'huge', hippo: 'huge', camel: 'large', scorpion: 'small', python: 'medium', deer: 'large', elk: 'large', moose: 'large', bison: 'large', blackBear: 'large', grizzly: 'large', boar: 'large', wolf: 'medium', coyote: 'medium', sheep: 'medium', goat: 'medium', cougar: 'medium', fox: 'small', rabbit: 'small', hare: 'small', wolfPup: 'small', turkey: 'small', duck: 'small', snake: 'small' };
for (const [kind, sp] of Object.entries(SPECIES)) sp.bulk = BULK[kind] ?? 'small';
SPECIES.wolf.predator = { sight: 70, close: 22, bite: 11, every: 1.3, reach: 1.4 };
SPECIES.grizzly.predator = { sight: 55, close: 25, bite: 30, every: 1.7, reach: 2.0 };
SPECIES.blackBear.predator = { sight: 35, close: 16, bite: 22, every: 1.6, reach: 1.8 };
SPECIES.cougar.predator = { sight: 65, close: 0, bite: 24, every: 1.2, reach: 1.3, ambush: true };
SPECIES.tiger.predator = { sight: 70, close: 20, bite: 38, every: 1.4, reach: 1.8 };
SPECIES.panther.predator = { sight: 60, close: 0, bite: 26, every: 1.2, reach: 1.4, ambush: true };
SPECIES.jaguar.predator = { sight: 60, close: 0, bite: 32, every: 1.3, reach: 1.5, ambush: true };
SPECIES.crocodile.predator = { sight: 18, close: 0, bite: 40, every: 1.8, reach: 2.2, ambush: true };
// What each hunter hunts, besides you, and how keen it is on each (see
// #preyMind): the wolf pack runs down deer, elk, sheep (a moose or a bison
// only if young, old or hurt: they're too much for it otherwise); the
// coyote and the fox, rabbits and birds and lambs; the big cats, deer and
// pig and goat, stalked and rushed; lions the big game of the savanna; the
// crocodile whatever comes down to its water to drink; the bears now and
// then a calf. (A tame one, left out unguarded in the night, too: see
// #livestockOpen.)
const PREY = {
  wolf: { deer: 1, elk: 0.8, sheep: 1, goat: 1, mountainGoat: 0.7, rabbit: 0.4, hare: 0.4, boar: 0.45, moose: 0.3, bison: 0.25, horse: 0.35, donkey: 0.8, mule: 0.5, turkey: 0.3 },
  coyote: { rabbit: 1, hare: 1, turkey: 0.8, duck: 0.6, sheep: 0.45, goat: 0.4, deer: 0.15, mountainGoat: 0.3 },
  fox: { rabbit: 1, hare: 0.8, turkey: 0.5, duck: 0.7 },
  cougar: { deer: 1, sheep: 0.8, goat: 0.9, mountainGoat: 1, boar: 0.6, elk: 0.45, horse: 0.25, donkey: 0.5, rabbit: 0.3, turkey: 0.3 },
  panther: { deer: 1, boar: 0.8, turkey: 0.5, monkey: 0.4, sheep: 0.6 },
  jaguar: { boar: 1, deer: 0.8, monkey: 0.4, sheep: 0.6, crocodile: 0.15 },
  tiger: { deer: 1, boar: 1, elk: 0.7, bison: 0.3, horse: 0.4, sheep: 0.5 },
  lion: { bison: 0.8, horse: 0.9, camel: 0.6, deer: 0.8, donkey: 1, boar: 0.6, elephant: 0.05, hippo: 0.04 },
  hyena: { deer: 0.6, horse: 0.35, camel: 0.3, rabbit: 0.5, boar: 0.4, sheep: 0.6, donkey: 0.6 },
  crocodile: { deer: 1, horse: 0.8, bison: 0.6, boar: 0.8, sheep: 1, elk: 0.6, camel: 0.5, donkey: 0.8 },
  grizzly: { elk: 0.45, deer: 0.5, moose: 0.35, bison: 0.15, sheep: 0.6 },
  blackBear: { deer: 0.35, elk: 0.2, sheep: 0.5 },
};
// How a hunter goes about it: `stalk` (creep up close, unseen, before the
// rush: the cats) or not (the dogs trot up openly and run their quarry
// down, wearing it out); from how far it rushes; how long it keeps up the
// chase (the cats a few seconds; the wolf for a minute and more); when
// it's out hunting (dusk, night, day); how big a quarry it'll take on its
// own (bigger only if young, hurt, or for a pack).
const HUNTS = {
  wolf: { rush: 70, chase: 75, when: 'dark', takes: 'large' },
  coyote: { rush: 30, chase: 25, when: 'dark', takes: 'medium' },
  fox: { rush: 14, chase: 12, when: 'dark', takes: 'small', pounce: true },
  cougar: { stalk: true, rush: 18, chase: 9, when: 'dusk', takes: 'large', pounce: true },
  panther: { stalk: true, rush: 16, chase: 9, when: 'dusk', takes: 'large', pounce: true },
  jaguar: { stalk: true, rush: 15, chase: 8, when: 'dusk', takes: 'large', pounce: true },
  tiger: { stalk: true, rush: 22, chase: 10, when: 'dusk', takes: 'large', pounce: true },
  lion: { stalk: true, rush: 30, chase: 14, when: 'dusk', takes: 'large' },
  hyena: { rush: 50, chase: 45, when: 'night', takes: 'large' },
  crocodile: { stalk: true, rush: 7, chase: 2.5, when: 'any', takes: 'large', water: true },
  grizzly: { rush: 35, chase: 16, when: 'day', takes: 'medium' },
  blackBear: { rush: 25, chase: 12, when: 'day', takes: 'medium' },
};
const SIZE_RANK = { small: 0, medium: 1, large: 2, huge: 3 };
// (Lions hunt at dusk and in the dark, lying up by day; hyenas are bold only at night.)
SPECIES.lion.predator = { sight: 60, close: 16, bite: 34, every: 1.4, reach: 1.7, dusk: true };
SPECIES.hyena.predator = { sight: 45, close: 10, bite: 15, every: 1.1, reach: 1.3, night: true };
// The ones that stand up for themselves: charge you if you come too close
// (`close`; `rut`: nearer in the autumn, a bull or buck; `young`: a mother
// by her calf or piglets in spring), or when hurt (`hurt`), and then make off.
SPECIES.moose.charger = { close: 6, rut: 16, young: 18, hit: 30, reach: 2.2, hurt: true };
SPECIES.boar.charger = { close: 5, young: 10, hit: 18, reach: 1.2, hurt: true };
SPECIES.elk.charger = { close: 0, rut: 10, young: 12, hit: 22, reach: 2.0, warn: 1.2, cry: 'bleat' }; // (a cow elk with her calf: she stamps, then comes at you)
SPECIES.deer.charger = { close: 0, rut: 5, young: 7, hit: 12, reach: 1.5, warn: 1.2, cry: 'snort' }; // (a doe by her fawn: a warning stamp and snort, then a rush)
SPECIES.bison.charger = { close: 7, young: 10, hit: 35, reach: 2.2 };
// (An elephant: only if you crowd it, or its calves, or hurt it; a hippo:
// anywhere near it, near the water; a scorpion stings what steps on it.
// Each warns first: see `warn` and #charge.)
SPECIES.elephant.charger = { close: 9, young: 22, hit: 60, reach: 3.2, hurt: true, warn: 1.6, cry: 'trumpet' };
SPECIES.hippo.charger = { close: 16, young: 20, hit: 50, reach: 2.6, hurt: true, warn: 1.2, cry: 'hippo' };
SPECIES.scorpion.charger = { close: 1.6, hit: 6, reach: 0.35, warn: 0.9, cry: 'scorpion', venom: true };
SPECIES.camel.charger = { close: 0, hit: 12, reach: 1.6, hurt: true, warn: 0.8, cry: 'camel' };
// How many blows to the body each size takes to go lame, to go down, and to
// die (a blow to the head brings one down; one more finishes it).
const BLOWS = { huge: [6, 10, 13], large: [3, 5, 6], medium: [2, 3, 4], small: [1, 2, 2] };

/**
 * The great beasts: one of each biome's (and one of the caves'), a bigger,
 * scarred, darker or paler version of its kind, with a name, keeping to its
 * territory (see #bosses). `coat`: its colouring (a multiplier: under 1 darker, over 1 paler); `tough`: how many times the blows to bring it
 * down; `bite` or `hit` (and how often), always telegraphed (a long
 * wind-up or threat); `prime`: what only it gives when butchered (with a
 * big `haul`), for the trophy recipes.
 */
export const BOSSES = {
  scar: { kind: 'grizzly', name: 'Old Scar', biomes: ['smoky', 'blackHills'], scale: 1.65, coat: [0.72, 0.68, 0.66], tough: 5, bite: 42, every: 2.4, prime: 'grizzlyPelt', haul: { rawMeat: 14, fur: 5 } },
  greymane: { kind: 'wolf', name: 'Greymane', biomes: ['pine'], scale: 1.5, coat: [1.45, 1.45, 1.5], tough: 6, bite: 30, every: 1.9, pack: 5, prime: 'alphaFang', haul: { rawMeat: 5, fur: 3 } },
  ghost: { kind: 'cougar', name: 'The Pale Ghost', biomes: ['redwood'], scale: 1.5, coat: [1.5, 1.48, 1.52], tough: 6, bite: 38, every: 2.0, prime: 'paleFur', haul: { rawMeat: 6, fur: 3 } },
  oldBull: { kind: 'moose', name: 'The Old Bull', biomes: ['parkland'], scale: 1.45, coat: [0.72, 0.7, 0.68], tough: 4, hit: 55, antlers: true, prime: 'greatAntlers', haul: { rawMeat: 20, hide: 5 } },
  thunderhead: { kind: 'bison', name: 'Thunderhead', biomes: ['temperate'], scale: 1.5, coat: [0.68, 0.64, 0.62], tough: 4, hit: 55, prime: 'greatHide', primeCount: 2, haul: { rawMeat: 16, hide: 6 } },
  oldJaw: { kind: 'crocodile', name: 'Old Jaw', biomes: ['wetland', 'mangrove'], scale: 1.75, coat: [0.78, 0.84, 0.72], tough: 4, bite: 48, every: 2.6, prime: 'crocHide', haul: { rawMeat: 14, hide: 5 } },
  kingmane: { kind: 'lion', name: 'Kingmane', biomes: ['savanna'], scale: 1.5, coat: [0.86, 0.78, 0.72], tough: 5, bite: 40, every: 2.0, antlers: true, prime: 'lionPelt', haul: { rawMeat: 12, fur: 5 } },
  shadow: { kind: 'tiger', name: 'The Striped Shadow', biomes: ['jungle'], scale: 1.45, coat: [0.8, 0.7, 0.68], tough: 5, bite: 44, every: 2.1, prime: 'tigerPelt', haul: { rawMeat: 12, fur: 5 } },
  rattler: { kind: 'snake', name: 'The Old Rattler', biomes: ['desert', 'badlands'], scale: 4.6, coat: [0.82, 0.76, 0.68], tough: 18, bite: 30, prime: 'venomSac', primeCount: 3, haul: { rawMeat: 4 } },
  ironhide: { kind: 'boar', name: 'Ironhide', biomes: ['volcanic'], scale: 1.75, coat: [0.6, 0.6, 0.64], tough: 5, hit: 45, prime: 'boarTusk', haul: { rawMeat: 14, hide: 4 } },
  caveBear: { kind: 'grizzly', name: 'The Cave Bear', cave: true, scale: 1.75, coat: [0.55, 0.52, 0.52], tough: 6, bite: 45, every: 2.4, prime: 'caveBearPelt', haul: { rawMeat: 15, fur: 6 } },
};
const BOSS_KINDS = new Set(Object.values(BOSSES).map((b) => b.kind));
const BOSS_RESPAWN_DAYS = 6; // (game days before another of the same rises)
const BOSS_CELL = 2000; // (each 2 km of the land, a one-in-ten chance of its biome's great beast)
// What a carcass gives when butchered.
const YIELD = {
  sheep: { rawMeat: 3, wool: 3 }, wolfPup: { rawMeat: 1 }, deer: { rawMeat: 4, hide: 1 }, elk: { rawMeat: 6, hide: 2 }, moose: { rawMeat: 9, hide: 2 },
  bison: { rawMeat: 6, hide: 2 }, blackBear: { rawMeat: 5, fur: 2 }, grizzly: { rawMeat: 6, fur: 2 }, wolf: { rawMeat: 2, fur: 1 }, coyote: { rawMeat: 2, fur: 1 },
  fox: { rawMeat: 1, fur: 1 }, beaver: { rawMeat: 2, fur: 2 }, rabbit: { rawMeat: 1 }, hare: { rawMeat: 1, fur: 1 }, boar: { rawMeat: 5, hide: 1 }, cougar: { rawMeat: 3, fur: 1 },
  tiger: { rawMeat: 6, fur: 2 }, jaguar: { rawMeat: 4, fur: 1 }, monkey: { rawMeat: 1 }, panther: { rawMeat: 3, fur: 1 }, panda: { rawMeat: 5, fur: 2 }, crocodile: { rawMeat: 6, hide: 2 }, mountainGoat: { rawMeat: 3, wool: 1, hide: 1 }, goat: { rawMeat: 3, hide: 1 },
  turkey: { rawFowl: 2, feather: 3 }, duck: { rawFowl: 1, feather: 2 }, owl: { rawFowl: 1, feather: 2 }, snake: { rawMeat: 1 },
  lion: { rawMeat: 5, fur: 2 }, hyena: { rawMeat: 2, fur: 1 }, elephant: { rawMeat: 20, hide: 4 }, hippo: { rawMeat: 14, hide: 3 }, camel: { rawMeat: 7, hide: 2 },
  python: { rawMeat: 3, hide: 1 }, eagle: { feather: 4 }, bat: {}, scorpion: {}, horse: { rawMeat: 8, hide: 2 }, donkey: { rawMeat: 6, hide: 2 }, mule: { rawMeat: 7, hide: 2 },
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
// The colour each kind's eyes shine back in torchlight (most a green-gold).
const SHINE = { deer: 0xd8f060, elk: 0xd8f060, moose: 0xe8d050, wolf: 0xc8f080, coyote: 0xc8f080, fox: 0xf0c050, cougar: 0x90f070, panther: 0x90f070, jaguar: 0x90f070, tiger: 0x90f070, lion: 0xa8f060,
  blackBear: 0xff8040, grizzly: 0xff8040, rabbit: 0xff6a40, hare: 0xff6a40, sheep: 0xe8e080, mountainGoat: 0xe8e080, boar: 0xe0a060, bison: 0xd8c060, horse: 0x90d8f0, crocodile: 0xff5030, hyena: 0xd8f060, owl: 0xffa040 };
const ik = { rz: 0, a1: 0, a2: 0, kx: 0, ky: 0, kz: 0 }, foot = { x: 0, y: 0, z: 0 };
const ray = new Raycaster();
const view = new Frustum(), viewMatrix = new Matrix4(), sphere = new Sphere();
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
/**
 * How far a beast can drop its head before the skull sinks into its own
 * chest: the turn down (about the head's pivot) at which more of the
 * skull lies deep inside the body than at rest (its own `headMax`, if it
 * says).
 */
function headReach(model) {
  const sk = model.skull, hp = model.headPivot;
  if (!sk || !model.torso) return Infinity;
  const inside = (rx) => {
    let n = 0, all = 0;
    const c = Math.cos(rx), sn = Math.sin(rx);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      const x = sk[0] + (i / 2) * sk[3], y = sk[1] + (j / 2) * sk[4], z = sk[2] + (k / 2) * sk[5];
      const wy = hp[1] + y * c - z * sn, wz = hp[2] + y * sn + z * c, wx = hp[0] + x;
      all++;
      if (model.torso.some(([tx, ty, tz, hx, hy, hz]) => Math.abs(wx - tx) < hx * 0.85 && Math.abs(wy - ty) < hy * 0.85 && Math.abs(wz - tz) < hz * 0.85)) n++;
    }
    return n / all;
  };
  const rest = inside(0);
  for (let rx = 0.05; rx <= 1.6; rx += 0.05) if (inside(rx) > rest + 0.15) return Math.max(0.15, rx - 0.05);
  return Infinity;
}

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
        mesh.userData.wildlife = true; // (see the animals-only view: main)
        scene.add(mesh);
        meshes[name] = mesh;
      };
      if (sp.ground) {
        const n = model.legs.length / 2;
        make('body', model.body, sp.max, true);
        make('head', model.head, sp.max, true);
        make('antlers', model.antlers, sp.max, true);
        make('saddle', model.saddle, sp.max, true);
        if (BOSS_KINDS.has(kind)) {
          const fur = Models.bossFur(model, kind);
          make('furBody', fur.body, 4, true);
          make('furHead', fur.head, 4, true);
        }
        make('fan', model.fan, sp.max, true);
        make('wingL', model.wingL, sp.max, false);
        make('wingR', model.wingR, sp.max, false);
        if (model.fore) make('foreUpper', model.fore.upper, sp.max * 2, true), make('foreLower', model.fore.lower, sp.max * 2, true);
        make('hindUpper', model.hind.upper, sp.max * n, true);
        make('hindLower', model.hind.lower, sp.max * n, true);
        if (sp.tinted || BOSS_KINDS.has(kind)) for (const m of Object.values(meshes)) m.setColorAt(0, white);
        model.body.computeBoundingBox();
        model.headMax ??= headReach(model);
      } else if (sp.serpent) {
        make('segment', model.segment, sp.max * model.segments, true);
        make('head', model.head, sp.max, true);
        make('rattle', model.rattle, sp.max, false);
        if (BOSS_KINDS.has(kind)) for (const m of Object.values(meshes)) m.setColorAt(0, white);
      } else {
        make('body', model.body, sp.max, kind === 'hawk' || kind === 'gull' || kind === 'vulture');
        make('wingL', model.wingL, sp.max, kind === 'hawk' || kind === 'gull' || kind === 'vulture');
        make('wingR', model.wingR, sp.max, kind === 'hawk' || kind === 'gull' || kind === 'vulture');
      }
      this.rigs[kind] = { model, meshes, coloured: sp.tinted || sp.coloured || BOSS_KINDS.has(kind) };
    }
    // Wounds: a dark red mark on a creature where each blow or shot went in.
    this.woundMesh = new InstancedMesh(new BoxGeometry(0.07, 0.07, 0.07), new MeshLambertMaterial({ color: 0x8a0c0c, emissive: 0x3a0404 }), 256);
    this.woundMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.woundMesh.frustumCulled = false;
    this.woundMesh.count = 0;
    this.woundMesh.name = 'wounds';
    scene.add(this.woundMesh);
    // Eyeshine: at night, by the light of a torch or a fire near you, the
    // eyes of the animals looking your way shine back out of the dark
    // (green, gold, a bear's or a bird's orange-red), a point of light seen
    // far off; brightest looking straight at you.
    this.shineMesh = new InstancedMesh(new OctahedronGeometry(1, 1), new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }), 160);
    this.shineMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shineMesh.setColorAt(0, new Color());
    this.shineMesh.frustumCulled = false;
    this.shineMesh.count = 0;
    this.shineMesh.name = 'eyeshine';
    scene.add(this.shineMesh);
    this.probe = new Mesh(undefined, this.material); // (for testing a ray against a creature's shape)
    this.animals = []; // every creature: { kind, x, y, z, heading, pitch, roll, scale, alive, health, ... }
    this.herds = [];
    this.flocks = [];
    this.wait = 0;
    this.crowCooldown = 0;
    this.time = 0;
    // What lives in each chunk of the land (see #settle): "cx,cz" -> { animals, herds, birds }.
    this.homes = new Map();
    this.remoteCrowns = new Map(); // (online, the host's: the trees round the others, "cx,cz" -> crowns, as they send them)
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
    this.remoteCrowns.clear();
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
    if (a.kind === 'sheep') this.ctx?.sound?.call('baa', this.ctx.pan(a.x, a.z), 0.5);
  }

  /**
   * A tame horse's needs: it gets hungry and thirsty (two days without
   * grazing, a day and a bit without water), grazes when it's left be,
   * goes to drink when it's thirsty (if there's water near), and tires
   * galloping (`stamina`). Starved or parched too long, it dies.
   */
  #horseNeeds(a, dt, ctx) {
    const sp = SPECIES[a.kind];
    a.hunger = Math.max(0, (a.hunger ?? 80) - dt * (100 / 2880));
    a.thirst = Math.max(0, (a.thirst ?? 80) - dt * (100 / 1800));
    if (!a.ridden && !a.led && a.state === 'graze') a.hunger = Math.min(100, a.hunger + dt * 0.7);
    const w = ctx.waterAt?.(a.x + Math.sin(a.heading) * 1.5, a.z + Math.cos(a.heading) * 1.5);
    if (w && !a.ridden) a.thirst = Math.min(100, a.thirst + dt * 4);
    if (a.ridden && w) a.thirst = Math.min(100, a.thirst + dt * 2);
    // (Thirsty, left be: off to the water, if there's any near.)
    if (!a.ridden && !a.led && a.thirst < 35 && !a.goal?.water && (a.waterLook = (a.waterLook ?? 0) - dt) <= 0) {
      a.waterLook = 20;
      const found = this.#findWater(a.x, a.z, ctx);
      if (found) (a.goal = { x: found.bx, z: found.bz, water: true }), (a.state = 'walk'), (a.timer = 30);
    }
    if (a.goal?.water && a.thirst > 95) a.goal = null;
    const going = a.ridden && a.speed > sp.walk * 4;
    a.stamina = Math.max(0, Math.min(100, (a.stamina ?? 100) + dt * (going ? (a.saddled === 'great' ? -6 : -9) : a.speed > sp.walk * 1.5 ? 2 : 12)));
    // Starving, or dying of thirst.
    if (a.hunger <= 0 || a.thirst <= 0) {
      a.starving = (a.starving ?? 0) + dt;
      if (a.starving > 300 && a.alive) {
        this.wound(a, { head: true });
        this.wound(a, { head: true });
      }
    } else a.starving = 0;
  }

  /**
   * A tame sheep fed: if another's been fed lately close by, a lamb.
   * Returns the lamb, if there is one.
   */
  feed(a) {
    if (a.mirrored) return this.onAct?.('feed', a), null;
    a.fed = this.time;
    // (A mule never has young; a horse with a donkey has a mule. Once a
    // mother's had one, a while (two days) before she has another.)
    if (a.young || a.kind === 'mule' || this.time < (a.bred ?? -1e9) + 1440) return null;
    const cross = (k) => (k === a.kind ? a.kind : (k === 'horse' && a.kind === 'donkey') || (k === 'donkey' && a.kind === 'horse') ? 'mule' : null);
    const mate = this.animals.find((m) => m !== a && m.tame && m.alive && !m.young && cross(m.kind) && this.time - (m.fed ?? -1e9) < 90 && this.time >= (m.bred ?? -1e9) + 1440 && Math.hypot(m.x - a.x, m.z - a.z) < 10);
    if (!mate) return null;
    const kind = cross(mate.kind);
    a.fed = mate.fed = -1e9;
    if (EQUINE.has(a.kind)) a.bred = mate.bred = this.time;
    const lamb = this.#spawnWalker(kind, (a.x + mate.x) / 2, (a.z + mate.z) / 2, null, { young: 0.5, mother: a });
    if (lamb) {
      this.#tame(lamb);
      lamb.growth = 0;
      if (EQUINE.has(kind)) Object.assign(lamb, { hunger: 90, thirst: 90, stamina: 100 });
      if (kind === 'goat') lamb.billy = Math.random() < 0.5;
    }
    return lamb;
  }

  /**
   * The young growing up (a tame one, over two days): bigger by the day,
   * till it's grown.
   */
  #growUp(a, dt) {
    if (!a.young || !a.tame || a.growth === undefined) return;
    a.adultScale ??= a.scale / (typeof a.young === 'number' ? a.young : 0.5);
    a.growth = Math.min(1, a.growth + dt / 2880);
    a.scale = a.adultScale * (0.5 + 0.5 * a.growth);
    if (a.growth >= 1) (a.young = false), (a.growth = undefined), (a.mother = null);
  }

  /** The great beasts brought down, and when (world day): { lair key: day }, to save. */
  bossJSON() {
    return { ...(this.bossDeaths ?? {}) };
  }

  loadBosses(deaths) {
    this.bossDeaths = { ...(deaths ?? {}) };
    for (const a of this.animals) if (a.boss) a.gone = true;
    this.bossLive = new Map();
  }

  /** A great beast's health left (0..1). */
  static bossHealth(a) {
    if (a.mirrored) return a.bossHealth ?? 1;
    if (!a.alive) return 0;
    const sp = SPECIES[a.kind], [, , dead] = sp.bird || a.kind === 'snake' ? [1, 1, 1] : BLOWS[sp.bulk];
    return Math.max(0, 1 - (a.hits ?? 0) / (dead * a.boss.tough));
  }

  /** Your tame animals, to save: [{ kind, x, z, young, sheared }]. */
  tameJSON() {
    return this.animals.filter((a) => a.tame && a.alive && !a.gone).map((a) => ({
      kind: a.kind, x: +a.x.toFixed(1), z: +a.z.toFixed(1), young: a.young ? +(0.5 + 0.5 * (a.growth ?? 0)).toFixed(3) : 0, sheared: a.sheared ? Math.max(0, Math.round(this.time - a.sheared)) : null,
      ...(EQUINE.has(a.kind) ? { saddled: a.saddled === 'great' ? 'great' : !!a.saddled, hunger: Math.round(a.hunger ?? 80), thirst: Math.round(a.thirst ?? 80), stallion: !!a.stallion, bags: a.bags ? a.bags.slots : null, bred: a.bred ? Math.round(this.time - a.bred) : null } : {}),
      ...(a.kind === 'goat' ? { billy: !!a.billy, milked: a.milked ? Math.round(this.time - a.milked) : null } : {}),
    }));
  }

  /** Brings back your tame animals (once the land's there under them). */
  loadTame(list) {
    for (const a of this.animals) if (a.tame) a.gone = true;
    this.pendingTame = list ?? [];
  }

  /** Shears a sheep (online, the host's: theirs to shear). */
  shear(a) {
    a.sheared = this.time;
    if (a.mirrored) this.onAct?.('shear', a);
  }

  /** The host, online: what one of the others did to one of the animals (see onAct). */
  act(k, id, o = {}) {
    const a = this.animals.find((a) => a.id === id && !a.gone);
    if (!a) return;
    if (k === 'wound') {
      const v = (p) => (p ? { x: p[0], y: p[1], z: p[2] } : null);
      this.wound(a, { head: !!o.head, sharp: Number(o.sharp) || 1, from: v(o.from), hit: o.local ? { local: v(o.local), frame: o.frame } : null });
    } else if (k === 'butcher' && !a.alive) {
      a.gone = true;
    } else if (k === 'feed') this.feed(a);
    else if (k === 'shear') a.sheared = this.time;
  }

  /** Puts a creature at (x, z) (for testing; `o` as #spawnWalker). */
  spawn(kind, x, z, o = {}) {
    if (!this.ctx) return null;
    return SPECIES[kind]?.serpent ? this.#spawnSnake(x, z, kind) : this.#spawnWalker(kind, x, z, null, o);
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
    // (Online, the host's animal: it's the host's to wound; and here, for
    // now, as it will be there.)
    if (a.mirrored) {
      this.onAct?.('wound', a, { head, sharp, from: from ? [from.x, from.y, from.z] : null, local: hit?.local ? [hit.local.x, hit.local.y, hit.local.z] : null, frame: hit?.frame ?? null });
      a.localUntil = this.time + 1.5;
    }
    const sp = SPECIES[a.kind];
    // Where it went in: a mark, and it flinches.
    if (hit?.local && !a.boss) {
      a.marks = a.marks ?? [];
      if (a.marks.length >= 6) a.marks.shift();
      a.marks.push({ head: hit.frame === 'head', x: hit.local.x, y: hit.local.y, z: hit.local.z });
    }
    if (from) {
      const dx = a.x - from.x, dz = a.z - from.z, d = Math.hypot(dx, dz) || 1;
      a.jolt = { x: dx / d, z: dz / d, t: 0.3 };
    }
    let [lame, down, dead] = sp.bird || a.kind === 'rabbit' || a.kind === 'snake' || a.kind === 'duck' || a.kind === 'scorpion' ? [1, 1, 1] : BLOWS[sp.bulk];
    // (A great beast takes many times the blows, never lamed or brought
    // down before the end; a blow to its head is only a harder one.)
    if (a.boss) {
      dead *= a.boss.tough;
      lame = down = Infinity;
      if (head) (sharp *= 2), (head = false);
      a.bossHurt = this.time;
    }
    let outcome;
    if (a.down) outcome = 'dead';
    else if (head) outcome = dead <= 1 ? 'dead' : 'down';
    else {
      a.hits = (a.hits ?? 0) + sharp;
      outcome = a.hits >= dead ? 'dead' : a.hits >= down ? 'down' : a.hits >= lame ? 'lame' : 'hit';
    }
    const cry = { deer: 'bleat', elk: 'bleat', sheep: 'baa', boar: 'squeal', moose: 'bellow', bison: 'grunt', rabbit: 'squeak', hare: 'squeak', turkey: 'gobble', duck: 'quack' }[a.kind];
    if (cry) this.ctx?.sound?.call(cry, this.ctx.pan(a.x, a.z), 0.6);
    if (outcome === 'dead' && a.boss && !a.mirrored) {
      (this.bossDeaths ??= {})[a.bossKey] = Math.round((this.ctx?.worldDay ?? 0) * 100) / 100;
      this.onBossDeath?.(a);
    }
    if (outcome === 'dead') {
      a.alive = false;
      a.down = false;
      a.hunting = false;
      a.charging = 0;
      a.state = sp.bird ? 'falling' : 'dead';
      a.deadTime = 0;
      a.side = a.side ?? (Math.random() < 0.5 ? 1 : -1);
      const was = Math.atan2(Math.sin(a.roll ?? 0), Math.cos(a.roll ?? 0));
      // (Already down on its side: it stays there. Otherwise from near upright.)
      if (Math.abs(was) > 0.8) (a.side = Math.sign(was)), (a.roll = was);
      else a.roll = was * 0.3;
      a.vy = 0;
      a.feet = null;
      // (Going down like a ragdoll: carried on a little by its own speed,
      // toppling over faster and faster, a bounce as it hits the ground.)
      a.rag = Math.abs(a.roll) > 0.8 ? null : { t: 0, v: Math.min(8, a.speed ?? 0), w: a.side * (0.6 + Math.random() * 0.6) + a.side * Math.min(2, (a.speed ?? 0) * 0.2), bounced: 0 };
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
    else if ((sp.charger?.hurt || (a.boss && sp.charger)) && !a.lame && !a.down && !a.young) this.#charge(a);
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
    if (a.mirrored) this.onAct?.('butcher', a);
    const stuck = this.#unstick(a);
    const got = { ...(a.boss ? a.boss.haul : YIELD[a.kind] ?? { rawMeat: 1 }) };
    if (a.boss) got[a.boss.prime] = a.boss.primeCount ?? 1;
    if (a.young) for (const k of Object.keys(got)) got[k] = Math.max(1, Math.floor(got[k] / 2));
    // (Picked at by scavengers first: less of it.)
    if (a.picked) got.rawMeat = Math.max(0, (got.rawMeat ?? 0) - Math.ceil(a.picked));
    // (Trophies for the wall, from the great ones: a stag's antlers, a bear's claws, a wolf's skull.)
    if (!a.boss && !a.young) {
      if (a.antlers) got[{ deer: 'deerAntlers', elk: 'elkAntlers', moose: 'mooseAntlers' }[a.kind] ?? 'deerAntlers'] = 1;
      else if (a.kind === 'blackBear' || a.kind === 'grizzly') got.bearClaws = 1;
      else if (a.kind === 'wolf' || a.kind === 'cougar') got[a.kind === 'wolf' ? 'wolfSkull' : 'cougarSkull'] = 1;
    }
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
    // (Spooked, a herd runs a long way, and keeps going a good while.)
    herd.fleeTime = 25;
  }

  /**
   * Something landed or flew past near (x, z) (an arrow that missed): each
   * animal (or herd) within `r` either bolts, half the time, or stops, head
   * up, and looks about for what it was.
   */
  startle(x, z, r = 8) {
    for (const a of this.animals) {
      if (!a.alive || a.tame || a.hunting || SPECIES[a.kind].predator || SPECIES[a.kind].bird) continue;
      if (Math.hypot(a.x - x, a.z - z) > r) continue;
      const holder = a.herd ?? a;
      if (this.time - (holder.startled ?? -99) < 4) continue; // (once for the one arrow)
      holder.startled = this.time;
      holder.bolt = Math.random() < 0.5;
      if (holder.bolt) {
        if (a.herd) this.#alarm(a.herd, x, z);
        else (a.fear = 12), (a.fearFrom = { x, z });
      }
      for (const m of a.herd ? a.herd.members : [a]) {
        if (!m.alive || holder.bolt) continue;
        m.state = 'alert';
        m.timer = rnd(4, 8);
        m.alertCool = rnd(15, 30);
        m.lookAround = true;
      }
    }
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
  // (Never without a warning: first it stands its ground and threatens, a
  // moment, facing you (an elephant rearing and trumpeting, a hippo's
  // gaping honks, a scorpion's sting arched over): back away, and it may
  // let you go; stay, and it comes. See `threaten` in #walker.)
  #charge(a) {
    if (a.charging > 0 || (a.chargeCool ?? 0) > 0) return;
    const ch = SPECIES[a.kind].charger;
    a.charging = 5;
    a.threaten = a.boss ? 1.4 : ch?.warn ?? 0.7; // (a great beast's longer: you'll see it coming)
    a.fear = 0;
    a.hibernating = false;
    const cry = ch?.cry ?? { boar: 'squeal', moose: 'bellow', elk: 'bugle', bison: 'grunt', deer: 'snort' }[a.kind];
    this.ctx?.sound?.call(cry ?? 'snort', this.ctx.pan(a.x, a.z), 0.9);
    if (a.herd) a.herd.fleeTime = 0;
  }

  // A great beast: it comes for you when you're in its territory (a hunter
  // when you're within 30 m, one that charges within 22), keeps near its
  // lair, and gives up and goes back to it if you lead it too far away.
  #bossMind(a, sp, t, ctx) {
    const p = ctx.player, onFoot = p && p.mode === 'walk' && p.alive && !ctx.tame;
    const home = Math.hypot(a.x - a.lair.x, a.z - a.lair.z);
    const youFromLair = p ? Math.hypot(p.x - a.lair.x, p.z - a.lair.z) : Infinity;
    if (home > 90 || youFromLair > 110) {
      a.hunting = false;
      a.charging = 0;
      a.notice = 0;
      a.goal = { x: a.lair.x, z: a.lair.z };
      a.home = a.goal;
      if (a.herd) a.herd.hunting = false;
      return;
    }
    if (!onFoot) return;
    if (sp.predator && t.d < 30 && !a.hunting) this.#enrage(a);
    else if (sp.charger && t.d < 22 && !(a.charging > 0) && (a.chargeCool ?? 0) <= 0) this.#charge(a);
  }

  // A wolf or a bear watching for you: it notices you if you're in sight a
  // while (less far off if you keep low, or the trees are thick between,
  // further if the wind carries your scent to it), and warns you (a growl,
  // a snarl) and comes stalking before it charges; up close, or at its den,
  // at once. It gives up once you're well away.
  #stalk(a, sp, t, dt, ctx) {
    const p = ctx.player, pr = sp.predator;
    // (Intent on other quarry: it pays you no mind unless you come right up.)
    if (a.chase && t.d > 15 && !a.hunting) return void (a.notice = 0), (a.stalking = false);
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
    const cubs = a.herd && (a.kind === 'blackBear' || a.kind === 'grizzly') && !a.young && a.herd.members.some((m) => m.young && m.alive);
    // (Lions by day, hyenas but in the dark: lying up, seldom troubled unless you come right up.)
    const idle = (pr.dusk && (ctx.dusk ?? 0) < 0.15 && ctx.day > 0.35) || (pr.night && ctx.day > 0.3);
    const sight = pr.sight * (p.crouch ? 0.55 : 1) * (0.7 + 0.3 * ctx.day) * (1 - 0.55 * (a.forest ?? 0)) * this.#scent(a, ctx) * (idle ? 0.3 : 1);
    if (t.d < pr.close * (p.crouch ? 0.7 : 1) * (cubs ? 1.6 : 1) * (idle ? 0.5 : 1) || atDen) a.notice = Math.max(a.notice ?? 0, 2.4);
    else if (t.d < sight) a.notice = (a.notice ?? 0) + dt;
    else a.notice = Math.max(0, (a.notice ?? 0) - dt * 0.5);
    // (A warning first: you hear it before it comes.)
    a.stalking = !a.hunting && a.notice > 0.6;
    if (a.stalking && !a.warned) {
      a.warned = true;
      ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : a.kind === 'hyena' ? 'hyena' : 'growl', ctx.pan(a.x, a.z), Math.min(0.9, 25 / (t.d + 10)));
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

  // --- Hunting the other animals -------------------------------------------------

  /**
   * Whether a tame animal (yours) is there for the taking: in the night, or
   * with no one about; not by a fire, not shut in (four or more lengths of
   * fence, wall or gate round about it: a pen).
   */
  #livestockOpen(b, ctx) {
    const c = ctx.camera.position;
    if (ctx.night < 0.45 && Math.hypot(b.x - c.x, b.z - c.z) < 90) return false;
    if (this.#fireAt(b.x, b.z, ctx, 4)) return false;
    let fence = 0;
    for (const st of ctx.structures?.list ?? []) {
      if (!/fence|Fence|wall|Wall|gate|Gate/.test(st.type)) continue;
      if (Math.abs(st.x - b.x) < 12 && Math.abs(st.z - b.z) < 12 && ++fence >= 4) return false;
    }
    return true;
  }

  // Whether it's its time to be out hunting (the cats at dusk and in the
  // dark, the dogs dark or dawn, the bears by day), and how keen: a little
  // even off its hours, if hungry enough.
  #huntHour(h, ctx) {
    const dark = ctx.night ?? 0, edge = Math.max(ctx.dawn ?? 0, ctx.dusk ?? 0);
    return h.when === 'any' ? 1 : h.when === 'day' ? 0.3 + 0.7 * (ctx.day ?? 1) : h.when === 'night' ? Math.max(0.15, dark) : h.when === 'dusk' ? Math.max(0.15, edge * 1.5, dark) : Math.max(0.25, dark, edge * 1.3);
  }

  // A hunter, now and then, looking about for something to hunt: when it's
  // hungry (it's eaten well, it lets them be for a day or so), at its hour,
  // and not with you close by. The pack hunts together (one finds, they all
  // go). The quarry it picks: what it hunts, near enough, best the young,
  // the hurt, the slow; on its own, nothing too big for it.
  #preyMind(a, sp, dt, ctx) {
    const h = HUNTS[a.kind];
    a.hunger = Math.min(1, (a.hunger ?? Math.random() * 0.9) + dt / (a.kind === 'crocodile' ? 1200 : 520));
    if (a.hunting || a.stalking || a.scavenge || a.raid || a.hibernating) return void (a.chase && (a.chaseEnded = 'busy'), (a.chase = null));
    if (a.chase) return;
    const pack = a.herd?.members.filter((m) => m.alive && m !== a && SPECIES[m.kind].predator) ?? [];
    // (A packmate's already onto something: in with it.)
    const mate = pack.find((m) => m.chase?.prey?.alive && m.chase.phase !== 'feed');
    if (mate && Math.hypot(mate.x - a.x, mate.z - a.z) < 120) {
      a.chase = { prey: mate.chase.prey, phase: mate.chase.phase, t: 0, side: Math.random() < 0.5 ? -1 : 1, wide: rnd(4, 12) };
      return;
    }
    a.preyWait = (a.preyWait ?? rnd(0, 3)) - dt;
    if (a.preyWait > 0 || a.hunger < 0.5) return;
    a.preyWait = rnd(2, 4);
    if (Math.random() > this.#huntHour(h, ctx)) return;
    const c = ctx.camera.position;
    if (Math.hypot(a.x - c.x, a.z - c.z) < 28 && ctx.player?.mode === 'walk') return; // (you about: it keeps off)
    const sight = h.water ? 14 : h.stalk ? 110 : 160, ranks = SIZE_RANK[h.takes], group = pack.length > 1;
    let best = null, score = 0;
    for (const b of this.animals) {
      const w = PREY[a.kind]?.[b.kind];
      if (!w || !b.alive || b.flying || b.swimming || b.boss || b.ridden || b.gone || b.mirrored) continue;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > sight) continue;
      const weak = b.young || b.lame || b.hits || b.down;
      // (Too big for it alone: only if weak, or the pack's together.)
      if (SIZE_RANK[SPECIES[b.kind].bulk] > ranks && !weak && !group) continue;
      // (The crocodile: only what's come right down to the water.)
      if (h.water && !(b.state === 'drink' || d < 6)) continue;
      if (b.tame && !this.#livestockOpen(b, ctx)) continue;
      const v = w * (weak ? 3 : 1) * (b.tame ? 1.3 : 1) / (1 + d / 40);
      if (v > score) (score = v), (best = b);
    }
    if (!best) return;
    a.chase = { prey: best, phase: h.stalk && !(best.herd?.fleeTime > 0) ? 'stalk' : 'approach', t: 0, side: Math.random() < 0.5 ? -1 : 1, wide: rnd(4, 12) };
  }

  // The hunt, a step at a time: { want, speed }, or null (it's over).
  //  - approaching (the dogs, openly) or stalking (the cats, low and slow,
  //    stopping still when its quarry looks up), till it's within its rush;
  //  - the rush, and the chase (its quarry, and its herd, running for it);
  //    the cats spend themselves in a few seconds, the dogs keep on and on;
  //  - caught: bitten down (the bigger the quarry, the more it takes), the
  //    pack at it together;
  //  - the kill: fed on, a long while (growling off anyone coming near, or
  //    slinking off from you; a bear or a wolf pack may come at you for it).
  #chaseStep(a, sp, dt, ctx) {
    const C = a.chase, h = HUNTS[a.kind], b = C.prey;
    C.t += dt;
    const c = ctx.camera.position, youAt = Math.hypot(a.x - c.x, a.z - c.z);
    const end = (rest = 0, why = '') => {
      if (b) b.claimed = b.claimed === a ? null : b.claimed;
      a.chase = null;
      a.chaseEnded = why; // (for testing: why it gave up)
      a.preyWait = rest || rnd(20, 60);
      return null;
    };
    if (!b || b.gone) return end(0, 'gone');
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01;
    const reach = (SPECIES[a.kind].predator?.reach ?? 1.4) + (SPECIES[b.kind].radius ?? 0.4) * b.scale + sp.radius * a.scale;
    if (C.phase === 'feed') {
      // At the kill: tearing at it, head down; the pack round it.
      if (b.alive) return end(0, 'alive');
      b.deadTime = Math.min(b.deadTime ?? 0, 60); // (it isn't left to rot while it's being eaten)
      b.picked = (b.picked ?? 0) + dt / 40;
      a.hunger = Math.max(0, a.hunger - dt / 90);
      C.left -= dt;
      if (youAt < 14 && ctx.player?.mode === 'walk' && ctx.player.alive && !ctx.tame) {
        // You coming up to it: a bear or the pack stands its ground for it; a cat slinks off.
        if ((a.kind === 'grizzly' || a.kind === 'blackBear' || a.kind === 'wolf' || a.kind === 'lion' || a.kind === 'hyena') && youAt < 9) return end(), this.#enrage(a), null;
        if (h.stalk || a.kind === 'coyote' || a.kind === 'fox') return (a.fear = 8), (a.fearFrom = null), end(rnd(60, 120));
        if ((a.growlFeed = (a.growlFeed ?? 0) - dt) <= 0) (a.growlFeed = rnd(2, 4)), ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : 'growl', ctx.pan(a.x, a.z), Math.min(0.8, 14 / (youAt + 4)));
      }
      if (C.left <= 0 || b.picked > 4) return (a.hunger = 0), (a.state = 'rest'), (a.timer = rnd(40, 120)), end(rnd(300, 700));
      if (d > reach + 0.6) return (a.state = 'walk'), { want: Math.atan2(dx, dz), speed: sp.walk };
      a.state = 'graze';
      a.headDown = 1;
      return { want: Math.atan2(dx, dz), speed: 0 };
    }
    if (!b.alive) {
      // Down and dead: to the kill (and the pack with it).
      if (b.claimed && b.claimed !== a && !(b.claimed.herd && b.claimed.herd === a.herd)) return end(0, 'claimed');
      b.claimed = b.claimed ?? a;
      C.phase = 'feed';
      C.left = rnd(70, 150) * (SIZE_RANK[SPECIES[b.kind].bulk] + 1) / 2;
      if (b.tame) this.onLivestock?.(b, a);
      return { want: Math.atan2(dx, dz), speed: sp.walk };
    }
    // (Lost it: too far, or too long at it.)
    if (d > (h.stalk ? 150 : 220) || (C.phase === 'rush' && C.t > h.chase) || C.t > 240) return end(rnd(30, 90), 'lost');
    // (You coming close in the middle of it: a cat gives it up; the dogs mostly keep on.)
    if (youAt < 18 && ctx.player?.mode === 'walk' && (h.stalk || Math.random() < dt * 0.3)) return end(rnd(40, 90), 'you');
    const chased = b.herd ? b.herd.fleeTime > 0 : b.fear > 0;
    if (C.phase === 'stalk' || C.phase === 'approach') {
      // (Coming in, the quarry may see it: then it's now or never.)
      const bsp = SPECIES[b.kind];
      const notice = (bsp.flee ?? 30) * (C.phase === 'stalk' ? 0.32 : 0.75) * (b.state === 'graze' || b.state === 'drink' ? 0.7 : 1);
      if (d < h.rush || chased || (d < notice && Math.random() < dt * 1.5)) {
        C.phase = 'rush';
        C.t = 0;
        // (A cat's last bound: a spring at it.)
        ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : a.kind === 'coyote' || a.kind === 'fox' ? 'yip' : a.kind === 'crocodile' ? 'hiss' : 'growl', ctx.pan(a.x, a.z), 0.35);
      } else {
        // Coming on: the cat low and slow, stock-still when its quarry lifts its head; the dogs at a trot, spreading round it.
        const looking = C.phase === 'stalk' && d < 50 && (b.state === 'alert' || b.state === 'look');
        a.state = C.phase === 'stalk' ? (looking ? 'freeze' : 'stalk') : 'walk';
        const off = C.phase === 'approach' && a.herd ? C.side * Math.min(1, d / 40) * C.wide : 0;
        const want = Math.atan2(dx + (-dz / d) * off, dz + (dx / d) * off);
        return { want, speed: looking ? 0 : C.phase === 'stalk' ? sp.walk * (d > 50 ? 1.6 : 0.9) : sp.walk * (d > 60 ? 3 : 2) };
      }
    }
    // The rush and the chase: flat out at it (cut across to where it's
    // going), its herd running from this one now.
    if (b.herd) {
      b.herd.fear = { x: a.x, z: a.z };
      b.herd.fleeTime = Math.max(b.herd.fleeTime, 8);
    } else (b.fear = Math.max(b.fear ?? 0, 8)), (b.fearFrom = { x: a.x, z: a.z });
    const lead = Math.min(1.2, d / 15), bh = b.heading ?? 0, bv = b.speed ?? 0;
    const tx = b.x + Math.sin(bh) * bv * lead, tz = b.z + Math.cos(bh) * bv * lead;
    // (The cats: a burst, all-out, soon spent. The dogs: a long hard run.)
    const burst = h.stalk ? (C.t < h.chase * 0.6 ? 1.12 : 0.8) : C.t > 20 ? 0.85 : 0.95;
    a.state = 'hunt';
    // Caught up: bitten, pulled down; the next bite and the next.
    a.attackCd = (a.attackCd ?? 0) - dt;
    if (d < reach && a.attackCd <= 0) {
      a.attackCd = rnd(0.7, 1.1);
      a.lunge = 0.35;
      const was = b.hits ?? 0;
      this.wound(b, { from: { x: a.x, y: a.y, z: a.z }, sharp: h.stalk ? 1.5 : 1 });
      if (b.alive && h.water) this.wound(b, { from: { x: a.x, y: a.y, z: a.z }, sharp: 2 }); // (dragged under: it hasn't a chance)
      if (b.alive && was === 0 && !b.down && SIZE_RANK[SPECIES[b.kind].bulk] <= 1) b.lame = true;
    }
    return { want: Math.atan2(tx - a.x, tz - a.z), speed: d < reach * 0.8 ? b.speed ?? 0 : sp.run * burst };
  }

  // A cougar, hunting you: it notices you (less soon if you keep low), then
  // creeps up from behind, keeping low, freezing whenever you look its way;
  // close enough, and you not looking, it springs. Face it, standing tall,
  // a while, and it thinks better of it and slinks off.
  #ambush(a, sp, t, dt, ctx) {
    const p = ctx.player, pr = sp.predator;
    if (a.chase && t.d > 15 && !a.hunting) return void (a.notice = 0), (a.stalking = false);
    const able = p && p.mode === 'walk' && p.alive && !ctx.tame && !a.lame && !a.down;
    a.cool = Math.max(0, (a.cool ?? 0) - dt);
    if (!able || a.cool > 0) {
      a.hunting = false;
      a.stalking = false;
      a.notice = 0;
      return;
    }
    // A crocodile: it doesn't care if you look at it. It lies still, low
    // in the shallows, watching, drifting nearer; come close and it lunges.
    if (sp.fearless) {
      a.seen = false;
      if (a.hunting) {
        if (t.d > pr.sight * 2) (a.hunting = false), (a.notice = 0);
        return;
      }
      if (t.d < pr.sight * (p.crouch ? 0.7 : 1)) a.notice = (a.notice ?? 0) + dt;
      else a.notice = Math.max(0, (a.notice ?? 0) - dt * 0.3);
      a.stalking = a.notice > 0.6;
      if (a.stalking && t.d < 12) {
        a.hunting = true;
        a.stalking = false;
        a.notice = 9;
        ctx.sound?.call('hiss', ctx.pan(a.x, a.z), 0.7);
      }
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
    if (!seen && t.d < 9 && t.d > 3 && !(a.coiling > 0)) {
      // (First, crouched to spring, a hiss: a moment to turn and face it.)
      if (a.coiling === undefined || a.coiling < -3) {
        a.coiling = 0.7;
        a.crouch = 1;
        ctx.sound?.call('hiss', ctx.pan(a.x, a.z), 0.7);
        return;
      }
    }
    if (a.coiling > 0) {
      a.coiling -= dt;
      if (a.coiling > 0 || t.d > 10) return;
      a.coiling = -10;
    } else if (a.coiling !== undefined) a.coiling -= dt;
    if (!seen && t.d < 9 && t.d > 3 && a.coiling !== undefined && a.coiling <= -9.9) {
      // The spring.
      a.coiling = undefined;
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

  // The wildfire (burning across the land) that (x, z) is near, if any: { x, z, r }.
  #wildfireAt(x, z, ctx, pad = 0) {
    for (const f of ctx.wildfires ?? []) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return f;
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
    // Online, not the host: the animals are the host's, drawn as they send them (see mirror).
    if (this.mirror) {
      if (hidden) this.#hideAll();
      else this.#mirrorStep(dt, ctx);
      this.#draw();
      return;
    }
    // (Under a roof or in a cave, they're out of sight: and with no one else
    // about, they wait for you. Online, they go on, for the others.)
    if (hidden && !ctx.others?.length) return this.#hideAll();
    for (const a of this.animals) for (const st of a.stuck ?? []) st.mesh.visible = !hidden;
    for (const a of this.animals) if (a.id === undefined) a.id = this.nextId = (this.nextId ?? 0) + 1;
    const views = this.#views(ctx);
    // (Online: its cries when wounded, its growl, a tamed sheep's baa go out to the others too.)
    this.ctx = views[0];
    this.wait -= dt;
    this.crowCooldown -= dt;
    if (this.wait <= 0) {
      this.wait = 0.5;
      const tp = this.profile ? performance.now() : 0;
      this.#populate(ctx);
      if (this.profile) this.profile.populate = (this.profile.populate ?? 0) + performance.now() - tp;
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
        if (EQUINE.has(t.kind)) Object.assign(a, { saddled: t.saddled === 'great' ? 'great' : !!t.saddled, hunger: t.hunger ?? 80, thirst: t.thirst ?? 80, stallion: !!t.stallion, stamina: 100 });
        if (t.bred !== null && t.bred !== undefined) a.bred = this.time - t.bred;
        if (t.kind === 'goat') (a.billy = !!t.billy), t.milked !== null && t.milked !== undefined && (a.milked = this.time - t.milked);
        // (The young: as grown as it was.)
        if (t.young) (a.adultScale = a.scale / t.young), (a.growth = Math.max(0, (t.young - 0.5) * 2));
        if (t.bags) (a.bags = this.makeBags?.(t.bags.length) ?? null) && a.bags.load({ slots: t.bags });
      }
      this.pendingTame = left;
    }
    this.calming = null; // (the wild horse you're settling, if any: see #walker)
    // (Each one minds whoever is nearest it: you, or, online, one of the others.)
    for (const herd of this.herds) this.#herd(herd, dt, this.#near(herd.members[0] ?? herd.mid, views));
    for (const flock of this.flocks) this.#flock(flock, dt, this.#near(flock.centre, views));
    // (For testing: `profile` set to {}, the time each kind takes, ms, summed.)
    const prof = this.profile;
    // (Far off, they think less often: thirty times a second past 60 m, ten
    // times past 150; behind you (out of view) past 30 m, ten times too.
    // Each with the time gone by since; staggered, so it's never all at once.
    // Close by, or hunting you, charging, ridden, led, and birds (on the wing
    // far off, a jerky flight shows): every frame.)
    this.frame = (this.frame ?? 0) + 1;
    for (const a of this.animals) {
      const t0 = prof ? performance.now() : 0;
      const c = this.#near(a, views);
      if (a.owed === undefined) a.owed = ((a.id ?? 0) * 0.618) % 1 * 0.1; // (the stagger)
      a.owed += dt;
      const cam = c.camera.position, dx = a.x - cam.x, dz = a.z - cam.z, d = Math.max(Math.abs(dx), Math.abs(dz));
      const busy = (SPECIES[a.kind].bird && !SPECIES[a.kind].climber) || a.hunting || a.charging > 0 || a.ridden || a.led || a.leap || a.stalking || (a.boss && d < 150) || !a.alive && a.rag;
      const behind = d > 30 && c.forward && dx * c.forward.x + dz * c.forward.z < -0.2 * Math.hypot(dx, dz);
      const every = busy || d < 60 && !behind ? 0 : d < 150 && !behind ? 1 / 30 : 0.1;
      if (a.owed < every) {
        if (prof) prof.skipped = (prof.skipped ?? 0) + 1;
        continue;
      }
      const step = Math.min(a.owed, 0.25);
      a.owed = 0;
      if (SPECIES[a.kind].ground) this.#walker(a, step, c);
      else if (SPECIES[a.kind].serpent) this.#snake(a, SPECIES[a.kind], step, c);
      else if (a.flock) this.#flockBird(a, step, c);
      else if (a.kind === 'owl') this.#owl(a, step, c);
      else if (a.carrion) this.#carrionBird(a, step, c);
      else if (a.circling) this.#circler(a, step, c);
      else if (a.kind === 'monkey') this.#monkey(a, step, c);
      else this.#songbird(a, step, c);
      this.#prints(a, c);
      if (prof) prof[a.kind] = (prof[a.kind] ?? 0) + performance.now() - t0;
    }
    // (No walking through anyone: a creature standing in the way of one of you is pushed aside.)
    for (const a of this.animals) {
      const sp = SPECIES[a.kind];
      if (!sp.ground || !a.alive || a.gone || a.ridden) continue;
      for (const v of views) {
        const c = v.camera.position, dx = a.x - c.x, dz = a.z - c.z;
        if (Math.abs(dx) > 4 || Math.abs(dz) > 4 || c.y - 1.7 > a.y + (sp.height ?? 1) * a.scale || c.y < a.y) continue;
        const d = Math.hypot(dx, dz), min = (sp.radius ?? 0.4) * a.scale + 0.35;
        if (d < min && d > 1e-4) (a.x = c.x + (dx / d) * min), (a.z = c.z + (dz / d) * min);
      }
    }
    const tv = prof ? performance.now() : 0;
    this.#vocalize(dt, views);
    if (prof) prof.vocalize = (prof.vocalize ?? 0) + performance.now() - tv;
    // (Those flown off out of sight, or home to roost.)
    if (this.animals.some((a) => a.gone)) {
      for (const a of this.animals) if (a.gone) this.#unstick(a);
      this.animals = this.animals.filter((a) => !a.gone);
    }
    const td = prof ? performance.now() : 0;
    this.#draw();
    if (prof) prof.draw = (prof.draw ?? 0) + performance.now() - td;
  }

  // Prints, in the snow and the mud, of those that don't step with legs of
  // their own (see #walker: stepFeet): a snake's trail, a bird hopping about
  // on the ground, a monkey come down; and anything with legs whose feet
  // aren't being worked out. One every stride along its way, near you.
  #prints(a, c) {
    const was = a.printAt;
    a.printAt = { x: a.x, z: a.z };
    if (!was || a.feet || !a.alive || a.swimming || a.flying || !c.step) return;
    const cam = c.camera.position;
    if (Math.abs(a.x - cam.x) > 70 || Math.abs(a.z - cam.z) > 70) return;
    const g = c.ground(a.x, a.z);
    if (!Number.isFinite(g) || Math.abs((a.y ?? g) - g) > 0.4) return; // (up a tree, on a branch, in the air)
    const sp = SPECIES[a.kind], serpent = !!sp.serpent;
    a.printGone = (a.printGone ?? 0) + Math.hypot(a.x - was.x, a.z - was.z);
    const stride = serpent ? 0.12 * a.scale : Math.max(0.12, (sp.radius ?? 0.25) * a.scale * 1.4);
    if (a.printGone < stride) return;
    a.printGone %= stride;
    // (Left and right in turn, but a snake's one line.)
    const side = serpent ? 0 : (a.printSide = 1 - (a.printSide ?? 0)) ? 1 : -1, off = serpent ? 0 : 0.06 * a.scale;
    c.step(a, a.x + Math.cos(a.heading ?? 0) * off * side, a.z - Math.sin(a.heading ?? 0) * off * side, (a.speed ?? 0) > (sp.walk ?? 1) * 2);
  }

  #hideAll() {
    for (const rig of Object.values(this.rigs)) for (const m of Object.values(rig.meshes)) m.visible = false;
    this.woundMesh.visible = false;
    for (const a of this.animals) for (const st of a.stuck ?? []) st.mesh.visible = false;
  }

  // --- Online -----------------------------------------------------------------
  //
  // The host runs every animal, around everyone in the world: each minds
  // whoever is nearest it (flees them, stalks them, bites them), as if
  // they were you; and what it does goes out to the others, who draw it
  // (see snapshot, receive). Its calls are heard by everyone, from where
  // it is (see ctx.emit).

  // What each animal sees of whoever is nearest it: `ctx` for you, and,
  // online, one like it for each of the others (`ctx.others`: [{ id, x, y
  // (feet), z, yaw, crouch, sprint, swim, fly, speed }]). Their sounds are
  // sent out (ctx.emit(name, x, z, volume, distance from who it's for));
  // their bites too (ctx.emitTo(id, what)).
  #views(ctx) {
    const others = ctx.others ?? [];
    if (!others.length || !ctx.emit) return (this.views = [ctx]);
    const last = { x: 0, z: 0 };
    const cam = ctx.camera.position;
    const views = [{
      ...ctx,
      pan: (x, z) => ((last.x = x), (last.z = z), ctx.pan(x, z)),
      sound: { call: (n, p, v) => (ctx.sound?.call(n, p, v), ctx.emit(n, last.x, last.z, v, Math.hypot(last.x - cam.x, last.z - cam.z), true)) }, // (heard here already)
    }];
    this.viewCache = this.viewCache ?? new Map();
    for (const o of others) {
      let v = this.viewCache.get(o.id);
      if (!v) {
        const at = { x: 0, z: 0 };
        const position = new Vector3();
        v = {
          position, at,
          player: {
            alive: true, cover: 0, lure: false,
            damage: (amount, kind) => ctx.emitTo(o.id, { k: 'hurt', amount, kind }),
            poison: () => ctx.emitTo(o.id, { k: 'poison' }),
          },
          sound: { call: (n, p, vol) => ctx.emit(n, at.x, at.z, vol, Math.hypot(at.x - position.x, at.z - position.z)) },
          pan: (x, z) => ((at.x = x), (at.z = z), 0),
        };
        this.viewCache.set(o.id, v);
      }
      v.position.set(o.x, o.y + 1.6, o.z);
      Object.assign(v.player, { x: o.x, y: o.y + 1.6, z: o.z, mode: o.fly ? 'fly' : 'walk', crouch: !!o.crouch, moving: (o.speed ?? 0) > 0.3, sprint: !!o.sprint });
      views.push({
        ...ctx, ground: v.ground ?? (v.ground = (x, z) => { const y = ctx.ground(x, z); return y === y ? y : ctx.generator.getBaseHeight(x, z); }), camera: { position: v.position }, forward: { x: -Math.sin(o.yaw ?? 0), y: 0, z: -Math.cos(o.yaw ?? 0) }, sheltered: false,
        player: v.player, sound: v.sound, pan: v.pan, other: o.id,
      });
    }
    return (this.views = views);
  }

  // The view of whoever's nearest a point.
  #near(p, views) {
    if (views.length === 1 || !p) return views[0];
    let best = views[0], bd = Infinity;
    for (const v of views) {
      const c = v.camera.position, d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d < bd) (bd = d), (best = v);
    }
    return best;
  }

  // How far a point is from the nearest of everyone.
  #nearest(x, z) {
    let d = Infinity;
    for (const v of this.views ?? [this.ctx]) d = Math.min(d, Math.hypot(v.camera.position.x - x, v.camera.position.z - z));
    return d;
  }

  /**
   * The host's animals near any of `points` ([{ x, z }]), to send to the
   * others: { a: [[id, kind, x, y, z, heading, pitch, roll, scale, flags,
   * state, speed, headDown, headYaw, lie, crouch, gait, strideLen, side,
   * coil, display, rear, drop, tint], ...] }.
   */
  snapshot(points, reach = 380) {
    const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round((v ?? 0) * 1000) / 1000;
    const out = [];
    for (const a of this.animals) {
      if (a.gone || a.id === undefined || !points.some((p) => Math.abs(p.x - a.x) < reach && Math.abs(p.z - a.z) < reach)) continue;
      const flags = (a.alive ? 1 : 0) | (a.down ? 2 : 0) | (a.antlers ? 4 : 0) | (a.flying ? 8 : 0) | (a.swimming ? 16 : 0) | (a.landed ? 32 : 0)
        | (a.circling ? 64 : 0) | (a.tame ? 128 : 0) | (a.young ? 256 : 0) | (a.sheared ? 512 : 0) | (a.flapping > 0 ? 1024 : 0) | (a.tom ? 2048 : 0);
      out.push([
        a.id, a.kind, r2(a.x), r2(a.y), r2(a.z), r3(a.heading), r3(a.pitch), r3(a.roll), r3(a.scale), flags,
        a.state ?? '', r2(a.speed ?? 0), r3(a.headDown), r3(a.headYaw), r3(a.lie), r3(a.crouch), a.gait ?? '', r3(a.strideLen ?? 1), a.side ?? 1,
        r3(a.coil), r3(a.display), r3(a.rear), r3(a.drop), a.tint ?? 0,
        a.boss ? Object.keys(BOSSES).find((k) => BOSSES[k] === a.boss) : '', a.boss ? r3(Wildlife.bossHealth(a)) : 0,
      ]);
    }
    return { a: out };
  }

  /** Online, not the host: the host's animals as they are at room time `t` (see snapshot). */
  receive(w, t) {
    this.byId = this.byId ?? new Map();
    const seen = new Set();
    for (const r of w.a ?? []) {
      const [id, kind] = r;
      if (!SPECIES[kind]) continue;
      seen.add(id);
      let a = this.byId.get(id);
      if (!a) {
        a = { id, kind, x: r[2], y: r[3], z: r[4], heading: r[5], pitch: r[6], roll: r[7], scale: r[8], alive: true, health: 1, phase: Math.random() * TAU, flap: 0, cycle: Math.random(), samples: [], mirrored: true };
        this.byId.set(id, a);
        this.animals.push(a);
      }
      a.samples.push({ t, r });
      if (kind === 'owl') a.coat ??= new Color(0.95, 0.9, 0.82); // (an owl's pale coat, as the host has it)
      // (A great beast: who it is, and how much is left of it.)
      if (r[24] && BOSSES[r[24]]) (a.boss = BOSSES[r[24]]), (a.bossHealth = r[25]), (a.coat ??= new Color().setRGB(...a.boss.coat)), (a.antlers = !!a.boss.antlers);
      if (a.samples.length > 12) a.samples.shift();
      a.missed = 0;
    }
    // (Not in it twice running: gone, or out of reach.)
    for (const a of this.animals) {
      if (seen.has(a.id) || !a.mirrored) continue;
      if ((a.missed = (a.missed ?? 0) + 1) >= 2) a.gone = true;
    }
    for (const a of this.animals) if (a.gone) (this.#unstick(a), this.byId.delete(a.id));
    this.animals = this.animals.filter((a) => !a.gone);
  }

  // Each of the host's animals where it was a moment ago (smoothed between
  // the snapshots either side), its legs and wings going as it moves.
  #mirrorStep(dt, ctx) {
    for (const a of this.animals) for (const st of a.stuck ?? []) st.mesh.visible = true;
    const now = (ctx.netTime ?? 0) - 0.35;
    const ang = (a, b, u) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;
    for (const a of this.animals) {
      const S = a.samples;
      if (!S?.length) continue;
      let p = S[0], q = S[0];
      for (const s of S) {
        if (s.t <= now) p = s;
        if (s.t >= now) {
          q = s;
          break;
        }
        q = s;
      }
      const u = q.t > p.t ? Math.min(1, Math.max(0, (now - p.t) / (q.t - p.t))) : 1;
      const A = p.r, B = q.r, L = (i) => A[i] + (B[i] - A[i]) * u;
      const ox = a.x, oz = a.z;
      a.x = L(2);
      a.y = L(3);
      a.z = L(4);
      a.heading = ang(A[5], B[5], u);
      a.pitch = ang(A[6], B[6], u);
      if (this.time >= (a.localUntil ?? 0)) a.roll = ang(A[7], B[7], u);
      a.scale = B[8];
      const f = B[9];
      const mine = this.time < (a.localUntil ?? 0) && !(f & 1) === !a.alive; // (wounded here just now: as it is here, till the host's news catches up)
      if (this.time >= (a.localUntil ?? 0) || mine) {
        a.alive = !!(f & 1);
        a.down = !!(f & 2);
        a.state = B[10];
        a.side = B[18];
      }
      a.antlers = !!(f & 4);
      a.flying = f & 8 ? a.flying ?? { vy: 0 } : null;
      a.swimming = !!(f & 16);
      a.landed = !!(f & 32);
      a.circling = !!(f & 64);
      a.tame = !!(f & 128);
      a.young = f & 256 ? a.young || 0.5 : 0;
      a.sheared = f & 512 ? a.sheared ?? this.time : null;
      a.flapping = f & 1024 ? 1 : 0;
      a.tom = !!(f & 2048);
      a.speed = L(11);
      a.headDown = L(12);
      a.headYaw = L(13);
      a.lie = L(14);
      a.crouch = L(15);
      a.gait = B[16] || undefined;
      a.strideLen = B[17] || 1;
      a.coil = L(19);
      a.display = L(20);
      a.rear = L(21);
      a.drop = L(22);
      a.tint = B[23] || undefined;
      if (!a.alive) a.deadTime = (a.deadTime ?? 0) + dt;
      const sp = SPECIES[a.kind];
      const moved = Math.hypot(a.x - ox, a.z - oz);
      if (moved < 5) {
        // (Its legs going with how far it's come; its wings beating.)
        a.cycle = (a.cycle ?? 0) + moved / Math.max(0.1, a.strideLen);
        if (sp.ground && a.gait) a.rh = rhythm(a.gait, a.cycle, smoothstep(0.03, sp.walk * 0.5, a.speed));
        // (Its footfalls, heard and left in the ground here as there: twice a stride.)
        const step = Math.floor(a.cycle * 2);
        if (sp.ground && a.alive && !a.swimming && a.lastStep !== undefined && step !== a.lastStep) ctx.step?.(a, a.x, a.z, a.speed > sp.walk * 2);
        a.lastStep = step;
      }
      const perched = a.state === 'perch' || a.state === 'ground' || a.landed || a.state === 'dead';
      if (!perched || a.flying) a.flap += dt * (a.circling ? (a.flapping ? 11 : 0) : 22);
      if (a.jolt && (a.jolt.t -= dt) <= 0) a.jolt = null;
      if (sp.serpent) {
        // (A snake's body follows the way its head has gone.)
        const model = this.rigs[a.kind].model;
        a.trail = a.trail ?? [];
        if (!a.trail.length || Math.hypot(a.x - a.trail[0].x, a.z - a.trail[0].z) > 0.03) a.trail.unshift({ x: a.x, z: a.z, y: a.y });
        if (a.trail.length > (model.segments * model.spacing * a.scale) / 0.03 + 4) a.trail.pop();
      }
      a.feet = null;
    }
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
      const far = !a.chunk && !a.keep && this.#nearest(a.x, a.z) > (SPECIES[a.kind].bird ? 520 : 430);
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
    this.#carrion(ctx);
    this.#bosses(ctx);
    // A herd keeps clear of a hunter on the prowl near it (one lying up, or
    // at its kill, they watch and let be); horses are the jumpiest of all.
    for (const h of this.herds) {
      if (h.fleeTime > 0 || EQUINE.has(h.kind) || SPECIES[h.kind]?.predator) continue;
      const lead = h.members.find((m) => m.alive);
      if (!lead || lead.tame) continue;
      const wary = (SPECIES[h.kind].flee ?? 30) * 0.45;
      for (const a of this.animals) {
        if (!a.alive || !PREY[a.kind]?.[h.kind] || a.state === 'rest' || a.chase?.phase === 'feed' || a.chase?.phase === 'stalk') continue;
        if (Math.abs(a.x - lead.x) > wary || Math.abs(a.z - lead.z) > wary || Math.hypot(a.x - lead.x, a.z - lead.z) > wary) continue;
        this.#alarm(h, a.x, a.z);
        break;
      }
    }
    // Horses and donkeys (wild ones) run from anything that's hunting near them.
    for (const h of this.herds) {
      if (!EQUINE.has(h.kind) || h.fleeTime > 0) continue;
      const lead = h.members[0];
      if (!lead) continue;
      for (const a of this.animals) {
        const sp = SPECIES[a.kind];
        if (!a.alive || !sp.predator || Math.abs(a.x - lead.x) > 45 || Math.abs(a.z - lead.z) > 45) continue;
        if (Math.hypot(a.x - lead.x, a.z - lead.z) < 45) {
          this.#alarm(h, a.x, a.z);
          this.ctx?.sound?.call(h.kind === 'horse' ? 'neigh' : 'bray', this.ctx.pan(lead.x, lead.z), 0.5);
          break;
        }
      }
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

    // After dark the hunters are about: now and then a wolf pack (in the
    // woods and the hills) or a few coyotes (out on the open country) come
    // by, from out of sight, roaming (and they leave again by day: see
    // `night` in the herd).
    this.nightCool = (this.nightCool ?? rnd(10, 30)) - 0.5;
    if (day < 0.25 && this.nightCool <= 0) {
      const blood = (ctx.bloodMoon ?? 0) > 0.3; // (under a blood moon: the hunters out in numbers)
      this.nightCool = blood ? rnd(15, 30) : rnd(35, 80);
      const near = (kind) => this.animals.some((a) => a.kind === kind && a.alive && Math.hypot(a.x - cx, a.z - cz) < 200);
      const s = spot(140, 260, (x, z) => g.getMountainness(x, z) < 0.6 && g.getBiomeWeights(x, z, {}).desert < 0.5, 10);
      if (s) {
        const w = g.getBiomeWeights(s.x, s.z, {}), open = w.savanna > 0.4 || (w.temperate > 0.5 && g.getPlainness(s.x, s.z) > 0.3 && g.getForestDensity(s.x, s.z) < 0.3);
        const kind = open && !near('coyote') ? 'coyote' : (blood || !near('wolf')) && w.jungle + w.mangrove < 0.4 ? 'wolf' : null;
        const herd = kind && this.#spawnHerd(kind, s, (kind === 'wolf' ? 3 + Math.floor(rnd(0, 3)) : 1 + Math.floor(rnd(0, 3))) + (blood ? 2 : 0));
        if (herd) {
          herd.night = true;
          herd.callWait = rnd(3, 12); // (heard before they're seen)
          // (Roaming your way: passing by some way off, to be seen, or to find you.)
          const a = rnd(0, TAU);
          herd.goal = { x: cx + Math.sin(a) * 45, z: cz + Math.cos(a) * 45 };
          herd.goalWait = 60;
        }
      }
    }
    // Far off in the night, in wolf country (the woods and the hills), now
    // and then a pack you can't see howls: from somewhere out there, faint.
    this.farHowl = (this.farHowl ?? rnd(20, 60)) - 0.5;
    if (day < 0.25 && this.farHowl <= 0) {
      this.farHowl = rnd(60, 160);
      const w = g.getBiomeWeights(cx, cz, {}), wild = (w.pine ?? 0) + (w.smoky ?? 0) + (w.blackHills ?? 0) + (w.redwood ?? 0) * 0.5 + (w.parkland ?? 0) * 0.6 + (w.cascades ?? 0) * 0.7 + (w.temperate ?? 0) * Math.min(1, g.getForestDensity(cx, cz) * 1.5);
      const packNear = this.animals.some((a) => a.kind === 'wolf' && a.alive && Math.hypot(a.x - cx, a.z - cz) < 700);
      if (wild > 0.5 && !packNear) {
        const a = rnd(0, TAU), d = rnd(600, 1400);
        ctx.sound?.call('howl', ctx.pan(cx + Math.sin(a) * d, cz + Math.cos(a) * d), rnd(0.18, 0.32));
      }
    }
    // (Come the day, the night's visitors go off, out of sight.)
    if (day > 0.5) for (const h of this.herds) if (h.night) for (const m of h.members) if (this.#nearest(m.x, m.z) > 120) m.gone = true;

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
    // At night in the woods, an owl or two up in the trees round you.
    if ((ctx.night ?? 0) > 0.5 && count('owl') < 2) {
      const s = spot(40, 90, (x, z) => g.getForestDensity(x, z) > 0.3, 8);
      if (s) {
        const perch = { x: s.x, z: s.z, y: s.y + rnd(5, 9) };
        this.animals.push({ kind: 'owl', x: perch.x, y: perch.y, z: perch.z, perch, heading: rnd(0, TAU), pitch: 0, roll: 0, scale: SPECIES.owl.scale * rnd(0.9, 1.1), alive: true, health: SPECIES.owl.health, flap: 0, state: 'perch', timer: rnd(4, 10), coat: new Color(0.95, 0.9, 0.82) });
      }
    }
    // A hawk or an eagle, high over the mountains.
    if (day > 0.3 && count('hawk') < 1) {
      const s = spot(150, 350, (x, z) => g.getMountainness(x, z) > 0.35, 6);
      if (s) this.#spawnCircler('hawk', s);
    }
    // An eagle, circling high over the Smoky Mountains and the Black Hills.
    if (day > 0.3 && count('eagle') < 1) {
      const s = spot(150, 350, (x, z) => { const w = g.getBiomeWeights(x, z, {}); return w.smoky + w.blackHills > 0.5; }, 6);
      if (s) this.#spawnCircler('eagle', s);
    }
    // Bats out of the caves: streaming out at dusk, or startled out by a
    // torch carried up to the mouth (harmless: a rush of wings past you).
    this.batCool = (this.batCool ?? 0) - 0.5;
    if (this.batCool <= 0 && g.caves?.mouthsNear && count('bat') === 0) {
      const torch = ctx.player?.torch;
      if ((ctx.dusk ?? 0) > 0.3 || torch) {
        this.batMouths ??= new Map();
        for (const e of g.caves.mouthsNear(cx - 90, cz - 90, cx + 90, cz + 90)) {
          const m = e.mouth, d = Math.hypot(m.x - cx, m.z - cz), key = `${Math.round(m.x)},${Math.round(m.z)}`;
          const last = this.batMouths.get(key) ?? -1e9;
          if (this.time - last < 300 || !(torch ? d < 22 : d < 90)) continue;
          this.batMouths.set(key, this.time);
          this.batCool = 20;
          const a = rnd(0, TAU), y = g.getBaseHeight(m.x, m.z);
          const to = { x: m.x + Math.sin(a) * 400, z: m.z + Math.cos(a) * 400 };
          this.#spawnFlock('bat', { x: m.x, y: y - 46, z: m.z }, 12 + Math.floor(rnd(0, 14)), to);
          const f = this.flocks[this.flocks.length - 1];
          if (f) (f.alt = rnd(6, 12)), (f.erratic = true);
          ctx.sound?.call('bats', ctx.pan(m.x, m.z), Math.min(1, 30 / (d + 10)));
          break;
        }
      }
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
  // (Online, the host's: around each of the others too.)
  #settleAround(ctx) {
    for (const v of this.views ?? [ctx]) this.#settleNear(v.camera.position, ctx);
  }

  #settleNear(at, ctx) {
    const C = ctx.chunkSize, R = 3;
    const ccx = Math.floor(at.x / C), ccz = Math.floor(at.z / C);
    const centres = (this.views ?? [ctx]).map((v) => [Math.floor(v.camera.position.x / C), Math.floor(v.camera.position.z / C)]);
    for (const [key, home] of this.homes) {
      if (centres.some(([x, z]) => Math.hypot(home.cx - x, home.cz - z) <= R + 1.5)) continue;
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
        // Monkeys: a troop in the jungle's crowns.
        if (!home.monkeys && this.#crowns(ctx.trees, key)) {
          home.monkeys = true;
          const list = this.#crowns(ctx.trees, key);
          const w = ctx.generator.getBiomeWeights((cx + 0.5) * C, (cz + 0.5) * C, {});
          if (w.jungle > 0.5 && home.rand() < 0.6) {
            for (let k = 0, n = 3 + Math.floor(home.rand() * 5); k < n && list.length; k++) {
              const i = Math.floor(home.rand() * (list.length / 5)) * 5;
              if (list[i + 3] - list[i + 2] < 2.5) continue;
              const c = list.slice(i, i + 5);
              const perch = this.#perchOn(c, { ...ctx, winter: 0 });
              if (!perch) continue;
              const a = {
                kind: 'monkey', x: perch.x, y: perch.y, z: perch.z, heading: rnd(0, TAU), pitch: 0, roll: 0, phase: rnd(0, TAU),
                scale: rnd(0.85, 1.15), alive: true, health: SPECIES.monkey.health, state: 'perch', timer: rnd(3, 15), flap: 0,
                trunk: { x: c[0], z: c[1], top: perch.y },
              };
              this.animals.push(a);
              a.chunk = key;
              home.animals.push(a);
            }
          }
        }
        if (!home.birds && ctx.day > 0.3 && this.#crowns(ctx.trees, key)) {
          home.birds = true;
          const list = this.#crowns(ctx.trees, key), n = Math.round(home.rand() * 2.6 * (1 - 0.6 * ctx.winter));
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
      if (w.temperate + w.pine + w.smoky + w.parkland + (w.cascades ?? 0) > 0.6 && f > 0.08 && f < 0.95 && g.getMountainness(p.x, p.z) < 0.55) { // (the birch and aspen parkland too)
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
          if (rand() < 0.3 + 0.4 * (ctx.spring ?? 0)) {
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
                if (cub?.herd === herd) (cub.scale *= 0.45), (cub.young = true), (cub.mother = mother), (cub.offset = { x: rnd(-2, 2), z: rnd(-2, 2) });
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
      // (And in the open meadows of the birch and aspen parkland.)
      const plain = g.getPlainness(p.x, p.z), park = w.parkland ?? 0;
      if (p.y > ctx.seaLevel + 1 && w.temperate + park > 0.6 && (plain > 0.3 || park > 0.5) && g.getForestDensity(p.x, p.z) < 0.4 && g.getMountainness(p.x, p.z) < 0.3 && rand() < (plain > 0.5 || park > 0.5 ? 0.34 : 0.2)) {
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
      if (w.pine + w.smoky + w.temperate + w.parkland + (w.cascades ?? 0) > 0.6 && m > 0.1 && m < 0.75 && f < 0.85) {
        if (rand() < 0.3) {
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
      if (p.y > ctx.seaLevel + 1 && w.temperate + w.smoky + w.parkland + (w.cascades ?? 0) > 0.6 && f > 0.15 && f < 0.8 && g.getMountainness(p.x, p.z) < 0.45 && rand() < 0.1) {
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
      if (rand() < 0.6 && ctx.winter < 0.6) {
        const from = this.animals.length;
        const herd = { kind: 'duck', goal: { x, z }, goalWait: 1e9, members: [], fear: null, fleeTime: 0 };
        for (let n = 3 + Math.floor(rand() * 8), j = 0; j < n; j++) this.#spawnWalker('duck', x + rnd(-3, 3), z + rnd(-3, 3), herd, { water: true });
        if (herd.members.length) this.herds.push(herd), home.herds.push(herd);
        own(from);
      }
      break;
    }
    // The jungle's: a tiger, a black panther, giant pandas (in the bamboo).
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && w.jungle > 0.6) {
        const r = rand();
        const from = this.animals.length;
        // (A jungle is dangerous: big cats in it all over.)
        if (r < 0.16) this.#spawnWalker('tiger', p.x, p.z, null);
        else if (r < 0.3) this.#spawnWalker('jaguar', p.x, p.z, null);
        else if (r < 0.5) this.#spawnWalker('panther', p.x, p.z, null);
        else if (r < 0.6) {
          this.#spawnWalker('panda', p.x, p.z, null);
          if (rand() < 0.4) this.#spawnWalker('panda', p.x + rnd(-4, 4), p.z + rnd(-4, 4), null);
        }
        own(from);
      }
    }
    // Mountain goats: a band on the crags and in the badlands.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && (g.getMountainness(p.x, p.z) > 0.4 || w.badlands > 0.5) && w.desert < 0.5 && rand() < 0.07) {
        const from = this.animals.length;
        const herd = this.#group('mountainGoat', p, 2 + Math.floor(rand() * 4), rand() < 0.3);
        if (herd) home.herds.push(herd);
        own(from);
      }
    }
    // Goats, gone wild: a band on the hills and the scrub (a billy and his nannies).
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {}), m = g.getMountainness(p.x, p.z);
      const hills = (m > 0.18 && m < 0.5) || (w.badlands > 0.3 && w.badlands < 0.8) || (w.blackHills ?? 0) > 0.5 || (w.volcanic > 0.4 && m < 0.5);
      if (p.y > ctx.seaLevel + 2 && hills && w.desert < 0.4 && g.getForestDensity(p.x, p.z) < 0.5 && rand() < 0.05) {
        const from = this.animals.length;
        const herd = this.#group('goat', p, 3 + Math.floor(rand() * 5), false);
        if (herd) {
          herd.members[0].billy = true;
          herd.members[0].scale *= 1.1;
          if ((ctx.spring ?? 0) > 0.4) this.#addYoung(herd, 1 + Math.floor(rand() * 2), 0.5);
          home.herds.push(herd);
        }
        own(from);
      }
    }
    // Crocodiles: lying at the water's edge in the mangroves and round the
    // jungle's lakes and rivers.
    // (And in the marshes and wetlands, lots of them.)
    // (The mangroves most of all: a band on every stretch of their shore.)
    for (let k = 0, found = 0; k < 16 && found < 3 && ctx.waterAt; k++) {
      const x = (cx + 0.05 + 0.9 * rand()) * C, z = (cz + 0.05 + 0.9 * rand()) * C;
      const w = g.getBiomeWeights(x, z, {});
      if (w.mangrove + w.jungle + w.wetland < 0.4 || !ctx.waterAt(x, z)) continue;
      found++;
      const mangrove = w.mangrove > 0.4;
      if (found > 2 && !mangrove) continue; // (the mangroves get a third band)
      if (mangrove || rand() < 0.85) {
        const from = this.animals.length;
        for (let n = (mangrove ? 3 : 2) + Math.floor(rand() * 3), j = 0; j < n; j++) {
          // (Up on the bank, beside the water.)
          // (Some out in the water, swimming, low in it.)
          // (Only in the shallows among the roots, near land: not out at sea.)
          // (Most of them: a few tries for a spot.)
          let placed = false;
          for (let tries = 0; tries < 6 && !placed && rand() < 0.95; tries++) {
            const wx = x + rnd(-14, 14), wz = z + rnd(-14, 14), wat = ctx.waterAt(wx, wz);
            let shoreNear = false;
            for (let q = 0; q < 8 && !shoreNear; q++) shoreNear = !ctx.waterAt(wx + Math.cos(q * 0.785) * 18, wz + Math.sin(q * 0.785) * 18);
            if (wat && wat.level - ctx.ground(wx, wz) < 1.8 && shoreNear && g.getOceanness(wx, wz) < 0.9 && this.#spawnWalker('crocodile', wx, wz, null, { water: true })) placed = true;
          }
          if (placed || rand() < 0.6) continue; // (and only some up on the banks)
          // (A mangrove coast is mostly water: look further for its banks and islands.)
          for (let t = 0; t < (mangrove ? 20 : 8); t++) {
            const a = rand() * TAU, d = 3 + rand() * (mangrove ? 30 : 6);
            const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
            if (!ctx.waterAt(bx, bz) && this.#spawnWalker('crocodile', bx, bz, null)) break;
          }
        }
        own(from);
      }
    }
    // Wild horses: a herd, a stallion at its head, out on the open grass.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      const open = (w.temperate > 0.5 && g.getPlainness(p.x, p.z) > 0.25) || w.parkland > 0.5 || w.savanna > 0.5 || w.blackHills > 0.5;
      if (p.y > ctx.seaLevel + 1 && open && g.getForestDensity(p.x, p.z) < 0.45 && g.getMountainness(p.x, p.z) < 0.45 && rand() < 0.06) {
        const from = this.animals.length;
        const herd = this.#spawnHerd('horse', p, 4 + Math.floor(rand() * 6));
        if (herd) {
          const stallion = herd.members[0];
          stallion.stallion = true;
          stallion.scale *= 1.08;
          if ((ctx.spring ?? 0) + (ctx.summer ?? 0) > 0.5) this.#addYoung(herd, 1 + Math.floor(rand() * 2), 0.55);
          home.herds.push(herd);
        }
        own(from);
      }
    }
    // Wild donkeys: a small band, on the dry, open country (the desert's
    // edge, the badlands' flats, the savanna's dry grass).
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      const dry = (w.desert > 0.15 && w.desert < 0.75) || w.badlands > 0.4 || w.savanna > 0.5;
      if (p.y > ctx.seaLevel + 1 && dry && g.getForestDensity(p.x, p.z) < 0.35 && g.getMountainness(p.x, p.z) < 0.5 && rand() < 0.05) {
        const from = this.animals.length;
        const herd = this.#spawnHerd('donkey', p, 3 + Math.floor(rand() * 5));
        if (herd) {
          herd.members[0].stallion = true;
          if ((ctx.spring ?? 0) + (ctx.summer ?? 0) > 0.5) this.#addYoung(herd, 1, 0.55);
          home.herds.push(herd);
        }
        own(from);
      }
    }
    // The savanna's: a pride of lions (lionesses, and one maned male), a
    // clan of hyenas, a herd of elephants with their calves.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && w.savanna > 0.6 && g.getMountainness(p.x, p.z) < 0.4) {
        const r = rand();
        const from = this.animals.length;
        if (r < 0.06) {
          const herd = this.#spawnHerd('lion', p, 3 + Math.floor(rand() * 4));
          if (herd) {
            const male = herd.members[0];
            male.antlers = true; // (his mane)
            male.scale *= 1.12;
            home.herds.push(herd);
          }
        } else if (r < 0.11) {
          const herd = this.#spawnHerd('hyena', p, 3 + Math.floor(rand() * 4));
          if (herd) home.herds.push(herd);
        } else if (r < 0.17) {
          const herd = this.#spawnHerd('elephant', p, 3 + Math.floor(rand() * 5));
          if (herd) {
            this.#addYoung(herd, 1 + Math.floor(rand() * 2), 0.45);
            home.herds.push(herd);
          }
        }
        own(from);
      }
    }
    // Hippos at the savanna's watering holes: the ponds its streams rise
    // from. A pod lives in each one (most of them), and keeps to it.
    if (ctx.waterAt && g.rivers?.inBox) {
      for (const r of g.rivers.inBox(cx * C, cz * C, (cx + 1) * C, (cz + 1) * C)) {
        const pond = r.pond;
        if (!pond || pond.x < cx * C || pond.x >= (cx + 1) * C || pond.z < cz * C || pond.z >= (cz + 1) * C) continue;
        const w = g.getBiomeWeights(pond.x, pond.z, {});
        if (w.savanna + 0.5 * w.wetland < 0.4 || rand() > 0.7) continue;
        const from = this.animals.length;
        const herd = { kind: 'hippo', goal: { x: pond.x, z: pond.z }, goalWait: rnd(20, 60), members: [], fear: null, fleeTime: 0, den: { x: pond.x, z: pond.z } };
        const spread = Math.max(2, (pond.r ?? 6) * 0.5);
        for (let n = 2 + Math.floor(rand() * 4), j = 0; j < n; j++) this.#spawnWalker('hippo', pond.x + rnd(-spread, spread), pond.z + rnd(-spread, spread), herd, { water: true });
        if (herd.members.length) this.herds.push(herd), home.herds.push(herd);
        own(from);
      }
    }
    // Hippos, in the savanna's rivers (and the wetlands').
    for (let k = 0; k < 6 && ctx.waterAt; k++) {
      const x = (cx + 0.05 + 0.9 * rand()) * C, z = (cz + 0.05 + 0.9 * rand()) * C;
      const w = g.getBiomeWeights(x, z, {}), wat = ctx.waterAt(x, z);
      if (w.savanna + 0.5 * w.wetland < 0.5 || !wat || g.getOceanness(x, z) > 0.4) continue;
      if (wat.level - ctx.ground(x, z) > 0.5 && rand() < 0.35) {
        const from = this.animals.length;
        const herd = { kind: 'hippo', goal: { x, z }, goalWait: rnd(20, 60), members: [], fear: null, fleeTime: 0 };
        for (let n = 2 + Math.floor(rand() * 4), j = 0; j < n; j++) this.#spawnWalker('hippo', x + rnd(-6, 6), z + rnd(-6, 6), herd, { water: true });
        if (herd.members.length) this.herds.push(herd), home.herds.push(herd);
        own(from);
      }
      break;
    }
    // The desert's camels; scorpions there and in the badlands (not in the winter).
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && w.desert > 0.6 && rand() < 0.07) {
        const from = this.animals.length;
        const herd = this.#spawnHerd('camel', p, 3 + Math.floor(rand() * 5));
        if (herd) home.herds.push(herd);
        own(from);
      }
      const q = at();
      const wq = g.getBiomeWeights(q.x, q.z, {});
      if (q.y > ctx.seaLevel + 1 && wq.desert + wq.badlands > 0.5 && ctx.winter < 0.5 && rand() < 0.4) {
        const from = this.animals.length;
        for (let n = 1 + Math.floor(rand() * 2), j = 0; j < n; j++) this.#spawnWalker('scorpion', q.x + rnd(-8, 8), q.z + rnd(-8, 8), null);
        own(from);
      }
    }
    // A python, by the jungle's water or among the roots of its trees.
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && w.jungle + 0.5 * w.mangrove > 0.6 && rand() < 0.14) {
        const from = this.animals.length;
        this.#spawnSnake(p.x, p.z, 'python');
        own(from);
      }
    }
    // A rattlesnake in the dry country and the badlands (they sleep out the winter).
    {
      const p = at();
      const w = g.getBiomeWeights(p.x, p.z, {});
      if (p.y > ctx.seaLevel + 1 && w.desert + w.savanna + w.volcanic * 0.5 + w.badlands > 0.5 && ctx.winter < 0.5 && rand() < 0.3) {
        const from = this.animals.length;
        this.#spawnSnake(p.x, p.z);
        own(from);
      }
    }
    return home;
  }


  /**
   * The great beasts' lairs: each 2 km square of the land has a one-in-ten
   * chance of one (its biome's), and a one-in-ten chance of a cave bear in
   * one of its caves. One rises when you come within 300 m of its lair (if
   * it hasn't been brought down in the last few days), and keeps near it.
   */
  #lair(i, j, ctx) {
    this.lairs ??= new Map();
    const key = `${i},${j}`;
    if (this.lairs.has(key)) return this.lairs.get(key);
    const g = ctx.generator, seed = ctx.seed ^ 0xb055;
    const found = [];
    if (hash2(i, j, seed) < 0.1) {
      const x = (i + 0.2 + 0.6 * hash2(i, j, seed + 1)) * BOSS_CELL, z = (j + 0.2 + 0.6 * hash2(i, j, seed + 2)) * BOSS_CELL;
      const w = g.getBiomeWeights(x, z, {});
      let best = null, bw = 0.55;
      for (const [id, b] of Object.entries(BOSSES)) for (const bi of b.biomes ?? []) if ((w[bi] ?? 0) > bw) (bw = w[bi]), (best = id);
      if (best && g.getBaseHeight(x, z) > ctx.seaLevel + 1) found.push({ key: `${best}@${key}`, boss: best, x, z });
    }
    if (hash2(i, j, seed + 7) < 0.1 && g.caves?.mouthsNear) {
      const m = g.caves.mouthsNear(i * BOSS_CELL, j * BOSS_CELL, (i + 1) * BOSS_CELL, (j + 1) * BOSS_CELL).find((e) => e.mouth.x >= i * BOSS_CELL && e.mouth.x < (i + 1) * BOSS_CELL && e.mouth.z >= j * BOSS_CELL && e.mouth.z < (j + 1) * BOSS_CELL);
      if (m) found.push({ key: `caveBear@${key}`, boss: 'caveBear', x: m.mouth.x, z: m.mouth.z, cave: true });
    }
    this.lairs.set(key, found);
    return found;
  }

  #bosses(ctx) {
    if (this.mirror) return;
    const c = ctx.camera.position;
    this.bossLive ??= new Map();
    this.bossDeaths ??= {};
    for (const [key, a] of this.bossLive) if (a.gone || !this.animals.includes(a)) this.bossLive.delete(key);
    const ci = Math.floor(c.x / BOSS_CELL), cj = Math.floor(c.z / BOSS_CELL);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      for (const lair of this.#lair(ci + di, cj + dj, ctx)) {
        if (this.bossLive.has(lair.key) || Math.hypot(lair.x - c.x, lair.z - c.z) > 300) continue;
        const died = this.bossDeaths[lair.key];
        if (died !== undefined && (ctx.worldDay ?? 0) - died < BOSS_RESPAWN_DAYS) continue;
        const a = this.#spawnBoss(lair, ctx);
        if (a) this.bossLive.set(lair.key, a);
      }
    }
  }

  /** A great beast at its lair (testing: `spawnBoss`). */
  #spawnBoss(lair, ctx) {
    const def = BOSSES[lair.boss];
    let x = lair.x, z = lair.z;
    // (Out of the cave's mouth, onto firm ground; or near the lair's spot.)
    let a = null;
    for (let k = 0; k < 10 && !a; k++) {
      const r = lair.cave ? 6 : k * 4, t = k * 2.4;
      x = lair.x + Math.sin(t) * r;
      z = lair.z + Math.cos(t) * r;
      a = def.kind === 'snake' ? this.#spawnSnake(x, z) : this.#spawnWalker(def.kind, x, z, null);
    }
    if (!a) return null;
    a.boss = def;
    a.bossKey = lair.key;
    a.scale = (SPECIES[def.kind].size ?? 1) * def.scale;
    a.coat = new Color().setRGB(...def.coat); // (darker, or paler: a multiplier on its kind's colours)
    a.home = { x: lair.x, z: lair.z };
    a.lair = { x: lair.x, z: lair.z };
    a.antlers = !!def.antlers;
    a.aggressive = true;
    if (def.pack) {
      const herd = this.#spawnHerd('wolf', { x, z, y: a.y }, def.pack);
      if (herd) {
        herd.members.unshift(a);
        a.herd = herd;
        a.offset = { x: 0, z: 0 };
      }
    }
    return a;
  }

  /** Testing: a great beast here (by its id in BOSSES). */
  spawnBoss(id, x, z) {
    if (!this.ctx || !BOSSES[id]) return null;
    const a = this.#spawnBoss({ key: `${id}@test${Math.round(x)},${Math.round(z)}`, boss: id, x, z }, this.ctx);
    if (a) (this.bossLive ??= new Map()).set(a.bossKey, a);
    return a;
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
      if (this.#wildfireAt(x, z, ctx, 15)) continue; // (not into a burning wood)
      const y = ctx.trees.topAt ? ctx.trees.topAt(x, z, c[3] + 3) : c[3];
      if (y !== null && y > c[2]) return { x, y: y + 0.02, z };
    }
    return null;
  }

  // A chunk's broad-leaved crowns: the trees here, or (online, the host's)
  // those round one of the others, as they've sent them (see remoteCrowns).
  #crowns(trees, key) {
    return trees.crowns.get(key) ?? this.remoteCrowns.get(key);
  }

  // Broad-leaved crowns (see TreeLayer.crowns) within `r` of you: [x, z, bottom, top, radius].
  #crownsNear(ctx, r) {
    const { camera, trees, chunkSize } = ctx;
    const out = [];
    const cx = Math.floor(camera.position.x / chunkSize), cz = Math.floor(camera.position.z / chunkSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.#crowns(trees, `${cx + dx},${cz + dz}`);
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
      // (Not in a pond, a creek or a pool: on dry land.)
      const w = this.ctx.waterAt?.(x, z);
      if (w && w.level - y > 0.1 && !SPECIES[kind].water) return null;
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
    // (Spring: the time of the young, twice as many of them about.)
    n = Math.round(n * (1 + (this.ctx?.spring ?? 0)));
    const mothers = herd.members.filter((m) => !m.young && !m.antlers);
    for (let k = 0; k < n && mothers.length; k++) {
      const mother = mothers[k % mothers.length];
      const y = this.#spawnWalker(herd.kind, mother.x + rnd(-1.5, 1.5), mother.z + rnd(-1.5, 1.5), herd, { young: size, mother });
      if (y) y.offset = { x: mother.offset.x + rnd(-1.5, 1.5), z: mother.offset.z + rnd(-1.5, 1.5) };
    }
  }

  // A snake at (x, z), basking.
  #spawnSnake(x, z, kind = 'snake') {
    const y = this.ctx.ground(x, z);
    if (!(y > this.ctx.seaLevel + 1)) return null;
    const heading = rnd(0, TAU);
    const a = {
      kind, x, z, y, heading, base: heading, pitch: 0, roll: 0, speed: 0, scale: kind === 'python' ? rnd(3.0, 4.0) : rnd(0.9, 1.25), alive: true, health: SPECIES[kind].health,
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
    const hawk = kind === 'hawk' || kind === 'eagle';
    const a = {
      kind, circling: true, centre: { x: s.x, z: s.z }, radius: hawk ? rnd(60, 120) : rnd(18, 50), angle: rnd(0, TAU), dir: Math.random() < 0.5 ? 1 : -1,
      alt: hawk ? rnd(90, 140) : rnd(10, 30), speed: hawk ? rnd(9, 12) : rnd(7, 10), x: s.x, y: 0, z: s.z,
      heading: 0, pitch: 0, roll: 0, scale: SPECIES[kind].scale * rnd(0.9, 1.1), alive: true, health: SPECIES[kind].health,
      flap: 0, flapping: 0, nextFlap: rnd(2, 8), nextCall: rnd(3, 20), groundY: s.y, state: 'fly',
    };
    this.animals.push(a);
  }

  // --- Behaviour ------------------------------------------------------------

  /**
   * An owl: it sits up in a tree, hooting now and then, watching the
   * ground; a rabbit or a hare out within reach, it drops on it without a
   * sound, and carries it off to another tree. Come the day, it goes.
   */
  #owl(a, dt, ctx) {
    const cam = ctx.camera.position, g = ctx.generator;
    const toward = (x, y, z, speed) => {
      const dx = x - a.x, dy = y - a.y, dz = z - a.z, d = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, (speed * dt) / d);
      a.x += dx * k;
      a.y += dy * k;
      a.z += dz * k;
      a.heading = Math.atan2(dx, dz);
      a.pitch = -Math.atan2(dy, Math.hypot(dx, dz)) * 0.5;
      return d;
    };
    a.timer -= dt;
    // (Day: away it goes, and out of sight.)
    if ((ctx.night ?? 0) < 0.3 && a.state !== 'leave') (a.state = 'leave'), (a.away = { x: a.x + rnd(-200, 200), z: a.z + rnd(-200, 200) });
    if (a.state === 'leave') {
      toward(a.away.x, a.y + 10, a.away.z, 9);
      if (Math.hypot(a.x - cam.x, a.z - cam.z) > 150) a.gone = true;
      return;
    }
    if (a.state === 'perch') {
      a.pitch = 0;
      if (a.timer <= 0) {
        a.timer = rnd(6, 14);
        const d = Math.hypot(a.x - cam.x, a.z - cam.z);
        if (d < 140 && Math.random() < 0.7) ctx.sound?.call('owl', ctx.pan(a.x, a.z), Math.max(0.1, 1 - d / 140));
        // (Something small out on the ground below?)
        const prey = this.animals.find((p) => (p.kind === 'rabbit' || p.kind === 'hare') && p.alive && !p.gone && !p.owl && Math.hypot(p.x - a.x, p.z - a.z) < 45);
        if (prey) (a.state = 'swoop'), (a.prey = prey), (prey.owl = a);
        else if (Math.random() < 0.15) {
          // (Or off to another tree, a little way on.)
          const t = rnd(0, TAU), x = a.x + Math.sin(t) * rnd(20, 50), z = a.z + Math.cos(t) * rnd(20, 50);
          if (g.getForestDensity(x, z) > 0.25) (a.perch = { x, z, y: g.getHeight(x, z) + rnd(5, 9) }), (a.state = 'fly');
        }
      }
      return;
    }
    if (a.state === 'fly') {
      if (toward(a.perch.x, a.perch.y, a.perch.z, 8) < 0.4) (a.state = 'perch'), (a.timer = rnd(4, 10));
      return;
    }
    if (a.state === 'swoop') {
      const p = a.prey;
      if (!p || !p.alive || p.gone) return (a.state = 'fly'), (a.prey = null);
      const d = toward(p.x, (p.y ?? 0) + 0.2, p.z, 12);
      if (d < 0.7) {
        // Taken: carried off, up to a tree a way off.
        p.gone = true;
        const near = Math.hypot(a.x - cam.x, a.z - cam.z);
        if (near < 60) ctx.sound?.call('flutter', ctx.pan(a.x, a.z), Math.max(0.15, 1 - near / 60)), ctx.sound?.call('peep', ctx.pan(a.x, a.z), Math.max(0.1, 0.8 - near / 60));
        const t = rnd(0, TAU), x = a.x + Math.sin(t) * 40, z = a.z + Math.cos(t) * 40;
        a.perch = { x, z, y: g.getHeight(x, z) + rnd(6, 9) };
        a.state = 'fly';
        a.prey = null;
      }
    }
  }

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
    // (The land's own slope, from the terrain itself: costly to work out, and
    // it never changes, so remembered on a 2 m grid.)
    if (this.slopeOf !== g) (this.slopes = new Map()), (this.slopeOf = g);
    if (this.slopes.size > 80000) this.slopes.clear();
    const key = Math.round(x / 2) * 100003 + Math.round(z / 2);
    let t = this.slopes.get(key);
    if (t === undefined) {
      const e = 2, cx = Math.round(x / 2) * 2, cz = Math.round(z / 2) * 2;
      const gx = g.getHeight(cx + e, cz) - g.getHeight(cx - e, cz), gz = g.getHeight(cx, cz + e) - g.getHeight(cx, cz - e);
      t = Math.hypot(gx, gz) / (2 * e);
      this.slopes.set(key, t);
    }
    return t === t ? Math.max(s, t) : s;
  }

  /**
   * Every creature that has a voice uses it now and then, near you: deer
   * bleat, elk mew (and bugle in the autumn), moose grunt, bison grunt,
   * bears huff and growl, wolves howl and coyotes yip (most at night),
   * foxes bark in the dark, a cougar screams, boar grunt, sheep and goats
   * bleat, turkeys gobble, ducks quack, tigers roar and chuff, jaguars saw,
   * panthers growl, pandas bleat, crocodiles bellow, songbirds sing (each
   * its own song), rabbits thump. A herd calls one at a time.
   */
  #vocalize(dt, views) {
    const night = 1 - (views[0].day ?? 1);
    for (const a of this.animals) {
      if (!a.alive || a.gone || a.tame || a.kind === 'monkey') continue;
      const ctx = this.#near(a, views);
      const holder = a.herd ?? a;
      if (holder.voiceAt === undefined) holder.voiceAt = this.time + rnd(5, 40);
      if (this.time < holder.voiceAt) continue;
      const t = this.#threat(a, ctx);
      holder.voiceAt = this.time + rnd(18, 70);
      if (t.d > 200) continue;
      let call = null;
      switch (a.kind) {
        case 'deer': call = a.young ? 'bleat' : Math.random() < 0.3 ? 'snort' : null; break;
        case 'elk': call = (ctx.autumn ?? 0) > 0.35 && a.antlers ? 'bugle' : 'mew'; break;
        case 'moose': call = 'moose'; break;
        case 'bison': call = 'grunt'; break;
        case 'blackBear': call = Math.random() < 0.6 ? 'huff' : 'growl'; break;
        case 'grizzly': call = Math.random() < 0.5 ? 'huff' : 'growl'; break;
        case 'wolf': call = night > 0.5 || Math.random() < 0.15 ? 'howl' : null; break;
        case 'wolfPup': call = 'yip'; break;
        case 'coyote': call = night > 0.4 || (ctx.dusk ?? 0) > 0.2 ? 'yip' : null; break;
        case 'fox': call = night > 0.5 ? 'bark' : null; break;
        case 'cougar': call = Math.random() < 0.3 ? 'scream' : null; break;
        case 'boar': call = 'oink'; break;
        case 'sheep': call = 'baa'; break;
        case 'mountainGoat': call = Math.random() < 0.35 ? 'goat' : null; break; // (mostly quiet)
        case 'goat': call = Math.random() < 0.5 ? 'goat' : null; break;
        case 'turkey': call = 'gobble'; break;
        case 'duck': call = 'quack'; break;
        case 'tiger': call = Math.random() < 0.35 ? 'roar' : 'chuff'; break;
        case 'jaguar': call = 'jaguar'; break;
        case 'panther': call = 'growl'; break;
        case 'panda': call = 'panda'; break;
        case 'crocodile': call = Math.random() < 0.5 ? 'crocBellow' : 'hiss'; break;
        case 'lion': call = night > 0.4 || (ctx.dusk ?? 0) > 0.2 ? 'roar' : Math.random() < 0.3 ? 'chuff' : null; break;
        case 'hyena': call = night > 0.4 ? 'hyena' : null; break;
        case 'elephant': call = Math.random() < 0.3 ? 'trumpet' : 'rumble'; break;
        case 'hippo': call = 'hippo'; break;
        case 'camel': call = Math.random() < 0.4 ? 'camel' : null; break;
        case 'horse': call = Math.random() < 0.4 ? 'neigh' : 'snort'; break;
        case 'donkey': case 'mule': call = Math.random() < 0.35 ? 'bray' : Math.random() < 0.3 ? 'snort' : null; break;
        case 'rabbit': case 'hare': call = Math.random() < 0.2 ? 'thump' : null; break;
        case 'songbird':
          a.voice ??= Math.floor(Math.random() * 7);
          call = a.state === 'perch' && (ctx.day ?? 1) > 0.3 ? `song${a.voice}` : null;
          holder.voiceAt = this.time + rnd(4, 14); // (songbirds sing often)
          break;
      }
      // (How far a call carries: a howl, a bugle, a roar a long way; a bleat,
      // a grunt, a gobble only a little way, dying away fast.)
      const carry = LOUD_CALLS.has(call) ? 60 : 18;
      if (call) ctx.sound?.call(call, ctx.pan(a.x, a.z), Math.min(1, (carry / (t.d + carry * 0.5)) ** 2));
    }
  }

  // Where a fallen creature lies: on the ground; or, in water deeper than
  // it lies, floating, low in it, bobbing, drifting with the current.
  #lie(a, sp, dt, ctx) {
    const y = ctx.ground(a.x, a.z);
    const w = ctx.waterAt?.(a.x, a.z), half = (sp.height ?? 1) * a.scale * 0.3;
    if (w && !w.frozen && w.level - (y === y ? y : -Infinity) > half * 1.2) {
      const float = w.level - half * 0.8 + Math.sin(this.time * 1.3 + (a.phase ?? 0)) * 0.03;
      a.y = a.floating ? a.y + (float - a.y) * Math.min(1, dt * 2) : Math.min(a.y, float);
      a.floating = true;
      if (w.fx || w.fz) {
        const nx = a.x + (w.fx ?? 0) * (w.speed ?? 0) * 0.4 * dt, nz = a.z + (w.fz ?? 0) * (w.speed ?? 0) * 0.4 * dt;
        if (ctx.waterAt(nx, nz)) (a.x = nx), (a.z = nz);
      }
      return;
    }
    a.floating = false;
    if (y === y) a.y = y;
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
      if (herd.den && lead) { const k = herd.kind === 'hippo' ? 4 : 12; herd.goal = { x: herd.den.x + rnd(-k, k), z: herd.den.z + rnd(-k, k) }; } // (a pack keeps near its den; hippos to their pond)
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
    for (let k = 0; k < 24; k++) {
      const h = away + (k / 24) * TAU;
      const off = Math.abs(angleTo(away, h));
      if (off > 2.3) continue; // (never back towards you)
      // (Looking a long way ahead: through the gaps in the trees, round the
      // steep ground, along the easy way out rather than into a dead end.)
      let score = Math.cos(off) * 3, clear = 0, wet = 0, y0 = ctx.ground(o.x, o.z), last = 0, climb = 0;
      for (const d of [4, 9, 15, 23, 32, 44, 60]) {
        const x = o.x + Math.sin(h) * d, z = o.z + Math.cos(h) * d;
        const kind = this.#footing(a, sp, x, z, ctx);
        if (!kind) break;
        const y = ctx.ground(x, z);
        if (Math.abs(y - y0) > sp.grade * (d - last) * 1.4) break;
        climb += Math.abs(y - y0) / (d - last);
        y0 = y;
        last = d;
        if (kind === 2) wet++;
        clear++;
      }
      score += clear * 1.6 - wet * 1.1 - climb * 2.5 - (clear < 2 ? 6 : 0);
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
      this.#lie(a, sp, dt, ctx);
      return;
    }
    if (!a.alive) {
      // Down on its side, where it fell (or dragged off by a scavenger).
      a.deadTime += dt;
      a.speed = 0;
      a.feet = null;
      const R = a.rag;
      if (R && R.t < 3) {
        // Toppling: falling over faster as it goes (gravity on a body tipping
        // past its balance), sliding on with its speed, then a dull bounce or
        // two as it lands on its side, and still.
        R.t += dt;
        // (Always over towards the side it's falling to: a bounce sends it
        // back a little, and it falls again; never round and round.)
        const g = 14 * Math.max(0.15, Math.sin(Math.min(Math.PI / 2, Math.abs(a.roll)) + 0.15)) * a.side;
        R.w += g * dt;
        a.roll += R.w * dt;
        const flat = a.side * Math.PI * 0.5;
        if ((a.roll - flat) * a.side > 0) {
          a.roll = flat;
          R.w = R.bounced < 2 && Math.abs(R.w) > 1 ? -R.w * 0.28 : 0;
          if (R.bounced === 0) this.ctx?.sound?.call('thump', this.ctx.pan(a.x, a.z), Math.min(0.8, 0.25 * a.scale * (SPECIES[a.kind].size ?? 1)));
          R.bounced++;
        }
        if (R.v > 0.05) {
          const nx = a.x + Math.sin(a.heading) * R.v * dt, nz = a.z + Math.cos(a.heading) * R.v * dt;
          if (ctx.ground(nx, nz) === ctx.ground(nx, nz)) (a.x = nx), (a.z = nz);
          R.v *= Math.exp(-3.5 * dt);
        }
        // (Kept to the quarter turn between upright and its side.)
        if (a.roll * a.side < -0.3) (a.roll = -0.3 * a.side), (R.w = 0);
      } else a.roll += (a.side * Math.PI * 0.5 - a.roll) * Math.min(1, dt * 5);
      this.#lie(a, sp, dt, ctx);
      return;
    }
    if (sp.water) return this.#duck(a, sp, dt, ctx);
    if (EQUINE.has(a.kind) && a.tame) this.#horseNeeds(a, dt, ctx);
    this.#growUp(a, dt);
    const herd = a.herd;
    const t = this.#threat(a, ctx);
    // How much of a threat you are: running at them, much; walking, some;
    // keeping low and moving slowly, little (and less still standing still
    // crouched). Too close for that (on the ground, or flying low over
    // them): they bolt.
    const p = ctx.player, onFoot = p && p.mode === 'walk' && p.alive;
    const stance = (!onFoot ? 1 : p.crouch ? (p.moving ? 0.45 : 0.3) * (1 - 0.05 * (p.sneak ?? 0)) : p.sprint ? 1.5 : p.moving ? 1 : 0.6) * (onFoot && p.quiet && p.moving ? 0.85 : 1); // (soft boots: your steps quieter)
    // (In tall grass you're half hidden: crouched in it, nearly.)
    const cover = onFoot ? (p.cover ?? 0) * (p.crouch ? 1 : 0.6) : 0;
    const reach = sp.flee * stance * (1 - 0.55 * cover) * (t.above > 25 ? 0.5 : 1) * (onFoot ? this.#scent(a, ctx) : 1);
    if (a.boss) this.#bossMind(a, sp, t, ctx);
    if (sp.predator?.ambush) this.#ambush(a, sp, t, dt, ctx);
    else if (sp.predator && !a.young) this.#stalk(a, sp, t, dt, ctx);
    // And the other animals: hunting them, as hunters do (when it isn't after you).
    if (HUNTS[a.kind] && !a.young && !a.tame && !a.boss && !a.lame) this.#preyMind(a, sp, dt, ctx);
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
    const lured = (a.kind === 'sheep' || a.kind === 'goat' || a.kind === 'turkey' || a.kind === 'duck') && onFoot && p.lure && t.d < 16 && !a.flying;
    if (lured) {
      a.fear = 0;
      a.followed = (a.followed ?? 0) + dt;
      if (!a.tame && a.followed > 4) this.#tame(a);
    }
    // A wild horse, settling: come up slowly with food in your hand and it
    // lets you near, its calm growing (see `calming`, for the meter); come
    // at it fast, or hurt it, and it's gone again. Calm enough: it's yours.
    const settling = EQUINE.has(a.kind) && !a.tame && !a.young && onFoot && p.food && !p.sprint && t.d < 24 && !(herd?.fleeTime > 0);
    if (EQUINE.has(a.kind) && !a.tame) {
      if (settling) {
        a.fear = 0;
        const slow = p.crouch || !p.moving ? 1 : 0.6;
        a.calm = Math.min(1, (a.calm ?? 0) + (dt / 14) * slow * (t.d < 10 ? 1.3 : 1));
        if (!this.calming || t.d < this.calming.d) this.calming = { a, calm: a.calm, d: t.d };
        if (a.calm >= 1) {
          this.#tame(a);
          this.ctx?.sound?.call(a.kind === 'horse' ? 'neigh' : 'bray', this.ctx.pan(a.x, a.z), 0.6);
          a.hunger = a.thirst = 80;
          a.stamina = 100;
        }
      } else if (onFoot && (p.sprint && t.d < 30)) a.calm = 0;
      else a.calm = Math.max(0, (a.calm ?? 0) - dt / 30);
    }
    if (!ctx.tame && !a.tame && !a.boss && !lured && !settling && !sp.fearless && !a.hunting && !(a.charging > 0) && !a.stalking && t.d < reach && t.above < 50) {
      if (herd) {
        if (herd.fleeTime <= 0 && a.kind === 'bison') ctx.sound?.call('grunt', ctx.pan(a.x, a.z), 0.6);
        if (herd.fleeTime <= 0 && (a.kind === 'deer' || a.kind === 'elk')) ctx.sound?.call('snort', ctx.pan(a.x, a.z), 0.5);
        if (herd.fleeTime <= 0 && a.kind === 'turkey') ctx.sound?.call('gobble', ctx.pan(a.x, a.z), 0.5);
        if (herd.fleeTime <= 0 && a.kind === 'boar') ctx.sound?.call('oink', ctx.pan(a.x, a.z), 0.6);
        this.#alarm(herd, ctx.camera.position.x, ctx.camera.position.z);
      } else (a.fear = 12), (a.fearFrom = null);
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
        if (t.d < 2.4 * (a.boss ? 1.5 : 1) && p?.alive) p.damage(a.boss?.bite ?? sp.predator.bite * 1.4, a.kind, a);
        a.attackCd = 1;
      }
      const y = ctx.ground(a.x, a.z);
      if (y === y) a.y = y + (a.air ?? 0);
      a.feet = null;
      return;
    }
    if (a.ridden) {
      // Ridden (see Game): where the rider steers it, as fast as they ask;
      // a small jump now and then (`hop`). Never into a cave.
      want = a.rideWant ?? a.heading;
      speed = a.rideSpeed ?? 0;
      const cave = ctx.generator.caves?.field?.nearEntrance?.(a.x + Math.sin(want) * 3, a.z + Math.cos(want) * 3, 3);
      if (cave) (speed = 0), (a.balked = true);
      else a.balked = false;
      if (a.hop) {
        a.hop.vy -= 9.8 * dt;
        a.air = Math.max(0, (a.air ?? 0) + a.hop.vy * dt);
        if (a.air <= 0 && a.hop.vy < 0) (a.hop = null), (a.air = 0);
      }
      a.state = speed > sp.walk * 1.5 ? 'run' : speed > 0.1 ? 'walk' : 'look';
      a.timer = 1;
    } else if (!a.tame && !a.boss && this.#wildfireAt(a.x, a.z, ctx, 25)) {
      // A wildfire: every animal runs from it, upwind of the flames or
      // anywhere away, and won't come back in while it burns.
      const f = this.#wildfireAt(a.x, a.z, ctx, 25);
      want = Math.atan2(a.x - f.x, a.z - f.z);
      speed = sp.run * (Math.hypot(a.x - f.x, a.z - f.z) < f.r + 8 ? 0.95 : 0.7);
      a.state = 'flee';
      a.timer = 2;
      a.hunting = a.stalking = false;
      if (herd) herd.goal = { x: f.x + (a.x - f.x) * 3, z: f.z + (a.z - f.z) * 3 };
    } else if (a.led && onFoot) {
      // Led on a rope: following you, keeping a few steps behind.
      want = Math.atan2(p.x - a.x, p.z - a.z);
      speed = t.d > 3.2 ? Math.min(sp.run * 0.6, sp.walk * (t.d > 8 ? 3 : 1.3)) : 0;
      a.state = speed ? 'walk' : 'look';
      a.timer = 1;
      a.home = { x: a.x, z: a.z };
    } else if (a.charging > 0 && a.threaten > 0) {
      // Standing its ground, facing you, threatening: the warning.
      a.threaten -= dt;
      want = Math.atan2(p.x - a.x, p.z - a.z);
      speed = 0;
      a.state = 'threat';
      // (Backed well off by the end of it: it lets you go.)
      if (a.threaten <= 0 && t.d > Math.max(ch.close, 3) * 1.6 + 2) (a.charging = 0), (a.chargeCool = rnd(8, 15));
      if (!onFoot) a.charging = 0;
    } else if (a.charging > 0) {
      // Charging you, head down: a hit, and it's done.
      a.charging -= dt;
      want = Math.atan2(p.x - a.x, p.z - a.z);
      speed = sp.run * 0.85;
      a.state = 'charge';
      if (t.d < ch.reach * (a.boss ? 1.3 : 1) + sp.radius * a.scale && Math.abs(p.y - 1.2 - a.y) < 2.5 + (a.boss ? 1 : 0) && onFoot) {
        p.damage((a.boss?.hit ?? ch.hit) * rnd(0.8, 1.2), a.kind, a);
        if (ch.venom) p.poison?.(a.kind);
        a.charging = 0;
      }
      if (!onFoot || t.d > 40) a.charging = 0;
      if (a.charging <= 0) {
        // (A great beast turns and comes again, after a breath: a moment to strike it.)
        a.chargeCool = a.boss ? rnd(3, 4.5) : rnd(15, 30);
        a.fear = a.boss ? 0 : 5;
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
      // (A great beast reaches from further: its head's well out in front of it.)
      const inReach = pr.reach + sp.radius * a.scale + (a.boss ? 0.45 * a.scale : 0);
      speed = t.d > inReach ? sp.run * (t.d > 25 ? 0.95 : 0.8) : 0;
      a.state = 'hunt';
      a.attackCd = (a.attackCd ?? 0) - dt;
      a.growl = (a.growl ?? rnd(2, 6)) - dt;
      if (a.growl <= 0) {
        a.growl = rnd(4, 9);
        ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : a.kind === 'cougar' ? 'hiss' : 'growl', ctx.pan(a.x, a.z), Math.min(0.7, 12 / (t.d + 6)));
      }
      // (Never the first bite unwarned: in reach, it gathers itself a moment,
      // snarling, before it goes for you; out of reach again, and the next
      // will be warned of too.)
      const close = t.d <= inReach + 0.35 && Math.abs(p.y - 1.2 - a.y) < 2.5;
      if (!close && t.d > inReach + 2) a.ready = false;
      if (close && !a.ready && !(a.windup > 0)) {
        a.windup = a.boss ? 0.95 : 0.55; // (a great beast rears and roars: a long, clear wind-up)
        if (a.boss) ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : 'roar', ctx.pan(a.x, a.z), 0.9);
        a.crouch = 1;
        ctx.sound?.call(a.kind === 'wolf' ? 'snarl' : a.kind === 'hyena' ? 'hyena' : a.kind === 'crocodile' ? 'hiss' : 'growl', ctx.pan(a.x, a.z), 0.8);
      }
      if (a.windup > 0 && (a.windup -= dt) <= 0) (a.ready = true), (a.attackCd = Math.min(a.attackCd, 0));
      if (close && a.ready && a.attackCd <= 0) {
        a.attackCd = (a.boss?.every ?? pr.every) * rnd(0.85, 1.2);
        a.lunge = 0.35;
        p.damage((a.boss?.bite ?? pr.bite) * rnd(0.8, 1.2), a.kind, a);
        if (a.boss) a.ready = false; // (every blow of a great beast's is warned of)
      }
    } else if (fleeing) {
      // Running from you: the way that's open (see #escape), with the herd.
      const from = herd?.fear ?? a.fearFrom ?? ctx.camera.position;
      want = this.#escape(a, sp, from, ctx);
      if (herd?.mid) {
        // (Each its own way a little, fanning out as they bolt; now and then
        // one or a few break off altogether and run their own way, picked
        // afresh each time the herd's put to flight. Most keep with the
        // herd, drawn back in if they stray far.)
        if (a.splay === undefined || herd.fleeTime > (a.splayLast ?? 0) + 1) {
          a.splay = Math.random() < 0.22 ? rnd(0.9, 1.5) * (Math.random() < 0.5 ? -1 : 1) : rnd(-0.45, 0.45);
        }
        a.splayLast = herd.fleeTime;
        want += a.splay;
        const toMid = Math.atan2(herd.mid.x - a.x, herd.mid.z - a.z), far = Math.hypot(herd.mid.x - a.x, herd.mid.z - a.z);
        if (Math.abs(a.splay) < 0.6 && far > 14) want += angleTo(want, toMid) * 0.3;
      }
      if (a.kind === 'rabbit' || a.kind === 'hare') want += Math.sin(this.time * 3 + a.phase) * 0.6; // zig-zag
      speed = sp.run * (a.young ? 0.85 : 1);
      a.state = 'flee';
      a.detour = null;
      // (Only well clear of you, a long way off, do they settle again.)
      if (t.d > sp.calm * 3 && herd) herd.fleeTime = Math.min(herd.fleeTime, 0.5);
      if (t.d > sp.calm * 3 && !herd) a.fear = Math.min(a.fear, 0.5);
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
      if (t.d < sp.flee * (ctx.tame ? 1.3 : 1.8) * (1 - 0.55 * (onFoot ? (p.cover ?? 0) : 0)) && a.alertCool <= 0 && a.state !== 'alert' && a.state !== 'rest') {
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
        if (!herd && a.state === 'walk' && !a.goal?.water) a.goal = { x: a.home.x + rnd(-roam, roam), z: a.home.z + rnd(-roam, roam) };
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
    a.crouch = (a.crouch ?? 0) + (((a.stalking && sp.predator?.ambush) || a.chase?.phase === 'stalk' && HUNTS[a.kind]?.stalk ? 1 : 0) - (a.crouch ?? 0)) * Math.min(1, dt * 3);
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
    // Out after its quarry (see #chaseStep): stalking, rushing, running it
    // down; then at the kill, feeding.
    if (a.chase && !a.hunting && !a.stalking && a.state !== 'flee' && !(a.charging > 0) && !a.ridden && !a.led) {
      const m = this.#chaseStep(a, sp, dt, ctx);
      if (m) (want = m.want), (speed = m.speed);
    }
    // Run a long way, a hunted animal tires (it's how the wolves get it).
    if (fleeing) a.fled = (a.fled ?? 0) + dt;
    else a.fled = Math.max(0, (a.fled ?? 0) - dt * 0.5);
    if (fleeing && a.fled > 25) speed *= Math.max(0.62, 1 - (a.fled - 25) / 90);
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
    if (!fleeing && a.state === 'alert' && a.lookAround) {
      // (Startled by something it didn't see: head up, looking all about for it.)
      yaw = Math.sin(this.time * 1.3 + a.phase) * 1.1;
    } else if (!fleeing && (a.state === 'alert' || a.state === 'freeze' || a.state === 'stalk' || a.state === 'wary')) {
      const c = ctx.camera.position;
      yaw = Math.max(-1.1, Math.min(1.1, angleTo(a.heading, Math.atan2(c.x - a.x, c.z - a.z))));
    } else if (a.state === 'look') yaw = Math.sin(this.time * 0.8 + a.phase) * 0.9;
    else if (a.state === 'graze') yaw = Math.sin(this.time * 0.7 + a.phase) * 0.15;
    else yaw = Math.max(-0.5, Math.min(0.5, angleTo(a.heading, want) * 0.7));
    a.headYaw += (yaw - a.headYaw) * Math.min(1, dt * 3);
    if (a.state !== 'alert') a.lookAround = false;
    // Lying down (and getting up again before it moves off).
    a.lie += ((a.state === 'rest' && !fleeing ? 1 : 0) - a.lie) * Math.min(1, dt * (fleeing ? 4 : 0.9));
    speed *= 1 - smoothstep(0.1, 0.5, a.lie);
    const rearing = ((a.kind === 'rabbit' || a.kind === 'hare') && a.state === 'alert' && !fleeing) || a.state === 'threat';
    a.rear += ((rearing ? (a.kind === 'elephant' || a.kind === 'hippo' ? 0.45 : 1) : 0) - a.rear) * Math.min(1, dt * 5);
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
    // (Among many boulders, a way through: the way it wants, if that's clear
    // a little way ahead; else the nearest clear way to one side or the
    // other, keeping to the side it chose a moment, so it doesn't dither.)
    if (speed > 0) {
      const look = body + 1.5 + a.speed * 0.8;
      const obs = this.#obstacles(a.x, a.z, look + 3, ctx, sp.height * a.scale * 0.8);
      if (obs.length) {
        const clearance = (h) => {
          const fx = Math.sin(h), fz = Math.cos(h);
          let nearest = Infinity;
          for (let k = 0; k < obs.length; k += 3) {
            const ox = obs[k] - a.x, oz = obs[k + 1] - a.z, r = obs[k + 2] + me + 0.35;
            const along = ox * fx + oz * fz;
            if (along < -0.3 || along > look + r) continue;
            if (Math.abs(ox * fz - oz * fx) < r) nearest = Math.min(nearest, Math.max(0, along - r));
          }
          return nearest;
        };
        if (clearance(want) < look) {
          a.avoid = a.avoid && a.avoid.until > this.time ? a.avoid : { side: Math.random() < 0.5 ? 1 : -1, until: this.time + 1.5 };
          let best = null;
          for (let d = 0.3; d <= 2.7 && best === null; d += 0.3) {
            for (const side of [a.avoid.side, -a.avoid.side]) {
              if (clearance(want + side * d) >= look) {
                best = want + side * d;
                a.avoid.side = side;
                a.avoid.until = this.time + 1.5;
                break;
              }
            }
          }
          // (Hemmed in all round: the way with the most room.)
          if (best === null) {
            let room = -1;
            for (let d = -2.7; d <= 2.7; d += 0.45) {
              const c = clearance(want + d);
              if (c > room) (room = c), (best = want + d);
            }
          }
          want = best;
        }
      }
    }
    // Turn (slowly from a standstill, as it sets off; not spinning on the
    // spot), speed up or slow down.
    const urgent = fleeing || a.hunting || a.charging > 0 || a.ridden;
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
    if (a.shoreHeading !== null && a.shoreHeading !== undefined) (a.heading = a.shoreHeading), (a.speed = Math.max(a.speed, sp.walk * 1.5));
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
      // (One that's somehow in water too deep for it, a rabbit pushed in: it paddles out, any way it can.)
      const sunk = !sp.swims && this.#footing(a, sp, a.x, a.z, ctx) === 0;
      const blocked = sunk ? false : !kind || !ahead || (steep && !wet) || (wet && !(fleeing || swimming || a.hunting || a.ridden || a.led));
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
    if (y === y) a.y = y + (a.air ?? 0);
    const c0 = ctx.camera.position;
    // In deep water: swimming, low in it, only its back and head out.
    const w = ctx.waterAt?.(a.x, a.z); // (any of them: none walks along the bottom)
    const H = this.rigs[a.kind].model.legs[0][1] * a.scale;
    a.swimming = !!w && w.level - a.y > H * 0.8;
    // (One that doesn't swim, in over its head: making for the nearest shore.)
    if (a.swimming && !sp.swims && a.shoreHeading == null) {
      let best = null;
      for (let q = 0; q < 12; q++) {
        const ang = (q / 12) * TAU;
        for (let d = 2; d <= 30; d += 2) {
          if (this.#footing(a, sp, a.x + Math.sin(ang) * d, a.z + Math.cos(ang) * d, ctx) === 1) {
            if (!best || d < best.d) best = { d, ang };
            break;
          }
        }
      }
      a.shoreHeading = best ? best.ang : a.heading + Math.PI;
    }
    if (!a.swimming) a.shoreHeading = null;
    if (a.swimming) {
      a.y = w.level - H * 1.2;
      a.feet = null;
      // (A crocodile glides through the water: only now and then, hurrying, a swirl and a splash.)
      const croc = a.kind === 'crocodile';
      if ((a.swash = (a.swash ?? 0) - dt) <= 0 && (!croc || a.speed > sp.walk * 3)) {
        a.swash = croc ? rnd(4, 9) : 0.5;
        ctx.splash?.(a.x, w.level, a.z, a.scale * (croc ? 0.5 : 1));
        if (Math.hypot(a.x - c0.x, a.z - c0.z) < 40) ctx.sound?.call(croc ? 'swim' : 'splash', ctx.pan(a.x, a.z), croc ? 0.2 : 0.4);
      }
    }
    // Leaning with the slope: mostly along it (as a real animal's back
    // follows the hill, the legs only taking up the rest), the ground felt
    // under its fore and hind feet (not just under its middle), and
    // eased into, so it doesn't jerk at each facet of the ground.
    const sx = Math.sin(a.heading), sz = Math.cos(a.heading), L = Math.max(0.3, sp.height * 0.6 * a.scale / (sp.size ?? 1));
    const up = ctx.ground(a.x + sx * L, a.z + sz * L), down = ctx.ground(a.x - sx * L, a.z - sz * L);
    if (up === up && down === down && !a.swimming) {
      const along = Math.max(-0.6, Math.min(0.6, -Math.atan2(up - down, 2 * L) * 0.8));
      a.pitch += (along - a.pitch) * Math.min(1, dt * 4);
    }
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
    // A beaver: under the water a while, then up again somewhere near its lodge.
    if (sp.diver && a.dive) {
      a.dive.t -= dt;
      const w = ctx.waterAt?.(a.x, a.z);
      const home = a.home ?? a;
      a.heading += angleTo(a.heading, Math.atan2(home.x - a.x, home.z - a.z)) * Math.min(1, dt);
      const nx = a.x + Math.sin(a.heading) * 0.8 * dt, nz = a.z + Math.cos(a.heading) * 0.8 * dt, nw = ctx.waterAt?.(nx, nz);
      if (nw && nw.level - ctx.ground(nx, nz) > 0.5) (a.x = nx), (a.z = nz);
      a.y = (w ? w.level : a.y) - 1.4;
      if (a.dive.t <= 0) a.dive = null;
      return;
    }
    if (sp.diver && !ctx.tame && t.d < sp.flee * stance && p?.alive) {
      // (The slap of its tail on the water, the warning; and down it goes.)
      const w = ctx.waterAt?.(a.x, a.z);
      if (w) ctx.splash?.(a.x, w.level, a.z, 1.6);
      ctx.sound?.call('bigsplash', ctx.pan(a.x, a.z), 0.8);
      a.dive = { t: rnd(18, 40) };
      return;
    }
    if (!sp.diver && !ctx.tame && t.d < sp.flee * stance && p?.alive) {
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
    if (!sp.diver && (a.callWait = (a.callWait ?? rnd(5, 30)) - dt) <= 0) {
      a.callWait = rnd(12, 40);
      if (t.d < 160) ctx.sound?.call('quack', ctx.pan(a.x, a.z), Math.min(0.6, (40 / (t.d + 20)) ** 2)); // (a duck's quack carries, over the water)
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
    // A rattlesnake rattles; a python, bigger, hisses and draws its head
    // back: either way, a warning before it strikes (a python's no venom,
    // but a heavy, crushing bite).
    const python = a.kind === 'python' || !!a.boss, aware = a.boss ? 10 : python ? 7 : 5, reach = a.boss ? 3.6 : python ? 2.8 : 1.8;
    if (onFoot && t.d < aware && a.state !== 'flee') {
      if (a.state !== 'coil') (a.state = 'coil'), (a.timer = rnd(4, 8)), (a.warnedAt = this.time);
      a.rattle = (a.rattle ?? 0) - dt;
      if (a.rattle <= 0) (a.rattle = python && !a.boss ? 1.3 : 0.7), ctx.sound?.call(python && !a.boss ? 'hiss' : 'rattle', ctx.pan(a.x, a.z), Math.min(1, (a.boss ? 8 : 3) / (t.d + 1)));
      a.heading += angleTo(a.heading, Math.atan2(p.x - a.x, p.z - a.z)) * Math.min(1, dt * 4);
      if (t.d < reach && a.strikeCd <= 0 && this.time - (a.warnedAt ?? 0) > (a.boss ? 1.2 : 0.7)) {
        a.strike = 0.25;
        a.strikeCd = python ? 2.6 : 2.2;
        ctx.sound?.call('hiss', ctx.pan(a.x, a.z), 0.8);
        p.damage(a.boss?.bite ?? (python ? 20 : 7), a.kind, a);
        if (!python || a.boss) p.poison?.();
        if (!a.boss && Math.random() < (python ? 0.15 : 0.4)) (a.state = 'flee'), (a.timer = rnd(6, 10));
      }
    } else if (a.state === 'coil' && (a.timer -= dt) <= 0) (a.state = 'flee'), (a.timer = rnd(5, 9));
    a.coil = (a.coil ?? 0) + ((a.state === 'coil' ? 1 : 0) - (a.coil ?? 0)) * Math.min(1, dt * 4);
    let speed = 0;
    if (a.state === 'flee') {
      speed = sp.run;
      const away = Math.atan2(a.x - p.x, a.z - p.z);
      a.base = a.base === undefined ? away : a.base + angleTo(a.base, away) * Math.min(1, dt * 2);
      if ((a.timer -= dt) <= 0) (a.state = 'slither'), (a.timer = rnd(4, 10));
    } else if (a.state === 'slither') {
      speed = sp.walk;
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
      const model = this.rigs[a.kind].model;
      if (a.trail.length > (model.segments * model.spacing * a.scale) / 0.03 + 4) a.trail.pop();
    }
  }

  /**
   * A monkey: sits up in a crown; every so often leaps across to another
   * tree's crown near by (an arc through the air), or climbs down the trunk
   * to the ground, ambles about a little, and climbs back up. Too close, it
   * screams and bounds away through the treetops.
   */
  #monkey(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    const t = this.#threat(a, ctx);
    const scared = (!ctx.tame && t.d < SPECIES.monkey.flee && a.state !== 'leap') || (a.state !== 'leap' && !!this.#wildfireAt(a.x, a.z, ctx, 20));
    a.timer -= dt;
    a.call = (a.call ?? rnd(5, 30)) - dt;
    if (a.call <= 0 && t.d < 160) {
      a.call = rnd(12, 45);
      ctx.sound?.call(Math.random() < 0.35 ? 'howler' : 'chatter', ctx.pan(a.x, a.z), Math.min(0.8, 30 / (t.d + 15)));
    }
    const crowns = () => this.#crownsNear(ctx, 160).filter((c) => Math.hypot(c[0] - a.x, c[1] - a.z) < (scared ? 22 : 16) && Math.hypot(c[0] - a.x, c[1] - a.z) > 3);
    if (a.state === 'perch') {
      if (Math.random() < dt * 0.6) a.heading += rnd(-1.2, 1.2);
      if (scared || a.timer <= 0) {
        if (scared) ctx.sound?.call('chatter', ctx.pan(a.x, a.z), 0.7);
        const list = crowns();
        const cam = ctx.camera.position;
        const away = scared ? list.filter((c) => Math.hypot(c[0] - cam.x, c[1] - cam.z) > Math.hypot(a.x - cam.x, a.z - cam.z)) : list;
        const c = (away.length ? away : list)[Math.floor(Math.random() * Math.max(1, (away.length ? away : list).length))];
        const to = c ? this.#perchOn(c, { ...ctx, winter: 0 }) : null;
        if (!scared && Math.random() < 0.25 && a.trunk) {
          // Down the trunk to the ground.
          a.state = 'climb';
          a.climb = { from: a.y, to: ctx.ground(a.trunk.x, a.trunk.z) + 0.05, up: false };
          a.x = a.trunk.x;
          a.z = a.trunk.z;
        } else if (to) {
          const d = Math.hypot(to.x - a.x, to.z - a.z);
          a.heading = Math.atan2(to.x - a.x, to.z - a.z);
          a.path = { from: { x: a.x, y: a.y, z: a.z }, to, p: 0, dur: Math.max(0.5, d / (scared ? 8 : 5.5)), arc: 1 + d * 0.12 };
          a.trunk = { x: c[0], z: c[1], top: to.y };
          a.state = 'leap';
        }
        a.timer = rnd(4, 15);
      }
    } else if (a.state === 'leap' && a.path) {
      const P = a.path;
      P.p = Math.min(1, P.p + dt / P.dur);
      a.x = P.from.x + (P.to.x - P.from.x) * P.p;
      a.z = P.from.z + (P.to.z - P.from.z) * P.p;
      a.y = P.from.y + (P.to.y - P.from.y) * P.p + Math.sin(Math.PI * P.p) * P.arc;
      a.pitch = 0.5 * Math.cos(Math.PI * P.p);
      if (P.p >= 1) {
        a.state = 'perch';
        a.pitch = 0;
        a.path = null;
        if (Math.random() < 0.3) ctx.sound?.call('rustle', ctx.pan(a.x, a.z), Math.min(0.5, 15 / (t.d + 10)));
      }
    } else if (a.state === 'climb') {
      // Hand over hand along the trunk, facing it.
      const C = a.climb;
      const v = 1.6 * dt;
      a.pitch = -1.25;
      a.y += C.to > a.y ? Math.min(v, C.to - a.y) : -Math.min(v, a.y - C.to);
      if (Math.abs(a.y - C.to) < 0.05) {
        a.pitch = 0;
        if (C.up) (a.state = 'perch'), (a.timer = rnd(5, 15));
        else (a.state = 'ground'), (a.timer = rnd(6, 16)), (a.y = C.to);
      }
    } else if (a.state === 'ground') {
      // Ambling about at the tree's foot on all fours, then back up.
      a.hop = (a.hop ?? 0) - dt;
      if (a.hop <= 0) {
        a.hop = rnd(0.5, 1.5);
        a.heading += rnd(-1, 1);
        const nx = a.x + Math.sin(a.heading) * 0.6, nz = a.z + Math.cos(a.heading) * 0.6, ny = ctx.ground(nx, nz);
        if (ny > ctx.seaLevel + 0.2 && Math.hypot(nx - (a.trunk?.x ?? nx), nz - (a.trunk?.z ?? nz)) < 4) a.amble = { t: 0, fx: a.x, fz: a.z, fy: a.y, tx: nx, tz: nz, ty: ny + 0.05 };
      }
      // (Walking there, not jumping: a few steps' worth, bobbing.)
      if (a.amble) {
        const M = a.amble;
        M.t += dt / 0.5;
        const u = Math.min(1, M.t);
        a.x = M.fx + (M.tx - M.fx) * u;
        a.z = M.fz + (M.tz - M.fz) * u;
        a.y = M.fy + (M.ty - M.fy) * u + Math.abs(Math.sin(u * Math.PI * 2)) * 0.03;
        if (u >= 1) a.amble = null;
      }
      if ((a.timer <= 0 || t.d < SPECIES.monkey.flee * 1.4) && a.trunk) {
        if (t.d < SPECIES.monkey.flee * 1.4) ctx.sound?.call('chatter', ctx.pan(a.x, a.z), 0.7);
        a.x = a.trunk.x;
        a.z = a.trunk.z;
        a.state = 'climb';
        a.amble = null;
        a.climb = { from: a.y, to: a.trunk.top, up: true };
      }
    }
  }

  #songbird(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    const t = this.#threat(a, ctx);
    const scared = (!ctx.tame && t.d3 < SPECIES.songbird.flee) || !!this.#wildfireAt(a.x, a.z, ctx, 20);
    a.timer -= dt;
    if (a.state === 'perch' || a.state === 'ground') {
      // Look about; on the ground, hop and peck.
      if (Math.random() < dt * 0.8) a.heading += rnd(-1.2, 1.2);
      if (a.state === 'ground') {
        a.hop = (a.hop ?? 0) - dt;
        const H = a.hopping && this.time - a.hopping.at < 0.5 ? a.hopping : null; // (not one left over from before it flew)
        if (H) {
          // In the air: a quick little hop, both feet together.
          H.t += dt / 0.16;
          const u = Math.min(1, H.t);
          a.x = H.fx + (H.tx - H.fx) * u;
          a.z = H.fz + (H.tz - H.fz) * u;
          a.y = H.fy + (H.ty - H.fy) * u + Math.sin(u * Math.PI) * 0.06 * a.scale;
          if (u >= 1) a.hopping = null;
        } else if (a.hop <= 0) {
          // (Sometimes two or three hops together, then a pause to peck.)
          a.hop = Math.random() < 0.5 ? rnd(0.08, 0.2) : rnd(0.5, 1.6);
          const d = rnd(0.12, 0.3);
          const nx = a.x + Math.sin(a.heading) * d, nz = a.z + Math.cos(a.heading) * d;
          const ny = ctx.ground(nx, nz);
          if (ny > ctx.seaLevel + 0.2) a.hopping = { t: 0, at: this.time, fx: a.x, fz: a.z, fy: a.y, tx: nx, tz: nz, ty: ny + 0.07 * a.scale };
        }
      } else a.hopping = null;
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
      if (f.kind === 'crow' && Math.random() < dt * 0.5 && d < 300) ctx.sound?.call('caw', ctx.pan(f.centre.x, f.centre.z), Math.max(0.1, 1 - d / 300));
      // (Bats: a jinking, fluttering stream, each darting about the others.)
      if (f.erratic) for (const b of f.birds) if (Math.random() < dt * 3) (b.off.a += rnd(-2, 2)), (b.off.h = rnd(-3, 3)), (b.off.r = rnd(1, 7));
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
      // (Smoke and flames below: they wheel off elsewhere.)
      const fire = this.#wildfireAt(f.anchor.x, f.anchor.z, ctx, f.radius + 60);
      if (fire) {
        const dx = f.anchor.x - fire.x, dz = f.anchor.z - fire.z, l = Math.hypot(dx, dz) || 1;
        f.anchor.x += (dx / l) * 12 * dt;
        f.anchor.z += (dz / l) * 12 * dt;
      }
      // Now and then, down to feed in an open field.
      if (f.timer <= 0) {
        f.timer = rnd(25, 50);
        const x = f.centre.x + rnd(-40, 40), z = f.centre.z + rnd(-40, 40), y = ctx.ground(x, z);
        if (y > ctx.seaLevel + 1 && g.getForestDensity(x, z) < 0.45 && Math.hypot(x - cam.x, z - cam.z) > 50 && !this.#wildfireAt(x, z, ctx, 40)) {
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
      if ((!ctx.tame && d < SPECIES[f.kind].flee) || this.#wildfireAt(f.spot.x, f.spot.z, ctx, 40)) this.#scatter(f, ctx);
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

  // Carrion birds: anything big left dead a while (a kill, something you
  // shot and left), and they come: vultures over the open dry country,
  // crows in the woods and the plains, a few at first and more, wheeling
  // over it high up (seen from far off: there's something dead there), then
  // dropping down to it to feed once nothing's about; up again the moment
  // anyone comes near, till it's gone.
  #carrion(ctx) {
    const c = ctx.camera.position;
    for (const k of this.animals) {
      if (k.alive || k.gone || k.state !== 'dead' || k.birdsCalled || (k.deadTime ?? 0) < 25 || !SPECIES[k.kind].ground) continue;
      if (SPECIES[k.kind].bulk === 'small' || Math.hypot(k.x - c.x, k.z - c.z) > 500) continue;
      k.birdsCalled = true;
      const w = ctx.generator.getBiomeWeights(k.x, k.z, {});
      const dry = (w.savanna ?? 0) + (w.desert ?? 0) + (w.badlands ?? 0) + 0.6 * (w.temperate ?? 0) * (1 - ctx.generator.getForestDensity(k.x, k.z));
      const kind = dry > 0.45 && Math.random() < 0.85 ? 'vulture' : 'crow';
      const n = kind === 'vulture' ? Math.round(rnd(3, 7)) : Math.round(rnd(4, 9));
      const gy = ctx.ground(k.x, k.z);
      for (let i = 0; i < n; i++) {
        if (this.animals.filter((a) => a.kind === kind).length >= SPECIES[kind].max) break;
        const a = {
          kind, circling: true, carrion: k, centre: { x: k.x, z: k.z }, radius: rnd(14, 38), angle: rnd(0, TAU), dir: Math.random() < 0.7 ? 1 : -1,
          alt: kind === 'vulture' ? rnd(30, 70) : rnd(14, 28), speed: rnd(7, 10), x: k.x + rnd(-200, 200), y: (gy === gy ? gy : 30) + 90, z: k.z + rnd(-200, 200),
          heading: 0, pitch: 0, roll: 0, scale: SPECIES[kind].scale * rnd(0.9, 1.1), alive: true, health: SPECIES[kind].health,
          flap: 0, flapping: 0, nextFlap: rnd(2, 8), nextCall: rnd(3, 20), groundY: gy === gy ? gy : 30, state: 'fly', arrive: rnd(0, 40), landAt: rnd(35, 90),
        };
        this.animals.push(a);
      }
    }
  }

  #carrionBird(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    const k = a.carrion, c = ctx.camera.position;
    a.landAt -= dt;
    // (The dead gone: off and away.)
    if (!k || k.gone || k.alive) {
      a.carrion = null;
      a.circling = true;
      a.centre = { x: a.x + rnd(-400, 400), z: a.z + rnd(-400, 400) };
      a.state = 'fly';
      a.timeout = 40;
      return;
    }
    const you = Math.hypot(k.x - c.x, k.z - c.z);
    const busy = this.animals.some((o) => o.alive && o.chase?.prey === k && o.chase.phase === 'feed') || this.animals.some((o) => o.alive && o.scavenge === k);
    const land = a.landAt <= 0 && you > 30 && !busy;
    if (!land) {
      // Up and wheeling over it (up from it in a clatter if it was down).
      if (!a.circling) (a.circling = true), (a.state = 'fly'), (a.flapping = 1.5), (a.landAt = rnd(25, 60)), ctx.sound?.call('flutter', ctx.pan(a.x, a.z), 0.4);
      a.centre.x = k.x;
      a.centre.z = k.z;
      return this.#circler(a, dt, ctx);
    }
    // Down to it, round it on the ground, tearing at it.
    a.circling = false;
    if (!a.spot) {
      const ang = rnd(0, TAU), r = rnd(0.8, 2.2) * (SPECIES[k.kind].size ?? 1);
      a.spot = { x: k.x + Math.cos(ang) * r, z: k.z + Math.sin(ang) * r };
    }
    const gy = ctx.ground(a.spot.x, a.spot.z);
    const dx = a.spot.x - a.x, dz = a.spot.z - a.z, dy = (gy === gy ? gy : a.y) - a.y, d = Math.hypot(dx, dz, dy);
    if (d > 0.3) {
      // (Gliding down, wings out, then a few beats to land.)
      const v = Math.min(d, 9 * dt);
      a.x += (dx / d) * v;
      a.y += (dy / d) * v;
      a.z += (dz / d) * v;
      a.heading = Math.atan2(dx, dz);
      a.state = 'fly';
      a.flapping = d < 6 ? 0.5 : 0;
      a.flap += dt * (d < 6 ? 12 : 0);
      a.roll *= 0.9;
      return;
    }
    a.state = 'ground';
    a.landed = true;
    a.heading = Math.atan2(k.x - a.x, k.z - a.z);
    a.pitch = 0.35 + 0.3 * Math.max(0, Math.sin(this.time * 4 + a.angle * 7)); // (head down to it, tearing, and up)
    a.roll = 0;
    k.picked = (k.picked ?? 0) + dt / 160;
    k.deadTime = Math.min(k.deadTime, 150);
  }

  #circler(a, dt, ctx) {
    if (this.#falling(a, dt, ctx)) return;
    // Round and round on the wind, gliding, now and then a few wingbeats.
    const hawk = a.kind === 'hawk' || a.kind === 'eagle' || a.kind === 'vulture';
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
      if (d < 250 && a.kind !== 'vulture') ctx.sound?.call(a.kind === 'crow' ? 'caw' : hawk ? 'hawk' : 'gull', ctx.pan(a.x, a.z), Math.max(0.1, 1 - d / 250));
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

  #eyeshine(ctx) {
    const E = this.shineMesh;
    E.count = 0;
    const cam = ctx?.camera?.position;
    const dark = Math.min(1, Math.max(0, ((ctx?.night ?? 0) - 0.3) / 0.4));
    if (!cam || !ctx.eyeLight || dark <= 0 || this.hidden) return (E.visible = false);
    for (const a of this.animals) {
      if (!a.alive || !a.hm || E.count > 158) continue;
      const eye = this.rigs[a.kind]?.meshes.head?.geometry.userData.eye;
      if (!eye) continue;
      const d = Math.hypot(a.x - cam.x, (a.y ?? 0) - cam.y, a.z - cam.z);
      if (d > 70 || d < 1.5) continue;
      // (Looking your way: the head's forward, against the way to you.)
      // (Side to side only: grazing, its head down, its eyes still catch the light.)
      const e = a.hm.elements, fl = Math.hypot(e[8], e[10]) || 1, dh = Math.hypot(cam.x - a.x, cam.z - a.z) || 1;
      const look = (e[8] * (cam.x - a.x) + e[10] * (cam.z - a.z)) / (fl * dh);
      if (look < 0.35) continue;
      const k = Math.min(1, (look - 0.35) / 0.35) * dark * Math.min(1, 1.4 - d / 70);
      const size = Math.max(0.03, d * 0.0028);
      tint.setHex(SHINE[a.kind] ?? 0xb8e070).multiplyScalar(k);
      for (const sx of [1, -1]) {
        if (E.count >= 160) break;
        pos.set(sx * eye[0], eye[1], eye[2] + 0.01).applyMatrix4(a.hm);
        E.setMatrixAt(E.count, out.compose(pos, quat.identity(), scl.setScalar(size)));
        E.setColorAt(E.count++, tint);
      }
    }
    E.instanceMatrix.needsUpdate = true;
    if (E.instanceColor) E.instanceColor.needsUpdate = true;
    E.visible = E.count > 0;
  }

  #draw() {
    const counts = {};
    for (const [kind, rig] of Object.entries(this.rigs)) {
      counts[kind] = 0;
      for (const m of Object.values(rig.meshes)) m.count = 0;
    }
    const W = this.woundMesh;
    W.count = 0;
    const ctx = this.ctx;
    // (Only those in view are posed and drawn: one out of sight, more than
    // a few metres off, isn't. Close by, its shadow might fall in view.)
    const cam = ctx?.camera;
    if (cam) view.setFromProjectionMatrix(viewMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const a of this.animals) {
      const rig = this.rigs[a.kind], sp = SPECIES[a.kind], M = rig.meshes;
      if (counts[a.kind] >= sp.max) continue;
      // (Underground: nothing up on the surface through the rock overhead is drawn.)
      if ((a.y ?? 0) > (this.hideAbove ?? Infinity)) {
        a.m = null;
        a.hm = null;
        continue;
      }
      if (cam && !a.ridden) {
        const h = (sp.height ?? 1) * a.scale, near = Math.abs(a.x - cam.position.x) < 15 && Math.abs(a.z - cam.position.z) < 15;
        sphere.center.set(a.x, (a.y ?? 0) + h * 0.5, a.z);
        sphere.radius = Math.max(h, (sp.radius ?? 0.5) * a.scale * 3, sp.serpent ? 3 * a.scale : 0) + 2;
        if (!near && !view.intersectsSphere(sphere)) {
          a.m = null;
          a.hm = null;
          continue;
        }
      }
      counts[a.kind]++;
      if (sp.serpent) {
        this.#drawSnake(a, rig, ctx);
        continue;
      }
      // (A great beast's own coat; the rest of its kind as they're made.)
      const colour = a.coat ?? (sp.tinted ? (ctx?.winter > 0.5 ? white : HARE_BROWN) : rig.coloured ? white : null);
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
        // (Sitting up in a tree, it rides its branch as the wind sways it.)
        const sway = a.state === 'perch' && ctx?.trees?.swayAt ? ctx.trees.swayAt(a.x, a.y, a.z, ctx.chunkSize, SWAY) : null;
        base.compose(pos.set(a.x + (sway?.x ?? 0), a.y, a.z + (sway?.z ?? 0)), quat, scl.setScalar(a.scale));
        const perched = a.state === 'perch' || a.state === 'ground' || a.landed || a.state === 'dead';
        let flap = 0, fold = 0;
        if (perched) fold = 1.35;
        else flap = Math.sin(a.flap) * (a.kind === 'hawk' || a.kind === 'gull' ? 0.55 : 0.9);
        if (a.circling && !(a.flapping > 0)) flap = 0.08; // (gliding: wings held out, a slight lift)
        if (a.kind === 'monkey') {
          // Its arms: hanging as it sits, reaching up as it climbs, flung
          // forward as it leaps, swinging as it walks.
          const reach = a.state === 'climb' ? -2.7 + Math.sin(this.time * 9 + a.phase) * 0.5 : a.state === 'leap' ? -1.9 : a.state === 'ground' ? Math.sin(this.time * 6 + a.phase) * 0.5 : 0.15;
          put(M.body, [0, 0, 0], 0, 0, 0);
          put(M.wingL, [0.13, 0.42, 0.02], reach, 0, 0.12);
          put(M.wingR, [-0.13, 0.42, 0.02], a.state === 'climb' ? -2.7 - Math.sin(this.time * 9 + a.phase) * 0.5 : reach, 0, -0.12);
          a.m = null;
          continue;
        }
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
    W.visible = W.count > 0 && !this.hidden;
    this.#eyeshine(ctx);
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
    // (A crocodile's head lies along the ground: it never dips its snout into it.)
    let headRx = a.alive ? a.headDown * bend + nod : 0.35;
    if (a.kind === 'crocodile') headRx = Math.min(headRx, 0.06);
    headRx = Math.min(headRx, model.headMax ?? Infinity); // (never down into its own chest)
    const hp = model.headPivot;
    const thrust = sp.biped && a.alive && !sp.water && a.speed > 0.05 ? Math.max(0, Math.sin(TAU * (a.cycle ?? 0) * 2)) * 0.05 : 0;
    // (Dead, the head lolls over to the ground: a turn about the body's own up, which lying on its side is towards the ground.)
    const deadYaw = !a.alive ? -(a.side ?? 1) * 0.25 * Math.min(1, Math.abs(Math.sin(a.roll ?? 0))) : 0;
    const head = put(M.head, [hp[0], hp[1], hp[2] + thrust], headRx, a.alive ? a.headYaw : deadYaw, 0);
    a.hm = (a.hm ?? new Matrix4()).copy(head);
    if (M.antlers && a.antlers) put(M.antlers, [hp[0], hp[1], hp[2] + thrust], headRx, a.alive ? a.headYaw : 0, 0);
    if (M.saddle && a.saddled) put(M.saddle, [0, 0, 0], 0, 0, 0);
    // (A great beast's shag.)
    if (a.boss && M.furBody && M.furBody.count < 4) put(M.furBody, [0, 0, 0], 0, 0, 0);
    if (a.boss && M.furHead && M.furHead.count < 4) put(M.furHead, [hp[0], hp[1], hp[2] + thrust], headRx, a.alive ? a.headYaw : deadYaw, 0);
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
        // Limp (dead), or kicking (down): the legs flopped over to the ground
        // side, each foot resting just above the ground (lying on its side,
        // the body's x is up and down: the ground is at -side × its half
        // width), never pushed into it; stretched out from the belly.
        const kick = a.down && a.alive ? Math.sin(this.time * 7 + k * 1.7) * 0.3 * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.9))) : 0;
        const bb = model.body.boundingBox, half = ((bb.max.x - bb.min.x) / 2) * 0.8;
        const L = limb.l1 + limb.l2, lie = Math.abs(Math.sin(a.roll ?? 0));
        const settle = a.rag ? Math.min(1, a.rag.t / 0.7) : 1;
        const upper = Math.sign(p[0] || 1) === (a.side ?? 1); // (the legs on the upper side flop over)
        const rest = -(a.side ?? 1) * (half * 0.92 - 0.02) * lie;
        foot.x = p[0] + (rest - p[0]) * settle * (upper ? 1 : 0.85);
        foot.y = p[1] - L * (0.92 - 0.18 * settle) + (upper ? 0.04 : 0);
        foot.z = p[2] + (hind ? -1 : 1) * L * (0.12 + 0.18 * settle + kick) + (upper ? (hind ? -0.06 : 0.06) : 0);
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
      if (rig.coloured) M.segment.setColorAt(M.segment.count - 1, a.coat ?? white);
    }
    const lunge = (a.strike ?? 0) > 0 ? Math.sin(((0.25 - a.strike) / 0.25) * Math.PI) * 0.35 * s : 0;
    const h0 = a.segs[0];
    orient(0);
    out.compose(pos.set(h0.x + Math.sin(a.heading) * lunge, h0.y + lunge * 0.3, h0.z + Math.cos(a.heading) * lunge), quat, scl.setScalar(s));
    M.head.setMatrixAt(M.head.count++, out);
    if (rig.coloured) M.head.setColorAt(M.head.count - 1, a.coat ?? white);
    const tail = a.segs[n];
    orient(n - 1);
    if (a.state === 'coil' && a.alive) quat.multiply(shake.setFromEuler(euler.set(0, 0, Math.sin(this.time * 60) * 0.4)));
    out.compose(pos.set(tail.x, tail.y + coil * 0.08 * s, tail.z), quat, scl.setScalar(s));
    if (M.rattle) M.rattle.setMatrixAt(M.rattle.count++, out);
    if (M.rattle && rig.coloured) M.rattle.setColorAt(M.rattle.count - 1, a.coat ?? white);
    a.m = null;
    a.hm = null;
  }
}
