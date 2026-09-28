import type { GameModule } from "../core/GameModule";
import { LABYRINTH_ID } from "./catalog";
import { createLabyrinthState, parseLabyrinthConfig, parseLabyrinthAction, reduceLabyrinth, labyrinthResult, type LabyrinthConfig, type LabyrinthState, type LabyrinthAction } from "./runtime";
import { buildLabyrinthView, type LabyrinthView } from "./view";
export const labyrinthGameModule: GameModule<LabyrinthConfig, LabyrinthState, LabyrinthAction, LabyrinthView> = {
  id: LABYRINTH_ID, minPlayers: 2, maxPlayers: 2,
  parseConfig: parseLabyrinthConfig,
  createInitialState: (ctx) => createLabyrinthState(ctx.matchId, ctx.players, ctx.config, ctx.now ?? 0),
  handleAction: (state, action, ctx) => reduceLabyrinth(state, action, ctx.now ?? 0),
  parseClientAction: parseLabyrinthAction, buildPlayerView: buildLabyrinthView,
  isFinished: (state) => state.phase === "FINISHED", getResult: labyrinthResult,
  // Both players act concurrently during PLAYING. Only lifecycle changes invalidate queued input.
  getStateInfo: (state) => ({ matchId: state.matchId, phase: state.phase, currentGameId: state.matchId, currentGameIndex: 1,
    currentGameFinished: state.phase === "FINISHED", matchFinished: state.phase === "FINISHED" })
};
