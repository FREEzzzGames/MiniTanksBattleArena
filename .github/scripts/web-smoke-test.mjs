import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const errors = [];
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
await page.goto(pathToFileURL(path.resolve('index.html')).href);
await page.waitForSelector('#game');
const click = async (selector) => page.locator(selector).click();
const control = async (index) => page.locator('#controls button').nth(index).click();
const status = async () => (await page.locator('#status').innerText()).trim();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(await page.locator('[data-mode]').count() === 3, 'Expected three game selectors');
await click('#play');
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.trim() === 'ACTIVE', null, { timeout: 1500 }).catch(() => {});
assert(await status() === 'ACTIVE', 'Tetris Play should start the game; page errors: ' + errors.join(' | ') + '; console: ' + consoleErrors.join(' | '));
assert(await page.locator('#controls button').count() === 7, 'Tetris must expose seven functional controls including Hold');
await control(0); await control(1); await control(2); await control(3); await control(4);
await control(5);
await control(6);
assert(await status() === 'PAUSED', 'Tetris pause button should pause');
assert((await page.locator('#play').innerText()).includes('RESUME'), 'Pause overlay must offer Resume');
await click('#play');
assert(await status() === 'ACTIVE', 'Resume should return to active play');
await control(4);

await click('[data-mode="arkanoid"]');
assert(await page.locator('#controls button').count() === 5, 'Arkanoid should expose five controls');
assert(await status() === 'ACTIVE', 'Selecting Arkanoid should start the game');
await control(0); await control(1); await control(2);
await control(3);
assert(await status() === 'PAUSED', 'Arkanoid pause should work');
await click('#play');
assert(await status() === 'ACTIVE', 'Arkanoid resume should work');
await control(4);
assert(await status() === 'ACTIVE', 'Arkanoid restart should remain playable');

await click('[data-mode="racing"]');
assert(await page.locator('#controls button').count() === 4, 'Racing should expose compact utility controls while MOBA overlay handles combat');
assert(await page.locator('#mobaPad').isVisible(), 'Racing should show the MOBA-style touch overlay');
assert(await page.locator('#mobaJoy').isVisible(), 'Racing should show the virtual movement joystick');
assert(await page.locator('#mobaFire').isVisible(), 'Racing should show the hold-to-fire button');
assert(await status() === 'ACTIVE', 'Selecting Neon Racing should start the game');
await control(0); // Exit vehicle
await page.locator('#mobaSwap').click(); // Switch weapon
await page.locator('#mobaSkill').click(); // Nitro
await page.locator('#mobaFire').click(); // Fire button is clickable without pointer-capture errors
await control(3); // Pause
assert(await status() === 'PAUSED', 'Racing pause should work');
await click('#play');
assert(await status() === 'ACTIVE', 'Racing resume should work');
await page.waitForTimeout(350);
// Driver exit, city building interaction, and a route back to the road.
await page.locator('#mobaExit').click();
await page.waitForTimeout(1750);
await page.keyboard.press('e');
await page.waitForTimeout(80);
assert((await page.locator('#task').innerText()).includes('BANK'), 'Walking mode should allow interaction with the bank');
await page.keyboard.press('ArrowRight'); // Auto dealer
await page.keyboard.press('e');
await page.waitForTimeout(80);
assert((await page.locator('#task').innerText()).includes('AUTO DEALER'), 'Auto dealer interaction should run');
await page.keyboard.press('ArrowRight'); // Real estate
await page.keyboard.press('e');
await page.waitForTimeout(80);
assert((await page.locator('#task').innerText()).includes('REAL ESTATE'), 'Real estate interaction should run');
await page.keyboard.press('ArrowRight'); // Gym
await page.keyboard.press('e');
await page.waitForTimeout(80);
assert((await page.locator('#task').innerText()).includes('GYM'), 'Gym interaction should run');
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft'); // Transit gate
await page.locator('#mobaExit').click();
await page.waitForTimeout(80);
assert((await page.locator('#task').innerText()).includes('RETURNED TO ROAD'), 'Transit gate should return the driver to the road');
// Check small portrait, landscape, and large viewport canvas scaling.
for (const viewport of [{ width: 320, height: 640 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(100);
  const layout = await page.evaluate(() => {
    const c = document.querySelector('#game'), r = c.getBoundingClientRect();
    return { vw: innerWidth, vh: innerHeight, cw: c.width, ch: c.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  assert(layout.cw > 0 && layout.ch > 0, 'Canvas should resize at ' + viewport.width + 'x' + viewport.height);
  assert(layout.left >= -1 && layout.right <= viewport.width + 1, 'Canvas must stay horizontally in viewport at ' + viewport.width + 'x' + viewport.height);
  assert(layout.top >= -1 && layout.bottom <= viewport.height + 1, 'Canvas must stay vertically in viewport at ' + viewport.width + 'x' + viewport.height);
}
const canvasState = await page.locator('#game').evaluate(c => ({ width: c.width, height: c.height, hasContext: !!c.getContext('2d') }));
assert(canvasState.width > 0 && canvasState.height > 0 && canvasState.hasContext, 'Canvas should be initialized');
assert(errors.length === 0 && consoleErrors.length === 0, 'Runtime errors: ' + errors.join(' | ') + '; console: ' + consoleErrors.join(' | '));
console.log('PASS: Tetris, Arkanoid, Neon Racing selectors, controls, pause/resume, restart, canvas and runtime errors');
await browser.close();
