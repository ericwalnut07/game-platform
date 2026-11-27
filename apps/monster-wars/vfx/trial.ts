import { act, command, legalTargets } from '../../../src/games/monster-wars/battle';
import { layerName, name, unit, type Battle } from '../../../src/games/monster-wars/battle-state';
import { modelFor, weaponFor } from '../../../src/games/monster-wars/catalog';
import type { Cell, Direction, Layer, Side } from '../../../src/games/monster-wars/types';
import { renderBoard, type LayerView } from '../board';
import { btn, esc } from '../presentation';
import { weaponEffects } from './weapons';

type Spec={model:string;weapon:string;from:Cell;enemy:string;to:Cell;layer?:Layer;facing?:Direction;extra?:true};
const preview=(model:string,weapon:string,enemy='K03',to:Cell=[6,5],layer:Layer='ground',from:Cell=[6,8]):Spec=>
  ({model,weapon,from,enemy,to,layer,extra:true});
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
  preview('infantry','W01'),
  preview('apc','cannon'),
  preview('helicopter','W04','K04',[7,6],'air'),
  preview('sniper','sniper'),
  preview('sniper','W06','K21',[5,3],'air'),
  preview('heavy','heavy'),
  preview('tank','W09'),
  preview('tank','W11'),
  preview('infantry','W13','K11'),
  preview('aa','W14','K04',[7,6],'air'),
  preview('helicopter','W16','K21',[5,3],'air'),
  preview('heavyArt','heavyArt'),
  preview('infantry','W18','K03',[6,6]),
  preview('lightArt','W19'),
  preview('heavyArt','W20'),
  preview('infantry','W26','K01',[6,7]),
  preview('infantry','W30'),
  preview('K01','claw','infantry',[6,7]),
  preview('K03','shellClaw','apc',[6,7]),
  preview('K04','airClaw','helicopter',[6,7],'air'),
  preview('K06','gClaw','tank',[6,7]),
  preview('K21','stomp','tank',[6,4],'ground',[5,5]),
  preview('K21','sweepL','helicopter',[4,5],'air',[5,5]),
  preview('K21','sweepR','helicopter',[8,5],'air',[5,5]),
  preview('K11','ray','tank',[6,4],'ground',[5,7]),
  preview('K21','warningRay','helicopter',[6,2],'air',[5,5]),
  preview('repair','repair','tank',[6,7]),
  preview('apc','W46','tank',[6,7]),
  preview('supply','supply','infantry',[6,7]),
  preview('apc','W47','infantry',[6,7]),
  preview('infantry','W45','sniper',[6,7]),
];
export function trial(spec:Spec){
  const size=12,side:Side=spec.model.startsWith('K')?'enemy':'player',other=side==='enemy'?'player':'enemy';
  const shooter=unit({id:'demo-source',model:spec.model,at:spec.from,facing:spec.facing??0},side,1,100);
  shooter.main=true;
  const weapon=weaponFor(spec.model,spec.weapon);
  if(!shooter.weapons.includes(spec.weapon)){
    shooter.weapons.push(spec.weapon);
    if(weapon.uses!==undefined)shooter.ammo[spec.weapon]=shooter.capacity[spec.weapon]=weapon.uses;
  }
  const receiver=unit({id:'demo-target',model:spec.enemy,at:spec.to,facing:2},weapon.kind?side:other,1,100);
  if(weapon.kind==='repair'||weapon.kind==='medic')receiver.hp=Math.floor(receiver.hp/2);
  if(weapon.kind==='supply'){
    receiver.weapons.push('W01');
    receiver.capacity.W01=weaponFor(receiver.model,'W01').uses!;
    receiver.ammo.W01=0;
  }
  const victims=[receiver];
  if(spec.weapon==='lightArt')victims.push(unit({id:'demo-extra',model:'K03',at:[8,5],facing:2},other,1,100));
  if(spec.weapon==='lineRay')victims.push(unit({id:'demo-extra',model:'helicopter',at:spec.to,facing:2},other,1,100));
  const before:Battle={id:0,rules:3,mission:'MVP01',difficulty:'easy',size,terrain:Array(size*size).fill('plain'),
    units:[shooter,...victims],round:4,side,revision:0,spawned:[],log:[],stats:{}};
  const layer=spec.layer??'ground';
  const legal=spec.extra?legalTargets(before,shooter,spec.weapon).filter(c=>c.target.layer===layer):[];
  const target=legal.find(c=>String(c.target.at)===String(spec.to))?.target??legal[0]?.target??{at:spec.to,layer};
  const fire={type:'attack',id:shooter.id,weapon:spec.weapon,target} as const;
  const after=act(before,command(before,fire));
  if(after?.warning){
    const ready={...before,round:after.warning.due,warning:after.warning};
    return {before:ready,after:act(ready,command(ready,fire)),warning:{before,after}};
  }
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
      const route=spec.weapon==='helicopter'?(spec.layer==='air'?'（空対空）':'（空対地）'):'';
      const pattern=weaponEffects[spec.weapon]?.pattern??'';
      return '<option value="'+i+'" data-weapon="'+esc(spec.weapon)+'"'+(i===this.index?' selected':'')+'>'+
        esc(pattern+' '+attack+route)+'</option>';
    }).join('');
    return '<main class="battle-shell art-preview vfx-trial"><div class="battle-status"><strong>戦闘演出の試遊</strong>'+
      '<div class="actions">'+btn('−','zoom','-1',!this.zoom)+btn('＋','zoom','1',this.zoom===4)+btn('戻る','vfx-close')+'</div></div>'+
      '<section class="board-panel battle-field">'+board+'</section><aside class="intel panel"><h2>'+esc(name(source))+'</h2>'+
      settings+'<p>'+esc(weaponFor(selected.model,selected.weapon).name)+' ／ '+esc(layerName(fired?.sourceLayer??modelFor(source.model).layer))+' → '+
      esc(layerName(fired?.layer??selected.layer??'ground'))+'</p>'+btn('再生','vfx-play','',scene.after===null,'primary')+
      (scene.warning?btn('攻撃予告を再生','vfx-warning'):'')+
      (!scene.after?'<p class="error">この攻撃を確定できません。</p>':'')+'</aside>'+
      '<section class="battle-toolbar"><label class="vfx-choice">武装 <select data-vfx-trial>'+choices+'</select></label><div class="actions">'+
      btn('両層','view-layer','both')+btn('地上表示','view-layer','ground')+btn('空中表示','view-layer','air')+
      '</div></section></main>';
  }
}
