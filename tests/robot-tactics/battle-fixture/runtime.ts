import { checkRobotAttackRange } from "../../../src/games/robot-tactics/attackRange";
import { checkRobotAttackSpatial, getRobotAttackBlockReasonText, resolveRobotTargetDamage } from "../../../src/games/robot-tactics/attackResolution";
import { calculateRobotBaseDamage, getRobotWeaponDamageEstimate } from "../../../src/games/robot-tactics/combatMath";
import { resolveRobotBasicPart } from "../../../src/games/robot-tactics/equipment";
import { getRobotLegalMoves, robotCellToPosition, type RobotPosition } from "../../../src/games/robot-tactics/movement";
import { robotRecord, robotSafeInteger } from "../../../src/games/robot-tactics/offlineProgress";
import type { RobotJson, RobotOfflineBattle, RobotOfflineRuntime } from "../../../src/games/robot-tactics/offlineSession";
import { assertRobotAiConfiguration, type RobotAiInstruction, type RobotAiMode } from "../../../src/games/robot-tactics/aiInstructions";
import { assertRobotBattleViewModel, emptyRobotBattleSelection, type RobotBattleActorView, type RobotBattleChoice, type RobotBattleCommand, type RobotBattleEffectKind, type RobotBattleHitView, type RobotBattleUnitView, type RobotBattleViewModel } from "../../../src/client/games/robot-tactics/BattleViewModel";
import type { RobotBattleSessionAdapter } from "../../../src/client/games/robot-tactics/BattleSessionBridge";
import basicParts from "../../../docs/design/robot-tactics/basic-parts.json";

/** Explicit UI/commit contract fixture. NOT a production stage, speed scheduler or AI. */
interface State {
  round: number; turn: number; moved: boolean; events: number; family: string; sweepMax: number;
  units: RobotBattleUnitView[]; mode: RobotAiMode; instructions: Record<string, RobotAiInstruction>;
  event: RobotBattleViewModel["latestAction"];
}
export type BattleFixtureState = State;
const board = { width: 19, height: 17, walls: [robotCellToPosition("I9")] };
const structures = [{ id: "relay", name: "検証施設", cells: [robotCellToPosition("J13"), robotCellToPosition("K13")] }];
const families: Record<string, string> = { slash: "standard-sword", blunt: "heavy-hammer", thrust: "light-lance", assault: "assault-rifle", sniper: "sniper-rifle", blast: "light-grenade-launcher" };
const slots = ["p1", "f1", "enemy-squad", "p2", "f2", "p3"];
const decode = (raw: RobotJson): State => raw as unknown as State;
const json = (s: State): RobotJson => JSON.parse(JSON.stringify(s)) as RobotJson;
function actors(state: State): RobotBattleActorView[] {
  return slots.slice(state.turn).map(id => id === "enemy-squad" ? { id, name: "敵小隊", kind: "enemy", unitIds: ["e1", "e2", "e3"] } : { id, name: state.units.find(u => u.id === id)!.name, kind: state.units.find(u => u.id === id)!.kind, unitIds: [id] });
}
function combinations<T>(values: readonly T[], max: number): T[][] {
  return values.flatMap((v, i) => [[v], ...(max > 1 ? combinations(values.slice(i + 1), max - 1).map(rest => [v, ...rest]) : [])]);
}
function contents(state: State) {
  const current = actors(state)[0]!, source = state.units.find(u => u.id === current.unitIds[0])!;
  const commands: RobotBattleCommand[] = [], choices: RobotBattleChoice[] = [], blocked: RobotBattleViewModel["blocked"][number][] = [];
  const add = (commandId: string, selection = emptyRobotBattleSelection()) => {
    const id = commandId + ":" + JSON.stringify(selection); choices.push({ id, commandId, selection, payload: { choiceId: id } });
  };
  if (current.kind === "controlled") {
    if (!state.moved) {
      commands.push({ id: "move", label: "通常移動", category: "move", disabledReason: null });
      for (const move of getRobotLegalMoves({ board, origin: source.cell, mov: 3, types: ["omni"], facing: "north", occupied: state.units.filter(u => u.id !== source.id && u.hp > 0).map(u => u.cell), structures: structures.flatMap(s => s.cells) })) add("move", { ...emptyRobotBattleSelection(), destination: move.destination });
    }
    const part = resolveRobotBasicPart(families[state.family]!, 1);
    commands.push({ id: "normal", label: source.weapons[0]!.name + "・通常", category: "attack", disabledReason: null });
    for (const target of state.units.filter(u => u.kind === "enemy" && u.hp > 0)) {
      // Adopted weapon distance; this roster/initiative remains a UI fixture.
      const range = checkRobotAttackRange({ origin: source.cell, target: target.cell, min: part.range!.min, max: part.range!.max });
      const spatial = checkRobotAttackSpatial({ kind: "normal", range, sight: { board, origin: source.cell, target: target.cell } });
      if (spatial.canReach) add("normal", { ...emptyRobotBattleSelection(), targetIds: [target.id] });
      else blocked.push({ commandId: "normal", cell: target.cell, reason: getRobotAttackBlockReasonText(spatial)! });
    }
    if (state.family === "slash") {
      commands.push({ id: "sweep", label: "薙ぎ払い", category: "attack", disabledReason: null });
      // Pre-enumerated TEST candidates; this is not the formal area-geometry resolver.
      for (const targets of combinations(["e1", "e2", "e3"], state.sweepMax)) add("sweep", { ...emptyRobotBattleSelection(), targetIds: targets });
    }
    commands.push({ id: "line", label: "ライン連携", category: "formation", disabledReason: null });
    add("line", { ...emptyRobotBattleSelection(), participantIds: ["f1"], targetIds: ["e2"] });
    commands.push({ id: "defend", label: "防御", category: "special", disabledReason: null }, { id: "wait", label: "待機", category: "wait", disabledReason: null }); add("defend"); add("wait");
  }
  return { commands, choices, blocked };
}
export function projectBattleFixture(battle: RobotOfflineBattle): RobotBattleViewModel {
  const state = decode(battle.snapshot), c = contents(state);
  return { checkpoint: { battleId: battle.departure.battleId, sequence: battle.sequence }, turnId: `${state.round}:${state.turn}`, round: state.round, roundLimit: 16, board, structures, units: state.units, queue: actors(state), ...c, latestSummary: battle.latestSummary, latestAction: state.event, ai: { mode: state.mode, instructions: state.instructions } };
}
export function createBattleFixtureRuntime(family = "assault", sweepMax = 2): RobotOfflineRuntime {
  if (!Object.hasOwn(families, family) || ![2, 3].includes(sweepMax)) throw new Error("Unknown fixture case");
  return {
    id: "test-only-battle-screen", version: 1, readiness: () => [],
    create() {
      const units = [
        ["p1", "操作機1", "controlled", "G9"], ["p2", "操作機2", "controlled", "E10"], ["p3", "操作機3", "controlled", "I10"],
        ["f1", "友軍AI1", "friendly-ai", "G10"], ["f2", "友軍AI2", "friendly-ai", "H10"],
        ["e1", "敵機1", "enemy", "F8"], ["e2", "敵機2", "enemy", "G8"], ["e3", "敵機3", "enemy", "H8"],
        ["e4", "遠方敵", "enemy", "G5"], ["e5", "遮蔽敵", "enemy", "J9"], ["e6", "狙撃対象", "enemy", "J8"]
      ].map(([id, name, kind, cell]) => ({ id: id!, name: name!, kind: kind as RobotBattleUnitView["kind"], cell: robotCellToPosition(cell!), hp: 500, maxHp: 500, en: 100, maxEn: 100, weapons: [{ name: basicParts.parts.find(p => p.id === families[family])!.name, level: 1 }, { name: "ライトピストル", level: 1 }] }));
      return json({ round: 1, turn: 0, moved: false, events: 0, family, sweepMax, units, mode: "auto", instructions: { f1: { tacticId: "free-action" }, f2: { tacticId: "free-action" } }, event: null });
    },
    validate(raw, departure) {
      const value = robotRecord(raw); robotSafeInteger(value.turn, 0, 5); robotSafeInteger(value.round, 1, 16); robotSafeInteger(value.events);
      if (typeof value.moved !== "boolean" || !Object.hasOwn(families, String(value.family)) || ![2, 3].includes(Number(value.sweepMax)) || !["auto", "manual"].includes(String(value.mode))) throw new Error("Invalid fixture checkpoint");
      const state = decode(raw); if (!Array.isArray(state.units) || state.units.length !== 11) throw new Error("Invalid fixture units");
      for (const [unitId, instruction] of Object.entries(state.instructions)) assertRobotAiConfiguration({ kind: "instruction", unitId, instruction });
      assertRobotBattleViewModel(projectBattleFixture({ runtimeId: this.id, runtimeVersion: this.version, departure, sequence: 0, committedActionIds: [], snapshot: raw, latestSummary: "検証状態" }));
    },
    configureAi(raw, change) {
      const state = decode(raw); assertRobotAiConfiguration(change);
      if (change.kind === "mode") state.mode = change.mode;
      else {
        if (!state.units.some(u => u.id === change.unitId && u.kind === "friendly-ai" && u.hp > 0)) throw new Error("Invalid friendly instruction owner");
        const order = change.instruction;
        if ("targetUnitId" in order && !state.units.some(u => u.id === order.targetUnitId && u.hp > 0 && (order.tacticId === "focus-attack" ? u.kind === "enemy" : u.kind !== "enemy"))) throw new Error("Invalid instruction target");
        if ("cell" in order && (order.cell.x >= board.width || order.cell.y >= board.height)) throw new Error("Invalid instruction point");
        state.instructions[change.unitId] = order;
      }
      return json(state);
    },
    act(raw, request, departure) {
      const state = decode(raw), actor = actors(state)[0]!, source = state.units.find(u => u.id === actor.unitIds[0])!, action = robotRecord(request), hits: RobotBattleHitView[] = [];
      let summary: string;
      if (actor.kind !== "controlled") {
        if (action.kind !== "ai") throw new Error("Fixture AI action required");
        if (actor.kind === "enemy") {
          const target = state.units.find(u => u.id === "p1")!;
          // One committed squad batch, three display pulses. No per-hit turn mutation.
          for (let i = 0; i < 3; i++) hits.push({ cell: target.cell, kind: "assault", damage: calculateRobotBaseDamage({ attackStat: 40, weaponPower: 10, targetDef: 55, actionMultiplier: 1, areaMultiplier: 1 }), pulse: i });
          const sum = hits.reduce((s, h) => s + h.damage!, 0); state.units = state.units.map(u => u.id === target.id ? { ...u, hp: u.hp - sum } : u); summary = `敵小隊 → 操作機1：3機集中攻撃、${sum}ダメージ`;
        } else summary = `${source.name}：防御を実行`;
        state.turn++;
      } else {
        const battle = { runtimeId: this.id, runtimeVersion: this.version, departure, sequence: 0, committedActionIds: [], snapshot: raw, latestSummary: "" };
        const choice = projectBattleFixture(battle).choices.find(c => c.id === action.choiceId);
        if (!choice) throw new Error("Illegal fixture action");
        if (choice.commandId === "move") { state.units = state.units.map(u => u.id === source.id ? { ...u, cell: choice.selection.destination! } : u); state.moved = true; summary = `${source.name}：通常移動`; }
        else if (choice.commandId === "normal" || choice.commandId === "sweep" || choice.commandId === "line") {
          for (const id of choice.selection.targetIds) {
            const target = state.units.find(u => u.id === id)!, weaponId = families[state.family]!;
            const estimate = getRobotWeaponDamageEstimate({ weaponId, weaponLevel: 1, attackStats: { melee: 70, ranged: 70 }, targetDef: 55, mode: choice.commandId === "sweep" ? "sweep" : "normal" });
            const damage = resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null }, effect: { kind: "damaging", resolveAfterModifiers: () => choice.commandId === "line" ? calculateRobotBaseDamage({ ...estimate.terms, attackStat: 140 }) : estimate.baseDamage } }).damage;
            hits.push({ cell: target.cell, kind: (choice.commandId === "line" ? "line" : state.family) as RobotBattleEffectKind, damage, pulse: 0 });
            state.units = state.units.map(u => u.id === id ? { ...u, hp: u.hp - damage } : u);
          }
          if (choice.commandId === "line") state.units = state.units.map(u => u.id === source.id ? { ...u, en: u.en - 40 } : u);
          summary = `${source.name}：${choice.commandId === "sweep" ? "薙ぎ払い" : choice.commandId === "line" ? "ライン連携" : "通常攻撃"}、${hits.map(h => h.damage).join(" / ")}ダメージ`; state.turn++;
        } else { summary = `${source.name}：${choice.commandId === "defend" ? "防御" : "待機"}を実行`; if (choice.commandId === "defend") hits.push({ cell: source.cell, kind: "special:defend", damage: null, pulse: 0 }); state.turn++; }
      }
      state.events++; state.event = { id: `event-${state.events}`, hits };
      if (state.turn !== slots.indexOf(actor.id)) state.moved = false;
      if (state.turn >= slots.length) { state.turn = 0; state.round++; }
      return { snapshot: json(state), actorKind: actor.kind, summary, outcome: null };
    }
  };
}
export const battleFixtureAdapter: RobotBattleSessionAdapter = { project: projectBattleFixture, chooseAiAction: () => ({ kind: "ai" }) };
export function battleFixtureCell(raw: RobotJson, id: string): RobotPosition { return decode(raw).units.find(u => u.id === id)!.cell; }
