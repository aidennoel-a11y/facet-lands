// Hiding the land behind the hills (ChunkManager.cull) must hide only what
// can't be seen: drawn with it and without, in the same frame, the picture
// must be the same, pixel for pixel. And how much it saves.
//   node tools/occlusion-test.mjs [seed x z yaw...]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed = 'polaris', x = '-4000', z = '-8000', ...yaws] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&up=0&hide&hour=11&loadscreen`, { timeout: 180000 });
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 600000, polling: 500 });
await page.waitForFunction(() => window.world.chunks.pendingCount === 0, null, { timeout: 600000, polling: 500 }).catch(() => console.log('(still building)'));
let fail = 0;
for (const yaw of yaws.length ? yaws.map(Number) : [0, 1.57, 3.14, 4.71]) {
  const r = await page.evaluate((yaw) => {
    const { renderer, scene, camera, chunks, controls } = window.world;
    controls.euler.set(0.05, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(controls.euler);
    camera.updateMatrixWorld();
    chunks.cullDirty = true;
    chunks.cull(camera.position);
    const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const shot = () => {
      renderer.render(scene, camera); // (the first time, the shadows too: counted from the second)
      renderer.render(scene, camera);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { px, tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
    };
    const hidden = [...chunks.chunks.values()].filter((c) => !c.group.visible);
    const a = shot();
    for (const c of hidden) c.group.visible = true;
    const b = shot();
    for (const c of hidden) c.group.visible = false;
    let diff = 0;
    for (let i = 0; i < a.px.length; i += 4) if (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]) > 6) diff++;
    return { hidden: hidden.length, of: chunks.chunks.size, diff, tris: [a.tris, b.tris], calls: [a.calls, b.calls] };
  }, yaw);
  const ok = r.diff === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  looking ${yaw}: ${r.hidden} of ${r.of} chunks hidden, ${r.diff} pixels differ; triangles ${r.tris[1]} -> ${r.tris[0]}, draw calls ${r.calls[1]} -> ${r.calls[0]}`);
}
const cost = await page.evaluate(() => {
  const { chunks, camera } = window.world, t = performance.now();
  for (let k = 0; k < 20; k++) (chunks.cullDirty = true), chunks.cull(camera.position);
  return (performance.now() - t) / 20;
});
console.log(`  working it out: ${cost.toFixed(2)} ms a time (here, drawn in software: a real computer is several times quicker)`);
await browser.close();
process.exit(fail ? 1 : 0);
