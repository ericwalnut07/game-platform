import { z } from "zod";
import { BUILDING_SUITS, DISTRICT_IDS, SUITS } from "./types";
import type { HubAction } from "./state";
const amount = z.number().int().min(0).max(1_000_000);
const bundle = z.object({ materials: amount, goods: amount, cash: amount }).strict();
const access = z.string().min(1).max(100);
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ROUND_READY") }), z.object({ type: z.literal("ROUND_END_READY") }),
  z.object({ type: z.literal("PLAY_CARD"), card: z.object({ suit: z.enum(SUITS), rank: z.number().int().min(1).max(8) }).strict() }),
  z.object({ type: z.literal("CLAIM_REWARD"), amount: z.number().int().min(0).max(2) }),
  z.object({ type: z.literal("OFFER_TRADE"), counterpart: access, terms: z.object({ give: bundle, receive: bundle }).strict() }),
  z.object({ type: z.literal("ANSWER_TRADE"), negotiationId: access, accept: z.boolean() }),
  z.object({ type: z.literal("MARKET"), action: z.enum(["buy-material", "dispose-good"]) }),
  z.object({ type: z.literal("PROCUREMENT_DONE") }), z.object({ type: z.literal("PRODUCTION_DONE") }),
  z.object({ type: z.literal("USE_BUILDING"), buildingId: access, amount: z.number().int().min(1).max(2), access, bonus: amount.default(0) }),
  z.object({ type: z.literal("BUILD"), district: z.enum(DISTRICT_IDS), suit: z.enum(BUILDING_SUITS), access }),
  z.object({ type: z.literal("UPGRADE"), buildingId: access, access }),
  z.object({ type: z.literal("ROUTE"), district: z.enum(DISTRICT_IDS) }),
  z.object({ type: z.literal("CONTRIBUTE"), projectId: access, slot: z.number().int().min(0).max(5), benefit: z.enum(["NONE", "FREE", "REBATE"]) }),
  z.object({ type: z.literal("PASS_INVESTMENT") })
]);
export function parseHubAction(value: unknown, authenticatedPlayerId: string): HubAction {
  const parsed = schema.safeParse(value); if (!parsed.success) throw new Error("ゲーム操作の形式が不正です");
  return { ...parsed.data, playerId: authenticatedPlayerId };
}
