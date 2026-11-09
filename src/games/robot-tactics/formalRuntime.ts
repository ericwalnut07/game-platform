import { getRobotSubobjectiveAchieved } from "./subobjectives";
import { commitRobotBattleNormalFacilityAttacks, getRobotBattleNormalFacilityTargets } from "./battleFacilityActions";
import { commitRobotHazardPlacement } from "./hazards";
import { commitRobotAfterAttack } from "./afterAttack";
import { commitRobotAdoptedAction } from "./adoptedEffects";
import { commitRobotRemainingStrike } from "./remainingCombat";
import { commitRobotFormation } from "./formations";
import { commitRobotDelayedFuse } from "./delayedFuse";
import { getRobotFusePolicy } from "./fuseTypes";
import { commitRobotBattleBlast } from "./battleBlast";
import { commitRobotActiveCombat } from "./activeCombat";
import { commitRobotDelta, commitRobotExtraMove, commitRobotSupport, commitRobotAddonStrike } from "./commonCombat";
import { advanceRobotBattleRound, beginRobotBattleTurn, commitRobotBattleDefend, commitRobotBattlePassive, commitRobotBattleShield, configureRobotBattleAi, commitRobotBattleData, decodeRobotBattleCore, getRobotBattleActor, getRobotBattlePendingActors, getRobotBattleResult, getRobotBattleUnit, moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "./battleState";
import { commitRobotBattleBurstAttack, commitRobotBattleNormalAttack, commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo } from "./battleWeaponActions";
import { commitRobotNpcTurn } from "./battleNpc";
import { createRobotStageEnemyUnits, createRobotFormalBattleState, createRobotFormalReinforcement, getRobotEnemyMovement } from "./stageDeployment";
import { getRobotInitiativeQueue } from "./initiative";
import { getRobotStagePlan } from "./stageCatalog";
import { robotCellToPosition } from "./movement";
import { robotRecord, robotSafeInteger, robotString } from "./offlineProgress";
import type { RobotJson, RobotOfflineDeparture, RobotOfflineRuntime } from "./offlineSession";

export const robotBattleJson = (value: unknown): RobotJson => JSON.parse(JSON.stringify(value)) as RobotJson;
/** Advance only completed turns/rounds. The saved snapshot fixes tie order and
 * speed until the next full round; defeated actors are skipped, never re-sorted.
 */
export function scheduleRobotFormalBattle(s: RobotBattleCoreState): RobotBattleCoreState {
  if (getRobotBattleResult(s).result !== "ongoing" || s.turn.actorId !== null) return s;
  if (!getRobotBattlePendingActors(s).length) {
    const stage = getRobotStagePlan(s.key);
    s = advanceRobotBattleRound(s, spawn => createRobotFormalReinforcement(stage, spawn));
  }
  if (getRobotBattleResult(s).result !== "ongoing") return s;
  return beginRobotBattleTurn(s, getRobotInitiativeQueue(s)[0]!);
}
function validate(snapshot: RobotJson, departure: RobotOfflineDeparture): void {
  const s = decodeRobotBattleCore(snapshot);
  if (s.fuses && JSON.stringify(s.fuses.policy) !== JSON.stringify(getRobotFusePolicy())) throw new Error("Formal fuse policy is not adopted/mismatched");
  if (s.id !== departure.battleId || s.key.missionNumber !== departure.key.missionNumber || s.key.difficulty !== departure.key.difficulty || !s.initiative) throw new Error("Formal departure/initiative mismatch");
  const canonical = createRobotFormalBattleState(departure), stage = getRobotStagePlan(s.key);
  if (s.sortieSubobjectiveEligible !== undefined && s.sortieSubobjectiveEligible !== canonical.sortieSubobjectiveEligible) throw new Error("Sortie objective differs from departure");
  const expected = [...canonical.units];
  const waveFacings = new Map<string, Set<string>>();
  if (s.objective.kind !== (departure.key.missionNumber === 1 ? "m01" : departure.key.missionNumber===2 ? "m02" : departure.key.missionNumber===30 ? "m30" : "early")) throw new Error("Formal objective differs from departure");
  for (const id of s.objective.kind === "m01" || s.objective.kind === "early" || s.objective.kind === "m30" ? s.objective.state.spawnedWaveIds : []) {
    const wave = stage.reinforcements.find(w => w.id === id);
    if (!wave) throw new Error("Unknown adopted reinforcement receipt");
    const members = createRobotStageEnemyUnits(stage, wave.squad);
    expected.push(...members);
    // Reinforcements may use adopted fallback cells when the preferred pads are
    // occupied. Facing is fixed at the actual spawn cell, not the catalogue's
    // preferred pad, so validate it against legal pads instead of demanding
    // the preferred pad's orientation on every later checkpoint.
    const chosenBranchId = s.objective.kind === "early" ? s.objective.state.waveBranch : null;
    const branch = wave.spawnBranches.length
      ? wave.spawnBranches.find(b => b.survivingDepotId === chosenBranchId)
      : undefined;
    const pads = wave.spawnBranches.length
      ? branch ? [...branch.memberCells, ...branch.fallbackCells] : []
      : [...wave.initialCells, ...wave.fallbackCells];
    if (!pads.length) throw new Error("Missing adopted reinforcement pads");
    for (const member of members) {
      waveFacings.set(member.id, new Set(pads.map(cell =>
        getRobotEnemyMovement(stage, wave.squad, member.stats.mov, robotCellToPosition(cell)).facing)));
    }
  }
  if (s.units.length !== expected.length || s.units.some(u => u.statuses.length)) throw new Error("Formal roster/status mismatch");
  for (const e of expected) {
    const u = getRobotBattleUnit(s, e.id);
    if (u.coreLevel !== undefined && u.coreLevel !== e.coreLevel) throw new Error("Formal core level differs from departure");
    const observedMovement = JSON.stringify(u.movement);
    const plannedMovement = JSON.stringify(e.movement);
    const legalFacing = waveFacings.get(e.id);
    const movementMatches = observedMovement === plannedMovement || (
      !!legalFacing && !!u.movement && !!e.movement && legalFacing.has(u.movement.facing) &&
      observedMovement === JSON.stringify({ ...e.movement, facing: u.movement.facing })
    );
    if (u.kind !== e.kind || u.number !== e.number || u.squadId !== e.squadId || u.chassis !== e.chassis || u.maxHp !== e.maxHp || u.energy.maxEn !== e.energy.maxEn || JSON.stringify(u.parts) !== JSON.stringify(e.parts) || JSON.stringify(u.addons ?? []) !== JSON.stringify(e.addons ?? []) || JSON.stringify(u.stats) !== JSON.stringify(e.stats) || !movementMatches) throw new Error("Formal unit differs from adopted departure: " + e.id);
  }
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(id => typeof id !== "string") || new Set(value).size !== value.length) throw new Error("Explicit distinct target IDs required");
  return value as string[];
}
/** Standalone production runtime; request payloads never choose bomb policy. */
export const robotFormalRuntime: RobotOfflineRuntime = {
  id: "robot-tactics-formal-m01", version: 1,
  readiness: key => ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 30].includes(key.missionNumber) ? ["このミッションの目標・AI統合は準備中です"] : getRobotStagePlan(key).blockingIssues,
  create: departure => robotBattleJson(scheduleRobotFormalBattle(createRobotFormalBattleState(departure))),
  validate,
  configureAi: (snapshot, change) => robotBattleJson(configureRobotBattleAi(decodeRobotBattleCore(snapshot), change)),
  act: (snapshot, raw) => {
    let s = decodeRobotBattleCore(snapshot);
    const request = robotRecord(raw), actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, actor.unitIds[0]!);
    const actorKind = unit.kind === "controlled" || unit.kind === "friendly-ai" ? unit.kind : "enemy";
    const identity = { actionId: s.id + ":action:" + s.actionIds.length, turnId: robotBattleTurnId(s) };
    if (actorKind !== "controlled") {
      if (request.kind !== "npc") throw new Error("NPC action required");
      s = commitRobotNpcTurn(s, identity);
    } else {
      switch (request.kind) {
        case "post-move": case "post-skip": case "chain-followup": { const cell=request.destination===undefined?undefined:robotRecord(request.destination); s=commitRobotAfterAttack(s,{...identity,kind:request.kind,...(request.weaponId===undefined?{}:{weaponId:robotString(request.weaponId)}),...(request.targetId===undefined?{}:{targetId:robotString(request.targetId)}),...(cell?{destination:{x:robotSafeInteger(cell.x),y:robotSafeInteger(cell.y)}}:{})}); break; }
        case "proximity-mine": case "movement-interference-field": { const cell=robotRecord(request.cell); s=commitRobotHazardPlacement(s,{...identity,kind:request.kind,cell:{x:robotSafeInteger(cell.x),y:robotSafeInteger(cell.y)}}); break; }
        case "move": {
          const cell = robotRecord(request.destination);
          s = moveRobotBattleUnit(s, { ...identity, unitId: unit.id, destination: { x: robotSafeInteger(cell.x), y: robotSafeInteger(cell.y) } }); break;
        }
        case "line": case "pair-defense": case "pincer": case "protection": s = commitRobotFormation(s, { ...identity, kind: request.kind, weaponId: robotString(request.weaponId), participantIds: strings(request.participantIds), targetIds: strings(request.targetIds) }); break;
        case "overwatch": case "charge-strike": case "super-charge": case "burning-round": case "hp-heal": case "self-heal": case "pull-strike": case "epicenter-echo": s = commitRobotActiveCombat(s, { ...identity, kind: request.kind, ...(request.weaponId === undefined ? {} : { weaponId: robotString(request.weaponId) }), targetIds: strings(request.targetIds) }); break;
        case "delta": s = commitRobotDelta(s, { ...identity, weaponId: robotString(request.weaponId), participantIds: strings(request.participantIds), targetIds: strings(request.targetIds) }); break;
        case "extra-move": { const cell = robotRecord(request.destination); s = commitRobotExtraMove(s, { ...identity, destination: { x: robotSafeInteger(cell.x), y: robotSafeInteger(cell.y) } }); break; }
        case "en-supply": case "cleanse": s = commitRobotSupport(s, { ...identity, kind: request.kind, targetId: robotString(request.targetId), ...(request.weaponId === undefined ? {} : { weaponId: robotString(request.weaponId) }) }); break;
        case "close-sniper": case "blade-vault": s = commitRobotAddonStrike(s, { ...identity, kind: request.kind, weaponId: robotString(request.weaponId), targetId: robotString(request.targetId) }); break;
        case "sniper-penetration": case "thrust-linear-pierce": case "anti-materiel-focus": case "crush-immobilizer": case "function-lock-round": case "debuff-transfer-round": s = commitRobotRemainingStrike(s, { ...identity, kind: request.kind, weaponId: robotString(request.weaponId), targetIds: strings(request.targetIds) }); break;
        case "tactical-marking-attack": case "weakpoint-targeting": case "projected-defense": case "tactical-decoy": case "resupply-field": case "tactical-teleport-beacon": {
          const cell=request.cell===undefined?undefined:robotRecord(request.cell);
          s=commitRobotAdoptedAction(s,{...identity,kind:request.kind,...(request.weaponId===undefined?{}:{weaponId:robotString(request.weaponId)}),...(request.targetId===undefined?{}:{targetId:robotString(request.targetId)}),...(cell?{cell:{x:robotSafeInteger(cell.x),y:robotSafeInteger(cell.y)}}:{})});break;
        }
        case "pickup": case "transmit": s=commitRobotBattleData(s,{...identity,kind:request.kind}); break;
        case "normal": {
          const weaponId=robotString(request.weaponId),targetId=robotString(request.targetId);
          const object=[4,11].includes(s.key.missionNumber)?getRobotBattleNormalFacilityTargets(s,unit.id,weaponId).find(o=>o.objectId===targetId):undefined;
          s=object?commitRobotBattleNormalFacilityAttacks(s,{...identity,attacks:[{unitId:unit.id,weaponId,...object}]}):commitRobotBattleNormalAttack(s,{...identity,weaponId,targetId});break;
        }
        case "delayed-fuse": s = commitRobotDelayedFuse(s, { ...identity, weaponId: robotString(request.weaponId), targetId: robotString(request.targetId) }); break;
        case "sweep": s = commitRobotBattleSlashAttack(s, { ...identity, weaponId: robotString(request.weaponId), kind: "sweep", targetIds: strings(request.targetIds) }); break;
        case "burst": s = commitRobotBattleBurstAttack(s, { ...identity, weaponId: robotString(request.weaponId), centerId: robotString(request.centerId), neighborIds: strings(request.neighborIds) }); break;
        case "blast": {
          if (!Array.isArray(request.locations) || (request.mode !== "burst" && request.mode !== "double" && request.mode !== "fire")) throw new Error("Explicit blast locations required");
          const locations = request.locations.map(raw => { const l = robotRecord(raw), c = robotRecord(l.cell); return { cell: { x: robotSafeInteger(c.x), y: robotSafeInteger(c.y) }, neighborIds: strings(l.neighborIds) }; });
          s = commitRobotBattleBlast(s, { ...identity, weaponId: robotString(request.weaponId), mode: request.mode, locations }); break;
        }
        case "combo": s = commitRobotBattleWeaponCombo(s, { ...identity, primaryWeaponId: robotString(request.primaryWeaponId), secondaryWeaponId: robotString(request.secondaryWeaponId), targetIds: strings(request.targetIds) }); break;
        case "defend": s = commitRobotBattleDefend(s, identity); break;
        case "shield": s = commitRobotBattleShield(s, identity); break;
        case "charge": case "wait": s = commitRobotBattlePassive(s, { ...identity, kind: request.kind }); break;
        default: throw new Error("Unknown formal battle action");
      }
    }
    const summary = s.latest!.summary;
    s = scheduleRobotFormalBattle(s);
    const result = getRobotBattleResult(s).result;
    return { snapshot: robotBattleJson(s), actorKind, summary, outcome: result === "ongoing" ? null : { result, endedRound: s.allied.round, subobjectiveAchieved: getRobotSubobjectiveAchieved(s) } };
  }
};
