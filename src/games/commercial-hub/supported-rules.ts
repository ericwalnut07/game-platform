export const RETIRED_HUB_MESSAGE = "この旧版の対局はサポートを終了しました。新しい部屋で正式版1.0を開始してください";
export function assertFormalHub(state: { rulesVersion?: string }): void {
  if (state.rulesVersion !== "1.0") throw new Error(RETIRED_HUB_MESSAGE);
}
export function isRetiredHubRoom(room: { gameId: string; gameState?: unknown; gameConfig: unknown }): boolean {
  if (room.gameId !== "commercial-hub") return false;
  if (room.gameState) return (room.gameState as { rulesVersion?: string }).rulesVersion !== "1.0";
  const config = room.gameConfig as { rulesVariant?: unknown; testVersion?: unknown } | null;
  return !!config && (config.rulesVariant !== undefined || config.testVersion !== undefined);
}
