// Online, the small life of the world and the weather's violence the same
// for both: a host and a guest (each its own browser) by a creek at dusk
// in summer, checking the frogs and fireflies are in the same places for
// both, a tree the host fells comes down for the guest too, the host's
// storm strikes for the guest, and the guest's trees reach the host (for
// its songbirds).   node tools/sync-test2.mjs [ws://localhost:8787]
// (Needs the preview server on :4173 and the multiplayer server.)
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const server = process.argv[2] ?? 'ws://localhost:8787';
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const base = `http://localhost:4173/?vd=2&hide&hour=20&server=${server}`;
const errs = [];
const open = async (q) => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await page.goto(`${base}&${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks, null, { timeout: 120000 });
  return { page, browser };
};
const ok = (name, pass, more = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} ${more}`);
const A = await open('x=2389.5&z=1803.5&up=0&mp=host&name=Host');
const a = A.page;
await a.waitForFunction(() => window.world.mp.code, null, { timeout: 150000 });
const code = await a.evaluate(() => (window.world.seasons.set(1), window.world.mp.code));
console.log('room', code);
const B = await open(`x=2389.5&z=1797.5&up=0&mp=${code}&name=Guest`);
const b = B.page;
await b.waitForFunction(() => window.world.mp.connected, null, { timeout: 400000 });
await b.evaluate(() => {
  const L = window.world.lightning, f = L.strikeAt.bind(L);
  window.strikes = 0;
  L.strikeAt = (...x) => (window.strikes++, f(...x));
});
await b.waitForTimeout(30000);
// (Till both have their frogs out: slow to start, two browsers on one computer.)
const frogsNear = () => {
  const w = window.world, m = new w.THREE.Matrix4(), v = new w.THREE.Vector3(), M = w.insects.frogMesh;
  let n = 0;
  for (let k = 0; k < M.count; k++) if ((M.getMatrixAt(k, m), v.setFromMatrixPosition(m), Math.hypot(v.x - 2389.5, v.z - 1800.5) < 25)) n++;
  return n >= 3;
};
await Promise.all([a, b].map((p) => p.waitForFunction(frogsNear, null, { timeout: 300000, polling: 2000 }).catch(() => 0)));

// The frogs and the fireflies: where each draws them, at (nearly) the same
// moment (those well within reach of both; no firefly is drawn within 12 m
// of you, so not those by either).
const drawn = () => {
  const w = window.world, m = new w.THREE.Matrix4(), v = new w.THREE.Vector3();
  const of = (mesh) => Array.from({ length: mesh.count }, (_, k) => (mesh.getMatrixAt(k, m), v.setFromMatrixPosition(m).toArray()));
  const c = w.camera.position, near = (p) => Math.hypot(p[0] - 2389.5, p[2] - 1800.5) < 25;
  return { frogs: of(w.insects.frogMesh).filter(near), flies: of(w.insects.flyMesh).filter((p) => Math.hypot(p[0] - 2389.5, p[2] - 1800.5) < 70 && Math.hypot(p[0] - 2389.5, p[2] - 1803.5) > 13 && Math.hypot(p[0] - 2389.5, p[2] - 1797.5) > 13), T: w.mp.roomTime() - Date.now() / 1000, season: w.seasons.name };
};
const [ha, hb] = await Promise.all([a.evaluate(drawn), b.evaluate(drawn)]);
const match = (P, Q, tol) => P.filter((p) => Q.some((q) => Math.hypot(p[0] - q[0], p[2] - q[2]) < tol)).length;
console.log('seasons', ha.season, hb.season, 'clocks apart', Math.abs(ha.T - hb.T).toFixed(2), 's');
ok('frogs in the same places for both', ha.frogs.length > 0 && hb.frogs.length > 0 && match(hb.frogs, ha.frogs, 0.6) >= Math.min(ha.frogs.length, hb.frogs.length) * 0.8, `host ${ha.frogs.length}, guest ${hb.frogs.length}, matched ${match(hb.frogs, ha.frogs, 0.6)}`);
ok('fireflies in the same places for both', ha.flies.length > 0 && match(hb.flies, ha.flies, 1.5) >= Math.min(ha.flies.length, hb.flies.length) * 0.7, `host ${ha.flies.length}, guest ${hb.flies.length}, matched ${match(hb.flies, ha.flies, 1.5)}`);

// The guest's trees, for the host's songbirds.
ok('the guest\'s trees reach the host', (await a.evaluate(() => window.world.wildlife.remoteCrowns.size)) > 0, String(await a.evaluate(() => window.world.wildlife.remoteCrowns.size)));

// A tree the host fells comes down for the guest, the same way.
const felled = await a.evaluate(() => {
  const { trees, chunks, THREE, camera, game } = window.world, c = camera.position;
  let best = null;
  for (const list of trees.crowns.values()) for (let k = 0; k < list.length; k += 5) {
    const d = Math.hypot(list[k] - c.x, list[k + 1] - c.z);
    if (d > 4 && (!best || d < best.d)) best = { x: list[k], z: list[k + 1], d };
  }
  if (!best) return 'no trees';
  const y = chunks.groundHeightAt(best.x, best.z) + 1;
  const hit = trees.pick(new THREE.Vector3(best.x - 2, y, best.z), new THREE.Vector3(1, 0, 0), 4);
  if (!hit || hit.bush) return 'no pick';
  let r;
  for (let k = 0; k < 40 && r !== 'fell'; k++) r = game.felling.chop(hit, { x: best.x - 2, z: best.z }, hit.y + 0.8);
  return r === 'fell' ? hit.key : 'never fell';
});
await b.waitForFunction((k) => window.world.game.felling.falling.some((f) => f.hit.key === k), felled, { timeout: 30000, polling: 500 }).catch(() => 0);
const fallB = await b.evaluate((k) => window.world.game.felling.falling.find((f) => f.hit.key === k)?.angle ?? null, felled);
ok('a tree the host fells falls for the guest', fallB !== null, `${felled}: guest's at ${fallB?.toFixed?.(2)} rad`);
await b.waitForTimeout(12000);
const [endA, endB] = await Promise.all([a, b].map((p) => p.evaluate((k) => { const f = window.world.game.felling.falling.find((f) => f.hit.key === k); return f ? [f.angle, f.fallen, f.dir.x, f.dir.z] : null; }, felled)));
ok('… the same way, to the same place', endA && endB && Math.abs(endA[0] - endB[0]) < 0.15 && Math.abs(endA[2] - endB[2]) < 0.01, JSON.stringify([endA, endB].map((e) => e?.map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)))));
// The guest cuts it up: gone for the host too.
await b.evaluate((k) => { const g = window.world.game, f = g.felling.falling.find((f) => f.hit.key === k); for (let i = 0; i < 3 && f; i++) g.felling.chopFallen(f, window.world.camera.position, (x, z) => window.world.chunks.groundHeightAt(x, z)); }, felled);
await a.waitForTimeout(4000);
ok('cut up by the guest: gone for the host', !(await a.evaluate((k) => window.world.game.felling.falling.some((f) => f.hit.key === k), felled)));

// The host's storm strikes for the guest.
await a.evaluate(() => {
  const L = window.world.lightning, f = L.onBolt;
  window.bolts = 0;
  L.onBolt = (x) => (window.bolts++, f(x));
  window.world.weather.set('storm');
});
await a.waitForFunction(() => window.bolts > 0, null, { timeout: 300000, polling: 2000 }).catch(() => 0);
await b.waitForTimeout(8000);
console.log('host bolts', await a.evaluate(() => window.bolts));
const strikes = await b.evaluate(() => window.strikes);
ok('the host\'s lightning strikes for the guest', strikes > 0, `${strikes} strikes`);
console.log('errors', errs.slice(0, 6));
await b.screenshot({ path: process.argv[3] ?? 'sync2-guest.png' });
await A.browser.close();
await B.browser.close();
