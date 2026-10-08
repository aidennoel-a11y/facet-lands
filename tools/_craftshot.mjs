// The crafting tree, as a new survivor sees it (a few things in the pack).   node tools/_craftshot.mjs out.png
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'craft.png';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=300&z=-200&up=0&vd=1&hour=12', { timeout: 180000 });
await page.waitForFunction(() => window.world?.game, null, { timeout: 300000 });
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const g = window.world.game;
  g.mode = 'survival';
  g.progress = new Set(['campfire']);
  g.inventory.slots[0] = { id: 'stick', count: 6 };
  g.inventory.slots[1] = { id: 'rock', count: 5 };
  g.inventory.slots[2] = { id: 'vine', count: 3 };
  g.inventory.slots[3] = { id: 'log', count: 4 };
  g.inventory.changed?.();
  g.hud.toggleCraft(g.inventory);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
