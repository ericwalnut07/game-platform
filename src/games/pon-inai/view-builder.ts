import type { GamePhase, InitialVotes, PonInaiGameState, PonVoteTarget } from "./game-state";
import { getVerdictAccuracy, type VerdictAccuracy } from "./endings";
import type { Mission } from "./missions";
import type { Personality } from "./personalities";
import { buildPublicSummary } from "./public-summary";
import type { Card, Confidence, PlayerId, PublicSummary, RoundNumber } from "./types";

export interface PublicRoundPlayerView {
  playerId: PlayerId;
  confidence: Confidence;
  card?: Card;
}

export interface PublicRoundView {
  round: RoundNumber;
  players: readonly PublicRoundPlayerView[];
}

export interface RevealData {
  verdict?: PonInaiGameState["verdict"];
  missionSuccess?: boolean;
  trueMission?: Mission;
  displayedMissions?: Readonly<Record<PlayerId, Mission>>;
  actualPonPlayerId?: PlayerId | null;
  personalities?: Readonly<Record<PlayerId, Personality>>;
  personalityResults?: Readonly<Record<PlayerId, boolean>>;
  spadariVoteCounts?: Readonly<Record<PlayerId, number>>;
  scoring?: PonInaiGameState["scoring"];
  ending?: PonInaiGameState["ending"];
  initialVotes?: Readonly<Record<PlayerId, InitialVotes>>;
  runoffVotes?: Readonly<Record<PlayerId, PonVoteTarget>>;
  verdictAccuracy?: VerdictAccuracy;
}

export interface PonInaiPlayerView {
  gameId: string;
  gameIndex: number;
  phase: GamePhase;
  currentRound: number;
  me: {
    playerId: PlayerId;
    displayedMission: Mission;
    personality: Personality;
    remainingCards: readonly Card[];
    playedCards: readonly { round: RoundNumber; card: Card }[];
    lockedAction?: { cardId: string; confidence: Confidence };
  };
  publicState: {
    playerIds: readonly PlayerId[];
    rounds: readonly PublicRoundView[];
    summary: PublicSummary;
    runoffCandidates?: readonly PonVoteTarget[];
  };
  revealData?: RevealData;
}

const revealIndex: Readonly<Record<GamePhase, number>> = {
  PRIVATE_INFO: 0,
  ROUND_SELECT: 0,
  CONFIDENCE_REVEAL: 0,
  CARD_REVEAL: 0,
  ROUND_TALK: 0,
  RETURN: 0,
  FINAL_DISCUSSION: 0,
  INITIAL_VOTE: 0,
  RUNOFF_DISCUSSION: 0,
  RUNOFF_VOTE: 0,
  VERDICT_REVEAL: 1,
  MISSION_RESULT_REVEAL: 2,
  TRUE_MISSION_REVEAL: 3,
  DISPLAYED_MISSIONS_REVEAL: 4,
  PON_REVEAL: 5,
  PERSONALITIES_REVEAL: 6,
  PERSONALITY_RESULTS_REVEAL: 7,
  SPADARI_RESULT_REVEAL: 8,
  SCORE_REVEAL: 9,
  ENDING: 10,
  FINISHED: 10
};

function isCurrentRoundCardPublic(phase: GamePhase): boolean {
  return ["CARD_REVEAL", "ROUND_TALK", "RETURN", "FINAL_DISCUSSION", "INITIAL_VOTE", "RUNOFF_DISCUSSION", "RUNOFF_VOTE",
    "VERDICT_REVEAL", "MISSION_RESULT_REVEAL", "TRUE_MISSION_REVEAL", "DISPLAYED_MISSIONS_REVEAL", "PON_REVEAL",
    "PERSONALITIES_REVEAL", "PERSONALITY_RESULTS_REVEAL", "SPADARI_RESULT_REVEAL", "SCORE_REVEAL", "ENDING", "FINISHED"].includes(phase);
}

export function buildPlayerView(state: PonInaiGameState, playerId: PlayerId): PonInaiPlayerView {
  const me = state.playerStates.get(playerId);
  if (!me) throw new Error("Unknown player");

  const currentCardsPublic = isCurrentRoundCardPublic(state.phase);
  const publicRounds: PublicRoundView[] = state.rounds.map((round, index) => {
    const isCurrent = index === state.rounds.length - 1 && round.round === state.currentRound;
    const showCard = !isCurrent || currentCardsPublic;
    return {
      round: round.round,
      players: round.players.map((p) => ({
        playerId: p.playerId,
        confidence: p.confidence,
        ...(showCard ? { card: p.card } : {})
      }))
    };
  });

  const fullyPublicRounds = state.rounds.filter((round, index) => {
    const isCurrent = index === state.rounds.length - 1 && round.round === state.currentRound;
    return !isCurrent || currentCardsPublic;
  });

  const level = revealIndex[state.phase];
  const revealData: RevealData = {};
  if (level >= 1 && state.verdict) revealData.verdict = state.verdict;
  if (level >= 2 && state.missionSuccess !== undefined) revealData.missionSuccess = state.missionSuccess;
  if (level >= 3) revealData.trueMission = state.trueMission;
  if (level >= 4) revealData.displayedMissions = Object.fromEntries([...state.playerStates].map(([id, ps]) => [id, ps.displayedMission]));
  if (level >= 5) revealData.actualPonPlayerId = state.ponPlayerId ?? null;
  if (level >= 6) revealData.personalities = Object.fromEntries([...state.playerStates].map(([id, ps]) => [id, ps.personality]));
  if (level >= 7 && state.scoring) revealData.personalityResults = Object.fromEntries(state.scoring.personalityResults);
  if (level >= 8 && state.scoring) revealData.spadariVoteCounts = Object.fromEntries(state.scoring.spadariVoteCounts);
  if (level >= 9 && state.scoring) revealData.scoring = state.scoring;
  if (level >= 10 && state.ending) revealData.ending = state.ending;
  if (level >= 10) {
    revealData.initialVotes = Object.fromEntries(state.initialVotes);
    revealData.runoffVotes = Object.fromEntries(state.runoffVotes);
    if (state.verdict) revealData.verdictAccuracy = getVerdictAccuracy(state.hasPon, state.ponPlayerId, state.verdict);
  }

  return {
    gameId: state.gameId,
    gameIndex: state.gameIndex,
    phase: state.phase,
    currentRound: state.currentRound,
    me: {
      playerId,
      displayedMission: me.displayedMission,
      personality: me.personality,
      remainingCards: me.remainingCards,
      playedCards: me.playedCards,
      ...(state.pendingRoundActions.get(playerId) ? { lockedAction: state.pendingRoundActions.get(playerId)! } : {})
    },
    publicState: {
      playerIds: state.players,
      rounds: publicRounds,
      summary: buildPublicSummary(fullyPublicRounds),
      ...(state.runoffCandidates && (state.phase === "RUNOFF_DISCUSSION" || state.phase === "RUNOFF_VOTE") ? { runoffCandidates: state.runoffCandidates } : {})
    },
    ...(level > 0 ? { revealData } : {})
  };
}
