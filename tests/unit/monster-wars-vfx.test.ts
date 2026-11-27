import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import manifest from '../../apps/monster-wars/vfx/manifest.json';
import { timeline } from '../../apps/monster-wars/vfx/timeline';
import { weapons as catalogWeapons } from '../../src/games/monster-wars/catalog';
import { weaponEffects } from '../../apps/monster-wars/vfx/weapons';
import { act, command } from '../../src/games/monster-wars/battle';
import { unit } from '../../src/games/monster-wars/battle-state';
import { hitPoint } from '../../apps/monster-wars/vfx/anchors';
import { trial, trials } from '../../apps/monster-wars/vfx/trial';

test('the nine registered sprite sheets match their hashes and RGBA dimensions',()=>{
  expect(manifest).toHaveLength(9);
  for(const m of manifest){
    const png=readFileSync('apps/monster-wars/vfx/'+m.file);
    expect(createHash('sha256').update(png).digest('hex')).toBe(m.sha256);
    expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual(m.size);
    expect(png[25]).toBe(6);
    expect(m.rows*m.columns).toBe(m.frames);
    expect([m.columns*m.frameSize,m.rows*m.frameSize]).toEqual(m.size);
  }
});

test('each preview executes a real Core attack and all four layer routes are represented',()=>{
  const weapons=new Set<string>(),routes=new Set<string>(),effectIds=new Set<string>(),motionIds=new Set<string>();
  for(const spec of trials){
    const {before,after}=trial(spec);
    expect(after,spec.weapon).not.toBeNull();
    const action=after!.events!.find(e=>e.kind==='attack');
    expect(action?.weapon).toBe(spec.weapon);
    if(!action)continue;
    weapons.add(action.weapon);
    routes.add(action.sourceLayer+'→'+action.layer);
    const state=structuredClone(after);
    const normal=timeline(before,after!,'normal');
    const fast=timeline(before,after!,'fast');
    const simple=timeline(before,after!,'simple');
    expect(normal.attacks[0]?.weapon).toBe(spec.weapon);
    expect(normal.effects.length).toBeGreaterThan(0);
    for(const e of normal.effects)effectIds.add(e.id);
    for(const b of normal.bodies)motionIds.add(b.id);
    if(spec.weapon==='W06'||spec.weapon==='W16'){
      const part=after!.events!.find(e=>e.kind==='damage'&&e.part);
      expect(part).toBeDefined();
      if(part?.kind!=='damage')throw Error('Part contact missing');
      const flight=normal.effects.find(e=>e.id===(spec.weapon==='W06'?'EF04':'EF05'));
      expect(flight?.to).toEqual(hitPoint(before.units[1]!,before.size,part.at!,part.layer!,part.part));
    }
    if(spec.weapon==='W20'){
      expect(normal.effects.filter(e=>e.id==='EF10')).toHaveLength(action.area.length);
      expect(after!.events!.filter(e=>e.kind==='damage'&&!e.part)).toHaveLength(1);
    }
    const support=after!.events!.find(e=>e.kind==='heal'||e.kind==='supply');
    if(support){
      expect(normal.effects.find(e=>e.id==='EF15'&&e.kind==='text')?.text).toMatch(new RegExp('＋'+support.amount+'$'));
    }
    expect(simple.effects.every(e=>!['EF01','EF04','EF05','EF06','EF12','EF13'].includes(e.id)),spec.weapon).toBe(true);
    expect(timeline(before,after!,'off').duration).toBe(0);
    expect(fast).toEqual(normal);
    expect(after).toEqual(state);
    if(action.layer==='air')expect(normal.effects.filter(e=>e.layer==='air').some(e=>e.id==='EF13'||e.id==='EF12')).toBe(false);
    if(spec.weapon==='rifle')expect(normal.effects.filter(e=>e.id==='EF04')).toHaveLength(action.strikes);
    if(spec.weapon==='charge')expect(after!.events!.some(e=>e.kind==='move'&&e.forced&&e.to[1]===4)).toBe(true);
    if(spec.weapon==='lineRay')expect(normal.effects.filter(e=>e.id==='EF06').map(e=>e.layer)).toEqual(['ground','air']);
    if(spec.weapon==='headRay')expect(action.sourceLayer).toBe('air');
  }
  expect(weapons).toEqual(new Set(Object.keys(weaponEffects)));
  expect(weapons.size).toBe(40);
  expect(routes.size).toBe(4);

  const prepared=trial(trials.find(s=>s.weapon==='warningRay')!).warning!;
  expect(prepared.after.warning?.cells.length).toBeGreaterThan(0);
  const scenarios=[prepared];
  const {before:initial}=trial(trials.find(s=>s.weapon==='headRay')!);
  const boss=initial.units[0]!,helicopter=initial.units[1]!;
  const battle=structuredClone(initial);
  battle.units[0]!.move=true;
  battle.terrain[4*battle.size+5]='building';
  const crushed=act(battle,command(battle,{type:'move',id:boss.id,pose:{at:[5,4],facing:0}}))!;
  expect(crushed?.terrain[4*battle.size+5]).toBe('rubble');
  expect(crushed.events).toContainEqual({kind:'terrain-break',at:[5,4]});
  scenarios.push({before:battle,after:crushed});
  const turned=act(battle,command(battle,{type:'move',id:boss.id,pose:{at:boss.at,facing:1}}))!;
  expect(turned?.events).toContainEqual(expect.objectContaining({kind:'move',facing:1}));
  scenarios.push({before:battle,after:turned});
  const guarded=act(initial,command(initial,{type:'guard',id:boss.id}))!;
  scenarios.push({before:initial,after:guarded});
  const ticking=structuredClone(initial);
  const victim=ticking.units[1]!;
  victim.burn={source:boss.id,remaining:1};
  victim.chill={source:boss.id,through:ticking.round};
  victim.shellBreak=1;
  ticking.side='player';
  const watch=unit({id:'watch',model:'infantry',at:[9,8],facing:0},'player',1,100);
  ticking.units.push(watch);
  const waiting=act(ticking,command(ticking,{type:'watch',id:watch.id,weapon:'rifle'}))!;
  scenarios.push({before:ticking,after:waiting});
  const enemyTurn=act(ticking,command(ticking,{type:'end'}))!;
  expect(enemyTurn.events?.filter(e=>e.kind==='status'&&e.cleared)).toHaveLength(2);
  scenarios.push({before:ticking,after:enemyTurn});
  const nextRound=act(enemyTurn,command(enemyTurn,{type:'end'}))!;
  expect(nextRound.events).toContainEqual(expect.objectContaining({kind:'damage',target:helicopter.id,cause:'burn'}));
  expect(nextRound.events).toContainEqual(expect.objectContaining({kind:'status',status:'burn',cleared:true}));
  expect(nextRound.events).toContainEqual(expect.objectContaining({kind:'spawn'}));
  scenarios.push({before:enemyTurn,after:nextRound});
  const defeat=trial(trials[0]!);
  defeat.before.units[1]!.hp=1;
  const finished=act(defeat.before,command(defeat.before,{type:'attack',id:'demo-source',weapon:'rifle',target:{at:[7,6],layer:'ground'}}))!;
  expect(finished.events).toContainEqual(expect.objectContaining({kind:'defeat'}));
  scenarios.push({before:defeat.before,after:finished});
  for(const scene of scenarios){
    const visual=timeline(scene.before,scene.after,'normal');
    for(const e of visual.effects)effectIds.add(e.id);
    for(const b of visual.bodies)motionIds.add(b.id);
  }
  expect([...effectIds].sort()).toEqual(Array.from({length:18},(_,i)=>'EF'+String(i+1).padStart(2,'0')));
  expect([...motionIds].sort()).toEqual(Array.from({length:10},(_,i)=>'M'+String(i+1).padStart(2,'0')));
});

test('the supported catalog is assigned to the twelve approved patterns',()=>{
  expect(Object.keys(weaponEffects).sort()).toEqual(Object.keys(catalogWeapons).sort());
  const groups=[
    'rifle W01 cannon helicopter aa W04','sniper W06','tank heavy W09 W11','W13 W14 W16',
    'lightArt heavyArt W18 W19 W20','W26','W30','claw shellClaw airClaw gClaw',
    'charge dive','stomp sweepL sweepR','ray lineRay headRay warningRay','repair W46 supply W47 W45',
  ];
  for(const [index,group] of groups.entries()){
    for(const key of group.split(' '))expect(weaponEffects[key]?.pattern).toBe('P'+String(index+1).padStart(2,'0'));
  }
});

// Reference timelines from 0482be61, including both helicopter routes.
const approvedTimelines=[
  ["8eaaea7dabe149c97d28014daa943b63f9a57b229b93030eb819c0bf5dd87581", "54e6b749f2d38b3ef152fca33bdb266d111aa2e49c346ca532c0a3abc2a6a00a"],
  ["c1e4bbe3f9da51c330801a309c395851fbf0adc046190269e58088ea2769df04", "08efca0ca1bcc7068873d6222482885d3bb7354fee2c2304812ad8af54914ae4"],
  ["92604c36477157585c8c05244f106e034a4741c1037cb8d95c2c840b91067d39", "cc17f49d89ea217b5c7bc4e3e0cf78952ed823dd820940fa06877f7221fedb38"],
  ["1cbd958d38ad4e3d67f4632bc5e9570b8087d68e9cf7a239e8f1f4f9cee28720", "19bf188b44133b82899a314188b5357e82716f40738f7815ce578f0d03ef5d61"],
  ["171ed97d34fe4a20b41543f742eb10b29839c4bf217ea6e15927b6c59f7c6db7", "73379307376dfac53166873a3b3446bbed679ac3699de3ba2e5166df7d765a10"],
  ["c9328440e0a359a7ac529f3ad95610846d58d4355318ace3ab5acff687da95b4", "8caaf003bb734a7d706f1ba461cf2481b211b5bb0706b0206e003b6698db7f92"],
  ["372fc437f354d44937fa59f86c1e78e61a2b629b2316d125ce9174dacb40faee", "c66bf9405e92dbb5463ae9d611cc059887ea60f18288f31537d003a5246f61cc"],
  ["c62b07e6dad9d1f8ee468f060baebcbd03dadc2ad20b1e4c5c9047bdebc737a3", "aeadd322f8fd41bb0547366e7c77cb5ca82a525a44ec6b1f82fbb87506af32df"],
  ["7766a6eb834dbab749e0fc3068ed8fabcc13cf22651a79ad214a311ab80ff8be", "4cda990c88d0de3994f6a69bcebac76d00b69c2b6345196428390f56aba7a5ef"],
  ["7fe42d30f9828cbea2ba9d1417542ff9127e9aa683df44380d829fb53849a27e", "e14a96e7095734c9539775a5b18b6304084e8fac5bcdb5ee90f437a8f03cef57"],
];
test.each(approvedTimelines.map((hashes,index)=>({hashes,index})))('approved preview $index matches both reference timelines',({hashes,index})=>{
  const {before,after}=trial(trials[index]!);
  expect(after).not.toBeNull();
  for(const [i,mode] of (['normal','simple'] as const).entries()){
    expect(createHash('sha256').update(JSON.stringify(timeline(before,after!,mode))).digest('hex')).toBe(hashes[i]);
  }
});
