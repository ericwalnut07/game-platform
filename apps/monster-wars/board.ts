import { layerName, name, type Battle, type Unit } from '../../src/games/monster-wars/battle-state';
import { modelFor } from '../../src/games/monster-wars/catalog';
import { cellsOf, inRect, same, terrainAt } from '../../src/games/monster-wars/grid';
import { missionFor } from '../../src/games/monster-wars/missions';
import type { Cell, Layer } from '../../src/games/monster-wars/types';
import { arrows, assets, esc, modelArt } from './presentation';

export type LayerView='both'|Layer;
const terrainLabels={plain:'平地',road:'道路',forest:'森林',rubble:'瓦礫',building:'建物'};
export function renderBoard(b:Battle,view:LayerView,cellSize:number,selected:string|undefined,setup:boolean,
  ranges:{moves:Set<string>; targets:Set<string>; route:Cell[]; area:Cell[]; origin?:Cell}){
  const marks=new Map<string,{unit:Unit;layer:Layer}[]>();
  const sprites:string[]=[];
  const matches=(layer:Layer)=>view==='both'||view===layer;
  const zone=missionFor(b.mission,b.rules).zone;
  for(const u of b.units.filter(u=>u.hp>0)){
    const cells=cellsOf(u).filter(c=>matches(c.layer));
    for(const c of cells){
      const key=String(c.at),list=marks.get(key)??[];
      list.push({unit:u,layer:c.layer});marks.set(key,list);
    }
    const levels=(['ground','air'] as const).filter(l=>cells.some(c=>c.layer===l));
    for(const [index,layer] of levels.entries()){
      const occupied=cells.filter(c=>c.layer===layer).map(c=>c.at);
      const x=(Math.min(...occupied.map(c=>c[0]))+Math.max(...occupied.map(c=>c[0]))+1)/2;
      const y=(Math.min(...occupied.map(c=>c[1]))+Math.max(...occupied.map(c=>c[1]))+1)/2;
      const large=modelFor(u.model).size!==1;
      const direction=modelFor(u.model).facing?arrows[u.facing]:'';
      const state=[u.burn?'燃':'',u.chill?'冷':'',u.shellBreak?'殻':''].join('');
      sprites.push('<div class="sprite '+layer+(large?' large':'')+'" data-entity="'+esc(u.id)+'" style="--x:'+x+';--y:'+y+';--depth:'+(Math.floor(y*2)+(layer==='air'?60:0))+'">'+
        (layer==='air'?'<span class="air-shadow"></span>':'')+
        '<span class="marker '+u.side+' '+layer+(u.id===selected?' selected-unit':'')+'">'+modelArt(u.model,u.facing)+direction+
        '<small>'+ (layer==='air'?'空':'地')+(u.side==='player'&&u.model!=='facility'?(u.move||u.main?'○':'済'):'')+state+'</small></span>'+
        (index===levels.length-1?'<span class="unit-hp" role="meter" aria-label="'+esc(name(u))+' HP" aria-valuemin="0" aria-valuenow="'+u.hp+'" aria-valuemax="'+u.maxHp+'"><i style="width:'+(100*u.hp/u.maxHp)+'%"></i></span>':'')+'</div>');
    }
  }
  const renderCell=(at:Cell)=>{
    const key=String(at),t=terrainAt(b,at),placed=marks.get(key)??[],img=assets.terrain[t];
    const css=['cell',t,placed.some(m=>m.unit.id===selected)?'selected':'',setup&&inRect(at,zone)?'zone':'',ranges.moves.has(key)?'move':'',
      ranges.targets.has(key)?'target':'',ranges.route.some(c=>same(c,at))?'path':'',
      b.warning?.cells.some(c=>same(c,at))?'warning':'',ranges.area.some(c=>same(c,at))?'area':'',ranges.origin&&same(ranges.origin,at)?'ray':'',
      placed.some(m=>m.layer==='ground')?'occupied-ground':'',placed.some(m=>m.layer==='air')?'occupied-air':''];
    const label=(at[0]+1)+','+(at[1]+1)+' '+terrainLabels[t]+' '+placed.map(m=>name(m.unit)+' '+layerName(m.layer)).join(' ');
    return '<button type="button" aria-label="'+esc(label)+'" title="'+esc(label)+'" class="'+css.join(' ')+'" data-a="map" data-value="'+at+'">'+
      (img?'<img class="terrain-image" src="'+esc(img)+'" alt="">':'')+'</button>';
  };
  return '<div class="board-scroller"><div class="board" style="--cell:'+cellSize+'px;grid-template-columns:repeat('+b.size+',var(--cell))">'+
    Array.from({length:b.size*b.size},(_,i)=>renderCell([i%b.size,Math.floor(i/b.size)])).join('')+
    '<div class="sprites">'+sprites.join('')+'</div><div class="effect-plane" aria-hidden="true"></div></div></div>';
}
export function installPan(root:HTMLElement){
  let drag:{board:HTMLElement;x:number;y:number;left:number;top:number;id:number;moved:boolean}|undefined;
  let swallow=false;
  root.addEventListener('pointerdown',ev=>{
    if(!ev.isPrimary||ev.button!==0)return;
    const board=(ev.target as HTMLElement).closest<HTMLElement>('.board-scroller');
    if(board)drag={board,x:ev.clientX,y:ev.clientY,left:board.scrollLeft,top:board.scrollTop,id:ev.pointerId,moved:false};
  });
  root.addEventListener('pointermove',ev=>{
    if(!drag||drag.id!==ev.pointerId)return;
    const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)>6){drag.moved=true;drag.board.setPointerCapture(ev.pointerId);}
    if(drag.moved){drag.board.scrollLeft=drag.left-dx;drag.board.scrollTop=drag.top-dy;}
  });
  const end=(ev:PointerEvent)=>{
    if(drag?.id!==ev.pointerId)return;
    if(drag.moved){
      swallow=true;
      setTimeout(()=>{swallow=false;},0);
    }
    drag=undefined;
  };
  root.addEventListener('pointerup',end);
  root.addEventListener('pointercancel',end);
  root.addEventListener('click',ev=>{if(swallow){ev.preventDefault();ev.stopImmediatePropagation();}},true);
}
