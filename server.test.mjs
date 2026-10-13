import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('matchmaking service exposes health and websocket transport', async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(source,/MAX_PLAYERS = 6/);
 assert.match(source,/TEAM_SIZE = 3/);
 assert.match(source,/path:'\/ws'/);
 assert.match(source,/QUEUE_WAIT_MS.*5000/);
 assert.match(source,/botFillAfterMs:QUEUE_WAIT_MS/);
});
test('party invitations are capped at three and use invite codes',async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(source,/p\.members\.length>=TEAM_SIZE/);
 assert.match(source,/inviteCode:p\.id/);
 assert.match(source,/party_not_found/);
 assert.match(source,/party_full/);
});
test('queue preserves parties and fills both teams with bots after the wait',async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(source,/party\.members\.map\(m=>m\.id\)/);
 assert.match(source,/waited>=QUEUE_WAIT_MS/);
 assert.match(source,/while\(teams\[team\]\.length<TEAM_SIZE\)/);
 assert.match(source,/player_disconnected/);
 assert.match(source,/status:'active'/);
});
test('active match relays validated battle inputs, state and events',async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(source,/msg\.type==='battle_input'\|\|msg\.type==='battle_state'\|\|msg\.type==='battle_event'/);
 assert.match(source,/not_in_active_match/);
 assert.match(source,/battle_payload_too_large/);
 assert.match(source,/broadcastMatch\(match,msg\.type/);
});
test('game engine exposes online hooks and synchronizes remote tanks',async()=>{
 const source=await readFile(new URL('./js/game.js',import.meta.url),'utf8');
 assert.match(source,/window\.MTBA_GAME=/);
 assert.match(source,/getSnapshot\(\)/);
 assert.match(source,/applyRemoteState/);
 assert.match(source,/kind:'shot'/);
 assert.match(source,/kind:'damage'/);
});
test('online client starts a match and exchanges snapshots and events',async()=>{
 const source=await readFile(new URL('./js/multiplayer.js',import.meta.url),'utf8');
 assert.match(source,/startOnline\(match\)/);
 assert.match(source,/send\('battle_state'/);
 assert.match(source,/sendBattleEvent/);
 assert.match(source,/applyRemoteState/);
});

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

test('live websocket match fills 3v3 after five seconds and relays battle state', { timeout: 20000 }, async()=>{
 const port=22000+Math.floor(Math.random()*12000);
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
 const clients=[];
 const makeClient=()=>{
  const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws');
  const messages=[],waiters=[];
  ws.on('message',raw=>{
   let msg;try{msg=JSON.parse(raw.toString())}catch{return}
   const i=waiters.findIndex(w=>w.type===msg.type);
   if(i>=0){const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(msg)}else messages.push(msg);
  });
  const client={ws,wait(type,timeout=12000){
   const at=messages.findIndex(m=>m.type===type);
   if(at>=0)return Promise.resolve(messages.splice(at,1)[0]);
   return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(new Error('Timed out waiting for '+type))},timeout)};waiters.push(waiter)});
  }};
  clients.push(client);return client;
 };
 try{
  let ready=false;
  for(let i=0;i<80&&!ready;i++){
   try{const response=await fetch('http://127.0.0.1:'+port+'/health');ready=response.ok}catch{}
   if(!ready)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready,true,'matchmaking server should start');
  const a=makeClient(),b=makeClient();
  await Promise.all([once(a.ws,'open'),once(b.ws,'open')]);
  const connected=await Promise.all([a.wait('connected'),b.wait('connected')]);
  a.ws.send(JSON.stringify({type:'quick_match'}));
  b.ws.send(JSON.stringify({type:'quick_match'}));
  const found=await Promise.all([a.wait('match_found'),b.wait('match_found')]);
  assert.equal(found[0].match.players.length,6);
  assert.equal(found[1].match.players.filter(p=>p.bot).length,4);
  assert.equal(found[0].match.status,'active');
  a.ws.send(JSON.stringify({type:'battle_state',payload:{players:[{id:connected[0].playerId,x:321,y:654,team:found[0].match.team,hp:100}]}}));
  const relayed=await b.wait('battle_state',3000);
  assert.equal(relayed.payload.players[0].x,321);
  assert.equal(relayed.payload.players[0].y,654);
 }finally{
  for(const c of clients)try{c.ws.close()}catch{}
  child.kill('SIGTERM');
 }
});
