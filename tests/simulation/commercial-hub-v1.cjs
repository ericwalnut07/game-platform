// Production GameModule and player-view-only policies, all 16 startup settings.
const assert = require('node:assert/strict');
const { commercialHubGameModule: hub } = require('../../dist-smoke/games/commercial-hub/module.js');
const { buildHubView } = require('../../dist-smoke/games/commercial-hub/view.js');
const { decideNpc } = require('../../dist-smoke/games/commercial-hub/npc.js');
const { SeededRandom } = require('../../dist-smoke/games/pon-inai/random.js');
const { candidateFinalRound } = require('../../dist-smoke/games/commercial-hub/next-data.js');
const ids = ['a', 'b', 'c', 'd'], types = ['standard', 'production', 'commerce', 'development'];
let completed = 0, booms = 0;
for (const horizon of ['11-13', '12-14']) for (const majorInvestments of [false, true])
for (const trickRule of ['NORMAL', 'BID']) for (const auditor of [false, true]) {
  const config = hub.parseConfig({ horizon, majorInvestments, trickRule, auditor });
  const rng = new SeededRandom(62140 + completed);
  const context = { matchId: `formal-smoke-${completed}`, config, players: ids.map(id => ({ id })), rng, now: 0 };
  let state = hub.createInitialState(context), cursor = 0, steps = 0, savedRound = 0;
  assert.equal(state.rulesVersion, '1.0');
  assert.equal(state.projectScoringRule, 'v1-two-points-per-slot');
  assert.equal(state.constructionRule, 'v1-distinct-suits');
  assert.equal(state.opportunityRule, 'v1-work-2');
  while (!hub.isFinished(state)) {
    assert.ok(++steps < 6000, `stalled: ${JSON.stringify(config)} ${state.phase}`);
    if (state.round !== savedRound) {
      savedRound = state.round;
      const before = ids.map(id => buildHubView(state, id));
      state = JSON.parse(JSON.stringify(state));
      assert.deepEqual(ids.map(id => buildHubView(state, id)), before);
      if (state.cityCondition.id === 'special-boom') {
        assert.equal(state.opportunities.length, 8);
        assert.equal(ids.reduce((n, id) => n + state.playerHands[id].length, 0), 32);
        booms++;
      }
    }
    let action;
    if (['TRICK_RESULT', 'BID_RESULT'].includes(state.phase)) action = { type: 'ADVANCE' };
    else for (let i = 0; i < 4; i++) {
      const seat = (cursor + i) % 4, playerId = ids[seat], view = buildHubView(state, playerId);
      assert.ok(!Object.hasOwn(view, 'playerHands') && !Object.hasOwn(view, 'companyValues'));
      assert.ok(!Object.hasOwn(view.next, 'permanentDeck') && !Object.hasOwn(view.next, 'counterDeck'));
      const decision = decideNpc(view, types[seat]);
      if (decision) { action = { ...decision.action, playerId }; cursor = (seat + 1) % 4; break; }
    }
    assert.ok(action, `no progress: ${state.phase}`);
    state = hub.handleAction(state, action, { ...context, now: steps * 500 });
    for (const c of state.companies) {
      assert.ok(Object.values(c.resources).every(Number.isSafeInteger));
      assert.ok(c.resources.materials >= 0 && c.resources.goods >= 0);
    }
  }
  assert.equal(state.round, candidateFinalRound(state.cityLevel4Round, horizon));
  assert.equal(state.result.ranking.length, 4);
  assert.ok(state.result.ranking.every(row => row.value.cash === 0 && Number.isFinite(row.value.total)));
  for (const row of state.result.ranking) {
    const points = state.publicProjects.reduce((sum, p) => p.slots.every(slot => slot.playerId !== null)
      ? sum + p.slots.filter(slot => slot.playerId === row.playerId).length * 2 : sum, 0);
    assert.equal(row.value.projects, points);
  }
  if (!majorInvestments) assert.equal(state.next.cards.length, 0);
  const restarted = hub.createInitialState({ ...context, matchId: `${context.matchId}-again` });
  assert.equal(restarted.rulesVersion, '1.0');
  assert.equal(restarted.projectScoringRule, 'v1-two-points-per-slot');
  assert.equal(restarted.round, 1);
  assert.deepEqual(restarted.config, state.config);
  completed++;
  console.log(JSON.stringify({ rulesVersion: state.rulesVersion, horizon, majorInvestments, trickRule, auditor, round: state.round, steps }));
}
assert.equal(completed, 16);
assert.ok(booms > 0, 'no eight-trick round exercised');
console.log(`FORMAL_V1_CORE_OK games=${completed} eightTrickRounds=${booms}`);

