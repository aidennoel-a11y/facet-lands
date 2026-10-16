// Everything you can carry: what it's called, how many go in a slot (ten,
// but a tool is one to a slot), how long a tool lasts (`durability`: uses),
// what eating it does (and how long it keeps you full: `full`, seconds,
// hunger draining a third as fast), how long food keeps (`spoils`: seconds; food in a
// chest keeps longer), how heavy it is (`weight`, kg), and what it becomes when
// you set it down (`place`). And the recipes to make things.

export const STACK = 10;

// (Spoiling times in game seconds: a day is 24 minutes, a year 48 days; see config.)
const DAY = 24 * 60, YEAR = 48 * DAY;

export const ITEMS = {
  // Materials.
  stick: { name: 'Stick', weight: 0.3, group: 'Materials' },
  rock: { name: 'Small rock', weight: 1, group: 'Materials' },
  flint: { name: 'Flint', weight: 0.4, group: 'Materials' },
  salt: { name: 'Salt', weight: 0.2, group: 'Materials' }, // (boiled out of sea water in a pot, or scraped up on the salt flats)
  sand: { name: 'Sand', weight: 1.2, group: 'Materials' }, // (scooped up on a beach or in the desert)
  log: { name: 'Log', weight: 9, group: 'Materials' },
  vine: { name: 'Plant vine', weight: 0.2, group: 'Materials' },
  iron: { name: 'Iron ore', weight: 2.5, group: 'Materials' },
  ironBar: { name: 'Iron bar', weight: 2, group: 'Materials' },
  hide: { name: 'Raw hide', weight: 2.5, spoils: 3000, tans: 'deerSkin', group: 'Materials' }, // (tanned on a rack into leather; rots if not)
  fur: { name: 'Raw fur', weight: 1.5, spoils: 3000, tans: 'pelt', group: 'Materials' },
  deerSkin: { name: 'Leather', weight: 2, group: 'Materials' },
  pelt: { name: 'Tanned fur', weight: 1.2, group: 'Materials' },
  wool: { name: 'Wool', weight: 0.5, group: 'Materials' },
  beeswax: { name: 'Beeswax', weight: 0.1, group: 'Materials' }, // (from a hive: candles, fire arrows, waxed things)
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
  // (Found in the caves.)
  crystal: { name: 'Cave crystal', weight: 0.3, group: 'Materials' },
  silk: { name: 'Spider silk', weight: 0.1, group: 'Materials' }, // (from the big spiders in the caves)
  silkRope: { name: 'Silk rope', weight: 0.3, place: 'rope', group: 'Materials' }, // (as a rope, lighter)
  guano: { name: 'Bat guano', weight: 1, group: 'Farming' }, // (dug into a plot: the crop grows twice as fast a while)
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
  // (Trophies from a good hunt, or a fine catch: for the trophy rack.)
  deerAntlers: { name: 'Whitetail antlers', weight: 1.2, group: 'Trophies' },
  elkAntlers: { name: 'Elk antlers', weight: 3.5, group: 'Trophies' },
  mooseAntlers: { name: 'Moose antlers', weight: 6, group: 'Trophies' },
  bearClaws: { name: 'Bear claws', weight: 0.3, group: 'Trophies' },
  wolfSkull: { name: 'Wolf skull', weight: 0.6, group: 'Trophies' },
  cougarSkull: { name: 'Cougar skull', weight: 0.5, group: 'Trophies' },
  trophyFish: { name: 'Trophy fish', weight: 3, group: 'Trophies' },
  broodHeart: { name: "The Broodmother's heart", weight: 2, group: 'Trophies' },
  seedWheat: { name: 'Wheat seeds', weight: 0.05, sow: 'wheat', group: 'Farming' },
  seedCorn: { name: 'Corn kernels', weight: 0.05, sow: 'corn', group: 'Farming' },
  seedPotato: { name: 'Seed potato', weight: 0.2, sow: 'potato', group: 'Farming' },
  seedCarrot: { name: 'Carrot seeds', weight: 0.05, sow: 'carrot', group: 'Farming' },
  wheat: { name: 'Wheat', weight: 0.3, group: 'Farming' },
  // (Wild crops growing out on the plains: never carried, cut with a sickle for their grain, roots and seed.)
  wildWheat: { name: 'Wild wheat', wild: 'wheat', weight: 0, group: 'Farming' },
  wildCorn: { name: 'Wild corn', wild: 'corn', weight: 0, group: 'Farming' },
  wildPotato: { name: 'Wild potato plants', wild: 'potato', weight: 0, group: 'Farming' },
  wildCarrot: { name: 'Wild carrots', wild: 'carrot', weight: 0, group: 'Farming' },
  // Food.
  berries: { name: 'Berries', food: { hunger: 8, thirst: 3, full: 45 }, spoils: 3 * DAY, weight: 0.1, group: 'Food' },
  apple: { name: 'Apple', food: { hunger: 12, thirst: 5, full: 90 }, spoils: 2400, weight: 0.2, group: 'Food' },
  mushroom: { name: 'Mushroom', food: { hunger: 6, full: 60 }, spoils: 1500, weight: 0.1, group: 'Food' },
  // (In the dark of the caves: the pale cave mushroom, good to eat; the
  // deathcap, very like it, that will kill you; the glowcap, a mouthful.)
  caveMushroom: { name: 'Cave mushroom', food: { hunger: 10, full: 120 }, spoils: 1800, weight: 0.1, group: 'Food' },
  deathcap: { name: 'Pale deathcap', food: { hunger: 3, health: -35, sick: 1, full: 30 }, spoils: 2400, weight: 0.1, group: 'Food' },
  glowcap: { name: 'Glowcap', food: { hunger: 3, full: 30 }, spoils: 2400, weight: 0.05, group: 'Food' },
  blindFish: { name: 'Blind cave fish', food: { hunger: 6, health: -3, sick: 0.2, full: 120 }, spoils: 700, cooks: 'cookedFish', dries: 'jerky', smokes: 'smokedFish', weight: 0.4, group: 'Food' },
  rawMeat: { name: 'Raw meat', food: { hunger: 10, health: -4, sick: 0.35, full: 180 }, spoils: 900, cooks: 'cookedMeat', dries: 'jerky', smokes: 'smokedMeat', weight: 1, group: 'Food' },
  cookedMeat: { name: 'Cooked meat', food: { hunger: 35, health: 4, full: 600 }, spoils: 4 * DAY, dries: 'jerky', weight: 0.8, group: 'Food' },
  rawEgg: { name: 'Egg', food: { hunger: 6, health: -1, sick: 0.08, full: 60 }, spoils: 4000, cooks: 'cookedEgg', weight: 0.06, group: 'Food' },
  cookedEgg: { name: 'Cooked egg', food: { hunger: 14, full: 200 }, spoils: 2000, weight: 0.06, group: 'Food' },
  milk: { name: 'Goat\'s milk', food: { hunger: 8, thirst: 14, health: 1, full: 150 }, spoils: DAY, weight: 1, group: 'Food' }, // (fresh: a day, then it sours)
  cheese: { name: 'Cheese', food: { hunger: 24, health: 3, full: 480 }, spoils: 90 * DAY, weight: 0.4, group: 'Food' }, // (salted and pressed: keeps through a season and more)
  honey: { name: 'Wild honey', food: { hunger: 12, health: 4, full: 240 }, weight: 0.3, group: 'Food' }, // (it never spoils)
  saltedMeat: { name: 'Salted meat', food: { hunger: 16, thirst: -6, full: 360 }, spoils: YEAR, weight: 0.8, group: 'Food' }, // (cured in salt: keeps a year)
  saltedFish: { name: 'Salted fish', food: { hunger: 13, thirst: -6, full: 300 }, spoils: YEAR, weight: 0.6, group: 'Food' },
  rawFowl: { name: 'Raw bird', food: { hunger: 8, health: -4, sick: 0.75, full: 150 }, spoils: 700, cooks: 'cookedMeat', dries: 'jerky', smokes: 'smokedMeat', weight: 0.8, group: 'Food' }, // (turkey, duck, grouse: raw, it'll very likely make you ill)
  rawFish: { name: 'Raw fish', food: { hunger: 8, health: -3, sick: 0.2, full: 120 }, spoils: 700, cooks: 'cookedFish', dries: 'jerky', smokes: 'smokedFish', weight: 0.8, group: 'Food' },
  cookedFish: { name: 'Cooked fish', food: { hunger: 25, health: 3, full: 360 }, spoils: 4 * DAY, dries: 'jerky', weight: 0.6, group: 'Food' },
  jerky: { name: 'Jerky', food: { hunger: 22, full: 360 }, spoils: 5 * YEAR, weight: 0.3, group: 'Food' }, // (dried: it keeps five years)
  // (Smoked over a fire: it keeps, and it's better eating than jerky.)
  smokedMeat: { name: 'Smoked meat', food: { hunger: 30, health: 3, full: 540 }, weight: 0.6, group: 'Food' },
  smokedFish: { name: 'Smoked fish', food: { hunger: 24, health: 2, full: 400 }, weight: 0.4, group: 'Food' },
  corn: { name: 'Ear of corn', food: { hunger: 8, full: 120 }, spoils: 3000, cooks: 'roastCorn', weight: 0.3, group: 'Food' },
  roastCorn: { name: 'Roast corn', food: { hunger: 22, health: 2, full: 300 }, spoils: 2400, weight: 0.3, group: 'Food' },
  potato: { name: 'Potato', food: { hunger: 5, health: -1, full: 150 }, spoils: 6000, cooks: 'bakedPotato', weight: 0.3, group: 'Food' },
  bakedPotato: { name: 'Baked potato', food: { hunger: 26, health: 3, full: 420 }, spoils: 2400, weight: 0.3, group: 'Food' },
  carrot: { name: 'Carrot', food: { hunger: 9, thirst: 2, full: 100 }, spoils: 3600, weight: 0.15, group: 'Food' },
  dough: { name: 'Dough', food: { hunger: 4, health: -1, full: 90 }, spoils: 1200, cooks: 'bread', weight: 0.5, group: 'Food' },
  bread: { name: 'Bread', food: { hunger: 32, health: 3, full: 480 }, spoils: 6000, weight: 0.4, group: 'Food' },
  stew: { name: 'Stew', food: { hunger: 50, thirst: 25, health: 12, cure: true, full: 720 }, spoils: 1800, weight: 1, group: 'Food' },
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
  // (Found only in the ruins: a knight's blade, old but keen; and maps that show where other ruins lie.)
  oldSword: { name: "Old knight's sword", tool: true, durability: 300, weight: 1.7, sharp: 3.5, group: 'Tools' },
  oldMap: { name: 'Old map', weight: 0.05, group: 'Tools' },
  fangSword: { name: 'Fang sword', tool: true, durability: 360, weight: 1.6, sharp: 4, group: 'Tools' }, // (Greymane's fang set in its hilt: the keenest blade)
  antlerBow: { name: 'Antler bow', tool: true, durability: 240, weight: 1.4, power: 1.5, group: 'Tools' }, // (stiffer: arrows fly further and strike harder)
  tuskPickaxe: { name: 'Tusk pickaxe', tool: true, durability: 500, weight: 2.2, group: 'Tools' },
  poisonArrow: { name: 'Venom arrow', weight: 0.05, venom: true, group: 'Tools' },
  poisonBolt: { name: 'Venom bolt', weight: 0.08, venom: true, group: 'Tools' },
  greatSaddle: { name: 'Great saddle', weight: 7, group: 'Tools' }, // (a horse under it gallops further)
  crossbow: { name: 'Crossbow', tool: true, durability: 200, weight: 3, group: 'Tools' },
  bolt: { name: 'Crossbow bolt', weight: 0.08, group: 'Tools' },
  sickle: { name: 'Sickle', tool: true, durability: 120, weight: 0.5, group: 'Tools' }, // (cuts the long grass down to stubble)
  hoe: { name: 'Hoe', tool: true, durability: 80, weight: 1.4, group: 'Tools' },
  shears: { name: 'Shears', tool: true, durability: 60, weight: 0.4, group: 'Tools' },
  fineFlintSteel: { name: 'Flint and forged steel', tool: true, durability: 50, weight: 0.3, group: 'Tools' },
  bow: { name: 'Bow', tool: true, durability: 120, weight: 1, group: 'Tools' },
  // (Taller and stiffer: slower to draw full, but its arrows fly much further and strike harder.)
  longbow: { name: 'Longbow', tool: true, durability: 220, weight: 1.3, power: 1.32, draw: 1.3, group: 'Tools' },
  arrow: { name: 'Arrow', weight: 0.05, group: 'Tools' },
  fireArrow: { name: 'Fire arrow', weight: 0.06, fire: true, group: 'Tools' }, // (a waxed rag at its head, lit as you loose it: it sets what it hits burning)
  climbingPicks: { name: 'Climbing picks', tool: true, durability: 300, weight: 1.6, group: 'Tools' }, // (carried: rock too steep to walk, scrambled up)
  pail: { name: 'Milk pail', tool: true, durability: 150, weight: 1, group: 'Tools' }, // (Q on a tame nanny goat with it)
  fishingRod: { name: 'Fishing rod', tool: true, durability: 60, weight: 0.8, group: 'Tools' },
  waterskin: { name: 'Waterskin', tool: true, weight: 0.4, holds: 5, group: 'Tools' }, // (water: 0..5 drinks; clean or not)
  pot: { name: 'Iron pot', tool: true, durability: 60, weight: 2, group: 'Tools' },
  bandage: { name: 'Bandage', weight: 0.05, group: 'Tools' },
  saddle: { name: 'Saddle', weight: 6, group: 'Tools' }, // (on a tame horse: see Game)
  torch: { name: 'Torch', place: 'torch', weight: 0.4, group: 'Tools' },
  coalTorch: { name: 'Coal torch', place: 'torch', weight: 0.5, group: 'Tools' }, // (burns hot and white: lights twice as far, the one for the caves)
  candle: { name: 'Beeswax candle', place: 'candle', weight: 0.1, group: 'Tools' }, // (a small soft light: on a table, a shelf, a wall)
  lantern: { name: 'Lantern', place: 'lantern', weight: 1.2, group: 'Tools' }, // (a candle behind horn panes in iron: the rain doesn't put it out)
  caveLamp: { name: 'Crystal lamp', place: 'caveLamp', weight: 1.2, group: 'Tools' }, // (glows of itself: never goes out)
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
  // (Feet, hands, head.)
  boots: { name: 'Leather boots', tool: true, wear: 'feet', warmth: 0.9, quiet: true, weight: 1, group: 'Worn' }, // (soft-soled: quieter going; a snake's fangs mostly in the leather)
  furBoots: { name: 'Fur-lined boots', tool: true, wear: 'feet', warmth: 0.75, quiet: true, weight: 1.3, group: 'Worn' },
  gloves: { name: 'Leather gloves', tool: true, wear: 'hands', warmth: 0.92, weight: 0.3, group: 'Worn' }, // (thorns and stings and the heat of the fire)
  furHat: { name: 'Fur hat', tool: true, wear: 'head', warmth: 0.75, weight: 0.4, group: 'Worn' },
  strawHat: { name: 'Straw hat', tool: true, wear: 'head', shade: true, weight: 0.2, group: 'Worn' }, // (broad-brimmed: the sun off you)
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
  quiver: { name: 'Quiver', weight: 0.8, group: 'Worn', carried: 'Carry it: your arrows and bolts stack three times as deep' }, // (carried: arrows and bolts stack three times as deep)
  backpack: { name: 'Backpack', weight: 1.5, group: 'Worn', wear: 'back' }, // (worn on your back: six more slots)
  saddlebags: { name: 'Saddlebags', weight: 2.5, group: 'Worn', carried: 'Q on your tame horse with them in hand to put them on' }, // (put on a tame horse: eight slots it carries for you)
  repairBench: { name: 'Repair bench', place: 'repairBench', weight: 12, group: 'Building' }, // (mend worn tools for a little of what they're made of)
  logBridge: { name: 'Log bridge', place: 'logBridge', weight: 30, group: 'Building' }, // (laid across a river or a gap, up to 14 m)
  ropeBridge: { name: 'Rope bridge', place: 'ropeBridge', weight: 12, group: 'Building' }, // (slung across a gorge, up to 26 m)
  chair: { name: 'Chair', place: 'chair', weight: 4, group: 'Building' },
  table: { name: 'Table', place: 'table', weight: 9, group: 'Building' },
  shelf: { name: 'Shelves', place: 'shelf', weight: 8, group: 'Building' }, // (six slots of storage)
  trophyRack: { name: 'Trophy rack', place: 'trophyRack', weight: 5, group: 'Building' },
  // (To plant: an orchard, a berry patch, a woodlot by your home.)
  appleSapling: { name: 'Apple sapling', place: 'orchardApple', weight: 1, group: 'Farming' },
  berryCutting: { name: 'Berry cutting', place: 'orchardBerry', weight: 0.3, group: 'Farming' },
  sapling: { name: 'Oak sapling', place: 'plantedOak', weight: 0.8, group: 'Farming' }, // (hang a great beast's trophy on it)
  coop: { name: 'Hen-house', place: 'coop', weight: 14, group: 'Building' },
  ladder: { name: 'Ladder', place: 'ladder', weight: 6, group: 'Building' },
  canoe: { name: 'Dugout canoe', place: 'canoe', weight: 28, group: 'Building' }, // (quick on the water; carried on your back, heavy)
  sign: { name: 'Sign', place: 'sign', weight: 3, group: 'Building' }, // (Q to write on it)
  beeBox: { name: 'Bee box', place: 'beeBox', weight: 8, group: 'Building' }, // (wild bees move in; honey and wax build up in it) // (tame turkeys and ducks lay in it)
  leanTo: { name: 'Lean-to', place: 'leanTo', weight: 6, group: 'Building' }, // (a quick shelter of poles and leafy boughs: out of the rain)
  waterFilter: { name: 'Water filter', place: 'waterFilter', weight: 6, group: 'Building' }, // (sand and charcoal in a bark cone: still water through it comes out clean)
  woodFloor: { name: 'Plank floor', place: 'woodFloor', weight: 16, group: 'Building' },
  // The building sets: logs (no more than an axe), planks (a steel axe to cut them true), rough stone, cut stone (a steel pickaxe to dress it).
  logWall: { name: 'Log wall', place: 'logWall', weight: 24, group: 'Building' },
  logFloor: { name: 'Log floor', place: 'logFloor', weight: 18, group: 'Building' },
  logStairs: { name: 'Log stairs', place: 'logStairs', weight: 16, group: 'Building' },
  logRoof: { name: 'Log roof', place: 'logRoof', weight: 24, group: 'Building' },
  plankWall: { name: 'Plank wall', place: 'plankWall', weight: 18, group: 'Building' },
  plankStairs: { name: 'Plank stairs', place: 'plankStairs', weight: 12, group: 'Building' },
  shingleRoof: { name: 'Shingle roof', place: 'shingleRoof', weight: 16, group: 'Building' },
  stoneStairs: { name: 'Stone stairs', place: 'stoneStairs', weight: 30, group: 'Building' },
  cutStoneWall: { name: 'Cut stone wall', place: 'cutStoneWall', weight: 30, group: 'Building' },
  cutStoneFloor: { name: 'Cut stone floor', place: 'cutStoneFloor', weight: 30, group: 'Building' },
  cutStairs: { name: 'Cut stone stairs', place: 'cutStairs', weight: 30, group: 'Building' },
  tileRoof: { name: 'Stone tile roof', place: 'tileRoof', weight: 28, group: 'Building' },
  bedroll: { name: 'Bedroll', place: 'bedroll', weight: 3, group: 'Building' },
  straw: { name: 'Straw', weight: 0.2, group: 'Materials' }, // (grass cut with a sickle)
  strawBed: { name: 'Straw bed', place: 'strawBed', weight: 2, group: 'Building' },
  logWindow: { name: 'Log wall, window', place: 'logWindow', weight: 22, group: 'Building' },
  logDoor: { name: 'Log wall, door', place: 'logDoor', weight: 22, group: 'Building' },
  plankWindow: { name: 'Plank wall, window', place: 'plankWindow', weight: 16, group: 'Building' },
  plankDoor: { name: 'Plank wall, door', place: 'plankDoor', weight: 18, group: 'Building' },
  stoneDoor: { name: 'Stone wall, door', place: 'stoneDoor', weight: 28, group: 'Building' },
  cutWindow: { name: 'Cut stone wall, window', place: 'cutWindow', weight: 28, group: 'Building' },
  cutDoor: { name: 'Cut stone wall, door', place: 'cutDoor', weight: 28, group: 'Building' },
  fancyBed: { name: 'Great bed', place: 'fancyBed', weight: 14, group: 'Building' },
  stoneFloor: { name: 'Stone floor', place: 'stoneFloor', weight: 30, group: 'Building' },
  stoneWall: { name: 'Stone wall', place: 'stoneWall', weight: 30, group: 'Building' },
  stoneFence: { name: 'Stone fence', place: 'stoneFence', weight: 18, group: 'Building' },
  chimney: { name: 'Chimney', place: 'chimney', weight: 30, group: 'Building' },
  slateRoof: { name: 'Slate roof', place: 'slateRoof', weight: 28, group: 'Building' },
  woodWindow: { name: 'Palisade window', place: 'woodWindow', weight: 18, group: 'Building' },
  stoneWindow: { name: 'Stone window', place: 'stoneWindow', weight: 28, group: 'Building' },
  cellar: { name: 'Root cellar', place: 'cellar', weight: 40, group: 'Building' },
  fishTrap: { name: 'Fish trap', place: 'fishTrap', weight: 1.5, group: 'Building' },
  smokingRack: { name: 'Smoking rack', place: 'smokingRack', weight: 6, group: 'Building' },
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
  { id: 'pickaxe', needs: { stick: 2, rock: 3 }, note: 'Breaks rock: boulders (which break up and are gone) and rock faces give stone and flint; ore veins give their ore' },
  { id: 'spear', needs: { log: 1, rock: 1, vine: 1 }, note: 'Click to stab, right-click to throw' },
  { id: 'flintSteel', needs: { flint: 1, rock: 1 }, note: 'Flint struck on a hard rock: lights campfires and furnaces' },
  { id: 'torch', needs: { stick: 1, vine: 1 }, note: 'Light to carry or set down' },
  { id: 'coalTorch', needs: { stick: 1, coal: 1, vine: 1 }, makes: 2, note: 'Coal-headed: burns bright and white, lighting twice as far. For the caves' },
  { id: 'bow', needs: { stick: 2, vine: 2 }, note: 'Hold the mouse to draw, let go to shoot' },
  { id: 'arrow', needs: { stick: 1, flint: 1 }, makes: 4, note: 'Four arrows (fletched with a feather they fly truer)' },
  { id: 'strawHat', needs: { straw: 3 }, note: 'Broad-brimmed: keeps the sun off you (far slower to get heatstroke)' },
  { id: 'fishingRod', needs: { stick: 2, vine: 2 }, note: 'Cast into water, click when it bites, then hold to reel (ease off when the line’s tight)' },
  { id: 'waterskin', needs: { deerSkin: 1, vine: 1 }, note: 'Fill it at water (Q); boil it on a fire to make it safe' },
  { id: 'bandage', needs: { vine: 2 }, makes: 2, note: 'Stops bleeding' },
  { id: 'campfire', needs: { log: 3 }, note: 'Set it down, then light it with flint and steel' },
  { id: 'furnace', needs: { rock: 10 }, note: 'Burns logs; smelts iron ore into bars' },
  { id: 'stake', needs: { log: 1 }, note: 'One sharpened log, stood upright' },
  { id: 'wall', needs: { log: 5 }, note: 'A section of palisade, sharpened logs: walls join end to end' },
  { id: 'logWall', needs: { log: 6 }, note: 'Whole logs laid one on another, notched at the ends: joins end to end with any wall' },
  { id: 'logFloor', needs: { log: 4 }, note: 'Logs adzed flat, side by side on stumps, 4 m square: floors join edge to edge. Aim at the top of your walls to lay one a storey up' },
  { id: 'logStairs', needs: { log: 4 }, note: 'A flight of log steps up to the top of your walls (and a floor laid up there)' },
  { id: 'logRoof', needs: { log: 5 }, note: 'Split logs laid down a slope, set on top of your walls' },
  { id: 'logWindow', needs: { log: 5 }, note: 'A log wall with a framed window in it: joins end to end with the walls' },
  { id: 'logDoor', needs: { log: 6 }, note: 'A log wall with a doorway and a door of split logs: Q to open and close it' },
  { id: 'plankWindow', needs: { log: 3, stick: 5 }, uses: ['forgedAxe'], note: 'A plank wall with a framed casement window. Needs a steel axe' },
  { id: 'plankDoor', needs: { log: 3, stick: 4, ironBar: 1 }, uses: ['forgedAxe'], note: 'A plank wall with a boarded door on iron hinges: Q to open and close it. Needs a steel axe' },
  { id: 'stoneDoor', needs: { rock: 30, log: 3 }, note: 'A stone wall with a doorway, a heavy studded door in it: Q to open and close it' },
  { id: 'cutWindow', needs: { rock: 34, stick: 3 }, uses: ['forgedPickaxe', 'tuskPickaxe'], note: 'Cut stone with a window, a carved sill and lintel. Needs a steel pickaxe' },
  { id: 'cutDoor', needs: { rock: 30, log: 3, ironBar: 1 }, uses: ['forgedPickaxe', 'tuskPickaxe'], note: 'Cut stone with a doorway under a carved lintel, a dark studded door: Q to open and close it. Needs a steel pickaxe' },
  { id: 'strawBed', needs: { straw: 8 }, note: 'A heap of straw (cut grass with a sickle): sleep the night on it, and wake here after dying' },
  { id: 'bedroll', needs: { deerSkin: 1, wool: 2 }, note: 'A bed on the ground: sleep the night (stiffly), and wake here after dying' },
  { id: 'plankWall', needs: { log: 3, stick: 4 }, uses: ['forgedAxe'], note: 'Boards lapped on a squared frame: neat and tight. Needs a steel axe to cut the planks' },
  { id: 'plankStairs', needs: { log: 2, stick: 4 }, uses: ['forgedAxe'], note: 'A flight of plank steps with a rail, up to the top of your walls. Needs a steel axe' },
  { id: 'shingleRoof', needs: { log: 3, stick: 2 }, uses: ['forgedAxe'], note: 'Cedar shingles in even courses, set on top of your walls. Needs a steel axe' },
  { id: 'stoneStairs', needs: { rock: 24 }, note: 'Rough stone steps, solid to the ground, up to the top of your walls' },
  { id: 'cutStoneWall', needs: { rock: 44 }, uses: ['forgedPickaxe', 'tuskPickaxe'], note: 'Dressed stone, square and true: never burns. Needs a steel pickaxe to cut it' },
  { id: 'cutStoneFloor', needs: { rock: 10 }, uses: ['forgedPickaxe', 'tuskPickaxe'], note: 'Square cut flags, 4 m: floors join edge to edge. Needs a steel pickaxe' },
  { id: 'cutStairs', needs: { rock: 28 }, uses: ['forgedPickaxe', 'tuskPickaxe'], note: 'Cut stone steps up to the top of your walls. Needs a steel pickaxe' },
  { id: 'tileRoof', needs: { rock: 10, log: 3 }, uses: ['forgedPickaxe', 'tuskPickaxe'], note: 'Cut stone tiles on rafters: a roof that never burns. Needs a steel pickaxe' },
  { id: 'fancyBed', needs: { log: 4, silk: 8, wool: 4 }, uses: ['forgedAxe'], note: 'A carved four-poster under a canopy of spider silk: wake rested and healed. Needs a steel axe to carve it' },
  { id: 'gate', needs: { log: 4, vine: 2 }, note: 'Joins a palisade; Q to open and close' },
  { id: 'chest', needs: { log: 5 }, note: 'Holds ten stacks; food in it keeps three times as long' },
  { id: 'bed', needs: { log: 2, wool: 3 }, note: 'Sleep the night through; you wake here after dying' },
  { id: 'dryingRack', needs: { stick: 4, vine: 2 }, note: 'Dries raw meat and fish into jerky that keeps' },
  { id: 'snare', needs: { stick: 2, vine: 2 }, note: 'Set it in the grass: it catches rabbits' },
  { id: 'raft', needs: { log: 6, vine: 3 }, note: 'Set it on the water; Q to climb aboard' },
  { id: 'silkRope', needs: { silk: 2 }, makes: 2, note: "Spider silk spun into rope: light and strong. Throw it down a drop like a rope" },
  { id: 'rope', needs: { vine: 3 }, note: 'Throw it down from a cliff top (click at the edge) to climb up and down' },
  { id: 'quiver', needs: { deerSkin: 1, vine: 1 }, note: 'Carry it: arrows and bolts stack three times as deep (30 to a slot)' },
  { id: 'backpack', needs: { deerSkin: 3, rope: 1 }, note: 'Wear it on your back (click with it, or put it on in your inventory, E): six more slots' },
  { id: 'saddlebags', needs: { deerSkin: 3, rope: 1 }, note: 'Q on your tame horse with them in hand; B by your horse (or riding) to open them: eight slots it carries' },
  { id: 'repairBench', needs: { log: 3, rock: 4, stick: 2 }, note: 'Q at it with a worn tool in hand: mended good as new for a little of what it was made of (far cheaper than a new one)' },
  { id: 'logBridge', needs: { log: 6, rope: 2 }, note: 'Stand at a river bank or the edge of a gap, looking across: laid across to the far side (up to 14 m)' },
  { id: 'ropeBridge', needs: { rope: 6, stick: 12, log: 2 }, note: 'Stand at the edge of a gorge, looking across: slung over to the far side (up to 26 m)' },
  { id: 'chair', needs: { log: 1, stick: 4 }, note: 'Sit and rest a while (Q): you get your strength back faster' },
  { id: 'table', needs: { log: 2, stick: 4 }, note: 'A table, for your house' },
  { id: 'shelf', needs: { log: 2, stick: 3 }, note: 'Shelves: six slots of storage (Q)' },
  { id: 'appleSapling', needs: { apple: 2, stick: 1 }, note: 'Pips from good apples, started on a stake. Plant it: an apple tree in a few days, fruiting each summer' },
  { id: 'berryCutting', needs: { berries: 4, stick: 1 }, note: 'Plant it: a berry bush in a couple of days, fruiting each summer' },
  { id: 'sapling', needs: { stick: 2, vine: 1 }, note: 'An oak to grow by your home (or get them felling trees). Grown, fell it for logs: it grows back from the stump' },
  { id: 'trophyRack', needs: { log: 1, stick: 3, rope: 1 }, note: 'Q with a great beast\'s trophy in hand to hang it up; Q with your hand empty to take it down' },
  { id: 'coop', needs: { log: 3, stick: 6, wheat: 2 }, note: 'Tame turkeys and ducks (lure them with wheat, seeds or corn in your hand) that live near it lay eggs, and drop feathers: Q to collect' },
  { id: 'leanTo', needs: { stick: 8, vine: 4 }, note: 'A quick shelter: poles and leafy boughs. Under it you keep out of the rain, and sleep dry' },
  { id: 'waterFilter', needs: { stick: 3, sand: 3, charcoal: 2, vine: 1 }, note: 'Sand and charcoal: Q at it with a waterskin of still water and it comes out clean (no boiling)' },
  { id: 'saltedMeat', needs: { rawMeat: 2, salt: 1 }, makes: 2, note: 'Meat cured in salt: keeps a year (thirsty food, though)' },
  { id: 'saltedFish', needs: { rawFish: 2, salt: 1 }, makes: 2, note: 'Fish cured in salt: keeps a year' },
  { id: 'tanningRack', needs: { stick: 4, vine: 2 }, note: 'Stretch raw hides and furs on it: leather and tanned fur' },
  { id: 'coat', needs: { deerSkin: 2, vine: 1 }, note: 'Wear it to keep the cold out far longer' },
  { id: 'boots', needs: { deerSkin: 2, vine: 1 }, note: 'Soft-soled: your steps are quieter (the wild hear you less), a snake or a scorpion mostly bites leather, and your feet keep a little warmer' },
  { id: 'furBoots', needs: { deerSkin: 1, pelt: 1, vine: 1 }, note: 'Boots lined with fur: quiet, and warm in the snow' },
  { id: 'gloves', needs: { deerSkin: 1, vine: 1 }, note: 'No more thorns: pick berries, pull vines and handle cactus without a scratch; fewer bee stings' },
  { id: 'furHat', needs: { pelt: 1, vine: 1 }, note: 'Ear flaps and all: a good deal warmer in the cold' },
  { id: 'climbingPicks', needs: { ironBar: 2, stick: 2, deerSkin: 1 }, note: 'A pair of iron picks: carry them and you can scramble up rock far too steep to walk (hard going: it tires you, and wears them). A ladder, or a rope from the top, for sheer walls' },
  { id: 'ladder', needs: { log: 1, stick: 8 }, note: 'Face a rock wall or the wall of your house, close to it, and set it up (up to 7 m): Q to climb. Shift+Q takes it down' },
  { id: 'canoe', needs: { log: 2, stick: 2 }, uses: ['steelAxe', 'forgedAxe'], note: 'A log hollowed out with a steel axe: set it on the water and Q to climb in. Twice as quick as a raft, it glides between strokes and rides a river\'s current. Shift+Q to carry it (heavy)' },
  { id: 'sign', needs: { log: 1, stick: 2 }, note: 'A board on a post: Q at it to write on it (a name for your camp, a warning, the way home)' },
  { id: 'candle', needs: { beeswax: 1, vine: 1 }, makes: 2, note: 'Two beeswax candles: a small soft light to set on a table or a shelf, or on a wall (lit as you set it)' },
  { id: 'lantern', needs: { ironBar: 1, candle: 1, deerSkin: 1 }, note: 'A candle behind panes of scraped hide in an iron frame: a steady light the rain and wind don\'t put out. Hang it on a wall or set it down' },
  { id: 'pail', needs: { log: 1, vine: 2 }, note: 'Q on a tame nanny goat with it in hand: milk (twice a day)' },
  { id: 'cheese', needs: { milk: 4, salt: 1 }, at: 'fire', note: 'Milk warmed by a fire, curdled with salt, pressed: cheese that keeps a season and more' },
  { id: 'beeBox', needs: { log: 2, stick: 4, honey: 1 }, note: 'Set it down among flowers (not in the desert or the snow), honey in it for bait: a wild swarm moves in within a day or so (not in winter). Q for honey and beeswax: a lit torch in hand smokes the bees quiet' },
  { id: 'longbow', needs: { log: 1, rope: 1, deerSkin: 1 }, note: 'A tall bow from one stave: slower to draw full, but arrows fly far further and strike harder' },
  { id: 'fireArrow', needs: { arrow: 4, beeswax: 1, vine: 1 }, makes: 4, note: 'A waxed rag bound at each head, lit as you loose: sets grass, trees, wood burning; a beast it hits panics. (Wild nests give a little beeswax too)' },
  { id: 'furCloak', needs: { pelt: 3, rope: 1 }, note: 'The warmest thing to wear in the winter' },
  { id: 'armour', needs: { deerSkin: 3, vine: 2 }, note: 'Wear it: bites and blows hurt less' },
  { id: 'steelAxe', needs: { ironBar: 2, stick: 1, vine: 1 }, note: 'Twice the life, fells trees twice as fast' },
  { id: 'steelPickaxe', needs: { ironBar: 2, stick: 2 }, note: 'Twice the life of a stone one' },
  { id: 'steelSpear', needs: { ironBar: 1, log: 1, vine: 1 }, note: 'Twice the life of a stone spear' },
  { id: 'fineFlintSteel', needs: { flint: 1, iron: 1 }, note: 'Flint struck on iron: twice the life' },
  { id: 'pot', needs: { ironBar: 1 }, note: 'On a burning fire with meat and berries or mushrooms: stew' },
  { id: 'sickle', needs: { stick: 1, flint: 2 }, note: 'Click to cut the long grass round where you look down to stubble (it grows back); now and then you find seeds in it' },
  { id: 'hoe', needs: { stick: 2, rock: 1 }, note: 'Click the ground to dig a plot to sow seeds in' },
  { id: 'shears', needs: { ironBar: 1 }, note: 'Shear a tame sheep (Q) for its wool' },
  { id: 'dough', needs: { wheat: 3 }, note: 'Bake it on a fire into bread that keeps' },
  { id: 'fence', needs: { log: 2, stick: 2 }, note: 'Low fencing, to pen sheep: fences join end to end' },
  { id: 'fenceGate', needs: { log: 1, stick: 3 }, note: 'A gate in a fence; Q to open and close' },
  { id: 'roof', needs: { log: 4, vine: 3 }, note: 'A slope of thatch to set on top of your walls, over a floor: pieces side by side make the roof. Under it, walls round you, you shelter from the weather' },
  { id: 'woodWindow', needs: { log: 4, stick: 4, vine: 1 }, note: 'A section of palisade with a window in it: joins end to end with the walls' },
  { id: 'stoneWindow', needs: { rock: 34, stick: 3 }, note: 'A section of stone wall with a window in it: joins end to end with the walls' },
  { id: 'cellar', needs: { rock: 10, log: 4 }, note: 'Dug into the ground: holds 24 stacks, food in it never spoils, and no bear gets in' },
  { id: 'fishTrap', needs: { stick: 6, vine: 3 }, note: 'Set it in a river or lake: it catches fish while you are away (up to three)' },
  { id: 'smokingRack', needs: { stick: 6, vine: 2, log: 1 }, note: 'Stand it over a campfire: raw meat and fish hung on it smoke while the fire burns, and keep for good' },
  { id: 'woodFloor', needs: { log: 3, stick: 4 }, uses: ['forgedAxe'], note: 'Planks on posts, 4 m square: floors join edge to edge. Aim at the top of your walls to lay one a storey up. Needs a steel axe' },
  { id: 'stoneFloor', needs: { rock: 8 }, note: 'Flagstones on a stone footing, 4 m square: floors join edge to edge' },
  { id: 'stoneWall', needs: { rock: 40 }, note: 'Rough-cut stone, joins end to end like the palisade (and with it): it never burns' },
  { id: 'stoneFence', needs: { rock: 20 }, note: 'A low wall of field stones, to pen sheep: joins end to end like a fence' },
  { id: 'chimney', needs: { rock: 30 }, note: 'A stone stack: a campfire or furnace set beside it sends its smoke up the chimney' },
  { id: 'slateRoof', needs: { rock: 8, log: 3 }, note: 'A slope of slates on rafters, set on top of your walls: a roof that never burns' },
  { id: 'grindstone', needs: { rock: 6, log: 1, stick: 2 }, note: 'Click it with a worn blade to grind it keen again (three times at most)' },
  { id: 'anvil', needs: { ironBar: 4, log: 1 }, note: 'Forge steel tools at it (stand by it to craft them)' },
  { id: 'saddle', needs: { deerSkin: 4, rope: 1, ironBar: 1 }, note: 'Put it on a tame horse (Q with it in hand), then ride' },
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
  { id: 'caveLamp', needs: { crystal: 2, glowcap: 2, rock: 1 }, note: 'Crystals and glowcaps set in a stone: a cold blue light that never goes out' },
  { id: 'paleCloak', needs: { paleFur: 1, pelt: 2 }, note: 'Pale and soft: warm, and the wild notice you less' },
  { id: 'caveCloak', needs: { caveBearPelt: 1, rope: 1 }, note: 'The warmest thing to wear there is' },
];

/**
 * The crafting tree: what you can make, in four tiers, each opened by
 * something the one before lets you do (see Game: progress). Everything
 * in RECIPES is in one of them.
 */
export const TIERS = [
  { id: 'stone', name: 'Stone', tag: 'From the start', ids: ['axe', 'pickaxe', 'spear', 'sickle', 'torch', 'coalTorch', 'caveLamp', 'silkRope', 'bow', 'arrow', 'strawHat', 'fishingRod', 'bandage', 'campfire', 'flintSteel', 'hoe', 'rope', 'stake', 'snare', 'fineFlintSteel', 'leanTo', 'strawBed'] },
  { id: 'camp', name: 'Camp', tag: 'Set down a campfire', unlock: 'campfire', ids: ['appleSapling', 'berryCutting', 'sapling', 'waterskin', 'waterFilter', 'logBridge', 'ropeBridge', 'chair', 'table', 'shelf', 'trophyRack', 'coop', 'sign', 'ladder', 'beeBox', 'candle', 'pail', 'cheese', 'boots', 'furBoots', 'gloves', 'furHat', 'longbow', 'fireArrow', 'quiver', 'backpack', 'saddlebags', 'repairBench', 'saltedMeat', 'saltedFish', 'dryingRack', 'tanningRack', 'coat', 'armour', 'furCloak', 'chest', 'bed', 'furnace', 'fence', 'fenceGate', 'wall', 'gate', 'roof', 'raft', 'grindstone', 'dough', 'stoneFloor', 'stoneWall', 'stoneStairs', 'stoneFence', 'chimney', 'slateRoof', 'cellar', 'fishTrap', 'smokingRack', 'woodWindow', 'stoneWindow', 'logWall', 'logFloor', 'logStairs', 'logRoof', 'bedroll', 'logWindow', 'logDoor', 'stoneDoor'] },
  { id: 'iron', name: 'Iron', tag: 'Smelt iron ore into a bar in a furnace', unlock: 'ironBar', ids: ['steelAxe', 'steelPickaxe', 'steelSpear', 'pot', 'shears', 'saddle', 'anvil', 'lantern', 'canoe', 'climbingPicks'] },
  { id: 'steel', name: 'Steel', tag: 'Smelt mountain iron ore with coal in a furnace (both from high in the mountains)', unlock: 'steelBar', ids: ['forgedAxe', 'forgedPickaxe', 'forgedSpear', 'sword', 'steelArmour', 'crossbow', 'bolt', 'woodFloor', 'plankWall', 'plankStairs', 'shingleRoof', 'cutStoneWall', 'cutStoneFloor', 'cutStairs', 'tileRoof', 'fancyBed', 'plankWindow', 'plankDoor', 'cutWindow', 'cutDoor'] },
  { id: 'trophy', name: 'Trophies', tag: 'Bring down one of the great beasts', unlock: 'trophy', ids: ['scarArmour', 'lionArmour', 'tigerArmour', 'crocArmour', 'fangSword', 'antlerBow', 'tuskPickaxe', 'poisonArrow', 'poisonBolt', 'greatSaddle', 'hideRoof', 'paleCloak', 'caveCloak'] },
];
/**
 * The Lost Keep's altar wants one of each great beast's trophy: all of
 * them, the Broodmother's heart with the rest (see Game.#offer).
 */
export const RELICS = ['grizzlyPelt', 'alphaFang', 'paleFur', 'greatAntlers', 'greatHide', 'crocHide', 'lionPelt', 'tigerPelt', 'venomSac', 'boarTusk', 'caveBearPelt', 'broodHeart'];
// (Each one's stone in the altar, its own colour.)
export const RELIC_COLOURS = [0x8a6a50, 0xe8e4d8, 0xf4f0e8, 0xc8b490, 0x6a4430, 0x6a8a4a, 0xd8a848, 0xe07830, 0x60c040, 0xd8d0c0, 0x5a504a, 0xc02030];
/** What tool a recipe needs in your pack (not used up), in words. */
export const usesText = (r) => (r.uses?.some((t) => /Axe/.test(t)) ? 'a steel axe' : 'a steel pickaxe');
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
  rawFowl: MEAT('#e8a8a0', '#f4ccc4'),
  cookedMeat: MEAT('#7a3e1e', '#a85a2a'),
  rawFish: FISH('#8aa4b4', '#b8cad4'),
  cookedFish: FISH('#a8703a', '#c8904a'),
  quiver: `<path d="M11 4l10 2-3 23-8-1z" fill="#8a5a34"/><path d="M12 8l8 2M11 14l8 1" stroke="#6a4024"/><path d="M13 4l1-3M16 4l1-3M19 5l1-3" stroke="#d8d0c0" stroke-width="1.5"/>`,
  backpack: `<path d="M8 10c0-5 16-5 16 0v17H8z" fill="#8a5a34"/><path d="M10 16h12v8H10z" fill="#a8744a"/><path d="M12 6c0-3 8-3 8 0" stroke="#5a3a24" stroke-width="2" fill="none"/><path d="M15 19h2" stroke="#3a2a1a" stroke-width="2"/>`,
  saddlebags: `<path d="M3 12h11v12H3zM18 12h11v12H18z" fill="#8a5a34"/><path d="M14 13h4" stroke="#5a3a24" stroke-width="3"/><path d="M3 16h11M18 16h11" stroke="#5a3a24"/>`,
  repairBench: `<path d="M3 16h26v4H3z" fill="#8a6038"/><path d="M5 20v8M27 20v8" stroke="#6a4424" stroke-width="3"/><path d="M14 8l6 6-2 2-6-6z" fill="#9aa0a8"/><path d="M12 12l-4 4" stroke="#8a5d38" stroke-width="2"/>`,
  logBridge: `<path d="M2 18h28v4H2z" fill="#8a6040"/><path d="M4 18v-6M28 18v-6M4 13h24" stroke="#6a4424" stroke-width="2"/><path d="M8 18v4M13 18v4M18 18v4M23 18v4" stroke="#5a3a24"/>`,
  ropeBridge: `<path d="M2 14q14 10 28 0" stroke="#c8a878" stroke-width="2" fill="none"/><path d="M2 20q14 10 28 0" stroke="#8a6040" stroke-width="4" fill="none"/><path d="M3 10v12M29 10v12" stroke="#6a4424" stroke-width="2.5"/>`,
  chair: `<path d="M9 16h14v3H9z" fill="#9a7048"/><path d="M10 19v9M22 19v9M10 16V4M22 16V4M10 7h12M10 11h12" stroke="#7a5638" stroke-width="2"/>`,
  table: `<path d="M3 12h26v3H3z" fill="#9a7048"/><path d="M6 15v13M26 15v13" stroke="#7a5638" stroke-width="2.5"/><path d="M19 7h4v5h-4z" fill="#a86a44"/>`,
  shelf: `<path d="M5 3v26M27 3v26" stroke="#7a5638" stroke-width="2.5"/><path d="M5 8h22M5 16h22M5 24h22" stroke="#9a7048" stroke-width="2.5"/><path d="M9 12h4v4H9zM17 20h5v4h-5z" fill="#c4945a"/>`,
  trophyRack: `<path d="M16 14v16" stroke="#6e4c32" stroke-width="3"/><path d="M6 4h20v12H6z" fill="#8a6040"/><path d="M10 8c2-3 4-3 6 0 2-3 4-3 6 0-2 4-10 4-12 0z" fill="#e8dcc0"/>`,
  coop: `<path d="M4 14l12-9 12 9z" fill="#6a4a30"/><path d="M6 14h20v10H6z" fill="#9a7048"/><path d="M14 18h5v6h-5z" fill="#2a2018"/><path d="M6 24v5M26 24v5" stroke="#6e4c32" stroke-width="2"/>`,
  rawEgg: `<ellipse cx="16" cy="17" rx="8" ry="10" fill="#f0e6d2"/><ellipse cx="13" cy="13" rx="2.5" ry="3.5" fill="#fffaf0"/>`,
  cookedEgg: `<ellipse cx="16" cy="17" rx="12" ry="9" fill="#fafaf4"/><circle cx="16" cy="16" r="5" fill="#f0b830"/>`,
  honey: `<path d="M9 8h14l2 18c0 3-18 3-18 0z" fill="#e8a020"/><path d="M8 6h16v4H8z" fill="#c8a070"/><path d="M12 15c2 2 6 2 8 0" stroke="#f8c850" stroke-width="2" fill="none"/>`,
  salt: `<path d="M6 24c2-8 6-12 10-12s8 4 10 12z" fill="#f4f2ee"/><path d="M10 22l3-4 3 3 3-5 4 6" stroke="#d8d4cc" fill="none"/><circle cx="12" cy="25" r="1" fill="#e4e0d8"/><circle cx="21" cy="24" r="1" fill="#e4e0d8"/>`,
  sand: `<path d="M5 25c3-9 7-13 11-13s8 4 11 13z" fill="#e2c88a"/><path d="M9 22c3-1 5-1 7 0M15 18c2 0 4 1 5 2" stroke="#c8ac6a" fill="none"/>`,
  saltedMeat: `<path d="M6 15c1-6 12-9 18-5s3 12-3 14-15 0-15-9z" fill="#a84a3a"/><circle cx="11" cy="14" r="1" fill="#fff"/><circle cx="16" cy="12" r="1" fill="#fff"/><circle cx="19" cy="17" r="1" fill="#fff"/><circle cx="13" cy="19" r="1" fill="#fff"/>`,
  saltedFish: `<path d="M4 16c6-7 16-7 20 0-4 7-14 7-20 0z" fill="#9a8a70"/><path d="M24 16l5-5v10z" fill="#8a7a60"/><circle cx="10" cy="15" r="1" fill="#fff"/><circle cx="15" cy="17" r="1" fill="#fff"/><circle cx="19" cy="14" r="1" fill="#fff"/>`,
  straw: `<path d="M5 25L23 5M8 26L26 8M5 21L19 5M11 27L27 12M7 23L24 6" stroke="#d8b860" stroke-width="2"/><path d="M9 14l12 6" stroke="#a88838" stroke-width="2.5"/>`,
  strawBed: `<path d="M3 24q3-8 13-8t13 8z" fill="#d4b45a"/><path d="M6 22l4-4M12 21l3-4M18 21l2-4M24 22l-2-4" stroke="#b8963e"/><path d="M3 24h26v2H3z" fill="#a8883a"/>`,
  leanTo: `<path d="M4 27L14 7h4l10 20z" fill="#5a8a3a"/><path d="M14 7L4 27M18 7l10 20M12 7h8" stroke="#7a5230" stroke-width="2"/><path d="M8 20h16M10 15h12" stroke="#4a7a2e"/>`,
  waterFilter: `<path d="M9 5h14l-4 16h-6z" fill="#8a6a48"/><path d="M11 9h10M12 13h8" stroke="#e2c88a" stroke-width="2"/><path d="M12 16h8" stroke="#2a2420" stroke-width="2"/><path d="M16 22v3" stroke="#6ab4e8" stroke-width="2"/><ellipse cx="16" cy="28" rx="5" ry="2" fill="#6ab4e8"/>`,
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
  beeswax: `<path d="M6 14l10-5 10 5-10 5z" fill="#f4d870"/><path d="M6 14v6l10 5v-6z" fill="#d8b040"/><path d="M26 14v6l-10 5v-6z" fill="#c09830"/>`,
  milk: `<path d="M9 9h14l-2 18H11z" fill="#a8845a"/><path d="M9 9h14v3H9z" fill="#f4f0e6"/><path d="M9 14h14M10 22h12" stroke="#5a4a30" stroke-width="1.4"/>`,
  pail: `<path d="M9 11h14l-2 16H11z" fill="#a8845a"/><path d="M9 14h14M10 22h12" stroke="#5a4a30" stroke-width="1.4"/><path d="M9 11c0-7 14-7 14 0" fill="none" stroke="#6e4c32" stroke-width="1.4"/>`,
  cheese: `<path d="M5 20l11-11 11 6v7L16 27 5 22z" fill="#f0d080"/><path d="M5 20l11 2 11-7-11-6z" fill="#f8e0a0"/><circle cx="12" cy="23" r="1.4" fill="#d8b050"/><circle cx="20" cy="22" r="1" fill="#d8b050"/>`,
  boots: `<path d="M7 6h7v14h5v6H7z" fill="#7a5232"/><path d="M7 24h12v3H7z" fill="#3a2a1e"/><path d="M17 8h6v12h5v6H17z" fill="#8a6038"/><path d="M17 24h11v3H17z" fill="#3a2a1e"/>`,
  furBoots: `<path d="M7 6h7v14h5v6H7z" fill="#6a4a30"/><path d="M7 24h12v3H7z" fill="#2a2018"/><path d="M6 5h9v4H6z" fill="#a89070"/><path d="M17 8h6v12h5v6H17z" fill="#7a5638"/><path d="M17 24h11v3H17z" fill="#2a2018"/><path d="M16 7h8v4h-8z" fill="#a89070"/>`,
  gloves: `<path d="M5 16l2-8h2l1 5 1-6h2l0 7 1-6h2l-1 8 2-3 2 1-4 8H8z" fill="#9a6a3e"/><path d="M8 22h7v5H8z" fill="#6a4426"/><path d="M18 18l2-8h2l1 5 1-6h2l0 7 1-6h2l-1 8-3 6h-5z" fill="#8a5c34"/>`,
  furHat: `<path d="M7 18c0-9 18-9 18 0z" fill="#8a7458"/><path d="M6 17h20v4H6z" fill="#a89070"/><path d="M6 20h4v6H6zM22 20h4v6h-4z" fill="#a89070"/>`,
  strawHat: `<path d="M2 20c4-3 24-3 28 0-4 3-24 3-28 0z" fill="#e0c878"/><path d="M10 19c0-7 12-7 12 0z" fill="#d8bc6a"/><path d="M10 17h12v2H10z" fill="#8a4a2a"/>`,
  longbow: `<path d="M9 1c14 5 16 20 10 30" fill="none" stroke="#b8885a" stroke-width="2.4" stroke-linecap="round"/><path d="M9 1l10 30" stroke="#e8e0cc" stroke-width="0.8"/><path d="M15 14h4v4h-4z" fill="#5a3c24"/>`,
  fireArrow: `<path d="M6 26L24 8" stroke="#9a6e44" stroke-width="1.8"/><path d="M22 6l6-2-2 6z" fill="#3e4250"/><path d="M21 9c-1-4 2-6 3-8 1 3 4 4 2 8z" fill="#ff8a20"/><path d="M22 9c0-2 1-3 2-4 0 2 2 2 1 4z" fill="#ffd040"/><path d="M6 26l-1-5 3 2zM6 26l5 1-2-3z" fill="#e8e0d0"/>`,
  ladder: `<path d="M9 3l-3 26M23 3l3 26" stroke="#8a6038" stroke-width="2.4"/><path d="M8 8h16M7.5 13h17M7 18h18M6.5 23h19" stroke="#9a7048" stroke-width="2"/>`,
  climbingPicks: `<path d="M8 28L14 6" stroke="#7a5232" stroke-width="2.4"/><path d="M9 6c3-3 8-2 10 1l-5 1z" fill="#8a949e"/><path d="M18 29l5-20" stroke="#7a5232" stroke-width="2.4"/><path d="M18 9c3-3 8-2 10 1l-5 1z" fill="#8a949e"/>`,
  canoe: `<path d="M2 16c6 6 22 6 28 0-6 2-22 2-28 0z" fill="#8a5a34"/><path d="M4 16c6 3 18 3 24 0" stroke="#5a3a20" stroke-width="1.2" fill="none"/><path d="M18 6l-4 14" stroke="#9a7048" stroke-width="1.6"/><path d="M12 19l3 2 1-4z" fill="#9a7048"/>`,
  sign: `<path d="M15 16h3v14h-3z" fill="#6e4c32"/><path d="M4 5h24v12H4z" fill="#9a7048"/><path d="M8 9h12M8 13h16" stroke="#2a1a10" stroke-width="1.6"/>`,
  candle: `<path d="M13 12h6v15h-6z" fill="#f0e2b0"/><path d="M10 27h12v2H10z" fill="#3a3a3e"/><path d="M16 4c-2 3-2 5 0 7 2-2 2-4 0-7z" fill="#ffa030"/><path d="M16 7c-1 1-1 2 0 3 1-1 1-2 0-3z" fill="#ffe080"/>`,
  lantern: `<path d="M10 9h12v16H10z" fill="#ffc070" opacity=".8"/><path d="M9 7h14v3H9zM9 24h14v3H9z" fill="#3a3a3e"/><path d="M10 9v16M22 9v16" stroke="#3a3a3e" stroke-width="1.6"/><path d="M13 7c0-4 6-4 6 0" fill="none" stroke="#3a3a3e" stroke-width="1.4"/><path d="M16 13c-2 3-2 5 0 7 2-2 2-4 0-7z" fill="#ffa030"/>`,
  beeBox: `<path d="M7 9h18v18H7z" fill="#c8a670"/><path d="M7 15h18M7 21h18" stroke="#8a6a48" stroke-width="1.2"/><path d="M5 7h22v3H5z" fill="#8a6a48"/><path d="M13 25h6v2h-6z" fill="#1e1610"/><circle cx="24" cy="6" r="1.4" fill="#e8b020"/><circle cx="27" cy="9" r="1.2" fill="#e8b020"/>`,
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
  cellar: `<path d="M2 26c2-12 26-12 28 0z" fill="#5c7a3a"/><path d="M9 26v-8h14v8z" fill="#8a8780"/><path d="M12 26v-6h8v6z" fill="#7a5a36"/><path d="M16 20v6" stroke="#4a3422"/><circle cx="18.5" cy="23" r="0.8" fill="#3a3634"/>`,
  fishTrap: `<path d="M5 12l20 4-20 4z" fill="none" stroke="#9a7a4a" stroke-width="1.6"/><path d="M8 12.6v6.8M12 13.4v5.2M16 14.2v3.6" stroke="#7a5a36" stroke-width="1.2"/><path d="M26 6v22" stroke="#6e5234" stroke-width="2"/><path d="M3 24c4-2 8 2 12 0s8 2 14 0" fill="none" stroke="#6aa8c8" stroke-width="1.4"/>`,
  smokingRack: `<path d="M6 28L10 6M26 28L22 6M6 6h20" stroke="#6e5234" stroke-width="2"/><path d="M9 11h14" stroke="#5a4230" stroke-width="1.6"/><path d="M12 11v6M16 11v6M20 11v6" stroke="#8a3a24" stroke-width="2"/><path d="M13 27l3-5 3 5z" fill="#ff8a2a"/><path d="M14 19c-2-2 2-3 0-5M18 19c-2-2 2-3 0-5" stroke="#b8b4ac" fill="none"/>`,
  smokedMeat: `<path d="M6 15c1-6 12-9 18-5s3 12-3 14-15 0-15-9z" fill="#5a2a16"/><path d="M10 14c3-3 9-4 12-1l-3 6z" fill="#7a3e1e"/><path d="M8 20l-4 4 3 2 3-4z" fill="#f0e6d6"/>`,
  smokedFish: `<path d="M4 16c5-7 15-7 20 0-5 7-15 7-20 0z" fill="#8a5a2a"/><path d="M24 16l5-5v10z" fill="#6a4020"/><path d="M8 16c3-4 9-4 12 0z" fill="#a8703a"/><circle cx="8" cy="15" r="1.2" fill="#1a1a1a"/>`,
  silk: `<path d="M6 26C10 14 22 18 26 6" fill="none" stroke="#e8e4dc" stroke-width="1.6"/><path d="M8 24c6-4 10-2 16-12M11 27c4-6 9-6 13-14" fill="none" stroke="#d0ccc4" stroke-width="1"/><circle cx="26" cy="6" r="2.4" fill="#f4f0ea"/>`,
  silkRope: `<path d="M8 6c10 0 14 6 8 10s-10 10 4 10" fill="none" stroke="#e8e4dc" stroke-width="3"/><path d="M8 6c10 0 14 6 8 10s-10 10 4 10" fill="none" stroke="#c8c0b4" stroke-width="1" stroke-dasharray="2 2"/>`,
  woodWindow: `<path d="M4 29V9l2-4 2 4v20M24 29V8l2-4 2 4v21" fill="#8a6a44" stroke="#5a3c24"/><path d="M10 29v-9h12v9M10 12h12v-4H10z" fill="#8a6a44" stroke="#5a3c24"/><path d="M10 12h12v8H10z" fill="#bcd8e8" stroke="#7a5a36" stroke-width="1.4"/><path d="M16 12v8M10 16h12" stroke="#7a5a36"/>`,
  stoneWindow: `<path d="M3 8h26v20H3z" fill="#8a8780"/><path d="M3 13h26M3 23h26M10 8v5M20 8v5M7 23v5M17 23v5M26 23v5" stroke="#5a5852" stroke-width="1.2"/><path d="M11 13h10v9H11z" fill="#bcd8e8" stroke="#5e4630" stroke-width="1.4"/><path d="M16 13v9M11 17.5h10" stroke="#5e4630"/><path d="M10 22h12v2H10z" fill="#9a968c"/>`,
  sickle: `<path d="M8 28l5-8" stroke="#8a5d38" stroke-width="3" stroke-linecap="round"/><path d="M13 20c-2-8 4-15 13-15-6 2-10 7-9 14z" fill="#c8ccd0"/><path d="M13 20c-1-6 3-11 9-13" stroke="#eef2f6" fill="none"/>`,
  woodFloor: `<path d="M3 20l13-7 13 7-13 7z" fill="#a47e50"/><path d="M6.2 21.7l13-7M9.5 23.4l13-7M12.8 25.2l13-7" stroke="#7a5a36" stroke-width="1"/><path d="M3 20v3l13 7v-3zM29 20v3l-13 7v-3z" fill="#5e4630"/>`,
  stoneFloor: `<path d="M3 20l13-7 13 7-13 7z" fill="#8a8780"/><path d="M9 16.8l13 7M16 13l-7 10.5M22 16.2l-6 4M12 18.4l7 3.8" stroke="#5a5852" stroke-width="1"/><path d="M3 20v3l13 7v-3zM29 20v3l-13 7v-3z" fill="#6e6c68"/>`,
  stoneWall: `<path d="M3 8h26v20H3z" fill="#8a8780"/><path d="M3 13h26M3 18h26M3 23h26M10 8v5M20 8v5M6 13v5M15 13v5M25 13v5M11 18v5M21 18v5M7 23v5M17 23v5M26 23v5" stroke="#5a5852" stroke-width="1.2"/><path d="M3 8h9v3H3z" fill="#5c7a3a"/>`,
  stoneFence: `<ellipse cx="7" cy="23" rx="4" ry="3" fill="#8a8780"/><ellipse cx="15" cy="24" rx="4.5" ry="3" fill="#7c7a74"/><ellipse cx="24" cy="23" rx="4.5" ry="3" fill="#96928a"/><ellipse cx="11" cy="19" rx="4" ry="2.6" fill="#9a968c"/><ellipse cx="20" cy="19" rx="4.4" ry="2.6" fill="#84806e"/><path d="M4 15.5h24v2.5H4z" fill="#6e6c68"/>`,
  chimney: `<path d="M10 6h12v22H10z" fill="#8a8780"/><path d="M10 10h12M10 14h12M10 18h12M10 22h12M16 6v4M13 10v4M19 10v4M16 14v4M13 18v4M19 18v4" stroke="#5a5852" stroke-width="1"/><path d="M13 22h6v6h-6z" fill="#24201c"/><path d="M14 2c-2 2 2 3 0 5M18 1c-2 2 2 3 0 5" stroke="#b8b4ac" fill="none" stroke-width="1.4"/>`,
  slateRoof: `<path d="M2 17L16 6l14 11z" fill="#5a6270"/><path d="M6 14h20M9 11.5h14M12 9h8" stroke="#3e444c" stroke-width="1.2"/><path d="M6 17v11M26 17v11" stroke="#5e4630" stroke-width="2.4"/>`,
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
ICONS.coalTorch = `<path d="M14 30l3-17h2l-1 17z" fill="#7a5634"/><path d="M14 13h6l-1 4h-4z" fill="#1e1a18"/><path d="M17 3c4 3 4 6 1 10h-2c-3-4-1-7 1-10z" fill="#fff4d0"/><path d="M17 6c2 2 2 4 0 6h-1c-1-2 0-4 1-6z" fill="#ffffff"/>`;
// (The cave finds.)
ICONS.crystal = `<path d="M10 27l3-14 3-9 3 9 1 14z" fill="#9ae8ff"/><path d="M16 4l3 9 1 14h-4z" fill="#c8f4ff"/><path d="M19 27l3-10 4-5 0 9-2 6z" fill="#c0a0ff"/><path d="M6 28h22v-2H6z" fill="#6a6572"/>`;
ICONS.caveLamp = `<path d="M8 29h16l-2-5H10z" fill="#5a5058"/><path d="M12 24l2-12 2-6 2 6 2 12z" fill="#a8ecff"/><path d="M16 6l2 6 2 12h-4z" fill="#d8f8ff"/><circle cx="16" cy="16" r="11" fill="#7ac8ff" opacity="0.18"/>`;
ICONS.glowcap = `<path d="M14 28h4l-1-12h-2z" fill="#d8f0e8"/><path d="M6 17c0-6 5-10 10-10s10 4 10 10z" fill="#7affc8"/><circle cx="16" cy="13" r="10" fill="#7affc8" opacity="0.2"/>`;
ICONS.caveMushroom = `<path d="M14 28h4l-1-12h-2z" fill="#ece4d0"/><path d="M5 17c0-6 5-10 11-10s11 4 11 10z" fill="#d8ccb8"/><path d="M9 14c2-3 5-4 8-4" stroke="#f4ecdc" fill="none"/>`;
ICONS.deathcap = `<path d="M14 28h4l-1-12h-2z" fill="#f4f0e0"/><path d="M5 17c0-6 5-10 11-10s11 4 11 10z" fill="#e8e4c8"/><path d="M13 21h6" stroke="#c8c4a8"/><path d="M13 23h6" stroke="#c8c4a8"/>`;
ICONS.blindFish = `<path d="M4 16c5-6 13-7 19-2l5-4v12l-5-4c-6 5-14 4-19-2z" fill="#e8e4e0"/><path d="M8 16c4-3 9-3 13 0" stroke="#d0c8c4" fill="none"/>`;
ICONS.guano = `<path d="M9 12l14 0 3 14H6z" fill="#7a6a50"/><path d="M11 8h10l2 4H9z" fill="#8a7a5e"/><path d="M12 8c1-2 7-2 8 0" stroke="#8a6a44" fill="none"/><circle cx="25" cy="27" r="1.4" fill="#4a4030"/><circle cx="27" cy="25" r="1" fill="#4a4030"/>`;
// (A spawner's icon: a paw print.)
for (const id of Object.keys(ITEMS)) if (ITEMS[id].spawns) ICONS[id] = `<circle cx="16" cy="20" r="6" fill="#8a6a4a"/><circle cx="8" cy="12" r="3" fill="#8a6a4a"/><circle cx="14" cy="8" r="3" fill="#8a6a4a"/><circle cx="20" cy="8" r="3" fill="#8a6a4a"/><circle cx="25" cy="13" r="3" fill="#8a6a4a"/>`;
// (The trophies and what's made of them: the icons of their kin, recoloured.)
{
  const re = (id, from, pairs) => (ICONS[id] = pairs.reduce((t, [a, b]) => t.replaceAll(a, b), ICONS[from]));
  re('grizzlyPelt', 'pelt', [['#9a7a58', '#6a5040'], ['#c4a47a', '#8a6a50']]);
  re('lionPelt', 'pelt', [['#9a7a58', '#b08a58'], ['#c4a47a', '#5a3a20']]);
  re('tigerPelt', 'pelt', [['#9a7a58', '#d8782a'], ['#c4a47a', '#1a1210']]);
  re('paleFur', 'pelt', [['#9a7a58', '#e0dcd2'], ['#c4a47a', '#f4f0e8']]);
  ICONS.broodHeart = `<path d="M16 27C6 20 4 14 7 10s8-3 9 1c1-4 6-5 9-1s1 10-9 17z" fill="#5a1418"/><path d="M10 11c2-2 5-1 5 2" stroke="#a03038" stroke-width="1.6" fill="none"/><circle cx="20" cy="14" r="1.4" fill="#d04040"/><circle cx="13" cy="18" r="1" fill="#d04040"/>`;
  re('caveBearPelt', 'pelt', [['#9a7a58', '#3a3230'], ['#c4a47a', '#5a504a']]);
  re('greatHide', 'hide', [['#8a5a3a', '#4a3020'], ['#b06a58', '#6a4430']]);
  re('crocHide', 'hide', [['#8a5a3a', '#4a5a3a'], ['#b06a58', '#6a7a50']]);
  ICONS.alphaFang = `<path d="M14 4c4 0 6 3 5 8l-3 16-3-16c-1-5-1-8 1-8z" fill="#f0ead8"/><path d="M15 6c2 0 3 2 2 5" stroke="#c8c0a8" fill="none"/>`;
  ICONS.greatAntlers = `<path d="M16 28V18M16 18c-6-2-9-8-9-14M16 18c6-2 9-8 9-14M10 12l-5-2M22 12l5-2M9 7l-3-4M23 7l3-4" stroke="#d8c8a0" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  ICONS.deerAntlers = ICONS.greatAntlers;
  ICONS.elkAntlers = ICONS.greatAntlers;
  ICONS.mooseAntlers = `<path d="M16 28V19M16 19c-7 0-11-4-11-10l4 2 1-4 3 3M16 19c7 0 11-4 11-10l-4 2-1-4-3 3" stroke="#cbb690" stroke-width="2.4" fill="none" stroke-linejoin="round"/>`;
  ICONS.bearClaws = `<path d="M8 8c2 6 2 12 0 18M14 6c2 7 2 14 0 20M20 6c2 7 2 14 0 20M26 8c1 6 1 12-1 18" stroke="#3a2e26" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  ICONS.wolfSkull = `<path d="M6 12l4-6 6 4 6-4 4 6-2 8-8 8-8-8z" fill="#ece4d4"/><circle cx="12" cy="15" r="2" fill="#3a3430"/><circle cx="20" cy="15" r="2" fill="#3a3430"/>`;
  ICONS.cougarSkull = ICONS.wolfSkull;
  ICONS.appleSapling = `<path d="M16 29V14" stroke="#7a5236" stroke-width="2.4"/><path d="M16 15c-6 0-9-4-9-8 5 0 9 3 9 8zM16 13c5-1 8-5 8-9-5 1-8 4-8 9z" fill="#6aa44a"/><circle cx="21" cy="17" r="2.4" fill="#d43a2a"/>`;
  ICONS.berryCutting = `<path d="M16 29V12" stroke="#6a4a34" stroke-width="2"/><path d="M16 16c-5-1-7-5-7-8 4 1 7 4 7 8zM16 14c4-1 6-4 6-7-4 1-6 3-6 7z" fill="#5a9a44"/><circle cx="12" cy="20" r="2" fill="#c02a4a"/><circle cx="20" cy="22" r="2" fill="#3a4aa8"/>`;
  ICONS.sapling = `<path d="M16 29V10" stroke="#7a5236" stroke-width="2.4"/><path d="M16 12c-6 0-10-4-10-8 6 0 10 3 10 8zM16 10c6-1 10-5 10-9-6 1-10 4-10 9zM16 18c-5 0-8-3-8-6 5 0 8 2 8 6z" fill="#4a8a3a"/>`;
  ICONS.trophyFish = `<path d="M3 16c6-8 16-9 22-3l5-4v14l-5-4c-6 6-16 5-22-3z" fill="#6a8a5a"/><circle cx="9" cy="14" r="1.4" fill="#222"/>`;
  ICONS.venomSac = `<path d="M16 6c6 4 9 9 9 14a9 9 0 0 1-18 0c0-5 3-10 9-14z" fill="#6a8a3a"/><path d="M13 14c2-2 5-2 6 0" stroke="#a8c86a" fill="none"/><circle cx="16" cy="21" r="2.4" fill="#3a5a1a"/>`;
  ICONS.boarTusk = `<path d="M8 26c0-10 6-18 14-20-4 6-6 12-6 20z" fill="#f0e6d0"/><path d="M14 26c2-8 7-14 12-16-3 5-4 10-4 16z" fill="#e0d4b8"/>`;
  re('scarArmour', 'steelArmour', [['#9aa4b0', '#6a5040']]);
  re('lionArmour', 'steelArmour', [['#9aa4b0', '#b08a58']]);
  re('tigerArmour', 'steelArmour', [['#9aa4b0', '#d8782a']]);
  re('crocArmour', 'steelArmour', [['#9aa4b0', '#4a5a3a']]);
  re('fangSword', 'sword', [['#dfe6ee', '#f4f0e4'], ['#8a949e', '#e0d8c0']]);
  re('oldSword', 'sword', [['#dfe6ee', '#a8aca4'], ['#8a949e', '#b08a3a']]);
  ICONS.oldMap = `<path d="M5 7l7-2 8 2 7-2v20l-7 2-8-2-7 2z" fill="#d8c8a0"/><path d="M12 5v20M20 7v20" stroke="#b8a47a"/><path d="M8 18c3-4 6 2 10-3s5-2 6-4" stroke="#8a5a3a" stroke-dasharray="1.5 1.5" fill="none"/><path d="M22 9l3 3M25 9l-3 3" stroke="#b02a1a" stroke-width="1.6"/>`;
  re('antlerBow', 'bow', [['#8a5d38', '#d8c8a0']]);
  re('tuskPickaxe', 'forgedPickaxe', [['#dfe6ee', '#f0e6d0'], ['#c8c4bc', '#f0e6d0']]);
  re('poisonArrow', 'arrow', [['#3e4250', '#4a7a2a']]);
  re('poisonBolt', 'bolt', [['#9aa4b0', '#4a7a2a']]);
  re('greatSaddle', 'saddle', [['#6a3a20', '#3a2818']]);
  re('hideRoof', 'roof', [['#c8a860', '#5a3a26'], ['#a88a44', '#3a2818']]);
  re('logRoof', 'roof', [['#c8a860', '#7a5232'], ['#a88a44', '#5a3c24']]);
  re('shingleRoof', 'roof', [['#c8a860', '#a47e50'], ['#a88a44', '#7a5a36']]);
  re('tileRoof', 'slateRoof', [['#5a6270', '#b2aea4'], ['#3e444c', '#8a867e']]);
  re('cutStoneWall', 'stoneWall', [['#8a8780', '#b2aea4'], ['#5a5852', '#8a867e'], ['#5c7a3a', '#b2aea4']]);
  re('cutStoneFloor', 'woodFloor', [['#a47e50', '#b2aea4'], ['#7a5a36', '#8a867e'], ['#5e4630', '#9a968c']]);
  re('logFloor', 'woodFloor', [['#a47e50', '#8a6a44'], ['#7a5a36', '#5a3c24']]);
  ICONS.logWall = `<path d="M3 8h26v4H3zM3 13h26v4H3zM3 18h26v4H3zM3 23h26v4H3z" fill="#7a5a3a"/><path d="M3 12h26M3 17h26M3 22h26" stroke="#6a6448" stroke-width="1.2"/><circle cx="4" cy="10" r="2" fill="#c8a070"/><circle cx="28" cy="15" r="2" fill="#c8a070"/><circle cx="4" cy="20" r="2" fill="#c8a070"/><circle cx="28" cy="25" r="2" fill="#c8a070"/>`;
  ICONS.plankWall = `<path d="M4 7h24v21H4z" fill="#9a7448"/><path d="M4 11h24M4 15h24M4 19h24M4 23h24" stroke="#7a5a36" stroke-width="1"/><path d="M4 7h3v21H4zM25 7h3v21h-3zM14.5 7h3v21h-3z" fill="#6a4c30"/>`;
  const STAIRS = (a, b) => `<path d="M4 28h24V6h-5v5h-5v6h-5v5H8v6z" fill="${a}"/><path d="M8 22h5v1H8zM13 17h5v1h-5zM18 11h5v1h-5zM23 6h5v1h-5z" fill="${b}"/>`;
  ICONS.logStairs = STAIRS('#7a5a3a', '#c8a070');
  ICONS.plankStairs = STAIRS('#a47e50', '#6a4c30');
  ICONS.stoneStairs = STAIRS('#8a8780', '#5a5852');
  ICONS.cutStairs = STAIRS('#b2aea4', '#8a867e');
  const DOOR = (wall, door, line) => `<path d="M3 6h26v22H3z" fill="${wall}"/><path d="M3 11h26M3 16h26M3 21h26" stroke="${line}" stroke-width="1"/><path d="M11 12h10v16H11z" fill="${door}"/><path d="M11 12h10" stroke="${line}" stroke-width="2"/><circle cx="19" cy="20.5" r="1" fill="#2e2e32"/>`;
  const WIN = (wall, line) => `<path d="M3 6h26v22H3z" fill="${wall}"/><path d="M3 11h26M3 16h26M3 21h26" stroke="${line}" stroke-width="1"/><path d="M10 11h12v9H10z" fill="#9ec4dc"/><path d="M10 11h12v9H10zM16 11v9M10 15.5h12" fill="none" stroke="#5e4630" stroke-width="1.4"/>`;
  ICONS.logWindow = WIN('#7a5a3a', '#6a6448');
  ICONS.logDoor = DOOR('#7a5a3a', '#8a6a44', '#5a3c24');
  ICONS.plankWindow = WIN('#9a7448', '#7a5a36');
  ICONS.plankDoor = DOOR('#9a7448', '#b08a58', '#6a4c30');
  ICONS.stoneDoor = DOOR('#8a8780', '#5e4228', '#5a5852');
  ICONS.cutWindow = WIN('#b2aea4', '#8a867e');
  ICONS.cutDoor = DOOR('#b2aea4', '#4a3220', '#8a867e');
  ICONS.bedroll = `<path d="M3 20h26v5H3z" fill="#8a5a3a"/><path d="M8 17h20v4H8z" fill="#9a7a58"/><ellipse cx="6" cy="18.5" rx="3" ry="2.2" fill="#ece6d8"/>`;
  ICONS.fancyBed = `<path d="M4 6h24v2H4z" fill="#e8eef2"/><path d="M5 6v22M27 6v22" stroke="#6a3e26" stroke-width="2"/><path d="M6 8h3v12H6zM23 8h3v12h-3z" fill="#dfe8ee"/><path d="M5 20h22v5H5z" fill="#6a3e26"/><path d="M6 17h20v4H6z" fill="#f4f0ea"/><path d="M14 17h12v4H14z" fill="#8a2a2e"/>`;
  re('paleCloak', 'furCloak', [['#8a7458', '#e8e4dc'], ['#c8b89a', '#ffffff']]);
  re('caveCloak', 'furCloak', [['#8a7458', '#3a3230']]);
}
