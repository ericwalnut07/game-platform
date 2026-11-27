import type { Battle, BattleEvent, Unit } from '../../../src/games/monster-wars/battle-state';
import { modelFor, weaponFor } from '../../../src/games/monster-wars/catalog';
import type { Layer } from '../../../src/games/monster-wars/types';
import { weaponEffects, type Pattern } from './weapons';
import { hitPoint, launchPoint, projectedCell, unitCenter, type Point } from './anchors';

export const modes=['normal','fast','simple','off'] as const;
export type Mode=typeof modes[number];
export const modeLabels:Record<Mode,string>={normal:'標準',fast:'高速',simple:'簡易',off:'OFF'};

export type Picture='VFX01'|'VFX01-M'|'VFX02'|'VFX04'|'VFX05'|'VFX09'|'VFX11'|'VFX13'|'VFX14';
export const durations:Record<Picture,number>={'VFX01':120,'VFX01-M':120,'VFX02':120,'VFX04':600,'VFX05':160,'VFX09':200,'VFX11':480,'VFX13':240,'VFX14':600};
export type Effect={
  id:string; kind:'sheet'|'rocket'|'line'|'ring'|'particles'|'text'|'tile'|'fan'; start:number; duration:number;
  from:Point; to?:Point; layer:Layer; color?:string; asset?:Picture; size:number; angle?:number; arc?:number; text?:string;
};
export type Body={
  id:string; entity:string; start:number; duration:number; from:Point; to:Point;
  motion:'move'|'turn'|'recoil'|'lunge'|'glow'|'shake'|'brace'|'support'|'fall'|'appear';
  unit:Unit; facing?:Unit['facing'];
};
type Attack=Extract<BattleEvent,{kind:'attack'}>;
const zero:Point=[0,0];
const delta=(a:Point,b:Point):Point=>[b[0]-a[0],b[1]-a[1]];
const heading=(a:Point,b:Point)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
const statusStyle={shellBreak:['外殻破損','#ffc88a'],burn:['燃焼','#ff8441'],chill:['冷却','#91e9ff']} as const;

export function timeline(before:Battle,after:Battle,mode:Mode){
  const effects:Effect[]=[],bodies:Body[]=[],attacks:{weapon:string;pattern:Pattern}[]=[];
  const units=new Map(before.units.map(u=>[u.id,u]));
  const originals=new Map(units);
  let clock=0, end=0;
  let attack:{event:Attack;pattern?:Pattern;from:Point;to:Point;impact:number;end:number}|undefined;
  if(mode==='off')return {effects,bodies,attacks,duration:0};
  const simple=mode==='simple',size=before.size;
  function fx(id:Effect['id'],kind:Effect['kind'],from:Point,layer:Layer,start:number,duration:number,extent:number,extra:Partial<Effect>={}){
    if(effects.length>=96)return;
    effects.push({id,kind,from,layer,start,duration,size:extent,...extra});
    end=Math.max(end,start+duration);
  }
  function sheet(id:string,asset:Picture,at:Point,layer:Layer,start:number,extent:number,angle=0,duration=durations[asset]){
    fx(id,'sheet',at,layer,start,simple?Math.min(175,duration):duration,extent,{asset,angle});
  }
  function body(id:string,motion:Body['motion'],u:Unit,start:number,duration:number,from:Point=zero,to:Point=zero,facing?:Unit['facing']){
    if(simple&&['recoil','lunge','glow','support'].includes(motion))return;
    bodies.push({id,motion,entity:u.id,unit:u,start,duration:simple?Math.min(145,duration):duration,from,to,...(facing===undefined?{}:{facing})});
    end=Math.max(end,start+duration);
  }
  function ground(at:Point,layer:Layer,start:number,extent:number){
    if(layer!=='ground'||simple)return;
    fx('EF12','ring',at,layer,start,270,extent,{color:'#d7ad69'});
    sheet('EF13','VFX14',at,layer,start,extent*1.6,0,360);
  }
  const events=after.events??[];
  for(const [index,event] of events.entries()){
    if(event.kind==='attack'){
      const u=units.get(event.source);
      if(!u)continue;
      const rule=Object.hasOwn(weaponEffects,event.weapon)?weaponEffects[event.weapon]:undefined;
      const strength=rule?.strength??1;
      const start=Math.max(clock,attack?.end??0),w=weaponFor(u.model,event.weapon);
      const from=launchPoint(u,size,event.origin,event.sourceLayer,event.weapon);
      const contacts=events.slice(index+1);
      const boundary=contacts.findIndex(e=>e.kind==='attack');
      const results=boundary<0?contacts:contacts.slice(0,boundary);
      const damage=results.filter((e):e is Extract<BattleEvent,{amount:number}>=>e.kind==='damage'&&e.layer===event.layer);
      const partContact=(event.weapon==='W06'||event.weapon==='W16')
        ?damage.find(e=>'part' in e&&e.part):undefined;
      const target=partContact??damage.find(e=>'at' in e&&e.at&&String(e.at)===String(event.aim));
      const targetUnit=target?.kind==='damage'?units.get(target.target):undefined;
      const to=targetUnit?hitPoint(targetUnit,size,partContact?.at??event.aim,event.layer,partContact?.part):projectedCell(event.aim,size,event.layer);
      const duration=simple?175:rule?.duration??(w.kind?340:300);
      const impact=start+(simple?0:rule?.impact??(rule?.pattern==='P05'?310:rule?.pattern==='P11'?195:rule?.pattern==='P03'?160:rule?.pattern==='P09'?125:105));
      attack={event,from,to,impact,end:start+duration,...(rule?{pattern:rule.pattern}:{})};
      const direction=heading(from,to),axis:Point=[Math.cos(direction),Math.sin(direction)];
      if(rule)attacks.push({weapon:event.weapon,pattern:rule.pattern});
      if(event.reaction)fx('EF16','ring',from,event.sourceLayer,start,180,.8,{color:'#ffe78e'});
      if(!simple&&rule){
        if(rule.muzzle){
          body('M03','recoil',u,start,165,zero,[-axis[0]*.20*strength,-axis[1]*.20*strength]);
          const flash=rule.pattern==='P01'?.90:rule.pattern==='P02'?.82:1.6;
          sheet('EF01',rule.muzzle,from,event.sourceLayer,start,flash*strength,direction,rule.pattern==='P02'?78:120);
        }
        switch(rule.pattern){
          case 'P01':
            for(let i=0;i<event.strikes;i++){
              const t=start+i*39;
              fx('EF04','line',from,event.layer,t,105,.045*strength,{to,color:'#ffe099'});
              sheet('EF08','VFX09',to,event.layer,t+85,.65*strength,direction,100);
            }
            break;
          case 'P02':
            fx('EF04','line',from,event.layer,start+20,90,.076,{to,color:'#fff5b6'});
            sheet('EF08','VFX09',to,event.layer,impact,1.12*strength,direction);
            break;
          case 'P03':case 'P05':
            if(rule.muzzle)sheet('EF02','VFX04',from,event.sourceLayer,start+70,1.36*strength,direction,330);
            fx('EF05','sheet',from,event.layer,start+40,impact-start-40,.52,{to,asset:'VFX05',arc:rule.arc??(rule.pattern==='P05'?1.85:0)});
            break;
          case 'P04':
            sheet('EF02','VFX04',from,event.sourceLayer,start+15,1.15,direction,270);
            fx('EF05','rocket',from,event.layer,start+32,impact-start-32,.65,{to,arc:rule.arc??0,color:'#ffeaa4'});
            sheet('EF10','VFX11',to,event.layer,impact,1.36*strength,0,320);
            ground(projectedCell(event.aim,size,event.layer),event.layer,impact,1.05);
            break;
          case 'P06':
            fx('EF07','fan',from,event.layer,start,255,1,{to,color:'#ff914e'});
            for(const [i,at] of event.area.entries())
              fx('EF07','particles',projectedCell(at,size,event.layer),event.layer,impact+i*18,250,.95,{color:i%2?'#ffd36c':'#ff713a'});
            break;
          case 'P07':
            fx('EF04','line',from,event.layer,start+30,100,.09,{to,color:'#d1f6ff'});
            fx('EF07','particles',to,event.layer,impact,315,.99,{color:'#91e9ff'});
            sheet('EF08','VFX09',to,event.layer,impact,.78,direction);
            break;
          case 'P08':
            body('M04','lunge',u,start,245,zero,[axis[0]*.46*strength,axis[1]*.40*strength]);
            sheet('EF11','VFX13',to,event.layer,impact,strength,direction);
            if(event.weapon==='gClaw')ground(projectedCell(event.aim,size,event.layer),event.layer,impact,1.15);
            break;
          case 'P09': {
            const dive=event.weapon==='dive';
            body('M04','lunge',u,start,300,zero,[axis[0]*.70,axis[1]*.55+(dive?.65:0)]);
            if(dive)fx('EF11','fan',from,event.layer,start+40,150,.65,{to,color:'#fcf0da'});
            break;
          }
          case 'P10':
            body('M04','lunge',u,start,240,zero,event.weapon==='stomp'?[0,-.48]:[axis[0]*.35,axis[1]*.25]);
            if(event.weapon==='stomp')ground(projectedCell(event.aim,size,event.layer),event.layer,impact,1.5);
            else fx('EF11','fan',from,event.layer,impact,180,1,{to,color:'#fff0ca'});
            sheet('EF11','VFX13',to,event.layer,impact,strength,direction);
            break;
          case 'P11': {
            body('M05','glow',u,start,425);
            fx('EF03','particles',from,event.sourceLayer,start,255,.55,{color:'#baffb9'});
            const endpoints=w.both?(['ground','air'] as const):[event.layer];
            const far=event.area.reduce((a,p)=>Math.hypot(...delta(from,projectedCell(p,size,event.layer)))>
              Math.hypot(...delta(from,projectedCell(a,size,event.layer)))?p:a,event.aim);
            for(const layer of endpoints)fx('EF06','line',from,layer,impact-15,250,rule.beam??.21,
              {to:layer===event.layer&&!w.both?to:projectedCell(far,size,layer),color:'#87ff9e'});
            break;
          }
          case 'P12':
            body('M08','support',u,start,240);
            break;
        }
      }
      if(rule?.pattern==='P03'||rule?.pattern==='P05'){
        for(const [i,at] of event.area.slice(0,9).entries()){
          const contact=projectedCell(at,size,event.layer);
          const burst=event.weapon==='W20'?impact+i*18:impact;
          if(rule.breakArmor)fx('EF09','particles',contact,event.layer,burst,255,1.08,{color:'#ffce92'});
          else sheet('EF10','VFX11',contact,event.layer,burst,(rule.pattern==='P03'?1.55:1.20)*strength,0,330);
          ground(contact,event.layer,burst,1.05*strength);
        }
      }
      if(simple&&(rule?.pattern==='P08'||rule?.pattern==='P10'))sheet('EF11','VFX13',to,event.layer,impact,strength,direction);
      if(rule?.pattern==='P09'){
        sheet('EF11','VFX13',to,event.layer,impact,1.65,direction);
        ground(projectedCell(event.aim,size,event.layer),event.layer,impact,1.28);
      }
      end=Math.max(end,start+duration);
    }else if(event.kind==='move'){
      const u=units.get(event.entity),original=originals.get(event.entity);
      if(!u||!original)continue;
      const moved={...u,at:event.to,facing:event.facing??u.facing};
      const start=Math.max(clock,attack?(event.forced?attack.impact+95:attack.end):0);
      const base=unitCenter(original,size);
      const to=delta(base,unitCenter(moved,size)),from=delta(base,unitCenter(u,size));
      const turned=moved.facing!==u.facing;
      const translated=String(event.from)!==String(event.to);
      if(translated||turned)body(translated?'M01':'M02',translated?'move':'turn',moved,start,translated?92:105,from,to,moved.facing);
      units.set(u.id,moved);clock=start+(simple?65:translated?92:105);
      if(!event.forced)attack=undefined;
    }else if(event.kind==='terrain-break'){
      const point=projectedCell(event.at,size),start=Math.max(0,clock-22);
      sheet('EF18','VFX11',point,'ground',start,1.42,0,280);
      ground(point,'ground',start,1.22);
    }else if(event.kind==='warning'){
      const u=units.get(event.source);
      if(!u)continue;
      const silhouette=launchPoint(u,size,u.at,event.layer,event.weapon);
      body('M05','glow',u,clock,420);
      fx('EF03','particles',silhouette,event.layer,clock,320,.75,{color:'#faff8e'});
      for(const at of event.area)fx('EF17','tile',projectedCell(at,size),event.layer,clock,390,1,{color:'#fe754d'});
    }else if(event.kind==='stance'||event.kind==='spawn'){
      const u=units.get(event.entity)??after.units.find(v=>v.id===event.entity);
      if(!u)continue;
      const layer=modelFor(u.model).layer,point=projectedCell(u.at,size,layer);
      const spawn=event.kind==='spawn';
      body(spawn?'M10':'M07',spawn?'appear':'brace',u,clock,spawn?400:235);
      fx(spawn?'EF14':'EF16','ring',point,layer,clock,250,1.2,{color:spawn?'#b1ffa9':'#f6df82'});
      if(spawn)ground(point,layer,clock,1);
      else fx('EF16','text',point,layer,clock,220,.5,{text:event.stance==='watch'?'迎撃':'防御',color:'#ffe38a'});
    }else{
      const u=units.get(event.target);
      if(!u)continue;
      const layer=('layer' in event&&event.layer)||modelFor(u.model).layer;
      const start=attack?.impact??clock;
      const at=('at' in event&&event.at)||u.at;
      const point=hitPoint(u,size,at,layer,'part' in event?event.part:undefined);
      if(event.kind==='damage'){
        if(!event.part)body('M06','shake',u,start,155);
        if(event.cause==='burn')fx('EF07','particles',point,layer,start,230,.75,{color:statusStyle.burn[1]});
        if(event.part)fx('EF09','particles',point,layer,start,230,.72,{color:'#fff4c1'});
        if(attack?.pattern!=='P01'||simple)sheet('EF08','VFX09',point,layer,start,.80);
        fx('EF14','text',point,layer,start,260,.51,{text:event.broken?'部位破壊':'−'+event.amount,color:'#ffac92'});
      }else if(event.kind==='defeat'){
        const delay=start+90;
        body('M09','fall',u,delay,u.model==='K21'?1000:360);
        sheet('EF18','VFX11',point,layer,delay,u.model==='K21'?3.2:1.64);
        ground(projectedCell(at,size,layer),layer,delay,1.45);
      }else if(event.kind==='status'){
        const [label,color]=statusStyle[event.status];
        if(!event.cleared)fx('EF07','particles',point,layer,start,270,.83,{color});
        fx('EF14','text',point,layer,event.cleared?start:start+130,220,.48,{text:event.cleared?label+' 解除':label,color});
      }else{
        const weapon=attack?.event.weapon;
        const source=attack&&units.get(attack.event.source);
        const kind=source&&weapon?weaponFor(source.model,weapon).kind:undefined;
        const [label,color]=kind==='medic'?['✚ 救護 HP ＋','#aaff91']:event.kind==='heal'?['⚙ 修理 HP ＋','#85ffbd']:['▣ 補給 ＋','#a7dcff'];
        if(kind==='repair'&&!simple)sheet('EF08','VFX09',point,layer,start,.55);
        fx('EF15','particles',point,layer,start,260,.82*(weapon?weaponEffects[weapon]?.strength??1:1),{color});
        fx('EF15','text',point,layer,start,290,.49,{text:label+event.amount,color});
      }
    }
  }
  return {effects,bodies,attacks,duration:Math.max(clock,end)};
}
