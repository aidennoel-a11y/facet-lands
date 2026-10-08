// Steel and gold: what lies about high in the mountains (coal, mountain ore)
// and on a mesa top (gold), the crafting tree's steel tier, and the
// testing panel's Skip a day.   node tools/_steel.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'steel';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
const count = () => page.evaluate(() => {
  const n = {};
  for (const c of window.world.game.items.chunks.values()) for (const it of c.items) n[it.id] = (n[it.id] ?? 0) + 1;
  return n;
});
const go = async (x, z) => {
  await page.evaluate(([x, z]) => { const { camera, generator } = window.world; camera.position.set(x, generator.getHeight(x, z) + 30, z); }, [x, z]);
  await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  await page.waitForTimeout(3000);
};
await page.goto('http://localhost:4173/?seed=polaris&x=-2920&z=-9040&up=30&vd=2&hour=12', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(3000);
const high = await count();
ok('coal and mountain ore lie about up high', (high.coal ?? 0) > 0 && (high.mountainOre ?? 0) > 0, JSON.stringify(high));
await go(-2289, 5001);
const mesa = await count();
ok('gold on the mesa top', (mesa.goldOre ?? 0) > 0, JSON.stringify(mesa));
// Skip a day.
const before = await page.evaluate(() => window.world.seasons.time);
await page.click('#skip-day');
const after = await page.evaluate(() => window.world.seasons.time);
ok('skip a day moves the season a day', Math.abs((after - before) * 12 - 1) < 0.01, `${before.toFixed(3)} -> ${after.toFixed(3)}; ${await page.textContent('#season-day')}`);
// The steel tier.
await page.evaluate(() => { const g = window.world.game; g.mode = 'survival'; g.progress = new Set(['campfire', 'ironBar', 'steelBar']); g.hud.toggleCraft(g.inventory); });
await page.waitForTimeout(800);
const tree = await page.textContent('.craft');
ok('sword and steel armour in the steel tier', /Steel sword/i.test(tree) && /Steel armour/i.test(tree));
await page.screenshot({ path: `${out}-craft.png` });
await browser.close();
