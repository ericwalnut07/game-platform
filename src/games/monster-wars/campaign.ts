import { compatible, duplicateRates, equipment, models, unlocks, weaponFor, modelFor, equipmentFor } from './catalog';
import { ceiling, debrief, missionIds, missionFor } from './missions';
import type { Difficulty, Metric, RosterEntry } from './types';

export type Stats = Partial<Record<Metric,number>>;
export type Campaign = {
  bestiary?: string[];
  open: string[]; wins: Record<string,number>; xp: number; levels: Record<string,number>;
  merits: Record<string,Stats>; roster: RosterEntry[]; nextBattle: number;
  receipts: Record<number,number>;
};
export const freshCampaign = ():Campaign => ({
  bestiary:[],open:[...unlocks[0]],wins:{},xp:0,levels:{},merits:{},nextBattle:1,receipts:{},
  roster:['tank','tank','apc','apc','infantry','infantry'].map(model=>({
    model,weapons:model==='tank'?['W09']:model==='infantry'?['W01']:[],equipment:[],
  })),
});
export const nextXp = (l:number) => 100+10*l+2*l*l;
export const totalXp = (l:number) => Array.from({length:l-1},(_,i)=>nextXp(i+1)).reduce((a,b)=>a+b,0);
export function level(xp:number) {
  let l=1;
  while(l<50 && xp>=nextXp(l)) xp-=nextXp(l++);
  return l;
}
export function allocate(c:Campaign,group:string,requested:number):Campaign {
  if(!c.open.some(id=>models[id]?.group===group) || !Number.isSafeInteger(requested) || requested<=0) return c;
  const current=c.levels[group]??0, amount=Math.min(requested,c.xp,totalXp(50)-current);
  return amount>0?{...c,xp:c.xp-amount,levels:{...c.levels,[group]:current+amount}}:c;
}
export const meritLevel = (amount:number,threshold:number) => [1,3,6,10,15].filter(n=>amount>=n*threshold).length;
export const meritRanks = (c:Campaign,id:string) => (modelFor(id).merits??[]).map(m=>meritLevel(c.merits[id]?.[m.metric]??0,m.threshold));
export function rosterCosts(roster:RosterEntry[]){
  const groups:Record<string,number>={},copies:Record<string,number>={};
  const entries=roster.map((entry,index)=>({entry,index})).sort((a,b)=>
    modelFor(b.entry.model).cost-modelFor(a.entry.model).cost||a.entry.model.localeCompare(b.entry.model)||a.index-b.index);
  const costs=entries.map(({entry,index})=>{
    const m=modelFor(entry.model),group=groups[m.group]??0,copy=copies[entry.model]??0,[g,k]=duplicateRates[m.group]??[0,0];
    const adjusted=Math.ceil(m.cost*(100+g*group+k*copy)/100);
    groups[m.group]=group+1;copies[entry.model]=copy+1;
    const weapon=entry.weapons.reduce((s,id)=>s+(weaponFor(entry.model,id).cost??0),0);
    const gear=entry.equipment.reduce((s,id)=>s+equipmentFor(id).cost,0);
    return {index,base:m.cost,duplicate:adjusted-m.cost,weapon,gear,total:adjusted+weapon+gear};
  });
  return costs.sort((a,b)=>a.index-b.index);
}
export const rosterCost=(roster:RosterEntry[])=>rosterCosts(roster).reduce((sum,c)=>sum+c.total,0);
export const key=(id:string,d:Difficulty)=>d+':'+id;
export function available(c:Campaign,id:string,d:Difficulty){
  const i=missionIds.indexOf(id);
  const prior=missionIds[i-1];
  return i===0||!!prior&&!!c.wins[key(prior,d)];
}
export function validEntry(c:Campaign,e:RosterEntry){
  const slots=models[e.model]?.slots;
  return !!slots && c.open.includes(e.model) && e.weapons.length<=slots[0] && e.equipment.length<=slots[1] &&
    new Set([...e.weapons,...e.equipment]).size===e.weapons.length+e.equipment.length &&
    e.weapons.every(id=>id.startsWith('W')&&c.open.includes(id)&&compatible(e.model,id)) &&
    e.equipment.every(id=>id in equipment&&c.open.includes(id)&&compatible(e.model,id));
}
export function sortieError(c:Campaign, id:string, d:Difficulty){
  if(!available(c,id,d))return '前のミッションをクリアしてください';
  if(!c.roster.length)return '出撃部隊を編成してください';
  if(!c.roster.every(e=>validEntry(c,e)))return '編成または装備に使用できない項目があります';
  const cap=ceiling(missionFor(id),d);
  return rosterCost(c.roster)>cap?'編成COSTが上限を超えています':'';
}
export function award(c:Campaign,id:string,d:Difficulty,battle:number,merits:Record<string,Stats>):Campaign {
  if(battle in c.receipts)return c;
  const k=key(id,d),wins=c.wins[k]??0,xp=debrief(d,!wins),i=missionIds.indexOf(id);
  const next:Campaign={...c,open:[...new Set([...c.open,...(unlocks[i+1]??[])])],wins:{...c.wins,[k]:wins+1},xp:c.xp+xp,merits:{...c.merits},receipts:{...c.receipts,[battle]:xp}};
  for(const [model,stats] of Object.entries(merits)){
    const earned={...next.merits[model]};
    for(const [metric,value] of Object.entries(stats) as [Metric,number][])earned[metric]=(earned[metric]??0)+value;
    next.merits[model]=earned;
  }
  return next;
}
