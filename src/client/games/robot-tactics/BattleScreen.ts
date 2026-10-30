import { ROBOT_AI_TACTICS, type RobotAiConfiguration, type RobotAiInstruction } from "../../../games/robot-tactics/aiInstructions";
import { robotPositionToCell, type RobotPosition } from "../../../games/robot-tactics/movement";
import { RobotBattleAutoDriver } from "./BattleAutoDriver";
import { focusRobotBattleCamera, robotBattleCameraBox, zoomRobotBattleCamera, type RobotBattleCamera } from "./BattleCamera";
import { planRobotBattleEffects } from "./BattleEffects";
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
    pincer: "M0 .1L.45 .5L0 .9M1 .1L.55 .5L1 .9", "pair-defense": "M.1 .2L.5 .05L.9 .2L.8 .7L.5 .95L.2 .7Z", protection: "M.1 .2H.9V.65L.5 .95L.1 .65Z"
  };
  path.setAttribute("d", shapes[hit.kind] ?? "M.5 .05L.65 .35L.95 .5L.65 .65L.5 .95L.35 .65L.05 .5L.35 .35Z");
  path.setAttribute("fill", "none"); path.setAttribute("stroke", "#fff4b8"); path.setAttribute("stroke-width", ".09"); svg.append(path); return svg;
}

export function mountRobotBattleScreen(root: HTMLElement, options: RobotBattleScreenOptions): RobotBattleScreenHandle {
  const doc = root.ownerDocument, win = doc.defaultView!;
  let model = options.model; assertRobotBattleViewModel(model);
  let camera: RobotBattleCamera = { mode: "focus", center: model.units.find(u => u.id === model.queue[0]?.unitIds[0])?.cell ?? { x: 0, y: 0 }, span: 9 };
  let category: RobotBattleCategory | null = null, commandId: string | null = null, selected = emptyRobotBattleSelection(), role: RobotBattleSelectionRole = "target";
  let inspected: string | null = null, notice = "", disposed = false, paused = false, busy = false, working = false, aiFailed = false;
  let latestActionId = model.latestAction?.id ?? null, actorId = model.queue[0]?.id;
  let currentSvg: SVGSVGElement | null = null, effectLayer: SVGGElement | null = null;
  let clipRect: SVGRectElement | null = null;
  let draftOwner: string | null = null;
  let approvedFriendlyTurn: string | null = null;
  let draft = { tacticId: "free-action" as RobotAiInstruction["tacticId"], targetUnitId: null as string | null, cell: null as RobotPosition | null };
  const effects = new Map<number, { hit: RobotBattleHitView; durationMs: number }>(), effectTimers = new Set<number>();
  const driver = new RobotBattleAutoDriver({ set: (cb, ms) => win.setTimeout(cb, ms), clear: id => win.clearTimeout(id as number) }, async checkpoint => { await options.executeAi(checkpoint); }, error => { aiFailed = true; notice = error instanceof Error ? error.message : "AI行動を保存できませんでした。"; render(); });
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
  const s = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => { const e = doc.createElementNS(svgNs, tag); for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, String(value)); return e; };
  const playerInput = () => model.queue[0]?.kind === "controlled" && !busy && !working && !paused;
  const manualFriendly = () => model.queue[0]?.kind === "friendly-ai" && model.ai.mode === "manual";
  const needsFriendlyInstruction = () => manualFriendly() && approvedFriendlyTurn !== model.checkpoint.battleId + ":" + model.turnId;
  const button = (label: string, callback: () => void, disabled = false) => { const e = node("button", label); e.type = "button"; e.disabled = disabled || busy || working || paused; e.onclick = callback; return e; };
  const choices = () => model.choices.filter(c => c.commandId === commandId);
  const resetSelection = () => { category = null; commandId = null; selected = emptyRobotBattleSelection(); };
  function selectCommand(id: string) {
    commandId = id; selected = emptyRobotBattleSelection(); notice = "";
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
  function applyCamera() { if (currentSvg) { const b = robotBattleCameraBox(camera, model.board); currentSvg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`); currentSvg.dataset.camera = JSON.stringify(b); for (const [key, value] of Object.entries(b)) clipRect?.setAttribute(key, String(value)); } }
  function tap(cell: RobotPosition) {
    if (camera.mode === "overview") { camera = focusRobotBattleCamera(camera, cell, model.board); render(); return; }
    const unit = model.units.find(u => u.hp > 0 && sameRobotBattleCell(u.cell, cell));
    if (needsFriendlyInstruction() && !busy && !working && !paused) {
      if (draft.tacticId === "focus-attack" && unit?.kind === "enemy" || draft.tacticId === "escort-specific-ally" && unit && unit.kind !== "enemy") draft.targetUnitId = unit!.id;
      else if (draft.tacticId === "defend-location" || draft.tacticId === "advance-to-location") draft.cell = cell;
      render(); return;
    }
    if (!playerInput()) return;
    if (unit) inspected = unit.id;
    if (commandId) {
      const targetId = unit?.id ?? model.structures.find(st => st.cells.some(c => sameRobotBattleCell(c, cell)))?.id;
      let next: RobotBattleSelection = selected;
      if (role === "destination") next = { ...selected, destination: cell };
      else if (targetId) { const key = role === "participant" ? "participantIds" : "targetIds", ids = selected[key]; next = { ...selected, [key]: ids.includes(targetId) ? ids.filter(id => id !== targetId) : [...ids, targetId] }; }
      const compatible = compatibleRobotBattleChoices(choices(), next);
      if (compatible.length && next !== selected) {
        selected = next; notice = "";
        if (role === "participant" && compatible.some(c => c.selection.participantIds.length === selected.participantIds.length && c.selection.targetIds.length)) role = "target";
      } else notice = model.blocked.find(b => b.commandId === commandId && sameRobotBattleCell(b.cell, cell))?.reason ?? "そのマスは選択できません。";
    }
    render();
  }
  function renderEffects() {
    if (!effectLayer) return; effectLayer.replaceChildren();
    for (const [id, event] of effects) {
      const group = s("g", { transform: `translate(${event.hit.cell.x} ${event.hit.cell.y})`, "data-hit": id, "data-effect-kind": event.hit.kind, class: "robot-battle-fx", "aria-hidden": "true" });
      group.style.animationDuration = `${event.durationMs}ms`; group.append((options.renderEffect ?? defaultRobotBattleEffect)(event.hit, doc));
      if (event.hit.damage !== null) {
        const b = robotBattleCameraBox(camera, model.board), left = event.hit.cell.x < b.x + .5, right = event.hit.cell.x > b.x + b.width - 1.5;
        const text = s("text", { x: left ? .1 : right ? .9 : .5, y: event.hit.cell.y < b.y + .5 ? .28 : -.06, class: "damage-number" }); text.textContent = String(event.hit.damage); text.style.textAnchor = left ? "start" : right ? "end" : "middle"; group.append(text);
      }
      effectLayer.append(group);
    }
  }
  function clearEffects() { for (const timer of effectTimers) win.clearTimeout(timer); effectTimers.clear(); effects.clear(); renderEffects(); }
  function playEffects(hits: readonly RobotBattleHitView[]) {
    clearEffects(); if (paused || doc.hidden) return;
    planRobotBattleEffects(hits).forEach((event, i) => {
      const start = win.setTimeout(() => {
        effectTimers.delete(start); if (disposed || paused || doc.hidden) return;
        effects.set(i, event); renderEffects(); root.dispatchEvent(new CustomEvent("robot-battle-hit", { detail: event.hit, bubbles: true }));
        const end = win.setTimeout(() => { effectTimers.delete(end); effects.delete(i); renderEffects(); }, event.durationMs); effectTimers.add(end);
      }, event.delayMs); effectTimers.add(start);
    });
  }
  function mapElement() {
    const svg = s("svg", { role: "grid", "aria-label": "戦場マップ", tabindex: 0, class: "battle-map" }), defs = s("defs"), clip = s("clipPath", { id: `robot-battle-clip-${++clipSequence}`, clipPathUnits: "userSpaceOnUse" });
    clipRect = s("rect"); clip.append(clipRect); defs.append(clip); const content = s("g", { "clip-path": `url(#${clip.id})` }); svg.append(defs, content); currentSvg = svg; applyCamera();
    const wall = new Set(model.board.walls.map(p => `${p.x},${p.y}`)), active = model.queue[0]?.unitIds ?? [];
    const range = commandId && playerInput() ? robotBattleSelectionCells(model, choices(), selected, role) : [];
    for (let y = 0; y < model.board.height; y++) for (let x = 0; x < model.board.width; x++) {
      const cell = { x, y }, name = robotPositionToCell(cell), group = s("g", { "data-cell": name, role: "gridcell", "aria-label": name });
      const unit = model.units.find(u => u.hp > 0 && sameRobotBattleCell(u.cell, cell));
      const structure = model.structures.find(st => st.cells.some(c => sameRobotBattleCell(c, cell)));
      const selectedCell = selected.destination !== null && sameRobotBattleCell(selected.destination, cell) || !!unit && [...selected.participantIds, ...selected.targetIds].includes(unit.id) || !!structure && selected.targetIds.includes(structure.id);
      group.append(s("rect", { x, y, width: 1, height: 1, class: wall.has(`${x},${y}`) ? "tile wall" : "tile" }));
      if (structure) { group.append(s("rect", { x: x + .12, y: y + .12, width: .76, height: .76, class: "structure" })); const label = s("text", { x: x + .5, y: y + .62, class: "unit-label" }); label.textContent = "施"; group.append(label); group.setAttribute("aria-label", `${name} ${structure.name}`); }
      if (range.some(c => sameRobotBattleCell(c, cell)) || selectedCell) group.append(s("rect", { x: x + .04, y: y + .04, width: .92, height: .92, class: selectedCell ? "legal-cell selected-cell" : "legal-cell" }));
      if (unit) {
        group.dataset.unitId = unit.id; group.setAttribute("aria-label", `${name} ${unit.name}`);
        group.append(s("rect", { x: x + .2, y: y + .2, width: .6, height: .6, rx: .12, class: `unit ${unit.kind}${active.includes(unit.id) ? " current-unit" : ""}` }));
        const label = s("text", { x: x + .5, y: y + .62, class: "unit-label" }); label.textContent = unit.name.slice(-2); group.append(label);
        group.append(s("rect", { x: x + .16, y: y + .84, width: .68, height: .08, class: "hp-track" }), s("rect", { x: x + .16, y: y + .84, width: .68 * unit.hp / unit.maxHp, height: .08, class: "hp-fill" }));
      }
      content.append(group);
    }
    effectLayer = s("g", { class: "effect-layer", "pointer-events": "none" }); content.append(effectLayer); renderEffects();
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
    svg.onpointerup = event => { const p = point(event); pointers.delete(event.pointerId); if (!dragged && pointers.size === 0) { const cell = { x: Math.floor(p.x), y: Math.floor(p.y) }, b = robotBattleCameraBox(camera, model.board); if (p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height) tap(cell); } };
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
    const mode = button(model.ai.mode === "auto" ? "友軍:自動" : "友軍:指示", () => { void localOperation(() => options.configureAi({ kind: "mode", mode: model.ai.mode === "auto" ? "manual" : "auto" }, model.checkpoint)); }); mode.setAttribute("aria-label", `友軍AIモード ${model.ai.mode === "auto" ? "自動" : "マニュアル指示"}`); tools.append(mode);
    const order = node("ol", undefined, "battle-order"); order.setAttribute("aria-label", "行動順");
    model.queue.slice(0, 4).forEach((actor, i) => { const item = node("li", `${i === 0 ? "▶ " : ""}${actor.name}`, actor.kind); item.title = actor.name; if (i === 0) item.setAttribute("aria-current", "step"); order.append(item); });
    const map = node("div", undefined, "battle-map-wrap"); map.append(mapElement());
    const summary = node("section", undefined, "battle-summary"); summary.setAttribute("aria-label", "サマリー"); summary.setAttribute("aria-live", "polite");
    const unit = inspected && playerInput() ? model.units.find(u => u.id === inspected) : null;
    if (unit) {
      const title = node("div", undefined, "summary-title"); title.append(node("strong", unit.name), button("閉じる", () => { inspected = null; render(); }));
      const resources = node("div", `HP ${unit.hp}/${unit.maxHp} · EN ${unit.en}/${unit.maxEn}`, "summary-resources");
      for (const [value, max, label] of [[unit.hp, unit.maxHp, "HP"], [unit.en, unit.maxEn, "EN"]] as const) { const meter = node("meter"); meter.min = 0; meter.max = Math.max(1, max); meter.value = value; meter.setAttribute("aria-label", label); resources.append(meter); }
      const weapons = node("div", unit.weapons.map(w => `${w.name} Lv${w.level}`).join(" / "), "summary-weapons"); weapons.title = weapons.textContent!; summary.append(title, resources, weapons);
    } else summary.append(node("p", model.latestSummary));
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
      menu.append(node("p", notice || command?.disabledReason || (role === "destination" ? "移動先をタップ" : role === "participant" ? "連携参加機体をタップ" : "対象をタップして選択")));
      const controls = node("div", undefined, "command-confirm"); controls.append(button("キャンセル", () => { resetSelection(); notice = ""; render(); }), button("実行", () => { if (chosen) void localOperation(() => options.execute(chosen.id, model.checkpoint)); }, !chosen)); menu.append(controls);
    }
    if (notice && (!category || manualFriendly() || model.queue[0]?.kind !== "controlled")) { const error = node("p", notice); error.setAttribute("role", "alert"); menu.append(error); }
    const bar = node("nav", undefined, "battle-action-bar"); bar.setAttribute("aria-label", "戦闘操作");
    for (const c of categories) { const available = model.commands.some(m => m.category === c.id); const b = button(c.label, () => { category = c.id; const command = model.commands.find(m => m.category === c.id && !m.disabledReason) ?? model.commands.find(m => m.category === c.id); if (command) selectCommand(command.id); }, !playerInput() || !available); b.setAttribute("aria-pressed", String(category === c.id)); bar.append(b); }
    shell.append(tools, order, map, summary, menu, bar); root.replaceChildren(shell);
  }
  const visibility = () => { driver.pause(paused || doc.hidden || working); if (doc.hidden) clearEffects(); };
  doc.addEventListener("visibilitychange", visibility); render(); driver.update(model, busy); visibility();
  return {
    update(next, nextBusy) {
      if (disposed) return; assertRobotBattleViewModel(next);
      const actionChanged = (next.latestAction?.id ?? null) !== latestActionId, actorChanged = next.queue[0]?.id !== actorId;
      if (next.checkpoint.sequence !== model.checkpoint.sequence) aiFailed = false;
      if (next.ai.mode !== model.ai.mode) approvedFriendlyTurn = null;
      model = next; busy = nextBusy; actorId = next.queue[0]?.id;
      if (actionChanged || actorChanged) { inspected = null; notice = ""; resetSelection(); aiFailed = false; }
      latestActionId = next.latestAction?.id ?? null;
      render(); driver.update(model, busy); driver.pause(paused || doc.hidden || working);
      if (actionChanged && next.latestAction) playEffects(next.latestAction.hits);
    },
    pause(value) { if (paused === value) return; paused = value; driver.pause(value || doc.hidden || working); if (value) clearEffects(); render(); },
    dispose() { disposed = true; driver.dispose(); clearEffects(); doc.removeEventListener("visibilitychange", visibility); root.replaceChildren(); }
  };
}
