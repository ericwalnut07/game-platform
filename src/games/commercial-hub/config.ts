import { z } from "zod";

const schema = z.object({
  trickRule: z.enum(["NORMAL", "BID"]).default("NORMAL"),
  auditor: z.boolean().default(false),
  rulesVariant: z.enum(["V05", "NEXT"]).optional(),
  horizon: z.enum(["11-13", "12-14"]).optional(),
  majorInvestments: z.boolean().optional(),
  testVersion: z.literal("next-trial-1").optional()
}).strict();
export type HubConfig = z.infer<typeof schema>;
export const DEFAULT_HUB_CONFIG: HubConfig = { trickRule: "NORMAL", auditor: false };
export function parseHubConfig(value: unknown): HubConfig {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("商都開発のルール設定が不正です");
  return parsed.data.rulesVariant === "NEXT" ? { ...parsed.data, horizon: parsed.data.horizon ?? "11-13", majorInvestments: parsed.data.majorInvestments ?? true, testVersion: "next-trial-1" } : parsed.data;
}

