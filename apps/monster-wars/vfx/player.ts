import type { Battle, Unit } from '../../../src/games/monster-wars/battle-state';
import { modelFor } from '../../../src/games/monster-wars/catalog';
import { battleSprite, watchSprite } from '../art';
import type { LayerView } from '../board';
import { screenX, screenY } from '../projection';
import { unitCenter, type Point } from './anchors';
import manifest from './manifest.json';
import { modes, timeline, type Body, type Effect, type Mode } from './timeline';

const urls=import.meta.glob<string>('./assets/*.png',{eager:true,query:'?inline',import:'default'});
const settingsKey='monster-wars:effects';
export function getMode():Mode{
  try{
    const saved=localStorage.getItem(settingsKey);
    if(modes.includes(saved as Mode))return saved as Mode;
  }catch{/* Storage may be restricted in a file viewer. */}
  return matchMedia('(prefers-reduced-motion: reduce)').matches?'simple':'normal';
}
export function saveMode(mode:Mode){
  try{localStorage.setItem(settingsKey,mode);}catch{/* Keep the current session setting. */}
}

const assets=new Map(manifest.map(meta=>{
  const image=new Image();
  image.src=urls['./'+meta.file]??'';
  void image.decode().catch(()=>{});
  return [meta.id,{image,meta}];
}));
const tween=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

function paint(ctx:CanvasRenderingContext2D,e:Effect,t:number,cell:number,point:(p:Point)=>Point){
  const target=e.to&&point(e.to);
  const start=point(e.from);
  const [x,y]=target&&(e.kind==='sheet'||e.kind==='rocket')?tween(start,target,t):start;
  const arc=e.arc??0;
  const extent=e.size*cell;
  ctx.save();
  ctx.translate(x,y-4*t*(1-t)*arc*cell);
  ctx.fillStyle=ctx.strokeStyle=e.color??'#ffd6ac';
  ctx.globalAlpha=1-t*.76;
  switch(e.kind){
    case 'sheet':{
      const sheet=e.asset&&assets.get(e.asset);
      const angle=target?Math.atan2(target[1]-start[1]-4*(1-2*t)*arc*cell,target[0]-start[0]):e.angle??0;
      ctx.rotate(angle);
      if(sheet&&sheet.image.complete&&sheet.image.naturalWidth){
        const {frames,columns,frameSize:s,anchor:[ax=.5,ay=.5]}=sheet.meta;
        const f=Math.min(frames-1,Math.floor(t*frames));
        ctx.globalAlpha=1;
        ctx.drawImage(sheet.image,(f%columns)*s,Math.floor(f/columns)*s,s,s,-extent*ax,-extent*ay,extent,extent);
      }else{
        ctx.beginPath();ctx.ellipse(0,0,extent*.15*(1+t),Math.max(1,extent*.09),0,0,Math.PI*2);ctx.fill();
      }
      break;
    }
    case 'rocket':{
      if(!target)break;
      ctx.rotate(Math.atan2(target[1]-start[1]-4*(1-2*t)*arc*cell,target[0]-start[0]));
      for(let i=0;i<6;i++){
        const distance=extent*(.25+i*.19);
        ctx.globalAlpha=(1-i/6)*.7;
        ctx.fillStyle=i<2?'#ffa957':'#b8aea0';
        ctx.beginPath();ctx.arc(-distance,Math.sin(i*2)*extent*.09,extent*(.07+i*.02),0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
      ctx.fillStyle='#ecf3df';
      ctx.beginPath();ctx.moveTo(extent*.28,0);ctx.lineTo(0,-extent*.105);
      ctx.lineTo(-extent*.23,-extent*.105);ctx.lineTo(-extent*.23,extent*.105);ctx.lineTo(0,extent*.105);ctx.closePath();ctx.fill();
      break;
    }
    case 'line':case 'fan':{
      if(!target)break;
      const dx=target[0]-x,dy=target[1]-y,length=Math.hypot(dx,dy);
      if(length<.5)break;
      ctx.lineCap='round';
      if(e.kind==='fan'){
        const angle=Math.atan2(dy,dx);
        ctx.beginPath();ctx.moveTo(0,0);
        ctx.arc(0,0,length*(.4+.6*t),angle-.32,angle+.32);
        ctx.closePath();ctx.fill();
        break;
      }
      ctx.lineWidth=Math.max(1,extent);
      ctx.beginPath();
      const lead=e.id==='EF04'?Math.min(1,t*2):1,tail=e.id==='EF04'?Math.max(0,lead-.30):0;
      ctx.moveTo(dx*tail,dy*tail);ctx.lineTo(dx*lead,dy*lead);
      ctx.stroke();
      if(e.id==='EF06'){
        ctx.strokeStyle='#ecffda';ctx.lineWidth=Math.max(1,extent*.43);ctx.stroke();
      }
      break;
    }
    case 'ring':{
      ctx.lineWidth=Math.max(1,cell*.055);
      const r=extent*(.14+.6*t);
      ctx.beginPath();ctx.ellipse(0,0,r,r*screenY/screenX,0,0,Math.PI*2);ctx.stroke();
      break;
    }
    case 'particles':{
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        const radius=extent*(.19+.52*t)*(i%2?.75:1);
        const dot=Math.max(1,cell*(.073-.035*t));
        ctx.fillRect(Math.cos(a)*radius,Math.sin(a)*radius*.70,dot,dot);
      }
      ctx.beginPath();ctx.arc(0,0,Math.max(1,extent*.19*(1-t)),0,Math.PI*2);ctx.fill();
      break;
    }
    case 'text':{
      ctx.font='700 '+Math.max(10,Math.min(23,extent))+'px system-ui,sans-serif';
      ctx.textAlign='center';
      ctx.strokeStyle='#101b14';ctx.lineWidth=3;
      const dy=-cell*(.45+.37*t);
      ctx.strokeText(e.text??'',0,dy);ctx.fillText(e.text??'',0,dy);
      break;
    }
    case 'tile':{
      ctx.globalAlpha*=.28;ctx.beginPath();
      ctx.moveTo(-cell*screenX,0);ctx.lineTo(0,-cell*screenY);ctx.lineTo(cell*screenX,0);ctx.lineTo(0,cell*screenY);
      ctx.closePath();ctx.fill();
    }
  }
  ctx.restore();
}

function bodyFrame(el:HTMLElement,clip:Body,t:number,cell:number){
  const wave=Math.sin(Math.PI*t);
  let x=0,y=0,opacity=1,brightness=1,scale=1;
  switch(clip.motion){
    case 'move':case 'turn':{
      const [dx,dy]=tween(clip.from,clip.to,t);x=dx;y=dy;
      if(clip.unit.model==='K04'||clip.unit.model==='helicopter')y-=wave*.09;
      if(clip.facing!==undefined&&t>=.5){
        const next=battleSprite(clip.unit.model,clip.facing);
        if(next&&!el.classList.contains('art-'+next.key)){
          for(const name of [...el.classList])if(name.startsWith('art-')&&name!=='art-ghost')el.classList.remove(name);
          el.classList.add('art-'+next.key);
          watchSprite(next.key,next.sprite);
        }
      }
      break;
    }
    case 'recoil':case 'lunge':x=clip.to[0]*wave;y=clip.to[1]*wave;break;
    case 'glow':brightness+=wave*.65;break;
    case 'shake':x=Math.sin(t*22)*(1-t)*.10;brightness+=wave*.6;break;
    case 'brace':y=wave*.075;scale=1-wave*.045;break;
    case 'support':brightness+=wave*.32;y=-wave*.06;break;
    case 'fall':y=t*.35;opacity=1-t;scale=1-t*.18;break;
    case 'appear':y=-.36*(1-t);opacity=t;scale=.90+.10*t;break;
  }
  return {x:x*cell,y:y*cell,opacity,brightness,scale};
}

function makeIncoming(figures:Element,u:Unit,size:number){
  const art=battleSprite(u.model,u.facing);
  if(!art)return;
  const el=document.createElement('span');
  const [x,y]=unitCenter(u,size);
  el.className='battle-art art-'+art.key;
  el.style.setProperty('--x',String(x));
  el.style.setProperty('--y',String(y));
  el.style.setProperty('--depth',String(3*y+(modelFor(u.model).layer==='air'?size*4+2:0)));
  el.style.opacity='0';
  figures.append(el);
  watchSprite(art.key,art.sprite);
  return el;
}

export class EffectsPlayer {
  private finish: (()=>void)|undefined;
  get playing(){return this.finish!==undefined;}
  skip(){this.finish?.();}

  play(root:HTMLElement,before:Battle,after:Battle,mode:Mode,view:LayerView):Promise<void>|undefined{
    if(mode==='off'||document.hidden)return;
    const field=root.querySelector<HTMLElement>('.battle-field');
    const pane=field?.querySelector<HTMLElement>('.board-scroller'),board=pane?.querySelector<HTMLElement>('.board');
    const figures=board?.querySelector('.board-figures');
    if(!field||!pane||!board||!figures)return;
    const cell=parseFloat(getComputedStyle(board).getPropertyValue('--cell'));
    if(!cell)return;
    const scene=timeline(before,after,mode);
    if(!scene.duration)return;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    if(!ctx)return;
    canvas.className='battle-effects';
    canvas.setAttribute('aria-hidden','true');
    canvas.dataset.patterns=scene.attacks.map(a=>a.pattern).join(' ');
    canvas.dataset.weapons=scene.attacks.map(a=>a.weapon).join(' ');
    canvas.dataset.mode=mode;
    const width=pane.clientWidth,height=pane.clientHeight,dpr=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
    canvas.style.width=width+'px';canvas.style.height=height+'px';
    ctx.scale(dpr,dpr);
    field.append(canvas);
    const elements=new Map([...figures.querySelectorAll<HTMLElement>('[data-entity]')].map(el=>[el.dataset.entity!,el]));
    const incoming:HTMLElement[]=[];
    const clips=new Map<string,Body[]>();
    for(const clip of scene.bodies){
      if(view!=='both'&&modelFor(clip.unit.model).layer!==view&&!(view==='air'&&modelFor(clip.unit.model).airCells))continue;
      if(clip.motion==='appear'&&!elements.has(clip.entity)){
        const el=makeIncoming(figures,clip.unit,before.size);
        if(el){incoming.push(el);elements.set(clip.entity,el);}
      }
      if(!elements.has(clip.entity))continue;
      const list=clips.get(clip.entity)??[];
      list.push(clip);clips.set(clip.entity,list);
    }
    const effects=scene.effects.filter(e=>view==='both'||e.layer===view);
    const speed=(mode==='fast'?2:1)*Math.max(1,scene.duration/1700);
    const started=performance.now();
    let raf=0,timer=0;
    const skip=document.createElement('button');
    skip.type='button';skip.className='vfx-skip';skip.textContent='演出をスキップ';skip.dataset.a='vfx-skip';
    field.append(skip);
    return new Promise(resolve=>{
      const finish=()=>{
        this.finish=undefined;
        window.clearTimeout(timer);cancelAnimationFrame(raf);
        for(const [id] of clips){
          const el=elements.get(id)!;
          for(const property of ['translate','filter','opacity','scale'])el.style.removeProperty(property);
        }
        for(const el of incoming)el.remove();
        canvas.remove();skip.remove();resolve();
      };
      this.finish=finish;
      const draw=(now:number)=>{
        try{
          const t=Math.min(scene.duration,Math.max(0,(now-started)*speed));
          if(t>=scene.duration||!canvas.isConnected){finish();return;}
          const rect=board.getBoundingClientRect(),clip=pane.getBoundingClientRect();
          const point=(p:Point):Point=>[rect.left-clip.left-pane.clientLeft+p[0]*cell,rect.top-clip.top-pane.clientTop+p[1]*cell];
          ctx.clearRect(0,0,width,height);
          for(const [id,list] of clips){
            const el=elements.get(id)!;
            let x=0,y=0,opacity=1,brightness=1,scale=1;
            if(list.some(a=>a.motion==='appear'&&t<a.start))opacity=0;
            const moves=list.filter(a=>(a.motion==='move'||a.motion==='turn')&&t>=a.start);
            const last=moves.at(-1);
            const active=last?[last]:[];
            for(const motion of list){
              if(motion.motion==='move'||motion.motion==='turn'||t<motion.start)continue;
              if(t<motion.start+motion.duration||motion.motion==='fall')active.push(motion);
            }
            for(const clip of active){
              const f=bodyFrame(el,clip,Math.min(1,(t-clip.start)/clip.duration),cell);
              x+=f.x;y+=f.y;opacity*=f.opacity;brightness*=f.brightness;scale*=f.scale;
            }
            el.style.translate=x+'px '+y+'px';
            el.style.opacity=String(opacity);
            el.style.scale=String(scale);
            el.style.filter='brightness('+brightness+')';
          }
          for(const e of effects)if(t>=e.start&&t<e.start+e.duration)paint(ctx,e,(t-e.start)/e.duration,cell,point);
          raf=requestAnimationFrame(draw);
        }catch{finish();}
      };
      timer=window.setTimeout(finish,scene.duration/speed+120);
      raf=requestAnimationFrame(draw);
    });
  }
}
