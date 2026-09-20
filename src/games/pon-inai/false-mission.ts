import { canAchieveAfterLockedCards, canAchieveMission } from "./mission-feasibility";
import { missionKey } from "./mission-library";
import type { Mission } from "./missions";
import type { RandomSource } from "./random";
import { weightedChoice } from "./random";
import type { Card, PlayerCount, PlayerId } from "./types";

export type FalseMissionRelation = "SIMILAR" | "PARTIAL" | "OPPOSING";

function routeDifferenceCount(a: Extract<Mission, { type: "ROUTE_CODE" }>, b: Extract<Mission, { type: "ROUTE_CODE" }>): number {
  const byNumber = new Map(b.pairs.map((p) => [p.number, p.color]));
  return a.pairs.filter((p) => byNumber.get(p.number) !== p.color).length;
}

export function classifyFalseMissionPair(
  trueMission: Mission,
  falseMission: Mission,
  playerCount: PlayerCount
): FalseMissionRelation | null {
  if (missionKey(trueMission) === missionKey(falseMission)) return null;

  switch (trueMission.type) {
    case "AVERAGE_OUTPUT":
      if (falseMission.type === "HIGH_LOW_BALANCE") return "SIMILAR";
      if (falseMission.type === "ALL_NUMBERS") return "PARTIAL";
      if (falseMission.type === "TARGET_NUMBER") return falseMission.number === 2 || falseMission.number === 3 ? "PARTIAL" : "OPPOSING";
      return null;
    case "HIGH_LOW_BALANCE":
      if (falseMission.type === "AVERAGE_OUTPUT") return "SIMILAR";
      if (falseMission.type === "ALL_NUMBERS") return "PARTIAL";
      if (falseMission.type === "TARGET_NUMBER") return "OPPOSING";
      return null;
    case "TARGET_NUMBER":
      if (falseMission.type === "NUMBER_CROSS" && falseMission.number === trueMission.number) return "PARTIAL";
      if (falseMission.type === "ALL_NUMBERS") return "PARTIAL";
      if (falseMission.type === "TARGET_NUMBER" && falseMission.number !== trueMission.number) return "OPPOSING";
      return null;
    case "ALL_NUMBERS":
      if (falseMission.type === "HIGH_LOW_BALANCE" || falseMission.type === "COLOR_COMPLETE") return "PARTIAL";
      if (falseMission.type === "TARGET_NUMBER") return "OPPOSING";
      return null;
    case "PUSH_COLOR":
      if (falseMission.type === "COLOR_OUTPUT" && falseMission.color === trueMission.color) return "PARTIAL";
      if (falseMission.type === "COLOR_COMPLETE" && falseMission.color === trueMission.color) return "PARTIAL";
      if (falseMission.type === "PUSH_COLOR" && falseMission.color !== trueMission.color) return "OPPOSING";
      if (falseMission.type === "RAINBOW" || falseMission.type === "COLOR_BALANCE") return "OPPOSING";
      return null;
    case "RAINBOW":
      if (falseMission.type === "COLOR_BALANCE") return "SIMILAR";
      if (falseMission.type === "COLOR_ROTATION") return "PARTIAL";
      if (falseMission.type === "PUSH_COLOR") return "OPPOSING";
      return null;
    case "COLOR_BALANCE":
      if (falseMission.type === "RAINBOW") return "SIMILAR";
      if (falseMission.type === "COLOR_ROTATION") return "PARTIAL";
      if (falseMission.type === "PUSH_COLOR") return "OPPOSING";
      return null;
    case "COLOR_SYNC":
      return falseMission.type === "COLOR_ROTATION" ? "PARTIAL" : null;
    case "COLOR_OUTPUT":
      if (falseMission.type === "COLOR_COMPLETE" && falseMission.color === trueMission.color) return "SIMILAR";
      if (falseMission.type === "PUSH_COLOR" && falseMission.color === trueMission.color) return "PARTIAL";
      if (falseMission.type === "COLOR_OUTPUT" && falseMission.color !== trueMission.color) return "OPPOSING";
      return null;
    case "COLOR_COMPLETE":
      if (falseMission.type === "COLOR_OUTPUT" && falseMission.color === trueMission.color) return "PARTIAL";
      if (falseMission.type === "PUSH_COLOR" && falseMission.color === trueMission.color) return "PARTIAL";
      if (falseMission.type === "ALL_NUMBERS") return "PARTIAL";
      if (falseMission.type === "COLOR_COMPLETE" && falseMission.color !== trueMission.color) return "OPPOSING";
      return null;
    case "NUMBER_CROSS":
      if (falseMission.type === "TARGET_NUMBER" && falseMission.number === trueMission.number) return "PARTIAL";
      if (falseMission.type === "NUMBER_CROSS" && falseMission.number !== trueMission.number) return "OPPOSING";
      return null;
    case "ROUTE_CODE":
      if (falseMission.type !== "ROUTE_CODE") return null;
      const diff = routeDifferenceCount(trueMission, falseMission);
      if (playerCount === 3) {
        if (diff === 1) return "SIMILAR";
        if (diff === 2) return "PARTIAL";
        if (diff >= 3) return "OPPOSING";
      } else {
        if (diff === 2) return "SIMILAR";
        if (diff === 3) return "PARTIAL";
        if (diff === 4) return "OPPOSING";
      }
      return null;
    case "OUTPUT_RISE":
      return falseMission.type === "STABLE_NAVIGATION" ? "SIMILAR" : null;
    case "STABLE_NAVIGATION":
      return falseMission.type === "OUTPUT_RISE" ? "SIMILAR" : null;
    case "COLOR_ROTATION":
      if (falseMission.type === "RAINBOW" || falseMission.type === "COLOR_BALANCE" || falseMission.type === "COLOR_SYNC") return "PARTIAL";
      if (falseMission.type === "PUSH_COLOR") return "OPPOSING";
      return null;
  }
}

export interface FalseMissionCandidate {
  mission: Mission;
  relation: FalseMissionRelation;
}

export function listFalseMissionCandidates(
  trueMission: Mission,
  missionLibrary: readonly Mission[],
  playerCount: PlayerCount,
  hands: ReadonlyMap<PlayerId, readonly Card[]>
): FalseMissionCandidate[] {
  const out: FalseMissionCandidate[] = [];
  for (const mission of missionLibrary) {
    const relation = classifyFalseMissionPair(trueMission, mission, playerCount);
    if (!relation) continue;
    if (!canAchieveMission(mission, playerCount, hands)) continue;
    out.push({ mission, relation });
  }
  return out;
}

export function chooseFalseMission(
  trueMission: Mission,
  missionLibrary: readonly Mission[],
  playerCount: PlayerCount,
  hands: ReadonlyMap<PlayerId, readonly Card[]>,
  rng: RandomSource
): FalseMissionCandidate | null {
  const candidates = listFalseMissionCandidates(trueMission, missionLibrary, playerCount, hands);
  if (candidates.length === 0) return null;
  const availableRelations = (["SIMILAR", "PARTIAL", "OPPOSING"] as const)
    .filter((relation) => candidates.some((c) => c.relation === relation));
  const weight = { SIMILAR: 15, PARTIAL: 60, OPPOSING: 25 } as const;
  const relation = weightedChoice(rng, availableRelations.map((value) => ({ value, weight: weight[value] })));
  const pool = candidates.filter((c) => c.relation === relation);
  return pool[rng.integer(0, pool.length - 1)]!;
}

export function hasRecoverableTwoCardPrefix(
  trueMission: Mission,
  falseMission: Mission,
  playerCount: PlayerCount,
  hands: ReadonlyMap<PlayerId, readonly Card[]>,
  ponPlayerId: PlayerId
): boolean {
  const hand = hands.get(ponPlayerId);
  if (!hand) return false;
  // A prefix is treated as plausibly false-following when fixing those two cards still
  // leaves the false mission achievable. At least one such prefix must also leave the
  // true mission achievable, which prevents an unavoidable early dead-end.
  const expensiveProgression = new Set(["OUTPUT_RISE", "STABLE_NAVIGATION", "COLOR_ROTATION"]);
  // These progression pairs do not consume a unique required card. Their detailed
  // round-order recoverability is checked later by the state/simulation layer; setup
  // avoids an expensive four-round ordering DP for every candidate prefix.
  if (expensiveProgression.has(trueMission.type) || expensiveProgression.has(falseMission.type)) return true;

  for (let i = 0; i < hand.length; i += 1) {
    for (let j = i + 1; j < hand.length; j += 1) {
      const prefix = [hand[i]!, hand[j]!] as const;
      const locked = new Map<PlayerId, readonly Card[]>([[ponPlayerId, prefix]]);
      if (!canAchieveAfterLockedCards(falseMission, playerCount, hands, locked)) continue;
      if (canAchieveAfterLockedCards(trueMission, playerCount, hands, locked)) return true;
    }
  }
  return false;
}
