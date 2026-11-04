import definition from "../../../docs/design/robot-tactics/delayed-fuse-policy-2026-11-04.json";
import type { RobotPartSelection } from "./equipment";
import type { RobotPosition } from "./movement";

export interface RobotFusePolicy { readonly attackerStatsAt: "attachment"; readonly clearAllOnAnyRespawn: true }
export interface RobotFuseBomb {
  readonly id: string; readonly sourceId: string; readonly targetId: string;
  readonly weapon: RobotPartSelection; readonly order: number;
  readonly attack: { readonly ranged: number; readonly targetBonuses: readonly { readonly targetId: string; readonly ranged: number }[] };
  readonly dueOwnTurn: number; readonly lastPosition: RobotPosition;
  readonly state: "armed" | "detonated";
}
export interface RobotFuseState { readonly policy: RobotFusePolicy; readonly nextOrder: number; readonly bombs: readonly RobotFuseBomb[] }
export interface RobotFuseExplosion { readonly bombId: string; readonly attackId: string; readonly cell: RobotPosition }
/** Persist the adopted rule revision with each battle ledger. */
export function getRobotFusePolicy(): RobotFusePolicy {
  if (definition.attackerStatsAt !== "attachment" || definition.clearAllOnAnyRespawn !== true) throw new Error("Unsupported delayed fuse policy revision");
  return { attackerStatsAt: "attachment", clearAllOnAnyRespawn: true };
}
