/**
 * Preparation-only Pure TypeScript Core for tutorials 01–10 and challenge 01–10.
 * The production web game, clock and persistence are deliberately NOT implemented.
 * Every online actor's face is resolved from the server's authenticated session.
 */
import {resolveActionFace, type LabyrinthActorContext} from './play-mode-contract';
import type {Face, Point, DeviceRecord, LayeredStageAsset, DeviceMarker} from './layered-stage-contract-v0.6';
import {applyTutorialAction as applyV07,createTutorialState as createV07,InvalidPrototypeAction,type TutorialAction,type TutorialState} from './prototype-core-v0.7';
export {InvalidPrototypeAction};
export type AdvancedAction= TutorialAction |
 {readonly type:'LIFT'; readonly liftId:string} |
 {readonly type:'MIRROR'; readonly mirrorId:string} |
 {readonly type:'SEND'|'RECEIVE'|'CANCEL';readonly transferId:string;readonly itemId:string} |
 {readonly type:'INSTALL'|'REMOVE';readonly objectId:string;readonly itemId:string} |
 {readonly type:'UNLOCK';readonly doorId:string;readonly itemId:string} |
 {readonly type:'POWER';readonly circuitId:string} |
 {readonly type:'CACHE_TAKE';readonly cacheId:string;readonly itemId:string};
export type ItemLocation={readonly kind:'inventory';readonly side:Face} |
 {readonly kind:'contained';readonly objectId:string} |
 {readonly kind:'installed';readonly objectId:string} |
 {readonly kind:'pending';readonly transferId:string;readonly sender:Face;readonly receiver:Face};
export interface AdvancedState {
 readonly stageId:string;
 readonly position:Readonly<Record<Face,Point>>;
 readonly wallSide:Readonly<Record<string,Face>>;
 readonly floorParity:Readonly<Record<string,number>>;
 readonly latchOpen:Readonly<Record<string,boolean>>;
 readonly rotationQuarterTurnsFront:Readonly<Record<string,number>>;
 readonly liftFrontStop:Readonly<Record<string,'lower'|'upper'>>;
 readonly mirrorFrontDiagonal:Readonly<Record<string,'/'|'\\'>>;
 readonly items:Readonly<Record<string,ItemLocation>>;
 readonly unlocked:Readonly<Record<string,boolean>>;
 readonly powered:Readonly<Record<string,boolean>>;
 readonly goalVisited:Readonly<Record<Face,boolean>>;
 readonly acceptedActions:number;
 readonly complete:boolean;
}
export type SharedTutorialState=TutorialState|AdvancedState;
const FACES:readonly Face[]=['front','back'];
const ADVANCED_IDS=new Set(['tutorial-06','tutorial-07','tutorial-08','tutorial-09','tutorial-10',...Array.from({length:10},(_,i)=>`challenge-${String(i+1).padStart(2,'0')}`)]);
const validatedAssets=new WeakSet<object>();
function deepFreeze<T>(v:T):T {if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const value of Object.values(v))deepFreeze(value);Object.freeze(v);}return v;}
const EXPECTED_KINDS:Readonly<Record<string,Readonly<Record<string,number>>>>={
 'tutorial-06':{counterweight_lift:1,push_wall:1,inverted_floor:1,latched_switch:1},
 'tutorial-07':{push_wall:1,inverted_floor:1,rotating_room:1,latched_switch:1,fixed_light:1,mirror:1,shadow_bridge:1},
 'tutorial-08':{push_wall:1,inverted_floor:2,rotating_room:1,latched_switch:1,transfer:1,light_pedestal:2,shadow_bridge:2,key_door:1},
 'tutorial-09':{push_wall:1,inverted_floor:1,rotating_room:1,latched_switch:2,transfer:1,power_circuit:2,dual_power_gate:1,energy_socket:1},
 'tutorial-10':{push_wall:2,inverted_floor:2,rotating_room:2,latched_switch:2,resonance_link:2},
 'challenge-01':{counterweight_lift:1,inverted_floor:1,push_wall:1,latched_switch:1},
 'challenge-02':{fixed_light:2,mirror:2,shadow_bridge:2},
 'challenge-03':{key_door:3,transfer:2,light_pedestal:2,shadow_bridge:2,mirror:1},
 'challenge-04':{power_circuit:2,cross_power_gate:2,transfer:1,energy_socket:1,latched_switch:1},
 'challenge-05':{resonance_link:4,inverted_floor:1},
 'challenge-06':{counterweight_lift:1,inverted_floor:1,rotating_room:1},
 'challenge-07':{light_pedestal:2,shadow_bridge:2,transfer:2,key_door:2,power_circuit:2,powered_light_control:1,mirror:1,item_cache:1,energy_socket:1,latched_switch:1},
 'challenge-08':{fixed_light:3,mirror:3,shadow_bridge:3,resonance_link:2,latched_switch:1},
 'challenge-09':{push_wall:2,counterweight_lift:1,inverted_floor:1,rotating_room:1},
 'challenge-10':{light_pedestal:3,shadow_bridge:3,resonance_link:3,transfer:2,key_door:2,push_wall:2,power_circuit:2,counterweight_lift:1,inverted_floor:1,rotating_room:1,item_cache:1,energy_socket:1,powered_light_control:1,mirror:1,latched_switch:1}
};
const EXPECTED_COUNTS:Readonly<Record<string,number>>=Object.fromEntries(Object.entries(EXPECTED_KINDS).map(([id,kinds])=>[id,Object.values(kinds).reduce((n,v)=>n+v,0)]));
function reject(code:InvalidPrototypeAction['code'],msg:string):never{throw new InvalidPrototypeAction(code,msg)}
function other(face:Face):Face{return face==='front'?'back':'front'}
function same(a:Point,b:Point):boolean{return a.x===b.x&&a.y===b.y}
function adjacent(a:Point,b:Point):boolean{return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1}
function point(raw:unknown,label:string):Point{
 if(!Array.isArray(raw)||raw.length!==2||!raw.every(Number.isInteger))reject('INVALID_STAGE',`Invalid ${label}`);
 return {x:raw[0] as number,y:raw[1] as number};
}
function points(raw:unknown,label:string):readonly Point[]{if(!Array.isArray(raw)||raw.length===0)reject('INVALID_STAGE',`Invalid ${label}`);return raw.map((p,i)=>point(p,`${label}[${i}]`))}
function mirrorPoint(p:Point,w:number):Point{return {x:w+1-p.x,y:p.y}}
function physicalPoint(device:DeviceRecord,face:Face,w:number):Point{const p=point(device.config.physicalFrontCell,device.id);return face==='front'?p:mirrorPoint(p,w)}
function get(stage:LayeredStageAsset,id:string,kind?:string):DeviceRecord{
 const d=stage.devices.find(d=>d.id===id);if(!d||(kind&&d.kind!==kind))reject('INVALID_ACTION',`Unknown ${kind??'device'} ${id}`);return d;
}
function kind(stage:LayeredStageAsset,k:string):readonly DeviceRecord[]{return stage.devices.filter(d=>d.kind===k)}
function markerAt(stage:LayeredStageAsset,face:Face,p:Point):DeviceMarker|undefined{return stage.deviceMarkers.find(m=>m.side===face&&same(m.cell,p))}
function owned(stage:LayeredStageAsset,m:DeviceMarker,role:string):readonly DeviceRecord[]{return m.claims.filter(c=>c.role===role).map(c=>get(stage,c.objectId))}
function roomAt(stage:LayeredStageAsset,face:Face,p:Point):DeviceRecord|undefined {
 return kind(stage,'rotating_room').find(d=>{
 const r=d.config.rectFront as {x:number;y:number;width:number;height:number};const x=face==='front'?r.x:stage.width+1-(r.x+r.width-1);
 return p.x>=x&&p.x<x+r.width&&p.y>=r.y&&p.y<r.y+r.height;
 });
}
function rotatePos(p:Point,c:Point,turns:number):Point{
 let x=p.x-c.x,y=p.y-c.y;for(let i=0;i<((turns%4)+4)%4;i++){const old=x;x=-y;y=old;}return {x:c.x+x,y:c.y+y};
}
function controls(stage:LayeredStageAsset,d:DeviceRecord,face:Face):readonly Point[]{
 const raw=d.kind==='power_circuit'?d.config.panels:(d.config.controls as Record<Face,unknown>)[face];return points((raw as unknown[]).map(v=>Array.isArray(v)?v:(v as {cell:unknown}).cell),`${d.id} controls ${face}`);
}
function isControlNear(stage:LayeredStageAsset,d:DeviceRecord,face:Face,pos:Point):boolean{return controls(stage,d,face).some(p=>adjacent(pos,p)||(stage.category==='challenge'&&same(pos,p)))}
function readRect(d:DeviceRecord,stage:LayeredStageAsset,face:Face):{x:number;y:number;width:number;height:number;center:Point}{
 const r=d.config.rectFront as {x:number;y:number;width:number;height:number};if(!r||r.width!==3||r.height!==3||!Number.isInteger(r.x)||!Number.isInteger(r.y))reject('INVALID_STAGE','Unsupported rotation rect');
 const x=face==='front'?r.x:stage.width+1-(r.x+r.width-1);return {x,y:r.y,width:r.width,height:r.height,center:{x:x+1,y:r.y+1}};
}
function rawGlyph(stage:LayeredStageAsset,face:Face,p:Point):string {return stage.terrain[face][p.y-1]?.[p.x-1]??'#'}
function staticAndRoom(stage:LayeredStageAsset,s:AdvancedState,face:Face,p:Point):{glyph:string;marker?:DeviceMarker|undefined;room:boolean}{
 const r=roomAt(stage,face,p);
 if(r){const rect=readRect(r,stage,face);const turns=s.rotationQuarterTurnsFront[r.id]??0;
  const src=rotatePos(p,rect.center,face==='front'?-turns:turns);
  const srcGlyph=rawGlyph(stage,face,src);
  return {glyph:srcGlyph,marker:markerAt(stage,face,src),room:true};
 }
 return {glyph:rawGlyph(stage,face,p),marker:markerAt(stage,face,p),room:false};
}
function positionPassable(stage:LayeredStageAsset,s:AdvancedState,face:Face,p:Point,incumbent=false):boolean {
 if(p.x<1||p.y<1||p.x>stage.width||p.y>stage.height)return false;
 const r=roomAt(stage,face,p);
 if(r){const t=staticAndRoom(stage,s,face,p);return t.glyph!== '#' && (t.glyph==='.' || t.marker?.claims.some(c=>c.objectId===r.id&&(['room-control','room-walkable','rotor-control','rotor-floor'].includes(c.role)))===true)}
 for(const d of kind(stage,'push_wall'))if(same(physicalPoint(d,face,stage.width),p))return s.wallSide[d.id]!==face;
 const {glyph,marker}=staticAndRoom(stage,s,face,p);
 if(glyph==='#'||glyph==='~')return false;
 if(glyph==='.')return true;
 if(glyph!=='?'||!marker)return false;
 for(const claim of marker.claims){const d=get(stage,claim.objectId);switch(claim.role){
  case 'flip-cell':case 'inverted-floor': {
   const parity=s.floorParity[d.id]??0;
   const cell=(d.config.physicalCells as {frontCell:number[];initialFloorSide:Face}[]).find(c=>same(face==='front'?point(c.frontCell,d.id):mirrorPoint(point(c.frontCell,d.id),stage.width),p));
   if(cell){const initial=cell.initialFloorSide;return (parity?other(initial):initial)===face;}break;
  }
  case 'latch-switch':case 'room-control':case 'room-walkable':case 'rotor-control':case 'rotor-floor':case 'floor-control':case 'flip-control':case 'lift-control':case 'circuit-control':case 'circuit-panel':case 'mirror':case 'fixed-light':case 'light-pedestal':case 'light-power-panel':case 'energy-socket':case 'item-cache':case 'resonance-plate':return true;
  case 'transfer-port':return false;
  case 'latch-door':return Boolean(s.latchOpen[d.id]);
  case 'lift-platform':case 'lift-shaft':{
   const stops=(d.config.stops as Record<Face,Record<'upper'|'lower',number[]>>)[face];const frontStop=s.liftFrontStop[d.id]!;const faceStop=face==='front'?frontStop:(frontStop==='lower'?'upper':'lower');
   return same(p,point(stops[faceStop],`${d.id} stop`));
  }
  case 'shadow-bridge':return bridgeLit(stage,s,d);
  case 'key-door':return Boolean(s.unlocked[d.id]);
  case 'circuit-gate':return Boolean(s.powered[d.id]);
  case 'opposite-powered-shortcut':return Boolean(s.powered[d.config.requiredCircuitId as string]);
  case 'both-circuit-gate':return (d.config.requiredCircuitIds as string[]).every(id=>s.powered[id]);
  case 'resonance-gate':{
   const plate=d.config.plate as {side:Face;cell:number[]};const occupying=same(s.position[plate.side],point(plate.cell,`${d.id} plate`))&&(!d.config.requiresLatchId||Boolean(s.latchOpen[d.config.requiresLatchId as string]));
   return occupying||(incumbent&&same(s.position[face],p));
  }
  default:break;
 }}
 return false;
}
function physicallyOpaque(stage:LayeredStageAsset,s:AdvancedState,face:Face,p:Point):boolean{
 if(p.x<1||p.y<1||p.x>stage.width||p.y>stage.height)return true;
 if(roomAt(stage,face,p))return !positionPassable(stage,s,face,p);
 for(const d of kind(stage,'push_wall'))if(same(physicalPoint(d,face,stage.width),p)&&s.wallSide[d.id]===face)return true;
 const g=rawGlyph(stage,face,p);return g==='#';
}
function reflect(direction:Direction,diag:'/'|'\\'):Direction{
 const slash:{[k in Direction]:Direction}={north:'east',east:'north',south:'west',west:'south'};
 const back:{[k in Direction]:Direction}={north:'west',west:'north',south:'east',east:'south'};
 return (diag==='/'?slash:back)[direction];
}
type Direction='north'|'east'|'south'|'west';
function step(p:Point,d:Direction):Point {switch(d){case 'north':return{x:p.x,y:p.y-1};case 'south':return{x:p.x,y:p.y+1};case 'west':return{x:p.x-1,y:p.y};case 'east':return{x:p.x+1,y:p.y};default:reject('INVALID_ACTION','Unknown direction');}}
function rayHits(stage:LayeredStageAsset,s:AdvancedState,side:Face,origin:Point,initial:Direction,target:Point):boolean{
 let pos=origin,dir=initial;const visited=new Set<string>();
 for(let iter=0;iter<stage.width*stage.height*4;iter++){
  pos=step(pos,dir);const code=`${pos.x}:${pos.y}:${dir}`;if(visited.has(code)||physicallyOpaque(stage,s,side,pos))return false;visited.add(code);
  if(same(mirrorPoint(pos,stage.width),target))return true;
  const device=kind(stage,'mirror').find(d=>same(physicalPoint(d,side,stage.width),pos));
  if(device){const front=s.mirrorFrontDiagonal[device.id]!;const diag=side==='front'?front:front==='/'?'\\':'/';dir=reflect(dir,diag);}
 }
 return false;
}
function bridgeLit(stage:LayeredStageAsset,s:AdvancedState,d:DeviceRecord):boolean{
 const face=d.config.side as Face,target=point(d.config.cell,d.id);
 const accepted=d.config.illuminatedBy as string[];
 return accepted.some(sourceId=>{
  const source=get(stage,sourceId),cfg=source.config,side=source.kind==='fixed_light'?cfg.side as Face:cfg.side as Face;
  if(source.kind==='fixed_light'&&cfg.activeInitially!==true)return false;
  if(source.kind==='light_pedestal'&&(!Object.values(s.items).some(loc=>loc.kind==='installed'&&loc.objectId===source.id)||(Number(cfg.requiredPower)>0&&!s.powered[source.id])))return false;
  if(source.kind!=='fixed_light'&&source.kind!=='light_pedestal')reject('INVALID_STAGE','Unknown light source');
  return rayHits(stage,s,side,point(cfg.cell,sourceId),cfg.direction as Direction,target);
 });
}
function safe(stage:LayeredStageAsset,s:AdvancedState):boolean{return FACES.every(f=>positionPassable(stage,s,f,s.position[f],true))}
function powerUsed(stage:LayeredStageAsset,s:AdvancedState):number{return kind(stage,'power_circuit').reduce((n,d)=>n+(s.powered[d.id]?Number(d.config.cost):0),0)+kind(stage,'powered_light_control').reduce((n,d)=>n+(s.powered[d.config.pedestalId as string]?Number(d.config.cost):0),0)}
function powerCapacity(stage:LayeredStageAsset,s:AdvancedState):number{
 const base=(stage as LayeredStageAsset&{sharedPower?:{baseCapacity:number}}).sharedPower?.baseCapacity??0;
 return base+kind(stage,'energy_socket').reduce((n,d)=>n+(Object.values(s.items).some(l=>l.kind==='installed'&&l.objectId===d.id)?Number(d.config.additionalCapacity):0),0);
}
function afterMove(stage:LayeredStageAsset,s:AdvancedState,face:Face,target:Point):AdvancedState{
 const position={...s.position,[face]:target};const visited={...s.goalVisited,[face]:s.goalVisited[face]||same(target,stage.goal[face])};
 const latches={...s.latchOpen};for(const d of kind(stage,'latched_switch')){
  const sw=d.config.switches as Record<Face,number[]>;
  if(same(position.front,point(sw.front,d.id))&&same(position.back,point(sw.back,d.id))&&(d.config.requiredCircuitIds as string[]||[]).every(id=>s.powered[id]))latches[d.id]=true;
 }
 return {...s,position,goalVisited:visited,latchOpen:latches,complete:visited.front&&visited.back};
}
function validate(raw:unknown):asserts raw is LayeredStageAsset&{items:readonly {itemId:string;kind:string;initialLocation:unknown}[];sharedPower:unknown}{
 if(!raw||typeof raw!=='object')reject('INVALID_STAGE','Missing stage');if(validatedAssets.has(raw))return;const s=raw as LayeredStageAsset&{items?:unknown;sharedPower?:unknown};
 if(s.schemaVersion!=='layered-stage-0.6'||!ADVANCED_IDS.has(s.stageId)||!s.playableByPrototypeCore||s.readyForWebRuntime!==false||!Number.isInteger(s.width)||!Number.isInteger(s.height)||!Array.isArray(s.devices)||!Array.isArray(s.deviceMarkers)||!Array.isArray(s.items)||s.devices.length!==EXPECTED_COUNTS[s.stageId]||new Set(s.devices.map(d=>d.id)).size!==s.devices.length)reject('INVALID_STAGE','Stage not explicitly promoted or invalid device counts');
 for(const [k,num] of Object.entries(EXPECTED_KINDS[s.stageId]!))if(s.devices.filter(d=>d.kind===k).length!==num)reject('INVALID_STAGE','Incorrect stage device kind count '+k);
 if(s.devices.some(d=>!(d.kind in EXPECTED_KINDS[s.stageId]!)))reject('INVALID_STAGE','Unknown device kind');
 const ids=new Set(s.devices.map(d=>d.id)),markerMap=new Map<string,DeviceMarker>();let dynamic=0;
 for(const m of s.deviceMarkers){const k=`${m.side}:${m.cell.x}:${m.cell.y}`;if(m.classification==='static-hole'){if(m.claims.length||s.terrain[m.side as Face][m.cell.y-1]?.[m.cell.x-1]!=='~'||m.sourceGlyph!==s.sourceGlyphs[m.side as Face][m.cell.y-1]?.[m.cell.x-1])reject('INVALID_STAGE','Bad permanent hole marker');continue;}if(markerMap.has(k)||m.classification!=='device'||!m.claims.length||m.claims.some((c:{objectId:string})=>!ids.has(c.objectId)))reject('INVALID_STAGE','Bad device claim');markerMap.set(k,m);}
 for(const face of FACES){const t=s.terrain[face],g=s.sourceGlyphs[face];if(!t||!g||t.length!==s.height||g.length!==s.height)reject('INVALID_STAGE','Missing board');
  for(let y=1;y<=s.height;y++){if(t[y-1]?.length!==s.width||g[y-1]?.length!==s.width||/[^#.?~]/.test(t[y-1]!))reject('INVALID_STAGE','Invalid row');for(let x=1;x<=s.width;x++){
   const p={x,y},isDynamic=t[y-1]![x-1]==='?',m=markerMap.get(`${face}:${x}:${y}`);
   if(isDynamic){dynamic++;if(!m||m.sourceGlyph!==g[y-1]![x-1])reject('INVALID_STAGE','Unclaimed dynamic cell');}
   else if(m)reject('INVALID_STAGE','Unexpected marker on static cell');
  }}
  if(rawGlyph(s,face,s.start[face])!=='.'||rawGlyph(s,face,s.goal[face])!=='.')reject('INVALID_STAGE','Invalid start/goal');
 }
 if(markerMap.size!==dynamic)reject('INVALID_STAGE','Unclaimed or duplicate marker');
 for(const d of s.devices){const cfg=d.config;
  if(d.kind==='push_wall'){if(!['front','back'].includes(cfg.initialWallSide as string))reject('INVALID_STAGE','Invalid wall side');const wall=physicalPoint(d,cfg.initialWallSide as Face,s.width);if(!markerAt(s,cfg.initialWallSide as Face,wall)?.claims.some(c=>c.objectId===d.id&&c.role==='push-wall'))reject('INVALID_STAGE','Wall marker missing');}
  if(d.kind==='inverted_floor'){const cells=cfg.physicalCells;if(!Array.isArray(cells)||!cells.length||cells.some(c=>!['front','back'].includes(c.initialFloorSide)||!Array.isArray(c.frontCell)))reject('INVALID_STAGE','Invalid floor group');}
  if(d.kind==='rotating_room')readRect(d,s,'front');
  if(d.kind==='transfer'&&cfg.capacityPerReceiver!==1)reject('INVALID_STAGE','Unsupported transfer capacity');
  if(d.kind==='mirror'&&cfg.pairedReflection!==true)reject('INVALID_STAGE','Unpaired mirror not supported');
  if(d.kind==='transfer'&&(cfg.bidirectional!==true||cfg.unreceivedCancellation!==true))reject('INVALID_STAGE','Bidirectional and cancellation required');
  if(d.kind==='counterweight_lift'&&(cfg.coupledInOppositeDirections!==true||cfg.carryingPlayers!==true))reject('INVALID_STAGE','Invalid reciprocal lift');
  if(d.kind==='resonance_link'){
   const plate=cfg.plate as {side:Face},gate=cfg.gate as {side:Face};if(plate.side===gate.side||cfg.keepsGateOpenWhileOccupied!==true)reject('INVALID_STAGE','Invalid resonance pair');
  }
  if(d.kind==='power_circuit'&&(!Number.isInteger(cfg.cost)||Number(cfg.cost)<=0))reject('INVALID_STAGE','Invalid circuit cost');
 }
 const itemIds=new Set<string>();
 for(const rawItem of s.items){
  if(!rawItem||typeof rawItem.itemId!=='string'||itemIds.has(rawItem.itemId)||!['common-key','portable-light','energy-cell'].includes(rawItem.kind))reject('INVALID_STAGE','Invalid or duplicate item');
  itemIds.add(rawItem.itemId);const loc=rawItem.initialLocation as {kind:string;side?:Face;objectId?:string};
  if(!loc||!['inventory','installed','contained'].includes(loc.kind))reject('INVALID_STAGE','Invalid initial item location');
  if(loc.kind==='inventory'&&loc.side!=='front'&&loc.side!=='back')reject('INVALID_STAGE','Invalid item owner');
  if(loc.kind==='installed'&&!s.devices.some(d=>d.id===loc.objectId&&d.config.requiredItemId===rawItem.itemId))reject('INVALID_STAGE','Item installed in wrong device');
  if(loc.kind==='contained'&&!s.devices.some(d=>d.id===loc.objectId&&d.kind==='item_cache'&&d.config.containedItemId===rawItem.itemId))reject('INVALID_STAGE','Item contained in wrong cache');
 }
 for(const d of s.devices)if((d.kind==='light_pedestal'||d.kind==='key_door'||d.kind==='energy_socket')&&!itemIds.has(d.config.requiredItemId as string))reject('INVALID_STAGE','Dangling required item');
 // Stage assets are immutable after strict one-time validation; mutations must use a fresh copy.
 deepFreeze(raw);validatedAssets.add(raw);
}
export function createStageState(raw:unknown):SharedTutorialState{
 if(raw&&typeof raw==='object'&& !ADVANCED_IDS.has((raw as LayeredStageAsset).stageId))return createV07(raw);
 validate(raw);const s=raw;
 const walls:Record<string,Face>={},floors:Record<string,number>={},latches:Record<string,boolean>={},rooms:Record<string,number>={},lifts:Record<string,'upper'|'lower'>={},mirrors:Record<string,'/'|'\\'>={},items:Record<string,ItemLocation>={},unlocked:Record<string,boolean>={},powered:Record<string,boolean>={};
 for(const d of s.devices){const c=d.config;switch(d.kind){
  case 'push_wall':walls[d.id]=c.initialWallSide as Face;break;
  case 'inverted_floor':floors[d.id]=0;break;
  case 'latched_switch':latches[d.id]=Boolean(c.latchedInitially);break;
  case 'rotating_room':rooms[d.id]=Number(c.initialQuarterTurnsClockwiseFront);break;
  case 'counterweight_lift':lifts[d.id]=(c.initialPlatform as Record<Face,'upper'|'lower'>).front;break;
  case 'mirror':mirrors[d.id]=c.initialFrontDiagonal as '/'|'\\';break;
  case 'key_door':unlocked[d.id]=Boolean(c.initialUnlocked);break;
  case 'power_circuit':powered[d.id]=Boolean(c.initiallyPowered);break;
  case 'powered_light_control':powered[c.pedestalId as string]=Boolean(c.initiallyPowered);break;
 }}
 for(const item of s.items){const loc=item.initialLocation as ItemLocation;if(items[item.itemId]||!loc||(loc.kind!=='inventory'&&loc.kind!=='installed'&&loc.kind!=='contained'))reject('INVALID_STAGE','Invalid initial item');items[item.itemId]={...loc};}
 const state:AdvancedState={stageId:s.stageId,position:{front:{...s.start.front},back:{...s.start.back}},wallSide:walls,floorParity:floors,latchOpen:latches,rotationQuarterTurnsFront:rooms,liftFrontStop:lifts,mirrorFrontDiagonal:mirrors,items,unlocked,powered,goalVisited:{front:false,back:false},acceptedActions:0,complete:false};
 if(!safe(s,state)||powerUsed(s,state)>powerCapacity(s,state))reject('INVALID_STAGE','Initial stage is unsafe');
 return state;
}
export function applyStageAction(raw:unknown,state:SharedTutorialState,actor:LabyrinthActorContext,action:AdvancedAction):SharedTutorialState{
 if(!ADVANCED_IDS.has(state.stageId)){
  if(!['MOVE','PUSH','FLIP','ROTATE'].includes(action.type))reject('INVALID_ACTION','Unsupported tutorial action');
  return applyV07(raw,state as TutorialState,actor,action as TutorialAction);
 }
 validate(raw);const stage=raw,s=state as AdvancedState;
 if(s.stageId!==stage.stageId)reject('INVALID_STAGE','State/stage mismatch');if(s.complete)reject('GAME_OVER','Both goals reached');
 const face=resolveActionFace(actor),opposite=other(face),pos=s.position[face];let candidate:AdvancedState=s;
 switch(action.type){
  case 'MOVE':{
   const target=step(pos,action.direction);
   if(!positionPassable(stage,s,face,target,false))reject('BLOCKED','Destination is impassable');
   candidate=afterMove(stage,s,face,target);break;
  }
  case 'PUSH':{
   const d=get(stage,action.wallId,'push_wall');if(s.wallSide[d.id]!==face)reject('NOT_WALL_SIDE','Wall on opposite face');
   const p=physicalPoint(d,face,stage.width);if(!adjacent(pos,p))reject('NOT_ADJACENT','Stand beside push wall');
   const target=physicalPoint(d,opposite,stage.width);
   if(same(s.position[opposite],target))reject('OCCUPIED','Cannot push wall under partner');
   const before=s.wallSide[d.id],wallSide={...s.wallSide,[d.id]:opposite};candidate={...s,wallSide};
   if(!positionPassable(stage,candidate,opposite,target)){
    // A wall overrides passability on its side; this check must use underlying terrain instead.
    const base=rawGlyph(stage,opposite,target);
    if(base!=='.'&&base!=='?')reject('BLOCKED','Other face is not a safe wall destination');
   }
   if(before===wallSide[d.id])reject('INVALID_ACTION','No wall change');break;
  }
  case 'FLIP':{
   const d=get(stage,action.floorId,'inverted_floor');if(!isControlNear(stage,d,face,pos))reject('NOT_ADJACENT','Stand next to flip control');
   candidate={...s,floorParity:{...s.floorParity,[d.id]:1-(s.floorParity[d.id]??0)}};break;
  }
  case 'ROTATE':{
   const d=get(stage,action.roomId,'rotating_room');if(!controls(stage,d,face).some(p=>same(pos,p)))reject('NOT_ADJACENT','Stand on rotation control');
   candidate={...s,rotationQuarterTurnsFront:{...s.rotationQuarterTurnsFront,[d.id]:((s.rotationQuarterTurnsFront[d.id]??0)+(face==='front'?1:3))%4}};break;
  }
  case 'LIFT':{
   const d=get(stage,action.liftId,'counterweight_lift');if(!isControlNear(stage,d,face,pos))reject('NOT_ADJACENT','Stand next to lift control');
   const previous=s.liftFrontStop[d.id]!,next=previous==='upper'?'lower':'upper';const stops=d.config.stops as Record<Face,Record<'upper'|'lower',number[]>>;
   const position={...s.position};for(const f of FACES){const oldStop=f==='front'?previous:previous==='upper'?'lower':'upper';const newStop=oldStop==='upper'?'lower':'upper';if(same(position[f],point(stops[f][oldStop],`${d.id} old stop`)))position[f]=point(stops[f][newStop],`${d.id} new stop`);}
   candidate={...s,position,liftFrontStop:{...s.liftFrontStop,[d.id]:next}};break;
  }
  case 'MIRROR':{
   const d=get(stage,action.mirrorId,'mirror');if(!adjacent(pos,physicalPoint(d,face,stage.width)))reject('NOT_ADJACENT','Stand beside mirror');
   candidate={...s,mirrorFrontDiagonal:{...s.mirrorFrontDiagonal,[d.id]:s.mirrorFrontDiagonal[d.id]==='/'?'\\':'/'}};break;
  }
  case 'SEND':case 'RECEIVE':case 'CANCEL':{
   const d=get(stage,action.transferId,'transfer');const port=(d.config.port as Record<Face,number[]>)[face];if(!adjacent(pos,point(port,d.id)))reject('NOT_ADJACENT','Stand next to transfer port');
   const location=s.items[action.itemId];if(!location)reject('INVALID_ACTION','Unknown item');
   if(action.type==='SEND'){
    if(location.kind!=='inventory'||location.side!==face)reject('INVALID_ACTION','Item not carried by sender');
    if(Object.values(s.items).some(v=>v.kind==='pending'&&v.transferId===d.id&&v.receiver===opposite))reject('BLOCKED','Receiver port already occupied');
    candidate={...s,items:{...s.items,[action.itemId]:{kind:'pending',transferId:d.id,sender:face,receiver:opposite}}};
   }else if(action.type==='RECEIVE'){
    if(location.kind!=='pending'||location.transferId!==d.id||location.receiver!==face)reject('INVALID_ACTION','No incoming pending item');
    candidate={...s,items:{...s.items,[action.itemId]:{kind:'inventory',side:face}}};
   }else{
    if(location.kind!=='pending'||location.transferId!==d.id||location.sender!==face)reject('INVALID_ACTION','Only sender may cancel pending transfer');
    candidate={...s,items:{...s.items,[action.itemId]:{kind:'inventory',side:face}}};
   }
   break;
  }
  case 'INSTALL':case 'REMOVE':{
   const d=get(stage,action.objectId);if(d.kind!=='light_pedestal'&&d.kind!=='energy_socket')reject('INVALID_ACTION','Unknown install target');
   if(d.config.side!==face||!adjacent(pos,point(d.config.cell,d.id)))reject('NOT_ADJACENT','Stand beside own installation point');
   if(d.config.requiredItemId!==action.itemId)reject('INVALID_ACTION','Wrong item');const loc=s.items[action.itemId];if(!loc)reject('INVALID_ACTION','Missing item');
   if(action.type==='INSTALL'){
    if(loc.kind!=='inventory'||loc.side!==face||Object.values(s.items).some(v=>v.kind==='installed'&&v.objectId===d.id))reject('INVALID_ACTION','Item not installable');
    candidate={...s,items:{...s.items,[action.itemId]:{kind:'installed',objectId:d.id}}};
   }else{
    if(loc.kind!=='installed'||loc.objectId!==d.id)reject('INVALID_ACTION','Item not installed');
    // High-power pedestal must be explicitly powered OFF before removing the light unit.
    if(d.kind==='light_pedestal'&&Number(d.config.requiredPower)>0&&s.powered[d.id])reject('INVALID_ACTION','Switch light OFF before removal');
    candidate={...s,items:{...s.items,[action.itemId]:{kind:'inventory',side:face}}};
   }
   break;
  }
  case 'UNLOCK':{
   const d=get(stage,action.doorId,'key_door');if(d.config.side!==face||!adjacent(pos,point(d.config.cell,d.id)))reject('NOT_ADJACENT','Stand beside key door');
   const loc=s.items[action.itemId];if(d.config.requiredItemId!==action.itemId||!loc||loc.kind!=='inventory'||loc.side!==face||s.unlocked[d.id])reject('INVALID_ACTION','No usable key or already unlocked');
   candidate={...s,unlocked:{...s.unlocked,[d.id]:true}};break;
  }
  case 'POWER':{
   const d=get(stage,action.circuitId);if(d.kind==='power_circuit'){
    if(d.config.side!==face||!isControlNear(stage,d,face,pos))reject('NOT_ADJACENT','Stand next to power panel');
    candidate={...s,powered:{...s.powered,[d.id]:!s.powered[d.id]}};
   }else if(d.kind==='powered_light_control'){
    if(d.config.side!==face||!adjacent(pos,point(d.config.cell,d.id)))reject('NOT_ADJACENT','Stand next to light power panel');
    const pedestal=get(stage,d.config.pedestalId as string,'light_pedestal');const desired=!s.powered[pedestal.id];
    if(desired&&!Object.values(s.items).some(loc=>loc.kind==='installed'&&loc.objectId===pedestal.id))reject('INVALID_ACTION','Install light first');
    candidate={...s,powered:{...s.powered,[pedestal.id]:desired}};
   }else reject('INVALID_ACTION','Not a power control');break;
  }
  case 'CACHE_TAKE':{
   const d=get(stage,action.cacheId,'item_cache');if(d.config.side!==face||!adjacent(pos,point(d.config.cell,d.id)))reject('NOT_ADJACENT','Stand beside cache');
   if(d.config.containedItemId!==action.itemId)reject('INVALID_ACTION','Wrong cache item');const loc=s.items[action.itemId];
   if(!loc||loc.kind!=='contained'||loc.objectId!==d.id)reject('INVALID_ACTION','Cache is empty');
   candidate={...s,items:{...s.items,[action.itemId]:{kind:'inventory',side:face}}};break;
  }
  default:reject('INVALID_ACTION','Unsupported action');
 }
 if(powerUsed(stage,candidate)>powerCapacity(stage,candidate))reject('BLOCKED','Insufficient shared power');
 if(!safe(stage,candidate))reject('OCCUPIED','Action would leave a player on an impassable tile');
 return {...candidate,acceptedActions:s.acceptedActions+1};
}
/** Diagnostic only; call only on an already validated, supported tutorial asset. */
export function canStageOccupy(raw:unknown,state:SharedTutorialState,face:Face,p:Point):boolean{
 validate(raw);return positionPassable(raw,state as AdvancedState,face,p,false);
}

/** The Web projection uses exactly the same occupancy/rotation predicates as movement. */
export function inspectAdvancedCell(stage:LayeredStageAsset,state:AdvancedState,face:Face,p:Point){
 const tile=staticAndRoom(stage,state,face,p);
 return {...tile,passable:positionPassable(stage,state,face,p,true)};
}
export function inspectPower(stage:LayeredStageAsset,state:AdvancedState){return {used:powerUsed(stage,state),capacity:powerCapacity(stage,state)}}

/** Visible beams on this face only; optical blocking/reflection matches rayHits. */
export function inspectLightRays(stage:LayeredStageAsset,s:AdvancedState,face:Face):Point[][] {
 const rays:Point[][]=[];
 for(const source of stage.devices.filter(d=>d.kind==='fixed_light'||d.kind==='light_pedestal')) {
  const cfg=source.config;
  if(cfg.side!==face)continue;
  if(source.kind==='fixed_light'&&cfg.activeInitially!==true)continue;
  if(source.kind==='light_pedestal'&&(!Object.values(s.items).some(loc=>loc.kind==='installed'&&loc.objectId===source.id)||(Number(cfg.requiredPower)>0&&!s.powered[source.id])))continue;
  let pos=point(cfg.cell,source.id),dir=cfg.direction as Direction;
  const ray=[pos],visited=new Set<string>();
  for(let i=0;i<stage.width*stage.height*4;i++){
   pos=step(pos,dir);const code=`${pos.x}:${pos.y}:${dir}`;
   if(visited.has(code)||physicallyOpaque(stage,s,face,pos))break;
   visited.add(code);ray.push(pos);
   const mirror=kind(stage,'mirror').find(d=>same(physicalPoint(d,face,stage.width),pos));
   if(mirror){const front=s.mirrorFrontDiagonal[mirror.id]!;dir=reflect(dir,face==='front'?front:front==='/'?'\\':'/');}
  }
  rays.push(ray);
 }
 return rays;
}
