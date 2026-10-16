import { iconSvg, slotHtml } from '../ui/Hotbar.js';
import { ITEMS, RECIPES, TIERS, usesText } from './items.js';
import { ACHIEVEMENTS, MAX_LEVEL, SKILLS } from './Progress.js';

const BARS = [
  ['health', 'Health', '#e0413a', `<path d="M16 28S4 20 4 11a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 9-12 17-12 17z"/>`],
  ['hunger', 'Hunger', '#d8903a', `<path d="M8 6c-3 6 0 10 3 11l-1 11h4l-1-11c3-1 6-5 3-11zM22 4c-2 4-3 10 0 12l-1 12h4V4z"/>`],
  ['thirst', 'Thirst', '#3a9ae0', `<path d="M16 3S7 14 7 20a9 9 0 0 0 18 0c0-6-9-17-9-17z"/>`],
  ['warmth', 'Warmth', '#f06a2a', `<path d="M16 2c1 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-8 1 3 3 4 3 4 0-5-1-8 2-12z"/>`],
  ['energy', 'Energy', '#e8d24a', `<path d="M18 2L6 18h8l-2 12 12-16h-8z"/>`],
];
const GROUPS = ['Tools', 'Materials', 'Trophies', 'Food', 'Farming', 'Worn', 'Building', 'Spawners'];

/**
 * What's on screen for staying alive: the bars (health, hunger, thirst,
 * warmth, energy) above the hotbar, what's wrong with you (fever,
 * bleeding, worn out, weighed down), which way the wind blows (your scent
 * goes with it), what you're wearing, what you can do with what's in
 * front of you (under the crosshair), the crafting menu (Tab), the
 * creative menu (Z: every item, for testing), a chest's contents, the red
 * of being hurt, the frost of the cold, the dark of sleep, and the end.
 */
/**
 * You, as the inventory shows you: a figure in what you wear, the coat and
 * armour in their colours, a backpack (if worn) on your back, its straps
 * over your shoulders.
 */
const WEAR_COLOUR = {
  coat: '#a8743e', furCloak: '#8a7458', paleCloak: '#e8e4dc', caveCloak: '#3a3634',
  boots: '#6a4428', furBoots: '#5a3e28', gloves: '#9a6a3e', furHat: '#8a7458', strawHat: '#e0c878',
  armour: '#7a5230', steelArmour: '#8a96a0', scarArmour: '#4a3426', lionArmour: '#c89a5a', tigerArmour: '#d07a2a', crocArmour: '#4a6a3a',
};
function personSvg(inv) {
  const coat = inv.worn ? WEAR_COLOUR[inv.worn.id] ?? '#8a6a4a' : null, armour = inv.armour ? WEAR_COLOUR[inv.armour.id] ?? '#7a5230' : null, pack = inv.back?.id === 'backpack';
  const skin = '#e2b48c', shirt = '#9a8a6a', legs = '#5a4a3a';
  const feet = inv.feet ? WEAR_COLOUR[inv.feet.id] : null, hands = inv.hands ? WEAR_COLOUR[inv.hands.id] : null, hat = inv.head?.id;
  return `
    ${pack ? '<rect x="22" y="62" width="76" height="70" rx="12" fill="#6a4426"/><rect x="30" y="68" width="60" height="22" rx="6" fill="#8a5a34"/>' : ''}
    <circle cx="60" cy="34" r="17" fill="${skin}"/>
    <path d="M44 28q16-16 32 0v-6q-16-14-32 0z" fill="#5a3a22"/>
    <rect x="52" y="49" width="16" height="9" fill="${skin}"/>
    <path d="M36 60h48l8 64H28z" fill="${coat ?? shirt}"/>
    ${armour ? `<path d="M40 64h40l5 46H35z" fill="${armour}"/><path d="M40 78h40M39 92h42" stroke="rgba(0,0,0,.25)" stroke-width="3"/>` : ''}
    <path d="M36 62l-14 54h10l12-40z" fill="${coat ?? shirt}"/><path d="M84 62l14 54H88L76 76z" fill="${coat ?? shirt}"/>
    <circle cx="27" cy="120" r="${hands ? 7 : 6}" fill="${hands ?? skin}"/><circle cx="93" cy="120" r="${hands ? 7 : 6}" fill="${hands ?? skin}"/>
    <path d="M38 124h20l-2 76H42zM62 124h20l-4 76H64z" fill="${legs}"/>
    ${feet ? `<path d="M41 178h16l-1 22H42zM63 178h16l-1 22H64z" fill="${feet}"/>${inv.feet.id === 'furBoots' ? '<path d="M40 176h18v6H40zM62 176h18v6H62z" fill="#a89070"/>' : ''}` : ''}
    <path d="M40 200h18v8H36zM64 200h18l4 8H64z" fill="${feet ? '#2a1e14' : '#3a2a1c'}"/>
    ${hat === 'strawHat' ? '<ellipse cx="60" cy="24" rx="30" ry="5" fill="#e0c878"/><path d="M47 24q0-16 13-16t13 16z" fill="#d8bc6a"/><path d="M47 21h26v3H47z" fill="#8a4a2a"/>' : ''}
    ${hat === 'furHat' ? '<path d="M42 30q0-22 18-22t18 22z" fill="#8a7458"/><path d="M41 26h38v6H41z" fill="#a89070"/><path d="M41 30h6v14h-6zM73 30h6v14h-6z" fill="#a89070"/>' : ''}
    ${pack ? '<path d="M44 60l4 50M76 60l-4 50" stroke="#4a2e18" stroke-width="5"/>' : ''}`;
}

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="vitals" aria-label="Health, hunger, thirst, warmth and energy">
        ${BARS.map(([id, label, colour, icon]) => `<div class="vital" data-vital="${id}" title="${label}"><svg viewBox="0 0 32 32" aria-hidden="true" fill="${colour}">${icon}</svg><span class="vital-bar"><i style="background:${colour}"></i></span></div>`).join('')}
        <div class="worn worn-coat" hidden title="Wearing"></div>
        <div class="worn worn-armour" hidden title="Wearing"></div>
        <div class="worn worn-back" hidden title="On your back"></div>
        <div class="wind" title="The wind: your scent goes the way it blows"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3l7 20-7-5-7 5z" fill="#dfe8ee"/></svg></div>
      </div>
      <div class="status"></div>
      <div class="almanac" hidden aria-label="How long you've lasted"><b class="al-day"></b><span class="al-season"></span><span class="al-best"></span></div>
      <p class="al-toast" aria-live="polite"></p>
      <p class="prompt" hidden></p>
      <div class="hitmark"></div>
      <div class="draw" hidden><i></i></div>
      <div class="meter" hidden><span></span><b><i></i></b></div>
      <div class="bossbar" hidden><span></span><b><i></i></b></div>
      <div class="hurt-vignette"></div>
      <div class="cold-vignette"></div>
      <div class="sleep-fade"></div>
      <button type="button" class="skills-button" hidden title="Skills and achievements (K)" aria-label="Skills and achievements"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3l3.6 8 8.4.8-6.4 5.6 1.9 8.4L16 21.4 8.5 25.8l1.9-8.4L4 11.8l8.4-.8z" fill="#f2d880"/></svg><b></b></button>
      <section class="skills-ui" hidden aria-label="Skills and achievements">
        <header><h2>Skills</h2><p>Better the more you do them · K or Esc to close</p></header>
        <ol class="skill-list"></ol>
        <h2 class="ach-head">Achievements</h2>
        <ol class="ach-list"></ol>
      </section>
      <section class="craft" hidden aria-label="Crafting">
        <header><h2>Crafting</h2><p>Click to make · Tab or Esc to close · Z for every item</p></header>
        <div class="tree"></div>
        <p class="craft-note">Point at something to see what it's for.</p>
      </section>
      <section class="creative" hidden aria-label="Creative: every item">
        <header><h2>Every item</h2><p>Click for a stack in your hotbar · Z or Esc to close</p></header>
        <div class="creative-groups"></div>
      </section>
      <section class="inv-ui" hidden aria-label="Inventory">
        <header><h2>Inventory</h2><p>Click a stack, then where it should go · E or Esc to close</p><button type="button" class="inv-sort">Sort</button></header>
        <div class="inv-body">
          <div class="inv-figure">
            <svg class="inv-person" viewBox="0 0 120 220" aria-hidden="true"></svg>
            <div class="inv-worn">
              <button type="button" class="slot" data-worn="worn" title="Coat"></button>
              <button type="button" class="slot" data-worn="armour" title="Armour"></button>
              <button type="button" class="slot" data-worn="back" title="Back"></button>
              <button type="button" class="slot" data-worn="head" title="Hat"></button>
              <button type="button" class="slot" data-worn="hands" title="Gloves"></button>
              <button type="button" class="slot" data-worn="feet" title="Boots"></button>
            </div>
          </div>
          <div class="inv-grid">
            <h3>Hotbar</h3>
            <ol class="inv-hot"></ol>
            <h3 class="inv-pack-head">Backpack</h3>
            <ol class="inv-pack"></ol>
          </div>
        </div>
        <p class="inv-note">Coats, armour, a backpack, hats, gloves and boots go on you: click one, then its place on the figure (or click it in your hand).</p>
      </section>
      <section class="emotes" hidden aria-label="Emotes">
        <h2>Emotes</h2>
        <div class="emote-row">
          ${[['wave', 'Wave'], ['cheer', 'Cheer'], ['point', 'Point'], ['bow', 'Bow'], ['sit', 'Sit'], ['shrug', 'Shrug']].map(([k, t], i) => `<button type="button" data-emote="${k}"><b>${i + 1}</b>${t}</button>`).join('')}
        </div>
        <p class="ask-hint">G to wave · T or Esc to close · the others see it online (F3 to see yourself)</p>
      </section>
      <section class="ask-ui" hidden aria-label="Write">
        <h2 class="ask-title"></h2>
        <textarea class="ask-text" rows="3" maxlength="120"></textarea>
        <p><button type="button" class="ask-ok">Done</button> <span class="ask-hint">Enter to finish · Esc to leave it</span></p>
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
        <p class="death-days"></p>
        <p class="death-best"></p>
        <button type="button" class="respawn">Try again</button>
      </section>
      <section class="death won" hidden>
        <h2>The heart of the Lost Keep</h2>
        <p>Every great beast brought down, their trophies set in the altar at the top of the Lost Keep: you have reached the end of the long road.</p>
        <p class="won-days"></p>
        <button type="button" class="won-on">Go on exploring</button>
      </section>`;
    this.el = (sel) => root.querySelector(sel);
    this.bars = Object.fromEntries(BARS.map(([id]) => [id, root.querySelector(`[data-vital="${id}"]`)]));
    this.onCraft = null;
    this.onTake = null;
    this.onChestMove = null;
    this.onRespawn = null;
    this.onLeave = null;
    this.el('.respawn').addEventListener('click', () => (this.deathButton === 'leave' ? this.onLeave?.() : this.onRespawn?.()));
    this.el('.skills-button').addEventListener('click', () => this.onSkills?.());
    this.el('.won-on').addEventListener('click', () => ((this.el('.won').hidden = true), this.onWonClose?.()));
    this.sleepAmount = 0;
  }

  get busy() {
    return ['.craft', '.creative', '.chest-ui', '.inv-ui', '.death', '.won', '.skills-ui', '.ask-ui', '.emotes'].some((sel) => !this.el(sel).hidden);
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
    for (const [sel, stack] of [['.worn-coat', inventory.worn], ['.worn-armour', inventory.armour], ['.worn-back', inventory.back]]) {
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
    if (info.hotSpring) chips.push(['load', 'Hot spring: warming']);
    if (info.heatstroke) chips.push(['bleed', 'Heatstroke']);
    if (info.blizzard) chips.push(['wet', 'Blizzard']);
    if (info.coldWater > 0.25) chips.push(['wet', info.coldWater > 0.8 ? 'Icy water' : 'Cold water']);
    if (survival.energy < 20) chips.push(['tired', survival.energy <= 0 ? 'Exhausted' : 'Worn out']);
    if (survival.wet > 0.3) chips.push(['wet', survival.wet > 0.7 ? 'Soaked through' : 'Soaked']);
    else if (survival.wet > 0.08) chips.push(['wet', 'Damp']);
    if ((survival.shivering ?? 0) > 0.5) chips.push(['wet', 'Shivering']);
    if (survival.wet > 0.08 && info.drying) chips.push(['load', 'Drying off']);
    if (survival.full > 0) chips.push(['load', 'Full']);
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
  /** A labelled meter under the crosshair (settling a horse, a horse's wind), or none (null). */
  meter(label, amount) {
    const el = this.el('.meter');
    el.hidden = amount === null;
    if (amount === null) return;
    if (this.meterLabel !== label) (this.meterLabel = label), (el.querySelector('span').textContent = label);
    el.querySelector('i').style.width = `${Math.round(Math.max(0, Math.min(1, amount)) * 100)}%`;
  }

  /** A great beast you're fighting: its name and health (0..1) at the top of the screen; or none (null). */
  boss(name, health) {
    const el = this.el('.bossbar');
    el.hidden = name === null;
    if (name === null) return;
    if (this.bossName !== name) (this.bossName = name), (el.querySelector('span').textContent = name);
    el.querySelector('i').style.width = `${Math.round(Math.max(0, Math.min(1, health)) * 1000) / 10}%`;
  }

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

  // --- Skills and achievements ----------------------------------------------------

  /** The skills button (top right): shown in survival, with your skills' levels added up. */
  skillsButton(record) {
    const b = this.el('.skills-button');
    b.hidden = !record;
    if (!record) return;
    const total = SKILLS.reduce((n, s) => n + record.level(s.id), 0);
    const t = `${total}`;
    if (b.querySelector('b').textContent !== t) b.querySelector('b').textContent = t;
  }

  toggleSkills(record) {
    const panel = this.el('.skills-ui');
    if (!panel.hidden) return this.closeAll();
    this.closeAll();
    panel.hidden = false;
    this.renderSkills(record);
    return true;
  }

  renderSkills(record) {
    if (this.el('.skills-ui').hidden || !record) return;
    this.el('.skill-list').innerHTML = SKILLS.map((s) => {
      const l = record.level(s.id), next = Math.round(record.toNext(s.id) * 100);
      return `<li><div class="sk-top"><b>${s.name}</b><span>Level ${l}${l >= MAX_LEVEL ? ' (master)' : ''}</span></div><span class="sk-bar"><i style="width:${l >= MAX_LEVEL ? 100 : next}%"></i></span><p>${s.what}. <em>${s.how}.</em></p></li>`;
    }).join('');
    const done = ACHIEVEMENTS.filter((a) => record.done.has(a.id)).length;
    this.el('.ach-head').textContent = `Achievements · ${done} of ${ACHIEVEMENTS.length}`;
    this.el('.ach-list').innerHTML = ACHIEVEMENTS.map((a) => {
      const day = record.done.get(a.id);
      return `<li class="${day ? 'got' : ''}"><b>${day ? '★' : '☆'} ${a.name}</b><p>${a.what}${day ? ` · day ${day}` : ''}</p></li>`;
    }).join('');
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
        const station = (!r.at || this.stations?.[r.at]) && (!r.uses || r.uses.some((t) => inventory.count(t) > 0));
        const can = open && has && station;
        const needs = Object.entries(r.needs)
          .map(([n, c]) => `<span class="need${inventory.count(n) >= c ? '' : ' short'}" title="${ITEMS[n].name}">${iconSvg(n)}${c}</span>`)
          .join('');
        const atText = { anvil: 'at an anvil', fire: 'by a lit fire' }[r.at] ?? `at a ${r.at}`;
        const note = `${r.note}${r.at ? ` (${atText})` : ''}`;
        const tool = r.uses ? `<em class="${r.uses.some((t) => inventory.count(t) > 0) ? '' : 'short'}">with ${usesText(r)}</em>` : '';
        return `<button type="button" class="card${can ? ' can' : ''}${open ? '' : ' locked'}" data-craft="${id}" data-note="${ITEMS[id].name}: ${note.replaceAll('"', '&quot;')}" ${can ? '' : 'aria-disabled="true"'}>
          <span class="made">${iconSvg(id)}${r.makes ? `<b>×${r.makes}</b>` : ''}</span>
          <span class="what"><b>${ITEMS[id].name}</b>${r.at ? `<em class="${station ? '' : 'short'}">${atText}</em>` : ''}${tool}<span class="needs">${needs}</span></span>
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
    groups.innerHTML = GROUPS.filter((g) => g !== 'Spawners' || this.spawners).map((g) => {
      const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].group === g);
      return `<h3>${g}</h3><div class="all-items">${ids.map((id) => `<button type="button" class="slot" data-take="${id}" title="${ITEMS[id].name}">${iconSvg(id)}<span class="slot-name">${ITEMS[id].name}</span></button>`).join('')}</div>`;
    }).join('');
    groups.onclick = (e) => {
      const b = e.target.closest('[data-take]');
      if (b) this.onTake?.(b.dataset.take);
    };
    return true;
  }

  // --- What you carry (E) ------------------------------------------------------------

  toggleInventory(inventory) {
    const panel = this.el('.inv-ui');
    if (!panel.hidden) return this.closeAll();
    this.closeAll();
    panel.hidden = false;
    this.inventory = inventory;
    this.invSel = null;
    this.renderInventory();
    return true;
  }

  /**
   * The inventory: you, with what you wear (coat, armour, a backpack on your
   * back), and every slot you carry (the hotbar; the backpack's, if worn).
   * Click a stack to take it up, then a slot to put it there (on a stack of
   * the same: added to it; on something else: they change places); on the
   * figure's places, to put on or take off.
   */
  renderInventory() {
    const inv = this.inventory;
    if (!inv || this.el('.inv-ui').hidden) return;
    const sel = this.invSel;
    const slot = (s, i) => `<li><button type="button" class="slot${sel === i ? ' picked' : ''}" data-i="${i}">${slotHtml(s)}${i < 9 ? `<span class="slot-key">${i + 1}</span>` : ''}</button></li>`;
    this.el('.inv-hot').innerHTML = inv.slots.slice(0, 9).map(slot).join('');
    const pack = inv.open > 9;
    this.el('.inv-pack-head').hidden = !pack;
    this.el('.inv-pack').innerHTML = pack ? inv.slots.slice(9, inv.open).map((s, k) => slot(s, k + 9)).join('') : '';
    for (const b of this.el('.inv-worn').querySelectorAll('[data-worn]')) {
      const st = inv[b.dataset.worn];
      b.innerHTML = st ? slotHtml(st) : `<span class="worn-empty">${b.title}</span>`;
      b.classList.toggle('empty', !st);
    }
    this.el('.inv-person').innerHTML = personSvg(inv);
    const grid = this.el('.inv-grid'), note = this.el('.inv-note');
    grid.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const i = Number(b.dataset.i);
      if (this.invSel === null) {
        if (!inv.slots[i]) return;
        this.invSel = i;
        note.textContent = `${ITEMS[inv.slots[i].id].name}: click where it should go${ITEMS[inv.slots[i].id].wear ? ', or its place on the figure to put it on' : ''}`;
        return this.renderInventory();
      }
      const from = this.invSel;
      this.invSel = null;
      if (from === i) return this.renderInventory();
      this.onInvMove?.(from, i);
    };
    this.el('.inv-worn').onclick = (e) => {
      const b = e.target.closest('[data-worn]');
      if (!b) return;
      const want = b.dataset.worn;
      if (this.invSel !== null) {
        const s = inv.slots[this.invSel], kind = ITEMS[s?.id]?.wear;
        const fits = { coat: 'worn', armour: 'armour', back: 'back', head: 'head', hands: 'hands', feet: 'feet' }[kind] === want;
        const i = this.invSel;
        this.invSel = null;
        if (fits) return this.onInvWear?.(i);
        note.textContent = `That doesn't go there`;
        return this.renderInventory();
      }
      if (inv[want]) this.onInvTakeOff?.(want);
    };
    this.el('.inv-sort').onclick = () => {
      this.invSel = null;
      this.onInvSort?.();
    };
  }

  // --- A chest -------------------------------------------------------------------

  openChest(chest, pack, title = 'Chest', note = 'Click to move a stack across · food keeps three times as long in here · E or Esc to close') {
    this.closeAll();
    this.el('.chest-ui').hidden = false;
    this.el('.chest-ui header h2').textContent = title;
    this.el('.chest-ui header p').textContent = note;
    this.chest = { chest, pack };
    this.renderChest();
  }

  renderChest() {
    if (!this.chest) return;
    const { chest, pack } = this.chest;
    const fill = (sel, inv, side) => {
      const ol = this.el(sel);
      ol.innerHTML = inv.slots.slice(0, inv.open ?? inv.slots.length).map((s, i) => `<li><button type="button" class="slot" data-side="${side}" data-i="${i}">${slotHtml(s)}</button></li>`).join('');
      ol.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (b) this.onChestMove?.(b.dataset.side, Number(b.dataset.i));
      };
    };
    fill('.chest-slots', chest, 'chest');
    fill('.pack-slots', pack, 'pack');
  }

  /** The emotes to pick from (T): open (true) or shut. */
  toggleEmotes() {
    const panel = this.el('.emotes');
    if (!panel.hidden) return this.closeAll();
    this.closeAll();
    panel.hidden = false;
    panel.onclick = (e) => {
      const b = e.target.closest('[data-emote]');
      if (b) this.onEmote?.(b.dataset.emote);
    };
    return true;
  }

  /**
   * A line or two to write (a sign's words): `done(text)` when finished
   * (Enter, or the button); Esc leaves it as it was. Returns true (open).
   */
  ask(title, value, done) {
    this.closeAll();
    const panel = this.el('.ask-ui'), box = this.el('.ask-text');
    this.el('.ask-title').textContent = title;
    box.value = value ?? '';
    panel.hidden = false;
    const finish = () => {
      if (panel.hidden) return;
      panel.hidden = true;
      done(box.value.slice(0, 120));
    };
    this.el('.ask-ok').onclick = finish;
    box.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), finish());
      if (e.key === 'Escape') (e.preventDefault(), (panel.hidden = true), done(null));
    };
    setTimeout(() => box.focus(), 0);
    return true;
  }

  closeAll() {
    for (const sel of ['.craft', '.creative', '.chest-ui', '.skills-ui', '.inv-ui', '.ask-ui', '.emotes']) this.el(sel).hidden = true;
    this.chest = null;
    this.invSel = null;
    return false;
  }

  // --- The end ---------------------------------------------------------------------

  /**
   * The death screen: what killed you; in survival, how many days you
   * lasted and the longest yet. `button`: 'again' (try again), 'new' (a new
   * life, online) or 'leave' (back to the menu: that life is over).
   */
  death({ cause, days = null, longest = null, button = 'again' }) {
    this.closeAll();
    const n = (d) => `${d} ${d === 1 ? 'day' : 'days'}`;
    this.el('.death-cause').textContent = cause ? `Killed by ${cause}.` : '';
    this.el('.death-days').textContent = days === null ? '' : `You survived ${n(days)}.`;
    this.el('.death-best').textContent = longest === null ? '' : days >= longest && days > 0 ? 'Your longest life yet.' : `Your longest: ${n(longest)}.`;
    this.deathButton = button;
    this.el('.respawn').textContent = { again: 'Try again', new: 'Start a new life', leave: 'Back to the menu' }[button];
    this.el('.death').hidden = false;
  }

  /** The end of the long road: the Lost Keep's heart reached. */
  won({ days, bosses }) {
    this.el('.won-days').textContent = `${days} ${days === 1 ? 'day' : 'days'} in the wild, ${bosses} great ${bosses === 1 ? 'beast' : 'beasts'} brought down.`;
    this.el('.won').hidden = false;
  }

  /** Survival: the day of this life, the season, and the longest life yet (or hidden: null). */
  almanac(info) {
    const el = this.el('.almanac');
    el.hidden = !info;
    if (!info) return;
    const key = `${info.day}|${info.season}|${info.longest}`;
    if (key === this.almanacKey) return;
    this.almanacKey = key;
    this.el('.al-day').textContent = `Day ${info.day}`;
    this.el('.al-season').textContent = info.season;
    this.el('.al-best').textContent = `Longest: ${info.longest} ${info.longest === 1 ? 'day' : 'days'}`;
  }

  /** A quiet word under the almanac, fading after a while. */
  toast(text) {
    const el = this.el('.al-toast');
    el.textContent = text;
    el.classList.remove('shown');
    void el.offsetWidth; // (to start the fade over)
    el.classList.add('shown');
  }

  alive() {
    this.el('.death').hidden = true;
  }
}
