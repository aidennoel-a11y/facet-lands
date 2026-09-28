import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, Vector3 } from 'three';
import { seasonUniforms } from '../render/Seasons.js';
import { Felling } from './Felling.js';
import { GroundItems } from './GroundItems.js';
import { Hud } from './Hud.js';
import { Inventory } from './Inventory.js';
import { ITEMS, RECIPES, stackOf } from './items.js';
import { Structures } from './Structures.js';
import { Survival } from './Survival.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const v = new Vector3(), dir = new Vector3(), q = new Quaternion(), FORWARD = new Vector3(0, 0, 1);

// How far you can reach, on foot.
const REACH = 3;
const FRUIT = { raspberryBush: 'berries', blueberryBush: 'berries', appleTree: 'apple' };
const NAMES = { deer: 'deer', bison: 'bison', blackBear: 'black bear', grizzly: 'grizzly bear', wolf: 'wolf', coyote: 'coyote', fox: 'fox', rabbit: 'rabbit', songbird: 'bird', starling: 'starling', crow: 'crow', gull: 'gull', hawk: 'hawk' };
const ATTACKERS = { wolf: 'a wolf', grizzly: 'a grizzly bear', blackBear: 'a black bear' };

/** What you start with (for testing: everything you need to try it all out). */
export const TEST_KIT = [['axe', 1], ['spear', 1], ['flintSteel', 1], ['log', 10], ['vine', 10], ['campfire', 3], ['wall', 10], ['chest', 2], ['cookedMeat', 10]];

/**
 * The game of staying alive, on foot: your pack (the hotbar), your health,
 * hunger, thirst and warmth, what you can do with what's in front of you,
 * crafting, building, felling, hunting, and the world remembering it all.
 *
 * Keys (walking): click to use what's in your hand (chop, stab, eat, light
 * a fire, set something down), right-click to throw a spear (or the same as
 * E otherwise), E to pick up, pick fruit, drink, butcher, open a chest, Q
 * to drop one (Shift+Q the stack), Tab to craft, C / Ctrl to crouch.
 */
export class Game {
  /**
   * @param o { scene, camera, controls, chunks, trees, torches, wildlife,
   *            sound, hotbarRoot, hudRoot, config, generator(),
   *            waterAt(x, z), groundAt(x, z), solidHit(origin, dir, reach)
   *            ({ point, normal } on the ground or a cave wall) }
   */
  constructor(o) {
    Object.assign(this, o);
    this.inventory = new Inventory(9);
    this.survival = new Survival();
    this.hud = new Hud(o.hudRoot);
    this.items = new GroundItems(o.scene, o.config);
    this.structures = new Structures(o.scene);
    this.felling = new Felling(o.scene, o.trees, this.items);
    this.spears = []; // in flight: { mesh, pos, vel, stack }
    this.harvested = new Map(); // tree key -> time picked (the fruit comes again after a while)
    this.time = 0;
    this.cooldown = 0;
    this.swing = 0;
    this.lastHeat = { wait: 0, heat: 0, seasonality: 0 };
    this.dirty = false;
    this.saveWait = 10;
    this.seed = null;
    this.spawn = null;
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
    this.harvested.clear();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(`facet-lands:survival:${seed}`) || 'null');
    } catch {
      saved = null;
    }
    for (const k of saved?.taken ?? []) this.items.taken.add(k);
    for (const k of saved?.felled ?? []) this.trees.removed.add(k);
    this.structures.load(saved?.structures ?? []);
    this.dirty = false;
  }

  save() {
    if (this.seed === null) return;
    const data = { structures: this.structures.toJSON(), taken: [...this.items.taken], felled: [...this.trees.removed] };
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
        const open = this.hud.toggleCraft(this.inventory);
        this.#menu(open);
        return;
      }
      if (e.code === 'Escape' && this.hud.busy && this.survival.alive) {
        this.hud.closeAll();
        this.#menu(false);
        return;
      }
      if (!this.walking || !this.survival.alive) return;
      if (e.code === 'KeyE') {
        if (this.hud.chest) {
          this.hud.closeAll();
          this.#menu(false);
        } else this.interact();
      }
      if (e.code === 'KeyQ' && !this.hud.busy) this.drop(e.shiftKey);
    });
    this.hud.onCraft = (id) => this.craft(id);
    this.hud.onTake = (id) => {
      const left = this.inventory.add(Inventory.stack(id, stackOf(id)));
      this.hotbar?.flash(left ? 'No room' : `Took ${ITEMS[id].name}`);
      this.hud.renderCraft(this.inventory);
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
  #target(ray) {
    const { origin, direction } = this.#ray(ray);
    const reach = REACH;
    const found = [];
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
    const built = this.structures.pick(origin, direction, reach);
    if (built) {
      const s = built.structure;
      const text = s.type === 'chest' ? 'Open the chest' : s.type === 'campfire' && s.lit ? 'Burning (feed it a log)' : `Take down the ${ITEMS[s.type].name.toLowerCase()}`;
      found.push({ kind: 'structure', distance: built.distance, structure: s, text });
    }
    const water = this.#waterAlong(origin, direction, reach);
    if (water) found.push({ kind: 'water', distance: water.distance, salty: water.salty, text: water.salty ? 'Sea water: too salty to drink' : 'Drink' });
    found.sort((a, b) => a.distance - b.distance);
    return found[0] ?? null;
  }

  // The water a ray meets (within reach), if any: { distance, salty }.
  #waterAlong(origin, direction, reach) {
    for (let t = 0.3; t <= reach + 0.8; t += 0.25) {
      const x = origin.x + direction.x * t, y = origin.y + direction.y * t, z = origin.z + direction.z * t;
      const w = this.waterAt(x, z);
      if (w && y < w.level + 0.05) {
        const salty = !!w.lake && this.generator().getOceanness(x, z) > 0.5;
        return { distance: t, salty };
      }
      const g = this.groundAt(x, z);
      if (Number.isFinite(g) && y < g) return null;
    }
    // (Standing in it, looking down at it.)
    const here = this.waterAt(origin.x, origin.z);
    if (here && direction.y < -0.5 && origin.y - here.level < 2.2) return { distance: 1, salty: !!here.lake && this.generator().getOceanness(origin.x, origin.z) > 0.5 };
    return null;
  }

  /** E: picks up, picks fruit, drinks, butchers, opens a chest, takes something down. */
  interact(ray) {
    const t = this.#target(ray);
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
        const left = this.inventory.add(Inventory.stack(id, n));
        if (left) this.items.drop(Inventory.stack(id, left), t.animal.x, t.animal.y + 0.5, t.animal.z);
        lines.push(`${ITEMS[id].name} ×${n}`);
      }
      this.sound?.call('chop', 0, 0.4);
      return this.hotbar?.flash(lines.join(', '));
    }
    if (t.kind === 'fruit') {
      if (!t.ripe || t.picked) return this.hotbar?.flash(t.text);
      const id = FRUIT[t.tree.type];
      const n = id === 'apple' ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3);
      const left = this.inventory.add(Inventory.stack(id, n));
      if (left === n) return this.hotbar?.flash('Your hands are full');
      this.harvested.set(t.tree.key, this.time);
      this.sound?.call('pickup', 0, 0.5);
      return this.hotbar?.flash(`${ITEMS[id].name} ×${n - left}`);
    }
    if (t.kind === 'structure') {
      const s = t.structure;
      if (s.type === 'chest') {
        this.hud.openChest(s.contents, this.inventory);
        return this.#menu(true);
      }
      if (s.type === 'campfire' && s.lit) return this.hotbar?.flash('Too hot to take down: let it burn out');
      if (s.type === 'chest' && s.contents.slots.some(Boolean)) return this.hotbar?.flash('Empty it first');
      const left = this.inventory.add(Inventory.stack(s.type, 1));
      if (left) return this.hotbar?.flash('Your hands are full');
      this.structures.remove(s);
      return this.hotbar?.flash(`${ITEMS[s.type].name} taken down`);
    }
    if (t.kind === 'water') {
      if (t.salty) return this.hotbar?.flash(t.text);
      this.survival.consume({ thirst: 22 });
      this.sound?.call('drink', 0, 0.5);
      return this.hotbar?.flash('You drink');
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
    const left = this.inventory.add(Inventory.stack(id, 1));
    if (left) this.items.drop(Inventory.stack(id, 1), this.camera.position.x, this.camera.position.y - 1, this.camera.position.z);
    this.sound?.call('craft', 0, 0.5);
    this.hotbar?.flash(`Made: ${ITEMS[id].name}${left ? ' (on the ground: no room)' : ''}`);
  }

  // --- Using what's in your hand -------------------------------------------------------

  /** Click: uses what you're holding, at what you point at. */
  use(ray, placeTorch) {
    if (!this.walking || !this.survival.alive || this.hud.busy || this.cooldown > 0) return;
    const i = this.hotbar.index;
    const s = this.inventory.slots[i];
    const { origin, direction } = this.#ray(ray);
    const item = s && ITEMS[s.id];
    if (!s) return this.#bareHands(origin, direction);
    if (s.id === 'axe') return this.#axe(i, origin, direction);
    if (s.id === 'spear') return this.#stab(i, origin, direction);
    if (s.id === 'flintSteel') {
      const built = this.structures.pick(origin, direction, REACH);
      const fire = built?.structure.type === 'campfire' ? built.structure : null;
      this.swing = 0.25;
      this.cooldown = 0.5;
      this.sound?.call('strike', 0, 0.5);
      this.inventory.wear(i, 1);
      if (!fire) return this.hotbar?.flash('Strike it at a campfire to light it');
      if (fire.lit) return this.hotbar?.flash('It is already burning');
      if (Math.random() < 0.35) return this.hotbar?.flash('Sparks, but it didn’t catch: again');
      if (!this.structures.light(fire)) return this.hotbar?.flash('Nothing left to burn: add a log');
      this.sound?.call('crackle', 0, 0.6);
      return this.hotbar?.flash('The fire catches');
    }
    // A log onto a campfire; meat onto a burning one.
    const built = this.structures.pick(origin, direction, REACH);
    const fire = built?.structure.type === 'campfire' ? built.structure : null;
    if (fire && s.id === 'log') {
      if (!this.structures.feed(fire)) return this.hotbar?.flash('It has all the wood it can take');
      this.inventory.take(i);
      this.cooldown = 0.3;
      return this.hotbar?.flash(fire.lit ? 'The fire burns on' : 'Wood on the fire: light it with flint and steel');
    }
    if (fire?.lit && item.cooks) {
      this.inventory.take(i);
      this.inventory.add(Inventory.stack(item.cooks, 1), i);
      this.cooldown = 0.6;
      this.sound?.call('crackle', 0, 0.5);
      return this.hotbar?.flash(`Cooked: ${ITEMS[item.cooks].name}`);
    }
    if (item.food) {
      this.inventory.take(i);
      this.survival.consume(item.food);
      this.cooldown = 0.6;
      this.swing = 0.3;
      this.sound?.call('eat', 0, 0.5);
      return this.hotbar?.flash(`Ate: ${item.name}${item.food.health < 0 ? ' (raw: it makes you sick)' : ''}`);
    }
    if (item.wear) {
      const worn = this.inventory.worn;
      this.inventory.worn = { ...s };
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

  /** Right-click: throws a spear; otherwise the same as E. */
  alt(ray) {
    if (!this.walking || !this.survival.alive || this.hud.busy) return;
    const i = this.hotbar.index;
    const s = this.inventory.slots[i];
    if (s?.id === 'spear' && this.cooldown <= 0) return this.#throw(i, ray);
    this.interact(ray);
  }

  #bareHands(origin, direction) {
    const t = this.#target({ origin, direction });
    if (t) return this.interact({ origin, direction });
    this.hotbar?.flash('Empty hand: pick things up with E');
  }

  #axe(i, origin, direction) {
    this.swing = 0.35;
    this.cooldown = 0.55;
    const animal = this.wildlife.aim(origin, direction, REACH);
    const fallen = this.felling.pickFallen(origin, direction, REACH);
    const tree = this.trees.pick(origin, direction, REACH);
    const near = [animal && { k: 'animal', d: animal.distance }, fallen && { k: 'fallen', d: fallen.distance }, tree && { k: 'tree', d: tree.distance }].filter(Boolean).sort((a, b) => a.d - b.d)[0];
    if (!near) return this.sound?.call('flutter', 0, 0.1);
    if (near.k === 'animal') return this.#strike(i, animal, 'axe');
    this.inventory.wear(i, 1);
    this.sound?.call('chop', 0, 0.7);
    const ground = (x, z) => this.groundAt(x, z);
    if (near.k === 'fallen') {
      if (this.felling.chopFallen(fallen.fallen, origin, ground)) this.hotbar?.flash('Chopped into logs');
      return;
    }
    const result = this.felling.chop(tree, origin, ground);
    if (result === 'fell') {
      this.sound?.call('creak', 0, 0.7);
      this.hotbar?.flash('Timber!');
    } else if (result === 'bush') {
      const n = 1 + Math.floor(Math.random() * 2);
      this.items.drop(Inventory.stack('stick', n), tree.x, tree.y + 0.8, tree.z);
      this.dirty = true;
    }
    this.dirty = true;
  }

  #stab(i, origin, direction) {
    this.swing = 0.3;
    this.cooldown = 0.75;
    const animal = this.wildlife.aim(origin, direction, REACH + 0.4);
    if (!animal) return;
    this.#strike(i, animal, 'spear');
  }

  #strike(i, hit, weapon) {
    const a = hit.animal;
    const outcome = this.wildlife.wound(a, { head: hit.head, from: this.camera.position });
    this.inventory.wear(i, 1);
    this.sound?.call('thunk', 0, 0.6);
    this.#report(a, outcome, hit.head, weapon);
  }

  #report(a, outcome, head) {
    const name = NAMES[a.kind] ?? 'animal';
    const text = { dead: `The ${name} is dead`, down: head ? `A blow to the head: the ${name} is down` : `The ${name} is down: finish it`, lame: `The ${name} is limping`, hit: `You wounded the ${name}` }[outcome];
    if (text) this.hotbar?.flash(text);
  }

  #throw(i, ray) {
    const s = this.inventory.take(i);
    const { origin, direction } = this.#ray(ray);
    const mesh = new Mesh(this.items.model('spear'), this.items.material);
    mesh.castShadow = true;
    const pos = origin.clone().addScaledVector(direction, 0.6);
    pos.y -= 0.15;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.spears.push({ mesh, pos, vel: direction.clone().multiplyScalar(28).add(new Vector3(0, 1.2, 0)), stack: s, life: 6 });
    this.cooldown = 0.6;
    this.sound?.call('whoosh', 0, 0.5);
  }

  #flySpears(dt) {
    for (const sp of this.spears) {
      sp.life -= dt;
      const step = sp.vel.length() * dt;
      dir.copy(sp.vel).normalize();
      // Into a creature?
      const hit = this.wildlife.aim(sp.pos, dir, step + 0.3);
      if (hit && !sp.done) {
        const outcome = this.wildlife.wound(hit.animal, { head: hit.head, from: this.camera.position });
        this.sound?.call('thunk', 0, 0.7);
        this.#report(hit.animal, outcome, hit.head);
        sp.stack.dur = (sp.stack.dur ?? 1) - 2;
        if (sp.stack.dur > 0) this.items.drop(sp.stack, hit.animal.x + rnd(-0.5, 0.5), hit.animal.y + 1, hit.animal.z + rnd(-0.5, 0.5), { turn: rnd(0, 6.28) });
        else this.hotbar?.flash('The spear broke');
        sp.done = true;
        continue;
      }
      sp.pos.addScaledVector(sp.vel, dt);
      sp.vel.y -= 9.8 * dt;
      sp.mesh.position.copy(sp.pos);
      sp.mesh.quaternion.setFromUnitVectors(FORWARD, dir);
      // Into the ground: it sticks there.
      const g = this.groundAt(sp.pos.x, sp.pos.z);
      if ((Number.isFinite(g) && sp.pos.y < g + 0.1) || sp.life <= 0) {
        sp.done = true;
        sp.stack.dur = (sp.stack.dur ?? 1) - 1;
        if (sp.stack.dur > 0) {
          const tilt = q.setFromUnitVectors(FORWARD, dir).clone();
          const y = Number.isFinite(g) ? g : sp.pos.y;
          const d = this.items.drop(sp.stack, sp.pos.x - dir.x * 0.5, y + 0.3, sp.pos.z - dir.z * 0.5, { tilt });
          d.settled = true;
          d.y = y + 0.35;
          d.mesh.position.set(d.x, d.y, d.z);
          this.sound?.call('thunk', 0, 0.3);
        } else this.hotbar?.flash('The spear broke');
      }
    }
    for (const sp of this.spears.filter((x) => x.done)) this.scene.remove(sp.mesh);
    this.spears = this.spears.filter((x) => !x.done);
  }

  // --- Each frame --------------------------------------------------------------------------

  /**
   * @param ctx { time, wind, light (Color), night, rain, snowing, day,
   *              winter, spring, autumn, summer, planPoint(origin, dir,
   *              reach) (where the ground is under the crosshair), }
   * Returns the extra lights (campfires, a torch in your hand) for the torches' pool.
   */
  update(dt, ctx) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const cam = this.camera.position;
    const ground = (x, z) => this.groundAt(x, z);
    this.items.update(dt, ground);
    this.felling.update(dt, ground, (x, y, z, size) => {
      const d = Math.hypot(x - cam.x, z - cam.z);
      this.sound?.call('treefall', 0, Math.min(1, 0.4 + size / 20) / (1 + d / 30));
    });
    this.#flySpears(dt);
    const lights = this.structures.update(dt, ctx);
    const walking = this.walking;
    const held = this.inventory.slots[this.hotbar.index];

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
    }
    const fire = this.structures.warmthAt(cam.x, cam.y - this.controls.eyeHeight, cam.z);
    const jumped = this.controls.takeJumps();
    const worn = this.inventory.worn;
    const e = {
      active: walking && this.survival.alive,
      moving: this.controls.moving, sprinting: this.controls.sprinting, swimming: this.controls.swimming, jumped,
      heat: heat.heat, day: ctx.day, coat: !!worn, fire, inFire: walking && this.structures.inFire(cam.x, cam.z),
      winter: ctx.winter, spring: ctx.spring, autumn: ctx.autumn, summer: ctx.summer,
      seasonality: heat.seasonality, altitude: cam.y - this.controls.eyeHeight, night: ctx.night, rain: ctx.rain, snowing: ctx.snowing,
    };
    const wasAlive = this.survival.alive;
    this.survival.update(dt, e);
    // The coat wears out, keeping the cold off.
    if (worn && e.active && this.survival.cold > 0.03 && fire <= 0) {
      worn.dur -= dt * this.survival.cold;
      if (worn.dur <= 0) {
        this.inventory.worn = null;
        this.hotbar?.flash('Your coat has worn through');
        this.inventory.changed();
      }
    }
    // Food spoils.
    this.spoilWait = (this.spoilWait ?? 0) - dt;
    if (this.spoilWait <= 0) {
      const rotted = this.inventory.spoil(5 - this.spoilWait);
      this.items.spoil(5);
      this.spoilWait = 5;
      if (rotted.length) this.hotbar?.flash(`${rotted[0]} has gone off`);
    }
    if (wasAlive && !this.survival.alive) this.#die();

    // What's under the crosshair: what E would do, and where a thing to be built would go.
    let prompt = null;
    this.plan = null;
    if (walking && this.survival.alive && !this.hud.busy) {
      const origin = cam, direction = this.camera.getWorldDirection(dir.clone());
      const t = this.#target({ origin, direction });
      const item = held && ITEMS[held.id];
      if (item?.place && item.place !== 'torch') {
        const at = ctx.planPoint(origin, direction, 6.5) ?? v.copy(origin).addScaledVector(direction.setY(0).normalize(), 3);
        const yaw = this.controls.euler.y + (item.place === 'wall' ? Math.PI : 0);
        this.plan = this.structures.plan(item.place, at, yaw, ground, (x, z) => !!this.waterAt(x, z));
        this.structures.preview(this.plan);
        prompt = this.plan.ok ? `<kbd>Click</kbd> Build ${item.name.toLowerCase()}` : this.plan.why;
      } else this.structures.preview(null);
      if (!prompt && t) prompt = `<kbd>E</kbd> ${t.text}`;
      if (!prompt && held) {
        const aimAt = held.id === 'axe' ? this.felling.pickFallen(origin, direction, REACH) || this.trees.pick(origin, direction, REACH) : null;
        if (aimAt) prompt = `<kbd>Click</kbd> Chop`;
      }
    } else this.structures.preview(null);
    this.hud.prompt(prompt);
    this.hud.update(this.survival, this.inventory, walking);

    // Held in your hand.
    this.#drawHeld(dt, held, walking);
    if (held?.id === 'torch' && walking) lights.push({ x: cam.x, y: cam.y - 0.2, z: cam.z, strength: 10, reach: 14 });

    // Saving now and then.
    this.saveWait -= dt;
    if (this.saveWait <= 0) {
      this.saveWait = 10;
      if (this.dirty) this.save();
    }
    return lights;
  }

  /** You've been hurt (by a wolf, a bear, a fall...). */
  hurt(amount, cause) {
    if (!this.walking) return;
    this.survival.hurt(amount, cause);
    this.sound?.call('hurt', 0, Math.min(1, 0.4 + amount / 30));
    this.shake = Math.min(1, (this.shake ?? 0) + amount / 25);
  }

  /** For the animals: where you are and what you're doing. */
  get player() {
    const p = this.camera.position, c = this.controls;
    return {
      x: p.x, y: p.y, z: p.z, mode: c.mode, crouch: c.crouch, moving: c.moving, sprint: c.sprinting, alive: this.survival.alive,
      damage: (amount, kind) => this.hurt(amount, ATTACKERS[kind] ?? `a ${NAMES[kind] ?? kind}`),
    };
  }

  #die() {
    // What you carried lies where you fell.
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
  }

  respawn() {
    if (this.spawn) this.camera.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
    this.controls.velocityY = 0;
    this.newLife();
    this.#menu(false);
  }

  // --- What's in your hand, drawn in front of you -----------------------------------------

  #heldModel() {
    this.hand = new Group();
    this.hand.name = 'held item';
    this.camera.add(this.hand);
    this.handMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true, depthTest: false, depthWrite: false, transparent: true });
    this.handFlame = new Mesh(new OctahedronGeometry(0.06, 0), new MeshBasicMaterial({ color: 0xffa040, depthTest: false, transparent: true }));
    this.handFlame.scale.set(1, 1.7, 1);
    this.heldId = null;
  }

  #drawHeld(dt, held, walking) {
    const id = walking && this.survival.alive && !this.hud.busy ? held?.id ?? null : null;
    if (id !== this.heldId) {
      this.heldId = id;
      this.hand.clear();
      if (id) {
        const geometry = id === 'torch' ? this.items.model('stick') : this.items.model(id);
        const mesh = new Mesh(geometry, this.handMaterial);
        mesh.renderOrder = 999;
        this.handFlame.renderOrder = 1000;
        // (Each held its own way.)
        if (id === 'spear') mesh.rotation.set(-0.12, Math.PI + 0.08, 0), mesh.position.set(0.05, 0, -0.1), mesh.scale.setScalar(0.7);
        else if (id === 'axe') mesh.rotation.set(0.1, 0, -0.3), mesh.position.set(0.02, -0.2, 0), mesh.scale.setScalar(0.62);
        else if (id === 'torch') {
          mesh.rotation.set(0, 0, Math.PI / 2 - 0.2), mesh.scale.setScalar(0.7);
          this.handFlame.position.set(0.02, 0.33, 0);
          this.hand.add(this.handFlame);
        } else if (id === 'log') mesh.rotation.set(0, 0.8, 0), mesh.scale.setScalar(0.45), mesh.position.set(0, -0.1, 0);
        else mesh.scale.setScalar(ITEMS[id].place ? 0.35 : 0.8);
        this.hand.add(mesh);
      }
    }
    // Swinging, bobbing as you walk.
    this.swing = Math.max(0, this.swing - dt);
    this.bob = (this.bob ?? 0) + dt * (this.controls.moving ? (this.controls.sprinting ? 13 : 8) : 0);
    const s = this.swing > 0 ? Math.sin((this.swing / 0.35) * Math.PI) : 0;
    const low = this.controls.crouch ? 0.03 : 0;
    this.hand.position.set(0.3 + Math.sin(this.bob) * 0.015, -0.33 - Math.abs(Math.cos(this.bob)) * 0.02 - low - s * 0.05, -0.7 - s * 0.15);
    this.hand.rotation.set(-s * 1.1, 0, 0);
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
