import type { PlayerRef } from "../pon-inai/types";
import type { RandomSource } from "../pon-inai/random";

export interface GameRuntimeContext {
  rng: RandomSource;
}

export interface GameCreateContext<Config> extends GameRuntimeContext {
  matchId: string;
  gameIndex: number;
  players: readonly PlayerRef[];
  config: Config;
  previousGameMeta?: unknown;
}

export interface GameModule<Config, State, Action, View, Result = unknown> {
  readonly id: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  createInitialState(context: GameCreateContext<Config>): State;
  handleAction(state: State, action: Action, context: GameRuntimeContext): State;
  buildPlayerView(state: State, playerId: string): View;
  isFinished(state: State): boolean;
  getResult(state: State): Result | null;
}
