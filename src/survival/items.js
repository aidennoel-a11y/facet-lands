// Everything you can carry: what it's called, how many go in a slot (ten,
// but a tool is one to a slot), how long a tool lasts (`durability`: uses),
// what eating it does, how long food keeps (`spoils`: seconds; food in a
// chest keeps), how heavy it is (`weight`, kg), and what it becomes when
// you set it down (`place`). And the recipes to make things.

export const STACK = 10;

export const ITEMS = {
  // Materials.
  stick: { name: 'Stick', weight: 0.3, group: 'Materials' },
  rock: { name: 'Small rock', weight: 1, group: 'Materials' },
  flint: { name: 'Flint', weight: 0.4, group: 'Materials' },
  log: { name: 'Log', weight: 9, group: 'Materials' },
  vine: { name: 'Plant vine', weight: 0.2, group: 'Materials' },
  iron: { name: 'Iron ore', weight: 2.5, group: 'Materials' },
  ironBar: { name: 'Iron bar', weight: 2, group: 'Materials' },
  hide: { name: 'Raw hide', weight: 2.5, spoils: 3000, tans: 'deerSkin', group: 'Materials' }, // (tanned on a rack into leather; rots if not)
  fur: { name: 'Raw fur', weight: 1.5, spoils: 3000, tans: 'pelt', group: 'Materials' },
  deerSkin: { name: 'Leather', weight: 2, group: 'Materials' },
  pelt: { name: 'Tanned fur', weight: 1.2, group: 'Materials' },
  wool: { name: 'Wool', weight: 0.5, group: 'Materials' },
  feather: { name: 'Feather', weight: 0.01, group: 'Materials' },
  rope: { name: 'Rope', weight: 0.6, place: 'rope', group: 'Materials' }, // (thrown down a cliff from its top, to climb)
  charcoal: { name: 'Charcoal', weight: 0.3, group: 'Materials' },
  steelBar: { name: 'Steel bar', weight: 2, group: 'Materials' },
  // (Up high in the mountains: coal, and the dark ore steel is made from.
  // On the mesa tops: gold.)
  mountainOre: { name: 'Mountain iron ore', weight: 3, group: 'Materials' },
  coal: { name: 'Coal', weight: 0.5, group: 'Materials' },
  goldOre: { name: 'Gold ore', weight: 2, group: 'Materials' },
  goldBar: { name: 'Gold bar', weight: 2.5, group: 'Materials' },
  // Trophies: what only the great beasts give (see Wildlife BOSSES), each
  // for its own recipe.
  grizzlyPelt: { name: "Old Scar's pelt", weight: 4, group: 'Trophies' },
  alphaFang: { name: "Greymane's fang", weight: 0.2, group: 'Trophies' },
  paleFur: { name: "The Pale Ghost's fur", weight: 2, group: 'Trophies' },
  greatAntlers: { name: "The Old Bull's antlers", weight: 6, group: 'Trophies' },
  greatHide: { name: "Thunderhead's great hide", weight: 6, group: 'Trophies' },
  crocHide: { name: "Old Jaw's hide", weight: 5, group: 'Trophies' },
  lionPelt: { name: "Kingmane's pelt", weight: 3, group: 'Trophies' },
  tigerPelt: { name: "The Striped Shadow's pelt", weight: 3, group: 'Trophies' },
  venomSac: { name: "The Old Rattler's venom", weight: 0.3, group: 'Trophies' },
  boarTusk: { name: "Ironhide's tusks", weight: 1.5, group: 'Trophies' },
  caveBearPelt: { name: "The Cave Bear's pelt", weight: 5, group: 'Trophies' },
  seedWheat: { name: 'Wheat seeds', weight: 0.05, sow: 'wheat', group: 'Farming' },
  seedCorn: { name: 'Corn kernels', weight: 0.05, sow: 'corn', group: 'Farming' },
  seedPotato: { name: 'Seed potato', weight: 0.2, sow: 'potato', group: 'Farming' },
  seedCarrot: { name: 'Carrot seeds', weight: 0.05, sow: 'carrot', group: 'Farming' },
  wheat: { name: 'Wheat', weight: 0.3, group: 'Farming' },
  // Food.
  berries: { name: 'Berries', food: { hunger: 8, thirst: 3 }, spoils: 1500, weight: 0.1, group: 'Food' },
  apple: { name: 'Apple', food: { hunger: 12, thirst: 5 }, spoils: 2400, weight: 0.2, group: 'Food' },
  mushroom: { name: 'Mushroom', food: { hunger: 6 }, spoils: 1500, weight: 0.1, group: 'Food' },
  rawMeat: { name: 'Raw meat', food: { hunger: 10, health: -4, sick: 0.5 }, spoils: 900, cooks: 'cookedMeat', dries: 'jerky', weight: 1, group: 'Food' },
  cookedMeat: { name: 'Cooked meat', food: { hunger: 35, health: 4 }, spoils: 2400, weight: 0.8, group: 'Food' },
  rawFish: { name: 'Raw fish', food: { hunger: 8, health: -3, sick: 0.5 }, spoils: 700, cooks: 'cookedFish', dries: 'jerky', weight: 0.8, group: 'Food' },
  cookedFish: { name: 'Cooked fish', food: { hunger: 25, health: 3 }, spoils: 1800, weight: 0.6, group: 'Food' },
  jerky: { name: 'Jerky', food: { hunger: 22 }, weight: 0.3, group: 'Food' }, // (dried: it keeps)
  corn: { name: 'Ear of corn', food: { hunger: 8 }, spoils: 3000, cooks: 'roastCorn', weight: 0.3, group: 'Food' },
  roastCorn: { name: 'Roast corn', food: { hunger: 22, health: 2 }, spoils: 2400, weight: 0.3, group: 'Food' },
  potato: { name: 'Potato', food: { hunger: 5, health: -1 }, spoils: 6000, cooks: 'bakedPotato', weight: 0.3, group: 'Food' },
  bakedPotato: { name: 'Baked potato', food: { hunger: 26, health: 3 }, spoils: 2400, weight: 0.3, group: 'Food' },
  carrot: { name: 'Carrot', food: { hunger: 9, thirst: 2 }, spoils: 3600, weight: 0.15, group: 'Food' },
  dough: { name: 'Dough', food: { hunger: 4, health: -1 }, spoils: 1200, cooks: 'bread', weight: 0.5, group: 'Food' },
  bread: { name: 'Bread', food: { hunger: 32, health: 3 }, spoils: 6000, weight: 0.4, group: 'Food' },
  stew: { name: 'Stew', food: { hunger: 50, thirst: 25, health: 12, cure: true }, spoils: 1800, weight: 1, group: 'Food' },
  // Tools and weapons.
  axe: { name: 'Stone axe', tool: true, durability: 90, weight: 1.5, sharp: 1, group: 'Tools' },
  pickaxe: { name: 'Stone pickaxe', tool: true, durability: 90, weight: 1.8, group: 'Tools' },
  spear: { name: 'Spear', tool: true, durability: 40, weight: 1.5, sharp: 1, group: 'Tools' },
  flintSteel: { name: 'Flint and steel', tool: true, durability: 25, weight: 0.3, group: 'Tools' },
  steelAxe: { name: 'Iron axe', tool: true, durability: 180, weight: 2, chop: 2, sharp: 1.5, group: 'Tools' },
  steelPickaxe: { name: 'Iron pickaxe', tool: true, durability: 180, weight: 2.2, group: 'Tools' },
  steelSpear: { name: 'Iron spear', tool: true, durability: 80, weight: 1.8, sharp: 1.5, group: 'Tools' },
  // (Forged of steel at an anvil: far longer-lasting, and sharper.)
  forgedAxe: { name: 'Steel axe', tool: true, durability: 400, weight: 1.8, chop: 3, sharp: 2, group: 'Tools' },
  forgedPickaxe: { name: 'Steel pickaxe', tool: true, durability: 400, weight: 2, group: 'Tools' },
  forgedSpear: { name: 'Steel spear', tool: true, durability: 180, weight: 1.6, sharp: 2, group: 'Tools' },
  sword: { name: 'Steel sword', tool: true, durability: 260, weight: 1.6, sharp: 3, group: 'Tools' }, // (quick, deep cuts: see Game.#stab)
  fangSword: { name: 'Fang sword', tool: true, durability: 360, weight: 1.6, sharp: 4, group: 'Tools' }, // (Greymane's fang set in its hilt: the keenest blade)
  antlerBow: { name: 'Antler bow', tool: true, durability: 240, weight: 1.4, power: 1.5, group: 'Tools' }, // (stiffer: arrows fly further and strike harder)
  tuskPickaxe: { name: 'Tusk pickaxe', tool: true, durability: 500, weight: 2.2, group: 'Tools' },
  poisonArrow: { name: 'Venom arrow', weight: 0.05, venom: true, group: 'Tools' },
  poisonBolt: { name: 'Venom bolt', weight: 0.08, venom: true, group: 'Tools' },
  greatSaddle: { name: 'Great saddle', weight: 7, group: 'Tools' }, // (a horse under it gallops further)
  crossbow: { name: 'Crossbow', tool: true, durability: 200, weight: 3, group: 'Tools' },
  bolt: { name: 'Crossbow bolt', weight: 0.08, group: 'Tools' },
  hoe: { name: 'Hoe', tool: true, durability: 80, weight: 1.4, group: 'Tools' },
  shears: { name: 'Shears', tool: true, durability: 60, weight: 0.4, group: 'Tools' },
  fineFlintSteel: { name: 'Flint and forged steel', tool: true, durability: 50, weight: 0.3, group: 'Tools' },
  bow: { name: 'Bow', tool: true, durability: 120, weight: 1, group: 'Tools' },
  arrow: { name: 'Arrow', weight: 0.05, group: 'Tools' },
  fishingRod: { name: 'Fishing rod', tool: true, durability: 60, weight: 0.8, group: 'Tools' },
  waterskin: { name: 'Waterskin', tool: true, weight: 0.4, holds: 5, group: 'Tools' }, // (water: 0..5 drinks; clean or not)
  pot: { name: 'Iron pot', tool: true, durability: 60, weight: 2, group: 'Tools' },
  bandage: { name: 'Bandage', weight: 0.05, group: 'Tools' },
  saddle: { name: 'Saddle', weight: 6, group: 'Tools' }, // (on a tame horse: see Game)
  torch: { name: 'Torch', place: 'torch', weight: 0.4, group: 'Tools' },
  // Worn.
  coat: { name: 'Leather coat', tool: true, wear: 'coat', warmth: 0.3, weight: 2, group: 'Worn' },
  furCloak: { name: 'Fur cloak', tool: true, wear: 'coat', warmth: 0.15, weight: 2.5, group: 'Worn' },
  // (`protect`: how much of a bite or a blow still gets through.)
  armour: { name: 'Leather armour', tool: true, wear: 'armour', durability: 40, protect: 0.55, weight: 4, group: 'Worn' },
  steelArmour: { name: 'Steel armour', tool: true, wear: 'armour', durability: 160, protect: 0.3, weight: 9, group: 'Worn' },
  // (Steel lined with a great beast's pelt or hide: the best there is.)
  scarArmour: { name: 'Scar-pelt armour', tool: true, wear: 'armour', durability: 240, protect: 0.22, weight: 10, group: 'Worn' },
  lionArmour: { name: 'Lion-mane armour', tool: true, wear: 'armour', durability: 240, protect: 0.22, weight: 9, group: 'Worn' },
  tigerArmour: { name: 'Tiger-stripe armour', tool: true, wear: 'armour', durability: 240, protect: 0.22, weight: 9, group: 'Worn' },
  crocArmour: { name: 'Croc-scale armour', tool: true, wear: 'armour', durability: 340, protect: 0.16, weight: 11, group: 'Worn' },
  paleCloak: { name: 'Ghost cloak', tool: true, wear: 'coat', warmth: 0.12, hush: true, weight: 2, group: 'Worn' }, // (pale and soft: the wild notice you less)
  caveCloak: { name: 'Cave bear cloak', tool: true, wear: 'coat', warmth: 0.05, weight: 4, group: 'Worn' }, // (the warmest thing there is)
  // Built.
  campfire: { name: 'Campfire', place: 'campfire', weight: 12, group: 'Building' },
  furnace: { name: 'Stone furnace', place: 'furnace', weight: 20, group: 'Building' },
  wall: { name: 'Palisade wall', place: 'wall', weight: 20, group: 'Building' },
  gate: { name: 'Palisade gate', place: 'gate', weight: 18, group: 'Building' },
  stake: { name: 'Sharpened log', place: 'stake', weight: 8, group: 'Building' },
  chest: { name: 'Chest', place: 'chest', weight: 10, group: 'Building' },
  bed: { name: 'Bed', place: 'bed', weight: 8, group: 'Building' },
  dryingRack: { name: 'Drying rack', place: 'dryingRack', weight: 3, group: 'Building' },
  snare: { name: 'Snare', place: 'snare', weight: 0.5, group: 'Building' },
  raft: { name: 'Raft', place: 'raft', weight: 25, group: 'Building' },
  roof: { name: 'Thatched roof', place: 'roof', weight: 22, group: 'Building' },
  hideRoof: { name: 'Great-hide roof', place: 'roof', weight: 14, group: 'Building' }, // (a shelter roofed with Thunderhead's hide)
  fence: { name: 'Fence', place: 'fence', weight: 8, group: 'Building' },
  fenceGate: { name: 'Fence gate', place: 'fenceGate', weight: 7, group: 'Building' },
  anvil: { name: 'Anvil', place: 'anvil', weight: 30, group: 'Building' },
  grindstone: { name: 'Grindstone', place: 'grindstone', weight: 18, group: 'Building' },
  tanningRack: { name: 'Tanning rack', place: 'tanningRack', weight: 4, group: 'Building' },
};
// Testing: a spawner for each animal (click the ground to set one down,
// tame or not as the panel says), to look at them. See Game and Hud.
export const SPAWNABLE = {
  deer: 'Deer', elk: 'Elk', moose: 'Moose', bison: 'Bison', blackBear: 'Black bear', grizzly: 'Grizzly bear', wolf: 'Wolf', coyote: 'Coyote', fox: 'Fox',
  cougar: 'Cougar', boar: 'Wild boar', sheep: 'Sheep', rabbit: 'Rabbit', hare: 'Hare', turkey: 'Turkey', mountainGoat: 'Mountain goat', snake: 'Rattlesnake',
  tiger: 'Tiger', jaguar: 'Jaguar', panther: 'Black panther', panda: 'Giant panda', crocodile: 'Crocodile', python: 'Python',
  horse: 'Horse', lion: 'Lioness', maleLion: 'Lion (male)', hyena: 'Hyena', elephant: 'Elephant', hippo: 'Hippo', camel: 'Camel', scorpion: 'Scorpion',
};
for (const [kind, name] of Object.entries(SPAWNABLE)) {
  ITEMS[`spawn_${kind}`] = { name: `${name} spawner`, tool: true, spawns: kind === 'maleLion' ? 'lion' : kind, male: kind === 'maleLion', weight: 0, group: 'Spawners' };
}
// (And the great beasts: see Wildlife BOSSES.)
const BOSS_SPAWNABLE = { scar: 'Old Scar', greymane: 'Greymane', ghost: 'The Pale Ghost', oldBull: 'The Old Bull', thunderhead: 'Thunderhead', oldJaw: 'Old Jaw', kingmane: 'Kingmane', shadow: 'The Striped Shadow', rattler: 'The Old Rattler', ironhide: 'Ironhide', caveBear: 'The Cave Bear' };
for (const [id, name] of Object.entries(BOSS_SPAWNABLE)) ITEMS[`spawn_boss_${id}`] = { name: `${name} spawner`, tool: true, spawns: id, boss: id, weight: 0, group: 'Spawners' };

// Tools that can be put to the grindstone (their edges ground back), and how many times.
export const GRINDS = 3;
export const BLADES = new Set(['axe', 'spear', 'steelAxe', 'steelSpear', 'pickaxe', 'steelPickaxe', 'forgedAxe', 'forgedPickaxe', 'forgedSpear', 'shears', 'hoe']);

/** How many of `id` fit in one slot. */
export const stackOf = (id) => (ITEMS[id]?.tool ? 1 : STACK);

/** What a stack weighs (kg). */
export const weightOf = (s) => (s ? (ITEMS[s.id]?.weight ?? 0.5) * s.count : 0);

export const RECIPES = [
  { id: 'axe', needs: { stick: 2, rock: 2 }, note: 'Chops trees; a weapon at a pinch' },
  { id: 'pickaxe', needs: { stick: 2, rock: 3 }, note: 'Breaks rock: boulders and rock faces give stone, flint and iron ore' },
  { id: 'spear', needs: { log: 1, rock: 1, vine: 1 }, note: 'Click to stab, right-click to throw' },
  { id: 'flintSteel', needs: { flint: 1, iron: 1 }, note: 'Lights campfires and furnaces' },
  { id: 'torch', needs: { stick: 1, vine: 1 }, note: 'Light to carry or set down' },
  { id: 'bow', needs: { stick: 2, vine: 2 }, note: 'Hold the mouse to draw, let go to shoot' },
  { id: 'arrow', needs: { stick: 1, flint: 1 }, makes: 4, note: 'Four arrows (fletched with a feather they fly truer)' },
  { id: 'fishingRod', needs: { stick: 2, vine: 2 }, note: 'Cast into water, click again when it bites' },
  { id: 'waterskin', needs: { deerSkin: 1, vine: 1 }, note: 'Fill it at water (E); boil it on a fire to make it safe' },
  { id: 'bandage', needs: { vine: 2 }, makes: 2, note: 'Stops bleeding' },
  { id: 'campfire', needs: { log: 3 }, note: 'Set it down, then light it with flint and steel' },
  { id: 'furnace', needs: { rock: 10 }, note: 'Burns logs; smelts iron ore into bars' },
  { id: 'stake', needs: { log: 1 }, note: 'One sharpened log, stood upright' },
  { id: 'wall', needs: { log: 5, vine: 1 }, note: 'A section of palisade: walls join end to end' },
  { id: 'gate', needs: { log: 4, vine: 2 }, note: 'Joins a palisade; E to open and close' },
  { id: 'chest', needs: { log: 5 }, note: 'Holds ten stacks; food in it keeps' },
  { id: 'bed', needs: { log: 2, wool: 3 }, note: 'Sleep the night through; you wake here after dying' },
  { id: 'dryingRack', needs: { stick: 4, vine: 2 }, note: 'Dries raw meat and fish into jerky that keeps' },
  { id: 'snare', needs: { stick: 2, vine: 2 }, note: 'Set it in the grass: it catches rabbits' },
  { id: 'raft', needs: { log: 6, vine: 3 }, note: 'Set it on the water; E to climb aboard' },
  { id: 'rope', needs: { vine: 3 }, note: 'Throw it down from a cliff top (click at the edge) to climb up and down' },
  { id: 'tanningRack', needs: { stick: 4, vine: 2 }, note: 'Stretch raw hides and furs on it: leather and tanned fur' },
  { id: 'coat', needs: { deerSkin: 2, vine: 1 }, note: 'Wear it to keep the cold out far longer' },
  { id: 'furCloak', needs: { pelt: 3, rope: 1 }, note: 'The warmest thing to wear in the winter' },
  { id: 'armour', needs: { deerSkin: 3, vine: 2 }, note: 'Wear it: bites and blows hurt less' },
  { id: 'steelAxe', needs: { ironBar: 2, stick: 1, vine: 1 }, note: 'Twice the life, fells trees twice as fast' },
  { id: 'steelPickaxe', needs: { ironBar: 2, stick: 2 }, note: 'Twice the life of a stone one' },
  { id: 'steelSpear', needs: { ironBar: 1, log: 1, vine: 1 }, note: 'Twice the life of a stone spear' },
  { id: 'fineFlintSteel', needs: { flint: 1, ironBar: 1 }, note: 'Forged steel: twice the life' },
  { id: 'pot', needs: { ironBar: 1 }, note: 'On a burning fire with meat and berries or mushrooms: stew' },
  { id: 'hoe', needs: { stick: 2, rock: 1 }, note: 'Click the ground to dig a plot to sow seeds in' },
  { id: 'shears', needs: { ironBar: 1 }, note: 'Shear a tame sheep (E) for its wool' },
  { id: 'dough', needs: { wheat: 3 }, note: 'Bake it on a fire into bread that keeps' },
  { id: 'fence', needs: { log: 2, stick: 2 }, note: 'Low fencing, to pen sheep: fences join end to end' },
  { id: 'fenceGate', needs: { log: 1, stick: 3 }, note: 'A gate in a fence; E to open and close' },
  { id: 'roof', needs: { log: 4, vine: 3 }, note: 'Thatch on posts: under a roof with walls round you, you shelter from the weather' },
  { id: 'grindstone', needs: { rock: 6, log: 1, stick: 2 }, note: 'Click it with a worn blade to grind it keen again (three times at most)' },
  { id: 'anvil', needs: { ironBar: 4, log: 1 }, note: 'Forge steel tools at it (stand by it to craft them)' },
  { id: 'saddle', needs: { deerSkin: 4, rope: 1, ironBar: 1 }, note: 'Put it on a tame horse (E with it in hand), then ride' },
  { id: 'forgedAxe', needs: { steelBar: 2, stick: 1, deerSkin: 1 }, at: 'anvil', note: 'Steel: far longer-lasting, fells trees in half the blows, sharper' },
  { id: 'forgedPickaxe', needs: { steelBar: 2, stick: 2 }, at: 'anvil', note: 'Steel: far longer-lasting, breaks rock faster' },
  { id: 'forgedSpear', needs: { steelBar: 1, log: 1, deerSkin: 1 }, at: 'anvil', note: 'Steel: far longer-lasting; wounds twice as deep' },
  { id: 'crossbow', needs: { steelBar: 1, log: 1, rope: 1 }, at: 'anvil', note: 'Slow to wind, but a bolt flies straight and strikes hard' },
  { id: 'bolt', needs: { stick: 2, ironBar: 1, feather: 2 }, makes: 6, at: 'anvil', note: 'Six crossbow bolts' },
  { id: 'sword', needs: { steelBar: 2, deerSkin: 1 }, at: 'anvil', note: 'Quick to swing, cuts deep: the best blade there is' },
  { id: 'steelArmour', needs: { steelBar: 4, deerSkin: 2 }, at: 'anvil', note: 'Plates over leather: a bite or a blow does a third of the harm. Heavy' },
  { id: 'scarArmour', needs: { steelArmour: 1, grizzlyPelt: 1 }, at: 'anvil', note: "Steel lined with Old Scar's pelt: the best armour, and long-lasting" },
  { id: 'lionArmour', needs: { steelArmour: 1, lionPelt: 1 }, at: 'anvil', note: "Steel lined with Kingmane's pelt: the best armour" },
  { id: 'tigerArmour', needs: { steelArmour: 1, tigerPelt: 1 }, at: 'anvil', note: "Steel lined with the Striped Shadow's pelt: the best armour" },
  { id: 'crocArmour', needs: { steelArmour: 1, crocHide: 1 }, at: 'anvil', note: "Old Jaw's scaled hide over steel: the toughest armour of all" },
  { id: 'fangSword', needs: { sword: 1, alphaFang: 1 }, at: 'anvil', note: "Greymane's fang in the hilt, the edge reground: the keenest blade" },
  { id: 'antlerBow', needs: { bow: 1, greatAntlers: 1, rope: 1 }, note: "The Old Bull's antler stiffening the bow: further and harder" },
  { id: 'tuskPickaxe', needs: { forgedPickaxe: 1, boarTusk: 1 }, at: 'anvil', note: "Ironhide's tusks for points: breaks rock fastest, more ore" },
  { id: 'poisonArrow', needs: { arrow: 6, venomSac: 1 }, makes: 6, note: 'Arrows tipped with venom: a hit lames and weakens' },
  { id: 'poisonBolt', needs: { bolt: 6, venomSac: 1 }, makes: 6, note: 'Bolts tipped with venom: a hit lames and weakens' },
  { id: 'greatSaddle', needs: { greatHide: 1, steelBar: 1, rope: 1 }, note: "Thunderhead's hide: a horse under it gallops further and faster" },
  { id: 'hideRoof', needs: { greatHide: 1, log: 4 }, note: "A shelter roofed with Thunderhead's hide" },
  { id: 'paleCloak', needs: { paleFur: 1, pelt: 2 }, note: 'Pale and soft: warm, and the wild notice you less' },
  { id: 'caveCloak', needs: { caveBearPelt: 1, rope: 1 }, note: 'The warmest thing to wear there is' },
];

/**
 * The crafting tree: what you can make, in four tiers, each opened by
 * something the one before lets you do (see Game: progress). Everything
 * in RECIPES is in one of them.
 */
export const TIERS = [
  { id: 'stone', name: 'Stone', tag: 'From the start', ids: ['axe', 'pickaxe', 'spear', 'torch', 'bow', 'arrow', 'fishingRod', 'bandage', 'campfire', 'flintSteel', 'hoe', 'rope', 'stake', 'snare'] },
  { id: 'camp', name: 'Camp', tag: 'Set down a campfire', unlock: 'campfire', ids: ['waterskin', 'dryingRack', 'tanningRack', 'coat', 'armour', 'furCloak', 'chest', 'bed', 'furnace', 'fence', 'fenceGate', 'wall', 'gate', 'roof', 'raft', 'grindstone', 'dough'] },
  { id: 'iron', name: 'Iron', tag: 'Smelt iron ore into a bar in a furnace', unlock: 'ironBar', ids: ['steelAxe', 'steelPickaxe', 'steelSpear', 'fineFlintSteel', 'pot', 'shears', 'saddle', 'anvil'] },
  { id: 'steel', name: 'Steel', tag: 'Smelt mountain iron ore with coal in a furnace (both from high in the mountains)', unlock: 'steelBar', ids: ['forgedAxe', 'forgedPickaxe', 'forgedSpear', 'sword', 'steelArmour', 'crossbow', 'bolt'] },
  { id: 'trophy', name: 'Trophies', tag: 'Bring down one of the great beasts', unlock: 'trophy', ids: ['scarArmour', 'lionArmour', 'tigerArmour', 'crocArmour', 'fangSword', 'antlerBow', 'tuskPickaxe', 'poisonArrow', 'poisonBolt', 'greatSaddle', 'hideRoof', 'paleCloak', 'caveCloak'] },
];
/** The tier a recipe's in. */
export const tierOf = (id) => TIERS.find((t) => t.ids.includes(id)) ?? TIERS[0];

// Faceted little icons, in the game's style.
const STEEL = (s) => s.replaceAll('#8e8a84', '#b8c0c8').replaceAll('#c8c4bc', '#eef2f6').replaceAll('#5a5e68', '#9aa4b0').replaceAll('#a8acb4', '#e4e8ee');
const AXE = `<path d="M9 28L22 6l2.4 1.4L11.4 29.4z" fill="#8a5d38"/><path d="M17 8l8-4 3 7-8 4z" fill="#8e8a84"/><path d="M25 4l3 7 1-5z" fill="#c8c4bc"/><path d="M17 10l4 2 1-2-3-3z" fill="#4f6a34"/>`;
const PICK = `<path d="M15 30L17 9h2.4l-2 21z" fill="#8a5d38"/><path d="M4 11c5-6 19-6 24 0l-2 2c-5-4-15-4-20 0z" fill="#8e8a84"/><path d="M4 11l2 2-3 1z" fill="#c8c4bc"/><path d="M28 11l-2 2 3 1z" fill="#c8c4bc"/>`;
const SPEAR = `<path d="M5 29L24 10l1.6 1.6L6.6 30.6z" fill="#8a5d38"/><path d="M22 8l7-6-4 9z" fill="#5a5e68"/><path d="M29 2l-4 9 2-2z" fill="#a8acb4"/><path d="M21 11l3 1 1-2-2-2z" fill="#4f6a34"/>`;
const FLINTSTEEL = `<path d="M5 18l6-8 8 1 1 8-7 5z" fill="#3e4250"/><path d="M11 10l8 1-4 6z" fill="#5a6070"/><path d="M16 22c2-6 8-8 12-6l-2 3c-3-1-6 1-7 5z" fill="#9aa0a8"/><path d="M22 8l2-4 1 4 3-2-2 4z" fill="#ffb040"/>`;
const MEAT = (a, b) => `<path d="M6 15c1-6 12-9 18-5s3 12-3 14-15 0-15-9z" fill="${a}"/><path d="M10 14c3-3 9-4 12-1l-3 6z" fill="${b}"/><path d="M8 20l-4 4 3 2 3-4z" fill="#f0e6d6"/>`;
const FISH = (a, b) => `<path d="M4 16c5-7 15-7 20 0-5 7-15 7-20 0z" fill="${a}"/><path d="M24 16l5-5v10z" fill="${b}"/><path d="M8 16c3-4 9-4 12 0z" fill="${b}"/><circle cx="8" cy="15" r="1.2" fill="#1a1a1a"/>`;
export const ICONS = {
  stick: `<path d="M6 25L24 7l2 2L8 27z" fill="#8a5d38"/><path d="M24 7l2 2-3 1z" fill="#6b4a2f"/><path d="M13 18l-4-1 1 2z" fill="#6b4a2f"/>`,
  rock: `<path d="M7 21l4-8 9-2 6 7-3 7H10z" fill="#9a968e"/><path d="M11 13l9-2 6 7-9 1z" fill="#b8b4ac"/><path d="M10 25h13l-6-6z" fill="#7a766e"/>`,
  flint: `<path d="M8 20l5-11 9 1 3 9-8 6z" fill="#3e4250"/><path d="M13 9l9 1-4 7z" fill="#5a6070"/><path d="M8 20l9-3 0 8z" fill="#2c2f3a"/><path d="M22 10l3 9-7-2z" fill="#e8e2d4"/>`,
  log: `<path d="M5 13l18-6 4 10-18 6z" fill="#7a5232"/><path d="M5 13l4 10-2 1-4-9z" fill="#5a3c24"/><ellipse cx="25" cy="12" rx="3" ry="5.2" transform="rotate(-20 25 12)" fill="#d9b27a"/><ellipse cx="25" cy="12" rx="1.3" ry="2.4" transform="rotate(-20 25 12)" fill="#b88a50"/>`,
  vine: `<path d="M16 4c-6 5 6 9 0 14s6 9 0 11" fill="none" stroke="#4f8a34" stroke-width="2.4" stroke-linecap="round"/><path d="M16 9l-6-2 2 5zM17 17l6-1-3 5zM15 23l-6 0 3 4z" fill="#6fae4c"/>`,
  iron: `<path d="M7 21l3-9 8-4 7 6-1 9-10 3z" fill="#6a5048"/><path d="M10 12l8-4 7 6-8 2z" fill="#8a6a5a"/><path d="M12 16l3-1 1 3-3 1zM19 19l3-1v3l-2 1z" fill="#c8c0b8"/><path d="M14 22l3 0-1 2z" fill="#b87048"/>`,
  ironBar: `<path d="M4 20l6-8h18l-6 8z" fill="#c4ccd4"/><path d="M4 20h18v4H4z" fill="#8a949e"/><path d="M22 20l6-8v4l-6 8z" fill="#6e7882"/>`,
  deerSkin: `<path d="M8 6l16 0 2 6-3 3 3 8-5 3H11l-5-3 3-8-3-3z" fill="#a8743e"/><path d="M11 9h10l-1 14h-8z" fill="#c4945a"/><path d="M12 12l2 1-1 2zM18 16l2 1-1 2z" fill="#f0e0c0"/>`,
  wool: `<circle cx="11" cy="17" r="6" fill="#ece6d8"/><circle cx="19" cy="14" r="6" fill="#f6f2e8"/><circle cx="20" cy="21" r="5" fill="#e0d8c8"/><path d="M8 16c2-2 4-2 6 0M17 13c2-2 4-2 6 0" stroke="#c8bea8" fill="none"/>`,
  berries: `<circle cx="11" cy="18" r="4.2" fill="#b01830"/><circle cx="19" cy="16" r="4.2" fill="#c82038"/><circle cx="15" cy="23" r="4.2" fill="#a0142a"/><circle cx="10" cy="17" r="1.2" fill="#f0a0b0"/><path d="M15 6l2 7-4-1zM17 8l6-2-3 5z" fill="#4f8a34"/>`,
  apple: `<path d="M16 10c-6-3-11 2-10 8s6 10 10 8c4 2 9-2 10-8s-4-11-10-8z" fill="#c8261c"/><path d="M16 10c3-1 7 0 8 4l-6-1z" fill="#e05040"/><path d="M16 10l1-5" stroke="#5a3c24" stroke-width="1.6"/><path d="M17 6l6-2-3 4z" fill="#4f8a34"/>`,
  mushroom: `<path d="M5 16c1-7 21-7 22 0z" fill="#c49a60"/><path d="M13 16h6l1 11h-8z" fill="#ece0c4"/><path d="M8 13l4-4 4 1z" fill="#d8b478"/>`,
  rawMeat: MEAT('#c84848', '#e87070'),
  cookedMeat: MEAT('#7a3e1e', '#a85a2a'),
  rawFish: FISH('#8aa4b4', '#b8cad4'),
  cookedFish: FISH('#a8703a', '#c8904a'),
  jerky: `<path d="M6 10l18-3 3 4-18 4zM5 16l19-2 2 4-19 3zM7 22l17-1 2 4-17 1z" fill="#6a2e18"/><path d="M8 11l14-2M8 17l14-2M9 23l14-1" stroke="#8a4424" stroke-width="1"/>`,
  stew: `<path d="M4 15h24c0 7-5 12-12 12S4 22 4 15z" fill="#6a4a30"/><ellipse cx="16" cy="15" rx="12" ry="3.5" fill="#a8582a"/><circle cx="12" cy="14.5" r="1.5" fill="#d8b478"/><circle cx="19" cy="15.5" r="1.5" fill="#c82038"/><path d="M11 9c0-2 2-2 2-4M17 9c0-2 2-2 2-4" stroke="#c8c8c8" fill="none"/>`,
  axe: AXE,
  steelAxe: STEEL(AXE),
  pickaxe: PICK,
  steelPickaxe: STEEL(PICK),
  spear: SPEAR,
  steelSpear: STEEL(SPEAR),
  flintSteel: FLINTSTEEL,
  fineFlintSteel: FLINTSTEEL.replace('#9aa0a8', '#e4e8ee'),
  bow: `<path d="M8 3c12 4 16 16 12 26" fill="none" stroke="#8a5d38" stroke-width="2.6" stroke-linecap="round"/><path d="M8 3l12 26" stroke="#e8e0cc" stroke-width="0.8"/>`,
  arrow: `<path d="M5 27L25 7" stroke="#8a5d38" stroke-width="1.8"/><path d="M25 7l-6 1 5 5z" fill="#3e4250"/><path d="M5 27l1-5 3 3zM5 27l5-1-3-3z" fill="#e0d8c8"/>`,
  fishingRod: `<path d="M5 28L26 4" stroke="#8a5d38" stroke-width="2"/><path d="M26 4c2 8 1 14-3 18" fill="none" stroke="#e8e0cc" stroke-width="0.8"/><circle cx="23" cy="23" r="2.2" fill="#d83a2a"/>`,
  waterskin: `<path d="M11 6h8l-1 4c5 2 7 7 6 12-1 5-5 7-8 7s-7-2-8-7c-1-5 1-10 6-12z" fill="#a8743e"/><path d="M12 12c-3 2-4 6-3 9" stroke="#c4945a" fill="none"/><path d="M11 4h8v3h-8z" fill="#5a3c24"/>`,
  pot: `<path d="M5 12h22l-2 13c-1 3-5 4-9 4s-8-1-9-4z" fill="#4a5058"/><path d="M4 11h24v3H4z" fill="#6e7680"/><path d="M8 11c0-4 16-4 16 0" fill="none" stroke="#6e7680" stroke-width="1.6"/>`,
  bandage: `<rect x="6" y="11" width="20" height="10" rx="3" transform="rotate(-25 16 16)" fill="#ece6d8"/><path d="M11 18l10-5" stroke="#c8bea8" stroke-width="1.4"/><path d="M14 12l3 7M18 10l3 7" stroke="#d8d0c0"/>`,
  coat: `<path d="M11 5h10l6 5-2 17H7L5 10z" fill="#a8743e"/><path d="M16 7v20" stroke="#6a4424" stroke-width="1.4"/><path d="M11 5l5 5 5-5" fill="none" stroke="#f0e0c0" stroke-width="2.4"/><path d="M5 10l-2 12 4 1 1-9z" fill="#8a5c2e"/><path d="M27 10l2 12-4 1-1-9z" fill="#8a5c2e"/>`,
  armour: `<path d="M9 5l7 3 7-3 4 6-2 16H7L5 11z" fill="#7a5230"/><path d="M9 12h14M9 17h14M9 22h14" stroke="#4a3018" stroke-width="1.4"/><path d="M16 8v19" stroke="#4a3018"/>`,
  torch: `<path d="M14.5 13h3l-.6 16h-1.8z" fill="#8a5d38"/><path d="M13 10.5h6l-.8 3h-4.4z" fill="#3a2f27"/><path d="M16 1.5l4 6.5-4 3.5-4-3.5z" fill="#ff8a2a"/><path d="M16 5l2 3.3-2 1.8-2-1.8z" fill="#fff0a0"/>`,
  campfire: `<path d="M4 26l24-6M4 20l24 6M16 17v12" stroke="#7a5232" stroke-width="3" stroke-linecap="round"/><path d="M5 28a11 3 0 0 0 22 0" fill="none" stroke="#8e8a84" stroke-width="2.4"/><path d="M16 5l5 9-5 5-5-5z" fill="#ff8a2a" opacity=".9"/>`,
  furnace: `<path d="M5 29V12l11-8 11 8v17z" fill="#8e8a84"/><path d="M5 12l11-8 11 8" fill="none" stroke="#6a665e" stroke-width="1.4"/><path d="M11 29v-8a5 5 0 0 1 10 0v8z" fill="#2a2420"/><path d="M13 29v-5a3 3 0 0 1 6 0v5z" fill="#ff8a2a"/><path d="M7 16h18M7 21h4M21 21h4" stroke="#6a665e"/>`,
  wall: `<path d="M4 29V9l2-4 2 4v20M10 29V8l2-4 2 4v21M16 29V9l2-4 2 4v20M22 29V8l2-4 2 4v21" fill="#8a6a44" stroke="#5a3c24" stroke-width="1"/><path d="M3 14h26M3 23h26" stroke="#5a3c24" stroke-width="2.4"/>`,
  gate: `<path d="M3 29V6l2-3 2 3v23M25 29V6l2-3 2 3v23" fill="#6e5234"/><path d="M8 28V10h16v18z" fill="#8a6a44"/><path d="M12 10v18M16 10v18M20 10v18" stroke="#5a3c24"/><path d="M8 13l16 12" stroke="#5a3c24" stroke-width="2"/>`,
  stake: `<path d="M13 30V9l3-7 3 7v21z" fill="#8a6a44"/><path d="M16 2l3 7v21h-3z" fill="#6e5234"/><path d="M13 14h6M13 22h6" stroke="#4a3220" stroke-width="1.4"/>`,
  chest: `<path d="M4 14h24v14H4z" fill="#8a6038"/><path d="M4 14l2-7h20l2 7z" fill="#a8744a"/><path d="M4 18h24M16 14v14" stroke="#5a3c24" stroke-width="1.6"/><path d="M14 16h4v4h-4z" fill="#3a2a1a"/>`,
  bed: `<path d="M3 22h26v5H3z" fill="#7a5232"/><path d="M4 16h24v6H4z" fill="#ece6d8"/><path d="M4 16h8v6H4z" fill="#f6f2e8"/><path d="M14 17h14v5H14z" fill="#a8743e"/><path d="M3 12h3v15H3zM26 18h3v9h-3z" fill="#5a3c24"/>`,
  dryingRack: `<path d="M5 29L10 6M27 29L22 6M8 12h16" stroke="#8a5d38" stroke-width="2"/><path d="M11 13v8l2 1v-9zM16 13v9l2-1v-8zM21 13v7l2 1v-8z" fill="#8a2e22"/>`,
  snare: `<path d="M8 28L13 8M24 28L19 8M11 12h10" stroke="#8a5d38" stroke-width="2"/><ellipse cx="16" cy="22" rx="6" ry="3" fill="none" stroke="#6fae4c" stroke-width="1.6"/><path d="M16 12v7" stroke="#6fae4c" stroke-width="1.4"/>`,
  raft: `<path d="M3 13h26v3H3zM3 17h26v3H3zM3 21h26v3H3z" fill="#8a6038"/><path d="M8 12v13M24 12v13" stroke="#4f6a34" stroke-width="2"/>`,
  hide: `<path d="M8 6l16 0 2 6-3 3 3 8-5 3H11l-5-3 3-8-3-3z" fill="#8a5a3a"/><path d="M11 9h10l-1 14h-8z" fill="#b06a58"/><path d="M13 12l3 2-2 3zM18 16l2 2-3 1z" fill="#d89a88"/>`,
  fur: `<path d="M6 8l20 0 1 7-3 3 2 7-6 3H12l-6-3 2-7-3-3z" fill="#7a6a58"/><path d="M8 10l3 3M13 9l2 4M19 9l-1 4M24 10l-3 3M9 20l3-2M22 20l-3-2" stroke="#a8988a" stroke-width="1.4"/>`,
  pelt: `<path d="M6 8l20 0 1 7-3 3 2 7-6 3H12l-6-3 2-7-3-3z" fill="#9a7a58"/><path d="M11 11h10l-1 12h-8z" fill="#c4a47a"/><path d="M8 10l3 3M24 10l-3 3M9 20l3-2M22 20l-3-2" stroke="#6a5038" stroke-width="1.4"/>`,
  feather: `<path d="M24 4C12 8 7 17 7 27l2 1c2-9 7-16 15-24z" fill="#e8e0d0"/><path d="M8 28L22 7" stroke="#8a7a6a" stroke-width="1"/><path d="M12 18l-3-1M15 14l-3-2M18 10l-2-2" stroke="#b8ae9e"/>`,
  rope: `<circle cx="16" cy="16" r="10" fill="none" stroke="#b89a60" stroke-width="3.2"/><circle cx="16" cy="16" r="5.5" fill="none" stroke="#a0844e" stroke-width="3"/><path d="M24 22l5 6" stroke="#b89a60" stroke-width="3" stroke-linecap="round"/>`,
  charcoal: `<path d="M6 20l4-8 7-2 6 5-1 8-9 3z" fill="#2a2624"/><path d="M10 12l7-2 6 5-7 1z" fill="#4a4440"/><path d="M13 20l3-1 1 2zM18 17l2 0-1 2z" fill="#6a6058"/>`,
  steelBar: `<path d="M4 20l6-8h18l-6 8z" fill="#e4eaf0"/><path d="M4 20h18v4H4z" fill="#a8b4c0"/><path d="M22 20l6-8v4l-6 8z" fill="#8a96a4"/><path d="M9 16h10" stroke="#ffffff" stroke-width="1.2"/>`,
  seedWheat: `<path d="M8 22c2-2 4-2 5 0-1 2-3 2-5 0zM15 18c2-2 4-2 5 0-1 2-3 2-5 0zM18 25c2-2 4-2 5 0-1 2-3 2-5 0zM10 13c2-2 4-2 5 0-1 2-3 2-5 0z" fill="#d8b464"/>`,
  seedCorn: `<path d="M8 20l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM17 23l3-3 3 3-3 3zM10 11l3-3 3 3-3 3z" fill="#e8c030"/>`,
  seedPotato: `<ellipse cx="16" cy="18" rx="9" ry="7" fill="#b08a58"/><circle cx="12" cy="16" r="1" fill="#6a4a2a"/><circle cx="19" cy="20" r="1" fill="#6a4a2a"/><path d="M16 11c-1-3 0-5 2-6M16 11c2-2 4-2 5 0" stroke="#6fae4c" stroke-width="1.6" fill="none"/>`,
  seedCarrot: `<circle cx="10" cy="20" r="1.8" fill="#7a6a4a"/><circle cx="16" cy="15" r="1.8" fill="#7a6a4a"/><circle cx="21" cy="21" r="1.8" fill="#7a6a4a"/><circle cx="14" cy="24" r="1.8" fill="#7a6a4a"/><circle cx="20" cy="12" r="1.8" fill="#7a6a4a"/>`,
  wheat: `<path d="M9 29L20 5M13 29L22 8M17 29l6-19" stroke="#c8a050" stroke-width="1.6"/><path d="M19 6l3-2 0 5zM21 9l3-2 0 5zM22 11l3-2-1 5zM17 11l3-1-1 4z" fill="#e0bc64"/>`,
  corn: `<path d="M16 4c5 4 6 16 0 24-6-8-5-20 0-24z" fill="#f0c830"/><path d="M13 9h6M12 13h8M12 17h8M12 21h8" stroke="#c89a18"/><path d="M16 28c-6-2-10-8-9-16 3 5 6 9 9 16zM16 28c6-2 10-8 9-16-3 5-6 9-9 16z" fill="#6fae4c"/>`,
  roastCorn: `<path d="M16 4c5 4 6 16 0 24-6-8-5-20 0-24z" fill="#d89a28"/><path d="M13 9h6M12 13h8M12 17h8M12 21h8" stroke="#8a5a18"/><path d="M14 12l2 2M17 18l2 1" stroke="#4a2a10" stroke-width="1.6"/>`,
  potato: `<ellipse cx="16" cy="17" rx="10" ry="8" fill="#b89060"/><ellipse cx="14" cy="15" rx="5" ry="3" fill="#caa478"/><circle cx="11" cy="18" r="1" fill="#7a5a34"/><circle cx="20" cy="15" r="1" fill="#7a5a34"/><circle cx="18" cy="21" r="1" fill="#7a5a34"/>`,
  bakedPotato: `<ellipse cx="16" cy="17" rx="10" ry="8" fill="#8a5a30"/><path d="M11 15c3-3 7-3 10 0-3 4-7 4-10 0z" fill="#f0dc98"/><circle cx="16" cy="15" r="1.4" fill="#fff4c0"/>`,
  carrot: `<path d="M8 25L21 10l3 3L11 28z" fill="#e8762a"/><path d="M12 22l2 1M15 18l2 1M18 14l2 1" stroke="#b8561a"/><path d="M22 9l3-6 1 5 5-1-4 4z" fill="#4f8a34"/>`,
  dough: `<ellipse cx="16" cy="19" rx="11" ry="7" fill="#ece0c4"/><ellipse cx="14" cy="17" rx="6" ry="3" fill="#f8f0dc"/>`,
  bread: `<path d="M4 20c0-7 6-11 12-11s12 4 12 11c0 3-2 5-5 5H9c-3 0-5-2-5-5z" fill="#b8763a"/><path d="M9 14l3 4M14 12l3 5M19 12l3 5" stroke="#8a5424" stroke-width="1.6"/>`,
  forgedAxe: STEEL(AXE).replaceAll('#b8c0c8', '#dfe6ee'),
  forgedPickaxe: STEEL(PICK).replaceAll('#b8c0c8', '#dfe6ee'),
  forgedSpear: STEEL(SPEAR).replaceAll('#9aa4b0', '#d0d8e2'),
  crossbow: `<path d="M16 4v24" stroke="#7a5232" stroke-width="3"/><path d="M4 10c6 4 18 4 24 0" fill="none" stroke="#9aa4b0" stroke-width="2.4"/><path d="M4 10l12 6 12-6" stroke="#e8e0cc" stroke-width="0.8" fill="none"/><path d="M14 22h4v6h-4z" fill="#5a3c24"/>`,
  bolt: `<path d="M6 26L24 8" stroke="#7a5232" stroke-width="2.2"/><path d="M24 8l-5 1 4 4z" fill="#9aa4b0"/><path d="M6 26l1-4 3 3z" fill="#c8c0b0"/>`,
  hoe: `<path d="M8 29L20 7l2 1L10 30z" fill="#8a5d38"/><path d="M18 5l9 3-2 3-8-2z" fill="#8e8a84"/>`,
  shears: `<path d="M8 6l10 14M24 6L14 20" stroke="#b8c0c8" stroke-width="2.6"/><circle cx="12" cy="25" r="4" fill="none" stroke="#5a3c24" stroke-width="2.4"/><circle cx="20" cy="25" r="4" fill="none" stroke="#5a3c24" stroke-width="2.4"/>`,
  furCloak: `<path d="M10 5h12l6 7-3 16H7L4 12z" fill="#8a7458"/><path d="M10 5l6 5 6-5" fill="none" stroke="#c8b89a" stroke-width="3"/><path d="M9 14l2 3M14 18l2 3M20 15l2 3M12 23l2 2M19 23l2 2" stroke="#6a5a44" stroke-width="1.4"/>`,
  roof: `<path d="M2 17L16 6l14 11z" fill="#c8a860"/><path d="M5 16L16 8l11 8" stroke="#a88a44" stroke-width="1.4" fill="none"/><path d="M6 17v11M26 17v11" stroke="#6e5234" stroke-width="2.4"/>`,
  fence: `<path d="M5 29V9M16 29V9M27 29V9" stroke="#8a6a44" stroke-width="3"/><path d="M3 14h26M3 22h26" stroke="#6e5234" stroke-width="2.2"/>`,
  fenceGate: `<path d="M4 29V8M28 29V8" stroke="#6e5234" stroke-width="3"/><path d="M8 13h16M8 23h16M8 13l16 10" stroke="#8a6a44" stroke-width="2.2"/>`,
  anvil: `<path d="M4 10h20c2 0 4 1 4 3H18l-2 5h4v4H10v-4h4l-2-5H6c-2 0-3-1-2-3z" fill="#4a5058"/><path d="M4 10h20c2 0 4 1 4 3H18" fill="none" stroke="#8a949e" stroke-width="1"/><path d="M8 22h14v6H8z" fill="#6e5234"/>`,
  grindstone: `<circle cx="16" cy="14" r="9" fill="#9a968e"/><circle cx="16" cy="14" r="2" fill="#6e5234"/><path d="M16 14h8" stroke="#6e5234" stroke-width="2"/><path d="M6 29l4-9M26 29l-4-9M8 29h16" stroke="#6e5234" stroke-width="2.4"/>`,
  mountainOre: `<path d="M7 21l3-9 8-4 7 6-1 9-10 3z" fill="#3e434c"/><path d="M10 12l8-4 7 6-8 2z" fill="#545a64"/><path d="M12 16l3-1 1 3-3 1zM19 19l3-1v3l-2 1z" fill="#dfe4ea"/>`,
  coal: `<path d="M6 20l4-8 7-2 6 5-1 8-9 3z" fill="#1c1a19"/><path d="M10 12l7-2 6 5-7 1z" fill="#34302e"/><path d="M14 18l2-1 1 2z" fill="#5a5450"/>`,
  goldOre: `<path d="M7 21l3-9 8-4 7 6-1 9-10 3z" fill="#e4ded0"/><path d="M10 12l8-4 7 6-8 2z" fill="#f2eee4"/><path d="M12 16l3-1 1 3-3 1zM19 19l3-1v3l-2 1zM16 11l2 0-1 2z" fill="#e0aa28"/>`,
  goldBar: `<path d="M4 20l6-8h18l-6 8z" fill="#f0cc58"/><path d="M4 20h18v4H4z" fill="#c89a30"/><path d="M22 20l6-8v4l-6 8z" fill="#a87c20"/><path d="M9 16h10" stroke="#fff0b8" stroke-width="1.2"/>`,
  saddle: `<path d="M5 15c3-4 19-4 22 0l-2 5H7z" fill="#6a3a20"/><path d="M8 11h4l1 4H9zM20 11h4l-1 4h-4z" fill="#4a2810"/><path d="M9 20v6M23 20v6" stroke="#3a2414" stroke-width="1.6"/><path d="M7 26h4M21 26h4" stroke="#8a949e" stroke-width="2"/>`,
  sword: `<path d="M8 27l3 3 2-2-3-3z" fill="#4a3020"/><path d="M6 23l7 7 1.6-1.6-7-7z" fill="#8a949e"/><path d="M11 22L26 5l2 1-15 18z" fill="#dfe6ee"/><path d="M26 5l2 1 1-3z" fill="#ffffff"/>`,
  steelArmour: `<path d="M9 5l7 3 7-3 4 6-2 16H7L5 11z" fill="#9aa4b0"/><path d="M9 12h14M9 17h14M9 22h14" stroke="#5a626e" stroke-width="1.4"/><path d="M16 8v19" stroke="#5a626e"/><path d="M9 5l7 3 7-3" fill="none" stroke="#e4e8ee" stroke-width="1.2"/>`,
  tanningRack: `<path d="M5 29V5M27 29V5M5 7h22M5 27h22" stroke="#8a5d38" stroke-width="2.2"/><path d="M9 10h14l-1 14H10z" fill="#c4945a"/><path d="M9 10l-4-3M23 10l4-3M10 24l-5 3M22 24l5 3" stroke="#e8e0cc"/>`,
};
// (A spawner's icon: a paw print.)
for (const id of Object.keys(ITEMS)) if (ITEMS[id].spawns) ICONS[id] = `<circle cx="16" cy="20" r="6" fill="#8a6a4a"/><circle cx="8" cy="12" r="3" fill="#8a6a4a"/><circle cx="14" cy="8" r="3" fill="#8a6a4a"/><circle cx="20" cy="8" r="3" fill="#8a6a4a"/><circle cx="25" cy="13" r="3" fill="#8a6a4a"/>`;
// (The trophies and what's made of them: the icons of their kin, recoloured.)
{
  const re = (id, from, pairs) => (ICONS[id] = pairs.reduce((t, [a, b]) => t.replaceAll(a, b), ICONS[from]));
  re('grizzlyPelt', 'pelt', [['#9a7a58', '#6a5040'], ['#c4a47a', '#8a6a50']]);
  re('lionPelt', 'pelt', [['#9a7a58', '#b08a58'], ['#c4a47a', '#5a3a20']]);
  re('tigerPelt', 'pelt', [['#9a7a58', '#d8782a'], ['#c4a47a', '#1a1210']]);
  re('paleFur', 'pelt', [['#9a7a58', '#e0dcd2'], ['#c4a47a', '#f4f0e8']]);
  re('caveBearPelt', 'pelt', [['#9a7a58', '#3a3230'], ['#c4a47a', '#5a504a']]);
  re('greatHide', 'hide', [['#8a5a3a', '#4a3020'], ['#b06a58', '#6a4430']]);
  re('crocHide', 'hide', [['#8a5a3a', '#4a5a3a'], ['#b06a58', '#6a7a50']]);
  ICONS.alphaFang = `<path d="M14 4c4 0 6 3 5 8l-3 16-3-16c-1-5-1-8 1-8z" fill="#f0ead8"/><path d="M15 6c2 0 3 2 2 5" stroke="#c8c0a8" fill="none"/>`;
  ICONS.greatAntlers = `<path d="M16 28V18M16 18c-6-2-9-8-9-14M16 18c6-2 9-8 9-14M10 12l-5-2M22 12l5-2M9 7l-3-4M23 7l3-4" stroke="#d8c8a0" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  ICONS.venomSac = `<path d="M16 6c6 4 9 9 9 14a9 9 0 0 1-18 0c0-5 3-10 9-14z" fill="#6a8a3a"/><path d="M13 14c2-2 5-2 6 0" stroke="#a8c86a" fill="none"/><circle cx="16" cy="21" r="2.4" fill="#3a5a1a"/>`;
  ICONS.boarTusk = `<path d="M8 26c0-10 6-18 14-20-4 6-6 12-6 20z" fill="#f0e6d0"/><path d="M14 26c2-8 7-14 12-16-3 5-4 10-4 16z" fill="#e0d4b8"/>`;
  re('scarArmour', 'steelArmour', [['#9aa4b0', '#6a5040']]);
  re('lionArmour', 'steelArmour', [['#9aa4b0', '#b08a58']]);
  re('tigerArmour', 'steelArmour', [['#9aa4b0', '#d8782a']]);
  re('crocArmour', 'steelArmour', [['#9aa4b0', '#4a5a3a']]);
  re('fangSword', 'sword', [['#dfe6ee', '#f4f0e4'], ['#8a949e', '#e0d8c0']]);
  re('antlerBow', 'bow', [['#8a5d38', '#d8c8a0']]);
  re('tuskPickaxe', 'forgedPickaxe', [['#dfe6ee', '#f0e6d0'], ['#c8c4bc', '#f0e6d0']]);
  re('poisonArrow', 'arrow', [['#3e4250', '#4a7a2a']]);
  re('poisonBolt', 'bolt', [['#9aa4b0', '#4a7a2a']]);
  re('greatSaddle', 'saddle', [['#6a3a20', '#3a2818']]);
  re('hideRoof', 'roof', [['#c8a860', '#5a3a26'], ['#a88a44', '#3a2818']]);
  re('paleCloak', 'furCloak', [['#8a7458', '#e8e4dc'], ['#c8b89a', '#ffffff']]);
  re('caveCloak', 'furCloak', [['#8a7458', '#3a3230']]);
}
