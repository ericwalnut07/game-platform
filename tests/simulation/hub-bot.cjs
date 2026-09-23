// Test-only policy. It consumes the same private Player View as a human client.
function chooseIncome(view) {
  const r = { ...view.companies.find(c => c.playerId === view.playerId).resources };
  const selections = {};
  let boost = view.credits[view.playerId].productionBoost;
  for (const task of view.incomeTasks) {
    let n = 0;
    if (task.kind === 'production' && r.materials > 1) {
      n = 1; r.materials--;
      const building = view.buildings.find(b => b.id === task.buildingId);
      r.goods += building.upgraded ? 3 : 2; if (building.upgraded) r.cash++;
      if (boost > 0) { r.goods++; boost--; }
    } else if (task.kind === 'sale' || task.kind === 'business') {
      n = Math.min(task.maximum, r.goods); r.goods -= n; r.cash += n * (task.kind === 'business' ? 3 : 2);
    } else if (task.kind === 'civic') { n = 1; r.influence++; }
    selections[task.id] = n;
  }
  return selections;
}
function chooseInvestment(view) {
  const own = view.buildings.filter(b => b.playerId === view.playerId);
  const seat = view.players.indexOf(view.playerId);
  const suits = ['commerce', 'industry', 'logistics', 'civic'];
  const matching = { MARKET: 'commerce', WORKSHOP: 'industry', WAREHOUSE: 'logistics', GOV: 'civic', BUSINESS: 'commerce', INDUSTRIAL: 'industry', PORT: 'logistics', NEW_TOWN: 'civic' };
  const ranked = view.investments.map((q, i) => {
    const a = q.action;
    let priority = 0;
    if (a.type === 'BUILD') priority = 28 + (matching[a.district] === a.suit ? 4 : 0) + (a.suit === suits[seat] ? 5 : 0) + (!own.some(b => b.suit === 'civic') && a.suit === 'civic' ? 8 : 0);
    if (a.type === 'UPGRADE') priority = 22 + (own.length >= 3 ? 10 : 0);
    if (a.type === 'ROUTE') priority = 20 + (Object.values(view.routeOwnership).includes(view.playerId) ? 0 : 14) + (q.cost.cash + q.cost.materials === 0 ? 8 : 0);
    if (a.type === 'CONTRIBUTE') priority = 26 + (view.activePublicProject.slots.filter(s => s.playerId).length >= 3 ? 14 : 0);
    // Use a connected rival's network when the total payable cost is the same.
    if (q.transport?.owner) priority += 1;
    priority -= q.cost.cash * .15 + q.cost.materials * .1;
    return { a, priority, i };
  }).sort((a,b) => b.priority - a.priority || a.i - b.i);
  return ranked[0]?.a ?? { type: 'PASS_INVESTMENT' };
}
function proposeTrade(view) {
  const actor = view.investmentTurn.playerId;
  const ours = view.companies.find(c => c.playerId === actor).resources;
  for (const other of view.companies.filter(c => c.playerId !== actor)) {
    for (const give of ['goods', 'cash', 'materials']) for (const receive of ['materials', 'cash', 'goods']) {
      if (give === receive || ours[give] < 1 || other.resources[receive] < 1) continue;
      return { type: 'OFFER_TRADE', counterpart: other.playerId, terms: { give: { materials: 0, goods: 0, cash: 0, [give]: 1 }, receive: { materials: 0, goods: 0, cash: 0, [receive]: 1 } } };
    }
  }
  return null;
}
function chooseAction(view) {
  if (view.phase === 'ROUND_START' && !view.roundReady.includes(view.playerId)) return { type: 'ROUND_READY' };
  if (view.phase === 'TRICK' && view.currentPlayer === view.playerId) {
    const ordered = [...view.legalCards].sort((a,b) => b.rank - a.rank);
    return { type: 'PLAY_CARD', card: ordered[0] };
  }
  if (view.phase === 'REWARD' && view.rewardChoice.playerId === view.playerId) return { type: 'CLAIM_REWARD', amount: view.rewardChoice.kind === 'SALE' ? view.rewardChoice.maximum : view.activePublicProject.slots.findIndex(s => !s.playerId) };
  if (view.phase === 'INCOME' && !view.incomeDone.includes(view.playerId)) return { type: 'INCOME', selections: chooseIncome(view) };
  if (view.phase !== 'INVESTMENT') return null;
  const t = view.investmentTurn;
  if (t.step === 'NEGOTIATION' && t.negotiation) {
    const trade = t.negotiation;
    if ((trade.status === 'OFFERED' ? trade.counterpart : t.playerId) === view.playerId) return { type: 'ANSWER_TRADE', accept: true };
    return null;
  }
  if (t.playerId !== view.playerId) return null;
  if (t.step === 'NEGOTIATION') return { type: 'SKIP_NEGOTIATION' };
  if (t.step === 'MARKET') {
    const r = view.companies.find(c => c.playerId === view.playerId).resources;
    const action = r.materials === 0 && view.marketChoices.includes('buy-material') ? 'buy-material'
      : r.cash < 2 && view.marketChoices.includes('sell-good') ? 'sell-good' : null;
    return { type: 'MARKET', action };
  }
  return chooseInvestment(view);
}
module.exports = { chooseAction, chooseIncome, chooseInvestment, proposeTrade };
