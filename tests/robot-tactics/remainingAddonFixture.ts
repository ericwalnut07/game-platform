/** Explicit component builds/geometry. Never replaces the production M01 roster. */
import { weaponCoreFixture } from "./weaponCoreFixture";
import { weaponAreaFixtureProgress } from "./weaponAreaFixture";
import { decodeRobotBattleCore, getRobotBattleUnit, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import type { RobotPosition } from "../../src/games/robot-tactics/movement";
export const remainingBoss="enemy-supreme-commander";
export function remainingAddonScene(addons:readonly string[],weapon="superheavy-railgun",offsets:readonly RobotPosition[]=[{x:3,y:0},{x:4,y:0}],en=100){
 const seed=weaponCoreFixture(), enemy=seed.units.find(u=>u.kind==="light")!.id;
 const p=weaponAreaFixtureProgress([weapon,weapon === "light-pistol" ? "light-lance" : "light-pistol"]), progress={...p,party:p.party.map((c,i)=>i?c:{...c,addons:addons.map(partId=>({partId}))})};
 const s=weaponCoreFixture({progress,targetIds:[remainingBoss,enemy].slice(0,offsets.length),offsets});
 return decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="p1"?{...u,energy:{...u.energy,en}}:u)});
}
export function alterRemainingUnit(s:RobotBattleCoreState,id:string,fields:Partial<ReturnType<typeof getRobotBattleUnit>>){return decodeRobotBattleCore({...s,units:s.units.map(u=>u.id===id?{...u,...fields}:u)});}
