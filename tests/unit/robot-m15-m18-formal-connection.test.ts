import { expect, it } from "vitest";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { reconcileRobotEarlyMission, finishRobotEarlyRound } from "../../src/games/robot-tactics/earlyMissions";
import { scheduleRobotFormalBattle, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import type { RobotOfflineDeparture } from "../../src/games/robot-tactics/offlineSession";

it.each(["easy","normal","hard"] as const)("M15 %s creates facility defense with canonical HP and loses when destroyed",difficulty=>{
 const key={missionNumber:15,difficulty},stage=getRobotStagePlan(key);
 expect(stage.blockingIssues).toEqual([]);
 const departure={battleId:"m15-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const s=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 expect(s.objective.kind).toBe("early");
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)),departure);
 expect(robotFormalBattleAdapter.project({departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
 if(s.objective.kind!=="early")throw Error("Expected early objective");
 expect(s.objective.state.objects.objects[0]?.maxHp).toBe(({easy:320,normal:430,hard:550} as const)[difficulty]);
 const damaged={...s,objective:{kind:"early" as const,state:{...s.objective.state,objects:{...s.objective.state.objects,objects:s.objective.state.objects.objects.map(o=>({...o,hp:0}))}}}};
 const resolved=reconcileRobotEarlyMission(damaged);
 expect(resolved.objective.kind==="early"&&resolved.objective.state.resultReason).toBe("facility-destroyed");
});
it.each(["easy","normal","hard"] as const)("M18 %s creates two independent depot HP pools and wins after both destroyed",difficulty=>{
 const key={missionNumber:18,difficulty},stage=getRobotStagePlan(key);
 expect(stage.blockingIssues).toEqual([]);
 const departure={battleId:"m18-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const s=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)),departure);
 expect(robotFormalBattleAdapter.project({departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
 if(s.objective.kind!=="early")throw Error("Expected early objective");
 expect(s.objective.state.objects.objects).toHaveLength(2);
 expect(s.objective.state.objects.objects.map(o=>o.maxHp)).toEqual(Array(2).fill(({easy:190,normal:260,hard:340} as const)[difficulty]));
 const damaged={...s,objective:{kind:"early" as const,state:{...s.objective.state,objects:{...s.objective.state.objects,objects:s.objective.state.objects.objects.map(o=>({...o,hp:0}))}}}};
 const resolved=reconcileRobotEarlyMission(damaged);
 expect(resolved.objective.kind==="early"&&resolved.objective.state.resultReason).toBe("depots-destroyed");
});
