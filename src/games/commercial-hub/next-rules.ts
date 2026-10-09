import type { GameRandomSource } from "../core/GameModule";
import { candidateAvailableInvestments, candidateProjects, CANDIDATE_INVESTMENTS } from "./next-data";
import { assertCanBuild } from "./buildings";
import { DISTRICTS } from "./data";
import { quoteBuildingUse } from "./income";
import { accessOptions } from "./logistics";
import { projectComplete } from "./projects";
import { gain, NO_COST, pay } from "./resources";
import { addEvent, companyOf, setResources, type HubState } from "./state";
import { BUILDING_SUITS, type BuildingSuit, type DistrictId, type PublicProject, type Access } from "./types";
export type MajorId = typeof CANDIDATE_INVESTMENTS[number]["id"];
export interface MajorCard {
  id: string; owner: string; purchasedRound: number; activeRound: number;
  status: "PENDING" | "ACTIVE" | "USED" | "FIZZLED";
  suit?: BuildingSuit; district?: DistrictId; project?: string; previousProject?: string;
  freeBuilt?: boolean; targets?: string[]; firedRound?: number;
}
export interface MajorState {
  permanentDeck: string[]; counterDeck: string[]; market: (string | null)[];
  cards: MajorCard[]; blocked: string[]; extraUsed: string[];
  queue: string[]; returnPhase: "PROCUREMENT" | "INVESTMENT";
}
export type MajorAction =
  | { type: "BUY_MAJOR"; cardId: string; suit?: BuildingSuit }
  | { type: "CHOOSE_MAJOR"; cardId: string; district?: DistrictId; suit?: BuildingSuit; projectId?: string; slot?: number; buildingId?: string; amount?: number; access?: Access };
export const MAJOR_LABELS: Record<string, [string,string]> = {
  "business-expansion": ["事業拡張計画", "建物上限7。翌R投資前に下位1棟を無料建設"],
  "industry-modernization": ["産業高度化計画", "指定系統の自社能力の主要産出＋1"],
  "advanced-equipment": ["高度設備導入", "毎R、自社上位建物1棟を追加1回使用。費用は通常どおり"],
  "audit-contractor": ["監査受託事業", "他社が銀行へ支払う監査費を受領。自己分は銀行"],
  "logistics-monopoly": ["物流独占契約", "指定地区で他社も契約者の路線を利用。封鎖優先"],
  "public-works-priority": ["公共事業優先契約", "投資前に指定した事業は自社のみ拠出。同事業連続不可"],
  "industrial-subsidy": ["産業活動奨励金", "翌R、建物数が自社より多い全他社の能力使用回数だけ銀行から資金"],
  "technology-royalty": ["技術使用料請求", "翌R、上位建物数が多い他社の合法上位1棟を稼働。費用は相手、産出は自社"],
  "transport-regulation": ["広域物流規制", "翌R、路線数が自社より多い全他社の全路線を封鎖"],
  "public-works-acquisition": ["公共事業権益買収", "翌R、累積拠出が多い他社の未完成枠1つを移転"],
};
export function nextProjects(): PublicProject[] {
  return candidateProjects().map(p=>({id:p.id,name:p.name,unlockLevel:p.unlockLevel,availableRound:999,
    slots:p.slots.map(s=>({resource:s.cost.cash ? "cash" : s.cost.materials ? "materials" : "goods",amount:s.cost.cash||s.cost.materials||s.cost.goods,playerId:null,cost:{...s.cost}}))}));
}
export function createMajorState(rng:GameRandomSource,auditor:boolean,enabled:boolean):MajorState {
  const cards=enabled?candidateAvailableInvestments(auditor):[];
  const permanentDeck=rng.shuffle(cards.filter(c=>c.type==="permanent").map(c=>c.id));
  const counterDeck=rng.shuffle(cards.filter(c=>c.type==="counter").map(c=>c.id));
  return {market:[permanentDeck.shift()??null,permanentDeck.shift()??null,counterDeck.shift()??null],permanentDeck,counterDeck,cards:[],blocked:[],extraUsed:[],queue:[],returnPhase:"PROCUREMENT"};
}
export function activeMajor(s:Pick<HubState,"next"|"round">,owner:string,id:string) {
  return s.next?.cards.find(c=>c.owner===owner&&c.id===id&&c.activeRound<=s.round&&c.status==="ACTIVE");
}
export function buildingMaximum(s:Pick<HubState,"next"|"round">,owner:string) {return activeMajor(s,owner,"business-expansion")?7:6;}
export function receiveAudit(s:HubState,payer:string,fee:number):void {
  const c=s.next?.cards.find(c=>c.id==="audit-contractor"&&c.status==="ACTIVE"&&c.activeRound<=s.round&&c.owner!==payer);
  if(c&&fee>0){companyOf(s,c.owner).resources.cash+=fee;addEvent(s,"AUDIT_RECEIVED",c.owner,{payer,amount:fee});}
}
export function buyMajor(s:HubState,p:string,a:Extract<MajorAction,{type:"BUY_MAJOR"}>):void {
  const n=s.next,c=CANDIDATE_INVESTMENTS.find(c=>c.id===a.cardId);
  if(!n||!s.config.majorInvestments||s.cityLevel<3||s.round>=s.finalRound||!c||!n.market.includes(c.id))throw Error("大型投資は購入できません");
  if(c.id==="industry-modernization"&&(!a.suit||!BUILDING_SUITS.includes(a.suit)))throw Error("産業系統を指定してください");
  if(c.id!=="industry-modernization"&&a.suit)throw Error("このカードに系統指定はありません");
  setResources(s,p,pay(companyOf(s,p).resources,{...NO_COST,cash:c.cost}));
  n.cards.push({id:c.id,owner:p,purchasedRound:s.round,activeRound:s.round+1,status:"PENDING",...(a.suit?{suit:a.suit}:{})});
  const slot=n.market.indexOf(c.id);n.market[slot]=(slot===2?n.counterDeck:n.permanentDeck).shift()??null;
  addEvent(s,"MAJOR_PURCHASED",p,{cardId:c.id,price:c.cost,activeRound:s.round+1,...(a.suit?{suit:a.suit}:{})});
}
export function majorBuyChoices(s:HubState,p:string):Extract<MajorAction,{type:"BUY_MAJOR"}>[] {
  if(!s.next||!s.config.majorInvestments||s.cityLevel<3||s.round>=s.finalRound)return[];
  return s.next.market.flatMap(id=>{const c=CANDIDATE_INVESTMENTS.find(c=>c.id===id);if(!c||companyOf(s,p).resources.cash<c.cost)return[];
    return c.id==="industry-modernization"?BUILDING_SUITS.map(suit=>({type:"BUY_MAJOR" as const,cardId:c.id,suit})):[{type:"BUY_MAJOR" as const,cardId:c.id}];});
}
function count(s:HubState,p:string,kind:"buildings"|"upper"|"routes"|"projects"):number {
  return kind==="buildings"?s.buildings.filter(b=>b.playerId===p).length:kind==="upper"?s.buildings.filter(b=>b.playerId===p&&b.upgraded).length:kind==="routes"?s.routes.filter(r=>r.playerId===p).length:s.publicProjects.reduce((n,x)=>n+x.slots.filter(t=>t.playerId===p).length,0);
}
function finishCard(s:HubState,c:MajorCard,fired:boolean):void {c.status=fired?"USED":"FIZZLED";c.firedRound=s.round;addEvent(s,fired?"MAJOR_FIRED":"MAJOR_FIZZLED",c.owner,{cardId:c.id});}
export function majorChoiceOptions(s:HubState):Extract<MajorAction,{type:"CHOOSE_MAJOR"}>[] {
  const n=s.next,c=n?.cards.find(c=>c.id===n.queue[0]);if(!c||s.phase!=="MAJOR_SELECTION")return[];
  const base={type:"CHOOSE_MAJOR" as const,cardId:c.id},p=c.owner;
  if(c.id==="business-expansion")return DISTRICTS.flatMap(d=>BUILDING_SUITS.flatMap(suit=>{try{assertCanBuild(s.buildings,p,d.id,suit,s.cityLevel,true,buildingMaximum(s,p));return[{...base,district:d.id,suit}];}catch{return[];}}));
  if(c.id==="logistics-monopoly")return s.routes.filter(r=>r.playerId===p&&!n!.cards.some(x=>x.id==="logistics-monopoly"&&x!==c&&x.district===r.district&&x.status==="ACTIVE")).map(r=>({...base,district:r.district}));
  if(c.id==="public-works-priority")return s.publicProjects.filter(x=>(x.availableRound??0)<=s.round&&!projectComplete(x)&&x.id!==c.previousProject).map(x=>({...base,projectId:x.id}));
  if(c.id==="public-works-acquisition")return s.publicProjects.filter(x=>!projectComplete(x)).flatMap(x=>x.slots.flatMap((t,slot)=>t.playerId&&t.playerId!==p&&count(s,t.playerId,"projects")>count(s,p,"projects")?[{...base,projectId:x.id,slot}]:[]));
  if(c.id==="technology-royalty")return s.buildings.filter(b=>b.upgraded&&b.playerId!==p&&count(s,b.playerId,"upper")>count(s,p,"upper")).flatMap(b=>accessOptions(s,b.playerId,b.district).flatMap(access=>[1,2].flatMap(amount=>{try{quoteBuildingUse({...s,phase:b.suit==="procurement"?"PROCUREMENT":"PRODUCTION"},b.playerId,b.id,amount,access,0,true);return[{...base,buildingId:b.id,amount,access}];}catch{return[];}})));
  return[];
}
function drainSelections(s:HubState):void {
  const n=s.next!;
  while(n.queue.length&&!majorChoiceOptions(s).length){const id=n.queue.shift()!;const c=n.cards.find(c=>c.id===id)!;
    if(CANDIDATE_INVESTMENTS.find(x=>x.id===c.id)!.type==="counter")finishCard(s,c,false);
    else {if(c.id==="business-expansion")c.freeBuilt=true;addEvent(s,"MAJOR_FIZZLED",c.owner,{cardId:c.id,round:s.round});}}
  if(!n.queue.length){s.phase=n.returnPhase;if(s.phase==="INVESTMENT")s.currentInvestmentPlayer=s.investmentStarter;}
}
export function beginMajorEconomy(s:HubState):void {
  if(!s.next){s.phase="PROCUREMENT";return;}
  const n=s.next;n.blocked=[];n.extraUsed=[];
  for(const c of n.cards){if(c.status==="PENDING"&&c.activeRound===s.round){c.status="ACTIVE";addEvent(s,"MAJOR_ACTIVATED",c.owner,{cardId:c.id});}}
  for(const c of n.cards.filter(c=>c.status==="ACTIVE"&&c.activeRound===s.round)){
    if(c.id==="transport-regulation"){n.blocked=s.players.filter(p=>p!==c.owner&&count(s,p,"routes")>count(s,c.owner,"routes"));addEvent(s,"ROUTES_BLOCKED",c.owner,{targets:n.blocked});finishCard(s,c,n.blocked.length>0);}
    if(c.id==="industrial-subsidy")c.targets=s.players.filter(p=>p!==c.owner&&count(s,p,"buildings")>count(s,c.owner,"buildings"));
  }
  n.queue=n.cards.filter(c=>c.status==="ACTIVE"&&((c.activeRound===s.round&&["technology-royalty","public-works-acquisition"].includes(c.id))||(c.id==="logistics-monopoly"&&!c.district&&c.activeRound<=s.round))).map(c=>c.id);
  n.returnPhase="PROCUREMENT";s.phase="MAJOR_SELECTION";drainSelections(s);
}
export function beginMajorInvestment(s:HubState):void {
  if(!s.next){s.phase="INVESTMENT";s.currentInvestmentPlayer=s.investmentStarter;return;}
  const n=s.next;
  for(const c of n.cards.filter(c=>c.id==="industrial-subsidy"&&c.status==="ACTIVE"&&c.activeRound===s.round)){
    const uses=(c.targets??[]).reduce((t,p)=>t+s.usage[p]!.buildings.length,0);companyOf(s,c.owner).resources.cash+=uses;
    addEvent(s,"SUBSIDY_RECEIVED",c.owner,{cardId:c.id,targets:c.targets,uses});finishCard(s,c,(c.targets??[]).length>0);
  }
  for(const c of n.cards.filter(c=>c.id==="public-works-priority"&&c.status==="ACTIVE")){if(c.project)c.previousProject=c.project;else delete c.previousProject;delete c.project;}
  n.queue=n.cards.filter(c=>c.status==="ACTIVE"&&((c.id==="business-expansion"&&!c.freeBuilt&&c.activeRound===s.round)||c.id==="public-works-priority")).map(c=>c.id);
  n.returnPhase="INVESTMENT";s.phase="MAJOR_SELECTION";drainSelections(s);
}
export function chooseMajor(s:HubState,p:string,a:Extract<MajorAction,{type:"CHOOSE_MAJOR"}>):void {
  const n=s.next!,c=n.cards.find(c=>c.id===n.queue[0]);
  if(!c||c.owner!==p||c.id!==a.cardId||!majorChoiceOptions(s).some(x=>JSON.stringify(x)===JSON.stringify(a)))throw Error("大型投資の合法な対象を選んでください");
  if(c.id==="business-expansion"){s.buildings.push({id: `building-${s.nextBuildingId++}`,playerId:p,district:a.district!,suit:a.suit!,upgraded:false});s.cityDevelopment+=2;s.roundDevelopment.buildings+=2;c.freeBuilt=true;}
  if(c.id==="logistics-monopoly")c.district=a.district!;
  if(c.id==="public-works-priority")c.project=a.projectId!;
  if(c.id==="public-works-acquisition"){s.publicProjects.find(x=>x.id===a.projectId)!.slots[a.slot!]!.playerId=p;finishCard(s,c,true);}
  if(c.id==="technology-royalty"){
    const b=s.buildings.find(b=>b.id===a.buildingId)!,target=b.playerId;
    const q=quoteBuildingUse({...s,phase:b.suit==="procurement"?"PROCUREMENT":"PRODUCTION"},target,b.id,a.amount!,a.access!,0,true);
    setResources(s,target,pay(companyOf(s,target).resources,q.cost));setResources(s,p,gain(companyOf(s,p).resources,q.reward));
    s.usage[target]!.buildings.push(b.id);s.transportCharges.push(q.transport);receiveAudit(s,target,q.auditFee);finishCard(s,c,true);
  }
  addEvent(s,"MAJOR_TARGET_SELECTED",p,{...a});n.queue.shift();drainSelections(s);
}
export function publicMajor(s:HubState) {return s.next?{market:s.next.market,cards:s.next.cards,blocked:s.next.blocked,extraUsed:s.next.extraUsed,queue:s.next.queue,returnPhase:s.next.returnPhase}:null;}
