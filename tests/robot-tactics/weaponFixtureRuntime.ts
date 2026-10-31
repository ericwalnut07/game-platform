import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { emptyRobotBattleSelection } from "../../src/client/games/robot-tactics/BattleViewModel";
import type { RobotBattleSessionAdapter } from "../../src/client/games/robot-tactics/BattleSessionBridge";
import { beginRobotBattleTurn, commitRobotBattlePassive, configureRobotBattleAi, decodeRobotBattleCore, getRobotBattlePendingActors, getRobotBattleResult, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleWeaponCombo } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotOfflineAvailability, robotRecord } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotPartyEquipmentPlan } from "../../src/games/robot-tactics/equipment";
import type { RobotJson, RobotOfflineRuntime } from "../../src/games/robot-tactics/offlineSession";
import { weaponCoreFixture, weaponFixtureProgress } from "./weaponCoreFixture";

const json=(value:unknown):RobotJson=>JSON.parse(JSON.stringify(value)) as RobotJson;
export type WeaponFixtureCase="two-hit"|"lethal"|"win";
/** Real action/HP/EN/objective/codec/session pipeline, with TEST-ONLY setup and
 * next-controlled-actor order. This never registers a production runtime/AI.
 */
export function createWeaponFixtureRuntime(kind:WeaponFixtureCase):RobotOfflineRuntime{
  return{
    id:"test-only-weapon-core:"+kind,version:1,
    readiness:key=>key.missionNumber===(kind==="win"?2:30)&&key.difficulty==="normal"?[]:["unsupported-fixture"],
    create:departure=>{
      const id=kind==="win"?"commander":"enemy-supreme-commander";
      return json(weaponCoreFixture({id:departure.battleId,mission:kind==="win"?2:30,progress:{...weaponFixtureProgress(),party:departure.party},sourceHp:kind==="lethal"?1:25,targetIds:[id],offsets:[{x:-1,y:0}],...(kind==="win"?{targetHp:{commander:1}}:{}),carryingData:kind==="lethal"}));
    },
    validate:(snapshot,departure)=>{
      const s=decodeRobotBattleCore(snapshot);
      if(s.id!==departure.battleId||JSON.stringify(s.key)!==JSON.stringify(departure.key))throw new Error("Weapon fixture departure mismatch");
      const expected=getRobotPartyEquipmentPlan(departure.party,getRobotOfflineAvailability(weaponFixtureProgress()));
      for(const [i,p]of expected.robots.entries()){
        const unit=getRobotBattleUnit(s,"p"+(i+1)),build=departure.party[i]!;
        if(JSON.stringify(unit.parts)!==JSON.stringify(Object.values(build.basic))||unit.maxHp!==p.baseStatsBeforeAddons.hp||unit.energy.maxEn!==p.baseStatsBeforeAddons.en)throw new Error("Weapon fixture equipment mismatch");
      }
    },
    configureAi:(snapshot,change)=>json(configureRobotBattleAi(decodeRobotBattleCore(snapshot),change)),
    act:(snapshot,request)=>{
      let s=decodeRobotBattleCore(snapshot);const action=robotRecord(request),actor=s.turn.actorId;
      const identity={actionId:s.id+":fixture-action:"+s.actionIds.length,turnId:robotBattleTurnId(s)};
      if(action.kind==="combo"&&actor==="p1")s=commitRobotBattleWeaponCombo(s,{...identity,primaryWeaponId:"double-edged-sword",secondaryWeaponId:"light-lance",targetIds:[kind==="win"?"commander":"enemy-supreme-commander"]});
      else if(action.kind==="wait")s=commitRobotBattlePassive(s,{...identity,kind:"wait"});
      else throw new Error("Illegal fixture command; outcome must come from Core");
      const result=getRobotBattleResult(s),summary=s.latest!.summary;
      if(result.result==="ongoing"){
        const next=getRobotBattlePendingActors(s).find(a=>a.unitIds.length===1&&getRobotBattleUnit(s,a.unitIds[0]!).kind==="controlled");
        if(next)s=beginRobotBattleTurn(s,next.id);
      }
      return{snapshot:json(s),actorKind:"controlled",summary,outcome:result.result==="ongoing"?null:{result:result.result,endedRound:s.allied.round,subobjectiveAchieved:false}};
    }
  };
}

export const weaponFixtureAdapter:RobotBattleSessionAdapter={
  project:battle=>{
    const s=decodeRobotBattleCore(battle.snapshot),active=s.turn.actorId;
    const command=active==="p1"?{id:"combo",label:"二武器連撃",category:"special" as const,disabledReason:null}:{id:"wait",label:"待機",category:"wait" as const,disabledReason:null};
    const target=s.key.missionNumber===2?"commander":"enemy-supreme-commander";
    return projectRobotBattleCore(s,{battleId:battle.departure.battleId,sequence:battle.sequence},{commands:active?[command]:[],choices:active?[{id:"fixture-choice",commandId:command.id,selection:active==="p1"?{...emptyRobotBattleSelection(),targetIds:[target]}:emptyRobotBattleSelection(),payload:{kind:command.id}}]:[]});
  },
  chooseAiAction:()=>{throw new Error("No provisional AI planner is installed in the connected weapon fixture");}
};
