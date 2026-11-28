// Test-branch-only reference primitives. Not wired to production battle state.
import type { Cell, Direction } from './types';
export function growth(base:number,level:number,kind:'hp'|'atk',scale=100,bonus=0){
 if(!Number.isInteger(level)||level<1||level>50)throw new RangeError('level');
 const n=level-1;
 return Math.floor(Math.floor(base*(4000+(kind==='hp'?120:100)*n+n*(n-1))*scale/400000)*(100+bonus)/100);
}
export const reducedCost=(old:number)=>Math.max(1,old-1);
export const cellKey=(c:Cell)=>c.join(',');
export function radial(occupied:Cell[],radius:number,size:number):Cell[]{
 const own=new Set(occupied.map(cellKey)),out:Cell[]=[];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const c:Cell=[x,y];
  if(!own.has(cellKey(c))&&occupied.some(([a,b])=>Math.abs(a-x)+Math.abs(b-y)<=radius))out.push(c);
 }
 return out;
}
const vectors:Cell[]=[[0,-1],[1,0],[0,1],[-1,0]];
export function laser(origin:Cell,facing:Direction,size:number,blocked:(c:Cell)=>boolean):{at:Cell;power:number}[]{
 const [dx,dy]=vectors[facing]!,out:{at:Cell;power:number}[]=[];
 for(const lane of [-1,0,1])for(let d=1;d<=8;d++){
  const at:Cell=[origin[0]+dy*lane+dx*d,origin[1]-dx*lane+dy*d];
  if(at.some(v=>v<0||v>=size))break;
  if(d>=2)out.push({at,power:lane===0?250:150});
  if(blocked(at))break;
 }
 return out;
}
export function aggregate(hits:{at:Cell;damage:number}[]){
 const byCell=new Map<string,number>();
 for(const h of hits)byCell.set(cellKey(h.at),Math.max(byCell.get(cellKey(h.at))??0,h.damage));
 const [first,...rest]=[...byCell.values()].sort((a,b)=>b-a);
 return first===undefined?0:Math.max(1,Math.floor(first+rest.reduce((s,v)=>s+v,0)*.3+1e-9));
}
