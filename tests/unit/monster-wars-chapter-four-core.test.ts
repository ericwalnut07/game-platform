import { expect, it } from 'vitest';
import { effectiveAffinity, effectiveDefense, planAttack } from '../../src/games/monster-wars/attack';
import { act, command } from '../../src/games/monster-wars/battle';
import { missions } from '../../src/games/monster-wars/missions';
import { createBattle, unit } from '../../src/games/monster-wars/battle-state';
import { freshCampaign } from '../../src/games/monster-wars/campaign';
import { models, weapons } from '../../src/games/monster-wars/catalog';
import { cellsOf, movePaths, occupied, placement, poseKey } from '../../src/games/monster-wars/grid';

it.each([['K03',75], ['K12',50], ['K22',75]] as const)('uses the adopted electric affinity for %s', (model, expected) => {
  const b = createBattle(freshCampaign(), 'MVP01', 'normal');
  const defender = unit({id:'test', model, at:[2,2], facing:0}, 'enemy', 1, 100);
  expect(effectiveAffinity(b, defender, 'electric')).toBe(expected);
});

it('checks all 16 cells on movement and the rotated air footprint on turning', () => {
  models.testFort = {...models.K22!, size:4, airCells:[[0,0]]};
  try {
    const b = createBattle(freshCampaign(), 'MVP01', 'normal');
    b.terrain.fill('plain');
    const enemy = unit({id:'large', model:'testFort', at:[5,5], facing:0}, 'enemy', 1, 100);
    const aircraft = unit({id:'air', model:'helicopter', at:[8,5], facing:0}, 'player', 1, 100);
    b.units = [enemy, aircraft];
    expect(cellsOf(enemy).filter(cell=>cell.layer==='ground')).toHaveLength(16);
    const turn = {at:enemy.at, facing:1 as const};
    expect(placement(b, enemy.model, turn, occupied(b, enemy.id))).toBe(false);
    expect(movePaths(b,enemy,1,false).has(poseKey(turn))).toBe(false);
    b.units = [enemy];
    expect(placement(b, enemy.model, {at:[b.size-3,5], facing:0}, occupied(b, enemy.id))).toBe(false);
    expect(movePaths(b,enemy,1,false).has(poseKey(turn))).toBe(true);
  } finally {
    delete models.testFort;
  }
});

it('aggregates a dual-layer hit on the same coordinate once per entity', () => {
  models.testDual = {...models.K01!, size:1, airCells:[[0,0]], def:0, affinity:{}};
  weapons.testBeam = {name:'test', attribute:'beam', power:100, range:[1,5], layers:['ground','air'], both:true};
  try {
    const b = createBattle(freshCampaign(), 'MVP01', 'normal');
    b.terrain.fill('plain');
    const attacker = unit({id:'attacker', model:'infantry', at:[4,4], facing:0}, 'player', 1, 100);
    attacker.atk = 100;
    attacker.weapons = ['testBeam'];
    const defender = unit({id:'defender', model:'testDual', at:[4,2], facing:0}, 'enemy', 1, 100);
    b.units = [attacker, defender];
    const plan = planAttack(b,attacker,'testBeam',{at:defender.at,layer:'ground'});
    expect(plan?.hits).toHaveLength(1);
    expect(plan?.hits[0]?.damage).toBe(100);
  } finally {
    delete models.testDual;
    delete weapons.testBeam;
  }
});

it('creates independent defense facilities and loses when either falls', () => {
  missions.M31 = {
    ...missions.MVP02!, size:26, limit:18, zone:[3,20,12,25], number:31, terrain:{}, enemies:[], waves:[],
    facilities:[
      {id:'A', name:'地上司令施設', at:[5,10], hp:1600, def:45},
      {id:'B', name:'航空管制施設', at:[19,15], hp:1400, def:35},
    ],
    facilitySpawnDistance:6,
  };
  try {
    const b = createBattle(freshCampaign(),'M31','normal');
    b.side = 'enemy';
    const [a, z] = b.units.filter(u=>u.model==='facility');
    expect([a!.hp,z!.hp]).toEqual([1600,1400]);
    expect([effectiveDefense(a!),effectiveDefense(z!)]).toEqual([45,35]);
    expect([cellsOf(a!).length,cellsOf(z!).length]).toEqual([4,4]);
    expect(act(b,command(b,{type:'end'}))?.result).toBe('win');
    for(const facility of [a!,z!]){
      const copy = structuredClone(b);
      copy.round = 18;
      copy.units.find(u=>u.id===facility.id)!.hp=0;
      expect(act(copy,command(copy,{type:'end'}))).toMatchObject({result:'loss',reason:'防衛施設破壊'});
    }
  } finally {
    delete missions.M31;
  }
});
