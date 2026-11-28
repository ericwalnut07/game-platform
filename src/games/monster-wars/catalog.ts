import type { Equipment, Merit, Metric, Model, Weapon } from './types';

const ground = ['ground'] as const;
const air = ['air'] as const;
const both = ['ground','air'] as const;
const gun = (name: string, attribute: NonNullable<Weapon['attribute']>, power: number, hits: number, min: number, max: number, layers: readonly ('ground'|'air')[] = ground, extra: Partial<Weapon> = {}): Weapon =>
  ({name, attribute, power, hits, range:[min,max], layers:[...layers], ...extra});
const support = (name: string, kind: 'repair'|'supply'|'medic', power: number, extra: Partial<Weapon> = {}): Weapon =>
  ({name, kind, power, range:[1,2], layers:['ground'], indirect:true, ...extra});
const front = { directed:'front', origin:'front' } as const;
export const weapons: Record<string, Weapon> = {
  rifle: gun('アサルトライフル','gun',50,3,1,4,ground,{overwatch:true}),
  cannon: gun('車載機関砲','gun',45,3,1,4,ground,{overwatch:true}),
  tank: gun('戦車砲','shell',150,1,1,5,ground,{...front,overwatch:true}),
  heavy: gun('重戦車砲','shell',190,1,2,6,ground,{...front,overwatch:true}),
  helicopter: gun('機首機関砲','gun',40,4,1,4,both),
  aa: gun('対空機関砲','gun',35,5,1,5,both,{overwatch:true}),
  lightArt: gun('軽榴弾砲','blast',100,1,2,6,ground,{shape:'cross',indirect:true}),
  heavyArt: gun('重榴弾砲','blast',110,1,3,8,ground,{shape:'square',indirect:true,afterMove:80}),
  sniper: gun('対物狙撃銃','gun',170,1,3,7,both,{overwatch:true}),
  repair: support('固定修理装置','repair',350,{facility:true}),
  supply: support('固定補給装置','supply',2,{uses:5}),
  W01: gun('高威力ライフル弾','gun',70,3,1,4,ground,{uses:5,cost:2}),
  W04: gun('徹甲機関砲弾','gun',55,4,1,5,both,{uses:4,cost:4,pierce:25}),
  W06: gun('部位破砕狙撃弾','gun',180,1,3,7,both,{uses:4,cost:4,partBonus:50}),
  W09: gun('標準徹甲弾','shell',170,1,1,5,ground,{uses:5,cost:3,pierce:20}),
  W11: gun('外殻破砕弾','shell',140,1,2,5,ground,{uses:3,cost:4,status:'shellBreak'}),
  W13: gun('対大型ロケット弾','shell',200,1,2,6,ground,{uses:4,cost:4,largeBonus:20}),
  W14: gun('高速対空ミサイル','shell',190,1,2,7,air,{uses:4,cost:4}),
  W16: gun('部位破砕ミサイル','shell',180,1,2,7,both,{uses:3,cost:5,partBonus:60}),
  W18: gun('破片手榴弾','blast',100,1,1,3,ground,{uses:3,cost:2,shape:'cross',indirect:true}),
  W19: gun('高性能榴弾','blast',130,1,2,6,ground,{uses:4,cost:3,shape:'cross'}),
  W20: gun('集束榴弾','blast',100,1,3,8,ground,{uses:3,cost:4,shape:'square',indirect:true,afterMove:80}),
  W26: gun('火炎放射器','heat',45,3,1,2,ground,{uses:5,cost:3,shape:'cone',status:'burn'}),
  W30: gun('冷却弾','cold',100,1,1,4,ground,{uses:4,cost:3,status:'chill'}),
  W45: support('戦場救護装置','medic',250,{uses:5,cost:3}),
  W46: support('応急修理装置','repair',150,{uses:4,cost:3}),
  W47: support('携行補給装置','supply',1,{uses:3,cost:3}),
  claw: gun('群体打撃','impact',130,1,1,1,ground,{facility:true}),
  shellClaw: gun('硬殻打撃','impact',150,1,1,1),
  airClaw: gun('空中打撃','impact',120,1,1,1,air),
  dive: gun('急降下','impact',180,1,1,1,ground,{cooldown:2,facility:true}),
  gClaw: gun('重量打撃','impact',180,1,1,1,ground,{origin:'front',facility:true}),
  charge: gun('正面突進','impact',200,1,1,1,ground,{directed:'cardinal',origin:'front',push:1,cooldown:2,facility:true}),
  ray: gun('光線','beam',150,1,2,6,both),
  lineRay: gun('長射程光線','beam',220,1,2,8,both,{directed:'cardinal',origin:'front',shape:'line',both:true,cooldown:3}),
  stomp: gun('踏みつけ','impact',155,1,1,1,ground,{origin:'front',anyPart:['legL','legR']}),
  sweepL: gun('左腕薙ぎ','impact',115,1,1,2,air,{shape:'cone',origin:'armL',parts:['armL']}),
  sweepR: gun('右腕薙ぎ','impact',115,1,1,2,air,{shape:'cone',origin:'armR',parts:['armR']}),
  headRay: gun('頭部光線','beam',135,1,2,6,both,{origin:'head',parts:['head']}),
  groundShock: gun('大地衝撃波','impact',150,1,1,2,ground,{radial:2,indirect:true,cooldown:3}),
  collapse: gun('大地崩壊','impact',240,1,1,3,ground,{radial:3,indirect:true,cooldown:4,telegraph:true,parts:['belly']}),
  warningRay: gun('予告光線','beam',250,1,2,8,both,{directed:'cardinal',origin:'head',shape:'line',threeLanes:true,both:true,cooldown:4,telegraph:true,parts:['head','chest']}),
};
const merit = (metric: Metric, threshold: number, effect: string, amount: number): Merit => ({metric, threshold, effect, amount});
const offence = (kills: number, damage: number, third: Merit) => [merit('kills',kills,'ATK',3),merit('damage',damage,'HP',4),third];
const model = (name: string, group: string, [hp,atk,def,move,cost]:[number,number,number,number,number], weapon: string[], extra: Partial<Model> = {}): Model =>
  ({name,group,hp,atk,def,move,cost,size:1,layer:'ground',weapons:weapon,...extra});
const player = (name: string, group: string, stats: [number,number,number,number,number], weapon: string, slots: [number,number], merits: Merit[], extra: Partial<Model> = {}) =>
  model(name,group,stats,[weapon],{slots,merits,...extra});
const infantryAffinity = {gun:100,shell:60,blast:125,heat:125,cold:100,electric:75,beam:75,impact:60};
export const models: Record<string, Model> = {
  infantry: player('標準歩兵','一般歩兵',[150,40,5,4,6],'rifle',[1,2],offence(9,900,merit('gun',900,'銃撃',4)),{affinity:infantryAffinity}),
  apc: player('標準装甲車','装甲車',[220,50,20,6,11],'cannon',[1,2],offence(9,1500,merit('gun',1200,'銃撃',4))),
  tank: player('標準戦車','戦車',[280,85,35,4,20],'tank',[2,2],offence(6,1800,merit('shell',1800,'砲撃',4)),{facing:true}),
  heavy: player('重装甲戦車','戦車',[360,85,45,3,24],'heavy',[2,2],offence(6,2100,merit('frontal',1200,'正面軽減',4)),{size:'long',facing:true,frontArmor:true}),
  helicopter: player('標準攻撃ヘリ','攻撃ヘリ',[200,75,10,7,16],'helicopter',[2,2],offence(9,1800,merit('ground',1500,'対地',4)),{layer:'air'}),
  aa: player('対空機関砲車','対空車両',[160,65,15,5,16],'aa',[2,1],offence(9,1500,merit('antiAirGun',1200,'対空銃撃',5))),
  lightArt: player('軽自走砲','自走砲',[160,85,12,5,15],'lightArt',[2,1],offence(12,2100,merit('moved',1500,'移動後',5))),
  heavyArt: player('重自走砲','自走砲',[220,110,20,3,21],'heavyArt',[2,1],offence(15,3000,merit('area',2700,'範囲',4)),{size:'long',facing:true}),
  repair: player('修理車','支援車両',[180,40,15,4,14],'repair',[1,3],[merit('healed',1500,'共通修理',3),merit('repair',9,'HP',4),merit('healed',1500,'固有修理',6)]),
  supply: player('補給車','支援車両',[160,25,12,5,12],'supply',[1,3],[merit('supplied',12,'共通補給',1),merit('supply',9,'HP',4),merit('supplied',12,'固有補給',1)]),
  sniper: player('対物狙撃兵','狙撃兵',[125,70,3,2,10],'sniper',[1,2],offence(3,1500,merit('large',1200,'対大型',6)),{affinity:infantryAffinity}),
  K01: model('グラッカー','怪獣',[150,35,3,5,0],['claw'],{affinity:{gun:125,heat:125}}),
  K03: model('シェルガ','怪獣',[180,45,20,3,0],['shellClaw'],{defense:50,affinity:{gun:75,shell:125}}),
  K04: model('フライガ','怪獣',[150,40,4,7,0],['airClaw','dive'],{layer:'air',affinity:{gun:125}}),
  K06: model('ガルドン','怪獣',[650,85,35,3,0],['gClaw','charge'],{size:'long',facing:true,affinity:{gun:75,shell:125}}),
  K11: model('レイガロン','怪獣',[1200,110,20,3,0],['ray','lineRay'],{size:2,facing:true,affinity:{beam:75}}),
  wingRay: gun('光線','beam',150,1,2,5,both),
  wingBlade: gun('翼刃','impact',180,1,1,2,ground,{shape:'cone',sourceLayer:'air',cooldown:3}),
  skyStrike: gun('翼撃','impact',150,1,1,2,both),
  skyDive: gun('急降下','impact',200,1,1,1,ground,{sourceLayer:'air',cooldown:2}),
  K14: model('スカイラ','怪獣',[400,75,10,3,0],['skyStrike','skyDive'],{size:'long',facing:true,flightMove:7,affinity:{gun:125,cold:125}}),
  K15: model('ヴァルウィング','怪獣',[1400,100,20,3,0],['wingRay','wingBlade'],{size:2,facing:true,flightMove:6,wingParts:['wingL','wingR'],parts:[{id:'wingL',label:'左翼',layer:'air',cells:[[0,0],[0,1]],hp:400},{id:'wingR',label:'右翼',layer:'air',cells:[[1,0],[1,1]],hp:400}]}),
  K13: model('デストロン','怪獣',[1600,120,25,3,0],['groundShock'],{size:2,facing:true}),
  K22: model('ゼルガノス','怪獣',[4500,115,40,4,0],['collapse'],{size:3,facing:true,crush:true,airCells:[[1,0],[1,1]],affinity:{gun:75,shell:125,cold:125,impact:75},parts:[{id:'belly',label:'腹部',layer:'ground',cells:[[1,1]],hp:900,defense:10}]}),
  K21: model('バルガンド','怪獣',[5000,125,65,2,0],['stomp','sweepL','sweepR','headRay','warningRay'],{
    size:3,facing:true,crush:true,airCells:[[1,0],[0,1],[2,1],[1,1]],affinity:{gun:75,blast:125},
    parts:[
      {id:'shell',label:'外殻',layer:'ground',cells:[[0,0],[1,0],[2,0],[1,1]],hp:1800,defense:20},
      {id:'legL',label:'左脚',layer:'ground',cells:[[0,2]],hp:650,movement:1},
      {id:'legR',label:'右脚',layer:'ground',cells:[[2,2]],hp:650,movement:1},
      {id:'head',label:'頭部',layer:'air',cells:[[1,0]],hp:650},
      {id:'armL',label:'左腕',layer:'air',cells:[[0,1]],hp:650},
      {id:'armR',label:'右腕',layer:'air',cells:[[2,1]],hp:650},
      {id:'chest',label:'胸部',layer:'air',cells:[[1,1]],hp:800},
    ],
  }),
  facility: model('防衛施設','施設',[600,0,35,0,0],[],{size:2}),
};
export const equipment: Record<string,Equipment> = Object.fromEntries(([
  ['P01','高精度照準装置',3,'単体ダメージ+10%'],['P02','貫通補助装置',3,'銃・砲・光線のDEF無視15%'],
  ['P03','大型敵照準装置',4,'2×2以上へのダメージ+15%'],['P05','範囲攻撃制御装置',4,'範囲ダメージ+12%'],
  ['P06','部位破壊照準装置',4,'部位耐久ダメージ+25%'],['P09','強化外装',4,'最大HP+15%'],
  ['P16','防御姿勢安定装置',4,'標準防御を45%軽減に変更'],['P20','旋回補助装置',3,'90度分の旋回費を毎R1回免除'],
  ['P17','軽量機動装備',3,'歩兵MOV+1'],
  ['P23','拡張弾薬庫',3,'選択攻撃武装の弾薬+1'],['P36','補給効率化装置',4,'補給量+1点'],
] as const).map(([id,name,cost,description])=>[id,{name,cost,description}]));
export const affinities: Record<string,string[]> = {
  W01:['infantry'],W04:['apc','helicopter','aa'],W06:['sniper'],W09:['tank','heavy'],W11:['tank','heavy'],
  W13:['infantry'],W26:['infantry'],W30:['infantry','sniper'],W45:['infantry'],W14:['aa','helicopter'],W16:['heavy','helicopter'],W18:['infantry','sniper'],
  W19:['tank','heavy','lightArt','heavyArt'],W20:['heavyArt'],W46:['apc','repair','supply'],W47:['apc','repair','supply'],
};
export function weaponFor(modelId: string, id: string): Weapon {
  const base = weapons[id];
  if(!base)throw Error('Unknown weapon: '+id);
  if (!base.cost || base.kind) return base;
  if (id === 'W04' && modelId === 'apc') return {...base,layers:['ground']};
  if (modelId === 'tank' || modelId === 'heavy') return {...base,...front};
  if (id === 'W19') return {...base,indirect:true,...(modelId==='heavyArt'?{afterMove:80}:{})};
  return base;
}
export function compatible(modelId: string, id: string): boolean {
  const model = models[modelId];
  if (!model?.slots) return false;
  const allowed=affinities[id];
  if (allowed) return allowed.includes(modelId);
  if (id === 'P09' || id === 'P16' || id === 'P10' || id === 'P14') return true;
  if (id === 'P17') return isInfantry(modelId);
  if (id === 'P20') return !!model.facing;
  if (id === 'P36') return (affinities.W47??[]).includes(modelId);
  const choices = Object.entries(affinities).filter(([,ids])=>ids.includes(modelId)).map(([id])=>id);
  const attacks = [...model.weapons,...choices].map(w=>weaponFor(modelId,w)).filter(w=>!w.kind);
  if (id === 'P04') return attacks.some(w=>(w.hits??1)>=2);
  if (id === 'P31') return attacks.length>0;
  if (id === 'P29') return attacks.some(w=>w.overwatch);
  if (id === 'P35') return [...model.weapons,...choices].map(w=>weaponFor(modelId,w)).some(w=>w.kind==='repair'||w.kind==='medic');
  if (id === 'P05') return attacks.some(w=>w.shape && w.shape!=='single');
  if (id === 'P01') return attacks.some(w=>!w.shape || w.shape==='single');
  if (id === 'P02') return attacks.some(w=>['gun','shell','beam'].includes(w.attribute ?? ''));
  if (id === 'P23') return choices.some(w=>!weaponFor(modelId,w).kind && weaponFor(modelId,w).uses);
  return (id === 'P03' || id === 'P06') && attacks.length>0;
}
export const unlocks = [
  ['infantry','apc','tank','W01','W09','W18','P01','P09','W45'],
  ['helicopter','aa','repair','supply','W04','W14','W46','W47','P02','P16','P23','P36','W13','P17'],
  ['heavy','lightArt','heavyArt','sniper','W06','W11','W19','W20','W16','P03','P05','P06','P20','W26','W30'],
] as const;
export const duplicateRates: Record<string,[number,number]> = {'一般歩兵':[10,15],'装甲車':[5,15],'戦車':[10,15],'攻撃ヘリ':[10,15],'対空車両':[5,20],'自走砲':[10,20],'支援車両':[5,20],'狙撃兵':[10,15],'重火器兵':[10,15],'工兵':[10,15]};

export function modelFor(id:string):Model{
  const value=models[id];
  if(!value)throw Error('Unknown model: '+id);
  return value;
}
export function equipmentFor(id:string):Equipment{
  const value=equipment[id];
  if(!value)throw Error('Unknown equipment: '+id);
  return value;
}

export const isInfantry = (id:string) => ['一般歩兵','狙撃兵','重火器兵','工兵'].includes(modelFor(id).group);
