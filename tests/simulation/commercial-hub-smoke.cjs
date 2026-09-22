const assert = require('node:assert/strict');
const { SeededRandom } = require('../../dist-smoke/games/pon-inai/random.js');
const { SUITS } = require('../../dist-smoke/games/commercial-hub/types.js');
const { buildHandView, cardId, clockwisePlayer, dealHands, legalCards, playCard, trickWinner } = require('../../dist-smoke/games/commercial-hub/cards.js');
const { ROUTE_EDGES } = require('../../dist-smoke/games/commercial-hub/data.js');
const { connectedDistricts, placeRoute, routePlacementError } = require('../../dist-smoke/games/commercial-hub/logistics.js');

const players = ['A', 'B', 'C', 'D'];
let totalTricks = 0;
for (let seed = 0; seed < 200; seed++) {
  const rng = new SeededRandom(seed);
  let leader = players[seed % 4];
  for (const tricks of [4, 5, 6]) {
    const hands = dealHands(players, tricks, rng);
    const trump = seed % 5 === 4 ? null : SUITS[seed % 4];
    const used = new Set();
    for (let trick = 0; trick < tricks; trick++) {
      const played = [];
      for (let offset = 0; offset < 4; offset++) {
        const actor = clockwisePlayer(players, leader, offset);
        const lead = played[0]?.card.suit ?? null;
        const legal = legalCards(hands[actor], lead);
        assert.ok(legal.length > 0);
        const card = legal[rng.integer(0, legal.length - 1)];
        if (lead !== null && hands[actor].some((entry) => entry.suit === lead)) assert.equal(card.suit, lead);
        assert.equal(used.has(cardId(card)), false);
        used.add(cardId(card));
        hands[actor] = playCard(hands[actor], card, lead);
        played.push({ playerId: actor, card });
        const view = buildHandView(players, JSON.parse(JSON.stringify(hands)), actor);
        assert.deepEqual(view.hand, hands[actor]);
        assert.deepEqual(Object.keys(view).sort(), ['hand', 'handCounts', 'playerId']);
      }
      // Independent oracle: trump candidates, otherwise lead candidates, highest rank.
      const trumps = played.filter((entry) => entry.card.suit === trump);
      const contenders = trumps.length ? trumps : played.filter((entry) => entry.card.suit === played[0].card.suit);
      const winner = contenders.reduce((best, entry) => entry.card.rank > best.card.rank ? entry : best);
      assert.equal(trickWinner(played, trump), winner.playerId);
      leader = clockwisePlayer(players, leader);
      totalTricks++;
    }
    assert.equal(used.size, 4 * tricks);
    assert.ok(Object.values(hands).every((hand) => hand.length === 0));
  }
  let routes = {};
  for (let turn = 0; turn < 32; turn++) {
    const actor = players[turn % 4];
    const legal = ROUTE_EDGES.filter((edge) => routePlacementError(routes, actor, edge.id) === null);
    if (legal.length === 0) continue;
    routes = placeRoute(routes, actor, legal[rng.integer(0, legal.length - 1)].id);
    for (const owner of players) {
      assert.ok(ROUTE_EDGES.filter((edge) => edge.from === 'OLD_TOWN' && routes[edge.id] === owner).length <= 1);
      const connected = connectedDistricts(routes, owner);
      for (const edge of ROUTE_EDGES.filter((edge) => routes[edge.id] === owner)) {
        assert.ok(connected.has(edge.from) && connected.has(edge.to));
      }
    }
  }
}
console.log(JSON.stringify({ gameId: 'commercial-hub', scope: 'core primitives; not full games', cardRounds: 600, tricks: totalTricks, routeScenarios: 200, ok: true }));
