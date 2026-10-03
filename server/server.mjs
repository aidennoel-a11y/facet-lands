// The Facet Lands multiplayer server: rooms of players walking the same
// world. The world itself is never sent: every player builds it from its
// seed. The server only passes on where everyone is (about fifteen times
// a second) and keeps the room's clock, so the sun is in the same place
// for all of them.
//
//   npm install && npm start          (PORT=8787 by default)
//
// Messages (JSON, one per WebSocket frame):
//   client -> server
//     { t: 'host', name, world: { name, seed, mode }, hour, dayLength }  make a room
//     { t: 'join', code, name }                                          join one
//     { t: 'state', s: [x, y, z, yaw, pitch, flags] }                    where you are
//     { t: 'hour', hour }                                                the host set the time
//   server -> client
//     { t: 'welcome', id, code, world, hour, dayLength, players: [{ id, name, colour, s }] }
//     { t: 'joined', id, name, colour }     { t: 'left', id }
//     { t: 'states', list: [[id, s], ...] } everyone's latest, ~15 times a second
//     { t: 'hour', hour }                   { t: 'error', message }
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
    t: 'welcome', id: player.id, code: room.code, world: room.world, hour: hourOf(room), dayLength: room.dayLength,
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
  if (room.host === player.id) room.host = room.players.keys().next().value ?? null; // (the clock passes on)
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
      code: newCode(), players: new Map(), host: null, emptySince: null,
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
const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data) => onMessage(ws, data));
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
