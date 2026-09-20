import { createEmptyColorCounts } from "./cards";
import { determineEnding, getVerdictAccuracy } from "./endings";
import type { GamePhase, InitialVotes, LockedRoundAction, PonInaiGameState, PonVoteTarget } from "./game-state";
import { evaluateMission } from "./missions";
import { buildPublicSummary, deriveUniqueTopColor } from "./public-summary";
import type { RandomSource } from "./random";
import { calculateGameScoring } from "./scoring";
import { createGameSetup } from "./setup";
import type { MissionCategory } from "./missions";
import type { PlayerId, PlayerRef, RoundResult } from "./types";
import { topPonVoteTargets, verdictFromRunoff, verdictFromUniqueTop } from "./voting";

export type CoreAction =
  | { type: "ACK_PRIVATE_INFO"; playerId: PlayerId }
  | { type: "LOCK_ROUND_ACTION"; playerId: PlayerId; action: LockedRoundAction }
  | { type: "ADVANCE_REVEAL" }
  | { type: "END_ROUND_TALK" }
  | { type: "ADVANCE_RETURN" }
  | { type: "END_FINAL_DISCUSSION" }
  | { type: "LOCK_INITIAL_VOTES"; playerId: PlayerId; votes: InitialVotes }
  | { type: "END_RUNOFF_DISCUSSION" }
  | { type: "LOCK_RUNOFF_VOTE"; playerId: PlayerId; vote: PonVoteTarget }
  | { type: "ADVANCE_TRUTH_REVEAL" };

export function createInitialGameState(args: {
  gameId: string;
  gameIndex: number;
  players: readonly PlayerRef[];
  rng: RandomSource;
  previousMissionCategory?: MissionCategory;
}): PonInaiGameState {
  const setup = createGameSetup(args.players, args.rng, args.previousMissionCategory);
  return {
    ...setup,
    gameId: args.gameId,
    gameIndex: args.gameIndex,
    players: args.players.map((p) => p.id),
    phase: "PRIVATE_INFO",
    currentRound: 1,
    rounds: [],
    privateInfoAcks: new Set(),
    pendingRoundActions: new Map(),
    initialVotes: new Map(),
    runoffVotes: new Map()
  };
}

function roundResultFromPending(state: PonInaiGameState): RoundResult {
  const colorCounts = createEmptyColorCounts();
  const players = state.players.map((playerId) => {
    const action = state.pendingRoundActions.get(playerId)!;
    const card = state.playerStates.get(playerId)!.remainingCards.find((c) => c.id === action.cardId)!;
    colorCounts[card.color] += 1;
    return { playerId, card, confidence: action.confidence };
  });
  const numberSum = players.reduce((sum, p) => sum + p.card.number, 0);
  return {
    round: state.currentRound,
    players,
    numberSum,
    numberAverage: numberSum / state.playerCount,
    colorCounts,
    uniqueTopColor: deriveUniqueTopColor(colorCounts)
  };
}

function applyRoundResult(state: PonInaiGameState, round: RoundResult): PonInaiGameState {
  const playerStates = new Map(state.playerStates);
  for (const result of round.players) {
    const previous = playerStates.get(result.playerId)!;
    playerStates.set(result.playerId, {
      ...previous,
      remainingCards: previous.remainingCards.filter((c) => c.id !== result.card.id),
      playedCards: [...previous.playedCards, { round: round.round, card: result.card }],
      confidenceHistory: [...previous.confidenceHistory, result.confidence]
    });
  }
  return {
    ...state,
    playerStates,
    rounds: [...state.rounds, round],
    pendingRoundActions: new Map(),
    phase: "CONFIDENCE_REVEAL"
  };
}

function validatePonVoteTarget(state: PonInaiGameState, vote: PonVoteTarget): void {
  if (vote.type === "PLAYER" && !state.players.includes(vote.playerId)) throw new Error("Invalid Pon vote target");
}

function samePonVote(a: PonVoteTarget, b: PonVoteTarget): boolean {
  return a.type === b.type && (a.type === "NO_PON" || (b.type === "PLAYER" && a.playerId === b.playerId));
}

function finalizeVerdict(state: PonInaiGameState, verdict: NonNullable<PonInaiGameState["verdict"]>): PonInaiGameState {
  const summary = buildPublicSummary(state.rounds);
  const missionSuccess = evaluateMission(state.trueMission, { playerCount: state.playerCount, summary });
  const scoring = calculateGameScoring({
    players: state.players,
    playerStates: state.playerStates,
    initialVotes: state.initialVotes,
    hasPon: state.hasPon,
    ...(state.ponPlayerId ? { ponPlayerId: state.ponPlayerId } : {}),
    verdict,
    missionSuccess,
    activeColors: state.activeColors
  });
  const ending = determineEnding(state.hasPon, missionSuccess, getVerdictAccuracy(state.hasPon, state.ponPlayerId, verdict));
  return { ...state, verdict, missionSuccess, scoring, ending, phase: "VERDICT_REVEAL" };
}

const revealSequence: readonly GamePhase[] = [
  "VERDICT_REVEAL",
  "MISSION_RESULT_REVEAL",
  "TRUE_MISSION_REVEAL",
  "DISPLAYED_MISSIONS_REVEAL",
  "PON_REVEAL",
  "PERSONALITIES_REVEAL",
  "PERSONALITY_RESULTS_REVEAL",
  "SPADARI_RESULT_REVEAL",
  "SCORE_REVEAL",
  "ENDING",
  "FINISHED"
];

export function reduceGameState(state: PonInaiGameState, action: CoreAction): PonInaiGameState {
  switch (action.type) {
    case "ACK_PRIVATE_INFO": {
      if (state.phase !== "PRIVATE_INFO") throw new Error("Not accepting private info acknowledgements");
      if (!state.players.includes(action.playerId)) throw new Error("Unknown player");
      const acks = new Set(state.privateInfoAcks); acks.add(action.playerId);
      return { ...state, privateInfoAcks: acks, phase: acks.size === state.players.length ? "ROUND_SELECT" : state.phase };
    }
    case "LOCK_ROUND_ACTION": {
      if (state.phase !== "ROUND_SELECT") throw new Error("Round action is not open");
      if (state.pendingRoundActions.has(action.playerId)) throw new Error("Round action already locked");
      const player = state.playerStates.get(action.playerId);
      if (!player) throw new Error("Unknown player");
      if (!player.remainingCards.some((c) => c.id === action.action.cardId)) throw new Error("Card is not in remaining hand");
      const pending = new Map(state.pendingRoundActions); pending.set(action.playerId, action.action);
      const next = { ...state, pendingRoundActions: pending };
      return pending.size === state.players.length ? applyRoundResult(next, roundResultFromPending(next)) : next;
    }
    case "ADVANCE_REVEAL": {
      if (state.phase === "CONFIDENCE_REVEAL") return { ...state, phase: "CARD_REVEAL" };
      if (state.phase === "CARD_REVEAL") return { ...state, phase: "ROUND_TALK" };
      throw new Error("No round reveal to advance");
    }
    case "END_ROUND_TALK": {
      if (state.phase !== "ROUND_TALK") throw new Error("Round talk is not active");
      if (state.currentRound === 4) return { ...state, phase: "RETURN" };
      return { ...state, currentRound: (state.currentRound + 1) as 1 | 2 | 3 | 4, phase: "ROUND_SELECT" };
    }
    case "ADVANCE_RETURN": {
      if (state.phase !== "RETURN") throw new Error("Not in return phase");
      return { ...state, phase: "FINAL_DISCUSSION" };
    }
    case "END_FINAL_DISCUSSION": {
      if (state.phase !== "FINAL_DISCUSSION") throw new Error("Final discussion is not active");
      return { ...state, phase: "INITIAL_VOTE" };
    }
    case "LOCK_INITIAL_VOTES": {
      if (state.phase !== "INITIAL_VOTE") throw new Error("Initial vote is not open");
      if (state.initialVotes.has(action.playerId)) throw new Error("Initial vote already locked");
      if (!state.players.includes(action.playerId)) throw new Error("Unknown player");
      if (!state.players.includes(action.votes.spadariPlayerId) || action.votes.spadariPlayerId === action.playerId) throw new Error("Invalid Spadari vote");
      validatePonVoteTarget(state, action.votes.ponVote);
      const votes = new Map(state.initialVotes); votes.set(action.playerId, action.votes);
      const next = { ...state, initialVotes: votes };
      if (votes.size !== state.players.length) return next;
      const ponVotes = new Map([...votes].map(([id, value]) => [id, value.ponVote]));
      const verdict = verdictFromUniqueTop(ponVotes);
      if (verdict) return finalizeVerdict(next, verdict);
      return { ...next, runoffCandidates: topPonVoteTargets(ponVotes), phase: "RUNOFF_DISCUSSION" };
    }
    case "END_RUNOFF_DISCUSSION": {
      if (state.phase !== "RUNOFF_DISCUSSION") throw new Error("Runoff discussion is not active");
      return { ...state, phase: "RUNOFF_VOTE" };
    }
    case "LOCK_RUNOFF_VOTE": {
      if (state.phase !== "RUNOFF_VOTE") throw new Error("Runoff vote is not open");
      if (state.runoffVotes.has(action.playerId)) throw new Error("Runoff vote already locked");
      if (!state.runoffCandidates?.some((candidate) => samePonVote(candidate, action.vote))) throw new Error("Vote is outside runoff candidates");
      const votes = new Map(state.runoffVotes); votes.set(action.playerId, action.vote);
      const next = { ...state, runoffVotes: votes };
      return votes.size === state.players.length ? finalizeVerdict(next, verdictFromRunoff(votes)) : next;
    }
    case "ADVANCE_TRUTH_REVEAL": {
      const index = revealSequence.indexOf(state.phase);
      if (index < 0 || index >= revealSequence.length - 1) throw new Error("Truth reveal cannot advance");
      return { ...state, phase: revealSequence[index + 1]! };
    }
  }
}
