import { civicIncome, produce, sell } from "./buildings";
import { BUILDING_NAMES } from "./data";
import { gain, NO_COST, pay } from "./resources";
import { addEvent, companyOf, type HubState } from "./state";

export interface IncomeTask { id: string; name: string; kind: "production" | "sale" | "business" | "civic"; maximum: number; buildingId: string | null }
export type IncomeContext = Pick<HubState, "buildings" | "credits" | "companies" | "abilityUses" | "round" | "eventSeq" | "events">;
export function incomeTasks(state: Pick<IncomeContext, "buildings" | "credits">, playerId: string): IncomeTask[] {
  const owned = state.buildings.filter((b) => b.playerId === playerId);
  const tasks: IncomeTask[] = [];
  for (const upgraded of [true, false]) for (const b of owned.filter((b) => b.suit === "industry" && b.upgraded === upgraded)) {
    tasks.push({ id: b.id, buildingId: b.id, name: BUILDING_NAMES[b.suit][b.upgraded ? 1 : 0], kind: "production", maximum: 1 });
  }
  if (state.credits[playerId]!.businessSale > 0) tasks.push({ id: "business-bonus", buildingId: null, name: "ビジネス街の販売権", kind: "business", maximum: 1 });
  for (const upgraded of [true, false]) for (const b of owned.filter((b) => b.suit === "commerce" && b.upgraded === upgraded)) {
    tasks.push({ id: b.id, buildingId: b.id, name: BUILDING_NAMES[b.suit][b.upgraded ? 1 : 0], kind: "sale", maximum: b.upgraded ? 2 : 1 });
  }
  for (const b of owned.filter((b) => b.suit === "civic")) tasks.push({ id: b.id, buildingId: b.id, name: BUILDING_NAMES[b.suit][b.upgraded ? 1 : 0], kind: "civic", maximum: 1 });
  return tasks;
}
/** Shared pure preview/validation. The caller owns phase/actor permission checks. */
export function resolveIncome<T extends IncomeContext>(state: T, playerId: string, selections: Record<string, number>): T {
  const next = structuredClone(state);
  const tasks = incomeTasks(next, playerId);
  if (Object.keys(selections).some((key) => !tasks.some((task) => task.id === key))) throw new Error("収入の対象が不正です");
  let resources = companyOf(next, playerId).resources;
  for (const task of tasks) {
    const amount = selections[task.id] ?? 0;
    if (!Number.isInteger(amount) || amount < 0 || amount > task.maximum) throw new Error("能力の使用数が不正です");
    if (amount === 0) continue;
    const b = next.buildings.find((entry) => entry.id === task.buildingId);
    if (task.kind === "business") {
      resources = gain(pay(resources, { ...NO_COST, goods: 1 }), { ...NO_COST, cash: 3 });
      next.credits[playerId]!.businessSale--;
    } else if (task.kind === "production") {
      const used = produce(b!, resources, next.round, next.abilityUses);
      resources = used.resources; next.abilityUses = used.used;
      if (next.credits[playerId]!.productionBoost > 0) {
        resources = gain(resources, { ...NO_COST, goods: 1 }); next.credits[playerId]!.productionBoost--;
        addEvent(next, "DISTRICT_PRODUCTION_BONUS", playerId, { buildingId: b!.id });
      }
    } else {
      const used = task.kind === "civic" ? civicIncome(b!, resources, next.round, next.abilityUses) : sell(b!, resources, amount, next.round, next.abilityUses);
      resources = used.resources; next.abilityUses = used.used;
    }
    addEvent(next, "ABILITY_USED", playerId, { buildingId: task.buildingId, kind: task.kind, name: task.name, amount });
  }
  next.companies = next.companies.map((company) => company.playerId === playerId ? { ...company, resources } : company);
  return next;
}
export function productiveIncomePlan(state: IncomeContext, playerId: string): Record<string, number> {
  const plan: Record<string, number> = {};
  for (const task of incomeTasks(state, playerId)) {
    for (let amount = task.maximum; amount >= 0; amount--) {
      try { resolveIncome(state, playerId, { ...plan, [task.id]: amount }); plan[task.id] = amount; break; } catch { /* Try a smaller quantity. */ }
    }
  }
  return plan;
}
