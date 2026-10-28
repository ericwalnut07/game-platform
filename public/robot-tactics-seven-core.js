/* Seven-mission offline robot-tactics playtest engine.
 * Prototype numerical assumptions are deliberately separate from canonical rules.
 * Data is injected from docs/design/robot-tactics/early-seven-layouts.json. */
(function (root) {
"use strict";
const ABC="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LV={easy:1,normal:5,hard:11};
const LIGHT={
 melee:[[42,25,16,40,45],[48,32,20,45,48],[58,43,26,53,54]],
 ranged:[[38,15,26,36,40],[43,18,34,41,43],[52,24,45,48,48]],
 defense:[[56,22,15,52,32],[64,28,19,57,35],[77,38,25,66,39]],
 mobile:[[40,23,14,35,57],[46,29,17,39,62],[55,39,22,46,70]]
};
const MEDIUM={melee:[55,74,33,3,56],ranged:[58,54,43,3,46],defense:[66,44,50,3,35],mobile:[48,44,30,4,87]};
// User-approved 2026-10-28 balance comparison for this standalone playtest ONLY.
// Do not overwrite canonical rules.json or early-seven-layouts.json until final balance is adopted.
const PLAYTEST_TUNING=Object.freeze({
 1:Object.freeze({roundLimit:6}),
 2:Object.freeze({bossHP:150,bossDEF:55})
});
const PLAYER=[
 ["P1","自機1 近接",95,65,46,3,62,120,"melee",1,34],
 ["P2","自機2 射撃",83,61,42,3,53,120,"ranged",4,30],
 ["P3","自機3 機動",82,57,39,4,76,115,"melee",1,31]
];
const FRIEND=[
 ["A1","友軍1 前衛",70,44,53,3,36,75,"melee",1,26],
 ["A2","友軍2 射撃",54,54,40,3,45,100,"ranged",4,26]
];
const xy = function(c){const m=/^([A-Z])([0-9]+)$/.exec(c);return m?[ABC.indexOf(m[1]),Number(m[2])-1]:[-1,-1];};
const pos = function(x,y){return ABC[x]+(y+1);};
const distance = function(a,b){const aa=xy(a),bb=xy(b);return Math.abs(aa[0]-bb[0])+Math.abs(aa[1]-bb[1]);};
const clamp=function(n,a,b){return Math.max(a,Math.min(b,n));};
const modifier=function(diff){return LV[diff]?["easy","normal","hard"].indexOf(diff):0;};
function create(map,difficulty){
 if(!["easy","normal","hard"].includes(difficulty))throw Error("difficulty");
 const tuning=PLAYTEST_TUNING[map.number]||{};
 const s={map:map,round:1,maxRounds:tuning.roundLimit??map.roundLimit,difficulty:difficulty,units:[],order:[],cursor:0,
  active:null,moved:false,ended:false,win:null,reason:"",history:[],enemyKills:0,
  deadPlayersThisRound:new Set(),usedFormations:new Set(),reinforcementDone:false,
  reinforcementPending:null,breakthrough:new Set(),dataCarrier:null,dataDropped:null,dataCollected:false,
  convoyIndex:0,baseStreak:0,baseOwners:{},friendAuto:false,previewAdvanced:true,
  objectHP:{},pendingEvents:[]};
 const board=map.board,ob=map.objectives,walls=new Set(board.walls);
 function record(t){s.history.push("R"+s.round+" "+t);if(s.history.length>250)s.history.shift();}
 function within(c){const p=xy(c);return p[0]>=0&&p[1]>=0&&p[0]<board.width&&p[1]<board.height;}
 function addUnit(id,name,team,cell,hp,atk,def,mov,spd,maxEn,family,range,power,group){
  const u={id,name,team,cell,hp,maxHp:hp,atk,def,mov,spd,maxEn,en:Math.ceil(maxEn*.3),
   family,range,minRange:1,power,group:group||null,defenseBonus:0,defenseUntil:null,defend:false,
   command:"free-action",respawnRound:0,hasMoved:false};
  s.units.push(u);return u;
 }
 function alive(u){return u&&u.hp>0;}
 function friends(){return s.units.filter(u=>alive(u)&&(u.team==="player"||u.team==="friend"));}
 function enemies(){return s.units.filter(u=>alive(u)&&u.team==="enemy");}
 function structureCells(){
  const cells=[];if(ob.structure)cells.push.apply(cells,ob.structure.cells);
  if(ob.depots)for(const d of ob.depots)if(s.objectHP[d.id]>0)cells.push.apply(cells,d.cells);
  return cells;
 }
 function occupied(cell,ignoreId){
  if(walls.has(cell)||structureCells().includes(cell))return true;
  if(ob.transport&&s.objectHP.convoy>0&&s.convoyCell===cell)return true;
  return s.units.some(u=>alive(u)&&u.id!==ignoreId&&u.cell===cell);
 }
 function unitAt(cell){return s.units.find(u=>alive(u)&&u.cell===cell);}
 function passable(cell,ignore){return within(cell)&&!occupied(cell,ignore);}
 function targets(u){
  const team=u.team==="enemy"?friends():enemies();
  let all=team.slice();
  if(u.team==="enemy"&&map.number===1&&s.objectHP.facility>0)all.push({id:"facility",team:"structure",cell:ob.structure.cells[0],cells:ob.structure.cells,name:"防衛施設",hp:s.objectHP.facility,def:ob.structure.def});
  if(u.team==="enemy"&&map.number===5&&s.objectHP.convoy>0)all.push({id:"convoy",team:"structure",cell:s.convoyCell,name:"輸送車",hp:s.objectHP.convoy,def:30});
  if(u.team==="player"&&map.number===4)for(const d of ob.depots)if(s.objectHP[d.id]>0)all.push({id:d.id,team:"structure",cell:d.cells[0],cells:d.cells,name:d.id==="depot-left"?"左補給拠点":"右補給拠点",hp:s.objectHP[d.id],def:45});
  return all;
 }
 function inRange(u,t,from){
  const at=from||u.cell;const cells=t.cells||[t.cell];
  return cells.some(c=>{const n=distance(at,c);return n>=u.minRange&&n<=u.range&&lineClear(at,c);});
 }
 function lineClear(a,b){
  const A=xy(a),B=xy(b),n=Math.max(Math.abs(A[0]-B[0]),Math.abs(A[1]-B[1]));
  for(let k=1;k<n;k++){let q=pos(Math.round(A[0]+(B[0]-A[0])*k/n),Math.round(A[1]+(B[1]-A[1])*k/n));if(walls.has(q))return false;}
  return true;
 }
 function moveOptions(u){
  const seen=new Map([[u.cell,0]]),q=[u.cell];
  for(let i=0;i<q.length;i++){
   const here=q[i],p=xy(here),cost=seen.get(here);if(cost>=u.mov)continue;
   for(const v of [[1,0],[-1,0],[0,1],[0,-1]]){
    let n=pos(p[0]+v[0],p[1]+v[1]);
    if(!seen.has(n)&&passable(n,u.id)){seen.set(n,cost+1);q.push(n);}
   }
  }
  return seen;
 }
 function setEn(u,delta){u.en=clamp(u.en+delta,0,u.maxEn);}
 function recovery(u,normalHit,moved){
  setEn(u,Math.max(4,Math.floor(u.maxEn*.025)));
  if(normalHit)setEn(u,Math.max(6,Math.floor(u.maxEn*.025)));
  if(moved)setEn(u,3);
 }
 function damageValue(u,t,formula){
  let n=formula===undefined?Math.floor(10*(u.atk+u.power)/Math.max(1,t.def)):formula;
  if(t.defenseBonus&&t.defenseBonus>0){
   const newN=Math.floor(10*(u.atk+u.power)/Math.max(1,t.def+t.defenseBonus));
   const lower=t.defenseCap===undefined?0:Math.ceil(n*(1-t.defenseCap));
   n=Math.max(lower,newN);
  } else if(t.defend)n=Math.floor(n*.8);
  return Math.max(1,n);
 }
 function applyDamage(attacker,t,n){
  if(t.id==="facility"||t.id==="convoy"||(ob.depots&&ob.depots.some(d=>d.id===t.id))){
   s.objectHP[t.id]=Math.max(0,s.objectHP[t.id]-n);
   record(attacker.name+" → "+t.name+" "+n+" dmg ("+s.objectHP[t.id]+")");
   if(t.id==="facility"&&s.objectHP.facility===0)finish(false,"施設が破壊された");
   if(t.id==="convoy"&&s.objectHP.convoy===0)finish(false,"輸送車が破壊された");
   if(ob.depots&&ob.depots.some(d=>d.id===t.id)&&s.objectHP[t.id]===0){
    record(t.name+"を破壊");
    if(ob.depots.every(d=>s.objectHP[d.id]===0))finish(true,"2つの補給拠点を破壊");
   }
   return;
  }
  const was=alive(t);t.hp=Math.max(0,t.hp-n);
  record(attacker.name+" → "+t.name+" "+n+" dmg ("+t.hp+")");
  if(was&&!alive(t)){
   record(t.name+" 撃破");
   if(t.team==="enemy"){
    s.enemyKills++;
    setEn(attacker,5);
    if(t.id==="commander"&&map.number===2)finish(true,"指揮機を撃破");
   }else{
    if(t.team==="player"){
     s.deadPlayersThisRound.add(t.id);
     if(s.deadPlayersThisRound.size>=3)finish(false,"同一ラウンド中に自機3機が撃破された");
     if(s.dataCarrier===t.id){s.dataDropped=t.cell;s.dataCarrier=null;record("データを"+t.cell+"に落とした");}
    }
    t.respawnRound=s.round+2;
   }
  }
 }
 function finish(win,reason){if(s.ended)return;s.ended=true;s.win=win;s.reason=reason;s.active=null;record((win?"勝利：":"敗北：")+reason);}
 function calcTargetAt(cell){
  const u=unitAt(cell);if(u)return u;
  if(ob.structure&&ob.structure.cells.includes(cell))return{id:"facility",team:"structure",cell,cells:ob.structure.cells,name:"防衛施設",def:ob.structure.def};
  if(ob.depots){const d=ob.depots.find(z=>z.cells.includes(cell)&&s.objectHP[z.id]>0);if(d)return{id:d.id,team:"structure",cell,cells:d.cells,name:d.id==="depot-left"?"左補給拠点":"右補給拠点",def:45};}
  if(ob.transport&&s.convoyCell===cell&&s.objectHP.convoy>0)return{id:"convoy",team:"structure",cell,name:"輸送車",def:30};
  return null;
 }
 function markMovementObjective(u){
  if(u.team!=="player")return;
  if(ob.breakthroughCells&&ob.breakthroughCells.includes(u.cell)){
   if(!s.breakthrough.has(u.id))record(u.name+" 突破成功");
   s.breakthrough.add(u.id);
   if(s.breakthrough.size>=2)finish(true,"異なる自機2機が敵陣を突破");
  }
  if(ob.terminal){
   if((u.cell===ob.terminal.cell&&!s.dataCollected)||(s.dataDropped===u.cell&&!s.dataCarrier)){
    s.dataCarrier=u.id;s.dataCollected=true;s.dataDropped=null;record(u.name+" データ回収");
   }
   if(s.dataCarrier===u.id&&u.cell===ob.transmission.cell)finish(true,"データを自陣へ送信した");
  }
 }
 function advance(){
  if(s.ended)return;
  let safety=0;
  while(!s.ended&&safety++<120){
   if(s.cursor>=s.order.length){endRound();continue;}
   const turn=s.order[s.cursor];
   if(turn.type==="squad"){
    if(!enemies().some(u=>u.group===turn.id)){s.cursor++;continue;}
    s.active=null;return;
   }
   const u=s.units.find(x=>x.id===turn.id);
   if(!alive(u)){s.cursor++;continue;}
   if(u.team==="player"){s.active=u.id;s.moved=false;u.hasMoved=false;u.defend=false;for(const v of s.units)if(v.defenseUntil===u.id){v.defenseBonus=0;v.defenseUntil=null;v.defenseCap=undefined;}record(u.name+" の手番");return;}
   s.active=null;return;
  }
 }
 function initiative(){
  const turns=s.units.filter(alive).filter(u=>u.group===null).map(u=>({type:"unit",id:u.id,spd:u.spd}));
  const groups=new Map();for(const u of enemies())if(u.group){groups.set(u.group,Math.max(groups.get(u.group)||0,u.spd));}
  for(const [id,spd] of groups)turns.push({type:"squad",id,spd});
  turns.sort((a,b)=>b.spd-a.spd||a.id.localeCompare(b.id));
  s.order=turns;s.cursor=0;s.active=null;advance();
 }
 function getPossibleSpawns(wave){
  if(wave.squad)return [wave.squad.memberCells.concat(wave.fallbackCells||[])];
  let remain=ob.depots.find(x=>s.objectHP[x.id]>0);
  if(!remain)return[];
  return wave.spawnBranches.filter(x=>x.survivingDepotId===remain.id).map(x=>x.memberCells.concat(x.fallbackCells));
 }
 function spawnWave(wave){
  const candidates=getPossibleSpawns(wave);
  const template=wave.squad||wave.squadTemplate;
  const chosen=[];
  for(const list of candidates){for(const cell of list){
   if(chosen.length>=3)break;
   if(!passable(cell))continue;
   const box=chosen.concat([cell]).map(xy),xs=box.map(p=>p[0]),ys=box.map(p=>p[1]);
   if(Math.max.apply(null,xs)-Math.min.apply(null,xs)<=3&&Math.max.apply(null,ys)-Math.min.apply(null,ys)<=3)chosen.push(cell);
  }if(chosen.length===3)break;chosen.length=0;}
  if(chosen.length<3){record("増援出現地点が塞がれたため次Rへ延期");return false;}
  const blueprint={...template,memberCells:chosen};
  addSquad(blueprint);record("敵増援："+chosen.join("・"));return true;
 }
 function triggerEventWave(){
  if(s.reinforcementDone||s.reinforcementPending!==null||!map.reinforcements.length)return;
  const wave=map.reinforcements[0],t=wave.trigger;
  const triggered=t.type==="enemy-defeats-total-reached"?s.enemyKills>=t.count
   :t.type==="first-supply-depot-destroyed"?ob.depots.some(d=>s.objectHP[d.id]===0)
   :t.type==="data-collected"?s.dataCollected:false;
  if(triggered){s.reinforcementPending=s.round+1;record("敵増援が次のラウンドに到着する");}
 }
 function respawn(){
  const elig=s.units.filter(u=>u.team!=="enemy"&&!alive(u)&&u.respawnRound>0&&u.respawnRound<=s.round);
  elig.sort((a,b)=>a.respawnRound-b.respawnRound||(a.team==="player"?0:1)-(b.team==="player"?0:1)||a.id.localeCompare(b.id));
  for(const u of elig){
   const cell=map.friendlyDeployment.respawnPriority.find(c=>passable(c));
   if(cell){u.cell=cell;u.hp=u.maxHp;u.en=Math.ceil(u.maxEn*.3);u.defenseBonus=0;u.defenseUntil=null;u.defend=false;u.respawnRound=0;record(u.name+" 再出撃："+cell);}
  }
 }
 function baseControl(){
  let count=0;
  for(const base of ob.bases){
   const near=s.units.filter(u=>alive(u)&&distance(u.cell,base.cell)<=1);
   const blue=near.filter(u=>u.team!=="enemy").length,red=near.filter(u=>u.team==="enemy").length;
   const owner=blue>red?"blue":red>blue?"red":"neutral";
   s.baseOwners[base.id]=owner;
   if(owner==="blue")count++;
  }
  s.baseStreak=count>=2?s.baseStreak+1:0;
  record("制圧拠点："+count+"/3、連続"+s.baseStreak+"R（試遊用簡易判定）");
  if(s.baseStreak>=2)finish(true,"2拠点を2ラウンド連続制圧");
 }
 function endRound(){
  if(map.number===5&&!s.ended&&s.objectHP.convoy>0){
   const route=ob.transport.route,next=route[s.convoyIndex+1];
   if(next&&!occupied(next)){s.convoyIndex++;s.convoyCell=next;record("輸送車 → "+next);}
   else if(next)record("輸送ルートが塞がれた");
   if(s.convoyCell===ob.transport.goalCell)finish(true,"輸送車が目的地に到達");
  }
  if(map.number===6&&!s.ended)baseControl();
  if(map.number===1&&s.round===s.maxRounds&&!s.ended)finish(s.objectHP.facility>0,s.objectHP.facility>0?s.maxRounds+"R防衛成功":"施設破壊");
  if(s.ended)return;
  if(s.round>=s.maxRounds){finish(false,"制限ラウンド終了（目標未達成）");return;}
  triggerEventWave();
  s.round++;s.deadPlayersThisRound=new Set();s.usedFormations=new Set();
  respawn();
  const wave=map.reinforcements[0];
  if(wave&&!s.reinforcementDone&&(wave.trigger.type==="round-start"&&s.round>=wave.trigger.round||s.reinforcementPending!==null&&s.round>=s.reinforcementPending)){
   if(spawnWave(wave)){s.reinforcementDone=true;s.reinforcementPending=null;}
  }
  initiative();
 }
 function addSquad(e){
  const i=modifier(difficulty),base=LIGHT[e.chassis][i];
  for(let n=0;n<3;n++){
   const d=e.chassis==="ranged"?4:e.chassis==="defense"?1:e.chassis==="mobile"?1:1;
   const u=addUnit(e.id+"-"+(n+1),e.id+" "+(n+1),"enemy",e.memberCells[n],
    base[0],e.chassis==="ranged"?base[2]:base[1],base[3],
    e.chassis==="mobile"?4:3,base[4],65,e.chassis,d,18+3*i,e.id);
   u.chassis=e.chassis;u.role=e.role;u.model=difficulty==="hard"?"C":difficulty==="normal"?"B":"A";
  }
 }
 function addSolo(e){
  const base=e.kind==="medium"?MEDIUM[e.archetype]
   :e.kind==="heavy"?[135,70,74,2,30]
   :[210,95,70,3,52];
  const name=e.kind==="boss"?"敵指揮機":e.kind==="heavy"?"重量装甲型":"中量"+e.archetype;
  const hp=e.kind==="boss"?(tuning.bossHP??base[0]):base[0];
  const atk=base[1],def=e.kind==="boss"?(tuning.bossDEF??base[2]):base[2]; // Standalone playtest balance only.
  const ranged=e.archetype==="ranged"||e.kind==="boss";
  const u=addUnit(e.id,name,"enemy",e.cell,hp,atk,def,base[3],base[4],100,ranged?"ranged":"melee",ranged?4:1,e.kind==="boss"?40:30,null);
  u.chassis=e.archetype;
 }
 function init(){
  for(const p of PLAYER){let u=addUnit(p[0],p[1],"player",map.friendlyDeployment.directlyControlled[p[0][1]],...p.slice(2));u.mov=p[5];}
  for(const [i,p] of FRIEND.entries()){let u=addUnit(p[0],p[1],"friend",map.friendlyDeployment.friendlyAI[i+1].cell,...p.slice(2));u.mov=p[5];u.command=i===0?"defend-location":"free-action";}
  for(const e of map.initialEnemies){if(e.kind==="light-squad")addSquad(e);else addSolo(e);}
  if(ob.structure)s.objectHP.facility=ob.structure.maxHp;
  if(ob.depots)for(const dep of ob.depots)s.objectHP[dep.id]=100; // playtest-only HP
  if(ob.transport){s.objectHP.convoy=180;s.convoyCell=ob.transport.initialCell;} // playtest-only HP
  record("M"+String(map.number).padStart(2,"0")+" "+map.title+" / "+difficulty+" 開始");
  initiative();
 }
 function legalMove(cell){const u=s.units.find(x=>x.id===s.active);return alive(u)&&!s.moved&&moveOptions(u).has(cell)&&cell!==u.cell;}
 function playerMove(cell){
  if(s.ended||!s.active||!legalMove(cell))return false;
  const u=s.units.find(x=>x.id===s.active),before=u.cell;u.cell=cell;s.moved=true;
  setEn(u,3);record(u.name+" "+before+"→"+cell);markMovementObjective(u);return true;
 }
 function chargeAttackLanding(u,t){
  if(u.team!=="player"||u.family!=="melee"||u.range!==1||!t||inRange(u,t))return null;
  const footprint=t.cells||[t.cell];
  if(Math.min(...footprint.map(c=>distance(u.cell,c)))!==2)return null;
  const [x,y]=xy(u.cell);
  // Prototype UI: deterministically choose the first empty 1-step landing cell.
  // Precise choice among two legal L-shaped approaches is still a UI detail.
  for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
   const landing=pos(x+dx,y+dy);
   if(passable(landing,u.id)&&inRange(u,t,landing))return landing;
  }
  return null;
 }
 function formationPeople(u,kind,target){
  const mates=friends().filter(v=>v.id!==u.id);
  const near=mates.filter(v=>distance(v.cell,u.cell)===1);
  if(kind==="line"||kind==="pair")return near.slice(0,1);
  if(kind==="pincer"){
   if(!target)return[];
   const a=xy(u.cell),b=xy(target.cell);
   if(distance(u.cell,target.cell)!==1)return[];
   return mates.filter(v=>{const cc=xy(v.cell);return cc[0]===2*b[0]-a[0]&&cc[1]===2*b[1]-a[1];}).slice(0,1);
  }
  if(kind==="delta"||kind==="protective"){
   for(let i=0;i<mates.length;i++)for(let j=i+1;j<mates.length;j++){
    const cells=[u.cell,mates[i].cell,mates[j].cell].map(xy),xs=cells.map(v=>v[0]),ys=cells.map(v=>v[1]);
    if(Math.max.apply(null,xs)-Math.min.apply(null,xs)===1&&Math.max.apply(null,ys)-Math.min.apply(null,ys)===1)return[mates[i],mates[j]];
   }
  }
  return[];
 }
 function useAction(kind,cell){
  if(s.ended||!s.active)return false;
  const u=s.units.find(x=>x.id===s.active);
  if(!u||!alive(u))return false;
  const t=cell?calcTargetAt(cell):null;
  const attackModes=["attack","chargeAttack","sweep","line","delta","pincer"];
  if(attackModes.includes(kind)){
   if(!t||(t.team!=="enemy"&&t.team!=="structure"))return false;
   if(kind!=="delta"&&kind!=="chargeAttack"&&!inRange(u,t))return false;
  }
  if(kind==="sweep"&&u.family!=="melee")return false;
  // 特攻: only single-target melee weapons with base max range 1; from distance exactly 2.
  const landing=kind==="chargeAttack"?chargeAttackLanding(u,t):null;
  if(kind==="chargeAttack"&&!landing)return false;
  if(["line","pair","delta","pincer","protective"].includes(kind)&&s.usedFormations.has(kind)){record("この連携技はこのRですでに使用しました");return false;}
  if(["pincer","protective"].includes(kind)&&!s.previewAdvanced){record("拡張連携をOFFにしています");return false;}
  const cost={attack:0,chargeAttack:0,sweep:0,line:40,pair:35,delta:75,pincer:50,protective:55,defend:0,charge:0}[kind];
  if(cost===undefined||u.en<cost)return false;
  const people=["line","pair","delta","pincer","protective"].includes(kind)?formationPeople(u,kind,t):[];
  const required={line:1,pair:1,delta:2,pincer:1,protective:2}[kind]||0;
  if(people.length<required){record("連携条件の味方配置を満たしていません");return false;}
  u.en-=cost;
  if(required)s.usedFormations.add(kind);
  if(kind==="chargeAttack"){
   const before=u.cell;
   u.cell=landing;
   if(!s.moved)setEn(u,3); // movement EN is awarded at most once per turn
   s.moved=true;
   record(u.name+" 特攻踏み込み "+before+"→"+landing);
   markMovementObjective(u);
   if(s.ended)return true;
  }
  if(kind==="charge"){setEn(u,Math.max(20,Math.floor(u.maxEn*.05)));record(u.name+" チャージ");}
  else if(kind==="defend"){u.defend=true;record(u.name+" 防御");}
  else if(kind==="pair"){
   u.defenseBonus=.75*people[0].def;u.defenseCap=.6;u.defenseUntil=u.id;record(u.name+" ペア連携：実効DEF "+Math.floor(u.def+u.defenseBonus));
  }else if(kind==="protective"){
   const all=[u,...people];
   for(const x of all){x.defenseBonus=.25*all.filter(y=>y!==x).reduce((sum,y)=>sum+y.def,0);x.defenseCap=.5;x.defenseUntil=u.id;}
   record(u.name+" 防護陣：3機を防御強化");
  }else{
   const atk=[u,...people].reduce((n,v)=>n+v.atk,0);
   if(kind==="delta"){
    const chosen=[t,...enemies().filter(x=>x.id!==t.id).sort((a,b)=>distance(a.cell,t.cell)-distance(b.cell,t.cell))].slice(0,3);
    const shots=chosen.map(x=>({x,val:Math.max(1,Math.floor(10*(atk+u.power)*.5/x.def))}));
    record(u.name+" デルタ連携（同時攻撃）");
    for(const shot of shots){applyDamage(u,shot.x,shot.val);} // Simultaneous snapshot, including all target hits.
   }else if(kind==="sweep"){
    // Sweep targets any second enemy in the wielder\'s own range, not necessarily adjacent to the first target.
    const ts=[t,...enemies().filter(x=>x.id!==t.id&&inRange(u,x))].slice(0,2);
    record(u.name+" 薙ぎ払い");
    for(const x of ts){if(!s.ended)applyDamage(u,x,Math.max(1,Math.floor(10*(u.atk+u.power)*.7/x.def)));}
   }else{
    const formula=kind==="line"?Math.floor(10*(atk+u.power)/t.def)
      :kind==="pincer"?Math.floor(10*(atk+u.power)*1.25/t.def):undefined;
    if(kind==="chargeAttack")record(u.name+" 特攻（単体、EN0）");
    else if(kind!=="attack")record(u.name+" "+kind+"連携");
    applyDamage(u,t,damageValue(u,t,formula));
   }
  }
  if(!s.ended){recovery(u,kind==="attack"||kind==="chargeAttack"||kind==="sweep",false);s.active=null;s.cursor++;advance();}
  return true;
 }
 function endPlayer(){if(s.ended||!s.active)return false;const u=s.units.find(x=>x.id===s.active);recovery(u,false,false);record(u.name+" 待機");s.active=null;s.cursor++;advance();return true;}
 function choiceGoal(u){
  const closest=(set)=>set.slice().sort((a,b)=>distance(u.cell,a.cell)-distance(u.cell,b.cell))[0];
  if(u.team==="friend"){
   if(u.command==="escort-specific-ally")return s.units.find(x=>x.id==="P1"&&alive(x))||closest(friends().filter(x=>x.team==="player"))||{cell:u.cell};
   if(u.command==="defend-location"){
    if(ob.structure)return{cell:ob.structure.cells[0],team:"goal"};
    if(ob.transport)return{cell:s.convoyCell,team:"goal"};
    if(ob.bases)return closest(ob.bases)||{cell:u.cell};
    if(ob.terminal)return{cell:ob.transmission.cell,team:"goal"};
   }
   if(u.command==="advance-to-location")return{cell:ABC[Math.floor(board.width/2)]+Math.ceil(board.height/3),team:"goal"};
   if(u.command==="focus-attack")return enemies().slice().sort((a,b)=>a.hp-b.hp||distance(a.cell,u.cell)-distance(b.cell,u.cell))[0]||{cell:u.cell};
   return closest(enemies())||{cell:u.cell};
  }
  if(map.number===1&&u.role==="assault")return{cell:ob.structure.cells[0],team:"goal"};
  if(map.number===5)return{cell:s.convoyCell,team:"goal"};
  if(map.number===2&&u.role==="escort")return s.units.find(x=>x.id==="commander"&&alive(x))||closest(friends())||{cell:u.cell};
  if(map.number===4&&u.role==="defender"){
   const depot=closest(ob.depots.filter(d=>s.objectHP[d.id]>0).map(d=>({cell:d.cells[0]})));
   if(depot)return depot;
  }
  if(map.number===6&&ob.bases)return closest(ob.bases)||{cell:u.cell};
  if(map.number===7&&u.role==="defender"&&!s.dataCollected)return{cell:ob.terminal.cell,team:"goal"};
  if(map.number===7&&s.dataCarrier){const carrier=s.units.find(x=>x.id===s.dataCarrier);if(carrier)return carrier;}
  if(u.role==="flanker"){
   const candidates=friends().slice().sort((a,b)=>{
    const isolation=x=>friends().filter(y=>y.id!==x.id&&distance(x.cell,y.cell)<=2).length;
    return isolation(a)-isolation(b)||distance(u.cell,a.cell)-distance(u.cell,b.cell);
   });
   if(candidates.length)return candidates[0];
  }
  return closest(friends())||{cell:u.cell};
 }
 function aiAttackTarget(u){
  const list=targets(u).filter(t=>inRange(u,t));
  list.sort((a,b)=>{
   const v=t=>{
    let priority=0;
    if(map.number===1&&t.id==="facility"&&u.role==="assault")priority=-200;
    if(map.number===5&&t.id==="convoy")priority=-200;
    if(map.number===7&&t.id===s.dataCarrier)priority=-100;
    if(u.team==="friend"&&u.command==="focus-attack")priority-=(100-(t.hp||100))*.5;
    return priority+distance(u.cell,t.cell)+(t.hp||100)*.001;
   };
   return v(a)-v(b);
  });
  return list[0];
 }
 function aiMove(u){
  const goal=choiceGoal(u);const opt=Array.from(moveOptions(u).keys());
  const legal=opt.filter(cell=>{
   if(!u.group)return true;
   const members=enemies().filter(x=>x.group===u.group&&x.id!==u.id);
   const coords=[cell,...members.map(x=>x.cell)].map(xy),xs=coords.map(x=>x[0]),ys=coords.map(x=>x[1]);
   return Math.max.apply(null,xs)-Math.min.apply(null,xs)<=3 && Math.max.apply(null,ys)-Math.min.apply(null,ys)<=3;
  });
  legal.sort((a,b)=>distance(a,goal.cell)-distance(b,goal.cell));
  const choice=legal[0]||u.cell;
  if(choice!==u.cell){record(u.name+" "+u.cell+"→"+choice);u.cell=choice;setEn(u,3);}
 }
 function aiAct(u){
  if(!alive(u))return;
  u.defend=false;for(const v of s.units){if(v.defenseUntil===u.id){v.defenseBonus=0;v.defenseUntil=null;v.defenseCap=undefined;}}
  let t=aiAttackTarget(u);
  if(!t){aiMove(u);t=aiAttackTarget(u);}
  if(t){applyDamage(u,t,damageValue(u,t));recovery(u,true,false);}
  else{record(u.name+" 移動・警戒");recovery(u,false,false);}
 }
 function squadAct(group){
  const member=enemies().filter(u=>u.group===group);
  for(const u of member){if(!aiAttackTarget(u))aiMove(u);}
  const attacks=member.map(u=>({u,t:aiAttackTarget(u)})).filter(x=>x.t);
  const shots=attacks.map(x=>({...x,val:damageValue(x.u,x.t)}));
  record(group+" 小隊同時攻撃："+shots.length+"件");
  for(const x of shots){applyDamage(x.u,x.t,x.val);} // All pre-snapshotted hits resolve as one squad batch.
  for(const u of member)recovery(u,attacks.some(a=>a.u.id===u.id),false);
 }
 function nextAI(){
  if(s.ended||s.active)return false;
  const entry=s.order[s.cursor];if(!entry)return false;
  if(entry.type==="squad")squadAct(entry.id);
  else{const u=s.units.find(x=>x.id===entry.id);if(alive(u))aiAct(u);}
  if(!s.ended){s.cursor++;advance();}
  return true;
 }
 function previewAI(){
  if(s.ended||s.active)return null;
  const entry=s.order[s.cursor];if(!entry)return null;
  if(entry.type==="squad"){const m=enemies().filter(x=>x.group===entry.id);return"軽量小隊 "+entry.id+"（"+m.length+"機）：個別移動後、射程内なら同時攻撃";}
  const u=s.units.find(x=>x.id===entry.id);if(!u)return null;
  const t=aiAttackTarget(u);const goal=choiceGoal(u);
  return u.name+"："+(t?"攻撃 "+t.name+"／予想"+damageValue(u,t)+"dmg":"移動・接近 → "+(goal.name||goal.cell));
 }
 function setCommand(id,command){
  const u=s.units.find(x=>x.id===id);if(!u||u.team!=="friend")return false;
  u.command=command;record(u.name+" 指示："+command);return true;
 }
 function snapshot(){return s;}
 init();
 return {state:s,moveOptions,legalMove,playerMove,useAction,endPlayer,nextAI,previewAI,setCommand,targets,unitAt,calcTargetAt,
  distance,xy,pos,occupied,markMovementObjective,finish,advance,initiative,endRound};
}
root.RobotSevenCore={create,xy,pos,distance};
})(globalThis);
