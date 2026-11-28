import { describe,it,expect } from 'vitest';
import { unit,type Battle } from '../../src/games/monster-wars/battle-state';
import { act,command,paths,movement } from '../../src/games/monster-wars/battle';
import { planAttack,resolveAttack } from '../../src/games/monster-wars/attack';
import { cellsOf,poseKey } from '../../src/games/monster-wars/grid';
import type { Cell,Layer } from '../../src/games/monster-wars/types';
const make=(model:string,id:string,at:Cell,side:'player'|'enemy',flightLayer?:Layer)=>({...unit({model,id,at,facing:0,flightLayer},side,9,100,undefined,undefined,3,true),main:true,move:true});
const board=(units:Battle['units']):Battle=>({id:1,mission:'MVP01',difficulty:'normal',size:20,terrain:Array(400).fill('plain'),units,round:3,side:'enemy',revision:0,spawned:[],log:[],stats:{},rules:3,precheck:true});
describe('flight core',()=>{
 it('takeoff costs two and retains initial movement budget',()=>{
  const u=make('K15','e',[8,8],'enemy','ground'),a=make('tank','p',[15,15],'player'),b=board([u,a]);
  const pose={at:[9,8] as Cell,facing:0 as const,flightLayer:'air' as const};
  expect(paths(b,u).get(poseKey(pose))?.at(-1)?.cost).toBe(3);
  const out=act(b,command(b,{type:'move',id:u.id,pose}))!;
  expect(out.units[0]?.flightLayer).toBe('air');expect(movement(out.units[0]!)).toBe(6);
  expect(cellsOf(out.units[0]!).every(c=>c.layer==='air')).toBe(true);
  expect(paths(out,out.units[0]!).size).toBe(0);
 });
 it('landing checks all cells and can use original air budget',()=>{
  const u=make('K15','e',[8,8],'enemy','air'),a=make('tank','p',[15,15],'player'),b=board([u,a]);
  b.terrain[8*20+8]='water';
  expect(paths(b,u).has(poseKey({...u,flightLayer:'ground'}))).toBe(false);
  const pose={at:[8,4] as Cell,facing:0 as const,flightLayer:'ground' as const};
  expect(paths(b,u).get(poseKey(pose))?.at(-1)?.cost).toBe(6);
  const out=act(b,command(b,{type:'move',id:u.id,pose}))!;
  expect(out.units[0]?.at).toEqual([8,4]);expect(out.units[0]?.flightLayer).toBe('ground');
 });
 it('wing destruction with blocked ground persists and retries at next turn',()=>{
  const u=make('K15','e',[8,8],'enemy','air'),a=make('aa','p',[8,5],'player'),b=board([u,a]);
  b.terrain[8*20+8]='water';u.parts.wingL=1;
  const p=planAttack(b,a,'aa',{at:[8,8],layer:'air'})!;
  resolveAttack(b,a,'aa',p);expect(u.parts.wingL).toBe(0);expect(u.flightPending).toBe(true);expect(u.flightLayer).toBe('air');
  b.terrain[8*20+8]='plain';
  const player=act(b,command(b,{type:'end'}))!;
  const enemy=act(player,command(player,{type:'end'}))!;
  expect(enemy.units[0]?.flightLayer).toBe('ground');expect(enemy.units[0]?.flightPending).toBe(false);
 });
});
