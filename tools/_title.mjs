// The title screen, as a player opens the game: shown? and any errors.   node tools/_title.mjs [url] [out.png]
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [url = 'http://localhost:4173/', out = 'title.png'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.goto(url, { timeout: 180000 });
await page.waitForTimeout(8000);
console.log(JSON.stringify(await page.evaluate(() => ({ menu: !!document.querySelector('.start-menu'), shown: document.querySelector('.start-menu') ? !document.querySelector('.start-menu').hidden : null, world: !!window.world }))));
await page.screenshot({ path: out });
await browser.close();
