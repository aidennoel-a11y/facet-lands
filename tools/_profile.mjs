// Where a frame's main-thread time goes: each big part of the frame timed
// (its average and worst, ms), at a busy spot (lots of animals about), over
// a stretch of walking.   node tools/_profile.mjs [seed x z seconds quality]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'polaris', x = '399', z = '1025', secs = '30', quality = 'medium'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript((q) => localStorage.setItem('facet-lands:quality', q), quality);
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=0&hour=17.5&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
await page.waitForTimeout(3000);
const result = await page.evaluate(async (secs) => {
  const w = window.world;
  const parts = {
    animals: [w.wildlife, 'update'], game: [w.game, 'update'], chunks: [w.chunks, 'update'], cull: [w.chunks, 'cull'],
    fish: [w.fish, 'update'], insects: [w.insects, 'update'], clouds: [w.clouds, 'update'], controls: [w.controls, 'update'],
    rain: [w.rain, 'update'], showers: [w.showers, 'update'], dayNight: [w.dayNight, 'update'], trees: [w.trees, 'update'],
    draw: [w.renderer, 'render'], drawRays: [w.rayEffects, 'render'],
  };
  const t = {};
  for (const [name, [obj, fn]] of Object.entries(parts)) {
    if (!obj?.[fn]) continue;
    const orig = obj[fn].bind(obj);
    t[name] = { sum: 0, max: 0, n: 0 };
    obj[fn] = (...args) => {
      const s = performance.now();
      const r = orig(...args);
      const d = performance.now() - s;
      const e = t[name];
      e.sum += d; e.n++; if (d > e.max) e.max = d;
      return r;
    };
  }
  // A frame's total: rAF to rAF.
  let frames = 0, last = performance.now(), worst = 0, total = 0;
  const end = performance.now() + secs * 1000;
  w.controls.keys.add('KeyW');
  w.wildlife.profile = {};
  await new Promise((done) => {
    const f = () => {
      const now = performance.now();
      const d = now - last;
      last = now;
      if (frames++) (total += d), (worst = Math.max(worst, d));
      if (now < end) requestAnimationFrame(f);
      else done();
    };
    requestAnimationFrame(f);
  });
  w.controls.keys.delete('KeyW');
  const out = { frames, avgFrame: +(total / (frames - 1)).toFixed(1), worstFrame: +worst.toFixed(1), animals: w.wildlife.animals.length, parts: {} };
  for (const [k, e] of Object.entries(t)) if (e.n) out.parts[k] = { avg: +(e.sum / frames).toFixed(2), max: +e.max.toFixed(1) };
  // Inside the animals: each kind's share, per frame (ms), and how many of each.
  const counts = {};
  for (const a of w.wildlife.animals) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
  out.animalParts = Object.fromEntries(Object.entries(w.wildlife.profile).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${(v / frames).toFixed(2)} ms (${counts[k] ?? '-'})`]));
  delete w.wildlife.profile;
  return out;
}, +secs);
console.log(JSON.stringify(result, null, 1));
await browser.close();
