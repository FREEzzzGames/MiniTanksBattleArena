/* MTBA Render Engine — deterministic pixel-textured Canvas 2D terrain.
   No WebGL, no runtime dependencies, no per-frame terrain allocations. */
(() => {
'use strict';
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function seeded(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function smooth(t){return t*t*(3-2*t)}
function makeNoiseGrid(cols,rows,rng){const data=new Float32Array(cols*rows);for(let i=0;i<data.length;i++)data[i]=rng();return{data,cols,rows}}
function sampleNoise(g,x,y,cell){const gx=x/cell,gy=y/cell,ix=Math.floor(gx),iy=Math.floor(gy),fx=smooth(gx-ix),fy=smooth(gy-iy),x0=ix%g.cols,y0=iy%g.rows,x1=(x0+1)%g.cols,y1=(y0+1)%g.rows,a=g.data[y0*g.cols+x0],b=g.data[y0*g.cols+x1],c=g.data[y1*g.cols+x0],d=g.data[y1*g.cols+x1];return(a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy}
function create(world){
 const W=Math.max(1,Math.floor(world.w||1800)),H=Math.max(1,Math.floor(world.h||1800));
 const memory=Number(navigator.deviceMemory||4),cores=Number(navigator.hardwareConcurrency||4);
 const quality=memory<=2||cores<=2?'balanced':memory>=8&&cores>=8?'ultra':'high';
 const scale=quality==='ultra'?.65:.5,tw=Math.max(1,Math.round(W*scale)),th=Math.max(1,Math.round(H*scale));
 const ground=document.createElement('canvas');ground.width=W;ground.height=H;
 const gctx=ground.getContext('2d',{alpha:false});gctx.imageSmoothingEnabled=false;
 const tex=document.createElement('canvas');tex.width=tw;tex.height=th;
 const tctx=tex.getContext('2d',{alpha:false,willReadFrequently:false});
 const rng=seeded(0x4d544241),noiseA=makeNoiseGrid(Math.ceil(tw/10)+2,Math.ceil(th/10)+2,rng),noiseB=makeNoiseGrid(Math.ceil(tw/31)+2,Math.ceil(th/31)+2,rng),noiseC=makeNoiseGrid(Math.ceil(tw/86)+2,Math.ceil(th/86)+2,rng),noiseD=makeNoiseGrid(Math.ceil(tw/230)+2,Math.ceil(th/230)+2,rng);
 const img=tctx.createImageData(tw,th),data=img.data;
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
  const n1=sampleNoise(noiseA,x,y,10),n2=sampleNoise(noiseB,x,y,31),n3=sampleNoise(noiseC,x,y,86),n4=sampleNoise(noiseD,x,y,230);
  const grit=(rng()-.5)*13, stain=(n2-.5)*17+(n3-.5)*23+(n4-.5)*17, fine=(n1-.5)*22+grit;
  const roadV=Math.abs(x/scale-W*.5),roadH=Math.abs(y/scale-H*.5),roadDist=Math.min(roadV,roadH),road=roadDist<55?1-roadDist/55:0;
  const damp=Math.max(0,(n3-.62)*2.2),moss=Math.max(0,(n2-.66)*2.4);
  const i=(y*tw+x)*4;
  data[i]=clamp(34+stain+fine+road*4-damp*5+moss*2,0,255);
  data[i+1]=clamp(43+stain*.82+fine*.8+road*3-damp*4+moss*9,0,255);
  data[i+2]=clamp(34+stain*.55+fine*.55+road*2-damp*2+moss*2,0,255);
  data[i+3]=255;
 }
 tctx.putImageData(img,0,0);gctx.drawImage(tex,0,0,W,H);
 /* Broad worn service roads with dusty shoulders and broken asphalt aggregate. */
 for(const vertical of [true,false]){
  gctx.save();const grad=vertical?gctx.createLinearGradient(W*.5-62,0,W*.5+62,0):gctx.createLinearGradient(0,H*.5-62,0,H*.5+62);
  grad.addColorStop(0,'#131a15');grad.addColorStop(.13,'#343a2e');grad.addColorStop(.23,'#292f27');grad.addColorStop(.5,'#202720');grad.addColorStop(.78,'#2d3329');grad.addColorStop(.9,'#34392d');grad.addColorStop(1,'#151c16');gctx.fillStyle=grad;
  if(vertical)gctx.fillRect(W*.5-62,0,124,H);else gctx.fillRect(0,H*.5-62,W,124);
  gctx.globalAlpha=.35;for(let i=0;i<1500;i++){const p=rng(),q=rng(),along=p*(vertical?H:W),cross=(q-.5)*104,size=.4+rng()*2.3;gctx.fillStyle=rng()>.5?'#777a6555':'#080e0b88';if(vertical)gctx.fillRect(W*.5+cross,along,size*1.5,size);else gctx.fillRect(along,H*.5+cross,size,size*1.5)}
  gctx.restore();
 }
 /* Deterministic micro-relief: gravel, worn scrapes, tiny stones and hairline cracks. */
 const pebbleColors=['#121a14','#4b5140','#626550','#171f18','#73745a','#252e24','#8a8669'];
 for(let i=0;i<17000;i++){
  const x=rng()*W,y=rng()*H,r=.35+rng()*1.9,choice=Math.floor(rng()*pebbleColors.length);
  gctx.globalAlpha=.14+rng()*.42;gctx.fillStyle=pebbleColors[choice];gctx.beginPath();
  if(i%5===0)gctx.ellipse(x,y,r*1.8,r*.65,rng()*TAU,0,TAU);else gctx.rect(Math.round(x),Math.round(y),Math.max(.7,r),Math.max(.7,r*.65));
  gctx.fill();
 }
 gctx.globalAlpha=1;
 for(let i=0;i<470;i++){
  const x=rng()*W,y=rng()*H,len=3+rng()*26,a=(rng()-.5)*1.15;
  gctx.strokeStyle=rng()>.52?'#0a100d65':'#a2a08430';gctx.lineWidth=.45+rng()*.7;gctx.beginPath();gctx.moveTo(x,y);gctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);gctx.lineTo(x+Math.cos(a+.18)*len*.42,y+Math.sin(a+.18)*len*.42);gctx.stroke();
 }
 /* Removed world-spanning cross/grid marks; local road wear and scattered track impressions remain. */
 /* Ambient occlusion-like vignette is baked once into terrain, not recomputed per frame. */
 const vignette=gctx.createRadialGradient(W*.5,H*.5,Math.min(W,H)*.22,W*.5,H*.5,Math.max(W,H)*.76);
 vignette.addColorStop(0,'#00000000');vignette.addColorStop(.72,'#02070408');vignette.addColorStop(1,'#02070428');gctx.fillStyle=vignette;gctx.fillRect(0,0,W,H);
 let frames=0,last=0,avgMs=16.7,lowFrames=0,adaptive='native';
 function drawGround(ctx,camera,viewWidth,viewHeight){const sx=clamp(camera&&camera.x||0,0,Math.max(0,W-viewWidth)),sy=clamp(camera&&camera.y||0,0,Math.max(0,H-viewHeight)),sw=Math.max(1,Math.min(viewWidth,W-sx)),sh=Math.max(1,Math.min(viewHeight,H-sy));ctx.drawImage(ground,sx,sy,sw,sh,sx,sy,sw,sh)}
 function drawMaterialPass(ctx,visible){if(!visible)return;/* reserved for camera-visible decals; all expensive ground work is cached */}
 function recordFrame(ms){frames++;avgMs=avgMs*.94+ms*.06;if(avgMs>23)lowFrames++;else lowFrames=Math.max(0,lowFrames-1);if(lowFrames>90)adaptive='reduced';else if(lowFrames===0)adaptive='native';last=ms}
 function stats(){return{quality,adaptive,avgFrameMs:Math.round(avgMs*10)/10,worldWidth:W,worldHeight:H,textureWidth:tw,textureHeight:th,frames,lastFrameMs:last}}
 return{drawGround,drawMaterialPass,recordFrame,stats,groundCanvas:ground};
}
window.MTBARenderEngine={create,version:'1.0.0'};
})();