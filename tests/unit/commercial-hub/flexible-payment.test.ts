import { describe, expect, it } from "vitest";
import { createHubState, reduceHubState } from "../../../src/games/commercial-hub/engine";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { quoteInvestment, legalInvestments } from "../../../src/games/commercial-hub/investment";
import { quoteBuildingUse } from "../../../src/games/commercial-hub/income";
import { freePaymentOptions } from "../../../src/games/commercial-hub/flexible-payment";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { evaluateNpcInvestment } from "../../../src/games/commercial-hub/npc";
import { nextOperatingEstimate } from "../../../src/games/commercial-hub/economy-evaluation";
import type { HubState, InvestmentAction } from "../../../src/games/commercial-hub/state";
import type { Resources } from "../../../src/games/commercial-hub/types";
function fresh() {
  const s = createHubState("payment", ["A","B","C","D"], new SeededRandom(42), {  auditor:true });
  s.phase="INVESTMENT"; s.currentInvestmentPlayer="A"; s.cityLevel=2; s.round=2;
  s.companies[0]!.resources={cash:20,materials:10,goods:10}; return s;
}
const build = (freePayment: Resources): InvestmentAction => ({type:"BUILD",district:"REDEVELOPMENT",suit:"industry",freePayment});
const cash = {cash:2,materials:0,goods:0};
function upgrade(s: HubState, district: "BUSINESS" | "MARKET" = "MARKET", suit: "commerce" | "industry" = "commerce") {
  s.buildings=[{id:"b",playerId:"A",district,suit,upgraded:false}];
  return {type:"UPGRADE" as const,buildingId:"b",access:"PUBLIC",freePayment:{cash:0,materials:1,goods:1}};
}
describe("formal explicit free investment payments", () => {
  it.each(freePaymentOptions(2))("builds with cash $cash materials $materials goods $goods", payment => {
    const s=fresh(), a=build(payment), q=quoteInvestment(s,"A",a);
    expect(q).toMatchObject({baseCash:3,mandatoryCash:3,freeSlots:2,normalCost:{...payment,cash:3+payment.cash},cost:{...payment,cash:3+payment.cash},auditFee:0,transport:null});
    const next=reduceHubState(s,{...a,playerId:"A"},new SeededRandom(1));
    expect(next.buildings).toHaveLength(1); expect(next.companies[0]!.resources).toEqual({cash:17-payment.cash,materials:10-payment.materials,goods:10-payment.goods});
    expect(s.companies[0]!.resources.cash).toBe(20);
  });
  it("discounts only mandatory cash, adds mismatched build cash, permits all districts/suits", () => {
    const s=fresh();
    expect(quoteInvestment(s,"A",{type:"BUILD",district:"WORKSHOP",suit:"industry",freePayment:cash})).toMatchObject({mandatoryCash:2,districtDiscount:1,cost:{cash:4}});
    for(const district of ["MARKET","BUSINESS"] as const) expect(quoteInvestment(s,"A",{type:"BUILD",district,suit:"industry",freePayment:cash})).toMatchObject({mandatoryCash:4,districtDiscount:0,districtSurcharge:1,cost:{cash:6}});
    const choices=legalInvestments(s,"A").filter(q=>q.action.type==="BUILD");
    expect(new Set(choices.map(q=>q.action.type==="BUILD"&&`${q.action.district}:${q.action.suit}`)).size).toBe(24);
    s.benefits.A!.development=2;
    expect(quoteInvestment(s,"A",{type:"BUILD",district:"WORKSHOP",suit:"industry",freePayment:{cash:0,materials:2,goods:0}})).toMatchObject({mandatoryCash:0,developmentDiscount:2,freeSlots:2,cost:{cash:0,materials:2,goods:0}});
  });
  it("upgrades with free resources, matching outer discount and no mismatched upgrade surcharge", () => {
    const s=fresh(), a=upgrade(s); expect(quoteInvestment(s,"A",a).cost).toEqual({cash:3,materials:1,goods:1});
    const next=reduceHubState(s,{...a,playerId:"A"},new SeededRandom(1));expect(next.buildings[0]!.upgraded).toBe(true);
    upgrade(s,"BUSINESS");expect(quoteInvestment(s,"A",a)).toMatchObject({mandatoryCash:2,districtDiscount:1});
    upgrade(s,"BUSINESS","industry");expect(quoteInvestment(s,"A",a)).toMatchObject({mandatoryCash:3,districtDiscount:0,districtSurcharge:0});
    expect(quoteInvestment(s,"A",{...a,freePayment:cash}).cost.cash).toBe(5);
  });
  it("keeps audit immediate and public/other/own transport deferred and outside free slots", () => {
    const s=fresh(), a=upgrade(s);s.auditor.target="commerce";
    s.routes=[{playerId:"A",district:"MARKET"},{playerId:"B",district:"MARKET"}];
    for(const [access,amount] of [["PUBLIC",2],["B",1],["OWN",0]] as const) {
      const q=quoteInvestment(s,"A",{...a,access});expect(q).toMatchObject({auditFee:1,cost:{cash:4,materials:1,goods:1},transport:{amount}});
      const next=reduceHubState(s,{...a,access,playerId:"A"},new SeededRandom(1));expect(next.companies[0]!.resources.cash).toBe(16);expect(next.transportCharges[0]!.amount).toBe(amount);
    }
    s.companies[0]!.resources.cash=3;expect(()=>quoteInvestment(s,"A",a)).toThrow();
    s.auditor.target="administration";expect(quoteInvestment(s,"A",build({cash:0,materials:1,goods:1})).auditFee).toBe(0);
  });
  it.each([undefined,{cash:0,materials:1,goods:0},{cash:1,materials:2,goods:0},{cash:-1,materials:3,goods:0},{cash:.5,materials:1.5,goods:0},{cash:0,materials:Infinity,goods:0}])("rejects missing/incorrect free slot totals %j", payment => {
    const s=fresh();expect(()=>quoteInvestment(s,"A",{...build(cash),freePayment:payment} as InvestmentAction)).toThrow();
  });
  it("rejects resource shortage and negative post-payment cash without mutating state", () => {
    const s=fresh();s.companies[0]!.resources={cash:3,materials:0,goods:1};const before=structuredClone(s);
    for(const p of freePaymentOptions(2)) expect(()=>reduceHubState(s,{...build(p),playerId:"A"},new SeededRandom(1))).toThrow();
    expect(s).toEqual(before);expect(legalInvestments(s,"A").some(q=>q.action.type==="BUILD"&&q.action.district==="REDEVELOPMENT")).toBe(false);
    expect(buildHubView(s,"A").buildingAvailability.find(x=>x.district==="REDEVELOPMENT"&&x.suit==="industry")!.reason).toContain("不足");
  });
  it("validates strict wire bundles, authenticated actor and spoofed total cost", () => {
    expect(parseHubAction({...build(cash)},"A")).toMatchObject({playerId:"A",freePayment:cash});
    for(const a of [{...build(cash),cost:{cash:0}}, {...build(cash),freePayment:{...cash,extra:1}}, {...build(cash),playerId:"B"}]) expect(()=>parseHubAction(a,"A")).toThrow();
  });
  it("commercial upper yields 3/5 with existing promotion and modernization bonuses", () => {
    const s=fresh();upgrade(s);s.buildings[0]!.upgraded=true;s.phase="PRODUCTION";
    expect(quoteBuildingUse(s,"A","b",1,"PUBLIC").reward.cash).toBe(3);expect(quoteBuildingUse(s,"A","b",2,"PUBLIC").reward.cash).toBe(5);
    s.benefits.A!.promotion=2;s.next!.cards.push({id:"industry-modernization",owner:"A",suit:"commerce",purchasedRound:1,activeRound:2,status:"ACTIVE"});
    expect(quoteBuildingUse(s,"A","b",2,"PUBLIC").reward.cash).toBe(8);
  });
  it("keeps production/sales stock when comparing payments and evaluates post-investment operations", () => {
    const s=fresh();s.companies[0]!.resources={cash:20,materials:2,goods:1};s.routes=[{playerId:"A",district:"WORKSHOP"},{playerId:"A",district:"MARKET"}];
    s.buildings=[{id:"i",playerId:"A",district:"WORKSHOP",suit:"industry",upgraded:false},{id:"c",playerId:"A",district:"MARKET",suit:"commerce",upgraded:false}];
    const v=buildHubView(s,"A"), options=v.investments.filter(q=>q.action.type==="BUILD"&&q.action.district==="WAREHOUSE"&&q.action.suit==="procurement");
    const cashQ=options.find(q=>q.action.type==="BUILD"&&q.action.freePayment!.cash===2)!;
    const stockQ=options.find(q=>q.action.type==="BUILD"&&q.action.freePayment!.materials===2)!;
    for(const type of ["standard","production","commerce","development"] as const) {
      expect(evaluateNpcInvestment(v,type,cashQ).score).toBeGreaterThan(evaluateNpcInvestment(v,type,stockQ).score);
      expect(evaluateNpcInvestment(v,type,cashQ).reasons.join()).toContain("次R調達");
    }
    const projection=nextOperatingEstimate(v,{cash:2,materials:1,goods:0},v.buildings);expect(projection.produced).toBe(2);expect(projection.sold).toBe(1);expect(projection.resources.cash).toBe(5);
  });
});
