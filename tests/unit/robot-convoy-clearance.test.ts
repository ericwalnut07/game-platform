import { expect, it } from "vitest";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { commitRobotNpcTurn, planRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { beginRobotBattleTurn, getRobotBattleLegalMoves, getRobotBattleUnit, robotBattleTurnId, sameRobotCoreCell } from "../../src/games/robot-tactics/battleState";
import { finishRobotEarlyRound } from "../../src/games/robot-tactics/earlyMissions";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";

const scene = (missionNumber: number) => createRobotFormalBattleState({
  battleId: "escort-" + missionNumber, key: { missionNumber, difficulty: "easy" }, party: createRobotOfflineProgress().party,
});

it.each([5, 12, 19, 24, 26])("M%i displays the route and friendly AI vacates the next cell before round end", mission => {
  const { initiative: _initiative, ...base } = scene(mission);
  if (base.objective.kind !== "early") throw new Error("Expected escort objective");
  const convoy = base.objective.state.objects.objects.find(o => o.kind === "transport")!;
  const next = convoy.route[1]!, friend = base.units.find(u => u.kind === "friendly-ai")!;
  expect(projectRobotBattleCore(base, { battleId: base.id, sequence: 0 }).convoyRoute).toEqual({ cells: convoy.route, index: 0 });
  const units = base.units.map(u => u.id === friend.id ? { ...u, position: next } :
    u.position && sameRobotCoreCell(u.position, next) ? { ...u, position: friend.position } : u);
  for (const mode of ["auto", "manual"] as const) {
    const blocked = beginRobotBattleTurn({ ...base, units, ai: { ...base.ai, mode,
      instructions: mode === "manual" ? { ...base.ai.instructions, [friend.id]: { tacticId: "defend-location", cell: next } } : base.ai.instructions } }, friend.id);
    expect(finishRobotEarlyRound(blocked).objects.objects[0]!.routeIndex).toBe(0);
    const legal = getRobotBattleLegalMoves(blocked, friend.id);
    const ordinaryDestination = getRobotBattleUnit(planRobotNpcTurn(blocked).stateAfterMoves, friend.id).position!;
    expect(legal.some(move => sameRobotCoreCell(move.destination, ordinaryDestination))).toBe(true);
    const after = commitRobotNpcTurn(blocked, { actionId: "clear", turnId: robotBattleTurnId(blocked) });
    const destination = getRobotBattleUnit(after, friend.id).position!;
    expect(convoy.route.slice(1).some(cell => sameRobotCoreCell(cell, destination))).toBe(false);
    expect(finishRobotEarlyRound(after).objects.objects[0]!.cells).toEqual([next]);
  }
});

it("M19 wins when its live convoy reaches the adopted endpoint at round end", () => {
  const base = scene(19);
  if (base.objective.kind !== "early") throw new Error("Expected escort objective");
  const state = base.objective.state, convoy = state.objects.objects[0]!;
  const routeIndex = convoy.route.length - 2, round = routeIndex + 1, goal = convoy.route.at(-1)!;
  expect(base.units.some(u => u.position && sameRobotCoreCell(u.position, goal))).toBe(false);
  const finished = finishRobotEarlyRound({ ...base, allied: { ...base.allied, round },
    objective: { kind: "early", state: { ...state, objects: { ...state.objects, completedRound: round - 1,
      objects: [{ ...convoy, cells: [convoy.route[routeIndex]!], routeIndex }] } } } });
  expect(finished).toMatchObject({ result: "won", resultReason: "transport-arrived", objects: { objects: [{ cells: [goal] }] } });
});
