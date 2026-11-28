import type { Battle,Unit,TimedStatus } from './battle-state';
import { modelFor } from './catalog';
export type TimedKey='freeze'|'suppression'|'flightBlock'|'timedChill';
export const boss=(u:Unit)=>['K21','K22'].includes(u.model);
export const giant=(u:Unit)=>[2,3].includes(Number(modelFor(u.model).size));
export const ownerTurn=(b:Battle,u:Unit)=>b.round;
export function applyTimed(b:Battle,u:Unit,source:string,key:TimedKey,duration:number){
 const r=ownerTurn(b,u),eligible=r+Number(b.side===u.side);
 const immunity=key==='freeze'?u.freezeImmune:key==='flightBlock'?u.flightBlockImmune:undefined;
 if((immunity??0)>=r)return false;
 if(key==='timedChill'&&u.freeze)return false;
 const old=u[key];
 if(old&&(key==='freeze'||key==='flightBlock'||old.eligible+old.remaining>=eligible+duration))return false;
 const status:TimedStatus={source,remaining:duration,eligible};
 u[key]=status;
 if(key==='freeze'){delete u.timedChill;delete u.chill;}
 return true;
}
export function tickTimed(b:Battle,u:Unit){
 if(u.freezeImmune!==undefined&&u.freezeImmune<=b.round)delete u.freezeImmune;
 if(u.flightBlockImmune!==undefined&&u.flightBlockImmune<=b.round)delete u.flightBlockImmune;
 for(const key of ['freeze','suppression','flightBlock','timedChill'] as const){
  const s=u[key];if(!s||s.eligible>b.round)continue;
  if(--s.remaining===0){delete u[key];if(key==='freeze')u.freezeImmune=b.round+1;if(key==='flightBlock')u.flightBlockImmune=b.round+1;}
 }
}
export function recoveryFactor(u:Unit){return u.suppression?(boss(u)?0.5:0.25):1;}
export function regenerationAmount(u:Unit){
 return Math.min(u.maxHp-u.hp,Math.floor(u.maxHp*(modelFor(u.model).regeneration??0)/100*(u.burn?0.5:1)*recoveryFactor(u)));
}
