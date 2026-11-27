import { modelFor } from '../../../src/games/monster-wars/catalog';
import { cellsOf } from '../../../src/games/monster-wars/grid';
import type { Unit } from '../../../src/games/monster-wars/battle-state';
import type { Cell, Layer } from '../../../src/games/monster-wars/types';
import { artDrop, battleSprite, bossPartArt, objectArt } from '../art';
import { project, screenFacing } from '../projection';

export type Point=readonly [number,number];
type Facings=Record<ReturnType<typeof screenFacing>,Point>;
const origins:Record<string,Point|Facings>={
  infantry:[.98,.36], aa:[.84,.18], helicopter:[.85,.90], lightArt:[.87,.035],
  tank:{NE:[.98,.16],SE:[.98,.73],SW:[.025,.78],NW:[.025,.13]},
  K06:{NE:[.91,.21],SE:[.83,.61],SW:[.24,.69],NW:[.15,.30]},
  apc:[.85,.40],sniper:[.93,.38],K01:[.70,.66],K03:[.75,.62],K04:[.72,.61],
  heavy:{NE:[.97,.17],SE:[.98,.75],SW:[.03,.76],NW:[.03,.16]},
  heavyArt:{NE:[.89,.13],SE:[.91,.53],SW:[.13,.60],NW:[.13,.19]},
  K11:{NE:[.87,.29],SE:[.81,.67],SW:[.21,.70],NW:[.15,.29]},
};
export function projectedCell(at:Cell,size:number,layer:Layer='ground'):Point{
  const [x,y]=project(at[0]+.5,at[1]+.5,size);
  return [x,y-(layer==='air'?.75:0)];
}
export function unitCenter(u:Unit,size:number){
  const cells=cellsOf({...u,hp:1}).filter(c=>c.layer===modelFor(u.model).layer);
  const coord=(i:0|1)=>(Math.min(...cells.map(c=>c.at[i]))+Math.max(...cells.map(c=>c.at[i]))+1)/2;
  return project(coord(0),coord(1),size);
}
export function spritePoint(u:Unit,size:number,point:Point):Point|undefined{
  const art=battleSprite(u.model,u.facing)?.sprite??(u.model==='facility'?objectArt.facility:undefined);
  if(!art)return;
  const [x,y]=unitCenter(u,size);
  return [x+(point[0]-art.anchor[0])*art.width,
    y+(point[1]-art.anchor[1])*art.width/art.aspect+artDrop(art.elevation)-(art.elevation??0)];
}
export function launchPoint(u:Unit,size:number,origin:Cell,layer:Layer,weapon:string):Point{
  const wOrigin=modelFor(u.model).weapons.includes(weapon)||u.weapons.includes(weapon);
  const mapped=origins[u.model];
  const direction=screenFacing(u.facing);
  const part=u.model==='K21'?({stomp:u.parts.legR?'legR':'legL',sweepL:'armL',sweepR:'armR',headRay:'head',warningRay:'head'} as Record<string,string>)[weapon]:undefined;
  const attached:Point|undefined=weapon==='W18'?[.62,.45]:
    ['repair','supply','W45','W46','W47'].includes(weapon)?[.57,.55]:undefined;
  const point=attached??(part?bossPartArt[direction][part]:mapped&&wOrigin?(Array.isArray(mapped)?mapped:(mapped as Facings)[direction]) as Point:undefined);
  return (point?spritePoint(u,size,point):undefined)??projectedCell(origin,size,layer);
}
export function hitPoint(u:Unit,size:number,at:Cell,layer:Layer,part?:string):Point{
  const point=part&&u.model==='K21'?bossPartArt[screenFacing(u.facing)][part]:undefined;
  if(point)return spritePoint(u,size,point)??projectedCell(at,size,layer);
  // Use the real hit cell for large targets, and the art's body center for single-cell units.
  const p=projectedCell(at,size,layer);
  const model=modelFor(u.model);
  if(model.size!==1||model.layer!==layer)return [p[0],p[1]-.22];
  return spritePoint(u,size,[.5,.55])??[p[0],p[1]-.22];
}
