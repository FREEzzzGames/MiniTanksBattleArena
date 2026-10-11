import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const failures = [];
page.on('pageerror', error => failures.push(error.message));

try {
  await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'domcontentloaded' });
  const frame = page.frameLocator('#cityFrame');
  await frame.locator('#gameContainer').waitFor({ state: 'attached', timeout: 20000 });
  if (await page.locator('#cityFrame').count() !== 1) throw new Error('Only one Open City iframe should exist');
  if (await page.locator('header').innerText() === '') throw new Error('Open City header is missing');
  if (await frame.locator('#canvas-container canvas').count() < 1) throw new Error('City WebGL canvas did not mount');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(300);
  const frameBox = await page.locator('#cityFrame').boundingBox();
  if (!frameBox || frameBox.width < 300 || frameBox.height < 500) throw new Error('City viewport did not adapt to mobile dimensions');
  if (failures.length) throw new Error('Runtime errors: ' + failures.join('; '));
  console.log('Open City only: iframe, canvas and mobile viewport checks passed.');
} finally {
  await browser.close();
}
