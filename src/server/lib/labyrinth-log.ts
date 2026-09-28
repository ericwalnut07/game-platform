import { labyrinthResult, type LabyrinthState } from "../../games/two-sided-labyrinth/runtime";
import { APP_VERSION } from "../../shared/version";
export async function persistLabyrinth(db: D1Database | undefined, roomCode: string, state: LabyrinthState): Promise<void> {
  if (!db) return;
  const result = labyrinthResult(state);
  const statements = [db.prepare(`INSERT INTO playtest_matches
    (match_id, room_code, game_id, player_count, game_count, started_at, finished_at, ended_reason, app_version)
    VALUES (?, ?, 'two-sided-labyrinth', 2, 1, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      started_at=CASE WHEN excluded.finished_at IS NOT NULL THEN excluded.started_at ELSE playtest_matches.started_at END,
      finished_at=COALESCE(excluded.finished_at, playtest_matches.finished_at),
      ended_reason=COALESCE(excluded.ended_reason, playtest_matches.ended_reason)`)
    .bind(state.matchId, roomCode, state.startedAt ?? state.createdAt, state.finishedAt, result ? "COMPLETED" : null, APP_VERSION)];
  if (result?.official) statements.push(db.prepare(`INSERT INTO labyrinth_records
    (match_id, app_version, rules_version, stage_id, play_mode, pair_key, started_at, finished_at, elapsed_ms, accepted_actions)
    VALUES (?, ?, ?, ?, 'ONLINE_DUO', ?, ?, ?, ?, ?) ON CONFLICT(match_id) DO NOTHING`)
    .bind(state.matchId, APP_VERSION, state.rulesVersion, state.stageId, result.pairKey, result.startedAt, result.finishedAt, result.elapsedMs, result.actions));
  await db.batch(statements);
}
