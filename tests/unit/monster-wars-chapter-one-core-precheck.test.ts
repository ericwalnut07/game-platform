import { expect, it, beforeAll, afterAll } from 'vitest';
import { models, weapons, affinities, equipment, unlocks, modelFor } from '../../src/games/monster-wars/catalog';
import { missions, missionIds, missionTerrain, recommended, ceiling } from '../../src/games/monster-wars/missions';
import { freshCampaign, totalXp, level, validEntry, rosterCost, award, levelUp, sortieError, campaignGroups, type Campaign } from '../../src/games/monster-wars/campaign';
import { unit, playerUnits, createBattle, deploy, type Battle } from '../../src/games/monster-wars/battle-state';
import { cellsOf, footprint, inRect, occupied, placement, distance } from '../../src/games/monster-wars/grid';
import { act, command, autoAction, enemyAction, type Action } from '../../src/games/monster-wars/battle';
import type { Model, Weapon, Mission, Rectangle, Cell, Difficulty, Direction, RosterEntry } from '../../src/games/monster-wars/types';

// Isolated test fixture; not shipped campaign content. All coordinates come from the approved map document.
type TrialMission=Mission&{id:string;zones:Rectangle[];airZone?:number;facility?:{at:Cell;hp:number}};
const fixtures=[{"id":"M03","number":3,"size":16,"limit":12,"zone":[5,12,10,15],"zones":[[5,12,10,15]],"terrain":{"road":[[7,0,8,15],[0,9,6,9],[9,9,15,9]],"building":[[4,3,6,6],[9,3,11,6],[4,10,4,11],[11,10,11,11]],"rubble":[[5,7,6,8],[9,7,10,8]]},"goal":"clear","enemies":[{"model":"K01","at":[1,4],"facing":2,"priority":false,"id":"E01"},{"model":"K01","at":[2,5],"facing":2,"priority":false,"id":"E02"},{"model":"K01","at":[1,7],"facing":2,"priority":false,"id":"E03"},{"model":"K01","at":[3,8],"facing":2,"priority":false,"id":"E04"},{"model":"K01","at":[13,4],"facing":2,"priority":false,"id":"E05"},{"model":"K01","at":[14,5],"facing":2,"priority":false,"id":"E06"},{"model":"K01","at":[13,7],"facing":2,"priority":false,"id":"E07"},{"model":"K01","at":[14,8],"facing":2,"priority":false,"id":"E08"},{"model":"K03","at":[3,4],"facing":2,"priority":false,"id":"E09"},{"model":"K03","at":[3,6],"facing":2,"priority":false,"id":"E10"},{"model":"K03","at":[12,4],"facing":2,"priority":false,"id":"E11"},{"model":"K03","at":[12,6],"facing":2,"priority":false,"id":"E12"},{"model":"trialVelza","at":[13,10],"facing":2,"priority":false,"id":"E13"},{"model":"trialVelza","at":[14,11],"facing":2,"priority":false,"id":"E14"}],"waves":[],"briefing":"M03 precheck"},{"id":"M04","number":4,"size":18,"limit":14,"zone":[5,14,12,17],"zones":[[5,14,12,17]],"terrain":{"road":[[8,0,9,17],[3,11,7,11],[10,11,14,11]],"mountain":[[0,0,4,4],[13,0,17,4],[0,7,2,12],[15,7,17,12]],"forest":[[5,5,7,7],[10,5,12,7],[3,12,4,14],[13,12,14,14]]},"goal":"clear","enemies":[{"model":"K01","at":[6,2],"facing":2,"priority":false,"id":"E01"},{"model":"K01","at":[7,3],"facing":2,"priority":false,"id":"E02"},{"model":"K01","at":[10,2],"facing":2,"priority":false,"id":"E03"},{"model":"K01","at":[11,3],"facing":2,"priority":false,"id":"E04"},{"model":"K03","at":[5,3],"facing":2,"priority":false,"id":"E05"},{"model":"K03","at":[6,4],"facing":2,"priority":false,"id":"E06"},{"model":"K03","at":[11,4],"facing":2,"priority":false,"id":"E07"},{"model":"K03","at":[12,3],"facing":2,"priority":false,"id":"E08"},{"model":"trialVelza","at":[5,1],"facing":2,"priority":false,"id":"E09"},{"model":"trialVelza","at":[12,1],"facing":2,"priority":false,"id":"E10"},{"model":"trialBalflare","at":[8,2],"facing":2,"priority":false,"id":"E11"},{"model":"trialBalflare","at":[9,2],"facing":2,"priority":false,"id":"E12"}],"waves":[{"id":"R4-01","round":4,"model":"K01","at":[1,5],"facing":2,"alternatives":[[0,5],[2,5]],"priority":false,"required":true},{"id":"R4-02","round":4,"model":"trialVelza","at":[2,6],"facing":2,"alternatives":[[1,6],[3,6]],"priority":false,"required":true},{"id":"R4-03","round":4,"model":"K01","at":[16,5],"facing":2,"alternatives":[[15,5],[17,5]],"priority":false,"required":true},{"id":"R4-04","round":4,"model":"trialVelza","at":[15,6],"facing":2,"alternatives":[[14,6],[16,6]],"priority":false,"required":true}],"briefing":"M04 precheck"},{"id":"M05","number":5,"size":18,"limit":14,"zone":[6,6,11,11],"zones":[[6,6,11,11],[2,13,6,17]],"airZone":1,"terrain":{"road":[[8,0,9,17],[0,8,7,9],[10,8,17,9]],"forest":[[2,3,4,5],[13,3,15,5],[2,10,4,12],[13,12,15,14]]},"goal":"clear","enemies":[{"model":"K01","at":[7,3],"facing":2,"priority":false,"id":"E01"},{"model":"K01","at":[10,3],"facing":2,"priority":false,"id":"E02"},{"model":"K01","at":[3,7],"facing":2,"priority":false,"id":"E03"},{"model":"K01","at":[14,7],"facing":2,"priority":false,"id":"E04"},{"model":"K01","at":[7,14],"facing":2,"priority":false,"id":"E05"},{"model":"K01","at":[10,14],"facing":2,"priority":false,"id":"E06"},{"model":"K03","at":[3,10],"facing":2,"priority":false,"id":"E07"},{"model":"K03","at":[14,10],"facing":2,"priority":false,"id":"E08"},{"model":"trialVelza","at":[5,3],"facing":2,"priority":false,"id":"E09"},{"model":"trialVelza","at":[12,14],"facing":2,"priority":false,"id":"E10"},{"model":"K04","at":[4,7],"facing":2,"priority":false,"id":"E11"},{"model":"K04","at":[13,10],"facing":2,"priority":false,"id":"E12"}],"waves":[{"id":"R4-01","round":4,"model":"K04","at":[4,2],"facing":2,"alternatives":[[4,1],[3,2]],"priority":false,"required":true},{"id":"R4-02","round":4,"model":"K04","at":[6,2],"facing":2,"alternatives":[[6,1],[5,2]],"priority":false,"required":true},{"id":"R4-03","round":4,"model":"K04","at":[12,2],"facing":2,"alternatives":[[12,1],[11,2]],"priority":false,"required":true},{"id":"R4-04","round":4,"model":"K04","at":[14,2],"facing":2,"alternatives":[[14,1],[13,2]],"priority":false,"required":true}],"briefing":"M05 precheck"},{"id":"M06","number":6,"size":20,"limit":12,"zone":[6,12,13,17],"zones":[[6,12,13,17]],"terrain":{"road":[[9,0,10,8],[9,11,10,19],[0,9,8,10],[11,9,19,10]],"building":[[4,4,6,6],[13,4,15,6],[4,13,5,15],[14,13,15,15]],"defensive_position":[[7,8,8,8],[11,8,12,8],[7,11,8,11],[11,11,12,11]]},"facility":{"at":[9,9],"hp":600},"goal":"defend","enemies":[{"model":"K01","at":[2,6],"facing":2,"priority":true,"id":"E01"},{"model":"K01","at":[3,8],"facing":2,"priority":false,"id":"E02"},{"model":"K01","at":[16,8],"facing":2,"priority":true,"id":"E03"},{"model":"K01","at":[17,11],"facing":2,"priority":false,"id":"E04"},{"model":"K03","at":[2,10],"facing":2,"priority":false,"id":"E05"},{"model":"K03","at":[17,7],"facing":2,"priority":false,"id":"E06"},{"model":"K04","at":[3,5],"facing":2,"priority":true,"id":"E07"},{"model":"K04","at":[16,5],"facing":2,"priority":false,"id":"E08"},{"model":"K06","at":[15,9],"facing":3,"priority":true,"id":"E09"},{"model":"trialVelza","at":[2,12],"facing":2,"priority":false,"id":"E10"}],"waves":[{"id":"R3-01","round":3,"model":"K01","at":[7,2],"facing":2,"alternatives":[[7,1],[6,2]],"priority":true,"required":false},{"id":"R3-02","round":3,"model":"K01","at":[12,2],"facing":2,"alternatives":[[12,1],[11,2]],"priority":false,"required":false},{"id":"R3-03","round":3,"model":"K04","at":[3,3],"facing":2,"alternatives":[[3,2],[2,3]],"priority":true,"required":false},{"id":"R3-04","round":3,"model":"K04","at":[16,3],"facing":2,"alternatives":[[16,2],[15,3]],"priority":false,"required":false},{"id":"R3-05","round":3,"model":"trialVelza","at":[18,13],"facing":2,"alternatives":[[18,12],[17,13]],"priority":false,"required":false},{"id":"R6-06","round":6,"model":"K03","at":[2,16],"facing":2,"alternatives":[[2,15],[1,16]],"priority":true,"required":false},{"id":"R6-07","round":6,"model":"K03","at":[17,16],"facing":2,"alternatives":[[17,15],[16,16]],"priority":false,"required":false},{"id":"R6-08","round":6,"model":"K06","at":[10,3],"facing":2,"alternatives":[[9,3],[10,1]],"priority":true,"required":false},{"id":"R6-09","round":6,"model":"trialVelza","at":[1,14],"facing":2,"alternatives":[[1,13],[0,14]],"priority":false,"required":false}],"briefing":"M06 precheck"},{"id":"M07","number":7,"size":20,"limit":14,"zone":[5,15,14,19],"zones":[[5,15,14,19]],"terrain":{"road":[[9,0,10,19]],"forest":[[3,5,5,8],[14,5,16,8],[2,12,4,15],[15,12,17,15]],"water":[[0,0,2,8],[17,0,19,8]]},"goal":"clear","enemies":[{"model":"K01","at":[7,3],"facing":2,"priority":false,"id":"E01"},{"model":"K01","at":[8,3],"facing":2,"priority":false,"id":"E02"},{"model":"K01","at":[11,3],"facing":2,"priority":false,"id":"E03"},{"model":"K01","at":[12,3],"facing":2,"priority":false,"id":"E04"},{"model":"K01","at":[7,5],"facing":2,"priority":false,"id":"E05"},{"model":"K01","at":[12,5],"facing":2,"priority":false,"id":"E06"},{"model":"K03","at":[6,4],"facing":2,"priority":false,"id":"E07"},{"model":"K03","at":[13,4],"facing":2,"priority":false,"id":"E08"},{"model":"K03","at":[10,7],"facing":2,"priority":false,"id":"E09"},{"model":"K04","at":[8,4],"facing":2,"priority":false,"id":"E10"},{"model":"K04","at":[11,4],"facing":2,"priority":false,"id":"E11"},{"model":"K06","at":[6,6],"facing":2,"priority":false,"id":"E12"},{"model":"K06","at":[13,6],"facing":2,"priority":false,"id":"E13"},{"model":"trialBalflare","at":[9,2],"facing":2,"priority":false,"id":"E14"},{"model":"trialBalflare","at":[10,2],"facing":2,"priority":false,"id":"E15"},{"model":"trialRegel","at":[8,6],"facing":2,"priority":false,"id":"E16"},{"model":"trialRegel","at":[11,6],"facing":2,"priority":false,"id":"E17"}],"waves":[],"briefing":"M07 precheck"},{"id":"M08","number":8,"size":22,"limit":16,"zone":[7,7,14,14],"zones":[[7,7,14,14]],"terrain":{"road":[[10,0,11,9],[10,12,11,21],[0,10,7,11],[9,10,9,11],[12,10,12,11],[14,10,21,11]],"building":[[5,5,6,6],[15,5,16,6],[5,15,6,16],[15,15,16,16]],"defensive_position":[[8,8,9,8],[12,8,13,8],[8,13,9,13],[12,13,13,13],[8,10,8,11],[13,10,13,11]]},"facility":{"at":[10,10],"hp":800},"goal":"defend","enemies":[{"model":"K01","at":[9,3],"facing":2,"priority":true,"id":"E01"},{"model":"K01","at":[3,10],"facing":2,"priority":false,"id":"E02"},{"model":"K01","at":[18,10],"facing":2,"priority":true,"id":"E03"},{"model":"K01","at":[10,18],"facing":2,"priority":false,"id":"E04"},{"model":"K03","at":[12,3],"facing":2,"priority":false,"id":"E05"},{"model":"K03","at":[3,12],"facing":2,"priority":true,"id":"E06"},{"model":"K04","at":[8,4],"facing":2,"priority":true,"id":"E07"},{"model":"K04","at":[13,17],"facing":2,"priority":false,"id":"E08"},{"model":"K06","at":[17,12],"facing":3,"priority":false,"id":"E09"},{"model":"K06","at":[12,17],"facing":0,"priority":true,"id":"E10"},{"model":"trialVelza","at":[4,8],"facing":2,"priority":false,"id":"E11"},{"model":"trialVelza","at":[17,8],"facing":2,"priority":false,"id":"E12"},{"model":"trialBalflare","at":[10,4],"facing":2,"priority":false,"id":"E13"},{"model":"trialRegel","at":[4,14],"facing":1,"priority":true,"id":"E14"}],"waves":[{"id":"R3-01","round":3,"model":"K01","at":[5,2],"facing":2,"alternatives":[[5,1],[4,2]],"priority":true,"required":false},{"id":"R3-02","round":3,"model":"K01","at":[16,19],"facing":2,"alternatives":[[16,18],[15,19]],"priority":false,"required":false},{"id":"R3-03","round":3,"model":"K04","at":[2,5],"facing":2,"alternatives":[[2,4],[1,5]],"priority":false,"required":false},{"id":"R3-04","round":3,"model":"K04","at":[19,16],"facing":2,"alternatives":[[19,15],[18,16]],"priority":true,"required":false},{"id":"R3-05","round":3,"model":"trialVelza","at":[19,5],"facing":2,"alternatives":[[19,4],[18,5]],"priority":false,"required":false},{"id":"R6-06","round":6,"model":"K03","at":[2,8],"facing":2,"alternatives":[[2,7],[1,8]],"priority":true,"required":false},{"id":"R6-07","round":6,"model":"K03","at":[19,13],"facing":2,"alternatives":[[19,12],[18,13]],"priority":false,"required":false},{"id":"R6-08","round":6,"model":"K06","at":[11,4],"facing":2,"alternatives":[[11,2],[10,3]],"priority":true,"required":false},{"id":"R6-09","round":6,"model":"trialBalflare","at":[6,18],"facing":2,"alternatives":[[6,17],[5,18]],"priority":false,"required":false},{"id":"R9-10","round":9,"model":"K01","at":[2,17],"facing":2,"alternatives":[[2,16],[1,17]],"priority":false,"required":false},{"id":"R9-11","round":9,"model":"K01","at":[19,3],"facing":2,"alternatives":[[19,2],[18,3]],"priority":true,"required":false},{"id":"R9-12","round":9,"model":"K06","at":[5,12],"facing":1,"alternatives":[[5,11],[5,13]],"priority":true,"required":false},{"id":"R9-13","round":9,"model":"trialRegel","at":[16,9],"facing":3,"alternatives":[[16,10],[16,7]],"priority":false,"required":false}],"briefing":"M08 precheck"}] as unknown as TrialMission[];
const ground=['ground'] as const, both=['ground','air'] as const;
const gun=(name:string,attribute:NonNullable<Weapon['attribute']>,power:number,hits:number,range:[number,number],extra:Partial<Weapon>={}):Weapon=>({name,attribute,power,hits,range,layers:[...ground],...extra});
const extraWeapons:Record<string,Weapon>={
 trialVelzaClaw:gun('高速打撃','impact',120,1,[1,1]),
 trialHeat:gun('熱弾','heat',130,1,[2,4]),
 trialFlame:gun('火炎放射','heat',100,1,[1,2],{shape:'cone',cooldown:3,status:'burn'}),
 trialRegelClaw:gun('再生怪獣打撃','impact',150,1,[1,1],{origin:'front',facility:true}),
 trialShotgun:gun('ショットガン','gun',60,4,[1,2],{overwatch:true}),
 trialMG:gun('重機関銃','gun',45,6,[1,5],{overwatch:true,afterMove:80}),
 trialLightHeli:gun('軽機首機関砲','gun',35,4,[1,4],{layers:[...both]}),
 trialEngineerGun:gun('軽カービン','gun',40,3,[1,3],{overwatch:true}),
 trialEngineerRepair:{name:'標準修理装置',kind:'repair',power:250,range:[1,2],layers:['ground'],indirect:true,facility:true},
 trialRocket:gun('ロケットランチャー','shell',160,1,[2,5],{afterMove:80}),
 trialKaijuCannon:gun('対怪獣砲','shell',210,1,[3,7],{afterMove:70,directed:'front',origin:'front'}),
 W02:gun('拡散散弾','gun',50,5,[1,2],{cost:2,uses:4,shape:'cone'}),
 W03:gun('高速連射弾','gun',40,7,[1,4],{cost:3,uses:4}),
 W07:gun('広域掃射機関砲','gun',45,4,[1,4],{cost:4,uses:3,shape:'cone'}),
 W08:gun('高速対空機関砲弾','gun',50,5,[1,6],{cost:4,uses:4,layers:['air']}),
 W10:gun('高密度徹甲弾','shell',210,1,[2,6],{cost:5,uses:4,pierce:40}),
 W22:gun('航空誘導爆弾','blast',170,1,[2,5],{cost:4,uses:4,shape:'cross',indirect:true}),
};
const inf={gun:100,shell:60,blast:125,heat:125,cold:100,electric:75,beam:75,impact:60};
const mdl=(name:string,group:string,hp:number,atk:number,def:number,move:number,cost:number,weapons:string[],extra:Partial<Model>={}):Model=>({name,group,hp,atk,def,move,cost,weapons,size:1,layer:'ground',...extra});
const extras:Record<string,Model>={
 trialVelza:mdl('ヴェルザ','怪獣',120,45,3,8,0,['trialVelzaClaw'],{acceleration:true,affinity:{gun:150,blast:125,heat:125}}),
 trialBalflare:mdl('バルフレア','怪獣',200,50,8,3,0,['trialHeat','trialFlame'],{affinity:{heat:50,cold:150}}),
 trialRegel:mdl('レジェル','怪獣',420,55,12,3,0,['trialRegelClaw'],{size:'long',facing:true,regeneration:8,affinity:{blast:125,heat:150,cold:125}}),
 trialAssault:mdl('突撃歩兵','一般歩兵',135,48,4,5,7,['trialShotgun'],{slots:[1,2],affinity:inf}),
 trialMG:mdl('機関銃兵','重火器兵',175,55,6,3,9,['trialMG'],{slots:[2,1],affinity:inf}),
 trialLightHeli:mdl('軽攻撃ヘリ','攻撃ヘリ',150,65,6,9,15,['trialLightHeli'],{slots:[2,2],layer:'air'}),
 trialEngineer:mdl('修理工兵','工兵',150,35,5,4,9,['trialEngineerGun','trialEngineerRepair'],{slots:[1,2],affinity:inf}),
 trialRocket:mdl('ロケット兵','重火器兵',180,60,8,3,10,['trialRocket'],{slots:[2,1],affinity:inf}),
 trialKaijuTank:mdl('対怪獣戦車','戦車',300,110,30,3,24,['trialKaijuCannon'],{slots:[2,2],size:'long',facing:true}),
};
const additions:Record<string,string[]>={
 W02:['trialAssault'],W03:['trialMG','apc'],W04:['trialMG','trialLightHeli'],
 W07:['trialMG','apc'],W08:['aa','helicopter','trialLightHeli'],W10:['tank','heavy','trialRocket','trialKaijuTank'],
 W22:['trialLightHeli'],W18:['trialAssault','trialMG','trialEngineer','trialRocket'],
 W26:['trialAssault','trialEngineer'],W30:['trialAssault'],W45:['trialAssault','trialEngineer'],
 W47:['trialEngineer'],W11:['trialRocket','trialKaijuTank'],W13:['trialRocket'],
 W14:['trialLightHeli','trialRocket'],W09:['trialKaijuTank'],W16:['trialKaijuTank'],W19:['trialKaijuTank'],
};
const trialEquipment={
 P04:{name:'連射制御装置',cost:3,description:'複数ヒット+15%'},
 P10:{name:'耐熱装甲',cost:2,description:'熱相性-20pt'},
 P14:{name:'衝撃吸収装甲',cost:3,description:'衝撃被ダメージ-20%'},
 P29:{name:'自動迎撃装置',cost:3,description:'迎撃ダメージ+20%'},
 P31:{name:'機動攻撃制御装置',cost:4,description:'3マス以上移動後攻撃+15%'},
 P35:{name:'高性能修理装置',cost:3,description:'修理・救護+25%'},
};
const oldAffinities:Record<string,string[]|undefined>={}, oldShellFacility=weapons.shellClaw!.facility;
beforeAll(()=>{
 Object.assign(models,extras);Object.assign(weapons,extraWeapons);Object.assign(equipment,trialEquipment);
 for(const [id,ids] of Object.entries(additions)){oldAffinities[id]=affinities[id];affinities[id]=[...new Set([...(affinities[id]??[]),...ids])];}
 weapons.shellClaw!.facility=true; // provisional permission for approved priority K03 slots; no formal catalog change
 for(const m of fixtures)missions[m.id]=m;
});
afterAll(()=>{
 for(const id of Object.keys(extras))delete models[id];
 for(const id of Object.keys(trialEquipment))delete equipment[id];
 for(const id of Object.keys(extraWeapons))delete weapons[id];
 for(const [id,old] of Object.entries(oldAffinities)){if(old)affinities[id]=old;else delete affinities[id];}
 weapons.shellClaw!.facility=oldShellFacility;
 for(const m of fixtures)delete missions[m.id];
});
const entry=(model:string,weapons:string[]=[],equipment:string[]=[]):RosterEntry=>({model,weapons,equipment});
const rosters:Record<string,string[]> = {
 M03:['tank','heavy','apc','lightArt','sniper','infantry','helicopter'],
 M04:['tank','heavy','lightArt','sniper','trialAssault','helicopter','apc'],
 M05:['tank','heavy','aa','helicopter','trialMG','sniper','trialAssault'],
 M06:['heavy','tank','aa','helicopter','repair','trialMG','infantry'],
 M07:['heavy','tank','lightArt','heavyArt','aa','trialEngineer','infantry'],
 M08:['heavy','tank','aa','helicopter','trialRocket','trialEngineer','trialMG'],
};
const unlockedAfter=[['trialAssault','W02','P10','P31'],['trialMG','W03','W07','P04','P29'],['trialLightHeli','W08','W22'],['trialEngineer','P14','P35'],['trialRocket','W10'],['trialKaijuTank']];
type Variant='fixed'|'equipped'|'tactical'|'tactical2'|'tacticalGear'|'tacticalGear2';
const tacticalRosters:Record<string,RosterEntry[]> = {
 'M07:easy:tacticalGear':[entry('heavy',['W11'],['P14']),entry('lightArt'),entry('aa',['W08'],['P14']),entry('repair',[],['P35']),entry('sniper'),entry('infantry',['W26'])],
 'M07:easy:tacticalGear2':[entry('heavy',['W11'],['P14']),entry('tank',['W09'],['P10']),entry('aa',['W08'],['P10']),entry('repair',[],['P35']),entry('infantry',['W26'])],
 'M07:normal:tacticalGear':[entry('heavy',['W11'],['P14']),entry('helicopter'),entry('aa',['W08'],['P14']),entry('repair',[],['P35']),entry('lightArt'),entry('infantry',['W26']),entry('sniper')],
 'M07:normal:tacticalGear2':[entry('heavy',['W11'],['P14']),entry('tank',['W09']),entry('aa',['W08'],['P04']),entry('repair',[],['P35']),entry('lightArt'),entry('infantry',['W26'])],
 'M08:easy:tacticalGear':[entry('heavy',['W11'],['P14','P10']),entry('lightArt'),entry('aa',['W08']),entry('repair',[],['P35']),entry('trialEngineer',[],['P35']),entry('infantry',['W26'])],
 'M08:easy:tacticalGear2':[entry('heavy',['W11'],['P14']),entry('tank',['W10']),entry('aa',[],['P14']),entry('repair',[],['P35']),entry('trialEngineer',[],['P35'])],
 'M08:normal:tacticalGear':[entry('heavy',['W11'],['P14','P10']),entry('tank',['W10'],['P14']),entry('aa',['W08']),entry('repair',[],['P35']),entry('trialEngineer',[],['P35']),entry('infantry',['W26'])],
 'M08:normal:tacticalGear2':[entry('heavy',['W11'],['P14']),entry('lightArt',['W19']),entry('aa',['W08'],['P04']),entry('repair',[],['P35']),entry('trialEngineer',[],['P35']),entry('infantry',['W26']),entry('sniper')],

 'M05:normal:tactical':[entry('heavy',['W11']),entry('aa',['W14']),entry('aa',['W14']),entry('helicopter'),entry('sniper'),entry('repair'),entry('infantry')],
 'M05:normal:tactical2':[entry('tank',['W09']),entry('aa',['W14']),entry('helicopter',['W14']),entry('helicopter'),entry('repair'),entry('sniper'),entry('infantry')],
 'M07:easy:tactical':[entry('heavy',['W11']),entry('tank',['W09']),entry('aa',['W08']),entry('repair'),entry('infantry',['W26']),entry('sniper')],
 'M07:easy:tactical2':[entry('heavy',['W11']),entry('heavy',['W11']),entry('aa',['W08']),entry('repair'),entry('infantry',['W26'])],
 'M07:normal:tactical':[entry('heavy',['W11']),entry('tank',['W09']),entry('aa',['W08']),entry('repair'),entry('sniper'),entry('lightArt'),entry('infantry',['W26'])],
 'M07:normal:tactical2':[entry('heavy',['W11'],['P09']),entry('heavy',['W09']),entry('aa',['W08']),entry('repair'),entry('sniper'),entry('infantry',['W26'])],
 'M08:easy:tactical':[entry('heavy',['W11']),entry('tank',['W10']),entry('aa'),entry('repair'),entry('trialEngineer'),entry('infantry',['W26'])],
 'M08:easy:tactical2':[entry('heavy',['W11']),entry('tank',['W10']),entry('aa',['W08']),entry('repair'),entry('trialEngineer')],
 'M08:normal:tactical':[entry('heavy',['W11']),entry('tank',['W10']),entry('aa',['W08']),entry('repair'),entry('trialEngineer'),entry('infantry',['W26']),entry('sniper')],
 'M08:normal:tactical2':[entry('heavy',['W11']),entry('tank',['W10']),entry('aa',['W08']),entry('repair'),entry('trialEngineer'),entry('lightArt')],
};
function createFixture(m:TrialMission,difficulty:Difficulty,variant:Variant,progress?:Campaign){
 const c=progress?structuredClone(progress):freshCampaign(), l=recommended(m,difficulty), scale=difficulty==='easy'?80:100;
 if(!progress)c.open=[...new Set([...unlocks.flat(),...unlockedAfter.slice(0,m.number-3).flat()])];
 const rs=rosters[m.id]!;
 c.roster=tacticalRosters[m.id+':'+difficulty+':'+variant]?.map(e=>structuredClone(e))??(difficulty==='easy'?rs.slice(0,m.id==='M07'?5:6):rs).map(k=>entry(k));
 if(variant==='equipped'){
   // Legal selected weapons/gear only; fit within cap by adding one at a time.
   const preferred:Record<string,string[]>={
    heavy:['W11','W09'],tank:['W09','W11'],lightArt:['W19'],heavyArt:['W20'],
    aa:['W14'],helicopter:['W14'],infantry:['W26','W45'],trialRocket:['W10','W14'],
    trialEngineer:['W26','W45'],trialMG:['W03'],trialAssault:['W02'],sniper:['W30'],apc:['W04']
   };
   for(const e of c.roster)for(const id of preferred[e.model]??[]){
     e.weapons.push(id);
     if(!validEntry(c,e)||rosterCost(c.roster)>ceiling(m,difficulty))e.weapons.pop();
   }
 }
 if(!progress)c.levels=Object.fromEntries(c.roster.map(e=>[modelFor(e.model).group,totalXp(l)]));
 if(progress)expect(sortieError(c,m.id,difficulty)).toBe('');
 expect(c.roster.every(e=>validEntry(c,e))).toBe(true);
 expect(rosterCost(c.roster)).toBeLessThanOrEqual(ceiling(m,difficulty));
 const b:Battle={id:c.nextBattle,mission:m.id,difficulty,size:m.size,terrain:missionTerrain(m),units:m.enemies.map(e=>unit(e,'enemy',l,scale)),round:1,side:'player',revision:0,spawned:[],log:[],stats:{},rules:3};
 if(m.facility){
   const f=unit({id:'facility',model:'facility',at:m.facility.at,facing:0},'player',1,100);
   f.hp=f.maxHp=m.facility.hp;b.units.push(f);
 }
 // Front-center first, with large units first. In M08 fan out across four sides.
 const order=c.roster.map((e,i)=>({e,i})).sort((a,z)=>Number(modelFor(z.e.model).size!==1)-Number(modelFor(a.e.model).size!==1)||a.i-z.i);
 for(const {e,i} of order){
   const model=modelFor(e.model),zone=m.zones[m.airZone!==undefined&&model.layer==='air'?m.airZone:0]!;
   const [x0,y0,x1,y1]=zone, cx=(x0+x1)/2,cy=(y0+y1)/2;
   const choices:{at:Cell;facing:Direction;score:number}[]=[];
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const facing of (model.facing?[0,1,2,3]:[0]) as Direction[]){
      const p={at:[x,y] as Cell,facing};
      if(!footprint(model,p).every(v=>inRect(v.at,zone))||!placement(b,e.model,p,occupied(b)))continue;
      let score=Math.abs(x-cx)*2+(y-y0)*3+Number(facing!==0)*0.1;
      if(variant.startsWith('tactical')&&m.id==='M07'){
        // Armor first, repair and specialist infantry behind, anti-air separated from the frontline.
        const desired:Record<string,Cell>={heavy:[9,15],tank:[11,15],aa:[7,17],repair:[10,17],infantry:[12,17],sniper:[8,18],lightArt:[13,18]};
        const t=e.model==='heavy'&&i===1?[12,15] as Cell:desired[e.model]??[9,18];
        score=Math.abs(x-t[0])+Math.abs(y-t[1])+Number(facing!==0)*0.2;
      }
      if(variant.startsWith('tactical')&&m.id==='M05'){
        const desired:Record<string,Cell>={heavy:[9,6],tank:[9,6],aa:[7,9],helicopter:[4,13],repair:[9,9],sniper:[10,10],infantry:[11,8]};
        const t=e.model==='aa'&&i===2?[10,8] as Cell:desired[e.model]??[8,9];
        score=Math.abs(x-t[0])+Math.abs(y-t[1])+Number(facing!==0)*0.2;
      }
      if(variant.startsWith('tactical')&&m.id==='M08'){
        const desired:Record<string,Cell>={heavy:[9,8],tank:[13,10],aa:[8,10],repair:[9,10],trialEngineer:[10,12],infantry:[10,14],sniper:[8,12],lightArt:[8,13]};
        const t=desired[e.model]??[12,12];
        const face:Direction=e.model==='tank'?1:0;
        score=Math.abs(x-t[0])+Math.abs(y-t[1])+Number(facing!==face)*0.2;
      }
      if(m.id==='M08'&&!variant.startsWith('tactical')){
        const desired:Cell[]=[[9,8],[12,10],[8,10],[11,13],[12,8],[9,13],[8,12]];
        const t=desired[i%desired.length]!;
        const face:Direction=y<cy?0:y>cy?2:x<cx?3:1;
        score=Math.abs(x-t[0])+Math.abs(y-t[1])+Number(facing!==face)*0.1;
      }
      choices.push({...p,score});
   }
   choices.sort((a,z)=>a.score-z.score||a.at[1]-z.at[1]||a.at[0]-z.at[0]||a.facing-z.facing);
   const p=choices[0];if(!p)throw Error('No deployment '+m.id+' '+e.model);
   b.units.push(unit({id:'P'+String(i+1).padStart(2,'0'),model:e.model,at:p.at,facing:p.facing},'player',level(c.levels[model.group]??0),100,c,i));
 }
 expect(occupied(b).size).toBe(b.units.flatMap(cellsOf).length);
 if(m.id==='M05'){expect(playerUnits(b).filter(u=>modelFor(u.model).layer==='ground').length).toBeGreaterThanOrEqual(2);expect(playerUnits(b).some(u=>modelFor(u.model).layer==='air')).toBe(true);}
 return {b,c};
}
function run(m:TrialMission,difficulty:Difficulty,variant:Variant,scenario='approved',progress?:Campaign){
 let {b,c}=createFixture(m,difficulty,variant,progress);
 const formation=playerUnits(b).map(u=>[u.model,u.at,u.facing]);
 const advance=(a:Action)=>{const n=act(b,command(b,a));if(!n)throw Error(m.id+' R'+b.round+' rejected '+JSON.stringify(a));b=n;};
 advance({type:'configure',ids:playerUnits(b).map(u=>u.id),automatic:true});
 if(m.facility)for(const u of playerUnits(b).filter(u=>u.weapons.some(w=>weapons[w]?.kind==='repair')))advance({type:'configure',ids:[u.id],order:{kind:'guard',target:'facility'}});
 let commands=0;let regen=0;let facilityMin=m.facility?.hp??null;
 const rounds:unknown[]=[];
 for(;!b.result&&commands<2000;commands++){
   const round=b.round,side=b.side;
   if(variant.startsWith('tactical')&&b.side==='player'&&!b.automation){
     const us=playerUnits(b), enemies=b.units.filter(u=>u.hp>0&&u.side==='enemy'), armor=us.find(u=>u.model==='heavy')??us.find(u=>u.model==='tank');
     const gap=(u:typeof b.units[number],v:typeof b.units[number])=>Math.min(...cellsOf(u).flatMap(a=>cellsOf(v).map(z=>distance(a.at,z.at))));
     for(const u of us){
       let order:import('../../src/games/monster-wars/battle-state').Order={kind:'free'};
       const facility=b.units.find(v=>v.id==='facility'&&v.hp>0);
       const repair=u.weapons.some(w=>weapons[w]?.kind==='repair');
       const air=enemies.filter(v=>modelFor(v.model).layer==='air').sort((a,z)=>a.hp-z.hp);
       const big=enemies.filter(v=>v.model==='trialRegel'||v.model==='K06').sort((a,z)=>a.hp-z.hp);
       if(repair&&(facility||armor&&armor.id!==u.id))order={kind:'guard',target:(facility??armor)!.id};
       else if(['aa','helicopter','sniper'].includes(u.model)&&air.length)order={kind:'focus',target:air[0]!.id};
       else if(facility&&(variant==='tactical'||variant==='tacticalGear'))order={kind:'guard',target:facility.id};
       else if(['heavy','tank','infantry'].includes(u.model)&&big.length&&m.id!=='M05')order={kind:'focus',target:big[0]!.id};
       else if(m.id==='M07'&&u.model==='lightArt'&&armor&&armor.id!==u.id&&enemies.some(v=>gap(armor,v)<7))order={kind:'guard',target:armor.id};
       if(JSON.stringify(u.order)!==JSON.stringify(order))advance({type:'configure',ids:[u.id],order});
     }
   }
   advance(b.side==='enemy'?enemyAction(b):b.automation?autoAction(b):{type:'auto',finish:true});
   regen+=(b.events??[]).filter(e=>e.kind==='heal'&&b.units.some(u=>u.id===e.target&&u.model==='trialRegel')).reduce((s,e)=>s+('amount' in e?e.amount:0),0);
   const facility=b.units.find(u=>u.id==='facility');
   if(facility&&facilityMin!==null)facilityMin=Math.min(facilityMin,facility.hp);
   if(b.round!==round||b.result)rounds.push([round,playerUnits(b).length,b.units.filter(u=>u.side==='enemy'&&u.hp>0).length,facility?.hp??null]);
 }
 expect(b.result, m.id+' exceeded command bound').toBeDefined();
 expect(new Set(b.spawned).size).toBe(b.spawned.length);
 console.log('CHAPTER_PRECHECK '+JSON.stringify({mission:m.id,difficulty,variant,scenario,lv:recommended(m,difficulty),cost:rosterCost(c.roster),roster:c.roster,formation,result:b.result,round:b.round,reason:b.reason,survivors:playerUnits(b).length,facility:b.units.find(u=>u.id==='facility')?.hp??null,facilityMin,spawned:b.spawned.length,remaining:b.units.filter(u=>u.side==='enemy'&&u.hp>0).length,remainingUnits:b.units.filter(u=>u.side==='enemy'&&u.hp>0).map(u=>[u.model,u.hp,u.at]),dead:b.units.filter(u=>u.side==='player'&&u.model!=='facility'&&!u.hp).map(u=>u.model),regen,commands,rounds}));
 // A defeat is a reported balance outcome, not an assertion of victory.
 return {b,c};
}
for(const m of fixtures)for(const d of ['easy','normal'] as const){
 it(m.id+' '+d+' fixed',()=>run(m,d,'fixed'),180000);
}
for(const m of fixtures.filter(m=>m.id==='M07'||m.id==='M08'||m.id==='M06')){
 it(m.id+' normal equipped',()=>run(m,'normal','equipped'),180000);
}

for(const m of fixtures.filter(m=>['M05','M07','M08'].includes(m.id)))for(const d of ['easy','normal'] as const)for(const variant of ['tactical','tactical2'] as const){
 if(tacticalRosters[m.id+':'+d+':'+variant])it(m.id+' '+d+' '+variant,()=>run(m,d,variant),180000);
}

for(const m of fixtures.filter(m=>['M07','M08'].includes(m.id)))for(const d of ['easy','normal'] as const)for(const variant of ['tacticalGear','tacticalGear2'] as const){
 it(m.id+' '+d+' '+variant,()=>run(m,d,variant),180000);
}

// Sensitivity scenarios, not approved data. Never replace the stored fixture.
for(const m of fixtures.filter(m=>['M07','M08'].includes(m.id)))for(const d of ['easy','normal'] as const)for(const variant of ['tactical','tacticalGear'] as const){
 it(m.id+' '+d+' sensitivity '+variant,()=>{
  const trial=structuredClone(m);
  if(m.id==='M07'){
    // 17 -> 14: keep all types and both Regels; remove one Galdon and two Glackers.
    trial.enemies=trial.enemies.filter(e=>!(e.model==='K06'&&e.at[0]===13)&&!(e.model==='K01'&&((e.at[0]===7&&e.at[1]===3)||(e.at[0]===12&&e.at[1]===3))));
  }else{
    // 27 -> 23: keep all types, 3 waves and both Regels. Remove two Galdons and two Glackers.
    trial.enemies=trial.enemies.filter(e=>!(e.model==='K06'&&e.at[0]===17)&&!(e.model==='K01'&&e.at[0]===3));
    trial.waves=trial.waves.filter(e=>!(e.model==='K06'&&e.round===6)&&!(e.model==='K01'&&e.round===3&&e.at[0]===16));
  }
  missions[m.id]=trial;
  try{run(trial,d,variant,'reduced-enemy-count');}finally{missions[m.id]=m;}
 },180000);
}

// Sequential campaign fixture: actual award/allocate/availability; no injected XP, no retries.
const chapterIds=['MVP01','MVP02','M03','M04','M05','M06','M07','M08'];
const acceptedFixtures=fixtures.map(m=>{
 const t=structuredClone(m);
 if(m.id==='M07')t.enemies=t.enemies.filter(e=>!(e.model==='K06'&&e.at[0]===13)&&!(e.model==='K01'&&((e.at[0]===7&&e.at[1]===3)||(e.at[0]===12&&e.at[1]===3))));
 if(m.id==='M08'){
 t.enemies=t.enemies.filter(e=>!(e.model==='K06'&&e.at[0]===17)&&!(e.model==='K01'&&e.at[0]===3));
 t.waves=t.waves.filter(e=>!(e.model==='K06'&&e.round===6)&&!(e.model==='K01'&&e.round===3&&e.at[0]===16));
 }
 return t;
});
const firstRoster=[entry('tank',['W09'],['P09']),entry('tank',['W09']),entry('apc'),entry('apc'),entry('infantry',['W01']),entry('infantry',['W45'])];
const secondRoster={easy:[entry('tank'),entry('aa',['W14']),entry('helicopter'),entry('repair'),entry('apc'),entry('infantry',['W13']),entry('infantry',['W45'])],normal:[entry('tank',['W09']),entry('aa',['W14']),entry('aa',['W14']),entry('repair'),entry('apc'),entry('infantry',['W13']),entry('infantry',['W45'])]};
function early(c:Campaign,id:string,d:Difficulty,alternative=false){
 c={...c,roster:structuredClone(id==='MVP01'?firstRoster:alternative&&d==='normal'?[entry('heavy',['W11']),entry('aa',['W14']),entry('helicopter',['W04']),entry('repair'),entry('infantry',['W45']),entry('infantry',['W26'])]:secondRoster[d])};
 expect(sortieError(c,id,d)).toBe('');
 let b=createBattle(c,id,d);
 const advance=(a:Action)=>{const n=act(b,command(b,a));if(!n)throw Error(id+' rejected '+JSON.stringify(a));b=n;};
 const positions:Cell[]=id==='MVP01'?[[7,12],[8,12],[6,12],[9,12],[5,12],[10,12]]:[[8,14],[9,14],[10,14],[8,15],[6,14],[11,14],[10,15]];
 for(const [i,u] of playerUnits(b).entries())if(positions[i])b=deploy(b,u.id,{at:positions[i]!,facing:0})??b;
 advance({type:'configure',ids:playerUnits(b).map(u=>u.id),automatic:true});
 const repair=playerUnits(b).find(u=>u.model==='repair');
 if(id==='MVP02'&&alternative)for(const u of playerUnits(b).filter(u=>u.id!==repair?.id))advance({type:'configure',ids:[u.id],order:{kind:'guard',target:'facility'}});
 if(id==='MVP02'&&repair)advance({type:'configure',ids:[repair.id],order:{kind:'guard',target:'facility'}});
 for(let n=0;!b.result&&n<2000;n++)advance(b.side==='enemy'?enemyAction(b):b.automation?autoAction(b):{type:'auto',finish:true});
 expect(b.result).toBeDefined();return {b,c};
}
function spend(c:Campaign,policy:'concentrated'|'balanced'){
 const preferred=policy==='concentrated'?['戦車','攻撃ヘリ','対空車両','支援車両','一般歩兵']:['戦車','攻撃ヘリ','対空車両','支援車両','一般歩兵','自走砲','狙撃兵','装甲車'];
 const groups=preferred.filter(g=>campaignGroups(c).includes(g));
 for(let i=0;i<200;i++){
 const ordered=groups.slice().sort((a,b)=>level(c.levels[a]??0)-level(c.levels[b]??0)||groups.indexOf(a)-groups.indexOf(b));
 const g=ordered.find(g=>levelUp(c,g)!==c);if(!g)break;c=levelUp(c,g);
 }return c;
}
function sequential(start:Campaign,d:Difficulty,policy:'concentrated'|'balanced',label:string){
 let c=start;const results=[];
 for(const [i,id] of chapterIds.entries()){
 const before=c; const levels=Object.fromEntries(Object.entries(c.levels).map(([k,v])=>[k,level(v)]));
 const m=acceptedFixtures.find(m=>m.id===id);
 let out:{b:Battle,c:Campaign};
 if(!m)out=early(c,id,d,label.includes('alternative')&&c.open.includes('heavy'));
 else{
 const v:Variant=id==='M05'&&d==='normal'?'tactical2':id==='M07'&&d==='normal'&&label.includes('alternative')?'tacticalGear':id==='M07'||id==='M08'?'tactical':'fixed';
 out=run(m,d,v,'accepted-sequential',c);
 }
 const {b}=out;c=out.c;
 const row={label,mission:id,difficulty:d,levels,unspentBefore:before.xp,cost:rosterCost(c.roster),result:b.result,round:b.round,reason:b.reason,survivors:playerUnits(b).length,facility:b.units.find(u=>u.id==='facility')?.hp??null,remaining:b.units.filter(u=>u.side==='enemy'&&u.hp>0).map(u=>[u.model,u.hp])};
 if(b.result==='win'){
 const earned=award({...c,nextBattle:c.nextBattle+1},id,d,b.id,b.stats);
 expect(award(earned,id,d,b.id,b.stats)).toBe(earned);
 expect(earned.xp-c.xp).toBe(d==='easy'?288:489);
 expect(earned.open).toEqual([...new Set([...c.open,...(unlocks[i+1]??[])])]);
 c=spend(earned,policy);
 } else expect(c.receipts).toEqual(before.receipts);
 results.push({...row,unspentAfter:c.xp,unlocks:c.open.filter(k=>!before.open.includes(k)),earnedTotal:Object.values(c.receipts).reduce((a,b)=>a+b,0)});
 if(b.result!=='win')break;
 }
 console.log('CHAPTER_SEQUENCE '+JSON.stringify({label,results,cleared:results.filter(r=>r.result==='win').length,finalLevels:Object.fromEntries(Object.entries(c.levels).map(([k,v])=>[k,level(v)])),remainingXp:c.xp,receipts:c.receipts}));
 return {c,cleared:results.filter(r=>r.result==='win').length};
}
it('sequential accepted chapter with earned XP and real reward receipts',()=>{
 const ids=missionIds as string[], oldIds=[...ids], lists=unlocks as unknown as string[][], oldLists=[...lists];
 try{
 ids.splice(0,ids.length,...chapterIds);
 lists.splice(3,lists.length-3,...unlockedAfter.map((l,i)=>[...l,...(i===0?['P19']:i===2?['P21']:i===4?['P24']:i===5?['P28']:[])]));
 for(const m of acceptedFixtures)missions[m.id]=m;
 const easy=sequential(freshCampaign(),'easy','concentrated','fresh-easy');
 sequential(freshCampaign(),'normal','concentrated','fresh-normal');
 if(easy.cleared===8){sequential(easy.c,'normal','concentrated','easy-then-normal');
 const old=tacticalRosters['M07:normal:tacticalGear'];
 tacticalRosters['M07:normal:tacticalGear']=[entry('heavy',['W11']),entry('helicopter',['W04']),entry('aa',['W08']),entry('repair',[],['P35']),entry('lightArt'),entry('infantry',['W26']),entry('sniper')];
 try{sequential(easy.c,'normal','concentrated','easy-then-normal-alternative');sequential(freshCampaign(),'normal','concentrated','fresh-normal-alternative');}finally{tacticalRosters['M07:normal:tacticalGear']=old;}
 }
 else console.log('CHAPTER_SEQUENCE_BLOCKED easy-then-normal: Easy not cleared');
 }finally{
 ids.splice(0,ids.length,...oldIds);lists.splice(0,lists.length,...oldLists);for(const m of fixtures)missions[m.id]=m;
 }
},180000);

it('recommended Normal accepted chapter focused checks',()=>{
 for(const m of acceptedFixtures)missions[m.id]=m;
 try{
 for(const id of ['MVP01','MVP02']){
 const c=freshCampaign();
 c.open=[...new Set(unlocks.slice(0,id==='MVP01'?1:2).flat())];
 c.levels=Object.fromEntries(campaignGroups(c).map(g=>[g,totalXp(6)]));
 if(id==='MVP02')c.wins['normal:MVP01']=1;
 const out=early(c,id,'normal');
 console.log('RECOMMENDED_EARLY '+JSON.stringify({id,result:out.b.result,round:out.b.round,cost:rosterCost(out.c.roster),survivors:playerUnits(out.b).length,facility:out.b.units.find(u=>u.id==='facility')?.hp,roster:out.c.roster}));
 }
 for(const m of acceptedFixtures){
 const variants:Variant[]=m.id==='M07'?['tactical','tactical2','tacticalGear','tacticalGear2']:m.id==='M08'?['tactical','tacticalGear']:m.id==='M05'?['tactical2']:['fixed'];
 for(const v of variants)run(m,'normal',v,'recommended-accepted');
 }
 }finally{for(const m of fixtures)missions[m.id]=m;}
},180000);
