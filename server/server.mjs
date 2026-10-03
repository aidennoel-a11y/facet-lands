// The Facet Lands multiplayer server: rooms of players walking the same
// world. The world itself is never sent: every player builds it from its
// seed. The server passes on where everyone is (about fifteen times a
// second), keeps the room's clock (so the sun is in the same place for all
// of them), and keeps what's been done to the world (trees felled, things
// picked up or dropped, built, lit) so whoever joins later finds it so.
// The host (the first in; if they go, the next) runs the sky and the
// animals: their weather and wildlife go out to the others.
//
//   npm install && npm start          (PORT=8787 by default)
//
// Messages (JSON, one per WebSocket frame):
//   client -> server
//     { t: 'host', name, world: { name, seed, mode }, hour, dayLength }  make a room
//     { t: 'join', code, name }                                          join one
//     { t: 'state', s: [x, y, z, yaw, pitch, flags] }                    where you are
//     { t: 'hour', hour }                                                the host set the time
//     { t: 'edit', e }        something done to the world (see mergeEdit), to keep and pass on
//     { t: 'sky', sky }       the host's weather (kept, passed on)
//     { t: 'wild', w }        the host's animals (passed on)
//     { t: 'fx', fx }         sounds and the like, where they happen (passed on)
//     { t: 'tohost', m }      to the host only (a guest's arrow in an animal, say)
//   server -> client
//     { t: 'welcome', id, code, host, world, hour, dayLength, time, edits, sky, players: [{ id, name, colour, s }] }
//     { t: 'joined', id, name, colour }     { t: 'left', id }    { t: 'host', id } (a new host)
//     { t: 'states', list: [[id, s], ...] } everyone's latest, ~15 times a second
//     { t: 'hour', hour }                   { t: 'error', message }
//     { t: 'edit' | 'sky' | 'wild' | 'fx', ..., from }  { t: 'tohost', m, from }
//   (`time`: milliseconds since the room opened, its shared clock for the
//   wind and the drifting clouds.)
//
// And over plain HTTP, GET /worlds: the worlds open now, for the game's list.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
const TICK = 1000 / 15; // (how often everyone's positions go out)
const MAX_PLAYERS = 16;
const COLOURS = ['#d8572a', '#3a86c8', '#e0b030', '#5aa34a', '#a35ac8', '#d84a8a', '#3ab0a8', '#8a6a4a'];

const rooms = new Map(); // code -> room
let nextId = 1;

// Room codes: six letters and digits, no look-alikes (0/O, 1/I).
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  while (rooms.has(code));
  return code;
}

// The room's time of day now (it runs on from when it was last set).
function hourOf(room) {
  const hours = ((Date.now() - room.hourAt) / 1000) * (24 / (room.dayLength * 60));
  return (((room.hour + hours) % 24) + 24) % 24;
}

// What's been done to the world: sets of keys (trees felled, things taken
// off the ground, mushrooms picked) and records by key (stumps, things
// built, torches, things dropped). An edit: { add: { felled: [...], ... },
// put: { stumps: [rec], ... }, del: { stumps: [key], ... } } (each record
// carries its own key, `k`).
const SETS = ['felled', 'taken', 'mushrooms'];
const MAPS = ['stumps', 'structures', 'torches', 'drops'];
const newEdits = () => ({ ...Object.fromEntries(SETS.map((k) => [k, new Set()])), ...Object.fromEntries(MAPS.map((k) => [k, new Map()])) });
function mergeEdit(edits, e) {
  for (const k of SETS) for (const key of e.add?.[k] ?? []) if (typeof key === 'string') edits[k].add(key);
  for (const k of MAPS) {
    for (const rec of e.put?.[k] ?? []) if (rec && typeof rec.k === 'string') edits[k].set(rec.k, rec);
    for (const key of e.del?.[k] ?? []) edits[k].delete(key);
  }
}
const editsJSON = (edits) => ({
  add: Object.fromEntries(SETS.map((k) => [k, [...edits[k]]])),
  put: Object.fromEntries(MAPS.map((k) => [k, [...edits[k].values()]])),
});

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
function broadcast(room, msg, except = null) {
  const text = JSON.stringify(msg);
  for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(text);
}

const clean = (v, max = 24) => String(v ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, max);

function enter(room, ws, name) {
  if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', message: 'That world is full.' });
  const used = new Set([...room.players.values()].map((p) => p.colour));
  const player = { id: nextId++, ws, name: clean(name) || 'Wanderer', colour: COLOURS.find((c) => !used.has(c)) ?? COLOURS[room.players.size % COLOURS.length], s: null };
  room.players.set(player.id, player);
  room.emptySince = null;
  ws.room = room;
  ws.player = player;
  send(ws, {
    t: 'welcome', id: player.id, code: room.code, host: room.host ?? player.id, world: room.world, hour: hourOf(room), dayLength: room.dayLength,
    time: Date.now() - room.born, edits: editsJSON(room.edits), sky: room.sky,
    players: [...room.players.values()].filter((p) => p !== player).map((p) => ({ id: p.id, name: p.name, colour: p.colour, s: p.s })),
  });
  broadcast(room, { t: 'joined', id: player.id, name: player.name, colour: player.colour }, player);
  console.log(`${player.name} (${player.id}) in ${room.code}: ${room.players.size} there`);
}

function leave(ws) {
  const room = ws.room, player = ws.player;
  if (!room || !player) return;
  room.players.delete(player.id);
  broadcast(room, { t: 'left', id: player.id });
  if (room.host === player.id) {
    // (The clock, the sky and the animals pass on.)
    room.host = room.players.keys().next().value ?? null;
    if (room.host !== null) broadcast(room, { t: 'host', id: room.host });
  }
  if (!room.players.size) room.emptySince = Date.now();
  ws.room = ws.player = null;
}

function onMessage(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  if (msg.t === 'state') {
    // [x, y, z, yaw, pitch, flags]: numbers only, kept short.
    if (ws.player && Array.isArray(msg.s) && msg.s.length === 6 && msg.s.every(Number.isFinite)) ws.player.s = msg.s.map((v) => Math.round(v * 100) / 100);
  } else if (msg.t === 'host' && !ws.room) {
    const seed = clean(msg.world?.seed, 40);
    if (!seed) return send(ws, { t: 'error', message: 'No seed.' });
    const room = {
      code: newCode(), players: new Map(), host: null, emptySince: null, born: Date.now(), edits: newEdits(), sky: null,
      world: { name: clean(msg.world?.name, 40) || 'A world', seed, mode: ['survival', 'creative'].includes(msg.world?.mode) ? msg.world.mode : 'survival' },
      hour: Number.isFinite(msg.hour) ? msg.hour : 9, hourAt: Date.now(), dayLength: Number.isFinite(msg.dayLength) && msg.dayLength > 0 ? msg.dayLength : 24,
    };
    rooms.set(room.code, room);
    enter(room, ws, msg.name);
    room.host = ws.player?.id ?? null;
  } else if (msg.t === 'join' && !ws.room) {
    const room = rooms.get(clean(msg.code, 6).toUpperCase());
    if (!room) return send(ws, { t: 'error', message: 'No world with that code is open.' });
    enter(room, ws, msg.name);
  } else if (msg.t === 'hour' && ws.room && ws.room.host === ws.player?.id && Number.isFinite(msg.hour)) {
    ws.room.hour = msg.hour;
    ws.room.hourAt = Date.now();
    broadcast(ws.room, { t: 'hour', hour: msg.hour }, ws.player);
  } else if (!ws.room || !ws.player) {
    // (Nothing below until you're in a room.)
  } else if (msg.t === 'edit' && msg.e && typeof msg.e === 'object') {
    mergeEdit(ws.room.edits, msg.e);
    broadcast(ws.room, { t: 'edit', e: msg.e, from: ws.player.id }, ws.player);
  } else if (msg.t === 'sky' && ws.room.host === ws.player.id && msg.sky && typeof msg.sky === 'object') {
    ws.room.sky = msg.sky;
    broadcast(ws.room, { t: 'sky', sky: msg.sky }, ws.player);
  } else if (msg.t === 'wild' && ws.room.host === ws.player.id && msg.w) {
    broadcast(ws.room, { t: 'wild', w: msg.w }, ws.player);
  } else if (msg.t === 'fx' && Array.isArray(msg.fx)) {
    broadcast(ws.room, { t: 'fx', fx: msg.fx, from: ws.player.id }, ws.player);
  } else if (msg.t === 'tohost' && msg.m) {
    const host = ws.room.players.get(ws.room.host);
    if (host && host !== ws.player) send(host.ws, { t: 'tohost', m: msg.m, from: ws.player.id });
  }
}

// Plain web requests: GET /worlds, the open worlds (for the game's list:
// [{ code, name, mode, players }]); anything else, a line saying it's up.
const http = createServer((req, res) => {
  if (req.url?.startsWith('/worlds')) {
    const list = [...rooms.values()].filter((r) => r.players.size).map((r) => ({ code: r.code, name: r.world.name, mode: r.world.mode, players: r.players.size }));
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(list));
  }
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end(`Facet Lands server: ${rooms.size} world${rooms.size === 1 ? '' : 's'} open\n`);
});
const wss = new WebSocketServer({ server: http, maxPayload: 4 * 1024 * 1024 });
wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data) => {
    try {
      onMessage(ws, data);
    } catch (e) {
      console.error('message failed:', e); // (one bad message never takes the server down)
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

// Everyone's latest positions, to everyone else in the room.
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.players.size < 2) continue;
    const list = [...room.players.values()].filter((p) => p.s).map((p) => [p.id, p.s]);
    for (const p of room.players.values()) {
      const others = list.filter(([id]) => id !== p.id);
      if (others.length) send(p.ws, { t: 'states', list: others });
    }
  }
}, TICK);

// Dropped connections, and rooms left empty for ten minutes.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
  for (const [code, room] of rooms) if (room.emptySince && Date.now() - room.emptySince > 10 * 60 * 1000) rooms.delete(code);
}, 20000);

http.listen(PORT, () => console.log(`Facet Lands server on port ${PORT}`));
