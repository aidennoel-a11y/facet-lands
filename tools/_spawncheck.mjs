// A new survival world through the menu: where you start (on the ground? what biome? what season?).
//   node tools/_spawncheck.mjs [seed]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const seed = process.argv[2] ?? 'polaris';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/', { timeout: 180000 });
await page.evaluate(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.click('[data-go="start"]');
await page.click('[data-go="new"]');
await page.fill('#sm-seed', seed);
await page.fill('#sm-name', 'Spawn');
await page.click('[data-go="play"]');
await page.waitForTimeout(500);
if (await page.$('[data-go="play"]')) await page.click('[data-go="play"]').catch(() => {});
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 600000, polling: 500 });
const r = () => page.evaluate(() => {
  const { camera, generator, game, seasons, controls } = window.world, p = camera.position;
  return { aboveGround: +(p.y - controls.eyeHeight - generator.getHeight(p.x, p.z)).toFixed(2), biome: generator.getBiome(p.x, p.z).id, season: seasons.time, mode: game.mode, walk: controls.mode, health: game.survival?.health };
});
console.log('start', JSON.stringify(await r()));
await page.waitForTimeout(8000);
console.log('later', JSON.stringify(await r()));
await browser.close();
