import {expect,it} from "vitest";
import {createRobotOfflineProgress} from "../../src/games/robot-tactics/offlineProgress";
import {createRobotFormalBattleState} from "../../src/games/robot-tactics/stageDeployment";
import {getRobotStagePlan} from "../../src/games/robot-tactics/stageCatalog";
import {reconcileRobotEarlyMission} from "../../src/games/robot-tactics/earlyMissions";
import {scheduleRobotFormalBattle,robotFormalRuntime} from "../../src/games/robot-tactics/formalRuntime";
import {robotFormalBattleAdapter} from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import type {RobotOfflineDeparture} from "../../src/games/robot-tactics/offlineSession";

it.each(["easy","normal","hard"] as const)("M19 %s connects convoy route and HP",difficulty=>{
 const key={missionNumber:19,difficulty},plan=getRobotStagePlan(key);
 expect(plan.blockingIssues).toEqual([]);
 const departure={battleId:"m19-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const s=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)),departure);
 expect(robotFormalBattleAdapter.project({departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
 if(s.objective.kind!=="early")throw Error("M19 objective missing");
 const convoy=s.objective.state.objects.objects[0]!;
 expect(convoy.kind).toBe("transport");
 expect(convoy.route).toHaveLength(10);
 expect(convoy.maxHp).toBe(({easy:340,normal:450,hard:580} as const)[difficulty]);
 const damaged={...s,objective:{kind:"early" as const,state:{...s.objective.state,objects:{...s.objective.state.objects,objects:[{...convoy,hp:0}]}}}};
 const resolved=reconcileRobotEarlyMission(damaged);
 expect(resolved.objective.kind==="early"&&resolved.objective.state.resultReason).toBe("transport-destroyed");
});
it.each(["easy","normal","hard"] as const)("M20 %s connects three control cells and streak",difficulty=>{
 const key={missionNumber:20,difficulty},plan=getRobotStagePlan(key);
 expect(plan.blockingIssues).toEqual([]);
 const departure={battleId:"m20-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const s=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)),departure);
 expect(robotFormalBattleAdapter.project({departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
 if(s.objective.kind!=="early")throw Error("M20 objective missing");
 expect(s.objective.state.controlOwners).toEqual(["neutral","neutral","neutral"]);
 const held={...s,objective:{kind:"early" as const,state:{...s.objective.state,controlOwners:["allied","allied","neutral"] as const,controlStreak:2}}};
 const resolved=reconcileRobotEarlyMission(held);
 expect(resolved.objective.kind==="early"&&resolved.objective.state.resultReason).toBe("bases-controlled");
});
