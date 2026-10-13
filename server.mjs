import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 10000);
const QUEUE_WAIT_MS = Math.max(5000, Number(process.env.QUEUE_WAIT_MS || 12000));
const MAX_PLAYERS = 6;
const clients = new Map();
const parties = new Map();
const queue = [];
const matches = new Map();

const json = (res, status, body) => {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(body));
};
const publicPlayer = p => ({id:p.id,name:p.name,team:p.team||null,bot:!!p.bot,ready:!!p.ready});
function send(ws, type, data={}) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type,...data}));
}
function broadcastParty(party) {
  const data = {party:{id:party.id,leaderId:party.leaderId,members:party.members.map(publicPlayer),size:3}};
  for (const m of party.members) { const c=clients.get(m.id); if(c) send(c.ws,'party_state',data); }
}
function removeFromQueue(id) {
  for (let i=queue.length-1;i>=0;i--) if(queue[i].playerIds.includes(id)) queue.splice(i,1);
}
function leaveParty(id) {
  for (const [key,party] of parties) {
    const at=party.members.findIndex(p=>p.id===id);
    if(at<0) continue;
    party.members.splice(at,1);
    if(!party.members.length) parties.delete(key);
    else { if(party.leaderId===id) party.leaderId=party.members[0].id; broadcastParty(party); }
    return;
  }
}
function makeParty(client) {
  leaveParty(client.id);
  const id=randomBytes(4).toString('hex').toUpperCase();
  const p={id,leaderId:client.id,members:[{id:client.id,name:client.name,ready:true}]};
  parties.set(id,p); broadcastParty(p); return p;
}
function makeMatch(entries) {
  const real=entries.flatMap(e=>e.playerIds.map(id=>clients.get(id))).filter(Boolean);
  const players=real.map((c,i)=>({id:c.id,name:c.name,team:i<3?'blue':'red',bot:false,ready:true}));
  while(players.length<MAX_PLAYERS) {
    const i=players.length;
    players.push({id:'bot-'+randomUUID(),name:'BOT '+String(i+1).padStart(2,'0'),team:i<3?'blue':'red',bot:true,ready:true});
  }
  // Preserve each pre-formed party as a team. Solo players fill the remaining slots.
  let blue=0,red=0;
  for(const e of entries) {
    const ids=e.playerIds;
    const team=(blue+ids.length<=3)?'blue':(red+ids.length<=3?'red':null);
    if(!team) continue;
    for(const p of players) if(ids.includes(p.id)) p.team=team;
    if(team==='blue') blue+=ids.length; else red+=ids.length;
  }
  // Rebalance solo players into any remaining slots, never splitting a party.
  const partyIds=new Set(entries.filter(e=>e.partyId).flatMap(e=>e.playerIds));
  for(const p of players) {
    if(p.bot||partyIds.has(p.id)) continue;
    if(blue<3){p.team='blue';blue++;} else {p.team='red';red++;}
  }
  const match={id:randomUUID(),players,createdAt:Date.now()};
  matches.set(match.id,match);
  for(const p of players) if(!p.bot){const c=clients.get(p.id);if(c){c.matchId=match.id;send(c.ws,'match_found',{match:{id:match.id,team:p.team,players:players.map(publicPlayer),status:'waiting_for_gameplay_transport'}});}}
}
function tryMatch() {
  if(!queue.length) return;
  const entries=[];
  let count=0;
  for(let i=0;i<queue.length;) {
    const e=queue[i];
    if(count+e.playerIds.length<=MAX_PLAYERS){entries.push(e);count+=e.playerIds.length;queue.splice(i,1);}
    else i++;
    if(count===MAX_PLAYERS) break;
  }
  if(count===MAX_PLAYERS) {makeMatch(entries);return;}
  // Only auto-fill after oldest queue entry has waited long enough.
  if(entries.length && Date.now()-Math.min(...entries.map(e=>e.queuedAt))>=QUEUE_WAIT_MS) makeMatch(entries);
  else queue.unshift(...entries);
}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health') return json(res,200,{ok:true,service:'mtba-matchmaking',protocol:'websocket',maxPlayers:6});
  if(url.pathname==='/') return json(res,200,{service:'MiniTanksBattleArena matchmaking',status:'online',websocket:'/ws',health:'/health'});
  return json(res,404,{error:'not_found'});
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192});
wss.on('connection',(ws)=>{
  const client={id:randomUUID(),name:'Tank pilot',ws,matchId:null};
  clients.set(client.id,client);
  send(ws,'connected',{playerId:client.id,maxPlayers:6,teamSize:3});
  ws.on('message',(raw)=>{
    let msg; try{msg=JSON.parse(raw.toString())}catch{return send(ws,'error',{code:'invalid_json'});}
    if(!msg||typeof msg.type!=='string') return send(ws,'error',{code:'invalid_message'});
    if(msg.type==='profile'){
      const name=String(msg.name||'Tank pilot').trim().slice(0,20);
      client.name=name||'Tank pilot'; return send(ws,'profile_updated',{player:{id:client.id,name:client.name}});
    }
    if(msg.type==='create_party'){
      if(client.matchId) return send(ws,'error',{code:'already_in_match'});
      const p=makeParty(client); return send(ws,'party_created',{partyId:p.id,inviteCode:p.id});
    }
    if(msg.type==='join_party'){
      const id=String(msg.inviteCode||'').trim().toUpperCase(),p=parties.get(id);
      if(!p) return send(ws,'error',{code:'party_not_found'});
      if(p.members.length>=3) return send(ws,'error',{code:'party_full'});
      if(p.members.some(m=>m.id===client.id)) return broadcastParty(p);
      leaveParty(client.id);removeFromQueue(client.id);
      p.members.push({id:client.id,name:client.name,ready:true});broadcastParty(p);
      return send(ws,'party_joined',{partyId:p.id});
    }
    if(msg.type==='leave_party'){leaveParty(client.id);return send(ws,'party_left');}
    if(msg.type==='quick_match'){
      if(client.matchId) return send(ws,'error',{code:'already_in_match'});
      if(queue.some(e=>e.playerIds.includes(client.id))) return send(ws,'queue_state',{queued:true});
      const party=[...parties.values()].find(p=>p.members.some(m=>m.id===client.id));
      if(party&&party.leaderId!==client.id) return send(ws,'error',{code:'leader_only'});
      const playerIds=party?party.members.map(m=>m.id):[client.id];
      removeFromQueue(client.id);
      queue.push({playerIds,partyId:party?.id||null,queuedAt:Date.now()});
      for(const id of playerIds){const c=clients.get(id);if(c)send(c.ws,'queue_state',{queued:true,partySize:playerIds.length,waitMs:QUEUE_WAIT_MS});}
      tryMatch();return;
    }
    if(msg.type==='cancel_matchmaking'){removeFromQueue(client.id);return send(ws,'queue_state',{queued:false});}
    if(msg.type==='leave_match'){client.matchId=null;return send(ws,'match_left');}
    send(ws,'error',{code:'unknown_message'});
  });
  ws.on('close',()=>{
    removeFromQueue(client.id);leaveParty(client.id);clients.delete(client.id);
    if(client.matchId){const match=matches.get(client.matchId);if(match){const p=match.players.find(x=>x.id===client.id);if(p){p.disconnected=true;p.bot=true;p.name='BOT takeover';for(const other of match.players){const c=clients.get(other.id);if(c)send(c.ws,'player_disconnected',{playerId:client.id,replacedByBot:true});}}}}
  });
});
const matchTimer=setInterval(tryMatch,1000);matchTimer.unref();
server.listen(PORT,'0.0.0.0',()=>console.log('MTBA matchmaking listening on '+PORT));
