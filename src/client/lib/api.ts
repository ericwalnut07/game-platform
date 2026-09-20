import type {
  CreateRoomRequest,
  CreateRoomResponse,
  GameCatalogItem,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomListItem
} from "../../shared/api";
import type { PlaytestAnalytics } from "../../shared/playtest-analytics";
import type { MaintenanceResult, OperationsOverview } from "../../shared/operations";

async function jsonRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && body.error
      ? body.error
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  games: () => jsonRequest<readonly GameCatalogItem[]>("/api/games"),
  rooms: () => jsonRequest<readonly RoomListItem[]>("/api/rooms"),
  playtestAnalytics: (token: string) => jsonRequest<PlaytestAnalytics>("/api/playtest/analytics", {
    headers: { authorization: `Bearer ${token}` }
  }),
  operations: (token: string) => jsonRequest<OperationsOverview>("/api/admin/operations", {
    headers: { authorization: `Bearer ${token}` }
  }),
  maintenance: (token: string, dryRun: boolean) => jsonRequest<MaintenanceResult>(`/api/admin/maintenance${dryRun ? "?dryRun=1" : ""}`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }
  }),
  createRoom: (request: CreateRoomRequest) => jsonRequest<CreateRoomResponse>("/api/rooms", {
    method: "POST",
    body: JSON.stringify(request)
  }),
  joinRoom: (roomCode: string, request: JoinRoomRequest) => jsonRequest<JoinRoomResponse>(
    `/api/rooms/${encodeURIComponent(roomCode)}/join`,
    { method: "POST", body: JSON.stringify(request) }
  )
};
