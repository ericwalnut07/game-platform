import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
/** Component scenarios with the adopted final attachment/reset policy. */
import { weaponAreaFixtureProgress, weaponAreaCoreFixture } from "./weaponAreaFixture";
import { decodeRobotBattleCore, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotDelayedFuse } from "../../src/games/robot-tactics/delayedFuse";
import { robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import type { RobotFusePolicy } from "../../src/games/robot-tactics/fuseTypes";
export const fuseTestPolicy: RobotFusePolicy = { attackerStatsAt: "attachment", clearAllOnAnyRespawn: true };
export const fuseWeapon = "heavy-missile-cannon", fuseTarget = "enemy-supreme-commander";
export function fuseFixture(weapon = fuseWeapon, en = 100) {
  const progress = weaponAreaFixtureProgress([weapon, "light-lance"]);
  return weaponAreaCoreFixture({ progress: { ...progress, party: progress.party.map((c, i) => i ? c : { ...c, addons: [{ partId: "delayed-fuse" }] }) }, en });
}
export function attachFuse(s = fuseFixture()) { return commitRobotDelayedFuse(s, { actionId: "attach-" + s.actionIds.length, turnId: robotBattleTurnId(s), weaponId: s.units.find(u => u.id === "p1")!.parts.find(p => resolveRobotBasicPart(p.partId, p.level).weaponFamily === "blast")!.partId, targetId: fuseTarget }); }
export function stackFuse(s: RobotBattleCoreState, count: number, targets: readonly string[] = [fuseTarget]) {
  const first = s.fuses!.bombs[0]!;
  return decodeRobotBattleCore({ ...s, fuses: { ...s.fuses!, nextOrder: count, bombs: Array.from({ length: count }, (_, order) => { const targetId = targets[order % targets.length]!, target = s.units.find(u => u.id === targetId)!; return { ...first, id: `${s.id}:fuse:${order}`, order, targetId, lastPosition: target.position! }; }) } });
}
