import { describe, expect, it } from 'vitest';
import { allocate, available, award, freshCampaign, level, rosterCost, totalXp } from '../../src/games/monster-wars/campaign';
import { createBattle } from '../../src/games/monster-wars/battle-state';
import { act, command, enemyAction } from '../../src/games/monster-wars/battle';
import { planAttack } from '../../src/games/monster-wars/attack';
import { cellsOf, lineOfSight } from '../../src/games/monster-wars/grid';
import { decode, encode } from '../../src/games/monster-wars/save';

describe('Monster Wars MVP',()=>{
  it('applies duplicate model cost and grants progression exactly once',()=>{
    const base=freshCampaign();
    expect(rosterCost(base.roster)).toBe(94);
    expect(available(base,'MVP02','easy')).toBe(false);
    const won=award(base,'MVP01','easy',1,{tank:{kills:4}});
    expect(won.xp).toBe(288);
    expect(won.open).toContain('aa');
    expect(available(won,'MVP02','easy')).toBe(true);
    expect(available(won,'MVP02','normal')).toBe(false);
    expect(award(won,'MVP01','easy',1,{tank:{kills:4}})).toBe(won);
    expect(award(won,'MVP01','easy',2,{}).xp).toBe(374);
    const allocated=allocate(won,'戦車',240);
    expect(level(allocated.levels['戦車'])).toBe(3);
    expect(allocated.xp).toBe(48);
    expect(totalXp(6)).toBe(760);
  });
  it('keeps a command atomic and resumes an enemy turn',()=>{
    const c=freshCampaign(),b=createBattle(c,'MVP01','easy');
    const next=act(b,command(b,{type:'end'}))!;
    expect(next.side).toBe('enemy');
    expect(b.side).toBe('player');
    expect(act(next,command(b,{type:'end'}))).toBeNull();
    const saved=decode(JSON.parse(JSON.stringify(encode({campaign:{...c,nextBattle:2},battle:next},'test-save'))));
    const a=enemyAction(next);
    expect(act(saved.payload.battle!,command(next,a))).toEqual(act(next,command(next,a)));
    expect(()=>decode({...saved,checksum:'broken'})).toThrow();
  });
  it('waits for required reinforcement, then spawns its distinct slots once',()=>{
    const c=freshCampaign(),b=createBattle(c,'MVP01','easy');
    for(const u of b.units)if(u.side==='enemy')u.hp=0;
    b.round=3;b.side='enemy';
    const n=act(b,command(b,{type:'end'}))!;
    expect(n.result).toBeUndefined();
    expect(n.spawned).toEqual(['R3-1','R3-2','R3-3','R3-4']);
    expect(n.units.filter(u=>u.side==='enemy'&&u.hp>0)).toHaveLength(4);
    n.side='enemy';
    expect(act(n,command(n,{type:'end'}))!.spawned).toEqual(n.spawned);
  });
  it('cancels the telegraph on head break and applies different body and part damage',()=>{
    const c=award(award(freshCampaign(),'MVP01','easy',1,{}),'MVP02','easy',2,{});
    c.roster=[{model:'sniper',weapons:['W06'],equipment:['P06']}];
    const b=createBattle(c,'MVP03','easy'),v=b.units.find(u=>u.model==='K21')!,u=b.units.find(u=>u.side==='player')!;
    b.terrain.fill('plain');
    const [x,y]=cellsOf(v).find(m=>m.layer==='air'&&m.at[0]===v.at[0]+1&&m.at[1]===v.at[1]+2)!.at;
    u.at=[x,y+3];v.parts.head=5;
    b.warning={source:v.id,weapon:'warningRay',target:{at:[x,y+3],layer:'ground',origin:[x,y]},cells:[[x,y+3]],due:4,delays:0};
    const target={at:[x,y] as [number,number],layer:'air' as const};
    const hit=planAttack(b,u,'W06',target)!.hits[0];
    expect(hit.parts.head).toBeGreaterThan(hit.damage);
    const next=act(b,command(b,{type:'attack',id:u.id,weapon:'W06',target}))!;
    expect(next.warning).toBeUndefined();
    expect(next.units.find(w=>w.id===v.id)?.hp).toBe(v.hp-hit.damage);
  });
  it('blocks a diagonal when both corner cells are buildings',()=>{
    const b=createBattle(freshCampaign(),'MVP01','easy');
    b.terrain.fill('plain');
    b.terrain[1]='building';expect(lineOfSight(b,[0,0],[2,2])).toBe(true);
    b.terrain[b.size]='building';expect(lineOfSight(b,[0,0],[2,2])).toBe(false);
  });
  it('interrupts enemy movement on lethal overwatch without applying the remaining steps',()=>{
    const b=createBattle(freshCampaign(),'MVP01','easy');
    b.terrain.fill('plain');
    for(const u of b.units)if(u.id!=='P01'&&u.id!=='E01')u.hp=0;
    const defender=b.units.find(u=>u.id==='P01')!, enemy=b.units.find(u=>u.id==='E01')!;
    defender.at=[4,6];defender.facing=0;defender.overwatch='tank';
    enemy.at=[4,1];enemy.hp=1;enemy.move=true;b.side='enemy';
    const n=act(b,command(b,{type:'move',id:enemy.id,pose:{at:[4,5],facing:2}}))!;
    expect(n.units.find(u=>u.id===enemy.id)).toMatchObject({hp:0,at:[4,2]});
    expect(n.units.find(u=>u.id===defender.id)?.overwatch).toBeUndefined();
  });
  it('rejects an otherwise checksummed save if ground units overlap',()=>{
    const c={...freshCampaign(),nextBattle:2},b=createBattle(c,'MVP01','easy');
    b.units[1].at=b.units[0].at;
    expect(()=>decode(encode({campaign:c,battle:b},'test-save'))).toThrow();
  });
  it('checks defense victory and facility destruction in the correct order',()=>{
    const b=createBattle(freshCampaign(),'MVP02','easy');
    b.side='enemy';b.round=8;
    expect(act(b,command(b,{type:'end'}))?.result).toBe('win');
    b.units.find(u=>u.model==='facility')!.hp=0;
    expect(act(b,command(b,{type:'end'}))?.result).toBe('loss');
  });
});
