import { modelFor } from './catalog';
import type { Cell, Direction, Layer, Model, Pose, Rectangle, Terrain } from './types';

export type Mark = { at:Cell; layer:Layer };
export type Occupant = Pose & { id:string; model:string; hp:number };
export type Board = { size:number; terrain:Terrain[]; units:Occupant[] };
export type Step = Pose & { cost:number; free:boolean; destroyed:Cell[] };
export const vector: [Cell,Cell,Cell,Cell] = [[0,-1],[1,0],[0,1],[-1,0]];
export const dirs: Direction[] = [0,1,2,3];
export const same=(a:Cell,b:Cell)=>a[0]===b[0]&&a[1]===b[1];
export const add=(a:Cell,b:Cell):Cell=>[a[0]+b[0],a[1]+b[1]];
export const distance=(a:Cell,b:Cell)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
export const includes=(cells:Cell[],at:Cell)=>cells.some(c=>same(c,at));
export const inRect=([x,y]:Cell,[l,t,r,b]:Rectangle)=> x>=l&&x<=r&&y>=t&&y<=b;
export const inside=([x,y]:Cell,n:number)=>x>=0&&y>=0&&x<n&&y<n;
export const terrainAt=(b:Board,[x,y]:Cell)=>b.terrain[y*b.size+x]??'plain';
export function rotate(at:Cell,offset:Cell,d:Direction,n:number):Cell {
  let [x,y]=offset;
  for(let i=0;i<d;i++) [x,y]=[n-1-y,x];
  return add(at,[x,y]);
}
export function footprint(model:Model,p:Pose):Mark[]{
  const cells:Mark[]=[];
  const layer=model.flightMove?(p.flightLayer??model.layer):model.layer;
  if(model.size==='long'){
    const [dx,dy]=vector[p.facing];
    return [{at:p.at,layer},{at:add(p.at,[-dx,-dy]),layer}];
  }
  const n=model.size;
  for(let y=0;y<n;y++) for(let x=0;x<n;x++)cells.push({at:add(p.at,[x,y]),layer});
  for(const offset of model.airCells??[])cells.push({at:rotate(p.at,offset,p.facing,n),layer:'air'});
  return cells;
}
export const cellsOf=(u:Occupant)=>footprint(modelFor(u.model),u);
export const poseKey=(p:Pose)=>p.at.join(',')+':'+p.facing+(p.flightLayer?':'+p.flightLayer:'');
export function occupied(b:Board,exclude=''){
  const marks=new Set<string>();
  for(const u of b.units)if(u.hp>0&&u.id!==exclude)for(const m of cellsOf(u))marks.add(m.layer+':'+m.at);
  return marks;
}
export function placement(b:Board,id:string,pose:Pose,used:Set<string>,crush=false){
  return footprint(modelFor(id),pose).every(m=>inside(m.at,b.size)&&!used.has(m.layer+':'+m.at)&&
    (m.layer==='air'||(terrainAt(b,m.at)!=='water'&&(terrainAt(b,m.at)!=='mountain'||['一般歩兵','狙撃兵','重火器兵','工兵'].includes(modelFor(id).group))&&(crush||terrainAt(b,m.at)!=='building'))));
}
export function movePaths(b:Board,u:Occupant,budget:number,discount:boolean,initialDestroyed:Cell[]=[],flightLocked=false, takeoffLocked=false):Map<string,Step[]>{
  const found=new Map<string,Step[]>(),done=new Set<string>(),used=occupied(b,u.id),m=modelFor(u.model);
  const queue:{pose:Pose; cost:number; free:boolean; turns:number; path:Step[]; destroyed:Cell[]}[]=[
    {pose:u,cost:0,free:discount,turns:0,path:[],destroyed:initialDestroyed},
  ];
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost||a.turns-b.turns||a.pose.at[1]-b.pose.at[1]||a.pose.at[0]-b.pose.at[0]||a.pose.facing-b.pose.facing);
    const current=queue.shift()!,p=current.pose,k=poseKey(p);
    const switched=current.path.some(s=>s.flightLayer!==u.flightLayer);
    const stateKey=k+':'+Number(switched)+':'+Number(current.free)+':'+current.destroyed.map(String).sort().join('|');
    if(done.has(stateKey))continue;
    done.add(stateKey);
    if(current.path.length && k!==poseKey(u) && !found.has(k))found.set(k,current.path);
    const large=m.facing&&m.size!==1&&(p.flightLayer??m.layer)==='ground';
    const steps:Pose[]=vector.filter((_,d)=>!large||d===p.facing||d===(p.facing+2)%4).map(v=>({...p,at:add(p.at,v)}));
    if(m.facing)for(const facing of dirs)if(facing!==p.facing)steps.push({...p,facing});
    if(m.flightMove&&!switched&&!flightLocked&&(!takeoffLocked||(p.flightLayer??m.layer)==='air'))steps.push({...p,flightLayer:(p.flightLayer??m.layer)==='ground'?'air':'ground'});
    for(const next of steps){
      if(!placement(b,u.model,next,used,m.crush))continue;
      const cells=footprint(m,next).filter(mark=>mark.layer==='ground');
      const destroyed=cells.filter(({at})=>terrainAt(b,at)==='building'&&!includes(current.destroyed,at)).map(c=>c.at);
      const switching=next.flightLayer!==p.flightLayer;
      const turn=next.facing!==p.facing;
      const rotation=turn?((next.facing+2)%4===p.facing?2:1):0;
      const infantry=['一般歩兵','狙撃兵','重火器兵','工兵'].includes(m.group);
      const rough=cells.some(({at})=>['building','rubble','forest'].includes(terrainAt(b,at)));
      const mountain=cells.some(({at})=>terrainAt(b,at)==='mountain');
      const step=switching?2:turn?rotation-Number(current.free):(mountain||!infantry&&rough?2:1);
      const cost=current.cost+step;
      if(cost>budget)continue;
      const free=current.free&&!turn;
      queue.push({pose:next,cost,free,turns:current.turns+Number(turn),path:[...current.path,{...next,cost,free,destroyed}],destroyed:[...current.destroyed,...destroyed]});
    }
  }
  return found;
}
export function blocked(b:Board,at:Cell){
  return terrainAt(b,at)==='building'||b.units.some(u=>u.hp>0&&u.model==='facility'&&cellsOf(u).some(m=>same(m.at,at)));
}
export function lineOfSight(b:Board,from:Cell,to:Cell){
  const [tx,ty]=to;
  let [x,y]=from;
  const dx=Math.abs(tx-x),dy=Math.abs(ty-y),sx=Math.sign(tx-x),sy=Math.sign(ty-y);
  let i=0,j=0;
  while(i<dx||j<dy){
    const a=(2*i+1)*dy,z=(2*j+1)*dx;
    if(a===z){
      if(blocked(b,[x+sx,y])&&blocked(b,[x,y+sy]))return false;
      x+=sx;y+=sy;i++;j++;
    } else if(a<z){x+=sx;i++;}
    else {y+=sy;j++;}
    if((x!==tx||y!==ty)&&blocked(b,[x,y]))return false;
  }
  return true;
}
