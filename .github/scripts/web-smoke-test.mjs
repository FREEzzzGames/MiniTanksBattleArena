import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = process.cwd();
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.json':'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#game').waitFor({ state: 'visible' });
  if (errors.length) throw new Error('Browser JavaScript errors before interaction: ' + errors.join(' | '));
  if (await page.locator('#game').count() !== 1) throw new Error('Standalone canvas missing');
  if (await page.locator('#cityFrame').count() !== 0) throw new Error('Legacy iframe still present');
  for (const id of ['startBtn','pauseBtn','menuBtn','orderBtn','fireBtn','smokeBtn','targetBtn','coverBtn','intelBtn','ammoText']) {
    if (await page.locator('#' + id).count() !== 1) throw new Error('Missing control: ' + id);
  }
  if (await page.locator('#joystick').count() !== 1 || await page.locator('#joystickStick').count() !== 1) throw new Error('Fixed touch joystick missing');
  const joystickSource = await readFile('js/game.js', 'utf8');
  if (!joystickSource.includes('function beginJoystick(e)') || !joystickSource.includes('joystickVector={x,y}') || !joystickSource.includes('let x=joystickVector.x,y=joystickVector.y')) throw new Error('Fixed joystick pointer input is not connected to player movement');
  if (await page.locator('[data-tank]').count() !== 5) throw new Error('Expected five tank selection cards, including support tank');
  const [htmlSource, gameSource] = await Promise.all([readFile('index.html', 'utf8'), readFile('js/game.js', 'utf8')]);
  const fogSource = gameSource;
  const stylesheetSource = await readFile('css/game.css', 'utf8');
  const renderEngineSource = await readFile('js/mtba-render-engine.js', 'utf8');
  if (!/window\.MTBARenderEngine\s*=\s*\{\s*create\s*,\s*version\s*:\s*['"]1\.0\.0['"]\s*\}/.test(renderEngineSource) || !/function\s+drawGround\s*\(\s*ctx\s*,\s*camera\s*,\s*viewWidth\s*,\s*viewHeight\s*\)/.test(renderEngineSource) || !/function\s+recordFrame\s*\(\s*ms\s*\)/.test(renderEngineSource) || !/renderEngine\.drawGround\(\s*ctx\s*,\s*camera\s*,\s*vw\s*,\s*vh\s*\)/.test(gameSource) || !/mtba-render-engine\.js\?v=\d+/.test(htmlSource)) throw new Error('Procedural Canvas render engine is not loaded and connected to the world renderer');
  const spriteFiles = ['assets/tanks/tank-scout.svg','assets/tanks/tank-heavy.svg','assets/tanks/tank-sniper.svg','assets/tanks/tank-support.svg','assets/environment/tree-conifer.svg','assets/environment/tree-autumn.svg','assets/environment/bush.svg','assets/environment/ruin.svg','assets/units/infantry.svg','assets/effects/explosion.svg','assets/effects/smoke.svg'];
  const spriteContents = await Promise.all(spriteFiles.map(path => readFile(path, 'utf8')));
  if (spriteContents.some(svg => !svg.includes('<svg') || !svg.includes('</svg>'))) throw new Error('A standalone SVG game asset is invalid');
  if (!fogSource.includes("loadSprite('treeConifer','./assets/environment/tree-conifer.svg?v=2')") || !fogSource.includes("loadSprite('infantry','./assets/units/infantry.svg')") || !fogSource.includes('ctx.drawImage(im,-size*.5,-size*.78,size,size)') || !fogSource.includes('const stride=Math.sin(now+c.seed)') || !fogSource.includes("if(c.kind==='medic')")) throw new Error('Environment sprites or procedural civilian rendering are not integrated with Canvas rendering');
  if (!/href=["']\.\/css\/game\.css(?:\?[^"']*)?["']/.test(htmlSource) || !/src=["']\.\/js\/game\.js(?:\?[^"']*)?["']/.test(htmlSource)) throw new Error('External runtime assets are not linked from the HTML shell');
  if (stylesheetSource.includes('repair r3') || stylesheetSource.includes('legacy portrait rules')) throw new Error('Temporary CSS repair layer remains');
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error('Duplicate live DOM IDs: ' + [...new Set(duplicateIds)].join(', '));
  if (!fogSource.includes('function segmentIntersectsRect(x1,y1,x2,y2,r){let t0=0,t1=1;const dx=x2-x1,dy=y2-y1;let p=-dx,q=x1-r.x')) throw new Error('Segment/obstacle collision test must not allocate temporary arrays inside combat loops');
  if (!fogSource.includes('function drawFog()') || !fogSource.includes('function canSpot(') || !/ctx\.restore\(\);drawFog\(\);drawRadar\(\)/.test(gameSource)) throw new Error('Fog-of-war must render after restoring the world camera and before the fixed radar');
  if (!gameSource.includes('function bakeStaticTerrain()') || !gameSource.includes('function drawStaticTerrain(camera)') || !gameSource.includes('drawStaticTerrain(camera);drawGrassBase()')) throw new Error('Static terrain details are not baked and viewport-clipped');
  if (!fogSource.includes('alpha:[{x:230,y:420},{x:390,y:500},{x:650,y:700},{x:810,y:850}') || !fogSource.includes('bravo:[{x:1510,y:420},{x:1370,y:500},{x:1150,y:700},{x:990,y:850}')) throw new Error('Opposing infantry patrol routes must converge on the central engagement zone');
  if (!fogSource.includes('const treeShadowCache=new WeakMap()') || !fogSource.includes('function treeShadowSprite(im)') || !fogSource.includes('ctx.drawImage(silhouette,canopy*.28-size*.5')) throw new Error('Tree cast shadows must use a cached silhouette of the source canopy sprite');
  if (!/Directional ground shadow:[\s\S]{0,240}ctx\.ellipse\(s\*\.17,s\*\.24,s\*1\.12,s\*\.66,-\.08,0,TAU\)/.test(fogSource) || !fogSource.includes("ctx.fillStyle='#030605'")) throw new Error('Tank cast shadow is missing from silhouette-first renderer');
  if (!fogSource.includes("ctx.roundRect(x+7,y+10,w,h,container?3:1)")) throw new Error('Container shadows must follow obstacle contours');
  if (!fogSource.includes('const INFANTRY_ROUTES=') || !fogSource.includes('function spawnInfantry()') || !fogSource.includes('function updateInfantry(dt)') || !fogSource.includes('function drawSoldier(s)') || !fogSource.includes('function drawInfantryShots()') || !fogSource.includes("['alpha','bravo']") || !fogSource.includes("s.state='flank'") || !fogSource.includes("s.state='cover'") || !fogSource.includes('function drawSoldierShadow(s)')) throw new Error('Two-faction infantry AI, combat, top-down renderer or contour shadows are missing');
  if (!/drawCivilians\(\);drawInfantry\(\)/.test(gameSource) || !/drawInfantryShots\(\)/.test(gameSource) || !/updateDrones\(dt\);updateInfantry\(dt\)/.test(gameSource)) throw new Error('Infantry simulation and rendering are not wired into the main game loop');
  if (!fogSource.includes('function drawGrassBase()') || !fogSource.includes('function drawGrassCanopy()') || !fogSource.includes('function isConcealed(') || !fogSource.includes('t.grassRevealUntil=gameClock+2')) throw new Error('Grass concealment / 2-second firing reveal mechanic missing');
  if (!fogSource.includes("const candidates=t.team==='enemy'?[player(),...allies()].filter(v=>v&&v.alive&&!isConcealed(v)):enemies()")) throw new Error('Enemy target acquisition does not respect grass concealment');
  if (!fogSource.includes('function spawnIntelBox()') || !fogSource.includes('function drawIntelBoxes()') || !fogSource.includes('mapRevealUntil=Math.max(mapRevealUntil,gameClock+3)') || !fogSource.includes('function drawFog(){if(gameClock<mapRevealUntil)return;')) throw new Error('Three-second tactical intel reveal mechanic missing');
  if (!fogSource.includes('crit:critical') || !fogSource.includes('b.damage*(b.crit?1.5:1)') || !fogSource.includes('КРИТИЧЕСКОЕ ПОПАДАНИЕ')) throw new Error('Critical-hit damage / feedback mechanic missing');
  if (!fogSource.includes('function drawDynamicLights()') || !fogSource.includes('function drawIntelBoxes()') || !fogSource.includes('function drawImpactLights()') || !fogSource.includes('function drawSmokeClouds()')) throw new Error('Combat lighting or pickup rendering missing');
  if (!/class=["'][^"']*tank-preview/.test(htmlSource) || !/data-preview-tank=["']support["']/.test(htmlSource) || (htmlSource.match(/data-preview-tank=/g) || []).length !== 5) throw new Error('Five tank cards must use the shared Canvas renderer previews');
  if (!fogSource.includes('function drawTankModel(ctx,t,scale=1,rotation=0)') || !fogSource.includes('function renderTankPreviews()') || !fogSource.includes('setInterval(renderTankPreviews,120)') || !fogSource.includes('c.rotate(turn);drawTankModel(c,preview,1,0)') || fogSource.includes('setInterval(renderTankPreviews,33)')) throw new Error('Shared renderer / throttled Canvas tank previews missing');
  if (/PSEUDO-3D|3D TURNTABLE/.test(htmlSource)) throw new Error('2D Canvas tank preview labels must not imply 3D models');
  if (!stylesheetSource.includes('MTBA visual reference pass') || !stylesheetSource.includes('.tank-preview')) throw new Error('Minimal military UI styling missing');
  if (!gameSource.includes('let simAccumulator=0') || !gameSource.includes('while(simAccumulator>=1/60&&steps<4)') || !gameSource.includes('window.MTBA_PERF=') || !gameSource.includes('rebuildGrassCaches()') || !gameSource.includes('const cadence=({player:.34,heavy:.62,scout:.27,sniper:.78,support:.4,brawler:.68,assault:.52,ally:.48})[t.role]') || !gameSource.includes('speed:rand(42,52),range:rand(205,255)')) throw new Error('Fixed timestep, combat cadence, adaptive performance telemetry or cached grass optimizations are missing');
  if (!gameSource.includes('function updateTankMachineGuns(dt)') || !gameSource.includes('function drawTankMGTracers()') || !gameSource.includes('hostileFaction=t.team===\'enemy\'?\'alpha\':\'bravo\'') || !gameSource.includes('target.hp-=8') || !gameSource.includes('mgTracers.push(')) throw new Error('Autonomous tank machine guns, hostile infantry targeting or upgraded vehicle fittings are missing');
  const layerTracks = gameSource.indexOf('Paired side tracks: wide, dark continuous belts');
  const layerHull = gameSource.indexOf('Hull: reference-driven silhouettes');
  const layerTurret = gameSource.indexOf('Turret silhouette has broad angled faces');
  const layerBarrel = gameSource.indexOf('Long gun silhouette first');
  const layerMantlet = gameSource.indexOf('Distinct reinforced gun mantlet');
  if (!(layerTracks >= 0 && layerTracks < layerHull && layerHull < layerTurret && layerTurret < layerBarrel && layerBarrel < layerMantlet)) throw new Error('Tank render layer order must be tracks -> hull -> turret -> barrel -> mantlet');
  if (!gameSource.includes('MTBA layered tank renderer r14') || !gameSource.includes('Paired side tracks: wide, dark continuous belts') || !gameSource.includes('Role-specific upper hull') || !gameSource.includes('Distinct reinforced gun mantlet') || !gameSource.includes('sniper has a visibly extended barrel') || !gameSource.includes('Role-specific silhouette pass r10') || !gameSource.includes('twin whip antennas') || !gameSource.includes('slotted muzzle brake') || !gameSource.includes('medical/service pack') || !gameSource.includes('Recessed tread blocks') || !gameSource.includes('Hull fittings: recessed front lamps') || !gameSource.includes('Turret cheek plates and rear stowage') || !gameSource.includes('Recessed belt edges and a contact-darkened lower run') || !gameSource.includes('Heat sleeve and two restrained machined bands') || !gameSource.includes('Hatch hinge and periscope glass') || !gameSource.includes('Turret facet pass r14') || !gameSource.includes("ctx.strokeStyle='#d2d9bd55'") || !gameSource.includes('Heavy = Abrams-like wide angular hull') || !gameSource.includes('scout = compact Scorpion-like hull') || !gameSource.includes('sniper = low elongated Jagdpanzer-like hull') || !gameSource.includes('Turret silhouette: distinct reference-driven plans')) throw new Error('Reference-driven tank silhouettes or class-specific geometry are missing');
  if (!fogSource.includes('function createDrones(p)') || !fogSource.includes("kind:'scout'") || !fogSource.includes("kind:'medic'") || !fogSource.includes('function updateDrones(dt)') || !fogSource.includes('function drawDrones()')) throw new Error('Scout and medic drones must be created, updated and rendered');
  if (!fogSource.includes('function scoutDroneSpots(e)') || !fogSource.includes('reveal(scout.x,scout.y,scout.reveal,.32)')) throw new Error('Scout drone does not reveal nearby terrain and enemies');
  if (!fogSource.includes("if(targetHeal&&missing>0&&dist(d,targetHeal)<70)") || !fogSource.includes("say('МЕДДРОН: +'") || !fogSource.includes('targetHeal.hp+=amount')) throw new Error('Medic drone must fly to and heal wounded player/allies');
  if (!fogSource.includes('const count=Math.min(3+Math.ceil(wave*.72),9)') || !fogSource.includes("damage:(t.team==='enemy'?t.damage*.68:t.damage)") || !fogSource.includes("shotLeft:team==='enemy'?rand(.8,1.8):rand(.2,1)")) throw new Error('Enemy damage, wave size or firing cadence was not rebalanced');
  if (!fogSource.includes("if(t.team==='player'&&t.role==='support')damage*=.82")) throw new Error('Support tank damage resistance missing');
  if (!fogSource.includes("function nearestThreat(t){let best=null,bd=Infinity;const candidates=t.team==='enemy'?[player(),...allies()].filter(v=>v&&v.alive&&!isConcealed(v)):enemies()")) throw new Error('Enemy threat selection must use player/allies and respect concealment');
  if (fogSource.includes('Your tank has been disabled') || fogSource.includes("'REDEPLOY'")) throw new Error('Russian game-over text contains English fallback');
  if (await page.locator('[data-tank="support"]').count() !== 1) throw new Error('Support tank selection card missing');
  const checkMobileLayout = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.waitForTimeout(50);
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('#game').getBoundingClientRect();
      const arena = document.querySelector('#arena-wrap').getBoundingClientRect();
      const message = document.querySelector('#message').getBoundingClientRect();
      const controls = [...document.querySelectorAll('#controls button')].map(button => {
        const r = button.getBoundingClientRect();
        return { id: button.id, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
      return { canvasWidth: canvas.width, canvasHeight: canvas.height, viewportWidth: window.innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        messageBottom: message.bottom, messageLeft: message.left, messageRight: message.right, arenaTop: arena.top, arenaBottom: arena.bottom, controls };
    });
    if (layout.canvasWidth < 300 || layout.canvasHeight < 250 || layout.overflow)
      throw new Error('Mobile layout failed at ' + width + 'px: ' + JSON.stringify(layout));
    for (const control of layout.controls) {
      if (control.top < layout.arenaTop || control.bottom > layout.arenaBottom || control.left < 0 || control.right > layout.viewportWidth)
        throw new Error('Control outside mobile viewport: ' + JSON.stringify({ control, layout }));
      if (control.id !== 'fireBtn' && control.top < layout.messageBottom + 6 && control.right > layout.messageLeft - 6 && control.left < layout.messageRight + 6)
        throw new Error('Control overlaps mission message: ' + JSON.stringify({ control, layout }));
    }
  };
  await checkMobileLayout(844, 390);
  await checkMobileLayout(640, 320);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(50);
  const portraitGate = await page.evaluate(() => ({ gate: getComputedStyle(document.querySelector('#orientationGate')).display, app: getComputedStyle(document.querySelector('#app')).visibility }));
  if (portraitGate.gate !== 'flex' || portraitGate.app !== 'hidden') throw new Error('Portrait orientation must be gated with a rotate-device prompt: ' + JSON.stringify(portraitGate));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const supportClick = await page.evaluate(() => {
    const button = document.querySelector('[data-tank="support"]');
    return { disabled: button.disabled, tag: button.tagName, connected: button.isConnected, overlay: getComputedStyle(document.querySelector('#overlay')).display, scriptCount: document.scripts.length };
  });
  await page.locator('[data-tank="support"]').scrollIntoViewIfNeeded();
  await page.locator('[data-tank="support"]').tap({ force: true });
  await page.waitForTimeout(100);
  if (await page.locator('#selArmor').textContent() !== '120') throw new Error('Support click failed; diagnostics=' + JSON.stringify(supportClick) + '; pageErrors=' + errors.join(' | '));
  if (await page.locator('#selArmor').textContent() !== '120') throw new Error('Support tank selection did not update stats: ' + await page.locator('#selArmor').textContent());
  const supportStats = await page.evaluate(() => ({
    armor: document.querySelector('#selArmor').textContent,
    speed: document.querySelector('#selSpeed').textContent,
    damage: document.querySelector('#selDamage').textContent
  }));
  if (supportStats.armor !== '120' || supportStats.speed !== '122' || supportStats.damage !== '22') throw new Error('Support tank stats incorrect: ' + JSON.stringify(supportStats));
  await page.locator('[data-tank="heavy"]').click({ force: true });
  if (await page.locator('#selArmor').textContent() !== '155') throw new Error('Heavy tank selection did not update stats: ' + await page.locator('#selArmor').textContent());
  const stats = await page.evaluate(() => ({
    armor: document.querySelector('#selArmor').textContent,
    speed: document.querySelector('#selSpeed').textContent,
    damage: document.querySelector('#selDamage').textContent
  }));
  if (stats.armor !== '155' || stats.speed !== '104' || stats.damage !== '34') throw new Error('Tank selection stats incorrect: ' + JSON.stringify(stats));
  const balanceSource = gameSource;
  if (!balanceSource.includes("scout:{name:'L-03 SHADE',hp:74,speed:176,damage:18,reload:.84") || !balanceSource.includes("sniper:{name:'S-04 NOVA',hp:82,speed:112,damage:38,reload:1.72")) throw new Error('Tank balance profile changes missing');
  await page.locator('#startBtn').click();
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    canvas: !!document.querySelector('#game').getContext('2d'),
    wave: document.querySelector('#waveText').textContent,
    hud: document.querySelector('#healthText').textContent,
    overlayHidden: document.querySelector('#overlay').classList.contains('hidden'),
    ammo: document.querySelector('#ammoText').textContent
  }));
  if (!state.canvas || state.wave !== '01' || state.hud !== '155' || !state.overlayHidden || state.ammo !== '4 / 4') throw new Error('Game did not initialize selected tank/ammo correctly: ' + JSON.stringify(state));
  const renderCheck = await page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += Math.max(4, Math.floor(pixels.length / 5000 / 4) * 4)) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return { width: canvas.width, height: canvas.height, cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height, distinctColors: colors.size };
  });
  if (renderCheck.width < 300 || renderCheck.height < 250 || renderCheck.distinctColors < 8 || Math.abs(renderCheck.width - renderCheck.cssWidth) > 2 || Math.abs(renderCheck.height - renderCheck.cssHeight) > 2) throw new Error('Canvas render / backing-store scaling check failed: ' + JSON.stringify(renderCheck));
  await page.locator('#orderBtn').click();
  if (!/ОТРЯД/.test(await page.locator('#orderBtn').innerText())) throw new Error('Squad control missing');
  await page.locator('#targetBtn').click();
  await page.locator('#coverBtn').click();
  await page.locator('#fireBtn').tap();
  await page.locator('#smokeBtn').click();
  if (!/ДЫМ ×2/.test(await page.locator('#smokeBtn').innerText())) throw new Error('Smoke screen charge was not consumed');
  // Simulate two simultaneous touch contacts: steering while holding FIRE.
  const cdp = await page.context().newCDPSession(page);
  const arenaBox = await page.locator('#arena-wrap').boundingBox();
  const fireBox = await page.locator('#fireBtn').boundingBox();
  const jx = arenaBox.x + arenaBox.width * .25, jy = arenaBox.y + arenaBox.height * .58;
  const fx = fireBox.x + fireBox.width / 2, fy = fireBox.y + fireBox.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { id: 1, x: jx, y: jy, radiusX: 8, radiusY: 8, force: 1 },
    { id: 2, x: fx, y: fy, radiusX: 8, radiusY: 8, force: 1 }
  ]});
  const ammoSeen = new Set();
  let emptied = false;
  for (let i = 0; i < 220; i++) {
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
  if (!emptied || ammoSeen.size < 2) { const fireDiagnostics = await page.evaluate(() => ({ health: document.querySelector('#healthText')?.textContent, overlay: document.querySelector('#overlay')?.textContent, gameOver: document.querySelector('#overlay')?.classList.contains('hidden') === false })); throw new Error('Simultaneous movement + FIRE did not consume the magazine: ' + [...ammoSeen].join(', ') + '; state=' + JSON.stringify(fireDiagnostics)); }
  let reloadedAmmo = await page.locator('#ammoText').innerText();
  for (let i = 0; i < 80 && reloadedAmmo !== '4 / 4'; i++) {
    await page.waitForTimeout(100);
    reloadedAmmo = await page.locator('#ammoText').innerText();
  }
  if (reloadedAmmo !== '4 / 4') {
    const reloadDiagnostics = await page.evaluate(() => ({ health: document.querySelector('#healthText')?.textContent, overlay: document.querySelector('#overlay')?.textContent, gameOver: document.querySelector('#overlay')?.classList.contains('hidden') === false }));
    throw new Error('Empty magazine did not recover after releasing FIRE: ' + reloadedAmmo + '; state=' + JSON.stringify(reloadDiagnostics));
  }
  await page.locator('#pauseBtn').click();
  await page.locator('#overlay').waitFor({ state: 'visible' });
  await page.locator('#resumeBtn').click();
  await page.locator('#overlay.hidden').waitFor({ state: 'attached' });
  await page.setViewportSize({ width: 640, height: 320 });
  if (errors.length) throw new Error('Runtime errors: ' + errors.join('; '));
  const assetFailures = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => { const path = new URL(e.name).pathname; return (path.endsWith('/css/game.css') || path.endsWith('/js/game.js') || path.endsWith('/js/mtba-render-engine.js')) && e.responseStatus >= 400; }).map(e => ({name:e.name,status:e.responseStatus}))).catch(() => []);
  if (assetFailures.length) throw new Error('Runtime assets failed to load: ' + JSON.stringify(assetFailures));
  const engineState = await page.evaluate(() => window.MTBARenderEngine?.version || null);
  if (engineState !== '1.0.0') throw new Error('MTBA Render Engine failed to initialize: ' + engineState);
  console.log('MTBA browser smoke tests passed: procedural pixel terrain render engine, shared detailed tank renderer, slowly rotating card turntables, minimal military UI, external asset loading, canvas rendering/scaling, tank selection, ammo HUD, firing/reload recovery, simultaneous movement + FIRE touch input, scout/medic drone mechanics, reduced enemy pressure, tactical orders, smoke, pause/resume, Russian UI and landscape layout and portrait-orientation gate.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
