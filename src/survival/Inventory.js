import { ITEMS, stackOf } from './items.js';

/**
 * What you carry: nine slots, the hotbar and nothing more. Each slot holds
 * a stack { id, count } of up to ten of one thing (a tool on its own, with
 * `dur`: the uses left), and food keeps `fresh` (seconds before it spoils).
 * Plus the coat on your back, if any (`worn`). A chest is an Inventory too,
 * with ten slots.
 */
export class Inventory {
  constructor(size = 9) {
    this.slots = new Array(size).fill(null);
    this.worn = null;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this);
  }

  /** A new stack of `count` of `id` (a tool fresh from the making, food fresh from the picking). */
  static stack(id, count = 1) {
    const item = ITEMS[id];
    const s = { id, count };
    if (item?.durability) s.dur = item.durability;
    if (item?.spoils) s.fresh = item.spoils;
    return s;
  }

  count(id) {
    return this.slots.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
  }

  /** How many of `id` there's room for. */
  room(id) {
    const max = stackOf(id);
    return this.slots.reduce((n, s) => n + (!s ? max : s.id === id ? max - s.count : 0), 0);
  }

  /**
   * Puts a stack in: onto stacks of the same thing first, then into empty
   * slots (the selected one first, if given). Returns how many didn't fit.
   */
  add(stack, prefer = -1) {
    let left = stack.count;
    const max = stackOf(stack.id);
    if (max > 1) {
      for (const s of this.slots) {
        if (!left) break;
        if (s?.id !== stack.id || s.count >= max) continue;
        const n = Math.min(left, max - s.count);
        s.count += n;
        left -= n;
        if (stack.fresh !== undefined) s.fresh = Math.min(s.fresh ?? Infinity, stack.fresh);
      }
    }
    const order = [...this.slots.keys()];
    if (prefer >= 0) order.sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : a - b));
    for (const i of order) {
      if (!left) break;
      if (this.slots[i]) continue;
      const n = Math.min(left, max);
      this.slots[i] = { ...stack, count: n };
      left -= n;
    }
    if (left !== stack.count) this.changed();
    return left;
  }

  /** Takes `count` of `id` out (from wherever they are). Returns whether there were enough. */
  remove(id, count = 1) {
    if (this.count(id) < count) return false;
    for (let i = this.slots.length - 1; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      const n = Math.min(count, s.count);
      s.count -= n;
      count -= n;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.changed();
    return true;
  }

  /** Takes one from slot `i` (the whole stack if `all`). Returns what was taken, or null. */
  take(i, all = false) {
    const s = this.slots[i];
    if (!s) return null;
    const n = all ? s.count : 1;
    s.count -= n;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
    return { ...s, count: n };
  }

  /**
   * Wears down the tool in slot `i` by `amount`. Returns true if it broke
   * (and is gone).
   */
  wear(i, amount = 1) {
    const s = this.slots[i];
    if (!s || s.dur === undefined) return false;
    s.dur -= amount;
    if (s.dur <= 0) {
      this.slots[i] = null;
      this.changed();
      return true;
    }
    this.changed();
    return false;
  }

  /** Food slowly spoils (every `dt` seconds): returns the names of any that rotted away. */
  spoil(dt) {
    const rotted = [];
    this.slots.forEach((s, i) => {
      if (s?.fresh === undefined) return;
      s.fresh -= dt;
      if (s.fresh <= 0) {
        rotted.push(ITEMS[s.id].name);
        this.slots[i] = null;
      }
    });
    if (rotted.length) this.changed();
    return rotted;
  }

  clear() {
    this.slots.fill(null);
    this.worn = null;
    this.changed();
  }

  toJSON() {
    return { slots: this.slots, worn: this.worn };
  }
}
