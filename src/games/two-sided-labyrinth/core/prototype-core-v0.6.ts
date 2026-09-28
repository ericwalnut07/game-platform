/**
 * Pure TypeScript *preparation prototype* for tutorial-01/02 only (walk, push wall, goals).
 * Does not implement timers, network, persistence, any of the other 18 stages/devices.
 * For online, the server MUST construct actor context from the authenticated session.
 */
import { resolveActionFace, type LabyrinthActorContext } from './play-mode-contract';
import type { Face, LayeredStageAsset, Point } from './layered-stage-contract-v0.6';

const FACES = ['front', 'back'] as const;
export type Direction = 'north' | 'east' | 'south' | 'west';
export type PrototypeAction = { readonly type: 'MOVE'; readonly direction: Direction } | { readonly type: 'PUSH'; readonly wallId: string };
export interface PrototypeState {
  readonly stageId: 'tutorial-01' | 'tutorial-02';
  readonly position: Readonly<Record<Face, Point>>;
  readonly wallSide: Readonly<Record<string, Face>>;
  readonly goalVisited: Readonly<Record<Face, boolean>>;
  readonly acceptedActions: number;
  readonly complete: boolean;
}
export class InvalidPrototypeAction extends Error {
  constructor(readonly code: 'INVALID_STAGE' | 'GAME_OVER' | 'BLOCKED' | 'NOT_ADJACENT' | 'NOT_WALL_SIDE' | 'OCCUPIED' | 'INVALID_ACTION', message: string) {
    super(message);
    this.name = 'InvalidPrototypeAction';
  }
}
function reject(code: InvalidPrototypeAction['code'], message: string): never { throw new InvalidPrototypeAction(code, message); }
function isPoint(value: unknown): value is Point {
  return !!value && typeof value === 'object' && Number.isInteger((value as Point).x) && Number.isInteger((value as Point).y);
}
function same(a: Point, b: Point): boolean {return a.x === b.x && a.y === b.y;}
function opposite(side: Face): Face {return side === 'front' ? 'back' : 'front';}
function flipPoint(point: Point, width: number): Point {return {x: width + 1 - point.x, y: point.y};}
function wallPoint(device: {config: Readonly<Record<string, unknown>>}, side: Face, width: number): Point {
  const raw = device.config.physicalFrontCell;
  if (!Array.isArray(raw) || raw.length !== 2 || !Number.isInteger(raw[0]) || !Number.isInteger(raw[1])) reject('INVALID_STAGE', 'Malformed push-wall coordinate');
  const front = {x: Number(raw[0]), y: Number(raw[1])};
  return side === 'front' ? front : flipPoint(front, width);
}
function validateStage(raw: unknown): asserts raw is LayeredStageAsset {
  if (!raw || typeof raw !== 'object') reject('INVALID_STAGE', 'Stage asset missing');
  const stage = raw as LayeredStageAsset;
  if (stage.schemaVersion !== 'layered-stage-0.6' || !['tutorial-01', 'tutorial-02'].includes(stage.stageId) ||
    stage.readyForWebRuntime !== false || stage.playableByPrototypeCore !== true ||
    !Number.isInteger(stage.width) || !Number.isInteger(stage.height) || !Array.isArray(stage.devices) ||
    !Array.isArray(stage.deviceMarkers) || !stage.start || !stage.goal || !stage.terrain || !stage.sourceGlyphs ||
    !stage.devices.length || stage.devices.some(d => d.kind !== 'push_wall')) reject('INVALID_STAGE', 'Prototype accepts only tutorial-01/02 push-wall assets');
  for (const face of FACES) {
    if (!Array.isArray(stage.terrain[face]) || stage.terrain[face].length !== stage.height ||
      stage.terrain[face].some(row => row.length !== stage.width || /[^#.?~]/.test(row)) ||
      !isPoint(stage.start[face]) || !isPoint(stage.goal[face])) reject('INVALID_STAGE', 'Malformed terrain or players');
  }
  if (stage.devices.length !== (stage.stageId === 'tutorial-01' ? 1 : 2)) reject('INVALID_STAGE', 'Unexpected push-wall count');
  if (new Set(stage.devices.map(d => d.id)).size !== stage.devices.length) reject('INVALID_STAGE', 'Duplicate push-wall ID');
  for (const device of stage.devices) {
    const initial = device.config.initialWallSide as Face;
    if (initial !== 'front' && initial !== 'back') reject('INVALID_STAGE', 'Invalid push-wall side');
    const current = wallPoint(device, initial, stage.width);
    if (stage.terrain[initial][current.y - 1]?.[current.x - 1] !== '?') reject('INVALID_STAGE', 'Push-wall marker absent');
    if (!stage.deviceMarkers.some(m => m.side === initial && same(m.cell, current) && m.claims.some((c: {objectId: string; role: string}) => c.objectId === device.id && c.role === 'push-wall'))) reject('INVALID_STAGE', 'Push-wall claim absent');
  }
  const markerCount = stage.deviceMarkers.filter(m => m.classification === 'device').length;
  if (markerCount !== stage.devices.length || FACES.reduce<number>((n,face: Face) => n+stage.terrain[face].reduce((x: number,row: string) => x+[...row].filter((c: string)=>c==='?').length,0),0) !== stage.devices.length) reject('INVALID_STAGE', 'Unimplemented device marker present');
}
export function createPrototypeState(raw: unknown): PrototypeState {
  validateStage(raw);
  const walls: Record<string, Face> = {};
  for (const device of raw.devices) walls[device.id] = device.config.initialWallSide as Face;
  return {stageId: raw.stageId as PrototypeState['stageId'], position:{front:{...raw.start.front},back:{...raw.start.back}}, wallSide:walls,
    goalVisited:{front:false,back:false}, acceptedActions:0, complete:false};
}
export function passable(stage: LayeredStageAsset, state: PrototypeState, face: Face, target: Point): boolean {
  if (target.x<1 || target.x>stage.width || target.y<1 || target.y>stage.height) return false;
  const cell=stage.terrain[face][target.y-1]![target.x-1];
  if (cell==='#' || cell==='~') return false;
  // A wall can occupy a '.' cell on its opposite face after being pushed.
  for (const d of stage.devices) if (state.wallSide[d.id] === face && same(target,wallPoint(d,face,stage.width))) return false;
  return cell==='.' || cell==='?'; // '?' is only a known push-wall origin in this restricted prototype.
}
function delta(direction: Direction): Point | null {
  switch(direction) {case 'north':return{x:0,y:-1};case 'east':return{x:1,y:0};case 'south':return{x:0,y:1};case 'west':return{x:-1,y:0};default:return null;}
}
export function applyPrototypeAction(rawStage: unknown, state: PrototypeState, actor: LabyrinthActorContext, action: PrototypeAction): PrototypeState {
  validateStage(rawStage);
  const stage=rawStage;
  if (state.stageId !== stage.stageId) reject('INVALID_STAGE', 'Stage mismatch');
  if (state.complete) reject('GAME_OVER', 'Both players have finished');
  const face=resolveActionFace(actor); // online actor cannot select face in the payload
  const other=opposite(face);
  const position={front:{...state.position.front},back:{...state.position.back}};
  const walls={...state.wallSide};
  const visited={...state.goalVisited};
  if (action.type === 'MOVE') {
    const change=delta(action.direction);
    if (!change) reject('INVALID_ACTION','Unknown direction');
    const target={x:position[face].x+change.x,y:position[face].y+change.y};
    if (!passable(stage,state,face,target)) reject('BLOCKED','Destination is blocked');
    position[face]=target;
    if (same(target,stage.goal[face])) visited[face]=true;
  } else if (action.type==='PUSH') {
    const device=stage.devices.find(d=>d.id===action.wallId);
    if (!device) reject('INVALID_ACTION','Unknown wall');
    if (walls[device.id]!==face) reject('NOT_WALL_SIDE','Wall is on the other face');
    const source=wallPoint(device,face,stage.width);
    if (Math.abs(position[face].x-source.x)+Math.abs(position[face].y-source.y)!==1) reject('NOT_ADJACENT','Push from orthogonally adjacent cell');
    const destination=wallPoint(device,other,stage.width);
    if (same(position[other],destination)) reject('OCCUPIED','The other player stands under the wall');
    // On the other face, only a plain floor or the same wall's origin is safe.
    const terrain=stage.terrain[other][destination.y-1]?.[destination.x-1];
    if (terrain!=='.' && terrain!=='?') reject('BLOCKED','The target side is blocked');
    if (stage.devices.some(d=>d.id!==device.id && walls[d.id]===other && same(wallPoint(d,other,stage.width),destination))) reject('BLOCKED','The target has another wall');
    walls[device.id]=other;
  } else reject('INVALID_ACTION','Unknown action');
  return {stageId:state.stageId,position,wallSide:walls,goalVisited:visited,
    acceptedActions:state.acceptedActions+1,complete:visited.front&&visited.back};
}
