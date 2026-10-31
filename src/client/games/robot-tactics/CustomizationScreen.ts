import basicData from "../../../../docs/design/robot-tactics/basic-parts.json";
import { getRobotBasicPartComparison } from "../../../games/robot-tactics/partComparison";
import { getRobotLoadoutPlan, type RobotCoreId, type RobotEquipmentSlot } from "../../../games/robot-tactics/equipment";
import { getRobotFrameComparison, getRobotFrameName, previewRobotCustomization, ROBOT_STAT_NAMES, type RobotComparisonRow, type RobotCustomizationChange } from "../../../games/robot-tactics/customization";
import { getRobotOfflineAvailability, getRobotOfflineEquipmentName } from "../../../games/robot-tactics/offlineProgress";
import type { RobotOfflineSave } from "../../../games/robot-tactics/offlineSession";
import type { RobotStat } from "../../../games/robot-tactics/growth";
import frameData from "../../../../docs/design/robot-tactics/frames.json";

export interface RobotCustomizationUiState {
  coreId: RobotCoreId | null;
  expandedFrameId: string | null;
  category: "frame" | RobotEquipmentSlot | "addons";
  expandedPartId: string | null;
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
      const plan = getRobotLoadoutPlan(c, available), card = button(`${coreName(c.coreId)} · ${getRobotFrameName(c.frameId)} · Lv${c.coreLevel}`, () => { ui.coreId = c.coreId; ui.expandedFrameId = null; ui.category = "frame"; ui.expandedPartId = null; ui.scrollTop = 0; options.refresh(); });
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
  root.append(equipped);
  const categories = node("nav", undefined, "performance-categories"); categories.setAttribute("aria-label", "装備カテゴリー");
  for (const [id, label] of [["frame", "フレーム"], ["weapon1", "武器①"], ["weapon2", "武器②"], ["engine", "エンジン"], ["armor", "装甲"], ["control", "制御"], ["special", "特殊"], ["addons", "追加パーツ"]] as const) {
    const b = button(label, () => { ui.category = id; ui.expandedFrameId = null; ui.expandedPartId = null; options.refresh(); });
    b.setAttribute("aria-pressed", String(ui.category === id)); categories.append(b);
  }
  root.append(categories);
  if (ui.category === "frame") {
  root.append(node("h3", "フレームを選択"));
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
  root.append(frames);
  } else if (ui.category === "addons") {
    root.append(node("h3", "追加パーツ"), node("p", "追加パーツの装備操作は次の実装段階です。", "muted"));
    for (const id of available.addons) root.append(node("p", getRobotOfflineEquipmentName(id)));
  } else {
    const slot = ui.category, list = node("div", undefined, "custom-frame-list"); list.setAttribute("aria-label", names[slot] + "のパーツ一覧");
    root.append(node("h3", names[slot] + "を選択"), node("p", "パーツIDごとの共有Lvです。強化は装備中の全コアへ反映し、外した後もLvを保持します。", "muted"));
    for (const part of basicData.parts.filter(p => p.slot === (slot === "weapon1" || slot === "weapon2" ? "weapon" : slot))) {
      const section = node("section"), owned = available.basicParts.includes(part.id), level = state.progress.partLevels[part.id] ?? 1, selected = core.basic[slot].partId === part.id;
      const b = button(`${part.name} · 共有Lv${level}${selected ? " · 装備中" : owned ? "" : " · 未解放"}`, () => { ui.expandedPartId = ui.expandedPartId === part.id ? null : part.id; options.refresh(); });
      b.setAttribute("aria-expanded", String(ui.expandedPartId === part.id)); b.setAttribute("aria-controls", "part-detail-" + part.id); section.append(b);
      if (ui.expandedPartId === part.id) {
        const detail = node("div", undefined, "custom-part-detail"); detail.id = "part-detail-" + part.id;
        detail.append(comparisonTable(getRobotBasicPartComparison({ partId: part.id, level }, core.basic[slot]), "パーツ性能と現在装備との差分"));
        const equipChange = { kind: "part-equip" as const, coreId: core.coreId, slot, partId: part.id }, equip = previewRobotCustomization(state.progress, equipChange);
        detail.append(button("装備する", () => options.apply(equipChange, state.revision), !equip.canApply));
        if (equip.reasons.length) detail.append(node("small", equip.reasons.join(" ")));
        const growth = node("section", undefined, "custom-growth"); growth.setAttribute("aria-label", "パーツ強化");
        const upgradeChange = { kind: "part-upgrade" as const, coreId: core.coreId, partId: part.id }, upgrade = previewRobotCustomization(state.progress, upgradeChange);
        const users = state.progress.party.filter(c => Object.values(c.basic).some(p => p.partId === part.id)).map(c => coreName(c.coreId));
        growth.append(node("small", users.length ? "装備中：" + users.join("・") : "このパーツは未装備です。"));
        if (owned && level < 10) {
          growth.append(node("strong", `共有Lv${level} → Lv${level + 1} · 必要EXP ${upgrade.expCost}`));
          const next = getRobotBasicPartComparison({ partId: part.id, level: level + 1 }, { partId: part.id, level });
          const quote = node("div", undefined, "custom-next-part"); quote.append(node("small", "次Lvのパーツ性能"));
          for (const row of next.filter(r => r.difference !== "—")) quote.append(node("small", `${row.label} ${row.value} / ${row.difference}`, "difference-" + row.tone));
          growth.append(quote);
        }
        growth.append(button("パーツを強化する", () => options.apply(upgradeChange, state.revision), !upgrade.canApply));
        if (upgrade.reasons.length) growth.append(node("small", upgrade.reasons.join(" ")));
        detail.append(growth); section.append(detail);
      }
      list.append(section);
    }
    root.append(list);
  }
  return root;

  function comparisonTable(rows: readonly RobotComparisonRow[], name = "フレーム性能と現在装備との差分") {
    const table = node("table", undefined, "custom-comparison"); table.setAttribute("aria-label", name);
    const head = node("thead"), header = node("tr"); for (const label of ["項目", "性能", "現在装備との差"]) { const th = node("th", label); th.scope = "col"; header.append(th); } head.append(header); table.append(head);
    const body = node("tbody");
    for (const r of rows) { const tr = node("tr"), label = node("th", r.label); label.scope = "row"; tr.append(label, node("td", r.value), node("td", r.difference, "difference-" + r.tone)); body.append(tr); }
    table.append(body); return table;
  }
}
