import { describe, expect, it } from "vitest";
import { robotMissionRow } from "../../src/games/robot-tactics/offlineProgress";
import type { RobotOfflineResult } from "../../src/games/robot-tactics/offlineSession";
import { robotResultRewardBreakdown } from "../../src/client/games/robot-tactics/RobotResultRewards";

type Key = RobotOfflineResult["departure"]["key"];
function settled(key: Key, expGained: number, achieved: boolean, equipmentUnlocked: string[] = [], result: "won"|"lost" = "won"): RobotOfflineResult {
  return { departure: { battleId: "b-1", key, party: [] }, result, endedRound: 3,
    subobjectiveAchieved: achieved, expGained, unlocked: [], equipmentUnlocked };
}
const unlockedProgress = (key: Key) => ({
  cleared: [`${key.difficulty}-${String(key.missionNumber).padStart(2,"0")}`],
  subobjectives: [`${key.difficulty}-${String(key.missionNumber).padStart(2,"0")}`],
});

describe("Stage 5 committed mission result breakdown, presentation only", () => {
  it("preserves exactly awarded values for all 90 catalog mission/difficulty rows", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) for (let missionNumber = 1; missionNumber <= 30; missionNumber++) {
      const key = { missionNumber, difficulty }, row = robotMissionRow(key), total = row.firstClear.exp + row.firstSubobjective.exp;
      const equipment = [
        ...(row.firstClear.unlock ? [row.firstClear.unlock.id] : []),
        ...(row.firstSubobjective.addonId ? [row.firstSubobjective.addonId] : []),
      ];
      const result = robotResultRewardBreakdown(settled(key, total, true, equipment), unlockedProgress(key));
      expect(result.mainExp, row.id).toBe(row.firstClear.exp);
      expect(result.subobjectiveExp, row.id).toBe(row.firstSubobjective.exp);
      expect(result.mainExp! + result.subobjectiveExp!, row.id).toBe(result.totalExp);
      expect(result.subobjectiveStatus, row.id).toBe("earned");
      expect(result.condition, row.id).toBeTruthy();
      expect(result.firstClear, row.id).toBe(true);
      const repeat = robotResultRewardBreakdown(settled(key, row.repeatClear.exp, true), unlockedProgress(key));
      expect(repeat.mainExp, row.id).toBe(row.repeatClear.exp);
      expect(repeat.subobjectiveExp, row.id).toBe(0);
      expect(repeat.subobjectiveStatus, row.id).toBe("previously-received");
    }
  });
  it("supports first clear without a completed subobjective, replay-first subobjective and mission loss", () => {
    const key = { missionNumber: 1, difficulty: "easy" as const }, row = robotMissionRow(key);
    const first = robotResultRewardBreakdown(settled(key, row.firstClear.exp, false, ["light-lance"]), unlockedProgress(key));
    expect(first.mainExp).toBe(80); expect(first.subobjectiveExp).toBe(0); expect(first.subobjectiveStatus).toBe("missed");
    const replaySub = robotResultRewardBreakdown(settled(key, row.repeatClear.exp+row.firstSubobjective.exp, true), unlockedProgress(key));
    expect(replaySub.mainExp).toBe(row.repeatClear.exp);
    expect(replaySub.subobjectiveExp).toBe(row.firstSubobjective.exp);
    expect(replaySub.firstClear).toBe(false);
    const loss = robotResultRewardBreakdown(settled(key, 0, false, [], "lost"), unlockedProgress(key));
    expect(loss.mainExp).toBe(0); expect(loss.subobjectiveExp).toBe(0); expect(loss.totalExp).toBe(0);
  });
  it("disambiguates easy M20's matching EXP combinations using actual first-clear equipment", () => {
    const key = { missionNumber: 20, difficulty: "easy" as const }, row = robotMissionRow(key);
    expect(row.firstClear.exp).toBe(row.repeatClear.exp+row.firstSubobjective.exp);
    const first = robotResultRewardBreakdown(settled(key, 270, false, ["mobile-2"]), unlockedProgress(key));
    expect(first.firstClear).toBe(true); expect(first.mainExp).toBe(270); expect(first.subobjectiveExp).toBe(0);
    const repeat = robotResultRewardBreakdown(settled(key, 270, true), unlockedProgress(key));
    expect(repeat.firstClear).toBe(false); expect(repeat.mainExp).toBe(145); expect(repeat.subobjectiveExp).toBe(125);
  });
  it("does not guess a fabricated breakdown for a legacy or inconsistent receipt", () => {
    const key = { missionNumber: 1, difficulty: "easy" as const };
    const result = robotResultRewardBreakdown(settled(key, 999, true), unlockedProgress(key));
    expect(result.totalExp).toBe(999);
    expect(result.mainExp).toBeNull(); expect(result.subobjectiveExp).toBeNull();
  });
  it("shows the canonical name of an actually awarded addon (rather than reward catalog ID)", () => {
    const key = { missionNumber: 15, difficulty: "normal" as const }, row = robotMissionRow(key);
    const addon = row.firstSubobjective.addonId!;
    expect(addon).toBeTruthy();
    const data = robotResultRewardBreakdown(settled(key, row.firstClear.exp+row.firstSubobjective.exp, true, [addon]), unlockedProgress(key));
    expect(data.subobjectiveNewEquipment).toHaveLength(1);
    expect(data.subobjectiveNewEquipment[0]).not.toBe(addon);
  });
});
