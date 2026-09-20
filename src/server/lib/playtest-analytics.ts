import type {
  PersonalityBreakdownRow,
  PlaytestAnalytics,
  PlaytestBreakdownRow,
  PlaytestOverview,
  RecentPlaytestComment,
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

function validatedScopeVersion(version: string | null | undefined): string | null {
  if (!version || version === "ALL") return null;
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(version)) throw new Error("Invalid analytics version scope");
  return version;
}

function matchScope(version: string | null, alias = "m"): string {
  return version ? `${alias}.app_version = '${version}'` : "1=1";
}

function gameScope(version: string | null, alias = "g"): string {
  return version
    ? `${alias}.match_id IN (SELECT match_id FROM playtest_matches WHERE app_version = '${version}')`
    : "1=1";
}

function feedbackScope(version: string | null, alias = "f"): string {
  return version
    ? `${alias}.match_id IN (SELECT match_id FROM playtest_matches WHERE app_version = '${version}')`
    : "1=1";
}

export async function loadPlaytestAnalytics(db: D1Database, requestedVersion?: string | null): Promise<PlaytestAnalytics> {
  const scopeVersion = validatedScopeVersion(requestedVersion);
  const availableVersions = (await queryAll<{ app_version: string | null }>(db, `
    SELECT DISTINCT COALESCE(app_version, 'UNKNOWN') AS app_version
    FROM playtest_matches
    ORDER BY app_version DESC
  `)).map((row) => row.app_version ?? "UNKNOWN");

  const overviewRow = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM playtest_games g WHERE ${gameScope(scopeVersion, "g")}) AS game_count,
      (SELECT COUNT(*) FROM playtest_matches m WHERE m.finished_at IS NOT NULL AND COALESCE(m.ended_reason, 'COMPLETED') = 'COMPLETED' AND ${matchScope(scopeVersion, "m")}) AS match_count,
      AVG(CASE WHEN ${gameScope(scopeVersion, "g")} THEN g.mission_success * 1.0 END) AS mission_success_rate,
      AVG(CASE WHEN ${gameScope(scopeVersion, "g")} THEN CASE WHEN g.verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END END) AS verdict_correct_rate,
      AVG(CASE WHEN ${gameScope(scopeVersion, "g")} THEN CASE WHEN g.verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END END) AS undecided_rate,
      AVG(CASE WHEN ${gameScope(scopeVersion, "g")} THEN g.has_pon * 1.0 END) AS pon_presence_rate,
      AVG(CASE WHEN ${gameScope(scopeVersion, "g")} AND start_event.started_at IS NOT NULL THEN (g.recorded_at - start_event.started_at) / 1000.0 END) AS average_duration_seconds,
      (SELECT COUNT(*) FROM playtest_feedback f WHERE ${feedbackScope(scopeVersion, "f")}) AS feedback_count,
      (SELECT AVG(summary_usefulness * 1.0) FROM playtest_feedback f WHERE ${feedbackScope(scopeVersion, "f")}) AS summary_usefulness,
      (SELECT AVG(fun_rating * 1.0) FROM playtest_feedback f WHERE ${feedbackScope(scopeVersion, "f")}) AS fun_rating,
      (SELECT AVG(rules_clarity * 1.0) FROM playtest_feedback f WHERE rules_clarity IS NOT NULL AND ${feedbackScope(scopeVersion, "f")}) AS rules_clarity,
      (SELECT COUNT(*) FROM playtest_feedback f WHERE TRIM(COALESCE(f.free_comment, '')) <> '' AND ${feedbackScope(scopeVersion, "f")}) AS comment_count,
      (SELECT AVG(suspected_self * 1.0) FROM playtest_feedback f WHERE ${feedbackScope(scopeVersion, "f")}) AS self_suspicion_rate,
      (SELECT AVG(single_obvious_suspect * 1.0) FROM playtest_feedback f WHERE ${feedbackScope(scopeVersion, "f")}) AS single_obvious_suspect_rate
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
    averageRulesClarity: nullableNumber(overviewRow?.rules_clarity ?? null),
    commentCount: number(overviewRow?.comment_count ?? 0),
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
    SELECT CAST(g.player_count AS TEXT) AS key, COUNT(*) AS games,
      AVG(g.mission_success * 1.0) AS mission_success_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END) AS verdict_correct_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END) AS undecided_rate
    FROM playtest_games g
    WHERE ${gameScope(scopeVersion, "g")}
    GROUP BY g.player_count
    ORDER BY g.player_count
  `));

  const byFalseRelation = normalizeBreakdown(await queryAll<Record<string, Numberish>>(db, `
    SELECT CASE WHEN g.has_pon = 0 THEN 'NO_PON' ELSE COALESCE(g.false_relation, 'UNKNOWN') END AS key,
      COUNT(*) AS games,
      AVG(g.mission_success * 1.0) AS mission_success_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END) AS verdict_correct_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END) AS undecided_rate
    FROM playtest_games g
    WHERE ${gameScope(scopeVersion, "g")}
    GROUP BY key
    ORDER BY games DESC
  `));

  const byMission = normalizeBreakdown(await queryAll<Record<string, Numberish>>(db, `
    SELECT COALESCE(g.true_mission_type, g.mission_category) AS key,
      COUNT(*) AS games,
      AVG(g.mission_success * 1.0) AS mission_success_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'CORRECT' THEN 1.0 ELSE 0.0 END) AS verdict_correct_rate,
      AVG(CASE WHEN g.verdict_accuracy = 'UNDECIDED' THEN 1.0 ELSE 0.0 END) AS undecided_rate
    FROM playtest_games g
    WHERE ${gameScope(scopeVersion, "g")}
    GROUP BY key
    ORDER BY games DESC, key
  `));

  const personalities = (await queryAll<Record<string, Numberish>>(db, `
    SELECT COALESCE(p.personality_type, 'UNKNOWN') AS personality_type,
      COUNT(*) AS samples,
      AVG(p.personality_success * 1.0) AS success_rate,
      AVG(p.total_score * 1.0) AS average_score
    FROM playtest_game_players p
    JOIN playtest_games g ON g.game_id = p.game_id
    WHERE ${gameScope(scopeVersion, "g")}
    GROUP BY personality_type
    ORDER BY samples DESC, personality_type
  `)).map((row): PersonalityBreakdownRow => ({
    personalityType: String(row.personality_type ?? "UNKNOWN"),
    samples: number(row.samples),
    successRate: percent(row.success_rate),
    averageScore: Math.round(number(row.average_score) * 100) / 100
  }));

  const selfSuspicionRounds = (await queryAll<Record<string, Numberish>>(db, `
    SELECT f.self_suspicion_round AS round, COUNT(*) AS count
    FROM playtest_feedback f
    WHERE f.suspected_self = 1
      AND f.self_suspicion_round BETWEEN 1 AND 4
      AND ${feedbackScope(scopeVersion, "f")}
    GROUP BY f.self_suspicion_round
    ORDER BY f.self_suspicion_round
  `)).map((row): SelfSuspicionRoundRow => ({
    round: number(row.round) as 1 | 2 | 3 | 4,
    count: number(row.count)
  }));

  const recentComments = (await queryAll<Record<string, Numberish | string>>(db, `
    SELECT f.submitted_at, f.free_comment, f.rules_clarity, f.fun_rating
    FROM playtest_feedback f
    WHERE TRIM(COALESCE(f.free_comment, '')) <> ''
      AND ${feedbackScope(scopeVersion, "f")}
    ORDER BY f.submitted_at DESC
    LIMIT 20
  `)).map((row): RecentPlaytestComment => ({
    submittedAt: number(row.submitted_at as Numberish),
    comment: String(row.free_comment ?? ""),
    rulesClarity: nullableNumber(row.rules_clarity as Numberish),
    funRating: nullableNumber(row.fun_rating as Numberish)
  }));

  return {
    generatedAt: Date.now(),
    scopeVersion,
    availableVersions,
    overview,
    byPlayerCount,
    byFalseRelation,
    byMission,
    personalities,
    selfSuspicionRounds,
    recentComments
  };
}
