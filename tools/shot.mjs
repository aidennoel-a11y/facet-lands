// Screenshots of the game in headless Chromium (Playwright), with no clicking
// about: each view is a test address (see TEST in src/main.js).
//   npm run build && npx vite preview --port 4173 &
//   node tools/shot.mjs out.png "seed=polaris&x=100&z=200&y=60&yaw=0&pitch=-0.3&hour=12&vd=6&hide" [wait seconds]
// Prints the panel's readout and any errors. (Software rendering is slow:
// give a new area a minute or more to fill in.)
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'shot.png', query = '', wait = '60'] = process.argv.slice(2);
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?${query}`);
await page.waitForTimeout(+wait * 1000);
await page.screenshot({ path: out });
const info = await page.evaluate(() => ['stat-biome', 'stat-pos', 'stat-chunks', 'stat-fps'].map((id) => document.getElementById(id)?.textContent).join(' | '));
console.log(info);
if (errors.length) console.log('errors:', errors.slice(0, 10));
await browser.close();
