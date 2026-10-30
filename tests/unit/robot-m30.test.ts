import { describe, expect, it } from "vitest";
import { applyRobotM30AlliedDefeats, applyRobotM30BossHit, applyRobotM30FacilityAttack, commitRobotM30DataAction, createRobotM30State, finishRobotM30Round, recordRobotM30BossDefeat, ROBOT_M30_DATA_ID, spawnRobotM30Reinforcements, type RobotM30State } from "../../src/games/robot-tactics/m30Mission";
import { createRobotBossState } from "../../src/games/robot-tactics/bossCommands";
import { applyRobotAlliedDefeats, createRobotAlliedLifecycle, type RobotAlliedLifeUnit } from "../../src/games/robot-tactics/alliedLifecycle";
import { beginRobotEnergyTurn, commitRobotEnergyAction, createRobotEnergyState, endRobotEnergyTurn, recordRobotEnergyMove } from "../../src/games/robot-tactics/energy";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";

const actor = (id="p1",cell="K3",kind:RobotAlliedLifeUnit["kind"]="controlled"):RobotAlliedLifeUnit => ({id,kind,number:id==="p1"?1:id==="p2"?2:3,hp:60,maxHp:100,en:30,maxEn:100,position:robotCellToPosition(cell),statuses:[],carriedObjectiveId:null});
const energy=()=>beginRobotEnergyTurn(createRobotEnergyState(100));
function upload(state:RobotM30State) {
  const p=commitRobotM30DataAction(state,actor(),energy(),"pickup");
  const e=beginRobotEnergyTurn(endRobotEnergyTurn(p.energy));
  return commitRobotM30DataAction(p.state,{...p.actor,position:robotCellToPosition("I14"),en:e.en},e,"transmit").state;
}
function advance(state:RobotM30State, round:number) { let s=state;while(s.round<round)s=finishRobotM30Round(s,s.round);return s; }

describe("M30 adopted shared facility",()=>{
  it.each([['easy',500,55],['normal',540,80],['hard',660,110]] as const)("%s exact HP/DEF and two shared cells",(d,hp,def)=>{
    const s=createRobotM30State(d);expect([s.facility.hp,s.facility.maxHp,s.facility.def]).toEqual([hp,hp,def]);
    expect(s.facility.cells).toEqual([robotCellToPosition("J13"),robotCellToPosition("K13")]);
    const plan=getRobotStagePlan({missionNumber:30,difficulty:d});
    const condition=(plan.objective.specification.conditions as {structure?:{maxHp:number;def:number}}[])[0]!;
    expect([condition.structure!.maxHp,condition.structure!.def]).toEqual([hp,def]);
  });
  it("subtracts one entity hit despite two blast cells, deduplicates replay and never heals",()=>{
    const s=createRobotM30State("hard"),attack={attackId:"blast-1",hitCells:s.facility.cells,damage:100};
    const hit=applyRobotM30FacilityAttack(s,attack);expect(hit.facility.hp).toBe(560);expect(s.facility.hp).toBe(660);
    expect(applyRobotM30FacilityAttack(hit,{...attack,hitCells:[s.facility.cells[1]!]})).toBe(hit);
    expect(finishRobotM30Round(hit,1).facility.hp).toBe(560);
    expect(applyRobotM30FacilityAttack(hit,{attackId:"miss",hitCells:[robotCellToPosition("A1")],damage:999})).toBe(hit);
    expect(()=>applyRobotM30FacilityAttack(hit,{...attack,attackId:"heal",damage:-1})).toThrow();
  });
  it("loses immediately at zero facility HP even with boss/data conditions complete",()=>{
    const s=recordRobotM30BossDefeat(upload(createRobotM30State("easy")),"enemy-supreme-commander");
    const lost=applyRobotM30FacilityAttack(s,{attackId:"fatal",hitCells:[s.facility.cells[1]!],damage:500});
    expect(lost.result).toBe("lost");expect(lost.resultReason).toBe("facility-destroyed");
    expect(()=>finishRobotM30Round(lost,1)).toThrow();
  });
});

describe("M30-only data actions",()=>{
  it("picks up after ordinary movement, uses the action, and cannot attack in the same turn",()=>{
    const e=recordRobotEnergyMove(energy(),"ordinary"),s=createRobotM30State("easy"),a={...actor(),en:e.en};
    const p=commitRobotM30DataAction(s,a,e,"pickup");
    expect(p.state.data).toEqual({cell:null,carrierId:"p1",sent:false});expect(p.actor.carriedObjectiveId).toBe(ROBOT_M30_DATA_ID);
    expect(p.energy.en).toBe(e.en);expect(p.energy.action?.kind).toBe("other");
    expect(()=>commitRobotEnergyAction(p.energy,{kind:"normal-attack",energyCost:0})).toThrow();
    expect(s.data.cell).toEqual(robotCellToPosition("K3"));expect(a.carriedObjectiveId).toBeNull();
  });
  it("requires the live controlled carrier at I14 and consumes one transmit action",()=>{
    const p=commitRobotM30DataAction(createRobotM30State("easy"),actor(),energy(),"pickup");
    expect(()=>commitRobotM30DataAction(p.state,p.actor,energy(),"transmit")).toThrow();
    const e=beginRobotEnergyTurn(endRobotEnergyTurn(p.energy));
    const sent=commitRobotM30DataAction(p.state,{...p.actor,en:e.en,position:robotCellToPosition("I14")},e,"transmit");
    expect(sent.state.data).toEqual({cell:null,carrierId:null,sent:true});expect(sent.actor.carriedObjectiveId).toBeNull();
    expect(sent.state.result).toBe("ongoing");expect(()=>commitRobotM30DataAction(sent.state,actor(),energy(),"pickup")).toThrow();
  });
  it("rejects friendly AI, defeated actors, wrong cells, closed/used turns and inconsistent EN atomically",()=>{
    const s=createRobotM30State("easy"),before=JSON.stringify(s);
    for (const a of [actor("f1","K3","friendly-ai"),{...actor(),hp:0},actor("p1","L3"),{...actor(),en:31}]) expect(()=>commitRobotM30DataAction(s,a,energy(),"pickup")).toThrow();
    expect(()=>commitRobotM30DataAction(s,actor(),createRobotEnergyState(100),"pickup")).toThrow();
    expect(()=>commitRobotM30DataAction(s,actor(),commitRobotEnergyAction(energy(),{kind:"other",energyCost:0}),"pickup")).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("integrates the common carrier death/drop and allows a different living controlled unit to retrieve",()=>{
    const p=commitRobotM30DataAction(createRobotM30State("easy"),actor(),energy(),"pickup");
    const lifecycle=createRobotAlliedLifecycle([p.actor,actor("p2","H4"),actor("p3","I4")]);
    const deaths=applyRobotAlliedDefeats(lifecycle,["p1"]),dropped=applyRobotM30AlliedDefeats(p.state,deaths);
    expect(dropped.data).toEqual({cell:robotCellToPosition("K3"),carrierId:null,sent:false});
    const recovered=commitRobotM30DataAction(dropped,actor("p2"),energy(),"pickup");expect(recovered.state.data.carrierId).toBe("p2");
    expect(()=>applyRobotM30AlliedDefeats(p.state,{...deaths,droppedObjectives:[]})).toThrow(/Missing/);
  });
  it("keeps the same-round controlled wipe as an immediate common loss",()=>{
    const common=createRobotAlliedLifecycle([actor(),actor("p2","H4"),actor("p3","I4")]);
    const lost=applyRobotM30AlliedDefeats(createRobotM30State("hard"),applyRobotAlliedDefeats(common,["p1","p2","p3"]));
    expect(lost.resultReason).toBe("same-round-controlled-wipe");expect(lost.result).toBe("lost");
  });
});

describe("M30 AND victory and wave timing",()=>{
  it("connects actual boss damage and death to the objective without early victory",()=>{
    const s=createRobotM30State("hard"),boss=createRobotBossState(30,"hard",robotCellToPosition("J4"));
    const first=applyRobotM30BossHit(s,boss,549);expect(first.boss.hp).toBe(1);expect(first.state.bossDefeated).toBe(false);
    const last=applyRobotM30BossHit(first.state,first.boss,1);expect(last.boss.hp).toBe(0);expect(last.state.bossDefeated).toBe(true);expect(last.state.result).toBe("ongoing");
  });
  it("accepts either boss/data order but never wins before the end of R16",()=>{
    for (const initial of [recordRobotM30BossDefeat(upload(createRobotM30State("easy")),"enemy-supreme-commander"),upload(recordRobotM30BossDefeat(createRobotM30State("easy"),"enemy-supreme-commander"))]) {
      const r16=advance(initial,16);expect(r16.result).toBe("ongoing");expect(r16.facility.hp).toBe(500);
      expect(finishRobotM30Round(r16,16).result).toBe("won");
    }
  });
  it("requires both boss defeat and transmission at R16 end, with no R17 or duplicate round",()=>{
    for (const s of [createRobotM30State("easy"),upload(createRobotM30State("easy")),recordRobotM30BossDefeat(createRobotM30State("easy"),"enemy-supreme-commander")]) {
      const end=finishRobotM30Round(advance(s,16),16);expect(end.result).toBe("lost");expect(end.resultReason).toBe("round-limit");
      expect(()=>finishRobotM30Round(end,17)).toThrow();
    }
    expect(()=>finishRobotM30Round(finishRobotM30Round(createRobotM30State("easy"),1),1)).toThrow(/Duplicate/);
  });
  it("spawns at R7/R12 after the R6/R11 triggers, exactly once per full squad",()=>{
    let s=advance(createRobotM30State("hard"),6);expect(spawnRobotM30Reinforcements(s,[]).spawned).toEqual([]);
    s=finishRobotM30Round(s,6);let spawned=spawnRobotM30Reinforcements(s,[]);
    expect(spawned.spawned.map(w=>w.cells)).toEqual([["D5","E5","F5"].map(robotCellToPosition)]);
    expect(spawned.spawned[0]?.aiRole).toBe("west-assault");
    expect(spawnRobotM30Reinforcements(spawned.state,[]).spawned).toEqual([]);
    s=advance(spawned.state,11);expect(spawnRobotM30Reinforcements(s,[]).spawned).toEqual([]);
    spawned=spawnRobotM30Reinforcements(finishRobotM30Round(s,11),[]);
    expect(spawned.spawned.map(w=>w.cells)).toEqual([["N5","O5","P5"].map(robotCellToPosition)]);
    expect(spawned.spawned[0]?.aiRole).toBe("east-raider");
  });
  it("uses connected ordered fallback, or defers the whole wave without partial spawns or revival",()=>{
    const s=advance(createRobotM30State("easy"),7);
    const fallback=spawnRobotM30Reinforcements(s,[robotCellToPosition("D5")]);
    expect(fallback.spawned).toHaveLength(1);expect(fallback.spawned[0]!.cells).toHaveLength(3);
    expect(fallback.spawned[0]!.cells).not.toContainEqual(robotCellToPosition("D5"));
    const blocked=["D5","E5","F5","D4","E4","F4","C5","G5"].map(robotCellToPosition);
    const deferred=spawnRobotM30Reinforcements(s,blocked);expect(deferred.spawned).toEqual([]);expect(deferred.deferredWaveIds).toEqual(["r6-west-assault"]);
    const next=spawnRobotM30Reinforcements(finishRobotM30Round(deferred.state,7),[]);expect(next.spawned).toHaveLength(1);
    expect(spawnRobotM30Reinforcements(next.state,[]).spawned).toEqual([]);
  });
});
