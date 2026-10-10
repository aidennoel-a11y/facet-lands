// Frame time underground with a rope in hand (turning about) and without.   node tools/_ropecost.mjs seed x z y
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'qddgme', x = '-592', z = '31', y = '-41'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&y=${y}&hide&hour=15&weather=clear`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 900000, polling: 1000 });
for (let k = 0; k < 200; k++) {
  await page.evaluate((y) => { window.world.camera.position.y = +y; }, y);
  await page.waitForTimeout(500);
  if (k > 20 && k % 10 === 0) { const st = await page.evaluate(() => { const c = window.world.generator.caves.cache; let r = 0, a = 0; for (const e of c.values()) { a++; if (e.ready) r++; } return [r, a]; }); if (st[1] > 20 && st[0] === st[1]) break; }
}
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
const run = (id) => page.evaluate(async ([id, y]) => {
  const { game, camera, controls, groundAt } = window.world;
  game.inventory.slots[game.hotbar.index] = { id, count: 2 };
  game.inventory.changed();
  const times = [], cpu = [];
  const orig = game.__update ??= game.update.bind(game);
  game.update = (...a) => { const t0 = performance.now(); const r = orig(...a); cpu.push(performance.now() - t0); return r; };
  let last = performance.now();
  await new Promise((done) => {
    const step = () => {
      const now = performance.now();
      times.push(now - last);
      last = now;
      controls.euler.y += 0.05; // (turning: the rope's place looked for afresh)
      camera.quaternion.setFromEuler(controls.euler);
      if (times.length < 60) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
  // And the time to work out one rope plan, directly.
  times.sort((a, b) => a - b);
  cpu.sort((a, b) => a - b);
  return { gameMedian: cpu[cpu.length >> 1]?.toFixed(2), gameWorst: cpu[cpu.length - 1]?.toFixed(2), plan: game.plan && { ok: game.plan.ok, why: game.plan.why } };
}, [id, y]);
console.log('stick', JSON.stringify(await run('stick')));
console.log('rope ', JSON.stringify(await run('rope')));
console.log('stick', JSON.stringify(await run('stick')));
await browser.close();
