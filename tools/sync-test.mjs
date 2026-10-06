// Online, one world for both: a host and a guest (each its own browser),
// checking the guest gets the host's sky, animals and world edits, and the
// host the guest's.   node tools/sync-test.mjs [ws://localhost:8787]
// (Needs the preview server on :4173 and the multiplayer server.)
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const server = process.argv[2] ?? 'ws://localhost:8787';
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const base = `http://localhost:4173/?seed=vz500g&vd=2&hide&hour=11&server=${server}`;
const errs = [];
const open = async (q) => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await page.goto(`${base}&${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks, null, { timeout: 120000 });
  return { page, browser };
};
const ok = (name, pass, more = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} ${more}`);
const A = await open('x=1243&z=1567&up=0&yaw=0&mp=host&name=Host');
const a = A.page;
await a.waitForFunction(() => window.world.mp.code, null, { timeout: 150000 }).catch((e) => (console.log('host never got in', errs), Promise.reject(e)));
const code = await a.evaluate(() => window.world.mp.code);
console.log('room', code);
// Before the guest comes: a campfire built and a torch put up (it should find them).
await a.waitForTimeout(8000);
await a.evaluate(() => {
  const { game, camera, torches, THREE } = window.world;
  const p = camera.position, y = window.world.chunks.groundHeightAt(p.x + 3, p.z);
  game.structures.build({ type: 'campfire', x: p.x + 3, y, z: p.z, rot: 0 });
  torches.place(new THREE.Vector3(p.x - 3, y, p.z), new THREE.Vector3(0, 1, 0));
});
const B = await open(`x=1243&z=1561&up=0&yaw=0&mp=${code}&name=Guest`);
const b = B.page;
await b.evaluate(() => { const w = window.world, f = w.mp.onWorld; window.got = {}; w.mp.onWorld = (m) => { window.got[m.t] = (window.got[m.t] ?? 0) + 1; f(m); }; }).catch(() => 0);
await b.waitForFunction(() => window.world.mp.connected, null, { timeout: 400000 }).catch(async (e) => {
  console.log('guest never got in', errs, await b.evaluate(() => window.world.mp.ws?.readyState));
  throw e;
});
await b.waitForTimeout(30000);

// The sky.
await a.evaluate(() => window.world.weather.set('rain'));
await b.waitForTimeout(6000);
const sky = await Promise.all([a, b].map((p) => p.evaluate(() => ({ kind: window.world.weather.kind, travel: window.world.clouds.travel, t: window.world.mp.roomTime() - Date.now() / 1000, wind: window.world.sync && 0 }))));
ok('weather follows the host', sky[1].kind === 'rain', JSON.stringify(sky.map((s) => s.kind)));
ok('clouds drifted as far', Math.abs(sky[0].travel - sky[1].travel - (sky[0].t - sky[1].t) * 0) < 6, sky.map((s) => s.travel.toFixed(1)).join(' / '));
ok('room clock shared', Math.abs(sky[0].t - sky[1].t) < 1.5, `apart by ${Math.abs(sky[0].t - sky[1].t).toFixed(2)} s`);

// The edits made before the guest came.
const got = await b.evaluate(() => ({ fires: window.world.game.structures.list.filter((s) => s.type === 'campfire').length, torches: window.world.torches.torches.length }));
ok('guest finds the host\'s campfire and torch', got.fires >= 1 && got.torches >= 1, JSON.stringify(got));

// A tree felled by the guest: gone for the host too.
// (As felling does: its key among the removed; and for the host, taken away by its key.)
const key = await b.evaluate(() => (window.world.trees.removed.add('40,52,oak,40,60'), '40,52,oak,40,60'));
await a.waitForTimeout(8000);
ok('a tree felled by the guest is gone for the host', key && (await a.evaluate((k) => window.world.trees.removed.has(k), key)), key);

// Something dropped by the host: lies there for the guest, and when the guest picks it up, it's gone for the host.
await a.evaluate(() => { const p = window.world.camera.position; window.world.game.items.drop({ id: 'stick', count: 3 }, p.x + 1, p.y, p.z + 1); });
await b.waitForTimeout(12000);
const drop = await b.evaluate(() => window.world.game.items.drops.map((d) => d.uid));
console.log('host drops', await a.evaluate(() => JSON.stringify({ drops: window.world.game.items.drops.map((d) => [d.uid, d.settled, +d.y.toFixed(1)]), sent: [...window.world.sync.sent.drops.keys()] })));
console.log('guest', await b.evaluate(() => JSON.stringify({ got: window.got, started: window.world.sync.started, sent: [...window.world.sync.sent.drops.keys()] })));
ok('the host\'s drop lies there for the guest', drop.length >= 1, JSON.stringify(drop));
if (drop.length) {
  await b.evaluate((u) => { const d = window.world.game.items.drops.find((d) => d.uid === u); window.world.game.items.take({ kind: 'drop', item: d }); }, drop[0]);
  await a.waitForTimeout(8000);
  ok('picked up by the guest: gone for the host', !(await a.evaluate((u) => window.world.game.items.drops.some((d) => d.uid === u), drop[0])));
}

// The animals.
const wild = await Promise.all([a, b].map((p) => p.evaluate(() => window.world.wildlife.animals.filter((x) => x.alive).map((x) => [x.id, x.kind, +x.x.toFixed(1), +x.z.toFixed(1)]))));
const shared = wild[1].filter(([id]) => wild[0].some(([j]) => j === id));
const off = shared.map(([id, , x, z]) => { const h = wild[0].find(([j]) => j === id); return Math.hypot(h[2] - x, h[3] - z); });
ok('guest draws the host\'s animals', wild[1].length > 0 && shared.length === wild[1].length, `host ${wild[0].length}, guest ${wild[1].length}, shared ${shared.length}, max apart ${Math.max(0, ...off).toFixed(1)} m`);
ok('… in the same places (within a few metres: drawn a moment behind)', off.every((d) => d < 6));
// The guest shoots one: it's dead for the host.
if (wild[1].length) {
  const target = await b.evaluate(() => {
    const c = window.world.camera.position;
    const a = window.world.wildlife.animals.filter((x) => x.alive && !Number.isNaN(x.x)).sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z))[0];
    window.world.wildlife.wound(a, { head: true, sharp: 5, from: c });
    return [a.id, a.kind];
  });
  await a.waitForTimeout(3000);
  const dead = await a.evaluate((id) => window.world.wildlife.animals.find((x) => x.id === id)?.alive, target[0]);
  ok('an animal the guest kills is dead for the host', dead === false, JSON.stringify(target));
  await b.waitForTimeout(2000);
  ok('… and stays dead for the guest', (await b.evaluate((id) => window.world.wildlife.animals.find((x) => x.id === id)?.alive, target[0])) === false);
}
// The way the host looks (turned, and looking down): as the guest sees them.
await a.evaluate(() => { const { controls, camera } = window.world; controls.euler.set(-0.6, 1.2, 0, 'YXZ'); camera.quaternion.setFromEuler(controls.euler); });
await b.waitForTimeout(5000);
const seen = await b.evaluate(() => [...window.world.mp.others.values()][0]?.yaw);
ok('the guest sees which way the host looks', Math.abs(Math.atan2(Math.sin(seen - 1.2), Math.cos(seen - 1.2))) < 0.1, `host 1.20, guest sees ${seen?.toFixed(2)}`);
// The time of day: the host's clock jumps (no message sent for it): the guest follows.
await a.evaluate(() => (window.world.dayNight.hour = 20));
await b.waitForTimeout(8000);
const hours = await Promise.all([a, b].map((p) => p.evaluate(() => window.world.dayNight.hour)));
ok('the time of day is the same', Math.abs(hours[0] - hours[1]) < 0.15, hours.map((h) => h.toFixed(2)).join(' / '));
// An arrow the host looses: the guest sees it fly.
await b.evaluate(() => { const g = window.world.game, f = g.ghostShot.bind(g); window.shots = 0; g.ghostShot = (r) => (f(r), (window.shots += g.ghosts.length)); });
await a.evaluate(() => { const p = window.world.camera.position; window.world.game.onShot({ m: 'arrow', p: [p.x, p.y, p.z], v: [0, 8, 30] }); });
await b.waitForTimeout(6000); // (sent on the host's next frame: slow, two browsers drawing on one computer)
ok('the guest sees the host\'s arrow fly', (await b.evaluate(() => window.shots)) > 0);
// What the host holds, and swinging it: the guest sees it in their hand.
console.log('host before the axe', await a.evaluate(() => { const g = window.world.game; return { alive: g.survival.alive, cause: g.survival.cause, mode: window.world.controls.mode }; }));
await a.evaluate(() => { window.world.controls.mode = 'walk'; const g = window.world.game; g.survival.alive = true; g.survival.health = 100; g.inventory.slots[g.hotbar.index] = { id: 'axe', count: 1, dur: 50 }; g.inventory.changed?.(); });
await b.waitForTimeout(3000);
const held = await b.evaluate(() => { const r = [...window.world.mp.others.values()][0]; return { index: r.heldIndex, id: window.world.mp.items.ids[r.heldIndex - 1], inHand: r.hands[1].children.length }; });
ok('the guest sees the axe in the host\'s hand', held.id === 'axe' && held.inHand === 1, JSON.stringify(held));
console.log('errors', errs.slice(0, 6));
await b.screenshot({ path: process.argv[3] ?? 'sync-guest.png' });
await A.browser.close();
await B.browser.close();
