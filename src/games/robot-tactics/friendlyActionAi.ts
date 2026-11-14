import { commitRobotExpansionSpecial, getRobotExpansionSpecialOptions, isRobotExpansionSpecialWeapon } from "./battleWeaponActions";
import { commitRobotActiveCombat, getRobotActiveCombatOptions, type RobotActiveCombatKind } from "./activeCombat";
import { commitRobotBattleBlast, getRobotBattleBlastOptions } from "./battleBlast";
import { getRobotBlastSelectionCost, type RobotBlastMode } from "./blastAddons";
import { commitRobotBattleWeaponCombo, getRobotBattleNpcComboTargets, commitRobotBattleSlashAttack, getRobotBattleSweepOptions } from "./battleWeaponActions";
import { commitRobotAddonStrike, getRobotAddonStrikeOptions, commitRobotDelta, getRobotDeltaOptions, commitRobotSupport, getRobotSupportTargets } from "./commonCombat";
import { commitRobotFormation, getRobotFormationOptions } from "./formations";
import { getRobotDefensiveFormationValue, getRobotFriendlyIncoming } from "./friendlyFormationAi";
import { commitRobotRemainingStrike, getRobotRemainingStrikeOptions, type RobotRemainingStrike } from "./remainingCombat";
import { commitRobotBattleDefend, commitRobotBattleShield, getRobotBattleFacilities, getRobotBattleUnit, getRobotBattleResult, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotFacilityGuards, resolveRobotFacilityDamage } from "./facilityDefense";
import { getRobotActionEnergyBlock } from "./energy";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotShieldActionPlan } from "./equipmentEffects";
import { getRobotDamageFactors, hasRobotAddon } from "./battleEffects";
import { tickRobotBurning, type RobotBurning } from "./burning";
import { robotNpcConvoyClearance } from "./earlyTactics";

type Identity = Parameters<typeof commitRobotBattleShield>[1];

export function chooseRobotFriendlyAction(s: RobotBattleCoreState, source: RobotBattleUnit, identity: Identity, normal: RobotBattleCoreState) {
  const weapons = source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon");
  const order = s.ai.instructions[source.id];
  const focus = order?.tacticId === "focus-attack" ? order.targetUnitId : null;
  const facilities = getRobotBattleFacilities(s);
  const guarded = new Set(facilities.filter(f => f.hp > 0).flatMap(f => {
    const defenders = getRobotFacilityGuards(s, f.id).filter(u => u.hp > 0);
    return defenders.length >= 2 ? defenders.map(u => u.id) : [];
  }));
  const beforeResult = getRobotBattleResult(s).result;
  const exposure = new Map<string, number>();
  const incoming = (id: string) => {
    if (!exposure.has(id)) exposure.set(id, getRobotFriendlyIncoming(s, id));
    return exposure.get(id)!;
  };
  const protection = (next: RobotBattleCoreState, id: string) => {
    const prior = getRobotBattleUnit(s, id), after = getRobotBattleUnit(next, id);
    const damage = incoming(id), reduced = getRobotFriendlyIncoming(next, id);
    return Math.max(0, Math.min(prior.hp, damage) - Math.min(prior.hp, reduced)) +
      (damage >= prior.hp && reduced < after.hp ? 140 : 0);
  };
  const burnValue = (burn: RobotBurning | undefined, prior: RobotBurning | undefined, hp: number, tickDamage: (burn: RobotBurning) => number) => {
    if (!burn || hp <= 0) return 0;
    const current = tickDamage(burn) * burn.ticksRemaining;
    const previous = prior ? tickDamage(prior) * prior.ticksRemaining : 0;
    return Math.max(0, Math.min(hp, current) - Math.min(hp, previous)) * .6;
  };
  const score = (next: RobotBattleCoreState, extra = 0) => {
    const result = getRobotBattleResult(next).result;
    if (beforeResult === "ongoing" && result !== "ongoing") return result === "won" ? 1e9 : -1e9;
    const after = getRobotBattleUnit(next, source.id);
    const cost = after.energy.action?.energyCost ?? 0;
    const lowReserve = cost > 0 ? Math.max(0, Math.min(20, source.energy.en) - after.energy.en) : 0;
    let value = extra - cost * .22 - lowReserve * .65;
    for (const prior of s.units) {
      if (prior.hp <= 0) continue;
      const unit = getRobotBattleUnit(next, prior.id);
      if (robotBattleIsAlly(prior)) {
        value -= Math.max(0, prior.hp - unit.hp);
        if (!unit.hp) value -= 120;
        continue;
      }
      const damage = Math.max(0, prior.hp - unit.hp);
      if (damage > 0) value += damage + (unit.hp === 0 ? 65 + (guarded.has(unit.id) ? 30 : 0) : 0) + (unit.id === focus ? 10000 : 0);
      if (unit.hp > 0) {
        value += burnValue(unit.burning, prior.burning, unit.hp, burn => tickRobotBurning(burn, unit.hp, burn.lastTargetOwnTurn + 1, getRobotDamageFactors(unit)).damage);
        if (unit.energy.lockedUntilOwnTurn !== prior.energy.lockedUntilOwnTurn) value += 8;
        if (unit.rootedUntilOwnTurn !== prior.rootedUntilOwnTurn) value += 6;
        value += Math.min(10, Math.max(0, (unit.weaponDebuffs?.length ?? 0) - (prior.weaponDebuffs?.length ?? 0)) * 4);
      }
    }
    const afterObjects = getRobotBattleFacilities(next);
    for (const prior of facilities) {
      const remaining = afterObjects.find(o => o.id === prior.id)?.hp ?? prior.hp;
      const damage = prior.hp - remaining;
      if (damage > 0) value += (remaining === 0 ? 100 : 0) + damage;
      value += burnValue(next.facilityBurns?.[prior.id], s.facilityBurns?.[prior.id], remaining, burn =>
        resolveRobotFacilityDamage(next, prior.id, tickRobotBurning(burn, Number.MAX_SAFE_INTEGER, burn.lastTargetOwnTurn + 1).damage));

    }
    return value;
  };
  const defended = getRobotBattleUnit(normal, source.id).defended;
  let best = normal, bestScore = score(normal, defended ? protection(normal, source.id) : 0);
  const clearance = robotNpcConvoyClearance(s, source, source.position!);
  const consider = (next: RobotBattleCoreState, extra = 0) => {
    const landing = getRobotBattleUnit(next, source.id).position;
    if (landing && robotNpcConvoyClearance(next, source, landing) < clearance) return;
    const utility = score(next, extra);
    if (utility > bestScore) { best = next; bestScore = utility; }
  };
  const rankTargets = (ids: readonly string[]) => [...ids].sort((a, b) =>
    Number(b === focus) - Number(a === focus) ||
    (s.units.find(u => u.id === a)?.hp ?? facilities.find(o => o.id === a)?.hp ?? Infinity) -
    (s.units.find(u => u.id === b)?.hp ?? facilities.find(o => o.id === b)?.hp ?? Infinity) || a.localeCompare(b));
  const active = (kind: RobotActiveCombatKind, weaponId?: string) => {
    const options = getRobotActiveCombatOptions(s, kind, weaponId);
    if (options.disabledReason) return;
    for (const targetId of options.targetIds) {
      const next = commitRobotActiveCombat(s, { ...identity, kind, ...(weaponId ? { weaponId } : {}), targetIds: [targetId] });
      const ally = kind === "self-heal" || kind === "hp-heal";
      const heal = ally ? getRobotBattleUnit(next, targetId).hp - getRobotBattleUnit(s, targetId).hp : 0;
      consider(next, heal * .8 + (heal > 0 ? protection(next, targetId) : 0));
    }
  };

  for (const part of weapons) {
    const weaponId = part.partId, family = resolveRobotBasicPart(weaponId, part.level).weaponFamily;
    if (family === "slash") {
      for (const targetIds of getRobotBattleSweepOptions(s, weaponId).targetSets.filter(ids => ids.length > 1)) {
        consider(commitRobotBattleSlashAttack(s, { ...identity, weaponId, kind: "sweep", targetIds }));
      }
    }
    if (isRobotExpansionSpecialWeapon(weaponId)) for (const boosted of weaponId === "aether-rail-cannon" ? [false, true] : [false]) {
      const { choices } = getRobotExpansionSpecialOptions(s, weaponId, boosted);
      for (const choice of choices) consider(commitRobotExpansionSpecial(s, { ...identity, weaponId, targetIds: choice.targets.map(t => t.target.id), boosted }));
    }
    if (family === "blast" && weaponId !== "cluster-cannon" && weaponId !== "meteor-buster") {
      for (const mode of ["burst", "fire", "double"] as const satisfies readonly RobotBlastMode[]) {
        if (mode === "fire" && !hasRobotAddon(source, "persistent-blast-fire") || mode === "double" && !hasRobotAddon(source, "double-detonation-control")) continue;
        const options = getRobotBattleBlastOptions(s, weaponId, mode);
        if (options.disabledReason) continue;
        const locations = options.centers.map(center => {
          let neighborIds = rankTargets(center.neighborIds).slice(0, options.plan.neighborCap);
          while (neighborIds.length && getRobotBlastSelectionCost(options.plan, [neighborIds.length]) > options.availableEn) neighborIds = neighborIds.slice(0, -1);
          return { center, cell: center.cell, neighborIds };
        }).filter(location => location.neighborIds.length >= location.center.minimumNeighbors);
        for (const [index, first] of locations.entries()) {
          if (mode === "double") {
            for (const second of locations.slice(index + 1)) {
              if (first.center.targetId && first.center.targetId === second.center.targetId ||
                getRobotBlastSelectionCost(options.plan, [first.neighborIds.length, second.neighborIds.length]) > options.availableEn) continue;
              consider(commitRobotBattleBlast(s, { ...identity, weaponId, mode, locations: [first, second] }));
            }
          } else if (mode !== "burst" || first.neighborIds.length) {
            consider(commitRobotBattleBlast(s, { ...identity, weaponId, mode, locations: [first] }));
          }
        }
      }
    }
    for (const [kind, addon] of [
      ["super-charge", "super-charge-thruster"], ["burning-round", "burning-round"],
      ["hp-heal", "hp-healing-round"], ["pull-strike", "lance-pull-strike"], ["epicenter-echo", "epicenter-echo"],
    ] as const) if (hasRobotAddon(source, addon)) active(kind, weaponId);
    if (source.energy.moved && ["slash", "blunt", "thrust"].includes(family ?? "")) active("charge-strike", weaponId);
    for (const kind of ["sniper-penetration", "thrust-linear-pierce", "anti-materiel-focus", "crush-immobilizer", "function-lock-round", "debuff-transfer-round"] as const satisfies readonly RobotRemainingStrike[]) {
      if (!hasRobotAddon(source, kind)) continue;
      for (const targetIds of getRobotRemainingStrikeOptions(s, kind, weaponId).targetSets) consider(commitRobotRemainingStrike(s, { ...identity, kind, weaponId, targetIds }));
    }
    for (const [kind, addon] of [["close-sniper", "close-range-sniper"], ["blade-vault", "blade-vault"]] as const) {
      if (!hasRobotAddon(source, addon)) continue;
      const options = getRobotAddonStrikeOptions(s, kind, weaponId);
      if (!options.disabledReason) for (const { targetId } of options.targets) consider(commitRobotAddonStrike(s, { ...identity, kind, weaponId, targetId }));
    }
    if (hasRobotAddon(source, "en-supply-round")) {
      for (const targetId of getRobotSupportTargets(s, "en-supply", weaponId).targetIds) {
        if (targetId === source.id) continue;
        const next = commitRobotSupport(s, { ...identity, kind: "en-supply", weaponId, targetId });
        consider(next, (getRobotBattleUnit(next, targetId).energy.en - getRobotBattleUnit(s, targetId).energy.en) * .85);
      }
    }
    if (s.ai.allowFormations) {
      const delta = getRobotDeltaOptions(s, weaponId);
      for (const participantIds of delta.participantSets) {
        const attempts = delta.targetIds.map(id => ({ id, value: score(commitRobotDelta(s, { ...identity, weaponId, participantIds, targetIds: [id] })) }));
        const targetIds = attempts.sort((a, b) => b.value - a.value).slice(0, 3).map(t => t.id);
        if (targetIds.length) consider(commitRobotDelta(s, { ...identity, weaponId, participantIds, targetIds }), -3);
      }
      for (const kind of ["line", "pincer", "pair-defense", "protection"] as const) {
        for (const choice of getRobotFormationOptions(s, kind, weaponId).selections) {
          const next = commitRobotFormation(s, { ...identity, kind, weaponId, ...choice });
          const benefit = kind === "pair-defense" || kind === "protection" ?
            getRobotDefensiveFormationValue(s, next, kind, kind === "pair-defense" ? [source.id] : [source.id, ...choice.participantIds]) : 0;
          consider(next, benefit - 3);
        }
      }
    }
  }
  if (weapons.length === 2 && weapons[0]!.partId !== weapons[1]!.partId) {
    const primaryWeaponId = weapons[0]!.partId, secondaryWeaponId = weapons[1]!.partId;
    for (const targetIds of getRobotBattleNpcComboTargets(s, primaryWeaponId, secondaryWeaponId)) {
      consider(commitRobotBattleWeaponCombo(s, { ...identity, primaryWeaponId, secondaryWeaponId, targetIds }));
    }
  }
  if (hasRobotAddon(source, "self-repair-unit")) active("self-heal");
  if (hasRobotAddon(source, "status-repair")) {
    for (const targetId of getRobotSupportTargets(s, "cleanse").targetIds) {
      const target = getRobotBattleUnit(s, targetId);
      const benefit = (target.burning?.ticksRemaining ?? 0) * 5 + (target.weaponDebuffs?.length ?? 0) * 4 +
        (target.energy.lockedUntilOwnTurn !== undefined ? 18 : 0) + (target.rootedUntilOwnTurn !== undefined ? 12 : 0);
      consider(commitRobotSupport(s, { ...identity, kind: "cleanse", targetId }), benefit);
    }
  }
  const shield = getRobotShieldActionPlan(source.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), source.addons ?? []);
  if (incoming(source.id) >= Math.min(source.hp, source.maxHp / 4)) {
    if (!defended) {
      const defend = commitRobotBattleDefend(s, identity);
      consider(defend, protection(defend, source.id));
    }
    if (!getRobotActionEnergyBlock(source.energy, shield.energyCost)) {
      const next = commitRobotBattleShield(s, identity);
      consider(next, protection(next, source.id));
    }
  }
  return { state: best, score: bestScore };
}
