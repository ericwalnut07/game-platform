// Frozen external Windows prototype (stdCash + productionSales), verified against 8c07a22.
// Comparison fixture only. Production decisions use the restricted HubView in npc.ts.
const {createHubState,reduceHubState,quoteMarket}=require('../../dist-smoke/games/commercial-hub/engine.js');
const {legalCards,compareCards,clockwisePlayer}=require('../../dist-smoke/games/commercial-hub/cards.js');
const {legalInvestments}=require('../../dist-smoke/games/commercial-hub/investment.js');
const {buildingUseOptions}=require('../../dist-smoke/games/commercial-hub/income.js');
const {openingReward}=require('../../dist-smoke/games/commercial-hub/opportunities.js');
const types=['standard','production','commerce','development'];
const variant='stdCash';
function random(seed){let n=seed>>>0;const next=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296};return {next,integer:(a,b)=>a+Math.floor(next()*(b-a+1)),shuffle:a=>{const b=[...a];for(let i=b.length-1;i>0;i--){let j=Math.floor(next()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}}}
const profiles={standard:{commerce:1,industry:1,procurement:1,route:1,project:1},production:{commerce:0.95,industry:1.35,procurement:1,route:0.85,project:0.9},commerce:{commerce:1.35,industry:0.9,procurement:1,route:0.85,project:0.9},development:{commerce:0.85,industry:0.85,procurement:1.25,route:1.5,project:1.5}};
function company(s,p){return s.companies.find(c=>c.playerId===p).resources}
function focus(s,p,t){let r=company(s,p), bs=s.buildings.filter(b=>b.playerId===p),f=profiles[t];let industry=bs.filter(b=>b.suit==='industry').length, commerce=bs.filter(b=>b.suit==='commerce').length;return {cash:(t==='standard'&&['stdCash','stdBoth'].includes(variant)?(r.cash<4?2.7:r.cash<8?1.65:1):(r.cash<4?2.1:1))*(r.cash<0?2:1),materials:r.materials===0?2.1:1,goods:commerce>0&&r.goods<2?1.8:industry>commerce?1.3:0.75,production:f.industry,commerce:f.commerce,route:f.route,project:f.project,needIndustry:industry===0?1.7:1,needCommerce:commerce===0&&industry>0?1.7:1}}
function resourceScore(r,f){return (r.cash||0)*f.cash+(r.materials||0)*f.materials+(r.goods||0)*f.goods}
function opportunityScore(s,p,o,rank,t){const f=focus(s,p,t),r=company(s,p);if(o.id==='opening')return resourceScore(openingReward(o.suit,rank),f);if(o.id==='special-materials')return [2,1,1,0][rank-1]*f.materials;if(rank>2)return 0;const m=rank===1?1:0.52;switch(o.id){case 'sales':return Math.min(r.goods,rank===1?2:1)*3*f.cash;case 'promotion':return s.buildings.filter(b=>b.playerId===p&&b.suit==='commerce').length*(rank===1?2:1)*f.cash;case 'processing':return r.materials>0?(rank===1?3:2)*f.goods-f.materials:0;case 'expansion':return s.buildings.filter(b=>b.playerId===p&&b.suit==='industry').length*(rank===1?2:1)*f.goods;case 'purchase':return r.cash>=(rank===1?1:2)?f.materials-(rank===1?1:2)*f.cash:0;case 'bulk':return r.cash>5?(rank===1?2:1)*Math.max(0,f.materials*1.5-2*f.cash):0;case 'development':return (rank===1?2:1)*f.cash*1.1;case 'public-project':return s.publicProjects.some(x=>x.slots.some(z=>!z.playerId))?(rank===1?4:1.5)*f.project:0;default:return 0}}
function card(s,p,t,rng){let o=s.opportunities[s.trickIndex],hand=s.playerHands[p],lead=s.playedCards[0]?.card.suit??null,legal=legalCards(hand,lead);const reward=(c)=>{let cards=[...s.playedCards,{playerId:p,card:c}],l=cards[0].card.suit;let rank=1+cards.filter(x=>x.playerId!==p&&compareCards(x.card,c,l,o.trump)>0).length;if(s.cityCondition.id==='credit-crunch')rank=5-rank;let v=opportunityScore(s,p,o,rank,t);const left=4-cards.length;if(left&&rank<=2)v*=Math.pow(0.75,left);return v};return [...legal].sort((a,b)=>{let score=c=>{let now=reward(c),future=0;for(let i=s.trickIndex+1;i<s.opportunities.length;i++){let x=s.opportunities[i],v=opportunityScore(s,p,x,1,t);let fit=x.trump===c.suit?1.3:x.trump===null?0.7:0.45;future=Math.max(future,v*fit*(c.rank/8)*Math.pow(0.77,i-s.trickIndex))}return now-future+(8-c.rank)*0.04};return score(b)-score(a)||a.rank-b.rank})[0]}

const desired={standard:{industry:1,commerce:1,procurement:1},production:{industry:2,commerce:1,procurement:1},commerce:{industry:1,commerce:2,procurement:1},development:{industry:1,commerce:1,procurement:2}};
function needs(s,p,t){let own=s.buildings.filter(b=>b.playerId===p),r=company(s,p);let counts={industry:0,commerce:0,procurement:0};for(let b of own)counts[b.suit]++;let order=Object.keys(counts).sort((a,b)=>{let x=desired[t][a]-counts[a],y=desired[t][b]-counts[b];if(t==='standard'&&counts.industry===0&&r.goods<2){if(a==='industry')x+=1;if(b==='industry')y+=1}if(t==='commerce'&&counts.commerce===0){if(a==='commerce')x+=1;if(b==='commerce')y+=1}if(t==='development'&&counts.procurement===0){if(a==='procurement')x+=1;if(b==='procurement')y+=1}return y-x});return {own,counts,order,desired:desired[t]}}
function projected(s,p){let r=company(s,p),bs=s.buildings.filter(b=>b.playerId===p&&!s.usage[p].buildings.includes(b.id));let ind=bs.filter(b=>b.suit==='industry').length,com=bs.filter(b=>b.suit==='commerce').reduce((a,b)=>a+(b.upgraded?2:1),0);let prod=Math.min(ind,r.materials)*2;return {prod,sell:com}}
function projectProduct(s,p,t){let open=s.publicProjects.filter(q=>q.slots.some(x=>!x.playerId)),available=open.flatMap(q=>q.slots).filter(x=>x.playerId===null&&x.resource==='goods').length,slots=2;return Math.min(available,t==='development'?2:1,slots)}
function transportReserve(s,p){const b=s.transportCharges.filter(q=>q.payer===p).reduce((a,q)=>a+q.amount,0);const income=s.transportCharges.filter(q=>q.payee===p).reduce((a,q)=>a+q.amount,0);return Math.max(0,b-income)+1}
function buildingPriority(s,p,t,suit){const n=needs(s,p,t),count=n.counts[suit],total=n.own.length;let priority=total===0?15:total===1?14:total===2?13:total===3?10:total===4?-4:-10;if(['standardPlan','both'].includes(variant)&&t==='standard'&&total<4)priority+=total<2?2.5:3;if(['productionSales','stdCommerce','stdCash','stdBoth'].includes(variant)&&t==='production'&&suit==='commerce'&&company(s,p).goods>=2)priority+=5;if(t==='standard'&&['stdCommerce','stdBoth'].includes(variant)&&suit==='commerce'&&count<2&&total>=1&&s.round<8)priority+=4;let missing=n.desired[suit]-count;priority+=Math.max(-3,missing*3);if(suit==='industry'&&n.counts.industry===0&&company(s,p).goods<2)priority+=2;if(suit==='commerce'&&n.counts.commerce===0&&n.counts.industry>0)priority+=2;if(suit==='procurement'&&s.round<3)priority-=3;return priority}

function invest(s,p,t){let r=company(s,p),n=needs(s,p,t),quotes=legalInvestments(s,p),remaining=s.finalRound-s.round,debts=transportReserve(s,p),f=profiles[t];
const score=q=>{let a=q.action,cost=q.cost.cash+1.3*q.cost.materials+(q.transport?.amount||0),cashRemaining=r.cash-q.cost.cash,net=cashRemaining-debts-(q.transport?.amount||0),sc= -cost*0.7-Math.max(0,-net)*5;
 if(a.type==='BUILD'){let suit=a.suit;sc+=buildingPriority(s,p,t,suit)*(0.75+0.25*Math.min(3,remaining));if(suit==='industry'&&r.materials<=1&&n.counts.industry>=1)sc-=3;if(suit==='commerce'&&n.counts.industry===0&&r.goods<2)sc-=4;if(suit==='procurement'&&remaining<=2)sc-=3;if(n.own.length>=4)sc-=6;if(q.transport?.amount)sc-=q.transport.amount*1.4;}
 if(a.type==='UPGRADE'){let b=n.own.find(x=>x.id===a.buildingId);sc+=2.5+(b.suit==='commerce'&&r.goods>=2?2:0)+(b.suit==='industry'&&r.materials>=2?2:0)+Math.min(remaining,3)*(b.suit==='procurement'?0.5:0.8)*f[b.suit];if(n.own.length<3&&remaining>2)sc-=4;}
 if(a.type==='ROUTE'){let local=n.own.filter(b=>b.district===a.district).length;sc+=(1.7+local*Math.min(remaining,4)*1.6)*f.route;if(n.own.length<2)sc-=6;if(['standardPlan','both'].includes(variant)&&t==='standard'&&n.own.length<4&&r.cash-q.cost.cash<6)sc-=5;}
 if(a.type==='CONTRIBUTE'){let proj=s.publicProjects.find(x=>x.id===a.projectId),filled=proj.slots.filter(x=>x.playerId).length,ours=proj.slots.filter(x=>x.playerId===p).length;sc+=(2.4+filled*1.2+ours*0.4+(a.benefit==='FREE'?3:0))*f.project;if(n.own.length<2&&filled<4)sc-=5;if(['standardPlan','both'].includes(variant)&&t==='standard'&&n.own.length<4&&q.cost.cash>0&&r.cash-q.cost.cash<6)sc-=5;if(a.benefit==='FREE')sc+=2;}
 if(remaining===0&&a.type==='BUILD')sc+=3;
 return sc};
quotes.sort((a,b)=>score(b)-score(a));let best=quotes[0];return best&&score(best)>1?best.action:{type:'PASS_INVESTMENT'}}

function production(s,p,t){let options=buildingUseOptions(s,p),r=company(s,p),f=focus(s,p,t);let value=q=>{let score=resourceScore(q.reward,f)-resourceScore(q.cost,f)-q.transport.amount*(r.cash<2?2.4:1);if(q.reward.goods>0&&r.goods>5)score-=3;if(['productionSales','stdCommerce','stdCash','stdBoth'].includes(variant)&&t==='production'&&q.reward.cash>0&&r.goods>=2)score+=4;if(['stdCash','stdBoth'].includes(variant)&&t==='standard'){if(q.reward.cash>0&&r.cash<7)score+=3;if(q.reward.goods>0&&r.goods>=3)score-=2}if(q.reward.cash>0&&r.goods<=1&&s.buildings.some(b=>b.playerId===p&&b.suit==='industry'&&!s.usage[p].buildings.includes(b.id)))score-=1.8;return score};options.sort((a,b)=>value(b)-value(a));let q=options[0];return q&&value(q)>0?{type:'USE_BUILDING',buildingId:q.buildingId,amount:q.amount,access:q.access}:{type:'PRODUCTION_DONE'}}


function tradeSuggestion(s,p,t){
 const r=company(s,p),n=needs(s,p,t);if(s.usage[p].proposed)return null;
 const target=(n.own.length<4?1:0)+(n.counts.industry>0?1:0);
 for(const other of s.players){
  if(other===p)continue;const x=company(s,other);
  if(['standardPlan','both'].includes(variant)&&t==='standard'&&r.cash<6&&r.goods>=2&&x.cash>=5&&x.goods<2)return {type:'OFFER_TRADE',counterpart:other,terms:{give:{cash:0,materials:0,goods:1},receive:{cash:2,materials:0,goods:0}}};
  if(r.materials<target&&x.materials>=2&&r.cash>=4&&x.cash<=8)
    return {type:'OFFER_TRADE',counterpart:other,terms:{give:{cash:2,materials:0,goods:0},receive:{cash:0,materials:1,goods:0}}};
  if(r.goods>=3&&r.materials<target&&x.materials>=2)
    return {type:'OFFER_TRADE',counterpart:other,terms:{give:{cash:0,materials:0,goods:1},receive:{cash:0,materials:1,goods:0}}};
  if(r.materials>=3&&r.cash<4&&x.cash>=4)
    return {type:'OFFER_TRADE',counterpart:other,terms:{give:{cash:0,materials:1,goods:0},receive:{cash:2,materials:0,goods:0}}};
 }
 return null;
}
function acceptTrade(s,p,n,t){let r=company(s,p),f=focus(s,p,t),incoming=n.give,outgoing=n.receive;let v=resourceScore(incoming,f)-resourceScore(outgoing,f);let b=needs(s,p,t);if(r.materials-outgoing.materials<1&&b.own.length<4)v-=2;if(r.goods-outgoing.goods<projectProduct(s,p,t)&&t==='development')v-=2;if(r.cash-outgoing.cash<transportReserve(s,p))v-=3;return v>=0.3}
function procurement(s,p,t){let r=company(s,p),u=s.usage[p],n=needs(s,p,t);let incoming=s.negotiations.find(x=>x.status==='PENDING'&&x.counterpart===p);if(incoming)return {type:'ANSWER_TRADE',negotiationId:incoming.id,accept:acceptTrade(s,p,incoming,t)};
 let futureBuild=n.own.length<4?1:0,productionNeed=n.counts.industry>0?1:0,routeNeed=t==='development'&&n.own.length>0?1:0,target=Math.min(3,futureBuild+productionNeed+routeNeed+(['materials','combined'].includes(variant)&&['standard','production'].includes(t)?1:0));let projected=projectedGoods(s,p),projectNeed=projectProduct(s,p,t);
 // Dispose only goods beyond planned sales, project slots and a small next-round reserve. Production replenishment is counted conservatively.
 if(s.specialBoomPlayed&&u.disposals<2&&r.goods>0){let keep=Math.max(0,projected.sell+projectNeed+(t==='development'?1:0));let over=Math.min(r.goods,Math.max(0,r.goods+projected.prod-keep));if(over>0&&(r.cash<8||r.goods>5))return {type:'MARKET',action:'dispose-good'}}
 // Prefer market purchases when capital and expected investment expenses remain funded.
 if(u.purchases<2&&r.materials<target){let discount=s.buildings.some(b=>b.playerId===p&&b.suit==='procurement'&&(u.discounts[b.id]||0)<(b.upgraded?2:1))?1:0,cost=3-discount,capital=4,unsettled=transportReserve(s,p);
 if(r.cash>=cost&&((r.cash-cost>=capital+unsettled-(['materials','combined'].includes(variant)&&['standard','production'].includes(t)&&n.own.length<3?2:0))||(r.materials===0&&r.cash-cost>=2&&n.own.length<3)))return {type:'MARKET',action:'buy-material'}}
 if(!u.proposed){let offer=tradeSuggestion(s,p,t);if(offer)return offer}
 return {type:'PROCUREMENT_DONE'}}
function projectedGoods(s,p){return projected(s,p)}

function choose(s,p,t,rng){if(s.phase==='ROUND_START')return {type:'ROUND_READY'};if(s.phase==='ROUND_END')return {type:'ROUND_END_READY'};if(s.phase==='TRICK')return {type:'PLAY_CARD',card:card(s,p,t,rng)};
if(s.phase==='REWARD'){let q=s.rewardChoices[0],r=company(s,p),f=focus(s,p,t);let n=q.kind==='PURCHASE'?(r.cash>=q.cash&&r.materials<3?1:0):q.kind==='PROCESS'?(r.materials>1||f.goods*q.goods>f.materials?1:0):q.maximum;return {type:'CLAIM_REWARD',amount:n}}
if(s.phase==='PROCUREMENT')return procurement(s,p,t);
if(s.phase==='PRODUCTION')return production(s,p,t);
if(s.phase==='INVESTMENT')return invest(s,p,t);return null}


module.exports={choose};
