import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { unit } from '../../src/games/monster-wars/battle-state';
import { changeFavorite, freshCampaign, level, levelUp, levelUpCost, nextXp, rosterCost, sortieError, totalXp } from '../../src/games/monster-wars/campaign';
import { decode, encode, upgradeSave } from '../../src/games/monster-wars/save';

test('a class upgrade spends exactly one level of shared EXP',()=>{
  const initial=freshCampaign(),need=nextXp(1);
  for(const xp of [0,need-1]){
    const c={...initial,xp};
    expect(levelUp(c,'戦車')).toBe(c);
  }
  for(const xp of [need,need+1,need+nextXp(2)+1]){
    const c={...initial,xp},updated=levelUp(c,'戦車');
    expect(updated.levels).toEqual({'戦車':need});
    expect(updated.xp).toBe(xp-need);
    expect(levelUpCost(updated,'戦車')).toBe(nextXp(2));
    expect(updated.roster).toEqual(initial.roster);
    expect(updated.merits).toEqual(initial.merits);
    expect(rosterCost(updated.roster)).toBe(rosterCost(initial.roster));
    for(const i of [0,1]){
      const pose={id:'tank-'+i,model:'tank',at:[0,0] as [number,number],facing:0 as const};
      expect(unit(pose,'player',2,100,updated,i).maxHp).toBeGreaterThan(unit(pose,'player',1,100,c,i).maxHp);
    }
  }
  const c={...initial,xp:nextXp(49)+200,levels:{'戦車':totalXp(49)}};
  expect(levelUp(c,'missing')).toBe(c);
  const max=levelUp(c,'戦車');
  expect(level(max.levels['戦車']!)).toBe(50);
  expect(max.xp).toBe(200);
  expect(levelUpCost(max,'戦車')).toBeUndefined();
  expect(levelUp(max,'戦車')).toBe(max);
});

test('legacy EXP remainder is returned exactly once and active battle is preserved',()=>{
  for(const filename of ['legacy-v1','legacy-v2','portraits-v3','layer-v3']){
    const old=decode(JSON.parse(readFileSync('tests/monster-wars/fixtures/'+filename+'.json','utf8')));
    const before=old.payload.campaign,upgraded=upgradeSave(old),after=upgraded.campaign;
    expect(after.favorites).toEqual([]);
    let credited=0;
    for(const [group,xp] of Object.entries(before.levels)){
      const spent=totalXp(level(xp));
      expect(after.levels[group]).toBe(spent);
      credited+=xp-spent;
    }
    expect(after.xp).toBe(before.xp+credited);
    expect(after.merits).toEqual(before.merits);
    expect(after.roster).toEqual(before.roster);
    if(old.payload.battle)expect(upgraded.battle).toEqual({...old.payload.battle,rules:old.payload.battle.rules??1});
    const saved=decode(encode(upgraded,'migrated',old));
    expect(saved.schemaVersion).toBe(4);
    expect(upgradeSave(saved)).toEqual(upgraded);
  }
});

test('partial legacy v3 assignments and shared EXP are conserved',()=>{
  const raw=JSON.parse(readFileSync('tests/monster-wars/fixtures/portraits-v3.json','utf8'));
  const {checksum:_,...envelope}=raw;
  envelope.payload.campaign.levels={'歩兵':57,'戦車':totalXp(9)+31,'装甲車':totalXp(50)};
  let hash=2166136261;
  const json=JSON.stringify(envelope);
  for(let i=0;i<json.length;i++)hash=Math.imul(hash^json.charCodeAt(i),16777619);
  const old=decode({...envelope,checksum:(hash>>>0).toString(16)});
  const migrated=upgradeSave(old);
  expect(migrated.campaign.levels).toEqual({'歩兵':0,'戦車':totalXp(9),'装甲車':totalXp(50)});
  expect(migrated.campaign.xp).toBe(old.payload.campaign.xp+88);
  expect(upgradeSave(decode(encode(migrated,old.saveId,old)))).toEqual(migrated);
});

test('favorite slots persist independent copies and refuse unsupported equipment',()=>{
  let c=freshCampaign();
  c.roster[1]!.equipment=['P09'];
  const original=structuredClone(c.roster);
  for(let slot=1;slot<=5;slot++)c=changeFavorite(c,{kind:'save',slot,name:slot===1?'夜間防衛隊':''}).campaign;
  expect(c.favorites?.map(f=>f.name)).toEqual(['夜間防衛隊','編成2','編成3','編成4','編成5']);
  expect(changeFavorite(c,{kind:'save',slot:6,name:''}).error).toBeTruthy();
  c.roster[1]!.equipment=[];
  expect(c.favorites?.[0]?.roster).toEqual(original);
  c=changeFavorite(c,{kind:'rename',slot:1,name:'予備隊'}).campaign;
  expect(c.favorites?.[0]?.roster).toEqual(original);
  const decoded=decode(encode({campaign:c},'favorite')).payload.campaign;
  expect(decoded.favorites).toEqual(c.favorites);
  c=changeFavorite(decoded,{kind:'load',slot:1}).campaign;
  expect(c.roster).toEqual(original);
  c.roster.push(...original);
  c=changeFavorite(c,{kind:'save',slot:2,name:'大編成'}).campaign;
  c={...c,roster:[]};
  const loaded=changeFavorite(c,{kind:'load',slot:2});
  expect(loaded.error).toBeUndefined();
  expect(sortieError(loaded.campaign,'MVP01','easy')).toMatch(/上限/);
  const locked={...c,open:c.open.filter(id=>id!=='P09')};
  expect(changeFavorite(locked,{kind:'load',slot:1})).toMatchObject({campaign:locked,error:expect.stringContaining('P09')});
  c=changeFavorite(c,{kind:'delete',slot:1}).campaign;
  expect(c.favorites).toHaveLength(4);
  expect(changeFavorite(c,{kind:'save',slot:1,name:''}).campaign.favorites).toHaveLength(5);
});
