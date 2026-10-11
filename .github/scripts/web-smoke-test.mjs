import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#game').waitFor({ state: 'visible' });
  if (await page.locator('#game').count() !== 1) throw new Error('Standalone canvas missing');
  if (await page.locator('#cityFrame').count() !== 0) throw new Error('Legacy iframe still present');
  for (const id of ['startBtn','pauseBtn','menuBtn','aimBtn','reloadBtn','fireBtn','smokeBtn','joystick']) {
    if (await page.locator('#' + id).count() !== 1) throw new Error('Missing control: ' + id);
  }
  if (await page.locator('[data-order]').count() !== 3) throw new Error('Squad order buttons missing');
  await page.locator('#startBtn').click();
  await page.locator('#overlay.hidden').waitFor({ state: 'attached' });
  await page.waitForTimeout(250);
  const state = await page.evaluate(() => ({
    canvas: !!document.querySelector('#game').getContext('2d'),
    wave: document.querySelector('#waveText').textContent,
    hud: document.querySelector('#healthText').textContent,
    running: !document.querySelector('#overlay').classList.contains('hidden')
  }));
  if (!state.canvas || state.wave !== '01' || state.hud !== '100' || state.running) throw new Error('Game did not initialize correctly: ' + JSON.stringify(state));
  await page.locator('[data-order="hold"]').click();
  if (!await page.locator('[data-order="hold"]').evaluate(el => el.classList.contains('active'))) throw new Error('HOLD order did not activate');
  await page.locator('[data-order="retreat"]').click();
  await page.locator('[data-order="push"]').click();
  await page.locator('#aimBtn').click();
  if (!/AUTO AIM OFF/.test(await page.locator('#aimBtn').innerText())) throw new Error('Auto aim toggle did not change');
  await page.locator('#aimBtn').click();
  await page.locator('#reloadBtn').click();
  await page.locator('#fireBtn').tap();
  await page.locator('#smokeBtn').click();
  if (!/SMOKE ×2/.test(await page.locator('#smokeBtn').innerText())) throw new Error('Smoke screen charge was not consumed');
  await page.locator('#pauseBtn').click();
  await page.locator('#overlay').waitFor({ state: 'visible' });
  await page.locator('#resumeBtn').click();
  await page.locator('#overlay.hidden').waitFor({ state: 'attached' });
  await page.setViewportSize({ width: 320, height: 640 });
  const layout = await page.evaluate(() => {
    const c = document.querySelector('#game').getBoundingClientRect();
    const j = document.querySelector('#joystick').getBoundingClientRect();
    return { canvasWidth: c.width, canvasHeight: c.height, joy: j.width, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  if (layout.canvasWidth < 300 || layout.canvasHeight < 250 || layout.joy < 60 || layout.overflow) throw new Error('Mobile layout failed: ' + JSON.stringify(layout));
  await page.keyboard.press('1'); await page.keyboard.press('2'); await page.keyboard.press('3'); await page.keyboard.press('r'); await page.keyboard.press('q');
  if (errors.length) throw new Error('Runtime errors: ' + errors.join('; '));
  console.log('IRON FRONT smoke tests passed: standalone canvas, deployment, squad orders, auto aim, reload, fire input, smoke, pause/resume, keyboard and mobile layout.');
} finally {
  await browser.close();
}
