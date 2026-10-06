// How long the game takes to start and a world to load:
//   node tools/loadtime.mjs [port] [extra query] [profile.json]
// Times from opening the page: the game's code run (window.world), and the
// land round you built (nothing left to build within the near ring), and
// optionally a CPU profile of the first 25 seconds (open it in Chrome's
// DevTools, Performance tab).
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [port = '4173', extra = '', profile] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const cdp = profile ? await page.context().newCDPSession(page) : null;
if (cdp) (await cdp.send('Profiler.enable'), await cdp.send('Profiler.setSamplingInterval', { interval: 500 }), await cdp.send('Profiler.start'));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/?seed=polaris&x=300&z=-200&up=2&hide&hour=11${extra}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
const tDom = Date.now() - t0;
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000, polling: 50 });
const tCode = Date.now() - t0;
// (The near ring: the chunks within 160 m all built.)
await page.waitForFunction(() => {
  const { chunks, camera } = window.world, C = chunks.config.chunkSize, p = camera.position;
  const r = Math.ceil(160 / C);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const c = chunks.chunks.get(`${Math.floor(p.x / C) + dx},${Math.floor(p.z / C) + dz}`);
    if (!c || c.building) return false;
  }
  return true;
}, null, { timeout: 300000, polling: 100 });
const tNear = Date.now() - t0;
// (With &loadscreen: when the loading screen lets you in.)
const tIn = extra.includes('loadscreen') ? (await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 300000, polling: 100 }), Date.now() - t0) : null;
await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 300000, polling: 200 }).catch(() => 0);
const tAll = Date.now() - t0;
const n = await page.evaluate(() => [window.world.chunks.chunks.size, window.world.chunks.workers.length]);
console.log(JSON.stringify({ dom: tDom, code: tCode, near: tNear, in: tIn, all: tAll, chunks: n[0], workers: n[1] }));
if (cdp) {
  const { profile: p } = await cdp.send('Profiler.stop');
  writeFileSync(profile, JSON.stringify(p));
}
await browser.close();
