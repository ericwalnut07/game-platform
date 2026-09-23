import { z } from "zod";
import { DISTRICTS } from "./data";
import { SUITS } from "./types";
import type { HubAction } from "./state";

const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const bundle = z.object({ materials: amount, goods: amount, cash: amount }).strict();
const terms = z.object({ give: bundle, receive: bundle }).strict();
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ROUND_READY") }),
  z.object({ type: z.literal("PLAY_CARD"), card: z.object({ suit: z.enum(SUITS), rank: z.number().int().min(1).max(8) }).strict() }),
  z.object({ type: z.literal("CLAIM_REWARD"), amount: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("OFFER_TRADE"), counterpart: z.string().min(1).max(100), terms }),
  z.object({ type: z.literal("COUNTER_TRADE"), terms }),
  z.object({ type: z.literal("ANSWER_TRADE"), accept: z.boolean() }),
  z.object({ type: z.literal("SKIP_NEGOTIATION") }),
  z.object({ type: z.literal("MARKET"), action: z.enum(["buy-material", "buy-good", "sell-material", "sell-good"]).nullable() }),
  z.object({ type: z.literal("BUILD"), district: z.custom<(typeof DISTRICTS)[number]["id"]>((v) => DISTRICTS.some((d) => d.id === v)), suit: z.enum(SUITS), access: z.string().min(1).max(100) }),
  z.object({ type: z.literal("UPGRADE"), buildingId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("ROUTE"), edgeId: z.string().regex(/^E(0[1-9]|1[0-6])$/) }),
  z.object({ type: z.literal("CONTRIBUTE"), slot: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("PASS_INVESTMENT") }),
  z.object({ type: z.literal("INCOME"), selections: z.record(z.string().max(100), z.number().int().min(0).max(2)).refine((v) => Object.keys(v).length <= 7) })
]);
export function parseHubAction(value: unknown, authenticatedPlayerId: string): HubAction {
  const parsed = actionSchema.safeParse(value);
  if (!parsed.success) throw new Error("ゲーム操作の形式が不正です");
  // Whitelist fields and bind identity to the authenticated WebSocket session.
  return { ...parsed.data, playerId: authenticatedPlayerId };
}
