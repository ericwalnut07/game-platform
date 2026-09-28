/**
 * Preparation-only Pure TypeScript prototype for tutorial-01..05.
 * No Web runtime / clock / persistence / server integration. The online face MUST
 * come from authenticated server-side context (never a client-supplied face).
 */
import { resolveActionFace, type LabyrinthActorContext } from './play-mode-contract';
import type { Face, LayeredStageAsset, Point, DeviceRecord, MarkerClaim } from './layered-stage-contract-v0.6';
import {passable as passableV06,applyPrototypeAction as applyV06, createPrototypeState as createV06, InvalidPrototypeAction} from './prototype-core-v0.6';
export {InvalidPrototypeAction};
export type Direction = 'north' | 'east' | 'south' | 'west';
export type TutorialAction =
 | {readonly type:'MOVE'; readonly direction:Direction}
 | {readonly type:'PUSH';readonly wallId:string}
 | {readonly type:'FLIP';readonly floorId:string}
 | {readonly type:'ROTATE';readonly roomId:string};
type StageId='tutorial-01'|'tutorial-02'|'tutorial-03'|'tutorial-04'|'tutorial-05';
export interface TutorialState {
 readonly stageId:StageId;
 readonly position:Readonly<Record<Face,Point>>;
 readonly wallSide:Readonly<Record<string,Face>>;
 readonly floorParity:number;
 readonly latchOpen:boolean;
 readonly rotationQuarterTurnsFront:number;
 readonly goalVisited:Readonly<Record<Face,boolean>>;
 readonly acceptedActions:number;
 readonly complete:boolean;
}
const FACES=['front','back'] as const;
const kinds:Readonly<Record<StageId,string>>={
 'tutorial-01':'push_wall','tutorial-02':'push_wall','tutorial-03':'inverted_floor','tutorial-04':'latched_switch','tutorial-05':'rotating_room'
};
function error(code:InvalidPrototypeAction['code'],reason:string):never{throw new InvalidPrototypeAction(code,reason);}
function eq(a:Point,b:Point):boolean{return a.x===b.x&&a.y===b.y;}
function adjacent(a:Point,b:Point):boolean{return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1;}
function opposite(face:Face):Face{return face==='front'?'back':'front';}
function point(raw:unknown,label:string):Point {
 if(!Array.isArray(raw)||raw.length!==2||!raw.every(Number.isInteger))error('INVALID_STAGE','Invalid '+label);
 return {x:raw[0] as number,y:raw[1] as number};
}
function points(raw:unknown,label:string):readonly Point[]{
 if(!Array.isArray(raw)||raw.length===0)error('INVALID_STAGE','Invalid '+label);
 return raw.map((p:unknown,i:number)=>point(p,`${label}[${i}]`));
}
function rotatePos(p:Point,center:Point,turns:number):Point{
 let x=p.x-center.x,y=p.y-center.y;
 for(let n=0;n<((turns%4)+4)%4;n++){const t=x;x=-y;y=t;}
 return {x:center.x+x,y:center.y+y};
}
function getDevice(stage:LayeredStageAsset,kind:string,id?:string):DeviceRecord{
 const found=stage.devices.filter(d=>d.kind===kind&&(id===undefined||d.id===id));
 if(found.length!==1)error('INVALID_ACTION','Expected one '+kind+' device');
 return found[0]!;
}
function validate(raw:unknown):asserts raw is LayeredStageAsset {
 if(!raw||typeof raw!=='object')error('INVALID_STAGE','Missing stage');
 const s=raw as LayeredStageAsset;
 if(s.schemaVersion!=='layered-stage-0.6'||!(s.stageId in kinds)||!s.playableByPrototypeCore||s.readyForWebRuntime!==false||
 !Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<3||s.height<3||!Array.isArray(s.devices)||!Array.isArray(s.deviceMarkers)||!s.sourceGlyphs||!s.terrain||!s.start||!s.goal)
 error('INVALID_STAGE','Prototype only accepts explicitly promoted tutorial-01..05');
 const id=s.stageId as StageId,kind=kinds[id];
 if(s.devices.length!==(id==='tutorial-02'?2:1)||s.devices.some(d=>d.kind!==kind)||new Set(s.devices.map(d=>d.id)).size!==s.devices.length)
 error('INVALID_STAGE','Unexpected/duplicate tutorial device');
 const markerIndex=new Map<string,typeof s.deviceMarkers[number]>();
 for(const m of s.deviceMarkers){
  const k=`${m.side}:${m.cell.x}:${m.cell.y}`;
  if(markerIndex.has(k)||m.classification!=='device'||!FACES.includes(m.side))error('INVALID_STAGE','Unexpected marker');
  markerIndex.set(k,m);
 }
 let total=0;
 for(const face of FACES){
  const rows=s.terrain[face],source=s.sourceGlyphs[face];
  if(!Array.isArray(rows)||!Array.isArray(source)||rows.length!==s.height||source.length!==s.height)error('INVALID_STAGE','Malformed rows');
  for(let y=1;y<=s.height;y++){
   if(rows[y-1]?.length!==s.width||source[y-1]?.length!==s.width||/[^#.?~]/.test(rows[y-1]!))error('INVALID_STAGE','Malformed terrain');
   for(let x=1;x<=s.width;x++)if(rows[y-1]![x-1]==='?'){
    total++;const m=markerIndex.get(`${face}:${x}:${y}`);
    if(!m||!m.claims.length||m.claims.some((c:MarkerClaim)=>!s.devices.some(d=>d.id===c.objectId)))error('INVALID_STAGE','Unclaimed dynamic cell');
   }
  }
  for(const pos of [s.start[face],s.goal[face]])if(!Number.isInteger(pos.x)||!Number.isInteger(pos.y)||s.terrain[face][pos.y-1]?.[pos.x-1]!=='.')error('INVALID_STAGE','Invalid start/goal');
 }
 if(markerIndex.size!==total)error('INVALID_STAGE','Marker coverage mismatch');
 if(id==='tutorial-03'){
  const d=s.devices[0]!,config=d.config,physical=points(config.physicalFrontCells,'floor physical cells');
  if(physical.length!==1||(config.initialFloorSide!=='front'&&config.initialFloorSide!=='back'))error('INVALID_STAGE','Bad tutorial floor config');
  for(const side of FACES){const c=(config.controls as Record<string,unknown>)[side];const cp=points(c,'flip controls');if(cp.length!==1)error('INVALID_STAGE','Bad flip controls');
   const cell=side==='front'?physical[0]!:{x:s.width+1-physical[0]!.x,y:physical[0]!.y};
   const r=markerIndex.get(`${side}:${cell.x}:${cell.y}`),sw=markerIndex.get(`${side}:${cp[0]!.x}:${cp[0]!.y}`);
   if(!r?.claims.some((x:MarkerClaim)=>x.objectId===d.id&&x.role==='flip-cell')||!sw?.claims.some((x:MarkerClaim)=>x.objectId===d.id&&x.role==='flip-control'))error('INVALID_STAGE','Flip markers missing');
  }
 } else if(id==='tutorial-04'){
  const d=s.devices[0]!,config=d.config;
  if(config.latchedInitially!==false)error('INVALID_STAGE','Unexpected initial latch');
  for(const face of FACES){
   const spt=point((config.switches as Record<string,unknown>)[face],'latch switch');const dpt=points((config.doors as Record<string,unknown>)[face],'latch doors');
   if(dpt.length!==1||!markerIndex.get(`${face}:${spt.x}:${spt.y}`)?.claims.some((c:MarkerClaim)=>c.objectId===d.id&&c.role==='latch-switch')||!markerIndex.get(`${face}:${dpt[0]!.x}:${dpt[0]!.y}`)?.claims.some((c:MarkerClaim)=>c.objectId===d.id&&c.role==='latch-door'))error('INVALID_STAGE','Latch markers missing');
  }
 } else if(id==='tutorial-05'){
  const d=s.devices[0]!,r=d.config.rectFront as Record<string,number>;
  if(r.x!==4||r.y!==5||r.width!==3||r.height!==3||d.config.initialQuarterTurnsClockwiseFront!==0)error('INVALID_STAGE','Bad tutorial rotation room');
  for(const face of FACES){const cp=points((d.config.controls as Record<string,unknown>)[face],'rotate controls');if(cp.length!==1||!markerIndex.get(`${face}:${cp[0]!.x}:${cp[0]!.y}`)?.claims.some((c:MarkerClaim)=>c.objectId===d.id&&c.role==='rotation-control'))error('INVALID_STAGE','Rotation control missing');}
 } else {
  // Reuse v0.6's stricter physical-wall validation and unsupported-marker rejection.
  createV06(s);
 }
}
function defaultFields(stage:LayeredStageAsset){return {stageId:stage.stageId as StageId,position:{front:{...stage.start.front},back:{...stage.start.back}},wallSide:{} as Record<string,Face>,floorParity:0,latchOpen:false,rotationQuarterTurnsFront:0,goalVisited:{front:false,back:false},acceptedActions:0,complete:false};}
export function createTutorialState(raw:unknown):TutorialState{
 validate(raw);const s=raw;const fresh=defaultFields(s);
 if(s.stageId==='tutorial-01'||s.stageId==='tutorial-02')return {...fresh,...createV06(s)};
 return fresh;
}
function positionPassable(s:LayeredStageAsset,state:TutorialState,face:Face,target:Point):boolean{
 if(target.x<1||target.x>s.width||target.y<1||target.y>s.height)return false;
 const device=s.devices[0]!;
 let glyph=s.terrain[face][target.y-1]![target.x-1];
 if(s.stageId==='tutorial-05'){
  const r=device.config.rectFront as Record<string,number>;
  if(target.x>=r.x!&&target.x<r.x!+r.width!&&target.y>=r.y!&&target.y<r.y!+r.height!){
   const turns=face==='front'?-state.rotationQuarterTurnsFront:state.rotationQuarterTurnsFront;
   const src=rotatePos(target,{x:r.x!+1,y:r.y!+1},turns);
   glyph=s.terrain[face][src.y-1]![src.x-1];
  }
 }
 if(glyph==='#'||glyph==='~')return false;
 if(glyph==='.')return true;
 if(glyph!=='?')return false;
 if(s.stageId==='tutorial-05')return s.deviceMarkers.some(m=>m.side===face&&eq(m.cell,target)&&m.claims.some((c:MarkerClaim)=>c.objectId===device.id&&c.role==='rotation-control'));
 const marker=s.deviceMarkers.find(m=>m.side===face&&eq(m.cell,target));
 if(!marker)return false;
 if(s.stageId==='tutorial-03'){
  if(marker.claims.some((c:MarkerClaim)=>c.objectId===device.id&&c.role==='flip-control'))return true;
  if(marker.claims.some((c:MarkerClaim)=>c.objectId===device.id&&c.role==='flip-cell')){
   const side=device.config.initialFloorSide as Face;
   return (state.floorParity===0?side:opposite(side))===face;
  }
 }
 if(s.stageId==='tutorial-04')return marker.claims.some((c:MarkerClaim)=>c.objectId===device.id&&(c.role==='latch-switch'||c.role==='latch-door'&&state.latchOpen));
 return false;
}
function nextPosition(current:Point,direction:Direction):Point{
 switch(direction){case 'north':return{x:current.x,y:current.y-1};case 'south':return{x:current.x,y:current.y+1};case 'east':return{x:current.x+1,y:current.y};case 'west':return{x:current.x-1,y:current.y};default:error('INVALID_ACTION','Invalid direction');}
}
export function applyTutorialAction(raw:unknown,state:TutorialState,actor:LabyrinthActorContext,action:TutorialAction):TutorialState{
 validate(raw);const s=raw;
 if(state.stageId!==s.stageId)error('INVALID_STAGE','Stage mismatch');
 if(state.complete)error('GAME_OVER','Stage completed');
 const face=resolveActionFace(actor);const other=opposite(face);
 if(s.stageId==='tutorial-01'||s.stageId==='tutorial-02'){
  if(action.type!=='MOVE'&&action.type!=='PUSH')error('INVALID_ACTION','Unsupported action for this tutorial');
  const result=applyV06(s,state as import('./prototype-core-v0.6').PrototypeState,actor,action);
  return {...state,...result};
 }
 let result:TutorialState=state;
 if(action.type==='MOVE'){
  const target=nextPosition(state.position[face],action.direction);
  if(!positionPassable(s,state,face,target))error('BLOCKED','Destination blocked');
  const position={...state.position,[face]:target};
  const visited={...state.goalVisited,[face]:state.goalVisited[face]||eq(target,s.goal[face])};
  let latched=state.latchOpen;
  if(s.stageId==='tutorial-04'){
   const cfg=s.devices[0]!.config;
   const f=point((cfg.switches as Record<string,unknown>).front,'front latch');
   const b=point((cfg.switches as Record<string,unknown>).back,'back latch');
   if(eq(position.front,f)&&eq(position.back,b))latched=true;
  }
  result={...state,position,goalVisited:visited,latchOpen:latched,acceptedActions:state.acceptedActions+1,complete:visited.front&&visited.back};
 } else if(action.type==='FLIP'&&s.stageId==='tutorial-03'){
  const d=getDevice(s,'inverted_floor',action.floorId),ctrl=(d.config.controls as Record<string,unknown>)[face];
  if(!points(ctrl,'flip controls').some(p=>adjacent(state.position[face],p)))error('NOT_ADJACENT','Not adjacent to flip control');
  const candidate={...state,floorParity:1-state.floorParity};
  if(!FACES.every(side=>positionPassable(s,candidate,side,state.position[side])))error('OCCUPIED','Cannot create hole beneath player');
  result={...candidate,acceptedActions:state.acceptedActions+1};
 } else if(action.type==='ROTATE'&&s.stageId==='tutorial-05'){
  const d=getDevice(s,'rotating_room',action.roomId),controls=(d.config.controls as Record<string,unknown>)[face];
  if(!points(controls,'rotation controls').some(p=>eq(state.position[face],p)))error('NOT_ADJACENT','Stand on rotation control');
  const turns=(state.rotationQuarterTurnsFront+(face==='front'?1:3))%4;
  const candidate={...state,rotationQuarterTurnsFront:turns};
  if(!FACES.every(side=>positionPassable(s,candidate,side,state.position[side])))error('OCCUPIED','Rotation would create wall under player');
  result={...candidate,acceptedActions:state.acceptedActions+1};
 } else error('INVALID_ACTION','Action not supported in this tutorial');
 return result;
}

export function inspectBasicCell(stage:LayeredStageAsset,state:TutorialState,face:Face,p:Point){
 let src=p;
 if(stage.stageId==='tutorial-05'){
  const r=stage.devices[0]!.config.rectFront as Record<string,number>;
  if(p.x>=r.x!&&p.x<r.x!+r.width!&&p.y>=r.y!&&p.y<r.y!+r.height!)src=rotatePos(p,{x:r.x!+1,y:r.y!+1},face==='front'?-state.rotationQuarterTurnsFront:state.rotationQuarterTurnsFront);
 }
 return {glyph:stage.terrain[face][src.y-1]?.[src.x-1]??'#',marker:stage.deviceMarkers.find(m=>m.side===face&&eq(m.cell,src)),
 passable:stage.stageId==='tutorial-01'||stage.stageId==='tutorial-02'?passableV06(stage,state as import('./prototype-core-v0.6').PrototypeState,face,p):positionPassable(stage,state,face,p)};
}
