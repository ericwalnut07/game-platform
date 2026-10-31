import { describe, expect, it } from "vitest";
import { getRobotBossPlan, getRobotStageBossPlans } from "../../src/games/robot-tactics/bossCatalog";
import { applyRobotBossDamage, beginRobotBossTurn, checkRobotBossSkill, commitRobotBossOrdinaryMove, commitRobotBossSkill, completeRobotCommandedSquadAttack, createRobotBossState, endRobotBossTurn, getRobotBossSkillView, getRobotBossTrackingMarkers, getRobotBossVoluntaryMoves, getRobotCommandBonuses, isRobotM09VoluntaryDestination, type RobotBossSkillContext, type RobotBossState, type RobotBossUnit } from "../../src/games/robot-tactics/bossCommands";
import { chooseRobotM09BossAction, chooseRobotM30EnemyAction, prioritizeRobotBossTrackingTargets, type RobotBossAiCandidate } from "../../src/games/robot-tactics/bossAi";
import { commitRobotEnergyAction } from "../../src/games/robot-tactics/energy";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";

const rows = [
  [2, [165,52,50,55,3,45,100,1], [220,68,65,64,3,53,125,2], [255,112,118,73,3,68,170,4]],
  [9, [185,62,68,56,4,65,130,1], [240,93,99,70,4,79,170,3], [330,160,168,86,4,105,235,5]],
  [16,[235,78,82,68,3,56,155,2],[320,122,128,85,3,75,215,4],[395,202,210,90,3,100,300,7]],
  [22,[270,90,102,70,3,60,180,3],[350,135,156,86,3,80,245,5],[420,210,235,90,3,106,350,7]],
  [27,[325,118,122,80,3,70,210,4],[415,175,182,94,3,89,290,5],[485,245,255,102,3,115,390,8]],
  [30,[275,150,160,66,3,86,255,4],[395,212,225,85,3,105,355,5],[550,275,290,110,3,130,465,8]]
] as const;
const board = { width: 19, height: 17, walls: [] };
const light = (id: string, squadId = "boss-escort", chassis = "defense"): RobotBossUnit => ({ id, squadId, chassis, team: "enemy", kind: "light", hp: 50, position: { x: 7, y: 4 } });
const controlled: RobotBossUnit = { id: "p1", kind: "controlled", team: "player", hp: 100, squadId: null, position: { x: 8, y: 5 }, carryingUnsentData: true };
const context = (squadId = "boss-escort"): RobotBossSkillContext => ({ board, units: [light("g1", squadId), light("g2", squadId), { ...light("dead", squadId), hp: 0 }, controlled] });
const start = (mission = 2) => beginRobotBossTurn(createRobotBossState(mission, "hard", robotCellToPosition(mission === 9 ? "I3" : "J3")));
const wait = (s: RobotBossState) => endRobotBossTurn({ ...s, energy: commitRobotEnergyAction(s.energy, { kind: "other", energyCost: 0 }) });

describe("final adopted six-boss catalog", () => {
  for (const [mission, ...values] of rows) for (const [i, difficulty] of (["easy", "normal", "hard"] as const).entries()) it(`M${mission} ${difficulty} exact base statistics`, () => {
    const p = getRobotBossPlan(mission, difficulty), b = p.baseStats;
    expect([b.hp,b.melee,b.ranged,b.def,b.mov,b.spd,b.en,p.weaponLevel]).toEqual(values[i]);
    expect(p.weapons.map(w => w.level)).toEqual([p.weaponLevel,p.weaponLevel]);
    expect(p.stats.hp).toBe(b.hp);
  });
  it("uses the exact six adopted weapon pairs and applies equipment penalties once", () => {
    expect(rows.map(([m]) => getRobotBossPlan(m, "hard").weapons.map(w => w.id))).toEqual([
      ["standard-sword","assault-rifle"],["light-lance","assault-rifle"],["light-lance","corrosion-rifle"],
      ["standard-sword","howitzer"],["armor-pile","corrosion-rifle"],["lance","heavy-missile-cannon"]
    ]);
    expect((["easy","normal","hard"] as const).map(d => getRobotBossPlan(22,d).stats.spd)).toEqual([52,72,98]);
    expect((["easy","normal","hard"] as const).map(d => getRobotBossPlan(30,d).stats.mov)).toEqual([2,2,2]);
    expect((["easy","normal","hard"] as const).map(d => getRobotBossPlan(30,d).stats.spd)).toEqual([78,97,122]);
  });
  it("resolves adopted boss stats independently of ordinary enemy reference/weapon levels", () => {
    for (const [mission] of rows) for (const difficulty of ["easy","normal","hard"] as const) {
      const stage = getRobotStagePlan({ missionNumber: mission, difficulty }), boss = getRobotStageBossPlans(stage)[0]!;
      expect(boss.unit.model).toBe("boss"); expect(boss.unit.weaponLevel).toBe(boss.plan.weaponLevel);
      expect(stage.blockingIssues).not.toContain("Command-boss model and abilities unresolved");
    }
    expect(getRobotStagePlan({ missionNumber: 2, difficulty: "easy" }).roundLimit).toBe(8);
    expect(getRobotStagePlan({ missionNumber: 9, difficulty: "hard" }).roundLimit).toBe(9);
    expect(getRobotStagePlan({ missionNumber: 16, difficulty: "hard" }).reinforcements[0]?.triggerRound).toBe(5);
  });
  it("keeps M30 final conditions while recognizing the later M22/M27 AND adoption", () => {
    const m30 = getRobotStagePlan({ missionNumber:30,difficulty:"hard" });
    expect(m30.designStatus).toBe("adopted-mission-spec");
    expect(m30.blockingIssues.some(s=>s.includes("Composite victory"))).toBe(false);
    expect(m30.reinforcements.map(w=>[w.triggerRound,w.availableFromRound])).toEqual([[6,7],[11,12]]);
    for (const m of [22,27]) expect(getRobotStagePlan({missionNumber:m,difficulty:"hard"}).blockingIssues).not.toContain("Composite victory condition not adopted");
  });
});

describe("command actions and effects", () => {
  it("spends one action/EN, buffs living guards without LOS, and forbids an attack afterward", () => {
    const initial = start(), c = { ...context(), board: { ...board,walls:[{x:8,y:3}] } };
    const s = commitRobotBossSkill(initial,c);
    expect(s.energy.en).toBe(initial.energy.en-25);
    expect(getRobotCommandBonuses(s.effects,light("g1"),null)).toEqual({melee:12,ranged:12,defense:12});
    expect(getRobotCommandBonuses(s.effects,light("dead"),null)).toEqual({melee:0,ranged:0,defense:0});
    expect(()=>commitRobotEnergyAction(s.energy,{kind:"normal-attack",energyCost:0})).toThrow();
    expect(initial.effects).toEqual([]);
  });
  it("expires at next own-turn start and permits the skill only after an intervening own turn", () => {
    let s = commitRobotBossSkill(start(),context());
    s = beginRobotBossTurn(endRobotBossTurn(s));
    expect(s.effects).toEqual([]);expect(checkRobotBossSkill(s,context()).reason).toBe("consecutive-own-turn");
    s = beginRobotBossTurn(wait(s));expect(checkRobotBossSkill(s,context()).available).toBe(true);
  });
  it("uses all adopted command bonus/cost tables", () => {
    for (const [mission, costs, expected] of [[2,25,[[8,8,8],[10,10,10],[12,12,12]]],[16,30,[[4,4,10],[6,6,14],[8,8,18]]],[22,35,[[0,18,0],[0,28,0],[0,40,0]]],[27,40,[[12,12,0],[22,22,0],[32,32,0]]],[30,60,[[10,10,8],[16,16,12],[22,22,16]]]] as const) {
      for (const [i,difficulty] of (["easy","normal","hard"] as const).entries()) {
        const plan=getRobotBossPlan(mission,difficulty),skill=plan.definition.skill;
        expect(skill.energyCost).toBe(costs);
        if (!("bonusesByDifficulty" in skill)) throw new Error("missing bonus table");
        const b=skill.bonusesByDifficulty[difficulty];expect([b.melee,b.ranged,b.defense]).toEqual(expected[i]);
      }
    }
  });
  it("keeps bombardment until the selected squad's next complete attack batch", () => {
    const c={...context("shooters"),squadId:"shooters",units:[light("gunner1","shooters","ranged"),light("gunner2","shooters","ranged")]};
    let s=commitRobotBossSkill(start(22),c);
    expect(getRobotCommandBonuses(s.effects,light("gunner1","shooters"),"p1").ranged).toBe(40);
    s=beginRobotBossTurn(endRobotBossTurn(s));expect(s.effects).toHaveLength(1);
    expect(completeRobotCommandedSquadAttack(s,"other").effects).toHaveLength(1);
    expect(completeRobotCommandedSquadAttack(s,"shooters").effects).toEqual([]);
  });
  it("marks only a legal controlled rifle target, prefers carriers, and never disables them", () => {
    const c={...context(),targetId:"p1",rifleRange:{status:"in-range" as const,distance:3}};
    const s=commitRobotBossSkill(start(27),c);
    expect(getRobotBossTrackingMarkers(s)).toEqual(["p1"]);
    expect(getRobotCommandBonuses(s.effects,light("new-wave","new-squad"),"p1").melee).toBe(32);
    expect(getRobotCommandBonuses(s.effects,light("g1"),"p2").melee).toBe(0);
    expect(c.units.at(-1)).toEqual(controlled);
    expect(checkRobotBossSkill(start(27),{...c,rifleRange:{status:"out-of-range",distance:99}}).available).toBe(false);
    expect(checkRobotBossSkill(start(27),{...c,board:{...board,walls:[robotCellToPosition("J4")]},units:[light("g1"),{...controlled,position:robotCellToPosition("J6")}]}).reason).toBe("line-of-sight-blocked");
    expect(checkRobotBossSkill(start(27),{...c,structures:[{cells:[robotCellToPosition("J4")],blocksLineOfSight:true}],units:[light("g1"),{...controlled,position:robotCellToPosition("J6")}]}).reason).toBe("line-of-sight-blocked");
    expect(prioritizeRobotBossTrackingTargets([{...controlled,id:"p2",carryingUnsentData:false},controlled])[0]?.id).toBe("p1");
  });
  it("uses maximum bonuses per stat and removes only the defeated boss's effects", () => {
    const s=commitRobotBossSkill(start(),context()),own=s.effects[0]!;
    const foreign={...own,id:"foreign",sourceBossId:"other-boss",bonuses:{melee:20,ranged:3,defense:8}};
    const combined={...s,effects:[...s.effects,foreign]};
    expect(getRobotCommandBonuses(combined.effects,light("g1"),null)).toEqual({melee:20,ranged:12,defense:12});
    const dead=applyRobotBossDamage(combined,s.hp);expect(dead.effects).toEqual([foreign]);
    expect(()=>beginRobotBossTurn(dead)).toThrow(/never respawn/);
  });
  it("checks M30 HP at own-turn start, uses the ultimate once, and exposes activation", () => {
    let s=start(30);s=applyRobotBossDamage(s,300);
    expect(checkRobotBossSkill(s,context()).reason).toBe("turn-start-hp-above-half");
    s=beginRobotBossTurn(wait(s));expect(getRobotBossSkillView(s,context()).available).toBe(true);
    s=commitRobotBossSkill(s,context());expect(s.ultimateUsed).toBe(true);
    expect(getRobotBossSkillView(s,context()).lastEvent).toContain("総司令号令");
    s=beginRobotBossTurn(endRobotBossTurn(s));expect(checkRobotBossSkill(s,context()).reason).toBe("once-per-battle-used");
  });
  it("adds no hidden living-squad prerequisite to M30 and never reports a death event as a skill activation",()=>{
    const initial=createRobotBossState(30,"hard",robotCellToPosition("J4"));
    const half=beginRobotBossTurn(applyRobotBossDamage(initial,275));
    expect(checkRobotBossSkill(half,{board,units:[]}).available).toBe(true);
    expect(getRobotBossSkillView(applyRobotBossDamage(initial,550),context()).lastEvent).toBeNull();
  });
});

describe("M09 voluntary area and disengage", () => {
  function moveContext(destination="J3"):RobotBossSkillContext {
    const s=start(9);return {...context(),measureDistance:()=>4,move:{query:{board,origin:s.position,types:["omni"],mov:4,facing:"south",occupied:[],structures:[]},destination:robotCellToPosition(destination)}};
  }
  it("allows at most two legal additional steps, spends30EN/action and prohibits consecutive use", () => {
    const s=start(9),c=moveContext("K3"),next=commitRobotBossSkill(s,c);
    expect(next.position).toEqual(robotCellToPosition("K3"));expect(next.energy.en).toBe(s.energy.en-30);expect(next.energy.usedExtraMove).toBe(true);
    expect(checkRobotBossSkill(s,moveContext("L3")).available).toBe(false);
    expect(checkRobotBossSkill(beginRobotBossTurn(endRobotBossTurn(next)),moveContext()).reason).toBe("consecutive-own-turn");
  });
  it("requires a living controlled unit within4, with no automatic distance metric adoption", () => {
    expect(checkRobotBossSkill(start(9),{...moveContext(),measureDistance:null}).reason).toBe("distance-unresolved");
    expect(checkRobotBossSkill(start(9),{...moveContext(),measureDistance:()=>5}).available).toBe(false);
    expect(checkRobotBossSkill(start(9),{...moveContext(),units:[{...controlled,kind:"friendly-ai"}]}).available).toBe(false);
  });
  it("never passes walls/units or teleports, and preserves outside positions after displacement", () => {
    const s=start(9),c=moveContext("K3"),q=c.move!.query;
    const barrier=Array.from({length:17},(_,y)=>({x:9,y}));
    expect(checkRobotBossSkill(s,{...c,board:{...board,walls:barrier},move:{...c.move!,query:{...q,board:{...board,walls:barrier}}}}).available).toBe(false);
    expect(checkRobotBossSkill(s,{...moveContext(),units:[{...controlled,position:robotCellToPosition("J3")}]}).available).toBe(false);
    const displaced={...s,position:robotCellToPosition("M3")};
    const movedQuery={...q,origin:displaced.position};
    expect(getRobotBossVoluntaryMoves(displaced,movedQuery).every(m=>isRobotM09VoluntaryDestination(m.destination))).toBe(true);
    expect(displaced.position).toEqual(robotCellToPosition("M3"));
    expect(()=>commitRobotBossOrdinaryMove({...s,position:robotCellToPosition("L3")},{...q,origin:robotCellToPosition("L3")},robotCellToPosition("M3"))).toThrow();
  });
});

it("selects legal priority actions and advances rather than idling out of range", () => {
  const choices:RobotBossAiCandidate[]=[{id:"out",kind:"attack",legal:false,utility:100,target:"relay"},{id:"wait",kind:"wait",legal:true,utility:999,target:"other"},{id:"move",kind:"move",legal:true,utility:1,target:"relay",destination:robotCellToPosition("I8")},{id:"carrier",kind:"attack",legal:true,utility:2,target:"data-carrier"}];
  expect(chooseRobotM30EnemyAction("east-raider",choices,true)?.id).toBe("carrier");
  expect(chooseRobotM30EnemyAction("east-raider",choices,false)?.id).toBe("move");
  expect(chooseRobotM30EnemyAction("ranged",choices,false)?.id).toBe("move");
  expect(chooseRobotM30EnemyAction("escort",[{...choices[3]!,id:"protect",target:"boss-approach"},choices[2]!],false)?.id).toBe("protect");
  expect(chooseRobotM09BossAction([{...choices[2]!,destination:robotCellToPosition("M3")},{...choices[3]!,id:"counterattack"}])?.id).toBe("counterattack");
});
