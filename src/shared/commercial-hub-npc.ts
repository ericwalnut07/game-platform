export const HUB_NPC_TYPES = ["standard", "production", "commerce", "development"] as const;
export type HubNpcType = typeof HUB_NPC_TYPES[number];
export const HUB_NPC_LABELS: Record<HubNpcType, string> = {
  standard: "標準型", production: "生産重視型", commerce: "商業重視型", development: "開発重視型"
};
export function isHubNpcType(value: unknown): value is HubNpcType {
  return typeof value === "string" && (HUB_NPC_TYPES as readonly string[]).includes(value);
}
