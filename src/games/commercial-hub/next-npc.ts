import { nextOperatingEstimate, privatePlotOperatingGain } from "./next-economy";
import { freePaymentOptions } from "./flexible-payment";
import { BUILDING_SUITS } from "./types";
import { majorPrice } from "./next-rules";
import { majorV4 } from "./trial-features";
import { districtOf } from "./data";
import type { HubNpcType } from "../../shared/commercial-hub-npc";
import type { HubView } from "./view";
import type { NpcDecision } from "./npc";
import type { HubClientAction } from "./state";
import { CANDIDATE_INVESTMENTS } from "./next-data";
export function majorNpcPurchases(v:HubView,type:HubNpcType) {
  const p=v.playerId,own=v.buildings.filter(b=>b.playerId===p),others=v.buildings.filter(b=>b.playerId!==p);
  const rounds=v.finalRound-v.round,resources=v.companies.find(c=>c.playerId===p)!.resources;
  return v.majorBuys.map(a=>{
    const price=majorPrice(v,a.cardId),cashPaid=a.freePayment?price-Object.values(a.freePayment).reduce((n,x)=>n+x,0)+a.freePayment.cash:price;
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
    if(majorV4(v)){if(a.cardId==="business-expansion") {
      benefit=0;
      if(rounds>1 && own.length<7 && !own.some(b=>b.district==="PRIVATE")) {
        const postBuy={cash:Math.max(0,resources.cash-cashPaid+v.ownBalance.net),materials:resources.materials-(a.freePayment?.materials??0),goods:resources.goods-(a.freePayment?.goods??0)};
        const funded=nextOperatingEstimate(v,postBuy,v.buildings).resources;
        for(const payment of freePaymentOptions(2)) {
          const postBuild={cash:funded.cash-3-payment.cash,materials:funded.materials-payment.materials,goods:funded.goods-payment.goods};
          if(Object.values(postBuild).some(x=>x<0))continue;
          for(const suit of BUILDING_SUITS)if(own.filter(b=>b.suit===suit).length<3) {
            const gain=privatePlotOperatingGain(v,suit,postBuild);
            // Buy now, construct in the next investment phase, operate one R later.
            // Include construction and its investment action; acquisition price
            // and settlement reserve are charged by the common score below.
            benefit=Math.max(benefit,3*2.4-5*.7-1.5+gain*Math.min(rounds-1,5)*.75);
          }
        }
      }
    }if(a.cardId==="audit-contractor")benefit+=own.length*.3*Math.min(rounds,6);if(a.cardId==="logistics-monopoly")benefit=Math.max(0,...v.routes.filter(r=>r.playerId===p).map(r=>others.filter(b=>b.district!=="PRIVATE"&&(districtOf(b.district).suit??"administration")===(districtOf(r.district).suit??"administration")).length))*Math.min(rounds,6)*1.5;if(a.cardId==="public-works-priority")benefit+=Math.min(rounds,4);}
    let score=benefit*affinity-price*.75-(a.freePayment?.materials??0)*.2-(a.freePayment?.goods??0)*.3-Math.max(0,3-resources.cash+cashPaid-v.ownBalance.net)*2;
    if(v.rulesVersion==="1.0") {
      const afterSettlement=resources.cash-cashPaid+v.ownBalance.net;
      const postResources={cash:Math.max(0,afterSettlement),materials:resources.materials-(a.freePayment?.materials??0),goods:resources.goods-(a.freePayment?.goods??0)};
      const nextCycle=nextOperatingEstimate(v,postResources,v.buildings);
      const normalCycle=nextOperatingEstimate(v,{...resources,cash:Math.max(0,resources.cash+v.ownBalance.net)},v.buildings);
      const lostIncome=Math.max(0,normalCycle.cashGenerated-nextCycle.cashGenerated);
      const hasCycle=own.some(b=>b.suit==="industry")&&own.some(b=>b.suit==="commerce");
      // Buying a promising card is not worth disabling procurement, production and sales.
      score-=lostIncome*1.6;
      if(own.length>=2&&afterSettlement<2)score-=(2-afterSettlement)*(hasCycle?4:3);
      if(own.length>=2&&nextCycle.resources.cash<2)score-=3;
      if(own.length<3&&rounds>3)score-=4;
      if(a.cardId==="industry-modernization") {
        if(a.suit==="industry"&&nextCycle.produced===0||a.suit==="commerce"&&nextCycle.sold===0||a.suit==="procurement"&&nextCycle.procured===0)score-=Math.min(rounds,5)*1.8;
      }
      if(a.cardId==="advanced-equipment"&&!own.some(b=>b.upgraded))score-=6;
      if(a.cardId==="public-works-acquisition") {
        const ours=v.publicProjects.reduce((n,x)=>n+x.slots.filter(t=>t.playerId===p).length,0);
        const eligible=v.publicProjects.filter(project=>project.slots.some(t=>t.playerId&&t.playerId!==p&&v.publicProjects.reduce((n,y)=>n+y.slots.filter(z=>z.playerId===t.playerId).length,0)>ours));
        const remainingSlots=Math.max(0,...eligible.map(x=>x.slots.filter(t=>!t.playerId).length));
        // The target must remain incomplete until activation next round.
        if(!remainingSlots)score-=10;
        else if(remainingSlots===1)score-=7;
        else if(remainingSlots===2)score-=4;
      }
      if(a.cardId==="technology-royalty") {
        const targets=others.filter(b=>b.upgraded).filter(b=>others.filter(x=>x.playerId===b.playerId&&x.upgraded).length>own.filter(x=>x.upgraded).length);
        if(!targets.length)score-=10;
        else if(!targets.some(b=>{const c=v.companies.find(x=>x.playerId===b.playerId)!;return c.resources.cash>=0&&(b.suit!=="industry"||c.resources.materials>0)&&(b.suit!=="commerce"||c.resources.goods>0);}))score-=5;
      }
      if(a.cardId==="logistics-monopoly"&&afterSettlement<=2)score-=4;
      // Single-use benefits should have a credible target on their one activation.
      if(rounds<=1&&["public-works-acquisition","technology-royalty","industrial-subsidy"].includes(a.cardId))score-=2;
    }
    return {action:a as HubClientAction,score,reasons:[`公開状態による期待利益${benefit.toFixed(2)}、価格${price}、残り${rounds}R、型係数${affinity}`,v.rulesVersion==="1.0"?"購入後の運転資金と翌Rの実効対象を確認":benefit===0?"合法対象・稼働見込みなし":"資金余裕と対象への影響を比較"]};
  });
}
export function majorNpcSelection(v:HubView,type:HubNpcType):NpcDecision|null {
  if(!v.majorChoices.length)return null;
  const alternatives=v.majorChoices.map(a=>{
    let score=0;
    if(a.suit){const n=v.buildings.filter(b=>b.playerId===v.playerId&&b.suit===a.suit).length;score=6-n*2+(type==="production"&&a.suit==="industry"||type==="commerce"&&a.suit==="commerce"?2:0);}
    if(a.targetSuit)score+=v.buildings.filter(b=>b.playerId!==v.playerId&&b.district!=="PRIVATE"&&(districtOf(b.district).suit??"administration")===a.targetSuit).length*2;
    if(a.district)score+=v.buildings.filter(b=>b.district===a.district&&b.playerId!==v.playerId).length+(v.routes.some(r=>r.playerId===v.playerId&&r.district===a.district)?1:0);
    if(a.projectId){const project=v.publicProjects.find(p=>p.id===a.projectId)!;score+=project.slots.filter(t=>t.playerId).length*2+project.slots.filter(t=>t.playerId===v.playerId).length;}
    if(a.buildingId){const b=v.buildings.find(b=>b.id===a.buildingId)!;score+=b.suit==="commerce"?(a.amount??1)*3:b.suit==="industry"?4:3;score+=(a.access==="PUBLIC"?2:a.access==="OWN"?0:1)*.3;}
    return {action:a as HubClientAction,score,reasons:["専用選択段階の合法候補を公開情報・資源産出・完成見込みで比較"]};
  }).sort((a,b)=>b.score-a.score);
  return {...alternatives[0]!,logicVersion:"next-trial-1",alternatives};
}


