import { LABYRINTH_ID, RULES_VERSION, type StageId } from "./catalog";
import { loadStage, parseStageId } from "./stage-loader";
import { applyStageAction, createStageState, type AdvancedAction, type SharedTutorialState } from "./core/prototype-stage-core-v1.0";
import type { Face } from "./core/layered-stage-contract-v0.6";
import { parseCoreAction, actionError } from "./actions";
export interface LabyrinthConfig { stageId: StageId }
export interface LabyrinthState {
  gameId: typeof LABYRINTH_ID; rulesVersion: typeof RULES_VERSION; matchId: string;
  stageId: StageId; phase: "PREPARING" | "PLAYING" | "FINISHED";
  players: readonly { id: string; name: string; face: Face }[];
  ready: readonly string[]; revision: number; core: SharedTutorialState;
  createdAt: number; startedAt: number | null; finishedAt: number | null;
}
export type LabyrinthAction = { playerId: string; command: AdvancedAction | { type: "READY" } };
export function parseLabyrinthConfig(value: unknown): LabyrinthConfig {
  const stageId = value && typeof value === "object" ? (value as Record<string, unknown>).stageId : undefined;
  return { stageId: parseStageId(stageId) };
}
export function createLabyrinthState(matchId: string, players: readonly { id: string; displayName: string }[], config: LabyrinthConfig, now: number): LabyrinthState {
  if (players.length !== 2 || new Set(players.map((p) => p.id)).size !== 2) throw new Error("2人で開始してください");
  const stageId = parseStageId(config.stageId);
  return { gameId: LABYRINTH_ID, rulesVersion: RULES_VERSION, matchId, stageId, phase: "PREPARING",
    players: players.map((p, i) => ({ id: p.id, name: p.displayName, face: i === 0 ? "front" : "back" })),
    ready: [], revision: 0, core: createStageState(loadStage(stageId)), createdAt: now, startedAt: null, finishedAt: null };
}
export function parseLabyrinthAction(value: unknown, playerId: string): LabyrinthAction {
  if (value && typeof value === "object" && (value as Record<string, unknown>).type === "READY") return { playerId, command: { type: "READY" } };
  return { playerId, command: parseCoreAction(value) };
}
export function reduceLabyrinth(state: LabyrinthState, action: LabyrinthAction, now: number): LabyrinthState {
  if (!Number.isFinite(now)) throw new Error("サーバー時刻が不正です");
  const actor = state.players.find((p) => p.id === action.playerId);
  if (!actor) throw new Error("参加者ではありません");
  if (action.command.type === "READY") {
    if (state.phase !== "PREPARING") throw new Error("準備画面ではありません");
    if (state.ready.includes(actor.id)) return state;
    const ready = [...state.ready, actor.id], started = ready.length === 2;
    return { ...state, ready, revision: state.revision + 1, phase: started ? "PLAYING" : "PREPARING", startedAt: started ? now : null };
  }
  if (state.phase !== "PLAYING") throw new Error("両者の準備が完了してから操作してください");
  try {
    const core = applyStageAction(loadStage(state.stageId), state.core, { playMode: "ONLINE_DUO", authenticatedPlayerId: actor.id,
      serverSeatAssignment: { front: state.players.find((p) => p.face === "front")!.id, back: state.players.find((p) => p.face === "back")!.id } }, action.command);
    return { ...state, core, revision: state.revision + 1, phase: core.complete ? "FINISHED" : "PLAYING", finishedAt: core.complete ? Math.max(now, state.startedAt!) : null };
  } catch (error) { throw new Error(actionError(error)); }
}
export function labyrinthResult(state: LabyrinthState) {
  if (state.phase !== "FINISHED" || state.startedAt === null || state.finishedAt === null) return null;
  return { stageId: state.stageId, elapsedMs: state.finishedAt - state.startedAt, actions: state.core.acceptedActions,
    official: state.stageId.startsWith("challenge-"), playMode: "ONLINE_DUO" as const, pairKey: state.players.map((p) => p.id).sort().join(":"),
    startedAt: state.startedAt, finishedAt: state.finishedAt };
}
