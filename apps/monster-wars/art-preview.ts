import { name, unit, type Battle } from '../../src/games/monster-wars/battle-state';
import { modelFor } from '../../src/games/monster-wars/catalog';
import { cellsOf, occupied, placement, same } from '../../src/games/monster-wars/grid';
import type { Cell, Direction, Side } from '../../src/games/monster-wars/types';
import type { DisplayTerrain } from './art';
import { renderBoard, type LayerView } from './board';
import { arrows, screenFacing } from './projection';
import { btn, esc } from './presentation';

const size=12;
const scenery:DisplayTerrain[]=Array.from({length:size*size},(_,i)=>{
  const x=i%size,y=Math.floor(i/size);
  if(x<=2&&y<=3)return 'mountain';
  if(x<=3&&y>=9)return 'water';
  if(y===6||x===5)return 'road';
  if(x>=8&&y>=8)return 'forest';
  if(x>=8&&y<=1)return 'rubble';
  if(x===7&&y>=8&&y<=9)return 'building';
  return x===4&&y===8?'defensive_position':'plain';
});
const actors:[string,Cell,Side,Direction][]=[
  ['infantry',[8,9],'player',0],['helicopter',[8,9],'player',0],
  ['tank',[4,8],'player',0],['heavy',[3,5],'player',0],['facility',[9,9],'player',0],
  ['K06',[4,3],'enemy',0],['K11',[7,5],'enemy',0],['K21',[7,1],'enemy',0],
  ['apc',[3,1],'player',1],['aa',[4,1],'player',1],['lightArt',[6,0],'player',1],
  ['heavyArt',[2,7],'player',0],['repair',[6,9],'player',0],['supply',[1,5],'player',1],['sniper',[5,4],'player',1],
  ['K01',[11,4],'enemy',0],['K03',[11,6],'enemy',2],['K04',[9,5],'enemy',1],
];
export class ArtPreview {
  private readonly board:Battle={
    id:0,mission:'MVP01',difficulty:'easy',size,terrain:Array(size*size).fill('plain'),side:'player',round:1,revision:0,spawned:[],log:[],stats:{},
    units:actors.map(([model,at,side,facing])=>unit({id:model,model,at,facing},side,1,100)),
  };
  private selected='heavy';
  private view:LayerView='both';
  private zoom=0;
  handle(action:string|undefined,value:string){
    if(action==='preview-unit'){this.selected=value;return;}
    if(action==='view-layer'){this.view=value as LayerView;return;}
    if(action==='zoom'){this.zoom=Math.max(0,Math.min(4,this.zoom+Number(value)));return;}
    const active=this.board.units.find(u=>u.id===this.selected);
    if(action==='preview-face'&&active&&modelFor(active.model).facing){
      const facing=Number(value) as Direction;
      if(placement(this.board,active.model,{at:active.at,facing},occupied(this.board,active.id)))active.facing=facing;
      return;
    }
    if(action==='map'){
      const at=value.split(',').map(Number) as Cell;
      const options=this.board.units.filter(u=>cellsOf(u).some(c=>same(c.at,at)&&(this.view==='both'||c.layer===this.view)));
      const next=options[(options.findIndex(u=>u.id===this.selected)+1)%options.length];
      if(next)this.selected=next.id;
    }
  }
  render(){
    const active=this.board.units.find(u=>u.id===this.selected)!;
    const dim=Math.max(16,Math.floor(Math.min((innerWidth*.65-36)/19,(innerHeight-150)/13)))+this.zoom*8;
    const selected=active.id;
    const board=renderBoard(this.board,this.view,dim,selected,false,{
      moves:new Set(['3,7','4,7','3,8']),targets:new Set(['8,8','9,8']),route:[[4,7]],area:[[8,8],[9,8]],
    },scenery);
    return '<main class="battle-shell art-preview"><div class="battle-status"><strong>描画検証マップ</strong><div class="actions">'+
      btn('−','zoom','-1',!this.zoom)+btn('＋','zoom','1',this.zoom===4)+btn('戻る','preview-close')+'</div></div>'+
      '<section class="board-panel">'+board+'</section><aside class="intel panel"><h2>'+esc(name(active))+'</h2><p>HP '+active.hp+'/'+active.maxHp+'</p>'+
      (modelFor(active.model).facing?'<p>向き '+screenFacing(active.facing)+'</p>'+arrows.map((arrow,d)=>
        btn(arrow+' '+screenFacing(d as Direction),'preview-face',String(d),!placement(this.board,active.model,{at:active.at,facing:d as Direction},occupied(this.board,active.id)),active.facing===d?'on':'')).join(''):'')+
      '<p>青緑は移動、橙は攻撃の表示見本です。</p></aside><section class="battle-toolbar"><div class="unit-list">'+
      this.board.units.map(u=>btn(name(u),'preview-unit',u.id,false,u.id===selected?'on':'')).join('')+
      '</div><div class="actions">'+(['both','ground','air'] as const).map(l=>btn(l==='both'?'両層':l==='ground'?'地上表示':'空中表示','view-layer',l,false,l===this.view?'on':'')).join('')+
      '</div></section></main>';
  }
}
