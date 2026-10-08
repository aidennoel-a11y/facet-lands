import { iconSvg, slotHtml } from '../ui/Hotbar.js';
import { ITEMS, RECIPES, TIERS } from './items.js';

const BARS = [
  ['health', 'Health', '#e0413a', `<path d="M16 28S4 20 4 11a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 9-12 17-12 17z"/>`],
  ['hunger', 'Hunger', '#d8903a', `<path d="M8 6c-3 6 0 10 3 11l-1 11h4l-1-11c3-1 6-5 3-11zM22 4c-2 4-3 10 0 12l-1 12h4V4z"/>`],
  ['thirst', 'Thirst', '#3a9ae0', `<path d="M16 3S7 14 7 20a9 9 0 0 0 18 0c0-6-9-17-9-17z"/>`],
  ['warmth', 'Warmth', '#f06a2a', `<path d="M16 2c1 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-8 1 3 3 4 3 4 0-5-1-8 2-12z"/>`],
  ['energy', 'Energy', '#e8d24a', `<path d="M18 2L6 18h8l-2 12 12-16h-8z"/>`],
];
const GROUPS = ['Tools', 'Materials', 'Food', 'Farming', 'Worn', 'Building'];

/**
 * What's on screen for staying alive: the bars (health, hunger, thirst,
 * warmth, energy) above the hotbar, what's wrong with you (fever,
 * bleeding, worn out, weighed down), which way the wind blows (your scent
 * goes with it), what you're wearing, what you can do with what's in
 * front of you (under the crosshair), the crafting menu (Tab), the
 * creative menu (Z: every item, for testing), a chest's contents, the red
 * of being hurt, the frost of the cold, the dark of sleep, and the end.
 */
export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="vitals" aria-label="Health, hunger, thirst, warmth and energy">
        ${BARS.map(([id, label, colour, icon]) => `<div class="vital" data-vital="${id}" title="${label}"><svg viewBox="0 0 32 32" aria-hidden="true" fill="${colour}">${icon}</svg><span class="vital-bar"><i style="background:${colour}"></i></span></div>`).join('')}
        <div class="worn worn-coat" hidden title="Wearing"></div>
        <div class="worn worn-armour" hidden title="Wearing"></div>
        <div class="wind" title="The wind: your scent goes the way it blows"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3l7 20-7-5-7 5z" fill="#dfe8ee"/></svg></div>
      </div>
      <div class="status"></div>
      <p class="prompt" hidden></p>
      <div class="hitmark"></div>
      <div class="draw" hidden><i></i></div>
      <div class="hurt-vignette"></div>
      <div class="cold-vignette"></div>
      <div class="sleep-fade"></div>
      <section class="craft" hidden aria-label="Crafting">
        <header><h2>Crafting</h2><p>Click to make · Tab or Esc to close · Z for every item</p></header>
        <div class="tree"></div>
        <p class="craft-note">Point at something to see what it's for.</p>
      </section>
      <section class="creative" hidden aria-label="Creative: every item">
        <header><h2>Every item</h2><p>Click for a stack in your hotbar · Z or Esc to close</p></header>
        <div class="creative-groups"></div>
      </section>
      <section class="chest-ui" hidden aria-label="Chest">
        <header><h2>Chest</h2><p>Click to move a stack across · food in here keeps · E or Esc to close</p></header>
        <ol class="chest-slots"></ol>
        <h3>Carrying</h3>
        <ol class="pack-slots"></ol>
      </section>
      <section class="death" hidden>
        <h2>You died</h2>
        <p class="death-cause"></p>
        <button type="button" class="respawn">Try again</button>
      </section>`;
    this.el = (sel) => root.querySelector(sel);
    this.bars = Object.fromEntries(BARS.map(([id]) => [id, root.querySelector(`[data-vital="${id}"]`)]));
    this.onCraft = null;
    this.onTake = null;
    this.onChestMove = null;
    this.onRespawn = null;
    this.el('.respawn').addEventListener('click', () => this.onRespawn?.());
    this.sleepAmount = 0;
  }

  get busy() {
    return ['.craft', '.creative', '.chest-ui', '.death'].some((sel) => !this.el(sel).hidden);
  }

  /**
   * @param info { active (on foot), load (kg), heavy (0..), wind (the
   *               wind's direction relative to your view, radians) }
   */
  update(survival, inventory, info) {
    this.el('.vitals').classList.toggle('paused', !info.active);
    for (const [id, el] of Object.entries(this.bars)) {
      const v = survival[id];
      el.querySelector('i').style.width = `${Math.max(0, v)}%`;
      el.classList.toggle('low', v < 25);
    }
    for (const [sel, stack] of [['.worn-coat', inventory.worn], ['.worn-armour', inventory.armour]]) {
      const el = this.el(sel);
      el.hidden = !stack;
      if (stack) {
        const html = slotHtml(stack);
        if (el.dataset.html !== html) (el.innerHTML = html), (el.dataset.html = html);
      }
    }
    this.el('.wind svg').style.transform = `rotate(${info.wind ?? 0}rad)`;
    // What's wrong with you.
    const chips = [];
    if (survival.sick > 0) chips.push(['sick', 'Fever']);
    if (survival.bleeding > 0) chips.push(['bleed', 'Bleeding']);
    if (survival.venom > 0) chips.push(['bleed', 'Venom']);
    if (info.sheltered) chips.push(['load', 'Sheltered']);
    if (info.heatstroke) chips.push(['bleed', 'Heatstroke']);
    if (info.blizzard) chips.push(['wet', 'Blizzard']);
    if (survival.energy < 20) chips.push(['tired', survival.energy <= 0 ? 'Exhausted' : 'Worn out']);
    if (survival.wet > 0.3) chips.push(['wet', 'Soaked']);
    chips.push([info.heavy > 0 ? 'heavy' : 'load', `${Math.round(info.load)} kg${info.heavy > 0.5 ? ': too heavy to run' : info.heavy > 0 ? ': heavy' : ''}`]);
    const html = chips.map(([k, t]) => `<span class="chip chip-${k}">${t}</span>`).join('');
    const status = this.el('.status');
    if (status.dataset.html !== html) (status.innerHTML = html), (status.dataset.html = html);
    status.classList.toggle('paused', !info.active);
    this.el('.hurt-vignette').style.opacity = Math.min(0.8, survival.hurtFlash + (survival.health < 25 ? 0.25 + 0.1 * Math.sin(performance.now() / 250) : 0) + (survival.bleeding > 0 ? 0.08 : 0)).toFixed(3);
    this.el('.cold-vignette').style.opacity = (info.active ? Math.min(0.85, (1 - survival.warmth / 100) * 0.9 * Math.min(1, survival.cold * 3)) : 0).toFixed(3);
    this.el('.sleep-fade').style.opacity = this.sleepAmount.toFixed(3);
  }

  /** A hit landed (on the head: a bigger mark). */
  hitMark(head) {
    const el = this.el('.hitmark');
    el.classList.remove('show', 'head');
    void el.offsetWidth; // (restart its animation)
    el.classList.add('show');
    if (head) el.classList.add('head');
  }

  /** How far a bow's drawn (0..1), or hidden (null). */
  draw(amount) {
    const el = this.el('.draw');
    el.hidden = amount === null;
    if (amount !== null) el.querySelector('i').style.width = `${Math.round(amount * 100)}%`;
  }

  /** What you can do with what's under the crosshair ("E · Pick up stick"), or nothing. */
  prompt(text) {
    const p = this.el('.prompt');
    if (!text) {
      p.hidden = true;
      return;
    }
    p.hidden = false;
    if (p.dataset.text !== text) {
      p.dataset.text = text;
      p.innerHTML = text;
    }
  }

  // --- Crafting ------------------------------------------------------------------

  toggleCraft(inventory) {
    const panel = this.el('.craft');
    if (!panel.hidden) return this.closeAll();
    this.closeAll();
    panel.hidden = false;
    this.renderCraft(inventory);
    return true;
  }

  /**
   * The crafting tree: the four tiers left to right (see TIERS), each
   * saying what opens it, and in each what it makes, lit up when you've
   * what it needs. Click one to make it.
   */
  renderCraft(inventory) {
    const tree = this.el('.tree');
    const recipe = (id) => RECIPES.find((r) => r.id === id);
    let before = true; // (the tiers before this one all open)
    tree.innerHTML = TIERS.map((tier, k) => {
      const open = this.unlocked ? this.unlocked(tier) : true;
      const next = before && !open; // (the next one to open: what to do next, said plainly)
      before = before && open;
      const cards = tier.ids.map((id) => {
        const r = recipe(id);
        const has = Object.entries(r.needs).every(([n, c]) => inventory.count(n) >= c);
        const station = !r.at || this.stations?.[r.at];
        const can = open && has && station;
        const needs = Object.entries(r.needs)
          .map(([n, c]) => `<span class="need${inventory.count(n) >= c ? '' : ' short'}" title="${ITEMS[n].name}">${iconSvg(n)}${c}</span>`)
          .join('');
        const note = `${r.note}${r.at ? ` (at an ${r.at})` : ''}`;
        return `<button type="button" class="card${can ? ' can' : ''}${open ? '' : ' locked'}" data-craft="${id}" data-note="${ITEMS[id].name}: ${note.replaceAll('"', '&quot;')}" ${can ? '' : 'aria-disabled="true"'}>
          <span class="made">${iconSvg(id)}${r.makes ? `<b>×${r.makes}</b>` : ''}</span>
          <span class="what"><b>${ITEMS[id].name}</b>${r.at ? `<em class="${station ? '' : 'short'}">at an ${r.at}</em>` : ''}<span class="needs">${needs}</span></span>
        </button>`;
      }).join('');
      return `<section class="tier${open ? ' open' : ''}${next ? ' next' : ''}">
        <h3><i>${k + 1}</i>${tier.name}</h3>
        <p class="unlock">${open ? (tier.unlock ? '✓ Unlocked' : 'From the start') : `🔒 ${tier.tag}`}</p>
        <div class="cards">${cards}</div>
      </section>`;
    }).join('<span class="arrow" aria-hidden="true">›</span>');
    const note = this.el('.craft-note');
    tree.onclick = (e) => {
      const b = e.target.closest('[data-craft]');
      if (b && b.classList.contains('can')) this.onCraft?.(b.dataset.craft);
      else if (b) note.textContent = b.classList.contains('locked') ? `Locked: ${TIERS.find((t) => t.ids.includes(b.dataset.craft)).tag.toLowerCase()} to open this tier` : b.dataset.note;
    };
    tree.onmouseover = (e) => {
      const b = e.target.closest('[data-craft]');
      if (b) note.textContent = b.dataset.note;
    };
  }

  // --- Creative: every item --------------------------------------------------------

  toggleCreative() {
    const panel = this.el('.creative');
    if (!panel.hidden) return this.closeAll();
    this.closeAll();
    panel.hidden = false;
    const groups = this.el('.creative-groups');
    groups.innerHTML = GROUPS.map((g) => {
      const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].group === g);
      return `<h3>${g}</h3><div class="all-items">${ids.map((id) => `<button type="button" class="slot" data-take="${id}" title="${ITEMS[id].name}">${iconSvg(id)}<span class="slot-name">${ITEMS[id].name}</span></button>`).join('')}</div>`;
    }).join('');
    groups.onclick = (e) => {
      const b = e.target.closest('[data-take]');
      if (b) this.onTake?.(b.dataset.take);
    };
    return true;
  }

  // --- A chest -------------------------------------------------------------------

  openChest(chest, pack) {
    this.closeAll();
    this.el('.chest-ui').hidden = false;
    this.chest = { chest, pack };
    this.renderChest();
  }

  renderChest() {
    if (!this.chest) return;
    const { chest, pack } = this.chest;
    const fill = (sel, inv, side) => {
      const ol = this.el(sel);
      ol.innerHTML = inv.slots.map((s, i) => `<li><button type="button" class="slot" data-side="${side}" data-i="${i}">${slotHtml(s)}</button></li>`).join('');
      ol.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (b) this.onChestMove?.(b.dataset.side, Number(b.dataset.i));
      };
    };
    fill('.chest-slots', chest, 'chest');
    fill('.pack-slots', pack, 'pack');
  }

  closeAll() {
    for (const sel of ['.craft', '.creative', '.chest-ui']) this.el(sel).hidden = true;
    this.chest = null;
    return false;
  }

  // --- The end ---------------------------------------------------------------------

  death(cause) {
    this.closeAll();
    this.el('.death-cause').textContent = cause ? `Killed by ${cause}.` : '';
    this.el('.death').hidden = false;
  }

  alive() {
    this.el('.death').hidden = true;
  }
}
