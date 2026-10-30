import { describe, expect, it } from "vitest";
import missions from "../../docs/design/robot-tactics/missions.json";
import { applyRobotOfflineOutcome, createRobotOfflineProgress, getRobotOfflineAvailability, isRobotMissionUnlocked, listRobotUnlockedMissions, robotMissionId, validateRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";

const key = { missionNumber: 1, difficulty: "easy" as const };
const won = { result: "won" as const, endedRound: 5, subobjectiveAchieved: false };
describe("adopted offline mission progression and rewards", () => {
  it("starts with only Easy M01 and three legal distinct initial builds", () => {
    const p = createRobotOfflineProgress(); expect(listRobotUnlockedMissions(p)).toEqual(["easy-01"]);
    expect(p.party.map(c => c.coreLevel)).toEqual([1, 1, 1]); expect(validateRobotOfflineProgress(p)).toEqual(p);
  });
  it("unlocks next Easy and the same Normal without a Normal chain", () => {
    let p = createRobotOfflineProgress();
    for (let n = 1; n <= 3; n++) p = applyRobotOfflineOutcome(p, { ...key, missionNumber: n }, won).progress;
    expect(isRobotMissionUnlocked(p, { missionNumber: 3, difficulty: "normal" })).toBe(true);
    expect(isRobotMissionUnlocked(p, { missionNumber: 4, difficulty: "easy" })).toBe(true);
    expect(isRobotMissionUnlocked(p, { missionNumber: 4, difficulty: "normal" })).toBe(false);
    expect(isRobotMissionUnlocked(p, { missionNumber: 30, difficulty: "hard" })).toBe(false);
  });
  it("unlocks all 30 Hard missions together and grants the full-clear equipment once", () => {
    let p = createRobotOfflineProgress();
    for (let n = 1; n <= 29; n++) p = applyRobotOfflineOutcome(p, { ...key, missionNumber: n }, won).progress;
    const final = applyRobotOfflineOutcome(p, { ...key, missionNumber: 30 }, won);
    expect(final.unlocked.filter(id => id.startsWith("hard"))).toHaveLength(30);
    expect(final.unlocked).toContain("normal-30"); expect(final.unlocked).not.toContain("easy-31");
    expect(final.equipmentUnlocked).toContain("suppression-mace");
    expect(getRobotOfflineAvailability(final.progress).basicParts).toContain("suppression-mace");
    expect(applyRobotOfflineOutcome(final.progress, { ...key, missionNumber: 30 }, won).equipmentUnlocked).toEqual([]);
    expect(isRobotMissionUnlocked(final.progress, { missionNumber: 30, difficulty: "hard" })).toBe(true);
  });
  it("uses first OR repeat EXP plus the first subobjective, including a later replay", () => {
    const row = missions.missions.find(m => m.id === "easy-01")!;
    const first = applyRobotOfflineOutcome(createRobotOfflineProgress(), key, won);
    expect(first.expGained).toBe(row.firstClear.exp); expect(first.equipmentUnlocked).toContain("light-lance");
    const replay = applyRobotOfflineOutcome(first.progress, key, { ...won, subobjectiveAchieved: true });
    expect(replay.expGained).toBe(row.repeatClear.exp + row.firstSubobjective.exp);
    expect(replay.equipmentUnlocked).toEqual([]);
    expect(applyRobotOfflineOutcome(replay.progress, key, { ...won, subobjectiveAchieved: true }).expGained).toBe(row.repeatClear.exp);
  });
  it("grants nothing for a loss and rejects locked/undefined result eligibility", () => {
    const p = createRobotOfflineProgress(); expect(applyRobotOfflineOutcome(p, key, { ...won, result: "lost" }).progress).toEqual(p);
    expect(() => applyRobotOfflineOutcome(p, { ...key, difficulty: "hard" }, won)).toThrow();
    expect(() => applyRobotOfflineOutcome(p, key, { ...won, result: "lost", subobjectiveAchieved: true })).toThrow();
    expect(() => robotMissionId({ ...key, missionNumber: 31 })).toThrow();
  });
  it("rejects bad references, duplicate clears, invalid levels and illegal equipment", () => {
    const p = createRobotOfflineProgress();
    for (const changed of [{ ...p, exp: -1 }, { ...p, cleared: ["easy-31"] }, { ...p, cleared: ["easy-02"] }, { ...p, cleared: ["easy-01", "easy-01"] }, { ...p, subobjectives: ["easy-01"] }, { ...p, party: p.party.map(c => ({ ...c, coreLevel: 42 })) }, { ...p, party: p.party.map(c => ({ ...c, frameId: "attack-1" })) }]) expect(() => validateRobotOfflineProgress(changed)).toThrow();
  });
});
