// The title screen: Start, then make a new world (name, seed, and how to
// play it: creative, survival or testing) or carry on with a saved one;
// and the pause menu in play (save, quit to the title). Saved worlds are
// listed in this browser's storage (see WORLDS_KEY); a testing world is
// never saved.

import { DEFAULT_SERVER, VERSION, openWorlds } from '../net/Multiplayer.js';
import { describeHardware, graphicsInfo, MAX_VIEW, QUALITY, quality, qualityChosen, setQuality } from '../quality.js';
import { DEFAULTS, DIFFICULTIES, saveSettings, settings } from '../settings.js';
import { ACTIONS, FIXED_KEYS, bind, keyName, keyOf, listenForKey, resetKeys } from '../keys.js';
import { LOOK_CHOICES, LOOK_COLOURS, LOOK_DEFAULT, loadLook, randomLook, saveLook } from '../character.js';
import { characterPreview } from './CharacterPreview.js';
import { WORLD_OPTIONS, WORLD_PRESETS, describeOptions, parseSeed, seedWith } from '../worldOptions.js';

const WORLDS_KEY = 'facet-lands:worlds';
// The seeds whose land has claimed a survival life: never played in survival again.
const DEAD_KEY = 'facet-lands:deadSeeds';
const norm = (seed) => String(seed).trim().toLowerCase();
function deadSeeds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DEAD_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
const seedIsDead = (seed) => deadSeeds().has(norm(seed));
// (A fresh random seed, never one that's claimed a life.)
function freshSeed() {
  let s;
  do s = Math.random().toString(36).slice(2, 8);
  while (seedIsDead(s));
  return s;
}
// (Whether you've been told that survival is for keeps; `set` to note it.)
function warned(set = false) {
  try {
    if (set) localStorage.setItem('facet-lands:hardcoreWarned', '1');
    return !!localStorage.getItem('facet-lands:hardcoreWarned');
  } catch {
    return true;
  }
}
const esc = (v) => String(v).replace(/[&"<]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;' })[c]);

const FAR_DETAIL = ['Normal', 'More', 'High', 'Ultra'];

export const MODES = {
  survival: { name: 'Survival', blurb: 'Hunger, thirst, cold and wild animals. Gather, craft and build to stay alive. No flying.' },
  creative: { name: 'Creative', blurb: 'No health or hunger. Fly anywhere and explore the world freely.' },
  testing: { name: 'Testing', blurb: 'Every tool and setting, the debug panel and a starter kit. Never saved.' },
};

/** The saved worlds: [{ id, name, seed, mode, created, played, camera }], most recently played first. */
export function savedWorlds() {
  try {
    const list = JSON.parse(localStorage.getItem(WORLDS_KEY) || '[]');
    return Array.isArray(list) ? list.sort((a, b) => (b.played ?? 0) - (a.played ?? 0)) : [];
  } catch {
    return [];
  }
}

function writeWorlds(list) {
  try {
    localStorage.setItem(WORLDS_KEY, JSON.stringify(list));
  } catch {
    // (No storage here: the worlds just aren't remembered.)
  }
}

/** Records (or updates) a saved world in the list. */
export function rememberWorld(world) {
  const list = savedWorlds().filter((w) => w.id !== world.id);
  list.push({ ...world, played: Date.now() });
  writeWorlds(list);
}

function forgetWorld(id) {
  writeWorlds(savedWorlds().filter((w) => w.id !== id));
  try {
    localStorage.removeItem(`facet-lands:survival:${id}`);
  } catch {
    // (Nothing to remove.)
  }
}

/**
 * A survival life is over: its save is wiped at once (what it built, carried
 * and changed), and the world is marked as ended, so it can't be carried on.
 * Its seed is kept, to start a new life on.
 */
export function endLife(world, days) {
  try {
    localStorage.removeItem(`facet-lands:survival:${world.id}`);
  } catch {
    // (Nothing kept.)
  }
  try {
    localStorage.setItem(DEAD_KEY, JSON.stringify([...deadSeeds().add(norm(world.seed))]));
  } catch {
    // (Not remembered.)
  }
  const list = savedWorlds().filter((w) => w.id !== world.id);
  const { camera, ...rest } = world;
  list.push({ ...rest, dead: true, lastDays: days, played: Date.now() });
  writeWorlds(list);
}

/** A low-poly backdrop: a sky of facets over ranges of faceted hills (an SVG). */
function backdrop() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const W = 1600, H = 900;
  const tris = [];
  // Sky: dusk facets.
  const sky = ['#2b3a4a', '#33465a', '#3d5266', '#46596b', '#55637a', '#6b6f80', '#8a7a78', '#b08a6a'];
  const cols = 14, rows = 7;
  const pt = (i, j) => [(i / cols) * W + (i % cols && i < cols ? (rand() - 0.5) * 60 : 0), (j / rows) * H * 0.62 + (j && j < rows ? (rand() - 0.5) * 40 : 0)];
  const grid = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) grid.push(pt(i, j));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = grid[j * (cols + 1) + i], b = grid[j * (cols + 1) + i + 1], c = grid[(j + 1) * (cols + 1) + i], d = grid[(j + 1) * (cols + 1) + i + 1];
      const shade = sky[Math.min(sky.length - 1, Math.max(0, j + Math.floor(rand() * 2)))];
      tris.push([a, b, d, shade], [a, d, c, sky[Math.min(sky.length - 1, j + Math.floor(rand() * 2))]]);
    }
  }
  // Ranges: far blue-grey, then green forested hills, then a dark near ridge.
  const ranges = [
    { base: H * 0.62, amp: 170, col: ['#5d6b7c', '#687687', '#56647a', '#73808f'], n: 16 },
    { base: H * 0.72, amp: 120, col: ['#3f5a3c', '#4a6a44', '#365035', '#52724a'], n: 18 },
    { base: H * 0.86, amp: 90, col: ['#25382a', '#2d4431', '#203024', '#34503a'], n: 20 },
  ];
  for (const r of ranges) {
    const top = [];
    for (let k = 0; k <= r.n; k++) top.push([(k / r.n) * W, r.base - rand() * r.amp]);
    for (let k = 0; k < r.n; k++) {
      const [a, b] = [top[k], top[k + 1]];
      const mid = [(a[0] + b[0]) / 2 + (rand() - 0.5) * 30, H];
      tris.push([a, b, mid, r.col[Math.floor(rand() * r.col.length)]]);
      tris.push([a, mid, [a[0], H], r.col[Math.floor(rand() * r.col.length)]]);
      tris.push([b, [b[0], H], mid, r.col[Math.floor(rand() * r.col.length)]]);
    }
  }
  const polys = tris.map(([a, b, c, col]) => `<polygon points="${a.join(',')} ${b.join(',')} ${c.join(',')}" fill="${col}" stroke="${col}" stroke-width="1"/>`).join('');
  return `<svg class="sm-backdrop" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${polys}</svg>`;
}

export class StartMenu {
  /**
   * `onPlay(world)` starts a world ({ id, name, seed, mode, camera? });
   * `onSave()` saves the world in play; `onQuit()` leaves it.
   */
  constructor({ onPlay, onSave, onQuit, onHost, onJoin }) {
    this.onPlay = onPlay;
    this.onSave = onSave;
    this.onQuit = onQuit;
    this.onHost = onHost; // ({ url, name, world }) => Promise (the room's open)
    this.onJoin = onJoin; // ({ url, code, name }) => Promise<world> (the room's world)
    this.world = null; // (the world in play)
    // (The online server, woken now: a free one asleep takes up to a minute
    // to wake, and by the time you've chosen to play online it's ready.)
    try {
      openWorlds(localStorage.getItem('facet-lands:server2') || DEFAULT_SERVER).catch(() => {});
    } catch {
      // (Not a server address: you'll be told when you try it.)
    }
    const root = (this.root = document.createElement('div'));
    root.className = 'start-menu';
    root.innerHTML = `${backdrop()}<div class="sm-card" role="dialog" aria-modal="true"></div>`;
    document.body.append(root);
    this.card = root.querySelector('.sm-card');
    // The pause button in play.
    const pause = (this.pauseButton = document.createElement('button'));
    pause.className = 'sm-pause-button';
    pause.type = 'button';
    pause.title = 'Menu (Esc)';
    pause.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>';
    pause.hidden = true;
    pause.addEventListener('click', () => this.pause());
    document.body.append(pause);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.world || document.pointerLockElement) return;
      if (this.root.hidden) this.pause();
      else if (this.paused) this.resume();
    });
    this.title();
  }

  get open() {
    return !this.root.hidden;
  }

  #show(html) {
    this.root.hidden = false;
    this.root.classList.toggle('sm-over-world', !!this.world);
    this.preview?.dispose();
    this.preview = null;
    this.card.classList.remove('sm-card-wide');
    this.card.innerHTML = html;
    window.dispatchEvent(new Event('sm-page')); // (its page turning: see main, the menus' sounds)
    if (document.pointerLockElement) document.exitPointerLock();
    return this.card;
  }

  #on(selector, fn) {
    this.card.querySelector(selector)?.addEventListener('click', fn);
  }

  title() {
    this.paused = false;
    this.#show(`
      <h1 class="sm-logo">Facet<span>Lands</span></h1>
      <p class="sm-tag">A low-poly world to survive in</p>
      <button class="sm-btn sm-primary" data-go="start">Start</button>
      <button class="sm-btn" data-go="character">Character</button>
      <button class="sm-btn" data-go="settings">Settings</button>
      <p class="sm-hw">${esc(describeHardware())}</p>
      ${graphicsInfo().software ? `<p class="sm-warn"><strong>Your graphics card isn't being used.</strong> The browser is drawing the game on the processor instead, which is very slow. Install your computer's graphics driver (from its maker's support site), and check hardware acceleration is on in the browser's settings (Chrome: Settings, System, "Use graphics acceleration when available").</p>` : ''}
      ${graphicsInfo().integrated ? `<p class="sm-warn"><strong>The game is on your processor's built-in graphics.</strong> If this computer also has a graphics card of its own (an NVIDIA GeForce, say), the browser isn't using it. On Windows: Settings, System, Display, Graphics; pick your browser (add it if it's not listed), Options, "High performance"; then close every browser window and open it again.</p>` : ''}
      <a class="sm-credits" href="sounds/CREDITS.md" target="_blank" rel="noopener">Sound credits</a>`);
    this.#on('[data-go="start"]', () => this.choose());
    this.#on('[data-go="settings"]', () => this.settings(() => this.title()));
    this.#on('[data-go="character"]', () => this.character(() => this.title()));
  }

  choose() {
    const n = savedWorlds().length;
    this.#show(`
      <h2 class="sm-head">Play</h2>
      <button class="sm-btn sm-primary" data-go="new">Create a new world</button>
      <button class="sm-btn" data-go="load" ${n ? '' : 'disabled'}>Load a saved world${n ? ` <small>(${n})</small>` : ''}</button>
      ${this.onJoin ? '<button class="sm-btn" data-go="online">Play online</button>' : ''}
      <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
    this.#on('[data-go="new"]', () => this.create());
    this.#on('[data-go="load"]', () => this.load());
    this.#on('[data-go="online"]', () => this.online());
    this.#on('[data-go="back"]', () => this.title());
  }

  // Playing together: the server's address and your name (remembered),
  // then open a world of your own to others, or join one: the worlds open
  // on the server are listed, to click (or, to join one not listed, its code).
  online(note = '') {
    const remembered = (k) => {
      try {
        return localStorage.getItem(`facet-lands:${k}`) ?? '';
      } catch {
        return '';
      }
    };
    const card = this.#show(`
      <h2 class="sm-head">Play online</h2>
      <label class="sm-field">Your name<input id="sm-player" type="text" maxlength="24" value="${esc(remembered('name') || 'Wanderer')}" /></label>
      <button class="sm-btn sm-primary" data-go="host">Host a new world</button>
      <div class="sm-list-head"><span>Open worlds</span><button type="button" class="sm-refresh" data-go="refresh">Refresh</button></div>
      <ul class="sm-worlds sm-open" aria-live="polite"><li class="sm-none">Looking…</li></ul>
      <details class="sm-bycode">
        <summary>Join with a code instead</summary>
        <div class="sm-join">
          <label class="sm-field">World code<input id="sm-code" type="text" maxlength="6" placeholder="ABC123" autocomplete="off" /></label>
          <button class="sm-btn" data-go="join">Join</button>
        </div>
      </details>
      <details class="sm-bycode"${remembered('server2') ? ' open' : ''}>
        <summary>Server settings</summary>
        <label class="sm-field">Server (empty: the game's own, online)<input id="sm-server" type="text" maxlength="200" placeholder="${DEFAULT_SERVER}" value="${esc(remembered('server2'))}" /></label>
      </details>
      <p class="sm-note" aria-live="polite">${esc(note)}</p>
      <p class="sm-version">Game version ${VERSION} (everyone playing together needs the same)</p>
      <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
    const say = (t) => (card.querySelector('.sm-note').textContent = t);
    const read = () => {
      // (A server of your own, if one's put in Server settings; else the game's.)
      const own = card.querySelector('#sm-server').value.trim(), url = own || DEFAULT_SERVER, name = card.querySelector('#sm-player').value.trim() || 'Wanderer';
      try {
        localStorage.setItem('facet-lands:server2', own);
        localStorage.setItem('facet-lands:name', name);
      } catch {
        // (Not remembered, then.)
      }
      return { url, name };
    };
    const join = (code) => {
      const who = read();
      say('Joining…');
      this.onJoin({ ...who, code })
        .then((world) => this.#play(world))
        .catch((e) => this.online(e.message));
    };
    // The worlds open on the server, each a button to join it.
    const list = card.querySelector('.sm-open');
    const refresh = () => {
      list.innerHTML = '<li class="sm-none">Looking… (the server may take up to a minute to wake if nobody\'s played for a while)</li>';
      openWorlds(read().url)
        .then((worlds) => {
          list.innerHTML = worlds.length
            ? worlds.map((w) => `
              <li><button type="button" class="sm-world" data-code="${esc(w.code)}">
                <strong>${esc(w.name)}</strong>
                <span>${MODES[w.mode]?.name ?? esc(w.mode)} · ${w.players} ${w.players === 1 ? 'player' : 'players'}${(w.version ?? 0) !== VERSION ? ` · <em class="sm-old">${(w.version ?? 0) < VERSION ? 'host needs to update' : 'you need to update'}</em>` : ''}</span>
              </button></li>`).join('')
            : '<li class="sm-none">No worlds open on this server yet: host one!</li>';
          for (const b of list.querySelectorAll('.sm-world')) b.addEventListener('click', () => join(b.dataset.code));
        })
        .catch((e) => (list.innerHTML = `<li class="sm-none">${esc(e.message)}</li>`));
    };
    refresh();
    card.querySelector('#sm-server').addEventListener('change', refresh);
    this.#on('[data-go="refresh"]', refresh);
    this.#on('[data-go="host"]', () => this.create(read()));
    this.#on('[data-go="join"]', () => {
      const code = card.querySelector('#sm-code').value.trim().toUpperCase();
      if (!code) return say('Put in the code of the world to join.');
      join(code);
    });
    this.#on('[data-go="back"]', () => this.choose());
  }

  /** A new world: first how you'll play it (survival, creative, testing), then its name, seed and settings. */
  create(online = null, mode = null) {
    if (!mode) {
      this.#show(`
        <h2 class="sm-head">${online ? 'New world, online' : 'New world'}</h2>
        <p class="sm-tag">How will you play it?</p>
        <div class="sm-modes" role="list">
          ${Object.entries(MODES).filter(([id]) => !online || id !== 'testing').map(([id, m]) => `
            <button type="button" class="sm-mode" data-mode="${id}">
              <strong>${m.name}</strong><span>${m.blurb}</span>
            </button>`).join('')}
        </div>
        <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
      for (const b of this.root.querySelectorAll('.sm-mode')) b.addEventListener('click', () => this.create(online, b.dataset.mode));
      this.#on('[data-go="back"]', () => (online ? this.online() : this.choose()));
      return;
    }
    const seed = freshSeed();
    const card = this.#show(`
      <h2 class="sm-head">${online ? 'New world, online' : 'New world'}: ${MODES[mode]?.name ?? mode}</h2>
      <label class="sm-field">World name<input id="sm-name" type="text" maxlength="40" value="My world" /></label>
      <label class="sm-field">Seed<input id="sm-seed" type="text" maxlength="24" value="${seed}" /></label>
      <details class="sm-world" open>
        <summary>World settings <em class="sm-world-sum">The wild: everything as it comes</em></summary>
        <div class="sm-presets" role="radiogroup" aria-label="World preset">
          ${WORLD_PRESETS.map((p, i) => `<button type="button" class="sm-q${i === 0 ? ' sm-picked' : ''}" data-preset="${p.id}" title="${p.blurb}">${p.name}</button>`).join('')}
        </div>
        <div class="sm-opts">
          ${WORLD_OPTIONS.map((o) => `<label class="sm-opt"><span>${o.name}</span><input type="range" data-opt="${o.id}" min="0" max="${o.levels.length - 1}" step="1" value="${o.normal ?? 2}" /><output>${o.levels[o.normal ?? 2]}</output></label>`).join('')}
        </div>
      </details>
      <button class="sm-btn sm-primary" data-go="play">${online ? 'Create and open to others' : 'Create world'}</button>
      <p class="sm-note" aria-live="polite"></p>
      <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
    // The world's settings: a preset sets them all; each slider then fine-tunes one.
    const levels = Object.fromEntries(WORLD_OPTIONS.map((o) => [o.id, o.normal ?? 2]));
    const sum = card.querySelector('.sm-world-sum');
    const showOpts = (presetName = null) => {
      for (const input of card.querySelectorAll('[data-opt]')) {
        const o = WORLD_OPTIONS.find((x) => x.id === input.dataset.opt);
        input.value = levels[o.id];
        input.nextElementSibling.textContent = o.levels[levels[o.id]];
      }
      const said = describeOptions(seedWith('x', levels));
      sum.textContent = presetName ? `${presetName}${said ? `: ${said}` : ''}` : said ? `Custom: ${said}` : 'The wild: everything as it comes';
    };
    for (const b of card.querySelectorAll('[data-preset]')) {
      b.addEventListener('click', () => {
        const p = WORLD_PRESETS.find((x) => x.id === b.dataset.preset);
        for (const o of WORLD_OPTIONS) levels[o.id] = p.set[o.id] ?? o.normal ?? 2;
        for (const o of card.querySelectorAll('[data-preset]')) o.classList.toggle('sm-picked', o === b);
        showOpts(p.name);
      });
    }
    for (const input of card.querySelectorAll('[data-opt]')) {
      input.addEventListener('input', () => {
        levels[input.dataset.opt] = Number(input.value);
        for (const o of card.querySelectorAll('[data-preset]')) o.classList.remove('sm-picked');
        showOpts();
      });
    }
    this.#on('[data-go="play"]', () => {
      const name = card.querySelector('#sm-name').value.trim() || 'My world';
      const typed = card.querySelector('#sm-seed').value.trim() || seed;
      // (A seed typed with its settings already on it, after a '~', is taken as it is.)
      const s = typed.includes('~') ? typed : seedWith(typed, levels);
      const world = { id: `w${Date.now().toString(36)}`, name, seed: s, mode, created: Date.now() };
      // (A land that has claimed a life is closed to survival for good.)
      if (mode === 'survival' && seedIsDead(s)) {
        card.querySelector('.sm-note').textContent = 'You died on this land. It will not take you back: choose another seed.';
        return;
      }
      if (online) {
        card.querySelector('.sm-note').textContent = 'Opening the world…';
        this.onHost({ ...online, world })
          .then(() => {
            rememberWorld(world);
            this.#play(world);
          })
          .catch((e) => this.online(e.message));
        return;
      }
      // (Once: survival is for keeps.)
      if (mode === 'survival' && !online && !warned()) {
        warned(true);
        card.querySelector('.sm-note').textContent = 'Survival is for keeps: when you die, that life is over, and everything it built and carried is gone. Only the land remains, for a new life. Press Create world again to begin.';
        return;
      }
      if (mode !== 'testing') rememberWorld(world);
      this.#play(world);
    });
    this.#on('[data-go="back"]', () => this.create(online));
  }

  load() {
    const list = savedWorlds();
    const when = (t) => (t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
    const card = this.#show(`
      <h2 class="sm-head">Saved worlds</h2>
      <ul class="sm-worlds">
        ${list.map((w) => `
          <li>
            <button type="button" class="sm-world${w.dead ? ' sm-ended' : ''}" data-id="${w.id}"${w.dead ? ' disabled' : ''}>
              <strong>${w.name.replace(/</g, '&lt;')}</strong>
              <span>${MODES[w.mode]?.name ?? w.mode} · seed ${String(parseSeed(w.seed).base).replace(/</g, '&lt;')}${parseSeed(w.seed).custom ? ' · custom world' : ''} · ${when(w.played)}</span>
              ${w.dead ? `<span class="sm-dead">Died after ${w.lastDays ?? 0} ${w.lastDays === 1 ? 'day' : 'days'}. This land will not take you back.</span>` : ''}
            </button>
            <button type="button" class="sm-delete" data-del="${w.id}" title="Delete this world">Delete</button>
          </li>`).join('') || '<li class="sm-none">No saved worlds yet.</li>'}
      </ul>
      <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
    for (const b of card.querySelectorAll('.sm-world')) {
      b.addEventListener('click', () => {
        const w = list.find((w) => w.id === b.dataset.id);
        if (!w.dead) this.#play(w); // (a life that's over stays over)
      });
    }
    for (const b of card.querySelectorAll('.sm-delete')) {
      b.addEventListener('click', () => {
        if (b.dataset.confirm) {
          forgetWorld(b.dataset.del);
          this.load();
        } else {
          b.dataset.confirm = '1';
          b.textContent = 'Really delete?';
        }
      });
    }
    this.#on('[data-go="back"]', () => this.choose());
  }

  #play(world) {
    this.world = world;
    this.paused = false;
    this.root.hidden = true;
    this.pauseButton.hidden = false;
    this.onPlay(world);
  }

  pause() {
    if (!this.world) return;
    this.paused = true;
    // (Testing worlds, and other people's worlds you've joined, aren't saved.)
    const testing = this.world.mode === 'testing' || !!this.world.guest;
    const code = this.onlineCode?.();
    const card = this.#show(`
      <h2 class="sm-head">${this.world.name.replace(/</g, '&lt;')}</h2>
      <p class="sm-tag">${MODES[this.world.mode]?.name ?? ''} · seed ${String(this.world.seed).replace(/</g, '&lt;')}</p>
      ${code ? `<p class="sm-code">Online · world code <strong>${code}</strong></p>` : ''}
      <button class="sm-btn sm-primary" data-go="resume">Resume</button>
      ${testing ? '' : '<button class="sm-btn" data-go="save">Save world</button>'}
      <button class="sm-btn" data-go="character">Character</button>
      <button class="sm-btn" data-go="settings">Settings</button>
      <button class="sm-btn" data-go="quit">${testing ? 'Quit to title' : 'Save and quit to title'}</button>
      <p class="sm-note" aria-live="polite"></p>`);
    this.#on('[data-go="resume"]', () => this.resume());
    this.#on('[data-go="settings"]', () => this.settings(() => this.pause()));
    this.#on('[data-go="character"]', () => this.character(() => this.pause()));
    this.#on('[data-go="save"]', () => {
      this.onSave(this.world);
      card.querySelector('.sm-note').textContent = 'Saved.';
    });
    this.#on('[data-go="quit"]', () => {
      if (!testing) this.onSave(this.world);
      this.onQuit(this.world);
      this.world = null;
      this.pauseButton.hidden = true;
      this.title();
    });
  }

  // Your settings: each put into effect as you change it, where it can be
  // (see main's onSettings); the grass, as the land's next built.
  settings(back) {
    const s = settings();
    const preset = QUALITY[quality()].world.viewDistance ?? MAX_VIEW;
    const view = s.view ?? preset;
    const km = (v) => `${((v + 0.5) * 128 / 1000).toFixed(1)} km`;
    const pick = (name, options, value) => `<div class="sm-quality sm-set" role="radiogroup" aria-label="${name}"><span>${name}</span>${options.map(([id, label]) => `<button type="button" class="sm-q${id === value ? ' sm-picked' : ''}" data-set="${name}" data-v="${id}" role="radio" aria-checked="${id === value}">${label}</button>`).join('')}</div>`;
    const card = this.#show(`
      <h2 class="sm-head">Settings</h2>
      <div class="sm-quality" role="radiogroup" aria-label="Graphics">
        <span>Graphics</span>
        ${Object.entries(QUALITY).map(([id, q]) => `<button type="button" class="sm-q sm-gq${id === quality() ? ' sm-picked' : ''}" data-q="${id}" role="radio" aria-checked="${id === quality()}" title="${q.blurb}">${q.name}</button>`).join('')}
      </div>
      <p class="sm-qnote">${QUALITY[quality()].blurb}${qualityChosen() ? '' : ' <em>Picked to suit this computer.</em>'} <em>(Takes effect when a world is next started.)</em></p>
      <label class="sm-field sm-slide">View distance <output>${km(view)}</output><input type="range" data-k="view" min="5" max="${MAX_VIEW}" step="1" value="${view}" /></label>
      <label class="sm-field sm-slide">Far detail <output>${FAR_DETAIL[s.farDetail ?? 0]}</output><input type="range" data-k="farDetail" min="0" max="3" step="1" value="${s.farDetail ?? 0}" /></label>
      <p class="sm-note">How good the trees and woods look far off. Higher costs frame rate; shows as the land round you is next built.</p>
      ${pick('Grass', [[0.5, 'Less'], [1, 'Normal'], [1.6, 'More']], s.grass)}
      ${pick('Shadows', [['off', 'Off'], ['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], s.shadows)}
      <label class="sm-field sm-slide">Mouse sensitivity <output>${s.sensitivity.toFixed(2)}×</output><input type="range" data-k="sensitivity" min="0.25" max="2.5" step="0.05" value="${s.sensitivity}" /></label>
      <label class="sm-field sm-slide">Field of view <output>${s.fov}°</output><input type="range" data-k="fov" min="50" max="100" step="1" value="${s.fov}" /></label>
      <label class="sm-field sm-slide">Brightness <output>${(s.brightness ?? 1).toFixed(2)}×</output><input type="range" data-k="brightness" min="0.6" max="1.6" step="0.05" value="${s.brightness ?? 1}" /></label>
      <label class="sm-field sm-slide">Volume (all) <output>${(s.volume ?? 1).toFixed(2)}×</output><input type="range" data-k="volume" min="0" max="1.5" step="0.05" value="${s.volume ?? 1}" /></label>
      ${[['effectsVol', 'Effects (steps, tools, fire)'], ['animalsVol', 'Animals and birds'], ['weatherVol', 'Rain and thunder'], ['ambienceVol', 'Surroundings (wind, water, sea)'], ['menuVol', 'Menus']].map(([k, label]) => `<label class="sm-field sm-slide sm-sub">${label} <output>${(s[k] ?? 1).toFixed(2)}×</output><input type="range" data-k="${k}" min="0" max="1.5" step="0.05" value="${s[k] ?? 1}" /></label>`).join('')}
      ${pick('Frame rate limit', [[0, 'None'], [30, '30'], [60, '60'], [120, '120']], s.fpsCap ?? 0)}
      <p class="sm-note">A limit saves battery and keeps a laptop cooler; with none, the game draws as fast as your screen and computer allow.</p>
      ${pick('Light rays', [['on', 'On'], ['off', 'Off']], s.rays === false ? 'off' : 'on')}
      ${pick('Difficulty', Object.entries(DIFFICULTIES).map(([id, d]) => [id, d.name]), s.difficulty ?? 'normal')}
      <p class="sm-note">Difficulty: how much harm things do you, how fast you grow hungry and thirsty, how far off the hunters notice you. Peaceful: nothing attacks.</p>
      <h3 class="sm-head" style="font-size:1rem;margin-top:12px">Controls</h3>
      <div class="sm-keys">${ACTIONS.map(([id, label]) => {
        // (Another control on the same key: both marked, and named.)
        const clash = [...ACTIONS.filter(([o]) => o !== id && keyOf(o) === keyOf(id)).map(([, l]) => l), ...FIXED_KEYS.filter(([code, l]) => code === keyOf(id) && !(id === 'inventory' && l === 'Inventory')).map(([, l]) => `${l} (fixed)`)];
        return `<div class="sm-key${clash.length ? ' sm-clash' : ''}"><span>${label}${clash.length ? `<em>Same key as: ${esc(clash.join(', '))}</em>` : ''}</span><button type="button" class="sm-q" data-key="${id}">${keyName(keyOf(id))}</button></div>`;
      }).join('')}</div>
      <p class="sm-note">Click a control, then press the key for it (Esc to leave it as it is). The mouse buttons stay as they are.</p>
      <button class="sm-btn" data-go="keys">Keys back to the defaults</button>
      <p class="sm-note">More view and grass look better but ask more of your computer. Grass changes show as the land round you is next built.</p>
      <button class="sm-btn" data-go="reset">Back to the defaults</button>
      <button class="sm-btn sm-primary" data-go="back">Done</button>`);
    const changed = () => {
      saveSettings(s);
      this.onSettings?.(s);
    };
    for (const input of card.querySelectorAll('input[type=range]')) {
      input.addEventListener('input', () => {
        const k = input.dataset.k, v = +input.value;
        s[k] = k === 'view' ? (v === preset ? null : v) : v;
        input.previousElementSibling.textContent = k === 'view' ? km(v) : k === 'farDetail' ? FAR_DETAIL[v] : k === 'fov' ? `${v}°` : `${v.toFixed(2)}×`;
        changed();
      });
    }
    for (const b of card.querySelectorAll('[data-set]')) {
      b.addEventListener('click', () => {
        const k = { Grass: 'grass', Shadows: 'shadows', 'Light rays': 'rays', Difficulty: 'difficulty', 'Frame rate limit': 'fpsCap' }[b.dataset.set];
        s[k] = k === 'grass' || k === 'fpsCap' ? +b.dataset.v : k === 'rays' ? b.dataset.v === 'on' : b.dataset.v;
        changed();
        this.settings(back);
      });
    }
    // (The graphics preset: put into effect when a world starts, see main's useQuality.)
    for (const b of card.querySelectorAll('.sm-gq')) {
      b.addEventListener('click', () => {
        setQuality(b.dataset.q);
        this.settings(back);
      });
    }
    // (A control put on another key: the next key pressed.)
    for (const b of card.querySelectorAll('[data-key]')) {
      b.addEventListener('click', () => {
        b.textContent = 'Press a key…';
        listenForKey((code) => {
          if (code) bind(b.dataset.key, code);
          this.settings(back);
        });
      });
    }
    this.#on('[data-go="keys"]', () => {
      resetKeys();
      this.settings(back);
    });
    this.#on('[data-go="reset"]', () => {
      Object.assign(s, DEFAULTS);
      changed();
      this.settings(back);
    });
    this.#on('[data-go="back"]', back);
  }

  // Your character: how you look (see character.js), with a picture of you as you choose.
  character(back) {
    const look = loadLook();
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    const NAMES = { skin: 'Skin', eyes: 'Eyes', marks: 'Marks', hairStyle: 'Hair', hair: 'Hair colour', beard: 'Beard', build: 'Build', height: 'Height', top: 'Wearing', shirt: 'Cloth', trousers: 'Trousers', boots: 'Boots', extra: 'Something more', accent: 'Its colour' };
    const TABS = [['Face', ['skin', 'eyes', 'marks']], ['Hair', ['hairStyle', 'hair', 'beard']], ['Body', ['build', 'height', 'skin']], ['Clothes', ['top', 'shirt', 'trousers', 'boots']], ['Extras', ['extra', 'accent']]];
    const nameOf = (k) => LOOK_CHOICES[k].find(([, v]) => v === look[k])?.[0] ?? 'Your own';
    const row = (k) => {
      const opts = LOOK_CHOICES[k], colour = LOOK_COLOURS.has(k);
      const items = opts.map(([label, v]) => colour
        ? `<button type="button" class="cc-sw" data-look="${k}" data-v="${v}" title="${label}" aria-label="${label}" style="--c:${hex(v)}"></button>`
        : `<button type="button" class="cc-chip" data-look="${k}" data-v="${v}">${label}</button>`).join('');
      const own = colour ? `<label class="cc-sw cc-own" title="Any colour"><input type="color" data-own="${k}" value="${hex(look[k])}" aria-label="${NAMES[k]}: any colour"></label>` : '';
      return `<div class="cc-row"><div class="cc-label">${NAMES[k]} <span data-name="${k}"></span></div><div class="cc-opts">${items}${own}</div></div>`;
    };
    const card = this.#show(`
      <h2 class="sm-head">Character</h2>
      <div class="cc">
        <div class="cc-stage">
          <canvas class="cc-view" aria-label="Your character; drag to turn"></canvas>
          <div class="cc-tools">
            <button type="button" class="cc-chip" data-cc="full">Whole</button>
            <button type="button" class="cc-chip" data-cc="face">Face</button>
            <button type="button" class="cc-chip" data-cc="dice">Surprise me</button>
          </div>
          <p class="cc-hint">Drag to turn</p>
        </div>
        <div class="cc-panel">
          <div class="cc-tabs" role="tablist">${TABS.map(([t], n) => `<button type="button" role="tab" class="cc-tab" data-tab="${n}">${t}</button>`).join('')}</div>
          ${TABS.map(([, keys], n) => `<div class="cc-page" data-page="${n}">${keys.map(row).join('')}</div>`).join('')}
        </div>
      </div>
      <p class="sm-note">A hard country, and it shows on those who live in it.</p>
      <div class="cc-foot">
        <button class="sm-btn" data-go="undo">Undo</button>
        <button class="sm-btn" data-go="reset">Default</button>
        <button class="sm-btn sm-primary" data-go="back">Done</button>
      </div>`);
    card.classList.add('sm-card-wide');
    const preview = (this.preview = characterPreview(card.querySelector('.cc-view'), look));
    const history = [];
    const refresh = () => {
      for (const b of card.querySelectorAll('[data-look]')) b.classList.toggle('cc-on', String(look[b.dataset.look]) === b.dataset.v);
      for (const i of card.querySelectorAll('[data-own]')) {
        const k = i.dataset.own, listed = LOOK_CHOICES[k].some(([, v]) => v === look[k]);
        i.parentElement.classList.toggle('cc-on', !listed);
        i.parentElement.style.setProperty('--c', hex(look[k]));
        if (!listed) i.value = hex(look[k]);
      }
      for (const n of card.querySelectorAll('[data-name]')) n.textContent = nameOf(n.dataset.name);
      card.querySelector('[data-go="undo"]').disabled = !history.length;
    };
    const change = (patch, remember = true) => {
      if (remember) history.push({ ...look });
      if (history.length > 50) history.shift();
      Object.assign(look, patch);
      saveLook({ ...look });
      preview.setLook(look);
      refresh();
    };
    for (const b of card.querySelectorAll('[data-look]')) {
      b.addEventListener('click', () => {
        const k = b.dataset.look;
        change({ [k]: LOOK_COLOURS.has(k) ? Number(b.dataset.v) : b.dataset.v });
      });
    }
    for (const i of card.querySelectorAll('[data-own]')) {
      // (While the picker is being dragged, the figure follows; one step to undo for the whole drag.)
      let started = false;
      i.addEventListener('input', () => {
        change({ [i.dataset.own]: Number.parseInt(i.value.slice(1), 16) }, !started);
        started = true;
      });
      i.addEventListener('change', () => (started = false));
    }
    const tab = (n) => {
      for (const t of card.querySelectorAll('.cc-tab')) t.classList.toggle('cc-on', t.dataset.tab === String(n)), t.setAttribute('aria-selected', t.dataset.tab === String(n));
      for (const p of card.querySelectorAll('.cc-page')) p.hidden = p.dataset.page !== String(n);
      view(n === 0 || n === 1 ? 'face' : 'full');
    };
    const view = (v) => {
      preview.setView(v);
      card.querySelector('[data-cc="face"]').classList.toggle('cc-on', v === 'face');
      card.querySelector('[data-cc="full"]').classList.toggle('cc-on', v === 'full');
    };
    for (const t of card.querySelectorAll('.cc-tab')) t.addEventListener('click', () => tab(Number(t.dataset.tab)));
    this.#on('[data-cc="face"]', () => view('face'));
    this.#on('[data-cc="full"]', () => view('full'));
    this.#on('[data-cc="dice"]', () => change(randomLook()));
    this.#on('[data-go="undo"]', () => history.length && change(history.pop(), false));
    this.#on('[data-go="reset"]', () => change({ ...LOOK_DEFAULT }));
    this.#on('[data-go="back"]', back);
    tab(0);
    refresh();
  }

  /** Out of a survival life that's over, back to the title (nothing saved). */
  leaveDead() {
    this.onQuit(this.world);
    this.world = null;
    this.pauseButton.hidden = true;
    this.title();
  }

  resume() {
    this.paused = false;
    this.preview?.dispose();
    this.preview = null;
    this.root.hidden = true;
  }
}
