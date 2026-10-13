// A bird's nest and a wild bees' nest up in the trees, looked at; a skein of geese overhead; and reading tracks crouched.   node tools/_treefinds.mjs out
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'finds';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4173/?seed=polaris&x=300&z=-200&up=0&vd=2&hide&hour=11&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(35000);
for (const kind of ['nest', 'hive']) {
  const r = await page.evaluate((kind) => {
    const { game, camera, controls } = window.world;
    const f = game.treeFinds.near.find((n) => n.kind === kind);
    if (!f) return 'none';
    camera.position.set(f.x + 2.2, f.y + 0.6, f.z + 2.2);
    camera.lookAt(f.x, f.y, f.z);
    controls.euler.setFromQuaternion(camera.quaternion, 'YXZ');
    return `${kind} at ${f.x.toFixed(0)},${f.y.toFixed(1)},${f.z.toFixed(0)}`;
  }, kind);
  console.log(r);
  await page.waitForTimeout(6000);
  console.log(await page.evaluate(() => { const tf = window.world.game.treeFinds, c = window.world.camera.position; return JSON.stringify({ hives: tf.hives.count, nests: tf.nests.count, cam: c.toArray().map((v) => +v.toFixed(1)), near: tf.near.filter((f) => f.kind === 'hive').length }); }));
  await page.screenshot({ path: `${out}-${kind}.png` });
}
// Geese: one skein, sent over now, looked up at.
await page.evaluate(() => {
  const { camera, controls } = window.world;
  const g = window.world.geese;
  if (!g) return;
  g.wait = 0;
});
console.log('errors', errs);
await browser.close();
