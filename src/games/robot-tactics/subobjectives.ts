import spec from "../../../docs/design/robot-tactics/m01-m07-subobjectives-and-three-addons-2026-11-07.json";
import { resolveRobotBasicPart, type RobotLoadout } from "./equipment";
import { getRobotBattleResult, type RobotBattleCoreState } from "./battleState";

/** Freeze only the departure equipment predicate. Ownership is never consulted. */
export function getRobotSortieSubobjective(mission: number, party: readonly RobotLoadout[]): boolean {
  if (party.length !== 3) return false;
  const condition = spec.subobjectives.missionConditions.find(m => m.number === mission)?.easy;
  if (!condition) return false;
  if (condition.type === "equipped-frame-group") return party.some(c => /^mobile-/.test(c.frameId));
  if (condition.type !== "equipped-weapon-family-set") return false;
  const families = new Set(party.flatMap(c => [c.basic.weapon1, c.basic.weapon2].map(p => resolveRobotBasicPart(p.partId, p.level).weaponFamily)));
  return condition.requiredFamilies!.every(f => families.has(f));
}
/** Trusted battle outcome only; missing legacy history cannot imply success. */
export function getRobotSubobjectiveAchieved(s: RobotBattleCoreState): boolean {
  if (getRobotBattleResult(s).result !== "won") return false;
  const m = s.key.missionNumber, easy = s.key.difficulty === "easy";
  if (easy && [1, 2, 3, 7].includes(m)) return s.sortieSubobjectiveEligible === true;
  const condition = spec.subobjectives.missionConditions.find(c => c.number === m)?.[s.key.difficulty] as { type: string; maxWinningRound?: number; minimumRatio?: number } | undefined;
  if (!condition) return false;
  if (condition.type === "victory-by-round") return s.allied.round <= condition.maxWinningRound!;
  if (m === 1 && s.objective.kind === "m01" || m === 5 && s.objective.kind === "early") {
    const o = s.objective.state.objects.objects[0]!;
    return o.hp >= Math.ceil(o.maxHp * condition.minimumRatio!);
  }
  if (s.objective.kind !== "early") return false;
  const history = s.objective.state.subobjectiveHistory;
  if (!history) return false;
  if (m === 4) return history.depotDamageSources["depot-left"]!.some(a => history.depotDamageSources["depot-right"]!.some(b => a !== b));
  if (m === 6) return history.centralBaseOccupied;
  return m === 7 && s.objective.state.data!.sent && s.objective.state.data!.collectedRound !== null && !history.dataDropped;
}
export function getRobotSubobjectiveText(mission: number, easy: boolean): string | null {
  const texts = easy ? ["斬撃・連射・狙撃を出撃時に装備", "刺突・打撃を出撃時に装備", "連射・狙撃・爆撃を出撃時に装備", "左右の施設に異なる自機でダメージ", "輸送車の残HP50%以上", "ラウンド末に自機で中央I5を1回以上支配", "機動力型フレームを出撃時に装備"] : ["防衛施設の残HP50%以上", "R7以内にクリア", "R6以内にクリア", "R7以内にクリア", "輸送車の残HP60%以上", "R9以内にクリア", "データを一度も落とさず送信"];
  return texts[mission - 1] ?? null;
}
