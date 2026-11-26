import { weaponFor, modelFor } from './catalog';
import { canArm, planAttack, resolveAttack, type Plan } from './attack';
import { addLog, name, opposed, playerUnits, unit, type Battle, type Target, type Unit } from './battle-state';
import { add, cellsOf, distance, inside, movePaths, occupied, placement, poseKey, same, vector, type Step } from './grid';
import { recommended, missionFor } from './missions';
import type { Cell, Pose, Side } from './types';

export type Action =
  | { type:'move'; id:string; pose:Pose }
  | { type:'attack'; id:string; weapon:string; target:Target }
  | { type:'guard'|'wait'; id:string }
  | { type:'watch'; id:string; weapon:string }
  | { type:'end' } | { type:'retreat' };
export type Command = { battleId:number; revision:number; action:Action };
const movement=(u:Unit)=>Math.max(1,modelFor(u.model).move-(modelFor(u.model).parts??[]).reduce((s,p)=>s+(u.parts[p.id]===0?(p.movement??0):0),0));
export function paths(b:Battle,u:Unit){
  return !u.move||!u.hp||b.warning?.source===u.id?new Map<string,Step[]>():movePaths(b,u,movement(u),u.discount);
}
function cancelWarning(b:Battle,v:Unit){
  if(b.warning?.source!==v.id)return;
  const id=b.warning.weapon;
  v.cooldown[id]=b.round+(weaponFor(v.model,id).cooldown??0);
  delete b.warning;
  addLog(b,'予告攻撃を中断');
}
function shift(b:Battle,u:Unit,v:Unit,n:number,origin:Cell){
  if(v.model==='facility'||v.hp<=0)return;
  const cell=cellsOf(v).find(c=>distance(origin,c.at)===1)?.at??v.at;
  const delta:Cell=[Math.sign(cell[0]-origin[0]),Math.sign(cell[1]-origin[1])];
  const fallback=vector[u.facing],dir=(Math.abs(delta[0])+Math.abs(delta[1])===1)?delta:fallback;
  for(let i=0;i<n;i++){
    const p={at:add(v.at,dir),facing:v.facing};
    if(!placement(b,v.model,p,occupied(b,v.id)))break;
    v.at=p.at;cancelWarning(b,v);
  }
}
function applyStep(b:Battle,u:Unit,s:Step){
  u.at=s.at;u.facing=s.facing;u.discount=s.free;
  for(const [x,y] of s.destroyed)b.terrain[y*b.size+x]='rubble';
}
function reactions(b:Battle,u:Unit){
  for(const v of opposed(b,u).filter(v=>v.overwatch).sort((a,z)=>a.id.localeCompare(z.id))){
    const id=v.overwatch!;
    const plan=cellsOf(u).map(c=>planAttack(b,v,id,c,{reaction:true})).find(p=>p?.hits.some(h=>h.id===u.id));
    if(!plan)continue;
    delete v.overwatch;
    resolveAttack(b,v,id,plan);
    if(u.hp<=0)break;
  }
}
function move(b:Battle,u:Unit,path:Step[]){
  const start=u.at;
  u.move=false;u.usedMovement=true;
  for(const s of path){
    if(s.cost>movement(u))break;
    applyStep(b,u,s);reactions(b,u);
    if(u.hp<=0)break;
  }
  u.moved=distance(start,u.at);
}
export function predictMove(b:Battle,u:Unit,path:Step[]){
  const out=structuredClone(b),v=out.units.find(v=>v.id===u.id)!;
  move(out,v,path);
  return {at:v.at,facing:v.facing,hp:v.hp};
}
function missionResult(b:Battle,atEnd=false){
  if(b.result)return;
  const m=missionFor(b.mission);
  const alive=(id:string)=>b.units.some(u=>u.id===id&&u.hp>0);
  const win=(reason:string)=>{b.result='win';b.reason=reason;};
  const loss=(reason:string)=>{b.result='loss';b.reason=reason;};
  if(!playerUnits(b).length){loss('自軍全滅');return;}
  if(m.goal==='defend'&&!alive('facility')){loss('防衛施設破壊');return;}
  if(m.goal==='boss'&&!b.units.some(u=>u.model==='K21'&&u.hp>0)){win('バルガンド撃破');return;}
  if(m.goal==='clear'&&!b.units.some(u=>u.side==='enemy'&&u.hp>0)&&m.waves.every(w=>!w.required||b.spawned.includes(w.id))){
    win('必須敵全滅');return;
  }
  if(atEnd&&b.round>=m.limit){
    if(m.goal==='defend')win('施設防衛成功');
    else loss('時間切れ');
  }
}
function placeReinforcements(b:Battle){
  const m=missionFor(b.mission),l=recommended(m,b.difficulty),scale=b.difficulty==='easy'?80:100;
  const facility=b.units.find(u=>u.model==='facility');
  for(const wave of m.waves){
    if(b.spawned.includes(wave.id)||wave.round>b.round)continue;
    const reserved=occupied(b);
    for(const other of m.waves.filter(s=>s.id!==wave.id&&!b.spawned.includes(s.id))){
      for(const at of [other.at,...other.alternatives])for(const c of cellsOf({...other,at,hp:1}))reserved.add(c.layer+':'+c.at);
    }
    const candidates=[wave.at,...wave.alternatives];
    for(let d=1;d<=2;d++)for(let y=wave.at[1]-d;y<=wave.at[1]+d;y++)for(let x=wave.at[0]-d;x<=wave.at[0]+d;x++)
      if(distance([x,y],wave.at)===d)candidates.push([x,y]);
    const at=candidates.find(at=>placement(b,wave.model,{at,facing:wave.facing},reserved)&&
      (!facility||cellsOf({...wave,at,hp:1}).every(c=>cellsOf(facility).every(f=>distance(c.at,f.at)>1))));
    if(at){
      b.units.push(unit({...wave,at},'enemy',l,scale));
      b.spawned.push(wave.id);
      addLog(b,'増援 '+modelFor(wave.model).name);
    }else addLog(b,'増援 '+modelFor(wave.model).name+' は次Rへ延期');
  }
}
function startSide(b:Battle,side:Side){
  b.side=side;
  for(const u of b.units){
    const ready=u.hp>0&&u.side===side&&u.model!=='facility';
    u.move=ready;u.main=ready;
    if(ready){u.moved=0;u.usedMovement=false;u.discount=u.equipment.includes('P20');u.guarding=false;delete u.overwatch;}
  }
}
function endSide(b:Battle){
  for(const u of b.units)if(u.side===b.side&&u.shellBreak)u.shellBreak--;
  if(b.side==='player'){startSide(b,'enemy');return;}
  if(b.warning&&b.round>=b.warning.due){
    if(b.warning.delays===0){b.warning.due++;b.warning.delays++;}
    else cancelWarning(b,b.units.find(u=>u.id===b.warning?.source)!);
  }
  missionResult(b);
  if(b.result)return;
  placeReinforcements(b);
  missionResult(b,true);
  if(b.result)return;
  b.round++;startSide(b,'player');
}
export function act(state:Battle,command:Command):Battle|null{
  const {action:a}=command;
  if(state.result||state.revision!==command.revision||state.id!==command.battleId)return null;
  const b=structuredClone(state);
  if(a.type==='retreat'){b.result='retreat';b.reason='撤退';}
  else if(a.type==='end')endSide(b);
  else{
    const u=b.units.find(u=>u.id===a.id&&u.side===b.side&&u.hp>0&&u.model!=='facility');
    if(!u)return null;
    switch(a.type){
      case 'move': {
        const path=paths(b,u).get(poseKey(a.pose));
        if(!path)return null;
        move(b,u,path);break;
      }
      case 'attack': {
        if(!u.main)return null;
        const active=b.warning?.source===u.id&&b.warning.weapon===a.weapon&&b.warning.due<=b.round?b.warning:null;
        const target=active?active.target:a.target;
        const plan=planAttack(b,u,a.weapon,target,active?{fixed:active.cells}:{prepare:true});
        if(!plan)return null;
        u.main=false;
        if(plan.weapon.telegraph&&!active){
          const ammo=u.ammo[a.weapon];
          if(ammo!==undefined)u.ammo[a.weapon]=ammo-1;
          b.warning={source:u.id,weapon:a.weapon,target:{...target,origin:plan.origin},cells:plan.area,due:b.round+1,delays:0};
          addLog(b,name(u)+' が光線を予告');
        }else{
          if(active)delete b.warning;
          resolveAttack(b,u,a.weapon,plan,!active);
          if(plan.weapon.push)for(const h of plan.hits)shift(b,u,b.units.find(v=>v.id===h.id)!,plan.weapon.push,plan.origin);
        }
        break;
      }
      case 'guard': {
        if(!u.main)return null;
        u.main=false;u.move=false;u.guarding=true;break;
      }
      case 'watch': {
        if(!u.main||!canArm(b,u,a.weapon)||!weaponFor(u.model,a.weapon).overwatch)return null;
        u.main=false;u.move=false;u.overwatch=a.weapon;break;
      }
      case 'wait': {
        if(!u.main&&!u.move)return null;
        u.main=false;u.move=false;break;
      }
    }
    missionResult(b);
  }
  b.revision++;
  return b;
}
export const command=(b:Battle,action:Action):Command=>({battleId:b.id,revision:b.revision,action});
export function legalTargets(b:Battle,u:Unit,id:string):{target:Target;plan:Plan}[]{
  if(!u.main||!canArm(b,u,id))return [];
  const w=weaponFor(u.model,id),seen=new Set<string>(),list:{target:Target;plan:Plan}[]=[];
  const area=w.shape==='cross'||w.shape==='square';
  const candidates=(w.kind?b.units.filter(v=>v.side===u.side&&v.hp>0&&v.id!==u.id):opposed(b,u)).flatMap(v=>cellsOf(v));
  for(const {at,layer} of candidates){
    const offsets:Cell[]=area?[[0,0],[0,1],[1,0],[-1,0],[0,-1],...(w.shape==='square'?[[1,1],[-1,1],[1,-1],[-1,-1]] as Cell[]:[])]:[[0,0]];
    for(const offset of offsets){
      const next=add(at,offset),k=layer+':'+next;
      if(seen.has(k)||!inside(next,b.size))continue;
      seen.add(k);
      const receiver=w.kind==='supply'?b.units.find(v=>v.hp>0&&v.side===u.side&&v.id!==u.id&&cellsOf(v).some(c=>c.layer===layer&&same(c.at,next))):undefined;
      for(const ammo of receiver?Object.keys(receiver.capacity):[undefined]){
        const target={at:next,layer,...(ammo?{ammo}:{})};
        const plan=planAttack(b,u,id,target,{prepare:true});
        if(plan)list.push({target,plan});
      }
    }
  }
  return list;
}
export function enemyAction(b:Battle):Action{
  const enemies=b.units.filter(u=>u.side==='enemy'&&u.hp>0&&(u.main||u.move)).sort((a,z)=>a.id.localeCompare(z.id));
  const u=enemies[0];
  if(!u)return {type:'end'};
  if(u.main&&b.warning?.source===u.id&&b.warning.due<=b.round)return {type:'attack',id:u.id,weapon:b.warning.weapon,target:b.warning.target};
  let best:{score:number;action:Action}|undefined;
  const offer=(score:number,action:Action)=>{if(!best||score>best.score)best={score,action};};
  const weight=(v:Unit)=>v.model==='facility'?(u.priority?2:0.35):1;
  const targets=opposed(b,u).filter(v=>v.model!=='facility'||u.priority).flatMap(v=>cellsOf(v));
  const gap=(v:Unit)=>Math.min(...cellsOf(v).flatMap(c=>targets.map(t=>distance(c.at,t.at))));
  type MoveAction = Extract<Action,{type:'move'}>;
  const attacks=(s:Battle,v:Unit,m?:MoveAction,cost=0)=>{
    for(const id of v.weapons)for(const {target,plan} of legalTargets(s,v,id)){
      let score=0;
      for(const hit of plan.hits){
        const defender=b.units.find(v=>v.id===hit.id)!;
        score+=(Math.min(hit.damage,defender.hp)+(hit.damage>=defender.hp?55:0))*weight(defender);
      }
      // An attack now is more reliable than damage telegraphed for the next round.
      if(plan.weapon.telegraph)score=score*0.65+25;
      offer(score+30-cost,m??{type:'attack',id:u.id,weapon:id,target});
    }
  };
  if(u.main)attacks(b,u);
  for(const path of paths(b,u).values()){
    const last=path.at(-1)!,pose={at:last.at,facing:last.facing},action={type:'move',id:u.id,pose} as const;
    const fake={...u,...pose,usedMovement:true,moved:distance(u.at,pose.at)};
    const remaining=gap(fake);
    const forward=u.facing!==pose.facing&&modelFor(u.model).facing&&targets.some(t=>{
      const [dx,dy]=vector[pose.facing];return (t.at[0]-pose.at[0])*dx+(t.at[1]-pose.at[1])*dy>0;
    })?0.4:0;
    const safe=b.difficulty==='normal'?predictMove(b,u,path):{hp:u.hp,at:pose.at};
    if(!safe.hp)continue;
    const danger=u.hp-safe.hp;
    const cost=last.cost/10+danger/4;
    offer((gap(u)-remaining)*5+forward-cost,action);
    if(u.main&&same(safe.at,pose.at)){
      const terrain=[...b.terrain];
      for(const s of path)for(const [x,y] of s.destroyed)terrain[y*b.size+x]='rubble';
      attacks({...b,terrain,units:b.units.map(v=>v===u?fake:v)},fake,action,cost);
    }
  }
  if(best&&best.score>0)return best.action;
  return {type:u.main?'guard':'wait',id:u.id};
}
