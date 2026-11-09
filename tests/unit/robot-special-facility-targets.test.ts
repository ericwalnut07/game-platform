import { describe, expect, it } from "vitest";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import type { RobotJson } from "../../src/games/robot-tactics/offlineSession";
import { beginRobotBattleTurn, decodeRobotBattleCore, getRobotBattleFacilities, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { getRobotSpecialFacilityCells } from "../../src/games/robot-tactics/specialFacilityActions";
import { getRobotActiveCombatOptions, commitRobotActiveCombat, getRobotChargeFacilityLanding } from "../../src/games/robot-tactics/activeCombat";
import { getRobotBattleBurstOptions, commitRobotBattleBurstAttack, getRobotBattleSpreadOptions, commitRobotBattleSpreadAttack, commitRobotBattleWeaponCombo, getRobotSpecialWeaponPacket } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotRemainingStrikeOptions, commitRobotRemainingStrike } from "../../src/games/robot-tactics/remainingCombat";
import { getRobotBattleBlastOptions, commitRobotBattleBlast } from "../../src/games/robot-tactics/battleBlast";
import { getRobotAddonStrikeOptions, commitRobotAddonStrike } from "../../src/games/robot-tactics/commonCombat";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { createRobotRoundInitiative } from "../../src/games/robot-tactics/initiative";

const depot="depot-left", actor="core-a";
const identity=(s:RobotBattleCoreState,id="special-facility-action")=>({actionId:id,turnId:robotBattleTurnId(s)});
const hp=(s:RobotBattleCoreState,id=depot)=>getRobotBattleFacilities(s).find(o=>o.id===id)!.hp;
function scene(
  weapon1:string, weapon2="light-pistol", addons:readonly string[]=[], position="D6", moved=false, mission:4|5|11=4,
) {
  const deployed=createRobotFormalBattleState({battleId:"special-objects-"+mission,key:{missionNumber:mission,difficulty:"easy"},party:createRobotOfflineProgress().party});
  const {initiative:_old,...base}=deployed;
  const state=decodeRobotBattleCore({...base,units:base.units.map(u=>u.id===actor?{
    ...u,position:cell(position),parts:[{partId:weapon1,level:1},{partId:weapon2,level:1}],
    addons:addons.map(partId=>({partId})),energy:{...u.energy,en:u.energy.maxEn,moved},
  }:u)});
  return beginRobotBattleTurn(state,actor);
}
function afterHit(before:RobotBattleCoreState,after:RobotBattleCoreState,id=depot){
  expect(after.latest!.damage.some(d=>d.targetId===id&&d.damage!==null&&(d.damage??0)>0)).toBe(true);
  expect(hp(after,id)).toBeLessThan(hp(before,id));
  expect(getRobotBattleUnit(after,actor).energy.action).not.toBeNull();
  expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(after)))).toEqual(after);
}
describe("damage specials target hostile facility shared HP without pseudo robot/status",()=>{
  it("direct ranged special packet, burn and function lock deal HP damage without adding object statuses",()=>{
    const s=scene("assault-rifle","light-pistol",["burning-round"]);
    const cells=getRobotSpecialFacilityCells(s,actor,"assault-rifle",{min:1,max:3});
    expect(cells.some(o=>o.objectId===depot)).toBe(true);
    expect(getRobotActiveCombatOptions(s,"burning-round","assault-rifle").targetIds).toContain(depot);
    afterHit(s,commitRobotActiveCombat(s,{...identity(s),kind:"burning-round",weaponId:"assault-rifle",targetIds:[depot]}));
    const locked=scene("corrosion-rifle","light-pistol",["function-lock-round"]);
    expect(getRobotRemainingStrikeOptions(locked,"function-lock-round","corrosion-rifle").targetSets).toContainEqual([depot]);
    afterHit(locked,commitRobotRemainingStrike(locked,{...identity(locked),kind:"function-lock-round",weaponId:"corrosion-rifle",targetIds:[depot]}));
  });
  it("normal and super charges stop before the depot, do not push it and settle once",()=>{
    function chargeState(addons:readonly string[],distance:number,advance:number) {
      const base=scene("light-blade","light-pistol",addons),occupied=base.units.filter(u=>u.id!==actor&&u.hp>0&&u.position).map(u=>u.position!);
      const blocked=[...occupied,...base.board.walls,...getRobotBattleFacilities(base).flatMap(o=>o.cells)];
      for(let y=0;y<base.board.height;y++)for(let x=0;x<base.board.width;x++){
        if(blocked.some(c=>c.x===x&&c.y===y))continue;
        const test=decodeRobotBattleCore({...base,units:base.units.map(u=>u.id===actor?{...u,position:{x,y},energy:{...u.energy,moved:true}}:u)});
        const approach=getRobotChargeFacilityLanding(test,actor,depot,advance,distance);
        if(approach&&getRobotActiveCombatOptions(test,advance===1?"charge-strike":"super-charge","light-blade").targetIds.includes(depot))return{test,approach};
      }
      throw new Error("No legal charge route in real M04 terrain");
    }
    for(const [addons,distance,advance,kind]of [
      [[],2,1,"charge-strike"],[["super-charge-thruster"],3,2,"super-charge"],
    ] as const){
      const {test,approach}=chargeState(addons,distance,advance);
      const after=commitRobotActiveCombat(test,{...identity(test),kind,weaponId:"light-blade",targetIds:[depot]});
      afterHit(test,after);
      expect(getRobotBattleUnit(after,actor).position).toEqual(approach.landing);
      expect(getRobotBattleFacilities(after).flatMap(o=>o.cells)).not.toContainEqual(approach.landing);
      expect(after.latest!.damage.filter(d=>d.targetId===depot)).toHaveLength(1);
    }
  });
  it("blast center, automatic spread and same-family weapon combo hit only the depot pool",()=>{
    const burst=scene("howitzer","light-pistol");
    expect(getRobotBattleBurstOptions(burst,"howitzer").centers.some(c=>c.centerId===depot)).toBe(true);
    afterHit(burst,commitRobotBattleBurstAttack(burst,{...identity(burst),weaponId:"howitzer",centerId:depot,neighborIds:[]}));
    const spread=scene("assault-rifle","howitzer");
    expect(getRobotBattleSpreadOptions(spread,"assault-rifle","howitzer").centers.some(c=>c.centerId===depot)).toBe(true);
    afterHit(spread,commitRobotBattleSpreadAttack(spread,{...identity(spread),primaryWeaponId:"assault-rifle",secondaryWeaponId:"howitzer",centerId:depot}));
    const combo=scene("assault-rifle","light-pistol");
    afterHit(combo,commitRobotBattleWeaponCombo(combo,{...identity(combo),primaryWeaponId:"assault-rifle",secondaryWeaponId:"light-pistol",targetIds:[depot]}));
  });
  it("persistent fire may land on a hostile facility without making its tile passable",()=>{
    const s=scene("howitzer","light-pistol",["persistent-blast-fire"]);
    const choices=getRobotBattleBlastOptions(s,"howitzer","fire");
    const candidate=choices.centers.find(c=>c.targetId===depot);
    expect(candidate).toBeDefined();
    const after=commitRobotBattleBlast(s,{...identity(s),weaponId:"howitzer",mode:"fire",locations:[{cell:candidate!.cell,neighborIds:[]}]});
    afterHit(s,after);
  });
  it("special armor-piercing and legal close sniper attacks settle facility damage",()=>{
    const focus=scene("superheavy-railgun","light-pistol",["anti-materiel-focus"]);
    expect(getRobotRemainingStrikeOptions(focus,"anti-materiel-focus","superheavy-railgun").targetSets).toContainEqual([depot]);
    afterHit(focus,commitRobotRemainingStrike(focus,{...identity(focus),kind:"anti-materiel-focus",weaponId:"superheavy-railgun",targetIds:[depot]}));
    const close=scene("sniper-rifle","light-pistol",["close-range-sniper"],"D4");
    expect(getRobotAddonStrikeOptions(close,"close-sniper","sniper-rifle").targets.some(t=>t.targetId===depot)).toBe(true);
    afterHit(close,commitRobotAddonStrike(close,{...identity(close),kind:"close-sniper",weaponId:"sniper-rifle",targetId:depot}));
  });
  it("production battle adapter advertises hostile facility selections in spread and ordinary combos",()=>{
    const formal=(s:RobotBattleCoreState)=>{
      const fresh={...s,turn:{...s.turn,actorId:null,actedActorIds:[]}};
      const initiative=createRobotRoundInitiative(fresh);
      const preceding=initiative.entries.slice(0,initiative.entries.findIndex(e=>e.actorId===actor)).map(e=>e.actorId);
      const valid=decodeRobotBattleCore({...s,initiative,turn:{...s.turn,actedActorIds:preceding}});
      return robotFormalBattleAdapter.project({
        runtimeId:"robot-tactics-formal",runtimeVersion:1,
        departure:{battleId:s.id,key:s.key,party:createRobotOfflineProgress().party},
        sequence:0,committedActionIds:[],snapshot:valid as unknown as RobotJson,latestSummary:"test",
      });
    };
    const spread=formal(scene("assault-rifle","howitzer"));
    expect(spread.commands.find(c=>c.id==="combo")?.immediateTargetTap).toBe(true);
    expect(spread.choices.some(c=>c.commandId==="combo"&&c.selection.targetIds.includes(depot))).toBe(true);
    expect(spread.structures.find(o=>o.id===depot)?.hostile).toBe(true);
    const same=formal(scene("assault-rifle","light-pistol"));
    expect(same.choices.some(c=>c.commandId==="combo"&&c.selection.targetIds.includes(depot))).toBe(true);
  });
  it("does not expose friendly convoy as a target; rejects forged facility selection atomically",()=>{
    const convoy=scene("assault-rifle","light-pistol",["burning-round"],"D6",false,5);
    expect(getRobotSpecialFacilityCells(convoy,actor,"assault-rifle",{min:1,max:3}).some(o=>o.objectId==="convoy")).toBe(false);
    expect(getRobotActiveCombatOptions(convoy,"burning-round","assault-rifle").targetIds).not.toContain("convoy");
    expect(()=>getRobotSpecialWeaponPacket(convoy,"assault-rifle","convoy","forged",{min:1,max:3},.5)).toThrow();
    expect(()=>commitRobotActiveCombat(convoy,{...identity(convoy),kind:"burning-round",weaponId:"assault-rifle",targetIds:["convoy"]})).toThrow();
  });
});
