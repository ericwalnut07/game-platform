// Static consistency checks for the adopted offline group-combat design.
// This is NOT a gameplay simulator or balance proof.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const dir = dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
const coreSpec=read("rules.json");
const frameSpec=read("frames.json");
const partsSpec=read("basic-parts.json");
const approvedCoreHp=new Map([[1,45],[11,75],[21,110],[31,145],[41,180]]);
const oldCoreHp=new Map([[1,45],[11,60],[21,70],[31,75],[41,80]]);
const approvedWeaponBands=[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]];
const weaponLvForCore=(l)=>approvedWeaponBands.find(([min,max])=>l>=min&&l<=max)?.[2];
const roundAdopted=(v)=>Math.floor(v+0.5);
for(const coreRow of coreSpec.progression.cores.referenceBaseStats){
 assert.equal(coreRow.hp,approvedCoreHp.get(coreRow.level),"core HP B "+coreRow.level);
 assert.equal(coreRow.mov,3);
}
assert.equal(coreSpec.progression.cores.hpGrowth.status,"adopted-2026-10-29");
for(const frame of frameSpec.frames)for(const cp of frame.totalsAtCoreLevel){
 assert.ok(oldCoreHp.has(cp.level));
 const former=oldCoreHp.get(cp.level),current=approvedCoreHp.get(cp.level);
 // Frame totals are snapshots; verify adopted core HP delta relative to known 10-frame legacy snapshots.
 assert.ok(cp.hp >= current-10,"frame total HP must reflect adopted core HP "+frame.id+" Lv"+cp.level);
 assert.equal(current-former,cp.level===1?0:cp.level===21?40:100);
}
assert.equal(partsSpec.weaponCheckpointInterpolation.status,"adopted-2026-10-29");
for(const weapon of partsSpec.parts.filter(p=>p.slot==="weapon")){
 for(const checkpoint of [1,5,8,10])assert.ok(weapon.checkpoints[checkpoint]?.weaponPower>=0,"invalid weapon power checkpoint "+weapon.id);
 for(let lv=1;lv<=10;lv++){
  const cps=[1,5,8,10],lower=[...cps].reverse().find(k=>k<=lv),upper=cps.find(k=>k>=lv);
  const a=weapon.checkpoints[lower],b=weapon.checkpoints[upper];
  for(const key of ["weaponPower","cap"]){
   const computed=lower===upper?a[key]:roundAdopted(a[key]+(b[key]-a[key])*(lv-lower)/(upper-lower));
   assert.ok(Number.isSafeInteger(computed)&&computed>=0,"invalid weapon interpolation "+weapon.id+" Lv"+lv);
  }
 }
}
const data = read("current-group-combat.json");
const allyPresets = data.allies.threePresetsLv1;
const allyGrowth=data.allies.presetGrowth;
assert.equal(allyGrowth.status,"adopted-2026-10-29");
assert.equal(allyPresets.length,3);
assert.deepEqual(allyGrowth.certifiedCheckpoints.levels,[1,21,41]);
assert.deepEqual(allyGrowth.certifiedCheckpoints.partLevels,[1,5,8]);
assert.deepEqual(allyGrowth.partLevelByReferenceCoreLevel.map(x=>[...x.core,x.part]),approvedWeaponBands);
for(const a of allyPresets){
 const rows=allyGrowth.certifiedCheckpoints.statsByPreset[a.id];
 assert.equal(rows.length,3);
 for(const [i,{level,partLevel,cap,...values}] of rows.entries()){
  assert.equal(level,[1,21,41][i]);
  assert.equal(partLevel,[1,5,8][i]);
  const f=frameSpec.frames.find(z=>z.id===a.frame);
  assert.ok(f);
  const fr=f.totalsAtCoreLevel.find(z=>z.level===level);
  const equipmentIds=[a.engine,...a.weapons,a.armor,a.control,a.special];
  assert.equal(equipmentIds.length,6);
  let checkCap=0;
  const expected=Object.fromEntries(["hp","melee","ranged","def","spd","en"].map(key=>[key,fr[key]]));
  let mov=3+f.movementModifierAtCoreLevel[String(level)];
  for(const id of equipmentIds){
   const p=partsSpec.parts.find(z=>z.id===id),checkpoint=p?.checkpoints[String(partLevel)];
   assert.ok(checkpoint,"missing ally part "+id);
   checkCap+=checkpoint.cap;
   for(const [key,v] of Object.entries(checkpoint.statModifiers||{})){
    if(key==="mov")mov+=v;
    else expected[key]+=v;
   }
  }
  assert.equal(checkCap,cap);
  assert.deepEqual(values,{...expected,mov});
  if(i===0)for(const key of ["hp","melee","ranged","def","mov","spd","en"])assert.equal(a[key],values[key]);
 }
}

const catalog = read("missions.json").missions;
const mediumHeavy=read("medium-heavy-models.json");
assert.equal(mediumHeavy.status,"adopted-2026-10-29");
assert.equal(mediumHeavy.runtimeContent,false);
assert.deepEqual(mediumHeavy.counts,{medium:12,heavy:9,total:21});
assert.equal(mediumHeavy.models.length,21);
assert.equal(new Set(mediumHeavy.models.map(m=>m.id)).size,21);
const knownEnemyWeapons=new Set(read("basic-parts.json").parts.filter(p=>p.slot==="weapon").map(p=>p.id));
const keysByClass={medium:["melee","ranged","defense","mobile"],heavy:["heavy-assault","heavy-artillery","heavy-armor"]};
const mediumHeavyModels=new Map(mediumHeavy.models.map(m=>[m.id,m]));
for(const cls of ["medium","heavy"]){
 for(const chassis of keysByClass[cls]){
  for(const tier of ["A","B","C"]){
   const id=cls+"-"+chassis+"-"+tier,model=mediumHeavyModels.get(id);
   assert.ok(model,"missing model "+id);
   assert.equal(model.weightClass,cls);
   assert.equal(model.archetype,chassis);
   assert.equal(model.model,tier);
   assert.equal(model.weaponIds.length,2);
   assert.notEqual(model.weaponIds[0],model.weaponIds[1]);
   for(const weapon of model.weaponIds)assert.ok(knownEnemyWeapons.has(weapon),"unknown weapon "+weapon+" in "+id);
  }
 }
}
assert.equal(data.enemies.soloEnemies.medium.modelCatalogRef,"medium-heavy-models.json");
assert.equal(data.enemies.soloEnemies.heavy.modelCatalogRef,"medium-heavy-models.json");
const approvedChassis={
 medium:{"melee":[[1,55,74,74,33,3,56,70],[5,62,81,81,36,3,60,76],[11,73,96,96,42,3,65,87],[21,95,126,126,52,4,75,108],[31,114,145,145,58,4,82,130],[41,130,165,165,64,4,90,150]],"ranged":[[1,58,54,54,43,3,46,100],[5,64,61,66,46,3,49,108],[11,75,75,86,52,3,55,120],[21,98,100,120,62,4,63,145],[31,118,119,140,68,4,69,170],[41,135,138,160,74,4,75,195]],"defense":[[1,66,44,44,50,3,35,75],[5,74,50,50,55,3,38,83],[11,88,62,62,64,3,42,95],[21,115,88,88,79,4,49,118],[31,140,104,104,91,4,54,140],[41,160,123,123,103,4,60,165]],"mobile":[[1,48,44,44,30,4,87,75],[5,54,54,54,33,4,91,83],[11,65,70,70,39,4,98,96],[21,86,105,105,50,5,111,120],[31,105,125,125,56,5,121,145],[41,122,145,145,63,5,130,165]]},
 heavy:{"heavy-assault":[[1,105,90,75,55,3,50,105],[5,116,100,83,59,3,54,115],[11,135,116,100,67,3,60,133],[21,175,150,135,82,3,69,165],[31,210,175,158,94,3,76,195],[41,240,200,180,108,3,83,225]],"heavy-artillery":[[1,100,65,100,58,2,40,120],[5,111,73,113,62,2,44,131],[11,129,88,132,70,2,49,152],[21,167,118,171,85,2,58,189],[31,201,141,200,98,2,64,223],[41,230,165,229,110,2,71,259]],"heavy-armor":[[1,135,70,60,74,2,30,110],[5,148,78,67,80,2,33,120],[11,174,91,83,91,2,37,141],[21,220,121,112,112,2,44,175],[31,264,145,130,129,2,49,210],[41,300,168,148,145,2,55,245]]}
};
const approvedColumns=["level","hp","melee","ranged","def","mov","spd","en"];
assert.equal(data.enemies.soloEnemies.weaponLevelCommonPolicy.status,"adopted-2026-10-29");
assert.deepEqual(data.enemies.soloEnemies.weaponLevelCommonPolicy.weaponLevelByEnemyReferenceCoreLevel.map(x=>[...x.core,x.weapon]),approvedWeaponBands);
for(const [weightClass,archetypes] of Object.entries(approvedChassis)){
 const spec=data.enemies.soloEnemies[weightClass];
 assert.equal(spec.statGrowthStatus,"adopted-2026-10-29");
 assert.equal(spec.weaponLevelPolicyStatus,"adopted-2026-10-29");
 assert.deepEqual(spec.statGrowth.columns,approvedColumns);
 assert.deepEqual(spec.statGrowth.statsByChassis,archetypes);
 for(const [archetype,rows] of Object.entries(archetypes)){
  const lv1=spec.lv1.find(x=>x.id===archetype);
  assert.ok(lv1);
  for(let i=1;i<approvedColumns.length;i++)assert.equal(lv1[approvedColumns[i]],rows[0][i],"Lv1 retained "+weightClass+" "+archetype);
  for(let level=1;level<=41;level++){
   const lower=[...rows].reverse().find(x=>x[0]<=level),upper=rows.find(x=>x[0]>=level);
   for(let i=1;i<approvedColumns.length;i++){
    const actual=approvedColumns[i]==="mov"?lower[i]:lower[0]===upper[0]?lower[i]:roundAdopted(lower[i]+(upper[i]-lower[i])*(level-lower[0])/(upper[0]-lower[0]));
    assert.ok(Number.isSafeInteger(actual)&&actual>0,"bad stat interpolation "+weightClass+" "+archetype+" Lv"+level);
   }
  }
 }
}

assert.equal(read("rules.json").missions.mediumHeavyEnemyModels.catalogRef,"medium-heavy-models.json");
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
 for(const solo of p.soloEnemies){
 if(solo.kind==="boss"){
  assert.equal(solo.weaponMappingStatus,"candidate-not-adopted","command boss loadout remains tentative");
  continue;
 }
 assert.ok(["medium","heavy"].includes(solo.kind));
 const modelTier=p.difficulty==="normal"?"A":"B";
 const modelId=solo.kind+"-"+solo.archetype+"-"+modelTier;
 const model=mediumHeavyModels.get(modelId);
 assert.ok(model,"model not found "+modelId);
 assert.equal(solo.model,modelTier);
 assert.equal(solo.modelId,modelId);
 assert.equal(solo.modelCatalogRef,"medium-heavy-models.json");
 assert.equal(solo.weaponMappingStatus,"adopted-by-model-catalog");
 assert.equal(solo.weaponLevel,weaponLvForCore(p.enemyReferenceCoreLevel));
 assert.equal(solo.weaponLevelStatus,"adopted-2026-10-29");
 assert.equal(solo.weaponLevelPolicyRef,"current-group-combat.json/enemies/soloEnemies/weaponLevelCommonPolicy");
 assert.equal(solo.statGrowthRef,"current-group-combat.json/enemies/soloEnemies/"+solo.kind+"/statGrowth");
 const statRows=approvedChassis[solo.kind][solo.archetype];
 for(let i=1;i<approvedColumns.length;i++){
  const key=approvedColumns[i],level=p.enemyReferenceCoreLevel;
  const prev=[...statRows].reverse().find(x=>x[0]<=level),next=statRows.find(x=>x[0]>=level);
  const expected=key==="mov"||prev===next?prev[i]:roundAdopted(prev[i]+(next[i]-prev[i])*(level-prev[0])/(next[0]-prev[0]));
  assert.equal(solo.statAtEnemyCoreLevel[key],expected,"adopted stat "+p.id+" "+key);
 }
 
 assert.deepEqual(solo.loadout,model.weaponIds);
}
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
