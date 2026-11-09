import type { RobotVfxCue, RobotVfxId } from "./RobotVfx";
import type { RobotFacilitySprite } from "./BattleFacilityArt";
import type { RobotJson } from "../../../games/robot-tactics/offlineSession";
import type { RobotMovementShape, RobotPosition } from "../../../games/robot-tactics/movement";
import type { getRobotBattleBlastOptions } from "../../../games/robot-tactics/battleBlast";
import type { RobotAiInstruction, RobotAiMode } from "../../../games/robot-tactics/aiInstructions";
import type { RobotBattleEffectKind as CoreEffectKind } from "../../../games/robot-tactics/battleState";

export type RobotBattleCategory = "move" | "attack" | "special" | "formation" | "wait";
export type RobotBattleSelectionRole = "destination" | "participant" | "target";
export interface RobotBattleUnitView {
  readonly id: string; readonly name: string; readonly kind: "controlled" | "friendly-ai" | "enemy";
  readonly cell: RobotPosition; readonly hp: number; readonly maxHp: number; readonly en: number; readonly maxEn: number;
  readonly weapons: readonly { readonly name: string; readonly level: number }[];
  /** Canonical effective movement footprint, projected solely for display-path reconstruction; never persisted. */
  readonly movement?: RobotMovementShape;
  /** Authoritative extra-move reach. Display-only projection of existing equipped parts. */
  readonly extraMoveDistance?: number;
  /** Cosmetic-only; resolved from departure/equipment without changing a saved battle. */
  readonly appearance?: {
    /** Allied frame ID, friendly-ai, or enemy-light/medium/heavy/boss. */
    readonly frameId: string;
    /** Equipped part IDs in their actual slot order; display defaults to slot 1. */
    readonly weaponIds: readonly string[];
    readonly weaponFamilies: readonly ("slash"|"blunt"|"thrust"|"assault"|"sniper"|"blast")[];
    /** Cosmetic-only; model A/B/C and frame variants retain identical silhouettes. */
    readonly palette: "base"|"alternate-a"|"alternate-b"|"boss-09"|"boss-16"|"boss-22"|"boss-27"|"boss-30";
  };
  readonly shielded?: boolean;
  readonly visualStatuses?: readonly RobotVfxId[];
  readonly defended?: boolean;
  readonly combatNotes?: readonly string[];
  readonly bombs?: { readonly count: number; readonly turnsUntilEnd: number };
  /** Missing in legacy fixtures means an ordinary EN resource. */
  readonly hasEnergyResource?: boolean;
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
  /** Burst only: center is targetIds[0], remaining IDs are manually selected neighbors. */
  /** Dual-target combos assign slash first, ranged second. */
  readonly orderedTargets?: true;
  readonly centerTargetId?: string; readonly areaCells?: readonly RobotPosition[];
}
export interface RobotBattleCommand {
  readonly id: string; readonly label: string; readonly category: RobotBattleCategory;
  readonly disabledReason: string | null;
  /** Rendering hint only; does not determine the action payload or legality. */
  readonly visualWeaponId?: string;
  readonly targetFlow?: "blast";
  readonly immediateTargetTap?: true;
  readonly confirmLabel?: "決定";
  /** Staged choices avoid enumerating a Cartesian product of two area attacks. */
  readonly blast?: ReturnType<typeof getRobotBattleBlastOptions> & { readonly weaponId: string };
}
/** UI-only history receipt. IDs are resolved on the Core side, never parsed from UI text. */
export interface RobotBattleActionLogView {
  readonly id: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly actorKind: RobotBattleUnitView["kind"];
  readonly action: string;
  readonly results: readonly {
    readonly targetId: string; readonly name: string;
    readonly kind: RobotBattleUnitView["kind"] | "facility";
    readonly amount: number; readonly destroyed: boolean;
  }[];
}
export type RobotBattleEffectKind = CoreEffectKind;
export interface RobotBattleHitView {
  readonly cell: RobotPosition; readonly kind: RobotBattleEffectKind;
  /** null for a non-damaging effect. Actual resolved damage only. */
  readonly damage: number | null;
  /** Same pulse => simultaneous visuals, distinct pulses => repeated member hits. */
  readonly pulse: number;
  readonly impact?: "light" | "heavy";
  /** Only the final damaging receipt for a defeated entity carries this flag. */
  readonly destroyed?: "small" | "large";
  readonly presentationOnly?: true;
}
/** Projection from trusted Core state. No UI-side range metric, legality or queue sorting. */
export interface RobotBattleViewModel {
  readonly checkpoint: { readonly battleId: string; readonly sequence: number };
  /** Stable across move/configuration checkpoints within one Core-owned turn. */
  readonly turnId: string;
  readonly round: number; readonly roundLimit: number;
  readonly board: { readonly width: number; readonly height: number; readonly walls: readonly RobotPosition[] };
  readonly supportFields?: readonly { readonly id:string; readonly cells:readonly RobotPosition[]; readonly label:string; readonly kind?:"mine"|"slow"|"fire" }[];
  readonly structures: readonly { readonly id: string; readonly name: string; readonly cells: readonly RobotPosition[]; readonly hp?: number; readonly maxHp?: number; readonly def?: number; readonly hostile?: boolean; /** Purely visual, never saved or used for collision. */ readonly sprite?: RobotFacilitySprite }[];
  readonly units: readonly RobotBattleUnitView[];
  readonly queue: readonly RobotBattleActorView[];
  readonly commands: readonly RobotBattleCommand[]; readonly choices: readonly RobotBattleChoice[];
  readonly blocked: readonly { readonly commandId: string; readonly cell: RobotPosition; readonly reason: string }[];
  readonly objectiveText?: string;
  readonly objectiveMarkers?: readonly {readonly id:string;readonly cell:RobotPosition;readonly label:string;readonly status:"target"|"allied"|"enemy"|"neutral"}[];
  readonly latestSummary: string;
  /** Most recent resolved non-movement action, used to build an in-memory 3-entry history. */
  readonly latestLog?: RobotBattleActionLogView | null;
  readonly visualCues?: readonly RobotVfxCue[];
  /** Changed only by resolved actions, never by a camera or AI instruction update. */
  readonly latestAction: { readonly id: string; readonly hits: readonly RobotBattleHitView[]; readonly areaCells?: readonly RobotPosition[] } | null;
  readonly ai: { readonly mode: RobotAiMode; readonly allowFormations?: boolean; readonly formationUnlocked?: boolean; readonly instructions: Readonly<Record<string, RobotAiInstruction>> };
}
export const emptyRobotBattleSelection = (): RobotBattleSelection => ({ destination: null, participantIds: [], targetIds: [] });
export const sameRobotBattleCell = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;
export const robotBattleCheckpointKey = (m: RobotBattleViewModel) => `${m.checkpoint.battleId}:${m.checkpoint.sequence}:${m.queue[0]?.id ?? "ended"}`;

export function compatibleRobotBattleChoices(choices: readonly RobotBattleChoice[], selected: RobotBattleSelection): readonly RobotBattleChoice[] {
  return choices.filter(c => (c.centerTargetId === undefined || !selected.targetIds.length || c.centerTargetId === selected.targetIds[0]) && (selected.destination === null || c.selection.destination !== null && sameRobotBattleCell(selected.destination, c.selection.destination)) && selected.participantIds.every(id => c.selection.participantIds.includes(id)) && selected.targetIds.every((id, i) => c.orderedTargets ? c.selection.targetIds[i] === id : c.selection.targetIds.includes(id)));
}
export function matchingRobotBattleChoice(choices: readonly RobotBattleChoice[], selected: RobotBattleSelection): RobotBattleChoice | null {
  return compatibleRobotBattleChoices(choices, selected).find(c => (c.selection.destination === null) === (selected.destination === null) && c.selection.participantIds.length === selected.participantIds.length && c.selection.targetIds.length === selected.targetIds.length) ?? null;
}
export function robotBattleSelectionCells(model: RobotBattleViewModel, choices: readonly RobotBattleChoice[], selected: RobotBattleSelection, role: RobotBattleSelectionRole): readonly RobotPosition[] {
  const relevant = compatibleRobotBattleChoices(choices, selected);
  const centerStep = role === "target" && !selected.targetIds.length && relevant.some(c => c.centerTargetId !== undefined);
  const cells = role === "destination" ? relevant.flatMap(c => c.selection.destination ? [c.selection.destination] : []) : model.units.filter(u => relevant.some(c => centerStep ? c.centerTargetId === u.id : (role === "participant" ? c.selection.participantIds : c.orderedTargets ? c.selection.targetIds.slice(selected.targetIds.length, selected.targetIds.length + 1) : c.selection.targetIds).includes(u.id))).map(u => u.cell);
  // Multi-cell structures use their entity ID, never one damage target per cell.
  if (role === "target") for (const structure of model.structures) if (relevant.some(c => c.selection.targetIds.includes(structure.id))) cells.push(...structure.cells);
  return cells.filter((p, i) => cells.findIndex(c => sameRobotBattleCell(c, p)) === i);
}
export function assertRobotBattleViewModel(model: RobotBattleViewModel): void {
  const integer = (n: number, min = 0) => { if (!Number.isSafeInteger(n) || n < min) throw new Error("Invalid battle projection number"); };
  if(model.objectiveText!==undefined&&(typeof model.objectiveText!=="string"||!model.objectiveText||model.objectiveText.length>200))throw new Error("Invalid mission objective text");
  integer(model.board.width, 1); integer(model.board.height, 1); integer(model.round, 1); integer(model.roundLimit, model.round); integer(model.checkpoint.sequence);
  if (!model.checkpoint.battleId || !model.turnId) throw new Error("Missing battle/turn projection identity");
  const cell = (p: RobotPosition) => { integer(p.x); integer(p.y); if (p.x >= model.board.width || p.y >= model.board.height) throw new Error("Invalid battle projection cell"); };
  const unique = (ids: readonly string[]) => { if (new Set(ids).size !== ids.length || ids.some(id => !id)) throw new Error("Duplicate/empty battle projection ID"); };
  unique(model.units.map(u => u.id)); unique(model.structures.map(s => s.id)); unique([...model.units.map(u => u.id), ...model.structures.map(s => s.id)]); unique(model.commands.map(c => c.id)); unique(model.choices.map(c => c.id));
  if(model.objectiveMarkers){unique(model.objectiveMarkers.map(m=>m.id));for(const marker of model.objectiveMarkers){cell(marker.cell);if(!marker.label||!["target","allied","enemy","neutral"].includes(marker.status))throw new Error("Invalid objective marker");}}
  if(model.supportFields){unique(model.supportFields.map(f=>f.id));model.supportFields.forEach(f=>{if(!f.label||!f.cells.length||f.kind!==undefined&&!["mine","slow","fire"].includes(f.kind))throw new Error("Invalid support field");f.cells.forEach(cell);});}
  model.board.walls.forEach(cell); model.structures.forEach(s => s.cells.forEach(cell));
  model.units.forEach(u => { cell(u.cell); integer(u.hp); integer(u.en); integer(u.maxHp, 1); integer(u.maxEn); if (u.hp > u.maxHp || u.en > u.maxEn) throw new Error("Invalid battle resources"); if (u.shielded !== undefined && typeof u.shielded !== "boolean") throw new Error("Invalid projected shield"); if(u.combatNotes !== undefined && (!Array.isArray(u.combatNotes) || u.combatNotes.some(n=>typeof n!=="string"||!n)))throw new Error("Invalid combat status label"); if (u.bombs) { integer(u.bombs.count, 1); integer(u.bombs.turnsUntilEnd); } u.weapons.forEach(w => integer(w.level, 1)); });
  model.queue.forEach(actor => { unique(actor.unitIds); if (!actor.unitIds.length || actor.unitIds.some(id => !model.units.some(u => u.id === id && u.hp > 0 && u.kind === actor.kind))) throw new Error("Invalid battle queue member"); });
  if (model.queue.some(a => !a.id)) throw new Error("Missing battle queue actor identity");
  if (model.queue[0]?.kind !== "controlled" && (model.commands.length || model.choices.length)) throw new Error("Do not expose future AI plans to the player");
  const signatures = new Set<string>();
  const hostileTarget=(id:string)=>model.units.some(u=>u.id===id&&u.kind==="enemy")||model.structures.some(o=>o.id===id&&o.hostile===true&&(o.hp??0)>0);
  for (const c of model.commands) {
    if ((c.targetFlow !== undefined && c.targetFlow !== "blast") || (c.immediateTargetTap !== undefined && c.immediateTargetTap !== true) || c.targetFlow && c.immediateTargetTap || (c.confirmLabel !== undefined && c.confirmLabel !== "決定")) throw new Error("Invalid battle target flow");
    if (c.blast) {
      const b = c.blast;
      if (c.targetFlow !== "blast" || !b.weaponId || ![1, 2].includes(b.plan.centerCount) || ![2, 4].includes(b.plan.neighborCap)) throw new Error("Invalid staged blast command");
      integer(b.availableEn); integer(b.plan.baseEnergyCost); integer(b.plan.expansionEnergyCost);
      for (const center of b.centers) { cell(center.cell); center.areaCells.forEach(cell); unique(center.neighborIds); if (center.targetId !== null && !hostileTarget(center.targetId) || center.neighborIds.some(id => !hostileTarget(id)) || center.minimumNeighbors !== (center.targetId === null ? 1 : 0)) throw new Error("Invalid staged blast center"); }
    }
  }
  for (const choice of model.choices) {
    if (choice.orderedTargets !== undefined && choice.orderedTargets !== true) throw new Error("Invalid target ordering policy");
    const command = model.commands.find(c => c.id === choice.commandId);
    if (!command || command.disabledReason) throw new Error("Choice lacks an available command");
    unique(choice.selection.participantIds); unique(choice.selection.targetIds);
    if (choice.selection.destination) cell(choice.selection.destination);
    if (choice.selection.participantIds.some(id => !model.units.some(u => u.id === id && u.hp > 0)) || choice.selection.targetIds.some(id => !model.units.some(u => u.id === id && u.hp > 0) && !model.structures.some(s => s.id === id))) throw new Error("Invalid selection reference");
    if (command.targetFlow === "blast") {
      if (!choice.centerTargetId || choice.selection.targetIds[0] !== choice.centerTargetId || !choice.areaCells || choice.areaCells.length > 8 || choice.selection.destination || choice.selection.participantIds.length || choice.selection.targetIds.length > 3 || choice.selection.targetIds.some(id => !hostileTarget(id))) throw new Error("Invalid two-stage blast choice");
    } else if (choice.centerTargetId !== undefined || choice.areaCells !== undefined) throw new Error("Area preview belongs to blast targeting only");
    if (command.immediateTargetTap && (choice.selection.targetIds.length !== 1 || choice.selection.destination || choice.selection.participantIds.length || !hostileTarget(choice.selection.targetIds[0]!))) throw new Error("Immediate attack requires one hostile unit or facility center");
    if (choice.areaCells) { choice.areaCells.forEach(cell); if (new Set(choice.areaCells.map(c => c.x + "," + c.y)).size !== choice.areaCells.length) throw new Error("Duplicate area preview cell"); }
    const signature = JSON.stringify([choice.commandId, choice.centerTargetId ?? null, choice.selection.destination, [...choice.selection.participantIds].sort(), choice.orderedTargets ? choice.selection.targetIds : [...choice.selection.targetIds].sort()]);
    if (signatures.has(signature)) throw new Error("Ambiguous complete legal action"); signatures.add(signature);
  }
  model.blocked.forEach(b => cell(b.cell));
  model.latestAction?.hits.forEach(h => { cell(h.cell); integer(h.pulse); if (h.damage !== null) integer(h.damage); });
  model.latestAction?.areaCells?.forEach(cell);
}
