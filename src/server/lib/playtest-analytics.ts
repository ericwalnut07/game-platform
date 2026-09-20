import type {
  PersonalityBreakdownRow,
  PlaytestAnalytics,
  PlaytestBreakdownRow,
  PlaytestOverview,
  SelfSuspicionRoundRow
} from "../../shared/playtest-analytics";

type Numberish = number | string | null | undefined;

function number(value: Numberish): number {
  if (value === null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: Numberish): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value: Numberish): number {
  return Math.round(number(value) * 1000) / 10;
}

async function queryAll<T>(db: D1Database, sql: string): Promise<T[]> {
  const result = await db.prepare(sql).all<T>();
  return result.results ?? [];
}

export async function loadPlaytestAnalytics(db: D1Database): Promise<PlaytestAnalytics> {
  const overviewRow = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM playtest_games) AS game_count,
      (SELECT COUNT(*) FROM playtest_matches WHERE finished_at IS NOT NULL AND COALESCE(ended_reason, 'COMPLETED') = 'COMPLETED') AS match_count,
      AVG(g.mission_success * 1.0) AS mission_success_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END) AS verdict_correct_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END) AS undecided_rate,
      AVG(g.has_pon * 1.0) AS pon_presence_rate,
      AVG(CASE WHEN start_event.started_at IS NOT NULL THEN (g.recorded_at - start_event.started_at) / 1000.0 END) AS average_duration_seconds,
      (SELECT COUNT(*) FROM playtest_feedback) AS feedback_count,
      (SELECT AVG(summary_usefulness * 1.0) FROM playtest_feedback) AS summary_usefulness,
      (SELECT AVG(fun_rating * 1.0) FROM playtest_feedback) AS fun_rating,
      (SELECT AVG(suspected_self * 1.0) FROM playtest_feedback) AS self_suspicion_rate,
      (SELECT AVG(single_obvious_suspect * 1.0) FROM playtest_feedback) AS single_obvious_suspect_rate
    FROM playtest_games g
    LEFT JOIN (
      SELECT game_id, MIN(created_at) AS started_at
      FROM playtest_events
      WHERE event_type IN ('MATCH_STARTED', 'GAME_STARTED')
      GROUP BY game_id
    ) start_event ON start_event.game_id = g.game_id
  `).first<Record<string, Numberish>>();

  const overview: PlaytestOverview = {
    gameCount: number(overviewRow?.game_count ?? 0),
    matchCount: number(overviewRow?.match_count ?? 0),
    missionSuccessRate: percent(overviewRow?.mission_success_rate ?? 0),
    verdictCorrectRate: percent(overviewRow?.verdict_correct_rate ?? 0),
    undecidedRate: percent(overviewRow?.undecided_rate ?? 0),
    ponPresenceRate: percent(overviewRow?.pon_presence_rate ?? 0),
    averageGameDurationSeconds: nullableNumber(overviewRow?.average_duration_seconds ?? null),
    feedbackCount: number(overviewRow?.feedback_count ?? 0),
    averageSummaryUsefulness: nullableNumber(overviewRow?.summary_usefulness ?? null),
    averageFunRating: nullableNumber(overviewRow?.fun_rating ?? null),
    selfSuspicionRate: overviewRow?.self_suspicion_rate === null || overviewRow?.self_suspicion_rate === undefined ? null : percent(overviewRow.self_suspicion_rate),
    singleObviousSuspectRate: overviewRow?.single_obvious_suspect_rate === null || overviewRow?.single_obvious_suspect_rate === undefined ? null : percent(overviewRow.single_obvious_suspect_rate)
  };

  const normalizeBreakdown = (rows: Array<Record<string, Numberish>>): PlaytestBreakdownRow[] => rows.map((row) => ({
    key: String(row.key ?? "UNKNOWN"),
    games: number(row.games),
    missionSuccessRate: percent(row.mission_success_rate),
    verdictCorrectRate: percent(row.verdict_correct_rate),
    undecidedRate: percent(row.undecided_rate)
  }));

  const byPlayerCount = normalizeBreakdown(await queryAll<Record<string, Numberish>>(db, `
    SELECT
      CAST(player_count AS TEXT) AS key,
      COUNT(*) AS games,
      AVG(mission_success * 1.0) AS mission_success_rate,
      AVG(CASE WHEN verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END) AS verdict_correct_rate,
      AVG(CASE WHEN verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END) AS undecided_rate
    FROM playtest_games
    GROUP BY player_count
    ORDER BY player_count
  `));

  const byFalseRelation = normalizeBreakdown(await queryAll<Record<string, Numberish>>(db, `
    SELECT
      CASE WHEN has_pon = 0 THEN 'NO_PON' ELSE COALESCE(false_relation, 'UNKNOWN') END AS key,
      COUNT(*) AS games,
      AVG(mission_success * 1.0) AS mission_success_rate,
      AVG(CASE WHEN verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END) AS verdict_correct_rate,
      AVG(CASE WHEN verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END) AS undecided_rate
    FROM playtest_games
    GROUP BY key
    ORDER BY games DESC
  `));

  const byMission = normalizeBreakdown(await queryAll<Record<string, Numberish>>(db, `
    SELECT
      COALESCE(true_mission_type, mission_category) AS key,
      COUNT(*) AS games,
      AVG(mission_success * 1.0) AS mission_success_rate,
      AVG(CASE WHEN verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END) AS verdict_correct_rate,
      AVG(CASE WHEN verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END) AS undecided_rate
    FROM playtest_games
    GROUP BY key
    ORDER BY games DESC, key
  `));

  const personalities = (await queryAll<Record<string, Numberish>>(db, `
    SELECT
      COALESCE(personality_type, 'UNKNOWN') AS personality_type,
      COUNT(*) AS samples,
      AVG(personality_success * 1.0) AS success_rate,
      AVG(total_score * 1.0) AS average_score
    FROM playtest_game_players
    GROUP BY personality_type
    ORDER BY samples DESC, personality_type
  `)).map((row): PersonalityBreakdownRow => ({
    personalityType: String(row.personality_type ?? "UNKNOWN"),
    samples: number(row.samples),
    successRate: percent(row.success_rate),
    averageScore: Math.round(number(row.average_score) * 100) / 100
  }));

  const selfSuspicionRounds = (await queryAll<Record<string, Numberish>>(db, `
    SELECT self_suspicion_round AS round, COUNT(*) AS count
    FROM playtest_feedback
    WHERE suspected_self = 1 AND self_suspicion_round BETWEEN 1 AND 4
    GROUP BY self_suspicion_round
    ORDER BY self_suspicion_round
  `)).map((row): SelfSuspicionRoundRow => ({
    round: number(row.round) as 1 | 2 | 3 | 4,
    count: number(row.count)
  }));

  return {
    generatedAt: Date.now(),
    overview,
    byPlayerCount,
    byFalseRelation,
    byMission,
    personalities,
    selfSuspicionRounds
  };
}
