import { combinations } from "./combinatorics";
import { canAchieveMissionFromSelections, type SelectionGroups } from "./mission-feasibility";
import type { Mission } from "./missions";
import { isCardBasedPersonality, selectionSatisfiesPersonality, type Personality } from "./personalities";
import type { Card, Color, PlayerCount, PlayerId } from "./types";

export function allowedSelectionsForPersonality(
  personality: Personality,
  hand: readonly Card[],
  activeColors: readonly Color[]
): readonly (readonly Card[])[] {
  const all = combinations(hand, 4);
  if (!isCardBasedPersonality(personality)) return all;
  return all.filter((selection) => selectionSatisfiesPersonality(personality, hand, selection, activeColors));
}

export function canJointlyAchievePersonalitiesAndMission(
  mission: Mission,
  playerCount: PlayerCount,
  hands: ReadonlyMap<PlayerId, readonly Card[]>,
  personalities: ReadonlyMap<PlayerId, Personality>,
  activeColors: readonly Color[]
): boolean {
  const groups: SelectionGroups = new Map(
    [...hands.entries()].map(([playerId, hand]) => [
      playerId,
      allowedSelectionsForPersonality(personalities.get(playerId)!, hand, activeColors)
    ])
  );
  return canAchieveMissionFromSelections(mission, playerCount, [...hands.keys()], groups);
}
