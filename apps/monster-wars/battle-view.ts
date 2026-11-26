import { layerName, name, type Unit } from '../../src/games/monster-wars/battle-state';
import { modelFor } from '../../src/games/monster-wars/catalog';
import { cellsOf } from '../../src/games/monster-wars/grid';
import { arrows, project, screenX, screenY } from './projection';
import { esc } from './presentation';

type Point=readonly [number,number];

export const unitLayer=(u:Unit)=>modelFor(u.model).airCells?'地上・空中':layerName(modelFor(u.model).layer);
export const unitStatus=(u:Unit)=>[
  u.guarding?'防御':'',u.overwatch?'迎撃':'',u.burn?'燃焼':'',u.chill?'冷却':'',u.shellBreak?'外殻破損':'',
].filter(Boolean).join('・');
export const hpGauge=(u:Unit)=>'<progress class="roster-hp" aria-label="'+esc(name(u))+' 現在HP" value="'+u.hp+'" max="'+u.maxHp+'"></progress>';

export function roster(title:string,units:Unit[],selected:string,actionable?:number){
  return '<section class="roster '+(actionable===undefined?'enemy-roster':'ally-roster')+'"><h2>'+title+
    ' <small>'+units.length+'隊'+(actionable===undefined?'':'・行動可 '+actionable)+'</small></h2>'+
    '<div class="roster-scroll" data-scroll="'+(actionable===undefined?'enemy':'ally')+'">'+units.map(u=>{
      const own=u.side==='player'&&u.model!=='facility';
      const state=own?((u.move||u.main?'行動可':'行動済')+'・'+(u.automatic?'オート':'手動')):'';
      return '<button type="button" class="roster-unit" data-a="unit" data-value="'+esc(u.id)+'" aria-pressed="'+(u.id===selected)+'">'+
        '<span class="roster-name">'+esc(name(u))+'</span><span class="roster-hp-text">'+u.hp+'/'+u.maxHp+'</span>'+
        hpGauge(u)+'<span class="roster-state">'+unitLayer(u)+(modelFor(u.model).facing?' '+arrows[u.facing]:'')+
        (state?'・'+state:'')+(unitStatus(u)?'・'+unitStatus(u):'')+'</span></button>';
    }).join('')+'</div></section>';
}

export class BattleCamera {
  cell=0;
  private nextFit=false;
  private nextScale=1;
  private focusPoint:Point|undefined;

  reset(){this.cell=0;this.nextScale=1;this.focusPoint=undefined;this.nextFit=true;}
  overview(){this.reset();}
  zoom(direction:number){this.nextScale=direction>0?1.28:1/1.28;}
  focus(u:Unit,size:number){
    const at=cellsOf(u).filter(c=>c.layer===modelFor(u.model).layer).map(c=>c.at);
    const center=(values:number[])=>(Math.min(...values)+Math.max(...values)+1)/2;
    this.focusPoint=project(center(at.map(c=>c[0])),center(at.map(c=>c[1])),size);
  }

  read(root:HTMLElement):Point|undefined{
    const pane=root.querySelector('.battle-field .board-scroller'),board=pane?.querySelector('.board');
    if(!pane||!board||!this.cell)return;
    const viewport=pane.getBoundingClientRect(),map=board.getBoundingClientRect();
    return [(viewport.left+pane.clientLeft+pane.clientWidth/2-map.left)/this.cell,
      (viewport.top+pane.clientTop+pane.clientHeight/2-map.top)/this.cell];
  }

  restore(root:HTMLElement,size:number,previous:Point|undefined){
    const pane=root.querySelector<HTMLElement>('.battle-field .board-scroller');
    const frame=pane?.querySelector<HTMLElement>('.board-frame'),board=frame?.querySelector('.board');
    if(!pane||!frame||!board)return;
    // Include the artwork overhang reserved by the shared board frame.
    const fit=Math.max(1,Math.floor(Math.min((pane.clientWidth-2)/(2*size*screenX+1.20),
      (pane.clientHeight-2)/(2*size*screenY+2.73))));
    if(this.nextFit||!this.cell)this.cell=fit;
    else if(this.nextScale!==1)this.cell=Math.max(Math.min(this.cell,fit),Math.min(80,this.cell*this.nextScale));
    frame.style.setProperty('--cell',this.cell+'px');
    const point=this.focusPoint??(this.nextFit?undefined:previous)??project(size/2,size/2,size);
    const viewport=pane.getBoundingClientRect(),map=board.getBoundingClientRect();
    pane.scrollLeft+=map.left-viewport.left-pane.clientLeft+point[0]*this.cell-pane.clientWidth/2;
    pane.scrollTop+=map.top-viewport.top-pane.clientTop+point[1]*this.cell-pane.clientHeight/2;
    this.nextFit=false;
    this.nextScale=1;
    this.focusPoint=undefined;
  }
}
