import { learningExpected, type LearningJournal } from "../../games/commercial-hub/learning";

export async function persistLearningBatch(db: D1Database | undefined, journal: LearningJournal, now: number): Promise<"STORED" | "DELETED"> {
  if (!db) throw new Error("Learning database is not configured");
  const existing = await db.prepare("SELECT deleted, expires_at FROM hub_learning_matches WHERE match_id = ?").bind(journal.matchId).first<{ deleted: number; expires_at: number }>();
  if (existing?.deleted || now >= (existing?.expires_at ?? journal.expiresAt)) return "DELETED";
  const statements = [db.prepare(`INSERT INTO hub_learning_matches
    (match_id, room_code, notice_version, started_at, expires_at, finished, expected_records, failures, dropped_records, last_failure_at, consented_seats_json, withdrawn_seats_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET finished=excluded.finished, expected_records=excluded.expected_records,
      failures=excluded.failures, dropped_records=excluded.dropped_records, last_failure_at=excluded.last_failure_at,
      withdrawn_seats_json=excluded.withdrawn_seats_json, updated_at=excluded.updated_at
    WHERE hub_learning_matches.deleted = 0`)
    .bind(journal.matchId, journal.roomCode, journal.noticeVersion, journal.startedAt, journal.expiresAt, Number(journal.finished), learningExpected(journal), journal.failures, journal.dropped, journal.lastFailureAt, JSON.stringify(journal.consentedSeats), JSON.stringify(journal.withdrawnSeats), now)];
  for (const seat of journal.withdrawnSeats) statements.push(db.prepare(`DELETE FROM hub_learning_records WHERE match_id = ? AND EXISTS (SELECT 1 FROM json_each(private_seats_json) WHERE value = ?)`)
    .bind(journal.matchId, seat));
  for (const r of journal.queue) statements.push(db.prepare(`INSERT INTO hub_learning_records (match_id, sequence, seat, kind, private_seats_json, payload_json)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM hub_learning_matches WHERE match_id = ? AND deleted = 0)
    ON CONFLICT(match_id, sequence) DO NOTHING`).bind(r.matchId, r.sequence, r.seat, r.kind, JSON.stringify(r.privateSeats), JSON.stringify(r), r.matchId));
  statements.push(db.prepare(`UPDATE hub_learning_matches SET recorded_records = (SELECT COUNT(*) FROM hub_learning_records WHERE match_id = ?) WHERE match_id = ? AND deleted = 0`).bind(journal.matchId, journal.matchId));
  await db.batch(statements);
  return "STORED";
}
export async function deleteLearningMatch(db: D1Database, matchId: string): Promise<void> {
  // The tombstone prevents a delayed retry from restoring deleted details.
  await db.batch([
    db.prepare("UPDATE hub_learning_matches SET deleted=1, recorded_records=0, consented_seats_json='[]', withdrawn_seats_json='[]' WHERE match_id=?").bind(matchId),
    db.prepare("DELETE FROM hub_learning_records WHERE match_id=?").bind(matchId)
  ]);
}
export async function purgeExpiredLearning(db: D1Database, now: number): Promise<number> {
  const count = await db.prepare("SELECT COUNT(*) AS n FROM hub_learning_matches WHERE expires_at <= ? AND deleted = 0").bind(now).first<{ n: number }>();
  await db.batch([
    db.prepare("DELETE FROM hub_learning_records WHERE match_id IN (SELECT match_id FROM hub_learning_matches WHERE expires_at <= ?)").bind(now),
    db.prepare("DELETE FROM hub_learning_matches WHERE expires_at <= ?").bind(now)
  ]);
  return count?.n ?? 0;
}
export async function learningSummary(db: D1Database, matchId?: string, now = Date.now()) {
  const result = await db.prepare(`SELECT match_id, started_at, expires_at, finished, expected_records, recorded_records, failures, dropped_records, last_failure_at, consented_seats_json, withdrawn_seats_json, deleted
    FROM hub_learning_matches WHERE expires_at > ? ${matchId ? "AND match_id = ?" : ""} ORDER BY started_at DESC LIMIT 100`)
    .bind(...(matchId ? [now, matchId] : [now])).all<Record<string, unknown>>();
  return result.results.map((r): Record<string, unknown> & { complete: boolean } => ({ ...r, complete: r.deleted === 0 && r.finished === 1 && r.expected_records === r.recorded_records && r.dropped_records === 0 }));
}
export async function learningExport(db: D1Database, matchId: string, now = Date.now()) {
  const summary = (await learningSummary(db, matchId, now))[0];
  if (!summary || summary.deleted) return null;
  const records = await db.prepare("SELECT payload_json FROM hub_learning_records WHERE match_id=? ORDER BY sequence").bind(matchId).all<{ payload_json: string }>();
  return { summary, records: records.results.map((r) => JSON.parse(r.payload_json) as unknown) };
}
