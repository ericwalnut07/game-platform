import { getRobotBattleFacilities, isRobotBattleHostileObject } from "./battleState";
import type { RobotBattleCoreState } from "./battleState";
import { resolveRobotBasicPart } from "./equipment";

export function assertRobotFuses(s: RobotBattleCoreState) {
  if (s.fuses === undefined) return;
  const f = s.fuses;
  if (!f || !f.policy || f.policy.attackerStatsAt !== "attachment" || f.policy.clearAllOnAnyRespawn !== true || !Number.isSafeInteger(f.nextOrder) || f.nextOrder < 0 || !Array.isArray(f.bombs)) throw new Error("Invalid bomb policy/ledger");
  const ids = new Set<string>(); let previousOrder = -1;
  const cell = (p: { x: number; y: number }) => p && Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < s.board.width && p.y < s.board.height;
  for (const b of f.bombs) {
    if (!b || !Number.isSafeInteger(b.order) || b.order <= previousOrder || b.order >= f.nextOrder || b.id !== `${s.id}:fuse:${b.order}` || ids.has(b.id)) throw new Error("Invalid unique ordered bomb ID");
    ids.add(b.id); previousOrder = b.order;
    const source = s.units.find(u => u.id === b.sourceId), target = s.units.find(u => u.id === b.targetId), weapon = b.weapon && resolveRobotBasicPart(b.weapon.partId, b.weapon.level);
    const facility = getRobotBattleFacilities(s).find(o => o.id === b.targetId);
    if (!source || source.kind !== "controlled" || (target ? ["controlled", "friendly-ai"].includes(target.kind) || b.dueRound !== undefined : !facility || !isRobotBattleHostileObject(s, source.id, facility.id) || b.dueOwnTurn !== 1 || !Number.isSafeInteger(b.dueRound) || b.dueRound! < 1 || b.dueRound! > s.allied.round || !facility.cells.some(c => c.x === b.lastPosition.x && c.y === b.lastPosition.y)) || !source.parts.some(p => p.partId === b.weapon.partId && p.level === b.weapon.level) || weapon?.weaponFamily !== "blast" || !source.addons?.some(a => a.partId === "delayed-fuse")) throw new Error("Invalid bomb owner/target/weapon");
    if (!Number.isSafeInteger(b.dueOwnTurn) || b.dueOwnTurn < 1 || !cell(b.lastPosition) || !["armed", "detonated"].includes(b.state)) throw new Error("Invalid bomb timing/state");
    if (!b.attack || !Number.isSafeInteger(b.attack.ranged) || b.attack.ranged < 0 || !Array.isArray(b.attack.targetBonuses) || new Set(b.attack.targetBonuses.map((v: { targetId: string }) => v.targetId)).size !== b.attack.targetBonuses.length || b.attack.targetBonuses.some((v: { targetId: string; ranged: number }) => !s.units.some(u => u.id === v.targetId) || !Number.isSafeInteger(v.ranged))) throw new Error("Invalid bomb attack information");
    if (b.state === "armed" && ((target ? target.hp === 0 || target.energy.ownTurn >= b.dueOwnTurn && !target.energy.turnOpen : facility!.hp === 0 || b.dueRound! < s.allied.round)) || b.state === "detonated" && !s.attackIds.includes(b.id + ":detonate") || b.state === "armed" && s.attackIds.includes(b.id + ":detonate")) throw new Error("Bomb detonation receipt/timing mismatch");
  }
}
