import { equipment, models, unlocks, weapons } from './catalog';
import { ceiling, debrief, missionFor, officialMissionSources, recommendedLevel } from './missions';
import { missionIdsOfficial, officialDifficulties, officialEquipmentIds, officialFixedWeapons, officialNewModels, officialWeaponIds, officialMissionIndex, type OfficialDifficulty } from './official-ids';
import { cellsOf, inside } from './grid';
import type { Cell, Layer, Mission, Placement, Rectangle, Spawn, Terrain } from './types';

type Reward = {first:number; repeat:number; unlocks:readonly string[]};
type EnemyPlacement = Placement & {weapons?:readonly string[]; ai?:string};
type OfficialReinforcement = Omit<Spawn,'round'> & {trigger:{round:number}|{enemyCountAtMost:number}; ai?:string; weapons?:readonly string[]};
type DifficultyOverride = {
  recommended?:number; cost?:number; enemies?:readonly EnemyPlacement[];
  reinforcements?:readonly OfficialReinforcement[]; enemyStats?:Partial<Record<'hp'|'atk'|'def'|'move',number>>;
  reward?:Reward;
};
export type OfficialMission = {
  id:string; chapter:number; number:number; source?:string;
  name?:string; briefing?:string; size?:number; limit?:number; goal?:Mission['goal'];
  defeat?:readonly ('roundLimit'|'allPlayersDefeated'|'facilityDestroyed')[];
  terrain?:Partial<Record<Terrain|'mountain'|'water'|'defensivePosition',Rectangle[]>>;
  facilities?:readonly Cell[];
  zones?:readonly {area:Rectangle; layer?:Layer}[];
  minimum?:Partial<Record<Layer|'total',number>>;
  enemies?:readonly EnemyPlacement[];
  reinforcements?:readonly OfficialReinforcement[];
  difficulties:Partial<Record<OfficialDifficulty,DifficultyOverride>>;
};
export const officialMissions:readonly OfficialMission[] = missionIdsOfficial.map((id,i)=>{
  const number=i+1,chapter=Math.ceil(number/8);
  const source=Object.hasOwn(officialMissionSources,id)?officialMissionSources[id as keyof typeof officialMissionSources]:undefined;
  if(!source)return {id,number,chapter,...(id==='M16'?{source:'MVP03'}:{}),difficulties:{}};
  const mission=missionFor(source);
  const variant=(difficulty:'easy'|'normal'):DifficultyOverride=>({
    recommended:recommendedLevel(number,difficulty),cost:ceiling(mission,difficulty),
    reward:{first:debrief(difficulty,true),repeat:debrief(difficulty,false),unlocks:unlocks[i+1]??[]},
  });
  return {id,number,chapter,source,name:mission.name,briefing:mission.briefing,size:mission.size,
    limit:mission.limit,goal:mission.goal,terrain:mission.terrain,zones:[{area:mission.zone}],
    facilities:mission.goal==='defend'?[[8,11]]:[],minimum:{total:1},
    defeat:mission.goal==='defend'?['allPlayersDefeated','facilityDestroyed']:['roundLimit','allPlayersDefeated'],
    enemies:mission.enemies,reinforcements:mission.waves.map(({round,...wave})=>({...wave,trigger:{round}})),
    difficulties:{easy:variant('easy'),normal:variant('normal')}};
});

export const modelDirectionKey = (model:string,direction:'SE'|'SW'|'NE'|'NW')=>model+'-'+direction;
export const officialVariant = (id:string,difficulty:OfficialDifficulty)=>officialMissions[officialMissionIndex(id)]?.difficulties[difficulty];

export function validateOfficialContent(missions:readonly OfficialMission[]=officialMissions, release=false):string[]{
  const errors:string[]=[];
  const nonnegative=(value:number)=>Number.isSafeInteger(value)&&value>=0;
  const knownItem=(id:string)=>[models,weapons,equipment].some(table=>Object.hasOwn(table,id));
  if(new Set(missions.map(m=>m.id)).size!==missions.length||missions.length!==40)errors.push('Mission IDs');
  for(const id of Object.keys(officialNewModels))if(Object.hasOwn(models,id))errors.push('Reserved model ID '+id);
  for(const id of officialFixedWeapons)if(Object.hasOwn(weapons,id))errors.push('Reserved weapon ID '+id);
  for(const [id,w] of Object.entries(weapons)){
    if((/^W\d/.test(id)&&!officialWeaponIds.includes(id))||![w.power,w.range[0],w.range[1],w.uses??0,w.cost??0].every(nonnegative)||
       w.range[0]>w.range[1]||!w.layers.length||(w.hits!==undefined&&(!nonnegative(w.hits)||w.hits<1)))errors.push('Weapon '+id);
  }
  for(const [id,item] of Object.entries(equipment))if(!officialEquipmentIds.includes(id)||!nonnegative(item.cost))errors.push('Equipment '+id);
  for(const [id,model] of Object.entries(models)){
    if(model.weapons.some(id=>!Object.hasOwn(weapons,id))||model.slots?.some(n=>!nonnegative(n))||
       model.merits?.some(merit=>!nonnegative(merit.threshold)||merit.threshold===0))errors.push('Model '+id);
  }
  if(unlocks.flat().some(id=>!knownItem(id)))errors.push('Catalog unlock');
  for(const m of missions){
    const fail=(issue:string)=>errors.push(m.id+' '+issue);
    if(m.id!==missionIdsOfficial[m.number-1]||m.chapter!==Math.ceil(m.number/8))fail('identity');
    const active=Object.keys(m.difficulties);
    if(release&&officialDifficulties.some(d=>!m.difficulties[d]))fail('unfinished');
    if(active.length===0)continue;
    const size=m.size??0;
    const onMap=(cell:Cell)=>cell.every(nonnegative)&&inside(cell,size);
    const box=([l,t,r,b]:Rectangle)=>l<=r&&t<=b&&onMap([l,t])&&onMap([r,b]);
    if(!m.name||!m.briefing||!m.goal||!Number.isSafeInteger(m.limit)||!m.limit||!Number.isSafeInteger(size)||size<1||
      !m.zones?.length||m.zones.some(zone=>!box(zone.area))||m.facilities?.some(cell=>!onMap(cell))||
      Object.values(m.terrain??{}).flat().some(area=>!box(area))||Object.values(m.minimum??{}).some(n=>!nonnegative(n)))fail('map or deployment');
    for(const difficulty of active){
      if(!officialDifficulties.some(d=>d===difficulty)){fail('difficulty');continue;}
      const variant=m.difficulties[difficulty as OfficialDifficulty]!;
      if(!variant.reward||variant.cost===undefined||!nonnegative(variant.cost)||!variant.recommended||!nonnegative(variant.recommended))fail('playable variant');
      if(variant.reward&&(!nonnegative(variant.reward.first)||!nonnegative(variant.reward.repeat)||
        variant.reward.unlocks.some(id=>!knownItem(id))))fail('reward or unlock');
      const enemies=variant.enemies??m.enemies??[],waves=variant.reinforcements??m.reinforcements??[];
      if(new Set([...enemies,...waves].map(p=>p.id)).size!==enemies.length+waves.length)fail('unit IDs');
      const occupied=new Set<string>();
      for(const p of [...enemies,...waves] as (EnemyPlacement|OfficialReinforcement)[]){
        if(!Object.hasOwn(models,p.model)||('weapons' in p&&p.weapons?.some(id=>!Object.hasOwn(weapons,id)))){fail('enemy reference');continue;}
        const valid=(at:Cell)=>cellsOf({...p,at,hp:1}).every(cell=>onMap(cell.at));
        if(!valid(p.at))fail('placement');
        if('trigger' in p){
          if(p.alternatives.some(at=>!valid(at)))fail('reinforcement alternatives');
          if('round' in p.trigger&&(!nonnegative(p.trigger.round)||p.trigger.round<1||p.trigger.round>(m.limit??0)))fail('reinforcement round');
        }else for(const cell of cellsOf({...p,hp:1})){
          const key=cell.layer+':'+cell.at.join(',');
          if(occupied.has(key))fail('overlap');
          occupied.add(key);
        }
      }
    }
  }
  return errors;
}
