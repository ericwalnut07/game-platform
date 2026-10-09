import { describe, expect, it } from "vitest";
import {
  candidateAvailableInvestments, candidateFinalRound, candidateOpeningReward,
  candidateProjects, projectResourceTotals,
} from "../simulation/commercial-hub-next-rules";

describe("commercial-hub candidate rules (isolated fixture)", () => {
  it("defines five public projects, six contribution slots apiece and level 2/3/4 unlocks", () => {
    const projects = candidateProjects();
    expect(projects.map((p) => p.unlockLevel)).toEqual([2, 2, 3, 4, 4]);
    expect(projects.every((p) => p.slots.length === 6)).toBe(true);
    expect(projects.reduce((n, p) => n + p.slots.length, 0)).toBe(30);
    expect(projectResourceTotals(projects)).toEqual({ cash: 71, materials: 6, goods: 6 });
  });
  it("treats the city-hall materials and goods as one combined contribution slot", () => {
    const hall = candidateProjects().find((p) => p.id === "city-hall")!;
    expect(hall.slots.filter((s) => s.cost.materials && s.cost.goods)).toHaveLength(1);
    expect(hall.slots[5]?.cost).toEqual({ cash: 0, materials: 1, goods: 1 });
  });
  it("uses the agreed opening rewards for all suits and ranks", () => {
    expect(candidateOpeningReward("commerce", 1)).toEqual({ cash: 2, materials: 0, goods: 1 });
    expect(candidateOpeningReward("industry", 1)).toEqual({ cash: 2, materials: 1, goods: 0 });
    expect(candidateOpeningReward("procurement", 1)).toEqual({ cash: 3, materials: 0, goods: 0 });
    expect(candidateOpeningReward("administration", 1)).toEqual({ cash: 3, materials: 0, goods: 0 });
    for (const suit of ["commerce", "industry", "procurement", "administration"] as const) {
      expect(candidateOpeningReward(suit, 2)).toEqual({ cash: 2, materials: 0, goods: 0 });
      expect(candidateOpeningReward(suit, 3)).toEqual({ cash: 1, materials: 0, goods: 0 });
      expect(candidateOpeningReward(suit, 4)).toEqual({ cash: 0, materials: 0, goods: 0 });
    }
  });
  it("compares one- and two-round horizon extensions without changing Lv4 decision thresholds", () => {
    expect([null, 6, 8, 9, 10, 13].map((v) => candidateFinalRound(v, "11-13"))).toEqual([13, 11, 11, 12, 13, 13]);
    expect([null, 6, 8, 9, 10, 13].map((v) => candidateFinalRound(v, "12-14"))).toEqual([14, 12, 12, 13, 14, 14]);
  });
  it("keeps the agreed prices and filters audit revenue when the auditor setting is off", () => {
    expect(candidateAvailableInvestments(true)).toHaveLength(10);
    expect(candidateAvailableInvestments(false)).toHaveLength(9);
    expect(candidateAvailableInvestments(true).filter((c) => c.type === "counter").map((c) => c.cost)).toEqual([5, 5, 6, 5]);
  });
});
