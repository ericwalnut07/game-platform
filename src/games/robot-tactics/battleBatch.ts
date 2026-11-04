import { addRobotHazard } from "./hazards";
import { getRobotBattleAttackObjects } from "./decoys";
import { prepareRobotAfterAttack, robotAttackKilledEnemy } from "./afterAttack";
import { applyRobotAdoptedDebuffs, consumeRobotMark } from "./adoptedEffects";
import { recordRobotSharedVictory } from "./sharedVictory";
import { applyRobotReactions } from "./battleEffects";
import { resolveRobotFuses } from "./fuseResolution";
import { applyRobotDisplacement, type RobotDisplacement } from "./displacement";
import { applyRobotBurning } from "./burning";
import { getRobotNormalActionCost } from "./combatAddons";
import { finalizeRobotDamage } from "./combatMath";
import type { RobotTargetDamageResult } from "./attackResolution";
import { commitRobotEnergyAction, recordRobotEnergyCombatEvent } from "./energy";
import { recordRobotAddonNormalHit } from "./addonEnergy";
import { applyRobotBossDamage } from "./bossCommands";
import { isRobotBattleHostileObject, getRobotBattleActor, getRobotBattleBoss, getRobotBattleUnit, isRobotBattleEffectKind, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, withRobotBattleBoss, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleEffectKind, type RobotBattleUnit } from "./battleState";
import { settleRobotBattleDamageAction } from "./battleSettlement";
import { getRobotSwordRecoil, type RobotSwordAttackKind } from "./weaponActions";
import { resolveRobotBasicPart } from "./equipment";
import { describeRobotWeaponDebuffs, getRobotNormalHitEffect } from "./weaponHitEffects";
import type { RobotPosition } from "./movement";

export interface RobotBattleResolvedAttack {
  readonly id: string; readonly sourceId: string; readonly effectKind: RobotBattleEffectKind;
  /** Trusted normal-command output only; never supplied for combos/formations. */
  readonly normalWeaponId?: string;
  /** One entry per entity, with all of that entity's impacted cells together.
   * The trusted geometry/effect resolver chooses the entity damage BEFORE here.
   */
  readonly targets: readonly { readonly entityId: string; readonly cells: readonly RobotPosition[]; readonly resolution: RobotTargetDamageResult }[];
}
export interface RobotBattleMemberAction {
  readonly unitId: string;
  readonly action: { readonly kind: "normal-attack" | "charge" | "extra-move" | "other"; readonly energyCost: number };
}
export interface RobotBattleBatchPolicy {
  /** No guessed "last hit" or all-member reward. Needed only if several robots
   * jointly destroy one robot. Tests may inject an explicit fixture policy.
   */
  readonly chooseKillCredit: ((targetId: string, contributingSourceIds: readonly string[]) => string) | null;
}
const VALID_ZERO_REASONS = ["invalid-attack", "non-damaging", "out-of-range", "range-unresolved", "line-of-sight-blocked", "out-of-bounds"];
function validResolution(r: RobotTargetDamageResult): boolean {
  if (r.reason === "hit") {
    if (r.damageBeforeMinimum === null || !Number.isFinite(r.damageBeforeMinimum) || finalizeRobotDamage({ attackLegal: true, dealsDamage: true, damageAfterModifiers: r.damageBeforeMinimum }) !== r.damage) throw new Error("Invalid resolved damaging hit/minimum");
    return true;
  }
  if (!VALID_ZERO_REASONS.includes(r.reason) || r.damage !== 0 || r.damageBeforeMinimum !== null) throw new Error("Invalid non-hit resolution");
  return r.reason === "non-damaging";
}
function sumDamage(values: readonly number[]): number { const total = values.reduce((a, b) => a + b, 0); if (!Number.isSafeInteger(total)) throw new Error("Resolved batch damage exceeds supported numeric range"); return total; }

/** Internal own-turn hostile hit application (simultaneous by default). Not a client command
 * or a substitute for attack legality, range, weapon effects or reactions.
 * All damage results come from the common target resolver using the pre-batch
 * state; every HP/EN/death/objective update is then published atomically.
 * Ordered inputs must already have been evaluated by a dedicated sequence
 * resolver (including skip-after-kill). They are still published as ONE action.
 */
export function commitRobotBattleBatch(s: RobotBattleCoreState, input: {
  readonly actionId: string; readonly turnId: string; readonly summary: string;
  readonly members: readonly RobotBattleMemberAction[]; readonly attacks: readonly RobotBattleResolvedAttack[];
  /** Internal resolver output only. Ordered mode rejects hits after a prior kill. */
  readonly resolutionMode?: "simultaneous" | "ordered-single-source";
  readonly displacements?: readonly RobotDisplacement[];
  readonly transferredHitEffects?: readonly { readonly sourceId: string; readonly weaponId: string; readonly targetIds: readonly string[] }[];
  readonly restrictions?: readonly { readonly sourceId: string; readonly targetId: string; readonly kind: "crush-immobilizer" | "function-lock-round" }[];
  readonly burns?: readonly { readonly sourceId: string; readonly targetId: string }[];
  readonly followup?: boolean;
  readonly fireCenter?: RobotPosition;
  readonly attackKind?: string;
  readonly markTargetId?: string;
  readonly weaponEffectsAllowed?: boolean;
  readonly prepaidMembers?: boolean;
  readonly swordUse?: { readonly attack: RobotSwordAttackKind; readonly attackWeaponIds: readonly string[] };
}, policy: RobotBattleBatchPolicy = { chooseKillCredit: null }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId, input.followup===true)) return s;
  const actor = getRobotBattleActor(s), activeIds = actor.unitIds.filter(id => getRobotBattleUnit(s, id).hp > 0);
  if (new Set(input.members.map(a => a.unitId)).size !== input.members.length || input.members.length !== activeIds.length || input.members.some(a => !activeIds.includes(a.unitId))) throw new Error("One action per living shared-turn member is required");
  if (new Set(input.attacks.map(a => a.id)).size !== input.attacks.length || input.attacks.some(a => !a.id || s.attackIds.includes(a.id) || !activeIds.includes(a.sourceId))) throw new Error("Duplicate/stale attack or wrong source actor");
  const ordered = input.resolutionMode === "ordered-single-source";
  if (input.resolutionMode !== undefined && !["simultaneous", "ordered-single-source"].includes(input.resolutionMode)) throw new Error("Unsupported resolved action mode");
  if (ordered && (activeIds.length !== 1 || actor.unitIds.length !== 1)) throw new Error("Ordered action requires one acting source");
  if (input.swordUse) {
    if (actor.unitIds.length !== 1) throw new Error("Sword drawback belongs only to the initiating attacker");
    const owner = getRobotBattleUnit(s, activeIds[0]!);
    const held = owner.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon").map(p => p.partId);
    if (new Set(input.swordUse.attackWeaponIds).size !== input.swordUse.attackWeaponIds.length || input.swordUse.attackWeaponIds.some(id => !held.includes(id))) throw new Error("Recoil weapon is not equipped by initiator");
  }
  const consumedMarks = new Set<string>();
  const orderedDamage = new Map<string, number>();
  const events: RobotBattleDamageEvent[] = [], validSourceIds = new Set<string>(), damagedBy = new Map<string, string[]>();
  const facilityAttacks: { attackId: string; hitCells: readonly RobotPosition[]; damage: number }[] = [];
  for (const attack of input.attacks) {
    if (!isRobotBattleEffectKind(attack.effectKind)) throw new Error("Unknown resolved effect family");
    if (!attack.targets.length || new Set(attack.targets.map(t => t.entityId)).size !== attack.targets.length) throw new Error("An attack must consolidate each target entity exactly once");
    const source = getRobotBattleUnit(s, attack.sourceId);
    if (attack.normalWeaponId !== undefined) {
      const weapon = source.parts.find(p => p.partId === attack.normalWeaponId), member = input.members.find(m => m.unitId === source.id);
      if (!weapon || attack.effectKind !== resolveRobotBasicPart(weapon.partId, weapon.level).weaponFamily || member?.action.kind !== "normal-attack" || !input.weaponEffectsAllowed && member.action.energyCost !== getRobotNormalActionCost(weapon, source.addons)) throw new Error("Normal weapon hit effect requires the equipped normal action");
      getRobotNormalHitEffect(weapon.partId);
    }
    for (const hit of attack.targets) {
      if (!hit.cells.length || new Set(hit.cells.map(c => c.x + "," + c.y)).size !== hit.cells.length) throw new Error("Invalid entity impact cells");
      const target = s.units.find(u => u.id === hit.entityId), facility = getRobotBattleAttackObjects(s).find(o => o.id === hit.entityId);
      if (target) {
        if (target.hp <= 0 || !target.position || robotBattleIsAlly(source) === robotBattleIsAlly(target)) throw new Error("Hostile living target required; support/recoil needs its own resolver");
        if (hit.cells.length !== 1 || !sameRobotCoreCell(hit.cells[0]!, target.position)) throw new Error("Unit impact differs from current target position");
      } else if (attack.normalWeaponId !== undefined || !facility || facility.hp <= 0 || !isRobotBattleHostileObject(s,source.id,facility.id) || hit.cells.some(c => !facility.cells.some(f => sameRobotCoreCell(c, f)))) throw new Error("Unknown/invalid target entity");
      const valid = validResolution(hit.resolution);
      if (!valid) continue; // blocked, invalid and unresolved attacks never become 1 damage
      validSourceIds.add(source.id);
      if (hit.resolution.reason !== "hit") { events.push({ sourceId: source.id, targetId: hit.entityId, attackId: attack.id, cells: hit.cells, damage: null, effectKind: attack.effectKind }); continue; }
      const marked = consumeRobotMark(s, source, target, hit.resolution, consumedMarks);
      const damage = marked;
      const previous = orderedDamage.get(hit.entityId) ?? 0;
      if (ordered && previous >= (target?.hp ?? facility!.hp)) { if (consumedMarks.has(hit.entityId)) continue; throw new Error("Ordered hit after target defeat must be skipped"); }
      orderedDamage.set(hit.entityId, sumDamage([previous, damage]));
      events.push({ sourceId: source.id, targetId: hit.entityId, attackId: attack.id, cells: hit.cells, damage, effectKind: attack.effectKind });
      if (target) damagedBy.set(target.id, [...(damagedBy.get(target.id) ?? []), source.id]);
      else if (!s.decoys?.some(d=>d.id===hit.entityId)) facilityAttacks.push({ attackId: attack.id, hitCells: hit.cells, damage });
    }
  }
  for (const member of input.members) if (member.action.kind === "normal-attack" && !validSourceIds.has(member.unitId)) throw new Error("A non-established normal attack cannot consume the action");
  for (const member of input.members) if (getRobotBattleUnit(s, member.unitId).kind === "light" && (!["normal-attack", "other"].includes(member.action.kind) || member.action.energyCost !== 0)) throw new Error("Light squad action requires its adopted normal/defend/wait resolver");
  const totals = new Map(s.units.map(u => [u.id, sumDamage(events.filter(e => e.targetId === u.id).map(e => e.damage ?? 0))]));
  const defeated = s.units.filter(u => u.hp > 0 && totals.get(u.id)! >= u.hp);
  const credits = new Set<string>();
  for (const target of defeated) {
    const sources = [...new Set(damagedBy.get(target.id) ?? [])];
    if (!sources.length) throw new Error("Missing lethal damage source");
    // A shared light-squad attack has no EN at all. Offensive formations
    // attribute base recovery to the sole acting initiator, never supporters.
    if (activeIds.every(id => getRobotBattleUnit(s, id).kind === "light")) continue;
    const credited = activeIds.length === 1 ? activeIds[0]! : policy.chooseKillCredit?.(target.id, sources);
    if (credited === undefined || !activeIds.includes(credited)) throw new Error("Killing action initiator required");
    credits.add(credited);
  }
  // Commit member action costs once; no per-target or per-hit action consumption.
  let units: readonly RobotBattleUnit[] = s.units.map(u => {
    const member = input.members.find(a => a.unitId === u.id);
    if (!member) return u;
    if (input.prepaidMembers) { if (!u.energy.action || u.energy.action.kind !== member.action.kind || u.energy.action.energyCost !== member.action.energyCost) throw new Error("Prepaid action mismatch"); return u; }
    return { ...u, energy: commitRobotEnergyAction(u.energy, member.action) };
  });
  units = units.map(u => {
    const damage = totals.get(u.id)!; if (!damage) return u;
    const energy = recordRobotEnergyCombatEvent(u.energy, "damaged");
    if (u.boss) return withRobotBattleBoss(u, applyRobotBossDamage({ ...getRobotBattleBoss(u), energy }, damage));
    return { ...u, hp: Math.max(0, u.hp - damage), energy };
  });
  units = units.map(u => {
    if (!activeIds.includes(u.id)) return u;
    let energy = u.energy;
    if (validSourceIds.has(u.id) && !input.followup) energy = recordRobotAddonNormalHit(energy, u.addons === undefined ? [] : u.addons);
    if (credits.has(u.id)) energy = recordRobotEnergyCombatEvent(energy, "kill");
    return { ...u, energy };
  });
  const newAttackIds = input.attacks.map(a => a.id);
  let summary = input.summary;
  // Normal-only effects resolve AFTER HP damage/damage-event recovery and before
  // the one settlement/checkpoint. The damage packet used pre-hit DEF/attack.
  const hitEffects = input.attacks.flatMap(a => a.normalWeaponId ? [{ sourceId: a.sourceId, weaponId: a.normalWeaponId, targetIds: a.targets.filter(t => t.resolution.reason === "hit").map(t => t.entityId) }] : []);
  for (const transfer of input.transferredHitEffects ?? []) {
    const source = getRobotBattleUnit(s, transfer.sourceId);
    if (!source.addons?.some(a=>a.partId==="debuff-transfer-round") || !source.parts.some(p=>p.partId===transfer.weaponId&&resolveRobotBasicPart(p.partId,p.level).weaponFamily==="assault") || transfer.targetIds.length!==2 || new Set(transfer.targetIds).size!==2 || !input.attacks.some(a=>a.sourceId===source.id&&transfer.targetIds.every(id=>a.targets.some(t=>t.entityId===id&&(t.resolution.reason==="hit"||t.resolution.reason==="non-damaging"))))) throw new Error("Invalid transferred weapon hit effect");
    hitEffects.push({sourceId:transfer.sourceId,weaponId:transfer.weaponId,targetIds:[...transfer.targetIds]});
  }
  for (const application of hitEffects) {
    const effect = getRobotNormalHitEffect(application.weaponId);
    for (const targetId of application.targetIds) {
      units = units.map(u => {
        if (u.id !== targetId) return u;
        if (effect.kind === "suppress-reactions") {
          if(u.hp===0)return u;
          summary += "／"+u.name+"：反応攻撃抑制（次の自身手番終了まで）";
          return {...u,reactionsSuppressedUntilOwnTurn:u.energy.ownTurn+1};
        }
        if (effect.kind === "debuff") {
          if (u.hp === 0) return u;
          summary += "／" + u.name + "：" + describeRobotWeaponDebuffs(effect.modifiers) + "（次の手番終了まで）";
          return { ...u, weaponDebuffs: applyRobotAdoptedDebuffs(u, getRobotBattleUnit(s, application.sourceId), application.weaponId, effect.modifiers) };
        }
        if (u.kind === "light") return u;
        const loss = Math.min(u.energy.en, effect.amount);
        summary += "／" + u.name + "：EN" + loss + "減少";
        return { ...u, energy: { ...u.energy, en: u.energy.en - loss } };
      });
    }
  }
  if (input.swordUse) {
    const owner = units.find(u => u.id === activeIds[0])!;
    const targets = [...new Set(events.filter(e => e.sourceId === owner.id && e.damage !== null).map(e => e.targetId))];
    const actualHpDamage = targets.map(id => {
      const targetHp = s.units.find(u => u.id === id)?.hp ?? (getRobotBattleAttackObjects(s).find(o => o.id === id)?.hp ?? 0);
      return Math.min(targetHp, sumDamage(events.filter(e => e.sourceId === owner.id && e.targetId === id).map(e => e.damage ?? 0)));
    });
    const recoil = getRobotSwordRecoil({ ...input.swordUse, actingAsSupporter: false, actualHpDamage });
    if (recoil > 0) {
      const id = input.actionId + ":sword-recoil";
      if (s.attackIds.includes(id) || newAttackIds.includes(id)) throw new Error("Duplicate sword recoil receipt");
      // Use the same once-per-round damaged ledger as every HP-damage event;
      // self defeat never awards a kill or enables dead-unit end-turn recovery.
      const energy = recordRobotEnergyCombatEvent(owner.energy, "damaged");
      units = units.map(u => u.id === owner.id ? { ...u, hp: Math.max(0, u.hp - recoil), energy } : u);
      events.push({ sourceId: owner.id, targetId: owner.id, attackId: id, cells: [owner.position!], damage: recoil, effectKind: "special:sword-recoil" });
      newAttackIds.push(id);
      summary += "／自傷" + recoil + (owner.hp <= recoil ? "、発動機撃破" : "");
    }
  }
  units = units.map(u => { if (!consumedMarks.has(u.id)) return u; const { tacticalMark: _mark, ...rest } = u; return rest; });
  const decoyTargets = (s.decoys??[]).filter(d=>events.some(e=>e.targetId===d.id)).map(d=>({...d,hp:Math.max(0,d.hp-events.filter(e=>e.targetId===d.id).reduce((n,e)=>n+(e.damage??0),0))}));
  let phaseState: RobotBattleCoreState = { ...s, units, ...(s.decoys?{decoys:s.decoys.map(d=>decoyTargets.find(t=>t.id===d.id)??d).filter(d=>d.hp>0)}:{}), ...(decoyTargets.length?{pendingDecoyTargets:decoyTargets.map(d=>({id:d.id,cell:d.cell,hp:d.hp}))}:{}) };
  for (const target of s.units.filter(u => u.hp > 0 && phaseState.units.find(v => v.id === u.id)!.hp === 0)) {
    const sourceId = damagedBy.get(target.id)?.[0]; if (sourceId) phaseState = recordRobotSharedVictory(phaseState, sourceId, target.id, input.attacks.find(a => a.sourceId === sourceId && a.targets.some(t => t.entityId === target.id))!.id);
  }
  for (const restriction of input.restrictions ?? []) {
    if (!input.attacks.some(a => a.sourceId === restriction.sourceId && a.targets.some(t => t.entityId === restriction.targetId && t.resolution.reason === "hit"))) throw new Error("A restriction requires a direct damaging hit");
    phaseState = { ...phaseState, units: phaseState.units.map(u => u.id !== restriction.targetId || u.hp === 0 ? u : restriction.kind === "crush-immobilizer" ? { ...u, rootedUntilOwnTurn: u.energy.ownTurn + 1 } : { ...u, energy: { ...u.energy, lockedUntilOwnTurn: u.energy.ownTurn + 1 } }) };
  }
  for (const [i, displacement] of (input.displacements ?? []).entries()) {
    const result = applyRobotDisplacement(phaseState, displacement, input.actionId + ":push:" + i); phaseState = result.state; events.push(...result.events); newAttackIds.push(...result.events.map(e => e.attackId));
  }
  for (const burn of input.burns ?? []) {
    const source = getRobotBattleUnit(phaseState, burn.sourceId), target = getRobotBattleUnit(phaseState, burn.targetId);
    if (target.hp > 0) { if (source.coreLevel === undefined) throw new Error("Burning source core level required"); phaseState = { ...phaseState, units: phaseState.units.map(u => u.id === target.id ? { ...u, burning: applyRobotBurning(u.burning ?? null, source.id, source.coreLevel!, u.energy.ownTurn) } : u) }; }
  }
  if (input.markTargetId) { const source = getRobotBattleUnit(s, activeIds[0]!); if (!source.addons?.some(a=>a.partId==="tactical-marking-attack") || !events.some(e=>e.targetId===input.markTargetId&&e.damage!==null)) throw new Error("Mark requires its direct attack"); phaseState = { ...phaseState, units: phaseState.units.map(u=>u.id===input.markTargetId&&u.hp>0?{...u,tacticalMark:{ownerId:source.id,expiresOwnTurn:source.energy.ownTurn+1}}:u) }; }
  const directHits = input.attacks.flatMap(a => a.targets.filter(t => t.resolution.reason === "hit" && s.units.some(u => u.id === t.entityId)).map(t => ({ sourceId: a.sourceId, targetId: t.entityId })));
  const fuses = resolveRobotFuses(phaseState, { directHits }); phaseState = fuses.state; events.push(...fuses.events);
  const reaction = applyRobotReactions(phaseState, { kind: "attacked", hits: directHits }, input.actionId);
  events.push(...reaction.events); newAttackIds.push(...reaction.events.map(e => e.attackId));
  if(input.fireCenter) reaction.state=addRobotHazard(reaction.state,"persistent-blast-fire",activeIds[0]!,input.fireCenter,input.actionId+":zone");
  const prepared = input.followup ? reaction.state : prepareRobotAfterAttack(s,reaction.state,{
    weaponIds: input.swordUse?.attackWeaponIds.filter(id=>input.swordUse!.attack!=="weapon-combo"||resolveRobotBasicPart(id,getRobotBattleUnit(s,activeIds[0]!).parts.find(w=>w.partId===id)!.level).weaponFamily!=="slash"||input.attacks.some(a=>a.effectKind==="slash")) ?? input.attacks.flatMap(a=>a.normalWeaponId?[a.normalWeaponId]:[]),
    kind: input.attackKind ?? input.swordUse?.attack ?? (input.members[0]?.action.kind==="normal-attack"?"normal":"special"),
    hit: events.some(e=>e.sourceId===activeIds[0]&&e.targetId!==e.sourceId&&e.damage!==null),
    killed: robotAttackKilledEnemy(s,reaction.state,events,activeIds[0]!)
  });
  return settleRobotBattleDamageAction(s, prepared.units, newAttackIds, events, facilityAttacks, { actionId: input.actionId, summary }, prepared);
}
