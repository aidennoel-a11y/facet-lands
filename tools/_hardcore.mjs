// Survival is for keeps: make a survival world through the menu (the
// one-time warning first), live a day, die, and check that the save is gone
// before the death screen, that the world can't be carried on, and that a
// new life on it starts afresh.   node tools/_hardcore.mjs outprefix
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] ?? 'hardcore';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
await page.goto('http://localhost:4173/', { timeout: 180000 });
await page.evaluate(() => localStorage.setItem('facet-lands:quality', 'low'));
await page.click('[data-go="start"]');
await page.click('[data-go="new"]');
await page.fill('#sm-seed', 'polaris');
await page.fill('#sm-name', 'Hard');
await page.click('[data-go="play"]');
const note = await page.textContent('.sm-note');
ok('warned once', /for keeps/.test(note), note.slice(0, 40));
await page.click('[data-go="play"]');
await page.waitForFunction(() => document.querySelector('.load-screen')?.classList.contains('ls-done'), null, { timeout: 600000, polling: 500 });
await page.waitForTimeout(2000);
const id = await page.evaluate(() => JSON.parse(localStorage.getItem('facet-lands:worlds')).find((w) => w.name === 'Hard').id);
// A day and a half goes by; something built; saved.
const before = await page.evaluate((id) => {
  const g = window.world.game;
  g.passDays(1.6);
  g.dirty = true;
  g.save();
  return { saved: !!localStorage.getItem(`facet-lands:survival:${id}`), age: g.age };
}, id);
ok('saved while alive', before.saved, `age ${before.age}`);
// The almanac (top right), and the quiet word at seven days.
await page.evaluate(() => window.world.game.passDays(5.5));
await page.waitForTimeout(1500);
const alm = await page.textContent('.almanac');
ok('almanac shows', /Day 8/.test(alm) && /Longest/.test(alm), alm.replace(/\s+/g, ' ').trim());
ok('seven-day toast', /Seven days/.test(await page.textContent('.al-toast')));
await page.screenshot({ path: `${out}-almanac.png` });
const clock = await page.evaluate((id) => { window.world.game.save(); return JSON.parse(localStorage.getItem(`facet-lands:survival:${id}`)).clock; }, id);
ok('clock saved', clock && Number.isFinite(clock.season), JSON.stringify(clock));
// Dying: when the screen shows, the save must already be gone.
await page.evaluate((id) => {
  const g = window.world.game;
  let seen = null;
  const show = g.hud.death.bind(g.hud);
  g.hud.death = (info) => {
    seen = { save: localStorage.getItem(`facet-lands:survival:${id}`), world: JSON.parse(localStorage.getItem('facet-lands:worlds')).find((w) => w.id === id) };
    show(info);
  };
  g.survival.hurt(1000, 'a fall');
  window.__seen = () => seen;
}, id);
await page.waitForFunction(() => window.__seen(), null, { timeout: 60000 });
const atDeath = await page.evaluate(() => window.__seen());
await page.waitForTimeout(1200);
ok('save gone before the screen', atDeath && atDeath.save === null);
ok('world marked dead', atDeath?.world?.dead === true, `lastDays ${atDeath?.world?.lastDays}`);
const text = await page.textContent('.death');
ok('death screen text', /survived 7 days/.test(text) && /Back to the menu/.test(text), text.replace(/\s+/g, ' ').trim());
await page.screenshot({ path: `${out}-death.png` });
// Closing the tab now (the unload save) mustn't bring it back.
await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
ok('unload saves nothing', await page.evaluate((id) => localStorage.getItem(`facet-lands:survival:${id}`) === null, id));
await page.click('.death .respawn');
await page.waitForTimeout(500);
ok('back at the title', await page.isVisible('[data-go="start"]'));
await page.click('[data-go="start"]');
await page.click('[data-go="load"]');
const row = await page.textContent(`.sm-world[data-id="${id}"]`);
ok('listed as died', /Died after 7 days/.test(row), row.replace(/\s+/g, ' ').trim());
ok('can\'t be played again', await page.isDisabled(`.sm-world[data-id="${id}"]`));
await page.screenshot({ path: `${out}-list.png` });
// Nor a new survival world on that seed (creative is fine).
await page.click('[data-go="back"]');
await page.click('[data-go="new"]');
await page.fill('#sm-seed', 'Polaris ');
await page.click('[data-go="play"]');
ok('seed refused', /will not take you back/.test(await page.textContent('.sm-note')));
ok('still on the menu', await page.isVisible('#sm-seed'));
await browser.close();
