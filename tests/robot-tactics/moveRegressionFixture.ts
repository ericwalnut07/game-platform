import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { getRobotBattleActor, getRobotBattleUnit, decodeRobotBattleCore } from "../../src/games/robot-tactics/battleState";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { robotBattleJson, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotOfflineSave, type RobotOfflineBattle } from "../../src/games/robot-tactics/offlineSession";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import { earlyFormalProgress } from "./earlyFormalController";

export function moveRegressionFixture(missionNumber: 17 | 18) {
  const key = { missionNumber, difficulty: "easy" as const };
  const coreId = "core-c";
  const progress = applyRobotCustomization(earlyFormalProgress(key), {
    kind: "part-equip", coreId, slot: "weapon1", partId: "light-grenade-launcher",
  });
  const departure = { battleId: "move-regression-" + missionNumber, key, party: progress.party };
  let battle: RobotOfflineBattle = {
    runtimeId: robotFormalRuntime.id, runtimeVersion: robotFormalRuntime.version, departure,
    snapshot: robotFormalRuntime.create(departure), sequence: 0, committedActionIds: [], latestSummary: "",
  };
  for (let i = 0; i < 16; i++) {
    const state = decodeRobotBattleCore(battle.snapshot);
    const actor = getRobotBattleActor(state);
    if (actor.id === coreId) break;
    const action = state.units.find(u => u.id === actor.unitIds[0])?.kind === "controlled" ? "defend" : "npc";
    const result = robotFormalRuntime.act(battle.snapshot, { kind: action }, departure);
    battle = { ...battle, sequence: i + 1, snapshot: result.snapshot, latestSummary: result.summary,
      committedActionIds: [...battle.committedActionIds, "fixture-" + i] };
  }
  const state = decodeRobotBattleCore(battle.snapshot);
  if (getRobotBattleActor(state).id !== coreId) throw new Error("Expected the third controlled unit's turn");
  // In M18, moving from P10 to O7 brings an enemy depot into spread-shot range.
  const [origin, target] = missionNumber === 18 ? ["P10", "O7"] as const : ["P14", "O11"] as const;
  const units = state.units.map(u => u.id === coreId ? { ...u, position: robotCellToPosition(origin) } : u);
  const before = { ...battle, snapshot: robotBattleJson({ ...state, units }) };
  robotFormalRuntime.validate(before.snapshot, departure);
  const action = { kind: "move", destination: { ...robotCellToPosition(target) } };
  const result = robotFormalRuntime.act(before.snapshot, action, departure);
  const after = decodeRobotBattleCore(result.snapshot);
  if (getRobotBattleUnit(after, coreId).energy.action !== null) throw new Error("Movement spent the player's action");
  const projected = robotFormalBattleAdapter.project({ ...before, snapshot: result.snapshot });
  const normal = projected.choices.find(c => c.commandId.startsWith("normal:"));
  if (!normal) throw new Error("Expected a normal attack after moving");
  return { save: { ...createRobotOfflineSave(), progress, battle: before }, action, result, normal };
}
