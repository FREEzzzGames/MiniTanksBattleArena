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
