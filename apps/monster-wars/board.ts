import { layerName, name, type Battle, type Unit } from '../../src/games/monster-wars/battle-state';
import { modelFor } from '../../src/games/monster-wars/catalog';
import { cellsOf, inRect, rotate, same, terrainAt } from '../../src/games/monster-wars/grid';
import { missionFor } from '../../src/games/monster-wars/missions';
import type { Cell, Layer } from '../../src/games/monster-wars/types';
import { arrows, esc, icons } from './presentation';
import { assets, battleArt } from './art';

export type LayerView='both'|Layer;
const terrainLabels={plain:'平地',road:'道路',forest:'森林',rubble:'瓦礫',building:'建物'};
const center=(values:number[])=>(Math.min(...values)+Math.max(...values)+1)/2;
const anchor=(x:number,y:number)=>'--x:'+x+';--y:'+y;
export function renderBoard(b:Battle,view:LayerView,cellSize:number,selected:string|undefined,setup:boolean,
  ranges:{moves:Set<string>; targets:Set<string>; route:Cell[]; area:Cell[]; origin?:Cell}){
  const marks=new Map<string,{unit:Unit;layer:Layer}[]>();
  const shadows:string[]=[],figures:string[]=[],hud:string[]=[],outlines:string[]=[];
  const matches=(layer:Layer)=>view==='both'||view===layer;
  const zone=missionFor(b.mission,b.rules).zone;
  for(const u of b.units.filter(u=>u.hp>0)){
    const model=modelFor(u.model),footprint=cellsOf(u);
    const cells=footprint.filter(c=>matches(c.layer));
    if(!cells.length)continue;
    for(const c of cells){
      const key=String(c.at),list=marks.get(key)??[];
      list.push({unit:u,layer:c.layer});marks.set(key,list);
    }

    const art=battleArt(u.model,u.facing);
    const occupied=footprint.filter(c=>c.layer===model.layer).map(c=>c.at);
    const x=center(occupied.map(c=>c[0])),y=center(occupied.map(c=>c[1]));
    const front=Math.max(...occupied.map(c=>c[1]))+1;
    const airborne=model.layer==='air';
    const layerDepth=b.size*2+2;
    const entity=' data-entity="'+esc(u.id)+'"';
    if(art){
      const depth=front*2+(airborne?layerDepth:0);
      figures.push('<span class="battle-art art-'+art+(model.airCells&&view==='air'?' art-ghost':'')+'"'+entity+
        ' style="'+anchor(x,y)+';--depth:'+depth+'"></span>');
      if(airborne)shadows.push('<span class="air-shadow board-anchor"'+entity+' style="'+anchor(x,y)+'"></span>');
    }

    const direction=model.facing?arrows[u.facing]:'';
    const conditions=[u.burn?'燃':'',u.chill?'冷':'',u.shellBreak?'殻':''].join('');
    const actions=u.side==='player'&&u.model!=='facility'?(u.move||u.main?'○':'済'):'';
    const hp='<span class="unit-hp" role="meter" aria-label="'+esc(name(u))+' HP" aria-valuemin="0" aria-valuenow="'+u.hp+
      '" aria-valuemax="'+u.maxHp+'"><i style="width:'+(100*u.hp/u.maxHp)+'%"></i></span>';
    const levels=(['ground','air'] as const).filter(l=>cells.some(c=>c.layer===l));
    for(const layer of levels){
      const primary=layer===(levels.includes(model.layer)?model.layer:levels[0]);
      const layerCells=cells.filter(c=>c.layer===layer);
      const labelX=layer===model.layer?x:center(layerCells.map(c=>c.at[0]));
      const labelY=layer===model.layer?(art&&!airborne?front-.08:y):center(layerCells.map(c=>c.at[1]));
      hud.push('<div class="sprite '+layer+(art?' illustrated':'')+(model.size!==1?' large':'')+'"'+entity+
        ' style="'+anchor(labelX,labelY)+';--depth:'+(Math.floor(labelY*2)+(layer==='air'?layerDepth:0))+'">'+
        (layer==='air'&&!art?'<span class="air-shadow"></span>':'')+
        '<span class="marker '+u.side+' '+layer+(u.id===selected?' selected-unit':'')+'">'+esc(icons[u.model]??'？')+
        (primary&&direction?'<span class="facing-marker" aria-label="向き '+direction+'">'+direction+'</span>':'')+
        '<small>'+(layer==='air'?'空':'地')+(primary?actions+conditions:'')+'</small></span>'+
        (primary?hp:'')+'</div>');
    }
    if(art&&model.airCells&&typeof model.size==='number'&&matches('air')){
      const size=model.size;
      for(const part of model.parts??[]){
        if(part.layer!=='air')continue;
        for(const offset of part.cells){
          const [px,py]=rotate(u.at,offset,u.facing,size);
          hud.push('<span class="part-pin board-anchor'+(u.parts[part.id]===0?' destroyed':'')+'"'+entity+
            ' title="'+esc(part.label)+'" style="'+anchor(px+.84,py+.20)+'">'+esc(part.label[0])+'</span>');
        }
      }
    }
  }
  const renderCell=(at:Cell)=>{
    const key=String(at),t=terrainAt(b,at),placed=marks.get(key)??[],img=assets.terrain[t];
    const css=['cell',t,placed.some(m=>m.unit.id===selected)?'selected':'',setup&&inRect(at,zone)?'zone':'',ranges.moves.has(key)?'move':'',
      ranges.targets.has(key)?'target':'',ranges.route.some(c=>same(c,at))?'path':'',
      b.warning?.cells.some(c=>same(c,at))?'warning':'',ranges.area.some(c=>same(c,at))?'area':'',ranges.origin&&same(ranges.origin,at)?'ray':'',
      placed.some(m=>m.layer==='ground')?'occupied-ground':'',placed.some(m=>m.layer==='air')?'occupied-air':''];
    const label=(at[0]+1)+','+(at[1]+1)+' '+terrainLabels[t]+' '+placed.map(m=>name(m.unit)+' '+layerName(m.layer)).join(' ');
    const highlight=css.filter(c=>['move','target','path','warning','area','ray','selected','occupied-ground','occupied-air'].includes(c));
    if(highlight.length)outlines.push('<span class="board-outline '+highlight.join(' ')+'" style="'+anchor(at[0],at[1])+'"></span>');
    return '<button type="button" aria-label="'+esc(label)+'" title="'+esc(label)+'" class="'+css.join(' ')+'" data-a="map" data-value="'+at+'">'+
      (img?'<img class="terrain-image" src="'+esc(img)+'" alt="">':'')+'</button>';
  };
  const tiles=Array.from({length:b.size*b.size},(_,i)=>renderCell([i%b.size,Math.floor(i/b.size)])).join('');
  return '<div class="board-scroller"><div class="board-frame" style="--cell:'+cellSize+'px"><div class="board" style="grid-template-columns:repeat('+b.size+',var(--cell))">'+
    tiles+'<div class="board-shadows" aria-hidden="true">'+shadows.join('')+'</div><div class="board-figures" aria-hidden="true">'+figures.join('')+
    '</div><div class="board-outlines" aria-hidden="true">'+outlines.join('')+'</div><div class="sprites">'+hud.join('')+
    '</div><div class="effect-plane" aria-hidden="true"></div></div></div></div>';
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
  // Consume the swipe so Chromium treats the next touch as a separate tap.
  root.addEventListener('touchmove',ev=>{if(drag?.moved)ev.preventDefault();},{passive:false});
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
