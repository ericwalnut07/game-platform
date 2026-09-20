import { RoomObject } from "./durable-objects/RoomObject";
import type { Env } from "./env";
import { gameCatalog } from "./lib/catalog";
import { randomRoomCode, randomToken } from "./lib/crypto";
import { listOpenRooms } from "./lib/directory";
import { createRoomSchema, joinRoomSchema } from "./lib/schemas";
import { loadPlaytestAnalytics } from "./lib/playtest-analytics";
import { loadOperationsOverview, recordOperationalError, retentionPolicy, runMaintenance } from "./lib/operations";

export { RoomObject };

function error(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

class RequestInputError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 16_384) throw new RequestInputError("入力サイズが大きすぎます", 413);
  try { return JSON.parse(text) as unknown; } catch { throw new RequestInputError("JSON形式が不正です", 400); }
}

function roomStub(env: Env, roomCode: string): DurableObjectStub {
  return env.ROOMS.get(env.ROOMS.idFromName(roomCode.toUpperCase()));
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const parsed = createRoomSchema.safeParse(await readJson(request));
  if (!parsed.success) return error("入力内容を確認してください");
  const hostPlayerId = crypto.randomUUID();
  const hostSessionToken = randomToken();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = randomRoomCode();
    const stub = roomStub(env, roomCode);
    const response = await stub.fetch(new Request("https://room.internal/internal/initialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomId: crypto.randomUUID(),
        roomCode,
        roomName: parsed.data.roomName,
        gameId: parsed.data.gameId,
        hostPlayerId,
        hostDisplayName: parsed.data.displayName,
        hostSessionToken,
        password: parsed.data.password,
        gameConfig: parsed.data.gameConfig
      })
    }));
    if (response.status === 409) continue;
    if (!response.ok) return error("部屋を作成できませんでした", response.status);
    const body = await response.json<{ room: unknown }>();
    return Response.json({ roomCode, playerId: hostPlayerId, sessionToken: hostSessionToken, room: body.room }, { status: 201, headers: { "cache-control": "no-store" } });
  }
  return error("部屋コードを発行できませんでした。もう一度お試しください", 503);
}

async function joinRoom(request: Request, env: Env, roomCode: string): Promise<Response> {
  const parsed = joinRoomSchema.safeParse(await readJson(request));
  if (!parsed.success) return error("入力内容を確認してください");
  const playerId = crypto.randomUUID();
  const sessionToken = randomToken();
  const response = await roomStub(env, roomCode).fetch(new Request("https://room.internal/internal/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, displayName: parsed.data.displayName, sessionToken, password: parsed.data.password })
  }));
  if (!response.ok) {
    if (response.status === 403) return error("パスワードが違います", 403);
    if (response.status === 404) return error("部屋が見つかりません", 404);
    if (response.status === 409) return error("この部屋には入れません", 409);
    return error("入室できませんでした", response.status);
  }
  const body = await response.json<{ room: unknown }>();
  return Response.json({ roomCode: roomCode.toUpperCase(), playerId, sessionToken, room: body.room }, { headers: { "cache-control": "no-store" } });
}


function analyticsAuthorized(request: Request, env: Env): boolean {
  if (!env.ANALYTICS_TOKEN) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${env.ANALYTICS_TOKEN}`;
}

async function playtestAnalytics(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.ANALYTICS_TOKEN) return error("API_NOT_FOUND", 404);
  if (!analyticsAuthorized(request, env)) return error("UNAUTHORIZED", 401);
  return Response.json(await loadPlaytestAnalytics(env.DB), {
    headers: { "cache-control": "no-store" }
  });
}

function adminAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${env.ADMIN_TOKEN}`;
}

async function operationsOverview(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.ADMIN_TOKEN) return error("API_NOT_FOUND", 404);
  if (!adminAuthorized(request, env)) return error("UNAUTHORIZED", 401);
  return Response.json(await loadOperationsOverview(env.DB, env), { headers: { "cache-control": "no-store" } });
}

async function maintenance(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.ADMIN_TOKEN) return error("API_NOT_FOUND", 404);
  if (!adminAuthorized(request, env)) return error("UNAUTHORIZED", 401);
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  return Response.json(await runMaintenance(env.DB, env, { dryRun }), { headers: { "cache-control": "no-store" } });
}

async function roomWebSocket(request: Request, env: Env, roomCode: string): Promise<Response> {
  const external = new URL(request.url);
  const internal = new URL("https://room.internal/internal/ws");
  internal.search = external.search;
  return roomStub(env, roomCode).fetch(new Request(internal, { headers: request.headers }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    try {
      if (path === "/api/health" && request.method === "GET") {
        return Response.json({
          ok: true,
          version: "0.8.0",
          durableObjects: true,
          d1Configured: Boolean(env.DB),
          analyticsConfigured: Boolean(env.ANALYTICS_TOKEN),
          adminConfigured: Boolean(env.ADMIN_TOKEN),
          now: new Date().toISOString()
        }, { headers: { "cache-control": "no-store" } });
      }
      if (path === "/api/games" && request.method === "GET") return Response.json(gameCatalog);
      if (path === "/api/rooms" && request.method === "GET") return Response.json(await listOpenRooms(env.DB, retentionPolicy(env).staleRoomHours));
      if (path === "/api/rooms" && request.method === "POST") return createRoom(request, env);
      if (path === "/api/playtest/analytics" && request.method === "GET") return playtestAnalytics(request, env);
      if (path === "/api/admin/operations" && request.method === "GET") return operationsOverview(request, env);
      if (path === "/api/admin/maintenance" && request.method === "POST") return maintenance(request, env);

      const wsMatch = path.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/ws$/i);
      if (wsMatch && request.method === "GET") return roomWebSocket(request, env, wsMatch[1]!);

      const joinMatch = path.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/join$/i);
      if (joinMatch && request.method === "POST") return joinRoom(request, env, joinMatch[1]!);

      if (path.startsWith("/api/")) return error("API_NOT_FOUND", 404);
      return new Response(null, { status: 404 });
    } catch (caught) {
      if (caught instanceof RequestInputError) return error(caught.message, caught.status);
      const message = caught instanceof Error ? caught.message : String(caught);
      await recordOperationalError(env.DB, {
        source: "Worker.fetch",
        message,
        ...(caught instanceof Error && caught.stack ? { stack: caught.stack } : {}),
        requestId,
        route: `${request.method} ${path}`
      });
      return error("INTERNAL_ERROR", 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        await runMaintenance(env.DB, env);
      } catch (caught) {
        await recordOperationalError(env.DB, {
          source: "Worker.scheduled",
          message: caught instanceof Error ? caught.message : String(caught),
          ...(caught instanceof Error && caught.stack ? { stack: caught.stack } : {}),
          details: { task: "daily-maintenance" }
        });
      }
    })());
  }
} satisfies ExportedHandler<Env>;
