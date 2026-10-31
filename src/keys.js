/**
 * Your own keys: any of the game's controls moved to another key (see the
 * Controls part of the settings). Done once, here, at the door: a key you
 * press is passed on to the game as the key it stands in for, so the rest
 * of the game goes on knowing only the usual keys. Remembered in this browser.
 *
 * (First of everything: its listeners must hear each key before any other.)
 */
const KEY = 'facet-lands:keys';
export const ACTIONS = [
  ['forward', 'Move forward', 'KeyW'],
  ['back', 'Move back', 'KeyS'],
  ['left', 'Move left', 'KeyA'],
  ['right', 'Move right', 'KeyD'],
  ['jump', 'Jump · swim up · glide', 'Space'],
  ['sprint', 'Sprint', 'ShiftLeft'],
  ['crouch', 'Crouch · dive', 'KeyC'],
  ['interact', 'Use · pick up', 'KeyQ'],
  ['inventory', 'Inventory', 'KeyE'],
  ['drop', 'Drop', 'KeyR'],
  ['map', 'Map', 'KeyB'],
  ['hide', 'Hide everything (photos)', 'KeyP'],
  ['automove', 'Auto-move', 'KeyF'],
  ['fly', 'Fly (creative)', 'KeyV'],
  ['wave', 'Wave', 'KeyG'],
  ['emotes', 'Emotes', 'KeyT'],
];

let bindings = {};
try {
  bindings = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
} catch {
  bindings = {};
}
let table = new Map();
function rebuild() {
  table = new Map();
  for (const [id, , def] of ACTIONS) {
    const b = bindings[id];
    if (!b || b === def) continue;
    table.set(b, def); // (the new key stands in for the old)
  }
  // (An old key whose control has moved, and that nothing else is on now: it does nothing.)
  for (const [id, , def] of ACTIONS) if (bindings[id] && bindings[id] !== def && !table.has(def)) table.set(def, null);
}
rebuild();

/** The key a control is on now. */
export const keyOf = (id) => bindings[id] ?? ACTIONS.find((a) => a[0] === id)?.[2];
/** A key's name, as shown. */
export const keyName = (code) => (code ?? '').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '↑ ').replace('Left', ' (left)').replace('Right', ' (right)').replace('Space', 'Space') || '—';

/** Puts control `id` on key `code` (a control already on that key swaps to this one's old key). */
export function bind(id, code) {
  const was = keyOf(id);
  for (const [other] of ACTIONS) if (other !== id && keyOf(other) === code) bindings[other] = was;
  bindings[id] = code;
  save();
}
export function resetKeys() {
  bindings = {};
  save();
}
function save() {
  rebuild();
  try {
    localStorage.setItem(KEY, JSON.stringify(bindings));
  } catch {
    // (For this visit only.)
  }
}

// Waiting for the key to put a control on (see the settings): the next one pressed.
let listening = null;
export function listenForKey(fn) {
  listening = fn;
}

const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
for (const type of ['keydown', 'keyup']) {
  window.addEventListener(type, (e) => {
    if (!e.isTrusted) return; // (one passed on from here)
    if (listening && type === 'keydown') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const fn = listening;
      listening = null;
      fn(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (typing(e.target) || !table.has(e.code)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const to = table.get(e.code);
    if (!to) return;
    e.target.dispatchEvent(new KeyboardEvent(type, { code: to, key: e.key, repeat: e.repeat, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true }));
  }, true);
}
