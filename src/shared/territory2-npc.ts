export const TERRITORY2_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Territory2Difficulty = typeof TERRITORY2_DIFFICULTIES[number];
export const TERRITORY2_NPC_LABELS: Record<Territory2Difficulty, string> = { easy: "初級", medium: "中級", hard: "上級" };
export function isTerritory2Difficulty(value: unknown): value is Territory2Difficulty {
  return typeof value === "string" && (TERRITORY2_DIFFICULTIES as readonly string[]).includes(value);
}
