import infantryBoard from './art/infantry-board.webp?inline';
import infantryBook from './art/infantry-book.webp?inline';
import tankBoard from './art/tank-board.webp?inline';
import tankBook from './art/tank-book.webp?inline';
import helicopterBoard from './art/helicopter-board.webp?inline';
import helicopterBook from './art/helicopter-book.webp?inline';
import gardonBoard from './art/K06-board.webp?inline';
import gardonBook from './art/K06-book.webp?inline';
import balgandBoard from './art/K21-board.webp?inline';
import balgandBook from './art/K21-book.webp?inline';
import type { Direction } from '../../src/games/monster-wars/types';

type Sprite = {
  src:string;
  aspect:number;
  width:number;
  anchor:readonly [number,number];
  elevation?:number;
};
type ModelArt = {
  battle:Sprite;
  facings?:Partial<Record<Direction,Sprite>>;
  portrait:string;
};

const units:Partial<Record<string,ModelArt>>={
  infantry:{battle:{src:infantryBoard,aspect:160/153,width:1.05,anchor:[.50,.78]},portrait:infantryBook},
  tank:{battle:{src:tankBoard,aspect:192/145,width:1.25,anchor:[.48,.72]},portrait:tankBook},
  helicopter:{battle:{src:helicopterBoard,aspect:192/123,width:1.65,anchor:[.53,.60],elevation:.75},portrait:helicopterBook},
  K06:{battle:{src:gardonBoard,aspect:256/215,width:1.90,anchor:[.48,.67]},portrait:gardonBook},
  K21:{battle:{src:balgandBoard,aspect:1,width:3.30,anchor:[.49,.79]},portrait:balgandBook},
};

export const assets:{
  terrain:Partial<Record<string,string>>;
  effects:Partial<Record<string,string>>;
}={terrain:{},effects:{}};

export const portrait=(id:string)=>units[id]?.portrait;
export function battleArt(id:string,facing:Direction){
  const art=units[id];
  if(!art)return undefined;
  return art.facings?.[facing]?id+'-'+facing:id;
}

export function installArt(){
  const rule=(id:string,{src,aspect,width,anchor,elevation=0}:Sprite)=>
    '.art-'+id+'{--art-width:'+width+';--art-aspect:'+aspect+';--anchor-x:'+(anchor[0]*100)+'%;--anchor-y:'+(anchor[1]*100)+'%;--lift:'+elevation+';background-image:url("'+src+'")}';
  const styles=document.createElement('style');
  styles.textContent=Object.entries(units).flatMap(([id,art])=>art?[
    rule(id,art.battle),
    ...Object.entries(art.facings??{}).map(([direction,sprite])=>rule(id+'-'+direction,sprite)),
  ]:[]).join('\n');
  document.head.append(styles);
}
