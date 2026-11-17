import { DIFFICULTIES, difficulty } from '../settings.js';
import { keyName, keyOf } from '../keys.js';

/**
 * Playing together: talking (Enter, then type), the list of who's here (the
 * ` key: names, how well each is connected, how far off), the host's say over
 * the room (removing a player, the difficulty, the time of day), and the night
 * slept through only once everyone's in bed.
 *
 * All of it passed round as the room's 'fx' news (see WorldSync), which every
 * server passes on, so it works with the server as it is; a removal is also
 * asked of the server itself, where it knows how (see server.mjs, 'kick').
 */
export class Social {
  /**
   * @param o { mp (Multiplayer), sound, hotbar (for a line on screen),
   *            setHour(h) (the host's: the time set), onKicked() }
   */
  constructor(o) {
    Object.assign(this, o);
    this.inBed = new Set(); // (the ids of those in bed, yours too)
    this.morningDays = null;
    this.log = [];
    this.#build();
  }

  #build() {
    const el = (this.root = document.createElement('div'));
    el.className = 'social';
    el.innerHTML = `
      <ol class="chat-log" aria-live="polite"></ol>
      <form class="chat-form" hidden><input type="text" maxlength="160" placeholder="Say something · Enter to send · Esc to stop" autocomplete="off" spellcheck="false" /></form>
      <section class="player-list" hidden aria-label="Players online">
        <header><h2>Players</h2><p></p></header>
        <ol></ol>
        <div class="host-tools" hidden>
          <h3>Host</h3>
          <div class="ht-row"><span>Difficulty</span>${Object.entries(DIFFICULTIES).map(([id, d]) => `<button type="button" data-diff="${id}">${d.name}</button>`).join('')}</div>
          <div class="ht-row"><span>Time</span>${[['Dawn', 6], ['Noon', 12], ['Dusk', 18.5], ['Night', 22]].map(([n, h]) => `<button type="button" data-hour="${h}">${n}</button>`).join('')}</div>
        </div>
      </section>`;
    document.body.append(el);
    this.logEl = el.querySelector('.chat-log');
    this.form = el.querySelector('.chat-form');
    this.input = this.form.querySelector('input');
    this.list = el.querySelector('.player-list');
    // Typing: the keys yours, not the game's (nothing else hears them).
    for (const type of ['keydown', 'keyup', 'keypress']) this.input.addEventListener(type, (e) => e.stopPropagation());
    this.input.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.closeChat();
      }
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim().slice(0, 160);
      if (text) this.#say(text);
      this.closeChat();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.mp.connected || e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.code === keyOf('chat') && this.form.hidden && !document.querySelector('.start-menu:not([hidden])')) {
        e.preventDefault();
        this.openChat();
      } else if (e.code === keyOf('players')) {
        e.preventDefault();
        this.toggleList();
      }
    });
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !this.mp.isHost) return;
      if (b.dataset.kick) this.#kick(Number(b.dataset.kick));
      else if (b.dataset.diff) this.#setDifficulty(b.dataset.diff, true);
      else if (b.dataset.hour) {
        this.setHour(Number(b.dataset.hour));
        this.mp.setHour(Number(b.dataset.hour));
        this.#note(`You set the time to ${b.textContent.toLowerCase()}`);
      }
    });
  }

  // --- Talking ------------------------------------------------------------------------

  openChat() {
    this.wasLocked = !!document.pointerLockElement;
    if (this.wasLocked) document.exitPointerLock();
    this.form.hidden = false;
    this.root.classList.add('chatting');
    this.input.value = '';
    setTimeout(() => this.input.focus(), 0);
  }

  closeChat() {
    this.form.hidden = true;
    this.root.classList.remove('chatting');
    this.input.blur();
    // (Back into the game: the mouse taken again if it was.)
    if (this.wasLocked) this.relock?.();
  }

  #say(text) {
    this.#send({ a: 'chat', text });
    this.#line(this.myName?.() ?? 'You', text, this.myColour?.() ?? '#c8965a', true);
  }

  #line(name, text, colour, mine = false) {
    const li = document.createElement('li');
    if (mine) li.className = 'mine';
    const who = document.createElement('b');
    who.textContent = name;
    who.style.color = colour;
    li.append(who, document.createTextNode(` ${text}`));
    this.logEl.append(li);
    while (this.logEl.children.length > 40) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
    // (Each line fades after a while, unless the chat's open.)
    setTimeout(() => li.classList.add('old'), 12000);
    if (!mine) this.sound?.ui?.('click');
  }

  /** A line from the game itself, in the chat (someone came, the host did something). */
  #note(text) {
    const li = document.createElement('li');
    li.className = 'note';
    li.textContent = text;
    this.logEl.append(li);
    setTimeout(() => li.classList.add('old'), 9000);
  }

  // --- Who's here -----------------------------------------------------------------------

  toggleList(show = this.list.hidden) {
    this.list.hidden = !show;
    if (show) this.#renderList();
  }

  #renderList() {
    const mp = this.mp, me = this.where?.();
    this.list.querySelector('header p').textContent = `${mp.count} in ${mp.code ?? ''} · ${keyName(keyOf('players'))} to close`;
    const rows = [{ id: mp.id, name: `${this.myName?.() ?? 'You'} (you)`, colour: this.myColour?.() ?? '#c8965a', quality: 3, dist: null }];
    const now = performance.now() / 1000;
    for (const [id, r] of mp.others) {
      const last = r.snaps.at(-1)?.at ?? 0, gap = now - last;
      // (How well they're getting through: by how lately and how steadily their news has come.)
      const quality = gap < 0.35 ? 3 : gap < 1 ? 2 : gap < 4 ? 1 : 0;
      const s = r.snaps.at(-1)?.s;
      const dist = s && me ? Math.hypot(s[0] - me.x, s[2] - me.z) : null;
      rows.push({ id, name: r.name, colour: r.colour, quality, dist });
    }
    this.list.querySelector('ol').innerHTML = rows.map((p) => {
      const host = p.id === mp.hostId ? ' <em title="The host">★ host</em>' : '';
      const bed = this.inBed.has(p.id) ? ' <em title="In bed">☾</em>' : '';
      const bars = [1, 2, 3].map((k) => `<i class="${k <= p.quality ? 'on' : ''}"></i>`).join('');
      const far = p.dist === null ? '' : p.dist < 1000 ? `${Math.round(p.dist)} m` : `${(p.dist / 1000).toFixed(1)} km`;
      const kick = mp.isHost && p.id !== mp.id ? `<button type="button" data-kick="${p.id}" title="Remove from this world">Remove</button>` : '';
      return `<li><span class="pl-dot" style="background:${p.colour}"></span><b>${esc(p.name)}</b>${host}${bed}<span class="pl-far">${far}</span><span class="pl-bars" title="Connection">${bars}</span>${kick}</li>`;
    }).join('');
    this.list.querySelector('.host-tools').hidden = !mp.isHost;
    for (const b of this.list.querySelectorAll('[data-diff]')) b.classList.toggle('on', DIFFICULTIES[b.dataset.diff]?.name === difficulty.name);
  }

  // --- The host's say ----------------------------------------------------------------------

  #kick(id) {
    const r = this.mp.others.get(id);
    if (!r) return;
    this.#send({ a: 'kick', id });
    this.mp.send({ t: 'kick', id }); // (a server that knows how shuts them out itself)
    this.#note(`You removed ${r.name}`);
  }

  #setDifficulty(id, mine) {
    const d = DIFFICULTIES[id];
    if (!d) return;
    Object.assign(difficulty, { peaceful: false }, d);
    this.roomDifficulty = id;
    if (mine) {
      this.#send({ a: 'difficulty', id });
      this.#note(`You set the difficulty to ${d.name}`);
    } else this.#note(`The host set the difficulty to ${d.name}`);
    if (!this.list.hidden) this.#renderList();
  }

  // --- Sleeping together ----------------------------------------------------------------------

  /** You're in bed, or up again. */
  bed(on) {
    if (on) this.inBed.add(this.mp.id);
    else this.inBed.delete(this.mp.id);
    this.morningDays = null;
    if (this.mp.connected) this.#send({ a: 'bed', on });
  }

  /** Whether everyone's in bed: { all, inBed, of }. */
  ready() {
    if (!this.mp.connected) return { all: true, inBed: 1, of: 1 };
    const ids = [this.mp.id, ...this.mp.others.keys()];
    const n = ids.filter((id) => this.inBed.has(id)).length;
    return { all: n >= ids.length, inBed: n, of: ids.length };
  }

  /** The host: the night's over, for everyone in bed. */
  morning(days) {
    this.#send({ a: 'morning', days });
  }

  /** A guest: the host's morning come (the days it took), or null. */
  takeMorning() {
    const d = this.morningDays;
    this.morningDays = null;
    return d;
  }

  // --- The room's news ----------------------------------------------------------------------

  #send(f) {
    this.mp.send({ t: 'fx', fx: [{ k: 'social', ...f }] });
  }

  /** News from another player (see WorldSync: their 'social' fx). */
  receive(f, from) {
    const r = this.mp.others.get(from);
    if (f.a === 'chat' && typeof f.text === 'string') this.#line(r?.name ?? 'Someone', f.text.slice(0, 160), r?.colour ?? '#ccc');
    else if (f.a === 'bed') {
      if (f.on) this.inBed.add(from);
      else this.inBed.delete(from);
    } else if (f.a === 'morning' && from === this.mp.hostId) this.morningDays = Number(f.days) || 0.3;
    else if (f.a === 'difficulty' && from === this.mp.hostId) this.#setDifficulty(f.id, false);
    else if (f.a === 'kick' && from === this.mp.hostId && f.id === this.mp.id) this.onKicked?.();
    else if (f.a === 'room' && from === this.mp.hostId && f.difficulty && f.difficulty !== this.roomDifficulty) this.#setDifficulty(f.difficulty, false);
    if (!this.list.hidden) this.#renderList();
  }

  /** Someone came or went (see Multiplayer.onChange). */
  changed(joined = null, left = null) {
    if (left !== null) this.inBed.delete(left);
    if (joined) this.#note(`${joined} joined`);
    // (The host tells whoever came how the room's set.)
    if (this.mp.connected && this.mp.isHost && this.roomDifficulty) this.#send({ a: 'room', difficulty: this.roomDifficulty });
    if (!this.mp.connected) (this.inBed.clear(), this.toggleList(false), this.closeChat());
    else if (!this.list.hidden) this.#renderList();
  }

  update(dt) {
    if ((this.listWait = (this.listWait ?? 0) - dt) <= 0) {
      this.listWait = 0.5;
      if (!this.list.hidden && this.mp.connected) this.#renderList();
    }
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
