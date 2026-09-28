import assets from "./stages.json";
import { STAGES, type StageId } from "./catalog";
import type { LayeredStageAsset, Face } from "./core/layered-stage-contract-v0.6";
export interface StageAsset extends LayeredStageAsset {
  readonly title: string;
  readonly items: readonly { itemId: string; kind: string; initialLocation: unknown }[];
  readonly sharedPower: { baseCapacity: number } | null;
}
const byId = new Map(assets.map((s) => [s.stageId, s as unknown as StageAsset]));
export function parseStageId(value: unknown): StageId {
  if (typeof value !== "string" || !STAGES.some((s) => s.stageId === value)) throw new Error("ステージを選択してください");
  return value as StageId;
}
export function loadStage(id: string): StageAsset { return byId.get(parseStageId(id))!; }
export const FACES: readonly Face[] = ["front", "back"];
