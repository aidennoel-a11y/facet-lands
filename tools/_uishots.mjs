// The menus as a player sees them: the new-world card, the loading screen;
// then a shadow close up (its edges), and how much a bush slows you.
//   node tools/_uishots.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'ui';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.addInitScript(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.goto('http://localhost:4173/', { timeout: 180000 });
await page.click('[data-go="start"]');
await page.click('[data-go="new"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}-new.png` });
await page.fill('#sm-seed', 'polaris');
await page.click('.sm-mode[data-mode="testing"]');
await page.click('[data-go="play"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-loading.png` });
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 600000, polling: 500 });
await page.waitForTimeout(3000);
// How slow in a bush: the slowdown at a bush's middle, and at its edge.
const slow = await page.evaluate(() => {
  const { trees } = window.world;
  for (const list of trees.foliage?.values?.() ?? []) {
    for (let k = 0; k < list.length; k += 6) {
      const x = list[k], z = list[k + 1], bottom = list[k + 2], top = list[k + 3], r = list[k + 4];
      if (top - bottom > 2) continue;
      const at = (d) => trees.leaves({ x: x + d, y: bottom + 1.7, z }, 0.35, bottom, 1.8);
      return { r: +r.toFixed(2), middle: +at(0).toFixed(2), half: +at(r * 0.5).toFixed(2), edge: +at(r).toFixed(2) };
    }
  }
  return null;
});
console.log('bush slowdown', JSON.stringify(slow));
await browser.close();
