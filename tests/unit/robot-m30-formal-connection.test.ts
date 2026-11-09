import { expect, it } from "vitest";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { getRobotBattleActor, getRobotBattleUnit, decodeRobotBattleCore } from "../../src/games/robot-tactics/battleState";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import type { RobotOfflineDeparture } from "../../src/games/robot-tactics/offlineSession";

it.each(["easy", "normal", "hard"] as const)("connects adopted M30 %s to the real battle and player view", difficulty => {
  const plan = getRobotStagePlan({missionNumber:30,difficulty});
  expect(plan.blockingIssues).toEqual([]);
  const departure = {battleId:"m30-runtime-"+difficulty,key:{missionNumber:30,difficulty},party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
  const state = createRobotFormalBattleState(departure);
  expect(state.objective.kind).toBe("m30");
  expect(state.units.some(u=>u.kind==="boss" && u.id==="enemy-supreme-commander")).toBe(true);
  const snapshot = JSON.parse(JSON.stringify(state));
  robotFormalRuntime.validate(snapshot,departure);
  const decoded = decodeRobotBattleCore(snapshot);
  expect(getRobotBattleActor(decoded).unitIds.length).toBeGreaterThan(0);
  const view = robotFormalBattleAdapter.project({departure,sequence:0,snapshot});
  expect(view).toBeDefined();
});
