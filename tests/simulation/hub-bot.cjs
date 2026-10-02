// Test-only playtest policy: consumes the same private view as a human, never server hands.
function chooseInvestment(view) {
  const p = view.playerId, own = view.buildings.filter(b => b.playerId === p), cash = view.companies.find(c => c.playerId === p).resources.cash;
  const seat = view.players.indexOf(p), favored = seat % 2 === 0 ? 'industry' : 'commerce';
  const ranked = view.investments.map(q => {
    const a = q.action; let score = 0;
    if (a.type === 'BUILD') {
      score = own.length === 0 ? 100 : own.length < 2 ? 40 : 4;
      if (a.suit === favored && own.length === 0) score += 15;
      if (!own.some(b => b.suit === a.suit)) score += a.suit === 'procurement' ? 5 : 12;
      if (a.district === 'REDEVELOPMENT' || a.district === 'NEW_TOWN') score -= 2;
      score -= q.cost.cash * 0.2;
    }
    if (a.type === 'ROUTE') score = own.some(b => b.district === a.district) ? 80 : 8;
    if (a.type === 'UPGRADE') score = own.length >= 2 ? 35 : 25;
    if (a.type === 'CONTRIBUTE') {
      const project = view.publicProjects.find(p => p.id === a.projectId), count = project.slots.filter(s => s.playerId).length;
      score = 18 + count * 5 + (a.benefit === 'FREE' ? 30 : a.benefit === 'REBATE' ? 8 : 0);
      if (q.cost.materials && own.some(b => b.suit === 'industry') && view.companies.find(c => c.playerId === p).resources.materials < 2) score -= 20;
    }
    if (q.transport) score -= q.transport.amount * 2;
    return { q, score };
  }).sort((a,b) => b.score-a.score);
  return ranked[0]?.q.action ?? { type:'PASS_INVESTMENT' };
}
function chooseAction(view) {
  const p = view.playerId, r = view.companies.find(c => c.playerId === p).resources;
  if (view.phase === 'ROUND_START' && !view.roundReady.includes(p)) return {type:'ROUND_READY'};
  if (view.phase === 'ROUND_END' && !view.roundReady.includes(p)) return {type:'ROUND_END_READY'};
  if (view.phase === 'TRICK' && view.currentPlayer === p) return {type:'PLAY_CARD',card:[...view.legalCards].sort((a,b)=>b.rank-a.rank)[0]};
  if (view.phase === 'REWARD' && view.rewardChoice) return {type:'CLAIM_REWARD',amount:view.rewardChoice.maximum};
  if (view.phase === 'PROCUREMENT' && !view.procurementDone.includes(p)) {
    if (view.marketChoices.some(q=>q.action==='dispose-good') && r.goods > 0) return {type:'MARKET',action:'dispose-good'};
    const industrial = view.buildings.filter(b=>b.playerId===p&&b.suit==='industry').length;
    if (view.marketChoices.some(q=>q.action==='buy-material') && r.materials < Math.max(2,industrial+1) && r.cash >= (view.round===1?8:3)) return {type:'MARKET',action:'buy-material'};
    if (view.marketChoices.some(q=>q.action==='bulk-material') && r.materials < industrial+1) return {type:'MARKET',action:'bulk-material'};
    return {type:'PROCUREMENT_DONE'};
  }
  if (view.phase === 'PRODUCTION' && !view.productionDone.includes(p)) {
    const q=[...view.buildingOptions].sort((a,b)=>b.reward.goods-a.reward.goods || b.amount-a.amount || a.transport.amount-b.transport.amount)[0];
    return q ? {type:'USE_BUILDING',buildingId:q.buildingId,amount:q.amount,access:q.access} : {type:'PRODUCTION_DONE'};
  }
  if (view.phase === 'INVESTMENT' && view.currentPlayer===p) return chooseInvestment(view);
  return null;
}
function proposeTrade(view) {
  if(view.phase!=='PROCUREMENT'||view.usage.proposed||view.procurementDone.includes(view.playerId))return null;
  const r=view.companies.find(c=>c.playerId===view.playerId).resources;
  for(const other of view.companies.filter(c=>c.playerId!==view.playerId)) {
    if(r.goods>=1 && other.resources.cash>=1) return {type:'OFFER_TRADE',counterpart:other.playerId,terms:{give:{goods:1,materials:0,cash:0},receive:{goods:0,materials:0,cash:1}}};
    if(r.materials>=1 && other.resources.cash>=1) return {type:'OFFER_TRADE',counterpart:other.playerId,terms:{give:{goods:0,materials:1,cash:0},receive:{goods:0,materials:0,cash:1}}};
  }
  return null;
}
module.exports={chooseAction,chooseInvestment,proposeTrade};
