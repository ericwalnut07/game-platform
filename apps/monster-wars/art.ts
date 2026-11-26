import infantryBoard from './art/infantry-board.webp?inline';
import infantryBook from './art/infantry-book.webp?inline';
import tankBook from './art/tank-book.webp?inline';
import helicopterBoard from './art/helicopter-board.webp?inline';
import helicopterBook from './art/helicopter-book.webp?inline';
import gardonBook from './art/K06-book.webp?inline';
import balgandBook from './art/K21-book.webp?inline';
import { screenFacing, screenY } from './projection';
import type { Direction } from '../../src/games/monster-wars/types';

type Sprite = {
  src:string;
  aspect:number;
  width:number;
  anchor:readonly [number,number];
  elevation?:number;
};
type ModelArt = {
  battle?:Sprite;
  facings?:Partial<Record<ReturnType<typeof screenFacing>,Sprite>>;
  portrait:string;
};

const bundle=import.meta.glob<string>('./art/formal/*.webp',{eager:true,query:'?inline',import:'default'});
const file=(name:string)=>bundle['./art/formal/'+name+'.webp']!;
const sprite=(name:string,aspect:number,width:number,anchor:Sprite['anchor'],elevation=0):Sprite=>
  ({src:file(name),aspect,width,anchor,elevation});
const model=(id:string,aspect:number,width:number,anchor:Sprite['anchor'],elevation=0):ModelArt=>
  ({battle:sprite(id,aspect,width,anchor,elevation),portrait:file(id)});

const units:Partial<Record<string,ModelArt>>={
  infantry:{battle:{src:infantryBoard,aspect:160/153,width:1.31,anchor:[.50,.78]},portrait:infantryBook},
  tank:{portrait:tankBook,facings:{NE:sprite('tank-NE',220/186,1.56,[0.48, 0.75]),SE:sprite('tank-SE',220/203,1.56,[0.48, 0.73]),SW:sprite('tank-SW',220/206,1.56,[0.52, 0.73]),NW:sprite('tank-NW',220/186,1.56,[0.52, 0.76])}},
  helicopter:{battle:{src:helicopterBoard,aspect:192/123,width:1.90,anchor:[.53,.60],elevation:.75},portrait:helicopterBook},
  K06:{portrait:gardonBook,facings:{NE:sprite('K06-NE',264/194,2.09,[0.53, 0.76]),SE:sprite('K06-SE',264/245,2.09,[0.52, 0.75]),SW:sprite('K06-SW',264/222,2.09,[0.46, 0.75]),NW:sprite('K06-NW',264/176,2.09,[0.44, 0.75])}},
  K21:{portrait:balgandBook,facings:{NE:sprite('K21-NE',370/380,3.3,[0.64, 0.81]),SE:sprite('K21-SE',376/380,3.3,[0.56, 0.83]),SW:sprite('K21-SW',379/380,3.3,[0.45, 0.83]),NW:sprite('K21-NW',380/369,3.3,[0.39, 0.84])}},
  apc:model('apc',352/324,1.35,[0.5,0.75]),
  heavy:{...model('heavy',352/313,2.12,[0.5,0.75]),facings:{NE:sprite('heavy-NE',256/210,2.12,[.50,.75]),SE:sprite('heavy-SE',256/228,2.12,[.50,.75]),SW:sprite('heavy-SW',256/222,2.12,[.50,.75]),NW:sprite('heavy-NW',256/212,2.12,[.50,.75])}},
  aa:model('aa',350/352,1.35,[0.5,0.76]),
  lightArt:model('lightArt',352/344,1.45,[0.5,0.74]),
  heavyArt:model('heavyArt',352/291,2,[0.5,0.73]),
  repair:model('repair',352/294,1.4,[0.5,0.78]),
  supply:model('supply',352/269,1.4,[0.5,0.75]),
  sniper:model('sniper',351/352,1.18,[0.5,0.77]),
  K01:model('K01',352/326,1.22,[0.5,0.78]),
  K03:model('K03',352/254,1.45,[0.5,0.77]),
  K04:model('K04',352/242,1.63,[0.5,0.62],0.75),
  K11:{...model('K11',352/267,2.6,[0.5,0.77]),facings:{NE:sprite('K11-NE',300/241,2.6,[0.54, 0.75]),SE:sprite('K11-SE',300/232,2.6,[0.52, 0.75]),SW:sprite('K11-SW',300/226,2.6,[0.46, 0.77]),NW:sprite('K11-NW',300/218,2.6,[0.45, 0.76])}},
};

export type DisplayTerrain='plain'|'road'|'forest'|'rubble'|'building'|'mountain'|'water'|'defensive_position';
export const groundArt:Record<DisplayTerrain,string>={
  plain:'plain',road:'road',forest:'forest',rubble:'rubble',building:'plain',mountain:'mountain',water:'water',defensive_position:'plain',
};
export const objectArt:Partial<Record<DisplayTerrain|'facility',Sprite>>={
  forest:sprite('object_forest',250/256,1.62,[0.5,0.78]),
  mountain:sprite('object_mountain',256/196,1.54,[0.5,0.76]),
  defensive_position:sprite('object_defensive_position',256/187,1.5,[0.5,0.73]),
  building:sprite('object_building',256/223,1.46,[0.5,0.79]),
  facility:sprite('object_defense_facility',256/238,2.46,[0.5,0.78]),
};

export const portrait=(id:string)=>units[id]?.portrait;
type ScreenFacing=ReturnType<typeof screenFacing>;
type ImagePoint=readonly [number,number];

const checked=new Set<string>();
export function watchSprite(key:string,sprite:Sprite){
  if(checked.has(key))return;
  checked.add(key);
  const image=new Image();
  image.src=sprite.src;
  void image.decode().then(()=>document.documentElement.classList.add('art-ready-'+key),()=>{});
}

export function battleSprite(id:string,facing:Direction){
  const art=units[id],direction=screenFacing(facing);
  const variant=art?.facings?.[direction];
  if(variant)return {key:id+'-'+direction,sprite:variant};
  return art?.battle?{key:id,sprite:art.battle}:undefined;
}

// Normalized positions on the four complete K21 drawings, independent of hit cells.
export const bossPartArt:Record<ScreenFacing,Record<string,ImagePoint>>={
  NE:{head:[.87,.12],chest:[.82,.38],armL:[.40,.32],armR:[.87,.48],legL:[.53,.67],legR:[.75,.79],shell:[.57,.42]},
  SE:{head:[.73,.23],chest:[.64,.45],armL:[.88,.55],armR:[.32,.54],legL:[.75,.80],legR:[.34,.88],shell:[.39,.29]},
  SW:{head:[.26,.20],chest:[.35,.41],armL:[.66,.56],armR:[.10,.54],legL:[.69,.88],legR:[.21,.80],shell:[.62,.27]},
  NW:{head:[.25,.12],chest:[.21,.30],armL:[.14,.49],armR:[.70,.41],legL:[.24,.83],legR:[.60,.77],shell:[.46,.41]},
};

export const groundArtDrop=2*screenY*.20;
export const artDrop=(elevation=0)=>elevation?0:groundArtDrop;

export function installArt(){
  const rule=(id:string,{src,aspect,width,anchor,elevation=0}:Sprite)=>
    '.art-'+id+'{--art-width:'+width+';--art-aspect:'+aspect+';--anchor-x:'+(anchor[0]*100)+'%;--anchor-y:'+(anchor[1]*100)+'%;--lift:'+elevation+';--art-drop:'+artDrop(elevation)+';background-image:url("'+src+'")}.art-ready-'+id+' .glyph-'+id+'{display:none}';
  const styles=document.createElement('style');
  styles.textContent=[
    ...Object.values(groundArt).filter((name,i,all)=>i===all.indexOf(name)).map(name=>'.ground-'+name+'::before{background-image:url("'+file('terrain_'+name)+'")}'),
    ...Object.entries(objectArt).map(([id,art])=>rule('object-'+id,art)),
    ...Object.entries(units).flatMap(([id,art])=>art?[
      ...(art.battle?[rule(id,art.battle)]:[]),
      ...Object.entries(art.facings??{}).map(([direction,sprite])=>rule(id+'-'+direction,sprite)),
    ]:[]),
  ].join('\n');
  document.head.append(styles);
}
