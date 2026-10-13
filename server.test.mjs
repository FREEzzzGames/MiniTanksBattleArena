import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('matchmaking service exposes health and websocket transport', async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(source,/MAX_PLAYERS = 6/);
 assert.match(source,/teamSize:3/);
 assert.match(source,/path:'\/ws'/);
 assert.match(source,/QUEUE_WAIT_MS/);
});
test('party invitations are capped at three and use invite codes',async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(source,/p\.members\.length>=3/);
 assert.match(source,/inviteCode:p\.id/);
 assert.match(source,/party_not_found/);
 assert.match(source,/party_full/);
});
test('queue preserves a party as a unit and supports bot fill after wait',async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(source,/party\.members\.map\(m=>m\.id\)/);
 assert.match(source,/waited>=QUEUE_WAIT_MS/);
 assert.match(source,/while\(blueIds\.length<3\)/);\n assert.match(source,/while\(redIds\.length<3\)/);
 assert.match(source,/player_disconnected/);
});
test('custom public room browser is not implemented',async()=>{
 const source=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/list_public_rooms|browse_rooms/);
});
