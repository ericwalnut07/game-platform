// Deterministic, production-core NPC comparison for formal 1.0.
// Run after npm.cmd run smoke: node tests/simulation/commercial-hub-npc-v1-economy.cjs --games=3
const { commercialHubGameModule: hub } = require(process.cwd() + '/dist-smoke/games/commercial-hub/module.js');
const { buildHubView } = require(process.cwd() + '/dist-smoke/games/commercial-hub/view.js');
const { decideNpc, NPC_LOGIC_VERSION } = require(process.cwd() + '/dist-smoke/games/commercial-hub/npc.js');
const { SeededRandom } = require(process.cwd() + '/dist-smoke/games/pon-inai/random.js');
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const gamesPerConfig=Number(args.games||3), baseSeed=Number(args.seed||54173);
const types=['standard','production','commerce','development'], ids=['a','b','c','d'];
const K=['BUILD','UPGRADE','ROUTE','CONTRIBUTE','BUY_MAJOR','PASS_INVESTMENT'];
const suits=['industry','commerce','procurement'];
const emptySuitBook=()=>Object.fromEntries(suits.map(suit=>[suit,{total:0,upgraded:0}]));
function countOwnedBuildings(target,buildings,playerId){
 for(const building of buildings) if(building.playerId===playerId){
  const counters=target[building.suit];
  if(!counters)throw Error('Unexpected building suit '+building.suit);
  counters.total++;
  if(building.upgraded)counters.upgraded++;
 }
}
const summarizeSuitBook=(book,samples)=>Object.fromEntries(suits.map(suit=>[suit,{
 avgOwned:+(book[suit].total/samples).toFixed(3),
 avgUpgraded:+(book[suit].upgraded/samples).toFixed(3),
 totalOwned:book[suit].total,totalUpgraded:book[suit].upgraded
}]));

const fresh=()=>({plays:0,passes:0,passesWithOptions:0,passesWithoutOptions:0,build:0,upgrade:0,route:0,projects:0,major:0,majorFizzle:0,majorFired:0,majorActivation:0,projectR1to4:0,buildR1to4:0,routeR1to4:0,buildR5to10:0,upgradeR5to10:0,buildingUses:0,buildingUsesOnOwnRoutes:0,procurementBuildingUses:0,industryBuildingUses:0,commerceBuildingUses:0,producedMaterials:0,producedGoods:0,freeCash:0,freeMaterials:0,freeGoods:0,freePayments:0,buildingUsesAfterR8:0,deadRounds:0,negativeCashRounds:0,score:0,win:0,completedOwnedProjectSlots:0,unfinishedOwnedProjectSlots:0,finalRoutesServingBuildings:0,finalRoutesWithoutBuildings:0,inventoryScore:0,buildingScore:0,projectScore:0,routeScore:0,finalCash:0,finalMaterials:0,finalGoods:0,terminalCashDelta:0,terminalInventoryDelta:0,terminalSamples:0,round4Buildings:0,round4Routes:0,round8Buildings:0,round8Upgrades:0,samples:0,lateRAvailable:0,midProjectDiscount:0,majorBoughtIds:{},buildingComposition:{r4:emptySuitBook(),r8:emptySuitBook(),final:emptySuitBook()},fails:0});
const typeStats=Object.fromEntries(types.map(t=>[t,fresh()]));
let finished=0, failures=[], totalRounds=0;
for(const horizon of ['11-13','12-14'])for(const majorInvestments of [false,true])for(const trickRule of ['NORMAL','BID'])for(const auditor of [false,true])for(let g=0;g<gamesPerConfig;g++) {
 const config=hub.parseConfig({horizon,majorInvestments,trickRule,auditor});
 const seed=baseSeed+g*1987+(horizon==='12-14'?101:0)+(majorInvestments?307:0)+(trickRule==='BID'?619:0)+(auditor?1193:0);
 const rng=new SeededRandom(seed), rotation=g%4, typeById=Object.fromEntries(ids.map((id,i)=>[id,types[(i+rotation)%4]]));
 const context={matchId:'npc-economy-'+seed,config,players:ids.map(id=>({id})),rng,now:0};
 let s=hub.createInitialState(context),cursor=0,steps=0,lastStatsLength=0;
 const owned=Object.fromEntries(ids.map(id=>[id,{actions:0,buildingUses:0}]));
 try {
 while(!hub.isFinished(s)&&++steps<7000){
  let action,actor=null,decision=null;
  if(['TRICK_RESULT','BID_RESULT'].includes(s.phase))action={type:'ADVANCE'};
  else for(let i=0;i<4;i++){
   const id=ids[(cursor+i)%4],view=buildHubView(s,id),choice=decideNpc(view,typeById[id]);
   if(!choice)continue;
   actor=id;decision=choice;action={...choice.action,playerId:id};cursor=(cursor+i+1)%4;break;
  }
  if(!action)throw Error('Stalled at '+s.phase+' R'+s.round);
  if(actor){
   const b=typeStats[typeById[actor]];
   if(K.includes(action.type)) {
    if(['BUILD','UPGRADE','BUY_MAJOR'].includes(action.type) && action.freePayment) { b.freePayments++;b.freeCash+=action.freePayment.cash;b.freeMaterials+=action.freePayment.materials;b.freeGoods+=action.freePayment.goods; }
    b.plays++;owned[actor].actions++;
    if(action.type==='BUILD'){b.build++;if(s.round<=4)b.buildR1to4++;if(s.round>=5&&s.round<=10)b.buildR5to10++;}
    if(action.type==='UPGRADE'){b.upgrade++;if(s.round>=5&&s.round<=10)b.upgradeR5to10++;}
    if(action.type==='ROUTE'){b.route++;if(s.round<=4)b.routeR1to4++;}
    if(action.type==='CONTRIBUTE'){b.projects++;if(s.round<=4)b.projectR1to4++;if(action.benefit&&action.benefit!=='NONE')b.midProjectDiscount++;}
    if(action.type==='BUY_MAJOR'){b.major++;b.majorBoughtIds[action.cardId]=(b.majorBoughtIds[action.cardId]||0)+1;}
    if(action.type==='PASS_INVESTMENT'){b.passes++;if(decision.alternatives?.length)b.passesWithOptions++;else b.passesWithoutOptions++;}
   }
   if(action.type==='USE_BUILDING'){
     b.buildingUses++;owned[actor].buildingUses++;
     const used=s.buildings.find(building=>building.id===action.buildingId);
     if(used&&s.routes.some(route=>route.playerId===actor&&route.district===used.district))b.buildingUsesOnOwnRoutes++;
     if(s.round>=8)b.buildingUsesAfterR8++;
   }
  }
  const before=s;
  s=hub.handleAction(s,action,{...context,now:steps*450});
  if(s.roundStatistics.length>lastStatsLength){
   for(let statIndex=lastStatsLength;statIndex<s.roundStatistics.length;statIndex++){
    const stat=s.roundStatistics[statIndex];
    const stage=stat.round===4?'r4':stat.round===8?'r8':null;
    if(stage)for(const id of ids)countOwnedBuildings(typeStats[typeById[id]].buildingComposition[stage],s.buildings,id);
   }
   lastStatsLength=s.roundStatistics.length;
  }
  for(const e of s.events||[]) {
   const type=typeById[e.playerId];
   if(!type)continue;
   const b=typeStats[type];
   if(e.type==='BUILDING_USED'){
    const building=s.buildings.find(x=>x.id===e.data.buildingId);
    if(building?.suit==='procurement')b.procurementBuildingUses++;
    if(building?.suit==='industry')b.industryBuildingUses++;
    if(building?.suit==='commerce')b.commerceBuildingUses++;
    b.producedMaterials+=e.data.reward?.materials||0;
    b.producedGoods+=e.data.reward?.goods||0;
   }
   if(e.type==='MAJOR_FIZZLED'&&e.data?.cardId!=='public-works-priority')b.majorFizzle++;
   if(e.type==='MAJOR_FIRED')b.majorFired++;
   if(e.type==='MAJOR_ACTIVATED')b.majorActivation++;
  }
  s.events=[];
 }
 if(!hub.isFinished(s))throw Error('Exceeded 7000 moves at '+s.phase);
 finished++;totalRounds+=s.round;
 for(const id of ids) {
  const b=typeStats[typeById[id]], company=s.companies.find(c=>c.playerId===id);
  b.samples++;countOwnedBuildings(b.buildingComposition.final,s.buildings,id);const ranking=s.result.ranking.find(x=>x.playerId===id);
  b.score+=ranking.value.total;b.inventoryScore+=ranking.value.inventory;b.buildingScore+=ranking.value.buildings;
  b.projectScore+=ranking.value.projects;b.routeScore+=ranking.value.routes;
  b.finalCash+=company.resources.cash;b.finalMaterials+=company.resources.materials;b.finalGoods+=company.resources.goods;
  for(const project of s.publicProjects){
    const count=project.slots.filter(slot=>slot.playerId===id).length;
    if(project.slots.every(slot=>slot.playerId))b.completedOwnedProjectSlots+=count;
    else b.unfinishedOwnedProjectSlots+=count;
  }
  for(const route of s.routes.filter(route=>route.playerId===id)){
    if(s.buildings.some(building=>building.playerId===id&&building.district===route.district))
      b.finalRoutesServingBuildings++;
    else b.finalRoutesWithoutBuildings++;
  }
  const top=Math.max(...s.result.ranking.map(x=>x.value.total));if(s.result.ranking.find(x=>x.playerId===id).value.total===top)b.win++;
  const stats=s.roundStatistics||[];
  const lastEarly=stats.filter(x=>x.round<=s.finalRound-3).at(-1)?.companies.find(x=>x.playerId===id);
  if(lastEarly){b.terminalSamples++;b.terminalCashDelta+=company.resources.cash-lastEarly.resources.cash;b.terminalInventoryDelta+=company.resources.materials+company.resources.goods-lastEarly.resources.materials-lastEarly.resources.goods}
  for(const stat of stats) {
   const c=stat.companies.find(x=>x.playerId===id);if(!c)continue;
   if(c.resources.cash<0)b.negativeCashRounds++;
   if(stat.round>=6&&stat.round<=s.round&&c.resources.cash<=0)b.deadRounds++;
   if(stat.round===4){b.round4Buildings+=c.lowerBuildings+c.upperBuildings;b.round4Routes+=c.routes;}
   if(stat.round===8){b.round8Buildings+=c.lowerBuildings+c.upperBuildings;b.round8Upgrades+=c.upperBuildings;}
  }
 }
 }catch(e){failures.push({seed,horizon,majorInvestments,trickRule,auditor,phase:s.phase,round:s.round,error:String(e)});}
}
const result={policy:NPC_LOGIC_VERSION,gamesPerConfig,configs:16,attempted:16*gamesPerConfig,finished,failures:failures.slice(0,6),averageRounds:finished?+(totalRounds/finished).toFixed(2):null,types:{}};
for(const [k,b] of Object.entries(typeStats)){
 const s=b.samples||1,rounds=b.samples*13;
 result.types[k]={matches:b.samples,buildingComposition:{r4:summarizeSuitBook(b.buildingComposition.r4,s),r8:summarizeSuitBook(b.buildingComposition.r8,s),final:summarizeSuitBook(b.buildingComposition.final,s)},averageValue:+(b.score/s).toFixed(2),wins:b.win,passRate:+(b.passes/b.plays*100).toFixed(2),legalPasses:b.passesWithOptions,noOptionPasses:b.passesWithoutOptions,pass:b.passes,investmentTurns:b.plays,earlyBuildPerGame:+(b.buildR1to4/s).toFixed(2),earlyRoutesPerGame:+(b.routeR1to4/s).toFixed(2),earlyProjectsPerGame:+(b.projectR1to4/s).toFixed(2),midBuildPerGame:+(b.buildR5to10/s).toFixed(2),midUpgradesPerGame:+(b.upgradeR5to10/s).toFixed(2),r4Buildings:+(b.round4Buildings/s).toFixed(2),r4Routes:+(b.round4Routes/s).toFixed(2),
 freeSlotsCash:b.freeCash,freeSlotsMaterials:b.freeMaterials,freeSlotsGoods:b.freeGoods,freePayments:b.freePayments,
 freeInKindRate:b.freePayments?+((b.freeMaterials+b.freeGoods)/(b.freeCash+b.freeMaterials+b.freeGoods)*100).toFixed(2):null,
 resourceBuildingUses:{procurement:b.procurementBuildingUses,industry:b.industryBuildingUses,commerce:b.commerceBuildingUses},
 producedMaterials:b.producedMaterials,producedGoods:b.producedGoods,
 completedOwnedProjectSlotsPerGame:+(b.completedOwnedProjectSlots/s).toFixed(2),
 unfinishedOwnedProjectSlotsPerGame:+(b.unfinishedOwnedProjectSlots/s).toFixed(2),
 finalRoutesServingBuildingsPerGame:+(b.finalRoutesServingBuildings/s).toFixed(2),
 finalRoutesWithoutBuildingsPerGame:+(b.finalRoutesWithoutBuildings/s).toFixed(2),
 buildingUsesOnOwnRoutesPerGame:+(b.buildingUsesOnOwnRoutes/s).toFixed(2),
 finalInventoryScore:+(b.inventoryScore/s).toFixed(2),finalBuildingScore:+(b.buildingScore/s).toFixed(2),
 finalProjectScore:+(b.projectScore/s).toFixed(2),finalRouteScore:+(b.routeScore/s).toFixed(2),
 finalResources:{cash:+(b.finalCash/s).toFixed(2),materials:+(b.finalMaterials/s).toFixed(2),goods:+(b.finalGoods/s).toFixed(2)},
 final3CashChange:b.terminalSamples?+(b.terminalCashDelta/b.terminalSamples).toFixed(2):null,
 final3InventoryChange:b.terminalSamples?+(b.terminalInventoryDelta/b.terminalSamples).toFixed(2):null,
 r8Buildings:+(b.round8Buildings/s).toFixed(2),r8Upgrades:+(b.round8Upgrades/s).toFixed(2),major:b.major,majorActivated:b.majorActivation,majorFizzle:b.majorFizzle,majorFired:b.majorFired,buildingUsesPerGame:+(b.buildingUses/s).toFixed(2),usesR8PlusPerGame:+(b.buildingUsesAfterR8/s).toFixed(2),negativeCashRoundRate:+(b.negativeCashRounds/(s*(totalRounds/(finished||1)))*100).toFixed(2),majorCards:b.majorBoughtIds};
}
console.log(JSON.stringify(result));
if(failures.length)process.exitCode=1;
