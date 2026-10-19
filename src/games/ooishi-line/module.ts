import { z } from "zod";
import type { GameModule, GamePlayerRef, GameRandomSource } from "../core/GameModule";
import { applyLineAction, createLineState, type LineAction, type LineDisplayState, type LineState } from "./engine";
import type { LineSeat } from "./position";

const configSchema = z.object({
  turnOrderMode: z.enum(["host-select", "random"]).default("host-select"),
  startingPlayerId: z.string().trim().min(1).max(100).optional()
});
export type LineConfig = z.infer<typeof configSchema>;
export const parseLineConfig = (value: unknown): LineConfig => configSchema.parse(value ?? {});

/** Called by the room server, including rematches; never by the online client. */
export function orderLinePlayers<T extends { playerId: string }>(players: readonly T[], config: LineConfig, hostId: string, rng: GameRandomSource): T[] {
  if (config.turnOrderMode === "random") return rng.shuffle(players);
  const preferred = players.some(player => player.playerId === config.startingPlayerId) ? config.startingPlayerId : hostId;
  const start = players.findIndex(player => player.playerId === preferred);
  return start > 0 ? [...players.slice(start), ...players.slice(0, start)] : [...players];
}

export interface LineMatchState {
  gameId: "ooishi-line";
  matchId: string;
  startedAt: number;
  config: LineConfig;
  players: readonly GamePlayerRef[];
  core: LineState;
  lastAction?: LineOnlineAction;
}
export interface LineView {
  gameId: "ooishi-line";
  matchId: string;
  mySeat: LineSeat;
  players: readonly GamePlayerRef[];
  state: LineDisplayState;
}
export type LineOnlineAction = LineAction & { playerId: string };

const cell = z.number().int().min(0).max(15);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLACE"), size: z.enum(["large", "medium", "small"]), to: cell }),
  z.object({ type: z.literal("MOVE"), from: cell, layer: z.number().int().min(0).max(2), to: cell })
]);

export const ooishiLineGameModule: GameModule<LineConfig, LineMatchState, LineOnlineAction, LineView> = {
  id: "ooishi-line", minPlayers: 2, maxPlayers: 2,
  parseConfig: parseLineConfig,
  createInitialState({ matchId, players, config, now }) {
    if (players.length !== 2 || new Set(players.map(player => player.id)).size !== 2 || players.some(player => player.controller)) {
      throw new Error("大石のラインは人間2人で遊びます");
    }
    return { gameId: "ooishi-line", matchId, startedAt: now ?? Date.now(), config: parseLineConfig(config),
      players: players.map(({ id, displayName }) => ({ id, displayName })), core: createLineState() };
  },
  parseClientAction(value, playerId) {
    // Schema strips forged actor/seat fields; the authenticated socket supplies identity.
    return { ...actionSchema.parse(value), playerId };
  },
  handleAction(state, action) {
    const seat = state.players.findIndex(player => player.id === action.playerId);
    if (seat < 0) throw new Error("参加者ではありません");
    return { ...state, core: applyLineAction(state.core, seat as LineSeat, action), lastAction: action };
  },
  buildPlayerView(state, playerId) {
    const mySeat = state.players.findIndex(player => player.id === playerId);
    if (mySeat < 0) throw new Error("参加者ではありません");
    // Full repetition history is authoritative storage, not a per-turn network payload.
    const { history: _, ...display } = state.core;
    return { gameId: "ooishi-line", matchId: state.matchId, mySeat: mySeat as LineSeat,
      players: state.players, state: display };
  },
  isFinished: state => state.core.phase === "FINISHED",
  getResult: state => state.core.result,
  getStateInfo: state => ({ matchId: state.matchId, phase: `${state.core.phase}:${state.core.ply}`,
    matchFinished: state.core.phase === "FINISHED", currentGameFinished: state.core.phase === "FINISHED",
    currentGameId: "ooishi-line", currentGameIndex: 1 })
};
