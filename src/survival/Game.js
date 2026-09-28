import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, Vector3 } from 'three';
import { seasonUniforms } from '../render/Seasons.js';
import { Felling } from './Felling.js';
import { GroundItems } from './GroundItems.js';
import { Hud } from './Hud.js';
import { Inventory } from './Inventory.js';
import { ITEMS, RECIPES, stackOf, weightOf } from './items.js';
import { bobberModel } from './models.js';
import { Structures } from './Structures.js';
import { Survival } from './Survival.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const v = new Vector3(), dir = new Vector3(), q = new Quaternion(), FORWARD = new Vector3(0, 0, 1);

// How far you can reach, on foot.
const REACH = 3;
const FRUIT = { raspberryBush: 'berries', blueberryBush: 'berries', appleTree: 'apple' };
const NAMES = { deer: 'deer', bison: 'bison', blackBear: 'black bear', grizzly: 'grizzly bear', wolf: 'wolf', wolfPup: 'wolf pup', coyote: 'coyote', fox: 'fox', rabbit: 'rabbit', sheep: 'sheep', songbird: 'bird', starling: 'starling', crow: 'crow', gull: 'gull', hawk: 'hawk' };
const ATTACKERS = { wolf: 'a wolf', grizzly: 'a grizzly bear', blackBear: 'a black bear' };
const AXES = { axe: 1, steelAxe: 2 };
const PICKS = { pickaxe: 1, steelPickaxe: 1.6 };
const SPEARS = new Set(['spear', 'steelSpear']);
const LIGHTERS = new Set(['flintSteel', 'fineFlintSteel']);
const VEG = ['berries', 'mushroom', 'apple'];
const MEATS = ['rawMeat', 'cookedMeat', 'rawFish', 'cookedFish'];
// How long things take: meat on the fire a minute; ore in the furnace half
// a minute; meat on the drying rack three; a waterskin coming to the boil.
const TIMES = { cook: 60, smelt: 30, dry: 180, boil: 20, stew: 60 };
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
 * it), right-click to throw a spear (or the same as E otherwise), E to pick
 * up, pick fruit, drink or fill a waterskin, butcher, open a chest, open a
 * gate, sleep, board a raft, take what's cooked; Shift+E to take something
 * you built back down; Q to drop one (Shift+Q the stack), Tab to craft, Z
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
    this.inventory = new Inventory(9);
    this.survival = new Survival();
    this.hud = new Hud(o.hudRoot);
    this.items = new GroundItems(o.scene, o.config);
    this.structures = new Structures(o.scene, (id) => this.items.model(id));
    this.structures.onDone = (s, out) => {
      const d = Math.hypot(s.x - this.camera.position.x, s.z - this.camera.position.z);
      if (d < 30) this.hotbar?.flash(`${ITEMS[out.id].name} ready at the ${ITEMS[s.type].name.toLowerCase()}`);
    };
    this.felling = new Felling(o.scene, o.trees, this.items);
    this.flying = []; // spears and arrows in flight: { kind, mesh, pos, vel, stack, life }
    this.harvested = new Map(); // tree key -> time picked (the fruit comes again after a while)
    this.time = 0;
    this.cooldown = 0;
    this.pending = []; // blows landing a moment after the swing: { time, fn }
    this.lastHeat = { wait: 0, heat: 0, seasonality: 0 };
    this.dirty = false;
    this.saveWait = 10;
    this.seed = null;
    this.spawn = null;
    this.drawing = null; // a bow being drawn: { since }
    this.line = null; // a fishing line out
    this.riding = null; // the raft you're on
    this.sleeping = null;
    this.snareWait = 1;
    this.structures.onChange = () => (this.dirty = true);
    this.#heldModel();
    this.#bind();
  }

  get walking() {
    return this.controls.mode === 'walk';
  }

  /** Starts you afresh: full health, the test kit. */
  newLife() {
    this.survival.reset();
    this.inventory.clear();
    for (const [id, n] of TEST_KIT) this.inventory.add(Inventory.stack(id, n));
    this.hud.alive();
    this.controls.frozen = false;
  }

  // --- The world remembering what you've done ------------------------------------

  loadWorld(seed) {
    this.seed = seed;
    this.items.clear();
    this.felling.clear();
    this.trees.removed.clear();
    this.mushrooms?.taken.clear();
    this.harvested.clear();
    this.#getOff();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(`facet-lands:survival:${seed}`) || 'null');
    } catch {
      saved = null;
    }
    for (const k of saved?.taken ?? []) this.items.taken.add(k);
    for (const k of saved?.felled ?? []) this.trees.removed.add(k);
    for (const k of saved?.mushrooms ?? []) this.mushrooms?.taken.add(k);
    this.felling.loadStumps(saved?.stumps);
    this.structures.load(saved?.structures ?? []);
    // You, as you were (or afresh).
    if (saved?.player) {
      this.inventory.load(saved.player.inventory);
      this.survival.reset();
      this.survival.load(saved.player.stats);
      this.spawn = saved.player.spawn ?? null;
      this.hud.alive();
      this.controls.frozen = false;
    } else {
      this.spawn = null;
      this.newLife();
    }
    this.dirty = false;
  }

  save() {
    if (this.seed === null) return;
    const data = {
      structures: this.structures.toJSON(), taken: [...this.items.taken], felled: [...this.trees.removed], stumps: this.felling.stumpsJSON(),
      mushrooms: [...(this.mushrooms?.taken ?? [])],
      player: this.survival.alive ? { inventory: this.inventory.toJSON(), stats: this.survival.toJSON(), spawn: this.spawn } : null,
    };
    try {
      localStorage.setItem(`facet-lands:survival:${this.seed}`, JSON.stringify(data));
    } catch {
      // (No storage: the world just won't remember.)
    }
    this.dirty = false;
  }

  // --- Input -------------------------------------------------------------------------

  #bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      if (e.code === 'Tab' || e.code === 'KeyI') {
        e.preventDefault();
        if (!this.survival.alive) return;
        this.#menu(this.hud.toggleCraft(this.inventory));
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
      if (e.code === 'KeyE') {
        if (this.hud.chest) {
          this.hud.closeAll();
          this.#menu(false);
        } else if (!this.hud.busy) this.interact(null, e.shiftKey);
      }
      if (e.code === 'KeyQ' && !this.hud.busy) this.drop(e.shiftKey);
    });
    this.hud.onCraft = (id) => this.craft(id);
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
    this.inventory.onChange(() => {
      if (!this.hud.el('.craft').hidden) this.hud.renderCraft(this.inventory);
      this.hud.renderChest();
      this.dirty = true;
    });
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

  /** What's in front of you that E would do something with. */
  #target(ray, down = false) {
    const { origin, direction } = this.#ray(ray);
    const reach = REACH;
    const found = [];
    const held = this.inventory.slots[this.hotbar?.index ?? 0];
    const item = this.items.pick(origin, direction, reach);
    if (item) found.push({ kind: 'item', distance: item.distance, item, text: `Pick up ${ITEMS[item.id].name.toLowerCase()}` });
    const carcass = this.wildlife.aim(origin, direction, reach, true);
    if (carcass && !carcass.animal.alive) found.push({ kind: 'carcass', distance: carcass.distance, animal: carcass.animal, text: `Butcher the ${NAMES[carcass.animal.kind] ?? 'animal'}` });
    const tree = this.trees.pick(origin, direction, reach);
    if (tree && FRUIT[tree.type]) {
      const ripe = seasonUniforms.uFruit.value > 0.6 && seasonUniforms.uRipe.value > 0.7;
      const picked = this.harvested.has(tree.key) && this.time - this.harvested.get(tree.key) < 900;
      found.push({ kind: 'fruit', distance: tree.distance, tree, ripe, picked, text: picked ? 'Picked clean' : ripe ? `Pick ${FRUIT[tree.type] === 'apple' ? 'apples' : 'berries'}` : seasonUniforms.uFruit.value > 0.3 ? 'Not ripe yet' : 'No fruit this time of year' });
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
      found.push({ kind: 'water', distance: water.distance, ...water, text: water.salty ? 'Sea water: too salty to drink' : fill ? `Fill the waterskin${water.clean ? '' : ' (still water: boil it)'}` : `Drink${water.clean ? '' : ' (still water: it may make you ill)'}` });
    }
    found.sort((a, b) => a.distance - b.distance);
    return found[0] ?? null;
  }

  #structureText(s, held) {
    const done = s.jobs?.some((j) => j.done);
    if (done) return `Take what's ready`;
    switch (s.type) {
      case 'chest': return 'Open the chest';
      case 'gate': return s.open ? 'Shut the gate' : 'Open the gate';
      case 'bed': return 'Sleep';
      case 'raft': return 'Climb aboard';
      case 'snare': return s.caught ? 'Take the rabbit' : 'Set, and waiting (Shift+E to take it up)';
      case 'campfire':
      case 'furnace': {
        const working = s.jobs.length ? ` · ${s.jobs.map((j) => `${ITEMS[j.stack.id].name.toLowerCase()} ${Math.round(100 - (j.left / j.total) * 100)}%`).join(', ')}` : '';
        return s.lit ? `Burning${working}` : `Cold${working}: light it with flint and steel`;
      }
      case 'dryingRack':
        return s.jobs.length ? `Drying: ${s.jobs.map((j) => `${Math.round(100 - (j.left / j.total) * 100)}%`).join(', ')}` : 'Hang raw meat or fish on it (click with it)';
      default: return `Shift+E: take down the ${ITEMS[s.type].name.toLowerCase()}`;
    }
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

  /** E: picks up, picks fruit, drinks, butchers, and uses what you've built (Shift: takes it down). */
  interact(ray, down = false) {
    if (this.riding) return this.#getOff(true);
    const t = this.#target(ray, down);
    if (!t) return this.hotbar?.flash('Nothing to pick up here');
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
      for (const [id, n] of Object.entries(got)) {
        this.#give(id, n, t.animal);
        lines.push(`${ITEMS[id].name} ×${n}`);
      }
      this.sound?.call('chop', 0, 0.4);
      return this.hotbar?.flash(lines.join(', '));
    }
    if (t.kind === 'fruit') {
      if (!t.ripe || t.picked) return this.hotbar?.flash(t.text);
      const id = FRUIT[t.tree.type];
      const n = id === 'apple' ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3);
      this.#give(id, n);
      this.harvested.set(t.tree.key, this.time);
      this.sound?.call('pickup', 0, 0.5);
      return this.hotbar?.flash(`${ITEMS[id].name} ×${n}`);
    }
    if (t.kind === 'mushroom') {
      this.mushrooms.take(t.mushroom);
      this.#give('mushroom', 1);
      this.dirty = true;
      this.sound?.call('pickup', 0, 0.4);
      return this.hotbar?.flash('Mushroom');
    }
    if (t.kind === 'structure') return this.#useStructure(t.structure, down);
    if (t.kind === 'water') {
      if (t.salty) return this.hotbar?.flash(t.text);
      const i = this.hotbar.index, held = this.inventory.slots[i];
      if (held?.id === 'waterskin') {
        held.water = ITEMS.waterskin.holds;
        held.clean = t.clean;
        this.inventory.changed();
        this.sound?.call('drink', 0, 0.4);
        return this.hotbar?.flash(t.clean ? 'Filled with running water' : 'Filled with still water: boil it on a fire first');
      }
      const sick = this.survival.consume({ thirst: 22, sick: t.clean ? 0.03 : 0.25 });
      this.sound?.call('drink', 0, 0.5);
      return this.hotbar?.flash(sick ? 'You drink... it tastes foul: you feel feverish' : 'You drink');
    }
  }

  #useStructure(s, down) {
    if (down) {
      // Taking it back down.
      if (s.lit) return this.hotbar?.flash('Too hot to take down: let it burn out');
      if (s.type === 'chest' && s.contents.slots.some(Boolean)) return this.hotbar?.flash('Empty it first');
      for (const st of this.structures.takeAll(s)) this.#give(st.id, st.count ?? 1, s);
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
      case 'chest':
        this.hud.openChest(s.contents, this.inventory);
        return this.#menu(true);
      case 'gate':
        this.structures.toggle(s);
        return this.sound?.call('creak', 0, 0.3);
      case 'bed':
        return this.#sleep(s);
      case 'raft':
        return this.#board(s);
      case 'snare':
        if (!s.caught) return this.hotbar?.flash('Nothing yet');
        s.caught = false;
        s.catchMesh.visible = false;
        this.#give('rawMeat', 1);
        this.dirty = true;
        return this.hotbar?.flash('A rabbit: raw meat');
      default:
        return this.hotbar?.flash(this.#structureText(s));
    }
  }

  /** Q: drops one of what's in your hand (Shift: the whole stack). */
  drop(all) {
    const i = this.hotbar.index;
    const s = this.inventory.take(i, all);
    if (!s) return;
    this.camera.getWorldDirection(dir);
    const p = this.camera.position;
    this.items.drop(s, p.x + dir.x * 1.2, p.y - 0.4, p.z + dir.z * 1.2);
    this.hotbar?.flash(`Dropped ${ITEMS[s.id].name.toLowerCase()}${s.count > 1 ? ` ×${s.count}` : ''}`);
  }

  /** Makes something (if you've what it needs). */
  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;
    if (!Object.entries(r.needs).every(([k, n]) => this.inventory.count(k) >= n)) return this.hotbar?.flash('Not enough to make that');
    for (const [k, n] of Object.entries(r.needs)) this.inventory.remove(k, n);
    const n = r.makes ?? 1;
    const got = this.#give(id, n);
    this.sound?.call('craft', 0, 0.5);
    this.hotbar?.flash(`Made: ${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}${got < n ? ' (some on the ground: no room)' : ''}`);
  }

  // --- Using what's in your hand -------------------------------------------------------

  /** The mouse pressed down (a bow starts to draw). */
  press() {
    if (!this.walking || !this.survival.alive || this.hud.busy || this.riding) return;
    const s = this.inventory.slots[this.hotbar.index];
    if (s?.id === 'bow' && this.cooldown <= 0) {
      if (!this.inventory.count('arrow')) return this.hotbar?.flash('No arrows (make some: a stick and a flint)');
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
    if (s?.id === 'bow') return this.#loose(i, origin, direction);
    if (s?.id === 'fishingRod') return this.#fish(i, origin, direction);
    if (this.cooldown > 0) return;
    const item = s && ITEMS[s.id];
    if (!s) return this.#bareHands(origin, direction);
    if (AXES[s.id]) return this.#axe(i, origin, direction, AXES[s.id]);
    if (PICKS[s.id]) return this.#mine(i, origin, direction, PICKS[s.id]);
    if (SPEARS.has(s.id)) return this.#stab(i, origin, direction);
    const built = this.structures.pick(origin, direction, REACH);
    const at = built?.structure;
    if (LIGHTERS.has(s.id)) {
      this.#animate('use', 0.3);
      this.cooldown = 0.5;
      this.sound?.call('strike', 0, 0.5);
      this.inventory.wear(i, 1);
      if (!this.structures.isFire(at)) return this.hotbar?.flash('Strike it at a campfire or a furnace to light it');
      if (at.lit) return this.hotbar?.flash('It is already burning');
      if (Math.random() < 0.35) return this.hotbar?.flash('Sparks, but it didn’t catch: again');
      if (!this.structures.light(at)) return this.hotbar?.flash('Nothing left to burn: add a log');
      this.sound?.call('crackle', 0, 0.6);
      return this.hotbar?.flash('The fire catches');
    }
    // Things for a fire, a furnace or a drying rack.
    if (at && this.#workAt(i, s, at)) return;
    if (s.id === 'waterskin') {
      if (!s.water) return this.hotbar?.flash('Empty: fill it at water (E)');
      s.water--;
      this.inventory.changed();
      const sick = this.survival.consume({ thirst: 22, sick: s.clean ? 0 : 0.25 });
      this.#animate('use', 0.4);
      this.cooldown = 0.5;
      this.sound?.call('drink', 0, 0.5);
      return this.hotbar?.flash(sick ? 'It tasted foul: you feel feverish' : `You drink (${s.water} left)`);
    }
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
    if (item.wear) {
      const slot = item.wear === 'coat' ? 'worn' : 'armour';
      const worn = this.inventory[slot];
      this.inventory[slot] = { ...s };
      this.inventory.slots[i] = worn;
      this.inventory.changed();
      return this.hotbar?.flash(`Wearing: ${item.name}`);
    }
    if (item.place === 'torch') {
      if (placeTorch?.(origin, direction)) {
        this.inventory.take(i);
        this.cooldown = 0.3;
      }
      return;
    }
    if (item.place) {
      const plan = this.plan;
      if (!plan) return this.hotbar?.flash('Point at the ground nearby');
      if (!plan.ok) return this.hotbar?.flash(plan.why);
      this.structures.build(plan);
      this.inventory.take(i);
      this.cooldown = 0.4;
      this.sound?.call('place', 0, 0.5);
      return;
    }
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
    if (at.type === 'dryingRack' && item.dries) {
      if (!this.structures.work(at, { id: s.id, count: 1 }, Inventory.stack(item.dries, 1), TIMES.dry)) return say('The rack is full');
      take();
      this.cooldown = 0.3;
      return say(`${item.name} hung up to dry: jerky in three minutes`);
    }
    return false;
  }

  /** Right-click: throws a spear; otherwise the same as E. */
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
    this.hotbar?.flash('Empty hand: pick things up with E');
  }

  // A blow that lands a moment after the swing starts (on the down stroke).
  #later(time, fn) {
    this.pending.push({ time, fn });
  }

  #axe(i, origin, direction, power) {
    this.#animate('chop', 0.62);
    this.cooldown = 0.66;
    this.#later(0.36, () => {
      const animal = this.wildlife.aim(origin, direction, REACH);
      const fallen = this.felling.pickFallen(origin, direction, REACH);
      const tree = this.trees.pick(origin, direction, REACH);
      const near = [animal && { k: 'animal', d: animal.distance }, fallen && { k: 'fallen', d: fallen.distance }, tree && { k: 'tree', d: tree.distance }].filter(Boolean).sort((a, b) => a.d - b.d)[0];
      if (!near) return this.sound?.call('whoosh', 0, 0.2);
      if (near.k === 'animal') return this.#strike(i, animal);
      this.inventory.wear(i, 1);
      this.sound?.call('chop', 0, 0.7);
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
      } else if (result === 'bush') this.items.drop(Inventory.stack('stick', 1 + Math.floor(Math.random() * 2)), tree.x, tree.y + 0.8, tree.z);
    });
  }

  // A pickaxe at rock: a boulder, a rock face, a cave wall. Stone, and now and then flint or iron ore.
  #mine(i, origin, direction, power) {
    this.#animate('chop', 0.62);
    this.cooldown = 0.7 / power;
    this.#later(0.36, () => {
      const boulder = this.#boulderAlong(origin, direction, REACH + 0.3);
      const face = this.solidHit(origin, direction, REACH + 0.3);
      let where = null, iron = 0.06;
      if (boulder && (!face || boulder.distance <= face.point.distanceTo(origin) + 0.3)) where = boulder.point;
      else if (face && (face.cave || face.normal.y < 0.6)) {
        where = face.point;
        iron = face.cave ? 0.25 : 0.08;
      }
      if (!where) {
        if (face) this.hotbar?.flash('Only soil here: find bare rock or a boulder');
        return this.sound?.call('whoosh', 0, 0.2);
      }
      this.inventory.wear(i, 1);
      this.sound?.call('strike', 0, 0.7);
      this.sound?.call('thunk', 0, 0.5);
      this.felling.spray(where, origin, 0x8e8a84);
      const r = Math.random();
      const id = r < iron ? 'iron' : r < iron + 0.14 ? 'flint' : 'rock';
      const n = id === 'rock' ? 1 + (Math.random() < 0.4 ? 1 : 0) : 1;
      this.#give(id, n, { x: where.x, y: where.y + 0.3, z: where.z });
      this.hotbar?.flash(`${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}`);
    });
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
        if (!best || d < best.distance) best = { distance: d, point: origin.clone().addScaledVector(direction, Math.max(0, d)) };
      }
    }
    return best;
  }

  #stab(i, origin, direction) {
    this.#animate('thrust', 0.4);
    this.cooldown = 0.75;
    this.#later(0.12, () => {
      const animal = this.wildlife.aim(origin, direction, REACH + 0.5);
      if (animal) return this.#strike(i, animal);
      // A fish, in the water in front of you?
      if (this.#spearFish(origin, direction, REACH + 0.8)) this.inventory.wear(i, 1);
    });
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

  #strike(i, hit) {
    const a = hit.animal;
    const outcome = this.wildlife.wound(a, { head: hit.head, from: this.camera.position });
    this.inventory.wear(i, 1);
    this.sound?.call('thunk', 0, 0.6);
    this.#report(a, outcome, hit.head);
  }

  #report(a, outcome, head) {
    const name = NAMES[a.kind] ?? 'animal';
    const text = { dead: `The ${name} is dead`, down: head ? `A blow to the head: the ${name} is down` : `The ${name} is down: finish it`, lame: `The ${name} is limping`, hit: `You wounded the ${name}` }[outcome];
    if (text) this.hotbar?.flash(text);
  }

  // Launching a spear or an arrow along a ray.
  #launch(kind, stack, origin, direction, speed) {
    const mesh = new Mesh(this.items.model(kind === 'arrow' ? 'arrow' : stack.id), this.items.material);
    mesh.castShadow = true;
    const pos = origin.clone().addScaledVector(direction, 0.6);
    pos.y -= 0.12;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.flying.push({ kind, mesh, pos, vel: direction.clone().multiplyScalar(speed).add(new Vector3(0, kind === 'arrow' ? 0.4 : 1.2, 0)), stack, life: 7 });
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
    if (draw < 0.15 || !this.inventory.remove('arrow', 1)) return;
    this.inventory.wear(i, 1);
    this.#launch('arrow', Inventory.stack('arrow', 1), origin, direction, 16 + 34 * draw);
    this.cooldown = 0.35;
    this.sound?.call('whoosh', 0, 0.35 + 0.3 * draw);
  }

  #flyAll(dt) {
    for (const sp of this.flying) {
      sp.life -= dt;
      const step = sp.vel.length() * dt;
      dir.copy(sp.vel).normalize();
      // Into a creature?
      const hit = this.wildlife.aim(sp.pos, dir, step + 0.3);
      if (hit && !sp.done) {
        const outcome = this.wildlife.wound(hit.animal, { head: hit.head, from: this.camera.position });
        this.sound?.call('thunk', 0, 0.7);
        this.#report(hit.animal, outcome, hit.head);
        sp.done = true;
        // (A spear drops by it; an arrow's lost as often as not.)
        if (sp.kind === 'spear') {
          sp.stack.dur = (sp.stack.dur ?? 1) - 2;
          if (sp.stack.dur > 0) this.items.drop(sp.stack, hit.animal.x + rnd(-0.5, 0.5), hit.animal.y + 1, hit.animal.z + rnd(-0.5, 0.5), { turn: rnd(0, 6.28) });
          else this.hotbar?.flash('The spear broke');
        } else if (Math.random() < 0.5) this.items.drop(sp.stack, hit.animal.x + rnd(-0.5, 0.5), hit.animal.y + 1, hit.animal.z + rnd(-0.5, 0.5));
        continue;
      }
      sp.pos.addScaledVector(sp.vel, dt);
      sp.vel.y -= 9.8 * dt;
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
        sp.done = true;
        sp.stack.dur = (sp.stack.dur ?? 1) - 1;
        const lost = sp.kind === 'arrow' ? Math.random() < 0.25 : sp.stack.dur <= 0;
        if (!lost) {
          const tilt = q.setFromUnitVectors(FORWARD, dir).clone();
          const y = Number.isFinite(g) ? g : sp.pos.y;
          const d = this.items.drop(sp.stack, sp.pos.x - dir.x * (sp.kind === 'arrow' ? 0.2 : 0.5), y + 0.3, sp.pos.z - dir.z * (sp.kind === 'arrow' ? 0.2 : 0.5), { tilt });
          d.settled = true;
          d.y = y + (sp.kind === 'arrow' ? 0.15 : 0.35);
          d.mesh.position.set(d.x, d.y, d.z);
          this.sound?.call('thunk', 0, 0.3);
        } else if (sp.kind === 'spear') this.hotbar?.flash('The spear broke');
      }
    }
    for (const sp of this.flying.filter((x) => x.done)) this.scene.remove(sp.mesh);
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
      this.#give('rawFish', 1);
      this.sound?.call('splash', 0, 0.6);
      return this.hotbar?.flash('A fish!');
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
    this.line = { ...at, bobber, line, wait: rnd(4, 14) * (near ? 0.5 : 1), bite: 0 };
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

  // --- A raft -----------------------------------------------------------------------

  #board(s) {
    this.riding = s;
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
    this.hotbar?.flash('On the raft: W to paddle, E to get off');
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
      this.hotbar?.flash('You wake, rested');
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
    this.time += dt;
    this.night = ctx.night;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const p of this.pending) p.time -= dt;
    for (const p of this.pending.filter((p) => p.time <= 0)) p.fn();
    this.pending = this.pending.filter((p) => p.time > 0);
    const cam = this.camera.position;
    const ground = (x, z) => this.groundAt(x, z);
    this.items.update(dt, (x, z, y) => this.groundAt(x, z, y));
    this.felling.update(dt, ground, (x, y, z, size) => {
      const d = Math.hypot(x - cam.x, z - cam.z);
      this.sound?.call('treefall', 0, Math.min(1, 0.4 + size / 20) / (1 + d / 30));
    });
    this.#flyAll(dt);
    const lights = this.structures.update(dt, ctx);
    const walking = this.walking;
    const i = this.hotbar.index;
    const held = this.inventory.slots[i];
    if (this.sleeping) this.#sleepStep(dt);
    this.#fishing(dt, held);
    this.#snares(dt);
    if (this.drawing && held?.id !== 'bow') this.drawing = null;

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
    const fire = this.structures.warmthAt(cam.x, cam.y - this.controls.eyeHeight, cam.z);
    const jumped = this.controls.takeJumps();
    // What you carry weighs you down.
    const load = this.inventory.slots.reduce((n, s) => n + weightOf(s), 0);
    const heavy = Math.max(0, (load - LOAD) / LOAD);
    this.controls.burden = Math.max(0.45, 1 - heavy * 0.5);
    this.controls.noSprint = heavy > 0.5 || this.survival.energy < 20;
    const e = {
      active: walking && this.survival.alive && !this.sleeping,
      moving: this.controls.moving, sprinting: this.controls.sprinting, swimming: this.controls.swimming, jumped, load: heavy,
      heat: heat.heat, day: ctx.day, coat: !!this.inventory.worn, fire, inFire: walking && this.structures.inFire(cam.x, cam.z),
      winter: ctx.winter, spring: ctx.spring, autumn: ctx.autumn, summer: ctx.summer,
      seasonality: heat.seasonality, altitude: cam.y - this.controls.eyeHeight, night: ctx.night, rain: ctx.rain, snowing: ctx.snowing,
    };
    const wasAlive = this.survival.alive;
    this.survival.update(dt, e);
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
      this.spoilWait = 5;
      if (rotted.length) this.hotbar?.flash(`${rotted[0]} has gone off`);
    }
    if (wasAlive && !this.survival.alive) this.#die();

    // What's under the crosshair: what E would do, and where a thing to be built would go.
    let prompt = null;
    this.plan = null;
    if (walking && this.survival.alive && !this.hud.busy && !this.riding) {
      const origin = cam, direction = this.camera.getWorldDirection(dir.clone());
      const t = this.#target({ origin, direction });
      const item = held && ITEMS[held.id];
      if (item?.place && item.place !== 'torch') {
        const at = ctx.planPoint(origin, direction, 6.5) ?? v.copy(origin).addScaledVector(direction.clone().setY(0).normalize(), 3);
        const yaw = this.controls.euler.y + (item.place === 'wall' || item.place === 'gate' ? Math.PI : 0);
        this.plan = this.structures.plan(item.place, at, yaw, ground, (x, z) => this.waterAt(x, z)?.level ?? null);
        this.structures.preview(this.plan);
        prompt = this.plan.ok ? `<kbd>Click</kbd> Build ${item.name.toLowerCase()}` : this.plan.why;
      } else this.structures.preview(null);
      if (!prompt && t) prompt = `<kbd>E</kbd> ${t.text}`;
      if (!prompt && held) {
        if (AXES[held.id] && (this.felling.pickFallen(origin, direction, REACH) || this.trees.pick(origin, direction, REACH))) prompt = '<kbd>Click</kbd> Chop';
        if (PICKS[held.id] && this.#boulderAlong(origin, direction, REACH)) prompt = '<kbd>Click</kbd> Break rock';
      }
    } else this.structures.preview(null);
    if (this.riding) prompt = '<kbd>W</kbd> Paddle · <kbd>E</kbd> Get off';
    this.hud.prompt(prompt);
    this.hud.draw(this.drawing ? Math.min(1, (this.time - this.drawing.since) / 0.9) : null);
    // (Which way the wind blows, as you look.)
    const w = this.wind?.() ?? { x: 0, z: 0 }, yaw = this.controls.euler.y;
    const along = -w.x * Math.sin(yaw) - w.z * Math.cos(yaw), across = w.x * Math.cos(yaw) - w.z * Math.sin(yaw);
    this.hud.update(this.survival, this.inventory, { active: walking, load, heavy, wind: Math.atan2(across, along) });

    // Held in your hand.
    this.#drawHeld(dt, held, walking);
    if (held?.id === 'torch' && walking) lights.push({ x: cam.x, y: cam.y - 0.2, z: cam.z, strength: 10, reach: 14 });

    // Saving now and then.
    this.saveWait -= dt;
    if (this.saveWait <= 0) {
      this.saveWait = 10;
      if (this.dirty && walking) this.save();
    }
    return lights;
  }

  /** You've been hurt (by a wolf, a bear, a fall...). */
  hurt(amount, cause, { bite = false } = {}) {
    if (!this.walking || this.sleeping) return;
    // Armour takes the worst of a bite or a swipe (and wears for it).
    const armour = this.inventory.armour;
    if (bite && armour) {
      amount *= 0.55;
      armour.dur -= 1;
      if (armour.dur <= 0) {
        this.inventory.armour = null;
        this.hotbar?.flash('Your armour is torn to pieces');
      }
      this.inventory.changed();
    }
    this.survival.hurt(amount, cause);
    if (bite && Math.random() < (armour ? 0.15 : 0.4)) {
      this.survival.bleed(60 + Math.random() * 60);
      this.hotbar?.flash('You are bleeding: bandage it');
    }
    this.sound?.call('hurt', 0, Math.min(1, 0.4 + amount / 30));
    this.shake = Math.min(1, (this.shake ?? 0) + amount / 25);
  }

  /** For the animals: where you are and what you're doing. */
  get player() {
    const p = this.camera.position, c = this.controls;
    return {
      x: p.x, y: p.y, z: p.z, mode: c.mode, crouch: c.crouch, moving: c.moving, sprint: c.sprinting, alive: this.survival.alive && !this.riding,
      damage: (amount, kind) => this.hurt(amount, ATTACKERS[kind] ?? `a ${NAMES[kind] ?? kind}`, { bite: true }),
    };
  }

  #die() {
    // What you carried lies where you fell.
    this.#getOff();
    this.#reel();
    const p = this.camera.position;
    this.inventory.slots.forEach((s, i) => {
      if (!s) return;
      const a = (i / 9) * Math.PI * 2;
      this.items.drop(s, p.x + Math.cos(a) * 0.8, p.y, p.z + Math.sin(a) * 0.8);
    });
    this.inventory.clear();
    this.hud.death(this.survival.cause);
    this.#menu(true);
    this.controls.frozen = true;
    this.dirty = true;
  }

  respawn() {
    if (this.spawn) this.camera.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
    this.controls.velocityY = 0;
    this.newLife();
    this.#menu(false);
  }

  // --- What's in your hand, drawn in front of you -----------------------------------------

  #heldModel() {
    this.hand = new Group(); // (where your hand is: bobbing as you walk)
    this.hand.name = 'held item';
    this.camera.add(this.hand);
    this.grip = new Group(); // (turned about your grip, to swing)
    this.hand.add(this.grip);
    this.handMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true, depthTest: false, depthWrite: false, transparent: true });
    this.handFlame = new Mesh(new OctahedronGeometry(0.06, 0), new MeshBasicMaterial({ color: 0xffa040, depthTest: false, transparent: true }));
    this.handFlame.scale.set(1, 1.7, 1);
    this.heldId = null;
    this.anim = null;
  }

  #animate(kind, duration) {
    this.anim = { kind, t: 0, duration };
  }

  #drawHeld(dt, held, walking) {
    const id = walking && this.survival.alive && !this.hud.busy ? held?.id ?? null : null;
    if (id !== this.heldId) {
      this.heldId = id;
      this.grip.clear();
      this.rodTip = null;
      if (id) {
        const geometry = id === 'torch' ? this.items.model('stick') : this.items.model(id);
        const mesh = new Mesh(geometry, this.handMaterial);
        mesh.renderOrder = 999;
        this.handFlame.renderOrder = 1000;
        // Each held its own way (in your hand's frame: forward is -z).
        if (AXES[id] || PICKS[id]) {
          // (Blade forward, the handle in your fist near its end.)
          mesh.rotation.set(0, Math.PI / 2, 0);
          mesh.scale.setScalar(0.62);
          mesh.position.set(0, -0.06, 0);
        } else if (SPEARS.has(id)) mesh.rotation.set(0, Math.PI, 0), mesh.scale.setScalar(0.7), mesh.position.set(0, 0, -0.2);
        else if (id === 'bow') mesh.rotation.set(0, 0, 0.25), mesh.scale.setScalar(0.75), mesh.position.set(-0.12, 0.1, -0.05);
        else if (id === 'fishingRod') {
          mesh.rotation.set(-1.05, 0, 0), mesh.scale.setScalar(0.75), mesh.position.set(0, -0.05, 0);
          this.rodTip = new Group();
          this.rodTip.position.set(0, 1.8, 0);
          mesh.add(this.rodTip);
        } else if (id === 'torch') {
          mesh.rotation.set(0, 0, Math.PI / 2 - 0.2), mesh.scale.setScalar(0.7);
          this.handFlame.position.set(0.02, 0.33, 0);
          this.grip.add(this.handFlame);
        } else if (id === 'log') mesh.rotation.set(0, Math.PI / 2 - 0.25, 0.15), mesh.scale.setScalar(0.85), mesh.position.set(0.05, 0.22, 0.25); // (on your shoulder)
        else mesh.scale.setScalar(ITEMS[id].place ? 0.35 : 0.8);
        this.grip.add(mesh);
      }
    }
    // Bobbing as you walk.
    this.bob = (this.bob ?? 0) + dt * (this.controls.moving ? (this.controls.sprinting ? 13 : 8) : 0);
    const low = this.controls.crouch ? 0.03 : 0;
    const heavy = id === 'log' ? 0.05 : 0;
    this.hand.position.set(0.3 + Math.sin(this.bob) * 0.015, -0.33 - Math.abs(Math.cos(this.bob)) * (0.02 + heavy) - low, -0.62);
    // Resting pose, and the swing on top of it.
    let rx = AXES[id] || PICKS[id] ? -0.25 : 0, rz = AXES[id] || PICKS[id] ? 0.12 : 0, px = 0, py = 0, pz = 0;
    const a = this.anim;
    if (a) {
      a.t += dt;
      const u = Math.min(1, a.t / a.duration);
      if (a.kind === 'chop') {
        // Up over the shoulder, a hard stroke down and across, and back.
        const lift = u < 0.5 ? Math.sin((u / 0.5) * Math.PI / 2) : u < 0.62 ? 1 - ((u - 0.5) / 0.12) * 2.2 : -1.2 + ((u - 0.62) / 0.38) * 1.2;
        rx += lift * 1.2;
        rz += lift * -0.35;
        py += Math.max(0, lift) * 0.12;
        pz += Math.max(0, lift) * 0.1;
      } else if (a.kind === 'thrust' || a.kind === 'throw') {
        const out = u < 0.3 ? -u / 0.3 * 0.12 : u < 0.5 ? -0.12 + ((u - 0.3) / 0.2) * 0.5 : 0.38 * (1 - (u - 0.5) / 0.5);
        pz -= out;
        if (a.kind === 'throw') py += out * 0.4;
      } else if (a.kind === 'cast') {
        rx += u < 0.4 ? (u / 0.4) * 0.9 : 0.9 - ((u - 0.4) / 0.6) * 1.3;
      } else py += Math.sin(u * Math.PI) * 0.08;
      if (u >= 1) this.anim = null;
    }
    if (this.drawing && id === 'bow') pz += Math.min(1, (this.time - this.drawing.since) / 0.9) * 0.12;
    this.grip.rotation.set(rx, 0, rz);
    this.grip.position.set(px, py, pz);
    if (this.heldId === 'torch') {
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

  /** How near the nearest lit fire is (for its crackle). */
  fireNear() {
    return this.structures.nearestFire(this.camera.position.x, this.camera.position.z);
  }
}
