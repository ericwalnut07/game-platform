import { expect, it } from "vitest";
import { offlineAddonFixtureProgress } from "../robot-tactics/offlineAddonFixture";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { RobotOfflineSession, createRobotOfflineSave, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { getRobotDelayedFuseOptions } from "../../src/games/robot-tactics/delayedFuse";
const weapon="heavy-missile-cannon";
class Storage implements RobotOfflineStorage {
 raw: string; fail=false;
 constructor(){let progress=offlineAddonFixtureProgress();progress=applyRobotCustomization(progress,{kind:"addon-equip",coreId:"core-c",partId:"delayed-fuse"});progress=applyRobotCustomization(progress,{kind:"part-equip",coreId:"core-c",slot:"weapon2",partId:weapon});this.raw=JSON.stringify({...createRobotOfflineSave(),progress});}
 async read(){return this.raw;}
 async replace(expected:string|null,next:string){if(this.fail)throw new Error("disk-full");if(this.raw!==expected)throw new Error("stale");this.raw=next;}
}
async function setup(){const storage=new Storage();let id=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"fuse-m01-"+ ++id);await session.load();await session.start({missionNumber:1,difficulty:"easy"});
 for(let n=0;n<20;n++){const b=session.state.battle!,s=decodeRobotBattleCore(b.snapshot),u=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);if(u.id==="core-c")return{storage,session};await session.act({battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"advance-"+n,action:{kind:u.kind==="controlled"?"charge":"npc"}});}throw new Error("M01 equipped actor not reached");}
it("M01 durable attachment is atomic on disk failure, replay and stale/cross-session writes; resume preserves timing and retry resets bombs",async()=>{
 const {storage,session}=await setup(),before=session.state,b=before.battle!,s=decodeRobotBattleCore(b.snapshot),targetId=getRobotDelayedFuseOptions(s,weapon).targetIds[0]!;expect(targetId).toBeDefined();
 const input={battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"one-bomb",action:{kind:"delayed-fuse",weaponId:weapon,targetId}};
 storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);storage.fail=false;
 const second=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await second.load();
 await session.act(input);const saved=session.state;expect(decodeRobotBattleCore(saved.battle!.snapshot).fuses!.bombs).toHaveLength(1);
 await expect(second.act({...input,actionId:"racing-bomb"})).rejects.toThrow("stale");expect(second.state).toEqual(before);
 const resumed=new RobotOfflineSession(storage,robotFormalRuntime,()=>"retry-new-id");await resumed.load();await resumed.act(input);expect(resumed.state).toEqual(saved);
 await expect(resumed.act({...input,actionId:"old-sequence"})).rejects.toThrow("Stale");expect(resumed.state).toEqual(saved);
 await resumed.retry(true);expect(resumed.state.battle!.sequence).toBe(0);expect(decodeRobotBattleCore(resumed.state.battle!.snapshot).fuses).toBeUndefined();
});
it("M01 resumes a bomb, runs the actual NPC and publishes detonation once in one checkpoint",async()=>{
 const{storage,session}=await setup(),b=session.state.battle!,s=decodeRobotBattleCore(b.snapshot),targetId=getRobotDelayedFuseOptions(s,weapon).targetIds[0]!;
 await session.act({battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"bomb",action:{kind:"delayed-fuse",weaponId:weapon,targetId}});
 const resumed=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await resumed.load();let detonated=false;
 for(let n=0;n<40;n++){const b=resumed.state.battle!,s=decodeRobotBattleCore(b.snapshot),actor=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);const input={battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"tick-"+n,action:{kind:actor.kind==="controlled"?"charge":"npc"}};await resumed.act(input);const after=decodeRobotBattleCore(resumed.state.battle!.snapshot);if(after.fuses!.bombs[0]!.state==="detonated"){const checkpoint=resumed.state;expect(after.latest!.damage.some(d=>d.effectKind==="special:delayed-fuse")).toBe(true);expect(new Set(after.latest!.fuseExplosions!.map(b=>b.bombId)).size).toBe(1);await resumed.act(input);expect(resumed.state).toEqual(checkpoint);const loaded=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await loaded.load();expect(loaded.state).toEqual(checkpoint);detonated=true;break;}}
 expect(detonated).toBe(true);
});
