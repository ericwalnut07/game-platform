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
const fresh=()=>({plays:0,passes:0,passesWithOptions:0,passesWithoutOptions:0,build:0,upgrade:0,route:0,projects:0,major:0,majorFizzle:0,majorFired:0,majorActivation:0,projectR1to4:0,buildR1to4:0,routeR1to4:0,buildR5to10:0,upgradeR5to10:0,buildingUses:0,buildingUsesAfterR8:0,deadRounds:0,negativeCashRounds:0,score:0,win:0,round4Buildings:0,round4Routes:0,round8Buildings:0,round8Upgrades:0,samples:0,lateRAvailable:0,midProjectDiscount:0,majorBoughtIds:{},fails:0});
const typeStats=Object.fromEntries(types.map(t=>[t,fresh()]));
let finished=0, failures=[], totalRounds=0;
for(const horizon of ['11-13','12-14'])for(const majorInvestments of [false,true])for(const trickRule of ['NORMAL','BID'])for(const auditor of [false,true])for(let g=0;g<gamesPerConfig;g++) {
 const config=hub.parseConfig({horizon,majorInvestments,trickRule,auditor});
 const seed=baseSeed+g*1987+(horizon==='12-14'?101:0)+(majorInvestments?307:0)+(trickRule==='BID'?619:0)+(auditor?1193:0);
 const rng=new SeededRandom(seed), rotation=g%4, typeById=Object.fromEntries(ids.map((id,i)=>[id,types[(i+rotation)%4]]));
 const context={matchId:'npc-economy-'+seed,config,players:ids.map(id=>({id})),rng,now:0};
 let s=hub.createInitialState(context),cursor=0,steps=0;
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
    b.plays++;owned[actor].actions++;
    if(action.type==='BUILD'){b.build++;if(s.round<=4)b.buildR1to4++;if(s.round>=5&&s.round<=10)b.buildR5to10++;}
    if(action.type==='UPGRADE'){b.upgrade++;if(s.round>=5&&s.round<=10)b.upgradeR5to10++;}
    if(action.type==='ROUTE'){b.route++;if(s.round<=4)b.routeR1to4++;}
    if(action.type==='CONTRIBUTE'){b.projects++;if(s.round<=4)b.projectR1to4++;if(action.benefit&&action.benefit!=='NONE')b.midProjectDiscount++;}
    if(action.type==='BUY_MAJOR'){b.major++;b.majorBoughtIds[action.cardId]=(b.majorBoughtIds[action.cardId]||0)+1;}
    if(action.type==='PASS_INVESTMENT'){b.passes++;if(decision.alternatives?.length)b.passesWithOptions++;else b.passesWithoutOptions++;}
   }
   if(action.type==='USE_BUILDING'){b.buildingUses++;owned[actor].buildingUses++;if(s.round>=8)b.buildingUsesAfterR8++;}
  }
  const before=s;
  s=hub.handleAction(s,action,{...context,now:steps*450});
  for(const e of s.events||[]) {
   const type=typeById[e.playerId];
   if(!type)continue;
   const b=typeStats[type];
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
  b.samples++;b.score+=s.result.ranking.find(x=>x.playerId===id).value.total;
  const top=Math.max(...s.result.ranking.map(x=>x.value.total));if(s.result.ranking.find(x=>x.playerId===id).value.total===top)b.win++;
  let usedBefore=0;for(const stat of s.roundStatistics||[]) {
   const c=stat.companies.find(x=>x.playerId===id);if(!c)continue;
   if(c.resources.cash<0)b.negativeCashRounds++;
   if(stat.round>=6&&stat.round<=s.round&&c.resources.cash<=0)b.deadRounds++;
   if(stat.round===4){b.round4Buildings+=c.lowerBuildings+c.upperBuildings;b.round4Routes+=s.roundStatistics[3]?.companies?0:0;}
   if(stat.round===8){b.round8Buildings+=c.lowerBuildings+c.upperBuildings;b.round8Upgrades+=c.upperBuildings;}
  }
  // Round 4 route count is reconstructed from settlement events only if available;
  // otherwise use the final count separately, not a misleading approximate.
 }
 }catch(e){failures.push({seed,horizon,majorInvestments,trickRule,auditor,phase:s.phase,round:s.round,error:String(e)});}
}
const result={policy:NPC_LOGIC_VERSION,gamesPerConfig,configs:16,attempted:16*gamesPerConfig,finished,failures:failures.slice(0,6),averageRounds:finished?+(totalRounds/finished).toFixed(2):null,types:{}};
for(const [k,b] of Object.entries(typeStats)){
 const s=b.samples||1,rounds=b.samples*13;
 result.types[k]={matches:b.samples,averageValue:+(b.score/s).toFixed(2),wins:b.win,passRate:+(b.passes/b.plays*100).toFixed(2),legalPasses:b.passesWithOptions,noOptionPasses:b.passesWithoutOptions,pass:b.passes,investmentTurns:b.plays,earlyBuildPerGame:+(b.buildR1to4/s).toFixed(2),earlyRoutesPerGame:+(b.routeR1to4/s).toFixed(2),earlyProjectsPerGame:+(b.projectR1to4/s).toFixed(2),midBuildPerGame:+(b.buildR5to10/s).toFixed(2),midUpgradesPerGame:+(b.upgradeR5to10/s).toFixed(2),r4Buildings:+(b.round4Buildings/s).toFixed(2),r8Buildings:+(b.round8Buildings/s).toFixed(2),r8Upgrades:+(b.round8Upgrades/s).toFixed(2),major:b.major,majorActivated:b.majorActivation,majorFizzle:b.majorFizzle,majorFired:b.majorFired,buildingUsesPerGame:+(b.buildingUses/s).toFixed(2),usesR8PlusPerGame:+(b.buildingUsesAfterR8/s).toFixed(2),negativeCashRoundRate:+(b.negativeCashRounds/(s*(totalRounds/(finished||1)))*100).toFixed(2),majorCards:b.majorBoughtIds};
}
console.log(JSON.stringify(result));
if(failures.length)process.exitCode=1;
