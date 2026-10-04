import { z } from "zod";

const schema = z.object({
  trickRule: z.enum(["NORMAL", "BID"]).default("NORMAL"),
  auditor: z.boolean().default(false)
}).strict();
export type HubConfig = z.infer<typeof schema>;
export const DEFAULT_HUB_CONFIG: HubConfig = { trickRule: "NORMAL", auditor: false };
export function parseHubConfig(value: unknown): HubConfig {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("商都開発のルール設定が不正です");
  return parsed.data;
}
