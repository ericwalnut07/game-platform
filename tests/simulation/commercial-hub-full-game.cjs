const assert = require('node:assert/strict');
const { SeededRandom } = require('../../dist-smoke/games/pon-inai/random.js');
const { createHubState, reduceHubState } = require('../../dist-smoke/games/commercial-hub/engine.js');
const { buildHubView } = require('../../dist-smoke/games/commercial-hub/view.js');
const { companyValue } = require('../../dist-smoke/games/commercial-hub/scoring.js');
const { chooseAction, proposeTrade } = require('./hub-bot.cjs');
const ids = ['A', 'B', 'C', 'D'];
const eventCounts = {}, reasons = {};
let rounds = 0, actions = 0, maxRounds = 0;
for (let seed = 1; seed <= 150; seed++) {
  const rng = new SeededRandom(seed);
  let state = createHubState(`full-${seed}`, ids, rng), iterations = 0, tradeAttempt = 0;
  while (state.phase !== 'FINISHED') {
    assert.ok(++iterations < 20000, `Unfinished simulation seed=${seed} round=${state.round} phase=${state.phase}`);
    let action;
    if (state.phase === 'TRICK_RESULT' || state.phase === 'ROUND_END') action = { type: 'ADVANCE' };
    else {
      for (const id of ids) {
        const view = buildHubView(state, id);
        assert.equal(Object.hasOwn(view, 'playerHands'), false);
        let selected = chooseAction(view);
        if (selected?.type === 'SKIP_NEGOTIATION' && tradeAttempt < 3) {
          selected = proposeTrade(view) ?? selected;
          if (selected.type === 'OFFER_TRADE') tradeAttempt++;
        }
        if (selected?.type === 'ANSWER_TRADE' && tradeAttempt === 2) selected.accept = false;
        if (selected?.type === 'ANSWER_TRADE' && tradeAttempt === 3 && view.investmentTurn.negotiation.status === 'OFFERED') selected = { type: 'COUNTER_TRADE', terms: { give: view.investmentTurn.negotiation.give, receive: view.investmentTurn.negotiation.receive } };
        if (selected) { action = { ...selected, playerId: id }; break; }
      }
    }
    assert.ok(action, `No actor seed=${seed} phase=${state.phase}`);
    const priorSeq = state.eventSeq, priorLevel = state.cityLevel;
    state = reduceHubState(state, action, rng); actions++;
    if (!['ROUND_END','FINISHED'].includes(state.phase)) assert.equal(state.cityLevel, priorLevel);
    for (const event of state.events.filter(e => e.seq > priorSeq)) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    for (const c of state.companies) {
      assert.ok(Object.values(c.resources).every(n => Number.isSafeInteger(n) && n >= 0));
      assert.deepEqual(state.companyValues[c.playerId], companyValue(c, state.buildings, state.routeOwnership, [...state.completedPublicProjects, ...(state.activePublicProject ? [state.activePublicProject] : [])]));
      assert.ok(state.buildings.filter(b => b.playerId === c.playerId).length <= 6);
      assert.ok(['E01','E02','E03','E04'].filter(edge => state.routeOwnership[edge] === c.playerId).length <= 1);
    }
    // Exercise JSON persistence/reload during negotiations and every phase.
    if (iterations % 13 === 0) state = JSON.parse(JSON.stringify(state));
  }
  assert.ok(state.result.winners.length > 0);
  reasons[state.result.reason] = (reasons[state.result.reason] ?? 0) + 1;
  rounds += state.round; maxRounds = Math.max(maxRounds, state.round);
}
for (const event of ['TRADE_OFFERED','TRADE_ACCEPTED','TRADE_REJECTED','TRADE_COUNTERED','MARKET_USED','BUILD','UPGRADE','ROUTE','TRANSPORT_USED','PROJECT_CONTRIBUTION','PROJECT_COMPLETED','ABILITY_USED','GAME_FINISHED']) assert.ok(eventCounts[event] > 0, `Missing coverage: ${event}`);
console.log(JSON.stringify({ commercialHubFullGames: 150, rounds, maxRounds, actions, reasons, eventCounts }, null, 2));
