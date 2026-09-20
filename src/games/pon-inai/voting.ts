import type { PonVoteTarget, TrialVerdict } from "./game-state";
import type { PlayerId } from "./types";

export function ponVoteKey(vote: PonVoteTarget): string {
  return vote.type === "NO_PON" ? "NO_PON" : `PLAYER:${vote.playerId}`;
}

export function tallyPonVotes(votes: ReadonlyMap<PlayerId, PonVoteTarget>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const vote of votes.values()) {
    const key = ponVoteKey(vote);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function topPonVoteTargets(votes: ReadonlyMap<PlayerId, PonVoteTarget>): PonVoteTarget[] {
  const byKey = new Map<string, PonVoteTarget>();
  for (const vote of votes.values()) byKey.set(ponVoteKey(vote), vote);
  const counts = tallyPonVotes(votes);
  const max = Math.max(...counts.values());
  return [...counts.entries()].filter(([, count]) => count === max).map(([key]) => byKey.get(key)!);
}

export function verdictFromUniqueTop(votes: ReadonlyMap<PlayerId, PonVoteTarget>): TrialVerdict | null {
  const top = topPonVoteTargets(votes);
  if (top.length !== 1) return null;
  const winner = top[0]!;
  return winner.type === "NO_PON" ? { type: "NO_PON" } : { type: "PLAYER", playerId: winner.playerId };
}

export function verdictFromRunoff(votes: ReadonlyMap<PlayerId, PonVoteTarget>): TrialVerdict {
  return verdictFromUniqueTop(votes) ?? { type: "UNDECIDED" };
}
