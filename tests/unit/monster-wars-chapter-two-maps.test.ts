import source from '../../docs/monster-wars/chapter-two-maps.md?raw';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { models, weapons } from '../../src/games/monster-wars/catalog';
import { missions } from '../../src/games/monster-wars/missions';
import { createBattle, playerUnits } from '../../src/games/monster-wars/battle-state';
import { act, autoAction, command, enemyAction } from '../../src/games/monster-wars/battle';
import { cellsOf, inside, occupied } from '../../src/games/monster-wars/grid';
import { freshCampaign } from '../../src/games/monster-wars/campaign';
import type { Cell, Direction, Layer, Mission, Rectangle, Terrain, Weapon } from '../../src/games/monster-wars/types';

type LayerCode='g'|'a'|'both';
type MapSpec={
  m:string; n:number; limit:number; z:[...Rectangle,LayerCode][];
  t:Partial<Record<Terrain|'fort',Rectangle[]>>;
  e:[string,number,number,Direction,LayerCode][];
  w:{k:string;x:number;y:number;d:Direction;l:LayerCode;r:number;alt:Cell[];pri:boolean}[];
  minGround?:number;minAir?:number;f?:Cell;facilityHp?:number;facilityDef?:number;
  priority?:[string,number,number][];
};
const maps=JSON.parse(source.split('```json')[1]!.split('```')[0]!) as MapSpec[];
const layer=(code:LayerCode):Layer=>code==='a'?'air':'ground';
const resolve=(id:string)=>({V:'K27',F:'K28',R:'K29'}[id]??id);
const pose=(model:string,x:number,y:number,facing:Direction,l:LayerCode)=>({
  model:resolve(model),at:[x,y] as Cell,facing,...(model==='K14'||model==='K15'?{flightLayer:layer(l)}:{}),
});
const fixtures:Record<string,Mission>=Object.fromEntries(maps.map(s=>{
  const zones=s.z.map(([x,y,r,b,l])=>({area:[x,y,r,b] as Rectangle,...(l==='both'?{}:{layer:layer(l)})}));
  const {fort,...terrain}=s.t;
  const bossModel=s.m==='M15'?'K22':s.m==='M16'?'K21':undefined;
  const mission:Mission={
    name:s.m,briefing:s.m,number:Number(s.m.slice(1)),size:s.n,limit:s.limit,zone:zones[0]!.area,
    deployment:{zones,minGround:s.minGround??0,minAir:s.minAir??0},
    terrain:{...terrain,...(fort?{defensive_position:fort}:{})},
    ...(s.f?{facilityAt:s.f}:{}),...(bossModel?{bossModel}:{}),goal:bossModel?'boss':s.f?'defend':'clear',
    enemies:s.e.map(([k,x,y,d,l],i)=>({...pose(k,x,y,d,l),id:'E'+(i+1),
      priority:!!s.priority?.some(([model,a,b])=>k===model&&x===a&&y===b)})),
    waves:s.w.map(({k,x,y,d,l,r,alt,pri},i)=>({...pose(k,x,y,d,l),id:'R'+(i+1),
      round:r,alternatives:alt,priority:pri,required:!bossModel})),
  };
  return [s.m,mission];
}));

// Register the audited subset in this test worker only. The remaining weapon,
// merit and AI checks are prerequisites for using these maps for balance runs.
const attack=(name:string,attribute:Weapon['attribute'] & string,power:number,range:[number,number],extra:Partial<Weapon>={}):Weapon=>
  ({name,attribute,power,range,hits:1,layers:['ground'],...extra});
const addedWeapons={
  glanshellStrike:attack('重装甲打撃','impact',180,[1,2]),
  frozelStrike:attack('冷撃','cold',120,[1,3]),
  frozelLine:attack('冷却直線','cold',140,[2,4],{directed:'front',shape:'line',status:'chill',duration:2,cooldown:3}),
  destronStrike:attack('破砕打撃','impact',180,[1,2],{facility:true}),
  aerosBomb:attack('爆撃','blast',120,[1,4],{layers:['ground','air']}),
  aerosArea:attack('範囲爆撃','blast',160,[2,5],{shape:'square',cooldown:3}),
  velzaStrike:attack('高速打撃','impact',120,[1,1]),
  balflareHeat:attack('熱弾','heat',130,[2,4]),
  balflareFlame:attack('火炎放射','heat',100,[1,2],{shape:'cone',cooldown:3,status:'burn'}),
  regelStrike:attack('再生怪獣打撃','impact',150,[1,1],{origin:'front',facility:true}),
};
const enemy=(name:string,hp:number,atk:number,def:number,move:number,ids:string[],extra:Partial<typeof models[string]>={}):typeof models[string]=>
  ({name,group:'怪獣',hp,atk,def,move,cost:0,layer:'ground',size:1,weapons:ids,...extra});
const addedModels={
  K08:enemy('フロゼル',500,75,18,3,['frozelStrike','frozelLine'],{size:'long',facing:true,affinity:{heat:150,cold:50}}),
  K10:enemy('グランシェル',1500,90,45,3,['glanshellStrike'],{size:2,facing:true,defense:50,affinity:{gun:50,shell:125,heat:75,beam:125,impact:75}}),
  K16:enemy('エアロス',1200,110,15,5,['aerosBomb','aerosArea'],{size:2,facing:true,layer:'air'}),
  K27:enemy('ヴェルザ',120,45,3,8,['velzaStrike'],{acceleration:true,affinity:{gun:150,blast:125,heat:125}}),
  K28:enemy('バルフレア',200,50,8,3,['balflareHeat','balflareFlame'],{affinity:{heat:50,cold:150}}),
  K29:enemy('レジェル',420,55,12,3,['regelStrike'],{size:'long',facing:true,regeneration:8,affinity:{blast:125,heat:150,cold:125}}),
};
const priorFacility=models.facility!, priorDestron=models.K13!;
beforeAll(()=>{
  Object.assign(models,addedModels,{facility:{...priorFacility,hp:1200,def:40},K13:{...priorDestron,weapons:['destronStrike',...priorDestron.weapons]}});
  Object.assign(weapons,addedWeapons);
  Object.assign(missions,fixtures);
});
afterAll(()=>{
  for(const id of Object.keys(addedModels))delete models[id];
  for(const id of Object.keys(addedWeapons))delete weapons[id];
  for(const id of Object.keys(fixtures))delete missions[id];
  Object.assign(models,{facility:priorFacility,K13:priorDestron});
});

it('connects the adopted map placements and preserves their stated totals',()=>{
  expect(maps.map(s=>s.m)).toEqual(['M09','M10','M11','M12','M13','M14','M15','M16']);
  expect(maps.map(s=>[s.e.length,s.w.length])).toEqual([[10,4],[11,5],[13,0],[10,8],[12,4],[12,4],[12,2],[7,2]]);
  for(const m of Object.values(fixtures)){
    const marks=m.enemies.flatMap(p=>cellsOf({...p,hp:1}));
    expect(new Set(marks.map(c=>c.layer+':'+c.at)).size,m.name).toBe(marks.length);
    for(const p of [...m.enemies,...m.waves]){
      expect(models[p.model]?.weapons.length,m.name+' '+p.model).toBeGreaterThan(0);
      for(const at of [p.at,...('alternatives' in p?p.alternatives as Cell[]:[])]){
        expect(cellsOf({...p,at,hp:1}).every(c=>inside(c.at,m.size)),m.name+' '+p.model+' '+at).toBe(true);
      }
    }
  }
  expect(fixtures.M12!.enemies.filter(e=>e.priority).length+fixtures.M12!.waves.filter(e=>e.priority).length).toBe(7);
});

function startSmokeBattle(id: string) {
  const c = freshCampaign();
  c.open.push('helicopter', 'aa');
  c.roster = (id === 'M14' ? ['tank', 'apc', 'infantry', 'helicopter', 'helicopter'] : ['tank', 'apc', 'aa', 'helicopter', 'infantry']).map(model => ({ model, weapons: [], equipment: [] }));
  const battle = createBattle(c, id, 'easy', true);
  expect(occupied(battle).size).toBe(battle.units.flatMap(cellsOf).length);
  return battle;
}

it.each(Object.keys(fixtures))('%s starts without overlapping units', id => {
  startSmokeBattle(id);
});

it.each(['M09','M10','M15','M16'])('%s starts and executes three rounds on the real Core',id=>{
  let b = startSmokeBattle(id);
  const configure=act(b,command(b,{type:'configure',ids:playerUnits(b).map(u=>u.id),automatic:true}));
  expect(configure).not.toBeNull();
  b=configure!;
  for(let i=0;b.round<4&&!b.result&&i<500;i++){
    const action=b.side==='enemy'?enemyAction(b):b.automation?autoAction(b):{type:'auto' as const,finish:true};
    const next=act(b,command(b,action));
    expect(next,id+' R'+b.round+' '+action.type).not.toBeNull();
    expect(next!.revision).toBeGreaterThan(b.revision);
    b=next!;
  }
  expect(b.round>=4||!!b.result).toBe(true);
},30000);

it('requires the layer minima and uses the adopted facility position',()=>{
  const c=freshCampaign();
  expect(()=>createBattle(c,'M10','easy',true)).toThrow('最低出撃数');
  expect(()=>createBattle(c,'M14','easy',true)).toThrow('最低出撃数');
  const facility=createBattle(c,'M12','easy',true).units.find(u=>u.model==='facility');
  expect(facility).toMatchObject({at:[10,10],hp:1200});
});
