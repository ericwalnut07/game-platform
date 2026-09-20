import type { FalseMissionRelation } from "./false-mission";
import type { Mission, MissionCategory } from "./missions";
import type { Personality } from "./personalities";
import type { Card, Confidence, PlayerCount, PlayerId, RoundResult } from "./types";

export type PonVoteTarget =
  | { type: "PLAYER"; playerId: PlayerId }
  | { type: "NO_PON" };

export interface InitialVotes {
  spadariPlayerId: PlayerId;
  ponVote: PonVoteTarget;
}

export interface PlayerGameState {
  playerId: PlayerId;
  initialHand: readonly Card[];
  remainingCards: readonly Card[];
  playedCards: readonly { round: 1 | 2 | 3 | 4; card: Card }[];
  displayedMission: Mission;
  personality: Personality;
  confidenceHistory: readonly Confidence[];
  initialVotes?: InitialVotes;
  runoffPonVote?: PonVoteTarget;
}

export type GamePhase =
  | "PRIVATE_INFO"
  | "ROUND_SELECT"
  | "CONFIDENCE_REVEAL"
  | "CARD_REVEAL"
  | "ROUND_TALK"
  | "RETURN"
  | "FINAL_DISCUSSION"
  | "INITIAL_VOTE"
  | "RUNOFF_DISCUSSION"
  | "RUNOFF_VOTE"
  | "VERDICT_REVEAL"
  | "MISSION_RESULT_REVEAL"
  | "TRUE_MISSION_REVEAL"
  | "DISPLAYED_MISSIONS_REVEAL"
  | "PON_REVEAL"
  | "PERSONALITIES_REVEAL"
  | "PERSONALITY_RESULTS_REVEAL"
  | "SPADARI_RESULT_REVEAL"
  | "SCORE_REVEAL"
  | "ENDING"
  | "FINISHED";

export interface GameSetup {
  playerCount: PlayerCount;
  activeColors: readonly ("RED" | "BLUE" | "GREEN" | "YELLOW")[];
  hands: ReadonlyMap<PlayerId, readonly Card[]>;
  hasPon: boolean;
  ponPlayerId?: PlayerId;
  trueMission: Mission;
  falseMission?: Mission;
  falseMissionRelation?: FalseMissionRelation;
  playerStates: ReadonlyMap<PlayerId, PlayerGameState>;
  missionCategory: MissionCategory;
}

export interface LockedRoundAction {
  cardId: string;
  confidence: Confidence;
}

export type TrialVerdict =
  | { type: "PLAYER"; playerId: PlayerId }
  | { type: "NO_PON" }
  | { type: "UNDECIDED" };

export interface PonInaiGameState extends GameSetup {
  gameId: string;
  gameIndex: number;
  players: readonly PlayerId[];
  phase: GamePhase;
  currentRound: 1 | 2 | 3 | 4;
  rounds: readonly RoundResult[];
  privateInfoAcks: ReadonlySet<PlayerId>;
  pendingRoundActions: ReadonlyMap<PlayerId, LockedRoundAction>;
  initialVotes: ReadonlyMap<PlayerId, InitialVotes>;
  runoffVotes: ReadonlyMap<PlayerId, PonVoteTarget>;
  runoffCandidates?: readonly PonVoteTarget[];
  verdict?: TrialVerdict;
  missionSuccess?: boolean;
  scoring?: import("./scoring").GameScoringResult;
  ending?: import("./endings").EndingId;
}
