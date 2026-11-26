import './style.css';
import { weaponFor, modelFor } from '../../src/games/monster-wars/catalog';
import { available, award, changeFavorite, freshCampaign, levelUp, sortieError, validEntry } from '../../src/games/monster-wars/campaign';
import { createBattle, deploy, layerName, name, playerUnits, type Battle, type Order, type Target, type Unit } from '../../src/games/monster-wars/battle-state';
import { act, autoAction, command, enemyAction, legalTargets, movement, paths, predictMove, type Action } from '../../src/games/monster-wars/battle';
import { cellsOf, dirs, poseKey, same, type Step } from '../../src/games/monster-wars/grid';
import { missionIds, missionFor } from '../../src/games/monster-wars/missions';
import { decode, encode, upgradeSave, type Envelope, type Progress } from '../../src/games/monster-wars/save';
import { discover } from '../../src/games/monster-wars/encyclopedia';
import { effectiveDefense } from '../../src/games/monster-wars/attack';
import { arrows, btn, esc, encyclopediaPage, statusNames, unitDetails } from './presentation';
import { ArtPreview } from './art-preview';
import { installArt } from './art';
import { installPan, renderBoard, type LayerView } from './board';
import { BattleCamera, hpGauge, roster, unitLayer, unitStatus } from './battle-view';
import { emptyEntry, favoritesView, formationView, missionsView, trainingView } from './command-view';
import { openStorage } from './storage';
import type { Cell, Difficulty, Direction, Layer, Pose, RosterEntry } from '../../src/games/monster-wars/types';

installArt();
const root=document.querySelector<HTMLElement>('#app')!;
const camera=new BattleCamera();
const collapsed={left:false,right:false};
const listScroll=new Map<string,number>();
let logFollow=true, optionsOpen=false, conditionsOpen=false;
let intelJump:'top'|'choice'|undefined;
const file=document.querySelector<HTMLInputElement>('#import')!;
let store:Awaited<ReturnType<typeof openStorage>>|undefined;
let saved:Envelope|undefined, backup:Envelope|undefined, draft:Battle|undefined, difficulty:Difficulty='easy', mission=missionIds[0];
let artPreview:ArtPreview|undefined;
let screen='title', message='', busy=false, corrupt=false, temporary=false, blocked=false, retrySave:(()=>void)|undefined;
let selected='', weapon='', mode='', planned:Pose|undefined, target:Target|undefined, layer:Layer='ground', gear=-1;
let orderPanel=false, orderIds=new Set<string>(), pickOrder:'focus'|'guard'|undefined;
let scheduled=false;
let trainingFrom='base', trainingGroup='', modelFilter='';
const commandScroll=new Map<string,number>();
let layerView:LayerView='both', detail=false, inspectCell:Cell|undefined;
let bookFrom='base', bookTab:'ally'|'enemy'='ally', bookModel='', draftGear:RosterEntry|undefined;
installPan(root);
const campaign=()=>saved!.payload.campaign;
const active=()=>saved?.payload.battle;
const activeUnit=(b:Battle)=>b.units.find(v=>v.id===selected&&v.hp>0);
const error=(e:string)=>{message=e;render();};
function clearChoice(){pickOrder=undefined;mode='';weapon='';planned=undefined;target=undefined;}
function selectUnit(u:Unit,view?:Layer){
  selected=u.id;layer=view??modelFor(u.model).layer;detail=false;inspectCell=undefined;
  intelJump='top';clearChoice();
}
function chooseAim(next:Target){
  target=next;layer=next.layer;
  if(layerView!=='both')layerView=layer;
  intelJump='choice';
}
function resetBattleView(){
  camera.reset();listScroll.clear();logFollow=true;optionsOpen=false;conditionsOpen=false;
}
async function save(payload:Progress,replace=false){
  if(busy)return false;
  busy=true;
  try{
    const id=saved?.saveId??globalThis.crypto?.randomUUID?.()??'mw-'+Date.now()+'-'+Math.random();
    const next=encode(payload,id,saved);
    decode(next);
    if(temporary)backup=saved;
    else if(store){await store.save(next,saved,replace);if(saved)backup=saved;}
    else throw Error('端末保存を利用できません');
    saved=next;corrupt=false;blocked=false;retrySave=undefined;message='';
    return true;
  }catch(e){message=(e as Error).message;blocked=true;retrySave=()=>{void save(payload,replace).then(ok=>{
      if(ok && screen==='battle'&&payload.battle?.result)screen='result';
      else if(ok && screen==='setup'&&payload.battle){draft=undefined;screen='battle';}
      else if(ok && screen==='title')screen=payload.battle?'battle':'base';
      render();
    });};return false;}
  finally{busy=false;}
}
function changeRoster(change:(roster:RosterEntry[])=>void){
  const c=campaign(),roster=structuredClone(c.roster);
  change(roster);
  if(roster.every(e=>validEntry(c,e)))void save({campaign:{...c,roster},battle:active()}).then(render);
}
async function battleAction(action:Action){
  const b=active();
  if(!b||busy||blocked)return;
  const next=act(b,command(b,action));
  if(!next){error('現在の手番・射線・行動権では実行できません');return;}
  const discovered=discover(campaign(),next.events??[]);
  const c=next.result==='win'?award(discovered,next.mission,next.difficulty,next.id,next.stats):discovered;
  if(await save({campaign:c,battle:next})){
    clearChoice();
    if(['move','attack','watch','guard','wait'].includes(action.type))intelJump='top';
    if(next.result)screen='result';
    render();
    root.dispatchEvent(new CustomEvent('battle-presentation',{detail:{id:next.id,revision:next.revision,events:next.events??[]}}));
  }else render();
}
function schedule(b:Battle){
  if(scheduled||busy||blocked||b.side!=='enemy'&&!b.automation||b.result)return;
  scheduled=true;
  setTimeout(()=>{
    scheduled=false;
    if(screen==='battle'&&active()===b&&!blocked&&!busy)void battleAction(b.automation?autoAction(b):enemyAction(b));
  },60);
}
function exportSave(e=saved){
  if(!e)return;
  const a=document.createElement('a'), url=URL.createObjectURL(new Blob([JSON.stringify(e,null,2)],{type:'application/json'}));
  a.href=url;a.download='monster-wars-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const status=(text:string)=>'<p class="notice" role="status">'+esc(text)+'</p>';
function titlePage(){
  return '<main class="title"><h1>モンスターウォーズ</h1><p class="muted">地球防衛軍　作戦司令部</p><section class="panel"><h2>作戦開始</h2><div class="actions">'+
    (saved?btn(active()&&!active()?.result?'戦闘を再開':'作戦司令部','continue','',false,'primary'):
      btn(store?'新規開始':'一時プレイを開始','new','',corrupt,'primary'))+
    (saved?btn('セーブを書き出す','export'):'' )+btn('セーブを読み込む','import')+btn('描画検証マップ','preview-open')+
    (saved?btn('図鑑','open-book'):'')+(backup?btn('直前のセーブを復元','restore'):'' )+'</div>'+
    (corrupt?'<p class="error">現在のセーブを確認できません。直前のセーブまたはJSONから復元できます。</p>':'')+
    (!store?'<p class="error">端末への自動保存を利用できません。一時プレイの進行はJSONで保管できます。</p>':'')+
    '</section></main>';
}
function renderBattle(b:Battle,setup:boolean){
  const u=activeUnit(b),own=!!u&&u.side==='player'&&u.model!=='facility',controllable=b.side==='player'&&!busy&&!blocked&&!b.automation,ready=own&&controllable;
  const reachable=ready&&mode==='move'?paths(b,u!):new Map<string,Step[]>();
  const legal=ready&&mode==='attack'&&u&&weapon?legalTargets(b,u,weapon):[];
  const plannedPath=planned?reachable.get(poseKey(planned)):undefined;
  const forecast=u&&plannedPath?predictMove(b,u,plannedPath):null;
  const selectedAttack=target?legal.find(a=>a.target.layer===target!.layer&&a.target.ammo===target!.ammo&&same(a.target.at,target!.at)):undefined;
  const route=plannedPath?.map((p:Pose)=>p.at)??[];
  const board=renderBoard(b,layerView,camera.cell||16,u?.id,setup,{
    moves:new Set([...reachable.keys()].map(k=>k.split(':')[0]!)),targets:new Set(legal.map(a=>String(a.target.at))),
    route,area:selectedAttack?.plan.area??[],...(selectedAttack?{origin:selectedAttack.plan.origin}:{}),
  });
  const allies=b.units.filter(v=>v.side==='player'&&v.hp>0),enemies=b.units.filter(v=>v.side==='enemy'&&v.hp>0);
  const unitMeta=u?'<p class="muted">'+(own?'移動 '+(u.move?'可':'済')+' ／ 主行動 '+(u.main?'可':'済')+' ／ '+(u.automatic?'オート':'手動'):(u.side==='enemy'?'敵軍':'防衛対象'))+
    (unitStatus(u)?' ／ '+unitStatus(u):'')+'</p><p class="unit-values">ATK '+u.atk+' ／ DEF '+effectiveDefense(u)+
    ' ／ MOV '+(modelFor(u.model).move?movement(u):0)+'</p>':'';
  const actionPanel=u?'<section class="unit-info"><h2>'+esc(name(u))+'</h2><p>HP '+u.hp+'/'+u.maxHp+' ／ '+unitLayer(u)+' '+(modelFor(u.model).facing?arrows[u.facing]:'')+'</p>'+hpGauge(u)+
    (setup&&own?'<p>移動先を出撃区画から選択</p><div class="actions">'+(modelFor(u.model).facing?dirs.map(d=>btn(arrows[d],'deployface',String(d),false,u.facing===d?'on':'')).join(''):'')+'</div>'+unitMeta:
      ready?'<nav class="tactical-actions">'+btn('移動','move','',!u.move,mode==='move'?'on':'')+btn('防御','guard','',!u.main)+btn('待機','wait','',!u.main&&!u.move)+btn('迎撃','watch','',!u.main,mode==='watch'?'on':'')+'</nav>'+
      unitMeta+'<div class="stack">'+u.weapons.filter(id=>mode!=='watch'||weaponFor(u.model,id).overwatch).map(id=>{
        const w=weaponFor(u.model,id),ammo=u.ammo[id];
        return btn((mode==='watch'?'迎撃・':'')+w.name+'　'+w.range.join('–')+' '+w.layers.map(layerName).join('/')+'　'+(ammo===undefined?'∞':ammo+'/'+u.capacity[id]),'weapon',id,!u.main||ammo===0,weapon===id?'on':'');
      }).join('')+'</div>':unitMeta+(u.side==='enemy'&&u.weapons.length?'<p class="muted">'+u.weapons.map(id=>esc(weaponFor(u.model,id).name)).join(' ／ ')+'</p>':''))+
      btn(detail?'詳細を閉じる':'詳細を開く','detail')+'</section>':'';
  const validPoses=planned?dirs.filter(d=>reachable.has(poseKey({...planned!,facing:d}))):[];
  const targetList=mode==='attack'?(target?legal.filter(a=>same(a.target.at,target!.at)):legal.slice(0,30)):[];
  const choice=mode==='move'?(planned?
    '<p>目的地 '+planned.at.map(n=>n+1).join(',')+'　移動費 '+(plannedPath?.at(-1)?.cost??0)+'</p><div class="actions">'+validPoses.map(d=>btn(arrows[d],'face',String(d),false,planned?.facing===d?'on':'')).join('')+btn('移動を確定','confirmmove','',!plannedPath,'primary')+'</div>'+
    (forecast&&forecast.hp!==u?.hp?'<small>迎撃予測後のHP '+forecast.hp+'</small>':''):'<p>青緑のマスから目的地を選択</p>'):
    mode==='attack'?'<div class="actions">'+btn('地上','layer','ground',false,layer==='ground'?'on':'')+btn('空中','layer','air',false,layer==='air'?'on':'')+'</div>'+
    (selectedAttack?'<p>射撃起点 '+selectedAttack.plan.origin.map(n=>n+1).join(',')+' → '+target!.at.map(n=>n+1).join(',')+' '+layerName(target!.layer)+'</p>'+
    '<p class="muted">'+(selectedAttack.plan.weapon.directed==='cardinal'?'前方直線':selectedAttack.plan.weapon.directed==='front'?'前方・側方':selectedAttack.plan.weapon.shape==='cone'?'扇の方向制約':'全方向')+
    ' ／ '+(selectedAttack.plan.weapon.indirect?'間接':'直接')+' ／ '+(u?.ammo[weapon]===undefined?'消費なし':'消費1')+
    (selectedAttack.plan.weapon.status?' ／ '+statusNames[selectedAttack.plan.weapon.status]+'（生存時）':'')+'</p>'+
    selectedAttack.plan.hits.map(h=>{
      const victim=b.units.find(v=>v.id===h.id)!;
      return '<p>'+esc(name(victim))+' −'+h.damage+' ／ HP '+victim.hp+' → '+Math.max(0,victim.hp-h.damage)+' ／ 相性 '+h.affinity+'%'+(Object.keys(h.parts).length?'／部位 '+Object.entries(h.parts).map(([id,n])=>esc(modelFor(victim.model).parts!.find(p=>p.id===id)!.label)+' '+victim.parts[id]+' → '+Math.max(0,(victim.parts[id]??0)-n)).join('、'):'')+'</p>';}).join('')+
    (selectedAttack.plan.support?'<p>有効量 '+selectedAttack.plan.support.amount+(selectedAttack.plan.support.ammo?'／'+esc(weaponFor(b.units.find(v=>v.id===selectedAttack.plan.support!.id)!.model,selectedAttack.plan.support.ammo).name):'')+'</p>':'')+btn('実行を確定','confirmattack','',false,'primary'):'<p>'+ (legal.length?'オレンジのマスまたは候補を選択':'射程・射線・対象層を満たす対象がいません')+'</p>')+
    '<div class="tactical-list">'+targetList.map(a=>btn(layerName(a.target.layer)+' '+a.target.at.map(n=>n+1).join(',')+' '+(a.plan.support?.ammo?' 補給 '+weaponFor(b.units.find(v=>v.id===a.plan.support!.id)!.model,a.plan.support.ammo).name:a.plan.hits.map(h=>name(b.units.find(v=>v.id===h.id)!)).join('・')),'target',a.target.layer+','+a.target.at+','+(a.target.ammo??''))).join('')+'</div>':
    mode==='watch'&&weapon?btn('迎撃を確定','confirmwatch','',false,'primary'):'';
  const canOrder=!setup&&b.rules!==1&&controllable;
  const automate=canOrder&&playerUnits(b).some(v=>v.automatic&&(v.move||v.main));
  const pickedIds=playerUnits(b).filter(v=>orderIds.has(v.id)).map(v=>v.id);
  const picked=orderIds.size>0?pickedIds:own?[u!.id]:[];
  const orderText=(v:Unit)=>{
    const order=v.order;
    if(!order||order.kind==='free')return '自由行動';
    const objective=b.units.find(x=>x.id===order.target);
    return (order.kind==='focus'?'集中攻撃':'護衛')+'：'+(objective?name(objective):'対象消失');
  };
  const optionsForOrder=pickOrder?b.units.filter(v=>v.hp>0&&v.side===(pickOrder==='focus'?'enemy':'player')&&!picked.includes(v.id)):[];
  const controls=canOrder?'<section class="panel"><div class="actions">'+
    btn('全員オート','automode','all-on')+btn('全員マニュアル','automode','all-off')+btn('作戦指示','orders','',false,orderPanel?'on':'')+
    '</div>'+(own?'<p>'+esc(orderText(u!))+'</p>'+btn(u!.automatic?'マニュアルへ切替':'オートへ切替','automode',u!.automatic?'unit-off':'unit-on'):'')+
    (orderPanel?'<div class="unit-list">'+playerUnits(b).map(v=>btn(v.id+' '+name(v),'order-unit',v.id,false,orderIds.has(v.id)?'on':'')).join('')+'</div><div class="actions">'+
    btn('自由行動','set-order','free',!picked.length)+btn('集中攻撃','set-order','focus',!picked.length)+btn('護衛','set-order','guard',!picked.length)+'</div>'+
    (pickOrder?'<p>マップまたは一覧から対象を選択</p><div class="tactical-list">'+optionsForOrder.map(v=>btn(v.id+' '+name(v),'order-target',v.id)).join('')+'</div>':''):'')+'</section>':'';
  const m=missionFor(b.mission,b.rules),facility=b.units.find(v=>v.model==='facility');
  const enemyLeft=enemies.length;
  const waiting=m.waves.filter(w=>!b.spawned.includes(w.id)&&(w.required||m.goal==='defend'&&(b.rules??3)>=3)).length;
  const inspect=inspectCell?b.units.filter(v=>v.hp>0).flatMap(v=>cellsOf(v).filter(c=>same(c.at,inspectCell!)).map(c=>
    btn(layerName(c.layer)+' '+name(v),'inspect-unit',v.id+','+c.layer))):[];
  const panelToggle=(side:'left'|'right',label:string)=>'<button type="button" data-a="panel" data-value="'+side+
    '" aria-expanded="'+!collapsed[side]+'" aria-label="'+label+(collapsed[side]?'を開く':'を折りたたむ')+'">'+label+'</button>';
  const layerButtons=(['both','ground','air'] as const).map(l=>
    btn(l==='both'?'両層':l==='ground'?'地上表示':'空中表示','view-layer',l,false,l===layerView?'on':'')).join('');
  const saveOptions=(saved?btn('書き出す','export'):'')+
    (setup?btn('編成に戻る','abortsetup'):btn('撤退','retreat','',busy||blocked||!!b.automation));
  const terms=esc(m.briefing)+(m.goal==='defend'?' ｜ 施設破壊または自軍全滅で敗北':' ｜ 自軍全滅で敗北');
  const log=b.log.length?'<ol>'+b.log.map(line=>'<li>'+esc(line)+'</li>').join('')+'</ol>':'<p class="muted">出撃後に行動を記録します</p>';
  return '<main class="battle-shell battle-workspace'+(collapsed.left?' fold-left':'')+(collapsed.right?' fold-right':'')+
    '"><section class="battle-status" aria-label="ミッション情報"><div class="mission-strip"><strong>'+esc(m.name)+'　'+
    (setup?'出撃配置':'R'+b.round+' / '+m.limit)+'</strong><span>'+(b.side==='player'?'自軍':'敵軍')+'ターン'+
    (facility?' ／ 施設HP '+facility.hp+'/'+facility.maxHp:'')+' ／ 残敵 '+enemyLeft+' ／ 予定増援 '+waiting+'</span></div>'+
    '<div class="mission-tools">'+panelToggle('left','自軍')+panelToggle('right','敵軍')+
    '<details name="battle-menu" data-menu="conditions"'+(conditionsOpen?' open':'')+'><summary>勝敗条件</summary><div class="battle-popover">'+terms+'</div></details>'+
    btn('俯瞰','overview')+btn('−','zoom','-1')+btn('＋','zoom','1')+
    '<details name="battle-menu" data-menu="options"'+(optionsOpen?' open':'')+'><summary>オプション</summary><div class="battle-popover">'+saveOptions+'</div></details></div></section>'+
    (collapsed.left?'':'<aside class="battle-sidebar allied-sidebar">'+roster('自軍',allies,selected,controllable?playerUnits(b).filter(v=>v.move||v.main).length:0)+
      '<section class="battle-log"><h2>行動ログ</h2><div class="log-scroll" data-scroll="log">'+log+'</div></section></aside>')+
    '<section class="board-panel battle-field" aria-label="戦闘マップ">'+board+
      (message||blocked?'<div class="battle-notice" role="status">'+esc(message)+(blocked?btn('保存を再試行','retry')+btn('再読み込み','reload'):'')+'</div>':'')+
    '</section>'+
    (collapsed.right?'':'<aside class="battle-sidebar opposing-sidebar">'+roster('敵軍',enemies,selected)+
      '<div class="intel battle-intel" data-scroll="intel">'+
      (b.warning?'<p class="error">敵軍R'+b.warning.due+'に光線発動予定。頭部・胸部破壊で中断</p>':'')+
      (inspect.length?'<div class="actions" aria-label="同座標の部隊">'+inspect.join('')+'</div>':'')+
      actionPanel+(choice?'<section class="battle-choice">'+choice+btn('選択を取り消す','cancel-choice')+'</section>':'')+
      (detail&&u?unitDetails(b,u):'')+controls+
      (b.rules===1?'<p class="muted">初回試遊版の戦闘を再開しています</p>':b.rules===2?'<p class="muted">第1回調整版の戦闘を再開しています</p>':'')+
      '</div>'+
      '<div class="battle-commands"><div class="layer-commands">'+layerButtons+'</div><div class="primary-commands">'+
      (setup?btn('出撃','launch','',false,'primary'):
        btn('オート行動実行','auto-run','',!automate)+btn(b.automation?'オート行動中':b.side==='enemy'?'敵軍行動中':'ターン終了','end','',!controllable,'primary'))+
      '</div></div></aside>')+'</main>';

}
function resultPage(b:Battle){
  const c=campaign(), receipt=c.receipts[b.id]??0, next=missionIds[missionIds.indexOf(b.mission)+1];
  return '<main class="title"><h1>'+ (b.result==='win'?'作戦成功':b.result==='retreat'?'撤退':'作戦失敗')+'</h1><p>'+esc(b.reason)+'</p><section class="panel"><h2>戦闘結果</h2><p>獲得 '+receipt+' EXP ／ R'+b.round+'</p>'+
    (b.result==='win'?'<p>功績を確定しました'+(next?'。次の作戦を選択できます。':'。')+'</p>':'')+
    '<div class="actions">'+btn('司令部に戻る','debrief','',false,'primary')+btn('兵種育成','training')+btn('セーブを書き出す','export')+'</div></section></main>';
}
function render(){
  const b=screen==='setup'?draft:active();
  const field=!!b&&!artPreview&&(screen==='setup'||screen==='battle');
  const oldPoint=camera.read(root);
  const previewScroll=artPreview?root.querySelector('.board-scroller'):null;
  const previewPosition=previewScroll?[previewScroll.scrollLeft,previewScroll.scrollTop] as const:undefined;
  if(field){
    for(const element of root.querySelectorAll<HTMLElement>('.battle-workspace [data-scroll]')){
      const key=element.dataset.scroll!;
      listScroll.set(key,element.scrollTop);
      if(key==='log')logFollow=element.scrollHeight-element.clientHeight-element.scrollTop<8;
    }
    if(root.querySelector('.battle-workspace')){
      optionsOpen=!!root.querySelector('[data-menu="options"][open]');
      conditionsOpen=!!root.querySelector('[data-menu="conditions"][open]');
    }
  }
  for(const [i,element] of [...root.querySelectorAll<HTMLElement>('.command-scroll')].entries()){
    commandScroll.set(element.closest('main')!.dataset.screen+'-'+i,element.scrollTop);
  }
  root.innerHTML=(field?'':'<header><strong>モンスターウォーズ</strong><nav class="top-actions">'+
    (saved?btn('書き出す','export'):'')+(screen==='base'?btn('図鑑','open-book'):'')+'</nav></header>')+
    '<div class="rotate-message">横画面でのプレイに対応しています</div>'+
    (!field&&message?status(message):'')+(!field&&blocked?'<div class="actions">'+btn('保存を再試行','retry')+btn('再読み込み','reload')+'</div>':'')+
    (artPreview?artPreview.render():field?renderBattle(b,screen==='setup'):screen==='title'||!saved?titlePage():screen==='result'&&b?resultPage(b):screen==='book'?encyclopediaPage(campaign(),bookTab,bookModel):screen==='formation'?formationView(campaign(),mission,difficulty,gear,draftGear,modelFilter):
      screen==='training'?trainingView(campaign(),trainingGroup):screen==='favorites'?favoritesView(campaign(),mission,difficulty):missionsView(campaign(),mission,difficulty));
  const command=root.querySelector<HTMLElement>('.command-screen');
  if(command){
    command.dataset.screen=screen;
    for(const [i,element] of [...command.querySelectorAll<HTMLElement>('.command-scroll')].entries()){
      element.scrollTop=commandScroll.get(screen+'-'+i)??0;
    }
    if(screen==='training'&&trainingGroup)command.querySelector('.training-unit.chosen')?.scrollIntoView({block:'nearest'});
  }
  if(field){
    camera.restore(root,b.size,oldPoint);
    for(const element of root.querySelectorAll<HTMLElement>('.battle-workspace [data-scroll]')){
      const key=element.dataset.scroll!;
      element.scrollTop=key==='log'&&logFollow?element.scrollHeight:listScroll.get(key)??0;
    }
    const intel=root.querySelector<HTMLElement>('.battle-intel');
    if(intel&&intelJump==='top')intel.scrollTop=0;
    if(intel&&intelJump==='choice'){
      const choice=intel.querySelector('.battle-choice');
      if(choice)intel.scrollTop+=choice.getBoundingClientRect().top-intel.getBoundingClientRect().top;
    }
    if(intel)intelJump=undefined;
  }else if(artPreview&&previewPosition){
    root.querySelector('.board-scroller')?.scrollTo(...previewPosition);
  }
  if(screen==='battle'&&b)schedule(b);
}
root.addEventListener('click',async ev=>{
  const el=(ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
  if(!el||busy)return;
  const {a,value=''}=el.dataset,b=screen==='setup'?draft:active(),u=b&&activeUnit(b);
  if(a==='preview-open'){artPreview=new ArtPreview();render();return;}
  if(artPreview){
    if(a==='preview-close')artPreview=undefined;
    else artPreview.handle(a,value);
    render();
    return;
  }
  if(a==='overview'||a==='zoom'||a==='panel'){
    if(a==='overview')camera.overview();
    if(a==='zoom')camera.zoom(Number(value));
    if(a==='panel'&&(value==='left'||value==='right'))collapsed[value]=!collapsed[value];
    render();return;
  }
  if(blocked&&!['retry','reload','export','restore','import'].includes(a??''))return;
  if(screen==='battle'&&b?.automation&&!['retry','reload','export','view-layer','unit','inspect-unit','detail'].includes(a??''))return;
  const orderRecipients=()=>b?playerUnits(b).filter(v=>orderIds.size?orderIds.has(v.id):v.id===u?.id).map(v=>v.id):[];
  const setOrder=(order:Order)=>void battleAction({type:'configure',ids:orderRecipients(),order});
  switch(a){
    case 'retry':retrySave?.();return;
    case 'reload':location.reload();return;
    case 'new':
      if(!store&&!confirm('端末に自動保存できません。一時プレイを開始しますか？'))return;
      temporary=!store;
      if(await save({campaign:freshCampaign()}))screen='base';
      break;
    case 'continue':
      screen=active()?active()?.result?'result':'battle':'base';
      if(b){mission=b.mission;difficulty=b.difficulty;resetBattleView();}
      break;
    case 'export':exportSave();return;
    case 'import':file.click();return;
    case 'restore':
      try{if(backup&&confirm('直前の保存時点へ戻しますか？')&&await save(upgradeSave(backup),corrupt))screen='title';}
      catch(e){return error((e as Error).message);}
      break;
    case 'mission':if(available(campaign(),value,difficulty))mission=value;break;
    case 'difficulty':
      if(value==='easy'||value==='normal'){difficulty=value;if(!available(campaign(),mission,difficulty))mission=missionIds[0];}
      break;
    case 'formation':
      if(available(campaign(),mission,difficulty)){screen='formation';if(gear<0&&campaign().roster.length)gear=0;}
      break;
    case 'missions':screen='base';break;
    case 'favorites':if(screen==='formation')screen='favorites';break;
    case 'training':
      if(['base','formation','result'].includes(screen)){trainingFrom=screen;trainingGroup=value;screen='training';}
      break;
    case 'close-training':if(screen==='training')screen=trainingFrom;break;
    case 'level-up':{
      if(screen!=='training')return;
      const current=campaign(),next=levelUp(current,value);
      if(next===current)return;
      trainingGroup=value;
      await save({campaign:next,battle:active()});
      break;
    }
    case 'favorite-save':case 'favorite-rename':case 'favorite-delete':case 'favorite-load':{
      if(screen!=='favorites')return;
      const c=campaign(),slot=Number(value);
      const previous=c.favorites?.find(f=>f.slot===slot);
      const name=el.closest('[data-slot]')?.querySelector('input')?.value??'';
      if(a==='favorite-save'&&previous&&!confirm('「'+previous.name+'」を現在の編成で上書きしますか？'))return;
      if(a==='favorite-delete'&&previous&&!confirm('「'+previous.name+'」を削除しますか？'))return;
      if(a==='favorite-load'&&previous&&(draftGear||JSON.stringify(c.roster)!==JSON.stringify(previous.roster))&&
         !confirm('現在の編成を「'+previous.name+'」で置き換えますか？'))return;
      const action=a==='favorite-save'?{kind:'save',slot,name} as const:a==='favorite-rename'?{kind:'rename',slot,name} as const:
        {kind:a==='favorite-load'?'load':'delete',slot} as const;
      const result=changeFavorite(c,action);
      if(result.error)return error(result.error);
      if(await save({campaign:result.campaign,battle:active()})&&action.kind==='load'){
        gear=result.campaign.roster.length?0:-1;draftGear=undefined;screen='formation';
      }
      break;
    }
    case 'edit':gear=Number(value);draftGear=undefined;break;
    case 'cancel-gear':draftGear=undefined;break;
    case 'apply-gear':
      if(draftGear){const chosen=draftGear;draftGear=undefined;changeRoster(r=>{r[gear]=chosen;});}
      return;
    case 'open-book':bookFrom=screen;screen='book';bookModel='';break;
    case 'close-book':screen=bookFrom;break;
    case 'book-tab':bookTab=value==='enemy'?'enemy':'ally';bookModel='';break;
    case 'book-model':bookModel=value;break;
    case 'remove':{
      const index=Number(value);
      if(index===gear){gear=-1;draftGear=undefined;}
      else if(index<gear)gear--;
      changeRoster(r=>r.splice(index,1));
      return;
    }
    case 'add':{
      const entry=emptyEntry(value);
      if(validEntry(campaign(),entry)){
        if(gear<0)gear=campaign().roster.length;
        changeRoster(r=>r.push(entry));
      }
      return;
    }
    case 'prepare':resetBattleView();
      if(!sortieError(campaign(),mission,difficulty)){draft=createBattle(campaign(),mission,difficulty);screen='setup';layerView='both';const v=playerUnits(draft)[0];if(v)selectUnit(v);}
      break;
    case 'abortsetup':screen='formation';draft=undefined;break;
    case 'deployface':
      if(b&&u){const next=deploy(b,u.id,{at:u.at,facing:Number(value) as Direction});if(next)draft=next;else return error('この向きでは出撃区画や他部隊と重なります');}
      break;
    case 'launch':
      if(draft&&await save({campaign:{...campaign(),nextBattle:campaign().nextBattle+1},battle:draft})){draft=undefined;orderIds.clear();screen='battle';}
      break;
    case 'view-layer':layerView=value as LayerView;if(layerView!=='both')layer=layerView;break;
    case 'detail':detail=!detail;break;
    case 'inspect-unit':{
      const [id,level]=value.split(',');const v=b?.units.find(v=>v.id===id);
      if(v)selectUnit(v,level as Layer);
      break;
    }
    case 'unit':{
      const v=b?.units.find(v=>v.id===value&&v.hp>0);
      if(!b||!v)break;
      const cells=cellsOf(v);
      if(layerView!=='both'&&!cells.some(c=>c.layer===layerView))layerView='both';
      camera.focus(v,b.size);
      if(pickOrder){
        const expected=pickOrder==='focus'?'enemy':'player';
        if(v.side===expected&&!orderRecipients().includes(v.id))setOrder({kind:pickOrder,target:v.id});
        else error('対象は作戦指示の条件を満たしていません');
        return;
      }
      if(mode==='attack'&&u){
        const choices=legalTargets(b,u,weapon).filter(a=>cells.some(c=>c.layer===a.target.layer&&same(c.at,a.target.at))&&
          (a.plan.support?.id===v.id||a.plan.hits.some(h=>h.id===v.id)));
        const next=choices.find(a=>a.target.layer===layer)??choices[0];
        if(next)chooseAim(next.target);
        else error('射程・射線・対象層を満たすマスがありません');
        break;
      }
      selectUnit(v);
      break;
    }
    case 'cancel-choice':clearChoice();intelJump='top';break;
    case 'map':{
      if(!b)break;
      const at=value.split(',').map(Number) as Cell;
      const all=b.units.filter(v=>v.hp>0&&cellsOf(v).some(c=>same(c.at,at)));
      const matches=all.filter(v=>cellsOf(v).some(c=>same(c.at,at)&&(layerView==='both'||c.layer===layerView)));
      if(pickOrder){
        const side=pickOrder==='focus'?'enemy':'player', ids=orderRecipients();
        const recipient=matches.find(v=>v.side===side&&!ids.includes(v.id));
        if(recipient)setOrder({kind:pickOrder,target:recipient.id});else error('作戦指示に合う対象を選んでください');
        return;
      }
      if(screen==='setup'&&u&&u.side==='player'&&!all.some(v=>v.side==='player'&&cellsOf(v).some(c=>same(c.at,at)&&c.layer===modelFor(u.model).layer))){
        const next=deploy(b,u.id,{at,facing:u.facing});if(next)draft=next;else return error('自軍区画内の空きマスを選んでください');
      }else if(mode==='move'&&u&&b.side==='player'){
        const reachable=paths(b,u),options=[u.facing,...dirs].map(facing=>({at,facing})).find(p=>reachable.has(poseKey(p)));
        if(options){planned=options;intelJump='choice';}else if(matches[0])selectUnit(matches[0]);else return error('そのマスには移動できません');
      }else if(mode==='attack'&&u&&b.side==='player'){
        const found=legalTargets(b,u,weapon).filter(a=>same(a.target.at,at));
        const aim=found.find(a=>a.target.layer===layer)??found[0];if(aim)chooseAim(aim.target);
        else if(matches[0])selectUnit(matches[0]);else return error('そのマスを攻撃対象にできません');
      }else if(matches[0]){
        const choices=all.flatMap(v=>cellsOf(v).filter(c=>same(c.at,at)));
        selectUnit(matches[0],layerView==='both'?undefined:layerView);
        if(choices.length>1)inspectCell=at;
      }
      break;
    }
    case 'automode':
      if(b)void battleAction({type:'configure',ids:value.startsWith('all-')?playerUnits(b).map(v=>v.id):u?[u.id]:[],automatic:value.endsWith('-on')});
      return;
    case 'orders':orderPanel=!orderPanel;pickOrder=undefined;break;
    case 'order-unit':
      if(orderIds.has(value))orderIds.delete(value);else orderIds.add(value);
      break;
    case 'set-order':
      clearChoice();
      if(value==='free'){setOrder({kind:'free'});return;}
      if(value==='focus'||value==='guard')pickOrder=value;
      break;
    case 'order-target':
      if(pickOrder)setOrder({kind:pickOrder,target:value});
      return;
    case 'auto-run':void battleAction({type:'auto',finish:false});return;
    case 'move':clearChoice();mode='move';intelJump='choice';break;
    case 'face':if(planned)planned={...planned,facing:Number(value) as Direction};break;
    case 'guard':case 'wait':if(u)void battleAction({type:a,id:u.id});return;
    case 'watch':clearChoice();mode='watch';break;
    case 'weapon':
      intelJump='choice';
      weapon=value;planned=undefined;target=undefined;
      if(mode!=='watch')mode='attack';break;
    case 'layer':
      layer=value as Layer;
      if(target)target={...target,layer};if(layerView!=='both')layerView=layer;
      break;
    case 'target':{const [l,x,y,ammo]=value.split(',');chooseAim({layer:l as Layer,at:[Number(x),Number(y)],...(ammo?{ammo}:{})});break;}
    case 'confirmmove':if(u&&planned)void battleAction({type:'move',id:u.id,pose:planned});return;
    case 'confirmattack':if(u&&target)void battleAction({type:'attack',id:u.id,weapon,target});return;
    case 'confirmwatch':if(u&&weapon)void battleAction({type:'watch',id:u.id,weapon});return;
    case 'end':
      if(b){
        const hasManual=playerUnits(b).some(v=>!v.automatic&&(v.move||v.main));
        if(hasManual&&!confirm('手動ユニットに未使用の行動権があります。自軍ターンを終了しますか？'))return;
        const hasAuto=playerUnits(b).some(v=>v.automatic&&(v.move||v.main));
        void battleAction(hasAuto?{type:'auto',finish:true}:{type:'end'});
      }
      return;
    case 'retreat':if(confirm('作戦から撤退しますか？ 報酬は発生しません。'))void battleAction({type:'retreat'});return;
    case 'debrief':if(await save({campaign:campaign()}))screen='base';break;
  }
  if(!blocked)message='';
  render();
  if(a==='book-model')root.querySelector('.catalog-hero')?.scrollIntoView({block:'nearest'});
});
root.addEventListener('error',ev=>{
  const element=ev.target;
  if(element instanceof HTMLImageElement&&element.matches('.catalog-portrait'))element.hidden=true;
},true);
root.addEventListener('change',ev=>{
  const e=ev.target as HTMLInputElement;
  if(blocked||busy)return;
  if(e.dataset.change==='model-group'){modelFilter=e.value;render();}
  if(e.dataset.change==='gear'&&gear>=0){
    const which=e.dataset.kind as 'weapons'|'equipment',i=Number(e.dataset.index),id=e.value;
    const old=draftGear??campaign().roster[gear];if(!old)return;
    const entry=structuredClone(old),slots=[...entry[which]];
    if(id)slots[i]=id;else slots.splice(i,1);
    entry[which]=slots.filter(Boolean);
    if(validEntry(campaign(),entry)){draftGear=entry;render();}
  }
});
file.addEventListener('change',async()=>{
  const chosen=file.files?.[0];file.value='';
  if(!chosen)return;
  try{
    const incoming=upgradeSave(decode(JSON.parse(await chosen.text())));
    const extra=incoming.battle?'・戦闘R'+incoming.battle.round:'';
    if(!confirm('EXP '+incoming.campaign.xp+extra+' のセーブを読み込み、現在の進行を置き換えますか？'))return;
    if(!store)temporary=true;
    if(await save(incoming,corrupt))screen='title';
    render();
  }catch(e){error((e as Error).message);}
});
window.addEventListener('resize',()=>{if(root.querySelector('.battle-workspace,.art-preview'))render();});
async function boot(){
  try{store=await openStorage();}catch{render();return;}
  try{const e=await store.read();if(e)saved=decode(e);}catch{corrupt=true;}
  try{const e=await store.backup();if(e)backup=decode(e);}catch{/* The current save remains independent. */}
  try{if(saved&&saved.schemaVersion<4)await save(upgradeSave(saved));}
  catch(e){blocked=true;message=(e as Error).message;}
  render();
}
void boot();
