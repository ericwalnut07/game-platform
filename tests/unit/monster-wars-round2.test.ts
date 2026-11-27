import { expect, it } from 'vitest';
import { planAttack } from '../../src/games/monster-wars/attack';
import { act, autoAction, command, paths } from '../../src/games/monster-wars/battle';
import { createBattle, unit, type Battle } from '../../src/games/monster-wars/battle-state';
import { award, freshCampaign } from '../../src/games/monster-wars/campaign';
import { discover, unlockedModels } from '../../src/games/monster-wars/encyclopedia';
import { cellsOf, distance, occupied, placement } from '../../src/games/monster-wars/grid';
import { missionFor } from '../../src/games/monster-wars/missions';
import { decode, encode, upgradeSave } from '../../src/games/monster-wars/save';
import type { Cell } from '../../src/games/monster-wars/types';
import legacy from '../monster-wars/fixtures/legacy-v2.json';
import layered from '../monster-wars/fixtures/layer-v3.json';

const end=(b:Battle)=>act(b,command(b,{type:'end'}))!;
it('uses the new HP and grants defense victory only after the planned waves or the deadline',()=>{
  for(const [difficulty,v] of [['easy',[120,144,120]],['normal',[172,207,172]]] as const){
    const b=createBattle(freshCampaign(),'MVP01',difficulty);
    expect(b.units.find(u=>u.model==='K01')?.hp).toBe(v[0]);
    expect(b.units.find(u=>u.model==='K03')?.hp).toBe(v[1]);
    expect(createBattle(freshCampaign(),'MVP02',difficulty).units.find(u=>u.model==='K04')?.hp).toBe(v[2]);
  }
  const b=createBattle(freshCampaign(),'MVP02','normal');
  for(const u of b.units)if(u.side==='enemy')u.hp=0;
  b.side='enemy';
  expect(end(b).result).toBeUndefined();
  b.spawned=missionFor(b.mission).waves.map(w=>w.id);
  expect(end(b).reason).toBe('敵全滅・防衛成功');
  b.round=12;b.spawned=[];b.units.find(u=>u.side==='enemy')!.hp=1;
  expect(end(b).reason).toBe('施設防衛成功');
  b.units.find(u=>u.id==='facility')!.hp=0;
  expect(end(b).result).toBe('loss');
});

it('places the waves without conflicts and gives every facility attacker time for two attacks',()=>{
  const b=createBattle(freshCampaign(),'MVP02','normal'),m=missionFor(b.mission),reserved=occupied(b);
  const facility=b.units.find(u=>u.id==='facility')!;
  expect([3,5,7].map(round=>m.waves.filter(w=>w.round===round).length)).toEqual([4,2,4]);
  for(const wave of m.waves){
    const positions=[wave.at,...wave.alternatives],own=new Set<string>();
    for(const at of positions){
      const pose={at,facing:wave.facing};
      expect(placement(b,wave.model,pose,reserved)).toBe(true);
      const start=unit({...wave,at},'enemy',6,100);
      for(const mark of cellsOf(start)){
        expect(cellsOf(facility).every(f=>distance(mark.at,f.at)>1)).toBe(true);
        own.add(mark.layer+':'+mark.at);
      }
      if(!wave.priority)continue;
      const test:Battle={...b,units:[facility,start],side:'enemy',round:wave.round+1};
      const seen=new Set<string>();
      let poses=[pose],reach=false;
      const fire=(from:typeof start)=>cellsOf(facility).some(c=>from.weapons.some(id=>planAttack(test,from,id,c)?.hits.some(h=>h.id===facility.id)));
      for(let r=wave.round+1;r<m.limit&&!reach;r++){
        const next:typeof poses=[];
        for(const p of poses){
          const actor={...start,...p,move:true,main:true};
          const k=p.at+':'+p.facing;
          if(seen.has(k))continue;
          seen.add(k);
          if(fire(actor)){reach=true;break;}
          for(const path of paths(test,actor).values()){
            const v=path.at(-1)!;
            if(fire({...actor,at:v.at,facing:v.facing})){reach=true;break;}
            next.push({at:v.at,facing:v.facing});
          }
          if(reach)break;
        }
        poses=next;
      }
      expect(reach,wave.id+' alternative '+at).toBe(true);
    }
    for(const key of own)reserved.add(key);
  }
});

it('keeps old defense limits, enemies and automatic orders through v2 migration',()=>{
  const old=decode(legacy), p=upgradeSave(old), b=p.battle!;
  expect(p.campaign).toEqual({...old.payload.campaign,bestiary:[],favorites:[]});
  expect(unlockedModels(p.campaign)).toContain('helicopter');
  expect(b).toEqual(old.payload.battle);
  expect(b.automation).toBe('run');
  expect(missionFor(b.mission,b.rules).limit).toBe(8);
  const b3={...b,round:3,side:'enemy' as const};
  delete b3.automation;
  const next=end(b3);
  expect(next.units.filter(u=>u.id.startsWith('R3')).map(u=>[u.model,u.hp])).toEqual([['K04',72],['K04',72]]);
  expect(decode(encode(p,old.saveId,old)).payload).toEqual(p);
});

it('records distinct enemy models from direct, automatic, fire and overwatch defeats',()=>{
  const {campaign,battle}=decode(structuredClone(layered)).payload;
  const soldier=battle!.units.find(u=>u.id==='P01')!, small=battle!.units.find(u=>u.id==='E05')!;
  small.hp=1;
  const hit=act(battle!,command(battle!,{type:'attack',id:soldier.id,weapon:'W06',target:{at:small.at,layer:'ground'}}))!;
  const unlocked=discover(campaign,hit.events??[]);
  expect(unlocked.bestiary).toEqual(['K01']);
  expect(discover(unlocked,hit.events??[])).toBe(unlocked);
  expect(discover(campaign,hit.events!.map(e=>e.kind==='defeat'?{...e,playerCredit:false}:e))).toBe(campaign);
  const auto=structuredClone(battle!);
  auto.units=auto.units.filter(u=>[soldier.id,small.id].includes(u.id));auto.units.find(u=>u.id===soldier.id)!.automatic=true;auto.automation='run';
  const automated=act(auto,command(auto,autoAction(auto)))!;
  expect(discover(campaign,automated.events??[]).bestiary).toEqual(['K01']);
  const fire=structuredClone(battle!);
  fire.side='enemy';const v=fire.units.find(u=>u.id===small.id)!;v.burn={source:soldier.id,remaining:1};
  expect(discover(campaign,end(fire).events??[]).bestiary).toEqual(['K01']);
  const watch=structuredClone(battle!);
  watch.side='enemy';
  const spotter=watch.units.find(u=>u.id===soldier.id)!;spotter.overwatch='sniper';
  const runner=watch.units.find(u=>u.id===small.id)!;runner.move=true;
  const reaction=act(watch,command(watch,{type:'move',id:runner.id,pose:{at:[12,10],facing:2}}))!;
  expect(discover(campaign,reaction.events??[]).bestiary).toEqual(['K01']);
  expect(award(unlocked,'MVP02','easy',2,{})).toBe(unlocked);
  expect(decode(encode({campaign:unlocked,battle:hit},'known')).payload.campaign.bestiary).toEqual(['K01']);
});

it('selects a boss air part without awarding an enemy registration for part loss',()=>{
  const {campaign,battle}=decode(structuredClone(layered)).payload,b=battle!;
  const u=b.units.find(v=>v.id==='P01')!,boss=b.units.find(v=>v.model==='K21')!;
  boss.parts.head=1;
  const at:Cell=[9,6];
  const ground=planAttack(b,u,'W06',{at,layer:'ground'}),air=planAttack(b,u,'W06',{at,layer:'air'});
  expect(ground?.hits[0]?.parts.head).toBeUndefined();
  expect(air?.hits[0]?.parts.head).toBeGreaterThan(0);
  const hit=act(b,command(b,{type:'attack',id:u.id,weapon:'W06',target:{at,layer:'air'}}))!;
  expect(hit.events).toContainEqual(expect.objectContaining({kind:'damage',target:boss.id,amount:1,part:'head',layer:'air',broken:true}));
  expect(discover(campaign,hit.events??[]).bestiary).toEqual([]);
});
