/**
 * Your character's look (see the Character page of the menu): remembered in
 * this browser, worn by your figure (third person, and the arms you see in
 * first person). A hard country's people: weathered, plainly dressed in
 * undyed or earth-dyed cloth, some of them marked by it.
 */
const KEY = 'facet-lands:look';
export const LOOK_CHOICES = {
  skin: [['Pale', 0xe8c4a8], ['Fair', 0xd8a47a], ['Olive', 0xc08a5e], ['Tan', 0xa8744a], ['Brown', 0x7e5232], ['Dark', 0x553522]],
  hair: [['Black', 0x161412], ['Dark brown', 0x2e2018], ['Brown', 0x5a3c24], ['Auburn', 0x6e3018], ['Ash blond', 0x9a8a68], ['Grey', 0x8a8884]],
  hairStyle: [['Cropped', 'cropped'], ['Long', 'long'], ['Tied back', 'tied'], ['Shaved', 'shaved'], ['Hooded', 'hood']],
  beard: [['None', 'none'], ['Stubble', 'stubble'], ['Full', 'full']],
  shirt: [['Undyed wool', 0x9a8c74], ['Faded green', 0x4a5a3a], ['Bark brown', 0x5a4030], ['Ash grey', 0x5e5e5a], ['Dried-blood red', 0x5a2420], ['Deep blue', 0x2a3448]],
  trousers: [['Dark brown', 0x3a2c22], ['Charcoal', 0x2e2e30], ['Leather', 0x5a4028], ['Moss', 0x3a4232]],
  marks: [['None', 'none'], ['Scar on the cheek', 'cheek'], ['Scar over the eye', 'eye'], ['Grime', 'grime']],
};
export const LOOK_DEFAULT = { skin: 0xd8a47a, hair: 0x2e2018, hairStyle: 'cropped', beard: 'stubble', shirt: 0x9a8c74, trousers: 0x3a2c22, marks: 'none' };

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
