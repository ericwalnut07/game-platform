import { expect, it } from "vitest";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { reconcileRobotEarlyMission } from "../../src/games/robot-tactics/earlyMissions";
import { scheduleRobotFormalBattle, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import type { RobotOfflineDeparture } from "../../src/games/robot-tactics/offlineSession";

it.each(["easy","normal","hard"] as const)("M16 %s starts formal combat and wins on boss defeat",difficulty=>{
 const key={missionNumber:16,difficulty};
 expect(getRobotStagePlan(key).blockingIssues).toEqual([]);
 const departure={battleId:"m16-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const state=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 expect(state.objective.kind).toBe("early");
 const boss=state.units.find(u=>u.kind==="boss");
 expect(boss?.id).toBe("command-walker");
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(state)),departure);
 expect(robotFormalBattleAdapter.project({departure,sequence:0,snapshot:JSON.parse(JSON.stringify(state))})).toBeDefined();
 const defeated={...state,units:state.units.map(u=>u.id==="command-walker"?{...u,hp:0,position:null}:u)};
 const resolved=reconcileRobotEarlyMission(defeated);
 expect(resolved.objective.kind==="early"&&resolved.objective.state.result).toBe("won");
 expect(resolved.objective.kind==="early"&&resolved.objective.state.resultReason).toBe("boss-defeated");
});
