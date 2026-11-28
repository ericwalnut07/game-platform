import { describe,it,expect } from 'vitest';
import { unit,type Battle } from '../../src/games/monster-wars/battle-state';
import { act,command,paths,legalTargets } from '../../src/games/monster-wars/battle';
import { planAttack,resolveAttack } from '../../src/games/monster-wars/attack';
import { rosterCost } from '../../src/games/monster-wars/campaign';
import type { Cell } from '../../src/games/monster-wars/types';
const make=(model:string,id:string,at:Cell,side:'player'|'enemy',facing:0|2=0)=>({...unit({model,id,at,facing},side,9,100),main:true,move:true});
const board=(units:Battle['units']):Battle=>({id:1,mission:'M03',difficulty:'normal',size:20,terrain:Array(400).fill('plain'),units,round:3,side:'enemy',revision:0,spawned:[],log:[],stats:{},rules:3});
describe('chapter two battle integration',()=>{
 it('unit growth and roster costs use actual core',()=>{
  const u=make('K21','boss',[8,4],'enemy',2);
  expect([u.hp,u.atk,u.partMax.shell]).toEqual([6270,151,2257]);
  expect(rosterCost([{model:'infantry',weapons:['W01'],equipment:['P01']}])).toBe(9);
 });
 it('laser predicts and resolves central and outer hits',()=>{
  const u=make('K21','boss',[8,4],'enemy',2),a=make('tank','a',[9,9],'player'),z=make('tank','z',[10,9],'player');
  const b=board([u,a,z]);const target={at:z.at,layer:'ground' as const};
  const p=planAttack(b,u,'warningRay',target,{prepare:true})!;
  expect(p).toBeTruthy();expect(p.hits.map(h=>h.damage)).toEqual([342,191]);
  const before=[a.hp,z.hp];resolveAttack(b,u,'warningRay',p);
  expect([before[0]-a.hp,before[1]-z.hp]).toEqual([342,191]);
 });
 it('fixed warning cannot expand and can fire empty',()=>{
  const u=make('K21','boss',[8,4],'enemy',2),a=make('tank','a',[9,10],'player');
  const b=board([u,a]);b.terrain[8*20+9]='building';
  const t={at:[10,10] as Cell,layer:'ground' as const};
  a.at=[10,10];const p=planAttack(b,u,'warningRay',t,{prepare:true})!;
  expect(p.area.some(c=>c[0]===9&&c[1]===10)).toBe(false);
  b.terrain[8*20+9]='plain';a.at=[9,10];
  const fire=planAttack(b,u,'warningRay',{...t,origin:p.origin},{fixed:p.area})!;
  expect(fire.hits).toEqual([]);
 });
 it('radial shocks exclude air and own footprint',()=>{
  const u=make('K13','e',[8,8],'enemy'),a=make('tank','a',[7,8],'player'),z=make('helicopter','z',[7,8],'player');
  const b=board([u,a,z]);const p=legalTargets(b,u,'groundShock')[0]?.plan;
  expect(p?.area.length).toBe(20);expect(p?.hits.map(h=>h.id)).toEqual(['a']);
 });
 it('breaking belly cancels prepared collapse',()=>{
  const u=make('K22','e',[8,8],'enemy'),a=make('heavyArt','a',[8,13],'player');
  const b=board([u,a]);const p=planAttack(b,u,'collapse',{at:a.at,layer:'ground'},{prepare:true})!;
  expect(p.area.length).toBe(48);
  b.warning={source:u.id,weapon:'collapse',target:{at:a.at,layer:'ground',origin:p.origin},cells:p.area,due:4,delays:0};
  expect(paths(b,u).size).toBe(0);u.parts.belly=1;
  const attack=planAttack(b,a,'heavyArt',{at:[9,9],layer:'ground'})!;
  resolveAttack(b,a,'heavyArt',attack);expect(u.parts.belly).toBe(0);expect(b.warning).toBeUndefined();
 });
});
