import type { Face, Point } from "./core/layered-stage-contract-v0.6";
import { inspectBasicCell, type TutorialState } from "./core/prototype-core-v0.7";
import { applyStageAction, inspectAdvancedCell, inspectPower, inspectLightRays, type AdvancedState, type AdvancedAction, type SharedTutorialState, InvalidPrototypeAction } from "./core/prototype-stage-core-v1.0";
import { loadStage, type StageAsset } from "./stage-loader";
import { labyrinthResult, type LabyrinthState } from "./runtime";
import { actionError } from "./actions";
export const FACE_NAMES = { front: "表", back: "裏" } as const;
const ITEMS: Record<string, string> = { "common-key": "鍵", "portable-light": "携帯光源", "energy-cell": "セル" };
const ROLE: Record<string, [string, string]> = {
  "push-wall": ["壁", "押し込み壁"], "flip-cell": ["床", "反転床"], "inverted-floor": ["床", "反転床"],
  "flip-control": ["反", "反転スイッチ"], "floor-control": ["反", "反転スイッチ"],
  "latch-switch": ["連", "連動スイッチ"], "latch-door": ["扉", "連動扉"],
  "rotation-control": ["回", "回転操作"], "room-control": ["回", "回転操作"], "rotor-control": ["回", "回転操作"],
  "room-walkable": ["", "回転室"], "rotor-floor": ["", "回転室"],
  "lift-platform": ["昇", "リフト"], "lift-shaft": ["昇", "リフト昇降路"], "lift-control": ["操", "リフト操作"],
  "fixed-light": ["光", "固定光源"], "mirror": ["鏡", "鏡"], "shadow-bridge": ["橋", "影橋"],
  "light-pedestal": ["灯", "光源台座"], "transfer-port": ["転", "転送装置（進入不可）"],
  "energy-socket": ["充", "セルソケット"], "item-cache": ["箱", "アイテム保管庫"],
  "key-door": ["鍵", "施錠扉"], "circuit-control": ["電", "配電操作"], "circuit-panel": ["電", "配電操作"],
  "light-power-panel": ["灯", "高出力光源の電源"], "circuit-gate": ["扉", "電力扉"],
  "opposite-powered-shortcut": ["扉", "相手回路の連動扉"], "both-circuit-gate": ["扉", "両回路の扉"],
  "resonance-plate": ["共", "共鳴床"], "resonance-gate": ["扉", "共鳴ゲート"]
};
export interface BoardCell { x: number; y: number; kind: "wall" | "hole" | "floor" | "device" | "goal" | "start"; symbol: string; label: string; passable: boolean }
export interface BoardAction { command: AdvancedAction; label: string; enabled: boolean; reason: string | null }
export interface FaceView {
  face: Face; width: number; height: number; position: Point; goalVisited: boolean;
  cells: readonly BoardCell[]; lightRays: readonly (readonly Point[])[]; actions: readonly BoardAction[]; inventory: readonly string[]; incoming: readonly string[];
  power: { used: number; capacity: number } | null;
}
function advanced(state: SharedTutorialState): state is AdvancedState { return "items" in state; }
function candidates(stage: StageAsset): { command: AdvancedAction; label: string }[] {
  const out: { command: AdvancedAction; label: string }[] = [];
  for (const d of stage.devices) {
    const id = d.id, suffix = ` · ${id}`;
    const add = (command: AdvancedAction, label: string) => out.push({ command, label: label + suffix });
    switch (d.kind) {
      case "push_wall": add({ type: "PUSH", wallId: id }, "壁を押す"); break;
      case "inverted_floor": add({ type: "FLIP", floorId: id }, "床を反転"); break;
      case "rotating_room": add({ type: "ROTATE", roomId: id }, "部屋を90°回す"); break;
      case "counterweight_lift": add({ type: "LIFT", liftId: id }, "リフトを動かす"); break;
      case "mirror": add({ type: "MIRROR", mirrorId: id }, "鏡を回す"); break;
      case "power_circuit": case "powered_light_control": add({ type: "POWER", circuitId: id }, "電源ON / OFF"); break;
      case "transfer": for (const item of stage.items) for (const type of ["SEND", "RECEIVE", "CANCEL"] as const)
        add({ type, transferId: id, itemId: item.itemId }, `${ITEMS[item.kind]}を${{ SEND: "送る", RECEIVE: "受け取る", CANCEL: "送信取消" }[type]}`); break;
      case "light_pedestal": case "energy_socket": for (const type of ["INSTALL", "REMOVE"] as const)
        add({ type, objectId: id, itemId: String(d.config.requiredItemId) }, type === "INSTALL" ? "設置する" : "取り外す"); break;
      case "key_door": add({ type: "UNLOCK", doorId: id, itemId: String(d.config.requiredItemId) }, "鍵で解錠"); break;
      case "item_cache": add({ type: "CACHE_TAKE", cacheId: id, itemId: String(d.config.containedItemId) }, "セルを取る"); break;
    }
  }
  return out;
}
export function buildFaceView(stageId: string, state: SharedTutorialState, face: Face): FaceView {
  const stage = loadStage(stageId), isAdvanced = advanced(state), cells: BoardCell[] = [];
  for (let y = 1; y <= stage.height; y++) for (let x = 1; x <= stage.width; x++) {
    const p = { x, y };
    const tile = isAdvanced ? inspectAdvancedCell(stage, state, face, p) : inspectBasicCell(stage, state as TutorialState, face, p);
    let role = tile.marker?.claims[0]?.role ?? "", deviceId = tile.marker?.claims[0]?.objectId;
    for (const wall of stage.devices.filter((d) => d.kind === "push_wall")) {
      const [wx, wy] = wall.config.physicalFrontCell as number[];
      if (x === (face === "front" ? wx : stage.width + 1 - wx!) && y === wy) { role = "push-wall"; deviceId = wall.id; }
    }
    const isWall = role === "push-wall" && state.wallSide[deviceId!] === face;
    let kind: BoardCell["kind"] = role ? "device" : tile.glyph === "#" ? "wall" : tile.glyph === "~" ? "hole" : role ? "device" : "floor";
    let [symbol, label] = ROLE[role] ?? ["", kind === "wall" ? "固定壁" : kind === "hole" ? "穴" : "通路"];
    if (role === "push-wall" && !isWall) { kind = "floor"; symbol = ""; label = "押し込み壁の対応位置"; }
    if (role === "mirror" && isAdvanced) { const diag = state.mirrorFrontDiagonal[deviceId!]; symbol = face === "front" ? diag! : diag === "/" ? "\\" : "/"; }
    if (x === stage.goal[face].x && y === stage.goal[face].y) { kind = "goal"; symbol = "G"; label = state.goalVisited[face] ? "到達済みゴール" : "ゴール"; }
    if (x === stage.start[face].x && y === stage.start[face].y) { kind = "start"; symbol = "S"; label = "スタート"; }
    if (role === "circuit-control" || role === "circuit-panel" || role === "light-power-panel") {
      const device = stage.devices.find(d => d.id === deviceId);
      const poweredId = device?.kind === "powered_light_control" ? String(device.config.pedestalId) : deviceId!;
      if (isAdvanced) { const on = !!state.powered[poweredId]; symbol = on ? "ON" : "OFF"; label += on ? "・給電中" : "・停止中"; }
    }
    if ((tile.marker?.claims.length ?? 0) > 1) label = tile.marker!.claims.map(c => ROLE[c.role]?.[1] ?? c.role).join("・");
    cells.push({ x, y, kind, symbol, label: `${x},${y} ${label}${deviceId ? ` (${deviceId})` : ""}`, passable: tile.passable });
  }
  const actions: BoardAction[] = [];
  if (!state.complete) for (const candidate of candidates(stage)) {
    try { applyStageAction(stage, state, { playMode: "SOLO_PRACTICE", selectedFace: face }, candidate.command); actions.push({ ...candidate, enabled: true, reason: null }); }
    catch (error) {
      if (!(error instanceof InvalidPrototypeAction)) throw error;
      if (error.code === "OCCUPIED" || error.code === "BLOCKED") actions.push({ ...candidate, enabled: false, reason: actionError(error) });
    }
  }
  const itemName = (id: string) => ITEMS[stage.items.find((i) => i.itemId === id)!.kind]!;
  return { face, width: stage.width, height: stage.height, position: { ...state.position[face] }, goalVisited: state.goalVisited[face], cells, lightRays: isAdvanced ? inspectLightRays(stage, state, face) : [], actions,
    inventory: isAdvanced ? Object.entries(state.items).filter(([, l]) => l.kind === "inventory" && l.side === face).map(([id]) => itemName(id)) : [],
    incoming: isAdvanced ? Object.entries(state.items).filter(([, l]) => l.kind === "pending" && l.receiver === face).map(([id]) => itemName(id)) : [],
    power: isAdvanced && stage.sharedPower ? inspectPower(stage, state) : null };
}
/** Explicit own-face projection. Never return the server Core or full stage asset. */
export function buildLabyrinthView(state: LabyrinthState, playerId: string, serverNow = Date.now()) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("参加者ではありません");
  return { gameId: state.gameId, rulesVersion: state.rulesVersion, matchId: state.matchId, stageId: state.stageId,
    phase: state.phase, revision: state.revision, playerId, face: player.face, ready: state.ready,
    board: buildFaceView(state.stageId, state.core, player.face), goals: { ...state.core.goalVisited },
    startedAt: state.startedAt, finishedAt: state.finishedAt, serverNow, actions: state.core.acceptedActions, result: labyrinthResult(state) };
}
export type LabyrinthView = ReturnType<typeof buildLabyrinthView>;
