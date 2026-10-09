import type { HubState } from "../../games/commercial-hub/state";
import { APP_VERSION } from "../../shared/version";
import { matchSeats } from "./log-archive";

export async function persistHubStart(db: D1Database | undefined, roomCode: string, state: HubState, startedAt: number): Promise<void> {
  if (!db) return;
  const seated = matchSeats({ npc: state.npcPlayers ?? {} }, state.players);
  await db.batch([
    db.prepare("INSERT INTO playtest_matches(match_id, room_code, game_id, player_count, game_count, started_at, app_version) VALUES (?, ?, 'commercial-hub', 4, 1, ?, ?) ON CONFLICT(match_id) DO NOTHING")
      .bind(state.matchId, roomCode, startedAt, APP_VERSION),
    db.prepare("INSERT INTO commercial_hub_matches(match_id, app_version, rules_version, player_count, started_at, config_json, npc_json) VALUES (?, ?, ?, 4, ?, ?, ?) ON CONFLICT(match_id) DO UPDATE SET started_at=COALESCE(commercial_hub_matches.started_at, excluded.started_at), config_json=COALESCE(commercial_hub_matches.config_json, excluded.config_json), npc_json=COALESCE(commercial_hub_matches.npc_json, excluded.npc_json) WHERE commercial_hub_matches.started_at IS NULL")
      .bind(state.matchId, APP_VERSION, state.rulesVersion, startedAt, JSON.stringify({ ...state.config, rules_variant: state.config.rulesVariant ?? "V05", test_version: state.config.testVersion ?? null }), JSON.stringify(seated.npc)),
    db.prepare("UPDATE playtest_matches SET finished_at=(SELECT finished_at FROM commercial_hub_matches WHERE match_id=?), ended_reason=(SELECT CASE WHEN result_json IS NOT NULL THEN 'COMPLETED' ELSE end_reason END FROM commercial_hub_matches WHERE match_id=?) WHERE match_id=? AND finished_at IS NULL AND (SELECT finished_at FROM commercial_hub_matches WHERE match_id=?) IS NOT NULL")
      .bind(state.matchId, state.matchId, state.matchId, state.matchId)
  ]);
}
export function hubEventPayload(state: HubState, event: HubState["events"][number]) {
  return event.type === "ROUND_SETTLED" ? { ...event.data, statistics: state.roundStatistics?.find(s => s.round === event.round) ?? null } : event.data;
}
/** Only settled rounds and terminal results enter D1. Normal actions produce zero statements. */
export async function persistHubTransition(db: D1Database | undefined, before: HubState | null, state: HubState, now: number,
  archive?: { key: string; uploaded: boolean; endedAt: number | null; endReason: string | null }): Promise<void> {
  if (!db) return;
  const settled = state.events.filter(e => e.type === "ROUND_SETTLED" && e.seq > (before?.eventSeq ?? 0));
  if (!settled.length && !state.result && !archive?.endReason) return;
  const s = matchSeats(state, state.players);
  const statements: D1PreparedStatement[] = [];
  for (const event of settled) {
    const statistics = s.roundStatistics?.find(r => r.round === event.round);
    if (!statistics) throw new Error("Settled-round statistics are missing");
    const auditor = s.events.filter(e => e.type === "AUDITOR_PLACED" && e.round <= event.round).at(-1)?.data ?? { target: null };
    const bids = s.bidResults.find(r => r.round === event.round) ?? null;
    statements.push(db.prepare("INSERT INTO commercial_hub_rounds(match_id, round_number, city_level, city_development, companies_json, bid_results_json, auditor_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(match_id, round_number) DO NOTHING")
      .bind(s.matchId, event.round, Number(event.data.levelAfter), Number(event.data.developmentAfter),
        JSON.stringify(statistics.companies), JSON.stringify(bids), JSON.stringify(auditor), now));
  }
  const endedAt = state.result ? (archive?.endedAt ?? now) : archive?.endedAt ?? null;
  const reason = state.result?.reason ?? archive?.endReason ?? null;
  statements.push(db.prepare("INSERT INTO commercial_hub_matches(match_id, app_version, rules_version, player_count, finished_at, total_rounds, end_reason, final_values_json, winners_json, city_lv4_round, last_revision, config_json, npc_json, result_json, bid_results_json, archive_key, archive_revision) VALUES (?, ?, ?, 4, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(match_id) DO UPDATE SET finished_at=COALESCE(commercial_hub_matches.finished_at, excluded.finished_at), total_rounds=excluded.total_rounds, end_reason=COALESCE(commercial_hub_matches.end_reason, excluded.end_reason), final_values_json=COALESCE(excluded.final_values_json, commercial_hub_matches.final_values_json), winners_json=COALESCE(excluded.winners_json, commercial_hub_matches.winners_json), city_lv4_round=excluded.city_lv4_round, last_revision=excluded.last_revision, config_json=excluded.config_json, npc_json=excluded.npc_json, result_json=COALESCE(excluded.result_json, commercial_hub_matches.result_json), bid_results_json=excluded.bid_results_json, archive_key=COALESCE(excluded.archive_key, commercial_hub_matches.archive_key), archive_revision=MAX(commercial_hub_matches.archive_revision, excluded.archive_revision) WHERE excluded.last_revision >= commercial_hub_matches.last_revision")
    .bind(s.matchId, APP_VERSION, s.rulesVersion, endedAt, state.result ? state.round : state.roundStatistics.length, reason,
      state.result ? JSON.stringify(s.companyValues) : null, state.result ? JSON.stringify(s.result!.winners) : null,
      s.cityLevel4Round, s.revision, JSON.stringify({ ...s.config, rules_variant: s.config.rulesVariant ?? "V05", test_version: s.config.testVersion ?? null, trial_summary: s.next ? { projects: s.publicProjects, investments: s.next.cards } : null }), JSON.stringify(s.npcPlayers ?? {}), state.result ? JSON.stringify(s.result) : null,
      JSON.stringify(s.bidResults), archive?.uploaded ? archive.key : null, archive?.uploaded ? s.revision : -1));
  if (endedAt !== null) statements.push(db.prepare("UPDATE playtest_matches SET finished_at=COALESCE(finished_at, ?), ended_reason=COALESCE(ended_reason, ?) WHERE match_id=?")
    .bind(endedAt, state.result ? "COMPLETED" : reason, s.matchId));
  await db.batch(statements);
}


