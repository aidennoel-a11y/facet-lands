// Renders one of the game's sounds (Sound.call kinds: splash, bigsplash,
// chop, baa, howl...) to a WAV, offline in headless Chromium, and prints its
// loudness and brightness every 20 ms: to hear and check a sound without
// playing the game.  (Needs the preview server, as tools/shot.mjs.)
//   node tools/sound.mjs splash splash.wav
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [kind = 'splash', out = `${kind}.wav`] = process.argv.slice(2);
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.addInitScript(() => {
  window.AudioContext = function () { return (window.__off = new OfflineAudioContext(1, 44100 * 4, 44100)); };
});
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?vd=2`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.world?.sound, null, { timeout: 60000 });
await page.keyboard.press('Shift'); // (sound starts on the first key)
await page.waitForFunction(() => window.__off, null, { timeout: 10000 });
const res = await page.evaluate(async (kind) => {
  const s = window.world.sound;
  if (s.rainGain) s.rainGain.gain.value = 0;
  s.call(kind, 0, 0.8);
  const d = (await window.__off.startRendering()).getChannelData(0);
  const env = [], bright = [];
  for (let i = 0; i < 44100 * 1.5; i += 882) {
    let e = 0, z = 0;
    for (let k = i; k < i + 882; k++) (e += d[k] * d[k]), (z += (d[k] >= 0) !== (d[k + 1] >= 0) ? 1 : 0);
    env.push(Math.sqrt(e / 882).toFixed(3));
    bright.push(Math.round((z / 882) * 22050));
  }
  let peak = 1e-6;
  for (const v of d) peak = Math.max(peak, Math.abs(v));
  const n = 44100 * 2, bytes = new Uint8Array(44 + n * 2), v = new DataView(bytes.buffer);
  const w = (o, str) => [...str].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let k = 0; k < n; k++) v.setInt16(44 + k * 2, Math.max(-1, Math.min(1, (d[k] / peak) * 0.9)) * 32767, true);
  return { env, bright, peak, wav: Array.from(bytes) };
}, kind);
console.log('peak', res.peak.toFixed(3));
console.log('loudness /20ms', res.env.join(' '));
console.log('brightness Hz', res.bright.join(' '));
fs.writeFileSync(out, Buffer.from(res.wav));
await browser.close();
