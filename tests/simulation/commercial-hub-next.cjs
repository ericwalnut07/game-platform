// Uses the real opt-in Hub Core and player-view-only policies. No remote I/O.
const fs=require('node:fs');
const {createHubState,reduceHubState}=require('../../dist-smoke/games/commercial-hub/engine.js');
const {buildHubView}=require('../../dist-smoke/games/commercial-hub/view.js');
const {decideNpc}=require('../../dist-smoke/games/commercial-hub/npc.js');
const {SeededRandom}=require('../../dist-smoke/games/pon-inai/random.js');
const {CANDIDATE_INVESTMENTS}=require('../../dist-smoke/games/commercial-hub/next-data.js');
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const games=Number(args.games||1),seed=Number(args.seed||41420),types=['standard','production','commerce','development'];
const result={schemaVersion:1,testVersion:'next-trial-1',seed,gamesPerSetting:games,groups:[]};
for(const horizon of ['11-13','12-14'])for(const majorInvestments of [false,true])for(const trickRule of ['NORMAL','BID'])for(const auditor of [false,true]){
 const g={horizon,majorInvestments,trickRule,auditor,games,rounds:0,value:0,wins:Object.fromEntries(types.map(t=>[t,0])),projects:{},cards:Object.fromEntries(CANDIDATE_INVESTMENTS.map(c=>[c.id,{purchased:0,activated:0,fired:0,fizzled:0,priceSpent:0,directCashReceived:0,targetSelections:0,extraUses:0,freeBuilds:0,baseConstructionCostAvoided:0,priorityContributions:0,transferredSlots:0,blockedRoutes:0,netCashObserved:0,resourceOutput:{materials:0,goods:0},resourceInput:{materials:0,goods:0}}])),upgrades:0,buildingsByRound:{},investmentTurns:0,cashShortagePasses:0,comebacksR8:0,comebacksR10:0,scoreGap:0,invalidResources:0,illegalActions:0,unreachableStates:0,stalls:0};
 for(let game=0;game<games;game++){
  const rng=new SeededRandom(seed+game),players=['a','b','c','d'];let s=createHubState('sim-'+game,players,rng,{rulesVariant:'NEXT',horizon,majorInvestments,trickRule,auditor});
  s.npcPlayers=Object.fromEntries(players.map((p,i)=>[p,types[(i+game)%4]]));let steps=0,cursor=0;const leaders={};
  while(s.phase!=='FINISHED'){
   if(++steps>6000){g.stalls++;throw Error('Stall '+JSON.stringify(g));}
   let action;
   if(['TRICK_RESULT','BID_RESULT'].includes(s.phase))action={type:'ADVANCE'};
   else{for(let i=0;i<4;i++){const index=(cursor+i)%4,p=players[index];const d=decideNpc(buildHubView(s,p),s.npcPlayers[p]);if(d){action={...d.action,playerId:p};cursor=(index+1)%4;break;}}}
   if(!action){g.unreachableStates++;throw Error('No legal progress in '+s.phase);}
   if(s.phase==='INVESTMENT'){g.investmentTurns++;if(action.type==='PASS_INVESTMENT'&&s.companies.find(c=>c.playerId===action.playerId).resources.cash<3)g.cashShortagePasses++;}
   const priorUsed=action.type==='USE_BUILDING'?s.usage[action.playerId].buildings.filter(x=>x===action.buildingId).length:0;
   const priorResources=action.playerId?{...s.companies.find(c=>c.playerId===action.playerId).resources}:null;
   const active=(id,p)=>s.next.cards.find(c=>c.id===id&&c.owner===p&&c.status==='ACTIVE'&&c.activeRound<=s.round);
   // Analysis is captured outside the state; avoid quadratic history cloning in long batches.
   s.events=[];
   try{s=reduceHubState(s,action,rng,steps*500);}catch(e){g.illegalActions++;throw e;}
   for(const c of s.companies)if(!Object.values(c.resources).every(Number.isSafeInteger)||c.resources.goods<0||c.resources.materials<0){g.invalidResources++;throw Error('Invalid resources');}
   for(const e of s.events){
    if(e.type==='UPGRADE')g.upgrades++;
    const id=e.data.cardId;if(id&&g.cards[id]){
     if(e.type==='MAJOR_PURCHASED'){g.cards[id].purchased++;g.cards[id].priceSpent+=e.data.price;}
     if(e.type==='MAJOR_ACTIVATED')g.cards[id].activated++;
     if(e.type==='MAJOR_FIRED')g.cards[id].fired++;
     if(e.type==='MAJOR_FIZZLED')g.cards[id].fizzled++;
     if(e.type==='MAJOR_TARGET_SELECTED')g.cards[id].targetSelections++;
     if(e.type==='SUBSIDY_RECEIVED')g.cards[id].directCashReceived+=e.data.uses;
    }
    if(e.type==='AUDIT_RECEIVED'){g.cards['audit-contractor'].directCashReceived+=e.data.amount;g.cards['audit-contractor'].netCashObserved+=e.data.amount;}
    if(e.type==='SUBSIDY_RECEIVED')g.cards['industrial-subsidy'].netCashObserved+=e.data.uses;
    if(e.type==='BUILDING_USED'){
     const b=s.buildings.find(b=>b.id===e.data.buildingId),modern=active('industry-modernization',e.playerId);
     if(modern?.suit===b.suit){const c=g.cards['industry-modernization'];if(b.suit==='commerce'){c.directCashReceived++;c.netCashObserved++;}else c.resourceOutput[b.suit==='industry'?'goods':'materials']++;}
     if(priorUsed){const c=g.cards['advanced-equipment'];c.extraUses++;c.directCashReceived+=e.data.reward.cash;c.netCashObserved+=e.data.reward.cash-e.data.cost.cash-e.data.transport.amount;for(const k of ['materials','goods']){c.resourceOutput[k]+=e.data.reward[k];c.resourceInput[k]+=e.data.cost[k];}}
     const t=e.data.transport,contract=s.next.cards.find(c=>c.id==='logistics-monopoly'&&c.owner===t.payee&&c.district===t.district&&c.status==='ACTIVE');if(contract){g.cards['logistics-monopoly'].directCashReceived+=t.amount;g.cards['logistics-monopoly'].netCashObserved+=t.amount;}
    }
    if(e.type==='CONTRIBUTE'&&active('public-works-priority',e.playerId)?.project===e.data.projectId)g.cards['public-works-priority'].priorityContributions++;
    if(e.type==='ROUTES_BLOCKED')g.cards['transport-regulation'].blockedRoutes+=s.routes.filter(r=>e.data.targets.includes(r.playerId)).length;
    if(e.type==='MAJOR_TARGET_SELECTED'){
     const c=g.cards[e.data.cardId];
     if(e.data.cardId==='business-expansion'){c.freeBuilds++;c.baseConstructionCostAvoided+=['MARKET','WORKSHOP','WAREHOUSE'].includes(e.data.district)?4:5;}
     if(e.data.cardId==='public-works-acquisition')c.transferredSlots++;
     if(e.data.cardId==='technology-royalty'){const now=s.companies.find(c=>c.playerId===e.playerId).resources;const cash=now.cash-priorResources.cash-s.events.filter(x=>x.type==='AUDIT_RECEIVED'&&x.playerId===e.playerId).reduce((n,x)=>n+x.data.amount,0);c.directCashReceived+=cash;c.netCashObserved+=cash;for(const k of ['materials','goods'])c.resourceOutput[k]+=now[k]-priorResources[k];}
    }
    if(e.type==='ROUND_SETTLED'){
     g.buildingsByRound[s.round]=(g.buildingsByRound[s.round]||0)+s.buildings.length/4;
     const sorted=Object.entries(s.companyValues).sort((a,b)=>b[1].total-a[1].total);leaders[s.round]=sorted.filter(x=>x[1].total===sorted[0][1].total).map(x=>x[0]);
    }
   }
  }
  g.rounds+=s.round;g.value+=s.result.ranking.reduce((n,x)=>n+x.value.total,0)/4;
  for(const p of s.result.winners)g.wins[s.npcPlayers[p]]+=1/s.result.winners.length;
  for(const r of [8,10])if(leaders[r]&&!s.result.winners.some(p=>leaders[r].includes(p)))g['comebacksR'+r]++;
  const values=s.result.ranking.map(x=>x.value.total);g.scoreGap+=Math.max(...values)-Math.min(...values);
  for(const p of s.publicProjects){const tally=g.projects[p.id]??={completed:0,points:0,maxOwnershipShare:0};const counts=players.map(x=>p.slots.filter(t=>t.playerId===x).length);if(p.slots.every(t=>t.playerId)){tally.completed++;tally.points+=counts.reduce((n,c)=>n+(c?2*c-1:0),0);}tally.maxOwnershipShare+=Math.max(...counts)/6;}
 }
 g.averageRounds=g.rounds/games;g.averageFinalValue=g.value/games;g.winRates=Object.fromEntries(types.map(t=>[t,g.wins[t]/games]));g.averageFinalScoreGap=g.scoreGap/games;g.cashShortagePassRate=g.cashShortagePasses/g.investmentTurns;
 for(const c of Object.values(g.cards)){c.purchaseRate=c.purchased/games;c.activationRate=c.purchased?c.activated/c.purchased:0;c.fizzleRate=c.purchased?c.fizzled/c.purchased:0;c.directCashPerPrice=c.priceSpent?c.directCashReceived/c.priceSpent:0;c.observedNetCashPerPrice=c.priceSpent?c.netCashObserved/c.priceSpent:0;}
 result.groups.push(g);if(args.output)fs.writeFileSync(args.output,JSON.stringify(result,null,2));console.log(JSON.stringify({horizon,majorInvestments,trickRule,auditor,games,averageRounds:g.averageRounds,averageFinalValue:g.averageFinalValue,illegalActions:g.illegalActions,stalls:g.stalls}));
}
result.notes=['Cash-shortage pass is a proxy: pass with cash<3; not a causal counterfactual.','Observed net cash/price excludes noncash resources and strategic interference; resource input/output, free construction savings, priority contributions, blocked routes and ownership transfer are separate metrics. Overlapping card benefits are not a causal counterfactual ROI.','NPC type wins depend on this policy and are not a proof of dominant human strategy.','Scores and ownership concentration are raw totals divided by games when analysing.'];
if(args.output)fs.writeFileSync(args.output,JSON.stringify(result,null,2));
console.log('NEXT_CORE_SIMULATION_OK '+result.groups.reduce((n,g)=>n+g.games,0)+' games');
