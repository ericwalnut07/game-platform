import { ROBOT_AI_TACTICS, type RobotAiConfiguration, type RobotAiInstruction } from "../../../games/robot-tactics/aiInstructions";
import type { RobotBlastLocation } from "../../../games/robot-tactics/battleBlast";
import { getRobotBlastSelectionCost } from "../../../games/robot-tactics/blastAddons";
import { robotPositionToCell, type RobotPosition } from "../../../games/robot-tactics/movement";
import { RobotBattleAutoDriver } from "./BattleAutoDriver";
import { planRobotBattleMovement, robotBattleMotionPosition, robotBattleMotionOpacity, type RobotBattleMovementPlan } from "./BattleMovement";
import { planRobotBattleSpecialMovement } from "./BattleSpecialMovement";
import { planRobotBattlePresentation, ROBOT_BATTLE_SPEEDS, robotBattleSpeedLabel, type RobotBattlePlaybackSpeed } from "./BattlePresentation";
import { appendRobotBattleActionHistory } from "./BattleActionLog";
import { focusRobotBattleCamera, robotBattleCameraBox, zoomRobotBattleCamera, type RobotBattleCamera } from "./BattleCamera";
import { robotIsoBillboardTransform, robotIsoHitCell, robotIsoViewBox, robotIsoWorldMatrix, unprojectRobotIsoPoint } from "./BattleIsoProjection";
import { ROBOT_TERRAIN_ATLAS_CELL, ROBOT_TERRAIN_ATLAS_COLUMNS, ROBOT_TERRAIN_ATLAS_INDEX, robotTerrainAtlasUrl, robotTerrainFloor, robotTerrainPlacement, robotTerrainWall, type RobotTerrainArt } from "./BattleTerrainArt";
import { ROBOT_FACILITY_ATLAS_CELL, ROBOT_FACILITY_ATLAS_COLUMNS, ROBOT_FACILITY_ATLAS_INDEX, robotFacilityAtlasUrl, robotFacilityPlacement, robotFacilitySpriteForMarker, type RobotFacilitySprite } from "./BattleFacilityArt";
import { changedRobotVfxCues, planRobotVfx, robotVfxFrame, ROBOT_VFX, type RobotVfxCue, type RobotVfxEvent, type RobotVfxId } from "./RobotVfx";
import { robotVfxAtlas } from "./RobotVfxAssets";
import {robotDisplayedWeaponFamily} from "./RobotVisualArt";
import {createRobotVisualSprite} from "./RobotVisualSprite";
import { robotBattleArtTranslation, robotBattleHighlightedUnit, robotBattleLiveUnits } from "./BattleUnitDisplay";
import { assertRobotBattleViewModel, compatibleRobotBattleChoices, emptyRobotBattleSelection, matchingRobotBattleChoice, robotBattleSelectionCells, sameRobotBattleCell, type RobotBattleActionLogView, type RobotBattleCategory, type RobotBattleHitView, type RobotBattleSelection, type RobotBattleSelectionRole, type RobotBattleViewModel } from "./BattleViewModel";
import "./battle-screen.css";

export interface RobotBattleScreenHandle {
  update(model: RobotBattleViewModel, busy: boolean): void;
  /** Playback time for terminal committed actions; does not include Core computation. */
  presentationMs(): number;
  pause(paused: boolean): void;
  dispose(): void;
}
export interface RobotBattleScreenOptions {
  readonly model: RobotBattleViewModel;
  readonly execute: (choiceId: string, checkpoint: RobotBattleViewModel["checkpoint"]) => Promise<void>;
  readonly executeBlast?: (commandId: string, locations: readonly RobotBlastLocation[], checkpoint: RobotBattleViewModel["checkpoint"]) => Promise<void>;
  readonly executeAi: (checkpoint: RobotBattleViewModel["checkpoint"]) => Promise<void>;
  readonly configureAi: (change: RobotAiConfiguration, checkpoint: RobotBattleViewModel["checkpoint"]) => Promise<void>;
  /** Trusted, replaceable presentation asset renderer. Never used by damage resolution. */
  readonly renderEffect?: (hit: RobotBattleHitView, document: Document) => SVGElement;
}
const categories = [{ id: "move", label: "移動" }, { id: "attack", label: "攻撃" }, { id: "special", label: "特殊" }, { id: "formation", label: "連携" }, { id: "wait", label: "待機" }] as const;
const svgNs = "http://www.w3.org/2000/svg";
let clipSequence = 0;

/** Post-commit placeholder graphics; replaceable without changing battle rules. */
export function defaultRobotBattleEffect(hit: RobotBattleHitView, doc: Document): SVGElement {
  const svg = doc.createElementNS(svgNs, "g"), path = doc.createElementNS(svgNs, "path");
  const shapes: Record<string, string> = {
    slash: "M.15 .85L.85 .15M.35 .92L.92 .35", blunt: "M.2 .2H.8V.8H.2Z M0 .5H1 M.5 0V1",
    thrust: "M.1 .9L.9 .1M.5 .1H.9V.5", assault: "M.15 .3H.35M.4 .5H.6M.65 .7H.85",
    sniper: "M.5 0V.3M.5 .7V1M0 .5H.3M.7 .5H1M.35 .35H.65V.65H.35Z",
    blast: "M.5 0L.62 .3L.95 .2L.75 .5L1 .75L.65 .7L.5 1L.35 .7L0 .75L.25 .5L.05 .2L.38 .3Z",
    line: "M0 .5H1M.15 .25L.5 .5L.85 .25", delta: "M.5 .08L.92 .85H.08Z",
    pincer: "M0 .1L.45 .5L0 .9M1 .1L.55 .5L1 .9", "pair-defense": "M.1 .2L.5 .05L.9 .2L.8 .7L.5 .95L.2 .7Z", protection: "M.1 .2H.9V.65L.5 .95L.1 .65Z", "special:spread-shot": "M.5 .5L0 0M.5 .5L1 0M.5 .5L0 1M.5 .5L1 1M.25 .5H.75M.5 .25V.75"
  };
  path.setAttribute("d", shapes[hit.kind] ?? "M.5 .05L.65 .35L.95 .5L.65 .65L.5 .95L.35 .65L.05 .5L.35 .35Z");
  path.setAttribute("fill", "none"); path.setAttribute("stroke", "#fff4b8"); path.setAttribute("stroke-width", ".09"); svg.append(path); return svg;
}

export function mountRobotBattleScreen(root: HTMLElement, options: RobotBattleScreenOptions): RobotBattleScreenHandle {
  const doc = root.ownerDocument, win = doc.defaultView!;
  let model = options.model; assertRobotBattleViewModel(model);
  let camera: RobotBattleCamera = { mode: "focus", center: model.units.find(u => u.id === model.queue[0]?.unitIds[0])?.cell ?? { x: 0, y: 0 }, span: win.innerWidth > win.innerHeight && win.innerHeight <= 500 ? 5 : 9 };
  let category: RobotBattleCategory | null = null, commandId: string | null = null, selected = emptyRobotBattleSelection(), role: RobotBattleSelectionRole = "target";
  let blastLocations: RobotBlastLocation[] = [], blastIndex = 0;
  let inspected: string | null = null, focusedUnitId: string | null = null, notice = "", disposed = false, paused = false, busy = false, working = false, aiFailed = false;
  let latestActionId = model.latestAction?.id ?? null, actorId = model.queue[0]?.id;
  let history: RobotBattleActionLogView[] = model.latestLog ? [model.latestLog] : [];
  let highlightedLogId: string | null = null;
  let playbackSpeed: RobotBattlePlaybackSpeed = "standard";
  let presentationPhase: "actor" | "target" | "attack" | "result" | null = null;
  let presentationFocus: RobotBattleActionLogView | null = null;
  const presentationTimers = new Set<number>();
  let movementState: { readonly actionId: string; readonly plan: RobotBattleMovementPlan; readonly startedAt: number; readonly pendingLog: RobotBattleActionLogView | null } | null = null;
  let movementTiming: { readonly actionId: string; readonly beforeMs: number; readonly afterMs: number } | null = null;
  let movementSprites = new Map<string, SVGGElement>();
  let currentSvg: SVGSVGElement | null = null, effectLayer: SVGGElement | null = null, impactLayer: SVGGElement | null = null, numberLayer: SVGGElement | null = null;
  let focusedHudSprite: SVGGElement | null = null;
  let mapResizeObserver: ResizeObserver | null = null;
  let clipRect: SVGRectElement | null = null;
  let draftOwner: string | null = null;
  let approvedFriendlyTurn: string | null = null;
  let draft = { tacticId: "free-action" as RobotAiInstruction["tacticId"], targetUnitId: null as string | null, cell: null as RobotPosition | null };
  const effects = new Map<number, RobotVfxEvent & { startedAt: number; rate: number }>(), effectTimers = new Set<number>();
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let animationFrame: number | null = null;
  // Warm the embedded images before the first committed attack. No remote URLs.
  const preloads = Object.keys(ROBOT_VFX).map(id => { const image = new win.Image(); image.src = robotVfxAtlas(id as RobotVfxId); return image; });
  let actionArea: readonly RobotPosition[] = [];
  const displayDuration = (value: RobotBattleViewModel) => {
    const base = planRobotBattlePresentation(value.latestAction?.hits ?? [], [], !!value.latestLog, playbackSpeed).totalMs;
    if (!movementTiming || movementTiming.actionId !== value.latestAction?.id) return base;
    // A committed actor may advance before striking and push a target after impact.
    // Playback is the sum of both phases, not the current animated position.
    const actionMs = value.latestLog || value.latestAction?.hits.length ? base : playbackSpeed === "skip" ? 0 : 150;
    return movementTiming.beforeMs + actionMs + movementTiming.afterMs;
  };
  const driver = new RobotBattleAutoDriver({ set: (cb, ms) => win.setTimeout(cb, ms), clear: id => win.clearTimeout(id as number) }, async checkpoint => { await options.executeAi(checkpoint); }, error => { aiFailed = true; notice = error instanceof Error ? error.message : "AI行動を保存できませんでした。"; render(); }, displayDuration);
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
  const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => { const e = doc.createElementNS(svgNs, tag); for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, String(value)); return e; };
  const terrainAtlas = robotTerrainAtlasUrl();
  const terrainAtlasId = `robot-terrain-atlas-${++clipSequence}`;
  const facilityAtlas = robotFacilityAtlasUrl();
  const facilityAtlasId = `robot-facility-atlas-${++clipSequence}`;
  // The sheet consists of 8 isolated transparent sprites. Cropping in a nested
  // SVG viewport avoids duplicating the image in the single-file offline build.
  const terrainSprite = (kind: RobotTerrainArt, x: number, y: number): SVGGElement => {
    const index = ROBOT_TERRAIN_ATLAS_INDEX[kind], size = ROBOT_TERRAIN_ATLAS_CELL;
    const { width, height, top } = robotTerrainPlacement(kind);
    const viewport = s("svg", {
      x: x + .5 - width / 2, y: y + .5 - top, width, height,
      viewBox: `${index % ROBOT_TERRAIN_ATLAS_COLUMNS * size} ${Math.floor(index / ROBOT_TERRAIN_ATLAS_COLUMNS) * size} ${size} ${size}`,
      preserveAspectRatio: "xMidYMid meet", overflow: "hidden",
      class: "robot-terrain-sprite robot-terrain-" + kind,
      "data-terrain-kind": kind, "pointer-events": "none", "aria-hidden": "true",
    });
    viewport.append(s("use", { href: "#" + terrainAtlasId, "pointer-events": "none" }));
    const upright = s("g", {
      class: kind.startsWith("floor-") ? "robot-terrain-floor" : "robot-terrain-object",
      "pointer-events": "none", "aria-hidden": "true",
      transform: robotIsoBillboardTransform({ x: x + .5, y: y + .5 }),
    });
    upright.append(viewport);
    return upright;
  };
  /** Facilities remain visually upright; the whole image is non-interactive. */
  const facilitySprite = (kind: RobotFacilitySprite, cells: readonly RobotPosition[], id: string, marker: boolean): SVGGElement => {
    const index = ROBOT_FACILITY_ATLAS_INDEX[kind], size = ROBOT_FACILITY_ATLAS_CELL;
    const { anchor, width, height } = robotFacilityPlacement(cells, kind, marker);
    const viewport = s("svg", {
      x: anchor.x - width / 2, y: anchor.y - height, width, height,
      viewBox: `${index % ROBOT_FACILITY_ATLAS_COLUMNS * size} ${Math.floor(index / ROBOT_FACILITY_ATLAS_COLUMNS) * size} ${size} ${size}`,
      preserveAspectRatio: "xMidYMid meet", overflow: "hidden",
      class: "robot-facility-sprite",
      "data-facility-kind": kind, "pointer-events": "none", "aria-hidden": "true",
    });
    viewport.append(s("use", { href: "#" + facilityAtlasId, "pointer-events": "none" }));
    const upright = s("g", {
      class: "robot-facility-art", "data-facility-id": id,
      transform: robotIsoBillboardTransform(anchor),
      "pointer-events": "none", "aria-hidden": "true",
    });
    upright.append(viewport);
    return upright;
  };
  const playerInput = () => model.queue[0]?.kind === "controlled" && !busy && !working && !paused && !movementState;
  const manualFriendly = () => model.queue[0]?.kind === "friendly-ai" && model.ai.mode === "manual";
  const needsFriendlyInstruction = () => manualFriendly() && approvedFriendlyTurn !== model.checkpoint.battleId + ":" + model.turnId;
  const button = (label: string, callback: () => void, disabled = false) => { const e = node("button", label); e.type = "button"; e.disabled = disabled || busy || working || paused || !!movementState; e.onclick = () => { focusedUnitId = null; callback(); }; return e; };
  /** Pure inspection: never changes the actor, command, Core state or save. */
  function toggleFocusedUnit(id: string) {
    const unit = robotBattleHighlightedUnit(model.units, id);
    focusedUnitId = unit && focusedUnitId !== id ? id : null;
    if (unit && focusedUnitId) camera = focusRobotBattleCamera(camera, unit.cell, model.board);
    render();
  }
  const choices = () => model.choices.filter(c => c.commandId === commandId);
  const resetSelection = () => { category = null; commandId = null; selected = emptyRobotBattleSelection(); blastLocations = []; blastIndex = 0; };
  function selectCommand(id: string) {
    focusedUnitId = null; commandId = id; selected = emptyRobotBattleSelection(); blastLocations = []; blastIndex = 0; notice = "";
    const list = choices(); role = list.some(c => c.selection.destination) ? "destination" : list.some(c => c.selection.participantIds.length) ? "participant" : "target";
    render();
  }
  function syncDraft() {
    const unitId = model.queue[0]?.unitIds[0];
    if (!manualFriendly() || !unitId) { draftOwner = null; return; }
    if (draftOwner === unitId) return;
    const order = model.ai.instructions[unitId] ?? { tacticId: "free-action" };
    draftOwner = unitId; draft = { tacticId: order.tacticId, targetUnitId: "targetUnitId" in order ? order.targetUnitId : null, cell: "cell" in order ? order.cell : null };
  }
  function instruction(): RobotAiInstruction | null {
    if (draft.tacticId === "free-action") return { tacticId: draft.tacticId };
    if (draft.tacticId === "focus-attack" || draft.tacticId === "escort-specific-ally") return draft.targetUnitId ? { tacticId: draft.tacticId, targetUnitId: draft.targetUnitId } : null;
    return draft.cell ? { tacticId: draft.tacticId, cell: draft.cell } : null;
  }
  async function localOperation(action: () => Promise<void>) {
    if (working || busy || paused || disposed) return;
    working = true; driver.pause(true); render();
    try { await action(); notice = ""; }
    catch (error) { notice = error instanceof Error ? error.message : "行動を保存できませんでした。"; }
    finally { working = false; if (!disposed) { driver.pause(paused || doc.hidden); render(); } }
  }
  function applyCamera() {
    if (!currentSvg) return;
    const viewport = currentSvg.getBoundingClientRect();
    const aspect = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 1;
    const logical = robotBattleCameraBox(camera, model.board, aspect);
    const projected = robotIsoViewBox(logical, model.board.height, aspect);
    currentSvg.setAttribute("viewBox", `${projected.x} ${projected.y} ${projected.width} ${projected.height}`);
    currentSvg.dataset.camera = JSON.stringify(logical);
    currentSvg.dataset.projection = "isometric";
    currentSvg.dataset.projectedCamera = JSON.stringify(projected);
    for (const [key, value] of Object.entries(projected)) clipRect?.setAttribute(key, String(value));
  }
  const stagedBlast = () => model.commands.find(c => c.id === commandId)?.blast;
  function blastPointValid(index: number): boolean {
    const point = blastLocations[index], center = point && stagedBlast()?.centers.find(c => sameRobotBattleCell(c.cell, point.cell));
    return !!point && !!center && point.neighborIds.length >= center.minimumNeighbors;
  }
  function tapBlast(cell: RobotPosition) {
    const blast = stagedBlast()!, point = blastLocations[blastIndex];
    if (!point) {
      const center = blast.centers.find(c => sameRobotBattleCell(c.cell, cell));
      if (!center || blastLocations.some(p => sameRobotBattleCell(p.cell, cell)||center.targetId!==null&&blast.centers.find(c=>sameRobotBattleCell(c.cell,p.cell))?.targetId===center.targetId)) { notice = "別の合法な中心地点を選択してください。"; return; }
      // A newly chosen enemy center owns the 70% role; do not select it again as a neighbor.
      blastLocations = blastLocations.map(p => ({ ...p, neighborIds: p.neighborIds.filter(id => id !== center.targetId) }));
      blastLocations[blastIndex] = { cell: { ...cell }, neighborIds: [] }; notice = ""; return;
    }
    const center = blast.centers.find(c => sameRobotBattleCell(c.cell, point.cell))!, id = model.units.find(u => sameRobotBattleCell(u.cell, cell))?.id ?? model.structures.find(o=>o.cells.some(c=>sameRobotBattleCell(c,cell)))?.id;
    if (!id || !center.neighborIds.includes(id)) { notice = "周辺の敵を選ぶか、中心を選び直してください。"; return; }
    const alreadyElsewhere = blastLocations.some((p, i) => i !== blastIndex && (p.neighborIds.includes(id) || blast.centers.find(c => sameRobotBattleCell(c.cell, p.cell))?.targetId === id));
    if (alreadyElsewhere) { notice = "この敵は別の地点で選択済みです。"; return; }
    const ids = point.neighborIds.includes(id) ? point.neighborIds.filter(v => v !== id) : [...point.neighborIds, id];
    if (ids.length > blast.plan.neighborCap) { notice = "周辺対象の上限です。"; return; }
    blastLocations[blastIndex] = { ...point, neighborIds: ids }; notice = "";
  }
  function tap(cell: RobotPosition) {
    const hadFocus = focusedUnitId !== null; focusedUnitId = null;
    const unit = model.units.find(u => u.hp > 0 && sameRobotBattleCell(u.cell, cell));
    if (camera.mode === "overview") {
      camera = focusRobotBattleCamera(camera, cell, model.board);
      if (unit && playerInput()) inspected = unit.id;
      const command = model.commands.find(c => c.id === commandId);
      if (!playerInput() || (!command?.targetFlow && !command?.immediateTargetTap)) { render(); return; }
    }
    if (needsFriendlyInstruction() && !busy && !working && !paused) {
      if (draft.tacticId === "focus-attack" && unit?.kind === "enemy" || draft.tacticId === "escort-specific-ally" && unit && unit.kind !== "enemy") draft.targetUnitId = unit!.id;
      else if (draft.tacticId === "defend-location" || draft.tacticId === "advance-to-location") draft.cell = cell;
      render(); return;
    }
    if (!playerInput()) { if (hadFocus) render(); return; }
    if (stagedBlast()) { tapBlast(cell); render(); return; }
    if (unit) inspected = unit.id;
    else inspected = model.structures.find(st => st.cells.some(c => sameRobotBattleCell(c, cell)))?.id ?? inspected;
    if (commandId) {
      const targetId = unit?.id ?? model.structures.find(st => st.cells.some(c => sameRobotBattleCell(c, cell)))?.id;
      const command = model.commands.find(c => c.id === commandId);
      if (command?.immediateTargetTap) {
        const chosen = targetId ? matchingRobotBattleChoice(choices(), { ...emptyRobotBattleSelection(), targetIds: [targetId] }) : null;
        if (chosen) { inspected = null; notice = ""; void localOperation(() => options.execute(chosen.id, model.checkpoint)); return; }
        notice = model.blocked.find(b => b.commandId === commandId && sameRobotBattleCell(b.cell, cell))?.reason ?? "合法な中心の敵をタップしてください。";
        render(); return;
      }
      let next: RobotBattleSelection = selected;
      if (role === "destination") next = { ...selected, destination: cell };
      else if (command?.targetFlow === "blast" && targetId && targetId === selected.targetIds[0]) next = emptyRobotBattleSelection();
      else if (targetId) { const key = role === "participant" ? "participantIds" : "targetIds", ids = selected[key]; next = { ...selected, [key]: ids.includes(targetId) ? key === "targetIds" && choices().some(c => c.orderedTargets) ? ids.slice(0, ids.indexOf(targetId)) : ids.filter(id => id !== targetId) : [...ids, targetId] }; }
      const compatible = compatibleRobotBattleChoices(choices(), next);
      if (compatible.length && next !== selected) {
        selected = next; notice = "";
        if (role === "participant" && compatible.some(c => c.selection.participantIds.length === selected.participantIds.length && c.selection.targetIds.length)) role = "target";
      } else notice = model.blocked.find(b => b.commandId === commandId && sameRobotBattleCell(b.cell, cell))?.reason ?? "そのマスは選択できません。";
    }
    render();
  }
  function raster(effect: RobotVfxId, elapsed: number, loop = false, rate = 1): SVGElement {
    const frame = reducedMotion.matches ? 2 : robotVfxFrame(effect, elapsed * rate, loop);
    const viewport = s("svg", { x: -.1, y: -.1, width: 1.2, height: 1.2, viewBox: `${frame * 256} 0 256 256`, overflow: "hidden", "data-vfx": effect, "data-vfx-frame": frame, "data-vfx-start": win.performance.now() - elapsed, "data-vfx-loop": String(loop), "data-vfx-rate": rate });
    viewport.append(s("image", { x: 0, y: 0, width: 1536, height: 256, href: robotVfxAtlas(effect) }));
    return viewport;
  }
  function drawMovementPosition() {
    if (!movementState) return;
    const elapsed = win.performance.now() - movementState.startedAt;
    for (const mover of movementState.plan.movers) {
      const sprite = movementSprites.get(mover.unitId);
      const final = model.units.find(unit => unit.id === mover.unitId)?.cell;
      if (!sprite || !final) continue;
      const point = robotBattleMotionPosition(mover, elapsed);
      sprite.setAttribute("transform", `translate(${point.x - final.x} ${point.y - final.y})`);
      sprite.style.opacity = String(robotBattleMotionOpacity(mover, elapsed));
      if (focusedUnitId === mover.unitId && focusedHudSprite) {
        focusedHudSprite.setAttribute("transform", `translate(${point.x - final.x} ${point.y - final.y})`);
      }
      for (const status of effectLayer?.querySelectorAll<SVGGElement>("[data-status-unit]") ?? []) {
        if (status.dataset.statusUnit === mover.unitId) {
          status.setAttribute("transform", `translate(${point.x} ${point.y})`);
          status.parentElement?.setAttribute("transform", robotIsoBillboardTransform({ x: point.x + .5, y: point.y + .5 }));
        }
      }
    }
  }
  function cancelMovement(flushPendingLog = false) {
    if (flushPendingLog && movementState?.pendingLog) history = appendRobotBattleActionHistory(history, movementState.pendingLog);
    movementState = null;
    movementSprites.clear();
  }
  function animate() {
    animationFrame = null;
    if (disposed || paused || doc.hidden || reducedMotion.matches) return;
    const now = win.performance.now();
    for (const viewport of [...(effectLayer?.querySelectorAll<SVGSVGElement>("svg[data-vfx]") ?? []), ...(impactLayer?.querySelectorAll<SVGSVGElement>("svg[data-vfx]") ?? [])]) {
      const effect = viewport.dataset.vfx as RobotVfxId, frame = robotVfxFrame(effect, (now - Number(viewport.dataset.vfxStart)) * Number(viewport.dataset.vfxRate ?? "1"), viewport.dataset.vfxLoop === "true");
      if (String(frame) !== viewport.dataset.vfxFrame) { viewport.dataset.vfxFrame = String(frame); viewport.setAttribute("viewBox", `${frame * 256} 0 256 256`); }
    }
    drawMovementPosition();
    if (movementState || effects.size || model.units.some(u => u.visualStatuses?.length)) animationFrame = win.requestAnimationFrame(animate);
  }
  function startAnimation() {
    if (animationFrame === null && !disposed && !paused && !doc.hidden && !reducedMotion.matches && (movementState || effects.size || model.units.some(u => u.visualStatuses?.length))) animationFrame = win.requestAnimationFrame(animate);
  }
  function renderEffects() {
    if (!effectLayer || !impactLayer || !numberLayer) return; effectLayer.replaceChildren(); impactLayer.replaceChildren(); numberLayer.replaceChildren();
    const now = win.performance.now();
    if (!paused && !doc.hidden) for (const unit of model.units) for (const effect of unit.visualStatuses ?? []) {
      const mover = movementState?.plan.movers.find(m => m.unitId === unit.id);
      const position = mover ? robotBattleMotionPosition(mover, now - movementState!.startedAt) : unit.cell;
      const group = s("g", { transform: `translate(${position.x} ${position.y})`, class: "robot-status-vfx", "data-status-unit": unit.id, "aria-hidden": "true" });
      group.append(raster(effect, now, ROBOT_VFX[effect].loop));
      const upright = s("g", { transform: robotIsoBillboardTransform({ x: position.x + .5, y: position.y + .5 }) });
      upright.append(group); effectLayer.append(upright);
    }
    for (const c of actionArea) effectLayer.append(s("rect", { x: c.x + .03, y: c.y + .03, width: .94, height: .94, class: "spread-action-area", "data-action-area": "true", "aria-hidden": "true" }));
    for (const [id, event] of effects) {
      const group = s("g", { transform: `translate(${event.hit.cell.x} ${event.hit.cell.y})`, "data-hit": id, "data-effect-kind": event.hit.kind, class: "robot-battle-fx", "aria-hidden": "true" });
      group.style.animationDuration = `${event.durationMs}ms`;
      group.style.animationDelay = `-${Math.max(0, now - event.startedAt)}ms`;
      if (options.renderEffect && event.announceHit) group.append(options.renderEffect(event.hit, doc));
      else if (event.effect) group.append(raster(event.effect, now - event.startedAt, false, event.rate));
      else group.append(defaultRobotBattleEffect(event.hit, doc));
      const hitUpright = s("g", { transform: robotIsoBillboardTransform({ x: event.hit.cell.x + .5, y: event.hit.cell.y + .5 }) });
      hitUpright.append(group); impactLayer.append(hitUpright);
      if (event.hit.damage !== null) {
        const b = robotBattleCameraBox(camera, model.board), left = event.hit.cell.x < b.x + .5, right = event.hit.cell.x > b.x + b.width - 1.5;
        const text = s("text", { x: left ? .1 : right ? .9 : .5, y: event.hit.cell.y < b.y + .5 ? .28 : -.06, class: "damage-number", transform: `translate(${event.hit.cell.x} ${event.hit.cell.y})` }); text.textContent = String(event.hit.damage); text.style.textAnchor = left ? "start" : right ? "end" : "middle";
        if (event.hit.kind === "special:spread-shot") text.classList.add("spread-damage-number");
        const numberUpright = s("g", { transform: robotIsoBillboardTransform({ x: event.hit.cell.x + .5, y: event.hit.cell.y + .5 }) });
        numberUpright.append(text); numberLayer.append(numberUpright);
      }
    }
  }
  function clearEffects() {
    for (const timer of effectTimers) win.clearTimeout(timer); effectTimers.clear(); effects.clear(); actionArea = [];
    if (animationFrame !== null) win.cancelAnimationFrame(animationFrame); animationFrame = null;
    renderEffects();
  }
  function playEffects(hits: readonly RobotBattleHitView[], areaCells: readonly RobotPosition[] = [], cues: readonly RobotVfxCue[] = [], speed: RobotBattlePlaybackSpeed = "standard") {
    clearEffects(); if (paused || doc.hidden || reducedMotion.matches || speed === "skip") return;
    const scale = speed === "fast" ? 0.55 : 1;
    const plan = planRobotVfx(hits, cues).map(event => ({
      ...event, delayMs: Math.round(event.delayMs * scale), durationMs: Math.max(1, Math.round(event.durationMs * scale)),
    }));
    actionArea = areaCells; renderEffects();
    if (areaCells.length) { const timer = win.setTimeout(() => { effectTimers.delete(timer); actionArea = []; renderEffects(); }, Math.max(800, ...plan.map(e => e.delayMs + e.durationMs))); effectTimers.add(timer); }
    plan.forEach((event, i) => {
      const start = win.setTimeout(() => {
        effectTimers.delete(start); if (disposed || paused || doc.hidden) return;
        effects.set(i, { ...event, startedAt: win.performance.now(), rate: 1 / scale }); renderEffects(); startAnimation();
        if (event.announceHit) root.dispatchEvent(new CustomEvent("robot-battle-hit", { detail: event.hit, bubbles: true }));
        if (event.effect) root.dispatchEvent(new CustomEvent("robot-battle-vfx", { detail: { effect: event.effect, cell: event.hit.cell, durationMs: event.durationMs }, bubbles: true }));
        const end = win.setTimeout(() => { effectTimers.delete(end); effects.delete(i); renderEffects(); }, event.durationMs); effectTimers.add(end);
      }, event.delayMs); effectTimers.add(start);
    });
    startAnimation();
  }
  function presentationTimer(ms: number, callback: () => void) {
    const timer = win.setTimeout(() => {
      presentationTimers.delete(timer);
      if (!disposed && !paused && !doc.hidden) callback();
    }, ms);
    presentationTimers.add(timer);
  }
  /** Cancel cosmetic steps without losing a committed result from the last action. */
  function cancelPresentation(flushLog = true) {
    for (const timer of presentationTimers) win.clearTimeout(timer);
    presentationTimers.clear();
    if (flushLog) history = appendRobotBattleActionHistory(history, presentationFocus);
    presentationFocus = null;
    presentationPhase = null;
    highlightedLogId = null;
  }
  /**
   * The post-hit position is already committed. Hold the affected sprite at its
   * previous cell until the matching attack finishes, then show its displacement.
   */
  function preparePostHitMovement(actionId: string, post: RobotBattleMovementPlan, waitMs: number, log: RobotBattleActionLogView | null | undefined) {
    if (!post.durationMs) return;
    movementState = { actionId, plan: post, startedAt: win.performance.now() + waitMs, pendingLog: log ?? null };
    presentationTimer(waitMs, () => {
      if (movementState?.actionId !== actionId) return;
      movementState = { ...movementState, startedAt: win.performance.now() };
      render();
    });
    presentationTimer(waitMs + post.durationMs, () => {
      if (movementState?.actionId === actionId) cancelMovement();
      render();
    });
  }
  function presentResolvedAction(
    log: RobotBattleActionLogView | null | undefined,
    hits: readonly RobotBattleHitView[],
    area: readonly RobotPosition[],
    cues: readonly RobotVfxCue[],
    post: RobotBattleMovementPlan = { movers: [], durationMs: 0 },
  ) {
    const timeline = planRobotBattlePresentation(hits, cues, !!log || !!hits.length, playbackSpeed);
    if (paused || doc.hidden || reducedMotion.matches || playbackSpeed === "skip") {
      if (log) history = appendRobotBattleActionHistory(history, log);
      if (log) highlightedLogId = log.id;
      return;
    }
    if (post.durationMs && model.latestAction) preparePostHitMovement(model.latestAction.id, post, timeline.resultMs, log);
    if (!log) {
      playEffects(hits, area, cues, playbackSpeed);
      return;
    }
    presentationFocus = log;
    presentationPhase = "actor";
    highlightedLogId = log.id;
    if (timeline.targetMs) presentationTimer(timeline.actorMs, () => {
      presentationPhase = "target";
      render();
    });
    presentationTimer(timeline.introMs, () => {
      history = appendRobotBattleActionHistory(history, log);
      presentationPhase = "attack";
      render();
      playEffects(hits, area, cues, playbackSpeed);
    });
    presentationTimer(timeline.resultMs, () => {
      presentationPhase = "result";
      render();
    });
    presentationTimer(timeline.totalMs + post.durationMs, () => {
      presentationFocus = null;
      presentationPhase = null;
      highlightedLogId = null;
      render();
    });
  }
  function beginResolvedMovement(
    actionId: string,
    plan: RobotBattleMovementPlan,
    next: RobotBattleViewModel,
    cues: readonly RobotVfxCue[],
    post: RobotBattleMovementPlan = { movers: [], durationMs: 0 },
  ) {
    movementState = { actionId, plan, startedAt: win.performance.now(), pendingLog: next.latestLog ?? null };
    presentationTimer(plan.durationMs, () => {
      cancelMovement();
      if (next.latestAction) presentResolvedAction(next.latestLog, next.latestAction.hits, next.latestAction.areaCells ?? [], cues, post);
      render();
    });
  }
  function mapElement() {
    const svg = s("svg", { role: "grid", "aria-label": "戦場マップ", tabindex: 0, class: "battle-map" }), defs = s("defs"), clip = s("clipPath", { id: `robot-battle-clip-${++clipSequence}`, clipPathUnits: "userSpaceOnUse" });
    clipRect = s("rect"); clip.append(clipRect); defs.append(clip);
    // One source image per map; every tile references the same decoded atlas.
    // Repeating a 20KB data URI on 300 SVG elements would bloat the live DOM.
    if (terrainAtlas) defs.append(s("image", {
      id: terrainAtlasId, x: 0, y: 0,
      width: ROBOT_TERRAIN_ATLAS_CELL * ROBOT_TERRAIN_ATLAS_COLUMNS,
      height: ROBOT_TERRAIN_ATLAS_CELL * 2,
      href: terrainAtlas, class: "robot-terrain-atlas", "aria-hidden": "true",
    }));
    if (facilityAtlas) defs.append(s("image", {
      id: facilityAtlasId, x: 0, y: 0,
      width: ROBOT_FACILITY_ATLAS_CELL * ROBOT_FACILITY_ATLAS_COLUMNS,
      height: ROBOT_FACILITY_ATLAS_CELL * 2,
      href: facilityAtlas, class: "robot-facility-atlas", "aria-hidden": "true",
    }));
    const content = s("g", { "clip-path": `url(#${clip.id})` }); const world = s("g", { class: "robot-isometric-world", transform: robotIsoWorldMatrix(model.board.height) }); content.append(world); svg.append(defs, content); currentSvg = svg; applyCamera();
    const floorLayer = s("g", { class: "robot-terrain-floor-layer", "pointer-events": "none" });
    world.append(floorLayer);
    const foreground: SVGGElement[] = [], movingSprites: SVGGElement[] = [];
    const terrainObjects: { depth: number; node: SVGGElement }[] = [];
    const facilityStatuses: SVGGElement[] = [], unitFocusHud: SVGGElement[] = [];
    focusedHudSprite = null;
    movementSprites.clear();
    const movementPaths = new Map<string, string>();
    if (movementState && movementState.startedAt <= win.performance.now()) {
      for (const mover of movementState.plan.movers) {
        if (mover.style === "push" || mover.style === "pull") continue;
        for (const cell of mover.route) movementPaths.set(`${cell.x},${cell.y}`, mover.kind + (mover.style ? " " + mover.style : ""));
      }
    }
    const wall = new Set(model.board.walls.map(p => `${p.x},${p.y}`)), active = model.queue[0]?.unitIds ?? [];
    const focus = presentationFocus ?? (history[0]?.id === highlightedLogId ? history[0] : null);
    const staged = commandId && playerInput() ? stagedBlast() : undefined, activePoint = blastLocations[blastIndex];
    const activeCenter = activePoint && staged?.centers.find(c => sameRobotBattleCell(c.cell, activePoint.cell));
    const range = staged ? activeCenter ? model.units.filter(u => activeCenter.neighborIds.includes(u.id)).map(u => u.cell) : staged.centers.filter(c => !blastLocations.some(p => sameRobotBattleCell(p.cell, c.cell))).map(c => c.cell) : commandId && playerInput() ? robotBattleSelectionCells(model, choices(), selected, role) : [];
    const blastChoice = commandId && playerInput() ? choices().find(c => c.centerTargetId === selected.targetIds[0] && c.centerTargetId !== undefined) : undefined;
    for (let y = 0; y < model.board.height; y++) for (let x = 0; x < model.board.width; x++) {
      const cell = { x, y }, name = robotPositionToCell(cell), group = s("g", { "data-cell": name, role: "gridcell", "aria-label": name });
      const unit = model.units.find(u => u.hp > 0 && sameRobotBattleCell(u.cell, cell));
      const structure = model.structures.find(st => st.cells.some(c => sameRobotBattleCell(c, cell)));
      const stagedCenter = staged && blastLocations.findIndex(p => sameRobotBattleCell(p.cell, cell));
      const stagedSelected = !!staged && (blastLocations.some(p => sameRobotBattleCell(p.cell, cell)) || !!(unit||structure) && blastLocations.some(p => p.neighborIds.includes((unit||structure)!.id)));
      const selectedCell = stagedSelected || selected.destination !== null && sameRobotBattleCell(selected.destination, cell) || !!unit && [...selected.participantIds, ...selected.targetIds].includes(unit.id) || !!structure && selected.targetIds.includes(structure.id);
      floorLayer.append(s("rect", { x, y, width: 1, height: 1, class: wall.has(`${x},${y}`) ? "tile wall" : "tile" }));
      if (terrainAtlas) floorLayer.append(terrainSprite(robotTerrainFloor(x, y), x, y));
      // Every prop is backed by an existing Core wall. Empty cells stay empty.
      const wallArt = terrainAtlas && robotTerrainWall(cell, wall);
      if (wallArt) terrainObjects.push({ depth: x + y, node: terrainSprite(wallArt, x, y) });
      const movingSide = movementPaths.get(`${x},${y}`);
      if (movingSide) { const [kind, style] = movingSide.split(" "); world.append(s("rect", { x: x + .09, y: y + .09, width: .82, height: .82, class: "robot-movement-route robot-movement-route-" + kind + (style ? " robot-movement-route-" + style : ""), "pointer-events": "none", "aria-hidden": "true" })); }
      const marker=model.objectiveMarkers?.find(m=>sameRobotBattleCell(m.cell,cell));
      if(marker){const color=marker.status==="allied"?"#53c98a":marker.status==="enemy"?"#f06e7c":marker.status==="neutral"?"#a2aebc":"#edc76b";world.append(s("rect",{x:x+.09,y:y+.09,width:.82,height:.82,fill:color,"fill-opacity":.14,stroke:color,"stroke-opacity":.9,"stroke-width":.05,"data-objective-marker":marker.id}));const title=s("title",{});title.textContent=marker.label;group.append(title);group.setAttribute("aria-description",marker.label);}
      const fields=model.supportFields?.filter(f=>f.cells.some(c=>sameRobotBattleCell(c,cell)))??[];
      for(const field of fields){world.append(s("rect",{x:x+.03,y:y+.03,width:.94,height:.94,fill:field.kind==="mine"?"#e4b43d":field.kind==="slow"?"#9173cf":field.kind==="fire"?"#f06c36":"#29b787",opacity:.14,"data-support-field":field.id,...(field.kind?{"data-hazard-kind":field.kind}:{})}));}
      group.append(s("rect", { x, y, width: 1, height: 1, fill: "transparent" }));
      if(fields.length){const title=s("title",{});title.textContent=fields.map(f=>f.label).join("／");group.append(title);group.setAttribute("aria-description",title.textContent);}
      if (blastChoice?.areaCells?.some(c => sameRobotBattleCell(c, cell)) || staged && blastLocations.some(p => staged.centers.find(c => sameRobotBattleCell(c.cell, p.cell))?.areaCells.some(c => sameRobotBattleCell(c, cell)))) group.append(s("rect", { x: x + .025, y: y + .025, width: .95, height: .95, class: "blast-area-cell" }));
      if (structure) {
        const illustrated = facilityAtlas && structure.sprite && structure.hp !== 0;
        group.append(s("rect", { x: x + .12, y: y + .12, width: .76, height: .76,
          class: "structure", ...(illustrated ? { "fill-opacity": .17 } : {}) }));
        if (!illustrated) {
          const label = s("text", { x: x + .5, y: y + .62, class: "unit-label", transform: robotIsoBillboardTransform({ x: x + .5, y: y + .5 }) });
          label.textContent = structure.name === "戦術デコイ" ? "囮" : structure.name === "輸送車" ? "輸" : structure.name.includes("補給") ? "補" : "施";
          group.append(label);
        }
        group.setAttribute("aria-label", `${name} ${structure.name}`);
      }
      if (structure && presentationPhase !== "actor" && focus?.results.some(hit => hit.targetId === structure.id)) group.append(s("rect", { x: x + .06, y: y + .06, width: .88, height: .88, class: "battle-log-target-ring" }));
      // A defeated target is absent from the post-commit unit list; keep its
      // impact square highlighted during the target/attack presentation.
      if (presentationFocus && presentationPhase !== "actor" && !unit && !structure && model.latestAction?.hits.some(hit => hit.damage !== null && sameRobotBattleCell(hit.cell, cell))) {
        group.append(s("rect", { x: x + .06, y: y + .06, width: .88, height: .88, class: "battle-log-target-ring" }));
      }
      const overlay = group;
      const blastCenter = !!unit && blastChoice?.centerTargetId === unit.id || typeof stagedCenter === "number" && stagedCenter >= 0;
      if (typeof stagedCenter === "number" && stagedCenter >= 0) { group.dataset.blastRole = "center"; group.dataset.blastLocation = String(stagedCenter + 1); group.setAttribute("aria-label", `${name} 爆撃中心${stagedCenter + 1}`); }
      if (range.some(c => sameRobotBattleCell(c, cell)) || selectedCell) overlay.append(s("rect", { x: x + .04, y: y + .04, width: .92, height: .92, class: (selectedCell ? "legal-cell selected-cell" : "legal-cell") + (blastCenter ? " blast-center-cell" : blastChoice && selectedCell ? " blast-neighbor-selected" : "") }));
      if (unit) {
        const animated = movementState?.plan.movers.some(mover => mover.unitId === unit.id) ?? false;
        const unitVisual = s("g", { class: "robot-unit-visual", "data-unit-visual": unit.id, "pointer-events": "none" });
        group.dataset.unitId = unit.id; group.setAttribute("aria-label", `${name} ${unit.name}`);
        const isFocused = focusedUnitId === unit.id;
        if (isFocused) group.append(s("rect", {
          x: x + .04, y: y + .04, width: .92, height: .92,
          class: "robot-unit-focus-cell " + (unit.kind === "enemy" ? "robot-unit-focus-enemy" : "robot-unit-focus-ally"),
          "data-focused-cell": unit.id, "pointer-events": "none", "aria-hidden": "true",
        }));
        if (blastCenter) { group.dataset.blastRole = "center"; group.setAttribute("aria-label", `${name} ${unit.name} 爆撃中心`); }
        const appearance = unit.appearance;
        const fallback=s("rect",{x:.2,y:.2,width:.6,height:.6,rx:.12,class:`unit ${unit.kind}${active.includes(unit.id)?" current-unit":""}${unit.shielded?" shielded-unit":""}`});
        if(appearance){
          let selectedWeaponId:string|null=null;
          if(unit.kind==="controlled"&&active.includes(unit.id)&&commandId){
            const command=model.commands.find(c=>c.id===commandId),choice=matchingRobotBattleChoice(choices(),selected)??model.choices.find(c=>c.commandId===commandId),payload=choice?.payload;
            selectedWeaponId=command?.visualWeaponId??command?.blast?.weaponId??(payload&&typeof payload==="object"&&!Array.isArray(payload)&&"weaponId" in payload&&typeof payload.weaponId==="string"?payload.weaponId:null);
          }
          const family=robotDisplayedWeaponFamily(appearance.weaponIds,selectedWeaponId)??appearance.weaponFamilies[0]??null;
          const sprite=createRobotVisualSprite(doc,{frameId:appearance.frameId,palette:appearance.palette,weaponFamily:family,slot:selectedWeaponId!==null&&selectedWeaponId===appearance.weaponIds[1]?2:1,
             facing:unit.kind==="enemy"?"front":"right-rear",fallback});
          sprite.setAttribute("transform",robotBattleArtTranslation(x,y));unitVisual.append(sprite);
          unitVisual.append(s("rect",{x:x+.15,y:y+.12,width:.7,height:.72,fill:"transparent",stroke:active.includes(unit.id)?"#ffe386":unit.shielded?"#75d9ff":"transparent","stroke-width":.055,"pointer-events":"none",class:"robot-unit-selection-outline"}));
        }else{fallback.setAttribute("transform",robotBattleArtTranslation(x,y));unitVisual.append(fallback);}
        // Dense maps intentionally omit permanent unit labels and HP bars.
        // All live values remain accessible in the two roster sidebars.
        if (isFocused) {
          const hud = s("g", {
            class: "robot-unit-focus-hud", "data-focused-unit": unit.id,
            "data-focused-hp": `${unit.hp}/${unit.maxHp}`,
            "pointer-events": "none", "aria-hidden": "true",
          });
          const billboardHud = s("g", { transform: robotIsoBillboardTransform({ x: x + .5, y: y + .5 }) });
          billboardHud.append(
            s("rect", { x: x + .015, y: y - .45, width: .97, height: .44, rx: .075, class: "robot-unit-focus-panel" }),
            s("rect", { x: x + .12, y: y - .12, width: .76, height: .075, class: "hp-track" }),
            s("rect", { x: x + .12, y: y - .12, width: .76 * Math.max(0, unit.hp / Math.max(1, unit.maxHp)), height: .075, class: "hp-fill" }),
          );
          const label = s("text", { x: x + .5, y: y - .225, class: "robot-unit-focus-name",
            style: `font-size:${unit.name.length > 10 ? .105 : unit.name.length > 7 ? .13 : .18}px` });
          label.textContent = unit.name;
          billboardHud.append(label);
          hud.append(billboardHud); unitFocusHud.push(hud); focusedHudSprite = hud;
        }
        if (focus && (unit.id === focus.actorId || presentationPhase !== "actor" && focus.results.some(hit => hit.targetId === unit.id))) unitVisual.append(s("rect", { x: x + .04, y: y + .04, width: .92, height: .92, class: unit.id === focus.actorId ? "battle-log-actor-ring" : "battle-log-target-ring" }));
        if (unit.bombs) {
          group.dataset.bombCount = String(unit.bombs.count); group.setAttribute("aria-label", `${name} ${unit.name} 時限爆弾${unit.bombs.count}個`);
          const badge = s("g", { class: "fuse-badge", "pointer-events": "none" });
          badge.append(s("circle", { cx: x + .72, cy: y + .105, r: .075 }), s("path", { d: `M${x + .73} ${y + .04}l.035 -.025l.03 .025` }));
          const count = s("text", { x: x + .97, y: y + .16, class: "fuse-count" }); count.textContent = String(unit.bombs.count);
          if (unit.bombs.count > 99) { count.setAttribute("textLength", ".17"); count.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
          badge.append(count); unitVisual.append(badge);
        }
        // Keep the formally adopted robot/weapon art upright, not sheared into the floor.
        // The outer unitVisual remains in logical movement coordinates.
        const upright = s("g", { class: "robot-isometric-billboard", transform: robotIsoBillboardTransform({ x: x + .5, y: y + .5 }) });
        upright.append(...Array.from(unitVisual.childNodes));
        unitVisual.append(upright);
        if (animated) {
          const motion = movementState!.plan.movers.find(mover => mover.unitId === unit.id)!;
          unitVisual.dataset.motionStyle = motion.style ?? "ordinary";
          movingSprites.push(unitVisual);
          movementSprites.set(unit.id, unitVisual);
        } else overlay.append(unitVisual);
      }
      foreground.push(overlay);
    }
    // A multi-cell structure has exactly one sprite and one HP pool. Never
    // instantiate its image once per footprint cell or expand hit regions.
    if (facilityAtlas) {
      for (const structure of model.structures) {
        if (!structure.sprite || !structure.cells.length || structure.hp === 0) continue;
        const placement = robotFacilityPlacement(structure.cells, structure.sprite);
        terrainObjects.push({
          depth: Math.max(...structure.cells.map(c => c.x + c.y)),
          node: facilitySprite(structure.sprite, structure.cells, structure.id, false),
        });
        const { anchor } = placement;
        const status = s("g", {
          class: "robot-facility-status", "data-facility-status": structure.id,
          transform: robotIsoBillboardTransform(anchor), "pointer-events": "none", "aria-hidden": "true",
        });
        const text = s("text", { x: anchor.x, y: anchor.y - .04, class: "robot-facility-name" });
        text.textContent = structure.name;
        status.append(text);
        if (structure.hp !== undefined && structure.maxHp !== undefined) {
          status.append(
            s("rect", { x: anchor.x - .38, y: anchor.y + .01, width: .76, height: .095, class: "robot-facility-hp-track" }),
            s("rect", { x: anchor.x - .38, y: anchor.y + .01, width: .76 * Math.max(0, structure.hp / structure.maxHp), height: .095, class: "robot-facility-hp-fill" }),
          );
        }
        facilityStatuses.push(status);
      }
      for (const marker of model.objectiveMarkers ?? []) {
        const kind = robotFacilitySpriteForMarker(marker.id);
        if (!kind || model.structures.some(structure => structure.cells.some(c => sameRobotBattleCell(c, marker.cell)))) continue;
        terrainObjects.push({
          depth: marker.cell.x + marker.cell.y,
          node: facilitySprite(kind, [marker.cell], marker.id, true),
        });
      }
    }
    effectLayer = s("g", { class: "effect-layer", "pointer-events": "none" });
    impactLayer = s("g", { class: "robot-impact-layer", "pointer-events": "none", "aria-hidden": "true" });
    const terrainObjectLayer = s("g", { class: "robot-terrain-object-layer", "pointer-events": "none" });
    // Only ground props are depth-sorted: keep unit DOM order untouched for
    // established silhouette/palette selection and accessible combat overlays.
    terrainObjects.sort((a, b) => a.depth - b.depth);
    terrainObjectLayer.append(...terrainObjects.map(entry => entry.node));
    const protectedLayer = s("g", { class: "protected-unit-layer" });
    protectedLayer.append(...foreground, ...movingSprites);
    const facilityStatusLayer = s("g", { class: "robot-facility-status-layer", "pointer-events": "none" });
    facilityStatusLayer.append(...facilityStatuses);
    const unitFocusLayer = s("g", { class: "robot-unit-focus-layer", "pointer-events": "none", "aria-hidden": "true" });
    unitFocusLayer.append(...unitFocusHud);
    numberLayer = s("g", { class: "damage-layer", "pointer-events": "none" });
    // DOT/area telegraphs stay behind the units; committed hit flashes appear
    // above body/weapon sprites but under facility HUD and real damage receipts.
    // Both layers are noninteractive, so no overhanging hit can steal a grid tap.
    world.append(terrainObjectLayer, effectLayer, protectedLayer, impactLayer, facilityStatusLayer, unitFocusLayer, numberLayer); drawMovementPosition(); renderEffects(); startAnimation();
    const projectedPoint = (event: PointerEvent) => { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(svg.getScreenCTM()!.inverse()); };
    const point = (event: PointerEvent) => unprojectRobotIsoPoint(projectedPoint(event), model.board.height);
    const pointers = new Map<number, { x: number; y: number }>();
    let startPoint = { x: 0, y: 0 }, startCenter = camera.center, startCamera = camera, dragged = false, pinchDistance = 0;
    let startTransform: DOMMatrix | null = null;
    svg.onpointerdown = event => { svg.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size === 1) { startPoint = point(event); startTransform = svg.getScreenCTM()!.inverse(); startCenter = camera.center; startCamera = camera; dragged = false; } else { const [a, b] = [...pointers.values()]; pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y); startCamera = camera; dragged = true; } };
    svg.onpointermove = event => {
      if (!pointers.has(event.pointerId)) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) { const [a, b] = [...pointers.values()], distance = Math.hypot(a!.x - b!.x, a!.y - b!.y); if (distance > 0 && pinchDistance > 0) camera = zoomRobotBattleCamera(startCamera, pinchDistance / distance); applyCamera(); return; }
      const pixel = svg.createSVGPoint(); pixel.x = event.clientX; pixel.y = event.clientY;
      const p = startTransform ? unprojectRobotIsoPoint(pixel.matrixTransform(startTransform), model.board.height) : point(event), dx = p.x - startPoint.x, dy = p.y - startPoint.y;
      if (dragged || Math.abs(dx) + Math.abs(dy) > .2) { dragged = true; camera = focusRobotBattleCamera(camera, { x: startCenter.x - dx, y: startCenter.y - dy }, model.board); applyCamera(); }
    };
    svg.onpointerup = event => { const screen = projectedPoint(event); pointers.delete(event.pointerId); if (pointers.size === 0) {
      if (!dragged) { const cell = robotIsoHitCell(screen, model.board); if (cell) tap(cell); else if (focusedUnitId) { focusedUnitId = null; render(); } }
      else if (focusedUnitId) { focusedUnitId = null; render(); }
    } };
    svg.onpointercancel = event => { pointers.delete(event.pointerId); dragged = true; };
    svg.addEventListener("wheel", event => { event.preventDefault(); camera = zoomRobotBattleCamera(camera, event.deltaY > 0 ? 1.15 : 1 / 1.15); if (focusedUnitId) { focusedUnitId = null; render(); } else applyCamera(); }, { passive: false });
    let keyboardCell = { ...camera.center };
    svg.onkeydown = event => {
      const delta: Record<string, RobotPosition> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      const d = delta[event.key];
      if (d) { event.preventDefault(); keyboardCell = { x: Math.max(0, Math.min(model.board.width - 1, Math.round(keyboardCell.x) + d.x)), y: Math.max(0, Math.min(model.board.height - 1, Math.round(keyboardCell.y) + d.y)) }; svg.setAttribute("aria-label", `戦場マップ ${robotPositionToCell(keyboardCell)}`); }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); tap({ x: Math.floor(keyboardCell.x), y: Math.floor(keyboardCell.y) }); }
    };
    return svg;
  }
  function render() {
    if (disposed) return; syncDraft();
    const shell = node("section", undefined, "robot-battle-screen"); shell.setAttribute("aria-label", "戦場");
    const tools = node("div", undefined, "battle-tools");
    tools.append(node("span", `R${model.round}/${model.roundLimit}`, "round-label"), button(camera.mode === "overview" ? "フォーカス" : "俯瞰", () => { camera = { ...camera, mode: camera.mode === "overview" ? "focus" : "overview" }; render(); }), button("＋", () => { camera = zoomRobotBattleCamera(camera, 1 / 1.2); render(); }), button("−", () => { camera = zoomRobotBattleCamera(camera, 1.2); render(); }), button("行動機へ", () => { const unit = model.units.find(u => model.queue[0]?.unitIds.includes(u.id)); if (unit) camera = focusRobotBattleCamera(camera, unit.cell, model.board); render(); }));
    if (model.ai.formationUnlocked) {
      const permission = button("友軍連携：" + (model.ai.allowFormations ? "許可" : "不許可"), () => { void localOperation(() => options.configureAi({ kind: "mode", mode: model.ai.mode, allowFormations: !model.ai.allowFormations }, model.checkpoint)); });
      permission.setAttribute("aria-pressed", String(!!model.ai.allowFormations)); tools.append(permission);
    }
    const mode = button(model.ai.mode === "auto" ? "友軍:自動" : "友軍:指示", () => { void localOperation(() => options.configureAi({ kind: "mode", mode: model.ai.mode === "auto" ? "manual" : "auto" }, model.checkpoint)); }); mode.setAttribute("aria-label", `友軍AIモード ${model.ai.mode === "auto" ? "自動" : "マニュアル指示"}`); tools.append(mode);
    const leftRail = node("aside", undefined, "battle-info-rail"); leftRail.setAttribute("aria-label", "戦場情報");
    if (model.objectiveText) {
      const goal = node("section", undefined, "battle-goal"), text = node("small", model.objectiveText, "battle-objective");
      text.setAttribute("aria-label", "ミッション目標"); goal.append(text); leftRail.append(goal);
    }
    const allies = node("section", undefined, "battle-allies"); allies.setAttribute("aria-label", "味方機一覧");
    allies.append(node("strong", "味方機"));
    const allyList = node("ul");
    for (const friend of robotBattleLiveUnits(model.units, "ally")) {
      const item = node("li", undefined, friend.kind);
      const select = node("button", undefined, "battle-roster-unit");
      select.type = "button"; select.setAttribute("aria-label", `${friend.name} の位置を表示`);
      select.setAttribute("aria-pressed", String(focusedUnitId === friend.id));
      select.dataset.unitId = friend.id;
      select.append(node("span", friend.name), node("span", `HP ${friend.hp}/${friend.maxHp}`));
      select.onclick = () => toggleFocusedUnit(friend.id);
      item.append(select); allyList.append(item);
    }
    allies.append(allyList);
    const historyPanel = node("section", undefined, "battle-history");
    historyPanel.setAttribute("aria-label", "直近3行動");
    historyPanel.setAttribute("aria-live", "polite");
    historyPanel.append(node("strong", "直近3行動"));
    if (!history.length) historyPanel.append(node("p", "行動結果はまだありません", "battle-history-empty"));
    for (const entry of history) {
      const item = node("div", undefined, "battle-history-item" + (entry.id === highlightedLogId ? " battle-history-current" : ""));
      item.dataset.actionId = entry.id;
      const caption = node("div", undefined, "battle-history-heading");
      caption.append(node("strong", entry.actorName, "battle-log-name battle-log-" + entry.actorKind), doc.createTextNode("："), node("span", entry.action, "battle-history-action"));
      item.append(caption);
      for (const result of entry.results) {
        const line = node("p", undefined, "battle-history-result");
        line.append(node("span", result.name, "battle-log-name battle-log-" + result.kind));
        line.append(doc.createTextNode(" に "));
        line.append(node("strong", result.amount + "ダメージ", "battle-log-value"));
        if (result.destroyed) line.append(node("strong", " 撃破！", "battle-log-destroyed"));
        item.append(line);
      }
      historyPanel.append(item);
    }
    leftRail.append(allies);
    const order = node("ol", undefined, "battle-order"); order.setAttribute("aria-label", "行動順");
    model.queue.slice(0, 4).forEach((actor, i) => { const item = node("li", `${i === 0 ? "▶ " : ""}${actor.name}`, actor.kind); item.title = actor.name; if (i === 0) item.setAttribute("aria-current", "step"); order.append(item); });
    const map = node("div", undefined, "battle-map-wrap"); map.append(mapElement());
    const summary = node("section", undefined, "battle-summary"); summary.setAttribute("aria-label", "サマリー"); summary.setAttribute("aria-live", "polite"); summary.append(historyPanel);
    const unit = inspected && playerInput() ? model.units.find(u => u.id === inspected) : null;
    if (unit) {
      const title = node("div", undefined, "summary-title"), name = node("div", undefined, "summary-unit-name"); name.append(node("strong", unit.name + (unit.shielded ? " · シールド中" : unit.defended ? " · 防御中" : "")));
      const notes = [...(unit.bombs ? [`時限爆弾 ${unit.bombs.count}個 · ${unit.bombs.turnsUntilEnd === 0 ? "この手番終了" : "次の自身手番終了"}に起爆`] : []), ...(unit.combatNotes ?? [])];
      if (notes.length) { const status = node("small", notes.join(" / "), "fuse-details"); status.title = status.textContent!; name.append(status); }
      title.append(name, button("閉じる", () => { inspected = null; render(); }));
      const resources = node("div", `HP ${unit.hp}/${unit.maxHp}${unit.hasEnergyResource === false ? "" : ` · EN ${unit.en}/${unit.maxEn}`}`, "summary-resources");
      for (const [value, max, label] of ([[unit.hp, unit.maxHp, "HP"] as const, ...(unit.hasEnergyResource === false ? [] : [[unit.en, unit.maxEn, "EN"] as const])])) { const meter = node("meter"); meter.min = 0; meter.max = Math.max(1, max); meter.value = value; meter.setAttribute("aria-label", label); resources.append(meter); }
      const weapons = node("div", unit.weapons.map(w => `${w.name} Lv${w.level}`).join(" / "), "summary-weapons"); weapons.title = weapons.textContent!; summary.append(title, resources, weapons);
    } else {
      const structure = model.structures.find(st => st.id === inspected);
      if (structure?.hp !== undefined && structure.maxHp !== undefined) {
        summary.append(node("strong", structure.name), node("div", `HP ${structure.hp}/${structure.maxHp} · DEF ${structure.def}`));
      } else {
        const fallback = model.latestLog === undefined && !/：(?:通常移動|追加移動|移動後の反応解決|待機)(?:$|／)/.test(model.latestSummary) ? model.latestSummary : "機体や施設を選ぶと詳細を表示します";
        summary.append(node("p", fallback));
      }
    }
    const rightRail = node("aside", undefined, "battle-action-rail"); rightRail.setAttribute("aria-label", "行動パネル");
    const enemies = node("section", undefined, "battle-enemies"); enemies.setAttribute("aria-label", "敵機一覧");
    enemies.append(node("strong", "敵機"));
    const enemyList = node("ul");
    for (const enemy of robotBattleLiveUnits(model.units, "enemy")) {
      const item = node("li", undefined, "enemy");
      const select = node("button", undefined, "battle-roster-unit");
      select.type = "button"; select.setAttribute("aria-label", `${enemy.name} の位置を表示`);
      select.setAttribute("aria-pressed", String(focusedUnitId === enemy.id));
      select.dataset.unitId = enemy.id;
      select.append(node("span", enemy.name), node("span", `HP ${enemy.hp}/${enemy.maxHp}`));
      select.onclick = () => toggleFocusedUnit(enemy.id);
      item.append(select); enemyList.append(item);
    }
    enemies.append(enemyList);
    const actorStatus = node("section", undefined, "battle-actor-status"); actorStatus.setAttribute("aria-label", "現在の行動機");
    const currentActor = model.queue[0], activeUnit = model.units.find(u => currentActor?.unitIds.includes(u.id));
    const actorInfo = node("div", undefined, "battle-actor-info");
    actorInfo.append(node("strong", currentActor?.name ?? "行動終了"));
    if (activeUnit) actorInfo.append(node("span", `HP ${activeUnit.hp}/${activeUnit.maxHp}${activeUnit.hasEnergyResource === false ? "" : ` · EN ${activeUnit.en}/${activeUnit.maxEn}`}`));
    const speedButton = node("button", "演出:" + robotBattleSpeedLabel(playbackSpeed), "battle-speed-button");
    speedButton.type = "button";
    speedButton.setAttribute("aria-label", "演出速度：" + robotBattleSpeedLabel(playbackSpeed));
    speedButton.onclick = () => {
      playbackSpeed = ROBOT_BATTLE_SPEEDS[(ROBOT_BATTLE_SPEEDS.indexOf(playbackSpeed) + 1) % ROBOT_BATTLE_SPEEDS.length]!;
      cancelPresentation();
      cancelMovement(true);
      movementTiming = null;
      clearEffects();
      render();
      driver.update(model, busy);
      driver.pause(paused || doc.hidden || working);
    };
    actorStatus.append(actorInfo, speedButton);
    const menu = node("div", undefined, "battle-command-menu");
    if (needsFriendlyInstruction()) {
      const label = node("label", "友軍AIの指示"), select = node("select"); select.setAttribute("aria-label", "友軍AIの指示");
      for (const tactic of ROBOT_AI_TACTICS) { const option = node("option", tactic.name); option.value = tactic.id; select.append(option); } select.value = draft.tacticId; select.disabled = busy || working || paused;
      select.onchange = () => { draft = { tacticId: select.value as RobotAiInstruction["tacticId"], targetUnitId: null, cell: null }; render(); }; label.append(select); menu.append(label);
      const target = draft.targetUnitId ? model.units.find(u => u.id === draft.targetUnitId)?.name : draft.cell ? robotPositionToCell(draft.cell) : null;
      menu.append(node("p", target ? `指定：${target}` : draft.tacticId === "free-action" ? "設定済みのAI判断で行動します" : "対象機体・地点をマップで選択"));
      menu.append(button("この指示で行動", () => { const next = instruction(), unitId = model.queue[0]?.unitIds[0]; if (!next || !unitId) return; void localOperation(async () => { await options.configureAi({ kind: "instruction", unitId, instruction: next }, model.checkpoint); approvedFriendlyTurn = model.checkpoint.battleId + ":" + model.turnId; driver.approveFriendly(); }); }, instruction() === null));
    } else if (model.queue[0]?.kind !== "controlled") {
      menu.append(node("p", busy ? "確定結果を保存中…" : "自動行動中…"));
      if (aiFailed) menu.append(button("再試行", () => { aiFailed = false; notice = ""; driver.retry(); render(); }));
    } else if (category) {
      const commands = model.commands.filter(c => c.category === category), select = node("select"); select.setAttribute("aria-label", "行動の種類"); select.disabled = busy || working || paused;
      for (const command of commands) { const option = node("option", command.label); option.value = command.id; select.append(option); } select.value = commandId ?? ""; select.onchange = () => selectCommand(select.value); menu.append(select);
      if (choices().some(c => c.selection.participantIds.length)) {
        const step = button(role === "participant" ? "攻撃対象を選ぶ" : "参加機体を選ぶ", () => { role = role === "participant" ? "target" : "participant"; render(); }); menu.append(step);
      }
      const command = model.commands.find(c => c.id === commandId), chosen = matchingRobotBattleChoice(choices(), selected);
      const blast = command?.blast, cost = blast ? getRobotBlastSelectionCost(blast.plan, blastLocations.map(p => p.neighborIds.length)) : 0;
      const hint = blast ? `${blastIndex + 1}地点目：${blastLocations[blastIndex] ? `周辺 ${blastLocations[blastIndex]!.neighborIds.length}/${blast.plan.neighborCap}` : blast.plan.emptyCenters ? "敵または空きマスの中心を選択" : "中心の敵を選択"} · 消費EN${cost}${cost > blast.availableEn ? `（${blast.additionalCostBlockedReason ?? "EN不足"}）` : ""}` : command?.immediateTargetTap ? "中心の敵をタップすると拡散射撃を実行" : command?.targetFlow === "blast" ? selected.targetIds.length ? `橙：中心・青：周辺 ${selected.targetIds.length - 1}/2（0体でも決定可）` : "中心にする敵をタップ" : role === "destination" ? commandId === "resupply-field" || commandId === "tactical-decoy" ? "設置先をタップ" : "移動先をタップ" : role === "participant" ? "連携参加機体をタップ" : "対象をタップして選択";
      menu.append(node("p", notice || command?.disabledReason || hint));
      const controls = node("div", undefined, "command-confirm");
      if (blast) {
        controls.classList.add("blast-location-controls");
        for (let i = 0; i < blast.plan.centerCount; i++) controls.append(button(`地点${i + 1}${blastLocations[i] ? "を編集" : "を選ぶ"}`, () => { blastIndex = i; notice = ""; render(); }, i > 0 && !blastPointValid(0)));
        if (blastLocations[blastIndex]) controls.append(button("中心を選び直す", () => { blastLocations = blastLocations.slice(0, blastIndex); notice = ""; render(); }));
      } else if (command?.targetFlow === "blast" && selected.targetIds.length) controls.append(button("中心を選び直す", () => { selected = emptyRobotBattleSelection(); inspected = null; notice = ""; render(); }));
      controls.append(button("キャンセル", () => { resetSelection(); notice = ""; render(); }));
      if (blast) controls.append(button("決定", () => { const locations = blastLocations.map(p => ({ cell: { ...p.cell }, neighborIds: [...p.neighborIds] })); void localOperation(() => options.executeBlast!(commandId!, locations, model.checkpoint)); }, !options.executeBlast || blastLocations.length !== blast.plan.centerCount || blastLocations.some((_, i) => !blastPointValid(i)) || cost > blast.availableEn || !!command.disabledReason));
      else if (!command?.immediateTargetTap) controls.append(button(command?.confirmLabel ?? "実行", () => { if (chosen) void localOperation(() => options.execute(chosen.id, model.checkpoint)); }, !chosen));
      menu.append(controls);
    }
    if (notice && (!category || manualFriendly() || model.queue[0]?.kind !== "controlled")) { const error = node("p", notice); error.setAttribute("role", "alert"); menu.append(error); }
    const bar = node("nav", undefined, "battle-action-bar"); bar.setAttribute("aria-label", "戦闘操作");
    for (const c of categories) { const available = model.commands.some(m => m.category === c.id); const b = button(c.label, () => { category = c.id; const command = model.commands.find(m => m.category === c.id && !m.disabledReason) ?? model.commands.find(m => m.category === c.id); if (command) selectCommand(command.id); }, !playerInput() || !available); b.setAttribute("aria-pressed", String(category === c.id)); bar.append(b); }
    leftRail.append(order); leftRail.insertBefore(summary, allies);
    rightRail.append(actorStatus, bar, menu, enemies);
    shell.append(tools, leftRail, map, rightRail); root.replaceChildren(shell); applyCamera();
    // The first battle screen may be built before OfflineApp attaches its shell.
    // Observe the actual SVG size so initial camera and later checkpoints agree.
    mapResizeObserver?.disconnect();
    if (currentSvg) mapResizeObserver?.observe(currentSvg);
  }
  const visibility = () => {
    driver.pause(paused || doc.hidden || working);
    if (doc.hidden) { cancelPresentation(); cancelMovement(true); movementTiming = null; clearEffects(); }
    else { render(); startAnimation(); }
  };
  const motionChanged = () => { if (reducedMotion.matches) { cancelPresentation(); cancelMovement(true); movementTiming = null; } clearEffects(); render(); startAnimation(); };
  const resized = () => { if (!disposed) applyCamera(); };
  win.addEventListener("resize", resized);
  if (typeof ResizeObserver !== "undefined") mapResizeObserver = new ResizeObserver(resized);
  reducedMotion.addEventListener("change", motionChanged);
  doc.addEventListener("visibilitychange", visibility); render(); driver.update(model, busy); visibility();
  return {
    update(next, nextBusy) {
      if (disposed) return; assertRobotBattleViewModel(next);
      const actionChanged = (next.latestAction?.id ?? null) !== latestActionId, actorChanged = next.queue[0]?.id !== actorId;
      if (next.checkpoint.sequence !== model.checkpoint.sequence) aiFailed = false;
      if (next.ai.mode !== model.ai.mode) approvedFriendlyTurn = null;
      const cues = changedRobotVfxCues(model, next);
      const speed = reducedMotion.matches ? "skip" : playbackSpeed;
      const ordinary = actionChanged ? planRobotBattleMovement(model, next, speed) : null;
      const special = actionChanged ? planRobotBattleSpecialMovement(model, next, speed) : null;
      model = next; busy = nextBusy; actorId = next.queue[0]?.id;
      if (!robotBattleHighlightedUnit(model.units, focusedUnitId)) focusedUnitId = null;
      if (actionChanged || actorChanged) { inspected = null; notice = ""; resetSelection(); aiFailed = false; }
      latestActionId = next.latestAction?.id ?? null;
      if (actionChanged) {
        cancelPresentation();
        cancelMovement(true);
        movementTiming = null;
        clearEffects();
        if (next.latestAction) {
          const before = ordinary?.durationMs ? ordinary : special!.before;
          const after = special!.after;
          if (before.durationMs || after.durationMs) movementTiming = {
            actionId: next.latestAction.id, beforeMs: before.durationMs, afterMs: after.durationMs,
          };
          if (before.durationMs) beginResolvedMovement(next.latestAction.id, before, next, cues, after);
          else presentResolvedAction(next.latestLog, next.latestAction.hits, next.latestAction.areaCells ?? [], cues, after);
        }
      }
      render(); driver.update(model, busy); driver.pause(paused || doc.hidden || working);
    },
    presentationMs() { return displayDuration(model); },
    pause(value) { if (paused === value) return; paused = value; driver.pause(value || doc.hidden || working); if (value) { cancelPresentation(); cancelMovement(true); movementTiming = null; clearEffects(); } render(); startAnimation(); },
    dispose() { disposed = true; cancelPresentation(false); cancelMovement(); driver.dispose(); clearEffects(); doc.removeEventListener("visibilitychange", visibility); win.removeEventListener("resize", resized); mapResizeObserver?.disconnect(); reducedMotion.removeEventListener("change", motionChanged); preloads.length = 0; root.replaceChildren(); }
  };
}
