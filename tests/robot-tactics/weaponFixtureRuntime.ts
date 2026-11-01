import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { emptyRobotBattleSelection } from "../../src/client/games/robot-tactics/BattleViewModel";
import type { RobotBattleSessionAdapter } from "../../src/client/games/robot-tactics/BattleSessionBridge";
import { beginRobotBattleTurn, commitRobotBattlePassive, commitRobotBattleShield, configureRobotBattleAi, decodeRobotBattleCore, getRobotBattlePendingActors, getRobotBattleResult, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleNormalAttack, commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo, getRobotBattleNormalAttackOptions, getRobotBattleSweepOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotOfflineAvailability, robotRecord } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotPartyEquipmentPlan, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotShieldActionPlan } from "../../src/games/robot-tactics/equipmentEffects";
import type { RobotJson, RobotOfflineRuntime } from "../../src/games/robot-tactics/offlineSession";
import { weaponCoreFixture, weaponEnergyFixtureProgress, weaponFixtureProgress } from "./weaponCoreFixture";
import { commitWeaponShieldFixtureEnemyAttack, weaponShieldFixtureProgress } from "./weaponShieldFixture";
import { weaponSweepFixtureProgress } from "./weaponSweepFixture";
import { isWeaponNormalFixtureCase, normalFixtureWeapon, weaponNormalFixtureProgress, type WeaponNormalFixtureCase } from "./weaponNormalFixture";

const json=(value:unknown):RobotJson=>JSON.parse(JSON.stringify(value)) as RobotJson;
export type WeaponFixtureCase="two-hit"|"lethal"|"win"|"addon-energy"|"shield"|"shield-base"|"sweep"|"sweep-expanded"|WeaponNormalFixtureCase;
const normalCase = isWeaponNormalFixtureCase;
const assaultCase = (kind: WeaponFixtureCase) => normalCase(kind) && resolveRobotBasicPart(normalFixtureWeapon(kind), 1).weaponFamily === "assault";
const shieldCase = (kind: WeaponFixtureCase) => kind === "shield" || kind === "shield-base";
const sweepCase = (kind: WeaponFixtureCase) => kind === "sweep" || kind === "sweep-expanded";
export const weaponProgressForCase = (kind: WeaponFixtureCase) => normalCase(kind) ? weaponNormalFixtureProgress(normalFixtureWeapon(kind), kind === "normal-railgun" ? 10 : 1) : sweepCase(kind) ? weaponSweepFixtureProgress(kind === "sweep-expanded") : shieldCase(kind) ? weaponShieldFixtureProgress(kind === "shield") : kind === "addon-energy" ? weaponEnergyFixtureProgress() : weaponFixtureProgress();
/** Real action/HP/EN/objective/codec/session pipeline, with TEST-ONLY setup and
 * next-controlled-actor order. This never registers a production runtime/AI.
 */
export function createWeaponFixtureRuntime(kind:WeaponFixtureCase):RobotOfflineRuntime{
  const progress = () => weaponProgressForCase(kind), mission = kind === "win" || shieldCase(kind) ? 2 : 30;
  return{
    id:"test-only-weapon-core:"+kind,version:1,
    readiness:key=>key.missionNumber===mission&&key.difficulty==="normal"?[]:["unsupported-fixture"],
    create:departure=>{
      if (normalCase(kind)) {
        const range = resolveRobotBasicPart(normalFixtureWeapon(kind), 1).range!;
        return json(weaponCoreFixture({ id: departure.battleId, mission: 30, progress: { ...progress(), party: departure.party }, sourceHp: 150, fillSourceEn: false, targetIds: ["enemy-supreme-commander"], offsets: [{ x: Math.max(range.min, Math.min(2, range.max)), y: 0 }] }));
      }
      if (sweepCase(kind)) return json(weaponCoreFixture({ id: departure.battleId, mission: 30, progress: { ...progress(), party: departure.party }, sourceHp: 150, fillSourceEn: false }));
      const id=mission===2?"commander":"enemy-supreme-commander";
      return json(weaponCoreFixture({id:departure.battleId,mission,progress:{...progress(),party:departure.party},sourceHp:kind==="lethal"?1:shieldCase(kind)?150:25,targetIds:[id],offsets:[{x:-1,y:0}],...(kind==="win"?{targetHp:{commander:1}}:{}),carryingData:kind==="lethal",fillSourceEn:kind!=="addon-energy"}));
    },
    validate:(snapshot,departure)=>{
      const s=decodeRobotBattleCore(snapshot);
      if(s.id!==departure.battleId||JSON.stringify(s.key)!==JSON.stringify(departure.key))throw new Error("Weapon fixture departure mismatch");
      const expected=getRobotPartyEquipmentPlan(departure.party,getRobotOfflineAvailability(progress()));
      for(const [i,p]of expected.robots.entries()){
        const unit=getRobotBattleUnit(s,"p"+(i+1)),build=departure.party[i]!;
        if(JSON.stringify(unit.parts)!==JSON.stringify(Object.values(build.basic))||JSON.stringify(unit.addons??[])!==JSON.stringify(build.addons)||unit.maxHp!==p.baseStatsBeforeAddons.hp||unit.energy.maxEn!==p.baseStatsBeforeAddons.en)throw new Error("Weapon fixture equipment mismatch");
      }
    },
    configureAi:(snapshot,change)=>json(configureRobotBattleAi(decodeRobotBattleCore(snapshot),change)),
    act:(snapshot,request)=>{
      let s=decodeRobotBattleCore(snapshot);const action=robotRecord(request),actor=s.turn.actorId;
      const identity={actionId:s.id+":fixture-action:"+s.actionIds.length,turnId:robotBattleTurnId(s)};
      const actorKind = actor === "commander" || actor === "enemy-supreme-commander" ? "enemy" as const : "controlled" as const;
      if(action.kind==="combo"&&actor==="p1")s=commitRobotBattleWeaponCombo(s,{...identity,primaryWeaponId:"double-edged-sword",secondaryWeaponId:"light-lance",targetIds:[kind==="win"?"commander":"enemy-supreme-commander"]});
      else if(action.kind==="normal"&&normalCase(kind)&&actor==="p1") {
        if (typeof action.targetId !== "string") throw new Error("Explicit normal target ID required");
        s = commitRobotBattleNormalAttack(s, { ...identity, weaponId: normalFixtureWeapon(kind), targetId: action.targetId });
      }
      else if(action.kind==="normal"&&actor==="p1"&&kind==="addon-energy")s=commitRobotBattleSlashAttack(s,{...identity,weaponId:"light-blade",kind:"normal",targetIds:["enemy-supreme-commander"]});
      else if(action.kind==="charge"&&kind==="addon-energy")s=commitRobotBattlePassive(s,{...identity,kind:"charge"});
      else if(action.kind==="shield"&&shieldCase(kind))s=commitRobotBattleShield(s,identity);
      else if(action.kind==="shield-fixture-attack"&&shieldCase(kind))s=commitWeaponShieldFixtureEnemyAttack(s,identity);
      else if(action.kind==="assault-fixture-wait"&&assaultCase(kind)&&actor==="enemy-supreme-commander")s=commitRobotBattlePassive(s,{...identity,kind:"wait"});
      else if(action.kind==="sweep"&&sweepCase(kind)&&actor==="p1") {
        if (!Array.isArray(action.targetIds) || action.targetIds.some(id => typeof id !== "string")) throw new Error("Explicit sweep target IDs required");
        s = commitRobotBattleSlashAttack(s, { ...identity, weaponId: "double-edged-sword", kind: "sweep", targetIds: action.targetIds as string[] });
      }
      else if(action.kind==="wait")s=commitRobotBattlePassive(s,{...identity,kind:"wait"});
      else throw new Error("Illegal fixture command; outcome must come from Core");
      const result=getRobotBattleResult(s),summary=s.latest!.summary;
      if(result.result==="ongoing"){
        const next=getRobotBattlePendingActors(s).find(a=>shieldCase(kind)&&action.kind==="shield"?a.id==="commander":assaultCase(kind)&&action.kind==="normal"?a.id==="enemy-supreme-commander":a.unitIds.length===1&&getRobotBattleUnit(s,a.unitIds[0]!).kind==="controlled");
        if(next)s=beginRobotBattleTurn(s,next.id);
      }
      return{snapshot:json(s),actorKind,summary,outcome:result.result==="ongoing"?null:{result:result.result,endedRound:s.allied.round,subobjectiveAchieved:false}};
    }
  };
}

export const weaponFixtureAdapter:RobotBattleSessionAdapter={
  project:battle=>{
    const s=decodeRobotBattleCore(battle.snapshot),active=s.turn.actorId;
    const kind = battle.runtimeId.slice("test-only-weapon-core:".length) as WeaponFixtureCase;
    if (normalCase(kind) && active === "p1") {
      const options = getRobotBattleNormalAttackOptions(s, normalFixtureWeapon(kind));
      const command = { id: "normal", label: `${options.label}（射程${options.range.min}〜${options.range.max}・EN${options.energyCost}）`, category: "attack" as const, disabledReason: options.disabledReason };
      return projectRobotBattleCore(s, { battleId: battle.departure.battleId, sequence: battle.sequence }, { commands: [command], choices: options.targetIds.map(targetId => ({ id: "normal:" + targetId, commandId: "normal", selection: { ...emptyRobotBattleSelection(), targetIds: [targetId] }, payload: { kind: "normal", targetId } })) });
    }
    const sweep = battle.runtimeId === "test-only-weapon-core:sweep" || battle.runtimeId === "test-only-weapon-core:sweep-expanded";
    if (sweep && active === "p1") {
      const own = getRobotBattleUnit(s, "p1"), options = getRobotBattleSweepOptions(s, "double-edged-sword");
      const command = { id: "sweep", label: `薙ぎ払い（最大${options.plan.targetCap}体・EN${options.plan.energyCost}）`, category: "attack" as const, disabledReason: own.energy.en < options.plan.energyCost ? "EN不足" : options.targetSets.length ? null : "合法な対象がいません" };
      return projectRobotBattleCore(s, { battleId: battle.departure.battleId, sequence: battle.sequence }, { commands: [command], choices: options.targetSets.map((targetIds, i) => ({ id: "sweep:" + i, commandId: "sweep", selection: { ...emptyRobotBattleSelection(), targetIds }, payload: { kind: "sweep", targetIds: [...targetIds] } })) });
    }
    const energy = battle.runtimeId === "test-only-weapon-core:addon-energy";
    const shield = battle.runtimeId === "test-only-weapon-core:shield" || battle.runtimeId === "test-only-weapon-core:shield-base", first = s.actors.find(a => a.id === active)?.unitIds[0], controlled = first && getRobotBattleUnit(s, first).kind === "controlled";
    const own = getRobotBattleUnit(s, "p1"), cost = shield ? getRobotShieldActionPlan(own.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), own.addons ?? []).energyCost : 0;
    const command=shield&&active==="p1"?{id:"shield",label:`シールド（EN${cost}）`,category:"special" as const,disabledReason:own.energy.en<cost?"EN不足":null}:energy?(active==="p1"?{id:"normal",label:"通常斬撃",category:"attack" as const,disabledReason:null}:{id:"charge",label:"チャージ",category:"special" as const,disabledReason:null}):active==="p1"?{id:"combo",label:"二武器連撃",category:"special" as const,disabledReason:null}:{id:"wait",label:"待機",category:"wait" as const,disabledReason:null};
    const target=s.key.missionNumber===2?"commander":"enemy-supreme-commander";
    return projectRobotBattleCore(s,{battleId:battle.departure.battleId,sequence:battle.sequence},{commands:controlled?[command]:[],choices:controlled&&!command.disabledReason?[{id:"fixture-choice",commandId:command.id,selection:active==="p1"&&!shield?{...emptyRobotBattleSelection(),targetIds:[target]}:emptyRobotBattleSelection(),payload:{kind:command.id}}]:[]});
  },
  chooseAiAction:snapshot=>{const s=decodeRobotBattleCore(snapshot);if(s.turn.actorId==="commander"&&getRobotBattleUnit(s,"p1").shielded)return{kind:"shield-fixture-attack"};if(s.turn.actorId==="enemy-supreme-commander"&&getRobotBattleUnit(s,"p1").parts.some(p=>resolveRobotBasicPart(p.partId,p.level).weaponFamily==="assault"))return{kind:"assault-fixture-wait"};throw new Error("No provisional AI planner is installed in the connected weapon fixture");}
};
