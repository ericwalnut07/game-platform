import { assertFourPlayers } from "./cards";
import { ROUTE_EDGES } from "./data";
import { projectValue } from "./projects";
import { assertResources } from "./resources";
import type { Building, Company, PlayerId, PublicProject, RouteOwnership, ValueBreakdown } from "./types";

export function cityLevel(development: number): 1 | 2 | 3 | 4 {
  if (!Number.isSafeInteger(development) || development < 0) throw new Error("都市発展度が不正です");
  return development >= 28 ? 4 : development >= 18 ? 3 : development >= 8 ? 2 : 1;
}
export function companyValue(company: Company, buildings: readonly Building[], routes: RouteOwnership, projects: readonly PublicProject[]): ValueBreakdown {
  assertResources(company.resources);
  const owned = buildings.filter((building) => building.playerId === company.playerId);
  const scores = {
    buildings: owned.length * 3,
    upgrades: owned.filter((building) => building.upgraded).length * 2,
    routes: Math.min(5, ROUTE_EDGES.filter((edge) => routes[edge.id] === company.playerId).length),
    projects: projects.reduce((sum, project) => sum + projectValue(project, company.playerId), 0),
    cash: Math.floor(company.resources.cash / 4),
    inventory: Math.floor((company.resources.materials + company.resources.goods) / 3)
  };
  return { ...scores, total: Object.values(scores).reduce((sum, points) => sum + points, 0) };
}
export interface RankedCompany { readonly playerId: PlayerId; readonly value: number; readonly cash: number; readonly rank: number }
export function rankCompanies(companies: readonly Company[], values: Readonly<Record<PlayerId, number>>): RankedCompany[] {
  assertFourPlayers(companies.map((company) => company.playerId));
  for (const company of companies) {
    assertResources(company.resources);
    if (!Object.hasOwn(values, company.playerId) || !Number.isSafeInteger(values[company.playerId]) || values[company.playerId]! < 0) throw new Error("企業価値が不正です");
  }
  const ordered = companies.map((company) => ({ playerId: company.playerId, value: values[company.playerId]!, cash: company.resources.cash }))
    .sort((a, b) => b.value - a.value || b.cash - a.cash);
  let rank = 1;
  return ordered.map((entry, index) => {
    if (index > 0 && (entry.value !== ordered[index - 1]!.value || entry.cash !== ordered[index - 1]!.cash)) rank = index + 1;
    return { ...entry, rank };
  });
}
/** Call at round end only, after every player's income/production is settled. */
export function roundEndResult(round: number, development: number, scheduledFinalRound: number | null, companies: readonly Company[], values: Readonly<Record<PlayerId, number>>) {
  if (!Number.isSafeInteger(round) || round < 1 || (scheduledFinalRound !== null && (!Number.isSafeInteger(scheduledFinalRound) || scheduledFinalRound < 1))) {
    throw new Error("ラウンドが不正です");
  }
  const level = cityLevel(development);
  const ranking = rankCompanies(companies, values);
  const finalRound = scheduledFinalRound ?? (level === 4 ? round + 1 : null);
  const reason = ranking[0]!.value >= 25 ? "VALUE_25" as const
    : finalRound !== null && round >= finalRound ? "CITY_LV4_FINAL_ROUND" as const : null;
  return {
    cityLevel: level, finalRound,
    result: reason === null ? null : { reason, round, ranking, winners: ranking.filter((entry) => entry.rank === 1).map((entry) => entry.playerId) }
  };
}
