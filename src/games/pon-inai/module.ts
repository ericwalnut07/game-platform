import type { GameModule } from "../core/GameModule";
import type { CoreAction } from "./state-machine";
import { reduceGameState } from "./state-machine";
import { advanceMatchAfterFinishedGame, buildMatchStats, createMatch, startMatch, type MatchState } from "./match";
import { buildPlayerView, type PonInaiPlayerView } from "./view-builder";
import type { MatchRankEntry, PlayerMatchStats } from "./match-ranking";

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
  }
};
