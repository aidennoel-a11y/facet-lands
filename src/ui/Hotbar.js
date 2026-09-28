import { ICONS, ITEMS } from '../survival/items.js';

/** An item's icon, as inline SVG. */
export function iconSvg(id) {
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[id] ?? ''}</svg>`;
}

/** How worn (tools) or how fresh (food) a stack is, 0..1, or null. */
export function wearOf(stack) {
  const item = stack && ITEMS[stack.id];
  if (!item) return null;
  if (stack.dur !== undefined && item.durability) return stack.dur / item.durability;
  if (stack.fresh !== undefined && item.spoils) return stack.fresh / item.spoils;
  return null;
}

/** The contents of a slot button: its icon, how many, and a bar for wear or freshness. */
export function slotHtml(stack, key = '') {
  if (!stack) return key ? `<span class="slot-key">${key}</span>` : '';
  const wear = wearOf(stack);
  const bar = wear === null ? '' : `<span class="slot-bar${ITEMS[stack.id].spoils ? ' fresh' : ''}"><i style="width:${Math.max(4, Math.round(wear * 100))}%;background:hsl(${Math.round(wear * 110)} 70% 48%)"></i></span>`;
  return `${key ? `<span class="slot-key">${key}</span>` : ''}${iconSvg(stack.id)}${stack.count > 1 ? `<span class="slot-count">${stack.count}</span>` : ''}${bar}`;
}

/**
 * The hotbar along the bottom of the screen: your whole inventory, nine
 * slots. Select with 1-9, the mouse wheel (while walking) or by tapping a
 * slot. Each slot shows its item, how many, and how worn it is (tools) or
 * how fresh (food).
 */
export class Hotbar {
  constructor(root, inventory, { onSelect } = {}) {
    this.root = root;
    this.inventory = inventory;
    this.onSelect = onSelect;
    this.index = 0;

    this.slots = [];
    const list = document.createElement('ol');
    list.className = 'hotbar-slots';
    for (let i = 0; i < inventory.slots.length; i++) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.id = `slot-${i + 1}`;
      button.addEventListener('click', () => this.select(i));
      li.append(button);
      list.append(li);
      this.slots.push(button);
    }
    this.label = document.createElement('p');
    this.label.className = 'hotbar-label';
    this.label.setAttribute('aria-live', 'polite');
    root.append(this.label, list);
    inventory.onChange(() => this.render());
    this.render();
    this.select(0, true);

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.slots.length) this.select(n - 1);
    });
  }

  render() {
    this.inventory.slots.forEach((s, i) => {
      const html = slotHtml(s, String(i + 1));
      const button = this.slots[i];
      if (button.dataset.html !== html) {
        button.innerHTML = html;
        button.dataset.html = html;
      }
      button.setAttribute('aria-label', s ? `${i + 1}: ${ITEMS[s.id].name}${s.count > 1 ? ` (${s.count})` : ''}` : `${i + 1}: empty`);
    });
  }

  get selected() {
    return this.inventory.slots[this.index] ?? null;
  }

  /** Briefly shows a message above the hotbar. */
  flash(text) {
    this.label.textContent = text;
    this.label.classList.remove('show');
    void this.label.offsetWidth;
    this.label.classList.add('show');
  }

  /** Moves the selection by one slot (wraps around). */
  step(direction) {
    const n = this.slots.length;
    this.select((this.index + direction + n) % n);
  }

  select(i, quiet = false) {
    this.index = i;
    this.slots.forEach((s, k) => s.setAttribute('aria-pressed', String(k === i)));
    const item = this.selected;
    if (!quiet) this.flash(item ? ITEMS[item.id].name : 'Empty hand');
    this.onSelect?.(item);
  }
}
