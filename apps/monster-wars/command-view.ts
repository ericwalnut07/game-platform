import { campaignGroups, favoriteError, favoriteLimit, favoriteNameLimit, level, levelUpCost, meritRanks, rosterCost, rosterCosts, sortieError, available, key, validEntry, type Campaign } from '../../src/games/monster-wars/campaign';
import { equipment, equipmentFor, models, modelFor, weaponFor } from '../../src/games/monster-wars/catalog';
import { unit } from '../../src/games/monster-wars/battle-state';
import { movement } from '../../src/games/monster-wars/battle';
import { ceiling, debrief, missionFor, missionIds, missionTerrain, recommended } from '../../src/games/monster-wars/missions';
import type { Difficulty, RosterEntry } from '../../src/games/monster-wars/types';
import { portrait } from './art';
import { btn, esc, icons, meritCondition, weaponInfo } from './presentation';

const difficulties:readonly Difficulty[]=['easy','normal'];
const difficultyName=(d:Difficulty)=>d==='easy'?'Easy':'Normal';
const emptyEntry=(model:string):RosterEntry=>({model,weapons:[],equipment:[]});
export { emptyEntry };
const head=(title:string,actions:string,extra='')=>'<div class="command-head"><div><h1>'+title+'</h1>'+extra+'</div><nav>'+actions+'</nav></div>';
const commandOptions=()=>'<details class="command-options"><summary>オプション</summary>'+
  '<div class="command-menu">'+btn('書き出す','export')+'</div></details>';
const panel=(title:string,content:string,extra='',footer='')=>
  '<section class="command-panel '+extra+'"><h2>'+title+'</h2><div class="command-scroll">'+content+'</div>'+footer+'</section>';
function image(id:string,large=false){
  const src=portrait(id);
  return src?'<img class="'+(large?'inspect-art':'model-thumb')+'" src="'+esc(src)+'" alt="">':'<span>'+esc(icons[id]??'？')+'</span>';
}
function mapPreview(m:ReturnType<typeof missionFor>){
  const tiles=missionTerrain(m);
  return '<div class="map-preview" role="img" aria-label="戦場の地形図" style="--map-size:'+m.size+'">'+tiles.map(t=>'<i class="'+t+'" aria-hidden="true"></i>').join('')+'</div>'+
    '<div class="map-legend">'+(['plain','road','forest','rubble','building'] as const).map((terrain,i)=>
      '<small><i class="'+terrain+'"></i>'+['平地','道路','森林','瓦礫','建物'][i]+'</small>').join('')+'</div>';
}
export function missionsView(c:Campaign,id:string,d:Difficulty){
  const m=missionFor(id);
  const list=missionIds.map(candidate=>{
    const v=missionFor(candidate),wins=c.wins[key(candidate,d)]??0,open=available(c,candidate,d);
    return '<button type="button" class="mission '+(id===candidate?'on':'')+'" data-a="mission" data-value="'+esc(candidate)+'"'+(!open?' disabled':'')+'>'+
      esc(v.name)+'<small>推奨Lv '+recommended(v,d)+' ／ '+(!open?'未解禁':wins?'クリア済・再戦':'初回')+' ／ '+debrief(d,!wins)+' EXP</small></button>';
  }).join('');
  const actions=difficulties.map(value=>btn(difficultyName(value),'difficulty',value,false,d===value?'on':'')).join('')+btn('兵種育成','training')+btn('図鑑','open-book')+commandOptions();
  const limits='<p>推奨Lv '+recommended(m,d)+' ／ 編成上限 '+ceiling(m,d)+' ／ 最大 '+m.limit+'R</p>'+
    '<p>勝利条件　'+esc(m.briefing)+'</p><p>敗北条件　自軍全滅'+(m.goal==='defend'?'・施設破壊':'・制限ラウンド超過')+'</p>'+
    '<p>初回 '+debrief(d,true)+' EXP ／ 再挑戦 '+debrief(d,false)+' EXP</p>';
  return '<main class="command-screen compact-command-screen">'+head('作戦選択',actions)+
    '<div class="command-grid mission-grid">'+panel('作戦一覧',list)+panel(esc(m.name)+' ・ '+difficultyName(d),
      '<div class="mission-overview"><div class="mission-preview">'+mapPreview(m)+'</div><div>'+limits+'</div></div>','mission-detail',
      '<div class="command-footer">'+btn('編成へ進む','formation','',!available(c,id,d),'primary')+'</div>')+'</div></main>';
}
function preview(c:Campaign,entry:RosterEntry,index:number,l:number,roster=c.roster){
  return unit({id:'preview',model:entry.model,at:[0,0],facing:0},'player',l,100,{...c,roster},index);
}
const groups=campaignGroups;
const gearNames=(e:RosterEntry)=>[...e.weapons.map(id=>weaponFor(e.model,id).name),...e.equipment.map(id=>equipmentFor(id).name)].map(esc).join('・')||'標準装備';
function gearSlots(c:Campaign,entry:RosterEntry,which:'weapons'|'equipment',max:number){
  return Array.from({length:max},(_,i)=>{
    const allowed=c.open.filter(id=>(which==='weapons'?id.startsWith('W'):Object.hasOwn(equipment,id))&&
      validEntry(c,{...entry,[which]:[...entry[which].filter((_,j)=>i!==j),id]}));
    return '<label>'+(which==='weapons'?'武装':'追加装備')+' '+(i+1)+'<select data-change="gear" data-kind="'+which+'" data-index="'+i+'"><option value="">なし</option>'+
      allowed.map(id=>{
        const item=which==='equipment'?equipmentFor(id):weaponFor(entry.model,id);
        return '<option value="'+esc(id)+'"'+(entry[which][i]===id?' selected':'')+'>'+esc(item.name)+' ＋'+item.cost+'</option>';
      }).join('')+'</select></label>';
  }).join('');
}
function gearInfo(e:RosterEntry){
  return e.weapons.map(id=>'<p>'+weaponInfo(e.model,id)+' ／ COST '+(weaponFor(e.model,id).cost??0)+'</p>').join('')+
    e.equipment.map(id=>'<p><strong>'+esc(equipmentFor(id).name)+'</strong> '+esc(equipmentFor(id).description)+' ／ COST '+equipmentFor(id).cost+'</p>').join('');
}
export function formationView(c:Campaign,id:string,d:Difficulty,index:number,edit:RosterEntry|undefined,group:string){
  const m=missionFor(id),cap=ceiling(m,d),cost=rosterCost(c.roster),gate=sortieError(c,id,d),costs=rosterCosts(c.roster);
  const sum=(field:'base'|'duplicate'|'weapon'|'gear')=>costs.reduce((n,line)=>n+line[field],0);
  const filter='<label class="model-filter">兵種 <select data-change="model-group"><option value="">すべて</option>'+
    groups(c).map(g=>'<option'+(group===g?' selected':'')+'>'+esc(g)+'</option>').join('')+'</select></label>';
  const candidates=c.open.filter(model=>models[model]?.slots&&(!group||modelFor(model).group===group)).map(model=>{
    const def=modelFor(model),delta=rosterCost([...c.roster,emptyEntry(model)])-cost;
    return '<article class="formation-row">'+image(model)+'<div><strong>'+esc(def.name)+'</strong><small>'+esc(def.group)+' Lv'+level(c.levels[def.group]??0)+
      ' ／ 基本 '+def.cost+' ／ '+c.roster.filter(e=>e.model===model).length+'隊</small></div>'+
      btn('追加 ＋'+delta,'add',model)+'</article>';
  }).join('');
  const lines=c.roster.map((e,i)=>'<article class="formation-row '+(index===i?'chosen':'')+'">'+image(e.model)+'<div><button type="button" class="select-entry" data-a="edit" data-value="'+i+'" aria-pressed="'+(index===i)+'">'+
    esc(modelFor(e.model).name)+' <small>Lv'+level(c.levels[modelFor(e.model).group]??0)+' ／ COST '+costs[i]?.total+'</small></button><small>'+gearNames(e)+'</small></div>'+
    btn('外す','remove',String(i))+'</article>').join('');
  const original=c.roster[index],entry=edit??original;
  let inspection='<p class="muted">編成の部隊を選択してください。</p>';
  if(entry&&original){
    const def=modelFor(entry.model),l=level(c.levels[def.group]??0);
    const edited=c.roster.map((e,i)=>i===index?entry:e),afterCost=rosterCost(edited);
    const before=preview(c,original,index,l),after=preview(c,entry,index,l,edited);
    const uses=Object.keys({...before.capacity,...after.capacity}).map(weapon=>
      '<p>'+esc(weaponFor(entry.model,weapon).name)+' 使用回数 '+(before.capacity[weapon]??'–')+' → '+(after.capacity[weapon]??'–')+'</p>').join('');
    const stats=(u:ReturnType<typeof unit>)=>'HP '+u.maxHp+' ／ ATK '+u.atk+' ／ DEF '+def.def+' ／ MOV '+movement(u);
    const ranks=meritRanks(c,entry.model);
    inspection='<div class="formation-unit-summary">'+image(entry.model,true)+'<div><h3>'+esc(def.name)+' ・ '+esc(def.group)+' Lv'+l+
      '</h3><p>'+stats(before)+'</p></div></div>'+
      '<div class="gear">'+gearSlots(c,entry,'weapons',def.slots![0])+gearSlots(c,entry,'equipment',def.slots![1])+'</div>'+
      (edit?'<section class="gear-comparison"><h3>装備変更の比較</h3><p>変更後 '+stats(after)+'</p><p>編成COST '+cost+' → '+afterCost+
      ' ／ 残り '+(cap-afterCost)+'</p>'+uses+'<div class="gear-diff"><div><h3>現在</h3>'+ (gearInfo(original)||'<p>標準装備</p>')+
      '</div><div><h3>候補</h3>'+(gearInfo(entry)||'<p>標準装備</p>')+'</div></div></section>':'')+
      '<details><summary>武装・功績の詳細</summary>'+def.weapons.map(id=>'<p>'+weaponInfo(entry.model,id)+'</p>').join('')+gearInfo(original)+
      (def.merits??[]).map((merit,i)=>{
        const score=c.merits[entry.model]?.[merit.metric]??0,target=[1,3,6,10,15][ranks[i]??0];
        return '<p>'+esc(meritCondition(merit))+' ／ Lv'+ranks[i]+' ／ '+score+(target?' / '+target*merit.threshold:'（最大）')+'</p>';
      }).join('')+'</details>';
  }
  const gearActions=edit?'<div class="actions gear-actions">'+btn('装備変更を適用','apply-gear','',false,'primary')+
    btn('変更を取消','cancel-gear')+'</div>':'';
  const meter='<div class="formation-totals"><div class="cost-line">編成COST <strong data-cost="'+cost+'">'+cost+' / '+cap+'</strong> ／ 残り '+(cap-cost)+'</div>'+
    '<progress class="cost-gauge '+(cost>cap?'over':'')+'" aria-label="編成COST" value="'+Math.min(cost,cap)+'" max="'+cap+'"></progress>'+
    '<small class="cost-breakdown">基本 '+sum('base')+' ＋ 重複 '+sum('duplicate')+' ＋ 武装 '+sum('weapon')+' ＋ 装備 '+sum('gear')+'</small></div>';
  const actions=btn('戻る','missions')+btn('兵種育成','training',entry?modelFor(entry.model).group:'')+
    btn('お気に入り編成','favorites')+btn('配置へ','prepare','',!!gate,'primary')+commandOptions();
  return '<main class="command-screen compact-command-screen"><div class="command-head formation-head">'+
    '<div class="formation-heading"><h1>出撃編成</h1><small>'+esc(m.name)+' ・ '+difficultyName(d)+'</small></div>'+
    meter+'<nav>'+actions+'</nav></div>'+
    (gate?'<p class="error formation-gate">'+esc(gate)+'</p>':'')+'<div class="command-grid formation-grid">'+panel('編成に追加',filter+candidates)+
    panel('現在の編成',lines||'<p>編成が空です。</p>')+panel('装備・功績',inspection,'',gearActions)+'</div></main>';
}
export function trainingView(c:Campaign,selected:string){
  const list=groups(c).map(group=>{
    const l=level(c.levels[group]??0),cost=levelUpCost(c,group);
    const details=cost===undefined?'':c.open.filter(id=>models[id]?.slots&&modelFor(id).group===group).map(model=>{
      const pose={id:'growth',model,at:[0,0] as [number,number],facing:0 as const};
      const a=unit(pose,'player',l,100,c),b=unit(pose,'player',l+1,100,c);
      return '<p>'+esc(modelFor(model).name)+' ／ HP '+a.maxHp+' → '+b.maxHp+' ／ ATK '+a.atk+' → '+b.atk+'</p>';
    }).join('');
    return '<article class="training-unit'+(group===selected?' chosen':'')+'"><h3>'+esc(group)+' ・ Lv'+l+(cost===undefined?'':' → Lv'+(l+1))+'</h3>'+
      (cost===undefined?'<p>最大レベル</p>':'<p>必要 '+cost+' EXP'+(cost>c.xp?' ／ 経験値不足（あと '+(cost-c.xp)+'）':'')+'</p>'+
      btn('レベルアップ','level-up',group,cost>c.xp,'primary')+'<details'+(group===selected?' open':'')+'><summary>モデル別の成長</summary>'+details+'</details>')+'</article>';
  }).join('');
  return '<main class="command-screen">'+head('兵種育成',btn('育成を閉じる','close-training'),'<p>共通の未使用経験値 <strong>'+c.xp+' EXP</strong></p>')+
    '<div class="command-grid">'+panel('兵種ごとのレベル','<div class="training-list">'+list+'</div>')+'</div></main>';
}
export function favoritesView(c:Campaign,id:string,d:Difficulty){
  const slots=Array.from({length:favoriteLimit},(_,i)=>{
    const slot=i+1,f=c.favorites?.find(f=>f.slot===slot);
    const error=f?favoriteError(c,f.roster):'';
    const gate=f&&!error?sortieError({...c,roster:f.roster},id,d):error;
    return '<article class="favorite-slot" data-slot="'+slot+'"><h3>'+slot+'枠目'+(f?' ・ '+esc(f.name):' ・ 未登録')+'</h3>'+
      '<label>編成名<input type="text" maxlength="'+favoriteNameLimit+'" value="'+esc(f?.name??'')+'" autocomplete="off" placeholder="編成'+slot+'"></label>'+
      (f?'<p>'+f.roster.length+'隊'+(error?'':' ／ COST '+rosterCost(f.roster))+' ／ '+(gate?esc(gate):'出撃可能')+'</p>'+
      '<details><summary>編成内容</summary>'+f.roster.map(e=>'<p>'+esc(models[e.model]?.name??e.model)+' ／ '+(error?esc([...e.weapons,...e.equipment].join('・')):gearNames(e))+'</p>').join('')+'</details>':'')+
      '<div class="actions">'+(f?btn('呼び出し','favorite-load',String(slot),!!error)+btn('名前変更','favorite-rename',String(slot))+btn('削除','favorite-delete',String(slot)):'')+
      btn(f?'現在の編成で上書き':'現在の編成を登録','favorite-save',String(slot))+'</div></article>';
  }).join('');
  return '<main class="command-screen">'+head('お気に入り編成',btn('編成へ戻る','formation'))+'<div class="command-grid">'+panel('登録枠',slots)+'</div></main>';
}
