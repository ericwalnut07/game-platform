export interface GamePlayerRef {
  id: string;
  displayName: string;
}

export interface GameRandomSource {
  next(): number;
  integer(minInclusive: number, maxInclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export interface GameRuntimeContext {
  rng: GameRandomSource;
}

export interface GameCreateContext<Config> extends GameRuntimeContext {
  matchId: string;
  gameIndex: number;
  players: readonly GamePlayerRef[];
  config: Config;
  previousGameMeta?: unknown;
}

export interface GameStateInfo {
  matchId: string;
  phase: string;
  matchFinished: boolean;
  currentGameFinished: boolean;
  currentGameId?: string;
  currentGameIndex?: number;
}

export interface AutomaticGameProgress<Action> {
  delayMs: number;
  action: Action;
}

export interface GameModule<Config, State, Action, View, Result = unknown> {
  readonly id: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  parseConfig(value: unknown): Config;
  createInitialState(context: GameCreateContext<Config>): State;
  handleAction(state: State, action: Action, context: GameRuntimeContext): State;
  buildPlayerView(state: State, playerId: string): View;
  isFinished(state: State): boolean;
  getResult(state: State): Result | null;

  parseClientAction?(value: unknown, playerId: string): Action;
  getStateInfo?(state: State): GameStateInfo;
  getPhaseReadyAction?(state: State): Action | null;
  getAutomaticProgress?(state: State): AutomaticGameProgress<Action> | null;
}
