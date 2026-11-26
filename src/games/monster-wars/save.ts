import { equipment, models, unlocks, weapons } from './catalog';
import { freshCampaign, totalXp, validEntry, type Campaign } from './campaign';
import type { Battle } from './battle-state';
import { cellsOf, inside, occupied } from './grid';
import { missionFor } from './missions';
import type { Cell } from './types';

export type Progress = { campaign:Campaign; battle?:Battle|undefined };
export type Envelope = {
  gameId:'monster-wars'; schemaVersion:1|2; rulesVersion:1|2; contentVersion:1|2;
  saveId:string; revision:number; payload:Progress; checksum:string;
};
const checksum=(s:string)=>{
  let hash=2166136261;
  for(let i=0;i<s.length;i++)hash=Math.imul(hash^s.charCodeAt(i),16777619);
  return (hash>>>0).toString(16);
};
export function encode(payload:Progress,saveId:string,previous?:Envelope):Envelope{
  const envelope={gameId:'monster-wars',schemaVersion:2,rulesVersion:2,contentVersion:2,
    saveId:previous?.saveId??saveId,
    revision:(previous?.revision??0)+1,payload} as const;
  return {...envelope,checksum:checksum(JSON.stringify(envelope))};
}
function integer(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER):x is number{
  return typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
}
function numbers(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER){
  return !!x&&typeof x==='object'&&!Array.isArray(x)&&Object.values(x).every(v=>integer(v,min,max));
}
function validateCampaign(c:Campaign,legacy:boolean){
  return c&&Array.isArray(c.open)&&freshCampaign().open.every(id=>legacy&&id==='W45'||c.open.includes(id))&&
    c.open.every(id=>Object.hasOwn(models,id)||Object.hasOwn(weapons,id)||Object.hasOwn(equipment,id))&&
    integer(c.xp)&&integer(c.nextBattle,1)&&numbers(c.levels,0,totalXp(50))&&numbers(c.wins)&&numbers(c.receipts)&&
    c.merits&&Object.values(c.merits).every(s=>numbers(s))&&Array.isArray(c.roster)&&c.roster.every(e=>
      e&&Array.isArray(e.weapons)&&Array.isArray(e.equipment)&&validEntry(c,e));
}
function validateBattle(b:Battle,c:Campaign,rules:1|2){
  const m=missionFor(b.mission,rules);
  const cell=(at:Cell)=>Array.isArray(at)&&at.length===2&&at.every(n=>integer(n))&&inside(at,b.size);
  return (!b.automation||(rules===2&&b.side==='player'&&!b.result&&['run','end'].includes(b.automation)))&&integer(b.id,1,c.nextBattle-1)&&integer(b.round,1,m.limit)&&integer(b.revision)&&
    b.size===m.size&&['easy','normal'].includes(b.difficulty)&&['player','enemy'].includes(b.side)&&
    (!b.result||['win','loss','retreat'].includes(b.result))&&Array.isArray(b.terrain)&&b.terrain.length===b.size*b.size&&
    b.terrain.every(t=>['plain','road','forest','rubble','building'].includes(t))&&Array.isArray(b.units)&&
    Array.isArray(b.spawned)&&b.spawned.every(id=>m.waves.some(w=>w.id===id))&&
    new Set(b.units.map(u=>u.id)).size===b.units.length&&b.units.every(u=>Object.hasOwn(models,u.model)&&
      ['player','enemy'].includes(u.side)&&cell(u.at)&&integer(u.facing,0,3)&&integer(u.hp,0,u.maxHp)&&integer(u.maxHp,1)&&integer(u.atk)&&
      Array.isArray(u.weapons)&&u.weapons.every(id=>Object.hasOwn(weapons,id))&&Array.isArray(u.equipment)&&u.equipment.every(id=>Object.hasOwn(equipment,id))&&
      numbers(u.ammo)&&numbers(u.capacity)&&Object.entries(u.ammo).every(([id,n])=>integer(n,0,u.capacity[id]))&&
      numbers(u.parts)&&numbers(u.partMax)&&Object.entries(u.parts).every(([id,n])=>integer(n,0,u.partMax[id]))&&numbers(u.cooldown)&&
      (u.automatic===undefined||u.side==='player'&&u.model!=='facility'&&typeof u.automatic==='boolean')&&
      (!u.order||u.side==='player'&&u.model!=='facility'&&
        (u.order.kind==='free'||['focus','guard'].includes(u.order.kind)&&typeof u.order.target==='string'))&&
      (!u.burn||integer(u.burn.remaining,1,3)&&b.units.some(s=>s.id===u.burn?.source))&&
      (!u.chill||integer(u.chill.through,b.round,b.round+2)&&b.units.some(s=>s.id===u.chill?.source)))&&
    occupied(b).size===b.units.filter(u=>u.hp>0).flatMap(cellsOf).length&&
    b.units.filter(u=>u.hp>0).flatMap(cellsOf).every(m=>cell(m.at))&&
    Array.isArray(b.log)&&b.log.every(l=>typeof l==='string')&&
    (!b.warning||b.units.some(u=>u.id===b.warning?.source&&u.weapons.includes(b.warning.weapon))&&
      cell(b.warning.target.at)&&Array.isArray(b.warning.cells)&&b.warning.cells.every(cell))&&
    (b.result!=='win'||Object.hasOwn(c.receipts,b.id));
}
export function decode(input:unknown):Envelope {
  try{
    const e=input as Envelope;
    const version=e.schemaVersion;
    if(e.gameId!=='monster-wars'||![1,2].includes(version)||e.rulesVersion!==version||e.contentVersion!==version||
      !integer(e.revision,1)||typeof e.saveId!=='string'||!e.payload)throw Error();
    const b=e.payload.battle;
    if(b&&(version===1?b.rules!==undefined:b.rules!==1&&b.rules!==2))throw Error();
    const {checksum:check,...body}=e;
    if(check!==checksum(JSON.stringify(body))||!validateCampaign(e.payload.campaign,version===1)||
       b&&!validateBattle(b,e.payload.campaign,b.rules??1))throw Error();
    return e;
  }catch{throw Error('セーブの内容・バージョンを確認できません');}
}

export function upgradeSave(e:Envelope):Progress {
  if(e.schemaVersion===2)return e.payload;
  const {campaign,battle}=e.payload;
  const unlocked=new Set([...campaign.open,...unlocks[0]]);
  for(const [index,mission] of ['MVP01','MVP02'].entries()){
    if(campaign.wins['easy:'+mission]||campaign.wins['normal:'+mission]){
      for(const id of unlocks[index+1]??[])unlocked.add(id);
    }
  }
  return {campaign:{...campaign,open:[...unlocked]},...(battle?{battle:{...battle,rules:1 as const}}:{})};
}
