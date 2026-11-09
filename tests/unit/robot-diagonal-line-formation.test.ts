import { describe, expect, it } from "vitest";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { beginRobotBattleTurn, decodeRobotBattleCore, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotFormationOptions, commitRobotFormation } from "../../src/games/robot-tactics/formations";
import { getRobotFormationPositionValue } from "../../src/games/robot-tactics/friendlyFormationAi";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";

const origin={x:5,y:5};
const at=(x:number,y:number)=>({x,y});
function fixture(behind:{x:number;y:number},ahead:{x:number;y:number},opts:{wall?:{x:number;y:number};friendly?:boolean;spent?:boolean;distance?:number}={}):RobotBattleCoreState{
  const original=createRobotFormalBattleState({battleId:"diagonal-line",key:{missionNumber:1,difficulty:"easy"},party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=original;
  const sourceId=opts.friendly?"friendly-1":"core-a";
  const allyId=opts.friendly?"core-a":"core-b";
  const enemy=core.units.find(u=>!["controlled","friendly-ai"].includes(u.kind))!;
  const s={...decodeRobotBattleCore(core),board:{...core.board,walls:opts.wall?[opts.wall]:[]},
    ai:{...core.ai,allowFormations:opts.friendly?true:core.ai.allowFormations},
    spentFormations:opts.spent?["line"]:[],
    units:core.units.map(u=>{
      const p=u.id===sourceId?origin:u.id===allyId?behind:u.id===enemy.id?ahead:null;
      return {...u,position:p,parts:u.id===sourceId?[{partId:"howitzer",level:1}]:u.parts,energy:u.id===sourceId?{...u.energy,en:u.energy.maxEn}:u.energy};
    })
  };
  return beginRobotBattleTurn(s,sourceId);
}
function selection(s:RobotBattleCoreState){
  return getRobotFormationOptions(s,"line","howitzer");
}
describe("eight-direction line formation",()=>{
  for(const [name,behind,ahead] of [
    ["north-south",at(5,4),at(5,6)],
    ["south-north",at(5,6),at(5,4)],
    ["west-east",at(4,5),at(6,5)],
    ["east-west",at(6,5),at(4,5)],
    ["northwest-southeast",at(4,4),at(6,6)],
    ["southeast-northwest",at(6,6),at(4,4)],
    ["northeast-southwest",at(6,4),at(4,6)],
    ["southwest-northeast",at(4,6),at(6,4)]
  ] as const)it("accepts "+name+" and commits using existing EN and round lock",()=>{
    const s=fixture(behind,ahead);
    const o=selection(s);
    expect(o.disabledReason).toBeNull();
    expect(o.selections).toHaveLength(1);
    const chosen=o.selections[0]!;
    const actor=s.units.find(u=>u.id==="core-a")!;
    const participant=s.units.find(u=>u.id===chosen.participantIds[0])!;
    const n=commitRobotFormation(s,{actionId:"line-"+name,turnId:robotBattleTurnId(s),kind:"line",weaponId:"howitzer",...chosen});
    expect(n.spentFormations).toContain("line");
    expect(n.latest?.damage[0]?.targetId).toBe(chosen.targetIds[0]);
    expect(n.latest?.damage[0]?.damage).toBeGreaterThan(0);
    expect(n.units.find(u=>u.id===participant.id)!.energy.en).toBe(participant.energy.en);
    expect(n.units.find(u=>u.id===actor.id)!.energy.en).toBeLessThan(actor.energy.en);
  });
  it("rejects a non-collinear enemy",()=>{
    const s=fixture(at(4,4),at(6,5));
    expect(selection(s).selections).toEqual([]);
  });
  it("rejects blocked diagonal LOS, but not unrelated walls",()=>{
    const blocked=fixture(at(4,4),at(7,7),{wall:at(6,6)});
    expect(selection(blocked).selections).toEqual([]);
    const clear=fixture(at(4,4),at(7,7),{wall:at(7,5)});
    expect(selection(clear).selections).toHaveLength(1);
  });
  it("rejects diagonal targets beyond weapon range",()=>{
    const s=fixture(at(4,4),at(13,13));
    expect(selection(s).selections).toEqual([]);
  });
  it("keeps one-use-per-round restriction",()=>{
    const s=fixture(at(4,4),at(6,6),{spent:true});
    expect(selection(s).disabledReason).toMatch(/使用済み/);
    expect(selection(s).selections).toEqual([]);
  });
  it("lets friendly AI initiate a diagonal line using the same Core candidates",()=>{
    const s=fixture(at(4,4),at(6,6),{friendly:true});
    const o=selection(s);
    expect(o.selections).toHaveLength(1);
    expect(o.selections[0]!.participantIds).toEqual(["core-a"]);
    expect(getRobotFormationPositionValue(s,"friendly-1")).toBeGreaterThan(0);
  });
  it("projects diagonal line target and participant to the production UI adapter",()=>{
    const s=fixture(at(4,4),at(6,6));
    const adapter=robotFormalBattleAdapter.project({departure:{battleId:s.id} as never,snapshot:s,sequence:1} as never);
    expect(adapter.choices.some(c=>c.commandId==="line:howitzer"&&c.selection.targetIds.length>0)).toBe(true);
  });
});
