import { expect, it } from "vitest";
import catalog from "../../docs/design/robot-tactics/basic-parts.json";
import { getRobotLoadoutPlan, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotBasicPartComparison } from "../../src/games/robot-tactics/partComparison";
import { createRobotOfflineProgress, getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotPerformanceReport, createRobotPerformanceDraft, setRobotPerformancePart } from "../../src/games/robot-tactics/performanceCheck";

it("resolves the adopted expansion checkpoints and rounds between adjacent anchors", () => {
  const plasma = [1, 5, 10, 14, 15, 16, 18, 20].map(level => resolveRobotBasicPart("plasma-blade", level));
  expect(plasma.map(p => [p.weaponPower, p.cap])).toEqual([
    [98, 42], [159, 48], [245, 57], [270, 61], [276, 62], [282, 63], [294, 65], [306, 67],
  ]);
  const engine = [1, 10, 15, 20].map(level => resolveRobotBasicPart("assault-mobility-engine", level).statModifiers);
  expect(engine).toEqual([14, 35, 40, 44].map(spd => ({ mov: 1, hp: -25, spd })));
  expect([1, 5, 10, 15, 20].map(level => resolveRobotBasicPart("high-speed-circulation-support", level).effect)).toEqual(
    [6, 10, 15, 17, 19].map(amount => ({ kind: "energy-regeneration", amount })),
  );
  expect(resolveRobotBasicPart("large-capacity-regeneration-support", 18).effect).toEqual({ kind: "energy-regeneration", amount: 15 });
});

it("keeps the 22 future Hardest rewards out of existing inventory and exposes their data in the sandbox", () => {
  const progress = createRobotOfflineProgress();
  const ids = catalog.parts.filter(p => p.acquisition.difficulty === "hardest").map(p => p.id);
  expect(ids).toHaveLength(22);
  expect(new Set(ids).size).toBe(22);
  expect(ids.some(id => id in progress.partLevels)).toBe(false);
  const draft = setRobotPerformancePart(createRobotPerformanceDraft(progress), "weapon1", { partId: "plasma-blade", level: 18 });
  const report = getRobotPerformanceReport(progress, draft);
  expect(report.plan.basic.weapon1.weaponPower).toBe(294);
  expect(report.dealt).toBeNull();
  expect(report.received).not.toBeNull();
  expect(report.equipmentIssues).toContain("Locked basic part: plasma-blade");
});

it("enforces the five dedicated-weapon frame families without restricting the general weapon", () => {
  const progress = createRobotOfflineProgress(), core = progress.party[0]!;
  const availability = getRobotOfflineAvailability(progress);
  for (const [id, allowed, disallowed] of [
    ["overdrive-saber", "attack-2-a", "defense-1"],
    ["dual-burst-rifle", "attack-2-b", "mobile-1"],
    ["fortress-mace", "defense-2", "attack-1"],
    ["aether-rail-cannon", "reactor-2", "all-rounder"],
    ["accel-lancer", "mobile-2", "reactor-1"],
    ["meteor-buster", "all-rounder", null],
  ] as const) {
    const plan = (frameId: string) => getRobotLoadoutPlan({
      ...core, frameId, coreLevel: 81, basic: { ...core.basic, weapon1: { partId: id, level: 18 } },
    }, { ...availability, frames: [frameId], basicParts: [...availability.basicParts, id] });
    expect(plan(allowed).canEquip).toBe(true);
    if (disallowed) expect(plan(disallowed).blockingIssues).toContain("Wrong frame family: " + id);
  }
  expect(getRobotBasicPartComparison({ partId: "fortress-mace", level: 18 }, core.basic.weapon1)).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: "装備条件", value: "防御型専用" }),
    expect.objectContaining({ label: "固有効果", value: expect.stringContaining("EN10・60%反撃") }),
  ]));
});
