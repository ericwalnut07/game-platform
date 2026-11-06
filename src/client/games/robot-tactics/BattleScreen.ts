import { ROBOT_AI_TACTICS, type RobotAiConfiguration, type RobotAiInstruction } from "../../../games/robot-tactics/aiInstructions";
import type { RobotBlastLocation } from "../../../games/robot-tactics/battleBlast";
import { getRobotBlastSelectionCost } from "../../../games/robot-tactics/blastAddons";
import { robotPositionToCell, type RobotPosition } from "../../../games/robot-tactics/movement";
import { RobotBattleAutoDriver } from "./BattleAutoDriver";
import { focusRobotBattleCamera, robotBattleCameraBox, zoomRobotBattleCamera, type RobotBattleCamera } from "./BattleCamera";
import { changedRobotVfxCues, planRobotVfx, robotVfxFrame, ROBOT_VFX, type RobotVfxCue, type RobotVfxEvent, type RobotVfxId } from "./RobotVfx";
import { robotVfxAtlas } from "./RobotVfxAssets";
import { robotFrameArtUrl, robotFriendlyArtUrl, robotWeaponArtUrl, robotWeaponArtFamily } from "./RobotVisualArt";
import { assertRobotBattleViewModel, compatibleRobotBattleChoices, emptyRobotBattleSelection, matchingRobotBattleChoice, robotBattleSelectionCells, sameRobotBattleCell, type RobotBattleCategory, type RobotBattleHitView, type RobotBattleSelection, type RobotBattleSelectionRole, type RobotBattleViewModel } from "./BattleViewModel";
import "./battle-screen.css";

export interface RobotBattleScreenHandle {
  update(model: RobotBattleViewModel, busy: boolean): void;
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
  let inspected: string | null = null, notice = "", disposed = false, paused = false, busy = false, working = false, aiFailed = false;
  let latestActionId = model.latestAction?.id ?? null, actorId = model.queue[0]?.id;
  let currentSvg: SVGSVGElement | null = null, effectLayer: SVGGElement | null = null, numberLayer: SVGGElement | null = null;
  let mapResizeObserver: ResizeObserver | null = null;
  let clipRect: SVGRectElement | null = null;
  let draftOwner: string | null = null;
  let approvedFriendlyTurn: string | null = null;
  let draft = { tacticId: "free-action" as RobotAiInstruction["tacticId"], targetUnitId: null as string | null, cell: null as RobotPosition | null };
  const effects = new Map<number, RobotVfxEvent & { startedAt: number }>(), effectTimers = new Set<number>();
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let animationFrame: number | null = null;
  // Warm the embedded images before the first committed attack. No remote URLs.
  const preloads = Object.keys(ROBOT_VFX).map(id => { const image = new win.Image(); image.src = robotVfxAtlas(id as RobotVfxId); return image; });
  let actionArea: readonly RobotPosition[] = [];
  const driver = new RobotBattleAutoDriver({ set: (cb, ms) => win.setTimeout(cb, ms), clear: id => win.clearTimeout(id as number) }, async checkpoint => { await options.executeAi(checkpoint); }, error => { aiFailed = true; notice = error instanceof Error ? error.message : "AI行動を保存できませんでした。"; render(); });
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
  const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => { const e = doc.createElementNS(svgNs, tag); for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, String(value)); return e; };
  const playerInput = () => model.queue[0]?.kind === "controlled" && !busy && !working && !paused;
  const manualFriendly = () => model.queue[0]?.kind === "friendly-ai" && model.ai.mode === "manual";
  const needsFriendlyInstruction = () => manualFriendly() && approvedFriendlyTurn !== model.checkpoint.battleId + ":" + model.turnId;
  const button = (label: string, callback: () => void, disabled = false) => { const e = node("button", label); e.type = "button"; e.disabled = disabled || busy || working || paused; e.onclick = callback; return e; };
  const choices = () => model.choices.filter(c => c.commandId === commandId);
  const resetSelection = () => { category = null; commandId = null; selected = emptyRobotBattleSelection(); blastLocations = []; blastIndex = 0; };
  function selectCommand(id: string) {
    commandId = id; selected = emptyRobotBattleSelection(); blastLocations = []; blastIndex = 0; notice = "";
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
    const b = robotBattleCameraBox(camera, model.board, aspect);
    currentSvg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
    currentSvg.dataset.camera = JSON.stringify(b);
    for (const [key, value] of Object.entries(b)) clipRect?.setAttribute(key, String(value));
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
    if (!playerInput()) return;
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
  function raster(effect: RobotVfxId, elapsed: number, loop = false): SVGElement {
    const frame = reducedMotion.matches ? 2 : robotVfxFrame(effect, elapsed, loop);
    const viewport = s("svg", { x: -.1, y: -.1, width: 1.2, height: 1.2, viewBox: `${frame * 256} 0 256 256`, overflow: "hidden", "data-vfx": effect, "data-vfx-frame": frame, "data-vfx-start": win.performance.now() - elapsed, "data-vfx-loop": String(loop) });
    viewport.append(s("image", { x: 0, y: 0, width: 1536, height: 256, href: robotVfxAtlas(effect) }));
    return viewport;
  }
  function animate() {
    animationFrame = null;
    if (disposed || paused || doc.hidden || reducedMotion.matches) return;
    const now = win.performance.now();
    for (const viewport of effectLayer?.querySelectorAll<SVGSVGElement>("svg[data-vfx]") ?? []) {
      const effect = viewport.dataset.vfx as RobotVfxId, frame = robotVfxFrame(effect, now - Number(viewport.dataset.vfxStart), viewport.dataset.vfxLoop === "true");
      if (String(frame) !== viewport.dataset.vfxFrame) { viewport.dataset.vfxFrame = String(frame); viewport.setAttribute("viewBox", `${frame * 256} 0 256 256`); }
    }
    if (effects.size || model.units.some(u => u.visualStatuses?.length)) animationFrame = win.requestAnimationFrame(animate);
  }
  function startAnimation() {
    if (animationFrame === null && !disposed && !paused && !doc.hidden && !reducedMotion.matches && (effects.size || model.units.some(u => u.visualStatuses?.length))) animationFrame = win.requestAnimationFrame(animate);
  }
  function renderEffects() {
    if (!effectLayer || !numberLayer) return; effectLayer.replaceChildren(); numberLayer.replaceChildren();
    const now = win.performance.now();
    if (!paused && !doc.hidden) for (const unit of model.units) for (const effect of unit.visualStatuses ?? []) {
      const group = s("g", { transform: `translate(${unit.cell.x} ${unit.cell.y})`, class: "robot-status-vfx", "aria-hidden": "true" });
      group.append(raster(effect, now, ROBOT_VFX[effect].loop)); effectLayer.append(group);
    }
    for (const c of actionArea) effectLayer.append(s("rect", { x: c.x + .03, y: c.y + .03, width: .94, height: .94, class: "spread-action-area", "data-action-area": "true", "aria-hidden": "true" }));
    for (const [id, event] of effects) {
      const group = s("g", { transform: `translate(${event.hit.cell.x} ${event.hit.cell.y})`, "data-hit": id, "data-effect-kind": event.hit.kind, class: "robot-battle-fx", "aria-hidden": "true" });
      group.style.animationDuration = `${event.durationMs}ms`;
      group.style.animationDelay = `-${Math.max(0, now - event.startedAt)}ms`;
      if (options.renderEffect && event.announceHit) group.append(options.renderEffect(event.hit, doc));
      else if (event.effect) group.append(raster(event.effect, now - event.startedAt));
      else group.append(defaultRobotBattleEffect(event.hit, doc));
      effectLayer.append(group);
      if (event.hit.damage !== null) {
        const b = robotBattleCameraBox(camera, model.board), left = event.hit.cell.x < b.x + .5, right = event.hit.cell.x > b.x + b.width - 1.5;
        const text = s("text", { x: left ? .1 : right ? .9 : .5, y: event.hit.cell.y < b.y + .5 ? .28 : -.06, class: "damage-number", transform: `translate(${event.hit.cell.x} ${event.hit.cell.y})` }); text.textContent = String(event.hit.damage); text.style.textAnchor = left ? "start" : right ? "end" : "middle";
        if (event.hit.kind === "special:spread-shot") text.classList.add("spread-damage-number");
        numberLayer.append(text);
      }
    }
  }
  function clearEffects() {
    for (const timer of effectTimers) win.clearTimeout(timer); effectTimers.clear(); effects.clear(); actionArea = [];
    if (animationFrame !== null) win.cancelAnimationFrame(animationFrame); animationFrame = null;
    renderEffects();
  }
  function playEffects(hits: readonly RobotBattleHitView[], areaCells: readonly RobotPosition[] = [], cues: readonly RobotVfxCue[] = []) {
    clearEffects(); if (paused || doc.hidden || reducedMotion.matches) return;
    const plan = planRobotVfx(hits, cues); actionArea = areaCells; renderEffects();
    if (areaCells.length) { const timer = win.setTimeout(() => { effectTimers.delete(timer); actionArea = []; renderEffects(); }, Math.max(800, ...plan.map(e => e.delayMs + e.durationMs))); effectTimers.add(timer); }
    plan.forEach((event, i) => {
      const start = win.setTimeout(() => {
        effectTimers.delete(start); if (disposed || paused || doc.hidden) return;
        effects.set(i, { ...event, startedAt: win.performance.now() }); renderEffects(); startAnimation();
        if (event.announceHit) root.dispatchEvent(new CustomEvent("robot-battle-hit", { detail: event.hit, bubbles: true }));
        if (event.effect) root.dispatchEvent(new CustomEvent("robot-battle-vfx", { detail: { effect: event.effect, cell: event.hit.cell, durationMs: event.durationMs }, bubbles: true }));
        const end = win.setTimeout(() => { effectTimers.delete(end); effects.delete(i); renderEffects(); }, event.durationMs); effectTimers.add(end);
      }, event.delayMs); effectTimers.add(start);
    });
    startAnimation();
  }
  function mapElement() {
    const svg = s("svg", { role: "grid", "aria-label": "戦場マップ", tabindex: 0, class: "battle-map" }), defs = s("defs"), clip = s("clipPath", { id: `robot-battle-clip-${++clipSequence}`, clipPathUnits: "userSpaceOnUse" });
    clipRect = s("rect"); clip.append(clipRect); defs.append(clip); const content = s("g", { "clip-path": `url(#${clip.id})` }); svg.append(defs, content); currentSvg = svg; applyCamera();
    const foreground: SVGGElement[] = [];
    const wall = new Set(model.board.walls.map(p => `${p.x},${p.y}`)), active = model.queue[0]?.unitIds ?? [];
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
      content.append(s("rect", { x, y, width: 1, height: 1, class: wall.has(`${x},${y}`) ? "tile wall" : "tile" }));
      const marker=model.objectiveMarkers?.find(m=>sameRobotBattleCell(m.cell,cell));
      if(marker){const color=marker.status==="allied"?"#53c98a":marker.status==="enemy"?"#f06e7c":marker.status==="neutral"?"#a2aebc":"#edc76b";content.append(s("rect",{x:x+.09,y:y+.09,width:.82,height:.82,fill:color,"fill-opacity":.14,stroke:color,"stroke-opacity":.9,"stroke-width":.05,"data-objective-marker":marker.id}));const title=s("title",{});title.textContent=marker.label;group.append(title);group.setAttribute("aria-description",marker.label);}
      const fields=model.supportFields?.filter(f=>f.cells.some(c=>sameRobotBattleCell(c,cell)))??[];
      for(const field of fields){content.append(s("rect",{x:x+.03,y:y+.03,width:.94,height:.94,fill:field.kind==="mine"?"#e4b43d":field.kind==="slow"?"#9173cf":field.kind==="fire"?"#f06c36":"#29b787",opacity:.14,"data-support-field":field.id,...(field.kind?{"data-hazard-kind":field.kind}:{})}));}
      group.append(s("rect", { x, y, width: 1, height: 1, fill: "transparent" }));
      if(fields.length){const title=s("title",{});title.textContent=fields.map(f=>f.label).join("／");group.append(title);group.setAttribute("aria-description",title.textContent);}
      if (blastChoice?.areaCells?.some(c => sameRobotBattleCell(c, cell)) || staged && blastLocations.some(p => staged.centers.find(c => sameRobotBattleCell(c.cell, p.cell))?.areaCells.some(c => sameRobotBattleCell(c, cell)))) group.append(s("rect", { x: x + .025, y: y + .025, width: .95, height: .95, class: "blast-area-cell" }));
      if (structure) { group.append(s("rect", { x: x + .12, y: y + .12, width: .76, height: .76, class: "structure" })); const label = s("text", { x: x + .5, y: y + .62, class: "unit-label" }); label.textContent = structure.name==="戦術デコイ"?"囮":structure.name==="輸送車"?"輸":structure.name.includes("補給")?"補":"施"; group.append(label); group.setAttribute("aria-label", `${name} ${structure.name}`); }
      const overlay = group;
      const blastCenter = !!unit && blastChoice?.centerTargetId === unit.id || typeof stagedCenter === "number" && stagedCenter >= 0;
      if (typeof stagedCenter === "number" && stagedCenter >= 0) { group.dataset.blastRole = "center"; group.dataset.blastLocation = String(stagedCenter + 1); group.setAttribute("aria-label", `${name} 爆撃中心${stagedCenter + 1}`); }
      if (range.some(c => sameRobotBattleCell(c, cell)) || selectedCell) overlay.append(s("rect", { x: x + .04, y: y + .04, width: .92, height: .92, class: (selectedCell ? "legal-cell selected-cell" : "legal-cell") + (blastCenter ? " blast-center-cell" : blastChoice && selectedCell ? " blast-neighbor-selected" : "") }));
      if (unit) {
        group.dataset.unitId = unit.id; group.setAttribute("aria-label", `${name} ${unit.name}`);
        if (blastCenter) { group.dataset.blastRole = "center"; group.setAttribute("aria-label", `${name} ${unit.name} 爆撃中心`); }
        const appearance = unit.appearance;
        const bodyImage = appearance
          ? unit.kind === "friendly-ai" ? robotFriendlyArtUrl() : robotFrameArtUrl(appearance.frameId)
          : null;
        if (bodyImage) {
          overlay.append(s("image", { x: x + .04, y: y + .035, width: .92, height: .81,
            href: bodyImage, class: "robot-unit-art", "pointer-events": "none",
            "data-frame-id": appearance!.frameId, "aria-hidden": "true" }));
          let family = appearance!.weaponFamilies[0];
          if (unit.kind === "controlled" && active.includes(unit.id) && commandId) {
            const choice = model.choices.find(c => c.commandId === commandId);
            const payload = choice?.payload;
            const weaponId = payload && typeof payload === "object" && !Array.isArray(payload)
              && "weaponId" in payload && typeof payload.weaponId === "string" ? payload.weaponId : null;
            if (weaponId) family = robotWeaponArtFamily(weaponId) ?? family;
          }
          const weaponImage = family && robotWeaponArtUrl(family);
          if (weaponImage && family) overlay.append(s("image", { x: x + .015, y: y + .32, width: .52, height: .5,
            href: weaponImage, class: "robot-weapon-art", "pointer-events": "none",
            "data-weapon-family": family, "aria-hidden": "true" }));
          // Keep the selection/HP layer independent of artwork transparency.
          overlay.append(s("rect", { x: x + .15, y: y + .12, width: .7, height: .72,
            fill: "transparent", stroke: active.includes(unit.id) ? "#ffe386" : "transparent",
            "stroke-width": .055, "pointer-events": "none", class: "robot-unit-selection-outline" }));
        } else {
          overlay.append(s("rect", { x: x + .2, y: y + .2, width: .6, height: .6, rx: .12,
            class: `unit ${unit.kind}${active.includes(unit.id) ? " current-unit" : ""}${unit.shielded ? " shielded-unit" : ""}` }));
        }
        const label = s("text", { x: x + .5, y: y + .62, class: "unit-label" }); label.textContent = unit.name.slice(-2); overlay.append(label);
        overlay.append(s("rect", { x: x + .16, y: y + .84, width: .68, height: .08, class: "hp-track" }), s("rect", { x: x + .16, y: y + .84, width: .68 * unit.hp / unit.maxHp, height: .08, class: "hp-fill" }));
        if (unit.bombs) {
          group.dataset.bombCount = String(unit.bombs.count); group.setAttribute("aria-label", `${name} ${unit.name} 時限爆弾${unit.bombs.count}個`);
          const badge = s("g", { class: "fuse-badge", "pointer-events": "none" });
          badge.append(s("circle", { cx: x + .72, cy: y + .105, r: .075 }), s("path", { d: `M${x + .73} ${y + .04}l.035 -.025l.03 .025` }));
          const count = s("text", { x: x + .97, y: y + .16, class: "fuse-count" }); count.textContent = String(unit.bombs.count);
          if (unit.bombs.count > 99) { count.setAttribute("textLength", ".17"); count.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
          badge.append(count); overlay.append(badge);
        }
      }
      foreground.push(overlay);
    }
    effectLayer = s("g", { class: "effect-layer", "pointer-events": "none" });
    const protectedLayer = s("g", { class: "protected-unit-layer" }); protectedLayer.append(...foreground);
    numberLayer = s("g", { class: "damage-layer", "pointer-events": "none" });
    content.append(effectLayer, protectedLayer, numberLayer); renderEffects(); startAnimation();
    const point = (event: PointerEvent) => { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(svg.getScreenCTM()!.inverse()); };
    const pointers = new Map<number, { x: number; y: number }>();
    let startPoint = { x: 0, y: 0 }, startCenter = camera.center, startCamera = camera, dragged = false, pinchDistance = 0;
    let startTransform: DOMMatrix | null = null;
    svg.onpointerdown = event => { svg.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size === 1) { startPoint = point(event); startTransform = svg.getScreenCTM()!.inverse(); startCenter = camera.center; startCamera = camera; dragged = false; } else { const [a, b] = [...pointers.values()]; pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y); startCamera = camera; dragged = true; } };
    svg.onpointermove = event => {
      if (!pointers.has(event.pointerId)) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) { const [a, b] = [...pointers.values()], distance = Math.hypot(a!.x - b!.x, a!.y - b!.y); if (distance > 0 && pinchDistance > 0) camera = zoomRobotBattleCamera(startCamera, pinchDistance / distance); applyCamera(); return; }
      const pixel = svg.createSVGPoint(); pixel.x = event.clientX; pixel.y = event.clientY;
      const p = startTransform ? pixel.matrixTransform(startTransform) : point(event), dx = p.x - startPoint.x, dy = p.y - startPoint.y;
      if (dragged || Math.abs(dx) + Math.abs(dy) > .2) { dragged = true; camera = focusRobotBattleCamera(camera, { x: startCenter.x - dx, y: startCenter.y - dy }, model.board); applyCamera(); }
    };
    svg.onpointerup = event => { const p = point(event); pointers.delete(event.pointerId); if (!dragged && pointers.size === 0) { const cell = { x: Math.floor(p.x), y: Math.floor(p.y) }, b = robotBattleCameraBox(camera, model.board, svg.clientHeight > 0 ? svg.clientWidth / svg.clientHeight : 1); if (p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height) tap(cell); } };
    svg.onpointercancel = event => { pointers.delete(event.pointerId); dragged = true; };
    svg.addEventListener("wheel", event => { event.preventDefault(); camera = zoomRobotBattleCamera(camera, event.deltaY > 0 ? 1.15 : 1 / 1.15); applyCamera(); }, { passive: false });
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
    for (const friend of model.units.filter(u => u.kind === "controlled" || u.kind === "friendly-ai")) {
      const item = node("li", undefined, friend.kind);
      item.append(node("span", friend.name), node("span", `HP ${friend.hp}/${friend.maxHp}`));
      if (friend.hp === 0) item.classList.add("defeated");
      allyList.append(item);
    }
    allies.append(allyList); leftRail.append(allies);
    const order = node("ol", undefined, "battle-order"); order.setAttribute("aria-label", "行動順");
    model.queue.slice(0, 4).forEach((actor, i) => { const item = node("li", `${i === 0 ? "▶ " : ""}${actor.name}`, actor.kind); item.title = actor.name; if (i === 0) item.setAttribute("aria-current", "step"); order.append(item); });
    const map = node("div", undefined, "battle-map-wrap"); map.append(mapElement());
    const summary = node("section", undefined, "battle-summary"); summary.setAttribute("aria-label", "サマリー"); summary.setAttribute("aria-live", "polite");
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
        summary.append(node("p", model.latestSummary));
      }
    }
    const rightRail = node("aside", undefined, "battle-action-rail"); rightRail.setAttribute("aria-label", "行動パネル");
    const actorStatus = node("section", undefined, "battle-actor-status"); actorStatus.setAttribute("aria-label", "現在の行動機");
    const currentActor = model.queue[0], activeUnit = model.units.find(u => currentActor?.unitIds.includes(u.id));
    actorStatus.append(node("strong", currentActor?.name ?? "行動終了"));
    if (activeUnit) actorStatus.append(node("span", `HP ${activeUnit.hp}/${activeUnit.maxHp}${activeUnit.hasEnergyResource === false ? "" : ` · EN ${activeUnit.en}/${activeUnit.maxEn}`}`));
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
    leftRail.append(order, summary);
    rightRail.append(actorStatus, bar, menu);
    shell.append(tools, leftRail, map, rightRail); root.replaceChildren(shell); applyCamera();
    // The first battle screen may be built before OfflineApp attaches its shell.
    // Observe the actual SVG size so initial camera and later checkpoints agree.
    mapResizeObserver?.disconnect();
    if (currentSvg) mapResizeObserver?.observe(currentSvg);
  }
  const visibility = () => { driver.pause(paused || doc.hidden || working); if (doc.hidden) clearEffects(); else { renderEffects(); startAnimation(); } };
  const motionChanged = () => { clearEffects(); startAnimation(); };
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
      model = next; busy = nextBusy; actorId = next.queue[0]?.id;
      if (actionChanged || actorChanged) { inspected = null; notice = ""; resetSelection(); aiFailed = false; }
      latestActionId = next.latestAction?.id ?? null;
      render(); driver.update(model, busy); driver.pause(paused || doc.hidden || working);
      if (actionChanged && next.latestAction) playEffects(next.latestAction.hits, next.latestAction.areaCells, cues);
    },
    pause(value) { if (paused === value) return; paused = value; driver.pause(value || doc.hidden || working); if (value) clearEffects(); render(); startAnimation(); },
    dispose() { disposed = true; driver.dispose(); clearEffects(); doc.removeEventListener("visibilitychange", visibility); win.removeEventListener("resize", resized); mapResizeObserver?.disconnect(); reducedMotion.removeEventListener("change", motionChanged); preloads.length = 0; root.replaceChildren(); }
  };
}
