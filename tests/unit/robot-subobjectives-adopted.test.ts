import {describe,it,expect} from "vitest";
import {getRobotSortieSubobjective,getRobotSubobjectiveAchieved as achieved} from "../../src/games/robot-tactics/subobjectives";
import {createRobotFormalBattleState,createRobotFormalReinforcement} from "../../src/games/robot-tactics/stageDeployment";
import {createRobotOfflineProgress,applyRobotOfflineOutcome} from "../../src/games/robot-tactics/offlineProgress";
import {advanceRobotBattleRound,beginRobotBattleTurn,commitRobotBattlePassive,getRobotBattlePendingActors,commitRobotBattleData,decodeRobotBattleCore,getRobotBattleUnit,robotBattleTurnId,type RobotBattleCoreState} from "../../src/games/robot-tactics/battleState";
import {finishRobotEarlyRound,reconcileRobotEarlyMission,recordRobotEarlyEntry} from "../../src/games/robot-tactics/earlyMissions";
import {settleRobotBattleConsequences} from "../../src/games/robot-tactics/battleSettlement";
import {applyRobotPhaseDamage} from "../../src/games/robot-tactics/battleEffects";
import {robotCellToPosition as cell} from "../../src/games/robot-tactics/movement";
import {getRobotStagePlan} from "../../src/games/robot-tactics/stageCatalog";
import {commitRobotBattleBatch} from "../../src/games/robot-tactics/battleBatch";
import {robotFormalRuntime,robotBattleJson} from "../../src/games/robot-tactics/formalRuntime";
import type {RobotDifficulty} from "../../src/games/robot-tactics/types";
const scene=(missionNumber:number,difficulty:RobotDifficulty="easy")=>createRobotFormalBattleState({battleId:"adopted-objective",key:{missionNumber,difficulty},party:createRobotOfflineProgress().party});
const early=(s:RobotBattleCoreState)=>{if(s.objective.kind!=="early")throw Error("early");return s.objective.state;};
function result(s:RobotBattleCoreState,value:"won"|"lost"="won"):RobotBattleCoreState {
 const o=s.objective;
 switch(o.kind){
  case "m02":return{...s,objective:{...o,result:value}};
  case "m01":return{...s,objective:{kind:o.kind,state:{...o.state,result:value}}};
  case "early":return{...s,objective:{kind:o.kind,state:{...o.state,result:value}}};
  case "m30":return{...s,objective:{kind:o.kind,state:{...o.state,result:value}}};
 }
}
const history=(s:RobotBattleCoreState)=>early(s).subobjectiveHistory!;
const withHistory=(s:RobotBattleCoreState,h:Partial<ReturnType<typeof history>>):RobotBattleCoreState=>({...s,objective:{kind:"early",state:{...early(s),subobjectiveHistory:{...history(s),...h}}}});
const withHp=(s:RobotBattleCoreState,hp:number):RobotBattleCoreState=>{
 const o=s.objective;
 if(o.kind==="m01")return{...s,objective:{kind:o.kind,state:{...o.state,objects:{...o.state.objects,objects:o.state.objects.objects.map((v,i)=>i?v:{...v,hp})}}}};
 if(o.kind==="early")return{...s,objective:{kind:o.kind,state:{...o.state,objects:{...o.state.objects,objects:o.state.objects.objects.map((v,i)=>i?v:{...v,hp})}}}};
 throw Error("objects");
};
describe("all 21 adopted victory predicates",()=>{
 for(const m of [1,2,3,4,5,6,7])for(const difficulty of ["easy","normal","hard"] as const)it(`M0${m} ${difficulty}: exact boundary, failure and victory gate`,()=>{
  let s=result(scene(m,difficulty)),bad=s;
  if(difficulty==="easy"&&[1,2,3,7].includes(m)){s={...s,sortieSubobjectiveEligible:true};bad={...s,sortieSubobjectiveEligible:false};}
  else if(m===1||m===5&&difficulty==="easy"){const ratio=m===1?.4:.5;const o=(s.objective.kind==="m01"||s.objective.kind==="early"?s.objective.state.objects.objects[0]!:null)!;const min=Math.ceil(o.maxHp*ratio);s=withHp(s,min);bad=withHp(s,min-1);if(m===5)expect(min).toBe(110);}
  else if(m===4&&difficulty==="easy"){s=withHistory(s,{depotDamageSources:{"depot-left":["core-a"],"depot-right":["core-b"]}});bad=withHistory(s,{depotDamageSources:{"depot-left":["core-a"],"depot-right":["core-a"]}});}
  else if(m===6&&difficulty==="easy"){s=withHistory(s,{centralBaseOccupied:true});bad=withHistory(s,{centralBaseOccupied:false});}
  else if(m===7){s={...s,objective:{kind:"early",state:{...early(s),data:{cell:null,carrierId:null,collectedRound:1,sent:true}}}};bad=withHistory(s,{dataDropped:true});}
  else if(m===2){s={...s,allied:{...s.allied,round:7}};bad={...s,allied:{...s.allied,round:8}};}
  else if(m===3){
   s={...s,objective:{kind:"early",state:{...early(s),arrivedIds:["core-a","core-b"]}}};
   s=withHistory(s,{preCrossDamageIds:["core-b"]});
   bad=withHistory(s,{preCrossDamageIds:["core-c"]});
  }
  else if(m===4){
   s=withHistory(s,{depotDamageSources:{"depot-left":["core-a"],"depot-right":["core-a"]},depotFinalBlows:{"depot-right":"core-a"}});
   bad=withHistory(s,{depotFinalBlows:{}});
  }
  else if(m===5){s=withHistory(s,{lastTransportGuardRound:4});bad=withHistory(s,{lastTransportGuardRound:3});}
  else if(m===6){
   s={...s,objective:{kind:"early",state:{...early(s),objects:{...early(s).objects,completedRound:1},controlOwners:["allied","allied","neutral"]}}};
   bad=s;
   s={...s,units:s.units.map(u=>u.id==="core-a"?{...u,position:cell("I5")}:u)};
  }
  expect(achieved(s)).toBe(true);expect(achieved(bad)).toBe(false);expect(achieved(result(s,"lost"))).toBe(false);
 });
});
it("evaluates all six equipped slots, ignores duplicates/ownership/AI, supports both mobile groups",()=>{
 const party=createRobotOfflineProgress().party;
 const equip=(ids:string[])=>party.map((u,i)=>({...u,basic:{...u.basic,weapon1:{partId:ids[i*2]??"light-blade",level:1},weapon2:{partId:ids[i*2+1]??"light-blade",level:1}}}));
 for(const [m,ids] of [[1,["light-blade","assault-rifle","sniper-rifle"]],[2,["light-lance","heavy-hammer"]],[3,["assault-rifle","sniper-rifle","light-grenade-launcher"]]] as const){expect(getRobotSortieSubobjective(m,equip([...ids]))).toBe(true);expect(getRobotSortieSubobjective(m,equip([ids[0],ids[0]]))).toBe(false);}
 for(const frameId of ["mobile-1","mobile-2"])expect(getRobotSortieSubobjective(7,party.map((u,i)=>i?u:{...u,frameId}))).toBe(true);
 expect(getRobotSortieSubobjective(7,party)).toBe(false);expect(getRobotSortieSubobjective(1,party.slice(0,2))).toBe(false);
});
it("freezes departure eligibility, validates against original build, retains legacy save identity",()=>{
 const d={battleId:"sortie",key:{missionNumber:1,difficulty:"easy" as const},party:createRobotOfflineProgress().party},s=createRobotFormalBattleState(d);
 expect(()=>robotFormalRuntime.validate(robotBattleJson({...s,sortieSubobjectiveEligible:!s.sortieSubobjectiveEligible}),d)).toThrow("Sortie");
 const {sortieSubobjectiveEligible:_old,...legacy}=s;expect(()=>robotFormalRuntime.validate(robotBattleJson(legacy),d)).not.toThrow();expect(achieved(result(legacy))).toBe(false);
});
it("M04 records positive real HP damage by distinct controlled IDs only; receipts and reload preserve attribution",()=>{
 let s=scene(4),objects=early(s).objects.objects;
 const hit=(sourceId:string,objectIndex:number,damage:number,id:string)=>{s=reconcileRobotEarlyMission({...s,attackIds:[...new Set([...s.attackIds,id])]},[{attackId:id,sourceId,hitCells:objects[objectIndex]!.cells,damage}]);};
 hit("friendly-1",0,1,"ai");hit("core-a",0,0,"zero");expect(history(s).depotDamageSources["depot-left"]).toEqual([]);
 hit("core-a",0,1,"left");hit("core-a",0,1,"left");expect(history(s).depotDamageSources["depot-left"]).toEqual(["core-a"]);expect(early(s).objects.objects[0]!.hp).toBe(objects[0]!.hp-2);
 s=decodeRobotBattleCore(robotBattleJson(s));hit("core-a",1,1,"right-same");expect(achieved(result(s))).toBe(false);hit("core-b",1,1,"right-other");expect(achieved(result(s))).toBe(true);
 s=reconcileRobotEarlyMission({...s,attackIds:[...s.attackIds,"kill","overkill"]},[{attackId:"kill",sourceId:"core-a",hitCells:objects[0]!.cells,damage:9999},{attackId:"overkill",sourceId:"core-c",hitCells:objects[0]!.cells,damage:9999}]);expect(history(s).depotDamageSources["depot-left"]).toEqual(["core-a"]);
});
it("M06 latches only controlled I5 occupation at completed round-end, including final winning round",()=>{
 let s=scene(6);const put=(id:string)=>({...s,units:s.units.map(u=>u.id===id?{...u,position:cell("I5")}:u)});
 const ai=put("friendly-1");expect(history({...ai,objective:{kind:"early",state:finishRobotEarlyRound(ai)}}).centralBaseOccupied).toBe(false);
 s=put("core-a");expect(history(s).centralBaseOccupied).toBe(false);s={...s,objective:{kind:"early",state:finishRobotEarlyRound(s)}};expect(history(s).centralBaseOccupied).toBe(true);
 s={...s,units:s.units.map(u=>u.id==="core-a"?{...u,position:cell("H14")}:u)};expect(history(s).centralBaseOccupied).toBe(true);
});
it("M07 carrier death latches drop across reload, re-pickup and respawn; fresh retry resets it",()=>{
 const original=scene(7,"normal"),{initiative:_i,...noQueue}=original;let s=beginRobotBattleTurn({...noQueue,units:original.units.map(u=>u.id==="core-a"?{...u,position:cell("J3")}:u)},"core-a");
 s=commitRobotBattleData(s,{actionId:"pickup",turnId:robotBattleTurnId(s),kind:"pickup"});
 const hit=applyRobotPhaseDamage(s,"heavy-guardian","core-a",getRobotBattleUnit(s,"core-a").hp,"kill-carrier","blunt");s=settleRobotBattleConsequences(s,hit.state.units,[],hit.state);expect(history(s).dataDropped).toBe(true);s=decodeRobotBattleCore(s);expect(history(s).dataDropped).toBe(true);
 const sent=result({...s,objective:{kind:"early",state:{...early(s),data:{cell:null,carrierId:null,collectedRound:1,sent:true}}}});expect(achieved(sent)).toBe(false);expect(history(scene(7,"normal")).dataDropped).toBe(false);
 const {subobjectiveHistory:_h,...legacy}=early(sent);expect(achieved({...sent,objective:{kind:"early",state:legacy}})).toBe(false);
});
it("keeps existing first-subobjective EXP/addon and applies each exactly once",()=>{
 let p=createRobotOfflineProgress();const key={missionNumber:1,difficulty:"normal" as const},win={result:"won" as const,endedRound:5,subobjectiveAchieved:true};
 p=applyRobotOfflineOutcome(p,{missionNumber:1,difficulty:"easy"},{...win,subobjectiveAchieved:false}).progress;
 const a=applyRobotOfflineOutcome(p,key,win),b=applyRobotOfflineOutcome(a.progress,key,win);expect(a.progress.subobjectives).toEqual(["normal-01"]);expect(b.progress.subobjectives).toEqual(a.progress.subobjectives);expect(b.expGained).toBeLessThan(a.expGained);expect(()=>applyRobotOfflineOutcome(p,key,{...win,result:"lost"})).toThrow();
});

it("M03 credits an actual committed hit before its actor crosses, including resume and replay", () => {
 const {initiative: _queue, ...fresh} = scene(3, "normal");
 const enemy = fresh.units.find(u => u.kind === "light")!;
 const begin = (s: RobotBattleCoreState) => beginRobotBattleTurn(s, "core-a");
 const commit = (s: RobotBattleCoreState, turnId: string) => commitRobotBattleBatch(s, {
  actionId: "damage-before-cross", turnId, summary: "攻撃",
  members: [{unitId: "core-a", action: {kind: "normal-attack", energyCost: 0}}],
  attacks: [{id: "hit", sourceId: "core-a", effectKind: "slash",
    targets: [{entityId: enemy.id, cells: [enemy.position!], resolution: {damage: 1, damageBeforeMinimum: 1, reason: "hit"}}]}],
 });
 const turn = begin(fresh), turnId = robotBattleTurnId(turn);
 const saved = decodeRobotBattleCore(commit(turn, turnId));
 expect(history(saved).preCrossDamageIds).toEqual(["core-a"]);
 expect(commit(saved, turnId)).toBe(saved);
 const finish = (s: RobotBattleCoreState) => reconcileRobotEarlyMission(recordRobotEarlyEntry(s, "core-b", cell("L2")));
 expect(achieved(finish(recordRobotEarlyEntry(saved, "core-a", cell("F2"))))).toBe(true);

 const crossed = recordRobotEarlyEntry(fresh, "core-a", cell("F2"));
 const later = begin(crossed);
 expect(achieved(finish(commit(later, robotBattleTurnId(later))))).toBe(false);
 const legacyHistory = history(fresh);
 const {preCrossDamageIds: _receipt, ...old} = legacyHistory;
 const legacy = decodeRobotBattleCore({...fresh, objective:{kind:"early",state:{...early(fresh),subobjectiveHistory:old}}});
 expect(history(legacy).preCrossDamageIds).toBeUndefined();
 expect(history(scene(3, "normal")).preCrossDamageIds).toEqual([]);
});

it("M04 Normal needs two controlled hits and one controlled final blow; reload and overkill cannot change credit", () => {
 const initial = scene(4, "normal"), objects = early(initial).objects.objects;
 const damage = (s: RobotBattleCoreState, id: string, index: number, sourceId: string, amount: number) =>
  reconcileRobotEarlyMission({...s,attackIds:[...new Set([...s.attackIds,id])]},[
   {attackId:id,sourceId,hitCells:objects[index]!.cells,damage:amount},
  ]);
 const chipped = damage(damage(initial,"left-chip",0,"core-a",1),"right-chip",1,"core-a",1);
 const left = decodeRobotBattleCore(damage(chipped,"left-death",0,"friendly-1",999));
 expect(achieved(damage(left,"right-death",1,"friendly-1",999))).toBe(false);
 const won = decodeRobotBattleCore(damage(left,"right-death",1,"core-a",999));
 expect(achieved(won)).toBe(true);
 expect(history(won).depotFinalBlows).toEqual({"depot-right":"core-a"});
 expect(history(damage(won,"right-death",1,"core-b",999)).depotFinalBlows).toEqual({"depot-right":"core-a"});
});

it("M05 records only a living controlled guard next to the convoy after its R4 advance", () => {
 const {initiative: _queue, ...initial} = scene(5, "normal");
 const put = (s: RobotBattleCoreState,id:string,c:string) =>
  ({...s,units:s.units.map(u=>u.id===id?{...u,position:cell(c)}:u)});
 function nextRound(s: RobotBattleCoreState) {
  while (getRobotBattlePendingActors(s).length) {
   s = beginRobotBattleTurn(s,getRobotBattlePendingActors(s)[0]!.id);
   s = commitRobotBattlePassive(s,{kind:"wait",actionId:"wait-"+s.actionIds.length,turnId:robotBattleTurnId(s)});
  }
  return advanceRobotBattleRound(s,w=>createRobotFormalReinforcement(getRobotStagePlan(s.key),w));
 }
 let s: RobotBattleCoreState = put(put(initial,"route-assault:3","P8"),"core-a","I10");
 for(let r=1;r<=3;r++) s=nextRound(s);
 expect(early(s).objects.objects[0]!.cells).toEqual([cell("J9")]);
 expect(history(s).lastTransportGuardRound).toBe(3);
 const oldCellOnly = nextRound(put(s,"core-a","I10"));
 expect(history(oldCellOnly).lastTransportGuardRound).toBe(3);
 const guard = decodeRobotBattleCore(nextRound(put(s,"core-a","I7")));
 expect(early(guard).objects.objects[0]!.cells).toEqual([cell("J8")]);
 expect(history(guard).lastTransportGuardRound).toBe(4);
 expect(history(scene(5,"normal")).lastTransportGuardRound).toBeNull();
});
