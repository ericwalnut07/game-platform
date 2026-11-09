import {expect,it} from "vitest";
import {getRobotStagePlan} from "../../src/games/robot-tactics/stageCatalog";
import {createRobotOfflineProgress} from "../../src/games/robot-tactics/offlineProgress";
import {createRobotFormalBattleState} from "../../src/games/robot-tactics/stageDeployment";
import {decodeRobotBattleCore} from "../../src/games/robot-tactics/battleState";
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
