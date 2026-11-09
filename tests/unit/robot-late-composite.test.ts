import {expect,it} from "vitest";
import {getRobotStagePlan} from "../../src/games/robot-tactics/stageCatalog";
import {createRobotOfflineProgress,applyRobotOfflineOutcome,robotMissionId,robotMissionRow} from "../../src/games/robot-tactics/offlineProgress";
import {createRobotFormalBattleState} from "../../src/games/robot-tactics/stageDeployment";
import {beginRobotBattleTurn,commitRobotBattleData,decodeRobotBattleCore,robotBattleTurnId,getRobotBattleUnit} from "../../src/games/robot-tactics/battleState";
import {robotCellToPosition} from "../../src/games/robot-tactics/movement";
import {getRobotSubobjectiveAchieved,type RobotSubobjectiveEvent} from "../../src/games/robot-tactics/subobjectives";
import {finishRobotEarlyRound,recordRobotLateBossDamage,spawnRobotEarlyWave,reconcileRobotEarlyMission,robotEarlyGoalCells,robotMissionDataId,type RobotEarlyMissionState} from "../../src/games/robot-tactics/earlyMissions";
for(const missionNumber of [24,25,26,27,28,29])for(const difficulty of ["easy","normal","hard"] as const){
  it(`M${missionNumber} ${difficulty} initializes a formal battle and survives save decode`,()=>{
    const key={missionNumber,difficulty};
    const plan=getRobotStagePlan(key);
    expect(plan.objective.kind).toBe("composite");
    const state=createRobotFormalBattleState({battleId:`late-${missionNumber}-${difficulty}`,key,party:createRobotOfflineProgress().party});
    const {initiative:_initiative,...core}=state;
    const decoded=decodeRobotBattleCore(JSON.parse(JSON.stringify(core)));
    expect(decoded.objective.kind).toBe("early");
    expect(decoded.key).toEqual(key);
    if([24,27,29].includes(missionNumber))expect(robotMissionDataId(missionNumber)).toBe(`m${missionNumber}-mission-data`);
    if([25,26,28].includes(missionNumber))expect(robotEarlyGoalCells(key).length).toBeGreaterThan(0);
  });
}

for(const [missionNumber,pickup,transmit] of [[24,"M6","I13"],[27,"L3","J14"],[29,"J3","I14"]] as const){
 it(`M${missionNumber} data actions actually pick up, transmit and survive save decode`,()=>{
  const key={missionNumber,difficulty:"easy" as const};
  const created=createRobotFormalBattleState({battleId:`late-data-${missionNumber}`,key,party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=created;
  let s=decodeRobotBattleCore(core);
  s={...s,units:s.units.map(u=>u.id==="core-a"?{...u,position:robotCellToPosition(pickup)}:u)};
  s=beginRobotBattleTurn(s,"core-a");
  s=commitRobotBattleData(s,{actionId:"late-pickup",turnId:robotBattleTurnId(s),kind:"pickup"});
  expect(getRobotBattleUnit(s,"core-a").carriedObjectiveId).toBe(robotMissionDataId(missionNumber));
  expect(()=>decodeRobotBattleCore(JSON.parse(JSON.stringify(s)))).not.toThrow();
  // A new turn opens the second data action without bypassing the authoritative action cost.
  s={...s,units:s.units.map(u=>u.id==="core-a"?{...u,position:robotCellToPosition(transmit),energy:{...u.energy,turnOpen:false,action:null}}:u)};
  s=beginRobotBattleTurn({...s,turn:{...s.turn,actorId:null,actedActorIds:[]}},"core-a");
  s=commitRobotBattleData(s,{actionId:"late-transmit",turnId:robotBattleTurnId(s),kind:"transmit"});
  if(s.objective.kind!=="early")throw Error("late objective");
  expect(s.objective.state.data?.sent).toBe(true);
  expect(getRobotBattleUnit(s,"core-a").carriedObjectiveId).toBeNull();
  expect(()=>decodeRobotBattleCore(JSON.parse(JSON.stringify(s)))).not.toThrow();
 });
}

for(const missionNumber of [24,25,26,27,28,29]){
 it(`M${missionNumber} requires both compound victory conditions`,()=>{
  const key={missionNumber,difficulty:"easy" as const};
  const created=createRobotFormalBattleState({battleId:`late-win-${missionNumber}`,key,party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=created;
  let s=decodeRobotBattleCore(core);
  if(s.objective.kind!=="early")throw Error("late objective");
  const m=s.objective.state;
  const objects={...m.objects,objects:m.objects.objects.map(o=>({...o,hp:[25,29].includes(missionNumber)?0:o.hp,routeIndex:[24,26].includes(missionNumber)?o.route.length-1:o.routeIndex}))};
  const data=m.data?{...m.data,sent:true,cell:null,carrierId:null}:null;
  const arrivedIds=missionNumber===25?s.units.filter(u=>u.kind==="controlled").slice(0,2).map(u=>u.id):m.arrivedIds;
  const controlStreak=[26,28].includes(missionNumber)?2:0;
  const completedRound=missionNumber===28?12:m.objects.completedRound;
  s={...s,objective:{kind:"early",state:{...m,objects:{...objects,completedRound},data,arrivedIds,controlStreak}}};
  if(missionNumber===27)s={...s,units:s.units.map(u=>u.id==="archive-command-unit"?{...u,hp:0}:u)};
  const won=reconcileRobotEarlyMission(s);
  if(won.objective.kind!=="early")throw Error("late objective");
  expect(won.objective.state.result).toBe("won");
  // With one required condition missing, the same mission must remain ongoing.
  const incomplete={...m,objects:{...objects,completedRound},data:data as RobotEarlyMissionState["data"],arrivedIds,controlStreak};
  if([24,27,29].includes(missionNumber))incomplete.data={...data!,sent:false,cell:robotCellToPosition("A1"),carrierId:null};
  else if(missionNumber===25)incomplete.arrivedIds=[];
  else incomplete.controlStreak=0;
  const partial=reconcileRobotEarlyMission({...s,objective:{kind:"early",state:incomplete}});
  if(partial.objective.kind!=="early")throw Error("late objective");
  expect(partial.objective.state.result).toBe("ongoing");
 });
}

for(const missionNumber of [24,25,26,27,28,29]){
 it(`M${missionNumber} enforces final-round loss without complete objectives`,()=>{
  const key={missionNumber,difficulty:"easy" as const},limit=getRobotStagePlan(key).roundLimit;
  const created=createRobotFormalBattleState({battleId:`late-timeout-${missionNumber}`,key,party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=created;
  let s=decodeRobotBattleCore(core);
  if(s.objective.kind!=="early")throw Error("late objective");
  s={...s,allied:{...s.allied,round:limit},objective:{kind:"early",state:{...s.objective.state,objects:{...s.objective.state.objects,completedRound:limit-1}}}};
  const m=finishRobotEarlyRound(s);
  expect(m.result).toBe("lost");
  expect(m.resultReason).toBe("round-limit");
 });
}
for(const missionNumber of [24,26,28]){
 it(`M${missionNumber} immediately loses if its protected objective is destroyed`,()=>{
  const key={missionNumber,difficulty:"easy" as const};
  const created=createRobotFormalBattleState({battleId:`late-protect-${missionNumber}`,key,party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=created;
  let s=decodeRobotBattleCore(core);
  if(s.objective.kind!=="early")throw Error("late objective");
  const m=s.objective.state;
  s={...s,objective:{kind:"early",state:{...m,objects:{...m.objects,objects:m.objects.objects.map((o,i)=>i===0?{...o,hp:0}:o)}}}};
  const resolved=reconcileRobotEarlyMission(s);
  if(resolved.objective.kind!=="early")throw Error("late objective");
  expect(resolved.objective.state.result).toBe("lost");
  expect(resolved.objective.state.resultReason).toBe(missionNumber===28?"facility-destroyed":"transport-destroyed");
 });
}
for(const missionNumber of [25,26,27,28,29]){
 it(`M${missionNumber} reinforcement can be scheduled and spawned without duplicate waves`,()=>{
  const key={missionNumber,difficulty:"easy" as const},stage=getRobotStagePlan(key);
  const created=createRobotFormalBattleState({battleId:`late-wave-${missionNumber}`,key,party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=created;
  let s=decodeRobotBattleCore(core);
  if(s.objective.kind!=="early")throw Error("late objective");
  const m=s.objective.state;
  const wave=stage.reinforcements[0];
  expect(wave).toBeDefined();
  const due=wave!.triggerType==="round-start"?wave!.triggerRound:3;
  s={...s,objective:{kind:"early",state:{...m,waveDueRound:wave!.triggerType==="round-start"?null:due}}};
  const before=spawnRobotEarlyWave(s,Math.max(1,due!-1),[]);
  if(due!>1)expect(before.spawned).toHaveLength(0);
  const first=spawnRobotEarlyWave(s,due!,[]);
  expect(first.spawned.length).toBeGreaterThan(0);
  const after=spawnRobotEarlyWave({...s,objective:{kind:"early",state:first.state}},due!+1,[]);
  expect(after.spawned).toHaveLength(0);
 });
}

for(const missionNumber of [24,25,26,27,28,29])for(const difficulty of ["easy","normal","hard"] as const){
 it(`M${missionNumber} ${difficulty} result grants adopted EXP and first subobjective exactly once`,()=>{
  const key={missionNumber,difficulty},id=robotMissionId(key),row=robotMissionRow(key);
  const seeded=createRobotOfflineProgress();
  const cleared=Array.from({length:30},(_,i)=>i+1).flatMap(n=>["easy","normal","hard"].map(d=>`${d}-${String(n).padStart(2,"0")}`)).filter(x=>x!==id);
  const progress={...seeded,cleared,subobjectives:[]};
  const first=applyRobotOfflineOutcome(progress,key,{result:"won",endedRound:1,subobjectiveAchieved:true});
  expect(first.expGained).toBe(row.firstClear.exp+row.firstSubobjective.exp);
  expect(first.progress.cleared).toContain(id);
  expect(first.progress.subobjectives).toContain(id);
  const second=applyRobotOfflineOutcome(first.progress,key,{result:"won",endedRound:2,subobjectiveAchieved:true});
  expect(second.expGained).toBe(row.repeatClear.exp);
  expect(second.progress.subobjectives.filter(x=>x===id)).toHaveLength(1);
  const lost=applyRobotOfflineOutcome(progress,key,{result:"lost",endedRound:2,subobjectiveAchieved:false});
  expect(lost.expGained).toBe(0);expect(lost.progress.cleared).not.toContain(id);
 });
}

for(const missionNumber of [24,25,26,27,28,29])for(const difficulty of ["normal","hard"] as const){
 it(`M${missionNumber} ${difficulty} subobjective accepts authoritative receipts and rejects absent evidence`,()=>{
  const key={missionNumber,difficulty};
  const created=createRobotFormalBattleState({battleId:`late-sub-${missionNumber}-${difficulty}`,key,party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=created;
  const s=decodeRobotBattleCore(core);
  if(s.objective.kind!=="early")throw Error("late objective");
  const m=s.objective.state;
  const ids=s.units.filter(u=>u.kind==="controlled").map(u=>u.id),id=ids[0]!;
  const base=(round:number,controlledId=id,advance=0):RobotSubobjectiveEvent=>({kind:"round-end",round,bases:[{cell:"0",allied:true,controlledId},{cell:"1",allied:true,controlledId:ids[1]},{cell:"2",allied:false}],guardedIds:[],transportAdvance:advance});
  const depot=m.objects.objects[0]?.id??"depot-left";
  const events:RobotSubobjectiveEvent[]=missionNumber===24?[{...base(2),guardedIds:[depot]}]:missionNumber===25?[{kind:"damage",sourceId:id,source:"controlled",targetId:depot,target:"depot",hpRemoved:1,lethal:false}]:missionNumber===26?[base(2,id,1)]:missionNumber===27?[{kind:"damage",sourceId:id,source:"controlled",targetId:"archive-command-unit",target:"enemy",hpRemoved:1,lethal:false},{kind:"pickup"},{kind:"upload"}]:missionNumber===28?[base(11),base(12)]:[{kind:"damage",sourceId:id,source:"controlled",targetId:depot,target:"depot",hpRemoved:1,lethal:false},{kind:"pickup"},{kind:"upload"}];
  const data=m.data?{...m.data,sent:true,cell:null,carrierId:null}:null;
  const state={...s,allied:{...s.allied,round:missionNumber===28?12:3},objective:{kind:"early" as const,state:{...m,result:"won" as const,resultReason:"data-transmitted" as const,arrivedIds:[id,ids[1]!],data,lateSubobjectiveEvents:events}}};
  expect(getRobotSubobjectiveAchieved(state)).toBe(true);
  expect(getRobotSubobjectiveAchieved({...state,objective:{kind:"early",state:{...state.objective.state,lateSubobjectiveEvents:[]}}})).toBe(false);
 });
}

for(const missionNumber of [24,26,28])it(`M${missionNumber} records real round-end subobjective evidence`,()=>{
 const key={missionNumber,difficulty:"normal" as const};
 const created=createRobotFormalBattleState({battleId:`late-event-${missionNumber}`,key,party:createRobotOfflineProgress().party});
 const {initiative:_initiative,...core}=created;
 const s=decodeRobotBattleCore(core);
 if(s.objective.kind!=="early")throw Error("late objective");
 const after=finishRobotEarlyRound(s);
 const last=after.lateSubobjectiveEvents?.at(-1);
 expect(last?.kind).toBe("round-end");
 if(last?.kind==="round-end")expect(last.round).toBe(1);
});
it("M27 records actual controlled boss HP damage only before data pickup",()=>{
 const key={missionNumber:27,difficulty:"normal" as const};
 const created=createRobotFormalBattleState({battleId:"late-boss-receipt",key,party:createRobotOfflineProgress().party});
 const {initiative:_initiative,...core}=created;
 const s=decodeRobotBattleCore(core);
 const controlled=s.units.find(u=>u.kind==="controlled")!,boss=s.units.find(u=>u.id==="archive-command-unit")!;
 const events=[{sourceId:controlled.id,targetId:boss.id,attackId:"boss-test",cells:[boss.position!],damage:12,effectKind:"sniper" as const}];
 const recorded=recordRobotLateBossDamage(s,s,events);
 if(recorded.objective.kind!=="early")throw Error("late objective");
 expect(recorded.objective.state.lateSubobjectiveEvents?.some(e=>e.kind==="damage"&&e.targetId===boss.id&&e.hpRemoved===12)).toBe(true);
 const collected={...s,objective:{kind:"early" as const,state:{...recorded.objective.state,data:{cell:null,carrierId:controlled.id,sent:false,collectedRound:1}}}};
 expect(recordRobotLateBossDamage(s,collected,events)).toEqual(collected);
});
