/* Robot tactics full playtest: canonical catalog adapter.
 * Does not change or silently adopt undecided game rules.
 * The intermediate nonweapon part/frame values below are explicitly playtest interpolation.
 */
(function(root) {
"use strict";
const S=["hp","melee","ranged","def","spd","en"];
const FRAME_IDS=["attack-1","reactor-1","defense-1","mobile-1"];
const BANDS=[[1,5,1],[6,10,2],[11,15,3],[16,20,4],[21,25,5],[26,30,6],[31,35,7],[36,41,8]];
const DEFAULT_PARTY=[
 {frameId:"attack-1",coreLevel:1,slots:{engine:"standard-engine",weapon1:"standard-sword",weapon2:"assault-rifle",armor:"standard-armor",control:"standard-control",special:"general-support"}},
 {frameId:"reactor-1",coreLevel:1,slots:{engine:"standard-engine",weapon1:"standard-sword",weapon2:"assault-rifle",armor:"light-armor",control:"standard-control",special:"general-support"}},
 {frameId:"mobile-1",coreLevel:1,slots:{engine:"standard-engine",weapon1:"light-blade",weapon2:"light-pistol",armor:"light-armor",control:"standard-control",special:"general-support"}}
];
const DEFAULT_SLOTS=["engine","weapon1","weapon2","armor","control","special"];
function round(n){return Math.floor(n+0.5);}
function assert(ok,msg){if(!ok)throw Error(msg);}
function partLevelForEnemy(coreLevel){assert(Number.isInteger(coreLevel)&&coreLevel>=1&&coreLevel<=41,"invalid enemy core level");return BANDS.find(x=>coreLevel>=x[0]&&coreLevel<=x[1])[2];}
function between(rows,lv,key,levelKey="level",step=false){
 const sorted=rows.slice().sort((a,b)=>a[levelKey]-b[levelKey]);
 const lo=[...sorted].reverse().find(x=>x[levelKey]<=lv),hi=sorted.find(x=>x[levelKey]>=lv);
 assert(lo&&hi,"level outside checkpoints: "+lv);
 if(step||lo[levelKey]===hi[levelKey])return lo[key];
 return round(lo[key]+(hi[key]-lo[key])*(lv-lo[levelKey])/(hi[levelKey]-lo[levelKey]));
}
function coreHp(catalog,lv){
 const rows=catalog.rules.progression.cores.hpGrowth.checkpoints;
 return between(rows,lv,"hp");
}
function getFrame(catalog,id){const f=catalog.frames.frames.find(x=>x.id===id);assert(!!f,"frame not found "+id);return f;}
function getPart(catalog,id){const p=catalog.parts.parts.find(x=>x.id===id);assert(!!p,"part not found "+id);return p;}
function frameValues(catalog,frameId,coreLevel){
 const f=getFrame(catalog,frameId),rows=f.totalsAtCoreLevel;
 const hpModifiers=rows.map(x=>({level:x.level,amount:x.hp-coreHp(catalog,x.level)}));
 const vals={};
 vals.hp=coreHp(catalog,coreLevel)+between(hpModifiers,coreLevel,"amount");
 for(const key of S.filter(x=>x!=="hp"))vals[key]=between(rows,coreLevel,key);
 vals.mov=3+(coreLevel<21?f.movementModifierAtCoreLevel["1"]:f.movementModifierAtCoreLevel["21"]);
 vals.movementType=f.movementType;
 return vals;
}
function partCheckpoint(catalog,id,level) {
 assert(Number.isInteger(level)&&level>=1&&level<=10,"part level range");
 const p=getPart(catalog,id), keys=Object.keys(p.checkpoints).map(Number).sort((a,b)=>a-b);
 const lo=[...keys].reverse().find(k=>k<=level),hi=keys.find(k=>k>=level);
 assert(lo!==undefined&&hi!==undefined,"part has no surrounding checkpoints "+id);
 const a=p.checkpoints[lo],b=p.checkpoints[hi],calc=(k)=>lo===hi?a[k]:round(a[k]+(b[k]-a[k])*(level-lo)/(hi-lo));
 const keysMod=[...new Set([...Object.keys(a.statModifiers||{}),...Object.keys(b.statModifiers||{})])];
 const mods={};
 for(const k of keysMod){
  const av=a.statModifiers?.[k],bv=b.statModifiers?.[k];
  // Every current basic part has stable stat modifier keys at levels 1/5/8/10.
  assert(typeof av==="number"&&typeof bv==="number","pending stat modifier: "+id+" "+k+" level "+level);
  mods[k]=lo===hi?av:round(av+(bv-av)*(level-lo)/(hi-lo));
 }
 return {level,cap:calc("cap"),weaponPower:p.slot==="weapon"?calc("weaponPower"):0,statModifiers:mods,part:p};
}
function newWeapon(catalog,id,level){
 const d=partCheckpoint(catalog,id,level);
 const p=d.part;
 assert(p.slot==="weapon","not a weapon: "+id);
 return {id,level,name:p.name,family:p.weaponFamily,range:p.range,maxRange:p.range?.max||1,minRange:p.range?.min||1,
  power:d.weaponPower,effect:p.builtInEffect||null,penalties:p.penalties||null};
}
function calculate(catalog,frameId,coreLevel,slots){
 assert(Number.isInteger(coreLevel)&&coreLevel>=1&&coreLevel<=41,"coreLv 1-41");
 const vals=frameValues(catalog,frameId,coreLevel),computed={...vals},weapons=[],equipment=[],levels={};
 let cap=0;
 for(const name of DEFAULT_SLOTS) {
  const entry=slots[name];const id=typeof entry==="string"?entry:entry?.id,lv=typeof entry==="string"?1:entry?.level;
  assert(id&&Number.isInteger(lv),"invalid equipped slot "+name);
  const part=getPart(catalog,id);
  assert(part.slot===(name.startsWith("weapon")?"weapon":name),"wrong slot "+name+" : "+id);
  const p=partCheckpoint(catalog,id,lv);
  cap+=p.cap;levels[name]=lv;
  for(const [k,v] of Object.entries(p.statModifiers)){if(k==="mov")computed.mov+=v;else computed[k]=(computed[k]||0)+v;}
  for(const [k,v] of Object.entries(p.part.penalties||{})){if(typeof v!=="number"||k in p.statModifiers)continue;if(k==="mov")computed.mov+=v;else if(k in computed)computed[k]+=v;}
  if(name.startsWith("weapon"))weapons.push(newWeapon(catalog,id,lv));
  equipment.push({slot:name,id,level:lv,cap:p.cap,name:part.name});
 }
 assert(weapons[0].id!==weapons[1].id,"identical weapon IDs cannot be equipped together");
 computed.mov=Math.max(1,computed.mov);
 return {frameId,coreLevel,stats:computed,cap,maxCap:100+5*(coreLevel-1),weapons,equipment,partLevels:levels};
}
function player(catalog,config){
 const frameId=config.frameId,coreLevel=Number(config.coreLevel);
 assert(FRAME_IDS.includes(frameId),"only initial four frames allowed");
 const slots={};
 for(const name of DEFAULT_SLOTS){
  const item=config.slots?.[name];const id=typeof item==="string"?item:item?.id;
  assert(getPart(catalog,id).acquisition?.type==="initial","only initial 18 parts are available");
  slots[name]=typeof item==="string"?{id:item,level:Number(config.partLevel??1)}:item;
 }
 const result=calculate(catalog,frameId,coreLevel,slots);
 assert(result.cap<=result.maxCap,"CAP exceeded: "+result.cap+"/"+result.maxCap);
 return result;
}
function friendly(catalog,presetId,coreLevel){
 const preset=catalog.combat.allies.threePresetsLv1.find(x=>x.id===presetId);
 assert(!!preset,"missing friendly preset: "+presetId);
 const level=partLevelForEnemy(coreLevel),slots={
  engine:{id:preset.engine,level},weapon1:{id:preset.weapons[0],level},weapon2:{id:preset.weapons[1],level},
  armor:{id:preset.armor,level},control:{id:preset.control,level},special:{id:preset.special,level}
 };
 const computed=calculate(catalog,preset.frame,coreLevel,slots);
 return {...computed,presetId,presetName:preset.name,fixedEquipment:true};
}
function enemyLevel(catalog,stage,difficulty){
 const id=difficulty+"-"+String(stage).padStart(2,"0");
 if(difficulty==="easy"){
  const m=catalog.missions.missions.find(x=>x.id===id);
  // Easy has a recommended range but no stage-exact adopted enemy level yet.
  return {level:m.recommendedCoreLevel.min,source:"trial-easy-minimum-of-recommended-range",stageId:id,profile:null};
 }
 const profile=catalog.encounters.profiles.find(x=>x.id===id);
 assert(!!profile,"stage profile not found: "+id);
 return {level:profile.enemyReferenceCoreLevel,source:"adopted-normal-hard-stage-reference",stageId:id,profile};
}
function light(catalog,chassis,model,coreLevel,weaponId){
 const table=catalog.combat.enemies.lightSquads.statsByChassis[chassis];
 assert(!!table,"unknown light chassis "+chassis);
 const columns=catalog.combat.enemies.lightSquads.columns,lvRows=table.map(row=>Object.fromEntries(columns.map((k,i)=>[k,row[i]])));
 const s={};for(const k of ["hp","melee","ranged","def","spd"])s[k]=between(lvRows,coreLevel,k);
 const mov={melee:3,ranged:3,defense:2,mobile:4}[chassis];
 const gearLv=partLevelForEnemy(coreLevel);
 const weaponMap={
  melee:{A:"light-blade",B:"standard-sword",C:"lance"},
  ranged:{A:"light-pistol",B:"assault-rifle",C:"sniper-rifle"},
  defense:{A:"standard-sword",B:"heavy-hammer",C:"quake-hammer"},
  mobile:{A:"light-blade",B:"standard-sword",C:"armor-pile"}
 };
 const tentative=(chassis==="defense"||chassis==="mobile");
 const wp=weaponId||weaponMap[chassis][model];
 const weapon=newWeapon(catalog,wp,gearLv);
 const modifier=partCheckpoint(catalog,wp,gearLv).statModifiers;
 const st={...s,mov, en:65, movementType:{melee:"straight",ranged:"diagonal",defense:"omni",mobile:"forward"}[chassis]};
 for(const [k,v] of Object.entries(modifier)){if(k==="mov")st.mov=Math.max(1,st.mov+v);else if(st[k]!==undefined)st[k]+=v;}
 for(const [k,v] of Object.entries(weapon.penalties||{})){if(typeof v!=="number"||k in modifier)continue;if(k==="mov")st.mov=Math.max(1,st.mov+v);else if(k in st)st[k]+=v;}
 return {class:"light",chassis,model,coreLevel,gearLevel:gearLv,stats:st,weapons:[weapon],tentativeWeaponMapping:tentative};
}
function solo(catalog,weightClass,archetype,model,coreLevel){
 assert(["medium","heavy"].includes(weightClass),"not medium/heavy");
 const group=catalog.combat.enemies.soloEnemies[weightClass].statGrowth,rows=group.statsByChassis[archetype];
 assert(!!rows,"missing enemy archetype "+archetype);
 const data=rows.map(row=>Object.fromEntries(group.columns.map((key,i)=>[key,row[i]])));
 const stats={};for(const key of ["hp","melee","ranged","def","spd","en"]){
  stats[key]=between(data,coreLevel,key);
 }
 stats.mov=between(data,coreLevel,"mov","level",true);
 stats.movementType={melee:"straight",ranged:"diagonal",defense:"omni",mobile:"forward","heavy-assault":"straight","heavy-artillery":"diagonal","heavy-armor":"omni"}[archetype];
 const modelId=weightClass+"-"+archetype+"-"+model,record=catalog.models.models.find(x=>x.id===modelId);
 assert(!!record,"unknown model "+modelId);
 const gearLv=partLevelForEnemy(coreLevel);
 const weapons=record.weaponIds.map(id=>newWeapon(catalog,id,gearLv));
 for(const w of weapons)for(const [key,value] of Object.entries(partCheckpoint(catalog,w.id,w.level).statModifiers)){
  if(key==="mov")stats.mov+=value;else if(key in stats)stats[key]+=value;
 }
 for(const w of weapons)if(w.penalties)for(const [key,value] of Object.entries(w.penalties)){
  if(key==="mov"||key==="spd")stats[key]+=value;
 }
 stats.mov=Math.max(1,stats.mov);
 return {class:weightClass,archetype,model,coreLevel,gearLevel:gearLv,stats,weapons,modelId};
}
function damage(attack,power,def,mult=1,area=1){return Math.floor(10*(attack+power)*mult*area/Math.max(1,def));}
root.RobotSevenFullModel={DEFAULT_PARTY,FRAME_IDS,DEFAULT_SLOTS,BANDS,round,partLevelForEnemy,coreHp,frameValues,partCheckpoint,newWeapon,calculate,player,friendly,enemyLevel,light,solo,damage};
})(globalThis);
