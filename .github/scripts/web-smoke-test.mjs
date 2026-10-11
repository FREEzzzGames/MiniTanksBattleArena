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
  for (const id of ['startBtn','pauseBtn','menuBtn','orderBtn','fireBtn','smokeBtn','joystick','ammoText']) {
    if (await page.locator('#' + id).count() !== 1) throw new Error('Missing control: ' + id);
  }
  if (await page.locator('[data-tank]').count() !== 5) throw new Error('Expected five tank selection cards, including support tank');
  const fogSource = await page.content();
  if (!fogSource.includes('function drawFog()') || !fogSource.includes('function canSpot(')) throw new Error('RPG-style fog of war / visibility system missing');
  if (await page.locator('[data-tank="support"]').count() !== 1) throw new Error('Support tank selection card missing');
  await page.locator('[data-tank="support"]').click();
  const supportStats = await page.evaluate(() => ({
    armor: document.querySelector('#selArmor').textContent,
    speed: document.querySelector('#selSpeed').textContent,
    damage: document.querySelector('#selDamage').textContent
  }));
  if (supportStats.armor !== '125' || supportStats.speed !== '88' || supportStats.damage !== '20') throw new Error('Support tank stats incorrect: ' + JSON.stringify(supportStats));
  await page.locator('[data-tank="heavy"]').click();
  const stats = await page.evaluate(() => ({
    armor: document.querySelector('#selArmor').textContent,
    speed: document.querySelector('#selSpeed').textContent,
    damage: document.querySelector('#selDamage').textContent
  }));
  if (stats.armor !== '165' || stats.speed !== '76' || stats.damage !== '38') throw new Error('Tank selection stats incorrect: ' + JSON.stringify(stats));
  await page.locator('#startBtn').click();
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    canvas: !!document.querySelector('#game').getContext('2d'),
    wave: document.querySelector('#waveText').textContent,
    hud: document.querySelector('#healthText').textContent,
    overlayHidden: document.querySelector('#overlay').classList.contains('hidden'),
    ammo: document.querySelector('#ammoText').textContent
  }));
  if (!state.canvas || state.wave !== '01' || state.hud !== '165' || !state.overlayHidden || state.ammo !== '4 / 4') throw new Error('Game did not initialize selected tank/ammo correctly: ' + JSON.stringify(state));
  await page.locator('#orderBtn').click();
  if (!/TACTIC: HOLD/.test(await page.locator('#orderBtn').innerText())) throw new Error('Squad order did not cycle to HOLD');
  await page.locator('#orderBtn').click();
  if (!/TACTIC: FALL BACK/.test(await page.locator('#orderBtn').innerText())) throw new Error('Squad order did not cycle to FALL BACK');
  await page.locator('#orderBtn').click();
  if (!/TACTIC: PUSH/.test(await page.locator('#orderBtn').innerText())) throw new Error('Squad order did not cycle back to PUSH');
  await page.locator('#fireBtn').tap();
  await page.locator('#smokeBtn').click();
  if (!/SMOKE ×2/.test(await page.locator('#smokeBtn').innerText())) throw new Error('Smoke screen charge was not consumed');
  // Simulate two simultaneous touch contacts: steering while holding FIRE.
  const cdp = await page.context().newCDPSession(page);
  const joyBox = await page.locator('#joystick').boundingBox();
  const fireBox = await page.locator('#fireBtn').boundingBox();
  const jx = joyBox.x + joyBox.width / 2, jy = joyBox.y + joyBox.height / 2;
  const fx = fireBox.x + fireBox.width / 2, fy = fireBox.y + fireBox.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { id: 1, x: jx, y: jy, radiusX: 8, radiusY: 8, force: 1 },
    { id: 2, x: fx, y: fy, radiusX: 8, radiusY: 8, force: 1 }
  ]});
  const ammoSeen = new Set();
  let emptied = false;
  for (let i = 0; i < 150; i++) {
    const ammo = await page.locator('#ammoText').innerText();
    ammoSeen.add(ammo);
    if (ammo === '0 / 4') { emptied = true; break; }
    await page.waitForTimeout(100);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
    { id: 1, x: jx + 18, y: jy + 4, radiusX: 8, radiusY: 8, force: 1 },
    { id: 2, x: fx, y: fy, radiusX: 8, radiusY: 8, force: 1 }
  ]});
  await page.waitForTimeout(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (!emptied || ammoSeen.size < 2) throw new Error('Simultaneous movement + FIRE did not consume the magazine: ' + [...ammoSeen].join(', '));
  await page.waitForTimeout(2800);
  const reloadedAmmo = await page.locator('#ammoText').innerText();
  if (reloadedAmmo !== '4 / 4') throw new Error('Empty magazine did not recover after releasing FIRE: ' + reloadedAmmo);
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
  await page.keyboard.press('1'); await page.keyboard.press('2'); await page.keyboard.press('3'); await page.keyboard.press('q');
  if (errors.length) throw new Error('Runtime errors: ' + errors.join('; '));
  console.log('IRON FRONT smoke tests passed: tank selection, ammo HUD, firing/reload recovery, simultaneous movement + FIRE touch input, tactical orders, smoke, pause/resume, keyboard and mobile layout.');
} finally {
  await browser.close();
}
