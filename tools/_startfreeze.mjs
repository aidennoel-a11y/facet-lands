// The longest freezes (main thread busy without a break) while a world
// loads, from the start menu: each one over 200 ms, when, how long, and
// what the load screen said then.   node tools/_startfreeze.mjs [seed]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'ztuz7s', quality = 'high'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => m.text().startsWith('TRACE') && console.log(Date.now() % 1e6, m.text()));
await page.addInitScript((q) => {
  localStorage.setItem('facet-lands:quality', q);
  window.__long = [];
  const t0 = performance.now();
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.duration > 200) window.__long.push({ at: Math.round(e.startTime - t0), ms: Math.round(e.duration), note: document.querySelector('.ls-note')?.textContent ?? '' });
  }).observe({ type: 'longtask', buffered: true });
  // (What's running in the long ones: marks round the big steps.)
  window.__marks = [];
}, quality);
await page.goto('http://localhost:4173/', { timeout: 180000 });
await page.waitForFunction(() => window.world?.renderer, null, { timeout: 120000 });
await page.evaluate(() => {
  const w = window.world, parts = { animals: [w.wildlife, 'update'], game: [w.game, 'update'], chunks: [w.chunks, 'update'], fish: [w.fish, 'update'], insects: [w.insects, 'update'], clouds: [w.clouds, 'update'], controls: [w.controls, 'update'], dayNight: [w.dayNight, 'update'], trees: [w.trees, 'update'], draw: [w.renderer, 'render'], compile: [w.renderer, 'compile'], rays: [w.rayEffects, 'render'], weather: [w.weather, 'update'], minimap: [w.minimap, 'update'] };
  window.__big = [];
  for (const [name, [obj, fn]] of Object.entries(parts)) {
    if (!obj?.[fn]) continue;
    const orig = obj[fn].bind(obj);
    obj[fn] = (...a) => { const t = performance.now(); const r = orig(...a); const d = performance.now() - t; if (d > 150) window.__big.push([name, Math.round(t), Math.round(d)]); return r; };
  }
});
await page.click('[data-go="start"]');
await page.click('[data-go="new"]');
await page.fill('#sm-seed', seed);
await page.evaluate(() => (window.__click = performance.now()));
await page.click('[data-go="play"]');
await page.waitForTimeout(300);
if (await page.$('[data-go="play"]')) await page.click('[data-go="play"]').catch(() => 0);
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: +(process.env.WAIT ?? 240000), polling: 500 }).catch(() => console.log('(not in yet)'));
console.log(JSON.stringify(await page.evaluate(() => ({ click: Math.round(window.__click), marks: performance.getEntriesByType('measure').map((m) => [m.name, Math.round(m.startTime), Math.round(m.duration)]), long: window.__long, big: window.__big }))));
await browser.close();
