import { CanvasTexture, Group, LinearFilter, Mesh, MeshLambertMaterial, Sprite, SpriteMaterial } from 'three';
import * as Models from '../wildlife/models.js';

// Playing together: a connection to a Facet Lands server (see
// server/server.mjs), a room of players in the same world. Every player
// builds the world from its seed; over the wire go only where each player
// is (about fifteen times a second) and the room's time of day.
//
// The others are drawn as low-poly walkers with their names over their
// heads, a moment behind (so their movement can be smoothed between the
// updates): walking, running (arms and legs swinging), crouching, swimming.

const SEND_EVERY = 1 / 15;
const DELAY = 0.15; // (how far behind the others are drawn, in seconds: smooth through a late update)
const FLAG = { crouch: 1, sprint: 2, swim: 4, fly: 8 };

/** A name over someone's head: a sprite with their name on a dark tag. */
function nameTag(name, colour) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 44px "Barlow Condensed", sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(name).width) + 40;
  c.width = w;
  c.height = 64;
  g.font = font;
  g.fillStyle = 'rgba(20, 22, 18, 0.72)';
  g.fillRect(0, 0, w, 64);
  g.fillStyle = colour;
  g.fillRect(0, 58, w, 6);
  g.fillStyle = '#f2ead8';
  g.textBaseline = 'middle';
  g.fillText(name, 20, 30);
  const tex = new CanvasTexture(c);
  tex.minFilter = LinearFilter;
  const sprite = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sprite.scale.set((w / 64) * 0.32, 0.32, 1);
  sprite.renderOrder = 10;
  return sprite;
}

class Remote {
  constructor(scene, { id, name, colour }) {
    this.id = id;
    this.name = name;
    this.colour = colour;
    this.snaps = []; // [{ at, s }]
    const parts = Models.person(Number.parseInt(colour.slice(1), 16));
    const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.root = new Group();
    this.body = new Mesh(parts.body, mat);
    this.head = new Mesh(parts.head, mat);
    this.arms = [new Mesh(parts.arm, mat), new Mesh(parts.arm, mat)];
    this.legs = [new Mesh(parts.leg, mat), new Mesh(parts.leg, mat)];
    this.body.position.y = 0.92;
    this.head.position.set(0, 0.5, 0.01);
    this.arms.forEach((a, k) => a.position.set(k ? -0.23 : 0.23, 0.46, 0));
    this.legs.forEach((l, k) => l.position.set(k ? -0.09 : 0.09, -0.04, 0));
    this.body.add(this.head, ...this.arms, ...this.legs);
    this.root.add(this.body);
    for (const m of [this.body, this.head, ...this.arms, ...this.legs]) (m.castShadow = true), (m.receiveShadow = true);
    this.tag = nameTag(name, colour);
    this.tag.position.y = 2.15;
    this.root.add(this.tag);
    this.root.visible = false;
    this.walk = 0;
    scene.add(this.root);
  }

  push(s, at) {
    this.snaps.push({ at, s });
    if (this.snaps.length > 30) this.snaps.shift();
  }

  // Drawn where they were DELAY ago, between the two updates either side.
  update(dt, now) {
    const t = now - DELAY, S = this.snaps;
    if (!S.length) return;
    let a = S[0], b = S[0];
    for (let k = 0; k < S.length; k++) {
      if (S[k].at <= t) a = S[k];
      if (S[k].at >= t) {
        b = S[k];
        break;
      }
      b = S[k];
    }
    const u = b.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at))) : 1;
    const lerp = (i) => a.s[i] + (b.s[i] - a.s[i]) * u;
    let dyaw = b.s[3] - a.s[3];
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const x = lerp(0), y = lerp(1), z = lerp(2), yaw = a.s[3] + dyaw * u, pitch = lerp(4), flags = b.s[5];
    // (How fast they're going, for the swing of their arms and legs.)
    const span = Math.max(1e-3, b.at - a.at);
    const speed = b === a ? 0 : Math.hypot(b.s[0] - a.s[0], b.s[2] - a.s[2]) / span;
    this.root.visible = true;
    this.root.position.set(x, y, z);
    (this.yaw = yaw), (this.speed = speed), (this.flags = flags); // (for the animals: see WorldSync.others)
    this.root.rotation.y = yaw + Math.PI; // (the camera looks down -z; the model faces +z)
    const crouch = flags & FLAG.crouch, swim = flags & FLAG.swim;
    this.walk += dt * Math.min(9, speed * 1.6);
    const swing = Math.min(1, speed / 4) * (swim ? 0.4 : 0.7);
    const legSwing = Math.sin(this.walk) * swing;
    this.legs[0].rotation.x = legSwing;
    this.legs[1].rotation.x = -legSwing;
    this.arms[0].rotation.x = swim ? -2.6 + Math.sin(this.walk) * 0.5 : -legSwing * 0.9;
    this.arms[1].rotation.x = swim ? -2.6 - Math.sin(this.walk) * 0.5 : legSwing * 0.9;
    this.body.position.y = crouch ? 0.62 : swim ? 0.4 : 0.92 + Math.abs(Math.sin(this.walk)) * 0.04 * Math.min(1, speed / 3);
    this.body.rotation.x = swim ? 1.2 : crouch ? 0.35 : Math.min(0.25, speed * 0.03);
    this.head.rotation.x = Math.max(-0.8, Math.min(0.8, -pitch - this.body.rotation.x * (swim ? 0.9 : 0.5)));
    this.tag.position.y = crouch ? 1.75 : swim ? 1.0 : 2.15;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

/** The game's own server, online for everyone (see server/README.md: it runs on Render). */
export const DEFAULT_SERVER = 'wss://facet-lands-server.onrender.com';

/**
 * A server address as typed, made into one to connect to: "ws://" or
 * "wss://" put on the front if it's missing ("https://" becomes "wss://",
 * "http://" "ws://"; your own computer, ws://, anywhere else, wss://), and
 * no trailing slash. Throws, with a helpful message, if it can't be one
 * (a world code typed in the wrong box, say).
 */
export function serverAddress(typed) {
  let a = String(typed ?? '').trim().replace(/\/+$/, '');
  if (!a) throw new Error('Put in the server address first.');
  if (/^[A-Z0-9]{6}$/i.test(a) && !/^(localhost|[\d.]+)$/i.test(a)) throw new Error("That looks like a world code: it goes in the World code box (or pick the world from the list). The server's address is something like ws://localhost:8787.");
  if (/^https:\/\//i.test(a)) a = 'wss://' + a.slice(8);
  else if (/^http:\/\//i.test(a)) a = 'ws://' + a.slice(7);
  else if (!/^wss?:\/\//i.test(a)) a = (/^(localhost|127\.|192\.168\.|10\.|\[?::1)/i.test(a) ? 'ws://' : 'wss://') + a;
  return a;
}

/** The worlds open on a server: [{ code, name, mode, players }] (see server.mjs, GET /worlds). */
export async function openWorlds(typed) {
  const url = serverAddress(typed).replace(/^ws/i, 'http') + '/worlds';
  // (A free server asleep takes up to a minute to wake: so it's waited for.)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 75000);
  const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal }).catch(() => null);
  clearTimeout(timer);
  if (!res?.ok) throw new Error("Couldn't reach the server. Check you're online, then Refresh.");
  return res.json();
}

export class Multiplayer {
  constructor(scene) {
    this.scene = scene;
    this.ws = null;
    this.id = null;
    this.code = null;
    this.others = new Map();
    this.sendWait = 0;
    this.onChange = null; // (called when someone comes or goes)
    this.onHour = null; // (the host set the time: (hour) => …)
    this.onWorld = null; // (the world's own news: edits, the sky, the animals, sounds: (msg) => …; see WorldSync)
    this.hostId = null;
    this.clockAt = 0; // (the room's clock, in seconds, at clockFrom: see roomTime)
    this.clockFrom = 0;
  }

  /** Whether you're the one running the sky and the animals (or playing alone). */
  get isHost() {
    return !this.connected || this.hostId === this.id;
  }

  /** The room's shared clock, seconds since it opened (null when not online). */
  roomTime() {
    return this.connected ? this.clockAt + performance.now() / 1000 - this.clockFrom : null;
  }

  /** Sends a message to the room (if you're in one). */
  send(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg));
  }

  get connected() {
    return this.ws?.readyState === 1 && this.id !== null;
  }

  get count() {
    return this.others.size + (this.connected ? 1 : 0);
  }

  /**
   * Opens a room for a world (`world` { name, seed, mode }), or joins one by
   * its code. Resolves with the welcome: { code, world, hour, dayLength }.
   */
  host(url, name, world, hour, dayLength) {
    return this.#open(url, { t: 'host', name, world, hour, dayLength });
  }

  join(url, code, name) {
    return this.#open(url, { t: 'join', code, name });
  }

  async #open(typed, hello) {
    this.leave();
    const url = serverAddress(typed); // (throws, with the reason, if it can't be one)
    // (A connection dropped before the server answers, as happens with a
    // free server waking up or a busy page: tried again, a couple of times.)
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#connect(url, hello);
      } catch (e) {
        if (!e.retry || attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  #connect(url, hello) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        return reject(new Error("That isn't a server address (it starts wss:// or ws://)."));
      }
      this.ws = ws;
      let done = false;
      const fail = (message, retry = false) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        ws.close();
        reject(Object.assign(new Error(message), { retry }));
      };
      // (A server asleep, a free one, can take a while to wake: and the page
      // may be busy building the world meanwhile.)
      let timer = setTimeout(() => fail("Couldn't reach the server."), 60000);
      ws.onopen = () => {
        clearTimeout(timer);
        timer = setTimeout(() => fail("The server didn't answer.", true), 30000);
        ws.send(JSON.stringify(hello));
      };
      ws.onerror = () => fail("Couldn't reach the server.", true);
      ws.onclose = () => {
        if (this.ws === ws) this.#reset();
        fail('Lost the connection to the server.', true); // (before it answered: see #open)
      };
      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.t === 'welcome') {
          clearTimeout(timer);
          done = true;
          this.id = msg.id;
          this.code = msg.code;
          this.welcomedAt = performance.now() / 1000;
          this.hourAtWelcome = msg.hour;
          this.dayLength = msg.dayLength;
          this.hostId = msg.host ?? msg.id;
          this.clockAt = (msg.time ?? 0) / 1000;
          this.clockFrom = performance.now() / 1000;
          this.welcome = msg;
          for (const p of msg.players) this.#add(p);
          this.onChange?.();
          resolve(msg);
        } else if (msg.t === 'error') {
          if (this.id === null) fail(msg.message);
        } else this.#receive(msg);
      };
    });
  }

  #add(p) {
    if (this.others.has(p.id)) return;
    const r = new Remote(this.scene, p);
    if (p.s) r.push(p.s, performance.now() / 1000);
    this.others.set(p.id, r);
  }

  #receive(msg) {
    const now = performance.now() / 1000;
    if (msg.t === 'states') {
      for (const [id, s] of msg.list) this.others.get(id)?.push(s, now);
    } else if (msg.t === 'joined') {
      this.#add(msg);
      this.onChange?.();
    } else if (msg.t === 'left') {
      this.others.get(msg.id)?.dispose(this.scene);
      this.others.delete(msg.id);
      this.onChange?.();
    } else if (msg.t === 'hour') {
      this.onHour?.(msg.hour);
    } else if (msg.t === 'host') {
      this.hostId = msg.id;
      this.onChange?.();
    } else this.onWorld?.(msg);
  }

  /** Tells the room you've set the time (the host only: the others follow). */
  setHour(hour) {
    if (this.connected) this.ws.send(JSON.stringify({ t: 'hour', hour }));
  }

  /**
   * Call every frame: sends where you are (`me`: { x, y (your feet), z,
   * yaw, pitch, crouch, sprint, swim, fly }), and moves the others along.
   */
  update(dt, me) {
    const now = performance.now() / 1000;
    for (const r of this.others.values()) r.update(dt, now);
    if (!this.connected) return;
    this.sendWait -= dt;
    if (this.sendWait > 0) return;
    this.sendWait = SEND_EVERY;
    const flags = (me.crouch ? FLAG.crouch : 0) | (me.sprint ? FLAG.sprint : 0) | (me.swim ? FLAG.swim : 0) | (me.fly ? FLAG.fly : 0);
    this.ws.send(JSON.stringify({ t: 'state', s: [me.x, me.y, me.z, me.yaw, me.pitch, flags] }));
  }

  #reset() {
    for (const r of this.others.values()) r.dispose(this.scene);
    this.others.clear();
    const was = this.id !== null;
    this.id = null;
    this.code = null;
    this.ws = null;
    this.hostId = null;
    this.welcome = null;
    if (was) this.onChange?.();
  }

  leave() {
    const ws = this.ws;
    this.#reset();
    ws?.close();
  }
}
