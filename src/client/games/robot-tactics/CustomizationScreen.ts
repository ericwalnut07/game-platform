import { getRobotLoadoutPlan, type RobotCoreId } from "../../../games/robot-tactics/equipment";
import { getRobotFrameComparison, getRobotFrameName, previewRobotCustomization, ROBOT_STAT_NAMES, type RobotComparisonRow, type RobotCustomizationChange } from "../../../games/robot-tactics/customization";
import { getRobotOfflineAvailability, getRobotOfflineEquipmentName } from "../../../games/robot-tactics/offlineProgress";
import type { RobotOfflineSave } from "../../../games/robot-tactics/offlineSession";
import type { RobotStat } from "../../../games/robot-tactics/growth";
import frameData from "../../../../docs/design/robot-tactics/frames.json";

export interface RobotCustomizationUiState {
  coreId: RobotCoreId | null;
  expandedFrameId: string | null;
  scrollTop: number;
}
export function renderRobotCustomization(doc: Document, state: RobotOfflineSave, ui: RobotCustomizationUiState, options: {
  readonly busy: boolean;
  readonly refresh: () => void;
  readonly apply: (change: RobotCustomizationChange, expectedRevision: number) => void;
}): HTMLElement {
  const root = doc.createElement("div"); root.className = "robot-customization";
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e;
  };
  const button = (label: string, act: () => void, disabled = false) => {
    const b = node("button", label); b.type = "button"; b.disabled = options.busy || disabled; b.onclick = act; return b;
  };
  const available = getRobotOfflineAvailability(state.progress), core = state.progress.party.find(c => c.coreId === ui.coreId);
  const coreName = (id: RobotCoreId) => "コア" + id.slice(-1).toUpperCase();
  if (!core) {
    root.append(node("h2", "機体カスタマイズ"), node("p", `共有EXP ${state.progress.exp}`, "custom-exp"));
    const list = node("div", undefined, "custom-party"); list.setAttribute("aria-label", "操作機3コア");
    for (const c of state.progress.party) {
      const plan = getRobotLoadoutPlan(c, available), card = button(`${coreName(c.coreId)} · ${getRobotFrameName(c.frameId)} · Lv${c.coreLevel}`, () => { ui.coreId = c.coreId; ui.expandedFrameId = null; ui.scrollTop = 0; options.refresh(); });
      card.classList.add("core-card"); card.append(node("span", `CAP ${plan.capUsed}/${plan.capLimit}`), node("small", [plan.basic.weapon1, plan.basic.weapon2].map(p => `${getRobotOfflineEquipmentName(p.id)} Lv${p.level}`).join(" / ")));
      list.append(card);
    }
    root.append(list); return root;
  }
  const plan = getRobotLoadoutPlan(core, available);
  root.append(node("p", `${coreName(core.coreId)} Lv${core.coreLevel} · CAP ${plan.capUsed}/${plan.capLimit} · 共有EXP ${state.progress.exp}`, "custom-context"));
  root.append(button("3コア一覧へ", () => { ui.coreId = null; ui.expandedFrameId = null; ui.scrollTop = 0; options.refresh(); }));
  const summary = node("section", undefined, "custom-core-summary"); summary.setAttribute("aria-label", "コアの現在性能");
  summary.append(node("h2", `${coreName(core.coreId)} · Lv${core.coreLevel}`), node("p", `${getRobotFrameName(core.frameId)} · CAP ${plan.capUsed}/${plan.capLimit}`), node("p", `共有EXP ${state.progress.exp}`, "custom-exp"));
  const stats = node("dl", undefined, "custom-stats");
  for (const stat of Object.keys(ROBOT_STAT_NAMES) as RobotStat[]) { const pair = node("div"); pair.append(node("dt", ROBOT_STAT_NAMES[stat]), node("dd", String(plan.baseStatsBeforeAddons[stat] ?? "未確定"))); stats.append(pair); }
  summary.append(stats);
  if (core.addons.length) summary.append(node("small", "追加パーツ補正は未接続のため、上記は基本装備までの値です。"));
  const upgrade = previewRobotCustomization(state.progress, { kind: "core-upgrade", coreId: core.coreId });
  const growth = node("section", undefined, "custom-growth"); growth.setAttribute("aria-label", "コア強化");
  if (core.coreLevel < 41) {
    growth.append(node("strong", `Lv${core.coreLevel} → Lv${core.coreLevel + 1} · 必要EXP ${upgrade.expCost}`));
    const changes = (Object.keys(ROBOT_STAT_NAMES) as RobotStat[]).flatMap(stat => {
      const a = upgrade.statsBefore[stat], b = upgrade.statsAfter[stat]; return a !== null && b !== null && a !== b ? [`${ROBOT_STAT_NAMES[stat]} ${a}→${b}`] : [];
    });
    growth.append(node("small", [...changes, `CAP ${upgrade.capBefore}→${upgrade.capAfter}`].join(" / ")));
    growth.append(button("コアを強化する", () => options.apply({ kind: "core-upgrade", coreId: core.coreId }, state.revision), !upgrade.canApply));
  }
  if (upgrade.reasons.length) growth.append(node("small", upgrade.reasons.join(" ")));
  summary.append(growth); root.append(summary);
  const equipped = node("section", undefined, "custom-equipped"); equipped.setAttribute("aria-label", "現在の装備"); equipped.append(node("h3", "現在の装備"));
  const names = { engine: "エンジン", weapon1: "武器①", weapon2: "武器②", armor: "装甲", control: "制御", special: "特殊" } as const;
  for (const slot of Object.keys(names) as (keyof typeof names)[]) { const p = core.basic[slot]; equipped.append(node("p", `${names[slot]}：${getRobotOfflineEquipmentName(p.partId)} Lv${p.level}`)); }
  equipped.append(node("p", "追加：" + (core.addons.length ? core.addons.map(a => getRobotOfflineEquipmentName(a.partId)).join("、") : "なし")));
  root.append(equipped, node("h3", "フレームを選択"));
  const frames = node("div", undefined, "custom-frame-list"); frames.setAttribute("aria-label", "フレーム一覧");
  for (const f of frameData.frames) {
    const preview = previewRobotCustomization(state.progress, { kind: "frame", coreId: core.coreId, frameId: f.id });
    const section = node("section"), selected = core.frameId === f.id;
    const b = button(`${getRobotFrameName(f.id)}${selected ? " · 装備中" : !available.frames.includes(f.id) ? " · 未解放" : ""}`, () => { ui.expandedFrameId = ui.expandedFrameId === f.id ? null : f.id; options.refresh(); });
    b.setAttribute("aria-expanded", String(ui.expandedFrameId === f.id)); b.setAttribute("aria-controls", "frame-detail-" + f.id); section.append(b);
    if (ui.expandedFrameId === f.id) {
      const detail = node("div", undefined, "custom-part-detail"); detail.id = "frame-detail-" + f.id;
      detail.append(comparisonTable(getRobotFrameComparison(f.id, core.frameId, core.coreLevel)));
      if (preview.reasons.length) detail.append(node("p", preview.reasons.join(" "), "custom-reason"));
      detail.append(button("装備する", () => options.apply({ kind: "frame", coreId: core.coreId, frameId: f.id }, state.revision), !preview.canApply)); section.append(detail);
    }
    frames.append(section);
  }
  root.append(frames, node("p", "基本パーツ・追加パーツの交換と強化は次の実装段階です。", "muted"));
  return root;

  function comparisonTable(rows: readonly RobotComparisonRow[]) {
    const table = node("table", undefined, "custom-comparison"); table.setAttribute("aria-label", "フレーム性能と現在装備との差分");
    const head = node("thead"), header = node("tr"); for (const label of ["項目", "性能", "現在装備との差"]) { const th = node("th", label); th.scope = "col"; header.append(th); } head.append(header); table.append(head);
    const body = node("tbody");
    for (const r of rows) { const tr = node("tr"), label = node("th", r.label); label.scope = "row"; tr.append(label, node("td", r.value), node("td", r.difference, "difference-" + r.tone)); body.append(tr); }
    table.append(body); return table;
  }
}
