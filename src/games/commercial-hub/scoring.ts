import { projectValue } from "./projects";
import type { HubState, RankedCompany } from "./state";
import type { Building, Company, PublicProject, Route, ValueBreakdown } from "./types";
export function cityLevel(development: number): 1 | 2 | 3 | 4 { return development >= 64 ? 4 : development >= 32 ? 3 : development >= 16 ? 2 : 1; }
export function companyValue(company: Company, buildings: readonly Building[], routes: readonly Route[], projects: readonly PublicProject[], prediction?: number): ValueBreakdown {
  const owned = buildings.filter((b) => b.playerId === company.playerId);
  const score = { buildings: owned.reduce((n, b) => n + (b.upgraded ? 5 : 3), 0), routes: Math.min(8, routes.filter((r) => r.playerId === company.playerId).length), projects: projects.reduce((n, p) => n + projectValue(p, company.playerId), 0), cash: Math.floor(Math.max(0, company.resources.cash) / 6), inventory: Math.floor((company.resources.materials + company.resources.goods) / 4) };
  const assets = score.buildings + score.routes + score.projects;
  return { ...score, ...(prediction === undefined ? {} : { prediction }), assets, total: assets + score.cash + score.inventory + (prediction ?? 0) };
}
export function rankCompanies(companies: readonly Company[], values: Record<string, ValueBreakdown>): RankedCompany[] {
  const ordered = companies.map((c) => ({ playerId: c.playerId, cash: c.resources.cash, deficit: c.resources.cash < 0, value: values[c.playerId]!, rank: 1, tieBreak: "TIED" as RankedCompany["tieBreak"] }));
  const keys = (a: RankedCompany) => [a.deficit ? 0 : 1, a.value.total, a.value.assets, a.value.buildings, a.value.projects];
  const firstDifference = (a: RankedCompany, b: RankedCompany) => keys(a).findIndex((v, i) => v !== keys(b)[i]);
  ordered.sort((a, b) => { const k = firstDifference(a, b); return k < 0 ? 0 : keys(b)[k]! - keys(a)[k]!; });
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i]!, previous = ordered[i - 1], next = ordered[i + 1];
    if (previous) current.rank = firstDifference(previous, current) < 0 ? previous.rank : i + 1;
    const other = next ?? previous;
    if (other) current.tieBreak = (["DEFICIT", "VALUE", "ASSETS", "BUILDINGS", "PROJECTS"] as const)[firstDifference(current, other)] ?? "TIED";
  }
  return ordered;
}
export function refreshValues(state: HubState): void { state.companyValues = Object.fromEntries(state.companies.map((c) => [c.playerId, companyValue(c, state.buildings, state.routes, state.publicProjects, state.config.trickRule === "BID" ? state.predictionPoints[c.playerId] : undefined)])); }
