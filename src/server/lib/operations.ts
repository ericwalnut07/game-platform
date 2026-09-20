import type { Env } from "../env";
import type { MaintenanceResult, OperationsOverview } from "../../shared/operations";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function retentionPolicy(env: Pick<Env, "STALE_ROOM_HOURS" | "PLAYTEST_EVENT_RETENTION_DAYS" | "ERROR_RETENTION_DAYS">) {
  return {
    staleRoomHours: positiveInteger(env.STALE_ROOM_HOURS, 24),
    playtestEventDays: positiveInteger(env.PLAYTEST_EVENT_RETENTION_DAYS, 180),
    errorDays: positiveInteger(env.ERROR_RETENTION_DAYS, 30)
  };
}

export async function recordOperationalError(
  db: D1Database | undefined,
  args: {
    source: string;
    message: string;
    stack?: string;
    requestId?: string;
    route?: string;
    roomCode?: string;
    playerId?: string;
    details?: unknown;
    createdAt?: number;
  }
): Promise<void> {
  if (!db) return;
  try {
    await db.prepare(`
      INSERT INTO operational_errors(
        source, message, stack, request_id, route, room_code, player_id, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      args.source,
      args.message.slice(0, 1200),
      args.stack?.slice(0, 8000) ?? null,
      args.requestId ?? null,
      args.route ?? null,
      args.roomCode ?? null,
      args.playerId ?? null,
      args.details === undefined ? null : JSON.stringify(args.details),
      args.createdAt ?? Date.now()
    ).run();
  } catch {
    // Error logging must never break gameplay or API responses.
  }
}

async function scalar(db: D1Database, sql: string, ...bindings: unknown[]): Promise<number | null> {
  const row = await db.prepare(sql).bind(...bindings).first<{ value: number | null }>();
  return row?.value ?? null;
}

export async function runMaintenance(db: D1Database | undefined, env: Env, options: { dryRun?: boolean; now?: number } = {}): Promise<MaintenanceResult> {
  const now = options.now ?? Date.now();
  const dryRun = options.dryRun ?? false;
  const policy = retentionPolicy(env);
  const roomCutoff = now - policy.staleRoomHours * HOUR;
  const eventCutoff = now - policy.playtestEventDays * DAY;
  const errorCutoff = now - policy.errorDays * DAY;

  const [rooms, events, errors] = await Promise.all([
    db ? scalar(db, "SELECT COUNT(*) AS value FROM rooms WHERE updated_at < ?", roomCutoff) : Promise.resolve(0),
    db ? scalar(db, "SELECT COUNT(*) AS value FROM playtest_events WHERE created_at < ?", eventCutoff) : Promise.resolve(0),
    db ? scalar(db, "SELECT COUNT(*) AS value FROM operational_errors WHERE created_at < ?", errorCutoff) : Promise.resolve(0)
  ]);

  const result: MaintenanceResult = {
    ranAt: now,
    dryRun,
    deletedRooms: rooms ?? 0,
    deletedEvents: events ?? 0,
    deletedErrors: errors ?? 0
  };
  if (!db || dryRun) return result;

  await db.batch([
    db.prepare("DELETE FROM rooms WHERE updated_at < ?").bind(roomCutoff),
    db.prepare("DELETE FROM playtest_events WHERE created_at < ?").bind(eventCutoff),
    db.prepare("DELETE FROM operational_errors WHERE created_at < ?").bind(errorCutoff),
    db.prepare(`
      INSERT INTO maintenance_runs(ran_at, deleted_rooms, deleted_events, deleted_errors, dry_run)
      VALUES (?, ?, ?, ?, 0)
    `).bind(now, result.deletedRooms, result.deletedEvents, result.deletedErrors)
  ]);
  return result;
}

export async function loadOperationsOverview(db: D1Database, env: Env, now = Date.now()): Promise<OperationsOverview> {
  const policy = retentionPolicy(env);
  const roomCutoff = now - policy.staleRoomHours * HOUR;
  const dayAgo = now - DAY;
  const weekAgo = now - 7 * DAY;

  const [roomRow, eventRow, errorRow, maintenance, recentErrors, matchRow] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) AS listed_rooms,
             SUM(CASE WHEN updated_at < ? THEN 1 ELSE 0 END) AS stale_rooms,
             MIN(updated_at) AS oldest_updated_at
      FROM rooms
    `).bind(roomCutoff).first<Record<string, number | null>>(),
    db.prepare(`SELECT COUNT(*) AS event_count, MIN(created_at) AS oldest_created_at FROM playtest_events`).first<Record<string, number | null>>(),
    db.prepare(`
      SELECT SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last_24_hours,
             SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last_7_days,
             MAX(created_at) AS latest_at
      FROM operational_errors
    `).bind(dayAgo, weekAgo).first<Record<string, number | null>>(),
    db.prepare(`
      SELECT ran_at, deleted_rooms, deleted_events, deleted_errors, dry_run
      FROM maintenance_runs ORDER BY ran_at DESC LIMIT 1
    `).first<Record<string, number | null>>(),
    db.prepare(`
      SELECT source, message, route, room_code, created_at
      FROM operational_errors
      ORDER BY created_at DESC
      LIMIT 10
    `).all<{ source: string; message: string; route: string | null; room_code: string | null; created_at: number }>(),
    db.prepare(`
      SELECT COUNT(*) AS abandoned_last_7_days
      FROM playtest_matches
      WHERE ended_reason = 'ROOM_EXPIRED' AND finished_at >= ?
    `).bind(weekAgo).first<Record<string, number | null>>()
  ]);

  return {
    generatedAt: now,
    roomDirectory: {
      listedRooms: roomRow?.listed_rooms ?? 0,
      staleRooms: roomRow?.stale_rooms ?? 0,
      oldestUpdatedAt: roomRow?.oldest_updated_at ?? null
    },
    playtestEvents: {
      count: eventRow?.event_count ?? 0,
      oldestCreatedAt: eventRow?.oldest_created_at ?? null
    },
    matches: {
      abandonedLast7Days: matchRow?.abandoned_last_7_days ?? 0
    },
    errors: {
      last24Hours: errorRow?.last_24_hours ?? 0,
      last7Days: errorRow?.last_7_days ?? 0,
      latestAt: errorRow?.latest_at ?? null,
      recent: (recentErrors.results ?? []).map((row) => ({
        source: row.source, message: row.message, route: row.route, roomCode: row.room_code, createdAt: row.created_at
      }))
    },
    lastMaintenance: maintenance?.ran_at ? {
      ranAt: maintenance.ran_at,
      deletedRooms: maintenance.deleted_rooms ?? 0,
      deletedEvents: maintenance.deleted_events ?? 0,
      deletedErrors: maintenance.deleted_errors ?? 0,
      dryRun: maintenance.dry_run === 1
    } : null,
    retention: policy
  };
}
