import { ITEMS, stackOf } from './items.js';

/**
 * What you carry: nine slots, the hotbar and nothing more. Each slot holds
 * a stack { id, count } of up to ten of one thing (a tool on its own, with
 * `dur`: the uses left), and food keeps `fresh` (seconds before it spoils).
 * Plus the coat on your back, if any (`worn`). A chest is an Inventory too,
 * with ten slots.
 */
export class Inventory {
  constructor(size = 9, open = size) {
    this.slots = new Array(size).fill(null);
    this.open = open; // (how many of the slots can be used: a backpack opens the rest)
    this.stackBonus = null; // (id) => how many times a full stack of it a slot holds (a quiver: arrows)
    this.worn = null; // (a coat)
    this.armour = null;
    this.back = null; // (a backpack, on your back: it opens the slots past the ninth)
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
    if (item?.holds) (s.water = 0), (s.clean = true);
    return s;
  }

  count(id) {
    return this.slots.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
  }

  /** How many of `id` go in one slot. */
  max(id) {
    return stackOf(id) * (this.stackBonus?.(id) ?? 1);
  }

  /** How many of `id` there's room for. */
  room(id) {
    const max = this.max(id);
    return this.slots.slice(0, this.open).reduce((n, s) => n + (!s ? max : s.id === id ? Math.max(0, max - s.count) : 0), 0);
  }

  /**
   * Puts a stack in: onto stacks of the same thing first, then into empty
   * slots (the selected one first, if given). Returns how many didn't fit.
   */
  add(stack, prefer = -1) {
    let left = stack.count;
    const max = this.max(stack.id);
    if (max > 1) {
      for (const s of this.slots.slice(0, this.open)) {
        if (!left) break;
        if (s?.id !== stack.id || s.count >= max) continue;
        const n = Math.min(left, max - s.count);
        s.count += n;
        left -= n;
        if (stack.fresh !== undefined) s.fresh = Math.min(s.fresh ?? Infinity, stack.fresh);
      }
    }
    const order = [...this.slots.keys()].filter((i) => i < this.open);
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
    this.armour = null;
    this.back = null;
    this.changed();
  }

  /**
   * Moves the stack in slot `a` to slot `b`: onto it if it's the same thing
   * (as much as fits), else the two change places. Returns whether anything moved.
   */
  move(a, b) {
    if (a === b || a >= this.open || b >= this.open) return false;
    const from = this.slots[a], to = this.slots[b];
    if (!from) return false;
    if (to && to.id === from.id && this.max(from.id) > 1) {
      const n = Math.min(from.count, this.max(from.id) - to.count);
      if (n <= 0) return false;
      to.count += n;
      from.count -= n;
      if (from.fresh !== undefined) to.fresh = Math.min(to.fresh ?? Infinity, from.fresh);
      if (from.count <= 0) this.slots[a] = null;
    } else {
      this.slots[a] = to;
      this.slots[b] = from;
    }
    this.changed();
    return true;
  }

  /**
   * Tidies what you carry: like things stacked together, in order of kind
   * (`groups`: the order of ITEMS' groups) then name; tools and weapons first,
   * into the hotbar.
   */
  sort(groups) {
    const stacks = this.slots.slice(0, this.open).filter(Boolean);
    const merged = [];
    for (const st of stacks) {
      const max = this.max(st.id);
      let left = st.count;
      for (const m of merged) {
        if (!left || m.id !== st.id || max <= 1 || m.count >= max || m.dur !== undefined) continue;
        const n = Math.min(left, max - m.count);
        m.count += n;
        left -= n;
        if (st.fresh !== undefined) m.fresh = Math.min(m.fresh ?? Infinity, st.fresh);
      }
      if (left) merged.push({ ...st, count: left });
    }
    const rank = (st) => {
      const g = groups.indexOf(ITEMS[st.id]?.group);
      return g < 0 ? groups.length : g;
    };
    merged.sort((p, q) => rank(p) - rank(q) || ITEMS[p.id].name.localeCompare(ITEMS[q.id].name) || q.count - p.count);
    for (let i = 0; i < this.open; i++) this.slots[i] = merged[i] ?? null;
    this.changed();
  }

  toJSON() {
    return { slots: this.slots, worn: this.worn, armour: this.armour, back: this.back };
  }

  load(data) {
    this.slots.fill(null);
    (data?.slots ?? []).forEach((s, i) => i < this.slots.length && (this.slots[i] = s));
    this.worn = data?.worn ?? null;
    this.armour = data?.armour ?? null;
    this.back = data?.back ?? null;
    // (From before backpacks were worn: one carried in a slot goes on your back.)
    const k = this.back ? -1 : this.slots.findIndex((st) => st?.id === 'backpack');
    if (k >= 0) (this.back = this.slots[k]), (this.slots[k] = null);
    this.changed();
  }
}
