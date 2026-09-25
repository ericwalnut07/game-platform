const assert = require("node:assert/strict");
const {
  calculateBoard, createTerritoryState, currentTurn, legalPlacements, reduceTerritory, TERRITORY_PRESETS, territoryResult
} = require("../../dist-smoke/games/ooishi-territory/engine.js");
let games = 0, actions = 0, passes = 0, moonVolleys = 0, winnerTies = 0;
for (const playerCount of [2, 3, 4]) {
  const cfg = TERRITORY_PRESETS[playerCount];
  for (let seed = 1; seed <= 100; seed++) {
    let rng = (seed * 4229 + playerCount * 911) >>> 0;
    const next = (max) => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng % max; };
    let state = createTerritoryState("sim-" + playerCount + "-" + seed,
      Array.from({ length: playerCount }, (_, seat) => ({ id: "p" + seat, name: "p" + seat })), cfg);
    while (state.phase === "PLAYING") {
      const board = calculateBoard(cfg, state.moves);
      const turn = currentTurn(cfg, state.moves.length);
      const opts = legalPlacements(cfg, state.moves, board);
      const kinds = ["big", "medium", "small", "exp"].filter((kind) => opts[kind].length);
      let action;
      if (!kinds.length) { passes++; action = { type: "PASS", playerId: state.players[turn.seat].id }; }
      else {
        const kind = kinds[next(kinds.length)], index = opts[kind][next(opts[kind].length)];
        if (kind === "exp") moonVolleys++;
        action = { type: "PLACE", kind, index, playerId: state.players[turn.seat].id };
      }
      state = reduceTerritory(state, action); actions++;
      const latest = calculateBoard(cfg, state.moves);
      assert.equal(latest.scores.reduce((a, b) => a + b, latest.neutral), cfg.size * cfg.size);
      assert.ok(latest.stocks.every((stock) => stock.big >= 0 && stock.medium >= 0 && stock.small >= 0 && stock.exp >= 0));
      assert.ok(actions < 15000, "simulation deadlock");
    }
    assert.equal(state.moves.length, playerCount * (cfg.big + cfg.medium + cfg.small));
    const result = territoryResult(state);
    assert.ok(result.winners.length >= 1);
    if (result.winners.length > 1) winnerTies++;
    games++;
  }
}
console.log(JSON.stringify({ gameId: "ooishi-territory", games, actions, passes, moonVolleys, winnerTies, ok: true }));
