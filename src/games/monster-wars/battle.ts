import { weaponFor, modelFor, isInfantry } from './catalog';
import { canArm, planAttack, resolveAttack, type Plan } from './attack';
import { addLog, name, opposed, playerUnits, unit, record, emit, recordDefeat, type Battle, type Order, type Target, type Unit } from './battle-state';
import { add, cellsOf, distance, inside, movePaths, occupied, placement, poseKey, same, vector, type Step } from './grid';
import { recommended, missionFor } from './missions';
import type { Cell, Pose, Side } from './types';

export type Action =
  | { type:'move'; id:string; pose:Pose }
  | { type:'attack'; id:string; weapon:string; target:Target }
  | { type:'guard'|'wait'; id:string }
  | { type:'watch'; id:string; weapon:string }
  | { type:'configure'; ids:string[]; automatic?:boolean; order?:Order }
  | { type:'auto'; finish:boolean }
  | { type:'end' } | { type:'retreat' };
export type Command = { battleId:number; revision:number; action:Action };
export const movement=(u:Unit)=>Math.max(1,modelFor(u.model).move+Number(u.equipment.includes('P17'))-(u.chill?(u.model==='K21'?1:2):0)-(modelFor(u.model).parts??[]).reduce((s,p)=>s+(u.parts[p.id]===0?(p.movement??0):0),0));
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
  const from=v.at;
  for(let i=0;i<n;i++){
    const p={at:add(v.at,dir),facing:v.facing};
    if(!placement(b,v.model,p,occupied(b,v.id)))break;
    v.at=p.at;cancelWarning(b,v);
  }
  if(!same(from,v.at))emit(b,{kind:'move',entity:v.id,from,to:v.at,forced:true});
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
    const from=u.at;
    applyStep(b,u,s);
    emit(b,{kind:'move',entity:u.id,from,to:u.at,facing:u.facing});
    reactions(b,u);
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
  const m=missionFor(b.mission,b.rules);
  const alive=(id:string)=>b.units.some(u=>u.id===id&&u.hp>0);
  const win=(reason:string)=>{b.result='win';b.reason=reason;};
  const loss=(reason:string)=>{b.result='loss';b.reason=reason;};
  if(!playerUnits(b).length){loss('自軍全滅');return;}
  if(m.goal==='defend'&&!(m.requiredDefenders??['facility']).every(alive)){loss('防衛施設破壊');return;}
  if(m.goal==='defend'&&(b.rules??3)>=3&&!b.units.some(u=>u.side==='enemy'&&u.hp>0)&&
      m.waves.every(w=>b.spawned.includes(w.id))){
    win('敵全滅・防衛成功');return;
  }
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
  const m=missionFor(b.mission,b.rules),l=recommended(m,b.difficulty,b.rules),scale=b.difficulty==='easy'?80:100;
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
      b.units.push(unit({...wave,at},'enemy',l,scale,undefined,undefined,b.rules));
      b.spawned.push(wave.id);
      emit(b,{kind:'spawn',entity:wave.id});
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
  for(const u of b.units)if(u.side===b.side){
    if(u.shellBreak)u.shellBreak--;
    if(u.chill&&u.chill.through<=b.round)delete u.chill;
  }
  if(b.side==='player'){startSide(b,'enemy');return;}
  if(b.warning&&b.round>=b.warning.due){
    if(b.warning.delays===0){b.warning.due++;b.warning.delays++;}
    else cancelWarning(b,b.units.find(u=>u.id===b.warning?.source)!);
  }
  for(const u of b.units.filter(u=>u.hp>0&&u.burn)){
    const burn=u.burn!;
    const size=modelFor(u.model).size, percent=size===1?5:size==='long'?4:size===2?3:2;
    const loss=Math.min(u.hp,Math.max(1,Math.floor(u.maxHp*percent/100)));
    u.hp-=loss;
    const source=b.units.find(v=>v.id===burn.source);
    emit(b,{kind:'damage',target:u.id,amount:loss});
    if(source)record(b,source,'damage',loss);
    if(!u.hp)recordDefeat(b,source,u);
    addLog(b,name(u)+' 燃焼 −'+loss);
    if(!u.hp){u.move=false;u.main=false;cancelWarning(b,u);}
    if(--burn.remaining===0)delete u.burn;
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
  b.events=[];
  if(a.type==='retreat'){b.result='retreat';b.reason='撤退';}
  else if(a.type==='configure'){
    if(b.side!=='player'||b.automation||b.rules===1||!a.ids.length)return null;
    if(a.order&&!validOrder(b,a.order))return null;
    const units=playerUnits(b).filter(u=>a.ids.includes(u.id));
    if(units.length!==new Set(a.ids).size)return null;
    for(const u of units){
      if(a.order?.kind==='guard'&&a.order.target===u.id)return null;
      if(a.automatic!==undefined)u.automatic=a.automatic;
      if(a.order)u.order=a.order;
      if(u.automatic&&!u.order)u.order={kind:'free'};
    }
  }
  else if(a.type==='auto'){
    if(b.side!=='player'||b.rules===1||b.automation)return null;
    b.automation=a.finish?'end':'run';
  }
  else if(a.type==='end'){
    if(b.automation){
      if(playerUnits(b).some(v=>v.automatic&&(v.main||v.move)))return null;
      const finish=b.automation==='end';
      delete b.automation;
      if(finish)endSide(b);
    }else endSide(b);
  }
  else{
    const u=b.units.find(u=>u.id===a.id&&u.side===b.side&&u.hp>0&&u.model!=='facility');
    if(!u||b.automation&&!u.automatic)return null;
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
          emit(b,{kind:'warning',source:u.id,weapon:a.weapon,area:plan.area,layer:target.layer});
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
        u.main=false;u.move=false;u.guarding=true;emit(b,{kind:'stance',entity:u.id,stance:'guard'});break;
      }
      case 'watch': {
        if(!u.main||!canArm(b,u,a.weapon)||!weaponFor(u.model,a.weapon).overwatch)return null;
        u.main=false;u.move=false;u.overwatch=a.weapon;emit(b,{kind:'stance',entity:u.id,stance:'watch'});break;
      }
      case 'wait': {
        if(!u.main&&!u.move)return null;
        u.main=false;u.move=false;break;
      }
    }
    missionResult(b);
  }
  for(const v of playerUnits(b))if(v.order&&!validOrder(b,v.order))v.order={kind:'free'};
  if(b.result)delete b.automation;
  b.revision++;
  return b;
}
function validOrder(b:Battle,order:Order){
  if(order.kind==='free')return true;
  return b.units.some(u=>u.id===order.target&&u.hp>0&&u.side===(order.kind==='focus'?'enemy':'player'));
}
export const command=(b:Battle,action:Action):Command=>({battleId:b.id,revision:b.revision,action});
export function legalTargets(b:Battle,u:Unit,id:string):{target:Target;plan:Plan}[]{
  if(!u.main||!canArm(b,u,id))return [];
  const w=weaponFor(u.model,id),seen=new Set<string>(),list:{target:Target;plan:Plan}[]=[];
  const area=w.shape==='cross'||w.shape==='square';
  const cone=w.status==='burn';
  const candidates=cone?vector.map(offset=>({at:add(u.at,offset),layer:'ground' as const})):(w.kind?b.units.filter(v=>v.side===u.side&&v.hp>0&&v.id!==u.id):opposed(b,u)).flatMap(v=>cellsOf(v));
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
    const {board,moved:fake}=projectedPosition(b,u,path);
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
      attacks(board,fake,action,cost);
    }
  }
  if(best&&best.score>0)return best.action;
  return {type:u.main?'guard':'wait',id:u.id};
}

function projectedPosition(b:Battle,u:Unit,path:Step[]):{board:Battle; moved:Unit}{
  const last=path.at(-1)!;
  const moved:Unit={...u,at:last.at,facing:last.facing,usedMovement:true,moved:distance(u.at,last.at)};
  const terrain=[...b.terrain];
  for(const step of path)for(const [x,y] of step.destroyed)terrain[y*b.size+x]='rubble';
  return {board:{...b,terrain,units:b.units.map(v=>v===u?moved:v)},moved};
}

function gap(a:Unit,b:Unit){
  return Math.min(...cellsOf(a).flatMap(x=>cellsOf(b).map(y=>distance(x.at,y.at))));
}

function roleAttackValue(b:Battle,u:Unit,plan:Plan,focus:Unit|undefined,guard:Unit|undefined){
  const support=plan.support;
  if(support){
    const target=b.units.find(v=>v.id===support.id)!;
    const helpsFocus=focus&&target.weapons.some(id=>!weaponFor(target.model,id).kind&&
      cellsOf(focus).some(c=>weaponFor(target.model,id).layers.includes(c.layer)&&gap(target,focus)<=weaponFor(target.model,id).range[1]+movement(target)));
    return support.amount*(support.ammo?32:1.2)*(helpsFocus||guard===target?1.4:1);
  }
  let total=0;
  for(const hit of plan.hits){
    const target=b.units.find(v=>v.id===hit.id)!;
    const model=modelFor(target.model),w=plan.weapon;
    let score=Math.min(target.hp,hit.damage)+(hit.damage>=target.hp?38:0);
    if(w.status==='shellBreak'&&!target.shellBreak)score+=model.def;
    if(w.status==='burn'&&target.hp>hit.damage)score+=Math.min(target.hp-hit.damage,Math.floor(target.maxHp*(model.size===1?5:model.size==='long'?4:model.size===2?3:2)/100)*Math.max(0,3-(target.burn?.remaining??0)));
    if(w.status==='chill'&&!target.chill&&target.hp>hit.damage)score+=model.move*3;
    for(const [id,amount] of Object.entries(hit.parts)){
      const left=target.parts[id]??0;
      score+=Math.min(left,amount)*(u.model==='sniper'?0.65:0.3)+(amount>=left&&left>0?38:0);
    }
    if(u.model==='aa'&&hit.layer==='air')score*=1.35;
    if(['infantry','apc'].includes(u.model)&&model.size===1)score*=1.14;
    if(['tank','heavy'].includes(u.model)&&model.def>=20&&w.attribute==='shell')score*=1.2;
    if(['heavyArt','lightArt'].includes(u.model)&&model.size!==1)score*=1.12;
    if(b.mission==='MVP03'&&target.model==='K21')score*=1.12;
    if(guard&&gap(guard,target)<=3)score*=1.3;
    if(focus===target)score*=2;
    total+=score;
  }
  return total-(plan.weapon.uses===undefined?0:4);
}

function localThreat(b:Battle,u:Unit,enemies:Unit[]){
  const cells=cellsOf(u);
  let threat=0;
  for(const enemy of enemies){
    let strongest=0;
    const range=gap(enemy,u);
    for(const id of enemy.weapons){
      const w=weaponFor(enemy.model,id);
      if(w.kind||w.telegraph||!canArm(b,enemy,id)||range>w.range[1]+1)continue;
      // Use the legal attack forecast against the prospective position.
      for(const c of cells){
        const hit=planAttack(b,enemy,id,c)?.hits.find(h=>h.id===u.id);
        if(hit)strongest=Math.max(strongest,hit.damage);
      }
    }
    threat+=strongest;
  }
  if(b.warning&&cells.some(c=>b.warning?.cells.some(at=>same(at,c.at))))threat+=u.maxHp*1.2;
  return threat;
}

/** Select exactly one legal action. Its resulting position and resources are reevaluated after commit. */
export function autoAction(b:Battle):Action{
  if(!b.automation||b.side!=='player'||b.result)return {type:'end'};
  const ready=playerUnits(b).filter(u=>u.automatic&&(u.main||u.move)).sort((a,z)=>a.id.localeCompare(z.id));
  if(!ready.length)return {type:'end'};
  const enemies=b.units.filter(u=>u.side==='enemy'&&u.hp>0);
  let result:Action={type:'wait',id:ready[0]!.id},best=0;
  const offer=(score:number,action:Action)=>{if(score>best){best=score;result=action;}};
  for(const u of ready){
    const order=u.order, target=order&&order.kind!=='free'?b.units.find(v=>v.id===order.target&&v.hp>0):undefined;
    const focus=order?.kind==='focus'?target:undefined,guard=order?.kind==='guard'?target:undefined;
    const protect=guard??(b.mission==='MVP02'?b.units.find(v=>v.model==='facility'&&v.hp>0):undefined);
    const offensive=u.weapons.filter(id=>!weaponFor(u.model,id).kind&&canArm(b,u,id));
    const opponents=enemies.filter(v=>offensive.some(id=>cellsOf(v).some(c=>weaponFor(u.model,id).layers.includes(c.layer))));
    const primary=focus&&opponents.includes(focus)?[focus]:opponents;
    const supportKinds=u.weapons.filter(id=>canArm(b,u,id)).map(id=>weaponFor(u.model,id).kind);
    const allies=playerUnits(b).filter(v=>v.id!==u.id&&(
      v.hp<v.maxHp&&(supportKinds.includes('repair')&&!isInfantry(v.model)||supportKinds.includes('medic')&&isInfantry(v.model))||
      supportKinds.includes('supply')&&Object.entries(v.capacity).some(([id,n])=>!weaponFor(v.model,id).kind&&(v.ammo[id]??0)<n)
    ));
    const goals=guard?[guard]:primary.length?primary:allies;
    if(!guard&&!primary.length&&supportKinds.includes('repair')&&protect&&protect.hp<protect.maxHp)goals.push(protect);
    const desired=guard?3:offensive.length?Math.max(...offensive.map(id=>weaponFor(u.model,id).range[1])):2;
    const distanceScore=(v:Unit)=>{
      if(!goals.length)return 0;
      const d=Math.min(...goals.map(g=>gap(v,g)));
      return Math.max(0,d-desired)+(guard?0:d*0.25);
    };
    const oldThreat=localThreat(b,u,enemies);
    const relativeThreat=(next:number,after:Unit)=>Math.min(next,after.hp*1.8)-Math.min(oldThreat,u.hp*1.8);
    const attacks=(board:Battle,v:Unit,step?:Action,cost=0)=>{
      for(const id of v.weapons)for(const {target:aim,plan} of legalTargets(board,v,id)){
        const score=roleAttackValue(board,v,plan,focus,protect);
        if(score>0)offer(22+score-cost,step??{type:'attack',id:u.id,weapon:id,target:aim});
      }
    };
    if(u.main)attacks(b,u);
    else offer(0.1,{type:'wait',id:u.id});
    if(u.main)offer(0.2,{type:'guard',id:u.id});
    for(const path of paths(b,u).values()){
      const last=path.at(-1)!;
      const {board,moved}=projectedPosition(b,u,path);
      const danger=enemies.some(e=>e.overwatch)?u.hp-predictMove(b,u,path).hp:0;
      if(danger>=u.hp)continue;
      const nextThreat=localThreat(board,moved,enemies);
      const risk=relativeThreat(nextThreat,moved)*(nextThreat>=u.hp?0.9:0.42)+danger*1.2;
      const position=distanceScore(u)-distanceScore(moved);
      const guardSpacing=guard&&gap(moved,guard)<=1?5:0;
      const cover=['forest','rubble'].includes(board.terrain[last.at[1]*board.size+last.at[0]]??'')&&['infantry','sniper'].includes(u.model)?2:0;
      const cost=last.cost*0.6+risk+guardSpacing-cover;
      const step={type:'move',id:u.id,pose:{at:last.at,facing:last.facing}} as const;
      offer((u.main?position*5:0)-cost,step);
      if(u.main)attacks(board,moved,step,cost+3+(guard?distanceScore(moved)*2:0));
    }
  }
  return result;
}
