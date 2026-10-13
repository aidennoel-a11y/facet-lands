import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
await page.goto('http://localhost:4173/?seed=polaris&x=300&z=-200&up=0&vd=2&hide&hour=11&weather=clear', { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(30000);
console.log(await page.evaluate(() => {
  const tf = window.world.game.treeFinds;
  const m = new window.world.THREE.Matrix4(), p = new window.world.THREE.Vector3();
  tf.hives.getMatrixAt(0, m); p.setFromMatrixPosition(m);
  const g = tf.hives.geometry; g.computeBoundingBox();
  return JSON.stringify({ hives: tf.hives.count, nests: tf.nests.count, eggs: tf.eggs.count, bees: tf.bees.count, first: p.toArray().map((v) => +v.toFixed(1)), bbox: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()], visible: tf.group.visible, parent: !!tf.group.parent, finds: tf.near.filter((f) => f.kind === 'hive').map((f) => [f.x.toFixed(0), f.y.toFixed(1), f.z.toFixed(0)]) });
}));
await browser.close();
