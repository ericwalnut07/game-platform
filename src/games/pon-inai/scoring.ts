import { getVerdictAccuracy } from "./endings";
import type { InitialVotes, PonVoteTarget, PlayerGameState, TrialVerdict } from "./game-state";
import { evaluatePersonality } from "./personalities";
import type { PlayerId } from "./types";

export interface PlayerScoreBreakdown {
  playerId: PlayerId;
  spadariPoint: 0 | 1 | 2 | 3;
  factionPoint: 0 | 2;
  truthVotePoint: 0 | 1;
  personalityPoint: 0 | 1;
  total: number;
}

export interface GameScoringResult {
  players: readonly PlayerScoreBreakdown[];
  spadariVoteCounts: ReadonlyMap<PlayerId, number>;
  personalityResults: ReadonlyMap<PlayerId, boolean>;
}

export function tallySpadariVotes(initialVotes: ReadonlyMap<PlayerId, InitialVotes>, players: readonly PlayerId[]): Map<PlayerId, number> {
  const counts = new Map<PlayerId, number>(players.map((id) => [id, 0]));
  for (const vote of initialVotes.values()) counts.set(vote.spadariPlayerId, (counts.get(vote.spadariPlayerId) ?? 0) + 1);
  return counts;
}

export function calculateSpadariPoints(
  missionSuccess: boolean,
  counts: ReadonlyMap<PlayerId, number>
): Map<PlayerId, 0 | 1 | 2 | 3> {
  const result = new Map<PlayerId, 0 | 1 | 2 | 3>([...counts.keys()].map((id) => [id, 0]));
  const max = Math.max(...counts.values());
  const top = [...counts.entries()].filter(([, count]) => count === max).map(([id]) => id);
  const point: 1 | 2 | 3 = missionSuccess ? (top.length === 1 ? 3 : 2) : (top.length === 1 ? 2 : 1);
  for (const id of top) result.set(id, point);
  return result;
}

export function calculateFactionPoints(
  players: readonly PlayerId[],
  hasPon: boolean,
  ponPlayerId: PlayerId | undefined,
  verdict: TrialVerdict
): Map<PlayerId, 0 | 2> {
  const result = new Map<PlayerId, 0 | 2>(players.map((id) => [id, 0]));
  if (verdict.type === "UNDECIDED") return result;
  const accuracy = getVerdictAccuracy(hasPon, ponPlayerId, verdict);
  if (!hasPon) {
    if (accuracy === "CORRECT") for (const id of players) result.set(id, 2);
    return result;
  }
  if (accuracy === "CORRECT") {
    for (const id of players) if (id !== ponPlayerId) result.set(id, 2);
  } else if (ponPlayerId) result.set(ponPlayerId, 2);
  return result;
}

export function isInitialPonVoteCorrect(vote: PonVoteTarget, hasPon: boolean, ponPlayerId?: PlayerId): boolean {
  if (hasPon) return vote.type === "PLAYER" && vote.playerId === ponPlayerId;
  return vote.type === "NO_PON";
}

export function calculateGameScoring(args: {
  players: readonly PlayerId[];
  playerStates: ReadonlyMap<PlayerId, PlayerGameState>;
  initialVotes: ReadonlyMap<PlayerId, InitialVotes>;
  hasPon: boolean;
  ponPlayerId?: PlayerId;
  verdict: TrialVerdict;
  missionSuccess: boolean;
  activeColors: readonly ("RED" | "BLUE" | "GREEN" | "YELLOW")[];
}): GameScoringResult {
  const counts = tallySpadariVotes(args.initialVotes, args.players);
  const spadariPoints = calculateSpadariPoints(args.missionSuccess, counts);
  const factionPoints = calculateFactionPoints(args.players, args.hasPon, args.ponPlayerId, args.verdict);
  const personalityResults = new Map<PlayerId, boolean>();
  const results: PlayerScoreBreakdown[] = [];

  for (const playerId of args.players) {
    const state = args.playerStates.get(playerId)!;
    const initial = args.initialVotes.get(playerId)!;
    const personalitySuccess = evaluatePersonality(state.personality, {
      initialHand: state.initialHand,
      playedCards: state.playedCards.map((p) => p.card),
      remainingCards: state.remainingCards,
      confidenceHistory: state.confidenceHistory,
      activeColors: args.activeColors
    });
    personalityResults.set(playerId, personalitySuccess);
    const spadariPoint = spadariPoints.get(playerId)!;
    const factionPoint = factionPoints.get(playerId)!;
    const truthVotePoint = (isInitialPonVoteCorrect(initial.ponVote, args.hasPon, args.ponPlayerId) ? 1 : 0) as 0 | 1;
    const personalityPoint = (personalitySuccess ? 1 : 0) as 0 | 1;
    results.push({
      playerId,
      spadariPoint,
      factionPoint,
      truthVotePoint,
      personalityPoint,
      total: spadariPoint + factionPoint + truthVotePoint + personalityPoint
    });
  }
  return { players: results, spadariVoteCounts: counts, personalityResults };
}
