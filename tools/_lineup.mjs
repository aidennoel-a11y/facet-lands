// A line of animals held side-on for a look at their models (bosses too):
//   node tools/_lineup.mjs out.png kind[,kind...] [state] [ahead]
// (a boss by its id after a '!': !scar, !greymane, !kingmane ...)
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'lineup.png', list = 'horse,elephant', state = 'look', ahead = '12'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=0&vd=1&hide&hour=11&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(2000);
await page.evaluate(() => { const el = document.getElementById('peaceful'); if (el && !el.checked) el.click(); });
await page.evaluate(([list, ahead]) => {
  const { wildlife, camera, controls, generator: g } = window.world;
  wildlife.animals.length = 0;
  const kinds = list.split(','), c = camera.position;
  c.y = g.getHeight(c.x, c.z) + 2.2;
  controls.euler.set(-0.08, 0, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  kinds.forEach((k, i) => {
    const x = c.x + (i - (kinds.length - 1) / 2) * (+ahead * 0.55), z = c.z - +ahead;
    const a = k.startsWith('!') ? wildlife.spawnBoss(k.slice(1), x, z) : wildlife.spawn(k, x, z);
    if (a) (a.hold = { x: a.x, z: a.z }), (a.aggressive = false);
  });
}, [list, ahead]);
for (let k = 0; k < 8; k++) {
  await page.evaluate((st) => { for (const a of window.world.wildlife.animals) if (a.hold) (a.x = a.hold.x), (a.z = a.hold.z), (a.heading = Math.PI / 2), (a.speed = 0), (a.state = st), (a.timer = 9); }, state);
  await page.waitForTimeout(300);
}
await page.screenshot({ path: out });
console.log(JSON.stringify(await page.evaluate(() => window.world.wildlife.animals.map((a) => a.kind + (a.boss ? '*' : '')))));
await browser.close();
