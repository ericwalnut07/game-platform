import './style.css';
import { equipment, models, weaponFor, modelFor, equipmentFor } from '../../src/games/monster-wars/catalog';
import { allocate, available, award, freshCampaign, key, level, meritRanks, nextXp, rosterCost, sortieError, totalXp, validEntry } from '../../src/games/monster-wars/campaign';
import { createBattle, deploy, layerName, name, playerUnits, unit, type Battle, type Target, type Unit } from '../../src/games/monster-wars/battle-state';
import { act, command, enemyAction, legalTargets, paths, predictMove, type Action } from '../../src/games/monster-wars/battle';
import { cellsOf, dirs, inRect, poseKey, same, terrainAt, type Step } from '../../src/games/monster-wars/grid';
import { ceiling, debrief, missionIds, recommended, missionFor } from '../../src/games/monster-wars/missions';
import { decode, encode, type Envelope, type Progress } from '../../src/games/monster-wars/save';
import { openStorage } from './storage';
import type { Cell, Difficulty, Direction, Layer, Pose, RosterEntry } from '../../src/games/monster-wars/types';

const root=document.querySelector<HTMLElement>('#app')!;
const file=document.querySelector<HTMLInputElement>('#import')!;
let store:Awaited<ReturnType<typeof openStorage>>|undefined;
let saved:Envelope|undefined, backup:Envelope|undefined, draft:Battle|undefined, difficulty:Difficulty='easy', mission=missionIds[0];
let screen='title', message='', busy=false, corrupt=false, temporary=false, blocked=false, retrySave:(()=>void)|undefined;
let selected='', weapon='', mode='', planned:Pose|undefined, target:Target|undefined, layer:Layer='ground', zoom=0, gear=-1;
let xpGroup='', xpAmount=0, scheduled=false;
const arrows=['↑','→','↓','←'] as const;
const icons:Record<string,string>={infantry:'歩',apc:'装',tank:'戦',heavy:'重',helicopter:'ヘ',aa:'空',lightArt:'砲',heavyArt:'重砲',repair:'修',supply:'補',sniper:'狙',facility:'基',K01:'グ',K03:'シ',K04:'フ',K06:'ガ',K11:'レ',K21:'バ'};
const terrainLabels={plain:'平地',road:'道路',forest:'森林',rubble:'瓦礫',building:'建物'};
const esc=(s:unknown)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const btn=(label:string,action:string,data='',disabled=false,css='')=>'<button type="button" class="'+css+'" data-a="'+action+'" data-value="'+esc(data)+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
const campaign=()=>saved!.payload.campaign;
const active=()=>saved?.payload.battle;
const groupIds=()=>[...new Set(campaign().open.filter(id=>models[id]?.slots).map(id=>modelFor(id).group))];
const modelOption=(id:string)=>modelFor(id).name+' '+modelFor(id).cost;
const activeUnit=(b:Battle)=>b.units.find(v=>v.id===selected&&v.hp>0);
const error=(e:string)=>{message=e;render();};
function clearChoice(){mode='';weapon='';planned=undefined;target=undefined;}
function selectUnit(u:Unit){selected=u.id;layer=modelFor(u.model).layer;clearChoice();}
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
      if(ok && payload.battle?.result)screen='result';
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
  const c=next.result==='win'?award(campaign(),next.mission,next.difficulty,next.id,next.stats):campaign();
  if(await save({campaign:c,battle:next})){clearChoice();if(next.result)screen='result';}
  render();
}
function schedule(b:Battle){
  if(scheduled||busy||blocked||b.side!=='enemy'||b.result)return;
  scheduled=true;
  setTimeout(()=>{
    scheduled=false;
    if(screen==='battle'&&active()===b&&!blocked&&!busy)void battleAction(enemyAction(b));
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
    (saved?btn('セーブを書き出す','export'):'' )+btn('セーブを読み込む','import')+
    (backup?btn('直前のセーブを復元','restore'):'' )+'</div>'+
    (corrupt?'<p class="error">現在のセーブを確認できません。直前のセーブまたはJSONから復元できます。</p>':'')+
    (!store?'<p class="error">端末への自動保存を利用できません。一時プレイの進行はJSONで保管できます。</p>':'')+
    '</section></main>';
}
function options(values:string[],current:string,labels:(id:string)=>string){
  return '<option value="">なし</option>'+values.map(id=>'<option value="'+esc(id)+'"'+(id===current?' selected':'')+'>'+esc(labels(id))+'</option>').join('');
}
function basePage(c:ReturnType<typeof campaign>){
  const d=difficulty,m=missionFor(mission),cost=rosterCost(c.roster),gate=sortieError(c,mission,d),entry=c.roster[gear];
  const group=xpGroup||(groupIds()[0]??''),current=c.levels[group]??0,l=level(current);
  const slots=(which:'weapons'|'equipment', max:number)=>{
    if(!entry)return '';
    const labelled=(id:string)=>{
      const gear=equipment[id],item=gear??weaponFor(entry.model,id);
      return item.name+' +'+item.cost+(gear?'｜'+gear.description:'');
    };
    const choices=c.open.filter(id=>which==='weapons'?id.startsWith('W'):id in equipment);
    return Array.from({length:max},(_,i)=>{
      const allowed=choices.filter(id=>validEntry(c,{...entry,[which]:[...entry[which].filter((_,j)=>j!==i),id]}));
      return '<label>'+ (which==='weapons'?'武装 ':'追加装備 ')+(i+1)+'<select data-change="gear" data-kind="'+which+'" data-index="'+i+'">'+options(allowed,entry[which][i]??'',labelled)+'</select></label>';
    }).join('');
  };
  const readiness=entry?unit({id:'preview',model:entry.model,at:[0,0],facing:0},'player',level(c.levels[modelFor(entry.model).group]??0),100,c,gear):null;
  const ranks=entry?meritRanks(c,entry.model):[];
  const next=level(current+Math.min(Math.max(0,xpAmount),c.xp,totalXp(50)-current));
  return '<main class="columns"><div><section class="panel"><h2>作戦選択</h2><nav>'+btn('Easy','difficulty','easy',false,d==='easy'?'on':'')+btn('Normal','difficulty','normal',false,d==='normal'?'on':'')+
    '</nav><div class="stack">'+missionIds.map(id=>{
      const item=missionFor(id),wins=c.wins[key(id,d)]??0;
      return '<button class="mission '+(mission===id?'on':'')+'" data-a="mission" data-value="'+id+'" '+(!available(c,id,d)?'disabled':'')+'>'+esc(item.name)+'<small>推奨Lv '+recommended(item,d)+'　'+(wins?'再戦':'初回')+' '+debrief(d,!wins)+' EXP　'+(wins?'クリア済':'')+'</small></button>';
    }).join('')+'</div><p class="muted">'+esc(m.briefing)+'／自軍全滅で敗北</p></section>'+
    '<section class="panel"><h2>経験値配分　<strong>'+c.xp+' EXP</strong></h2><div class="actions"><select aria-label="育成兵種" data-change="group">'+
    groupIds().map(id=>'<option'+(id===group?' selected':'')+'>'+esc(id)+'</option>').join('')+'</select>'+
    '<input aria-label="配分EXP" data-change="xp" type="number" min="0" max="'+c.xp+'" value="'+xpAmount+'">'+btn('全額','maxxp','',!c.xp)+btn('配分を確定','allocate','',!xpAmount||!c.xp||l===50)+'</div><small>現在 Lv'+l+(l<50?'／次まで '+(nextXp(l)-(current-totalXp(l)))+' EXP':'')+'　配分後 Lv'+next+'</small></section></div>'+
    '<div><section class="panel"><h2>出撃編成　<strong>'+cost+' / '+ceiling(m,d)+'</strong></h2>'+
    c.roster.map((e,i)=>'<div class="row"><div>'+esc(modelFor(e.model).name)+' <small>Lv'+level(c.levels[modelFor(e.model).group]??0)+' '+[...e.weapons.map(k=>weaponFor(e.model,k).name),...e.equipment.map(k=>equipmentFor(k).name)].map(esc).join('・')+'</small></div><div class="actions">'+btn('装備・功績','edit',String(i),false,gear===i?'on':'')+btn('外す','remove',String(i))+'</div></div>').join('')+
    '<div class="actions"><select aria-label="追加モデル" id="add-model">'+c.open.filter(id=>models[id]?.slots).map(id=>'<option value="'+id+'">'+esc(modelOption(id))+'</option>').join('')+'</select>'+btn('編成に追加','add')+btn('配置へ','prepare','',!!gate,'primary')+
    '</div>'+(gate?'<p class="error">'+esc(gate)+'</p>':'')+'</section>'+
    (entry?'<section class="panel"><h2>'+esc(modelFor(entry.model).name)+'　装備・功績</h2>'+
      '<p>HP '+readiness!.maxHp+'／ATK '+readiness!.atk+'／DEF '+modelFor(entry.model).def+'／MOV '+modelFor(entry.model).move+'</p>'+
      '<div class="gear">'+slots('weapons',modelFor(entry.model).slots![0])+slots('equipment',modelFor(entry.model).slots![1])+'</div><h3>モデル別功績</h3>'+
      modelFor(entry.model).merits!.map((m,i)=>{
        const score=c.merits[entry.model]?.[m.metric]??0,target=[1,3,6,10,15][ranks[i]??0];
        return '<div class="row"><span>'+esc(m.effect)+' Lv'+ranks[i]+'</span><small>'+score+(target?' / '+target*m.threshold:'（最大）')+'</small></div>';
      }).join('')+'</section>':'')+'</div></main>';
}
function renderBattle(b:Battle,setup:boolean){
  const u=activeUnit(b),own=!!u&&u.side==='player'&&u.model!=='facility',ready=own&&b.side==='player'&&!busy&&!blocked;
  const reachable=ready&&mode==='move'?paths(b,u!):new Map<string,Step[]>();
  const legal=ready&&mode==='attack'&&u&&weapon?legalTargets(b,u,weapon):[];
  const plannedPath=planned?reachable.get(poseKey(planned)):undefined;
  const forecast=u&&plannedPath?predictMove(b,u,plannedPath):null;
  const selectedAttack=target?legal.find(a=>a.target.layer===target!.layer&&a.target.ammo===target!.ammo&&same(a.target.at,target!.at)):undefined;
  const route=plannedPath?.map((p:Pose)=>p.at)??[];
  const boardMarks=new Map<string, {u:Unit;layer:Layer}[]>();
  for(const v of b.units)if(v.hp>0)for(const c of cellsOf(v)){
    const k=String(c.at);boardMarks.set(k,[...(boardMarks.get(k)??[]),{u:v,layer:c.layer}]);
  }
  const normal=Math.floor(Math.min((innerHeight-91)/b.size,(innerWidth*.63-26)/b.size));
  const dim=Math.max(14,normal)+zoom*7;
  const renderCell=(at:Cell)=>{
    const t=terrainAt(b,at), marks=boardMarks.get(String(at))??[];
    const selected=marks.some(m=>m.u===u), move=Array.from(reachable.keys()).some(k=>k.startsWith(at+':'));
    const hit=legal.some(a=>same(a.target.at,at)), zone=setup&&inRect(at,missionFor(b.mission).zone);
    const aim=selectedAttack&&same(selectedAttack.plan.origin,at);
    const css=['cell',t,selected?'selected':'',zone?'zone':'',move?'move':'',hit?'target':'',route.some(c=>same(c,at))?'path':'',b.warning?.cells.some(c=>same(c,at))?'warning':'',selectedAttack?.plan.area.some(c=>same(c,at))?'area':'',aim?'ray':''];
    const label=(at[0]+1)+','+(at[1]+1)+' '+terrainLabels[t]+' '+marks.map(m=>name(m.u)+' '+layerName(m.layer)).join(' ');
    return '<button aria-label="'+esc(label)+'" title="'+esc(label)+'" class="'+css.join(' ')+'" data-a="map" data-value="'+at+'">'+marks.map(({u:v,layer},i)=>
      '<span class="marker '+v.side+' '+layer+(i?' dual':'')+'">'+esc(icons[v.model])+(modelFor(v.model).facing&&same(v.at,at)?arrows[v.facing]:'')+'</span>').join('')+'</button>';
  };
  const roster=b.units.filter(v=>v.side==='player'&&v.hp>0);
  const actionPanel=u?'<section class="panel"><h2>'+esc(name(u))+'</h2><p>HP '+u.hp+'/'+u.maxHp+' ／ '+layerName(modelFor(u.model).layer)+' '+(modelFor(u.model).facing?arrows[u.facing]:'')+'</p>'+
    '<p class="muted">'+(u.side==='player'?'移動 '+(u.move?'可':'済')+' ／ 主行動 '+(u.main?'可':'済'):'敵軍')+(u.guarding?' ／ 防御中':'')+(u.shellBreak?' ／ 外殻破損 残り'+u.shellBreak+'手番':'')+(u.overwatch?' ／ 迎撃待機':'')+'</p>'+
    (modelFor(u.model).parts??[]).map(p=>'<div class="row"><span>'+p.label+'</span><small>'+u.parts[p.id]+'/'+u.partMax[p.id]+(p.defense?'｜破壊でDEF−'+p.defense:p.movement?'｜破壊でMOV−'+p.movement:'｜破壊で対応攻撃を制限')+'</small></div>').join('')+
    (setup&&own?'<p>移動先を出撃区画から選択</p><div class="actions">'+(modelFor(u.model).facing?dirs.map(d=>btn(arrows[d],'deployface',String(d),false,u.facing===d?'on':'')).join(''):'')+'</div>':
      ready?'<nav>'+btn('移動','move','',!u.move,mode==='move'?'on':'')+btn('防御','guard','',!u.main)+btn('待機','wait','',!u.main&&!u.move)+btn('迎撃','watch','',!u.main,mode==='watch'?'on':'')+'</nav>'+
      '<div class="stack">'+u.weapons.filter(id=>mode!=='watch'||weaponFor(u.model,id).overwatch).map(id=>{
        const w=weaponFor(u.model,id),ammo=u.ammo[id];
        return btn((mode==='watch'?'迎撃・':'')+w.name+'　'+w.range.join('–')+'　'+(ammo===undefined?'∞':ammo+'/'+u.capacity[id]),'weapon',id,!u.main||ammo===0,weapon===id?'on':'');
      }).join('')+'</div>':'')+'</section>':'';
  const validPoses=planned?dirs.filter(d=>reachable.has(poseKey({...planned!,facing:d}))):[];
  const targetList=mode==='attack'?(target?legal.filter(a=>same(a.target.at,target!.at)):legal.slice(0,30)):[];
  const choice=mode==='move'?(planned?
    '<p>目的地 '+planned.at.map(n=>n+1).join(',')+'　移動費 '+(plannedPath?.at(-1)?.cost??0)+'</p><div class="actions">'+validPoses.map(d=>btn(arrows[d],'face',String(d),false,planned?.facing===d?'on':'')).join('')+btn('移動を確定','confirmmove','',!plannedPath,'primary')+'</div>'+
    (forecast&&forecast.hp!==u?.hp?'<small>迎撃予測後のHP '+forecast.hp+'</small>':''):'<p>青緑のマスから目的地を選択</p>'):
    mode==='attack'?'<div class="actions">'+btn('地上','layer','ground',false,layer==='ground'?'on':'')+btn('空中','layer','air',false,layer==='air'?'on':'')+'</div>'+
    (selectedAttack?'<p>射撃起点 '+selectedAttack.plan.origin.map(n=>n+1).join(',')+' → '+target!.at.map(n=>n+1).join(',')+' '+layerName(target!.layer)+'</p>'+
    selectedAttack.plan.hits.map(h=>'<p>'+esc(name(b.units.find(v=>v.id===h.id)!))+' −'+h.damage+(Object.keys(h.parts).length?'／部位 '+Object.entries(h.parts).map(([id,n])=>esc(modelFor(b.units.find(v=>v.id===h.id)!.model).parts!.find(p=>p.id===id)!.label)+' −'+n).join('、'):'')+'</p>').join('')+
    (selectedAttack.plan.support?'<p>有効量 '+selectedAttack.plan.support.amount+(selectedAttack.plan.support.ammo?'／'+esc(weaponFor(b.units.find(v=>v.id===selectedAttack.plan.support!.id)!.model,selectedAttack.plan.support.ammo).name):'')+'</p>':'')+btn('実行を確定','confirmattack','',false,'primary'):'<p>'+ (legal.length?'オレンジのマスまたは候補を選択':'射程・射線・対象層を満たす対象がいません')+'</p>')+
    '<div class="tactical-list">'+targetList.map(a=>btn(layerName(a.target.layer)+' '+a.target.at.map(n=>n+1).join(',')+' '+(a.plan.support?.ammo?' 補給 '+weaponFor(b.units.find(v=>v.id===a.plan.support!.id)!.model,a.plan.support.ammo).name:a.plan.hits.map(h=>name(b.units.find(v=>v.id===h.id)!)).join('・')),'target',a.target.layer+','+a.target.at+','+(a.target.ammo??''))).join('')+'</div>':
    mode==='watch'&&weapon?btn('迎撃を確定','confirmwatch','',false,'primary'):'';
  return '<main class="battle-shell"><section class="board-panel"><div class="board-top"><span>'+esc(missionFor(b.mission).name)+'　'+(setup?'出撃配置':'R'+b.round+' / '+missionFor(b.mission).limit)+'</span><div class="actions">'+btn('−','zoom','-1',zoom===0)+btn('＋','zoom','1',zoom===4)+
    (setup?btn('出撃','launch','',false,'primary'):btn(b.side==='enemy'?'敵軍行動中':'ターン終了','end','',b.side==='enemy'||blocked,'primary'))+'</div></div><div class="board-scroller"><div class="board" style="--cell:'+dim+'px;grid-template-columns:repeat('+b.size+',var(--cell))">'+
    Array.from({length:b.size*b.size},(_,i)=>renderCell([i%b.size,Math.floor(i/b.size)])).join('')+'</div></div></section><aside class="intel panel">'+
    '<p>'+esc(missionFor(b.mission).briefing)+'／自軍全滅で敗北'+(b.mission==='MVP02'?'・施設破壊で敗北':'')+'</p>'+
    (b.warning?'<p class="error">光線予告　敵軍R'+b.warning.due+'に発動　頭部・胸部破壊で中断</p>':'')+
    '<div class="unit-list">'+roster.map(v=>btn(name(v)+' '+v.hp,'unit',v.id,false,v.id===selected?'on':'')).join('')+'</div>'+actionPanel+
    (choice?'<section class="panel">'+choice+'</section>':'')+
    (setup?'':'<ol class="log">'+[...b.log].slice(-7).reverse().map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol>')+'</aside></main>';
}
function resultPage(b:Battle){
  const c=campaign(), receipt=c.receipts[b.id]??0, next=missionIds[missionIds.indexOf(b.mission)+1];
  return '<main class="title"><h1>'+ (b.result==='win'?'作戦成功':b.result==='retreat'?'撤退':'作戦失敗')+'</h1><p>'+esc(b.reason)+'</p><section class="panel"><h2>戦闘結果</h2><p>獲得 '+receipt+' EXP ／ R'+b.round+'</p>'+
    (b.result==='win'?'<p>功績を確定しました'+(next?'。次の作戦を選択できます。':'。')+'</p>':'')+
    '<div class="actions">'+btn('司令部に戻る','debrief','',false,'primary')+btn('セーブを書き出す','export')+'</div></section></main>';
}
function render(){
  const b=screen==='setup'?draft:active();
  const scroller=root.querySelector<HTMLElement>('.board-scroller');
  const position:Cell|null=scroller?[scroller.scrollLeft,scroller.scrollTop]:null;
  const intel=root.querySelector<HTMLElement>('.intel')?.scrollTop??0;
  root.innerHTML='<header><strong>モンスターウォーズ</strong><nav class="top-actions">'+
    (saved?btn('書き出す','export'):'')+(screen==='setup'?btn('編成に戻る','abortsetup'):screen==='battle'?btn('撤退','retreat','',busy||blocked):'')+'</nav></header>'+
    '<div class="rotate-message">横画面でのプレイに対応しています</div>'+
    (message?status(message):'')+(blocked?'<div class="actions">'+btn('保存を再試行','retry')+btn('再読み込み','reload')+'</div>':'')+
    (screen==='title'||!saved?titlePage():screen==='setup'&&b?renderBattle(b,true):screen==='battle'&&b?renderBattle(b,false):screen==='result'&&b?resultPage(b):basePage(campaign()));
  if(position){const board=root.querySelector<HTMLElement>('.board-scroller');if(board){board.scrollLeft=position[0];board.scrollTop=position[1];}}
  const now=root.querySelector<HTMLElement>('.intel');if(now)now.scrollTop=intel;
  if(screen==='battle'&&b)schedule(b);
}
root.addEventListener('click',async ev=>{
  const el=(ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
  if(!el||busy)return;
  const {a,value=''}=el.dataset,b=screen==='setup'?draft:active(),u=b&&activeUnit(b);
  if(blocked&&!['retry','reload','export','restore','import'].includes(a??''))return;
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
      if(b){mission=b.mission;difficulty=b.difficulty;}
      break;
    case 'export':exportSave();return;
    case 'import':file.click();return;
    case 'restore':
      if(backup&&confirm('直前の保存時点へ戻しますか？')&&await save(backup.payload,corrupt))screen='title';
      break;
    case 'mission':mission=value;gear=-1;break;
    case 'difficulty':difficulty=value as Difficulty;if(!available(campaign(),mission,difficulty))mission=missionIds[0];break;
    case 'edit':gear=Number(value);break;
    case 'remove':gear=-1;changeRoster(r=>r.splice(Number(value),1));return;
    case 'add':{
      const id=document.querySelector<HTMLSelectElement>('#add-model')?.value;
      if(id)changeRoster(r=>r.push({model:id,weapons:[],equipment:[]}));return;
    }
    case 'maxxp':xpAmount=campaign().xp;break;
    case 'allocate':{
      const c=campaign(),next=allocate(c,xpGroup||(groupIds()[0]??''),xpAmount);
      if(next!==c&&confirm((c.xp-next.xp)+' EXPを配分しますか？')&&await save({campaign:next,battle:active()}))xpAmount=0;
      break;
    }
    case 'prepare':
      if(!sortieError(campaign(),mission,difficulty)){draft=createBattle(campaign(),mission,difficulty);screen='setup';const v=playerUnits(draft)[0];if(v)selectUnit(v);}
      break;
    case 'abortsetup':screen='base';draft=undefined;break;
    case 'deployface':
      if(b&&u){const next=deploy(b,u.id,{at:u.at,facing:Number(value) as Direction});if(next)draft=next;else return error('この向きでは出撃区画や他部隊と重なります');}
      break;
    case 'launch':
      if(draft&&await save({campaign:{...campaign(),nextBattle:campaign().nextBattle+1},battle:draft})){draft=undefined;screen='battle';}
      break;
    case 'zoom':zoom=Math.min(4,Math.max(0,zoom+Number(value)));break;
    case 'unit':if(b){const v=b.units.find(v=>v.id===value&&v.hp>0);if(v)selectUnit(v);}break;
    case 'map':{
      if(!b)break;
      const at=value.split(',').map(Number) as Cell;
      const matches=b.units.filter(v=>v.hp>0&&cellsOf(v).some(c=>same(c.at,at)));
      if(screen==='setup'&&u&&u.side==='player'&&!matches.some(v=>v.side==='player')){
        const next=deploy(b,u.id,{at,facing:u.facing});if(next)draft=next;else return error('自軍区画内の空きマスを選んでください');
      }else if(mode==='move'&&u&&b.side==='player'){
        const reachable=paths(b,u),options=[u.facing,...dirs].map(facing=>({at,facing})).find(p=>reachable.has(poseKey(p)));
        if(options)planned=options;else if(matches[0])selectUnit(matches[0]);else return error('そのマスには移動できません');
      }else if(mode==='attack'&&u&&b.side==='player'){
        const found=legalTargets(b,u,weapon).filter(a=>same(a.target.at,at));
        const aim=found.find(a=>a.target.layer===layer)??found[0];if(aim){target=aim.target;layer=target.layer;}
        else if(matches[0])selectUnit(matches[0]);else return error('そのマスを攻撃対象にできません');
      }else if(matches[0])selectUnit(matches[1]&&matches[0].id===selected?matches[1]:matches[0]);
      break;
    }
    case 'move':clearChoice();mode='move';break;
    case 'face':if(planned)planned={...planned,facing:Number(value) as Direction};break;
    case 'guard':case 'wait':if(u)void battleAction({type:a,id:u.id});return;
    case 'watch':clearChoice();mode='watch';break;
    case 'weapon':
      weapon=value;planned=undefined;target=undefined;
      if(mode!=='watch')mode='attack';break;
    case 'layer':
      layer=value as Layer;
      if(target)target={...target,layer};
      break;
    case 'target':{const [l,x,y,ammo]=value.split(',');layer=l as Layer;target={layer,at:[Number(x),Number(y)],...(ammo?{ammo}:{})};break;}
    case 'confirmmove':if(u&&planned)void battleAction({type:'move',id:u.id,pose:planned});return;
    case 'confirmattack':if(u&&target)void battleAction({type:'attack',id:u.id,weapon,target});return;
    case 'confirmwatch':if(u&&weapon)void battleAction({type:'watch',id:u.id,weapon});return;
    case 'end':if(b&&(!playerUnits(b).some(v=>v.move||v.main)||confirm('未使用の行動権があります。自軍ターンを終了しますか？')))void battleAction({type:'end'});return;
    case 'retreat':if(confirm('作戦から撤退しますか？ 報酬は発生しません。'))void battleAction({type:'retreat'});return;
    case 'debrief':if(await save({campaign:campaign()}))screen='base';break;
  }
  if(!blocked)message='';
  render();
});
root.addEventListener('change',ev=>{
  const e=ev.target as HTMLInputElement;
  if(blocked||busy)return;
  if(e.dataset.change==='group'){xpGroup=e.value;render();}
  if(e.dataset.change==='xp'){xpAmount=Math.max(0,Math.min(campaign().xp,Math.trunc(Number(e.value)||0)));render();}
  if(e.dataset.change==='gear'&&gear>=0){
    const which=e.dataset.kind as 'weapons'|'equipment',i=Number(e.dataset.index),id=e.value;
    changeRoster(r=>{const entry=r[gear];if(!entry)return;const slots=[...entry[which]];if(id)slots[i]=id;else slots.splice(i,1);entry[which]=slots.filter(Boolean);});
  }
});
file.addEventListener('change',async()=>{
  const chosen=file.files?.[0];file.value='';
  if(!chosen)return;
  try{
    const incoming=decode(JSON.parse(await chosen.text()));
    const extra=incoming.payload.battle?'・戦闘R'+incoming.payload.battle.round:'';
    if(!confirm('EXP '+incoming.payload.campaign.xp+extra+' のセーブを読み込み、現在の進行を置き換えますか？'))return;
    if(!store)temporary=true;
    if(await save(incoming.payload,corrupt))screen='title';
    render();
  }catch(e){error((e as Error).message);}
});
window.addEventListener('resize',render);
async function boot(){
  try{store=await openStorage();}catch{render();return;}
  try{const e=await store.read();if(e)saved=decode(e);}catch{corrupt=true;}
  try{const e=await store.backup();if(e)backup=decode(e);}catch{/* The current save remains independent. */}
  render();
}
void boot();
