import { learningExpected, type LearningJournal, type LearningRecord } from "../../games/commercial-hub/learning";
import { getPrivateJson, putPrivateJson } from "./log-archive";
export const learningObjectKey = (id: string) => "commercial-hub/learning/"+id+".json.gz";
export interface LearningArchive { schemaVersion: number; journal: Omit<LearningJournal, "queue" | "roomCode">; records: LearningRecord[] }

export async function persistLearningBatch(db: D1Database | undefined, journal: LearningJournal, now: number,
  bucket?: R2Bucket, records: LearningRecord[] = journal.queue, revision = journal.sequence): Promise<"STORED" | "DELETED"> {
  if (!db) throw new Error("Learning summary database is not configured");
  const existing = await db.prepare("SELECT deleted, expires_at, withdrawn_seats_json, archive_key FROM hub_learning_matches WHERE match_id=?").bind(journal.matchId).first<{ deleted: number; expires_at: number; withdrawn_seats_json: string; archive_key: string | null }>();
  if (existing?.deleted || journal.revoked || now >= (existing?.expires_at ?? journal.expiresAt)) {
    if(existing?.archive_key && !bucket) throw new Error("Private log archive bucket is not configured");
    if (bucket) await bucket.delete(learningObjectKey(journal.matchId));
    return "DELETED";
  }
  // Enforce withdrawal in exports immediately, even while R2 replacement fails.
  const withdrawn = JSON.stringify(journal.withdrawnSeats);
  if(existing && existing.withdrawn_seats_json !== withdrawn) {
    await db.prepare("UPDATE hub_learning_matches SET withdrawn_seats_json=?, consented_seats_json=?, expected_records=?, updated_at=? WHERE match_id=? AND deleted=0")
      .bind(withdrawn, JSON.stringify(journal.consentedSeats.filter(s=>!journal.withdrawnSeats.includes(s))), learningExpected(journal), now, journal.matchId).run();
  }
  // Historical detail rows are read-only compatibility input, never new INSERTs.
  const legacy = await db.prepare("SELECT payload_json FROM hub_learning_records WHERE match_id=? ORDER BY sequence")
    .bind(journal.matchId).all<{ payload_json: string }>();
  const unique = new Map<number, LearningRecord>(legacy.results.map(r => { const v = JSON.parse(r.payload_json) as LearningRecord; return [v.sequence, v]; }));
  for (const r of records) unique.set(r.sequence, r);
  const eligible = [...unique.values()].filter(r => !r.privateSeats.some(s => journal.withdrawnSeats.includes(s))).sort((a,b) => a.sequence-b.sequence);
  const { queue: _queue, roomCode: _roomCode, ...metadata } = journal;
  await putPrivateJson(bucket, learningObjectKey(journal.matchId), { schemaVersion: 1, journal: metadata, records: eligible } satisfies LearningArchive, journal.expiresAt);
  await db.prepare("INSERT INTO hub_learning_matches(match_id, room_code, notice_version, started_at, expires_at, finished, expected_records, recorded_records, failures, dropped_records, last_failure_at, consented_seats_json, withdrawn_seats_json, updated_at, archive_key, archive_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(match_id) DO UPDATE SET finished=excluded.finished, expected_records=excluded.expected_records, recorded_records=excluded.recorded_records, failures=excluded.failures, dropped_records=excluded.dropped_records, last_failure_at=excluded.last_failure_at, consented_seats_json=excluded.consented_seats_json, withdrawn_seats_json=excluded.withdrawn_seats_json, updated_at=excluded.updated_at, archive_key=excluded.archive_key, archive_revision=excluded.archive_revision WHERE hub_learning_matches.deleted=0 AND excluded.archive_revision >= hub_learning_matches.archive_revision")
    .bind(journal.matchId, journal.roomCode, journal.noticeVersion, journal.startedAt, journal.expiresAt, Number(journal.finished),
      learningExpected(journal), eligible.length, journal.failures, journal.dropped, journal.lastFailureAt,
      JSON.stringify(journal.consentedSeats.filter(s=>!journal.withdrawnSeats.includes(s))), JSON.stringify(journal.withdrawnSeats), now, learningObjectKey(journal.matchId), revision).run();
  const deleted = await db.prepare("SELECT deleted FROM hub_learning_matches WHERE match_id=?").bind(journal.matchId).first<{ deleted: number }>();
  if (deleted?.deleted) { await bucket!.delete(learningObjectKey(journal.matchId)); return "DELETED"; }
  return "STORED";
}
export async function deleteLearningMatch(db: D1Database, matchId: string, bucket?: R2Bucket): Promise<void> {
  const row=await db.prepare("SELECT archive_key FROM hub_learning_matches WHERE match_id=?").bind(matchId).first<{archive_key:string|null}>();
  await db.batch([
    db.prepare("UPDATE hub_learning_matches SET deleted=1, recorded_records=0, consented_seats_json='[]', withdrawn_seats_json='[]' WHERE match_id=?").bind(matchId),
    db.prepare("DELETE FROM hub_learning_records WHERE match_id=?").bind(matchId)
  ]);
  if(row?.archive_key && !bucket) throw new Error("Private log archive bucket is not configured");
  if (bucket) await bucket.delete(learningObjectKey(matchId));
}
export async function purgeExpiredLearning(db: D1Database, now: number, bucket?: R2Bucket): Promise<number> {
  const rows = await db.prepare("SELECT match_id, archive_key FROM hub_learning_matches WHERE expires_at<=?").bind(now).all<{match_id:string;archive_key:string|null}>();
  if(rows.results.some(row=>row.archive_key) && !bucket) throw new Error("Private log archive bucket is not configured");
  // Deadline is from match start. Lifecycle alone can reset its age on checkpoint overwrite.
  if (bucket) for (const row of rows.results) if(row.archive_key) await bucket.delete(row.archive_key);
  await db.batch([
    db.prepare("DELETE FROM hub_learning_records WHERE match_id IN (SELECT match_id FROM hub_learning_matches WHERE expires_at<=?)").bind(now),
    db.prepare("DELETE FROM hub_learning_matches WHERE expires_at<=?").bind(now)
  ]);
  return rows.results.length;
}
export async function learningSummary(db: D1Database, matchId?: string, now=Date.now()) {
  const result=await db.prepare("SELECT match_id, started_at, expires_at, finished, expected_records, recorded_records, failures, dropped_records, last_failure_at, consented_seats_json, withdrawn_seats_json, deleted, archive_key, archive_revision FROM hub_learning_matches WHERE expires_at>? "+(matchId?"AND match_id=? ":"")+"ORDER BY started_at DESC LIMIT 100")
    .bind(...(matchId?[now,matchId]:[now])).all<Record<string,unknown>>();
  return result.results.map((r):Record<string,unknown>&{complete:boolean}=>({...r,complete:r.deleted===0&&r.finished===1&&r.expected_records===r.recorded_records&&r.dropped_records===0}));
}
export async function learningExport(db:D1Database,matchId:string,now=Date.now(),bucket?:R2Bucket) {
  const summary=(await learningSummary(db,matchId,now))[0];
  if(!summary||summary.deleted)return null;
  const withdrawn=JSON.parse(String(summary.withdrawn_seats_json)) as number[];
  if(typeof summary.archive_key==="string") {
    const payload=await getPrivateJson<LearningArchive>(bucket,summary.archive_key);
    if(!payload||now>=payload.journal.expiresAt||payload.journal.revoked)return null;
    return {summary,records:payload.records.filter(r=>!r.privateSeats.some(s=>withdrawn.includes(s)))};
  }
  const records=await db.prepare("SELECT payload_json FROM hub_learning_records WHERE match_id=? ORDER BY sequence").bind(matchId).all<{payload_json:string}>();
  return {summary,records:records.results.map(r=>JSON.parse(r.payload_json) as LearningRecord).filter(r=>!r.privateSeats.some(s=>withdrawn.includes(s)))};
}

