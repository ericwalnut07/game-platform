import {describe,it,expect} from 'vitest';
import {unit,type Battle} from '../../src/games/monster-wars/battle-state';
import {act,command,movement,paths} from '../../src/games/monster-wars/battle';
import {planAttack,resolveAttack,effectiveAffinity} from '../../src/games/monster-wars/attack';
import {applyTimed,tickTimed,regenerationAmount} from '../../src/games/monster-wars/chapter-two-status';
import type {Cell,Layer} from '../../src/games/monster-wars/types';
const make=(model:string,id:string,at:Cell,side:'player'|'enemy',flightLayer?:Layer)=>({...unit({model,id,at,facing:0,flightLayer},side,9,100,undefined,undefined,3,true),main:true,move:true});
const board=(units:Battle['units']):Battle=>({id:1,mission:'MVP01',difficulty:'normal',size:20,terrain:Array(400).fill('plain'),units,round:3,side:'player',revision:0,spawned:[],log:[],stats:{},rules:3,precheck:true});
describe('chapter two timed statuses',()=>{
 it('freeze replaces chill, blocks normal movement and expires with immunity',()=>{
  const u=make('K14','e',[8,8],'enemy','ground'),b=board([u]);
  applyTimed(b,u,'p','timedChill',2);expect(movement(u)).toBe(1);
  applyTimed(b,u,'p','freeze',1);expect(movement(u)).toBe(0);expect(u.timedChill).toBeUndefined();expect(paths(b,u).size).toBe(0);
  b.side='enemy';tickTimed(b,u);expect(u.freeze).toBeUndefined();b.round=4;
  expect(applyTimed(b,u,'p','freeze',1)).toBe(false);tickTimed(b,u);expect(applyTimed(b,u,'p','freeze',1)).toBe(true);
 });
 it('boss and large freeze only reduce MOV; chill increases heat affinity',()=>{
  const u=make('K15','e',[8,8],'enemy','air'),v=make('K21','b',[12,12],'enemy'),b=board([u,v]);
  applyTimed(b,v,'p','timedChill',2);expect(movement(v)).toBe(1);expect(effectiveAffinity(b,v,'heat')).toBe(125);
  applyTimed(b,u,'p','freeze',1);expect(movement(u)).toBe(4);expect([...paths(b,u).values()].every(p=>p.every(s=>s.flightLayer==='air'))).toBe(true);
 });
 it('suppression and burn combine at turn start',()=>{
  const u=make('K12','e',[8,8],'enemy'),p=make('tank','p',[15,15],'player'),b=board([u,p]);u.hp=1000;
  expect(regenerationAmount(u)).toBe(Math.floor(u.maxHp*.05));
  applyTimed(b,u,'p','suppression',3);u.burn={source:'p',remaining:3};
  const amount=Math.floor(u.maxHp*.05/8);expect(regenerationAmount(u)).toBe(amount);
  const out=act(b,command(b,{type:'end'}))!;expect(out.units[0]?.hp).toBe(1000+amount);
 });
 it('W50 consumes one use, deals no damage, blocks takeoff but not landing',()=>{
  const u=make('K15','e',[8,8],'enemy','ground'),p=make('aa','p',[8,5],'player'),b=board([u,p]);p.weapons.push('W50');p.ammo.W50=3;
  const plan=planAttack(b,p,'W50',{at:[8,8],layer:'ground'})!;expect(plan).toBeTruthy();const hp=u.hp;resolveAttack(b,p,'W50',plan);
  expect(p.ammo.W50).toBe(2);expect(u.hp).toBe(hp);expect(u.flightBlock?.remaining).toBe(2);
  expect([...paths(b,u).values()].every(p=>p.every(s=>s.flightLayer==='ground'))).toBe(true);
  u.flightLayer='air';expect([...paths(b,u).values()].some(p=>p.at(-1)?.flightLayer==='ground')).toBe(true);
 });
 it('broken wing permanently prevents takeoff',()=>{
  const u=make('K15','e',[8,8],'enemy','ground'),b=board([u]);u.parts.wingL=0;
  expect([...paths(b,u).values()].every(p=>p.every(s=>s.flightLayer==='ground'))).toBe(true);
 });
 it('status applied during owner turn starts counting next turn',()=>{
  const u=make('K12','e',[8,8],'enemy'),b=board([u]);b.side='enemy';
  applyTimed(b,u,'p','suppression',3);tickTimed(b,u);expect(u.suppression?.remaining).toBe(3);
  b.round++;tickTimed(b,u);expect(u.suppression?.remaining).toBe(2);
 });
});
