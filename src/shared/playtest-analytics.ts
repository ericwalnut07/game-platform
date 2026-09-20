export interface PlaytestOverview {
  gameCount: number;
  matchCount: number;
  missionSuccessRate: number;
  verdictCorrectRate: number;
  undecidedRate: number;
  ponPresenceRate: number;
  averageGameDurationSeconds: number | null;
  feedbackCount: number;
  averageSummaryUsefulness: number | null;
  averageFunRating: number | null;
  selfSuspicionRate: number | null;
  singleObviousSuspectRate: number | null;
}

export interface PlaytestBreakdownRow {
  key: string;
  games: number;
  missionSuccessRate: number;
  verdictCorrectRate: number;
  undecidedRate: number;
}

export interface PersonalityBreakdownRow {
  personalityType: string;
  samples: number;
  successRate: number;
  averageScore: number;
}

export interface SelfSuspicionRoundRow {
  round: 1 | 2 | 3 | 4;
  count: number;
}

export interface PlaytestAnalytics {
  generatedAt: number;
  overview: PlaytestOverview;
  byPlayerCount: readonly PlaytestBreakdownRow[];
  byFalseRelation: readonly PlaytestBreakdownRow[];
  byMission: readonly PlaytestBreakdownRow[];
  personalities: readonly PersonalityBreakdownRow[];
  selfSuspicionRounds: readonly SelfSuspicionRoundRow[];
}
