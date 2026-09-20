import type { EndingId } from "./endings";
import type { PonInaiGameState } from "./game-state";
import type { MatchRankEntry, PlayerMatchStats } from "./match-ranking";
import { rankMatch } from "./match-ranking";
import type { MissionCategory } from "./missions";
import type { RandomSource } from "./random";
import { createInitialGameState } from "./state-machine";
import type { GameCount, PlayerId, PlayerRef } from "./types";

export interface CompletedGameResult {
  gameIndex: number;
  missionCategory: MissionCategory;
  ending: EndingId;
  scores: Readonly<Record<PlayerId, number>>;
  spadariVotes: Readonly<Record<PlayerId, number>>;
  correctInitialPonVotes: Readonly<Record<PlayerId, 0 | 1>>;
}

export interface MatchState {
  matchId: string;
  gameCount: GameCount;
  players: readonly PlayerRef[];
  currentGameIndex: number;
  completedGames: readonly CompletedGameResult[];
  currentGame?: PonInaiGameState;
  finalRanking?: readonly MatchRankEntry[];
  status: "NOT_STARTED" | "PLAYING" | "FINISHED";
}

export function createMatch(matchId: string, players: readonly PlayerRef[], gameCount: GameCount): MatchState {
  if (players.length !== 3 && players.length !== 4) throw new Error("Match requires 3 or 4 players");
  return { matchId, gameCount, players, currentGameIndex: 0, completedGames: [], status: "NOT_STARTED" };
}

export function startMatch(match: MatchState, rng: RandomSource): MatchState {
  if (match.status !== "NOT_STARTED") throw new Error("Match already started");
  const currentGameIndex = 1;
  return {
    ...match,
    status: "PLAYING",
    currentGameIndex,
    currentGame: createInitialGameState({
      gameId: `${match.matchId}-G${currentGameIndex}`,
      gameIndex: currentGameIndex,
      players: match.players,
      rng
    })
  };
}

function resultFromFinishedGame(game: PonInaiGameState): CompletedGameResult {
  if (game.phase !== "FINISHED" || !game.scoring || !game.ending) throw new Error("Game is not finished");
  return {
    gameIndex: game.gameIndex,
    missionCategory: game.missionCategory,
    ending: game.ending,
    scores: Object.fromEntries(game.scoring.players.map((s) => [s.playerId, s.total])),
    spadariVotes: Object.fromEntries(game.scoring.spadariVoteCounts),
    correctInitialPonVotes: Object.fromEntries(game.scoring.players.map((s) => [s.playerId, s.truthVotePoint]))
  };
}

export function buildMatchStats(players: readonly PlayerRef[], completedGames: readonly CompletedGameResult[]): PlayerMatchStats[] {
  return players.map((player) => ({
    playerId: player.id,
    totalScore: completedGames.reduce((sum, game) => sum + (game.scores[player.id] ?? 0), 0),
    totalSpadariVotes: completedGames.reduce((sum, game) => sum + (game.spadariVotes[player.id] ?? 0), 0),
    correctInitialPonVotes: completedGames.reduce((sum, game) => sum + (game.correctInitialPonVotes[player.id] ?? 0), 0)
  }));
}

export function advanceMatchAfterFinishedGame(match: MatchState, rng: RandomSource): MatchState {
  if (match.status !== "PLAYING" || !match.currentGame) throw new Error("No active game");
  const result = resultFromFinishedGame(match.currentGame);
  const completedGames = [...match.completedGames, result];

  if (completedGames.length >= match.gameCount) {
    const finalRanking = rankMatch(buildMatchStats(match.players, completedGames));
    const { currentGame: _currentGame, finalRanking: _oldRanking, ...base } = match;
    return {
      ...base,
      completedGames,
      finalRanking,
      status: "FINISHED"
    };
  }

  const nextIndex = completedGames.length + 1;
  return {
    ...match,
    completedGames,
    currentGameIndex: nextIndex,
    currentGame: createInitialGameState({
      gameId: `${match.matchId}-G${nextIndex}`,
      gameIndex: nextIndex,
      players: match.players,
      rng,
      previousMissionCategory: result.missionCategory
    })
  };
}
