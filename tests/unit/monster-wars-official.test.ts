import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { available, freshCampaign } from '../../src/games/monster-wars/campaign';
import { createBattle } from '../../src/games/monster-wars/battle-state';
import { settleBattle } from '../../src/games/monster-wars/battle-report';
import { models, weapons } from '../../src/games/monster-wars/catalog';
import { missionFor, recommendedLevel } from '../../src/games/monster-wars/missions';
import { modelDirectionKey, officialMissions, validateOfficialContent } from '../../src/games/monster-wars/official-content';
import { officialAssetKeys, officialNewModels } from '../../src/games/monster-wars/official-ids';
import { decode, encode, upgradeSave } from '../../src/games/monster-wars/save';
import { weaponEffects } from '../../apps/monster-wars/vfx/weapons';

describe('official campaign foundation',()=>{
  it('validates ready content and blocks an unfinished release',()=>{
    expect(validateOfficialContent()).toEqual([]);
    expect(validateOfficialContent(officialMissions,true)).toContain('M16 unfinished');
    expect(officialMissions[15]).toMatchObject({id:'M16',source:'MVP03',difficulties:{}});
    expect(recommendedLevel(40,'inferno')).toBe(50);
    const definitions=structuredClone([...officialMissions]);
    definitions[0]!.enemies![0]!.at=[-1,0];
    expect(validateOfficialContent(definitions)).toContain('M01 placement');
  });

  it('preserves campaign content and guards entry and reward settlement',()=>{
    const campaign=freshCampaign('official');
    expect(campaign).toMatchObject({xp:0,wins:{},levels:{},favorites:[],edition:'official'});
    expect(missionFor('M01')).toEqual(missionFor('MVP01'));
    expect(missionFor('M02')).toEqual(missionFor('MVP02'));
    for(const id of ['M02','M03','M16','MVP01'])expect(()=>createBattle(campaign,id,'easy')).toThrow();
    expect(available(campaign,'M01','hard')).toBe(false);
    const battle=createBattle(campaign,'M01','easy');
    const first=settleBattle({...campaign,nextBattle:2},{...battle,result:'win'});
    expect(first.battle.report?.newMissions).toEqual(['M02']);
    expect(settleBattle(first.campaign,first.battle).campaign).toEqual(first.campaign);
    expect(createBattle(first.campaign,'M02','easy').units.some(u=>u.model==='facility')).toBe(true);
    expect(available(first.campaign,'M02','normal')).toBe(false);
  });

  it('round-trips an in-progress official save and rejects cross-edition and corrupted files',()=>{
    const campaign=freshCampaign('official');
    const battle=createBattle(campaign,'M01','normal');
    const official=encode({campaign:{...campaign,nextBattle:2},battle},'official-test');
    const prototype=encode({campaign:freshCampaign()},'prototype-test');
    expect(official).toMatchObject({edition:'official',schemaVersion:1,rulesVersion:1,contentVersion:1});
    expect(upgradeSave(decode(JSON.parse(JSON.stringify(official)),'official'))).toEqual(official.payload);
    expect(()=>decode(prototype,'official')).toThrow();
    expect(()=>decode(official)).toThrow();
    expect(()=>decode({...official,contentVersion:2},'official')).toThrow();
    expect(()=>decode({...official,checksum:'corrupt'},'official')).toThrow();
  });

  it('checks existing art and effect keys against their registries',()=>{
    const knownAssets=new Set([...Object.keys(models),...Object.keys(officialNewModels),...Object.values(officialAssetKeys)]);
    for(const file of readdirSync('apps/monster-wars/art/directional')){
      const match=/^(.+)-(SE|NE)\.webp$/.exec(file);
      expect(match,file).not.toBeNull();
      expect(knownAssets.has(match![1]!),file).toBe(true);
      expect(modelDirectionKey(match![1]!,match![2] as 'SE'|'NE')+'.webp').toBe(file);
    }
    expect(Object.keys(weaponEffects).filter(id=>!Object.hasOwn(weapons,id))).toEqual([]);
  });
});
