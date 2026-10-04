// A screenshot from (x, z), `up` metres above the ground: node tools/_shot.mjs seed x z up yaw pitch hour out.png
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { TerrainGenerator } from '../src/world/TerrainGenerator.js';
import { WORLD } from '../src/config.js';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [seed, x, z, up = '3', yaw = '0', pitch = '-0.1', hour = '13', out = 'shot.png'] = process.argv.slice(2);
const y = new TerrainGenerator(seed, WORLD).getBaseHeight(+x, +z) + +up;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.goto(`http://localhost:4173/?seed=${seed}&x=${x}&z=${z}&y=${y}&yaw=${yaw}&pitch=${pitch}&vd=3&hide&hour=${hour}`, { timeout: 180000 });
await page.waitForFunction(() => window.world?.chunks, null, { timeout: 200000 });
await page.waitForTimeout(60000);
await page.screenshot({ path: out });
await browser.close();
