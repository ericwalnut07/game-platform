import {describe,it,expect} from 'vitest';
import {unit,type Battle} from '../../src/games/monster-wars/battle-state';
import {act,command,movement,legalTargets} from '../../src/games/monster-wars/battle';
import {planAttack,resolveAttack,effectiveAffinity} from '../../src/games/monster-wars/attack';
import {freshCampaign,rosterCost} from '../../src/games/monster-wars/campaign';
import type {Cell} from '../../src/games/monster-wars/types';
const make=(model:string,id:string,at:Cell,side:'player'|'enemy')=>({...unit({model,id,at,facing:0},side,9,100,undefined,undefined,3,true),main:true,move:true});
const board=(units:Battle['units']):Battle=>({id:1,mission:'MVP01',difficulty:'normal',size:20,terrain:Array(400).fill('plain'),units,round:3,side:'player',revision:0,spawned:[],log:[],stats:{},rules:3,precheck:true});
describe('chapter two support and gear core',()=>{
 it('command selects three allies, excludes self, expires and uses strongest living source',()=>{
  const c=make('commandCar','c',[8,8],'player'),a=make('tank','a',[8,6],'player'),z=make('infantry','z',[7,8],'player'),x=make('infantry','x',[9,8],'player'),e=make('K12','e',[8,2],'enemy'),b=board([c,a,z,x,e]);
  const t={at:a.at,layer:'ground' as const,allies:['a','z','x']};
  const aim={at:e.at,layer:'ground' as const};
  const weapon=a.weapons[0]!,base=planAttack(b,a,weapon,aim)!.hits[0]!.damage;
  expect(planAttack(b,c,'commandSupport',{...t,allies:['c']})).toBeNull();
  const p=planAttack(b,c,'commandSupport',t)!;resolveAttack(b,c,'commandSupport',p);
  expect([a,z,x].every(v=>v.commands?.[0]?.amount===15)).toBe(true);
  const boosted=planAttack(b,a,weapon,aim)!.hits[0]!.damage;expect(boosted).toBeGreaterThan(base);
  a.commands!.push({source:z.id,amount:10});expect(planAttack(b,a,weapon,aim)!.hits[0]!.damage).toBe(boosted);
  c.hp=0;z.hp=0;expect(planAttack(b,a,weapon,aim)!.hits[0]!.damage).toBe(base);
  c.hp=100;const enemy=act(b,command(b,{type:'end'}))!,player=act(enemy,command(enemy,{type:'end'}))!;
  expect(player.units.find(v=>v.id==='a')?.commands).toEqual([]);
 });
 it('W48 improves only selected part and consumes one use',()=>{
  const c=make('commandCar','c',[8,10],'player'),a=make('precisionBomber','a',[8,11],'player'),e=make('K22','e',[8,6],'enemy'),b=board([c,a,e]);c.weapons.push('W48');c.ammo.W48=4;c.equipment=['P40'];
  const t={at:[9,7] as Cell,layer:'ground' as const,part:'belly'};
  const base=planAttack(b,a,'precisionBomb',t)!.hits[0]!;
  const p=planAttack(b,c,'W48',t)!;expect(p).toBeTruthy();resolveAttack(b,c,'W48',p);
  const after=planAttack(b,a,'precisionBomb',t)!.hits[0]!;
  expect(after.damage).toBe(base.damage);expect(after.parts.belly).toBeGreaterThan(base.parts.belly!);expect(c.ammo.W48).toBe(3);
  expect(e.analyses?.[0]?.amount).toBe(30);
 });
 it('bombers initialize finite fixed and selected ammo with exclusive upgrades',()=>{
  const c=freshCampaign();c.roster=[{model:'lightBomber',weapons:['W22','W23'],equipment:['P25']}];
  const spawn=()=>unit({model:'lightBomber',id:'a',at:[8,8],facing:0},'player',9,100,c,0,3,true);
  expect(spawn().capacity).toEqual({lightBomb:6,W22:5,W23:4});
  expect(rosterCost(c.roster,true)).toBe(32);
  c.roster[0]!.equipment=['P24'];c.roster[0]!.ammoTarget='lightBomb';expect(spawn().capacity.lightBomb).toBe(7);
  c.roster[0]!.equipment.push('P25');expect(spawn).toThrow();
 });
 it('ground supply cannot refill air or finite support; cost two consumes two points',()=>{
  const s=make('supply','s',[8,8],'player'),a=make('lightBomber','a',[8,9],'player'),z=make('aa','z',[9,8],'player'),e=make('K12','e',[15,15],'enemy'),b=board([s,a,z,e]);a.ammo.lightBomb=0;
  expect(planAttack(b,s,'supply',{at:a.at,layer:'air',ammo:'lightBomb'})).toBeNull();
  z.weapons.push('W15','W50');z.capacity.W15=3;z.ammo.W15=0;z.capacity.W50=3;z.ammo.W50=0;
  expect(planAttack(b,s,'supply',{at:z.at,layer:'ground',ammo:'W50'})).toBeNull();
  const p=planAttack(b,s,'supply',{at:z.at,layer:'ground',ammo:'W15'})!;expect(p.support?.amount).toBe(1);
 });
 it('stationary bonus consumes remaining move and defense/engine modifiers apply',()=>{
  const a=make('tank','a',[8,8],'player'),e=make('K12','e',[8,4],'enemy'),b=board([a,e]);
  const t={at:e.at,layer:'ground' as const},id=a.weapons[0]!,base=planAttack(b,a,id,t)!.hits[0]!.damage;
  a.equipment=['P32','P18'];expect(movement(a)).toBe(5);
  const p=planAttack(b,a,id,t)!;expect(p.hits[0]!.damage).toBeGreaterThan(base);resolveAttack(b,a,id,p);expect(a.move).toBe(false);
  a.equipment=['P11','P13'];expect(effectiveAffinity(b,a,'cold')).toBe(80);expect(effectiveAffinity(b,a,'beam')).toBe(75);
 });
});
