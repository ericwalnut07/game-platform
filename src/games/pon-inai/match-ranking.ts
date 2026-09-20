import type { PlayerId } from "./types";

export interface PlayerMatchStats {
  playerId: PlayerId;
  totalScore: number;
  totalSpadariVotes: number;
  correctInitialPonVotes: number;
}

export interface MatchRankEntry extends PlayerMatchStats {
  rank: number;
}

export function rankMatch(stats: readonly PlayerMatchStats[]): MatchRankEntry[] {
  if (stats.length === 0) return [];
  const topScore = Math.max(...stats.map((s) => s.totalScore));
  const topGroup = stats.filter((s) => s.totalScore === topScore);
  const others = stats.filter((s) => s.totalScore !== topScore);

  const orderedTop = [...topGroup].sort((a, b) =>
    b.totalSpadariVotes - a.totalSpadariVotes
    || b.correctInitialPonVotes - a.correctInitialPonVotes
  );

  const entries: MatchRankEntry[] = [];
  let previousTop: PlayerMatchStats | undefined;
  let previousRank = 0;
  orderedTop.forEach((s, index) => {
    const tied = previousTop
      && previousTop.totalSpadariVotes === s.totalSpadariVotes
      && previousTop.correctInitialPonVotes === s.correctInitialPonVotes;
    const rank = tied ? previousRank : index + 1;
    entries.push({ ...s, rank });
    previousTop = s;
    previousRank = rank;
  });

  const consumedPositions = topGroup.length;
  const scoreGroups = new Map<number, PlayerMatchStats[]>();
  for (const s of others) {
    const group = scoreGroups.get(s.totalScore) ?? [];
    group.push(s);
    scoreGroups.set(s.totalScore, group);
  }
  let position = consumedPositions + 1;
  for (const score of [...scoreGroups.keys()].sort((a, b) => b - a)) {
    const group = scoreGroups.get(score)!;
    for (const s of group) entries.push({ ...s, rank: position });
    position += group.length;
  }

  return entries.sort((a, b) => a.rank - b.rank || b.totalScore - a.totalScore || a.playerId.localeCompare(b.playerId));
}
