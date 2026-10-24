import { CanvasTexture, Group, LinearFilter, Matrix4, Mesh, MeshLambertMaterial, Sprite, SpriteMaterial, Vector3 } from 'three';
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
// (Also in the flags, above those: what you're doing with what's in your
// hand (bits 4-6, one of ACTS; bit 7 flips with each new one), what that
// is (bits 8-15: its place in the list of items, 0 nothing) and how far a
// bow's drawn (bits 16-19, 0..15).)
const ACTS = [null, 'chop', 'throw', 'thrust', 'cast', 'kick', 'use', 'loose'];
// (And, bits 24-26, an emote (one of EMOTES), bit 27 flipping with each new one.)
export const EMOTES = [null, 'wave', 'cheer', 'point', 'bow', 'sit', 'shrug'];
const EMOTE_TIME = { wave: 2.4, cheer: 1.8, point: 2.4, bow: 1.6, sit: Infinity, shrug: 1.3 };
const ACT_TIME = { chop: 0.62, throw: 0.5, thrust: 0.4, cast: 0.5, kick: 0.3, use: 0.35, loose: 0.25 };
// (A hand's frame, as Game holds things in yours: forward -z, up +y; on an
// arm, when it's held out in front, its forward is down the arm, its up is
// the arm's +z.)
const HAND = new Matrix4().makeBasis(new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 0));

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

/** What you're doing, packed for the others (and for your own figure, seen from behind: see main's third person). */
export function packFlags(me, items) {
  let flags = (me.crouch ? FLAG.crouch : 0) | (me.sprint ? FLAG.sprint : 0) | (me.swim ? FLAG.swim : 0) | (me.fly ? FLAG.fly : 0);
  // (What's in your hand and what you're doing with it: see ACTS.)
  const p = me.pose;
  if (p && items) {
    const act = Math.max(0, ACTS.indexOf(p.act));
    flags |= (act << 4) | ((p.n & 1) << 7) | ((items.ids.indexOf(p.held) + 1) << 8) | (Math.round(p.draw * 15) << 20);
  }
  if (p?.emote) flags |= (Math.max(0, EMOTES.indexOf(p.emote.kind)) << 24) | ((p.emote.n & 1) << 27);
  return flags;
}

export class Remote {
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
    // (Arms and legs that bend: the forearm on the upper arm at the elbow,
    // the shin on the thigh at the knee.)
    this.arms = [new Mesh(parts.upperArm, mat), new Mesh(parts.upperArm, mat)];
    this.legs = [new Mesh(parts.thigh, mat), new Mesh(parts.thigh, mat)];
    this.forearms = this.arms.map((arm) => {
      const f = new Mesh(parts.forearm, mat);
      f.position.y = -0.32;
      arm.add(f);
      return f;
    });
    this.shins = this.legs.map((leg) => {
      const s = new Mesh(parts.shin, mat);
      s.position.y = -0.44;
      leg.add(s);
      return s;
    });
    this.body.position.y = 0.92;
    this.head.position.set(0, 0.5, 0.01);
    this.arms.forEach((a, k) => a.position.set(k ? -0.23 : 0.23, 0.46, 0));
    this.legs.forEach((l, k) => l.position.set(k ? -0.09 : 0.09, -0.04, 0));
    this.body.add(this.head, ...this.arms, ...this.legs);
    this.root.add(this.body);
    // (Their hands, to hold what they're holding.)
    this.hands = this.forearms.map((arm) => {
      const g = new Group();
      g.position.set(0, -0.3, 0.03);
      g.quaternion.setFromRotationMatrix(HAND);
      arm.add(g);
      return g;
    });
    // (The way they're carrying themselves, eased from one to the next: see #gait.)
    this.gait = { lean: 0, swim: 0, run: 0, move: 0, y: 0.92, roll: 0 };
    this.heldIndex = 0;
    this.actKey = 0;
    this.act = null;
    for (const m of [this.body, this.head, ...this.arms, ...this.legs, ...this.forearms, ...this.shins]) (m.castShadow = true), (m.receiveShadow = true);
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
  update(dt, now, items) {
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
    const speed = this.speedOverride ?? (b === a ? 0 : Math.hypot(b.s[0] - a.s[0], b.s[2] - a.s[2]) / span); // (your own figure: told how fast you go)
    this.root.visible = true;
    this.root.position.set(x, y, z);
    (this.yaw = yaw), (this.speed = speed), (this.flags = flags); // (for the animals: see WorldSync.others)
    this.root.rotation.y = yaw + Math.PI; // (the camera looks down -z; the model faces +z)
    const crouch = flags & FLAG.crouch, swim = flags & FLAG.swim;
    this.#gait(dt, speed, pitch, !!crouch, !!swim, !!(flags & FLAG.sprint), y);
    this.#hands(dt, flags, pitch, swim, items);
    this.#emote(dt, flags, speed, swim);
  }

  /**
   * Walking, running, swimming, treading water: the stride and its rhythm
   * from how fast they're going (longer strides, quicker, the faster), each
   * leg swinging from the hip and the knee folding as it comes through, the
   * body rising and falling and swaying over each step, the arms swinging
   * against the legs (bent at the elbow, pumping, at a run, leaning into
   * it). In the water: a crawl, the arms over in turn, the body rolling to
   * each stroke, the legs kicking; still, upright, treading water.
   */
  #gait(dt, speed, pitch, crouch, swim, sprint, y) {
    const g = this.gait, ease = (k) => 1 - Math.exp(-dt * k);
    const run = !swim && !crouch && (sprint || speed > 4.2) && speed > 1.5 ? 1 : 0;
    const move = Math.min(1, speed / (swim ? 0.8 : 1.2));
    g.run += (run - g.run) * ease(5);
    g.swim += ((swim ? 1 : 0) - g.swim) * ease(4);
    g.move += (move - g.move) * ease(6);
    // (One stride, both feet, is longer the faster you go: about 1.4 m at a stroll, near 3 m at a run.)
    const stride = swim ? 1.6 : Math.min(3.2, 1.25 + 0.3 * speed);
    this.walk += dt * (speed > 0.05 ? (Math.PI * 2 * speed) / stride : 0) + dt * (swim ? 1.6 * (1 - g.move) : 0);
    const p = this.walk, s = Math.sin(p), c = Math.cos(p), R = g.run, M = g.move, W = 1 - g.swim;
    const [lt, rt] = this.legs, [ls, rs] = this.shins, [la, ra] = this.arms, [lf, rf] = this.forearms;
    for (const a of this.arms) (a.rotation.z = 0), (a.position.y = 0.46), (a.position.z = 0);
    // On land: thigh forward and back from the hip (positive: back).
    const reach = (0.42 + 0.48 * R) * M;
    const leg = (side) => {
      const ph = side ? p + Math.PI : p, sw = Math.sin(ph), back = Math.cos(ph);
      // (The knee folds as the leg comes through, under the body; more at a run, the heel kicked up.)
      const fold = Math.max(0, -back) * (0.55 + 1.15 * R) * M + Math.max(0, sw) * 0.25 * R * M;
      return [sw * reach, 0.06 + fold];
    };
    const [l0, k0] = leg(0), [l1, k1] = leg(1);
    // In the water: a flutter kick, small and quick from the hip, the knees a little bent.
    const kick = Math.sin(this.walk * 3.2) * (0.18 + 0.12 * M), tread = (1 - M) * 0.5;
    lt.rotation.x = l0 * W + (kick - tread * Math.sin(this.walk * 2)) * g.swim;
    rt.rotation.x = l1 * W + (-kick + tread * Math.sin(this.walk * 2)) * g.swim;
    ls.rotation.x = k0 * W + (0.25 + 0.2 * Math.max(0, kick) + tread * 0.8) * g.swim;
    rs.rotation.x = k1 * W + (0.25 + 0.2 * Math.max(0, -kick) + tread * 0.8) * g.swim;
    lt.rotation.z = rt.rotation.z = 0;
    lt.rotation.z = -0.25 * tread * g.swim;
    rt.rotation.z = 0.25 * tread * g.swim;
    // The arms: against the legs on land; at a run pumping, bent near square at the elbow.
    const armSwing = (0.38 + 0.5 * R) * M;
    const landL = -s * armSwing - 0.05, landR = s * armSwing - 0.05;
    const elbow = -(0.18 + 0.12 * M + 1.15 * R);
    // A crawl: each arm right over, in turn, reaching ahead and pulling down and back (elbow bent coming over).
    const stroke = (ph) => {
      const a = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      // (0: back at the hip; up out over the water, elbow bent; on ahead; and the pull down under the body.)
      return [a, a < Math.PI ? -0.9 * Math.sin(a) : -0.15];
    };
    const [sl, el] = stroke(p), [sr, er] = stroke(p + Math.PI);
    // Treading water: arms out to the sides, sculling to and fro.
    const scull = Math.sin(this.walk * 2.4) * 0.35;
    const wl = M * sl + (1 - M) * (-0.5 + scull), wr = M * sr + (1 - M) * (-0.5 - scull);
    la.rotation.x = landL * W + wl * g.swim;
    ra.rotation.x = landR * W + wr * g.swim;
    la.rotation.z = -0.55 * (1 - M) * g.swim;
    ra.rotation.z = 0.55 * (1 - M) * g.swim;
    lf.rotation.x = elbow * W + (M * el - 0.6 * (1 - M)) * g.swim;
    rf.rotation.x = elbow * W + (M * er - 0.6 * (1 - M)) * g.swim;
    // The body: leaning into a run, or along the water swimming (head down
    // diving, up coming up), upright treading water.
    const swimLean = M * Math.max(0.6, Math.min(2.4, 1.5 - pitch * 0.9)) + (1 - M) * 0.3;
    const lean = crouch ? 0.35 : swim ? swimLean : Math.min(0.12, speed * 0.03) + 0.2 * R;
    g.lean += (lean - g.lean) * ease(6);
    // (Up and down over each step: at a walk, highest over the standing
    // leg; at a run, highest in the stride's flight; still, breathing.)
    const bob = (Math.abs(c) - 0.6) * 0.035 * M * (1 - R) + (Math.abs(s) - 0.3) * 0.07 * R + Math.sin(this.walk * 0.5 + performance.now() * 0.0016) * 0.006 * (1 - M);
    const baseY = crouch ? 0.62 : swim ? 0.4 + 0.35 * (1 - M) : 0.92 - 0.05 * R;
    g.y += (baseY - g.y) * ease(8);
    this.body.position.y = g.y + bob * W;
    this.body.rotation.x = g.lean;
    // (Swaying over each step on land; rolling to each stroke in the water.)
    this.body.rotation.z = s * 0.035 * M * W;
    this.body.rotation.y = (s * 0.08 * M * W) + Math.sin(p) * 0.45 * M * g.swim;
    this.head.rotation.x = Math.max(-0.8, Math.min(0.8, -pitch - g.lean * (swim ? 0.9 : 0.6)));
    this.head.rotation.y = -this.body.rotation.y * 0.8; // (looking where they go, not rolling with the body)
    this.tag.position.y = crouch ? 1.75 : swim ? 1.0 + 0.6 * (1 - M) : 2.15;
  }

  // A wave, a cheer, pointing, a bow, sitting down, a shrug (see EMOTES):
  // played through once (sitting: till they get up and move).
  #emote(dt, flags, speed, swim) {
    const key = (flags >> 24) & 15, kind = EMOTES[key & 7];
    if (key !== this.emoteKey) {
      this.emoteKey = key;
      this.emote = kind ? { kind, t: 0 } : null;
    }
    const em = this.emote;
    if (!em) return;
    em.t += dt;
    if (swim || (speed > 0.6 && em.t > 0.3) || em.t > EMOTE_TIME[em.kind]) return (this.emote = null);
    const [left, right] = this.arms, u = em.t;
    const ease = Math.min(1, u / 0.25, (EMOTE_TIME[em.kind] - u) / 0.3);
    for (const f of this.forearms) f.rotation.x *= 1 - ease;
    if (em.kind === 'sit') for (const s of this.shins) s.rotation.x = 0;
    switch (em.kind) {
      case 'wave':
        // The right arm up, the hand waving side to side.
        right.rotation.x = -2.7 * ease;
        right.rotation.z = (-0.35 + 0.45 * Math.sin(u * 11)) * ease;
        break;
      case 'cheer':
        // Both arms flung up, a little hop.
        left.rotation.x = right.rotation.x = -2.9 * ease;
        left.rotation.z = -0.35 * ease;
        right.rotation.z = 0.35 * ease;
        this.body.position.y += Math.max(0, Math.sin(u * 9)) * 0.12 * ease;
        break;
      case 'point':
        // The right arm out straight at where they're looking.
        right.rotation.x = (-Math.PI / 2 + 0.1) * ease;
        break;
      case 'bow':
        // A bow from the waist, the right hand to the chest.
        this.body.rotation.x += 0.75 * Math.sin(Math.min(1, u / 1.6) * Math.PI);
        right.rotation.x = -0.9 * ease;
        right.rotation.z = 0.6 * ease;
        break;
      case 'sit': {
        // Sat down on the ground, legs out in front, hands back.
        const d = Math.min(1, u / 0.6);
        this.body.position.y = 0.92 - 0.55 * d;
        this.legs[0].rotation.x = this.legs[1].rotation.x = -1.5 * d;
        left.rotation.x = right.rotation.x = 0.5 * d;
        this.tag.position.y = 2.15 - 0.55 * d;
        break;
      }
      case 'shrug':
        // Shoulders up, hands out, palms up.
        left.rotation.x = right.rotation.x = -0.5 * ease;
        left.rotation.z = -0.55 * ease;
        right.rotation.z = 0.55 * ease;
        left.position.y = right.position.y = 0.46 + 0.06 * Math.sin(Math.min(1, u / 1.3) * Math.PI);
        break;
    }
  }

  // What's in their hand, and what they're doing with it: swinging an axe,
  // drawing a bow, throwing a spear.
  #hands(dt, flags, pitch, swim, items) {
    const heldIndex = (flags >> 8) & 4095, act = (flags >> 4) & 7, draw = ((flags >> 20) & 15) / 15; // (held: 12 bits, room for 4095 kinds of thing)
    const id = items?.ids[heldIndex - 1] ?? null;
    if (heldIndex !== this.heldIndex && items) {
      this.heldIndex = heldIndex;
      for (const h of this.hands) h.clear();
      if (id) {
        const mesh = new Mesh(items.geometry(id), items.material);
        mesh.castShadow = true;
        items.holdPose(id, mesh);
        // (A bow in the left hand; anything else in the right.)
        this.hands[id === 'bow' ? 0 : 1].add(mesh);
      }
    }
    const key = (flags >> 4) & 15;
    if (key !== this.actKey) {
      this.actKey = key;
      if (act) this.act = { kind: ACTS[act], t: 0 };
    }
    const [left, right] = this.arms;
    right.rotation.z = 0;
    right.position.z = 0;
    left.rotation.z = 0;
    if (swim) return (this.act = null);
    // (Carrying something: that arm a little forward.)
    if (id) (id === 'bow' ? left : right).rotation.x = -0.35 + 0.3 * (id === 'bow' ? left : right).rotation.x;
    // Drawing a bow: both arms up, the bow held out at whatever they're
    // looking at, the string hand pulled back to the cheek.
    if (id === 'bow' && draw > 0) {
      const aim = -Math.PI / 2 - pitch;
      left.rotation.x = aim;
      right.rotation.x = aim;
      right.rotation.z = 0.35;
      right.position.z = -0.25 * draw;
    }
    if (id === 'bow' && draw > 0) for (const f of this.forearms) f.rotation.x = 0;
    const a = this.act;
    if (!a) return;
    for (const f of this.forearms) f.rotation.x = a.kind === 'chop' ? 0 : f.rotation.x * 0.3;
    a.t += dt;
    const u = Math.min(1, a.t / ACT_TIME[a.kind]);
    if (a.kind === 'chop') {
      // Both hands on the haft: up over the head, a hard stroke down, and back.
      const lift = u < 0.42 ? Math.sin((u / 0.42) * Math.PI / 2) : u < 0.5 ? 1 : u < 0.58 ? 1 - ((u - 0.5) / 0.08) * 1.7 : -0.7 * (1 - (u - 0.58) / 0.42);
      right.rotation.x = left.rotation.x = -1.1 - 1.3 * lift;
      right.rotation.z = 0.25;
      left.rotation.z = -0.25;
      this.body.rotation.x += Math.max(0, -lift) * 0.3;
    } else if (a.kind === 'throw') {
      // Drawn back over the shoulder, and hurled.
      right.rotation.x = u < 0.4 ? -0.4 - 2.4 * (u / 0.4) : -2.8 + 1.8 * Math.min(1, (u - 0.4) / 0.2);
    } else if (a.kind === 'thrust') right.rotation.x = -0.4 - 1.1 * Math.sin(u * Math.PI);
    else if (a.kind === 'cast') right.rotation.x = -0.4 - 2.0 * Math.sin(u * Math.PI);
    else if (a.kind === 'loose') left.rotation.x = -Math.PI / 2 - pitch + 0.15 * Math.sin(u * Math.PI);
    else right.rotation.x -= 0.5 * Math.sin(u * Math.PI);
    if (u >= 1) this.act = null;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

/**
 * The version of what goes between the game and the server (server.mjs's
 * VERSION): raised whenever that changes, so a game and a server, or two
 * players, that don't match say so instead of quietly not sharing things.
 */
export const VERSION = 5;

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
    return this.#open(url, { t: 'host', name, world, hour, dayLength, v: VERSION });
  }

  join(url, code, name) {
    return this.#open(url, { t: 'join', code, name, v: VERSION });
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
          // (A server from before the world was shared passes on only where everyone is.)
          this.warning = (msg.version ?? 0) < VERSION ? 'The online server is out of date: only positions are shared. It updates itself from the latest version (on Render): wait a few minutes and join again.' : null;
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
    for (const r of this.others.values()) r.update(dt, now, this.items);
    if (!this.connected) return;
    this.sendWait -= dt;
    if (this.sendWait > 0) return;
    this.sendWait = SEND_EVERY;
    this.ws.send(JSON.stringify({ t: 'state', s: [me.x, me.y, me.z, me.yaw, me.pitch, packFlags(me, this.items)] }));
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
    this.warning = null;
    if (was) this.onChange?.();
  }

  leave() {
    const ws = this.ws;
    this.#reset();
    ws?.close();
  }
}
