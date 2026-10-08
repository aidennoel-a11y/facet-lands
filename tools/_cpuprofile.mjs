// The main thread's hottest functions (self time, %), from Chrome's own
// profiler, over a stretch of walking at a busy spot.
//   node tools/_cpuprofile.mjs [seed x z seconds]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'polaris', x = '399', z = '1025', secs = '25'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=0&hour=17.5&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); window.world.controls.keys.add('KeyW'); });
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await page.waitForTimeout(+secs * 1000);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = {};
profile.samples.forEach((id, k) => (dt[id] = (dt[id] ?? 0) + (profile.timeDeltas[k] ?? 0)));
let total = 0;
for (const n of profile.nodes) {
  const t = dt[n.id] ?? 0;
  total += t;
  const f = n.callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + t);
}
const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 30);
for (const [k, t] of top) console.log(`${((t / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
await browser.close();
