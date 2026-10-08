// Fair warning: a lion (made angry) gathers itself before its first bite;
// a scorpion rears before it stings; an elephant threatens before it
// charges. Records when each first hurts you, and whether the warning came
// first.   node tools/_warn.mjs
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=0&vd=1&hide&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(1500);
// Walking, on the ground; no other animals about.
await page.evaluate(() => {
  const { controls } = window.world;
  if (controls.mode !== 'walk') document.getElementById('fly')?.click();
});
// (Down on the ground first.)
await page.waitForFunction(() => { const { camera, generator, controls } = window.world; return controls.mode === 'walk' && camera.position.y - generator.getHeight(camera.position.x, camera.position.z) < 2.2; }, null, { timeout: 120000, polling: 250 });
await page.waitForTimeout(1500);
for (const [kind, d, provoke] of [['lion', 7, 'wound'], ['scorpion', 1.0, null], ['elephant', 6, null]]) {
  const r = await page.evaluate(async ([kind, d, provoke]) => {
    const { wildlife, camera, game } = window.world;
    wildlife.animals.length = 0;
    game.newLife();
    game.hud.alive();
    const c = camera.position;
    const a = wildlife.spawn(kind, c.x, c.z - d);
    if (!a) return { error: 'no spawn' };
    const log = [];
    const hurt = game.hurt.bind(game);
    game.hurt = (amount, cause, o) => { log.push({ t: performance.now(), what: cause, amount: Math.round(amount) }); hurt(amount, cause, o); };
    const t0 = performance.now();
    if (provoke === 'wound') wildlife.wound(a, { from: c.clone() });
    let warned = null;
    for (let k = 0; k < 120; k++) {
      await new Promise((r) => setTimeout(r, 100));
      if (warned === null && (a.windup > 0 || a.state === 'threat' || a.threaten > 0)) warned = performance.now() - t0;
      if (log.length) break;
      // (Keep it close: we stand still.)
    }
    game.hurt = hurt;
    return { warned, firstHurt: log.length ? log[0].t - t0 : null, amount: log[0]?.amount ?? 0, cause: log[0]?.what, state: a.state, d: Math.hypot(a.x - c.x, a.z - c.z).toFixed(1), dy: (c.y - a.y).toFixed(1) };
  }, [kind, d, provoke]);
  ok(`${kind} warns before it hurts`, r.warned !== null && (r.firstHurt === null || r.warned < r.firstHurt), JSON.stringify(r));
}
await browser.close();
