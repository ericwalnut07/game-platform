import { meritRanksGained, type MeritChange } from '../../src/games/monster-wars/battle-report';
import type { Battle } from '../../src/games/monster-wars/battle-state';
import { available, type Campaign } from '../../src/games/monster-wars/campaign';
import { compatible, equipment, modelFor, models, weapons } from '../../src/games/monster-wars/catalog';
import { debrief, missionFor } from '../../src/games/monster-wars/missions';
import { portrait } from './art';
import { btn, esc, meritMetricName, roles, weaponInfo } from './presentation';

const panel=(title:string,body:string,kind:string)=>'<section class="command-panel '+kind+'"><h2>'+title+
  '</h2><div class="command-scroll">'+body+'</div></section>';

function rankEffect(model:string,index:number,rank:number){
  const {effect,amount}=modelFor(model).merits![index]!;
  if(model==='supply'&&index===0)return '固定補給装置の使用回数 ＋'+Math.floor(rank/2);
  if(model==='supply'&&index===2)return '固定補給装置の使用回数 ＋'+rank;
  if(model==='repair'&&effect!=='HP')return '修理量 ＋'+amount*rank+'%';
  if(effect==='正面軽減')return '正面被ダメージ −'+amount*rank+'%';
  return effect+(effect==='ATK'||effect==='HP'?'':'ダメージ')+' ＋'+amount*rank+'%';
}

function meritCards(changes:MeritChange[]){
  const groups=new Map<string,MeritChange[]>();
  for(const change of changes){
    const lines=groups.get(change.model)??[];
    lines.push(change);groups.set(change.model,lines);
  }
  return [...groups].map(([model,lines])=>'<article class="result-entry"><h3>'+esc(modelFor(model).name)+'</h3>'+lines.map(change=>{
    const merit=modelFor(model).merits![change.index]!;
    const {from,to}=meritRanksGained(change);
    return '<div class="result-merit"><span>'+esc(meritMetricName(merit.metric))+' <small>('+esc(merit.effect)+')</small></span>'+
      '<span><strong>＋'+(change.after-change.before)+'</strong> <small>'+change.before+' → '+change.after+'</small></span>'+
      (to>from?'<p class="rank-gain"><strong>達成 Lv'+from+' → '+to+'</strong> '+esc(rankEffect(model,change.index,to))+'</p>':'')+'</div>';
  }).join('')+'</article>').join('');
}

function unlockCard(kind:string,name:string,body:string){
  return '<article class="result-entry"><small>'+kind+'</small><h3>'+esc(name)+'</h3>'+body+'</article>';
}
function modelCard(id:string,enemy=false){
  const m=modelFor(id), image=portrait(id);
  return unlockCard(enemy?'敵軍図鑑':'モデル',m.name,
    (image?'<img class="unlock-art" src="'+esc(image)+'" alt="">':'')+
    '<p>'+esc(m.group)+' ／ '+esc(roles[id]??'')+'</p>'+
    (!enemy?'<p>HP '+m.hp+' ／ ATK '+m.atk+' ／ DEF '+m.def+' ／ MOV '+m.move+' ／ COST '+m.cost+'</p>':'')+
    btn('図鑑で見る','result-model',(enemy?'enemy':'ally')+','+id));
}
function itemCard(id:string,c:Campaign){
  if(Object.hasOwn(models,id))return modelCard(id);
  if(Object.hasOwn(equipment,id)){
    const item=equipment[id]!;
    return unlockCard('追加装備',item.name,'<p>'+esc(item.description)+' ／ COST '+item.cost+'</p>');
  }
  const w=weapons[id]!;
  const eligible=c.open.filter(model=>Object.hasOwn(models,model)&&compatible(model,id));
  const detail=eligible.length?eligible.map(model=>'<p>'+esc(modelFor(model).name)+' ／ '+weaponInfo(model,id)+'</p>').join(''):weaponInfo('',id);
  return unlockCard('武装',w.name,'<details><summary>対応モデル・性能 ／ COST '+(w.cost??0)+'</summary>'+detail+'</details>');
}

export function resultView(b:Battle,c:Campaign){
  const r=b.report,m=missionFor(b.mission,b.rules),xp=r?r.xpAfter-r.xpBefore:c.receipts[b.id]??0;
  // Old completed saves contain the award receipt but omit the historical balances and unlock delta.
  const first=r?r.clear==='first':xp===debrief(b.difficulty,true);
  const clear=b.result==='win'?(first?'初回クリア':'再挑戦クリア'):'';
  const title=b.result==='win'?'作戦成功':b.result==='retreat'?'撤退':'作戦失敗';
  const experience='<p class="result-xp"><strong>＋'+xp+'</strong> EXP</p>'+
    (clear?'<p>'+ (first?'初回クリア報酬':'再挑戦報酬')+'</p>':'')+
    '<dl><dt>確定前の未使用EXP</dt><dd>'+(r?.xpBefore??'—')+'</dd><dt>確定後の未使用EXP</dt><dd>'+(r?.xpAfter??'—')+'</dd></dl>'+
    (!r?'<small>このセーブには確定時の残高の記録がありません。</small>':'');
  const unlocks=r?[
    ...r.newGroups.map(group=>unlockCard('兵種',group,'<p>'+esc(r.newItems.filter(id=>models[id]?.group===group).map(id=>modelFor(id).name).join('・'))+'</p>')),
    ...r.newItems.map(id=>itemCard(id,c)),
    ...r.newMissions.map(id=>unlockCard('ミッション',missionFor(id).name,'<p>'+esc(missionFor(id).briefing)+'</p>')),
    ...r.newEnemies.map(id=>modelCard(id,true)),
  ].join(''):'';
  return '<main class="command-screen compact-command-screen result-screen"><div class="command-head result-head">'+
    '<h1 class="'+(b.result==='win'?'':'error')+'">'+title+'</h1><div><strong>'+esc(m.name)+'</strong> ／ '+(b.difficulty==='easy'?'Easy':'Normal')+
    ' ／ '+(b.result==='win'?'クリア':'終了')+' R'+b.round+(clear?' ／ '+clear:'')+'</div><small>'+esc(b.reason??'')+'</small></div>'+
    '<div class="command-grid result-grid">'+panel('獲得経験値',experience,'result-experience')+
    panel('獲得功績',meritCards(r?.merits??[]),'result-merits')+panel('新規解禁',unlocks,'result-unlocks')+'</div>'+
    '<nav class="result-actions" aria-label="戦闘結果の操作">'+btn('兵種育成','training')+btn('図鑑','open-book')+
    btn('セーブを書き出す','export')+(available(c,b.mission,b.difficulty)?btn('再挑戦','replay-result'):'')+
    btn('司令部に戻る','debrief','',false,'primary')+'</nav></main>';
}
