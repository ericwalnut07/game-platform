import type { RobotLightChassis, RobotLightModel } from "./lightEnemyPresets";

export type RobotExpansionEnemyModel =
  | { readonly kind: "light"; readonly chassis: RobotLightChassis; readonly model: RobotLightModel }
  | { readonly kind: "solo"; readonly modelId: string };

const lightWeapons = {
  melee: { A: "plasma-blade", B: "plasma-blade", C: "phase-lance" },
  ranged: { A: "pulse-assault", B: "pulse-assault", C: "linear-sniper" },
  defense: { A: "impact-breaker", B: "impact-breaker", C: "quake-hammer" },
  mobile: { A: "plasma-blade", B: "plasma-blade", C: "armor-pile" },
} as const;

const soloWeapons: Readonly<Partial<Record<string, readonly [string, string]>>> = {
  "medium-melee-A": ["plasma-blade", "pulse-assault"],
  "medium-melee-B": ["phase-lance", "pulse-assault"],
  "medium-melee-C": ["phase-lance", "emp-carbine"],
  "medium-ranged-A": ["pulse-assault", "emp-carbine"],
  "medium-ranged-B": ["linear-sniper", "pulse-assault"],
  "medium-ranged-C": ["linear-sniper", "emp-carbine"],
  "medium-defense-A": ["plasma-blade", "pulse-assault"],
  "medium-defense-B": ["impact-breaker", "pulse-assault"],
  "medium-defense-C": ["impact-breaker", "emp-carbine"],
  "medium-mobile-A": ["plasma-blade", "pulse-assault"],
  "medium-mobile-B": ["phase-lance", "pulse-assault"],
  "medium-mobile-C": ["plasma-blade", "emp-carbine"],
  "heavy-heavy-assault-A": ["plasma-blade", "pulse-assault"],
  "heavy-heavy-assault-B": ["phase-lance", "emp-carbine"],
  "heavy-heavy-assault-C": ["plasma-blade", "emp-carbine"],
  "heavy-heavy-artillery-A": ["cluster-cannon", "pulse-assault"],
  "heavy-heavy-artillery-B": ["cluster-cannon", "linear-sniper"],
  "heavy-heavy-artillery-C": ["heavy-missile-cannon", "linear-sniper"],
  "heavy-heavy-armor-A": ["impact-breaker", "pulse-assault"],
  "heavy-heavy-armor-B": ["impact-breaker", "emp-carbine"],
  "heavy-heavy-armor-C": ["quake-hammer", "emp-carbine"],
};

export function getRobotExpansionEnemyWeapons(model: RobotExpansionEnemyModel): readonly string[] {
  if (model.kind === "light") return [lightWeapons[model.chassis][model.model]];
  const weapons = soloWeapons[model.modelId];
  if (!weapons) throw new Error("Unknown expansion enemy model: " + model.modelId);
  return weapons;
}
