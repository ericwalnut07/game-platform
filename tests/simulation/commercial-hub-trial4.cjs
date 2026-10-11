// Paired 2x2 experiment using real Core and public-player-view NPC decisions.
const fs=require('node:fs');
const {createHubState,reduceHubState}=require('../../dist-smoke/games/commercial-hub/engine.js');
const {buildHubView}=require('../../dist-smoke/games/commercial-hub/view.js');
const {decideNpc}=require('../../dist-smoke/games/commercial-hub/npc.js');
const {SeededRandom}=require('../../dist-smoke/games/pon-inai/random.js');
const {CANDIDATE_INVESTMENTS}=require('../../dist-smoke/games/commercial-hub/next-data.js');
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const games=Number(args.games||320),seed=Number(args.seed||204000),types=['standard','production','commerce','development'],players=['a','b','c','d'];
const resource=()=>({cash:0,materials:0,goods:0}),add=(a,b)=>{for(const k of Object.keys(a))a[k]+=b?.[k]||0;};
const output=args.output||'trial4-comparison.json';
const result={schemaVersion:1,seed,gamesPerCondition:games,conditions:[],notes:['Same seed, settings and rotating seats in A/B/C/D. Eight settings: 2 horizons x 2 trick modes x auditor on/off; major market enabled.','Building utilization denominator is available building uses at each economy start, extra equipment may raise utilization above one. Private/late builds become available next round.','Card activations and fizzles are event counts; permanent target-selection failures may repeat. Transport receipts are settled amounts.','NPC policy outcomes are not evidence of optimal human strategy. Resource flow totals count confirmed event costs/rewards, including internal transfers separately.']};
for(const [condition,major,operations] of [['A',false,false],['B',true,false],['C',false,true],['D',true,true]]){
 const g={condition,major,operations,games,rows:[],cards:Object.fromEntries(CANDIDATE_INVESTMENTS.map(c=>[c.id,{purchased:0,activated:0,fizzled:0,fired:0,payment:resource()}])),uses:{commerce:0,industry:0,procurement:0},available:{commerce:0,industry:0,procurement:0},produced:resource(),consumed:resource(),privateAcquired:0,privateBuilt:0,privateUpgraded:0,forcedTransport:0,monopolyReceipts:0,priorityUses:0,prioritySaved:0,auditReceived:0,auditWaived:0};
 for(let game=0;game<games;game++){
  const rng=new SeededRandom(seed+game),config={rulesVariant:'NEXT',majorInvestments:true,horizon:game%8<4?'11-13':'12-14',trickRule:game%4<2?'NORMAL':'BID',auditor:!!(game%2)};
  let s=createHubState('factorial-'+game,players,rng,config);s.rulesVersion=condition==='A'?'next-trial-3':'next-trial-4';s.config.testVersion=s.rulesVersion;s.next.changes={major,operations};s.npcPlayers=Object.fromEntries(players.map((p,i)=>[p,types[(i+Math.floor(game/8))%4]]));
  let cursor=0,steps=0,lastEconomy=0;const row={game,seed:seed+game,config:{...config},rounds:0,scores:{},wins:{},passes:0,investmentTurns:0,deficitCompanyRounds:0,companyRounds:0,finalDeficits:0,buildings:0,lv3:null,lv4:null};
  while(s.phase!=='FINISHED'){
   if(++steps>7000)throw Error(`stalled ${condition}/${game}/${s.phase}`);
   if(lastEconomy!==s.round&&['MAJOR_SELECTION','PROCUREMENT','PRODUCTION'].includes(s.phase)){lastEconomy=s.round;for(const b of s.buildings)g.available[b.suit]++;}
   let action;
   if(['TRICK_RESULT','BID_RESULT'].includes(s.phase))action={type:'ADVANCE'};
   else for(let i=0;i<4;i++){const index=(cursor+i)%4,p=players[index],d=decideNpc(buildHubView(s,p),s.npcPlayers[p]);if(d){action={...d.action,playerId:p};cursor=(index+1)%4;break;}}
   if(!action)throw Error(`no progress ${condition}/${game}/${s.phase}`);
   if(s.phase==='INVESTMENT'){row.investmentTurns++;if(action.type==='PASS_INVESTMENT')row.passes++;}
   s.events=[];try{s=reduceHubState(s,action,rng,steps*500);}catch(e){throw Error(`${condition}/${game}/${JSON.stringify(action)}: ${e.stack}`);}
   for(const c of s.companies)if(!Object.values(c.resources).every(Number.isSafeInteger)||c.resources.goods<0||c.resources.materials<0)throw Error('invalid resources');
   for(const e of s.events){const d=e.data,c=g.cards[d.cardId];
    if(c){if(e.type==='MAJOR_PURCHASED'){c.purchased++;add(c.payment,d.cost||{cash:d.price});}if(e.type==='MAJOR_ACTIVATED'){c.activated++;if(d.cardId==='business-expansion'&&major)g.privateAcquired++;}if(e.type==='MAJOR_FIZZLED')c.fizzled++;if(e.type==='MAJOR_FIRED')c.fired++;}
    if(['BUILD','UPGRADE'].includes(e.type)){const b=s.buildings.find(b=>b.id===d.buildingId);if((d.district||b?.district)==='PRIVATE')g[e.type==='BUILD'?'privateBuilt':'privateUpgraded']++;}
    if(e.type==='BUILDING_USED'||e.type==='ROYALTY_OPERATION'){const b=s.buildings.find(b=>b.id===d.buildingId);if(b)g.uses[b.suit]++;}
    if(e.type==='PRIORITY_DISCOUNT'){g.priorityUses++;g.prioritySaved+=d.amount;}
    if(e.type==='AUDIT_RECEIVED')g.auditReceived+=d.amount;
    if(e.type==='AUDIT_WAIVED')g.auditWaived+=d.amount;
    if(d.cost)add(g.consumed,d.cost);if(d.quote?.cost)add(g.consumed,d.quote.cost);if(d.reward)add(g.produced,d.reward);
    if(e.type==='ROUND_SETTLED'){row.companyRounds+=4;row.deficitCompanyRounds+=Object.values(d.cashAfter).filter(x=>x<0).length;for(const t of d.charges)if(t.forcedMonopoly){g.forcedTransport++;g.monopolyReceipts+=t.amount;}}
   }
  }
  row.rounds=s.round;row.buildings=s.buildings.length;row.lv3=s.cityReachedRounds['3'];row.lv4=s.cityReachedRounds['4'];row.finalDeficits=s.result.ranking.filter(r=>r.deficit).length;
  for(const r of s.result.ranking)row.scores[s.npcPlayers[r.playerId]]=r.value.total;
  for(const t of types)row.wins[t]=s.result.winners.filter(p=>s.npcPlayers[p]===t).length/s.result.winners.length;
  g.rows.push(row);
  if((game+1)%8===0){fs.writeFileSync(output,JSON.stringify({...result,conditions:[...result.conditions,g]}));console.log(condition+' '+(game+1)+'/'+games);}
 }
 result.conditions.push(g);fs.writeFileSync(output,JSON.stringify(result));
}
console.log('TRIAL4_FACTORIAL_OK '+games*4+' games');
