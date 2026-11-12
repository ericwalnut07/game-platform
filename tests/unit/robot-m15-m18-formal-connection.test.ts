import { expect, it } from "vitest";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { reconcileRobotEarlyMission } from "../../src/games/robot-tactics/earlyMissions";
import { scheduleRobotFormalBattle, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { commitRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { commitRobotBattleDefend, getRobotBattleActor, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import type { RobotOfflineDeparture } from "../../src/games/robot-tactics/offlineSession";

it.each(["easy", "normal", "hard"] as const)("M15 %s east-flank heavy hits the facility in round one", difficulty => {
  const departure = { battleId: "m15-heavy-" + difficulty, key: { missionNumber: 15, difficulty }, party: createRobotOfflineProgress().party };
  const id = "center-heavy-assault";
  let state = scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
  expect(getRobotBattleUnit(state, id).position).toEqual(robotCellToPosition("N11"));

  for (let i = 0; i < state.actors.length; i++) {
    const actor = getRobotBattleActor(state);
    const unit = getRobotBattleUnit(state, actor.unitIds[0]!);
    const input = { actionId: "m15-heavy:" + i, turnId: robotBattleTurnId(state) };
    expect(state.allied.round).toBe(1);
    state = unit.kind === "controlled" ? commitRobotBattleDefend(state, input) : commitRobotNpcTurn(state, input);
    if (actor.id === id) {
      expect(state.latest?.damage.some(hit =>
        hit.sourceId === id && hit.targetId === "uplink-facility" && (hit.damage ?? 0) > 0)).toBe(true);
      return;
    }
    state = scheduleRobotFormalBattle(state);
  }
  throw new Error("The heavy unit did not act in round one");
});

it.each(["easy","normal","hard"] as const)("M15 %s creates facility defense with canonical HP and loses when destroyed",difficulty=>{
 const key={missionNumber:15,difficulty},stage=getRobotStagePlan(key);
 expect(stage.blockingIssues).toEqual([]);
 const departure={battleId:"m15-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
 const s=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
 expect(s.objective.kind).toBe("early");
 robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)),departure);
 expect(robotFormalBattleAdapter.project({runtimeId:"robot-tactics-formal-m01",runtimeVersion:1,committedActionIds:[],latestSummary:"",departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
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
 expect(robotFormalBattleAdapter.project({runtimeId:"robot-tactics-formal-m01",runtimeVersion:1,committedActionIds:[],latestSummary:"",departure,sequence:0,snapshot:JSON.parse(JSON.stringify(s))})).toBeDefined();
 if(s.objective.kind!=="early")throw Error("Expected early objective");
 expect(s.objective.state.objects.objects).toHaveLength(2);
 expect(s.objective.state.objects.objects.map(o=>o.maxHp)).toEqual(Array(2).fill(({easy:190,normal:260,hard:340} as const)[difficulty]));
 const damaged={...s,objective:{kind:"early" as const,state:{...s.objective.state,objects:{...s.objective.state.objects,objects:s.objective.state.objects.objects.map(o=>({...o,hp:0}))}}}};
 const resolved=reconcileRobotEarlyMission(damaged);
 expect(resolved.objective.kind==="early"&&resolved.objective.state.resultReason).toBe("depots-destroyed");
});
