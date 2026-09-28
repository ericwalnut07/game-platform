import { z } from "zod";
import type { AdvancedAction } from "./core/prototype-stage-core-v1.0";
const id = z.string().min(1).max(80);
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MOVE"), direction: z.enum(["north", "east", "south", "west"]) }),
  z.object({ type: z.literal("PUSH"), wallId: id }),
  z.object({ type: z.literal("FLIP"), floorId: id }),
  z.object({ type: z.literal("ROTATE"), roomId: id }),
  z.object({ type: z.literal("LIFT"), liftId: id }),
  z.object({ type: z.literal("MIRROR"), mirrorId: id }),
  z.object({ type: z.literal("SEND"), transferId: id, itemId: id }),
  z.object({ type: z.literal("RECEIVE"), transferId: id, itemId: id }),
  z.object({ type: z.literal("CANCEL"), transferId: id, itemId: id }),
  z.object({ type: z.literal("INSTALL"), objectId: id, itemId: id }),
  z.object({ type: z.literal("REMOVE"), objectId: id, itemId: id }),
  z.object({ type: z.literal("UNLOCK"), doorId: id, itemId: id }),
  z.object({ type: z.literal("POWER"), circuitId: id }),
  z.object({ type: z.literal("CACHE_TAKE"), cacheId: id, itemId: id })
]);
export function parseCoreAction(value: unknown): AdvancedAction {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("操作の形式が不正です");
  return parsed.data;
}
export function actionError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  return ({ BLOCKED: "そこへは進めません。通路・電力を確認してください。", OCCUPIED: "相方の足元が壁や穴になるため操作できません。",
    NOT_ADJACENT: "装置の操作位置へ移動してください。", NOT_WALL_SIDE: "壁がある側から押してください。",
    INVALID_ACTION: "この状態では操作できません。所持品・給電状態を確認してください。", GAME_OVER: "このステージはクリア済みです。" } as Record<string, string>)[code ?? ""]
    ?? (error instanceof Error ? error.message : "操作できませんでした");
}
