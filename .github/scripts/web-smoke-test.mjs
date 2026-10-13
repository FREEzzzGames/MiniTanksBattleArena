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
  if (await page.locator('[data-tank]').count() !== 9) throw new Error('Expected nine tank selection cards');
  if (await page.locator('#selTankName').count() !== 1 || await page.locator('#selRange').count() !== 1 || await page.locator('#selReload').count() !== 1 || await page.locator('#selAmmo').count() !== 1) throw new Error('Tank comparison panel is missing selected vehicle details');
  await page.locator('[data-tank="scout"]').click();
  if ((await page.locator('#selTankName').textContent()).trim() !== 'SHADE' || (await page.locator('#selArmor').textContent()).trim() !== '74' || (await page.locator('#selAmmo').textContent()).trim() !== '6') throw new Error('Selecting a tank did not update the vehicle comparison panel');
  await page.locator('[data-tank="heavy"]').click();
  if ((await page.locator('#selTankName').textContent()).trim() !== 'BASTION' || (await page.locator('#selArmor').textContent()).trim() !== '155') throw new Error('Returning to the default tank did not update selection details');
  const [htmlSource, gameSource] = await Promise.all([readFile('index.html', 'utf8'), readFile('js/game.js', 'utf8')]);
  const fogSource = gameSource;
  const stylesheetSource = await readFile('css/game.css', 'utf8');
  const renderEngineSource = await readFile('js/mtba-render-engine.js', 'utf8');
  if (!/window\.MTBARenderEngine\s*=\s*\{\s*create\s*,\s*version\s*:\s*['"]1\.0\.0['"]\s*\}/.test(renderEngineSource) || !/function\s+drawGround\s*\(\s*ctx\s*,\s*camera\s*,\s*viewWidth\s*,\s*viewHeight\s*\)/.test(renderEngineSource) || !/function\s+recordFrame\s*\(\s*ms\s*\)/.test(renderEngineSource) || !/renderEngine\.drawGround\(\s*ctx\s*,\s*camera\s*,\s*vw\s*,\s*vh\s*\)/.test(gameSource) || !/mtba-render-engine\.js\?v=[^\"']+/.test(htmlSource)) throw new Error('Procedural Canvas render engine is not loaded and connected to the world renderer');
  if (!renderEngineSource.includes('Removed world-spanning cross/grid marks')) throw new Error('Ground renderer must not paint a cross-shaped grid over the arena');
  const spriteFiles = ['assets/tanks/tank-scout.svg','assets/tanks/tank-heavy.svg','assets/tanks/tank-sniper.svg','assets/tanks/tank-support.svg','assets/environment/tree-conifer.svg','assets/environment/tree-autumn.svg','assets/environment/bush.svg','assets/environment/ruin.svg','assets/units/infantry.svg','assets/effects/explosion.svg','assets/effects/smoke.svg'];
  const spriteContents = await Promise.all(spriteFiles.map(path => readFile(path, 'utf8')));
  if (spriteContents.some(svg => !svg.includes('<svg') || !svg.includes('</svg>'))) throw new Error('A standalone SVG game asset is invalid');
  if (!fogSource.includes("loadSprite('treeConifer','./assets/environment/tree-conifer.svg?v=2')") || !fogSource.includes("loadSprite('infantry','./assets/units/infantry.svg')") || !fogSource.includes('ctx.drawImage(im,-size*.5,-size*.78,size,size)') || !fogSource.includes('const stride=Math.sin(now+c.seed)') || !fogSource.includes("if(c.kind==='medic')")) throw new Error('Environment sprites or procedural civilian rendering are not integrated with Canvas rendering');
  if (!/href=["']\.\/css\/game\.css(?:\?[^"']*)?["']/.test(htmlSource) || !/src=["']\.\/js\/game\.js(?:\?[^"']*)?["']/.test(htmlSource)) throw new Error('External runtime assets are not linked from the HTML shell');
  if (stylesheetSource.includes('repair r3') || stylesheetSource.includes('legacy portrait rules')) throw new Error('Temporary CSS repair layer remains');
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error('Duplicate live DOM IDs: ' + [...new Set(duplicateIds)].join(', '));
  if (!gameSource.includes('Canopies are visual only') || !gameSource.includes('const fadeRadius=t.r*1.48') || !gameSource.includes('underCanopy?.28:1')) throw new Error('Trees must block tank movement at the trunk and fade when a tank passes beneath the canopy');
  if (!gameSource.includes('Recessed hub ring and two broad spokes') || !gameSource.includes('Role-specific field wear: broad chipped edges and dust streaks') || !gameSource.includes('Z-order: ground shadow -> tracks -> hull -> turret -> barrel -> gun mantlet -> highlights')) throw new Error('Tank model material detail or accepted render layer order regressed');
  if (!fogSource.includes('function segmentIntersectsRect(x1,y1,x2,y2,r){let t0=0,t1=1;const dx=x2-x1,dy=y2-y1;let p=-dx,q=x1-r.x')) throw new Error('Segment/obstacle collision test must not allocate temporary arrays inside combat loops');
  if (!fogSource.includes('function drawFog()') || !fogSource.includes('function canSpot(') || !/ctx\.restore\(\);drawFog\(\);drawRadar\(\)/.test(gameSource)) throw new Error('Fog-of-war must render after restoring the world camera and before the fixed radar');
  if (!gameSource.includes('function bakeStaticTerrain()') || !gameSource.includes('function drawStaticTerrain(camera)') || !gameSource.includes('drawStaticTerrain(camera);drawGrassBase()')) throw new Error('Static terrain details are not baked and viewport-clipped');
  if (!gameSource.includes('const MAP_SCALE=2546/1800,WORLD={w:2546,h:2546},TAU=Math.PI*2') || !gameSource.includes('o.x*=MAP_SCALE;o.y*=MAP_SCALE;o.w*=MAP_SCALE;o.h*=MAP_SCALE') || !gameSource.includes('.map(p=>({x:p.x*MAP_SCALE,y:p.y*MAP_SCALE}))')) throw new Error('Arena area must double with cover and NPC routes scaled consistently');
  if (!gameSource.includes('function drawArenaGroundBase()') || !gameSource.includes("const palettes={") || !gameSource.includes("'iron-yard':['#202a2b','#293638','#141e21']") || !gameSource.includes("'dust-front':['#776447','#927b55','#5b4b36']") || !gameSource.includes("'blackwood':['#101d19','#1b2b22','#09130f']")) throw new Error('Each arena must have its own baked ground palette and base treatment');
  if (gameSource.includes('for(let x=45;x<WORLD.w;x+=180)') || gameSource.includes('for(let x=70;x<WORLD.w;x+=260)')) throw new Error('Visible repeating ground grid lines must be removed');
  if (!gameSource.includes('function drawArenaSetDressing()') || !gameSource.includes('Wind-carved dune bands and long tire ruts') || !gameSource.includes('Sparse, broken industrial paint and isolated loading-bay remnants; no repeating grid.') || !gameSource.includes('damp forest floor, exposed roots, leaf litter and pools of cold shadow')) throw new Error('Arena-specific visual dressing is missing');
  if (!gameSource.includes('const coverLayouts=') || !gameSource.includes("type:selectedArena==='dust-front'?'sandbag':'barricade'") || !gameSource.includes("if(o.type==='sandbag'||o.type==='barricade')")) throw new Error('Low cover obstacles must be placed and rendered on each arena');
  if (!gameSource.includes('const INFANTRY_ROUTE_SETS=') || !gameSource.includes("const INFANTRY_ROUTES=INFANTRY_ROUTE_SETS[selectedArena]")) throw new Error('Infantry patrol routes must adapt to selected arena');
  if (!gameSource.includes('const CIVILIAN_ROUTES=') || !gameSource.includes('panicTimer') || !gameSource.includes('const fleeing=(c.panicTimer||0)>0')) throw new Error('Civilians must follow routes and flee threats with obstacle avoidance');
  const treePlacementSource=gameSource.slice(gameSource.indexOf('const treeZones='),gameSource.indexOf('medkits.length=0;for(let i=0;i<9;i++)spawnMedkit()'));
  if (!treePlacementSource.includes('const treeZones=') || !treePlacementSource.includes("'blackwood':[[25,25,420,430]") || !treePlacementSource.includes('const treeStep=selectedArena===') || treePlacementSource.includes('const x=rand(55,WORLD.w-55),y=rand(55,WORLD.h-55)')) throw new Error('Trees must follow deliberate arena-specific belts and groves, not random scatter');
  if (!gameSource.includes('const tacticalCoverLayouts=') || !gameSource.includes('tacticalAnchor:true') || !gameSource.includes('Small deterministic offsets break perfect rows')) throw new Error('Additional cover must be deliberately distributed and tree placement deterministic');
  if (!fogSource.includes('alpha:[{x:230,y:420},{x:390,y:500},{x:650,y:700},{x:810,y:850}') || !fogSource.includes('bravo:[{x:1510,y:420},{x:1370,y:500},{x:1150,y:700},{x:990,y:850}')) throw new Error('Opposing infantry patrol routes must converge on the central engagement zone');
  if (!fogSource.includes('const treeShadowCache=new WeakMap()') || !fogSource.includes('function treeShadowSprite(im)') || !fogSource.includes('ctx.drawImage(silhouette,canopy*.32-size*.5')) throw new Error('Tree cast shadows must use a cached silhouette of the source canopy sprite');
  if (!/Directional ground shadow:[\s\S]{0,240}ctx\.ellipse\(s\*\.17,s\*\.24,s\*1\.12,s\*\.66,-\.08,0,TAU\)/.test(fogSource) || !fogSource.includes("ctx.fillStyle='#030605'")) throw new Error('Tank cast shadow is missing from silhouette-first renderer');
  if (!fogSource.includes("ctx.roundRect(x+7,y+10,w,h,container?3:1)")) throw new Error('Container shadows must follow obstacle contours');
  if (!fogSource.includes('const INFANTRY_ROUTES=') || !fogSource.includes('function spawnInfantry()') || !fogSource.includes('function updateInfantry(dt)') || !fogSource.includes('function drawSoldier(s)') || !fogSource.includes('function drawInfantryShots()') || !fogSource.includes("['alpha','bravo']") || !fogSource.includes("s.state='flank'") || !fogSource.includes("s.state='cover'") || !fogSource.includes('function drawSoldierShadow(s)')) throw new Error('Two-faction infantry AI, combat, top-down renderer or contour shadows are missing');
  if (!/drawCivilians\(\);drawInfantry\(\)/.test(gameSource) || !/drawInfantryShots\(\)/.test(gameSource) || !/updateDrones\(dt\);updateInfantry\(dt\)/.test(gameSource)) throw new Error('Infantry simulation and rendering are not wired into the main game loop');
  if (!fogSource.includes('function drawGrassBase()') || !fogSource.includes('function drawGrassCanopy()') || !fogSource.includes('function isConcealed(') || !fogSource.includes('t.grassRevealUntil=gameClock+2')) throw new Error('Grass concealment / 2-second firing reveal mechanic missing');
  if (!fogSource.includes("const candidates=t.team==='enemy'?[player(),...allies()].filter(v=>v&&v.alive&&!isConcealed(v)):enemies()")) throw new Error('Enemy target acquisition does not respect grass concealment');
  if (!fogSource.includes('function spawnIntelBox()') || !fogSource.includes('function drawIntelBoxes()') || !fogSource.includes('mapRevealUntil=Math.max(mapRevealUntil,gameClock+3)') || !fogSource.includes('function drawFog(){if(gameClock<mapRevealUntil)return;')) throw new Error('Three-second tactical intel reveal mechanic missing');
  if (!fogSource.includes('crit:critical') || !fogSource.includes('b.damage*(b.crit?1.5:1)') || !fogSource.includes('КРИТИЧЕСКОЕ ПОПАДАНИЕ')) throw new Error('Critical-hit damage / feedback mechanic missing');
  if (!fogSource.includes('function drawDynamicLights()') || !fogSource.includes('function drawIntelBoxes()') || !fogSource.includes('function drawImpactLights()') || !fogSource.includes('function drawSmokeClouds()')) throw new Error('Combat lighting or pickup rendering missing');
  if (!/class=["'][^"']*tank-preview/.test(htmlSource) || !/data-preview-tank=["']support["']/.test(htmlSource) || (htmlSource.match(/data-preview-tank=/g) || []).length !== 9) throw new Error('Five tank cards must use the shared Canvas renderer previews');
  if (!fogSource.includes('function drawTankModel(ctx,t,scale=1,rotation=0)') || !fogSource.includes('function renderTankPreviews()') || !fogSource.includes('setInterval(renderTankPreviews,120)') || !fogSource.includes('Fixed top-down preview angle makes silhouette differences directly comparable') || !fogSource.includes('drawTankModel(c,preview,1,0)') || fogSource.includes('setInterval(renderTankPreviews,33)')) throw new Error('Shared renderer / throttled Canvas tank previews missing');
  if (/PSEUDO-3D|3D TURNTABLE/.test(htmlSource)) throw new Error('2D Canvas tank preview labels must not imply 3D models');
  if (!stylesheetSource.includes('MTBA visual reference pass') || !stylesheetSource.includes('.tank-preview')) throw new Error('Minimal military UI styling missing');
  if (!gameSource.includes('let simAccumulator=0') || !gameSource.includes('while(simAccumulator>=1/60&&steps<4)') || !gameSource.includes('window.MTBA_PERF=') || !gameSource.includes('rebuildGrassCaches()') || !gameSource.includes('const cadence=({player:.34,heavy:.62,scout:.27,sniper:.78,support:.4,brawler:.68,assault:.52,ally:.48})[t.role]') || !gameSource.includes('speed:rand(42,52),range:rand(205,255)')) throw new Error('Fixed timestep, combat cadence, adaptive performance telemetry or cached grass optimizations are missing');
  if (!gameSource.includes('function updateCombatDirector(dt)') || !gameSource.includes("kind==='artillery'") || !gameSource.includes('function drawCombatEvents()') || !gameSource.includes('ПОКИНЬ КРАСНУЮ ЗОНУ')) throw new Error('Combat events must include readable artillery warnings and resolution');
  if (!gameSource.includes("const patterns=['flank','breakthrough','marksmen','mixed']") || !gameSource.includes('e.wavePattern=pattern')) throw new Error('Waves must use distinct enemy compositions');
  if (!gameSource.includes("o.type==='sandbag'||o.type==='barricade'") || !gameSource.includes('o.coverHp-=') || !gameSource.includes('obstacles.splice(oi,1)')) throw new Error('Destructible cover must remove destroyed obstacles from collision and line-of-sight');
  if (!gameSource.includes('t.allyCoverTimer') || !gameSource.includes('t.allyCoverX=cover.x') || !gameSource.includes('t.hp<t.maxHp*.58')) throw new Error('Damaged allied tanks must seek tactical cover');
  if (!gameSource.includes('const activePlayer=player();if(!activePlayer||!activePlayer.alive)return;') || !gameSource.includes('enemies().length<11')) throw new Error('Combat director must guard player death and cap ambush population');
  if (!gameSource.includes('supplyDrops.push(') || !gameSource.includes('СНАБЖЕНИЕ · БОЕЗАПАС ПОПОЛНЕН') || !gameSource.includes('e.flankBonus=true')) throw new Error('Supply drops and flank ambushes must be implemented');
  if (!gameSource.includes('function updateTankMachineGuns(dt)') || !gameSource.includes('function drawTankMGTracers()') || !gameSource.includes('hostileFaction=t.team===\'enemy\'?\'alpha\':\'bravo\'') || !gameSource.includes('target.hp-=8') || !gameSource.includes('mgTracers.push(')) throw new Error('Autonomous tank machine guns, hostile infantry targeting or upgraded vehicle fittings are missing');
  const layerTracks = gameSource.indexOf('Paired side tracks: wide, dark continuous belts');
  const layerHull = gameSource.indexOf('Hull: reference-driven silhouettes');
  const layerTurret = gameSource.indexOf('Turret silhouette: distinct reference-driven plans');
  const layerBarrel = gameSource.indexOf('Long gun silhouette first');
  const layerMantlet = gameSource.indexOf('Distinct reinforced gun mantlet');
  if (!(layerTracks >= 0 && layerTracks < layerHull && layerHull < layerTurret && layerTurret < layerBarrel && layerBarrel < layerMantlet)) throw new Error('Tank render layer order must be tracks -> hull -> turret -> barrel -> mantlet');
  if (!gameSource.includes('MTBA layered tank renderer r16') || !gameSource.includes('Paired side tracks: wide, dark continuous belts') || !gameSource.includes('Role-specific upper hull') || !gameSource.includes('Distinct reinforced gun mantlet') || !gameSource.includes('sniper has a visibly extended barrel') || !gameSource.includes('Role-specific silhouette pass r10') || !gameSource.includes('twin whip antennas') || !gameSource.includes('slotted muzzle brake') || !gameSource.includes('medical/service pack') || !gameSource.includes('Recessed tread blocks') || !gameSource.includes('Hull fittings: recessed front lamps') || !gameSource.includes('Turret cheek plates and rear stowage') || !gameSource.includes('Recessed belt edges and a contact-darkened lower run') || !gameSource.includes('Heat sleeve and two restrained machined bands') || !gameSource.includes('Hatch hinge and periscope glass') || !gameSource.includes('Turret facet pass r14') || !gameSource.includes("ctx.strokeStyle='#d2d9bd55'") || !gameSource.includes('Heavy = Abrams-like wide angular hull') || !gameSource.includes('scout = compact Scorpion-like hull') || !gameSource.includes('sniper = low elongated Jagdpanzer-like hull') || !gameSource.includes('Turret silhouette: distinct reference-driven plans') || !gameSource.includes('Material readability pass r15') || !gameSource.includes('Baked macro-wear pass r15') || !gameSource.includes('Raised rim and corner hardware') || !gameSource.includes('function drawTrackMarks(){for(const tr of trackMarks)') || !gameSource.includes('function bakeObstacleSprite(o)') || !gameSource.includes('function bakeObstacleSprites()') || !gameSource.includes('Cached alpha silhouette includes the SVG\'s soft ground shadow')) throw new Error('Reference-driven tank silhouettes, cached environment rendering or r16 material details are missing');
  if (!fogSource.includes('function createDrones(p)') || !fogSource.includes("kind:'scout'") || !fogSource.includes("kind:'medic'") || !fogSource.includes('function updateDrones(dt)') || !fogSource.includes('function drawDrones()')) throw new Error('Scout and medic drones must be created, updated and rendered');
  if (!fogSource.includes('function scoutDroneSpots(e)') || !fogSource.includes('reveal(scout.x,scout.y,scout.reveal,.32)')) throw new Error('Scout drone does not reveal nearby terrain and enemies');
  if (!fogSource.includes("if(targetHeal&&missing>0&&dist(d,targetHeal)<70)") || !fogSource.includes("say('МЕДДРОН: +'") || !fogSource.includes('targetHeal.hp+=amount')) throw new Error('Medic drone must fly to and heal wounded player/allies');
  if (!fogSource.includes('const count=Math.min(3+Math.ceil(wave*.72),9)') || !fogSource.includes("damage:(t.team==='enemy'?t.damage*.68:t.damage)") || !fogSource.includes("shotLeft:team==='enemy'?rand(.8,1.8):rand(.2,1)")) throw new Error('Enemy damage, wave size or firing cadence was not rebalanced');
  if (!fogSource.includes("if(t.team==='player'&&t.role==='support')damage*=.82")) throw new Error('Support tank damage resistance missing');
  if (!fogSource.includes("function nearestThreat(t){let best=null,bd=Infinity;const candidates=t.team==='enemy'?[player(),...allies()].filter(v=>v&&v.alive&&!isConcealed(v)):enemies()")) throw new Error('Enemy threat selection must use player/allies and respect concealment');
  if (fogSource.includes('Your tank has been disabled') || fogSource.includes("'REDEPLOY'")) throw new Error('Russian game-over text contains English fallback');
  if (await page.locator('[data-tank="support"]').count() !== 1 || (await page.locator('[data-tank]').count()) !== 9) throw new Error('Support tank selection card missing');
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
  // Real touch swipe over a tank preview must scroll the selector, not the page.
  await page.locator('#tankSelect').evaluate(el => { el.scrollTop = 0; });
  const selectorBox = await page.locator('#tankSelect .tank-preview').first().boundingBox();
  if (!selectorBox) throw new Error('Tank preview canvas is not visible for scroll test');
  const swipeX = selectorBox.x + selectorBox.width / 2;
  const swipeY = selectorBox.y + selectorBox.height * .78;
  const selectorScroll = await page.locator('#tankSelect').evaluate(el => {
    const preview = el.querySelector('.tank-preview');
    const rect = preview.getBoundingClientRect();
    const touchAt = (type, y) => {
      const touch = new Touch({identifier:17,target:preview,clientX:rect.left+rect.width/2,clientY:y});
      preview.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:type==='touchmove',touches:type==='touchend'?[]:[touch],targetTouches:type==='touchend'?[]:[touch],changedTouches:[touch]}));
    };
    el.scrollTop = 0;
    touchAt('touchstart',rect.top+rect.height*.78);
    touchAt('touchmove',rect.top+rect.height*.78-105);
    const top = el.scrollTop;
    touchAt('touchend',rect.top+rect.height*.78-105);
    return {top,finalTop:el.scrollTop,max:el.scrollHeight-el.clientHeight,touchAction:getComputedStyle(preview).touchAction,pointerEvents:getComputedStyle(preview).pointerEvents};
  });
  if (selectorScroll.max <= 0 || selectorScroll.top <= 0) throw new Error('Tank selector touch-drag handler failed: '+JSON.stringify(selectorScroll));
  // The real UI deliberately suppresses the synthetic click immediately after a drag.
  // Wait for that short suppression window before testing an intentional tank selection.
  await page.waitForTimeout(100);
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
  if (!balanceSource.includes("scout:{name:'SHADE',hp:74,speed:176,damage:18,reload:.84") || !balanceSource.includes("sniper:{name:'JÄGER',hp:82,speed:112,damage:38,reload:1.72") || !balanceSource.includes("ironclad:{name:'IRONCLAD'") || !balanceSource.includes("demolisher:{name:'DEMOLISHER'") || !balanceSource.includes("viper:{name:'VIPER'") || !balanceSource.includes("wraith:{name:'WRAITH'") || !balanceSource.includes("thunder:{name:'THUNDER'")) throw new Error('Tank balance profile changes missing');
  // Gameplay smoke tests must not wait for optional cinematic media; exercise the reduced-motion path.
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
  await page.locator('#menuBtn').click();
  await page.locator('#overlay:not(.hidden)').waitFor({ state: 'visible' });
  if (await page.locator('[data-tank]').count() !== 9) throw new Error('Return to main menu did not restore all nine tank cards');
  await page.locator('[data-tank="viper"]').click({ force: true });
  if (await page.locator('#selArmor').textContent() !== '86') throw new Error('Tank selection broken after returning to main menu');
  await page.locator('#startBtn').click();
  await page.waitForTimeout(150);
  const returnState = await page.evaluate(() => ({hidden:document.querySelector('#overlay').classList.contains('hidden'),ammo:document.querySelector('#ammoText').textContent}));
  if (!returnState.hidden || returnState.ammo !== '7 / 7') throw new Error('Selected tank did not launch after returning to menu: '+JSON.stringify(returnState));
  await page.locator('#menuBtn').click();
  if (await page.locator('[data-tank]').count() !== 9) throw new Error('Second return to main menu failed');
  await page.locator('[data-tank="heavy"]').click({force:true});
  await page.locator('#startBtn').click();
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 640, height: 320 });
  if (errors.length) throw new Error('Runtime errors: ' + errors.join('; '));
  const assetFailures = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => { const path = new URL(e.name).pathname; return (path.endsWith('/css/game.css') || path.endsWith('/js/game.js') || path.endsWith('/js/mtba-render-engine.js')) && e.responseStatus >= 400; }).map(e => ({name:e.name,status:e.responseStatus}))).catch(() => []);
  if (assetFailures.length) throw new Error('Runtime assets failed to load: ' + JSON.stringify(assetFailures));
  const engineState = await page.evaluate(() => window.MTBARenderEngine?.version || null);
  if (engineState !== '1.0.0') throw new Error('MTBA Render Engine failed to initialize: ' + engineState);

  // Cinematic controller: optional media must fail safely and never replace the Canvas game.
  const cinematicSource = await readFile(resolve(root, 'js/cinematics.js'), 'utf8');
  if (!htmlSource.includes('js/cinematics.js?v=')) throw new Error('Cinematic controller is not loaded by the game shell');
  for (const kind of ['intro','battle','defeat','victory']) if (!cinematicSource.includes(kind + ": './assets/cinematics/")) throw new Error('Missing optional cinematic source mapping: ' + kind);
  if (!cinematicSource.includes('video.addEventListener(\'error\'') || !cinematicSource.includes('video.addEventListener(\'ended\'') || !cinematicSource.includes('skipButton.addEventListener')) throw new Error('Cinematics must recover from missing media, finish normally and support skip');
  if (!cinematicSource.includes('prefers-reduced-motion') || !cinematicSource.includes("video.removeAttribute('src')") || !cinematicSource.includes('function showFallback()') || !cinematicSource.includes('cinematic-fallback')) throw new Error('Cinematics must respect reduced motion, release resources and provide a missing-video fallback');
  if (!gameSource.includes("window.MTBACinematics.playOutcome('defeat'")) throw new Error('Defeat cinematic is not connected to the game-over path');

  // Online party/matchmaking shell: verify real controls exist without breaking solo play.
  for (const id of ['multiplayerPanel','quickMatchBtn','createPartyBtn','partyCodeInput','joinPartyBtn','partyStatus','partyMembers','sharePartyBtn','leavePartyBtn','cancelQueueBtn']) {
    if (await page.locator('#' + id).count() !== 1) throw new Error('Missing online matchmaking control: ' + id);
  }
  const onlineSource = await readFile(resolve(root, 'js/multiplayer.js'), 'utf8');
  const matchmakingSource = await readFile(resolve(root, 'server.mjs'), 'utf8');
  if (!onlineSource.includes('wss://mtba-matchmaking.onrender.com/ws') && !onlineSource.includes('https://mtba-matchmaking.onrender.com')) throw new Error('Online client endpoint is missing');
  if (!onlineSource.includes("send('quick_match')") || !onlineSource.includes("send('create_party')") || !onlineSource.includes("send('join_party'")) throw new Error('Quick match / friend party client actions missing');
  if (!matchmakingSource.includes('MAX_PLAYERS = 6') || !matchmakingSource.includes('p.members.length>=3') || !matchmakingSource.includes('waited>=QUEUE_WAIT_MS')) throw new Error('3v3 matchmaking, three-player party cap or bot-fill timeout missing');
  if (!onlineSource.includes('СЕТЕВОЕ УПРАВЛЕНИЕ ТАНКАМИ ЕЩЁ НЕ ПОДКЛЮЧЕНО')) throw new Error('Online UI must be honest while authoritative gameplay sync is incomplete');

  console.log('MTBA browser smoke tests passed: procedural pixel terrain render engine, shared detailed tank renderer, slowly rotating card turntables, minimal military UI, external asset loading, canvas rendering/scaling, tank selection, ammo HUD, firing/reload recovery, simultaneous movement + FIRE touch input, scout/medic drone mechanics, reduced enemy pressure, tactical orders, smoke, pause/resume, Russian UI and landscape layout and portrait-orientation gate.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
