/**
 * Your character's look (see the Character page of the menu): remembered in
 * this browser, worn by your figure (third person, and the arms you see in
 * first person). A hard country's people: weathered, plainly dressed in
 * undyed or earth-dyed cloth, some of them marked by it.
 *
 * Colours (`kind: 'colour'`) take any colour as well as the listed ones (the
 * page has a picker); the rest are one of their list.
 */
const KEY = 'facet-lands:look';
export const LOOK_CHOICES = {
  skin: [['Pale', 0xf0d2bc], ['Light', 0xe8c4a8], ['Fair', 0xd8a47a], ['Olive', 0xc08a5e], ['Tan', 0xa8744a], ['Bronze', 0x8e5e3a], ['Brown', 0x7e5232], ['Deep brown', 0x5e3a22], ['Dark', 0x45291a]],
  eyes: [['Dark brown', 0x2a1a10], ['Brown', 0x5a3a1e], ['Hazel', 0x7a6a34], ['Green', 0x4a6e3a], ['Blue', 0x3a5e8a], ['Grey', 0x7a8288], ['Amber', 0x9a6a1e]],
  hair: [['Black', 0x161412], ['Dark brown', 0x2e2018], ['Brown', 0x5a3c24], ['Chestnut', 0x7a4a26], ['Auburn', 0x6e3018], ['Copper', 0xa0502a], ['Ash blond', 0x9a8a68], ['Straw', 0xc0a46a], ['Grey', 0x8a8884], ['White', 0xd8d4cc]],
  hairStyle: [['Cropped', 'cropped'], ['Long', 'long'], ['Tied back', 'tied'], ['Braid', 'braid'], ['Curly', 'curly'], ['Ridge', 'mohawk'], ['Thinning', 'balding'], ['Shaved', 'shaved'], ['Hooded', 'hood']],
  beard: [['None', 'none'], ['Stubble', 'stubble'], ['Moustache', 'moustache'], ['Goatee', 'goatee'], ['Full', 'full'], ['Long', 'long']],
  marks: [['None', 'none'], ['Scar on the cheek', 'cheek'], ['Scar over the eye', 'eye'], ['Freckles', 'freckles'], ['Ochre paint', 'paint'], ['Grime', 'grime']],
  build: [['Slight', 'slim'], ['Average', 'average'], ['Broad', 'broad']],
  height: [['Short', 'short'], ['Average', 'average'], ['Tall', 'tall']],
  top: [['Tunic', 'tunic'], ['Long coat', 'coat'], ['Jerkin', 'vest'], ['Tunic and cloak', 'cloak']],
  shirt: [['Undyed wool', 0x9a8c74], ['Linen', 0xb8ac90], ['Faded green', 0x4a5a3a], ['Moss', 0x5a6a3a], ['Bark brown', 0x5a4030], ['Rust', 0x8a4a2a], ['Ash grey', 0x5e5e5a], ['Dried-blood red', 0x5a2420], ['Deep blue', 0x2a3448], ['Woad', 0x3a5a7a]],
  trousers: [['Dark brown', 0x3a2c22], ['Charcoal', 0x2e2e30], ['Leather', 0x5a4028], ['Moss', 0x3a4232], ['Sand', 0x8a7a5a], ['Indigo', 0x2a2e44]],
  boots: [['Dark leather', 0x2a2018], ['Tan leather', 0x5a4028], ['Black', 0x18181a], ['Cloth wraps', 0x8a7a60]],
  extra: [['None', 'none'], ['Scarf', 'scarf'], ['Headband', 'headband'], ['Bone necklace', 'necklace'], ['Earring', 'earring'], ['Fur mantle', 'mantle']],
  accent: [['Madder red', 0x8a2a20], ['Saffron', 0xc8902a], ['Woad blue', 0x2a4a7a], ['Forest', 0x2e4a2a], ['Undyed', 0xb8ac90], ['Black', 0x1e1c1a], ['Heather', 0x6a4a6a]],
};
/** What's chosen by colour (any colour) rather than from a list. */
export const LOOK_COLOURS = new Set(['skin', 'eyes', 'hair', 'shirt', 'trousers', 'boots', 'accent']);
export const LOOK_DEFAULT = {
  skin: 0xd8a47a, eyes: 0x5a3a1e, hair: 0x2e2018, hairStyle: 'cropped', beard: 'stubble', marks: 'none',
  build: 'average', height: 'average', top: 'tunic', shirt: 0x9a8c74, trousers: 0x3a2c22, boots: 0x2a2018, extra: 'none', accent: 0x8a2a20,
};

/** A look picked at random (from the lists), for the Character page's dice. */
export function randomLook() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)][1];
  const out = {};
  for (const [k, opts] of Object.entries(LOOK_CHOICES)) out[k] = pick(opts);
  // (Mostly plainer than pure chance gives: hoods and paint are the odd one, not one in four.)
  if (Math.random() < 0.5) out.extra = 'none';
  if (Math.random() < 0.5) out.marks = 'none';
  return out;
}

export function loadLook() {
  try {
    return { ...LOOK_DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...LOOK_DEFAULT };
  }
}
export function saveLook(look) {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // (For this visit only.)
  }
  for (const fn of listeners) fn(look);
}
const listeners = new Set();
/** Told when the look changes. */
export const onLook = (fn) => listeners.add(fn);
