const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { applyLineAction, createLineState, isLegalLineAction, legalLineActions } = require("../../dist-smoke/games/ooishi-line/engine.js");
const { analyzeLineNpc } = require("../../dist-smoke/games/ooishi-line/npc.js");
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, "").split("=")));
const games = Number(args.games ?? 6);
assert.ok(Number.isInteger(games) && games >= 1 && games <= 100, "games must be 1..100");
const summary = { gameId: "ooishi-line", games: 0, actions: 0, wins: [0, 0], draws: 0, repetitionDraws: 0, maxPly: 0, maxSearchNodes: 0 };
const times = [];
for (let seed = 1; seed <= games; seed++) {
  let random = seed;
  const rng = { integer(min, max) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return min + random % (max - min + 1); } };
  let state = createLineState(seed % 2);
  // Varied, Core-legal four-ply openings; thereafter both seats use the standard NPC.
  for (let opening = 0; opening < 4; opening++) {
    const legal = legalLineActions(state);
    state = applyLineAction(state, state.position.nextSeat, legal[rng.integer(0, legal.length - 1)]);
  }
  while (state.phase === "PLAYING" && state.ply < 240) {
    const started = performance.now();
    const analysis = analyzeLineNpc(state, rng);
    times.push(performance.now() - started);
    assert.ok(analysis.action, "live game must have an action");
    assert.ok(isLegalLineAction(state, state.position.nextSeat, analysis.action), "NPC chose an illegal action");
    assert.ok(analysis.diagnostics.searchedNodes <= 1600, "search exceeded its budget");
    summary.maxSearchNodes = Math.max(summary.maxSearchNodes, analysis.diagnostics.searchedNodes);
    state = applyLineAction(state, state.position.nextSeat, analysis.action);
    for (const owner of [0, 1]) for (const [size, count] of [["large", 4], ["medium", 2], ["small", 1]]) {
      assert.equal(state.position.hands[owner][size] + state.position.board.flat().filter(stone => stone.owner === owner && stone.size === size).length, count);
    }
  }
  assert.equal(state.phase, "FINISHED", `seed ${seed} did not finish within 240 plies`);
  assert.equal(analyzeLineNpc(state, rng).action, null);
  if (state.result.kind === "WIN") summary.wins[state.result.winner]++;
  else { summary.draws++; if (state.result.reason === "THREEFOLD_REPETITION") summary.repetitionDraws++; }
  summary.games++; summary.actions += state.ply; summary.maxPly = Math.max(summary.maxPly, state.ply);
  console.log(JSON.stringify({ seed, plies: state.ply, result: state.result.kind, reason: state.result.reason ?? null }));
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ ...summary, npcActions: times.length,
  timingMs: { mean: times.reduce((sum, value) => sum + value, 0) / times.length, p95: times[Math.floor(times.length * .95)], max: times.at(-1) }, ok: true }));
