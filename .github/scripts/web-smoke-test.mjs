import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(pathToFileURL(path.resolve('index.html')).href);
await page.waitForSelector('#game');
const click = async (selector) => page.locator(selector).click();
const control = async (index) => page.locator('#controls button').nth(index).click();
const status = async () => (await page.locator('#status').innerText()).trim();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(await page.locator('[data-mode]').count() === 3, 'Expected three game selectors');
await click('#play');
assert(await status() === 'ACTIVE', 'Tetris Play should start the game');
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
assert(await page.locator('#controls button').count() === 7, 'Racing should expose seven controls including Enter/Exit, Nitro and Shield');
assert(await status() === 'ACTIVE', 'Selecting Neon Racing should start the game');
await control(0); await control(1); // Lane movement
await control(2); // Enter/Exit vehicle
await control(3); // Nitro
await control(4); // Shield
await control(5); // Pause
assert(await status() === 'PAUSED', 'Racing pause should work');
await click('#play');
assert(await status() === 'ACTIVE', 'Racing resume should work');
await control(6); // Restart
assert(await status() === 'ACTIVE', 'Racing restart should remain playable');
await page.waitForTimeout(350);
const canvasState = await page.locator('#game').evaluate(c => ({ width: c.width, height: c.height, hasContext: !!c.getContext('2d') }));
assert(canvasState.width > 0 && canvasState.height > 0 && canvasState.hasContext, 'Canvas should be initialized');
assert(errors.length === 0, 'Runtime errors: ' + errors.join(' | '));
console.log('PASS: Tetris, Arkanoid, Neon Racing selectors, controls, pause/resume, restart, canvas and runtime errors');
await browser.close();
