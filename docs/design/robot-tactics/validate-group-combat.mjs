// Static consistency checks for the adopted offline group-combat design.
// This is NOT a gameplay simulator or balance proof.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir = dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
const data = read("current-group-combat.json");
const catalog = read("missions.json").missions;
const adopted=read("normal-hard-early-seven-candidates.json");
assert.equal(adopted.status,"adopted-2026-10-29");
assert.equal(adopted.runtimeContent,false);
assert.equal(adopted.profiles.length,14);
assert.equal(new Set(adopted.profiles.map(p=>p.id)).size,14);
assert.equal(data.earlyMissions.normalHardEncounterRef,"normal-hard-early-seven-candidates.json");
assert.equal(data.earlyMissions.normalHardEncounterStatus,"adopted-2026-10-29");
const stageMaps=read("early-seven-layouts.json").maps;
const normalModels=["AAA","A","AAA","AAB","AB","ABB","BAB"];
const hardModels=["BBB","B","BBB","BBB","BB","BBB","BBB"];
const coreLevels={normal:[5,6,7,8,9,10,11],hard:[17,18,19,21,22,23,25]};
const lightWeaponLevel=(level)=>level<=5?1:level<=10?2:level<=15?3:level<=20?4:level<=25?5:level<=30?6:level<=35?7:8;
for(const p of adopted.profiles){
 const num=p.number,index=num-1,entry=catalog.find(x=>x.id===p.id),stage=stageMaps[index];
 assert.ok(entry && stage,"missing adopted stage "+p.id);
 assert.equal(p.id,p.difficulty+"-"+String(num).padStart(2,"0"));
 assert.equal(p.status,"adopted-2026-10-29");
 assert.equal(p.enemyReferenceCoreLevel,coreLevels[p.difficulty][index]);
 assert.equal(p.lightWeaponLevel,lightWeaponLevel(p.enemyReferenceCoreLevel));
 assert.equal(entry.design.difficultyEncounterStatus,"adopted-2026-10-29");
 assert.equal(entry.design.difficultyEncounterRef,"normal-hard-early-seven-candidates.json");
 assert.equal(entry.design.enemyReferenceCoreLevel,p.enemyReferenceCoreLevel);
 assert.equal(entry.design.lightWeaponLevel,p.lightWeaponLevel);
 assert.equal(entry.design.roundLimit,stage.roundLimit);
 assert.deepEqual(p.board,[stage.board.width,stage.board.height]);
 assert.equal(p.roundLimit,stage.roundLimit);
 const baseSquads=[
  ...stage.initialEnemies.filter(x=>x.kind==="light-squad").map(x=>({squad:x,spawn:"initial",trigger:null})),
  ...stage.reinforcements.map(w=>({squad:w.squad||w.squadTemplate,spawn:"reinforcement",trigger:w.trigger,wave:w}))
 ];
 const expected=p.difficulty==="normal"?normalModels[index]:hardModels[index];
 assert.equal(p.lightSquads.length,baseSquads.length);
 assert.equal(p.lightSquads.map(x=>x.model).join(""),expected,"model sequence "+p.id);
 for(let i=0;i<p.lightSquads.length;i++){
  const light=p.lightSquads[i],base=baseSquads[i];
  assert.equal(light.id,base.squad.id);
  assert.equal(light.chassis,base.squad.chassis);
  assert.equal(light.role,base.squad.role);
  assert.equal(light.spawn,base.spawn);
  assert.equal(light.memberCount,3);
  assert.equal(light.enemyCoreLevel,p.enemyReferenceCoreLevel);
  assert.equal(light.weaponLevel,p.lightWeaponLevel);
  if(base.spawn==="initial")assert.deepEqual(light.cells,base.squad.memberCells);
  else{
   assert.deepEqual(light.trigger,base.trigger);
   assert.equal(light.waveId,base.wave.id);
   if(base.squad.memberCells)assert.deepEqual(light.cells,base.squad.memberCells);
   if(base.wave.spawnBranches)assert.deepEqual(light.spawnBranches,base.wave.spawnBranches);
  }
  assert.ok(light.model==="A"||light.model==="B");
  if(light.weaponMappingStatus!=="confirmed")assert.ok(["unconfirmed-weapon-mapping","unconfirmed-new-weapon"].includes(light.weaponMappingStatus));
 }
 assert.equal(p.soloEnemies.length,stage.initialEnemies.filter(x=>x.kind!=="light-squad").length);
 assert.equal(p.initialEnemyCount,stage.initialEnemies.reduce((n,x)=>n+(x.kind==="light-squad"?3:1),0));
 assert.equal(p.totalEnemyCountIncludingReinforcement,p.initialEnemyCount+stage.reinforcements.reduce((n,w)=>n+(w.squad||w.squadTemplate).memberCount,0));
 assert.ok(p.aiPriority.length>=2,"missing difficulty AI priorities "+p.id);
 for(const solo of p.soloEnemies)assert.equal(solo.weaponMappingStatus,"candidate-not-adopted","solo loadout must stay tentative "+p.id);
}
assert.equal(read("early-seven-layouts.json").difficultyPolicy.normalHardEncounterRef,"normal-hard-early-seven-candidates.json");
console.log("PASS: 14 adopted Normal/Hard early encounters match maps, model constraints, enemy levels, weapon levels and catalog refs (static only).");

const rules = read("rules.json");
assert.equal(data.runtimeContent, false);
assert.equal(data.identity.playerDirectRobots, 3);
assert.deepEqual(data.identity.friendlyAiCount, [2, 3]);
const missions = data.earlyMissions.missions;
assert.equal(missions.length, 7);
assert.equal(new Set(missions.map(m => m.id)).size, 7);
for (const stage of missions) {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const id = `${difficulty}-${String(stage.number).padStart(2,"0")}`;
    const entry = catalog.find(x => x.id === id);
    assert.ok(entry, `Missing ${id}`);
    assert.equal(entry.design.sourceRef, "current-group-combat.json");
    assert.equal(entry.design.missionType, stage.id);
    assert.equal(entry.design.board, `${stage.map[0]}x${stage.map[1]}`);
    assert.equal(entry.design.roundLimit, stage.roundLimit);
    assert.equal(entry.design.enemyRespawn, false);
  }
}
assert.equal(missions[1].roundLimit,8);
assert.equal(missions[1].win,"enemy command boss HP == 0 by R8");
assert.ok(missions.every(stage=>stage.roundLimitByDifficulty===undefined));
assert.equal(catalog.find(x=>x.id==="easy-02").design.mainObjective,"enemy command boss HP == 0 by R8");
assert.equal(catalog.find(x=>x.id==="normal-02").design.mainObjective,"enemy command boss HP == 0 by R8");
assert.equal(catalog.find(x=>x.id==="hard-02").design.mainObjective,"enemy command boss HP == 0 by R8");
assert.deepEqual(data.enemies.lightSquads.modelRules.hardEarlyModelPolicy.missionNumbers,[1,2,3,4,5,6,7]);
assert.deepEqual(data.enemies.lightSquads.modelRules.hardEarlyModelPolicy.allowedModels,["B"]);
assert.equal(data.enemies.lightSquads.modelRules.hardEarlyModelPolicy.firstMissionWhereCEligible,8);
assert.deepEqual(data.enemies.lightSquads.modelRules.normalEarlyPolicy.allowedModels,["A","B"]);
const unlock=read("missions.json").gating;
assert.deepEqual(unlock.initialSelectable,["easy-01"]);
assert.equal(unlock.easyUnlock,"easy-previous-number-cleared");
assert.equal(unlock.normalUnlock,"easy-same-number-cleared");
assert.equal(unlock.hardUnlock,"easy-all-30-cleared");
assert.equal(unlock.hardIndividualMissionOrder,"all-30-unlocked-together-any-order");
assert.equal(rules.missions.difficultyUnlockPolicy.hardIndividualStageProgression,"all-30-unlocked-together-any-order; no sequential Hard prerequisite and no Normal-clear prerequisite");
assert.equal(rules.missions.difficultyUnlockPolicy.sourceRef,"missions.json/gating");
assert.equal(read("missions.json").normalEarlyDesignRole.unlockStatus.startsWith("confirmed:"),true);
// Static examples exercise the documented dependency; this is not a runtime unlock implementation.
const unlocked=(difficulty,number,clearedEasy)=>{
 const completed=new Set(clearedEasy);
 if(difficulty==="easy")return number===1||completed.has(number-1);
 if(difficulty==="normal")return completed.has(number);
 if(difficulty==="hard")return Array.from({length:30},(_,i)=>i+1).every(i=>completed.has(i));
 return false;
};
assert.equal(unlocked("easy",1,[]),true);
assert.equal(unlocked("easy",2,[]),false);
assert.equal(unlocked("normal",1,[]),false);
assert.equal(unlocked("hard",1,[]),false);
assert.equal(unlocked("easy",2,[1]),true);
assert.equal(unlocked("normal",1,[1]),true);
assert.equal(unlocked("normal",2,[1]),false);
assert.equal(unlocked("normal",5,[1,2,3,4,5]),true);
assert.equal(unlocked("normal",6,[1,2,3,4,5]),false);
assert.equal(unlocked("easy",30,Array.from({length:29},(_,i)=>i+1)),true);
assert.equal(unlocked("hard",1,Array.from({length:29},(_,i)=>i+1)),false);
assert.equal(unlocked("hard",1,Array.from({length:30},(_,i)=>i+1)),true);
const allEasyCleared=Array.from({length:30},(_,i)=>i+1);
assert.equal(allEasyCleared.length,30);
for(let n=1;n<=30;n++){
 assert.equal(unlocked("hard",n,allEasyCleared),true,`Hard M${n} must unlock simultaneously`);
 assert.equal(unlocked("hard",n,allEasyCleared.filter(i=>i!==17)),false,`Hard M${n} should be locked when Easy M17 is incomplete`);
}
assert.equal(unlocked("hard",30,allEasyCleared),true);
assert.equal(unlocked("hard",20,allEasyCleared),true); // no required Hard M01..M19 clears
assert.equal(unlocked("normal",30,allEasyCleared),true);
assert.equal(catalog.find(x=>x.id==="normal-01").firstClear.exp,140);
assert.equal(catalog.find(x=>x.id==="normal-01").repeatClear.exp,62);
assert.equal(catalog.find(x=>x.id==="normal-01").repeatClear.unlimited,true);
assert.equal(data.earlyMissions.easyTemporaryFreeze.status,"temporarily-fixed");
assert.equal(data.earlyMissions.easyTemporaryFreeze.difficulty,"easy");
assert.deepEqual(data.earlyMissions.easyTemporaryFreeze.missionNumbers,[1,2,3,4,5,6,7]);
const easyFrozen=catalog.filter(x=>x.difficulty==="easy"&&x.number<=7);
assert.equal(easyFrozen.length,7);
assert.ok(easyFrozen.every(x=>x.design.temporaryFreeze?.status==="temporarily-fixed"));
assert.ok(catalog.filter(x=>x.difficulty!=="easy"||x.number>7).every(x=>!x.design.temporaryFreeze));
assert.equal(rules.missions.currentDesignRef, "current-group-combat.json");
const movement = data.combat.movement;
assert.equal(movement.systemHardMovCap, null);
assert.equal(movement.currentlyReachableViaCustomization,7);
assert.equal(movement.baseNormalFrameMov,3);
assert.equal(movement.normalFrameAdvancedMov,4);
assert.equal(movement.mobilityFrameInitialMov,4);
assert.equal(movement.mobilityFrameAdvancedMov,5);
assert.equal(movement.allRounderFrameInitialMov,4);
assert.equal(movement.allRounderFrameAdvancedMov,5);
assert.equal(movement.frameModifierGrowthTriggerCoreLevel,21);
assert.equal(movement.coreBaseMovFixed,3);
assert.equal(movement.coreBaseMovFixedForLevels,"1-41");
assert.equal(rules.progression.cores.movementFixedBase,3);
assert.deepEqual(rules.progression.cores.referenceBaseStats.map(x=>x.level),[1,11,21,31,41]);
assert.ok(rules.progression.cores.referenceBaseStats.every(x=>x.mov===3),"core MOV must stay 3 at all levels");
const frameReference=read("frames.json");
assert.equal(frameReference.frameModelCount,10);
assert.equal(frameReference.frames.length,10);
for(const frame of frameReference.frames){
 const expected=frame.id.startsWith("mobile-")||frame.id==="all-rounder" ? [1,2,2] : [0,1,1];
 assert.deepEqual(Object.values(frame.movementModifierAtCoreLevel),expected,"frame modifier growth "+frame.id);
 assert.deepEqual(frame.totalsAtCoreLevel.map(x=>x.mov),expected.map(x=>x+2),"old core2 reference "+frame.id);
 assert.deepEqual(expected.map(x=>3+x),frame.id.startsWith("mobile-")||frame.id==="all-rounder"?[4,5,5]:[3,4,4],"equipped MOV "+frame.id);
}
// Adopted 2026-10-29 mobility-frame attack growth B. Both melee and ranged
// retain the low Lv1 baseline but match reactor-1 at Lv21 and Lv41.
const mobilityFrames=frameReference.frames.filter(x=>x.id==="mobile-1"||x.id==="mobile-2");
assert.equal(mobilityFrames.length,2);
const expectedMobilityAttack=[40,90,110];
for(const frame of mobilityFrames){
 assert.deepEqual(frame.totalsAtCoreLevel.map(x=>x.level),[1,21,41]);
 assert.deepEqual(frame.totalsAtCoreLevel.map(x=>x.melee),expectedMobilityAttack,"mobility melee growth "+frame.id);
 assert.deepEqual(frame.totalsAtCoreLevel.map(x=>x.ranged),expectedMobilityAttack,"mobility ranged growth "+frame.id);
 assert.deepEqual(frame.totalsAtCoreLevel.map(x=>x.mov),[3,4,4],"mobility MOV unchanged "+frame.id);
}
const reactorFrame=frameReference.frames.find(x=>x.id==="reactor-1");
assert.deepEqual(reactorFrame.totalsAtCoreLevel.map(x=>x.melee),[50,90,110]);
assert.deepEqual(reactorFrame.totalsAtCoreLevel.map(x=>x.ranged),[50,90,110]);
for(const frame of frameReference.frames.filter(x=>x.unlock.initial===true&&!x.id.startsWith("mobile-"))){
 assert.equal(frame.totalsAtCoreLevel.length,3,"initial non-mobile frames intact "+frame.id);
}
assert.equal(frameReference.movementModifierModel.stepThresholdCoreLevel,21);
assert.equal(rules.progression.cores.frameMovementGrowthAdopted.atCoreLevel,21);
assert.equal(movement.movBeyond7GeometryStatus.startsWith("MOV8+"),true);
assert.equal(movement.targetDestinationCountsExcludingOrigin["6"], 60);
assert.equal(movement.targetDestinationCountsExcludingOrigin["7"], 80);
const forward = (rows) => {
  const set = new Set();
  for (const [y,halfWidth] of rows) for(let x=-halfWidth; x<=halfWidth; x++) {
    if(x !== 0 || y !== 0)set.add(`${x},${y}`);
  }
  return set;
};
const f5 = forward(movement.forwardRowsMov5Reference);
const f6 = forward(movement.mov6Additions.forwardRows);
const f7 = forward(movement.mov7Additions.forwardRows);
assert.deepEqual([f5.size,f6.size,f7.size],[48,60,80]);
for (const point of f5)assert.ok(f6.has(point),"MOV6 must retain MOV5");
for (const point of f6)assert.ok(f7.has(point),"MOV7 must retain MOV6");
const light = data.enemies.lightSquads;
assert.equal(light.squadSize,3);
assert.equal(light.squadFootprint.width,4);
assert.equal(light.squadFootprint.height,4);
assert.equal(light.squadFootprint.coordinateDiffMax,3);
assert.equal(light.actionSet.length,3);
assert.equal(light.aiRoles.length,6);
assert.equal(light.chassisTypes.length,4);
for(const type of light.chassisTypes){
 const cp=light.statsByChassis[type];
 assert.equal(cp.length,6);
 assert.deepEqual(cp.map(r=>r[0]),[1,5,11,21,31,41]);
 for(const row of cp)assert.ok(row.slice(1).every(Number.isInteger));
}
assert.equal(data.allies.tactics.length,5);
assert.equal(data.allies.threePresetsLv1.length,3);
assert.equal(data.enemies.soloEnemies.medium.lv1.length,4);
assert.equal(data.enemies.soloEnemies.heavy.lv1.length,3);
assert.deepEqual(data.defeatAndRespawn.spawnArea.shapeOptions.map(x=>x.cells),[8,10]);
assert.equal(data.defeatAndRespawn.alliedRespawn.defeatedInRoundRReturnsAtStartOfRound,"R+2");
assert.equal(data.enemies.reinforcement.spawnTiming,"start of next round after trigger");
assert.equal(data.enemies.enemyRespawnDefault,false);
const addons = read("addons.json").parts;
const addonIds = new Set(addons.map(x=>x.id));
assert.equal(addons.length, 60);
assert.equal(addonIds.size, 60);
for (const id of ["friendly-ai-boost","friendly-ai-formation-enabler","weakpoint-targeting","shared-victory-recovery-circuit","movement-interference-field","formation-extension-unlock"]) assert.ok(addonIds.has(id), "missing revised addon "+id);
for (const id of ["sweep-focus","tow-wire","target-marker","stagger-center","predictive-sniping","impact-deflector"]) assert.ok(!addonIds.has(id), "obsolete addon remains "+id);
const getAddon = (id) => addons.find(x=>x.id===id);
const confirmedReplacements = [
  ["normal",12,"friendly-ai-boost"],
  ["normal",28,"friendly-ai-formation-enabler"],
  ["hard",6,"weakpoint-targeting"],
  ["hard",16,"shared-victory-recovery-circuit"],
  ["hard",18,"movement-interference-field"],
  ["hard",19,"formation-extension-unlock"]
];
for (const [difficulty,number,id] of confirmedReplacements) {
  const addon = getAddon(id);
  const mission = catalog.find(m => m.difficulty === difficulty && m.number === number);
  assert.ok(addon && mission, id);
  assert.equal(addon.acquisition.difficulty, difficulty);
  assert.equal(addon.acquisition.mission, number);
  assert.equal(addon.rewardSlotStatus, "confirmed-2026-10-28");
  assert.equal(mission.firstSubobjective.addonId, id);
  assert.equal(mission.firstSubobjective.rewardAssignmentStatus, "confirmed-2026-10-28");
}
assert.equal(getAddon("formation-extension-unlock").cap, 24);
assert.equal(getAddon("formation-extension-unlock").capStatus, "confirmed-2026-10-28");
assert.equal(data.addonRevision.confirmedRewardAssignments.length,6);
assert.equal(getAddon("friendly-ai-boost").cap, 24);
assert.equal(getAddon("friendly-ai-formation-enabler").cap, 14);
assert.equal(getAddon("burning-round").effect.burn.ticks, 3);
assert.equal(getAddon("tactical-teleport-beacon").effect.energyCost, 0);
assert.equal(getAddon("tactical-teleport-beacon").effect.usesUnlimited, true);
assert.equal(getAddon("resupply-field").effect.area.width, 3);
assert.equal(getAddon("resupply-field").effect.area.height, 3);
assert.equal(getAddon("formation-amplifier-light").effect.offensiveDamageBonusFraction, 0.1);
assert.equal(getAddon("formation-amplifier-medium").effect.offensiveDamageBonusFraction, 0.15);
for(const m of catalog.filter(x=>x.difficulty!=="easy")){
 const part=getAddon(m.firstSubobjective.addonId);
 assert.ok(part,"missing subobjective part for "+m.id);
 assert.equal(part.acquisition.difficulty,m.difficulty);
 assert.equal(part.acquisition.mission,m.number);
}
assert.equal(rules.combat.actions.lineFormation.damageFormula,"floor(10*(A1+W1+A2)/targetDEF)");
assert.equal(rules.combat.actions.deltaFormation.targetsMax,3);
assert.equal(rules.combat.actions.pairFormation.energyCost,35);
assert.equal(rules.combat.actions.formationGlobalLimit.sameTechniqueMaxActivationsPerAlliedRound,1);

assert.equal(rules.progression.equipment.weaponSlotRules.slotsPerDirectlyControlledRobot,2);
assert.equal(rules.progression.equipment.weaponSlotRules.sameWeaponIdMayAppearTwiceOnOneRobot,false);
assert.equal(data.identity.equipmentRestrictions.identicalWeaponIdOnOneRobot,false);
assert.equal(rules.missions.tutorialPolicy.inMissionTutorials,false);
assert.equal(data.earlyMissions.common.tutorialPolicy.allNormallyAvailableBasicSystemsCanBeUsedFromM01,true);
assert.equal(data.enemies.lightSquads.squadFootprint.usualCluster,"2x3 to 3x3 cells");
assert.equal(data.battlePresentation.aiTurnPresentation.stepControl.includes("Next action"),true);
assert.equal(data.battlePresentation.aiTurnPresentation.plannedActionPreview.includes("predicted damage"),true);
console.log("PASS: core MOV3, Lv21 frame MOV growth, adopted mobility attack growth B, catalogs, respawn and early missions.");
console.log("NOTE: static design check only. No gameplay, balance, pathfinding or browser verification.");
