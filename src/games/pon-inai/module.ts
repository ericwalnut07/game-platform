import type { GameModule } from "../core/GameModule";
import type { CoreAction } from "./state-machine";
import { reduceGameState } from "./state-machine";
import { advanceMatchAfterFinishedGame, buildMatchStats, createMatch, startMatch, type MatchState } from "./match";
import { buildPlayerView, type PonInaiPlayerView } from "./view-builder";
import type { MatchRankEntry, PlayerMatchStats } from "./match-ranking";
import type { PonInaiClientAction } from "./web-actions";

export interface PonInaiModuleConfig {
  gameCount: 1 | 2 | 3 | 4 | 5;
}

export type PonInaiModuleAction =
  | { type: "GAME_ACTION"; action: CoreAction }
  | { type: "NEXT_GAME" };

export interface PonInaiMatchPlayerView {
  matchId: string;
  gameCount: number;
  currentGameIndex: number;
  status: MatchState["status"];
  completedGameCount: number;
  cumulativeStats: PlayerMatchStats;
  currentGame?: PonInaiPlayerView;
  finalRanking?: readonly MatchRankEntry[];
}

export interface PonInaiMatchResult {
  finalRanking: readonly MatchRankEntry[];
  stats: readonly PlayerMatchStats[];
}

function parseConfig(value: unknown): PonInaiModuleConfig {
  if (!value || typeof value !== "object") throw new Error("ゲーム設定が不正です");
  const gameCount = (value as { gameCount?: unknown }).gameCount;
  if (!Number.isInteger(gameCount) || (gameCount as number) < 1 || (gameCount as number) > 5) {
    throw new Error("ゲーム数は1〜5で指定してください");
  }
  return { gameCount: gameCount as 1 | 2 | 3 | 4 | 5 };
}

function parseClientAction(value: unknown, playerId: string): PonInaiModuleAction {
  if (!value || typeof value !== "object" || !("type" in value) || typeof (value as { type?: unknown }).type !== "string") {
    throw new Error("ゲーム操作形式が不正です");
  }
  const action = value as PonInaiClientAction;
  let core: CoreAction;
  switch (action.type) {
    case "ACK_PRIVATE_INFO":
      core = { type: "ACK_PRIVATE_INFO", playerId };
      break;
    case "LOCK_ROUND_ACTION":
      core = { type: "LOCK_ROUND_ACTION", playerId, action: action.action };
      break;
    case "LOCK_INITIAL_VOTES":
      core = { type: "LOCK_INITIAL_VOTES", playerId, votes: action.votes };
      break;
    case "LOCK_RUNOFF_VOTE":
      core = { type: "LOCK_RUNOFF_VOTE", playerId, vote: action.vote };
      break;
    default:
      throw new Error("許可されていないゲーム操作です");
  }
  return { type: "GAME_ACTION", action: core };
}

function phaseReadyAction(match: MatchState): PonInaiModuleAction | null {
  if (match.status === "FINISHED") return null;
  const phase = match.currentGame?.phase;
  if (!phase) return null;
  if (phase === "ROUND_TALK") return { type: "GAME_ACTION", action: { type: "END_ROUND_TALK" } };
  if (phase === "RETURN") return { type: "GAME_ACTION", action: { type: "ADVANCE_RETURN" } };
  if (phase === "FINAL_DISCUSSION") return { type: "GAME_ACTION", action: { type: "END_FINAL_DISCUSSION" } };
  if (phase === "RUNOFF_DISCUSSION") return { type: "GAME_ACTION", action: { type: "END_RUNOFF_DISCUSSION" } };
  if ([
    "VERDICT_REVEAL", "MISSION_RESULT_REVEAL", "TRUE_MISSION_REVEAL", "DISPLAYED_MISSIONS_REVEAL",
    "PON_REVEAL", "PERSONALITIES_REVEAL", "PERSONALITY_RESULTS_REVEAL", "SPADARI_RESULT_REVEAL",
    "SCORE_REVEAL", "ENDING"
  ].includes(phase)) return { type: "GAME_ACTION", action: { type: "ADVANCE_TRUTH_REVEAL" } };
  if (phase === "FINISHED") return { type: "NEXT_GAME" };
  return null;
}

export const ponInaiGameModule: GameModule<
  PonInaiModuleConfig,
  MatchState,
  PonInaiModuleAction,
  PonInaiMatchPlayerView,
  PonInaiMatchResult
> = {
  id: "pon-inai",
  minPlayers: 3,
  maxPlayers: 4,

  parseConfig,

  createInitialState(context) {
    const match = createMatch(context.matchId, context.players, context.config.gameCount);
    return startMatch(match, context.rng);
  },

  handleAction(state, action, context) {
    if (state.status !== "PLAYING") throw new Error("Match is not playing");
    if (action.type === "NEXT_GAME") {
      if (!state.currentGame || state.currentGame.phase !== "FINISHED") throw new Error("Current game is not finished");
      return advanceMatchAfterFinishedGame(state, context.rng);
    }
    if (!state.currentGame) throw new Error("No active game");
    return { ...state, currentGame: reduceGameState(state.currentGame, action.action) };
  },

  buildPlayerView(state, playerId) {
    const stats = buildMatchStats(state.players, state.completedGames);
    const mine = stats.find((s) => s.playerId === playerId);
    if (!mine) throw new Error("Unknown player");
    return {
      matchId: state.matchId,
      gameCount: state.gameCount,
      currentGameIndex: state.currentGameIndex,
      status: state.status,
      completedGameCount: state.completedGames.length,
      cumulativeStats: mine,
      ...(state.currentGame ? { currentGame: buildPlayerView(state.currentGame, playerId) } : {}),
      ...(state.finalRanking ? { finalRanking: state.finalRanking } : {})
    };
  },

  isFinished(state) {
    return state.status === "FINISHED";
  },

  getResult(state) {
    if (state.status !== "FINISHED" || !state.finalRanking) return null;
    return { finalRanking: state.finalRanking, stats: buildMatchStats(state.players, state.completedGames) };
  },

  parseClientAction,

  getStateInfo(state) {
    const currentGame = state.currentGame;
    return {
      matchId: state.matchId,
      phase: state.status === "FINISHED" ? "MATCH_FINISHED" : currentGame?.phase ?? "NO_GAME",
      matchFinished: state.status === "FINISHED",
      currentGameFinished: currentGame?.phase === "FINISHED",
      ...(currentGame ? { currentGameId: currentGame.gameId, currentGameIndex: currentGame.gameIndex } : {})
    };
  },

  getPhaseReadyAction: phaseReadyAction,

  getAutomaticProgress(state) {
    if (state.status !== "PLAYING" || !state.currentGame) return null;
    const phase = state.currentGame.phase;
    if (phase === "CONFIDENCE_REVEAL") return { delayMs: 1_200, action: { type: "GAME_ACTION", action: { type: "ADVANCE_REVEAL" } } };
    if (phase === "CARD_REVEAL") return { delayMs: 1_600, action: { type: "GAME_ACTION", action: { type: "ADVANCE_REVEAL" } } };
    if (phase === "ROUND_TALK") return { delayMs: 30_000, action: { type: "GAME_ACTION", action: { type: "END_ROUND_TALK" } } };
    if (phase === "RETURN") return { delayMs: 1_800, action: { type: "GAME_ACTION", action: { type: "ADVANCE_RETURN" } } };
    if (phase === "RUNOFF_DISCUSSION") return { delayMs: 30_000, action: { type: "GAME_ACTION", action: { type: "END_RUNOFF_DISCUSSION" } } };
    return null;
  }
};
