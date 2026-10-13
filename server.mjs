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
  const blueIds=[],redIds=[];
  for(const e of entries) {
    const ids=e.playerIds.filter(id=>clients.has(id));
    if(!ids.length) continue;
    if(blueIds.length+ids.length<=3) blueIds.push(...ids);
    else if(redIds.length+ids.length<=3) redIds.push(...ids);
  }
  const realIds=[...blueIds,...redIds];
  const players=realIds.map(id=>{const c=clients.get(id);return {id,name:c.name,team:blueIds.includes(id)?'blue':'red',bot:false,ready:true};});
  while(blueIds.length<3){const id='bot-'+randomUUID();blueIds.push(id);players.push({id,name:'BOT '+String(players.length+1).padStart(2,'0'),team:'blue',bot:true,ready:true});}
  while(redIds.length<3){const id='bot-'+randomUUID();redIds.push(id);players.push({id,name:'BOT '+String(players.length+1).padStart(2,'0'),team:'red',bot:true,ready:true});}
  const match={id:randomUUID(),players,createdAt:Date.now()};
  matches.set(match.id,match);
  for(const p of players) if(!p.bot){const c=clients.get(p.id);if(c){c.matchId=match.id;send(c.ws,'match_found',{match:{id:match.id,team:p.team,players:players.map(publicPlayer),status:'waiting_for_gameplay_transport'}});}}
}
function tryMatch() {
  if(!queue.length) return;
  const selected=[];
  let blue=0,red=0,realCount=0;
  for(let i=0;i<queue.length;) {
    const e=queue[i],liveIds=e.playerIds.filter(id=>clients.has(id)),size=liveIds.length;
    if(!size){queue.splice(i,1);continue;}
    let team=null;
    if(blue+size<=3) team='blue';
    else if(red+size<=3) team='red';
    if(team){selected.push({...e,playerIds:liveIds});if(team==='blue')blue+=size;else red+=size;realCount+=size;queue.splice(i,1);}
    else i++;
  }
  if(!selected.length)return;
  const waited=Date.now()-Math.min(...selected.map(e=>e.queuedAt));
  if(realCount===MAX_PLAYERS||(waited>=QUEUE_WAIT_MS&&realCount>0)){makeMatch(selected);return;}
  queue.unshift(...selected);
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
