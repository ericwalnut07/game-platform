import { describe, expect, it } from "vitest";
import { getRobotStagePlan, listRobotStageKeys, requireApprovedRobotStage } from "../../src/games/robot-tactics/stageCatalog";

describe("robot tactics typed stage catalog", () => {
  it("represents exactly 30 missions and 3 difficulties without adopting candidate rules", () => {
    const keys = listRobotStageKeys();
    expect(keys).toHaveLength(90);
    expect(new Set(keys.map(k => k.missionNumber))).toEqual(new Set(Array.from({ length: 30 }, (_, i) => i + 1)));
    expect(keys.filter(k => k.difficulty === "easy")).toHaveLength(30);
    for (const key of keys) {
      const p = getRobotStagePlan(key);
      expect(p.key).toEqual(key);
      expect(p.roundLimit).toBeGreaterThan(0);
      expect(p.players).toHaveLength(3);
      expect(p.friendlyAI).toHaveLength(2);
      expect(p.recommendedCoreLevel.min).toBeLessThanOrEqual(p.recommendedCoreLevel.max);
      expect(p.initialEnemies.length).toBeGreaterThan(0);
      expect(p.firstClear.exp).toBeGreaterThan(0);
      expect(p.isReadyForFormalPlay).toBe(p.blockingIssues.length === 0);
      if (key.missionNumber >= 8) {
        expect(p.designStatus).toBe("unadopted-candidate");
        expect(p.isReadyForFormalPlay).toBe(false);
        expect(() => requireApprovedRobotStage(key)).toThrow(/not ready for formal play/);
      }
    }
  });
  it("keeps adopted early geometry and reward separate from prototype overrides", () => {
    const e = getRobotStagePlan({ missionNumber: 1, difficulty: "easy" });
    expect(e.designStatus).toBe("adopted-layout");
    expect(e.roundLimit).toBe(5);
    expect(e.players).toEqual(["F10", "G11", "H10"]);
    expect(e.objective.kind).toBe("defend-structure");
    expect(e.firstClear.exp).toBe(80);
    expect(e.referenceEnemyCoreLevel).toBeNull();
    expect(() => requireApprovedRobotStage({ missionNumber: 1, difficulty: "easy" })).toThrow();
    const third = getRobotStagePlan({ missionNumber: 3, difficulty: "easy" });
    expect(third.initialEnemies.some(x => x.kind === "medium" && x.model === null)).toBe(true);
    expect(third.blockingIssues.some(x => x.includes("Enemy solo model"))).toBe(true);
  });
  it("uses adopted Normal/Hard M01 enemy model overlays and the common weapon level bands", () => {
    const n = getRobotStagePlan({ missionNumber: 1, difficulty: "normal" });
    const h = getRobotStagePlan({ missionNumber: 1, difficulty: "hard" });
    expect([n.referenceEnemyCoreLevel, n.enemyWeaponLevel]).toEqual([5, 1]);
    expect([h.referenceEnemyCoreLevel, h.enemyWeaponLevel]).toEqual([17, 4]);
    expect(n.initialEnemies[0]?.model).toBe("A");
    expect(h.initialEnemies[0]?.model).toBe("B");
    expect(n.roundLimit).toBe(h.roundLimit);
  });
  it("normalizes future candidates without declaring composite objectives adopted", () => {
    const a = getRobotStagePlan({ missionNumber: 8, difficulty: "hard" });
    expect(a.initialEnemies).toHaveLength(3);
    expect(a.reinforcements).toHaveLength(1);
    expect([a.referenceEnemyCoreLevel, a.enemyWeaponLevel]).toEqual([25, 5]);
    expect(a.initialEnemies.find(x => x.id === "center-fire-support")?.model).toBe("C");
    expect(a.blockingIssues.some(x => x.includes("Candidate stage"))).toBe(true);
    const b = getRobotStagePlan({ missionNumber: 22, difficulty: "easy" });
    expect(b.objective.kind).toBe("composite");
    expect(b.objective.conditionKinds).toEqual(["defend-structure", "defeat-boss"]);
    expect(b.blockingIssues).toContain("Composite victory condition not adopted");
    const final = getRobotStagePlan({ missionNumber: 30, difficulty: "hard" });
    expect(final.objective.conditionKinds).toEqual(["defend-structure", "defeat-boss", "recover-data-and-extract"]);
    expect(final.reinforcements).toHaveLength(2);
    expect([final.referenceEnemyCoreLevel, final.enemyWeaponLevel]).toEqual([41, 8]);
    expect(final.initialEnemies.some(e => e.model === "boss-pending")).toBe(true);
  });
  it("rejects invalid stage and difficulty selection", () => {
    expect(() => getRobotStagePlan({ missionNumber: 0, difficulty: "easy" })).toThrow();
    expect(() => getRobotStagePlan({ missionNumber: 31, difficulty: "easy" })).toThrow();
    expect(() => getRobotStagePlan({ missionNumber: 1, difficulty: "expert" as "hard" })).toThrow();
  });
});
