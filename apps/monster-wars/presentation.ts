import { effectiveAffinity, effectiveDefense } from '../../src/games/monster-wars/attack';
import { layerName, type Battle, type Unit } from '../../src/games/monster-wars/battle-state';
import { movement } from '../../src/games/monster-wars/battle';
import type { Campaign } from '../../src/games/monster-wars/campaign';
import { compatible, equipment, modelFor, weapons, weaponFor } from '../../src/games/monster-wars/catalog';
import { enemyModels, unlockedModels } from '../../src/games/monster-wars/encyclopedia';
import type { Attribute } from '../../src/games/monster-wars/types';

export const esc=(s:unknown)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const btn=(label:string,action:string,data='',disabled=false,css='')=>'<button type="button" class="'+css+'" data-a="'+action+'" data-value="'+esc(data)+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
export const arrows=['↑','→','↓','←'] as const;
export const icons:Record<string,string>={infantry:'歩',apc:'装',tank:'戦',heavy:'重',helicopter:'ヘ',aa:'空',lightArt:'砲',heavyArt:'重砲',repair:'修',supply:'補',sniper:'狙',facility:'基',K01:'グ',K03:'シ',K04:'フ',K06:'ガ',K11:'レ',K21:'バ'};
const attributes:Record<Attribute,string>={gun:'銃撃',shell:'砲撃',blast:'爆撃',heat:'熱撃',cold:'冷撃',electric:'電撃',beam:'光線',impact:'衝撃'};
const shapes={single:'単体',line:'直線',cross:'十字',square:'方形',cone:'扇'};
export const statusNames={shellBreak:'外殻破損',burn:'燃焼',chill:'冷却'};
const roles:Record<string,string>={
  infantry:'地形を使う低COSTの歩兵。装備で救護や対大型を担当。',sniper:'長射程から本体と部位を狙う狙撃兵。',
  apc:'高機動で小型敵に対応する装甲車。',tank:'砲撃で高DEF敵に対応する前衛。',heavy:'向きと占有範囲を管理する重前衛。',
  helicopter:'空中から地上・航空敵へ対応。',aa:'航空敵への迎撃・射撃担当。',lightArt:'間接射撃で複数マスを攻撃。',
  heavyArt:'長射程の間接射撃と範囲攻撃を担当。',repair:'地上機械や防衛施設を修理。',supply:'有効な消費武装へ弾薬を補給。',
  K01:'近くの同種に応じて群体打撃を強化。',K03:'防御姿勢で被害を軽減。',K04:'空中戦と地上への急降下。',K06:'複数セルを占有し、正面突進で押し出す。',
  K11:'地上と空中を射程に収める光線。',K21:'両層を占有。頭部と胸部に制約される予告光線を使用する。',
};
const metrics:Record<string,string>={kills:'撃破数',damage:'与ダメージ',gun:'銃撃ダメージ',shell:'砲撃ダメージ',ground:'対地ダメージ',antiAirGun:'対空銃撃',moved:'移動後ダメージ',area:'範囲ダメージ',large:'対大型ダメージ',frontal:'正面被弾',healed:'回復量',repair:'修理回数',supplied:'補給量',supply:'補給回数'};

export const assets:{
  units:Partial<Record<string,string|ReadonlyArray<string>>>;
  terrain:Partial<Record<string,string>>;
  effects:Partial<Record<Attribute|string,string>>;
}={units:{},terrain:{},effects:{}};
export function modelArt(id:string,facing=0){
  const asset=assets.units[id],src=typeof asset==='string'?asset:asset?.[facing];
  return src?'<img class="unit-image" src="'+esc(src)+'" alt="">':esc(icons[id]??'？');
}
export const partEffect=(p:{id:string;defense?:number;movement?:number})=>p.defense?'DEF −'+p.defense:p.movement?'MOV −'+p.movement:p.id==='head'?'頭部光線・予告光線を停止':p.id==='chest'?'予告光線を停止':'対応する武装を制限';
export function weaponInfo(model:string,id:string){
  const w=weaponFor(model,id);
  return '<strong>'+esc(w.name)+'</strong> <small>'+[
    w.attribute?attributes[w.attribute]:'支援','射程 '+w.range.join('–'),shapes[w.shape??'single'],
    w.layers.map(layerName).join('・'),w.directed==='cardinal'?'前方直線':w.directed==='front'?'前方・側方':w.shape==='cone'?'扇の方向制約':'全方向',w.indirect?'間接':'直接',
    ...(w.uses===undefined?[]:['回数 '+w.uses]),...(w.power?[w.kind==='supply'?'補給 '+w.power:'威力 '+w.power+'%'+(w.hits?' ×'+w.hits:'')]:[]),
    ...(w.status?[statusNames[w.status]]:[]),...(w.push?['押し出し '+w.push]:[]),...(w.telegraph?['予告攻撃']:[]),
  ].join(' ／ ')+'</small>';
}
function affinities(id:string,b?:Battle,u?:Unit){
  return '<dl class="affinities">'+(Object.keys(attributes) as Attribute[]).map(k=>'<div><dt>'+attributes[k]+'</dt><dd>'+(b&&u?effectiveAffinity(b,u,k):modelFor(id).affinity?.[k]??100)+'%</dd></div>').join('')+'</dl>';
}
export const meritCondition=(m:{metric:string;threshold:number;effect:string;amount:number})=>
  (metrics[m.metric]??m.metric)+' '+m.threshold+'〜 → '+m.effect+' '+m.amount;
export function unitDetails(b:Battle,u:Unit){
  const m=modelFor(u.model);
  return '<section class="panel details" aria-label="戦闘詳細"><h3>戦闘詳細</h3><p>'+esc(roles[u.model]??m.group)+'</p>'+affinities(u.model,b,u)+
    '<p>ATK '+u.atk+' ／ DEF '+effectiveDefense(u)+' ／ MOV '+(m.move?movement(u):0)+'</p>'+
    u.weapons.map(id=>'<p>'+weaponInfo(u.model,id)+'</p>').join('')+
    (m.parts??[]).map(p=>'<div class="row"><span>'+esc(p.label)+'（'+layerName(p.layer)+'）</span><small>'+u.parts[p.id]+'/'+u.partMax[p.id]+' ／ '+partEffect(p)+'</small></div>').join('')+
    u.equipment.map(id=>'<p>'+esc(equipment[id]?.name)+' <small>'+esc(equipment[id]?.description)+'</small></p>').join('')+
    (u.burn?'<p>燃焼 残り'+u.burn.remaining+'R</p>':'')+(u.chill?'<p>冷却 R'+u.chill.through+'の対象手番終了まで</p>':'')+
    (u.shellBreak?'<p>外殻破損 残り'+u.shellBreak+'手番</p>':'')+'</section>';
}
export function encyclopediaPage(c:Campaign,faction:'ally'|'enemy',selected:string){
  const seen=new Set(c.bestiary??[]),ids=faction==='ally'?unlockedModels(c):enemyModels;
  const grouped=new Map<string,string[]>();
  for(const id of ids){
    const group=modelFor(id).group;
    const entries=grouped.get(group)??[];entries.push(id);grouped.set(group,entries);
  }
  const known=ids.includes(selected)&&(faction==='ally'||seen.has(selected));
  const visible=(id:string)=>faction==='ally'||seen.has(id);
  const detail=()=>{
    if(!known)return '<section class="panel"><p>登録済みの個体を選択してください。</p></section>';
    const m=modelFor(selected),size=m.size==='long'?'1×2':m.size+'×'+m.size,slots=m.slots;
    return '<section class="panel encyclopedia-detail"><h2><span class="catalog-mark">'+modelArt(selected)+'</span> '+esc(m.name)+'</h2>'+
      '<p>'+esc(roles[selected]??m.group)+'</p><h3>基礎能力（Lv1）</h3><p>HP '+m.hp+' ／ ATK '+m.atk+' ／ DEF '+m.def+' ／ MOV '+m.move+(slots?' ／ COST '+m.cost:'')+'</p>'+
      '<p>'+size+' ／ '+(m.airCells?'地上・空中':layerName(m.layer))+' ／ '+(m.facing?'向き管理あり':'向き管理なし')+'</p>'+
      '<h3>被ダメージ相性</h3>'+affinities(selected)+'<h3>'+(slots?'固定武装':'攻撃・能力')+'</h3>'+
      m.weapons.map(id=>'<p>'+weaponInfo(selected,id)+'</p>').join('')+
      (slots?'<h3>装備適合</h3><p>選択武装 '+slots[0]+'枠 ／ 追加装備 '+slots[1]+'枠</p><p>'+Object.keys(weapons).filter(id=>weapons[id]?.cost&&compatible(selected,id)).map(id=>esc(weaponFor(selected,id).name)).join('、')+'</p><p>'+
        Object.keys(equipment).filter(id=>compatible(selected,id)).map(id=>esc(equipment[id]?.name)).join('、')+'</p><h3>功績</h3>'+(m.merits??[]).map(x=>'<p>'+esc(meritCondition(x))+'</p>').join(''):'')+
      (m.parts?.length?'<h3>部位</h3>'+m.parts.map(p=>'<p>'+esc(p.label)+'（'+layerName(p.layer)+'）耐久 '+p.hp+' ／ '+partEffect(p)+'</p>').join(''):'')+'</section>';
  };
  return '<main class="encyclopedia"><div class="actions">'+btn('戻る','close-book')+btn('自軍図鑑','book-tab','ally',false,faction==='ally'?'on':'')+
    btn('敵軍図鑑','book-tab','enemy',false,faction==='enemy'?'on':'')+'<strong>登録 '+(faction==='ally'?ids.length:seen.size)+(faction==='enemy'?' / '+ids.length:'')+'</strong></div>'+
    '<div class="columns"><section class="panel">'+[...grouped].map(([g,entries])=>'<h2>'+esc(g)+'</h2><div class="stack">'+entries.map(id=>
      visible(id)?btn(modelFor(id).name,'book-model',id,false,selected===id?'on':''):'<button disabled aria-label="未登録">？？？</button>').join('')+'</div>').join('')+'</section>'+detail()+'</div></main>';
}
