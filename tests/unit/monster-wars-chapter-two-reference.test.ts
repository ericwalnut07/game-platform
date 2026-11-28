import { describe, expect, it } from 'vitest';
import { growth, reducedCost, radial, laser, aggregate } from '../../src/games/monster-wars/chapter-two-precheck';
import type { Cell } from '../../src/games/monster-wars/types';
describe('chapter two isolated reference primitives',()=>{
 it('growth boundaries and rounding',()=>{
  expect(growth(5000,1,'hp')).toBe(5000);
  expect(growth(5000,4,'hp',80)).toBe(4366);
  expect(growth(5000,9,'hp')).toBe(6270);
  expect(growth(125,9,'atk')).toBe(151);
  expect(growth(5000,50,'hp')).toBe(15290);
  expect(growth(125,50,'atk')).toBe(351);
  // floor(110 * 1.214) = 133; floor(133 * 1.03) = 136 (two-stage player rounding).
  expect(growth(110,9,'atk',100,3)).toBe(136);
  expect(()=>growth(100,51,'hp')).toThrow();
 });
 it('cost reduction has a minimum of one',()=>{expect([1,2,3,4,5,6].map(reducedCost)).toEqual([1,1,2,3,4,5]);});
 it('radial area excludes own cells and clips map edge',()=>{
  const square=(n:number):Cell[]=>Array.from({length:n*n},(_,i)=>[8+i%n,8+Math.floor(i/n)]);
  expect(radial(square(2),2,24)).toHaveLength(20);
  expect(radial(square(3),3,24)).toHaveLength(48);
  expect(radial([[0,0]],2,20)).toHaveLength(5);
 });
 it('laser lanes independently stop at obstacles',()=>{
  const cells=laser([10,5],2,24,([x,y])=>x===9&&y===8);
  expect(cells.filter(c=>c.power===250)).toHaveLength(7);
  expect(cells.filter(c=>c.at[0]===9)).toHaveLength(2);
  expect(cells.filter(c=>c.at[0]===11)).toHaveLength(7);
  expect(cells.find(c=>c.at[0]===10&&c.at[1]===7)?.power).toBe(250);
 });
 it('mixed lanes and overlapping layers aggregate once per XY',()=>{
  expect(aggregate([{at:[1,1],damage:342},{at:[1,1],damage:191},{at:[2,1],damage:191}])).toBe(399);
  expect(aggregate([])).toBe(0);
 });
});
