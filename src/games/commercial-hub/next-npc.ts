import type { HubNpcType } from "../../shared/commercial-hub-npc";
import type { HubView } from "./view";
import type { NpcDecision } from "./npc";
import type { HubClientAction } from "./state";
import { CANDIDATE_INVESTMENTS } from "./next-data";
export function majorNpcPurchases(v:HubView,type:HubNpcType) {
  const p=v.playerId,own=v.buildings.filter(b=>b.playerId===p),others=v.buildings.filter(b=>b.playerId!==p);
  const rounds=v.finalRound-v.round,resources=v.companies.find(c=>c.playerId===p)!.resources;
  return v.majorBuys.map(a=>{
    const price=CANDIDATE_INVESTMENTS.find(c=>c.id===a.cardId)!.cost;
    let benefit=0;const moreBuildings=v.players.filter(x=>x!==p&&others.filter(b=>b.playerId===x).length>own.length);
    if(a.cardId==="business-expansion")benefit=(own.length<7?3+Math.min(rounds,5)*2:0)+(own.length>=5?3:0);
    if(a.cardId==="industry-modernization")benefit=own.filter(b=>b.suit===a.suit).length*Math.min(rounds,6)*(a.suit==="commerce"?1:1.5);
    if(a.cardId==="advanced-equipment")benefit=own.some(b=>b.upgraded)?Math.min(rounds,5)*2.8:0;
    if(a.cardId==="audit-contractor")benefit=others.length*.18*Math.min(rounds,6);
    if(a.cardId==="logistics-monopoly")benefit=Math.max(0,...v.routes.filter(r=>r.playerId===p).map(r=>others.filter(b=>b.district===r.district).length))*Math.min(rounds,6)*1.5;
    if(a.cardId==="public-works-priority")benefit=v.publicProjects.some(x=>x.slots.filter(t=>t.playerId===p).length>=2)?Math.min(rounds,4)*2:0;
    if(a.cardId==="industrial-subsidy")benefit=others.filter(b=>moreBuildings.includes(b.playerId)).length*1.5;
    if(a.cardId==="technology-royalty")benefit=others.some(b=>b.upgraded&&others.filter(x=>x.playerId===b.playerId&&x.upgraded).length>own.filter(x=>x.upgraded).length)?6:0;
    if(a.cardId==="transport-regulation"){const ownRoutes=v.routes.filter(r=>r.playerId===p).length;benefit=v.players.filter(x=>x!==p&&v.routes.filter(r=>r.playerId===x).length>ownRoutes).length*2.5;}
    if(a.cardId==="public-works-acquisition"){const ours=v.publicProjects.reduce((n,x)=>n+x.slots.filter(t=>t.playerId===p).length,0);benefit=v.publicProjects.some(x=>x.slots.some(t=>t.playerId&&t.playerId!==p&&v.publicProjects.reduce((n,y)=>n+y.slots.filter(z=>z.playerId===t.playerId).length,0)>ours)&&x.slots.some(t=>!t.playerId))?6.5:0;}
    const affinity=type==="development"&&/public|logistics/.test(a.cardId)?1.2:type==="production"&&/industry|equipment/.test(a.cardId)?1.2:type==="commerce"&&a.suit==="commerce"?1.2:1;
    const score=benefit*affinity-price*.75-Math.max(0,3-resources.cash+price-v.ownBalance.net)*2;
    return {action:a as HubClientAction,score,reasons:[`公開状態による期待利益${benefit.toFixed(2)}、価格${price}、残り${rounds}R、型係数${affinity}`,benefit===0?"合法対象・稼働見込みなし":"資金余裕と対象への影響を比較"]};
  });
}
export function majorNpcSelection(v:HubView,type:HubNpcType):NpcDecision|null {
  if(!v.majorChoices.length)return null;
  const alternatives=v.majorChoices.map(a=>{
    let score=0;
    if(a.suit){const n=v.buildings.filter(b=>b.playerId===v.playerId&&b.suit===a.suit).length;score=6-n*2+(type==="production"&&a.suit==="industry"||type==="commerce"&&a.suit==="commerce"?2:0);}
    if(a.district)score+=v.buildings.filter(b=>b.district===a.district&&b.playerId!==v.playerId).length+(v.routes.some(r=>r.playerId===v.playerId&&r.district===a.district)?1:0);
    if(a.projectId){const project=v.publicProjects.find(p=>p.id===a.projectId)!;score+=project.slots.filter(t=>t.playerId).length*2+project.slots.filter(t=>t.playerId===v.playerId).length;}
    if(a.buildingId){const b=v.buildings.find(b=>b.id===a.buildingId)!;score+=b.suit==="commerce"?(a.amount??1)*3:b.suit==="industry"?4:3;score+=(a.access==="PUBLIC"?2:a.access==="OWN"?0:1)*.3;}
    return {action:a as HubClientAction,score,reasons:["専用選択段階の合法候補を公開情報・資源産出・完成見込みで比較"]};
  }).sort((a,b)=>b.score-a.score);
  return {...alternatives[0]!,logicVersion:"next-trial-1",alternatives};
}
