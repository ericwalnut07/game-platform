import { z } from "zod";

const schema = z.object({
  trickRule: z.enum(["NORMAL", "BID"]).default("NORMAL"),
  auditor: z.boolean().default(false),
  horizon: z.enum(["11-13", "12-14"]).default("11-13"),
  majorInvestments: z.boolean().default(true)
}).strict();
export type HubConfig = { trickRule: "NORMAL" | "BID"; auditor: boolean; horizon?: "11-13" | "12-14"; majorInvestments?: boolean };
export const DEFAULT_HUB_CONFIG: HubConfig = { trickRule: "NORMAL", auditor: false, horizon: "11-13", majorInvestments: true };
export function parseHubConfig(value: unknown): HubConfig {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("商都開発のルール設定が不正です。正式版1.0の設定を選んでください");
  return parsed.data;
}
/** Preserve the four settings of an already-started formal match. */
export function formalSavedConfig(value: HubConfig): HubConfig {
  return parseHubConfig({ trickRule: value.trickRule, auditor: value.auditor, horizon: value.horizon ?? "11-13", majorInvestments: value.majorInvestments ?? true });
}
