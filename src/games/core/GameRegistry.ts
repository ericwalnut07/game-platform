import type { GameModule } from "./GameModule";

export type AnyGameModule = GameModule<any, any, any, any, any>;

export class GameRegistry {
  private readonly modules = new Map<string, AnyGameModule>();

  register<Config, State, Action, View, Result>(
    module: GameModule<Config, State, Action, View, Result>
  ): void {
    if (this.modules.has(module.id)) throw new Error(`Game module already registered: ${module.id}`);
    this.modules.set(module.id, module as AnyGameModule);
  }

  get(gameId: string): AnyGameModule {
    const module = this.modules.get(gameId);
    if (!module) throw new Error(`Unknown game module: ${gameId}`);
    return module;
  }

  list(): readonly AnyGameModule[] {
    return [...this.modules.values()];
  }
}
