import {expect,it} from "vitest";
import {getRobotStagePlan} from "../../src/games/robot-tactics/stageCatalog";
import {createRobotOfflineProgress} from "../../src/games/robot-tactics/offlineProgress";
import {createRobotFormalBattleState} from "../../src/games/robot-tactics/stageDeployment";
import {beginRobotBattleTurn,commitRobotBattleData,decodeRobotBattleCore,robotBattleTurnId,getRobotBattleUnit} from "../../src/games/robot-tactics/battleState";
import {robotCellToPosition} from "../../src/games/robot-tactics/movement";
import {robotEarlyGoalCells,robotMissionDataId} from "../../src/games/robot-tactics/earlyMissions";
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
  s={...s,units:s.units.map(u=>u.id==="core-a"?{...u,position:robotCellToPosition(transmit),energy:{...u.energy,turnOpen:true,action:null}}:u)};
  s=beginRobotBattleTurn({...s,turn:{...s.turn,actorId:null,actedActorIds:[]}},"core-a");
  s=commitRobotBattleData(s,{actionId:"late-transmit",turnId:robotBattleTurnId(s),kind:"transmit"});
  if(s.objective.kind!=="early")throw Error("late objective");
  expect(s.objective.state.data?.sent).toBe(true);
  expect(getRobotBattleUnit(s,"core-a").carriedObjectiveId).toBeNull();
  expect(()=>decodeRobotBattleCore(JSON.parse(JSON.stringify(s)))).not.toThrow();
 });
}
