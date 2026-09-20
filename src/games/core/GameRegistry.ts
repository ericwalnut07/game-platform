import type { GameModule } from "./GameModule";

export type AnyGameModule = GameModule<unknown, unknown, unknown, unknown, unknown>;

export class GameRegistry {
  private readonly modules = new Map<string, AnyGameModule>();

  register(module: AnyGameModule): void {
    if (this.modules.has(module.id)) throw new Error(`Game module already registered: ${module.id}`);
    this.modules.set(module.id, module);
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
