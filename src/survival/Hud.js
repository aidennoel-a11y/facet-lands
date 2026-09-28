import { iconSvg, slotHtml } from '../ui/Hotbar.js';
import { ITEMS, RECIPES } from './items.js';

const BARS = [
  ['health', 'Health', '#e0413a', `<path d="M16 28S4 20 4 11a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 9-12 17-12 17z"/>`],
  ['hunger', 'Hunger', '#d8903a', `<path d="M8 6c-3 6 0 10 3 11l-1 11h4l-1-11c3-1 6-5 3-11zM22 4c-2 4-3 10 0 12l-1 12h4V4z"/>`],
  ['thirst', 'Thirst', '#3a9ae0', `<path d="M16 3S7 14 7 20a9 9 0 0 0 18 0c0-6-9-17-9-17z"/>`],
  ['warmth', 'Warmth', '#f06a2a', `<path d="M16 2c1 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-8 1 3 3 4 3 4 0-5-1-8 2-12z"/>`],
];

/**
 * What's on screen for staying alive: the four bars (health, hunger,
 * thirst, warmth) above the hotbar, your coat if you're wearing one, what
 * you can do with what's in front of you (under the crosshair), the
 * crafting menu (Tab), a chest's contents, the red of being hurt and the
 * frost of the cold, and the end.
 */
export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="vitals" aria-label="Health, hunger, thirst and warmth">
        ${BARS.map(([id, label, colour, icon]) => `<div class="vital" data-vital="${id}" title="${label}"><svg viewBox="0 0 32 32" aria-hidden="true" fill="${colour}">${icon}</svg><span class="vital-bar"><i style="background:${colour}"></i></span></div>`).join('')}
        <div class="worn" hidden title="Wearing"></div>
      </div>
      <p class="prompt" hidden></p>
      <div class="hurt-vignette"></div>
      <div class="cold-vignette"></div>
      <section class="craft" hidden aria-label="Crafting">
        <header><h2>Crafting</h2><p>Tab or Esc to close</p></header>
        <ul class="recipes"></ul>
        <details class="testing">
          <summary>Testing: take any item</summary>
          <div class="all-items"></div>
        </details>
      </section>
      <section class="chest-ui" hidden aria-label="Chest">
        <header><h2>Chest</h2><p>Click to move a stack across · E or Esc to close</p></header>
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
  }

  get busy() {
    return !this.el('.craft').hidden || !this.el('.chest-ui').hidden || !this.el('.death').hidden;
  }

  update(survival, inventory, active) {
    this.el('.vitals').classList.toggle('paused', !active);
    for (const [id, el] of Object.entries(this.bars)) {
      const v = survival[id];
      el.querySelector('i').style.width = `${Math.max(0, v)}%`;
      el.classList.toggle('low', v < 25);
    }
    const worn = this.el('.worn');
    worn.hidden = !inventory.worn;
    if (inventory.worn) {
      const html = slotHtml(inventory.worn);
      if (worn.dataset.html !== html) (worn.innerHTML = html), (worn.dataset.html = html);
    }
    this.el('.hurt-vignette').style.opacity = Math.min(0.8, survival.hurtFlash + (survival.health < 25 ? 0.25 + 0.1 * Math.sin(performance.now() / 250) : 0)).toFixed(3);
    this.el('.cold-vignette').style.opacity = (active ? Math.min(0.85, (1 - survival.warmth / 100) * 0.9 * Math.min(1, survival.cold * 3)) : 0).toFixed(3);
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
    this.el('.all-items').innerHTML = Object.keys(ITEMS).map((id) => `<button type="button" class="slot" data-take="${id}" title="${ITEMS[id].name}">${iconSvg(id)}</button>`).join('');
    this.el('.all-items').onclick = (e) => {
      const b = e.target.closest('[data-take]');
      if (b) this.onTake?.(b.dataset.take);
    };
    return true;
  }

  renderCraft(inventory) {
    const list = this.el('.recipes');
    list.innerHTML = RECIPES.map((r) => {
      const can = Object.entries(r.needs).every(([id, n]) => inventory.count(id) >= n);
      const needs = Object.entries(r.needs)
        .map(([id, n]) => `<span class="need${inventory.count(id) >= n ? '' : ' short'}" title="${ITEMS[id].name}">${iconSvg(id)}${inventory.count(id)}/${n}</span>`)
        .join('');
      return `<li><span class="made">${iconSvg(r.id)}</span><span class="what"><b>${ITEMS[r.id].name}</b><small>${r.note}</small><span class="needs">${needs}</span></span><button type="button" data-craft="${r.id}" ${can ? '' : 'disabled'}>Craft</button></li>`;
    }).join('');
    list.onclick = (e) => {
      const b = e.target.closest('[data-craft]');
      if (b && !b.disabled) this.onCraft?.(b.dataset.craft);
    };
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
    this.el('.craft').hidden = true;
    this.el('.chest-ui').hidden = true;
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
