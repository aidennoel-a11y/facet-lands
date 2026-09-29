// Screenshots of the game in headless Chromium (Playwright), with no clicking
// about: each view is a test address (see TEST in src/main.js).
//   npm run build && npx vite preview --port 4173 &
//   node tools/shot.mjs out.png "seed=polaris&x=100&z=200&y=60&yaw=0&pitch=-0.3&hour=12&vd=6&hide" [max wait seconds] [script run in the page, given `world`]
// It shoots as soon as the world round the camera has finished building
// (no chunks queued or building for a few seconds), or after the max wait.
//
// Several views of one world in one go (the world loads once, so each view
// after the first takes only as long as its new chunks):
//   node tools/shot.mjs --views views.json "seed=polaris&hour=11&vd=4&hide" [max wait per view]
// views.json: [{ "out": "a.png", "x": 100, "z": 200, "up": 20, "yaw": 0.6, "pitch": -0.25 }, ...]
// (`up` is metres above the ground there; or give `y` for a height. Leave
// out x and z to keep the last view's camera; `script` runs in the page
// first, given `world`.)
// Prints each view's readout and any errors.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const args = process.argv.slice(2);
const multi = args[0] === '--views';
const views = multi ? JSON.parse(readFileSync(args[1], 'utf8')) : [{ out: args[0] ?? 'shot.png' }];
const [query = '', wait = '150', script = ''] = multi ? args.slice(2) : args.slice(1);
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
const t0 = Date.now();
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 120000 });
// (An optional snippet run in the page once it's up, e.g. to dig a plot:
// it sees `world` = window.world.)
if (script) {
  await page.waitForTimeout(5000);
  await page.evaluate((code) => new Function('world', code)(window.world), script);
}

/** Waits until no chunks are queued or building for `settle` seconds (at least `min`, at most `max`). */
async function settled(min, max, settle = 4) {
  const start = Date.now();
  let quietSince = null;
  while ((Date.now() - start) / 1000 < max) {
    await page.waitForTimeout(1000);
    const busy = await page.evaluate(() => {
      const c = window.world.chunks;
      return (c.queue?.length ?? 0) + (c.inFlight?.size ?? 0);
    });
    if (busy) quietSince = null;
    else quietSince ??= Date.now();
    if ((Date.now() - start) / 1000 >= min && quietSince && (Date.now() - quietSince) / 1000 >= settle) return (Date.now() - start) / 1000;
  }
  return max;
}

for (const [k, v] of views.entries()) {
  if (multi && v.x !== undefined) {
    await page.evaluate((v) => {
      const { camera, controls, generator, WORLD } = window.world;
      const y = v.y ?? Math.max(generator.getHeight(v.x, v.z), WORLD.seaLevel) + (v.up ?? 20);
      camera.position.set(v.x, y, v.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(v.pitch ?? -0.25, v.yaw ?? 0, 0);
      if (controls.yaw !== undefined) controls.yaw = camera.rotation.y;
      if (controls.pitch !== undefined) controls.pitch = camera.rotation.x;
    }, v);
  }
  // (A view can run its own snippet first, e.g. to hide something and compare.)
  if (v.script) await page.evaluate((code) => new Function('world', code)(window.world), v.script);
  // (The first view waits for the world itself; later ones only for their new chunks.)
  const took = await settled(k === 0 ? 10 : 4, +wait);
  // (A moment more for the trees, grass and rocks the last chunks bring.)
  await page.waitForTimeout(3000);
  await page.screenshot({ path: v.out, timeout: 180000 });
  const info = await page.evaluate(() => ['stat-biome', 'stat-pos', 'stat-chunks', 'stat-fps'].map((id) => document.getElementById(id)?.textContent).join(' | '));
  console.log(`${v.out}: ${info} (ready in ${took.toFixed(0)} s)`);
}
if (process.env.PROBE) console.log('probe:', await page.evaluate((code) => JSON.stringify(new Function('world', code)(window.world)), process.env.PROBE));
if (errors.length) console.log('errors:', errors.slice(0, 10));
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
