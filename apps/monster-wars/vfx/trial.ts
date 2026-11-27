import { act, command } from '../../../src/games/monster-wars/battle';
import { layerName, name, unit, type Battle } from '../../../src/games/monster-wars/battle-state';
import { modelFor, weaponFor } from '../../../src/games/monster-wars/catalog';
import type { Cell, Direction, Layer, Side } from '../../../src/games/monster-wars/types';
import { renderBoard, type LayerView } from '../board';
import { btn, esc } from '../presentation';

type Spec={model:string;weapon:string;from:Cell;enemy:string;to:Cell;layer?:Layer;facing?:Direction};
export const trials:readonly Spec[]=[
  {model:'infantry',weapon:'rifle',from:[6,8],enemy:'K01',to:[7,6]},
  {model:'tank',weapon:'tank',from:[6,8],enemy:'K03',to:[7,5]},
  {model:'aa',weapon:'aa',from:[6,8],enemy:'K04',to:[7,6],layer:'air'},
  {model:'helicopter',weapon:'helicopter',from:[6,8],enemy:'K03',to:[7,6]},
  {model:'helicopter',weapon:'helicopter',from:[6,8],enemy:'K04',to:[7,6],layer:'air'},
  {model:'lightArt',weapon:'lightArt',from:[5,8],enemy:'K03',to:[7,5]},
  {model:'K06',weapon:'charge',from:[6,6],enemy:'tank',to:[6,5]},
  {model:'K04',weapon:'dive',from:[6,6],enemy:'apc',to:[7,6]},
  {model:'K11',weapon:'lineRay',from:[5,7],enemy:'tank',to:[6,3]},
  {model:'K21',weapon:'headRay',from:[5,5],enemy:'helicopter',to:[6,2],layer:'air'},
];
export function trial(spec:Spec){
  const size=12,side:Side=spec.model.startsWith('K')?'enemy':'player',other=side==='enemy'?'player':'enemy';
  const shooter=unit({id:'demo-source',model:spec.model,at:spec.from,facing:spec.facing??0},side,1,100);
  shooter.main=true;
  const victims=[unit({id:'demo-target',model:spec.enemy,at:spec.to,facing:2},other,1,100)];
  if(spec.weapon==='lightArt')victims.push(unit({id:'demo-extra',model:'K03',at:[8,5],facing:2},other,1,100));
  if(spec.weapon==='lineRay')victims.push(unit({id:'demo-extra',model:'helicopter',at:spec.to,facing:2},other,1,100));
  const before:Battle={id:0,rules:3,mission:'MVP01',difficulty:'easy',size,terrain:Array(size*size).fill('plain'),
    units:[shooter,...victims],round:4,side,revision:0,spawned:[],log:[],stats:{}};
  const after=act(before,command(before,{type:'attack',id:shooter.id,weapon:spec.weapon,
    target:{at:spec.to,layer:spec.layer??'ground'}}));
  return {before,after};
}

export class VfxTrial {
  private index=0;
  shown:Battle|undefined;
  view:LayerView='both';
  private zoom=0;
  get scene(){return trial(trials[this.index]!);}
  select(value:string){const index=Number(value);if(trials[index]){this.index=index;this.shown=undefined;}}
  changeView(value:string){if(value==='ground'||value==='air'||value==='both')this.view=value;}
  changeZoom(value:string){this.zoom=Math.max(0,Math.min(4,this.zoom+Number(value)));}
  render(settings:string){
    const scene=this.scene,source=scene.before.units[0]!;
    const selected=trials[this.index]!;
    const fired=scene.after?.events?.find(event=>event.kind==='attack');
    const dim=Math.max(13,Math.floor(Math.min((innerWidth*.65-36)/19,(innerHeight-130)/13)))+this.zoom*8;
    const board=renderBoard(this.shown??scene.before,this.view,dim,source.id,false,{moves:new Set(),targets:new Set(),route:[],area:[]});
    const choices=trials.map((spec,i)=>{
      const attack=weaponFor(spec.model,spec.weapon).name;
      return btn(attack+(spec.weapon==='helicopter'?(spec.layer==='air'?'（空対空）':'（空対地）'):''),'vfx-select',String(i),false,i===this.index?'on':'');
    }).join('');
    return '<main class="battle-shell art-preview vfx-trial"><div class="battle-status"><strong>戦闘演出の試遊</strong>'+
      '<div class="actions">'+btn('−','zoom','-1',!this.zoom)+btn('＋','zoom','1',this.zoom===4)+btn('戻る','vfx-close')+'</div></div>'+
      '<section class="board-panel battle-field">'+board+'</section><aside class="intel panel"><h2>'+esc(name(source))+'</h2>'+
      settings+'<p>'+esc(weaponFor(selected.model,selected.weapon).name)+' ／ '+esc(layerName(fired?.sourceLayer??modelFor(source.model).layer))+' → '+
      (selected.layer==='air'?'空中':'地上')+'</p>'+btn('再生','vfx-play','',scene.after===null,'primary')+
      (!scene.after?'<p class="error">この攻撃を確定できません。</p>':'')+'</aside>'+
      '<section class="battle-toolbar"><div class="unit-list">'+choices+'</div><div class="actions">'+
      btn('両層','view-layer','both')+btn('地上表示','view-layer','ground')+btn('空中表示','view-layer','air')+
      '</div></section></main>';
  }
}
