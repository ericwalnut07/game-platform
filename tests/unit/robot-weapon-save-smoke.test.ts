import { expect,it } from "vitest";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { decodeRobotBattleCore,getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { robotMissionRow } from "../../src/games/robot-tactics/offlineProgress";
import { createWeaponFixtureRuntime,type WeaponFixtureCase } from "../robot-tactics/weaponFixtureRuntime";
import { weaponFixtureProgress } from "../robot-tactics/weaponCoreFixture";

class Storage implements RobotOfflineStorage{
  raw:string|null=JSON.stringify({...createRobotOfflineSave(),progress:weaponFixtureProgress()});fail=false;
  async read(){return this.raw;}
  async replace(expected:string|null,next:string){if(this.fail)throw new Error("disk-full");if(this.raw!==expected)throw new Error("stale");this.raw=next;}
}
async function setup(kind:WeaponFixtureCase="two-hit"){
  const storage=new Storage(),runtime=createWeaponFixtureRuntime(kind),session=new RobotOfflineSession(storage,runtime,()=>"weapon-save");
  await session.load();await session.start({missionNumber:kind==="win"?2:30,difficulty:"normal"});return{storage,session,runtime};
}
const command=(s:RobotOfflineSession)=>({battleId:s.state.battle!.departure.battleId,expectedSequence:s.state.battle!.sequence,actionId:"one-whole-combo",action:{kind:"combo"}});
it("smokes a real two-hit/recoil state in one durable checkpoint, reloads next actor and ignores duplicate delivery",async()=>{
  const {session,storage,runtime}=await setup(),before=decodeRobotBattleCore(session.state.battle!.snapshot),input=command(session);
  await session.act(input);const saved=session.state,core=decodeRobotBattleCore(saved.battle!.snapshot);
  expect(saved.battle!.sequence).toBe(1);expect(core.latest!.damage.map(e=>e.effectKind)).toEqual(["slash","thrust","special:sword-recoil"]);
  expect(core.turn.actorId).toBe("p2");expect(core.actionIds.length-before.actionIds.length).toBe(1);expect(getRobotBattleUnit(core,"p1").energy.action!.energyCost).toBe(50);
  const resumed=new RobotOfflineSession(storage,runtime,()=>"unused");await resumed.load();expect(resumed.state).toEqual(saved);await resumed.act(input);expect(resumed.state).toEqual(saved);
});
it("does not expose first hit, recoil, EN or death if the durable write fails; retries once",async()=>{
  const {session,storage}=await setup("lethal"),input=command(session),before=session.state,raw=storage.raw;
  storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);expect(storage.raw).toBe(raw);
  storage.fail=false;await session.act(input);const core=decodeRobotBattleCore(session.state.battle!.snapshot);
  expect(getRobotBattleUnit(core,"p1").hp).toBe(0);expect(core.allied.waiting).toHaveLength(1);expect(core.objective.kind==="m30"&&core.objective.state.data.carrierId).toBeNull();expect(session.state.battle!.sequence).toBe(1);
});
it("settles a real M02 first-hit boss kill and one reward, never trusting a finish/result request",async()=>{
  const {session,storage,runtime}=await setup("win"),before=session.state,input=command(session);
  await expect(session.act({...input,action:{kind:"finish",result:"won"}})).rejects.toThrow(/outcome must come from Core/);expect(session.state).toEqual(before);
  await session.act(input);expect(session.state.battle).toBeNull();expect(session.state.result).toMatchObject({result:"won",expGained:robotMissionRow({missionNumber:2,difficulty:"normal"}).repeatClear.exp});
  const exp=session.state.progress.exp,resumed=new RobotOfflineSession(storage,runtime,()=>"unused");await resumed.load();await resumed.act(input);expect(resumed.state.progress.exp).toBe(exp);
});
it("rejects a corrupted new recoil checkpoint without erasing it",async()=>{
  const {session,storage,runtime}=await setup("lethal");await session.act(command(session));const raw=JSON.parse(storage.raw!);raw.battle.snapshot.allied.waiting=[];storage.raw=JSON.stringify(raw);const before=storage.raw;
  await expect(new RobotOfflineSession(storage,runtime,()=>"unused").load()).rejects.toThrow(/respawn queue|defeat reference/);expect(storage.raw).toBe(before);
});
