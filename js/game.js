
(() => {
'use strict';
const canvas=document.getElementById('game'),mainCtx=canvas.getContext('2d',{alpha:false});let ctx=mainCtx;
const $=id=>document.getElementById(id);
const ui={health:$('healthText'),healthBar:$('healthBar'),wave:$('waveText'),kills:$('killsText'),ammo:$('ammoText'),message:$('message'),toast:$('toast'),intel:$('intelBtn'),overlay:$('overlay'),modal:$('modal'),start:$('startBtn'),resume:$('resumeBtn'),pause:$('pauseBtn'),menu:$('menuBtn'),order:$('orderBtn'),fire:$('fireBtn'),smoke:$('smokeBtn'),target:$('targetBtn'),cover:$('coverBtn')};
const WORLD={w:1800,h:1800},TAU=Math.PI*2;
const renderEngine=window.MTBARenderEngine?window.MTBARenderEngine.create(WORLD):null;
let selectedTankRole='player';
const spriteAssets={};
function loadSprite(name,url){const im=new Image();im.onload=()=>{spriteAssets[name]=im};im.src=url}
loadSprite('treeConifer','./assets/environment/tree-conifer.svg?v=2');loadSprite('treeAutumn','./assets/environment/tree-autumn.svg?v=2');loadSprite('bush','./assets/environment/bush.svg?v=2');loadSprite('ruin','./assets/environment/ruin.svg');loadSprite('infantry','./assets/units/infantry.svg');loadSprite('explosion','./assets/effects/explosion.svg?v=2');loadSprite('smoke','./assets/effects/smoke.svg?v=2');
const tankProfiles={player:{name:'T-01 STRIKER',hp:100,speed:148,damage:26,reload:.98,range:560,turn:2.55,size:23,ammo:5},heavy:{name:'T-01 STRIKER',hp:155,speed:104,damage:34,reload:1.42,range:510,turn:1.75,size:28,ammo:4},scout:{name:'L-03 SHADE',hp:74,speed:176,damage:18,reload:.84,range:440,turn:3.05,size:17,ammo:6},sniper:{name:'S-04 NOVA',hp:82,speed:112,damage:38,reload:1.72,range:680,turn:2.0,size:20,ammo:4},support:{name:'R-05 BASTION',hp:120,speed:122,damage:22,reload:1.1,range:470,turn:2.1,size:24,ammo:5}};
let vw=800,vh=600,dpr=1,lastTime=0,running=false,paused=true,gameOver=false,wave=1,kills=0,order='push',autoAim=true,mouse={x:0,y:0,active:false,down:false},toastTimer=0,shotId=0,touchMoveTarget=null,touchMovePointer=null,selectedTargetId=null,joystickPointer=null,joystickVector={x:0,y:0};
const bullets=[],infantryShots=[],mgTracers=[],soldiers=[],particles=[],smokes=[],obstacles=[],trees=[],grassPatches=[],civilians=[],medkits=[],intelBoxes=[],tanks=[],drones=[],wallMarks=[],trackMarks=[],muzzleFlashes=[],impactLights=[],shockwaves=[],wrecks=[],bloodPools=[];let soldierId=0;
let gameClock=0,mapRevealUntil=0;
let audioCtx=null,trackSoundTimer=0,screenShake=0,screenFlash=0,fogCanvas=null,fogCtx=null;
const input={fire:false};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const ambience=Array.from({length:42},()=>({x:Math.random(),y:Math.random(),r:rand(.45,1.7),speed:rand(3,13),drift:rand(-4,4),phase:rand(0,Math.PI*2),ember:Math.random()<.14,alpha:rand(.12,.42)}));
const say=(text,ms=1700)=>{ui.toast.textContent=text;ui.toast.style.opacity='1';toastTimer=ms/1000};
function resize(){const r=canvas.getBoundingClientRect();dpr=Math.min(window.devicePixelRatio||1,(Number(navigator.deviceMemory||4)<=4||Number(navigator.hardwareConcurrency||4)<=4)?1.25:1.5);vw=Math.max(1,r.width);vh=Math.max(1,r.height);canvas.width=Math.round(vw*dpr);canvas.height=Math.round(vh*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);fogCanvas=document.createElement('canvas');fogCanvas.width=canvas.width;fogCanvas.height=canvas.height;fogCtx=fogCanvas.getContext('2d');}
function initAudio(){if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});return}try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){audioCtx=new AC();audioCtx.resume().catch(()=>{})}}catch(e){audioCtx=null}}
function tone(freq,endFreq,duration,volume,type='sawtooth'){if(!audioCtx)return;const now=audioCtx.currentTime,osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();osc.type=type;osc.frequency.setValueAtTime(Math.max(1,freq),now);osc.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),now+duration);filter.type='lowpass';filter.frequency.value=type==='sine'?1100:2400;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+duration+.02)}
function noiseBurst(duration,volume,cutoff=1800){if(!audioCtx)return;const now=audioCtx.currentTime,len=Math.max(1,Math.floor(audioCtx.sampleRate*duration)),buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);const src=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();src.buffer=buf;filter.type='lowpass';filter.frequency.value=cutoff;gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);src.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);src.start(now)}
function soundShot(role){initAudio();if(!audioCtx)return;const heavy=role==='heavy'||role==='brawler'||role==='sniper';tone(heavy?115:175,heavy?38:62,heavy?.24:.17,heavy?.19:.15,'sawtooth');noiseBurst(heavy?.16:.11,heavy?.17:.13,heavy?1250:2100);tone(heavy?64:90,35,.28,.075,'sine')}
function soundImpact(strong=false){if(!audioCtx)return;noiseBurst(strong?.2:.1,strong?.12:.065,strong?900:1500);tone(strong?88:145,strong?32:65,strong?.22:.12,strong?.08:.045,'triangle')}
function soundTreads(intensity=1){if(!audioCtx)return;tone(64+Math.random()*12,48,.11,.018*intensity,'triangle');noiseBurst(.075,.012*intensity,380)}
function soundReload(){if(!audioCtx)return;tone(520,360,.07,.035,'square');tone(360,620,.09,.025,'triangle')}
window.addEventListener('resize',resize,{passive:true});
function clearTreeSpot(x,y){const crown=52;for(const o of obstacles)if(x+crown>o.x&&x-crown<o.x+o.w&&y+crown>o.y&&y-crown<o.y+o.h)return false;return true}
function buildArena(){obstacles.length=0;grassPatches.length=0;
/* Standardized world scale: containers are elongated industrial modules, never arbitrary cubes. */
const blocks=[
[270,240,220,92],[600,180,92,220],[970,240,220,92],[1390,220,100,220],
[180,590,100,220],[480,560,230,96],[850,590,100,220],[1160,560,230,96],[1500,620,96,210],
[280,980,230,96],[640,950,96,220],[930,1010,230,96],[1300,960,100,220],
[170,1370,100,190],[520,1370,230,96],[900,1360,100,200],[1210,1370,230,96],[1510,1300,96,210]
];
for(let i=0;i<blocks.length;i++){const [x,y,w,h]=blocks[i];const container=i%3!==1;obstacles.push({x,y,w,h,type:container?'container':'concrete',orientation:w>=h?'horizontal':'vertical',hp:Infinity});}
/* Vegetation forms irregular cover patches and buffers the industrial structures. */
for(const [x,y,w,h] of [[350,365,155,105],[730,410,135,105],[1120,390,160,110],[230,825,145,105],[745,815,150,105],[1100,1150,165,110],[385,1195,155,100],[1440,835,130,105],[80,1090,100,180],[1600,420,105,160]]){if(!blocks.some(([bx,by,bw,bh])=>x<bx+bw+24&&x+w>bx-24&&y<by+bh+24&&y+h>by-24))grassPatches.push({x,y,w,h,seed:Math.floor(x*3+y*7)});}
trees.length=0;for(let i=0;i<42;i++){const x=rand(55,WORLD.w-55),y=rand(55,WORLD.h-55);if(clearTreeSpot(x,y))trees.push({x,y,r:rand(25,37),tone:Math.floor(rand(0,4)),seed:rand(0,TAU)})}
medkits.length=0;for(let i=0;i<9;i++)spawnMedkit();intelBoxes.length=0;for(let i=0;i<3;i++)spawnIntelBox()}
function spawnMedkit(){for(let i=0;i<80;i++){const x=rand(45,WORLD.w-45),y=rand(45,WORLD.h-45);if(clearSpot(x,y,20)){medkits.push({x,y,life:rand(28,44),pulse:rand(0,TAU),heal:35});return true}}return false}
function spawnIntelBox(){for(let i=0;i<90;i++){const x=rand(55,WORLD.w-55),y=rand(55,WORLD.h-55);if(clearSpot(x,y,25)&&!grassPatches.some(g=>x>g.x&&x<g.x+g.w&&y>g.y&&y<g.y+g.h)){intelBoxes.push({x,y,life:rand(35,48),pulse:rand(0,TAU)});return true}}return false}
function makeTank(team,role,x,y){
const stats={player:tankProfiles.player,heavy:tankProfiles.heavy,scout:tankProfiles.scout,sniper:tankProfiles.sniper,support:tankProfiles.support,ally:{hp:110,speed:122,reload:1.1,damage:16,range:450,turn:2.1,size:20,ammo:4},brawler:{hp:115,speed:88,reload:1.15,damage:17,range:260,turn:1.85,size:24,ammo:4},assault:{hp:72,speed:108,reload:1.2,damage:15,range:430,turn:2.05,size:20,ammo:4}};
const s=stats[role]||stats.assault;return {id:++shotId,team,role,x,y,supportPulse:0,a:team==='player'?-Math.PI/2:Math.PI/2,turret:team==='player'?-Math.PI/2:Math.PI/2,hp:s.hp,maxHp:s.hp,speed:s.speed,reload:s.reload,damage:s.damage,range:s.range,turn:s.turn,size:s.size,ammo:s.ammo,maxAmmo:s.ammo,reloadLeft:0,shotLeft:team==='enemy'?rand(.8,1.8):rand(.2,1),alive:true,moveX:0,moveY:0,coverSide:Math.random()<.5?-1:1,seenX:x,seenY:y,think:0,flash:0,smokeCharges:team==='player'?3:0,order:'push',pathX:x,pathY:y,stuck:0,lastX:x,lastY:y,aiPhase:rand(0,TAU),hitFlash:0};
}
function clearSpot(x,y,r=30){if(x<r||y<r||x>WORLD.w-r||y>WORLD.h-r)return false;for(const o of obstacles)if(x+r>o.x&&x-r<o.x+o.w&&y+r>o.y&&y-r<o.y+o.h)return false;for(const t of tanks)if(t.alive&&Math.hypot(t.x-x,t.y-y)<r+t.size+8)return false;return true}
function spawnAtEdge(role,team){const p=player(),cx=p?p.x:WORLD.w*.5,cy=p?p.y:WORLD.h*.5;if(team==='enemy'){for(let i=0;i<120;i++){const a=rand(0,TAU),r=rand(410,560),x=clamp(cx+Math.cos(a)*r,42,WORLD.w-42),y=clamp(cy+Math.sin(a)*r,42,WORLD.h-42);if(clearSpot(x,y,30))return makeTank(team,role,x,y)}}for(let i=0;i<100;i++){const side=Math.floor(Math.random()*4);let x=side===0?40:side===1?WORLD.w-40:rand(40,WORLD.w-40),y=side===2?40:side===3?WORLD.h-40:rand(40,WORLD.h-40);if(clearSpot(x,y,28))return makeTank(team,role,x,y)}return makeTank(team,role,rand(80,WORLD.w-80),rand(80,WORLD.h-80))}
function startGame(){gameClock=0;mapRevealUntil=0;drones.length=0;soldiers.length=0;infantryShots.length=0;soldierId=0;bullets.length=0;particles.length=0;smokes.length=0;intelBoxes.length=0;wallMarks.length=0;trackMarks.length=0;muzzleFlashes.length=0;impactLights.length=0;tanks.length=0;screenShake=0;screenFlash=0;trackSoundTimer=0;mgTracers.length=0;initAudio();simAccumulator=0;wave=1;kills=0;gameOver=false;order='push';selectedTargetId=null;touchMoveTarget=null;ui.order.innerHTML='♟<small>ОТРЯД</small>';ui.order.classList.add('active');buildArena();rebuildGrassCaches();buildCivilians();const p=makeTank('player',selectedTankRole,WORLD.w/2,WORLD.h/2);tanks.push(p);for(let i=0;i<2;i++){const a=makeTank('ally','ally',p.x+(i?70:-70),p.y+60);a.order=order;tanks.push(a)}createDrones(p);spawnWave();spawnInfantry();ui.ammo.textContent=p.ammo+' / '+p.maxAmmo;running=true;paused=false;ui.overlay.classList.add('hidden');ui.pause.textContent='Ⅱ';say('ОТРЯД ВЫДВИНУТ · ПРИКАЗ: АТАКА',2200);lastTime=0}
function spawnWave(){const count=Math.min(3+Math.ceil(wave*.72),9);for(let i=0;i<count;i++){const r=Math.random(),role=r<.25?'brawler':r<.49?'scout':r<.72?'sniper':'assault';const e=spawnAtEdge(role,'enemy');const scale=Math.min(1.22,1+Math.max(0,wave-1)*.022);e.hp=Math.round(e.hp*scale);e.maxHp=e.hp;e.damage=Math.round(e.damage*Math.min(1.1,1+Math.max(0,wave-1)*.012));e.speed*=Math.min(1.06,1+Math.max(0,wave-1)*.004);tanks.push(e)}ui.wave.textContent=String(wave).padStart(2,'0');say('ВОЛНА '+String(wave).padStart(2,'0')+' · ВРАГИ ПРИБЛИЖАЮТСЯ',1900)}
function createDrones(p){drones.length=0;drones.push({kind:'scout',x:p.x-34,y:p.y-50,vx:0,vy:0,phase:0,healTimer:0,reveal:220});drones.push({kind:'medic',x:p.x+35,y:p.y+35,vx:0,vy:0,phase:Math.PI,healTimer:.5,reveal:0})}
function updateDrones(dt){const p=player();if(!p||!p.alive)return;for(const d of drones){d.phase+=dt*(d.kind==='scout'?1.6:1.15);let tx,ty;if(d.kind==='scout'){const lead=160;tx=p.x+Math.cos(p.a)*lead+Math.cos(d.phase*1.25)*32;ty=p.y+Math.sin(p.a)*lead+Math.sin(d.phase)*32}else{let target=p,best=p.maxHp-p.hp;for(const a of allies()){const missing=a.maxHp-a.hp;if(missing>best){best=missing;target=a}}if(best<1){target=p;tx=p.x+Math.cos(d.phase)*48;ty=p.y+Math.sin(d.phase)*48}else{tx=target.x+Math.cos(d.phase)*25;ty=target.y+Math.sin(d.phase)*25}}const dx=tx-d.x,dy=ty-d.y,dd=Math.hypot(dx,dy)||1,speed=d.kind==='scout'?190:165,step=Math.min(dd,speed*dt);d.vx=dx/dd*speed;d.vy=dy/dd*speed;d.x+=dx/dd*step;d.y+=dy/dd*step;d.x=clamp(d.x,18,WORLD.w-18);d.y=clamp(d.y,18,WORLD.h-18);if(d.kind==='medic'){d.healTimer-=dt;if(d.healTimer<=0){let targetHeal=null,missing=0;for(const t of tanks){if(!t.alive||t.team==='enemy')continue;const amount=t.maxHp-t.hp;if(amount>missing&&dist(d,t)<245){missing=amount;targetHeal=t}}if(targetHeal&&missing>0&&dist(d,targetHeal)<70){const amount=Math.min(targetHeal===p?12:10,missing);targetHeal.hp+=amount;d.healTimer=1.25;burst(targetHeal.x,targetHeal.y,'#78ffd1',8);impactLights.push({x:targetHeal.x,y:targetHeal.y,life:.42,max:.42,r:targetHeal.size*3.2,color:'#72ffc0'});if(targetHeal===p)say('МЕДДРОН: +'+Math.round(amount)+' HP',800)}else d.healTimer=.2}}}}
function inGrass(t){if(!t)return false;for(const g of grassPatches){const nx=clamp(t.x,g.x,g.x+g.w),ny=clamp(t.y,g.y,g.y+g.h);if((t.x-nx)**2+(t.y-ny)**2<(t.size*.55)**2)return true}return false}
function isConcealed(t){return !!(t&&((t.team==='player'&&inGrass(t)&&gameClock>=(t.grassRevealUntil||0))||(t.faction&&inGrass(t)&&gameClock>=(t.revealUntil||0))))}
function player(){return tanks.find(t=>t.team==='player')}
function allies(){return tanks.filter(t=>t.team==='ally'&&t.alive)}
function enemies(){return tanks.filter(t=>t.team==='enemy'&&t.alive)}
function canSpot(t,e){if(!t||!e||!e.alive||e.team!=='enemy')return false;const d=dist(t,e);if(d>Math.max(t.range,330))return false;return lineOfSight(t,e)}
function scoutDroneSpots(e){const d=drones.find(v=>v.kind==='scout');return !!(d&&e&&e.alive&&dist(d,e)<d.reveal&&lineOfSight(d,e))}
function nearestEnemy(t,visibleOnly=false){let best=null,bd=Infinity;for(const e of enemies()){const d=dist(t,e);if(d<t.range&&(!visibleOnly||lineOfSight(t,e))&&d<bd){best=e;bd=d}}return best}
function aimTarget(t){const chosen=selectedTargetId===null?null:enemies().find(e=>e.id===selectedTargetId&&dist(t,e)<t.range&&lineOfSight(t,e));return chosen||nearestEnemy(t,true)}
function cycleTarget(){const p=player();if(!p)return;const list=enemies().filter(e=>dist(p,e)<p.range&&lineOfSight(p,e)).sort((a,b)=>dist(p,a)-dist(p,b));if(!list.length){selectedTargetId=null;say('ВИДИМЫХ ЦЕЛЕЙ НЕТ');return}let i=list.findIndex(e=>e.id===selectedTargetId);selectedTargetId=list[(i+1)%list.length].id;const e=list[(i+1)%list.length];say('ЦЕЛЬ: '+({brawler:'ТЯЖЁЛЫЙ ПРОТИВНИК',scout:'РАЗВЕДЧИК',sniper:'СНАЙПЕР',assault:'ШТУРМОВИК',support:'ПОДДЕРЖКА'}[e.role]||'ВРАГ'))}
function useCover(){const p=player(),threat=p&&nearestThreat(p);if(!p||!p.alive){say('ТАНК НЕДОСТУПЕН');return}const point=threat&&findCoverPoint(p,threat);if(point){touchMoveTarget={x:point.x,y:point.y};say('МАРШРУТ К УКРЫТИЮ ПОСТРОЕН')}else{setOrder('hold');say('ОТРЯД ЗАНИМАЕТ ОБОРОНУ') }}
function nearestThreat(t){let best=null,bd=Infinity;const candidates=t.team==='enemy'?[player(),...allies()].filter(v=>v&&v.alive&&!isConcealed(v)):enemies();for(const e of candidates){if(e===t)continue;const d=dist(t,e);if(d<bd){best=e;bd=d}}return best}
function findCoverPoint(t,threat){let best=null,bestScore=Infinity;for(const o of obstacles){const cx=o.x+o.w/2,cy=o.y+o.h/2,ang=Math.atan2(cy-threat.y,cx-threat.x);for(const side of [-1,1]){const x=clamp(cx+Math.cos(ang)*((o.w+o.h)*.24+34),35,WORLD.w-35),y=clamp(cy+Math.sin(ang)*((o.w+o.h)*.24+34),35,WORLD.h-35);if(collides(x,y,t.size*.85,t))continue;const candidate={x,y};if(lineOfSight(candidate,threat))continue;const score=dist(t,candidate)+dist(candidate,threat)*.08;if(score<bestScore){bestScore=score;best=candidate}}}return best}
function segmentIntersectsRect(x1,y1,x2,y2,r){let t0=0,t1=1;const dx=x2-x1,dy=y2-y1;let p=-dx,q=x1-r.x;if(Math.abs(p)<1e-9){if(q<0)return false}else{let t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}p=dx;q=r.x+r.w-x1;if(Math.abs(p)<1e-9){if(q<0)return false}else{let t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}p=-dy;q=y1-r.y;if(Math.abs(p)<1e-9){if(q<0)return false}else{let t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}p=dy;q=r.y+r.h-y1;if(Math.abs(p)<1e-9){if(q<0)return false}else{let t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}}return true}
function leadAim(shooter,target){const d=dist(shooter,target),speed=shooter.role==='sniper'?760:shooter.role==='support'?410:shooter.role==='heavy'?320:360,flight=Math.min(.85,d/Math.max(1,speed)),vx=Number.isFinite(target.moveX)?target.moveX:0,vy=Number.isFinite(target.moveY)?target.moveY:0;return {x:target.x+vx*flight*.72,y:target.y+vy*flight*.72}}
function lineOfSight(a,b){for(const o of obstacles)if(segmentIntersectsRect(a.x,a.y,b.x,b.y,o))return false;for(const s of smokes){if(s.life>0&&segmentCircle(a.x,a.y,b.x,b.y,s.x,s.y,s.r))return false}return true}
function segmentCircle(x1,y1,x2,y2,cx,cy,r){const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy||1,t=clamp(((cx-x1)*dx+(cy-y1)*dy)/l,0,1);return (x1+dx*t-cx)**2+(y1+dy*t-cy)**2<r*r}
function circleRect(x,y,r,o){const nx=clamp(x,o.x,o.x+o.w),ny=clamp(y,o.y,o.y+o.h),dx=x-nx,dy=y-ny;return dx*dx+dy*dy<r*r}
function collides(x,y,r,self){if(x<r||y<r||x>WORLD.w-r||y>WORLD.h-r)return true;for(const o of obstacles)if(circleRect(x,y,r,o))return true;for(const t of tanks)if(t!==self&&t.alive&&Math.hypot(x-t.x,y-t.y)<r+t.size*.82)return true;return false}
function moveTank(t,dx,dy){const stepSize=Math.max(3,t.size*.28),steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/stepSize)),sx=dx/steps,sy=dy/steps,r=t.size*.78;for(let i=0;i<steps;i++){const nx=clamp(t.x+sx,r,WORLD.w-r),ny=clamp(t.y+sy,r,WORLD.h-r);if(!collides(nx,t.y,r,t))t.x=nx;if(!collides(t.x,ny,r,t))t.y=ny}}
function rotateToward(current,target,max){return current+clamp(angleDiff(target,current),-max,max)}
function reload(t){if(t.alive&&t.ammo<t.maxAmmo&&t.reloadLeft<=0){t.reloadLeft=t.reload*(t.role==='player'?1.1:1);if(t.team==='player')soundReload();say(t.team==='player'?'Перезарядка орудия':'Перезарядка отряда',900)}}
function fire(t,targetX,targetY){if(!t.alive||t.reloadLeft>0||t.shotLeft>0)return false;if(t.team==='player'&&inGrass(t))t.grassRevealUntil=gameClock+2;if(t.ammo<=0){reload(t);return false}const aim=Math.atan2(targetY-t.y,targetX-t.x);if(Math.abs(angleDiff(aim,t.turret))>.24)return false;const laser=t.role==='sniper',electric=t.role==='support',spread=t.role==='scout'?.045:laser?.004:.022,a=t.turret+rand(-spread,spread),muzzle=t.size+8,mx=t.x+Math.cos(a)*(muzzle+2),my=t.y+Math.sin(a)*(muzzle+2),speed=laser?760:electric?410:t.role==='heavy'?320:360,glow=laser?'#5ee7ff':electric?'#b69aff':t.team==='enemy'?'#ff786e':'#ffd38b',critChance=laser?.12:heavyRole(t.role)?.055:.08,critical=Math.random()<critChance;bullets.push({x:mx,y:my,px:mx,py:my,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:laser?1.15:1.8,damage:(t.team==='enemy'?t.damage*.68:t.damage),team:t.team,owner:t,weapon:laser?'laser':electric?'pulse':'kinetic',trail:[],crit:critical,id:++shotId});t.ammo--;const cadence=({player:.34,heavy:.62,scout:.27,sniper:.78,support:.4,brawler:.68,assault:.52,ally:.48})[t.role]||.5;t.shotLeft=cadence*(t.team==='enemy'?1.12:1);t.recoil=.16;if(t.ammo===0)t.reloadLeft=t.reload*1.18;const flashLife=laser?.19:.14,flashRadius=t.size*(laser?1.55:t.role==='heavy'?2.1:1.72);muzzleFlashes.push({x:mx,y:my,a,life:flashLife,max:flashLife,r:flashRadius,team:t.team,color:glow});impactLights.push({x:mx,y:my,life:.2,max:.2,r:t.size*4.6,color:glow});burst(mx,my,glow,laser?6:10);burst(mx,my,'#fff7d8',laser?3:5);for(let i=0;i<(laser?1:3)&&particles.length<180;i++){const side=Math.random()<.5?-1:1,v=rand(65,145);particles.push({x:mx,y:my,vx:Math.cos(a+side*1.2)*v,vy:Math.sin(a+side*1.2)*v,life:rand(.1,.2),max:.2,color:'#ffdf9b',r:rand(1.2,2.2)})}soundShot(t.role);if(t.team==='player'){screenShake=Math.max(screenShake,laser?.06:t.role==='heavy'?.2:.12)}return true}
function heavyRole(role){return role==='heavy'||role==='brawler'}
function burst(x,y,color,n=8){for(let i=0;i<n&&particles.length<180;i++)particles.push({x,y,vx:rand(-85,85),vy:rand(-85,85),life:rand(.15,.48),max:.48,color,r:rand(1,3)})}
function hit(t,damage,x,y,critical=false){if(t.team==='player'&&t.role==='support')damage*=.82;t.hp-=damage;t.hitFlash=critical?.24:.14;burst(x,y,critical?'#fff27a':t.team==='enemy'?'#ff6b65':'#ffce77',critical?15:7);burst(x,y,'#fff3d0',critical?7:3);impactLights.push({x,y,life:critical?.34:.22,max:critical?.34:.22,r:Math.max(30,t.size*(critical?4.5:3)),color:critical?'#fff27a':t.team==='enemy'?'#ff654d':'#ffcb72'});if(critical){shockwaves.push({x,y,r:3,speed:220,life:.3,max:.3,color:'#fff27a'});say('КРИТИЧЕСКОЕ ПОПАДАНИЕ · +50% УРОНА',900)}soundImpact(t.hp<=0);if(t.team==='player'){screenShake=Math.max(screenShake,.42);screenFlash=Math.max(screenFlash,.2)}else if(t.team==='ally')screenShake=Math.max(screenShake,.08);if(t.hp<=0){t.alive=false;wrecks.push({x:t.x,y:t.y,a:t.a,size:t.size,life:9,max:9,team:t.team,seed:Math.random()*6.28});if(wrecks.length>24)wrecks.shift();shockwaves.push({x:t.x,y:t.y,r:4,speed:t.team==='player'?180:125,life:.48,max:.48,color:t.team==='enemy'?'#ff8c57':'#79e8e2'});if(shockwaves.length>18)shockwaves.shift();burst(t.x,t.y,'#ff7c51',22);if(t.team==='enemy'){kills++;ui.kills.textContent=kills}if(t.team==='player'){gameOver=true;paused=true;showOverlay('ТАНК УНИЧТОЖЕН','Танк выведен из строя. Поле боя потеряно.','ПОВТОРНЫЙ ВЫХОД',true)}}}
function useIntelBox(){const p=player();if(!p||!p.alive){say('РАЗВЕДКА НЕДОСТУПНА');return}let best=null,bd=Infinity;for(const b of intelBoxes){const d=dist(p,b);if(d<bd){bd=d;best=b}}if(best&&bd<190){intelBoxes.splice(intelBoxes.indexOf(best),1);mapRevealUntil=Math.max(mapRevealUntil,gameClock+3);burst(best.x,best.y,'#65f4ff',22);impactLights.push({x:best.x,y:best.y,life:.55,max:.55,r:100,color:'#65f4ff'});say('РАЗВЕДДАННЫЕ: ВСЯ КАРТА ОТКРЫТА · 3 СЕК.',1500)}else say('ПОДЪЕДЬТЕ К РАЗВЕДБОКСУ');}
function useSmoke(){initAudio();const p=player();if(!p||!p.alive||p.smokeCharges<=0){say('Запас дыма исчерпан');return}p.smokeCharges--;smokes.push({x:p.x,y:p.y,r:125,life:5,max:5});ui.smoke.querySelector('b').textContent='×'+p.smokeCharges;say('Дымовая завеса выпущена');}
function showOverlay(title,desc,button,over=false){ui.modal.innerHTML='<div class="eyebrow">FREEzzzGAMES / MTBA · BATTLE ARENA</div><h1>'+title+'</h1><p>'+desc+'</p><p>Коснитесь поля боя и удерживайте палец, чтобы двигаться. Кнопки справа: огонь, дым, смена цели, отряд и укрытие.</p><button class="primary" id="startBtn">'+button+'</button><button class="secondary" id="resumeBtn">ПРОДОЛЖИТЬ БОЙ</button>';ui.overlay.classList.remove('hidden');$('startBtn').addEventListener('click',startGame);$('resumeBtn').addEventListener('click',()=>{if(!gameOver){paused=false;ui.overlay.classList.add('hidden');lastTime=0}});$('resumeBtn').hidden=over;ui.pause.textContent='▶'}
function setOrder(o){order=o;ui.order.innerHTML='♟<small>ОТРЯД</small>';ui.order.title='Приказ отряду: '+({push:'атака',hold:'держаться',retreat:'отступление'}[o]);ui.order.classList.add('active');for(const a of allies()){a.order=o;if(o==='hold'){a.pathX=a.x;a.pathY=a.y;a.holdSet=true}else a.holdSet=false}say('ПРИКАЗ ОТРЯДУ: '+({push:'АТАКА — НАСТУПАТЬ',hold:'ДЕРЖАТЬСЯ — ОБОРОНЯТЬ ПОЗИЦИЮ',retreat:'ОТСТУПЛЕНИЕ — ПЕРЕГРУППИРОВАТЬСЯ'}[o]))}
ui.order.addEventListener('click',()=>setOrder(order==='push'?'hold':order==='hold'?'retreat':'push'));ui.target.addEventListener('click',cycleTarget);ui.cover.addEventListener('click',useCover);
function updateAI(t,dt){if(t.team==='enemy'){const threat=nearestThreat(t)||player();if(!threat)return;const d=dist(t,threat),visible=lineOfSight(t,threat),los=visible&&d<t.range;if(visible){t.seenX=threat.x;t.seenY=threat.y;t.lastSeenTimer=2.8}else t.lastSeenTimer=Math.max(0,(t.lastSeenTimer||0)-dt);let tx=t.seenX,ty=t.seenY;if(t.role==='brawler'){if(d>205){tx=threat.x;ty=threat.y}else{tx=t.x+(t.x-threat.x)*.65;ty=t.y+(t.y-threat.y)*.65}}else if(t.role==='scout'){const a=Math.atan2(threat.y-t.y,threat.x-t.x)+t.coverSide*1.15;tx=threat.x-Math.cos(a)*245;ty=threat.y-Math.sin(a)*245;if(d<170){tx=t.x+(t.x-threat.x)*1.1;ty=t.y+(t.y-threat.y)*1.1}}else if(t.role==='sniper'){if(d<360){tx=t.x+(t.x-threat.x)*1.1;ty=t.y+(t.y-threat.y)*1.1}else if(d>570){tx=threat.x;ty=threat.y}}else if(d<235){tx=t.x+(t.x-threat.x)*.9;ty=t.y+(t.y-threat.y)*.9}if(!visible&&t.lastSeenTimer<=0){tx=t.seenX+Math.cos(t.aiPhase)*95;ty=t.seenY+Math.sin(t.aiPhase)*95}const threatened=visible&&(t.hp<t.maxHp*.65||d<270);if(threatened&&t.role!=='brawler'&&(t.coverCooldown||0)<=0){const cover=findCoverPoint(t,threat);if(cover){t.coverX=cover.x;t.coverY=cover.y;t.coverCooldown=2.4}else{t.coverCooldown=.8}}t.coverCooldown=Math.max(0,(t.coverCooldown||0)-dt);if(t.coverCooldown>0&&Number.isFinite(t.coverX)){tx=t.coverX;ty=t.coverY}driveAI(t,tx,ty,dt);const aim=leadAim(t,threat),aa=Math.atan2(aim.y-t.y,aim.x-t.x);t.turret=rotateToward(t.turret,aa,t.turn*dt*1.15);if(los){if(Math.abs(angleDiff(aa,t.turret))<.24)fire(t,aim.x,aim.y)}else if(t.ammo===0||t.ammo<t.maxAmmo&&t.reloadLeft<=0&&t.shotLeft<=0)reload(t);return}if(t.team==='ally'){const p=player();if(!p||!p.alive)return;const target=nearestEnemy(t,true);let tx=p.x+(t.id%2?80:-80),ty=p.y+70;if(t.order==='push'&&target){tx=target.x;ty=target.y}else if(t.order==='hold'){if(!t.holdSet){t.pathX=t.x;t.pathY=t.y;t.holdSet=true}tx=t.pathX;ty=t.pathY}else if(t.order==='retreat'){tx=p.x+(t.id%2?120:-120);ty=p.y+145}else t.holdSet=false;if(target){const aim=leadAim(t,target),aa=Math.atan2(aim.y-t.y,aim.x-t.x);t.turret=rotateToward(t.turret,aa,t.turn*dt*1.25);if(lineOfSight(t,target)&&dist(t,target)<t.range*.92){if(Math.abs(angleDiff(aa,t.turret))<.24)fire(t,aim.x,aim.y)}}if(t.order!=='hold'||dist(t,{x:tx,y:ty})>35)driveAI(t,tx,ty,dt)}}
function driveAI(t,tx,ty,dt){let dx=tx-t.x,dy=ty-t.y,d=Math.hypot(dx,dy);if(d<9){t.moveX*=.75;t.moveY*=.75;return}let ax=dx/(d||1),ay=dy/(d||1),avoidX=0,avoidY=0;for(const o of obstacles){const nx=clamp(t.x,o.x-18,o.x+o.w+18),ny=clamp(t.y,o.y-18,o.y+o.h+18),ox=t.x-nx,oy=t.y-ny,od=Math.hypot(ox,oy);if(od<58&&od>0){const strength=(58-od)/58;avoidX+=ox/od*strength*1.7;avoidY+=oy/od*strength*1.7}}for(const other of tanks){if(other===t||!other.alive)continue;const ox=t.x-other.x,oy=t.y-other.y,od=Math.hypot(ox,oy),min=t.size+other.size+9;if(od<min&&od>0){const strength=(min-od)/min;avoidX+=ox/od*strength*1.9;avoidY+=oy/od*strength*1.9}}let vx=ax+avoidX,vy=ay+avoidY,vl=Math.hypot(vx,vy)||1;vx/=vl;vy/=vl;const desired=Math.atan2(vy,vx);t.a=rotateToward(t.a,desired,t.turn*dt);const diff=Math.abs(angleDiff(desired,t.a)),turnFactor=diff>1.35?.28:diff>.75?.58:1;const nearThreat=nearestThreat(t),combatDist=nearThreat?dist(t,nearThreat):Infinity,retreating=t.role==='brawler'?combatDist<85:t.role==='scout'?combatDist<115:t.role==='sniper'?combatDist<270:combatDist<105;const speed=t.speed*turnFactor*(retreating?.8:1);const mx=Math.cos(t.a)*speed*dt,my=Math.sin(t.a)*speed*dt;t.moveX=mx/(dt||1);t.moveY=my/(dt||1);const beforeX=t.x,beforeY=t.y;moveTank(t,mx,my);if(Math.hypot(t.x-beforeX,t.y-beforeY)<.25){t.stuck=(t.stuck||0)+dt;if(t.stuck>.55){t.coverSide*=-1;t.a+=t.coverSide*.85;t.stuck=0}}else t.stuck=0}
function updateTankMachineGuns(dt){for(let i=mgTracers.length-1;i>=0;i--){mgTracers[i].life-=dt;if(mgTracers[i].life<=0)mgTracers.splice(i,1)}for(const t of tanks){if(!t.alive)continue;t.mgCooldown=Math.max(0,(t.mgCooldown||0)-dt);t.mgFlash=Math.max(0,(t.mgFlash||0)-dt);let target=null,best=340;const hostileFaction=t.team==='enemy'?'alpha':'bravo';for(const s of soldiers){if(!s.alive||s.faction!==hostileFaction||soldierHidden(s))continue;const d=dist(t,s);if(d<best&&lineOfSight(t,s)){best=d;target=s}}if(!target){t.mgTargetId=null;continue}const aim=Math.atan2(target.y-t.y,target.x-t.x);t.mgAngle=rotateToward(Number.isFinite(t.mgAngle)?t.mgAngle:t.a,aim,(t.mgTurn||4.8)*dt);t.mgTargetId=target.id;if(t.mgCooldown>0||Math.abs(angleDiff(aim,t.mgAngle))>.22)continue;const a=t.mgAngle+rand(-.035,.035),muzzle=t.size*1.02,mx=t.x+Math.cos(a)*muzzle,my=t.y+Math.sin(a)*muzzle,hitChance=clamp(1-best/520,.32,.88),hit=Math.random()<hitChance,tx=hit?target.x+rand(-3.5,3.5):t.x+Math.cos(a)*best,ty=hit?target.y+rand(-3.5,3.5):t.y+Math.sin(a)*best;mgTracers.push({x:mx,y:my,tx,ty,life:.085,max:.085,team:t.team});if(hit&&lineOfSight(t,target)){target.hp-=8;target.suppression=Math.min(2.5,(target.suppression||0)+.32);target.revealUntil=gameClock+1.5;target.state='suppressed';if(target.hp<=0)killSoldier(target,hostileFaction);else if(Math.random()<.45)burst(target.x,target.y,hostileFaction==='alpha'?'#58dfff':'#ff6b61',2)}t.mgCooldown=({player:.115,heavy:.14,scout:.095,sniper:.15,support:.12,brawler:.14,assault:.11,ally:.12})[t.role]||.12;t.mgFlash=.055;t.mgRecoil=.05;if(mgTracers.length>72)mgTracers.splice(0,mgTracers.length-72)}}
function update(dt){if(paused||!running)return;gameClock+=dt;updateCivilians(dt);for(let i=medkits.length-1;i>=0;i--){const m=medkits[i];m.life-=dt;m.pulse+=dt*3;if(m.life<=0){medkits.splice(i,1);continue}for(const t of tanks){if(!t.alive||t.team==='enemy'||t.hp>=t.maxHp-1)continue;if(dist(t,m)<t.size+15){const healed=Math.min(m.heal,t.maxHp-t.hp);t.hp+=healed;medkits.splice(i,1);burst(m.x,m.y,'#8affad',14);impactLights.push({x:m.x,y:m.y,life:.4,max:.4,r:52,color:'#74ff9a'});if(t.team==='player')say('Аптечка +'+Math.round(healed)+' ед. здоровья',1200);break}}}if(medkits.length<5&&Math.random()<dt*.09)spawnMedkit();for(let i=intelBoxes.length-1;i>=0;i--){const b=intelBoxes[i];b.life-=dt;b.pulse+=dt*3.5;if(b.life<=0){intelBoxes.splice(i,1);continue}for(const t of tanks){if(!t.alive||t.team==='enemy')continue;if(dist(t,b)<t.size+18){intelBoxes.splice(i,1);mapRevealUntil=Math.max(mapRevealUntil,gameClock+3);burst(b.x,b.y,'#65f4ff',24);impactLights.push({x:b.x,y:b.y,life:.6,max:.6,r:105,color:'#65f4ff'});shockwaves.push({x:b.x,y:b.y,r:4,speed:240,life:.42,max:.42,color:'#65f4ff'});if(t.team==='player')say('РАЗВЕДКА АКТИВНА · ВСЯ КАРТА ОТКРЫТА · 3 СЕК.',1600);break}}}if(intelBoxes.length<3&&Math.random()<dt*.012)spawnIntelBox();trackSoundTimer=Math.max(0,trackSoundTimer-dt);const p=player();if(!p||!p.alive)return;updateDrones(dt);updateInfantry(dt);updateTankMachineGuns(dt);for(const t of tanks){if(!t.alive)continue;t.shotLeft=Math.max(0,t.shotLeft-dt);const wasReloading=t.reloadLeft>0;t.reloadLeft=Math.max(0,t.reloadLeft-dt);t.flash=Math.max(0,t.flash-dt);t.recoil=Math.max(0,(t.recoil||0)-dt*2.8);t.hitFlash=Math.max(0,t.hitFlash-dt);if(wasReloading&&t.reloadLeft===0&&t.ammo<t.maxAmmo)t.ammo=t.maxAmmo;if(t.role==='support'&&t.team!=='enemy'){t.supportPulse=Math.max(0,(t.supportPulse||0)-dt);if(t.supportPulse<=0){let repairTarget=null,repairDistance=150;for(const ally of tanks){if(!ally.alive||ally.team==='enemy'||ally===t||ally.hp>=ally.maxHp)continue;const d=dist(t,ally);if(d<repairDistance){repairTarget=ally;repairDistance=d}}if(repairTarget){const healed=Math.min(12,repairTarget.maxHp-repairTarget.hp);repairTarget.hp+=healed;t.supportPulse=3.5;burst(repairTarget.x,repairTarget.y,'#76ffc2',9);impactLights.push({x:repairTarget.x,y:repairTarget.y,life:.45,max:.45,r:repairTarget.size*3,color:'#72ffc0'});if(t.team==='player')say('Полевой ремонт +'+Math.round(healed)+' ед. здоровья',850)}else t.supportPulse=.7}}if(t.team==='player'){let x=joystickVector.x,y=joystickVector.y;if(Math.hypot(x,y)<.08&&touchMoveTarget){const dx=touchMoveTarget.x-p.x,dy=touchMoveTarget.y-p.y,d=Math.hypot(dx,dy);if(d<18){touchMoveTarget=null}else{x=dx/(d||1);y=dy/(d||1)}}const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag}if(mag>.08){const desired=Math.atan2(y,x);p.a=rotateToward(p.a,desired,p.turn*dt);moveTank(p,Math.cos(p.a)*p.speed*dt*Math.min(1,mag),Math.sin(p.a)*p.speed*dt*Math.min(1,mag))}let tx=p.x+Math.cos(p.turret)*p.range,ty=p.y+Math.sin(p.turret)*p.range;if(autoAim&&!mouse.active){const target=aimTarget(p);if(target){tx=target.x;ty=target.y}else{const moveSpeed=Math.hypot(x,y);const fallbackAngle=moveSpeed>.08?Math.atan2(y,x):p.a;tx=p.x+Math.cos(fallbackAngle)*p.range;ty=p.y+Math.sin(fallbackAngle)*p.range}}if(mouse.active){const world=screenToWorld(mouse.x,mouse.y);tx=world.x;ty=world.y}if(Number.isFinite(tx)&&Number.isFinite(ty)&&(mouse.active||autoAim||input.fire)){p.turret=rotateToward(p.turret,Math.atan2(ty-p.y,tx-p.x),p.turn*1.6*dt)}if(mouse.down||input.fire){let target;if(autoAim&&!mouse.active){target=aimTarget(p);if(target){tx=target.x;ty=target.y}}fire(p,tx,ty)}if(p.reloadLeft<=0&&p.ammo<p.maxAmmo&&p.shotLeft<=0&&p.ammo===0)reload(p)}else updateAI(t,dt)}
for(const t of tanks){if(!t.alive)continue;const moved=Math.hypot(t.x-(t.lastTrackX??t.x),t.y-(t.lastTrackY??t.y));t.trackDistance=(t.trackDistance||0)+moved;t.lastTrackX=t.x;t.lastTrackY=t.y;if(t.trackDistance>16&&moved>.15){t.trackDistance=0;const sideOffset=t.size*.55,ca=Math.cos(t.a),sa=Math.sin(t.a);for(const side of [-1,1]){const x=t.x-ca*t.size*.15-sa*side*sideOffset,y=t.y-sa*t.size*.15+ca*side*sideOffset;trackMarks.push({x,y,a:t.a,life:12,max:12,w:t.size*.27,h:t.size*.72,alpha:.27,team:t.team})}if(t.team==='player'&&trackSoundTimer<=0){soundTreads(Math.min(1,moved/(t.speed*dt+1)));trackSoundTimer=.23}}}
for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.life-=dt;b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;let gone=b.life<=0||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h;for(const o of obstacles){if(!gone&&segmentIntersectsRect(b.px,b.py,b.x,b.y,o)){gone=true;const ix=clamp(b.x,o.x,o.x+o.w),iy=clamp(b.y,o.y,o.y+o.h);wallMarks.push({x:ix,y:iy,life:45,max:45,r:rand(2.2,4.8),angle:Math.atan2(b.vy,b.vx),color:Math.random()<.5?'#111714':'#3c4239'});impactLights.push({x:ix,y:iy,life:.13,max:.13,r:26,color:'#ffdb9a'});burst(ix,iy,'#e7e0c8',7);burst(ix,iy,'#ffb75d',4);soundImpact(false)}}if(!gone)for(const t of tanks){if(!t.alive||((t.team==='enemy')===(b.team==='enemy'))||t===b.owner)continue;if(segmentCircle(b.px,b.py,b.x,b.y,t.x,t.y,t.size*.8)){const vx=b.x-b.px,vy=b.y-b.py,ll=vx*vx+vy*vy||1,u=clamp(((t.x-b.px)*vx+(t.y-b.py)*vy)/ll,0,1),ix=b.px+vx*u,iy=b.py+vy*u;hit(t,b.damage*(b.crit?1.5:1),ix,iy,b.crit);gone=true;break}}if(gone)bullets.splice(i,1)}
for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;if(p.life<=0)particles.splice(i,1)}
for(let i=smokes.length-1;i>=0;i--){smokes[i].life-=dt;if(smokes[i].life<=0)smokes.splice(i,1)}
for(let i=wallMarks.length-1;i>=0;i--){wallMarks[i].life-=dt;if(wallMarks[i].life<=0)wallMarks.splice(i,1)}
for(let i=trackMarks.length-1;i>=0;i--){trackMarks[i].life-=dt;if(trackMarks[i].life<=0)trackMarks.splice(i,1)}
for(let i=muzzleFlashes.length-1;i>=0;i--){muzzleFlashes[i].life-=dt;if(muzzleFlashes[i].life<=0)muzzleFlashes.splice(i,1)}
for(let i=impactLights.length-1;i>=0;i--){impactLights[i].life-=dt;if(impactLights[i].life<=0)impactLights.splice(i,1)}
screenShake=Math.max(0,screenShake-dt*1.9);screenFlash=Math.max(0,screenFlash-dt*.85);
for(let i=tanks.length-1;i>=0;i--)if(!tanks[i].alive&&tanks[i].team!=='player')tanks.splice(i,1);
if(enemies().length===0&&!gameOver){wave++;spawnWave();for(const a of allies())a.hp=Math.min(a.maxHp,a.hp+12)}
ui.health.textContent=Math.max(0,Math.ceil(p.hp));ui.ammo.textContent=p.ammo+' / '+p.maxAmmo;ui.ammo.style.color=p.ammo===0?'var(--red)':p.ammo<=2?'var(--amber)':'var(--green)';ui.healthBar.style.width=(clamp(p.hp/p.maxHp,0,1)*100)+'%';ui.healthBar.style.background=p.hp<35?'var(--red)':'var(--green)';ui.smoke.querySelector('b').textContent='×'+p.smokeCharges;
if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.style.opacity='0'}
}
let camera={x:0,y:0};
function screenToWorld(x,y){return{x:x+camera.x,y:y+camera.y}}
function drawDrone(x,y,scale,color,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.fillStyle='#11191e';ctx.strokeStyle=color;ctx.lineWidth=1.8;for(const [dx,dy] of [[-9,-7],[9,-7],[-9,7],[9,7]]){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(dx,dy);ctx.stroke();ctx.beginPath();ctx.ellipse(dx,dy,5,2.3,0,0,TAU);ctx.fill();ctx.stroke()}ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-4,-4,8,8,2);ctx.fill();ctx.fillStyle='#e9faff';ctx.fillRect(-1,-1,2,2);ctx.restore()}
function drawTankModel(ctx,t,scale=1,rotation=0){
const s=(t.size||22)*scale,role=t.role||'player',base=t.hitFlash>0?'#fff':t.team==='player'?'#788b65':t.team==='ally'?'#668b91':({brawler:'#b64e45',scout:'#b4c65a',sniper:'#9182d5',assault:'#df754f',support:'#d0a4f4',heavy:'#b9a56b'}[role]||'#53dca3'),heavy=role==='heavy'||role==='brawler',scout=role==='scout',laser=role==='sniper',support=role==='support';
ctx.save();ctx.rotate(rotation);ctx.scale(scale,scale);

/* Proportions pass: long, low hull; paired side tracks; consistent bilateral geometry. */
const hw=heavy?2.34:scout?1.94:2.16,trackY=heavy?.47:scout?.405:.445,trackH=heavy?.31:scout?.255:.285;
const trackTop=-s*trackY-trackH*s*.5;
const trackBottom=s*trackY-trackH*s*.5;
/* Paired side tracks: continuous belts with visible end wheels and road wheels, not floating dots. */
for(const side of [-1,1]){
 const ty=side*s*trackY;
 ctx.fillStyle='#080f12';ctx.beginPath();ctx.roundRect(-s*hw*.5,ty-s*trackH*s*.5,s*hw,trackH*s,Math.max(1,s*.075));ctx.fill();
 ctx.fillStyle=heavy?'#505a51':'#394640';ctx.beginPath();ctx.roundRect(-s*hw*.5+s*.025,ty-trackH*s*.5+s*.025,s*hw-s*.05,trackH*s-s*.05,Math.max(1,s*.05));ctx.fill();
 ctx.strokeStyle='#aeb9ac99';ctx.lineWidth=Math.max(.55,s*.022);ctx.stroke();
 /* Individual steel shoes across the belt width. */
 for(let k=0;k<11;k++){
  const wx=-s*hw*.5+s*.075+k*(s*hw-.15*s)/10;
  ctx.fillStyle=k%2?'#202b2b':'#77847a';ctx.fillRect(wx,ty-trackH*s*.5+s*.025,s*.045,trackH*s-.05*s);
  ctx.strokeStyle='#c4cebd55';ctx.lineWidth=Math.max(.4,s*.012);ctx.beginPath();ctx.moveTo(wx+s*.012,ty-trackH*s*.43);ctx.lineTo(wx+s*.033,ty+trackH*s*.43);ctx.stroke();
 }
 /* Outer sprocket/idler and six recessed road wheels. */
 const wheelY=ty, wheelR=s*(heavy?.108:scout?.082:.096);
 for(let k=0;k<8;k++){
  const wx=-s*hw*.5+s*.13+k*(s*hw-s*.26)/7;
  const rr=(k===0||k===7)?wheelR*1.12:wheelR;
  ctx.fillStyle='#0b1215';ctx.beginPath();ctx.arc(wx,wheelY,rr*1.13,0,TAU);ctx.fill();
  ctx.fillStyle=(k===0||k===7)?'#68766b':'#879187';ctx.beginPath();ctx.arc(wx,wheelY,rr,0,TAU);ctx.fill();
  ctx.fillStyle='#293632';ctx.beginPath();ctx.arc(wx,wheelY,rr*.68,0,TAU);ctx.fill();
  ctx.fillStyle='#b9c4b5';ctx.beginPath();ctx.arc(wx-s*.012,wheelY-s*.014,rr*.23,0,TAU);ctx.fill();
  ctx.strokeStyle='#101719';ctx.lineWidth=Math.max(.5,s*.018);ctx.beginPath();ctx.arc(wx,wheelY,rr*.46,0,TAU);ctx.stroke();
 }
}
/* Animated cleats travel along the track belt according to accumulated movement. */
const treadPhase=((t.trackDistance||0)*.32)%(s*.34||1);
for(const side of [-1,1]){
 const ty=side*s*trackY;
 ctx.save();ctx.beginPath();ctx.roundRect(-s*hw*.5,ty-trackH*s*.5,s*hw,trackH*s,Math.max(1,s*.075));ctx.clip();
 for(let k=-1;k<13;k++){
  const tx=-s*hw*.5+k*s*hw/11+treadPhase;
  ctx.fillStyle=k%2?'#0c1416':'#a1aca0';ctx.fillRect(tx,ty-trackH*s*.5+s*.018,s*.025,trackH*s-.036*s);
 }
 ctx.restore();
}
/* Hull silhouette: broad shoulders, sloped glacis and tapered rear; all roles share the same tank-like base. */
const hullPath=()=>{
 ctx.beginPath();
 if(scout){
  ctx.moveTo(-s*.69,-s*.32);ctx.lineTo(s*.48,-s*.32);ctx.lineTo(s*.72,-s*.19);
  ctx.lineTo(s*.78,-s*.07);ctx.lineTo(s*.78,s*.17);ctx.lineTo(s*.61,s*.32);
  ctx.lineTo(-s*.57,s*.32);ctx.lineTo(-s*.76,s*.16);ctx.lineTo(-s*.76,-s*.13);ctx.closePath();
 }else{
  ctx.moveTo(-s*.78,-s*.35);ctx.lineTo(s*.52,-s*.35);ctx.lineTo(s*.72,-s*.27);
  ctx.lineTo(s*.86,-s*.12);ctx.lineTo(s*.86,s*.12);ctx.lineTo(s*.68,s*.29);
  ctx.lineTo(s*.52,s*.35);ctx.lineTo(-s*.67,s*.35);ctx.lineTo(-s*.84,s*.22);
  ctx.lineTo(-s*.88,s*.06);ctx.lineTo(-s*.88,-s*.15);ctx.closePath();
 }
};
/* Directional cast shadow follows the actual hull silhouette instead of a generic oval. */
ctx.save();ctx.translate(s*.27,s*.43);ctx.shadowColor='#020503b8';ctx.shadowBlur=Math.max(2,s*.22);ctx.fillStyle='#0205039c';hullPath();ctx.fill();ctx.fillRect(-s*.99,-s*.48,s*.2,s*.98);ctx.fillRect(s*.79,-s*.48,s*.2,s*.98);ctx.shadowBlur=0;ctx.save();ctx.rotate((t.turret||t.a||0)-(t.a||0));ctx.fillStyle='#0205039c';ctx.fillRect(s*.04,-s*.13,s*(heavy?1.03:.84),s*.26);ctx.beginPath();ctx.roundRect(-s*.36,-s*.29,s*.72,s*.58,4);ctx.fill();ctx.restore();ctx.translate(-s*.1,-s*.12);ctx.globalAlpha=.34;hullPath();ctx.fill();ctx.restore();
/* Pseudo-3D cast hull: dark lower sidewall, bevel lip and a lit upper plate. */
ctx.save();ctx.translate(0,s*.13);hullPath();
const sideMetal=ctx.createLinearGradient(-s*.8,0,s*.8,s*.3);
sideMetal.addColorStop(0,'#101719');sideMetal.addColorStop(.24,heavy?'#333e39':'#273630');sideMetal.addColorStop(.62,'#182421');sideMetal.addColorStop(1,'#090f12');
ctx.fillStyle=sideMetal;ctx.fill();ctx.strokeStyle='#080e10';ctx.lineWidth=Math.max(1,s*.055);ctx.stroke();ctx.restore();
hullPath();
const hullPaint=ctx.createLinearGradient(-s*.55,-s*.52,s*.55,s*.52);
hullPaint.addColorStop(0,heavy?'#a6a38b':scout?'#a6b77b':laser?'#9aa5ae':support?'#8eb1b1':'#9daf9f');
hullPaint.addColorStop(.18,base);hullPaint.addColorStop(.54,base);hullPaint.addColorStop(.82,heavy?'#4b574e':'#35443e');hullPaint.addColorStop(1,'#172326');
ctx.fillStyle=hullPaint;ctx.fill();ctx.strokeStyle='#d9e5e6b0';ctx.lineWidth=Math.max(.8,s*.035);ctx.stroke();
/* Raised armor shoulders and inset service panels break up the toy-like flat silhouette. */
ctx.save();ctx.beginPath();ctx.moveTo(-s*.62,-s*.34);ctx.lineTo(-s*.43,-s*.43);ctx.lineTo(-s*.19,-s*.4);ctx.lineTo(-s*.23,-s*.29);ctx.lineTo(-s*.54,-s*.27);ctx.closePath();
const shoulder=ctx.createLinearGradient(-s*.5,-s*.43,-s*.2,-s*.25);shoulder.addColorStop(0,'#dce4d35c');shoulder.addColorStop(1,'#0b14153a');ctx.fillStyle=shoulder;ctx.fill();ctx.strokeStyle='#e1ead04a';ctx.lineWidth=Math.max(.5,s*.018);ctx.stroke();
ctx.beginPath();ctx.moveTo(s*.28,-s*.34);ctx.lineTo(s*.54,-s*.3);ctx.lineTo(s*.68,-s*.16);ctx.lineTo(s*.58,-s*.08);ctx.lineTo(s*.3,-s*.17);ctx.closePath();ctx.fillStyle='#10191b55';ctx.fill();ctx.strokeStyle='#c5d2c04a';ctx.stroke();
ctx.beginPath();ctx.moveTo(-s*.55,s*.25);ctx.lineTo(-s*.3,s*.33);ctx.lineTo(-s*.1,s*.32);ctx.lineTo(-s*.12,s*.4);ctx.lineTo(-s*.43,s*.38);ctx.closePath();ctx.fillStyle='#10171950';ctx.fill();ctx.strokeStyle='#c4d0c044';ctx.stroke();ctx.restore();
const shade=ctx.createLinearGradient(-s, -s, s, s);shade.addColorStop(0,'#ffffff38');shade.addColorStop(.45,'#ffffff00');shade.addColorStop(1,'#0000004d');ctx.fillStyle=shade;ctx.fill();
ctx.save();ctx.strokeStyle='#dce8df55';ctx.lineWidth=Math.max(.65,s*.022);
ctx.beginPath();ctx.moveTo(-s*.59,-s*.28);ctx.lineTo(-s*.42,-s*.39);ctx.lineTo(-s*.19,-s*.38);ctx.moveTo(s*.2,-s*.38);ctx.lineTo(s*.47,-s*.35);ctx.lineTo(s*.61,-s*.2);ctx.moveTo(-s*.6,s*.24);ctx.lineTo(-s*.43,s*.38);ctx.lineTo(-s*.2,s*.39);ctx.moveTo(s*.2,s*.39);ctx.lineTo(s*.46,s*.36);ctx.lineTo(s*.62,s*.2);ctx.stroke();
ctx.fillStyle='#111b1d';ctx.beginPath();ctx.roundRect(-s*.18,-s*.29,s*.36,s*.16,2);ctx.fill();ctx.fillStyle=laser?'#68eaff':support?'#91eaff':scout?'#d6a8ff':'#b5d8c5';ctx.fillRect(-s*.11,-s*.26,s*.22,s*.045);
for(const [hx,hy] of [[-.51,-.12],[.51,-.12],[-.51,.12],[.51,.12]]){ctx.fillStyle='#182124';ctx.beginPath();ctx.arc(s*hx,s*hy,s*.055,0,TAU);ctx.fill();ctx.fillStyle='#91a49c';ctx.beginPath();ctx.arc(s*hx,s*hy,s*.025,0,TAU);ctx.fill()}
ctx.restore();
/* Layered steel deck with bevels, welds, hatch and realistic value breakup. */
ctx.fillStyle='#101719';ctx.fillRect(-s*.49,-s*.34,s*.98,s*.68);
const deck=ctx.createLinearGradient(-s*.42,-s*.32,s*.42,s*.32);
deck.addColorStop(0,heavy?'#8a8b79':scout?'#8e9b70':laser?'#7d8490':support?'#75949a':'#8a9b8b');
deck.addColorStop(.32,base);deck.addColorStop(.72,heavy?'#4c554e':'#3a4a43');deck.addColorStop(1,'#172226');
ctx.fillStyle=deck;ctx.beginPath();ctx.moveTo(-s*.42,-s*.29);ctx.lineTo(s*.35,-s*.29);ctx.lineTo(s*.47,-s*.16);ctx.lineTo(s*.47,s*.19);ctx.lineTo(s*.34,s*.3);ctx.lineTo(-s*.37,s*.3);ctx.lineTo(-s*.48,s*.16);ctx.closePath();ctx.fill();
ctx.strokeStyle='#d8e0cf8a';ctx.lineWidth=Math.max(.6,s*.025);ctx.stroke();
ctx.strokeStyle='#0c1518a8';ctx.lineWidth=Math.max(.7,s*.035);ctx.beginPath();ctx.moveTo(-s*.34,-s*.2);ctx.lineTo(s*.31,-s*.2);ctx.moveTo(-s*.35,s*.21);ctx.lineTo(s*.31,s*.21);ctx.stroke();
/* Raised center spine and non-emissive maintenance hatch. */
ctx.fillStyle='#172327';ctx.beginPath();ctx.roundRect(-s*.14,-s*.25,s*.28,s*.5,2);ctx.fill();
ctx.fillStyle='#66776e';ctx.beginPath();ctx.roundRect(-s*.105,-s*.21,s*.21,s*.42,2);ctx.fill();
ctx.strokeStyle='#c0c9b777';ctx.lineWidth=.7;ctx.strokeRect(-s*.085,-s*.17,s*.17,s*.34);
ctx.fillStyle='#1b2829';ctx.fillRect(-s*.045,-s*.125,s*.09,s*.25);
ctx.fillStyle='#b5c1b2';ctx.fillRect(-s*.02,-s*.09,s*.04,s*.18);
/* Bolted corner armor and recessed lifting points. */
for(const [bx,by] of [[-.38,-.23],[.38,-.23],[-.38,.23],[.38,.23]]){ctx.fillStyle='#182224';ctx.beginPath();ctx.arc(s*bx,s*by,s*.045,0,TAU);ctx.fill();ctx.fillStyle='#a6b1a2';ctx.beginPath();ctx.arc(s*bx,s*by,s*.022,0,TAU);ctx.fill();ctx.fillStyle='#34433e';ctx.fillRect(s*bx-s*.013,s*by-s*.006,s*.026,s*.012)}
/* Field-service details: recessed deck plates, weld beads, serial stencils and chipped edges. */
ctx.save();
ctx.strokeStyle='#0b1416b8';ctx.lineWidth=Math.max(.7,s*.026);
ctx.beginPath();ctx.moveTo(-s*.57,-s*.16);ctx.lineTo(-s*.45,-s*.25);ctx.lineTo(-s*.23,-s*.24);ctx.moveTo(s*.24,-s*.25);ctx.lineTo(s*.47,-s*.24);ctx.lineTo(s*.57,-s*.12);ctx.moveTo(-s*.55,s*.17);ctx.lineTo(-s*.43,s*.25);ctx.lineTo(-s*.22,s*.25);ctx.stroke();
ctx.strokeStyle='#d7e0cc65';ctx.lineWidth=Math.max(.55,s*.018);
ctx.beginPath();ctx.moveTo(-s*.57,-s*.16);ctx.lineTo(-s*.45,-s*.25);ctx.lineTo(-s*.23,-s*.24);ctx.moveTo(s*.24,-s*.25);ctx.lineTo(s*.47,-s*.24);ctx.moveTo(-s*.55,s*.17);ctx.lineTo(-s*.43,s*.25);ctx.stroke();
/* Low-profile access hatches and raised handles. */
for(const [hx,hy,hw,hh] of [[-.31,-.12,.16,.12],[.32,.13,.13,.1],[-.29,.18,.1,.065]]){
 ctx.fillStyle='#182326';ctx.beginPath();ctx.roundRect(s*hx-s*hw/2,s*hy-s*hh/2,s*hw,s*hh,Math.max(.5,s*.018));ctx.fill();
 ctx.strokeStyle='#aebdb077';ctx.lineWidth=Math.max(.45,s*.015);ctx.stroke();
 ctx.strokeStyle='#d9e0ce88';ctx.beginPath();ctx.moveTo(s*(hx-hw*.25),s*hy);ctx.lineTo(s*(hx+hw*.25),s*hy);ctx.stroke();
}
if(!scout){
 /* Modular side skirts with visible fasteners and abrasion on the lower lip. */
 for(const side of [-1,1]){
  const sy=side*s*.405;
  for(let panel=0;panel<3;panel++){
   const px=-s*.39+panel*s*.27;
   ctx.fillStyle=panel===1?'#25332f':'#1b2827';
   ctx.beginPath();ctx.moveTo(px,sy-s*.035);ctx.lineTo(px+s*.22,sy-s*.025);ctx.lineTo(px+s*.2,sy+s*.055);ctx.lineTo(px+s*.015,sy+s*.06);ctx.closePath();ctx.fill();
   ctx.strokeStyle='#a9b7a45b';ctx.lineWidth=Math.max(.45,s*.015);ctx.stroke();
   ctx.fillStyle='#a7b4a0';ctx.beginPath();ctx.arc(px+s*.04,sy+s*.012,s*.018,0,TAU);ctx.fill();
  }
 }
}
/* Matte chassis stencil; readable without competing with tactical HUD. */
ctx.fillStyle=heavy?'#e0c18b':scout?'#d5e4a0':laser?'#b7c3d0':support?'#b9e4d9':'#d7e1d3';
ctx.globalAlpha=.78;ctx.font='bold '+Math.max(3.8,s*.12)+'px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
ctx.fillText(heavy?'H-04':scout?'L-03':laser?'S-04':support?'R-05':'T-01',s*.39,-s*.305);
ctx.globalAlpha=1;
/* Fine paint chips concentrated on exposed leading edges. */
ctx.fillStyle='#dfe5d19a';
for(const [cx,cy] of [[-.62,-.32],[-.48,-.39],[.57,-.29],[.66,.19],[-.58,.26],[.42,.34]])ctx.fillRect(s*cx,s*cy,Math.max(.45,s*.025),Math.max(.4,s*.018));
ctx.fillStyle='#101716a8';ctx.fillRect(-s*.08,-s*.31,s*.16,s*.025);
ctx.restore();
/* Exhaust vents and grime staining differ by chassis class. */
ctx.fillStyle='#11191b';ctx.beginPath();ctx.roundRect(-s*.34,-s*.12,s*.13,s*.24,1);ctx.fill();
for(let vent=0;vent<3;vent++){ctx.strokeStyle='#89988a88';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(-s*.32,-s*.075+vent*s*.07);ctx.lineTo(-s*.23,-s*.075+vent*s*.07);ctx.stroke()}
ctx.fillStyle='#161d1b70';ctx.beginPath();ctx.ellipse(s*.29,0,s*.09,s*.2,.1,0,TAU);ctx.fill();

for(const [bx,by] of [[-.67,-.35],[.65,-.35],[-.67,.35],[.65,.35]]){ctx.fillStyle='#d7dfd0a0';ctx.beginPath();ctx.arc(s*bx,s*by,s*.04,0,TAU);ctx.fill()}
/* Rebuilt turret: a single readable armored assembly with a distinct mantlet and cannon. */
ctx.save();
ctx.rotate((Number.isFinite(t.turret)?t.turret:(t.a||0))-(t.a||0));
const turretW=heavy?1.16:scout?.78:laser?1.02:support?.96:.94;
const turretH=heavy?.82:scout?.62:laser?.68:support?.72:.68;
const turretX=heavy?.04:.02;
const turretTop=-s*turretH*.5,turretLeft=s*turretX-s*turretW*.5;
/* Turret's cast shadow separates it from the hull. */
ctx.save();ctx.translate(s*.055,s*.075);
ctx.fillStyle='#030809a8';ctx.beginPath();
ctx.moveTo(turretLeft+s*.13,turretTop+s*.06);
ctx.lineTo(turretLeft+s*turretW*.79,turretTop+s*.06);
ctx.lineTo(turretLeft+s*turretW,turretTop+s*turretH*.31);
ctx.lineTo(turretLeft+s*turretW*.91,turretTop+s*turretH*.82);
ctx.lineTo(turretLeft+s*turretW*.72,turretTop+s*turretH);
ctx.lineTo(turretLeft+s*.09,turretTop+s*turretH*.91);
ctx.lineTo(turretLeft,turretTop+s*turretH*.65);
ctx.lineTo(turretLeft+s*.025,turretTop+s*turretH*.25);
ctx.closePath();ctx.fill();ctx.restore();
/* Barrel sits beneath the mantlet so the connection reads as a real gun assembly. */
const barrelLen=s*(laser?1.32:heavy?1.15:scout?.91:support?.72:.99);
const barrelH=s*(heavy?.19:laser?.105:scout?.115:.14);
ctx.save();ctx.translate(s*(turretX+.13),0);
/* Barrel shadow and lower steel edge. */
ctx.fillStyle='#050b0d';ctx.beginPath();ctx.roundRect(0,-barrelH*.52,barrelLen+s*.08,barrelH*1.2,barrelH*.18);ctx.fill();
const barrelMetal=ctx.createLinearGradient(0,-barrelH*.5,0,barrelH*.5);
barrelMetal.addColorStop(0,'#d5dfd1');barrelMetal.addColorStop(.18,laser?'#8299a3':heavy?'#89968a':'#91a296');
barrelMetal.addColorStop(.48,'#45564f');barrelMetal.addColorStop(.78,'#273530');barrelMetal.addColorStop(1,'#10191c');
ctx.fillStyle=barrelMetal;ctx.beginPath();ctx.roundRect(0,-barrelH*.43,barrelLen,barrelH*.86,barrelH*.16);ctx.fill();
ctx.strokeStyle='#d7e1d477';ctx.lineWidth=Math.max(.45,s*.014);ctx.stroke();
/* Breech collar and muzzle brake are deliberately wider than the barrel. */
ctx.fillStyle='#182326';ctx.beginPath();ctx.roundRect(barrelLen*.17,-barrelH*.62,barrelH*.72,barrelH*1.24,barrelH*.12);ctx.fill();
ctx.fillStyle='#87978b';ctx.fillRect(barrelLen*.17,-barrelH*.47,barrelH*.25,barrelH*.94);
ctx.fillStyle='#11191b';ctx.beginPath();ctx.roundRect(barrelLen-s*.015,-barrelH*.65,s*(heavy?.17:.13),barrelH*1.3,barrelH*.12);ctx.fill();
ctx.strokeStyle='#a9b7a9';ctx.lineWidth=Math.max(.45,s*.014);ctx.stroke();
ctx.fillStyle='#03080a';ctx.beginPath();ctx.ellipse(barrelLen+s*(heavy?.065:.05),0,s*(heavy?.035:.027),barrelH*.34,0,0,TAU);ctx.fill();
ctx.strokeStyle='#c7d1c5';ctx.lineWidth=Math.max(.4,s*.012);ctx.beginPath();ctx.ellipse(barrelLen+s*(heavy?.065:.05),0,s*(heavy?.035:.027),barrelH*.34,0,0,TAU);ctx.stroke();
ctx.restore();
/* Low angular turret shell with sloped front cheeks and bevel-lit edges. */
const turretMetal=ctx.createLinearGradient(-s*.48,-s*.42,s*.48,s*.42);
turretMetal.addColorStop(0,heavy?'#c3b991':scout?'#b4c987':laser?'#b0c0c8':support?'#b2d1c8':'#b8c7b8');
turretMetal.addColorStop(.2,base);turretMetal.addColorStop(.52,heavy?'#667266':'#56675e');
turretMetal.addColorStop(.82,'#303e39');turretMetal.addColorStop(1,'#111a1d');
ctx.fillStyle='#11191c';ctx.beginPath();
ctx.moveTo(turretLeft+s*.12,turretTop+s*.02);
ctx.lineTo(turretLeft+s*turretW*.77,turretTop+s*.02);
ctx.lineTo(turretLeft+s*turretW,turretTop+s*turretH*.27);
ctx.lineTo(turretLeft+s*turretW*.91,turretTop+s*turretH*.78);
ctx.lineTo(turretLeft+s*turretW*.73,turretTop+s*turretH);
ctx.lineTo(turretLeft+s*.1,turretTop+s*turretH*.91);
ctx.lineTo(turretLeft,turretTop+s*turretH*.62);
ctx.lineTo(turretLeft+s*.025,turretTop+s*turretH*.25);
ctx.closePath();ctx.fill();
ctx.fillStyle=turretMetal;ctx.beginPath();
ctx.moveTo(turretLeft+s*.14,turretTop+s*.07);
ctx.lineTo(turretLeft+s*turretW*.75,turretTop+s*.07);
ctx.lineTo(turretLeft+s*turretW*.91,turretTop+s*turretH*.3);
ctx.lineTo(turretLeft+s*turretW*.83,turretTop+s*turretH*.72);
ctx.lineTo(turretLeft+s*turretW*.68,turretTop+s*turretH*.87);
ctx.lineTo(turretLeft+s*.14,turretTop+s*turretH*.8);
ctx.lineTo(turretLeft+s*.07,turretTop+s*turretH*.59);
ctx.lineTo(turretLeft+s*.08,turretTop+s*turretH*.27);
ctx.closePath();ctx.fill();
ctx.strokeStyle='#dbe5d69a';ctx.lineWidth=Math.max(.7,s*.026);ctx.stroke();
/* Armored gun mantlet: the cannon visibly emerges from this reinforced block. */
ctx.fillStyle='#131d20';ctx.beginPath();ctx.roundRect(s*(turretX+.23),-s*(heavy?.25:.2),s*(heavy?.32:.25),s*(heavy?.5:.4),s*.06);ctx.fill();
const mantlet=ctx.createLinearGradient(0,-s*.2,0,s*.2);
mantlet.addColorStop(0,'#b9c6b8');mantlet.addColorStop(.25,base);mantlet.addColorStop(.72,'#4b5c53');mantlet.addColorStop(1,'#172225');
ctx.fillStyle=mantlet;ctx.beginPath();ctx.roundRect(s*(turretX+.22),-s*(heavy?.22:.17),s*(heavy?.29:.22),s*(heavy?.44:.34),s*.05);ctx.fill();
ctx.strokeStyle='#dce6d4a0';ctx.lineWidth=Math.max(.55,s*.02);ctx.stroke();
/* Crew hatch and per-class optics: a few large readable forms, not scattered micro-detail. */
ctx.fillStyle='#11191c';ctx.beginPath();ctx.ellipse(s*(turretX-.12),0,s*(heavy?.17:.135),s*(heavy?.22:.17),-.18,0,TAU);ctx.fill();
ctx.fillStyle=heavy?'#849080':scout?'#8caa66':laser?'#71838d':support?'#789d96':'#7c9180';ctx.beginPath();ctx.ellipse(s*(turretX-.12),-s*.012,s*(heavy?.13:.1),s*(heavy?.16:.12),-.18,0,TAU);ctx.fill();
ctx.strokeStyle='#d1dccb';ctx.lineWidth=Math.max(.55,s*.018);ctx.stroke();
ctx.strokeStyle='#1a2627';ctx.lineWidth=Math.max(.65,s*.022);ctx.beginPath();ctx.moveTo(s*(turretX-.2),s*.015);ctx.lineTo(s*(turretX-.04),-s*.02);ctx.stroke();
if(scout||laser||support){
 const ox=s*(turretX-.23),oy=-s*turretH*.31;
 ctx.fillStyle='#101719';ctx.beginPath();ctx.roundRect(ox-s*.07,oy-s*.055,s*.14,s*.11,s*.025);ctx.fill();
 ctx.fillStyle=scout?'#b8ed83':laser?'#8eeeff':'#9ff3df';ctx.beginPath();ctx.arc(ox,oy,s*.045,0,TAU);ctx.fill();
 ctx.fillStyle='#e8f8f0';ctx.beginPath();ctx.arc(ox-s*.012,oy-s*.012,s*.014,0,TAU);ctx.fill();
}
if(heavy){for(const side of [-1,1]){ctx.fillStyle='#151e20';ctx.beginPath();ctx.roundRect(turretLeft+s*.22,side*s*.19,s*.13,s*.1,s*.02);ctx.fill();for(let tube=0;tube<3;tube++){ctx.fillStyle='#8d9b88';ctx.beginPath();ctx.arc(turretLeft+s*(.25+tube*.035),side*s*.24,s*.014,0,TAU);ctx.fill()}}}
if(support){ctx.fillStyle='#1b292b';ctx.beginPath();ctx.roundRect(turretLeft+s*.55,-s*.13,s*.13,s*.26,s*.025);ctx.fill();ctx.strokeStyle='#a6e6d8';ctx.lineWidth=Math.max(.5,s*.018);ctx.stroke()}
ctx.restore();
/* Independent remote weapon station: it traverses toward infantry without affecting cannon aim. */
ctx.save();ctx.rotate((Number.isFinite(t.mgAngle)?t.mgAngle:(t.turret||t.a||0))-(t.a||0));const mgScale=s;ctx.fillStyle='#101719';ctx.beginPath();ctx.roundRect(-mgScale*.13,-mgScale*.19,mgScale*.32,mgScale*.38,mgScale*.06);ctx.fill();ctx.strokeStyle='#b8c7b5';ctx.lineWidth=Math.max(.6,mgScale*.025);ctx.stroke();ctx.fillStyle='#4d5b53';ctx.beginPath();ctx.roundRect(mgScale*.02,-mgScale*.07,mgScale*.51,mgScale*.14,mgScale*.035);ctx.fill();ctx.fillStyle='#151e21';ctx.fillRect(mgScale*.35,-mgScale*.09,mgScale*.22,mgScale*.18);ctx.fillStyle='#a9b7a9';ctx.fillRect(mgScale*.42,-mgScale*.055,mgScale*.16,mgScale*.11);ctx.fillStyle='#11191b';ctx.fillRect(-mgScale*.06,-mgScale*.27,mgScale*.09,mgScale*.11);ctx.fillStyle='#d2dccc';ctx.fillRect(-mgScale*.045,-mgScale*.25,mgScale*.06,mgScale*.07);ctx.restore();
/* Antenna base, radio aerial, rear tow hooks and external stowage. */
ctx.fillStyle='#11191b';ctx.beginPath();ctx.arc(-s*.58,s*.31,s*.075,0,TAU);ctx.fill();ctx.strokeStyle='#d4ddce';ctx.lineWidth=Math.max(.45,s*.014);ctx.beginPath();ctx.moveTo(-s*.58,s*.31);ctx.lineTo(-s*.69,s*.68);ctx.stroke();ctx.fillStyle='#202b2a';ctx.beginPath();ctx.roundRect(s*.53,s*.27,s*.19,s*.12,1.5);ctx.fill();ctx.strokeStyle='#b5c1ad77';ctx.stroke();ctx.fillStyle='#b9c6b7';ctx.fillRect(s*.58,s*.3,s*.09,s*.018);ctx.strokeStyle='#c4cfbf';ctx.lineWidth=Math.max(.5,s*.018);ctx.beginPath();ctx.moveTo(-s*.61,s*.44);ctx.lineTo(-s*.78,s*.48);ctx.lineTo(-s*.78,s*.55);ctx.moveTo(s*.61,s*.44);ctx.lineTo(s*.78,s*.48);ctx.lineTo(s*.78,s*.55);ctx.stroke();
/* Model-specific field equipment: spare track links, intake grilles, optics and lamps.
   Kept inside the shared renderer so previews and battlefield vehicles stay identical. */
if(heavy){
  /* Bolt-on reactive armour cassettes across the turret cheeks. */
  for(const side of [-1,1])for(let k=0;k<2;k++){
    const ex=s*(side*.39),ey=s*(-.13+k*.25);
    ctx.fillStyle='#182321';ctx.beginPath();ctx.roundRect(ex-s*.075,ey-s*.07,s*.15,s*.14,Math.max(.8,s*.025));ctx.fill();
    ctx.fillStyle='#68766a';ctx.beginPath();ctx.moveTo(ex-s*.065,ey-s*.052);ctx.lineTo(ex+s*.055,ey-s*.045);ctx.lineTo(ex+s*.065,ey+s*.045);ctx.lineTo(ex-s*.055,ey+s*.05);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d4c59a77';ctx.lineWidth=Math.max(.45,s*.014);ctx.stroke();
    ctx.fillStyle='#b6c0aa';ctx.fillRect(ex-s*.045,ey-s*.01,s*.09,s*.018);
  }
}else if(scout){
  /* Recon sensor mast and twin low-light optics. */
  ctx.fillStyle='#111b20';ctx.beginPath();ctx.roundRect(-s*.49,-s*.18,s*.13,s*.25,1);ctx.fill();
  ctx.strokeStyle='#c4d0b9';ctx.lineWidth=Math.max(.5,s*.018);ctx.beginPath();ctx.moveTo(-s*.43,-s*.12);ctx.lineTo(-s*.5,-s*.42);ctx.stroke();
  ctx.fillStyle='#8fe9f4';ctx.beginPath();ctx.arc(-s*.5,-s*.43,s*.035,0,TAU);ctx.fill();
}else if(laser){
  /* Long-range optic hood and heat-resistant barrel support. */
  ctx.fillStyle='#15252b';ctx.beginPath();ctx.roundRect(-s*.4,-s*.42,s*.26,s*.12,1.5);ctx.fill();
  ctx.fillStyle='#7de8f5';ctx.fillRect(-s*.35,-s*.395,s*.14,s*.045);
  ctx.strokeStyle='#c2d2ce';ctx.lineWidth=Math.max(.55,s*.02);ctx.beginPath();ctx.moveTo(s*.56,-s*.09);ctx.lineTo(s*.76,-s*.09);ctx.moveTo(s*.56,s*.09);ctx.lineTo(s*.76,s*.09);ctx.stroke();
}else if(support){
  /* Support vehicle: protected equipment cases and status indicators. */
  for(let k=0;k<2;k++){const ey=-s*.19+k*s*.38;ctx.fillStyle='#182526';ctx.beginPath();ctx.roundRect(-s*.49,ey-s*.065,s*.2,s*.13,1.5);ctx.fill();ctx.strokeStyle='#9ddfd6';ctx.lineWidth=.6;ctx.stroke();ctx.fillStyle=k?'#d8bd69':'#7be5d0';ctx.fillRect(-s*.44,ey-s*.018,s*.1,s*.036)}
}
/* Visible cooling louvers and a small service stencil on the rear deck. */
ctx.fillStyle='#11191b';ctx.beginPath();ctx.roundRect(-s*.36,s*.29,s*.22,s*.09,1.5);ctx.fill();
for(let k=0;k<4;k++){ctx.strokeStyle='#9eab9d';ctx.lineWidth=Math.max(.45,s*.014);ctx.beginPath();ctx.moveTo(-s*.33+k*s*.045,s*.305);ctx.lineTo(-s*.33+k*s*.045,s*.365);ctx.stroke()}
ctx.fillStyle='#d6dfcc';ctx.globalAlpha=.7;ctx.font='bold '+Math.max(3.2,s*.075)+'px monospace';ctx.textAlign='center';ctx.fillText(heavy?'ARMOR':scout?'RECON':laser?'RANGE':support?'SUPPLY':'MT-01',s*.16,s*.385);ctx.globalAlpha=1;
/* Front lamps sit on the leading corners and catch the top-left light. */
for(const side of [-1,1]){
 const lx=s*.69,ly=side*s*.27;
 ctx.fillStyle='#11191b';ctx.beginPath();ctx.arc(lx,ly,s*.065,0,TAU);ctx.fill();
 ctx.fillStyle=side===-1?'#f2e8b2':'#b9d7d2';ctx.beginPath();ctx.arc(lx,ly,s*.041,0,TAU);ctx.fill();
 ctx.fillStyle='#ffffff';ctx.globalAlpha=.75;ctx.fillRect(lx-s*.018,ly-s*.027,s*.022,s*.022);ctx.globalAlpha=1;
}
/* Weld beads and tiny fasteners along the side skirt edge. */
if(!scout)for(const side of [-1,1])for(let k=0;k<5;k++){
 const fx=-s*.39+k*s*.19,fy=side*s*.44;
 ctx.fillStyle='#11191b';ctx.beginPath();ctx.arc(fx,fy,s*.021,0,TAU);ctx.fill();
 ctx.fillStyle='#c4cebd';ctx.beginPath();ctx.arc(fx-s*.006,fy-s*.006,s*.009,0,TAU);ctx.fill();
}
/* Second detailing pass: layered field-service hardware and breakup of broad paint areas.
   All marks are drawn in local hull coordinates, so they rotate with the vehicle. */
/* Subtle irregular camouflage plates, clipped to the hull silhouette. */
ctx.save();hullPath();ctx.clip();ctx.globalAlpha=.19;
ctx.fillStyle=heavy?'#202d27':scout?'#4a5a35':laser?'#293e48':support?'#334b4a':'#26382c';
ctx.beginPath();ctx.moveTo(-s*.8,-s*.28);ctx.lineTo(-s*.47,-s*.48);ctx.lineTo(-s*.25,-s*.38);ctx.lineTo(-s*.35,-s*.17);ctx.lineTo(-s*.66,-s*.08);ctx.closePath();ctx.fill();
ctx.beginPath();ctx.moveTo(s*.18,-s*.49);ctx.lineTo(s*.48,-s*.4);ctx.lineTo(s*.8,-s*.19);ctx.lineTo(s*.62,s*.02);ctx.lineTo(s*.38,-s*.12);ctx.closePath();ctx.fill();
ctx.beginPath();ctx.moveTo(-s*.47,s*.25);ctx.lineTo(-s*.16,s*.32);ctx.lineTo(s*.03,s*.48);ctx.lineTo(-s*.4,s*.46);ctx.closePath();ctx.fill();ctx.globalAlpha=1;ctx.restore();
/* Track end caps, guide teeth and small suspension access points. */
for(let side=-1;side<=1;side+=2){
 const ty=side*s*.47;
 ctx.fillStyle='#0b1215';ctx.beginPath();ctx.roundRect(-s*.67,ty-s*.045,s*1.32,s*.09,s*.025);ctx.fill();
 for(let k=0;k<7;k++){
  const px=-s*.58+k*s*.19;
  ctx.fillStyle=k%2?'#647169':'#283531';ctx.fillRect(px,ty-s*.028,s*.105,s*.055);
  ctx.fillStyle='#c0c9ba';ctx.beginPath();ctx.arc(px+s*.052,ty,s*.012,0,TAU);ctx.fill();
 }
 ctx.fillStyle='#131d20';ctx.beginPath();ctx.roundRect(-s*.44,ty-s*.09,s*.15,s*.18,s*.025);ctx.fill();
 ctx.strokeStyle='#829187';ctx.lineWidth=Math.max(.45,s*.015);ctx.stroke();
}
/* Raised crew hatches with hinges, handles and non-emissive glass blocks. */
for(let hatch=0;hatch<2;hatch++){
 const hx=s*(hatch?-.17:.18),hy=s*(hatch?-.13:.13),r=s*(hatch?.09:.105);
 ctx.fillStyle='#10191c';ctx.beginPath();ctx.ellipse(hx,hy,r*1.08,r*.82,-.28,0,TAU);ctx.fill();
 ctx.fillStyle=heavy?'#747d6b':scout?'#7d9264':laser?'#697b83':support?'#6e8c88':'#738574';
 ctx.beginPath();ctx.ellipse(hx,hy,r*.88,r*.63,-.28,0,TAU);ctx.fill();
 ctx.strokeStyle='#d1dccb';ctx.lineWidth=Math.max(.6,s*.02);ctx.stroke();
 ctx.strokeStyle='#172326';ctx.lineWidth=Math.max(.7,s*.025);ctx.beginPath();ctx.moveTo(hx-r*.4,hy);ctx.lineTo(hx+r*.4,hy);ctx.stroke();
 ctx.fillStyle='#d8e0cf';ctx.beginPath();ctx.arc(hx-r*.48,hy-r*.28,s*.018,0,TAU);ctx.fill();
 ctx.fillStyle='#202c2d';ctx.beginPath();ctx.roundRect(hx-r*.22,hy+r*.53,r*.44,s*.035,1);ctx.fill();
}
/* External fuel/tool canisters and tie-down straps. */
for(let side=-1;side<=1;side+=2){
 const bx=-s*.49,by=side*s*.22;
 ctx.fillStyle='#111a1d';ctx.beginPath();ctx.roundRect(bx-s*.07,by-s*.105,s*.14,s*.21,s*.045);ctx.fill();
 ctx.fillStyle=heavy?'#756a4d':support?'#627c73':'#58695a';ctx.beginPath();ctx.roundRect(bx-s*.052,by-s*.085,s*.104,s*.17,s*.035);ctx.fill();
 ctx.strokeStyle='#c3cbb5';ctx.lineWidth=Math.max(.45,s*.014);ctx.stroke();
 ctx.fillStyle='#1a2526';ctx.fillRect(bx-s*.057,by-s*.018,s*.114,s*.036);
 ctx.fillStyle='#d5ddca';ctx.fillRect(bx-s*.013,by-s*.012,s*.026,s*.024);
}
/* Tow cable is a dark braided loop with metallic attachment eyes. */
ctx.strokeStyle='#101719';ctx.lineWidth=Math.max(1,s*.045);ctx.beginPath();ctx.moveTo(-s*.68,s*.31);ctx.quadraticCurveTo(-s*.87,s*.42,-s*.75,s*.54);ctx.lineTo(-s*.55,s*.57);ctx.stroke();
ctx.strokeStyle='#a2afa1';ctx.lineWidth=Math.max(.45,s*.014);ctx.beginPath();ctx.moveTo(-s*.68,s*.31);ctx.quadraticCurveTo(-s*.87,s*.42,-s*.75,s*.54);ctx.lineTo(-s*.55,s*.57);ctx.stroke();
for(let eye=0;eye<2;eye++){const ex=eye?-s*.55:-s*.68,ey=eye?s*.57:s*.31;ctx.fillStyle='#101719';ctx.beginPath();ctx.arc(ex,ey,s*.045,0,TAU);ctx.fill();ctx.strokeStyle='#b9c4b5';ctx.lineWidth=Math.max(.5,s*.016);ctx.beginPath();ctx.arc(ex,ey,s*.025,0,TAU);ctx.stroke()}
/* Per-role silhouettes: smoke launchers, spare track, reconnaissance optics, or support kit. */
if(heavy||role==='brawler'){
 for(let side=-1;side<=1;side+=2){
  ctx.fillStyle='#141e21';ctx.beginPath();ctx.roundRect(s*.19,side*s*.28,s*.17,s*.105,s*.025);ctx.fill();
  for(let tube=0;tube<3;tube++){ctx.fillStyle='#68766a';ctx.beginPath();ctx.arc(s*(.22+tube*.045),side*s*.31,s*.022,0,TAU);ctx.fill()}
 }
}else if(scout){
 ctx.fillStyle='#10191c';ctx.beginPath();ctx.roundRect(-s*.23,-s*.39,s*.27,s*.13,s*.025);ctx.fill();
 ctx.fillStyle='#7ee6ef';ctx.beginPath();ctx.arc(-s*.12,-s*.325,s*.035,0,TAU);ctx.fill();
 ctx.fillStyle='#263b3e';ctx.fillRect(-s*.18,-s*.365,s*.1,s*.018);
}else if(laser){
 ctx.fillStyle='#111b20';ctx.beginPath();ctx.roundRect(-s*.1,-s*.4,s*.27,s*.12,s*.025);ctx.fill();
 ctx.strokeStyle='#8ddce9';ctx.lineWidth=Math.max(.5,s*.018);ctx.stroke();
 ctx.fillStyle='#a2eaf2';ctx.fillRect(-s*.055,-s*.37,s*.18,s*.035);
}else if(support){
 ctx.fillStyle='#152123';ctx.beginPath();ctx.roundRect(-s*.45,s*.12,s*.18,s*.17,s*.025);ctx.fill();
 ctx.strokeStyle='#8edbd1';ctx.lineWidth=Math.max(.5,s*.018);ctx.stroke();
 ctx.fillStyle='#7be3d1';ctx.fillRect(-s*.415,s*.17,s*.11,s*.025);
}
/* Small warning chevrons and serial plates, kept matte so they don't read as UI. */
ctx.fillStyle=heavy?'#d2b67a':scout?'#d2e49a':laser?'#8fdbe9':support?'#9ce0d2':'#c8d4bd';
ctx.globalAlpha=.8;
for(let mark=0;mark<2;mark++){const mx=s*(.43+mark*.065),my=-s*.27;ctx.beginPath();ctx.moveTo(mx-s*.02,my-s*.025);ctx.lineTo(mx+s*.02,my);ctx.lineTo(mx-s*.02,my+s*.025);ctx.closePath();ctx.fill()}
ctx.globalAlpha=1;
/* Paint chips and soot near the exhaust, deterministic per model. */
ctx.fillStyle='#10171588';ctx.beginPath();ctx.ellipse(-s*.34,s*.27,s*.12,s*.045,-.25,0,TAU);ctx.fill();
ctx.fillStyle='#d8dfcb55';ctx.fillRect(s*.39,-s*.07,s*.035,s*.14);
ctx.restore();
ctx.restore();
}
function renderTankPreviews(){if(document.hidden||ui.overlay.classList.contains('hidden'))return;const now=performance.now()*.00016;for(const cv of document.querySelectorAll('.tank-preview')){const c=cv.getContext('2d');if(!c)continue;const w=cv.width,h=cv.height,role=cv.dataset.previewTank,profile=tankProfiles[role]||tankProfiles.player;c.clearRect(0,0,w,h);const bg=c.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#16242b');bg.addColorStop(.52,'#0a1218');bg.addColorStop(1,'#182027');c.fillStyle=bg;c.fillRect(0,0,w,h);c.strokeStyle='#8cb3bf16';c.lineWidth=1;for(let x=0;x<w;x+=16){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}for(let y=0;y<h;y+=16){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}const glow=c.createRadialGradient(w*.5,h*.57,3,w*.5,h*.57,82);glow.addColorStop(0,role==='support'?'#74ffcc2b':'#7adfff20');glow.addColorStop(1,'#00000000');c.fillStyle=glow;c.fillRect(0,0,w,h);c.save();c.translate(w*.5,h*.53);c.scale(1.5,1.5);const preview={...profile,team:'player',role,x:0,y:0,a:0,turret:0,hitFlash:0};const turn=now+({player:0,heavy:.28,scout:.57,sniper:.84,support:1.12}[role]||0);c.rotate(turn);drawTankModel(c,preview,1,0);c.restore();c.fillStyle='#d6edf1';c.font='bold 8px monospace';c.fillText('MTBA / FIELD MODEL',8,h-7)}}
function drawTank(t){ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.a);
/* Combat readability pass r6: scale the shared model itself, not its hitbox. */
const visualScale=t.role==='heavy'||t.role==='brawler'?1.42:t.role==='scout'?1.28:t.role==='sniper'?1.36:1.38;
drawTankModel(ctx,t,visualScale,0);ctx.restore();}
let groundGrainPattern=null;
function getGroundGrainPattern(){
 if(groundGrainPattern)return groundGrainPattern;
 const tile=document.createElement('canvas');tile.width=tile.height=192;
 const g=tile.getContext('2d');if(!g)return null;
 g.fillStyle='#777';g.fillRect(0,0,192,192);
 let seed=0x5f3759df;
 const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967295};
 for(let i=0;i<1850;i++){
  const x=rnd()*192,y=rnd()*192,v=Math.floor(35+rnd()*175),a=.025+rnd()*.105;
  g.fillStyle='rgba('+v+','+v+','+v+','+a+')';g.fillRect(x,y,1+rnd()*2.5,1+rnd()*2.5);
 }
 for(let i=0;i<48;i++){
  const x=rnd()*192,y=rnd()*192,len=3+rnd()*15;
  g.strokeStyle='rgba(8,13,10,'+(.08+rnd()*.16)+')';g.lineWidth=.45+rnd()*.65;
  g.beginPath();g.moveTo(x,y);g.lineTo(x+len,y+(rnd()-.5)*2.5);g.stroke();
 }
 groundGrainPattern=ctx.createPattern(tile,'repeat');
 return groundGrainPattern;
}
let staticTerrainCanvas=null;
function bakeStaticTerrain(){const layer=document.createElement('canvas');layer.width=WORLD.w;layer.height=WORLD.h;const layerCtx=layer.getContext('2d');if(!layerCtx)return;const previous=ctx;ctx=layerCtx;try{drawTerrainZones();drawSurfaceDetail()}finally{ctx=previous}staticTerrainCanvas=layer}
function drawStaticTerrain(camera){if(!staticTerrainCanvas)return;const sx=clamp(camera.x,0,WORLD.w),sy=clamp(camera.y,0,WORLD.h),sw=Math.max(0,Math.min(vw,WORLD.w-sx)),sh=Math.max(0,Math.min(vh,WORLD.h-sy));if(sw>0&&sh>0)ctx.drawImage(staticTerrainCanvas,sx,sy,sw,sh,sx,sy,sw,sh)}
function drawTerrainZones(){
 /* Large-scale ground variation: concrete slabs, compacted dirt and damp patches. */
 for(let gy=90;gy<WORLD.h;gy+=270)for(let gx=80;gx<WORLD.w;gx+=310){
  const seed=(gx*31+gy*17)%997,kind=seed%5,x=gx+(seed%71)-28,y=gy+((seed*7)%61)-24;
  const w=110+(seed%120),h=54+((seed*3)%75);
  ctx.save();ctx.translate(x,y);ctx.rotate((seed%9-4)*.035);
  if(kind===0){
   const slab=ctx.createLinearGradient(0,-h/2,w,h/2);slab.addColorStop(0,'#68766a09');slab.addColorStop(.5,'#0b14100c');slab.addColorStop(1,'#a6ad8b08');
   ctx.fillStyle=slab;ctx.fillRect(0,0,w,h);
   ctx.strokeStyle='#b9c0a512';ctx.lineWidth=1;ctx.strokeRect(1,1,w-2,h-2);
   ctx.strokeStyle='#050b091f';ctx.beginPath();ctx.moveTo(w*.2,0);ctx.lineTo(w*.23,h*.42);ctx.lineTo(w*.38,h*.57);ctx.stroke();
  }else if(kind===1||kind===3){
   const g=ctx.createRadialGradient(w*.5,h*.5,2,w*.5,h*.5,Math.max(w,h)*.62);
   g.addColorStop(0,kind===1?'#080f0c26':'#b4a9850a');g.addColorStop(.55,'#18221b14');g.addColorStop(1,'#10181300');
   ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(w*.5,h*.5,w*.5,h*.5,(seed%7)*.1,0,TAU);ctx.fill();
   for(let i=0;i<9;i++){const px=(seed*i*13%97)/97*w,py=(seed*i*7%89)/89*h;ctx.fillStyle=i%2?'#b3ad8c18':'#080e0c25';ctx.beginPath();ctx.ellipse(px,py,2+i%4,1+i%3,(i*.7),0,TAU);ctx.fill()}
  }else{
   ctx.strokeStyle='#9fa88d16';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w*.12,h*.12);ctx.lineTo(w*.2,h*.23);ctx.lineTo(w*.18,h*.38);ctx.lineTo(w*.3,h*.46);ctx.moveTo(w*.7,h*.55);ctx.lineTo(w*.76,h*.63);ctx.lineTo(w*.73,h*.8);ctx.stroke();
  }
  ctx.restore();
 }
 /* Small rubble is clustered at obstacle corners rather than evenly tiled. */
 for(const o of obstacles){
  const seed=((o.x*7+o.y*11)|0)>>>0;
  for(let i=0;i<7;i++){
   const side=i%4,px=side===0?o.x-5-(i%3)*3:side===1?o.x+o.w+4+(i%3)*2:o.x+((seed+i*37)%(Math.max(1,o.w)));
   const py=side===2?o.y-4-(i%3)*3:side===3?o.y+o.h+4+(i%3)*2:o.y+((seed+i*19)%(Math.max(1,o.h)));
   const r=1.2+(i%3)*.7;ctx.fillStyle=i%2?'#a6a78a40':'#080e0c65';ctx.beginPath();ctx.moveTo(px-r,py+r*.4);ctx.lineTo(px-r*.35,py-r*.7);ctx.lineTo(px+r,py-r*.2);ctx.lineTo(px+r*.5,py+r*.7);ctx.closePath();ctx.fill();
  }
 }
}
function drawSurfaceDetail(){
/* Deterministic battlefield texture: painted road wear, dust, chips and small debris. */
for(let gy=35;gy<WORLD.h;gy+=112){for(let gx=27;gx<WORLD.w;gx+=123){
const q=Math.abs((gx*23+gy*19)%101),x=gx+q%31,y=gy+(q*3)%23,r=2+q%7;
if(q<34){ctx.fillStyle='#080e0b32';ctx.beginPath();ctx.ellipse(x,y,r*1.9,r*.78,q*.07,0,TAU);ctx.fill();ctx.strokeStyle='#a4aa8b25';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x-1,y-1,r*1.12,r*.45,q*.07,Math.PI*1.05,Math.PI*1.85);ctx.stroke()}
if(q>37&&q<57){ctx.strokeStyle='#c0c6ad22';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+3+(q%5),y+1+(q%3));ctx.lineTo(x+5+(q%4),y-2);ctx.stroke()}
if(q>67&&q<80){ctx.save();ctx.translate(x,y);ctx.rotate(q*.11);ctx.fillStyle='#141d1a66';ctx.fillRect(-3,-2,7,4);ctx.fillStyle='#9ba18b33';ctx.fillRect(-2,-2,3,1);ctx.restore()}
if(q>88){ctx.strokeStyle='#a7b09b1c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(gx+q%24,gy+q%17);ctx.lineTo(gx+q%24+7,gy+q%17+3);ctx.lineTo(gx+q%24+9,gy+q%17+1);ctx.stroke()}
}}
/* Faded lane markings at a believable interval; they no longer tile the entire terrain. */
ctx.save();ctx.setLineDash([27,34]);ctx.strokeStyle='#c6c6a510';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,WORLD.h*.5);ctx.lineTo(WORLD.w,WORLD.h*.5);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#111a1618';ctx.lineWidth=1;
for(let x=70;x<WORLD.w;x+=260){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD.h);ctx.stroke()}
ctx.restore();
 /* Cached procedural micro-grain adds concrete/soil variation without per-frame noise generation. */
 const grain=getGroundGrainPattern();
 if(grain){ctx.save();ctx.globalAlpha=.075;ctx.globalCompositeOperation='soft-light';ctx.fillStyle=grain;ctx.fillRect(0,0,WORLD.w,WORLD.h);ctx.restore()}
 /* Shallow impact pits and worn track-like scuffs, placed deterministically in world space. */
 for(let gy=74;gy<WORLD.h;gy+=270)for(let gx=61;gx<WORLD.w;gx+=285){
  const h=(gx*29+gy*43)%113,x=gx+h%47,y=gy+(h*7)%39;
  if(h<34){
   const r=2+h%5;ctx.fillStyle='#080e0b2b';ctx.beginPath();ctx.ellipse(x,y,r*1.9,r*.62,h*.13,0,TAU);ctx.fill();
   ctx.strokeStyle='#a8ad8d20';ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(x-1,y-1,r*1.25,r*.42,h*.13,Math.PI*1.1,Math.PI*1.9);ctx.stroke();
  }else if(h>83){
   ctx.save();ctx.translate(x,y);ctx.rotate(h*.04);ctx.strokeStyle='#0c14112e';ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(-1,-1);ctx.lineTo(2,1);ctx.lineTo(8,-1);ctx.stroke();
   ctx.strokeStyle='#b6b69a20';ctx.beginPath();ctx.moveTo(-3,2);ctx.lineTo(4,2);ctx.stroke();ctx.restore();
  }
 }
}
function drawDynamicLights(){for(const f of muzzleFlashes){const a=clamp(f.life/f.max,0,1);const r=f.r*3.4;const g=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,r);g.addColorStop(0,'#ffe8ad55');g.addColorStop(.3,'#ffb84b22');g.addColorStop(1,'#ff9c2b00');ctx.globalAlpha=a;ctx.fillStyle=g;ctx.beginPath();ctx.arc(f.x,f.y,r,0,TAU);ctx.fill()}for(const l of impactLights){const a=clamp(l.life/l.max,0,1);const g=ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,l.r*1.35);g.addColorStop(0,(l.color||'#ffb84b')+'55');g.addColorStop(.38,(l.color||'#ffb84b')+'20');g.addColorStop(1,'#00000000');ctx.globalAlpha=a*.75;ctx.fillStyle=g;ctx.beginPath();ctx.arc(l.x,l.y,l.r*1.35,0,TAU);ctx.fill()}ctx.globalAlpha=1}
function drawObstacle(o){
 const x=o.x,y=o.y,w=o.w,h=o.h,container=o.type==='container',horizontal=w>=h;
 ctx.save();ctx.shadowColor='#020403b8';ctx.shadowBlur=container?9:6;ctx.fillStyle='#020403a8';ctx.beginPath();ctx.roundRect(x+7,y+10,w,h,container?3:1);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=.52;ctx.fillStyle='#020403';ctx.beginPath();ctx.roundRect(x+3,y+4,w,h,container?3:1);ctx.fill();ctx.globalAlpha=1;
 const body=ctx.createLinearGradient(x,y,x+w,y+h);
 if(container){body.addColorStop(0,'#7d8d80');body.addColorStop(.1,'#586a60');body.addColorStop(.42,'#43554c');body.addColorStop(.78,'#303f38');body.addColorStop(1,'#19241f')}
 else{body.addColorStop(0,'#879087');body.addColorStop(.16,'#66716a');body.addColorStop(.52,'#4b5751');body.addColorStop(.86,'#39443f');body.addColorStop(1,'#222d28')}
 ctx.fillStyle=body;ctx.fillRect(x,y,w,h);
 ctx.strokeStyle=container?'#c0c9b777':'#b6bcb066';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,w-2,h-2);ctx.strokeStyle='#111b17';ctx.lineWidth=3;ctx.strokeRect(x+4,y+4,w-8,h-8);
 if(container){
  const span=horizontal?w:h,step=Math.max(10,Math.min(22,span/Math.max(5,Math.floor(span/17))));
  for(let p=9;p<span-5;p+=step){ctx.beginPath();if(horizontal){ctx.moveTo(x+p,y+7);ctx.lineTo(x+p,y+h-7)}else{ctx.moveTo(x+7,y+p);ctx.lineTo(x+w-7,y+p)}ctx.strokeStyle='#17231e';ctx.lineWidth=Math.max(1,step*.14);ctx.stroke();ctx.beginPath();if(horizontal){ctx.moveTo(x+p+2,y+8);ctx.lineTo(x+p+2,y+h-8)}else{ctx.moveTo(x+8,y+p+2);ctx.lineTo(x+w-8,y+p+2)}ctx.strokeStyle='#c2cbbd38';ctx.lineWidth=1;ctx.stroke()}
  const cap=Math.min(13,Math.min(w,h)*.18);ctx.fillStyle='#1b2923';if(horizontal){ctx.fillRect(x+4,y+4,cap,h-8);ctx.fillRect(x+w-cap-4,y+4,cap,h-8)}else{ctx.fillRect(x+4,y+4,w-8,cap);ctx.fillRect(x+4,y+h-cap-4,w-8,cap)}
  ctx.fillStyle='#9aa99b66';ctx.fillRect(x+5,y+5,2,h-10);ctx.fillRect(x+w-7,y+5,2,h-10);ctx.fillStyle='#202d27';ctx.fillRect(x+4,y+4,w-8,5);ctx.fillRect(x+4,y+h-9,w-8,5);
  ctx.fillStyle='#d2c9a51f';ctx.fillRect(x+w*.18,y+h*.22,Math.min(w*.16,24),2);ctx.fillRect(x+w*.18,y+h*.22+5,Math.min(w*.11,17),1);ctx.fillStyle='#9ca78a20';ctx.fillRect(x+w*.63,y+h*.68,Math.min(w*.12,20),2);
 }else{
  ctx.fillStyle='#202a25';ctx.fillRect(x+5,y+5,w-10,5);ctx.fillRect(x+5,y+h-10,w-10,5);ctx.strokeStyle='#26332d';ctx.lineWidth=1.5;
  if(horizontal){ctx.beginPath();ctx.moveTo(x+w*.34,y+7);ctx.lineTo(x+w*.34,y+h-7);ctx.moveTo(x+w*.68,y+7);ctx.lineTo(x+w*.68,y+h-7);ctx.stroke()}else{ctx.beginPath();ctx.moveTo(x+7,y+h*.33);ctx.lineTo(x+w-7,y+h*.33);ctx.moveTo(x+7,y+h*.67);ctx.lineTo(x+w-7,y+h*.67);ctx.stroke()}
  const seed=((x*13+y*7)|0)>>>0;for(let i=0;i<5;i++){const px=x+8+((seed+i*37)%(Math.max(1,w-16))),py=y+8+((seed+i*23)%(Math.max(1,h-16))),r=2+i%3;ctx.fillStyle='#161f1b55';ctx.beginPath();ctx.moveTo(px-r,py-r*.3);ctx.lineTo(px-r*.25,py-r);ctx.lineTo(px+r,py-r*.15);ctx.lineTo(px+r*.4,py+r*.7);ctx.closePath();ctx.fill()}
  ctx.strokeStyle='#aab5a42e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+w*.2,y+h*.12);ctx.lineTo(x+w*.23,y+h*.2);ctx.lineTo(x+w*.18,y+h*.28);ctx.stroke();
 }
 for(const [cx,cy] of [[x+6,y+6],[x+w-6,y+6],[x+6,y+h-6],[x+w-6,y+h-6]]){ctx.fillStyle='#17231e';ctx.beginPath();ctx.roundRect(cx-3,cy-3,6,6,1);ctx.fill();ctx.fillStyle='#c0c7b455';ctx.fillRect(cx-1,cy-1,2,2)}
 const sheen=ctx.createLinearGradient(x,y,x,y+h);sheen.addColorStop(0,'#d9e1d41a');sheen.addColorStop(.45,'#d9e1d400');sheen.addColorStop(1,'#03080635');ctx.fillStyle=sheen;ctx.fillRect(x+2,y+2,w-4,h-4);ctx.restore();
}
function drawObstacles(){for(const o of obstacles)drawObstacle(o)}
function drawTrackMarks(){for(const tr of trackMarks){ctx.save();ctx.translate(tr.x,tr.y);ctx.rotate(tr.a);ctx.globalAlpha=(tr.life/tr.max)*tr.alpha;ctx.fillStyle='#080d0b';ctx.fillRect(-tr.w/2,-tr.h/2,tr.w,tr.h);ctx.fillStyle='#526055';ctx.globalAlpha=(tr.life/tr.max)*.14;ctx.fillRect(-tr.w*.32,-tr.h*.4,tr.w*.64,tr.h*.8);ctx.restore()}ctx.globalAlpha=1}
function drawWallMarks(){for(const mark of wallMarks){ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(mark.angle);ctx.globalAlpha=Math.min(1,mark.life/4)*Math.min(1,mark.life/mark.max*4);ctx.fillStyle=mark.color;ctx.beginPath();ctx.ellipse(0,0,mark.r,mark.r*.56,0,0,TAU);ctx.fill();ctx.strokeStyle='#090e0c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-mark.r*.7,0);ctx.lineTo(mark.r*.7,0);ctx.stroke();ctx.restore()}ctx.globalAlpha=1}
function drawSmokeClouds(){const im=spriteAssets.smoke;for(const s of smokes){const life=clamp(s.life/s.max,0,1),pulse=.94+.06*Math.sin(s.life*3);ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.sin(s.life*.7)*.06);ctx.globalAlpha=(.15+.08*(1-life))*pulse;
 if(im)ctx.drawImage(im,-s.r*.98,-s.r*.67,s.r*1.96,s.r*1.34);
 const g=ctx.createRadialGradient(0,0,s.r*.08,0,0,s.r);g.addColorStop(0,'#bac5c044');g.addColorStop(.58,'#8d9c9a24');g.addColorStop(1,'#8d9c9a00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,s.r,0,TAU);ctx.fill();ctx.restore()}}
function drawProjectiles(){for(const b of bullets){ctx.save();const beamColor=b.weapon==='laser'?'#63eaff':b.weapon==='pulse'?'#bba1ff':b.team==='enemy'?'#ff6a61':'#ffe1a0',dx=b.x-b.px,dy=b.y-b.py,travel=Math.hypot(dx,dy)||1,tx=dx/travel,ty=dy/travel,tail=b.weapon==='laser'?27:b.weapon==='pulse'?19:15;ctx.lineCap='round';ctx.globalAlpha=.25;ctx.strokeStyle=beamColor;ctx.lineWidth=b.weapon==='laser'?9:6;ctx.shadowBlur=12;ctx.shadowColor=beamColor;ctx.beginPath();ctx.moveTo(b.x-tx*tail*1.5,b.y-ty*tail*1.5);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=.95;ctx.strokeStyle=beamColor;ctx.lineWidth=b.weapon==='laser'?3.6:b.weapon==='pulse'?3:2.5;ctx.shadowBlur=b.weapon==='laser'?19:12;ctx.beginPath();ctx.moveTo(b.x-tx*tail,b.y-ty*tail);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle='#fff8dc';ctx.shadowBlur=10;ctx.shadowColor=beamColor;ctx.beginPath();ctx.arc(b.x,b.y,b.weapon==='laser'?2.1:1.65,0,TAU);ctx.fill();ctx.restore()}}
function drawMuzzleFlashes(){for(const f of muzzleFlashes){const alpha=clamp(f.life/f.max,0,1);ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.a);ctx.globalAlpha=alpha;ctx.shadowBlur=18;ctx.shadowColor='#ffb957';ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.moveTo(-f.r*.15,0);ctx.lineTo(-f.r*.45,-f.r*.3);ctx.lineTo(f.r,0);ctx.lineTo(-f.r*.4,f.r*.27);ctx.closePath();ctx.fill();ctx.fillStyle=f.color||'#ff9b38';ctx.beginPath();ctx.ellipse(f.r*.15,0,f.r*.68,f.r*.27,0,0,TAU);ctx.fill();ctx.restore()}ctx.globalAlpha=1}
function drawImpactLights(){const blast=spriteAssets.explosion;for(const light of impactLights){const alpha=clamp(light.life/light.max,0,1),combat=light.color==='#fff27a'||light.color==='#ff654d'||light.color==='#ffcb72';if(blast&&combat&&light.life<.24){ctx.save();ctx.translate(light.x,light.y);ctx.rotate((light.x*13+light.y*7)%TAU);ctx.globalAlpha=alpha*.72;ctx.globalCompositeOperation='screen';ctx.drawImage(blast,-light.r*.62,-light.r*.62,light.r*1.24,light.r*1.24);ctx.restore()}const g=ctx.createRadialGradient(light.x,light.y,0,light.x,light.y,light.r);g.addColorStop(0,light.color);g.addColorStop(1,'#ffbb5500');ctx.globalAlpha=alpha*.62;ctx.fillStyle=g;ctx.beginPath();ctx.arc(light.x,light.y,light.r,0,TAU);ctx.fill()}ctx.globalAlpha=1}
function drawParticles(){for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill()}ctx.globalAlpha=1}
function draw(){const frameStart=performance.now();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#111713';ctx.fillRect(0,0,vw,vh);const p=player();if(p){camera.x=clamp(p.x-vw/2,0,WORLD.w-vw);camera.y=clamp(p.y-vh/2,0,WORLD.h-vh)}else{camera.x=0;camera.y=0}const shakeX=screenShake>0?rand(-screenShake,screenShake)*18:0,shakeY=screenShake>0?rand(-screenShake,screenShake)*18:0;ctx.save();ctx.translate(-camera.x+shakeX,-camera.y+shakeY);if(renderEngine)renderEngine.drawGround(ctx,camera,vw,vh);else{ctx.fillStyle='#202b25';ctx.fillRect(0,0,WORLD.w,WORLD.h)}
drawStaticTerrain(camera);drawGrassBase();drawBloodPools();drawTrees();drawMedkits();drawIntelBoxes();
drawObstacles();
drawCivilians();drawInfantry();drawTrackMarks();drawWallMarks();drawSmokeClouds();drawProjectiles();drawInfantryShots();drawTankMGTracers();
 const visionSources=[player(),...allies()].filter(Boolean);for(const t of tanks){if(!t.alive)continue;if(t.team==='enemy'&&gameClock>=mapRevealUntil&&!visionSources.some(friend=>canSpot(friend,t))&&!scoutDroneSpots(t))continue;drawTank(t)}
 drawGrassCanopy();drawBushCanopy();drawDrones();drawWrecks();drawDynamicLights();drawMuzzleFlashes();drawImpactLights();drawParticles();drawAtmosphere();ctx.restore();drawFog();drawRadar();ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.105;ctx.fillStyle='#d6e8c2';ctx.fillRect(0,0,vw,vh);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';const vignette=ctx.createRadialGradient(vw/2,vh/2,Math.min(vw,vh)*.2,vw/2,vh/2,Math.max(vw,vh)*.72);vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#02070658');ctx.fillStyle=vignette;ctx.fillRect(0,0,vw,vh);if(screenFlash>0){ctx.globalAlpha=Math.min(.23,screenFlash*1.15);ctx.fillStyle='#ff5545';ctx.fillRect(0,0,vw,vh)}ctx.restore();if(renderEngine)renderEngine.recordFrame(performance.now()-frameStart);if(paused&&running&&!gameOver){ctx.fillStyle='#06101970';ctx.fillRect(0,0,vw,vh);ctx.fillStyle='#eafcff';ctx.font='bold 24px monospace';ctx.textAlign='center';ctx.fillText('PAUSED',vw/2,vh/2);ctx.textAlign='start'}}
function drawFog(){if(gameClock<mapRevealUntil)return;if(!fogCtx||!fogCanvas)return;const p=player();if(!p)return;const w=fogCanvas.width,h=fogCanvas.height;fogCtx.setTransform(dpr,0,0,dpr,0,0);fogCtx.clearRect(0,0,vw,vh);fogCtx.fillStyle='rgba(18,29,35,.58)';fogCtx.fillRect(0,0,vw,vh);fogCtx.globalCompositeOperation='destination-out';const reveal=(x,y,r,soft=.28)=>{const sx=x-camera.x,sy=y-camera.y;if(sx<-r||sy<-r||sx>vw+r||sy>vh+r)return;const g=fogCtx.createRadialGradient(sx,sy,r*soft,sx,sy,r);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.64,'rgba(0,0,0,.88)');g.addColorStop(1,'rgba(0,0,0,0)');fogCtx.fillStyle=g;fogCtx.beginPath();fogCtx.arc(sx,sy,r,0,TAU);fogCtx.fill()};reveal(p.x,p.y,310,.42);const friendlyUnits=[p,...allies()].filter(Boolean);for(let i=1;i<friendlyUnits.length;i++){const a=friendlyUnits[i];reveal(a.x,a.y,215,.4)}for(const s of soldiers){if(s.faction==='alpha'&&s.alive)reveal(s.x,s.y,s.state==='fire'?145:105,.42)}for(const t of tanks){if(!t.alive||t.team!=='enemy')continue;let spotted=false;for(const friend of friendlyUnits){if(canSpot(friend,t)){spotted=true;break}}if(spotted||scoutDroneSpots(t))reveal(t.x,t.y,75,.65)}const scout=drones.find(d=>d.kind==='scout');if(scout)reveal(scout.x,scout.y,scout.reveal,.32);for(const smoke of smokes){const sx=smoke.x-camera.x,sy=smoke.y-camera.y;fogCtx.globalCompositeOperation='source-over';const g=fogCtx.createRadialGradient(sx,sy,smoke.r*.15,sx,sy,smoke.r*1.15);g.addColorStop(0,'rgba(5,10,15,.68)');g.addColorStop(1,'rgba(5,10,15,0)');fogCtx.fillStyle=g;fogCtx.beginPath();fogCtx.arc(sx,sy,smoke.r*1.15,0,TAU);fogCtx.fill();fogCtx.globalCompositeOperation='destination-out'}fogCtx.globalCompositeOperation='source-over';ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.drawImage(fogCanvas,0,0,canvas.width,canvas.height,0,0,vw,vh);ctx.restore()}
function drawRadar(){const size=Math.min(138,vw*.33,vh*.36),x=vw-size-12,y=12,sx=size/WORLD.w,sy=size/WORLD.h;ctx.save();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,TAU);ctx.clip();ctx.fillStyle='#071018dd';ctx.fillRect(x,y,size,size);const p=player(),friendlyUnits=[p,...allies()].filter(Boolean);for(const t of tanks){if(!t.alive)continue;if(t.team==='enemy'&&gameClock>=mapRevealUntil&&!friendlyUnits.some(a=>canSpot(a,t))&&!scoutDroneSpots(t))continue;ctx.fillStyle=t.team==='enemy'?'#ff5e65':t.team==='player'?'#73ffb0':'#61eaff';ctx.fillRect(x+t.x*sx-2,y+t.y*sy-2,4,4)}for(const s of soldiers){if(!s.alive)continue;if(s.faction==='bravo'&&gameClock>=mapRevealUntil&&!soldiers.some(a=>a.alive&&a.faction==='alpha'&&dist(a,s)<150))continue;ctx.fillStyle=s.faction==='alpha'?'#54dfff':'#ff555d';ctx.fillRect(x+s.x*sx-1.5,y+s.y*sy-1.5,3,3)}ctx.restore();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,TAU);ctx.strokeStyle='#78969f';ctx.lineWidth=2;ctx.stroke();if(gameClock<mapRevealUntil){ctx.fillStyle='#65f4ff';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText('РАЗВЕДКА '+Math.max(0,mapRevealUntil-gameClock).toFixed(1)+'с',x+size/2,y+size+12);ctx.textAlign='start'}}

/* Two-faction infantry layer: independent squad routes, suppression, cover, flanking and concealment. */
const INFANTRY_ROUTES={
 alpha:[{x:230,y:420},{x:390,y:500},{x:650,y:700},{x:810,y:850},{x:650,y:1040},{x:300,y:850}],
 bravo:[{x:1510,y:420},{x:1370,y:500},{x:1150,y:700},{x:990,y:850},{x:1150,y:1040},{x:1500,y:850}]
};
function spawnInfantry(){
 soldiers.length=0;infantryShots.length=0;bloodPools.length=0;
 for(const faction of ['alpha','bravo']){
  const route=INFANTRY_ROUTES[faction];
  for(let i=0;i<8;i++){
   const lane=i%4,rank=Math.floor(i/4),anchor=route[lane];
   let x=anchor.x+rand(-26,26)+(faction==='alpha'?-rank*22:rank*22),y=anchor.y+rand(-24,24);
   for(let tries=0;tries<24&&!clearSpot(x,y,11);tries++){x=anchor.x+rand(-42,42);y=anchor.y+rand(-42,42)}
   if(!clearSpot(x,y,10)){x=faction==='alpha'?100+rand(0,180):1520+rand(0,180);y=150+rand(0,150)}
   soldiers.push({id:++soldierId,faction,x,y,a:faction==='alpha'?0:Math.PI,hp:52,maxHp:52,speed:rand(42,52),range:rand(205,255),alive:true,state:'patrol',routeIndex:(lane+rank*2)%route.length,route,think:rand(.1,.8),shotTimer:rand(.2,1.4),phase:rand(0,TAU),coverSide:Math.random()<.5?-1:1,coverX:NaN,coverY:NaN,coverTimer:0,suppression:0,revealUntil:0,fireFlash:0,moveSpeed:0,seed:rand(0,1000),squad:rank});
  }
 }
}
function soldierHidden(s){return !!(s&&s.alive&&inGrass(s)&&gameClock>=s.revealUntil&&s.state!=='fire')}
function killSoldier(s,byFaction){if(!s||!s.alive)return;s.alive=false;s.deadAt=gameClock;const red=byFaction==='alpha'?'#8f2428':'#7e1e25';bloodPools.push({x:s.x,y:s.y,r:rand(5.5,8.5),life:52,max:52,angle:rand(0,TAU),color:red,seed:rand(0,1000)});if(bloodPools.length>36)bloodPools.shift();burst(s.x,s.y,byFaction==='alpha'?'#58dfff':'#ff6b61',10);burst(s.x,s.y,'#9d2b30',7);impactLights.push({x:s.x,y:s.y,life:.18,max:.18,r:20,color:'#b52b32'})}
function drawBloodPools(){for(const b of bloodPools){const fade=Math.min(1,b.life/7);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.globalAlpha=.56*fade;ctx.fillStyle='#170b0b';ctx.beginPath();ctx.ellipse(1.5,1.2,b.r*1.28,b.r*.8,0,0,TAU);ctx.fill();ctx.fillStyle=b.color;ctx.beginPath();ctx.ellipse(0,0,b.r,b.r*.64,0,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(-b.r*.78,-b.r*.5,b.r*.3,b.r*.19,-.45,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(b.r*.85,b.r*.2,b.r*.16,0,TAU);ctx.fill();ctx.restore()}ctx.globalAlpha=1}
function soldierCanSee(s,target){if(!s||!target||!target.alive)return false;if(soldierHidden(target)&&s.faction!==target.faction)return false;const d=dist(s,target);return d<=s.range*1.32&&lineOfSight(s,target)}
function infantryTargets(s){
 const list=[];
 for(const other of soldiers)if(other.alive&&other.faction!==s.faction&&!soldierHidden(other))list.push(other);
 for(const t of tanks){if(!t.alive)continue;const hostile=s.faction==='alpha'?t.team==='enemy':t.team!=='enemy';if(hostile)list.push(t)}
 return list;
}
function nearestInfantryThreat(s){let best=null,bd=Infinity;for(const target of soldiers){if(!target.alive||target.faction===s.faction||soldierHidden(target))continue;const d=dist(s,target);if(d<bd&&soldierCanSee(s,target)){best=target;bd=d}}if(best)return best;for(const target of tanks){if(!target.alive)continue;const hostile=s.faction==='alpha'?target.team==='enemy':target.team!=='enemy';if(!hostile)continue;const d=dist(s,target);if(d<bd&&soldierCanSee(s,target)){best=target;bd=d}}return best}
function infantryCover(s,threat){
 let best=null,score=Infinity;
 for(const o of obstacles){const cx=o.x+o.w*.5,cy=o.y+o.h*.5,angle=Math.atan2(cy-threat.y,cx-threat.x),offset=Math.max(o.w,o.h)*.5+13;
  for(const side of [-1,1]){const a=angle+side*.62,x=clamp(cx+Math.cos(a)*offset,16,WORLD.w-16),y=clamp(cy+Math.sin(a)*offset,16,WORLD.h-16);
   if(!clearSpot(x,y,8))continue;const p={x,y};if(lineOfSight(p,threat))continue;
   const value=dist(s,p)+dist(p,threat)*.035;if(value<score){score=value;best=p}
  }
 }
 return best;
}
function infantryMove(s,tx,ty,dt){
 let dx=tx-s.x,dy=ty-s.y,d=Math.hypot(dx,dy);if(d<4){s.moveSpeed=0;return}
 let vx=dx/d,vy=dy/d,avoidX=0,avoidY=0;
 for(const o of obstacles){const nx=clamp(s.x,o.x-13,o.x+o.w+13),ny=clamp(s.y,o.y-13,o.y+o.h+13),ox=s.x-nx,oy=s.y-ny,od=Math.hypot(ox,oy);if(od>0&&od<26){const k=(26-od)/26;avoidX+=ox/od*k*1.7;avoidY+=oy/od*k*1.7}}
 for(const other of soldiers){if(other===s||!other.alive)continue;const ox=s.x-other.x,oy=s.y-other.y,od=Math.hypot(ox,oy);if(od>0&&od<15){avoidX+=ox/od*.65;avoidY+=oy/od*.65}}
 vx+=avoidX;vy+=avoidY;const vl=Math.hypot(vx,vy)||1;vx/=vl;vy/=vl;
 const desired=Math.atan2(vy,vx)+Math.PI/2;s.a=Math.atan2(Math.sin(desired),Math.cos(desired));
 const step=Math.min(d,s.speed*dt),nx=clamp(s.x+vx*step,8,WORLD.w-8),ny=clamp(s.y+vy*step,8,WORLD.h-8);
 if(clearSpot(nx,ny,7)){s.x=nx;s.y=ny;s.moveSpeed=step/(dt||1)}else{s.routeIndex=(s.routeIndex+1)%s.route.length;s.coverSide*=-1;s.moveSpeed=0}
}
function fireInfantry(s,target){
 const angle=Math.atan2(target.y-s.y,target.x-s.x);s.a=angle+Math.PI/2;s.state='fire';s.revealUntil=gameClock+2.3;s.fireFlash=.12;
 const muzzle=7.5,sx=s.x+Math.cos(angle)*muzzle,sy=s.y+Math.sin(angle)*muzzle,speed=rand(315,355);
 infantryShots.push({x:sx,y:sy,px:sx,py:sy,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.9,damage:8+Math.random()*4,faction:s.faction,owner:s});
 impactLights.push({x:sx,y:sy,life:.09,max:.09,r:12,color:s.faction==='alpha'?'#62e4ff':'#ff655e'});burst(sx,sy,s.faction==='alpha'?'#62e4ff':'#ff655e',3);
}
function updateInfantry(dt){
 for(let i=soldiers.length-1;i>=0;i--)if(!soldiers[i].alive&&gameClock-(soldiers[i].deadAt||gameClock)>7)soldiers.splice(i,1);
 for(let i=bloodPools.length-1;i>=0;i--){bloodPools[i].life-=dt;if(bloodPools[i].life<=0)bloodPools.splice(i,1)}
 for(const s of soldiers){if(!s.alive)continue;s.phase+=dt*(s.moveSpeed>1?9:2);s.think-=dt;s.shotTimer-=dt;s.coverTimer=Math.max(0,s.coverTimer-dt);s.suppression=Math.max(0,s.suppression-dt*.6);s.fireFlash=Math.max(0,s.fireFlash-dt);
  const target=nearestInfantryThreat(s),distance=target?dist(s,target):Infinity,visible=target&&soldierCanSee(s,target);
  if(visible){s.lastSeenX=target.x;s.lastSeenY=target.y;s.lastSeenTimer=2.4}else s.lastSeenTimer=Math.max(0,(s.lastSeenTimer||0)-dt);
  if(visible&&distance<s.range){
   if((s.hp<s.maxHp*.72||s.suppression>1.1)&&s.coverTimer<=0){const cover=infantryCover(s,target);if(cover){s.coverX=cover.x;s.coverY=cover.y;s.coverTimer=rand(1.7,3.2);s.state='cover'}}
   if(s.coverTimer>0&&Number.isFinite(s.coverX)){infantryMove(s,s.coverX,s.coverY,dt);s.state='cover'}
   else if(distance<s.range*.52){const angle=Math.atan2(s.y-target.y,s.x-target.x);infantryMove(s,s.x+Math.cos(angle)*48,s.y+Math.sin(angle)*48,dt);s.state='retreat'}
   else if(distance>s.range*.78){const flank=Math.atan2(target.y-s.y,target.x-s.x)+s.coverSide*.8;infantryMove(s,target.x-Math.cos(flank)*s.range*.65,target.y-Math.sin(flank)*s.range*.65,dt);s.state='flank'}
   else{s.state='fire';s.moveSpeed=0}
   if(s.shotTimer<=0&&lineOfSight(s,target)){fireInfantry(s,target);s.shotTimer=rand(.48,.74)}
   continue;
  }
  if(s.lastSeenTimer>0&&Number.isFinite(s.lastSeenX)){s.state='search';if(Math.hypot(s.lastSeenX-s.x,s.lastSeenY-s.y)>24)infantryMove(s,s.lastSeenX,s.lastSeenY,dt);else s.lastSeenTimer=0;continue}
  if(s.coverTimer>0&&Number.isFinite(s.coverX)){s.state='cover';infantryMove(s,s.coverX,s.coverY,dt);continue}
  const waypoint=s.route[s.routeIndex];if(!waypoint){s.routeIndex=0;continue}
  s.state=inGrass(s)?'stealth':'patrol';if(Math.hypot(waypoint.x-s.x,waypoint.y-s.y)<20){s.routeIndex=(s.routeIndex+1)%s.route.length;s.think=rand(.2,.8);continue}
  if(s.think<=0){s.think=rand(.45,1.1);if(Math.random()<.16)s.coverSide*=-1}
  infantryMove(s,waypoint.x,waypoint.y,dt);
 }
 for(let i=infantryShots.length-1;i>=0;i--){const b=infantryShots[i];b.life-=dt;b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;let gone=b.life<=0||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h;
  for(const o of obstacles)if(!gone&&segmentIntersectsRect(b.px,b.py,b.x,b.y,o)){gone=true;break}
  if(!gone)for(const s of soldiers){if(!s.alive||s.faction===b.faction||s===b.owner)continue;if(segmentCircle(b.px,b.py,b.x,b.y,s.x,s.y,6)){s.hp-=b.damage;s.suppression=Math.min(2.5,s.suppression+.7);s.state='suppressed';s.revealUntil=gameClock+1.8;if(s.hp<=0){killSoldier(s,b.faction)}else{burst(s.x,s.y,b.faction==='alpha'?'#58dfff':'#ff6b61',4);burst(s.x,s.y,'#a52a30',3);impactLights.push({x:s.x,y:s.y,life:.12,max:.12,r:13,color:'#b52b32'})}gone=true;break}}
  if(!gone)for(const t of tanks){if(!t.alive||t===b.owner||((b.faction==='alpha')===(t.team!=='enemy')))continue;if(segmentCircle(b.px,b.py,b.x,b.y,t.x,t.y,t.size*.62)){hit(t,b.damage*.035,b.x,b.y,false);gone=true;break}}
  if(gone)infantryShots.splice(i,1);
 }
}
function drawSoldierShadow(s){
 ctx.save();ctx.translate(s.x+4.5,s.y+6.5+Math.sin(s.phase)*.45);ctx.rotate(s.a-Math.PI/2);ctx.shadowColor='#020403b8';ctx.shadowBlur=3.5;ctx.fillStyle='#0204038a';
 ctx.beginPath();ctx.ellipse(0,0,5.1,7.8,.08,0,TAU);ctx.fill();
 ctx.beginPath();ctx.moveTo(-3.2,-2);ctx.lineTo(-5,-5);ctx.lineTo(-1.8,-7.4);ctx.lineTo(2,-7.2);ctx.lineTo(5,-4);ctx.lineTo(3.4,1.8);ctx.lineTo(2.2,5.2);ctx.lineTo(-2.5,5.5);ctx.closePath();ctx.fill();ctx.restore();
}
function drawSoldier(s){
 if(!s.alive)return;
 const hidden=soldierHidden(s),alpha=hidden?.52:1,team=s.faction==='alpha',accent=team?'#56dcff':'#ff5a60',armor=team?'#526d76':'#77664a',dark=team?'#172a31':'#30281d',light=team?'#9fb7b7':'#b7a27b',stride=Math.sin(s.phase)*1.25;
 ctx.save();ctx.globalAlpha=alpha;drawSoldierShadow(s);ctx.translate(s.x,s.y+Math.sin(s.phase)*.35);ctx.rotate(s.a-Math.PI/2);ctx.scale(.92,.92);
 ctx.fillStyle='#111719';ctx.beginPath();ctx.ellipse(-2.1,3.6+stride,1.8,3.2,-.18,0,TAU);ctx.ellipse(2.1,3.6-stride,1.8,3.2,.18,0,TAU);ctx.fill();
 ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(-2.1,3.5+stride,1.15,2.5,0,0,TAU);ctx.ellipse(2.1,3.5-stride,1.15,2.5,0,0,TAU);ctx.fill();
 ctx.fillStyle='#101618';ctx.beginPath();ctx.roundRect(2.3,-8.8,1.25,8.5,.45);ctx.fill();ctx.fillStyle='#88938a';ctx.fillRect(2.45,-10.6,.75,4.5);ctx.fillStyle='#242b29';ctx.fillRect(2.15,-3.8,1.5,2.5);
 ctx.fillStyle=dark;ctx.beginPath();ctx.roundRect(-3.35,-3.8,6.7,7.1,1.8);ctx.fill();ctx.fillStyle=armor;ctx.beginPath();ctx.moveTo(-2.7,-4.2);ctx.lineTo(-2.3,-6.3);ctx.lineTo(1.8,-6.3);ctx.lineTo(2.7,-4.1);ctx.lineTo(2.3,1.7);ctx.lineTo(-2.3,1.7);ctx.closePath();ctx.fill();
 ctx.strokeStyle=light;ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(-1.8,-4.5);ctx.lineTo(-1.4,.9);ctx.moveTo(1.2,-4.5);ctx.lineTo(1.5,.8);ctx.stroke();
 ctx.fillStyle=team?'#1a4654':'#4b2524';ctx.fillRect(-2.65,-2.5,1.15,2.5);ctx.fillStyle=accent;ctx.fillRect(-2.65,-2.5,1.15,1.15);
 ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(0,-6.4,2.55,2.7,0,0,TAU);ctx.fill();ctx.fillStyle=armor;ctx.beginPath();ctx.ellipse(-.1,-6.8,2.15,2.25,0,0,TAU);ctx.fill();ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(-.6,-7.6,.85,.52,-.2,0,TAU);ctx.fill();
 ctx.fillStyle='#121b1e';ctx.fillRect(-1.6,-5.9,3.1,.9);ctx.fillStyle=accent;ctx.fillRect(-.65,-5.85,1.3,.55);
 ctx.strokeStyle=dark;ctx.lineWidth=2.25;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-2.5,-3.3);ctx.lineTo(-3.4,-1.1);ctx.lineTo(-1.1,-.2);ctx.moveTo(2.2,-3.1);ctx.lineTo(1.4,-1.3);ctx.lineTo(2.7,-.4);ctx.stroke();
 ctx.strokeStyle=light;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-2.5,-3.1);ctx.lineTo(-3.1,-1.3);ctx.moveTo(2.1,-2.9);ctx.lineTo(1.6,-1.4);ctx.stroke();
 ctx.restore();
 if(s.state==='fire'&&s.fireFlash>0){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a-Math.PI/2);ctx.globalAlpha=clamp(s.fireFlash/.09,0,1);ctx.shadowBlur=9;ctx.shadowColor='#ffb44b';ctx.fillStyle='#fff1b9';ctx.beginPath();ctx.moveTo(2.7,-9.2);ctx.lineTo(1.2,-13.8);ctx.lineTo(3.4,-12);ctx.lineTo(4.7,-14.5);ctx.lineTo(4.5,-9.6);ctx.closePath();ctx.fill();ctx.fillStyle='#ff9a43';ctx.beginPath();ctx.ellipse(3.2,-10.5,2.4,1.2,-.2,0,TAU);ctx.fill();ctx.restore()}
 if(!hidden&&s.hp<s.maxHp){ctx.fillStyle='#091014cc';ctx.fillRect(s.x-5,s.y-12,10,1.6);ctx.fillStyle=team?'#5fe4ff':'#ff6268';ctx.fillRect(s.x-5,s.y-12,10*clamp(s.hp/s.maxHp,0,1),1.6)}
}
function drawInfantry(){for(const s of soldiers){if(!s.alive)continue;if(s.faction==='bravo'&&gameClock>=mapRevealUntil&&!soldiers.some(a=>a.alive&&a.faction==='alpha'&&dist(a,s)<175)&&(!player()||dist(player(),s)>310))continue;drawSoldier(s)}}
function drawInfantryShots(){for(const b of infantryShots){const color=b.faction==='alpha'?'#62e4ff':'#ff655e';ctx.save();ctx.lineCap='round';ctx.globalAlpha=.24;ctx.strokeStyle=color;ctx.lineWidth=5;ctx.shadowBlur=9;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(b.px,b.py);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=.92;ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(b.px,b.py);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.fillStyle='#fff7d5';ctx.shadowBlur=7;ctx.beginPath();ctx.arc(b.x,b.y,1.6,0,TAU);ctx.fill();ctx.restore()}}
function drawTankMGTracers(){for(const b of mgTracers){const alpha=clamp(b.life/b.max,0,1),color=b.team==='enemy'?'#ff8a65':'#ffd58a';ctx.save();ctx.globalAlpha=alpha*.32;ctx.strokeStyle=color;ctx.lineWidth=3.2;ctx.shadowBlur=7;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.tx,b.ty);ctx.stroke();ctx.globalAlpha=alpha*.94;ctx.strokeStyle='#fff2c7';ctx.lineWidth=.85;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.tx,b.ty);ctx.stroke();ctx.restore()}}

function buildCivilians(){civilians.length=0;for(let i=0;i<22;i++){let x=rand(50,WORLD.w-50),y=rand(50,WORLD.h-50);for(let tries=0;tries<35&&!clearSpot(x,y,12);tries++){x=rand(50,WORLD.w-50);y=rand(50,WORLD.h-50)}if(clearSpot(x,y,12))civilians.push({x,y,a:rand(0,TAU),speed:rand(42,66),panic:rand(.5,2),turn:rand(-1,1),seed:rand(0,TAU),kind:i%11===0?'child':i%9===0?'elderly':i%7===0?'medic':'civilian',shirt:['#b7b9a5','#8babb1','#c9a27b','#b5a4b8','#d0d1c5','#9b6e5d','#b2a16c'][i%7],pants:['#3b4544','#424b58','#555047'][i%3],skin:['#c9a887','#ad8062','#e0b99b'][i%3],hair:['#40362b','#262b2c','#77705e'][i%3]})}}
function updateCivilians(dt){for(const c of civilians){c.panic=Math.max(0,c.panic-dt*.12);let threat=null,near=240;for(const t of tanks){if(!t.alive)continue;const d=dist(c,t);if(d<near){near=d;threat=t}}for(const b of bullets){const d=Math.hypot(c.x-b.x,c.y-b.y);if(d<95){c.panic=2.5;const a=Math.atan2(c.y-b.y,c.x-b.x);c.a=a;threat=null;break}}if(threat&&near<240){c.panic=2.2;c.a=Math.atan2(c.y-threat.y,c.x-threat.x)+c.turn*.25}else if(c.panic>0)c.a+=Math.sin(performance.now()*.004+c.seed)*dt*1.8;else c.a+=Math.sin(performance.now()*.001+c.seed)*dt*.25;const step=c.speed*(c.panic>0?1.65:1)*dt, nx=clamp(c.x+Math.cos(c.a)*step,16,WORLD.w-16),ny=clamp(c.y+Math.sin(c.a)*step,16,WORLD.h-16);let blocked=false;for(const o of obstacles){if(nx>o.x-12&&nx<o.x+o.w+12&&ny>o.y-12&&ny<o.y+o.h+12){blocked=true;break}}if(blocked){c.a+=Math.PI*(.45+Math.random()*.25);c.panic=Math.max(c.panic,1.2)}else{c.x=nx;c.y=ny}}}
function drawMedkits(){for(const m of medkits){const pulse=1+Math.sin(m.pulse)*.045;ctx.save();ctx.translate(m.x,m.y);ctx.scale(pulse,pulse);
 const glow=ctx.createRadialGradient(0,0,3,0,0,30);glow.addColorStop(0,'#70ff9a30');glow.addColorStop(1,'#70ff9a00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,30,0,TAU);ctx.fill();
 ctx.fillStyle='#02080575';ctx.beginPath();ctx.ellipse(2,7,15,10,.1,0,TAU);ctx.fill();
 ctx.fillStyle='#15251d';ctx.beginPath();ctx.roundRect(-12,-11,24,22,3);ctx.fill();
 const caseGrad=ctx.createLinearGradient(-10,-10,10,11);caseGrad.addColorStop(0,'#a4e7b0');caseGrad.addColorStop(.22,'#54b96e');caseGrad.addColorStop(.75,'#287446');caseGrad.addColorStop(1,'#153d2a');ctx.fillStyle=caseGrad;ctx.beginPath();ctx.roundRect(-10,-10,20,19,2);ctx.fill();
 ctx.strokeStyle='#c6f5cc';ctx.lineWidth=1;ctx.strokeRect(-9,-9,18,17);
 ctx.fillStyle='#1b5533';ctx.fillRect(-8,-3,16,7);ctx.fillStyle='#effff0';ctx.fillRect(-2,-7,4,15);ctx.fillRect(-6,-2,12,4);
 ctx.fillStyle='#d8ffe0';ctx.fillRect(-7,-8,14,1);ctx.fillStyle='#163e29';ctx.fillRect(-3,8,6,2);
 ctx.restore()}}
function drawIntelBoxes(){for(const b of intelBoxes){const pulse=1+Math.sin(b.pulse)*.05;ctx.save();ctx.translate(b.x,b.y);ctx.scale(pulse,pulse);
 const glow=ctx.createRadialGradient(0,0,2,0,0,32);glow.addColorStop(0,'#65f4ff36');glow.addColorStop(1,'#65f4ff00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,32,0,TAU);ctx.fill();
 ctx.fillStyle='#02070b80';ctx.beginPath();ctx.ellipse(2,8,16,10,.12,0,TAU);ctx.fill();
 ctx.fillStyle='#101a20';ctx.beginPath();ctx.roundRect(-13,-12,26,24,3);ctx.fill();
 const crate=ctx.createLinearGradient(-12,-12,12,12);crate.addColorStop(0,'#9ac2c2');crate.addColorStop(.18,'#4d8e91');crate.addColorStop(.62,'#286269');crate.addColorStop(1,'#122f37');ctx.fillStyle=crate;ctx.beginPath();ctx.roundRect(-11,-11,22,21,2);ctx.fill();
 ctx.strokeStyle='#a9faff';ctx.lineWidth=1;ctx.strokeRect(-9,-9,18,17);
 ctx.fillStyle='#142e35';ctx.fillRect(-7,-7,14,13);ctx.strokeStyle='#6bdde4';ctx.lineWidth=1;ctx.strokeRect(-6,-6,12,11);
 ctx.fillStyle='#c8ffff';ctx.fillRect(-2,-5,4,9);ctx.fillRect(-5,-2,10,3);
 ctx.fillStyle='#c5a56c';ctx.fillRect(-12,-10,3,4);ctx.fillRect(9,6,3,4);
 ctx.restore()}}
function drawDrones(){for(const d of drones){const scout=d.kind==='scout',color=scout?'#66f5ff':'#78ffc7',pulse=1+Math.sin(d.phase*3)*.12;ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.phase*.5);ctx.globalAlpha=.22;ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,scout?22:19,0,TAU);ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-9,-6);ctx.lineTo(9,6);ctx.moveTo(-9,6);ctx.lineTo(9,-6);ctx.stroke();ctx.fillStyle='#0b1720';ctx.beginPath();ctx.roundRect(-7,-5,14,10,3);ctx.fill();ctx.strokeStyle=color;ctx.strokeRect(-7,-5,14,10);ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,3.5*pulse,0,TAU);ctx.fill();if(scout){ctx.globalAlpha=.35;ctx.strokeStyle=color;ctx.beginPath();ctx.arc(0,0,d.reveal,0,TAU);ctx.stroke()}else{ctx.strokeStyle=color;ctx.beginPath();ctx.arc(0,0,10*pulse,0,TAU);ctx.stroke()}ctx.restore()}}
function renderGrassBase(){for(const g of grassPatches){ctx.save();
 const edge=ctx.createRadialGradient(g.x+g.w*.5,g.y+g.h*.5,Math.min(g.w,g.h)*.12,g.x+g.w*.5,g.y+g.h*.5,Math.max(g.w,g.h)*.68);
 edge.addColorStop(0,'#334c2c');edge.addColorStop(.58,'#2c4328d9');edge.addColorStop(.86,'#273c25a8');edge.addColorStop(1,'#273c2500');
 ctx.fillStyle=edge;ctx.beginPath();ctx.ellipse(g.x+g.w*.5,g.y+g.h*.5,g.w*.53,g.h*.54,(g.seed%9)*.025,0,TAU);ctx.fill();
 /* Broken, irregular ground cover edge; avoid the visible rounded-rectangle stamp. */
 for(let i=0;i<7;i++){const n=(g.seed+i*137)%997,x=g.x+8+n%(Math.max(1,g.w-16)),y=g.y+7+(n*11)%(Math.max(1,g.h-14)),r=5+n%12;ctx.fillStyle=i%2?'#3b542d55':'#1c332344';ctx.beginPath();ctx.ellipse(x,y,r*1.35,r*.62,(n%17)*.1,0,TAU);ctx.fill()}
 for(let i=0;i<Math.floor(g.w*g.h/150);i++){const n=(i*37+g.seed)%997,x=g.x+5+n%(Math.max(1,g.w-10)),y=g.y+5+(n*13)%(Math.max(1,g.h-10)),lean=((n%9)-4)*.8;ctx.strokeStyle=['#4d713c','#63854a','#789353','#385b31'][n%4];ctx.globalAlpha=.48+(n%4)*.1;ctx.lineWidth=1.1+(n%3)*.25;ctx.beginPath();ctx.moveTo(x,y+3);ctx.quadraticCurveTo(x+lean*.5,y,x+lean,y-3-(n%4));ctx.stroke()}
 ctx.globalAlpha=1;ctx.restore()}}
let grassBaseCache=null,grassCanopyCache=null;
function rebuildGrassCaches(){const old=ctx,scale=.5;grassBaseCache=document.createElement('canvas');grassBaseCache.width=Math.round(WORLD.w*scale);grassBaseCache.height=Math.round(WORLD.h*scale);ctx=grassBaseCache.getContext('2d');ctx.scale(scale,scale);renderGrassBase();grassCanopyCache=document.createElement('canvas');grassCanopyCache.width=Math.round(WORLD.w*scale);grassCanopyCache.height=Math.round(WORLD.h*scale);ctx=grassCanopyCache.getContext('2d');ctx.scale(scale,scale);renderGrassCanopy();ctx=old}
function drawGrassBase(){if(grassBaseCache)ctx.drawImage(grassBaseCache,0,0,WORLD.w,WORLD.h);else renderGrassBase()}
function drawGrassCanopy(){if(grassCanopyCache)ctx.drawImage(grassCanopyCache,0,0,WORLD.w,WORLD.h);else renderGrassCanopy()}
const bushShadowCache=new WeakMap();function bushShadowSprite(im){let shadow=bushShadowCache.get(im);if(shadow)return shadow;shadow=document.createElement('canvas');shadow.width=im.naturalWidth||im.width;shadow.height=im.naturalHeight||im.height;const c=shadow.getContext('2d');c.drawImage(im,0,0,shadow.width,shadow.height);c.globalCompositeOperation='source-in';c.fillStyle='#020503';c.fillRect(0,0,shadow.width,shadow.height);bushShadowCache.set(im,shadow);return shadow}function drawBushCanopy(){const im=spriteAssets.bush;if(!im)return;const shadow=bushShadowSprite(im);for(const g of grassPatches){const count=Math.max(2,Math.min(4,Math.floor(g.w/48)));for(let i=0;i<count;i++){const seed=(g.seed+i*173+31)%997;const x=g.x+8+(seed%(Math.max(1,g.w-16))),y=g.y+g.h*.25+((seed*7)%(Math.max(1,g.h*.65)));const size=17+(seed%9);ctx.save();ctx.globalAlpha=.3;ctx.drawImage(shadow,x-size*.5+4,y-size*.35+5,size,size*.7);ctx.restore();ctx.save();ctx.globalAlpha=.68+(seed%3)*.08;ctx.drawImage(im,x-size*.5,y-size*.35,size,size*.7);ctx.restore()}}}
function renderGrassCanopy(){for(const g of grassPatches){ctx.save();ctx.globalAlpha=.9;for(let i=0;i<Math.floor(g.w/5);i++){const n=(i*53+g.seed)%997,x=g.x+4+(n%(Math.max(1,g.w-8))),y=g.y+g.h*.18+((n*7)%(Math.max(1,g.h*.75))),lean=((n%7)-3)*1.2;ctx.strokeStyle=['#789b4e','#50783b','#94a85b','#365d32'][n%4];ctx.lineWidth=2.1;ctx.beginPath();ctx.moveTo(x,y+5);ctx.quadraticCurveTo(x+lean-2,y-1,x+lean,y-7-(n%5));ctx.stroke()}ctx.restore()}}
const treeShadowCache=new WeakMap();
function treeShadowSprite(im){let shadow=treeShadowCache.get(im);if(shadow)return shadow;const width=im.naturalWidth||im.width,height=im.naturalHeight||im.height;if(!width||!height)return im;shadow=document.createElement('canvas');shadow.width=width;shadow.height=height;const c=shadow.getContext('2d');c.drawImage(im,0,0,width,height);c.globalCompositeOperation='source-in';c.fillStyle='#020503';c.fillRect(0,0,width,height);treeShadowCache.set(im,shadow);return shadow}
function drawTrees(){for(const t of trees){ctx.save();ctx.translate(t.x,t.y);const im=t.tone===3?spriteAssets.treeAutumn:spriteAssets.treeConifer,size=t.r*3.0,canopy=t.r*1.35;
 if(im){/* Reuse a cached alpha silhouette so the cast shadow matches the canopy without filtering the sprite every frame. */const silhouette=treeShadowSprite(im);ctx.save();ctx.globalAlpha=.42;ctx.shadowColor='#020503';ctx.shadowBlur=canopy*.18;ctx.drawImage(silhouette,canopy*.28-size*.5,canopy*.46-size*.78+canopy*.08,size,size);ctx.restore();ctx.globalAlpha=1;ctx.drawImage(im,-size*.5,-size*.78,size,size)}
 else{ctx.save();ctx.translate(canopy*.28,canopy*.46);ctx.shadowColor='#020503a8';ctx.shadowBlur=canopy*.18;ctx.fillStyle='#0205038c';ctx.beginPath();ctx.moveTo(0,-canopy*.98);ctx.lineTo(canopy*.56,-canopy*.2);ctx.lineTo(canopy*.35,-canopy*.18);ctx.lineTo(canopy*.83,canopy*.42);ctx.lineTo(canopy*.31,canopy*.34);ctx.lineTo(canopy*.57,canopy*.85);ctx.lineTo(-canopy*.58,canopy*.85);ctx.lineTo(-canopy*.31,canopy*.34);ctx.lineTo(-canopy*.82,canopy*.42);ctx.lineTo(-canopy*.35,-canopy*.18);ctx.lineTo(-canopy*.56,-canopy*.2);ctx.closePath();ctx.fill();ctx.restore();ctx.fillStyle='#473e30';ctx.fillRect(-t.r*.1,-1,t.r*.2,t.r*.92);ctx.fillStyle='#685b42';ctx.fillRect(-t.r*.035,0,t.r*.07,t.r*.72);const colors=['#263e2d','#304b32','#3b5035','#344638'];ctx.fillStyle=colors[t.tone];ctx.beginPath();ctx.arc(0,-t.r*.38,t.r*1.12,0,TAU);ctx.fill();ctx.fillStyle='#52654a';ctx.globalAlpha=.86;ctx.beginPath();ctx.arc(-t.r*.3,-t.r*.65,t.r*.52,0,TAU);ctx.fill();ctx.fillStyle='#1b3024';ctx.beginPath();ctx.arc(t.r*.34,-t.r*.22,t.r*.58,0,TAU);ctx.fill();ctx.globalAlpha=.25;ctx.strokeStyle='#a2ae7b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(-t.r*.16,-t.r*.52,t.r*.76,Math.PI*1.08,Math.PI*1.75);ctx.stroke()}
 ctx.globalAlpha=1;ctx.restore()}}
function drawCivilians(){const now=performance.now()*.012;for(const c of civilians){ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a);ctx.save();ctx.translate(3.5,5.5);ctx.shadowColor='#020403a8';ctx.shadowBlur=2.5;ctx.fillStyle='#0204038c';ctx.beginPath();ctx.ellipse(0,0,4.8,7.2,0,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(0,-5.4,2.5,2.6,0,0,TAU);ctx.fill();ctx.restore();const scale=c.kind==='child'?.78:c.kind==='elderly'?.92:1;const stride=Math.sin(now+c.seed)*(c.panic>0?3.1:1.35),arm=Math.cos(now+c.seed)*(c.panic>0?2.8:1.1);ctx.globalAlpha=c.panic>.4?.96:1;ctx.scale(scale,scale);ctx.fillStyle='#0007';ctx.beginPath();ctx.ellipse(0,5,6,3,0,0,TAU);ctx.fill();ctx.strokeStyle=c.pants||'#41494a';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-1,1);ctx.lineTo(-3.5+stride,7);ctx.moveTo(1,1);ctx.lineTo(3.5-stride,7);ctx.stroke();ctx.strokeStyle='#202a29';ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(-2,-1);ctx.lineTo(-3-arm,-3);ctx.moveTo(2,-1);ctx.lineTo(3+arm,-3);ctx.stroke();ctx.strokeStyle=c.shirt||'#a8b4ad';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(0,3);ctx.moveTo(0,-1);ctx.lineTo(-3-arm,-1+stride*.25);ctx.moveTo(0,-1);ctx.lineTo(3+arm,-1-stride*.25);ctx.stroke();ctx.fillStyle=c.skin||'#c9a887';ctx.beginPath();ctx.arc(0,-6,3.1,0,TAU);ctx.fill();ctx.fillStyle=c.hair||'#40362b';ctx.beginPath();ctx.arc(0,-7,3.15,Math.PI,TAU);ctx.fill();if(c.kind==='medic'){ctx.fillStyle='#e9e9df';ctx.fillRect(-2,-2,4,4);ctx.fillStyle='#d94c4c';ctx.fillRect(-.7,-2,1.4,4);ctx.fillRect(-2,-.7,4,1.4)}if(c.panic>.4){ctx.strokeStyle='#ffcf85';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,-9,7,Math.PI*1.1,Math.PI*1.9);ctx.stroke()}ctx.restore()}}
function updateAtmosphere(dt){for(let i=wrecks.length-1;i>=0;i--){wrecks[i].life-=dt;if(wrecks[i].life<=0)wrecks.splice(i,1)}for(const a of ambience){a.y-=a.speed*dt/Math.max(1,vh);a.x+=Math.sin(a.phase+performance.now()*.00018)*a.drift*dt/Math.max(1,vw);if(a.y<-.03){a.y=1.03;a.x=Math.random()}if(a.x<-.03)a.x=1.03;if(a.x>1.03)a.x=-.03}for(let i=shockwaves.length-1;i>=0;i--){const w=shockwaves[i];w.life-=dt;w.r+=w.speed*dt;if(w.life<=0)shockwaves.splice(i,1)}}
function drawWrecks(){for(const w of wrecks){const age=1-w.life/w.max,fade=Math.min(1,w.life/1.4),s=w.size;ctx.save();ctx.translate(w.x,w.y);ctx.rotate(w.a);ctx.globalAlpha=fade;
 /* Burnt tracks and lower hull remain legible as a destroyed vehicle silhouette. */
 ctx.fillStyle='#020504a8';ctx.beginPath();ctx.ellipse(1,s*.18,s*1.34,s*.83,.04,0,TAU);ctx.fill();
 for(const side of [-1,1]){const ty=side<0?-s*.48:s*.27;const tr=ctx.createLinearGradient(-s,ty,s,ty+s*.25);tr.addColorStop(0,'#101614');tr.addColorStop(.4,'#343a34');tr.addColorStop(1,'#090e0c');ctx.fillStyle=tr;ctx.beginPath();ctx.roundRect(-s*1.05,ty,s*2.1,s*.24,3);ctx.fill();ctx.strokeStyle='#66695b77';ctx.lineWidth=1;ctx.stroke();for(let k=0;k<7;k++){const wx=-s*.86+k*s*.285;ctx.fillStyle='#0b100f';ctx.beginPath();ctx.arc(wx,ty+s*.12,s*.075,0,TAU);ctx.fill();ctx.fillStyle='#6d7165';ctx.beginPath();ctx.arc(wx,ty+s*.12,s*.045,0,TAU);ctx.fill()}}
 ctx.fillStyle='#161d19';ctx.beginPath();ctx.moveTo(-s*.82,-s*.34);ctx.lineTo(-s*.65,-s*.53);ctx.lineTo(s*.62,-s*.5);ctx.lineTo(s*.88,-s*.25);ctx.lineTo(s*.74,s*.34);ctx.lineTo(-s*.62,s*.38);ctx.lineTo(-s*.87,s*.12);ctx.closePath();ctx.fill();
 const char=ctx.createLinearGradient(-s*.7,-s*.5,s*.7,s*.4);char.addColorStop(0,'#55564b');char.addColorStop(.32,'#252c27');char.addColorStop(.7,'#111714');char.addColorStop(1,'#070b0a');ctx.fillStyle=char;ctx.beginPath();ctx.moveTo(-s*.72,-s*.31);ctx.lineTo(-s*.54,-s*.42);ctx.lineTo(s*.55,-s*.4);ctx.lineTo(s*.72,-s*.18);ctx.lineTo(s*.62,s*.25);ctx.lineTo(-s*.56,s*.28);ctx.lineTo(-s*.75,s*.06);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#9b927266';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-s*.52,-s*.29);ctx.lineTo(-s*.2,-s*.18);ctx.lineTo(-s*.34,s*.08);ctx.moveTo(s*.24,-s*.32);ctx.lineTo(s*.12,-s*.05);ctx.lineTo(s*.48,s*.17);ctx.stroke();
 /* Broken turret and exposed hot metal, rather than a generic rectangle. */
 ctx.fillStyle='#101613';ctx.beginPath();ctx.moveTo(-s*.34,-s*.23);ctx.lineTo(-s*.19,-s*.43);ctx.lineTo(s*.21,-s*.39);ctx.lineTo(s*.35,-s*.16);ctx.lineTo(s*.22,s*.07);ctx.lineTo(-s*.2,s*.06);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#6b6d5e';ctx.lineWidth=1.2;ctx.stroke();ctx.fillStyle='#090e0c';ctx.fillRect(s*.14,-s*.28,s*.66,s*.09);ctx.fillStyle='#5d5543';ctx.fillRect(s*.5,-s*.27,s*.27,s*.045);
 for(let i=0;i<4;i++){const px=((i*31+w.seed*7)%100)/100*s*1.4-s*.7,py=((i*17+w.seed*13)%100)/100*s*.8-s*.4;ctx.fillStyle=i%2?'#9b8a63':'#4e554d';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+s*.12,py-s*.06);ctx.lineTo(px+s*.17,py+s*.03);ctx.lineTo(px+s*.04,py+s*.09);ctx.closePath();ctx.fill()}
 ctx.restore();
 if(w.life>1.8){const flicker=.65+.35*Math.sin(performance.now()*.018+w.seed);ctx.save();ctx.globalAlpha=fade*.7*flicker;ctx.globalCompositeOperation='screen';const g=ctx.createRadialGradient(w.x,w.y,1,w.x,w.y,s*1.7);g.addColorStop(0,'#ffd47a');g.addColorStop(.35,'#ff753866');g.addColorStop(1,'#ff3b2200');ctx.fillStyle=g;ctx.beginPath();ctx.arc(w.x,w.y,s*1.7,0,TAU);ctx.fill();ctx.globalAlpha=fade*flicker;ctx.fillStyle='#ffbd62';ctx.beginPath();ctx.ellipse(w.x+Math.sin(w.seed+age*8)*3,w.y-s*.25,s*.22,s*(.45+flicker*.18),w.seed,0,TAU);ctx.fill();ctx.restore()}}}
function drawAtmosphere(){ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation='screen';for(const a of ambience){const x=a.x*vw,y=a.y*vh,pulse=.65+.35*Math.sin(a.phase+performance.now()*.001);ctx.globalAlpha=a.alpha*(a.ember?pulse:.7);ctx.fillStyle=a.ember?'#ffb66d':'#9bb7b1';ctx.beginPath();ctx.arc(x,y,a.r*(a.ember?1.25:1),0,TAU);ctx.fill();if(a.ember){ctx.globalAlpha*=.22;ctx.strokeStyle='#ff9b53';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-3,y+5);ctx.lineTo(x+2,y-4);ctx.stroke()}}ctx.restore();for(const w of shockwaves){ctx.globalAlpha=Math.max(0,w.life/w.max)*.72;ctx.strokeStyle=w.color;ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(w.x,w.y,w.r,0,TAU);ctx.stroke();ctx.globalAlpha*=.35;ctx.lineWidth=5;ctx.beginPath();ctx.arc(w.x,w.y,w.r,0,TAU);ctx.stroke()}ctx.globalAlpha=1}
let simAccumulator=0,perfFrames=0,perfStart=performance.now();function loop(ts){requestAnimationFrame(loop);if(document.hidden){lastTime=ts;simAccumulator=0;return}if(!lastTime)lastTime=ts;const rawDt=Math.max(0,(ts-lastTime)/1000);lastTime=ts;const frameDt=Math.min(.05,rawDt);updateAtmosphere(frameDt);if(!paused){simAccumulator=Math.min(.12,simAccumulator+frameDt);let steps=0;while(simAccumulator>=1/60&&steps<4){update(1/60);simAccumulator-=1/60;steps++}if(steps===4&&simAccumulator>1/30)simAccumulator=1/30}else simAccumulator=0;draw();perfFrames++;const elapsed=ts-perfStart;if(elapsed>=1000){window.MTBA_PERF={fps:Math.round(perfFrames*1000/elapsed),frameMs:Math.round(elapsed/perfFrames*10)/10,render:renderEngine?renderEngine.stats():null};perfFrames=0;perfStart=ts}}
function togglePause(){if(!running){showOverlay('MTBA · BATTLE ARENA','Выведите танк на поле боя.','В БОЙ');return}if(gameOver)return;paused=!paused;if(paused)showOverlay('БОЙ ПРИОСТАНОВЛЕН','Танк и отряд ожидают приказа.','ПРОДОЛЖИТЬ БОЙ');else{ui.overlay.classList.add('hidden');ui.pause.textContent='Ⅱ';lastTime=0}}
function selectTank(role){selectedTankRole=role;document.querySelectorAll('[data-tank]').forEach(b=>b.classList.toggle('selected',b.dataset.tank===role));const s=tankProfiles[role];$('selArmor').textContent=s.hp;$('selSpeed').textContent=s.speed;$('selDamage').textContent=s.damage}ui.modal.addEventListener('click',event=>{const button=event.target.closest('[data-tank]');if(button&&ui.modal.contains(button))selectTank(button.dataset.tank)});selectTank('player');
ui.start.addEventListener('click',()=>{initAudio();startGame()});ui.resume.addEventListener('click',()=>{initAudio();if(running&&!gameOver){paused=false;ui.overlay.classList.add('hidden');lastTime=0}});ui.pause.addEventListener('click',togglePause);ui.menu.addEventListener('click',()=>{if(running&&!gameOver){paused=true;showOverlay('МЕНЮ БОЯ','Продолжите текущий бой или начните заново.','НАЧАТЬ ЗАНОВО');$('resumeBtn').hidden=false}else showOverlay('MTBA · BATTLE ARENA','Выведите танк на поле боя.','В БОЙ')});ui.smoke.addEventListener('click',useSmoke);ui.intel.addEventListener('click',useIntelBox);
function setFire(on){input.fire=on}
ui.fire.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();ui.fire.setPointerCapture?.(e.pointerId);setFire(true)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>ui.fire.addEventListener(ev,()=>setFire(false)));
function pointFromEvent(e){const r=canvas.getBoundingClientRect();return screenToWorld(e.clientX-r.left,e.clientY-r.top)}
const joystick=$('joystick'),joystickStick=$('joystickStick');
function updateJoystick(e){const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=Math.max(20,r.width*.32),dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy),m=Math.min(1,d/max),x=d?dx/d*m:0,y=d?dy/d*m:0;joystickVector={x,y};joystickStick.style.transform='translate('+x*max+'px,'+y*max+'px)';}
function beginJoystick(e){if(!running||paused||!ui.overlay.classList.contains('hidden'))return;if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();e.stopPropagation();initAudio();joystickPointer=e.pointerId;joystick.setPointerCapture?.(e.pointerId);updateJoystick(e)}
function endJoystick(e){if(joystickPointer!==e.pointerId)return;joystickPointer=null;joystickVector={x:0,y:0};joystickStick.style.transform='translate(0,0)'}
joystick.addEventListener('pointerdown',beginJoystick);joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)updateJoystick(e)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>joystick.addEventListener(ev,endJoystick));
function beginTouchMove(e){if(!running||paused||!ui.overlay.classList.contains('hidden'))return;if(e.target.closest('button,#joystick'))return;if(e.pointerType==='mouse')return;e.preventDefault();initAudio();touchMovePointer=e.pointerId;touchMoveTarget=pointFromEvent(e);try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){} }
function updateTouchMove(e){if(e.pointerId===touchMovePointer)touchMoveTarget=pointFromEvent(e)}
function endTouchMove(e){if(e.pointerId===touchMovePointer){touchMovePointer=null;touchMoveTarget=null}}
$('arena-wrap').addEventListener('pointerdown',beginTouchMove);$('arena-wrap').addEventListener('pointermove',updateTouchMove);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>$('arena-wrap').addEventListener(ev,endTouchMove));
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;mouse.active=true}});canvas.addEventListener('pointerdown',e=>{initAudio();if(e.pointerType==='mouse'){mouse.down=true;canvas.setPointerCapture?.(e.pointerId);const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;mouse.active=true}});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>canvas.addEventListener(ev,()=>mouse.down=false));canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('blur',()=>{mouse.down=false;input.fire=false;touchMoveTarget=null;touchMovePointer=null;joystickPointer=null;joystickVector={x:0,y:0};if(joystickStick)joystickStick.style.transform='translate(0,0)'});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)togglePause()});
buildArena();bakeStaticTerrain();resize();renderTankPreviews();setInterval(renderTankPreviews,120);requestAnimationFrame(loop);

function initHudCustomizer(){
const panel=$('settingsPanel'),ids=['joystick','intelBtn','smokeBtn','targetBtn','fireBtn','orderBtn','coverBtn','hud','message','pauseBtn','menuBtn','settingsBtn'];
const labels={joystick:'Джойстик движения',intelBtn:'Разведка',smokeBtn:'Дым',targetBtn:'Цель',fireBtn:'Огонь',orderBtn:'Отряд',coverBtn:'Укрыться',hud:'Панель характеристик',message:'Сообщение арены',pauseBtn:'Пауза',menuBtn:'Меню',settingsBtn:'Настройки'};
const movable=ids.map(id=>$(id)).filter(Boolean),defaults=new Map(),layout={},backgrounds={};let editing=false,drag=null;
const root=$('app'),wrap=$('arena-wrap');
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch(_){return fallback}};
const save=()=>{try{localStorage.setItem('mtba-hud-layout',JSON.stringify(layout));localStorage.setItem('mtba-hud-backgrounds',JSON.stringify(backgrounds))}catch(_){}};
for(const el of movable){defaults.set(el.id,{left:el.style.left,top:el.style.top,right:el.style.right,bottom:el.style.bottom,transform:el.style.transform,width:el.style.width,height:el.style.height});}
Object.assign(layout,read('mtba-hud-layout',{}));Object.assign(backgrounds,read('mtba-hud-backgrounds',{}));
const layoutSelect=$('layoutElement'),bgSelect=$('backgroundElement');
for(const id of ids){if(!$(id))continue;for(const sel of [layoutSelect,bgSelect]){const o=document.createElement('option');o.value=id;o.textContent=labels[id]||id;sel.append(o)}}
function applyLayout(){for(const id of ids){const el=$(id),v=layout[id];if(!el||!v)continue;if(v.x!==undefined&&v.y!==undefined){el.style.left=(v.x*100)+'%';el.style.top=(v.y*100)+'%';el.style.right='auto';el.style.bottom='auto';el.style.transform='translate(-50%,-50%)'}if(v.size)el.style.scale=String(v.size/100)}}
function applyBackground(id){const el=$(id),v=backgrounds[id];if(!el||!v)return;const alpha=Math.round((v.opacity??92)*2.55).toString(16).padStart(2,'0');el.style.background=v.color+alpha}
function applyAllBackgrounds(){for(const id of ids)applyBackground(id)}
function selectLayout(){const id=layoutSelect.value,v=layout[id]||{size:100};$('layoutSize').value=v.size||100;$('layoutSizeValue').textContent=(v.size||100)+'%';movable.forEach(el=>el.classList.toggle('hud-edit-selected',editing&&el.id===id))}
function setEditing(on){editing=on;root.classList.toggle('layout-editing',on);selectLayout();if(!on)drag=null}
function openSettings(){panel.hidden=false;paused=running?true:paused;input.fire=false;setEditing(false)}
$('settingsBtn').addEventListener('click',()=>{if(panel.hidden)openSettings();else panel.hidden=true});
$('closeSettings').addEventListener('click',()=>{panel.hidden=true;setEditing(false)});
document.querySelectorAll('[data-settings-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-settings-tab]').forEach(t=>t.classList.toggle('active',t===b));$('layoutSettings').hidden=b.dataset.settingsTab!=='layout';$('backgroundSettings').hidden=b.dataset.settingsTab!=='backgrounds'}));
$('editLayoutToggle').addEventListener('change',e=>setEditing(e.target.checked));
layoutSelect.addEventListener('change',selectLayout);
$('layoutSize').addEventListener('input',e=>{const id=layoutSelect.value;layout[id]=layout[id]||{x:.5,y:.5,size:100};layout[id].size=+e.target.value;$('layoutSizeValue').textContent=e.target.value+'%';const el=$(id);if(el)el.style.scale=String(+e.target.value/100);save()});
$('saveLayout').addEventListener('click',()=>{save();say('РАСКЛАДКА СОХРАНЕНА')});
$('resetLayout').addEventListener('click',()=>{for(const id of ids){delete layout[id];const el=$(id),d=defaults.get(id);if(!el||!d)continue;el.style.left=d.left;el.style.top=d.top;el.style.right=d.right;el.style.bottom=d.bottom;el.style.transform=d.transform;el.style.width=d.width;el.style.height=d.height;el.style.scale=''}try{localStorage.removeItem('mtba-hud-layout')}catch(_){}selectLayout()});
bgSelect.addEventListener('change',()=>{const v=backgrounds[bgSelect.value]||{color:'#172630',opacity:92};$('backgroundColor').value=v.color;$('backgroundOpacity').value=v.opacity;$('backgroundOpacityValue').textContent=v.opacity+'%'});
function setBg(id,color,opacity){backgrounds[id]={color,opacity};applyBackground(id);save()}
$('applyOneBackground').addEventListener('click',()=>{setBg(bgSelect.value,$('backgroundColor').value,+$('backgroundOpacity').value);say('ФОН ЭЛЕМЕНТА ИЗМЕНЁН')});
$('applyAllBackground').addEventListener('click',()=>{for(const id of ids)setBg(id,$('backgroundColor').value,+$('backgroundOpacity').value);say('ЕДИНЫЙ ФОН ПРИМЕНЁН')});
$('backgroundOpacity').addEventListener('input',e=>{$('backgroundOpacityValue').textContent=e.target.value+'%'});
$('resetBackgrounds').addEventListener('click',()=>{for(const id of ids){delete backgrounds[id];const el=$(id);if(el)el.style.background=''}try{localStorage.removeItem('mtba-hud-backgrounds')}catch(_){}});
function dragStart(e){if(!editing||e.button!==undefined&&e.button!==0)return;const el=e.target.closest('#controls .touch-control,#hud,#message,#top-actions button');if(!el||!ids.includes(el.id))return;if(el.id==='settingsBtn')return;e.preventDefault();drag={id:el.id,pointer:e.pointerId,el};layoutSelect.value=el.id;selectLayout();try{el.setPointerCapture(e.pointerId)}catch(_){}}
function dragMove(e){if(!drag||e.pointerId!==drag.pointer)return;const r=wrap.getBoundingClientRect();const x=Math.max(.035,Math.min(.965,(e.clientX-r.left)/r.width)),y=Math.max(.06,Math.min(.94,(e.clientY-r.top)/r.height));layout[drag.id]=layout[drag.id]||{size:100};layout[drag.id].x=x;layout[drag.id].y=y;const el=drag.el;el.style.left=(x*100)+'%';el.style.top=(y*100)+'%';el.style.right='auto';el.style.bottom='auto';el.style.transform='translate(-50%,-50%)';save()}
function dragEnd(e){if(drag&&(!e||e.pointerId===drag.pointer)){drag=null}}
root.addEventListener('pointerdown',dragStart,true);window.addEventListener('pointermove',dragMove);window.addEventListener('pointerup',dragEnd);window.addEventListener('pointercancel',dragEnd);
applyLayout();applyAllBackgrounds();selectLayout();bgSelect.dispatchEvent(new Event('change'));
}
initHudCustomizer();

})();