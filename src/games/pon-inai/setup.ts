import { dealHands } from "./dealing";
import { hasRecoverableTwoCardPrefix, listFalseMissionCandidates, type FalseMissionCandidate } from "./false-mission";
import type { GameSetup, PlayerGameState } from "./game-state";
import { canAchieveMission } from "./mission-feasibility";
import { createConcreteMissionLibrary } from "./mission-library";
import { evaluateMissionPersonalityConflict } from "./mission-personality-conflict";
import { evaluateHelpfulAlignment } from "./mission-personality-fit";
import { getMissionCategory, type Mission, type MissionCategory } from "./missions";
import { canJointlyAchievePersonalitiesAndMission } from "./personality-feasibility";
import { canAchievePersonality, listPersonalityCandidates, type Personality } from "./personalities";
import type { RandomSource } from "./random";
import { weightedChoice } from "./random";
import type { PlayerCount, PlayerId, PlayerRef } from "./types";
import { getActiveColors } from "./types";

export const MAX_SETUP_ATTEMPTS = 500;

export class SetupGenerationError extends Error {}

function choosePonState(players: readonly PlayerId[], rng: RandomSource): { hasPon: boolean; ponPlayerId?: PlayerId } {
  const states = [undefined, ...players] as const;
  const chosen = states[rng.integer(0, states.length - 1)];
  return chosen === undefined ? { hasPon: false } : { hasPon: true, ponPlayerId: chosen };
}

function chooseTrueMission(
  feasible: readonly Mission[],
  previousCategory: MissionCategory | undefined,
  rng: RandomSource
): Mission {
  const categories = (["NUMBER", "COLOR", "COLOR_NUMBER", "ROUND_PROGRESS"] as const)
    .filter((category) => feasible.some((mission) => getMissionCategory(mission) === category));
  const category = weightedChoice(rng, categories.map((value) => ({
    value,
    weight: previousCategory === undefined ? 25 : value === previousCategory ? 10 : 30
  })));
  const inCategory = feasible.filter((mission) => getMissionCategory(mission) === category);
  const types = [...new Set(inCategory.map((mission) => mission.type))];
  const type = types[rng.integer(0, types.length - 1)]!;
  const concrete = inCategory.filter((mission) => mission.type === type);
  return concrete[rng.integer(0, concrete.length - 1)]!;
}

function chooseRecoverableFalseMission(
  trueMission: Mission,
  library: readonly Mission[],
  playerCount: PlayerCount,
  hands: ReadonlyMap<PlayerId, readonly import("./types").Card[]>,
  ponPlayerId: PlayerId,
  rng: RandomSource
): FalseMissionCandidate | null {
  const candidates = listFalseMissionCandidates(trueMission, library, playerCount, hands)
    .filter((candidate) => hasRecoverableTwoCardPrefix(trueMission, candidate.mission, playerCount, hands, ponPlayerId));
  if (candidates.length === 0) return null;
  const relations = (["SIMILAR", "PARTIAL", "OPPOSING"] as const).filter((relation) => candidates.some((c) => c.relation === relation));
  const weights = { SIMILAR: 15, PARTIAL: 60, OPPOSING: 25 } as const;
  const relation = weightedChoice(rng, relations.map((value) => ({ value, weight: weights[value] })));
  const pool = candidates.filter((c) => c.relation === relation);
  return pool[rng.integer(0, pool.length - 1)]!;
}

function choosePersonalities(
  players: readonly PlayerId[],
  hands: ReadonlyMap<PlayerId, readonly import("./types").Card[]>,
  displayedMissions: ReadonlyMap<PlayerId, Mission>,
  trueMission: Mission,
  playerCount: PlayerCount,
  rng: RandomSource
): ReadonlyMap<PlayerId, Personality> | null {
  const activeColors = getActiveColors(playerCount);
  const all = listPersonalityCandidates(activeColors);
  const candidateMap = new Map<PlayerId, Personality[]>();
  for (const playerId of players) {
    const hand = hands.get(playerId)!;
    const displayed = displayedMissions.get(playerId)!;
    const candidates = all.filter((personality) =>
      canAchievePersonality(personality, hand, activeColors)
      && evaluateMissionPersonalityConflict(displayed, personality, hand) !== "STRONG"
      && evaluateHelpfulAlignment(trueMission, personality) !== "TOO_HELPFUL"
    );
    if (candidates.length === 0) return null;
    candidateMap.set(playerId, candidates);
  }

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const chosen = new Map<PlayerId, Personality>();
    for (const playerId of players) {
      const pool = candidateMap.get(playerId)!;
      chosen.set(playerId, pool[rng.integer(0, pool.length - 1)]!);
    }
    if (canJointlyAchievePersonalitiesAndMission(trueMission, playerCount, hands, chosen, activeColors)) return chosen;
  }
  return null;
}

export function createGameSetup(
  playerRefs: readonly PlayerRef[],
  rng: RandomSource,
  previousCategory?: MissionCategory
): GameSetup {
  const playerCount = playerRefs.length as PlayerCount;
  if (playerCount !== 3 && playerCount !== 4) throw new Error("ポンはいない supports exactly 3 or 4 players");
  const players = playerRefs.map((p) => p.id);
  const ponState = choosePonState(players, rng); // preserved across setup retries
  const library = createConcreteMissionLibrary(playerCount);
  const activeColors = getActiveColors(playerCount);

  for (let attempt = 0; attempt < MAX_SETUP_ATTEMPTS; attempt += 1) {
    const { hands } = dealHands(players, playerCount, rng);
    const feasible = library.filter((mission) => canAchieveMission(mission, playerCount, hands));
    if (feasible.length === 0) continue;
    const trueMission = chooseTrueMission(feasible, previousCategory, rng);

    let falseCandidate: FalseMissionCandidate | undefined;
    if (ponState.hasPon) {
      falseCandidate = chooseRecoverableFalseMission(trueMission, library, playerCount, hands, ponState.ponPlayerId!, rng) ?? undefined;
      if (!falseCandidate) continue;
    }

    const displayedMissions = new Map<PlayerId, Mission>();
    for (const playerId of players) {
      displayedMissions.set(playerId, ponState.hasPon && playerId === ponState.ponPlayerId ? falseCandidate!.mission : trueMission);
    }

    const personalities = choosePersonalities(players, hands, displayedMissions, trueMission, playerCount, rng);
    if (!personalities) continue;

    const playerStates = new Map<PlayerId, PlayerGameState>();
    for (const playerId of players) {
      const hand = hands.get(playerId)!;
      playerStates.set(playerId, {
        playerId,
        initialHand: hand,
        remainingCards: hand,
        playedCards: [],
        displayedMission: displayedMissions.get(playerId)!,
        personality: personalities.get(playerId)!,
        confidenceHistory: []
      });
    }

    return {
      playerCount,
      activeColors,
      hands,
      hasPon: ponState.hasPon,
      ...(ponState.ponPlayerId ? { ponPlayerId: ponState.ponPlayerId } : {}),
      trueMission,
      ...(falseCandidate ? { falseMission: falseCandidate.mission, falseMissionRelation: falseCandidate.relation } : {}),
      playerStates,
      missionCategory: getMissionCategory(trueMission)
    };
  }

  throw new SetupGenerationError(`Failed to create a valid setup after ${MAX_SETUP_ATTEMPTS} attempts`);
}
