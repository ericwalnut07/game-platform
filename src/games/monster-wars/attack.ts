import { applyTimed,recoveryFactor } from './chapter-two-status';
import { laser, radial, aggregate as aggregateCells } from './chapter-two-precheck';
import { weaponFor, modelFor, isInfantry } from './catalog';
import { addLog, name, opposed, record, emit, recordDefeat, type Battle, type Target, type Unit } from './battle-state';
import { add, blocked, cellsOf, occupied, placement, distance, includes, inside, lineOfSight, rotate, same, terrainAt, vector } from './grid';
import type { Attribute, Cell, Layer, Weapon } from './types';

export type Hit = { id:string; damage:number; parts:Record<string,number>; layer:Layer; front:boolean; affinity:number;at:Cell };
export type Plan = { weapon:Weapon; origin:Cell; area:Cell[]; hits:Hit[]; aim:Target; sourceLayer:Layer; reaction:boolean; support?:{id:string; amount:number; ammo?:string} };
const shapeOffsets:Cell[]=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const major=(u:Unit)=>modelFor(u.model).size===2||modelFor(u.model).size===3;
const dot=(a:Cell,b:Cell)=>a[0]*b[0]+a[1]*b[1];
const sub=(a:Cell,b:Cell):Cell=>[a[0]-b[0],a[1]-b[1]];
const frontal=(a:Unit,at:Cell,origin:Cell)=>{
  const delta=sub(origin,at),face=dot(delta,vector[a.facing]),side=dot(delta,vector[((a.facing+1)%4) as Unit['facing']]);
  return !!modelFor(a.model).facing&&face>0&&face>=Math.abs(side);
};
const partCells=(u:Unit,id:string)=>modelFor(u.model).parts?.find(p=>p.id===id)?.cells.map(c=>rotate(u.at,c,u.facing,Number(modelFor(u.model).size)))??[];
export function canArm(b:Battle,u:Unit,id:string){
  if(!u.weapons.includes(id)||u.hp<=0||u.ammo[id]===0||(u.cooldown[id]??0)>b.round)return false;
  const w=weaponFor(u.model,id);
  return (!w.parts||w.parts.every(p=>(u.parts[p]??0)>0))&&(!w.anyPart||w.anyPart.some(p=>(u.parts[p]??0)>0));
}
function origins(u:Unit,w:Weapon){
  if(w.origin&&w.origin!=='front'){
    const part=modelFor(u.model).parts?.find(p=>p.id===w.origin);
    return partCells(u,w.origin).map(at=>({at,layer:part!.layer}));
  }
  const cells=cellsOf(u).filter(c=>c.layer===(u.flightLayer??modelFor(u.model).layer));
  const v=vector[u.facing],front=Math.max(...cells.map(c=>dot(c.at,v)));
  return w.origin==='front'?cells.filter(c=>dot(c.at,v)===front):cells;
}
function directionValid(u:Unit,w:Weapon,origin:Cell,at:Cell){
  const d=sub(at,origin),f=dot(d,vector[u.facing]),side=dot(d,vector[((u.facing+1)%4) as Unit['facing']]);
  if(w.directed==='cardinal')return f>0&&side===0;
  if(w.shape==='cone')return f>0&&Math.abs(side)<=f;
  return w.directed!=='front'||f>=0;
}
function directionFor(u:Unit,w:Weapon,origin:Cell,target:Cell):Unit {
  // Infantry may aim the flamethrower in any of the four cardinal directions.
  if(w.status!=='burn'&&(w.shape!=='cone'||modelFor(u.model).facing))return u;
  const [dx,dy]=sub(target,origin);
  return {...u,facing:Math.abs(dx)>=Math.abs(dy)?(dx>0?1:3):(dy>0?2:0)};
}
function areaOf(b:Battle,u:Unit,w:Weapon,origin:Cell,target:Cell){
  const aim=directionFor(u,w,origin,target);
  if(w.shape==='line'){
    const cells:Cell[]=[],[dx,dy]=vector[u.facing];
    for(let i=1;i<=w.range[1];i++){
      const at:Cell=[origin[0]+dx*i,origin[1]+dy*i];
      if(!inside(at,b.size))break;
      if(i>=w.range[0])cells.push(at);
      if(blocked(b,at))break;
    }
    return cells;
  }
  if(w.shape==='cone'){
    const cells:Cell[]=[];
    for(let y=0;y<b.size;y++)for(let x=0;x<b.size;x++){
      const at:Cell=[x,y],d=distance(at,origin);
      if(d>=w.range[0]&&d<=w.range[1]&&directionValid(aim,w,origin,at)&&(w.indirect||lineOfSight(b,origin,at)))cells.push(at);
    }
    return cells;
  }
  const count=w.shape==='square'?9:w.shape==='cross'?5:1;
  return shapeOffsets.slice(0,count).map(c=>add(c,target)).filter(c=>inside(c,b.size));
}
export function effectiveAffinity(b:Battle,u:Unit,attr:Attribute){
  const base=b.rules===1&&isInfantry(u.model)?100:(modelFor(u.model).affinity?.[attr]??100);
  return Math.max(25,Math.min(200,base+(u.shellBreak&&attr==='gun'?50:0)+((u.chill||u.timedChill)&&attr==='heat'?25:0)-(attr==='heat'&&u.equipment.includes('P10')?20:0)));
}
export function effectiveDefense(u:Unit){
  const m=modelFor(u.model);
  return Math.max(0,m.def-(m.parts??[]).reduce((total,p)=>total+(u.parts[p.id]===0?(p.defense??0):0),0))*(u.shellBreak?0.5:1);
}
function hitAmount(b:Battle,u:Unit,v:Unit,w:Weapon,origin:Cell,at:Cell,layer:Layer,reaction:boolean,part?:string){
  const m=modelFor(v.model),attr=w.attribute!,gear=u.equipment,rank=u.ranks[2]??0;
  const affinity=effectiveAffinity(b,v,attr);
  const pierce=(w.pierce??0)+(gear.includes('P02')&&['gun','shell','beam'].includes(attr)?15:0);
  const def=effectiveDefense(v)*(100-Math.min(100,pierce))/100;
  const group=u.model==='K01'&&b.units.some(v=>v.id!==u.id&&v.model==='K01'&&v.hp>0&&distance(u.at,v.at)<=2)?110:100;
  const power=u.atk*w.power*(u.usedMovement?(w.afterMove??100):100)*(reaction?80:100)*group/1e8;
  const acceleration=modelFor(u.model).acceleration&&u.moved>=4?1.2:1;
  const base=Math.max(1,Math.floor(power*acceleration-def+1e-9));
  const area=!!w.radial||!!w.shape&&w.shape!=='single';
  let bonus=0;
  if((w.hits??1)>=2&&gear.includes('P04'))bonus+=15;
  if(u.moved>=3&&gear.includes('P31'))bonus+=15;
  if(reaction&&gear.includes('P29'))bonus+=20;
  if(!area&&gear.includes('P01'))bonus+=10;
  if(area&&gear.includes('P05'))bonus+=12;
  if(major(v))bonus+=(w.largeBonus??0)+(gear.includes('P03')?15:0);
  if(part)bonus+=(w.partBonus??0)+(gear.includes('P06')?25:0);
  const metric=modelFor(u.model).merits?.[2];
  if(metric&&((metric.metric==='gun'&&attr==='gun')||(metric.metric==='shell'&&attr==='shell')||
    (metric.metric==='ground'&&layer==='ground')||(metric.metric==='antiAirGun'&&layer==='air'&&attr==='gun')||
    (metric.metric==='moved'&&u.moved>0)||(metric.metric==='area'&&area)||(metric.metric==='large'&&major(v))))bonus+=metric.amount*rank;
  const guard=v.guarding?(v.equipment.includes('P16')?45:(m.defense??30)):0;
  const infantry=['一般歩兵','狙撃兵','重火器兵','工兵'].includes(m.group);
  const terrain=terrainAt(b,at);
  const terrainFactor=layer==='ground'?(terrain==='defensive_position'||infantry&&terrain==='mountain'?0.7:infantry&&['forest','rubble'].includes(terrain)?0.8:1):1;
  const isFront=frontal(v,at,origin);
  let arc=100;
  if(m.frontArmor&&!same(origin,at)){
    const rear=frontal({...v,facing:((v.facing+2)%4) as Unit['facing']},at,origin);
    arc=isFront?100:rear?130:115;
  }
  const frontMerit=isFront&&m.frontArmor?100-4*(v.ranks[2]??0):100;
  return base*(100+bonus)/100*affinity/100*arc/100*(100-guard)/100*terrainFactor*frontMerit/100*(attr==='impact'&&v.equipment.includes('P14')?0.8:1);
}
function aggregate(values:Map<string,number>,hits:number){
  return aggregateCells([...values].map(([key,damage])=>({at:key.split(',').map(Number) as Cell,damage})))*hits;
}
export function planAttack(b:Battle,u:Unit,id:string,target:Target, options:{ reaction?:boolean; prepare?:boolean; fixed?:Cell[] }={}):Plan|null {
  if(!canArm(b,u,id)||!inside(target.at,b.size))return null;
  const original=weaponFor(u.model,id);
  const w=original.threeLanes&&!b.precheck?{...original,threeLanes:false}:original;
  if(!w.layers.includes(target.layer)||w.sourceLayer&&w.sourceLayer!==(u.flightLayer??modelFor(u.model).layer))return null;
  if(id==='skyStrike'&&target.layer!==u.flightLayer)return null;
  if(u.flightPending&&w.sourceLayer==='air')return null;
  if(w.telegraph&&!options.fixed&&(!options.prepare||b.round<3||b.warning))return null;
  const radialArea=w.radial?radial(cellsOf(u).filter(c=>c.layer==='ground').map(c=>c.at),w.radial,b.size):undefined;
  const origin=origins(u,w).filter(o=>{
    const d=distance(o.at,target.at);
    return (!target.origin||same(o.at,target.origin))&&
      (options.fixed||w.radial&&includes(radialArea!,target.at)||w.threeLanes&&laser(o.at,u.facing,b.size,c=>blocked(b,c)).some(c=>same(c.at,target.at))||!w.radial&&!w.threeLanes&&d>=w.range[0]&&d<=w.range[1]&&directionValid(directionFor(u,w,o.at,target.at),w,o.at,target.at)&&
      (w.indirect||(w.attribute!=='beam'&&(o.layer==='air'||target.layer==='air'))||lineOfSight(b,o.at,target.at)));
  }).sort((a,z)=>distance(a.at,target.at)-distance(z.at,target.at)||a.at[1]-z.at[1]||a.at[0]-z.at[0])[0];
  if(!origin)return null;
  const visual={aim:target,sourceLayer:origin.layer,reaction:!!options.reaction};
  if(w.kind){
    const v=b.units.find(v=>v.side===u.side&&v.id!==u.id&&v.hp>0&&cellsOf(v).some(m=>m.layer===target.layer&&same(m.at,target.at)));
    if(!v)return null;
    if(w.kind==='repair'||w.kind==='medic'){
      if(w.kind==='medic'?!isInfantry(v.model):isInfantry(v.model)||v.model==='facility'&&!w.facility)return null;
      const bonus=(u.model==='repair'?3*(u.ranks[0]??0)+6*(u.ranks[2]??0):0)+(u.equipment.includes('P35')?25:0);
      const amount=Math.min(v.maxHp-v.hp,Math.floor(u.atk*w.power*(100+bonus)/10000*(b.precheck?recoveryFactor(v):1)));
      return amount>0?{...visual,weapon:w,origin:origin.at,area:[target.at],hits:[],support:{id:v.id,amount}}:null;
    }
    const ammo=v.weapons.find(id=>(!target.ammo||id===target.ammo)&&!weaponFor(v.model,id).kind&&(v.ammo[id]??0)<(v.capacity[id]??0));
    const amount=ammo?Math.min((v.capacity[ammo]??0)-(v.ammo[ammo]??0),w.power+Number(u.equipment.includes('P36'))):0;
    return ammo&&amount>0?{...visual,weapon:w,origin:origin.at,area:[target.at],hits:[],support:{id:v.id,amount,ammo}}:null;
  }
  const lanes=w.threeLanes?laser(origin.at,u.facing,b.size,c=>blocked(b,c)):undefined;
  const current=lanes?lanes.map(c=>c.at):radialArea??areaOf(b,u,w,origin.at,target.at);
  const area=options.fixed?options.fixed.filter(c=>lanes||radialArea?includes(current,c):lineOfSight(b,origin.at,c)):current;
  const hits:Hit[]=[];
  for(const v of opposed(b,u)){
    if(v.model==='facility'&&!w.facility)continue;
    const body=new Map<string,number>(),partValues=new Map<string,Map<string,number>>();
    let at=target.at,layer=target.layer,front=false,highest=-1;
    for(const m of cellsOf(v)){
      if((!w.both&&m.layer!==target.layer)||!includes(area,m.at))continue;
      const cellWeapon=lanes?{...w,power:lanes.find(c=>same(c.at,m.at))!.power}:w;
      const amount=hitAmount(b,u,v,cellWeapon,origin.at,m.at,m.layer,!!options.reaction);
      if(amount>highest){highest=amount;at=m.at;layer=m.layer;front=frontal(v,m.at,origin.at);}
      const key=m.at.join(',');
      body.set(key,Math.max(body.get(key)??0,amount));
      for(const part of modelFor(v.model).parts??[]){
        if(part.layer!==m.layer||!v.parts[part.id]||!includes(partCells(v,part.id),m.at))continue;
        const values=partValues.get(part.id)??new Map<string,number>();
        values.set(key,Math.max(values.get(key)??0,hitAmount(b,u,v,cellWeapon,origin.at,m.at,m.layer,!!options.reaction,part.id)));
        partValues.set(part.id,values);
      }
    }
    if(body.size)hits.push({at,id:v.id,damage:aggregate(body,w.hits??1),parts:Object.fromEntries([...partValues].map(([id,values])=>[id,aggregate(values,w.hits??1)])),layer,front,affinity:effectiveAffinity(b,v,w.attribute!)});
  }
  return hits.length||options.fixed?{...visual,weapon:w,origin:origin.at,area,hits}:null;
}
export function resolveAttack(b:Battle,u:Unit,id:string,plan:Plan,consume=true){
  const w=plan.weapon;
  emit(b,{kind:'attack',source:u.id,weapon:id,origin:plan.origin,area:plan.area,aim:plan.aim.at,layer:plan.aim.layer,sourceLayer:plan.sourceLayer,strikes:w.kind?1:w.hits??1,reaction:plan.reaction});
  const hitEvent=plan.support;
  const ammo=u.ammo[id];
  if(consume&&ammo!==undefined)u.ammo[id]=ammo-1;
  if(w.cooldown)u.cooldown[id]=b.round+w.cooldown;
  if(hitEvent){
    const v=b.units.find(v=>v.id===hitEvent.id)!;
    if(hitEvent.ammo){v.ammo[hitEvent.ammo]=(v.ammo[hitEvent.ammo]??0)+hitEvent.amount;record(b,u,'supplied',hitEvent.amount);record(b,u,'supply',1);}
    else {v.hp+=hitEvent.amount;record(b,u,'healed',hitEvent.amount);record(b,u,'repair',1);}
    emit(b,{kind:hitEvent.ammo?'supply':'heal',target:v.id,amount:hitEvent.amount,at:plan.aim.at,layer:plan.aim.layer});
    addLog(b,name(u)+' → '+name(v)+' '+w.name+' '+hitEvent.amount);
  }
  for(const h of plan.hits){
    const v=b.units.find(v=>v.id===h.id)!,actual=Math.min(v.hp,h.damage);
    v.hp-=actual;
    emit(b,{kind:'damage',target:v.id,amount:actual,at:h.at,layer:h.layer});
    addLog(b,name(u)+' → '+name(v)+' '+w.name+' −'+actual+(v.hp?'':' 撃破'));
    record(b,u,'damage',actual);
    if(!v.hp){recordDefeat(b,u,v);v.move=false;v.main=false;}
    if(w.attribute==='gun')record(b,u,'gun',actual);
    if(w.attribute==='shell')record(b,u,'shell',actual);
    if(w.attribute==='gun'&&h.layer==='air')record(b,u,'antiAirGun',actual);
    if(h.layer==='ground')record(b,u,'ground',actual);
    if(major(v))record(b,u,'large',actual);
    if(w.shape&&w.shape!=='single')record(b,u,'area',actual);
    if(u.moved)record(b,u,'moved',actual);
    if(h.front)record(b,v,'frontal',actual);
    for(const [part,damage] of Object.entries(h.parts)){
      const reduction=Math.min(v.parts[part]??0,damage);
      v.parts[part]=(v.parts[part]??0)-reduction;
      if(reduction)emit(b,{kind:'damage',target:v.id,amount:reduction,part,at:h.at,layer:modelFor(v.model).parts!.find(p=>p.id===part)!.layer,broken:!v.parts[part]});
      if(!v.parts[part])addLog(b,name(v)+' '+modelFor(v.model).parts!.find(p=>p.id===part)!.label+'破壊');
    }
    if(v.hp&&v.flightLayer==='air'&&modelFor(v.model).wingParts?.some(p=>v.parts[p]===0)){
      v.flightPending=true;
      if(placement(b,v.model,{...v,flightLayer:'ground'},occupied(b,v.id))){v.flightLayer='ground';v.flightPending=false;}
    }
    if(v.hp&&actual){
      if(b.precheck&&(w.status==='freeze'||w.status==='suppression'||w.status==='flightBlock'||w.status==='chill')){
        applyTimed(b,v,u.id,w.status==='chill'?'timedChill':w.status,w.duration??(w.status==='suppression'?3:w.status==='chill'?2:1));
        continue;
      }
      const previous=w.status==='shellBreak'||w.status==='burn'||w.status==='chill'?v[w.status]:undefined;
      if(w.status==='shellBreak')v.shellBreak=3;
      if(w.status==='burn'&&(v.burn?.remaining??0)<3)v.burn={source:u.id,remaining:3};
      if(w.status==='chill'){
        const through=b.round+1+Number(b.side==='enemy'||v.side==='player');
        if((v.chill?.through??0)<through)v.chill={source:u.id,through};
      }
      if((w.status==='shellBreak'||w.status==='burn'||w.status==='chill')&&v[w.status]!==previous)emit(b,{kind:'status',target:v.id,status:w.status,at:h.at,layer:h.layer});
    }
  }
  const warned=b.warning&&b.units.find(v=>v.id===b.warning?.source);
  if(warned&&b.warning&&!canArm(b,warned,b.warning.weapon)){
    warned.cooldown[b.warning.weapon]=b.round+(weaponFor(warned.model,b.warning.weapon).cooldown??0);
    delete b.warning;
    addLog(b,'予告攻撃を中断');
  }
}
