import { describe, expect, it } from 'vitest';
import legacy from '../monster-wars/fixtures/legacy-v1.json';
import { compatible, equipment, models, weapons } from '../../src/games/monster-wars/catalog';
import { allocate, award, freshCampaign, rosterCost, sortieError } from '../../src/games/monster-wars/campaign';
import { createBattle, playerUnits, unit, type Battle, type Unit } from '../../src/games/monster-wars/battle-state';
import { act, autoAction, command, enemyAction, legalTargets, movement, type Action } from '../../src/games/monster-wars/battle';
import { planAttack } from '../../src/games/monster-wars/attack';
import { cellsOf, occupied, placement } from '../../src/games/monster-wars/grid';
import { ceiling, missionFor, missionIds, recommendedLevel } from '../../src/games/monster-wars/missions';
import { decode, encode, upgradeSave } from '../../src/games/monster-wars/save';
import type { Cell, RosterEntry } from '../../src/games/monster-wars/types';

const run=(b:Battle,a:Action)=>act(b,command(b,a))!;
const entry=(model:string,weapons:string[]=[],equipment:string[]=[]):RosterEntry=>({model,weapons,equipment});
function duel(){
  const c=freshCampaign();
  c.roster=[entry('infantry',['W26']),entry('infantry',['W30'],['P17']),entry('infantry',['W45']),entry('supply')];
  const b=createBattle(c,'MVP01','easy');
  b.terrain.fill('plain');
  const [flame,cold,medic,supplier]=playerUnits(b) as [Unit,Unit,Unit,Unit];
  flame.at=[4,5];cold.at=[5,6];medic.at=[4,7];supplier.at=[3,6];
  const target=unit({id:'minion',model:'K01',at:[4,4],facing:2},'enemy',1,100);
  target.maxHp=300;target.hp=300;
  b.units=[flame,cold,medic,supplier,target];
  return {b,flame,cold,medic,supplier,target};
}
const onGround=(at:Cell)=>({at,layer:'ground' as const});

describe('playtest adjustments',()=>{
  it('applies the new allocation, unlocks, roster costs and production level curve',()=>{
    expect(['infantry','sniper','apc','helicopter'].map(id=>[models[id]?.hp,models[id]?.cost])).toEqual([[150,6],[125,10],[220,11],[200,16]]);
    expect(Object.values(weapons).filter(w=>w.cost)).toHaveLength(16);
    expect(Object.keys(equipment)).toHaveLength(11);
    expect(compatible('infantry','P17')).toBe(true);
    expect(compatible('sniper','W30')).toBe(true);
    expect(compatible('sniper','W13')).toBe(false);
    expect(freshCampaign().open).toContain('W45');
    const c=award(freshCampaign(),'MVP01','easy',1,{});
    expect(c.open).toEqual(expect.arrayContaining(['W13','P17']));
    expect(c.open).not.toContain('W26');
    expect(award(c,'MVP02','easy',2,{}).open).toEqual(expect.arrayContaining(['W26','W30']));
    const costs=[1,2,4,6,8,10].map(n=>rosterCost(Array.from({length:n},()=>entry('infantry'))));
    expect(costs).toEqual([6,14,34,60,92,130]);
    const roster=[entry('sniper',['W30']),entry('infantry',['W26']),entry('infantry',[],['P17'])];
    expect(rosterCost(roster)).toBe(rosterCost([...roster].reverse()));
    expect(rosterCost(roster)-rosterCost(roster.map(r=>entry(r.model)))).toBe(9);
    for(const id of missionIds)expect([ceiling(missionFor(id),'easy'),ceiling(missionFor(id),'normal')]).toEqual([103,118]);
    expect(recommendedLevel(40,'inferno')).toBe(50);
    expect(sortieError({...c,roster:Array.from({length:10},()=>entry('infantry'))},'MVP01','normal')).toMatch(/COST/);
  });
  it('matches boss battle stats and checks initial and alternative spawn cells',()=>{
    for(const [d,hp,atk,part] of [['easy',4000,100,1440],['normal',5750,140,2070]] as const){
      const b=createBattle(freshCampaign(),'MVP03',d),boss=b.units.find(u=>u.model==='K21');
      expect(boss).toMatchObject({maxHp:hp,atk,partMax:{shell:part}});
    }
    for(const id of missionIds){
      const b=createBattle(freshCampaign(),id,'easy'),m=missionFor(id),used=occupied(b);
      expect(used.size).toBe(b.units.flatMap(cellsOf).length);
      for(const w of m.waves)for(const at of [w.at,...w.alternatives]){
        expect(placement(b,w.model,{at,facing:w.facing},used)).toBe(true);
      }
    }
    expect(missionFor('MVP01').enemies).toHaveLength(10);
    expect(missionFor('MVP03').enemies.map(u=>u.model)).not.toContain('K11');
    expect(missionFor('MVP03').waves.every(w=>w.round===4&&!w.required)).toBe(true);
    const b=createBattle(freshCampaign(),'MVP03','easy');
    b.units.find(u=>u.model==='K21')!.hp=0;
    expect(run(b,{type:'wait',id:'P01'}).result).toBe('win');
  });
  it('uses a directed ground fan, applies nonstacking burn and ticks damage three times',()=>{
    const {b,flame,target}=duel();
    expect(planAttack(b,flame,'W26',{at:target.at,layer:'air'})).toBeNull();
    const hit=run(b,{type:'attack',id:flame.id,weapon:'W26',target:onGround(target.at)});
    expect(hit.units.find(u=>u.id===target.id)?.burn).toEqual({source:flame.id,remaining:3});
    const hp=hit.units.find(u=>u.id===target.id)!.hp;
    let next=hit;
    for(let i=1;i<=3;i++){
      next=run(run(next,{type:'end'}),{type:'end'});
      expect(next.units.find(u=>u.id===target.id)?.hp).toBe(hp-i*15);
    }
    expect(next.units.find(u=>u.id===target.id)?.burn).toBeUndefined();
  });
  it('chills ground targets for two owner turns and applies equipment MOV',()=>{
    const {b,cold,target}=duel();
    expect(movement(cold)).toBe(5);
    expect(legalTargets(b,cold,'W30').map(p=>p.target.layer)).toEqual(['ground']);
    let next=run(b,{type:'attack',id:cold.id,weapon:'W30',target:onGround(target.at)});
    expect(movement(next.units.find(u=>u.id===target.id)!)).toBe(3);
    next=run(run(next,{type:'end'}),{type:'end'});
    expect(next.units.find(u=>u.id===target.id)?.chill).toBeDefined();
    next=run(run(next,{type:'end'}),{type:'end'});
    expect(next.units.find(u=>u.id===target.id)?.chill).toBeUndefined();
  });
  it('heals only another living infantry unit and treats aid stock as non-replenishable',()=>{
    const {b,flame,medic,supplier}=duel();
    flame.hp=40;
    expect(planAttack(b,medic,'W45',onGround(medic.at))).toBeNull();
    expect(planAttack(b,medic,'W45',onGround(supplier.at))).toBeNull();
    const healed=run(b,{type:'attack',id:medic.id,weapon:'W45',target:onGround(flame.at)});
    expect(healed.units.find(u=>u.id===flame.id)?.hp).toBe(140);
    const updatedMedic=healed.units.find(u=>u.id===medic.id)!;
    expect(updatedMedic.ammo.W45).toBe(4);
    expect(planAttack(healed,healed.units.find(u=>u.id===supplier.id)!,'supply',onGround(updatedMedic.at))).toBeNull();
  });
  it('resumes mixed automation at the next legal action and preserves manual turns',()=>{
    const c=allocate({...freshCampaign(),xp:500},'戦車',240);
    let b=createBattle(c,'MVP01','normal');
    b=run(b,{type:'configure',ids:['P01','P02'],automatic:true,order:{kind:'focus',target:'E01'}});
    b=run(b,{type:'auto',finish:false});
    expect(act(b,command(b,{type:'end'}))).toBeNull();
    b=run(b,autoAction(b));
    const snapshot=decode(encode({campaign:{...c,nextBattle:2},battle:b},'mixed')).payload.battle!;
    expect(autoAction(snapshot)).toEqual(autoAction(b));
    let turns=0;
    while(b.automation&&turns++<20)b=run(b,autoAction(b));
    expect(turns).toBeLessThan(20);
    expect(b.side).toBe('player');
    expect(b.units.find(u=>u.id==='P03')).toMatchObject({main:true,move:true});
    expect(b.units.find(u=>u.id==='P01')).toMatchObject({main:false,move:false});
    b=run(b,{type:'configure',ids:['P01'],automatic:false});
    b=run(b,{type:'configure',ids:['P01'],automatic:true});
    expect(b.units.find(u=>u.id==='P01')).toMatchObject({main:false,move:false,order:{kind:'focus',target:'E01'}});
    b.units.find(u=>u.id==='E01')!.hp=0;
    b=run(b,{type:'configure',ids:['P02'],order:{kind:'guard',target:'P03'}});
    expect(b.units.find(u=>u.id==='P01')?.order).toEqual({kind:'free'});
    expect(b.units.find(u=>u.id==='P02')?.order).toEqual({kind:'guard',target:'P03'});
    b=run(b,{type:'auto',finish:true});
    expect(run(b,autoAction(b)).side).toBe('enemy');
  });
  it('migrates the original MVP save, including its live battle, without re-awarding anything',()=>{
    const original=decode(legacy),upgraded=upgradeSave(original),c=upgraded.campaign,b=upgraded.battle!;
    expect(b).toEqual({...original.payload.battle,rules:1});
    expect(b.units.some(u=>u.model==='K11')).toBe(true);
    expect(c.open).toEqual(expect.arrayContaining(['W13','W26','W30','W45','P17']));
    expect(c).toEqual({...original.payload.campaign,open:c.open,bestiary:[]});
    expect(award(c,'MVP01','easy',1,{})).toBe(c);
    expect(decode(encode(upgraded,original.saveId,original)).payload).toEqual(upgraded);
    expect(run(b,enemyAction(b)).revision).toBe(b.revision+1);
    expect(createBattle(c,'MVP03','easy').units.find(u=>u.model==='K21')?.hp).toBe(4000);
  });
});
