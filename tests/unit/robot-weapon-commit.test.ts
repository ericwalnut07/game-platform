import { describe, expect, it } from "vitest";
import { commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo } from "../../src/games/robot-tactics/battleWeaponActions";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { beginRobotBattleTurn, commitRobotBattleBossCommand, decodeRobotBattleCore, getRobotBattleResult, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { fixtureAttack, fixtureCommit, fixtureNextRound } from "../robot-tactics/coreFixture";
import { weaponCoreFixture, weaponFixtureProgress, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";

const vitals=getRobotBattleUnit;
const identity=(s:ReturnType<typeof weaponCoreFixture>,actionId="weapon-action")=>({actionId,turnId:robotBattleTurnId(s)});
const combo=(s:ReturnType<typeof weaponCoreFixture>,targetIds:readonly string[],actionId="weapon-action")=>{const weapons=vitals(s,"p1").parts.filter(p=>["double-edged-sword","light-lance","light-blade","heavy-hammer","assault-rifle","sniper-rifle","superheavy-railgun","howitzer","lance","standard-sword"].includes(p.partId));return commitRobotBattleWeaponCombo(s,{...identity(s,actionId),primaryWeaponId:weapons[0]!.partId,secondaryWeaponId:weapons[1]!.partId,targetIds});};

describe("one atomic weapon action and recoil",()=>{
  it("resolves both melee hits before one EN cost, one recoil and one hand completion",()=>{
    const s=weaponCoreFixture(),target=weaponTargetIds(s)[0]!,source=vitals(s,"p1"),before=JSON.stringify(s);
    const after=combo(s,[target]);
    const damage=after.latest!.damage.filter(e=>e.sourceId!==e.targetId), recoil=after.latest!.damage.filter(e=>e.sourceId===e.targetId);
    expect(damage.length).toBeGreaterThanOrEqual(1);expect(damage.length).toBeLessThanOrEqual(2);expect(recoil).toHaveLength(1);
    const actual=Math.min(vitals(s,target).hp,damage.reduce((n,e)=>n+e.damage!,0));
    expect(recoil[0]!.damage).toBe(Math.floor(actual*0.1));
    expect(source.hp-vitals(after,"p1").hp).toBe(recoil[0]!.damage);
    expect(vitals(after,"p1").energy).toMatchObject({action:{kind:"other",energyCost:50},normalHitRecovered:false,turnOpen:false,damagedRecovered:true});
    expect(after.actionIds).toEqual(["weapon-action"]);expect(after.turn.actedActorIds).toEqual(["p1"]);expect(after.turn.actorId).toBeNull();
    expect(vitals(after,target).energy.en-vitals(s,target).energy.en).toBe(3);
    expect(JSON.stringify(s)).toBe(before);expect(decodeRobotBattleCore(after)).toEqual(after);
  });
  it("skips the second hit when the first kills, clamps recoil to actual HP loss and never grants recoil min1",()=>{
    const base=weaponCoreFixture(),target=weaponTargetIds(base)[0]!;
    const s=decodeRobotBattleCore({...base,units:base.units.map(u=>u.id===target?{...u,hp:1}:u)}),after=combo(s,[target]);
    expect(after.attackIds).toEqual(["weapon-action:hit:1"]);expect(after.latest!.damage).toHaveLength(1);expect(vitals(after,"p1").hp).toBe(vitals(s,"p1").hp);
    expect(vitals(after,"p1").energy.killRecovered).toBe(true);expect(vitals(after,target).hp).toBe(0);
  });
  it("rejects an ordered hit after a prior kill instead of charging/replaying the second strike",()=>{
    let s=weaponCoreFixture();const id=weaponTargetIds(s)[0]!;s=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id===id?{...u,hp:1}:u)});
    expect(()=>commitRobotBattleBatch(s,{...identity(s),summary:"invalid ordered hits",members:[{unitId:"p1",action:{kind:"other",energyCost:50}}],attacks:[fixtureAttack(s,"p1",id,100,"first"),fixtureAttack(s,"p1",id,100,"second")],resolutionMode:"ordered-single-source"})).toThrow(/after target defeat/);
    expect(vitals(s,id).hp).toBe(1);expect(vitals(s,"p1").energy.action).toBeNull();
  });
  it("normal sword and sweep use20%, combo uses10%, held-but-unused sword does not trigger",()=>{
    const s=weaponCoreFixture(),ids=weaponTargetIds(s).slice(0,2);
    const normal=commitRobotBattleSlashAttack(s,{...identity(s),weaponId:"double-edged-sword",kind:"normal",targetIds:ids.slice(0,1)});
    const sweep=commitRobotBattleSlashAttack(s,{...identity(s),weaponId:"double-edged-sword",kind:"sweep",targetIds:ids});
    for(const after of [normal,sweep]){const dealt=ids.reduce((n,id)=>n+vitals(s,id).hp-vitals(after,id).hp,0);expect(after.latest!.damage.find(e=>e.effectKind==="special:sword-recoil")!.damage).toBe(Math.floor(dealt*0.2));expect(vitals(after,"p1").energy.normalHitRecovered).toBe(true);}
    const held=weaponCoreFixture({progress:weaponFixtureProgress(["light-blade","double-edged-sword"])});
    const noRecoil=commitRobotBattleSlashAttack(held,{...identity(held),weaponId:"light-blade",kind:"normal",targetIds:[weaponTargetIds(held)[0]!]});
    expect(noRecoil.latest!.damage.some(e=>e.sourceId===e.targetId)).toBe(false);
  });
  it("recoil kills a carrier, drops data at the old cell and queues R+2 without end-turn healing",()=>{
    const s=weaponCoreFixture({sourceHp:1,carryingData:true}),source=vitals(s,"p1"),after=combo(s,[weaponTargetIds(s)[0]!]);
    expect(vitals(after,"p1")).toMatchObject({hp:0,position:null,carriedObjectiveId:null,energy:{en:source.energy.en-50+3+5,turnOpen:false,killRecovered:true}});
    expect(after.allied.waiting).toMatchObject([{unitId:"p1",defeatedRound:s.allied.round,returnRound:s.allied.round+2}]);
    expect(after.objective.kind==="m30"&&after.objective.state.data).toEqual({carrierId:null,cell:source.position,sent:false});
    expect(after.latest!.summary).toContain("発動機撃破／データ落下");expect(getRobotBattleResult(after).result).toBe("ongoing");
    let restored=decodeRobotBattleCore(after);restored=fixtureNextRound(restored);expect(vitals(restored,"p1").hp).toBe(0);restored=fixtureNextRound(restored);
    expect(vitals(restored,"p1")).toMatchObject({hp:source.maxHp,statuses:[],carriedObjectiveId:null,parts:source.parts,energy:{en:Math.ceil(source.energy.maxEn*0.3)}});
  });
  it("does not revive a recoil casualty with self-repair armor",()=>{
    const s=weaponCoreFixture({sourceHp:1,progress:weaponFixtureProgress(["double-edged-sword","light-lance"],"self-repair-armor")});
    expect(vitals(combo(s,[weaponTargetIds(s)[0]!] ),"p1").hp).toBe(0);
  });
  it("counts recoil damage in the existing once-per-round damaged EN ledger, never a self-kill reward",()=>{
    const s0=weaponCoreFixture(),s=decodeRobotBattleCore({...s0,units:s0.units.map(u=>u.id==="p1"?{...u,energy:{...u.energy,damagedRecovered:true}}:u)}),after=combo(s,[weaponTargetIds(s)[0]!]);
    const source=vitals(s,"p1"),end=getRobotEnergyRecoveryAmounts(source.energy.maxEn).actionEnd,kill=vitals(after,"p1").energy.killRecovered?5:0;
    expect(vitals(after,"p1").energy.en).toBe(source.energy.en-50+end+kill);
  });
  it("replay/stale/insufficient EN and unheld weapons never partially change HP, EN or receipts",()=>{
    const s=weaponCoreFixture(),id=weaponTargetIds(s)[0]!,input={...identity(s),primaryWeaponId:"double-edged-sword",secondaryWeaponId:"light-lance",targetIds:[id]};
    const next=commitRobotBattleWeaponCombo(s,input);expect(commitRobotBattleWeaponCombo(next,input)).toBe(next);
    for(const bad of [{...input,turnId:"stale"},{...input,primaryWeaponId:"standard-sword"},{...input,targetIds:["f1"]}])expect(()=>commitRobotBattleWeaponCombo(s,bad)).toThrow();
    const low=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="p1"?{...u,energy:{...u.energy,en:49}}:u)}),before=JSON.stringify(low);
    expect(()=>commitRobotBattleWeaponCombo(low,input)).toThrow(/Insufficient EN/);expect(JSON.stringify(low)).toBe(before);expect(s.actionIds).toEqual([]);
  });
  it("distinguishes blocked LOS and range, rejects missing status resolution without a checkpoint",()=>{
    const s=weaponCoreFixture({offsets:[{x:3,y:0},{x:3,y:1},{x:3,y:-1}]}),target=weaponTargetIds(s)[0]!;
    expect(()=>combo(s,[target])).toThrow(/射程外/);
    const marked=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="p1"?{...u,statuses:["unresolved-test-status"]}:u)});
    const ranged=weaponCoreFixture({progress:weaponFixtureProgress(["lance","assault-rifle"]),offsets:[{x:3,y:0},{x:3,y:1},{x:3,y:-1}]});
    const status=decodeRobotBattleCore({...ranged,units:ranged.units.map(u=>u.id==="p1"?{...u,statuses:marked.units[0]!.statuses}:u)});
    expect(()=>combo(status,[weaponTargetIds(status)[0]!])).toThrow(/status damage resolver/);
  });
  it("leaves supporters untouched and projects ordered hits plus recoil as one latest action",()=>{
    const s=weaponCoreFixture(),after=combo(s,[weaponTargetIds(s)[0]!]);
    for(const id of ["p2","p3","f1","f2"])expect(vitals(after,id)).toEqual(vitals(s,id));
    const model=projectRobotBattleCore(after,{battleId:after.id,sequence:1});
    expect(model.latestAction!.hits).toHaveLength(after.latest!.damage.length);
    expect(model.latestAction!.hits.map(h=>h.pulse)).toEqual(after.latest!.damage.map((_,i)=>i));
    expect(model.latestSummary).toContain("武装コンボ");expect(model.latestSummary).toContain("自傷");
  });
  it("does not grant a kill reward or end recovery for recoil alone when the enemy survives",()=>{
    const s=weaponCoreFixture({sourceHp:1,targetIds:["enemy-supreme-commander"] ,offsets:[{x:-1,y:0}]}),after=combo(s,["enemy-supreme-commander"]);
    expect(vitals(after,"enemy-supreme-commander").hp).toBeGreaterThan(0);
    expect(vitals(after,"p1")).toMatchObject({hp:0,energy:{en:vitals(s,"p1").energy.en-50+3,killRecovered:false,turnOpen:false}});
  });
  it("rejects an unreachable necessary second hit without keeping first-hit damage or EN",()=>{
    const s=weaponCoreFixture({progress:weaponFixtureProgress(["lance","double-edged-sword"]),targetIds:["enemy-supreme-commander"],offsets:[{x:2,y:0}]}),before=JSON.stringify(s);
    expect(()=>combo(s,["enemy-supreme-commander"])).toThrow(/射程外/);expect(JSON.stringify(s)).toBe(before);
  });
  it("blocks a real wall between source and a ranged combo target",()=>{
    const initial=weaponCoreFixture({progress:weaponFixtureProgress(["lance","assault-rifle"])}),id=weaponTargetIds(initial)[0]!;
    const reserved=initial.units.filter(u=>u.id!=="p1"&&u.id!==id).map(u=>u.position!);
    const free=(x:number,y:number)=>x>=0&&y>=0&&x<initial.board.width&&y<initial.board.height&&!initial.board.walls.some(w=>w.x===x&&w.y===y)&&!reserved.some(w=>w.x===x&&w.y===y);
    const wall=initial.board.walls.find(w=>free(w.x-1,w.y)&&free(w.x+1,w.y))!;expect(wall).toBeDefined();
    const s=decodeRobotBattleCore({...initial,units:initial.units.map(u=>u.id==="p1"?{...u,position:{x:wall.x-1,y:wall.y}}:u.id===id?{...u,position:{x:wall.x+1,y:wall.y}}:u)});
    expect(()=>combo(s,[id])).toThrow(/壁/);expect(s.actionIds).toEqual([]);
  });
  it("settles a boss kill before self defeat, clears command effects and preserves M02 victory with escorts alive",()=>{
    let s=weaponCoreFixture({mission:2,sourceHp:1,targetIds:["commander"],offsets:[{x:-1,y:0}],targetHp:{commander:10},openTurn:false});
    s=beginRobotBattleTurn(s,"commander");s=commitRobotBattleBossCommand(s,identity(s,"command"));s=beginRobotBattleTurn(s,"p1");
    const after=combo(s,["commander"]);
    expect(vitals(after,"commander").boss!.effects).toEqual([]);expect(vitals(after,"p1").hp).toBe(0);
    expect(getRobotBattleResult(after)).toMatchObject({result:"won"});expect(weaponTargetIds(after).every(id=>vitals(after,id).hp>0)).toBe(true);
    expect(commitRobotBattleWeaponCombo(after,{...identity(s),primaryWeaponId:"double-edged-sword",secondaryWeaponId:"light-lance",targetIds:["commander"]})).toBe(after);
  });
  it("applies the existing same-round wipe rule when recoil is the third controlled death",()=>{
    let s=weaponCoreFixture({sourceHp:1,openTurn:false}),actor=s.actors.find(a=>a.unitIds.length===3)!;
    s=beginRobotBattleTurn(s,actor.id);s=fixtureCommit(s,[fixtureAttack(s,actor.unitIds[0]!,"p2",10000,"down-p2"),fixtureAttack(s,actor.unitIds[1]!,"p3",10000,"down-p3")],"enemy-action");
    s=beginRobotBattleTurn(s,"p1");const after=combo(s,[actor.unitIds[2]!]);
    expect(getRobotBattleResult(after)).toEqual({result:"lost",reason:"same-round-controlled-wipe"});expect(after.allied.controlledDefeatedThisRound).toHaveLength(3);
  });
  it("the trusted formation-result hook applies delta recoil once without charging supporters",()=>{
    const s=weaponCoreFixture(),ids=weaponTargetIds(s).slice(0,2),after=commitRobotBattleBatch(s,{...identity(s),summary:"trusted resolved delta fixture",members:[{unitId:"p1",action:{kind:"other",energyCost:75}}],attacks:ids.map((id,i)=>({...fixtureAttack(s,"p1",id,9,"delta"+i),effectKind:"delta" as const})),swordUse:{attack:"delta",attackWeaponIds:["double-edged-sword"]}});
    expect(after.latest!.damage.find(e=>e.effectKind==="special:sword-recoil")!.damage).toBe(1);
    for(const id of ["f1","f2","p2","p3"])expect(vitals(after,id)).toEqual(vitals(s,id));
    expect(vitals(after,"p1").energy.action!.energyCost).toBe(75);
  });
  it("enforces real sweep caps and grants normal-hit EN once across three victims",()=>{
    const initial=weaponCoreFixture({progress:weaponFixtureProgress(["whirlwind-saber","light-lance"])}),s=decodeRobotBattleCore({...initial,units:initial.units.map(u=>u.id==="p1"?{...u,energy:{...u.energy,en:20}}:u)}),ids=weaponTargetIds(s);
    const after=commitRobotBattleSlashAttack(s,{...identity(s),weaponId:"whirlwind-saber",kind:"sweep",targetIds:ids});
    expect(ids.every(id=>vitals(after,id).hp>0&&vitals(after,id).hp<vitals(s,id).hp)).toBe(true);
    const amounts=getRobotEnergyRecoveryAmounts(vitals(s,"p1").energy.maxEn);
    expect(vitals(after,"p1").energy.en).toBe(20+amounts.normalHit+amounts.actionEnd);expect(after.latest!.damage).toHaveLength(3);
    const sword=weaponCoreFixture();expect(()=>commitRobotBattleSlashAttack(sword,{...identity(sword),weaponId:"double-edged-sword",kind:"sweep",targetIds:weaponTargetIds(sword)})).toThrow(/cap/);
  });
  it("applies the final minimum per valid target without manufacturing minimum-one recoil",()=>{
    const s=weaponCoreFixture(),id=weaponTargetIds(s)[0]!;
    const after=commitRobotBattleSlashAttack(s,{...identity(s),weaponId:"double-edged-sword",kind:"normal",targetIds:[id]},{postBaseMultipliers:()=>[0]});
    expect(vitals(after,id).hp).toBe(vitals(s,id).hp-1);expect(after.latest!.damage).toHaveLength(1);expect(vitals(after,"p1").hp).toBe(vitals(s,"p1").hp);
  });
});

describe("adopted combo categories in actual state",()=>{
  const pairs=[
    ["light-blade","standard-sword",1,40],["heavy-hammer","binding-hammer",1,40],["light-lance","lance",1,40],["light-pistol","assault-rifle",2,40],["sniper-rifle","superheavy-railgun",3,40],["howitzer","heavy-missile-cannon",3,40],
    ["light-blade","heavy-hammer",1,50],["light-blade","light-lance",1,50],["heavy-hammer","light-lance",1,50],
    ["lance","assault-rifle",2,45],["lance","superheavy-railgun",3,45],["lance","howitzer",3,45]
  ] as const;
  for(const [primary,secondary,distance,cost]of pairs)it(`${primary}/${secondary} commits one adopted-cost action`,()=>{
    const s=weaponCoreFixture({progress:weaponFixtureProgress([primary,secondary]),offsets:[{x:distance,y:0},{x:distance,y:1},{x:distance,y:-1}]}),id=weaponTargetIds(s)[0]!,after=commitRobotBattleWeaponCombo(s,{...identity(s),primaryWeaponId:primary,secondaryWeaponId:secondary,targetIds:[id]});
    expect(vitals(after,"p1").energy).toMatchObject({normalHitRecovered:false,action:{kind:"other",energyCost:cost}});expect(after.actionIds).toHaveLength(1);expect(vitals(after,id).hp).toBeLessThan(vitals(s,id).hp);
    if(primary==="lance")expect(vitals(after,id).stats).toEqual(vitals(s,id).stats);
  });
  for(const ranged of ["assault-rifle","superheavy-railgun","howitzer"])it(`dual-target sword/${ranged} uses independent ranges and no normal blast/sweep extras`,()=>{
    const distance=ranged==="assault-rifle"?2:3;
    const s=weaponCoreFixture({progress:weaponFixtureProgress(["double-edged-sword",ranged]),offsets:[{x:-1,y:0},{x:distance,y:0},{x:0,y:1}]}),ids=weaponTargetIds(s),after=commitRobotBattleWeaponCombo(s,{...identity(s),primaryWeaponId:ranged,secondaryWeaponId:"double-edged-sword",targetIds:ids.slice(0,2)});
    expect(vitals(after,"p1").energy.action!.energyCost).toBe(55);expect(vitals(after,ids[2]!).hp).toBe(vitals(s,ids[2]!).hp);expect(after.latest!.damage.filter(e=>e.sourceId!==e.targetId)).toHaveLength(2);
    expect(()=>commitRobotBattleWeaponCombo(s,{...identity(s),primaryWeaponId:"double-edged-sword",secondaryWeaponId:ranged,targetIds:[ids[0]!,ids[0]!]})).toThrow(/Distinct/);
  });
  it("keeps unresolved spread/impact execution unavailable without spending an action",()=>{
    for(const weapons of [["assault-rifle","sniper-rifle"],["heavy-hammer","assault-rifle"]]as const){const s=weaponCoreFixture({progress:weaponFixtureProgress(weapons)}),before=JSON.stringify(s);expect(()=>commitRobotBattleWeaponCombo(s,{...identity(s),primaryWeaponId:weapons[0],secondaryWeaponId:weapons[1],targetIds:[weaponTargetIds(s)[0]!]})).toThrow(/not yet connected/);expect(JSON.stringify(s)).toBe(before);}
  });
});
