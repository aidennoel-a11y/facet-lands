// Iron ore lying about on the surface: how many veins in the chunks round a few places.   node tools/_ironcount.mjs
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [x, z] of [[300, -200], [-715, -689]]) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto(`http://localhost:4173/?seed=polaris&x=${x}&z=${z}&up=0&vd=2&hide`, { timeout: 180000 });
  await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
  console.log(x, z, await page.evaluate(() => {
    const { game, generator, camera } = window.world, all = [...game.items.chunks.values()].flatMap((c) => c.items);
    const n = (id) => all.filter((it) => it.id === id).length;
    return JSON.stringify({ chunks: game.items.chunks.size, mount: +generator.getMountainness(camera.position.x, camera.position.z).toFixed(2), iron: n('iron'), rock: n('rock'), flint: n('flint') });
  }));
  await page.close();
}
await browser.close();
