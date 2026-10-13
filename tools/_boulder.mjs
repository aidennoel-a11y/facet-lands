// A boulder broken up: gone from the rock layer, a burst of chips and dust, no errors.   node tools/_boulder.mjs
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=300&z=-200&up=2&hide&vd=2', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && [...window.world.game.rocks.boulders.values()].some((l) => l.length), null, { timeout: 300000, polling: 1000 });
const r = await page.evaluate(() => {
  const { game } = window.world, rocks = game.rocks;
  const [ck, list] = [...rocks.boulders].find(([, l]) => l.length);
  const before = list.length / 7, key = rocks.keyOf(list[0], list[1]);
  const ok = rocks.removeKey(key);
  game.felling.burst({ x: list[0] ?? 0, y: 10, z: 0 }, 1.5);
  return { ck, before, after: rocks.boulders.get(ck).length / 7, ok, chips: game.felling.chips.length, removed: [...rocks.removed] };
});
console.log(JSON.stringify(r));
await page.waitForTimeout(4000);
console.log('chips left', await page.evaluate(() => window.world.game.felling.chips.length));
await browser.close();
