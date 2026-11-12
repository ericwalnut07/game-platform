import { getRobotHostileFacilities } from "./specialFacilityTargets";
import { getRobotFacilityDefense } from "./facilityEffects";
import type { RobotPosition } from "./movement";
import { getRobotActionEnergyBlock } from "./energy";
import { getRobotCombatWeapon } from "./combatAddons";
import rules from "../../../docs/design/robot-tactics/rules.json";
import { commitRobotDelta, getRobotDeltaOptions, isRobotFormationL, robotCombatAddon } from "./commonCombat";
import { calculateRobotBaseDamage, floorRobotDamageProduct } from "./combatMath";
import { resolveRobotTargetDamage } from "./attackResolution";
import { resolveRobotBasicPart } from "./equipment";
import { commitRobotBattleBatch } from "./battleBatch";
import { commitRobotEnergyAction } from "./energy";
import { getRobotBattleActor, getRobotBattleUnit, getRobotBattleEffectiveStats, getRobotBattleCommandBonus, requireRobotBattleInput, robotBattleIsAlly, finishRobotBattleTurn, recordRobotBattleAction, type RobotBattleCoreState } from "./battleState";
import { getRobotBattleDefense, getRobotDefenseBeforeFormation, robotWeaponReaches } from "./battleEffects";
import { getRobotBattlePostBaseModifiers } from "./battleWeaponActions";
export type RobotFormationKind = "line" | "pair-defense" | "delta" | "pincer" | "protection";
function actor(s: RobotBattleCoreState) { const a = getRobotBattleActor(s), u = getRobotBattleUnit(s, a.unitIds[0]!); if (a.unitIds.length !== 1 || !robotBattleIsAlly(u) || u.kind === "friendly-ai" && !s.ai.allowFormations || u.hp === 0 || !u.position || u.energy.action || u.statuses.length) throw new Error("Eligible formation initiator required"); return u; }
export function getRobotFormationOptions(s: RobotBattleCoreState, kind: RobotFormationKind, weaponId: string) {
  const source = actor(s), selected = source.parts.find(p => p.partId === weaponId), weapon = selected && getRobotCombatWeapon(resolveRobotBasicPart(selected.partId, selected.level), source.addons);
  if (!weapon || weapon.slot !== "weapon") throw new Error("Equipped formation weapon required");
  if (kind === "delta") { const d = getRobotDeltaOptions(s, weaponId); return { energyCost: d.energyCost, disabledReason: d.disabledReason, selections: d.participantSets.flatMap(participantIds => d.targetIds.map(id => ({ participantIds, targetIds: [id] }))) }; }
  const cost = { line: rules.combat.actions.lineFormation.energyCost, "pair-defense": rules.combat.actions.pairFormation.energyCost, pincer: rules.combat.actions.pincerFormation.energyCost, protection: rules.combat.actions.protectiveFormation.energyCost }[kind];
  const amp = ["formation-amplifier-light", "formation-amplifier-medium"].reduce((n, id) => n + ((robotCombatAddon(source, id)?.extraEnergy as number | undefined) ?? 0), 0), energyCost = cost + amp;
  const allies = s.units.filter(u => u.id !== source.id && robotBattleIsAlly(u) && u.hp > 0 && u.position && !u.statuses.length);
  const selections: { participantIds: string[]; targetIds: string[]; cell?: RobotPosition }[] = [];
  const blocked = s.spentFormations?.includes(kind) ? "この連携はラウンド内で使用済みです" : getRobotActionEnergyBlock(source.energy, energyCost) ?? (["pincer", "protection"].includes(kind) && !s.units.some(u => u.kind === "controlled" && u.addons?.some(a => a.partId === "formation-extension-unlock")) ? "チームに連携技拡張パーツが必要です" : null);
  if (!blocked) for (const ally of allies) {
    const dx = ally.position!.x - source.position!.x, dy = ally.position!.y - source.position!.y;
    if (kind === "pair-defense" && Math.max(Math.abs(dx), Math.abs(dy)) === 1) selections.push({ participantIds: [ally.id], targetIds: [] });
    if (kind === "protection") for (const other of allies.filter(u => u.id > ally.id)) if (isRobotFormationL([source, ally, other])) selections.push({ participantIds: [ally.id, other.id], targetIds: [] });
    if (kind === "line" || kind === "pincer") {
      const targets = [
        ...s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0 && u.position).map(u => ({ id: u.id, cells: [u.position!] })),
        ...getRobotHostileFacilities(s, source.id),
      ];
      for (const target of targets) {
        const cell = target.cells.find(position => {
          const tx = position.x - source.position!.x, ty = position.y - source.position!.y;
          if (kind === "pincer") return Math.abs(tx) + Math.abs(ty) === 1 && dx === tx * 2 && dy === ty * 2;
          return (tx !== 0 || ty !== 0) && (tx === 0 || ty === 0 || Math.abs(tx) === Math.abs(ty)) &&
            dx === -Math.sign(tx) && dy === -Math.sign(ty) && robotWeaponReaches(s, source, { position }, weapon);
        });
        if (cell) selections.push({ participantIds: [ally.id], targetIds: [target.id], cell });
      }
    }
  }
  return { energyCost, selections, disabledReason: blocked ?? (selections.length ? null : "条件を満たす味方配置・対象がありません") };
}
export function commitRobotFormation(s: RobotBattleCoreState, input: { readonly kind: RobotFormationKind; readonly actionId: string; readonly turnId: string; readonly weaponId: string; readonly participantIds: readonly string[]; readonly targetIds: readonly string[] }) {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  if (input.kind === "delta") return commitRobotDelta(s, input);
  const source = actor(s), options = getRobotFormationOptions(s, input.kind, input.weaponId);
  if (options.disabledReason || !options.selections.some(c => c.participantIds.length === input.participantIds.length && new Set(input.participantIds).size === input.participantIds.length && c.participantIds.every(id => input.participantIds.includes(id)) && c.targetIds.length === input.targetIds.length && c.targetIds.every(id => input.targetIds.includes(id)))) throw new Error(options.disabledReason ?? "Illegal formation selection");
  const weaponSelection = source.parts.find(p => p.partId === input.weaponId)!, weapon = resolveRobotBasicPart(input.weaponId, weaponSelection.level);
  const participants = [source, ...input.participantIds.map(id => getRobotBattleUnit(s, id))], factor = 1 + ["formation-amplifier-light", "formation-amplifier-medium"].reduce((n, id) => n + ((robotCombatAddon(source, id)?.offensiveDamageBonusFraction as number | undefined) ?? 0), 0);
  const spent = { ...s, spentFormations: [...(s.spentFormations ?? []), input.kind] };
  if (input.kind === "pair-defense" || input.kind === "protection") {
    const kind = input.kind, targets = kind === "pair-defense" ? [source] : participants;
    const units = s.units.map(u => {
      let next = u.id === source.id ? { ...u, energy: commitRobotEnergyAction(u.energy, { kind: "other", energyCost: options.energyCost }) } : u;
      if (targets.some(t => t.id === u.id)) {
        const increase = participants.filter(p => p.id !== u.id).reduce((n, p) => n + getRobotDefenseBeforeFormation(s, p), 0) * (kind === "pair-defense" ? .75 : .25) * factor;
        next = { ...next, formationDefense: [...(next.formationDefense ?? []).filter(e => e.kind !== kind), { kind, increase: Math.max(0, increase), cap: kind === "pair-defense" ? .6 : .5, ownerId: source.id, expiresOwnTurn: source.energy.ownTurn + 1 }] };
      }
      return next;
    });
    const next = { ...spent, units };
    if (kind === "pair-defense" && source.kind === "controlled" && next.objective.kind === "early" &&
        next.key.missionNumber === 21 && next.objective.state.data?.carrierId === source.id) {
      const mission = next.objective.state;
      const history = mission.lateSubobjectiveEvents ?? [];
      next.objective = { kind: "early", state: { ...mission, lateSubobjectiveEvents: [
        ...history, ...(!history.some(e => e.kind === "pickup") ? [{ kind: "pickup" as const }] : []),
        { kind: "carrier-pair", controlledId: source.id },
      ] } };
    }
    return recordRobotBattleAction(finishRobotBattleTurn(next), input.actionId, source.name + (kind === "pair-defense" ? "：ペア連携" : "：防護陣"));
  }
  const targetId = input.targetIds[0]!;
  const target = s.units.find(u => u.id === targetId);
  const facility = getRobotHostileFacilities(s, source.id).find(o => o.id === targetId);
  const impact = options.selections.find(c => c.participantIds[0] === input.participantIds[0] && c.targetIds[0] === targetId);
  const cell = impact && "cell" in impact ? impact.cell as RobotPosition : undefined;
  if (!cell || (!target && !facility)) throw new Error("Missing formation impact");
  const stat = ["slash", "blunt", "thrust"].includes(weapon.weaponFamily!) ? "melee" : "ranged";
  const attack = participants.reduce((n, u) => n + getRobotBattleEffectiveStats(u)[stat] + getRobotBattleCommandBonus(s, u.id, targetId)[stat], 0);
  const base = calculateRobotBaseDamage({ attackStat: attack, weaponPower: weapon.weaponPower!, targetDef: target ? getRobotBattleDefense(s, target) : getRobotFacilityDefense(s, facility!), actionMultiplier: input.kind === "line" ? 1 : 1.25, areaMultiplier: 1 });
  const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null }, effect: { kind: "damaging", product: { base, factors: [factor, ...(target ? getRobotBattlePostBaseModifiers(s, source, target) : [])] }, resolveAfterModifiers: () => floorRobotDamageProduct(base, [factor, ...(target ? getRobotBattlePostBaseModifiers(s, source, target) : [])]) } });
  return commitRobotBattleBatch(spent, { actionId: input.actionId, turnId: input.turnId, summary: source.name + (input.kind === "line" ? "：ライン連携" : "：挟撃連携"), members: [{ unitId: source.id, action: { kind: "other", energyCost: options.energyCost } }], attacks: [{ id: input.actionId + ":formation", sourceId: source.id, effectKind: input.kind, targets: [{ entityId: targetId, cells: [cell], resolution }] }], swordUse: { attack: input.kind, attackWeaponIds: [weapon.id] } });
}
