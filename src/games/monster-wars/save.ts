import { equipment, models, weapons } from './catalog';
import { freshCampaign, totalXp, validEntry, type Campaign } from './campaign';
import type { Battle } from './battle-state';
import { cellsOf, inside, occupied } from './grid';
import { missions } from './missions';
import type { Cell } from './types';

export type Progress = { campaign:Campaign; battle?:Battle|undefined };
export type Envelope = {
  gameId:'monster-wars'; schemaVersion:1; rulesVersion:1; contentVersion:1;
  saveId:string; revision:number; payload:Progress; checksum:string;
};
const checksum=(s:string)=>{
  let hash=2166136261;
  for(let i=0;i<s.length;i++)hash=Math.imul(hash^s.charCodeAt(i),16777619);
  return (hash>>>0).toString(16);
};
export function encode(payload:Progress,saveId:string,previous?:Envelope):Envelope{
  const envelope={gameId:'monster-wars',schemaVersion:1,rulesVersion:1,contentVersion:1,
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
function validateCampaign(c:Campaign){
  return c&&Array.isArray(c.open)&&freshCampaign().open.every(id=>c.open.includes(id))&&
    c.open.every(id=>Object.hasOwn(models,id)||Object.hasOwn(weapons,id)||Object.hasOwn(equipment,id))&&
    integer(c.xp)&&integer(c.nextBattle,1)&&numbers(c.levels,0,totalXp(50))&&numbers(c.wins)&&numbers(c.receipts)&&
    c.merits&&Object.values(c.merits).every(s=>numbers(s))&&Array.isArray(c.roster)&&c.roster.every(e=>
      e&&Array.isArray(e.weapons)&&Array.isArray(e.equipment)&&validEntry(c,e));
}
function validateBattle(b:Battle,c:Campaign){
  const m=missions[b.mission];
  const cell=(at:Cell)=>Array.isArray(at)&&at.length===2&&at.every(n=>integer(n))&&inside(at,b.size);
  return !!m&&integer(b.id,1,c.nextBattle-1)&&integer(b.round,1,m.limit)&&integer(b.revision)&&
    b.size===m.size&&['easy','normal'].includes(b.difficulty)&&['player','enemy'].includes(b.side)&&
    (!b.result||['win','loss','retreat'].includes(b.result))&&Array.isArray(b.terrain)&&b.terrain.length===b.size*b.size&&
    b.terrain.every(t=>['plain','road','forest','rubble','building'].includes(t))&&Array.isArray(b.units)&&
    Array.isArray(b.spawned)&&b.spawned.every(id=>m.waves.some(w=>w.id===id))&&
    new Set(b.units.map(u=>u.id)).size===b.units.length&&b.units.every(u=>Object.hasOwn(models,u.model)&&
      ['player','enemy'].includes(u.side)&&cell(u.at)&&integer(u.facing,0,3)&&integer(u.hp,0,u.maxHp)&&integer(u.maxHp,1)&&integer(u.atk)&&
      Array.isArray(u.weapons)&&u.weapons.every(id=>Object.hasOwn(weapons,id))&&Array.isArray(u.equipment)&&u.equipment.every(id=>Object.hasOwn(equipment,id))&&
      numbers(u.ammo)&&numbers(u.capacity)&&Object.entries(u.ammo).every(([id,n])=>integer(n,0,u.capacity[id]))&&
      numbers(u.parts)&&numbers(u.partMax)&&Object.entries(u.parts).every(([id,n])=>integer(n,0,u.partMax[id]))&&numbers(u.cooldown))&&
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
    if(e.gameId!=='monster-wars'||e.schemaVersion!==1||e.rulesVersion!==1||e.contentVersion!==1||
      !integer(e.revision,1)||typeof e.saveId!=='string'||!e.payload)throw Error();
    const {checksum:check,...body}=e;
    if(check!==checksum(JSON.stringify(body))||!validateCampaign(e.payload.campaign)||
       e.payload.battle&&!validateBattle(e.payload.battle,e.payload.campaign))throw Error();
    return e;
  }catch{throw Error('セーブの内容・バージョンを確認できません');}
}
