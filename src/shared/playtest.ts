export interface PlaytestFeedback {
  suspectedSelf: boolean;
  selfSuspicionRound: 1 | 2 | 3 | 4 | null;
  trialSuspectPlayerIds: readonly string[];
  singleObviousSuspect: boolean;
  summaryUsefulness: 1 | 2 | 3 | 4 | 5;
  funRating: 1 | 2 | 3 | 4 | 5;
  rulesClarity: 1 | 2 | 3 | 4 | 5;
  comment: string;
}
