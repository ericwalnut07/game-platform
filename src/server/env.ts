export interface Env {
  ROOMS: DurableObjectNamespace;
  DB?: D1Database;
  ANALYTICS_TOKEN?: string;
  ADMIN_TOKEN?: string;
  STALE_ROOM_HOURS?: string;
  PLAYTEST_EVENT_RETENTION_DAYS?: string;
  ERROR_RETENTION_DAYS?: string;
  /** Intentionally unset until the game rule owner specifies the response deadline. */
  HUB_NPC_TRADE_RESPONSE_SECONDS?: string;
}
