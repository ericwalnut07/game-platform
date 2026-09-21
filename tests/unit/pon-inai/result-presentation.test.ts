import { describe, expect, it } from "vitest";
import { ponInaiGameModule as module } from "../../../src/games/pon-inai/module";
import { reduceGameState, type CoreAction } from "../../../src/games/pon-inai/state-machine";
import type { MatchState } from "../../../src/games/pon-inai/match";
import type { PonInaiGameState, PonVoteTarget } from "../../../src/games/pon-inai/game-state";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { persistStateTransitionForGame } from "../../../src/server/lib/playtest-log";

function fixture(count: 3 | 4, gameCount: 1 | 2 = 1) {
  const rng = new SeededRandom(160 + count);
  const players = Array.from({ length: count }, (_, i) => ({ id: `P${i}`, displayName: `Player ${i}` }));
  const match = module.createInitialState({ matchId: "results", gameIndex: 1, players, config: { gameCount }, rng });
  return { rng, match: prepareVoting(match) };
}

function prepareVoting(match: MatchState): MatchState {
  let game = match.currentGame!;
  const apply = (action: CoreAction) => { game = reduceGameState(game, action); };
  for (const playerId of game.players) apply({ type: "ACK_PRIVATE_INFO", playerId });
  for (let round = 1; round <= 4; round++) {
    for (const playerId of game.players) apply({ type: "LOCK_ROUND_ACTION", playerId, action: { cardId: game.playerStates.get(playerId)!.remainingCards[0]!.id, confidence: "NORMAL" } });
    apply({ type: "ADVANCE_REVEAL" });
    apply({ type: "ADVANCE_REVEAL" });
    apply({ type: "END_ROUND_TALK" });
  }
  apply({ type: "ADVANCE_RETURN" });
  apply({ type: "END_FINAL_DISCUSSION" });
  return { ...match, currentGame: game };
}

function initialVote(game: PonInaiGameState, index: number, target: PonVoteTarget): CoreAction {
  return { type: "LOCK_INITIAL_VOTES", playerId: game.players[index]!, votes: { spadariPlayerId: game.players[(index + 1) % game.players.length]!, ponVote: target } };
}

function completeCore(game: PonInaiGameState) {
  let result = game;
  while (result.phase !== "FINISHED") result = reduceGameState(result, { type: "ADVANCE_TRUTH_REVEAL" });
  return result;
}

describe("compact result presentation", () => {
  it.each([3, 4] as const)("preserves all core results for %i players and hides votes until voting ends", (count) => {
    const { rng, match } = fixture(count);
    let state = match;
    for (let index = 0; index < count - 1; index++) {
      state = module.handleAction(state, { type: "GAME_ACTION", action: initialVote(state.currentGame!, index, { type: "NO_PON" }) }, { rng });
      for (const player of state.players) {
        const view = module.buildPlayerView(state, player.id);
        expect(view.currentGame?.revealData).toBeUndefined();
        expect(view.resultStats).toBeUndefined();
      }
    }
    const action = initialVote(state.currentGame!, count - 1, { type: "NO_PON" });
    const expected = completeCore(reduceGameState(state.currentGame!, action));
    const result = module.handleAction(state, { type: "GAME_ACTION", action }, { rng });
    expect(result.currentGame).toEqual(expected);
    expect(state.currentGame?.phase).toBe("INITIAL_VOTE");
    const view = module.buildPlayerView(result, "P0");
    const reveal = JSON.parse(JSON.stringify(view.currentGame!.revealData));
    expect(Object.keys(reveal.initialVotes)).toHaveLength(count);
    expect(reveal.trueMission).toEqual(expected.trueMission);
    expect(reveal.actualPonPlayerId).toBe(expected.ponPlayerId ?? null);
    expect(reveal.missionSuccess).toBe(expected.missionSuccess);
    expect(reveal.scoring.players).toEqual(expected.scoring!.players);
    expect(reveal.ending).toBe(expected.ending);
    expect(module.getPhaseReadyAction!(result)).toEqual({ type: "NEXT_GAME" });
  });

  it.each(["decided", "undecided"] as const)("keeps runoff rules and initial prediction points (%s)", (outcome) => {
    const { rng, match } = fixture(4);
    let state = match;
    for (let i = 0; i < 4; i++) state = module.handleAction(state, { type: "GAME_ACTION", action: initialVote(state.currentGame!, i, { type: "PLAYER", playerId: i < 2 ? "P0" : "P1" }) }, { rng });
    expect(state.currentGame?.phase).toBe("RUNOFF_DISCUSSION");
    state = module.handleAction(state, module.getPhaseReadyAction!(state)!, { rng });
    for (let i = 0; i < 3; i++) state = module.handleAction(state, { type: "GAME_ACTION", action: { type: "LOCK_RUNOFF_VOTE", playerId: `P${i}`, vote: { type: "PLAYER", playerId: outcome === "decided" || i < 2 ? "P0" : "P1" } } }, { rng });
    expect(module.buildPlayerView(state, "P0").currentGame?.revealData).toBeUndefined();
    const last: CoreAction = { type: "LOCK_RUNOFF_VOTE", playerId: "P3", vote: { type: "PLAYER", playerId: outcome === "decided" ? "P0" : "P1" } };
    const expected = completeCore(reduceGameState(state.currentGame!, last));
    state = module.handleAction(state, { type: "GAME_ACTION", action: last }, { rng });
    expect(state.currentGame).toEqual(expected);
    const reveal = module.buildPlayerView(state, "P0").currentGame!.revealData!;
    expect(Object.keys(reveal.runoffVotes!)).toHaveLength(4);
    if (outcome === "undecided") {
      expect(reveal.verdictAccuracy).toBe("UNDECIDED");
      expect(reveal.scoring!.players.every((score) => score.factionPoint === 0)).toBe(true);
    }
  });

  it("counts each game once, retains final results, and logs one completion per game", async () => {
    const { rng, match } = fixture(3, 2);
    let state = match;
    const totals = new Map<string, number>();
    const sql: string[] = [];
    const statement = { bind() { return this; }, async run() { return { success: true }; } };
    const db = { prepare(query: string) { sql.push(query); return statement; }, async batch() { return []; } } as unknown as D1Database;
    for (let gameIndex = 1; gameIndex <= 2; gameIndex++) {
      for (let i = 0; i < 3; i++) {
        const before = state;
        state = module.handleAction(state, { type: "GAME_ACTION", action: initialVote(state.currentGame!, i, { type: "NO_PON" }) }, { rng });
        await persistStateTransitionForGame(db, "pon-inai", before, state, Date.now());
      }
      for (const score of state.currentGame!.scoring!.players) totals.set(score.playerId, (totals.get(score.playerId) ?? 0) + score.total);
      expect(module.buildPlayerView(state, "P0").resultStats?.map((s) => s.totalScore)).toEqual([...totals.values()]);
      const before = state;
      state = module.handleAction(state, module.getPhaseReadyAction!(state)!, { rng });
      await persistStateTransitionForGame(db, "pon-inai", before, state, Date.now());
      if (gameIndex === 1) state = prepareVoting(state);
    }
    expect(state.completedGames).toHaveLength(2);
    expect(state.status).toBe("FINISHED");
    expect(module.buildPlayerView(state, "P0").currentGame?.revealData?.scoring).toBeDefined();
    expect(module.buildPlayerView(state, "P0").resultStats?.map((s) => s.totalScore)).toEqual([...totals.values()]);
    expect(sql.filter((query) => /INSERT.*playtest_games/.test(query))).toHaveLength(2);
  });

  it("can finish a room saved in a legacy reveal phase without recalculating results", () => {
    const { rng, match } = fixture(3);
    let game = match.currentGame!;
    for (let i = 0; i < 3; i++) game = reduceGameState(game, initialVote(game, i, { type: "NO_PON" }));
    const state = { ...match, currentGame: game };
    const resumed = module.handleAction(state, module.getPhaseReadyAction!(state)!, { rng });
    expect(resumed.currentGame).toEqual(completeCore(game));
  });
});
