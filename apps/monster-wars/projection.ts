import type { Direction } from '../../src/games/monster-wars/types';

// The board axes advance down-right (logical east) and down-left (logical south).
export const screenFacings=['NE','SE','SW','NW'] as const;
export const arrows=['↗','↘','↙','↖'] as const;
export const screenFacing=(direction:Direction)=>screenFacings[direction];
export const screenX=.707107;
export const screenY=.42;
export const project=(x:number,y:number,size:number):[number,number]=>[
  (size+x-y)*screenX,(x+y)*screenY,
];
