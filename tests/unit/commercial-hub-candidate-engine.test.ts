import { describe, expect, it } from "vitest";
import { acquireCandidateContribution, buyCandidateInvestment, candidateProjectPoints, contributeCandidate, createCandidateState } from "../simulation/commercial-hub-candidate-engine";
const base = () => createCandidateState([
  { id: "a", resources: { cash: 30, materials: 5, goods: 5 }, purchases: [] },
  { id: "b", resources: { cash: 30, materials: 5, goods: 5 }, purchases: [] },
]);
describe("isolated new-rules legal action prototype", () => {
  it("locks public projects until their city level", () => {
    const initial = base();
    expect(() => contributeCandidate(initial, "a", "market", 0)).toThrow("Project locked");
    initial.cityLevel = 2;
    expect(contributeCandidate(initial, "a", "market", 0).players[0]?.resources.cash).toBe(28);
    expect(initial.projects[0]?.slots[0]?.owner).toBeNull();
  });
  it("charges both resources from one composite city-hall slot", () => {
    const initial = base();
    initial.cityLevel = 3;
    const after = contributeCandidate(initial, "a", "city-hall", 5);
    expect(after.players[0]?.resources).toEqual({ cash: 30, materials: 4, goods: 4 });
    expect(after.projects[2]?.slots[5]?.owner).toBe("a");
    expect(() => contributeCandidate(after, "b", "city-hall", 5)).toThrow("Slot unavailable");
    after.players[1]!.resources.goods = 0;
    expect(() => contributeCandidate(after, "b", "station", 5)).toThrow("Insufficient resources");
  });
  it("scores completed projects only and transfers a slot without resources refunded", () => {
    let state = base();
    state.cityLevel = 2;
    state = contributeCandidate(state, "b", "market", 0);
    state = contributeCandidate(state, "b", "market", 1);
    const before = { ...state.players[1]!.resources };
    state = acquireCandidateContribution(state, "a", "b", "market", 0);
    expect(state.projects[0]?.slots[0]?.owner).toBe("a");
    expect(state.players[1]?.resources).toEqual(before);
    expect(candidateProjectPoints(state, "market", "a")).toBe(0);
    expect(() => acquireCandidateContribution(state, "a", "b", "market", 1)).toThrow("Not behind target");
  });
  it("costs one published price and refills only same market category", () => {
    const state = base();
    state.cityLevel = 3;
    expect(() => buyCandidateInvestment(state, "a", "business-expansion", false)).toThrow("Investment unavailable");
    const after = buyCandidateInvestment(state, "a", "business-expansion", true);
    expect(after.players[0]?.resources.cash).toBe(20);
    expect(after.market.permanent).toHaveLength(2);
    expect(after.market.counter).toEqual(state.market.counter);
    expect(after.market.permanent).not.toContain("business-expansion");
    expect(() => buyCandidateInvestment(after, "a", "business-expansion", true)).toThrow("Invalid purchase");
  });
  it("cannot purchase audit-only cards when auditor is disabled", () => {
    const state = base();
    state.cityLevel = 3;
    expect(state.market.permanent).not.toContain("audit-contractor");
    expect(state.available).not.toContain("audit-contractor");
  });
});
