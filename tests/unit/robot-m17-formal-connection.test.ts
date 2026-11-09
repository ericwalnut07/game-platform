import { expect, it } from "vitest";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import { recordRobotEarlyEntry, reconcileRobotEarlyMission } from "../../src/games/robot-tactics/earlyMissions";
import { scheduleRobotFormalBattle, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import type { RobotOfflineDeparture } from "../../src/games/robot-tactics/offlineSession";

it.each(["easy","normal","hard"] as const)("M17 %s enters real battle and wins after two distinct controlled arrivals",difficulty=>{
  const key={missionNumber:17,difficulty};
  expect(getRobotStagePlan(key).blockingIssues).toEqual([]);
  const departure={battleId:"m17-"+difficulty,key,party:createRobotOfflineProgress().party} satisfies RobotOfflineDeparture;
  const state=scheduleRobotFormalBattle(createRobotFormalBattleState(departure));
  expect(state.objective.kind).toBe("early");
  robotFormalRuntime.validate(JSON.parse(JSON.stringify(state)),departure);
  const battle={departure,sequence:0,snapshot:JSON.parse(JSON.stringify(state))};
  expect(robotFormalBattleAdapter.project(battle)).toBeDefined();
  const goal=robotCellToPosition("F2");
  const first=recordRobotEarlyEntry(state,"core-a",goal);
  expect(first.objective.kind==="early"&&first.objective.state.result).toBe("ongoing");
  const second=recordRobotEarlyEntry(first,"core-b",goal);
  const finished=reconcileRobotEarlyMission(second);
  expect(finished.objective.kind==="early"&&finished.objective.state.result).toBe("won");
  expect(finished.objective.kind==="early"&&finished.objective.state.resultReason).toBe("breakthrough-complete");
});
