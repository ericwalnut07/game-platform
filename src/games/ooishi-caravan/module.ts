import { z } from "zod";
import type { GameModule, GamePlayerRef, GameRandomSource } from "../core/GameModule";
import { applyCaravanAction, createCaravanState, type CaravanAction, type CaravanState } from "./engine";
import type { CaravanSeat } from "./engine";

const configSchema = z.object({
  turnOrderMode: z.enum(["host-select", "random"]).default("host-select"),
  startingPlayerId: z.string().trim().min(1).max(100).optional()
});
export type CaravanConfig = z.infer<typeof configSchema>;
export const parseCaravanConfig = (value: unknown): CaravanConfig => configSchema.parse(value ?? {});

/** Called by the room server, including rematches; never by the online client. */
export function orderCaravanPlayers<T extends { playerId: string }>(players: readonly T[], config: CaravanConfig, hostId: string, rng: GameRandomSource): T[] {
  if (config.turnOrderMode === "random") return rng.shuffle(players);
  const preferred = players.some(player => player.playerId === config.startingPlayerId) ? config.startingPlayerId : hostId;
  const start = players.findIndex(player => player.playerId === preferred);
  return start > 0 ? [...players.slice(start), ...players.slice(0, start)] : [...players];
}

export interface CaravanMatchState {
  gameId: "ooishi-caravan";
  matchId: string;
  startedAt: number;
  config: CaravanConfig;
  players: readonly GamePlayerRef[];
  core: CaravanState;
  revision: number;
  lastAction?: CaravanOnlineAction;
}
export interface CaravanView {
  gameId: "ooishi-caravan";
  matchId: string;
  mySeat: CaravanSeat;
  players: readonly GamePlayerRef[];
  state: CaravanState;
  revision: number;
}
export type CaravanOnlineAction = CaravanAction & { playerId: string };

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ROLL") }),
  z.object({ type: z.literal("MOVE"), from: z.number().int().min(1).max(20),
    layer: z.number().int().min(0).max(2), die: z.union([z.literal(0), z.literal(1)]) })
]);

export const ooishiCaravanGameModule: GameModule<CaravanConfig, CaravanMatchState, CaravanOnlineAction, CaravanView> = {
  id: "ooishi-caravan", minPlayers: 2, maxPlayers: 2,
  parseConfig: parseCaravanConfig,
  createInitialState({ matchId, players, config, now }) {
    if (players.length !== 2 || new Set(players.map(player => player.id)).size !== 2 || players.some(player => player.controller)) {
      throw new Error("大石のキャラバンは人間2人で遊びます");
    }
    return { gameId: "ooishi-caravan", matchId, startedAt: now ?? Date.now(), config: parseCaravanConfig(config),
      players: players.map(({ id, displayName }) => ({ id, displayName })), core: createCaravanState(), revision: 0 };
  },
  parseClientAction(value, playerId) {
    // Schema strips forged actor/seat fields; the authenticated socket supplies identity.
    return { ...actionSchema.parse(value), playerId };
  },
  handleAction(state, action, { rng }) {
    const seat = state.players.findIndex(player => player.id === action.playerId);
    if (seat < 0) throw new Error("参加者ではありません");
    return { ...state, core: applyCaravanAction(state.core, seat as CaravanSeat, action, rng), revision: state.revision + 1, lastAction: action };
  },
  buildPlayerView(state, playerId) {
    const mySeat = state.players.findIndex(player => player.id === playerId);
    if (mySeat < 0) throw new Error("参加者ではありません");
    return { gameId: "ooishi-caravan", matchId: state.matchId, mySeat: mySeat as CaravanSeat,
      players: state.players, state: state.core, revision: state.revision };
  },
  isFinished: state => state.core.phase === "FINISHED",
  getResult: state => state.core.result,
  getStateInfo: state => ({ matchId: state.matchId, phase: `${state.core.phase}:${state.revision}`,
    matchFinished: state.core.phase === "FINISHED", currentGameFinished: state.core.phase === "FINISHED",
    currentGameId: "ooishi-caravan", currentGameIndex: 1 })
};
