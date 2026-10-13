(() => {
'use strict';
const $=id=>document.getElementById(id);
const endpoint=(()=>{const host='https://mtba-matchmaking.onrender.com';return host.replace(/^http/,'ws')+'/ws'})();
let socket=null,playerId=null,party=null,queued=false,match=null,connecting=false;
const status=$('partyStatus'),members=$('partyMembers'),controls=$('partyControls');
const setStatus=(text,state='')=>{if(status){status.textContent=text;status.dataset.state=state}};
const send=(type,data={})=>{if(!socket||socket.readyState!==WebSocket.OPEN){setStatus('ОНЛАЙН-СЕРВЕР ПОДКЛЮЧАЕТСЯ…','busy');connect();return false}socket.send(JSON.stringify({type,...data}));return true};
function connect(){
 if(connecting||(socket&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(socket.readyState)))return;
 connecting=true;socket=new WebSocket(endpoint);
 socket.addEventListener('open',()=>{connecting=false;setStatus('ОНЛАЙН-СЕРВЕР ДОСТУПЕН','ok');send('profile',{name:'Tank pilot'})});
 socket.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data)}catch{return}
  if(m.type==='connected'){playerId=m.playerId;setStatus('ПОДКЛЮЧЕНО · ГОТОВО К ПОИСКУ','ok')}
  else if(m.type==='profile_updated'){}
  else if(m.type==='party_created'||m.type==='party_joined'){party={id:m.partyId||m.party?.id};setStatus('ГРУППА СОЗДАНА · КОД '+party.id,'ok');if(m.party)renderParty(m.party);toggleParty(true)}
  else if(m.type==='party_state'){party=m.party;renderParty(m.party);toggleParty(true);setStatus('ГРУППА '+m.party.members.length+'/3 · ЛИДЕР УПРАВЛЯЕТ ПОИСКОМ','ok')}
  else if(m.type==='party_left'){party=null;members.hidden=true;toggleParty(false);setStatus('ВЫ ВЫШЛИ ИЗ ГРУППЫ')}
  else if(m.type==='queue_state'){queued=!!m.queued;$('cancelQueueBtn').hidden=!queued;setStatus(queued?'ПОИСК СОПЕРНИКОВ · 3 НА 3 · БОТЫ ЗАПОЛНЯТ СВОБОДНЫЕ МЕСТА':'ПОИСК НЕ АКТИВЕН',queued?'busy':'')}
  else if(m.type==='match_found'){match=m.match;queued=false;$('cancelQueueBtn').hidden=true;setStatus('СОПЕРНИКИ НАЙДЕНЫ · КОМАНДА '+(match.team==='blue'?'A':'B')+' · 6 ТАНКОВ','ok');setStatus('ПОДБОР РАБОТАЕТ. СЕТЕВОЕ УПРАВЛЕНИЕ ТАНКАМИ ЕЩЁ НЕ ПОДКЛЮЧЕНО. ОДИНОЧНЫЙ БОЙ ОСТАЁТСЯ ДОСТУПЕН.','busy')}
  else if(m.type==='player_disconnected')setStatus('ИГРОК ОТКЛЮЧИЛСЯ · МЕСТО ПЕРЕДАНО БОТУ','busy');
  else if(m.type==='error'){const labels={party_not_found:'КОД ГРУППЫ НЕ НАЙДЕН',party_full:'В ГРУППЕ УЖЕ 3 ИГРОКА',leader_only:'ПОИСК МОЖЕТ ЗАПУСТИТЬ ЛИДЕР',already_in_match:'ВЫ УЖЕ В МАТЧЕ',invalid_json:'ОШИБКА СООБЩЕНИЯ'};setStatus(labels[m.code]||('ОШИБКА: '+m.code),'error')}
 });
 socket.addEventListener('close',()=>{connecting=false;setStatus('ОНЛАЙН-СЕРВЕР НЕДОСТУПЕН · ПОВТОРИТЕ ПОЗЖЕ','error')});
 socket.addEventListener('error',()=>{connecting=false;setStatus('НЕ УДАЛОСЬ ПОДКЛЮЧИТЬСЯ К ОНЛАЙН-СЕРВЕРУ','error')});
}
function toggleParty(show){controls.hidden=!show;$('partyJoinRow').hidden=show;$('createPartyBtn').hidden=show}
function renderParty(p){members.hidden=false;members.replaceChildren();for(const m of p.members){const row=document.createElement('div');row.className='party-member';const name=document.createElement('span');name.textContent=m.name+(m.id===p.leaderId?' · ЛИДЕР':'');const role=document.createElement('span');role.textContent=m.id===playerId?'ВЫ':'ГОТОВ';row.append(name,role);members.append(row)}}
$('quickMatchBtn')?.addEventListener('click',()=>{connect();setTimeout(()=>send('quick_match'),250)});
$('createPartyBtn')?.addEventListener('click',()=>{connect();setTimeout(()=>send('create_party'),250)});
$('joinPartyBtn')?.addEventListener('click',()=>{const code=$('partyCodeInput').value.trim();if(!code)return setStatus('ВВЕДИТЕ КОД ПРИГЛАШЕНИЯ','error');connect();setTimeout(()=>send('join_party',{inviteCode:code}),250)});
$('leavePartyBtn')?.addEventListener('click',()=>send('leave_party'));
$('cancelQueueBtn')?.addEventListener('click',()=>send('cancel_matchmaking'));
$('sharePartyBtn')?.addEventListener('click',async()=>{if(!party)return;const text='Присоединяйся к моей команде в MiniTanksBattleArena. Код группы: '+party.id;try{if(navigator.share)await navigator.share({title:'MTBA · группа друзей',text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);setStatus('КОД ПРИГЛАШЕНИЯ СКОПИРОВАН: '+party.id,'ok')}else setStatus(text,'ok')}catch{}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!socket||socket.readyState===WebSocket.CLOSED))connect()});
window.MTBA_MULTIPLAYER={connect,get state(){return {connected:!!socket&&socket.readyState===WebSocket.OPEN,playerId,party,queued,match}}};
})();
