import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, Vector3 } from 'three';
import { seasonUniforms } from '../render/Seasons.js';
import { Felling } from './Felling.js';
import { GroundItems } from './GroundItems.js';
import { Hud } from './Hud.js';
import { Inventory } from './Inventory.js';
import { BLADES, GRINDS, ITEMS, RECIPES, RELICS, TIERS, stackOf, weightOf, tierOf, usesText } from './items.js';
import { bobberModel, bowModel } from './models.js';
import { Structures } from './Structures.js';
import { Survival } from './Survival.js';
import { TreeFinds } from './TreeFinds.js';
import { Progress, SKILLS } from './Progress.js';
import { Wildlife } from '../wildlife/Wildlife.js';

/** Your longest survival life yet, in days (kept in this browser): records `days`, returns the longest. */
export function recordRun(days) {
  let best = longestRun();
  if (days > best) {
    best = days;
    try {
      localStorage.setItem('facet-lands:longest', String(best));
    } catch {
      // (No storage: it isn't remembered.)
    }
  }
  return best;
}
export function longestRun() {
  try {
    return Math.max(0, parseInt(localStorage.getItem('facet-lands:longest') ?? '0', 10) || 0);
  } catch {
    return 0;
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const v = new Vector3(), dir = new Vector3(), q = new Quaternion(), FORWARD = new Vector3(0, 0, 1);

// How far you can reach, on foot.
const REACH = 3;
const QUIVERED = new Set(['arrow', 'poisonArrow', 'bolt', 'poisonBolt']);
const WORN_SLOT = { coat: 'worn', armour: 'armour', back: 'back' }; // (where each kind of thing worn goes: see Inventory)
const CACTI = new Set(['smallCactus', 'ocotillo']); // (bushes, but no vines on them)
const FRUIT = { raspberryBush: 'berries', blueberryBush: 'berries', appleTree: 'apple' };
const NAMES = {
  deer: 'deer', elk: 'elk', moose: 'moose', bison: 'bison', blackBear: 'black bear', grizzly: 'grizzly bear', wolf: 'wolf', wolfPup: 'wolf pup', coyote: 'coyote', fox: 'fox',
  rabbit: 'rabbit', hare: 'hare', sheep: 'sheep', boar: 'boar', cougar: 'cougar', turkey: 'turkey', duck: 'duck', snake: 'rattlesnake',
  tiger: 'tiger', jaguar: 'jaguar', monkey: 'monkey', panther: 'black panther', panda: 'giant panda', crocodile: 'crocodile', mountainGoat: 'mountain goat',
  songbird: 'bird', starling: 'starling', crow: 'crow', gull: 'gull', hawk: 'hawk',
  lion: 'lion', hyena: 'hyena', elephant: 'elephant', hippo: 'hippo', camel: 'camel', scorpion: 'scorpion', python: 'python', bat: 'bat', eagle: 'eagle',
};
const ATTACKERS = { wolf: 'a wolf', grizzly: 'a grizzly bear', blackBear: 'a black bear', cougar: 'a cougar', moose: 'a moose', boar: 'a wild boar', elk: 'a bull elk', deer: 'a buck', bison: 'a bison', snake: 'a rattlesnake', tiger: 'a tiger', jaguar: 'a jaguar', panther: 'a black panther', crocodile: 'a crocodile', panda: 'a giant panda', mountainGoat: 'a mountain goat', lion: 'a lion', hyena: 'a hyena', elephant: 'an elephant', hippo: 'a hippo', camel: 'a camel', scorpion: 'a scorpion', python: 'a python' };
const AXES = { axe: 1, steelAxe: 2, forgedAxe: 3 };
const PICKS = { pickaxe: 1, steelPickaxe: 1.6, forgedPickaxe: 2.2, tuskPickaxe: 3 };
const SPEARS = new Set(['spear', 'steelSpear', 'forgedSpear']);
const SWORDS = new Set(['sword', 'fangSword', 'oldSword']);
const BOWS = new Set(['bow', 'antlerBow']);
// (Torches: the plain one, and the coal torch: brighter, further, the one for the caves.)
const TORCHES = new Set(['torch', 'coalTorch']);
// What a horse will come to you for, and eat.
const HORSE_FOOD = { apple: 25, carrot: 25, wheat: 20, corn: 20, berries: 10 };
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const UP = new Vector3(0, 1, 0);
// How far into a creature each goes (its point: along +z from its middle), and how deep it wounds.
const SHOTS = { spear: { tip: 1.16, bury: 0.3 }, arrow: { tip: 0.42, bury: 0.16, sharp: 1 }, bolt: { tip: 0.27, bury: 0.14, sharp: 2 } };
const LIGHTERS = new Set(['flintSteel', 'fineFlintSteel']);
const VEG = ['berries', 'mushroom', 'apple'];
const MEATS = ['rawMeat', 'cookedMeat', 'rawFowl', 'rawFish', 'cookedFish'];
// How long things take: meat on the fire a minute; ore in the furnace half
// a minute; meat on the drying rack three; a waterskin coming to the boil.
const TIMES = { cook: 60, smelt: 30, dry: 180, boil: 20, stew: 60, tan: 240, char: 20, steel: 45, smoke: 150 };
// What's left in the chests in the ruins: [id, least, most, chance] (in a
// chest up the tower, the better things more likely).
// (A steady number 0..1 from a whole number: the old maps' marks.)
const hashOf = (n) => ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
const RUIN_LOOT = [
  ['arrow', 4, 10, 0.4], ['bandage', 2, 3, 0.35], ['rope', 1, 2, 0.3], ['coal', 2, 5, 0.35], ['ironBar', 1, 3, 0.35], ['flint', 2, 3, 0.3],
  ['jerky', 2, 4, 0.35], ['torch', 2, 3, 0.3], ['seedWheat', 2, 4, 0.15], ['seedCarrot', 2, 4, 0.15], ['crystal', 1, 2, 0.15],
  ['goldBar', 1, 2, 0.15], ['steelBar', 1, 2, 0.12], ['bolt', 4, 8, 0.1], ['coalTorch', 2, 3, 0.15], ['smokedMeat', 2, 3, 0.15],
];
const RUIN_RARE = [['oldMap', 0.4, 0.5], ['oldSword', 0.06, 0.25], ['forgedPickaxe', 0.04, 0.1], ['steelArmour', 0.02, 0.08]];
// What a ripe crop gives.
const HARVEST = { wheat: [['wheat', 3], ['seedWheat', 2]], corn: [['corn', 2], ['seedCorn', 2]], potato: [['potato', 4], ['seedPotato', 1]], carrot: [['carrot', 3], ['seedCarrot', 2]] };
// Past this much in your pack (kg) you slow down; past twice it, you can't run.
const LOAD = 55;

/** What you start with (for testing: the makings of most things; Z has the rest). */
export const TEST_KIT = [['axe', 1], ['spear', 1], ['flintSteel', 1], ['bow', 1], ['arrow', 10], ['log', 3], ['vine', 10], ['campfire', 1], ['cookedMeat', 10]];

/**
 * The game of staying alive, on foot: your pack (the hotbar), your health,
 * hunger, thirst, warmth and energy, what you can do with what's in front
 * of you, crafting, building, felling, mining, hunting, fishing, and the
 * world remembering it all.
 *
 * Keys (walking): click to use what's in your hand (chop, mine, stab, eat,
 * light a fire, put meat on it, set something down; hold with a bow to draw
 * it), right-click to throw a spear (or the same as Q otherwise), Q to pick
 * up, pick fruit, drink or fill a waterskin, butcher, open a chest, open a
 * gate, sleep, board a raft, take what's cooked; Shift+Q to take something
 * you built back down; R to drop one (Shift+R the stack), E for what you carry, Tab to craft, Z
 * for every item (testing), C / Ctrl to crouch.
 */
export class Game {
  /**
   * @param o { scene, camera, controls, chunks, trees, rocks, mushrooms, fish,
   *            torches, wildlife, sound, hudRoot, config, generator(),
   *            waterAt(x, z), groundAt(x, z, fromY), solidHit(origin, dir,
   *            reach), ignite(x, y, z), sleep() (on to the morning) }
   */
  constructor(o) {
    Object.assign(this, o);
    this.inventory = new Inventory(15, 9); // (nine slots; six more with a backpack)
    // (A quiver: three times as many arrows or bolts to a slot.)
    this.wildlife.makeBags = () => new Inventory(8); // (a horse's saddlebags, brought back from a save)
    this.inventory.stackBonus = (id) => (QUIVERED.has(id) && this.inventory.slots.some((s) => s?.id === 'quiver') ? 3 : 1);
    this.progress = new Set(); // what's opened tiers of the crafting tree (see unlocked)
    this.treeFinds = new TreeFinds(this.scene, this.trees); // (birds' nests and wild bees' nests up in the trees)
    this.record = new Progress(); // (your skills, and what you've achieved, this life)
    this.survival = new Survival();
    this.hud = new Hud(o.hudRoot);
    Object.defineProperty(this.hud, 'spawners', { get: () => this.mode === 'testing' }); // (the animal spawners: for testing only)
    this.items = new GroundItems(o.scene, o.config);
    this.structures = new Structures(o.scene, (id) => this.items.model(id));
    this.structures.underground = (x, y, z) => y < this.generator().getHeight(x, z) - 3; // (a fire in a cave: see Structures.update)
    this.structures.onDone = (s, out) => {
      const d = Math.hypot(s.x - this.camera.position.x, s.z - this.camera.position.z);
      if (d < 30) this.hotbar?.flash(`${ITEMS[out.id].name} ready at the ${ITEMS[s.type].name.toLowerCase()}`);
    };
    this.felling = new Felling(o.scene, o.trees, this.items);
    this.flying = []; // spears and arrows in flight: { kind, mesh, pos, vel, stack, life }
    this.ghosts = []; // (online: the others' in flight, only to be seen: see ghostShot)
    this.harvested = new Map(); // tree key -> time picked (the fruit comes again after a while)
    this.time = 0;
    this.ruinChests = new Set(); // (the ruins' chests set out already: see ruinChest)
    this.ruinsSeen = new Set(); // (the ruins you've been to)
    this.explored = new Set(); // ("cx,cz": the chunks you've been near, the 5 x 5 round you: all the survival map shows)
    // The Lost Keep: its gate opened (all the trophies set in its altar), its heart reached, what the old maps have told of it.
    this.keep = { open: false, won: false, clues: 0, mark: null };
    this.waypoint = null; // (where an old map showed ruins: { x, z, key })
    this.cooldown = 0;
    this.pending = []; // blows landing a moment after the swing: { time, fn }
    this.lastHeat = { wait: 0, heat: 0, seasonality: 0 };
    this.dirty = false;
    this.saveWait = 10;
    this.seed = null;
    this.mode = 'testing'; // or 'creative' or 'survival' (see StartMenu)
    this.saveKey = null; // the world's save (none for a testing world)
    this.spawn = null;
    this.drawing = null; // a bow being drawn: { since }
    this.line = null; // a fishing line out
    this.riding = null; // the raft you're on
    this.mount = null; // the horse you're on
    this.sleeping = null;
    this.snareWait = 1;
    this.age = 0; // (game days this life has lasted: see passDays)
    this.online = () => false; // (playing online? set by main)
    this.onDeath = null; // (survival: told first, before the death screen; see #die)
    this.onLeave = null; // (the death screen's way back to the menu)
    this.onNewLife = null; // (online: a new life starts at the world's start)
    this.clock = null; // (the world's time of day and season, to save and restore: set by main)
    this.structures.onChange = () => (this.dirty = true);
    this.#heldModel();
    this.#bind();
  }

  get walking() {
    return this.controls.mode === 'walk';
  }

  /** Starts you afresh: full health, and (but in survival) the test kit. */
  newLife() {
    this.age = 0;
    this.record.reset();
    this.dead = false;
    this.survival.reset();
    this.inventory.clear();
    if (this.mode !== 'survival') for (const [id, n] of TEST_KIT) this.inventory.add(Inventory.stack(id, n));
    this.hud.alive();
    this.controls.frozen = false;
  }

  // --- The world remembering what you've done ------------------------------------

  /**
   * Starts on a world: `key` names its save (see StartMenu), or null for a
   * world that's never saved (testing): fresh each time.
   */
  loadWorld(seed, key = this.saveKey ?? null) {
    this.seed = seed;
    this.saveKey = key;
    this.items.clear();
    this.felling.clear();
    this.trees.removed.clear();
    this.rocks?.removed.clear();
    this.mushrooms?.taken.clear();
    this.harvested.clear();
    this.pickedAt?.clear();
    for (const v of seasonUniforms.uPicked.value) v.set(1e9, 1e9);
    this.#getOff();
    let saved = null;
    try {
      saved = key ? JSON.parse(localStorage.getItem(`facet-lands:survival:${key}`) || 'null') : null;
    } catch {
      saved = null;
    }
    for (const k of saved?.taken ?? []) this.items.taken.add(k);
    for (const k of saved?.felled ?? []) this.trees.removed.add(k);
    for (const k of saved?.broken ?? []) this.rocks?.removed.add(k);
    this.treeFinds.load(saved?.finds);
    this.worldDays = saved?.worldDays ?? 0;
    for (const k of saved?.mushrooms ?? []) this.mushrooms?.taken.add(k);
    this.felling.loadStumps(saved?.stumps);
    this.loadBurns?.(saved?.burns ?? []);
    this.loadCut?.(saved?.cut ?? []);
    if (this.shrooms) {
      this.shrooms.cut.clear();
      for (const k of saved?.shrooms ?? []) this.shrooms.cut.add(k);
    }
    this.ruinChests = new Set(saved?.ruins?.chests ?? []);
    this.ruinsSeen = new Set(saved?.ruins?.seen ?? []);
    this.explored = new Set(saved?.explored ?? []);
    this.keep = { open: false, won: false, clues: 0, mark: null, ...(saved?.keep ?? {}) };
    this.onKeep?.(this.keep.open);
    this.waypoint = saved?.ruins?.waypoint ?? null;
    this.structures.load(saved?.structures ?? []);
    this.wildlife.loadTame(saved?.tame ?? []);
    this.wildlife.loadBosses(saved?.bosses ?? {});
    // How far up the crafting tree you've come (in a world saved before
    // there was one: worked out from what's in it).
    this.progress = new Set(saved?.progress ?? []);
    if (saved?.clock) this.clock?.set(saved.clock);
    if (!saved?.progress && saved) {
      const has = (id) => JSON.stringify(saved).includes(`"${id}"`);
      if (has('campfire') || has('furnace')) this.progress.add('campfire');
      if (has('ironBar') || has('anvil') || has('steelAxe') || has('steelBar')) this.progress.add('ironBar');
      if (has('steelBar') || has('forgedAxe') || has('forgedPickaxe') || has('forgedSpear') || has('crossbow') || has('sword') || has('steelArmour')) this.progress.add('steelBar');
    }
    // You, as you were (or afresh).
    if (saved?.player) {
      this.inventory.load(saved.player.inventory);
      this.survival.reset();
      this.survival.load(saved.player.stats);
      this.dead = false;
      this.spawn = saved.player.spawn ?? null;
      this.age = saved.player.age ?? 0;
      this.record.load(saved.player.record);
      this.hud.alive();
      this.controls.frozen = false;
    } else {
      this.spawn = null;
      this.newLife();
    }
    this.dirty = false;
  }

  save() {
    if (this.seed === null || !this.saveKey) return; // (a testing world is never saved)
    const data = {
      structures: this.structures.toJSON(), taken: [...this.items.taken], felled: [...this.trees.removed], broken: [...(this.rocks?.removed ?? [])], finds: this.treeFinds.toJSON(), worldDays: +(this.worldDays ?? 0).toFixed(3), stumps: this.felling.stumpsJSON(),
      mushrooms: [...(this.mushrooms?.taken ?? [])],
      tame: this.wildlife.tameJSON(),
      bosses: this.wildlife.bossJSON(),
      clock: this.clock?.get() ?? null,
      progress: [...this.progress],
      burns: this.burnsJSON?.() ?? null,
      cut: this.cutJSON?.() ?? null,
      shrooms: this.shrooms ? [...this.shrooms.cut] : [],
      ruins: { chests: [...this.ruinChests], seen: [...this.ruinsSeen], waypoint: this.waypoint },
      explored: [...this.explored],
      keep: this.keep,
      player: this.survival.alive ? { inventory: this.inventory.toJSON(), stats: this.survival.toJSON(), record: this.record.toJSON(), spawn: this.spawn, age: Math.round(this.age * 1000) / 1000 } : null,
    };
    try {
      localStorage.setItem(`facet-lands:survival:${this.saveKey}`, JSON.stringify(data));
    } catch {
      // (No storage: the world just won't remember.)
    }
    this.dirty = false;
  }

  // --- Input -------------------------------------------------------------------------

  #bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!this.survival.alive) return;
        this.#menu(this.hud.toggleCraft(this.inventory));
        return;
      }
      if (e.code === 'KeyK' && this.survival.alive && this.mode === 'survival') {
        this.#menu(this.hud.toggleSkills(this.record));
        return;
      }
      if (e.code === 'KeyZ' && this.survival.alive) {
        this.#menu(this.hud.toggleCreative());
        return;
      }
      if (e.code === 'Escape' && this.hud.busy && this.survival.alive) {
        this.hud.closeAll();
        this.#menu(false);
        return;
      }
      if (!this.walking || !this.survival.alive || this.sleeping) return;
      // E: what you carry (and wear), to sort; or, with a chest open, shut it.
      if (e.code === 'KeyE' || e.code === 'KeyI') {
        if (this.hud.chest) {
          this.hud.closeAll();
          this.#menu(false);
        } else if (!this.hud.busy || !this.hud.el('.inv-ui').hidden) this.#menu(this.hud.toggleInventory(this.inventory));
      }
      // Q: pick up, or use what you're pointing at; R: drop what's in your hand.
      if (e.code === 'KeyQ' && !this.hud.busy) this.interact(null, e.shiftKey);
      if (e.code === 'KeyR' && !this.hud.busy) this.drop(e.shiftKey);
      if (e.code === 'KeyB') {
        if (this.hud.chest) (this.hud.closeAll(), this.#menu(false));
        else if (!this.hud.busy) this.#openBags();
      }
    });
    this.hud.onCraft = (id) => this.craft(id);
    // The inventory (E): stacks moved and sorted, things put on and taken off.
    this.hud.onInvMove = (a, b) => {
      if (this.inventory.move(a, b)) this.sound?.call('pickup', 0, 0.25);
      this.hud.renderInventory();
    };
    this.hud.onInvSort = () => {
      this.inventory.sort(['Tools', 'Worn', 'Food', 'Materials', 'Farming', 'Building', 'Trophies', 'Spawners']);
      this.hud.renderInventory();
    };
    this.hud.onInvWear = (i) => {
      this.#putOn(i);
      this.hud.renderInventory();
    };
    this.hud.onInvTakeOff = (slot) => {
      this.#takeOff(slot);
      this.hud.renderInventory();
    };
    this.hud.onSkills = () => this.survival.alive && this.mode === 'survival' && this.#menu(this.hud.toggleSkills(this.record));
    this.hud.onTake = (id) => {
      const left = this.inventory.add(Inventory.stack(id, stackOf(id)), this.hotbar?.index);
      this.hotbar?.flash(left ? 'No room' : `Took ${ITEMS[id].name}`);
    };
    this.hud.onChestMove = (side, i) => {
      const { chest, pack } = this.hud.chest ?? {};
      if (!chest) return;
      const from = side === 'chest' ? chest : pack, to = side === 'chest' ? pack : chest;
      const s = from.slots[i];
      if (!s) return;
      const left = to.add({ ...s });
      if (left === s.count) return this.hotbar?.flash('No room');
      if (left) s.count = left;
      else from.slots[i] = null;
      from.changed();
      this.dirty = true;
      this.hud.renderChest();
    };
    this.hud.onRespawn = () => this.respawn();
    this.hud.onLeave = () => this.onLeave?.();
    // (The crafting tree: which tiers you've opened. See #learn.)
    this.hud.unlocked = (tier) => this.unlocked(tier);
    this.inventory.onChange(() => {
      // (A backpack on your back: six more slots. Taken off, what was in them
      // goes into the first nine where there's room; the rest falls out on the ground.)
      const inv = this.inventory, open = inv.back?.id === 'backpack' ? 15 : 9;
      if (open !== inv.open) {
        inv.open = open;
        if (open === 9) {
          const p = this.camera.position;
          for (let k = 9; k < inv.slots.length; k++) {
            if (!inv.slots[k]) continue;
            const free = inv.slots.slice(0, 9).findIndex((x) => !x);
            if (free >= 0) inv.slots[free] = inv.slots[k];
            else this.items.drop(inv.slots[k], p.x + (Math.random() - 0.5), p.y - 1.2, p.z + (Math.random() - 0.5));
            inv.slots[k] = null;
          }
          if (this.hotbar && this.hotbar.index >= 9) this.hotbar.select(0, true);
        }
        this.hotbar?.render();
      }
      for (const id of ['ironBar', 'steelBar']) if (this.inventory.count(id)) this.#learn(id);
      if (this.inventory.slots.some((s) => s && ITEMS[s.id]?.group === 'Trophies')) this.#learn('trophy');
      if (!this.hud.el('.craft').hidden) this.hud.renderCraft(this.inventory);
      this.hud.renderChest();
      this.hud.renderInventory();
      this.dirty = true;
    });
  }

  /**
   * Whether a tier of the crafting tree is open to you: the first always,
   * each of the others once you've done what opens it (see TIERS: set down
   * a campfire, made an iron bar, a steel one). In creative or testing,
   * all of them.
   */
  unlocked(tier) {
    return !tier.unlock || this.mode === 'creative' || this.mode === 'testing' || this.progress.has(tier.unlock);
  }

  // Something done that may open a tier of the crafting tree (`what`: a
  // thing set down, or made): if it does, said so.
  #learn(what) {
    if (this.progress.has(what)) return;
    this.progress.add(what);
    this.dirty = true;
    const tier = TIERS.find((t) => t.unlock === what);
    if (tier && this.mode === 'survival') {
      this.hotbar?.flash(`New things to make: the ${tier.name} tier (Tab)`);
      this.sound?.call('craft', 0, 0.6);
    }
    if (!this.hud.el('.craft').hidden) this.hud.renderCraft(this.inventory);
  }

  // A menu opened (let go of the mouse to click in it) or closed.
  #menu(open) {
    this.controls.frozen = open || !this.survival.alive;
    if (open && document.pointerLockElement) document.exitPointerLock();
  }

  /** Where the crosshair points (or the click, unlocked): a ray from the eye. */
  #ray(ray) {
    return ray ?? { origin: this.camera.position.clone(), direction: this.camera.getWorldDirection(new Vector3()) };
  }

  /** What's in front of you that Q would do something with. */
  #target(ray, down = false) {
    const { origin, direction } = this.#ray(ray);
    const reach = REACH;
    const found = [];
    const held = this.inventory.slots[this.hotbar?.index ?? 0];
    const item = this.items.pick(origin, direction, reach);
    if (item && ITEMS[item.id]?.wild) found.push({ kind: 'vein', distance: item.distance, item, text: `${ITEMS[item.id].name}: cut it with a sickle` });
    else if (item?.item.node) found.push({ kind: 'vein', distance: item.distance, item, text: `${ITEMS[item.id].name} in the rock: break it out with a pickaxe` });
    else if (item) found.push({ kind: 'item', distance: item.distance, item, text: `Pick up ${ITEMS[item.id].name.toLowerCase()}` });
    const carcass = this.wildlife.aim(origin, direction, reach, true);
    if (carcass && !carcass.animal.alive) found.push({ kind: 'carcass', distance: carcass.distance, animal: carcass.animal, text: `Butcher the ${NAMES[carcass.animal.kind] ?? 'animal'}` });
    // A tame sheep: to shear, or to feed.
    const beast = carcass?.animal.alive ? carcass.animal : null;
    if (beast?.kind === 'sheep' && beast.tame) {
      const regrown = !beast.sheared || this.wildlife.time - beast.sheared > 480;
      const text = held?.id === 'shears' ? (regrown && !beast.young ? 'Shear the sheep' : 'Its wool is still growing back') : held?.id === 'wheat' ? 'Feed the sheep (two fed: a lamb)' : 'Your sheep (shears to shear it, wheat to feed it)';
      found.push({ kind: 'sheep', distance: carcass.distance, animal: beast, text });
    }
    // A tame horse: to feed, saddle, lead, or ride.
    if (beast?.kind === 'horse' && beast.tame) {
      const needs = [beast.hunger < 30 ? 'hungry' : '', beast.thirst < 30 ? 'thirsty' : ''].filter(Boolean).join(' and ');
      const text = HORSE_FOOD[held?.id] ? 'Feed the horse'
        : held?.id === 'saddle' || held?.id === 'greatSaddle' ? (beast.saddled ? 'It has a saddle' : beast.young ? 'Too young for a saddle' : 'Saddle the horse')
        : held?.id === 'saddlebags' && !beast.bags && !beast.young ? 'Put the saddlebags on'
        : beast.saddled ? 'Ride (Shift+Q: lead it)' : beast.led ? 'Let it go' : 'Lead it (a saddle to ride it)';
      found.push({ kind: 'horse', distance: carcass.distance, animal: beast, text: needs ? `${text} · ${needs}` : text });
    }
    const tree = this.trees.pick(origin, direction, reach);
    // (Ripe from midsummer: berries till the fourth day of autumn, apples till the ninth.)
    const year = seasonUniforms.uSeasonTime.value, days = this.config.daysPerSeason ?? 12;
    const ripe = tree && FRUIT[tree.type] && year >= 1.45 && year < 2 + (FRUIT[tree.type] === 'apple' ? 9 : 4) / days;
    const picked = tree && this.harvested.has(tree.key) && this.time - this.harvested.get(tree.key) < 900;
    if (tree && FRUIT[tree.type] && (ripe || !tree.bush)) {
      found.push({ kind: 'fruit', distance: tree.distance, tree, ripe, picked, text: picked ? 'Picked clean' : ripe ? `Pick ${FRUIT[tree.type] === 'apple' ? 'apples' : 'berries'}` : year > 1 && year < 1.45 ? 'Not ripe yet' : 'No fruit this time of year' });
    } else if (tree?.bush && !CACTI.has(tree.type)) {
      // (Any bush: pull a plant vine or two from it, then leave it be a while.)
      const pulled = this.vined?.has(tree.key) && this.time - this.vined.get(tree.key) < 600;
      found.push({ kind: 'vine', distance: tree.distance, tree, pulled, text: pulled ? 'No good vines left on it' : 'Pull plant vines' });
    }
    const tf = this.treeFinds.pick(origin, direction, reach + 2.5);
    if (tf) {
      const f = tf.find, empty = this.treeFinds.empty(f, this.worldDays ?? 0), season = seasonUniforms.uSeasonTime.value;
      const torch = held?.id === 'torch' || held?.id === 'coalTorch';
      const text = f.kind === 'nest'
        ? (empty || season <= 0.25 || season >= 1.6 ? 'A bird\'s nest: empty' : 'A bird\'s nest: take the eggs')
        : empty ? 'A wild bees\' nest: no honey left in it yet' : torch ? 'A wild bees\' nest: smoke them quiet and take the honey' : 'A wild bees\' nest: take the honey (they\'ll sting: a lit torch in hand smokes them quiet)';
      found.push({ kind: 'treeFind', distance: tf.distance, find: f, empty, text });
    }
    const mushroom = this.mushrooms?.pick(origin, direction, reach);
    if (mushroom) found.push({ kind: 'mushroom', distance: mushroom.distance, mushroom, text: 'Pick the mushroom' });
    const built = this.structures.pick(origin, direction, reach);
    if (built) {
      const s = built.structure;
      found.push({ kind: 'structure', distance: built.distance, structure: s, text: down ? `Take down the ${ITEMS[s.type].name.toLowerCase()}` : this.#structureText(s, held) });
    }
    const water = this.#waterAlong(origin, direction, reach);
    if (water) {
      const fill = held?.id === 'waterskin';
      found.push({ kind: 'water', distance: water.distance, ...water, text: water.salty && held?.id === 'pot' ? 'Fill the pot with sea water (boil it for salt)' : water.salty ? 'Sea water: too salty to drink' : fill ? `Fill the waterskin${water.clean ? '' : ' (still water: boil it)'}` : `Drink${water.clean ? '' : ' (still water: it may make you ill)'}` });
    }
    // The ground itself: salt to scrape up on the salt flats, sand to scoop up on a beach or in the desert.
    if (!found.length) {
      const hit = this.solidHit?.(origin, direction, reach);
      if (hit && !hit.cave) {
        const what = this.#groundStuff(hit.point.x, hit.point.z);
        if (what) found.push({ kind: 'scoop', distance: hit.point.distanceTo(origin), id: what, text: what === 'salt' ? 'Scrape up salt' : 'Scoop up sand' });
      }
    }
    found.sort((a, b) => a.distance - b.distance);
    return found[0] ?? null;
  }

  #structureText(s, held) {
    const done = s.jobs?.some((j) => j.done);
    if (done) return `Take what's ready`;
    switch (s.type) {
      case 'chest': return s.ruinKey === 'keep:heart' ? 'The heart of the Lost Keep: open it' : 'Open the chest';
      case 'keepAltar': {
        const n = s.offered.length;
        return n >= RELICS.length ? 'The altar of the Lost Keep: every trophy set' : `The altar of the Lost Keep: ${n} of ${RELICS.length} trophies set (Q: set those you carry)`;
      }
      case 'cellar': return 'Open the root cellar';
      case 'shelf': return 'Open the shelves';
      case 'chair': return 'Sit and rest';
      case 'repairBench': return held && ITEMS[held.id]?.durability ? `Mend the ${ITEMS[held.id].name.toLowerCase()}` : 'The repair bench: Q with a worn tool in hand';
      case 'trophyRack': return s.trophy ? `${ITEMS[s.trophy].name} (Q: take it down)` : 'Hang a great beast\'s trophy here';
      case 'waterFilter': return 'Click with a waterskin of still water to filter it clean';
      case 'leanTo': return 'A lean-to: out of the rain under it (sleep under it in a bedroll)';
      case 'coop': {
        const birds = this.#coopBirds(s);
        const eggs = Math.floor(s.eggs ?? 0), feathers = Math.floor(s.feathers ?? 0);
        return eggs || feathers ? `Collect ${[eggs ? `${eggs} egg${eggs > 1 ? 's' : ''}` : '', feathers ? `${feathers} feather${feathers > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')}` : birds ? `${birds} bird${birds > 1 ? 's' : ''} living here: nothing laid yet` : 'No birds: lure tame turkeys or ducks here (wheat, seeds or corn in hand)';
      }
      case 'fishTrap': return s.caught ? `Take the fish (${s.caught})` : (this.winter ?? 0) > 0.7 ? 'Iced in: nothing swims into it' : 'Set, and waiting (Shift+Q to take it up)';
      case 'smokingRack':
        return s.jobs.length ? `Smoking: ${s.jobs.map((j) => `${Math.round(100 - (j.left / j.total) * 100)}%`).join(', ')}${s.smoking ? '' : ' (no fire under it)'}` : 'Hang raw meat or fish in it (click with it), over a burning campfire';
      case 'gate':
      case 'fenceGate':
      case 'logDoor':
      case 'plankDoor':
      case 'stoneDoor':
      case 'cutDoor': return s.open ? 'Shut the gate' : 'Open the gate';
      case 'logDoor':
      case 'plankDoor':
      case 'stoneDoor':
      case 'cutDoor': return s.open ? 'Shut the door' : 'Open the door';
      case 'plot': {
        if (!s.crop) return 'Dug and ready: sow seeds in it (click with them)';
        if (s.growth >= 1) return `Harvest the ${s.crop === 'potato' ? 'potatoes' : s.crop === 'carrot' ? 'carrots' : s.crop}`;
        return `${s.crop[0].toUpperCase() + s.crop.slice(1)}: ${Math.round(s.growth * 100)}% grown${s.watered > 0 ? ' (watered)' : ' (water it to hurry it)'}${s.fed > 0 ? ' (fed with guano)' : ''}`;
      }
      case 'rope': return 'Climb the rope';
      case 'anvil': return 'Forge at the anvil';
      case 'grindstone': return 'Click it with a worn blade to grind it keen';
      case 'tanningRack': return s.jobs.length ? `Tanning: ${Math.round(100 - (s.jobs[0].left / s.jobs[0].total) * 100)}%` : 'Stretch a raw hide or fur on it (click with it)';
      case 'bed':
      case 'bedroll':
      case 'strawBed':
      case 'fancyBed': return 'Sleep';
      case 'raft': return 'Climb aboard';
      case 'snare': return s.caught ? 'Take the rabbit' : 'Set, and waiting (Shift+Q to take it up)';
      case 'campfire':
      case 'furnace': {
        const working = s.jobs.length ? ` · ${s.jobs.map((j) => `${ITEMS[j.stack.id].name.toLowerCase()} ${Math.round(100 - (j.left / j.total) * 100)}%`).join(', ')}` : '';
        return s.lit ? `Burning${working}` : `Cold${working}: light it with flint and steel`;
      }
      case 'dryingRack':
        return s.jobs.length ? `Drying: ${s.jobs.map((j) => `${Math.round(100 - (j.left / j.total) * 100)}%`).join(', ')}` : 'Hang raw meat or fish on it (click with it)';
      default: return `Shift+Q: take down the ${ITEMS[s.type].name.toLowerCase()}`;
    }
  }

  // Sitting in a hot spring (a hot pool: see Rivers), in it to the waist or more.
  #inHotSpring(cam) {
    const w = this.waterAt?.(cam.x, cam.z);
    return !!w?.hot && cam.y - this.controls.eyeHeight < w.level - 0.3;
  }

  // What the bare ground at (x, z) gives by the handful: 'salt' on the salt flats, 'sand' on a beach or the desert's sand, else null.
  #groundStuff(x, z) {
    const g = this.generator();
    const w = g.getBiomeWeights(x, z, {});
    if ((w.saltFlat ?? 0) > 0.45) return 'salt';
    const h = g.getHeight(x, z), sea = this.config.seaLevel;
    if ((w.desert ?? 0) > 0.55 || ((g.getOceanness?.(x, z) ?? 0) > 0.35 && h < sea + 2.5 && h > sea - 0.5)) return 'sand';
    return null;
  }

  // The water a ray meets (within reach), if any: { distance, salty, clean (running water) }.
  #waterAlong(origin, direction, reach) {
    const kind = (w, x, z) => ({ salty: !!w.lake && this.generator().getOceanness(x, z) > 0.5, clean: !w.lake && !w.pond });
    for (let t = 0.3; t <= reach + 0.8; t += 0.25) {
      const x = origin.x + direction.x * t, y = origin.y + direction.y * t, z = origin.z + direction.z * t;
      const w = this.waterAt(x, z);
      if (w && y < w.level + 0.05) return { distance: t, ...kind(w, x, z) };
      const g = this.groundAt(x, z);
      if (Number.isFinite(g) && y < g) return null;
    }
    // (Standing in it, looking down at it.)
    const here = this.waterAt(origin.x, origin.z);
    if (here && direction.y < -0.5 && origin.y - here.level < 2.2) return { distance: 1, ...kind(here, origin.x, origin.z) };
    return null;
  }

  #give(id, n = 1, at = null) {
    const left = this.inventory.add(Inventory.stack(id, n), this.hotbar?.index);
    if (left) {
      const p = at ?? this.camera.position;
      this.items.drop(Inventory.stack(id, left), p.x, p.y - (at ? -0.5 : 1), p.z);
    }
    return n - left;
  }

  /** Q: picks up, picks fruit, drinks, butchers, and uses what you've built (Shift: takes it down). */
  interact(ray, down = false) {
    if (this.mount) return this.#dismount(true);
    if (this.riding) return this.#getOff(true);
    if (this.climbing) return this.#letGo(true);
    const t = this.#target(ray, down);
    if (!t) return this.hotbar?.flash('Nothing to pick up here');
    if (t.kind === 'vein') return this.hotbar?.flash(t.text);
    if (t.kind === 'item') {
      const stack = this.items.take(t.item);
      const left = this.inventory.add(stack, this.hotbar?.index);
      if (left) {
        if (left === stack.count) {
          this.items.untake(t.item);
          return this.hotbar?.flash('Your hands are full');
        }
        this.items.drop({ ...stack, count: left }, this.camera.position.x, this.camera.position.y - 1, this.camera.position.z);
      }
      this.sound?.call('pickup', 0, 0.5);
      this.dirty = true;
      return this.hotbar?.flash(`${ITEMS[stack.id].name}${stack.count > 1 ? ` ×${stack.count}` : ''}`);
    }
    if (t.kind === 'carcass') {
      const got = this.wildlife.butcher(t.animal);
      if (!got) return;
      const lines = [];
      for (const st of got.stuck ?? []) this.#give(st.id, st.count ?? 1, t.animal) && lines.push(ITEMS[st.id].name);
      for (const [id, n] of Object.entries(got)) {
        this.#give(id, n, t.animal);
        lines.push(`${ITEMS[id].name} ×${n}`);
      }
      this.sound?.call('chop', 0, 0.4);
      return this.hotbar?.flash(lines.join(', '));
    }
    if (t.kind === 'sheep') {
      const a = t.animal, i = this.hotbar.index, held = this.inventory.slots[i];
      if (held?.id === 'shears') {
        if (a.young || (a.sheared && this.wildlife.time - a.sheared <= 480)) return this.hotbar?.flash(t.text);
        this.wildlife.shear(a);
        this.inventory.wear(i, 1);
        this.#give('wool', 2 + Math.floor(Math.random() * 2), a);
        this.sound?.call('shear', 0, 0.5);
        this.sound?.call('baa', 0, 0.4);
        this.dirty = true;
        return this.hotbar?.flash('Sheared: wool');
      }
      if (held?.id === 'wheat') {
        this.inventory.remove('wheat', 1);
        const lamb = this.wildlife.feed(a);
        this.sound?.call('baa', 0, 0.4);
        this.dirty = true;
        return this.hotbar?.flash(lamb ? 'A lamb!' : 'Fed');
      }
      return this.hotbar?.flash(t.text);
    }
    if (t.kind === 'horse') {
      const a = t.animal, held = this.inventory.slots[this.hotbar.index];
      if (HORSE_FOOD[held?.id]) {
        this.inventory.remove(held.id, 1);
        a.hunger = Math.min(100, (a.hunger ?? 50) + HORSE_FOOD[held.id]);
        this.sound?.call('eat', 0, 0.4);
        this.dirty = true;
        return this.hotbar?.flash(a.hunger > 90 ? 'Fed: it has had its fill' : 'Fed');
      }
      if ((held?.id === 'saddle' || held?.id === 'greatSaddle') && !a.saddled && !a.young) {
        this.inventory.remove(held.id, 1);
        a.saddled = held.id === 'greatSaddle' ? 'great' : true;
        this.dirty = true;
        return this.hotbar?.flash('Saddled: Q to ride');
      }
      if (held?.id === 'saddlebags' && !a.bags && !a.young) {
        this.inventory.remove('saddlebags', 1);
        a.bags = new Inventory(8);
        this.dirty = true;
        return this.hotbar?.flash('Saddlebags on: B by your horse (or riding it) to open them');
      }
      if (a.saddled && !down) return this.#ride(a);
      a.led = !a.led;
      return this.hotbar?.flash(a.led ? 'Leading the horse' : 'You let it go: it will stay about here');
    }
    if (t.kind === 'fruit') {
      if (!t.ripe || t.picked) return this.hotbar?.flash(t.text);
      const id = FRUIT[t.tree.type];
      const n = id === 'apple' ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3);
      this.#give(id, n);
      this.harvested.set(t.tree.key, this.time);
      (this.pickedAt ??= new Map()).set(t.tree.key, { x: t.tree.x, z: t.tree.z });
      this.sound?.call('pickup', 0, 0.5);
      return this.hotbar?.flash(`${ITEMS[id].name} ×${n}`);
    }
    if (t.kind === 'vine') {
      if (t.pulled) return this.hotbar?.flash(t.text);
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      this.#give('vine', n);
      (this.vined ??= new Map()).set(t.tree.key, this.time);
      this.sound?.call('rustle', 0, 0.5);
      return this.hotbar?.flash(`${ITEMS.vine.name} ×${n}`);
    }
    if (t.kind === 'mushroom') {
      this.mushrooms.take(t.mushroom);
      this.#give('mushroom', 1);
      this.dirty = true;
      this.sound?.call('pickup', 0, 0.4);
      return this.hotbar?.flash('Mushroom');
    }
    if (t.kind === 'structure') return this.#useStructure(t.structure, down);
    if (t.kind === 'treeFind') {
      const f = t.find, season = seasonUniforms.uSeasonTime.value;
      if (t.empty || (f.kind === 'nest' && (season <= 0.25 || season >= 1.6))) return this.hotbar?.flash(t.text);
      this.treeFinds.take(f, this.worldDays ?? 0);
      this.dirty = true;
      if (f.kind === 'nest') {
        const n = 2 + Math.floor(Math.random() * 3);
        this.#give('rawEgg', n);
        this.sound?.call('pickup', 0, 0.4);
        return this.hotbar?.flash(`Eggs ×${n}`);
      }
      const held = this.inventory.slots[this.hotbar.index], torch = (held?.id === 'torch' || held?.id === 'coalTorch');
      const n = 2 + Math.floor(Math.random() * 3);
      this.#give('honey', n);
      this.sound?.call('flybuzz', 0, 0.8);
      if (!torch) {
        this.survival.hurt(6 + Math.random() * 6, 'bee stings');
        this.survival.hurtFlash = 1;
        return this.hotbar?.flash(`Honey ×${n}, and stung all over`);
      }
      return this.hotbar?.flash(`Honey ×${n}: the smoke kept them quiet`);
    }
    if (t.kind === 'scoop') {
      if (this.cooldown > 0) return;
      // (The salt flats: a crust of it, thick: far more than a pot of sea water gives.)
      const n = t.id === 'salt' ? 3 + Math.floor(Math.random() * 4) : 2;
      this.#give(t.id, n);
      this.cooldown = 0.8;
      this.#animate('chop', 0.4);
      this.sound?.call('dig', 0, 0.5);
      return this.hotbar?.flash(`${ITEMS[t.id].name} ×${n}`);
    }
    if (t.kind === 'water') {
      const i = this.hotbar.index, held = this.inventory.slots[i];
      if (held?.id === 'pot' && t.salty) {
        held.brine = true;
        this.inventory.changed();
        this.sound?.call('drink', 0, 0.4);
        return this.hotbar?.flash('A pot of sea water: boil it on a fire for salt');
      }
      if (t.salty) return this.hotbar?.flash(t.text);
      if (held?.id === 'waterskin') {
        held.water = ITEMS.waterskin.holds;
        held.clean = t.clean;
        this.inventory.changed();
        this.sound?.call('drink', 0, 0.4);
        return this.hotbar?.flash(t.clean ? 'Filled with running water' : 'Filled with still water: boil it on a fire first');
      }
      const sick = this.survival.consume({ thirst: 22, sick: t.clean ? 0.03 : 0.15 });
      this.sound?.call('drink', 0, 0.5);
      return this.hotbar?.flash(sick ? 'You drink... it tastes foul: you feel feverish' : 'You drink');
    }
  }

  #useStructure(s, down) {
    if (down && s.type === 'keepAltar') return this.hotbar?.flash('It is cut from the living rock: it will not move');
    if (down) {
      // Taking it back down.
      if (s.lit) return this.hotbar?.flash('Too hot to take down: let it burn out');
      if (s.contents && s.contents.slots.some(Boolean)) return this.hotbar?.flash('Empty it first');
      for (const st of this.structures.takeAll(s)) this.#give(st.id, st.count ?? 1, s);
      if (s.type === 'plot') {
        this.structures.remove(s);
        return this.hotbar?.flash('The plot filled in');
      }
      if (this.inventory.room(s.type) < 1) return this.hotbar?.flash('Your hands are full');
      this.inventory.add(Inventory.stack(s.type, 1));
      this.structures.remove(s);
      return this.hotbar?.flash(`${ITEMS[s.type].name} taken down`);
    }
    // What's done at it: cooked meat, bars, jerky, stew, a boiled waterskin.
    const done = this.structures.takeDone(s);
    if (done.length) {
      for (const st of done) {
        const left = this.inventory.add({ ...st }, this.hotbar.index);
        if (left) this.items.drop({ ...st, count: left }, s.x, s.y + 1, s.z);
      }
      this.sound?.call('pickup', 0, 0.5);
      return this.hotbar?.flash(done.map((st) => ITEMS[st.id].name).join(', '));
    }
    switch (s.type) {
      case 'keepAltar':
        return this.#offer(s);
      case 'chest':
        if (s.ruinKey?.startsWith('wreck:')) this.#achieve('wreck');
        this.sound?.call('creak', 0, 0.35);
        this.hud.openChest(s.contents, this.inventory);
        return this.#menu(true);
      case 'cellar':
        this.sound?.call('creak', 0, 0.4);
        this.hud.openChest(s.contents, this.inventory, 'Root cellar', 'Click to move a stack across · cool and dark: food in here never spoils · E or Esc to close');
        return this.#menu(true);
      case 'fishTrap': {
        if (!s.caught) return this.hotbar?.flash('Nothing in it yet');
        const n = s.caught;
        s.caught = 0;
        s.catchMesh.visible = false;
        this.#give('rawFish', n, s);
        this.dirty = true;
        this.sound?.call('splash', 0, 0.3);
        return this.hotbar?.flash(n > 1 ? `${n} fish from the trap` : 'A fish from the trap');
      }
      case 'gate':
      case 'fenceGate':
        this.structures.toggle(s);
        return this.sound?.call('creak', 0, 0.3);
      case 'plot': {
        const crop = this.structures.harvest(s);
        if (!crop) return this.hotbar?.flash(this.#structureText(s));
        this.#achieve('harvest');
        const got = HARVEST[crop].map(([id, n]) => (this.#give(id, n, s), `${ITEMS[id].name} ×${n}`));
        this.sound?.call('pickup', 0, 0.5);
        this.dirty = true;
        return this.hotbar?.flash(got.join(', '));
      }
      case 'rope':
        return this.#climb(s);
      case 'anvil':
        return this.#menu(this.hud.toggleCraft(this.inventory));
      case 'repairBench':
        return this.#repair();
      case 'shelf':
        this.sound?.call('wood', 0, 0.35);
        this.hud.openChest(s.contents, this.inventory, 'Shelves', 'Click to move a stack across · E or Esc to close');
        return this.#menu(true);
      case 'chair':
        // (Sitting a while: rested, a little.)
        if (this.time < (this.satUntil ?? 0)) return this.hotbar?.flash('You sit, resting');
        this.satUntil = this.time + 8;
        this.survival.energy = Math.min(100, this.survival.energy + 8);
        this.sound?.call('creak', 0, 0.3);
        return this.hotbar?.flash('You sit a while and rest');
      case 'trophyRack': {
        const i = this.hotbar.index, held = this.inventory.slots[i];
        if (s.trophy) {
          this.#give(s.trophy, 1, s);
          const was = s.trophy;
          s.trophy = null;
          this.structures.showTrophy(s);
          return this.hotbar?.flash(`${ITEMS[was].name} taken down`);
        }
        if (!held || ITEMS[held.id]?.group !== 'Trophies') return this.hotbar?.flash('Q with a great beast\'s trophy in hand to hang it up');
        s.trophy = held.id;
        this.inventory.take(i);
        this.structures.showTrophy(s);
        this.sound?.call('place', 0, 0.5);
        return this.hotbar?.flash(`${ITEMS[held.id].name} hung up for all to see`);
      }
      case 'coop': {
        const eggs = Math.floor(s.eggs ?? 0), feathers = Math.floor(s.feathers ?? 0);
        if (!eggs && !feathers) return this.hotbar?.flash(this.#structureText(s));
        if (eggs) this.#give('rawEgg', eggs, s);
        if (feathers) this.#give('feather', feathers, s);
        s.eggs -= eggs;
        s.feathers -= feathers;
        this.dirty = true;
        this.sound?.call('pickup', 0, 0.5);
        return this.hotbar?.flash([eggs ? `Eggs ×${eggs}` : '', feathers ? `feathers ×${feathers}` : ''].filter(Boolean).join(', '));
      }
      case 'bed':
      case 'bedroll':
      case 'strawBed':
      case 'fancyBed':
        return this.#sleep(s);
      case 'raft':
        return this.#board(s);
      case 'snare':
        if (!s.caught) return this.hotbar?.flash('Nothing yet');
        s.caught = false;
        s.catchMesh.visible = false;
        this.sound?.call('pickup', 0, 0.5);
        this.#give('rawMeat', 1);
        this.dirty = true;
        return this.hotbar?.flash('A rabbit: raw meat');
      default:
        return this.hotbar?.flash(this.#structureText(s));
    }
  }

  // --- Skills and achievements ------------------------------------------------------

  /** Points in a skill (see Progress): a word when it goes up a level. */
  skill(id, n) {
    if (this.mode !== 'survival' || !this.survival.alive) return;
    const up = this.record.add(id, n);
    if (!up) return;
    const sk = SKILLS.find((s) => s.id === id);
    this.hud.toast(`${sk.name}: level ${up}. ${sk.what}`);
    if (up >= 5) this.#achieve('skill5');
    if (up >= 10) this.#achieve('skill10');
    this.hud.renderSkills(this.record);
    this.dirty = true;
  }

  skillLevel(id) {
    return this.record.level(id);
  }

  #achieve(id) {
    if (this.mode !== 'survival') return;
    const a = this.record.achieve(id, this.age);
    if (!a) return;
    this.hud.toast(`★ Achievement: ${a.name}. ${a.what}`);
    this.sound?.call('craft', 0, 0.6);
    this.hud.renderSkills(this.record);
    this.dirty = true;
  }

  // Now and then: the achievements that come of how things stand (and points for creeping up on animals).
  #progressStep(dt, e) {
    if (this.mode !== 'survival' || !this.survival.alive) return;
    const c = this.controls, cam = this.camera.position;
    if (c.crouch && c.moving && this.walking) {
      const near = this.wildlife.animals.some((a) => a.alive && !a.tame && !a.boss && Math.abs(a.x - cam.x) < 30 && Math.abs(a.z - cam.z) < 30 && (a.fear ?? 0) < 0.5 && !(a.herd?.fleeTime > 0));
      if (near) this.skill('sneaking', dt * 0.6);
    }
    if (e.hotSpring) this.#achieve('hotspring');
    if (e.cave !== null && e.cave !== undefined && cam.y < this.generator().getHeight(cam.x, cam.z) - 12) this.#achieve('cave');
    this.progressWait = (this.progressWait ?? 0) - dt;
    if (this.progressWait > 0) return;
    this.progressWait = 2;
    const has = (id) => this.inventory.count(id) > 0;
    if (this.age >= 7) this.#achieve('week');
    if (this.age >= 30) this.#achieve('month');
    if (this.age >= 4 * (this.config.daysPerSeason ?? 12)) this.#achieve('year');
    if (this.progress.has('ironBar') || has('ironBar')) this.#achieve('iron');
    if (this.progress.has('steelBar') || has('steelBar')) this.#achieve('steel');
    if (has('salt')) this.#achieve('salt');
    if (has('honey')) this.#achieve('honey');
    if (has('rawEgg')) this.#achieve('eggs');
    const built = this.structures.list;
    if (built.some((s) => s.type === 'campfire' && s.lit)) this.#achieve('fire');
    if (built.some((s) => s.type === 'leanTo' || /[rR]oof$/.test(s.type))) this.#achieve('shelter');
    if (built.some((s) => s.type === 'logBridge' || s.type === 'ropeBridge')) this.#achieve('bridge');
    if (built.filter((s) => /^(stone|cut)(StoneWall|Wall|Window|Door)$/.test(s.type) || s.type === 'cutStoneWall').length >= 8) this.#achieve('stonehouse');
    const tame = this.wildlife.animals.filter((a) => a.tame && a.alive);
    if (tame.some((a) => a.kind === 'horse')) this.#achieve('horse');
    if (tame.some((a) => a.kind === 'sheep' || a.kind === 'turkey' || a.kind === 'duck')) this.#achieve('flock');
    if ((this.ruinsSeen?.size ?? 0) > 0) this.#achieve('ruin');
    if (this.keep?.open) this.#achieve('keep');
    this.hud.skillsButton(this.record);
  }

  // B: your horse's saddlebags (riding it, or close by it).
  #openBags() {
    const p = this.camera.position;
    const a = this.mount ?? this.wildlife.animals.filter((h) => h.tame && h.bags && h.alive && !h.gone && Math.hypot(h.x - p.x, h.z - p.z) < 5).sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z))[0];
    if (!a?.bags) return this.hotbar?.flash(this.mount ? 'Your horse has no saddlebags' : 'No horse with saddlebags close by');
    this.sound?.call('rustle', 0, 0.4);
    this.hud.openChest(a.bags, this.inventory, 'Saddlebags', 'Click to move a stack across · your horse carries these · B, E or Esc to close');
    return this.#menu(true);
  }

  // At the repair bench, a worn tool in hand: mended good as new, for a
  // little of what it was made of (less the less worn it is: never more
  // than half a new one's).
  #repair() {
    const i = this.hotbar.index, s = this.inventory.slots[i], item = s && ITEMS[s.id];
    if (!item?.durability) return this.hotbar?.flash('Hold a worn tool, weapon or armour and Q at the bench to mend it');
    if (s.dur >= item.durability) return this.hotbar?.flash('It needs no mending');
    const r = RECIPES.find((x) => x.id === s.id);
    const worn = 1 - s.dur / item.durability;
    const cost = Object.entries(r?.needs ?? { stick: 1 }).map(([k, n]) => [k, Math.max(1, Math.round(n * 0.45 * worn * (1 - 0.05 * this.skillLevel('crafting'))))]);
    const short = cost.filter(([k, n]) => this.inventory.count(k) < n);
    if (short.length) return this.hotbar?.flash(`To mend it: ${cost.map(([k, n]) => `${ITEMS[k].name.toLowerCase()} ×${n}`).join(', ')}`);
    for (const [k, n] of cost) this.inventory.remove(k, n);
    s.dur = item.durability;
    this.inventory.changed();
    this.sound?.call('grind', 0, 0.6);
    this.skill?.('crafting', 2);
    return this.hotbar?.flash(`${item.name} mended (${cost.map(([k, n]) => `${ITEMS[k].name.toLowerCase()} ×${n}`).join(', ')})`);
  }

  /** R: drops one of what's in your hand (Shift: the whole stack). */
  drop(all) {
    const i = this.hotbar.index;
    const s = this.inventory.take(i, all);
    if (!s) return;
    this.camera.getWorldDirection(dir);
    const p = this.camera.position;
    this.items.drop(s, p.x + dir.x * 1.2, p.y - 0.4, p.z + dir.z * 1.2);
    this.sound?.call('thump', 0, 0.25);
    this.hotbar?.flash(`Dropped ${ITEMS[s.id].name.toLowerCase()}${s.count > 1 ? ` ×${s.count}` : ''}`);
  }

  /** Makes something (if you've what it needs). */
  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;
    const tier = tierOf(id);
    if (!this.unlocked(tier)) return this.hotbar?.flash(`Not yet: ${tier.tag.toLowerCase()} first`);
    if (r.at === 'anvil' && !this.hud.stations?.anvil) return this.hotbar?.flash('Forge that at an anvil: stand by one');
    if (r.uses && !r.uses.some((t) => this.inventory.count(t) > 0)) return this.hotbar?.flash(`That needs ${usesText(r)} in your pack to make`);
    if (!Object.entries(r.needs).every(([k, n]) => this.inventory.count(k) >= n)) return this.hotbar?.flash('Not enough to make that');
    for (const [k, n] of Object.entries(r.needs)) this.inventory.remove(k, n);
    const n = r.makes ?? 1;
    const got = this.#give(id, n);
    this.skill('crafting', 1);
    this.sound?.call('craft', 0, 0.5);
    this.hotbar?.flash(`Made: ${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}${got < n ? ' (some on the ground: no room)' : ''}`);
  }

  // --- Using what's in your hand -------------------------------------------------------

  /** The mouse pressed down (a bow starts to draw). */
  press() {
    if (!this.walking || !this.survival.alive || this.hud.busy || this.riding) return;
    const s = this.inventory.slots[this.hotbar.index];
    if (BOWS.has(s?.id) && this.cooldown <= 0) {
      if (!this.inventory.count('arrow') && !this.inventory.count('poisonArrow')) return this.hotbar?.flash('No arrows (make some: a stick and a flint)');
      this.drawing = { since: this.time };
      this.sound?.call('creak', 0, 0.12);
    }
  }

  /** Click: uses what you're holding, at what you point at. */
  use(ray, placeTorch) {
    if (!this.walking || !this.survival.alive || this.hud.busy || this.sleeping) return;
    const i = this.hotbar.index;
    const s = this.inventory.slots[i];
    const { origin, direction } = this.#ray(ray);
    // (Letting fly with a bow, and reeling in, don't wait on the cooldown.)
    if (BOWS.has(s?.id)) return this.#loose(i, origin, direction);
    if (s?.id === 'fishingRod') return this.#fish(i, origin, direction);
    if (s?.id === 'crossbow') return this.#crossbow(i, origin, direction);
    if (this.cooldown > 0) return;
    const item = s && ITEMS[s.id];
    if (!s) return this.#bareHands(origin, direction);
    // A blade to the grindstone.
    // (Testing: a spawner sets its animal down where you click.)
    if (ITEMS[s.id]?.spawns) {
      const hit = this.solidHit(origin, direction, 60);
      const at = hit?.point ?? origin.clone().addScaledVector(direction, 8);
      const a = ITEMS[s.id].boss ? this.wildlife.spawnBoss(ITEMS[s.id].boss, at.x, at.z) : this.wildlife.spawn(ITEMS[s.id].spawns, at.x, at.z);
      if (a && ITEMS[s.id].male) (a.antlers = true), (a.scale *= 1.12);
      this.cooldown = 0.3;
      return this.hotbar?.flash(a ? (a.boss ? a.boss.name : `A ${ITEMS[s.id].name.replace(' spawner', '').toLowerCase()}`) : 'It can\'t stand there');
    }
    const stone = BLADES.has(s.id) ? this.structures.pick(origin, direction, REACH)?.structure : null;
    if (stone?.type === 'grindstone') return this.#grind(i, s);
    if (s.id === 'sickle') {
      // Cutting the long grass: round where you look, on the ground ahead.
      const at = this.solidHit?.(origin, direction, 4)?.point ?? origin.clone().addScaledVector(direction.clone().setY(0).normalize(), 1.8);
      const mown = this.cutGrass?.(at.x, at.z, 1.5) ?? 0;
      this.inventory.wear(i, 1);
      // (Wild crops in the sweep of the blade: their grain or roots, and maybe their seed.)
      const reaped = this.items.wildNear?.(at.x, at.z, 2.4) ?? []; // (anywhere in a patch)
      if (reaped.length) {
        this.cooldown = 0.45;
        this.#animate('chop', 0.35);
        this.sound?.call('brush', 0, 0.8);
        const got = {};
        for (const it of reaped) {
          this.items.take({ kind: 'ground', item: it });
          const crop = ITEMS[it.id].wild, seed = `seed${crop[0].toUpperCase()}${crop.slice(1)}`;
          const n = crop === 'corn' ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);
          got[crop] = (got[crop] ?? 0) + n;
          if (Math.random() < 0.6) got[seed] = (got[seed] ?? 0) + 1 + Math.floor(Math.random() * 2);
        }
        for (const [id, n] of Object.entries(got)) this.#give(id, n, { x: at.x, y: at.y + 0.3, z: at.z });
        this.dirty = true;
        return this.hotbar?.flash(Object.entries(got).map(([id, n]) => `${ITEMS[id].name} ×${n}`).join(', '));
      }
      this.cooldown = 0.45;
      this.#animate('chop', 0.35);
      this.sound?.call('brush', 0, 0.7);
      if (Math.random() < 0.08) {
        this.#give(['seedWheat', 'seedCarrot'][Math.floor(Math.random() * 2)], 1, { x: at.x, y: at.y + 0.3, z: at.z });
        return this.hotbar?.flash('Seeds, in the cut grass');
      }
      // (Standing grass, cut: an armful of straw, for a bed.)
      if (mown >= 3) {
        const n = mown >= 6 ? 2 : 1;
        this.#give('straw', n, { x: at.x, y: at.y + 0.3, z: at.z });
        return this.hotbar?.flash(`Straw ×${n}`);
      }
      return;
    }
    if (s.id === 'hoe') {
      const plotAt = this.structures.pick(origin, direction, REACH)?.structure;
      if (plotAt?.type === 'plot') return this.hotbar?.flash(this.#structureText(plotAt));
      return this.#dig(i);
    }
    if (AXES[s.id]) return this.#axe(i, origin, direction, AXES[s.id] * (1 + 0.06 * this.skillLevel('woodcutting')));
    if (PICKS[s.id]) return this.#mine(i, origin, direction, PICKS[s.id] * (1 + 0.06 * this.skillLevel('mining')));
    if (SPEARS.has(s.id)) return this.#stab(i, origin, direction);
    if (SWORDS.has(s.id)) return this.#stab(i, origin, direction, true);
    const built = this.structures.pick(origin, direction, REACH);
    const at = built?.structure;
    // A torch you've set down, cold, to light.
    const torch = this.torches?.alongRay(origin, direction, REACH);
    const toLight = torch && !torch.lit && (!built || torch.group.position.distanceTo(origin) < built.distance + 0.3) ? torch : null;
    if (toLight && (LIGHTERS.has(s.id) || TORCHES.has(s.id))) {
      this.#animate('use', 0.3);
      this.cooldown = 0.5;
      if (!TORCHES.has(s.id)) {
        this.sound?.call('strike', 0, 0.5);
        this.inventory.wear(i, 1);
        if (Math.random() < 0.3) return this.hotbar?.flash('Sparks, but it didn’t catch: again');
      }
      this.torches.light(toLight);
      this.sound?.call('ignite', 0, 0.5);
      return this.hotbar?.flash('The torch is burning');
    }
    // A campfire lit from the torch in your hand.
    if (TORCHES.has(s.id) && this.structures.isFire(at) && !at.lit) {
      this.#animate('use', 0.3);
      this.cooldown = 0.5;
      if (!this.structures.light(at)) return this.hotbar?.flash('Nothing to burn: add a log');
      this.sound?.call('ignite', 0, 0.6);
      return this.hotbar?.flash('The fire catches');
    }
    if (LIGHTERS.has(s.id)) {
      this.#animate('use', 0.3);
      this.cooldown = 0.5;
      this.sound?.call('strike', 0, 0.5);
      this.inventory.wear(i, 1);
      // Struck at something that'll burn (a tree, a bush, a fallen log,
      // something built of wood): it may catch, and the fire spreads.
      if (!this.structures.isFire(at)) {
        const tree = this.trees.pick(origin, direction, REACH);
        const fallen = this.felling.pickFallen(origin, direction, REACH);
        const WOODEN = new Set(['wall', 'gate', 'fence', 'fenceGate', 'stake', 'chest', 'bed', 'bedroll', 'strawBed', 'fancyBed', 'dryingRack', 'tanningRack', 'roof', 'raft', 'woodFloor', 'woodWindow', 'logWall', 'plankWall', 'logFloor', 'logStairs', 'plankStairs', 'logRoof', 'shingleRoof', 'logWindow', 'logDoor', 'plankWindow', 'plankDoor']);
        const wooden = at && WOODEN.has(at.type) ? built : null;
        const near = [tree && { d: tree.distance }, fallen && { d: fallen.distance }, wooden && { d: wooden.distance ?? REACH }].filter(Boolean).sort((a, b) => a.d - b.d)[0];
        if (!near) return this.hotbar?.flash('Strike it at something that will burn: a campfire, a torch, wood, a tree');
        const wet = (this.lastCtx?.rain ?? 0) > 0.3 || (this.winter ?? 0) > 0.6;
        if (Math.random() < (wet ? 0.85 : 0.45)) return this.hotbar?.flash(wet ? 'Sparks, but it’s too wet to catch' : 'Sparks, but it didn’t catch: again');
        const p = origin.clone().addScaledVector(direction, near.d);
        this.ignite?.(p.x, p.y, p.z);
        this.sound?.call('crackle', 0, 0.8);
        return this.hotbar?.flash('It catches: get back from it');
      }
      if (at.lit) return this.hotbar?.flash('It is already burning');
      if (Math.random() < 0.35) return this.hotbar?.flash('Sparks, but it didn’t catch: again');
      if (!this.structures.light(at)) return this.hotbar?.flash('Nothing left to burn: add a log');
      this.sound?.call('crackle', 0, 0.6);
      return this.hotbar?.flash('The fire catches');
    }
    // Things for a fire, a furnace or a drying rack.
    if (at && this.#workAt(i, s, at)) return;
    if (s.id === 'waterskin') {
      if (!s.water) return this.hotbar?.flash('Empty: fill it at water (Q)');
      s.water--;
      this.inventory.changed();
      const sick = this.survival.consume({ thirst: 22, sick: s.clean ? 0 : 0.15 });
      this.#animate('use', 0.4);
      this.cooldown = 0.5;
      this.sound?.call('drink', 0, 0.5);
      return this.hotbar?.flash(sick ? 'It tasted foul: you feel feverish' : `You drink (${s.water} left)`);
    }
    if (s.id === 'oldMap') return this.#readMap(i);
    if (s.id === 'bandage') {
      const was = this.survival.bandage();
      this.inventory.take(i);
      this.cooldown = 0.6;
      return this.hotbar?.flash(was ? 'Bandaged: the bleeding stops' : 'Bandaged');
    }
    if (item.food) {
      this.inventory.take(i);
      const sick = this.survival.consume(item.food);
      this.cooldown = 0.6;
      this.#animate('use', 0.35);
      this.sound?.call('eat', 0, 0.5);
      return this.hotbar?.flash(`Ate: ${item.name}${sick ? ' (raw: you feel feverish)' : item.food.health < 0 ? ' (raw: it turns your stomach)' : ''}`);
    }
    if (item.wear) return this.#putOn(i);
    if (item.place === 'caveLamp') {
      if (placeTorch?.(origin, direction, true)) {
        this.inventory.take(i);
        this.cooldown = 0.3;
        this.hotbar?.flash('Crystal lamp set down: it glows of itself, and never goes out');
      }
      return;
    }
    if (item.place === 'torch') {
      if (placeTorch?.(origin, direction, s.id === 'coalTorch' ? 'coal' : false)) {
        this.inventory.take(i);
        this.cooldown = 0.3;
        this.hotbar?.flash('Torch set down: light it with flint and steel (or a burning torch)');
      }
      return;
    }
    if (item.place === 'logBridge' || item.place === 'ropeBridge') {
      const plan = this.plan;
      if (!plan?.ok) return this.hotbar?.flash(plan?.why ?? 'Stand at the edge, looking across');
      this.structures.build(plan, { len: plan.len, rise: plan.rise });
      this.inventory.take(i);
      this.cooldown = 0.5;
      this.sound?.call('place', 0, 0.6);
      this.#learn(item.place);
      return this.hotbar?.flash(`The bridge is across: ${Math.round(plan.len)} m`);
    }
    if (item.place === 'rope') {
      const plan = this.plan;
      if (!plan?.ok) return this.hotbar?.flash(plan?.why ?? 'Stand at the edge of a cliff, looking out over it');
      this.structures.build(plan, { len: plan.len, path: plan.path });
      this.inventory.take(i);
      this.cooldown = 0.4;
      this.sound?.call('place', 0, 0.4);
      return this.hotbar?.flash(`The rope runs ${Math.round(plan.len)} m down: Q on it to climb`);
    }
    if (item.place) {
      const plan = this.plan;
      if (!plan) return this.hotbar?.flash('Point at the ground nearby');
      if (!plan.ok) return this.hotbar?.flash(plan.why);
      this.structures.build(plan);
      this.#learn(plan.type);
      this.inventory.take(i);
      this.cooldown = 0.4;
      this.sound?.call('place', 0, 0.5);
      return;
    }
    if (item.carried) return this.hotbar?.flash(item.carried);
    this.hotbar?.flash(`${item.name}: craft it into something (Tab)`);
  }

  // Something in hand, put to work at a fire, furnace or rack. Returns whether it was.
  #workAt(i, s, at) {
    const say = (t) => (this.hotbar?.flash(t), true);
    const take = () => this.inventory.take(i);
    if (s.id === 'log' && this.structures.isFire(at)) {
      if (!this.structures.feed(at)) return say('It has all the wood it can take');
      take();
      this.cooldown = 0.3;
      return say(at.lit ? 'The fire burns on' : 'Wood on the fire: light it with flint and steel');
    }
    const item = ITEMS[s.id];
    if (at.type === 'campfire' && item.cooks) {
      if (!this.structures.work(at, { id: s.id, count: 1 }, Inventory.stack(item.cooks, 1), TIMES.cook)) return say('No room on the fire');
      take();
      this.cooldown = 0.3;
      return say(at.lit ? `${item.name} on the fire: a minute to cook` : `${item.name} on the fire: light it`);
    }
    // A pot of sea water on a burning fire: boiled away to salt.
    if (at.type === 'campfire' && s.id === 'pot' && s.brine) {
      if (!this.structures.work(at, { id: 'pot', count: 1 }, Inventory.stack('salt', 3), TIMES.stew)) return say('No room on the fire');
      s.brine = false;
      this.inventory.wear(i, 1);
      this.inventory.changed();
      this.cooldown = 0.3;
      return say(at.lit ? 'The sea water on to boil away: salt in a minute' : 'The sea water on the fire: light it');
    }
    // Still water through the filter: sand and charcoal, and out it comes clean.
    if (at.type === 'waterFilter' && s.id === 'waterskin') {
      if (!s.water) return say('Fill it first');
      if (s.clean) return say('It is clean already');
      const skin = this.inventory.slots[i];
      this.inventory.slots[i] = null;
      this.inventory.changed();
      if (!this.structures.work(at, { ...skin }, { ...skin, clean: true }, 15)) {
        this.inventory.slots[i] = skin;
        this.inventory.changed();
        return say('The filter is full');
      }
      this.sound?.call('pour', 0, 0.4);
      return say('Pouring it through the sand and charcoal: clean in a moment');
    }
    if (at.type === 'campfire' && s.id === 'waterskin') {
      if (!s.water) return say('Fill it first');
      if (s.clean) return say('It is clean already');
      const skin = this.inventory.slots[i];
      this.inventory.slots[i] = null;
      this.inventory.changed();
      if (!this.structures.work(at, { ...skin }, { ...skin, clean: true }, TIMES.boil)) {
        this.inventory.slots[i] = skin;
        this.inventory.changed();
        return say('No room on the fire');
      }
      return say('The waterskin is on the fire, to boil');
    }
    if (at.type === 'campfire' && s.id === 'pot') {
      const meat = MEATS.find((id) => this.inventory.count(id));
      const veg = VEG.find((id) => this.inventory.count(id));
      if (!meat || !veg) return say('A stew wants meat or fish, and berries, an apple or mushrooms');
      if (!this.structures.work(at, { id: 'pot', count: 1 }, Inventory.stack('stew', 1), TIMES.stew)) return say('No room on the fire');
      this.inventory.remove(meat, 1);
      this.inventory.remove(veg, 1);
      this.inventory.wear(i, 1);
      return say(`A stew on: ${ITEMS[meat].name.toLowerCase()} and ${ITEMS[veg].name.toLowerCase()}`);
    }
    if (at.type === 'furnace' && s.id === 'iron') {
      if (!this.structures.work(at, { id: 'iron', count: 1 }, Inventory.stack('ironBar', 1), TIMES.smelt)) return say('The furnace is full');
      take();
      this.cooldown = 0.3;
      return say(at.lit ? 'Iron ore in the furnace: it will be a bar in half a minute' : 'Iron ore in the furnace: light it');
    }
    if (at.type === 'tanningRack' && item.tans) {
      if (!this.structures.work(at, { id: s.id, count: 1 }, Inventory.stack(item.tans, 1), TIMES.tan)) return say('There is a hide on it already');
      take();
      this.cooldown = 0.3;
      return say(`${item.name} stretched on the rack: tanned in four minutes`);
    }
    if (at.type === 'furnace' && s.id === 'stick') {
      if (!this.structures.work(at, { id: 'stick', count: 1 }, Inventory.stack('charcoal', 1), TIMES.char)) return say('The furnace is full');
      take();
      this.cooldown = 0.3;
      return say(at.lit ? 'A stick in the furnace: it will char into charcoal' : 'A stick in the furnace: light it');
    }
    if (at.type === 'furnace' && s.id === 'ironBar') return say('Steel is made from the dark ore high in the mountains, smelted with coal from up there');
    // Steel: the mountains' dark ore, smelted with their coal.
    if (at.type === 'furnace' && s.id === 'mountainOre') {
      if (!this.inventory.count('coal')) return say('Mountain ore wants coal with it to make steel: look for black seams in the rock up high');
      if (!this.structures.work(at, { id: 'mountainOre', count: 1 }, Inventory.stack('steelBar', 1), TIMES.steel)) return say('The furnace is full');
      take();
      this.inventory.remove('coal', 1);
      this.cooldown = 0.3;
      return say(at.lit ? 'Mountain ore and coal in the furnace: steel in under a minute' : 'Mountain ore and coal in the furnace: light it');
    }
    if (at.type === 'furnace' && s.id === 'goldOre') {
      if (!this.structures.work(at, { id: 'goldOre', count: 1 }, Inventory.stack('goldBar', 1), TIMES.smelt)) return say('The furnace is full');
      take();
      this.cooldown = 0.3;
      return say(at.lit ? 'Gold ore in the furnace: a bar in half a minute' : 'Gold ore in the furnace: light it');
    }
    if (at.type === 'plot') {
      if (item.sow) {
        if (at.crop) return say('Something is growing there already');
        if (!this.structures.sow(at, item.sow)) return say('It needs digging again');
        take();
        this.cooldown = 0.3;
        this.sound?.call('dig', 0, 0.3);
        return say(`Sown with ${item.sow}${(this.winter ?? 0) > 0.6 ? ': nothing will grow till the spring' : ''}`);
      }
      if (s.id === 'guano') {
        take();
        this.structures.feed(at);
        this.cooldown = 0.3;
        this.sound?.call('dig', 0, 0.3);
        return say('Bat guano dug in: it will grow twice as fast a good while');
      }
      if (s.id === 'waterskin') {
        if (!s.water) return say('Empty: fill it at water');
        s.water--;
        this.inventory.changed();
        this.structures.water(at);
        this.sound?.call('pour', 0, 0.4);
        return say('Watered');
      }
    }
    if (at.type === 'smokingRack' && item.smokes) {
      if (!this.structures.work(at, { id: s.id, count: 1 }, Inventory.stack(item.smokes, 1), TIMES.smoke)) return say('The rack is full');
      take();
      this.cooldown = 0.3;
      return say(`${item.name} hung in the smoke${at.smoking ? '' : ': it wants a campfire burning under it'}`);
    }
    if (at.type === 'dryingRack' && item.dries) {
      if (!this.structures.work(at, { id: s.id, count: 1 }, Inventory.stack(item.dries, 1), TIMES.dry)) return say('The rack is full');
      take();
      this.cooldown = 0.3;
      return say(`${item.name} hung up to dry: jerky in three minutes`);
    }
    // (Food that won't go on it: not eaten by mistake, looking at a rack or a fire.)
    const RACKS = { dryingRack: 'drying rack', smokingRack: 'smoking rack', tanningRack: 'tanning rack', campfire: 'fire' };
    if (item.food && RACKS[at.type]) return say(`${item.name} won't go on the ${RACKS[at.type]}: look away from it to eat`);
    return false;
  }

  // Something to wear, from slot `i`, put on (what was worn there before into the slot).
  #putOn(i) {
    const s = this.inventory.slots[i], item = ITEMS[s?.id];
    if (!item?.wear) return;
    const slot = WORN_SLOT[item.wear];
    const was = this.inventory[slot];
    if (slot === 'back' && was && i >= 9) return this.hotbar?.flash('Take it from the pack first');
    this.inventory[slot] = { ...s, count: 1 };
    this.inventory.slots[i] = s.count > 1 ? { ...s, count: s.count - 1 } : was;
    if (s.count > 1 && was && this.inventory.add(was)) this.items.drop(was, this.camera.position.x, this.camera.position.y - 1, this.camera.position.z);
    this.inventory.changed();
    this.sound?.call('pickup', 0, 0.4);
    return this.hotbar?.flash(slot === 'back' ? `On your back: ${item.name} (six more slots)` : `Wearing: ${item.name}`);
  }

  // What's worn (`slot`: worn, armour or back) taken off, into what you carry.
  #takeOff(slot) {
    const inv = this.inventory, st = inv[slot];
    if (!st) return;
    // (A backpack: into one of the first nine slots, and what was in it with it,
    // where there's room; the rest falls to the ground.)
    const free = inv.slots.slice(0, 9).findIndex((x) => !x);
    if (free < 0) return this.hotbar?.flash('No room to take it off: free a slot first');
    inv[slot] = null;
    inv.slots[free] = st;
    inv.changed();
    this.sound?.call('pickup', 0, 0.4);
    this.hotbar?.flash(`Took off: ${ITEMS[st.id].name}`);
  }

  // A blade ground keen again on the grindstone (as good as new), three
  // times at most: after that it's worn too thin.
  #grind(i, s) {
    const item = ITEMS[s.id];
    if ((s.ground ?? 0) >= GRINDS) return this.hotbar?.flash(`${item.name}: ground down too thin to grind again`);
    if (!item.durability || s.dur >= item.durability) return this.hotbar?.flash('It is keen already');
    s.dur = item.durability;
    s.ground = (s.ground ?? 0) + 1;
    this.inventory.changed();
    this.#animate('use', 0.5);
    this.cooldown = 0.8;
    this.sound?.call('grind', 0, 0.7);
    this.hotbar?.flash(`${item.name} ground keen (${GRINDS - s.ground} more grinding${GRINDS - s.ground === 1 ? '' : 's'} left in it)`);
  }

  // A plot dug with the hoe, where you point.
  #dig(i) {
    const plan = this.plan;
    if (!plan || plan.type !== 'plot') return this.hotbar?.flash('Point at open ground nearby');
    if (!plan.ok) return this.hotbar?.flash(plan.why);
    this.#animate('chop', 0.5);
    this.cooldown = 0.6;
    this.#later(0.3, () => {
      this.structures.build(plan);
      this.inventory.wear(i, 1);
      this.sound?.call('dig', 0, 0.6);
      this.hotbar?.flash('A plot dug: sow seeds in it');
    });
  }

  // Where a rope would go: from where you stand at the edge of a drop or a
  // slope too steep to walk (on a mountain, or in a cave), looking out over
  // it, down along the ground to where it levels off. The rope lies on the
  // ground as it goes: path, [distance out, height below the stake] at each
  // bend. { type, ok, why, x, y, z, rot, len, path }
  // How many of your tame turkeys and ducks live near a hen-house.
  #coopBirds(s) {
    return this.wildlife.animals.filter((a) => a.tame && a.alive && !a.gone && (a.kind === 'turkey' || a.kind === 'duck') && Math.hypot(a.x - s.x, a.z - s.z) < 18).length;
  }

  // The hen-houses: each bird living near one lays an egg every five
  // minutes or so (fewer in winter), and now and then drops a feather.
  #coops(dt) {
    this.coopWait = (this.coopWait ?? 0) - dt;
    if (this.coopWait > 0) return;
    const step = 5 - this.coopWait;
    this.coopWait = 5;
    for (const s of this.structures.list) {
      if (s.type !== 'coop') continue;
      const n = Math.min(8, this.#coopBirds(s));
      if (!n) continue;
      s.eggs = Math.min(20, (s.eggs ?? 0) + n * step / 300 * (1 - 0.7 * (this.winter ?? 0)));
      s.feathers = Math.min(20, (s.feathers ?? 0) + n * step / 600);
    }
  }

  // Where a bridge would go: from the edge you stand at, straight out the
  // way you look, over the gap (a drop, or water) to the first ground on
  // the far side about as high as this. { type, ok, why, x, y, z, rot, len, rise }
  #bridgePlan(type) {
    const cam = this.camera.position, yaw = this.controls.euler.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const feet = cam.y - this.controls.eyeHeight, max = type === 'ropeBridge' ? 26 : 14;
    const g = (d) => this.groundAt(cam.x + fx * d, cam.z + fz * d);
    const wet = (d) => (this.waterAt(cam.x + fx * d, cam.z + fz * d)?.level ?? -Infinity) > g(d) + 0.1;
    const no = (why) => ({ type, ok: false, why });
    let a = 0;
    while (a < 4 && g(a + 0.5) > feet - 0.7 && !wet(a + 0.5)) a += 0.5;
    if (a >= 4) return no('Stand at the edge of a river or a drop, looking across it');
    let gap = false, b = null;
    for (let d = a + 0.5; d <= a + max; d += 0.5) {
      const h = g(d);
      if (!Number.isFinite(h)) break;
      if (h < feet - 1.2 || wet(d)) gap = true;
      else if (gap && Math.abs(h - feet) < 3.5) {
        b = d;
        break;
      }
    }
    if (!gap) return no('Nothing to cross there: look out over a river or a drop');
    if (b === null) return no(`Too far to the other side (a ${type === 'ropeBridge' ? 'rope bridge reaches 26 m' : 'log bridge reaches 14 m'})`);
    const y0 = g(a), y1 = g(b + 0.4);
    return { type, ok: true, x: cam.x + fx * a, y: y0, z: cam.z + fz * a, rot: Math.atan2(fx, fz), len: b - a + 0.8, rise: y1 - y0 };
  }

  #ropePlan() {
    const cam = this.camera.position, yaw = this.controls.euler.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const feet = cam.y - this.controls.eyeHeight;
    // (From a height: the ground there, the cave floor if you're in a cave.)
    // (Where the ground is as drawn, the faceted rock and earth, so the rope
    // lies on it: a ray straight down from just above; or, if that finds
    // nothing near where the ground should be, the ground as walked on.)
    const at = (d, from) => {
      const x = cam.x + fx * d, z = cam.z + fz * d, g = this.groundAt(x, z, from);
      if (!Number.isFinite(g)) return g;
      const rock = this.generator?.()?.caves?.meshFloor?.(x, z, Math.max(g, from ?? g) + 0.9);
      return rock !== null && rock !== undefined && Math.abs(rock - g) < 1.2 ? rock : g;
    };
    const no = { type: 'rope', ok: false, why: 'Stand at the edge of a drop or a steep slope, looking down it' };
    const y0 = at(0, feet + 0.3);
    if (!Number.isFinite(y0)) return no;
    // (The lip: out to where the ground starts to go down from under your feet.)
    let a = 0;
    while (a < 3 && at(a + 0.2, y0 + 0.3) > y0 - 0.3) a += 0.2;
    const y = at(a, y0 + 0.3);
    if (!Number.isFinite(y) || y < y0 - 1) return no;
    // (Down the fall line, the ground a quarter metre at a time; it ends
    // where the ground levels off for a couple of metres, or rises (a wall
    // across a cave).)
    const STEP = 0.25, climb = this.controls.maxClimb ?? 1.1;
    const prof = [[0, y]];
    let steep = false, flat = 0;
    for (let d = STEP; d <= 45; d += STEP) {
      const prev = prof[prof.length - 1][1];
      const g = at(a + d, prev + 0.3);
      if (!Number.isFinite(g) || g > prev + 0.4) break;
      prof.push([d, g]);
      if (prev - g > climb * STEP) (steep = true), (flat = 0);
      else if ((flat += STEP) >= 2 && steep) break;
      if (y - g > 45) return { ...no, why: 'Too far down for one rope' };
      if (!steep && d >= 4) break; // (no drop just ahead: not an edge)
    }
    while (prof.length > 2 && prof[prof.length - 2][1] - prof[prof.length - 1][1] < 0.05) prof.pop();
    const drop = y - prof[prof.length - 1][1];
    if (!steep) return no;
    if (drop < 2.5) return { ...no, why: 'Not drop enough for a rope: climb down' };
    // (The bends: a point wherever the slope changes, so a cliff hangs
    // straight down and a slope lies along the rock.)
    const path = [[0, 0]];
    const add = (d, g) => {
      const last = path[path.length - 1];
      if (d - last[0] > 1e-3 || Math.abs(g - y - last[1]) > 1e-3) path.push([d, +(g - y).toFixed(2)]);
    };
    for (let k = 1; k < prof.length; k++) {
      const [d, g] = prof[k], [pd, pg] = prof[k - 1], nx = prof[k + 1];
      if (pg - g > 1.5) {
        // (Over a sheer drop the rope hangs: off the edge, straight down.)
        add(pd, pg);
        add(d, pg);
        add(d, g);
        continue;
      }
      // (Every bend in the ground, however small: only where it runs
      // straight on are points left out.)
      const s1 = (g - pg) / STEP, s2 = nx ? (nx[1] - g) / STEP : s1;
      if (!nx || Math.abs(s2 - s1) > 0.04 || nx[1] < g - 1.5) add(d, g);
    }
    return { type: 'rope', ok: true, x: cam.x + fx * a, y, z: cam.z + fz * a, rot: Math.atan2(fx, fz), len: drop, path };
  }

  // Up or down a rope, hand over hand, your feet against the rock: W up, S
  // down, Q to let go (and off at the top onto the ledge, at the bottom
  // onto the ground). Along its path: down the face, over the slopes.
  #climb(s) {
    const bx = Math.sin(s.rot), bz = Math.cos(s.rot), p = this.camera.position, eye = this.controls.eyeHeight;
    const path = s.path ?? [[0, 0], [0.1, -s.len]];
    const bottom = s.y + path[path.length - 1][1];
    // (How far out the rope is at a height: between the bends.)
    const outAt = (h) => {
      const dy = h - s.y;
      for (let k = 1; k < path.length; k++) {
        const [d0, y0] = path[k - 1], [d1, y1] = path[k];
        if (dy >= y1) return d0 + (d1 - d0) * (y1 < y0 ? Math.min(1, Math.max(0, (dy - y0) / (y1 - y0))) : 1);
      }
      return path[path.length - 1][0];
    };
    this.climbing = s;
    this.climbH = Math.max(bottom + 0.2, Math.min(s.y - 0.6, p.y - eye));
    this.sound?.call('creak', 0, 0.3);
    let creakAt = this.climbH;
    this.controls.velocityY = 0;
    this.controls.vehicle = (dt, input) => {
      const speed = 1.5 * (this.controls.burden ?? 1) * (this.survival.energy < 20 ? 0.6 : 1);
      this.climbH += input.forward * speed * dt;
      // (Hand over hand: the rope creaking under you as you go.)
      if (Math.abs(this.climbH - creakAt) > 0.6) (creakAt = this.climbH), this.sound?.call('creak', (Math.random() - 0.5) * 0.3, 0.22);
      if (this.climbH >= s.y - 0.1) {
        // Over the top, onto the ledge.
        this.#letGo();
        p.set(s.x - bx * 0.9, this.groundAt(s.x - bx * 0.9, s.z - bz * 0.9, s.y + 0.5) + eye + 0.05, s.z - bz * 0.9);
        return;
      }
      if (input.forward < 0 && this.climbH <= bottom + 0.1) return this.#letGo();
      // (Your feet against the rock: a little out from the rope, and never in the ground.)
      const out = outAt(this.climbH) + 0.4, x = s.x + bx * out, z = s.z + bz * out;
      const g = this.groundAt(x, z, this.climbH + 0.3);
      const h = Number.isFinite(g) && g > this.climbH && g < this.climbH + 0.6 ? g : this.climbH;
      p.set(x, h + eye, z);
      this.controls.velocityY = 0;
      this.controls.grounded = true;
      this.controls.moving = input.forward !== 0;
    };
    this.hotbar?.flash('On the rope: W to climb, S to go down, Q to let go');
  }

  #letGo(say = false) {
    if (!this.climbing) return;
    this.climbing = null;
    this.controls.vehicle = null;
    this.sound?.call('thump', 0, 0.3);
    if (say) this.hotbar?.flash('You let go');
  }

  /** Right-click: throws a spear; otherwise the same as Q. */
  alt(ray) {
    if (!this.walking || !this.survival.alive || this.hud.busy) return;
    const i = this.hotbar.index;
    const s = this.inventory.slots[i];
    if (SPEARS.has(s?.id) && this.cooldown <= 0) return this.#throw(i, ray);
    this.interact(ray);
  }

  #bareHands(origin, direction) {
    const t = this.#target({ origin, direction });
    if (t) return this.interact({ origin, direction });
    this.hotbar?.flash('Empty hand: pick things up with Q');
  }

  // A blow that lands a moment after the swing starts (on the down stroke).
  #later(time, fn) {
    this.pending.push({ time, fn });
  }

  #axe(i, origin, direction, power) {
    this.#animate('chop', 0.62);
    this.cooldown = 0.66;
    this.#later(0.36, () => {
      origin = this.camera.position.clone();
      direction = this.camera.getWorldDirection(new Vector3());
      const animal = this.#aimNear(origin, direction, REACH);
      const fallen = this.felling.pickFallen(origin, direction, REACH);
      const tree = this.trees.pick(origin, direction, REACH);
      const shroom = this.shrooms?.pick(origin, direction, REACH);
      const near = [animal && { k: 'animal', d: animal.distance }, fallen && { k: 'fallen', d: fallen.distance }, tree && { k: 'tree', d: tree.distance }, shroom && { k: 'shroom', d: shroom.distance }].filter(Boolean).sort((a, b) => a.d - b.d)[0];
      if (!near) return this.sound?.call('whoosh', 0, 0.2);
      if (near.k === 'animal') return this.#strike(i, animal, origin);
      if (near.k === 'shroom') {
        // A giant mushroom: soft, a few blows, and down it comes, falling apart.
        this.inventory.wear(i, 1);
        this.sound?.call('chop', 0, 0.5);
        this.felling.spray(new Vector3(shroom.x, origin.y - 0.3, shroom.z), origin, 0xe8dcc8);
        this.shroomHits ??= new Map();
        const hits = (this.shroomHits.get(shroom.key) ?? 0) + power;
        const needs = Math.max(2, Math.round(shroom.height / 2.5));
        if (hits < needs) {
          this.shroomHits.set(shroom.key, hits);
          this.breaking = { label: 'Cutting the mushroom', frac: hits / needs, until: this.time + 2.5 };
          return;
        }
        this.shroomHits.delete(shroom.key);
        const away = Math.atan2(shroom.x - origin.x, shroom.z - origin.z);
        for (const [id, n] of this.shrooms.fell(shroom, away)) this.#give(id, n, { x: shroom.x, y: shroom.y + 0.5, z: shroom.z });
        this.sound?.call('treefall', 0, 0.35);
        this.dirty = true;
        return this.hotbar?.flash('Down it comes, falling apart');
      }
      this.inventory.wear(i, 1);
      if (this.anim?.kind === 'chop') this.anim.bite = true; // (the blade sticks a moment: see drawHeld)
      this.sound?.call('chop', 0, 0.7);
      this.skill('woodcutting', 1);
      const ground = (x, z) => this.groundAt(x, z);
      this.dirty = true;
      if (near.k === 'fallen') {
        if (this.felling.chopFallen(fallen.fallen, origin, ground)) this.hotbar?.flash('Chopped into logs');
        return;
      }
      // (Where along the trunk the blade bites: where you aimed.)
      const at = origin.y + direction.y * tree.distance;
      const result = this.felling.chop(tree, origin, at, this.wind?.() ?? { x: 0, z: 0 }, power);
      if (result === 'fell') {
        this.sound?.call('creak', 0, 0.7);
        this.hotbar?.flash('Timber!');
      } else if (result === 'bush') {
        this.items.drop(Inventory.stack('stick', 1 + Math.floor(Math.random() * 2)), tree.x, tree.y + 0.8, tree.z);
        if (!CACTI.has(tree.type)) this.items.drop(Inventory.stack('vine', 1 + Math.floor(Math.random() * 2)), tree.x + 0.3, tree.y + 0.8, tree.z + 0.2); // (and its vines)
      }
    });
  }

  // A pickaxe at rock: a boulder, a rock face, a cave wall. Stone, and now and then flint or iron ore.
  /**
   * A blow with a pickaxe. Rock takes a few blows to break (a better pick,
   * fewer): bare rock or a boulder gives stone, now and then flint; a vein
   * of ore (lying in the rock, each its own look: see oreNodeModel) gives
   * its ore, the harder ones taking more blows.
   */
  #mine(i, origin, direction, power) {
    this.#animate('chop', 0.62);
    this.cooldown = 0.7 / Math.sqrt(power);
    this.#later(0.36, () => {
      const vein = this.items.pick(origin, direction, REACH + 0.3);
      const boulder = this.#boulderAlong(origin, direction, REACH + 0.3);
      const face = this.solidHit(origin, direction, REACH + 0.3);
      const faceD = face ? face.point.distanceTo(origin) : Infinity;
      let where = null, target = null, stone = null;
      if (vein?.item.node && vein.distance <= Math.min(faceD, boulder?.distance ?? Infinity) + 0.4) {
        target = vein;
        where = new Vector3(vein.item.x, vein.item.y + 0.2, vein.item.z);
      } else if (boulder && boulder.distance <= faceD + 0.3) (where = boulder.point), (stone = boulder);
      else if (face && (face.cave || face.normal.y < 0.6 || this.#mesaTop(face.point))) where = face.point; // (a mesa's top is bare caprock: you can break it, flat as it is)
      if (!where) {
        if (face) this.hotbar?.flash('Only soil here: find bare rock, a boulder or a vein of ore');
        return this.sound?.call('whoosh', 0, 0.2);
      }
      this.inventory.wear(i, 1);
      this.sound?.call('strike', 0, 0.7);
      this.skill('mining', 1);
      this.sound?.call('thunk', 0, 0.5);
      const id = target ? target.id : 'rock';
      this.felling.spray(where, origin, { iron: 0xa0502c, coal: 0x24201e, goldOre: 0xf0c030, mountainOre: 0x9ab0c8 }[id] ?? 0x8e8a84);
      // How many blows it wants, and how many it's had (a crack in the rock
      // here keeps for half a minute).
      const needs = Math.max(1, Math.ceil(({ rock: stone ? Math.min(8, 3 + Math.round(stone.size)) : 4, coal: 5, iron: 6, mountainOre: 8, goldOre: 8 }[id] ?? 4) / power));
      this.cracks ??= new Map();
      const key = target ? target.item.key : stone?.key ? `boulder:${stone.key}` : `${Math.round(where.x / 1.5)},${Math.round(where.y / 1.5)},${Math.round(where.z / 1.5)}`;
      for (const [k, c] of this.cracks) if (this.time - c.at > 30) this.cracks.delete(k);
      const crack = this.cracks.get(key) ?? { hits: 0 };
      crack.hits++;
      crack.at = this.time;
      this.cracks.set(key, crack);
      const label = target ? ITEMS[id].name : 'rock';
      if (crack.hits < needs) {
        this.breaking = { label: `Breaking the ${label.toLowerCase()}`, frac: crack.hits / needs, until: this.time + 2.5 };
        return;
      }
      // Broken.
      this.cracks.delete(key);
      this.breaking = { label: `Breaking the ${label.toLowerCase()}`, frac: 1, until: this.time + 0.8 };
      this.sound?.call('crack', 0, 0.6);
      const at = { x: where.x, y: where.y + 0.3, z: where.z };
      if (target) {
        this.items.take(target);
        const n = 1 + (Math.random() < 0.2 * power ? 1 : 0);
        this.#give(id, n, at);
        this.#give('rock', 1, at);
        this.hotbar?.flash(`${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}, and a stone`);
      } else {
        // (A boulder broken up: it falls apart into stone and is gone, in a burst of chips and dust.)
        if (stone?.key && this.rocks.removeKey?.(stone.key)) {
          const c = { x: where.x, y: where.y, z: where.z };
          this.felling.burst(c, stone.size);
          this.sound?.call('thump', 0, 0.8);
          this.dirty = true;
        }
        const flint = Math.random() < (stone ? 0.3 : 0.14);
        // (Iron ore in the rock, now and then: more often up in the mountains and their foothills.)
        const mount = this.generator?.()?.getMountainness?.(where.x, where.z) ?? 0;
        const ore = Math.random() < (stone ? 0.04 : 0.02) + 0.1 * Math.min(1, Math.max(0, (mount - 0.3) / 0.3));
        if (ore) this.#give('iron', 1, at);
        const n = 1 + (Math.random() < 0.4 ? 1 : 0) + (stone ? Math.min(2, Math.floor(stone.size)) : 0);
        this.#give('rock', n, at);
        if (flint) this.#give('flint', 1, at);
        this.hotbar?.flash(`${ITEMS.rock.name}${n > 1 ? ` ×${n}` : ''}${flint ? ', and flint' : ''}${ore ? ', and iron ore!' : ''}`);
      }
    });
  }

  // Whether (x, z) is up on a mesa (its caprock), not down on the flats.
  #mesaTop(p) {
    const f = this.generator().getFeatures(p.x, p.z);
    return f.mesa > 0.35 && f.mesaHeight > 17 * f.mesa;
  }

  // The boulder a ray meets (within reach): { point, distance }, or null.
  #boulderAlong(origin, direction, reach) {
    const C = this.config.chunkSize, ccx = Math.floor(origin.x / C), ccz = Math.floor(origin.z / C);
    let best = null;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const list = this.rocks?.boulders.get(`${ccx + dx},${ccz + dz}`);
      if (!list) continue;
      for (let k = 0; k < list.length; k += 7) {
        const [bx, bz, by, hx, hy, hz] = list.slice(k, k + 6);
        if (hy < 0.25 || Math.abs(bx - origin.x) > reach + 4 || Math.abs(bz - origin.z) > reach + 4) continue;
        const r = Math.max(hx, hz) * 0.95;
        const ox = bx - origin.x, oy = by + hy * 0.3 - origin.y, oz = bz - origin.z;
        const t = ox * direction.x + oy * direction.y + oz * direction.z;
        const off2 = ox * ox + oy * oy + oz * oz - t * t;
        if (t < 0 || off2 > r * r) continue;
        const d = t - Math.sqrt(r * r - off2);
        if (d > reach) continue;
        if (!best || d < best.distance) best = { distance: d, point: origin.clone().addScaledVector(direction, Math.max(0, d)), key: this.rocks.keyOf?.(bx, bz), size: Math.max(hx, hy, hz) };
      }
    }
    return best;
  }

  // (A sword: a swing, quicker than a spear's thrust.)
  #stab(i, origin, direction, swing = false) {
    this.#animate(swing ? 'chop' : 'thrust', swing ? 0.36 : 0.4);
    this.cooldown = swing ? 0.55 : 0.75;
    this.#later(swing ? 0.18 : 0.12, () => {
      // (Where you're pointing as the blow lands, not where you were.)
      const o = this.camera.position.clone(), d = this.camera.getWorldDirection(new Vector3());
      const hit = this.#aimNear(o, d, REACH + 0.5);
      if (hit) return this.#strike(i, hit, o);
      // A fish, in the water in front of you?
      if (this.#spearFish(o, d, REACH + 0.8)) this.inventory.wear(i, 1);
      else this.sound?.call('whoosh', 0, 0.25);
    });
  }

  // A blow's aim: along the ray, or a hand's breadth off it (a thrust or a
  // swing isn't a pin-point).
  #aimNear(o, d, reach) {
    const direct = this.#aimAny(o, d, reach);
    if (direct) return direct;
    const right = new Vector3().crossVectors(d, UP).normalize(), up = new Vector3().crossVectors(right, d);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const hit = this.#aimAny(o.clone().addScaledVector(right, a * 0.13).addScaledVector(up, b * 0.13), d, reach);
      if (hit) return hit;
    }
    return null;
  }

  // The nearest creature along a ray: an animal, or a spider in the caves.
  #aimAny(o, d, reach) {
    const a = this.wildlife.aim(o, d, reach), s = this.spiders?.aim(o, d, reach);
    return s && (!a || s.distance < a.distance) ? s : a;
  }

  // A spider struck or shot.
  #hitSpider(hit, sharp, from) {
    const out = this.spiders.wound(hit.animal, sharp);
    this.#wounded(hit, from);
    this.sound?.call('stab', 0, 0.5);
    this.sound?.call(out === 'dead' ? 'thump' : 'hiss', 0, hit.animal.boss ? 0.9 : 0.5);
    if (hit.animal.boss) {
      this.#bossFight(hit.animal);
      return this.hotbar?.flash(out === 'dead' ? `${hit.animal.boss.name} is dead` : 'A hit: she shrieks');
    }
    this.hotbar?.flash(out === 'dead' ? 'The spider curls up, dead' : 'A hit: it hisses');
  }

  // Spearing a fish (along a ray, or where a thrown spear goes in): whether one was caught.
  #spearFish(origin, direction, reach) {
    for (const f of this.fish?.fish ?? []) {
      if (f.gone || f.leap) continue;
      const ox = f.x - origin.x, oy = f.y - origin.y, oz = f.z - origin.z;
      const t = ox * direction.x + oy * direction.y + oz * direction.z;
      if (t < 0 || t > reach) continue;
      if (ox * ox + oy * oy + oz * oz - t * t > 0.6 * 0.6) continue;
      f.gone = true;
      this.#give('rawFish', 1);
      this.sound?.call('splash', 0, 0.5);
      this.hotbar?.flash('You speared a fish');
      return true;
    }
    return false;
  }

  #strike(i, hit, from = this.camera.position) {
    const a = hit.animal;
    const sharp = ITEMS[this.inventory.slots[i]?.id]?.sharp ?? 1;
    if (hit.spider) {
      this.inventory.wear(i, 1);
      return this.#hitSpider(hit, sharp, from);
    }
    const outcome = this.wildlife.wound(a, { head: hit.head, from, hit, sharp });
    this.inventory.wear(i, 1);
    this.#wounded(hit, from);
    this.#report(a, outcome, hit.head);
    if (a.boss) this.#bossFight(a);
  }

  // A hit that went in: the sound of it, blood, the mark at the crosshair.
  #wounded(hit, from) {
    this.sound?.call('stab', 0, 0.8);
    if (hit.point) this.felling.spray(hit.point, from, 0x7a0a0a);
    this.hud.hitMark(hit.head);
  }

  // A fight with a great beast: its name and health at the top of the
  // screen, till it's dead or you've been out of the fight a while.
  #bossFight(a) {
    this.bossFight = { a, until: this.time + 10 };
  }

  #report(a, outcome, head) {
    // (Points for a hit: archery, if it was a bow or crossbow in your hand. And a kill, achieved.)
    const held = this.inventory.slots[this.hotbar?.index ?? 0]?.id;
    if (held === 'bow' || held === 'antlerBow' || held === 'crossbow') this.skill('archery', outcome === 'dead' ? 5 : 3);
    if (outcome === 'dead') {
      this.#achieve('hunt');
      if (['grizzly', 'blackBear', 'moose', 'bison'].includes(a.kind)) this.#achieve('biggame');
      if (a.boss) this.#achieve('boss');
    }
    if (a.boss) {
      if (outcome === 'dead') this.hotbar?.flash(`${a.boss.name} is dead`);
      return;
    }
    const name = NAMES[a.kind] ?? 'animal';
    const text = { dead: `The ${name} is dead`, down: head ? `A blow to the head: the ${name} is down` : `The ${name} is down: finish it`, lame: `The ${name} is limping`, hit: `You wounded the ${name}` }[outcome];
    if (text) this.hotbar?.flash(text);
  }

  // Launching a spear or an arrow along a ray.
  #launch(kind, stack, origin, direction, speed, power = 1) {
    const mesh = new Mesh(this.items.model(kind === 'spear' ? stack.id : kind), this.items.material);
    mesh.castShadow = true;
    const pos = origin.clone().addScaledVector(direction, 0.6);
    pos.y -= 0.12;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const vel = direction.clone().multiplyScalar(speed).add(new Vector3(0, kind === 'spear' ? 1.2 : kind === 'arrow' ? 0.4 : 0.1, 0));
    this.flying.push({ kind, mesh, pos, vel, stack, life: 7, power });
    // (Online: for the others to see it fly.)
    const r = (v) => Math.round(v * 100) / 100;
    this.onShot?.({ m: kind === 'spear' ? stack.id : kind, p: [r(pos.x), r(pos.y), r(pos.z)], v: [r(vel.x), r(vel.y), r(vel.z)] });
  }

  /**
   * Someone else's spear or arrow, online, flying as theirs does: only to
   * be seen (where it ends up comes as a dropped item, and what it hit,
   * from them).
   */
  ghostShot(f) {
    if (!ITEMS[f.m] || !Array.isArray(f.p) || !Array.isArray(f.v)) return;
    const mesh = new Mesh(this.items.model(f.m), this.items.material);
    mesh.castShadow = true;
    const pos = new Vector3(...f.p);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.ghosts.push({ mesh, pos, vel: new Vector3(...f.v), life: 7 });
  }

  #flyGhosts(dt) {
    for (const g of this.ghosts) {
      g.life -= dt;
      const step = g.vel.length() * dt;
      dir.copy(g.vel).normalize();
      // (Into a creature, or the ground: gone, as theirs stops there.)
      const ground = this.groundAt(g.pos.x, g.pos.z, g.pos.y + 1);
      if (this.wildlife.aim(g.pos, dir, step + 0.3) || (Number.isFinite(ground) && g.pos.y < ground + 0.1) || g.life <= 0) {
        g.done = true;
        const d = Math.hypot(g.pos.x - this.camera.position.x, g.pos.z - this.camera.position.z);
        if (d < 40) this.sound?.call('thunk', 0, 0.3 * Math.min(1, 6 / (d + 3)));
        continue;
      }
      g.pos.addScaledVector(g.vel, dt);
      g.vel.y -= 9.8 * dt;
      g.mesh.position.copy(g.pos);
      g.mesh.quaternion.setFromUnitVectors(FORWARD, dir);
      const w = this.waterAt(g.pos.x, g.pos.z);
      if (w && g.pos.y < w.level && !g.wet) {
        g.wet = true;
        g.vel.multiplyScalar(0.25);
        this.traces?.splash(g.pos.x, w.level, g.pos.z, 6, 1.5, 0.6);
      }
    }
    for (const g of this.ghosts) if (g.done) this.scene.remove(g.mesh);
    this.ghosts = this.ghosts.filter((g) => !g.done);
  }

  #throw(i, ray) {
    const s = this.inventory.take(i);
    const { origin, direction } = this.#ray(ray);
    this.#animate('throw', 0.5);
    this.#launch('spear', s, origin, direction, 28);
    this.cooldown = 0.6;
    this.sound?.call('whoosh', 0, 0.5);
  }

  // Letting an arrow fly: the longer the bow's been drawn (up to a second), the harder.
  #loose(i, origin, direction) {
    if (!this.drawing) return;
    const draw = Math.min(1, (this.time - this.drawing.since) / 0.9);
    this.drawing = null;
    // (Venom arrows first, if you've any.)
    const ammo = this.inventory.count('poisonArrow') ? 'poisonArrow' : 'arrow';
    if (draw < 0.15 || !this.inventory.remove(ammo, 1)) return;
    const power = ITEMS[this.inventory.slots[i]?.id]?.power ?? 1;
    this.inventory.wear(i, 1);
    this.#animate('loose', 0.25);
    this.#launch('arrow', Inventory.stack(ammo, 1), origin, this.#sway(direction), (16 + 34 * draw) * power * (1 + 0.03 * this.skillLevel('archery')), power);
    this.skill('archery', 0.5);
    this.cooldown = 0.35;
    this.sound?.call('whoosh', 0, 0.35 + 0.3 * draw);
  }

  // Shooting on the move: running, the shot goes wild (some degrees off,
  // any way); walking, a little off; standing still (or crouched), true.
  #sway(direction) {
    const c = this.controls, moving = c.moving ?? (c.currentSpeed ?? 0) > 0.5;
    const spread = (c.sprinting ? 0.14 : moving && !c.crouch ? 0.025 : 0) * (1 - 0.06 * this.skillLevel('archery'));
    if (!spread) return direction;
    const d = direction.clone();
    d.x += (Math.random() - 0.5) * 2 * spread;
    d.y += (Math.random() - 0.5) * 2 * spread * 0.8;
    d.z += (Math.random() - 0.5) * 2 * spread;
    return d.normalize();
  }

  // The crossbow: wind it (a bolt from your pack, two seconds), then a
  // click looses it: fast and flat, and it strikes hard.
  #crossbow(i, origin, direction) {
    const s = this.inventory.slots[i];
    if (this.winding || this.cooldown > 0) return;
    if (s.loaded) {
      s.loaded = false;
      this.inventory.wear(i, 1);
      this.inventory.changed();
      this.#launch('bolt', Inventory.stack(s.venom ? 'poisonBolt' : 'bolt', 1), origin, this.#sway(direction), 75);
      this.cooldown = 0.3;
      this.#animate('kick', 0.3);
      this.sound?.call('twang', 0, 0.7);
      return;
    }
    const venom = this.inventory.count('poisonBolt') > 0;
    if (!this.inventory.remove(venom ? 'poisonBolt' : 'bolt', 1)) return this.hotbar?.flash('No bolts (make them at an anvil)');
    s.venom = venom;
    this.winding = { i, t: 0, dur: 2.2 };
    this.sound?.call('winch', 0, 0.5);
    this.hotbar?.flash('Winding the crossbow…');
  }

  #wind(dt, held) {
    const w = this.winding;
    if (!w) return;
    if (this.hotbar.index !== w.i || held?.id !== 'crossbow') {
      this.winding = null;
      this.#give('bolt', 1);
      return;
    }
    w.t += dt;
    if (w.t >= w.dur) {
      held.loaded = true;
      this.inventory.changed();
      this.winding = null;
      this.sound?.call('click', 0, 0.5);
      this.hotbar?.flash('Loaded: click to shoot');
    }
  }

  #flyAll(dt) {
    for (const sp of this.flying) {
      sp.life -= dt;
      const step = sp.vel.length() * dt;
      dir.copy(sp.vel).normalize();
      // Into a creature?
      const hit = this.#aimAny(sp.pos, dir, step + 0.3);
      if (hit?.spider && !sp.done) {
        const shot = SHOTS[sp.kind];
        this.#hitSpider(hit, (shot.sharp ?? ITEMS[sp.stack.id]?.sharp ?? 1) * (sp.power ?? 1) * (ITEMS[sp.stack.id]?.venom ? 2 : 1), sp.pos);
        sp.done = true;
        sp.life = 0;
        continue;
      }
      if (hit && !sp.done) {
        const shot = SHOTS[sp.kind];
        // (A stiffer bow's arrow strikes harder; venom doubles a hit, and lames.)
        const venom = !!ITEMS[sp.stack.id]?.venom;
        const sharp = (shot.sharp ?? ITEMS[sp.stack.id]?.sharp ?? 1) * (sp.power ?? 1) * (venom ? 2 : 1);
        const outcome = this.wildlife.wound(hit.animal, { head: hit.head, from: this.camera.position, hit, sharp });
        if (venom && hit.animal.alive && !hit.animal.boss) hit.animal.lame = true;
        this.#wounded(hit, sp.pos);
        this.#report(hit.animal, outcome, hit.head);
        if (hit.animal.boss) this.#bossFight(hit.animal);
        sp.done = true;
        // It stays in it where it went in (till the carcass is butchered);
        // a spear may break.
        if (sp.kind === 'spear') sp.stack.dur = (sp.stack.dur ?? 1) - 2;
        const broken = sp.kind === 'spear' ? sp.stack.dur <= 0 : Math.random() < 0.2;
        if (broken) {
          if (sp.kind === 'spear') this.hotbar?.flash('The spear broke');
          continue;
        }
        sp.mesh.quaternion.setFromUnitVectors(FORWARD, dir);
        sp.mesh.position.copy(hit.point).addScaledVector(dir, shot.bury - shot.tip);
        if (this.wildlife.stick(hit.animal, hit, sp.mesh, sp.stack)) sp.kept = true;
        else this.items.drop(sp.stack, hit.animal.x + rnd(-0.5, 0.5), hit.animal.y + 1, hit.animal.z + rnd(-0.5, 0.5));
        continue;
      }
      sp.pos.addScaledVector(sp.vel, dt);
      sp.vel.y -= 9.8 * dt;
      // (Whistling past one: it's startled.)
      if (!sp.done && sp.kind !== 'spear') this.wildlife.startle?.(sp.pos.x, sp.pos.z, 4);
      sp.mesh.position.copy(sp.pos);
      sp.mesh.quaternion.setFromUnitVectors(FORWARD, dir);
      // Into the water: a splash (and maybe a fish).
      const w = this.waterAt(sp.pos.x, sp.pos.z);
      if (w && sp.pos.y < w.level && !sp.wet) {
        sp.wet = true;
        sp.vel.multiplyScalar(0.25);
        this.traces?.splash(sp.pos.x, w.level, sp.pos.z, 6, 1.5, 0.6);
        if (sp.kind === 'spear') this.#spearFish(sp.pos.clone().addScaledVector(dir, -1), dir, 2.5);
      }
      // Into the ground: it sticks there.
      const g = this.groundAt(sp.pos.x, sp.pos.z, sp.pos.y + 1);
      if ((Number.isFinite(g) && sp.pos.y < g + 0.1) || sp.life <= 0) {
        if (!sp.done) this.wildlife.startle?.(sp.pos.x, sp.pos.z, 9); // (thudding in close by)
        sp.done = true;
        sp.stack.dur = (sp.stack.dur ?? 1) - 1;
        const lost = sp.kind !== 'spear' ? Math.random() < 0.25 : sp.stack.dur <= 0;
        if (!lost) {
          const tilt = q.setFromUnitVectors(FORWARD, dir).clone();
          const y = Number.isFinite(g) ? g : sp.pos.y;
          const short = sp.kind !== 'spear';
          const d = this.items.drop(sp.stack, sp.pos.x - dir.x * (short ? 0.2 : 0.5), y + 0.3, sp.pos.z - dir.z * (short ? 0.2 : 0.5), { tilt });
          d.settled = true;
          d.y = y + (short ? 0.15 : 0.35);
          d.mesh.position.set(d.x, d.y, d.z);
          this.sound?.call('thunk', 0, 0.3);
        } else if (sp.kind === 'spear') this.hotbar?.flash('The spear broke');
      }
    }
    for (const sp of this.flying.filter((x) => x.done && !x.kept)) this.scene.remove(sp.mesh);
    this.flying = this.flying.filter((x) => !x.done);
  }

  // --- Fishing ----------------------------------------------------------------------

  // A click with the rod: cast (into water within 14 m), or reel in (with a
  // fish, if it's biting just then).
  #fish(i, origin, direction) {
    if (this.line) {
      const biting = this.line.bite > 0;
      this.#reel();
      this.#animate('cast', 0.4);
      if (!biting) return this.hotbar?.flash('Nothing on the line');
      this.inventory.wear(i, 1);
      // (And one fewer in the water there, if there's one to be had.)
      const f = (this.fish?.fish ?? []).find((f) => !f.gone && Math.hypot(f.x - this.line?.x, f.z - this.line?.z) < 12);
      if (f) f.gone = true;
      // (Down in the dark water, the fish are pale and blind.)
      const blind = !!this.waterAt(this.line?.x ?? this.camera.position.x, this.line?.z ?? this.camera.position.z)?.cave;
      this.#give(blind ? 'blindFish' : 'rawFish', 1);
      this.skill('fishing', 4);
      if (this.record.count('fish') >= 10) this.#achieve('fish10');
      this.sound?.call('splash', 0, 0.6);
      return this.hotbar?.flash(blind ? 'A blind cave fish!' : 'A fish!');
    }
    if (this.cooldown > 0) return;
    // Where the float lands: the first water along a gentle arc out in front.
    let at = null;
    const flat = new Vector3(direction.x, 0, direction.z).normalize();
    const reach = 5 + 9 * Math.max(0, Math.min(1, direction.y + 0.6));
    for (let t = 2; t <= reach; t += 0.5) {
      const x = origin.x + flat.x * t, z = origin.z + flat.z * t;
      const w = this.waterAt(x, z);
      if (w && this.groundAt(x, z) < w.level - 0.3) at = { x, z, level: w.level, salty: !!w.lake && this.generator().getOceanness(x, z) > 0.5 };
    }
    this.#animate('cast', 0.6);
    this.cooldown = 0.6;
    if (!at) return this.hotbar?.flash('Cast into deeper water');
    const bobber = new Mesh(this.bobberGeometry ?? (this.bobberGeometry = bobberModel()), this.items.material);
    bobber.position.set(at.x, at.level, at.z);
    this.scene.add(bobber);
    const line = new Line(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3)), new LineBasicMaterial({ color: 0xe8e4d8 }));
    line.frustumCulled = false;
    this.scene.add(line);
    // (Sooner where there are fish about.)
    const near = (this.fish?.fish ?? []).some((f) => Math.hypot(f.x - at.x, f.z - at.z) < 10);
    this.line = { ...at, bobber, line, wait: rnd(4, 14) * (near ? 0.5 : 1) * (1 - 0.06 * this.skillLevel('fishing')), bite: 0 };
    this.sound?.call('whoosh', 0, 0.3);
    this.traces?.splash(at.x, at.level, at.z, 4, 1, 0.4);
  }

  #reel() {
    if (!this.line) return;
    this.scene.remove(this.line.bobber);
    this.scene.remove(this.line.line);
    this.line.line.geometry.dispose();
    this.line = null;
  }

  #fishing(dt, held) {
    const l = this.line;
    if (!l) return;
    if (held?.id !== 'fishingRod' || !this.walking || Math.hypot(l.x - this.camera.position.x, l.z - this.camera.position.z) > 25) return this.#reel();
    // Waiting; then a bite: the float bobs under (click now!), then it's gone.
    if (l.bite > 0) {
      l.bite -= dt;
      if (l.bite <= 0) (l.wait = rnd(5, 15)), this.hotbar?.flash('It got away');
    } else {
      l.wait -= dt;
      if (l.wait <= 0) {
        l.bite = 1.3;
        this.sound?.call('splash', 0, 0.4);
        this.traces?.splash(l.x, l.level, l.z, 5, 1.2, 0.5);
        this.hotbar?.flash('A bite! Click!');
      }
    }
    l.bobber.position.y = l.level + (l.bite > 0 ? -0.12 : Math.sin(this.time * 2) * 0.02);
    // The line, from the rod's tip to the float.
    const tip = this.rodTip ? this.rodTip.getWorldPosition(v) : this.camera.position;
    const a = l.line.geometry.attributes.position;
    a.setXYZ(0, tip.x, tip.y, tip.z);
    a.setXYZ(1, l.bobber.position.x, l.bobber.position.y + 0.04, l.bobber.position.z);
    a.needsUpdate = true;
  }

  // --- A horse ----------------------------------------------------------------------

  // Up into the saddle: W to go (walking, trotting; Shift to gallop, as
  // long as its wind holds), steering where you look, Space to jump. It
  // carries what you can't (saddlebags). Not into the caves.
  #ride(a) {
    this.mount = a;
    a.ridden = true;
    a.led = false;
    this.controls.velocityY = 0;
    const sp = { walk: 1.5, trot: 5, gallop: a.saddled === 'great' ? 16 : 14 };
    this.controls.vehicle = (dt, input) => {
      if (!a.alive) return this.#dismount();
      const keys = this.controls.keys;
      const gallop = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && (a.stamina ?? 100) > 4;
      const yaw = this.controls.euler.y;
      a.rideWant = yaw + Math.PI - input.strafe * 0.6;
      a.rideSpeed = input.forward > 0 ? (gallop ? sp.gallop : sp.trot) : input.forward < 0 ? 0 : input.strafe ? sp.walk : 0;
      if (keys.has('Space') && !a.hop && (a.stamina ?? 100) > 10) {
        a.hop = { vy: 4.2 };
        a.stamina -= 8;
      }
      const p = this.camera.position;
      // (On its back: the eye a little behind its withers.)
      const back = -0.05 * a.scale;
      p.set(a.x - Math.sin(a.heading) * back, a.y + 2.65 * a.scale, a.z - Math.cos(a.heading) * back);
      this.controls.grounded = true;
      this.controls.moving = a.speed > 0.3;
      if (a.balked && !this.balkSaid) (this.balkSaid = true), this.hotbar?.flash('It won\'t go into the cave');
      if (!a.balked) this.balkSaid = false;
    };
    this.sound?.call('neigh', 0, 0.4);
    this.hotbar?.flash('Riding: W to go, Shift to gallop, Space to jump, Q to get down');
  }

  // Down from the saddle, beside it.
  #dismount(say = false) {
    const a = this.mount;
    if (!a) return;
    this.mount = null;
    a.ridden = false;
    a.rideSpeed = 0;
    a.home = { x: a.x, z: a.z };
    this.controls.vehicle = null;
    const p = this.camera.position;
    const side = a.heading + Math.PI / 2;
    const x = a.x + Math.sin(side) * 1.4, z = a.z + Math.cos(side) * 1.4;
    p.set(x, this.groundAt(x, z) + this.controls.eyeHeight + 0.1, z);
    this.dirty = true;
    this.sound?.call('thump', 0, 0.35);
    if (say) this.hotbar?.flash(a.alive ? 'Down from the saddle' : 'Your horse is dead');
  }

  // --- A raft -----------------------------------------------------------------------

  #board(s) {
    this.riding = s;
    this.sound?.call('splash', 0, 0.35);
    const p = this.camera.position;
    p.set(s.x, s.y + 0.45 + this.controls.eyeHeight, s.z);
    this.controls.velocityY = 0;
    // Paddling: forward and back, turning as you look; never onto land.
    this.controls.vehicle = (dt, input) => {
      const w = this.waterAt(s.x, s.z) ?? { level: s.y + 0.12 };
      const yaw = this.controls.euler.y;
      s.speed = (s.speed ?? 0) + (input.forward * 3 - (s.speed ?? 0)) * Math.min(1, dt * 0.8);
      const nx = s.x - Math.sin(yaw) * s.speed * dt, nz = s.z - Math.cos(yaw) * s.speed * dt;
      const next = this.waterAt(nx, nz);
      if (next && this.groundAt(nx, nz) < next.level - 0.2) {
        s.heading = (s.heading ?? s.rot) + Math.atan2(Math.sin(yaw - (s.heading ?? s.rot)), Math.cos(yaw - (s.heading ?? s.rot))) * Math.min(1, dt * 1.5);
        this.structures.move(s, nx, next.level - 0.12 + Math.sin(this.time * 1.6) * 0.03, nz, s.heading);
      } else s.speed = 0;
      const b = this.time * 1.6;
      p.set(s.x, w.level - 0.12 + 0.45 + this.controls.eyeHeight + Math.sin(b) * 0.03, s.z);
      this.controls.grounded = true;
      this.controls.moving = Math.abs(s.speed) > 0.2;
    };
    this.hotbar?.flash('On the raft: W to paddle, Q to get off');
  }

  // Off the raft: onto land close by, if there's any, else into the water.
  #getOff(say = false) {
    const s = this.riding;
    if (!s) return;
    this.riding = null;
    this.controls.vehicle = null;
    this.dirty = true;
    const p = this.camera.position;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      for (const d of [2, 3, 4]) {
        const x = s.x + Math.sin(a) * d, z = s.z + Math.cos(a) * d;
        const w = this.waterAt(x, z), g = this.groundAt(x, z);
        if (!w || g > w.level - 0.1) {
          p.set(x, g + this.controls.eyeHeight + 0.1, z);
          this.sound?.call('splash', 0, 0.3);
          if (say) this.hotbar?.flash('Ashore');
          return;
        }
      }
    }
    if (say) this.hotbar?.flash('Into the water');
  }

  // --- Sleep ------------------------------------------------------------------------

  #sleep(bed) {
    if (this.wildlife.animals.some((a) => a.hunting)) return this.hotbar?.flash("You can't sleep with danger this close");
    if (this.night < 0.5 && this.survival.energy > 50) return this.hotbar?.flash('You can only sleep at night, or when worn out');
    this.spawn = { x: bed.x, y: bed.y + 0.5 + this.controls.standingEye, z: bed.z };
    this.sleeping = { t: 0, bed, woke: false };
    this.sound?.call('rustle', 0, 0.4);
    this.#menu(true);
    this.dirty = true;
  }

  #sleepStep(dt) {
    const s = this.sleeping;
    s.t += dt;
    // Into the dark, a night passes, out of it.
    this.hud.sleepAmount = s.t < 1.2 ? s.t / 1.2 : s.t < 2.2 ? 1 : Math.max(0, 1 - (s.t - 2.2) / 1.2);
    if (s.t > 1.4 && !s.woke) {
      s.woke = true;
      this.sleepUntilMorning?.();
      this.survival.sleep();
      // (A great bed: you wake whole. A bedroll on the hard ground: stiff, not quite rested.)
      if (s.bed.type === 'fancyBed') (this.survival.health = Math.min(100, this.survival.health + 40)), this.hotbar?.flash('You wake in the great bed, rested and whole');
      else if (s.bed.type === 'bedroll') (this.survival.energy = Math.min(this.survival.energy, 75)), this.hotbar?.flash('You wake stiff from the hard ground');
      else if (s.bed.type === 'strawBed') (this.survival.energy = Math.min(this.survival.energy, 85)), this.hotbar?.flash('You wake on the straw, rested, if a little itchy');
      else this.hotbar?.flash('You wake, rested');
      // (Out in the rain all night, no roof over you: soaked, chilled, hardly rested.)
      if ((this.rainOnYou ?? 0) > 0.2) {
        const sv = this.survival;
        sv.wet = 1;
        sv.warmth = Math.max(5, sv.warmth - 35);
        sv.energy = Math.min(sv.energy, 50);
        sv.health = Math.max(5, sv.health - 6);
        this.hotbar?.flash('A night out in the rain, no roof over you: soaked and chilled to the bone');
      }
    }
    if (s.t > 3.4) {
      this.sleeping = null;
      this.hud.sleepAmount = 0;
      this.#menu(false);
    }
  }

  // --- Snares, and fires left burning ---------------------------------------------------

  #snares(dt) {
    this.snareWait -= dt;
    if (this.snareWait > 0) return;
    this.snareWait = 1;
    const cam = this.camera.position;
    for (const s of this.structures.list) {
      if (s.type !== 'snare' || s.caught) continue;
      // A rabbit running into it; or, left a while out of your way, one that did.
      const rabbit = this.wildlife.animals.find((a) => a.kind === 'rabbit' && a.alive && Math.hypot(a.x - s.x, a.z - s.z) < 1.3);
      const away = Math.hypot(s.x - cam.x, s.z - cam.z) > 30;
      if (rabbit || (away && Math.random() < 1 / 240)) {
        if (rabbit) rabbit.gone = true;
        s.caught = true;
        s.catchMesh.visible = true;
        this.dirty = true;
      }
    }
    // Fish traps: now and then a fish swims in (not when the water's iced over).
    for (const s of this.structures.list) {
      if (s.type !== 'fishTrap' || (s.caught || 0) >= 3 || (this.winter ?? 0) > 0.7) continue;
      if (Math.random() < 1 / 300) {
        s.caught = (s.caught || 0) + 1;
        s.catchMesh.visible = true;
        this.dirty = true;
      }
    }
    // A campfire left burning with nobody by it, in the dry: the grass may catch.
    for (const s of this.structures.list) {
      if (s.type !== 'campfire' || !s.lit) continue;
      const d = Math.hypot(s.x - cam.x, s.z - cam.z);
      s.alone = d > 30 ? (s.alone ?? 0) + 1 : 0;
      if (s.alone > 60 && this.dry > 0.5 && Math.random() < 1 / 90) {
        const a = rnd(0, 6.28);
        this.ignite?.(s.x + Math.cos(a) * 2, s.y, s.z + Math.sin(a) * 2);
        s.alone = 0;
      }
    }
  }

  // --- Each frame --------------------------------------------------------------------------

  /**
   * @param ctx { time, wind, light (Color), night, rain, snowing, day,
   *              winter, spring, autumn, summer, planPoint(origin, dir,
   *              reach) (where the ground is under the crosshair) }
   * Returns the extra lights (fires, a torch in your hand) for the torches' pool.
   */
  update(dt, ctx) {
    this.lastCtx = ctx; // (the weather, for striking a fire: see use)
    this.time += dt;
    this.night = ctx.night;
    this.winter = ctx.winter;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const p of this.pending) p.time -= dt;
    for (const p of this.pending.filter((p) => p.time <= 0)) p.fn();
    this.pending = this.pending.filter((p) => p.time > 0);
    const cam = this.camera.position;
    const ground = (x, z) => this.groundAt(x, z);
    // (The trees and bushes picked clean lately, nearest first: drawn without their fruit.)
    if (this.pickedAt?.size && (this.pickWait = (this.pickWait ?? 0) - dt) <= 0) {
      this.pickWait = 0.5;
      const near = [];
      for (const [key, p] of this.pickedAt) {
        if (this.time - (this.harvested.get(key) ?? -1e9) >= 900) this.pickedAt.delete(key);
        else near.push(p);
      }
      near.sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z));
      seasonUniforms.uPicked.value.forEach((v, k) => v.set(near[k]?.x ?? 1e9, near[k]?.z ?? 1e9));
    }
    this.items.update(dt, (x, z, y) => this.groundAt(x, z, y));
    // (The ruins you've been to: and the map's mark, once you're there.)
    // The land round you, filled in on your map.
    if (this.mode === 'survival') {
      const size = this.config.chunkSize ?? 128, cx = Math.floor(cam.x / size), cz = Math.floor(cam.z / size);
      if (cx !== this.exploredAt?.[0] || cz !== this.exploredAt?.[1]) {
        this.exploredAt = [cx, cz];
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const key = `${cx + dx},${cz + dz}`;
          if (!this.explored.has(key)) (this.explored.add(key), (this.dirty = true), (this.exploredVersion = (this.exploredVersion ?? 0) + 1));
        }
      }
    }
    this.ruinWait = (this.ruinWait ?? 0) - dt;
    if (this.ruinWait <= 0 && this.ruinsNear) {
      this.ruinWait = 2;
      for (const r of this.ruinsNear(cam.x, cam.z, 30)) {
        if (!this.ruinsSeen.has(r.key)) (this.ruinsSeen.add(r.key), (this.dirty = true));
        if (this.waypoint?.key === r.key) (this.waypoint = null), this.hotbar?.flash('The ruins the map showed');
      }
    }
    // (The burnt woods growing back.)
    this.regrowWait = (this.regrowWait ?? 0) - dt;
    if (this.regrowWait <= 0 && this.worldDay) {
      this.regrowWait = 5;
      if (this.felling.regrow(this.worldDay())) this.dirty = true;
    }
    this.felling.update(dt, ground, (x, y, z, size) => {
      const d = Math.hypot(x - cam.x, z - cam.z);
      this.sound?.call('treefall', 0, Math.min(1, 0.4 + size / 20) / (1 + d / 30));
    });
    this.#flyAll(dt);
    this.#flyGhosts(dt);
    const lights = this.structures.update(dt, ctx);
    const walking = this.walking;
    const i = this.hotbar.index;
    const held = this.inventory.slots[i];
    if (this.sleeping) this.#sleepStep(dt);
    this.#coops(dt);
    this.treeFinds.update(dt, this.camera, this.config.chunkSize, this.worldDays ?? 0, seasonUniforms.uSeasonTime.value, this.sound, (x, z) => this.panAt?.(x, z) ?? 0);
    this.#fishing(dt, held);
    this.#wind(dt, held);
    this.#snares(dt);
    if (this.drawing && !BOWS.has(held?.id)) this.drawing = null;

    // Warm by a fire? How hot and thirsty the country is, and how cold its winters.
    const heat = this.lastHeat;
    heat.wait -= dt;
    if (heat.wait <= 0) {
      heat.wait = 0.5;
      const g = this.generator();
      const w = g.getBiomeWeights(cam.x, cam.z, {});
      const erg = g.getFeatures(cam.x, cam.z).erg ?? 0;
      heat.heat = w.savanna * 1 + w.desert * 2.5 + erg * 0.5 + w.volcanic * 0.4;
      heat.seasonality = g.getSeasonality(cam.x, cam.z);
      this.dry = (w.savanna + 0.6 * w.temperate + w.desert * 0.3) * (1 - ctx.rain) * (1 - ctx.winter) * (0.4 + 0.6 * ctx.summer);
    }
    // Under a roof, with walls round you: out of the rain, out of the wind,
    // and a fire in there warms the whole of it.
    const shelter = this.structures.shelterAt(cam.x, cam.y - this.controls.eyeHeight, cam.z);
    // In a cave: out of the rain and the wind altogether (see Survival.coldness for its warmth).
    const cave = ctx.cave ?? null;
    if (cave !== null) (shelter.roof = 1), (shelter.walls = 1);
    const sheltered = shelter.roof * (0.35 + 0.65 * shelter.walls);
    this.sheltered = sheltered;
    this.rainOnYou = cave !== null ? 0 : (ctx.rain ?? 0) * (1 - shelter.roof); // (for a night slept out in it)
    const fire = Math.max(this.structures.warmthAt(cam.x, cam.y - this.controls.eyeHeight, cam.z), sheltered > 0.6 ? this.structures.warmthAt(cam.x, cam.y - this.controls.eyeHeight, cam.z, 4) : 0);
    // Out in the open desert sun at midday (no shade, no water on you): heatstroke, if you let yourself dry out.
    const exposed = walking && !this.controls.swimming && shelter.roof < 0.5 && heat.heat > 1.4 && ctx.day > 0.6 && ctx.rain < 0.2 ? (ctx.sun ?? 1) : 0;
    const jumped = this.controls.takeJumps();
    // What you carry weighs you down.
    const load = this.inventory.slots.reduce((n, s) => n + weightOf(s), 0) + weightOf(this.inventory.back);
    const heavy = Math.max(0, (load - LOAD - (this.mount ? 40 : 0)) / LOAD); // (a horse's saddlebags carry 40 kg more)
    this.controls.burden = Math.max(0.45, 1 - heavy * 0.5);
    this.controls.noSprint = heavy > 0.5 || this.survival.energy < 20;
    // The day of this life, the season, the longest yet (survival only).
    // A great beast you're fighting: its name and health, till it's dead (a
    // moment more) or you've been out of the fight ten seconds.
    const bf = this.bossFight;
    if (bf && bf.a.alive && !bf.a.gone && Math.hypot(bf.a.x - cam.x, bf.a.z - cam.z) < 40) bf.until = Math.max(bf.until, bf.a.hunting || bf.a.charging > 0 ? this.time + 10 : bf.until);
    if (bf && (!bf.a.alive || bf.a.gone)) bf.until = Math.min(bf.until, (bf.dead ??= this.time) + 3);
    if (bf && this.time < bf.until) this.hud.boss(bf.a.boss.name, bf.a.spider ? Math.max(0, bf.a.health / bf.a.maxHealth) : Wildlife.bossHealth(bf.a));
    else (this.bossFight = null), this.hud.boss(null);
    // Settling a wild horse (how calm it is), or riding one (its wind).
    const calming = this.wildlife.calming;
    if (this.mount) this.hud.meter('Your horse\'s wind', (this.mount.stamina ?? 100) / 100);
    else if (calming && !calming.a.tame && calming.calm > 0.02) this.hud.meter('The horse is settling', calming.calm);
    else if (this.breaking && this.time < this.breaking.until) this.hud.meter(this.breaking.label, this.breaking.frac);
    else this.hud.meter(null, null);
    this.hud.almanac(this.mode === 'survival' && this.survival.alive ? { day: Math.floor(this.age) + 1, season: ctx.season ?? '', longest: Math.max(longestRun(), Math.floor(this.age)) } : null);
    const e = {
      active: walking && this.survival.alive && !this.sleeping,
      moving: this.controls.moving, sprinting: this.controls.sprinting, swimming: this.controls.swimming, jumped, load: heavy,
      heat: heat.heat, day: ctx.day, coat: this.inventory.worn ? ITEMS[this.inventory.worn.id]?.warmth ?? 0.3 : 0, fire, inFire: walking && (this.structures.inFire(cam.x, cam.z) || (this.fireHeat?.(cam.x, cam.y - this.controls.eyeHeight, cam.z) ?? 0) > 0.3),
      winter: ctx.winter, spring: ctx.spring, autumn: ctx.autumn, summer: ctx.summer,
      seasonality: heat.seasonality, altitude: cam.y - this.controls.eyeHeight, night: ctx.night, rain: ctx.rain * (1 - shelter.roof), snowing: ctx.snowing && shelter.roof < 0.5,
      shelter: sheltered, exposed, storm: cave !== null ? 0 : ctx.blizzard ?? 0, dust: (ctx.dust ?? 0) * (1 - sheltered),
      hotSpring: this.#inHotSpring(cam),
      cave, inLava: !!ctx.lava,
    };
    if (cave !== null) {
      // (Deep in the rock it's the same all year: cool in the plain caves,
      // mild where the moss grows, bitter in the ice, hot as an oven by the lava.)
      e.rain = 0;
      e.snowing = false;
      e.heat = cave === 2 ? 2.2 : 0;
    }
    // (In creative there's no hunger, thirst or cold: you stay as you are.)
    if (this.mode !== 'creative') this.survival.update(dt, e);
    this.#progressStep(dt, e);
    if (this.mode !== 'survival') this.hud.skillsButton(null);
    if (this.survival.retched) {
      this.survival.retched = false;
      this.sound?.call('hurt', 0, 0.4);
      this.hotbar?.flash('You are sick');
    }
    // Food spoils (not in a chest; jerky keeps).
    this.spoilWait = (this.spoilWait ?? 0) - dt;
    if (this.spoilWait <= 0) {
      const rotted = this.inventory.spoil(5);
      this.items.spoil(5);
      // (In a chest food keeps three times as long; in a root cellar, for good.)
      for (const st of this.structures.list) if (st.type === 'chest') st.contents.spoil(5 / 3);
      this.spoilWait = 5;
      if (rotted.length) this.hotbar?.flash(`${rotted[0]} has gone off`);
    }
    // (However it came: hunger or cold here, or a bite, a fall, a blow since the last frame.)
    if (!this.survival.alive && !this.dead) this.#die();

    // What's under the crosshair: what Q would do, and where a thing to be built would go.
    let prompt = null;
    this.plan = null;
    if (walking && this.survival.alive && !this.hud.busy && !this.riding) {
      const origin = cam, direction = this.camera.getWorldDirection(dir.clone());
      const t = this.#target({ origin, direction });
      const item = held && ITEMS[held.id];
      const placing = item?.place === 'caveLamp' ? 'torch' : item?.place ?? (held?.id === 'hoe' ? 'plot' : null);
      if (placing === 'logBridge' || placing === 'ropeBridge') {
        this.plan = this.#bridgePlan(placing);
        this.structures.preview(null);
        prompt = this.plan.ok ? `<kbd>Click</kbd> Lay the ${placing === 'logBridge' ? 'log' : 'rope'} bridge across (${Math.round(this.plan.len)} m)` : this.plan.why;
      } else if (placing === 'rope') {
        // (Worked out again only now and then, or as you move or turn: it
        // feels along the ground a good way down.)
        const key = `${Math.round(cam.x * 5)},${Math.round(cam.y * 5)},${Math.round(cam.z * 5)},${Math.round(this.controls.euler.y * 20)}`;
        if (this.plan?.type !== 'rope' || (key !== this.ropeKey && this.time > (this.ropeAt ?? 0) + 0.25) || this.time > (this.ropeAt ?? 0) + 1) {
          this.plan = this.#ropePlan();
          this.ropeKey = key;
          this.ropeAt = this.time;
        }
        this.structures.preview(null);
        prompt = this.plan.ok ? `<kbd>Click</kbd> Let the rope down (${Math.round(this.plan.len)} m)` : null;
      } else if (placing && placing !== 'torch') {
        const at = ctx.planPoint(origin, direction, placing === 'plot' ? REACH + 1 : 6.5) ?? v.copy(origin).addScaledVector(direction.clone().setY(0).normalize(), 3);
        const yaw = this.controls.euler.y + (['wall', 'gate', 'fence', 'fenceGate', 'stoneWall', 'stoneFence', 'woodWindow', 'stoneWindow', 'logWall', 'plankWall', 'cutStoneWall', 'logWindow', 'logDoor', 'plankWindow', 'plankDoor', 'stoneDoor', 'cutWindow', 'cutDoor'].includes(placing) ? Math.PI : 0);
        this.plan = this.structures.plan(placing, at, yaw, ground, (x, z) => this.waterAt(x, z)?.level ?? null, (x, z, r) => this.#inTheWay(x, z, r));
        const onPlot = placing === 'plot' && t?.kind === 'structure' && t.structure.type === 'plot';
        this.structures.preview(onPlot ? null : this.plan);
        if (!onPlot) prompt = this.plan.ok ? `<kbd>Click</kbd> ${placing === 'plot' ? 'Dig a plot' : `Build ${item.name.toLowerCase()}`}` : this.plan.why;
      } else this.structures.preview(null);
      if (!prompt && t) prompt = `<kbd>Q</kbd> ${t.text}`;
      // Crouched, looking at the ground: the tracks there, read (the better your tracking, the older the tracks you can make out).
      if (!prompt && this.controls.crouch && this.readTracks) {
        const hit = this.solidHit?.(origin, direction, 8);
        const lvl = this.skillLevel?.('tracking') ?? 0;
        const tr = hit && this.readTracks(hit.point.x, hit.point.z, 1.5 + lvl * 0.4);
        if (tr && tr.age < 120 + lvl * 90) {
          const view = this.controls.euler.y, way = Math.atan2(Math.sin(tr.heading - (view + Math.PI)), Math.cos(tr.heading - (view + Math.PI)));
          const where = Math.abs(way) < 0.6 ? 'on ahead of you' : Math.abs(way) > 2.5 ? 'back the way you came' : way > 0 ? 'off to your left' : 'off to your right';
          const age = tr.age < 40 ? 'fresh' : tr.age < 150 ? 'a few minutes old' : 'old';
          prompt = `Tracks: ${NAMES[tr.kind] ?? tr.kind}, ${age}, going ${where}`;
          if (this.time > (this.trackedAt ?? 0) + 6) (this.trackedAt = this.time), this.skill?.('tracking', 1);
        }
      }
      if (!prompt && held) {
        if (AXES[held.id] && (this.felling.pickFallen(origin, direction, REACH) || this.trees.pick(origin, direction, REACH) || this.shrooms?.pick(origin, direction, REACH))) prompt = '<kbd>Click</kbd> Chop';
        if (PICKS[held.id] && this.#boulderAlong(origin, direction, REACH)) prompt = '<kbd>Click</kbd> Break rock';
      }
    } else this.structures.preview(null);
    if (this.riding) prompt = '<kbd>W</kbd> Paddle · <kbd>Q</kbd> Get off';
    if (this.mount) prompt = '<kbd>W</kbd> Ride · <kbd>Shift</kbd> Gallop · <kbd>Space</kbd> Jump · <kbd>Q</kbd> Get down';
    if (this.climbing) prompt = '<kbd>W</kbd> Climb · <kbd>S</kbd> Down · <kbd>Q</kbd> Let go';
    this.hud.stations = { anvil: !!this.structures.nearest('anvil', cam.x, cam.z, 5) };
    this.hud.prompt(prompt);
    this.hud.draw(this.drawing ? Math.min(1, (this.time - this.drawing.since) / 0.9) : null);
    // (Which way the wind blows, as you look.)
    const w = this.wind?.() ?? { x: 0, z: 0 }, yaw = this.controls.euler.y;
    const along = -w.x * Math.sin(yaw) - w.z * Math.cos(yaw), across = w.x * Math.cos(yaw) - w.z * Math.sin(yaw);
    this.hud.update(this.survival, this.inventory, { active: walking, load, heavy, wind: Math.atan2(across, along), sheltered: sheltered > 0.5, heatstroke: this.survival.hot > 90 && this.survival.thirst < 40, blizzard: (ctx.blizzard ?? 0) > 0.3 && walking, hotSpring: e.hotSpring });

    // Held in your hand.
    this.#drawHeld(dt, held, walking);
    if (TORCHES.has(held?.id) && walking) lights.push(held.id === 'coalTorch' ? { x: cam.x, y: cam.y - 0.2, z: cam.z, strength: 44, reach: 42 } : { x: cam.x, y: cam.y - 0.2, z: cam.z, strength: 22, reach: 22 });

    // Saving now and then.
    this.saveWait -= dt;
    if (this.saveWait <= 0) {
      this.saveWait = 10;
      if (this.wildlife.animals.some((a) => a.tame)) this.dirty = true; // (where your sheep have got to)
      if (this.dirty && walking) this.save();
    }
    return lights;
  }

  /** You've been hurt (by a wolf, a bear, a fall...). */
  hurt(amount, cause, { bite = false } = {}) {
    if (!this.walking || this.sleeping || this.mode === 'creative') return;
    // Armour takes the worst of a bite or a swipe (and wears for it).
    const armour = this.inventory.armour;
    if (bite && armour) {
      amount *= ITEMS[armour.id]?.protect ?? 0.55;
      armour.dur -= 1;
      if (armour.dur <= 0) {
        this.inventory.armour = null;
        this.hotbar?.flash('Your armour is torn to pieces');
      }
      this.inventory.changed();
    }
    this.survival.hurt(amount, cause);
    if (bite && Math.random() < (armour ? (armour.id === 'steelArmour' ? 0.05 : 0.15) : 0.4)) {
      this.survival.bleed(60 + Math.random() * 60);
      this.hotbar?.flash('You are bleeding: bandage it');
    }
    this.sound?.call('hurt', 0, Math.min(1, 0.4 + amount / 30));
    this.shake = Math.min(1, (this.shake ?? 0) + amount / 25);
  }

  /**
   * How much tall grass hides you at (x, z) (0..1): the long grass of the
   * plains, the savanna and the parkland, and its rank, tall patches.
   * (Remembered a moment: asked for every animal, every frame.)
   */
  #grassCover(x, z) {
    const c = this._cover;
    if (c && Math.abs(c.x - x) < 1 && Math.abs(c.z - z) < 1) return c.v;
    const g = this.generator();
    const w = g.getBiomeWeights(x, z, {});
    const tallLand = Math.max(g.getPlainness(x, z), 0.9 * w.savanna, w.parkland);
    const n = g.grassNoise.fbm(x * 0.006 + 50, z * 0.006 - 50, 2);
    const tall = Math.min(1, tallLand + 0.8 * Math.max(0, Math.min(1, (n - 0.08) / 0.3)));
    const v = tall * Math.min(1, g.getGrassDensity(x, z) * 1.3);
    this._cover = { x, z, v };
    return v;
  }

  /** For the animals: where you are and what you're doing. */
  get player() {
    const p = this.camera.position, c = this.controls;
    return {
      x: p.x, y: p.y, z: p.z, mode: c.mode, crouch: c.crouch, moving: c.moving, sprint: c.sprinting, sneak: this.skillLevel('sneaking'), alive: this.survival.alive && !this.riding && !this.climbing,
      cover: Math.min(1, this.#grassCover(p.x, p.z) + (ITEMS[this.inventory.worn?.id]?.hush ? 0.35 : 0)),
      lure: ['wheat', 'seedWheat', 'seedCorn', 'corn'].includes(this.inventory.slots[this.hotbar?.index ?? 0]?.id),
      torch: TORCHES.has(this.inventory.slots[this.hotbar?.index ?? 0]?.id),
      food: !!HORSE_FOOD[this.inventory.slots[this.hotbar?.index ?? 0]?.id],
      damage: (amount, kind, a) => {
        if (a?.boss) this.#bossFight(a);
        this.hurt(amount, a?.boss ? a.boss.name : ATTACKERS[kind] ?? `a ${NAMES[kind] ?? kind}`, { bite: kind !== 'snake' && kind !== 'scorpion' });
      },
      poison: (kind = 'snake') => {
        this.survival.poison();
        this.hotbar?.flash(kind === 'scorpion' ? 'Stung by a scorpion: the venom burns' : 'Bitten by a rattlesnake: the venom burns');
      },
    };
  }

  #die() {
    this.dead = true;
    // What you carried lies where you fell.
    this.#getOff();
    this.#dismount();
    this.#reel();
    const p = this.camera.position;
    this.inventory.slots.forEach((s, i) => {
      if (!s) return;
      const a = (i / 9) * Math.PI * 2;
      this.items.drop(s, p.x + Math.cos(a) * 0.8, p.y, p.z + Math.sin(a) * 0.8);
    });
    this.inventory.clear();
    // In survival, a life is over for good (online, you start a new one in
    // the same world). The days it lasted, and the longest yet. The world is
    // told first, so its save is gone before the screen shows: closing the
    // tab now can't bring you back.
    const survival = this.mode === 'survival';
    const days = Math.floor(this.age);
    const longest = survival ? recordRun(days) : null;
    const hardcore = survival && !this.online();
    this.onDeath?.({ days, cause: this.survival.cause, hardcore, survival });
    if (hardcore) this.saveKey = null; // (nothing more of this life is saved)
    this.hud.death({ cause: this.survival.cause, days: survival ? days : null, longest, button: hardcore ? 'leave' : survival ? 'new' : 'again' });
    this.#menu(true);
    this.controls.frozen = true;
    this.dirty = true;
  }

  respawn() {
    // (Online in survival: a new life, someone new, from the world's start.)
    const fresh = this.mode === 'survival';
    if (fresh) this.spawn = null;
    if (this.spawn) this.camera.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
    this.controls.velocityY = 0;
    this.controls.softLanding = true;
    this.newLife();
    if (fresh) this.onNewLife?.();
    this.#menu(false);
  }

  /** Time going by (game days), for how long this life has lasted. */
  passDays(days) {
    this.worldDays = (this.worldDays ?? 0) + days; // (the world's own days, for what grows back)
    if (!this.survival.alive || this.mode !== 'survival') return;
    const before = this.age;
    this.age += days;
    // (Quietly, at a week, a month and a year.)
    const year = 4 * (this.config.daysPerSeason ?? 2);
    for (const [at, text] of [[7, 'Seven days. You are still here.'], [30, 'Thirty days in the wild.'], [year, 'A year has turned. You have seen every season.']]) {
      if (before < at && this.age >= at) this.hud.toast(text);
    }
  }

  // --- What's in your hand, drawn in front of you -----------------------------------------

  #heldModel() {
    this.hand = new Group(); // (where your hand is: bobbing as you walk)
    this.hand.name = 'held item';
    this.camera.add(this.hand);
    this.grip = new Group(); // (turned about your grip, to swing)
    this.hand.add(this.grip);
    // (Solid: depth-tested against itself, so its far side never shows
    // through; drawn into the nearest sliver of the depth range, so it's
    // always in front of the world, never sinking into a wall.)
    this.handMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.nearest = {
      before: (renderer) => renderer.getContext().depthRange(0, 0.01),
      after: (renderer) => renderer.getContext().depthRange(0, 1),
    };
    this.handFlame = new Mesh(new OctahedronGeometry(0.06, 0), new MeshBasicMaterial({ color: 0xffa040, depthTest: false, transparent: true }));
    this.handFlame.scale.set(1, 1.7, 1);
    this.heldId = null;
    this.anim = null;
  }

  // What's standing at (x, z), within `r`, that nothing can be built over: why not, or null.
  #inTheWay(x, z, r) {
    const what = this.trees.solidAt?.(x, z, r, this.config.chunkSize);
    if (what === 'tree') return 'A tree is in the way';
    if (what === 'bush') return 'A bush is in the way';
    const g = this.chunks.groundHeightAt(x, z);
    if (Number.isFinite(g)) {
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        if (this.rocks?.surfaceAt(x + dx, z + dz) > g + 0.15) return 'A rock is in the way';
        if (this.logs?.surfaceAt(x + dx, z + dz) > g + 0.1) return 'A log is in the way';
      }
    }
    for (const st of this.felling.stumps) if (Math.hypot(st.m[12] - x, st.m[14] - z) < r + 0.55) return 'A stump is in the way';
    return null;
  }

  #animate(kind, duration) {
    this.anim = { kind, t: 0, duration };
    this.anims = (this.anims ?? 0) + 1; // (online: a new one, for the others to see: see pose)
  }

  /**
   * How you stand, for the others to see online: what's in your hand (its
   * id, or null), what you're doing with it (chop, throw, thrust, cast,
   * kick, use, loose; `n`: which one, so two chops running are two) and
   * how far a bow's drawn (0..1).
   */
  pose() {
    const held = this.heldId;
    const draw = this.drawing && BOWS.has(held) ? Math.min(1, (this.time - this.drawing.since) / 0.9) : 0;
    return { held, act: this.anim?.kind ?? null, n: this.anims ?? 0, draw };
  }

  /** Where an item sits in a hand (`mesh` of it, in the hand's frame: forward is -z, up +y). */
  static holdPose(id, mesh) {
    if (SWORDS.has(id)) {
      // (Held out in front, the blade tipped forward.)
      mesh.rotation.set(-0.75, Math.PI / 2, 0);
      mesh.scale.setScalar(0.5);
      mesh.position.set(0, -0.12, 0);
    } else if (AXES[id] || PICKS[id]) {
      // (Blade forward, the handle in your fist near its end.)
      mesh.rotation.set(0, Math.PI / 2, 0);
      mesh.scale.setScalar(0.62);
      mesh.position.set(0, -0.06, 0);
    } else if (SPEARS.has(id)) mesh.rotation.set(0, Math.PI, 0), mesh.scale.setScalar(0.7), mesh.position.set(0, 0, -0.2);
    else if (BOWS.has(id)) mesh.rotation.set(0, 0, 0.25), mesh.scale.setScalar(0.75), mesh.position.set(-0.12, 0.1, -0.05);
    else if (id === 'crossbow') mesh.rotation.set(0, Math.PI, 0), mesh.scale.setScalar(0.9), mesh.position.set(-0.14, 0.08, -0.12);
    else if (id === 'fishingRod') mesh.rotation.set(-1.05, 0, 0), mesh.scale.setScalar(0.75), mesh.position.set(0, -0.05, 0);
    else if (TORCHES.has(id)) mesh.rotation.set(0, 0, Math.PI / 2 - 0.2), mesh.scale.setScalar(0.7);
    else if (id === 'log') mesh.rotation.set(0, Math.PI / 2 - 0.25, 0.15), mesh.scale.setScalar(0.85), mesh.position.set(0.05, 0.22, 0.25); // (on your shoulder)
    else {
      // (Anything else held small enough to sit in your hand.)
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      mesh.scale.setScalar(Math.min(0.8, 0.14 / mesh.geometry.boundingSphere.radius));
    }
  }

  #drawHeld(dt, held, walking) {
    const id = walking && this.survival.alive && !this.hud.busy ? held?.id ?? null : null;
    if (id !== this.heldId) {
      this.heldId = id;
      this.grip.clear();
      this.rodTip = null;
      this.bowString = null;
      if (id) {
        // (The bow without its string: that's drawn back, below.)
        const geometry = TORCHES.has(id) ? this.items.model('stick') : BOWS.has(id) ? (this.bareBow ??= bowModel(false)) : this.items.model(id);
        const mesh = new Mesh(geometry, this.handMaterial);
        mesh.renderOrder = 999;
        mesh.onBeforeRender = this.nearest.before;
        mesh.onAfterRender = this.nearest.after;
        this.handFlame.renderOrder = 1000;
        // Each held its own way (in your hand's frame: forward is -z).
        Game.holdPose(id, mesh);
        if (id === 'fishingRod') {
          this.rodTip = new Group();
          this.rodTip.position.set(0, 1.8, 0);
          mesh.add(this.rodTip);
        } else if (TORCHES.has(id)) {
          this.handFlame.position.set(0.02, 0.33, 0);
          this.grip.add(this.handFlame);
        } else if (BOWS.has(id)) {
          // Its string, in two (drawn back to a point as you draw), and an
          // arrow on it while you do.
          const near = (m) => ((m.renderOrder = 999), (m.onBeforeRender = this.nearest.before), (m.onAfterRender = this.nearest.after), mesh.add(m), m);
          this.stringMaterial ??= new MeshBasicMaterial({ color: 0xe8e0cc });
          this.stringGeometry ??= new CylinderGeometry(0.005, 0.005, 1, 3).translate(0, 0.5, 0);
          this.bowString = [0, 1].map(() => near(new Mesh(this.stringGeometry, this.stringMaterial)));
          this.nocked = near(new Mesh(this.items.model('arrow'), this.handMaterial));
          this.nocked.rotation.set(0, Math.PI, 0); // (its point forward)
        }
        this.grip.add(mesh);
      }
    }
    // Bobbing as you walk.
    this.bob = (this.bob ?? 0) + dt * (this.controls.moving ? (this.controls.sprinting ? 13 : 8) : 0);
    const low = this.controls.crouch ? 0.03 : 0;
    const heavy = id === 'log' ? 0.05 : 0;
    this.hand.position.set(0.3 + Math.sin(this.bob) * 0.015, -0.33 - Math.abs(Math.cos(this.bob)) * (0.02 + heavy) - low, -0.62);
    // Resting pose, and the swing on top of it.
    let rx = AXES[id] || PICKS[id] ? -0.25 : 0, ry = 0, rz = AXES[id] || PICKS[id] ? 0.12 : 0, px = 0, py = 0, pz = 0;
    const a = this.anim;
    if (a) {
      a.t += dt;
      const u = Math.min(1, a.t / a.duration);
      if (a.kind === 'chop') {
        // Wound up back over the shoulder (a beat at the top), a hard
        // stroke down and across; biting into the wood with a jolt, it
        // sticks a moment, and is worked free and brought back.
        const back = a.bite ? 0.74 : 0.58;
        let lift;
        if (u < 0.42) lift = Math.sin((u / 0.42) * Math.PI / 2);
        else if (u < 0.5) lift = 1 + 0.06 * Math.sin(((u - 0.42) / 0.08) * Math.PI);
        else if (u < 0.58) lift = 1 - ((u - 0.5) / 0.08) * 1.9;
        else if (u < back) lift = -0.9 + 0.05 * Math.sin((u - 0.58) * 120) * ((back - u) / 0.16);
        else lift = -0.9 * (1 - (u - back) / (1 - back));
        rx += lift * 1.2;
        rz += lift * -0.35;
        ry += Math.min(0, lift) * 0.25; // (across you)
        px -= Math.min(0, lift) * 0.06;
        py += Math.max(0, lift) * 0.14;
        pz += Math.max(0, lift) * 0.12;
      } else if (a.kind === 'thrust' || a.kind === 'throw') {
        const out = u < 0.3 ? -u / 0.3 * 0.12 : u < 0.5 ? -0.12 + ((u - 0.3) / 0.2) * 0.5 : 0.38 * (1 - (u - 0.5) / 0.5);
        pz -= out;
        if (a.kind === 'throw') py += out * 0.4;
      } else if (a.kind === 'cast') {
        rx += u < 0.4 ? (u / 0.4) * 0.9 : 0.9 - ((u - 0.4) / 0.6) * 1.3;
      } else if (a.kind === 'loose') {
        // (The string snapping forward, the bow jumping in your hand.)
        rx += Math.sin(u * Math.PI) * 0.12;
        pz -= Math.sin(u * Math.PI) * 0.03;
      } else if (a.kind === 'kick') {
        rx -= Math.sin(u * Math.PI) * 0.25;
        pz += Math.sin(u * Math.PI) * 0.06;
      } else py += Math.sin(u * Math.PI) * 0.08;
      if (u >= 1) this.anim = null;
    }
    if (BOWS.has(id) && this.bowString) {
      // Drawing: the bow brought up in front of you and stood upright, the
      // arrow on the string and pulled back to your cheek; held at full
      // draw, your arm starts to tremble.
      const held = this.drawing ? this.time - this.drawing.since : 0;
      const draw = Math.min(1, held / 0.9), e = draw * draw * (3 - 2 * draw);
      px -= 0.25 * e; // (just left of your aim, the arrow pointing at it)
      py += 0.06 * e;
      pz += 0.03 * e;
      rz -= 0.22 * e;
      if (held > 0.9) {
        const shake = Math.min(0.012, 0.002 + (held - 0.9) * 0.004);
        px += Math.sin(this.time * 23) * shake;
        py += Math.sin(this.time * 31 + 1) * shake * 0.8;
      }
      const nock = 0.055 + 0.42 * e;
      for (const [k, m] of this.bowString.entries()) {
        const ty = k ? -0.375 : 0.375;
        v.set(0, -ty, nock - 0.048);
        m.position.set(0, ty, 0.048);
        m.scale.set(1, v.length(), 1);
        m.quaternion.setFromUnitVectors(UP, v.normalize());
      }
      this.nocked.visible = !!this.drawing;
      this.nocked.position.set(0.02, 0, nock - 0.375);
    }
    if (this.winding && id === 'crossbow') (rx += 0.7 * Math.min(1, this.winding.t * 4)), (py -= 0.08), (pz += 0.04 * Math.sin(this.winding.t * 14));
    this.grip.rotation.set(rx, ry, rz);
    this.grip.position.set(px, py, pz);
    if (TORCHES.has(this.heldId)) {
      const f = 0.85 + 0.15 * Math.sin(this.time * 17) * Math.sin(this.time * 7);
      this.handFlame.scale.set(f, 1.7 * f, f);
    }
    // The jolt of being hit.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.hand.position.x += Math.sin(this.time * 40) * 0.04 * this.shake;
      this.hand.position.y -= 0.08 * this.shake;
    }
  }

  /**
   * The light the hunters (wolves, bears, a cougar) won't come into: lit
   * campfires and furnaces, lit torches, a torch in your hand. [{ x, z, r }]
   */
  fearLights() {
    const out = [];
    for (const s of this.structures.list) if (s.lit) out.push({ x: s.x, z: s.z, r: s.type === 'furnace' ? 7 : 10 });
    for (const t of this.torches?.torches ?? []) if (t.lit) out.push({ x: t.point.x, z: t.point.z, r: 7 });
    const held = this.inventory.slots[this.hotbar?.index ?? 0];
    if (TORCHES.has(held?.id) && this.walking && this.survival.alive) out.push({ x: this.camera.position.x, z: this.camera.position.z, r: 8 });
    return out;
  }

  /** The food at your camp a bear might come for in the night: chests with food in them, racks with meat on. */
  caches() {
    return this.structures.list
      .filter((s) => (s.type === 'chest' && s.contents.slots.some((st) => st && ITEMS[st.id].food)) || (s.type === 'dryingRack' && s.jobs.length))
      .map((s) => ({ x: s.x, z: s.z, s }));
  }

  /** A bear gets into one: the food's gone. Returns whether there was any. */
  raid(c) {
    const s = c.s;
    let took = false;
    if (s.type === 'chest') {
      s.contents.slots.forEach((st, k) => {
        if (st && ITEMS[st.id].food) (s.contents.slots[k] = null), (took = true);
      });
      if (took) s.contents.changed?.();
    } else if (s.jobs?.length) (s.jobs.length = 0), (took = true), this.structures.onChange?.();
    if (took) {
      this.dirty = true;
      if (Math.hypot(s.x - this.camera.position.x, s.z - this.camera.position.z) < 60) {
        this.sound?.call('crash', 0, 0.6);
        this.hotbar?.flash('A bear is into your stores!');
      }
    }
    return took;
  }

  /**
   * A chest in a ruin (see RuinLayer): set there, full of what was left,
   * the first time you come near it; there for good after (opened or not).
   */
  ruinChest(c) {
    if (this.ruinChests.has(c.key) || this.structures.list.some((s) => s.ruinKey === c.key)) return;
    this.ruinChests.add(c.key);
    if (c.altar) {
      // The Lost Keep's altar (see #offer).
      const s = this.structures.build({ type: 'keepAltar', x: c.x, y: c.y, z: c.z, rot: c.rot, tilt: null }, { ruinKey: c.key, offered: [] });
      s.ruinKey = c.key;
      this.dirty = true;
      return;
    }
    if (c.wreck) {
      // A wrecked ship's sea chest: rope, iron, a cutlass, salted stores, a little gold.
      const contents = [];
      const roll = (id, lo, hi, chance) => Math.random() < chance && contents.push(Inventory.stack(id, lo + Math.floor(Math.random() * (hi - lo + 1))));
      roll('rope', 2, 5, 0.9);
      roll('ironBar', 1, 3, 0.7);
      roll('saltedFish', 2, 4, 0.6);
      roll('salt', 2, 5, 0.6);
      roll('goldBar', 1, 2, 0.35);
      roll('oldSword', 1, 1, 0.3);
      roll('oldMap', 1, 1, 0.4);
      roll('deerSkin', 1, 3, 0.4);
      roll('pot', 1, 1, 0.3);
      roll('coalTorch', 2, 4, 0.4);
      if (!contents.length) contents.push(Inventory.stack('rope', 3));
      const s = this.structures.build({ type: 'chest', x: c.x, y: c.y, z: c.z, rot: c.rot, tilt: null }, { contents: contents.slice(0, 10), ruinKey: c.key });
      s.ruinKey = c.key;
      this.dirty = true;
      return;
    }
    if (c.heart) {
      // The heart of the Lost Keep: the best of everything.
      const contents = [['goldBar', 6], ['steelBar', 6], ['oldSword', 1], ['crystal', 6], ['forgedPickaxe', 1], ['steelArmour', 1], ['smokedMeat', 6], ['coalTorch', 6]].map(([id, n]) => Inventory.stack(id, n));
      const s = this.structures.build({ type: 'chest', x: c.x, y: c.y, z: c.z, rot: c.rot, tilt: null }, { contents, ruinKey: c.key });
      s.ruinKey = c.key;
      this.dirty = true;
      return;
    }
    const contents = [];
    const room = (st) => contents.length < 10 && contents.push(st);
    for (const [id, lo, hi, chance] of RUIN_LOOT) if (Math.random() < chance * (c.best ? 1.4 : 1)) room(Inventory.stack(id, lo + Math.floor(Math.random() * (hi - lo + 1))));
    for (const [id, low, best] of RUIN_RARE) if (Math.random() < (c.best ? best : low)) room(Inventory.stack(id, 1));
    if (!contents.length) room(Inventory.stack('arrow', 5));
    const s = this.structures.build({ type: 'chest', x: c.x, y: c.y, z: c.z, rot: c.rot, tilt: null }, { contents, ruinKey: c.key });
    s.ruinKey = c.key;
    this.dirty = true;
  }

  /**
   * At the Lost Keep's altar: every trophy you carry that's still wanted is
   * set in its socket. With the last of them, the sealed gate opens.
   */
  #offer(s) {
    if (s.offered.length >= RELICS.length) return this.hotbar?.flash('Every socket is filled: the heart of the Keep is yours');
    const given = RELICS.filter((id) => !s.offered.includes(id) && this.inventory.count(id) > 0);
    for (const id of given) {
      this.inventory.remove(id, 1);
      s.offered.push(id);
    }
    this.structures.showOffered(s);
    this.dirty = true;
    const missing = RELICS.filter((id) => !s.offered.includes(id));
    if (!given.length) return this.hotbar?.flash(`It wants the trophies of the great beasts. Still wanted: ${missing.map((id) => ITEMS[id].name).join(', ')}`);
    this.sound?.call('craft', 0, 0.6);
    if (missing.length) return this.hotbar?.flash(`Set in the altar: ${given.map((id) => ITEMS[id].name).join(', ')}. ${missing.length} still wanted`);
    // The last: the stones blaze up, and out of the altar's foot, the heart of the Keep.
    this.keep.open = true;
    this.onKeep?.(true);
    this.sound?.call('treefall', 0, 1);
    const bx = Math.cos(s.rot), bz = -Math.sin(s.rot);
    this.ruinChest({ key: 'keep:heart', heart: true, x: s.x + bx * 1.8, y: s.y, z: s.z + bz * 1.8, rot: s.rot });
    this.hud.toast('The heart of the Lost Keep');
    this.#won();
    return this.hotbar?.flash('The stones blaze up one by one, and a chest rises beside the altar');
  }

  // Every trophy set at the top of the Lost Keep: the end of the long road (play goes on).
  #won() {
    if (this.keep.won) return;
    this.keep.won = true;
    this.dirty = true;
    this.hud.won?.({ days: Math.floor(this.age ?? 0), bosses: Object.keys(this.wildlife.bossDeaths ?? {}).length });
    this.hud.onWonClose = () => this.#menu(this.hud.busy);
  }

  // An old map: it shows where the nearest ruin you've not been to lies.
  #readMap(i) {
    const p = this.camera.position;
    const sites = (this.ruinsNear?.(p.x, p.z, 2500) ?? []).filter((r) => !r.keep && !this.ruinsSeen.has(r.key) && Math.hypot(r.x - p.x, r.z - p.z) > 40);
    if (!sites.length) return this.hotbar?.flash('The map is too faded to make out');
    sites.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const r = sites[0], d = Math.hypot(r.x - p.x, r.z - p.z);
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const a = Math.atan2(r.x - p.x, -(r.z - p.z));
    const way = dirs[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
    this.waypoint = { x: r.x, z: r.z, key: r.key };
    this.inventory.take(i);
    this.cooldown = 0.6;
    this.sound?.call('pickup', 0, 0.4);
    this.dirty = true;
    // And in its corner, in another hand, where the Lost Keep lies: rough
    // at first, closer with every old map read.
    const keep = this.keepAt?.();
    let more = '';
    if (keep && !this.keep.open) {
      this.keep.clues = (this.keep.clues ?? 0) + 1;
      const r2 = [700, 300, 0][Math.min(2, this.keep.clues - 1)], a2 = hashOf(this.keep.clues) * Math.PI * 2;
      this.keep.mark = { x: keep.x + Math.cos(a2) * r2 * 0.6, z: keep.z + Math.sin(a2) * r2 * 0.6, r: r2 };
      more = r2 ? ` In its corner, in an older hand, the Lost Keep, somewhere within ${r2} m of a mark` : ' In its corner, the Lost Keep, marked plain';
    }
    return this.hotbar?.flash(`The map marks ruins ${d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`} to the ${way} (on your map).${more}`);
  }

  /** How near the nearest lit fire is (for its crackle). */
  fireNear() {
    return this.structures.nearestFire(this.camera.position.x, this.camera.position.z);
  }
}
