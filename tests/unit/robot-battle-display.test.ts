import { describe, expect, it } from "vitest";
import type { RobotBattleUnitView } from "../../src/client/games/robot-tactics/BattleViewModel";
import {
  ROBOT_BATTLE_ART_ORIGINAL_FOOT_Y, ROBOT_BATTLE_ART_TARGET_FOOT_Y,
  ROBOT_BATTLE_ART_OFFSET_Y, robotBattleArtTranslation,
  robotBattleLiveUnits, robotBattleHighlightedUnit,
} from "../../src/client/games/robot-tactics/BattleUnitDisplay";

const unit = (id: string, kind: RobotBattleUnitView["kind"], hp = 50): RobotBattleUnitView => ({
  id, name: id, kind, cell: { x: 3, y: 4 }, hp, maxHp: 50,
  en: 100, maxEn: 100, weapons: [],
});

describe("post-playtest battle display-only helpers", () => {
  it("anchors boots within their own diamond without changing logical movement coordinates", () => {
    expect(ROBOT_BATTLE_ART_ORIGINAL_FOOT_Y).toBe(.81);
    expect(ROBOT_BATTLE_ART_TARGET_FOOT_Y).toBe(.60);
    expect(ROBOT_BATTLE_ART_ORIGINAL_FOOT_Y + ROBOT_BATTLE_ART_OFFSET_Y).toBeCloseTo(.60);
    expect(ROBOT_BATTLE_ART_TARGET_FOOT_Y).toBeGreaterThan(0);
    expect(ROBOT_BATTLE_ART_TARGET_FOOT_Y).toBeLessThan(1);
    expect(robotBattleArtTranslation(6, 8)).toBe("translate(6 7.79)");
    expect(robotBattleArtTranslation(6, 7)).toBe("translate(6 6.79)");
  });
  it("lists only currently live enemy identities; new arrivals appear and defeated enemies disappear", () => {
    const initial = [unit("p1", "controlled"), unit("f1", "friendly-ai"), unit("e1", "enemy"), unit("e2", "enemy", 0)];
    const liveInitial = robotBattleLiveUnits(initial, "enemy");
    expect(liveInitial.map(u => u.id)).toEqual(["e1"]);
    expect(robotBattleLiveUnits(initial, "ally").map(u => u.id)).toEqual(["p1", "f1"]);
    const incoming = [...initial, unit("reinforcement-7", "enemy")];
    expect(robotBattleLiveUnits(incoming, "enemy").map(u => u.id)).toEqual(["e1", "reinforcement-7"]);
    const afterHit = incoming.map(u => u.id === "e1" ? { ...u, hp: 0 } : u);
    expect(robotBattleLiveUnits(afterHit, "enemy").map(u => u.id)).toEqual(["reinforcement-7"]);
    expect(robotBattleLiveUnits(initial, "enemy").map(u => u.id)).toEqual(["e1"]);
  });
  it("losing the selected unit clears one-time focus and never mutates model data", () => {
    const units = [unit("p1", "controlled"), unit("e1", "enemy", 35)];
    const snapshot = JSON.stringify(units);
    expect(robotBattleHighlightedUnit(units, "e1")?.hp).toBe(35);
    expect(robotBattleHighlightedUnit(units, "none")).toBeNull();
    expect(robotBattleHighlightedUnit(units, null)).toBeNull();
    expect(robotBattleHighlightedUnit([{ ...units[0]! }, { ...units[1]!, hp: 0 }], "e1")).toBeNull();
    expect(JSON.stringify(units)).toBe(snapshot);
  });
});
