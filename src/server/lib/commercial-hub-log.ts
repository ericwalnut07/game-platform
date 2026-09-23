import type { HubState } from "../../games/commercial-hub/state";
import { APP_VERSION } from "../../shared/version";

export async function persistHubStart(db: D1Database | undefined, roomCode: string, state: HubState, startedAt: number): Promise<void> {
  if (!db) return;
  await db.batch([
    db.prepare(`INSERT INTO playtest_matches(match_id, room_code, game_id, player_count, game_count, started_at, app_version)
      VALUES (?, ?, 'commercial-hub', 4, 1, ?, ?) ON CONFLICT(match_id) DO NOTHING`).bind(state.matchId, roomCode, startedAt, APP_VERSION),
    db.prepare(`INSERT INTO commercial_hub_matches(match_id, app_version, rules_version, player_count, started_at)
      VALUES (?, ?, '0.1', 4, ?) ON CONFLICT(match_id) DO UPDATE SET started_at = COALESCE(commercial_hub_matches.started_at, excluded.started_at)`)
      .bind(state.matchId, APP_VERSION, startedAt)
  ]);
  await persistHubTransition(db, null, state, startedAt);
}

/** Only server-generated public events go to D1; no display names, sessions or hands. */
export async function persistHubTransition(db: D1Database | undefined, before: HubState | null, state: HubState, now: number): Promise<void> {
  if (!db) return;
  const events = state.events.filter((event) => event.seq > (before?.eventSeq ?? 0));
  const statements = events.map((event) => db.prepare(`INSERT INTO commercial_hub_events
    (match_id, sequence, app_version, round_number, event_type, player_id, payload_json, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(match_id, sequence) DO NOTHING`)
    .bind(state.matchId, event.seq, APP_VERSION, event.round, event.type, event.playerId, JSON.stringify(event.data), now));
  statements.push(db.prepare(`INSERT INTO commercial_hub_matches
    (match_id, app_version, rules_version, player_count, finished_at, total_rounds, end_reason, final_values_json, winners_json, city_lv4_round, last_revision)
    VALUES (?, ?, '0.1', 4, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET finished_at = excluded.finished_at, total_rounds = excluded.total_rounds,
      end_reason = excluded.end_reason, final_values_json = excluded.final_values_json, winners_json = excluded.winners_json,
      city_lv4_round = excluded.city_lv4_round, last_revision = excluded.last_revision
    WHERE excluded.last_revision > commercial_hub_matches.last_revision`).bind(
    state.matchId, APP_VERSION, state.result ? now : null, state.result ? state.round : Math.max(0, state.round - (state.phase === "ROUND_END" ? 0 : 1)),
    state.result?.reason ?? null, state.result ? JSON.stringify(state.companyValues) : null,
    state.result ? JSON.stringify(state.result.winners) : null, state.cityLevel4Round, state.revision
  ));
  // Reading the monotonic summary also makes a late start write unable to unfinish a match.
  statements.push(db.prepare(`UPDATE playtest_matches SET
    finished_at = COALESCE((SELECT finished_at FROM commercial_hub_matches WHERE match_id = ?), finished_at),
    ended_reason = CASE WHEN (SELECT end_reason FROM commercial_hub_matches WHERE match_id = ?) IS NOT NULL THEN 'COMPLETED' ELSE ended_reason END
    WHERE match_id = ?`).bind(state.matchId, state.matchId, state.matchId));
  await db.batch(statements);
}
