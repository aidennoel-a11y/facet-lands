// Moving through the world: how long the land's upkeep takes each frame
// (ChunkManager.update, and the hiding behind hills) as you go, and its
// worst frames: the hitches you'd feel.
//   node tools/walktest.mjs [seconds speed seed x z]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [secs = '60', speed = '9', seed = 'polaris', x = '300', z = '-200'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=3&hide&hour=11&loadscreen`, { timeout: 180000 });
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 600000, polling: 500 });
await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 500 }).catch(() => console.log('(still building)'));
const r = await page.evaluate(async ([secs, speed]) => {
  const { chunks, camera, controls, renderer, rayEffects } = window.world;
  controls.mode = 'fly';
  // (Not drawn: here, drawing in software takes seconds a frame. The land's built and kept as ever.)
  renderer.render = () => {};
  if (rayEffects) rayEffects.render = () => {};
  // (Timed: each frame's upkeep, and where it went.)
  const frames = [], parts = {};
  const time = (obj, name, label) => {
    const f = obj[name].bind(obj);
    obj[name] = (...a) => {
      const t = performance.now();
      const out = f(...a);
      const d = performance.now() - t;
      parts[label] = (parts[label] ?? 0) + d;
      cur[label] = (cur[label] ?? 0) + d;
      return out;
    };
  };
  let cur = {};
  time(chunks, 'update', 'chunks');
  time(chunks, 'cull', 'cull');
  const start = performance.now();
  let last = start;
  // (Straight on, over the land, at `speed` m/s, a little above it.)
  await new Promise((done) => {
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      camera.position.x += speed * dt;
      const g = chunks.groundHeightAt(camera.position.x, camera.position.z);
      if (Number.isFinite(g)) camera.position.y = Math.max(g, 10) + 3;
      // (What was built this frame, layer by layer, and whether you'd crossed into another chunk.)
      const L = chunks.stats.layers, was = step.layers ?? {};
      for (const k in L) if (L[k] - (was[k] ?? 0) > 0.5) cur[k] = +(L[k] - (was[k] ?? 0)).toFixed(1);
      step.layers = { ...L };
      if (chunks.stats.terrainMs - (step.terrain ?? 0) > 0.5) cur.terrain = +(chunks.stats.terrainMs - (step.terrain ?? 0)).toFixed(1);
      step.terrain = chunks.stats.terrainMs;
      if (chunks.centerKey !== step.centre) (cur.crossed = true), (step.centre = chunks.centerKey);
      cur.builds = chunks.stats.builds - (step.builds ?? chunks.stats.builds);
      step.builds = chunks.stats.builds;
      frames.push(cur);
      cur = {};
      if (now - start < secs * 1000) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
  const up = frames.map((f) => (f.chunks ?? 0) + (f.cull ?? 0)).sort((a, b) => a - b);
  const q = (p) => up[Math.min(up.length - 1, Math.floor(up.length * p))];
  const worst = [...frames].sort((a, b) => (b.chunks ?? 0) + (b.cull ?? 0) - (a.chunks ?? 0) - (a.cull ?? 0)).slice(0, 8).map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(1) : v])));
  const crossings = frames.filter((f) => f.crossed).map((f) => +((f.chunks ?? 0) + (f.cull ?? 0)).toFixed(1));
  return { worst, crossings, frames: frames.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: up[up.length - 1], over16: up.filter((v) => v > 16).length, over33: up.filter((v) => v > 33).length, parts, stats: chunks.stats };
}, [+secs, +speed]);
const f = (v) => v.toFixed(1);
console.log(`${r.frames} frames: the land's upkeep p50 ${f(r.p50)} ms, p95 ${f(r.p95)}, p99 ${f(r.p99)}, worst ${f(r.max)}; over 16 ms: ${r.over16}, over 33 ms: ${r.over33}`);
console.log('  worst frames:');
for (const w of r.worst) console.log('   ', JSON.stringify(w));
console.log('  frames crossing into another chunk:', JSON.stringify(r.crossings));
console.log('  total', Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, Math.round(v)])), 'layers', Object.fromEntries(Object.entries(r.stats.layers).map(([k, v]) => [k, Math.round(v)])), 'terrain', Math.round(r.stats.terrainMs), 'builds', r.stats.builds);
await browser.close();
