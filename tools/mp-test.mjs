// Two players in one world, headless: the first opens a room, the second
// joins it by its code, standing a few metres off looking at the first;
// then a screenshot from the second.   node tools/mp-test.mjs out.png
// (Needs the preview server, and the multiplayer server on :8787.)
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'mp.png';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = 'http://localhost:4173/?seed=vz500g&vd=2&hide&hour=11';
const errs = [];
const open = async (q) => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await page.goto(`${base}&${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks, null, { timeout: 120000 });
  return page;
};
const a = await open('x=1243&z=1567&up=0&yaw=0&mp=host&name=Aiden');
await a.waitForFunction(() => window.world.mp.code, null, { timeout: 30000 });
const code = await a.evaluate(() => window.world.mp.code);
console.log('room', code);
// (B stands 5 m off along -z from A... A looks down -z (yaw 0), B looks back at A (yaw π).)
const b = await open(`x=1243&z=1561&up=0&yaw=0&pitch=-0.05&mp=${code}&name=Bea`);
await b.waitForFunction(() => window.world.mp.connected, null, { timeout: 30000 });
await b.waitForTimeout(40000);
// A walks a little (moving its camera), so B sees it move.
await a.evaluate(() => { window.world.camera.position.z -= 1; });
await b.waitForTimeout(3000);
console.log(await b.evaluate(() => JSON.stringify({ others: [...window.world.mp.others.values()].map((r) => ({ name: r.name, at: r.root.position.toArray().map((v) => +v.toFixed(1)), visible: r.root.visible })), count: window.world.mp.count })));
console.log('A sees', await a.evaluate(() => [...window.world.mp.others.values()].map((r) => r.name).join(',')));
await b.screenshot({ path: out });
console.log('errors', errs.slice(0, 5));
await browser.close();
