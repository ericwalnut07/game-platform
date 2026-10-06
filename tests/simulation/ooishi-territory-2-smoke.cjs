const assert = require("node:assert/strict");
const {
  calculateTerritory2Board,
  createTerritory2State,
  currentTerritory2Turn,
  legalTerritory2Placements,
  reduceTerritory2,
  territory2Preset,
  territory2Result
} = require("../../dist-smoke/games/ooishi-territory-2/engine.js");

let games = 0, actions = 0, bigMoves = 0, syncGames = 0, piercingGames = 0;

for (const playerCount of [2, 3, 4]) {
  for (const cap of [1, 2]) {
    const config = territory2Preset(playerCount, cap);
    for (let seed = 1; seed <= 100; seed++) {
      let rng = (seed * 6571 + playerCount * 1237 + cap * 991) >>> 0;
      const next = (max) => {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        return rng % max;
      };
      let state = createTerritory2State(
        "territory2-sim-" + playerCount + "-" + cap + "-" + seed,
        Array.from({ length: playerCount }, (_, side) => ({ id: "p" + side, name: "p" + side })),
        config
      );
      let sawSync = false, sawPiercing = false;

      while (state.phase === "PLAYING") {
        const turn = currentTerritory2Turn(config, state.moves.length);
        const legal = legalTerritory2Placements(config, state.moves);
        assert.ok(legal.small.length > 0, "roomy board should always allow a small stone");
        const chooseBig = legal.big.length > 0 && next(4) === 0;
        const kind = chooseBig ? "big" : "small";
        const options = legal[kind];
        state = reduceTerritory2(state, {
          type: "PLACE",
          playerId: state.players[turn.seat].id,
          kind,
          index: options[next(options.length)]
        });
        if (kind === "big") bigMoves++;
        actions++;

        const board = calculateTerritory2Board(config, state.moves);
        assert.equal(board.scores.reduce((sum, score) => sum + score, board.neutral), config.size * config.size);
        assert.ok(board.bigUsed.every((used) => used <= cap));
        sawSync ||= board.syncBigIndexes.length > 0;
        sawPiercing ||= board.lines.some((line) => line.piercing);
        assert.ok(actions < 100000, "simulation deadlock");
      }

      assert.equal(state.moves.length, playerCount * config.turns);
      const result = territory2Result(state);
      assert.ok(result.winners.length >= 1);
      if (sawSync) syncGames++;
      if (sawPiercing) piercingGames++;
      games++;
    }
  }
}

console.log(JSON.stringify({
  gameId: "ooishi-territory-2",
  games,
  actions,
  bigMoves,
  syncGames,
  piercingGames,
  ok: true
}));
