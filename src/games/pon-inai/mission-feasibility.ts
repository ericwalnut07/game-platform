import { combinations, permutations } from "./combinatorics";
import type { Mission } from "./missions";
import type { Card, Color, PlayerCount, PlayerId } from "./types";
import { CARD_NUMBERS, getActiveColors } from "./types";

export type SelectionGroups = ReadonlyMap<PlayerId, readonly (readonly Card[])[]>;

function dpScalar(
  groups: readonly (readonly (readonly Card[])[])[],
  contribution: (selection: readonly Card[]) => number,
  cap?: number
): Set<number> {
  let states = new Set<number>([0]);
  for (const group of groups) {
    const values = [...new Set(group.map(contribution))];
    const next = new Set<number>();
    for (const state of states) for (const value of values) next.add(cap === undefined ? state + value : Math.min(cap, state + value));
    states = next;
  }
  return states;
}

function dpVector(
  groups: readonly (readonly (readonly Card[])[])[],
  contribution: (selection: readonly Card[]) => readonly number[],
  caps?: readonly number[]
): Set<string> {
  let states = new Set<string>([""]);
  let dimensions = 0;
  for (let gi = 0; gi < groups.length; gi += 1) {
    const vectors = [...new Set(groups[gi]!.map((selection) => contribution(selection).join(",")))].map((s) => s.split(",").map(Number));
    if (gi === 0) dimensions = vectors[0]?.length ?? 0;
    const next = new Set<string>();
    for (const stateKey of states) {
      const state = stateKey === "" ? new Array(dimensions).fill(0) : stateKey.split(",").map(Number);
      for (const vector of vectors) {
        const sum = state.map((v, i) => {
          const raw = v + (vector[i] ?? 0);
          return caps ? Math.min(caps[i]!, raw) : raw;
        });
        next.add(sum.join(","));
      }
    }
    states = next;
  }
  return states;
}

function dpBitmask(
  groups: readonly (readonly (readonly Card[])[])[],
  contribution: (selection: readonly Card[]) => number,
  requiredMask: number
): boolean {
  let states = new Set<number>([0]);
  for (const group of groups) {
    const values = [...new Set(group.map(contribution))];
    const next = new Set<number>();
    for (const state of states) for (const value of values) next.add(state | value);
    states = next;
  }
  return [...states].some((mask) => (mask & requiredMask) === requiredMask);
}

function uniqueNumberSequences(selectionGroup: readonly (readonly Card[])[]): readonly [number, number, number, number][] {
  const seen = new Set<string>();
  const out: [number, number, number, number][] = [];
  for (const selection of selectionGroup) {
    for (const sequence of permutations(selection)) {
      const tuple = sequence.map((c) => c.number) as [number, number, number, number];
      const key = tuple.join(",");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(tuple);
      }
    }
  }
  return out;
}

function canAchieveNumericProgression(
  mission: Extract<Mission, { type: "OUTPUT_RISE" | "STABLE_NAVIGATION" }>,
  groups: readonly (readonly (readonly Card[])[])[]
): boolean {
  let states = new Set<string>(["0,0,0,0"]);
  for (const group of groups) {
    const seqs = uniqueNumberSequences(group);
    const next = new Set<string>();
    for (const state of states) {
      const base = state.split(",").map(Number);
      for (const seq of seqs) next.add(base.map((v, i) => v + seq[i]!).join(","));
    }
    states = next;
  }

  for (const state of states) {
    const sums = state.split(",").map(Number);
    if (mission.type === "OUTPUT_RISE") {
      let increases = 0;
      for (let i = 1; i < sums.length; i += 1) if (sums[i]! > sums[i - 1]!) increases += 1;
      if (increases >= mission.minimumIncreasingTransitions) return true;
    } else if (Math.max(...sums) - Math.min(...sums) <= mission.maxRange) return true;
  }
  return false;
}

function canAchieveColorSync(playerIds: readonly PlayerId[], selectionGroups: SelectionGroups, activeColors: readonly Color[]): boolean {
  return activeColors.some((color) => playerIds.every((id) => selectionGroups.get(id)!.some((s) => s.some((c) => c.color === color))));
}

function canAchieveColorRotation(playerIds: readonly PlayerId[], selectionGroups: SelectionGroups, activeColors: readonly Color[]): boolean {
  for (const colors of combinations(activeColors, 3)) {
    if (playerIds.every((id) => selectionGroups.get(id)!.some((selection) => colors.every((color) => selection.some((c) => c.color === color))))) return true;
  }
  return false;
}

export function canAchieveMissionFromSelections(
  mission: Mission,
  playerCount: PlayerCount,
  playerIds: readonly PlayerId[],
  selectionGroups: SelectionGroups
): boolean {
  const groups = playerIds.map((id) => selectionGroups.get(id) ?? []);
  if (groups.some((g) => g.length === 0)) return false;
  const activeColors = getActiveColors(playerCount);

  switch (mission.type) {
    case "AVERAGE_OUTPUT": {
      const totalCards = playerCount * 4;
      const sums = dpScalar(groups, (s) => s.reduce((a, c) => a + c.number, 0));
      return [...sums].some((sum) => sum / totalCards >= mission.min && sum / totalCards <= mission.max);
    }
    case "HIGH_LOW_BALANCE": {
      const target = playerCount * 2;
      return dpScalar(groups, (s) => s.filter((c) => c.number <= 2).length).has(target);
    }
    case "TARGET_NUMBER": {
      const states = dpScalar(groups, (s) => s.filter((c) => c.number === mission.number).length, mission.minimumCount);
      return states.has(mission.minimumCount);
    }
    case "ALL_NUMBERS": {
      const caps = CARD_NUMBERS.map(() => mission.minimumEach);
      const states = dpVector(groups, (s) => CARD_NUMBERS.map((n) => s.filter((c) => c.number === n).length), caps);
      return states.has(caps.join(","));
    }
    case "PUSH_COLOR": {
      const states = dpScalar(groups, (s) => s.filter((c) => c.color === mission.color).length, mission.minimumCount);
      return states.has(mission.minimumCount);
    }
    case "RAINBOW": {
      const caps = activeColors.map(() => mission.minimumEach);
      const states = dpVector(groups, (s) => activeColors.map((color) => s.filter((c) => c.color === color).length), caps);
      return states.has(caps.join(","));
    }
    case "COLOR_BALANCE": {
      const states = dpVector(groups, (s) => activeColors.map((color) => s.filter((c) => c.color === color).length));
      return [...states].some((key) => {
        const counts = key.split(",").map(Number);
        return Math.max(...counts) - Math.min(...counts) <= mission.maxDifference;
      });
    }
    case "COLOR_SYNC": return canAchieveColorSync(playerIds, selectionGroups, activeColors);
    case "COLOR_OUTPUT": {
      const states = dpScalar(groups, (s) => s.filter((c) => c.color === mission.color).reduce((a, c) => a + c.number, 0));
      return [...states].some((sum) => sum >= mission.minSum && sum <= mission.maxSum);
    }
    case "COLOR_COMPLETE": {
      return dpBitmask(groups, (s) => s.reduce((mask, c) => c.color === mission.color ? mask | (1 << (c.number - 1)) : mask, 0), 0b1111);
    }
    case "NUMBER_CROSS": {
      const index = new Map(activeColors.map((color, i) => [color, i]));
      const required = (1 << activeColors.length) - 1;
      return dpBitmask(groups, (s) => s.reduce((mask, c) => c.number === mission.number ? mask | (1 << index.get(c.color)!) : mask, 0), required);
    }
    case "ROUTE_CODE": {
      const required = (1 << mission.pairs.length) - 1;
      return dpBitmask(groups, (s) => s.reduce((mask, c) => {
        const i = mission.pairs.findIndex((p) => p.color === c.color && p.number === c.number);
        return i >= 0 ? mask | (1 << i) : mask;
      }, 0), required);
    }
    case "OUTPUT_RISE":
    case "STABLE_NAVIGATION": return canAchieveNumericProgression(mission, groups);
    case "COLOR_ROTATION": return canAchieveColorRotation(playerIds, selectionGroups, activeColors);
  }
}

function hasStandardBaseGuarantee(playerCount: PlayerCount, hands: ReadonlyMap<PlayerId, readonly Card[]>): boolean {
  const pooled = [...hands.values()].flat();
  return getActiveColors(playerCount).every((color) =>
    CARD_NUMBERS.every((number) => pooled.some((card) => card.copy === 1 && card.color === color && card.number === number))
  );
}

export function canAchieveMission(mission: Mission, playerCount: PlayerCount, hands: ReadonlyMap<PlayerId, readonly Card[]>): boolean {
  // Standard deal contains the complete copy-1 color×number grid. That grid alone
  // provides a constructive solution for every mission except quota missions that
  // require a fifth (or fourth in 3p TARGET_NUMBER) duplicate. Avoiding generic DP
  // here makes setup generation fast while preserving exactness for standard games.
  if (hasStandardBaseGuarantee(playerCount, hands)) {
    const pooled = [...hands.values()].flat();
    if (mission.type === "TARGET_NUMBER") {
      return pooled.filter((card) => card.number === mission.number).length >= mission.minimumCount;
    }
    if (mission.type === "PUSH_COLOR") {
      return pooled.filter((card) => card.color === mission.color).length >= mission.minimumCount;
    }
    return true;
  }

  const groups = new Map<PlayerId, readonly (readonly Card[])[]>();
  for (const [id, hand] of hands) groups.set(id, combinations(hand, 4));
  return canAchieveMissionFromSelections(mission, playerCount, [...hands.keys()], groups);
}

export function canAchieveAfterLockedCards(
  mission: Mission,
  playerCount: PlayerCount,
  hands: ReadonlyMap<PlayerId, readonly Card[]>,
  lockedCards: ReadonlyMap<PlayerId, readonly Card[]>
): boolean {
  const groups = new Map<PlayerId, readonly (readonly Card[])[]>();
  for (const [id, hand] of hands) {
    const locked = lockedCards.get(id) ?? [];
    const lockedIds = new Set(locked.map((c) => c.id));
    const remaining = hand.filter((c) => !lockedIds.has(c.id));
    const need = 4 - locked.length;
    if (need < 0) return false;
    groups.set(id, combinations(remaining, need).map((extra) => [...locked, ...extra]));
  }
  return canAchieveMissionFromSelections(mission, playerCount, [...hands.keys()], groups);
}
