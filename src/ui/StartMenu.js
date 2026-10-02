// The title screen: Start, then make a new world (name, seed, and how to
// play it: creative, survival or testing) or carry on with a saved one;
// and the pause menu in play (save, quit to the title). Saved worlds are
// listed in this browser's storage (see WORLDS_KEY); a testing world is
// never saved.

import { QUALITY, quality, setQuality } from '../quality.js';

const WORLDS_KEY = 'facet-lands:worlds';

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
    this.card.innerHTML = html;
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
      <div class="sm-quality" role="radiogroup" aria-label="Graphics">
        <span>Graphics</span>
        ${Object.entries(QUALITY).map(([id, q]) => `<button type="button" class="sm-q${id === quality() ? ' sm-picked' : ''}" data-q="${id}" role="radio" aria-checked="${id === quality()}" title="${q.blurb}">${q.name}</button>`).join('')}
      </div>
      <p class="sm-qnote">${QUALITY[quality()].blurb}</p>
      <a class="sm-credits" href="sounds/CREDITS.md" target="_blank" rel="noopener">Sound credits</a>`);
    this.#on('[data-go="start"]', () => this.choose());
    // (Put into effect when a world starts: see main's useQuality.)
    for (const b of this.card.querySelectorAll('.sm-q')) {
      b.addEventListener('click', () => {
        setQuality(b.dataset.q);
        this.title();
      });
    }
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
  // then open a world of your own to others, or join one by its code.
  online(note = '') {
    const remembered = (k) => {
      try {
        return localStorage.getItem(`facet-lands:${k}`) ?? '';
      } catch {
        return '';
      }
    };
    const esc = (v) => String(v).replace(/[&"<]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;' })[c]);
    const card = this.#show(`
      <h2 class="sm-head">Play online</h2>
      <label class="sm-field">Server<input id="sm-server" type="text" maxlength="200" placeholder="wss://your-server.onrender.com" value="${esc(remembered('server'))}" /></label>
      <label class="sm-field">Your name<input id="sm-player" type="text" maxlength="24" value="${esc(remembered('name') || 'Wanderer')}" /></label>
      <button class="sm-btn sm-primary" data-go="host">Host a new world</button>
      <div class="sm-join">
        <label class="sm-field">World code<input id="sm-code" type="text" maxlength="6" placeholder="ABC123" autocomplete="off" /></label>
        <button class="sm-btn" data-go="join">Join</button>
      </div>
      <p class="sm-note" aria-live="polite">${esc(note)}</p>
      <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
    const read = () => {
      const url = card.querySelector('#sm-server').value.trim(), name = card.querySelector('#sm-player').value.trim() || 'Wanderer';
      try {
        localStorage.setItem('facet-lands:server', url);
        localStorage.setItem('facet-lands:name', name);
      } catch {
        // (Not remembered, then.)
      }
      if (!url) card.querySelector('.sm-note').textContent = 'Put in the server address first.';
      return url ? { url, name } : null;
    };
    this.#on('[data-go="host"]', () => {
      const who = read();
      if (who) this.create(who);
    });
    this.#on('[data-go="join"]', () => {
      const who = read();
      const code = card.querySelector('#sm-code').value.trim().toUpperCase();
      if (!who) return;
      if (!code) return (card.querySelector('.sm-note').textContent = 'Put in the code of the world to join.');
      card.querySelector('.sm-note').textContent = 'Joining…';
      this.onJoin({ ...who, code })
        .then((world) => this.#play(world))
        .catch((e) => this.online(e.message));
    });
    this.#on('[data-go="back"]', () => this.choose());
  }

  create(online = null) {
    const seed = Math.random().toString(36).slice(2, 8);
    const card = this.#show(`
      <h2 class="sm-head">${online ? 'New world, online' : 'New world'}</h2>
      <label class="sm-field">World name<input id="sm-name" type="text" maxlength="40" value="My world" /></label>
      <label class="sm-field">Seed<input id="sm-seed" type="text" maxlength="24" value="${seed}" /></label>
      <div class="sm-modes" role="radiogroup" aria-label="Game mode">
        ${Object.entries(MODES).filter(([id]) => !online || id !== 'testing').map(([id, m], i) => `
          <button type="button" class="sm-mode${i === 0 ? ' sm-picked' : ''}" data-mode="${id}" role="radio" aria-checked="${i === 0}">
            <strong>${m.name}</strong><span>${m.blurb}</span>
          </button>`).join('')}
      </div>
      <button class="sm-btn sm-primary" data-go="play">${online ? 'Create and open to others' : 'Create world'}</button>
      <p class="sm-note" aria-live="polite"></p>
      <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
    let mode = 'survival';
    for (const b of card.querySelectorAll('.sm-mode')) {
      b.addEventListener('click', () => {
        mode = b.dataset.mode;
        for (const o of card.querySelectorAll('.sm-mode')) {
          o.classList.toggle('sm-picked', o === b);
          o.setAttribute('aria-checked', o === b);
        }
      });
    }
    this.#on('[data-go="play"]', () => {
      const name = card.querySelector('#sm-name').value.trim() || 'My world';
      const s = card.querySelector('#sm-seed').value.trim() || seed;
      const world = { id: `w${Date.now().toString(36)}`, name, seed: s, mode, created: Date.now() };
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
      if (mode !== 'testing') rememberWorld(world);
      this.#play(world);
    });
    this.#on('[data-go="back"]', () => (online ? this.online() : this.choose()));
  }

  load() {
    const list = savedWorlds();
    const when = (t) => (t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
    const card = this.#show(`
      <h2 class="sm-head">Saved worlds</h2>
      <ul class="sm-worlds">
        ${list.map((w) => `
          <li>
            <button type="button" class="sm-world" data-id="${w.id}">
              <strong>${w.name.replace(/</g, '&lt;')}</strong>
              <span>${MODES[w.mode]?.name ?? w.mode} · seed ${String(w.seed).replace(/</g, '&lt;')} · ${when(w.played)}</span>
            </button>
            <button type="button" class="sm-delete" data-del="${w.id}" title="Delete this world">✕</button>
          </li>`).join('') || '<li class="sm-none">No saved worlds yet.</li>'}
      </ul>
      <button class="sm-btn sm-ghost" data-go="back">Back</button>`);
    for (const b of card.querySelectorAll('.sm-world')) b.addEventListener('click', () => this.#play(list.find((w) => w.id === b.dataset.id)));
    for (const b of card.querySelectorAll('.sm-delete')) {
      b.addEventListener('click', () => {
        if (b.dataset.confirm) {
          forgetWorld(b.dataset.del);
          this.load();
        } else {
          b.dataset.confirm = '1';
          b.textContent = 'Delete?';
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
      <button class="sm-btn" data-go="quit">${testing ? 'Quit to title' : 'Save and quit to title'}</button>
      <p class="sm-note" aria-live="polite"></p>`);
    this.#on('[data-go="resume"]', () => this.resume());
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

  resume() {
    this.paused = false;
    this.root.hidden = true;
  }
}
