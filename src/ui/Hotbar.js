// Inline icons for hotbar items, drawn in the game's faceted style.
const ICONS = {
  torch: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M14.5 13h3l-.6 16h-1.8z" fill="#8a5d38"/>
    <path d="M16 13h1.5l-.6 16H16z" fill="#6b4a2f"/>
    <path d="M13 10.5h6l-.8 3h-4.4z" fill="#3a2f27"/>
    <path d="M16 1.5l4 6.5-4 3.5-4-3.5z" fill="#ff8a2a"/>
    <path d="M16 1.5l4 6.5-4 3.5z" fill="#f26b1d"/>
    <path d="M16 5l2 3.3-2 1.8-2-1.8z" fill="#fff0a0"/>
  </svg>`,
  pickup: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M9 17V9.5a1.8 1.8 0 0 1 3.6 0V15V6.5a1.8 1.8 0 0 1 3.6 0V15V7.5a1.8 1.8 0 0 1 3.6 0V15v-5a1.8 1.8 0 0 1 3.6 0v9.5c0 5-3.2 8.5-8 8.5-3.4 0-5.3-1.6-7-4.2l-3.3-5a1.9 1.9 0 0 1 3-2.2z" fill="#f2d2b0" stroke="#5a4636" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`,
};

/**
 * A 9-slot hotbar along the bottom of the screen. Select with 1-9, the
 * mouse wheel (while walking) or by tapping a slot. Empty slots are ready
 * for future items: add an entry to `items` with an id and an icon.
 */
export class Hotbar {
  constructor(root, items, { onSelect } = {}) {
    this.root = root;
    this.items = items;
    this.onSelect = onSelect;
    this.index = 0;

    this.slots = [];
    const list = document.createElement('ol');
    list.className = 'hotbar-slots';
    for (let i = 0; i < 9; i++) {
      const item = items[i] ?? null;
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.id = `slot-${i + 1}`;
      button.setAttribute('aria-label', item ? `${i + 1}: ${item.name}` : `${i + 1}: empty`);
      button.innerHTML = `<span class="slot-key">${i + 1}</span>${item ? ICONS[item.icon] ?? '' : ''}`;
      button.addEventListener('click', () => this.select(i));
      li.append(button);
      list.append(li);
      this.slots.push(button);
    }
    this.label = document.createElement('p');
    this.label.className = 'hotbar-label';
    this.label.setAttribute('aria-live', 'polite');
    root.append(this.label, list);
    this.select(0, true);

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) this.select(n - 1);
    });
  }

  get selected() {
    return this.items[this.index] ?? null;
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
    this.select((this.index + direction + 9) % 9);
  }

  select(i, quiet = false) {
    this.index = i;
    this.slots.forEach((s, k) => s.setAttribute('aria-pressed', String(k === i)));
    const item = this.selected;
    this.label.textContent = item ? item.name : 'Empty';
    if (!quiet) {
      this.label.classList.remove('show');
      void this.label.offsetWidth; // restart the fade
      this.label.classList.add('show');
    }
    this.onSelect?.(item);
  }
}
