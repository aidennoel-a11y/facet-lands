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
  deerSkin: { name: 'Deer skin', weight: 2, group: 'Materials' },
  wool: { name: 'Wool', weight: 0.5, group: 'Materials' },
  // Food.
  berries: { name: 'Berries', food: { hunger: 8, thirst: 3 }, spoils: 1500, weight: 0.1, group: 'Food' },
  apple: { name: 'Apple', food: { hunger: 12, thirst: 5 }, spoils: 2400, weight: 0.2, group: 'Food' },
  mushroom: { name: 'Mushroom', food: { hunger: 6 }, spoils: 1500, weight: 0.1, group: 'Food' },
  rawMeat: { name: 'Raw meat', food: { hunger: 10, health: -4, sick: 0.5 }, spoils: 900, cooks: 'cookedMeat', dries: 'jerky', weight: 1, group: 'Food' },
  cookedMeat: { name: 'Cooked meat', food: { hunger: 35, health: 4 }, spoils: 2400, weight: 0.8, group: 'Food' },
  rawFish: { name: 'Raw fish', food: { hunger: 8, health: -3, sick: 0.5 }, spoils: 700, cooks: 'cookedFish', dries: 'jerky', weight: 0.8, group: 'Food' },
  cookedFish: { name: 'Cooked fish', food: { hunger: 25, health: 3 }, spoils: 1800, weight: 0.6, group: 'Food' },
  jerky: { name: 'Jerky', food: { hunger: 22 }, weight: 0.3, group: 'Food' }, // (dried: it keeps)
  stew: { name: 'Stew', food: { hunger: 50, thirst: 25, health: 12, cure: true }, spoils: 1800, weight: 1, group: 'Food' },
  // Tools and weapons.
  axe: { name: 'Stone axe', tool: true, durability: 90, weight: 1.5, group: 'Tools' },
  pickaxe: { name: 'Stone pickaxe', tool: true, durability: 90, weight: 1.8, group: 'Tools' },
  spear: { name: 'Spear', tool: true, durability: 40, weight: 1.5, group: 'Tools' },
  flintSteel: { name: 'Flint and steel', tool: true, durability: 25, weight: 0.3, group: 'Tools' },
  steelAxe: { name: 'Iron axe', tool: true, durability: 180, weight: 2, chop: 2, group: 'Tools' },
  steelPickaxe: { name: 'Iron pickaxe', tool: true, durability: 180, weight: 2.2, group: 'Tools' },
  steelSpear: { name: 'Iron spear', tool: true, durability: 80, weight: 1.8, group: 'Tools' },
  fineFlintSteel: { name: 'Flint and forged steel', tool: true, durability: 50, weight: 0.3, group: 'Tools' },
  bow: { name: 'Bow', tool: true, durability: 120, weight: 1, group: 'Tools' },
  arrow: { name: 'Arrow', weight: 0.05, group: 'Tools' },
  fishingRod: { name: 'Fishing rod', tool: true, durability: 60, weight: 0.8, group: 'Tools' },
  waterskin: { name: 'Waterskin', tool: true, weight: 0.4, holds: 5, group: 'Tools' }, // (water: 0..5 drinks; clean or not)
  pot: { name: 'Iron pot', tool: true, durability: 60, weight: 2, group: 'Tools' },
  bandage: { name: 'Bandage', weight: 0.05, group: 'Tools' },
  torch: { name: 'Torch', place: 'torch', weight: 0.4, group: 'Tools' },
  // Worn.
  coat: { name: 'Deerskin coat', tool: true, wear: 'coat', weight: 2, group: 'Worn' },
  armour: { name: 'Leather armour', tool: true, wear: 'armour', durability: 40, weight: 4, group: 'Worn' },
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
};

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
  { id: 'arrow', needs: { stick: 1, flint: 1 }, makes: 4, note: 'Four arrows' },
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
  { id: 'coat', needs: { deerSkin: 2, vine: 1 }, note: 'Wear it to keep the cold out far longer' },
  { id: 'armour', needs: { deerSkin: 3, vine: 2 }, note: 'Wear it: bites and blows hurt less' },
  { id: 'steelAxe', needs: { ironBar: 2, stick: 1, vine: 1 }, note: 'Twice the life, fells trees twice as fast' },
  { id: 'steelPickaxe', needs: { ironBar: 2, stick: 2 }, note: 'Twice the life of a stone one' },
  { id: 'steelSpear', needs: { ironBar: 1, log: 1, vine: 1 }, note: 'Twice the life of a stone spear' },
  { id: 'fineFlintSteel', needs: { flint: 1, ironBar: 1 }, note: 'Forged steel: twice the life' },
  { id: 'pot', needs: { ironBar: 1 }, note: 'On a burning fire with meat and berries or mushrooms: stew' },
];

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
};
