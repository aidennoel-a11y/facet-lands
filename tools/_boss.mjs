// A great beast: Old Scar set down near you; it warns before each blow;
// the health bar shows its name and health as you fight it; struck down
// (sword blows), it gives its pelt; and a shot of it.   node tools/_boss.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'boss';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=0&vd=1&hide&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => { if (window.world.controls.mode !== 'walk') document.getElementById('fly')?.click(); });
await page.waitForFunction(() => { const { camera, generator, controls } = window.world; return controls.mode === 'walk' && camera.position.y - generator.getHeight(camera.position.x, camera.position.z) < 2.2; }, null, { timeout: 120000, polling: 250 });
await page.evaluate(() => {
  const { wildlife, camera, game, controls } = window.world;
  wildlife.animals.length = 0;
  game.newLife();
  game.hud.alive();
  game.inventory.slots[0] = { id: 'sword', count: 1, dur: 260 };
  game.inventory.armour = { id: 'steelArmour', count: 1, dur: 160 };
  game.hotbar.index = 0;
  const c = camera.position;
  window.__boss = wildlife.spawnBoss('scar', c.x, c.z - 14);
  controls.euler.set(-0.05, 0, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  window.__log = [];
  const hurt = game.hurt.bind(game);
  game.hurt = (amount, cause, o) => { window.__log.push({ t: performance.now(), amount: Math.round(amount), cause, windup: window.__boss.windup > 0 || window.__boss.ready }); hurt(amount, cause, o); };
});
const spawned = await page.evaluate(() => !!window.__boss && window.__boss.scale.toFixed(2));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-far.png` });
ok('Old Scar is here', !!spawned, `scale ${spawned}`);
// Let it come and strike once (headless frames are slow: up to a minute).
let first = null;
for (let k = 0; k < 120 && !first; k++) {
  await page.waitForTimeout(500);
  first = await page.evaluate(() => window.__log[0] ?? null);
}
await page.screenshot({ path: `${out}-close.png` });
ok('it came for you, warning first', !!first && first.windup, JSON.stringify(first));
const bar = await page.evaluate(() => ({ shown: !document.querySelector('.bossbar').hidden, name: document.querySelector('.bossbar span').textContent }));
ok('the health bar shows', bar.shown && bar.name === 'Old Scar', JSON.stringify(bar));
// Bring it down: sword blows (sharp 3).
const fight = await page.evaluate(() => {
  const { wildlife } = window.world, a = window.__boss, health = [];
  let blows = 0;
  while (a.alive && blows < 60) {
    wildlife.wound(a, { sharp: 3 });
    blows++;
    health.push(+window.world.wildlife.constructor.bossHealth(a).toFixed(2));
  }
  return { blows, dead: !a.alive, health: health.slice(0, 4) };
});
ok('steel brings it down in a good many blows', fight.dead && fight.blows >= 8 && fight.blows <= 14, JSON.stringify(fight));
await page.waitForTimeout(1500);
const got = await page.evaluate(() => window.world.wildlife.butcher(window.__boss));
ok('its pelt, and a haul', got && got.grizzlyPelt === 1 && got.rawMeat >= 10, JSON.stringify(got));
await browser.close();
