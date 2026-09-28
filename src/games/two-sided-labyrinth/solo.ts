import { z } from "zod";
import { RULES_VERSION, type StageId } from "./catalog";
import { loadStage, parseStageId } from "./stage-loader";
import { parseCoreAction } from "./actions";
import { createStageState, applyStageAction, type SharedTutorialState, type AdvancedAction } from "./core/prototype-stage-core-v1.0";
import type { Face } from "./core/layered-stage-contract-v0.6";
export interface SoloStep { face: Face; action: AdvancedAction }
export interface SoloSave {
  rulesVersion: typeof RULES_VERSION; playMode: "SOLO_PRACTICE"; stageId: StageId;
  elapsedMs: number; activeFace: Face; steps: readonly SoloStep[];
}
const envelope = z.object({ rulesVersion: z.literal(RULES_VERSION), playMode: z.literal("SOLO_PRACTICE"),
  stageId: z.string(), elapsedMs: z.number().finite().nonnegative(), activeFace: z.enum(["front", "back"]),
  steps: z.array(z.object({ face: z.enum(["front", "back"]), action: z.unknown() })) });
/** Replay accepted actions instead of trusting a mutable stored board. Restores are paused by the UI. */
export function restoreSolo(raw: string): { save: SoloSave; core: SharedTutorialState } {
  const parsed = envelope.parse(JSON.parse(raw)), stageId = parseStageId(parsed.stageId), stage = loadStage(stageId);
  let core = createStageState(stage);
  const steps = parsed.steps.map(({ face, action }) => {
    const command = parseCoreAction(action);
    core = applyStageAction(stage, core, { playMode: "SOLO_PRACTICE", selectedFace: face }, command);
    return { face, action: command };
  });
  return { save: { ...parsed, stageId, steps }, core };
}
