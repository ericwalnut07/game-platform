const assert=require('node:assert/strict');
const {SeededRandom}=require('../../dist-smoke/games/pon-inai/random.js');
const {createHubState,reduceHubState}=require('../../dist-smoke/games/commercial-hub/engine.js');
const {buildHubView}=require('../../dist-smoke/games/commercial-hub/view.js');
const {chooseAction,proposeTrade}=require('./hub-bot.cjs');
const players=['A','B','C','D'],coverage=new Set(),rounds=[];
for(let seed=1;seed<=30;seed++) {
 const rng=new SeededRandom(seed);let s=createHubState(`sim-${seed}`,players,rng),count=0;
 while(s.phase!=='FINISHED') {
  assert.ok(++count<2000,'stalled game');
  if(s.phase==='TRICK_RESULT'){s=reduceHubState(s,{type:'ADVANCE'},rng);continue;}
  let performed=false;
  for(const p of players) {
   const v=buildHubView(s,p);assert.equal(v.companyValues,undefined);assert.equal(v.playerHands,undefined);
   let action=chooseAction(v);
   const offer=proposeTrade(v);
   if(offer&&seed%2===0)action=offer;
   const incoming=v.negotiations.find(n=>n.counterpart===p&&n.status==='PENDING');
   if(s.phase==='PROCUREMENT'&&incoming){const a=v.companies.find(c=>c.playerId===incoming.proposer).resources,b=v.companies.find(c=>c.playerId===p).resources;const affordable=Object.keys(a).every(k=>(incoming.give[k]===0||a[k]>=incoming.give[k])&&(incoming.receive[k]===0||b[k]>=incoming.receive[k]));action={type:'ANSWER_TRADE',negotiationId:incoming.id,accept:seed%3!==0&&affordable};}
   if(!action)continue;
   s=reduceHubState(s,{...action,playerId:p},rng);coverage.add(action.type);performed=true;break;
  }
  assert.ok(performed,`stalled ${s.phase}`);
  for(const c of s.companies){assert.ok(Number.isSafeInteger(c.resources.cash));assert.ok(c.resources.materials>=0&&c.resources.goods>=0);}
  assert.ok(s.round<=12);assert.ok(s.buildings.length<=17);
  for(const p of players) {assert.ok(s.buildings.filter(b=>b.playerId===p).length<=6);assert.ok(s.routes.filter(r=>r.playerId===p).length<=8);}
  for(const e of s.events.slice(-6)){coverage.add(e.type);if(e.type==='ROUND_STARTED'&&e.data.condition==='special-boom')coverage.add('SPECIAL_BOOM');}
 }
 assert.equal(s.transportCharges.length,0);assert.ok(s.result.winners.length>=1);rounds.push(s.round);
}
for(const required of ['BUILD','UPGRADE','ROUTE','CONTRIBUTE','MARKET','OFFER_TRADE','ANSWER_TRADE','BUILDING_USED','PROJECT_COMPLETED','SPECIAL_BOOM'])assert.ok(coverage.has(required),`Missing ${required}`);
console.log(`Commercial Hub v0.4 normal: 30 complete four-player games, rounds ${Math.min(...rounds)}-${Math.max(...rounds)}, coverage ${[...coverage].sort().join(', ')}`);

