import { robotCellToPosition, type RobotPosition } from "./movement";
import type { RobotBattleCoreState } from "./battleState";
import type { RobotStagePlan, RobotStageUnit } from "./types";

/** Adopted 2026-11-24: Normal 17 missions, Hard 28. Event triggers inherit the
 * original wave receipt, so retries cannot create a second event or squad. */
const roster: Readonly<Record<number, readonly [string | null, string, number | null]>> = {
  2: [null, "melee", 4], 3: [null, "defense", null], 4: ["melee", "melee", null],
  5: [null, "ranged", 4], 6: ["mobile", "mobile", 6], 7: [null, "mobile", null],
  8: ["melee", "melee", 4], 9: [null, "mobile", 4], 10: ["ranged", "ranged", null],
  11: ["ranged", "ranged", null], 12: [null, "melee", 5], 13: ["defense", "defense", 6],
  14: ["mobile", "mobile", null], 15: ["ranged", "heavy-armor", 5], 16: [null, "melee", 5],
  17: ["mobile", "mobile", 5], 18: ["melee", "heavy-armor", null], 19: [null, "ranged", 6],
  20: ["defense", "heavy-armor", 7], 21: ["mobile", "heavy-assault", null], 22: [null, "ranged", 7],
  23: ["defense", "heavy-assault", null], 24: [null, "melee", null], 25: ["ranged", "heavy-armor", null],
  26: [null, "defense", 6], 27: ["ranged", "heavy-assault", null],
  28: ["mobile", "heavy-armor", 7], 29: ["melee", "heavy-assault", null],
};
export function getRobotPlaytestReinforcement(stage: RobotStagePlan): { unit: RobotStageUnit; round: number | null } | null {
  const row = roster[stage.key.missionNumber];
  const archetype = row && (stage.key.difficulty === "normal" ? row[0] : stage.key.difficulty === "hard" ? row[1] : null);
  if (!archetype) return null;
  const model = [...stage.initialEnemies, ...stage.reinforcements.map(w => w.squad)].find(u => u.kind !== "boss" && u.model)?.model ?? "B";
  return { round: row![2], unit: {
    id: `playtest-m${stage.key.missionNumber}-reinforcement`, kind: archetype.startsWith("heavy-") ? "heavy" : "medium",
    chassisOrArchetype: archetype, model, cells: [], enemyCoreLevel: stage.referenceEnemyCoreLevel, weaponLevel: stage.enemyWeaponLevel,
  } };
}
const distance = (a: RobotPosition, b: RobotPosition) => Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y));
/** Called after the original squads have claimed their cells. Reserve their
 * fallback pads too, and keep away from defense/escort objects and their route. */
export function chooseRobotPlaytestReinforcement(s: RobotBattleCoreState, stage: RobotStagePlan, round: number,
  occupied: readonly RobotPosition[], structures: readonly RobotPosition[]): RobotPosition | null {
  const addition = !s.expansionDifficulty && getRobotPlaytestReinforcement(stage);
  if (!addition || s.playtestReinforcementSpawned) return null;
  const receipts = s.objective.kind === "early" ? s.objective.state.spawnedWaveIds : [];
  if (addition.round === null ? !stage.reinforcements.some(w => receipts.includes(w.id)) : round < addition.round) return null;
  const wave = stage.reinforcements[0];
  const branchId = s.objective.kind === "early" ? s.objective.state.waveBranch : null;
  const branch = wave?.spawnBranches.find(b => b.survivingDepotId === branchId);
  const anchors = (branch?.memberCells ?? wave?.initialCells ?? []).map(robotCellToPosition);
  if (!anchors.length) anchors.push(...stage.initialEnemies.flatMap(u => u.cells.map(robotCellToPosition)));
  const reserved = stage.reinforcements.flatMap(w => [...w.initialCells, ...w.fallbackCells, ...w.spawnBranches.flatMap(b => [...b.memberCells, ...b.fallbackCells])]).map(robotCellToPosition);
  const blocked = [...occupied, ...s.board.walls, ...structures, ...reserved, ...(s.decoys ?? []).map(d=>d.cell)];
  const objects = s.objective.kind === "early" ? s.objective.state.objects.objects : [];
  const protectedCells = objects.filter(o => o.kind === "transport" || o.kind === "facility").flatMap(o => [...o.cells, ...(o.route ?? [])]);
  const choices: RobotPosition[] = [];
  for (let y=0;y<stage.board.height;y++) for(let x=0;x<stage.board.width;x++) {
    const p={x,y}, near=Math.min(...anchors.map(a=>distance(p,a)));
    if (near>4 || blocked.some(b=>distance(p,b)===0) || protectedCells.some(b=>distance(p,b)<=2)) continue;
    choices.push(p);
  }
  choices.sort((a,b)=>Math.min(...anchors.map(c=>distance(a,c)))-Math.min(...anchors.map(c=>distance(b,c))) || a.y-b.y || a.x-b.x);
  return choices[0] ?? null;
}
