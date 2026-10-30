import type { RobotJson } from "../../../games/robot-tactics/offlineSession";
import type { RobotPosition } from "../../../games/robot-tactics/movement";
import type { RobotAiInstruction, RobotAiMode } from "../../../games/robot-tactics/aiInstructions";

export type RobotBattleCategory = "move" | "attack" | "special" | "formation" | "wait";
export type RobotBattleSelectionRole = "destination" | "participant" | "target";
export interface RobotBattleUnitView {
  readonly id: string; readonly name: string; readonly kind: "controlled" | "friendly-ai" | "enemy";
  readonly cell: RobotPosition; readonly hp: number; readonly maxHp: number; readonly en: number; readonly maxEn: number;
  readonly weapons: readonly { readonly name: string; readonly level: number }[];
}
export interface RobotBattleActorView {
  readonly id: string; readonly name: string; readonly kind: RobotBattleUnitView["kind"];
  /** All live members of a lightweight squad share ONE queue item. */
  readonly unitIds: readonly string[];
}
export interface RobotBattleSelection {
  readonly destination: RobotPosition | null; readonly participantIds: readonly string[]; readonly targetIds: readonly string[];
}
export interface RobotBattleChoice {
  readonly id: string; readonly commandId: string; readonly selection: RobotBattleSelection; readonly payload: RobotJson;
}
export interface RobotBattleCommand {
  readonly id: string; readonly label: string; readonly category: RobotBattleCategory;
  readonly disabledReason: string | null;
}
export type RobotBattleEffectKind = "slash" | "blunt" | "thrust" | "assault" | "sniper" | "blast" | "line" | "delta" | "pincer" | "pair-defense" | "protection" | `special:${string}`;
export interface RobotBattleHitView {
  readonly cell: RobotPosition; readonly kind: RobotBattleEffectKind;
  /** null for a non-damaging effect. Actual resolved damage only. */
  readonly damage: number | null;
  /** Same pulse => simultaneous visuals, distinct pulses => repeated member hits. */
  readonly pulse: number;
}
/** Projection from trusted Core state. No UI-side range metric, legality or queue sorting. */
export interface RobotBattleViewModel {
  readonly checkpoint: { readonly battleId: string; readonly sequence: number };
  /** Stable across move/configuration checkpoints within one Core-owned turn. */
  readonly turnId: string;
  readonly round: number; readonly roundLimit: number;
  readonly board: { readonly width: number; readonly height: number; readonly walls: readonly RobotPosition[] };
  readonly structures: readonly { readonly id: string; readonly name: string; readonly cells: readonly RobotPosition[] }[];
  readonly units: readonly RobotBattleUnitView[];
  readonly queue: readonly RobotBattleActorView[];
  readonly commands: readonly RobotBattleCommand[]; readonly choices: readonly RobotBattleChoice[];
  readonly blocked: readonly { readonly commandId: string; readonly cell: RobotPosition; readonly reason: string }[];
  readonly latestSummary: string;
  /** Changed only by resolved actions, never by a camera or AI instruction update. */
  readonly latestAction: { readonly id: string; readonly hits: readonly RobotBattleHitView[] } | null;
  readonly ai: { readonly mode: RobotAiMode; readonly instructions: Readonly<Record<string, RobotAiInstruction>> };
}
export const emptyRobotBattleSelection = (): RobotBattleSelection => ({ destination: null, participantIds: [], targetIds: [] });
export const sameRobotBattleCell = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;
export const robotBattleCheckpointKey = (m: RobotBattleViewModel) => `${m.checkpoint.battleId}:${m.checkpoint.sequence}:${m.queue[0]?.id ?? "ended"}`;

export function compatibleRobotBattleChoices(choices: readonly RobotBattleChoice[], selected: RobotBattleSelection): readonly RobotBattleChoice[] {
  return choices.filter(c => (selected.destination === null || c.selection.destination !== null && sameRobotBattleCell(selected.destination, c.selection.destination)) && selected.participantIds.every(id => c.selection.participantIds.includes(id)) && selected.targetIds.every(id => c.selection.targetIds.includes(id)));
}
export function matchingRobotBattleChoice(choices: readonly RobotBattleChoice[], selected: RobotBattleSelection): RobotBattleChoice | null {
  return compatibleRobotBattleChoices(choices, selected).find(c => (c.selection.destination === null) === (selected.destination === null) && c.selection.participantIds.length === selected.participantIds.length && c.selection.targetIds.length === selected.targetIds.length) ?? null;
}
export function robotBattleSelectionCells(model: RobotBattleViewModel, choices: readonly RobotBattleChoice[], selected: RobotBattleSelection, role: RobotBattleSelectionRole): readonly RobotPosition[] {
  const relevant = compatibleRobotBattleChoices(choices, selected);
  const cells = role === "destination" ? relevant.flatMap(c => c.selection.destination ? [c.selection.destination] : []) : model.units.filter(u => relevant.some(c => (role === "participant" ? c.selection.participantIds : c.selection.targetIds).includes(u.id))).map(u => u.cell);
  // Multi-cell structures use their entity ID, never one damage target per cell.
  if (role === "target") for (const structure of model.structures) if (relevant.some(c => c.selection.targetIds.includes(structure.id))) cells.push(...structure.cells);
  return cells.filter((p, i) => cells.findIndex(c => sameRobotBattleCell(c, p)) === i);
}
export function assertRobotBattleViewModel(model: RobotBattleViewModel): void {
  const integer = (n: number, min = 0) => { if (!Number.isSafeInteger(n) || n < min) throw new Error("Invalid battle projection number"); };
  integer(model.board.width, 1); integer(model.board.height, 1); integer(model.round, 1); integer(model.roundLimit, model.round); integer(model.checkpoint.sequence);
  if (!model.checkpoint.battleId || !model.turnId) throw new Error("Missing battle/turn projection identity");
  const cell = (p: RobotPosition) => { integer(p.x); integer(p.y); if (p.x >= model.board.width || p.y >= model.board.height) throw new Error("Invalid battle projection cell"); };
  const unique = (ids: readonly string[]) => { if (new Set(ids).size !== ids.length || ids.some(id => !id)) throw new Error("Duplicate/empty battle projection ID"); };
  unique(model.units.map(u => u.id)); unique(model.structures.map(s => s.id)); unique([...model.units.map(u => u.id), ...model.structures.map(s => s.id)]); unique(model.commands.map(c => c.id)); unique(model.choices.map(c => c.id));
  model.board.walls.forEach(cell); model.structures.forEach(s => s.cells.forEach(cell));
  model.units.forEach(u => { cell(u.cell); integer(u.hp); integer(u.en); integer(u.maxHp, 1); integer(u.maxEn); if (u.hp > u.maxHp || u.en > u.maxEn) throw new Error("Invalid battle resources"); u.weapons.forEach(w => integer(w.level, 1)); });
  model.queue.forEach(actor => { unique(actor.unitIds); if (!actor.unitIds.length || actor.unitIds.some(id => !model.units.some(u => u.id === id && u.hp > 0 && u.kind === actor.kind))) throw new Error("Invalid battle queue member"); });
  if (model.queue.some(a => !a.id)) throw new Error("Missing battle queue actor identity");
  if (model.queue[0]?.kind !== "controlled" && (model.commands.length || model.choices.length)) throw new Error("Do not expose future AI plans to the player");
  const signatures = new Set<string>();
  for (const choice of model.choices) {
    const command = model.commands.find(c => c.id === choice.commandId);
    if (!command || command.disabledReason) throw new Error("Choice lacks an available command");
    unique(choice.selection.participantIds); unique(choice.selection.targetIds);
    if (choice.selection.destination) cell(choice.selection.destination);
    if (choice.selection.participantIds.some(id => !model.units.some(u => u.id === id && u.hp > 0)) || choice.selection.targetIds.some(id => !model.units.some(u => u.id === id && u.hp > 0) && !model.structures.some(s => s.id === id))) throw new Error("Invalid selection reference");
    const signature = JSON.stringify([choice.commandId, choice.selection.destination, [...choice.selection.participantIds].sort(), [...choice.selection.targetIds].sort()]);
    if (signatures.has(signature)) throw new Error("Ambiguous complete legal action"); signatures.add(signature);
  }
  model.blocked.forEach(b => cell(b.cell));
  model.latestAction?.hits.forEach(h => { cell(h.cell); integer(h.pulse); if (h.damage !== null) integer(h.damage); });
}
