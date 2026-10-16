import { describe, expect, it } from "vitest";
import { commercialHubGameModule } from "../../../src/games/commercial-hub/module";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { reduceHubState } from "../../../src/games/commercial-hub/engine";
import { contributionValue, projectValue, FORMAL_PROJECT_SCORING } from "../../../src/games/commercial-hub/projects";
import { companyValue, refreshValues } from "../../../src/games/commercial-hub/scoring";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { evaluateNpcInvestment } from "../../../src/games/commercial-hub/npc";
import { majorPrice } from "../../../src/games/commercial-hub/next-rules";
import { createArchive, publicArchive } from "../../../src/server/lib/hub-archive";
import type { HubState, HubClientAction } from "../../../src/games/commercial-hub/state";
import type { PublicProject } from "../../../src/games/commercial-hub/types";

const players = ["A", "B", "C", "D"];
function fresh() {
  const s = commercialHubGameModule.createInitialState({ matchId: "project-score", players: players.map(id => ({ id })), rng: new SeededRandom(42), config: { trickRule: "NORMAL", auditor: false } } as Parameters<typeof commercialHubGameModule.createInitialState>[0]);
  s.round = 4; s.cityLevel = 3; s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A";
  s.publicProjects.forEach(p => p.availableRound = 1);
  s.companies.forEach(c => c.resources = { cash: 30, materials: 12, goods: 12 });
  return s;
}
function own(p: PublicProject, owners: (string | null)[]) { p.slots.forEach((slot, i) => slot.playerId = owners[i]!); }
const act = (s: HubState, action: HubClientAction, playerId = "A") => reduceHubState(s, { ...action, playerId }, new SeededRandom(1));

describe("formal v1 public project scoring", () => {
  it("sets the score marker only for new formal matches and rejects client-supplied markers", () => {
    expect(() => commercialHubGameModule.parseConfig({ projectScoringRule: FORMAL_PROJECT_SCORING })).toThrow();
    for (const rulesVariant of ["V05", "NEXT"] as const) {
      const config = commercialHubGameModule.parseConfig({ rulesVariant });
      const state = commercialHubGameModule.createInitialState({ matchId: rulesVariant, players: players.map(id => ({ id })), rng: new SeededRandom(2), config } as Parameters<typeof commercialHubGameModule.createInitialState>[0]);
      expect(state.projectScoringRule).toBeUndefined();
      expect(contributionValue(1, state)).toBe(1);
    }
  });
  it.each([0, 1, 2, 3, 4, 5, 6])("scores %s completed slots at two points each and unfinished at zero", count => {
    const s = fresh(), p = s.publicProjects[0]!;
    expect(s.projectScoringRule).toBe(FORMAL_PROJECT_SCORING);
    own(p, Array.from({ length: 6 }, (_, i) => i < count ? "A" : "B"));
    expect(contributionValue(count, s)).toBe(count * 2);
    expect(projectValue(p, "A", s)).toBe(count * 2);
    expect(projectValue(p, "C", s)).toBe(0);
    p.slots[5]!.playerId = null;
    expect(projectValue(p, "A", s)).toBe(0);
    expect(projectValue(p, "B", s)).toBe(0);
  });

  it.each(["cash","both","half","simple"] as const)("experiment %s rewards every contributor on completion and tracks a single finisher", mode => {
    const s=fresh(),p=s.publicProjects[0]!;
    s.completionRewardExperiment=mode;
    own(p,["B","B","C","C","D",null]);
    const quote=quoteInvestment(s,"A",{type:"CONTRIBUTE",projectId:p.id,slot:5,benefit:"NONE"});
    const cashBefore=Object.fromEntries(s.companies.map(c=>[c.playerId,c.resources.cash]));
    const next=act(s,{type:"CONTRIBUTE",projectId:p.id,slot:5,benefit:"NONE"});
    const owners={A:1,B:2,C:2,D:1} as const;
    const cashPerSlot=["half","simple"].includes(mode)?1:2, finisherPoints=mode==="half"?1:mode==="both"?2:0;
    for(const player of players){
      const paid=player==="A"?quote.cost.cash:0;
      expect(next.companies.find(c=>c.playerId===player)!.resources.cash).toBe(cashBefore[player]+cashPerSlot*owners[player as keyof typeof owners]-paid);
      expect(next.companyValues[player]!.projects).toBe(owners[player as keyof typeof owners]*2 + (player==="A"?finisherPoints:0));
    }
    expect(next.publicProjects[0]!.completedBy).toBe(mode==="cash"||mode==="simple"?undefined:"A");
    expect(next.events.filter(e=>["PROJECT_COMPLETION_REWARD_EXPERIMENT", "PROJECT_COMPLETION_CASH"].includes(e.type))).toHaveLength(1);
    const restored=JSON.parse(JSON.stringify(next)) as HubState;
    refreshValues(restored);
    expect(restored.companyValues.A!.projects).toBe(2+finisherPoints);
  });
  it("does not grant experimental cash or finisher points before completing all six slots", () => {
    const s=fresh(),p=s.publicProjects[0]!;
    s.completionRewardExperiment="both";
    own(p,["B","B","C","C",null,null]);
    const after=act(s,{type:"CONTRIBUTE",projectId:p.id,slot:4,benefit:"NONE"});
    expect(after.publicProjects[0]!.completedBy).toBeUndefined();
    expect(after.events.filter(e=>["PROJECT_COMPLETION_REWARD_EXPERIMENT", "PROJECT_COMPLETION_CASH"].includes(e.type))).toHaveLength(0);
    expect(after.companyValues.A!.projects).toBe(0);
  });
  it("enables completion cash B by default for new formal matches without a finisher bonus", () => {
    const state = fresh();
    expect(state.rulesVersion).toBe("1.0");
    expect(state.completionRewardExperiment).toBe("simple");
    const project = state.publicProjects[0]!;
    own(project, ["B", "B", "C", "C", "D", null]);
    const cost = quoteInvestment(state, "A", { type: "CONTRIBUTE", projectId: project.id, slot: 5, benefit: "NONE" }).cost.cash;
    const cashBefore = Object.fromEntries(state.companies.map(c => [c.playerId, c.resources.cash]));
    const next = act(state, { type: "CONTRIBUTE", projectId: project.id, slot: 5, benefit: "NONE" });
    for (const [player, slots] of Object.entries({ A: 1, B: 2, C: 2, D: 1 })) {
      expect(next.companies.find(c => c.playerId === player)!.resources.cash)
        .toBe(cashBefore[player] + slots - (player === "A" ? cost : 0));
      expect(next.companyValues[player]!.projects).toBe(slots * 2);
    }
    expect(next.publicProjects[0]!.completedBy).toBeUndefined();
  });
  it("rejects experimental completion rewards in public game configuration", () => {
    expect(() => commercialHubGameModule.parseConfig({completionRewardExperiment:"both"})).toThrow();
    expect(fresh().completionRewardExperiment).toBe("simple");
  });
  it("aggregates multiple projects for all players and preserves every other value component", () => {
    const s = fresh();
    own(s.publicProjects[0]!, ["A", "A", "B", "C", "C", "C"]);
    own(s.publicProjects[1]!, ["A", "B", "B", "B", "D", "D"]);
    own(s.publicProjects[2]!, ["A", "A", "A", "A", "A", null]);
    s.buildings = [{ id: "shop", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true }];
    s.routes = [{ playerId: "A", district: "MARKET" }];
    refreshValues(s);
    expect(players.map(id => s.companyValues[id]!.projects)).toEqual([6, 8, 6, 4]);
    for (const c of s.companies) {
      const legacy = companyValue(c, s.buildings, s.routes, s.publicProjects, undefined, true);
      const actual = s.companyValues[c.playerId]!;
      for (const key of ["buildings", "routes", "cash", "inventory"] as const) expect(actual[key]).toBe(legacy[key]);
      expect(actual.total - legacy.total).toBe(actual.projects - legacy.projects);
      expect(buildHubView(s, c.playerId).ownValue).toEqual(actual);
    }
  });

  it("keeps priority costs, exclusivity and completion development while applying new points", () => {
    const s = fresh(), p = s.publicProjects[0]!;
    own(p, [null, "B", "B", "C", "C", "C"]);
    s.next!.cards.push({ id: "public-works-priority", owner: "A", purchasedRound: 2, activeRound: 3, status: "ACTIVE", project: p.id });
    expect(majorPrice(s, "public-works-priority")).toBe(9);
    expect(() => quoteInvestment(s, "B", { type: "CONTRIBUTE", projectId: p.id, slot: 0, benefit: "NONE" })).toThrow();
    const action = { type: "CONTRIBUTE" as const, projectId: p.id, slot: 0, benefit: "NONE" as const };
    const quote = quoteInvestment(s, "A", action);
    const after = act(s, action);
    expect(after.next!.cards[0]!.discountUsedRound).toBe(4);
    expect(after.companies[0]!.resources.cash).toBe(s.companies[0]!.resources.cash - quote.cost.cash + 1);
    expect(after.cityDevelopment - s.cityDevelopment).toBe(5);
    expect(players.map(id => after.companyValues[id]!.projects)).toEqual([2, 4, 6, 0]);
  });

  it("scores the new owner after acquisition and subsequent completion, including restore", () => {
    let s = fresh(); const id = s.publicProjects[0]!.id;
    own(s.publicProjects[0]!, ["B", "B", "B", "C", null, null]);
    s.phase = "MAJOR_SELECTION";
    s.next!.cards.push({ id: "public-works-acquisition", owner: "A", purchasedRound: 3, activeRound: 4, status: "ACTIVE" });
    s.next!.queue = ["public-works-acquisition"]; s.next!.returnPhase = "PROCUREMENT";
    expect(majorPrice(s, "public-works-acquisition")).toBe(5);
    s = act(s, { type: "CHOOSE_MAJOR", cardId: "public-works-acquisition", projectId: id, slot: 0 });
    expect(s.publicProjects[0]!.slots[0]!.playerId).toBe("A");
    expect(s.companyValues.A!.projects).toBe(0);
    s = JSON.parse(JSON.stringify(s)) as HubState;
    for (const [slot, playerId] of [[4, "D"], [5, "A"]] as const) {
      s.phase = "INVESTMENT"; s.currentInvestmentPlayer = playerId;
      s = act(s, { type: "CONTRIBUTE", projectId: id, slot, benefit: "NONE" }, playerId);
    }
    expect(players.map(id => s.companyValues[id]!.projects)).toEqual([4, 4, 2, 2]);
  });

  it("uses the adopted marginal value in all NPC policies, including final-round decisions", () => {
    const s = fresh(), id = s.publicProjects[0]!.id;
    own(s.publicProjects[0]!, [null, "B", "B", "C", "C", "D"]);
    const old = structuredClone(s); delete old.projectScoringRule;
    const action = { type: "CONTRIBUTE" as const, projectId: id, slot: 0, benefit: "NONE" as const };
    for (const profile of ["standard", "production", "commerce", "development"] as const) {
      const current = evaluateNpcInvestment(buildHubView(s, "A"), profile, quoteInvestment(s, "A", action));
      const prior = evaluateNpcInvestment(buildHubView(old, "A"), profile, quoteInvestment(old, "A", action));
      expect(current.reasons.join()).toContain("増分2点");
      expect(prior.reasons.join()).toContain("増分1点");
      expect(current.score).toBeGreaterThan(prior.score);
      const final = { ...s, round: s.finalRound }, oldFinal = { ...old, round: old.finalRound };
      expect(evaluateNpcInvestment(buildHubView(final, "A"), profile, quoteInvestment(final, "A", action)).score
        - evaluateNpcInvestment(buildHubView(oldFinal, "A"), profile, quoteInvestment(oldFinal, "A", action)).score).toBe(1);
    }
  });

  it.each(["0.5", "next-trial-1", "next-trial-2", "next-trial-3", "next-trial-4", "1.0"] as const)("preserves saved %s scoring without a marker", version => {
    const s = fresh(); s.rulesVersion = version; delete s.projectScoringRule;
    const restored = JSON.parse(JSON.stringify(s)) as HubState;
    for (let count = 0; count <= 6; count++) {
      own(restored.publicProjects[0]!, Array.from({ length: 6 }, (_, i) => i < count ? "A" : "B"));
      expect(projectValue(restored.publicProjects[0]!, "A", restored)).toBe(count === 0 ? 0 : count * 2 - 1);
    }
    expect(act(restored, { type: "PASS_INVESTMENT" }).projectScoringRule).toBeUndefined();
    if (version !== "1.0") expect(contributionValue(1, { rulesVersion: version, projectScoringRule: FORMAL_PROJECT_SCORING })).toBe(1);
  });

  it("persists scoring through actions, JSON restore, views, archives and final results", () => {
    const s = fresh(); own(s.publicProjects[0]!, ["A", "A", "B", "C", "C", "D"]);
    s.round = s.finalRound; s.currentInvestmentPass = 2; s.investmentTurnIndex = 3;
    const restored = JSON.parse(JSON.stringify(s)) as HubState;
    const finished = act(restored, { type: "PASS_INVESTMENT" });
    expect(finished.phase).toBe("FINISHED");
    expect(buildHubView(finished, "A").projectScoringRule).toBe(FORMAL_PROJECT_SCORING);
    expect(finished.result!.ranking.find(r => r.playerId === "A")!.value.projects).toBe(4);
    const archive = publicArchive(finished, createArchive(finished, "TEST01", 0));
    expect(archive.metadata.projectScoringRule).toBe(FORMAL_PROJECT_SCORING);
    expect(archive.snapshot.projectScoringRule).toBe(FORMAL_PROJECT_SCORING);
    expect(act(s, { type: "PASS_INVESTMENT" }).result).toEqual(finished.result);
  });
});



describe("adopted B completion compatibility", () => {
  it.each([0,1,2,3,4,5,6])("pays A exactly %s cash once for its final slot ownership", count => {
    const s=fresh(), p=s.publicProjects[0]!;
    const owners: (string | null)[]=Array.from({length:6},(_,i)=>i<count?"A":"B");
    const finisher=owners[5]!; owners[5]=null;
    own(p,owners); s.currentInvestmentPlayer=finisher;
    const action={type:"CONTRIBUTE" as const,projectId:p.id,slot:5,benefit:"NONE" as const};
    const cost=quoteInvestment(s,finisher,action).cost.cash;
    const next=act(s,action,finisher);
    expect(next.companies[0]!.resources.cash).toBe(30+count-(finisher==="A"?cost:0));
    expect(next.companyValues.A!.projects).toBe(count*2);
    expect(next.events.filter(e=>e.type==="PROJECT_COMPLETION_CASH")).toHaveLength(1);
    expect(next.publicProjects[0]!.completedBy).toBeUndefined();
    const restored=JSON.parse(JSON.stringify(next)) as HubState;
    refreshValues(restored);
    expect(restored.companies).toEqual(next.companies);
    expect(()=>quoteInvestment(restored,finisher,action)).toThrow();
    expect(act(s,action,finisher)).toEqual(next);
  });
  it.each(["0.5","next-trial-4","1.0"] as const)("does not retrofit B onto a restored %s game without a marker", version => {
    const s=fresh(); s.rulesVersion=version; delete s.completionRewardExperiment;
    const p=s.publicProjects[0]!; own(p,["B","B","C","C","D",null]);
    const action={type:"CONTRIBUTE" as const,projectId:p.id,slot:5,benefit:"NONE" as const};
    const cost=quoteInvestment(s,"A",action).cost;
    const next=act(JSON.parse(JSON.stringify(s)),action);
    expect(next.companies[0]!.resources.cash).toBe(30-cost.cash);
    expect(next.companies.slice(1).map(c=>c.resources.cash)).toEqual([30,30,30]);
    expect(next.completionRewardExperiment).toBeUndefined();
    expect(next.events.some(e=>e.type==="PROJECT_COMPLETION_CASH")).toBe(false);
  });
  it("does not pay unfinished projects and preserves markers in view and public archive", () => {
    const s=fresh(), p=s.publicProjects[0]!; own(p,["B","B","C","C",null,null]);
    const action={type:"CONTRIBUTE" as const,projectId:p.id,slot:4,benefit:"NONE" as const};
    const cost=quoteInvestment(s,"A",action).cost.cash, next=act(s,action);
    expect(next.companies[0]!.resources.cash).toBe(30-cost);
    expect(next.companyValues.A!.projects).toBe(0);
    expect(next.events.some(e=>e.type==="PROJECT_COMPLETION_CASH")).toBe(false);
    expect(buildHubView(next,"A").completionRewardExperiment).toBe("simple");
    const archive=publicArchive(next,createArchive(next,"BTEST1",0));
    expect(archive.metadata.completionRewardExperiment).toBe("simple");
    expect(archive.snapshot.completionRewardExperiment).toBe("simple");
  });
  it("all four NPCs value B cash while retaining their economic policies", () => {
    const s=fresh(), p=s.publicProjects[0]!; own(p,["A","B","C","C","D",null]);
    const withB=buildHubView(s,"A"), old=structuredClone(s); delete old.completionRewardExperiment;
    const action={type:"CONTRIBUTE" as const,projectId:p.id,slot:5,benefit:"NONE" as const};
    const quote=quoteInvestment(s,"A",action);
    for(const type of ["standard","production","commerce","development"] as const) {
      const chosen=evaluateNpcInvestment(withB,type,quote);
      expect(chosen.score).toBeGreaterThan(evaluateNpcInvestment(buildHubView(old,"A"),type,quote).score);
      expect(chosen.reasons.join()).toContain("完成時還元見込み：資金2");
      if(type==="development") expect(chosen.reasons.join()).toContain("将来資金生成差");
    }
  });
});
