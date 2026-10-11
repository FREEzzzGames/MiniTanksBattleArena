import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const failures = [];
page.on('pageerror', error => { if (!/getGamepads.*disallowed by permissions policy/i.test(error.message)) failures.push('shell: ' + error.message); });

try {
  await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'domcontentloaded' });
  const frame = page.frameLocator('#cityFrame');
  await frame.locator('#gameContainer').waitFor({ state: 'attached', timeout: 20000 });
  const cityPage = page.frames().find(f => f.url().includes('city-world/index.html'));
  if (!cityPage) throw new Error('City game frame did not load');
  cityPage.on('pageerror', error => { if (!/getGamepads.*disallowed by permissions policy/i.test(error.message)) failures.push('city: ' + error.message); });
  if (await page.locator('#cityFrame').count() !== 1) throw new Error('Only one Open City iframe should exist');
  if (await page.locator('header').innerText() === '') throw new Error('Open City header is missing');
  if (await frame.locator('#canvas-container canvas').count() < 1) throw new Error('City WebGL canvas did not mount');
  if (await frame.locator('#careerHud').count() !== 1) throw new Error('Career economy HUD missing');
  if (await frame.locator('[data-career]').count() !== 5) throw new Error('All five service actions should be available');
  if (await frame.locator('#careerBankBalance').count() !== 1) throw new Error('Bank account balance display missing');

  // Menu entry and game mode controls.
  await frame.locator('#btnMode1P').click();
  await frame.locator('#btnMode2PH').click();
  await frame.locator('#btnMode2PV').click();
  await frame.locator('#btnMode1P').click();
  await frame.locator('button[onclick="startGameWithMap(\'default\')"]').click();
  await frame.locator('#startScreen').waitFor({ state: 'hidden', timeout: 30000 });
  await frame.locator('#careerHud:not(.hidden)').waitFor({ state: 'visible', timeout: 30000 });
  await frame.locator('#gameHeader:not(.hidden)').waitFor({ state: 'visible' });

  // Exercise primary in-game overlays and their close paths.
  await frame.locator('#helpButton').evaluate(el => el.click());
  await frame.locator('#helpMenu:not(.hidden)').waitFor({ state: 'visible' });
  await frame.locator('.close-help').evaluate(el => el.click());
  await frame.locator('#helpMenu.hidden').waitFor({ state: 'attached' });
  await frame.locator('#mapButton').evaluate(el => el.click());
  await frame.locator('#mapMenu:not(.hidden)').waitFor({ state: 'visible' });
  await frame.locator('.close-map').evaluate(el => el.click());
  await frame.locator('#mapMenu.hidden').waitFor({ state: 'attached' });
  await frame.locator('#customizeButton').evaluate(el => el.click());
  await frame.locator('#customizeMenu:not(.hidden)').waitFor({ state: 'visible' });
  await frame.locator('#customizeButton').evaluate(el => el.click());
  await frame.locator('#customizeMenu.hidden').waitFor({ state: 'attached' });
  await cityPage.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {key:'o', code:'KeyO', bubbles:true})));
  await frame.locator('#optionsMenu:not(.hidden)').waitFor({ state: 'visible' });
  await frame.locator('#physOldBtn').evaluate(el => el.click());
  await frame.locator('#physNewBtn').evaluate(el => el.click());
  await frame.locator('.close-options').evaluate(el => el.click());
  await frame.locator('#optionsMenu.hidden').waitFor({ state: 'attached' });

  // Verify mobile viewport scaling and touch controls exist.
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(300);
  const frameBox = await page.locator('#cityFrame').boundingBox();
  if (!frameBox || frameBox.width < 300 || frameBox.height < 500) throw new Error('City viewport did not adapt to mobile dimensions');
  for (const id of ['mobile-left','mobile-right','mobile-up','mobile-down','mobile-handbrake']) {
    if (await frame.locator('#' + id).count() !== 1) throw new Error('Missing mobile control: ' + id);
  }
  // Keyboard input and all service buttons must be callable without JS exceptions.
  await cityPage.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', code:'ArrowUp', bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup', {key:'ArrowUp', code:'ArrowUp', bubbles:true})); window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft', code:'ArrowLeft', bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup', {key:'ArrowLeft', code:'ArrowLeft', bubbles:true})); });
  for (const id of ['bank','dealer','property','gym','delivery']) await frame.locator('[data-career="' + id + '"]').evaluate(el => el.click());
  await page.waitForTimeout(500);
  if (failures.length) throw new Error('Runtime errors: ' + failures.join('; '));
  console.log('Open City: menu entry, mode buttons, HUD, overlays, physics toggles, mobile controls, keyboard input and service actions passed.');
} finally {
  await browser.close();
}
