import { describe, expect, it } from "vitest";
import { gameRegistry } from "../../src/games/registry";

describe("game registry", () => {
  it("resolves Pon Inai through the shared registry", () => {
    const module = gameRegistry.get("pon-inai");
    expect(module.id).toBe("pon-inai");
    expect(module.minPlayers).toBe(3);
    expect(module.maxPlayers).toBe(4);
    expect(module.parseConfig({ gameCount: 3 })).toEqual({ gameCount: 3 });
  });

  it("rejects unknown games and invalid registered-game config", () => {
    expect(() => gameRegistry.get("missing-game")).toThrow("Unknown game module");
    expect(() => gameRegistry.get("pon-inai").parseConfig({ gameCount: 6 })).toThrow();
  });
});
