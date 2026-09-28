// Everything you can carry: what it's called, how many go in a slot (ten,
// but a tool is one to a slot), how long a tool lasts (`durability`: uses,
// or for a coat, seconds of cold kept out), what eating it does, and what it
// becomes when you set it down (`place`). And the recipes to make things.

export const STACK = 10;

export const ITEMS = {
  stick: { name: 'Stick' },
  rock: { name: 'Small rock' },
  flint: { name: 'Flint' },
  log: { name: 'Log' },
  vine: { name: 'Plant vine' },
  iron: { name: 'Iron ore' },
  berries: { name: 'Berries', food: { hunger: 8, thirst: 3 }, spoils: 1500 },
  apple: { name: 'Apple', food: { hunger: 12, thirst: 5 }, spoils: 2400 },
  mushroom: { name: 'Mushroom', food: { hunger: 6 }, spoils: 1500 },
  rawMeat: { name: 'Raw meat', food: { hunger: 10, health: -6 }, spoils: 900, cooks: 'cookedMeat' },
  cookedMeat: { name: 'Cooked meat', food: { hunger: 35, health: 4 }, spoils: 2400 },
  deerSkin: { name: 'Deer skin' },
  axe: { name: 'Stone axe', tool: true, durability: 90 },
  spear: { name: 'Spear', tool: true, durability: 40 },
  flintSteel: { name: 'Flint and steel', tool: true, durability: 25 },
  coat: { name: 'Deerskin coat', tool: true, durability: 900, wear: true },
  torch: { name: 'Torch', place: 'torch' },
  campfire: { name: 'Campfire', place: 'campfire' },
  wall: { name: 'Palisade wall', place: 'wall' },
  stake: { name: 'Sharpened log', place: 'stake' },
  chest: { name: 'Chest', place: 'chest' },
};

/** How many of `id` fit in one slot. */
export const stackOf = (id) => (ITEMS[id]?.tool ? 1 : STACK);

export const RECIPES = [
  { id: 'axe', needs: { stick: 2, rock: 2 }, note: 'Chops trees; a weapon at a pinch' },
  { id: 'spear', needs: { log: 1, rock: 1, vine: 1 }, note: 'Click to stab, right-click to throw' },
  { id: 'flintSteel', needs: { flint: 1, iron: 1 }, note: 'Lights campfires' },
  { id: 'torch', needs: { stick: 1, vine: 1 }, note: 'Light to carry or set down' },
  { id: 'campfire', needs: { log: 3 }, note: 'Set it down, then light it with flint and steel' },
  { id: 'stake', needs: { log: 1 }, note: 'One sharpened log, stood upright' },
  { id: 'wall', needs: { log: 5, vine: 1 }, note: 'A section of palisade: walls join end to end' },
  { id: 'chest', needs: { log: 5 }, note: 'Holds ten stacks' },
  { id: 'coat', needs: { deerSkin: 2, vine: 1 }, note: 'Wear it to keep the cold out far longer' },
];

// Faceted little icons, in the game's style.
export const ICONS = {
  stick: `<path d="M6 25L24 7l2 2L8 27z" fill="#8a5d38"/><path d="M24 7l2 2-3 1z" fill="#6b4a2f"/><path d="M13 18l-4-1 1 2z" fill="#6b4a2f"/>`,
  rock: `<path d="M7 21l4-8 9-2 6 7-3 7H10z" fill="#9a968e"/><path d="M11 13l9-2 6 7-9 1z" fill="#b8b4ac"/><path d="M10 25h13l-6-6z" fill="#7a766e"/>`,
  flint: `<path d="M8 20l5-11 9 1 3 9-8 6z" fill="#3e4250"/><path d="M13 9l9 1-4 7z" fill="#5a6070"/><path d="M8 20l9-3 0 8z" fill="#2c2f3a"/><path d="M22 10l3 9-7-2z" fill="#e8e2d4"/>`,
  log: `<path d="M5 13l18-6 4 10-18 6z" fill="#7a5232"/><path d="M5 13l4 10-2 1-4-9z" fill="#5a3c24"/><ellipse cx="25" cy="12" rx="3" ry="5.2" transform="rotate(-20 25 12)" fill="#d9b27a"/><ellipse cx="25" cy="12" rx="1.3" ry="2.4" transform="rotate(-20 25 12)" fill="#b88a50"/>`,
  vine: `<path d="M16 4c-6 5 6 9 0 14s6 9 0 11" fill="none" stroke="#4f8a34" stroke-width="2.4" stroke-linecap="round"/><path d="M16 9l-6-2 2 5zM17 17l6-1-3 5zM15 23l-6 0 3 4z" fill="#6fae4c"/>`,
  iron: `<path d="M7 21l3-9 8-4 7 6-1 9-10 3z" fill="#6a5048"/><path d="M10 12l8-4 7 6-8 2z" fill="#8a6a5a"/><path d="M12 16l3-1 1 3-3 1zM19 19l3-1v3l-2 1z" fill="#c8c0b8"/><path d="M14 22l3 0-1 2z" fill="#b87048"/>`,
  berries: `<circle cx="11" cy="18" r="4.2" fill="#b01830"/><circle cx="19" cy="16" r="4.2" fill="#c82038"/><circle cx="15" cy="23" r="4.2" fill="#a0142a"/><circle cx="10" cy="17" r="1.2" fill="#f0a0b0"/><path d="M15 6l2 7-4-1zM17 8l6-2-3 5z" fill="#4f8a34"/>`,
  apple: `<path d="M16 10c-6-3-11 2-10 8s6 10 10 8c4 2 9-2 10-8s-4-11-10-8z" fill="#c8261c"/><path d="M16 10c3-1 7 0 8 4l-6-1z" fill="#e05040"/><path d="M16 10l1-5" stroke="#5a3c24" stroke-width="1.6"/><path d="M17 6l6-2-3 4z" fill="#4f8a34"/>`,
  mushroom: `<path d="M5 16c1-7 21-7 22 0z" fill="#c49a60"/><path d="M13 16h6l1 11h-8z" fill="#ece0c4"/><path d="M8 13l4-4 4 1z" fill="#d8b478"/>`,
  rawMeat: `<path d="M6 15c1-6 12-9 18-5s3 12-3 14-15 0-15-9z" fill="#c84848"/><path d="M10 14c3-3 9-4 12-1l-3 6z" fill="#e87070"/><path d="M8 20l-4 4 3 2 3-4z" fill="#f0e6d6"/>`,
  cookedMeat: `<path d="M6 15c1-6 12-9 18-5s3 12-3 14-15 0-15-9z" fill="#7a3e1e"/><path d="M10 14c3-3 9-4 12-1l-3 6z" fill="#a85a2a"/><path d="M8 20l-4 4 3 2 3-4z" fill="#f0e6d6"/>`,
  deerSkin: `<path d="M8 6l16 0 2 6-3 3 3 8-5 3H11l-5-3 3-8-3-3z" fill="#a8743e"/><path d="M11 9h10l-1 14h-8z" fill="#c4945a"/><path d="M12 12l2 1-1 2zM18 16l2 1-1 2z" fill="#f0e0c0"/>`,
  axe: `<path d="M9 28L22 6l2.4 1.4L11.4 29.4z" fill="#8a5d38"/><path d="M17 8l8-4 3 7-8 4z" fill="#8e8a84"/><path d="M25 4l3 7 1-5z" fill="#c8c4bc"/><path d="M17 10l4 2 1-2-3-3z" fill="#4f6a34"/>`,
  spear: `<path d="M5 29L24 10l1.6 1.6L6.6 30.6z" fill="#8a5d38"/><path d="M22 8l7-6-4 9z" fill="#5a5e68"/><path d="M29 2l-4 9 2-2z" fill="#a8acb4"/><path d="M21 11l3 1 1-2-2-2z" fill="#4f6a34"/>`,
  flintSteel: `<path d="M5 18l6-8 8 1 1 8-7 5z" fill="#3e4250"/><path d="M11 10l8 1-4 6z" fill="#5a6070"/><path d="M16 22c2-6 8-8 12-6l-2 3c-3-1-6 1-7 5z" fill="#9aa0a8"/><path d="M22 8l2-4 1 4 3-2-2 4z" fill="#ffb040"/>`,
  coat: `<path d="M11 5h10l6 5-2 17H7L5 10z" fill="#a8743e"/><path d="M16 7v20" stroke="#6a4424" stroke-width="1.4"/><path d="M11 5l5 5 5-5" fill="none" stroke="#f0e0c0" stroke-width="2.4"/><path d="M5 10l-2 12 4 1 1-9z" fill="#8a5c2e"/><path d="M27 10l2 12-4 1-1-9z" fill="#8a5c2e"/>`,
  torch: `<path d="M14.5 13h3l-.6 16h-1.8z" fill="#8a5d38"/><path d="M13 10.5h6l-.8 3h-4.4z" fill="#3a2f27"/><path d="M16 1.5l4 6.5-4 3.5-4-3.5z" fill="#ff8a2a"/><path d="M16 5l2 3.3-2 1.8-2-1.8z" fill="#fff0a0"/>`,
  campfire: `<path d="M4 26l24-6M4 20l24 6M16 17v12" stroke="#7a5232" stroke-width="3" stroke-linecap="round"/><path d="M5 28a11 3 0 0 0 22 0" fill="none" stroke="#8e8a84" stroke-width="2.4"/><path d="M16 5l5 9-5 5-5-5z" fill="#ff8a2a" opacity=".9"/>`,
  wall: `<path d="M4 29V9l2-4 2 4v20M10 29V8l2-4 2 4v21M16 29V9l2-4 2 4v20M22 29V8l2-4 2 4v21" fill="#8a6a44" stroke="#5a3c24" stroke-width="1"/><path d="M3 14h26M3 23h26" stroke="#5a3c24" stroke-width="2.4"/>`,
  stake: `<path d="M13 30V9l3-7 3 7v21z" fill="#8a6a44"/><path d="M16 2l3 7v21h-3z" fill="#6e5234"/><path d="M13 14h6M13 22h6" stroke="#4a3220" stroke-width="1.4"/>`,
  chest: `<path d="M4 14h24v14H4z" fill="#8a6038"/><path d="M4 14l2-7h20l2 7z" fill="#a8744a"/><path d="M4 18h24M16 14v14" stroke="#5a3c24" stroke-width="1.6"/><path d="M14 16h4v4h-4z" fill="#3a2a1a"/>`,
};
