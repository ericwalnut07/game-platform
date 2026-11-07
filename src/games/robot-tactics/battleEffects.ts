import { recordRobotPreCrossDamage } from "./earlyMissions";
import { getRobotSwordRecoil } from "./weaponActions";
import { recordRobotSharedVictory } from "./sharedVictory";
import policy from "../../../docs/design/robot-tactics/battle-common-policy-2026-11-04.json";
import { resolveRobotFuses } from "./fuseResolution";
import { getRobotCombatWeapon } from "./combatAddons";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotShieldActionPlan } from "./equipmentEffects";
import { calculateRobotBaseDamage, floorRobotDamageProduct, getRobotEffectiveDefense } from "./combatMath";
import { resolveRobotTargetDamage } from "./attackResolution";
import { checkRobotAttackSpatial } from "./attackResolution";
import { checkRobotAttackRange } from "./attackRange";
import { getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleUnit, getRobotBattleBoss, robotBattleIsAlly, withRobotBattleBoss, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleUnit } from "./battleState";
import { applyRobotBossDamage } from "./bossCommands";
import { recordRobotEnergyCombatEvent } from "./energy";

export interface RobotFormationDefense { readonly kind: "pair-defense" | "protection"; readonly increase: number; readonly cap: number; readonly ownerId: string; readonly expiresOwnTurn: number }
export const hasRobotAddon = (u: RobotBattleUnit, id: string) => !!u.addons?.some(a => a.partId === id);
export function getRobotUnweakenedDefense(s: RobotBattleCoreState, u: RobotBattleUnit) { const base = getRobotEffectiveDefense(u.stats.def + getRobotBattleCommandBonus(s, u.id, null).defense); return base + Math.max(0, ...(u.formationDefense ?? []).map(e => Math.min(e.increase, base / (1-e.cap)-base))); }
export function getRobotDefenseBeforeFormation(s: RobotBattleCoreState, u: RobotBattleUnit) { return getRobotEffectiveDefense(getRobotBattleEffectiveStats(u).def + getRobotBattleCommandBonus(s, u.id, null).defense); }
export function getRobotBattleDefense(s: RobotBattleCoreState, u: RobotBattleUnit) {
  const base = getRobotEffectiveDefense(getRobotDefenseBeforeFormation(s, u));
  // Cap each technique's effective increase before selecting the larger gain.
  return base + Math.max(0, ...(u.formationDefense ?? []).map(e => Math.min(e.increase, base / (1 - e.cap) - base)));
}
export function getRobotDamageFactors(u: RobotBattleUnit): number[] {
  const shield = u.shielded ? getRobotShieldActionPlan(u.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), u.addons ?? []).damageFactors : [];
  return [...(u.defended ? [.8] : []), ...shield, ...(u.projectedDefense ? [.6] : []), ...(u.stationaryDefense ? [.85] : [])];
}
export function robotWeaponReaches(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: ReturnType<typeof resolveRobotBasicPart>): boolean {
  return !!source.position && !!target.position && !!weapon.range && checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position, target: target.position, ...weapon.range }), sight: { board: s.board, origin: source.position, target: target.position } }).canReach;
}
export function robotSpecialDamage(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: ReturnType<typeof resolveRobotBasicPart>, multiplier: number): number {
  if (source.statuses.length || target.statuses.length) throw new Error("Unknown combat status resolver required");
  const stats = getRobotBattleEffectiveStats(source), bonus = getRobotBattleCommandBonus(s, source.id, target.id);
  const stat = ["slash", "blunt", "thrust"].includes(weapon.weaponFamily!) ? stats.melee + bonus.melee : stats.ranged + bonus.ranged;
  const base = calculateRobotBaseDamage({ attackStat: stat, weaponPower: weapon.weaponPower!, targetDef: getRobotBattleDefense(s, target), actionMultiplier: 1, areaMultiplier: 1 });
  return resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null }, effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base, [multiplier, ...(target.tacticalMark && robotBattleIsAlly(source) ? [1.7] : []), ...getRobotDamageFactors(target)]) } }).damage;
}
/** Phase-local HP mutation. Defeat/respawn/objectives are reconciled once by the enclosing action. */
export function applyRobotPhaseDamage(s: RobotBattleCoreState, sourceId: string, targetId: string, damage: number, id: string, kind: RobotBattleDamageEvent["effectKind"], recovery: "normal" | "reaction" | "dot" | "fuse" = "normal") {
  const source = getRobotBattleUnit(s, sourceId), target = getRobotBattleUnit(s, targetId);
  if (target.hp <= 0 || !target.position || !Number.isSafeInteger(damage) || damage < 1) throw new Error("Living phase target and positive damage required");
  const energy = recovery === "dot" ? target.energy : recordRobotEnergyCombatEvent(target.energy, "damaged");
  let nextTarget = target.boss ? withRobotBattleBoss(target, applyRobotBossDamage({ ...getRobotBattleBoss(target), energy }, damage)) : { ...target, hp: Math.max(0, target.hp - damage), energy };
  if (nextTarget.hp === 0) { const { burning: _burning, overwatch: _overwatch, formationDefense: _formationDefense, stationaryDefense: _stationaryDefense, ...rest } = nextTarget; nextTarget = rest; }
  let units = s.units.map(u => u.id === targetId ? nextTarget : u);
  if (nextTarget.hp === 0 && sourceId !== targetId && source.hp > 0 && source.energy.maxEn > 0 && robotBattleIsAlly(source) !== robotBattleIsAlly(target)) {
    const current = units.find(u => u.id === sourceId)!;
    const key = recovery === "fuse" ? "fuseKillRound" : recovery === "dot" ? "dotKillRound" : recovery === "reaction" ? "reactionKillRound" : null;
    if (key ? current[key] !== s.allied.round : current.energy.turnOpen && current.energy.action !== null && !current.energy.killRecovered) {
      units = units.map(u => u.id === sourceId ? key ? { ...u, [key]: s.allied.round, energy: { ...u.energy, en: Math.min(u.energy.maxEn, u.energy.en + 5) } } : { ...u, energy: recordRobotEnergyCombatEvent(u.energy, "kill") } : u);
    }
  }
  const event: RobotBattleDamageEvent = { sourceId, targetId, attackId: id, cells: [{ ...target.position }], damage, effectKind: kind };
  return { state: recordRobotSharedVictory(recordRobotPreCrossDamage({ ...s, units }, sourceId, targetId, target.hp - nextTarget.hp), sourceId, targetId, id), event };
}
function orderedReactors(s: RobotBattleCoreState) {
  const entries = s.initiative?.entries ?? s.actors.map(a => { const u = getRobotBattleUnit(s, a.unitIds[0]!); return { actorId: a.id, spd: u.stats.spd, side: robotBattleIsAlly(u) ? u.kind : "enemy" }; }).sort((a, b) => b.spd - a.spd || (["controlled", "friendly-ai", "enemy"].indexOf(a.side) - ["controlled", "friendly-ai", "enemy"].indexOf(b.side)) || a.actorId.localeCompare(b.actorId));
  return entries.flatMap(e => s.actors.find(a => a.id === e.actorId)!.unitIds);
}
/** No recursive reaction dispatch: only direct attacks or actual movement call this. */
export function applyRobotReactions(s: RobotBattleCoreState, trigger: { readonly kind: "move"; readonly unitId: string } | { readonly kind: "attacked"; readonly hits: readonly { readonly sourceId: string; readonly targetId: string }[] }, prefix: string) {
  let next = s; const events: RobotBattleDamageEvent[] = [];
  const order = orderedReactors(s), overwatchUsed = new Set<string>();
  const phases = trigger.kind === "move" ? [...order.map(id => ({id, mode:"overwatch"})), ...order.map(id => ({id, mode:"interception"}))] : order.map(id => ({id, mode:"counter"}));
  for (const {id, mode} of phases) {
    let reactor = getRobotBattleUnit(next, id); if (reactor.hp <= 0 || !reactor.position || reactor.statuses.length || reactor.reactionsSuppressedUntilOwnTurn !== undefined) continue;
    const candidates = trigger.kind === "move" ? [trigger.unitId] : trigger.hits.filter(h => h.targetId === id).map(h => h.sourceId);
    for (const targetId of [...new Set(candidates)]) {
      const target = getRobotBattleUnit(next, targetId); if (target.hp <= 0 || !target.position || robotBattleIsAlly(reactor) === robotBattleIsAlly(target)) continue;
      let multiplier = 0, ledger: "counterRound" | "interceptionRound" | null = null;
      const weapons = reactor.parts.map(p => getRobotCombatWeapon(resolveRobotBasicPart(p.partId, p.level), reactor.addons)).filter(w => w.slot === "weapon" && w.weaponFamily);
      let weapon: typeof weapons[number] | undefined;
      if (trigger.kind === "move") {
        const stance = reactor.overwatch;
        if (mode === "overwatch" && stance && !stance.hitUnitIds.includes(targetId)) { weapon = weapons.find(w => w.id === stance.weaponId && robotWeaponReaches(next, reactor, target, w)); if (weapon) multiplier = stance.multiplier; }
        if (mode === "interception" && !overwatchUsed.has(id) && hasRobotAddon(reactor, "thrust-interception") && reactor.interceptionRound !== s.allied.round && Math.max(Math.abs(reactor.position!.x - target.position.x), Math.abs(reactor.position!.y - target.position.y)) >= policy.reactions.interception.minDistance) {
          weapon = weapons.find(w => w.weaponFamily === "thrust" && robotWeaponReaches(next, reactor, target, w)); multiplier = policy.reactions.interception.multiplier; ledger = "interceptionRound";
        }
        if (weapon) reactor = multiplier === stance?.multiplier && ledger === null ? { ...reactor, overwatch: { ...stance!, hitUnitIds: [...stance!.hitUnitIds, targetId] } } : { ...reactor, interceptionRound: s.allied.round };
      } else if (hasRobotAddon(reactor, "melee-counter-drive") && reactor.counterRound !== s.allied.round) {
        // Adopted sword counter: 20% of actual direct HP damage, including lethal self-damage.
        weapon = weapons.find(w => ["slash", "blunt", "thrust"].includes(w.weaponFamily!) && robotWeaponReaches(next, reactor, target, w)); multiplier = policy.reactions.counter.multiplier; ledger = "counterRound";
        if (weapon) reactor = { ...reactor, counterRound: s.allied.round };
      }
      if (!weapon) continue;
      if(mode === "overwatch") overwatchUsed.add(id);
      next = { ...next, units: next.units.map(u => u.id === id ? reactor : u) };
      const hit = applyRobotPhaseDamage(next, id, targetId, robotSpecialDamage(next, reactor, target, weapon, multiplier), prefix + ":reaction:" + events.length, weapon.weaponFamily as RobotBattleDamageEvent["effectKind"], "reaction");
      next = hit.state;
      if (target.tacticalMark && robotBattleIsAlly(reactor)) next = { ...next, units: next.units.map(u=>{if(u.id!==target.id)return u;const {tacticalMark:_mark,...rest}=u;return rest;}) };
      events.push(hit.event);
      if(trigger.kind === "attacked" && weapon.id === "double-edged-sword") {
        const recoil = getRobotSwordRecoil({attack:"normal",attackWeaponIds:[weapon.id],actingAsSupporter:false,actualHpDamage:[Math.min(target.hp,hit.event.damage!)]});
        if(recoil>0){const self=applyRobotPhaseDamage(next,id,id,recoil,prefix+":reaction-recoil:"+events.length,"special:sword-recoil","reaction");next=self.state;events.push(self.event);}
      }
      const fuses = resolveRobotFuses(next, { directHits: [{ sourceId: id, targetId }] }); next = fuses.state; events.push(...fuses.events);
      if (trigger.kind === "attacked") break;
    }
  }
  const fuses = resolveRobotFuses(next, {}); return { state: fuses.state, events: [...events, ...fuses.events] };
}
