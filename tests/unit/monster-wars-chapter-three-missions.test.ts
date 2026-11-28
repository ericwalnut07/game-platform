import { expect, it } from 'vitest';
import { act, command } from '../../src/games/monster-wars/battle';
import { createBattle, unit } from '../../src/games/monster-wars/battle-state';
import { freshCampaign } from '../../src/games/monster-wars/campaign';
import { chapterThreeMaps } from '../../src/games/monster-wars/chapter-three-missions';
import { missions, recommended } from '../../src/games/monster-wars/missions';

it('maps all eight authored scenarios and preserves deployment and reinforcement rules', () => {
  expect(Object.keys(chapterThreeMaps)).toEqual(['M17','M18','M19','M20','M21','M22','M23','M24']);
  expect(Object.values(chapterThreeMaps).map(m => [m!.data.enemies.length, m!.data.waves.length]))
    .toEqual([[18,0],[16,6],[18,5],[14,12],[18,6],[20,6],[18,8],[11,5]]);
  for (const map of Object.values(chapterThreeMaps)) {
    expect(map!.data.waves.every(w => w.required === (map!.goal === 'clear'))).toBe(true);
  }
  const m21 = chapterThreeMaps.M21!.data;
  expect(m21.deployment).toMatchObject({minGround: 2, minAir: 1});
  const m23 = chapterThreeMaps.M23!.data;
  expect(m23.enemies.some(unit => unit.model === 'K30')).toBe(true);
  const m20 = chapterThreeMaps.M20!;
  if (m20.goal !== 'escort') throw new Error('M20 lacks escort data');
  expect(m20.transport.route).toHaveLength(37);
  expect([...m20.data.enemies, ...m20.data.waves].filter(v => v.priority)).toHaveLength(6);
  expect(chapterThreeMaps.M24!.data.defeatTargets).toEqual(['E1']);
});

it('requires both specified attacker IDs and ignores incidental enemies and pending waves', () => {
  const id = 'M22';
  const {data} = chapterThreeMaps.M22!;
  const [first, second] = data.defeatTargets!;
  expect([first, second].map(id => data.enemies.find(v => v.id === id)?.model)).toEqual(['R15','R15']);
  missions[id] = {...data, goal: 'boss', briefing: '', enemies: [], waves: []};
  try {
    const b = createBattle(freshCampaign(), id, 'normal');
    expect(recommended(missions[id]!, 'normal')).toBe(10);
    for (const [index, id] of [first, second, 'incidental'].entries()) {
      b.units.push(unit({id, model: 'K01', at: [index + 2, 2], facing: 0}, 'enemy', 1, 100));
    }
    missions[id]!.waves = data.waves;
    b.units.find(v => v.id === first)!.hp = 0;
    const ongoing = act(b, command(b, {type:'end'}))!;
    expect(ongoing.result).toBeUndefined();
    ongoing.units.find(v => v.id === second)!.hp = 0;
    const won = act(ongoing, command(ongoing, {type:'end'}))!;
    expect(won).toMatchObject({result:'win', reason:'指定目標撃破', spawned:[]});
    expect(won.units.find(v => v.id === 'incidental')?.hp).toBeGreaterThan(0);
  } finally {
    delete missions[id];
  }
});
