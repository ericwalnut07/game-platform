import type { BattleReport } from './battle-report';
import { weaponFor, modelFor } from './catalog';
import { level, meritRanks, type Campaign, type Stats } from './campaign';
import { cellsOf, dirs, footprint, inRect, occupied, placement } from './grid';
import { recommended, missionFor, missionTerrain } from './missions';
import type { Cell, Difficulty, Layer, Metric, Placement, Pose, Rectangle, RulesVersion, Side, Terrain } from './types';

export type Order = {kind:'free'} | {kind:'focus'|'guard'; target:string};
export type Unit = Pose & {
  id:string; model:string; side:Side; hp:number; maxHp:number; atk:number; equipment:string[]; weapons:string[];
  ammo:Record<string,number>; capacity:Record<string,number>; parts:Record<string,number>; partMax:Record<string,number>;
  cooldown:Record<string,number>; ranks:number[]; shellBreak?:number; burn?:{source:string; remaining:number}; chill?:{source:string; through:number}; automatic?:boolean; order?:Order; move:boolean; main:boolean;
  moved:number; usedMovement?:boolean; discount:boolean; guarding:boolean; overwatch?:string; priority?:boolean;
};
export type Target = { at:Cell; layer:Layer; origin?:Cell; ammo?:string };
export type Warning = { source:string; weapon:string; target:Target; cells:Cell[]; due:number; delays:number };
export type BattleEvent =
  | {kind:'attack';source:string;weapon:string;origin:Cell;area:Cell[]}
  | {kind:'damage'|'heal'|'supply';target:string;amount:number;part?:string}
  | {kind:'defeat';source:string;target:string;model:string;playerCredit:boolean}
  | {kind:'move';entity:string;from:Cell;to:Cell};
export type Battle = {
  id:number; mission:string; difficulty:Difficulty; size:number; terrain:Terrain[]; units:Unit[];
  rules?:RulesVersion; automation?:'run'|'end'; round:number; side:Side; revision:number; spawned:string[]; warning?:Warning; result?:'win'|'loss'|'retreat';
  events?:BattleEvent[]; newBestiary?:string[]; report?:BattleReport; reason?:string; log:string[]; stats:Record<string,Stats>;
};
export const playerUnits=(b:Battle)=>b.units.filter(u=>u.side==='player'&&u.hp>0&&u.model!=='facility');
export const opposed=(b:Battle,u:Unit)=>b.units.filter(v=>v.hp>0&&v.side!==u.side);
export const addLog=(b:Battle,message:string)=>{b.log=[...b.log.slice(-79),message];};
export function emit(b:Battle,event:BattleEvent){(b.events??=[]).push(event);}
export function recordDefeat(b:Battle,source:Unit|undefined,target:Unit){
  if(source)record(b,source,'kills',1);
  emit(b,{kind:'defeat',source:source?.id??'',target:target.id,model:target.model,
    playerCredit:source?.side==='player'&&target.side==='enemy'});
}
const legacyEnemyHp:Record<string,number>={K01:70,K03:140,K04:90};
export const name=(u:Unit)=>modelFor(u.model).name;
export function record(b:Battle,u:Unit,metric:Metric,amount:number){
  if(u.side!=='player'||!amount||!modelFor(u.model).merits)return;
  const m=b.stats[u.model]??={};m[metric]=(m[metric]??0)+amount;
}
export function unit(p:Placement,side:Side,l:number,scale:number,c?:Campaign,index?:number,rules:RulesVersion=3):Unit {
  const m=modelFor(p.model),e=index===undefined?undefined:c?.roster[index],ranks=c&&side==='player'?meritRanks(c,p.model):[];
  const equipment=e?.equipment??[];
  const hpBonus=(m.merits?.[1]?.effect==='HP'?4*(ranks[1]??0):0)+(equipment.includes('P09')?15:0);
  const atkBonus=m.merits?.[0]?.effect==='ATK'?3*(ranks[0]??0):0;
  const stat=(base:number,growth:number,bonus:number)=>{
    const scaled=base*(1000+growth*(l-1))*scale/100000;
    return side==='player'?Math.floor(Math.floor(scaled)*(100+bonus)/100):Math.floor(scaled);
  };
  const maxHp=stat(side==='enemy'&&rules<3?(legacyEnemyHp[p.model]??m.hp):m.hp,30,hpBonus), atk=stat(m.atk,25,atkBonus);
  const weaponIds=[...m.weapons,...(e?.weapons??[])];
  const capacity:Record<string,number>={},partMax:Record<string,number>={};
  for(const id of weaponIds){
    const w=weaponFor(p.model,id);
    if(w.uses===undefined)continue;
    capacity[id]=w.uses+(w.cost&&!w.kind&&equipment.includes('P23')?1:0)
      +(p.model==='supply'&&id==='supply'?Math.floor((ranks[0]??0)/2)+(ranks[2]??0):0);
  }
  for(const part of m.parts??[])partMax[part.id]=Math.max(1,stat(part.hp,30,0));
  return {...p,side,hp:maxHp,maxHp,atk,equipment,weapons:weaponIds,ranks,capacity,ammo:{...capacity},
    parts:{...partMax},partMax,cooldown:{},move:side==='player'&&p.model!=='facility',main:side==='player'&&p.model!=='facility',moved:0,discount:equipment.includes('P20'),guarding:false};
}
export function createBattle(c:Campaign,mission:string,difficulty:Difficulty){
  const m=missionFor(mission),l=recommended(m,difficulty),scale=difficulty==='easy'?80:100;
  const b:Battle={id:c.nextBattle,rules:3,mission,difficulty,size:m.size,terrain:missionTerrain(m),
    units:m.enemies.map(p=>unit(p,'enemy',l,scale)),round:1,side:'player',revision:0,spawned:[],log:[],stats:{}};
  if(m.goal==='defend')b.units.push(unit({id:'facility',model:'facility',at:[8,11],facing:0},'player',1,100));
  const [left,top,right,bottom]=m.zone;
  const order=c.roster.map((e,i)=>({e,i})).sort((a,b)=>Number(modelFor(b.e.model).size!==1)-Number(modelFor(a.e.model).size!==1)||a.i-b.i);
  for(const {e,i} of order){
    const used=occupied(b);
    let success=false;
    for(let y=top;y<=bottom&&!success;y++)for(let x=left;x<=right&&!success;x++){
      const p:Placement={model:e.model,id:'P'+String(i+1).padStart(2,'0'),at:[x,y],facing:0};
      if(cellsInZone(p,m.zone)&&placement(b,e.model,p,used)){b.units.push(unit(p,'player',level(c.levels[modelFor(e.model).group]??0),100,c,i));success=true;}
    }
    if(!success)throw Error('出撃区画に空きがありません');
  }
  addLog(b,m.briefing);
  return b;
}
export const cellsInZone=(p:Pose&{model:string},zone:Rectangle)=>footprint(modelFor(p.model),p).every(c=>inRect(c.at,zone));
export function deploy(b:Battle,id:string,pose:Pose):Battle|null {
  const u=b.units.find(u=>u.id===id&&u.side==='player'&&u.model!=='facility');
  if(b.revision||!u||!dirs.includes(pose.facing)||!cellsInZone({...pose,model:u.model},missionFor(b.mission).zone)||
    !placement(b,u.model,pose,occupied(b,id)))return null;
  return {...b,units:b.units.map(v=>v===u?{...u,...pose}:v)};
}
export function targetsAt(b:Battle,target:Target){
  return b.units.filter(u=>u.hp>0&&cellsOf(u).some(m=>m.layer===target.layer&&m.at[0]===target.at[0]&&m.at[1]===target.at[1]));
}
export const layerName=(layer:Layer)=>layer==='air'?'空中':'地上';
