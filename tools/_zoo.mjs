// The new animals, side by side on open ground (tame, so they stand still):
// a shot to see them; then a lion let loose, to check it warns before it
// bites, and a scorpion, before it stings.   node tools/_zoo.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'zoo';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 200)));
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
await page.goto('http://localhost:4173/?seed=polaris&x=399&z=1025&up=0&vd=1&hide&hour=12&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks && window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 1000 });
await page.waitForTimeout(2000);
const peaceful = await page.$('#peaceful');
await page.evaluate(() => { const el = document.getElementById('peaceful'); if (el && !el.checked) el.click(); });
await page.evaluate(() => {
  const { wildlife, camera, controls } = window.world;
  wildlife.animals.length = 0;
  const kinds = ['elephant', 'hippo', 'camel', 'lion', 'lion', 'hyena', 'scorpion', 'python'];
  const c = camera.position, g = window.world.generator;
  c.y = g.getHeight(c.x, c.z) + 3;
  controls.euler.set(-0.1, 0, 0, 'YXZ');
  camera.quaternion.setFromEuler(controls.euler);
  const fwd = { x: -Math.sin(0), z: -Math.cos(0) };
  kinds.forEach((k, i) => {
    const across = (i - 3.5) * 3.4, ahead = k === 'scorpion' ? 4 : k === 'python' ? 7 : k === 'elephant' || k === 'hippo' ? 20 : 13;
    const a = wildlife.spawn(k, c.x + (k === 'scorpion' ? 0.6 : k === 'python' ? -1.5 : across), c.z + fwd.z * ahead);
    if (a) {
      a.heading = Math.PI / 2;
      if (k === 'lion' && i === 4) (a.antlers = true), (a.scale *= 1.12);
    }
  });
});
// (Held where they were put, facing across, for the picture.)
await page.evaluate(() => { for (const a of window.world.wildlife.animals) if (a.home) (a.hold = { x: a.x, z: a.z }); });
for (let k = 0; k < 6; k++) {
  await page.evaluate(() => { for (const a of window.world.wildlife.animals) if (a.hold) (a.x = a.hold.x), (a.z = a.hold.z), (a.heading = Math.PI / 2), (a.speed = 0); });
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${out}-line.png` });
console.log(JSON.stringify(await page.evaluate(() => window.world.wildlife.animals.map((a) => a.kind))));
await browser.close();
