import { createRobotAlliedLifecycle } from "./alliedLifecycle";
import { makeRobotBattleUnit, recordRobotBattleAction, robotBattleAlliedLedger, robotBattleIsAlly, robotBattleLifeUnit, type RobotBattleCoreState } from "./battleState";
import { createRobotRoundInitiative } from "./initiative";
import { getRobotM30GiantProfile, getRobotM30GiantWalls, ROBOT_M30_GIANT_ID, ROBOT_M30_GIANT_LANDING, ROBOT_M30_GIANT_SECOND_ACTOR } from "./m30Giant";
import { getRobotM30EliminationPlan } from "./m30Elimination";
import { robotCellToPosition } from "./movement";

export function enterRobotM30GiantPhase(s: RobotBattleCoreState): RobotBattleCoreState {
  if (!s.expansionDifficulty || s.objective.kind !== "m30-elimination" ||
    s.objective.state.result !== "won" || s.turn.actorId !== null) throw new Error("The M30 first phase has not cleared");
  const stage = getRobotM30EliminationPlan(s.key);
  const allies = s.units.filter(robotBattleIsAlly).map(u => {
    const cell = u.kind === "controlled" ? stage.players[u.number! - 1]! : stage.friendlyAI[u.number! - 1]!.cell;
    const restored = makeRobotBattleUnit({
      id: u.id, name: u.name, kind: u.kind, number: u.number, squadId: u.squadId, chassis: u.chassis,
      maxHp: u.maxHp, maxEn: u.energy.maxEn, position: robotCellToPosition(cell), stats: u.stats,
      movement: u.movement, parts: u.parts, ...(u.coreLevel === undefined ? {} : { coreLevel: u.coreLevel }),
      ...(u.addons === undefined ? {} : { addons: u.addons }),
    });
    return { ...restored, energy: { ...restored.energy, en: restored.energy.maxEn } };
  });
  const profile = getRobotM30GiantProfile(s.expansionDifficulty);
  const giant = makeRobotBattleUnit({
    id: ROBOT_M30_GIANT_ID, name: "巨大ボス", kind: "heavy", number: null, squadId: null, chassis: null,
    maxHp: profile.hp, maxEn: 0, position: ROBOT_M30_GIANT_LANDING, movement: { mov: profile.mov, types: ["omni"], facing: "south" },
    stats: { melee: 0, ranged: 0, spd: profile.spd, def: profile.def, mov: profile.mov }, parts: [],
  });
  const next: RobotBattleCoreState = {
    version: s.version, id: s.id, key: s.key, expansionDifficulty: s.expansionDifficulty,
    board: { ...s.board, walls: getRobotM30GiantWalls(s.board.walls) }, respawnPriority: s.respawnPriority,
    units: [...allies, giant], actors: [
      ...[...allies, giant].map(u => ({ id: u.id, unitIds: [u.id] })),
      { id: ROBOT_M30_GIANT_SECOND_ACTOR, unitIds: [giant.id] },
    ],
    allied: robotBattleAlliedLedger(createRobotAlliedLifecycle(allies.map(robotBattleLifeUnit))),
    objective: { kind: "m30-giant", state: { firstPhaseRound: s.allied.round, result: "ongoing", resultReason: null } },
    turn: { actorId: null, serial: s.turn.serial, actedActorIds: [] },
    actionIds: s.actionIds, attackIds: [], latest: null,
    ai: { mode: s.ai.mode, ...(s.ai.allowFormations === undefined ? {} : { allowFormations: s.ai.allowFormations }),
      instructions: Object.fromEntries(allies.filter(u => u.kind === "friendly-ai").map(u => [u.id, { tacticId: "free-action" as const }])) },
  };
  return recordRobotBattleAction({ ...next, initiative: createRobotRoundInitiative(next) },
    `${s.id}:m30-giant-landing`, "第2段階：巨大ボス着地／味方5機が復帰");
}
